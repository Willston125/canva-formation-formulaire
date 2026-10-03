/* Recevoir une inscription : le formulaire public, ouvert à tous.
 *
 * Reprend les garde-fous du script Google (recevoirInscription,
 * inscriptionIncomplete, inscriptionInventee, assainirInscription) et ferme ce
 * que l'audit du 2 octobre 2026 y a trouvé :
 * - S1 : le statut ne vient jamais de la requête (la base le met « En attente ») ;
 * - S6 : une liste ou un objet glissé dans un champ est refusé ;
 * - S8 : titre, date, montant, devise et indicatif sont RECALCULÉS depuis le
 *   catalogue, plus recopiés depuis le navigateur ;
 * - S4 : une même connexion est bornée, et un même téléphone n'est enregistré
 *   qu'une fois en 24 h pour la même formation et la même session. Un
 *   candidat qui renvoie après un délai dépassé reçoit « reçu », sans doublon.
 *
 * Les comptages et l'écriture se font dans UNE transaction, sous un verrou :
 * deux envois simultanés ne peuvent pas passer tous deux sous un plafond.
 *
 * Rend { resultat, ligne, alerter } : `resultat` part tel quel au navigateur
 * (même forme que le script Google : { ok } ou { ok: false, erreur }), `ligne`
 * est l'inscription enregistrée, `alerter` dit si l'alerte e-mail est due. */
'use strict';

const crypto = require('crypto');
const { lireCatalogue } = require('./catalogue');
const { tarifInscription, trouverPays, sessionOuverteAu, dateEnFrancais } = require('./prix');
const { EMAIL_PRO } = require('./courriel');
const { enTransaction } = require('./transaction');

/* Même plafond que le script Google : très au-dessus d'une vraie journée,
   très en dessous de ce qu'une boucle produit. */
const INSCRIPTIONS_PAR_JOUR = 150;
/* Le quota d'envoi gratuit de Resend est de 100 par jour, sauvegarde comprise. */
const ALERTES_PAR_JOUR = 60;
/* Aux Comores, beaucoup de téléphones sortent sur Internet par la MÊME adresse
   (celle de l'opérateur) : la limite par connexion doit rester large. */
const PAR_CONNEXION_PAR_HEURE = 20;
const LONGUEUR_CHAMP = 300;
const LONGUEUR_CHAMP_LIBRE = 2000;
const CHAMPS_LIBRES = ['motivation', 'objectifs', 'professionDetail'];

const refus = erreur => ({ resultat: { ok: false, erreur }, ligne: null, alerter: false });

/** Toute valeur devient du texte, tronqué. Une liste ou un objet : null (refus). */
function nettoyer(charge) {
  if (!charge || typeof charge !== 'object' || Array.isArray(charge)) return null;
  const propre = {};
  for (const [cle, v] of Object.entries(charge)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') return null;
    const max = CHAMPS_LIBRES.includes(cle) ? LONGUEUR_CHAMP_LIBRE : LONGUEUR_CHAMP;
    propre[cle] = String(v).trim().slice(0, max);
  }
  return propre;
}

/** L'adresse du visiteur n'est jamais gardée : seulement une empreinte salée. */
const empreinte = (ip, sel) => crypto.createHmac('sha256', String(sel)).update(String(ip || '')).digest('hex').slice(0, 32);

async function recevoirInscription(db, chargeBrute, { ip = '', sel = 'local' } = {}) {
  const d = nettoyer(chargeBrute);
  if (!d) return refus('Un champ du formulaire est illisible.');

  // --- 1. Le minimum, comme le script Google
  const chiffres = String(d.telephone || '').replace(/\D/g, '');
  if (!((d.nom || '') + (d.prenom || ''))) return refus('Le nom est obligatoire.');
  if (chiffres.length < 6) return refus('Un numéro de téléphone est obligatoire.');
  if (!d.formationId) return refus('La formation est obligatoire.');

  // --- 2. Ce qui existe vraiment, et ce qui est ouvert
  const catalogue = await lireCatalogue(db);
  const formation = catalogue.formations.find(f => f.formId === d.formationId);
  if (!formation || formation.active === false) return refus('Cette formation n’existe pas.');
  const pays = trouverPays(catalogue, d.paysCode);
  if (!pays) return refus('Ce pays n’est pas desservi pour le moment.');

  let session = null;
  if (d.sessionId) {
    session = catalogue.sessions.find(s => s.id === d.sessionId);
    if (!session) return refus('Cette session n’existe pas.');
    if (session.formId !== formation.formId) return refus('Cette session n’appartient pas à cette formation.');
    if (!session.registrationOpen) return refus('Les inscriptions sont fermées pour cette session.');
    if (!sessionOuverteAu(session, pays.code)) return refus('Cette session n’est pas proposée dans votre pays.');
  } else if (!(formation.registrationOpen && formation.allowRegistrationWithoutSession)) {
    // La règle même du site (site-common.js) : sans session, seulement si la formation l'accepte
    return refus('Choisissez une session pour vous inscrire.');
  }

  const age = Number(d.age);
  const ligne = {
    date_inscription: d.dateInscription || null,
    form_id: formation.formId,
    formation_title: formation.title,
    session_id: session ? session.id : null,
    session_label: session ? dateEnFrancais(session.startDate) : null,
    session_start_date: session ? session.startDate : null,
    nom: d.nom || null,
    prenom: d.prenom || null,
    telephone: d.telephone,
    telephone_international: (pays.indicatif || '') + chiffres,
    email: d.email || null,
    age: Number.isInteger(age) && age >= 0 && age <= 120 ? age : null,
    profession: d.profession || null,
    profession_detail: d.professionDetail || null,
    niveau: d.niveau || d.niveauCanva || null,
    objectifs: d.objectifs || null,
    motivation: d.motivation || null,
    mode_paiement: d.modePaiement || null,
    tel_paiement: d.telPaiement || null,
    montant: tarifInscription(catalogue, formation, session, pays.code),
    devise: pays.devise || null,
    pays: pays.nom,
    pays_code: pays.code,
    source: d.source || null,
    page_url: d.pageUrl || null,
    empreinte_ip: empreinte(ip, sel),
    charge: JSON.stringify(d)
  };

  // --- 3. Le volume : comptages et écriture sous un même verrou
  return enTransaction(db, async tx => {
    await tx.query("select pg_advisory_xact_lock(hashtext('impactali-inscriptions'))");
    const nombre = async (texte, valeurs) => (await tx.query(texte, valeurs)).rows[0].n;

    const doublon = await nombre(
      `select count(*)::int as n from inscriptions
        where telephone_international = $1 and form_id = $2 and coalesce(session_id, '') = coalesce($3, '')
          and statut <> 'Annulé' and recue_le > now() - interval '24 hours'`,
      [ligne.telephone_international, ligne.form_id, ligne.session_id]);
    if (doublon) return { resultat: { ok: true }, ligne: null, alerter: false };

    const parConnexion = await nombre(
      `select count(*)::int as n from inscriptions where empreinte_ip = $1 and recue_le > now() - interval '1 hour'`,
      [ligne.empreinte_ip]);
    if (parConnexion >= PAR_CONNEXION_PAR_HEURE) {
      return refus('Trop d’envois depuis cette connexion. Réessayez dans une heure, ou écrivez-nous sur WhatsApp.');
    }

    const duJour = await nombre(
      `select count(*)::int as n from inscriptions
        where recue_le >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`);
    if (duJour >= INSCRIPTIONS_PAR_JOUR) {
      return refus('Nous recevons un nombre inhabituel d’inscriptions aujourd’hui et ne pouvons pas '
        + 'enregistrer la vôtre pour l’instant. Écrivez-nous à ' + EMAIL_PRO + ' : votre place sera notée à la main.');
    }

    const colonnes = Object.keys(ligne);
    const { rows } = await tx.query(
      `insert into inscriptions (${colonnes.join(', ')})
       values (${colonnes.map((c, i) => (c === 'charge' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ')})
       returning *`,
      colonnes.map(c => ligne[c]));
    return { resultat: { ok: true }, ligne: rows[0], alerter: duJour + 1 <= ALERTES_PAR_JOUR };
  });
}

module.exports = {
  recevoirInscription, nettoyer, empreinte,
  INSCRIPTIONS_PAR_JOUR, ALERTES_PAR_JOUR, PAR_CONNEXION_PAR_HEURE
};

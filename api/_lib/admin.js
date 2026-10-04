/* Le tableau de bord : qui a le droit, et ce qu'il peut faire.
 *
 * QUI. Le script Google comparait un mot de passe partagé, essayable sans
 * limite (audit S3), et le tableau de bord le gardait en clair dans le
 * navigateur (audit T1). Ici, le propriétaire se connecte avec SON compte
 * Supabase (e-mail et mot de passe, essais limités par Supabase) ; le
 * navigateur ne garde qu'une session qui expire. Chaque commande présente ce
 * jeton, que l'API fait vérifier par Supabase, puis compare l'e-mail à
 * ADMIN_EMAIL. Sans ADMIN_EMAIL réglée dans Vercel, PERSONNE n'entre : la porte
 * reste fermée par défaut, même si la création de comptes était rouverte.
 *
 * QUOI. Les commandes répondent comme celles du script Google (commandeAdmin),
 * pour que le tableau de bord change le moins possible : ici la connexion, les
 * inscriptions et leur statut ; les enregistrements du catalogue sont dans
 * ecritures.js. */
'use strict';

const { lireCatalogue } = require('./catalogue');
const { ECRITURES } = require('./ecritures');
const { PHOTOS } = require('./photos');
const { noter } = require('./journal');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://isxkyikakrssekrxudjw.supabase.co';
const STATUTS = ['En attente', 'Confirmé', 'Payé', 'Annulé'];
const FORMAT_JETON = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const FORMAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'utilisateur d'un jeton, selon Supabase Auth. null si le jeton ne vaut rien. */
async function utilisateurSupabase(jeton, cle) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: cle, Authorization: 'Bearer ' + jeton },
    signal: AbortSignal.timeout(5000)
  });
  return r.ok ? r.json() : null;
}

/* Un jeton vérifié reste bon une minute dans cette instance : sans cela, chaque
   clic du tableau de bord ferait un aller-retour de plus chez Supabase. Une
   minute, c'est aussi le plus long qu'un jeton révoqué puisse encore servir. */
const verifies = new Map();

/** L'administrateur derrière ce jeton, ou null. */
async function administrateur(jeton, {
  cle = process.env.SUPABASE_PUBLISHABLE_KEY,
  admin = process.env.ADMIN_EMAIL,
  lireUtilisateur = utilisateurSupabase,
  maintenant = Date.now
} = {}) {
  if (!cle || !admin) return null;                       // non configuré : porte fermée
  if (!jeton || !FORMAT_JETON.test(jeton)) return null;  // inutile de déranger Supabase
  const retenu = verifies.get(jeton);
  if (retenu && retenu.jusqua > maintenant()) return retenu.email;
  const u = await lireUtilisateur(jeton, cle).catch(() => null);
  const email = String((u && u.email) || '').trim().toLowerCase();
  if (!email || email !== String(admin).trim().toLowerCase()) return null;
  verifies.set(jeton, { email, jusqua: maintenant() + 60000 });
  if (verifies.size > 50) verifies.delete(verifies.keys().next().value);
  return email;
}

/* Les inscriptions sous les noms de colonnes de la feuille Google : c'est ce
   que lit le tableau de bord (rendreInscriptions, exporterCsv). `ligne`
   désigne désormais l'inscription par son identifiant, plus par sa position :
   un tri fait entre l'affichage et le clic ne change plus le mauvais candidat
   (audit S8). */
const COLONNES_FEUILLE = [
  ['Horodatage réception', 'recue_le'], ['dateInscription', 'date_inscription'],
  ['formationId', 'form_id'], ['formationTitle', 'formation_title'], ['sessionId', 'session_id'],
  ['sessionLabel', 'session_label'], ['sessionStartDate', 'session_start_date'], ['nom', 'nom'],
  ['prenom', 'prenom'], ['telephone', 'telephone'], ['telephoneInternational', 'telephone_international'],
  ['email', 'email'], ['age', 'age'], ['profession', 'profession'], ['professionDetail', 'profession_detail'],
  ['niveau', 'niveau'], ['objectifs', 'objectifs'], ['motivation', 'motivation'],
  ['modePaiement', 'mode_paiement'], ['telPaiement', 'tel_paiement'], ['montant', 'montant'],
  ['currency', 'devise'], ['pays', 'pays'], ['paysCode', 'pays_code'], ['statut', 'statut'],
  ['source', 'source'], ['pageUrl', 'page_url']
];

async function lireInscriptions(db, formationId) {
  const { rows } = await db.query(
    `select * from inscriptions where ($1::text is null or form_id = $1)
      order by recue_le desc limit 500`, [formationId || null]);
  return rows.map(r => {
    const o = { ligne: r.id };
    for (const [cle, col] of COLONNES_FEUILLE) {
      const v = r[col];
      o[cle] = v instanceof Date ? v.toISOString() : (v === null || v === undefined ? '' : v);
    }
    return o;
  });
}

async function changerStatut(db, id, statut, qui) {
  if (!FORMAT_ID.test(String(id || ''))) throw new Error('Inscription introuvable.');
  if (STATUTS.indexOf(statut) < 0) throw new Error('Statut inconnu : ' + statut + '.');
  const { rows } = await db.query(
    'update inscriptions set statut = $2 where id = $1 returning id, statut', [id, statut]);
  if (!rows.length) throw new Error('Inscription introuvable.');
  await noter(db, qui, 'admin.inscription.statut', id, { statut });
  return { ok: true };
}

const COMMANDES = Object.assign({
  'admin.login': async db => ({ ok: true, version: 'supabase', catalogue: await lireCatalogue(db) }),
  'admin.catalogue': async db => ({ ok: true, catalogue: await lireCatalogue(db) }),
  'admin.inscriptions': async (db, d) => ({ ok: true, inscriptions: await lireInscriptions(db, d.formationId) }),
  'admin.inscription.statut': async (db, d, qui) => changerStatut(db, d.ligne, d.statut, qui)
}, ECRITURES, PHOTOS);

/* Les classes 22 (valeur mal formée) et 23 (règle d'intégrité) de Postgres :
   une saisie que l'API n'a pas su refuser avant la base. L'administrateur doit
   savoir que RIEN n'a été écrit, et quelle règle a dit non ; le nom d'une règle
   du schéma n'apprend rien qu'un dépôt public ne dise déjà. */
const REFUS_DE_LA_BASE = /^2[23]/;
function refusDeLaBase(e) {
  return 'La base a refusé cet enregistrement (règle « ' + (e.constraint || e.code) + ' ») : rien n’a été modifié.';
}

/**
 * Exécute une commande du tableau de bord.
 * @returns {{ statut: number, corps: object }} — 401 si la session ne vaut rien.
 */
async function executer(db, charge, jeton, options) {
  const qui = await administrateur(jeton, options);
  if (!qui) {
    return { statut: 401, corps: { ok: false, erreur: 'Connexion requise.', authentification: false } };
  }
  /* Seules les commandes de la table : « constructor » ou « __proto__ » en
     sont des propriétés héritées, et en feraient une commande. */
  const commande = Object.prototype.hasOwnProperty.call(COMMANDES, charge.action) ? COMMANDES[charge.action] : null;
  if (!commande) {
    return { statut: 200, corps: { ok: false, erreur: 'Cette commande n’est pas encore disponible sur la nouvelle base.' } };
  }
  try {
    return { statut: 200, corps: await commande(db, charge, qui, options || {}) };
  } catch (e) {
    /* Les erreurs de règle (statut inconnu, inscription introuvable) sont pour
       l'administrateur, et dites telles quelles. Une panne de la base, elle,
       remonte au gestionnaire, qui répond un message générique (audit S9). */
    if (e && e.code && REFUS_DE_LA_BASE.test(String(e.code))) {
      return { statut: 200, corps: { ok: false, erreur: refusDeLaBase(e) } };
    }
    /* Table absente : une migration du dépôt (supabase/migrations) n'a pas
       encore été collée dans l'éditeur SQL de Supabase. Le dire, c'est donner
       la solution ; « service indisponible » ne la donnait pas. */
    if (e && e.code === '42P01') {
      return { statut: 200, corps: { ok: false, erreur: 'Une table manque dans la base : un fichier de '
        + 'supabase/migrations reste à coller dans l’éditeur SQL de Supabase. Rien n’a été modifié.' } };
    }
    if (e && e.code) throw e;
    return { statut: 200, corps: { ok: false, erreur: String((e && e.message) || 'Erreur inconnue.') } };
  }
}

module.exports = { executer, administrateur, lireInscriptions, changerStatut, STATUTS, SUPABASE_URL };

/* Le tableau de bord sur la nouvelle base : qui entre, et ce qu'il obtient.
 *
 * Supabase Auth est remplacé par un faux qui connaît trois jetons : celui de
 * l'administrateur, celui d'un autre compte (une création de comptes rouverte
 * par erreur, par exemple), et un jeton expiré. On éprouve la porte d'abord,
 * puis les commandes, en passant par le vrai gestionnaire HTTP (api/index.js). */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { administrateur } = require('../../../api/_lib/admin');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

// Trois jetons au format d'un vrai (trois parties), que le faux Supabase reconnaît
const JETON_ADMIN = 'aaa.admin.zzz';
const JETON_AUTRE = 'aaa.autre.zzz';
const JETON_EXPIRE = 'aaa.expire.zzz';
let appelsSupabase = 0;
const fauxSupabase = async jeton => {
  appelsSupabase++;
  if (jeton === JETON_ADMIN) return { email: 'Infos@Impactali.site' };
  if (jeton === JETON_AUTRE) return { email: 'quelquun@exemple.test' };
  return null;
};
const REGLAGES = { cle: 'sb_publishable_essai', admin: 'infos@impactali.site', lireUtilisateur: fauxSupabase };

async function commande(api, charge, jeton) {
  const res = { statusCode: 200, corps: '', setHeader() {}, end(c) { this.corps = c; } };
  const headers = jeton ? { authorization: 'Bearer ' + jeton } : {};
  await api({ method: 'POST', url: '/api', body: JSON.stringify(charge), headers }, res);
  return { statut: res.statusCode, json: JSON.parse(res.corps || '{}') };
}

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  await db.exec(`insert into inscriptions (form_id, nom, prenom, telephone, telephone_international, statut, session_id, recue_le)
    values ('canva-pro', 'SAID', 'Awa', '3212345', '+2693212345', 'En attente', 'canva-pro-2026-11', now() - interval '1 hour'),
           ('marketing-digital', 'ALI', 'Bilal', '3299999', '+2693299999', 'En attente', 'marketing-digital-2026-11', now())`);
  const api = creerGestionnaire(() => db, { admin: REGLAGES });

  // ------------------------------------------------------ 1. La porte ---

  const sans = await commande(api, { action: 'admin.login' });
  verifier('sans session : 401', sans.statut, 401);
  verifier('et le tableau de bord sait qu’il faut se connecter', sans.json.authentification, false);
  verifier('un autre compte Supabase est refusé', (await commande(api, { action: 'admin.login' }, JETON_AUTRE)).statut, 401);
  verifier('un jeton expiré est refusé', (await commande(api, { action: 'admin.login' }, JETON_EXPIRE)).statut, 401);
  const avant = appelsSupabase;
  verifier('un jeton mal formé est refusé…', (await commande(api, { action: 'admin.login' }, 'n-importe-quoi')).statut, 401);
  verifier('… sans même déranger Supabase', appelsSupabase, avant);
  /* L'ancien chemin : un mot de passe dans le corps. Il n'ouvre plus rien. */
  verifier('l’ancien mot de passe dans le corps n’ouvre rien',
    (await commande(api, { action: 'admin.login', motDePasse: 'CHANGEZ-MOI-avant-de-deployer' })).statut, 401);

  /* FERMÉE PAR DÉFAUT. Sans ADMIN_EMAIL réglée dans Vercel, personne n'entre. */
  verifier('sans ADMIN_EMAIL, même le bon compte est refusé',
    await administrateur(JETON_ADMIN, { cle: 'sb_publishable_essai', admin: '', lireUtilisateur: fauxSupabase }), null);
  verifier('sans clé publique non plus',
    await administrateur(JETON_ADMIN, { cle: '', admin: 'infos@impactali.site', lireUtilisateur: fauxSupabase }), null);
  /* Contre-contrôle : le bon compte, avec la casse de l'e-mail différente, entre. */
  const entree = await commande(api, { action: 'admin.login' }, JETON_ADMIN);
  verifier('l’administrateur entre', [entree.statut, entree.json.ok], [200, true]);
  verifier('et reçoit le catalogue', entree.json.catalogue && entree.json.catalogue.formations.length, 5);

  /* Un jeton vérifié resservi aussitôt ne repasse pas par Supabase. */
  const apresEntree = appelsSupabase;
  await commande(api, { action: 'admin.catalogue' }, JETON_ADMIN);
  verifier('un jeton déjà vérifié n’est pas revérifié dans la minute', appelsSupabase, apresEntree);

  // ------------------------------------------------- 2. Les inscriptions ---

  const liste = (await commande(api, { action: 'admin.inscriptions' }, JETON_ADMIN)).json.inscriptions;
  verifier('les inscriptions arrivent, les plus récentes d’abord', liste.map(i => i.prenom), ['Bilal', 'Awa']);
  verifier('sous les noms de colonnes de la feuille',
    ['Horodatage réception', 'formationId', 'telephoneInternational', 'statut', 'currency'].every(k => k in liste[0]), true);
  verifier('avec un identifiant stable plutôt qu’un numéro de ligne', /^[0-9a-f-]{36}$/.test(liste[0].ligne), true);
  verifier('le filtre par formation fonctionne',
    (await commande(api, { action: 'admin.inscriptions', formationId: 'canva-pro' }, JETON_ADMIN)).json.inscriptions.length, 1);

  // ---------------------------------------------- 3. Le changement de statut ---

  const awa = liste.find(i => i.prenom === 'Awa');
  const change = await commande(api, { action: 'admin.inscription.statut', ligne: awa.ligne, statut: 'Confirmé' }, JETON_ADMIN);
  verifier('le statut change', change.json, { ok: true });
  const places = (await db.query(`select count(*)::int as n from inscriptions where statut = 'Confirmé'`)).rows[0].n;
  verifier('et l’inscription confirmée occupe une place', places, 1);
  const trace = (await db.query('select qui, action, details from journal')).rows;
  verifier('le changement est noté au journal, avec son auteur',
    trace.map(t => [t.qui, t.action, t.details.statut]), [['infos@impactali.site', 'admin.inscription.statut', 'Confirmé']]);

  verifier('un statut inventé est refusé',
    (await commande(api, { action: 'admin.inscription.statut', ligne: awa.ligne, statut: 'Remboursé' }, JETON_ADMIN)).json.ok, false);
  verifier('une inscription inconnue est refusée',
    (await commande(api, { action: 'admin.inscription.statut', ligne: '00000000-0000-0000-0000-000000000000', statut: 'Payé' }, JETON_ADMIN)).json.erreur,
    'Inscription introuvable.');
  /* L'ancien numéro de ligne ne désigne plus personne. */
  verifier('un numéro de ligne n’est plus accepté',
    (await commande(api, { action: 'admin.inscription.statut', ligne: 2, statut: 'Payé' }, JETON_ADMIN)).json.erreur,
    'Inscription introuvable.');
  verifier('sans session, le statut ne change pas',
    (await commande(api, { action: 'admin.inscription.statut', ligne: awa.ligne, statut: 'Annulé' })).statut, 401);
  verifier('et il est resté « Confirmé »',
    (await db.query('select statut from inscriptions where id = $1', [awa.ligne])).rows[0].statut, 'Confirmé');

  // ------------------------------------- 4. Ce qui n'est pas encore là ---

  verifier('une commande pas encore portée le dit',
    (await commande(api, { action: 'admin.image.upload', donnees: {} }, JETON_ADMIN)).json.erreur,
    'Cette commande n’est pas encore disponible sur la nouvelle base.');

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

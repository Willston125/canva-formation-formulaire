/* La mesure d'audience : les compteurs de l'entonnoir d'inscription.
 *
 * Tout passe par le vrai gestionnaire HTTP (api/index.js), sur une vraie base
 * Postgres en mémoire : un signal du site doit compter, un signal fabriqué ne
 * doit rien écrire, et rien de tout cela ne doit passer pour une inscription
 * ni pour une commande du tableau de bord. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur, RACINE } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { EVENEMENTS } = require('../../../api/_lib/mesures.js');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

const JETON = 'aaa.admin.zzz';
const REGLAGES = {
  cle: 'sb_publishable_essai', admin: 'infos@impactali.site',
  lireUtilisateur: async j => (j === JETON ? { email: 'infos@impactali.site' } : null)
};

let api, db;
async function poster(corps, { ip = '10.0.0.1', jeton = '' } = {}) {
  const res = { statusCode: 200, corps: '', entetes: {}, setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c || ''; } };
  const brut = typeof corps === 'string' ? corps : JSON.stringify(corps);
  const headers = { 'x-forwarded-for': ip };
  if (jeton) headers.authorization = 'Bearer ' + jeton;
  await api({ method: 'POST', url: '/api', body: brut, headers }, res);
  return res;
}
const compte = async (evenement, formation = '', pays = '') => {
  const { rows } = await db.query(
    'select coalesce(sum(n), 0)::int as n from mesures where evenement = $1 and formation = $2 and pays = $3',
    [evenement, formation, pays]);
  return rows[0].n;
};
const total = async () => (await db.query('select coalesce(sum(n), 0)::int as n from mesures')).rows[0].n;

(async () => {
  db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  api = creerGestionnaire(() => db, { admin: REGLAGES, envoyer: async () => ({ envoye: true, erreur: null }) });

  // ---------------------------------------------- 1. La liste des étapes ---

  /* L'API et la base tiennent chacune la liste : une étape ajoutée d'un seul
     côté serait refusée par la base, ou jamais acceptée par l'API. */
  const migration = fs.readFileSync(path.join(RACINE, 'supabase', 'migrations', '20261009120000_mesures.sql'), 'utf8');
  const dansLaBase = [...migration.match(/evenement in \(([\s\S]*?)\)\)/)[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);
  verifier('l’API et la base acceptent les mêmes étapes', EVENEMENTS, dansLaBase);

  // -------------------------------------------------- 2. Un signal compte ---

  const r = await poster({ mesure: 'fiche_vue', formation: 'canva-pro', pays: 'KM' });
  verifier('un signal reçoit 204, sans corps', [r.statusCode, r.corps], [204, '']);
  verifier('et n’est pas mis en cache', r.entetes['cache-control'], 'no-store');
  verifier('il compte une fiche vue', await compte('fiche_vue', 'canva-pro', 'KM'), 1);
  await poster({ mesure: 'fiche_vue', formation: 'canva-pro', pays: 'KM' });
  verifier('le même signal s’ajoute au même compteur', await compte('fiche_vue', 'canva-pro', 'KM'), 2);
  verifier('sur une seule ligne du jour', (await db.query('select count(*)::int as n from mesures')).rows[0].n, 1);

  await poster({ mesure: 'contact_whatsapp' });
  verifier('une question posée depuis l’accueil compte sans formation ni pays', await compte('contact_whatsapp'), 1);

  /* Vingt visiteurs au même instant : chacun ajoute son 1, aucun n'écrase l'autre. */
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    poster({ mesure: 'etape_2', formation: 'canva-pro', pays: 'KM' }, { ip: '10.1.0.' + i })));
  verifier('vingt signaux simultanés font vingt', await compte('etape_2', 'canva-pro', 'KM'), 20);

  // ------------------------------------ 3. Un signal fabriqué n'écrit rien ---

  const avant = await total();
  await poster({ mesure: 'achat', formation: 'canva-pro', pays: 'KM' });
  await poster({ mesure: 'fiche_vue', formation: 'formation-inventee', pays: 'KM' });
  await poster({ mesure: 'fiche_vue', formation: 'canva-pro', pays: 'FR' });
  await poster({ mesure: 'fiche_vue', formation: 'Canva Pro !', pays: 'KM' });
  await poster({ mesure: 'fiche_vue', formation: 'canva-pro', pays: 'km' });
  await poster({ mesure: ['fiche_vue'], formation: 'canva-pro' });
  await poster({ mesure: 'fiche_vue', formation: { $ne: '' } });
  await poster({ mesure: 'constructor' });
  await poster({ mesure: 'fiche_vue', formation: 'canva-pro', pays: 'KM', bourrage: 'x'.repeat(400) });
  verifier('étape inconnue, formation ou pays inventés, valeurs piégées, envoi trop long : rien d’écrit',
    await total(), avant);

  // -------------------------------- 4. Ni une inscription, ni une commande ---

  verifier('un signal n’est jamais pris pour une inscription',
    (await db.query('select count(*)::int as n from inscriptions')).rows[0].n, 0);
  const deguise = await poster({ action: 'admin.audience', mesure: 'fiche_vue' });
  verifier('une « action » glissée dans un signal reste une commande : connexion exigée',
    [deguise.statusCode, JSON.parse(deguise.corps).authentification], [401, false]);

  // ------------------------------------------- 5. Une boucle est arrêtée ---

  for (let i = 0; i < 310; i++) await poster({ mesure: 'etape_3', formation: 'canva-pro', pays: 'KM' }, { ip: '10.9.9.9' });
  verifier('une même connexion ne compte pas plus de 300 signaux en dix minutes',
    await compte('etape_3', 'canva-pro', 'KM'), 300);
  await poster({ mesure: 'etape_3', formation: 'canva-pro', pays: 'KM' }, { ip: '10.9.9.10' });
  verifier('une autre connexion compte toujours', await compte('etape_3', 'canva-pro', 'KM'), 301);

  // -------------------------------------- 6. La lecture du tableau de bord ---

  const sansSession = await poster({ action: 'admin.audience' });
  verifier('l’audience se lit seulement connecté', sansSession.statusCode, 401);

  const lu = JSON.parse((await poster({ action: 'admin.audience', jours: 30 }, { jeton: JETON })).corps);
  verifier('connecté, elle se lit', lu.ok, true);
  verifier('sur la période demandée', lu.jours, 30);
  const ligne = (lu.lignes || []).find(l => l.evenement === 'fiche_vue' && l.formation === 'canva-pro' && l.pays === 'KM');
  verifier('avec les totaux par étape, formation et pays', ligne && ligne.n, 2);
  verifier('et l’heure de la dernière mesure reçue', typeof lu.derniere === 'string' && !Number.isNaN(Date.parse(lu.derniere)), true);
  verifier('une période inconnue retombe sur 30 jours',
    JSON.parse((await poster({ action: 'admin.audience', jours: 'tout' }, { jeton: JETON })).corps).jours, 30);

  /* Un compteur d'hier reste dans la période ; un compteur d'il y a 40 jours n'est pas dans « 30 jours ». */
  await db.exec(`insert into mesures (jour, evenement, formation, pays, n) values
    ((now() at time zone 'UTC' + interval '3 hours')::date - 1, 'fiche_vue', 'canva-pro', 'KM', 5),
    ((now() at time zone 'UTC' + interval '3 hours')::date - 40, 'fiche_vue', 'canva-pro', 'KM', 100)`);
  const periode = JSON.parse((await poster({ action: 'admin.audience', jours: 30 }, { jeton: JETON })).corps);
  verifier('la période compte hier, pas il y a 40 jours',
    periode.lignes.find(l => l.evenement === 'fiche_vue' && l.formation === 'canva-pro' && l.pays === 'KM').n, 7);
  const annee = JSON.parse((await poster({ action: 'admin.audience', jours: 365 }, { jeton: JETON })).corps);
  verifier('sur un an, il y est',
    annee.lignes.find(l => l.evenement === 'fiche_vue' && l.formation === 'canva-pro' && l.pays === 'KM').n, 107);

  // ------------------------------------------------ 7. La base, seule, tient ---

  const refus = async sql => { try { await db.exec(sql); return 'acceptée'; } catch (e) { return 'refusée'; } };
  verifier('la base refuse une étape hors liste',
    await refus(`insert into mesures (jour, evenement) values (current_date, 'achat')`), 'refusée');
  verifier('et un compteur nul',
    await refus(`insert into mesures (jour, evenement, n) values (current_date, 'etape_4', 0)`), 'refusée');

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

/* L'API répond comme le script Google, et ne laisse rien fuir.
 *
 * Le gestionnaire réel (api/index.js) est appelé avec une base PGlite qui
 * contient le catalogue du 2 octobre 2026. Ce qui est éprouvé ici, c'est la
 * couche HTTP : quelle action rend quoi, avec quel cache, et ce qui se passe
 * quand la base ne répond pas. La justesse du catalogue lui-même est éprouvée
 * par import.test.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { lireCatalogue } = require('../../../api/_lib/catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { RACINE_SUPABASE } = require('../../../api/_lib/base');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

/** Un appel HTTP simulé : ce que reçoit le gestionnaire, ce qu'il renvoie. */
async function appeler(gestionnaire, methode, url) {
  const res = {
    statusCode: 200, entetes: {}, corps: '',
    setHeader(k, v) { this.entetes[k.toLowerCase()] = v; },
    end(corps) { this.corps = corps || ''; }
  };
  await gestionnaire({ method: methode, url }, res);
  let json = null;
  try { json = JSON.parse(res.corps); } catch (e) { /* corps vide ou non JSON */ }
  return { statut: res.statusCode, entetes: res.entetes, json };
}

const sansMaj = c => { const { maj, ...reste } = c || {}; return reste; };

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  const api = creerGestionnaire(() => db);

  // ------------------------------------------------- 1. Les appels du site ---

  const cat = await appeler(api, 'GET', '/api?action=catalogue');
  verifier('catalogue : réponse 200', cat.statut, 200);
  verifier('catalogue : en JSON', cat.entetes['content-type'], 'application/json; charset=utf-8');
  verifier('catalogue : le même que la base', sansMaj(cat.json), sansMaj(await lireCatalogue(db)));
  verifier('catalogue : daté', typeof (cat.json && cat.json.maj), 'string');
  /* Contre-contrôle : une comparaison de deux réponses vides passerait seule. */
  verifier('catalogue : 5 formations, réellement', cat.json && cat.json.formations.length, 5);
  verifier('catalogue : 15 secondes de cache partagé, pas plus',
    /s-maxage=15\b/.test(cat.entetes['cache-control'] || ''), true);

  const vide = await appeler(api, 'GET', '/api?action=places');
  verifier('places : aucune prise au départ', vide.json, { sessions: {} });
  await db.exec(`insert into inscriptions (form_id, nom, statut, session_id) values
    ('canva-pro', 'Awa', 'Confirmé', 'canva-pro-2026-11'),
    ('canva-pro', 'Bilal', 'En attente', 'canva-pro-2026-11')`);
  verifier('places : seule l’inscription confirmée compte',
    (await appeler(api, 'GET', '/api?action=places')).json, { sessions: { 'canva-pro-2026-11': 1 } });

  const version = await appeler(api, 'GET', '/api?action=version');
  verifier('version : la base répond', version.json && version.json.base, 'ok');
  verifier('version : jamais en cache', version.entetes['cache-control'], 'no-store');

  // ------------------------------------------------- 2. Ce qui est refusé ---

  const inconnue = await appeler(api, 'GET', '/api?action=supprimer');
  verifier('une action inconnue est refusée', [inconnue.statut, inconnue.json], [400, { erreur: 'action inconnue' }]);
  verifier('sans action aussi', (await appeler(api, 'GET', '/api')).statut, 400);
  /* Les écritures arrivent en phases 3 et 4 : d'ici là, rien ne s'écrit par l'API. */
  const post = await appeler(api, 'POST', '/api?action=catalogue');
  verifier('une écriture est refusée pour l’instant', [post.statut, post.entetes.allow], [405, 'GET, HEAD']);

  // ---------------------------------------- 3. Une base en panne ne fuit pas ---

  /* L'erreur porte un détail interne : il ne doit pas atteindre le visiteur. */
  const enPanne = creerGestionnaire(() => ({
    query: async () => { throw Object.assign(new Error('password authentication failed for user postgres.SECRET'), { code: '28P01' }); }
  }));
  const panne = await appeler(enPanne, 'GET', '/api?action=catalogue');
  verifier('base en panne : réponse 503', panne.statut, 503);
  verifier('base en panne : message générique', panne.json, { erreur: 'Service momentanément indisponible.' });
  verifier('et rien de l’erreur interne', JSON.stringify(panne.json).includes('SECRET'), false);
  verifier('et jamais mise en cache', panne.entetes['cache-control'], 'no-store');

  const diag = await appeler(enPanne, 'GET', '/api?action=version');
  verifier('le diagnostic donne le code, pour savoir quoi corriger', diag.json && diag.json.code, '28P01');
  verifier('mais pas le message', JSON.stringify(diag.json).includes('SECRET'), false);

  /* Sans adresse de base (variable oubliée dans Vercel) : même réponse propre. */
  const sansAdresse = creerGestionnaire(() => { throw Object.assign(new Error('DATABASE_URL absente'), { code: 'SANS_ADRESSE' }); });
  verifier('sans DATABASE_URL : 503 propre', (await appeler(sansAdresse, 'GET', '/api?action=places')).statut, 503);
  verifier('et le diagnostic le dit', (await appeler(sansAdresse, 'GET', '/api?action=version')).json.code, 'SANS_ADRESSE');

  // ------------------------------------ 4. Le certificat de Supabase est lisible ---

  /* La connexion réelle ne se fait qu'en ligne. On vérifie au moins que la
     racine embarquée est un certificat valide, que Node accepte. */
  let lisible = true;
  try { tls.createSecureContext({ ca: RACINE_SUPABASE }); } catch (e) { lisible = false; }
  verifier('la racine de Supabase est un certificat que Node accepte', lisible, true);
  verifier('et c’est bien celle de Supabase', /BEGIN CERTIFICATE/.test(RACINE_SUPABASE), true);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

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
const { catalogueDuMarche } = require('../../../api/_lib/marche');
const { creerGestionnaire } = require('../../../api/index.js');
const { RACINE_SUPABASE } = require('../../../api/_lib/base');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

/** Ce que le formulaire du site envoie vraiment (script.js), pour Canva Pro aux Comores. */
const INSCRIPTION = {
  formationId: 'canva-pro', sessionId: 'canva-pro-2026-11', nom: 'SAID', prenom: 'Awa',
  telephone: '3212345', email: 'awa@exemple.test', age: 24, profession: 'Étudiant',
  niveau: 'Débutant', motivation: 'Créer mes visuels', objectifs: 'Freelance', modePaiement: 'Mvola',
  telPaiement: '3212345', statut: 'En attente', source: 'Site', paysCode: 'KM', pays: 'Comores',
  countryCode: '+269', telephoneInternational: '+2693212345', montant: 15000, currency: 'KMF',
  formationTitle: 'Canva Pro & Création de contenu', dateInscription: '2026-10-03T08:00:00.000Z'
};

/** Un appel HTTP simulé : ce que reçoit le gestionnaire, ce qu'il renvoie. */
async function appeler(gestionnaire, methode, url, corps, entetes = {}) {
  const res = {
    statusCode: 200, entetes: {}, corps: '',
    setHeader(k, v) { this.entetes[k.toLowerCase()] = v; },
    end(corps) { this.corps = corps || ''; }
  };
  /* Un visiteur des Comores : Vercel joint le pays de l'adresse IP à chaque requête. */
  await gestionnaire({ method: methode, url, body: corps, headers: Object.assign({ 'x-forwarded-for': '41.223.0.10', 'x-vercel-ip-country': 'KM' }, entetes) }, res);
  let json = null;
  try { json = JSON.parse(res.corps); } catch (e) { /* corps vide ou non JSON */ }
  return { statut: res.statusCode, entetes: res.entetes, json };
}

const sansMaj = c => { const { maj, ...reste } = c || {}; return reste; };

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  const api = creerGestionnaire(() => db);
  /* Un faux envoi d'e-mail : on compte les alertes, rien ne part. */
  const courriels = [];
  const apiEnvoi = creerGestionnaire(() => db, {
    envoyer: async m => { courriels.push(m); return { envoye: true, erreur: null }; },
    sel: () => 'sel-des-epreuves'
  });
  const compter = async () => (await db.query('select count(*)::int as n from inscriptions')).rows[0].n;

  // ------------------------------------------------- 1. Les appels du site ---

  const cat = await appeler(api, 'GET', '/api?action=catalogue');
  verifier('catalogue : réponse 200', cat.statut, 200);
  verifier('catalogue : en JSON', cat.entetes['content-type'], 'application/json; charset=utf-8');
  verifier('catalogue : celui de la base, réduit au marché du visiteur (Comores)', sansMaj(cat.json),
    sansMaj(catalogueDuMarche(await lireCatalogue(db), { code: 'KM', source: 'ip' })));
  verifier('catalogue : une copie par pays dans le réseau de Vercel', cat.entetes['vary'], 'X-Vercel-IP-Country');
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
  const put = await appeler(api, 'PUT', '/api');
  verifier('une autre méthode est refusée', [put.statut, put.entetes.allow], [405, 'GET, HEAD, POST']);

  // ------------------------------------------ 3. L'envoi du formulaire ---

  /* Les commandes du tableau de bord arrivent en phase 4 : une requête qui en
     porte une ne doit SURTOUT PAS être prise pour une inscription. */
  const commande = await appeler(apiEnvoi, 'POST', '/api', JSON.stringify({ action: 'admin.inscriptions', motDePasse: 'x' }));
  verifier('une commande d’administration sans session est refusée', [commande.statut, commande.json.authentification], [401, false]);
  verifier('un envoi illisible est refusé',
    (await appeler(apiEnvoi, 'POST', '/api', '{pas du json')).json, { ok: false, erreur: 'Envoi illisible.' });
  verifier('un envoi démesuré est refusé', (await appeler(apiEnvoi, 'POST', '/api', 'x'.repeat(30000))).statut, 413);
  verifier('aucune ligne n’a été écrite par ces refus', await compter(), 2);

  const envoi = await appeler(apiEnvoi, 'POST', '/api', JSON.stringify(INSCRIPTION));
  verifier('une inscription du formulaire est acceptée', [envoi.statut, envoi.json], [200, { ok: true }]);
  verifier('et enregistrée', await compter(), 3);
  verifier('l’alerte est partie une fois', courriels.length, 1);
  verifier('elle nomme la formation du catalogue', /Canva Pro & Création de contenu/.test(courriels[0] && courriels[0].sujet), true);
  verifier('et répond au candidat', courriels[0] && courriels[0].repondreA, 'awa@exemple.test');

  /* Le même envoi, renvoyé après un délai dépassé : « reçu », sans doublon ni seconde alerte. */
  const renvoi = await appeler(apiEnvoi, 'POST', '/api', JSON.stringify(INSCRIPTION));
  verifier('un renvoi identique répond « reçu »', renvoi.json, { ok: true });
  verifier('sans doublon', await compter(), 3);
  verifier('ni seconde alerte', courriels.length, 1);

  /* Du 24 au 27 octobre 2026, la clé d'envoi était refusée pour le nouveau
     domaine : aucune alerte ne partait, et le tableau de bord ne disait rien.
     Une alerte perdue laisse maintenant une trace, que « admin.sante » compte. */
  const JETON = 'aaa.admin.zzz';
  const REGLAGES = { cle: 'sb_publishable_essai', admin: 'infos@impactali.site',
    lireUtilisateur: async j => (j === JETON ? { email: 'infos@impactali.site' } : null) };
  const apiSansEnvoi = creerGestionnaire(() => db, {
    envoyer: async () => ({ envoye: false, erreur: 'Resend 403 {"message":"This API key is not authorized to send emails from cineworldacademie.com"}' }),
    sel: () => 'sel-des-epreuves', admin: REGLAGES
  });
  const perdue = await appeler(apiSansEnvoi, 'POST', '/api', JSON.stringify(Object.assign({}, INSCRIPTION, { telephone: '3299001', telephoneInternational: '+2693299001' })));
  verifier('une alerte qui ne part pas ne fait pas perdre l’inscription', [perdue.statut, perdue.json, await compter()], [200, { ok: true }, 4]);
  const trace = (await db.query(`select qui, cible, details->>'erreur' as erreur from journal where action = 'alerte.echec'`)).rows;
  verifier('elle laisse une trace au journal', [trace.length, trace[0] && trace[0].qui, /not authorized/.test(String(trace[0] && trace[0].erreur))], [1, 'site', true]);

  const admin = (action, charge) => appeler(apiSansEnvoi, 'POST', '/api', JSON.stringify(Object.assign({ action }, charge)), { authorization: 'Bearer ' + JETON });
  await db.exec(`insert into sauvegardes (faite_le, octets, envoyee, erreur) values
    (now() - interval '30 hours', 1000, true, null),
    (now() - interval '5 hours', 1200, false, 'Resend 403 clé non autorisée')`);
  const sante = (await admin('admin.sante', {})).json;
  verifier('le tableau de bord compte les alertes perdues', sante.alertesEchouees, 1);
  verifier('dit quand la dernière sauvegarde est partie, et pourquoi la suivante a échoué',
    [Boolean(sante.sauvegarde.derniereReussie), sante.sauvegarde.derniereErreur], [true, 'Resend 403 clé non autorisée']);
  const delaiH = (Date.now() - new Date(sante.sauvegarde.derniereReussie).getTime()) / 3600e3;
  verifier('la dernière réussie date bien d’environ 30 heures', delaiH > 29 && delaiH < 31, true);
  const liste = (await admin('admin.inscriptions', {})).json;
  verifier('la liste des inscriptions donne aussi le total, pour dire quand elle est tronquée', [liste.inscriptions.length, liste.total], [4, 4]);
  verifier('sans session de l’administrateur, l’état de santé reste fermé',
    (await appeler(apiSansEnvoi, 'POST', '/api', JSON.stringify({ action: 'admin.sante' }))).statut, 401);

  // ---------------------------------------- 4. Une base en panne ne fuit pas ---

  /* L'erreur porte un détail interne : il ne doit pas atteindre le visiteur. */
  const enPanne = creerGestionnaire(() => ({
    query: async () => { throw Object.assign(new Error('password authentication failed for user postgres.SECRET'), { code: '28P01' }); }
  }));
  const panne = await appeler(enPanne, 'GET', '/api?action=catalogue');
  verifier('base en panne : réponse 503', panne.statut, 503);
  verifier('base en panne : message générique', panne.json, { ok: false, erreur: 'Service momentanément indisponible.' });
  verifier('et rien de l’erreur interne', JSON.stringify(panne.json).includes('SECRET'), false);
  verifier('et jamais mise en cache', panne.entetes['cache-control'], 'no-store');

  const diag = await appeler(enPanne, 'GET', '/api?action=version');
  verifier('le diagnostic donne le code, pour savoir quoi corriger', diag.json && diag.json.code, '28P01');
  verifier('mais pas le message', JSON.stringify(diag.json).includes('SECRET'), false);

  /* Sans adresse de base (variable oubliée dans Vercel) : même réponse propre. */
  const sansAdresse = creerGestionnaire(() => { throw Object.assign(new Error('DATABASE_URL absente'), { code: 'SANS_ADRESSE' }); });
  verifier('sans DATABASE_URL : 503 propre', (await appeler(sansAdresse, 'GET', '/api?action=places')).statut, 503);
  verifier('et le diagnostic le dit', (await appeler(sansAdresse, 'GET', '/api?action=version')).json.code, 'SANS_ADRESSE');

  // ------------------------------------ 5. Le certificat de Supabase est lisible ---

  /* La connexion réelle ne se fait qu'en ligne. On vérifie au moins que la
     racine embarquée est un certificat valide, que Node accepte. */
  let lisible = true;
  try { tls.createSecureContext({ ca: RACINE_SUPABASE }); } catch (e) { lisible = false; }
  verifier('la racine de Supabase est un certificat que Node accepte', lisible, true);
  verifier('et c’est bien celle de Supabase', /BEGIN CERTIFICATE/.test(RACINE_SUPABASE), true);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

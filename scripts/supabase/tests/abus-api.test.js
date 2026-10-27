/* Aucune adresse inventée ne relit la base.
 *
 * Le réseau de Vercel garde une copie des réponses par adresse COMPLÈTE : un
 * paramètre inventé (« &x=1 », « &x=2 »…) la contourne, et chaque requête faisait
 * alors relire la base — treize requêtes SQL pour le catalogue, un fichier de
 * 1,5 Mo pour une photo, dont l'adresse est publique dans les pages. Quelques
 * milliers de requêtes suffisaient à épuiser le quota d'échange de l'offre
 * gratuite de Supabase, qui coupe alors le projet (audit du 27/10/2026).
 *
 * Deux défenses, éprouvées ici par le vrai gestionnaire HTTP : une adresse qui
 * porte un paramètre inconnu est refusée AVANT toute lecture ; et le catalogue
 * complet est gardé quelques secondes en mémoire, si bien que le nombre de lectures
 * de la base ne dépend plus du nombre d'adresses demandées — sans jamais mélanger
 * les pays : la copie gardée est complète, le filtrage se fait à chaque requête. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));
source.pays.find(p => p.code === 'DJ').active = true;

const JETON = 'aaa.admin.zzz';
const REGLAGES = { cle: 'sb_publishable_essai', admin: 'infos@impactali.site',
  lireUtilisateur: async j => (j === JETON ? { email: 'infos@impactali.site' } : null) };

/** Un appel HTTP simulé : ce que reçoit le gestionnaire, ce qu'il renvoie. */
async function appeler(gestionnaire, url, { pays = 'KM', methode = 'GET', corps, entetes = {} } = {}) {
  const res = { statusCode: 200, entetes: {}, corps: '', setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c || ''; } };
  const headers = Object.assign({ 'x-forwarded-for': '41.223.0.10' }, pays ? { 'x-vercel-ip-country': pays } : {}, entetes);
  await gestionnaire({ method: methode, url, body: corps, headers }, res);
  let json = null;
  try { json = JSON.parse(res.corps); } catch (e) { /* une image, ou rien */ }
  return { statut: res.statusCode, entetes: res.entetes, texte: res.corps, json };
}

/** La base, enveloppée d'un compteur de requêtes. */
function compter(db, compteur, { pannes = 0 } = {}) {
  let restantes = pannes;
  return new Proxy(db, {
    get(cible, nom) {
      if (nom === 'query') {
        return (...a) => {
          compteur.n++;
          if (restantes > 0) { restantes--; return Promise.reject(Object.assign(new Error('panne simulée'), { code: 'XX000' })); }
          return cible.query(...a);
        };
      }
      const v = cible[nom];
      return typeof v === 'function' ? v.bind(cible) : v;
    }
  });
}

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);

  // ------------------------------------------ 1. Un paramètre inconnu est refusé ---

  const compteur = { n: 0 };
  const sans = creerGestionnaire(() => compter(db, compteur));
  const PHOTO = '12345678-1234-4234-8234-123456789abc';
  for (const [libelle, url] of [
    ['une photo avec un paramètre inventé', `/api?photo=${PHOTO}&x=1`],
    ['le catalogue avec un paramètre inventé', '/api?action=catalogue&x=1'],
    ['les places avec un paramètre inventé', '/api?action=places&y=2'],
    ['la version avec un paramètre inventé', '/api?action=version&z=3'],
    ['la configuration avec un paramètre inventé', '/api?action=config&z=3'],
    ['une même clé écrite deux fois', '/api?action=catalogue&position=-11.70,43.26&position=11.59,43.15'],
    ['l’ancien « &marche= », qui n’existe plus', '/api?action=catalogue&marche=KM'],
    ['une action inconnue', '/api?action=inconnue&x=1']
  ]) {
    const avant = compteur.n;
    const r = await appeler(sans, url);
    verifier(`${libelle} : refusé, sans lire la base`, [r.statut, compteur.n - avant], [400, 0]);
  }

  const avant = compteur.n;
  const ok = await appeler(sans, '/api?action=catalogue&position=-11.70,43.26');
  verifier('le paramètre « position » reste permis', [ok.statut, compteur.n > avant], [200, true]);

  // ----------------------------------------------------- 2. Les photos ---

  let a = compteur.n;
  const majuscules = await appeler(sans, `/api?photo=${PHOTO.toUpperCase()}`);
  verifier('une photo demandée avec son identifiant en MAJUSCULES n’ouvre pas une adresse de plus : introuvable, sans lire la base',
    [majuscules.statut, compteur.n - a], [404, 0]);
  verifier('et ce refus se garde un moment, pas un an', /s-maxage=60/.test(majuscules.entetes['cache-control'] || ''), true);
  a = compteur.n;
  const inconnue = await appeler(sans, `/api?photo=${PHOTO}`);
  verifier('une photo inconnue, bien écrite, coûte UNE lecture et répond introuvable', [inconnue.statut, compteur.n - a], [404, 1]);

  // ----------------------------------------------- 3. Le catalogue en mémoire ---

  const c0 = { n: 0 };
  const sansCache = creerGestionnaire(() => compter(db, c0));
  await appeler(sansCache, '/api?action=catalogue');
  const parLecture = c0.n;
  await appeler(sansCache, '/api?action=catalogue');
  verifier('sans cache (réglage des épreuves), chaque requête relit la base', c0.n, parLecture * 2);

  const c1 = { n: 0 };
  const avec = creerGestionnaire(() => compter(db, c1), { dureeCache: 5000, admin: REGLAGES });
  const premiere = await appeler(avec, '/api?action=catalogue');
  const lectures = c1.n;
  verifier('une lecture du catalogue coûte plusieurs requêtes SQL', lectures >= parLecture, true);
  for (const url of ['/api?action=catalogue', '/api?action=catalogue&position=-11.70,43.26',
    '/api?action=catalogue&position=11.59,43.15', '/api?action=places']) {
    await appeler(avec, url);
  }
  verifier('avec le cache, quatre autres adresses n’ajoutent aucune lecture du catalogue',
    c1.n - lectures <= 1, true); // « places » ajoute une requête sur les inscrits, jamais les treize du catalogue
  verifier('et la réponse est la même', (await appeler(avec, '/api?action=catalogue')).json.marche, premiere.json.marche);

  /* Le cache est COMPLET : la copie gardée porte les deux pays, et le filtrage par pays se
     fait à chaque requête. Un visiteur de Djibouti ne reçoit jamais ce qu'un visiteur des
     Comores a fait lire juste avant lui. */
  const km = await appeler(avec, '/api?action=catalogue', { pays: 'KM' });
  const dj = await appeler(avec, '/api?action=catalogue', { pays: 'DJ' });
  verifier('depuis la même copie, les Comores ne reçoivent rien de Djibouti', [km.json.marche.code, /Waafi|Cacpay|FDJ/.test(km.texte)], ['KM', false]);
  verifier('et Djibouti ne reçoit rien des Comores', [dj.json.marche.code, /Mvola|KMF|American corner/i.test(dj.texte)], ['DJ', false]);

  // ------------------------------------- 4. Une commande efface la copie gardée ---

  const avantCommande = c1.n;
  const commande = await appeler(avec, '/api', { methode: 'POST', corps: JSON.stringify({ action: 'admin.sante' }),
    entetes: { authorization: 'Bearer ' + JETON } });
  verifier('une commande du tableau de bord s’exécute', commande.json && commande.json.ok, true);
  const apres = c1.n;
  await appeler(avec, '/api?action=catalogue');
  verifier('et la requête publique suivante relit le catalogue : on ne sert pas l’ancien après une modification',
    c1.n - apres >= parLecture, true);
  verifier('(la commande elle-même n’avait relu que son état de santé)', apres - avantCommande < parLecture, true);

  // --------------------------------------------- 5. Une lecture ratée ne se garde pas ---

  const c2 = { n: 0 };
  const baseCapricieuse = compter(db, c2, { pannes: 1 }); // UNE base, qui tombe en panne une fois puis revient
  const capricieuse = creerGestionnaire(() => baseCapricieuse, { dureeCache: 5000 });
  const panne = await appeler(capricieuse, '/api?action=catalogue');
  const reprise = await appeler(capricieuse, '/api?action=catalogue');
  verifier('une panne de la base répond 503', panne.statut, 503);
  verifier('et la requête suivante, la base revenue, répond : l’échec n’est pas gardé', reprise.statut, 200);

  // ----------------------------------- 6. L'inscription lit le même catalogue ---

  const c3 = { n: 0 };
  const inscription = creerGestionnaire(() => compter(db, c3), { dureeCache: 5000 });
  await appeler(inscription, '/api?action=catalogue');
  const lu = c3.n;
  /* Le POST ouvre une transaction : sur PGlite, `db.transaction` n'est pas celui du compteur.
     On compte donc seulement ce qui précède : le catalogue n'est pas relu avant l'écriture. */
  const envoi = await appeler(inscription, '/api', { methode: 'POST', corps: JSON.stringify({
    formationId: 'canva-pro', sessionId: 'canva-pro-2026-11', paysCode: 'KM', nom: 'ESSAI', prenom: 'Cache', telephone: '3205550',
    email: 'cache@exemple.test', age: 30, profession: 'Autre', motivation: 'x', objectifs: 'x', niveau: 'Débutant',
    modePaiement: 'Mvola', telPaiement: '3205550', source: 'Site' }) });
  verifier('une inscription est acceptée avec le catalogue gardé', [envoi.statut, envoi.json], [200, { ok: true }]);
  verifier('sans relire les treize requêtes du catalogue', c3.n - lu < parLecture, true);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

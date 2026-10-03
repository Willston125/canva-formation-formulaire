/* L'API du site : la base Supabase, derrière les MÊMES appels que le script
 * Google, avec les mêmes réponses :
 *   GET  ?action=catalogue | places | version
 *   POST (sans « action ») : une inscription du formulaire public
 *   POST avec « action »   : une commande du tableau de bord (session Supabase)
 *
 * PHASE 3 DU PLAN : elle répond en ligne, mais le site ne s'en sert pas
 * encore. Il basculera d'un coup en phase 4, avec le tableau de bord : tant
 * que le tableau de bord écrit dans la feuille, le site doit lire la feuille
 * (docs/superpowers/plans/2026-10-02-migration-supabase.md). */
'use strict';

const crypto = require('crypto');
const { base } = require('./_lib/base');
const { lireCatalogue, compterInscrits } = require('./_lib/catalogue');
const { recevoirInscription } = require('./_lib/inscription');
const { alerteInscription, envoyer: envoyerCourriel } = require('./_lib/courriel');
const { executer: executerCommande, SUPABASE_URL } = require('./_lib/admin');

/* Les places changent à chaque confirmation : 15 secondes de cache partagé,
   pas plus (audit P1). Le script Google relisait toute la feuille à chaque
   visite et répondait en 4,5 à 7 secondes. */
const CACHE_COURT = 'public, max-age=0, s-maxage=15, stale-while-revalidate=30';
/* Une inscription tient en quelques kilo-octets : au-delà, ce n'est pas un formulaire. */
const TAILLE_MAX = 20000;

function repondre(res, statut, donnees, cache) {
  res.statusCode = statut;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(donnees));
}

/** Le corps de la requête, en texte. Le site l'envoie en text/plain (requête « simple »). */
async function lireCorps(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body);
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  let texte = '';
  for await (const morceau of req) {
    texte += morceau;
    if (texte.length > TAILLE_MAX) break;
  }
  return texte;
}

/** Le sel de l'empreinte des adresses : tiré d'un secret déjà en place, jamais écrit. */
function selParDefaut() {
  return crypto.createHash('sha256').update('empreinte-ip:' + (process.env.DATABASE_URL || '')).digest('hex');
}

/** Diagnostic sans secret : quelle version est en ligne, et la base répond-elle ? */
async function etat(obtenirBase) {
  const version = String(process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
  // Ce qui est réglé dans Vercel, sans jamais dire la valeur
  const reglages = {
    courriel: process.env.RESEND_API_KEY ? 'configuré' : 'absent',
    admin: process.env.ADMIN_EMAIL ? 'configuré' : 'absent',
    cle: process.env.SUPABASE_PUBLISHABLE_KEY ? 'configurée' : 'absente'
  };
  try {
    const debut = Date.now();
    await obtenirBase().query('select 1');
    return Object.assign({ version, base: 'ok', ms: Date.now() - debut }, reglages);
  } catch (e) {
    /* Le CODE d'erreur suffit à diagnostiquer (mot de passe refusé : 28P01,
       adresse introuvable : ENOTFOUND, certificat : SELF_SIGNED_CERT_IN_CHAIN)
       sans rien révéler de la base ni de son adresse. */
    return Object.assign({ version, base: 'injoignable', code: String((e && (e.code || e.name)) || 'inconnu') }, reglages);
  }
}

/** Fabrique le gestionnaire : les épreuves lui passent une base PGlite, un faux envoi d'e-mail, un faux Supabase Auth. */
function creerGestionnaire(obtenirBase, { envoyer = envoyerCourriel, sel = selParDefaut, admin = {} } = {}) {
  return async function gestionnaire(req, res) {
    const action = new URL(req.url || '/', 'http://site').searchParams.get('action') || '';

    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (action === 'catalogue') return repondre(res, 200, await lireCatalogue(obtenirBase()), CACHE_COURT);
        if (action === 'places') return repondre(res, 200, { sessions: await compterInscrits(obtenirBase()) }, CACHE_COURT);
        if (action === 'version') return repondre(res, 200, await etat(obtenirBase));
        /* Ce dont la page de connexion a besoin pour parler à Supabase Auth.
           La clé « publishable » est publique par conception : avec la RLS
           fermée, elle ne lit rien de la base. Elle vit dans Vercel pour que
           le dépôt, lui, ne porte aucune clé. */
        if (action === 'config') {
          return repondre(res, 200, { supabaseUrl: SUPABASE_URL, cle: process.env.SUPABASE_PUBLISHABLE_KEY || null },
            'public, max-age=0, s-maxage=300');
        }
        return repondre(res, 400, { erreur: 'action inconnue' });
      }

      if (req.method === 'POST') {
        const brut = await lireCorps(req);
        if (brut.length > TAILLE_MAX) return repondre(res, 413, { ok: false, erreur: 'Envoi trop volumineux.' });
        let charge;
        try { charge = JSON.parse(brut); } catch (e) { return repondre(res, 200, { ok: false, erreur: 'Envoi illisible.' }); }
        /* Une requête qui porte une « action » est une commande du tableau de
           bord : elle n'est JAMAIS prise pour une inscription. Elle exige la
           session de l'administrateur, présentée dans l'en-tête Authorization. */
        if (charge && typeof charge === 'object' && charge.action) {
          const entete = String((req.headers && req.headers.authorization) || '');
          const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : '';
          const issue = await executerCommande(obtenirBase(), charge, jeton, admin);
          return repondre(res, issue.statut, issue.corps);
        }

        const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '')
          .split(',')[0].trim();
        const issue = await recevoirInscription(obtenirBase(), charge, { ip, sel: sel() });
        if (issue.ligne && issue.alerter) {
          // Une alerte qui échoue ne doit jamais faire perdre l'inscription : elle est déjà enregistrée
          const a = alerteInscription(issue.ligne);
          const envoi = await envoyer({ sujet: a.sujet, texte: a.texte, html: a.html, repondreA: a.repondreA });
          if (!envoi.envoye) console.error('[alerte]', envoi.erreur);
        }
        return repondre(res, 200, issue.resultat);
      }

      res.setHeader('Allow', 'GET, HEAD, POST');
      return repondre(res, 405, { ok: false, erreur: 'Méthode non acceptée.' });
    } catch (e) {
      console.error('[api]', req.method, action, (e && e.code) || '', e && e.message);
      // Rien de l'erreur interne ne part chez le visiteur (audit S9)
      return repondre(res, 503, { ok: false, erreur: 'Service momentanément indisponible.' });
    }
  };
}

module.exports = creerGestionnaire(base);
module.exports.creerGestionnaire = creerGestionnaire;

/* L'API du site : la base Supabase, derrière les MÊMES appels que le script
 * Google, avec les mêmes réponses :
 *   GET  ?action=catalogue | places | version | config
 *   GET  ?photo=<identifiant> : une photo téléversée depuis le tableau de bord
 *   POST { mesure, … }     : un signal anonyme de la mesure d'audience (204)
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
const { lireCatalogue } = require('./_lib/catalogue');
const { recevoirInscription } = require('./_lib/inscription');
const { alerteInscription, envoyer: envoyerCourriel } = require('./_lib/courriel');
const { executer: executerCommande, SUPABASE_URL } = require('./_lib/admin');
const { lirePhoto } = require('./_lib/photos');
const { recevoirMesure, TAILLE_MAX_MESURE } = require('./_lib/mesures');
const { choisirMarche, catalogueDuMarche, placesDuMarche } = require('./_lib/marche');

/** Un en-tête de la requête, en texte ('' s'il manque). */
const entete = (req, nom) => String((req.headers && req.headers[nom]) || '');

/* Les places changent à chaque confirmation : 15 secondes de cache partagé,
   pas plus (audit P1). Le script Google relisait toute la feuille à chaque
   visite et répondait en 4,5 à 7 secondes. */
const CACHE_COURT = 'public, max-age=0, s-maxage=15, stale-while-revalidate=30';
/* Une inscription tient en quelques kilo-octets : au-delà, ce n'est pas un formulaire. */
const TAILLE_MAX = 20000;
/* Une commande du tableau de bord peut porter un programme complet, et bientôt
   une photo (1,5 Mo, soit 2 Mo une fois encodée). Vercel coupe de toute façon
   à 4,5 Mo. */
const TAILLE_MAX_ADMIN = 3000000;

function repondre(res, statut, donnees, cache) {
  res.statusCode = statut;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(donnees));
}

/* Une photo ne change jamais : la remplacer en crée une autre, à une autre
   adresse. Le réseau de Vercel la garde donc un an, et elle ne sort de la base
   qu'une fois. Le type vient de la base, qui n'en accepte que trois ; « nosniff »
   et la politique de contenu empêchent qu'on la lise comme autre chose. */
function servirPhoto(res, photo) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  if (!photo) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.end();
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', photo.type);
  res.setHeader('Content-Length', photo.octets.length);
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.end(photo.octets);
}

/** Le corps de la requête, en texte. Le site l'envoie en text/plain (requête « simple »). */
async function lireCorps(req, max) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body);
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  let texte = '';
  for await (const morceau of req) {
    texte += morceau;
    if (texte.length > max) break;
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
    /* La FORME seulement, jamais la valeur : une clé collée par erreur à la
       place de l'e-mail fermerait le tableau de bord sans autre indice. */
    admin: !process.env.ADMIN_EMAIL ? 'absent'
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim()) ? 'configuré' : 'pas un e-mail',
    cle: !process.env.SUPABASE_PUBLISHABLE_KEY ? 'absente'
      : /^sb_publishable_/.test(process.env.SUPABASE_PUBLISHABLE_KEY.trim()) ? 'configurée' : 'pas une clé publishable'
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
    const parametres = new URL(req.url || '/', 'http://site').searchParams;
    const action = parametres.get('action') || '';

    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (parametres.has('photo')) return servirPhoto(res, await lirePhoto(obtenirBase(), parametres.get('photo')));
        /* Le catalogue et les places ne partent que pour le MARCHÉ du visiteur :
           le pays de son adresse IP, ou celui qu'il a choisi (api/_lib/marche.js).
           Le réseau de Vercel garde une copie par pays, jamais celle d'un autre. */
        if (action === 'catalogue' || action === 'places') {
          const indices = { demande: parametres.get('marche') || '', ip: entete(req, 'x-vercel-ip-country') };
          res.setHeader('Vary', 'X-Vercel-IP-Country');
          const complet = await lireCatalogue(obtenirBase());
          const choix = choisirMarche(complet, indices);
          if (action === 'catalogue') return repondre(res, 200, catalogueDuMarche(complet, choix), CACHE_COURT);
          return repondre(res, 200, { sessions: await placesDuMarche(obtenirBase(), complet.places, choix.code) }, CACHE_COURT);
        }
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
        const brut = await lireCorps(req, TAILLE_MAX_ADMIN);
        const tropGros = () => repondre(res, 413, { ok: false, erreur: 'Envoi trop volumineux.' });
        if (brut.length > TAILLE_MAX_ADMIN) return tropGros();
        let charge;
        try { charge = JSON.parse(brut); } catch (e) {
          return brut.length > TAILLE_MAX ? tropGros() : repondre(res, 200, { ok: false, erreur: 'Envoi illisible.' });
        }
        /* Une requête qui porte une « action » est une commande du tableau de
           bord : elle n'est JAMAIS prise pour une inscription. Elle exige la
           session de l'administrateur, présentée dans l'en-tête Authorization. */
        if (charge && typeof charge === 'object' && charge.action) {
          const entete = String((req.headers && req.headers.authorization) || '');
          const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : '';
          const issue = await executerCommande(obtenirBase(), charge, jeton, Object.assign({ envoyer }, admin));
          return repondre(res, issue.statut, issue.corps);
        }
        const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '')
          .split(',')[0].trim();

        /* Un signal de la mesure d'audience ({ mesure, formation, pays }, ou
           { mesure, annonce, pays } pour la fenêtre d'annonce) : ni
           une commande, ni une inscription. Le site ne lit pas la réponse — il
           l'envoie en tâche de fond —, d'où un 204 sans corps, que le signal
           ait été compté ou écarté. */
        if (charge && typeof charge === 'object' && Object.prototype.hasOwnProperty.call(charge, 'mesure')) {
          if (brut.length <= TAILLE_MAX_MESURE) await recevoirMesure(obtenirBase(), charge, { ip, sel: sel() });
          res.statusCode = 204;
          res.setHeader('Cache-Control', 'no-store');
          return res.end();
        }

        // Seul le tableau de bord a droit à un envoi volumineux
        if (brut.length > TAILLE_MAX) return tropGros();

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

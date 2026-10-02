/* L'API du site : la base Supabase, derrière les MÊMES appels que le script
 * Google — `?action=catalogue`, `?action=places` — avec les mêmes réponses.
 *
 * PHASE 2 DU PLAN : elle répond en ligne, mais le site ne s'en sert pas
 * encore. Il basculera d'un coup en phase 4, avec le formulaire et le tableau
 * de bord : tant que le tableau de bord écrit dans la feuille, le site doit
 * lire la feuille (docs/superpowers/plans/2026-10-02-migration-supabase.md). */
'use strict';

const { base } = require('./_lib/base');
const { lireCatalogue, compterInscrits } = require('./_lib/catalogue');

/* Les places changent à chaque confirmation : 15 secondes de cache partagé,
   pas plus (audit P1). Le script Google relisait toute la feuille à chaque
   visite et répondait en 4,5 à 7 secondes. */
const CACHE_COURT = 'public, max-age=0, s-maxage=15, stale-while-revalidate=30';

function repondre(res, statut, donnees, cache) {
  res.statusCode = statut;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(donnees));
}

/** Diagnostic sans secret : quelle version est en ligne, et la base répond-elle ? */
async function etat(obtenirBase) {
  const version = String(process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
  try {
    const debut = Date.now();
    await obtenirBase().query('select 1');
    return { version, base: 'ok', ms: Date.now() - debut };
  } catch (e) {
    /* Le CODE d'erreur suffit à diagnostiquer (mot de passe refusé : 28P01,
       adresse introuvable : ENOTFOUND, certificat : SELF_SIGNED_CERT_IN_CHAIN)
       sans rien révéler de la base ni de son adresse. */
    return { version, base: 'injoignable', code: String((e && (e.code || e.name)) || 'inconnu') };
  }
}

/** Fabrique le gestionnaire : les épreuves lui passent une base PGlite. */
function creerGestionnaire(obtenirBase) {
  return async function gestionnaire(req, res) {
    const action = new URL(req.url || '/', 'http://site').searchParams.get('action') || '';

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return repondre(res, 405, { ok: false, erreur: 'Méthode non acceptée.' });
    }

    try {
      if (action === 'catalogue') return repondre(res, 200, await lireCatalogue(obtenirBase()), CACHE_COURT);
      if (action === 'places') return repondre(res, 200, { sessions: await compterInscrits(obtenirBase()) }, CACHE_COURT);
      if (action === 'version') return repondre(res, 200, await etat(obtenirBase));
      return repondre(res, 400, { erreur: 'action inconnue' });
    } catch (e) {
      console.error('[api]', action, (e && e.code) || '', e && e.message);
      // Rien de l'erreur interne ne part chez le visiteur (audit S9)
      return repondre(res, 503, { erreur: 'Service momentanément indisponible.' });
    }
  };
}

module.exports = creerGestionnaire(base);
module.exports.creerGestionnaire = creerGestionnaire;

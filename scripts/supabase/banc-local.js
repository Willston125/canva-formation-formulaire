/* Banc local du tableau de bord : le site, la VRAIE API sur une base PGlite
 * (catalogue du 2 octobre 2026), et un faux Supabase Auth, sur un seul port.
 *
 *   npm run banc   →   http://localhost:5180/admin/?essai
 *   e-mail : admin@banc.test — mot de passe : n'importe lequel (rien de réel)
 *
 * Sert à éprouver le tableau de bord de bout en bout, connexion comprise, sans
 * jamais toucher à la vraie base ni à de vrais identifiants. C'est lui qui a
 * trouvé, le 3 octobre 2026, la fonction `ouvrirSession` déclarée deux fois
 * (voir scripts/apps-script/tests/noms-uniques.test.js). */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
const PORT = 5180;
const JETON = 'aaa.banc.zzz';

// Réglés AVANT de charger l'API, qui les lit au chargement
process.env.SUPABASE_URL = 'http://localhost:' + PORT;
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_banc_local';
process.env.ADMIN_EMAIL = 'admin@banc.test';

const { baseNeuve } = require('./tests/outils');
const { catalogueVersSql } = require('./import-catalogue');
const { creerGestionnaire } = require('../../api/index.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'
};

(async () => {
  const db = await baseNeuve();
  const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'tests', 'catalogue-2026-10-02.json'), 'utf8'));
  await db.exec(catalogueVersSql(catalogue).sql);
  const api = creerGestionnaire(() => db, {
    envoyer: async m => { console.log('[e-mail non envoyé]', m.sujet); return { envoye: true, erreur: null }; },
    admin: { lireUtilisateur: async j => (j === JETON ? { email: 'admin@banc.test' } : null) }
  });

  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://banc');
    console.log(req.method, req.url);

    // Faux Supabase Auth : toute connexion réussit, avec un jeton du banc
    if (url.pathname === '/auth/v1/token') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ access_token: JETON, refresh_token: 'renouvellement-banc', expires_in: 3600 }));
    }
    if (url.pathname === '/auth/v1/logout') { res.statusCode = 204; return res.end(); }

    if (url.pathname === '/api') {
      let corps = '';
      for await (const morceau of req) corps += morceau;
      req.body = corps;
      return api(req, res);
    }

    let fichier = path.join(RACINE, decodeURIComponent(url.pathname));
    if (!fichier.startsWith(RACINE)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(fichier) && fs.statSync(fichier).isDirectory()) fichier = path.join(fichier, 'index.html');
    if (!fs.existsSync(fichier)) { res.statusCode = 404; return res.end('introuvable'); }
    res.setHeader('Content-Type', TYPES[path.extname(fichier)] || 'application/octet-stream');
    fs.createReadStream(fichier).pipe(res);
  }).listen(PORT, () => console.log('Banc prêt : http://localhost:' + PORT + '/admin/?essai (admin@banc.test)'));
})().catch(e => { console.error(e); process.exitCode = 1; });

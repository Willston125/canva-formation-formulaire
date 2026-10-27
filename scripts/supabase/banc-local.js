/* Banc local du tableau de bord : le site, la VRAIE API sur une base PGlite
 * (catalogue du 2 octobre 2026), et un faux Supabase Auth, sur un seul port.
 *
 *   npm run banc   →   http://localhost:5180/admin/?essai
 *   e-mail : admin@banc.test — mot de passe : n'importe lequel (rien de réel)
 *
 * Sert à éprouver le tableau de bord de bout en bout, connexion comprise, sans
 * jamais toucher à la vraie base ni à de vrais identifiants. C'est lui qui a
 * trouvé, le 3 octobre 2026, la fonction `ouvrirSession` déclarée deux fois
 * (voir scripts/site/tests/noms-uniques.test.js). */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
const PORT = 5180;
const JETON = 'aaa.banc.zzz';

/* Réglages d'essai, par variable d'environnement OU par argument (le lanceur de
   l'aperçu ne passe que des arguments) :
     npm run banc -- --pays=KM    le banc se fait passer pour Vercel, qui joint le pays de l'adresse IP
     npm run banc -- --sante      le banc se comporte comme la production du 24 au 27/10/2026 */
const argument = nom => { const a = process.argv.find(x => x === '--' + nom || x.startsWith('--' + nom + '=')); return a ? (a.split('=')[1] || '1') : ''; };
const PAYS_IP = process.env.PAYS_IP || argument('pays');
const SANTE = process.env.BANC_SANTE || argument('sante');

// Réglés AVANT de charger l'API, qui les lit au chargement
process.env.SUPABASE_URL = 'http://localhost:' + PORT;
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_banc_local';
process.env.ADMIN_EMAIL = 'admin@banc.test';

const { baseNeuve } = require('./tests/outils');
const { catalogueVersSql } = require('./import-catalogue');
const { creerGestionnaire } = require('../../api/index.js');

/* Les en-têtes de vercel.json, appliqués aux pages comme le fait Vercel : sans cela, le banc
   ne verrait jamais une politique de sécurité (CSP) qui bloque le tableau de bord. Les règles
   suivantes l'emportent sur les précédentes pour une même clé. */
const REGLES_EN_TETES = (JSON.parse(fs.readFileSync(path.join(RACINE, 'vercel.json'), 'utf8')).headers || []).map(r => ({
  re: new RegExp('^' + r.source.replace(/\/:path\*/g, '(?:/.*)?').replace(/\(\.\*\)/g, '.*') + '$'),
  entetes: r.headers
}));
function poserEnTetes(res, chemin) {
  for (const r of REGLES_EN_TETES) if (r.re.test(chemin)) for (const h of r.entetes) res.setHeader(h.key, h.value);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'
};

(async () => {
  const db = await baseNeuve();
  const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'tests', 'catalogue-2026-10-02.json'), 'utf8'));
  await db.exec(catalogueVersSql(catalogue).sql);
  /* BANC_SANTE=1 : le banc se comporte comme la production du 24 au 27/10/2026 — la dernière
     sauvegarde réussie date de 40 heures, la suivante a échoué, et l'envoi d'e-mail est refusé.
     Sert à voir à l'écran les bandeaux d'alerte du tableau de bord. */
  if (SANTE) {
    await db.exec(`insert into sauvegardes (faite_le, octets, envoyee, erreur) values
      (now() - interval '40 hours', 1000, true, null),
      (now() - interval '3 hours', 1200, false, 'Resend 403 This API key is not authorized to send emails from cineworldacademie.com')`);
  }
  const api = creerGestionnaire(() => db, {
    envoyer: async m => {
      console.log('[e-mail non envoyé]', m.sujet);
      return SANTE ? { envoye: false, erreur: 'Resend 403 (banc)' } : { envoye: true, erreur: null };
    },
    admin: { lireUtilisateur: async j => (j === JETON ? { email: 'admin@banc.test' } : null) }
  });

  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://banc');
    console.log(req.method, req.url);
    poserEnTetes(res, url.pathname);

    // Faux Supabase Auth : toute connexion réussit, avec un jeton du banc
    if (url.pathname === '/auth/v1/token') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ access_token: JETON, refresh_token: 'renouvellement-banc', expires_in: 3600 }));
    }
    if (url.pathname === '/auth/v1/logout') { res.statusCode = 204; return res.end(); }

    if (url.pathname === '/api') {
      /* PAYS_IP=KM npm run banc : le banc se fait passer pour Vercel, qui joint
         à chaque requête le pays de l'adresse IP (--pays=KM). Sans lui, le visiteur n'est
         reconnu nulle part : c'est le cas de la localisation. */
      if (PAYS_IP) req.headers['x-vercel-ip-country'] = PAYS_IP;
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

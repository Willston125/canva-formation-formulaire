/* Calcule la musique et les bruitages d'un montage (son/musique.js), dans la
 * page video.html, pour qu'ils suivent exactement ses repères.
 *
 *   node publicite/presentation/son/composer.js            → montages 40 et 15
 *   node publicite/presentation/son/composer.js --montage 40
 *
 * Écrit son/rendus/musique-<montage>.wav et bruitages-<montage>.wav. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { lancerChrome } = require('../outils/chrome');

const ICI = path.resolve(__dirname, '..');
const RACINE = path.resolve(ICI, '..', '..');
const SORTIE = path.join(__dirname, 'rendus');

function servir() {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webp': 'image/webp' };
  return new Promise(resoudre => {
    const s = http.createServer((req, res) => {
      const chemin = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(chemin).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resoudre(s));
  });
}

async function composer(montages) {
  fs.mkdirSync(SORTIE, { recursive: true });
  const serveur = await servir();
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome({ largeur: 1080, hauteur: 1920 });
  await chrome.envoyer('Page.enable');
  try {
    for (const montage of montages) {
      const charge = chrome.attendre('Page.loadEventFired', 60000);
      await chrome.envoyer('Page.navigate', { url: `${base}/publicite/presentation/video.html?capture=1&format=9x16&montage=${montage}` });
      await charge;
      await chrome.evaluer('window.pret');
      await chrome.evaluer(fs.readFileSync(path.join(__dirname, 'musique.js'), 'utf8'));
      for (const partie of ['musique', 'bruitages']) {
        const b64 = await chrome.evaluer(`fabriquerSon({ partie: '${partie}' })`);
        const fichier = path.join(SORTIE, `${partie}-${montage}.wav`);
        fs.writeFileSync(fichier, Buffer.from(b64, 'base64'));
        console.log('  ' + path.relative(RACINE, fichier));
      }
    }
  } finally {
    chrome.fermer();
    serveur.close();
  }
}

module.exports = { composer };

if (require.main === module) {
  const i = process.argv.indexOf('--montage');
  const montages = i > 0 ? [process.argv[i + 1]] : ['40', '15'];
  composer(montages).catch(e => { console.error(e); process.exitCode = 1; });
}

/* Les captures du site qui entrent dans la vidéo (le parcours : choisir une
 * formation, découvrir son programme, accéder à l'inscription).
 *
 *   node publicite/presentation/outils/capturer-site.js              → refait les captures (medias/site/)
 *   node publicite/presentation/outils/capturer-site.js --explorer   → pages entières, pour repérer les cadrages
 *   node publicite/presentation/outils/capturer-site.js --photos     → recharge les photos du site (une fois)
 *
 * LE SITE EST SERVI EN LOCAL, PAS VISITÉ EN LIGNE. Ses fichiers sont ceux du
 * dépôt ; l'API est remplacée par un relevé du catalogue réel
 * (site/catalogue-2026-10-10.json, lu sur www.impactali.site le 10/10/2026,
 * numéros retirés). Ainsi :
 *   - aucune visite, aucune mesure d'audience, aucun envoi ne part vers le site ;
 *   - le formulaire reste vide : aucune donnée personnelle ne peut apparaître ;
 *   - aucun numéro de téléphone n'existe dans les données servies.
 * Seule exception, avec --photos : les photos téléversées dans le tableau de
 * bord (/api?photo=…) sont lues une fois sur le site et gardées dans site/photos/.
 *
 * Pour un catalogue plus récent : remplacer le relevé (même forme que la
 * réponse de /api?action=catalogue), puis relancer ce script. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { lancerChrome } = require('./chrome');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const ICI = path.resolve(__dirname, '..');
const RELEVE = path.join(ICI, 'site', 'catalogue-2026-10-10.json');
const PHOTOS = path.join(ICI, 'site', 'photos');
const SORTIE = path.join(ICI, 'medias', 'site');
const EXPLORATION = path.join(ICI, 'rendus', 'exploration-site');

const args = process.argv.slice(2);
const EXPLORER = args.includes('--explorer');
const RECHARGER_PHOTOS = args.includes('--photos');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.json': 'application/json'
};

// ------------------------------------------------------- serveur local ----

async function photo(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const fichier = path.join(PHOTOS, id);
  if (fs.existsSync(fichier)) return fs.readFileSync(fichier);
  if (!RECHARGER_PHOTOS) return null;
  const r = await fetch('https://www.impactali.site/api?photo=' + id, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const octets = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(PHOTOS, { recursive: true });
  fs.writeFileSync(fichier, octets);
  return octets;
}

function servir() {
  const releve = fs.readFileSync(RELEVE, 'utf8');
  return new Promise(resoudre => {
    const serveur = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api' || url.pathname === '/api/') {
        if (req.method !== 'GET') { res.statusCode = 204; return res.end(); } // mesures, inscriptions : jamais transmises
        const id = url.searchParams.get('photo');
        if (id) {
          const octets = await photo(id);
          if (!octets) { res.statusCode = 404; return res.end(); }
          res.setHeader('Content-Type', 'image/webp');
          return res.end(octets);
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(releve);
      }
      let chemin = path.join(RACINE, decodeURIComponent(url.pathname));
      if (fs.existsSync(chemin) && fs.statSync(chemin).isDirectory()) chemin = path.join(chemin, 'index.html');
      if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(chemin).pipe(res);
    });
    serveur.listen(0, '127.0.0.1', () => resoudre(serveur));
  });
}

// ---------------------------------------------------------- la page ----

/* Un téléphone courant : 390 × 844 points, trois pixels par point — les
   captures restent nettes une fois agrandies dans la vidéo. */
const TELEPHONE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

/* Ce qui ne se photographie pas : les apparitions au défilement (figées à
   leur état final), les animations, le curseur de saisie, la fenêtre
   d'annonce. */
const CSS_CAPTURE = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }
  .reveal-on-scroll { opacity: 1 !important; transform: none !important; }
  html { scroll-behavior: auto !important; }
`;

/* Rien ne sort de la machine : toute requête qui ne vise pas le serveur local
   (vidéos YouTube de la section « En classe », Google, mesures Vercel…) est
   refusée avant de partir. */
async function isoler(chrome, base) {
  chrome.ecouteurs.push(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const local = m.params.request.url.startsWith(base) || m.params.request.url.startsWith('data:');
    chrome.envoyer(local ? 'Fetch.continueRequest' : 'Fetch.failRequest',
      local ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => null);
  });
  await chrome.envoyer('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
}

async function ouvrir(chrome, adresse, dpr = TELEPHONE.deviceScaleFactor) {
  console.log('  page', adresse.replace(/^http:\/\/[^/]+/, ''));
  await chrome.envoyer('Emulation.setDeviceMetricsOverride', { ...TELEPHONE, deviceScaleFactor: dpr });
  await chrome.envoyer('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await chrome.envoyer('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'
  });
  const charge = chrome.attendre('Page.loadEventFired');
  await chrome.envoyer('Page.navigate', { url: adresse });
  await charge;
  await chrome.evaluer(`(async () => {
    const s = document.createElement('style'); s.textContent = ${JSON.stringify(CSS_CAPTURE)}; document.head.appendChild(s);
    await document.fonts.ready;
    // Le catalogue arrive de l'API locale : on laisse la page le poser
    await new Promise(r => setTimeout(r, 1200));
    // Les images paresseuses : on parcourt la page pour qu'elles se chargent
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    const delai = ms => new Promise(r => setTimeout(r, ms));
    await Promise.race([Promise.all([...document.images].map(i => i.decode().catch(() => null))), delai(5000)]);
    await delai(400);
    return true;
  })()`);
}

async function pageEntiere(chrome, fichier) {
  const { cssContentSize } = await chrome.envoyer('Page.getLayoutMetrics');
  const { data } = await chrome.envoyer('Page.captureScreenshot', {
    format: 'jpeg', quality: 80, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: TELEPHONE.width, height: Math.ceil(cssContentSize.height), scale: 1 }
  });
  fs.writeFileSync(fichier, Buffer.from(data, 'base64'));
  console.log('  ', path.relative(RACINE, fichier), Math.ceil(cssContentSize.height) + ' px');
}

/** Une zone de la page, en PNG, à la pleine définition du téléphone. */
async function zone(chrome, fichier, { x = 0, y, largeur = TELEPHONE.width, hauteur }) {
  const { data } = await chrome.envoyer('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x, y, width: largeur, height: hauteur, scale: 1 }
  });
  fs.writeFileSync(fichier, Buffer.from(data, 'base64'));
  console.log('  ', path.relative(RACINE, fichier));
}

// ---------------------------------------------------------- tournage ----

(async () => {
  const serveur = await servir();
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome({ largeur: 390, hauteur: 844 });
  await chrome.envoyer('Page.enable');
  await isoler(chrome, base);
  try {
    if (EXPLORER) {
      fs.mkdirSync(EXPLORATION, { recursive: true });
      for (const [nom, adresse] of [['accueil', '/'], ['fiche-canva-pro', '/formations/canva-pro/'], ['inscription', '/inscription/?formation=canva-pro']]) {
        await ouvrir(chrome, base + adresse, 1);
        await pageEntiere(chrome, path.join(EXPLORATION, nom + '.jpg'));
      }
      return;
    }
    fs.mkdirSync(SORTIE, { recursive: true });
    const CAPTURES = require('./cadrages-site.js');
    const seules = args.includes('--seul') ? String(args[args.indexOf('--seul') + 1]).split(',') : null;
    const releves = {};
    const tousReperes = {};
    for (const c of CAPTURES) {
      if (seules && !seules.includes(c.nom)) continue;
      await ouvrir(chrome, base + c.adresse);
      if (c.avant) await chrome.evaluer(`(() => { ${c.avant} })()`);
      await chrome.evaluer('new Promise(r => setTimeout(r, 150))');
      const cadre = await chrome.evaluer(c.zone);
      if (!cadre || !(cadre.largeur > 0) || !(cadre.hauteur > 0)) throw new Error('Zone introuvable : ' + c.nom);
      await zone(chrome, path.join(SORTIE, c.nom + '.png'), cadre);
      /* Les repères (boutons, titres) : leur place DANS la capture, en pixels
         de l'image, pour que la vidéo anime l'appui et le contour au bon endroit. */
      const dpr = TELEPHONE.deviceScaleFactor;
      const reperes = { largeur: Math.round(cadre.largeur * dpr), hauteur: Math.round(cadre.hauteur * dpr) };
      for (const [cle, sel] of Object.entries(c.reperes || {})) {
        const b = await chrome.evaluer(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? __boite(el) : null; })()`);
        if (!b) throw new Error(`Repère introuvable (${c.nom}) : ${sel}`);
        reperes[cle] = { x: Math.round((b.x - cadre.x) * dpr), y: Math.round((b.y - cadre.y) * dpr), l: Math.round(b.largeur * dpr), h: Math.round(b.hauteur * dpr) };
      }
      tousReperes[c.nom] = reperes;
      // Ce que contient la zone, pour vérifier qu'aucun numéro, montant ou date n'y figure
      releves[c.nom] = await chrome.evaluer(`(() => {
        const z = ${JSON.stringify(cadre)};
        const vus = [];
        const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (marcheur.nextNode()) {
          const n = marcheur.currentNode; const t = n.textContent.trim();
          if (!t || !n.parentElement || n.parentElement.closest('[hidden]')) continue;
          const st = getComputedStyle(n.parentElement); if (st.display === 'none' || st.visibility === 'hidden') continue;
          const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
          const y = b.top + scrollY, x = b.left + scrollX;
          if (b.width && y + b.height > z.y && y < z.y + z.hauteur && x + b.width > z.x && x < z.x + z.largeur) vus.push(t);
        }
        return vus.join(' | ');
      })()`);
    }
    fs.writeFileSync(path.join(SORTIE, 'textes-visibles.json'), JSON.stringify(releves, null, 1));
    // Lu par video.html (une simple affectation : la page l'inclut par une balise <script>)
    fs.writeFileSync(path.join(SORTIE, 'reperes.js'), '/* Écrit par outils/capturer-site.js — ne pas modifier à la main. */\nwindow.REPERES_SITE = ' + JSON.stringify(tousReperes, null, 1) + ';\n');
    // Garde-fou : un numéro de téléphone, un montant, une date ou un indicatif dans une capture arrête tout
    const interdits = /\+\d{3}|\b\d{3}\s?\d{2}\s?\d{2}\b|\bKMF\b|\bFDJ\b|\b\d{1,2}\s(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/i;
    for (const [nom, texte] of Object.entries(releves)) {
      if (interdits.test(texte)) throw new Error(`Capture « ${nom} » : contenu propre à un pays ou à une date → ${texte.match(interdits)[0]}`);
    }
    console.log('  contrôle : aucun numéro, montant, indicatif ni date dans les captures');
  } finally {
    chrome.fermer();
    serveur.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

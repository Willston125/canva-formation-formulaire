/* Le tournage : video.html filmée image par image par Chrome sans fenêtre,
 * encodée par ffmpeg. L'IMAGE seulement — le son et les sous-titres sont
 * posés ensuite par assembler.js, sans refilmer.
 *
 *   node publicite/presentation/rendre.js                          → les 3 versions (40 s 9:16, 15 s 9:16, 40 s 4:5)
 *   node publicite/presentation/rendre.js --version 40-9x16        → une seule (40-9x16, 15-9x16, 40-4x5)
 *   node publicite/presentation/rendre.js --images 2.4,8.5,37      → images fixes de contrôle (rendus/apercu/)
 *   node publicite/presentation/rendre.js --flou                   → flou de mouvement (4 sous-images, 4 × plus long)
 *   node publicite/presentation/rendre.js --couverture             → les miniatures de couverture
 *
 * Chaque version produit deux fichiers dans rendus/ :
 *   <version>_image.mp4   l'image, sans sous-titres (qualité de travail, quasi sans perte) ;
 *   <version>_st.mov      les sous-titres incrustés seuls, sur fond transparent.
 *
 * Rien ne sort de la machine : la page est servie en local et toute requête
 * vers l'extérieur est refusée. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { lancerChrome } = require('./outils/chrome');

const ICI = __dirname;
const RACINE = path.resolve(ICI, '..', '..');
const SORTIE = path.join(ICI, 'rendus');
const CADENCE = 30;
const VERSIONS = {
  '40-9x16': { montage: '40', format: '9x16', largeur: 1080, hauteur: 1920 },
  '15-9x16': { montage: '15', format: '9x16', largeur: 1080, hauteur: 1920 },
  '40-4x5': { montage: '40', format: '4x5', largeur: 1080, hauteur: 1350 }
};

// ------------------------------------------------------------ arguments ----

const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf('--' + nom); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const CHOIX = option('version') && option('version') !== true ? String(option('version')).split(',') : Object.keys(VERSIONS);
const IMAGES = option('images') && option('images') !== true ? String(option('images')).split(',').map(Number) : null;
const FLOU = args.includes('--flou');
const COUVERTURE = args.includes('--couverture');
const SANS_ST = args.includes('--sans-st');
const SEULEMENT_ST = args.includes('--seulement-st');
const AVEC_ST_IMAGES = args.includes('--avec-st');
for (const v of CHOIX) if (!VERSIONS[v]) throw new Error('Version inconnue : ' + v + ' (connues : ' + Object.keys(VERSIONS).join(', ') + ')');

// ------------------------------------------------------- serveur local ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json'
};
function servir() {
  return new Promise(resoudre => {
    const serveur = http.createServer((req, res) => {
      const chemin = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader('Content-Type', TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(chemin).pipe(res);
    });
    serveur.listen(0, '127.0.0.1', () => resoudre(serveur));
  });
}

async function isoler(chrome, base) {
  chrome.ecouteurs.push(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const local = m.params.request.url.startsWith(base) || m.params.request.url.startsWith('data:');
    chrome.envoyer(local ? 'Fetch.continueRequest' : 'Fetch.failRequest',
      local ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => null);
  });
  await chrome.envoyer('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
}

async function ouvrir(chrome, adresse, { largeur, hauteur, transparent = false }) {
  await chrome.envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false });
  await chrome.envoyer('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  const charge = chrome.attendre('Page.loadEventFired', 60000);
  await chrome.envoyer('Page.navigate', { url: adresse });
  await charge;
  await chrome.evaluer('window.pret');
}

async function capturer(chrome, t, format = 'jpeg') {
  await chrome.evaluer(`rendre(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const parametres = format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 96 };
  const { data } = await chrome.envoyer('Page.captureScreenshot', parametres);
  return Buffer.from(data, 'base64');
}

// ------------------------------------------------------------ ffmpeg ----

function ffmpeg(arguments_) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...arguments_], { stdio: ['pipe', 'inherit', 'inherit'] });
  const fini = new Promise((resoudre, rejeter) => p.on('exit', code => (code === 0 ? resoudre() : rejeter(new Error('ffmpeg a échoué (' + code + ')')))));
  return { entree: p.stdin, fini };
}

async function ecrire(flux, tampon) {
  if (!flux.write(tampon)) await new Promise(r => flux.once('drain', r));
}

// ------------------------------------------------------------ tournage ----

async function tournerImage(chrome, base, nom, v) {
  await ouvrir(chrome, `${base}/publicite/presentation/video.html?capture=1&format=${v.format}&montage=${v.montage}${IMAGES && AVEC_ST_IMAGES ? '&st=1' : ''}`, v);
  const duree = await chrome.evaluer('window.DUREE');

  if (IMAGES) {
    const dossier = path.join(SORTIE, 'apercu');
    fs.mkdirSync(dossier, { recursive: true });
    for (const t of IMAGES) {
      if (t > duree) continue;
      const fichier = path.join(dossier, `${nom}-${t.toFixed(2)}.png`);
      fs.writeFileSync(fichier, await capturer(chrome, t, 'png'));
      console.log('  image', path.relative(RACINE, fichier));
    }
    return;
  }

  /* Flou de mouvement : quatre sous-images par image, réparties sur une
     demi-image (obturateur à 180°, comme une caméra), moyennées par ffmpeg.
     Une image immobile est identique dans ses quatre sous-images : le flou ne
     touche que ce qui bouge, les textes posés restent nets. */
  const sous = FLOU ? 4 : 1;
  const images = Math.round(duree * CADENCE);
  const sortie = path.join(SORTIE, `${nom}_image.mp4`);
  // Captures JPEG = plage complète, matrice BT.601 → vidéo BT.709 plage TV
  const couleurs = 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709';
  const filtre = (FLOU ? `tmix=frames=${sous},select='eq(mod(n\\,${sous})\\,${sous - 1})',setpts=N/(${CADENCE}*TB),` : '') + couleurs;
  const encodeur = ffmpeg([
    '-y', '-f', 'image2pipe', '-framerate', String(CADENCE * sous), '-c:v', 'mjpeg', '-i', '-',
    '-vf', filtre, '-r', String(CADENCE),
    // Fichier de travail : qualité quasi sans perte (réencodé une seule fois à l'assemblage)
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', sortie
  ]);
  const debut = Date.now();
  for (let i = 0; i < images; i++) {
    for (let k = 0; k < sous; k++) {
      const t = (i + (sous > 1 ? (k / sous) * 0.5 - 0.25 : 0)) / CADENCE;
      await ecrire(encodeur.entree, await capturer(chrome, Math.max(0, t)));
    }
    if (i % 30 === 0) process.stdout.write(`\r  ${nom} : image ${i + 1}/${images} (${Math.round((Date.now() - debut) / 1000)} s)   `);
  }
  encodeur.entree.end();
  await encodeur.fini;
  console.log(`\r  ${nom} : ${images} images en ${Math.round((Date.now() - debut) / 1000)} s → ${path.relative(RACINE, sortie)}          `);
}

/* Les sous-titres incrustés, seuls, sur fond transparent : une piste à
   superposer. Refaite en une minute quand la voix change. */
async function tournerSousTitres(chrome, base, nom, v) {
  await ouvrir(chrome, `${base}/publicite/presentation/video.html?capture=1&calque=st&format=${v.format}&montage=${v.montage}`, { ...v, transparent: true });
  const duree = await chrome.evaluer('window.DUREE');
  const images = Math.round(duree * CADENCE);
  const sortie = path.join(SORTIE, `${nom}_st.mov`);
  const encodeur = ffmpeg([
    '-y', '-f', 'image2pipe', '-framerate', String(CADENCE), '-c:v', 'png', '-i', '-',
    '-c:v', 'qtrle', '-pix_fmt', 'argb', sortie
  ]);
  let precedente = null;
  let signaturePrecedente = null;
  for (let i = 0; i < images; i++) {
    const t = i / CADENCE;
    // Une image n'est refilmée que si les sous-titres ont changé
    const signature = await chrome.evaluer(`rendre(${t}); window.etatSousTitres()`);
    if (signature !== signaturePrecedente || !precedente) {
      precedente = await capturer(chrome, t, 'png');
      signaturePrecedente = signature;
    }
    await ecrire(encodeur.entree, precedente);
  }
  encodeur.entree.end();
  await encodeur.fini;
  console.log(`  ${nom} : sous-titres → ${path.relative(RACINE, sortie)}`);
}

async function tournerCouvertures(chrome, base) {
  const dossier = path.join(SORTIE, 'couverture');
  fs.mkdirSync(dossier, { recursive: true });
  for (const [format, hauteur] of [['9x16', 1920], ['4x5', 1350]]) {
    await ouvrir(chrome, `${base}/publicite/presentation/video.html?capture=1&couverture=1&format=${format}&montage=40`, { largeur: 1080, hauteur });
    const fichier = path.join(dossier, `couverture-${format}.png`);
    fs.writeFileSync(fichier, await capturer(chrome, 0, 'png'));
    console.log('  couverture', path.relative(RACINE, fichier));
  }
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const serveur = await servir();
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome({ largeur: 1080, hauteur: 1920 });
  await chrome.envoyer('Page.enable');
  await chrome.envoyer('Runtime.enable');
  chrome.ecouteurs.push(m => {
    if (m.method === 'Runtime.exceptionThrown') console.error('  [page] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) console.error('  [page] ' + m.params.args.map(a => a.value).join(' '));
  });
  await isoler(chrome, base);
  try {
    if (COUVERTURE) return await tournerCouvertures(chrome, base);
    for (const nom of CHOIX) {
      const v = VERSIONS[nom];
      console.log(`Version ${nom} (${v.largeur} × ${v.hauteur}, ${v.montage} s)`);
      if (!SEULEMENT_ST) await tournerImage(chrome, base, nom, v);
      if (!IMAGES && !SANS_ST) await tournerSousTitres(chrome, base, nom, v);
    }
  } finally {
    chrome.fermer();
    serveur.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

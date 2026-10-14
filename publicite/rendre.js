/* Le rendu de la publicité vidéo : la page video.html, filmée image par image.
 *
 *   node publicite/rendre.js                       → les trois versions, avec et sans musique
 *   node publicite/rendre.js --version km          → une seule version (generique, km, dj)
 *   node publicite/rendre.js --images 1,5.5,13     → quelques images fixes, pour juger le montage
 *   node publicite/rendre.js --flou                → flou de mouvement (4 sous-images par image, 4 × plus long)
 *
 * Chrome tourne sans fenêtre et se pilote par son protocole de débogage : à
 * chaque image, la page reçoit l'instant exact (`rendre(t)`), puis Chrome en
 * fait une capture. Les captures partent directement dans ffmpeg, qui les
 * encode en H.264 — le format que demandent Instagram, Facebook et TikTok. La
 * musique est composée dans la même page (musique.js, synthèse hors temps
 * réel), puis mixée et calée à −14 LUFS, le niveau des réseaux sociaux.
 *
 * Rien ne sort de la machine : la page est servie en local, et seuls les
 * fichiers du dépôt sont lus. */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(__dirname, 'rendus');
const LARGEUR = 1080;
const HAUTEUR = 1920;
const CADENCE = 30;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(c => fs.existsSync(c));

// ------------------------------------------------------------ arguments ----

const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf('--' + nom); return i >= 0 ? (args[i + 1] || true) : null; };
const VERSIONS = option('version') && option('version') !== true ? [option('version')] : ['generique', 'km', 'dj'];
const IMAGES = option('images') && option('images') !== true ? String(option('images')).split(',').map(Number) : null;
const FLOU = args.includes('--flou');
const SANS_MUSIQUE = args.includes('--sans-musique');

// ------------------------------------------------------ serveur local ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
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
      fs.createReadStream(chemin).pipe(res);
    });
    serveur.listen(0, '127.0.0.1', () => resoudre(serveur));
  });
}

// ------------------------------------------------- Chrome, sans fenêtre ----

async function lancerChrome() {
  if (!CHROME) throw new Error('Chrome introuvable sur cette machine.');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'impactali-video-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--window-size=${LARGEUR},${HAUTEUR}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const port = await new Promise((resoudre, rejeter) => {
    let tampon = '';
    const delai = setTimeout(() => rejeter(new Error('Chrome ne répond pas.')), 20000);
    chrome.stderr.on('data', morceau => {
      tampon += morceau;
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(tampon);
      if (m) { clearTimeout(delai); resoudre(Number(m[1])); }
    });
    chrome.on('exit', () => rejeter(new Error('Chrome s’est arrêté au démarrage.')));
  });

  const cibles = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = cibles.find(c => c.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resoudre, rejeter) => { ws.onopen = resoudre; ws.onerror = rejeter; });

  let numero = 0;
  const attentes = new Map();
  const ecouteurs = [];
  ws.onmessage = evenement => {
    const message = JSON.parse(evenement.data);
    if (message.id && attentes.has(message.id)) {
      const { resoudre, rejeter } = attentes.get(message.id);
      attentes.delete(message.id);
      if (message.error) rejeter(new Error(message.error.message));
      else resoudre(message.result);
    } else if (message.method) {
      ecouteurs.forEach(f => f(message));
    }
  };
  const envoyer = (methode, params = {}) => new Promise((resoudre, rejeter) => {
    const id = ++numero;
    attentes.set(id, { resoudre, rejeter });
    ws.send(JSON.stringify({ id, method: methode, params }));
  });
  const evaluer = async (expression) => {
    const r = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Dans la page : ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const fermer = () => {
    try { ws.close(); } catch (e) { /* déjà fermé */ }
    chrome.kill();
    setTimeout(() => fs.rmSync(profil, { recursive: true, force: true }), 1500);
  };
  return { envoyer, evaluer, ecouteurs, fermer };
}

async function ouvrir(chrome, adresse) {
  await chrome.envoyer('Page.enable');
  await chrome.envoyer('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: HAUTEUR, deviceScaleFactor: 1, mobile: false });
  const charge = new Promise(resoudre => chrome.ecouteurs.push(m => { if (m.method === 'Page.loadEventFired') resoudre(); }));
  await chrome.envoyer('Page.navigate', { url: adresse });
  await charge;
  await chrome.evaluer('window.pret');
}

/** L'image à l'instant t, en JPEG. Deux images d'affichage garantissent qu'elle est peinte. */
async function capturer(chrome, t, format = 'jpeg') {
  await chrome.evaluer(`rendre(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const { data } = await chrome.envoyer('Page.captureScreenshot', format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 95 });
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

// ------------------------------------------------------------ rendu ----

let musiqueComposee = false;

async function rendreVersion(chrome, base, version) {
  const adresse = `${base}/publicite/video.html?capture=1&version=${version}`;
  await ouvrir(chrome, adresse);
  const duree = await chrome.evaluer('window.DUREE');

  if (IMAGES) {
    const dossier = path.join(SORTIE, 'apercu');
    fs.mkdirSync(dossier, { recursive: true });
    for (const t of IMAGES) {
      const fichier = path.join(dossier, `${version}-${t.toFixed(2)}.png`);
      fs.writeFileSync(fichier, await capturer(chrome, t, 'png'));
      console.log('  image', fichier);
    }
    return;
  }

  /* Flou de mouvement : quatre sous-images par image, prises sur une moitié
     d'image (obturateur à 180°, comme une caméra), puis moyennées. */
  const sous = FLOU ? 4 : 1;
  const images = Math.round(duree * CADENCE);
  const muette = path.join(SORTIE, `impactali-pub-${version}-muette.mp4`);
  /* Les captures sont des JPEG : couleurs en plage complète, matrice BT.601.
     La vidéo, elle, doit être en plage TV et BT.709 — sinon une partie des
     lecteurs l'affiche délavée, ou les noirs bouchés. */
  const couleurs = 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709';
  const filtre = ['-vf', (FLOU ? `tmix=frames=${sous},select='eq(mod(n\\,${sous})\\,${sous - 1})',setpts=N/(${CADENCE}*TB),` : '') + couleurs];
  const encodeur = ffmpeg([
    '-y', '-f', 'image2pipe', '-framerate', String(CADENCE * sous), '-c:v', 'mjpeg', '-i', '-',
    ...filtre,
    '-r', String(CADENCE), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-profile:v', 'high', '-level:v', '4.2', '-movflags', '+faststart', muette
  ]);

  const debut = Date.now();
  for (let i = 0; i < images; i++) {
    for (let k = 0; k < sous; k++) {
      const t = (i + (k / sous) * 0.5) / CADENCE;
      await ecrire(encodeur.entree, await capturer(chrome, t));
    }
    if (i % 60 === 0) process.stdout.write(`\r  ${version} : image ${i + 1}/${images}`);
  }
  encodeur.entree.end();
  await encodeur.fini;
  console.log(`\r  ${version} : ${images} images en ${Math.round((Date.now() - debut) / 1000)} s → ${path.relative(RACINE, muette)}`);

  if (SANS_MUSIQUE) return;
  /* Composée une fois par rendu, jamais reprise d'un rendu précédent : une
     musique modifiée dans musique.js doit s'entendre dès le rendu suivant. */
  const musique = path.join(SORTIE, 'musique.wav');
  if (!musiqueComposee) {
    await chrome.evaluer(fs.readFileSync(path.join(__dirname, 'musique.js'), 'utf8'));
    const base64 = await chrome.evaluer(`fabriquerMusique(${duree})`);
    fs.writeFileSync(musique, Buffer.from(base64, 'base64'));
    musiqueComposee = true;
    console.log('  musique composée →', path.relative(RACINE, musique));
  }
  const finale = path.join(SORTIE, `impactali-pub-${version}.mp4`);
  const mixage = ffmpeg([
    '-y', '-i', muette, '-i', musique, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', finale
  ]);
  mixage.entree.end();
  await mixage.fini;
  console.log('  avec musique →', path.relative(RACINE, finale));
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const serveur = await servir();
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome();
  try {
    for (const version of VERSIONS) {
      console.log(`Version « ${version} »`);
      await rendreVersion(chrome, base, version);
    }
  } finally {
    chrome.fermer();
    serveur.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

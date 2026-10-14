/* Le spot IMPACTALI (35 s) : spot.html filmé image par image, mixé avec sa musique (son.js).
 *
 *   node publicite/spot/rendre.js                    → les deux formats, 16:9 et 9:16 (≈ 30 min)
 *   node publicite/spot/rendre.js --format 9x16      → un seul format (16x9 ou 9x16)
 *   node publicite/spot/rendre.js --images 3,8.2,31  → quelques images fixes, pour juger un plan
 *   node publicite/spot/rendre.js --sans-flou        → sans flou de mouvement (4 × plus rapide, pour un essai)
 *   node publicite/spot/rendre.js --son              → seulement la musique
 *
 * Avant le tournage, les médias sont réunis dans spot/medias/ (hors git, le dépôt est
 * public) : les photos des formations et le portrait détouré (campagne/medias, faits par
 * campagne/retouche.js), le logo officiel rogné, deux captures du site (présentation) et
 * un certificat modèle « Votre nom », sans lieu ni date (certificat/, hors git).
 *
 * Chrome tourne sans fenêtre : à chaque image, la page reçoit l'instant exact (rendre(t)),
 * puis Chrome en fait une capture. Quatre captures par image, prises sur une demi-image
 * (obturateur à 180°), sont moyennées par ffmpeg : c'est le flou de mouvement d'une caméra.
 * La musique est calculée dans la même page, calée sur les mêmes repères, puis amenée à
 * −14 LUFS (le niveau des réseaux sociaux) en deux passes, sans compression ajoutée.
 *
 * Sortie : publicite/rendus/spot/ (IMPACTALI_Spot_35s_16x9.mp4, …_9x16.mp4, couvertures). */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));

const RACINE = path.resolve(__dirname, '../..');
const MEDIAS = path.join(__dirname, 'medias');
const SORTIE = path.join(RACINE, 'publicite', 'rendus', 'spot');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(c => fs.existsSync(c));

const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf('--' + nom); return i >= 0 ? args[i + 1] : null; };
const TAILLES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const FORMATS = option('format') ? [option('format')] : Object.keys(TAILLES);
const IMAGES = option('images') ? option('images').split(',').map(Number) : null;
const FLOU = !args.includes('--sans-flou');
const SON_SEUL = args.includes('--son');
if (FORMATS.some(f => !TAILLES[f])) throw new Error('--format : 16x9 ou 9x16');

// ------------------------------------------------------------ médias ----

const SOURCES = {
  'canva-pro.jpg': 'publicite/campagne/medias/canva-pro.jpg',
  'identite-visuelle.jpg': 'publicite/campagne/medias/identite-visuelle.jpg',
  'marketing-digital.jpg': 'publicite/campagne/medias/marketing-digital.jpg',
  'ia-appliquee.jpg': 'publicite/campagne/medias/ia-appliquee.jpg',
  'photo-video.jpg': 'publicite/campagne/medias/photo-video.jpg',
  'portrait-detoure.png': 'publicite/campagne/medias/portrait-detoure.png',
  'site-accueil.png': 'publicite/presentation/medias/site/accueil-ecran.png',
  'site-carte.png': 'publicite/presentation/medias/site/catalogue-carte.png'
};
const LOGO = { source: 'publicite/medias/logo-vert.png', largeur: 869, hauteur: 482 }; // rogné ; voir LOGO dans spot.html

/* Refaire un fichier seulement si une de ses sources est plus récente : deux tournages lancés
   l'un après l'autre ne réécrivent pas une image que le premier est en train de lire. */
const perime = (cible, ...sources) => !fs.existsSync(cible) || sources.some(s => fs.statSync(s).mtimeMs > fs.statSync(cible).mtimeMs);

async function reunirMedias(chrome, base) {
  fs.mkdirSync(MEDIAS, { recursive: true });
  for (const [nom, source] of Object.entries(SOURCES)) {
    const chemin = path.join(RACINE, source);
    if (!fs.existsSync(chemin)) {
      throw new Error(`Il manque ${source}` + (source.includes('campagne/medias') ? ' : lancez d’abord node publicite/campagne/retouche.js' : ''));
    }
    if (perime(path.join(MEDIAS, nom), chemin)) fs.copyFileSync(chemin, path.join(MEDIAS, nom));
  }
  const logo = path.join(MEDIAS, 'logo.png');
  if (perime(logo, path.join(RACINE, LOGO.source))) await sharp(path.join(RACINE, LOGO.source)).trim({ threshold: 1 }).png().toFile(logo);
  const { width, height } = await sharp(logo).metadata();
  if (width !== LOGO.largeur || height !== LOGO.hauteur) {
    throw new Error(`Le logo rogné fait ${width} × ${height} : mettez à jour LOGO dans spot.html et dans rendre.js.`);
  }
  await rendreCertificat(chrome, base);
}

/* Le certificat modèle : « Votre nom », ni lieu, ni date, ni numéro (le spot est générique). */
async function rendreCertificat(chrome, base) {
  const fichier = path.join(MEDIAS, 'certificat.png');
  const modele = path.join(RACINE, 'certificat/outils/certificat.html');
  if (!fs.existsSync(modele)) {
    if (fs.existsSync(fichier)) return console.log('  certificat : modèle absent, je garde medias/certificat.png');
    throw new Error('Il manque certificat/outils/certificat.html (le modèle, hors git).');
  }
  if (!perime(fichier, modele, __filename)) return;
  const champs = {
    nom: 'Votre nom', formation: 'Canva Pro & Création de contenu',
    details: '6 séances · 12 heures · Projet final validé', lieudate: '', numero: ''
  };
  await chrome.naviguer(`${base}/certificat/outils/certificat.html?theme=sombre&capture=1`, 1123, 794, 2);
  await chrome.evaluer('window.pret');
  await chrome.evaluer(`(() => { const c = ${JSON.stringify(champs)}; for (const [k, v] of Object.entries(c)) { const t = document.querySelector('[data-champ="' + k + '"] .t'); if (t) t.textContent = v; } return true; })()`);
  await chrome.evaluer('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const boite = await chrome.evaluer(`(() => { const r = document.getElementById('page').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
  fs.writeFileSync(fichier, await capture(chrome, { format: 'png', clip: { ...boite, scale: 1 } }));
}

// ------------------------------------------------------ serveur local ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};
function servir() {
  return new Promise(resoudre => {
    const serveur = http.createServer((req, res) => {
      const chemin = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(chemin).pipe(res);
    });
    serveur.listen(0, '127.0.0.1', () => resoudre(serveur));
  });
}

// ------------------------------------------------- Chrome, sans fenêtre ----

async function lancerChrome() {
  if (!CHROME) throw new Error('Chrome introuvable sur cette machine.');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'impactali-spot-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=1920,1920', 'about:blank'
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
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(c => c.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resoudre, rejeter) => { ws.onopen = resoudre; ws.onerror = rejeter; });
  let numero = 0;
  const attentes = new Map();
  let surChargement = null;
  ws.onmessage = evenement => {
    const message = JSON.parse(evenement.data);
    if (message.id && attentes.has(message.id)) {
      const { resoudre, rejeter } = attentes.get(message.id);
      attentes.delete(message.id);
      if (message.error) rejeter(new Error(message.error.message)); else resoudre(message.result);
    } else if (message.method === 'Page.loadEventFired' && surChargement) { const f = surChargement; surChargement = null; f(); }
  };
  const envoyer = (methode, params = {}) => new Promise((resoudre, rejeter) => {
    const id = ++numero;
    attentes.set(id, { resoudre, rejeter });
    ws.send(JSON.stringify({ id, method: methode, params }));
  });
  const evaluer = async expression => {
    const r = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Dans la page : ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const naviguer = async (adresse, largeur, hauteur, echelle = 1) => {
    await envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: echelle, mobile: false });
    const charge = new Promise(resoudre => { surChargement = resoudre; });
    await envoyer('Page.navigate', { url: adresse });
    await charge;
  };
  const fermer = () => { try { ws.close(); } catch (e) { /* déjà fermé */ } chrome.kill(); setTimeout(() => fs.rmSync(profil, { recursive: true, force: true }), 1500); };
  await envoyer('Page.enable');
  return { envoyer, evaluer, naviguer, fermer };
}
const capture = async (chrome, params) => Buffer.from((await chrome.envoyer('Page.captureScreenshot', params)).data, 'base64');

/** L'image à l'instant t. Deux images d'affichage garantissent qu'elle est peinte. */
async function image(chrome, t, format = 'jpeg') {
  await chrome.evaluer(`rendre(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  return capture(chrome, format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 95 });
}

async function ouvrirSpot(chrome, base, format) {
  const [l, h] = TAILLES[format];
  await chrome.naviguer(`${base}/publicite/spot/spot.html?capture=1&format=${format}`, l, h);
  await chrome.evaluer('window.pret');
  const manquantes = await chrome.evaluer('window.IMAGES_MANQUANTES');
  if (manquantes.length) throw new Error('Images introuvables : ' + manquantes.join(', '));
  return { duree: await chrome.evaluer('window.DUREE'), ips: await chrome.evaluer('window.IPS') };
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

// ------------------------------------------------------------ musique ----

/* Calculée dans la page (son.js), puis amenée à −14 LUFS : une passe pour mesurer, une
   pour corriger d'un gain constant (linear=true). Si le gain ferait dépasser −1,5 dBTP,
   ffmpeg passe de lui-même en mode dynamique, et le journal le dit. */
async function composer(chrome) {
  // un nom par tournage : deux tournages lancés en même temps (un par format) ne se marchent pas dessus
  const brut = path.join(SORTIE, `_bande-son-${FORMATS.join('-')}.wav`);
  const base64 = await chrome.evaluer('fabriquerBandeSon(window.DUREE, window.REPERES)');
  fs.writeFileSync(brut, Buffer.from(base64, 'base64'));
  const cible = 'I=-14:TP=-1.5:LRA=11';
  const mesure = spawnSync('ffmpeg', ['-hide_banner', '-i', brut, '-af', `loudnorm=${cible}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(mesure.stderr)[0]);
  const norme = brut.replace('.wav', '-14lufs.wav');
  const seconde = spawnSync('ffmpeg', ['-hide_banner', '-y', '-i', brut, '-af',
    `loudnorm=${cible}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json,aresample=48000`,
    '-c:a', 'pcm_s16le', norme], { encoding: 'utf8' });
  if (seconde.status !== 0) throw new Error('ffmpeg (loudnorm) : ' + seconde.stderr.slice(-400));
  const r = JSON.parse(/\{[^{}]*"output_i"[^{}]*\}/.exec(seconde.stderr)[0]);
  console.log(`  musique : ${m.input_i} LUFS → ${r.output_i} LUFS, crête ${r.output_tp} dBTP (${r.normalization_type})`);
  fs.rmSync(brut, { force: true });
  return norme;
}

// ------------------------------------------------------------ tournage ----

async function tourner(chrome, base, format, musique) {
  const { duree, ips } = await ouvrirSpot(chrome, base, format);

  if (IMAGES) {
    const dossier = path.join(SORTIE, 'apercu');
    fs.mkdirSync(dossier, { recursive: true });
    for (const t of IMAGES) {
      const fichier = path.join(dossier, `${format}-${t.toFixed(2)}.png`);
      fs.writeFileSync(fichier, await image(chrome, t, 'png'));
      console.log('  image', path.relative(RACINE, fichier));
    }
    return;
  }

  const sous = FLOU ? 4 : 1;
  const n = Math.round(duree * ips);
  const muette = path.join(SORTIE, `_image-${format}.mp4`);
  /* Les captures sont des JPEG : plage complète, matrice BT.601. La vidéo doit être en plage
     TV et BT.709, sinon une partie des lecteurs l'affiche délavée ou les noirs bouchés. */
  const couleurs = 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709';
  const vf = (FLOU ? `tmix=frames=${sous},select='eq(mod(n\\,${sous})\\,${sous - 1})',setpts=N/(${ips}*TB),` : '') + couleurs;
  const encodeur = ffmpeg([
    '-y', '-f', 'image2pipe', '-framerate', String(ips * sous), '-c:v', 'mjpeg', '-i', '-',
    '-vf', vf, '-r', String(ips), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'film', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-profile:v', 'high', '-level:v', '4.2', '-movflags', '+faststart', muette
  ]);
  const debut = Date.now();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < sous; k++) await ecrire(encodeur.entree, await image(chrome, (i + (k / sous) * 0.5) / ips));
    if (i % 24 === 0) {
      const ecoule = (Date.now() - debut) / 1000, reste = i ? ecoule / i * (n - i) : 0;
      process.stdout.write(`\r  ${format} : image ${i + 1}/${n}, encore ≈ ${Math.ceil(reste / 60)} min   `);
    }
  }
  encodeur.entree.end();
  await encodeur.fini;
  console.log(`\r  ${format} : ${n} images en ${Math.round((Date.now() - debut) / 60000)} min                    `);

  const finale = path.join(SORTIE, `IMPACTALI_Spot_35s_${format}.mp4`);
  const mixage = ffmpeg([
    '-y', '-i', muette, '-i', musique, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', finale
  ]);
  mixage.entree.end();
  await mixage.fini;
  fs.rmSync(muette, { force: true });
  console.log('  →', path.relative(RACINE, finale));

  // une version légère (720p) pour WhatsApp et l'envoi sur données mobiles
  const legere = finale.replace('.mp4', '_leger.mp4');
  const [l, h] = TAILLES[format].map(v => Math.round(v * 2 / 3));
  const compression = ffmpeg([
    '-y', '-i', finale, '-vf', `scale=${l}:${h}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-profile:v', 'high', '-level:v', '4.0', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', legere
  ]);
  compression.entree.end();
  await compression.fini;
  console.log('  →', path.relative(RACINE, legere));

  // la couverture : le logo, le slogan et l'adresse, tout en place
  const couverture = path.join(SORTIE, `couverture-${format}.jpg`);
  await sharp(await image(chrome, 33.6, 'png')).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(couverture);
  console.log('  →', path.relative(RACINE, couverture));
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const serveur = await servir();
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome();
  try {
    console.log('Médias');
    await reunirMedias(chrome, base);
    let musique = null;
    if (!IMAGES) {
      await ouvrirSpot(chrome, base, FORMATS[0]);
      musique = await composer(chrome);
      if (SON_SEUL) {
        const fichier = path.join(SORTIE, 'IMPACTALI_Spot_musique.wav');
        fs.renameSync(musique, fichier);
        return console.log('  →', path.relative(RACINE, fichier));
      }
    }
    for (const format of FORMATS) {
      console.log(`Format ${format}${FLOU || IMAGES ? '' : ' (sans flou de mouvement)'}`);
      await tourner(chrome, base, format, musique);
    }
    if (musique) fs.rmSync(musique, { force: true });
  } finally {
    chrome.fermer();
    serveur.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

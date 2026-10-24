/* Fabrique les fichiers de marque Cineworld Académie depuis le sceau source.
 *
 *   node scripts/marque/generer.js [chemin/vers/le/sceau.png]
 *
 * Source par défaut : scripts/marque/sceau-source.png, le sceau tel que le
 * publiait l'ancien site cineworldacademie.com (1024 px, fond transparent).
 * Quand la version haute définition arrive, il suffit de la passer en argument
 * — ou de la poser à la place de sceau-source.png — puis de relancer : tout ce
 * qui suit est refait, rien n'est retouché à la main.
 *
 * Produit :
 * - assets/brand/cineworld-sceau.webp       le sceau, détouré, 240 px (en-tête, pied de page, admin) ;
 * - assets/brand/icone-32|180|192.png       le sceau sur la tuile sombre du site ;
 * - favicon.ico                             la même tuile, 48 px (PNG dans l'ICO) ;
 * - assets/images/partage-cineworld.jpg     l'aperçu des liens partagés, 1200 × 630,
 *                                           photographié par Chrome depuis partage.html.
 *
 * Le dossier scripts/ n'est jamais déployé (.vercelignore) : la source et cet
 * outillage restent dans le dépôt sans être servis. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const RACINE = path.resolve(__dirname, '..', '..');
const SOURCE = path.resolve(process.argv[2] || path.join(__dirname, 'sceau-source.png'));
const FOND = '#050709'; // le fond du site : la tuile des icônes est la même
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(c => fs.existsSync(c));

const vers = (...p) => path.join(RACINE, ...p);

/** Le sceau seul, marges transparentes retirées. */
async function sceauDetoure() {
  return sharp(SOURCE).ensureAlpha().trim({ threshold: 1 }).png().toBuffer();
}

/** Le sceau centré sur la tuile sombre, à `cote` px, occupant `part` du côté. */
async function tuile(sceau, cote, part) {
  const interieur = Math.round(cote * part);
  const pose = await sharp(sceau).resize(interieur, interieur, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: cote, height: cote, channels: 4, background: FOND } })
    .composite([{ input: pose, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Un fichier ICO à une seule image, PNG embarqué (lu par tous les navigateurs actuels). */
function ico(png, cote) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0); // réservé
  entete.writeUInt16LE(1, 2); // type : icône
  entete.writeUInt16LE(1, 4); // une image
  const entree = Buffer.alloc(16);
  entree.writeUInt8(cote >= 256 ? 0 : cote, 0);
  entree.writeUInt8(cote >= 256 ? 0 : cote, 1);
  entree.writeUInt8(0, 2);       // pas de palette
  entree.writeUInt8(0, 3);       // réservé
  entree.writeUInt16LE(1, 4);    // plans
  entree.writeUInt16LE(32, 6);   // bits par pixel
  entree.writeUInt32LE(png.length, 8);
  entree.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([entete, entree, png]);
}

/** L'aperçu de partage : Chrome photographie partage.html à 1200 × 630. */
function photographierPartage() {
  if (!CHROME) throw new Error('Chrome introuvable : l’image de partage ne peut pas être refaite.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cineworld-partage-'));
  const capture = path.join(temp, 'partage.png');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', `--user-data-dir=${path.join(temp, 'profil')}`,
    '--window-size=1200,630', '--virtual-time-budget=4000', `--screenshot=${capture}`,
    'file:///' + path.join(__dirname, 'partage.html').replace(/\\/g, '/')
  ], { stdio: 'ignore' });
  if (!fs.existsSync(capture)) throw new Error('Chrome n’a rien photographié.');
  return capture;
}

(async () => {
  if (!fs.existsSync(SOURCE)) throw new Error('Sceau introuvable : ' + SOURCE);
  const sceau = await sceauDetoure();

  await sharp(sceau).resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(vers('assets', 'brand', 'cineworld-sceau.webp'));

  /* Aux petites tailles, le texte du sceau devient illisible : on garde
     l'anneau et le chameau aussi grands que possible. */
  for (const [cote, part] of [[32, 0.94], [180, 0.84], [192, 0.84]]) {
    fs.writeFileSync(vers('assets', 'brand', `icone-${cote}.png`), await tuile(sceau, cote, part));
  }
  fs.writeFileSync(vers('favicon.ico'), ico(await tuile(sceau, 48, 0.94), 48));

  const capture = photographierPartage();
  await sharp(capture).flatten({ background: FOND }).jpeg({ quality: 86, mozjpeg: true })
    .toFile(vers('assets', 'images', 'partage-cineworld.jpg'));

  console.log('Marque refaite depuis', path.relative(RACINE, SOURCE));
})().catch(err => { console.error(err.message || err); process.exit(1); });

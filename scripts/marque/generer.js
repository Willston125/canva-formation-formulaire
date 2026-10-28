/* Fabrique les fichiers de marque Cineworld Académie depuis le logo officiel.
 *
 *   node scripts/marque/generer.js [chemin/vers/le/logo.png]
 *
 * Source par défaut : scripts/marque/logo-source.png, le logo officiel (monogramme
 * CW et « Cineworld ACADÉMIE », bordeaux et or, fond transparent), remis par le
 * propriétaire le 28/10/2026. Il remplace l'ancien sceau rond, qui portait
 * « DJIBOUTI ». Quand une nouvelle version arrive, il suffit de la passer en
 * argument — ou de la poser à la place de logo-source.png — puis de relancer :
 * tout ce qui suit est refait, rien n'est retouché à la main.
 *
 * Le logo officiel est conçu pour un fond clair : son bordeaux se perd sur le
 * noir du site. Décision du propriétaire (28/10/2026) : sur fond SOMBRE, la
 * version blanche (le bordeaux devient blanc cassé #F6F5EF, l'or reste or) ; sur
 * fond BLANC, la version officielle en couleurs, intacte.
 *
 * Produit :
 * - assets/brand/cineworld-logo-blanc.webp       version blanche, pour les fonds sombres du site ;
 * - assets/brand/cineworld-logo-couleur.webp  version officielle, pour les fonds clairs
 *                                          (données de Google, qui l'affiche sur du blanc) ;
 * - assets/brand/icone-32|180|192.png      le monogramme CW sur une tuile blanche ;
 * - favicon.ico                            la même tuile, 48 px (PNG dans l'ICO) ;
 * - assets/images/partage-cineworld.jpg    l'aperçu des liens partagés, 1200 × 630,
 *                                          photographié par Chrome depuis partage.html.
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
const SOURCE = path.resolve(process.argv[2] || path.join(__dirname, 'logo-source.png'));
const BLANC = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(c => fs.existsSync(c));

const vers = (...p) => path.join(RACINE, ...p);

/** Le logo seul, marges transparentes retirées. */
async function logoDetoure() {
  return sharp(SOURCE).ensureAlpha().trim({ threshold: 20 }).png().toBuffer();
}

/**
 * Le monogramme CW : la partie gauche du logo, jusqu'à la colonne la plus vide
 * entre la pointe du V et le « C » de Cineworld (cherchée, pas supposée : une
 * nouvelle version du logo peut la déplacer).
 */
async function monogramme(logo) {
  const { data, info } = await sharp(logo).raw().toBuffer({ resolveWithObject: true });
  const colonne = x => { let s = 0; for (let y = 0; y < info.height; y++) s += data[(y * info.width + x) * 4 + 3]; return s; };
  let coupe = 0;
  let minimum = Infinity;
  for (let x = Math.round(info.width * 0.25); x < Math.round(info.width * 0.5); x++) {
    const v = colonne(x);
    if (v < minimum) { minimum = v; coupe = x; }
  }
  return sharp(logo).extract({ left: 0, top: 0, width: coupe, height: info.height }).trim({ threshold: 20 }).png().toBuffer();
}

/** Un rectangle blanc arrondi, en masque SVG. */
const arrondi = (largeur, hauteur, rayon) =>
  Buffer.from(`<svg width="${largeur}" height="${hauteur}"><rect width="100%" height="100%" rx="${rayon}" fill="#fff"/></svg>`);

/**
 * La version blanche, pour les fonds sombres : chaque pixel bordeaux (vert faible
 * devant le rouge) devient blanc cassé, transparence conservée — les bords
 * adoucis restent adoucis. L'or (vert proche du rouge) ne bouge pas.
 */
async function versionBlanche(logo) {
  const { data, info } = await sharp(logo).raw().toBuffer({ resolveWithObject: true });
  const sortie = Buffer.from(data);
  for (let i = 0; i < sortie.length; i += 4) {
    const r = sortie[i];
    const g = sortie[i + 1];
    if (sortie[i + 3] && r > 0 && g / r < 0.5) { sortie[i] = 0xF6; sortie[i + 1] = 0xF5; sortie[i + 2] = 0xEF; }
  }
  return sharp(sortie, { raw: info }).png().toBuffer();
}

/** Le monogramme centré sur une tuile blanche, à `cote` px, occupant `part` du côté. */
async function tuile(mono, cote, part, opaque) {
  const interieur = Math.round(cote * part);
  const pose = await sharp(mono).resize(interieur, interieur, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
  const fond = opaque
    // iOS remplit la transparence d'une icône d'écran d'accueil en noir, et arrondit lui-même
    ? sharp({ create: { width: cote, height: cote, channels: 4, background: BLANC } })
    : sharp({ create: { width: cote, height: cote, channels: 4, background: TRANSPARENT } })
      .composite([{ input: arrondi(cote, cote, Math.round(cote * 0.22)) }]);
  const tuileBlanche = await fond.png().toBuffer();
  return sharp(tuileBlanche).composite([{ input: pose, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
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
  if (!fs.existsSync(SOURCE)) throw new Error('Logo introuvable : ' + SOURCE);
  const logo = await logoDetoure();
  const mono = await monogramme(logo);

  // 112 px de haut : affiché entre 32 et 48 px, net sur un écran à haute densité
  await sharp(await versionBlanche(logo)).resize({ height: 112 }).webp({ quality: 92, alphaQuality: 100 })
    .toFile(vers('assets', 'brand', 'cineworld-logo-blanc.webp'));
  await sharp(logo).resize({ height: 224 }).webp({ quality: 92, alphaQuality: 100 })
    .toFile(vers('assets', 'brand', 'cineworld-logo-couleur.webp'));

  for (const [cote, part, opaque] of [[32, 0.86, false], [180, 0.72, true], [192, 0.72, true]]) {
    fs.writeFileSync(vers('assets', 'brand', `icone-${cote}.png`), await tuile(mono, cote, part, opaque));
  }
  fs.writeFileSync(vers('favicon.ico'), ico(await tuile(mono, 48, 0.86, false), 48));

  const capture = photographierPartage();
  await sharp(capture).flatten({ background: '#050709' }).jpeg({ quality: 86, mozjpeg: true })
    .toFile(vers('assets', 'images', 'partage-cineworld.jpg'));

  console.log('Marque refaite depuis', path.relative(RACINE, SOURCE));
})().catch(err => { console.error(err.message || err); process.exit(1); });

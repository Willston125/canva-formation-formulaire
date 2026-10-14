/* Les photos de la campagne : les affiches de William, débarrassées de leurs textes.
 *
 *   node publicite/campagne/retouche.js            → refait medias/ (une photo propre par formation)
 *   node publicite/campagne/retouche.js --zones    → même chose, avec les zones retouchées encadrées (contrôle)
 *
 * Chaque zone de texte est remplacée par une surface reconstruite à partir de ses bords
 * (interpolation de Coons : le fond sombre et dégradé du studio se prolonge sans couture),
 * puis grainée comme la photo. Mode « vertical » : seuls les bords haut et bas comptent,
 * pour une zone posée sur un vêtement (les plis continuent).
 *
 * Les affiches sources restent intactes dans « module de william/ ». */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));

const RACINE = path.resolve(__dirname, '../..');
const SORTIE = path.join(__dirname, 'medias');
const ZONES = process.argv.includes('--zones');

/* [x0, y0, x1, y1, mode] en pixels de l'affiche (1122 × 1402). */
const AFFICHES = {
  'canva-pro': ['module de william/module creation de contenue.png', [
    [110, 60, 470, 145], [40, 210, 620, 450], [50, 458, 480, 520], [36, 534, 630, 610], [34, 632, 452, 748]
  ]],
  'identite-visuelle': ['module de william/module creation graphique et identit visuel.png', [
    [46, 70, 420, 150], [40, 168, 604, 400], [44, 418, 584, 500], [352, 1196, 764, 1318]
  ]],
  'marketing-digital': ['module de william/module creation marketing digital.png', [
    [66, 50, 452, 146], [64, 176, 628, 312], [64, 312, 600, 508], [48, 520, 608, 606], [60, 1140, 500, 1278]
  ]],
  'ia-appliquee': ['module de william/module creation de site web avec l\'ia.png', [
    [68, 72, 538, 166], [64, 188, 590, 466], [66, 468, 556, 526], [60, 540, 626, 616], [366, 1162, 758, 1272]
  ]],
  'photo-video': ['module de william/modeule photo et vidéo.png', [
    [58, 88, 448, 184], [54, 214, 526, 372], [54, 372, 486, 486], [60, 482, 456, 528],
    /* Les étiquettes du bas couvrent l'avant-bras : lissées seulement, les maquettes
       vidéo gardent ce bas de photo sous un dégradé sombre. */
    [44, 734, 404, 818], [404, 734, 690, 818, 'vertical'],
    [56, 880, 432, 990], [56, 1004, 236, 1146], [872, 1104, 1100, 1276, 'vertical']
  ]]
};

const borne = (v, a, b) => Math.max(a, Math.min(b, v));

function lisser(t, r) {
  return t.map((_, i) => {
    const s = [0, 0, 0]; let n = 0;
    for (let k = -r; k <= r; k++) { const c = t[borne(i + k, 0, t.length - 1)]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; }
    return s.map(v => v / n);
  });
}

/* `restantes` : les zones pas encore retouchées. Un bord ne prélève jamais de pixel dans
   l'une d'elles (il y aurait du texte) : il va chercher le fond au-delà. Parmi les pixels
   prélevés, on garde un des plus sombres : un reste de lettre claire ne laisse pas de traînée. */
function reconstruire(px, W, H, [x0, y0, x1, y1, mode, dxClone = 0, dyClone = 0], restantes) {
  const lire = (x, y) => { const i = (borne(y, 0, H - 1) * W + borne(x, 0, W - 1)) * 3; return [px[i], px[i + 1], px[i + 2]]; };
  const moyenne = cs => [0, 1, 2].map(k => cs.reduce((s, c) => s + c[k], 0) / cs.length);
  const dansTexte = (x, y) => restantes.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const prelever = (x, y, dx, dy) => {
    const vus = [];
    for (let d = 1; d < 260 && vus.length < 10; d++) {
      const xx = x + dx * d, yy = y + dy * d;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
      if (!dansTexte(xx, yy)) vus.push(lire(xx, yy));
    }
    if (!vus.length) vus.push(lire(x + dx, y + dy));
    vus.sort((a, b) => lum(a) - lum(b));
    return vus[Math.floor(vus.length * 0.4)];
  };
  const bord = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const haut = lisser(bord(x1 - x0 + 1, i => prelever(x0 + i, y0, 0, -1)), 12);
  const bas = lisser(bord(x1 - x0 + 1, i => prelever(x0 + i, y1, 0, 1)), 12);
  const gauche = lisser(bord(y1 - y0 + 1, i => prelever(x0, y0 + i, -1, 0)), 12);
  const droite = lisser(bord(y1 - y0 + 1, i => prelever(x1, y0 + i, 1, 0)), 12);
  const P00 = moyenne([haut[0], gauche[0]]), P10 = moyenne([haut[haut.length - 1], droite[0]]);
  const P01 = moyenne([bas[0], gauche[gauche.length - 1]]), P11 = moyenne([bas[bas.length - 1], droite[droite.length - 1]]);
  let graine = (x0 * 73856093) ^ (y0 * 19349663);
  const bruit = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return (graine / 0x7fffffff - 0.5) * 5; };
  /* Mode « clone » : la texture vient d'une zone voisine (tampon de duplication) ;
     sur 14 px au bord, elle se fond dans l'interpolation pour ne laisser aucune couture. */
  const source = mode === 'clone' ? Buffer.from(px) : null;
  const fondu = t => t * t * (3 - 2 * t);
  for (let y = y0; y <= y1; y++) {
    const v = (y - y0) / (y1 - y0);
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0);
      const T = haut[x - x0], B = bas[x - x0], L = gauche[y - y0], R = droite[y - y0];
      const i = (y * W + x) * 3;
      const n = mode === 'clone' ? 0 : bruit();
      const marge = Math.min(y - y0, y1 - y, x - x0, x1 - x);
      const poids = mode === 'clone' ? fondu(Math.min(1, marge / 14)) : 0;
      const j = mode === 'clone' ? ((borne(y + dyClone, 0, H - 1)) * W + borne(x + dxClone, 0, W - 1)) * 3 : 0;
      for (let k = 0; k < 3; k++) {
        const interp = mode === 'vertical' || mode === 'clone'
          ? (1 - v) * T[k] + v * B[k]
          : (1 - v) * T[k] + v * B[k] + (1 - u) * L[k] + u * R[k]
            - ((1 - u) * (1 - v) * P00[k] + u * (1 - v) * P10[k] + (1 - u) * v * P01[k] + u * v * P11[k]);
        const c = mode === 'clone' ? poids * source[j + k] + (1 - poids) * interp : interp;
        px[i + k] = borne(Math.round(c + n), 0, 255);
      }
    }
  }
}

function encadrer(px, W, [x0, y0, x1, y1]) {
  for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) { const i = (y * W + x) * 3; px[i] = 255; px[i + 1] = 0; px[i + 2] = 255; }
  for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) { const i = (y * W + x) * 3; px[i] = 255; px[i + 1] = 0; px[i + 2] = 255; }
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  for (const [cle, [source, zones]] of Object.entries(AFFICHES)) {
    const { data, info } = await sharp(path.join(RACINE, source)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    zones.forEach((z, i) => reconstruire(data, info.width, info.height, z, zones.slice(i + 1)));
    if (ZONES) zones.forEach(z => encadrer(data, info.width, z));
    const fichier = path.join(SORTIE, cle + (ZONES ? '-zones' : '') + '.jpg');
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toFile(fichier);
    console.log('  ', cle, info.width + '×' + info.height, '→', path.relative(RACINE, fichier));
  }

  /* Les deux portraits studio (dossier « APPEL A PROJET festival ») : le détouré et le portrait vert. */
  const festival = path.resolve(RACINE, '..', 'APPEL A PROJET festival');
  if (!ZONES) {
    await sharp(path.join(festival, 'formation canva (1).png')).trim({ threshold: 0 }).png({ compressionLevel: 9 }).toFile(path.join(SORTIE, 'portrait-detoure.png'));
    await sharp(path.join(festival, 'formation canva 01.png')).removeAlpha().jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(path.join(SORTIE, 'portrait-vert.jpg'));
    console.log('   portraits → medias/portrait-detoure.png, medias/portrait-vert.jpg');
  }
})().catch(e => { console.error(e); process.exit(1); });

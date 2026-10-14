/* Planche-contact : plusieurs images côte à côte, avec leur instant, pour juger
 * un montage d'un coup d'œil (et fabriquer les vignettes du storyboard).
 *
 *   node publicite/presentation/outils/planche.js <sortie.jpg> <largeur vignette> <colonnes> img1.png img2.png …
 *
 * Les repères de zone sûre (9:16) peuvent être superposés : --zones */
'use strict';

const path = require('path');
const sharp = require(path.resolve(__dirname, '..', '..', '..', 'node_modules', 'sharp'));

(async () => {
  const args = process.argv.slice(2);
  const zones = args.includes('--zones');
  const [sortie, largeurTxt, colonnesTxt, ...images] = args.filter(a => a !== '--zones');
  const largeur = Number(largeurTxt);
  const colonnes = Number(colonnesTxt);
  const metas = await Promise.all(images.map(f => sharp(f).metadata()));
  const k = largeur / metas[0].width;
  const hauteur = Math.round(metas[0].height * k);
  const lignes = Math.ceil(images.length / colonnes);
  const marge = 34;
  const tuiles = [];
  for (let i = 0; i < images.length; i++) {
    const x = (i % colonnes) * (largeur + 8);
    const y = Math.floor(i / colonnes) * (hauteur + marge);
    let img = sharp(images[i]).resize({ width: largeur });
    if (zones && metas[i].height === 1920) {
      // Zone sûre retenue : x 120–960, y 290–1200, et x ≤ 840 sous y = 840
      const s = largeur / 1080;
      const svg = `<svg width="${largeur}" height="${hauteur}"><g fill="none" stroke="#FF2BD6" stroke-width="1.5" stroke-dasharray="6 4">
        <path d="M${120 * s} ${290 * s} H${960 * s} V${840 * s} H${840 * s} V${1200 * s} H${120 * s} Z"/></g></svg>`;
      img = sharp(await img.toBuffer()).composite([{ input: Buffer.from(svg) }]);
    }
    tuiles.push({ input: await img.toBuffer(), left: x, top: y });
    const nom = path.basename(images[i]).replace(/\.png$/, '');
    tuiles.push({ input: Buffer.from(`<svg width="${largeur}" height="${marge}"><text x="6" y="22" font-size="18" font-family="Arial" fill="#ffffff">${nom}</text></svg>`), left: x, top: y + hauteur + 4 });
  }
  await sharp({ create: { width: colonnes * (largeur + 8), height: lignes * (hauteur + marge), channels: 3, background: '#202020' } })
    .composite(tuiles).jpeg({ quality: 86 }).toFile(sortie);
  console.log(sortie);
})();

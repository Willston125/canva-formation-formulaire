/* Télécharge les polices Google et génère un fonts.css local. */
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const KEEP_SUBSETS = ['latin', 'latin-ext'];

const ICONS = fs.readFileSync('/tmp/icons.txt', 'utf8').trim();

const SOURCES = [
  {
    key: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300..800&display=swap',
    subsetFilter: true
  },
  {
    key: 'inter',
    label: 'Inter',
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300..800&display=swap',
    subsetFilter: true
  },
  {
    key: 'material-symbols-outlined',
    label: 'Material Symbols Outlined',
    url: `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=${ICONS}&display=block`,
    subsetFilter: false
  }
];

/** Découpe la CSS Google en blocs { subset, block }. */
function parseFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let m;
  while ((m = re.exec(css))) faces.push({ subset: m[1], block: m[2] });
  if (!faces.length) {
    const re2 = /@font-face\s*\{[^}]*\}/g;
    let n;
    while ((n = re2.exec(css))) faces.push({ subset: 'all', block: n[0] });
  }
  return faces;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = [
    '/* =========================================',
    '   POLICES AUTO-HÉBERGÉES',
    '   Générées depuis Google Fonts (voir scripts/fetch-fonts.js).',
    '   Material Symbols est réduit aux icônes réellement utilisées.',
    '   ========================================= */',
    ''
  ];
  let total = 0;

  for (const source of SOURCES) {
    const css = await fetch(source.url, { headers: { 'User-Agent': UA } }).then(r => {
      if (!r.ok) throw new Error(`${source.label}: HTTP ${r.status}`);
      return r.text();
    });

    const faces = parseFaces(css).filter(f => !source.subsetFilter || KEEP_SUBSETS.includes(f.subset));
    if (!faces.length) throw new Error(`${source.label}: aucun bloc @font-face retenu`);

    out.push(`/* ---------- ${source.label} ---------- */`);

    for (const face of faces) {
      // L'URL d'un sous-ensemble Material Symbols n'a pas d'extension : on se fie au format déclaré
      const urlMatch = face.block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\(['"]woff2['"]\)/);
      if (!urlMatch) throw new Error(`${source.label}/${face.subset}: pas de woff2`);

      const fileName = faces.length > 1 && source.subsetFilter
        ? `${source.key}-${face.subset}.woff2`
        : `${source.key}.woff2`;
      const buffer = Buffer.from(await fetch(urlMatch[1], { headers: { 'User-Agent': UA } }).then(r => r.arrayBuffer()));
      fs.writeFileSync(path.join(OUT_DIR, fileName), buffer);
      total += buffer.length;
      console.log(`  ${fileName.padEnd(38)} ${(buffer.length / 1024).toFixed(1)} Ko`);

      out.push(face.block.replace(urlMatch[1], `/assets/fonts/${fileName}`).trim(), '');
    }

    // La classe de base des icônes était fournie par la CSS du CDN : on la conserve
    const baseClass = css.match(/\.material-symbols-outlined\s*\{[^}]*\}/);
    if (baseClass) out.push(baseClass[0].trim(), '');
  }

  fs.writeFileSync(path.join(process.cwd(), 'fonts.css'), out.join('\n') + '\n');
  console.log(`Total : ${(total / 1024).toFixed(1)} Ko`);
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });

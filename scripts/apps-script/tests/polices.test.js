/* Vérifie la typographie du site ET du tableau de bord.

   Trois familles, deux usages : Plus Jakarta Sans pour les titres, Inter pour
   tout le reste, Material Symbols pour les icônes. Une quatrième famille qui
   s'inviterait, ou une chaîne de repli différente d'un fichier à l'autre,
   produirait deux apparences selon la page — le genre d'écart qu'on ne voit
   qu'une fois le site publié. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = p => fs.readFileSync(path.join(RACINE, p), 'utf8');
const existe = p => fs.existsSync(path.join(RACINE, p));

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Les seules chaînes autorisées. Le repli compte autant que la police : si
   Inter n'arrive pas, le site et le tableau de bord doivent se rabattre sur la
   même police système, sinon ils ne se ressemblent plus. */
const CHAINES = [
  "'Plus Jakarta Sans', system-ui, sans-serif",
  "'Inter', system-ui, -apple-system, sans-serif",
  "'Material Symbols Outlined'",
  'inherit'
];

const FEUILLES = ['style.css', 'admin/admin.css'];

// --- 1. Aucune chaîne hors de la liste ---------------------------------------

const horsListe = [];
for (const feuille of FEUILLES) {
  const contenu = lire(feuille);
  // « font-family: … ; » et le raccourci « font: 800 1rem/1.2 … ; »
  const declarations = [
    ...contenu.matchAll(/font-family:\s*([^;}]+)[;}]/g),
    ...contenu.matchAll(/(?:^|[;{])\s*font:\s*[^;}]*?((?:'[^']+'|"[^"]+")[^;}]*)[;}]/gm)
  ];
  for (const d of declarations) {
    const chaine = d[1].trim().replace(/\s+/g, ' ');
    if (CHAINES.includes(chaine)) continue;
    if (chaine.startsWith('inherit')) continue;
    const ligne = contenu.slice(0, d.index).split('\n').length;
    horsListe.push(feuille + ':' + ligne + ' → ' + chaine);
  }
}
verifier('aucune police hors de la palette', horsListe, []);

// --- 2. Les trois familles sont réellement chargées --------------------------

const fontsCss = lire('fonts.css');
const familles = [...new Set([...fontsCss.matchAll(/font-family:\s*'([^']+)'/g)].map(m => m[1]))];
verifier('familles chargées par fonts.css', familles.sort(),
  ['Inter', 'Material Symbols Outlined', 'Plus Jakarta Sans']);

const fichiers = [...fontsCss.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/^\//, ''));
verifier('chaque fichier de police existe', fichiers.filter(f => !existe(f)), []);
verifier('au moins un fichier par famille', fichiers.length >= 3, true);

// --- 3. Rien n'est chargé depuis l'extérieur ---------------------------------

const PAGES = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html',
  'admin/index.html', 'formations/_template/fiche.html', 'formations/canva-pro/index.html',
  'inscription/index.html'];

const externes = [];
for (const page of PAGES) {
  if (!existe(page)) continue;
  const contenu = lire(page);
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(contenu)) externes.push(page);
}
verifier('aucune police appelée chez Google', externes, []);

// --- 4. Chaque page charge bien la feuille des polices -----------------------

const sansFontsCss = PAGES.filter(p => existe(p) && !/href="\/?fonts\.css"/.test(lire(p)));
verifier('chaque page charge fonts.css', sansFontsCss, []);

// --- 5. Les préchargements pointent vers des fichiers réels ------------------

const preloadsCasses = [];
for (const page of PAGES) {
  if (!existe(page)) continue;
  for (const m of lire(page).matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.woff2)"/g)) {
    if (!existe(m[1].replace(/^\//, ''))) preloadsCasses.push(page + ' → ' + m[1]);
  }
}
verifier('les polices préchargées existent', preloadsCasses, []);

// --- 6. Les icônes employées sont bien relevées par le générateur -----------

const collecteur = lire('scripts/fetch-fonts.js');
const sourcesRelevees = /const fichiers = \[([\s\S]*?)\];/.exec(collecteur);
verifier('le générateur relève les sources du tableau de bord',
  !!sourcesRelevees && /admin\/admin\.js/.test(sourcesRelevees[1]) && /admin\/index\.html/.test(sourcesRelevees[1]),
  true);

// --- 7. Chaque icône employée entre bien dans le sous-ensemble --------------

/* Une icône que le générateur ne relève pas n'entre pas dans le fichier
   téléchargé, et le navigateur affiche alors son NOM en toutes lettres à la
   place du pictogramme. C'est ainsi que « inbox » s'affichait sur l'écran
   d'accueil du tableau de bord. On refait ici un relevé LARGE, indépendant du
   générateur, et on vérifie qu'il ne trouve rien de plus que lui. */
const SOURCES_ICONES = [
  'index.html', 'entreprises/index.html', 'mentions-legales/index.html', 'admin/index.html',
  'formations/_template/fiche.html', 'inscription/index.html', 'script.js', 'site-common.js',
  'landing.js', 'admin/admin.js', 'fiche-blocs.js', 'formations-data.js', 'scripts/build-fiches.js'
];
const MOTIFS_ICONES = [
  /material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*</g,
  /(?:textContent|icon|icone)\s*[:=]\s*['"]([a-z][a-z0-9_]{2,})['"]/g,
  /\bvide\(\s*['"]([a-z][a-z0-9_]{2,})['"]/g
];

const employees = new Set(['menu', 'close', 'expand_more', 'arrow_forward', 'arrow_back']);
for (const source of SOURCES_ICONES) {
  if (!existe(source)) continue;
  const contenu = lire(source);
  for (const re of MOTIFS_ICONES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(contenu))) employees.add(m[1]);
  }
}

// Le relevé du générateur, rejoué tel quel
const relevees = new Set();
{
  const src = lire('scripts/fetch-fonts.js');
  const corps = src.slice(src.indexOf('function collectIcons'), src.indexOf('const ICONES ='));
  const collecter = new Function('fs', 'path', corps + '; return collectIcons();');
  const depart = process.cwd();
  process.chdir(RACINE);
  try { collecter(fs, path).forEach(n => relevees.add(n)); } finally { process.chdir(depart); }
}

verifier('le générateur relève toutes les icônes employées',
  [...employees].filter(n => !relevees.has(n)).sort(), []);

/* Ce contrôle-ci ne partage AUCUN motif avec le générateur.
 *
 * Le relevé ci-dessus se voulait indépendant, mais il recopiait les trois mêmes
 * expressions régulières : il avait donc exactement le même angle mort, et les
 * deux se sont tus de concert. `ICONES_DOMAINE` de landing.js prend le nom du
 * domaine pour clé — 'Design & Contenu': 'palette' — que nul motif ne voyait.
 * Sur l'accueil, deux cartes affichaient PALETTE et SMART_TOY en toutes
 * lettres pendant que leurs voisines montraient leur pictogramme.
 *
 * On lit donc les tables d'icônes PAR LEUR NOM, sans regex de collecte : si
 * celle du générateur se casse un jour, ce chemin-ci tient toujours. */
const tablesIcones = [];
for (const source of SOURCES_ICONES) {
  if (!existe(source)) continue;
  const contenu = lire(source);
  const re = /\b(?:const|let|var)\s+(\w*ICONES?\w*)\s*=\s*\{([\s\S]*?)\n\s*\};/g;
  let t;
  while ((t = re.exec(contenu))) {
    const valeurs = (t[2].match(/:\s*['"][a-z][a-z0-9_]{2,}['"]/g) || [])
      .map(v => v.replace(/^.*['"]([a-z][a-z0-9_]{2,})['"]$/, '$1'));
    if (valeurs.length) tablesIcones.push({ source, nom: t[1], valeurs });
  }
}

/* Contre-contrôle : sans lui, le contrôle suivant passerait si plus aucune
   table n'était trouvée — c'est-à-dire précisément quand il devrait crier. */
verifier('des tables d’icônes sont bien trouvées', tablesIcones.length >= 1, true);

verifier('et toutes leurs icônes entrent dans le sous-ensemble',
  tablesIcones.flatMap(t => t.valeurs.filter(v => !relevees.has(v))
    .map(v => t.source + ' → ' + t.nom + '.' + v)), []);

console.log('Tables d’icônes lues : '
  + tablesIcones.map(t => t.nom + ' (' + t.valeurs.length + ')').join(', '));

console.log('Icônes : ' + relevees.size + ' dans le sous-ensemble, ' + employees.size + ' employées');
console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

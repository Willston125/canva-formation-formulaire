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

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

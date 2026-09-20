/* Vérifie les textes modifiables du site.
   Une clé doit désigner UN seul texte : deux textes différents sous la même clé
   se remplaceraient l'un l'autre à la première modification faite dans le
   tableau de bord, sans le moindre avertissement. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');

/* Les pages que le tableau de bord parcourt pour dresser la liste des textes.
   Toute page absente d'ici ne sera jamais modifiable, même bien balisée. */
const PAGES_PARCOURUES = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html'];
const PAGES = PAGES_PARCOURUES.concat(['formations/canva-pro/index.html', 'inscription/index.html']);

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const parCle = new Map();
let total = 0;
for (const page of PAGES) {
  const chemin = path.join(RACINE, page);
  if (!fs.existsSync(chemin)) { verifier('page présente : ' + page, false, true); continue; }
  const html = fs.readFileSync(chemin, 'utf8');
  const re = /data-texte(?:-html)?="([^"]+)"[^>]*>([\s\S]{0,160}?)</g;
  let m;
  while ((m = re.exec(html))) {
    total++;
    const texte = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!parCle.has(m[1])) parCle.set(m[1], new Set());
    parCle.get(m[1]).add(texte);
  }
}

const collisions = [...parCle.entries()].filter(([, v]) => v.size > 1);
verifier('aucune clé ne désigne deux textes différents',
  collisions.map(([c, v]) => c + ' = ' + [...v].join(' | ')), []);

// Chaque clé doit porter son groupe et son libellé, sinon la liste est illisible
const sansEtiquette = [];
for (const page of PAGES) {
  const chemin = path.join(RACINE, page);
  if (!fs.existsSync(chemin)) continue;
  const html = fs.readFileSync(chemin, 'utf8');
  const re = /<[a-z0-9]+\b[^>]*data-texte(?:-html)?="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/data-texte-groupe=/.test(m[0]) || !/data-texte-libelle=/.test(m[0])) sansEtiquette.push(m[1]);
  }
}
verifier('chaque texte porte un groupe et un libellé', [...new Set(sansEtiquette)], []);

// Le tableau de bord ne lit que les pages qu'il parcourt
const admin = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');
const declarees = /var pages = \[([^\]]*)\]/.exec(admin);
verifier('le tableau de bord parcourt les mentions légales',
  !!declarees && /mentions-legales/.test(declarees[1]), true);

verifier('nombre de textes modifiables relevés', total >= 100, true);

/* Les visuels remplaçables suivent la même convention que les textes. Sans
   groupe, libellé et format, le tableau de bord ne saurait ni où les ranger,
   ni à quelles mesures recadrer la photo envoyée. */
const visuels = [];
const visuelsIncomplets = [];
for (const page of PAGES_PARCOURUES) {
  const chemin = path.join(RACINE, page);
  if (!fs.existsSync(chemin)) continue;
  const html = fs.readFileSync(chemin, 'utf8');
  for (const m of html.matchAll(/<img\b[^>]*data-image="([^"]+)"[^>]*>/g)) {
    visuels.push(m[1]);
    if (!/data-image-groupe=/.test(m[0]) || !/data-image-libelle=/.test(m[0])
      || !/data-image-format=/.test(m[0])) visuelsIncomplets.push(m[1]);
  }
}
verifier('chaque visuel remplaçable porte groupe, libellé et format', visuelsIncomplets, []);
/* Une même clé PEUT revenir : le logo est dans l'en-tête et le pied de chaque
   page, et il doit changer partout d'un seul envoi. Ce qui est interdit, c'est
   qu'elle décrive DEUX emplacements différents — le tableau de bord n'en
   montrerait qu'un, et l'autre changerait à son insu. On compare donc les
   déclarations, et non le simple fait qu'une clé revienne. */
const parCleVisuel = new Map();
for (const page of PAGES_PARCOURUES) {
  const chemin = path.join(RACINE, page);
  if (!fs.existsSync(chemin)) continue;
  for (const m of fs.readFileSync(chemin, 'utf8').matchAll(/<img\b[^>]*data-image="([^"]+)"[^>]*>/g)) {
    const attribut = nom => (new RegExp('\\b' + nom + '="([^"]*)"').exec(m[0]) || [])[1] || '';
    const signature = ['groupe', 'libelle', 'format', 'ratio']
      .map(n => attribut('data-image-' + n)).join(' | ');
    if (!parCleVisuel.has(m[1])) parCleVisuel.set(m[1], new Set());
    parCleVisuel.get(m[1]).add(signature);
  }
}
verifier('une même clé ne décrit qu’un seul emplacement',
  [...parCleVisuel.entries()].filter(([, v]) => v.size > 1)
    .map(([c, v]) => c + ' : ' + [...v].join('  ≠  ')), []);
verifier('des visuels sont bien remplaçables', visuels.length >= 5, true);

const formatsConnus = ['paysage', 'portrait', 'image', 'poster', 'logo', 'portfolio'];
verifier('les formats annoncés sont connus du tableau de bord',
  (() => {
    const admin = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');
    const declares = [...admin.matchAll(/^\s{4}([a-z]+): \{ largeur:/gm)].map(m => m[1]);
    const utilises = new Set();
    for (const page of PAGES_PARCOURUES) {
      const chemin = path.join(RACINE, page);
      if (!fs.existsSync(chemin)) continue;
      for (const m of fs.readFileSync(chemin, 'utf8').matchAll(/data-image-format="([^"]+)"/g)) utilises.add(m[1]);
    }
    return [...utilises].filter(f => !declares.includes(f) && !formatsConnus.includes(f));
  })(), []);

console.log('Textes modifiables : ' + total + ' occurrences, ' + parCle.size + ' clés distinctes');
console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

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

console.log('Textes modifiables : ' + total + ' occurrences, ' + parCle.size + ' clés distinctes');
console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

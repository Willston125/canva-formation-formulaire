/* Vérifie que toutes les pages nomment LA MÊME adresse de site.

   Les balises `canonical` et `og:` portent l'adresse publique en toutes
   lettres — 51 fois, sur 11 pages. Les fiches la tiennent d'une constante du
   générateur ; l'accueil, la page entreprises et les mentions légales
   l'écrivent à la main. Une page oubliée lors d'un changement de domaine ne
   casse rien de visible : elle désigne simplement une autre adresse aux
   moteurs de recherche et aux réseaux sociaux, ce qui divise le référencement
   entre deux domaines sans que personne ne s'en aperçoive.

   C'est arrivé au passage de canva-formation-formulaire.vercel.app à
   www.impactali.site : quatre fichiers à changer à la main, sept générés. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = p => fs.readFileSync(path.join(RACINE, p), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* La constante du générateur fait foi : c'est elle qui produit les sept pages
   générées, donc la majorité des occurrences. */
const generateur = lire('scripts/build-fiches.js');
const reference = (/const SITE_URL = '([^']+)'/.exec(generateur) || [])[1];
verifier('le générateur nomme une adresse de site', !!reference, true);

/* Toutes les pages du site, y compris celles écrites à la main — ce sont
   justement elles qu'un changement de domaine oublie. */
const PAGES = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html',
  'inscription/index.html', 'formations/_template/fiche.html'];
for (const dossier of fs.readdirSync(path.join(RACINE, 'formations'))) {
  const page = path.join('formations', dossier, 'index.html');
  if (fs.existsSync(path.join(RACINE, page))) PAGES.push(page);
}

/* On relève les adresses des balises qui DÉSIGNENT le site : canonical et
   og:. Une adresse quelconque dans le corps de la page — un lien vers Canva,
   vers Google — n'a rien à voir et ne doit pas être comptée. */
const MOTIFS = [
  /rel="canonical"\s+href="(https?:\/\/[^"/]+)/g,
  /property="og:(?:url|image)"\s+content="(https?:\/\/[^"/]+)/g,
  /content="(https?:\/\/[^"/]+)"\s+property="og:(?:url|image)"/g
];

const parPage = {};
for (const page of PAGES) {
  const contenu = lire(page);
  const hotes = new Set();
  for (const re of MOTIFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(contenu))) hotes.add(m[1]);
  }
  parPage[page] = [...hotes];
}

/* Contre-contrôle : sans lui, tout ce qui suit passerait le jour où les
   motifs ne trouveraient plus rien — c'est-à-dire quand il faudrait crier. */
const total = Object.values(parPage).reduce((n, h) => n + h.length, 0);
verifier('des adresses sont bien relevées dans les pages', total >= PAGES.length, true);

verifier('chaque page nomme une adresse',
  PAGES.filter(p => !parPage[p].length), []);

verifier('toutes désignent la même que le générateur',
  Object.entries(parPage).filter(([, hotes]) => hotes.some(h => h !== reference))
    .map(([page, hotes]) => page + ' → ' + hotes.filter(h => h !== reference).join(', ')), []);

/* L'ancienne adresse ne doit plus traîner NULLE PART — pas même dans un
   commentaire ou un attribut que les motifs ci-dessus ne regardent pas. */
const restes = [];
for (const page of PAGES) {
  if (/canva-formation-formulaire\.vercel\.app/.test(lire(page))) restes.push(page);
}
verifier('l’ancienne adresse Vercel ne traîne plus', restes, []);

/* Le site répond sur www : une adresse canonique qui pointerait vers le
   domaine nu désignerait une page qui redirige, ce que les moteurs traitent
   comme un signal contradictoire. */
verifier('l’adresse de référence ne redirige pas vers une autre',
  /^https:\/\/www\./.test(reference || ''), true);

console.log('Pages examinées : ' + PAGES.length + ', adresse commune : ' + reference);
console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

/* Un nom de fonction n'est déclaré qu'une fois par script du site.
 *
 * LE DÉFAUT, constaté le 3 octobre 2026. Le mode essai du tableau de bord
 * ajoutait `ouvrirSession(email, motDePasse)` pour ouvrir la session du compte ;
 * le tableau de bord avait déjà `ouvrirSession(id)`, qui ouvre le panneau d'une
 * SESSION DE FORMATION. En JavaScript, la seconde déclaration remplace la
 * première dans tout le script, sans le moindre avertissement. La connexion
 * appelait donc l'ouverture d'un panneau, qui ne rendait rien : le bouton
 * restait sur « Vérification… », indéfiniment, sans un mot à l'écran.
 *
 * Le piège guette tout script long : le tableau de bord dépasse 3 500 lignes,
 * et « session » y a deux sens. On refuse donc tout nom déclaré deux fois. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const SCRIPTS = ['admin/admin.js', 'site-common.js', 'landing.js', 'script.js', 'fiche-blocs.js', 'formations-data.js'];

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Les noms déclarés plus d'une fois par `function nom(` dans un texte. */
function doublons(texte) {
  const vus = {};
  for (const m of texte.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) vus[m[1]] = (vus[m[1]] || 0) + 1;
  return Object.keys(vus).filter(n => vus[n] > 1).sort();
}

/* Contre-contrôle : le relevé voit bien le défaut tel qu'il s'est produit. */
verifier('le relevé repère le doublon du 3 octobre',
  doublons('function ouvrirSession(email, motDePasse) {}\nfunction ouvrirSession(id) {}'), ['ouvrirSession']);
verifier('et ne voit rien là où il n’y a rien', doublons('function a() {}\nfunction b() {}'), []);

for (const s of SCRIPTS) {
  const texte = fs.readFileSync(path.join(RACINE, s), 'utf8');
  verifier(s + ' : aucun nom de fonction déclaré deux fois', doublons(texte), []);
}
verifier('le tableau de bord a bien des fonctions à relever (sinon rien n’est éprouvé)',
  (fs.readFileSync(path.join(RACINE, 'admin/admin.js'), 'utf8').match(/\bfunction\s+\w+\s*\(/g) || []).length > 100, true);

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

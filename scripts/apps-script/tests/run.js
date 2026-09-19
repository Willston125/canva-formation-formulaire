/* Lance les épreuves du script Google, chacune dans son propre processus :
   l'émulateur garde un classeur en mémoire, deux épreuves qui le partageraient
   ne partiraient pas d'un état propre. */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const EPREUVES = [
  ['installation-neuve.test.js', 'Installation sur un classeur vierge'],
  ['colonnes.test.js', 'Colonnes ajoutées à un classeur déjà rempli'],
  ['formules.test.js', 'Valeurs commençant par + = - (formules Sheets)'],
  ['textes.test.js', 'Textes modifiables du site'],
  ['version.test.js', 'Version attendue par le site'],
  ['pays.test.js', 'Pays desservis'],
  ['polices.test.js', 'Typographie du site et du tableau de bord'],
  ['mise-a-jour-partielle.test.js', 'Une modification n’efface pas le reste de la ligne'],
  ['formulaires.test.js', 'Formulaires : cloisonnement et valeurs conservees'],
  ['affichage.test.js', 'Ce qui est masque disparait, ce qui est garde s affiche'],
  ['motdepasse.test.js', 'Le mot de passe survit a une mise a jour du script'],
  ['echappement.test.js', 'Echappement HTML valable aussi dans un attribut'],
  ['inscription-publique.test.js', 'Garde-fous du formulaire ouvert a tous'],
  ['filtres-photo.test.js', 'Aucune regle ne recolore une photo'],
  ['cadrage-visuels.test.js', 'Cadrage range a cote de l adresse du visuel'],
  ['cadrage-affichage.test.js', 'Le cadrage s applique aux seules images remplacees']
];

let echecs = 0;
for (const [fichier, titre] of EPREUVES) {
  console.log('\n=== ' + titre + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, fichier)], {
    stdio: 'inherit', env: process.env
  });
  if (r.status !== 0) echecs++;
}

console.log(echecs
  ? '\n' + echecs + ' épreuve(s) en échec.'
  : '\nToutes les épreuves passent.');
process.exit(echecs ? 1 : 0);

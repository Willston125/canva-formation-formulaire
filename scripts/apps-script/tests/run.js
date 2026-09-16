/* Lance les épreuves du script Google, chacune dans son propre processus :
   l'émulateur garde un classeur en mémoire, deux épreuves qui le partageraient
   ne partiraient pas d'un état propre. */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const EPREUVES = [
  ['installation-neuve.test.js', 'Installation sur un classeur vierge'],
  ['colonnes.test.js', 'Colonnes ajoutées à un classeur déjà rempli'],
  ['formules.test.js', 'Valeurs commençant par + = - (formules Sheets)']
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

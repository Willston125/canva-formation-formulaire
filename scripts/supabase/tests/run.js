/* Lance les épreuves de la base, chacune dans son propre processus.
 *
 * Contrairement au banc du script Google, la liste n'est pas écrite à la main :
 * tout fichier *.test.js du dossier est lancé. Une épreuve ajoutée ne peut donc
 * pas être oubliée. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const epreuves = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
if (!epreuves.length) {
  console.log('Aucune épreuve trouvée : rien n’est éprouvé.');
  process.exit(1);
}

let echecs = 0;
for (const fichier of epreuves) {
  console.log('\n=== ' + fichier + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, fichier)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) echecs++;
}
console.log(echecs ? '\n' + echecs + ' épreuve(s) en échec.' : '\nToutes les épreuves de la base passent.');
process.exit(echecs ? 1 : 0);

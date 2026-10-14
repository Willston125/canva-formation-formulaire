/* Les extraits filmés en cours (Promotion 2026), découpés image par image
 * pour la vidéo — chaque image est posée à l'instant exact, sans lecteur vidéo.
 *
 *   node publicite/presentation/outils/extraire-classe.js
 *
 * Sources : les deux vidéos verticales reçues le 09/10/2026 (WeTransfer), les
 * mêmes que les extraits « En classe » publiés sur le site. Pour changer un
 * passage : modifier PASSAGES (début et durée, en secondes), relancer, puis
 * refaire le rendu.
 *
 * Les images restent HORS DU DÉPÔT (.gitignore) : des élèves y sont
 * reconnaissables et le dépôt est public. */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SOURCES = path.join(os.homedir(), 'Downloads', 'wetransfer_2026-09-20-131055483-mp4_2026-10-09_1112');
const A = path.join(SOURCES, '2026-09-20-131055483.mp4');        // le cours « Hiérarchie visuelle », la salle
const B = path.join(SOURCES, '16bdda45272e8dae668dba54a0e516e9.mp4'); // au tableau, la création Canva
const SORTIE = path.resolve(__dirname, '..', 'medias', 'classe');

/* nom : [source, début, durée, recadrage vertical pour une fenêtre 4:5 (0 = haut, 1 = bas)] */
const PASSAGES = {
  formateur: [A, 9.5, 4.0, 0.42],   // le formateur explique, face à l'écran
  salle: [A, 26.6, 2.2, 0.55],      // la classe, plan large
  outils: [A, 34.0, 3.5, 0.35],     // « L'écosystème des outils créatifs »
  creation: [B, 9.85, 2.3, 0.45],   // une création Canva projetée, pas à pas (le formateur à l'ordinateur)
  tableau: [B, 0.5, 3.0, 0.4]       // au tableau interactif (moniteur du montage)
};

const inventaire = {};
for (const [nom, [source, debut, duree, recadrage]] of Object.entries(PASSAGES)) {
  if (!fs.existsSync(source)) throw new Error('Source introuvable : ' + source);
  const dossier = path.join(SORTIE, nom);
  fs.mkdirSync(dossier, { recursive: true });
  for (const f of fs.readdirSync(dossier)) if (/^\d{3}\.jpg$/.test(f)) fs.unlinkSync(path.join(dossier, f));
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(debut), '-t', String(duree), '-i', source,
    '-vf', 'hqdn3d=1.2:1.2:4:4,fps=30', '-q:v', '2', path.join(dossier, '%03d.jpg')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const n = fs.readdirSync(dossier).filter(f => /^\d{3}\.jpg$/.test(f)).length;
  inventaire[nom] = { images: n, recadrage };
  console.log(`  ${nom} : ${n} images`);
}
fs.writeFileSync(path.join(SORTIE, 'clips.js'),
  '/* Écrit par outils/extraire-classe.js — ne pas modifier à la main. */\nwindow.CLIPS_CLASSE = ' + JSON.stringify(inventaire, null, 1) + ';\n');

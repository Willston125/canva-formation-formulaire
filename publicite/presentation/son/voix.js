/* La voix off : où sont les fichiers, ce qu'ils durent.
 *
 *   node publicite/presentation/son/voix.js            → fabrique la voix TÉMOIN (Windows) puis mesure tout
 *   node publicite/presentation/son/voix.js --mesurer  → mesure seulement (après dépôt d'une voix enregistrée)
 *
 * Pour chaque phrase de donnees.js (voix['40'] et voix['15']) :
 *   son/voix/finale/<id>.wav   la voix ENREGISTRÉE, si elle existe (prioritaire) ;
 *   son/voix/temoin/<id>.wav   sinon la voix témoin, synthétisée par Windows.
 * Les mesures (début et fin de la parole dans chaque fichier, silences exclus)
 * vont dans son/voix/mesures.json : le mixage place chaque phrase à son instant,
 * les sous-titres en prennent la durée réelle. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ICI = path.resolve(__dirname, '..');
const DOSSIER = path.join(__dirname, 'voix');
const TEMOIN = path.join(DOSSIER, 'temoin');
const FINALE = path.join(DOSSIER, 'finale');
const MESURES = path.join(DOSSIER, 'mesures.json');

function chargerDonnees() {
  const contexte = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ICI, 'donnees.js'), 'utf8'), contexte);
  return contexte.window.DONNEES;
}

/** Toutes les phrases des deux montages, chacune une fois (par identifiant). */
function phrases(donnees = chargerDonnees()) {
  const vues = new Map();
  for (const montage of Object.keys(donnees.voix)) {
    for (const p of donnees.voix[montage]) vues.set(p.id, { ...p, montage });
  }
  return [...vues.values()];
}

function fichierVoix(id) {
  const finale = path.join(FINALE, id + '.wav');
  if (fs.existsSync(finale)) return { fichier: finale, source: 'finale' };
  return { fichier: path.join(TEMOIN, id + '.wav'), source: 'temoin' };
}

/** Début et fin de la parole (seuil −42 dBFS), en secondes depuis le début du fichier. */
function mesurer(fichier) {
  const sonde = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier], { encoding: 'utf8' });
  const total = Number(sonde.stdout.trim());
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', fichier, '-af', 'silencedetect=n=-42dB:d=0.06', '-f', 'null', '-'], { encoding: 'utf8' });
  const silences = [];
  let ouvert = null;
  for (const ligne of r.stderr.split(/\r?\n/)) {
    let m = /silence_start: ([\d.]+)/.exec(ligne);
    if (m) ouvert = Number(m[1]);
    m = /silence_end: ([\d.]+)/.exec(ligne);
    if (m) { silences.push([ouvert ?? 0, Number(m[1])]); ouvert = null; }
  }
  if (ouvert !== null) silences.push([ouvert, total]);
  let debut = 0;
  let fin = total;
  const premier = silences.find(s => s[0] <= 0.001);
  if (premier) debut = premier[1];
  const dernier = silences.find(s => Math.abs(s[1] - total) < 0.01 && s[0] > debut);
  if (dernier) fin = dernier[0];
  return { total: +total.toFixed(3), debut: +debut.toFixed(3), fin: +fin.toFixed(3), duree: +(fin - debut).toFixed(3) };
}

function toutMesurer() {
  const resultat = {};
  for (const p of phrases()) {
    const { fichier, source } = fichierVoix(p.id);
    if (!fs.existsSync(fichier)) throw new Error('Voix manquante : ' + fichier);
    resultat[p.id] = { source, ...mesurer(fichier) };
  }
  fs.writeFileSync(MESURES, JSON.stringify(resultat, null, 1));
  // La même chose pour la page (les sous-titres incrustés en prennent les durées)
  fs.writeFileSync(MESURES.replace(/json$/, 'js'),
    '/* Écrit par son/voix.js — ne pas modifier à la main. */\nwindow.MESURES_VOIX = ' + JSON.stringify(resultat) + ';\n');
  return resultat;
}

function fabriquerTemoin() {
  fs.mkdirSync(TEMOIN, { recursive: true });
  const liste = phrases().map(p => ({ texte: p.dire || p.texte, sortie: path.join(TEMOIN, p.id + '.wav') }));
  const fichierListe = path.join(TEMOIN, '_liste.json');
  fs.writeFileSync(fichierListe, JSON.stringify(liste), 'utf8');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tts-windows.ps1'), '-Liste', fichierListe], { encoding: 'utf8' });
  fs.unlinkSync(fichierListe);
  if (r.status !== 0) throw new Error('Synthèse vocale : ' + (r.stderr || r.stdout));
  console.log('  voix témoin :', r.stdout.trim());
}

module.exports = { chargerDonnees, phrases, fichierVoix, mesurer, toutMesurer, MESURES };

if (require.main === module) {
  if (!process.argv.includes('--mesurer')) fabriquerTemoin();
  const m = toutMesurer();
  const donnees = chargerDonnees();
  for (const montage of Object.keys(donnees.voix)) {
    console.log(`  montage ${montage} s :`);
    const liste = donnees.voix[montage];
    liste.forEach((p, i) => {
      const x = m[p.id];
      const debut = p.debut;
      const fin = debut + x.duree;
      const suivant = liste[i + 1] ? liste[i + 1].debut : Number(montage);
      const alerte = fin > suivant - 0.05 ? `  ⚠ déborde sur la suite (${suivant.toFixed(2)} s)` : '';
      console.log(`    ${p.id} [${x.source}] ${debut.toFixed(2)} → ${fin.toFixed(2)} s  « ${p.texte} »${alerte}`);
    });
  }
}

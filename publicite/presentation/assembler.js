/* L'assemblage : le son, les sous-titres et les fichiers à livrer.
 *
 *   node publicite/presentation/assembler.js                 → tout (les 3 versions)
 *   node publicite/presentation/assembler.js --version 40-4x5
 *   node publicite/presentation/assembler.js --garder-musique → ne recalcule pas la musique
 *   node publicite/presentation/assembler.js --son-seulement  → le son et les SRT, sans encoder les vidéos
 *
 * À lancer APRÈS rendre.js (qui fournit rendus/<version>_image.mp4 et _st.mov).
 * Une voix enregistrée déposée dans son/voix/finale/ remplace la voix témoin :
 * relancer seulement ce script (les images ne changent pas ; seuls les
 * sous-titres incrustés suivent la nouvelle voix : `node rendre.js --seulement-st`).
 *
 * Pour chaque version :
 *   1. la voix : chaque phrase à son instant (donnees.js), égalisée, compressée ;
 *   2. le mixage : la musique s'efface sous la voix (compression déclenchée par
 *      la voix), bruitages par-dessus, puis −14 LUFS intégrés, crête vraie ≤ −1 dBTP
 *      (le niveau d'Instagram, Facebook, TikTok, YouTube) ;
 *   3. les fichiers : avec sous-titres incrustés (principal), sans sous-titres
 *      (pour charger le SRT dans la plateforme), sans voix (musique et bruitages) ;
 *   4. les sous-titres SRT, et un contrôle de chaque fichier produit. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const voix = require('./son/voix');
const { composer } = require('./son/composer');

const ICI = __dirname;
const RENDUS = path.join(ICI, 'rendus');
const SON = path.join(ICI, 'son', 'rendus');
const LIVRABLES = path.join(ICI, 'livrables');
const VERSIONS = {
  '40-9x16': { montage: '40', format: '9x16', nom: 'IMPACTALI_Presentation_40s_9x16' },
  '15-9x16': { montage: '15', format: '9x16', nom: 'IMPACTALI_Presentation_15s_9x16' },
  '40-4x5': { montage: '40', format: '4x5', nom: 'IMPACTALI_Presentation_40s_4x5' }
};

const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf('--' + nom); return i >= 0 ? args[i + 1] : null; };
const CHOIX = option('version') ? option('version').split(',') : Object.keys(VERSIONS);
const GARDER_MUSIQUE = args.includes('--garder-musique');
const SON_SEULEMENT = args.includes('--son-seulement');

function ff(liste, { sortie = false } = {}) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...liste], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr.split('\n').slice(-12).join('\n'));
  return sortie ? r.stderr : '';
}
const dureeFichier = f => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());

// ------------------------------------------------------------ la voix ----
function pisteVoix(montage, mesures, donnees) {
  const phrases = donnees.voix[montage];
  const duree = Number(montage);
  const entrees = [];
  const filtres = [];
  phrases.forEach((p, i) => {
    const { fichier } = voix.fichierVoix(p.id);
    entrees.push('-i', fichier);
    // Le début de la PAROLE tombe à l'instant prévu (le silence de tête est retiré)
    const decalage = Math.max(0, Math.round((p.debut - mesures[p.id].debut) * 1000));
    filtres.push(`[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${decalage}:all=1[v${i}]`);
  });
  const sortie = path.join(SON, `voix-${montage}.wav`);
  const chaine = [
    ...filtres,
    `${phrases.map((p, i) => `[v${i}]`).join('')}amix=inputs=${phrases.length}:normalize=0:duration=longest,apad,atrim=0:${duree},` +
    // Égalisation de la voix : coupe du grave, présence, compression douce
    'highpass=f=85,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.4:g=3,' +
    'acompressor=threshold=-22dB:ratio=3:attack=6:release=140:makeup=3,aformat=channel_layouts=stereo[voix]'
  ];
  ff(['-y', ...entrees, '-filter_complex', chaine.join(';'), '-map', '[voix]', '-ar', '48000', '-c:a', 'pcm_s16le', sortie]);
  return normaliser(sortie, sortie.replace('.wav', '-n.wav'), -16);
}

/** Sonie intégrée (LUFS) et crête vraie (dBTP) d'un fichier, après un filtre éventuel. */
function sonie(entree, filtre = '') {
  const m = ff(['-i', entree, '-af', `${filtre}ebur128=peak=true`, '-f', 'null', '-'], { sortie: true });
  const resume = m.slice(m.lastIndexOf('Summary'));
  return { I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(resume)[1]), TP: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(resume)[1]) };
}

/** Normalisation EBU R128 par gain linéaire (la dynamique reste intacte).
    La crête vraie visée (−2 dBTP) laisse la marge que l'encodage AAC consomme
    (il remonte les crêtes d'environ 0,5 dB) : le fichier livré reste ≤ −1 dBTP.
    Si le gain ferait dépasser cette crête, un limiteur suréchantillonné à
    192 kHz (donc sur la crête vraie) rabote d'abord les seuls impacts. */
function normaliser(entree, sortie, cible = -14, crete = -2) {
  let m = sonie(entree);
  let filtre = '';
  for (let essai = 0, marge = 0.4; essai < 4; essai++, marge += 0.4) {
    const gain = cible - m.I;
    if (m.TP + gain <= crete) break;
    const limite = Math.min(1, Math.pow(10, (crete - marge - gain) / 20));
    filtre = `aresample=192000,alimiter=limit=${limite.toFixed(4)}:attack=1:release=40:level=false,aresample=48000,`;
    m = sonie(entree, filtre);
  }
  const gain = cible - m.I;
  ff(['-y', '-i', entree, '-af', `${filtre}volume=${gain.toFixed(2)}dB,aresample=48000`, '-c:a', 'pcm_s16le', sortie]);
  return sortie;
}

// ---------------------------------------------------------- le mixage ----
function mixer(montage, fichierVoix) {
  const musique = path.join(SON, `musique-${montage}.wav`);
  const bruitages = path.join(SON, `bruitages-${montage}.wav`);
  const brut = path.join(SON, `mix-${montage}-brut.wav`);
  ff(['-y', '-i', musique, '-i', bruitages, '-i', fichierVoix, '-filter_complex', [
    '[0:a]volume=-2.5dB[mus]',
    '[1:a]volume=-1dB[bru]',
    '[mus][bru]amix=inputs=2:normalize=0[fond]',
    '[2:a]asplit=2[vx][cle]',
    // Musique et bruitages respirent sous la voix : environ −8 dB pendant les phrases, retour en 0,4 s
    '[fond][cle]sidechaincompress=threshold=0.0316:ratio=3.5:attack=22:release=400:makeup=1:knee=6[fondd]',
    '[fondd][vx]amix=inputs=2:normalize=0[m]'
  ].join(';'), '-map', '[m]', '-c:a', 'pcm_s16le', brut]);
  const final = normaliser(brut, path.join(SON, `mix-${montage}.wav`), -14);
  // Sans voix : musique et bruitages seuls
  const brutSV = path.join(SON, `mix-${montage}-sansvoix-brut.wav`);
  ff(['-y', '-i', musique, '-i', bruitages, '-filter_complex', '[0:a]volume=-2.5dB[a];[1:a]volume=-1dB[b];[a][b]amix=inputs=2:normalize=0[m]', '-map', '[m]', '-c:a', 'pcm_s16le', brutSV]);
  const sansVoix = normaliser(brutSV, path.join(SON, `mix-${montage}-sansvoix.wav`), -14);
  return { final, sansVoix };
}

// ------------------------------------------------------ les sous-titres ----
function horodatage(s) {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
/** Deux lignes au plus, 42 signes par ligne au plus, coupées au plus près du milieu. */
function couper(texte, max = 42) {
  if (texte.length <= max) return texte;
  const milieu = texte.length / 2;
  let meilleur = -1;
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === ' ' && (meilleur < 0 || Math.abs(i - milieu) < Math.abs(meilleur - milieu))) meilleur = i;
  }
  return meilleur < 0 ? texte : texte.slice(0, meilleur) + '\n' + texte.slice(meilleur + 1);
}
function sousTitres(montage, mesures, donnees) {
  const phrases = donnees.voix[montage].map(p => ({ debut: p.debut, fin: p.debut + mesures[p.id].duree, texte: p.texte }));
  // Les phrases très courtes et rapprochées (« Apprendre. Créer. Évoluer. ») forment un seul sous-titre
  const blocs = [];
  for (const p of phrases) {
    const dernier = blocs[blocs.length - 1];
    if (dernier && p.debut - dernier.fin < 0.25 && (dernier.fin - dernier.debut < 1.0 || p.fin - p.debut < 1.0) && (dernier.texte + ' ' + p.texte).length <= 80) {
      dernier.fin = Math.max(dernier.fin, p.fin);
      dernier.texte += ' ' + p.texte;
    } else blocs.push({ ...p });
  }
  const duree = Number(montage);
  return blocs.map((b, i) => {
    const suivant = blocs[i + 1] ? blocs[i + 1].debut - 0.04 : duree;
    const fin = Math.min(Math.max(b.fin + 0.3, b.debut + 1.0), suivant);
    return `${i + 1}\n${horodatage(b.debut)} --> ${horodatage(fin)}\n${couper(b.texte)}\n`;
  }).join('\n');
}

// -------------------------------------------------------------- vidéo ----
const VIDEO = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level:v', '4.2', '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-r', '30', '-g', '60'];
const AUDIO = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];

function encoder(v, { sons, avecST, sortie }) {
  const image = path.join(RENDUS, `${v}_image.mp4`);
  const st = path.join(RENDUS, `${v}_st.mov`);
  const duree = Number(VERSIONS[v].montage);
  if (!fs.existsSync(image)) throw new Error('Image absente : lancer d’abord node rendre.js --version ' + v);
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  if (avecST) {
    if (!fs.existsSync(st)) throw new Error('Sous-titres absents : node rendre.js --seulement-st --version ' + v);
    ff(['-y', '-i', image, '-i', st, '-i', sons, '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
      '-map', '[v]', '-map', '2:a', ...VIDEO, ...AUDIO, '-t', String(duree), '-movflags', '+faststart', sortie]);
  } else {
    ff(['-y', '-i', image, '-i', sons, '-map', '0:v', '-map', '1:a', ...VIDEO, ...AUDIO, '-t', String(duree), '-movflags', '+faststart', sortie]);
  }
}

/** Ce que contient un fichier livré : dimensions, cadence, durée, niveau sonore. */
function controler(fichier) {
  const sonde = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', fichier], { encoding: 'utf8' }).stdout);
  const video = sonde.streams.find(s => s.codec_type === 'video');
  const audio = sonde.streams.find(s => s.codec_type === 'audio');
  const r128 = ff(['-i', fichier, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { sortie: true });
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(r128.slice(r128.lastIndexOf('Summary')));
  const TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(r128.slice(r128.lastIndexOf('Summary')));
  return {
    fichier: path.relative(ICI, fichier),
    video: `${video.width}×${video.height}, ${video.codec_name} ${video.profile}, ${eval(video.r_frame_rate)} i/s, ${video.color_space || '?'}`,
    audio: audio ? `${audio.codec_name} ${audio.sample_rate} Hz ${audio.channels} canaux` : 'aucun',
    duree: Number(sonde.format.duration).toFixed(3) + ' s',
    taille: (Number(sonde.format.size) / 1048576).toFixed(1) + ' Mo',
    sonie: I ? I[1] + ' LUFS' : '?',
    creteVraie: TP ? TP[1] + ' dBTP' : '?'
  };
}

(async () => {
  fs.mkdirSync(SON, { recursive: true });
  fs.mkdirSync(LIVRABLES, { recursive: true });
  const donnees = voix.chargerDonnees();
  const mesures = voix.toutMesurer();
  const montages = [...new Set(CHOIX.map(v => VERSIONS[v].montage))];
  if (!GARDER_MUSIQUE) {
    console.log('Musique et bruitages');
    await composer(montages);
  }
  const sons = {};
  for (const m of montages) {
    console.log(`Voix et mixage (${m} s)`);
    const piste = pisteVoix(m, mesures, donnees);
    sons[m] = mixer(m, piste);
    const srt = path.join(LIVRABLES, `IMPACTALI_Presentation_${m}s.fr_FR.srt`);
    fs.writeFileSync(srt, sousTitres(m, mesures, donnees), 'utf8');
    console.log('  ' + path.relative(ICI, srt));
  }
  if (SON_SEULEMENT) return;
  const controles = [];
  for (const v of CHOIX) {
    const { montage, nom } = VERSIONS[v];
    console.log(`Encodage ${nom}`);
    const principal = path.join(LIVRABLES, nom + '.mp4');
    encoder(v, { sons: sons[montage].final, avecST: true, sortie: principal });
    const sansST = path.join(LIVRABLES, 'sans-sous-titres', nom + '_sans-sous-titres.mp4');
    encoder(v, { sons: sons[montage].final, avecST: false, sortie: sansST });
    const sansVoix = path.join(LIVRABLES, 'sans-voix', nom + '_sans-voix.mp4');
    encoder(v, { sons: sons[montage].sansVoix, avecST: false, sortie: sansVoix });
    for (const f of [principal, sansST, sansVoix]) {
      const c = controler(f);
      controles.push(c);
      console.log(`  ${c.fichier} — ${c.video} — ${c.duree} — ${c.sonie}, ${c.creteVraie} — ${c.taille}`);
    }
  }
  const sources = Object.fromEntries(Object.entries(mesures).map(([id, m]) => [id, m.source]));
  fs.writeFileSync(path.join(RENDUS, 'controle-livrables.json'), JSON.stringify({ le: new Date().toISOString(), voix: sources, fichiers: controles }, null, 1));
})().catch(e => { console.error(e); process.exitCode = 1; });

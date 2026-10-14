/* Les documents livrés avec la vidéo :
 *   livrables/storyboard/storyboard.html   le storyboard (vignettes tirées des vidéos finales)
 *   livrables/VOIX-OFF.md                  le texte final de la voix, phrase par phrase, avec ses créneaux
 *   livrables/images-cles/                 les trois images clés de la direction artistique (+ leurs versions 4:5)
 *
 *   node publicite/presentation/outils/documents.js     (après assembler.js) */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const voix = require('../son/voix');

const ICI = path.resolve(__dirname, '..');
const LIVRABLES = path.join(ICI, 'livrables');
const SB = path.join(LIVRABLES, 'storyboard');
const VIDEOS = {
  '40-9x16': path.join(LIVRABLES, 'IMPACTALI_Presentation_40s_9x16.mp4'),
  '15-9x16': path.join(LIVRABLES, 'IMPACTALI_Presentation_15s_9x16.mp4'),
  '40-4x5': path.join(LIVRABLES, 'IMPACTALI_Presentation_40s_4x5.mp4')
};

function image(video, t, sortie, largeur) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', `scale=${largeur}:-2:flags=lanczos`, sortie]);
  if (r.status !== 0) throw new Error(String(r.stderr));
}
const tc = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------ storyboard ----
/* Plan par plan. `vues` : instants des vignettes. */
const PLANS_40 = [
  {
    debut: 0, fin: 3, titre: 'Accroche', vues: [0.5, 1.6, 2.6],
    ecran: '« Votre / prochaine / compétence / commence / ici. » — « compétence » passe au vert citron.',
    image: 'Fond nuit #050709, lueur verte discrète. Typographie Plus Jakarta Sans ExtraBold, très grande, alignée à gauche.',
    animation: 'Chaque ligne monte de son masque (0 – 1 s), décalée. Le fil vert souligne « compétence » et le repeint au passage (0,98 – 1,42 s). Tout se stabilise, puis sort par le haut ; le fil file vers le logo.',
    son: 'Voix : « Votre prochaine compétence commence ici. » Musique : nappe filtrée, une note par ligne, scintillement sur le soulignement, montée vers 3 s.'
  },
  {
    debut: 3, fin: 7, titre: 'La marque', vues: [3.3, 4.4, 6.0],
    ecran: 'Logo officiel IMPACTALI (vert). « Plateforme de formation & de développement des compétences ». La page d’accueil réelle du site.',
    image: 'Logo centré, signature dessous ; puis téléphone : capture fidèle de l’accueil (bandeau de date retiré : la vidéo est vue dans les deux pays).',
    animation: 'Le fil balaie sous le logo et le dévoile de gauche à droite. À 4,85 s le logo monte et se réduit, le téléphone s’élève ; le fil en dessine le contour ; défilement sobre de la page.',
    son: 'Voix : « Bienvenue sur IMPACTALI. » Impact au logo, rythme à demi-temps, montée douce sous le téléphone.'
  },
  {
    debut: 7, fin: 15, titre: 'Les domaines', vues: [8.6, 10.6, 12.6, 14.6],
    ecran: 'Créer — Canva Pro & Création de contenu · Graphisme & identité visuelle. Communiquer — Marketing digital. Produire — Réalisation et Montage vidéo. Accélérer — Création de site web avec iA.',
    image: 'Une carte par usage, avec sa réalisation animée : composition graphique, calendrier de publication, séquence de montage (l’aperçu montre un extrait réel du cours), site web assisté par l’IA.',
    animation: 'Le téléphone se transforme en première carte (forme apparentée). Les cartes suivantes glissent en profondeur ; le fil redessine chaque contour. Le verbe monte de son masque, puis se pose.',
    son: 'Voix : « Création de contenu, communication, photo, vidéo, intelligence artificielle : » Rythme plein (le passage le plus énergique), un souffle à chaque carte.'
  },
  {
    debut: 15, fin: 18, titre: 'Récapitulatif', vues: [16.5],
    ecran: '« Développez les compétences qui font avancer vos projets. » Les quatre usages. « À venir · Informatique & outils bureautiques ».',
    image: 'Grille de quatre vignettes ; la mention « À venir » en pointillés, volontairement plus discrète que les formations ouvertes.',
    animation: 'La dernière carte rejoint sa case, les trois autres reviennent ; le fil souligne « vos projets ».',
    son: 'Voix : « développez les compétences qui font avancer vos projets. » Éclat, puis le rythme se retire.'
  },
  {
    debut: 18, fin: 25.5, titre: 'Apprendre en faisant', vues: [18.4, 20.9, 24.0],
    ecran: '« Apprendre en faisant. » « Des formations pratiques. » « Des projets concrets. » Légendes : « En classe · Promotion 2026 », « Une création, pas à pas ».',
    image: 'Extraits RÉELS des cours (Promotion 2026, publiés dans la section « En classe » du site) : le formateur explique, une création Canva projetée, l’écosystème des outils, la salle.',
    animation: 'Le titre se pose en grand, puis monte. Les fenêtres s’ouvrent comme un rideau ; l’image se pose en douceur. Le fil entoure la création en cours.',
    son: 'Voix : « Des formations pratiques et des projets concrets, pour apprendre en faisant. » Moment calme : nappe et notes douces ; le rythme revient ensuite.'
  },
  {
    debut: 25.5, fin: 33.5, titre: 'Le parcours sur le site', vues: [27.9, 29.6, 31.6],
    ecran: '1 Choisir une formation · 2 Découvrir le programme · 3 Accéder à l’inscription. « Via le formulaire officiel. Place confirmée après validation du paiement. »',
    image: 'Captures fidèles du site (servi en local) : carte Canva Pro « Inscriptions ouvertes », programme en 4 modules, formulaire officiel à l’étape 1, champs vides. Ni tarif, ni date, ni lieu, ni numéro.',
    animation: 'Le fil relie les étapes. Chaque capture défile vers l’essentiel ; un appui du doigt sur « Voir la formation » puis sur « S’inscrire à cette formation ». Aucune inscription ni paiement simulé.',
    son: 'Voix : « Choisissez la formation adaptée à vos objectifs, découvrez son programme, puis accédez à l’inscription. » Rythme posé, un carillon par étape, un clic par appui.'
  },
  {
    debut: 33.5, fin: 40, titre: 'L’appel à l’action', vues: [34.4, 36.4, 38.5],
    ecran: 'Logo. « Apprendre. Créer. Évoluer. » Bouton « Découvrir les formations ». « Inscrivez-vous sur www.impactali.site ».',
    image: 'Écran final stable dès 37,2 s (près de 3 s de lecture pleine). Adresse vérifiée le 10/10/2026.',
    animation: 'Le fil dévoile le logo, puis dessine le contour du bouton qui se remplit de vert ; il finit en soulignant l’adresse.',
    son: 'Voix : « IMPACTALI. Apprendre. Créer. Évoluer. Découvrez votre prochaine formation sur notre site. » Impact, un accent par mot, carillon du bouton, accord final.'
  }
];

const PLANS_15 = [
  { debut: 0, fin: 2.5, titre: 'Accroche', vues: [1.5], ecran: 'Même accroche que la version 40 s, plus resserrée.', image: '', animation: '', son: 'Voix : « Votre prochaine compétence commence ici. »' },
  { debut: 2.5, fin: 3.5, titre: 'La marque', vues: [3.2], ecran: 'Logo et signature.', image: '', animation: 'Balayage du fil sous le logo.', son: 'Voix : « IMPACTALI. »' },
  { debut: 3.5, fin: 9, titre: 'Les domaines', vues: [4.6, 5.8, 7.2, 8.6], ecran: 'Créer · Communiquer · Produire · Accélérer, une carte toutes les 1,4 s.', image: '', animation: 'Mêmes cartes, mêmes réalisations, au pas rapide.', son: 'Voix : « Création de contenu, communication, photo, vidéo, intelligence artificielle. »' },
  { debut: 9, fin: 11.75, titre: 'Apprendre en faisant', vues: [10.6], ecran: '« Apprendre en faisant. » « Des formations pratiques. »', image: 'Un extrait réel : le formateur en cours.', animation: '', son: 'Voix : « Des formations pratiques, pour apprendre en faisant. »' },
  { debut: 11.75, fin: 15, titre: 'L’appel à l’action', vues: [12.9, 14.5], ecran: 'Logo, slogan, bouton, adresse.', image: 'Écran final stable dès 13,9 s.', animation: '', son: 'Voix : « Inscrivez-vous sur notre site. »' }
];

function storyboard() {
  fs.mkdirSync(path.join(SB, 'vignettes'), { recursive: true });
  const sections = [];
  for (const [nom, plans, video, largeur] of [['40 s · 9:16', PLANS_40, VIDEOS['40-9x16'], 300], ['15 s · 9:16', PLANS_15, VIDEOS['15-9x16'], 240]]) {
    const lignes = plans.map((p, i) => {
      const vignettes = p.vues.map(t => {
        const f = `vignettes/${nom.startsWith('40') ? 'p40' : 'p15'}-${t.toFixed(1)}.jpg`;
        image(video, t, path.join(SB, f), largeur);
        return `<figure><img src="${f}" alt="" loading="lazy"><figcaption>${tc(t)}</figcaption></figure>`;
      }).join('');
      return `<tr><td class="tc">${tc(p.debut)}<br>→ ${tc(p.fin)}</td><td><h3>${i + 1}. ${html(p.titre)}</h3><div class="vignettes">${vignettes}</div></td>
        <td><dl>${p.ecran ? `<dt>À l’écran</dt><dd>${html(p.ecran)}</dd>` : ''}${p.image ? `<dt>Image</dt><dd>${html(p.image)}</dd>` : ''}${p.animation ? `<dt>Animation</dt><dd>${html(p.animation)}</dd>` : ''}${p.son ? `<dt>Voix et son</dt><dd>${html(p.son)}</dd>` : ''}</dl></td></tr>`;
    }).join('\n');
    sections.push(`<h2>Version ${nom}</h2><table><thead><tr><th>Temps</th><th>Plan</th><th>Description</th></tr></thead><tbody>${lignes}</tbody></table>`);
  }
  // L'adaptation 4:5 : une vignette par séquence, côte à côte avec la 9:16
  const comparaison = [3.3, 8.6, 16.5, 20.9, 29.6, 38.5].map(t => {
    const a = `vignettes/c916-${t.toFixed(1)}.jpg`;
    const b = `vignettes/c45-${t.toFixed(1)}.jpg`;
    image(VIDEOS['40-9x16'], t, path.join(SB, a), 200);
    image(VIDEOS['40-4x5'], t, path.join(SB, b), 250);
    return `<div class="paire"><img src="${a}" alt=""><img src="${b}" alt=""><span>${tc(t)}</span></div>`;
  }).join('');
  const page = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storyboard IMPACTALI</title>
<style>
  :root { --nuit:#050709; --surface:#07111D; --vert:#CBFD00; --creme:#F6F5EF; --doux:#9CA6B2; }
  body { margin:0; background:var(--nuit); color:var(--creme); font:16px/1.5 Inter, system-ui, sans-serif; }
  main { max-width:1180px; margin:0 auto; padding:32px 16px 80px; }
  h1 { font:800 40px/1.1 'Plus Jakarta Sans', system-ui, sans-serif; letter-spacing:-.03em; margin:0 0 8px; }
  h1 span { color:var(--vert); }
  h2 { font:800 26px/1.2 'Plus Jakarta Sans', system-ui, sans-serif; margin:48px 0 16px; }
  h3 { margin:0 0 10px; font:700 18px/1.2 Inter, sans-serif; }
  p.intro { color:var(--doux); max-width:760px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; color:var(--doux); font-weight:600; font-size:13px; text-transform:uppercase; letter-spacing:.08em; padding:8px; border-bottom:1px solid rgba(255,255,255,.12); }
  td { vertical-align:top; padding:16px 8px; border-bottom:1px solid rgba(255,255,255,.08); }
  td.tc { font-variant-numeric:tabular-nums; color:var(--vert); font-weight:700; white-space:nowrap; }
  .vignettes { display:flex; gap:8px; flex-wrap:wrap; }
  figure { margin:0; } figure img { display:block; width:150px; border-radius:10px; border:1px solid rgba(255,255,255,.12); }
  figcaption { font-size:12px; color:var(--doux); text-align:center; }
  dl { margin:0; } dt { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--vert); margin-top:8px; } dd { margin:2px 0 0; }
  .paires { display:flex; gap:20px; flex-wrap:wrap; }
  .paire { display:flex; gap:6px; align-items:flex-end; position:relative; padding-bottom:20px; }
  .paire img { border-radius:8px; border:1px solid rgba(255,255,255,.12); width:110px; } .paire img + img { width:140px; }
  .paire span { position:absolute; bottom:0; left:0; font-size:12px; color:var(--doux); }
  @media (max-width:760px) { td:nth-child(1) { display:none; } figure img { width:110px; } }
</style></head><body><main>
<h1>Storyboard <span>IMPACTALI</span> — présentation</h1>
<p class="intro">Fil conducteur : « Votre prochaine compétence commence ici. » Une intention devient une compétence, puis une réalisation concrète. Le fil vert citron relie les séquences : il souligne l’accroche, devient le contour du téléphone et des cartes, accompagne une réalisation, trace le parcours d’inscription et finit en bouton. Vignettes tirées des vidéos finales (sous-titres incrustés compris).</p>
${sections.join('\n')}
<h2>Adaptation 4:5 — une composition réorganisée</h2>
<p class="intro">À gauche la 9:16, à droite la 4:5 au même instant : logo à gauche et téléphone à droite, formations sous la carte, fenêtres côte à côte, étapes en colonne à droite de l’écran du site, appel centré sur deux lignes.</p>
<div class="paires">${comparaison}</div>
</main></body></html>`;
  fs.writeFileSync(path.join(SB, 'storyboard.html'), page, 'utf8');
  console.log('  ' + path.relative(ICI, path.join(SB, 'storyboard.html')));
}

// ------------------------------------------------------------- voix off ----
function texteVoix() {
  const d = voix.chargerDonnees();
  const m = JSON.parse(fs.readFileSync(voix.MESURES, 'utf8'));
  let md = `# Voix off — texte final\n\nVoix française naturelle, chaleureuse et assurée ; débit posé, sourire dans la voix. Les phrases sont **enregistrées une par une** (un fichier WAV par ligne, 48 kHz, 24 bits, sans musique), puis placées à leur instant par le mixage : le créneau indique la durée à ne pas dépasser.\n\n**Prononciation** : IMPACTALI se dit « im-pak-ta-li » (comme « Impact Ali ») — à faire confirmer par le propriétaire.\n\nLa voix des fichiers actuels est une **voix témoin** (synthèse vocale de Windows) : elle cale le rythme, elle n'est pas destinée à la diffusion.\n\n**Le slogan d'une traite** (version 40 s, a12 à a15) : plutôt que quatre fichiers très courts, on peut enregistrer « IMPACTALI. Apprendre. Créer. Évoluer. » en une seule prise, calée sur les mots qui apparaissent à l'écran (« Apprendre » à 34,35 s, « Créer » à 35,10 s, « Évoluer » à 35,65 s) et finie avant 36,3 s. La déposer sous \`a12.wav\`, et déposer sous \`a13.wav\`, \`a14.wav\`, \`a15.wav\` une seconde de silence : le mixage et les sous-titres suivent d'eux-mêmes.\n`;
  for (const montage of ['40', '15']) {
    const liste = d.voix[montage];
    md += `\n## Version ${montage} s\n\n| Fichier | Début | Créneau max. | Durée témoin | Texte |\n|---|---|---|---|---|\n`;
    liste.forEach((p, i) => {
      const suivant = liste[i + 1] ? liste[i + 1].debut : Number(montage) - 0.4;
      md += `| \`son/voix/finale/${p.id}.wav\` | ${p.debut.toFixed(2)} s | ${(suivant - p.debut - 0.12).toFixed(2)} s | ${m[p.id].duree.toFixed(2)} s | ${p.texte} |\n`;
    });
    md += `\nTexte suivi : ${liste.map(p => p.texte).join(' ')}\n`;
  }
  md += `\n## Différences avec le texte de base du brief\n\n- 25 – 33 s : « Découvrez les programmes, choisissez la formation adaptée à vos objectifs et consultez les modalités d’inscription » devient « Choisissez la formation adaptée à vos objectifs, découvrez son programme, puis accédez à l’inscription » — même sens, dans l’ordre des trois étapes montrées à l’écran.\n- Version 15 s : texte resserré (même vocabulaire), terminé par « Inscrivez-vous sur notre site. » puisque des sessions sont ouvertes (vérifié le 10/10/2026). Si les inscriptions ferment : remplacer par « Découvrez nos formations sur notre site. » (donnees.js, phrase b08).\n`;
  fs.writeFileSync(path.join(LIVRABLES, 'VOIX-OFF.md'), md, 'utf8');
  console.log('  livrables/VOIX-OFF.md');
}

// --------------------------------------------------------- images clés ----
function imagesCles() {
  const dossier = path.join(LIVRABLES, 'images-cles');
  fs.mkdirSync(dossier, { recursive: true });
  const cles = [[1.9, '1-accroche'], [8.7, '2-domaine-creer'], [38.5, '3-appel']];
  for (const [t, nom] of cles) {
    // Sans sous-titres : l'image telle que dessinée
    const sans = f => path.join(LIVRABLES, 'sans-sous-titres', path.basename(f, '.mp4') + '_sans-sous-titres.mp4');
    image(sans(VIDEOS['40-9x16']), t, path.join(dossier, `${nom}_9x16.png`), 1080);
    image(sans(VIDEOS['40-4x5']), t, path.join(dossier, `${nom}_4x5.png`), 1080);
  }
  console.log('  livrables/images-cles/ (3 images × 2 formats)');
}

// ------------------------------------------- notice, licences, couvertures ----
function copies() {
  fs.copyFileSync(path.join(ICI, 'LISEZMOI.md'), path.join(LIVRABLES, 'NOTICE.md'));
  fs.copyFileSync(path.join(ICI, 'LICENCES.md'), path.join(LIVRABLES, 'LICENCES.md'));
  const dossier = path.join(LIVRABLES, 'couverture');
  fs.mkdirSync(dossier, { recursive: true });
  for (const format of ['9x16', '4x5']) {
    const png = path.join(ICI, 'rendus', 'couverture', `couverture-${format}.png`);
    if (!fs.existsSync(png)) throw new Error('Couverture absente : node rendre.js --couverture');
    fs.copyFileSync(png, path.join(dossier, `IMPACTALI_Presentation_couverture_${format}.png`));
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '2', path.join(dossier, `IMPACTALI_Presentation_couverture_${format}.jpg`)]);
    if (r.status !== 0) throw new Error(String(r.stderr));
  }
  console.log('  livrables/NOTICE.md, LICENCES.md, couverture/');
}

storyboard();
texteVoix();
imagesCles();
copies();

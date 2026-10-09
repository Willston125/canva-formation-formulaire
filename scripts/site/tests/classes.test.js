/* « En classe » : les vidéos se lancent seules, sur place.
 *
 * Décision du propriétaire (9 octobre 2026) : comme sur les réseaux sociaux,
 * une vidéo démarre quand on arrive dessus, sans le son, dans son cadre — elle
 * ne s'ouvre plus en grand — et s'arrête quand on la quitte. Ce que cette
 * épreuve garde : les réglages qui rendent cela possible sur un téléphone, le
 * respect de l'économie de données, et la bande qui n'est pas redessinée (ce
 * qui couperait la vidéo en cours) à chaque retour du catalogue. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const landing = fs.readFileSync(path.join(RACINE, 'landing.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Corps d'une fonction, délimité par comptage d'accolades — à partir de « ) { » :
    les paramètres déstructurés (« { muet, visible } ») ont aussi des accolades. */
function corpsDe(source, entete) {
  const debut = source.indexOf(entete);
  if (debut < 0) return '';
  let profondeur = 0;
  for (let j = source.indexOf(') {', debut) + 2; j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}' && !--profondeur) return source.slice(debut, j + 1);
  }
  return '';
}

const lancer = corpsDe(landing, 'function lancerSurPlace(');
const rendu = corpsDe(landing, 'function renderClasses(');
const observer = corpsDe(landing, 'function observerClasses(');
verifier('les fonctions de la bande sont retrouvées', [lancer, rendu, observer].every(c => c.length > 200), true);

// --- 1. Elle part seule, sans le son, sur place --------------------------------

/* Sans « mute », aucun navigateur ne lance une vidéo seul ; sans
   « playsinline », l'iPhone l'ouvrirait en plein écran. */
verifier('le lecteur démarre seul', /autoplay: '1'/.test(lancer), true);
verifier('sans le son quand il part seul', /mute: muet \? '1' : '0'/.test(lancer)
  && /lancerSurPlace\(carte, \{ muet: true/.test(observer), true);
verifier('dans son cadre, même sur iPhone', /playsinline: '1'/.test(lancer), true);
verifier('en boucle, comme un Short', /loop: '1', playlist: id/.test(lancer), true);
verifier('commandable depuis la page (pause, reprise)', /enablejsapi: '1'/.test(lancer), true);
verifier('sous-titres automatiques en français, pas en anglais', /hl: 'fr', cc_lang_pref: 'fr'/.test(lancer), true);
verifier('chez youtube-nocookie', /const ORIGINE_YOUTUBE = 'https:\/\/www\.youtube-nocookie\.com';/.test(landing), true);
verifier('elle ne s’ouvre plus en grand', /ouvrirRealisation/.test(rendu), false);

// --- 2. Elle s'arrête quand on la quitte, reprend au retour ---------------------

verifier('elle démarre à 60 % visible, s’arrête en dessous', /const PART_VISIBLE = 0\.6;/.test(landing)
  && /if \(!visible\) arreter\(lecteur\);/.test(observer), true);
verifier('une page en arrière-plan arrête tout', /if \(document\.hidden\) \{ lecteurs\.forEach\(arreter\); return; \}/.test(landing), true);
verifier('au retour sur l’onglet, ce qui est sous les yeux démarre sans attendre un défilement',
  /cartesEnVue\.forEach\(carte => \{/.test(landing), true);
verifier('une vidéo mise en pause par le visiteur reste en pause',
  /if \(!lecteur\.arreteParNous\) return;/.test(corpsDe(landing, 'function reprendre(')), true);

// --- 3. Économie de données ------------------------------------------------------

const permise = corpsDe(landing, 'function lectureAutomatiquePermise(');
verifier('le réglage « économie de données » du téléphone est respecté', /navigator\.connection\.saveData/.test(permise), true);
verifier('comme « animations réduites »', /prefers-reduced-motion: reduce/.test(permise), true);
verifier('rien ne part seul sans autorisation', /if \(!lectureAutomatiquePermise\(\)\) return;/.test(observer), true);

// --- 4. La bande n'est pas redessinée pour rien ---------------------------------

verifier('la bande n’est reconstruite que si son contenu change',
  /if \(signature === signatureClasses && piste\.children\.length\) return;/.test(rendu), true);
verifier('et chaque vidéo a un vrai bouton de lecture, nommé',
  /class="classe-video__demarrer" aria-label="\$\{escapeHtml\('Lire la vidéo : ' \+ titre\)\}"/.test(rendu), true);
verifier('« Regarder l’extrait » la lit sur place, avec le son',
  /'\.classe-video__demarrer, \.classe-video__regarder'/.test(rendu) && /regarderAvecLeSon\(/.test(rendu), true);

// --- 5. La maquette du 9 octobre 2026 : étiquette, badge, atout du pays -------------

/* On EXÉCUTE les deux règles de lecture des données : une règle lue dans le
   texte du source passerait devant une implémentation fausse. */
const vm = require('vm');
const bac = {};
vm.createContext(bac);
vm.runInContext([
  landing.match(/const estEnClasse = [^\n]+/)[0],
  corpsDe(landing, 'function etiquetteDeClasse('),
  corpsDe(landing, 'function decouperTitreDeClasse('),
  'globalThis.r = { estEnClasse, etiquetteDeClasse, decouperTitreDeClasse };'
].join('\n'), bac);
verifier('« En classe » et « En classe · Sur Canva » vont tous deux dans la section',
  ['En classe', 'En classe · Sur Canva', 'en classe', 'Vidéo', 'Classe'].map(c => bac.r.estEnClasse({ category: c })),
  [true, true, true, false, false]);
verifier('l’étiquette vient de la catégorie',
  ['En classe', 'En classe · Sur Canva'].map(bac.r.etiquetteDeClasse), ['En classe', 'Sur Canva']);
verifier('le badge et le titre viennent du titre',
  [bac.r.decouperTitreDeClasse('Promotion 2026 · Le cours, en pratique'), bac.r.decouperTitreDeClasse('Le cours')],
  [{ promo: 'Promotion 2026', titre: 'Le cours, en pratique' }, { promo: '', titre: 'Le cours' }]);
verifier('l’atout « Cours en… » est celui du pays du visiteur, et rien hors marché',
  /if \(mode === 'Présentiel'\) return 'Cours en présentiel';/.test(landing)
  && /if \(mode === 'En ligne'\) return 'Cours en ligne, en direct';/.test(landing)
  && /mode\.hidden = !texte;/.test(rendu), true);
verifier('les pastilles ne recouvrent pas la vidéo d’un voile',
  /<span class="classe-video__etiquette">/.test(rendu) && !/gradient/.test(
    (fs.readFileSync(path.join(RACINE, 'style.css'), 'utf8').match(/\.classe-video__(etiquette|promo|media)[^{]*\{[^}]*\}/g) || []).join('')), true);
verifier('le lecteur a un titre pour les lecteurs d’écran', /iframe\.title = /.test(lancer), true);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

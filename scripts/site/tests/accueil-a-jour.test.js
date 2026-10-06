/* L'accueil doit montrer le catalogue de la feuille, et l'adresse du bon pays.
 *
 * Trois défauts, tous visibles sur la page publiée :
 *
 * 1. LE CARROUSEL NE SUIVAIT QUE LES SLUGS. Il n'était reconstruit que si la
 *    LISTE des formations changeait : un titre, une promesse, une photo ou un
 *    badge corrigés dans le tableau de bord restaient ceux du dernier
 *    déploiement. C'est le premier bloc que voit un visiteur.
 *
 * 2. LE PREMIER RENDU PARTAIT DES DONNÉES DU FICHIER. `FORMATIONS` était lu à
 *    l'analyse du script, avant que site-common.js n'ait posé le catalogue
 *    mémorisé. La page affichait donc l'ancienne version, puis la vraie : une
 *    photo et un badge qui changent sous les yeux à chaque visite.
 *
 * 3. LES CARTES DE SESSION ANNONÇAIENT `session.location` ET `session.mode`
 *    BRUTS, sans passer par la résolution par pays. Une session cochée
 *    Djibouti et Comores affichait « Saalam Tower, 5ème étage, Djibouti » à un
 *    candidat comorien — la fiche, elle, avait déjà été corrigée. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const landing = fs.readFileSync(path.join(RACINE, 'landing.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Corps d'une fonction, délimité par comptage d'accolades. */
function corpsDe(source, entete) {
  const debut = source.indexOf(entete);
  if (debut < 0) throw new Error('fonction introuvable : ' + entete);
  let profondeur = 0;
  for (let j = source.indexOf('{', debut); j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}') {
      profondeur--;
      if (!profondeur) return source.slice(debut, j + 1);
    }
  }
  throw new Error('accolade de fin introuvable : ' + entete);
}

// ------------------------- 1. LE CARROUSEL SUIT LE FOND -------------------------

verifier('le contenu du carrousel est calculable à part',
  landing.indexOf('function contenuDuCarrousel(') >= 0, true);

const init = corpsDe(landing, 'function initTrainingCarousel(');
verifier('le carrousel se construit à partir de ce contenu',
  /contenuDuCarrousel\(\)/.test(init), true);

/* La comparaison par slugs était le défaut : elle ne voyait ni un titre, ni une
   photo, ni un badge changés. On compare désormais ce qui serait AFFICHÉ. */
verifier('la liste des slugs ne décide plus de la reconstruction',
  /f\.slug\)\.join\('\|'\)/.test(landing), false);

const debutCat = landing.indexOf("addEventListener('impactali:catalogue'");
const ecouteurCatalogue = debutCat < 0 ? '' : landing.slice(debutCat, landing.indexOf('\n        });', debutCat));
verifier('un écouteur du catalogue est bien trouvé', ecouteurCatalogue.length > 40, true);
verifier('il compare le contenu réel du carrousel',
  /contenuDuCarrousel\(\)/.test(ecouteurCatalogue), true);
verifier('et il le reconstruit quand ce contenu a changé',
  /initTrainingCarousel\(\)/.test(ecouteurCatalogue), true);

/* Les badges des cartes dépendent du PAYS : « Inscriptions ouvertes » n'a pas
   le même sens là où la session n'est pas proposée. Le carrousel doit donc
   suivre aussi un changement de pays. */
const debutPays = landing.indexOf("addEventListener('impactali:pays'");
const ecouteurPays = debutPays < 0 ? '' : landing.slice(debutPays, landing.indexOf('\n        });', debutPays));
verifier('un écouteur du pays est bien trouvé', ecouteurPays.length > 40, true);
verifier('le carrousel suit aussi le changement de pays',
  /contenuDuCarrousel\(\)/.test(ecouteurPays) && /initTrainingCarousel\(\)/.test(ecouteurPays), true);

// ------------------- 2. LE PREMIER RENDU PART DES VRAIES DONNÉES -------------------

const debutPret = landing.indexOf("document.addEventListener('DOMContentLoaded'");
const auChargement = debutPret < 0 ? '' : landing.slice(debutPret);
const relecture = auChargement.indexOf('FORMATIONS = visibles(window.FORMATIONS)');
const premierRendu = auChargement.indexOf('initTrainingCarousel()');
verifier('les données sont relues au chargement', relecture >= 0, true);
verifier('et AVANT le premier rendu', relecture >= 0 && relecture < premierRendu, true);

// ------------------- 3. LIEU ET MODE PASSENT PAR LE PAYS -------------------

verifier('la carte de session n’annonce plus le lieu brut',
  /escapeHtml\(session\.location\)/.test(landing), false);
verifier('ni le mode brut',
  /escapeHtml\(session\.mode\)/.test(landing), false);

/* On EXÉCUTE la résolution : une règle lue dans le texte du source passerait
   devant une implémentation fausse. */
const bac = { common: null };
vm.createContext(bac);
vm.runInContext([
  corpsDe(landing, 'function lieuEtMode(session)'),
  'globalThis.__lieuEtMode = lieuEtMode;'
].join('\n'), bac);
const lieuEtMode = bac.__lieuEtMode;

/* Un faux site-common qui répond comme le vrai : le lieu d'une session à
   plusieurs pays n'est donné à aucun, et un pays en ligne n'a pas de lieu. */
const faireCommon = (lieu, mode) => ({
  paysActif: () => ({ code: 'KM' }),
  lieuDeSession: () => lieu,
  modeDeSession: () => mode
});

bac.common = faireCommon('American corner', 'Présentiel');
verifier('le lieu et le mode du pays s’affichent ensemble',
  lieuEtMode({ location: 'Saalam Tower', mode: 'Présentiel' }), 'American corner · Présentiel');

/* LE CAS QUI A CAUSÉ LE DÉFAUT : session cochée dans deux pays, sans lieu
   propre. Le site ne doit rien annoncer plutôt que l'adresse d'un autre pays. */
bac.common = faireCommon('', 'Présentiel');
verifier('sans lieu, le mode s’affiche seul, sans séparateur orphelin',
  lieuEtMode({ location: 'Saalam Tower, 5ème étage, Djibouti', pays: 'DJ,KM', mode: 'Présentiel' }),
  'Présentiel');

bac.common = faireCommon('', 'En ligne');
verifier('une session en ligne annonce son mode, et aucun lieu',
  lieuEtMode({ location: 'Saalam Tower', mode: 'En ligne' }), 'En ligne');

bac.common = faireCommon('', '');
verifier('sans rien de connu, la ligne est vide et sera omise',
  lieuEtMode({ location: '', mode: '' }), '');

/* Repli quand site-common n'expose pas encore la résolution : on ne veut ni
   page blanche ni exception, seulement les valeurs brutes. */
bac.common = { paysActif: () => null };
verifier('sans résolution disponible, les valeurs de la session servent de repli',
  lieuEtMode({ location: 'Saalam Tower', mode: 'Présentiel' }), 'Saalam Tower · Présentiel');

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

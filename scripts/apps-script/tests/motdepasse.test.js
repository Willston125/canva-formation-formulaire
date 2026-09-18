/* Le mot de passe du tableau de bord doit survivre au remplacement du code.
 *
 * Il vivait dans une constante du fichier. Or mettre le script à jour, c'est
 * recoller ce fichier ENTIER : la constante repartait à « CHANGEZ-MOI », et il
 * fallait retaper la phrase de passe à chaque fois. L'oublier ferme
 * l'administration — le script refuse le mot de passe par défaut, à raison.
 *
 * Il est donc cherché d'abord dans les propriétés du script, qu'un
 * remplacement de code ne touche pas. La constante reste acceptée en repli. */
'use strict';

const CHEMIN_GS = require('path').resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const vm = require('vm');
const evaluer = (code) => vm.runInContext(code, bac);
const proprietes = () => bac.PropertiesService.getScriptProperties();

// --- 1. Sans propriété, la constante fait foi ---
/* L'émulateur pose « motdepasse-de-test » dans la constante. */
verifier('la constante est acceptée quand aucune propriété n’existe',
  evaluer('verifierMotDePasse("motdepasse-de-test")'), true);
verifier('et un mot de passe faux est refusé',
  evaluer('verifierMotDePasse("autre-chose")'), false);

// --- 2. La propriété l'emporte ---
proprietes().setProperty('MOT_DE_PASSE_ADMIN', 'phrase-rangee-dans-les-proprietes');
verifier('la propriété l’emporte sur la constante',
  evaluer('verifierMotDePasse("phrase-rangee-dans-les-proprietes")'), true);
verifier('et la constante ne vaut plus rien',
  evaluer('verifierMotDePasse("motdepasse-de-test")'), false);

// --- 3. Elle survit à un remplacement du code ---
/* C'est tout l'intérêt : on rejoue le fichier par-dessus, comme une mise à
   jour dans l'éditeur, et la constante retombe sur le texte d'origine. */
const source = require('fs').readFileSync(CHEMIN_GS, 'utf8');
vm.runInContext(source, bac, { filename: CHEMIN_GS });
verifier('la constante est bien revenue à sa valeur d’usine',
  evaluer('MOT_DE_PASSE_ADMIN'), 'CHANGEZ-MOI-avant-de-deployer');
verifier('mais le mot de passe rangé dans les propriétés fonctionne toujours',
  evaluer('verifierMotDePasse("phrase-rangee-dans-les-proprietes")'), true);
verifier('l’état annonce un mot de passe configuré',
  evaluer('etatDuScript().motDePasseConfigure'), true);

// --- 4. Ni l'un ni l'autre : l'administration reste fermée ---
proprietes().deleteProperty('MOT_DE_PASSE_ADMIN');
verifier('sans propriété ET avec la constante d’usine, tout est refusé',
  evaluer('verifierMotDePasse("CHANGEZ-MOI-avant-de-deployer")'), false);
verifier('et l’état le dit',
  evaluer('etatDuScript().motDePasseConfigure'), false);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

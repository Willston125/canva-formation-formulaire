/* Ce que le tableau de bord enregistre doit se voir — et ce qu'il masque doit
   disparaître. Quatre défauts mesurés dans le navigateur, gardés ici au niveau
   de la source : l'épreuve ne rejoue pas le navigateur, elle empêche le retour
   des lignes exactes qui produisaient chaque défaut.

   1. « Visible sur le site » ne retirait la formation de rien.
   2. Le nettoyeur de texte enrichi effaçait la classe des icônes, qui sont des
      ligatures : « check_circle » s'affichait en toutes lettres.
   3. Après une suppression réussie, le bouton de confirmation restait désactivé.
   4. Supprimer la dernière réalisation faisait réapparaître celles du fichier. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const landing = lire('landing.js');
const commun = lire('site-common.js');
const admin = lire('admin/admin.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. Une formation masquée ne paraît nulle part sur l'accueil ---

/* Le serveur renvoie TOUT : le tableau de bord doit voir les fiches masquées.
   C'est donc au site de trier, et il ne le faisait pas. */
verifier('le serveur ne filtre pas lui-même (sinon ce contrôle ne sert à rien)',
  /active/.test(lire('scripts/apps-script/impactali-inscriptions.gs')
    .slice(lire('scripts/apps-script/impactali-inscriptions.gs').indexOf('function lireCatalogue'),
           lire('scripts/apps-script/impactali-inscriptions.gs').indexOf('function lireTable'))), false);

verifier('l’accueil écarte les formations masquées',
  /const visibles = liste => \(Array\.isArray\(liste\) \? liste : \[\]\)\.filter\(f => f && f\.active !== false\);/.test(landing), true);

const affectations = (landing.match(/FORMATIONS = /g) || []).length;
const filtrees = (landing.match(/FORMATIONS = visibles\(window\.FORMATIONS\)/g) || []).length;
verifier('chaque affectation de FORMATIONS passe par le filtre', filtrees, affectations);

verifier('le calendrier écarte les sessions d’une formation masquée',
  /const f = FORMATIONS\.find\(x => x\.formId === session\.formId\);\s*\n\s*return !f \|\| f\.active !== false;/.test(commun), true);

// --- 2. Le nettoyeur garde la classe des icônes, et rien d'autre ---

verifier('la classe des icônes est explicitement autorisée',
  /const CLASSES_SURES = \['material-symbols-outlined'\];/.test(commun), true);
verifier('seuls les jetons autorisés sont conservés',
  /\.filter\(c => CLASSES_SURES\.includes\(c\)\)/.test(commun), true);
/* La suppression de TOUS les attributs doit rester : c'est elle qui retire
   style, onclick, onerror, id et les adresses. La classe est reposée après. */
verifier('tous les attributs sont toujours retirés d’abord',
  /Array\.from\(el\.attributes\)\.forEach\(attr => el\.removeAttribute\(attr\.name\)\);/.test(commun), true);
verifier('une icône conservée reste muette pour les lecteurs d’écran',
  /el\.setAttribute\('aria-hidden', 'true'\);/.test(commun), true);

/* Les balises acceptées ne doivent pas s'être élargies au passage. */
const balises = /const BALISES = \[([^\]]*)\]/.exec(commun);
verifier('la liste des balises acceptées est inchangée',
  balises ? balises[1].replace(/['\s]/g, '').split(',') : null,
  ['SPAN', 'STRONG', 'EM', 'B', 'I', 'BR', 'SMALL']);

// --- 3. Le bouton de confirmation ne reste pas désactivé ---

verifier('le bouton de confirmation est réactivé à chaque ouverture',
  /var nouveau = bouton\.cloneNode\(true\);[\s\S]{0,400}?nouveau\.disabled = false;/.test(admin), true);

// --- 4. La dernière réalisation ne se supprime pas ---

verifier('supprimer la dernière réalisation est refusé',
  /if \(listeRealisations\(\)\.length <= 1\) \{/.test(admin), true);

/* Le refus n'a de sens que tant que le site retombe sur son fichier quand la
   base est vide. Si cette garde disparaissait, le refus deviendrait absurde. */
verifier('le site retombe bien sur son fichier quand la base n’a aucune réalisation',
  /if \(Array\.isArray\(donnees\.portfolio\) && donnees\.portfolio\.length\) \{/.test(commun), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

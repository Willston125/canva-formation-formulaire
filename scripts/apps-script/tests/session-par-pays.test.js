/* Une session peut se tenir en présentiel ici et en ligne ailleurs.
 *
 * Elle ne portait qu'UN mode, UN lieu et UN tarif, valables pour tous les pays
 * où elle était proposée. Un candidat comorien suivant la formation depuis chez
 * lui voyait donc « Saalam Tower, 5ème étage », et le tarif d'un pays s'affichait
 * dans la devise d'un autre.
 *
 * Chaque pays coché porte maintenant ses propres mode, lieu et tarif. Laissés
 * vides, ils reprennent ceux de la session : une session créée avant cette
 * colonne continue de fonctionner sans rien perdre. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
const admin = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');
const gs = fs.readFileSync(path.join(RACINE, 'scripts', 'apps-script', 'impactali-inscriptions.gs'), 'utf8');

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

/* On EXÉCUTE la résolution plutôt que de lire son texte : une garde qui cherche
   une chaîne dans le source passe devant une implémentation fausse. */
const bac = {};
vm.createContext(bac);
vm.runInContext([
  corpsDe(commun, 'function reglagesDuPays(session, code)'),
  corpsDe(commun, 'function modeDeSession(session, code)'),
  corpsDe(commun, 'function lieuDeSession(session, code)'),
  'globalThis.__reglages = reglagesDuPays;',
  'globalThis.__mode = modeDeSession;',
  'globalThis.__lieu = lieuDeSession;'
].join('\n'), bac);
const reglages = bac.__reglages, mode = bac.__mode, lieu = bac.__lieu;

/** Une session comme le tableau de bord l'enregistre désormais. */
const SESSION = {
  id: 'canva-pro-2026-11', formId: 'canva-pro',
  mode: 'En ligne', location: 'Saalam Tower, 5ème étage', price: 7500,
  pays: 'DJ,KM',
  parPays: {
    DJ: { mode: 'Présentiel', lieu: 'Saalam Tower, 5ème étage', tarif: 7500 },
    KM: { mode: 'En ligne', tarif: 10000 }
  }
};

/** Une session d'avant la colonne : elle n'a aucun réglage par pays. */
const ANCIENNE = {
  id: 'ancienne', formId: 'canva-pro',
  mode: 'Présentiel', location: 'Saalam Tower, 5ème étage', price: 7500, pays: 'DJ'
};

// --- 1. Chaque pays a son mode ---
verifier('Djibouti est en présentiel', mode(SESSION, 'DJ'), 'Présentiel');
verifier('les Comores sont en ligne', mode(SESSION, 'KM'), 'En ligne');
/* Contre-contrôle : sans lui, les deux contrôles ci-dessus passeraient devant
   une fonction qui rendrait toujours le mode de la session. */
verifier('et les deux diffèrent vraiment', mode(SESSION, 'DJ') !== mode(SESSION, 'KM'), true);

// --- 2. Le lieu n'existe que là où la session est physique ---
verifier('le lieu s’annonce à Djibouti', lieu(SESSION, 'DJ'), 'Saalam Tower, 5ème étage');
/* Le cœur du défaut : un candidat comorien voyait l'adresse djiboutienne alors
   qu'il suit la formation depuis chez lui. */
verifier('mais JAMAIS aux Comores, où la session est en ligne', lieu(SESSION, 'KM'), '');

/* Même sans réglage propre, un pays en ligne n'a pas de lieu : le repli sur le
   lieu de la session ne doit pas le ressusciter. */
const enLignePartout = { mode: 'En ligne', location: 'Saalam Tower', pays: 'DJ,KM' };
verifier('une session en ligne n’annonce aucun lieu, même en repli',
  lieu(enLignePartout, 'DJ'), '');

// --- 3. Une session d'avant la colonne ne perd rien ---
verifier('l’ancienne session garde son mode', mode(ANCIENNE, 'DJ'), 'Présentiel');
verifier('et garde son lieu', lieu(ANCIENNE, 'DJ'), 'Saalam Tower, 5ème étage');
verifier('y compris pour un pays qu’elle ne connaît pas', mode(ANCIENNE, 'FR'), 'Présentiel');

// --- 4. Des valeurs abîmées ne cassent pas l'affichage ---
[['aucun parPays', {}], ['parPays nul', { parPays: null }],
 ['parPays en liste', { parPays: [] }], ['parPays en texte', { parPays: 'DJ' }],
 ['entrée non objet', { parPays: { DJ: 'Présentiel' } }]].forEach(([libelle, sess]) => {
  verifier('réglage illisible écarté : ' + libelle, reglages(sess, 'DJ'), {});
});

/* Le code du pays ne doit pas dépendre de la casse : la feuille se retouche à
   la main, et « dj » y arrive un jour ou l'autre. */
verifier('le code de pays est lu sans tenir compte de la casse',
  mode({ mode: 'En ligne', parPays: { dj: { mode: 'Présentiel' } } }, 'DJ'), 'Présentiel');

// --- 5. Le tarif du pays passe avant celui de la formation ---
const corpsPrix = corpsDe(commun, 'function prixDe(objet, code)');
verifier('prixDe consulte le tarif du pays',
  corpsPrix.indexOf('reglagesDuPays(objet, pays.code).tarif') !== -1, true);
/* Et il le consulte AVANT la table de la formation, sinon le plus précis
   n'aurait jamais le dernier mot. */
verifier('et il le consulte avant la table de la formation',
  corpsPrix.indexOf('reglagesDuPays') < corpsPrix.indexOf('const table = objet.prices'), true);

// --- 6. La colonne existe côté script Google ---
verifier('l’onglet Sessions porte la colonne parPays',
  /\['parPays', 'json'\]/.test(gs), true);

// --- 7. Le tableau de bord saisit et relit ces réglages ---
verifier('le formulaire de session déclare le champ',
  /cle: 'parPays', type: 'paysReglages'/.test(admin), true);
verifier('et ne retient que les pays cochés',
  /if \(!case_\.checked\) return;/.test(admin), true);
/* Un champ vide veut dire « comme la session », pas « vide » : l'écrire
   effacerait le repli au lieu de le laisser jouer. */
const corpsLecture = corpsDe(admin, 'function lirePaysReglages(racine)');
verifier('et n’enregistre que les champs renseignés',
  /if \(Object\.keys\(reglage\)\.length\) out\[code\] = reglage;/.test(corpsLecture), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

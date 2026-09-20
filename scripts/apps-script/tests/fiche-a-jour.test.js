/* Une fiche publiée doit suivre le tableau de bord, pas la date de sa génération.
 *
 * L'en-tête des six fiches — titre, accroche, fil d'Ariane, catégorie, affiche,
 * durée, niveau, mode — était écrit une fois pour toutes par
 * `npm run build:fiches`, puis plus jamais. Le seul code capable de le réécrire
 * depuis le catalogue, `renderEnteteGenerique`, sortait immédiatement sur toute
 * page ne portant pas `data-fiche-generique` : c'est-à-dire partout sauf
 * /inscription/.
 *
 * Conséquence mesurée : une affiche remplacée dans le tableau de bord ne
 * changeait sur aucune fiche, alors que le champ existe, accepte un fichier et
 * enregistre bien son adresse. Le propriétaire changeait la photo, rechargeait,
 * et voyait l'ancienne — sans aucune erreur nulle part.
 *
 * Durée, niveau et mode n'avaient même pas d'identifiant : rien ne pouvait les
 * atteindre. Le mode, en plus, ignorait le pays du visiteur alors que la même
 * session se tient en présentiel ici et en ligne ailleurs. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const fiche = fs.readFileSync(path.join(RACINE, 'script.js'), 'utf8');
const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
const gabarit = fs.readFileSync(path.join(RACINE, 'formations', '_template', 'fiche.html'), 'utf8');

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

// ------------------------- L'EN-TÊTE N'EST PLUS RÉSERVÉ -------------------------

const entete = corpsDe(fiche, 'function renderEnteteFiche(formation)');

verifier('le corps de renderEnteteFiche est bien trouvé',
  entete.length > 400 && entete.length < 6000, true);

/* LE CŒUR DU CONTRAT. Cette garde-là était le défaut : elle renvoyait la
   fonction chez elle sur les six fiches générées. */
verifier('l’en-tête n’est plus réservé à la page d’inscription générique',
  /ficheGenerique\s*===\s*undefined\)\s*return/.test(entete), false);

/* La page générique reste distinguée — son surtitre et son titre d'onglet ne
   disent pas la même chose qu'une fiche —, mais pour CHOISIR un libellé, pas
   pour sortir. */
verifier('la page générique reste distinguée, sans sortie prématurée',
  /ficheGenerique/.test(entete), true);

verifier('l’en-tête est appelé depuis la sélection de formation',
  /renderEnteteFiche\(formation\)/.test(fiche), true);

// ------------------------------- L'AFFICHE -------------------------------

verifier('l’affiche de la fiche est réécrite depuis les données',
  /poster-section img/.test(entete), true);
verifier('celle de l’étape de validation aussi',
  /poster-validation/.test(entete), true);

/* Les dimensions décrivaient l'ANCIENNE affiche : les garder réserve une place
   au mauvais rapport, et la nouvelle s'affiche déformée le temps du
   chargement. Même règle que pour les visuels remplacés. */
verifier('les dimensions de l’ancienne affiche sont retirées',
  /removeAttribute\('width'\)/.test(entete) && /removeAttribute\('height'\)/.test(entete), true);

// ------------------------- L'ACCROCHE, SANS DANGER -------------------------

/* `lead` accepte une mise en gras, comme à la génération. Il doit passer par le
   même tamis que les textes du tableau de bord : une valeur venue de la feuille
   ne doit pas pouvoir exécuter de script. */
verifier('l’accroche riche passe par le tamis à balises',
  /assainirHtml/.test(entete), true);
verifier('et ce tamis est bien exposé par site-common',
  /assainirHtml/.test(commun), true);

// --------------------- DURÉE, NIVEAU ET MODE ATTEIGNABLES ---------------------

['fiche-duration', 'fiche-level', 'fiche-mode'].forEach(id => {
  verifier('le gabarit porte l’identifiant ' + id,
    gabarit.indexOf('id="' + id + '"') >= 0, true);
});

const fiches = fs.readdirSync(path.join(RACINE, 'formations'))
  .filter(d => d !== '_template'
    && fs.existsSync(path.join(RACINE, 'formations', d, 'index.html')));
/* Le nombre de fiches suit le catalogue, qui se modifie depuis le tableau de
   bord : on tient un plancher, pas un compte exact. Sans lui, un dossier vide
   ferait passer en silence la boucle qui suit. */
verifier('des fiches générées sont bien là', fiches.length >= 5, true);
fiches.forEach(slug => {
  const page = fs.readFileSync(path.join(RACINE, 'formations', slug, 'index.html'), 'utf8');
  const complete = ['fiche-duration', 'fiche-level', 'fiche-mode']
    .every(id => page.indexOf('id="' + id + '"') >= 0);
  verifier('la fiche ' + slug + ' porte les trois identifiants', complete, true);
});

// ------------------- ON EXÉCUTE, PLUTÔT QUE DE LIRE LE TEXTE -------------------

/* Une garde qui cherche une chaîne dans le source passe devant une
   implémentation fausse : on fait donc tourner la pose des faits sur un faux
   document, et on regarde ce qui s'affiche. */
function fauxDocument() {
  const lignes = {};
  const faire = id => {
    const ligne = { hidden: true, marque: true };
    const el = { textContent: '', closest: sel => (sel === '[data-fiche-fact]' ? ligne : null) };
    lignes[id] = { ligne, el };
    return lignes[id];
  };
  ['fiche-duration', 'fiche-level', 'fiche-mode'].forEach(faire);
  return {
    lignes,
    document: { getElementById: id => (lignes[id] ? lignes[id].el : null) }
  };
}

const bac = { displaySession: null, sessionMode: () => '' };
vm.createContext(bac);
vm.runInContext([
  corpsDe(fiche, 'function poserFait(id, valeur)'),
  corpsDe(fiche, 'function renderFaitsFormation(formation)'),
  'globalThis.__faits = renderFaitsFormation;'
].join('\n'), bac);

// Une formation entièrement renseignée : les trois lignes s'affichent.
let faux = fauxDocument();
bac.document = faux.document;
bac.displaySession = null;
bac.sessionMode = () => '';
bac.__faits({ duration: '12 séances', level: 'Tous niveaux', mode: 'Présentiel' });
verifier('la durée saisie s’affiche', faux.lignes['fiche-duration'].el.textContent, '12 séances');
verifier('et sa ligne est montrée', faux.lignes['fiche-duration'].ligne.hidden, false);
verifier('le niveau saisi s’affiche', faux.lignes['fiche-level'].el.textContent, 'Tous niveaux');
verifier('le mode saisi s’affiche', faux.lignes['fiche-mode'].el.textContent, 'Présentiel');

// Le nombre de modules complète la durée, comme à la génération.
faux = fauxDocument();
bac.document = faux.document;
bac.__faits({ duration: '12 jours', modules: 4, level: '', mode: '' });
verifier('le nombre de modules complète la durée',
  faux.lignes['fiche-duration'].el.textContent, '12 jours · 4 modules');

/* UNE LIGNE SANS VALEUR SE MASQUE. Une durée effacée dans le tableau de bord
   laissait sinon son intitulé seul, devant un blanc. */
verifier('un niveau non saisi masque sa ligne', faux.lignes['fiche-level'].ligne.hidden, true);
verifier('« à confirmer » vaut « non saisi »', (() => {
  const f = fauxDocument();
  bac.document = f.document;
  bac.__faits({ duration: 'À confirmer', level: '', mode: '' });
  return f.lignes['fiche-duration'].ligne.hidden;
})(), true);

/* LE MODE SUIT LA SESSION ET LE PAYS. Une session se tient en présentiel à
   Djibouti et en ligne aux Comores : annoncer « Présentiel » en tête de fiche à
   un candidat comorien le ferait venir dans une salle qui n'est pas la sienne. */
faux = fauxDocument();
bac.document = faux.document;
bac.displaySession = { id: 'x', mode: 'Présentiel' };
bac.sessionMode = () => 'En ligne';
bac.__faits({ duration: '', level: '', mode: 'Présentiel' });
verifier('le mode de la session dans ce pays l’emporte sur celui de la formation',
  faux.lignes['fiche-mode'].el.textContent, 'En ligne');

// Sans session affichée, le mode de la formation reste le repli.
faux = fauxDocument();
bac.document = faux.document;
bac.displaySession = null;
bac.sessionMode = () => '';
bac.__faits({ duration: '', level: '', mode: 'Hybride' });
verifier('sans session affichée, le mode de la formation sert de repli',
  faux.lignes['fiche-mode'].el.textContent, 'Hybride');

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

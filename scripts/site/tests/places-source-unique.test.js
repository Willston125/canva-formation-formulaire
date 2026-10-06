/* Les places restantes se déduisent des inscrits, toujours, et d'une seule façon.
 *
 * LE DÉFAUT. Le site faisait « total moins inscrits » — mais seulement pour les
 * sessions qui APPARAISSAIENT dans le relevé. Or le relevé ne nomme que les
 * sessions ayant au moins un inscrit : une session neuve en était absente,
 * `Number(undefined)` donnait NaN, et la boucle passait son chemin. La session
 * gardait alors la colonne `placesAvailable` de la feuille.
 *
 * Deux sources pour une même valeur, donc, et c'est la moins fiable qui
 * l'emportait au début : celui qui corrigeait « places disponibles » dans le
 * tableau de bord voyait son chiffre tenir tant que personne ne s'inscrivait,
 * puis sauter à la première inscription. « Ça ne se met pas à jour », vu de
 * l'extérieur.
 *
 * Le tableau de bord, lui, applique déjà la bonne règle à l'enregistrement
 * (`placesTotal - compterSession`). C'est donc celle-là qui fait foi partout. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
const admin = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

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

const SESSIONS = [
  { id: 'avec-inscrits', placesTotal: 20 },
  { id: 'sans-inscrit', placesTotal: 20, placesAvailable: 12 },
  { id: 'sans-total', placesAvailable: 7 },
  { id: 'complete', placesTotal: 20 }
];

// L'annonce aux pages n'a pas de sens hors navigateur : on la laisse passer.
const bac = {
  SESSIONS,
  placesEnDirect: new Map(),
  CustomEvent: function (nom) { this.type = nom; },
  document: { dispatchEvent: () => true }
};
vm.createContext(bac);
vm.runInContext([
  corpsDe(commun, 'function appliquerReleve(releve)'),
  'globalThis.__appliquer = appliquerReleve;'
].join('\n'), bac);

const change = bac.__appliquer({ sessions: { 'avec-inscrits': 5, complete: 25 } });
const restantes = id => bac.placesEnDirect.get(id);

verifier('le relevé est bien pris en compte', change, true);
verifier('une session avec inscrits est décomptée', restantes('avec-inscrits'), 15);

/* LE CAS DU DÉFAUT : la session n'est pas dans le relevé, donc personne ne s'y
   est inscrit. Elle vaut son total, et non la colonne de la feuille. */
verifier('une session sans aucun inscrit vaut son total',
  restantes('sans-inscrit'), 20);
verifier('et elle n’en garde pas la valeur écrite dans la feuille',
  restantes('sans-inscrit') === 12, false);

/* Plus d'inscrits que de places : on affiche zéro, jamais un nombre négatif. */
verifier('un dépassement s’affiche zéro', restantes('complete'), 0);

/* Sans total, rien ne peut être déduit : on ne touche pas à la session plutôt
   que d'inventer un chiffre. */
verifier('une session sans total n’est pas décomptée',
  restantes('sans-total'), undefined);

/* Un relevé absent — l'API n'a pas répondu — ne doit RIEN changer : les valeurs
   de la feuille restent le repli, c'est tout l'intérêt de les avoir. */
bac.placesEnDirect = new Map();
verifier('un relevé absent ne change rien', bac.__appliquer(null), false);
verifier('et ne pose aucune valeur', bac.placesEnDirect.size, 0);

/* Un compte aberrant venu de la feuille est écarté, pas affiché. */
bac.placesEnDirect = new Map();
bac.__appliquer({ sessions: { 'avec-inscrits': -3 } });
verifier('un nombre d’inscrits négatif est écarté',
  bac.placesEnDirect.get('avec-inscrits'), undefined);

// ------------------- LA MÊME RÈGLE DANS LE TABLEAU DE BORD -------------------

/* Le tableau de bord recalcule à l'enregistrement. Si les deux règles
   divergeaient, la colonne écrite contredirait ce que le site affiche. */
verifier('le tableau de bord déduit lui aussi des inscrits',
  /placesAvailable = Math\.max\(0, valeurs\.placesTotal - compterSession\(/.test(admin), true);
verifier('et il met la valeur à néant sans total',
  /valeurs\.placesAvailable = null;/.test(admin), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

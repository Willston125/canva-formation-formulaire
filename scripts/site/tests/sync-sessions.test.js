/* Vérifie le script qui aligne les sessions du fichier sur la feuille.

   Ce script RÉÉCRIT formations-data.js, d'où le site tire ce qu'il affiche
   avant que l'API n'ait répondu. Une mise en forme fautive n'y casserait pas
   une ligne : elle empêcherait le fichier entier de se charger, et le site
   n'aurait plus ni formations, ni pays, ni coordonnées.

   L'épreuve n'appelle jamais la feuille : elle éprouve la mise en forme sur
   des valeurs choisies, dont celles qui piègent. */
'use strict';

const path = require('path');
const fs = require('fs');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const CHEMIN = path.join(RACINE, 'scripts', 'sync-sessions.js');
const { litteral, sessionEnTexte, ORDRE } = require(CHEMIN);

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. Les valeurs qui piègent ------------------------------------------

/* L'APOSTROPHE. Le fichier écrit ses chaînes entre apostrophes, et le réflexe
   est de convertir le JSON au même style. « L'atelier » deviendrait alors
   'L'atelier' : la chaîne se fermerait au milieu du mot et tout le fichier
   cesserait de se charger. Les lieux français en portent constamment. */
verifier('un objet gardant une apostrophe reste du JavaScript valide',
  litteral({ lieu: "L'atelier" }), '{"lieu":"L\'atelier"}');
verifier('une chaîne à apostrophe est échappée',
  litteral("L'atelier d'Ali"), "'L\\'atelier d\\'Ali'");
verifier('et une barre oblique inverse aussi',
  litteral('C:\\chemin'), "'C:\\\\chemin'");

/* VIDE = PAS ÉCRIT. La feuille renvoie « parPays: [] » — un tableau, pas un
   objet — quand aucun réglage par pays n'est saisi. */
verifier('un tableau vide n’est pas écrit', litteral([]), null);
verifier('un objet vide non plus', litteral({}), null);
verifier('ni une valeur absente', [litteral(null), litteral(undefined)], [null, null]);

/* Mais zéro et faux SONT des valeurs. Les écarter afficherait « places : 20 »
   sur une session complète, ou rouvrirait une session fermée. */
verifier('zéro et faux restent écrits', [litteral(0), litteral(false)], ['0', 'false']);

// --- 2. Ce que le script écrit se relit à l'identique ---------------------

/* Le contrôle qui compte : on met en forme, puis on RELIT ce qu'on a écrit.
   Une mise en forme valide mais inexacte passerait tous les contrôles
   ci-dessus ; celui-ci la prend. */
const SESSION = {
  id: 'essai-2026-11', formId: 'canva-pro',
  startDate: '2026-11-05', endDate: '2026-12-14',
  schedule: 'Lundi et jeudi · 18h – 20h', duration: '12 séances · 24 heures',
  location: "L'atelier d'Ali, 5ème étage", mode: 'Présentiel',
  pays: 'DJ,KM', price: 7500, currency: null,
  placesTotal: 20, placesAvailable: 0, registrationOpen: false,
  parPays: { KM: { mode: 'En ligne', lieu: "L'atelier", tarif: 15000 } }
};

let relu = null;
let erreur = null;
try { relu = eval('(' + sessionEnTexte(SESSION).replace(/^\s*Object\.freeze\(/, '').replace(/\)$/, '') + ')'); }
catch (e) { erreur = e.message; }

verifier('la session mise en forme se relit sans erreur', erreur, null);

/* Si la relecture a échoué, on poursuit avec un objet vide. Les contrôles
   suivants doivent alors ÉCHOUER en nommant ce qui manque, au lieu
   d'interrompre l'épreuve sur une exception qui ne dit rien — c'est ce qui
   s'est produit en éprouvant la régression de l'apostrophe. */
if (!relu) relu = {};
verifier('et rend exactement les mêmes valeurs',
  relu, {
    id: 'essai-2026-11', formId: 'canva-pro',
    startDate: '2026-11-05', endDate: '2026-12-14',
    schedule: 'Lundi et jeudi · 18h – 20h', duration: '12 séances · 24 heures',
    location: "L'atelier d'Ali, 5ème étage", mode: 'Présentiel',
    pays: 'DJ,KM', price: 7500,
    placesTotal: 20, placesAvailable: 0, registrationOpen: false,
    parPays: { KM: { mode: 'En ligne', lieu: "L'atelier", tarif: 15000 } }
  });

/* `currency: null` a disparu, et c'est voulu : une devise déclarée vide
   l'emporterait sur celle du pays. Son absence laisse le pays faire foi. */
verifier('une devise absente n’est pas déclarée vide', 'currency' in relu, false);

/* L'ORDRE des champs est stable : sans lui, chaque synchronisation produirait
   une différence Git illisible et l'on cesserait de les relire. */
verifier('les champs sortent dans l’ordre annoncé',
  Object.keys(relu), ORDRE.filter(c => c in relu));

// --- 3. Le script refuse d'effacer le repli ------------------------------

/* Une feuille momentanément vide, un script Google mal redéployé, une réponse
   tronquée : écrire une liste vide priverait le site de tout repli, et l'on ne
   s'en apercevrait qu'à la prochaine panne de l'API — au pire moment. */
const source = fs.readFileSync(CHEMIN, 'utf8');
verifier('il refuse une feuille sans aucune session',
  /if \(!sessions\.length\)[\s\S]{0,200}process\.exit\(1\)/.test(source), true);
verifier('et une session sans identifiant ni date',
  /!s\.id \|\| !s\.formId \|\| !s\.startDate[\s\S]{0,200}process\.exit\(1\)/.test(source), true);
verifier('et il n’écrit rien quand la feuille est injoignable',
  /injoignable[\s\S]{0,120}process\.exit\(1\)/.test(source), true);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

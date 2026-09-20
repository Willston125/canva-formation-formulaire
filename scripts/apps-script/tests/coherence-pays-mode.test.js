/* Le mode d'une session doit correspondre aux pays où elle est proposée.
 *
 * Rien ne l'exigeait, et la feuille de production le montrait : les sessions
 * « Marketing digital » et « Photo-vidéo » étaient cochées Djibouti ET Comores,
 * en « Présentiel », avec pour tout lieu « Saalam Tower, 5ème étage, Djibouti ».
 * Un candidat comorien lisait donc, sur la fiche et sur l'accueil, une adresse
 * située dans un autre pays que le sien — et rien, nulle part, ne s'en
 * étonnait.
 *
 * Trois règles sont désormais tenues des deux côtés :
 *   1. aucune case cochée = proposée PARTOUT : seule une session en ligne peut
 *      l'être ;
 *   2. un pays sur place (présentiel ou hybride) veut un lieu ;
 *   3. dès que plusieurs pays sont cochés, chacun veut le SIEN : une adresse
 *      n'est que dans un pays.
 *
 * Le tableau de bord les vérifie pour répondre tout de suite, le script Google
 * les vérifie parce que c'est lui qui écrit. Les deux verdicts sont comparés
 * ici sur les mêmes cas : une règle corrigée d'un seul côté se verrait. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHEMIN_GS = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac, creerFeuille } = require('./emulateur.js');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');

const MDP = 'motdepasse-de-test';
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

// ------------------- LES MÊMES CAS, DES DEUX CÔTÉS -------------------

const CAS = [
  ['une session en ligne ouverte partout',
    { pays: '', mode: 'En ligne', location: 'Google Meet' }, false],
  ['une session en présentiel sans aucun pays coché',
    { pays: '', mode: 'Présentiel', location: 'Saalam Tower' }, true],
  ['une session hybride sans aucun pays coché',
    { pays: '', mode: 'Hybride', location: 'Saalam Tower' }, true],
  ['une session en présentiel dans un seul pays, avec le lieu de la session',
    { pays: 'DJ', mode: 'Présentiel', location: 'Saalam Tower' }, false],
  ['une session en présentiel dans un seul pays, sans aucun lieu',
    { pays: 'DJ', mode: 'Présentiel', location: '' }, true],
  ['deux pays en présentiel avec la seule adresse de la session',
    { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower' }, true],
  ['deux pays en présentiel, chacun avec son adresse',
    { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower',
      parPays: { DJ: { lieu: 'Saalam Tower' }, KM: { lieu: 'American corner' } } }, false],
  ['deux pays, l’un sur place avec son adresse, l’autre en ligne',
    { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower',
      parPays: { DJ: { lieu: 'Saalam Tower' }, KM: { mode: 'En ligne' } } }, false],
  ['deux pays en ligne',
    { pays: 'DJ,KM', mode: 'En ligne', location: '' }, false],
  ['un pays repassé sur place sans lieu propre',
    { pays: 'DJ,KM', mode: 'En ligne', location: '',
      parPays: { DJ: { mode: 'Présentiel' } } }, true],
  ['le lieu d’un pays suffit, même écrit en minuscules dans la table',
    { pays: 'KM', mode: 'Présentiel', location: '',
      parPays: { km: { lieu: 'American corner' } } }, false]
];

/* Côté script Google : on exécute la fonction telle qu'elle y est écrite. */
const reprochesGS = bac.reprochesPaysSession;
verifier('le script Google porte bien la règle',
  typeof reprochesGS, 'function');

/* Côté tableau de bord : même chose, extraite de son fichier. */
const bacAdmin = {};
vm.createContext(bacAdmin);
vm.runInContext([
  corpsDe(adminSource, 'function reprochesPaysSession(s)'),
  'globalThis.__reproches = reprochesPaysSession;'
].join('\n'), bacAdmin);
const reprochesAdmin = bacAdmin.__reproches;

CAS.forEach(([libelle, session, fautif]) => {
  const gs = reprochesGS(session);
  const adm = reprochesAdmin(session);
  verifier('script Google — ' + libelle, gs.length > 0, fautif);
  verifier('tableau de bord — ' + libelle, adm.length > 0, fautif);
  verifier('les deux disent la même chose — ' + libelle, gs.length > 0 === adm.length > 0, true);
});

/* Un reproche doit NOMMER le pays fautif : « une erreur est survenue » ne dit
   pas laquelle des deux cases décocher. */
const dit = reprochesGS({ pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower',
  parPays: { DJ: { lieu: 'Saalam Tower' } } }).join(' ');
verifier('le reproche nomme le pays en cause', /KM/.test(dit), true);
verifier('et il ne parle pas de celui qui va bien', /\bDJ\b/.test(dit), false);

// ------------------- LE SCRIPT REFUSE VRAIMENT D'ÉCRIRE -------------------

const admin = (action, charge) => JSON.parse(bac.doPost({ postData: { contents: JSON.stringify(
  Object.assign({ action: action, motDePasse: MDP }, charge)) } })._t);

const formations = creerFeuille('Formations');
formations.appendRow(['id', 'formId', 'slug', 'title', 'active']);
formations.appendRow(['formation-canva-pro', 'canva-pro', 'canva-pro', 'Canva Pro', true]);
creerFeuille('Sessions').appendRow(['id', 'formId', 'startDate', 'endDate', 'schedule',
  'duration', 'location', 'mode', 'price', 'placesTotal', 'placesAvailable',
  'registrationOpen', 'currency', 'pays', 'parPays']);

const BASE = { id: 'sess-1', formId: 'canva-pro', startDate: '2026-11-05',
  schedule: 'Lun. et jeu.', duration: '12 séances', placesTotal: 12, registrationOpen: true };

const refus = admin('admin.session.save', { donnees: Object.assign({}, BASE, {
  pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower, 5ème étage, Djibouti' }) });
verifier('le script refuse d’écrire une session incohérente', refus.ok === true, false);
verifier('et il explique laquelle des deux cases pose problème',
  /KM|Comores/.test(String(refus.erreur || '')), true);

const accepte = admin('admin.session.save', { donnees: Object.assign({}, BASE, {
  pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower, 5ème étage, Djibouti',
  parPays: { DJ: { lieu: 'Saalam Tower, 5ème étage' }, KM: { mode: 'En ligne' } } }) });
verifier('et il accepte la même session une fois chaque pays réglé', accepte.ok, true);

/* UN PAYS EN LIGNE NE GARDE PAS D'ADRESSE. Le champ est masqué dans le tableau
   de bord, mais sa valeur partait quand même : elle serait ressortie le jour où
   le pays repasse en présentiel, sans que personne l'ait revue. */
const enLigne = admin('admin.session.save', { donnees: Object.assign({}, BASE, {
  id: 'sess-2', pays: 'KM', mode: 'En ligne', location: '',
  parPays: { KM: { mode: 'En ligne', lieu: 'American corner' } } }) });
verifier('une session en ligne s’enregistre', enLigne.ok, true);
const ecrite = (enLigne.catalogue.sessions || []).find(s => s.id === 'sess-2');
verifier('et le pays en ligne n’a pas gardé d’adresse',
  ecrite && ecrite.parPays && ecrite.parPays.KM ? ecrite.parPays.KM.lieu : undefined, undefined);

// ------------------- LE SITE N'ANNONCE PAS UNE ADRESSE D'AILLEURS -------------------

/* Tant que la feuille n'est pas corrigée, le site doit se taire plutôt que
   d'envoyer un Comorien à Djibouti. Même raisonnement que pour le tarif, qui
   n'est déjà plus repris d'un pays sur l'autre. */
const bacSite = {};
vm.createContext(bacSite);
vm.runInContext([
  corpsDe(commun, 'function paysDeSession(session)'),
  corpsDe(commun, 'function reglagesDuPays(session, code)'),
  corpsDe(commun, 'function modeDeSession(session, code)'),
  corpsDe(commun, 'function lieuDeSession(session, code)'),
  'globalThis.__lieu = lieuDeSession;'
].join('\n'), bacSite);
const lieu = bacSite.__lieu;

const DEUX_PAYS = { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower, 5ème étage, Djibouti' };
verifier('l’adresse unique d’une session à deux pays n’est donnée à aucun',
  [lieu(DEUX_PAYS, 'DJ'), lieu(DEUX_PAYS, 'KM')], ['', '']);

const UN_PAYS = { pays: 'DJ', mode: 'Présentiel', location: 'Saalam Tower, 5ème étage' };
verifier('celle d’une session à un seul pays reste annoncée',
  lieu(UN_PAYS, 'DJ'), 'Saalam Tower, 5ème étage');

const REGLEE = { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower',
  parPays: { DJ: { lieu: 'Saalam Tower' }, KM: { lieu: 'American corner' } } };
verifier('chaque pays réglé garde la sienne',
  [lieu(REGLEE, 'DJ'), lieu(REGLEE, 'KM')], ['Saalam Tower', 'American corner']);

verifier('un pays en ligne n’a toujours aucun lieu',
  lieu({ pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower',
    parPays: { KM: { mode: 'En ligne', lieu: 'American corner' } } }, 'KM'), '');

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

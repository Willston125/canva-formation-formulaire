/* Deux formulaires du tableau de bord ne doivent jamais se lire l'un l'autre.
 *
 * « Numéro WhatsApp » est déclaré à deux endroits : les réglages du site, et la
 * fiche d'un pays. Les deux <input> portaient le même identifiant. Une vue
 * quittée reste dans la page — elle est seulement masquée — donc
 * getElementById rendait le PREMIER du document, celui des réglages. On
 * saisissait le numéro comorien dans la fiche des Comores, et c'est le numéro
 * djiboutien qui partait au serveur ; à l'actualisation, il était de retour.
 *
 * L'épreuve relève les clés de chaque formulaire dans la source, et vérifie que
 * deux formulaires pouvant coexister dans la page ne partagent pas d'espace de
 * noms. Elle vérifie aussi que la lecture reste bornée à son conteneur.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', '..', '..', 'admin', 'admin.js');
const src = fs.readFileSync(SOURCE, 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Relève les `cle:` d'une déclaration, jusqu'à sa fermeture au premier niveau. */
function clesDe(declaration) {
  const debut = src.indexOf(declaration);
  if (debut < 0) return null;
  const fin = src.slice(debut).search(/\n {2}(\];|\})/);
  if (fin < 0) return null;
  const bloc = src.slice(debut, debut + fin);
  const cles = [];
  const motif = /\bcle:\s*'([^']+)'/g;
  let m;
  while ((m = motif.exec(bloc))) cles.push(m[1]);
  return cles;
}

/* Tous ceux-ci s'affichent dans #panneau, l'un après l'autre : ils ne peuvent
   pas se marcher dessus. Les réglages, eux, restent dans la page pendant
   qu'un panneau est ouvert — c'est là que se jouait la collision. */
const PANNEAUX = {
  formations: 'var CHAMPS_FORMATION = [',
  sessions: 'function champsSession() {',
  pays: 'function champsPays(p) {',
  realisations: 'var CHAMPS_REALISATION = ['
};
const REGLAGES = 'function champsReglages() {';

const clesReglages = clesDe(REGLAGES);
verifier('le formulaire des réglages est bien repéré', Array.isArray(clesReglages) && clesReglages.length > 0, true);

const manquants = Object.entries(PANNEAUX).filter(([, d]) => !clesDe(d)).map(([n]) => n);
verifier('tous les formulaires de panneau sont repérés', manquants, []);

/* Le constat brut : quelles clés sont bel et bien partagées. On ne l'interdit
   pas — on exige que les espaces de noms diffèrent. */
const partagees = {};
Object.entries(PANNEAUX).forEach(([nom, decl]) => {
  const c = clesDe(decl) || [];
  const communes = c.filter(k => (clesReglages || []).indexOf(k) >= 0);
  if (communes.length) partagees[nom] = communes;
});
resultats.push('NOTE  clés partagées avec les réglages : ' + JSON.stringify(partagees));

// --- 1. Les deux espaces de noms doivent différer ---

const prefixePanneau = /var FORM_PANNEAU = formulaire\('([^']*)'/.exec(src);
const prefixeReglages = /var FORM_REGLAGES = formulaire\('([^']*)'/.exec(src);

verifier('les deux formulaires sont déclarés',
  !!(prefixePanneau && prefixeReglages), true);
verifier('leurs espaces de noms diffèrent',
  prefixePanneau && prefixeReglages ? prefixePanneau[1] !== prefixeReglages[1] : false, true);

/* Si des clés sont partagées, un préfixe vide des DEUX côtés ramènerait le
   défaut : deux <input> avec le même id dans la même page. */
if (Object.keys(partagees).length) {
  verifier('les réglages ont un préfixe propre, puisqu’ils partagent des clés',
    !!(prefixeReglages && prefixeReglages[1]), true);
}

// --- 2. L'identifiant se fabrique en un seul endroit, avec le préfixe ---

verifier('l’identifiant d’un champ inclut l’espace de noms',
  /var id = 'champ-' \+ form\.prefixe \+ c\.cle;/.test(src), true);

/* Les champs image se câblent par leur clé nue (activerChampImage), sans passer
   par l'espace de noms. Leurs clés sont préfixées à la source — « visuel-… »
   dans la vue Visuels, « moyen-… » pour les logos de paiement — sauf celles
   d'un panneau de formation, qui restent nues (« image », « poster »).
   Tant qu'aucune de ces clés n'existe aussi dans les réglages, rien ne peut se
   confondre : c'est ce qu'on vérifie, plutôt que de le supposer. */
const clesImage = [];
const motifImage = /\{\s*cle:\s*'([^']+)'[^}]*type:\s*'image'/g;
let mi;
while ((mi = motifImage.exec(src))) clesImage.push(mi[1]);
resultats.push('NOTE  champs de type image : ' + JSON.stringify(clesImage)
  + ' — câblés par clé nue en admin.js:1498');

verifier('aucun champ image ne porte une clé des réglages',
  clesImage.filter(k => (clesReglages || []).indexOf(k) >= 0), []);

// --- 3. La lecture reste bornée au conteneur ---

verifier('la lecture d’un champ est bornée à son conteneur',
  /var el = racine\.querySelector\('\[id="champ-' \+ form\.prefixe \+ c\.cle \+ '"\]'\);/.test(src), true);

/* getElementById cherche dans TOUT le document : c'est exactement ce qui
   faisait lire le champ du formulaire d'à côté. */
verifier('plus aucune lecture de champ par getElementById sur le document',
  /getElementById\('champ-' \+ c\.cle\)/.test(src), false);

// --- 4. Les réglages passent bien leur propre espace de noms ---

verifier('les réglages construisent leurs champs dans leur espace de noms',
  /construireChamps\(champs, etat\.catalogue\.reglages \|\| \{\}, FORM_REGLAGES\)/.test(src), true);
verifier('les réglages relisent leurs champs dans leur espace de noms',
  /lireChamps\(champs, FORM_REGLAGES\)/.test(src), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

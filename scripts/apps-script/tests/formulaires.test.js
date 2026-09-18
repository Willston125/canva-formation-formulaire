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

// --- 5. Un select ne doit jamais perdre la valeur déjà enregistrée ---

/* Le navigateur retient la PREMIÈRE option quand aucune n'est marquée
   « selected ». Une valeur enregistrée absente de la liste se transformait donc
   en option vide — et le premier enregistrement venu l'écrasait. Mesuré : un
   cadrage « 30% 50% » perdu en corrigeant une faute dans la description.
   Sur un champ obligatoire, c'est pire : la première VRAIE valeur est retenue. */
verifier('un select réinsère la valeur enregistrée absente de sa liste',
  /var connue = options\.some\(function \(o\) \{ return String\(o\.valeur\) === actuelle; \}\);/.test(src)
  && /options = \[\{ valeur: actuelle,/.test(src), true);

/* Les valeurs proposées à la création doivent, elles, figurer dans la liste :
   sinon le tableau de bord se contredit dès le premier écran. */
const vm = require('vm');
const donnees = { window: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'formations-data.js'), 'utf8'), donnees);

function optionsDe(cle) {
  const i = src.indexOf("cle: '" + cle + "'");
  if (i < 0) return null;
  const bloc = src.slice(i, i + 900);
  const parObjet = [...bloc.matchAll(/\{ valeur: '([^']*)'/g)].map(m => m[1]);
  if (parObjet.length) return parObjet;
  const parListe = /options: \[([^\]]*)\]/.exec(bloc);
  return parListe ? [...parListe[1].matchAll(/'([^']*)'/g)].map(m => m[1]) : null;
}

const posOffertes = optionsDe('imagePosition') || [];
verifier('le cadrage proposé à la création d’une réalisation est dans la liste',
  posOffertes.indexOf('50% 50%') >= 0, true);

const posStockees = [...new Set((donnees.window.PORTFOLIO || []).map(p => p.imagePosition).filter(Boolean))];
const horsListe = posStockees.filter(p => posOffertes.indexOf(p) < 0);
resultats.push('NOTE  cadrages enregistrés hors de la liste proposée : ' + JSON.stringify(horsListe)
  + ' — conservés par la réinsertion ci-dessus, et affichés « (valeur enregistrée) »');

/* Les modes, eux, doivent rester couverts des deux côtés : c'est une liste
   courte et stable, une divergence y serait une étourderie, pas un choix. */
const modesSession = optionsDe('mode') || [];
const modesStockes = [...new Set((donnees.window.SESSIONS || []).map(s => s.mode).filter(Boolean))];
verifier('chaque mode de session enregistré est proposé',
  modesStockes.filter(m => modesSession.indexOf(m) < 0), []);

// --- 6. Un libellé modifiable ne doit pas perdre ses enfants ---

/* Le bouton d'une question de la FAQ contient le libellé ET le chevron de
   l'accordéon. Écrire textContent supprimait le chevron — définitivement, le
   remplacement étant réappliqué à chaque visite — et le tableau de bord
   affichait « … ?expand_more » comme texte actuel, ligature comprise. */
const RACINE = path.resolve(__dirname, '..', '..', '..');
const accueil = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const avecEnfant = accueil.split('\n')
  .filter(l => /data-texte=/.test(l) && /material-symbols-outlined/.test(l))
  .map(l => (/data-texte="([^"]+)"/.exec(l) || [])[1])
  .filter(Boolean);

verifier('des libellés modifiables portent bien un enfant (sinon ce contrôle ne prouve rien)',
  avecEnfant.length > 0, true);
resultats.push('NOTE  libellés modifiables contenant une icône : ' + JSON.stringify(avecEnfant));

const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
verifier('le site remplace le texte sans toucher aux enfants',
  /function poserTexte\(el, valeur\)/.test(commun)
  && /el\.insertBefore\(document\.createTextNode\(valeur\), el\.firstChild\);/.test(commun), true);
verifier('le site ne compare plus le texte entier, enfants compris',
  /if \(texteSeul\(el\)\.trim\(\) === valeur\.trim\(\)\) return;/.test(commun), true);
verifier('le tableau de bord relève le texte propre, sans les icônes',
  /defaut: \(estHtml \? el\.innerHTML : texteSeulDe\(el\)\)/.test(src), true);

// --- 7. La file des visuels à supprimer ne doit pas survivre à un abandon ---

/* Un visuel remplacé n'est mis à la corbeille Drive qu'après enregistrement.
   La vue « Visuels » n'étant pas un panneau, rien ne vidait sa file quand on
   changeait de vue : le premier enregistrement fait ailleurs détruisait une
   image que la feuille référence encore. */
const videe = ['function fermerPanneau', 'function allerA']
  .filter(f => {
    const i = src.indexOf(f);
    return i >= 0 && /etat\.imagesARetirer = \[\];/.test(src.slice(i, i + 900));
  });
verifier('la file des visuels est vidée en fermant un panneau ET en changeant de vue',
  videe, ['function fermerPanneau', 'function allerA']);

// --- 8. Un gabarit ne doit pas pouvoir être pris pour la valeur à saisir ---

/* Le gabarit vivait dans le texte d'aide, juste après un deux-points : il se
   lisait comme la valeur à taper. Mis d'abord en vrai numéro, il a été recopié
   dans la fiche du pays voisin ; remplacé par des X, c'est « 269XXXXXXX » qui
   s'est retrouvé dans le champ du numéro de contact. Sa place est le
   placeholder — gris, dans la case, effacé dès la première touche. */
verifier('un champ texte sait porter un gabarit en placeholder',
  /placeholder="' \+ echapper\(c\.exemple\) \+ '"/.test(src), true);

const blocPays = src.slice(src.indexOf('function champsPays(p)'), src.indexOf('function ouvrirPays'));

/** Le texte d'un champ, de sa clé jusqu'au champ suivant. */
function champDe(cle) {
  const i = blocPays.indexOf("cle: '" + cle + "'");
  if (i < 0) return '';
  const suite = blocPays.slice(i);
  const fin = suite.search(/\n {4}\{|\n {4}\];/);
  return fin < 0 ? suite : suite.slice(0, fin);
}

/* Les trois variables qui portent le gabarit. Leur place est `exemple:` — le
   placeholder. Dans `aide:`, elles reproduisent le piège d'origine. */
const VARIABLES = ['local', 'gabaritAffiche', 'gabarit'];

['exempleTelephone', 'whatsappNumber', 'whatsappDisplay'].forEach(cle => {
  const champ = champDe(cle);
  verifier('« ' + cle + ' » est bien repéré dans le formulaire', champ.length > 0, true);
  verifier('« ' + cle + ' » porte son gabarit en placeholder', /exemple: /.test(champ), true);

  /* On coupe à `aide:` et on n'examine QUE ce qui suit : ni gabarit interpolé,
     ni suite de X, ni numéro écrit en clair. La première version de ce contrôle
     ne relevait que les chaînes littérales et laissait passer « + gabarit + »,
     c'est-à-dire exactement ce qu'il fallait attraper. */
  const j = champ.indexOf('aide:');
  const aide = j < 0 ? '' : champ.slice(j);
  /* On retire d'abord les chaînes : sans cela, le mot français « gabarit » du
     texte d'aide se ferait prendre pour la variable du même nom. C'est le CODE
     qu'on inspecte, pas la prose. */
  const codeDeLAide = aide.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  const fautifs = VARIABLES.filter(v => new RegExp('\\b' + v + '\\b').test(codeDeLAide));
  verifier('l’aide de « ' + cle + ' » n’interpole aucun gabarit', fautifs, []);
  verifier('l’aide de « ' + cle + ' » n’écrit aucun gabarit en clair',
    /XX|\d{4,}/.test(aide), false);
});

/* Le garde-fou décisif : un numéro ne contient jamais de X, et le champ
   « chiffres uniquement » n'accepte que des chiffres. */
verifier('un gabarit saisi comme numéro de contact est refusé',
  /if \(contact\[i\]\[2\] && \/x\/i\.test\(contact\[i\]\[2\]\)\) \{/.test(src), true);
verifier('le numéro WhatsApp n’accepte que des chiffres',
  /if \(chiffres && !\/\^\\d\{6,15\}\$\/\.test\(chiffres\)\) \{/.test(src), true);

/* Même confusion sur un moyen de paiement : le petit titre au-dessus du numéro
   a été rempli avec le numéro lui-même, et le candidat le lisait deux fois,
   l'un au-dessus de l'autre. Un intitulé comporte au moins une lettre. */
verifier('un intitulé de numéro sans aucune lettre est refusé',
  /if \(titre && !\/\[a-zà-öø-ÿ\]\/i\.test\(titre\)\) \{/.test(src), true);
verifier('le champ dit ce qu’on attend de lui',
  /libelle: 'Petit titre au-dessus du numéro'/.test(src), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

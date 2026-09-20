/* Chaque emplacement doit ANNONCER la forme réelle qu'il donne à la photo.
 *
 * Aujourd'hui rien ne la déclare, et le tableau de bord rogne l'image envoyée
 * d'après `data-image-format` — une étiquette qui parle de la PHOTO attendue, pas
 * de la forme du TROU dans lequel elle tombe. Les deux ont divergé sans que rien
 * ne le dise : l'emplacement de la bannière mesure 570 × 600 px, soit un rapport
 * de 0,95, quasiment un carré, alors qu'il s'annonce « paysage ». Le tableau de
 * bord rogne donc en 16/9 une image que la feuille de style réduit ensuite à un
 * carré : rognée deux fois, pour deux formes différentes, et le cadrage réglé à
 * l'écran ne montre pas ce que le visiteur verra.
 *
 * Ces rapports ont été relevés sur le site servi en local, viewport 1280 px, par
 * lecture des boîtes de mise en page réelles — pas déduits des attributs width et
 * height des balises, qui décrivent le FICHIER livré et non son emplacement.
 *
 * Cette épreuve ne fait que constater la DÉCLARATION. L'aperçu qui la consomme
 * viendra ensuite : c'est lui qui rendra ces valeurs visibles, et une valeur
 * fausse déclarée ici se verrait alors sur chaque page à la fois. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');

/* Les rapports relevés, largeur / hauteur de l'emplacement.
   Ils sont écrits en fraction et non en nombre décimal : « 19/20 » se relit et se
   corrige, « 0.95 » ne dit plus d'où il vient. */
const RAPPORTS_ATTENDUS = {
  'accueil.hero': '19/20',
  'accueil.methode.1': '12/7',
  'accueil.methode.2': '12/7',
  'accueil.methode.3': '12/7',
  'accueil.formateur.photo': '4/5',
  /* La page d'inscription générique et le gabarit gardent la clé commune ; elle
     sert aussi de repli aux fiches, qui portent chacune la leur. */
  'fiche.formateur.photo': '3/4',
  /* Le logo, en-tête et pied de chaque page. Les deux emplacements mesurent le
     même rapport — 75,59 × 42 en haut, 93,59 × 52 en bas, soit 1,8 — parce que
     la feuille de style fixe la hauteur et laisse la largeur suivre. Un logo
     d'un autre rapport ne serait donc pas déformé : il prendrait sa largeur. */
  'marque.logo': '9/5'
};

/* Chaque fiche a sa propre clé de photo de formateur, dans le même emplacement
   — donc le même rapport. Elles partageaient une clé unique : une photo envoyée
   depuis le tableau de bord s'appliquait aux six à la fois.

   La liste est RELEVÉE SUR LE DISQUE, et non écrite ici : le catalogue se
   modifie depuis le tableau de bord, une formation s'y ajoute ou s'en retire,
   et une liste tenue à la main ferait échouer l'épreuve pour une raison qui
   n'a rien à voir avec les rapports qu'elle surveille. Un plancher, plus bas,
   garde le cas où le dossier serait vidé. */
const FICHES_SUR_DISQUE = fs.existsSync(path.join(RACINE, 'formations'))
  ? fs.readdirSync(path.join(RACINE, 'formations'))
    .filter(d => d !== '_template'
      && fs.existsSync(path.join(RACINE, 'formations', d, 'index.html')))
    .sort()
  : [];
FICHES_SUR_DISQUE.forEach(slug => { RAPPORTS_ATTENDUS['fiche.' + slug + '.formateur.photo'] = '3/4'; });

const GABARIT = 'formations/_template/fiche.html';

/* Le nombre d'emplacements attendu par fichier. C'est le garde-fou de toute
   l'épreuve : sans lui, un balisage qui échapperait à l'extraction ne
   relèverait plus RIEN, et les contrôles d'absence ci-dessous compareraient
   deux listes vides en annonçant que tout va bien.
   Chaque page porte DEUX emplacements de plus que ses visuels propres : le
   logo de l'en-tête et celui du pied. */
const FICHIERS = [
  ['index.html', 7],
  [GABARIT, 3],
  ['inscription/index.html', 3],
  ...FICHES_SUR_DISQUE.map(slug => ['formations/' + slug + '/index.html', 3]),
  /* Ces deux pages n'ont aucun visuel propre, mais portent le logo : une marque
     changée depuis le tableau de bord doit changer PARTOUT, sans quoi elle
     serait à jour sur neuf pages et périmée sur deux. */
  ['entreprises/index.html', 2],
  ['mentions-legales/index.html', 2]
];
const OCCURRENCES_ATTENDUES = 17 + FICHES_SUR_DISQUE.length * 3;

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* On vise TOUT élément porteur, pas seulement <img> : le jour où un emplacement
   passera à une <div> à fond d'image, une épreuve qui ne regarderait que les
   images cesserait de le surveiller sans rien dire. */
const RE_PORTEUR = /<[a-z0-9]+\b[^>]*\bdata-image="([^"]+)"[^>]*>/gi;
const lireAttribut = (balise, nom) => {
  const m = new RegExp('\\b' + nom + '="([^"]*)"').exec(balise);
  return m ? m[1] : null;
};

const occurrences = [];
const comptesFautifs = [];
for (const [fichier, attendu] of FICHIERS) {
  const chemin = path.join(RACINE, fichier);
  if (!fs.existsSync(chemin)) { verifier('fichier présent : ' + fichier, false, true); continue; }
  const html = fs.readFileSync(chemin, 'utf8');
  let compte = 0;
  for (const m of html.matchAll(RE_PORTEUR)) {
    compte++;
    occurrences.push({ fichier, cle: m[1], balise: m[0] });
  }
  if (compte !== attendu) comptesFautifs.push(fichier + ' : ' + compte + ' au lieu de ' + attendu);
}

// --- 1. L'épreuve voit-elle encore quelque chose ? ---
/* Ce contrôle passe AVANT les autres pour une raison : tous ceux qui suivent
   énumèrent des manquements, et une liste vide y vaut succès. Si l'extraction
   devenait aveugle, ils viendraient tous au vert ensemble. */
verifier('nombre total d’emplacements relevés', occurrences.length, OCCURRENCES_ATTENDUES);
verifier('et chaque fichier porte bien les siens', comptesFautifs, []);

/* Contre-contrôle du relevé sur disque : une fiche qui apparaîtrait ailleurs
   que dans le dossier `formations/` échapperait à toute l'épreuve, et sa photo
   de formateur n'annoncerait aucun rapport sans que personne le sache. */
const dossierFormations = path.join(RACINE, 'formations');
const fichesSurDisque = fs.existsSync(dossierFormations)
  ? fs.readdirSync(dossierFormations)
    .filter(d => d !== '_template' && fs.existsSync(path.join(dossierFormations, d, 'index.html')))
    .map(d => 'formations/' + d + '/index.html')
  : [];
const declares = FICHIERS.map(([f]) => f);
verifier('aucune fiche n’échappe à la liste surveillée',
  fichesSurDisque.filter(f => !declares.includes(f)).sort(), []);

// --- 2. Chaque emplacement déclare un rapport ---
/* Sans le fichier ET la clé, le message ne sert à rien : « il en manque un »
   laisse à chercher dans neuf fichiers, dont sept sont générés et se corrigent
   au gabarit, pas à la main. */
verifier('chaque emplacement déclare son rapport',
  occurrences.filter(o => !lireAttribut(o.balise, 'data-image-ratio'))
    .map(o => o.fichier + ' → ' + o.cle), []);

// --- 3. Le rapport déclaré est celui qui a été mesuré ---
/* Une clé inconnue de la table ci-dessus n'est pas une broutille : le contrôle
   suivant ne saurait pas quoi lui comparer et la laisserait passer en silence,
   avec le rapport qu'elle voudrait. */
verifier('aucune clé n’est absente de la table mesurée',
  [...new Set(occurrences.map(o => o.cle))].filter(c => !(c in RAPPORTS_ATTENDUS)).sort(), []);

verifier('le rapport déclaré est celui mesuré sur le site',
  occurrences
    .filter(o => {
      const r = lireAttribut(o.balise, 'data-image-ratio');
      return r && r !== RAPPORTS_ATTENDUS[o.cle];
    })
    .map(o => o.fichier + ' → ' + o.cle + ' = ' + lireAttribut(o.balise, 'data-image-ratio')
      + ' (mesuré ' + RAPPORTS_ATTENDUS[o.cle] + ')'), []);

// --- 4. Une même clé ne peut pas déclarer deux rapports ---
/* fiche.formateur.photo est répétée dans huit fichiers, dont sept générés. Une
   valeur changée au gabarit sans régénération, ou une fiche retouchée à la main,
   donnerait un aperçu juste sur une page et faux sur sept — le pire des cas,
   puisque celui qui règle le cadrage verrait le bon aperçu. */
const parCle = new Map();
for (const o of occurrences) {
  if (!parCle.has(o.cle)) parCle.set(o.cle, new Map());
  parCle.get(o.cle).set(lireAttribut(o.balise, 'data-image-ratio'), o.fichier);
}
verifier('une même clé ne déclare pas deux rapports différents',
  [...parCle.entries()].filter(([, v]) => v.size > 1)
    .map(([c, v]) => c + ' : ' + [...v.entries()].map(([r, f]) => r + ' (' + f + ')').join(' | ')), []);

/* Contre-contrôle du précédent : une divergence ne peut se voir que si une clé
   est réellement relevée dans PLUSIEURS fichiers. Si l'extraction n'en trouvait
   qu'un seul exemplaire, le contrôle ci-dessus passerait toujours.
   La clé commune reste partagée par le gabarit et la page d'inscription. */
verifier('la clé commune est relevée dans le gabarit et la page d’inscription',
  occurrences.filter(o => o.cle === 'fiche.formateur.photo').map(o => o.fichier).sort(),
  [GABARIT, 'inscription/index.html'].sort());

/* Et chaque fiche déclare la sienne, une seule fois. Deux fiches qui
   partageraient encore une clé ramèneraient le défaut qu'on vient de corriger :
   une photo envoyée pour l'une s'appliquerait à l'autre. */
verifier('chaque fiche déclare sa propre clé, une seule fois',
  FICHES_SUR_DISQUE.filter(slug =>
    occurrences.filter(o => o.cle === 'fiche.' + slug + '.formateur.photo').length !== 1), []);

/* Et le repli est déclaré partout : sans lui, une fiche sans photo propre
   n'afficherait plus la photo commune posée pour toutes. */
/* Seuls les emplacements DES FICHES ont un repli. La photo du formateur de
   l'accueil (`accueil.formateur.photo`) est un emplacement à part, unique à sa
   page : elle n'a personne sur qui retomber, et n'en a pas besoin. */
verifier('chaque emplacement de formateur DES FICHES déclare son repli',
  occurrences.filter(o => /^fiche\..*formateur\.photo$/.test(o.cle)
    && lireAttribut(o.balise, 'data-image-repli') !== 'fiche.formateur.photo')
    .map(o => o.fichier + ' → ' + o.cle), []);

/* Contre-contrôle : sans lui, le contrôle ci-dessus passerait si plus aucune
   clé ne commençait par « fiche. ». */
/* Une par fiche, plus la clé commune du gabarit et de la page d'inscription. */
verifier('des emplacements de fiche sont bien inspectés',
  occurrences.filter(o => /^fiche\..*formateur\.photo$/.test(o.cle)).length,
  FICHES_SUR_DISQUE.length + 2);

/* Plancher : le catalogue peut perdre une formation, mais pas toutes. Sans ce
   contrôle, un dossier vidé rendrait toute l'épreuve muette. */
verifier('des fiches sont bien générées', FICHES_SUR_DISQUE.length >= 5, true);

// --- 5. Le gabarit, source des sept fiches ---
/* Corriger les fiches sans corriger le gabarit tiendrait jusqu'au prochain
   `npm run build:fiches`, qui les réécrirait toutes avec l'ancienne valeur. */
const auGabarit = occurrences.filter(o => o.fichier === GABARIT);
verifier('le gabarit des fiches porte lui aussi les rapports mesurés',
  auGabarit.filter(o => lireAttribut(o.balise, 'data-image-ratio') !== RAPPORTS_ATTENDUS[o.cle])
    .map(o => o.cle + ' = ' + lireAttribut(o.balise, 'data-image-ratio')), []);
/* Contre-contrôle : le contrôle ci-dessus passerait sur un gabarit qui aurait
   perdu tous ses emplacements. Celui du formateur doit y être. */
verifier('dont celui de la photo du formateur',
  auGabarit.some(o => o.cle === 'fiche.formateur.photo'), true);

// --- 6. L'étiquette de format ne contredit plus la mesure ---
/* « paysage » sur un emplacement de rapport 0,95 trompe d'abord celui qui
   téléverse : il choisit une photo large en croyant qu'elle sera montrée large,
   et le site en garde un carré. */
const hero = occurrences.find(o => o.cle === 'accueil.hero');
verifier('la bannière n’est plus annoncée comme un paysage',
  hero ? lireAttribut(hero.balise, 'data-image-format') : 'emplacement introuvable', 'carre');

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

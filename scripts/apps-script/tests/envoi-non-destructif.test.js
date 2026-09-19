/* L'envoi doit conserver la photo ENTIÈRE, et ne plus la rogner.
 *
 * Le tableau de bord rognait le fichier À L'ENVOI : `ctx.drawImage(bitmap,
 * zone.x, zone.y, …)` gravait dans le fichier la partie retenue, et le reste
 * n'existait plus nulle part. Tant que c'était la seule mise en forme, cela se
 * défendait. Ce n'est plus le cas : un cadrage {x, y, zoom} est désormais rangé
 * à côté de l'adresse du visuel et appliqué à l'affichage. Les deux se
 * CUMULERAIENT — la photo partirait deux fois plus loin que demandé, et comme
 * le fichier serait déjà amputé, aucun réglage ultérieur ne la ramènerait. Il
 * faudrait renvoyer la photo.
 *
 * Donc : l'envoi borne la largeur et ne rogne rien, et la fenêtre de recadrage
 * ne rend plus une zone de pixels mais des valeurs RELATIVES, rejouables sur
 * n'importe quel écran et reprenables sans renvoyer le fichier.
 *
 * Le piège que cette épreuve surveille surtout : mettre toutes les hauteurs de
 * FORMATS_IMAGE à null fait retomber la fenêtre de recadrage sur le rapport de
 * LA PHOTO elle-même. Son cadre épouserait alors l'image, rien ne dépasserait,
 * et déplacer ou agrandir n'aurait plus aucun sens — une fenêtre décorative qui
 * fait croire à un réglage. D'où le rapport imposable, éprouvé ici en
 * l'exécutant pour de vrai, sans navigateur. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const FICHIER = 'admin/admin.js';
const SOURCE = fs.readFileSync(path.join(RACINE, FICHIER), 'utf8');

/* Les sept formats attendus, comptés à la main. C'est le garde-fou du contrôle
   des hauteurs : celui-ci énumère les formats FAUTIFS, et une liste vide y vaut
   succès. Si l'extraction de la table devenait aveugle, il passerait au vert
   sur du vide en annonçant que plus aucune hauteur n'est imposée. */
const FORMATS_ATTENDUS = ['image', 'poster', 'logo', 'paysage', 'portrait', 'carre', 'portfolio'];

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Arrondi de comparaison : 1400/788 ne s'écrit pas en décimal exact, et
   comparer des flottants au caractère près ferait échouer l'épreuve pour une
   raison qui n'a rien à voir avec ce qu'elle surveille. */
const arrondi = (n) => (typeof n === 'number' && isFinite(n)) ? Math.round(n * 10000) / 10000 : n;

/* Extrait une fonction nommée par comptage d'accolades — même procédé que
   cadrage-affichage.test.js. Le compte reste exact tant qu'aucune accolade
   SOLITAIRE ne traîne dans une chaîne, un commentaire ou une expression
   régulière des fonctions visées : une accolade seule rendrait un corps amputé,
   et l'épreuve éprouverait autre chose que la fonction. */
function extraire(source, nom) {
  const debut = source.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut < 0) throw new Error('fonction ' + nom + ' introuvable');
  const i = source.indexOf('{', debut);
  let profondeur = 0;
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}') { profondeur--; if (!profondeur) return source.slice(debut, j + 1); }
  }
  throw new Error('accolade de fin introuvable pour ' + nom);
}

// ============ 0. CONTRE-CONTRÔLES : l'épreuve voit-elle quelque chose ? ============
/* Ils passent AVANT tout le reste. Plusieurs contrôles ci-dessous constatent une
   ABSENCE — de rognage, de hauteur imposée — et une absence se constate aussi
   bien sur du vide. Sans ces garde-fous, une extraction devenue aveugle les
   ferait tous venir au vert ensemble. */

let corpsPreparer = '';
let corpsChoisir = '';
try { corpsPreparer = extraire(SOURCE, 'preparerImage'); }
catch (e) { verifier('preparerImage est bien retrouvée dans le source', e.message, 'trouvée'); }
try { corpsChoisir = extraire(SOURCE, 'choisirCadrage'); }
catch (e) { verifier('choisirCadrage est bien retrouvée dans le source', e.message, 'trouvée'); }

verifier('preparerImage retrouvée, et pas un corps vide', corpsPreparer.length > 400, true);
verifier('choisirCadrage retrouvée, et pas un corps vide', corpsChoisir.length > 400, true);

/* La table des formats est délimitée à la main : la borne de fin est l'accolade
   fermante suivie du point-virgue de la déclaration, et non la première
   rencontrée — la table contient une accolade fermante par format. */
const debutTable = SOURCE.indexOf('var FORMATS_IMAGE = {');
const finTable = SOURCE.indexOf('\n  };', debutTable);
const table = (debutTable >= 0 && finTable > debutTable) ? SOURCE.slice(debutTable, finTable) : '';
verifier('la table FORMATS_IMAGE est bien délimitée', table.length > 200, true);

/* Les formats sont relevés sur la même forme que celle qu'exige textes.test.js
   (`    nom: { largeur:`). Les compter et les NOMMER, pas seulement les
   compter : sept entrées dont une renommée passerait un simple compte. */
const formatsTrouves = [...table.matchAll(/^ {4}([a-z]+): \{ largeur: (\d+), hauteur: ([^,]+),/gm)]
  .map(m => ({ nom: m[1], largeur: Number(m[2]), hauteur: m[3].trim() }));
verifier('les sept formats sont relevés, et ce sont bien ceux-là',
  formatsTrouves.map(f => f.nom), FORMATS_ATTENDUS);

// ============ 1. Plus aucun rognage à l'envoi ============
/* On vise la forme à NEUF arguments prenant une zone SOURCE. C'est elle, et
   elle seule, qui grave un cadrage dans le fichier envoyé. */
const rognagesDansEnvoi = [...corpsPreparer.matchAll(/drawImage\(bitmap, zone\./g)].length;
verifier('preparerImage ne rogne plus d’après une zone source', rognagesDansEnvoi, 0);

/* Le contrôle précédent constate une absence, donc aussi : un seul drawImage
   dans preparerImage, et c'est celui qui pose l'image entière. Une version qui
   rognerait autrement — sur des variables renommées — échouerait ici. */
verifier('preparerImage ne dessine qu’une fois',
  [...corpsPreparer.matchAll(/drawImage\(/g)].length, 1);

/* Contre-contrôle du contrôle d'absence : le dessin à neuf arguments doit
   EXISTER ailleurs, dans l'aperçu de la fenêtre de recadrage. S'il avait
   disparu du fichier entier, l'absence ci-dessus ne prouverait plus rien — et
   l'aperçu, lui, ne montrerait plus la photo. */
verifier('l’aperçu de la fenêtre dessine toujours, lui, une zone source',
  corpsChoisir.indexOf('ctx.drawImage(bitmap, centreX - l / 2, centreY - h / 2, l, h, 0, 0,') !== -1, true);

// ============ 2. L'image part entière, bornée en largeur ============
verifier('la toile pose l’image entière',
  corpsPreparer.indexOf('ctx.drawImage(bitmap, 0, 0, largeur, hauteur);') !== -1, true);
verifier('la largeur est bornée par le format, jamais agrandie',
  corpsPreparer.indexOf('Math.min(f.largeur, bitmap.width)') !== -1, true);
verifier('la hauteur suit le rapport de la photo',
  corpsPreparer.indexOf('bitmap.height / bitmap.width') !== -1, true);
/* Les mesures de la zone ne doivent plus commander la toile : les lire encore
   remettrait un rognage par la bande. */
verifier('les mesures en pixels de la zone ne commandent plus la toile',
  /zone\.(largeur|hauteur|x|y)/.test(corpsPreparer), false);

/* La forme du retour : `activerChampImage` lit prete.poids, prete.base64 et
   prete.type. Emballer l'objet rendu par `encoder` casserait ces trois lectures
   en silence — l'envoi partirait avec un base64 indéfini. Le cadrage doit donc
   être ACCROCHÉ sur cet objet. */
verifier('le cadrage est accroché sur l’objet rendu par encoder, pas emballé autour',
  /\.cadrage = /.test(corpsPreparer), true);
verifier('et les trois lectures de activerChampImage tiennent toujours',
  (() => {
    const appelant = extraire(SOURCE, 'activerChampImage');
    return ['prete.poids', 'prete.base64', 'prete.type'].filter(l => appelant.indexOf(l) === -1);
  })(), []);

// ============ 3. La fenêtre rend des valeurs RELATIVES ============
/* Une zone de pixels serait juste à une taille d'écran et fausse à l'autre :
   l'emplacement de la photo du formateur passe de 4/5 à 5/4 sous 1023 px. */
const iValider = corpsChoisir.indexOf('[data-valider]');
verifier('le bouton de validation est bien retrouvé dans la fenêtre', iValider >= 0, true);
const validation = iValider >= 0 ? corpsChoisir.slice(iValider) : '';
verifier('et ce qu’il rend n’est pas vide', validation.length > 100, true);

verifier('la position en x est relative à la largeur de la photo',
  validation.indexOf('centreX / bitmap.width * 100') !== -1, true);
verifier('la position en y est relative à la hauteur de la photo',
  validation.indexOf('centreY / bitmap.height * 100') !== -1, true);
verifier('l’agrandissement est relatif à l’échelle minimale',
  validation.indexOf('echelle / echelleMin * 100') !== -1, true);
verifier('un zoom est bien rendu', /zoom:/.test(validation), true);

/* Contrôle d'absence, donc visant une chaîne qui n'existe QUE dans l'ancienne
   version : `largeur: largeurScene / echelle`. Chercher « largeur » seul aurait
   passé sur `bitmap.width`, et chercher « largeurScene » aurait échoué à tort,
   puisque l'aperçu s'en sert encore légitimement. */
verifier('la zone en pixels n’est plus rendue',
  validation.indexOf('largeur: largeurScene / echelle') !== -1
  || validation.indexOf('hauteur: hauteurScene / echelle') !== -1, false);

/* Les bornes sont refaites ici, comme le script Google et site-common.js les
   refont chacun de leur côté : une valeur hors bornes sortirait la photo de son
   cadre, et le site ne doit jamais faire confiance à ce qu'il reçoit. */
verifier('les trois mesures sont bornées avant d’être rendues',
  [...validation.matchAll(/bornerCadrage\(/g)].length, 3);
verifier('positions bornées dans 0–100 et agrandissement dans 100–250',
  validation.indexOf(', 0, 100)') !== -1 && validation.indexOf(', 100, 250)') !== -1, true);

/* ---- Le curseur doit dire la vérité ----
   La borne de l'agrandissement vit à TROIS endroits sans rien qui les relie :
   l'attribut `max` du curseur, le bornage à la validation, et la constante du
   script Google qui enregistre. Deux valeurs qui doivent rester d'accord et qui
   vivent séparément, c'est exactement ce qui dérive en silence. Le curseur
   montait à 400 alors que le code ramène à 250 : l'administrateur voyait à
   l'écran un cadrage serré et en obtenait un autre sur le site. */
const curseur = /class="recadrage__zoom" min="(\d+)" max="(\d+)"/.exec(corpsChoisir);
verifier('le curseur d’agrandissement est bien retrouvé dans la fenêtre', !!curseur, true);

/* Les bornes du code sont relues sur l'expression EXACTE qui les applique, et
   non sur un « 250 » trouvé au hasard du fichier : un nombre pris ailleurs
   ferait un contrôle qui se compare à lui-même. */
const bornesCode = /zoom: bornerCadrage\(Math\.round\(echelle \/ echelleMin \* 100\), (\d+), (\d+)\)/
  .exec(validation);
verifier('le bornage de l’agrandissement est bien retrouvé', !!bornesCode, true);

if (curseur && bornesCode) {
  verifier('le curseur ne propose pas un agrandissement que le code ramènerait',
    Number(curseur[2]), Number(bornesCode[2]));
  verifier('et il ne descend pas sous le plancher que le code applique',
    Number(curseur[1]), Number(bornesCode[1]));

  /* Contre-contrôle des deux précédents : ils comparent le curseur au code, et
     passeraient si les DEUX dérivaient ensemble vers 400. On les rattache donc
     à ce que le script Google enregistre réellement — un cadrage au-delà de sa
     borne serait ramené à l'écriture, et le réglage montré ici serait perdu. */
  const gs = fs.readFileSync(
    path.join(RACINE, 'scripts', 'apps-script', 'impactali-inscriptions.gs'), 'utf8');
  const gsMax = /var CADRAGE_ZOOM_MAX = (\d+);/.exec(gs);
  const gsMin = /var CADRAGE_ZOOM_MIN = (\d+);/.exec(gs);
  verifier('les bornes du script Google sont bien retrouvées', !!gsMax && !!gsMin, true);
  if (gsMax && gsMin) {
    verifier('la fenêtre borne comme le script Google enregistre',
      [Number(bornesCode[1]), Number(bornesCode[2])], [Number(gsMin[1]), Number(gsMax[1])]);
  }
}

// ============ 4. Aucun format n'impose plus de hauteur ============
/* Une hauteur imposée ferait revenir le rognage par la porte de derrière :
   preparerImage n'en tient plus compte, mais la fenêtre de recadrage, si. */
verifier('aucun format n’impose de hauteur',
  formatsTrouves.filter(f => f.hauteur !== 'null').map(f => f.nom + ' : ' + f.hauteur), []);

/* Les libellés sont montrés à l'administrateur. « portrait 760 × 950 » lui
   promet un rognage qui n'a plus lieu : il choisirait sa photo en conséquence. */
verifier('aucun libellé ne promet plus deux mesures',
  [...table.matchAll(/^ {4}([a-z]+): .*libelle: '([^']*)'/gm)]
    .filter(m => m[2].indexOf('×') !== -1).map(m => m[1]), []);

// ============ 5. Le rapport imposable, exécuté pour de vrai ============
/* Ces deux fonctions sont chargées et APPELÉES, sans navigateur : un contrôle
   qui se contenterait de chercher le mot « rapport » dans le source passerait
   sur une version qui accepte le paramètre et l'ignore — exactement la panne
   qui rendrait la fenêtre décorative. */
let rapportDuCadre = null;
let lireRapport = null;
try {
  const bac = {};
  vm.createContext(bac);
  vm.runInContext(extraire(SOURCE, 'lireRapport') + ';\n' + extraire(SOURCE, 'rapportDuCadre')
    + ';\nglobalThis.__lire = lireRapport; globalThis.__cadre = rapportDuCadre;', bac);
  lireRapport = bac.__lire;
  rapportDuCadre = bac.__cadre;
} catch (e) {
  verifier('le calcul du rapport du cadre se lit sans navigateur', e.message, 'lu');
}
verifier('les deux fonctions du rapport sont chargées',
  typeof lireRapport === 'function' && typeof rapportDuCadre === 'function', true);

if (typeof lireRapport === 'function' && typeof rapportDuCadre === 'function') {
  // Les quatre fractions réellement déclarées par les data-image-ratio du site
  verifier('« 19/20 » (la bannière) se lit', arrondi(lireRapport('19/20')), 0.95);
  verifier('« 12/7 » (la méthode) se lit', arrondi(lireRapport('12/7')), 1.7143);
  verifier('« 4/5 » (le formateur, accueil) se lit', arrondi(lireRapport('4/5')), 0.8);
  verifier('« 3/4 » (le formateur, fiche) se lit', arrondi(lireRapport('3/4')), 0.75);

  /* Ce qui ne se lit pas est écarté, pas deviné : un rapport à moitié compris
     donnerait un cadre faux sans qu'aucun écran ne dise pourquoi. */
  verifier('rien à lire, rien de rendu',
    [undefined, null, '', '   ', 'carre', '4/', '/5', '4/0', '-4/5', '4/5/6', 'NaN']
      .map(v => lireRapport(v)), new Array(11).fill(null));

  /* LE contrôle central. La photo mesure 2000 × 1000, soit un rapport de 2 :
     c'est ce que la fenêtre prendrait toute seule maintenant que les hauteurs
     sont nulles, et son cadre épouserait la photo. Le rapport imposé doit
     l'emporter, sinon déplacer et agrandir ne servent plus à rien. */
  const photo = { width: 2000, height: 1000 };
  verifier('le rapport imposé l’emporte sur celui de la photo',
    arrondi(rapportDuCadre({ largeur: 900, hauteur: null }, photo, '4/5')), 0.8);

  /* Contre-contrôle du précédent : sans lui, une fonction qui rendrait
     TOUJOURS 0,8 — ou n'importe quelle constante — passerait le contrôle
     ci-dessus en donnant le bon nombre pour la mauvaise raison. */
  verifier('et un autre rapport imposé donne un autre cadre',
    arrondi(rapportDuCadre({ largeur: 900, hauteur: null }, photo, '12/7')), 1.7143);

  // Sans rapport, on retombe sur le comportement d'aujourd'hui
  verifier('sans rapport et sans hauteur, le cadre suit la photo',
    arrondi(rapportDuCadre({ largeur: 900, hauteur: null }, photo, undefined)), 2);
  verifier('un rapport illisible ne fabrique pas un cadre au hasard',
    arrondi(rapportDuCadre({ largeur: 900, hauteur: null }, photo, 'n’importe quoi')), 2);
  verifier('une hauteur de format, si elle revenait, primerait encore sur la photo',
    arrondi(rapportDuCadre({ largeur: 1400, hauteur: 788 }, photo, null)), 1.7766);
}

/* La chaîne n'est pas complète : personne ne passe encore de rapport. Ces deux
   contrôles surveillent le câblage déjà posé — le paramètre traverse
   preparerImage jusqu'à choisirCadrage — pour que la tâche suivante n'ait plus
   qu'à le fournir depuis le formulaire. */
verifier('preparerImage accepte un rapport et le transmet',
  /function preparerImage\(fichier, format, rapport\)/.test(SOURCE)
  && corpsPreparer.indexOf('choisirCadrage(bitmap, format, rapport)') !== -1, true);
verifier('choisirCadrage accepte un rapport et s’en sert pour son cadre',
  /function choisirCadrage\(bitmap, format, rapport\)/.test(SOURCE)
  && corpsChoisir.indexOf('rapportDuCadre(f, bitmap, rapport)') !== -1, true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

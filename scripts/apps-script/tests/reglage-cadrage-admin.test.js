/* Le réglage du cadrage, dans un aperçu qui a la forme réelle de l'emplacement.
 *
 * Toute la plomberie existait — le cadrage est rangé dans la feuille, appliqué
 * par le site, et chaque emplacement annonce son rapport — mais rien ne
 * permettait de le RÉGLER. Cette épreuve surveille les trois endroits où la
 * chaîne se rompait en silence :
 *
 * 1. LA CHARGE FAIT AUTORITÉ. `enregistrerImages` réécrit la feuille d'après ce
 *    qu'il reçoit : un cadrage que `cadrages` ne renvoie pas est EFFACÉ. Le
 *    bouton n'envoyait que `donnees` — chaque « Enregistrer les visuels »
 *    aurait donc effacé tous les cadrages, sans message.
 *
 * 2. LE CADRAGE CHOISI À L'ENVOI ÉTAIT JETÉ. `preparerImage` accroche
 *    `prete.cadrage` sur l'image préparée, et `activerChampImage` n'en faisait
 *    rien : on réglait un cadrage dans la fenêtre, et il disparaissait.
 *
 * 3. LA FENÊTRE NE CONNAISSAIT PAS LA FORME DE L'EMPLACEMENT. Sans rapport, son
 *    cadre épouse la photo : rien ne dépasse, déplacer et agrandir ne changent
 *    plus rien à ce qui part, et la fenêtre fait croire à un réglage.
 *
 * Tout ce qui peut s'exécuter est EXÉCUTÉ, sans navigateur : un contrôle qui se
 * contente de chercher un mot dans le source passe sur une version qui accepte
 * la valeur et l'ignore — exactement la panne qu'on surveille. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

const SOURCE = lire('admin/admin.js');
const CSS = lire('admin/admin.css');
const COMMUN = lire('site-common.js');
const GS = lire('scripts/apps-script/impactali-inscriptions.gs');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Extrait une fonction nommée par comptage d'accolades — même procédé que
   cadrage-affichage.test.js et envoi-non-destructif.test.js. Le compte reste
   exact tant qu'aucune accolade SOLITAIRE ne traîne dans une chaîne, un
   commentaire ou une expression régulière des fonctions visées : une accolade
   seule rendrait un corps amputé, et l'épreuve éprouverait autre chose. */
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

// ========== 0. CONTRE-CONTRÔLES : l'épreuve voit-elle quelque chose ? ==========
/* Ils passent AVANT tout le reste. Plusieurs contrôles ci-dessous cherchent une
   chaîne dans un corps de fonction : une extraction devenue aveugle les ferait
   tous échouer ensemble, ou pire, ferait passer au vert ceux qui constatent une
   absence. On vérifie donc d'abord que chaque corps existe et n'est pas vide. */

const CORPS_ATTENDUS = [
  ['chargerVisuelsDuSite', 900],
  ['rendreVisuels', 1500],
  ['activerChampImage', 1500],
  ['activerBlocCadrage', 1500],
  ['blocCadrage', 900],
  ['chargeVisuels', 400]
];

const corps = {};
const manquants = [];
CORPS_ATTENDUS.forEach(([nom, taille]) => {
  try {
    corps[nom] = extraire(SOURCE, nom);
    if (corps[nom].length < taille) manquants.push(nom + ' : ' + corps[nom].length + ' signes');
  } catch (e) {
    corps[nom] = '';
    manquants.push(nom + ' : ' + e.message);
  }
});
verifier('les six fonctions visées sont retrouvées, et aucune n’est un corps vide',
  manquants, []);

/* Les fonctions pures sont chargées dans un bac à sable et APPELÉES. `echapper`
   en fait partie : `blocCadrage` s'en sert pour poser l'adresse de la photo. */
const PURES = ['echapper', 'bornerCadrage', 'mesureCadrage', 'cadrageValide', 'cadrageParDefaut',
  'styleCadrage', 'deplacerCadrage', 'lireRapport', 'formeApercu', 'blocCadrage', 'chargeVisuels'];

/* La forme de repli est RELUE dans le source, jamais recopiée ici : écrite en
   double, elle dériverait, et l'épreuve certifierait sa propre valeur. */
const declarationRepli = /var FORME_APERCU_DEFAUT = '[^']*';/.exec(SOURCE);
verifier('la forme de repli de l’aperçu est déclarée une seule fois, et retrouvée',
  declarationRepli ? SOURCE.split('var FORME_APERCU_DEFAUT =').length - 1 : 0, 1);

let bac = null;
try {
  bac = {};
  vm.createContext(bac);
  vm.runInContext((declarationRepli ? declarationRepli[0] + '\n' : '')
    + PURES.map(n => extraire(SOURCE, n)).join(';\n')
    + ';\nglobalThis.__f = { ' + PURES.map(n => n + ': ' + n).join(', ') + ' };', bac);
} catch (e) {
  bac = null;
  verifier('les fonctions pures du réglage se chargent sans navigateur', e.message, 'chargées');
}
const f = (bac && bac.__f) || {};
verifier('les onze fonctions pures sont appelables',
  PURES.filter(n => typeof f[n] !== 'function'), []);

// ================= 1. Le relevé du rapport de l'emplacement =================
/* `format` dit la PHOTO attendue, pas le trou où elle tombe : la bannière
   s'annonce « paysage » et occupe un carré. Sans ce relevé, l'aperçu montrerait
   une forme, et le visiteur en verrait une autre. */
verifier('chargerVisuelsDuSite relève le rapport déclaré par l’emplacement',
  corps.chargerVisuelsDuSite.indexOf("rapport: el.getAttribute('data-image-ratio') || ''") !== -1,
  true);

/* Contre-contrôle : on lit bien la bonne fonction, celle qui relève aussi le
   format et l'adresse d'origine. Le contrôle ci-dessus passerait sur n'importe
   quel corps contenant cette ligne. */
verifier('et c’est bien le relevé des visuels, format et origine compris',
  corps.chargerVisuelsDuSite.indexOf("format: el.getAttribute('data-image-format')") !== -1
  && corps.chargerVisuelsDuSite.indexOf('origine: adresseAbsolue(') !== -1, true);

/* Contre-contrôle du relevé : si le site cessait de déclarer ces rapports, le
   relevé rendrait toujours la chaîne vide et tout l'écran de réglage tomberait
   sur sa forme de repli sans que rien ne le dise. */
verifier('le site déclare bien des rapports à relever',
  [...lire('index.html').matchAll(/data-image-ratio="([^"]+)"/g)].length > 0, true);

// ============ 2. PIÈGE 1 : les cadrages partent avec l'enregistrement ============
/* Exécuté, pas lu. Trois visuels déclarés, trois situations. */
const DECLARES = [
  { cle: 'accueil.hero', origine: '/assets/images/hero.webp' },
  { cle: 'accueil.methode.1', origine: '/assets/images/methode-1.webp' },
  { cle: 'accueil.formateur.photo', origine: '/assets/images/formateur.webp' }
];

if (typeof f.chargeVisuels === 'function') {
  const charge = f.chargeVisuels(DECLARES, (cle) => ({
    // remplacé, avec un cadrage réglé
    'accueil.hero': { valeur: 'https://drive/nouvelle.webp', cadrage: { x: 70, y: 30, zoom: 160 } },
    // remplacé, jamais déplacé : le cadrage neutre part quand même
    'accueil.methode.1': { valeur: 'https://drive/autre.webp', cadrage: { x: 50, y: 50, zoom: 100 } },
    /* revenu à l'image d'origine, mais un cadrage traîne encore dans son bloc :
       la ligne va être effacée, un cadrage orphelin n'aurait plus de sujet */
    'accueil.formateur.photo': { valeur: '/assets/images/formateur.webp', cadrage: { x: 10, y: 90, zoom: 200 } }
  })[cle] || null);

  /* Les deux moitiés de la charge sont relues à travers un repli : une charge
     amputée de ses cadrages — le défaut même qu'on surveille — doit se lire
     comme un échec NOMMÉ, et non faire tomber l'épreuve sur une pile d'appels
     avant que le bilan ne s'affiche. */
  const donneesDe = (c) => (c && c.donnees) || {};
  const cadragesDe = (c) => (c && c.cadrages) || {};

  verifier('la charge porte les deux clés, et ce sont bien celles que le script Google lit',
    Object.keys(charge), ['donnees', 'cadrages']);
  verifier('un visuel remplacé emporte son adresse',
    donneesDe(charge)['accueil.hero'], 'https://drive/nouvelle.webp');
  verifier('et son cadrage', cadragesDe(charge)['accueil.hero'], { x: 70, y: 30, zoom: 160 });
  verifier('un cadrage neutre part tout de même : il doit écraser l’ancien dans la feuille',
    cadragesDe(charge)['accueil.methode.1'], { x: 50, y: 50, zoom: 100 });
  verifier('un visuel revenu à son image d’origine efface sa ligne',
    donneesDe(charge)['accueil.formateur.photo'], '');
  verifier('et n’emporte aucun cadrage orphelin',
    Object.prototype.hasOwnProperty.call(cadragesDe(charge), 'accueil.formateur.photo'), false);

  /* Contre-contrôle : sans lui, une fonction qui ne rendrait JAMAIS de cadrage
     passerait les deux contrôles d'absence ci-dessus. */
  verifier('deux cadrages sont bien rendus, l’absence du troisième veut donc dire quelque chose',
    Object.keys(cadragesDe(charge)).sort(), ['accueil.hero', 'accueil.methode.1']);

  // Un bloc jamais réglé, ou illisible : l'adresse part seule plutôt que rien
  const sansCadrage = f.chargeVisuels(DECLARES, (cle) => cle === 'accueil.hero'
    ? { valeur: 'https://drive/n.webp', cadrage: null } : null);
  verifier('un remplacement sans cadrage part quand même',
    donneesDe(sansCadrage)['accueil.hero'], 'https://drive/n.webp');
  verifier('et n’invente pas de cadrage', cadragesDe(sansCadrage), {});
  verifier('un visuel absent du formulaire n’est pas effacé au passage',
    Object.keys(donneesDe(sansCadrage)), ['accueil.hero']);

  // Ce qui arrive du bloc est borné avant de partir : la feuille se modifie aussi à la main
  const horsBornes = f.chargeVisuels([DECLARES[0]], () => ({
    valeur: 'https://drive/n.webp', cadrage: { x: -40, y: 900, zoom: 5000 }
  }));
  verifier('un cadrage hors bornes est ramené avant de partir',
    cadragesDe(horsBornes)['accueil.hero'], { x: 0, y: 100, zoom: 250 });

  const partiel = f.chargeVisuels([DECLARES[0]], () => ({
    valeur: 'https://drive/n.webp', cadrage: { x: 50 }
  }));
  verifier('un cadrage partiel est écarté en entier, comme le fait le site',
    cadragesDe(partiel), {});
}

/* La charge doit partir ENTIÈRE. On vise `appeler('admin.images.save', charge)`,
   écriture qui n'existe que dans la version correcte : l'ancienne passait
   `{ donnees: donnees }`. */
verifier('l’enregistrement envoie la charge entière, adresses ET cadrages',
  corps.rendreVisuels.indexOf("appeler('admin.images.save', charge)") !== -1, true);
verifier('et la charge est bien celle que chargeVisuels a composée',
  corps.rendreVisuels.indexOf('chargeVisuels(etat.visuelsDeclares') !== -1, true);

/* Les deux clés envoyées et les deux arguments lus par le script Google vivent
   dans deux fichiers : renommer d'un côté ferait disparaître les cadrages sans
   la moindre erreur. On les rattache. */
const luParLeScript = /case 'admin\.images\.save':\s*return repondre\(enregistrerImages\(d\.(\w+), d\.(\w+)\)/
  .exec(GS);
verifier('la lecture du script Google est bien retrouvée', !!luParLeScript, true);
if (luParLeScript && typeof f.chargeVisuels === 'function') {
  verifier('le tableau de bord envoie exactement les deux clés que le script Google lit',
    Object.keys(f.chargeVisuels([], () => null)), [luParLeScript[1], luParLeScript[2]]);
}

/* Et le script Google traite bien la charge comme faisant autorité : c'est ce
   qui rend l'envoi des cadrages obligatoire. Si sa signature perdait son second
   argument, tout ce qui précède deviendrait sans objet. */
verifier('le script Google attend bien des cadrages à côté des adresses',
  /function enregistrerImages\(donnees, cadrages\)/.test(GS), true);

// ============ 3. PIÈGE 2 : le cadrage de la fenêtre arrive au bloc ============
/* `prete.cadrage` arrive avec l'image préparée ; l'adresse qui lui donne un
   sujet n'arrive qu'à la réponse de l'envoi, dans une autre portée. Sans mise
   de côté, le réglage fait dans la fenêtre est jeté. */
verifier('le cadrage choisi dans la fenêtre est mis de côté',
  corps.activerChampImage.indexOf('var cadrageChoisi = null;') !== -1
  && corps.activerChampImage.indexOf('cadrageChoisi = prete.cadrage;') !== -1, true);
verifier('puis reporté dans le bloc de réglage avec l’adresse envoyée',
  corps.activerChampImage.indexOf('reglage.montrer(reponse.url, cadrageChoisi)') !== -1, true);

/* Contre-contrôle : la mise de côté est déclarée DANS le gestionnaire de choix
   de fichier, donc remise à neuf à chaque image. Déclarée plus haut, le cadrage
   d'une photo abandonnée serait reporté sur la suivante. */
const iChange = corps.activerChampImage.indexOf("entree.addEventListener('change'");
verifier('le gestionnaire de choix de fichier est bien retrouvé', iChange >= 0, true);
verifier('et la mise de côté est repartie à neuf à chaque photo',
  iChange >= 0 && corps.activerChampImage.indexOf('var cadrageChoisi = null;') > iChange, true);

/* Le bloc n'est révélé QU'APRÈS un envoi réussi — avant, il n'aurait aucune
   adresse à montrer — et masqué de nouveau quand on retire le visuel. */
verifier('montrer révèle le bloc, masquer le referme',
  corps.activerBlocCadrage.indexOf('bloc.hidden = false;') !== -1
  && corps.activerBlocCadrage.indexOf('bloc.hidden = true;') !== -1, true);
verifier('retirer le visuel referme son réglage',
  corps.activerChampImage.indexOf('if (reglage) reglage.masquer();') !== -1, true);

/* Et la photo est réellement retirée de l'aperçu : la laisser afficherait une
   image qui ne sera plus posée, sous un champ vide. */
verifier('et la photo quitte l’aperçu avec elle',
  corps.activerBlocCadrage.indexOf("image.removeAttribute('src')") !== -1, true);

// ============ 4. PIÈGE 3 : le rapport arrive jusqu'à preparerImage ============
/* ATTENTION : `preparerImage(fichier, format, rapport)` figure DEUX fois dans
   le fichier — la déclaration, et l'appel. Chercher cette chaîne dans le source
   entier reviendrait à constater que la fonction existe, pas qu'on l'appelle
   ainsi. Le contrôle porte donc sur le corps de l'appelant. */
verifier('activerChampImage appelle preparerImage avec le rapport',
  corps.activerChampImage.indexOf('preparerImage(fichier, format, rapport)') !== -1, true);
verifier('et ce n’est pas la déclaration qu’on vient de lire',
  SOURCE.split('preparerImage(fichier, format, rapport)').length - 1, 2);
verifier('activerChampImage accepte bien un rapport',
  /function activerChampImage\(cle, format, rapport\)/.test(SOURCE), true);
verifier('et rendreVisuels lui passe celui de l’emplacement',
  corps.rendreVisuels.indexOf("activerChampImage('visuel-' + v.cle, v.format, v.rapport)") !== -1,
  true);

// ============ 5. Le bloc est rendu, mais masqué sans photo (exécuté) ============
if (typeof f.blocCadrage === 'function') {
  const vide = f.blocCadrage('visuel-accueil.hero', '19/20', '', null);
  const posee = f.blocCadrage('visuel-accueil.hero', '19/20', 'https://drive/p.webp',
    { x: 70, y: 30, zoom: 160 });

  verifier('sans photo, le bloc est masqué', vide.indexOf(' hidden>') !== -1, true);
  verifier('et c’est le bloc entier qui est masqué, pas un morceau',
    vide.indexOf(' hidden>') < vide.indexOf('cadrage__scene'), true);

  /* Contre-contrôle : le bloc masqué doit être un VRAI bloc, complet. Sans lui,
     une fonction qui rendrait la chaîne vide passerait tous les contrôles
     d'absence ci-dessus — et l'écran de réglage n'existerait plus. */
  verifier('le bloc masqué est bien rendu, curseur et bouton compris',
    vide.indexOf('cadrage__zoom') !== -1 && vide.indexOf('data-cadrage-defaut') !== -1
    && vide.indexOf('cadrage__valeur') !== -1 && vide.length > 600, true);
  verifier('et il ne demande pas d’image à charger tant qu’il n’y en a pas',
    vide.indexOf(' src=') !== -1, false);

  verifier('avec une photo, le bloc est visible', posee.indexOf(' hidden') !== -1, false);
  verifier('et il montre la photo posée',
    posee.indexOf(' src="https://drive/p.webp"') !== -1, true);
  verifier('le cadrage enregistré est repris dans l’aperçu',
    posee.indexOf('object-position: 70% 30%; transform: scale(1.6)') !== -1, true);
  verifier('et dans la position du curseur d’agrandissement',
    posee.indexOf('min="100" max="250" value="160"') !== -1, true);
  verifier('le cadrage est aussi rangé dans le champ qui repartira à l’enregistrement',
    posee.indexOf('cadrage__valeur" value="{&quot;x&quot;:70,&quot;y&quot;:30,&quot;zoom&quot;:160}"') !== -1,
    true);

  /* Sans cadrage enregistré, la photo s'affiche centrée et sans agrandissement
     — et non collée dans un coin, ce que donnerait un cadrage à demi lu. */
  const neuve = f.blocCadrage('visuel-x', '4/5', 'https://drive/n.webp', null);
  verifier('une photo sans cadrage connu s’affiche centrée, sans agrandissement',
    neuve.indexOf('object-position: 50% 50%; transform: none') !== -1, true);

  // L'adresse de la photo est échappée : elle vient de la réponse du serveur
  const piegee = f.blocCadrage('visuel-x', '4/5', 'https://d/p.webp" onerror="alerte()', null);
  verifier('l’adresse de la photo ne peut pas ouvrir d’attribut',
    piegee.indexOf('onerror="') !== -1, false);
}

// ============ 6. La forme de l'aperçu, convertie et EXÉCUTÉE ============
if (typeof f.formeApercu === 'function') {
  // Les quatre fractions réellement déclarées par les data-image-ratio du site
  verifier('« 19/20 » (la bannière) devient une forme d’aperçu', f.formeApercu('19/20'), '19 / 20');
  verifier('« 12/7 » (la méthode) aussi', f.formeApercu('12/7'), '12 / 7');
  verifier('« 4/5 » (le formateur, accueil) aussi', f.formeApercu('4/5'), '4 / 5');
  verifier('« 3/4 » (le formateur, fiche) aussi', f.formeApercu('3/4'), '3 / 4');

  /* Contre-contrôle : sans lui, une fonction rendant TOUJOURS la même forme
     donnerait le bon résultat pour la mauvaise raison — et tous les aperçus
     auraient la même forme, quelle que soit la page. */
  verifier('deux emplacements de formes différentes donnent deux aperçus différents',
    f.formeApercu('19/20') !== f.formeApercu('12/7'), true);

  /* Ce qui ne se lit pas retombe sur une forme de repli, la même pour tous : un
     rapport à moitié compris donnerait un aperçu faux sans qu'aucun écran ne
     dise pourquoi. */
  const replis = [undefined, null, '', '   ', 'carre', '4/', '/5', '4/0', '-4/5', '4/5/6', 'NaN']
    .map(v => f.formeApercu(v));
  verifier('tout ce qui ne se lit pas retombe sur une seule et même forme de repli',
    [...new Set(replis)].length, 1);
  verifier('et ce repli n’est pas une forme lisible prise au hasard',
    replis[0] !== f.formeApercu('19/20'), true);

  /* La fraction est RECONSTRUITE à partir de ses deux nombres. Elle vient d'un
     attribut relevé sur une page et finit dans un attribut `style` : recopiée
     telle quelle, elle y ajouterait des déclarations. */
  const injection = f.formeApercu('19/20; background: url(http://ailleurs)');
  verifier('un rapport qui tente d’écrire une autre déclaration est écarté',
    injection, replis[0]);
  verifier('et aucune forme rendue ne contient de point-virgule',
    ['19/20', '12/7', '1/1', 'n’importe quoi'].filter(v => f.formeApercu(v).indexOf(';') !== -1), []);

  // La forme calculée est bien celle que le bloc pose, en ligne
  if (typeof f.blocCadrage === 'function') {
    verifier('et c’est cette forme que l’aperçu prend, emplacement par emplacement',
      f.blocCadrage('visuel-x', '12/7', 'https://d/p.webp', null)
        .indexOf('style="aspect-ratio: 12 / 7"') !== -1, true);
  }
}

// ============ 7. Le glisser, exécuté ============
if (typeof f.deplacerCadrage === 'function') {
  const APERCU = { l: 260, h: 325 };

  /* LE contrôle central : un déplacement d'une largeur d'aperçu parcourt toute
     la photo. Compté en pixels, le même geste aurait donné deux réglages selon
     la taille de l'écran, et le cadrage serait devenu impraticable là où
     l'aperçu est petit. */
  verifier('traîner la photo d’une largeur d’aperçu la parcourt tout entière',
    f.deplacerCadrage({ x: 0, y: 50, zoom: 100 }, -APERCU.l, 0, APERCU.l, APERCU.h).x, 100);
  verifier('et d’une hauteur d’aperçu, de haut en bas',
    f.deplacerCadrage({ x: 50, y: 0, zoom: 100 }, 0, -APERCU.h, APERCU.l, APERCU.h).y, 100);

  /* Contre-contrôle : sans lui, une fonction qui pousserait toujours à la butée
     — ou un bornage trop serré — passerait les deux contrôles ci-dessus. */
  verifier('la moitié du geste ne fait que la moitié du chemin',
    f.deplacerCadrage({ x: 0, y: 50, zoom: 100 }, -APERCU.l / 2, 0, APERCU.l, APERCU.h).x, 50);

  /* Le sens : tirer la photo vers la droite découvre sa partie gauche. Inversé,
     le réglage part dans la direction opposée au geste. */
  verifier('tirer la photo vers la droite découvre sa gauche',
    f.deplacerCadrage({ x: 100, y: 50, zoom: 100 }, APERCU.l, 0, APERCU.l, APERCU.h).x, 0);

  /* Le réglage doit être le MÊME sur un petit et un grand aperçu : c'est tout
     l'intérêt de compter en proportions. Le résultat attendu est écrit en
     toutes lettres et tombe LOIN des butées : comparer les deux appels entre
     eux passerait aussi si les deux venaient buter au même endroit. */
  verifier('le même geste, rapporté à l’aperçu, donne le même réglage sur un petit écran',
    f.deplacerCadrage({ x: 50, y: 40, zoom: 130 }, 65, 30, 260, 325), { x: 25, y: 31, zoom: 130 });
  verifier('… et sur un grand, sans qu’aucun des deux ne vienne buter',
    f.deplacerCadrage({ x: 50, y: 40, zoom: 130 }, 160, 73.84615384615385, 640, 800),
    { x: 25, y: 31, zoom: 130 });

  // Borné : au-delà, la photo sortirait de son cadre
  verifier('un geste démesuré s’arrête à la butée',
    f.deplacerCadrage({ x: 50, y: 50, zoom: 100 }, -5000, -5000, APERCU.l, APERCU.h),
    { x: 100, y: 100, zoom: 100 });
  verifier('dans l’autre sens aussi',
    f.deplacerCadrage({ x: 50, y: 50, zoom: 100 }, 5000, 5000, APERCU.l, APERCU.h),
    { x: 0, y: 0, zoom: 100 });

  // Déplacer ne touche pas à l'agrandissement
  verifier('déplacer la photo ne change pas son agrandissement',
    f.deplacerCadrage({ x: 50, y: 50, zoom: 190 }, 10, 10, APERCU.l, APERCU.h).zoom, 190);

  /* Un aperçu masqué se mesure à zéro. Sans garde, la division rendrait des NaN
     qui traverseraient le champ caché, l'envoi, et la feuille Google. */
  verifier('un aperçu sans mesure ne fabrique pas de NaN',
    f.deplacerCadrage({ x: 50, y: 50, zoom: 100 }, 30, 30, 0, 0), { x: 50, y: 50, zoom: 100 });
}

// ============ 8. L'aperçu montre ce que le site posera ============
/* Le tableau de bord et le site traduisent chacun le cadrage en style, dans
   deux fichiers. Une divergence — un arrondi, une origine de transformation —
   se paierait par un cadrage réglé à l'écran et un autre chez le visiteur, sans
   que rien ne le signale. On exécute les deux versions côte à côte. */
let styleDuSite = null;
try {
  const bacSite = {};
  vm.createContext(bacSite);
  vm.runInContext(extraire(COMMUN, 'cadrageEnStyle') + ';\nglobalThis.__s = cadrageEnStyle;', bacSite);
  styleDuSite = bacSite.__s;
} catch (e) {
  verifier('la traduction du site se lit sans navigateur', e.message, 'lue');
}
verifier('la traduction du site est chargée', typeof styleDuSite === 'function', true);

if (typeof styleDuSite === 'function' && typeof f.styleCadrage === 'function') {
  const CAS = [
    { x: 70, y: 30, zoom: 160 }, { x: 0, y: 0, zoom: 100 }, { x: 100, y: 100, zoom: 250 },
    { x: 50, y: 50, zoom: 101 }, { x: 33, y: 66, zoom: 145 }, { x: -40, y: 900, zoom: 5000 },
    { x: 50 }, { x: 50, y: '', zoom: 120 }, { x: 50, y: null, zoom: 120 }, null, 'cadrage'
  ];
  const divergences = CAS.filter(c =>
    JSON.stringify(f.styleCadrage(c)) !== JSON.stringify(styleDuSite(c)));
  verifier('l’aperçu traduit le cadrage exactement comme le site', divergences, []);

  /* Contre-contrôle : sans lui, deux fonctions rendant toujours null
     passeraient le contrôle ci-dessus en ne montrant plus jamais de cadrage. */
  verifier('et des styles sont bien produits, l’accord ci-dessus n’est pas un accord sur du vide',
    CAS.filter(c => f.styleCadrage(c) !== null).length, 6);
  verifier('un zoom de 100 ne pose aucune transformation, comme sur le site',
    f.styleCadrage({ x: 50, y: 50, zoom: 100 }).transform, 'none');
}

// ============ 9. Le curseur du bloc dit la vérité ============
/* La borne d'agrandissement vit maintenant à QUATRE endroits sans rien qui les
   relie : le curseur de la fenêtre de recadrage, celui du bloc de réglage, le
   bornage du code, et la constante du script Google. Le curseur de la fenêtre
   montait déjà à 400 quand le code ramenait à 250 : on voyait un cadrage serré
   à l'écran, et le site en posait un autre. */
const curseurBloc = /class="cadrage__zoom" min="(\d+)" max="(\d+)"/.exec(SOURCE);
const curseurFenetre = /class="recadrage__zoom" min="(\d+)" max="(\d+)"/.exec(SOURCE);
const gsMin = /var CADRAGE_ZOOM_MIN = (\d+);/.exec(GS);
const gsMax = /var CADRAGE_ZOOM_MAX = (\d+);/.exec(GS);
verifier('les deux curseurs et les bornes du script Google sont retrouvés',
  !!curseurBloc && !!curseurFenetre && !!gsMin && !!gsMax, true);

if (curseurBloc && curseurFenetre && gsMin && gsMax) {
  verifier('le curseur du bloc propose la même plage que celui de la fenêtre',
    [curseurBloc[1], curseurBloc[2]], [curseurFenetre[1], curseurFenetre[2]]);
  verifier('et la même que celle que le script Google enregistre',
    [Number(curseurBloc[1]), Number(curseurBloc[2])], [Number(gsMin[1]), Number(gsMax[1])]);

  /* Et le bornage du tableau de bord, EXÉCUTÉ : lire les nombres dans le source
     reviendrait à comparer deux écritures sans savoir ce qu'elles font. */
  if (typeof f.cadrageValide === 'function') {
    verifier('ce que le code ramène réellement correspond au curseur',
      [f.cadrageValide({ x: 0, y: 0, zoom: 0 }).zoom, f.cadrageValide({ x: 0, y: 0, zoom: 9999 }).zoom],
      [Number(curseurBloc[1]), Number(curseurBloc[2])]);
  }
}

// ============ 10. Le style de l'aperçu ============
/* On ne garde que les blocs de déclarations, commentaires retirés : une règle
   citée dans une explication n'est pas une règle appliquée. */
const cssNu = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const bloc = (selecteur) => {
  const i = cssNu.indexOf(selecteur + ' {');
  return i < 0 ? null : cssNu.slice(i, cssNu.indexOf('}', i));
};

verifier('l’aperçu, la photo et le bloc ont bien chacun leur règle',
  ['.cadrage', '.cadrage__scene', '.cadrage__photo'].filter(s => bloc(s) === null), []);

/* `hidden` ne fait que PROPOSER display:none : une règle d'affichage sur
   `.cadrage` l'emporte, et le bloc resterait visible sous un visuel sans
   photo — un aperçu vide qu'on essaierait de régler. */
verifier('le bloc masqué disparaît vraiment, malgré son propre affichage',
  /\.cadrage\[hidden\]\s*\{[^}]*display:\s*none/.test(cssNu), true);
verifier('et ce garde-fou sert bien à quelque chose : le bloc pose un affichage',
  /display:\s*\w/.test(bloc('.cadrage') || ''), true);

/* La photo se saisit : sans ce curseur, rien ne dit qu'on peut la déplacer et
   l'aperçu passe pour une vignette figée. */
verifier('le curseur de la souris annonce qu’on peut saisir la photo',
  /cursor:\s*grab/.test(bloc('.cadrage__photo') || ''), true);
verifier('et qu’on la tient pendant le geste',
  /\.cadrage__photo:active\s*\{[^}]*cursor:\s*grabbing/.test(cssNu), true);

/* Le doigt doit déplacer la photo, pas faire défiler la page : sans cela, le
   réglage est impossible sur téléphone. */
verifier('le doigt déplace la photo au lieu de faire défiler la page',
  /touch-action:\s*none/.test(bloc('.cadrage__photo') || ''), true);

/* La forme vient du rapport déclaré, posé en ligne : figée dans la feuille de
   style, elle serait la même pour tous les emplacements. */
verifier('la feuille de style n’impose aucune forme à l’aperçu',
  /aspect-ratio/.test(bloc('.cadrage__scene') || ''), false);
verifier('et l’aperçu rogne bien ce qui dépasse, sinon le cadrage ne montrerait rien',
  /overflow:\s*hidden/.test(bloc('.cadrage__scene') || '')
  && /object-fit:\s*cover/.test(bloc('.cadrage__photo') || ''), true);

/* ---------------------------------------------------------------------------
   LA TAILLE À FOURNIR, EN PIXELS

   L'aide annonçait « Format paysage » — un NOM, qui ne dit pas quoi préparer.
   On sortait une photo de son téléphone en espérant qu'elle tombe juste, et
   l'essentiel du sujet finissait hors cadre. Les deux nombres sont CALCULÉS :
   la largeur est celle à laquelle l'envoi borne le fichier, la hauteur en
   découle par le rapport mesuré sur le site.
   --------------------------------------------------------------------------- */
const vmTaille = require('vm');
const bacTaille = {};
vmTaille.createContext(bacTaille);
/* La table des formats se prend telle quelle dans le source : ses largeurs sont
   la moitié du calcul, et les recopier ici les ferait diverger le jour où elles
   changent. */
const debutTable = SOURCE.indexOf('var FORMATS_IMAGE');
let profTable = 0, finTable = debutTable;
for (let j = SOURCE.indexOf('{', debutTable); j < SOURCE.length; j++) {
  if (SOURCE[j] === '{') profTable++;
  else if (SOURCE[j] === '}') { profTable--; if (!profTable) { finTable = j + 1; break; } }
}

vmTaille.runInContext([
  SOURCE.slice(debutTable, finTable) + ';',
  extraire(SOURCE, 'lireRapport'),
  extraire(SOURCE, 'tailleConseillee'),
  'globalThis.__taille = tailleConseillee;'
].join('\n'), bacTaille);
const taille = bacTaille.__taille;

verifier('la bannière annonce sa taille exacte', taille('carre', '19/20'), '1200 × 1263 px');
verifier('les étapes de la méthode aussi', taille('paysage', '12/7'), '1400 × 817 px');
verifier('la photo du formateur de l’accueil aussi', taille('portrait', '4/5'), '900 × 1125 px');
verifier('celle des fiches aussi', taille('portrait', '3/4'), '900 × 1200 px');

/* Sans rapport déclaré, on donne la largeur seule plutôt qu'une hauteur
   inventée : un chiffre faux serait pire que pas de chiffre. */
verifier('sans rapport, seule la largeur est annoncée',
  taille('paysage', ''), '1400 px de large');
verifier('un rapport illisible ne produit pas de hauteur devinée',
  taille('paysage', 'carré'), '1400 px de large');
verifier('un format inconnu n’annonce rien', taille('inexistant', '4/5'), '');

/* Contre-contrôle : sans lui, tous les contrôles ci-dessus passeraient devant
   une fonction qui rendrait toujours la chaîne vide. */
verifier('et la fonction produit bien quelque chose',
  taille('portrait', '3/4').length > 0, true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

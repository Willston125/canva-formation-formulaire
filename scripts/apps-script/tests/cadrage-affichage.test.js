/* Le cadrage rangé à côté de l'adresse doit encore ARRIVER JUSQU'À LA PAGE.
 *
 * La feuille de style met en scène chaque emplacement pour la photo livrée avec
 * le design : la bannière est décalée et agrandie (object-position: 14% 50%,
 * scale(1.24)), et la section méthode cadre ses visuels AU RANG
 * (.method-step:nth-child(2) img). Une photo remplacée depuis le tableau de bord
 * héritait de cette mise en scène et arrivait décapitée ou de travers.
 *
 * Deux exigences se croisent ici, et l'épreuve tient les deux :
 *
 *  - une image NON remplacée ne reçoit RIEN. C'est le « null » rendu par
 *    cadrageEnStyle qui le garantit : un objet neutre, lui, écraserait la mise
 *    en scène d'origine et abîmerait des visuels que personne n'a touchés ;
 *
 *  - les bornes sont REFAITES ici. Le script Google borne déjà à l'écriture,
 *    mais la feuille se modifie à la main : le site ne doit jamais faire
 *    confiance à ce qu'il reçoit.
 *
 * Cette épreuve lit cadrageEnStyle dans site-common.js et l'exécute SANS DOM :
 * une fonction qui réclamerait un navigateur pour décider d'un cadrage ne serait
 * éprouvable nulle part. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const FICHIER = 'site-common.js';
const SOURCE = fs.readFileSync(path.join(RACINE, FICHIER), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Extrait une fonction nommée par comptage d'accolades — même procédé que
   echappement.test.js, mais PAS pour la même raison : cadrageEnStyle contient
   bel et bien des accolades dans ses chaînes, celles de ses littéraux gabarits
   (`${x}% ${y}%`, `scale(${zoom / 100})`). Le comptage reste exact parce que ces
   accolades S'ÉQUILIBRENT, non parce qu'il n'y en aurait aucune. Une accolade
   SOLITAIRE — dans une chaîne, un commentaire ou une expression régulière —
   tromperait le compte : l'extraction rendrait un corps amputé, et l'épreuve
   éprouverait autre chose que la fonction. */
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

/** Charge la fonction et la rend appelable, isolée de tout DOM. */
function charger(nom) {
  const bac = {};
  vm.createContext(bac);
  vm.runInContext(extraire(SOURCE, nom) + ';\nglobalThis.__f = ' + nom + ';', bac);
  return bac.__f;
}

let brut = null;
try { brut = charger('cadrageEnStyle'); }
catch (e) { verifier(FICHIER + ' : le calcul du cadrage se lit sans navigateur', e.message, 'lu'); }

/* Une fonction absente ou qui réclame un navigateur est un échec à part
   entière, pas un plantage du banc d'essai : chaque contrôle doit pouvoir
   s'exprimer, sans quoi on ne verrait plus rien du reste. */
const style = (cadrage) => {
  if (!brut) return 'CADRAGE_EN_STYLE INTROUVABLE';
  try { return brut(cadrage); }
  catch (e) { return 'CADRAGE INUTILISABLE HORS NAVIGATEUR : ' + e.message; }
};

/* Les trois propriétés sont relues UNE PAR UNE. verifier compare des chaînes
   JSON, donc aussi l'ORDRE des clés : une épreuve qui tomberait parce que la
   fonction les a écrites dans un autre ordre ne dirait rien du cadrage. */
const trois = (cadrage) => {
  const s = style(cadrage);
  if (!s || typeof s !== 'object') return s;
  return { objectPosition: s.objectPosition, transform: s.transform, transformOrigin: s.transformOrigin };
};
const propriete = (cadrage, nom) => {
  const s = style(cadrage);
  return s && typeof s === 'object' ? s[nom] : s;
};

// --- 1. Un cadrage complet donne les trois propriétés ---
verifier('un cadrage complet donne les trois propriétés',
  trois({ x: 40, y: 22, zoom: 135 }),
  { objectPosition: '40% 22%', transform: 'scale(1.35)', transformOrigin: 'center' });

// --- 2. Un zoom de 100 ne pose AUCUNE transformation ---
/* « scale(1) » n'est pas neutre : une transformation, même sans effet, crée un
   contexte d'empilement et fait repasser l'image par la composition, ce qui peut
   en adoucir le rendu. Une photo remplacée sans agrandissement doit s'afficher
   exactement comme n'importe quelle image. */
verifier('un zoom de 100 ne pose aucune transformation',
  propriete({ x: 50, y: 50, zoom: 100 }, 'transform'), 'none');
/* Contre-contrôle : sans lui, une fonction qui rendrait « none » pour TOUT zoom
   passerait ici sans être vue. */
verifier('alors qu’un zoom supérieur en pose bien une',
  propriete({ x: 50, y: 50, zoom: 140 }, 'transform'), 'scale(1.4)');

// --- 3. Rien à appliquer ne rend RIEN ---
/* C'est ce null qui garantit qu'une image non remplacée garde exactement son
   apparence : l'appelant n'a alors aucun style à poser. */
verifier('rien à appliquer ne rend rien', style(null), null);
verifier('un objet vide non plus', style({}), null);
verifier('ni une valeur qui n’est pas un cadrage', style('texte'), null);

// --- 4. Les bornes tiennent côté navigateur aussi ---
/* La feuille Google se modifie à la main, et le catalogue est servi tel quel :
   un zoom de 5000 ne laisserait qu'un détail méconnaissable, une position
   négative sortirait la photo de son cadre. */
verifier('un zoom démesuré est ramené à 250',
  propriete({ x: 50, y: 50, zoom: 5000 }, 'transform'), 'scale(2.5)');
verifier('un zoom sous la borne revient à 100, donc à aucune transformation',
  propriete({ x: 50, y: 50, zoom: 20 }, 'transform'), 'none');
verifier('une position négative est ramenée à 0',
  propriete({ x: -30, y: 50, zoom: 100 }, 'objectPosition'), '0% 50%');
verifier('une position au-delà de 100 y est ramenée',
  propriete({ x: 130, y: 900, zoom: 100 }, 'objectPosition'), '100% 100%');

// --- 5. Contre-contrôle : un cadrage ordinaire est bel et bien accepté ---
/* Sans lui, tous les contrôles de rejet ci-dessus passeraient aussi devant une
   fonction qui rendrait null quoi qu'on lui donne — et plus aucune photo
   remplacée ne serait cadrée. */
verifier('un cadrage ordinaire et valable est accepté',
  trois({ x: 60, y: 35, zoom: 120 }),
  { objectPosition: '60% 35%', transform: 'scale(1.2)', transformOrigin: 'center' });

// --- 6. Un cadrage PARTIEL est rejeté en entier ---
/* Retenir ce qui se lit et abandonner le reste déplacerait la photo sur un axe
   et pas sur l'autre, sans qu'aucun écran ne dise pourquoi. Le script Google
   rejette déjà en entier : le site doit trancher pareil. */
verifier('un cadrage partiel est rejeté en entier', style({ x: 50 }), null);
verifier('alors que les trois mesures réunies sont retenues',
  propriete({ x: 50, y: 50, zoom: 100 }, 'objectPosition'), '50% 50%');

/* Un cadrage écrit en toutes lettres arrive d'une cellule saisie à la main :
   il ne se lit pas, et ne doit surtout pas devenir un cadrage de travers. */
verifier('un cadrage écrit en toutes lettres est écarté',
  style({ x: 'gauche', y: 'haut', zoom: 'beaucoup' }), null);
/* Une case VIDÉE à la main est le piège discret : Number('') vaut zéro, et le
   cadrage absent passerait pour une photo collée en haut à gauche, agrandie. */
verifier('une case vidée à la main est écartée, non prise pour un zéro',
  style({ x: '', y: '', zoom: '' }), null);
/* Les propriétés sont écrites en pourcentages entiers : une mesure à virgule
   doit être arrondie, pas recopiée avec ses décimales. */
verifier('une mesure à virgule est arrondie',
  propriete({ x: 40.6, y: 22.4, zoom: 100 }, 'objectPosition'), '41% 22%');

// --- 7. Ce que l'appelant en fait, lu dans la source ---
let corps = '';
try { corps = extraire(SOURCE, 'appliquerImages'); }
catch (e) { verifier(FICHIER + ' : la pose des visuels se relit dans la source', e.message, 'lue'); }

/* Une fonction pure que personne n'appellerait laisserait tous les contrôles
   ci-dessus au vert pendant que le site continuerait d'ignorer les cadrages. */
verifier('appliquerImages regarde le cadrage reçu au lieu de l’ignorer',
  corps.indexOf('cadrages') !== -1 && corps.indexOf('cadrageEnStyle') !== -1, true);

/* On vise l'AFFECTATION, et les trois propriétés. Chercher « .style.transform »
   serait déjà satisfait par la CONDITION qui compare l'existant au voulu : une
   version qui lirait les propriétés sans jamais les écrire — ou qui poserait une
   classe à la place — passerait au vert sans rien cadrer.
   Le style est posé en ligne, non par une classe : la valeur est propre à chaque
   image, et la feuille de style cadre certains visuels au rang
   (.method-step:nth-child(2) img), sélecteur qui l'emporterait sur une classe. */
verifier('et l’écrit vraiment : position en ligne, cadrage en variables',
  corps.indexOf('el.style.objectPosition = positionVoulue') !== -1
  && corps.indexOf("poser('--cadrage', cadrageVoulu)") !== -1
  && corps.indexOf("poser('--cadrage-origine', origineVoulue)") !== -1, true);

/* LE CADRAGE NE DOIT PLUS PASSER PAR `transform` EN LIGNE.
 *
 * Une déclaration en ligne l'emporte sur toute la feuille de style, donc aussi
 * sur `.method-step:hover img { transform: … }`. La carte dont on venait de
 * remplacer la photo perdait son agrandissement au survol quand ses voisines
 * le gardaient — et le cas le plus fréquent était le pire : un cadrage neutre
 * posait `transform: none`, qui ne change rien à l'œil et tuait l'animation
 * pour rien. */
verifier('et ne pose plus aucun transform en ligne',
  /el\.style\.transform\s*=/.test(corps), false);

/* RETIRER un cadrage doit le retirer pour de bon : refreshPlaces applique deux
   fois dans la même page, le cache d'abord, le réseau ensuite. Sans branche
   d'effacement, un cadrage présent au cache et absent du réseau resterait collé
   jusqu'au rechargement — et le bouton « Réinitialiser » ne réinitialiserait
   rien. */
verifier('et efface le réglage quand le cadrage a disparu',
  corps.indexOf('el.style.removeProperty(nom)') !== -1
  && /const cadrageVoulu = style[\s\S]{0,120}: '';/.test(corps), true);

/* La valeur de repli n'est JAMAIS `none` : la feuille de style la compose avec
   l'animation — « var(--cadrage, …) scale(1.02) » — et « none scale(1.02) »
   n'est pas du CSS valide ; la déclaration entière serait rejetée et la photo
   s'afficherait sans son cadrage. */
verifier('un cadrage neutre vaut l’identité, jamais « none »',
  corps.indexOf("style.transform === 'none' ? 'scale(1)'") !== -1, true);

/* Un script Google resté dans sa version précédente ne renvoie AUCUN cadrage.
   Sans cette garde, la première lecture de `cadrages[...]` lèverait un TypeError
   et plus aucun visuel remplacé ne s'afficherait — une panne complète pour une
   fonctionnalité qui n'était même pas demandée. */
verifier('et se passe d’un catalogue qui ne porte aucun cadrage',
  corps.indexOf("typeof cadrages === 'object'") !== -1, true);

/* L'ORDRE dans la boucle : le retour anticipé sort quand l'adresse n'a pas
   changé. Un cadrage posé après lui ne serait jamais appliqué à une image dont
   seul le réglage a bougé — le cas exact de l'écran de réglage à venir. */
const posCadrage = corps.indexOf('cadrageEnStyle');
const posRetour = corps.indexOf('getAttribute(\'src\') === adresse');
verifier('et le pose AVANT le retour anticipé sur adresse inchangée',
  posCadrage !== -1 && posRetour !== -1 && posCadrage < posRetour, true);

/* Le REPLI : chaque fiche porte sa propre clé de photo de formateur, mais
   retombe sur la photo commune tant qu'on ne lui en a pas donné une. Sans cette
   lecture, poser une photo valable partout obligerait à la renvoyer six fois —
   et les six fiches garderaient celle livrée avec le design. */
verifier('appliquerImages lit le repli déclaré par l’emplacement',
  corps.indexOf('dataset.imageRepli') !== -1, true);

/* Et le cadrage doit suivre la photo : une fiche qui reprend la photo commune
   reprend le cadrage réglé pour elle, sinon la même image s'afficherait cadrée
   ici et pas là. */
verifier('et le cadrage suit la photo effectivement retenue',
  corps.indexOf('cadrageEnStyle(cadrages[cadreCle])') !== -1, true);

/* Contre-contrôle : une clé propre l'emporte toujours sur le repli. Sans cette
   priorité, surcharger une fiche seule deviendrait impossible. */
verifier('mais une photo propre l’emporte sur le repli',
  /propre[\s\S]{0,120}\?[\s\S]{0,40}propre[\s\S]{0,80}repli/.test(corps), true);

// --- 8. La feuille de style COMPOSE le cadrage au lieu de l'écraser --------

/* Le cadrage arrive par la variable `--cadrage`. Toute règle qui transforme
 * une image pilotée doit donc la reprendre, sinon elle l'écrase — c'est
 * exactement ce qui est arrivé : la carte de la section méthode dont on venait
 * de remplacer la photo perdait son agrandissement au survol. */
const feuille = fs.readFileSync(path.join(RACINE, 'style.css'), 'utf8');

verifier('la règle de base existe et reprend la variable',
  /\[data-image\]\s*\{[^}]*transform:\s*var\(--cadrage/.test(feuille), true);

/* La valeur de repli n'est JAMAIS `none` : elle est composée avec l'animation
   — « var(--cadrage, …) scale(1.02) » — et « none scale(1.02) » n'est pas du
   CSS valide. La déclaration entière serait rejetée, et la photo s'afficherait
   sans cadrage du tout. */
verifier('aucun repli « none », qui rendrait la composition invalide',
  feuille.indexOf('var(--cadrage, none)'), -1);

/* Chaque règle qui transforme une IMAGE doit reprendre la variable, sauf dans
 * les contextes dont on a vérifié qu'ils ne portent aucune image pilotée.
 * La liste est une liste d'EXCEPTIONS, pas d'inclusions : une règle ajoutée
 * demain sur une image pilotée tombera ici d'elle-même. */
const SANS_VISUEL_PILOTE = ['.course-card', '.training-dialog'];
const reglesImage = [...feuille.matchAll(/([^{}]*\bimg[^{}]*)\{([^}]*transform\s*:[^};]*;[^}]*)\}/g)]
  .map(m => ({ selecteur: m[1].trim().replace(/\s+/g, ' '), corps: m[2] }))
  .filter(r => !/^\/\*/.test(r.selecteur))
  .filter(r => !SANS_VISUEL_PILOTE.some(c => r.selecteur.indexOf(c) >= 0));

/* Contre-contrôle : si plus aucune règle n'était trouvée, le contrôle suivant
   passerait précisément quand il devrait crier. */
verifier('des règles transformant une image sont bien trouvées',
  reglesImage.length >= 2, true);

verifier('et toutes reprennent le cadrage au lieu de l’écraser',
  reglesImage.filter(r => r.corps.indexOf('var(--cadrage') < 0).map(r => r.selecteur), []);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

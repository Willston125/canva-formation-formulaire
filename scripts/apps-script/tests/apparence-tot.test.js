/* Vérifie le bloc « apparence au plus tôt » placé dans l'en-tête des pages.

   Le défaut qu'il corrige : le fichier HTML porte une photo — celle du dernier
   déploiement — que le navigateur peint tout de suite, puis site-common.js la
   remplace par celle de la feuille Google une fois l'API interrogée. On voyait
   donc l'ancienne bannière pendant tout l'aller-retour. Mesuré sur le site
   publié : la photo locale peinte à 384 ms, la vraie demandée à 579 ms
   seulement — et bien plus longtemps encore quand le cache avait expiré, la
   page attendant alors la réponse d'Apps Script.

   Ce contrôle n'examine pas des motifs dans le texte du bloc : il l'EXÉCUTE
   contre un faux document et regarde ce qu'il pose réellement. Une expression
   régulière dirait que le code « ressemble » à ce qu'on attend ; seule
   l'exécution dit qu'il le fait. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = p => fs.readFileSync(path.join(RACINE, p), 'utf8');
const existe = p => fs.existsSync(path.join(RACINE, p));

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. Le bloc est présent, au bon endroit, et partout le même -------------

/* Les pages qui portent des visuels pilotés depuis le tableau de bord. Les
   autres n'en ont pas besoin : sans [data-image], le bloc n'aurait rien à
   poser. */
const PAGES = ['index.html', 'formations/_template/fiche.html',
  'formations/canva-pro/index.html', 'inscription/index.html'];

const MARQUE = /[ \t]*<!-- apparence-tot:debut -->([\s\S]*?)<!-- apparence-tot:fin -->/;

const copies = {};
for (const page of PAGES) {
  if (!existe(page)) continue;
  const m = MARQUE.exec(lire(page));
  copies[page] = m ? m[1] : null;
}

verifier('chaque page porte le bloc',
  Object.keys(copies).filter(p => copies[p] === null), []);

/* Le bloc est recopié à l'identique dans plusieurs fichiers : deux copies qui
   divergeraient produiraient deux comportements selon la page, et la panne ne
   se verrait que sur celle qu'on n'a pas ouverte. */
const distinctes = [...new Set(Object.values(copies).filter(Boolean))];
verifier('toutes les copies sont identiques', distinctes.length, 1);

/* Dans l'EN-TÊTE, et non dans le corps : plus bas que la première image, il
   s'exécuterait après son affichage — donc trop tard, ce qui est tout le
   problème qu'il résout. */
const malPlacees = PAGES.filter(p => {
  if (!existe(p) || !copies[p]) return false;
  const contenu = lire(p);
  return contenu.indexOf('apparence-tot:debut') > contenu.indexOf('</head>');
});
verifier('le bloc est bien dans l’en-tête', malPlacees, []);

/* Et AVANT la première feuille de style. Un script n'est pas exécuté tant
   qu'une feuille reste à charger : placé après elles, le bloc ne tournait
   qu'à 569 ms sur le site publié — mesuré — c'est-à-dire pas plus tôt que le
   script qu'il devait devancer. Il ne servait alors à rien. */
const apresLesStyles = PAGES.filter(p => {
  if (!existe(p) || !copies[p]) return false;
  const contenu = lire(p);
  const style = contenu.search(/<link[^>]+rel="stylesheet"/);
  return style >= 0 && contenu.indexOf('apparence-tot:debut') > style;
});
verifier('et avant la première feuille de style', apresLesStyles, []);

/* Contre-contrôle : sans lui, le contrôle ci-dessus passerait si plus aucune
   feuille de style n'était trouvée — précisément quand il devrait crier. */
verifier('des feuilles de style sont bien trouvées',
  PAGES.filter(p => existe(p) && /<link[^>]+rel="stylesheet"/.test(lire(p))).length, PAGES.length);

// --- 2. Les deux côtés s'accordent sur la même clé --------------------------

/* site-common.js ÉCRIT la mémoire, le bloc la LIT. S'ils ne nommaient pas la
   même clé, le bloc ne trouverait jamais rien et ne poserait jamais rien —
   en silence, sans la moindre erreur. */
const commun = lire('site-common.js');
const cleEcrite = (/const CLE_APPARENCE = '([^']+)'/.exec(commun) || [])[1];
const cleLue = (/localStorage\.getItem\('([^']+)'\)/.exec(distinctes[0] || '') || [])[1];
verifier('site-common.js nomme une clé de mémoire', !!cleEcrite, true);
verifier('et le bloc lit exactement la même', cleLue, cleEcrite);

// --- 3. La mémoire est écrite, et écrite assez tôt -------------------------

const corpsImages = (() => {
  const depart = commun.indexOf('function appliquerImages');
  let profondeur = 0, i = commun.indexOf('{', depart);
  for (let j = i; j < commun.length; j++) {
    if (commun[j] === '{') profondeur++;
    else if (commun[j] === '}' && --profondeur === 0) return commun.slice(depart, j + 1);
  }
  return '';
})();
verifier('le corps de appliquerImages est bien retrouvé', corpsImages.length > 500, true);

verifier('l’apparence obtenue est mémorisée', /memoriserApparence\(apparence\)/.test(corpsImages), true);

/* Elle doit être retenue AVANT les retours anticipés : ceux-ci sortent quand
   rien n'a changé, et une photo déjà en place ne serait alors jamais retenue —
   donc jamais rejouée, et le clignotement reviendrait au chargement suivant. */
const poseMemoire = corpsImages.indexOf('apparence[cle] =');
const premierRetourAnticipe = corpsImages.indexOf("if (el.getAttribute('src') === adresse) return;");
verifier('elle est retenue avant les retours anticipés',
  poseMemoire >= 0 && premierRetourAnticipe > poseMemoire, true);

/* Dans localStorage : sessionStorage meurt avec l'onglet, donc précisément
   entre deux visites — le cas dont se plaignait l'utilisateur. */
verifier('la mémoire survit à la fermeture de l’onglet',
  /localStorage\.setItem\(CLE_APPARENCE/.test(commun)
  && !/sessionStorage\.setItem\(CLE_APPARENCE/.test(commun), true);

// --- 4. Le bloc EXÉCUTÉ pose bien ce qu'on attend --------------------------

const code = (distinctes[0] || '').replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');

const MEMOIRE = {
  images: {
    'accueil.hero': {
      src: 'https://exemple.test/nouvelle-banniere.jpg',
      objectPosition: '40% 60%', transform: 'scale(1.3)', transformOrigin: '40% 60%'
    },
    'accueil.formateur.photo': { src: 'https://exemple.test/formateur.jpg', objectPosition: '', transform: '', transformOrigin: '' }
  }
};

function faireImage(attrs) {
  const a = Object.assign({}, attrs);
  return {
    nodeType: 1, style: {}, attrs: a,
    getAttribute: n => (n in a ? a[n] : null),
    setAttribute: (n, v) => { a[n] = v; },
    removeAttribute: n => { delete a[n]; },
    hasAttribute: n => n in a,
    querySelectorAll: () => []
  };
}

function jouer(memoireBrute, images) {
  const liens = [];
  const ecouteurs = {};
  let deconnecte = false;
  const faux = {
    localStorage: { getItem: () => memoireBrute },
    document: {
      head: { appendChild: l => liens.push(l) },
      documentElement: {},
      createElement: () => ({}),
      addEventListener: (nom, fn) => { ecouteurs[nom] = fn; },
      querySelectorAll: sel => (sel === '[data-image]' ? images : [])
    },
    MutationObserver: function () {
      this.observe = () => { };
      this.disconnect = () => { deconnecte = true; };
    }
  };
  new Function('localStorage', 'document', 'MutationObserver', code)(
    faux.localStorage, faux.document, faux.MutationObserver);
  if (ecouteurs.DOMContentLoaded) ecouteurs.DOMContentLoaded();
  return { liens, deconnecte, declencheur: !!ecouteurs.DOMContentLoaded };
}

const hero = faireImage({
  'data-image': 'accueil.hero',
  src: 'assets/images/ancienne-banniere.jpg',
  width: '851', height: '315'
});
const inconnue = faireImage({ 'data-image': 'accueil.methode.2', src: 'assets/illustrations/montage.svg' });
const joue = jouer(JSON.stringify(MEMOIRE), [hero, inconnue]);

verifier('la photo retenue remplace celle du fichier',
  hero.attrs.src, 'https://exemple.test/nouvelle-banniere.jpg');

/* Les dimensions d'origine décrivaient l'ancienne image : les garder
   réserverait une place au mauvais rapport, et la nouvelle photo s'afficherait
   déformée le temps de son chargement. */
verifier('les dimensions de l’ancienne image sont retirées',
  [hero.attrs.width, hero.attrs.height], [undefined, undefined]);

verifier('le cadrage retenu est posé avec elle',
  [hero.style.objectPosition, hero.style.transform], ['40% 60%', 'scale(1.3)']);

/* Un emplacement absent de la mémoire ne doit pas être touché : sinon la
   première visite, où la mémoire est vide, effacerait les visuels livrés
   avec le site. */
verifier('un visuel inconnu de la mémoire est laissé intact',
  inconnue.attrs.src, 'assets/illustrations/montage.svg');

/* Le préchargement lance le téléchargement sans attendre l'analyse de la
   balise <img> : c'est lui qui supprime l'attente, le remplacement de src ne
   fait qu'éviter d'afficher l'ancienne. */
verifier('chaque photo retenue est préchargée', joue.liens.length, 2);
verifier('et le préchargement demande bien une image',
  joue.liens.every(l => l.rel === 'preload' && l.as === 'image'), true);
verifier('vers l’adresse retenue',
  joue.liens.map(l => l.href).sort(),
  ['https://exemple.test/formateur.jpg', 'https://exemple.test/nouvelle-banniere.jpg']);

/* L'observation s'arrête à la fin de l'analyse : la laisser courir ferait
   travailler le navigateur à chaque ajout dans la page, pour rien. */
verifier('l’observation est bien arrêtée ensuite', joue.deconnecte, true);

// --- 5. Sans mémoire, le bloc ne fait rien et ne casse rien ----------------

/* Première visite, stockage refusé, navigation privée : le bloc doit se taire.
   S'il levait une erreur, elle interromprait l'en-tête de la page. */
for (const cas of [['mémoire absente', null], ['mémoire illisible', '{ceci n’est pas du JSON'],
['mémoire vide', '{}'], ['mémoire sans images', '{"images":null}']]) {
  const img = faireImage({ 'data-image': 'accueil.hero', src: 'assets/images/origine.jpg' });
  let erreur = null;
  try { jouer(cas[1], [img]); } catch (e) { erreur = e.message; }
  verifier('sans mémoire le bloc se tait (' + cas[0] + ')',
    [erreur, img.attrs.src], [null, 'assets/images/origine.jpg']);
}

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

/* « Retirer » une photo doit rendre celle d'origine, pas laisser un trou.
 *
 * LE DÉFAUT. Le bouton « Retirer » du tableau de bord vide le champ, supprime
 * la ligne de la feuille ET met le fichier Drive à la corbeille. Côté site,
 * `appliquerImages` sortait sans rien faire dès qu'une clé n'avait plus de
 * valeur : elle ne remettait pas l'adresse d'origine, et surtout
 * `memoriserApparence` ne faisait que FUSIONNER — la clé périmée survivait à
 * tous les chargements. Le bloc d'en-tête reposait donc indéfiniment une
 * adresse morte, et le visiteur déjà venu voyait « Visuel indisponible » là où
 * le site devait revenir à sa photo d'origine.
 *
 * L'ADRESSE D'ORIGINE. Personne ne la connaissait au moment de la rendre : le
 * bloc d'en-tête l'a déjà recouverte quand site-common.js s'exécute. Elle est
 * donc retenue dans `data-image-origine`, par le premier des deux qui touche à
 * l'image.
 *
 * LE BLOC EN DOUBLE. L'en-tête des pages portait DEUX copies du bloc
 * d'apparence, dont une ancienne : elle préchargeait toutes les photos, y
 * compris celles que la page diffère — 222 Ko au lieu de 50 — et reposait le
 * cadrage en « transform » en ligne, ce qui retire aux cartes leur
 * agrandissement au survol. L'épreuve voisine ne regardait que la PREMIÈRE
 * copie de chaque page : le doublon lui était invisible. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const SOURCE = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');

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

// ------------------- 1. UNE SEULE COPIE DU BLOC PAR PAGE -------------------

const PAGES = ['index.html', 'formations/_template/fiche.html',
  'formations/canva-pro/index.html', 'inscription/index.html'];

PAGES.forEach(page => {
  const contenu = fs.readFileSync(path.join(RACINE, page), 'utf8');
  const debuts = (contenu.match(/<!-- apparence-tot:debut -->/g) || []).length;
  const fins = (contenu.match(/<!-- apparence-tot:fin -->/g) || []).length;
  verifier(page + ' : une seule ouverture du bloc', debuts, 1);
  verifier(page + ' : une seule fermeture', fins, 1);
});

/* Le bloc restant doit être le BON : celui qui ne précharge que ce qui
   s'affiche d'emblée, et qui pose le cadrage en variables. L'ancien faisait
   l'inverse des deux. */
const accueil = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const bloc = (accueil.match(/<!-- apparence-tot:debut -->([\s\S]*?)<!-- apparence-tot:fin -->/) || [])[1] || '';
verifier('le bloc conservé ne précharge pas les visuels différés',
  /differee/.test(bloc), true);
verifier('et il ne pose pas le cadrage en « transform » en ligne',
  /style\.transform\s*=/.test(bloc), false);

/* Et il retient l'adresse d'origine avant de la recouvrir : c'est la seule
   occasion de la connaître. */
verifier('le bloc retient l’adresse d’origine avant de la recouvrir',
  /data-image-origine/.test(bloc), true);

// ------------------- 2. ON EXÉCUTE L'APPLICATION DES VISUELS -------------------

function faireStockage() {
  const boite = {};
  return {
    getItem: c => (c in boite ? boite[c] : null),
    setItem: (c, v) => { boite[c] = String(v); },
    removeItem: c => { delete boite[c]; },
    boite
  };
}

function faireImage(cle, src, options) {
  options = options || {};
  const attrs = { src: src, 'data-image': cle };
  const style = {
    _v: {},
    objectPosition: '',
    getPropertyValue(n) { return this._v[n] || ''; },
    setProperty(n, v) { this._v[n] = v; },
    removeProperty(n) { delete this._v[n]; }
  };
  const dataset = { image: cle };
  if (options.repli) dataset.imageRepli = options.repli;
  return {
    dataset, style, attrs,
    loading: options.loading || '',
    getAttribute: n => (n in attrs ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: n => { delete attrs[n]; },
    hasAttribute: n => (n in attrs)
  };
}

const stockage = faireStockage();
const bac = {
  CLE_APPARENCE: 'impactali_apparence',
  localStorage: stockage,
  // Le vrai calcul d'adresse dépend du navigateur : ici il ne nous apprend rien.
  normaliserImage: v => v,
  largeurUtile: () => 800,
  document: { querySelectorAll: () => [] }
};
vm.createContext(bac);
vm.runInContext([
  corpsDe(SOURCE, 'function cadrageEnStyle('),
  corpsDe(SOURCE, 'function memoriserApparence('),
  corpsDe(SOURCE, 'function appliquerImages('),
  'globalThis.__appliquer = appliquerImages;'
].join('\n'), bac);
const appliquer = bac.__appliquer;

const memoire = () => JSON.parse(stockage.getItem('impactali_apparence') || '{}').images || {};

// Une photo posée depuis le tableau de bord.
const banniere = faireImage('accueil.hero', 'assets/images/origine.jpg');
bac.document = { querySelectorAll: () => [banniere] };
appliquer({ 'accueil.hero': 'https://drive/remplacee.jpg' }, { 'accueil.hero': { x: 30, y: 20, zoom: 130 } });

verifier('la photo du tableau de bord est posée',
  banniere.getAttribute('src'), 'https://drive/remplacee.jpg');
verifier('l’adresse d’origine est retenue',
  banniere.getAttribute('data-image-origine'), 'assets/images/origine.jpg');
verifier('le cadrage est posé', banniere.style.getPropertyValue('--cadrage'), 'scale(1.3)');
verifier('et la mémoire d’apparence la connaît',
  Object.keys(memoire()), ['accueil.hero']);

/* On mémorise une clé d'une AUTRE page : la mémoire est globale au site, et
   l'accueil prépare les fiches qu'on n'a pas encore ouvertes. */
stockage.setItem('impactali_apparence', JSON.stringify({ images: Object.assign({},
  memoire(), { 'fiche.formateur.photo': { src: 'https://drive/formateur.jpg' } }) }));

// LE CAS DU DÉFAUT : la photo est retirée du tableau de bord.
appliquer({}, {});

verifier('la photo d’origine revient',
  banniere.getAttribute('src'), 'assets/images/origine.jpg');
verifier('le cadrage est retiré', banniere.style.getPropertyValue('--cadrage'), '');
verifier('et la position aussi', banniere.style.objectPosition, '');
verifier('la clé retirée sort de la mémoire',
  Object.prototype.hasOwnProperty.call(memoire(), 'accueil.hero'), false);
verifier('celle d’une autre page y reste',
  Object.prototype.hasOwnProperty.call(memoire(), 'fiche.formateur.photo'), true);

/* Le repli doit continuer de jouer : une fiche sans photo propre reprend la
   photo commune, elle n'est pas « retirée ». */
const formateur = faireImage('fiche.canva-pro.formateur.photo', 'assets/images/formateur.jpg',
  { repli: 'fiche.formateur.photo' });
bac.document = { querySelectorAll: () => [formateur] };
appliquer({ 'fiche.formateur.photo': 'https://drive/commune.jpg' }, {});
verifier('la photo commune sert de repli',
  formateur.getAttribute('src'), 'https://drive/commune.jpg');

/* L'API muette ne doit RIEN effacer : un appel sans images n'est pas un
   retrait, c'est une absence de réponse. */
const avant = JSON.stringify(memoire());
appliquer(null, null);
verifier('une réponse vide n’efface aucune mémoire', JSON.stringify(memoire()), avant);

/* Une image jamais remplacée ne reçoit rien : ni adresse, ni cadrage. C'est ce
   qui protège la mise en scène d'origine des visuels que personne n'a touchés. */
const intacte = faireImage('accueil.methode.1', 'assets/illustrations/montage.svg');
bac.document = { querySelectorAll: () => [intacte] };
appliquer({ 'autre.cle': 'https://drive/x.jpg' }, {});
verifier('une image jamais remplacée garde son adresse',
  intacte.getAttribute('src'), 'assets/illustrations/montage.svg');
verifier('et ne reçoit aucun cadrage',
  intacte.style.getPropertyValue('--cadrage'), '');

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

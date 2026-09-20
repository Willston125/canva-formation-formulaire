/* Le pied de page est le même partout : ses domaines doivent s'y remplir partout.
 *
 * LE DÉFAUT. La colonne « Domaines » du pied existe dans les dix pages du site,
 * mais seule `landing.js` la remplissait — et landing.js n'est chargé que sur
 * l'accueil. Les neuf autres pages affichaient donc un intitulé « DOMAINES » au
 * -dessus du vide : les deux pages secondaires, la page d'inscription et les
 * cinq fiches.
 *
 * LE LIEN NE POUVAIT PAS MARCHER AILLEURS non plus. Il pointait sur
 * « #catalogue », un fragment qui n'existe que sur l'accueil, et son clic
 * cherchait un filtre présent nulle part ailleurs. Depuis une fiche, cliquer
 * n'aurait rien fait du tout.
 *
 * LE MONTAGE ACTUEL. site-common.js, chargé par toutes les pages, écrit les
 * liens vers « /?domaine=<nom>#catalogue ». Sur l'accueil, landing.js
 * intercepte le clic et filtre sur place, sans recharger ; ailleurs, le lien
 * mène à l'accueil, où le paramètre applique le filtre à l'arrivée. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
const landing = fs.readFileSync(path.join(RACINE, 'landing.js'), 'utf8');

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

// --- 1. Toutes les pages qui portent la colonne sont servies par le tronc commun ---

/* Le contrôle qui compte : la colonne existe dans ces pages-là, et c'est
   site-common.js — chargé par toutes — qui doit la remplir. */
const PAGES = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html',
  'inscription/index.html', '404.html'];
for (const d of fs.readdirSync(path.join(RACINE, 'formations'))) {
  const p = path.join('formations', d, 'index.html');
  if (fs.existsSync(path.join(RACINE, p))) PAGES.push(p);
}

const portent = PAGES.filter(p =>
  fs.readFileSync(path.join(RACINE, p), 'utf8').indexOf('id="pied-domaines-liens"') >= 0);
const chargent = portent.filter(p =>
  fs.readFileSync(path.join(RACINE, p), 'utf8').indexOf('site-common.js') >= 0);

verifier('plusieurs pages portent la colonne', portent.length >= 8, true);
verifier('et toutes chargent le tronc commun', chargent.length, portent.length);

/* La page d'erreur, elle, n'a pas la colonne : rien ne la remplirait
   davantage, et un intitulé au-dessus du vide est ce qu'on corrige ici. */
verifier('la page d’erreur ne porte pas de colonne vide',
  fs.readFileSync(path.join(RACINE, '404.html'), 'utf8').indexOf('pied-domaines') >= 0, false);

// --- 2. landing.js ne remplit plus le pied lui-même ----------------------

const rendu = corpsDe(landing, 'function renderDomains(');
verifier('landing.js n’écrit plus les liens du pied',
  /pied\.innerHTML/.test(rendu), false);
verifier('mais il rend toujours la grille des domaines',
  /grille\.innerHTML/.test(rendu), true);

/* Sur l'accueil, le clic doit filtrer SANS recharger la page : le lien porte
   maintenant une vraie adresse, donc il faut l'empêcher de naviguer. */
verifier('l’accueil intercepte le clic au lieu de naviguer',
  /preventDefault\(\)/.test(landing) && /data-domain-link/.test(landing), true);

/* Et le paramètre doit être lu à l'arrivée, sinon le lien venu d'une fiche
   déposerait le visiteur sur le catalogue sans aucun filtre. */
verifier('le paramètre « domaine » est lu à l’arrivée',
  /get\('domaine'\)/.test(landing), true);

// --- 3. On exécute le rendu, plutôt que de lire le texte ----------------

function fauxPied() {
  const colonne = { style: {} };
  const pied = {
    innerHTML: '',
    closest: sel => (sel === '.site-footer__col' ? colonne : null),
    addEventListener: () => {}
  };
  return { colonne, pied, document: { getElementById: id => (id === 'pied-domaines-liens' ? pied : null) } };
}

const bac = { FORMATIONS: [], document: null };
vm.createContext(bac);
vm.runInContext([
  corpsDe(commun, 'function escapeHtml(text)'),
  corpsDe(commun, 'function renderDomainesPied('),
  'globalThis.__pied = renderDomainesPied;'
].join('\n'), bac);

let faux = fauxPied();
bac.document = faux.document;
bac.FORMATIONS = [
  { family: 'Design & Contenu', active: true },
  { family: 'Marketing', active: true },
  { family: 'Design & Contenu', active: true },
  { family: 'Photo & Vidéo', active: false },
  { family: '', active: true }
];
bac.__pied();

verifier('chaque domaine paraît une seule fois',
  (faux.pied.innerHTML.match(/<a /g) || []).length, 2);
verifier('le lien mène à l’accueil, avec le domaine en paramètre',
  faux.pied.innerHTML.indexOf('href="/?domaine=Design%20%26%20Contenu#catalogue"') >= 0, true);
verifier('le nom affiché est échappé',
  faux.pied.innerHTML.indexOf('>Design &amp; Contenu<') >= 0, true);
verifier('une formation masquée n’apporte pas son domaine',
  faux.pied.innerHTML.indexOf('Photo') >= 0, false);
verifier('la colonne reste visible', faux.colonne.style.display, '');

/* SANS AUCUN DOMAINE, la colonne se masque : c'est exactement le défaut qu'on
   corrige, un intitulé posé au-dessus du vide. */
faux = fauxPied();
bac.document = faux.document;
bac.FORMATIONS = [];
bac.__pied();
verifier('sans domaine, la colonne est masquée', faux.colonne.style.display, 'none');
verifier('et rien n’est écrit', faux.pied.innerHTML, '');

/* Une page sans colonne ne doit pas faire tomber le tronc commun. */
bac.document = { getElementById: () => null };
let erreur = null;
try { bac.__pied(); } catch (e) { erreur = e.message; }
verifier('une page sans colonne ne provoque aucune erreur', erreur, null);

// --- 4. Le domaine choisi survit aux reconstructions de la grille --------

/* Sans cela, le lien n'aurait servi à rien : la grille est refaite à l'arrivée
   du catalogue, du relevé des places et à chaque changement de pays. Le filtre
   retombait sur « Toutes » une seconde après le clic. */
const grille = corpsDe(landing, 'function renderCatalogueGrid(');
verifier('le filtre est réappliqué après chaque reconstruction',
  /appliquerFiltre\(domaineChoisi\)/.test(grille), true);
verifier('et l’écoute des filtres ne se pose qu’une fois',
  /dataset\.ecoute/.test(grille), true);

function fausseGrille(familles, cartes) {
  const chips = familles.map(f => ({
    dataset: { family: f }, attrs: {},
    setAttribute(n, v) { this.attrs[n] = v; },
    get textContent() { return f; }
  }));
  const filters = {
    querySelectorAll: () => chips,
    querySelector: sel => {
      const m = /data-family="([^"]*)"/.exec(sel);
      return chips.find(c => c.dataset.family === (m ? m[1] : null)) || null;
    }
  };
  /* Chaque carte tient SA propre référence : deux cartes du même domaine
     existent, et les retrouver par leur famille ferait basculer la même deux
     fois — le faux document mentirait alors sur le vrai code. */
  const elements = cartes.map(f => {
    const carte = { dataset: { family: f }, caches: false, montree: false };
    carte.classList = {
      toggle: (n, on) => { if (n === 'is-hidden') carte.caches = on; },
      add: n => { if (n === 'is-visible') carte.montree = true; }
    };
    return carte;
  });
  const grid = { querySelectorAll: () => elements };
  const live = { textContent: '' };
  return {
    chips, elements, live,
    document: {
      getElementById: id => (id === 'catalogue-grid' ? grid
        : id === 'catalogue-filters' ? filters
          : id === 'catalogue-grid-live' ? live : null)
    }
  };
}

const bacFiltre = { document: null, CSS: { escape: s => String(s) } };
vm.createContext(bacFiltre);
vm.runInContext([
  'let domaineChoisi = \'Toutes\';',
  corpsDe(landing, 'function appliquerFiltre(famille)'),
  'globalThis.__filtre = appliquerFiltre;',
  'globalThis.__choisi = () => domaineChoisi;'
].join('\n'), bacFiltre);

const FAMILLES = ['Toutes', 'Design & Contenu', 'Marketing'];
let g = fausseGrille(FAMILLES, ['Design & Contenu', 'Marketing', 'Design & Contenu']);
bacFiltre.document = g.document;
bacFiltre.__filtre('Marketing');
verifier('seules les cartes du domaine restent',
  g.elements.filter(e => !e.caches).map(e => e.dataset.family), ['Marketing']);
verifier('le bon filtre est marqué',
  g.chips.filter(c => c.attrs['aria-pressed'] === 'true').map(c => c.dataset.family), ['Marketing']);
verifier('et l’annonce dit ce qui est affiché', g.live.textContent, '1 formation affichée dans Marketing');
verifier('le choix est retenu pour la prochaine reconstruction', bacFiltre.__choisi(), 'Marketing');

/* UN DOMAINE INCONNU ne doit pas vider la page : c'est le cas d'une adresse
   partagée avant que le domaine ne soit retiré du catalogue. */
g = fausseGrille(FAMILLES, ['Design & Contenu', 'Marketing']);
bacFiltre.document = g.document;
bacFiltre.__filtre('Domaine disparu');
verifier('un domaine inconnu montre tout plutôt que rien',
  g.elements.filter(e => !e.caches).length, 2);
verifier('et le choix retombe sur « Toutes »', bacFiltre.__choisi(), 'Toutes');

// --- 5. Le rendu est bien déclenché, au chargement et à chaque catalogue ---

verifier('le pied est rempli au chargement',
  /renderDomainesPied\(\)/.test(commun), true);
const debutEcouteur = commun.indexOf("addEventListener('impactali:catalogue'");
const ecouteur = debutEcouteur < 0 ? '' : commun.slice(debutEcouteur, commun.indexOf('\n    });', debutEcouteur));
verifier('et refait quand le catalogue arrive',
  /renderDomainesPied\(\)/.test(ecouteur), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

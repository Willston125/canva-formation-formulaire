/* Échappement HTML : le contrat doit tenir DANS UN ATTRIBUT, pas seulement
   dans du texte.
 *
 * Trois fichiers échappaient en passant par `element.textContent` puis en
 * relisant `innerHTML`. Ce détour convertit bien &, < et >, mais PAS les
 * guillemets — le navigateur n'a aucune raison de les toucher dans du texte.
 * Or ces valeurs sont posées dans des attributs : value="…", src="…",
 * data-value="…". Un guillemet refermait donc l'attribut.
 *
 * Deux conséquences, l'une d'usage courant, l'autre de sécurité :
 *
 *  - un titre ou un libellé contenant un guillemet droit cassait le formulaire
 *    de modification, et la valeur revenait tronquée ;
 *
 *  - le statut d'une inscription est repris dans <option value="…"> par le
 *    tableau de bord, et ce statut arrive par le formulaire public, que
 *    n'importe qui peut appeler sans mot de passe. On pouvait donc poser des
 *    attributs dans la page de l'administrateur depuis l'extérieur.
 *
 * Cette épreuve lit les échappeurs dans leurs fichiers et les exécute. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Extrait une fonction nommée par comptage d'accolades. Les corps visés ne
   contiennent aucune accolade à l'intérieur d'une chaîne ou d'une expression
   régulière : le comptage est donc exact ici, et l'extraction échoue bruyamment
   si ce n'était plus le cas. */
function extraire(source, nom) {
  const debut = source.search(new RegExp('(function\\s+' + nom + '\\s*\\(|(const|var|let)\\s+' + nom + '\\s*=)'));
  if (debut < 0) throw new Error('fonction ' + nom + ' introuvable');
  let i = source.indexOf('{', debut);
  const flechee = source.slice(debut, i < 0 ? source.length : i).includes('=>');
  if (flechee && (i < 0 || source.indexOf('=>', debut) < i)) {
    /* Forme fléchée sans accolades. Chercher le point-virgule de fin à la main
       demande de savoir lire le JavaScript : une entité comme '&amp;' en
       contient un, et une expression régulière comme /"/g contient un
       guillemet. Les deux pièges sont présents ici. On laisse donc l'analyseur
       de Node trancher : on ajoute des lignes jusqu'à ce que l'extrait tienne
       debout tout seul. */
    const lignes = source.slice(debut).split('\n');
    let extrait = '';
    for (let n = 0; n < Math.min(lignes.length, 12); n++) {
      extrait += (n ? '\n' : '') + lignes[n];
      /* Parser ne suffit pas : la première ligne seule tient debout — l'insertion
         automatique du point-virgule en fait une instruction complète — alors
         que les .replace suivants manquent encore. On exige donc aussi la fin
         d'instruction explicite, sans quoi on éprouverait un échappeur amputé. */
      if (!extrait.trimEnd().endsWith(';')) continue;
      try { new vm.Script(extrait); return extrait; } catch (e) { /* incomplet : on continue */ }
    }
    throw new Error('fin d’instruction introuvable pour ' + nom);
  }
  let profondeur = 0;
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}') { profondeur--; if (!profondeur) return source.slice(debut, j + 1); }
  }
  throw new Error('accolade de fin introuvable pour ' + nom);
}

/** Charge un échappeur et le rend appelable, isolé de tout DOM. */
function charger(fichier, nom) {
  const source = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
  const bac = {};
  vm.createContext(bac);
  vm.runInContext(extraire(source, nom) + ';\nglobalThis.__f = ' + nom + ';', bac);
  return { fn: bac.__f, source };
}

const ECHAPPEURS = [
  ['admin/admin.js', 'echapper'],
  ['site-common.js', 'escapeHtml'],
  ['script.js', 'escapeHtml'],
  ['fiche-blocs.js', 'echapper'],
  ['scripts/build-fiches.js', 'esc']
];

/* La charge réelle : le statut d'une inscription, repris dans un attribut.
   Sans échappement du guillemet, elle ouvre un gestionnaire d'événement. */
const CHARGE = 'x" onmouseover="alert(1)';

ECHAPPEURS.forEach(([fichier, nom]) => {
  let brut;
  try { brut = charger(fichier, nom).fn; }
  catch (e) { verifier(fichier + ' : échappeur chargeable', String(e), 'chargé'); return; }

  /* L'échappeur doit tenir debout SANS navigateur : c'est ce qui prouve qu'il
     n'échappe pas en confiant le travail au DOM. Un appel qui réclame
     `document` est un échec à part entière, pas un plantage du banc d'essai. */
  const f = (v) => {
    try { return brut(v); }
    catch (e) { return 'ÉCHAPPEUR INUTILISABLE HORS NAVIGATEUR : ' + e.message; }
  };

  verifier(fichier + ' : le guillemet double est neutralisé', f('a"b'), 'a&quot;b');
  verifier(fichier + ' : le chevron ouvrant est neutralisé', f('<script>'), '&lt;script&gt;');
  verifier(fichier + ' : l’esperluette est traitée en premier', f('&lt;'), '&amp;lt;');
  verifier(fichier + ' : rien ne vaut la chaîne vide', f(null), '');
  verifier(fichier + ' : la charge ne laisse aucun guillemet nu',
    f(CHARGE).indexOf('"') !== -1, false);
  /* Le texte doit rester lisible : échapper ne doit pas mutiler le français. */
  verifier(fichier + ' : le texte ordinaire passe intact',
    f('Canva Pro & Création de contenu'), 'Canva Pro &amp; Création de contenu');
});

/* Garde-fou structurel : le détour par textContent puis innerHTML ne doit plus
   servir à échapper. Il est silencieusement faux dans un attribut, et rien à la
   lecture ne le signale. */
ECHAPPEURS.forEach(([fichier, nom]) => {
  const corps = extraire(fs.readFileSync(path.join(RACINE, fichier), 'utf8'), nom);
  verifier(fichier + ' : n’échappe plus via textContent/innerHTML',
    /textContent/.test(corps) && /innerHTML/.test(corps), false);
});

// ------------------- LE SCHÉMA D'UN LIEN, PAS SEULEMENT SA FORME -------------------

/* escapeHtml fait bien son travail : il empêche une valeur de REFERMER un
   attribut. Mais il ne regarde pas le SCHÉMA, et l'adresse d'une formation ou
   d'une réalisation est un champ texte libre de la feuille. Un « javascript: »
   posé là devenait un lien qui exécute du code au clic, sur toutes les pages où
   la carte paraît. Il faut donc, en plus, une liste blanche de schémas. */
const communSource = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
let lienSur = null;
try {
  const bacLien = {};
  vm.createContext(bacLien);
  vm.runInContext(extraire(communSource, 'lienSur') + '\nglobalThis.__l = lienSur;', bacLien);
  lienSur = bacLien.__l;
} catch (e) { /* absente : les contrôles ci-dessous le diront */ }

verifier('site-common.js expose un filtre de schéma', typeof lienSur, 'function');

if (typeof lienSur === 'function') {
  // Ce qui doit passer : les adresses réelles du site.
  verifier('un chemin absolu passe', lienSur('/formations/canva-pro/'), '/formations/canva-pro/');
  verifier('une ancre passe', lienSur('/#catalogue'), '/#catalogue');
  verifier('une adresse https passe',
    lienSur('https://www.impactali.site/entreprises/'), 'https://www.impactali.site/entreprises/');
  verifier('un lien WhatsApp passe', lienSur('https://wa.me/2693804648'), 'https://wa.me/2693804648');

  // Ce qui doit tomber.
  verifier('javascript: est refusé', lienSur('javascript:alert(1)'), '');
  verifier('même écrit en majuscules', lienSur('JavaScript:alert(1)'), '');
  /* Les caractères de contrôle et les espaces sont ignorés par le navigateur
     quand il lit un schéma : « java\nscript: » s'exécute. */
  verifier('même coupé par un saut de ligne', lienSur('java\nscript:alert(1)'), '');
  verifier('même précédé d’espaces', lienSur('  javascript:alert(1)'), '');
  verifier('data: est refusé', lienSur('data:text/html,<script>alert(1)</script>'), '');
  verifier('vbscript: est refusé', lienSur('vbscript:msgbox(1)'), '');
  /* Une adresse sans schéma explicite, « //ailleurs.test », emmène sur un autre
     site en héritant du protocole. Ce n'est pas une adresse de ce site. */
  verifier('le double slash est refusé', lienSur('//ailleurs.test/piege'), '');
  verifier('une valeur vide rend une chaîne vide', lienSur(''), '');
  verifier('une valeur absente aussi', lienSur(null), '');
}

/* Et il doit être RÉELLEMENT POSÉ là où la feuille fournit l'adresse. Un filtre
   écrit mais jamais appelé ne protège personne. */
const landingSource = fs.readFileSync(path.join(RACINE, 'landing.js'), 'utf8');
verifier('l’accueil filtre l’adresse d’une formation',
  /lienSur\(formation\.href\)/.test(landingSource), true);
verifier('et celle d’une réalisation',
  /lienSur\(item\.href\)/.test(landingSource), true);
verifier('plus aucune adresse de la feuille n’est posée sans filtre',
  /href="\$\{escapeHtml\((?:formation|item)\.href\)\}/.test(landingSource), false);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

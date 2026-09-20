/* Une adresse inconnue doit répondre « introuvable », pas servir l'accueil.
 *
 * LE DÉFAUT. `vercel.json` portait une réécriture fourre-tout ajoutée en mars
 * 2026, quand le site tenait dans un seul fichier : toute adresse sans
 * correspondance renvoyait `index.html`, avec un code 200. Le site a depuis de
 * vraies sous-pages, et cette règle n'a plus servi qu'à transformer chaque
 * faute de frappe en page d'accueil valide.
 *
 * CE QUE ÇA COÛTAIT. `/formations/community-management/`, retirée du
 * catalogue, répondait encore 200. Google indexe alors une adresse qui ne
 * correspond à rien, et continuera de la proposer. Le visiteur, lui, croit
 * avoir atteint la page demandée.
 *
 * LE MONTAGE ACTUEL. Plus de réécriture : Vercel sert les fichiers, puis rend
 * `404.html` avec le bon code pour tout le reste. La page d'erreur porte le
 * même en-tête et le même pied que les autres, pour qu'on sache où l'on est. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. La page existe, et elle est au bon endroit ------------------------

const CHEMIN = path.join(RACINE, '404.html');
verifier('la page d’erreur existe à la racine', fs.existsSync(CHEMIN), true);
const page = fs.existsSync(CHEMIN) ? fs.readFileSync(CHEMIN, 'utf8') : '';

/* Contre-contrôle : sans lui, tous les contrôles ci-dessous porteraient sur
   une chaîne vide et passeraient en silence. */
verifier('et elle a bien un contenu', page.length > 1500, true);

// --- 2. Aucune réécriture ne la court-circuite ----------------------------

/* LE CŒUR DE L'AFFAIRE. Tant que cette règle existe, la page d'erreur ne sera
   jamais servie : Vercel rend l'accueil avant d'y arriver. */
const CONFIG = path.join(RACINE, 'vercel.json');
const config = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG, 'utf8') : '';
verifier('aucune réécriture fourre-tout vers l’accueil',
  /"source"\s*:\s*"\/\(\.\*\)"[\s\S]{0,80}index\.html/.test(config), false);
/* Plus large : n'importe quelle réécriture attrape-tout rouvrirait la brèche,
   quelle que soit sa destination. */
verifier('ni aucune autre règle attrape-tout',
  /"rewrites"[\s\S]*"source"\s*:\s*"\/\(\.\*\)"/.test(config), false);

// --- 3. Une page d'erreur ne s'indexe pas et n'a pas d'adresse ------------

verifier('elle demande à ne pas être indexée',
  /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(page), true);

/* Elle ne DÉSIGNE pas le site : un canonical ou un og:url sur une page
   d'erreur ferait passer n'importe quelle faute de frappe pour une page à
   part entière — exactement ce qu'on vient de corriger. */
verifier('elle ne se déclare canonique nulle part',
  /rel="canonical"/.test(page), false);
verifier('et elle n’annonce aucune adresse de partage',
  /property="og:url"/.test(page), false);

// --- 4. Elle ramène quelque part -----------------------------------------

verifier('elle renvoie au catalogue', /href="\/#catalogue"/.test(page), true);
verifier('et à l’accueil', /href="\/"/.test(page), true);

// --- 5. Elle porte la marque, comme les autres pages ---------------------

/* Le tableau de bord ne relève PAS cette page — il lit l'accueil, les
   entreprises, l'inscription et les fiches. Le logo y prend donc sa valeur de
   la clé partagée, et c'est bien ce qu'on veut : une marque changée change
   partout. Deux emplacements, l'en-tête et le pied. */
verifier('le logo y est modifiable, en-tête et pied',
  (page.match(/data-image="marque\.logo"/g) || []).length, 2);

/* En revanche, AUCUN texte modifiable : le tableau de bord ne relevant pas
   cette page, un `data-texte` y serait un champ qui n'apparaît nulle part.
   On l'écrit donc en clair, et on le sait. */
verifier('aucun texte ne s’y annonce modifiable',
  (page.match(/data-texte/g) || []).length, 0);

// --- 6. Elle se charge comme les autres ----------------------------------

['/fonts.css', '/tailwind.css', '/style.css'].forEach(f => {
  verifier('elle charge ' + f, page.indexOf('href="' + f + '"') >= 0, true);
});
verifier('elle charge les données du site puis le tronc commun',
  page.indexOf('/formations-data.js') >= 0
  && page.indexOf('/formations-data.js') < page.indexOf('/site-common.js'), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

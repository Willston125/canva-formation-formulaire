/* L'ouverture du tableau de bord ne doit pas faire attendre pour rien.
 *
 * Cinq allers-retours chez Google se succédaient à chaque connexion, dont
 * TROIS pour le même catalogue — six onglets, seize kilo-octets, quatre à cinq
 * secondes chacun :
 *
 *   1. verifierApi()          → action=catalogue   (juste pour savoir si l'API existe)
 *   2. admin.login            → rend le catalogue
 *   3. admin.catalogue        → le redemande aussitôt
 *   4. admin.inscriptions
 *   5. afficherEtatDuScript() → action=version, déjà connue de l'étape 1
 *
 * L'écran restait sur « Vérification… » une vingtaine de secondes. Mesuré sur
 * l'API réelle : action=version répond en 2,4 s pour 129 octets, action=catalogue
 * en 4,4 à 5,5 s pour 16 317 octets.
 *
 * Et la case « Rester connecté » n'était ni mémorisée ni restaurée : elle
 * repartait décochée, si bien que l'enregistrement suivant redescendait la
 * phrase de passe vers un stockage effacé à la fermeture du navigateur. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Corps d'une fonction, délimité par comptage d'accolades. */
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

// --- 1. La vérification d'API ne lit plus tout le classeur ---
const corpsVerif = corpsDe(src, 'function verifierApi()');
verifier('le contrôle d’API n’interroge plus le catalogue',
  /action=catalogue/.test(corpsVerif), false);
verifier('il interroge la version, qui tient en 129 octets',
  /action=version/.test(corpsVerif), true);

/* Contre-contrôle : sans lui, les deux contrôles ci-dessus passeraient sur une
   fonction vide ou renommée. */
verifier('et la fonction fait bien une requête', /fetch\(/.test(corpsVerif), true);

// --- 2. Elle ne peut plus rester suspendue ---
/* Sans délai d'attente, une requête qui n'aboutit jamais laissait le bouton sur
   « Vérification… » indéfiniment, sans message ni moyen de réessayer. */
verifier('un délai d’attente borne le contrôle d’API',
  /setTimeout/.test(corpsVerif) && /Promise\.race/.test(corpsVerif), true);

// --- 3. Le verdict est retenu pour la session ---
verifier('le verdict est gardé pour la session du navigateur',
  /sessionStorage\.setItem\(CLE_API_VUE/.test(corpsVerif), true);
verifier('et relu avant d’interroger de nouveau',
  /sessionStorage\.getItem\(CLE_API_VUE\) === '1'/.test(corpsVerif), true);

// --- 4. Le catalogue n'est plus demandé trois fois ---
const corpsRafraichir = corpsDe(src, 'function rafraichirTout(catalogueFrais)');
verifier('rafraichirTout peut sauter la lecture du catalogue',
  /catalogueFrais \? Promise\.resolve\(\) : appeler\('admin\.catalogue'/.test(corpsRafraichir), true);
verifier('et l’ouverture le saute quand la connexion vient de le rendre',
  /rafraichirTout\(etat\.catalogueDeConnexion === true\)/.test(src), true);
/* Le drapeau doit être posé, sinon le saut n'aurait jamais lieu et le contrôle
   ci-dessus ne prouverait rien. */
verifier('le drapeau est posé à la connexion',
  /etat\.catalogueDeConnexion = true;/.test(src), true);
/* Et il ne doit PAS être testé sur etat.catalogue, qui part d'un objet vide
   mais non nul : le tester rendrait toujours vrai, même sans réponse. */
verifier('et il ne repose pas sur un objet toujours vrai',
  /rafraichirTout\(!!etat\.catalogue\)/.test(src), false);

// --- 5. L'état du script ne redemande pas ce qu'on vient de lire ---
const corpsEtat = corpsDe(src, 'function afficherEtatDuScript()');
verifier('le bandeau d’état reprend la réponse déjà obtenue',
  /etat\.etatScript \? Promise\.resolve\(etat\.etatScript\)/.test(corpsEtat), true);
verifier('et le contrôle d’API la lui laisse',
  /etat\.etatScript = d;/.test(corpsVerif), true);

// --- 6. « Rester connecté » survit à la fermeture du navigateur ---
const corpsMemo = corpsDe(src, 'function memoriserMotDePasse(phrase)');
verifier('le choix « rester connecté » est enregistré',
  /localStorage\.setItem\(CLE_RESTER/.test(corpsMemo), true);
verifier('et restauré au chargement',
  /restaurerChoixRester\(\);/.test(corpsDe(src, 'function initConnexion()')), true);

/* Les deux stockages ne doivent jamais se contredire : une phrase laissée dans
   l'ancien ressortirait après un changement de choix. */
verifier('l’ancienne place est effacée à chaque enregistrement',
  /\(durable \? sessionStorage : localStorage\)\.removeItem\(CLE_MDP\)/.test(corpsMemo), true);

/* Jamais répondu : la case est cochée. Une phrase déjà rangée dans localStorage
   vient forcément d'un « rester connecté », et la décocher la reléguerait au
   premier enregistrement venu — c'est exactement le défaut d'origine. */
const corpsRestaurer = corpsDe(src, 'function restaurerChoixRester()');
verifier('sans choix mémorisé, la case est cochée',
  /garde === null \? true : garde === '1'/.test(corpsRestaurer), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

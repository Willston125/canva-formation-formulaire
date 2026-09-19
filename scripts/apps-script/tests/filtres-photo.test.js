/* Vérifie qu'aucune règle du site ne recolore une photo.
   Les emplacements d'images portaient des filtres taillés pour la photo livrée
   avec le design : saturation baissée, contraste relevé, image assombrie. Une
   photo remplacée depuis /admin ressortait donc dans des couleurs qui ne sont
   pas les siennes, sans que personne puisse corriger cela depuis le tableau de
   bord. On ne recolore jamais une photo : ces filtres ne doivent pas revenir. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
/* Les commentaires sont retirés une fois pour toutes : un filtre cité dans une
   explication n'est pas un filtre appliqué à une photo. */
const CSS = fs.readFileSync(path.join(RACINE, 'style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/* Les emplacements où l'administrateur peut poser sa propre photo, avec le nom
   que leur donne le site : un échec doit se lire sans ouvrir style.css.

   La comparaison se fait au caractère près, sur ces six écritures seules.
   Échappent donc à l'épreuve un filtre posé sur `.method-step:hover img` — ce
   sélecteur existe déjà, c'est l'endroit naturel d'un effet au survol —, un
   filtre posé sur le conteneur `.trainer__photo` plutôt que sur son image, et
   la même règle écrite `.training-dialog>img` sans espaces. L'épreuve garde ces
   six emplacements, pas toute recoloration imaginable. */
const EMPLACEMENTS = [
  ['.landing-hero__visual img', 'photo d’ouverture de l’accueil'],
  ['.method-step img', 'photos des étapes de la méthode'],
  ['.training-dialog > img', 'photo de la fiche formation'],
  ['.trainer__photo img', 'portrait du formateur'],
  ['.training-dialog__media img', 'visuel en vis-à-vis de la fiche'],
  ['.front .img', 'photo de la carte animée']
];

/* On ne garde que les blocs de déclarations les plus intérieurs : ainsi une
   règle enfermée dans un @media est lue pour elle-même, et un filtre posé sur
   la règle voisine n'est jamais mis au compte du sélecteur cherché. */
const BLOCS = /([^{}]+)\{([^{}]*)\}/g;

/* « backdrop-filter » floute le fond derrière un cartouche de texte posé sur la
   photo ; il ne touche pas la photo elle-même et doit rester. */
const DECLARATION_FILTRE = /(?<![-\w])(?:-webkit-)?filter\s*:\s*([^;}]*)/g;

/* Un même sélecteur revient à plusieurs endroits du fichier : `.training-dialog__media
   img` est écrit cinq fois, dont trois sous @media. On les relève tous, pas
   seulement le premier. Les listes séparées par des virgules sont découpées par
   prudence : aucun des six emplacements n'y figure aujourd'hui, mais la feuille
   de style en compte ailleurs et rien n'empêcherait l'un d'eux d'y arriver.

   Le nombre de blocs visés est rendu avec les filtres : sans lui, un sélecteur
   disparu et un sélecteur sain se ressemblent, tous deux rendent zéro filtre. */
const filtresDe = (css, selecteur) => {
  const blocs = [...css.matchAll(BLOCS)].filter(bloc =>
    bloc[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).includes(selecteur));
  return {
    blocs: blocs.length,
    filtres: blocs.flatMap(bloc =>
      [...bloc[2].matchAll(DECLARATION_FILTRE)].map(d => 'filter: ' + d[1].trim()))
  };
};

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Contrôles-témoins : sans eux, l'épreuve passerait aussi sur un fichier où
   rien n'aurait été retiré, parce qu'un détecteur muet ne trouve jamais rien. */
verifier('un filtre posé sur une photo est bien repéré',
  filtresDe('.temoin img { object-fit: cover; filter: saturate(0.5); }', '.temoin img').filtres,
  ['filter: saturate(0.5)']);

verifier('un backdrop-filter n’est pas pris pour un filtre de photo',
  filtresDe('.temoin img { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }', '.temoin img').filtres,
  []);

verifier('un sélecteur en liste ou répété est lu partout',
  filtresDe('.a, .temoin img { filter: contrast(2); } .temoin img { filter: brightness(0.5); }', '.temoin img').filtres,
  ['filter: contrast(2)', 'filter: brightness(0.5)']);

EMPLACEMENTS.forEach(([selecteur, nom]) => {
  const { blocs, filtres } = filtresDe(CSS, selecteur);
  /* Un sélecteur renommé ou supprimé ne porte plus aucun filtre : le contrôle
     suivant passerait tout seul, et plus rien ne surveillerait cette photo. On
     s'assure d'abord que l'emplacement est toujours là pour être éprouvé. */
  verifier('l’emplacement existe toujours dans la feuille de style : ' + nom
    + ' (' + selecteur + ')', blocs > 0, true);
  verifier('aucune recoloration : ' + nom + ' (' + selecteur + ')', filtres, []);
});

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

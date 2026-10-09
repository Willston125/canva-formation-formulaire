/* Lance les épreuves du site et du tableau de bord, chacune dans son propre
   processus : on part ainsi toujours d'un état propre. */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const EPREUVES = [
  ['textes.test.js', 'Textes modifiables du site'],
  ['api-du-site.test.js', 'Le site parle a sa propre API, et a personne d autre'],
  ['pays.test.js', 'Pays desservis'],
  ['polices.test.js', 'Typographie du site et du tableau de bord'],
  ['formulaires.test.js', 'Formulaires : cloisonnement et valeurs conservees'],
  ['affichage.test.js', 'Ce qui est masque disparait, ce qui est garde s affiche'],
  ['echappement.test.js', 'Echappement HTML valable aussi dans un attribut'],
  ['filtres-photo.test.js', 'Aucune regle ne recolore une photo'],
  ['cadrage-affichage.test.js', 'Le cadrage s applique aux seules images remplacees'],
  ['rapports-visuels.test.js', 'Chaque emplacement annonce son rapport reel'],
  ['envoi-non-destructif.test.js', 'L envoi conserve la photo entiere'],
  ['catalogue-annonce.test.js', 'Une modification du tableau de bord atteint la page'],
  ['session-par-pays.test.js', 'Mode, lieu et tarif propres a chaque pays'],
  ['reglage-cadrage-admin.test.js', 'Reglage du cadrage dans un apercu au rapport reel'],
  ['apparence-tot.test.js', 'Apparence rejouee avant le premier affichage'],
  ['adresse-du-site.test.js', 'Toutes les pages nomment la meme adresse'],
  ['sync-sessions.test.js', 'Alignement des sessions du fichier sur la feuille'],
  ['fiche-a-jour.test.js', 'L en-tete d une fiche generee suit le catalogue'],
  ['accueil-a-jour.test.js', 'L accueil suit le catalogue et le pays du visiteur'],
  ['photo-retiree.test.js', 'Une photo retiree rend celle d origine'],
  ['places-source-unique.test.js', 'Les places se deduisent toujours des inscrits'],
  ['sync-formations.test.js', 'Alignement des formations du fichier sur la feuille'],
  ['page-introuvable.test.js', 'Une adresse inconnue repond introuvable'],
  ['pied-domaines.test.js', 'Les domaines du pied se remplissent sur toutes les pages'],
  ['fichiers-publies.test.js', 'Ni documents internes ni photos de travail en ligne'],
  ['noms-uniques.test.js', 'Aucun nom de fonction declare deux fois'],
  ['annonces.test.js', 'La fenetre d annonce : ou, quand, et ce qu elle compte']
];

/* La liste ci-dessus est écrite à la main : une épreuve ajoutée dans le dossier
   mais oubliée ici ne serait jamais lancée, et se tairait pour toujours.
   On compare donc la liste au contenu réel du dossier avant de commencer. */
const surLeDisque = require('fs').readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'));
const oubliees = surLeDisque.filter(f => !EPREUVES.some(([nom]) => nom === f));
const fantomes = EPREUVES.map(([nom]) => nom).filter(n => surLeDisque.indexOf(n) < 0);
if (oubliees.length || fantomes.length) {
  if (oubliees.length) console.log('Épreuves présentes mais jamais lancées : ' + oubliees.join(', '));
  if (fantomes.length) console.log('Épreuves annoncées mais introuvables : ' + fantomes.join(', '));
  process.exit(1);
}

let echecs = 0;
for (const [fichier, titre] of EPREUVES) {
  console.log('\n=== ' + titre + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, fichier)], {
    stdio: 'inherit', env: process.env
  });
  if (r.status !== 0) echecs++;
}

console.log(echecs
  ? '\n' + echecs + ' épreuve(s) en échec.'
  : '\nToutes les épreuves passent.');
process.exit(echecs ? 1 : 0);

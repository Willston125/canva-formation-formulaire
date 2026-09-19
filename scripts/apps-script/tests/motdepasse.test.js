/* Le mot de passe du tableau de bord doit être LISIBLE et INFAILLIBLE.
 *
 * Deux montages ont échoué avant celui-ci :
 *
 *  1. La phrase vivait dans une constante du fichier. Mettre le script à jour,
 *     c'est recoller ce fichier entier : la constante repartait à « CHANGEZ-MOI »
 *     et l'administration se fermait.
 *  2. On l'a donc rangée dans les propriétés du script, qui l'emportaient sur le
 *     fichier. Le jour où les deux ont différé — une espace de trop suffit —
 *     plus rien n'ouvrait, et AUCUN écran ne permettait de voir laquelle était
 *     en cause. C'est ce qui est arrivé en production.
 *
 * Le montage actuel : ce qui est écrit dans le fichier fait loi, on peut donc
 * toujours le relire. Les propriétés ne gardent qu'une copie de secours, qui
 * ne sert que si la ligne du fichier est restée sur sa valeur d'usine. */
'use strict';

const CHEMIN_GS = require('path').resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const vm = require('vm');
const fs = require('fs');
const evaluer = (code) => vm.runInContext(code, bac);
const proprietes = () => bac.PropertiesService.getScriptProperties();
const source = fs.readFileSync(CHEMIN_GS, 'utf8');
/** Recolle le fichier, comme une mise à jour dans l'éditeur, puis pose une constante. */
const poserFichier = (constante) => {
  vm.runInContext(source, bac, { filename: CHEMIN_GS });
  vm.runInContext('MOT_DE_PASSE_ADMIN = ' + JSON.stringify(constante) + ';', bac);
};
const USINE = 'CHANGEZ-MOI-avant-de-deployer';

// --- 1. Ce qui est écrit dans le fichier fait loi ---
/* L'émulateur a posé « motdepasse-de-test » dans la constante. */
verifier('la phrase du fichier ouvre le tableau de bord',
  evaluer('verifierMotDePasse("motdepasse-de-test")'), true);
verifier('et une autre phrase est refusée',
  evaluer('verifierMotDePasse("autre-chose")'), false);

// --- 2. Le fichier l'emporte sur la copie rangée dans les propriétés ---
/* C'est l'inversion qui débloque : une copie oubliée ne peut plus contredire
   la ligne que l'on a sous les yeux. */
proprietes().setProperty('MOT_DE_PASSE_ADMIN', 'vieille-phrase-oubliee');
verifier('une vieille copie ne prend pas le dessus sur le fichier',
  evaluer('verifierMotDePasse("motdepasse-de-test")'), true);
verifier('et cette vieille copie ne vaut plus rien',
  evaluer('verifierMotDePasse("vieille-phrase-oubliee")'), false);
verifier('la copie est même remise à jour au passage',
  proprietes().getProperty('MOT_DE_PASSE_ADMIN'), 'motdepasse-de-test');

// --- 3. Les espaces invisibles ne peuvent plus enfermer dehors ---
/* La panne réelle : une espace emportée par un copier-coller, d'un côté ou de
   l'autre, que ni le champ masqué ni l'écran des propriétés ne montrent. */
poserFichier('  phrase-avec-espaces-autour  ');
verifier('une phrase entourée d’espaces dans le fichier fonctionne',
  evaluer('verifierMotDePasse("phrase-avec-espaces-autour")'), true);
verifier('et une saisie entourée d’espaces fonctionne aussi',
  evaluer('verifierMotDePasse("  phrase-avec-espaces-autour  ")'), true);
verifier('la copie est rangée déjà nettoyée',
  proprietes().getProperty('MOT_DE_PASSE_ADMIN'), 'phrase-avec-espaces-autour');

// --- 4. Une mise à jour recollée sans le mot de passe n'enferme personne ---
/* Le cas qui avait motivé les propriétés : on recolle le fichier tel qu'il est
   livré, la ligne est repartie à sa valeur d'usine. La dernière phrase connue
   prend le relais au lieu de fermer la porte. */
poserFichier(USINE);
verifier('la ligne du fichier est bien revenue à sa valeur d’usine',
  evaluer('MOT_DE_PASSE_ADMIN'), USINE);
verifier('la dernière phrase connue prend le relais',
  evaluer('verifierMotDePasse("phrase-avec-espaces-autour")'), true);
verifier('et l’état annonce un mot de passe configuré',
  evaluer('etatDuScript().motDePasseConfigure'), true);

// --- 5. Reprendre la main se fait en réécrivant la ligne, et rien d'autre ---
/* C'est tout le contrat : changer le mot de passe, c'est changer cette ligne.
   Aucun réglage à ouvrir, aucune propriété à créer. */
poserFichier('nouvelle-phrase-2026');
verifier('la nouvelle phrase du fichier prend effet immédiatement',
  evaluer('verifierMotDePasse("nouvelle-phrase-2026")'), true);
verifier('et l’ancienne cesse aussitôt de fonctionner',
  evaluer('verifierMotDePasse("phrase-avec-espaces-autour")'), false);

/* Une phrase réelle ne ressemble pas à un identifiant : elle commence souvent
   par un caractère de ponctuation et mêle majuscules et chiffres. Rien dans la
   comparaison ne doit s'y opposer. */
poserFichier('@@Exemple28125');
verifier('une phrase commençant par de la ponctuation fonctionne',
  evaluer('verifierMotDePasse("@@Exemple28125")'), true);
verifier('et la casse compte',
  evaluer('verifierMotDePasse("@@exemple28125")'), false);

// --- 6. Rien de configuré : l'administration reste fermée ---
poserFichier(USINE);
proprietes().deleteProperty('MOT_DE_PASSE_ADMIN');
verifier('sans phrase nulle part, la valeur d’usine elle-même est refusée',
  evaluer('verifierMotDePasse("' + USINE + '")'), false);
verifier('et l’état le dit franchement',
  evaluer('etatDuScript().motDePasseConfigure'), false);

// --- 7. Le fichier ne parle plus d'outils qui n'existent plus ---
/* Deux fonctions d'éditeur écrivaient dans les propriétés. Sous ce montage
   elles seraient contredites par le fichier : les laisser induirait en erreur. */
verifier('aucun outil d’éditeur ne subsiste',
  /function (diagnostiquer|definir)MotDePasse\b/.test(source), false);
verifier('la notice n’envoie plus dans les propriétés du script',
  /Propriétés du script → Ajouter une propriété/.test(source), false);

// --- 8. Une seule ligne à renseigner, et pas deux ---
/* Le fichier a porté un moment DEUX constantes voisines tenant la même valeur :
   celle à renseigner, et le repère d'usine juste en dessous. On y a recopié sa
   phrase en croyant bien faire — le script a conclu que rien n'était configuré,
   et l'accès est resté fermé. Une seule ligne doit être renseignable. */
const lignesAmodifier = source.split('\n')
  .filter(l => /^var MOT_DE_PASSE/.test(l));
verifier('le fichier ne propose qu’une seule ligne à renseigner',
  lignesAmodifier.length, 1);
verifier('et c’est bien celle du mot de passe',
  /^var MOT_DE_PASSE_ADMIN = /.test(lignesAmodifier[0] || ''), true);

/* Le repère se reconnaît à son début, pas à l'égalité avec une autre
   constante : recopier la phrase quelque part ne peut donc plus le neutraliser,
   et une ligne laissée à moitié modifiée est toujours vue comme non renseignée. */
poserFichier('CHANGEZ-MOI-avant-de-deployer');
proprietes().deleteProperty('MOT_DE_PASSE_ADMIN');
verifier('la ligne livrée telle quelle vaut « rien de configuré »',
  evaluer('etatDuScript().motDePasseConfigure'), false);
poserFichier('CHANGEZ-MOI-je-le-ferai-demain');
verifier('une ligne à moitié modifiée aussi',
  evaluer('etatDuScript().motDePasseConfigure'), false);
verifier('et elle n’ouvre rien',
  evaluer('verifierMotDePasse("CHANGEZ-MOI-je-le-ferai-demain")'), false);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

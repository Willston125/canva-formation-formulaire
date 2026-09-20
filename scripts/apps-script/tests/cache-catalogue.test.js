/* Vérifie le catalogue retenu chez Google.

   Mesuré depuis le site publié : un appel « catalogue » prenait 3,9 à 5,5
   secondes, de façon constante sur trois essais consécutifs — donc pas un
   démarrage à froid, mais huit onglets rouverts pour chaque visiteur.

   Un cache règle cela, et introduit trois risques qu'on éprouve ici :
     1. servir un nombre de places périmé, donc vendre deux fois la dernière ;
     2. masquer une modification faite depuis le tableau de bord ;
     3. montrer au gestionnaire autre chose que ce qu'il vient d'écrire.

   Le quatrième risque — une cellule corrigée à la main, sans passer par le
   tableau de bord — n'est pas évitable : il est BORNÉ par la durée du cache,
   et c'est cette borne qu'on vérifie. */
'use strict';

const path = require('path');
process.env.GS_SOURCE = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
const { bac, creerFeuille, appelsSheets } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const poste = charge => JSON.parse(bac.doPost({
  postData: { contents: JSON.stringify(Object.assign({ motDePasse: 'motdepasse-de-test' }, charge)) }
})._t);
const catalogueDuSite = () => JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);

/** Nombre d'accès à la feuille consommés par un appel. */
function coutDe(appel) {
  const avant = appelsSheets.total;
  const r = appel();
  return { cout: appelsSheets.total - avant, resultat: r };
}

// --- 1. Le deuxième appel coûte beaucoup moins que le premier --------------

bac.oublierCatalogue();
const premier = coutDe(catalogueDuSite);
const second = coutDe(catalogueDuSite);

/* Contre-contrôle : si le premier appel ne coûtait rien, la comparaison
   ci-dessous ne prouverait plus rien du tout. */
verifier('le premier appel lit bien la feuille', premier.cout > 5, true);
verifier('le second coûte strictement moins', second.cout < premier.cout, true);
/* On attend un ordre de grandeur, pas un chiffre exact : le détail des accès
   change au gré du code, la DIVISION est ce qui compte. */
verifier('et au moins deux fois moins', second.cout * 2 <= premier.cout, true);

// --- 2. Les places restantes ne sont JAMAIS retenues ------------------------

/* C'est le risque le plus grave : deux candidats à qui l'on promet la même
   dernière place. Elles doivent être recomptées à chaque appel, cache ou non. */
/* LE CACHE DOIT ÊTRE CHAUD au moment de l'inscription, sinon l'appel suivant
   relit tout et le contrôle passerait sans rien prouver — c'est le piège dans
   lequel ce contrôle est d'abord tombé : une commande d'administration
   invalidait le cache juste avant, et le recomptage n'y était pour rien.
   Une inscription du PUBLIC n'invalide rien : c'est bien le recomptage, et lui
   seul, qui doit faire apparaître le nouvel inscrit. */
catalogueDuSite();
const placesAvant = JSON.stringify(catalogueDuSite().places);

const inscrire = (nom, courriel) => bac.doPost({
  postData: {
    contents: JSON.stringify({
      nom: nom, email: courriel, telephone: '77000000',
      sessionId: 'sess-cache', formationId: 'f1'
    })
  }
});
inscrire('Essai Cache', 'essai-cache@exemple.test');
const apresInscription = catalogueDuSite();
verifier('une inscription se voit tout de suite, malgré le cache',
  JSON.stringify(apresInscription.places) !== placesAvant, true);

/* Et le catalogue reste servi : recompter les places ne doit pas avoir vidé
   le reste de la réponse. */
verifier('le reste du catalogue est toujours là',
  Array.isArray(apresInscription.sessions) && !!apresInscription.textes, true);

// --- 3. Une écriture du tableau de bord se voit tout de suite --------------

catalogueDuSite(); // on s'assure que le cache est chaud
poste({ action: 'admin.textes.save', donnees: { 'hero.surtitre': 'TEXTE APRÈS ÉCRITURE' } });
verifier('un texte enregistré paraît immédiatement sur le site',
  catalogueDuSite().textes['hero.surtitre'], 'TEXTE APRÈS ÉCRITURE');

/* La même chose pour une suppression : c'est le cas qu'on oublie, et il est
   plus grave — une formation retirée qu'on continuerait de proposer. */
/* Une valeur vidée SUPPRIME la clé — c'est ainsi qu'on rétablit le texte
   d'origine du fichier. Contre-contrôle d'abord : sans lui, le contrôle
   suivant passerait aussi bien si la clé n'avait JAMAIS existé, et c'est
   exactement ce qui s'est produit au premier jet de cette épreuve. */
poste({ action: 'admin.textes.save', donnees: { 'essai.suppression': 'À SUPPRIMER' } });
verifier('la clé jetable existe bien avant qu’on la retire',
  catalogueDuSite().textes['essai.suppression'], 'À SUPPRIMER');

catalogueDuSite(); // on réchauffe le cache juste avant la suppression
poste({ action: 'admin.textes.save', donnees: { 'essai.suppression': '' } });
verifier('et une suppression se voit immédiatement sur le site',
  catalogueDuSite().textes['essai.suppression'], undefined);

// --- 4. Le tableau de bord ne lit jamais ce cache --------------------------

/* Celui qui vient d'enregistrer doit voir ce qu'il a écrit. S'il recevait la
   copie retenue, il croirait sa modification perdue et la referait. */
catalogueDuSite();
const feuilleTextes = creerFeuille('Textes');
feuilleTextes.appendRow(['cle', 'valeur']);
feuilleTextes.appendRow(['hero.surtitre', 'ÉCRIT À LA MAIN']);

const vuParLeGestionnaire = poste({ action: 'admin.catalogue' });
verifier('le gestionnaire voit la feuille telle qu’elle est',
  vuParLeGestionnaire.catalogue.textes['hero.surtitre'], 'ÉCRIT À LA MAIN');

/* Et le site, lui, sert encore la copie retenue : c'est le compromis assumé
   d'une modification faite à la main, hors du tableau de bord. */
verifier('le site sert encore la copie retenue, comme annoncé',
  catalogueDuSite().textes['hero.surtitre'], 'TEXTE APRÈS ÉCRITURE');

// --- 5. Cette attente est bornée, et courte -------------------------------

/* Sans borne courte, une correction saisie le matin ne se verrait qu'en fin de
   journée. Google permet six heures ; on en prend cinq minutes. */
const source = require('fs').readFileSync(process.env.GS_SOURCE, 'utf8');
const duree = Number((/var DUREE_CACHE_CATALOGUE = (\d+)/.exec(source) || [])[1]);
verifier('la durée du cache est déclarée', duree > 0, true);
verifier('et ne dépasse pas cinq minutes', duree <= 300, true);

// --- 6. Une lecture pendant l'écriture ne remet pas l'ancien en cache -------

/* LA COURSE. Le cache n'était jeté qu'AVANT l'écriture. Un visiteur qui
   demandait le catalogue pendant les une à trois secondes de cette écriture
   relisait la feuille PAS ENCORE MODIFIÉE et la remettait en cache pour cinq
   minutes. L'écriture terminée, le site servait donc l'ancien contenu — et
   d'autant plus souvent qu'il y a du monde, c'est-à-dire précisément quand on
   corrige quelque chose en campagne.
   Le site ne prend pas le verrou : rien ne l'empêche de lire au mauvais
   moment. Le seul remède est de jeter le cache APRÈS l'écriture aussi. */
const lireAuMauvaisMoment = () => { catalogueDuSite(); };
bac.__pendantEcriture = lireAuMauvaisMoment;

const avantCourse = catalogueDuSite().textes['course.essai'];
verifier('le texte de l’essai n’existe pas encore', avantCourse, undefined);

/* On simule le visiteur en lisant JUSTE AVANT de poster : le cache est alors
   rempli avec l'état d'avant, exactement comme dans la course réelle. */
catalogueDuSite();
poste({ action: 'admin.textes.save', donnees: { 'course.essai': 'ÉCRIT PENDANT LA COURSE' } });
verifier('une modification reste visible malgré une lecture concurrente',
  catalogueDuSite().textes['course.essai'], 'ÉCRIT PENDANT LA COURSE');

const posePurge = source.indexOf('oublierCatalogue();');
verifier('le cache est jeté plus d’une fois autour de l’écriture',
  (source.match(/oublierCatalogue\(\);/g) || []).length >= 2, true);
verifier('et la seconde fois APRÈS l’écriture, dans le « finally »',
  source.indexOf('oublierCatalogue();', posePurge + 1) > source.indexOf('} finally {'), true);

console.log(`Accès à la feuille : ${premier.cout} au premier appel, ${second.cout} au second`);
console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

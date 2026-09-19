/* Le formulaire d'inscription est ouvert à tous — il le doit, c'est son rôle.
 *
 * Mais l'adresse du script figure dans formations-data.js, que n'importe quel
 * visiteur peut lire : on peut donc l'appeler sans passer par le formulaire.
 * Sans garde-fou, cela permettait d'écrire des lignes arbitraires, de faire
 * croire qu'une session était pleine, et d'épuiser le quota d'emails de Google
 * — auquel cas les VRAIES inscriptions n'auraient plus donné lieu à aucune
 * alerte.
 *
 * Le contrat éprouvé ici : refuser le strict minimum, tronquer le reste. Une
 * inscription perdue coûte plus cher qu'une ligne un peu longue. */
'use strict';

const path = require('path');
const CHEMIN_GS = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac, classeur } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const poster = (charge) => JSON.parse(
  bac.doPost({ postData: { contents: JSON.stringify(charge) } })._t);

/** Une inscription complète et ordinaire, celle que le site envoie vraiment. */
const VALABLE = {
  dateInscription: '2026-09-19', formationId: 'canva-pro',
  formationTitle: 'Canva Pro & Création de contenu',
  sessionId: 'canva-pro-2026-11', sessionLabel: '5 novembre 2026',
  nom: 'DUPONT', prenom: 'Awa', telephone: '77112233',
  telephoneInternational: '+25377112233', age: 27, profession: 'Étudiant',
  niveau: 'Jamais', objectifs: 'Freelance', motivation: 'Essai',
  modePaiement: 'Waafi Mobile Money', telPaiement: '77112233',
  montant: 7500, currency: 'FDJ', pays: 'Djibouti', paysCode: 'DJ',
  statut: 'En attente', source: 'Site'
};

/* On relit la feuille par l'API de l'émulateur, comme le fait le script :
   lire la structure interne exposerait ce test à une réorganisation du bac
   d'essai plutôt qu'à un vrai changement de comportement. */
const grille = () => {
  const f = bac.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscriptions');
  return f ? f.getDataRange().getValues() : [];
};
const lignes = () => Math.max(0, grille().length - 1);
const derniere = () => {
  const g = grille();
  const entetes = g[0].map(String);
  const vue = {};
  entetes.forEach((e, i) => { vue[e] = g[g.length - 1][i]; });
  return vue;
};

// --- 1. Une inscription ordinaire passe, inchangée ---
verifier('une inscription complète est acceptée', poster(VALABLE).ok, true);
verifier('le nom est écrit tel quel', derniere().nom, 'DUPONT');
verifier('le statut envoyé par le site est conservé', derniere().statut, 'En attente');
verifier('le montant reste un nombre', derniere().montant, 7500);

// --- 2. L'essentiel manquant fait refuser, et rien n'est écrit ---
const avant = lignes();
[
  ['sans nom', Object.assign({}, VALABLE, { nom: '', prenom: '' })],
  ['sans téléphone', Object.assign({}, VALABLE, { telephone: '', telephoneInternational: '' })],
  ['sans formation', Object.assign({}, VALABLE, { formationId: '' })]
].forEach(([libelle, charge]) => {
  verifier('refusée ' + libelle, poster(charge).ok, false);
});
verifier('aucune ligne n’a été écrite par les refus', lignes(), avant);
/* Ce contrôle ne vaut que si la feuille contient déjà quelque chose : comparer
   deux comptages nuls passerait sans rien éprouver. */
verifier('et la feuille n’était pas vide au départ', avant >= 1, true);

/* Un prénom seul suffit : on ne refuse pas quelqu'un qui ne donne qu'un nom. */
verifier('un prénom seul suffit',
  poster(Object.assign({}, VALABLE, { nom: '' })).ok, true);

// --- 3. Le statut ne peut plus venir de la requête ---
/* Il est repris dans <option value="…"> par le tableau de bord. Même échappé,
   il n'a aucune raison d'accepter autre chose que les statuts connus. */
poster(Object.assign({}, VALABLE, { statut: 'x" onmouseover="alert(1)' }));
verifier('un statut inventé est ramené au statut par défaut',
  derniere().statut, 'En attente');
poster(Object.assign({}, VALABLE, { statut: 'Payé' }));
verifier('mais un statut connu est respecté', derniere().statut, 'Payé');

// --- 4. Ce qui dépasse est tronqué, jamais rejeté ---
poster(Object.assign({}, VALABLE, {
  nom: 'A'.repeat(5000),
  motivation: 'B'.repeat(9000)
}));
verifier('un champ ordinaire est ramené à 300 caractères',
  String(derniere().nom).length, 300);
/* La motivation est le seul endroit où le candidat s'exprime : on lui laisse
   de la place, sans laisser gonfler la feuille indéfiniment. */
verifier('un champ libre garde 2000 caractères',
  String(derniere().motivation).length, 2000);
verifier('et l’inscription est tout de même enregistrée',
  String(derniere().nom).indexOf('A'), 0);

// --- 5. Un montant qui n'en est pas un ne fausse pas les totaux ---
poster(Object.assign({}, VALABLE, { montant: 'gratuit', age: 'douze' }));
verifier('un montant non numérique est vidé', derniere().montant, '');
verifier('un âge non numérique est vidé', derniere().age, '');
poster(Object.assign({}, VALABLE, { age: 200 }));
verifier('un âge invraisemblable est vidé', derniere().age, '');

// --- 6. Une charge démesurée est refusée avant tout traitement ---
const avantGros = lignes();
const gros = bac.doPost({ postData: { contents: '{"nom":"' + 'x'.repeat(1600000) + '"}' } });
verifier('une requête de plus de 1,5 Mo est refusée',
  JSON.parse(gros._t).erreur, 'Requête trop volumineuse.');
verifier('et elle n’écrit rien', lignes(), avantGros);

// --- 7. Le plafond d'alertes protège le quota d'envoi ---
/* Google limite les envois par jour, pour tout le projet. L'épuiser, c'est
   perdre les alertes des inscriptions SUIVANTES — les vraies.
   On repart d'un compteur à zéro : les inscriptions éprouvées plus haut en ont
   déjà consommé une part, et compter à partir de là ne dirait rien du plafond. */
bac.PropertiesService.getScriptProperties().deleteProperty('ALERTES_DU_JOUR');
let autorisees = 0;
for (let i = 0; i < 80; i++) if (bac.alerteAutorisee()) autorisees++;
verifier('les alertes du jour s’arrêtent exactement au plafond', autorisees, 60);
verifier('une inscription reste enregistrée une fois le plafond atteint',
  poster(VALABLE).ok, true);
/* Et le lendemain, le compteur repart : un pic un jour ne doit pas rendre
   sourd pour toujours. */
bac.PropertiesService.getScriptProperties().setProperty('ALERTES_DU_JOUR', '2020-01-01|60');
verifier('le compteur repart le jour suivant', bac.alerteAutorisee(), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

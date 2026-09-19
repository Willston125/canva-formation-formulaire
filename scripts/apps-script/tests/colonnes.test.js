/* Éprouve la migration des colonnes sur un classeur DÉJÀ REMPLI :
   c'est le cas réel du site en production, dont l'onglet Inscriptions et
   l'onglet Formations ont été créés avant l'ajout du pays et des tarifs. */
'use strict';

const CHEMIN_GS = require('path').resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac, creerFeuille, classeur } = require('./emulateur.js');

const ANCIENNES_COLONNES = [
  'Horodatage réception', 'dateInscription', 'formationId', 'formationTitle', 'sessionId',
  'sessionLabel', 'sessionStartDate', 'nom', 'prenom', 'telephone', 'telephoneInternational',
  'email', 'age', 'profession', 'professionDetail', 'niveau', 'objectifs', 'motivation',
  'modePaiement', 'telPaiement', 'montant', 'currency', 'statut', 'source', 'pageUrl', 'JSON complet'
];

// --- Onglet Inscriptions « d'avant », avec une ligne déjà enregistrée ---
const inscriptions = creerFeuille('Inscriptions');
inscriptions.appendRow(ANCIENNES_COLONNES);
inscriptions.appendRow([
  new Date('2026-09-01T10:00:00Z'), '2026-09-01', 'canva-pro', 'Canva Pro', 'canva-pro-2026-11',
  '5 novembre 2026', '2026-11-05', 'ANCIEN', 'Candidat', '77112233', '+25377112233',
  '', 30, 'Étudiant', '', 'Jamais', 'Test', 'Ligne antérieure',
  'Espèces', '', 7500, 'FDJ', 'Nouveau', 'Site', '', '{}'
]);

// --- Onglet Formations « d'avant », sans colonne prices ---
const ANCIENS_CHAMPS_FORMATION = [
  'id', 'slug', 'title', 'shortTitle', 'category', 'family', 'promise', 'shortDescription',
  'image', 'imageAlt', 'duration', 'level', 'mode', 'price', 'modules', 'learnings',
  'featured', 'registrationOpen', 'active', 'allowRegistrationWithoutSession', 'hasDetailPage',
  'href', 'formId', 'poster', 'lead', 'levelSubject', 'objectives', 'ordre'
];
const formations = creerFeuille('Formations');
formations.appendRow(ANCIENS_CHAMPS_FORMATION);
formations.appendRow([
  'formation-canva-pro', 'canva-pro', 'Canva Pro', 'Canva', 'Création', 'Design', 'Promesse', 'Description',
  '/img.webp', 'alt', '12 jours', 'Tous niveaux', 'Présentiel', 7500, 4, '["a"]',
  true, true, true, true, true, '/formations/canva-pro/', 'canva-pro', '', '', 'Canva', '[]', 0
]);

// ---------------------------- 1. INSCRIPTION -----------------------------

bac.doPost({ postData: { contents: JSON.stringify({
  dateInscription: '2026-09-16', formationId: 'canva-pro', formationTitle: 'Canva Pro',
  sessionId: 'canva-pro-2027-03-km', sessionLabel: '2 mars 2027', sessionStartDate: '2027-03-02',
  nom: 'NOUVEAU', prenom: 'Comorien', telephone: '3212345', telephoneInternational: '+2693212345',
  age: 28, profession: 'Étudiant', niveau: 'Jamais', objectifs: 'Test', motivation: 'Essai',
  modePaiement: 'Holo', telPaiement: '3212345', montant: 25000, currency: 'KMF',
  pays: 'Comores', paysCode: 'KM', countryCode: '+269', statut: 'Confirmé', source: 'Site'
}) } });

const grille = inscriptions.getDataRange().getValues();
const entetes = grille[0].map(String);
const lire = (ligne, nom) => grille[ligne][entetes.indexOf(nom)];

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = String(obtenu) === String(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

verifier('colonne pays ajoutée', entetes.includes('pays'), true);
verifier('colonne paysCode ajoutée', entetes.includes('paysCode'), true);
verifier('ligne ancienne intacte (nom)', lire(1, 'nom'), 'ANCIEN');
verifier('ligne ancienne intacte (montant)', lire(1, 'montant'), 7500);
verifier('ligne ancienne : pays vide', lire(1, 'pays'), '');
verifier('nouvelle ligne : nom', lire(2, 'nom'), 'NOUVEAU');
verifier('nouvelle ligne : pays', lire(2, 'pays'), 'Comores');
verifier('nouvelle ligne : paysCode', lire(2, 'paysCode'), 'KM');
verifier('nouvelle ligne : devise', lire(2, 'currency'), 'KMF');
verifier('nouvelle ligne : montant', lire(2, 'montant'), 25000);
verifier('nouvelle ligne : statut non décalé', lire(2, 'statut'), 'Confirmé');
verifier('nouvelle ligne : session', lire(2, 'sessionId'), 'canva-pro-2027-03-km');

// -------------------------- 2. TARIFS PAR PAYS ---------------------------

const reponse = JSON.parse(bac.doPost({ postData: { contents: JSON.stringify({
  action: 'admin.formation.save', motDePasse: 'motdepasse-de-test',
  donnees: { id: 'formation-canva-pro', slug: 'canva-pro', title: 'Canva Pro', formId: 'canva-pro',
    price: 7500, prices: { DJ: 7500, KM: 25000 }, ordre: 0, active: true }
}) } })._t);

const gf = formations.getDataRange().getValues();
const ef = gf[0].map(String);
verifier('colonne prices ajoutée', ef.includes('prices'), true);
verifier('prices enregistré', gf[1][ef.indexOf('prices')], '{"DJ":7500,"KM":25000}');
verifier('price conservé', gf[1][ef.indexOf('price')], 7500);
verifier('title non décalé', gf[1][ef.indexOf('title')], 'Canva Pro');
verifier('relecture prices', JSON.stringify(reponse.catalogue.formations[0].prices), '{"DJ":7500,"KM":25000}');

// ------------------------- 3. COMPTEUR DE PLACES -------------------------

const places = JSON.parse(bac.doGet({ parameter: { action: 'places' } })._t);
verifier('comptage session historique', places.sessions['canva-pro-2026-11'], 1);
verifier('comptage session comorienne', places.sessions['canva-pro-2027-03-km'], 1);

console.log(resultats.join('\n'));
console.log(resultats.some(r => r.startsWith('ÉCHEC')) ? '\n>>> DES TESTS ONT ÉCHOUÉ' : '\n>>> Tout est conforme');
process.exit(resultats.some(r => r.startsWith('ÉCHEC')) ? 1 : 0);

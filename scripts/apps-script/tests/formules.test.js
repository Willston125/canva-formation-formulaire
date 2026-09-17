/* Vérifie que les valeurs commençant par « + » survivent à l'écriture.
   C'est le défaut observé sur la feuille en service : l'indicatif « +253 »
   y est devenu le nombre 253, et « +253 77 14 53 06 » est devenu #ERROR!. */
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

const poste = charge => JSON.parse(bac.doPost({ postData: { contents: JSON.stringify(
  Object.assign({ motDePasse: 'motdepasse-de-test' }, charge)) } })._t);
const catalogue = () => JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);

// --- 1. Réglages : paires clé / valeur ---
poste({ action: 'admin.reglages.save', donnees: {
  whatsappNumber: '25377145306',
  whatsappDisplay: '+253 77 14 53 06',
  contactName: 'Ali William',
  defaultLocation: 'Saalam Tower, 5ème étage, Djibouti',
  numeroLocal: '077145306',
  compte: '1100001212712345678'
} });
const r = catalogue().reglages;
verifier('réglages : numéro affiché', r.whatsappDisplay, '+253 77 14 53 06');
verifier('réglages : numéro WhatsApp reste du TEXTE', r.whatsappNumber, '25377145306');
verifier('réglages : zéro initial conservé', r.numeroLocal, '077145306');
verifier('réglages : longue suite de chiffres intacte', r.compte, '1100001212712345678');
verifier('réglages : lieu intact', r.defaultLocation, 'Saalam Tower, 5ème étage, Djibouti');

// --- 2. Pays : l'indicatif commence par « + », les moyens de paiement en JSON ---
poste({ action: 'admin.pays.save', donnees: {
  code: 'DJ', nom: 'Djibouti', devise: 'FDJ', indicatif: '+253',
  motifTelephone: '^(77|67)\\d{6}$', exempleTelephone: '77XXXXXX',
  longueurTelephone: 8, defaut: true, active: true, ordre: 0,
  paymentMethods: [{ value: 'Waafi Mobile Money', label: 'Waafi', kind: 'mobile',
    numberLabel: 'Numéro', number: '+253 77 55 63 44', accountName: 'Ali William' }]
} });
const dj = catalogue().pays[0];
verifier('pays : indicatif', dj.indicatif, '+253');
verifier('pays : format des numéros', dj.motifTelephone, '^(77|67)\\d{6}$');
verifier('pays : numéro de paiement', dj.paymentMethods[0].number, '+253 77 55 63 44');
verifier('pays : devise', dj.devise, 'FDJ');

// --- 3. Inscription : le téléphone international commence par « + » ---
bac.doPost({ postData: { contents: JSON.stringify({
  dateInscription: '2026-09-16', formationId: 'canva-pro', sessionId: 's1',
  nom: 'TEST', prenom: 'Formule', telephone: '3212345',
  telephoneInternational: '+2693212345', countryCode: '+269',
  pays: 'Comores', paysCode: 'KM', montant: 25000, currency: 'KMF', statut: 'Nouveau'
}) } });
const insc = JSON.parse(bac.doPost({ postData: { contents: JSON.stringify({
  action: 'admin.inscriptions', motDePasse: 'motdepasse-de-test' }) } })._t).inscriptions[0];
verifier('inscription : téléphone international', insc.telephoneInternational, '+2693212345');
verifier('inscription : montant', insc.montant, 25000);

// --- 4. Une session dont l'horaire pourrait ressembler à un calcul ---
poste({ action: 'admin.formation.save', donnees: { id: 'f1', slug: 'canva-pro', title: 'Canva Pro', formId: 'canva-pro' } });
poste({ action: 'admin.session.save', donnees: {
  id: 's1', formId: 'canva-pro', startDate: '2026-11-05',
  schedule: '-18h – 20h', location: '+Moroni', pays: 'DJ', registrationOpen: true
} });
const sess = catalogue().sessions[0];
verifier('session : horaire', sess.schedule, '-18h – 20h');
verifier('session : lieu', sess.location, '+Moroni');

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

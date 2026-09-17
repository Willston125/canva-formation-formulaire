/* Une modification ne doit toucher QUE ce qu'on lui confie.
   Le tableau de bord n'envoie pas toujours toutes les colonnes d'un onglet :
   le formulaire des sessions ignore « currency », et un formulaire plus ancien
   que la feuille ignore les colonnes ajoutées depuis. Si l'écriture remplit
   chaque colonne de l'en-tête à partir de la seule charge reçue, tout ce qui
   n'y figure pas est remis à vide — la valeur disparaît au premier
   enregistrement, sans le moindre message. C'est la forme générale du défaut
   « je modifie une chose et une autre se perd ».

   Un champ explicitement vidé, lui, doit bien être vidé : on éprouve les deux. */
'use strict';

const CHEMIN_GS = require('path').resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac, creerFeuille, classeur } = require('./emulateur.js');

const MDP = 'motdepasse-de-test';
const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const admin = (action, charge) => JSON.parse(bac.doPost({ postData: { contents: JSON.stringify(
  Object.assign({ action: action, motDePasse: MDP }, charge)) } })._t);

/** Relit une cellule par son nom de colonne, sans passer par le catalogue. */
const cellule = (onglet, cle, valeurCle, colonne) => {
  const grille = classeur.feuilles[onglet].getDataRange().getValues();
  const entetes = grille[0].map(v => String(v).trim());
  const iCle = entetes.indexOf(cle);
  const iCol = entetes.indexOf(colonne);
  for (let i = 1; i < grille.length; i++) {
    if (String(grille[i][iCle]).trim() === valeurCle) return grille[i][iCol];
  }
  return undefined;
};

// ------------------------- 1. SESSION : « currency » -------------------------
/* La feuille porte une devise par session. Le formulaire du tableau de bord ne
   propose pas ce champ : il ne l'envoie donc jamais. */

/* Une session doit se rattacher à une formation existante, sinon elle est refusée
   avant même d'être écrite : l'onglet Formations doit exister pour éprouver l'écriture. */
const formations = creerFeuille('Formations');
formations.appendRow(['id', 'formId', 'slug', 'title', 'active']);
formations.appendRow(['formation-canva-pro', 'canva-pro', 'canva-pro', 'Canva Pro', true]);

const sessions = creerFeuille('Sessions');
sessions.appendRow(['id', 'formId', 'startDate', 'endDate', 'schedule', 'duration',
  'location', 'mode', 'price', 'placesTotal', 'placesAvailable', 'registrationOpen',
  'currency', 'pays']);
sessions.appendRow(['sess-1', 'canva-pro', '2026-11-05', '2026-11-28', 'Lun. et jeu.',
  '12 séances', 'Djibouti-ville', 'Présentiel', 7500, 12, 12, true, 'FDJ', 'DJ']);

// Exactement ce qu'envoie ouvrirSession() : pas de « currency »
admin('admin.session.save', { donnees: {
  id: 'sess-1', formId: 'canva-pro', startDate: '2026-11-05', endDate: '2026-11-28',
  schedule: 'Lun. et jeu.', duration: '12 séances', pays: 'DJ', location: 'Djibouti-ville',
  mode: 'Présentiel', price: 8000, placesTotal: 12, placesAvailable: 12, registrationOpen: true
} });

verifier('la modification demandée est bien prise', cellule('Sessions', 'id', 'sess-1', 'price'), 8000);
verifier('une colonne absente du formulaire survit (currency)',
  cellule('Sessions', 'id', 'sess-1', 'currency'), 'FDJ');

// --------------------- 2. PAYS : colonnes ajoutées depuis ---------------------
/* Cas réel de la production : la feuille Pays a reçu whatsappNumber, fuseaux et
   regions après coup. Un enregistrement qui ne les mentionne pas les effacerait. */

const pays = creerFeuille('Pays');
pays.appendRow(['code', 'nom', 'devise', 'indicatif', 'motifTelephone', 'aideTelephone',
  'exempleTelephone', 'longueurTelephone', 'defaut', 'active', 'paymentMethods', 'ordre',
  'whatsappNumber', 'whatsappDisplay', 'fuseaux', 'regions']);
pays.appendRow(['DJ', 'Djibouti', 'FDJ', '+253', '^(77|67)\\d{6}$', 'Format invalide.',
  '77XXXXXX', 8, true, true, '[]', 0,
  "'25377145306", "'+253 77 14 53 06", '["Africa/Djibouti"]', '["DJ"]']);

// Charge d'un formulaire qui ignore les colonnes récentes
admin('admin.pays.save', { donnees: {
  code: 'DJ', nom: 'Djibouti', devise: 'FDJ', indicatif: '+253',
  motifTelephone: '^(77|67)\\d{6}$', aideTelephone: 'Format invalide.',
  exempleTelephone: '77XXXXXX', longueurTelephone: 8, defaut: true, active: true,
  paymentMethods: [], ordre: 0
} });

verifier('le contact du pays survit à un enregistrement qui l’ignore',
  cellule('Pays', 'code', 'DJ', 'whatsappNumber'), '25377145306');
verifier('les fuseaux survivent à un enregistrement qui les ignore',
  cellule('Pays', 'code', 'DJ', 'fuseaux'), '["Africa/Djibouti"]');

/* Le piège de la reprise : Sheets ne rend PAS l'apostrophe qui protège un texte
   commençant par « + ». Relire « +253 77 14 53 06 » puis le réécrire tel quel en
   fait une formule, et la cellule affiche #ERROR!. Une valeur simplement
   conservée doit donc être reprotégée. */
verifier('un numéro affiché conservé ne devient pas une formule',
  cellule('Pays', 'code', 'DJ', 'whatsappDisplay'), '+253 77 14 53 06');

// ------------------ 3. Un champ vidé volontairement doit l'être ------------------
/* La correction ne doit pas rendre les champs indélébiles : le tableau de bord
   envoie bien la clé, avec une valeur vide, quand on efface un champ. */

const socle = {
  code: 'DJ', nom: 'Djibouti', devise: 'FDJ', indicatif: '+253',
  motifTelephone: '^(77|67)\\d{6}$', aideTelephone: 'Format invalide.',
  exempleTelephone: '77XXXXXX', longueurTelephone: 8, defaut: true, active: true,
  paymentMethods: [], ordre: 0, fuseaux: ['Africa/Djibouti'], regions: ['DJ']
};

// On pose d'abord une valeur…
admin('admin.pays.save', { donnees: Object.assign({}, socle, {
  whatsappNumber: '25399887766', whatsappDisplay: '+253 99 88 77 66'
}) });
verifier('un champ renseigné est bien écrit',
  String(cellule('Pays', 'code', 'DJ', 'whatsappNumber')).replace(/^'/, ''), '25399887766');

// … puis on l'efface volontairement : la clé est présente, la valeur est vide.
admin('admin.pays.save', { donnees: Object.assign({}, socle, {
  whatsappNumber: '', whatsappDisplay: ''
}) });
verifier('un champ explicitement vidé est bien vidé',
  String(cellule('Pays', 'code', 'DJ', 'whatsappNumber') || ''), '');
verifier('les fuseaux renvoyés restent en place',
  cellule('Pays', 'code', 'DJ', 'fuseaux'), '["Africa/Djibouti"]');

// ------------------ 4. L'exemple doit respecter le format annoncé ------------------
/* En production, les Comores annoncent « 7 chiffres » et proposent en exemple
   « 380 46 48 » : le candidat qui recopie l'exemple est refusé. */

let refus = null;
try {
  const r = admin('admin.pays.save', { donnees: {
    code: 'KM', nom: 'Comores', devise: 'KMF', indicatif: '+269',
    motifTelephone: '^\\d{7}$', exempleTelephone: '380 46 48',
    longueurTelephone: 7, defaut: false, active: true, paymentMethods: [], ordre: 1
  } });
  refus = r.ok === false ? String(r.erreur || r.message || '') : null;
} catch (e) { refus = String(e.message); }

verifier('un exemple qui contredit le format annoncé est refusé', refus !== null, true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

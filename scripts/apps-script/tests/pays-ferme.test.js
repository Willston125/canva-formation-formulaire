/* Fermer un pays ne doit pas fermer le site.
 *
 * Le tableau de bord porte une case « Pays proposé à l'inscription ». La
 * décocher retire le pays de partout : du sélecteur du formulaire, des tarifs,
 * des sessions, des moyens de paiement. C'est voulu — on ouvre un marché à la
 * fois.
 *
 * LE DÉFAUT. Rien n'empêchait de décocher le DERNIER. Le site n'aurait alors
 * plus eu ni devise, ni format de numéro, ni moyen de paiement, et le
 * formulaire n'aurait proposé aucun choix. La SUPPRESSION d'un pays est déjà
 * refusée pour cette raison précise, avec un message qui l'explique ; la
 * désactivation produisait exactement le même résultat sans rien rencontrer.
 *
 * SECOND DÉFAUT. Un pays fermé restait « pays par défaut » : c'est lui que
 * voit un visiteur qui n'a rien choisi. La suppression passe déjà la main au
 * suivant ; la fermeture ne le faisait pas. */
'use strict';

const path = require('path');
process.env.GS_SOURCE = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
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

const pays = creerFeuille('Pays');
pays.appendRow(['code', 'nom', 'devise', 'indicatif', 'motifTelephone', 'exempleTelephone',
  'defaut', 'active', 'paymentMethods', 'ordre', 'whatsappNumber', 'fuseaux', 'regions']);
pays.appendRow(['DJ', 'Djibouti', 'FDJ', '+253', '^(77|67)\\d{6}$', '77XXXXXX',
  true, true, '[]', 0, "'25377145306", '["Africa/Djibouti"]', '["DJ"]']);
pays.appendRow(['KM', 'Comores', 'KMF', '+269', '^\\d{7}$', 'XXXXXXX',
  false, true, '[]', 1, "'2693804648", '["Indian/Comoro"]', '["KM"]']);

const lus = () => JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t).pays;
const unPays = code => lus().find(p => p.code === code) || {};

verifier('les deux pays sont ouverts au départ',
  lus().map(p => p.code + ':' + (p.active !== false ? 'ouvert' : 'ferme')), ['DJ:ouvert', 'KM:ouvert']);
verifier('et Djibouti est celui par défaut', unPays('DJ').defaut, true);

// --- 1. Fermer Djibouti passe, et la main avec -----------------------------

const fermeture = admin('admin.pays.save', { donnees: { code: 'DJ', nom: 'Djibouti',
  devise: 'FDJ', indicatif: '+253', active: false } });
verifier('fermer Djibouti est accepté', fermeture.ok, true);
verifier('Djibouti est bien fermé', unPays('DJ').active, false);
verifier('et il n’est plus le pays par défaut', unPays('DJ').defaut, false);

/* LE POINT QUI COMPTE : un visiteur qui n'a rien choisi doit tomber quelque
   part. Sans cette reprise, plus aucun pays n'était désigné. */
verifier('les Comores prennent la main par défaut', unPays('KM').defaut, true);
verifier('et restent ouvertes', unPays('KM').active, true);

/* Ce que le pays fermé garde : tout le reste. On le rouvrira sans avoir à
   ressaisir sa devise, son indicatif ni ses moyens de paiement. */
verifier('le pays fermé garde sa devise', unPays('DJ').devise, 'FDJ');
verifier('et son format de numéro', unPays('DJ').motifTelephone, '^(77|67)\\d{6}$');
verifier('et son numéro de contact', String(unPays('DJ').whatsappNumber), '25377145306');

// --- 2. Fermer le dernier est refusé --------------------------------------

const refus = admin('admin.pays.save', { donnees: { code: 'KM', nom: 'Comores',
  devise: 'KMF', indicatif: '+269', active: false } });
verifier('fermer le dernier pays ouvert est refusé', refus.ok === true, false);
verifier('et le message dit pourquoi',
  /dernier pays|devise|moyen de paiement/i.test(String(refus.erreur || '')), true);
verifier('les Comores sont restées ouvertes', unPays('KM').active, true);
verifier('et toujours par défaut', unPays('KM').defaut, true);

// --- 3. Une modification ordinaire ne déclenche rien ----------------------

/* La charge du formulaire ne porte pas toujours `active`. Le garde ne doit se
   lever que sur une FERMETURE explicite, sinon renommer un pays le fermerait. */
const renomme = admin('admin.pays.save', { donnees: { code: 'KM', nom: 'Union des Comores',
  devise: 'KMF', indicatif: '+269' } });
verifier('renommer le dernier pays reste possible', renomme.ok, true);
verifier('il garde son nouveau nom', unPays('KM').nom, 'Union des Comores');
verifier('et il reste ouvert', unPays('KM').active, true);

// --- 4. Rouvrir Djibouti ne lui rend pas la main de force -----------------

const reouverture = admin('admin.pays.save', { donnees: { code: 'DJ', nom: 'Djibouti',
  devise: 'FDJ', indicatif: '+253', active: true } });
verifier('rouvrir Djibouti est accepté', reouverture.ok, true);
verifier('il est de nouveau proposé', unPays('DJ').active, true);
/* Rouvrir n'est pas reprendre la main : le pays par défaut se choisit
   explicitement, sinon l'ordre des manipulations déciderait à la place. */
verifier('mais les Comores restent le pays par défaut', unPays('KM').defaut, true);
verifier('et Djibouti ne l’est pas redevenu', unPays('DJ').defaut, false);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

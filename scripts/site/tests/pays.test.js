/* Aucun pays dans ce que le site sert à tout le monde.

   Depuis le 9 octobre 2026, c'est le SERVEUR qui fixe le pays du visiteur
   (adresse IP, ou choix en bas de page) et qui ne lui envoie que l'offre de
   ce pays (api/_lib/marche.js, éprouvé par scripts/supabase/tests/marche.test.js).
   Cette épreuve garde l'autre moitié de la promesse : les pages et les scripts
   publics — les mêmes pour tous les visiteurs, de tous les pays — ne portent
   ni numéro, ni compte de paiement, ni tarif, ni lieu. Un seul oubli, et le
   numéro des Comores repartirait chez les visiteurs de Djibouti. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. Le fichier de données, chargé par toutes les pages -------------------

const site = { window: {} };
vm.runInNewContext(lire('formations-data.js'), site);
verifier('le fichier ne déclare aucun pays', (site.window.PAYS || []).length, 0);
verifier('aucune session', (site.window.SESSIONS || []).length, 0);
verifier('aucun tarif de formation',
  (site.window.FORMATIONS || []).filter(f => typeof f.price === 'number'
    || Object.values(f.prices || {}).some(v => typeof v === 'number')).map(f => f.formId), []);
verifier('aucun numéro dans le contact du site',
  Object.keys(site.window.SITE_CONTACT || {}).filter(c => /whatsapp|phone|tel/i.test(c)), []);
verifier('mais l’adresse e-mail, commune à tous, y est', !!(site.window.SITE_CONTACT || {}).contactEmail, true);

// --- 2. Les pages et les scripts publics --------------------------------------

const pagesGenerees = fs.readdirSync(path.join(RACINE, 'formations'))
  .filter(d => d !== '_template' && fs.existsSync(path.join(RACINE, 'formations', d, 'index.html')))
  .map(d => `formations/${d}/index.html`);
const PAGES = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html', '404.html',
  'inscription/index.html', 'formations/_template/fiche.html'].concat(pagesGenerees);
const SCRIPTS = ['formations-data.js', 'site-common.js', 'script.js', 'landing.js', 'fiche-blocs.js'];

/* Un numéro de téléphone ou de compte, sous toutes ses formes : avec indicatif,
   dans un lien wa.me, ou les numéros réellement en service. */
const NUMEROS = [
  /\+\s?(253|269)[\s\d]{6,}/g,
  /wa\.me\/\d+/g,
  /\b(25377145306|2693804648|11000012127|4866807)\b/g,
  /\b77\s?(14|55|47)\s?\d\d\s?\d\d\b/g,
  /\b(380|474)\s?\d\d\s?\d\d\b/g
];
const numerosDans = f => NUMEROS.flatMap(m => (lire(f).match(m) || []).map(x => `${f} : ${x.trim()}`));
verifier('aucun numéro de téléphone ni de compte dans les pages', PAGES.flatMap(numerosDans), []);
verifier('ni dans les scripts publics, commentaires compris', SCRIPTS.flatMap(numerosDans), []);

/* Ce qui ne vaut que pour UN pays, dans ce que la page montre. Les scripts en
   parlent dans leurs explications (« un Comorien lisait Saalam Tower ») : ce
   n'est pas une offre ; les pages, elles, n'en écrivent aucune. */
const D_UN_PAYS = /Waafi|Cacpay|Mvola|Saalam|American corner|\bFDJ\b|\bKMF\b/g;
verifier('aucun moyen de paiement, lieu ni devise d’un pays dans les pages',
  PAGES.flatMap(f => (lire(f).match(D_UN_PAYS) || []).map(x => `${f} : ${x}`)), []);

// --- 3. Le site ne devine plus le pays : il le reçoit ---------------------------

const commun = lire('site-common.js');
verifier('plus de devinette par le fuseau horaire du téléphone',
  /resolvedOptions\(\)\.timeZone/.test(commun), false);
verifier('plus de pays par défaut : sans réponse du serveur, aucun pays',
  /function paysActif\(\) \{\s*return MARCHE && MARCHE\.code \? trouverPays\(MARCHE\.code\) : null;/.test(commun), true);
verifier('un serveur injoignable laisse la page neutre, jamais sur un pays',
  /MARCHE = \{ code: null, nom: null, mode: null, source: 'indisponible' \};/.test(commun), true);
verifier('le choix du pied de page est transmis au serveur',
  /&marche=\$\{encodeURIComponent\(marcheDemande\)\}/.test(commun), true);
verifier('sans numéro, un lien de contact devient un e-mail, jamais un WhatsApp sans destinataire',
  /if \(numero\) return `https:\/\/wa\.me\/\$\{numero\}/.test(commun) && /mailto:\$\{adresse\}/.test(commun), true);

/* Un numéro glissé dans le champ « indicatif » produit un téléphone
   inutilisable : le tableau de bord doit le refuser. */
const essaisIndicatif = [['+269 380 46 48', false], ['269', false], ['+2 6 9', false], ['+269', true], ['+253', true]];
verifier('un indicatif mal saisi est reconnu comme tel',
  essaisIndicatif.filter(([v, valide]) => /^\+\d{1,4}$/.test(v) !== valide).map(([v]) => v), []);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

/* Simule l'installation sur un classeur VIERGE, comme sur un nouveau compte :
   aucun onglet, aucune donnée, puis reprise du catalogue depuis le fichier du
   site — exactement ce que fait le bouton « Importer le catalogue du site ». */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const CHEMIN_GS = require('path').resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac, classeur, appelsSheets } = require('./emulateur.js');

// Données du site, telles que le tableau de bord les enverrait
const site = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'formations-data.js'), 'utf8'), site);

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};
const poste = charge => JSON.parse(bac.doPost({ postData: { contents: JSON.stringify(
  Object.assign({ motDePasse: 'motdepasse-de-test' }, charge)) } })._t);

// --- Classeur vierge : aucun onglet ---
verifier('classeur vierge au départ', Object.keys(classeur.feuilles), []);

// --- Le site interroge l'API avant tout amorçage : il ne doit pas casser ---
const vide = JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);
verifier('catalogue vide : formations', vide.formations, []);
verifier('catalogue vide : pays', vide.pays, []);
verifier('version servie', JSON.parse(bac.doGet({ parameter: { action: 'version' } })._t).version,
  /^var VERSION = '(.+)';$/m.exec(fs.readFileSync(process.env.GS_SOURCE, 'utf8'))[1]);

// --- Amorçage : ce que fait « Importer le catalogue du site » ---
const envoi = {
  formations: site.window.FORMATIONS.map((f, i) => Object.assign({}, f, { ordre: i })),
  sessions: site.window.SESSIONS.map(s => Object.assign({}, s)),
  portfolio: site.window.PORTFOLIO.map((r, i) => Object.assign({}, r, { ordre: i })),
  pays: site.window.PAYS.map((p, i) => Object.assign({}, p, {
    paymentMethods: (p.paymentMethods || []).map(m => Object.assign({}, m)), ordre: i
  })),
  reglages: Object.assign({}, site.window.SITE_CONTACT, {
    defaultLocation: site.window.SESSIONS[0].location
  })
};
appelsSheets.total = 0;
const importe = poste({ action: 'admin.importer', donnees: envoi });
const coutImport = appelsSheets.total;
/* Les comptes se lisent dans le FICHIER, pas en dur : ouvrir un marché de plus
   ne doit pas faire échouer l'amorçage. Ce qu'on éprouve, c'est que tout ce qui
   est envoyé arrive — pas qu'il y en ait un nombre précis. */
verifier('import : formations', importe.formations, site.window.FORMATIONS.length);
verifier('import : sessions', importe.sessions, site.window.SESSIONS.length);
verifier('import : pays', importe.pays, site.window.PAYS.length);
verifier('import : realisations', importe.portfolio, site.window.PORTFOLIO.length);
/* Chaque operation Sheets est un aller-retour chez Google (~300 ms a froid).
   Au-dela d'une trentaine, l'amorcage depassait le delai d'attente du
   tableau de bord et paraissait n'avoir rien fait. */
verifier('import : cout en operations Sheets (<= 30)', coutImport <= 30, true);

// --- Relecture : c'est ce que le site affichera ---
const c = JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);
const canva = c.formations.find(f => f.formId === 'canva-pro');
const dj = c.pays.find(p => p.code === 'DJ');
const km = c.pays.find(p => p.code === 'KM');

verifier('onglets créés', Object.keys(classeur.feuilles).sort(),
  ['Formations', 'Images', 'Inscriptions', 'Pays', 'Portfolio', 'Reglages', 'Sessions', 'Textes']);
/* Les valeurs ne sont PAS écrites en dur, pour la même raison que les sessions
   plus bas : les formations du fichier sont réalignées sur la feuille par
   « npm run sync:formations », et un littéral ferait échouer cette épreuve à
   chaque tarif ou chaque acquis saisi dans le tableau de bord — un échec qui
   ne signalerait rien d'autre qu'une modification ordinaire. Ce qu'on éprouve,
   c'est que l'installation REPORTE ces champs, pas qu'ils vaillent ceci ou cela. */
const canvaFichier = site.window.FORMATIONS.find(f => f.formId === 'canva-pro');
verifier('la formation de référence est bien dans le fichier', !!canvaFichier, true);
verifier('formation : titre', canva.title, canvaFichier.title);
verifier('formation : tarifs par pays', canva.prices, canvaFichier.prices);
verifier('formation : acquis', canva.learnings.length, canvaFichier.learnings.length);
verifier('formation : objectifs', canva.objectives.length, canvaFichier.objectives.length);
verifier('formation : visible', canva.active, canvaFichier.active);
/* Contre-contrôles : des champs vides des deux côtés rendraient les contrôles
   ci-dessus vrais sans rien prouver. */
verifier('et ces champs portent bien quelque chose',
  [!!canvaFichier.title, Object.keys(canvaFichier.prices || {}).length > 0,
    (canvaFichier.learnings || []).length > 0, (canvaFichier.objectives || []).length > 0],
  [true, true, true, true]);
/* La valeur n'est PAS écrite en dur. Les sessions du fichier sont réalignées
   sur la feuille par « npm run sync:sessions », et un littéral ferait échouer
   cette épreuve à chaque changement de date ou de pays — un échec qui ne
   signalerait rien d'autre qu'une saisie ordinaire dans le tableau de bord.
   Ce qu'on éprouve ici, c'est que l'installation REPORTE le champ, pas qu'il
   vaille telle ou telle chose. */
verifier('session : pays repris du fichier',
  c.sessions[0].pays, site.window.SESSIONS[0].pays);
/* Contre-contrôle : un champ vide des deux côtés rendrait le contrôle
   ci-dessus vrai sans rien prouver. */
verifier('et ce champ porte bien un pays', /^[A-Z]{2}(,[A-Z]{2})*$/.test(site.window.SESSIONS[0].pays || ''), true);
verifier('session : places', c.sessions[0].placesTotal, 20);
verifier('pays DJ : indicatif intact', dj.indicatif, '+253');
verifier('pays DJ : format des numéros', dj.motifTelephone, '^(77|67)\\d{6}$');
verifier('pays DJ : moyens de paiement', dj.paymentMethods.map(m => m.value),
  ['Waafi Mobile Money', 'Cacpay', 'Espèces']);
verifier('pays DJ : numéro Waafi intact', dj.paymentMethods[0].number, '+253 77 55 63 44');
verifier('pays DJ : lieu des espèces', dj.paymentMethods[2].place, 'Saalam Tower, 5ème étage');
/* Le pays par défaut suit le marché ouvert, et cela change : Djibouti l'était,
   les Comores le sont depuis qu'on a fermé Djibouti pour ouvrir un marché à la
   fois. Un littéral ferait donc échouer cette épreuve à chaque décision
   commerciale. Ce qu'on éprouve, c'est que l'installation REPORTE ce drapeau. */
const defautDuFichier = site.window.PAYS.find(p => p.defaut === true);
verifier('un pays par défaut est déclaré dans le fichier', !!defautDuFichier, true);
verifier('l’installation le reporte',
  (c.pays.find(p => p.code === (defautDuFichier || {}).code) || {}).defaut, true);
/* Et un seul : deux valeurs par défaut rendraient l'affichage imprévisible. */
verifier('un seul pays par défaut après installation',
  c.pays.filter(p => p.defaut === true).length, 1);
verifier('pays KM : indicatif intact', km.indicatif, '+269');
verifier('pays KM : devise', km.devise, 'KMF');
verifier('pays KM : aucun moyen de paiement', km.paymentMethods, []);
verifier('réglages : numéro affiché intact', c.reglages.whatsappDisplay, '+253 77 14 53 06');
verifier('réglages : numéro WhatsApp', c.reglages.whatsappNumber, '25377145306');
verifier('compteur de places vierge', c.places, {});
verifier('realisations relues', c.portfolio.length, site.window.PORTFOLIO.length);
verifier('realisation : titre', c.portfolio[0].title, site.window.PORTFOLIO[0].title);
verifier('realisation : cadrage', c.portfolio[0].imagePosition, site.window.PORTFOLIO[0].imagePosition);
verifier('realisation sans visuel', c.portfolio.filter(r => !r.image).length, site.window.PORTFOLIO.filter(r => !r.image).length);

// --- Une inscription réelle sur ce classeur neuf ---
bac.doPost({ postData: { contents: JSON.stringify({
  dateInscription: '2026-09-16', formationId: 'canva-pro', formationTitle: 'Canva Pro',
  sessionId: 'canva-pro-2026-11', sessionLabel: '5 novembre 2026', sessionStartDate: '2026-11-05',
  nom: 'DUPONT', prenom: 'Awa', telephone: '77112233', telephoneInternational: '+25377112233',
  age: 27, profession: 'Étudiant', niveau: 'Jamais', objectifs: 'Freelance',
  motivation: 'Essai', modePaiement: 'Waafi Mobile Money', telPaiement: '77112233',
  montant: 7500, currency: 'FDJ', pays: 'Djibouti', paysCode: 'DJ', countryCode: '+253',
  statut: 'Confirmé', source: 'Site'
}) } });
const apres = JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);
verifier('inscription comptée', apres.places, { 'canva-pro-2026-11': 1 });
const fiche = poste({ action: 'admin.inscriptions' }).inscriptions[0];
verifier('inscription : téléphone international', fiche.telephoneInternational, '+25377112233');
verifier('inscription : pays', fiche.pays, 'Djibouti');
verifier('inscription : montant et devise', [fiche.montant, fiche.currency], [7500, 'FDJ']);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Installation neuve conforme');
process.exit(echecs ? 1 : 0);

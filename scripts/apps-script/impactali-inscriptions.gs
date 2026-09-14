/* =========================================================================
   IMPACTALI — Réception des inscriptions
   Script complet : enregistrement dans la feuille, alerte email avec lien
   WhatsApp de relance, et comptage des places pour le site.

   ⚠ À METTRE DANS UN PROJET APPS SCRIPT NEUF.
   Un projet ne peut avoir qu'un seul doPost : ne collez pas ce code dans le
   projet qui traite déjà les QCM étudiants, vous le casseriez.

   ---------------------------------------------------------------------------
   INSTALLATION

   1. Aller sur https://script.google.com → Nouveau projet
      Le nommer par exemple « IMPACTALI — Inscriptions ».
   2. Coller tout ce fichier à la place du contenu existant.
   3. Renseigner les trois constantes ci-dessous (classeur, onglet, email).
   4. Déployer → Nouveau déploiement → type « Application Web » :
         Exécuter en tant que  : Moi (votre adresse)
         Qui a accès           : Tout le monde
      Ces deux valeurs sont indispensables : la première donne au script le
      droit d'écrire dans le classeur, la seconde permet au site de l'appeler
      sans connexion Google. Autoriser l'accès à votre compte à la demande.
   5. Copier l'URL de l'application Web (elle finit par /exec) et la
      transmettre : elle doit remplacer celle de formations-data.js.
   6. Vérifier dans une fenêtre de navigation privée :
         https://VOTRE_URL/exec?action=places
      Réponse attendue : {"sessions":{}} tant qu'aucune inscription n'existe.

   À chaque modification du code : Déployer → Gérer les déploiements →
   crayon → Nouvelle version → Déployer. Sans nouvelle version, Google
   continue de servir l'ancienne.
   ========================================================================= */

// ----------------------------- CONFIGURATION -----------------------------

/**
 * Identifiant du classeur qui reçoit les inscriptions.
 * Il se lit dans l'URL du classeur, entre /d/ et /edit.
 * Laisser vide uniquement si ce script est créé depuis le classeur lui-même
 * (Extensions > Apps Script).
 */
var ID_CLASSEUR = '1zRlfDyfrolH9QEhYoBFzQFYur50cY9r7Raqz4m8r4Wk';

/** Onglet des inscriptions. Il est créé automatiquement s'il n'existe pas. */
var NOM_FEUILLE = 'Inscriptions';

/** Adresse professionnelle qui reçoit l'alerte. Plusieurs adresses : séparer par des virgules. */
var EMAIL_PRO = 'À REMPLIR@exemple.com';

/** Nom affiché comme expéditeur de l'alerte. */
var NOM_EXPEDITEUR = 'Inscriptions IMPACTALI';

/**
 * Statuts qui occupent une place dans le décompte du site.
 * null = toutes les inscriptions comptent, y compris celles en attente de paiement.
 * Pour ne compter que les inscriptions réglées : ['Confirmé', 'Payé']
 */
var STATUTS_COMPTES = null;

/* Colonnes de la feuille, dans l'ordre : [en-tête, clé envoyée par le site].
   L'en-tête « sessionId » sert au comptage des places : ne pas le renommer. */
var COLONNES = [
  ['Horodatage réception', null],
  ['dateInscription', 'dateInscription'],
  ['formationId', 'formationId'],
  ['formationTitle', 'formationTitle'],
  ['sessionId', 'sessionId'],
  ['sessionLabel', 'sessionLabel'],
  ['sessionStartDate', 'sessionStartDate'],
  ['nom', 'nom'],
  ['prenom', 'prenom'],
  ['telephone', 'telephone'],
  ['telephoneInternational', 'telephoneInternational'],
  ['email', 'email'],
  ['age', 'age'],
  ['profession', 'profession'],
  ['professionDetail', 'professionDetail'],
  ['niveau', 'niveau'],
  ['objectifs', 'objectifs'],
  ['motivation', 'motivation'],
  ['modePaiement', 'modePaiement'],
  ['telPaiement', 'telPaiement'],
  ['montant', 'montant'],
  ['currency', 'currency'],
  ['statut', 'statut'],
  ['source', 'source'],
  ['pageUrl', 'pageUrl'],
  ['JSON complet', null]
];

// ------------------------------ RÉCEPTION --------------------------------

/** Reçoit une inscription envoyée par le formulaire du site. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return repondre({ ok: false, erreur: 'requête vide' }, null);
    }
    var d = JSON.parse(e.postData.contents);

    enregistrer(d);

    // Une alerte email qui échoue ne doit jamais faire perdre l'inscription
    try { envoyerAlerte(d); } catch (err) { Logger.log('Alerte email : ' + err); }

    return repondre({ ok: true }, null);
  } catch (err) {
    Logger.log('doPost : ' + err);
    return repondre({ ok: false, erreur: String(err) }, null);
  }
}

/** Ajoute une ligne à la feuille, en créant l'onglet et les en-têtes au besoin. */
function enregistrer(d) {
  var feuille = feuilleInscriptions();
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(COLONNES.map(function (c) { return c[0]; }));
    feuille.setFrozenRows(1);
  }
  var ligne = COLONNES.map(function (c) {
    if (c[0] === 'Horodatage réception') return new Date();
    if (c[0] === 'JSON complet') return JSON.stringify(d);
    var valeur = d[c[1]];
    return valeur === undefined || valeur === null ? '' : valeur;
  });
  feuille.appendRow(ligne);
}

function feuilleInscriptions() {
  var classeur = ID_CLASSEUR ? SpreadsheetApp.openById(ID_CLASSEUR) : SpreadsheetApp.getActiveSpreadsheet();
  if (!classeur) throw new Error('classeur introuvable : vérifiez ID_CLASSEUR');
  return classeur.getSheetByName(NOM_FEUILLE) || classeur.insertSheet(NOM_FEUILLE);
}

// --------------------------- COMPTAGE DES PLACES -------------------------

/** Le site demande ici combien de personnes sont inscrites à chaque session. */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action !== 'places') {
    return repondre({ erreur: 'action inconnue' }, params.callback);
  }
  try {
    return repondre({ sessions: compterInscrits() }, params.callback);
  } catch (err) {
    return repondre({ erreur: String(err) }, params.callback);
  }
}

/** Compte les lignes par identifiant de session. Aucune donnée personnelle n'est renvoyée. */
function compterInscrits() {
  var feuille = feuilleInscriptions();
  var valeurs = feuille.getDataRange().getValues();
  if (valeurs.length < 2) return {};

  var entetes = valeurs[0].map(function (v) { return String(v).trim().toLowerCase(); });
  var colSession = entetes.indexOf('sessionid');
  var colStatut = entetes.indexOf('statut');
  if (colSession < 0) throw new Error('colonne sessionId introuvable');

  var compte = {};
  for (var i = 1; i < valeurs.length; i++) {
    var identifiant = String(valeurs[i][colSession] || '').trim();
    if (!identifiant) continue; // inscription sans session datée : n'occupe aucune place
    if (STATUTS_COMPTES && colStatut >= 0 &&
        STATUTS_COMPTES.indexOf(String(valeurs[i][colStatut] || '').trim()) === -1) continue;
    compte[identifiant] = (compte[identifiant] || 0) + 1;
  }
  return compte;
}

// ------------------------------ ALERTE EMAIL -----------------------------

/** Prévient l'adresse professionnelle, avec un lien WhatsApp prêt à envoyer. */
function envoyerAlerte(d) {
  if (!EMAIL_PRO || EMAIL_PRO.indexOf('À REMPLIR') === 0) return;

  var nomComplet = [d.nom, d.prenom].filter(Boolean).join(' ');
  var formation = d.formationTitle || d.formationId || 'Formation non précisée';
  var session = d.sessionLabel || (d.sessionId || 'Session non datée');

  var options = { name: NOM_EXPEDITEUR, htmlBody: corpsHtml(d, nomComplet, formation, session) };
  if (d.email && String(d.email).indexOf('@') > 0) options.replyTo = d.email;

  MailApp.sendEmail(
    EMAIL_PRO,
    'Nouvelle inscription · ' + formation + ' · ' + nomComplet,
    texteBrut(d, nomComplet, formation, session),
    options
  );
}

/** Numéro au format WhatsApp : chiffres uniquement, indicatif compris. */
function numeroWhatsapp(d) {
  return String(d.telephoneInternational || ((d.countryCode || '') + (d.telephone || ''))).replace(/\D/g, '');
}

function messageRelance(d, formation, session) {
  return 'Bonjour ' + (d.prenom || '') + ', ici IMPACTALI. Nous avons bien reçu votre inscription à la formation '
    + formation + (session && session !== 'Session non datée' ? ' (session du ' + session + ')' : '')
    + '. Pouvons-nous confirmer votre participation ?';
}

function lignesRecap(d, nomComplet, formation, session) {
  return [
    ['Formation', formation],
    ['Session', session],
    ['Nom et prénom', nomComplet],
    ['Téléphone', (d.countryCode || '') + ' ' + (d.telephone || '')],
    ['Email', d.email || '—'],
    ['Âge', d.age ? d.age + ' ans' : '—'],
    ['Profession', [d.profession, d.professionDetail].filter(Boolean).join(' · ') || '—'],
    ['Niveau', d.niveau || d.niveauCanva || '—'],
    ['Objectifs', d.objectifs || '—'],
    ['Motivation', d.motivation || '—'],
    ['Mode de paiement', d.modePaiement || '—'],
    ['Numéro de paiement', d.telPaiement || '—'],
    ['Montant', d.montant ? d.montant + ' ' + (d.currency || '') : '—'],
    ['Statut', d.statut || '—'],
    ['Origine', d.source || '—']
  ];
}

function texteBrut(d, nomComplet, formation, session) {
  var corps = lignesRecap(d, nomComplet, formation, session)
    .map(function (l) { return l[0] + ' : ' + l[1]; }).join('\n');
  return 'NOUVELLE INSCRIPTION\n\n' + corps + '\n\nRelancer sur WhatsApp :\nhttps://wa.me/'
    + numeroWhatsapp(d) + '?text=' + encodeURIComponent(messageRelance(d, formation, session));
}

function corpsHtml(d, nomComplet, formation, session) {
  var lien = 'https://wa.me/' + numeroWhatsapp(d) + '?text='
    + encodeURIComponent(messageRelance(d, formation, session));

  var rangs = lignesRecap(d, nomComplet, formation, session).map(function (l) {
    return '<tr><td style="padding:8px 14px;border-bottom:1px solid #e6e6e6;color:#5f6368;white-space:nowrap;vertical-align:top">'
      + echapper(l[0]) + '</td><td style="padding:8px 14px;border-bottom:1px solid #e6e6e6;color:#111;font-weight:600">'
      + echapper(l[1]) + '</td></tr>';
  }).join('');

  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">'
    + '<div style="background:#050709;padding:20px 24px;border-radius:12px 12px 0 0">'
    + '<p style="margin:0;color:#CBFD00;font-size:12px;letter-spacing:1px;font-weight:700">IMPACTALI</p>'
    + '<h1 style="margin:6px 0 0;color:#ffffff;font-size:20px">Nouvelle inscription</h1>'
    + '<p style="margin:6px 0 0;color:#9CA6B2;font-size:14px">' + echapper(formation) + ' — ' + echapper(session) + '</p>'
    + '</div><div style="border:1px solid #e6e6e6;border-top:0;border-radius:0 0 12px 12px;padding:8px 0 20px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rangs + '</table>'
    + '<div style="text-align:center;padding:22px 16px 4px">'
    + '<a href="' + lien + '" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;'
    + 'font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px">Relancer '
    + echapper(d.prenom || nomComplet) + ' sur WhatsApp</a>'
    + '<p style="margin:10px 0 0;color:#5f6368;font-size:12px">Le message de relance est déjà rédigé, il suffit de l’envoyer.</p>'
    + '</div></div></div>';
}

// -------------------------------- OUTILS ---------------------------------

/** JSON, ou JavaScript si le site a dû passer par un script (origine croisée bloquée). */
function repondre(donnees, callback) {
  var corps = JSON.stringify(donnees);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + corps + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(corps).setMimeType(ContentService.MimeType.JSON);
}

function echapper(valeur) {
  return String(valeur === null || valeur === undefined ? '' : valeur)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * À exécuter une fois depuis l'éditeur (menu ▶) pour vérifier l'installation :
 * écrit une inscription de test, envoie l'alerte, puis affiche le comptage.
 * Pensez à supprimer la ligne de test dans la feuille ensuite.
 */
function testerInstallation() {
  var essai = {
    dateInscription: new Date().toISOString(),
    formationId: 'canva-pro', formationTitle: 'Canva Pro & Création de contenu',
    sessionId: 'canva-pro-2026-11', sessionLabel: '5 novembre 2026', sessionStartDate: '2026-11-05',
    nom: 'TEST', prenom: 'A-SUPPRIMER', telephone: '77000000', telephoneInternational: '+25377000000',
    email: '', age: 30, profession: 'Étudiant', professionDetail: '', niveau: 'Jamais utilisé',
    objectifs: 'Test', motivation: 'Ligne de test technique, à supprimer.',
    modePaiement: 'Espèces', telPaiement: '', montant: 7500, currency: 'FDJ',
    statut: 'TEST', source: 'Test installation', pageUrl: ''
  };
  enregistrer(essai);
  try { envoyerAlerte(essai); Logger.log('Alerte email envoyée à ' + EMAIL_PRO); }
  catch (err) { Logger.log('Alerte email NON envoyée : ' + err); }
  Logger.log('Comptage des places : ' + JSON.stringify(compterInscrits()));
}

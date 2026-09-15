/* =========================================================================
   IMPACTALI — API du site et du tableau de bord
   Un seul script pour : recevoir les inscriptions, alerter par email,
   compter les places, et servir de base de données au tableau de bord /admin.

   ⚠ UN PROJET APPS SCRIPT NE PEUT AVOIR QU'UN SEUL doPost ET UN SEUL doGet.
   Ce fichier remplace intégralement le précédent. Ne le collez pas dans le
   projet qui traite les QCM étudiants.

   ---------------------------------------------------------------------------
   INSTALLATION / MISE À JOUR

   1. Ouvrir le projet Apps Script rattaché au classeur des inscriptions.
   2. Remplacer tout le contenu par ce fichier.
   3. Renseigner MOT_DE_PASSE_ADMIN ci-dessous (c'est le mot de passe du
      tableau de bord). Enregistrer.
   4. DÉCLARER LES PERMISSIONS — étape indispensable dès qu'on ajoute un
      service Google à un projet déjà autorisé : Apps Script conserve sinon les
      anciennes permissions et n'en redemande jamais, ce qui produit une erreur
      « You do not have permission to call DriveApp… ».
      Aller dans ⚙ Paramètres du projet, cocher « Afficher le fichier manifeste
      appsscript.json dans l'éditeur », ouvrir ce fichier et y recopier le
      contenu de scripts/apps-script/appsscript.json. Enregistrer.
   5. Lancer testerInstallation (menu déroulant du haut, puis ▶). Google demande
      alors l'autorisation, Drive compris. Le journal doit afficher
      « Autorisation Drive : accordée. »
   6. Déployer → Gérer les déploiements → crayon → Nouvelle version → Déployer.
      Sans nouvelle version, Google continue de servir l'ancienne.
      Conserver : Exécuter en tant que « Moi », Qui a accès « Tout le monde ».
   7. Vérifier : https://VOTRE_URL/exec?action=version doit répondre
      « drive: true ».

   Les onglets Formations, Sessions, Reglages et Inscriptions sont créés
   automatiquement au premier usage. Vous n'avez jamais à les ouvrir : tout
   se pilote depuis le tableau de bord du site.
   ========================================================================= */

// ----------------------------- CONFIGURATION -----------------------------

/**
 * Version de ce script. Le tableau de bord l'affiche : si le numéro qui y
 * apparaît ne correspond pas à celui-ci, c'est qu'une NOUVELLE VERSION du
 * déploiement n'a pas été publiée, et Google sert encore l'ancien code.
 * C'est l'erreur la plus fréquente, et la plus difficile à diagnostiquer.
 */
var VERSION = '2026-09-15-images';

/** Classeur. Vide = le classeur auquel ce script est rattaché (cas normal). */
var ID_CLASSEUR = '';

/** Onglets. Créés automatiquement s'ils n'existent pas. */
var F_INSCRIPTIONS = 'Inscriptions';
var F_FORMATIONS = 'Formations';
var F_SESSIONS = 'Sessions';
var F_REGLAGES = 'Reglages';
var F_TEXTES = 'Textes';

/** Adresse professionnelle qui reçoit l'alerte à chaque inscription. */
var EMAIL_PRO = 'infos@impactali.site';

/** Nom affiché comme expéditeur de l'alerte. */
var NOM_EXPEDITEUR = 'Inscriptions IMPACTALI';

/**
 * MOT DE PASSE DU TABLEAU DE BORD.
 * À changer impérativement. Il protège l'accès à /admin : modification du
 * catalogue, des tarifs, et consultation des coordonnées des candidats.
 * Choisissez une phrase longue, propre à ce site, jamais réutilisée ailleurs.
 */
var MOT_DE_PASSE_ADMIN = 'CHANGEZ-MOI-avant-de-deployer';

/**
 * Statuts qui occupent une place dans le décompte affiché sur le site.
 * null = toutes les inscriptions comptent, y compris celles en attente.
 */
var STATUTS_COMPTES = null;

/* Colonnes de l'onglet Inscriptions : [en-tête, clé envoyée par le site]. */
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

/* Champs d'une formation. `json` marque les champs stockés en JSON dans la
   cellule (listes et objets), `bool` et `num` les types à reconvertir. */
var CHAMPS_FORMATION = [
  ['id', 'texte'], ['slug', 'texte'], ['title', 'texte'], ['shortTitle', 'texte'],
  ['category', 'texte'], ['family', 'texte'], ['promise', 'texte'], ['shortDescription', 'texte'],
  ['image', 'texte'], ['imageAlt', 'texte'], ['duration', 'texte'], ['level', 'texte'],
  ['mode', 'texte'], ['price', 'num'], ['modules', 'num'], ['learnings', 'json'],
  ['featured', 'bool'], ['registrationOpen', 'bool'], ['active', 'bool'],
  ['allowRegistrationWithoutSession', 'bool'], ['hasDetailPage', 'bool'],
  ['href', 'texte'], ['formId', 'texte'], ['poster', 'texte'], ['lead', 'texte'],
  ['levelSubject', 'texte'], ['objectives', 'json'], ['ordre', 'num']
];

var CHAMPS_SESSION = [
  ['id', 'texte'], ['formId', 'texte'], ['startDate', 'texte'], ['endDate', 'texte'],
  ['schedule', 'texte'], ['duration', 'texte'], ['location', 'texte'], ['mode', 'texte'],
  ['price', 'num'], ['placesTotal', 'num'], ['placesAvailable', 'num'],
  ['registrationOpen', 'bool'], ['currency', 'texte']
];

// ------------------------------ ROUTAGE ----------------------------------

/**
 * Lectures. `action=places` et `action=catalogue` sont publiques : elles ne
 * renvoient aucune donnée personnelle. Tout le reste passe par doPost.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'places') return repondre({ sessions: compterInscrits() }, p.callback);
    if (p.action === 'catalogue') return repondre(lireCatalogue(), p.callback);
    /* Diagnostic : dit quelle version du script est réellement servie, et si
       l'autorisation Drive a été accordée. Ne révèle rien de sensible, et évite
       d'avoir à deviner pourquoi une nouveauté « ne marche pas ». */
    if (p.action === 'version') return repondre(etatDuScript(), p.callback);
    return repondre({ erreur: 'action inconnue' }, p.callback);
  } catch (err) {
    return repondre({ erreur: String(err) }, p.callback);
  }
}

/**
 * Écritures. Sans champ `action`, le corps est une inscription envoyée par le
 * formulaire public — c'est le comportement historique, préservé tel quel.
 * Avec un champ `action`, c'est une commande du tableau de bord, qui exige le
 * mot de passe.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return repondre({ ok: false, erreur: 'requête vide' }, null);
    }
    var d = JSON.parse(e.postData.contents);

    if (!d.action) return recevoirInscription(d);
    return commandeAdmin(d);
  } catch (err) {
    Logger.log('doPost : ' + err);
    return repondre({ ok: false, erreur: String(err) }, null);
  }
}

// --------------------------- FORMULAIRE PUBLIC ---------------------------

function recevoirInscription(d) {
  enregistrer(d);
  // Une alerte email qui échoue ne doit jamais faire perdre l'inscription
  try { envoyerAlerte(d); } catch (err) { Logger.log('Alerte email : ' + err); }
  return repondre({ ok: true }, null);
}

function enregistrer(d) {
  var feuille = onglet(F_INSCRIPTIONS);
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(COLONNES.map(function (c) { return c[0]; }));
    feuille.setFrozenRows(1);
  }
  feuille.appendRow(COLONNES.map(function (c) {
    if (c[0] === 'Horodatage réception') return new Date();
    if (c[0] === 'JSON complet') return JSON.stringify(d);
    var v = d[c[1]];
    return v === undefined || v === null ? '' : v;
  }));
}

// ------------------------- TABLEAU DE BORD (ADMIN) -----------------------

/** Toutes les commandes du tableau de bord passent ici. */
function commandeAdmin(d) {
  if (!verifierMotDePasse(d.motDePasse)) {
    Utilities.sleep(1200); // ralentit les tentatives répétées
    return repondre({ ok: false, erreur: 'Mot de passe incorrect.', authentification: false }, null);
  }

  // Une seule écriture à la fois : deux onglets ouverts ne doivent pas se marcher dessus
  var verrou = LockService.getScriptLock();
  try { verrou.waitLock(20000); }
  catch (err) { return repondre({ ok: false, erreur: 'Une autre modification est en cours, réessayez.' }, null); }

  try {
    switch (d.action) {
      case 'admin.login':        return repondre({ ok: true, version: VERSION, catalogue: lireCatalogue() }, null);
      case 'admin.catalogue':    return repondre({ ok: true, catalogue: lireCatalogue() }, null);
      case 'admin.formation.save':   return repondre(enregistrerFormation(d.donnees), null);
      case 'admin.formation.delete': return repondre(supprimerFormation(d.id), null);
      case 'admin.session.save':     return repondre(enregistrerSession(d.donnees), null);
      case 'admin.session.delete':   return repondre(supprimerSession(d.id), null);
      case 'admin.reglages.save':    return repondre(enregistrerReglages(d.donnees), null);
      case 'admin.textes.save':      return repondre(enregistrerTextes(d.donnees), null);
      case 'admin.inscriptions':     return repondre({ ok: true, inscriptions: lireInscriptions(d.formationId) }, null);
      case 'admin.inscription.statut': return repondre(changerStatut(d.ligne, d.statut), null);
      case 'admin.image.upload':     return repondre(televerserImage(d.donnees), null);
      case 'admin.image.delete':     return repondre(supprimerImage(d.url), null);
      case 'admin.importer':         return repondre(importerDepuisSite(d.donnees), null);
      default: return repondre({ ok: false, erreur: 'Commande inconnue : ' + d.action }, null);
    }
  } catch (err) {
    Logger.log('commandeAdmin ' + d.action + ' : ' + err);
    return repondre({ ok: false, erreur: String(err) }, null);
  } finally {
    verrou.releaseLock();
  }
}

/** Comparaison à durée constante, pour ne rien révéler par le temps de réponse. */
function verifierMotDePasse(saisi) {
  var attendu = String(MOT_DE_PASSE_ADMIN || '');
  saisi = String(saisi || '');
  if (!attendu || attendu === 'CHANGEZ-MOI-avant-de-deployer') {
    // Mot de passe non configuré : on refuse plutôt que d'ouvrir l'administration
    return false;
  }
  if (saisi.length !== attendu.length) return false;
  var diff = 0;
  for (var i = 0; i < attendu.length; i++) diff |= saisi.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

// ------------------------------ CATALOGUE --------------------------------

/**
 * Lecture publique : formations, sessions, réglages et nombre d'inscrits par
 * session. Aucune donnée personnelle : seulement des compteurs.
 * Le site n'a ainsi qu'un seul appel à faire au chargement.
 */
function lireCatalogue() {
  return {
    formations: lireTable(F_FORMATIONS, CHAMPS_FORMATION).sort(function (a, b) {
      return (typeof a.ordre === 'number' ? a.ordre : 999) - (typeof b.ordre === 'number' ? b.ordre : 999);
    }),
    sessions: lireTable(F_SESSIONS, CHAMPS_SESSION),
    reglages: lireReglages(),
    textes: lireTextes(),
    places: compterInscrits(),
    maj: new Date().toISOString()
  };
}

function lireTable(nom, champs) {
  var feuille = onglet(nom);
  var valeurs = feuille.getDataRange().getValues();
  if (valeurs.length < 2) return [];
  var entetes = valeurs[0].map(function (v) { return String(v).trim(); });
  var lignes = [];
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][0] || '').trim() === '') continue; // ligne sans identifiant : ignorée
    var o = {};
    for (var j = 0; j < champs.length; j++) {
      var col = entetes.indexOf(champs[j][0]);
      o[champs[j][0]] = col < 0 ? null : depuisCellule(valeurs[i][col], champs[j][1]);
    }
    lignes.push(o);
  }
  return lignes;
}

function depuisCellule(valeur, type) {
  if (valeur === '' || valeur === null || valeur === undefined) return type === 'json' ? [] : null;
  if (type === 'bool') return valeur === true || String(valeur).toLowerCase() === 'true' || String(valeur) === '1';
  if (type === 'num') { var n = Number(valeur); return isNaN(n) ? null : n; }
  if (type === 'json') { try { return JSON.parse(valeur); } catch (e) { return []; } }
  if (valeur instanceof Date) return Utilities.formatDate(valeur, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(valeur);
}

function versCellule(valeur, type) {
  if (valeur === undefined || valeur === null) return '';
  if (type === 'json') return JSON.stringify(valeur);
  if (type === 'bool') return valeur === true || valeur === 'true';
  return valeur;
}

/** Écrit ou remplace une ligne identifiée par sa première colonne. */
function ecrireLigne(nom, champs, donnees) {
  var feuille = onglet(nom);
  var entetes = champs.map(function (c) { return c[0]; });
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(entetes);
    feuille.setFrozenRows(1);
  }
  var ligne = champs.map(function (c) { return versCellule(donnees[c[0]], c[1]); });
  var valeurs = feuille.getDataRange().getValues();
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][0]).trim() === String(donnees.id).trim()) {
      feuille.getRange(i + 1, 1, 1, ligne.length).setValues([ligne]);
      return { ok: true, cree: false };
    }
  }
  feuille.appendRow(ligne);
  return { ok: true, cree: true };
}

function supprimerLigne(nom, id) {
  var feuille = onglet(nom);
  var valeurs = feuille.getDataRange().getValues();
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][0]).trim() === String(id).trim()) {
      feuille.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ------------------------------ FORMATIONS -------------------------------

function enregistrerFormation(f) {
  if (!f || !f.id) throw new Error('Identifiant de formation manquant.');
  if (!f.slug) throw new Error('Le lien (slug) est obligatoire.');
  if (!f.title) throw new Error('Le titre est obligatoire.');
  if (!/^[a-z0-9-]+$/.test(f.slug)) {
    throw new Error('Le lien ne peut contenir que des minuscules, des chiffres et des tirets.');
  }
  // Le slug doit rester unique : deux formations ne peuvent pas partager une URL
  var existantes = lireTable(F_FORMATIONS, CHAMPS_FORMATION);
  for (var i = 0; i < existantes.length; i++) {
    if (existantes[i].slug === f.slug && existantes[i].id !== f.id) {
      throw new Error('Le lien « ' + f.slug + ' » est déjà utilisé par une autre formation.');
    }
  }
  if (!f.formId) f.formId = f.slug;
  if (!f.href) f.href = '/formations/' + f.slug + '/';
  var r = ecrireLigne(F_FORMATIONS, CHAMPS_FORMATION, f);
  return { ok: true, cree: r.cree, catalogue: lireCatalogue() };
}

/** Une formation ayant des inscrits n'est jamais supprimée sans avertissement. */
function supprimerFormation(id) {
  if (!id) throw new Error('Identifiant manquant.');
  var formations = lireTable(F_FORMATIONS, CHAMPS_FORMATION);
  var cible = null;
  for (var i = 0; i < formations.length; i++) if (formations[i].id === id) cible = formations[i];
  if (!cible) throw new Error('Formation introuvable.');

  var inscrits = compterInscritsFormation(cible.formId);
  if (inscrits > 0) {
    throw new Error('Cette formation compte ' + inscrits + ' inscription(s). '
      + 'Désactivez-la plutôt que de la supprimer, pour ne pas perdre le lien avec ces candidats.');
  }
  var sessions = lireTable(F_SESSIONS, CHAMPS_SESSION).filter(function (s) { return s.formId === cible.formId; });
  for (var j = 0; j < sessions.length; j++) supprimerLigne(F_SESSIONS, sessions[j].id);

  // Les visuels de cette formation n'ont plus d'usage : ne pas les laisser dans Drive
  try { supprimerImage(cible.image); supprimerImage(cible.poster); } catch (err) { }

  supprimerLigne(F_FORMATIONS, id);
  return { ok: true, sessionsSupprimees: sessions.length, catalogue: lireCatalogue() };
}

// ------------------------------- SESSIONS --------------------------------

function enregistrerSession(s) {
  if (!s || !s.id) throw new Error('Identifiant de session manquant.');
  if (!s.formId) throw new Error('La session doit être rattachée à une formation.');
  if (!s.startDate) throw new Error('La date de début est obligatoire.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) throw new Error('Date de début invalide.');
  if (s.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.endDate)) throw new Error('Date de fin invalide.');
  if (s.endDate && s.endDate < s.startDate) throw new Error('La date de fin précède la date de début.');

  var formations = lireTable(F_FORMATIONS, CHAMPS_FORMATION);
  var connue = false;
  for (var i = 0; i < formations.length; i++) if (formations[i].formId === s.formId) connue = true;
  if (!connue) throw new Error('Formation « ' + s.formId + ' » inconnue.');

  if (typeof s.placesTotal === 'number' && typeof s.placesAvailable === 'number'
      && s.placesAvailable > s.placesTotal) {
    throw new Error('Les places disponibles dépassent le total.');
  }
  var r = ecrireLigne(F_SESSIONS, CHAMPS_SESSION, s);
  return { ok: true, cree: r.cree, catalogue: lireCatalogue() };
}

function supprimerSession(id) {
  if (!id) throw new Error('Identifiant manquant.');
  var inscrits = (compterInscrits()[id] || 0);
  if (inscrits > 0) {
    throw new Error('Cette session compte ' + inscrits + ' inscrit(s). '
      + 'Fermez les inscriptions plutôt que de la supprimer.');
  }
  if (!supprimerLigne(F_SESSIONS, id)) throw new Error('Session introuvable.');
  return { ok: true, catalogue: lireCatalogue() };
}

// ------------------------------- RÉGLAGES --------------------------------

/** Réglages du site : paires clé / valeur, valeur JSON autorisée. */
function lireReglages() { return lirePaires(F_REGLAGES); }

/** Textes de l'accueil modifiés depuis le tableau de bord. */
function lireTextes() { return lirePaires(F_TEXTES); }

/** Lecture générique d'un onglet « clé / valeur ». */
function lirePaires(nom) {
  var feuille = onglet(nom);
  var valeurs = feuille.getDataRange().getValues();
  var o = {};
  for (var i = 1; i < valeurs.length; i++) {
    var cle = String(valeurs[i][0] || '').trim();
    if (!cle) continue;
    o[cle] = valeurReglage(valeurs[i][1]);
  }
  return o;
}

/**
 * Interprète une valeur de réglage sans la dénaturer.
 * Un numéro comme « 25377145306 » ou « 077... » doit rester une chaîne :
 * le convertir en nombre perdrait un zéro initial et casserait les liens WhatsApp.
 * Seules les vraies structures JSON (objet, liste, chaîne entre guillemets) sont décodées.
 */
function valeurReglage(brut) {
  if (brut === '' || brut === null || brut === undefined) return null;
  if (typeof brut !== 'string') return brut;
  var t = brut.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t.charAt(0) === '{' || t.charAt(0) === '[' || t.charAt(0) === '"') {
    try { return JSON.parse(t); } catch (e) { return brut; }
  }
  return brut;
}

function enregistrerReglages(donnees) {
  ecrirePaires(F_REGLAGES, donnees, 'Réglages invalides.');
  return { ok: true, catalogue: lireCatalogue() };
}

/**
 * Textes de l'accueil. Une valeur vide REMET le texte d'origine : la ligne est
 * effacée, et la page réaffiche ce qui est écrit dans son HTML. C'est le moyen
 * d'annuler une modification sans avoir à retrouver le texte initial.
 */
function enregistrerTextes(donnees) {
  ecrirePaires(F_TEXTES, donnees, 'Textes invalides.');
  return { ok: true, catalogue: lireCatalogue() };
}

/** Écriture générique dans un onglet « clé / valeur ». */
function ecrirePaires(nom, donnees, messageErreur) {
  if (!donnees || typeof donnees !== 'object') throw new Error(messageErreur);
  var feuille = onglet(nom);
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(['cle', 'valeur']);
    feuille.setFrozenRows(1);
  }
  Object.keys(donnees).forEach(function (cle) {
    var brut = donnees[cle];
    var vide = brut === null || brut === undefined || String(brut).trim() === '';
    var valeur = typeof brut === 'string' ? brut : JSON.stringify(brut);
    // On relit à chaque tour : une suppression de ligne décale les suivantes
    var valeurs = feuille.getDataRange().getValues();
    var trouve = false;
    for (var i = 1; i < valeurs.length; i++) {
      if (String(valeurs[i][0]).trim() !== cle) continue;
      trouve = true;
      if (vide) feuille.deleteRow(i + 1);
      else feuille.getRange(i + 1, 2).setValue(valeur);
      break;
    }
    if (!trouve && !vide) feuille.appendRow([cle, valeur]);
  });
}

// ----------------------------- INSCRIPTIONS ------------------------------

/** Réservé au tableau de bord : contient des données personnelles. */
function lireInscriptions(formationId) {
  var feuille = onglet(F_INSCRIPTIONS);
  var valeurs = feuille.getDataRange().getValues();
  if (valeurs.length < 2) return [];
  var entetes = valeurs[0].map(function (v) { return String(v).trim(); });
  var lignes = [];
  for (var i = valeurs.length - 1; i >= 1; i--) { // les plus récentes d'abord
    var o = { ligne: i + 1 };
    for (var j = 0; j < entetes.length; j++) {
      if (entetes[j] === 'JSON complet') continue;
      var v = valeurs[i][j];
      o[entetes[j]] = v instanceof Date ? v.toISOString() : v;
    }
    if (formationId && o.formationId !== formationId) continue;
    lignes.push(o);
    if (lignes.length >= 500) break; // garde-fou : on ne renvoie jamais un tableau illimité
  }
  return lignes;
}

function changerStatut(ligne, statut) {
  if (!ligne || ligne < 2) throw new Error('Ligne invalide.');
  var feuille = onglet(F_INSCRIPTIONS);
  var entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0]
    .map(function (v) { return String(v).trim(); });
  var col = entetes.indexOf('statut');
  if (col < 0) throw new Error('Colonne statut introuvable.');
  feuille.getRange(ligne, col + 1).setValue(statut);
  return { ok: true };
}

function compterInscrits() {
  var feuille = onglet(F_INSCRIPTIONS);
  var valeurs = feuille.getDataRange().getValues();
  if (valeurs.length < 2) return {};
  var entetes = valeurs[0].map(function (v) { return String(v).trim().toLowerCase(); });
  var colSession = entetes.indexOf('sessionid');
  var colStatut = entetes.indexOf('statut');
  if (colSession < 0) return {};
  var compte = {};
  for (var i = 1; i < valeurs.length; i++) {
    var id = String(valeurs[i][colSession] || '').trim();
    if (!id) continue;
    if (STATUTS_COMPTES && colStatut >= 0 &&
        STATUTS_COMPTES.indexOf(String(valeurs[i][colStatut] || '').trim()) === -1) continue;
    compte[id] = (compte[id] || 0) + 1;
  }
  return compte;
}

function compterInscritsFormation(formId) {
  var feuille = onglet(F_INSCRIPTIONS);
  var valeurs = feuille.getDataRange().getValues();
  if (valeurs.length < 2) return 0;
  var entetes = valeurs[0].map(function (v) { return String(v).trim().toLowerCase(); });
  var col = entetes.indexOf('formationid');
  if (col < 0) return 0;
  var n = 0;
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][col] || '').trim() === String(formId).trim()) n++;
  }
  return n;
}

// ------------------------------- IMAGES ----------------------------------

/**
 * Le site est statique : il ne peut pas recevoir de fichier. Les visuels
 * téléversés depuis le tableau de bord sont donc déposés dans un dossier Drive
 * et partagés en lecture, puis référencés par leur adresse.
 *
 * Le navigateur redimensionne et compresse AVANT d'envoyer : ce qui arrive ici
 * pèse quelques centaines de kilooctets, jamais la photo brute d'un téléphone.
 */
var NOM_DOSSIER_IMAGES = 'IMPACTALI — Images du site';
var TYPES_IMAGE = ['image/webp', 'image/jpeg', 'image/png'];
/* Le navigateur redimensionne et compresse avant d'envoyer : au-delà de ce
   poids, quelque chose ne s'est pas passé comme prévu. */
var POIDS_MAX = 1.5 * 1024 * 1024;

/**
 * Dossier de dépôt. L'identifiant est mémorisé : chercher par nom retrouverait
 * aussi un dossier MIS À LA CORBEILLE, et les images y seraient déposées pour
 * être définitivement effacées trente jours plus tard, sans le moindre message.
 */
function dossierImages() {
  var proprietes = PropertiesService.getScriptProperties();
  var id = proprietes.getProperty('dossierImages');

  if (id) {
    try {
      var connu = DriveApp.getFolderById(id);
      if (!connu.isTrashed()) return connu;
    } catch (err) { /* dossier disparu : on en refait un */ }
  }

  /* Recherche par nom : elle explore tout le Drive, ce que la permission
     restreinte « fichiers créés par l'application » n'autorise pas. On l'essaie
     sans en dépendre — un dossier oublié est ainsi retrouvé quand c'est
     possible, sans exiger un accès à l'ensemble des documents de l'utilisateur. */
  try {
    var it = DriveApp.getFoldersByName(NOM_DOSSIER_IMAGES);
    while (it.hasNext()) {
      var trouve = it.next();
      if (trouve.isTrashed()) continue;
      proprietes.setProperty('dossierImages', trouve.getId());
      return trouve;
    }
  } catch (err) { /* permission restreinte : on crée notre propre dossier */ }

  var neuf = DriveApp.createFolder(NOM_DOSSIER_IMAGES);
  proprietes.setProperty('dossierImages', neuf.getId());
  return neuf;
}

function televerserImage(d) {
  if (!d || !d.base64) throw new Error('Aucune image reçue.');
  var type = d.type || 'image/webp';
  if (TYPES_IMAGE.indexOf(type) < 0) throw new Error('Format d’image non accepté.');

  /* Le poids est contrôlé AVANT le décodage : vérifier après aurait déjà
     consommé la mémoire que le garde-fou est censé protéger. */
  var poidsEstime = Math.floor(String(d.base64).length * 3 / 4);
  if (poidsEstime > POIDS_MAX) {
    throw new Error('Image trop lourde (' + Math.round(poidsEstime / 1024) + ' Ko pour '
      + Math.round(POIDS_MAX / 1024) + ' Ko autorisés).');
  }

  var octets = Utilities.base64Decode(d.base64);
  var extension = type === 'image/jpeg' ? '.jpg' : (type === 'image/png' ? '.png' : '.webp');
  var nom = (d.nom || 'image').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40)
    + '-' + new Date().getTime() + extension;

  var fichier = dossierImages().createFile(Utilities.newBlob(octets, type, nom));
  fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  /* Chaque téléversement crée un NOUVEAU fichier, donc une nouvelle adresse :
     un visuel remplacé s'affiche immédiatement, sans que le cache du navigateur
     ou de Google ne serve encore l'ancien.

     Le suffixe demande à Google la largeur utile et une sortie WebP : l'image
     servie pèse environ moitié moins que l'originale. */
  var largeur = d.format === 'image' ? 760 : 1200;
  return {
    ok: true,
    url: urlImageDrive(fichier.getId(), largeur),
    secours: 'https://drive.google.com/thumbnail?id=' + fichier.getId() + '&sz=w' + largeur,
    id: fichier.getId(),
    poids: octets.length
  };
}

/**
 * État du script tel qu'il est RÉELLEMENT déployé.
 * `drive` vaut false tant que l'autorisation n'a pas été accordée : c'est le
 * seul moyen fiable de le savoir sans tenter un vrai téléversement.
 */
function etatDuScript() {
  var drive = false, detail = '';
  try {
    dossierImages();
    drive = true;
  } catch (err) {
    detail = String(err).slice(0, 120);
  }
  return {
    version: VERSION,
    drive: drive,
    driveDetail: detail,
    motDePasseConfigure: MOT_DE_PASSE_ADMIN !== 'CHANGEZ-MOI-avant-de-deployer' && !!MOT_DE_PASSE_ADMIN,
    email: EMAIL_PRO
  };
}

/**
 * Seule forme d'adresse qui s'affiche dans une balise <img> d'un autre domaine.
 * Les anciennes formes « uc?export=view » sont refusées par Google depuis 2024
 * dès que la requête vient d'un autre site — alors qu'elles s'ouvrent
 * normalement dans la barre d'adresse, ce qui rend la panne invisible à qui
 * la vérifie ainsi.
 */
function urlImageDrive(id, largeur) {
  return 'https://lh3.googleusercontent.com/d/' + id + '=w' + (largeur || 1200) + '-rw';
}

/** Retire un visuel remplacé, pour ne pas accumuler de fichiers orphelins. */
function supprimerImage(url) {
  var id = identifiantDrive(url);
  if (!id) return { ok: true, supprime: false };
  try {
    DriveApp.getFileById(id).setTrashed(true);
    return { ok: true, supprime: true };
  } catch (err) {
    // Fichier déjà absent ou hors de notre portée : sans conséquence
    return { ok: true, supprime: false };
  }
}

function identifiantDrive(url) {
  var t = String(url || '');
  var m = t.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]{20,})/)
    || t.match(/[?&]id=([A-Za-z0-9_-]{20,})/)
    || t.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// ------------------------------- IMPORT ----------------------------------

/**
 * Reprise initiale : le tableau de bord envoie le catalogue actuel du site
 * pour amorcer la base. N'écrase que ce qui est envoyé.
 */
function importerDepuisSite(donnees) {
  if (!donnees) throw new Error('Rien à importer.');
  var nbF = 0, nbS = 0;
  (donnees.formations || []).forEach(function (f, i) {
    if (typeof f.ordre !== 'number') f.ordre = i;
    ecrireLigne(F_FORMATIONS, CHAMPS_FORMATION, f);
    nbF++;
  });
  (donnees.sessions || []).forEach(function (s) {
    ecrireLigne(F_SESSIONS, CHAMPS_SESSION, s);
    nbS++;
  });
  if (donnees.reglages) enregistrerReglages(donnees.reglages);
  return { ok: true, formations: nbF, sessions: nbS, catalogue: lireCatalogue() };
}

// ------------------------------ ALERTE EMAIL -----------------------------

function envoyerAlerte(d) {
  if (!EMAIL_PRO || EMAIL_PRO.indexOf('À REMPLIR') === 0) return;
  var nomComplet = [d.nom, d.prenom].filter(Boolean).join(' ');
  var formation = d.formationTitle || d.formationId || 'Formation non précisée';
  var session = d.sessionLabel || (d.sessionId || 'Session non datée');
  var options = { name: NOM_EXPEDITEUR, htmlBody: corpsHtml(d, nomComplet, formation, session) };
  if (d.email && String(d.email).indexOf('@') > 0) options.replyTo = d.email;
  MailApp.sendEmail(EMAIL_PRO, 'Nouvelle inscription · ' + formation + ' · ' + nomComplet,
    texteBrut(d, nomComplet, formation, session), options);
}

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
    ['Formation', formation], ['Session', session], ['Nom et prénom', nomComplet],
    ['Téléphone', (d.countryCode || '') + ' ' + (d.telephone || '')], ['Email', d.email || '—'],
    ['Âge', d.age ? d.age + ' ans' : '—'],
    ['Profession', [d.profession, d.professionDetail].filter(Boolean).join(' · ') || '—'],
    ['Niveau', d.niveau || d.niveauCanva || '—'], ['Objectifs', d.objectifs || '—'],
    ['Motivation', d.motivation || '—'], ['Mode de paiement', d.modePaiement || '—'],
    ['Numéro de paiement', d.telPaiement || '—'],
    ['Montant', d.montant ? d.montant + ' ' + (d.currency || '') : '—'],
    ['Statut', d.statut || '—'], ['Origine', d.source || '—']
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

function classeur() {
  var c = ID_CLASSEUR ? SpreadsheetApp.openById(ID_CLASSEUR) : SpreadsheetApp.getActiveSpreadsheet();
  if (!c) throw new Error('Classeur introuvable : vérifiez ID_CLASSEUR.');
  return c;
}

function onglet(nom) {
  var c = classeur();
  return c.getSheetByName(nom) || c.insertSheet(nom);
}

/** JSON, ou JavaScript si le site a dû passer par un script (origine croisée bloquée). */
function repondre(donnees, callback) {
  var corps = JSON.stringify(donnees);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + corps + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(corps).setMimeType(ContentService.MimeType.JSON);
}

function echapper(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * À exécuter une fois depuis l'éditeur (menu ▶) pour vérifier l'installation :
 * crée les onglets, écrit une inscription de test, envoie l'alerte, affiche le
 * comptage. Pensez à supprimer la ligne de test ensuite depuis le tableau de bord.
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
  Logger.log('Comptage : ' + JSON.stringify(compterInscrits()));
  Logger.log('Mot de passe configuré : ' + (verifierMotDePasse(MOT_DE_PASSE_ADMIN) ? 'oui' : 'NON — changez MOT_DE_PASSE_ADMIN'));

  /* Touche Drive volontairement : c'est ce qui déclenche l'écran d'autorisation.
     Sans cette exécution préalable, le premier téléversement depuis le tableau
     de bord échouerait, Google n'ayant jamais demandé le consentement. */
  try {
    var dossier = dossierImages();
    Logger.log('Dossier des images : ' + dossier.getName() + ' (' + dossier.getId() + ')');
    Logger.log('Autorisation Drive : accordée.');
  } catch (err) {
    Logger.log('Autorisation Drive NON accordée : ' + err);
  }
  Logger.log('Version du script : ' + VERSION);
}

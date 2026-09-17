/* =========================================================================
   IMPACTALI — API du site et du tableau de bord
   Un seul script pour : recevoir les inscriptions, alerter par email,
   compter les places, et servir de base de données au tableau de bord /admin.

   ⚠ UN PROJET APPS SCRIPT NE PEUT AVOIR QU'UN SEUL doPost ET UN SEUL doGet.
   Ce fichier remplace intégralement le précédent. Ne le collez pas dans le
   projet qui traite les QCM étudiants.

   ---------------------------------------------------------------------------
   PREMIÈRE INSTALLATION (nouveau compte Google, nouveau classeur)

   A. Depuis le compte qui hébergera le site, créer un classeur Google Sheets
      vide, nommé par exemple « IMPACTALI — Base du site ». N'y créer aucun
      onglet : le script les crée lui-même au premier usage.
   B. Dans ce classeur : Extensions → Apps Script. Un projet vide s'ouvre,
      déjà rattaché au classeur — c'est ce rattachement qui permet de laisser
      ID_CLASSEUR vide ci-dessous.
   C. Poursuivre à l'étape 2 ci-dessous.
   D. Une fois déployé, reporter l'adresse /exec obtenue dans
      `window.SITE_ENDPOINTS.registration` (fichier formations-data.js), puis
      publier le site. Enfin, ouvrir /admin et, dans la vue d'ensemble,
      « Importer le catalogue du site » : la base est amorcée.

   Compte : préférer un compte Google personnel. Un compte Workspace peut
   interdire par politique la publication « accessible à tout le monde », ce
   qui empêcherait le site d'écrire les inscriptions.

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
   6. Déployer.
      • Première fois : Déployer → Nouveau déploiement → type « Application web ».
        Exécuter en tant que « Moi », Qui a accès « Tout le monde ». Copier
        l'adresse /exec obtenue : c'est elle que le site appellera.
      • Par la suite : Déployer → Gérer les déploiements → crayon →
        Version : NOUVELLE VERSION → Déployer. Sans nouvelle version, Google
        continue de servir l'ancien code, sans le moindre avertissement.
        N'utilisez pas « Nouveau déploiement » pour une mise à jour : il crée
        une AUTRE adresse, et le site continuerait d'appeler la précédente.
   7. Vérifier : https://VOTRE_URL/exec?action=version doit répondre avec le
      numéro de VERSION ci-dessous et « drive: true ».

   Les onglets Formations, Sessions, Pays, Portfolio, Reglages et Inscriptions sont créés
   automatiquement au premier usage, et les colonnes ajoutées par une mise à
   jour apparaissent d'elles-mêmes dans un classeur déjà rempli. Vous n'avez
   jamais à les ouvrir : tout se pilote depuis le tableau de bord du site.
   ========================================================================= */

// ----------------------------- CONFIGURATION -----------------------------

/**
 * Version de ce script. Le tableau de bord l'affiche : si le numéro qui y
 * apparaît ne correspond pas à celui-ci, c'est qu'une NOUVELLE VERSION du
 * déploiement n'a pas été publiée, et Google sert encore l'ancien code.
 * C'est l'erreur la plus fréquente, et la plus difficile à diagnostiquer.
 */
var VERSION = '2026-09-17-contact-pays';

/** Classeur. Vide = le classeur auquel ce script est rattaché (cas normal). */
var ID_CLASSEUR = '';

/** Onglets. Créés automatiquement s'ils n'existent pas. */
var F_INSCRIPTIONS = 'Inscriptions';
var F_FORMATIONS = 'Formations';
var F_SESSIONS = 'Sessions';
var F_REGLAGES = 'Reglages';
var F_TEXTES = 'Textes';
var F_PAYS = 'Pays';
var F_PORTFOLIO = 'Portfolio';

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
  ['pays', 'pays'],
  ['paysCode', 'paysCode'],
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
  ['mode', 'texte'], ['price', 'num'], ['prices', 'json'], ['modules', 'num'], ['learnings', 'json'],
  ['featured', 'bool'], ['registrationOpen', 'bool'], ['active', 'bool'],
  ['allowRegistrationWithoutSession', 'bool'], ['hasDetailPage', 'bool'],
  ['href', 'texte'], ['formId', 'texte'], ['poster', 'texte'], ['lead', 'texte'],
  ['levelSubject', 'texte'], ['objectives', 'json'], ['ordre', 'num'],
  ['programme', 'json'], ['faq', 'json']
];

var CHAMPS_SESSION = [
  ['id', 'texte'], ['formId', 'texte'], ['startDate', 'texte'], ['endDate', 'texte'],
  ['schedule', 'texte'], ['duration', 'texte'], ['location', 'texte'], ['mode', 'texte'],
  ['price', 'num'], ['placesTotal', 'num'], ['placesAvailable', 'num'],
  ['registrationOpen', 'bool'], ['currency', 'texte'], ['pays', 'texte']
];

/**
 * Pays desservis : devise, indicatif, format des numéros et moyens de paiement.
 * Les tarifs, eux, restent sur la formation (colonne `prices`), un même pays
 * n'ayant pas le même prix d'un programme à l'autre.
 */
var CHAMPS_PAYS = [
  ['code', 'texte'], ['nom', 'texte'], ['devise', 'texte'], ['indicatif', 'texte'],
  ['motifTelephone', 'texte'], ['aideTelephone', 'texte'], ['exempleTelephone', 'texte'],
  ['longueurTelephone', 'num'], ['defaut', 'bool'], ['active', 'bool'],
  ['paymentMethods', 'json'], ['ordre', 'num'],
  /* Contact propre au pays, et indices qui permettent au site de reconnaître
     d'où vient le visiteur sans interroger le moindre service extérieur. */
  ['whatsappNumber', 'texte'], ['whatsappDisplay', 'texte'],
  ['fuseaux', 'json'], ['regions', 'json']
];

/**
 * Réalisations affichées sur l'accueil. Sans visuel, l'emplacement s'annonce
 * « à fournir » plutôt que de laisser un cadre vide sans explication.
 */
var CHAMPS_PORTFOLIO = [
  ['id', 'texte'], ['category', 'texte'], ['title', 'texte'], ['description', 'texte'],
  ['image', 'texte'], ['imageAlt', 'texte'], ['imagePosition', 'texte'],
  ['href', 'texte'], ['ordre', 'num']
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
  /* Les colonnes ajoutées après coup (le pays, par exemple) sont créées dans les
     classeurs existants, et chaque valeur est écrite sous SON en-tête. */
  var entetes = assurerEntetes(feuille, COLONNES.map(function (c) { return c[0]; }));
  feuille.appendRow(entetes.map(function (entete) {
    if (entete === 'Horodatage réception') return new Date();
    if (entete === 'JSON complet') return JSON.stringify(d);
    for (var j = 0; j < COLONNES.length; j++) {
      if (COLONNES[j][0] !== entete) continue;
      var v = d[COLONNES[j][1]];
      return v === undefined || v === null ? '' : protegerFormule(v);
    }
    return '';
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
      case 'admin.pays.save':        return repondre(enregistrerPays(d.donnees), null);
      case 'admin.pays.delete':      return repondre(supprimerPays(d.code), null);
      case 'admin.portfolio.save':   return repondre(enregistrerRealisation(d.donnees), null);
      case 'admin.portfolio.delete': return repondre(supprimerRealisation(d.id), null);
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
    pays: lireTable(F_PAYS, CHAMPS_PAYS).sort(function (a, b) {
      return (typeof a.ordre === 'number' ? a.ordre : 999) - (typeof b.ordre === 'number' ? b.ordre : 999);
    }),
    portfolio: lireTable(F_PORTFOLIO, CHAMPS_PORTFOLIO).sort(function (a, b) {
      return (typeof a.ordre === 'number' ? a.ordre : 999) - (typeof b.ordre === 'number' ? b.ordre : 999);
    }),
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
  return protegerFormule(valeur);
}

/**
 * Google Sheets traite une valeur écrite dans une cellule comme si elle avait
 * été SAISIE : une chaîne commençant par « = », « + » ou « - » devient donc une
 * FORMULE. C'est ainsi que l'indicatif « +253 » s'était transformé en nombre 253
 * et « +253 77 14 53 06 » en #ERROR! — sans le moindre message, et avec des
 * conséquences invisibles jusqu'à ce qu'on relise la valeur.
 *
 * L'apostrophe initiale force le texte. Sheets ne la restitue pas à la lecture :
 * la valeur relue est exactement celle qu'on a écrite.
 */
function protegerFormule(valeur) {
  if (typeof valeur !== 'string' || valeur === '') return valeur;
  return /^[=+\-@]/.test(valeur) ? "'" + valeur : valeur;
}

/**
 * Réglages : TOUTE valeur est écrite en texte, pas seulement celles qui
 * ressemblent à une formule. Un numéro comme « 25377145306 » revenait sinon en
 * NOMBRE, et un jour une suite de chiffres plus longue y perdrait ses
 * dernières décimales — ou un zéro initial disparaîtrait. Sheets n'affiche pas
 * l'apostrophe et ne la restitue pas à la lecture.
 */
function forcerTexte(valeur) {
  if (typeof valeur !== 'string' || valeur === '') return valeur;
  return "'" + valeur;
}

/**
 * Garantit qu'un onglet possède une colonne pour chacun des noms demandés, et
 * renvoie l'ordre réel de ses en-têtes.
 *
 * Sans cela, ajouter un champ au script casserait les classeurs déjà remplis :
 * l'écriture se fait par position, la lecture par nom d'en-tête. Une colonne
 * ajoutée en fin de liste serait écrite sous un en-tête vide, donc jamais
 * relue — une donnée saisie qui disparaît sans aucun message d'erreur.
 */
function assurerEntetes(feuille, noms) {
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(noms);
    feuille.setFrozenRows(1);
    return noms.slice();
  }
  var entetes = feuille.getRange(1, 1, 1, Math.max(1, feuille.getLastColumn()))
    .getValues()[0].map(function (v) { return String(v).trim(); });
  var manquants = noms.filter(function (n) { return entetes.indexOf(n) < 0; });
  if (manquants.length) {
    feuille.getRange(1, entetes.length + 1, 1, manquants.length).setValues([manquants]);
    entetes = entetes.concat(manquants);
  }
  return entetes;
}

/** Écrit ou remplace une ligne identifiée par la colonne `cleId` (« id » par défaut). */
function ecrireLigne(nom, champs, donnees, cleId) {
  cleId = cleId || 'id';
  var feuille = onglet(nom);
  var entetes = assurerEntetes(feuille, champs.map(function (c) { return c[0]; }));
  // Écriture dans l'ordre RÉEL des colonnes, pas dans celui de la déclaration
  var ligne = entetes.map(function (entete) {
    for (var j = 0; j < champs.length; j++) {
      if (champs[j][0] === entete) return versCellule(donnees[entete], champs[j][1]);
    }
    return '';
  });
  var colonneId = entetes.indexOf(cleId);
  if (colonneId < 0) colonneId = 0;

  var valeurs = feuille.getDataRange().getValues();
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][colonneId]).trim() === String(donnees[cleId]).trim()) {
      feuille.getRange(i + 1, 1, 1, ligne.length).setValues([ligne]);
      return { ok: true, cree: false };
    }
  }
  feuille.appendRow(ligne);
  return { ok: true, cree: true };
}

/**
 * Écrit PLUSIEURS lignes en une seule fois.
 *
 * Chaque opération Sheets est un aller-retour réseau. Écrire quatorze lignes
 * une à une en coûtait près de quatre-vingt-dix, soit une trentaine de secondes
 * sur un projet qui démarre à froid — assez pour que le tableau de bord renonce
 * avant la réponse, et que l'import semble n'avoir rien fait. On lit donc
 * l'onglet une fois, on fusionne en mémoire, et on réécrit d'un bloc.
 */
function ecrireLignes(nom, champs, liste, cleId) {
  cleId = cleId || 'id';
  if (!liste || !liste.length) return 0;

  var feuille = onglet(nom);
  var entetes = assurerEntetes(feuille, champs.map(function (c) { return c[0]; }));
  var largeur = entetes.length;
  var colonneId = entetes.indexOf(cleId);
  if (colonneId < 0) colonneId = 0;

  /* Toutes les lignes existantes sont conservées à leur place, y compris les
     vides : les réécrire décalées ferait apparaître des doublons en fin d'onglet. */
  var grille = feuille.getDataRange().getValues();
  var corps = [];
  var index = {};
  for (var i = 1; i < grille.length; i++) {
    var existante = grille[i].slice(0, largeur);
    while (existante.length < largeur) existante.push('');
    var cleExistante = String(existante[colonneId] || '').trim();
    if (cleExistante) index[cleExistante] = corps.length;
    corps.push(existante);
  }

  liste.forEach(function (item) {
    var ligne = entetes.map(function (entete) {
      for (var j = 0; j < champs.length; j++) {
        if (champs[j][0] === entete) return versCellule(item[entete], champs[j][1]);
      }
      return '';
    });
    var cle = String(item[cleId] === undefined || item[cleId] === null ? '' : item[cleId]).trim();
    if (cle && Object.prototype.hasOwnProperty.call(index, cle)) {
      corps[index[cle]] = ligne;
    } else {
      if (cle) index[cle] = corps.length;
      corps.push(ligne);
    }
  });

  if (corps.length) feuille.getRange(2, 1, corps.length, largeur).setValues(corps);
  return liste.length;
}

function supprimerLigne(nom, id, cleId) {
  var feuille = onglet(nom);
  var valeurs = feuille.getDataRange().getValues();
  if (!valeurs.length) return false;
  var colonneId = 0;
  if (cleId) {
    var trouve = valeurs[0].map(function (v) { return String(v).trim(); }).indexOf(cleId);
    if (trouve >= 0) colonneId = trouve;
  }
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][colonneId]).trim() === String(id).trim()) {
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

// --------------------------------- PAYS ----------------------------------

function enregistrerPays(p) {
  if (!p || !p.code) throw new Error('Le code du pays est obligatoire.');
  p.code = String(p.code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(p.code)) {
    throw new Error('Le code du pays s’écrit en deux lettres, comme DJ ou KM.');
  }
  if (!p.nom) throw new Error('Le nom du pays est obligatoire.');
  if (!p.devise) throw new Error('La devise est obligatoire : sans elle, aucun tarif n’est lisible.');

  // Un motif de numéro invalide bloquerait toutes les inscriptions du pays
  if (p.motifTelephone) {
    try { new RegExp(p.motifTelephone); }
    catch (err) { throw new Error('Le format de numéro n’est pas une expression valide : ' + p.motifTelephone); }
  }
  if (!Array.isArray(p.paymentMethods)) p.paymentMethods = [];

  /* Un seul pays par défaut : c'est celui que voit un visiteur qui n'a rien
     choisi. Deux valeurs par défaut rendraient l'affichage imprévisible. */
  if (p.defaut === true) {
    lireTable(F_PAYS, CHAMPS_PAYS).forEach(function (autre) {
      if (autre.code === p.code || autre.defaut !== true) return;
      autre.defaut = false;
      ecrireLigne(F_PAYS, CHAMPS_PAYS, autre, 'code');
    });
  }

  var r = ecrireLigne(F_PAYS, CHAMPS_PAYS, p, 'code');
  return { ok: true, cree: r.cree, catalogue: lireCatalogue() };
}

function supprimerPays(code) {
  if (!code) throw new Error('Code manquant.');
  code = String(code).trim().toUpperCase();

  var restants = lireTable(F_PAYS, CHAMPS_PAYS).filter(function (p) { return p.code !== code; });
  if (!restants.length) {
    throw new Error('C’est le dernier pays : le site n’aurait plus ni devise ni moyen de paiement. '
      + 'Créez-en un autre avant de supprimer celui-ci.');
  }

  /* Une session qui se tient dans ce pays deviendrait invisible partout : on
     refuse plutôt que de la faire disparaître en silence. */
  var sessions = lireTable(F_SESSIONS, CHAMPS_SESSION).filter(function (s) {
    return String(s.pays || '').toUpperCase() === code;
  });
  if (sessions.length) {
    throw new Error(sessions.length + ' session(s) se tiennent dans ce pays. '
      + 'Rattachez-les ailleurs, ou supprimez-les d’abord.');
  }

  if (!supprimerLigne(F_PAYS, code, 'code')) throw new Error('Pays introuvable.');

  // Le pays supprimé était peut-être celui par défaut : il en faut toujours un
  if (!restants.some(function (p) { return p.defaut === true; })) {
    restants[0].defaut = true;
    ecrireLigne(F_PAYS, CHAMPS_PAYS, restants[0], 'code');
  }
  return { ok: true, catalogue: lireCatalogue() };
}

// ---------------------------- RÉALISATIONS -------------------------------

function enregistrerRealisation(r) {
  if (!r || !r.id) throw new Error('Identifiant de réalisation manquant.');
  if (!r.title) throw new Error('Le titre est obligatoire.');
  var sortie = ecrireLigne(F_PORTFOLIO, CHAMPS_PORTFOLIO, r);
  return { ok: true, cree: sortie.cree, catalogue: lireCatalogue() };
}

function supprimerRealisation(id) {
  if (!id) throw new Error('Identifiant manquant.');
  if (!supprimerLigne(F_PORTFOLIO, id)) throw new Error('Réalisation introuvable.');
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

/**
 * Écriture générique dans un onglet « clé / valeur ».
 * Une lecture, une écriture : les textes de l'accueil se comptent par dizaines,
 * et les traiter un par un coûtait autant d'allers-retours que de clés.
 * Une valeur vide SUPPRIME la clé — c'est ainsi qu'on rétablit le texte d'origine.
 */
function ecrirePaires(nom, donnees, messageErreur) {
  if (!donnees || typeof donnees !== 'object') throw new Error(messageErreur);
  var feuille = onglet(nom);
  assurerEntetes(feuille, ['cle', 'valeur']);

  var grille = feuille.getDataRange().getValues();
  var ordre = [], table = {};
  for (var i = 1; i < grille.length; i++) {
    var existante = String(grille[i][0] || '').trim();
    if (!existante) continue;
    if (!Object.prototype.hasOwnProperty.call(table, existante)) ordre.push(existante);
    table[existante] = grille[i][1];
  }

  Object.keys(donnees).forEach(function (cle) {
    var brut = donnees[cle];
    if (brut === null || brut === undefined || String(brut).trim() === '') {
      delete table[cle];
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(table, cle)) ordre.push(cle);
    table[cle] = forcerTexte(typeof brut === 'string' ? brut : JSON.stringify(brut));
  });

  var corps = ordre
    .filter(function (cle) { return Object.prototype.hasOwnProperty.call(table, cle); })
    .map(function (cle) { return [cle, table[cle]]; });

  // On efface l'ancien corps avant de réécrire : sinon une clé supprimée subsisterait
  var anciennes = Math.max(0, grille.length - 1);
  if (anciennes) feuille.getRange(2, 1, anciennes, 2).clearContent();
  if (corps.length) feuille.getRange(2, 1, corps.length, 2).setValues(corps);
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
  feuille.getRange(ligne, col + 1).setValue(protegerFormule(statut));
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

  /* Recherche par nom : elle retrouve un dossier dont l'identifiant a été perdu
     (script re-créé, propriétés effacées). Enveloppée par prudence : si la
     permission venait à être restreinte, on créerait simplement un dossier neuf
     plutôt que de faire échouer tout envoi d'image. */
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
    detail = String(err).slice(0, 300);
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

  var formations = (donnees.formations || []).map(function (f, i) {
    if (typeof f.ordre !== 'number') f.ordre = i;
    return f;
  });
  var pays = (donnees.pays || []).filter(function (p) { return p && p.code; })
    .map(function (p, i) {
      p.code = String(p.code).toUpperCase();
      if (typeof p.ordre !== 'number') p.ordre = i;
      return p;
    });

  var nbF = ecrireLignes(F_FORMATIONS, CHAMPS_FORMATION, formations);
  var nbS = ecrireLignes(F_SESSIONS, CHAMPS_SESSION, donnees.sessions || []);
  var nbP = ecrireLignes(F_PAYS, CHAMPS_PAYS, pays, 'code');

  var portfolio = (donnees.portfolio || []).filter(function (r) { return r && r.id; })
    .map(function (r, i) {
      if (typeof r.ordre !== 'number') r.ordre = i;
      return r;
    });
  var nbR = ecrireLignes(F_PORTFOLIO, CHAMPS_PORTFOLIO, portfolio);

  if (donnees.reglages) ecrirePaires(F_REGLAGES, donnees.reglages, 'Réglages invalides.');
  return { ok: true, formations: nbF, sessions: nbS, pays: nbP, portfolio: nbR, catalogue: lireCatalogue() };
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
    ['Pays', d.pays || d.paysCode || '—'],
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
    pays: 'Djibouti', paysCode: 'DJ', countryCode: '+253',
    statut: 'TEST', source: 'Test installation', pageUrl: ''
  };
  /* Ce journal dit quelle version est ENREGISTRÉE dans l'éditeur. Comparée à
     celle que renvoie /exec?action=version, elle distingue les deux pannes qui
     se ressemblent : un fichier mal collé, ou un déploiement non republié. */
  Logger.log('Version dans l’éditeur : ' + VERSION);
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

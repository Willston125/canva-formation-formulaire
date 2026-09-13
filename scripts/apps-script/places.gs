/* =========================================================================
   IMPACTALI — Compte des inscrits par session
   À AJOUTER dans le projet Google Apps Script qui reçoit déjà les inscriptions.

   N'EFFACEZ PAS votre fonction doPost existante : ajoutez ce fichier à côté
   (Apps Script > + > Script), ou collez ces fonctions à la suite du code actuel.

   Ce que ça fait : le site demande « combien de personnes sont inscrites à
   chaque session ? » et en déduit les places restantes. Aucune donnée
   personnelle ne sort d'ici — seulement des nombres.

   Après avoir collé ce code :
     1. Déployer > Gérer les déploiements > (crayon) > Nouvelle version > Déployer
        (indispensable : sans nouvelle version, l'ancienne reste servie)
     2. L'accès doit rester « Tout le monde » pour que le site puisse lire.
     3. Vérifier en ouvrant dans un navigateur :
        https://VOTRE_URL/exec?action=places
        Réponse attendue : {"sessions":{"canva-pro-2026-11":3, ...}}
   ========================================================================= */

/**
 * Laissez la chaîne vide si ce script est lié à la feuille (créé depuis
 * « Extensions > Apps Script » du classeur). Sinon, mettez l'identifiant du
 * classeur, visible dans son URL entre /d/ et /edit.
 */
var ID_CLASSEUR = '';

/** Nom de l'onglet contenant les inscriptions. Vide = le premier onglet. */
var NOM_FEUILLE = '';

/**
 * Statuts à compter comme occupant une place.
 * null  = toutes les lignes comptent (une inscription en attente réserve la place).
 * Pour ne compter que les inscriptions validées, remplacez par : ['Confirmé', 'Payé']
 */
var STATUTS_COMPTES = null;

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action !== 'places') {
    return repondre({ erreur: 'action inconnue' }, params.callback);
  }
  try {
    return repondre({ sessions: compterInscrits() }, params.callback);
  } catch (erreur) {
    return repondre({ erreur: String(erreur) }, params.callback);
  }
}

/** Compte les lignes par identifiant de session. */
function compterInscrits() {
  var classeur = ID_CLASSEUR ? SpreadsheetApp.openById(ID_CLASSEUR) : SpreadsheetApp.getActiveSpreadsheet();
  var feuille = NOM_FEUILLE ? classeur.getSheetByName(NOM_FEUILLE) : classeur.getSheets()[0];
  if (!feuille) throw new Error('feuille introuvable');

  var valeurs = feuille.getDataRange().getValues();
  if (valeurs.length < 2) return {};

  var entetes = valeurs[0].map(function (v) { return String(v).trim().toLowerCase(); });
  var colSession = indexColonne(entetes, ['sessionid', 'session id', 'session']);
  var colStatut = indexColonne(entetes, ['statut', 'status']);
  if (colSession < 0) throw new Error('colonne sessionId introuvable : ajoutez un en-tête « sessionId »');

  var compte = {};
  for (var i = 1; i < valeurs.length; i++) {
    var identifiant = String(valeurs[i][colSession] || '').trim();
    if (!identifiant) continue; // inscription sans session datée : n'occupe aucune place comptée
    if (STATUTS_COMPTES && colStatut >= 0) {
      var statut = String(valeurs[i][colStatut] || '').trim();
      if (STATUTS_COMPTES.indexOf(statut) === -1) continue;
    }
    compte[identifiant] = (compte[identifiant] || 0) + 1;
  }
  return compte;
}

/** Retrouve une colonne par son en-tête, quelle que soit sa position. */
function indexColonne(entetes, nomsPossibles) {
  for (var i = 0; i < nomsPossibles.length; i++) {
    var position = entetes.indexOf(nomsPossibles[i]);
    if (position >= 0) return position;
  }
  return -1;
}

/**
 * Renvoie du JSON, ou du JavaScript si le site a dû passer par un script
 * (certains navigateurs bloquent la lecture directe entre domaines).
 */
function repondre(donnees, callback) {
  var corps = JSON.stringify(donnees);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + corps + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(corps)
    .setMimeType(ContentService.MimeType.JSON);
}

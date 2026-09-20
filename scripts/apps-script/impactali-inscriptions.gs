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
   3. MOT DE PASSE DU TABLEAU DE BORD — une seule ligne, en haut du fichier.
      Chercher MOT_DE_PASSE_ADMIN plus bas et écrire votre phrase entre les
      guillemets. C'est tout : rien à ouvrir dans les réglages, rien à cocher.
      Ce qui est écrit LÀ fait loi, et vous pouvez le relire à tout moment.
      Le script en garde une copie de son côté : si une mise à jour vous fait
      recoller un fichier où la ligne est restée sur sa valeur d'usine, la
      phrase précédente continue de fonctionner. Vous ne pouvez donc plus vous
      enfermer dehors.
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
var VERSION = '2026-09-20-formulaire-borne';

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
var F_IMAGES = 'Images';

/** Adresse professionnelle qui reçoit l'alerte à chaque inscription. */
var EMAIL_PRO = 'infos@impactali.site';

/** Nom affiché comme expéditeur de l'alerte. */
var NOM_EXPEDITEUR = 'Inscriptions IMPACTALI';

/**
 * MOT DE PASSE DU TABLEAU DE BORD — écrivez-le ici, entre les guillemets.
 *
 * C'est le seul endroit à renseigner, et il est sous vos yeux : si l'accès est
 * refusé un jour, il suffit de relire cette ligne. Il protège /admin —
 * modification du catalogue, des tarifs, et consultation des coordonnées des
 * candidats. Choisissez une phrase longue, propre à ce site, jamais réutilisée
 * ailleurs, en lettres, chiffres et tirets.
 *
 * Évitez d'y coller du texte venu d'un traitement de texte : il apporte des
 * caractères qui ne se voient pas (espace insécable, apostrophe courbe) et
 * qu'il faudrait ensuite retaper à l'identique. Tapez-la au clavier.
 */
var MOT_DE_PASSE_ADMIN = 'CHANGEZ-MOI-avant-de-deployer';

/* C'est la SEULE ligne de ce fichier à renseigner. Tout le reste fonctionne
   sans être touché — en particulier, ne recopiez votre phrase nulle part
   ailleurs : le script s'en charge. */

/**
 * Statuts qui occupent une place dans le décompte affiché sur le site.
 *
 * SEULES LES INSCRIPTIONS VALIDÉES PAR LE PROPRIÉTAIRE occupent une place.
 * Auparavant la valeur était `null`, donc TOUTE ligne comptait, « En attente »
 * comprise. Or le formulaire est ouvert à tous : vingt requêtes anonymes
 * suffisaient alors à faire afficher « session complète », et le formulaire ne
 * devenait pas grisé — il disparaissait de la page. Une centaine de requêtes
 * fermaient les inscriptions de tout le site, sans compte ni mot de passe.
 *
 * Contrepartie assumée, décidée par le propriétaire : une inscription en
 * attente ne réserve plus de place. C'est le passage à « Confirmé » ou
 * « Payé », depuis le tableau de bord, qui en occupe une.
 *
 * Ces valeurs DOIVENT appartenir à STATUTS_ACCEPTES : une faute d'accent ne
 * ferait plus jamais compter personne, sans le moindre signe. Une épreuve le
 * vérifie.
 */
var STATUTS_COMPTES = ['Confirmé', 'Payé'];

/**
 * Inscriptions écrites par jour, toutes sources confondues.
 *
 * Même garde-fou que ALERTES_PAR_JOUR, et pour la même raison : le formulaire
 * est ouvert à tous, sans compte ni mot de passe. Sans plafond, une boucle de
 * vingt lignes noie la feuille de milliers de fausses candidatures et rend les
 * vraies introuvables. Le chiffre est très au-dessus de la plus forte journée
 * réelle — il ne doit jamais refuser un vrai candidat — et très en dessous de
 * ce qu'une boucle produit en une minute.
 */
var INSCRIPTIONS_PAR_JOUR = 150;

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
  ['programme', 'json'], ['faq', 'json'], ['prerequis', 'json']
];

var CHAMPS_SESSION = [
  ['id', 'texte'], ['formId', 'texte'], ['startDate', 'texte'], ['endDate', 'texte'],
  ['schedule', 'texte'], ['duration', 'texte'], ['location', 'texte'], ['mode', 'texte'],
  ['price', 'num'], ['placesTotal', 'num'], ['placesAvailable', 'num'],
  ['registrationOpen', 'bool'], ['currency', 'texte'], ['pays', 'texte'],
  /* Mode, lieu et tarif PROPRES À CHAQUE PAYS coché, quand ils diffèrent :
     { "DJ": { "mode": "Présentiel", "lieu": "Saalam Tower", "tarif": 7500 } }.
     Une même session peut se tenir en présentiel ici et en ligne ailleurs, à
     un tarif qui n'est pas le même et dans une autre devise. Les champs
     `mode`, `location` et `price` de la session restent le repli : sans eux,
     une session créée avant cette colonne perdrait lieu et mode d'un coup. */
  ['parPays', 'json']
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
  /* `video` : lien YouTube. La carte affiche alors un bouton de lecture, et
     la vidéo s'ouvre sur le site — rien n'est chargé chez YouTube avant le clic. */
  ['href', 'texte'], ['video', 'texte'], ['ordre', 'num']
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
    if (p.action === 'catalogue') return repondre(cataloguePourLeSite(), p.callback);
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
    /* Une inscription pèse environ un kilo-octet, et la plus lourde des
       commandes du tableau de bord — l'envoi d'une image — reste sous le
       million. Au-delà, c'est qu'on cherche à gonfler la feuille. */
    if (e.postData.contents.length > 1500000) {
      return repondre({ ok: false, erreur: 'Requête trop volumineuse.' }, null);
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

/* ---------------------------------------------------------------------------
   GARDE-FOUS DE L'INSCRIPTION PUBLIQUE

   L'adresse du script est publique : elle figure dans formations-data.js, que
   tout visiteur peut lire. N'importe qui peut donc appeler ce point d'entrée
   sans passer par le formulaire. Sans garde-fou, cela permettait d'écrire des
   lignes arbitraires, de faire croire qu'une session était pleine, et d'épuiser
   le quota d'emails de Google — auquel cas les VRAIES inscriptions n'auraient
   plus donné lieu à aucune alerte.

   On refuse le moins possible : une inscription incomplète est une inscription
   perdue. Ce qui dépasse est donc tronqué, pas rejeté. Seul l'essentiel absent
   fait refuser.
   --------------------------------------------------------------------------- */

/** Statuts qu'une inscription peut porter en arrivant. Le reste est ramené au premier. */
var STATUTS_ACCEPTES = ['En attente', 'Confirmé', 'Payé', 'Annulé'];

/** Longueur retenue par champ. Au-delà, on tronque : la ligne reste lisible. */
var LONGUEUR_CHAMP = 300;
var LONGUEUR_CHAMP_LIBRE = 2000;
var CHAMPS_LIBRES = ['motivation', 'objectifs', 'professionDetail'];

/** Alertes email par jour. Au-delà, on enregistre toujours, mais sans prévenir. */
var ALERTES_PAR_JOUR = 60;

function inscriptionIncomplete(d) {
  var nom = String(d.nom || '').trim() + String(d.prenom || '').trim();
  var tel = String(d.telephoneInternational || d.telephone || '').replace(/\D/g, '');
  if (!nom) return 'Le nom est obligatoire.';
  if (tel.length < 6) return 'Un numéro de téléphone est obligatoire.';
  if (!String(d.formationId || '').trim()) return 'La formation est obligatoire.';
  return '';
}

/**
 * L'inscription désigne-t-elle une formation et une session qui EXISTENT ?
 *
 * Le formulaire est ouvert à tous, et le catalogue public donne l'identifiant de
 * chaque session ainsi que sa capacité : il n'y avait donc rien à deviner pour
 * remplir n'importe quelle session. On refuse ici ce qu'on peut prouver faux.
 *
 * ON NE REFUSE QUE CE QU'ON PEUT PROUVER. Une table vide — classeur neuf,
 * onglet pas encore créé — ne fait rejeter personne : mieux vaut accepter une
 * inscription de trop que fermer le formulaire d'un site qui vient d'être
 * installé. Rend un message, ou la chaîne vide quand tout va bien.
 */
function inscriptionInventee(d) {
  var formationId = String(d.formationId || '').trim();

  var formations = lireTable(F_FORMATIONS, CHAMPS_FORMATION);
  if (formations.length) {
    var connue = false;
    for (var i = 0; i < formations.length; i++) {
      if (String(formations[i].formId || '').trim() === formationId) connue = true;
    }
    if (!connue) return 'Cette formation n’existe pas.';
  }

  /* Une inscription SANS session reste permise : plusieurs formations acceptent
     qu'on se manifeste avant l'annonce des dates. */
  var sessionId = String(d.sessionId || '').trim();
  if (!sessionId) return '';

  var sessions = lireTable(F_SESSIONS, CHAMPS_SESSION);
  if (!sessions.length) return '';
  var laSession = null;
  for (var j = 0; j < sessions.length; j++) {
    if (String(sessions[j].id || '').trim() === sessionId) laSession = sessions[j];
  }
  if (!laSession) return 'Cette session n’existe pas.';
  /* Une session qui appartient à une AUTRE formation : c'est par là qu'on
     remplirait la session du voisin en restant formellement valide. */
  if (String(laSession.formId || '').trim() !== formationId) {
    return 'Cette session n’appartient pas à cette formation.';
  }
  return '';
}

/**
 * Le plafond d'écritures du jour est-il atteint ?
 *
 * Copie du mécanisme de alerteAutorisee, qui existait déjà pour les emails et
 * fonctionne : un seul compteur dans les propriétés du script, au format
 * « AAAA-MM-JJ|compte ». Aucune lecture de feuille, donc aucun coût pour le
 * candidat.
 *
 * EN CAS DE PANNE DES PROPRIÉTÉS, ON LAISSE PASSER. Perdre une vraie
 * candidature est plus grave que d'en laisser entrer une de trop.
 */
function ecritureAutorisee() {
  try {
    var proprietes = PropertiesService.getScriptProperties();
    var aujourdhui = Utilities.formatDate(new Date(), 'Etc/GMT', 'yyyy-MM-dd');
    var brut = String(proprietes.getProperty('INSCRIPTIONS_DU_JOUR') || '');
    var parts = brut.split('|');
    var compte = parts[0] === aujourdhui ? Number(parts[1]) || 0 : 0;
    if (compte >= INSCRIPTIONS_PAR_JOUR) return false;
    proprietes.setProperty('INSCRIPTIONS_DU_JOUR', aujourdhui + '|' + (compte + 1));
    if (compte + 1 === INSCRIPTIONS_PAR_JOUR) {
      Logger.log('Plafond d’inscriptions atteint pour aujourd’hui : les envois suivants '
        + 'sont refusés, avec un message qui renvoie vers ' + EMAIL_PRO + '.');
    }
    return true;
  } catch (e) {
    return true; // propriétés indisponibles : on préfère l'inscription au refus
  }
}

/** Ramène chaque champ à une forme sûre, sans jamais perdre l'inscription. */
function assainirInscription(d) {
  var propre = {};
  Object.keys(d).forEach(function (cle) {
    var v = d[cle];
    if (typeof v !== 'string') { propre[cle] = v; return; }
    var max = CHAMPS_LIBRES.indexOf(cle) >= 0 ? LONGUEUR_CHAMP_LIBRE : LONGUEUR_CHAMP;
    propre[cle] = v.trim().slice(0, max);
  });

  /* Le statut est repris tel quel dans la liste déroulante du tableau de bord :
     il ne doit venir que de la liste connue, jamais de la requête. */
  if (STATUTS_ACCEPTES.indexOf(propre.statut) < 0) propre.statut = STATUTS_ACCEPTES[0];

  // Un montant doit être un nombre, sinon les totaux du tableau de bord mentent
  if (propre.montant !== undefined && propre.montant !== '') {
    var montant = Number(propre.montant);
    propre.montant = isNaN(montant) ? '' : montant;
  }
  if (propre.age !== undefined && propre.age !== '') {
    var age = Number(propre.age);
    propre.age = isNaN(age) || age < 0 || age > 120 ? '' : age;
  }
  return propre;
}

/**
 * Le quota d'envoi de Google est journalier et partagé par tout le projet.
 * L'épuiser, c'est perdre les alertes des inscriptions suivantes — les vraies.
 * On s'arrête donc avant, en le disant une fois.
 */
function alerteAutorisee() {
  try {
    var proprietes = PropertiesService.getScriptProperties();
    var aujourdhui = Utilities.formatDate(new Date(), 'Etc/GMT', 'yyyy-MM-dd');
    var brut = String(proprietes.getProperty('ALERTES_DU_JOUR') || '');
    var parts = brut.split('|');
    var compte = parts[0] === aujourdhui ? Number(parts[1]) || 0 : 0;
    if (compte >= ALERTES_PAR_JOUR) return false;
    proprietes.setProperty('ALERTES_DU_JOUR', aujourdhui + '|' + (compte + 1));
    if (compte + 1 === ALERTES_PAR_JOUR) {
      Logger.log('Plafond d’alertes atteint pour aujourd’hui : les inscriptions '
        + 'continuent d’être enregistrées, sans email.');
    }
    return true;
  } catch (e) {
    return true; // propriétés indisponibles : on préfère l'alerte au silence
  }
}

function recevoirInscription(d) {
  var manque = inscriptionIncomplete(d);
  if (manque) return repondre({ ok: false, erreur: manque }, null);

  /* Ce qui ne correspond à rien de réel est refusé AVANT d'être écrit. Sans
     cela, on pouvait remplir n'importe quelle session en devinant son
     identifiant — et il n'y avait rien à deviner, le catalogue public les
     donne tous, avec leur capacité. */
  var inventee = inscriptionInventee(d);
  if (inventee) return repondre({ ok: false, erreur: inventee }, null);

  /* Puis seulement, on consomme une place du plafond du jour : une charge
     invalide ne doit pas épuiser le quota des vrais candidats. */
  if (!ecritureAutorisee()) {
    return repondre({ ok: false, erreur: 'Nous recevons un nombre inhabituel d’inscriptions '
      + 'aujourd’hui et ne pouvons pas enregistrer la vôtre pour l’instant. Écrivez-nous à '
      + EMAIL_PRO + ' : votre place sera notée à la main.' }, null);
  }

  d = assainirInscription(d);
  enregistrer(d);
  // Une alerte email qui échoue ne doit jamais faire perdre l'inscription
  try { if (alerteAutorisee()) envoyerAlerte(d); }
  catch (err) { Logger.log('Alerte email : ' + err); }
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

  /* Le catalogue retenu chez Google doit être jeté dès qu'on écrit, faute de
     quoi une modification mettrait des heures à paraître sur le site.
     On invalide ICI, en un seul endroit, plutôt que dans chacune des seize
     fonctions d'enregistrement — un oubli y serait invisible.
     La liste énumère les commandes qui ne font que LIRE : tout le reste, y
     compris une commande ajoutée demain, est traité comme une écriture.
     Se tromper coûte alors un calcul en trop, jamais un contenu périmé. */
  var LECTURES_SEULES = ['admin.login', 'admin.catalogue', 'admin.inscriptions'];
  if (LECTURES_SEULES.indexOf(d.action) < 0) oublierCatalogue();

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
      case 'admin.images.save':      return repondre(enregistrerImages(d.donnees, d.cadrages), null);
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
    /* ET DE NOUVEAU APRÈS L'ÉCRITURE. Le jeter seulement avant laissait une
       course : le site ne prend pas le verrou, et un visiteur qui demandait le
       catalogue pendant les une à trois secondes de l'écriture relisait la
       feuille PAS ENCORE MODIFIÉE, puis la remettait en cache pour cinq
       minutes. L'écriture terminée, le site servait donc l'ancien contenu —
       d'autant plus souvent qu'il y a du monde, c'est-à-dire précisément quand
       on corrige quelque chose en pleine campagne.
       Jeter deux fois ne coûte qu'un recalcul ; ne jeter qu'avant coûte cinq
       minutes de contenu périmé, sans que rien ne le signale. */
    if (LECTURES_SEULES.indexOf(d.action) < 0) oublierCatalogue();
    verrou.releaseLock();
  }
}

/**
 * Mot de passe attendu par le tableau de bord.
 *
 * CE QUI EST ÉCRIT DANS LE FICHIER FAIT LOI. C'était l'inverse auparavant : une
 * phrase rangée dans les propriétés du script l'emportait sur la ligne visible,
 * et lorsque les deux différaient — une espace en trop suffisait — plus rien
 * n'ouvrait l'administration, sans qu'aucun écran ne permette de voir laquelle
 * était en cause. On ne peut plus s'enfermer dehors : la réponse est lisible en
 * haut de ce fichier.
 *
 * Le script garde malgré tout une copie de la phrase de son côté. Elle ne sert
 * que si la ligne visible est restée sur sa valeur d'usine — le cas d'une mise
 * à jour recollée sans avoir repris le mot de passe. La dernière phrase connue
 * prend alors le relais, au lieu de fermer la porte.
 *
 * Les espaces de début et de fin sont retirées des deux côtés : elles ne se
 * voient nulle part, et c'est par elles que tout est arrivé.
 */
function motDePasseAdmin() {
  var duFichier = String(MOT_DE_PASSE_ADMIN || '').trim();

  if (!motDePasseNonRenseigne(duFichier)) {
    memoriserMotDePasse(duFichier);
    return duFichier;
  }

  try {
    var copie = PropertiesService.getScriptProperties().getProperty(CLE_MOT_DE_PASSE);
    if (copie) return String(copie).trim();
  } catch (e) { /* propriétés indisponibles : il ne reste que le fichier */ }

  return '';
}

/**
 * La ligne du haut est-elle restée telle qu'elle est livrée ?
 *
 * On reconnaît le texte livré à son début, « CHANGEZ-MOI », plutôt qu'en le
 * comparant à une seconde constante. Cette seconde constante existait, juste
 * sous la ligne à renseigner : on y recopiait sa phrase en croyant bien faire,
 * le script concluait que rien n'était configuré, et l'accès restait fermé.
 * Un repère qui ne ressemble pas à un mot de passe ne s'attrape pas ainsi.
 */
function motDePasseNonRenseigne(valeur) {
  return !valeur || String(valeur).indexOf('CHANGEZ-MOI') === 0;
}

/** Nom sous lequel le script garde sa copie de secours du mot de passe. */
var CLE_MOT_DE_PASSE = 'MOT_DE_PASSE_ADMIN';

/**
 * Range une copie de la phrase, pour qu'une mise à jour du fichier ne puisse
 * pas fermer l'administration. On n'écrit que si la valeur a changé : une
 * écriture à chaque appel coûterait un aller-retour inutile sur chaque requête.
 */
function memoriserMotDePasse(phrase) {
  try {
    var proprietes = PropertiesService.getScriptProperties();
    if (proprietes.getProperty(CLE_MOT_DE_PASSE) !== phrase) {
      proprietes.setProperty(CLE_MOT_DE_PASSE, phrase);
    }
  } catch (e) { /* propriétés indisponibles : le fichier suffit */ }
}

/** Comparaison à durée constante, pour ne rien révéler par le temps de réponse. */
function verifierMotDePasse(saisi) {
  var attendu = motDePasseAdmin();
  saisi = String(saisi || '').trim();
  if (motDePasseNonRenseigne(attendu)) {
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
/* ---------- Catalogue retenu chez Google ----------
 *
 * Mesuré depuis le site publié : un appel « catalogue » prenait 3,9 à 5,5
 * secondes, de façon CONSTANTE sur trois essais consécutifs. Ce n'est donc pas
 * un démarrage à froid, c'est le même travail refait pour chaque visiteur :
 * huit onglets rouverts, un aller-retour réseau chacun.
 *
 * Le catalogue est identique pour tout le monde et ne change que lorsque le
 * tableau de bord écrit. On le garde donc en mémoire chez Google.
 *
 * DEUX PRÉCAUTIONS, l'une et l'autre nécessaires :
 *
 * 1. LES PLACES RESTANTES N'Y SONT JAMAIS. Elles changent à chaque
 *    inscription, et une valeur périmée ferait vendre deux fois la dernière
 *    place. Elles sont recomptées à chaque appel.
 *
 * 2. LE TABLEAU DE BORD NE LIT JAMAIS CE CACHE. Il appelle lireCatalogue
 *    directement : celui qui vient d'enregistrer doit voir ce qu'il a écrit,
 *    sans quoi il croirait sa modification perdue et la referait.
 */
var CLE_CACHE_CATALOGUE = 'catalogue-v1';

/* CINQ MINUTES, et non les six heures permises.
 *
 * Une écriture du tableau de bord jette le cache aussitôt : de ce côté-là, une
 * modification paraît tout de suite. Mais la feuille Google se modifie AUSSI À
 * LA MAIN — un tarif corrigé directement dans une cellule — et rien alors ne
 * prévient le script. Avec six heures, une correction saisie le matin ne se
 * serait vue qu'en fin de journée, sans que personne comprenne pourquoi.
 *
 * Cinq minutes suffisent à mutualiser les visites rapprochées, qui sont tout
 * l'enjeu : pendant une campagne, cent visiteurs se partagent un seul calcul
 * au lieu d'en payer cent. */
var DUREE_CACHE_CATALOGUE = 300;

function catalogueEnCache() {
  try {
    var brut = CacheService.getScriptCache().get(CLE_CACHE_CATALOGUE);
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    /* Service indisponible ou contenu illisible : on recalcule. Un cache est
       une commodité, jamais une dépendance. */
    return null;
  }
}

function memoriserCatalogue(donnees) {
  try {
    CacheService.getScriptCache()
      .put(CLE_CACHE_CATALOGUE, JSON.stringify(donnees), DUREE_CACHE_CATALOGUE);
  } catch (e) { /* au-delà de la taille permise : tant pis, on recalculera */ }
}

function oublierCatalogue() {
  try { CacheService.getScriptCache().remove(CLE_CACHE_CATALOGUE); } catch (e) { }
}

/** Catalogue servi au SITE : retenu d'un appel à l'autre, places toujours fraîches. */
function cataloguePourLeSite() {
  var retenu = catalogueEnCache();
  if (!retenu) {
    var frais = lireCatalogue();
    var aRetenir = {};
    for (var cle in frais) {
      if (cle !== 'places' && cle !== 'maj') aRetenir[cle] = frais[cle];
    }
    memoriserCatalogue(aRetenir);
    return frais;
  }
  retenu.places = compterInscrits();
  retenu.maj = new Date().toISOString();
  return retenu;
}

function lireCatalogue() {
  /* L'onglet Images est lu UNE fois, puis partagé : l'adresse et le cadrage
     vivent sur la même ligne, et lireCatalogue est rappelé après chaque
     écriture du tableau de bord. Deux lectures y coûtaient un aller-retour
     réseau de plus à chaque commande, pour la même feuille. */
  var grilleImages = onglet(F_IMAGES).getDataRange().getValues();
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
    images: lireImages(grilleImages),
    cadrages: lireCadrages(grilleImages),
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

/**
 * Reprend telle quelle une valeur déjà présente dans la feuille.
 *
 * Sheets ne rend pas l'apostrophe qui protège un texte commençant par « + » :
 * « +253 77 14 53 06 » se relit sans elle. La réécrire sans la reposer en
 * ferait une formule, et la cellule afficherait #ERROR!.
 */
function reprendreCellule(valeur) {
  return typeof valeur === 'string' ? protegerFormule(valeur) : valeur;
}

/**
 * Écrit ou remplace une ligne identifiée par la colonne `cleId` (« id » par défaut).
 *
 * Une colonne que la charge ne mentionne pas n'est pas une colonne vidée : le
 * formulaire qui a produit cette charge ne la propose simplement pas — parce
 * qu'elle a été ajoutée depuis, ou parce qu'elle ne se règle pas à la main.
 * On garde alors ce que la cellule contenait. Remplir chaque colonne à partir
 * de la seule charge reçue effaçait en silence tout le reste de la ligne.
 */
function ecrireLigne(nom, champs, donnees, cleId) {
  cleId = cleId || 'id';
  var feuille = onglet(nom);
  var entetes = assurerEntetes(feuille, champs.map(function (c) { return c[0]; }));
  var colonneId = entetes.indexOf(cleId);
  if (colonneId < 0) colonneId = 0;

  var valeurs = feuille.getDataRange().getValues();
  var rang = -1;
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][colonneId]).trim() === String(donnees[cleId]).trim()) { rang = i; break; }
  }
  var ancienne = rang >= 0 ? valeurs[rang] : [];
  var garder = function (index) {
    return index < ancienne.length ? reprendreCellule(ancienne[index]) : '';
  };

  // Écriture dans l'ordre RÉEL des colonnes, pas dans celui de la déclaration
  var ligne = entetes.map(function (entete, index) {
    for (var j = 0; j < champs.length; j++) {
      if (champs[j][0] !== entete) continue;
      if (!Object.prototype.hasOwnProperty.call(donnees, entete)) return garder(index);
      return versCellule(donnees[entete], champs[j][1]);
    }
    return garder(index); // colonne étrangère au script : elle ne nous appartient pas
  });

  if (rang >= 0) {
    feuille.getRange(rang + 1, 1, 1, ligne.length).setValues([ligne]);
    return { ok: true, cree: false };
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
    var cle = String(item[cleId] === undefined || item[cleId] === null ? '' : item[cleId]).trim();
    var place = (cle && Object.prototype.hasOwnProperty.call(index, cle)) ? index[cle] : -1;
    var ancienne = place >= 0 ? corps[place] : [];
    // Même règle que ecrireLigne : ce qui n'est pas mentionné n'est pas effacé
    var garder = function (k) {
      return k < ancienne.length ? reprendreCellule(ancienne[k]) : '';
    };
    var ligne = entetes.map(function (entete, k) {
      for (var j = 0; j < champs.length; j++) {
        if (champs[j][0] !== entete) continue;
        if (!Object.prototype.hasOwnProperty.call(item, entete)) return garder(k);
        return versCellule(item[entete], champs[j][1]);
      }
      return garder(k);
    });
    if (place >= 0) {
      corps[place] = ligne;
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

/* ------------------------ COHÉRENCE ENTRE PAYS ET MODE ------------------------
 *
 * Une session « en présentiel » se tient à UNE adresse, donc dans UN pays.
 * Rien ne l'exigeait, et la feuille le montrait : deux sessions étaient cochées
 * Djibouti ET Comores, en présentiel, avec pour tout lieu « Saalam Tower, 5ème
 * étage, Djibouti ». C'est cette adresse-là que lisait un candidat comorien,
 * sur la fiche comme sur l'accueil.
 *
 * Trois règles, vérifiées ICI parce que c'est ici qu'on écrit, et répétées mot
 * pour mot dans le tableau de bord pour répondre sans aller-retour. Une épreuve
 * compare les deux verdicts sur les mêmes cas : une règle corrigée d'un seul
 * côté se verrait aussitôt.
 *
 * Rend la liste des reproches. Vide = rien à redire.
 */
function reprochesPaysSession(s) {
  var reproches = [];
  if (!s) return reproches;

  var surPlace = function (mode) { return /^(pr[ée]sentiel|hybride)$/i.test(String(mode || '').trim()); };
  var codes = String(s.pays || '').split(',').map(function (c) {
    return c.trim().toUpperCase();
  }).filter(Boolean);

  var table = (s.parPays && typeof s.parPays === 'object' && !Array.isArray(s.parPays)) ? s.parPays : {};
  var reglageDe = function (code) {
    var trouve = null;
    Object.keys(table).forEach(function (c) {
      if (String(c).toUpperCase() === code) trouve = table[c];
    });
    return (trouve && typeof trouve === 'object' && !Array.isArray(trouve)) ? trouve : {};
  };
  var modeDe = function (code) {
    var propre = reglageDe(code).mode;
    return String((typeof propre === 'string' && propre.trim()) ? propre : (s.mode || '')).trim();
  };

  /* 1. AUCUNE CASE COCHÉE = PROPOSÉE PARTOUT, y compris dans un pays ajouté
     plus tard. Seule une session qu'on suit de chez soi peut l'être. */
  if (!codes.length) {
    if (surPlace(s.mode)) {
      reproches.push('Cette session est en « ' + String(s.mode).trim() + ' » et n’est cochée dans '
        + 'aucun pays : elle serait proposée partout, y compris là où personne ne peut s’y rendre. '
        + 'Cochez le ou les pays où elle se tient, ou passez-la « En ligne ».');
    }
    return reproches;
  }

  codes.forEach(function (code) {
    var mode = modeDe(code);
    if (!surPlace(mode)) return;
    if (String(reglageDe(code).lieu || '').trim()) return;

    /* 2. Un pays sur place veut un lieu. */
    if (codes.length === 1) {
      if (!String(s.location || '').trim()) {
        reproches.push('La session est en « ' + mode + ' » pour ' + code + ' sans aucun lieu. '
          + 'Indiquez l’adresse dans « Lieu ou plateforme », ou passez ce pays « En ligne ».');
      }
      return;
    }
    /* 3. Et dès que plusieurs pays sont cochés, il veut LE SIEN : le lieu de la
       session est une adresse, elle n'est que dans un pays. */
    reproches.push('La session est en « ' + mode + ' » pour ' + code + ' sans lieu propre à ce '
      + 'pays : elle reprendrait l’adresse de la session, qui se trouve ailleurs. Indiquez le '
      + 'lieu de ' + code + ', ou passez ce pays « En ligne ».');
  });

  return reproches;
}

/* Un pays EN LIGNE ne garde pas d'adresse, et un pays décoché n'emporte pas ses
   réglages. Le tableau de bord masque déjà le champ et oublie les cases
   décochées, mais la valeur partait quand même dans la charge : elle serait
   ressortie le jour où le pays repasse en présentiel, sans que personne l'ait
   relue. On ne touche à rien quand la charge ne mentionne pas `parPays` :
   une modification ne doit toucher que ce qu'on lui confie. */
function nettoyerParPays(s) {
  if (!s || !s.parPays || typeof s.parPays !== 'object' || Array.isArray(s.parPays)) return;
  var coches = String(s.pays || '').split(',').map(function (c) {
    return c.trim().toUpperCase();
  }).filter(Boolean);
  var propre = {};
  Object.keys(s.parPays).forEach(function (code) {
    var reglage = s.parPays[code];
    if (!reglage || typeof reglage !== 'object' || Array.isArray(reglage)) return;
    var CODE = String(code).toUpperCase();
    if (coches.length && coches.indexOf(CODE) < 0) return;
    var garde = {};
    if (typeof reglage.mode === 'string' && reglage.mode.trim()) garde.mode = reglage.mode.trim();
    if (typeof reglage.tarif === 'number' && isFinite(reglage.tarif)) garde.tarif = reglage.tarif;
    var enLigne = /^en ligne$/i.test(garde.mode || String(s.mode || '').trim());
    if (!enLigne && typeof reglage.lieu === 'string' && reglage.lieu.trim()) {
      garde.lieu = reglage.lieu.trim();
    }
    if (Object.keys(garde).length) propre[CODE] = garde;
  });
  s.parPays = propre;
}

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
  nettoyerParPays(s);
  var reproches = reprochesPaysSession(s);
  if (reproches.length) throw new Error(reproches.join(' '));

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

  /* L'indicatif s'affiche collé devant le numéro que tape le candidat. Y glisser
     un numéro complet produit un téléphone inutilisable — « +269 380 46 483801234 »
     — sans que rien ne le signale au moment de l'inscription. */
  if (p.indicatif) {
    p.indicatif = String(p.indicatif).trim();
    if (!/^\+\d{1,4}$/.test(p.indicatif)) {
      throw new Error('L’indicatif ne contient que le « + » et l’indicatif du pays, sans espace ni '
        + 'numéro : +253, +269… Reçu : « ' + p.indicatif + ' ». '
        + 'Un numéro de contact se saisit dans whatsappNumber.');
    }
  }

  // Un motif de numéro invalide bloquerait toutes les inscriptions du pays
  if (p.motifTelephone) {
    try { new RegExp(p.motifTelephone); }
    catch (err) { throw new Error('Le format de numéro n’est pas une expression valide : ' + p.motifTelephone); }
  }

  /* L'exemple est ce que le candidat a sous les yeux et recopie. S'il ne
     satisfait pas le format annoncé, on refuse exactement ce qu'on vient de
     lui montrer. Un gabarit — 77XXXXXX — reste permis : il n'est pas un numéro. */
  if (p.exempleTelephone) {
    p.exempleTelephone = String(p.exempleTelephone).trim();
    if (p.motifTelephone && !/X/i.test(p.exempleTelephone)
      && !new RegExp(p.motifTelephone).test(p.exempleTelephone)) {
      throw new Error('L’exemple « ' + p.exempleTelephone + ' » ne respecte pas le format accepté ('
        + p.motifTelephone + ') : un candidat qui le recopierait serait refusé. '
        + 'Mettez un gabarit, comme 77XXXXXX. Votre vrai numéro de contact se saisit '
        + 'dans « Contact dans ce pays ».');
    }
  }
  if (!Array.isArray(p.paymentMethods)) p.paymentMethods = [];

  /* FERMER LE DERNIER PAYS OUVERT revient à supprimer le seul : le site
     n'aurait plus ni devise, ni format de numéro, ni moyen de paiement, et le
     formulaire ne proposerait plus aucun choix. La SUPPRESSION est déjà
     refusée pour cette raison exacte ; la désactivation produisait le même
     résultat sans rencontrer le moindre garde-fou. */
  if (p.active === false) {
    var autresOuverts = lireTable(F_PAYS, CHAMPS_PAYS).filter(function (autre) {
      return autre.code !== p.code && autre.active !== false;
    });
    if (!autresOuverts.length) {
      throw new Error('C’est le dernier pays proposé : le site n’aurait plus ni devise, ni format '
        + 'de numéro, ni moyen de paiement. Ouvrez-en un autre avant de fermer celui-ci.');
    }
    /* Un pays fermé ne peut pas rester celui par défaut : c'est lui que verrait
       un visiteur qui n'a rien choisi. On passe la main à un pays ouvert, comme
       le fait déjà la suppression. */
    if (!autresOuverts.some(function (autre) { return autre.defaut === true; })) {
      autresOuverts[0].defaut = true;
      ecrireLigne(F_PAYS, CHAMPS_PAYS, autresOuverts[0], 'code');
    }
    p.defaut = false;
  }


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
    /* Une session peut être proposée dans PLUSIEURS pays — « DJ,KM ». Comparer
       la chaîne entière laissait supprimer un pays encore cité parmi d'autres :
       la session serait restée, en renvoyant à un pays disparu. */
    return String(s.pays || '').split(',').some(function (c) {
      return c.trim().toUpperCase() === code;
    });
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

// --------------------------- VISUELS DU SITE -----------------------------

/* ---------------------------------------------------------------------------
   POURQUOI L'ONGLET IMAGES NE PASSE PLUS PAR lirePaires / ecrirePaires

   Une photo remplacée depuis le tableau de bord ne s'affichait pas comme celle
   livrée avec le design : chaque emplacement du site impose un cadrage taillé
   pour la photo d'origine, et la nouvelle arrivait décapitée ou de travers.
   Recadrer le fichier lui-même serait sans retour — le réglage ne se reprendrait
   plus sans renvoyer la photo. Position et zoom sont donc rangés À CÔTÉ de
   l'adresse, dans une TROISIÈME colonne.

   lirePaires et ecrirePaires servent aussi Textes et Reglages, qui n'ont que
   deux colonnes et n'ont rien demandé. Les élargir leur aurait fait porter ce
   risque ; l'onglet Images a donc sa propre lecture et sa propre écriture.
   --------------------------------------------------------------------------- */

/** Bornes du cadrage, hors desquelles la photo n'est plus montrable. */
var CADRAGE_POSITION_MIN = 0;
var CADRAGE_POSITION_MAX = 100;
var CADRAGE_ZOOM_MIN = 100;
var CADRAGE_ZOOM_MAX = 250;

/**
 * Visuels du site remplaces depuis le tableau de bord (cle -> adresse).
 *
 * `grille` est la feuille déjà lue, que lireCatalogue partage avec lireCadrages :
 * chaque opération Sheets est un aller-retour réseau, et lireCatalogue est
 * rappelé après CHAQUE écriture du tableau de bord. Sans ce partage, l'onglet
 * était lu deux fois par appel. Le paramètre reste facultatif pour que la
 * fonction s'appelle encore seule.
 */
function lireImages(grille) {
  if (!grille) grille = onglet(F_IMAGES).getDataRange().getValues();
  var o = {};
  for (var i = 1; i < grille.length; i++) {
    var cle = String(grille[i][0] || '').trim();
    if (!cle) continue;
    var adresse = grille[i][1];
    if (adresse === '' || adresse === null || adresse === undefined) continue;
    o[cle] = String(adresse);
  }
  return o;
}

/**
 * Cadrage de chaque visuel (cle -> {x, y, zoom}), lu dans la TROISIÈME colonne.
 *
 * Un classeur déjà en service n'a que deux colonnes : la cellule est alors
 * absente, et la clé n'apparaît simplement pas. Sans cela, toute installation
 * existante aurait cessé de servir ses visuels du jour au lendemain.
 *
 * `grille` est la feuille déjà lue, partagée avec lireImages — voir cette
 * dernière. Cette boucle reste SÉPARÉE de la sienne à dessein : les deux ne
 * s'accordent pas sur ce qu'est une ligne valable, lireImages écartant les
 * adresses vides là où le cadrage ne les regarde pas. Les fondre trancherait
 * cette question au passage, sans qu'aucun contrôle ne la couvre.
 */
function lireCadrages(grille) {
  if (!grille) grille = onglet(F_IMAGES).getDataRange().getValues();
  var o = {};
  for (var i = 1; i < grille.length; i++) {
    var cle = String(grille[i][0] || '').trim();
    if (!cle) continue;
    var cadrage = normaliserCadrage(grille[i][2]);
    if (cadrage) o[cle] = cadrage;
  }
  return o;
}

/**
 * Ramène un cadrage à une forme sûre, ou rend null s'il n'en est pas un.
 *
 * Le brut arrive soit du tableau de bord (objet), soit de la cellule (chaîne
 * JSON). Il vient d'une requête : rien ne garantit qu'il sorte du réglage prévu.
 * Un zoom sous 100 laisserait du vide autour de la photo, au-delà de 250 il ne
 * resterait qu'un détail méconnaissable, et une position hors de 0–100 sortirait
 * la photo du cadre. Ce qui dépasse est ramené dans ses bornes ; ce qui ne se
 * lit pas est écarté, car un cadrage à moitié faux déplacerait la photo sans
 * qu'aucun écran ne dise pourquoi.
 */
function normaliserCadrage(brut) {
  if (brut === '' || brut === null || brut === undefined) return null;
  if (typeof brut === 'string') {
    var texte = brut.trim();
    if (!texte) return null;
    try { brut = JSON.parse(texte); } catch (e) { return null; }
  }
  if (!brut || typeof brut !== 'object') return null;

  var x = bornerCadrage(brut.x, CADRAGE_POSITION_MIN, CADRAGE_POSITION_MAX);
  var y = bornerCadrage(brut.y, CADRAGE_POSITION_MIN, CADRAGE_POSITION_MAX);
  var zoom = bornerCadrage(brut.zoom, CADRAGE_ZOOM_MIN, CADRAGE_ZOOM_MAX);
  if (x === null || y === null || zoom === null) return null;
  return { x: x, y: y, zoom: zoom };
}

/**
 * Une mesure du cadrage, ramenée dans ses bornes, ou null si ce n'en est pas une.
 * null et la chaîne vide sont écartés avant toute conversion : Number(null) vaut
 * zéro, et un cadrage absent serait alors passé pour un cadrage collé en haut à
 * gauche.
 */
function bornerCadrage(valeur, mini, maxi) {
  if (valeur === '' || valeur === null || valeur === undefined) return null;
  var n = Number(valeur);
  if (isNaN(n) || !isFinite(n)) return null;
  return Math.round(Math.min(maxi, Math.max(mini, n)));
}

/**
 * Visuels du site : adresse et cadrage écrits ENSEMBLE, en une seule passe.
 *
 * Une adresse vide REMET l'image d'origine : la ligne entière disparaît, cadrage
 * compris, et la page réaffiche ce que son HTML contient. Le vide porte sur
 * l'ADRESSE et non sur l'objet reçu — sans quoi « retirer le remplacement »
 * laisserait une ligne tenue par son seul cadrage, qui ne recadre plus rien et
 * que plus aucune commande ne viendrait jamais effacer.
 *
 * ATTENTION, LA CHARGE FAIT AUTORITÉ : un cadrage que `cadrages` ne renvoie pas
 * est EFFACÉ, et non conservé — contrairement à ecrireLigne, où une colonne non
 * mentionnée garde sa valeur. Tout appelant doit donc renvoyer les cadrages
 * qu'il veut garder. Le tableau de bord n'envoie aujourd'hui que `donnees` :
 * un cadrage posé à la main dans la feuille disparaîtrait au premier
 * « Enregistrer les visuels ». C'est sans effet tant que rien ne règle de
 * cadrage, mais l'interface de réglage devra les joindre à chaque envoi.
 */
function enregistrerImages(donnees, cadrages) {
  if (!donnees || typeof donnees !== 'object') throw new Error('Visuels invalides.');
  if (!cadrages || typeof cadrages !== 'object') cadrages = {};

  var feuille = onglet(F_IMAGES);
  assurerEntetes(feuille, ['cle', 'valeur', 'cadrage']);

  var grille = feuille.getDataRange().getValues();
  var ordre = [], table = {};
  for (var i = 1; i < grille.length; i++) {
    var existante = String(grille[i][0] || '').trim();
    if (!existante) continue;
    if (!Object.prototype.hasOwnProperty.call(table, existante)) ordre.push(existante);
    table[existante] = [grille[i][1], grille[i][2]];
  }

  Object.keys(donnees).forEach(function (cle) {
    var adresse = donnees[cle];
    if (adresse === null || adresse === undefined || String(adresse).trim() === '') {
      delete table[cle];
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(table, cle)) ordre.push(cle);
    var cadrage = normaliserCadrage(cadrages[cle]);
    table[cle] = [
      forcerTexte(typeof adresse === 'string' ? adresse : JSON.stringify(adresse)),
      cadrage ? forcerTexte(JSON.stringify(cadrage)) : ''
    ];
  });

  var corps = ordre
    .filter(function (cle) { return Object.prototype.hasOwnProperty.call(table, cle); })
    .map(function (cle) { return [cle, table[cle][0], table[cle][1]]; });

  // On efface l'ancien corps avant de réécrire : sinon une clé supprimée subsisterait
  var anciennes = Math.max(0, grille.length - 1);
  if (anciennes) feuille.getRange(2, 1, anciennes, 3).clearContent();
  if (corps.length) feuille.getRange(2, 1, corps.length, 3).setValues(corps);
  return { ok: true, catalogue: lireCatalogue() };
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
    /* motDePasseAdmin() ne rend jamais la valeur d'usine : elle vaut « rien de
       configuré », et l'administration reste alors fermée. */
    motDePasseConfigure: !!motDePasseAdmin(),
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
  Logger.log('Mot de passe configuré : ' + (verifierMotDePasse(motDePasseAdmin())
    ? 'oui' : 'NON — renseignez la propriété MOT_DE_PASSE_ADMIN, ou la constante du fichier'));

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

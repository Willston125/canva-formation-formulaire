/* =========================================================================
   IMPACTALI — Tableau de bord
   Interface d'administration du site. Les données vivent dans la feuille
   Google, l'Apps Script sert d'API. Le mot de passe accompagne chaque
   écriture : il n'est jamais inscrit dans le code, seulement saisi ici.
   ========================================================================= */
(function () {
  'use strict';

  var API = (window.SITE_ENDPOINTS && window.SITE_ENDPOINTS.registration) || '';
  var CLE_MDP = 'impactali_admin_mdp';

  /** État courant, rechargé à chaque écriture depuis la réponse de l'API. */
  var etat = {
    motDePasse: '',
    catalogue: { formations: [], sessions: [], pays: [], portfolio: [], reglages: {} },
    inscriptions: [],
    vue: 'apercu',
    filtreInscriptions: '',
    /** Visuels remplacés, mis à la corbeille seulement après enregistrement. */
    imagesARetirer: []
  };

  // ------------------------------- OUTILS --------------------------------

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function echapper(v) {
    var d = document.createElement('div');
    d.textContent = v === null || v === undefined ? '' : String(v);
    return d.innerHTML;
  }

  /**
   * Le texte propre d'un élément, sans celui de ses enfants.
   *
   * Un libellé porte parfois un enfant — le chevron d'un accordéon, dont la
   * ligature s'écrit « expand_more ». textContent le ramassait : le tableau de
   * bord affichait « Les formations sont-elles accessibles ?expand_more » comme
   * texte actuel, et l'enregistrer effaçait le chevron sur le site.
   */
  function texteSeulDe(el) {
    return Array.prototype.slice.call(el.childNodes)
      .filter(function (n) { return n.nodeType === 3; })
      .map(function (n) { return n.nodeValue; }).join('');
  }

  /**
   * Rend absolue l'adresse d'une image relevée sur une page du site.
   *
   * Les pages déclarent leurs visuels en relatif — « assets/images/… ». Le
   * tableau de bord, lui, vit dans /admin/ : la même adresse y désignait
   * /admin/assets/images/…, qui n'existe pas. Tous les aperçus de visuels non
   * remplacés étaient donc des images cassées. On résout donc chaque adresse
   * par rapport à la page où elle a été relevée, et non par rapport à /admin/.
   */
  function adresseAbsolue(src, adressePage) {
    if (!src || /^(?:https?:|data:|\/\/|\/)/.test(src)) return src;
    try { return new URL(src, window.location.origin + (adressePage || '/')).pathname; }
    catch (e) { return src; }
  }

  function dateFr(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function dateHeureFr(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function identifiant(prefixe) {
    return prefixe + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function enLien(texte) {
    return String(texte || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function afficherMessage(selecteur, texte, duree) {
    var el = $(selecteur);
    if (!el) return;
    el.textContent = texte;
    el.hidden = false;
    if (duree) window.setTimeout(function () { el.hidden = true; }, duree);
  }

  function masquerMessages() {
    $('#erreur-globale').hidden = true;
    $('#succes-globale').hidden = true;
  }

  function attente(bouton, actif) {
    if (!bouton) return;
    bouton.disabled = actif;
    var t = bouton.querySelector('.btn-texte'), a = bouton.querySelector('.btn-attente');
    if (t) t.hidden = actif;
    if (a) a.hidden = !actif;
  }

  // ------------------------------- API -----------------------------------

  /**
   * Appel d'écriture. Le corps part en text/plain : requête simple, donc sans
   * requête préalable — Apps Script ne sait pas traiter celle-ci.
   * La réponse est lue : un échec est un échec, jamais un succès silencieux.
   */
  /* Délais d'attente. Une écriture ordinaire répond en quelques secondes ;
     l'amorçage écrit quatorze lignes d'un coup sur un projet Google qui démarre
     à froid, et mérite plus de patience. Abandonner trop tôt laisserait croire
     que rien ne s'est passé alors que le serveur travaille encore. */
  var DELAIS = { 'admin.importer': 120000 };

  function appeler(action, charge) {
    if (!API) return Promise.reject(new Error('Adresse de l’API non configurée dans formations-data.js.'));
    var corps = Object.assign({ action: action, motDePasse: etat.motDePasse }, charge || {});
    var expiration = new Promise(function (_, rejeter) {
      window.setTimeout(function () { rejeter(new Error('Le serveur met trop de temps à répondre.')); },
        DELAIS[action] || 30000);
    });
    var envoi = fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corps)
    }).then(function (r) {
      if (!r.ok) throw new Error('Le serveur a répondu ' + r.status + '.');
      return r.text();
    }).then(function (t) {
      var d;
      try { d = JSON.parse(t); } catch (e) { throw new Error('Réponse inattendue du serveur.'); }
      if (!d || d.ok !== true) {
        var err = new Error(d && d.erreur ? nettoyerErreur(d.erreur) : 'Le serveur a refusé la demande.');
        if (d && d.authentification === false) err.authentification = false;
        throw err;
      }
      if (d.catalogue) { etat.catalogue = d.catalogue; signalerModification(); }
      return d;
    });
    return Promise.race([envoi, expiration]);
  }

  /**
   * Prévient les onglets du site qu'une donnée vient de changer.
   *
   * Chaque page garde le catalogue une minute en mémoire d'onglet pour ne pas
   * rappeler le serveur à chaque navigation. Sans ce repère, une modification
   * enregistrée ici met jusqu'à une minute à se voir : on actualise le site, et
   * l'ancienne valeur revient — au point de croire l'enregistrement perdu.
   * localStorage est partagé par tous les onglets du même site, contrairement à
   * sessionStorage : c'est ce qui permet d'avertir l'onglet d'à côté.
   */
  function signalerModification() {
    try { localStorage.setItem('impactali_maj', String(Date.now())); } catch (e) { /* stockage refusé */ }
  }

  /** Apps Script préfixe ses erreurs par « Error: » : inutile de l'infliger à l'utilisateur. */
  function nettoyerErreur(brut) {
    return String(brut).replace(/^Error:\s*/, '').replace(/^Exception:\s*/, '');
  }

  function messageLisible(err) {
    var m = err && err.message ? String(err.message) : '';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'La connexion au serveur n’a pas abouti.';
    return m || 'Erreur inconnue.';
  }

  // ----------------------------- CONNEXION -------------------------------

  function initConnexion() {
    var memorise = '';
    try { memorise = localStorage.getItem(CLE_MDP) || sessionStorage.getItem(CLE_MDP) || ''; } catch (e) { }
    if (memorise) {
      etat.motDePasse = memorise;
      connecter(true);
      return;
    }
    $('#form-connexion').addEventListener('submit', function (e) {
      e.preventDefault();
      etat.motDePasse = $('#mot-de-passe').value;
      connecter(false);
    });
  }

  /**
   * Vérifie que le script Google déployé connaît bien l'API d'administration.
   * Sans ce contrôle, une version antérieure du script prendrait la commande de
   * connexion pour une inscription : elle écrirait une ligne vide dans la feuille
   * et enverrait un email parasite. On préfère refuser et le dire clairement.
   * En cas d'injoignabilité, on laisse passer : l'envoi rapportera lui-même l'échec.
   */
  function verifierApi() {
    if (!API) return Promise.resolve(true);
    var cible = API + (API.indexOf('?') >= 0 ? '&' : '?') + 'action=catalogue';
    return fetch(cible, { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return !(d && d.erreur && !d.formations); })
      .catch(function () { return true; });
  }

  function connecter(silencieux) {
    var bouton = $('#btn-connexion');
    var erreur = $('#erreur-connexion');
    erreur.hidden = true;
    attente(bouton, true);

    verifierApi().then(function (apiPrete) {
      if (!apiPrete) {
        var e = new Error('Le script Google n’est pas encore à jour : il ne connaît pas l’administration. '
          + 'Installez la nouvelle version du script, puis déployez une nouvelle version.');
        e.apiObsolete = true;
        return Promise.reject(e);
      }
      return appeler('admin.login', {});
    }).then(function () {
      try {
        var durable = $('#rester-connecte') && $('#rester-connecte').checked;
        (durable ? localStorage : sessionStorage).setItem(CLE_MDP, etat.motDePasse);
      } catch (e) { }
      $('#connexion').hidden = true;
      $('#app').hidden = false;
      demarrer();
    }).catch(function (err) {
      attente(bouton, false);
      /* Une coupure de réseau, ou un script pas encore republié, ne rend pas le
         mot de passe faux. L'oublier obligeait à le retaper — et, en ouverture
         silencieuse, sans le moindre message : une seconde de connexion perdue
         suffisait. On ne l'oublie donc que si le serveur l'a vraiment refusé. */
      var refuse = !!(err && err.authentification === false);
      if (refuse) {
        etat.motDePasse = '';
        try { localStorage.removeItem(CLE_MDP); sessionStorage.removeItem(CLE_MDP); } catch (e) { }
      }
      if (silencieux) {
        // On redonne la main sur le formulaire
        $('#form-connexion').addEventListener('submit', function (e) {
          e.preventDefault();
          etat.motDePasse = $('#mot-de-passe').value;
          connecter(false);
        });
        /* Un mot de passe devenu invalide se passe de commentaire : le champ est
           là, il suffit de le retaper. Tout le reste doit s'expliquer. */
        if (refuse) return;
      }
      erreur.textContent = messageLisible(err);
      erreur.hidden = false;
    });
  }

  function deconnecter() {
    try { localStorage.removeItem(CLE_MDP); sessionStorage.removeItem(CLE_MDP); } catch (e) { }
    window.location.reload();
  }

  // ------------------------------ DÉMARRAGE ------------------------------

  function demarrer() {
    $$('.onglet').forEach(function (o) {
      o.addEventListener('click', function () { allerA(o.dataset.vue); });
    });
    $('#btn-deconnexion').addEventListener('click', deconnecter);
    $('#btn-menu').addEventListener('click', function () { $('#barre').classList.toggle('is-ouverte'); });
    $$('[data-fermer-panneau]').forEach(function (b) { b.addEventListener('click', fermerPanneau); });
    $$('[data-fermer-confirmation]').forEach(function (b) { b.addEventListener('click', fermerConfirmation); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#panneau').hidden) fermerPanneau();
      else if (!$('#confirmation').hidden) fermerConfirmation();
    });
    var importer = $('#btn-importer');
    if (importer) importer.addEventListener('click', importerCatalogueDuSite);

    afficherEtatDuScript();
    rafraichirTout();
  }

  /**
   * Affiche, en pied de menu, la version du script réellement servie par Google
   * et l'état de l'autorisation Drive. Sans cela, « j'ai collé le code mais rien
   * ne change » est indiscernable d'un défaut du tableau de bord.
   */
  function afficherEtatDuScript() {
    var pied = $('#etat-script');
    if (!pied || !API) return;
    fetch(API + (API.indexOf('?') >= 0 ? '&' : '?') + 'action=version', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.version) {
          pied.innerHTML = '<span class="etiquette etiquette--alerte">Script à mettre à jour</span>';
          return;
        }
        /* Version servie ≠ version attendue : Google sert encore l'ancien code.
           C'est invisible autrement — les commandes répondent, mais avec les
           règles d'hier. On le dit avant tout le reste. */
        var attendue = (window.SITE_ENDPOINTS && window.SITE_ENDPOINTS.versionScript) || '';
        var perime = attendue && d.version !== attendue;

        var drive = d.drive
          ? '<span class="etiquette etiquette--ouvert">Drive autorisé</span>'
          : '<span class="etiquette etiquette--alerte">Drive non autorisé</span>';
        pied.innerHTML = (perime ? '<span class="etiquette etiquette--alerte">Script périmé</span>' : drive)
          + '<span class="etat-script__version">script ' + echapper(d.version) + '</span>';

        if (perime) {
          afficherMessage('#erreur-globale',
            'Google sert encore l’ancienne version du script : ' + d.version
            + ', alors que le site attend ' + attendue + '. Vos modifications passeront peut-être, '
            + 'mais avec les règles d’avant. Dans l’éditeur Apps Script : collez le fichier, '
            + 'ENREGISTREZ (Ctrl+S), puis Déployer → Gérer les déploiements → crayon → '
            + 'Version : « Nouvelle version » → Déployer.');
          return;
        }
        if (!d.drive) {
          afficherMessage('#erreur-globale',
            'L’envoi d’images ne fonctionnera pas : l’autorisation Google Drive n’a pas été accordée. '
            + 'Dans l’éditeur Apps Script, lancez la fonction testerInstallation, acceptez l’autorisation, '
            + 'puis republiez une nouvelle version du déploiement.');
        }
      })
      .catch(function () { /* diagnostic indisponible : sans conséquence */ });
  }

  function rafraichirTout() {
    return appeler('admin.catalogue', {})
      .then(function () { return appeler('admin.inscriptions', {}); })
      .then(function (d) { etat.inscriptions = d.inscriptions || []; })
      .catch(function (err) { afficherMessage('#erreur-globale', messageLisible(err)); })
      .then(function () { rendre(); });
  }

  function allerA(vue) {
    etat.vue = vue;
    masquerMessages();
    /* Changer de vue, c'est renoncer à ce qu'on y faisait. La vue « Visuels »
       n'est pas un panneau : rien ne vidait donc sa file de visuels remplacés,
       et le premier enregistrement fait AILLEURS mettait à la corbeille Drive
       une image que la feuille référence toujours — image cassée sur le site. */
    etat.imagesARetirer = [];
    $$('.onglet').forEach(function (o) { o.classList.toggle('is-actif', o.dataset.vue === vue); });
    $$('.vue').forEach(function (v) { v.classList.toggle('is-actif', v.id === 'vue-' + vue); });
    $('#barre').classList.remove('is-ouverte');
    var titres = {
      apercu: ['Vue d’ensemble', 'État du site et raccourcis'],
      formations: ['Formations', 'Le catalogue publié sur le site'],
      sessions: ['Sessions', 'Les dates ouvertes à l’inscription'],
      inscriptions: ['Inscriptions', 'Les candidats et leur suivi'],
      pays: ['Pays', 'Devise, indicatif et moyens de paiement de chaque marché'],
      portfolio: ['Réalisations', 'Les travaux mis en avant sur l’accueil'],
      visuels: ['Visuels du site', 'Les images de l’accueil et des fiches'],
      textes: ['Textes du site', 'Les mots affichés sur la page d’accueil'],
      reglages: ['Réglages', 'Contact et lieu habituel']
    };
    $('#titre-vue').textContent = titres[vue][0];
    $('#sous-titre-vue').textContent = titres[vue][1];
    rendre();
  }

  // ------------------------------- RENDU ---------------------------------

  function rendre() {
    var f = etat.catalogue.formations || [];
    var s = etat.catalogue.sessions || [];
    $('#compte-formations').textContent = f.length || '';
    $('#compte-sessions').textContent = s.length || '';
    $('#compte-inscriptions').textContent = etat.inscriptions.length || '';
    $('#compte-pays').textContent = (etat.catalogue.pays || []).length || '';
    $('#compte-portfolio').textContent = (etat.catalogue.portfolio || []).length || '';
    $('#bloc-amorcage').hidden = f.length > 0;

    var actions = { apercu: '', formations: '', sessions: '', inscriptions: '', pays: '', portfolio: '', visuels: '', textes: '', reglages: '' };
    actions.formations = '<button class="bouton bouton--primaire" type="button" id="btn-nouvelle-formation">'
      + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Nouvelle formation</button>';
    actions.sessions = '<button class="bouton bouton--primaire" type="button" id="btn-nouvelle-session">'
      + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Nouvelle session</button>';
    actions.portfolio = '<button class="bouton bouton--primaire" type="button" id="btn-nouvelle-realisation">'
      + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Nouvelle réalisation</button>';
    actions.pays = '<button class="bouton bouton--primaire" type="button" id="btn-nouveau-pays">'
      + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Nouveau pays</button>';
    actions.inscriptions = etat.inscriptions.length
      ? '<button class="bouton bouton--discret" type="button" id="btn-export">'
        + '<span class="material-symbols-outlined" aria-hidden="true">download</span>Exporter (CSV)</button>' : '';
    actions.apercu = '<button class="bouton bouton--discret" type="button" id="btn-rafraichir">'
      + '<span class="material-symbols-outlined" aria-hidden="true">refresh</span>Actualiser</button>';
    $('#actions-vue').innerHTML = actions[etat.vue] || '';

    var b;
    if ((b = $('#btn-nouvelle-formation'))) b.addEventListener('click', function () { ouvrirFormation(null); });
    if ((b = $('#btn-nouvelle-session'))) b.addEventListener('click', function () { ouvrirSession(null); });
    if ((b = $('#btn-nouveau-pays'))) b.addEventListener('click', function () { ouvrirPays(null); });
    if ((b = $('#btn-nouvelle-realisation'))) b.addEventListener('click', function () { ouvrirRealisation(null); });
    if ((b = $('#btn-export'))) b.addEventListener('click', exporterCsv);
    if ((b = $('#btn-rafraichir'))) b.addEventListener('click', function () {
      afficherMessage('#succes-globale', 'Actualisation…', 1200);
      rafraichirTout();
    });

    if (etat.vue === 'apercu') rendreApercu();
    if (etat.vue === 'formations') rendreFormations();
    if (etat.vue === 'sessions') rendreSessions();
    if (etat.vue === 'inscriptions') rendreInscriptions();
    if (etat.vue === 'pays') rendrePays();
    if (etat.vue === 'portfolio') rendrePortfolio();
    if (etat.vue === 'visuels') rendreVisuels();
    if (etat.vue === 'textes') rendreTextes();
    if (etat.vue === 'reglages') rendreReglages();
  }

  function rendreApercu() {
    var f = etat.catalogue.formations || [];
    var s = etat.catalogue.sessions || [];
    var aujourdhui = new Date().toISOString().slice(0, 10);
    var aVenir = s.filter(function (x) { return x.startDate >= aujourdhui; });
    var ouvertes = aVenir.filter(function (x) { return x.registrationOpen; });
    var placesRestantes = aVenir.reduce(function (n, x) {
      return n + (typeof x.placesTotal === 'number' ? Math.max(0, x.placesTotal - compterSession(x.id)) : 0);
    }, 0);

    $('#cartes-apercu').innerHTML = [
      carte(f.filter(function (x) { return x.active !== false; }).length, 'Formations publiées', 'accent'),
      carte(ouvertes.length, 'Sessions ouvertes', ''),
      carte(etat.inscriptions.length, 'Inscriptions reçues', ''),
      carte(placesRestantes, 'Places encore libres', placesRestantes === 0 && aVenir.length ? 'alerte' : '')
    ].join('');

    var recentes = etat.inscriptions.slice(0, 5);
    $('#apercu-inscriptions').innerHTML = recentes.length ? tableau(
      ['Candidat', 'Formation', 'Reçue le', ''],
      recentes.map(function (i) {
        return ['<div class="cellule-titre">' + echapper([i.nom, i.prenom].filter(Boolean).join(' ')) + '</div>'
          + '<div class="cellule-sous">' + echapper(i.telephone || '') + '</div>',
          echapper(i.formationTitle || i.formationId || '—'),
          echapper(dateHeureFr(i['Horodatage réception'] || i.dateInscription)),
          boutonWhatsapp(i)];
      })
    ) : vide('inbox', 'Aucune inscription pour le moment.');
  }

  function carte(valeur, libelle, variante) {
    return '<div class="carte' + (variante ? ' carte--' + variante : '') + '">'
      + '<div class="carte__valeur">' + valeur + '</div>'
      + '<div class="carte__libelle">' + libelle + '</div></div>';
  }

  function tableau(entetes, lignes) {
    return '<div class="tableau-boite"><div class="tableau-defile"><table class="tableau"><thead><tr>'
      + entetes.map(function (e) { return '<th>' + e + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + lignes.map(function (l) {
        return '<tr>' + l.map(function (c, i) {
          return '<td' + (i === l.length - 1 ? ' style="text-align:right"' : '') + '>' + c + '</td>';
        }).join('') + '</tr>';
      }).join('')
      + '</tbody></table></div></div>';
  }

  function vide(icone, texte) {
    return '<div class="tableau-boite"><div class="vide">'
      + '<span class="material-symbols-outlined" aria-hidden="true">' + icone + '</span>' + echapper(texte) + '</div></div>';
  }

  function compterSession(id) {
    return etat.inscriptions.filter(function (i) { return i.sessionId === id; }).length;
  }

  // ----------------------------- RÉALISATIONS -----------------------------

  function listeRealisations() {
    return (etat.catalogue.portfolio || []).filter(function (r) { return r && r.id; });
  }

  function rendrePortfolio() {
    var liste = listeRealisations();
    if (!liste.length) {
      $('#liste-portfolio').innerHTML = vide('photo_library',
        'Aucune réalisation. Importez le catalogue du site depuis la vue d’ensemble, ou créez-en une.');
      return;
    }
    $('#liste-portfolio').innerHTML = tableau(
      ['Réalisation', 'Catégorie', 'Visuel', 'Actions'],
      liste.map(function (x) {
        return [
          '<div class="cellule-titre">' + echapper(x.title || '(sans titre)') + '</div>'
          + '<div class="cellule-sous">' + echapper((x.description || '').slice(0, 80)) + '</div>',
          echapper(x.category || '—'),
          x.image
            ? '<img src="' + echapper(x.image) + '" alt="" class="vignette" loading="lazy">'
            : '<span class="etiquette etiquette--alerte">À fournir</span>',
          '<div class="cellule-actions">'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-modifier-realisation="' + echapper(x.id) + '">Modifier</button>'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-supprimer-realisation="' + echapper(x.id) + '">Supprimer</button>'
          + '</div>'
        ];
      })
    );
    $$('[data-modifier-realisation]').forEach(function (b) {
      b.addEventListener('click', function () { ouvrirRealisation(b.dataset.modifierRealisation); });
    });
    $$('[data-supprimer-realisation]').forEach(function (b) {
      b.addEventListener('click', function () { demanderSuppressionRealisation(b.dataset.supprimerRealisation); });
    });
  }

  var CHAMPS_REALISATION = [
    { section: 'La réalisation' },
    { cle: 'title', libelle: 'Titre', type: 'text', requis: true, large: true },
    { cle: 'category', libelle: 'Catégorie', type: 'text',
      aide: 'Affichée au-dessus du titre. Ex. Affiche, Vidéo, Identité visuelle.' },
    { cle: 'href', libelle: 'Lien (facultatif)', type: 'url', aide: 'Vers le projet publié, si vous en avez un. Ignoré si une vidéo est renseignée.' },
    { cle: 'video', libelle: 'Vidéo YouTube (facultatif)', type: 'url', large: true,
      aide: 'Collez le lien de la vidéo : youtube.com/watch?v=… ou youtu.be/… La carte affiche alors '
        + 'un bouton de lecture, et la vidéo s’ouvre sur le site. Sans visuel téléversé, la miniature '
        + 'de YouTube est utilisée.' },
    { cle: 'description', libelle: 'Description', type: 'textarea', large: true },

    { section: 'Visuel' },
    { cle: 'image', libelle: 'Image', type: 'image', format: 'portfolio', large: true,
      aide: 'Sans image, l’accueil annonce « visuel à fournir » plutôt que d’afficher un cadre vide.' },
    { cle: 'imageAlt', libelle: 'Description de l’image', type: 'text', large: true,
      aide: 'Lue par les personnes malvoyantes et par Google.' },
    /* Le recadrage se choisit en mots : « 50% 18% » ne dit rien à personne,
       alors que « haut » décrit exactement ce qu'on veut garder du visuel. */
    { cle: 'imagePosition', libelle: 'Partie de l’image à privilégier', type: 'select',
      optionsObjets: [
        { valeur: '50% 50%', libelle: 'Centre' },
        { valeur: '50% 18%', libelle: 'Haut' },
        { valeur: '50% 85%', libelle: 'Bas' },
        { valeur: '20% 50%', libelle: 'Gauche' },
        { valeur: '80% 50%', libelle: 'Droite' }
      ], aide: 'Utile quand le cadre rogne le visuel.' },

    { section: 'Affichage' },
    { cle: 'ordre', libelle: 'Ordre d’affichage', type: 'number', aide: 'Plus petit = affiché en premier.' }
  ];

  function ouvrirRealisation(id) {
    var r = id ? listeRealisations().filter(function (x) { return x.id === id; })[0] : null;
    var donnees = r ? Object.assign({}, r) : {
      id: identifiant('real'), imagePosition: '50% 50%', ordre: listeRealisations().length
    };
    ouvrirPanneau(r ? 'Modifier la réalisation' : 'Nouvelle réalisation', CHAMPS_REALISATION, donnees,
      function (valeurs, fini) {
        valeurs.id = donnees.id;
        appeler('admin.portfolio.save', { donnees: valeurs }).then(function (d) {
          viderCorbeilleImages();
          fermerPanneau();
          afficherMessage('#succes-globale', d.cree ? 'Réalisation ajoutée.' : 'Réalisation mise à jour.', 5000);
          rendre();
        }).catch(function (err) { fini(messageLisible(err)); });
      });
  }

  function demanderSuppressionRealisation(id) {
    var r = listeRealisations().filter(function (x) { return x.id === id; })[0];
    if (!r) return;

    /* Une base vide n'efface pas l'accueil : le site retombe alors sur les
       réalisations de son fichier. Supprimer la DERNIÈRE ferait donc réapparaître
       toutes celles qu'on croyait supprimées. On refuse plutôt que de produire
       ce résultat incompréhensible — même règle que pour le dernier pays. */
    if (listeRealisations().length <= 1) {
      afficherMessage('#erreur-globale',
        'C’est la dernière réalisation. En supprimer la dernière ferait réapparaître sur '
        + 'l’accueil celles d’origine, livrées avec le site. Créez-en une autre d’abord, '
        + 'ou remplacez le contenu de celle-ci.', 9000);
      return;
    }

    confirmer('Supprimer « ' + (r.title || 'cette réalisation') + ' » de l’accueil ? Cette action est définitive.',
      function (fini) {
        appeler('admin.portfolio.delete', { id: id }).then(function () {
          fermerConfirmation();
          afficherMessage('#succes-globale', 'Réalisation supprimée.', 5000);
          rendre();
        }).catch(function (err) { fini(messageLisible(err)); });
      });
  }

  // --------------------------------- PAYS ---------------------------------

  /** Pays réellement enregistrés, dans l'ordre d'affichage. */
  function listePays() {
    return (etat.catalogue.pays || []).filter(function (p) { return p && p.code; });
  }

  /** Pays de référence : celui que voit un visiteur qui n'a encore rien choisi. */
  function paysDefaut() {
    var l = listePays();
    return l.filter(function (p) { return p.defaut === true; })[0] || l[0] || null;
  }

  function trouverPays(code) {
    var cible = String(code || '').toUpperCase();
    return listePays().filter(function (p) { return String(p.code).toUpperCase() === cible; })[0] || null;
  }

  /** « 7 500 FDJ » ou « À confirmer » : jamais de montant converti, jamais de zéro trompeur. */
  function formatTarif(montant, pays) {
    if (typeof montant !== 'number') return '<span class="cellule-sous">À confirmer</span>';
    return echapper(montant.toLocaleString('fr-FR')) + ' ' + echapper((pays && pays.devise) || '');
  }

  /** Tarif d'une formation dans un pays : `prices` d'abord, ancien `price` en repli. */
  function tarifFormation(formation, pays) {
    if (!formation || !pays) return null;
    var table = formation.prices;
    if (table && typeof table === 'object' && !Array.isArray(table)) {
      if (typeof table[pays.code] === 'number') return table[pays.code];
      if (Object.prototype.hasOwnProperty.call(table, pays.code)) return null;
    }
    var defaut = paysDefaut();
    return defaut && defaut.code === pays.code && typeof formation.price === 'number' ? formation.price : null;
  }

  function rendrePays() {
    var p = listePays();
    if (!p.length) {
      /* Base créée avant les pays : les formations sont déjà là, donc l'import
         général de la vue d'ensemble est masqué. On propose ici un amorçage qui
         n'écrit QUE les pays — le catalogue tenu à jour ici n'est pas touché. */
      $('#liste-pays').innerHTML = '<div class="bloc"><h2>Aucun pays enregistré</h2>'
        + '<p class="aide">Les pays portent la devise, l’indicatif, le format des numéros et les moyens '
        + 'de paiement. Reprenez ceux du site pour démarrer — vos formations et sessions ne sont pas '
        + 'modifiées — puis ajustez les tarifs formation par formation.</p>'
        + '<button class="bouton bouton--primaire" type="button" id="btn-importer-pays">'
        + '<span class="material-symbols-outlined" aria-hidden="true">download</span>'
        + 'Reprendre les pays du site</button></div>';
      var b = $('#btn-importer-pays');
      if (b) b.addEventListener('click', function () { importerPaysDuSite(b); });
      return;
    }
    $('#liste-pays').innerHTML = tableau(
      ['Pays', 'Devise', 'Téléphone', 'Contact affiché', 'Moyens de paiement', 'Actions'],
      p.map(function (x) {
        var moyens = Array.isArray(x.paymentMethods) ? x.paymentMethods : [];
        var etiquettes = [];
        if (x.defaut === true) etiquettes.push('<span class="etiquette etiquette--info">Par défaut</span>');
        if (x.active === false) etiquettes.push('<span class="etiquette etiquette--ferme">Fermé</span>');
        return [
          '<div class="cellule-titre">' + echapper(x.nom || x.code) + ' ' + etiquettes.join(' ') + '</div>'
          + '<div class="cellule-sous">' + echapper(x.code) + '</div>',
          echapper(x.devise || '—'),
          '<div>' + echapper(x.indicatif || '—') + '</div>'
          + (x.exempleTelephone ? '<div class="cellule-sous">' + echapper(x.exempleTelephone) + '</div>' : ''),
          (x.whatsappDisplay || x.whatsappNumber)
            ? '<div>' + echapper(x.whatsappDisplay || x.whatsappNumber) + '</div>'
            : '<span class="etiquette etiquette--alerte">Contact général</span>',
          moyens.length
            ? echapper(moyens.map(function (m) { return m.label || m.value; }).join(', '))
            : '<span class="etiquette etiquette--alerte">À configurer</span>',
          '<div class="cellule-actions">'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-modifier-pays="' + echapper(x.code) + '">Modifier</button>'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-supprimer-pays="' + echapper(x.code) + '">Supprimer</button>'
          + '</div>'
        ];
      })
    );
    $$('[data-modifier-pays]').forEach(function (b) {
      b.addEventListener('click', function () { ouvrirPays(b.dataset.modifierPays); });
    });
    $$('[data-supprimer-pays]').forEach(function (b) {
      b.addEventListener('click', function () { demanderSuppressionPays(b.dataset.supprimerPays); });
    });
  }

  /** Reprend les pays déclarés dans le fichier du site, sans toucher au reste. */
  function importerPaysDuSite(bouton) {
    var pays = (window.PAYS || []).map(function (p, i) {
      var copie = Object.assign({}, p);
      copie.paymentMethods = (p.paymentMethods || []).map(function (m) { return Object.assign({}, m); });
      if (typeof copie.ordre !== 'number') copie.ordre = i;
      return copie;
    });
    if (!pays.length) {
      afficherMessage('#erreur-globale', 'Le fichier du site ne déclare aucun pays.', 6000);
      return;
    }
    bouton.disabled = true;
    appeler('admin.importer', { donnees: { pays: pays } }).then(function (d) {
      afficherMessage('#succes-globale', (d.pays || 0) + ' pays repris. '
        + 'Saisissez maintenant les tarifs de chaque formation.', 7000);
      rendre();
    }).catch(function (err) {
      bouton.disabled = false;
      afficherMessage('#erreur-globale', messageLisible(err), 9000);
    });
  }

  /**
   * Formulaire d'un pays. Les exemples se construisent à partir du pays qu'on
   * édite, en X.
   *
   * Ils montraient jusqu'ici le vrai numéro de Djibouti — « 25377145306 ». Un
   * exemple qui est une valeur valable se recopie : la fiche des Comores a fini
   * par porter le numéro de Djibouti, que le site affichait alors à la place du
   * contact général, sans que rien ne l'explique.
   */
  function champsPays(p) {
    var indicatif = String((p && p.indicatif) || '').replace(/\D/g, '');
    var longueur = Number(p && p.longueurTelephone) || 0;
    var local = longueur ? new Array(longueur + 1).join('X') : 'XXXXXXXX';
    var gabarit = indicatif ? indicatif + local : 'indicatif + numéro, ex. 269XXXXXXX';
    var gabaritAffiche = indicatif ? '+' + indicatif + ' ' + local : '+269 XXX XX XX';

    return [
    { section: 'Identité' },
    { cle: 'nom', libelle: 'Nom du pays', type: 'text', requis: true, aide: 'Affiché dans le formulaire d’inscription.' },
    { cle: 'code', libelle: 'Code à deux lettres', type: 'text', requis: true,
      aide: 'Ex. DJ pour Djibouti, KM pour les Comores. Il identifie le pays : ne le changez plus ensuite.' },
    { cle: 'devise', libelle: 'Devise', type: 'text', requis: true, aide: 'Affichée après le montant. Ex. FDJ, KMF.' },

    { section: 'Téléphone' },
    { cle: 'indicatif', libelle: 'Indicatif du pays', type: 'text',
      aide: 'Le « + » et l’indicatif SEULEMENT : +253 pour Djibouti, +269 pour les Comores. '
        + 'Pas de numéro ici — il s’affiche devant le champ que remplit le candidat. '
        + 'Votre numéro de contact se saisit plus bas, dans « Contact dans ce pays ».' },
    { cle: 'longueurTelephone', libelle: 'Nombre de chiffres', type: 'number',
      aide: 'Longueur du numéro local, sans l’indicatif. Vide = pas de limite.' },
    { cle: 'exempleTelephone', libelle: 'Exemple affiché', type: 'text',
      aide: 'Un gabarit en X, pas un vrai numéro : ' + local + '. C’est ce que le candidat a '
        + 'sous les yeux, et il doit respecter le format ci-dessous. Vide = aucun exemple.' },
    { cle: 'motifTelephone', libelle: 'Format accepté', type: 'text', large: true,
      aide: 'Expression régulière. Ex. ^(77|67)\\d{6}$ . Vide = chiffres uniquement, sans autre contrainte.' },
    { cle: 'aideTelephone', libelle: 'Message si le numéro est refusé', type: 'text', large: true },

    { section: 'Contact dans ce pays' },
    { cle: 'whatsappNumber', libelle: 'Numéro WhatsApp', type: 'text',
      aide: 'VOTRE numéro dans ce pays, chiffres uniquement, indicatif compris : ' + gabarit + '. '
        + 'Il remplace le contact général du site pour les visiteurs d’ici. '
        + 'Laissez vide pour afficher le contact général.' },
    { cle: 'whatsappDisplay', libelle: 'Numéro tel qu’il s’affiche', type: 'text',
      aide: 'Le même, écrit comme vous voulez le lire sur le site : ' + gabaritAffiche },

    { section: 'Reconnaissance du visiteur' },
    { cle: 'fuseaux', libelle: 'Fuseaux horaires', type: 'lignes', large: true,
      aide: 'Un par ligne, au format IANA : Africa/Djibouti, Indian/Comoro. Le site s’en sert pour '
        + 'reconnaître d’où vient le visiteur, sans interroger aucun service extérieur.' },
    { cle: 'regions', libelle: 'Codes de région', type: 'lignes', large: true,
      aide: 'Un par ligne, deux lettres : DJ, KM. Deuxième indice, lu dans la langue du navigateur.' },

    { section: 'Moyens de paiement' },
    { cle: 'paymentMethods', libelle: '', type: 'paiements', large: true },

    { section: 'Publication' },
    { cle: 'active', libelle: 'Pays proposé à l’inscription', type: 'bool', defaut: true },
    { cle: 'defaut', libelle: 'Pays affiché par défaut', type: 'bool',
      aide: 'Celui que voit un visiteur avant tout choix. Un seul pays peut l’être.' },
    { cle: 'ordre', libelle: 'Ordre d’affichage', type: 'number', aide: 'Plus petit = proposé en premier.' }
    ];
  }

  function ouvrirPays(code) {
    var p = code ? trouverPays(code) : null;
    var donnees = p ? Object.assign({}, p) : {
      code: '', nom: '', devise: '', indicatif: '', active: true, defaut: false,
      whatsappNumber: '', whatsappDisplay: '', fuseaux: [], regions: [],
      paymentMethods: [], ordre: listePays().length
    };
    ouvrirPanneau(p ? 'Modifier ' + (p.nom || p.code) : 'Nouveau pays', champsPays(p), donnees,
      function (valeurs, fini) {
        valeurs.code = String(valeurs.code || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(valeurs.code)) {
          fini('Le code du pays s’écrit en deux lettres, comme DJ ou KM.');
          return;
        }
        if (p && valeurs.code !== p.code) {
          fini('Le code identifie le pays : le changer créerait un doublon. '
            + 'Créez plutôt un nouveau pays, puis supprimez celui-ci.');
          return;
        }
        /* L'indicatif s'affiche collé devant le numéro que tape le candidat.
           Y glisser un numéro complet produit un téléphone inutilisable dans la
           feuille — « +269 380 46 483801234 » — sans que rien ne le signale. */
        var indicatif = String(valeurs.indicatif || '').trim();
        if (indicatif && !/^\+\d{1,4}$/.test(indicatif)) {
          fini('L’indicatif ne contient que le « + » et l’indicatif du pays, sans espace ni numéro : '
            + '+253, +269… Vous avez saisi « ' + indicatif + ' ». '
            + 'Si c’est votre numéro de contact, il va dans « Contact dans ce pays ».');
          return;
        }
        valeurs.indicatif = indicatif;

        /* L'exemple est ce que le candidat recopie. S'il ne satisfait pas le
           format qu'on annonce juste à côté, on refuse à l'inscription ce qu'on
           vient de lui montrer. Un gabarit en X reste permis : ce n'est pas un numéro. */
        var exemple = String(valeurs.exempleTelephone || '').trim();
        var motif = String(valeurs.motifTelephone || '').trim();
        if (exemple && motif && !/X/i.test(exemple)) {
          var accepte = false;
          try { accepte = new RegExp(motif).test(exemple); } catch (e) { accepte = true; }
          if (!accepte) {
            fini('L’exemple « ' + exemple + ' » ne respecte pas le format accepté (' + motif + ') : '
              + 'un candidat qui le recopierait serait refusé. Mettez un gabarit, comme 77XXXXXX. '
              + 'Votre vrai numéro de contact se saisit dans « Contact dans ce pays ».');
            return;
          }
        }
        valeurs.exempleTelephone = exemple;

        appeler('admin.pays.save', { donnees: valeurs }).then(function (d) {
          viderCorbeilleImages();
          fermerPanneau();
          afficherMessage('#succes-globale', d.cree
            ? 'Pays créé. Pensez à saisir ses tarifs dans chaque formation.'
            : 'Pays mis à jour.', 6000);
          rendre();
        }).catch(function (err) { fini(messageLisible(err)); });
      });
  }

  function demanderSuppressionPays(code) {
    var p = trouverPays(code);
    if (!p) return;
    confirmer('Supprimer ' + (p.nom || p.code) + ' ? Les candidats ne pourront plus choisir ce pays, '
      + 'et ses tarifs cesseront d’être affichés. Les inscriptions déjà reçues ne sont pas touchées.',
      function (fini) {
        appeler('admin.pays.delete', { code: p.code }).then(function () {
          fermerConfirmation();
          afficherMessage('#succes-globale', 'Pays supprimé.', 5000);
          rendre();
        }).catch(function (err) { fini(messageLisible(err)); });
      });
  }

  // ----------------------------- FORMATIONS ------------------------------

  function rendreFormations() {
    var f = etat.catalogue.formations || [];
    if (!f.length) {
      $('#liste-formations').innerHTML = vide('school',
        'Aucune formation. Importez le catalogue du site depuis la vue d’ensemble, ou créez-en une.');
      return;
    }
    var pays = listePays();
    $('#liste-formations').innerHTML = tableau(
      ['Formation', 'Tarifs', 'Sessions', 'État', 'Actions'],
      f.map(function (x) {
        var sessions = (etat.catalogue.sessions || []).filter(function (s) { return s.formId === x.formId; });
        var etiquettes = [];
        if (x.active === false) etiquettes.push('<span class="etiquette etiquette--ferme">Masquée</span>');
        else if (x.registrationOpen) etiquettes.push('<span class="etiquette etiquette--ouvert">Publiée</span>');
        else etiquettes.push('<span class="etiquette etiquette--ferme">Inscriptions fermées</span>');
        if (x.featured) etiquettes.push('<span class="etiquette etiquette--info">Mise en avant</span>');

        return [
          '<div class="cellule-titre">' + echapper(x.title || '(sans titre)') + '</div>'
          + '<div class="cellule-sous">/formations/' + echapper(x.slug || '') + '/</div>',
          // Un tarif par pays, pour repérer d'un coup d'œil celui qui reste à saisir
          pays.length
            ? pays.map(function (p) {
              return '<div class="cellule-tarif"><span class="cellule-sous">' + echapper(p.code) + '</span> '
                + formatTarif(tarifFormation(x, p), p) + '</div>';
            }).join('')
            : '<span class="cellule-sous">Aucun pays configuré</span>',
          sessions.length,
          etiquettes.join(' '),
          '<div class="cellule-actions">'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-modifier-formation="' + echapper(x.id) + '">Modifier</button>'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-supprimer-formation="' + echapper(x.id) + '">Supprimer</button>'
          + '</div>'
        ];
      })
    );
    $$('[data-modifier-formation]').forEach(function (b) {
      b.addEventListener('click', function () { ouvrirFormation(b.dataset.modifierFormation); });
    });
    $$('[data-supprimer-formation]').forEach(function (b) {
      b.addEventListener('click', function () { demanderSuppressionFormation(b.dataset.supprimerFormation); });
    });
  }

  var CHAMPS_FORMATION = [
    { section: 'Identité' },
    { cle: 'title', libelle: 'Titre de la formation', type: 'text', requis: true, large: true },
    { cle: 'shortTitle', libelle: 'Titre court', type: 'text', aide: 'Utilisé dans les menus et résumés.' },
    { cle: 'slug', libelle: 'Lien (adresse de la page)', type: 'text', requis: true,
      aide: 'Minuscules, chiffres et tirets. Le changer casse les liens déjà partagés.' },
    { cle: 'category', libelle: 'Catégorie', type: 'text' },
    { cle: 'family', libelle: 'Domaine', type: 'text', aide: 'Sert aux filtres du catalogue. Réutilisez un domaine existant pour regrouper.' },

    { section: 'Présentation' },
    { cle: 'promise', libelle: 'Promesse courte', type: 'text', large: true, aide: 'Trois mots qui résument, ex. « Créer, captiver, partager. »' },
    { cle: 'shortDescription', libelle: 'Description', type: 'textarea', large: true },
    { cle: 'lead', libelle: 'Accroche de la fiche', type: 'textarea', large: true, aide: 'Facultative. La mise en gras <strong>…</strong> est acceptée.' },
    { cle: 'learnings', libelle: 'Ce que l’on apprend', type: 'lignes', large: true, aide: 'Un acquis par ligne, deux ou trois suffisent. Repris sur la carte du catalogue.' },
    { cle: 'objectives', libelle: 'Objectifs proposés au candidat', type: 'objectifs', large: true,
      aide: 'Un objectif par ligne, proposé à l’étape 2 du formulaire. Vide = liste commune.' },

    { section: 'Informations pratiques' },
    { cle: 'duration', libelle: 'Durée', type: 'text', aide: 'Ex. « 12 séances ». Laisser « À confirmer » si inconnue.' },
    { cle: 'level', libelle: 'Niveau', type: 'text' },
    { cle: 'mode', libelle: 'Mode', type: 'select', options: ['Présentiel', 'En ligne', 'Hybride', 'À confirmer'] },
    { cle: 'modules', libelle: 'Nombre de modules', type: 'number' },
    { cle: 'levelSubject', libelle: 'Sujet de la question de niveau', type: 'text',
      aide: 'Ex. « Canva » donne « Où en es-tu avec Canva ? ». Vide = formulation générique.' },

    { section: 'Programme détaillé' },
    { cle: 'programme', libelle: '', type: 'programme', large: true },

    { section: 'Questions fréquentes' },
    { cle: 'faq', libelle: '', type: 'faq', large: true },

    { section: 'Tarifs par pays' },
    { cle: 'prices', libelle: '', type: 'tarifs', large: true },

    { section: 'Visuels' },
    { cle: 'image', libelle: 'Image de la carte', type: 'image', format: 'image', large: true,
      aide: 'Format portrait. L’image est recadrée au centre et compressée automatiquement.' },
    { cle: 'imageAlt', libelle: 'Description de l’image', type: 'text', large: true, aide: 'Lue par les personnes malvoyantes et par Google.' },
    { cle: 'poster', libelle: 'Affiche de la formation', type: 'image', format: 'poster', large: true,
      aide: 'Facultative. Sans affiche, l’image de la carte est utilisée sur la fiche.' },

    { section: 'Publication' },
    { cle: 'active', libelle: 'Visible sur le site', type: 'bool', defaut: true },
    { cle: 'registrationOpen', libelle: 'Inscriptions ouvertes', type: 'bool', defaut: true },
    { cle: 'featured', libelle: 'Mise en avant', type: 'bool' },
    { cle: 'allowRegistrationWithoutSession', libelle: 'Inscription possible sans date annoncée', type: 'bool',
      aide: 'À cocher seulement si vous acceptez des inscriptions avant d’avoir fixé les dates.' },
    { cle: 'ordre', libelle: 'Ordre d’affichage', type: 'number', aide: 'Plus petit = affiché en premier.' }
  ];

  function ouvrirFormation(id) {
    var f = id ? (etat.catalogue.formations || []).find(function (x) { return x.id === id; }) : null;
    var donnees = f ? Object.assign({}, f) : {
      id: identifiant('form'), active: true, registrationOpen: true, featured: false,
      hasDetailPage: true, allowRegistrationWithoutSession: false, mode: 'Présentiel',
      duration: 'À confirmer', level: 'À confirmer',
      ordre: (etat.catalogue.formations || []).length
    };
    ouvrirPanneau(f ? 'Modifier la formation' : 'Nouvelle formation', CHAMPS_FORMATION, donnees, function (valeurs, fini) {
      valeurs.id = donnees.id;
      valeurs.formId = donnees.formId || valeurs.slug;
      /* `price` reste le tarif du pays par défaut : les pages déjà générées et
         tout ce qui a été écrit avant les tarifs multi-pays le lisent encore. */
      var reference = paysDefaut();
      valeurs.price = reference && valeurs.prices && typeof valeurs.prices[reference.code] === 'number'
        ? valeurs.prices[reference.code] : null;
      if (!valeurs.slug && valeurs.title) valeurs.slug = enLien(valeurs.title);
      /* Une formation créée ici n'a pas encore de page dédiée : son lien pointe vers
         la page d'inscription générique, qui sait afficher n'importe quelle formation.
         Les formations déjà publiées conservent leur page. */
      if (f) {
        valeurs.hasDetailPage = donnees.hasDetailPage !== false;
        valeurs.href = valeurs.hasDetailPage ? '/formations/' + valeurs.slug + '/' : donnees.href;
      } else {
        valeurs.hasDetailPage = false;
        valeurs.href = '/inscription/?trainingId=' + encodeURIComponent(valeurs.formId);
      }
      appeler('admin.formation.save', { donnees: valeurs }).then(function (d) {
        viderCorbeilleImages();
        fermerPanneau();
        afficherMessage('#succes-globale', d.cree
          ? 'Formation créée. Elle apparaît sur le site dans la minute.'
          : 'Formation mise à jour.', 5000);
        rendre();
      }).catch(function (err) { fini(messageLisible(err)); });
    });

    // Proposer un lien à partir du titre, tant que l'utilisateur n'en a pas saisi
    var champTitre = $('#champ-title'), champSlug = $('#champ-slug');
    if (champTitre && champSlug && !f) {
      champTitre.addEventListener('input', function () {
        if (!champSlug.dataset.touche) champSlug.value = enLien(champTitre.value);
      });
      champSlug.addEventListener('input', function () { champSlug.dataset.touche = '1'; });
    }
  }

  function demanderSuppressionFormation(id) {
    var f = (etat.catalogue.formations || []).find(function (x) { return x.id === id; });
    if (!f) return;
    var sessions = (etat.catalogue.sessions || []).filter(function (s) { return s.formId === f.formId; });
    var texte = 'Supprimer « ' + f.title + ' » ?';
    if (sessions.length) texte += ' Ses ' + sessions.length + ' session(s) seront supprimées également.';
    texte += ' Cette action est définitive. Si des candidats sont déjà inscrits, la suppression sera refusée :'
      + ' décochez plutôt « Visible sur le site ».';
    confirmer(texte, function (fini) {
      appeler('admin.formation.delete', { id: id }).then(function () {
        fermerConfirmation();
        afficherMessage('#succes-globale', 'Formation supprimée.', 5000);
        rendre();
      }).catch(function (err) { fini(messageLisible(err)); });
    });
  }

  // ------------------------------ SESSIONS -------------------------------

  function rendreSessions() {
    var s = (etat.catalogue.sessions || []).slice().sort(function (a, b) {
      return String(a.startDate).localeCompare(String(b.startDate));
    });
    if (!s.length) {
      $('#liste-sessions').innerHTML = vide('event', 'Aucune session. Créez-en une pour ouvrir les inscriptions.');
      return;
    }
    var aujourdhui = new Date().toISOString().slice(0, 10);
    var pays = listePays();
    /* Une session sans pays est proposée dans TOUS les pays. C'est le cas des
       sessions créées avant les tarifs par pays : un candidat comorien se verrait
       donc proposer une session qui se tient à Djibouti. On le signale, avec de
       quoi y remédier d'un clic plutôt qu'en rouvrant chaque session. */
    var sansPays = s.filter(function (x) { return !x.pays; });
    var avis = '';
    if (sansPays.length && pays.length > 1) {
      var reference = paysDefaut();
      avis = '<div class="bloc"><h2>' + sansPays.length + ' session(s) sans pays</h2>'
        + '<p class="aide">Une session sans pays est proposée aux candidats de <strong>tous</strong> les pays, '
        + 'y compris là où elle ne se tient pas. Rattachez-les à '
        + echapper(reference ? reference.nom : 'un pays') + ', ou ouvrez-les une à une pour choisir.</p>'
        + '<button class="bouton bouton--primaire" type="button" id="btn-rattacher-sessions">'
        + '<span class="material-symbols-outlined" aria-hidden="true">public</span>'
        + 'Rattacher ces sessions à ' + echapper(reference ? reference.nom : '') + '</button></div>';
    }

    $('#liste-sessions').innerHTML = avis + tableau(
      ['Session', 'Pays', 'Dates', 'Places', 'État', 'Actions'],
      s.map(function (x) {
        var f = (etat.catalogue.formations || []).find(function (y) { return y.formId === x.formId; });
        var inscrits = compterSession(x.id);
        var restantes = typeof x.placesTotal === 'number' ? Math.max(0, x.placesTotal - inscrits) : null;
        var passee = x.startDate < aujourdhui;
        var etiquettes = [];
        if (passee) etiquettes.push('<span class="etiquette etiquette--ferme">Passée</span>');
        else if (restantes === 0) etiquettes.push('<span class="etiquette etiquette--alerte">Complète</span>');
        else if (x.registrationOpen) etiquettes.push('<span class="etiquette etiquette--ouvert">Ouverte</span>');
        else etiquettes.push('<span class="etiquette etiquette--ferme">Fermée</span>');

        return [
          '<div class="cellule-titre">' + echapper(f ? f.title : x.formId) + '</div>'
          + '<div class="cellule-sous">' + echapper(x.schedule || '') + '</div>',
          x.pays
            ? '<div>' + echapper((trouverPays(x.pays) || {}).nom || x.pays) + '</div>'
              + '<div class="cellule-sous">'
              + formatTarif(typeof x.price === 'number' ? x.price : null, trouverPays(x.pays)) + '</div>'
            : '<span class="etiquette etiquette--alerte">Tous pays</span>',
          '<div>' + echapper(dateFr(x.startDate)) + '</div>'
          + (x.endDate ? '<div class="cellule-sous">au ' + echapper(dateFr(x.endDate)) + '</div>' : ''),
          typeof x.placesTotal === 'number'
            ? '<div class="cellule-titre">' + restantes + ' / ' + x.placesTotal + '</div>'
              + '<div class="cellule-sous">' + inscrits + ' inscrit' + (inscrits > 1 ? 's' : '') + '</div>'
            : '<span class="cellule-sous">Non limité</span>',
          etiquettes.join(' '),
          '<div class="cellule-actions">'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-modifier-session="' + echapper(x.id) + '">Modifier</button>'
          + '<button class="bouton bouton--discret bouton--petit" type="button" data-supprimer-session="' + echapper(x.id) + '">Supprimer</button>'
          + '</div>'
        ];
      })
    );
    var rattacher = $('#btn-rattacher-sessions');
    if (rattacher) rattacher.addEventListener('click', function () { rattacherSessions(sansPays); });

    $$('[data-modifier-session]').forEach(function (b) {
      b.addEventListener('click', function () { ouvrirSession(b.dataset.modifierSession); });
    });
    $$('[data-supprimer-session]').forEach(function (b) {
      b.addEventListener('click', function () { demanderSuppressionSession(b.dataset.supprimerSession); });
    });
  }

  function champsSession() {
    var formations = (etat.catalogue.formations || []).map(function (f) {
      return { valeur: f.formId, libelle: f.title };
    });
    return [
      { section: 'Formation et dates' },
      { cle: 'formId', libelle: 'Formation concernée', type: 'select', requis: true, large: true,
        optionsObjets: formations },
      { cle: 'startDate', libelle: 'Date de début', type: 'date', requis: true },
      { cle: 'endDate', libelle: 'Date de fin', type: 'date' },
      { cle: 'schedule', libelle: 'Jours et horaires', type: 'text', large: true,
        aide: 'Ex. « Lundi et jeudi · 18h – 20h ». Affiché tel quel sur la fiche.' },
      { cle: 'duration', libelle: 'Volume', type: 'text', aide: 'Ex. « 12 séances · 24 heures ».' },

      { section: 'Lieu et tarif' },
      { cle: 'pays', libelle: 'Pays', type: 'select', large: true,
        optionsObjets: listePays().map(function (p) { return { valeur: p.code, libelle: p.nom + ' (' + p.devise + ')' }; }),
        aide: 'Une session ne se tient que dans un pays : elle n’est proposée qu’aux candidats de ce pays. '
          + 'Vide = proposée partout.' },
      { cle: 'location', libelle: 'Lieu', type: 'text', large: true },
      { cle: 'mode', libelle: 'Mode', type: 'select', options: ['Présentiel', 'En ligne', 'Hybride'] },
      { cle: 'price', libelle: 'Tarif de cette session', type: 'number',
        aide: 'Dans la devise du pays ci-dessus. Vide = le tarif de la formation s’applique.' },

      { section: 'Places et inscriptions' },
      { cle: 'placesTotal', libelle: 'Nombre de places', type: 'number',
        aide: 'Laisser vide si le nombre n’est pas limité : aucun compteur ne sera affiché.' },
      { cle: 'registrationOpen', libelle: 'Inscriptions ouvertes', type: 'bool', defaut: true,
        aide: 'Décochez pour annoncer la session sans encore accepter d’inscriptions.' }
    ];
  }

  function ouvrirSession(id) {
    var formations = etat.catalogue.formations || [];
    if (!formations.length) {
      afficherMessage('#erreur-globale', 'Créez d’abord une formation : une session doit s’y rattacher.', 6000);
      return;
    }
    var s = id ? (etat.catalogue.sessions || []).find(function (x) { return x.id === id; }) : null;
    var donnees = s ? Object.assign({}, s) : {
      id: identifiant('sess'), registrationOpen: true, mode: 'Présentiel',
      formId: formations[0].formId,
      location: etat.catalogue.reglages.defaultLocation || '',
      pays: (paysDefaut() || {}).code || ''
    };
    ouvrirPanneau(s ? 'Modifier la session' : 'Nouvelle session', champsSession(), donnees, function (valeurs, fini) {
      valeurs.id = donnees.id;
      // Les places disponibles restent pilotées par le décompte réel des inscrits
      if (typeof valeurs.placesTotal === 'number') {
        valeurs.placesAvailable = Math.max(0, valeurs.placesTotal - compterSession(donnees.id));
      } else {
        valeurs.placesAvailable = null;
      }
      appeler('admin.session.save', { donnees: valeurs }).then(function (d) {
        fermerPanneau();
        afficherMessage('#succes-globale', d.cree ? 'Session créée.' : 'Session mise à jour.', 5000);
        rendre();
      }).catch(function (err) { fini(messageLisible(err)); });
    });
  }

  /**
   * Rattache d'un coup les sessions sans pays au pays par défaut.
   * Elles sont enregistrées une à une, et non toutes ensemble : si l'une échoue,
   * les précédentes restent acquises et le message dit laquelle a résisté.
   */
  function rattacherSessions(sessions) {
    var reference = paysDefaut();
    if (!reference || !sessions.length) return;
    var bouton = $('#btn-rattacher-sessions');
    if (bouton) bouton.disabled = true;

    var suite = Promise.resolve();
    var faits = 0;
    sessions.forEach(function (s) {
      suite = suite.then(function () {
        return appeler('admin.session.save', {
          donnees: Object.assign({}, s, { pays: reference.code })
        }).then(function () { faits++; });
      });
    });

    suite.then(function () {
      afficherMessage('#succes-globale',
        faits + ' session(s) rattachée(s) à ' + reference.nom + '.', 6000);
      rendre();
    }).catch(function (err) {
      if (bouton) bouton.disabled = false;
      afficherMessage('#erreur-globale',
        faits + ' session(s) rattachée(s), puis : ' + messageLisible(err), 9000);
      rendre();
    });
  }

  function demanderSuppressionSession(id) {
    var s = (etat.catalogue.sessions || []).find(function (x) { return x.id === id; });
    if (!s) return;
    var inscrits = compterSession(id);
    var texte = 'Supprimer cette session du ' + dateFr(s.startDate) + ' ?';
    texte += inscrits
      ? ' Elle compte ' + inscrits + ' inscrit(s) : la suppression sera refusée. Fermez plutôt les inscriptions.'
      : ' Cette action est définitive.';
    confirmer(texte, function (fini) {
      appeler('admin.session.delete', { id: id }).then(function () {
        fermerConfirmation();
        afficherMessage('#succes-globale', 'Session supprimée.', 5000);
        rendre();
      }).catch(function (err) { fini(messageLisible(err)); });
    });
  }

  // ---------------------------- INSCRIPTIONS -----------------------------

  function rendreInscriptions() {
    var formations = etat.catalogue.formations || [];
    $('#filtres-inscriptions').innerHTML = ['<button class="filtre' + (etat.filtreInscriptions ? '' : ' is-actif')
      + '" type="button" data-filtre="">Toutes (' + etat.inscriptions.length + ')</button>']
      .concat(formations.map(function (f) {
        var n = etat.inscriptions.filter(function (i) { return i.formationId === f.formId; }).length;
        if (!n) return '';
        return '<button class="filtre' + (etat.filtreInscriptions === f.formId ? ' is-actif' : '')
          + '" type="button" data-filtre="' + echapper(f.formId) + '">' + echapper(f.shortTitle || f.title)
          + ' (' + n + ')</button>';
      })).join('');
    $$('[data-filtre]').forEach(function (b) {
      b.addEventListener('click', function () { etat.filtreInscriptions = b.dataset.filtre; rendre(); });
    });

    var liste = etat.filtreInscriptions
      ? etat.inscriptions.filter(function (i) { return i.formationId === etat.filtreInscriptions; })
      : etat.inscriptions;

    if (!liste.length) {
      $('#liste-inscriptions').innerHTML = vide('group', 'Aucune inscription à afficher.');
      return;
    }
    $('#liste-inscriptions').innerHTML = tableau(
      ['Candidat', 'Formation', 'Paiement', 'Statut', 'Reçue le', 'Relance'],
      liste.map(function (i) {
        return [
          '<div class="cellule-titre">' + echapper([i.nom, i.prenom].filter(Boolean).join(' ')) + '</div>'
          /* `countryCode` n'est pas une colonne de la feuille : il valait donc
             toujours undefined, et le numéro s'affichait sans son indicatif.
             Entre un numéro comorien à 7 chiffres et un djiboutien à 8, on ne
             savait plus qui rappeler. `telephoneInternational`, lui, est écrit. */
          + '<div class="cellule-sous">' + echapper(i.telephoneInternational || i.telephone || '—')
          + (i.email ? ' · ' + echapper(i.email) : '') + '</div>',
          '<div>' + echapper(i.formationTitle || i.formationId || '—') + '</div>'
          + (i.sessionLabel ? '<div class="cellule-sous">' + echapper(i.sessionLabel) + '</div>' : ''),
          '<div>' + echapper(i.modePaiement || '—') + '</div>'
          + (i.montant ? '<div class="cellule-sous">' + echapper(i.montant) + ' ' + echapper(i.currency || '') + '</div>' : ''),
          selecteurStatut(i),
          echapper(dateHeureFr(i['Horodatage réception'] || i.dateInscription)),
          boutonWhatsapp(i)
        ];
      })
    );
    $$('[data-statut-ligne]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var ligne = Number(sel.dataset.statutLigne);
        appeler('admin.inscription.statut', { ligne: ligne, statut: sel.value }).then(function () {
          var cible = etat.inscriptions.find(function (i) { return i.ligne === ligne; });
          if (cible) cible.statut = sel.value;
          afficherMessage('#succes-globale', 'Statut mis à jour.', 3000);
        }).catch(function (err) {
          afficherMessage('#erreur-globale', messageLisible(err), 7000);
          rendre();
        });
      });
    });
  }

  var STATUTS = ['En attente', 'Confirmé', 'Payé', 'Annulé'];

  function selecteurStatut(i) {
    var actuel = i.statut || 'En attente';
    var options = STATUTS.indexOf(actuel) < 0 ? [actuel].concat(STATUTS) : STATUTS;
    return '<select class="statut" data-statut-ligne="' + i.ligne + '">'
      + options.map(function (s) {
        return '<option value="' + echapper(s) + '"' + (s === actuel ? ' selected' : '') + '>' + echapper(s) + '</option>';
      }).join('') + '</select>';
  }

  function boutonWhatsapp(i) {
    var numero = String(i.telephoneInternational || ((i.countryCode || '') + (i.telephone || ''))).replace(/\D/g, '');
    if (!numero) return '<span class="cellule-sous">—</span>';
    var message = 'Bonjour ' + (i.prenom || '') + ', ici IMPACTALI. Nous avons bien reçu votre inscription à la formation '
      + (i.formationTitle || '') + (i.sessionLabel ? ' (session du ' + i.sessionLabel + ')' : '')
      + '. Pouvons-nous confirmer votre participation ?';
    return '<a class="bouton bouton--discret bouton--petit" target="_blank" rel="noopener noreferrer" href="https://wa.me/'
      + numero + '?text=' + encodeURIComponent(message) + '">'
      + '<span class="material-symbols-outlined" aria-hidden="true">chat</span>WhatsApp</a>';
  }

  function exporterCsv() {
    var liste = etat.filtreInscriptions
      ? etat.inscriptions.filter(function (i) { return i.formationId === etat.filtreInscriptions; })
      : etat.inscriptions;
    if (!liste.length) return;
    var colonnes = Object.keys(liste[0]).filter(function (c) { return c !== 'ligne'; });
    var cellule = function (v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; };
    var csv = '﻿' + colonnes.join(';') + '\n'
      + liste.map(function (i) { return colonnes.map(function (c) { return cellule(i[c]); }).join(';'); }).join('\n');
    var lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    lien.download = 'inscriptions-impactali-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    URL.revokeObjectURL(lien.href);
  }

  // -------------------------------- IMAGES --------------------------------

  /* Formats attendus par le site. Le navigateur redimensionne à ces mesures
     avant l'envoi : ce qui part pèse quelques centaines de kilooctets, jamais
     les huit mégaoctets d'une photo de téléphone. */
  var FORMATS_IMAGE = {
    image: { largeur: 760, hauteur: 950, libelle: 'portrait 760 × 950' },
    poster: { largeur: 1000, hauteur: null, libelle: 'largeur 1000 px, hauteur libre' },
    // Logo d'un moyen de paiement : affiché sur environ 48 px de haut, donc petit
    logo: { largeur: 240, hauteur: null, libelle: 'largeur 240 px, hauteur libre' },
    // Visuels du site : bandeau large, et portrait pour la photo du formateur
    paysage: { largeur: 1400, hauteur: 788, libelle: 'paysage 1400 × 788' },
    portrait: { largeur: 900, hauteur: 1125, libelle: 'portrait 900 × 1125' },
    // Vignette de réalisation : la grille de l'accueil l'affiche en 4/3
    portfolio: { largeur: 900, hauteur: 675, libelle: 'paysage 900 × 675' }
  };

  /**
   * Prépare un fichier choisi par l'utilisateur : orientation redressée,
   * redimensionnement, compression, puis encodage base64.
   * `imageOrientation: 'from-image'` est indispensable : sans lui, les photos
   * prises au téléphone arrivent couchées.
   */
  function preparerImage(fichier, format) {
    // Les photos d'iPhone sont souvent en HEIC : le navigateur ne sait pas les lire
    if (/\.hei[cf]$/i.test(fichier.name) || /image\/hei[cf]/i.test(fichier.type)) {
      return Promise.reject(new Error(
        'Photo au format iPhone (HEIC), que le navigateur ne sait pas ouvrir. '
        + 'Dans Réglages → Appareil photo → Formats, choisissez « Le plus compatible », '
        + 'ou envoyez-vous la photo par email, ce qui la convertit en JPEG.'));
    }
    if (!/^image\//.test(fichier.type)) {
      return Promise.reject(new Error('Ce fichier n’est pas une image.'));
    }
    if (fichier.size > 25 * 1024 * 1024) {
      return Promise.reject(new Error('Fichier trop lourd (plus de 25 Mo).'));
    }

    /* `imageOrientation` est indispensable : sans lui, les photos arrivent couchées.
       Aucun repli sans cette option : un résultat faux en silence — image tournée,
       recadrée au mauvais endroit — est pire qu'une erreur affichée.

       Pour un fichier lourd, on ajoute `resizeWidth` : le sous-échantillonnage a
       alors lieu PENDANT le décodage, et le bitmap en pleine résolution n'existe
       jamais. Sans cela, une photo de 48 mégapixels réserve près de 200 Mo et fait
       tomber l'onglet. On ne l'applique pas aux petits fichiers, car cette option
       redimensionne à la valeur demandée — y compris vers le haut. */
    var options = { imageOrientation: 'from-image' };
    if (fichier.size > 3 * 1024 * 1024) {
      options.resizeWidth = 2000;
      options.resizeQuality = 'high';
    }

    return createImageBitmap(fichier, options)
      .catch(function () { throw new Error('Image illisible. Essayez un JPEG ou un PNG.'); })
      .then(function (bitmap) {
        // On montre l'image et on laisse choisir la partie à garder
        return choisirCadrage(bitmap, format).then(function (zone) {
          if (!zone) {
            bitmap.close && bitmap.close();
            var renonce = new Error('Recadrage annulé.');
            renonce.annule = true;
            throw renonce;
          }

          var f = FORMATS_IMAGE[format] || FORMATS_IMAGE.poster;
          /* Cadre imposé : la sortie a exactement les mesures du format.
             Hauteur libre : on garde le rapport choisi, largeur bornée. */
          var largeur = f.hauteur ? f.largeur : Math.round(Math.min(f.largeur, zone.largeur));
          var hauteur = f.hauteur ? f.hauteur : Math.round(largeur * zone.hauteur / zone.largeur);

          var toile = document.createElement('canvas');
          toile.width = largeur;
          toile.height = hauteur;
          var ctx = toile.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, largeur, hauteur);
          bitmap.close && bitmap.close();

          return encoder(toile, 'image/webp', 0.82)
            .catch(function () { return encoder(toile, 'image/jpeg', 0.85); });
        });
      });
  }

  // ------------------------------ RECADRAGE -------------------------------

  /**
   * Choix du cadrage avant envoi.
   *
   * Le recadrage automatique prenait le centre de la photo : pratique, mais
   * faux dès que le sujet est ailleurs — un visage en haut du cadre se
   * retrouvait coupé au front. On montre donc l'image entière et on laisse
   * déplacer et agrandir le cadre. Ce qui part est exactement ce qui est vu.
   *
   * @returns {Promise<{x:number,y:number,largeur:number,hauteur:number}|null>}
   *          la zone retenue dans les coordonnées de l'image, ou null si on renonce
   */
  function choisirCadrage(bitmap, format) {
    return new Promise(function (resoudre) {
      var f = FORMATS_IMAGE[format] || FORMATS_IMAGE.poster;
      var rapport = f.hauteur ? f.largeur / f.hauteur : bitmap.width / bitmap.height;

      var boite = document.createElement('div');
      boite.className = 'recadrage';
      boite.innerHTML =
        '<div class="recadrage__fond"></div>'
        + '<div class="recadrage__boite" role="dialog" aria-modal="true" aria-label="Choisir le cadrage">'
        + '<header class="panneau__entete"><h2>Choisir le cadrage</h2></header>'
        + '<div class="recadrage__scene"><canvas class="recadrage__toile"></canvas>'
        + '<div class="recadrage__cadre" aria-hidden="true"></div></div>'
        + '<p class="recadrage__aide">Faites glisser l’image pour la déplacer, et réglez '
        + 'l’agrandissement ci-dessous. Seule la partie nette sera conservée.</p>'
        + '<label class="champ"><span class="champ__label">Agrandissement</span>'
        + '<input type="range" class="recadrage__zoom" min="100" max="400" value="100"></label>'
        + '<footer class="panneau__pied"><div class="panneau__boutons">'
        + '<button type="button" class="bouton bouton--discret" data-annuler>Annuler</button>'
        + '<button type="button" class="bouton bouton--primaire" data-valider>Utiliser ce cadrage</button>'
        + '</div></footer></div>';
      document.body.appendChild(boite);
      document.body.style.overflow = 'hidden';

      var toile = boite.querySelector('.recadrage__toile');
      var cadre = boite.querySelector('.recadrage__cadre');
      var zoom = boite.querySelector('.recadrage__zoom');
      var ctx = toile.getContext('2d');

      /* Le cadre occupe la scène ; l'image se déplace derrière lui. `echelle`
         est le rapport entre pixels affichés et pixels de l'image. */
      var largeurScene = Math.min(560, window.innerWidth - 80);
      var hauteurScene = Math.round(largeurScene / rapport);
      if (hauteurScene > window.innerHeight - 320) {
        hauteurScene = window.innerHeight - 320;
        largeurScene = Math.round(hauteurScene * rapport);
      }
      toile.width = largeurScene;
      toile.height = hauteurScene;
      toile.style.width = largeurScene + 'px';
      toile.style.height = hauteurScene + 'px';
      cadre.style.width = largeurScene + 'px';
      cadre.style.height = hauteurScene + 'px';

      // Échelle minimale : celle qui couvre tout le cadre, sans bord vide
      var echelleMin = Math.max(largeurScene / bitmap.width, hauteurScene / bitmap.height);
      var echelle = echelleMin;
      var centreX = bitmap.width / 2;
      var centreY = bitmap.height / 2;

      function borner() {
        var demiLargeur = largeurScene / (2 * echelle);
        var demiHauteur = hauteurScene / (2 * echelle);
        centreX = Math.min(bitmap.width - demiLargeur, Math.max(demiLargeur, centreX));
        centreY = Math.min(bitmap.height - demiHauteur, Math.max(demiHauteur, centreY));
      }

      function dessiner() {
        borner();
        ctx.clearRect(0, 0, largeurScene, hauteurScene);
        var l = largeurScene / echelle;
        var h = hauteurScene / echelle;
        ctx.drawImage(bitmap, centreX - l / 2, centreY - h / 2, l, h, 0, 0, largeurScene, hauteurScene);
      }

      zoom.addEventListener('input', function () {
        echelle = echelleMin * (Number(zoom.value) / 100);
        dessiner();
      });

      var glisse = false, departX = 0, departY = 0;
      var debut = function (e) {
        glisse = true;
        var p = e.touches ? e.touches[0] : e;
        departX = p.clientX;
        departY = p.clientY;
        e.preventDefault();
      };
      var bouge = function (e) {
        if (!glisse) return;
        var p = e.touches ? e.touches[0] : e;
        centreX -= (p.clientX - departX) / echelle;
        centreY -= (p.clientY - departY) / echelle;
        departX = p.clientX;
        departY = p.clientY;
        dessiner();
        e.preventDefault();
      };
      var fin = function () { glisse = false; };

      toile.addEventListener('mousedown', debut);
      window.addEventListener('mousemove', bouge);
      window.addEventListener('mouseup', fin);
      toile.addEventListener('touchstart', debut, { passive: false });
      toile.addEventListener('touchmove', bouge, { passive: false });
      toile.addEventListener('touchend', fin);

      function fermer(resultat) {
        window.removeEventListener('mousemove', bouge);
        window.removeEventListener('mouseup', fin);
        document.removeEventListener('keydown', auClavier);
        boite.remove();
        document.body.style.overflow = '';
        resoudre(resultat);
      }
      function auClavier(e) { if (e.key === 'Escape') fermer(null); }
      document.addEventListener('keydown', auClavier);

      boite.querySelector('[data-annuler]').addEventListener('click', function () { fermer(null); });
      boite.querySelector('.recadrage__fond').addEventListener('click', function () { fermer(null); });
      boite.querySelector('[data-valider]').addEventListener('click', function () {
        borner();
        fermer({
          x: centreX - largeurScene / (2 * echelle),
          y: centreY - hauteurScene / (2 * echelle),
          largeur: largeurScene / echelle,
          hauteur: hauteurScene / echelle
        });
      });

      dessiner();
    });
  }

  function calculerTaille(largeur, hauteur, format) {
    var f = FORMATS_IMAGE[format] || FORMATS_IMAGE.poster;
    if (!f.hauteur) {
      // Hauteur libre : on borne seulement la largeur, sans recadrer
      var ratio = Math.min(1, f.largeur / largeur);
      return { largeur: Math.round(largeur * ratio), hauteur: Math.round(hauteur * ratio),
        sx: 0, sy: 0, sw: largeur, sh: hauteur };
    }
    // Cadre imposé : on prend la plus grande zone du bon rapport, centrée
    var vise = f.largeur / f.hauteur;
    var actuel = largeur / hauteur;
    var sw = largeur, sh = hauteur, sx = 0, sy = 0;
    if (actuel > vise) { sw = Math.round(hauteur * vise); sx = Math.round((largeur - sw) / 2); }
    else { sh = Math.round(largeur / vise); sy = Math.round((hauteur - sh) / 2); }
    return { largeur: f.largeur, hauteur: f.hauteur, sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function encoder(toile, type, qualite) {
    return new Promise(function (resoudre, rejeter) {
      toile.toBlob(function (blob) {
        if (!blob || blob.type !== type) return rejeter(new Error('format non pris en charge'));
        var lecteur = new FileReader();
        lecteur.onload = function () {
          resoudre({ type: type, base64: String(lecteur.result).split(',')[1], poids: blob.size });
        };
        lecteur.onerror = function () { rejeter(new Error('lecture impossible')); };
        lecteur.readAsDataURL(blob);
      }, type, qualite);
    });
  }

  /**
   * Visuels remplacés en cours d'édition. Ils ne partent à la corbeille
   * qu'APRÈS l'enregistrement : si la personne renonce, la fiche doit retrouver
   * son image d'origine intacte.
   */
  function aRetirer(url) {
    url = String(url || '').trim();
    if (!url || !/googleusercontent|drive\.google/.test(url)) return;
    if (etat.imagesARetirer.indexOf(url) < 0) etat.imagesARetirer.push(url);
  }

  /** Après un enregistrement réussi : on nettoie réellement. */
  function viderCorbeilleImages() {
    var liste = etat.imagesARetirer.slice();
    etat.imagesARetirer = [];
    liste.forEach(function (url) {
      appeler('admin.image.delete', { url: url }).catch(function () { });
    });
  }

  /** Câble un champ image : choix du fichier, aperçu, envoi, retrait. */
  function activerChampImage(cle, format) {
    var zone = document.getElementById('image-' + cle);
    if (!zone) return;
    var champ = document.getElementById('champ-' + cle);
    var entree = zone.querySelector('input[type="file"]');
    var etatEl = zone.querySelector('.image__etat');
    var apercu = zone.querySelector('.image__apercu');
    var retirer = zone.querySelector('[data-retirer]');

    var rafraichir = function () {
      var url = champ.value.trim();
      apercu.innerHTML = url
        ? '<img src="' + echapper(url) + '" alt="Aperçu" loading="lazy">'
        : '<span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>';
      retirer.hidden = !url;
    };
    rafraichir();

    retirer.addEventListener('click', function () {
      aRetirer(champ.value.trim());
      champ.value = '';
      rafraichir();
      etatEl.textContent = 'Visuel retiré. Enregistrez pour valider.';
    });

    entree.addEventListener('change', function () {
      var fichier = entree.files && entree.files[0];
      if (!fichier) return;
      var ancienne = champ.value.trim();
      etatEl.textContent = 'Préparation de l’image…';
      entree.disabled = true;

      preparerImage(fichier, format)
        .then(function (prete) {
          etatEl.textContent = 'Envoi (' + Math.round(prete.poids / 1024) + ' Ko)…';
          return appeler('admin.image.upload', {
            donnees: {
              base64: prete.base64, type: prete.type, format: format,
              nom: fichier.name.replace(/\.[^.]+$/, '')
            }
          });
        })
        .then(function (reponse) {
          champ.value = reponse.url;
          rafraichir();
          etatEl.textContent = 'Image envoyée. Enregistrez pour l’appliquer.';
          entree.disabled = false;
          entree.value = '';
          if (ancienne !== reponse.url) aRetirer(ancienne);
        })
        .catch(function (err) {
          // Renoncer au recadrage n'est pas une panne : on ne crie pas à l'erreur
          etatEl.textContent = err && err.annule ? '' : messageLisible(err);
          entree.disabled = false;
          entree.value = '';
        });
    });
  }

  // ---------------------------- TEXTES DU SITE ---------------------------

  /**
   * La liste des textes modifiables n'est écrite nulle part : elle est relevée
   * dans l'accueil lui-même, sur les éléments porteurs de `data-texte`. Ajouter
   * un texte modifiable au site suffit donc à le faire apparaître ici.
   */
  function chargerTextesDuSite() {
    if (etat.textesDeclares) return Promise.resolve(etat.textesDeclares);

    /* Les pages parcourues. La fiche formation sert d'exemple pour tout le
       gabarit : ses textes partagés valent pour les six fiches. */
    var pages = ['/', '/entreprises/', '/mentions-legales/'];
    var premiere = (etat.catalogue.formations || []).filter(function (f) { return f.hasDetailPage !== false; })[0];
    pages.push(premiere ? premiere.href : '/formations/canva-pro/');

    var vues = {};
    var liste = [];

    return Promise.all(pages.map(function (url) {
      return fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .catch(function () { return ''; });
    })).then(function (contenus) {
      contenus.forEach(function (html) {
        if (!html) return;
        var page = new DOMParser().parseFromString(html, 'text/html');
        page.querySelectorAll('[data-texte], [data-texte-html]').forEach(function (el) {
          var estHtml = el.hasAttribute('data-texte-html');
          var cle = el.getAttribute(estHtml ? 'data-texte-html' : 'data-texte');
          if (!cle || vues[cle]) return; // une clé peut apparaître sur plusieurs pages
          vues[cle] = true;
          liste.push({
            cle: cle,
            groupe: el.getAttribute('data-texte-groupe') || 'Autres',
            libelle: el.getAttribute('data-texte-libelle') || cle,
            /* Texte propre, sans celui des enfants : un libellé porte parfois un
               chevron d'accordéon, et le tableau de bord affichait alors
               « … ?expand_more » comme texte actuel. */
            defaut: (estHtml ? el.innerHTML : texteSeulDe(el)).replace(/\s+/g, ' ').trim(),
            html: estHtml
          });
        });
      });
      if (!liste.length) throw new Error('Aucun texte modifiable trouvé sur le site.');
      etat.textesDeclares = liste;
      return liste;
    });
  }

  // --------------------------- VISUELS DU SITE ---------------------------

  /**
   * Comme pour les textes, la liste n'est écrite nulle part : elle est relevée
   * dans les pages elles-mêmes, sur les éléments porteurs de `data-image`.
   * Marquer un visuel dans le HTML suffit donc à le rendre remplaçable ici.
   */
  function chargerVisuelsDuSite() {
    if (etat.visuelsDeclares) return Promise.resolve(etat.visuelsDeclares);

    var pages = ['/', '/entreprises/'];
    var premiere = (etat.catalogue.formations || []).filter(function (f) { return f.hasDetailPage !== false; })[0];
    pages.push(premiere ? premiere.href : '/formations/canva-pro/');

    var vues = {};
    var liste = [];
    return Promise.all(pages.map(function (url) {
      return fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .catch(function () { return ''; });
    })).then(function (contenus) {
      contenus.forEach(function (html, rang) {
        if (!html) return;
        var adressePage = pages[rang];
        var page = new DOMParser().parseFromString(html, 'text/html');
        page.querySelectorAll('[data-image]').forEach(function (el) {
          var cle = el.getAttribute('data-image');
          if (!cle || vues[cle]) return;
          vues[cle] = true;
          liste.push({
            cle: cle,
            groupe: el.getAttribute('data-image-groupe') || 'Autres',
            libelle: el.getAttribute('data-image-libelle') || cle,
            format: el.getAttribute('data-image-format') || 'paysage',
            origine: adresseAbsolue(el.getAttribute('src') || '', adressePage),
            description: el.getAttribute('alt') || ''
          });
        });
      });
      if (!liste.length) throw new Error('Aucun visuel remplaçable trouvé sur le site.');
      etat.visuelsDeclares = liste;
      return liste;
    });
  }

  function rendreVisuels() {
    var boite = $('#formulaire-visuels');
    if (!etat.visuelsDeclares) {
      boite.innerHTML = '<div class="bloc"><p class="aide">Lecture des visuels du site…</p></div>';
      chargerVisuelsDuSite().then(rendreVisuels).catch(function (err) {
        boite.innerHTML = '<div class="message message--erreur">Impossible de lire le site : '
          + echapper(messageLisible(err)) + '</div>';
      });
      return;
    }

    var enregistres = etat.catalogue.images || {};
    var groupes = [];
    etat.visuelsDeclares.forEach(function (v) {
      var g = groupes.filter(function (x) { return x.nom === v.groupe; })[0];
      if (!g) { g = { nom: v.groupe, items: [] }; groupes.push(g); }
      g.items.push(v);
    });

    boite.innerHTML = '<div class="bloc"><h2>Visuels du site</h2>'
      + '<p class="aide">Remplacez une image et choisissez son cadrage. Retirer le remplacement '
      + 'rétablit le visuel d’origine du site.</p></div>'
      + groupes.map(function (g) {
        return '<div class="bloc"><h2>' + echapper(g.nom) + '</h2>'
          + g.items.map(function (v) {
            var valeur = typeof enregistres[v.cle] === 'string' ? enregistres[v.cle] : '';
            return '<div class="visuel">'
              + '<div class="visuel__entete"><strong>' + echapper(v.libelle) + '</strong>'
              + (valeur ? ' <span class="etiquette etiquette--ouvert">remplacé</span>' : '') + '</div>'
              + champImage('visuel-' + v.cle, '', valeur || v.origine,
                (valeur ? '' : 'Visuel d’origine du site. ')
                + 'Format ' + echapper(v.format) + '. ' + echapper(v.description))
              + '</div>';
          }).join('')
          + '</div>';
      }).join('')
      + '<div class="bloc"><div class="panneau__boutons" style="justify-content:flex-start">'
      + '<button class="bouton bouton--primaire" type="button" id="btn-visuels">'
      + '<span class="btn-texte">Enregistrer les visuels</span>'
      + '<span class="btn-attente" hidden><span class="rondelle"></span>Enregistrement…</span></button></div>'
      + '<p class="message message--erreur" id="erreur-visuels" role="alert" hidden></p></div>';

    etat.visuelsDeclares.forEach(function (v) { activerChampImage('visuel-' + v.cle, v.format); });

    $('#btn-visuels').addEventListener('click', function () {
      var bouton = $('#btn-visuels');
      var erreur = $('#erreur-visuels');
      erreur.hidden = true;
      attente(bouton, true);
      var donnees = {};
      etat.visuelsDeclares.forEach(function (v) {
        var champ = document.getElementById('champ-visuel-' + v.cle);
        if (!champ) return;
        var valeur = champ.value.trim();
        /* Un champ revenu au visuel d'origine n'est pas un remplacement :
           on efface la ligne, et la page réaffiche ce que son HTML contient. */
        donnees[v.cle] = (valeur && valeur !== v.origine) ? valeur : '';
      });
      appeler('admin.images.save', { donnees: donnees }).then(function () {
        attente(bouton, false);
        viderCorbeilleImages();
        afficherMessage('#succes-globale', 'Visuels enregistrés. Ils apparaissent sur le site dans la minute.', 6000);
        rendreVisuels();
      }).catch(function (err) {
        attente(bouton, false);
        erreur.textContent = messageLisible(err);
        erreur.hidden = false;
      });
    });
  }

  function rendreTextes() {
    var boite = $('#formulaire-textes');
    if (!etat.textesDeclares) {
      boite.innerHTML = '<div class="bloc"><p class="aide">Lecture des textes de l’accueil…</p></div>';
      chargerTextesDuSite().then(rendreTextes).catch(function (err) {
        boite.innerHTML = '<div class="message message--erreur">Impossible de lire l’accueil : '
          + echapper(messageLisible(err)) + '</div>';
      });
      return;
    }

    var enregistres = etat.catalogue.textes || {};
    var groupes = [];
    etat.textesDeclares.forEach(function (t) {
      var g = groupes.filter(function (x) { return x.nom === t.groupe; })[0];
      if (!g) { g = { nom: t.groupe, items: [] }; groupes.push(g); }
      g.items.push(t);
    });

    boite.innerHTML = '<div class="bloc"><h2>Textes du site</h2>'
      + '<p class="aide">Modifiez ce que vous voulez et laissez le reste vide : un champ vide affiche le '
      + 'texte d’origine du site. C’est ainsi qu’on annule une modification.</p></div>'
      + '<form id="form-textes">'
      + groupes.map(function (g) {
        return '<div class="bloc"><h2>' + echapper(g.nom) + '</h2>'
          + g.items.map(function (t) {
            var valeur = typeof enregistres[t.cle] === 'string' ? enregistres[t.cle] : '';
            var modifie = valeur.trim() !== '';
            var long = t.defaut.length > 90 || t.html;
            return '<label class="champ"><span class="champ__label">' + echapper(t.libelle)
              + (modifie ? ' <span class="etiquette etiquette--ouvert">modifié</span>' : '') + '</span>'
              + (long
                ? '<textarea id="texte-' + echapper(t.cle) + '" placeholder="' + echapper(t.defaut) + '">' + echapper(valeur) + '</textarea>'
                : '<input type="text" id="texte-' + echapper(t.cle) + '" placeholder="' + echapper(t.defaut)
                  + '" value="' + echapper(valeur) + '">')
              + '<span class="champ__aide">Texte actuel du site : ' + echapper(t.defaut)
              + (t.html ? ' — la mise en valeur <span>…</span> est acceptée.' : '') + '</span></label>';
          }).join('')
          + '</div>';
      }).join('')
      + '<div class="bloc"><div class="panneau__boutons" style="justify-content:flex-start">'
      + '<button class="bouton bouton--primaire" type="submit" id="btn-textes">'
      + '<span class="btn-texte">Enregistrer les textes</span>'
      + '<span class="btn-attente" hidden><span class="rondelle"></span>Enregistrement…</span></button></div>'
      + '<p class="message message--erreur" id="erreur-textes" role="alert" hidden></p></div></form>';

    $('#form-textes').addEventListener('submit', function (e) {
      e.preventDefault();
      var bouton = $('#btn-textes');
      var erreur = $('#erreur-textes');
      erreur.hidden = true;
      attente(bouton, true);
      var donnees = {};
      etat.textesDeclares.forEach(function (t) {
        var el = document.getElementById('texte-' + t.cle);
        if (el) donnees[t.cle] = el.value.trim();
      });
      appeler('admin.textes.save', { donnees: donnees }).then(function () {
        attente(bouton, false);
        afficherMessage('#succes-globale', 'Textes enregistrés. Ils apparaissent sur le site dans la minute.', 6000);
        rendreTextes();
      }).catch(function (err) {
        attente(bouton, false);
        erreur.textContent = messageLisible(err);
        erreur.hidden = false;
      });
    });
  }

  // ------------------------------ RÉGLAGES -------------------------------

  /**
   * Réglages du site. Le contact déclaré ici n'est qu'un repli : un pays qui
   * renseigne son propre numéro le remplace pour ses visiteurs. Tant que cela
   * restait tacite, modifier le numéro ici semblait sans effet — on actualisait
   * le site, et l'autre numéro revenait.
   */
  function champsReglages() {
    var surcharges = listePays()
      .filter(function (p) { return String(p.whatsappDisplay || p.whatsappNumber || '').trim(); })
      .map(function (p) { return (p.nom || p.code) + ' (' + (p.whatsappDisplay || p.whatsappNumber) + ')'; });

    return [
    { section: 'Contact' },
    { cle: 'contactName', libelle: 'Nom du contact', type: 'text' },
    { cle: 'whatsappNumber', libelle: 'Numéro WhatsApp', type: 'text',
      aide: 'Chiffres uniquement, indicatif compris, sans + ni espace : 253XXXXXXXX.'
        + (surcharges.length
          ? ' ⚠ Ce numéro n’est PAS affiché aux visiteurs de : ' + surcharges.join(', ')
            + '. Ces pays ont leur propre contact, qui se modifie dans la rubrique Pays.'
          : ' Affiché partout, tant qu’aucun pays n’a son propre contact.') },
    { cle: 'whatsappDisplay', libelle: 'Numéro affiché', type: 'text',
      aide: 'Le même, écrit comme vous voulez le lire : +253 XX XX XX XX' },

    { section: 'Sessions' },
    { cle: 'defaultLocation', libelle: 'Lieu habituel', type: 'text', large: true,
      aide: 'Proposé par défaut à la création d’une session.' }
    ];
  }

  function rendreReglages() {
    // La même liste sert à construire le formulaire et à le relire : une seule fois
    var champs = champsReglages();
    var boite = $('#formulaire-reglages');
    boite.innerHTML = '<div class="bloc"><h2>Réglages du site</h2>'
      + '<p class="aide">Ces valeurs alimentent les liens WhatsApp et la création des sessions. '
      + 'La devise, l’indicatif, le format des numéros et les moyens de paiement se règlent '
      + 'pays par pays dans la rubrique <strong>Pays</strong>.</p><form id="form-reglages">'
      + construireChamps(champs, etat.catalogue.reglages || {}, FORM_REGLAGES)
      + '<div class="panneau__boutons" style="justify-content:flex-start;margin-top:18px">'
      + '<button class="bouton bouton--primaire" type="submit" id="btn-reglages">'
      + '<span class="btn-texte">Enregistrer les réglages</span>'
      + '<span class="btn-attente" hidden><span class="rondelle"></span>Enregistrement…</span></button></div>'
      + '<p class="message message--erreur" id="erreur-reglages" role="alert" hidden></p>'
      + '</form></div>';

    $('#form-reglages').addEventListener('submit', function (e) {
      e.preventDefault();
      var bouton = $('#btn-reglages');
      var erreur = $('#erreur-reglages');
      erreur.hidden = true;
      attente(bouton, true);
      appeler('admin.reglages.save', { donnees: lireChamps(champs, FORM_REGLAGES) }).then(function () {
        attente(bouton, false);
        afficherMessage('#succes-globale', 'Réglages enregistrés.', 5000);
      }).catch(function (err) {
        attente(bouton, false);
        erreur.textContent = messageLisible(err);
        erreur.hidden = false;
      });
    });
  }

  // ------------------------------- PANNEAU -------------------------------

  var validerCourant = null;

  function ouvrirPanneau(titre, champs, donnees, auValider) {
    $('#panneau-titre').textContent = titre;
    $('#panneau-form').innerHTML = construireChamps(champs, donnees);
    $('#panneau-erreur').hidden = true;
    $('#panneau').hidden = false;
    document.body.style.overflow = 'hidden';

    validerCourant = function (e) {
      e.preventDefault();
      var manquant = champs.filter(function (c) {
        return c.cle && c.requis && !String(lireChamp(c) || '').trim();
      });
      if (manquant.length) {
        $('#panneau-erreur').textContent = 'Ce champ est obligatoire : ' + manquant[0].libelle + '.';
        $('#panneau-erreur').hidden = false;
        var el = $('#champ-' + manquant[0].cle);
        if (el) el.focus();
        return;
      }
      $('#panneau-erreur').hidden = true;
      attente($('#panneau-valider'), true);
      auValider(lireChamps(champs), function (erreur) {
        attente($('#panneau-valider'), false);
        if (erreur) {
          $('#panneau-erreur').textContent = erreur;
          $('#panneau-erreur').hidden = false;
        }
      });
    };
    $('#panneau-form').addEventListener('submit', validerCourant);
    champs.forEach(function (c) {
      if (c.type === 'image') activerChampImage(c.cle, c.format);

      if (c.type === 'programme') {
        rendreProgramme(c.cle, donnees[c.cle] ? JSON.parse(JSON.stringify(donnees[c.cle])) : null);
        var ajouterModule = document.querySelector('[data-ajouter-module="' + c.cle + '"]');
        if (ajouterModule) ajouterModule.addEventListener('click', function () {
          var courant = lireProgrammeChamp(c.cle) || { sousTitre: '', modules: [] };
          courant.modules.push({ icone: 'menu_book', titre: '', points: [] });
          rendreProgramme(c.cle, courant);
        });
        return;
      }

      if (c.type === 'faq') {
        rendreFaq(c.cle, Array.isArray(donnees[c.cle])
          ? donnees[c.cle].map(function (q) { return Object.assign({}, q); }) : []);
        var ajouterQuestion = document.querySelector('[data-ajouter-question="' + c.cle + '"]');
        if (ajouterQuestion) ajouterQuestion.addEventListener('click', function () {
          rendreFaq(c.cle, (lireFaqChamp(c.cle) || []).concat([{ question: '', reponse: '' }]));
        });
        return;
      }

      if (c.type !== 'paiements') return;
      // Copie : l'édition ne doit pas modifier le catalogue avant enregistrement
      var initial = Array.isArray(donnees[c.cle])
        ? donnees[c.cle].map(function (m) { return Object.assign({}, m); }) : [];
      rendrePaiements(c.cle, initial);
      var ajouter = document.querySelector('[data-ajouter-paiement="' + c.cle + '"]');
      if (ajouter) ajouter.addEventListener('click', function () {
        rendrePaiements(c.cle, (lirePaiements(c.cle) || []).concat([{ kind: 'mobile', label: '' }]));
      });
    });
    var premier = $('#panneau-form input:not([type=hidden]), #panneau-form select, #panneau-form textarea');
    if (premier) premier.focus();
  }

  function fermerPanneau() {
    // Édition abandonnée : les visuels remplacés restent en place
    etat.imagesARetirer = [];
    if (validerCourant) $('#panneau-form').removeEventListener('submit', validerCourant);
    validerCourant = null;
    $('#panneau').hidden = true;
    document.body.style.overflow = '';
    attente($('#panneau-valider'), false);
  }

  /**
   * Un formulaire, et l'espace de noms de ses champs.
   *
   * « Numéro WhatsApp » est déclaré à DEUX endroits : les réglages du site, et
   * la fiche d'un pays. Les deux <input> portaient le même identifiant. Or une
   * vue quittée reste dans la page — elle est seulement masquée — si bien que
   * getElementById rendait le PREMIER du document, celui des réglages. On
   * saisissait le numéro comorien dans la fiche des Comores, et c'est le numéro
   * djiboutien qui partait au serveur ; à l'actualisation, il était de retour.
   *
   * Un préfixe par formulaire supprime les identifiants en double — ce qui
   * répare aussi les étiquettes, qui donnaient le focus au champ de l'autre
   * formulaire. La lecture est en outre bornée au conteneur : même en cas de
   * clé identique, un formulaire ne peut plus lire celui d'à côté.
   */
  function formulaire(prefixe, selecteurRacine) {
    return {
      prefixe: prefixe || '',
      racine: function () {
        return (selecteurRacine && document.querySelector(selecteurRacine)) || document;
      }
    };
  }

  var FORM_PANNEAU = formulaire('', '#panneau');
  var FORM_REGLAGES = formulaire('reglages-', '#formulaire-reglages');

  function construireChamps(champs, donnees, form) {
    form = form || FORM_PANNEAU;
    var html = '<div class="grille-champs">';
    champs.forEach(function (c) {
      if (c.section) {
        html += '</div><p class="section-form">' + echapper(c.section) + '</p><div class="grille-champs">';
        return;
      }
      var v = donnees[c.cle];
      if (v === undefined || v === null) v = c.defaut !== undefined ? c.defaut : '';
      var id = 'champ-' + form.prefixe + c.cle;
      var classe = 'champ' + (c.large || c.type === 'textarea' || c.type === 'lignes' || c.type === 'objectifs' ? ' pleine-largeur' : '');

      if (c.type === 'image') {
        html += champImage(c.cle, c.libelle, v, c.aide);
        return;
      }

      /* Tarifs par pays : une case par pays, dans SA devise. Rien n'est converti,
         et un montant laissé vide veut dire « pas encore fixé », pas « gratuit ». */
      if (c.type === 'tarifs') {
        var pays = listePays();
        html += '<div class="champ pleine-largeur">'
          + (c.libelle ? '<span class="champ__label">' + echapper(c.libelle) + '</span>' : '');
        html += pays.length
          ? '<div class="grille-champs" data-tarifs="' + echapper(c.cle) + '">'
            + pays.map(function (p) {
              var montant = tarifFormation(donnees, p);
              return '<label class="champ"><span class="champ__label">' + echapper(p.nom)
                + ' (' + echapper(p.devise) + ')</span>'
                + '<input type="number" min="0" step="1" data-tarif="' + echapper(p.code) + '" value="'
                + (typeof montant === 'number' ? echapper(montant) : '') + '"></label>';
            }).join('') + '</div>'
          : '<p class="champ__aide">Aucun pays enregistré. Créez-en un dans la rubrique Pays pour pouvoir saisir des tarifs.</p>';
        html += '<span class="champ__aide">Chaque montant se saisit dans la devise du pays, tel quel : '
          + 'aucune conversion n’est faite d’une devise à l’autre. Un tarif laissé vide s’affiche '
          + '« À confirmer » plutôt qu’un prix approximatif.</span></div>';
        return;
      }

      if (c.type === 'programme') {
        html += '<div class="champ pleine-largeur">'
          + '<div class="paiements" data-programme="' + echapper(c.cle) + '"></div>'
          + '<button type="button" class="bouton bouton--discret bouton--petit" data-ajouter-module="' + echapper(c.cle) + '">'
          + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Ajouter un module</button>'
          + '<span class="champ__aide">C’est le bloc « Qu’allez-vous apprendre ? » de la fiche. '
          + 'Sans module, la fiche se rabat sur la liste des acquis ci-dessus.</span></div>';
        return;
      }

      if (c.type === 'faq') {
        html += '<div class="champ pleine-largeur">'
          + '<div class="paiements" data-faq="' + echapper(c.cle) + '"></div>'
          + '<button type="button" class="bouton bouton--discret bouton--petit" data-ajouter-question="' + echapper(c.cle) + '">'
          + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Ajouter une question</button>'
          + '<span class="champ__aide">Les questions que posent vraiment les candidats. '
          + 'Sans question, la fiche affiche trois réponses communes à toutes les formations.</span></div>';
        return;
      }

      if (c.type === 'paiements') {
        html += '<div class="champ pleine-largeur">'
          + (c.libelle ? '<span class="champ__label">' + echapper(c.libelle) + '</span>' : '')
          + '<div class="paiements" data-paiements="' + echapper(c.cle) + '"></div>'
          + '<button type="button" class="bouton bouton--discret bouton--petit" data-ajouter-paiement="' + echapper(c.cle) + '">'
          + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Ajouter un moyen de paiement</button>'
          + '<span class="champ__aide">Ce sont les coordonnées affichées au candidat à l’étape « Paiement ». '
          + 'Sans aucun moyen, le formulaire annonce que le règlement en ligne n’est pas encore ouvert pour ce pays '
          + 'et renvoie vers WhatsApp — plutôt que d’afficher le numéro d’un autre pays.</span></div>';
        return;
      }

      if (c.type === 'bool') {
        html += '<label class="case pleine-largeur"><input type="checkbox" id="' + id + '"'
          + (v === true ? ' checked' : '') + '><span>' + echapper(c.libelle)
          + (c.aide ? '<span class="champ__aide">' + echapper(c.aide) + '</span>' : '') + '</span></label>';
        return;
      }

      html += '<label class="' + classe + '"><span class="champ__label">' + echapper(c.libelle)
        + (c.requis ? ' *' : '') + '</span>';

      if (c.type === 'textarea') {
        html += '<textarea id="' + id + '">' + echapper(v) + '</textarea>';
      } else if (c.type === 'lignes') {
        html += '<textarea id="' + id + '">' + echapper(Array.isArray(v) ? v.join('\n') : '') + '</textarea>';
      } else if (c.type === 'objectifs') {
        var lignes = Array.isArray(v) ? v.map(function (o) { return o && o.label ? o.label : String(o); }) : [];
        html += '<textarea id="' + id + '">' + echapper(lignes.join('\n')) + '</textarea>';
      } else if (c.type === 'select') {
        var options = c.optionsObjets || (c.options || []).map(function (o) { return { valeur: o, libelle: o }; });

        /* Une valeur enregistrée absente de la liste doit y entrer, et être
           retenue. Sans cela le navigateur garde la PREMIÈRE option — l'option
           vide, ou, quand le champ est obligatoire, la première vraie valeur —
           et le premier enregistrement venu remplace la valeur d'origine sans
           rien dire. Un cadrage choisi à la main se perdait ainsi en corrigeant
           une faute dans la description ; sur un champ obligatoire comme la
           formation d'une session, c'est un rattachement qui changerait seul.
           Même remède que selecteurStatut. */
        var actuelle = (v === null || v === undefined) ? '' : String(v);
        var connue = options.some(function (o) { return String(o.valeur) === actuelle; });
        if (actuelle !== '' && !connue) {
          options = [{ valeur: actuelle, libelle: actuelle + ' (valeur enregistrée)' }].concat(options);
        }

        html += '<select id="' + id + '">'
          + (c.requis ? '' : '<option value=""></option>')
          + options.map(function (o) {
            return '<option value="' + echapper(o.valeur) + '"' + (String(o.valeur) === String(v) ? ' selected' : '')
              + '>' + echapper(o.libelle) + '</option>';
          }).join('') + '</select>';
      } else {
        html += '<input type="' + (c.type || 'text') + '" id="' + id + '" value="' + echapper(v) + '">';
      }

      if (c.aide) html += '<span class="champ__aide">' + echapper(c.aide) + '</span>';
      html += '</label>';
    });
    return html + '</div>';
  }

  function lireChamp(c, form) {
    form = form || FORM_PANNEAU;
    var racine = form.racine();
    if (c.type === 'tarifs') return lireTarifs(c.cle, racine);
    if (c.type === 'paiements') return lirePaiements(c.cle, racine);
    if (c.type === 'programme') return lireProgrammeChamp(c.cle, racine);
    if (c.type === 'faq') return lireFaqChamp(c.cle, racine);
    /* querySelector borné au conteneur, et non getElementById sur tout le
       document : c'est ce qui empêche de lire le champ homonyme d'ailleurs. */
    var el = racine.querySelector('[id="champ-' + form.prefixe + c.cle + '"]');
    if (!el) return undefined;
    if (c.type === 'bool') return el.checked;
    if (c.type === 'number') {
      var t = el.value.trim();
      if (t === '') return null;
      var n = Number(t);
      return isNaN(n) ? null : n;
    }
    if (c.type === 'lignes') {
      return el.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    }
    if (c.type === 'objectifs') {
      return el.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
        .map(function (l) { return { icon: 'check_circle', label: l, value: l }; });
    }
    return el.value.trim();
  }

  /** Tarifs saisis : { DJ: 7500, KM: null }. `null` = non fixé, jamais 0. */
  function lireTarifs(cle, racine) {
    var boite = (racine || document).querySelector('[data-tarifs="' + cle + '"]');
    if (!boite) return undefined;
    var o = {};
    Array.prototype.slice.call(boite.querySelectorAll('[data-tarif]')).forEach(function (input) {
      var t = input.value.trim();
      var n = t === '' ? NaN : Number(t);
      o[input.dataset.tarif] = isNaN(n) ? null : n;
    });
    return o;
  }

  // ----------------------- MOYENS DE PAIEMENT (champ) ---------------------

  /* Un moyen de paiement n'est pas une ligne de texte : il porte un numéro, un
     nom de compte ou un lieu de rendez-vous. D'où ce petit éditeur répétable,
     qui affiche les champs du type choisi et masque les autres. */
  var CHAMPS_MOYEN = [
    { cle: 'label', libelle: 'Nom affiché', pour: null, aide: 'Ex. Waafi, Orange Money, Espèces.' },
    { cle: 'numberLabel', libelle: 'Intitulé du numéro', pour: 'mobile', exemple: 'Numéro' },
    { cle: 'number', libelle: 'Numéro à créditer', pour: 'mobile' },
    { cle: 'accountName', libelle: 'Nom du compte', pour: 'mobile' },
    { cle: 'recipient', libelle: 'À remettre à', pour: 'cash' },
    { cle: 'place', libelle: 'Lieu', pour: 'cash' },
    { cle: 'phone', libelle: 'Sur rendez-vous', pour: 'cash' }
  ];

  function rendrePaiements(cle, liste) {
    var boite = document.querySelector('[data-paiements="' + cle + '"]');
    if (!boite) return;

    boite.innerHTML = liste.length ? liste.map(function (m, i) {
      var kind = m.kind === 'cash' ? 'cash' : 'mobile';
      return '<div class="paiement" data-moyen>'
        + '<div class="paiement__entete">'
        + '<span class="paiement__titre">' + echapper(m.label || m.value || 'Moyen de paiement') + '</span>'
        + '<button type="button" class="bouton bouton--discret bouton--petit" data-retirer-moyen="' + i + '">Retirer</button>'
        + '</div><div class="grille-champs">'
        + '<label class="champ"><span class="champ__label">Type</span>'
        + '<select data-moyen-champ="kind">'
        + '<option value="mobile"' + (kind === 'mobile' ? ' selected' : '') + '>Paiement mobile</option>'
        + '<option value="cash"' + (kind === 'cash' ? ' selected' : '') + '>Espèces</option>'
        + '</select></label>'
        + CHAMPS_MOYEN.map(function (c) {
          if (c.pour && c.pour !== kind) return '';
          return '<label class="champ"><span class="champ__label">' + echapper(c.libelle) + '</span>'
            + '<input type="text" data-moyen-champ="' + c.cle + '" value="' + echapper(m[c.cle] || '') + '"'
            + (c.exemple ? ' placeholder="' + echapper(c.exemple) + '"' : '') + '>'
            + (c.aide ? '<span class="champ__aide">' + echapper(c.aide) + '</span>' : '') + '</label>';
        }).join('')
        + '</div>'
        + champImage('moyen-' + cle + '-' + i, 'Logo (facultatif)', m.image || '',
          'Affiché sur la carte du moyen de paiement. Sans logo, une icône est utilisée.')
        /* `value` est l'intitulé enregistré dans la feuille depuis le début : il
           ne suit PAS le renommage, sinon les inscriptions déjà reçues et les
           nouvelles ne parleraient plus du même moyen de paiement. */
        + '<input type="hidden" data-moyen-champ="value" value="' + echapper(m.value || '') + '">'
        + '</div>';
    }).join('') : '<p class="champ__aide">Aucun moyen de paiement pour ce pays.</p>';

    liste.forEach(function (m, i) { activerChampImage('moyen-' + cle + '-' + i, 'logo'); });

    boite.querySelectorAll('[data-retirer-moyen]').forEach(function (b) {
      b.addEventListener('click', function () {
        var courant = lirePaiements(cle);
        courant.splice(Number(b.dataset.retirerMoyen), 1);
        rendrePaiements(cle, courant);
      });
    });
    // Changer le type change les champs à remplir : on redessine la liste
    boite.querySelectorAll('[data-moyen-champ="kind"]').forEach(function (s) {
      s.addEventListener('change', function () { rendrePaiements(cle, lirePaiements(cle)); });
    });
  }

  function champImage(cle, libelle, valeur, aide) {
    return '<div class="champ pleine-largeur"><span class="champ__label">' + echapper(libelle) + '</span>'
      + '<div class="image" id="image-' + echapper(cle) + '">'
      + '<div class="image__apercu"></div>'
      + '<div class="image__actions">'
      + '<label class="bouton bouton--discret bouton--petit">'
      + '<span class="material-symbols-outlined" aria-hidden="true">upload</span>Choisir une image'
      + '<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>'
      + '<button type="button" class="bouton bouton--discret bouton--petit" data-retirer hidden>Retirer</button>'
      + '</div><p class="image__etat" role="status"></p></div>'
      + '<input type="hidden" id="champ-' + echapper(cle) + '" value="' + echapper(valeur) + '">'
      + (aide ? '<span class="champ__aide">' + echapper(aide) + '</span>' : '')
      + '</div>';
  }

  // ---------------------- PROGRAMME ET FAQ (champs) ----------------------

  /* Icônes proposées pour les modules. Liste fermée à dessein : une icône saisie
     librement qui n'existe pas dans la police du site s'afficherait en toutes
     lettres sur la fiche. Elles sont écrites ici sous la forme `icon: '…'`, que
     le générateur de polices relève automatiquement dans les sources. */
  var ICONES_MODULE = [
    { icon: 'design_services', label: 'Design' },
    { icon: 'phone_iphone', label: 'Réseaux sociaux' },
    { icon: 'movie', label: 'Vidéo' },
    { icon: 'rocket_launch', label: 'Lancement' },
    { icon: 'photo_camera', label: 'Photo' },
    { icon: 'campaign', label: 'Communication' },
    { icon: 'brush', label: 'Création' },
    { icon: 'psychology', label: 'Stratégie' },
    { icon: 'auto_awesome', label: 'Intelligence artificielle' },
    { icon: 'business_center', label: 'Business' },
    { icon: 'groups', label: 'Communauté' },
    { icon: 'menu_book', label: 'Général' }
  ];

  /**
   * Programme détaillé : un sous-titre, puis des modules qui portent chacun une
   * icône, un titre et des points. Les points se saisissent un par ligne —
   * c'est le format le plus rapide pour ce qui est, au fond, une liste.
   */
  function rendreProgramme(cle, valeur) {
    var boite = document.querySelector('[data-programme="' + cle + '"]');
    if (!boite) return;
    var modules = (valeur && valeur.modules) || [];

    boite.innerHTML = '<label class="champ pleine-largeur"><span class="champ__label">Résumé du parcours</span>'
      + '<input type="text" data-programme-resume value="' + echapper((valeur && valeur.sousTitre) || '') + '"'
      + ' placeholder="Ex. 12 séances · 24 heures · 4 modules">'
      + '<span class="champ__aide">Affiché sous le titre « Qu’allez-vous apprendre ? ». Facultatif.</span></label>'
      + (modules.length ? modules.map(function (m, i) {
        return '<div class="paiement" data-module>'
          + '<div class="paiement__entete">'
          + '<span class="paiement__titre">' + echapper(m.titre || ('Module ' + (i + 1))) + '</span>'
          + '<button type="button" class="bouton bouton--discret bouton--petit" data-retirer-module="' + i + '">Retirer</button>'
          + '</div><div class="grille-champs">'
          + '<label class="champ"><span class="champ__label">Icône</span><select data-module-champ="icone">'
          + ICONES_MODULE.map(function (o) {
            return '<option value="' + echapper(o.icon) + '"'
              + (String(m.icone || 'menu_book') === o.icon ? ' selected' : '') + '>'
              + echapper(o.label) + '</option>';
          }).join('') + '</select></label>'
          + '<label class="champ"><span class="champ__label">Titre du module</span>'
          + '<input type="text" data-module-champ="titre" value="' + echapper(m.titre || '') + '"'
          + ' placeholder="Ex. MODULE 1 · DESIGN &amp; IDENTITÉ"></label>'
          + '<label class="champ pleine-largeur"><span class="champ__label">Ce qui est couvert</span>'
          + '<textarea data-module-champ="points">' + echapper((m.points || []).join('\n')) + '</textarea>'
          + '<span class="champ__aide">Un point par ligne.</span></label>'
          + '</div></div>';
      }).join('') : '<p class="champ__aide">Aucun module. Sans module, la fiche affiche simplement la liste des acquis.</p>');

    boite.querySelectorAll('[data-retirer-module]').forEach(function (b) {
      b.addEventListener('click', function () {
        var courant = lireProgrammeChamp(cle);
        courant.modules.splice(Number(b.dataset.retirerModule), 1);
        rendreProgramme(cle, courant);
      });
    });
  }

  function lireProgrammeChamp(cle, racine) {
    var boite = (racine || document).querySelector('[data-programme="' + cle + '"]');
    if (!boite) return undefined;
    var resume = boite.querySelector('[data-programme-resume]');
    var modules = Array.prototype.slice.call(boite.querySelectorAll('[data-module]')).map(function (bloc) {
      var m = {};
      bloc.querySelectorAll('[data-module-champ]').forEach(function (el) {
        m[el.dataset.moduleChamp] = el.value;
      });
      m.titre = String(m.titre || '').trim();
      m.icone = String(m.icone || 'menu_book').trim();
      m.points = String(m.points || '').split('\n')
        .map(function (l) { return l.trim(); }).filter(Boolean);
      return m;
    }).filter(function (m) { return m.titre || m.points.length; });
    return { sousTitre: resume ? resume.value.trim() : '', modules: modules };
  }

  /** Questions fréquentes propres à la formation. */
  function rendreFaq(cle, liste) {
    var boite = document.querySelector('[data-faq="' + cle + '"]');
    if (!boite) return;
    liste = liste || [];

    boite.innerHTML = liste.length ? liste.map(function (q, i) {
      return '<div class="paiement" data-question>'
        + '<div class="paiement__entete">'
        + '<span class="paiement__titre">' + echapper(q.question || ('Question ' + (i + 1))) + '</span>'
        + '<button type="button" class="bouton bouton--discret bouton--petit" data-retirer-question="' + i + '">Retirer</button>'
        + '</div><div class="grille-champs">'
        + '<label class="champ pleine-largeur"><span class="champ__label">Question</span>'
        + '<input type="text" data-question-champ="question" value="' + echapper(q.question || '') + '"></label>'
        + '<label class="champ pleine-largeur"><span class="champ__label">Réponse</span>'
        + '<textarea data-question-champ="reponse">' + echapper(q.reponse || '') + '</textarea></label>'
        + '</div></div>';
    }).join('') : '<p class="champ__aide">Aucune question propre à cette formation : la fiche affiche trois '
      + 'questions communes à toutes les formations.</p>';

    boite.querySelectorAll('[data-retirer-question]').forEach(function (b) {
      b.addEventListener('click', function () {
        var courant = lireFaqChamp(cle);
        courant.splice(Number(b.dataset.retirerQuestion), 1);
        rendreFaq(cle, courant);
      });
    });
  }

  function lireFaqChamp(cle, racine) {
    var boite = (racine || document).querySelector('[data-faq="' + cle + '"]');
    if (!boite) return undefined;
    return Array.prototype.slice.call(boite.querySelectorAll('[data-question]')).map(function (bloc) {
      var q = {};
      bloc.querySelectorAll('[data-question-champ]').forEach(function (el) {
        q[el.dataset.questionChamp] = el.value.trim();
      });
      return q;
    }).filter(function (q) { return q.question && q.reponse; });
  }

  /** Relit l'éditeur : un moyen sans nom est ignoré plutôt qu'enregistré vide. */
  function lirePaiements(cle, racine) {
    var boite = (racine || document).querySelector('[data-paiements="' + cle + '"]');
    if (!boite) return undefined;
    return Array.prototype.slice.call(boite.querySelectorAll('[data-moyen]')).map(function (bloc, i) {
      var m = {};
      bloc.querySelectorAll('[data-moyen-champ]').forEach(function (el) {
        m[el.dataset.moyenChamp] = el.value.trim();
      });
      var logo = document.getElementById('champ-moyen-' + cle + '-' + i);
      m.image = logo ? logo.value.trim() : '';
      m.kind = m.kind === 'cash' ? 'cash' : 'mobile';
      // Nouveau moyen : l'intitulé enregistré part du nom affiché
      if (!m.value) m.value = m.label;
      return m;
    }).filter(function (m) { return m.label || m.value; });
  }

  function lireChamps(champs, form) {
    var o = {};
    champs.forEach(function (c) {
      if (!c.cle) return;
      var v = lireChamp(c, form);
      if (v !== undefined) o[c.cle] = v;
    });
    return o;
  }

  // ---------------------------- CONFIRMATION -----------------------------

  function confirmer(texte, auValider) {
    $('#confirmation-texte').textContent = texte;
    $('#confirmation').hidden = false;
    var bouton = $('#confirmation-valider');
    var nouveau = bouton.cloneNode(true); // retire les écouteurs précédents
    /* `disabled` se reflète en attribut, donc le clone en hérite. Une suppression
       réussie ne rappelant pas `fini`, le bouton restait désactivé : la DEUXIÈME
       suppression de la session était muette, et il fallait recharger la page
       sans jamais savoir pourquoi. */
    nouveau.disabled = false;
    bouton.parentNode.replaceChild(nouveau, bouton);
    nouveau.addEventListener('click', function () {
      nouveau.disabled = true;
      auValider(function (erreur) {
        nouveau.disabled = false;
        if (erreur) {
          fermerConfirmation();
          afficherMessage('#erreur-globale', erreur, 9000);
        }
      });
    });
  }

  function fermerConfirmation() { $('#confirmation').hidden = true; }

  // ------------------------------- AMORÇAGE ------------------------------

  /** Reprend le catalogue actuellement publié pour amorcer la base. */
  function importerCatalogueDuSite() {
    var bouton = $('#btn-importer');
    bouton.disabled = true;
    var donnees = {
      formations: (window.FORMATIONS || []).map(function (f, i) {
        var copie = Object.assign({}, f);
        if (typeof copie.ordre !== 'number') copie.ordre = i;
        return copie;
      }),
      sessions: (window.SESSIONS || []).map(function (s) { return Object.assign({}, s); }),
      pays: (window.PAYS || []).map(function (p, i) {
        var copie = Object.assign({}, p);
        copie.paymentMethods = (p.paymentMethods || []).map(function (m) { return Object.assign({}, m); });
        if (typeof copie.ordre !== 'number') copie.ordre = i;
        return copie;
      }),
      portfolio: (window.PORTFOLIO || []).map(function (r, i) {
        var copie = Object.assign({}, r);
        if (typeof copie.ordre !== 'number') copie.ordre = i;
        delete copie.placeholder; // déduit de l'absence d'image, plus simple à tenir
        return copie;
      }),
      reglages: Object.assign({}, window.SITE_CONTACT || {}, {
        defaultLocation: (window.SESSIONS && window.SESSIONS[0] && window.SESSIONS[0].location) || ''
      })
    };
    appeler('admin.importer', { donnees: donnees }).then(function (d) {
      bouton.disabled = false;
      afficherMessage('#succes-globale',
        d.formations + ' formation(s), ' + d.sessions + ' session(s), '
        + (d.pays || 0) + ' pays et ' + (d.portfolio || 0) + ' réalisation(s) importés.', 6000);
      rafraichirTout();
    }).catch(function (err) {
      bouton.disabled = false;
      afficherMessage('#erreur-globale', messageLisible(err), 9000);
    });
  }

  // ------------------------------- DÉPART --------------------------------

  document.addEventListener('DOMContentLoaded', initConnexion);
})();

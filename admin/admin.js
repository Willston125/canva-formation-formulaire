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
    catalogue: { formations: [], sessions: [], reglages: {} },
    inscriptions: [],
    vue: 'apercu',
    filtreInscriptions: ''
  };

  // ------------------------------- OUTILS --------------------------------

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function echapper(v) {
    var d = document.createElement('div');
    d.textContent = v === null || v === undefined ? '' : String(v);
    return d.innerHTML;
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
  function appeler(action, charge) {
    if (!API) return Promise.reject(new Error('Adresse de l’API non configurée dans formations-data.js.'));
    var corps = Object.assign({ action: action, motDePasse: etat.motDePasse }, charge || {});
    var expiration = new Promise(function (_, rejeter) {
      window.setTimeout(function () { rejeter(new Error('Le serveur met trop de temps à répondre.')); }, 30000);
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
      if (d.catalogue) etat.catalogue = d.catalogue;
      return d;
    });
    return Promise.race([envoi, expiration]);
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
      etat.motDePasse = '';
      try { localStorage.removeItem(CLE_MDP); sessionStorage.removeItem(CLE_MDP); } catch (e) { }
      if (silencieux) {
        // Session mémorisée devenue invalide : on redonne simplement la main
        $('#form-connexion').addEventListener('submit', function (e) {
          e.preventDefault();
          etat.motDePasse = $('#mot-de-passe').value;
          connecter(false);
        });
        // Un script obsolète n'est pas un mot de passe erroné : il faut le dire
        if (!err || !err.apiObsolete) return;
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

    rafraichirTout();
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
    $$('.onglet').forEach(function (o) { o.classList.toggle('is-actif', o.dataset.vue === vue); });
    $$('.vue').forEach(function (v) { v.classList.toggle('is-actif', v.id === 'vue-' + vue); });
    $('#barre').classList.remove('is-ouverte');
    var titres = {
      apercu: ['Vue d’ensemble', 'État du site et raccourcis'],
      formations: ['Formations', 'Le catalogue publié sur le site'],
      sessions: ['Sessions', 'Les dates ouvertes à l’inscription'],
      inscriptions: ['Inscriptions', 'Les candidats et leur suivi'],
      textes: ['Textes du site', 'Les mots affichés sur la page d’accueil'],
      reglages: ['Réglages', 'Contact, paiements et devise']
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
    $('#bloc-amorcage').hidden = f.length > 0;

    var actions = { apercu: '', formations: '', sessions: '', inscriptions: '', textes: '', reglages: '' };
    actions.formations = '<button class="bouton bouton--primaire" type="button" id="btn-nouvelle-formation">'
      + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Nouvelle formation</button>';
    actions.sessions = '<button class="bouton bouton--primaire" type="button" id="btn-nouvelle-session">'
      + '<span class="material-symbols-outlined" aria-hidden="true">add</span>Nouvelle session</button>';
    actions.inscriptions = etat.inscriptions.length
      ? '<button class="bouton bouton--discret" type="button" id="btn-export">'
        + '<span class="material-symbols-outlined" aria-hidden="true">download</span>Exporter (CSV)</button>' : '';
    actions.apercu = '<button class="bouton bouton--discret" type="button" id="btn-rafraichir">'
      + '<span class="material-symbols-outlined" aria-hidden="true">refresh</span>Actualiser</button>';
    $('#actions-vue').innerHTML = actions[etat.vue] || '';

    var b;
    if ((b = $('#btn-nouvelle-formation'))) b.addEventListener('click', function () { ouvrirFormation(null); });
    if ((b = $('#btn-nouvelle-session'))) b.addEventListener('click', function () { ouvrirSession(null); });
    if ((b = $('#btn-export'))) b.addEventListener('click', exporterCsv);
    if ((b = $('#btn-rafraichir'))) b.addEventListener('click', function () {
      afficherMessage('#succes-globale', 'Actualisation…', 1200);
      rafraichirTout();
    });

    if (etat.vue === 'apercu') rendreApercu();
    if (etat.vue === 'formations') rendreFormations();
    if (etat.vue === 'sessions') rendreSessions();
    if (etat.vue === 'inscriptions') rendreInscriptions();
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

  // ----------------------------- FORMATIONS ------------------------------

  function rendreFormations() {
    var f = etat.catalogue.formations || [];
    if (!f.length) {
      $('#liste-formations').innerHTML = vide('school',
        'Aucune formation. Importez le catalogue du site depuis la vue d’ensemble, ou créez-en une.');
      return;
    }
    $('#liste-formations').innerHTML = tableau(
      ['Formation', 'Tarif', 'Sessions', 'État', 'Actions'],
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
          typeof x.price === 'number' ? echapper(x.price.toLocaleString('fr-FR')) + ' '
            + echapper(etat.catalogue.reglages.currency || 'FDJ') : '<span class="cellule-sous">À confirmer</span>',
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
    { cle: 'learnings', libelle: 'Ce que l’on apprend', type: 'lignes', large: true, aide: 'Un acquis par ligne, deux ou trois suffisent.' },
    { cle: 'objectives', libelle: 'Objectifs proposés au candidat', type: 'objectifs', large: true,
      aide: 'Un objectif par ligne, proposé à l’étape 2 du formulaire. Vide = liste commune.' },

    { section: 'Informations pratiques' },
    { cle: 'duration', libelle: 'Durée', type: 'text', aide: 'Ex. « 12 séances ». Laisser « À confirmer » si inconnue.' },
    { cle: 'level', libelle: 'Niveau', type: 'text' },
    { cle: 'mode', libelle: 'Mode', type: 'select', options: ['Présentiel', 'En ligne', 'Hybride', 'À confirmer'] },
    { cle: 'price', libelle: 'Tarif', type: 'number', aide: 'Laisser vide si non confirmé.' },
    { cle: 'modules', libelle: 'Nombre de modules', type: 'number' },
    { cle: 'levelSubject', libelle: 'Sujet de la question de niveau', type: 'text',
      aide: 'Ex. « Canva » donne « Où en es-tu avec Canva ? ». Vide = formulation générique.' },

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
    $('#liste-sessions').innerHTML = tableau(
      ['Session', 'Dates', 'Places', 'État', 'Actions'],
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
      { cle: 'location', libelle: 'Lieu', type: 'text', large: true },
      { cle: 'mode', libelle: 'Mode', type: 'select', options: ['Présentiel', 'En ligne', 'Hybride'] },
      { cle: 'price', libelle: 'Tarif', type: 'number' },
      { cle: 'currency', libelle: 'Devise', type: 'text', aide: 'Vide = devise par défaut du site.' },

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
      currency: etat.catalogue.reglages.currency || ''
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
          + '<div class="cellule-sous">' + echapper((i.countryCode || '') + ' ' + (i.telephone || ''))
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
    poster: { largeur: 1000, hauteur: null, libelle: 'largeur 1000 px, hauteur libre' }
  };

  /**
   * Prépare un fichier choisi par l'utilisateur : orientation redressée,
   * redimensionnement, compression, puis encodage base64.
   * `imageOrientation: 'from-image'` est indispensable : sans lui, les photos
   * prises au téléphone arrivent couchées.
   */
  function preparerImage(fichier, format) {
    if (!/^image\//.test(fichier.type)) {
      return Promise.reject(new Error('Ce fichier n’est pas une image.'));
    }
    if (fichier.size > 25 * 1024 * 1024) {
      return Promise.reject(new Error('Fichier trop lourd (plus de 25 Mo).'));
    }

    return createImageBitmap(fichier, { imageOrientation: 'from-image' })
      .catch(function () { return createImageBitmap(fichier); })
      .catch(function () { throw new Error('Image illisible. Essayez un JPEG ou un PNG.'); })
      .then(function (bitmap) {
        var cible = calculerTaille(bitmap.width, bitmap.height, format);
        var toile = document.createElement('canvas');
        toile.width = cible.largeur;
        toile.height = cible.hauteur;
        var ctx = toile.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        // Recadrage centré : on remplit le cadre sans déformer le sujet
        ctx.drawImage(bitmap, cible.sx, cible.sy, cible.sw, cible.sh, 0, 0, cible.largeur, cible.hauteur);
        bitmap.close && bitmap.close();

        return encoder(toile, 'image/webp', 0.82)
          .catch(function () { return encoder(toile, 'image/jpeg', 0.85); });
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
      var ancienne = champ.value.trim();
      champ.value = '';
      rafraichir();
      etatEl.textContent = 'Visuel retiré. Enregistrez pour valider.';
      if (/googleusercontent|drive\.google/.test(ancienne)) {
        appeler('admin.image.delete', { url: ancienne }).catch(function () { });
      }
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
            donnees: { base64: prete.base64, type: prete.type, nom: fichier.name.replace(/\.[^.]+$/, '') }
          });
        })
        .then(function (reponse) {
          champ.value = reponse.url;
          rafraichir();
          etatEl.textContent = 'Image envoyée. Enregistrez pour l’appliquer.';
          entree.disabled = false;
          entree.value = '';
          // Le visuel remplacé n'a plus d'usage : on ne laisse pas de fichiers orphelins
          if (ancienne && ancienne !== reponse.url && /googleusercontent|drive\.google/.test(ancienne)) {
            appeler('admin.image.delete', { url: ancienne }).catch(function () { });
          }
        })
        .catch(function (err) {
          etatEl.textContent = messageLisible(err);
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
            defaut: (estHtml ? el.innerHTML : el.textContent).replace(/\s+/g, ' ').trim(),
            html: estHtml
          });
        });
      });
      if (!liste.length) throw new Error('Aucun texte modifiable trouvé sur le site.');
      etat.textesDeclares = liste;
      return liste;
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

    boite.innerHTML = '<div class="bloc"><h2>Textes de la page d’accueil</h2>'
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

  var CHAMPS_REGLAGES = [
    { section: 'Contact' },
    { cle: 'contactName', libelle: 'Nom du contact', type: 'text' },
    { cle: 'whatsappNumber', libelle: 'Numéro WhatsApp', type: 'text',
      aide: 'Chiffres uniquement, indicatif compris. Ex. 25377145306' },
    { cle: 'whatsappDisplay', libelle: 'Numéro affiché', type: 'text', aide: 'Ex. +253 77 14 53 06' },

    { section: 'Marché' },
    { cle: 'currency', libelle: 'Devise', type: 'text', aide: 'Ex. FDJ' },
    { cle: 'countryCode', libelle: 'Indicatif téléphonique', type: 'text', aide: 'Ex. +253' },
    { cle: 'defaultLocation', libelle: 'Lieu habituel', type: 'text', large: true,
      aide: 'Proposé par défaut à la création d’une session.' },
    { cle: 'phoneFormatHint', libelle: 'Message si numéro invalide', type: 'text', large: true }
  ];

  function rendreReglages() {
    var boite = $('#formulaire-reglages');
    boite.innerHTML = '<div class="bloc"><h2>Réglages du site</h2>'
      + '<p class="aide">Ces valeurs alimentent les liens WhatsApp, la devise affichée et le format des numéros '
      + 'demandé aux candidats.</p><form id="form-reglages">'
      + construireChamps(CHAMPS_REGLAGES, etat.catalogue.reglages || {})
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
      appeler('admin.reglages.save', { donnees: lireChamps(CHAMPS_REGLAGES) }).then(function () {
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
    champs.forEach(function (c) { if (c.type === 'image') activerChampImage(c.cle, c.format); });
    var premier = $('#panneau-form input:not([type=hidden]), #panneau-form select, #panneau-form textarea');
    if (premier) premier.focus();
  }

  function fermerPanneau() {
    if (validerCourant) $('#panneau-form').removeEventListener('submit', validerCourant);
    validerCourant = null;
    $('#panneau').hidden = true;
    document.body.style.overflow = '';
    attente($('#panneau-valider'), false);
  }

  function construireChamps(champs, donnees) {
    var html = '<div class="grille-champs">';
    champs.forEach(function (c) {
      if (c.section) {
        html += '</div><p class="section-form">' + echapper(c.section) + '</p><div class="grille-champs">';
        return;
      }
      var v = donnees[c.cle];
      if (v === undefined || v === null) v = c.defaut !== undefined ? c.defaut : '';
      var id = 'champ-' + c.cle;
      var classe = 'champ' + (c.large || c.type === 'textarea' || c.type === 'lignes' || c.type === 'objectifs' ? ' pleine-largeur' : '');

      if (c.type === 'image') {
        html += '<div class="champ pleine-largeur"><span class="champ__label">' + echapper(c.libelle) + '</span>'
          + '<div class="image" id="image-' + c.cle + '">'
          + '<div class="image__apercu"></div>'
          + '<div class="image__actions">'
          + '<label class="bouton bouton--discret bouton--petit">'
          + '<span class="material-symbols-outlined" aria-hidden="true">upload</span>Choisir une image'
          + '<input type="file" accept="image/*" hidden></label>'
          + '<button type="button" class="bouton bouton--discret bouton--petit" data-retirer hidden>Retirer</button>'
          + '</div><p class="image__etat" role="status"></p></div>'
          + '<input type="hidden" id="' + id + '" value="' + echapper(v) + '">'
          + (c.aide ? '<span class="champ__aide">' + echapper(c.aide) + '</span>' : '')
          + '</div>';
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

  function lireChamp(c) {
    var el = document.getElementById('champ-' + c.cle);
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

  function lireChamps(champs) {
    var o = {};
    champs.forEach(function (c) {
      if (!c.cle) return;
      var v = lireChamp(c);
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
      reglages: Object.assign({}, window.SITE_CONTACT || {}, {
        defaultLocation: (window.SESSIONS && window.SESSIONS[0] && window.SESSIONS[0].location) || ''
      })
    };
    delete donnees.reglages.paymentMethods; // structure conservée côté site, non éditable ici
    appeler('admin.importer', { donnees: donnees }).then(function (d) {
      bouton.disabled = false;
      afficherMessage('#succes-globale',
        d.formations + ' formation(s) et ' + d.sessions + ' session(s) importées.', 6000);
      rafraichirTout();
    }).catch(function (err) {
      bouton.disabled = false;
      afficherMessage('#erreur-globale', messageLisible(err), 9000);
    });
  }

  // ------------------------------- DÉPART --------------------------------

  document.addEventListener('DOMContentLoaded', initConnexion);
})();

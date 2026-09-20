/* =========================================
   SITE COMMON — header, bannière session, accordéons, helpers
   Chargé sur toutes les pages, après formations-data.js.
   Aucune logique métier du formulaire ici.
   ========================================= */
(function () {
    'use strict';

    document.documentElement.classList.add('has-js');

    /* Réassignables : formations-data.js fournit les valeurs de départ, affichées
       immédiatement ; le catalogue tenu à jour depuis le tableau de bord les
       remplace dès que la réponse de l'API arrive. */
    let FORMATIONS = Array.isArray(window.FORMATIONS) ? window.FORMATIONS : [];
    let SESSIONS = Array.isArray(window.SESSIONS) ? window.SESSIONS : [];
    let PAYS = Array.isArray(window.PAYS) ? window.PAYS : [];
    /* Les pays tels que le FICHIER les déclare. Le catalogue de la feuille les
       remplace, mais une feuille créée avant l'ajout d'une colonne ne peut pas
       la renseigner : les repères techniques (fuseaux horaires, codes de
       région) seraient alors perdus, et la reconnaissance du visiteur avec eux.
       On les récupère d'ici quand la feuille n'a rien à dire. */
    const PAYS_FICHIER = Array.isArray(window.PAYS) ? window.PAYS.slice() : [];
    let CONTACT = window.SITE_CONTACT || { whatsappNumber: '25377145306', whatsappDisplay: '+253 77 14 53 06', contactName: 'Ali William' };

    /* ---------- Pays desservis ----------
       Le pays détermine la devise, l'indicatif, le format des numéros, les
       moyens de paiement et — surtout — le tarif. Rien n'est converti d'une
       devise à l'autre : chaque montant est celui qui a été saisi pour ce pays.
       Le choix du visiteur est conservé d'une page à l'autre, pour qu'il n'ait
       pas à le refaire en revenant au catalogue. */
    const CLE_PAYS = 'impactali_pays';
    let codePays = null;

    /** Pays réellement proposés (un pays peut être préparé sans être ouvert). */
    function paysDisponibles() {
        return PAYS.filter(p => p && p.code && p.active !== false);
    }

    function paysParDefaut() {
        const liste = paysDisponibles();
        return liste.find(p => p.defaut) || liste[0] || null;
    }

    function trouverPays(code) {
        if (!code) return null;
        const cible = String(code).trim().toUpperCase();
        return paysDisponibles().find(p => String(p.code).toUpperCase() === cible) || null;
    }

    /**
     * Pays deviné à partir du navigateur, sans aucune requête ni service tiers.
     *
     * Deux indices, déjà présents sur l'appareil : le fuseau horaire déclaré
     * (« Indian/Comoro », « Africa/Djibouti ») et la région de la langue
     * (« fr-KM »). Rien n'est envoyé nulle part — contrairement à une
     * géolocalisation par adresse IP, qui confierait la position du visiteur à
     * un service extérieur pour un résultat guère plus sûr.
     *
     * Une supposition n'est jamais définitive : le sélecteur du formulaire
     * d'inscription reste maître, et son choix est mémorisé.
     * @returns {Object|null}
     */
    function paysDevine() {
        const liste = paysDisponibles();
        if (!liste.length) return null;

        let fuseau = '';
        try { fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* non géré */ }
        if (fuseau) {
            const parFuseau = liste.find(p => (p.fuseaux || []).some(f => String(f).toLowerCase() === fuseau.toLowerCase()));
            if (parFuseau) return parFuseau;
        }

        const langues = []
            .concat(Array.isArray(navigator.languages) ? navigator.languages : [])
            .concat(navigator.language ? [navigator.language] : []);
        for (const langue of langues) {
            // « fr-KM » → « KM » ; « fr » seul ne dit rien du pays
            const region = String(langue).split('-')[1];
            if (!region || region.length !== 2) continue;
            const parRegion = liste.find(p => (p.regions || []).some(r => String(r).toUpperCase() === region.toUpperCase())
                || String(p.code).toUpperCase() === region.toUpperCase());
            if (parRegion) return parRegion;
        }
        return null;
    }

    /**
     * Pays courant : le choix explicite du visiteur d'abord, sinon celui que
     * son navigateur laisse deviner, sinon le pays par défaut.
     */
    function paysActif() {
        if (codePays === null) {
            let memorise = null;
            try { memorise = localStorage.getItem(CLE_PAYS); } catch (e) { /* stockage indisponible */ }
            codePays = trouverPays(memorise) ? String(memorise).toUpperCase() : '';
        }
        return trouverPays(codePays) || paysDevine() || paysParDefaut();
    }

    /**
     * Change le pays courant. Les pages écoutent « impactali:pays » pour
     * réafficher tarifs, devises et coordonnées SANS rechargement.
     * @returns {boolean} true si le pays a réellement changé
     */
    function choisirPays(code) {
        const pays = trouverPays(code);
        if (!pays || (paysActif() && paysActif().code === pays.code)) return false;
        codePays = pays.code;
        try { localStorage.setItem(CLE_PAYS, pays.code); } catch (e) { /* stockage indisponible */ }
        document.dispatchEvent(new CustomEvent('impactali:pays', { detail: { pays: pays } }));
        return true;
    }

    function devise(pays) { return (pays || paysActif() || {}).devise || ''; }

    /**
     * Pays où une session est proposée.
     *
     * Le champ portait UN seul code : une session ne pouvait s'ouvrir qu'à un
     * pays, ou à tous. Il accepte maintenant une liste — « DJ,KM » — pour qu'on
     * coche les pays un à un. Une liste vide garde l'ancien sens : proposée
     * partout, y compris dans un pays ajouté plus tard.
     */
    function paysDeSession(session) {
        return String((session && session.pays) || '')
            .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    }

    /** Cette session est-elle proposée aux candidats de ce pays ? */
    function sessionOuverteAu(session, code) {
        const liste = paysDeSession(session);
        return !liste.length || liste.indexOf(String(code || '').toUpperCase()) >= 0;
    }

    /**
     * Réglages propres à un pays dans une session : mode, lieu, tarif.
     *
     * Une même session se tient en présentiel à Djibouti et en ligne ailleurs ;
     * son lieu n'a de sens que là où elle est physique, et son tarif change de
     * montant ET de devise d'un pays à l'autre. Un seul jeu de valeurs pour
     * tous les pays affichait donc « Saalam Tower » à un candidat comorien qui
     * suit la formation depuis chez lui.
     *
     * Rend toujours un objet, jamais `null` : l'appelant lit ses champs sans
     * avoir à se garder. Une colonne absente — toute session créée avant elle —
     * rend simplement un objet vide, et les valeurs de la session font foi.
     */
    function reglagesDuPays(session, code) {
        const table = session && session.parPays;
        if (!table || typeof table !== 'object' || Array.isArray(table)) return {};
        const cible = String(code || '').toUpperCase();
        const trouve = Object.keys(table).find(c => String(c).toUpperCase() === cible);
        const valeur = trouve ? table[trouve] : null;
        return (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) ? valeur : {};
    }

    /** Mode d'une session dans ce pays : le sien s'il est réglé, celui de la session sinon. */
    function modeDeSession(session, code) {
        const propre = reglagesDuPays(session, code).mode;
        return (typeof propre === 'string' && propre.trim()) ? propre.trim() : ((session && session.mode) || '');
    }

    /**
     * Lieu d'une session dans ce pays.
     * Une session EN LIGNE n'a pas de lieu : en annoncer un — fût-ce celui de la
     * session — enverrait un candidat à une adresse où personne ne l'attend.
     */
    function lieuDeSession(session, code) {
        if (/^en ligne$/i.test(modeDeSession(session, code))) return '';
        const propre = reglagesDuPays(session, code).lieu;
        if (typeof propre === 'string' && propre.trim()) return propre.trim();
        /* LE LIEU DE LA SESSION EST UNE ADRESSE : elle n'est que dans UN pays.
           Dès que la session est proposée dans plusieurs, la donner à tous
           envoyait un candidat comorien à Djibouti — c'est exactement ce que
           faisaient deux sessions de la feuille. Sans lieu propre à son pays,
           on n'annonce rien plutôt qu'une adresse d'ailleurs. Même raisonnement
           que pour le tarif, qui ne passe déjà plus d'un pays à l'autre.
           Le tableau de bord refuse désormais cette saisie ; ce garde-ci vaut
           pour les sessions enregistrées avant lui. */
        if (paysDeSession(session).length > 1) return '';
        return (session && session.location) || '';
    }

    /**
     * Tarif d'une formation (ou d'une session) dans le pays demandé.
     * `prices` donne le montant pays par pays ; `price` reste le tarif du pays
     * par défaut, pour les données antérieures aux tarifs multi-pays et pour les
     * sessions, qui se déroulent dans un seul pays.
     * Aucun repli d'un pays sur un autre : un tarif non saisi vaut « inconnu ».
     * @returns {number|null}
     */
    function prixDe(objet, code) {
        if (!objet) return null;
        const pays = trouverPays(code) || paysActif();
        if (!pays) return null;
        /* Tarif réglé POUR CE PAYS dans la session : c'est le plus précis, il
           passe avant celui de la formation. Il porte déjà la devise du pays,
           puisqu'il a été saisi en face de lui — rien n'est converti. */
        const duPays = reglagesDuPays(objet, pays.code).tarif;
        if (typeof duPays === 'number' && isFinite(duPays)) return duPays;

        const table = objet.prices;
        if (table && typeof table === 'object') {
            const valeur = table[pays.code];
            if (typeof valeur === 'number' && isFinite(valeur)) return valeur;
            if (Object.prototype.hasOwnProperty.call(table, pays.code)) return null;
        }
        // Une session appartient à un pays : son tarif ne vaut que pour celui-là
        const codesSession = paysDeSession(objet);
        if (codesSession.length) {
            /* Une session ne porte qu'UN prix, donc une seule devise. Dès qu'elle
               est proposée dans plusieurs pays, ce montant ne peut pas valoir
               pour tous : on l'écarte, et le tarif de la formation — saisi pays
               par pays — reprend la main. Sans cela, ouvrir aux Comores une
               session djiboutienne à 7 500 FDJ affichait « 7 500 KMF ». */
            if (codesSession.length > 1) return null;
            return sessionOuverteAu(objet, pays.code) && typeof objet.price === 'number' ? objet.price : null;
        }

        /* `price` est le tarif unique d'avant les tarifs par pays. Il ne vaut
           QUE pour un objet qui n'a aucune table : en sortir un montant parce
           que le pays demandé se trouve être celui par défaut faisait afficher
           les 7 500 FDJ djiboutiens en « 7 500 KMF » dès qu'on désignait les
           Comores par défaut. Personne n'a saisi ce tarif. Un tarif non fixé
           s'annonce « À confirmer » — jamais converti, jamais recopié. */
        if (objet.prices && typeof objet.prices === 'object') return null;

        const defaut = paysParDefaut();
        if (defaut && defaut.code === pays.code && typeof objet.price === 'number') return objet.price;
        return null;
    }

    /** « 7 500 FDJ » pour la formation ou la session donnée, dans le pays courant. */
    function formatPrixDe(objet, code) {
        const pays = trouverPays(code) || paysActif();
        return formatPrice(prixDe(objet, pays && pays.code), devise(pays));
    }

    /** Formate une date ISO (YYYY-MM-DD) en français, ex. « 16 avril 2026 ». */
    function formatSessionDate(isoDate) {
        if (!isoDate) return '';
        const date = new Date(`${isoDate}T12:00:00`);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    /* Échappement pour insertion dans du HTML, contenu comme ATTRIBUT.
       Le détour par textContent puis innerHTML n'échappait pas les guillemets :
       une valeur du catalogue posée dans value="…" pouvait refermer l'attribut.
       On échappe explicitement, sans dépendre du comportement du navigateur. */
    function escapeHtml(text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Les domaines du pied de page.
     *
     * La colonne existe dans les dix pages du site, mais seul landing.js la
     * remplissait — et landing.js n'est chargé que sur l'accueil. Les neuf
     * autres pages affichaient donc un intitulé « DOMAINES » au-dessus du vide.
     * Le pied est le même partout : il doit se remplir partout, donc ici.
     *
     * Le lien ne pouvait pas marcher ailleurs non plus : il pointait sur
     * « #catalogue », un fragment qui n'existe que sur l'accueil. Il porte
     * maintenant une vraie adresse, et le domaine en paramètre. Sur l'accueil,
     * landing.js intercepte le clic et filtre sur place sans recharger.
     */
    function renderDomainesPied() {
        const pied = document.getElementById('pied-domaines-liens');
        if (!pied) return;
        const colonne = pied.closest('.site-footer__col');

        const noms = [];
        for (const formation of FORMATIONS) {
            if (!formation || !formation.family || formation.active === false) continue;
            if (noms.indexOf(formation.family) < 0) noms.push(formation.family);
        }

        /* Un intitulé au-dessus du vide, c'est le défaut qu'on corrige : sans
           domaine à annoncer, la colonne disparaît. `hidden` ne suffirait pas,
           la feuille de style pose « display: flex » sur cette colonne. */
        if (colonne) colonne.style.display = noms.length ? '' : 'none';
        if (!noms.length) { pied.innerHTML = ''; return; }

        pied.innerHTML = noms.map(nom =>
            `<a href="/?domaine=${encodeURIComponent(nom)}#catalogue" data-domain-link="${escapeHtml(nom)}">${escapeHtml(nom)}</a>`
        ).join('');
    }

    function lienSur(url) {
        const brut = String(url === null || url === undefined ? '' : url);
        /* Les blancs et les caractères de contrôle sont IGNORÉS par le navigateur
           quand il lit un schéma : un saut de ligne glissé au milieu de
           « javascript: » ne l'empêche pas de s'exécuter. On les retire donc
           avant d'examiner la valeur, sinon le filtre se contourne d'un retour
           chariot. Comparaison par code, sans expression régulière : les
           caractères visés ne s'écrivent pas lisiblement dans un motif. */
        const nu = brut.split('').filter(function (c) {
            const code = c.charCodeAt(0);
            return code > 32 && code !== 160 && code !== 8232 && code !== 8233;
        }).join('');
        if (!nu) return '';

        // Une ancre, ou un chemin de CE site.
        if (nu.charAt(0) === '#') return brut.trim();
        /* « //ailleurs » est refusé : sans schéma, il emmène quand même sur un
           autre site, en héritant du protocole de la page. */
        if (nu.charAt(0) === '/' && nu.charAt(1) !== '/') return brut.trim();
        if (nu.slice(0, 2) === './' || nu.slice(0, 3) === '../') return brut.trim();

        // Ou une adresse explicite, et seulement en http(s).
        const bas = nu.toLowerCase();
        if (bas.indexOf('http://') === 0 || bas.indexOf('https://') === 0) return brut.trim();

        return '';
    }

    function findFormation(key) {
        if (!key) return null;
        return FORMATIONS.find(item => item.formId === key || item.slug === key || item.id === key) || null;
    }

    /* ---------- Places réellement disponibles ----------
       Le site est statique : il ne peut pas se réécrire. Le nombre d'inscrits
       vit dans la feuille Google, seule source qui le connaisse. On l'interroge
       au chargement et on en déduit les places restantes. Tant que la réponse
       n'est pas là (ou si l'appel échoue), les valeurs de formations-data.js
       servent de repli : aucune page ne dépend de cet appel pour s'afficher. */
    const ENDPOINTS = window.SITE_ENDPOINTS || {};
    const CACHE_PLACES = 'impactali_places';
    const DUREE_CACHE = 60000; // 1 minute : assez pour éviter un appel par page, assez court pour rester juste

    /* MÉMOIRE D'APPARENCE — l'adresse réellement posée sur chaque visuel.
     *
     * Un script placé dans l'en-tête des pages la rejoue AVANT le premier
     * affichage. Sans elle, le navigateur peignait la photo inscrite dans le
     * fichier HTML — celle d'hier — puis la remplaçait une fois la feuille
     * Google interrogée : on voyait l'ancienne bannière pendant tout
     * l'aller-retour, plusieurs secondes quand le cache avait expiré.
     *
     * Elle est GLOBALE au site et non propre à une page : la feuille donne la
     * même photo au même emplacement partout, et l'accueil prépare ainsi les
     * fiches qu'on n'a pas encore ouvertes. Elle va dans localStorage et non
     * dans sessionStorage, sinon elle serait perdue en fermant l'onglet —
     * c'est-à-dire précisément entre deux visites. */
    const CLE_APPARENCE = 'impactali_apparence';

    /**
     * Retient l'apparence posée, et OUBLIE ce qui ne l'est plus.
     *
     * La fusion seule ne supprimait jamais rien : une photo retirée depuis le
     * tableau de bord restait mémorisée, le bloc d'en-tête reposait son adresse
     * à chaque visite, et comme le fichier Drive part à la corbeille en même
     * temps, le visiteur déjà venu voyait « Visuel indisponible » là où le site
     * devait revenir à sa photo d'origine.
     *
     * On n'oublie que les clés PRÉSENTES SUR CETTE PAGE (`clesVues`) : la
     * mémoire est globale au site, et l'accueil prépare des emplacements de
     * fiches qu'on n'a pas encore ouvertes.
     */
    function memoriserApparence(images, clesVues) {
        if (!images) return;
        try {
            const avant = JSON.parse(localStorage.getItem(CLE_APPARENCE) || '{}');
            const fusion = Object.assign({}, avant && avant.images);
            (clesVues || []).forEach(cle => { delete fusion[cle]; });
            Object.assign(fusion, images);
            localStorage.setItem(CLE_APPARENCE, JSON.stringify({ images: fusion }));
        } catch (e) { /* stockage plein ou refusé : le site s'affiche sans */ }
    }
    const placesEnDirect = new Map();

    /** Applique les places restantes connues à une session (sans toucher à l'objet d'origine, figé). */
    function avecPlacesEnDirect(session) {
        if (!placesEnDirect.has(session.id)) return session;
        return Object.assign({}, session, { placesAvailable: placesEnDirect.get(session.id) });
    }

    /**
     * Sessions à venir (date de début non dépassée), triées par date.
     * Une session qui déclare un pays n'est proposée que dans ce pays : annoncer
     * à un Comorien une session qui se tient à Djibouti serait un faux espoir.
     * Une session sans pays reste visible partout (comportement d'origine).
     */
    function upcomingSessions() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pays = paysActif();
        return SESSIONS
            .filter(session => session.startDate && new Date(`${session.startDate}T23:59:59`) >= today)
            .filter(session => !pays || sessionOuverteAu(session, pays.code))
            /* Masquer une formation doit tout retirer, calendrier compris : ses
               dates continuaient sinon d'être annoncées sur l'accueil. On ne
               masque que ce qu'on sait masqué — une session orpheline reste
               visible plutôt que de disparaître sans explication. */
            .filter(session => {
                const f = FORMATIONS.find(x => x.formId === session.formId);
                return !f || f.active !== false;
            })
            .map(avecPlacesEnDirect)
            .sort((a, b) => a.startDate.localeCompare(b.startDate));
    }

    /**
     * Traduit un relevé { sessionId: nombre d'inscrits } en places restantes.
     *
     * UNE SEULE SOURCE : le total moins les inscrits. La colonne
     * `placesAvailable` de la feuille n'est qu'une trace de ce calcul, que le
     * tableau de bord réécrit à chaque enregistrement.
     *
     * Le relevé ne nomme que les sessions ayant AU MOINS UN inscrit : une
     * session neuve en est absente, et `Number(undefined)` donnait NaN, ce qui
     * faisait passer la boucle son chemin. La session gardait alors le chiffre
     * écrit dans la feuille, jusqu'à la première inscription — où il sautait
     * d'un coup à sa vraie valeur. Absent du relevé veut dire zéro inscrit.
     *
     * Une valeur absurde (négative, non numérique) est ignorée plutôt que
     * d'afficher un faux chiffre. Une session sans total, elle, ne peut rien
     * déduire : on n'y touche pas.
     */
    function appliquerReleve(releve) {
        const table = releve && typeof releve === 'object' ? (releve.sessions || releve) : null;
        if (!table) return false;
        let change = false;
        for (const session of SESSIONS) {
            if (typeof session.placesTotal !== 'number') continue;
            const brut = table[session.id];
            const inscrits = (brut === undefined || brut === null || brut === '') ? 0 : Number(brut);
            if (!Number.isFinite(inscrits) || inscrits < 0) continue;
            const restantes = Math.max(0, session.placesTotal - inscrits);
            if (placesEnDirect.get(session.id) !== restantes) {
                placesEnDirect.set(session.id, restantes);
                change = true;
            }
        }
        if (change) document.dispatchEvent(new CustomEvent('impactali:places'));
        return change;
    }

    /** Repli quand la lecture directe est bloquée par la politique d'origine du navigateur. */
    function releveParScript(cible) {
        return new Promise((resolve, reject) => {
            const nom = 'impactaliPlaces' + Math.random().toString(36).slice(2);
            const balise = document.createElement('script');
            const nettoyer = () => { delete window[nom]; balise.remove(); window.clearTimeout(minuteur); };
            const minuteur = window.setTimeout(() => { nettoyer(); reject(new Error('délai dépassé')); }, 8000);
            window[nom] = donnees => { nettoyer(); resolve(donnees); };
            balise.onerror = () => { nettoyer(); reject(new Error('script inaccessible')); };
            balise.src = `${cible}&callback=${nom}`;
            document.head.appendChild(balise);
        });
    }

    /**
     * Remplace le catalogue affiché par celui tenu à jour dans le tableau de bord.
     * Un catalogue vide est IGNORÉ : tant que rien n'a été importé côté
     * administration, le site continue d'afficher les données de son fichier.
     * Sans cette garde, une base encore vide effacerait tout le catalogue publié.
     */
    function appliquerCatalogue(donnees) {
        if (!donnees || !Array.isArray(donnees.formations) || !donnees.formations.length) return false;

        FORMATIONS = donnees.formations.map(formation => Object.assign({}, formation, {
            image: normaliserImage(formation.image, 760),
            poster: normaliserImage(formation.poster, 1200)
        }));
        SESSIONS = Array.isArray(donnees.sessions) ? donnees.sessions : [];
        window.FORMATIONS = FORMATIONS;
        window.SESSIONS = SESSIONS;
        /* Un catalogue sans pays laisse ceux du fichier en place : sans cette
           garde, une base pas encore alimentée effacerait devises, indicatifs et
           coordonnées de paiement, et le formulaire n'aurait plus rien à afficher. */
        if (Array.isArray(donnees.pays) && donnees.pays.length) {
            PAYS = donnees.pays.map(pays => {
                const duFichier = PAYS_FICHIER.find(p =>
                    String(p.code).toUpperCase() === String(pays.code).toUpperCase());
                if (!duFichier) return pays;
                // Repères techniques : ceux de la feuille s'ils existent, ceux du fichier sinon
                const garder = (valeur, repli) =>
                    (Array.isArray(valeur) && valeur.length) ? valeur : (repli || []);
                return Object.assign({}, pays, {
                    fuseaux: garder(pays.fuseaux, duFichier.fuseaux),
                    regions: garder(pays.regions, duFichier.regions)
                });
            });
            window.PAYS = PAYS;
        }
        // Même garde pour les réalisations : une base vide n'efface pas l'accueil
        if (Array.isArray(donnees.portfolio) && donnees.portfolio.length) {
            window.PORTFOLIO = donnees.portfolio.map(item => Object.assign({}, item, {
                image: normaliserImage(item.image, 900)
            }));
        }
        if (donnees.reglages && Object.keys(donnees.reglages).length) {
            CONTACT = Object.assign({}, CONTACT, donnees.reglages);
            window.SITE_CONTACT = CONTACT;
        }
        placesEnDirect.clear();

        /* L'annonce est DIFFÉRÉE d'un tour de boucle, et ce détail décide si une
           modification du tableau de bord se voit ou non.
         *
         * `refreshPlaces` applique le catalogue SYNCHRONEMENT quand le cache de
         * session est encore chaud, et il le fait depuis le gestionnaire
         * DOMContentLoaded de ce fichier. Or site-common.js est chargé avant
         * script.js : la fiche n'a pas encore posé son écouteur, et l'annonce
         * partait dans le vide. Au premier chargement le cache est froid, la
         * réponse arrive du réseau, tout fonctionne ; au rechargement suivant,
         * dans la minute, la fiche gardait le tarif d'avant.
         *
         * Concrètement : un tarif comorien saisi dans le tableau de bord
         * s'affichait « À confirmer » à tout visiteur revenu sur la page.
         * Les données, elles, sont bien posées tout de suite — seul l'avis
         * attend que tous les gestionnaires du chargement soient en place. */
        window.setTimeout(() => {
            document.dispatchEvent(new CustomEvent('impactali:catalogue'));
        }, 0);
        return true;
    }

    /* ---------- Visuels hébergés sur Google Drive ----------
       Une seule forme d'adresse s'affiche dans une balise <img> venant d'un
       autre domaine. Les anciennes formes « uc?export=view » sont refusées par
       Google depuis 2024 dès que la requête provient d'un autre site — alors
       qu'elles s'ouvrent normalement dans la barre d'adresse, ce qui rend la
       panne invisible à qui les vérifie ainsi.

       Toute adresse Drive est donc ramenée ici à la forme qui fonctionne, avec
       la largeur utile : si Google change encore de règle, une seule fonction
       est à reprendre. */
    function normaliserImage(url, largeur) {
        const texte = String(url || '').trim();
        if (!texte || !/drive\.google|googleusercontent/.test(texte)) return url;
        const id = identifiantDrive(texte);
        if (!id) return url;
        return `https://lh3.googleusercontent.com/d/${id}=w${largeur || 1200}-rw`;
    }

    /* Largeur réellement utile à un emplacement, arrondie par paliers.
     *
     * Toutes les photos étaient demandées en 1400 px de large, quel que soit
     * l'endroit : mesuré sur le site publié, le visuel de la méthode s'affiche
     * 385 px et pesait 137 Ko, la bannière s'affiche 486 px et pesait 50 Ko.
     * Google sait servir la taille qu'on lui demande — encore faut-il la lui
     * demander.
     *
     * LES PALIERS COMPTENT : sans eux, chaque largeur de fenêtre produirait
     * une adresse différente, et ni le cache du navigateur ni celui de Google
     * ne serviraient jamais deux fois la même image. */
    const PALIERS_LARGEUR = [400, 600, 800, 1000, 1400];

    function largeurUtile(el) {
        const affichee = el.clientWidth || el.getBoundingClientRect().width || 0;
        /* Pas encore mis en page : on ne devine pas, on prend le maximum.
           Une photo trop petite s'afficherait floue, ce qui est pire que
           lente. */
        if (!affichee) return PALIERS_LARGEUR[PALIERS_LARGEUR.length - 1];
        const besoin = affichee * (window.devicePixelRatio || 1);
        return PALIERS_LARGEUR.find(p => p >= besoin)
            || PALIERS_LARGEUR[PALIERS_LARGEUR.length - 1];
    }

    function identifiantDrive(url) {
        const t = String(url || '');
        const m = t.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]{20,})/)
            || t.match(/[?&]id=([A-Za-z0-9_-]{20,})/)
            || t.match(/\/d\/([A-Za-z0-9_-]{20,})/);
        return m ? m[1] : null;
    }

    /**
     * Repli d'affichage. L'événement `error` d'une image ne remonte pas :
     * on l'écoute donc en phase de capture, une fois pour tout le document,
     * ce qui couvre aussi les cartes créées en JavaScript.
     */
    function initReplisImages() {
        document.addEventListener('error', event => {
            const img = event.target;
            if (!img || img.tagName !== 'IMG' || img.dataset.repli === 'fini') return;
            const id = identifiantDrive(img.src);
            if (!id) return;

            if (!img.dataset.repli) {
                // Passe par le redirecteur de Drive, plus lent mais parfois plus tolérant
                img.dataset.repli = 'thumbnail';
                img.src = `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
                return;
            }
            // Toujours rien : on cesse d'essayer plutôt que de boucler
            img.dataset.repli = 'fini';
            img.removeAttribute('src');
            img.alt = img.alt || 'Visuel indisponible';
        }, true);
    }

    /**
     * Applique les textes modifiés depuis le tableau de bord.
     * Chaque élément porteur de `data-texte` est repérable par sa clé ; si aucune
     * valeur n'a été enregistrée, le texte écrit dans le HTML reste affiché.
     * C'est ce qui permet d'annuler une modification en vidant simplement le champ.
     */
    /* Le texte propre d'un élément, sans celui de ses enfants. Un libellé porte
       parfois un enfant — le chevron d'un accordéon, « expand_more » — qui
       compterait sinon dans le texte. */
    const texteSeul = el => Array.from(el.childNodes)
        .filter(n => n.nodeType === 3).map(n => n.nodeValue).join('');

    /**
     * Remplace le texte d'un élément SANS toucher à ses enfants.
     *
     * `textContent = valeur` les supprimerait : modifier une question de la FAQ
     * depuis le tableau de bord faisait disparaître le chevron de l'accordéon,
     * définitivement, puisque le remplacement est réappliqué à chaque visite.
     */
    function poserTexte(el, valeur) {
        const elements = Array.from(el.childNodes).filter(n => n.nodeType === 1);
        if (!elements.length) { el.textContent = valeur; return; }
        Array.from(el.childNodes).filter(n => n.nodeType === 3).forEach(n => n.remove());
        el.insertBefore(document.createTextNode(valeur), el.firstChild);
    }

    function appliquerTextes(textes) {
        if (!textes || typeof textes !== 'object') return false;
        let change = false;

        document.querySelectorAll('[data-texte]').forEach(el => {
            const valeur = textes[el.dataset.texte];
            if (typeof valeur !== 'string' || !valeur.trim()) return;
            if (texteSeul(el).trim() === valeur.trim()) return;
            poserTexte(el, valeur);
            change = true;
        });

        document.querySelectorAll('[data-texte-html]').forEach(el => {
            const valeur = textes[el.dataset.texteHtml];
            if (typeof valeur !== 'string' || !valeur.trim()) return;
            const propre = assainir(valeur);
            if (el.innerHTML === propre) return;
            el.innerHTML = propre;
            change = true;
        });

        return change;
    }

    /**
     * Traduit un cadrage de visuel en propriétés de style, ou rend null.
     *
     * POURQUOI null plutôt qu'un objet neutre : la feuille de style met en scène
     * chaque emplacement pour la photo livrée avec le design — la bannière est
     * décalée et agrandie, la section méthode cadre ses visuels au rang. Rendre
     * un cadrage « par défaut » écraserait cette mise en scène sur des images
     * que personne n'a remplacées, et les abîmerait toutes d'un coup. Seul le
     * null dit à l'appelant de ne RIEN poser.
     *
     * POURQUOI les bornes sont refaites ici : le script Google borne déjà à
     * l'écriture, mais la feuille Google se modifie à la main et le catalogue est
     * servi tel quel. Une position hors de 0–100 sortirait la photo de son cadre,
     * un zoom au-delà de 250 n'en laisserait qu'un détail méconnaissable.
     *
     * POURQUOI un zoom de 100 ne pose AUCUNE transformation : « scale(1) » n'est
     * pas neutre — une transformation crée un contexte d'empilement et fait
     * repasser l'image par la composition, ce qui peut en adoucir le rendu.
     *
     * POURQUOI le centre comme origine : la feuille de style ancre chaque
     * agrandissement sur un point CHOISI pour la photo d'origine (18% 60% sur la
     * bannière, 20% 58% ailleurs) — le visage, une ligne de force. Le zoom réglé
     * depuis le tableau de bord porte sur une AUTRE image, dont on ne sait rien
     * ici : reprendre l'ancien point de fuite agrandirait la nouvelle photo vers
     * un endroit qui n'a plus de sens. Le centre est le seul ancrage défendable
     * sans connaître le sujet, et c'est celui que la position x/y déplace.
     */
    function cadrageEnStyle(cadrage) {
        if (!cadrage || typeof cadrage !== 'object') return null;

        /* null et la chaîne vide sont écartés AVANT toute conversion :
           Number(null) vaut zéro, et une mesure absente passerait pour une photo
           collée en haut à gauche. */
        const borner = (valeur, mini, maxi) => {
            if (valeur === '' || valeur === null || valeur === undefined) return null;
            const n = Number(valeur);
            if (!isFinite(n)) return null;
            return Math.round(Math.min(maxi, Math.max(mini, n)));
        };

        const x = borner(cadrage.x, 0, 100);
        const y = borner(cadrage.y, 0, 100);
        const zoom = borner(cadrage.zoom, 100, 250);
        /* Un cadrage partiel est rejeté EN ENTIER : garder ce qui se lit
           déplacerait la photo sur un axe et pas sur l'autre, sans qu'aucun
           écran ne dise pourquoi. */
        if (x === null || y === null || zoom === null) return null;

        return {
            objectPosition: `${x}% ${y}%`,
            transform: zoom === 100 ? 'none' : `scale(${zoom / 100})`,
            transformOrigin: 'center'
        };
    }

    /**
     * Applique les visuels remplacés depuis le tableau de bord.
     * Même principe que les textes : chaque image remplaçable porte `data-image`
     * dans le HTML, et une valeur absente laisse le visuel d'origine en place.
     * C'est ainsi qu'on annule un remplacement — en vidant simplement le champ.
     *
     * Le cadrage accompagne l'adresse et ne vaut que pour une image
     * EFFECTIVEMENT remplacée : sans remplacement, la mise en scène d'origine
     * reste intacte.
     */
    function appliquerImages(images, cadrages) {
        if (!images || typeof images !== 'object') return false;
        /* Un script Google encore dans sa version précédente ne renvoie aucun
           cadrage : les visuels doivent continuer de s'afficher sans lui. */
        cadrages = cadrages && typeof cadrages === 'object' ? cadrages : {};
        let change = false;
        const apparence = {};
        /* Les clés PRÉSENTES sur cette page : ce sont les seules que la mémoire
           d’apparence peut légitimement oublier. */
        const clesVues = [];

        document.querySelectorAll('[data-image]').forEach(el => {
            /* Un emplacement peut désigner un REPLI : la photo du formateur est
               propre à chaque fiche, mais toutes retombent sur une photo commune
               tant qu'on ne leur en a pas donné une. On pose ainsi une photo
               valable partout, puis on n'en surcharge qu'une si besoin — sans
               avoir à la renvoyer six fois. */
            const cle = el.dataset.image;
            const repli = el.dataset.imageRepli;
            clesVues.push(cle);
            /* L'ADRESSE D'ORIGINE, celle écrite dans le fichier HTML, est
               retenue avant le premier remplacement : c'est elle qu'il faudra
               rendre le jour où la photo sera retirée. Le bloc d'en-tête la
               retient aussi de son côté, puisqu'il remplace avant nous. */
            if (!el.hasAttribute('data-image-origine')) {
                el.setAttribute('data-image-origine', el.getAttribute('src') || '');
            }
            const propre = images[cle];
            const valeur = (typeof propre === 'string' && propre.trim())
                ? propre
                : (repli && repli !== cle ? images[repli] : undefined);
            if (typeof valeur !== 'string' || !valeur.trim()) {
                /* PLUS AUCUNE VALEUR : la photo a été retirée du tableau de
                   bord, ou son champ vidé. On rend celle du fichier et on
                   retire le cadrage — puis on laisse la clé sortir de la
                   mémoire d'apparence, faute de quoi le bloc d'en-tête
                   reposerait une adresse que plus personne ne sert. */
                const origine = el.getAttribute('data-image-origine') || '';
                if (origine && el.getAttribute('src') !== origine) {
                    el.setAttribute('src', origine);
                    change = true;
                }
                if (el.style.getPropertyValue('--cadrage')
                    || el.style.getPropertyValue('--cadrage-origine')
                    || el.style.objectPosition) {
                    el.style.removeProperty('--cadrage');
                    el.style.removeProperty('--cadrage-origine');
                    el.style.objectPosition = '';
                    change = true;
                }
                return;
            }
            const adresse = normaliserImage(valeur.trim(), largeurUtile(el));

            /* Le cadrage est posé AVANT le retour anticipé ci-dessous : celui-ci
               sort quand l'adresse n'a pas changé, et une photo dont seul le
               réglage a bougé ne serait alors jamais recadrée. */
            /* Le cadrage suit la photo : une fiche qui reprend la photo commune
               doit reprendre le cadrage réglé pour elle, sinon la même image
               s'afficherait cadrée ici et pas là. */
            const cadreCle = (typeof propre === 'string' && propre.trim()) ? cle : (repli || cle);
            const style = cadrageEnStyle(cadrages[cadreCle]);

            /* On retient l'apparence AVANT les retours anticipés qui suivent :
               ceux-ci sortent quand rien n'a changé, et une photo déjà en place
               ne serait alors jamais retenue — donc jamais rejouée au
               chargement suivant, et le clignotement reviendrait. */
            /* Normalisé UNE SEULE FOIS, ici : la mémoire d'apparence et la pose
               ci-dessous doivent écrire exactement la même valeur, sinon le
               bloc d'en-tête poserait au chargement suivant un cadrage
               différent de celui que le site vient de calculer. */
            const cadrageVoulu = style
                ? (style.transform === 'none' ? 'scale(1)' : style.transform) : '';
            const origineVoulue = style ? style.transformOrigin : '';
            const positionVoulue = style ? style.objectPosition : '';

            apparence[cle] = {
                src: adresse,
                /* Le bloc d'en-tête précharge les visuels retenus. Il ne doit
                   précharger QUE ceux qui s'affichent d'emblée : la page
                   diffère volontairement les autres, et les précharger tous
                   ramenait 222 Ko au premier chargement là où 50 suffisent —
                   la photo de la méthode pèse à elle seule 137 Ko et se
                   trouve loin sous la ligne de flottaison. */
                differee: el.loading === 'lazy',
                objectPosition: positionVoulue,
                transform: cadrageVoulu,
                transformOrigin: origineVoulue
            };
            /* LE CADRAGE PASSE PAR DES VARIABLES, PAS PAR `transform` EN LIGNE.
             *
             * Une déclaration en ligne l'emporte sur toute la feuille de style,
             * y compris sur `.method-step:hover img { transform: scale(1.02) }`.
             * La carte dont on venait de remplacer la photo perdait donc son
             * agrandissement au survol, quand ses deux voisines le gardaient.
             * Et le cas le plus fréquent était le pire : un cadrage neutre
             * posait `transform: none`, qui ne change rien à l'œil et tuait
             * l'animation pour rien.
             *
             * La feuille de style compose désormais les deux elle-même :
             *     transform: var(--cadrage, scale(1)) scale(1.02);
             *
             * LA VALEUR DE REPLI N'EST JAMAIS `none` : « none scale(1.02) »
             * n'est pas du CSS valide, et toute la déclaration serait rejetée.
             * On écrit donc l'identité `scale(1)`, qui se compose sans effet.
             *
             * `object-position` reste EN LIGNE : il n'est pas animé, et la
             * feuille cadre certains visuels AU RANG
             * (.method-step:nth-child(2) img) — un sélecteur au rang
             * l'emporterait sur une classe, et la photo remplacée garderait le
             * cadrage taillé pour celle d'origine. */
            if (el.style.getPropertyValue('--cadrage') !== cadrageVoulu
                || el.style.getPropertyValue('--cadrage-origine') !== origineVoulue
                || el.style.objectPosition !== positionVoulue) {
                /* RETIRER un cadrage doit le retirer POUR DE BON. refreshPlaces
                   applique deux fois dans la même page : le cache d'abord, le
                   réseau ensuite. Un cadrage présent au cache et absent du
                   réseau — une cellule vidée à la main — resterait collé
                   jusqu'au prochain rechargement. Une valeur vide retire donc
                   la déclaration et rend la main à la feuille de style, qui
                   remet le visuel dans sa mise en scène d'origine. */
                const poser = (nom, valeur) => {
                    if (valeur) el.style.setProperty(nom, valeur);
                    else el.style.removeProperty(nom);
                };
                poser('--cadrage', cadrageVoulu);
                poser('--cadrage-origine', origineVoulue);
                el.style.objectPosition = positionVoulue;
                change = true;
            }

            if (el.getAttribute('src') === adresse) return;
            el.setAttribute('src', adresse);
            /* Les dimensions d'origine décrivaient l'ancienne image : les garder
               réserverait une place au mauvais rapport, et la nouvelle photo
               s'afficherait déformée le temps de son chargement. */
            el.removeAttribute('width');
            el.removeAttribute('height');
            change = true;
        });

        memoriserApparence(apparence, clesVues);
        return change;
    }

    /**
     * Ces textes-ci acceptent une mise en valeur, d'où l'insertion en HTML.
     * On n'y tolère qu'une poignée de balises et aucun attribut : même écrit
     * depuis l'administration, un contenu ne doit pas pouvoir exécuter de script.
     */
    function assainir(html) {
        const BALISES = ['SPAN', 'STRONG', 'EM', 'B', 'I', 'BR', 'SMALL'];
        const SUPPRIMER = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META'];

        /* DOMParser produit un document INERTE. Passer par innerHTML sur un
           élément détaché ne suffirait pas : le navigateur y charge quand même
           les images, donc un « onerror » s'exécuterait avant tout nettoyage. */
        const doc = new DOMParser().parseFromString('<div id="racine"></div>', 'text/html');
        const racine = doc.getElementById('racine');
        racine.innerHTML = html;

        /* Les icônes sont des LIGATURES : c'est la police qui transforme le mot
           « check_circle » en dessin, et seule cette classe la déclenche. En
           retirant tous les attributs, on affichait le mot en toutes lettres —
           dans l'avis des mentions légales et les quatre prérequis d'une fiche.
           On garde donc cette classe, et l'attribut qui évite aux lecteurs
           d'écran d'épeler la ligature. Tout le reste part : style, événements,
           adresses. */
        const CLASSES_SURES = ['material-symbols-outlined'];

        racine.querySelectorAll('*').forEach(el => {
            if (SUPPRIMER.includes(el.tagName)) { el.remove(); return; }
            if (!BALISES.includes(el.tagName)) { el.replaceWith(...el.childNodes); return; }
            const classes = (el.getAttribute('class') || '').split(/\s+/)
                .filter(c => CLASSES_SURES.includes(c));
            Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
            if (classes.length) {
                el.setAttribute('class', classes.join(' '));
                el.setAttribute('aria-hidden', 'true');
            }
        });
        return racine.innerHTML;
    }

    /**
     * Interroge l'API : catalogue à jour et nombre d'inscrits par session.
     * Un seul appel sert les deux, pour ne pas doubler l'attente au chargement.
     * @param {boolean} force ignore le cache (après une inscription, par exemple)
     */
    function refreshPlaces(force) {
        const url = ENDPOINTS.registration;
        if (!url) return Promise.resolve(false);

        const appliquer = donnees => {
            // Les textes sont indépendants du catalogue : ils s'appliquent même
            // si aucune formation n'a encore été importée.
            const textesChanges = appliquerTextes(donnees && donnees.textes);
            const imagesChangees = appliquerImages(donnees && donnees.images, donnees && donnees.cadrages);
            const catalogueChange = appliquerCatalogue(donnees);
            const placesChangees = appliquerReleve(donnees && donnees.places ? donnees.places : donnees);
            return textesChanges || imagesChangees || catalogueChange || placesChangees;
        };

        if (!force) {
            try {
                /* localStorage et non sessionStorage : ce dernier meurt avec
                   l'onglet, donc précisément entre deux visites — le cache ne
                   servait qu'à l'intérieur d'une même session de navigation. */
                const cache = JSON.parse(localStorage.getItem(CACHE_PLACES) || 'null');
                /* Le tableau de bord pose cet horodatage à chaque enregistrement.
                   Un cache antérieur est périmé, si récent soit-il : sans cela,
                   on modifie une valeur, on actualise le site, et l'ancienne
                   revient pendant une minute. */
                let modifieLe = 0;
                try { modifieLe = Number(localStorage.getItem('impactali_maj')) || 0; } catch (e) { }
                if (cache && cache.horodatage > modifieLe) {
                    /* AFFICHER D'ABORD, VÉRIFIER ENSUITE. Le relevé retenu est
                       posé tout de suite, même s'il a passé sa minute : il vaut
                       toujours mieux que les valeurs du fichier, qui datent du
                       dernier déploiement. Auparavant, un cache expiré était
                       purement ignoré, et la page affichait ses valeurs
                       d'origine pendant tout l'aller-retour vers Google.
                       On n'abrège la suite que si le relevé est encore frais ;
                       sinon on l'affiche ET on interroge quand même la feuille,
                       qui corrigera en silence ce qui a bougé. */
                    const pose = appliquer(cache.releve);
                    if (Date.now() - cache.horodatage < DUREE_CACHE) return Promise.resolve(pose);
                }
            } catch (e) { /* cache illisible : on interroge */ }
        }

        const interroger = action => {
            const cible = `${url}${url.includes('?') ? '&' : '?'}action=${action}`;
            return fetch(cible, { method: 'GET' })
                .then(reponse => (reponse.ok ? reponse.json() : Promise.reject(new Error('HTTP ' + reponse.status))))
                .catch(() => releveParScript(cible));
        };

        return interroger('catalogue')
            .then(donnees => {
                /* Un script Google encore dans sa version précédente ne connaît que
                   `places` : on y revient plutôt que de perdre le compteur pendant
                   l'intervalle entre la publication du site et sa mise à jour. */
                if (donnees && donnees.erreur && !donnees.formations) return interroger('places');
                return donnees;
            })
            .then(donnees => {
                try {
                    localStorage.setItem(CACHE_PLACES, JSON.stringify({ horodatage: Date.now(), releve: donnees }));
                } catch (e) { /* stockage indisponible : sans conséquence */ }
                return appliquer(donnees);
            })
            .catch(() => false); // endpoint absent ou non déployé : on garde les valeurs du fichier
    }

    function nextOpenSession(formId) {
        return upcomingSessions().find(session => session.registrationOpen && session.placesAvailable !== 0 && (!formId || session.formId === formId)) || null;
    }

    /**
     * Numéro WhatsApp joignable : celui du pays du visiteur quand il est
     * renseigné, sinon le contact général du site. Un pays sans numéro propre
     * ne doit pas rendre le site injoignable.
     */
    function numeroWhatsapp() {
        const pays = paysActif();
        const propre = pays && String(pays.whatsappNumber || '').replace(/\D/g, '');
        return propre || String(CONTACT.whatsappNumber || '').replace(/\D/g, '');
    }

    /** Numéro tel qu'on l'écrit dans les pages, mêmes règles de repli. */
    function numeroWhatsappAffiche() {
        const pays = paysActif();
        return (pays && String(pays.whatsappDisplay || '').trim()) || String(CONTACT.whatsappDisplay || '').trim();
    }

    function whatsappUrl(message) {
        return `https://wa.me/${numeroWhatsapp()}?text=${encodeURIComponent(message)}`;
    }

    function formatPrice(price, currency) {
        if (typeof price !== 'number') return 'À confirmer';
        return `${price.toLocaleString('fr-FR')} ${currency || devise()}`.trim();
    }

    /**
     * État d'inscription d'une formation, FORMATION ≠ SESSION :
     *  - 'open'      : une session ouverte existe (ou la formation accepte les inscriptions, dates à annoncer)
     *  - 'full'      : la prochaine session est ouverte mais n'a plus de place
     *  - 'closed'    : une session est annoncée mais les inscriptions ne sont pas ouvertes
     *  - 'none'      : aucune session annoncée
     *  - 'inactive'  : la formation n'est pas publiée
     *  - 'invalid'   : la session demandée n'existe pas pour cette formation
     * @returns {{state: 'open'|'full'|'closed'|'none'|'inactive'|'invalid', session: Session|null}}
     */
    function sessionState(formId, requestedSessionId) {
        const formation = findFormation(formId);
        if (!formation || formation.active === false) return { state: 'inactive', session: null };
        const sessions = upcomingSessions().filter(session => session.formId === (formation?.formId || formId));

        if (requestedSessionId) {
            const requested = sessions.find(session => session.id === requestedSessionId);
            if (!requested) return { state: 'invalid', session: null };
            if (requested.placesAvailable === 0) return { state: 'full', session: requested };
            return { state: requested.registrationOpen ? 'open' : 'closed', session: requested };
        }

        const open = sessions.find(session => session.registrationOpen && session.placesAvailable !== 0);
        if (open) return { state: 'open', session: open };
        const full = sessions.find(session => session.placesAvailable === 0);
        if (full) return { state: 'full', session: full };
        if (sessions.length) return { state: 'closed', session: sessions[0] };
        if (formation.registrationOpen && formation.allowRegistrationWithoutSession) return { state: 'open', session: null };
        return { state: 'none', session: null };
    }

    // ---------- Header ----------
    function initHeader() {
        const header = document.getElementById('site-header');
        const toggle = document.getElementById('menu-toggle');
        const menu = document.getElementById('mobile-menu');

        const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 18);
        updateHeader();
        window.addEventListener('scroll', updateHeader, { passive: true });

        if (!toggle || !menu) return;

        const setOpen = open => {
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
            const icon = toggle.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = open ? 'close' : 'menu';
            menu.hidden = !open;
        };

        toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
        menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !menu.hidden) {
                setOpen(false);
                toggle.focus();
            }
        });
    }

    // ---------- Bannière « prochaine session » (uniquement si une vraie session est ouverte) ----------
    function initSessionBanner() {
        const banner = document.getElementById('session-banner');
        if (!banner) return;

        /* Sur une fiche, c'est LA session de cette formation qui doit s'afficher.
           Le bandeau annonçait la prochaine session du site, toutes formations
           confondues : sur la fiche Community Management, il proposait Canva Pro
           et emmenait le visiteur AILLEURS, au moment précis où il lisait la
           formation qui l'intéressait. Une fiche sans session ouverte retombe
           sur la prochaine du site, qui reste une information utile. */
        const formationDeLaPage = document.querySelector('[data-formation-id]');
        const idDeLaPage = formationDeLaPage ? formationDeLaPage.dataset.formationId : '';
        const session = (idDeLaPage && nextOpenSession(idDeLaPage)) || nextOpenSession();
        if (!session) return;

        const formation = findFormation(session.formId);
        const text = document.getElementById('session-banner-text');
        const dateLabel = formatSessionDate(session.startDate);
        const title = formation ? (formation.shortTitle || formation.title) : '';
        if (text) {
            text.textContent = `PROCHAINE SESSION${title ? ` · ${title.toUpperCase()}` : ''}${dateLabel ? ` · ${dateLabel.toUpperCase()}` : ''} · INSCRIPTIONS OUVERTES`;
        }
        banner.dataset.registerFormation = session.formId;
        banner.dataset.sessionId = session.id;
        if (formation?.hasDetailPage) {
            banner.href = `${formation.href}?trainingId=${encodeURIComponent(formation.formId)}&sessionId=${encodeURIComponent(session.id)}#inscription`;
        }
        banner.classList.remove('hidden');
    }

    /* ---------- Accordéons accessibles (FAQ + programme) ----------
       Appelable après coup : le programme et les questions fréquentes sont
       réécrits quand le catalogue modifié depuis le tableau de bord arrive, et
       les nouveaux dépliants seraient sinon inertes. */
    function initAccordions(root) {
        (root || document).querySelectorAll('.programme-accordion .accordion-header, .faq-item .faq-question').forEach(header => {
            if (header.dataset.accordeon === 'cable') return;
            header.dataset.accordeon = 'cable';
            header.addEventListener('click', () => {
                const item = header.closest('.programme-accordion, .faq-item');
                const body = item.querySelector('.accordion-body, .faq-answer');
                const isOpen = header.getAttribute('aria-expanded') === 'true';
                header.setAttribute('aria-expanded', String(!isOpen));
                item.classList.toggle('accordion-open', !isOpen);
                if (body) {
                    body.classList.toggle('hidden', isOpen);
                    body.hidden = isOpen;
                }
            });
        });
    }

    // ---------- Apparition au scroll ----------
    let revealObserver = null;

    /**
     * Observe les éléments .reveal-on-scroll pas encore révélés.
     * Appelable après coup : le contenu créé en JS (cartes du catalogue) arrive
     * APRÈS le premier passage et doit être observé à son tour, sinon il reste invisible.
     */
    function observeReveals(root) {
        const items = (root || document).querySelectorAll(".reveal-on-scroll:not(.is-visible)");
        if (!items.length) return;

        if (!revealObserver) {
            items.forEach(item => item.classList.add("is-visible"));
            return;
        }

        items.forEach(item => revealObserver.observe(item));
        // Filet de sécurité : rien ne doit rester invisible
        window.setTimeout(() => items.forEach(item => item.classList.add("is-visible")), 4000);
    }

    function initScrollReveals() {
        const animable = "IntersectionObserver" in window &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (animable) {
            revealObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                });
            }, { threshold: 0.01, rootMargin: "0px 0px -24px" });
        }

        observeReveals();
    }

    /* ---------- Liens WhatsApp préremplis, et numéro affiché ----------
       Le numéro écrit en toutes lettres dans les pages suit lui aussi le
       réglage : sans cela, en changer un dans le tableau de bord en laissait
       d'autres périmés sur le site, et un candidat appelait dans le vide. */
    /** Adresse de contact publique du site. */
    function emailContact() {
        return String(CONTACT.contactEmail || '').trim();
    }

    /**
     * Voie de contact publique : l'email, partout sauf à l'inscription.
     *
     * WhatsApp ne paraît plus que dans le parcours d'inscription, où le numéro
     * suit le pays du candidat. Ailleurs — accueil, entreprises, mentions
     * légales, pied de page — on propose l'adresse, une seule pour tout le
     * monde. Elle se change depuis le tableau de bord, comme le reste.
     */
    function initLiensEmail() {
        const adresse = emailContact();
        document.querySelectorAll('[data-email-sujet]').forEach(lien => {
            if (!adresse) { lien.removeAttribute('href'); return; }
            const sujet = lien.dataset.emailSujet;
            lien.href = `mailto:${adresse}` + (sujet ? `?subject=${encodeURIComponent(sujet)}` : '');
        });
        if (adresse) {
            document.querySelectorAll('[data-email-affiche]').forEach(el => { el.textContent = adresse; });
        }
    }

    function initWhatsappLinks() {
        document.querySelectorAll('[data-whatsapp-message]').forEach(link => {
            link.href = whatsappUrl(link.dataset.whatsappMessage);
        });

        const affiche = numeroWhatsappAffiche();
        if (affiche) {
            document.querySelectorAll('[data-whatsapp-affiche]').forEach(el => { el.textContent = affiche; });
        }
        const brut = numeroWhatsapp();
        if (brut) {
            document.querySelectorAll('[data-whatsapp-tel]').forEach(el => { el.href = `tel:+${brut}`; });
        }
    }

    window.SiteCommon = Object.freeze({
        observeReveals,
        initAccordions,
        formatSessionDate,
        escapeHtml,
        findFormation,
        upcomingSessions,
        nextOpenSession,
        whatsappUrl,
        emailContact,
        formatPrice,
        /* Filtre de schema : une adresse venue de la feuille ne doit jamais
           pouvoir devenir un lien qui execute du code au clic. */
        lienSur,
        /* Le tamis à balises des textes du tableau de bord. La fiche s en sert
           pour son accroche, qui accepte une mise en gras : un contenu venu de
           la feuille ne doit pas pouvoir exécuter de script. */
        assainirHtml: assainir,
        /* Mode et lieu se résolvent PAR PAYS : la fiche et le formulaire doivent
           passer par là plutôt que de lire session.mode ou session.location, qui
           ne sont que le repli. */
        modeDeSession,
        lieuDeSession,
        sessionState,
        refreshPlaces,
        paysDisponibles,
        paysParDefaut,
        paysDevine,
        paysActif,
        choisirPays,
        trouverPays,
        numeroWhatsapp,
        numeroWhatsappAffiche,
        devise,
        prixDe,
        formatPrixDe,
        contact: CONTACT,
        endpoints: ENDPOINTS
    });

    document.addEventListener('DOMContentLoaded', () => {
        initHeader();
        initSessionBanner();
        initAccordions();
        initScrollReveals();
        initWhatsappLinks();
        initReplisImages();
        /* Le pied est le même sur toutes les pages : ses domaines s’y remplissent
           donc ici, et non dans landing.js qui ne sert que l’accueil. */
        renderDomainesPied();
        // Les pages s'affichent avec les valeurs du fichier ; le relevé réel arrive ensuite
        // et déclenche « impactali:places », que chaque page écoute pour se corriger.
        refreshPlaces();
    });

    // La bannière annonce une session ouverte : elle doit disparaître si celle-ci se remplit
    document.addEventListener('impactali:places', () => {
        const banner = document.getElementById('session-banner');
        if (!banner || banner.classList.contains('hidden')) return;
        if (!nextOpenSession()) banner.classList.add('hidden');
    });

    /* Changement de pays : les sessions proposées ne sont plus les mêmes, donc
       la bannière non plus. On la reconstruit entièrement plutôt que de la
       masquer, car une session peut aussi APPARAÎTRE en changeant de pays. */
    document.addEventListener('impactali:pays', () => {
        // Le contact joignable change avec le pays : liens et numéros affichés suivent
        initWhatsappLinks();
        initLiensEmail();
        const banner = document.getElementById('session-banner');
        if (!banner) return;
        banner.classList.add('hidden');
        initSessionBanner();
    });

    /* Catalogue modifié depuis le tableau de bord : liens, numéros — ET LA
     * BANNIÈRE.
     *
     * Elle n'était pas reconstruite ici. La page s'affiche d'abord avec les
     * sessions écrites dans formations-data.js, et la bannière annonçait donc
     * une date QUI N'EXISTE QUE DANS CE FICHIER : « CANVA PRO · 5 NOVEMBRE
     * 2026 », alors que la feuille Google portait le 10 octobre. Impossible de
     * la corriger depuis le tableau de bord, puisque cette date ne s'y trouvait
     * nulle part.
     *
     * On la reconstruit ENTIÈREMENT plutôt que de la masquer — comme au
     * changement de pays, et pour la même raison : une session peut aussi
     * APPARAÎTRE quand le catalogue arrive. `initSessionBanner` sort sans rien
     * faire s'il n'y en a aucune, d'où le masquage préalable. */
    document.addEventListener('impactali:catalogue', function () {
        initWhatsappLinks();
        initLiensEmail();
        /* Les domaines du pied sortent des formations : un domaine ajouté ou
           retiré depuis le tableau de bord doit s’y voir sans republier. */
        renderDomainesPied();
        const banner = document.getElementById('session-banner');
        if (!banner) return;
        banner.classList.add('hidden');
        initSessionBanner();
    });

    /**
     * Choix du pays, atteignable depuis n'importe quelle page.
     *
     * Le seul sélecteur du site vivait dans le formulaire d'inscription — donc
     * masqué précisément quand aucune session n'est ouverte, c'est-à-dire au
     * moment où un visiteur mal reconnu n'avait plus aucun recours : il voyait
     * les tarifs et le numéro d'un autre pays sans pouvoir rien y changer.
     * Le pied de page existe sur toutes les pages, y compris les fiches
     * générées : on s'y greffe, sans toucher à neuf fichiers HTML.
     */
    function initChoixPays() {
        const dispo = paysDisponibles();
        const hote = document.querySelector('.site-footer__brand');
        if (!hote) return;

        const ancien = hote.querySelector('.choix-pays');
        // Un seul pays desservi : il n'y a rien à choisir, on n'encombre pas
        if (dispo.length < 2) { if (ancien) ancien.remove(); return; }
        if (ancien) ancien.remove();

        const boite = document.createElement('div');
        boite.className = 'choix-pays';
        boite.innerHTML =
            '<label class="choix-pays__label" for="choix-pays-pied">Votre pays</label>'
            + '<select class="choix-pays__select" id="choix-pays-pied">'
            + dispo.map(p => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.nom)}`
                + (p.devise ? ` (${escapeHtml(p.devise)})` : '') + '</option>').join('')
            + '</select>'
            + '<span class="choix-pays__aide">Les tarifs et le numéro de contact affichés suivent ce choix.</span>';
        hote.appendChild(boite);

        const select = boite.querySelector('select');
        const actif = paysActif();
        if (actif) select.value = actif.code;
        select.addEventListener('change', () => { choisirPays(select.value); });
    }

    /* Le pays peut changer depuis le formulaire d'inscription : le sélecteur du
       pied doit dire la même chose, sinon les deux se contrediraient à l'écran. */
    document.addEventListener('impactali:pays', () => {
        const select = document.getElementById('choix-pays-pied');
        const actif = paysActif();
        if (select && actif && select.value !== actif.code) select.value = actif.code;
    });

    // La liste des pays vient de la feuille : elle peut changer en cours de route
    document.addEventListener('impactali:catalogue', initChoixPays);
    document.addEventListener('DOMContentLoaded', initChoixPays);
})();

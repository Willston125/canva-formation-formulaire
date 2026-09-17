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
        const table = objet.prices;
        if (table && typeof table === 'object') {
            const valeur = table[pays.code];
            if (typeof valeur === 'number' && isFinite(valeur)) return valeur;
            if (Object.prototype.hasOwnProperty.call(table, pays.code)) return null;
        }
        // Une session appartient à un pays : son tarif ne vaut que pour celui-là
        if (objet.pays) return String(objet.pays).toUpperCase() === pays.code && typeof objet.price === 'number' ? objet.price : null;
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

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text === null || text === undefined ? '' : String(text);
        return div.innerHTML;
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
            .filter(session => !session.pays || !pays || String(session.pays).toUpperCase() === pays.code)
            .map(avecPlacesEnDirect)
            .sort((a, b) => a.startDate.localeCompare(b.startDate));
    }

    /**
     * Traduit un relevé { sessionId: nombre d'inscrits } en places restantes.
     * Une valeur absurde (négative, non numérique) est ignorée plutôt que d'afficher un faux chiffre.
     */
    function appliquerReleve(releve) {
        const table = releve && typeof releve === 'object' ? (releve.sessions || releve) : null;
        if (!table) return false;
        let change = false;
        for (const session of SESSIONS) {
            if (typeof session.placesTotal !== 'number') continue;
            const inscrits = Number(table[session.id]);
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
        document.dispatchEvent(new CustomEvent('impactali:catalogue'));
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
    function appliquerTextes(textes) {
        if (!textes || typeof textes !== 'object') return false;
        let change = false;

        document.querySelectorAll('[data-texte]').forEach(el => {
            const valeur = textes[el.dataset.texte];
            if (typeof valeur !== 'string' || !valeur.trim()) return;
            if (el.textContent === valeur) return;
            el.textContent = valeur;
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

        racine.querySelectorAll('*').forEach(el => {
            if (SUPPRIMER.includes(el.tagName)) { el.remove(); return; }
            if (!BALISES.includes(el.tagName)) { el.replaceWith(...el.childNodes); return; }
            Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
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
            const catalogueChange = appliquerCatalogue(donnees);
            const placesChangees = appliquerReleve(donnees && donnees.places ? donnees.places : donnees);
            return textesChanges || catalogueChange || placesChangees;
        };

        if (!force) {
            try {
                const cache = JSON.parse(sessionStorage.getItem(CACHE_PLACES) || 'null');
                if (cache && Date.now() - cache.horodatage < DUREE_CACHE) {
                    return Promise.resolve(appliquer(cache.releve));
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
                    sessionStorage.setItem(CACHE_PLACES, JSON.stringify({ horodatage: Date.now(), releve: donnees }));
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

        const session = nextOpenSession();
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
        formatPrice,
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
        const banner = document.getElementById('session-banner');
        if (!banner) return;
        banner.classList.add('hidden');
        initSessionBanner();
    });

    // Contact modifié depuis le tableau de bord : liens et numéros affichés suivent
    document.addEventListener('impactali:catalogue', initWhatsappLinks);
})();

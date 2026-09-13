/* =========================================
   SITE COMMON — header, bannière session, accordéons, helpers
   Chargé sur toutes les pages, après formations-data.js.
   Aucune logique métier du formulaire ici.
   ========================================= */
(function () {
    'use strict';

    document.documentElement.classList.add('has-js');

    const FORMATIONS = Array.isArray(window.FORMATIONS) ? window.FORMATIONS : [];
    const SESSIONS = Array.isArray(window.SESSIONS) ? window.SESSIONS : [];
    const CONTACT = window.SITE_CONTACT || { whatsappNumber: '25377145306', whatsappDisplay: '+253 77 14 53 06', countryCode: '+253', currency: 'FDJ' };

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

    /** Sessions à venir (date de début non dépassée), triées par date. */
    function upcomingSessions() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return SESSIONS
            .filter(session => session.startDate && new Date(`${session.startDate}T23:59:59`) >= today)
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
     * Interroge la feuille et met à jour les places restantes.
     * @param {boolean} force ignore le cache (après une inscription, par exemple)
     */
    function refreshPlaces(force) {
        const url = ENDPOINTS.registration;
        if (!url) return Promise.resolve(false);

        if (!force) {
            try {
                const cache = JSON.parse(sessionStorage.getItem(CACHE_PLACES) || 'null');
                if (cache && Date.now() - cache.horodatage < DUREE_CACHE) {
                    return Promise.resolve(appliquerReleve(cache.releve));
                }
            } catch (e) { /* cache illisible : on interroge */ }
        }

        const cible = `${url}${url.includes('?') ? '&' : '?'}action=places`;
        return fetch(cible, { method: 'GET' })
            .then(reponse => (reponse.ok ? reponse.json() : Promise.reject(new Error('HTTP ' + reponse.status))))
            .catch(() => releveParScript(cible))
            .then(releve => {
                try {
                    sessionStorage.setItem(CACHE_PLACES, JSON.stringify({ horodatage: Date.now(), releve }));
                } catch (e) { /* stockage indisponible : sans conséquence */ }
                return appliquerReleve(releve);
            })
            .catch(() => false); // endpoint absent ou non déployé : on garde les valeurs du fichier
    }

    function nextOpenSession(formId) {
        return upcomingSessions().find(session => session.registrationOpen && session.placesAvailable !== 0 && (!formId || session.formId === formId)) || null;
    }

    function whatsappUrl(message) {
        return `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(message)}`;
    }

    function formatPrice(price, currency) {
        return typeof price === 'number' ? `${price.toLocaleString('fr-FR')} ${currency || CONTACT.currency || 'FDJ'}` : 'À confirmer';
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

    // ---------- Accordéons accessibles (FAQ + programme) ----------
    function initAccordions() {
        document.querySelectorAll('.programme-accordion .accordion-header, .faq-item .faq-question').forEach(header => {
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

    // ---------- Liens WhatsApp préremplis ----------
    function initWhatsappLinks() {
        document.querySelectorAll('[data-whatsapp-message]').forEach(link => {
            link.href = whatsappUrl(link.dataset.whatsappMessage);
        });
    }

    window.SiteCommon = Object.freeze({
        observeReveals,
        formatSessionDate,
        escapeHtml,
        findFormation,
        upcomingSessions,
        nextOpenSession,
        whatsappUrl,
        formatPrice,
        sessionState,
        refreshPlaces,
        contact: CONTACT,
        endpoints: ENDPOINTS
    });

    document.addEventListener('DOMContentLoaded', () => {
        initHeader();
        initSessionBanner();
        initAccordions();
        initScrollReveals();
        initWhatsappLinks();
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
})();

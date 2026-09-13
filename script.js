/* =========================================
   IMPACTALI — Moteur d'inscription commun à toutes les formations
   Multi-étapes, validation, sauvegarde locale, Google Sheets.
   Chargé sur chaque fiche formation (après formations-data.js et site-common.js).
   La formation de la page est lue sur <main id="inscription" data-formation-id="…"> ;
   l'URL (?trainingId= / ?trainingSlug= / ?formation= / ?sessionId=) peut la préciser.
   Les fonctions d'accueil (header, carrousel, sessions) vivent dans site-common.js / landing.js.
   ========================================= */

(function () {
    'use strict';

    document.documentElement.classList.add('has-js');

    // ====== CONFIG ======
    // Adresse du script Google, centralisée dans formations-data.js (repli : valeur historique)
    const GOOGLE_SHEETS_URL = (window.SITE_ENDPOINTS && window.SITE_ENDPOINTS.registration) ||
        'https://script.google.com/macros/s/AKfycbyJCl1lg58y090bkO0OwovV7o60Oc0eAXPeWFu4AGX2IARG58Mqes7mf7h8BubK5KTavA/exec';
    const TOTAL_STEPS = 4;
    const FORMATIONS = Array.isArray(window.FORMATIONS) ? window.FORMATIONS : [];
    const CONTACT = window.SITE_CONTACT || {};
    const common = window.SiteCommon || null;

    /** Formation portée par la page (jamais une valeur codée en dur). */
    const PAGE_FORMATION_ID = document.getElementById('inscription')?.dataset.formationId || FORMATIONS[0]?.formId || '';

    let selectedFormation = FORMATIONS.find(item => item.formId === PAGE_FORMATION_ID) || FORMATIONS[0] || null;

    /* ---- Stockage local ----
       Brouillon : une seule reprise en cours par formation.
       Inscription validée : par formation ET par session, pour qu'une inscription
       à une formation n'en bloque jamais une autre, ni une autre session. */
    const formIdOf = formation => formation?.formId || PAGE_FORMATION_ID;
    const draftKey = formation => `impactali_registration_draft_${formIdOf(formation)}`;
    const registeredKey = (formation, session) =>
        `impactali_registered_${formIdOf(formation)}${session?.id ? `_${session.id}` : ''}`;

    /**
     * Reprise des clés antérieures au moteur commun (formulaire Canva, puis nommage
     * intermédiaire) : ni brouillon ni statut « déjà inscrit » ne doit être perdu.
     */
    function migrateLegacyStorage() {
        try {
            const canva = FORMATIONS.find(item => item.formId === 'canva-pro');
            if (canva) {
                const draft = localStorage.getItem('canvapro_form_data');
                if (draft && !localStorage.getItem(draftKey(canva))) localStorage.setItem(draftKey(canva), draft);
                if (localStorage.getItem('canvapro_registered_user') === 'true') {
                    localStorage.setItem(registeredKey(canva, null), 'true');
                }
                localStorage.removeItem('canvapro_form_data');
                localStorage.removeItem('canvapro_registered_user');
            }
            // Nommage intermédiaire : impactali.registration.v2.draft|submitted.<formId>.<sessionId|undated>
            for (const cle of Object.keys(localStorage)) {
                const m = cle.match(/^impactali\.registration\.v2\.(draft|submitted)\.([^.]+)\.(.+)$/);
                if (!m) continue;
                const [, type, formId, sessionId] = m;
                const formation = FORMATIONS.find(item => item.formId === formId);
                if (formation) {
                    const cible = type === 'draft'
                        ? draftKey(formation)
                        : registeredKey(formation, sessionId === 'undated' ? null : { id: sessionId });
                    if (!localStorage.getItem(cible)) localStorage.setItem(cible, localStorage.getItem(cle));
                }
                localStorage.removeItem(cle);
            }
        } catch (e) { /* silent */ }
    }

    /* ---- Paramètres dépendant de la session ----
       Devise, indicatif, tarif et moyens de paiement viennent de la session quand elle
       les précise, sinon du contact du site : aucune valeur de marché n'est écrite ici. */
    const activeSession = () => displaySession || selectedSession;
    const currentCurrency = () => activeSession()?.currency || CONTACT.currency;
    const currentCountryCode = () => activeSession()?.countryCode || CONTACT.countryCode || '';
    const currentPrice = () => {
        const session = activeSession();
        return typeof session?.price === 'number' ? session.price : selectedFormation?.price;
    };
    const currentPaymentMethods = () => {
        const session = activeSession();
        return Array.isArray(session?.paymentMethods) && session.paymentMethods.length
            ? session.paymentMethods
            : (Array.isArray(CONTACT.paymentMethods) ? CONTACT.paymentMethods : []);
    };
    const formatPrice = price => (common ? common.formatPrice(price, currentCurrency())
        : (typeof price === 'number' ? `${price.toLocaleString('fr-FR')} ${currentCurrency() || ''}`.trim() : 'À confirmer'));

    /**
     * Format du numéro local : la règle du marché est déclarée dans les données
     * (SITE_CONTACT.phoneLocalPattern). Sans règle, on n'exige que des chiffres.
     */
    function phonePattern() {
        const source = activeSession()?.phoneLocalPattern || CONTACT.phoneLocalPattern;
        try { return source ? new RegExp(source) : /^\d{6,15}$/; } catch (e) { return /^\d{6,15}$/; }
    }
    function phoneFormatHint() {
        return activeSession()?.phoneFormatHint || CONTACT.phoneFormatHint || 'Format invalide : chiffres uniquement';
    }

    /** Formate une date ISO (YYYY-MM-DD) en français, ex. "16 avril 2026". */
    function formatSessionDate(isoDate) {
        if (!isoDate) return '';
        const date = new Date(`${isoDate}T12:00:00`);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // ====== DOM REFS ======
    const form = document.getElementById('inscription-form');
    const sections = document.querySelectorAll('.form-section');
    const successScreen = document.getElementById('success-screen');
    const summaryContent = document.getElementById('summary-content');
    const btnSubmit = document.getElementById('btn-submit');

    // Sidebar (desktop)
    const sidebarSteps = document.querySelectorAll('.sidebar-step');
    const sidebarProgressBar = document.getElementById('sidebar-progress-bar');
    const sidebarCompletionBar = document.getElementById('sidebar-completion-bar');
    const sidebarStepLabel = document.getElementById('sidebar-step-label');
    const sidebarPercent = document.getElementById('sidebar-percent');

    // Mobile progress
    const mobileSteps = document.querySelectorAll('.mobile-step');
    const mobileProgressBar = document.getElementById('mobile-progress-bar');
    const mobileStepLabel = document.getElementById('mobile-step-label');
    const mobilePercent = document.getElementById('mobile-percent');

    // Form top bar
    const formTopBar = document.getElementById('form-top-bar');

    // Payment elements
    const paiementSelect = document.getElementById('paiement');
    const telPaiementGroup = document.getElementById('field-tel-paiement');
    const paymentInfoMobile = document.getElementById('payment-info-mobile');
    const paymentInfoCash = document.getElementById('payment-info-cash');

    // Motivation counter
    const motivationField = document.getElementById('motivation');
    const motivationCounter = document.getElementById('motivation-counter');

    let currentStep = 1;

    // ====== FORMATION & SESSION SÉLECTIONNÉES (page fiche) ======
    const SESSIONS = Array.isArray(window.SESSIONS) ? window.SESSIONS : [];
    /** Session ouverte à l'inscription (alimente le champ caché `sessionId`). */
    let selectedSession = null;
    /** Session à afficher : peut être annoncée ou complète, donc sans inscription possible. */
    let displaySession = null;

    /**
     * Lit les paramètres d'URL transmis par le catalogue / les sessions.
     * Compatibilité : `?formation=` (ancien), `?trainingId=` / `?trainingSlug=` / `?sessionId=` (nouveaux).
     * Sans paramètre, la formation de la page est retenue.
     */
    function initSelectedFormationFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('trainingId') || params.get('trainingSlug') || params.get('formationId') || params.get('formation');
        const requestedFormation = FORMATIONS.find(item => item.formId === requested || item.slug === requested);
        /* Un paramètre absent (null) ou vide ('?sessionId=') vaut « non précisé » :
           on passe `undefined` pour que la prochaine session ouverte soit retenue.
           Sans cela, une URL tronquée inscrirait le candidat sans session. */
        const requestedSessionId = params.get('sessionId') || undefined;
        const pageFormation = FORMATIONS.find(item => item.formId === PAGE_FORMATION_ID || item.slug === PAGE_FORMATION_ID);
        if (requestedFormation && pageFormation && requestedFormation.formId !== pageFormation.formId) {
            console.warn('IMPACTALI : le paramètre de formation ne correspond pas à la fiche affichée. La fiche reste prioritaire.');
        }
        setSelectedFormation((pageFormation || requestedFormation || selectedFormation)?.formId || PAGE_FORMATION_ID, false, requestedSessionId);

        document.addEventListener('click', event => {
            const trigger = event.target.closest('[data-register-formation]');
            if (!trigger) return;
            // `undefined` et non `null` : sans session explicite sur le déclencheur,
            // la prochaine session ouverte doit être retenue, pas effacée.
            setSelectedFormation(trigger.dataset.registerFormation || PAGE_FORMATION_ID, true,
                trigger.dataset.sessionId || undefined);
        });
    }

    function setSelectedFormation(formId, persist = true, sessionId = undefined) {
        const formation = FORMATIONS.find(item => item.formId === formId || item.slug === formId) ||
            FORMATIONS.find(item => item.formId === PAGE_FORMATION_ID);
        if (!formation) return;

        selectedFormation = formation;
        const input = document.getElementById('formation');
        if (input) input.value = formation.formId;

        // Session : une session explicitement demandée n'est jamais remplacée silencieusement.
        const upcoming = common?.upcomingSessions
            ? common.upcomingSessions().filter(item => item.formId === formation.formId)
            : SESSIONS.filter(item => item.formId === formation.formId && item.startDate && new Date(`${item.startDate}T23:59:59`) >= new Date());
        if (sessionId !== undefined) selectedSession = upcoming.find(item => item.id === sessionId) || null;
        else if (!selectedSession || selectedSession.formId !== formation.formId) {
            selectedSession = upcoming.find(item => item.registrationOpen && item.placesAvailable !== 0) || null;
        }
        const sessionInput = document.getElementById('session-id');
        if (sessionInput) sessionInput.value = selectedSession ? selectedSession.id : '';

        /* Session AFFICHÉE : une session annoncée ou complète doit rester visible même
           quand on ne peut pas s'y inscrire (cas 3 et 4). Elle ne vaut jamais inscription :
           seule `selectedSession` alimente le champ caché `sessionId`. */
        const etat = common?.sessionState
            ? common.sessionState(formation.formId, sessionId || selectedSession?.id || undefined)
            : { state: selectedSession ? 'open' : 'none', session: selectedSession };
        displaySession = selectedSession || etat.session || null;

        const title = document.getElementById('selected-training-title');
        const meta = document.getElementById('selected-training-meta');
        const sessionMeta = document.getElementById('selected-session-meta');
        if (title) title.textContent = formation.title;
        if (meta) {
            meta.textContent = [formation.duration, formation.mode].filter(v => v && !/^à confirmer$/i.test(v)).join(' · ')
                || 'Informations pratiques à annoncer';
        }
        if (sessionMeta) {
            sessionMeta.textContent = displaySession
                ? `Session du ${formatSessionDate(displaySession.startDate)}`
                : 'Prochaine session : dates à annoncer';
        }
        renderSelectedSessionFacts();

        renderSessionDetails();
        renderRegistrationState();
        renderPaymentDetails();
        renderConditionsText();
        if (persist) saveData();
    }

    /**
     * Détails de la session directement au-dessus du formulaire : dates, horaires,
     * lieu, mode, tarif. Seules les valeurs réellement connues sont listées.
     */
    function renderSelectedSessionFacts() {
        const liste = document.getElementById('selected-session-facts');
        if (!liste) return;
        const s = displaySession;
        const lignes = [];
        if (s) {
            const dates = s.endDate
                ? `Du ${formatSessionDate(s.startDate)} au ${formatSessionDate(s.endDate)}`
                : `À partir du ${formatSessionDate(s.startDate)}`;
            lignes.push(['event', dates]);
            if (s.schedule) lignes.push(['schedule', s.schedule]);
            if (s.location) lignes.push(['location_on', s.location]);
            if (s.mode) lignes.push(['co_present', s.mode]);
        } else if (selectedFormation?.mode && !/^à confirmer$/i.test(selectedFormation.mode)) {
            lignes.push(['co_present', selectedFormation.mode]);
        }
        const prix = currentPrice();
        if (typeof prix === 'number') lignes.push(['payments', formatPrice(prix)]);

        liste.hidden = !lignes.length;
        liste.innerHTML = lignes.map(([icone, texte]) =>
            `<li><span class="material-symbols-outlined" aria-hidden="true">${icone}</span>${escapeHtml(texte)}</li>`).join('');
    }

    // ====== INFORMATIONS DE SESSION SUR LA FICHE ======
    /** Renseigne, dans l'en-tête de la fiche, les lignes qui dépendent d'une session réelle. */
    function renderSessionDetails() {
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            const row = el.closest('[data-session-fact]') || el;
            if (value) { el.textContent = value; row.hidden = false; }
            else if (row !== el) row.hidden = true;
            else el.textContent = 'Dates à annoncer';
        };
        // Une session annoncée ou complète reste affichée : seule l'inscription est fermée.
        const s = displaySession;
        set('fiche-next-session', s ? [formatSessionDate(s.startDate), s.schedule].filter(Boolean).join(' · ') : '');
        set('fiche-schedule', s?.schedule || '');
        set('fiche-location', s?.location || '');
        const priceEl = document.getElementById('fiche-price');
        if (priceEl) priceEl.textContent = formatPrice(currentPrice());
    }

    /**
     * État d'inscription (formation ≠ session) : ouvert, complet, annoncé, aucune session.
     * Le formulaire n'est présenté que lorsque l'inscription est possible.
     */
    function renderRegistrationState() {
        const card = document.getElementById('registration-state');
        const formContainer = document.getElementById('form-container');
        if (!card || !formContainer || !common) return;
        const requestedSessionId = new URLSearchParams(window.location.search).get('sessionId');
        const { state, session } = common.sessionState(selectedFormation?.formId, requestedSessionId || selectedSession?.id || undefined);
        const isOpen = state === 'open';
        card.hidden = isOpen;
        document.getElementById('sidebar')?.classList.toggle('is-unavailable', !isOpen);
        document.getElementById('mobile-progress')?.classList.toggle('is-unavailable', !isOpen);
        const title = selectedFormation?.title || '';
        updateRegistrationCtas(isOpen, title);
        if (isOpen) {
            formContainer.classList.remove('is-unavailable');
            return;
        }
        formContainer.classList.add('is-unavailable');

        const messages = {
            none: {
                icon: 'event_busy', heading: 'Aucune session annoncée pour le moment',
                text: `Les dates de la prochaine session de « ${title} » ne sont pas encore fixées. Laissez-nous vos coordonnées sur WhatsApp : vous serez prévenu(e) dès l’ouverture des inscriptions.`
            },
            closed: {
                icon: 'event_upcoming', heading: 'Session annoncée · inscriptions bientôt ouvertes',
                text: session ? `Prochaine session le ${formatSessionDate(session.startDate)}${session.schedule ? ` · ${session.schedule}` : ''}. Les inscriptions ne sont pas encore ouvertes : demandez à être prévenu(e).` : ''
            },
            full: {
                icon: 'group_off', heading: 'Session complète',
                text: session ? `La session du ${formatSessionDate(session.startDate)} est complète. Demandez à être prévenu(e) de la prochaine session.` : ''
            },
            invalid: {
                icon: 'error', heading: 'Session introuvable',
                text: 'La session demandée n’existe pas ou n’est plus disponible pour cette formation. Consultez les prochaines sessions ou contactez-nous.'
            },
            inactive: {
                icon: 'block', heading: 'Formation indisponible',
                text: 'Cette formation n’est pas ouverte aux inscriptions actuellement.'
            }
        };
        const m = messages[state] || messages.none;
        const askMessage = `Bonjour, je souhaite être informé(e) de la prochaine session de la formation « ${title} ».`;
        card.innerHTML = `
            <span class="registration-state__icon material-symbols-outlined" aria-hidden="true">${m.icon}</span>
            <h3>${escapeHtml(m.heading)}</h3>
            <p>${escapeHtml(m.text)}</p>
            <div class="registration-state__actions">
                <a class="button button--primary" href="${common.whatsappUrl(askMessage)}" target="_blank" rel="noopener noreferrer">Être informé(e) de l’ouverture<span class="material-symbols-outlined" aria-hidden="true">notifications</span></a>
                <a class="button button--secondary" href="/#catalogue">Voir les autres formations</a>
            </div>`;
    }

    /**
     * Les boutons « S'inscrire » de la fiche ne doivent rien promettre qui ne soit possible :
     * sans session ouverte, ils invitent à être prévenu(e) de l'ouverture (WhatsApp).
     */
    function updateRegistrationCtas(isOpen, title) {
        const askMessage = `Bonjour, je souhaite être informé(e) de la prochaine session de la formation « ${title} ».`;
        document.querySelectorAll('.fiche-hero__actions [data-register-formation], #mobile-cta [data-register-formation]')
            .forEach(cta => {
                const label = cta.childNodes[0];
                if (!cta.dataset.openLabel) {
                    cta.dataset.openLabel = label?.textContent || '';
                    cta.dataset.openHref = cta.getAttribute('href') || '#inscription';
                }
                if (isOpen) {
                    if (label) label.textContent = cta.dataset.openLabel;
                    cta.setAttribute('href', cta.dataset.openHref);
                    cta.removeAttribute('target');
                    cta.removeAttribute('rel');
                } else {
                    if (label) label.textContent = 'Être informé(e) de l’ouverture ';
                    cta.setAttribute('href', common.whatsappUrl(askMessage));
                    cta.setAttribute('target', '_blank');
                    cta.setAttribute('rel', 'noopener noreferrer');
                }
            });
    }

    /** Coordonnées de paiement et montant, depuis les données (jamais codés dans la page). */
    function renderPaymentDetails() {
        const price = formatPrice(currentPrice());
        document.querySelectorAll('[data-amount]').forEach(el => { el.textContent = price; });
        const cash = currentPaymentMethods().find(method => method.kind === 'cash');
        const set = (id, value) => { const el = document.getElementById(id); if (el && value) el.textContent = value; };
        set('cash-payment-name', cash?.recipient);
        set('cash-payment-place', cash?.place);
        set('cash-payment-phone', cash?.phone);
        document.querySelectorAll('.country-code').forEach(el => { el.textContent = currentCountryCode(); });
        // La règle de saisie du numéro suit les données du marché, pas un motif figé dans la page
        const motif = phonePattern().source;
        document.querySelectorAll('#telephone, #tel-paiement').forEach(champ => { champ.pattern = motif; });
        const summaryPrice = document.getElementById('selected-training-price');
        if (summaryPrice) summaryPrice.textContent = price;
    }

    /** Conditions acceptées à l'étape 4 : uniquement des faits connus. */
    function renderConditionsText() {
        const el = document.getElementById('conditions-text');
        if (!el) return;
        const s = selectedSession;
        const parts = ['J’accepte les conditions de la formation :'];
        if (s) {
            const dates = s.endDate ? `du ${formatSessionDate(s.startDate)} au ${formatSessionDate(s.endDate)}` : `à partir du ${formatSessionDate(s.startDate)}`;
            parts.push(`<strong class="text-primary">formation ${escapeHtml(dates)}</strong>${s.schedule ? `, <strong class="text-primary">${escapeHtml(s.schedule)}</strong>` : ''}.`);
            if (typeof s.placesTotal === 'number') parts.push(`Places limitées à <strong class="text-primary">${s.placesTotal} participants</strong>.`);
        } else {
            parts.push('les dates et horaires de la session vous seront communiqués avant le début de la formation.');
        }
        parts.push('Inscription confirmée après validation du paiement.');
        el.innerHTML = parts.join(' ');
    }

    // ====== PLACES COUNTER ======
    function initPlacesCounter() {
        const texteEl = document.getElementById('places-text');
        const barEl = document.getElementById('places-bar');
        const section = document.getElementById('places-counter-section');
        const badgeEl = document.getElementById('places-badge');
        const iconeEl = document.getElementById('places-icon');

        // Compteur affiché uniquement avec des chiffres réels de session — jamais de valeur par défaut
        const restantes = selectedSession?.placesAvailable;
        const total = selectedSession?.placesTotal;
        if (typeof restantes !== 'number' || typeof total !== 'number' || total <= 0) {
            if (section) section.hidden = true;
            return;
        }

        if (section) section.hidden = false;
        /* La rareté n'est annoncée que lorsqu'elle est vraie : tant que le groupe
           est complet à l'inverse (aucune place prise), on annonce simplement l'ouverture. */
        const prises = total - restantes;
        const tendue = restantes <= Math.max(3, Math.round(total * 0.25));
        if (texteEl) {
            texteEl.innerHTML = prises === 0
                ? `<strong>${total}</strong> places disponibles pour cette session`
                : `Il ne reste que <span class="text-red-500">${restantes}</span> place${restantes > 1 ? 's' : ''} sur ${total}`;
        }
        if (badgeEl) badgeEl.hidden = !tendue;
        if (iconeEl) iconeEl.textContent = tendue ? 'local_fire_department' : 'group';
        if (iconeEl) iconeEl.classList.toggle('text-red-500', tendue);
        if (barEl) {
            const pct = Math.round((prises / total) * 100);
            setTimeout(() => { barEl.style.width = pct + '%'; }, 300);
        }
    }

    // ====== INIT ======
    function init() {
        migrateLegacyStorage();
        initSelectedFormationFromUrl();

        const btnCloseSuccess = document.getElementById('btn-close-success');
        if (btnCloseSuccess) {
            btnCloseSuccess.addEventListener('click', () => {
                successScreen.classList.add('hidden');
                // Réinitialiser la visibilité des éléments périphériques
                document.querySelector('#poster-section').style.display = 'none';
                document.querySelector('#programme-section').style.display = 'none';
                document.querySelector('#places-counter-section').style.display = 'none';
                document.querySelector('#formateur-section').style.display = 'none';
                document.querySelector('#faq-section').style.display = 'none';
                document.querySelector('#mobile-progress').style.display = 'none';
                document.querySelector('#sidebar').style.display = 'none';
                document.getElementById('already-registered-card')?.classList.remove('hidden');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        const btnRegisterOther = document.getElementById('btn-register-other');
        if (btnRegisterOther) {
            btnRegisterOther.addEventListener('click', () => {
                try { localStorage.removeItem(registeredKey(selectedFormation, selectedSession)); } catch (e) { }
                clearSavedData();

                // ✅ FIX 1 : Remettre currentStep à 1 
                currentStep = 1;

                // ✅ FIX 2 : Reset direct du DOM sans passer par goToStep (évite race condition)
                sections.forEach(s => {
                    s.classList.remove('active');
                    s.style.opacity = '';
                    s.style.transform = '';
                    s.style.transition = '';
                });
                sections[0].classList.add('active');

                // Reset formulaire
                form.reset();
                setSelectedFormation(selectedFormation?.formId || PAGE_FORMATION_ID, false);

                // ✅ FIX 3 : Réafficher toutes les sections correctement
                const sectionsToShow = [
                    '#poster-section',
                    '#programme-section',
                    '#places-counter-section',
                    '#formateur-section',
                    '#faq-section',
                    '#mobile-progress',
                    '#sidebar'
                ];
                sectionsToShow.forEach(sel => {
                    const el = document.querySelector(sel);
                    if (el) {
                        el.classList.remove('hidden');
                        el.style.display = '';
                    }
                });

                // Masquer la carte "déjà inscrit"
                document.getElementById('already-registered-card')?.classList.add('hidden');

                // Réafficher le formulaire
                const formContainer = document.getElementById('form-container');
                if (formContainer) {
                    formContainer.classList.remove('hidden');
                    formContainer.style.display = '';
                }

                // Mettre à jour barre de progression
                updateProgress();

                // Scroll en haut
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        if (isAlreadyRegistered()) {
            document.getElementById('form-container')?.classList.add('hidden');
            document.querySelector('#poster-section')?.classList.add('hidden');
            document.querySelector('#programme-section')?.classList.add('hidden');
            document.querySelector('#places-counter-section')?.classList.add('hidden');
            document.querySelector('#formateur-section')?.classList.add('hidden');
            document.querySelector('#faq-section')?.classList.add('hidden');
            document.querySelector('#mobile-progress')?.classList.add('hidden');
            document.querySelector('#sidebar')?.classList.add('hidden');
            document.getElementById('already-registered-card')?.classList.remove('hidden');
        }

        loadSavedData();
        updateProgress();
        attachEvents();
        updateCharCounter();
        initPlacesCounter();

        /* Le relevé des inscrits arrive après l'affichage : on recalcule alors la session
           retenue, le compteur de places et l'état d'inscription (une session peut être
           devenue complète depuis le dernier déploiement). */
        document.addEventListener('impactali:places', () => {
            setSelectedFormation(selectedFormation?.formId || PAGE_FORMATION_ID, false,
                selectedSession?.id || undefined);
            initPlacesCounter();
        });
    }

    /** Inscrit pour cette formation : à la session choisie, ou sans session (dates à annoncer). */
    function isAlreadyRegistered() {
        try {
            return localStorage.getItem(registeredKey(selectedFormation, selectedSession)) === 'true';
        } catch (e) { return false; }
    }

    // ====== EVENTS ======
    function attachEvents() {
        // Next/Prev buttons
        document.querySelectorAll('.btn-next').forEach(btn => {
            btn.addEventListener('click', () => {
                if (validateSection(currentStep)) {
                    goToStep(parseInt(btn.dataset.next));
                }
            });
        });

        document.querySelectorAll('.btn-prev').forEach(btn => {
            btn.addEventListener('click', () => {
                goToStep(parseInt(btn.dataset.prev));
            });
        });

        // Sidebar step clicks
        sidebarSteps.forEach(step => {
            step.addEventListener('click', () => {
                handleStepClick(parseInt(step.dataset.step));
            });
        });

        // Mobile step clicks
        mobileSteps.forEach(step => {
            step.addEventListener('click', () => {
                handleStepClick(parseInt(step.dataset.step));
            });
        });

        // Submit
        form.addEventListener('submit', handleSubmit);

        // ---- Paiement Cards ----
        document.querySelectorAll('.paiement-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.paiement-card').forEach(c => {
                    c.classList.remove('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                });
                card.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                document.getElementById('paiement').value = card.dataset.value;
                clearFieldError(document.getElementById('paiement'));
                handlePaymentChange();
            });
        });

        // Motivation counter
        motivationField.addEventListener('input', updateCharCounter);

        // Auto-save & clear errors on all inputs
        // updateProgress() : sans lui la barre restait figée jusqu'au changement d'étape
        form.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('input', () => {
                saveData();
                clearFieldError(field);
                updateProgress();
            });
            field.addEventListener('change', () => {
                saveData();
                clearFieldError(field);
                updateProgress();
            });
        });

        // Real-time validation on blur
        form.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(field => {
            field.addEventListener('blur', () => {
                validateField(field);
            });
        });

        // ---- Profession Cards ----
        document.querySelectorAll('.profession-card').forEach(card => {
            card.addEventListener('click', () => {
                // Deselect all
                document.querySelectorAll('.profession-card').forEach(c => {
                    c.classList.remove('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                });
                // Select this
                card.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                // Set hidden input value
                document.getElementById('profession').value = card.dataset.value;
                clearFieldError(document.getElementById('profession'));
                // Show conditional sub-question
                showProfessionSub(card.dataset.value);
                saveData();
            });
        });

        // ---- Sub-cards ----
        document.querySelectorAll('.sub-card').forEach(card => {
            card.addEventListener('click', () => {
                // Deselect siblings only
                const parent = card.closest('.profession-sub');
                parent.querySelectorAll('.sub-card').forEach(c => {
                    c.classList.remove('!border-primary', '!bg-primary-fixed/20', 'ring-1', 'ring-primary/20', 'font-bold');
                });
                card.classList.add('!border-primary', '!bg-primary-fixed/20', 'ring-1', 'ring-primary/20', 'font-bold');
                document.getElementById('profession-detail').value = card.dataset.subvalue;
                saveData();
            });
        });

        // ---- Niveau Cards ----
        document.querySelectorAll('.niveau-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.niveau-card').forEach(c => {
                    c.classList.remove('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                });
                card.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                document.getElementById('niveau').value = card.dataset.value;
                clearFieldError(document.getElementById('niveau'));
                saveData();
            });
        });

        // ---- Animation btn-flip (Unified for Web & Mobile) ----
        document.querySelectorAll('.btn-flip').forEach(btn => {
            const triggerAnim = () => {
                btn.classList.add('is-animating');
                setTimeout(() => btn.classList.remove('is-animating'), 1000);
            };
            btn.addEventListener('touchstart', triggerAnim, { passive: true });
            btn.addEventListener('mousedown', triggerAnim);
        });
    }

    // ====== CONDITIONAL PROFESSION SUB-QUESTIONS ======
    function showProfessionSub(profession) {
        const container = document.getElementById('profession-sub-questions');
        container.classList.remove('hidden');
        container.querySelectorAll('.profession-sub').forEach(sub => {
            if (sub.dataset.for === profession) {
                sub.classList.remove('hidden');
                sub.style.animation = 'fade-up 0.3s ease-out';
            } else {
                sub.classList.add('hidden');
            }
        });
        // Reset detail
        document.getElementById('profession-detail').value = '';
        container.querySelectorAll('.sub-card').forEach(c => {
            c.classList.remove('!border-primary', '!bg-primary-fixed/20', 'ring-1', 'ring-primary/20', 'font-bold');
        });
    }

    function handleStepClick(targetStep) {
        if (targetStep < currentStep) {
            goToStep(targetStep);
        } else if (targetStep === currentStep + 1) {
            if (validateSection(currentStep)) {
                goToStep(targetStep);
            }
        }
    }

    // ====== NAVIGATION ======
    function goToStep(step) {
        if (step < 1 || step > TOTAL_STEPS) return;

        const prevSection = sections[currentStep - 1];
        const direction = step > currentStep ? 1 : -1;

        // Animate out
        prevSection.style.opacity = '0';
        prevSection.style.transform = `translateX(${direction * -30}px) scale(0.98)`;

        setTimeout(() => {
            prevSection.classList.remove('active');
            prevSection.style.opacity = '';
            prevSection.style.transform = '';

            currentStep = step;
            const nextSection = sections[currentStep - 1];

            // Animate in
            nextSection.style.opacity = '0';
            nextSection.style.transform = `translateX(${direction * 30}px) scale(0.98)`;
            nextSection.classList.add('active');

            requestAnimationFrame(() => {
                nextSection.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
                nextSection.style.opacity = '1';
                nextSection.style.transform = 'translateX(0) scale(1)';
                setTimeout(() => {
                    nextSection.style.transition = '';
                    nextSection.style.transform = '';
                }, 360);
            });

            if (currentStep === 4) {
                buildSummary();
            }

            updateProgress();

            // Show/hide poster & places counter (step 1 only)
            const prerequisSection = document.getElementById('prerequis-section');
            const posterSection = document.getElementById('poster-section');
            const placesSection = document.getElementById('places-counter-section');
            const formateurSection = document.getElementById('formateur-section');
            const faqSection = document.getElementById('faq-section');
            if (posterSection) posterSection.style.display = (currentStep === 1) ? '' : 'none';
            if (placesSection) placesSection.style.display = (currentStep === 1) ? '' : 'none';
            if (formateurSection) formateurSection.style.display = (currentStep === 1) ? '' : 'none';
            if (faqSection) faqSection.style.display = (currentStep === 1) ? '' : 'none';
            // Sans cela, « Prérequis » restait seul à l'écran aux étapes 2 à 4
            if (prerequisSection) prerequisSection.style.display = (currentStep === 1) ? '' : 'none';

            // Show/hide programme (steps 1 and 4 only)
            const programmeSection = document.getElementById('programme-section');
            if (programmeSection) {
                programmeSection.style.display = (currentStep === 1 || currentStep === 4) ? '' : 'none';
            }

            // Scroll to top of form card
            const formContainer = document.getElementById('form-container');
            if (formContainer) {
                formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 400);
    }

    // ====== PROGRESS ======
    function updateProgress() {
        const completion = computeFormCompletion();
        const stepPercent = ((currentStep - 1) / TOTAL_STEPS) * 100;

        // Form top bar (step-based)
        formTopBar.style.width = (currentStep / TOTAL_STEPS * 100) + '%';

        // Sidebar progress (step-based)
        if (sidebarProgressBar) sidebarProgressBar.style.width = stepPercent + '%';
        if (sidebarStepLabel) sidebarStepLabel.textContent = `Étape ${currentStep} sur ${TOTAL_STEPS}`;

        // Completion bars
        if (sidebarCompletionBar) sidebarCompletionBar.style.width = completion + '%';
        if (sidebarPercent) sidebarPercent.textContent = completion + '%';

        // Mobile progress
        if (mobileProgressBar) mobileProgressBar.style.width = completion + '%';
        if (mobileStepLabel) mobileStepLabel.textContent = `Étape ${currentStep} sur ${TOTAL_STEPS}`;
        if (mobilePercent) mobilePercent.textContent = completion + '%';

        // Sidebar step indicators
        sidebarSteps.forEach((step, i) => {
            const stepNum = i + 1;
            step.classList.remove('active', 'completed');
            step.removeAttribute('aria-current');

            if (stepNum === currentStep) {
                step.classList.add('active');
                step.setAttribute('aria-current', 'step');
            } else if (stepNum < currentStep) {
                step.classList.add('completed');
            }
        });

        // Mobile step indicators
        mobileSteps.forEach((step, i) => {
            const stepNum = i + 1;
            step.classList.remove('active', 'completed');

            if (stepNum === currentStep) {
                step.classList.add('active');
            } else if (stepNum < currentStep) {
                step.classList.add('completed');
            }
        });
    }

    function computeFormCompletion() {
        // L'e-mail est facultatif : l'inclure empêchait la barre d'atteindre 100 %
        const allFields = [
            'nom', 'prenom', 'telephone', 'age',
            'profession', 'niveau', 'motivation', 'paiement',
        ];

        let filled = 0;
        let total = allFields.length + 3; // +objectifs +conditions +remboursement

        allFields.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value && el.value.trim() !== '') filled++;
        });

        const objectifs = document.querySelectorAll('input[name="objectifs"]:checked');
        if (objectifs.length > 0) filled++;

        const conditions = document.getElementById('conditions');
        if (conditions && conditions.checked) filled++;

        const remboursement = document.getElementById('remboursement');
        if (remboursement && remboursement.checked) filled++;

        return Math.round((filled / total) * 100);
    }

    // ====== VALIDATION ======
    function validateSection(step) {
        let isValid = true;
        const section = sections[step - 1];
        const fields = section.querySelectorAll('input[required], select[required], textarea[required]');

        fields.forEach(field => {
            if (!validateField(field)) {
                isValid = false;
            }
        });

        // Objectifs (step 2)
        if (step === 2) {
            const objectifs = document.querySelectorAll('input[name="objectifs"]:checked');
            const errorEl = document.getElementById('objectifs-error');
            if (objectifs.length === 0) {
                showError(errorEl, 'Veuillez sélectionner au moins un objectif');
                isValid = false;
            } else {
                hideError(errorEl);
            }
        }

        // Tel-paiement when visible (step 3)
        if (step === 3) {
            const paiementValue = paiementSelect.value;
            const mobileMethods = ['Waafi Mobile Money', 'Cacpay', 'D-Money'];
            if (mobileMethods.includes(paiementValue)) {
                const telPaiement = document.getElementById('tel-paiement');
                if (!telPaiement.value.trim()) {
                    showFieldError(telPaiement, 'Veuillez entrer votre numéro de paiement');
                    isValid = false;
                } else if (!phonePattern().test(telPaiement.value.trim())) {
                    showFieldError(telPaiement, phoneFormatHint());
                    isValid = false;
                }
            }
        }

        if (!isValid) {
            const firstError = section.querySelector('.field-error.visible');
            if (firstError) {
                firstError.closest('.field-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        return isValid;
    }

    function validateField(field) {
        const value = field.value.trim();
        const name = field.id || field.name;

        if (!field.required && !value) {
            clearFieldValidation(field);
            return true;
        }

        if (field.required && !value) {
            showFieldError(field, getRequiredMessage(name));
            return false;
        }

        switch (name) {
            case 'telephone':
            case 'tel-paiement':
                if (!phonePattern().test(value)) {
                    showFieldError(field, phoneFormatHint());
                    return false;
                }
                break;

            case 'email':
                if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    showFieldError(field, 'Adresse email invalide');
                    return false;
                }
                break;

            case 'age':
                const age = parseInt(value);
                if (isNaN(age) || age < 16 || age > 80) {
                    showFieldError(field, 'L\'âge doit être entre 16 et 80 ans');
                    return false;
                }
                break;
        }

        clearFieldError(field);
        field.classList.remove('invalid');
        field.classList.add('valid');
        return true;
    }

    function getRequiredMessage(name) {
        const messages = {
            'nom': 'Le nom est obligatoire',
            'prenom': 'Le prénom est obligatoire',
            'telephone': 'Le numéro de téléphone est obligatoire',
            'age': 'L\'âge est obligatoire',
            'profession': 'Veuillez choisir votre profession',
            'niveau': 'Veuillez choisir votre niveau',
            'motivation': 'Veuillez expliquer votre motivation',
            'paiement': 'Veuillez choisir un mode de paiement',
            'conditions': 'Vous devez accepter les conditions',
            'remboursement': 'Vous devez accepter la politique de remboursement',
        };
        return messages[name] || 'Ce champ est obligatoire';
    }

    function showFieldError(field, message) {
        field.classList.remove('valid');
        field.classList.add('invalid');
        const errorEl = document.getElementById(field.id + '-error');
        if (errorEl) showError(errorEl, message);
    }

    function showError(el, message) {
        el.textContent = message;
        el.classList.add('visible');
    }

    function hideError(el) {
        el.textContent = '';
        el.classList.remove('visible');
    }

    function clearFieldError(field) {
        field.classList.remove('invalid');
        const errorEl = document.getElementById(field.id + '-error') || document.getElementById(field.name + '-error');
        if (errorEl) hideError(errorEl);
    }

    function clearFieldValidation(field) {
        field.classList.remove('valid', 'invalid');
        clearFieldError(field);
    }

    // ====== PAYMENT CONDITIONAL ======
    function handlePaymentChange() {
        const value = paiementSelect.value;
        const method = currentPaymentMethods().find(item => item.value === value);
        const isMobile = method ? method.kind === 'mobile' : ['Waafi Mobile Money', 'Cacpay'].includes(value);

        if (isMobile) {
            show(telPaiementGroup);
            show(paymentInfoMobile);
            hide(paymentInfoCash);

            const numLabel = document.getElementById('mobile-payment-label');
            const numText = document.getElementById('mobile-payment-number');
            const account = document.getElementById('mobile-payment-account');
            if (numLabel && method?.numberLabel) numLabel.textContent = method.numberLabel;
            if (numText && method?.number) numText.textContent = method.number;
            if (account && method?.accountName) account.textContent = method.accountName;
        } else if (value === 'Espèces') {
            hide(telPaiementGroup);
            hide(paymentInfoMobile);
            show(paymentInfoCash);
            document.getElementById('tel-paiement').value = '';
        } else {
            hide(telPaiementGroup);
            hide(paymentInfoMobile);
            hide(paymentInfoCash);
        }

        saveData();
    }

    function show(el) {
        el.style.display = '';
        el.setAttribute('aria-hidden', 'false');
    }

    function hide(el) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    // ====== CHAR COUNTER ======
    function updateCharCounter() {
        const len = motivationField.value.length;
        const max = motivationField.maxLength;
        motivationCounter.textContent = `${len} / ${max}`;

        if (len >= max * 0.9) {
            motivationCounter.style.color = '#ef4444';
        } else if (len >= max * 0.7) {
            motivationCounter.style.color = '#f59e0b';
        } else {
            motivationCounter.style.color = '';
        }
    }

    // ====== SUMMARY ======
    function buildSummary() {
        const data = getFormData();
        const items = [
            { label: 'Formation', value: selectedFormation?.title || data.formation },
            { label: 'Session', value: selectedSession ? formatSessionDate(selectedSession.startDate) : 'Dates à annoncer' },
            { label: 'Nom', value: data.nom },
            { label: 'Prénom', value: data.prenom },
            { label: 'Téléphone', value: `${currentCountryCode()} ${data.telephone}` },
            { label: 'Email', value: data.email || '—' },
            { label: 'Âge', value: data.age + ' ans' },
            { label: 'Profession', value: data.profession },
            { label: 'Niveau', value: data.niveau },
            { label: 'Mode de paiement', value: data.paiement },
            { label: 'Montant', value: formatPrice(currentPrice()) },
        ];

        let html = '';
        items.forEach(item => {
            html += `<div class="summary-item">
                <span class="summary-item-label">${item.label}</span>
                <span class="summary-item-value">${escapeHtml(item.value)}</span>
            </div>`;
        });

        html += `<div class="summary-item full-width">
            <span class="summary-item-label">Motivation</span>
            <span class="summary-item-value">${escapeHtml(data.motivation).substring(0, 150)}${data.motivation.length > 150 ? '...' : ''}</span>
        </div>`;

        html += `<div class="summary-item full-width">
            <span class="summary-item-label">Objectifs</span>
            <span class="summary-item-value">${escapeHtml(data.objectifs)}</span>
        </div>`;

        summaryContent.innerHTML = html;
    }

    // ====== FORM DATA ======
    function getFormData() {
        const objectifsInputs = document.querySelectorAll('input[name="objectifs"]:checked');
        const objectifs = Array.from(objectifsInputs).map(cb => cb.value).join(', ');

        return {
            formation: document.getElementById('formation')?.value || selectedFormation?.formId || PAGE_FORMATION_ID,
            sessionId: document.getElementById('session-id')?.value || '',
            nom: document.getElementById('nom').value.trim(),
            prenom: document.getElementById('prenom').value.trim(),
            telephone: document.getElementById('telephone').value.trim(),
            email: document.getElementById('email').value.trim(),
            age: document.getElementById('age').value.trim(),
            profession: document.getElementById('profession').value.trim(),
            niveau: document.getElementById('niveau').value,
            motivation: document.getElementById('motivation').value.trim(),
            objectifs: objectifs,
            paiement: paiementSelect.value,
            telPaiement: document.getElementById('tel-paiement').value.trim(),
            professionDetail: document.getElementById('profession-detail')?.value || '',
            source: document.getElementById('source-tracking')?.value || 'Direct'
        };
    }

    // ====== SUBMIT ======
    async function handleSubmit(e) {
        e.preventDefault();

        if (!validateSection(4)) return;

        const conditionsCheckbox = document.getElementById('conditions');
        if (!conditionsCheckbox.checked) {
            showFieldError(conditionsCheckbox, 'Vous devez accepter les conditions');
            conditionsCheckbox.closest('.field-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const remboursementCheckbox = document.getElementById('remboursement');
        if (!remboursementCheckbox.checked) {
            showFieldError(remboursementCheckbox, 'Vous devez accepter la politique de remboursement pour continuer');
            remboursementCheckbox.closest('.field-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        btnSubmit.disabled = true;

        // Hide form and show hamster overlay
        const formContainer = document.getElementById('form-container');
        const mobileProgress = document.querySelector('#mobile-progress');
        const hamsterOverlay = document.getElementById('hamster-overlay');

        if (formContainer) formContainer.classList.add('hidden');
        if (mobileProgress) mobileProgress.classList.add('hidden');
        if (hamsterOverlay) hamsterOverlay.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const data = getFormData();

        const formation = FORMATIONS.find(item => item.formId === data.formation) || selectedFormation;
        const now = new Date();
        // Clés historiques conservées telles quelles (la feuille Google les lit) ; les nouvelles sont additives.
        const payload = {
            horodateur: now.toLocaleString('fr-FR'),
            formationId: data.formation,
            sessionId: data.sessionId,
            nom: data.nom,
            prenom: data.prenom,
            telephone: data.telephone,
            email: data.email,
            age: parseInt(data.age) || data.age,
            profession: data.profession,
            niveauCanva: data.niveau,
            motivation: data.motivation,
            objectifs: data.objectifs,
            modePaiement: data.paiement,
            telPaiement: data.telPaiement,
            statut: 'En attente',
            source: data.source,
            // ---- champs du moteur commun ----
            formationTitle: formation?.title || '',
            formationSlug: formation?.slug || '',
            sessionLabel: selectedSession ? formatSessionDate(selectedSession.startDate) : '',
            sessionStartDate: selectedSession?.startDate || '',
            niveau: data.niveau,
            professionDetail: data.professionDetail,
            montant: typeof currentPrice() === 'number' ? currentPrice() : '',
            currency: currentCurrency(),
            countryCode: currentCountryCode(),
            telephoneInternational: `${currentCountryCode()}${data.telephone}`,
            dateInscription: now.toISOString(),
            pageUrl: window.location.href.split('?')[0]
        };

        try {
            // Garantir que l'animation du hamster tourne pendant au moins 2 secondes (plus fluide)
            const minTimePromise = new Promise(resolve => setTimeout(resolve, 2000));
            // Timeout de sécurité pour ne jamais dépasser 4 secondes de chargement
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, 4000));

            let fetchPromise = Promise.resolve();

            if (GOOGLE_SHEETS_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
                fetchPromise = fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            // On attend soit que l'envoi ET le délai minimum soient finis,
            // soit que le timeout de 4 secondes soit atteint.
            await Promise.race([
                Promise.all([fetchPromise, minTimePromise]),
                timeoutPromise
            ]);

            if (hamsterOverlay) hamsterOverlay.classList.add('hidden');
            showSuccessScreen();
            clearSavedData();
        } catch (error) {
            console.error('Erreur soumission:', error);
            alert("❌ Erreur lors de l'envoi. Veuillez vérifier votre connexion ou réessayer.");

            // Réafficher le formulaire en cas d'erreur
            if (hamsterOverlay) hamsterOverlay.classList.add('hidden');
            if (formContainer) formContainer.classList.remove('hidden');
            if (mobileProgress) mobileProgress.classList.remove('hidden');
            btnSubmit.disabled = false;
        }
    }

    function showSuccessScreen() {
        // Build dynamic WhatsApp URL
        const data = getFormData();
        const formation = FORMATIONS.find(item => item.formId === data.formation) || selectedFormation;
        const formationTitle = formation?.title || data.formation;
        const formationPrice = typeof currentPrice() === 'number' ? formatPrice(currentPrice()) : 'Tarif à confirmer';
        const prenomNom = `${data.nom} ${data.prenom}`.trim();
        const greeting = CONTACT.contactName ? `Bonjour ${CONTACT.contactName},` : 'Bonjour,';
        const message = `${greeting}

Je confirme mon inscription à la formation ${formationTitle}.

📋 INFORMATIONS D'INSCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Participant : ${prenomNom}
📱 Téléphone : ${currentCountryCode()} ${data.telephone}
💳 Paiement : ${data.paiement} - ${formationPrice}
📅 Formation : ${formationTitle}${selectedSession ? ` — session du ${formatSessionDate(selectedSession.startDate)}` : ' — session à annoncer'}

📎 Preuve de paiement ci-jointe

En attente de votre confirmation.

Cordialement,
${data.prenom}`;

        const btnWhatsapp = document.getElementById('btn-whatsapp');
        if (btnWhatsapp) {
            btnWhatsapp.href = common ? common.whatsappUrl(message)
                : `https://wa.me/${CONTACT.whatsappNumber || ''}?text=${encodeURIComponent(message)}`;
        }
        const successTitle = document.getElementById('success-training-title');
        if (successTitle) successTitle.textContent = formationTitle;
        const registeredTitle = document.getElementById('registered-training-title');
        if (registeredTitle) registeredTitle.textContent = formationTitle;

        document.getElementById('form-container')?.classList.add('hidden');
        document.querySelector('#mobile-progress').style.display = 'none';
        document.querySelector('#sidebar').style.display = 'none';
        successScreen.classList.remove('hidden');

        try { localStorage.setItem(registeredKey(formation, selectedSession), 'true'); } catch (e) { /* silent */ }
        // Cette inscription vient d'occuper une place : on redemande le relevé sans passer par le cache
        common?.refreshPlaces?.(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ====== AUTO-SAVE ======
    function saveData() {
        try {
            const data = getFormData();
            const conditionsChecked = document.getElementById('conditions').checked;
            const remboursementChecked = document.getElementById('remboursement')?.checked || false;
            localStorage.setItem(draftKey(selectedFormation), JSON.stringify({ ...data, conditions: conditionsChecked, remboursement: remboursementChecked }));
        } catch (e) { /* silent */ }
    }

    function loadSavedData() {
        try {
            const saved = localStorage.getItem(draftKey(selectedFormation));
            if (!saved) return;

            const data = JSON.parse(saved);
            if (!data) return;

            // Le brouillon est déjà propre à cette formation ; seule la session choisie est reprise
            // (si l'URL n'en impose pas une autre).
            if (data.sessionId && !new URLSearchParams(window.location.search).get('sessionId')) {
                setSelectedFormation(selectedFormation?.formId || PAGE_FORMATION_ID, false, data.sessionId);
            }

            const textFields = ['nom', 'prenom', 'telephone', 'email', 'age', 'motivation'];
            textFields.forEach(id => {
                const el = document.getElementById(id);
                if (el && data[id]) el.value = data[id];
            });

            // Profession card restore
            if (data.profession) {
                document.getElementById('profession').value = data.profession;
                document.querySelectorAll('.profession-card').forEach(c => {
                    if (c.dataset.value === data.profession) {
                        c.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                        showProfessionSub(data.profession);
                    }
                });
            }

            // Niveau card restore
            if (data.niveau) {
                document.getElementById('niveau').value = data.niveau;
                document.querySelectorAll('.niveau-card').forEach(c => {
                    if (c.dataset.value === data.niveau) {
                        c.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                    }
                });
            }

            // Profession detail restore
            if (data.professionDetail) {
                document.getElementById('profession-detail').value = data.professionDetail;
                document.querySelectorAll('.sub-card').forEach(c => {
                    if (c.dataset.subvalue === data.professionDetail) {
                        c.classList.add('!border-primary', '!bg-primary-fixed/20', 'ring-1', 'ring-primary/20', 'font-bold');
                    }
                });
            }

            // tel-paiement
            const telPay = document.getElementById('tel-paiement');
            if (telPay && data.telPaiement) telPay.value = data.telPaiement;

            if (data.paiement) {
                paiementSelect.value = data.paiement;
                document.querySelectorAll('.paiement-card').forEach(c => {
                    if (c.dataset.value === data.paiement) {
                        c.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                    }
                });
                handlePaymentChange();
            }

            // Checkboxes
            if (data.objectifs) {
                const selected = data.objectifs.split(', ');
                document.querySelectorAll('input[name="objectifs"]').forEach(cb => {
                    cb.checked = selected.includes(cb.value);
                });
            }

            if (data.conditions) {
                document.getElementById('conditions').checked = true;
            }
            if (data.remboursement) {
                document.getElementById('remboursement').checked = true;
            }
        } catch (e) { /* silent */ }
    }

    function clearSavedData() {
        try { localStorage.removeItem(draftKey(selectedFormation)); } catch (e) { /* silent */ }
    }

    // ====== UTILITIES ======
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====== START ======
    document.addEventListener('DOMContentLoaded', init);

    // ====== TRACKING INTELLIGENT DES SOURCES ======
    function captureTrafficSource() {
        const urlParams = new URLSearchParams(window.location.search);
        let trafficSource = urlParams.get('source'); // Cherche ?source=...

        if (!trafficSource) {
            const referrer = document.referrer;
            if (referrer) {
                if (referrer.includes('facebook.com')) trafficSource = 'Facebook (Auto)';
                else if (referrer.includes('instagram.com')) trafficSource = 'Instagram (Auto)';
                else if (referrer.includes('linkedin.com')) trafficSource = 'LinkedIn (Auto)';
                else if (referrer.includes('tiktok.com')) trafficSource = 'TikTok (Auto)';
                else trafficSource = new URL(referrer).hostname;
            }
        }

        if (trafficSource) {
            const hiddenSourceInput = document.getElementById('source-tracking');
            if (hiddenSourceInput) {
                hiddenSourceInput.value = trafficSource;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', captureTrafficSource);

})();

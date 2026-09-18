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
    /* Adresse du script Google : une seule source, formations-data.js.
       Aucune valeur de repli — une adresse erronée enverrait les inscriptions
       vers un autre script, ce qui est pire que ne pas les envoyer du tout. */
    const GOOGLE_SHEETS_URL = (window.SITE_ENDPOINTS && window.SITE_ENDPOINTS.registration) || '';
    const TOTAL_STEPS = 4;
    // Réassignable : le catalogue peut être mis à jour depuis le tableau de bord
    let FORMATIONS = Array.isArray(window.FORMATIONS) ? window.FORMATIONS : [];
    const CONTACT = window.SITE_CONTACT || {};
    const common = window.SiteCommon || null;

    /**
     * Formation portée par la page (jamais une valeur codée en dur).
     * Un attribut présent mais VIDE signifie « page générique » : la formation
     * vient alors de l'URL. Le distinguer d'un attribut absent est indispensable,
     * sinon /inscription/ afficherait toujours la première formation du catalogue.
     */
    const DECLARATION_PAGE = document.getElementById('inscription')
        ? document.getElementById('inscription').getAttribute('data-formation-id') : null;
    const PAGE_FORMATION_ID = DECLARATION_PAGE !== null ? DECLARATION_PAGE : (FORMATIONS[0]?.formId || '');

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

    /* ---- Paramètres dépendant du PAYS ----
       Devise, indicatif, format des numéros, moyens de paiement et tarif viennent
       tous du pays choisi par le candidat à l'étape 1. Aucune valeur de marché
       n'est écrite ici, et aucun montant n'est converti d'une devise à l'autre :
       le tarif affiché est celui qui a été saisi pour ce pays, ou rien. */
    const activeSession = () => displaySession || selectedSession;
    const currentPays = () => (common ? common.paysActif() : null);
    const currentCurrency = () => (currentPays()?.devise) || '';
    const currentCountryCode = () => (currentPays()?.indicatif) || '';
    /**
     * Tarif applicable : celui de la session quand elle en fixe un pour ce pays,
     * sinon celui de la formation. `null` signifie « non communiqué », jamais 0.
     */
    const currentPrice = () => {
        if (!common) return null;
        const duSession = common.prixDe(activeSession());
        return typeof duSession === 'number' ? duSession : common.prixDe(selectedFormation);
    };
    const currentPaymentMethods = () => {
        const methods = currentPays()?.paymentMethods;
        return Array.isArray(methods) ? methods : [];
    };
    const formatPrice = price => (common ? common.formatPrice(price, currentCurrency())
        : (typeof price === 'number' ? `${price.toLocaleString('fr-FR')} ${currentCurrency() || ''}`.trim() : 'À confirmer'));

    /**
     * Format du numéro local : la règle est déclarée sur le pays
     * (Pays.motifTelephone). Sans règle, on n'exige que des chiffres.
     */
    function phonePattern() {
        const source = currentPays()?.motifTelephone;
        try { return source ? new RegExp(source) : /^\d{6,15}$/; } catch (e) { return /^\d{6,15}$/; }
    }
    function phoneFormatHint() {
        return currentPays()?.aideTelephone || 'Format invalide : chiffres uniquement';
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
    let SESSIONS = Array.isArray(window.SESSIONS) ? window.SESSIONS : [];
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
        /* Une session retenue qui a disparu de la liste ne doit pas survivre :
           changer de pays écarte les sessions qui se tiennent ailleurs, et garder
           l'ancienne ferait payer un tarif d'un autre marché. */
        if (sessionId !== undefined) selectedSession = upcoming.find(item => item.id === sessionId) || null;
        else if (!selectedSession || selectedSession.formId !== formation.formId
            || !upcoming.some(item => item.id === selectedSession.id)) {
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

        renderEnteteGenerique(formation);
        renderBlocsFiche(formation);
        renderPaysSelector();
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

    /**
     * Page d'inscription générique (/inscription/?trainingId=…) : elle sert toutes
     * les formations, y compris celles créées depuis le tableau de bord qui n'ont
     * pas encore de page générée. Son en-tête est écrit ici, à partir des données.
     */
    function renderEnteteGenerique(formation) {
        if (document.body.dataset.ficheGenerique === undefined || !formation) return;

        const titre = document.getElementById('fiche-title');
        if (titre) titre.textContent = formation.title;

        const accroche = document.querySelector('.fiche-hero__lead');
        if (accroche) accroche.textContent = formation.shortDescription || '';

        const fil = document.querySelector('.breadcrumb [aria-current="page"]');
        if (fil) fil.textContent = formation.shortTitle || formation.title;

        const surtitre = document.querySelector('.fiche-hero .eyebrow');
        if (surtitre && formation.category) surtitre.textContent = 'INSCRIPTION · ' + formation.category.toUpperCase();

        const affiche = document.querySelector('#poster-section img');
        if (affiche && (formation.poster || formation.image)) {
            affiche.src = formation.poster || formation.image;
            affiche.alt = `Affiche de la formation ${formation.title}`;
        }
        document.querySelectorAll('#poster-validation').forEach(img => {
            if (formation.poster || formation.image) {
                img.src = formation.poster || formation.image;
                img.alt = `Affiche de la formation ${formation.title}`;
            }
        });
        document.title = `${formation.title} — Inscription | IMPACTALI`;

        document.querySelectorAll('[data-whatsapp-float], .fiche-hero__actions [data-whatsapp-message]').forEach(lien => {
            const message = `Bonjour, je souhaite m’inscrire à la formation ${formation.title} et j’ai une question.`;
            lien.dataset.whatsappMessage = message;
            if (common) lien.href = common.whatsappUrl(message);
        });
    }

    /**
     * Programme détaillé et questions fréquentes, écrits depuis les données.
     *
     * La page générée porte déjà ce contenu — c'est ce que lit Google. On le
     * réécrit quand même dès que le catalogue arrive : une modification faite
     * dans le tableau de bord s'affiche alors sans republier le site. Et sur la
     * page d'inscription générique, qui sert les formations créées après la
     * dernière publication, c'est le SEUL moyen de les afficher.
     *
     * Un contenu vide ne remplace jamais un contenu affiché : mieux vaut le
     * texte publié, même daté, qu'une section vide.
     */
    function renderBlocsFiche(formation) {
        const blocs = window.FicheBlocs;
        if (!blocs || !formation) return;

        const remplir = (id, html) => {
            const section = document.getElementById(id);
            if (!section) return;
            if (!html) return;
            if (section.innerHTML.trim() === html.trim()) { section.hidden = false; return; }
            section.innerHTML = html;
            section.hidden = false;
            common?.initAccordions?.(section);
            common?.observeReveals?.(section.parentElement || undefined);
        };

        remplir('programme-section', blocs.aUnProgramme(formation)
            ? blocs.programmeInterieur(formation)
            : blocs.programmeSimpleInterieur(formation));
        remplir('faq-section', blocs.aUneFaq(formation) ? blocs.faqInterieur(formation) : '');
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
        /* N'écrire que si la valeur existe laissait en place ce que contient la
           page — le nom, le lieu et le téléphone de Djibouti. Un pays sans
           paiement en espèces, comme les Comores aujourd'hui, les affichait
           donc quand même : un candidat serait venu payer à la mauvaise
           adresse. On masque la case plutôt que d'annoncer un lieu faux. */
        const set = (id, value) => poserCoordonnee(document.getElementById(id), value);
        set('cash-payment-name', cash?.recipient);
        set('cash-payment-place', cash?.place);
        set('cash-payment-phone', cash?.phone);
        document.querySelectorAll('.country-code').forEach(el => { el.textContent = currentCountryCode(); });
        renderPaymentMethods();

        /* Règle de saisie du numéro : elle suit le pays, pas un motif figé dans
           la page. La longueur maximale et l'exemple suivent aussi, sans quoi un
           numéro comorien serait tronqué par le gabarit djiboutien. */
        const pays = currentPays();
        const motif = phonePattern().source;
        document.querySelectorAll('#telephone, #tel-paiement').forEach(champ => {
            champ.pattern = motif;
            if (typeof pays?.longueurTelephone === 'number' && pays.longueurTelephone > 0) {
                champ.maxLength = pays.longueurTelephone;
            } else {
                champ.removeAttribute('maxlength');
            }
            champ.placeholder = pays?.exempleTelephone || 'Numéro local';
        });
        const aide = document.getElementById('telephone-help');
        if (aide) {
            aide.textContent = pays?.exempleTelephone
                ? `Format : ${pays.exempleTelephone}`
                : (pays?.aideTelephone || 'Numéro local, chiffres uniquement');
        }

        const summaryPrice = document.getElementById('selected-training-price');
        if (summaryPrice) summaryPrice.textContent = price;
    }

    /**
     * Sélecteur de pays (étape 1). Les options viennent des données, donc un pays
     * ajouté depuis le tableau de bord apparaît sans toucher au HTML. Avec un seul
     * pays desservi, le champ reste masqué : un choix unique n'est pas un choix.
     */
    function renderPaysSelector() {
        const groupe = document.getElementById('field-pays');
        const champ = document.getElementById('pays');
        if (!groupe || !champ || !common) return;

        const liste = common.paysDisponibles();
        const actif = currentPays();
        groupe.hidden = liste.length < 2;
        champ.disabled = liste.length < 2;

        const valeurs = liste.map(p => p.code).join('|');
        if (champ.dataset.pays !== valeurs) {
            champ.innerHTML = liste.map(p =>
                `<option value="${escapeHtml(p.code)}">${escapeHtml(p.nom)}</option>`).join('');
            champ.dataset.pays = valeurs;
        }
        if (actif) champ.value = actif.code;
    }

    /**
     * Cartes des moyens de paiement, propres au pays choisi.
     * Un pays dont les coordonnées ne sont pas encore saisies l'annonce
     * clairement : afficher celles d'un autre pays enverrait de l'argent au
     * mauvais endroit, ce qui est pire que ne rien afficher.
     */
    function renderPaymentMethods() {
        const grille = document.getElementById('paiement-cards');
        const avis = document.getElementById('paiement-indisponible');
        if (!grille) return;

        const methods = currentPaymentMethods();
        const pays = currentPays();
        const classes = 'paiement-card flex flex-col items-center justify-center gap-2 p-4 rounded-2xl '
            + 'border-2 border-[#CBFD00]/20 bg-[#0D1723]/40 hover:border-[#CBFD00]/40 hover:bg-primary/20 '
            + 'transition-all duration-200 cursor-pointer group';

        grille.innerHTML = methods.map(method => {
            const visuel = method.image
                ? `<img src="${escapeHtml(method.image)}" alt="${escapeHtml(method.label || method.value)}" class="h-10 sm:h-12 w-auto object-contain group-hover:scale-110 transition-transform">`
                : `<span class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors group-hover:scale-110"><span class="material-symbols-outlined text-blue-600 text-xl sm:text-2xl" style="font-variation-settings: 'FILL' 1;">${method.kind === 'cash' ? 'payments' : 'smartphone'}</span></span>`;
            return `<button type="button" class="${classes}" data-value="${escapeHtml(method.value)}">${visuel}`
                + `<span class="text-xs sm:text-sm font-bold text-[#FFFFFF] group-hover:text-primary text-center">${escapeHtml(method.label || method.value)}</span></button>`;
        }).join('');

        grille.hidden = !methods.length;
        if (avis) {
            avis.hidden = methods.length > 0;
            if (!methods.length) {
                avis.textContent = `Les moyens de paiement pour ${pays?.nom || 'ce pays'} ne sont pas encore `
                    + 'ouverts en ligne. Contactez-nous sur WhatsApp : nous convenons ensemble du règlement '
                    + 'et nous enregistrons votre inscription.';
            }
        }

        // La sélection en cours peut ne plus exister dans ce pays
        const choisi = paiementSelect?.value;
        if (choisi && !methods.some(method => method.value === choisi)) {
            paiementSelect.value = '';
            const telPaiement = document.getElementById('tel-paiement');
            if (telPaiement) telPaiement.value = '';
            handlePaymentChange();
        }
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

        /* Catalogue modifié depuis le tableau de bord : la fiche reprend le tarif,
           les intitulés et l'état d'inscription sans qu'il faille republier le site. */
        document.addEventListener('impactali:catalogue', () => {
            FORMATIONS = Array.isArray(window.FORMATIONS) ? window.FORMATIONS : FORMATIONS;
            SESSIONS = Array.isArray(window.SESSIONS) ? window.SESSIONS : SESSIONS;
            /* L'URL est relue : sur la page générique, la formation demandée peut
               n'exister que dans le catalogue qui vient d'arriver, donc être restée
               introuvable au premier rendu. */
            const params = new URLSearchParams(window.location.search);
            const demande = params.get('trainingId') || params.get('trainingSlug')
                || params.get('formationId') || params.get('formation');
            const parUrl = FORMATIONS.find(item => item.formId === demande || item.slug === demande);
            const deLaPage = PAGE_FORMATION_ID
                && FORMATIONS.find(item => item.formId === PAGE_FORMATION_ID || item.slug === PAGE_FORMATION_ID);
            const cible = deLaPage || parUrl || selectedFormation;
            setSelectedFormation(cible?.formId || PAGE_FORMATION_ID, false,
                params.get('sessionId') || undefined);
            initPlacesCounter();
        });

        /* Pays changé : tarif, devise, indicatif, format du numéro et moyens de
           paiement changent d'un coup. La session est recalculée, car une session
           qui se tient dans un autre pays n'est plus proposée ici. */
        document.addEventListener('impactali:pays', () => {
            setSelectedFormation(selectedFormation?.formId || PAGE_FORMATION_ID, true, undefined);
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

        /* ---- Choix du pays ----
           Premier champ du formulaire, parce qu'il commande tout le reste :
           tarif, devise, format du numéro et moyens de paiement. */
        const champPays = document.getElementById('pays');
        if (champPays && common) {
            champPays.addEventListener('change', () => {
                if (!common.choisirPays(champPays.value)) renderPaysSelector();
            });
        }

        /* ---- Moyens de paiement ----
           Les cartes sont reconstruites à chaque changement de pays : l'écoute se
           fait sur le conteneur, sinon les nouvelles cartes seraient inertes. */
        const grillePaiement = document.getElementById('paiement-cards');
        if (grillePaiement) {
            grillePaiement.addEventListener('click', event => {
                const card = event.target.closest('.paiement-card');
                if (!card || !grillePaiement.contains(card)) return;
                document.querySelectorAll('.paiement-card').forEach(c => {
                    c.classList.remove('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                });
                card.classList.add('!border-primary', '!bg-primary-fixed/30', 'ring-2', 'ring-primary/30', 'scale-[1.02]');
                document.getElementById('paiement').value = card.dataset.value;
                clearFieldError(document.getElementById('paiement'));
                handlePaymentChange();
            });
        }

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
            // Le caractère « mobile » vient des données du pays, pas d'une liste figée :
            // un moyen ajouté pour un nouveau pays doit être validé comme les autres.
            const paiementValue = paiementSelect.value;
            const choisi = currentPaymentMethods().find(method => method.value === paiementValue);
            if (choisi ? choisi.kind === 'mobile' : ['Waafi Mobile Money', 'Cacpay', 'D-Money'].includes(paiementValue)) {
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
            /* Sans moyen de paiement configuré pour le pays, réclamer un choix
               enverrait le candidat dans une impasse sans lui dire pourquoi. */
            'paiement': currentPaymentMethods().length
                ? 'Veuillez choisir un mode de paiement'
                : `Le règlement en ligne n’est pas encore ouvert pour ${currentPays()?.nom || 'ce pays'}. Écrivez-nous sur WhatsApp : nous convenons du paiement et enregistrons votre inscription.`,
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

            /* Ces cases portent, dans le HTML de la page, les coordonnées
               djiboutiennes. N'y écrire que si la valeur existe laissait donc
               s'afficher le numéro de Djibouti pour un moyen de paiement d'un
               autre pays qui n'en déclare pas : un candidat aurait payé sur le
               mauvais compte. On écrit toujours, et on masque la case quand il
               n'y a rien à dire, plutôt que d'annoncer un renseignement faux. */
            if (numLabel) numLabel.textContent = method?.numberLabel || 'Numéro';
            poserCoordonnee(numText, method?.number);
            poserCoordonnee(account, method?.accountName);
        } else if (method ? method.kind === 'cash' : value === 'Espèces') {
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

    /** Une coordonnée de paiement, ou rien du tout — jamais celle d'un autre pays. */
    function poserCoordonnee(el, valeur) {
        if (!el) return;
        const v = String(valeur || '').trim();
        el.textContent = v || '—';
        const boite = el.parentElement;
        if (boite) boite.style.display = v ? '' : 'none';
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
            { label: 'Pays', value: currentPays()?.nom || '—' },
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
            pays: currentPays()?.nom || '',
            paysCode: currentPays()?.code || '',
            countryCode: currentCountryCode(),
            telephoneInternational: `${currentCountryCode()}${data.telephone}`,
            dateInscription: now.toISOString(),
            pageUrl: window.location.href.split('?')[0]
        };

        try {
            // L'animation tourne au moins 2 secondes, même si la réponse arrive plus tôt
            const dureeMinimale = new Promise(resolve => setTimeout(resolve, 2000));
            await Promise.all([envoyerInscription(payload), dureeMinimale]);

            if (hamsterOverlay) hamsterOverlay.classList.add('hidden');
            masquerEchecEnvoi();
            showSuccessScreen();
            clearSavedData();
        } catch (error) {
            console.error('Erreur soumission:', error);
            if (hamsterOverlay) hamsterOverlay.classList.add('hidden');
            if (formContainer) formContainer.classList.remove('hidden');
            if (mobileProgress) mobileProgress.classList.remove('hidden');
            btnSubmit.disabled = false;
            // Le brouillon est volontairement conservé : la personne ne doit rien resaisir
            afficherEchecEnvoi(error);
        }
    }

    /**
     * Envoie l'inscription et attend la confirmation du serveur.
     * Le corps part en `text/plain` : c'est une requête simple, donc sans requête
     * préalable — Google Apps Script ne sait pas traiter celle-ci, et c'est
     * précisément ce qui imposait autrefois `no-cors`, mode où la réponse est
     * illisible. Ici la réponse est lue : un échec est un échec, jamais un succès.
     * @returns {Promise<Object>} la réponse du serveur si, et seulement si, elle confirme.
     */
    function envoyerInscription(payload) {
        if (!GOOGLE_SHEETS_URL) {
            return Promise.reject(new Error('Aucune adresse d’envoi n’est configurée.'));
        }

        const expiration = new Promise((_, rejeter) =>
            setTimeout(() => rejeter(new Error('Le serveur met trop de temps à répondre.')), 25000));

        const envoi = fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }).then(reponse => {
            if (!reponse.ok) throw new Error(`Le serveur a répondu ${reponse.status}.`);
            return reponse.text();
        }).then(texte => {
            let donnees;
            try { donnees = JSON.parse(texte); }
            catch (e) { throw new Error('Réponse inattendue du serveur.'); }
            if (!donnees || donnees.ok !== true) {
                throw new Error(donnees && donnees.erreur ? String(donnees.erreur) : 'Le serveur a refusé l’inscription.');
            }
            return donnees;
        });

        return Promise.race([envoi, expiration]);
    }

    /** Traduit les échecs techniques du navigateur en une phrase compréhensible. */
    function messageLisible(error) {
        const brut = error && error.message ? String(error.message) : '';
        if (!brut) return 'Erreur inconnue.';
        if (/failed to fetch|networkerror|load failed/i.test(brut)) {
            return 'La connexion au serveur n’a pas abouti.';
        }
        return brut.endsWith('.') ? brut : brut + '.';
    }

    /** Dit clairement que l'envoi a échoué, plutôt que d'annoncer une réussite fausse. */
    function afficherEchecEnvoi(error) {
        const bloc = document.getElementById('submit-error');
        if (!bloc) return;
        const formation = selectedFormation?.title || '';
        const message = `Bonjour, je viens de remplir le formulaire d’inscription à la formation ${formation} `
            + `mais l’envoi a échoué. Voici mes informations : ${document.getElementById('prenom')?.value || ''} `
            + `${document.getElementById('nom')?.value || ''}.`;
        const lienWhatsapp = common ? common.whatsappUrl(message) : '#';

        bloc.innerHTML = `
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            <div>
                <strong>Votre inscription n’a pas pu être envoyée.</strong>
                <p>${escapeHtml(messageLisible(error))}
                   Vos réponses sont conservées sur cet appareil : vérifiez votre connexion et réessayez.
                   Si le problème persiste, envoyez-nous directement un message.</p>
                <a class="button button--secondary" href="${escapeHtml(lienWhatsapp)}" target="_blank" rel="noopener noreferrer">
                    Nous écrire sur WhatsApp<span class="material-symbols-outlined" aria-hidden="true">chat</span></a>
            </div>`;
        bloc.hidden = false;
        bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function masquerEchecEnvoi() {
        const bloc = document.getElementById('submit-error');
        if (bloc) bloc.hidden = true;
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
🌍 Pays : ${currentPays()?.nom || '—'}
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

/* =========================================
   LANDING — catalogue (carrousel), fiche rapide, sessions, portfolio
   Chargé uniquement sur la page d'accueil, après site-common.js.
   ========================================= */
(function () {
    'use strict';

    /**
     * Les formations à montrer sur l'accueil.
     *
     * Décocher « Visible sur le site » ne retirait la formation de rien : ni du
     * catalogue, ni du carrousel, ni des filtres par domaine. Le serveur renvoie
     * bien tout — le tableau de bord a besoin de voir les fiches masquées — mais
     * c'est au site de trier. La fiche, elle, reste servie : elle y annonce
     * d'elle-même que les inscriptions sont fermées.
     */
    const visibles = liste => (Array.isArray(liste) ? liste : []).filter(f => f && f.active !== false);

    /* Réassignable : le catalogue peut être rechargé depuis l'API après une
       modification faite dans le tableau de bord. */
    let FORMATIONS = visibles(window.FORMATIONS);
    /* Réassignable : les réalisations se modifient depuis le tableau de bord. */
    let PORTFOLIO = Array.isArray(window.PORTFOLIO) ? window.PORTFOLIO : [];
    const common = window.SiteCommon;
    if (!common) return;
    const { escapeHtml, formatSessionDate, findFormation, upcomingSessions, prixDe, formatPrixDe } = common;

    /** Lien d'inscription : page dédiée quand elle existe, sinon fiche rapide. */
    function registrationHref(formation, sessionId) {
        if (!formation) return '/#catalogue';
        if (!formation.hasDetailPage) return formation.href;
        const params = new URLSearchParams({ trainingId: formation.formId, trainingSlug: formation.slug });
        if (sessionId) params.set('sessionId', sessionId);
        return `${formation.href}?${params.toString()}#inscription`;
    }

    // ---------- Composant « course-card » (variantes : default, featured, dark, compact) ----------
    const UNCONFIRMED = /^à confirmer$/i;
    const isKnown = value => typeof value === 'string' && value.trim() !== '' && !UNCONFIRMED.test(value.trim());

    /** Badges uniquement à partir de données réelles (aucune mention marketing inventée). */
    function cardBadges(formation) {
        const badges = [];
        const { state, session } = common.sessionState(formation.formId);
        if (state === 'open') badges.push({ label: 'Inscriptions ouvertes', tone: 'accent' });
        else if (state === 'full') badges.push({ label: 'Session complète', tone: 'alert' });
        else if (state === 'closed') badges.push({ label: 'Inscriptions fermées', tone: 'muted' });
        else badges.push({ label: 'Programme en préparation', tone: 'muted' });
        if (session && typeof session.placesAvailable === 'number' && session.placesAvailable > 0 && session.placesAvailable <= 5) {
            badges.push({ label: 'Places limitées', tone: 'alert' });
        }
        return badges.map(badge => `<span class="badge badge--${badge.tone}">${escapeHtml(badge.label)}</span>`).join('');
    }

    /** Métadonnées confirmées uniquement ; repli sobre si rien n'est encore défini. */
    function cardMeta(formation) {
        const items = [];
        if (isKnown(formation.duration)) items.push(['schedule', formation.duration]);
        if (typeof formation.modules === 'number') items.push(['view_module', `${formation.modules} modules`]);
        if (isKnown(formation.level)) items.push(['signal_cellular_alt', formation.level]);
        if (isKnown(formation.mode)) items.push(['co_present', formation.mode]);
        if (!items.length) items.push(['pending', 'Durée, niveau et format à annoncer']);
        return `<ul class="course-card__meta" aria-label="Informations pratiques">${items.map(([icon, label]) =>
            `<li><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${escapeHtml(label)}</li>`).join('')}</ul>`;
    }

    function cardLearnings(formation) {
        const learnings = Array.isArray(formation.learnings) ? formation.learnings.slice(0, 3) : [];
        if (!learnings.length) return '';
        return `<div class="course-card__learn"><strong>Vous apprendrez</strong><ul>${learnings.map(item =>
            `<li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
    }

    /**
     * @param {Formation} formation
     * @param {{variant?: 'default'|'featured'|'dark'|'compact', accessible?: boolean, extraClass?: string}} options
     */
    function renderCourseCard(formation, options = {}) {
        const variant = options.variant || 'default';
        const accessible = options.accessible !== false;
        const showLearnings = variant === 'default' || variant === 'featured';
        /* La catégorie n'est pas un champ obligatoire du tableau de bord. Une
           formation créée sans catégorie NI promesse NI description faisait ici
           « null.toLowerCase() » : le rendu du catalogue s'interrompait, et
           l'accueil restait figé sur les données précédentes, sans rien dire.
           Faute de catégorie, on se passe simplement de la nommer. */
        const promise = isKnown(formation.promise) ? formation.promise
            : (isKnown(formation.shortDescription) ? formation.shortDescription
                : (isKnown(formation.category)
                    ? `Une formation ${formation.category.toLowerCase()} orientée pratique.`
                    : 'Une formation orientée pratique.'));
        const ctaLabel = formation.hasDetailPage ? 'Voir la formation' : 'Découvrir la formation';
        const focusAttrs = accessible ? '' : 'tabindex="-1" aria-hidden="true"';
        const link = formation.hasDetailPage
            ? `<a class="course-card__link" href="${escapeHtml(formation.href)}" aria-label="${escapeHtml(ctaLabel)} ${escapeHtml(formation.title)}" ${focusAttrs}></a>`
            : `<button class="course-card__link" type="button" data-open-training="${escapeHtml(formation.slug)}" aria-label="${escapeHtml(ctaLabel)} ${escapeHtml(formation.title)}" ${focusAttrs}></button>`;
        const classes = ['course-card', `course-card--${variant}`, formation.featured && variant !== 'dark' ? 'course-card--featured' : '', options.extraClass || '']
            .filter(Boolean).join(' ');

        return `<article class="${classes}" data-training-slug="${escapeHtml(formation.slug)}" data-family="${escapeHtml(formation.family || '')}">
            <div class="course-card__media">
                <img src="${escapeHtml(formation.image)}" alt="${escapeHtml(formation.imageAlt || '')}" loading="lazy" decoding="async" width="760" height="950">
                <div class="course-card__badges">${cardBadges(formation)}</div>
            </div>
            <div class="course-card__body">
                <span class="course-card__category">${escapeHtml(formation.category || '')}</span>
                <h3 class="course-card__title">${escapeHtml(formation.title)}</h3>
                <p class="course-card__promise">${escapeHtml(promise)}</p>
                ${cardMeta(formation)}
                ${showLearnings ? cardLearnings(formation) : ''}
                <div class="course-card__footer">
                    <span class="course-card__cta">${escapeHtml(ctaLabel)}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span>
                </div>
            </div>
            ${link}
        </article>`;
    }

    // ---------- Domaines : familles réelles du catalogue, avec le nombre de formations ----------
    const ICONES_DOMAINE = {
        'Design & Contenu': 'palette',
        'Communication': 'campaign',
        'Photo & Vidéo': 'photo_camera',
        'Marketing': 'trending_up',
        'Intelligence artificielle': 'smart_toy'
    };

    function familles() {
        const compte = new Map();
        for (const formation of FORMATIONS) {
            if (!formation.family) continue;
            compte.set(formation.family, (compte.get(formation.family) || 0) + 1);
        }
        return [...compte.entries()].map(([nom, total]) => ({ nom, total }));
    }

    /** Applique le filtre du catalogue correspondant au domaine, puis y amène. */
    function ouvrirDomaine(nom, defiler) {
        const chip = document.querySelector(`.filter-chip[data-family="${CSS.escape(nom)}"]`);
        if (chip) chip.click();
        if (defiler) document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderDomains() {
        const grille = document.getElementById('domains-grid');
        const pied = document.getElementById('pied-domaines-liens');
        const liste = familles();
        if (!liste.length) return;

        if (grille) {
            grille.innerHTML = liste.map(({ nom, total }) => `<li class="domain-card">
                <span class="domain-card__icon material-symbols-outlined" aria-hidden="true">${ICONES_DOMAINE[nom] || 'school'}</span>
                <h3>${escapeHtml(nom)}</h3>
                <p>${total} formation${total > 1 ? 's' : ''}</p>
                <button class="domain-card__link" type="button" data-domain="${escapeHtml(nom)}">
                    <span class="visually-hidden">Voir les formations du domaine ${escapeHtml(nom)}</span>
                </button>
            </li>`).join('');

            grille.addEventListener('click', event => {
                const bouton = event.target.closest('[data-domain]');
                if (bouton) ouvrirDomaine(bouton.dataset.domain, true);
            });
        }

        if (pied) {
            pied.innerHTML = liste.map(({ nom }) =>
                `<a href="#catalogue" data-domain-link="${escapeHtml(nom)}">${escapeHtml(nom)}</a>`).join('');
            pied.addEventListener('click', event => {
                const lien = event.target.closest('[data-domain-link]');
                if (lien) ouvrirDomaine(lien.dataset.domainLink, false);
            });
        }
    }

    // ---------- Grille catalogue + filtres par domaine (générés depuis les données) ----------
    function renderCatalogueGrid() {
        const grid = document.getElementById('catalogue-grid');
        const filters = document.getElementById('catalogue-filters');
        const live = document.getElementById('catalogue-grid-live');
        if (!grid || !FORMATIONS.length) return;

        grid.innerHTML = FORMATIONS.map(formation =>
            renderCourseCard(formation, { variant: formation.featured ? 'featured' : 'default', extraClass: 'reveal-on-scroll' })).join('');

        if (!filters) return;
        const families = ['Toutes', ...FORMATIONS.map(item => item.family).filter((value, index, all) => value && all.indexOf(value) === index)];
        filters.innerHTML = families.map((family, index) =>
            `<button class="filter-chip" type="button" data-family="${escapeHtml(family)}" aria-pressed="${index === 0}">${escapeHtml(family)}</button>`).join('');

        filters.addEventListener('click', event => {
            const chip = event.target.closest('.filter-chip');
            if (!chip) return;
            const family = chip.dataset.family;
            filters.querySelectorAll('.filter-chip').forEach(item => item.setAttribute('aria-pressed', String(item === chip)));
            let visible = 0;
            grid.querySelectorAll('.course-card').forEach(card => {
                const match = family === 'Toutes' || card.dataset.family === family;
                card.classList.toggle('is-hidden', !match);
                if (match) { visible += 1; card.classList.add('is-visible'); }
            });
            if (live) live.textContent = `${visible} formation${visible > 1 ? 's' : ''} affichée${visible > 1 ? 's' : ''}${family === 'Toutes' ? '' : ` dans ${family}`}`;
        });
    }

    // ---------- Carrousel infini, accessible, sans dépendance ----------
    /** Carrousel en cours d'exécution, pour pouvoir l'arrêter avant reconstruction. */
    let carrouselActif = null;

    /**
     * « American corner · Présentiel » — pour le PAYS du visiteur.
     *
     * La carte annonçait `session.location` et `session.mode` bruts. Une même
     * session se tient en présentiel ici et en ligne ailleurs : un candidat
     * comorien lisait donc l'adresse djiboutienne, alors que la fiche, elle,
     * avait déjà été corrigée. Sans lieu connu, on n'écrit que le mode — et
     * jamais un séparateur tout seul.
     */
    function lieuEtMode(session) {
        const code = common.paysActif?.()?.code;
        const lieu = common.lieuDeSession ? common.lieuDeSession(session, code) : (session.location || '');
        const mode = common.modeDeSession ? common.modeDeSession(session, code) : (session.mode || '');
        return [lieu, mode].map(v => String(v || '').trim()).filter(Boolean).join(' · ');
    }

    /**
     * Le contenu des cartes du carrousel, sans rien construire d'autre.
     *
     * Il sert deux fois : à remplir la piste, et à savoir si elle a changé. Le
     * carrousel n'était reconstruit que si la LISTE des formations changeait —
     * un titre, une promesse, une photo ou un badge corrigés dans le tableau de
     * bord restaient donc ceux du dernier déploiement, sur le premier bloc que
     * voit un visiteur.
     */
    function contenuDuCarrousel() {
        return [0, 1, 2]
            .map(copyIndex => FORMATIONS.map(formation => renderCourseCard(formation,
                { variant: 'dark', accessible: copyIndex === 1, extraClass: 'training-card' })).join(''))
            .join('');
    }

    function initTrainingCarousel() {
        // Un carrousel déjà en marche est arrêté net : sinon ses minuteurs et ses
        // écouteurs continueraient de piloter des cartes remplacées.
        if (carrouselActif) { carrouselActif.detruire(); carrouselActif = null; }

        const carousel = document.getElementById('training-carousel');
        const viewport = carousel?.querySelector('.carousel-viewport');
        const track = document.getElementById('carousel-track');
        const dots = document.getElementById('carousel-dots');
        if (!carousel || !viewport || !track || !dots || !FORMATIONS.length) return;

        const controleur = new AbortController();
        const signal = controleur.signal;

        track.innerHTML = contenuDuCarrousel();
        dots.innerHTML = FORMATIONS.map((formation, index) =>
            `<button class="carousel-dot${index === 0 ? ' is-active' : ''}" type="button" data-carousel-dot="${index}"
                aria-label="Afficher ${escapeHtml(formation.title)}"${index === 0 ? ' aria-current="true"' : ''}></button>`
        ).join('');

        const cards = Array.from(track.querySelectorAll('.training-card'));
        const dotButtons = Array.from(dots.querySelectorAll('.carousel-dot'));
        const liveRegion = document.getElementById('carousel-live');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const AUTOPLAY_MS = 3500;
        const TRANSITION_MS = 650;
        const state = {
            index: FORMATIONS.length,
            timer: null,
            restartTimer: null,
            settleTimer: null,
            pointerStartX: null,
            pointerMoved: false,
            paused: new Set()
        };

        const logicalIndex = () => ((state.index % FORMATIONS.length) + FORMATIONS.length) % FORMATIONS.length;

        const updateActiveState = () => {
            cards.forEach((card, index) => {
                const distance = index - state.index;
                card.classList.toggle('is-active', distance === 0);
                card.style.setProperty('--d', String(distance));
                card.style.setProperty('--d-abs', String(Math.min(Math.abs(distance), 4)));
            });
            dotButtons.forEach((dot, index) => {
                const active = index === logicalIndex();
                dot.classList.toggle('is-active', active);
                if (active) dot.setAttribute('aria-current', 'true');
                else dot.removeAttribute('aria-current');
            });
            const current = FORMATIONS[logicalIndex()];
            if (liveRegion && current) {
                liveRegion.textContent = `Formation ${logicalIndex() + 1} sur ${FORMATIONS.length} : ${current.title}`;
            }
        };

        const positionTrack = (animate = true, dragDelta = 0) => {
            const activeCard = cards[state.index];
            if (!activeCard) return;
            const gap = parseFloat(getComputedStyle(track).gap) || 0;
            const cardWidth = activeCard.offsetWidth;
            const step = cardWidth + gap;
            const offset = (viewport.clientWidth / 2) - (cardWidth / 2) - (state.index * step);
            track.style.transitionDuration = animate && !reducedMotion.matches ? `${TRANSITION_MS}ms` : '1ms';
            track.style.transform = `translate3d(${offset + dragDelta}px, 0, 0)`;
            updateActiveState();
        };

        const stopAuto = () => {
            window.clearInterval(state.timer);
            state.timer = null;
        };

        const startAuto = () => {
            stopAuto();
            if (reducedMotion.matches || state.paused.size || document.hidden) return;
            state.timer = window.setInterval(() => goTo(state.index + 1), AUTOPLAY_MS);
        };

        const setPaused = (reason, paused, delayedResume = false) => {
            window.clearTimeout(state.restartTimer);
            if (paused) state.paused.add(reason);
            else state.paused.delete(reason);
            stopAuto();
            if (paused) return;
            if (delayedResume) state.restartTimer = window.setTimeout(startAuto, 1200);
            else startAuto();
        };

        // Boucle infinie : on recale silencieusement sur la copie centrale (idempotent)
        const settle = () => {
            window.clearTimeout(state.settleTimer);
            if (state.index >= FORMATIONS.length && state.index < FORMATIONS.length * 2) return;
            state.index = FORMATIONS.length + ((state.index % FORMATIONS.length) + FORMATIONS.length) % FORMATIONS.length;
            positionTrack(false);
        };

        const goTo = targetIndex => {
            // Si la position précédente n'a pas encore été recalée, on la recale d'abord sans animation
            const before = state.index;
            settle();
            const shift = state.index - before;
            state.index = Math.max(FORMATIONS.length - 1, Math.min(FORMATIONS.length * 2, targetIndex + shift));
            positionTrack(true);
            stopAuto();
            window.clearTimeout(state.restartTimer);
            window.clearTimeout(state.settleTimer);
            // Filet de sécurité si transitionend ne se déclenche pas (onglet en arrière-plan, reduced motion)
            state.settleTimer = window.setTimeout(settle, TRANSITION_MS + 80);
            if (!state.paused.size) state.restartTimer = window.setTimeout(startAuto, 1200);
        };

        track.addEventListener('transitionend', event => {
            if (event.propertyName !== 'transform' || event.target !== track) return;
            settle();
        }, { signal });

        carousel.querySelector('[data-carousel-prev]').addEventListener('click', () => goTo(state.index - 1), { signal });
        carousel.querySelector('[data-carousel-next]').addEventListener('click', () => goTo(state.index + 1), { signal });
        dotButtons.forEach(dot => dot.addEventListener('click', () => goTo(FORMATIONS.length + Number(dot.dataset.carouselDot)), { signal }));

        carousel.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(state.index - 1); }
            else if (event.key === 'ArrowRight') { event.preventDefault(); goTo(state.index + 1); }
            else if (event.key === 'Home') { event.preventDefault(); goTo(FORMATIONS.length); }
            else if (event.key === 'End') { event.preventDefault(); goTo(FORMATIONS.length * 2 - 1); }
        }, { signal });

        carousel.addEventListener('mouseenter', () => setPaused('hover', true), { signal });
        carousel.addEventListener('mouseleave', () => setPaused('hover', false, true), { signal });
        carousel.addEventListener('focusin', () => setPaused('focus', true), { signal });
        carousel.addEventListener('focusout', event => {
            if (!carousel.contains(event.relatedTarget)) setPaused('focus', false, true);
        }, { signal });

        viewport.addEventListener('pointerdown', event => {
            state.pointerStartX = event.clientX;
            state.pointerMoved = false;
            setPaused('pointer', true);
        }, { signal });
        viewport.addEventListener('pointermove', event => {
            if (state.pointerStartX === null) return;
            const delta = event.clientX - state.pointerStartX;
            if (Math.abs(delta) > 6) state.pointerMoved = true;
            if (state.pointerMoved) positionTrack(false, delta);
        }, { signal });
        const finishPointer = event => {
            if (state.pointerStartX === null) return;
            const delta = event.clientX - state.pointerStartX;
            state.pointerStartX = null;
            if (Math.abs(delta) > 42) goTo(state.index + (delta < 0 ? 1 : -1));
            else positionTrack(true);
            setPaused('pointer', false, true);
        };
        viewport.addEventListener('pointerup', finishPointer, { signal });
        viewport.addEventListener('pointerleave', finishPointer, { signal });
        viewport.addEventListener('pointercancel', () => {
            state.pointerStartX = null;
            positionTrack(true);
            setPaused('pointer', false, true);
        }, { signal });
        // Un glissement ne doit pas déclencher l'ouverture de la carte
        track.addEventListener('click', event => {
            if (state.pointerMoved) { event.preventDefault(); event.stopPropagation(); state.pointerMoved = false; }
        }, { signal, capture: true });

        document.addEventListener('visibilitychange', () => setPaused('hidden', document.hidden), { signal });
        reducedMotion.addEventListener?.('change', startAuto, { signal });
        window.addEventListener('resize', () => window.requestAnimationFrame(() => positionTrack(false)), { signal, passive: true });

        carrouselActif = {
            detruire() {
                controleur.abort();
                stopAuto();
                window.clearTimeout(state.restartTimer);
                window.clearTimeout(state.settleTimer);
            }
        };

        const boot = () => { positionTrack(false); startAuto(); };
        window.requestAnimationFrame(boot);
        // Onglet ouvert en arrière-plan : requestAnimationFrame attend l'affichage, on positionne quand même
        window.setTimeout(boot, 120);
    }

    // ---------- Fiche rapide (formations sans page dédiée) ----------
    function openTrainingDialog(slug) {
        const formation = findFormation(slug);
        const dialog = document.getElementById('training-dialog');
        if (!formation || !dialog) return;

        const image = document.getElementById('training-dialog-image');
        image.src = formation.image;
        image.alt = formation.imageAlt || '';
        const registration = common.sessionState(formation.formId);
        dialog.classList.toggle('is-open-registration', registration.state === 'open');

        const mediaCategory = document.getElementById('training-dialog-media-category');
        const mediaPromise = document.getElementById('training-dialog-media-promise');
        if (mediaCategory) mediaCategory.textContent = formation.category || '';
        if (mediaPromise) mediaPromise.textContent = formation.promise || '';
        document.getElementById('training-dialog-category').textContent = formation.category || '';
        document.getElementById('training-dialog-title').textContent = formation.title;
        document.getElementById('training-dialog-description').textContent = formation.shortDescription;

        // Informations pratiques : uniquement les valeurs confirmées
        const facts = [];
        if (isKnown(formation.duration)) facts.push(['schedule', 'Durée', formation.duration]);
        if (typeof formation.modules === 'number') facts.push(['view_module', 'Programme', `${formation.modules} modules`]);
        if (isKnown(formation.level)) facts.push(['signal_cellular_alt', 'Niveau', formation.level]);
        if (isKnown(formation.mode)) facts.push(['co_present', 'Mode', formation.mode]);
        if (typeof prixDe(formation) === 'number') facts.push(['payments', 'Tarif', formatPrixDe(formation)]);
        const session = upcomingSessions().find(item => item.formId === formation.formId);
        if (session) facts.push(['event', 'Prochaine session', formatSessionDate(session.startDate)]);
        if (session && typeof session.placesAvailable === 'number') facts.push(['group', 'Places', `${session.placesAvailable} disponibles`]);

        const meta = document.getElementById('training-dialog-meta');
        meta.hidden = !facts.length;
        meta.innerHTML = facts.map(([icon, label, value]) =>
            `<div><dt><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

        // Ce que vous obtenez : acquis du programme s'ils existent, sinon les engagements communs à toutes les formations
        const learnings = Array.isArray(formation.learnings) && formation.learnings.length
            ? formation.learnings.slice(0, 3)
            : ['Une formation 100 % pratique, sur des projets concrets', 'Un portfolio de réalisations à présenter', 'Un certificat de formation à l’issue du parcours'];
        const includes = document.getElementById('training-dialog-includes');
        if (includes) {
            includes.querySelector('h3').textContent = formation.learnings?.length ? 'Ce que vous allez apprendre' : 'Ce que comprend la formation';
            includes.querySelector('ul').innerHTML = learnings.map(item =>
                `<li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>${escapeHtml(item)}</li>`).join('');
        }

        const pending = document.getElementById('training-dialog-pending');
        if (pending) pending.hidden = registration.state === 'open';

        const actions = document.getElementById('training-dialog-actions');
        const askMessage = `Bonjour, je souhaite être informé(e) de la prochaine session de la formation « ${formation.title} ».`;
        const questionMessage = `Bonjour, j’ai une question concernant la formation « ${formation.title} ».`;
        actions.innerHTML = registration.state === 'open'
            ? `<a class="button button--primary" href="${escapeHtml(registrationHref(formation, registration.session?.id))}">S’inscrire à cette formation<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>
               ${formation.hasDetailPage
                   ? `<a class="button button--secondary" href="${escapeHtml(formation.href)}">Voir la fiche formation</a>`
                   : `<a class="button button--secondary" href="${escapeHtml(common.whatsappUrl(questionMessage))}" target="_blank" rel="noopener noreferrer">Poser une question<span class="material-symbols-outlined" aria-hidden="true">chat</span></a>`}`
            : `<a class="button button--primary" href="${escapeHtml(common.whatsappUrl(askMessage))}" target="_blank" rel="noopener noreferrer">Être informé(e) de l’ouverture<span class="material-symbols-outlined" aria-hidden="true">notifications</span></a>
               <button class="button button--secondary" type="button" data-dialog-close data-scroll-to="#catalogue">Voir les autres formations</button>`;

        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function initTrainingDialog() {
        const dialog = document.getElementById('training-dialog');
        if (!dialog) return;

        document.addEventListener('click', event => {
            const trigger = event.target.closest('[data-open-training]');
            if (trigger) openTrainingDialog(trigger.dataset.openTraining);
        });

        dialog.addEventListener('click', event => {
            const closer = event.target.closest('[data-dialog-close]');
            if (!closer) return;
            dialog.close();
            const target = closer.dataset.scrollTo && document.querySelector(closer.dataset.scrollTo);
            if (target) window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        });
        dialog.addEventListener('click', event => {
            const rect = dialog.getBoundingClientRect();
            const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
            if (outside) dialog.close();
        });

        // Lien profond : /?fiche=slug ouvre l'aperçu rapide.
        // Toutes les formations ont désormais une page dédiée, mais les anciens liens
        // partagés utilisent encore ce paramètre : ils doivent continuer à fonctionner.
        const requested = new URLSearchParams(window.location.search).get('fiche');
        const formation = findFormation(requested);
        if (formation) openTrainingDialog(formation.slug);
    }

    // ---------- Prochaines sessions (données centralisées, jamais inventées) ----------
    function renderSessions() {
        const list = document.getElementById('sessions-list');
        const empty = document.getElementById('sessions-empty');
        if (!list || !empty) return;

        const sessions = upcomingSessions();
        if (!sessions.length) {
            list.hidden = true;
            empty.hidden = false;
            return;
        }

        empty.hidden = true;
        list.hidden = false;
        list.innerHTML = sessions.map(session => {
            const formation = findFormation(session.formId);
            const title = formation ? formation.title : session.formId;
            const places = session.placesAvailable === null || session.placesAvailable === undefined
                ? 'Places : à confirmer'
                : `${session.placesAvailable} place${session.placesAvailable > 1 ? 's' : ''} disponible${session.placesAvailable > 1 ? 's' : ''}${session.placesTotal ? ` sur ${session.placesTotal}` : ''}`;
            const sessionStatus = formation ? common.sessionState(formation.formId, session.id).state : 'invalid';
            const status = sessionStatus === 'open' ? 'Inscriptions ouvertes' : sessionStatus === 'full' ? 'Session complète' : 'Inscriptions fermées';
            const cta = sessionStatus === 'open' && formation
                ? `<a class="button button--primary" href="${escapeHtml(registrationHref(formation, session.id))}">Choisir cette session<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>`
                : `<span class="session-card__closed">Session complète ou fermée</span>`;
            return `<article class="session-card">
                <div class="session-card__date">
                    <span class="session-card__day">${escapeHtml(new Date(`${session.startDate}T12:00:00`).getDate())}</span>
                    <span class="session-card__month">${escapeHtml(new Date(`${session.startDate}T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }))}</span>
                </div>
                <div class="session-card__body">
                    <span class="session-card__status${sessionStatus === 'open' ? ' is-open' : ''}">${status}</span>
                    <h3>${escapeHtml(title)}</h3>
                    <ul class="session-card__meta">
                        <li><span class="material-symbols-outlined" aria-hidden="true">event</span>Début le ${escapeHtml(formatSessionDate(session.startDate))}${session.endDate ? ` · fin le ${escapeHtml(formatSessionDate(session.endDate))}` : ''}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${escapeHtml(session.schedule)}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">timelapse</span>${escapeHtml(session.duration)}</li>
                        ${lieuEtMode(session) ? `<li><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${escapeHtml(lieuEtMode(session))}</li>` : ''}
                        <li><span class="material-symbols-outlined" aria-hidden="true">payments</span>${escapeHtml(formatPrixDe(session))}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">group</span>${escapeHtml(places)}</li>
                    </ul>
                </div>
                <div class="session-card__action">${cta}</div>
            </article>`;
        }).join('');
    }

    // ---------- Portfolio ----------
    /**
     * Identifiant d'une vidéo YouTube, quelle que soit la forme du lien collé :
     * watch?v=, youtu.be/, /embed/, /shorts/. Une adresse qu'on ne reconnaît pas
     * ne devient pas une vidéo — mieux vaut pas de lecteur qu'un lecteur vide.
     */
    function identifiantYoutube(url) {
        const t = String(url || '').trim();
        if (!t) return null;
        const m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
            || t.match(/^([A-Za-z0-9_-]{11})$/);
        return m ? m[1] : null;
    }

    function renderPortfolio() {
        const grid = document.getElementById('portfolio-grid');
        if (!grid || !PORTFOLIO.length) return;

        grid.innerHTML = PORTFOLIO.map((item, i) => {
            const video = identifiantYoutube(item.video);
            /* Miniature : celle qu'on a téléversée, sinon celle de YouTube.
               Rien n'est chargé chez YouTube tant qu'on n'a pas cliqué : le
               lecteur n'apparaît qu'à la demande, sans cookie au passage. */
            const visuel = item.image || (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : '');
            const media = !visuel
                ? `<div class="portfolio-card__placeholder" aria-hidden="true"><span class="material-symbols-outlined">add_photo_alternate</span><span>Visuel à fournir</span></div>`
                : `<img src="${escapeHtml(visuel)}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="lazy" decoding="async" style="object-position:${escapeHtml(item.imagePosition || '50% 50%')}">`;

            const inner = `${media}
                ${video ? '<span class="portfolio-card__lecture" aria-hidden="true"><span class="material-symbols-outlined">play_arrow</span></span>' : ''}
                <div class="portfolio-card__content">
                    <span class="portfolio-card__category">${escapeHtml(item.category)}</span>
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.description)}</p>
                </div>`;

            const classes = ['portfolio-card'];
            if (!visuel) classes.push('is-placeholder');
            if (video) classes.push('has-video');

            /* Un visuel ou une vidéo s'ouvre en grand : c'est un bouton, pas un
               lien, pour que le clavier et les lecteurs d'écran le comprennent.
               Un lien externe déclaré l'emporte : il mène au projet publié. */
            if (item.href && !video) {
                return `<a class="${classes.join(' ')}" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
            }
            if (!visuel) return `<article class="${classes.join(' ')}">${inner}</article>`;
            return `<button type="button" class="${classes.join(' ')}" data-realisation="${i}"
                aria-label="${escapeHtml((video ? 'Lire la vidéo : ' : 'Voir en grand : ') + item.title)}">${inner}</button>`;
        }).join('');

        grid.querySelectorAll('[data-realisation]').forEach(carte => {
            carte.addEventListener('click', () => ouvrirRealisation(PORTFOLIO[Number(carte.dataset.realisation)]));
        });
    }

    /* ---------- Affichage en grand ----------
       Sur mobile, un survol n'existe pas : le clic ouvre l'affiche en entier.
       Sur ordinateur, le survol la montre déjà dans la carte (voir style.css) ;
       le clic reste utile pour la voir en pleine taille, et pour les vidéos. */
    let fermerVisionneuse = null;

    function ouvrirRealisation(item) {
        if (!item) return;
        if (fermerVisionneuse) fermerVisionneuse();

        const video = identifiantYoutube(item.video);
        const boite = document.createElement('div');
        boite.className = 'visionneuse';
        boite.innerHTML = `
            <div class="visionneuse__fond" data-fermer></div>
            <div class="visionneuse__boite" role="dialog" aria-modal="true" aria-label="${escapeHtml(item.title)}">
                <button type="button" class="visionneuse__fermer" data-fermer aria-label="Fermer">
                    <span class="material-symbols-outlined" aria-hidden="true">close</span></button>
                ${video
                ? `<div class="visionneuse__video"><iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(video)}?autoplay=1&rel=0"
                        title="${escapeHtml(item.title)}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`
                : `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.title)}">`}
                <p class="visionneuse__legende"><strong>${escapeHtml(item.title)}</strong>${item.description ? ` — ${escapeHtml(item.description)}` : ''}</p>
            </div>`;
        document.body.appendChild(boite);
        document.body.style.overflow = 'hidden';

        const auClavier = event => { if (event.key === 'Escape') fermerVisionneuse(); };
        fermerVisionneuse = () => {
            document.removeEventListener('keydown', auClavier);
            boite.remove();
            document.body.style.overflow = '';
            fermerVisionneuse = null;
        };
        boite.querySelectorAll('[data-fermer]').forEach(el => el.addEventListener('click', fermerVisionneuse));
        document.addEventListener('keydown', auClavier);
        boite.querySelector('.visionneuse__fermer').focus();
    }

    document.addEventListener('DOMContentLoaded', () => {
        /* LES DONNÉES SONT RELUES AVANT LE PREMIER RENDU. `FORMATIONS` a été lu
           à l'analyse du script, donc avant que site-common.js n'ait posé le
           catalogue mémorisé — son propre DOMContentLoaded est enregistré avant
           celui-ci. La page affichait donc l'ancienne version, puis la vraie :
           une photo et un badge qui changent sous les yeux à chaque visite. */
        FORMATIONS = visibles(window.FORMATIONS);
        PORTFOLIO = Array.isArray(window.PORTFOLIO) ? window.PORTFOLIO : PORTFOLIO;

        initTrainingCarousel();
        renderCatalogueGrid();
        renderDomains();
        // Places réelles : les badges des cartes et la liste des sessions se recalculent
        // dès que le relevé de la feuille est arrivé. Le contenu recréé doit être
        // ré-observé, sinon il reste invisible (apparition au scroll).
        document.addEventListener('impactali:places', () => {
            renderCatalogueGrid();
            renderSessions();
            common.observeReveals?.();
        });

        /* Catalogue modifié depuis le tableau de bord : on reconstruit tout ce qui
           en dépend. Le carrousel, lui, n'est refait que si son contenu a vraiment
           changé — le reconstruire pour rien interromprait sa rotation. On compare
           donc ce qui serait AFFICHÉ, et non la liste des formations : un titre ou
           une photo corrigés ne changent pas cette liste. */
        document.addEventListener('impactali:catalogue', event => {
            const avant = contenuDuCarrousel();
            FORMATIONS = visibles(window.FORMATIONS);
            PORTFOLIO = Array.isArray(window.PORTFOLIO) ? window.PORTFOLIO : PORTFOLIO;
            renderCatalogueGrid();
            renderDomains();
            renderSessions();
            renderPortfolio();
            if (contenuDuCarrousel() !== avant) initTrainingCarousel();
            common.observeReveals?.();
        });
        /* Pays changé depuis le formulaire d'inscription : les tarifs affichés
           sur l'accueil ne sont plus les bons, et les sessions proposées non plus.
           Les badges des cartes non plus : « Inscriptions ouvertes » n'a pas le
           même sens là où la session n'est pas proposée. */
        document.addEventListener('impactali:pays', () => {
            const avant = contenuDuCarrousel();
            renderCatalogueGrid();
            renderSessions();
            if (contenuDuCarrousel() !== avant) initTrainingCarousel();
            common.observeReveals?.();
        });

        initTrainingDialog();
        renderSessions();
        renderPortfolio();
        // Le contenu créé ci-dessus n'existait pas au premier passage de l'observateur
        common.observeReveals?.();
    });
})();

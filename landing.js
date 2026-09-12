/* =========================================
   LANDING — catalogue (carrousel), fiche rapide, sessions, portfolio
   Chargé uniquement sur la page d'accueil, après site-common.js.
   ========================================= */
(function () {
    'use strict';

    const FORMATIONS = Array.isArray(window.FORMATIONS) ? window.FORMATIONS : [];
    const PORTFOLIO = Array.isArray(window.PORTFOLIO) ? window.PORTFOLIO : [];
    const common = window.SiteCommon;
    if (!common) return;
    const { escapeHtml, formatSessionDate, findFormation, upcomingSessions, formatPrice } = common;

    /** Lien d'inscription : page dédiée quand elle existe, sinon fiche rapide. */
    function registrationHref(formation, sessionId) {
        if (!formation) return '/formations/canva-pro/#inscription';
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
        const session = upcomingSessions().find(item => item.formId === formation.formId && item.registrationOpen);
        if (formation.registrationOpen) badges.push({ label: 'Inscriptions ouvertes', tone: 'accent' });
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
        const promise = isKnown(formation.promise) ? formation.promise
            : (isKnown(formation.shortDescription) ? formation.shortDescription : `Une formation ${formation.category.toLowerCase()} orientée pratique.`);
        const ctaLabel = formation.hasDetailPage ? 'Voir la formation' : 'Découvrir la formation';
        const focusAttrs = accessible ? '' : 'tabindex="-1" aria-hidden="true"';
        const link = formation.hasDetailPage
            ? `<a class="course-card__link" href="${escapeHtml(formation.href)}" aria-label="${escapeHtml(ctaLabel)} ${escapeHtml(formation.title)}" ${focusAttrs}></a>`
            : `<button class="course-card__link" type="button" data-open-training="${escapeHtml(formation.slug)}" aria-label="${escapeHtml(ctaLabel)} ${escapeHtml(formation.title)}" ${focusAttrs}></button>`;
        const classes = ['course-card', `course-card--${variant}`, formation.featured && variant !== 'dark' ? 'course-card--featured' : '', options.extraClass || '']
            .filter(Boolean).join(' ');

        return `<article class="${classes}" data-training-slug="${escapeHtml(formation.slug)}" data-family="${escapeHtml(formation.family || '')}">
            <div class="course-card__media">
                <img src="${escapeHtml(formation.image)}" alt="${escapeHtml(formation.imageAlt || '')}" loading="lazy" decoding="async" width="800" height="450">
                <div class="course-card__badges">${cardBadges(formation)}</div>
            </div>
            <div class="course-card__body">
                <span class="course-card__category">${escapeHtml(formation.category)}</span>
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
    function initTrainingCarousel() {
        const carousel = document.getElementById('training-carousel');
        const viewport = carousel?.querySelector('.carousel-viewport');
        const track = document.getElementById('carousel-track');
        const dots = document.getElementById('carousel-dots');
        if (!carousel || !viewport || !track || !dots || !FORMATIONS.length) return;

        track.innerHTML = [0, 1, 2]
            .map(copyIndex => FORMATIONS.map(formation => renderCourseCard(formation, { variant: 'dark', accessible: copyIndex === 1, extraClass: 'training-card' })).join(''))
            .join('');
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
        });

        carousel.querySelector('[data-carousel-prev]').addEventListener('click', () => goTo(state.index - 1));
        carousel.querySelector('[data-carousel-next]').addEventListener('click', () => goTo(state.index + 1));
        dotButtons.forEach(dot => dot.addEventListener('click', () => goTo(FORMATIONS.length + Number(dot.dataset.carouselDot))));

        carousel.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(state.index - 1); }
            else if (event.key === 'ArrowRight') { event.preventDefault(); goTo(state.index + 1); }
            else if (event.key === 'Home') { event.preventDefault(); goTo(FORMATIONS.length); }
            else if (event.key === 'End') { event.preventDefault(); goTo(FORMATIONS.length * 2 - 1); }
        });

        carousel.addEventListener('mouseenter', () => setPaused('hover', true));
        carousel.addEventListener('mouseleave', () => setPaused('hover', false, true));
        carousel.addEventListener('focusin', () => setPaused('focus', true));
        carousel.addEventListener('focusout', event => {
            if (!carousel.contains(event.relatedTarget)) setPaused('focus', false, true);
        });

        viewport.addEventListener('pointerdown', event => {
            state.pointerStartX = event.clientX;
            state.pointerMoved = false;
            setPaused('pointer', true);
        });
        viewport.addEventListener('pointermove', event => {
            if (state.pointerStartX === null) return;
            const delta = event.clientX - state.pointerStartX;
            if (Math.abs(delta) > 6) state.pointerMoved = true;
            if (state.pointerMoved) positionTrack(false, delta);
        });
        const finishPointer = event => {
            if (state.pointerStartX === null) return;
            const delta = event.clientX - state.pointerStartX;
            state.pointerStartX = null;
            if (Math.abs(delta) > 42) goTo(state.index + (delta < 0 ? 1 : -1));
            else positionTrack(true);
            setPaused('pointer', false, true);
        };
        viewport.addEventListener('pointerup', finishPointer);
        viewport.addEventListener('pointerleave', finishPointer);
        viewport.addEventListener('pointercancel', () => {
            state.pointerStartX = null;
            positionTrack(true);
            setPaused('pointer', false, true);
        });
        // Un glissement ne doit pas déclencher l'ouverture de la carte
        track.addEventListener('click', event => {
            if (state.pointerMoved) { event.preventDefault(); event.stopPropagation(); state.pointerMoved = false; }
        }, true);

        document.addEventListener('visibilitychange', () => setPaused('hidden', document.hidden));
        reducedMotion.addEventListener?.('change', startAuto);
        window.addEventListener('resize', () => window.requestAnimationFrame(() => positionTrack(false)), { passive: true });

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
        document.getElementById('training-dialog-category').textContent = formation.category;
        document.getElementById('training-dialog-title').textContent = formation.title;
        document.getElementById('training-dialog-description').textContent = formation.shortDescription;
        document.getElementById('training-dialog-meta').innerHTML = `
            <div><dt>Durée</dt><dd>${escapeHtml(formation.duration)}</dd></div>
            <div><dt>Niveau</dt><dd>${escapeHtml(formation.level)}</dd></div>
            <div><dt>Mode</dt><dd>${escapeHtml(formation.mode)}</dd></div>
            <div><dt>Tarif</dt><dd>${escapeHtml(formatPrice(formation.price))}</dd></div>
            <div><dt>Prochaine session</dt><dd>${escapeHtml(formatSessionDate(formation.nextSession) || 'À annoncer')}</dd></div>
            <div><dt>Places</dt><dd>${formation.places === null || formation.places === undefined ? 'À confirmer' : `${escapeHtml(String(formation.places))} disponibles`}</dd></div>`;

        const actions = document.getElementById('training-dialog-actions');
        const askMessage = `Bonjour, je souhaite être informé(e) de la prochaine session de la formation « ${formation.title} ».`;
        actions.innerHTML = formation.registrationOpen
            ? `<a class="button button--primary" href="${escapeHtml(registrationHref(formation))}">S’inscrire<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>`
            : `<p class="training-dialog__notice">Programme, dates et tarif en cours de finalisation.</p>
               <a class="button button--secondary" href="${escapeHtml(common.whatsappUrl(askMessage))}" target="_blank" rel="noopener noreferrer">Être informé(e) de l’ouverture<span class="material-symbols-outlined" aria-hidden="true">notifications</span></a>`;

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

        dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => {
            const rect = dialog.getBoundingClientRect();
            const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
            if (outside) dialog.close();
        });

        // Lien profond : /?fiche=slug ouvre directement la fiche rapide
        const requested = new URLSearchParams(window.location.search).get('fiche');
        const formation = findFormation(requested);
        if (formation && !formation.hasDetailPage) openTrainingDialog(formation.slug);
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
            const status = session.registrationOpen ? 'Inscriptions ouvertes' : 'Inscriptions fermées';
            const cta = session.registrationOpen && formation
                ? `<a class="button button--primary" href="${escapeHtml(registrationHref(formation, session.id))}">Choisir cette session<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>`
                : `<span class="session-card__closed">Session complète ou fermée</span>`;
            return `<article class="session-card">
                <div class="session-card__date">
                    <span class="session-card__day">${escapeHtml(new Date(`${session.startDate}T12:00:00`).getDate())}</span>
                    <span class="session-card__month">${escapeHtml(new Date(`${session.startDate}T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }))}</span>
                </div>
                <div class="session-card__body">
                    <span class="session-card__status${session.registrationOpen ? ' is-open' : ''}">${status}</span>
                    <h3>${escapeHtml(title)}</h3>
                    <ul class="session-card__meta">
                        <li><span class="material-symbols-outlined" aria-hidden="true">event</span>Début le ${escapeHtml(formatSessionDate(session.startDate))}${session.endDate ? ` · fin le ${escapeHtml(formatSessionDate(session.endDate))}` : ''}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${escapeHtml(session.schedule)}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">timelapse</span>${escapeHtml(session.duration)}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${escapeHtml(session.location)} · ${escapeHtml(session.mode)}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">payments</span>${escapeHtml(formatPrice(session.price))}</li>
                        <li><span class="material-symbols-outlined" aria-hidden="true">group</span>${escapeHtml(places)}</li>
                    </ul>
                </div>
                <div class="session-card__action">${cta}</div>
            </article>`;
        }).join('');
    }

    // ---------- Portfolio ----------
    function renderPortfolio() {
        const grid = document.getElementById('portfolio-grid');
        if (!grid || !PORTFOLIO.length) return;

        grid.innerHTML = PORTFOLIO.map(item => {
            const media = item.placeholder || !item.image
                ? `<div class="portfolio-card__placeholder" aria-hidden="true"><span class="material-symbols-outlined">add_photo_alternate</span><span>Visuel à fournir</span></div>`
                : `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt)}" loading="lazy" decoding="async" width="800" height="600" style="object-position:${escapeHtml(item.imagePosition)}">`;
            const inner = `${media}
                <div class="portfolio-card__content">
                    <span class="portfolio-card__category">${escapeHtml(item.category)}</span>
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.description)}</p>
                </div>`;
            return item.href
                ? `<a class="portfolio-card${item.placeholder ? ' is-placeholder' : ''}" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
                : `<article class="portfolio-card${item.placeholder ? ' is-placeholder' : ''}">${inner}</article>`;
        }).join('');
    }

    document.addEventListener('DOMContentLoaded', () => {
        initTrainingCarousel();
        renderCatalogueGrid();
        initTrainingDialog();
        renderSessions();
        renderPortfolio();
    });
})();

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

    // ---------- Cartes du catalogue ----------
    function renderTrainingCard(formation, copyIndex) {
        const isAccessibleCopy = copyIndex === 1;
        return `<article class="training-card" data-training-slug="${escapeHtml(formation.slug)}">
            <img src="${escapeHtml(formation.image)}" alt="" loading="lazy" decoding="async" width="800" height="480">
            ${formation.registrationOpen ? '<span class="training-card__badge">Inscriptions ouvertes</span>' : ''}
            <div class="training-card__content">
                <span class="training-card__category">${escapeHtml(formation.category)}</span>
                <h3>${escapeHtml(formation.title)}</h3>
                <p class="training-card__promise">${escapeHtml(formation.promise)}</p>
                <div class="training-card__meta">
                    <span><span class="material-symbols-outlined" aria-hidden="true">signal_cellular_alt</span>${escapeHtml(formation.level)}</span>
                    <span><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${escapeHtml(formation.duration)}</span>
                    <span><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${escapeHtml(formation.mode)}</span>
                </div>
                <span class="training-card__link">Voir la formation <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span>
            </div>
            ${formation.hasDetailPage
                ? `<a class="training-card__button" href="${escapeHtml(formation.href)}" aria-label="Voir la formation ${escapeHtml(formation.title)}" ${isAccessibleCopy ? '' : 'tabindex="-1" aria-hidden="true"'}></a>`
                : `<button class="training-card__button" type="button" data-open-training="${escapeHtml(formation.slug)}" aria-label="Voir la formation ${escapeHtml(formation.title)}" ${isAccessibleCopy ? '' : 'tabindex="-1" aria-hidden="true"'}></button>`}
        </article>`;
    }

    // ---------- Carrousel infini, accessible, sans dépendance ----------
    function initTrainingCarousel() {
        const carousel = document.getElementById('training-carousel');
        const viewport = carousel?.querySelector('.carousel-viewport');
        const track = document.getElementById('carousel-track');
        const dots = document.getElementById('carousel-dots');
        if (!carousel || !viewport || !track || !dots || !FORMATIONS.length) return;

        track.innerHTML = [0, 1, 2]
            .map(copyIndex => FORMATIONS.map(formation => renderTrainingCard(formation, copyIndex)).join(''))
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
        initTrainingDialog();
        renderSessions();
        renderPortfolio();
    });
})();

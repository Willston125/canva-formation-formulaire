/* =========================================
   FORMATION CANVA PRO — Form Logic
   Multi-step, validation, auto-save, Google Sheets
   Works with Tailwind-based design
   ========================================= */

(function () {
    'use strict';

    // ====== CONFIG ======
    const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyJCl1lg58y090bkO0OwovV7o60Oc0eAXPeWFu4AGX2IARG58Mqes7mf7h8BubK5KTavA/exec';
    const STORAGE_KEY = 'canvapro_form_data';
    const REGISTERED_KEY = 'canvapro_registered_user';
    const TOTAL_STEPS = 4;
    const PLACES_RESTANTES = 13;
    const PLACES_TOTAL = 20;

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

    // ====== PROGRAMME ACCORDÉON (Mobile) ======
    function initAccordions() {
        document.querySelectorAll('.programme-accordion .accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                // Ne fait rien si on est sur desktop (pointer-events: none via CSS)
                // mais on garde la logique pour robustesse
                const accordion = header.closest('.programme-accordion');
                const body = accordion.querySelector('.accordion-body');
                const isOpen = accordion.classList.contains('accordion-open');

                if (isOpen) {
                    // Fermer
                    accordion.classList.remove('accordion-open');
                    body.classList.add('hidden');
                    header.setAttribute('aria-expanded', 'false');
                } else {
                    // Ouvrir
                    accordion.classList.add('accordion-open');
                    body.classList.remove('hidden');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }

    // ====== PLACES COUNTER ======
    function initPlacesCounter() {
        const countEl = document.getElementById('places-count');
        const barEl = document.getElementById('places-bar');
        if (countEl) countEl.textContent = PLACES_RESTANTES;
        if (barEl) {
            const taken = PLACES_TOTAL - PLACES_RESTANTES;
            const pct = Math.round((taken / PLACES_TOTAL) * 100);
            setTimeout(() => { barEl.style.width = pct + '%'; }, 300);
        }
    }

    // ====== INIT ======
    function init() {
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
                try { localStorage.removeItem(REGISTERED_KEY); } catch (e) { }
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

        if (localStorage.getItem(REGISTERED_KEY) === 'true') {
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
        initAccordions();
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
        form.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('input', () => {
                saveData();
                clearFieldError(field);
            });
            field.addEventListener('change', () => {
                saveData();
                clearFieldError(field);
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
            const posterSection = document.getElementById('poster-section');
            const placesSection = document.getElementById('places-counter-section');
            const formateurSection = document.getElementById('formateur-section');
            const faqSection = document.getElementById('faq-section');
            if (posterSection) posterSection.style.display = (currentStep === 1) ? '' : 'none';
            if (placesSection) placesSection.style.display = (currentStep === 1) ? '' : 'none';
            if (formateurSection) formateurSection.style.display = (currentStep === 1) ? '' : 'none';
            if (faqSection) faqSection.style.display = (currentStep === 1) ? '' : 'none';

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
        const allFields = [
            'nom', 'prenom', 'telephone', 'email', 'age',
            'profession', 'niveau', 'motivation', 'paiement',
        ];

        let filled = 0;
        let total = allFields.length + 2; // +objectifs +conditions

        allFields.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value && el.value.trim() !== '') filled++;
        });

        const objectifs = document.querySelectorAll('input[name="objectifs"]:checked');
        if (objectifs.length > 0) filled++;

        const conditions = document.getElementById('conditions');
        if (conditions && conditions.checked) filled++;

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
                } else if (!/^(77|67)\d{6}$/.test(telPaiement.value.trim())) {
                    showFieldError(telPaiement, 'Format invalide (ex : 77XXXXXX)');
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
                if (!/^(77|67)\d{6}$/.test(value)) {
                    showFieldError(field, 'Format invalide. Utilisez 77XXXXXX ou 67XXXXXX');
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
        const mobileMethods = ['Waafi Mobile Money', 'Cacpay'];

        if (mobileMethods.includes(value)) {
            show(telPaiementGroup);
            show(paymentInfoMobile);
            hide(paymentInfoCash);

            const numLabel = document.getElementById('mobile-payment-label');
            const numText = document.getElementById('mobile-payment-number');
            if (numLabel && numText) {
                if (value === 'Cacpay') {
                    numLabel.textContent = 'Numéro de compte';
                    numText.textContent = '11000012127';
                } else {
                    numLabel.textContent = 'Numéro';
                    numText.textContent = '+253 77 55 63 44';
                }
            }
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
            { label: 'Nom', value: data.nom },
            { label: 'Prénom', value: data.prenom },
            { label: 'Téléphone', value: '+253 ' + data.telephone },
            { label: 'Email', value: data.email || '—' },
            { label: 'Âge', value: data.age + ' ans' },
            { label: 'Profession', value: data.profession },
            { label: 'Niveau Canva', value: data.niveau },
            { label: 'Mode de paiement', value: data.paiement },
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

        const payload = {
            horodateur: new Date().toLocaleString('fr-FR'),
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
            source: data.source
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
        const prenomNom = `${data.nom} ${data.prenom}`.trim();
        const message = `Bonjour M. Ali William,

Je confirme mon inscription à la Formation Canva Pro.

📋 INFORMATIONS D'INSCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Participant : ${prenomNom}
📱 Téléphone : +253 ${data.telephone}
💳 Paiement : ${data.paiement} - 7 500 FDJ
📅 Formation : 16 avril - 30 mai 2026

📎 Preuve de paiement ci-jointe

En attente de votre confirmation.

Cordialement,
${data.prenom}`;

        const btnWhatsapp = document.getElementById('btn-whatsapp');
        if (btnWhatsapp) {
            btnWhatsapp.href = `https://wa.me/25377145306?text=${encodeURIComponent(message)}`;
        }

        document.getElementById('form-container')?.classList.add('hidden');
        document.querySelector('#mobile-progress').style.display = 'none';
        document.querySelector('#sidebar').style.display = 'none';
        successScreen.classList.remove('hidden');

        try { localStorage.setItem(REGISTERED_KEY, 'true'); } catch (e) { /* silent */ }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ====== AUTO-SAVE ======
    function saveData() {
        try {
            const data = getFormData();
            const conditionsChecked = document.getElementById('conditions').checked;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, conditions: conditionsChecked }));
        } catch (e) { /* silent */ }
    }

    function loadSavedData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return;

            const data = JSON.parse(saved);
            if (!data) return;

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
        } catch (e) { /* silent */ }
    }

    function clearSavedData() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* silent */ }
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

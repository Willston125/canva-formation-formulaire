/* =========================================
   FORMATION CANVA PRO — Form Logic
   Multi-step, validation, auto-save, Google Sheets
   Works with Tailwind-based design
   ========================================= */

(function () {
    'use strict';

    // ====== CONFIG ======
    const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxoskwR94K7ASTS-AHIQpt9v-Z5FxzZjKlpAqaliXqw-uM6FkSks6EfrSBBZ5yf9Vs_UA/exec';
    const STORAGE_KEY = 'canvapro_form_data';
    const TOTAL_STEPS = 4;

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

    // ====== INIT ======
    function init() {
        loadSavedData();
        updateProgress();
        attachEvents();
        updateCharCounter();
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

        // Payment conditional
        paiementSelect.addEventListener('change', handlePaymentChange);

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
        form.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('blur', () => {
                validateField(field);
            });
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

        sections[currentStep - 1].classList.remove('active');
        currentStep = step;
        sections[currentStep - 1].classList.add('active');

        if (currentStep === 4) {
            buildSummary();
        }

        updateProgress();

        // Show/hide poster (step 1 only)
        const posterSection = document.getElementById('poster-section');
        if (posterSection) {
            posterSection.style.display = (currentStep === 1) ? '' : 'none';
        }

        // Show/hide programme (steps 1 and 4 only)
        const programmeSection = document.getElementById('programme-section');
        if (programmeSection) {
            programmeSection.style.display = (currentStep === 1 || currentStep === 4) ? '' : 'none';
        }

        // Scroll to top of form card
        const formCard = document.querySelector('.glass-card');
        if (formCard) {
            formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
            const mobileMethods = ['Waafi Mobile Money', 'Cacpay'];
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
            'profession': 'La profession est obligatoire',
            'niveau': 'Veuillez sélectionner votre niveau',
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

        // Show loader
        const btnText = btnSubmit.querySelector('.btn-submit-text');
        const btnLoader = btnSubmit.querySelector('.btn-loader');
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        btnLoader.classList.add('flex');
        btnSubmit.disabled = true;

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
        };

        try {
            if (GOOGLE_SHEETS_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            showSuccessScreen();
            clearSavedData();
        } catch (error) {
            console.error('Erreur soumission:', error);
            alert("❌ Erreur lors de l'envoi. Veuillez vérifier votre connexion ou réessayer.");
            
            // Réactiver le bouton
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            btnLoader.classList.remove('flex');
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
💳 Paiement : ${data.paiement} - 5000 FDJ
📅 Formation : 16 avril - 30 mai 2026

📎 Preuve de paiement ci-jointe

En attente de votre confirmation.

Cordialement,
${data.prenom}`;

        const btnWhatsapp = document.getElementById('btn-whatsapp');
        if (btnWhatsapp) {
            btnWhatsapp.href = `https://wa.me/25377145306?text=${encodeURIComponent(message)}`;
        }

        form.closest('.glass-card').style.display = 'none';
        document.querySelector('#mobile-progress')?.classList.add('hidden');
        document.querySelector('#sidebar')?.classList.add('hidden');
        successScreen.classList.remove('hidden');
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

            const textFields = ['nom', 'prenom', 'telephone', 'email', 'age', 'profession', 'motivation'];
            textFields.forEach(id => {
                const el = document.getElementById(id);
                if (el && data[id]) el.value = data[id];
            });

            // tel-paiement
            const telPay = document.getElementById('tel-paiement');
            if (telPay && data.telPaiement) telPay.value = data.telPaiement;

            // Selects
            if (data.niveau) document.getElementById('niveau').value = data.niveau;
            if (data.paiement) {
                paiementSelect.value = data.paiement;
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

})();

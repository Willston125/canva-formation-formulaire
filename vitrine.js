/* =========================================
   Cineworld Académie — pages de présentation : Contact et Production
   (L'association, elle, est une page fixe : elle n'a besoin d'aucun script.)

   Rien ici ne nomme un pays. Les coordonnées affichées sur la page Contact
   sont celles du pays du visiteur, telles que le SERVEUR les envoie
   (api/_lib/marche.js) : un visiteur des Comores ne reçoit jamais celles de
   Djibouti, et inversement. Hors marché, la page ne propose que l'e-mail.
   ========================================= */
(function () {
    'use strict';

    const common = window.SiteCommon;
    if (!common) return;
    const esc = common.escapeHtml;

    // ---------- Contact : les coordonnées du pays du visiteur ----------

    function renderContactPays() {
        const bloc = document.getElementById('contact-pays');
        if (!bloc) return;
        const marche = common.marcheActif();
        const pays = common.paysActif();
        const horsMarche = document.getElementById('contact-hors-marche');

        // Le serveur n'a pas encore répondu : rien d'un pays, rien d'« ailleurs » non plus
        bloc.hidden = !pays;
        if (horsMarche) horsMarche.hidden = !marche || Boolean(pays);
        if (!pays) {
            /* Un pays quitté (choix « aucun » en bas de page) ne laisse rien
               derrière lui, même masqué : la carte est vidée, pas seulement cachée. */
            bloc.querySelectorAll('#contact-pays-nom, [data-numero], [data-valeur]').forEach(el => { el.textContent = ''; });
            bloc.querySelectorAll('#contact-whatsapp, #contact-adresse, #contact-horaires, #contact-carte').forEach(el => { el.hidden = true; });
            bloc.querySelectorAll('a[href]').forEach(a => { a.href = '#'; });
            return;
        }

        const nom = document.getElementById('contact-pays-nom');
        if (nom) nom.textContent = pays.nom || '';

        const ligne = (id, texte) => {
            const el = document.getElementById(id);
            if (!el) return;
            const vide = !String(texte || '').trim();
            el.hidden = vide;
            return vide ? null : el;
        };

        /* WhatsApp ne paraît qu'ici et à l'inscription : c'est le numéro de CE
           pays, celui qu'Ali tient pour ses visiteurs (décision du 24/10/2026). */
        const numero = common.numeroWhatsappAffiche();
        const whatsapp = ligne('contact-whatsapp', numero);
        if (whatsapp) {
            const lien = whatsapp.querySelector('a');
            lien.href = common.whatsappUrl('Bonjour, je vous écris depuis la page Contact du site Cineworld Académie.');
            lien.querySelector('[data-numero]').textContent = numero;
        }

        const adresse = ligne('contact-adresse', pays.adresse);
        if (adresse) adresse.querySelector('[data-valeur]').textContent = pays.adresse;

        const horaires = ligne('contact-horaires', pays.horaires);
        if (horaires) {
            horaires.querySelector('[data-valeur]').innerHTML = String(pays.horaires).split(/\r?\n/)
                .map(l => l.trim()).filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('');
        }

        const carte = document.getElementById('contact-carte');
        if (carte) {
            const lien = common.lienSur(pays.carte);
            carte.hidden = !/^https:\/\//.test(lien);
            if (!carte.hidden) carte.href = lien;
        }
    }

    function renderNomContact() {
        const nom = String((common.contact && common.contact.contactName) || '').trim();
        document.querySelectorAll('[data-contact-nom]').forEach(el => {
            if (nom) el.textContent = nom;
        });
    }

    // ---------- Production : les vidéos YouTube de l'académie ----------

    /* « Production · Clip » s'affiche « Clip » ; « Production » seul reste tel quel. */
    function etiquetteDeProduction(categorie) {
        const m = /^\s*production\s*[·•|—-]\s*(.+)$/i.exec(String(categorie || ''));
        return m ? m[1].trim() : 'Production';
    }

    let signatureProductions = '';

    function renderProductions() {
        const grille = document.getElementById('productions-grille');
        if (!grille) return;
        const items = (Array.isArray(window.PORTFOLIO) ? window.PORTFOLIO : [])
            .filter(item => common.estProduction(item) && common.identifiantYoutube(item.video));
        const vide = document.getElementById('productions-vide');
        if (vide) vide.hidden = items.length > 0;
        grille.hidden = !items.length;

        // Redessiner pour rien couperait la vidéo en cours de lecture
        const signature = items.map(i => [i.video, i.category, i.title, i.description, i.image].join('|')).join('§');
        if (signature === signatureProductions && grille.children.length) return;
        signatureProductions = signature;

        grille.innerHTML = items.map(item => {
            const id = common.identifiantYoutube(item.video);
            const apercu = item.image || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
            return `<article class="production-carte" data-video="${esc(id)}">
                <div class="production-carte__media">
                    <img src="${esc(apercu)}" alt="${esc(item.imageAlt || '')}" loading="lazy" decoding="async"
                        style="object-position:${esc(item.imagePosition || '50% 50%')}">
                    <button type="button" class="production-carte__lecture" aria-label="${esc('Lire la vidéo : ' + item.title)}">
                        <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                    </button>
                </div>
                <div class="production-carte__texte">
                    <span class="production-carte__genre">${esc(etiquetteDeProduction(item.category))}</span>
                    <h3>${esc(item.title)}</h3>
                    ${item.description ? `<p>${esc(item.description)}</p>` : ''}
                </div>
            </article>`;
        }).join('');

        grille.querySelectorAll('.production-carte__lecture').forEach(bouton => {
            bouton.addEventListener('click', () => lire(bouton.closest('.production-carte')));
        });
    }

    /* La vidéo se lit SUR PLACE, dans sa carte. Rien ne part chez YouTube avant
       le clic (lecteur sans cookie) ; une seule vidéo joue à la fois. */
    function lire(carte) {
        if (!carte) return;
        document.querySelectorAll('.production-carte.is-lecture').forEach(autre => {
            if (autre === carte) return;
            const cadre = autre.querySelector('iframe');
            if (cadre) cadre.remove();
            autre.classList.remove('is-lecture');
        });
        const media = carte.querySelector('.production-carte__media');
        if (!media || media.querySelector('iframe')) return;
        const titre = (carte.querySelector('h3') || {}).textContent || 'Vidéo';
        const cadre = document.createElement('iframe');
        cadre.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(carte.dataset.video)}?autoplay=1&rel=0&playsinline=1`;
        cadre.title = titre;
        cadre.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
        cadre.referrerPolicy = 'strict-origin-when-cross-origin';
        cadre.allowFullscreen = true;
        media.appendChild(cadre);
        carte.classList.add('is-lecture');
        cadre.focus();
    }

    // ---------- Branchement ----------

    function toutRedessiner() {
        renderContactPays();
        renderNomContact();
        renderProductions();
    }

    document.addEventListener('DOMContentLoaded', toutRedessiner);
    document.addEventListener('impactali:catalogue', toutRedessiner);
    document.addEventListener('impactali:pays', renderContactPays);
})();

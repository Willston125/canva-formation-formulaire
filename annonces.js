/* La fenêtre d'annonce : une affiche qui s'ouvre quelques secondes après
 * l'arrivée, et qu'une croix referme.
 *
 * Deux usages, décidés dans le tableau de bord (onglet « Annonces ») :
 * - « À la une » : une formation d'IMPACTALI mise en avant ;
 * - « Publicité » : l'annonce d'un partenaire, toujours signalée comme telle,
 *   avec le nom de l'annonceur.
 *
 * Les annonces arrivent avec le catalogue, DÉJÀ TRIÉES PAR LE SERVEUR pour le
 * pays du visiteur (api/_lib/marche.js) : une annonce faite pour un pays ne
 * part jamais ailleurs. Ce fichier ne choisit que laquelle montrer, et quand.
 *
 * QUAND. Décisions du propriétaire (9 octobre 2026) :
 * - 5 secondes après l'arrivée — le temps de voir où l'on est ;
 * - sur l'accueil, à chaque arrivée, en faisant tourner les annonces ;
 * - sur une fiche formation, une fois par visite au plus ;
 * - jamais pendant une inscription : un visiteur qui a commencé à remplir le
 *   formulaire n'est plus interrompu, dans cet onglet ;
 * - jamais par-dessus autre chose : un menu ouvert, une vidéo, un champ en
 *   cours de saisie, ou une arrivée sur une ancre précise (#programme…) —
 *   le visiteur sait alors ce qu'il est venu chercher.
 *
 * L'AFFICHE N'EST JAMAIS ROGNÉE NI RETOUCHÉE : elle porte ses propres textes.
 * La verticale (1080 × 1350 conseillé) sert les téléphones ; la large
 * (1600 × 900), si elle existe, les écrans d'ordinateur. Le cadre prend le
 * rapport de l'affiche, quel qu'il soit.
 *
 * MESURE. Affichée, cliquée, fermée : trois compteurs anonymes par annonce,
 * lus dans le tableau de bord. Ni cookie, ni identifiant. */
(function () {
    'use strict';

    const common = window.SiteCommon;
    if (!common || !common.annoncesDuVisiteur) return;

    const DELAI_MS = 5000;
    /* Au-delà, le visiteur est déjà ailleurs : une fenêtre tardive le couperait
       en pleine lecture. Assez large pour un réseau mobile lent. */
    const ATTENTE_MAX_MS = 20000;
    const CHARGEMENT_MAX_MS = 8000;
    const ECRAN_LARGE = '(min-width: 900px)';
    // Par visiteur seulement : quelle annonce vient ensuite, et si une fiche en a déjà montré une
    const CLE_ROTATION = 'impactali_annonce_suivante';
    const CLE_FICHE = 'impactali_annonce_fiche';

    const corps = document.body;
    /* La page d'inscription est faite du même gabarit que les fiches : on la
       reconnaît à sa marque, et on n'y ouvre rien — on y vient pour s'inscrire. */
    const page = corps.hasAttribute('data-fiche-generique') ? null
        : corps.classList.contains('page-home') ? 'accueil'
            : corps.classList.contains('page-fiche') ? 'fiche' : null;
    if (!page) return;

    // Le moment où le visiteur a la page sous les yeux : remis à l'heure au retour d'un onglet caché
    let depart = Date.now();
    // L'ancre d'ARRIVÉE : celles posées ensuite par la navigation interne ne comptent pas
    const ancreArrivee = window.location.hash.length > 1;
    let ouverte = null;

    const lire = (stockage, cle) => { try { return stockage.getItem(cle); } catch (e) { return null; } };
    const ecrire = (stockage, cle, valeur) => { try { stockage.setItem(cle, valeur); } catch (e) { /* stockage indisponible */ } };

    /** Le jour à Moroni et à Djibouti (UTC+3), comme le serveur le compte. */
    const aujourdhui = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

    /** La formation de la fiche ouverte : sa propre annonce n'y a rien à faire. */
    function formationDeLaPage() {
        const el = page === 'fiche' ? document.querySelector('[data-formation-id]') : null;
        return el ? el.getAttribute('data-formation-id') : '';
    }

    /** Le visiteur est occupé ailleurs : on ne l'interrompt pas. */
    function occupe() {
        const actif = document.activeElement;
        if (actif && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName)) return true;
        const menu = document.getElementById('mobile-menu');
        if (menu && !menu.hidden) return true;
        if (corps.style.overflow === 'hidden') return true;
        return Array.prototype.some.call(document.querySelectorAll('[aria-modal="true"], dialog[open]'),
            el => el.getClientRects().length > 0);
    }

    function permise() {
        if (ouverte || ancreArrivee || common.inscriptionCommencee()) return false;
        if (page === 'fiche' && lire(sessionStorage, CLE_FICHE)) return false;
        return !occupe();
    }

    /** L'annonce de ce passage : la suivante dans la rotation, parmi celles encore valables. */
    function choisir() {
        const formation = formationDeLaPage();
        const jour = aujourdhui();
        const liste = (common.annoncesDuVisiteur() || []).filter(a =>
            (!a.fin || a.fin >= jour) && !(formation && a.formation === formation));
        if (!liste.length) return null;
        const rang = Number(lire(localStorage, CLE_ROTATION)) || 0;
        ecrire(localStorage, CLE_ROTATION, String((rang + 1) % 1000));
        return liste[rang % liste.length];
    }

    const versionPour = annonce =>
        (annonce.imageLarge && window.matchMedia && window.matchMedia(ECRAN_LARGE).matches) ? annonce.imageLarge : annonce.image;

    /** L'affiche, chargée AVANT d'ouvrir : jamais de cadre vide qui se remplit sous les yeux. */
    function charger(adresse) {
        return new Promise((resoudre, rejeter) => {
            const img = new Image();
            const delai = window.setTimeout(() => rejeter(new Error('trop long')), CHARGEMENT_MAX_MS);
            img.onload = () => {
                window.clearTimeout(delai);
                if (img.naturalWidth && img.naturalHeight) resoudre(img);
                else rejeter(new Error('image vide'));
            };
            img.onerror = () => { window.clearTimeout(delai); rejeter(new Error('image illisible')); };
            img.decoding = 'async';
            img.src = adresse;
        });
    }

    /** La taille du cadre suit le rapport de l'affiche : jamais de bandes, jamais de rognage. */
    function dimensionner(boite, img) {
        const rapport = img.naturalWidth / img.naturalHeight;
        boite.style.setProperty('--annonce-rapport', String(rapport));
        boite.style.setProperty('--annonce-max', rapport < 1 ? '440px' : '960px');
        boite.classList.toggle('annonce__boite--large', rapport >= 1);
    }

    function etiquette(annonce) {
        if (annonce.type === 'partenaire') return 'Publicité' + (annonce.annonceur ? ' · ' + annonce.annonceur : '');
        return 'À la une';
    }

    function ouvrir(annonce, img) {
        const lien = common.lienSur(annonce.lien || '');
        const externe = /^https?:\/\//i.test(lien) && lien.indexOf(window.location.origin + '/') !== 0;
        const cible = externe
            ? ` target="_blank" rel="${annonce.type === 'partenaire' ? 'sponsored ' : ''}noopener noreferrer"` : '';
        const texteBouton = annonce.bouton
            || (annonce.type === 'partenaire' ? 'En savoir plus' : 'Découvrir la formation');
        const alt = annonce.imageAlt || annonce.titre;
        const e = common.escapeHtml;

        const fenetre = document.createElement('div');
        fenetre.className = 'annonce';
        fenetre.setAttribute('data-annonce', annonce.id);
        fenetre.innerHTML = `
            <div class="annonce__fond" data-annonce-fermer></div>
            <div class="annonce__boite" role="dialog" aria-modal="true" aria-labelledby="annonce-titre">
                <div class="annonce__entete">
                    <span class="annonce__etiquette${annonce.type === 'partenaire' ? ' annonce__etiquette--pub' : ''}">${e(etiquette(annonce))}</span>
                    <button type="button" class="annonce__fermer" data-annonce-fermer aria-label="Fermer l’annonce">
                        <span class="material-symbols-outlined" aria-hidden="true">close</span></button>
                </div>
                <h2 class="annonce__titre" id="annonce-titre">${e(annonce.titre)}</h2>
                ${lien ? `<a class="annonce__visuel" href="${e(lien)}"${cible} data-annonce-clic tabindex="-1">` : '<div class="annonce__visuel">'}
                    <img src="${e(img.src)}" alt="${e(alt)}" width="${img.naturalWidth}" height="${img.naturalHeight}">
                ${lien ? '</a>' : '</div>'}
                ${lien ? `<a class="annonce__bouton" href="${e(lien)}"${cible} data-annonce-clic>${e(texteBouton)}
                    <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>` : ''}
            </div>`;

        const boite = fenetre.querySelector('.annonce__boite');
        const image = fenetre.querySelector('img');
        dimensionner(boite, img);

        /* La page ne défile plus derrière. La barre de défilement qui disparaît
           est compensée : sans cela, toute la page sauterait de quelques pixels. */
        const barre = window.innerWidth - document.documentElement.clientWidth;
        const avant = { overflow: corps.style.overflow, marge: corps.style.paddingRight };
        corps.style.overflow = 'hidden';
        if (barre > 0) corps.style.paddingRight = barre + 'px';
        const focusAvant = document.activeElement;

        /* Un téléphone qu'on tourne, une fenêtre qu'on élargit : l'affiche
           suit, si l'annonce en a deux. Chargée d'abord, échangée ensuite. */
        const ecran = annonce.imageLarge && window.matchMedia ? window.matchMedia(ECRAN_LARGE) : null;
        const auChangementEcran = () => {
            const adresse = versionPour(annonce);
            if (image.getAttribute('src') === adresse) return;
            charger(adresse).then(nouvelle => {
                if (ouverte !== fenetre) return;
                image.src = nouvelle.src;
                image.width = nouvelle.naturalWidth;
                image.height = nouvelle.naturalHeight;
                dimensionner(boite, nouvelle);
            }).catch(() => { /* on garde celle qui est là */ });
        };
        if (ecran) ecran.addEventListener('change', auChangementEcran);

        const fermer = (compter) => {
            if (ouverte !== fenetre) return;
            ouverte = null;
            if (compter) common.mesurerAnnonce('fermee', annonce.id);
            document.removeEventListener('keydown', auClavier, true);
            if (ecran) ecran.removeEventListener('change', auChangementEcran);
            fenetre.remove();
            corps.style.overflow = avant.overflow;
            corps.style.paddingRight = avant.marge;
            if (focusAvant && typeof focusAvant.focus === 'function' && document.contains(focusAvant)) {
                try { focusAvant.focus({ preventScroll: true }); } catch (e) { focusAvant.focus(); }
            }
        };

        /* Échap ferme ; Tab reste dans la fenêtre tant qu'elle est ouverte,
           comme dans toute fenêtre modale. */
        function auClavier(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                fermer(true);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusables = Array.prototype.filter.call(
                boite.querySelectorAll('a[href]:not([tabindex="-1"]), button'), el => el.getClientRects().length > 0);
            if (!focusables.length) return;
            const premier = focusables[0];
            const dernier = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === premier) { event.preventDefault(); dernier.focus(); }
            else if (!event.shiftKey && document.activeElement === dernier) { event.preventDefault(); premier.focus(); }
            else if (!boite.contains(document.activeElement)) { event.preventDefault(); premier.focus(); }
        }

        fenetre.querySelectorAll('[data-annonce-fermer]').forEach(el => el.addEventListener('click', () => fermer(true)));
        fenetre.querySelectorAll('[data-annonce-clic]').forEach(el => el.addEventListener('click', () => {
            common.mesurerAnnonce('clic', annonce.id);
            // Un lien qui ouvre un autre onglet : au retour, la page est libre
            fermer(false);
        }));
        document.addEventListener('keydown', auClavier, true);

        ouverte = fenetre;
        corps.appendChild(fenetre);
        fenetre.querySelector('.annonce__fermer').focus({ preventScroll: true });
        if (page === 'fiche') ecrire(sessionStorage, CLE_FICHE, '1');
        common.mesurerAnnonce('vue', annonce.id);
    }

    /** Le moment venu : choisir, charger, puis ouvrir — si rien n'a changé entre-temps. */
    function tenter() {
        if (!permise()) return;
        const annonce = choisir();
        /* Rien à montrer POUR L'INSTANT n'est pas « rien à montrer ». La page
           pose d'abord le catalogue gardé de la visite précédente, puis celui
           du serveur quand il arrive — lentement sur un réseau mobile. Une
           copie d'avant la création de l'annonce n'en contient aucune : s'y
           arrêter, c'était ne jamais ouvrir l'annonce sur la première page de
           la visite, et l'ouvrir seulement sur la suivante (relevé le
           9 octobre 2026 : elle s'ouvrait sur les fiches, pas sur l'accueil).
           On attend donc la réponse du serveur, tant que la fenêtre
           d'ouverture n'est pas passée. */
        if (!annonce) { attendreLeCatalogue(); return; }
        charger(versionPour(annonce))
            .then(img => {
                // Le chargement a pris du temps : on revérifie que le visiteur est toujours disponible
                if (permise() && Date.now() - depart < ATTENTE_MAX_MS + CHARGEMENT_MAX_MS) ouvrir(annonce, img);
            })
            .catch(() => { /* affiche introuvable : pas de fenêtre, et rien de compté */ });
    }

    /** Le prochain catalogue reçu relance l'essai — mais pas indéfiniment. */
    function attendreLeCatalogue() {
        const surCatalogue = () => {
            document.removeEventListener('impactali:catalogue', surCatalogue);
            if (Date.now() - depart <= ATTENTE_MAX_MS) tenter();
        };
        document.addEventListener('impactali:catalogue', surCatalogue);
    }

    /* Le délai court pendant que la page est sous les yeux : un onglet ouvert
       en arrière-plan ne doit pas présenter une fenêtre que personne n'a vue
       s'ouvrir, et la compter comme vue. */
    function programmer() {
        if (document.hidden) {
            const auRetour = () => {
                if (document.hidden) return;
                document.removeEventListener('visibilitychange', auRetour);
                depart = Date.now();
                window.setTimeout(tenter, DELAI_MS);
            };
            document.addEventListener('visibilitychange', auRetour);
            return;
        }
        window.setTimeout(tenter, DELAI_MS);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', programmer);
    else programmer();
})();

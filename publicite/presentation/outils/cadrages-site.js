/* Les cadrages du site photographiés pour la vidéo (lus par capturer-site.js).
 *
 * Chaque capture : une page, du code à exécuter avant (`avant`), puis la zone
 * à photographier (`zone` : une expression évaluée dans la page, qui rend
 * { x, y, largeur, hauteur } en points CSS). Les captures sont en PNG, trois
 * pixels par point (390 points de large → 1170 pixels).
 *
 * La vidéo est GÉNÉRIQUE : vue aux Comores comme à Djibouti. Ce qui
 * n'appartient qu'à un pays est donc retiré de la page avant la photo, et
 * rien d'autre : le bandeau de session (date), le mode (« Présentiel » /
 * « En ligne ») sur la carte. Le récapitulatif de session du formulaire
 * (dates, lieu, tarif) et le champ téléphone (indicatif du pays) restent hors
 * cadre. */
'use strict';

// Utilitaires injectés dans chaque page avant la photo
const OUTILS = `
  window.__boite = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, largeur: r.width, hauteur: r.height }; };
  window.__union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, largeur: Math.max(a.x + a.largeur, b.x + b.largeur) - x, hauteur: Math.max(a.y + a.hauteur, b.y + b.hauteur) - y }; };
  window.__marge = (b, m) => ({ x: Math.max(0, b.x - m), y: Math.max(0, b.y - m), largeur: Math.min(390, b.largeur + 2 * m), hauteur: b.hauteur + 2 * m });
  // Le bandeau « Prochaine session · <date> » : propre à un pays
  document.querySelectorAll('#session-banner').forEach(e => e.style.setProperty('display', 'none', 'important'));
  // La fenêtre d'annonce et le bouton flottant ne font pas partie du parcours
  document.querySelectorAll('.annonce, .annonce-fenetre, #annonce, dialog[open]').forEach(e => e.remove());
`;

module.exports = [
  {
    // L'écran d'accueil, tel qu'un téléphone l'affiche en arrivant (bandeau de session retiré)
    nom: 'accueil-ecran',
    adresse: '/',
    avant: OUTILS + `window.scrollTo(0, 0);`,
    zone: `({ x: 0, y: 0, largeur: 390, hauteur: 844 })`
  },
  {
    // Les filtres du catalogue
    nom: 'catalogue-filtres',
    adresse: '/',
    avant: OUTILS,
    reperes: { toutes: '#catalogue-filters button' },
    zone: `__marge(__boite(document.querySelector('#catalogue-filters')), 8)`
  },
  {
    // La carte Canva Pro du catalogue, sans la ligne de mode (propre au pays)
    nom: 'catalogue-carte',
    adresse: '/',
    avant: OUTILS + `
      const carte = [...document.querySelectorAll('#catalogue-grid .course-card')].find(c => /Canva Pro/.test(c.textContent));
      carte.querySelectorAll('.course-card__meta li').forEach(li => { if (/co_present/.test(li.textContent)) li.remove(); });
      carte.id = '__carte';`,
    zone: `__marge(__boite(document.querySelector('#__carte')), 10)`,
    reperes: { bouton: '#__carte .course-card__cta', badge: '#__carte .course-card__badges', titre: '#__carte .course-card__title' }
  },
  {
    // Le programme de la fiche Canva Pro (premier module ouvert, comme en ligne)
    nom: 'fiche-programme',
    adresse: '/formations/canva-pro/',
    avant: OUTILS,
    zone: `__marge(__boite(document.querySelector('#programme-section')), 8)`,
    reperes: { entete: '#programme-section h2', module4: '#programme-section .programme-accordion:last-child' }
  },
  {
    // Le bouton d'inscription de la fiche
    nom: 'fiche-bouton',
    adresse: '/formations/canva-pro/',
    avant: OUTILS,
    zone: `__marge(__boite(document.querySelector('.fiche-hero__actions a[data-register-formation]')), 14)`,
    reperes: { bouton: '.fiche-hero__actions a[data-register-formation]' }
  },
  {
    // L'en-tête du formulaire officiel
    nom: 'formulaire-entete',
    adresse: '/formations/canva-pro/',
    avant: OUTILS + `
      const surtitre = [...document.querySelectorAll('.eyebrow')].find(e => /VOTRE INSCRIPTION/i.test(e.textContent));
      const bloc = surtitre.parentElement;
      bloc.id = '__entete';`,
    zone: `__marge(__boite(document.querySelector('#__entete')), 12)`
  },
  {
    // Les quatre étapes du formulaire (étape 1 active)
    nom: 'formulaire-etapes',
    adresse: '/formations/canva-pro/',
    avant: OUTILS,
    zone: `__marge(__boite(document.querySelector('#mobile-progress')), 4)`,
    reperes: { infos: '#mobile-progress [data-step="1"]' }
  },
  {
    // Étape 1 : titre, Nom, Prénom — vides. Le champ téléphone (indicatif du pays) reste hors cadre.
    nom: 'formulaire-champs',
    adresse: '/formations/canva-pro/',
    avant: OUTILS,
    zone: `(() => {
      const section = document.querySelector('#section-1');
      const tel = [...section.querySelectorAll('label')].find(l => /T[ée]l[ée]phone/.test(l.textContent));
      const haut = __boite(section);
      const bas = __boite(tel);
      return { x: Math.max(0, haut.x - 14), y: haut.y - 14, largeur: Math.min(390, haut.largeur + 28), hauteur: bas.y - haut.y + 2 };
    })()`
  }
];

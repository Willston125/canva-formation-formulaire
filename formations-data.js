/* =========================================
   DONNÉES CENTRALISÉES DU SITE
   Source unique pour le catalogue, les sessions et le portfolio.
   Ces objets sont prévus pour être remplacés plus tard par des
   données issues du backend sans changer les composants.
   Les valeurs non confirmées restent explicitement « À confirmer ».
   ========================================= */

/**
 * @typedef {Object} Formation
 * @property {string} id                 Identifiant technique unique
 * @property {string} slug               Segment d'URL
 * @property {string} title              Nom commercial complet
 * @property {string} shortTitle         Nom court (menus, résumés)
 * @property {string} category
 * @property {string} promise            Promesse courte (carte)
 * @property {string} shortDescription   Description courte (fiche)
 * @property {string} image              Visuel dédié (chemin absolu)
 * @property {string} imageAlt
 * @property {string} duration
 * @property {string} level
 * @property {string} mode
 * @property {number|null} price         FDJ, null si non confirmé
 * @property {string|null} nextSession   ISO (YYYY-MM-DD), null si non annoncée
 * @property {number|null} places        Places réellement disponibles, null si inconnu
 * @property {boolean} registrationOpen  Inscriptions ouvertes (formulaire accessible)
 * @property {string} href               Lien vers la fiche (page dédiée ou fiche rapide)
 * @property {boolean} hasDetailPage     true si une page dédiée existe
 * @property {string} formId             Identifiant transmis au formulaire (champ caché `formation`)
 */

/** @type {ReadonlyArray<Readonly<Formation>>} */
window.FORMATIONS = Object.freeze([
  Object.freeze({
    id: 'formation-canva-pro',
    slug: 'canva-pro',
    title: 'Canva Pro & Création de contenu',
    shortTitle: 'Canva Pro',
    category: 'Design digital',
    promise: 'Créez des visuels professionnels prêts à publier.',
    shortDescription: 'Maîtrisez Canva Pro pour concevoir des contenus cohérents, une identité de marque et un portfolio de réalisations publiables.',
    image: '/assets/illustrations/canva-pro.svg',
    imageAlt: 'Illustration : interface de création graphique sur ordinateur',
    duration: '12 jours',
    level: 'Tous niveaux',
    mode: 'Présentiel',
    price: 7500,
    nextSession: null,
    places: null,
    registrationOpen: true,
    href: '/formations/canva-pro/',
    hasDetailPage: true,
    formId: 'canva-pro'
  }),
  Object.freeze({
    id: 'formation-community-management',
    slug: 'community-management',
    title: 'Community Management & Stratégie digitale',
    shortTitle: 'Community Management',
    category: 'Communication digitale',
    promise: 'Passez de l’idée à un calendrier de contenus.',
    shortDescription: 'Structurez une présence sociale claire, planifiez vos publications et produisez des contenus adaptés à chaque canal.',
    image: '/assets/illustrations/community-management.svg',
    imageAlt: 'Illustration : calendrier de planification de contenus',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    nextSession: null,
    places: null,
    registrationOpen: false,
    href: '/?fiche=community-management#formations',
    hasDetailPage: false,
    formId: 'community-management'
  }),
  Object.freeze({
    id: 'formation-identite-visuelle',
    slug: 'identite-visuelle',
    title: 'Graphisme & Identité visuelle',
    shortTitle: 'Identité visuelle',
    category: 'Direction artistique',
    promise: 'Construisez un langage visuel durable.',
    shortDescription: 'Posez les bases d’un univers graphique reconnaissable : charte, typographies, couleurs et déclinaisons sur vos supports.',
    image: '/assets/illustrations/identite-visuelle.svg',
    imageAlt: 'Illustration : charte graphique avec typographies et palette de couleurs',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    nextSession: null,
    places: null,
    registrationOpen: false,
    href: '/?fiche=identite-visuelle#formations',
    hasDetailPage: false,
    formId: 'identite-visuelle'
  }),
  Object.freeze({
    id: 'formation-photo-video',
    slug: 'photo-video',
    title: 'Photo & Vidéo professionnelle',
    shortTitle: 'Photo & Vidéo',
    category: 'Création visuelle',
    promise: 'Cadrez, éclairez et racontez avec intention.',
    shortDescription: 'Découvrez les fondamentaux d’une image lisible et d’un tournage maîtrisé : cadrage, lumière, son et préparation.',
    image: '/assets/illustrations/photo-video.svg',
    imageAlt: 'Illustration : appareil photo en situation de tournage',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    nextSession: null,
    places: null,
    registrationOpen: false,
    href: '/?fiche=photo-video#formations',
    hasDetailPage: false,
    formId: 'photo-video'
  }),
  Object.freeze({
    id: 'formation-montage-video',
    slug: 'montage-video',
    title: 'Montage vidéo : CapCut Pro & DaVinci Resolve',
    shortTitle: 'Montage vidéo',
    category: 'Postproduction',
    promise: 'Transformez vos rushes en récits fluides.',
    shortDescription: 'Organisez vos séquences, rythmez vos contenus et finalisez des vidéos pensées pour le numérique avec CapCut Pro et DaVinci Resolve.',
    image: '/assets/illustrations/montage-video.svg',
    imageAlt: 'Illustration : timeline de montage vidéo',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    nextSession: null,
    places: null,
    registrationOpen: false,
    href: '/?fiche=montage-video#formations',
    hasDetailPage: false,
    formId: 'montage-video'
  }),
  Object.freeze({
    id: 'formation-realisation',
    slug: 'realisation-audiovisuelle',
    title: 'Réalisation audiovisuelle & Court-métrage',
    shortTitle: 'Réalisation',
    category: 'Narration audiovisuelle',
    promise: 'Préparez et dirigez un projet filmé avec méthode.',
    shortDescription: 'Explorez les choix de mise en scène, la préparation d’un tournage et la direction d’un court-métrage de bout en bout.',
    image: '/assets/illustrations/realisation.svg',
    imageAlt: 'Illustration : clap de cinéma sur un plateau de tournage',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    nextSession: null,
    places: null,
    registrationOpen: false,
    href: '/?fiche=realisation-audiovisuelle#formations',
    hasDetailPage: false,
    formId: 'realisation-cinema'
  })
]);

/**
 * @typedef {Object} Session
 * @property {string} id             Identifiant de session (transmis au formulaire via `sessionId`)
 * @property {string} formId         Formation concernée (Formation.formId)
 * @property {string} startDate      ISO (YYYY-MM-DD)
 * @property {string|null} endDate   ISO (YYYY-MM-DD)
 * @property {string} schedule       Ex. « Jeudi, vendredi et samedi · 18h – 20h »
 * @property {string} duration       Ex. « 12 jours · 24 heures »
 * @property {string} location       Ex. « Saalam Tower, 5ème étage, Djibouti »
 * @property {string} mode           Présentiel / En ligne / Hybride
 * @property {number|null} price     FDJ
 * @property {number|null} placesTotal
 * @property {number|null} placesAvailable  Places réellement disponibles (null = inconnu)
 * @property {boolean} registrationOpen
 */

/**
 * Sessions à venir. Liste volontairement vide : la session Canva Pro du
 * 16 avril 2026 est terminée et aucune nouvelle date n'a été confirmée.
 * Pour annoncer une session, ajoutez un objet conforme au typedef ci-dessus, par ex. :
 * {
 *   id: 'canva-pro-2026-11', formId: 'canva-pro', startDate: '2026-11-05', endDate: '2026-11-28',
 *   schedule: 'Jeudi, vendredi et samedi · 18h – 20h', duration: '12 jours · 24 heures',
 *   location: 'Saalam Tower, 5ème étage, Djibouti', mode: 'Présentiel', price: 7500,
 *   placesTotal: 20, placesAvailable: 20, registrationOpen: true
 * }
 * @type {ReadonlyArray<Readonly<Session>>}
 */
window.SESSIONS = Object.freeze([]);

/**
 * @typedef {Object} PortfolioItem
 * @property {string} id
 * @property {string} category
 * @property {string} title
 * @property {string} description
 * @property {string|null} image      null = emplacement à fournir
 * @property {string} imageAlt
 * @property {string} imagePosition
 * @property {string|null} href       Lien optionnel vers le projet
 * @property {boolean} placeholder    true = contenu réel encore à fournir
 */

/**
 * Réalisations affichées sur l'accueil. Seuls les visuels réellement présents
 * dans le projet sont utilisés ; les autres emplacements sont signalés « à fournir ».
 * @type {ReadonlyArray<Readonly<PortfolioItem>>}
 */
window.PORTFOLIO = Object.freeze([
  Object.freeze({
    id: 'affiche-canva-pro',
    category: 'Affiche',
    title: 'Affiche de la formation Canva Pro',
    description: 'Support de communication conçu pour le lancement du programme intensif.',
    image: '/assets/images/formation canva (2).jpg',
    imageAlt: 'Affiche de la formation Canva Pro',
    imagePosition: '50% 18%',
    href: null,
    placeholder: false
  }),
  Object.freeze({
    id: 'banniere-communication-1',
    category: 'Campagne de communication',
    title: 'Bannière réseaux sociaux — Impact Ali William',
    description: 'Visuel de couverture présentant l’offre de services en communication digitale et vidéo.',
    image: '/assets/images/Bannière facebook impactali 01 (1).jpg',
    imageAlt: 'Bannière de communication Impact Ali William, version 1',
    imagePosition: '60% 50%',
    href: null,
    placeholder: false
  }),
  Object.freeze({
    id: 'banniere-communication-2',
    category: 'Contenu numérique',
    title: 'Bannière réseaux sociaux — déclinaison',
    description: 'Déclinaison de la bannière avec une hiérarchie d’information retravaillée.',
    image: '/assets/images/Bannière facebook impactali 01.jpg',
    imageAlt: 'Bannière de communication Impact Ali William, version 2',
    imagePosition: '30% 50%',
    href: null,
    placeholder: false
  }),
  Object.freeze({
    id: 'placeholder-video',
    category: 'Vidéo',
    title: 'Production vidéo',
    description: 'Extrait ou miniature d’une vidéo réalisée par le formateur — contenu à fournir.',
    image: null,
    imageAlt: '',
    imagePosition: '50% 50%',
    href: null,
    placeholder: true
  }),
  Object.freeze({
    id: 'placeholder-identite',
    category: 'Identité visuelle',
    title: 'Identité visuelle réalisée',
    description: 'Logo, charte et déclinaisons pour une organisation — contenu à fournir.',
    image: null,
    imageAlt: '',
    imagePosition: '50% 50%',
    href: null,
    placeholder: true
  }),
  Object.freeze({
    id: 'placeholder-photo',
    category: 'Photographie',
    title: 'Série photographique',
    description: 'Sélection de photographies professionnelles — contenu à fournir.',
    image: null,
    imageAlt: '',
    imagePosition: '50% 50%',
    href: null,
    placeholder: true
  })
]);

/** Contact officiel utilisé par les liens WhatsApp du site (numéro déjà en usage). */
window.SITE_CONTACT = Object.freeze({
  whatsappNumber: '25377145306',
  whatsappDisplay: '+253 77 14 53 06'
});

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
 * @property {string} family             Famille utilisée par les filtres du catalogue
 * @property {string} promise            Promesse courte (carte)
 * @property {string} shortDescription   Description courte (fiche)
 * @property {string} image              Visuel dédié (chemin absolu)
 * @property {string} imageAlt
 * @property {string} duration
 * @property {string} level
 * @property {string} mode
 * @property {number|null} price         FDJ, null si non confirmé
 * @property {number|null} modules       Nombre de modules du programme, null si non défini
 * @property {string[]} learnings        2 à 3 acquis concrets (programme publié, ou reformulation de la description éditoriale)
 * @property {boolean} featured          Mise en avant dans la grille (programme publié et inscriptions ouvertes)
 * @property {string|null} nextSession   ISO (YYYY-MM-DD), null si non annoncée
 * @property {number|null} places        Places réellement disponibles, null si inconnu
 * @property {boolean} registrationOpen  Inscriptions ouvertes (formulaire accessible)
 * @property {boolean} [active]          Formation publiée et visible (true par défaut)
 * @property {boolean} [allowRegistrationWithoutSession] Autorise explicitement une inscription sans session datée
 * @property {string} href               Lien vers la fiche (page dédiée ou fiche rapide)
 * @property {boolean} hasDetailPage     true si une page dédiée existe
 * @property {string} formId             Identifiant transmis au formulaire (champ caché `formation`)
 * @property {string} [poster]           Affiche dédiée (par défaut : `image`)
 * @property {string} [lead]             Accroche de la fiche, HTML léger autorisé (par défaut : `shortDescription`)
 * @property {string} [levelSubject]     Sujet de la question « Où en es-tu avec … ? » (par défaut : formulation générique)
 * @property {{icon: string, label: string, value: string}[]} [objectives]  Objectifs proposés à l'étape 2 (par défaut : liste commune)
 */

/** @type {ReadonlyArray<Readonly<Formation>>} */
window.FORMATIONS = Object.freeze([
  Object.freeze({
    id: 'formation-canva-pro',
    slug: 'canva-pro',
    title: 'Canva Pro & Création de contenu',
    shortTitle: 'Canva Pro',
    category: 'Création de contenu',
    family: 'Design & Contenu',
    promise: 'Créer, captiver, partager.',
    shortDescription: 'Maîtrisez Canva Pro pour concevoir des contenus cohérents, une identité de marque et un portfolio de réalisations publiables.',
    image: '/assets/images/formations/canva-pro.webp',
    imageAlt: 'Le formateur en studio face caméra, micro de studio et ordinateur portable sur le bureau',
    duration: '12 jours',
    level: 'Tous niveaux',
    mode: 'Présentiel',
    price: 7500,
    modules: 4,
    learnings: [
      'Créer un Brand Kit et maîtriser l’interface Canva Pro',
      'Concevoir posts, carrousels et Reels qui captent l’attention',
      'Vendre une offre de design et trouver ses premiers clients'
    ],
    featured: true,
    nextSession: null,
    places: null,
    registrationOpen: true,
    active: true,
    allowRegistrationWithoutSession: true,
    href: '/formations/canva-pro/',
    hasDetailPage: true,
    formId: 'canva-pro',
    poster: '/assets/images/formation canva (2).jpg',
    lead: 'Devenez graphiste, community manager ou créateur de contenu grâce à <strong>12 jours de pratique 100 % concrète</strong>. Un programme intensif en 4 modules pour maîtriser Canva Pro et repartir avec un portfolio validé.',
    levelSubject: 'Canva',
    objectives: [
      { icon: 'forum', label: 'Devenir Community Manager', value: 'Devenir Community Manager' },
      { icon: 'brush', label: 'Graphiste freelance', value: 'Travailler comme Graphiste freelance' },
      { icon: 'business_center', label: 'Contenu pour mon entreprise', value: 'Créer du contenu pour mon entreprise' },
      { icon: 'swap_horiz', label: 'Changer de carrière', value: 'Changer de carrière' },
      { icon: 'trending_up', label: 'Améliorer mes compétences actuelles', value: 'Améliorer mes compétences actuelles' }
    ]
  }),
  Object.freeze({
    id: 'formation-community-management',
    slug: 'community-management',
    title: 'Community Management',
    shortTitle: 'Community Management',
    category: 'Réseaux sociaux',
    family: 'Communication',
    promise: 'Créer, engager, faire grandir.',
    shortDescription: 'Structurez une présence sociale claire, planifiez vos publications et faites grandir une communauté réellement engagée.',
    image: '/assets/images/formations/community-management.webp',
    imageAlt: 'Le formateur à son bureau, smartphone affichant un tableau de bord d’audience entouré d’icônes de réseaux sociaux',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    modules: null,
    learnings: [
      'Bâtir une stratégie de présence sur les réseaux',
      'Produire des contenus qui engagent votre communauté',
      'Suivre votre croissance et vos résultats'
    ],
    featured: false,
    nextSession: null,
    places: null,
    registrationOpen: false,
    active: true,
    allowRegistrationWithoutSession: false,
    href: '/formations/community-management/',
    hasDetailPage: true,
    formId: 'community-management'
  }),
  Object.freeze({
    id: 'formation-identite-visuelle',
    slug: 'identite-visuelle',
    title: 'Graphisme & identité visuelle',
    shortTitle: 'Identité visuelle',
    category: 'Direction artistique',
    family: 'Design & Contenu',
    promise: 'Imaginer, structurer, marquer.',
    shortDescription: 'Posez les bases d’un univers graphique reconnaissable : charte, typographies, couleurs et déclinaisons sur vos supports.',
    image: '/assets/images/formations/identite-visuelle.webp',
    imageAlt: 'Le formateur à son bureau avec des planches de charte graphique, un nuancier et des ouvrages de design',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    modules: null,
    learnings: [
      'Nourrir votre créativité et vos partis pris visuels',
      'Construire une identité de marque cohérente',
      'Décliner votre design sur tous vos supports'
    ],
    featured: false,
    nextSession: null,
    places: null,
    registrationOpen: false,
    active: true,
    allowRegistrationWithoutSession: false,
    href: '/formations/identite-visuelle/',
    hasDetailPage: true,
    formId: 'identite-visuelle'
  }),
  Object.freeze({
    id: 'formation-photo-video',
    slug: 'photo-video',
    title: 'Photo & Vidéo',
    shortTitle: 'Photo & Vidéo',
    category: 'Photo & Vidéo',
    family: 'Photo & Vidéo',
    promise: 'Filmer, monter, sublimer.',
    shortDescription: 'Cadrez, éclairez et montez des images nettes, du tournage jusqu’à la livraison d’une vidéo aboutie.',
    image: '/assets/images/formations/photo-video.webp',
    imageAlt: 'Le formateur debout en studio, appareil photo en main, optiques et clap posés sur le bureau',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    modules: null,
    learnings: [
      'Préparer et mener un tournage',
      'Monter vos séquences avec du rythme',
      'Livrer des images de qualité professionnelle'
    ],
    featured: false,
    nextSession: null,
    places: null,
    registrationOpen: false,
    active: true,
    allowRegistrationWithoutSession: false,
    href: '/formations/photo-video/',
    hasDetailPage: true,
    formId: 'photo-video'
  }),
  Object.freeze({
    id: 'formation-marketing-digital',
    slug: 'marketing-digital',
    title: 'Marketing digital',
    shortTitle: 'Marketing digital',
    category: 'Marketing digital',
    family: 'Marketing',
    promise: 'Attirer, convertir, grandir.',
    shortDescription: 'Construisez des campagnes qui attirent une audience, la convertissent en clients et font grandir votre activité.',
    image: '/assets/images/formations/marketing-digital.webp',
    imageAlt: 'Le formateur en costume à son bureau, ordinateur portable ouvert et courbe de croissance affichée derrière lui',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    modules: null,
    learnings: [
      'Définir une stratégie digitale claire',
      'Lancer des campagnes qui convertissent',
      'Mesurer et améliorer vos résultats'
    ],
    featured: false,
    nextSession: null,
    places: null,
    registrationOpen: false,
    active: true,
    allowRegistrationWithoutSession: false,
    href: '/formations/marketing-digital/',
    hasDetailPage: true,
    formId: 'marketing-digital'
  }),
  Object.freeze({
    id: 'formation-ia-appliquee',
    slug: 'ia-appliquee',
    title: 'IA appliquée',
    shortTitle: 'IA appliquée',
    category: 'Intelligence artificielle',
    family: 'Intelligence artificielle',
    promise: 'Automatiser, créer, accélérer.',
    shortDescription: 'Intégrez les outils d’intelligence artificielle à votre travail quotidien pour produire plus vite, sans perdre en qualité.',
    image: '/assets/images/formations/ia-appliquee.webp',
    imageAlt: 'Le formateur à son bureau devant un ordinateur portable, interfaces d’outils d’intelligence artificielle affichées',
    duration: 'À confirmer',
    level: 'À confirmer',
    mode: 'À confirmer',
    price: null,
    modules: null,
    learnings: [
      'Prendre en main les principaux outils d’IA',
      'Gagner du temps sur vos tâches répétitives',
      'Automatiser vos flux de production'
    ],
    featured: false,
    nextSession: null,
    places: null,
    registrationOpen: false,
    active: true,
    allowRegistrationWithoutSession: false,
    href: '/formations/ia-appliquee/',
    hasDetailPage: true,
    formId: 'ia-appliquee'
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
 * @property {number|null} price     Tarif dans la devise de la session (voir `currency`)
 * @property {number|null} placesTotal
 * @property {number|null} placesAvailable  Places réellement disponibles (null = inconnu)
 * @property {boolean} registrationOpen
 * @property {string} [currency]        Devise (par défaut : SITE_CONTACT.currency)
 * @property {string} [countryCode]     Indicatif téléphonique (par défaut : SITE_CONTACT.countryCode)
 * @property {string} [phoneLocalPattern]  Règle de saisie du numéro local (par défaut : SITE_CONTACT.phoneLocalPattern)
 * @property {string} [phoneFormatHint]    Message affiché si le numéro ne respecte pas la règle
 * @property {PaymentMethod[]} [paymentMethods]  Moyens de paiement propres à la session (par défaut : SITE_CONTACT.paymentMethods)
 */

/**
 * @typedef {Object} PaymentMethod
 * @property {'Waafi Mobile Money'|'Cacpay'|'Espèces'} value  Valeur enregistrée (inchangée : la feuille Google la lit)
 * @property {string} label
 * @property {'mobile'|'cash'} kind
 * @property {string} [image]          Logo (moyens mobiles)
 * @property {string} [numberLabel]    « Numéro » ou « Numéro de compte »
 * @property {string} [number]         Numéro à créditer
 * @property {string} [accountName]
 * @property {string} [recipient]      Espèces : à remettre à
 * @property {string} [place]          Espèces : lieu
 * @property {string} [phone]          Espèces : sur rendez-vous
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
 * Une formation reste au catalogue même sans session, ou avec des sessions passées :
 * la fiche affiche alors « aucune session annoncée » sans jamais inventer de date.
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
  whatsappDisplay: '+253 77 14 53 06',
  contactName: 'Ali William',
  countryCode: '+253',
  currency: 'FDJ',
  /** Règle de saisie du numéro local pour ce marché (Djibouti). Une session peut la surcharger. */
  phoneLocalPattern: '^(77|67)\\d{6}$',
  phoneFormatHint: 'Format invalide. Utilisez 77XXXXXX ou 67XXXXXX',
  /** Moyens de paiement par défaut (une session peut les surcharger via `paymentMethods`). */
  paymentMethods: Object.freeze([
    Object.freeze({ value: 'Waafi Mobile Money', label: 'Waafi', kind: 'mobile', image: '/assets/images/waafi.png', numberLabel: 'Numéro', number: '+253 77 55 63 44', accountName: 'Ali William' }),
    Object.freeze({ value: 'Cacpay', label: 'Cacpay', kind: 'mobile', image: '/assets/images/cacpay.png', numberLabel: 'Numéro de compte', number: '11000012127', accountName: 'Ali William' }),
    Object.freeze({ value: 'Espèces', label: 'Espèces', kind: 'cash', recipient: 'Ali William', place: 'Saalam Tower, 5ème étage', phone: '+253 77 14 53 06' })
  ])
});

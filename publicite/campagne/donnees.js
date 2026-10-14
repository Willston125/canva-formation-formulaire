/* Les textes de la campagne : 10 maquettes par formation.
 *
 * Ce fichier ne porte que l'éditorial (accroches, cibles, questions, cadrages photo).
 * Les dates, les tarifs, les numéros WhatsApp et les places restantes NE SONT PAS ICI :
 * rendre.js les lit sur impactali.site au moment du rendu (rendus/campagne/_live.json),
 * pour qu'un visuel n'affiche jamais un chiffre que le site ne confirme pas.
 *
 * Règle n° 1 : un texte générique ne cite ni prix, ni lieu, ni numéro. Les textes propres
 * à un pays vivent dans MARCHES. rendre.js vérifie chaque visuel. */
window.CAMPAGNE = {
  MARCHES: {
    km: {
      tag: 'Comores · en présentiel',
      lieuLibelle: 'Lieu',
      lieu: 'American Corner (IFERE), Moroni',
      lieuCourt: 'Moroni',
      bandeau: 'American Corner (IFERE), Moroni · en présentiel · 18h30 – 20h30',
      certificat: 'clair',
      certificatLieu: 'Moroni, Comores',
      certificatVille: 'Moroni'
    },
    dj: {
      tag: 'Djibouti · en ligne',
      lieuLibelle: 'Format',
      lieu: 'En ligne · séances enregistrées',
      lieuCourt: 'en ligne',
      bandeau: 'En ligne, en direct · chaque séance est enregistrée · 18h30 – 20h30',
      certificat: 'sombre',
      certificatLieu: 'En ligne',
      certificatVille: 'Djibouti'
    }
  },

  /* Les points focaux des photos, en pixels de la photo source (1122 × 1402) :
     visage = centre du visage ; geste = la main, l'outil, le décor qui racontent le métier. */
  FORMATIONS: {
    'canva-pro': {
      titre: 'Canva Pro & Création de contenu',
      court: 'Canva Pro',
      lignes: ['Canva Pro', '&amp; Création', 'de contenu'],
      vertes: [0],
      motCle: 'CANVA',
      promesse: 'Des visuels et des vidéos qui arrêtent le défilement, même en partant de zéro.',
      photo: 'canva-pro.jpg',
      visage: [765, 400],
      geste: [610, 820],
      modules: [
        { titre: 'Design &amp; identité', icone: 'design_services', points: ['Psychologie des couleurs et typographies', 'Créer un Brand Kit pro', 'Hiérarchie visuelle et équilibre', 'Maîtrise de l’interface Canva Pro'] },
        { titre: 'Stratégie de contenu', icone: 'phone_iphone', points: ['Posts et carrousels irrésistibles', 'Storytelling et copywriting visuel', 'Planning éditorial et automatisation', 'Audit et optimisation de compte'] },
        { titre: 'Vidéo &amp; IA', icone: 'movie', points: ['Montage de Reels et TikTok', 'Animations et transitions', 'Studio Magique et IA générative', 'Effets spéciaux et trucages photo'] },
        { titre: 'Business &amp; freelance', icone: 'rocket_launch', points: ['Trouver ses premiers clients', 'Vendre une offre de design', 'Gestion de projets et mockups', 'Certificat et lancement pro'] }
      ],
      vitrine: 'avant-apres',
      cible1: { etiquette: 'Étudiants &amp; jeunes diplômés', lignes: ['Votre CV le dit.', 'Votre portfolio', 'le prouve.'], vertes: [1, 2],
        texte: 'En 6 soirées, des créations réelles à montrer en entretien.' },
      cible2: { etiquette: 'Salariés &amp; ONG', question: 'Une affiche pour vendredi ?', reponse: 'Faites-la vous-même.',
        points: ['Après le travail, 18h30 – 20h30', 'Affiches, posts, présentations', 'Un projet final à présenter'] },
      cible3: { etiquette: 'Freelances', lignes: ['Les clients', 'n’achètent pas', 'Canva.'], suite: 'Ils achètent des visuels qui vendent.',
        texte: 'Module 4 : trouver ses premiers clients, vendre une offre de design.' },
      questions: [
        ['Je n’ai jamais ouvert Canva.', 'On part des bases, pas à pas. La formation est faite pour les débutants.'],
        ['Faut-il payer Canva Pro ?', 'Non. Votre compte Canva gratuit suffit pour commencer.'],
        ['Que vaut le certificat ?', 'Il n’est remis qu’après validation de votre projet final : il atteste un travail réel.']
      ]
    },

    'identite-visuelle': {
      titre: 'Graphisme & identité visuelle',
      court: 'Graphisme',
      lignes: ['Graphisme', '&amp; identité', 'visuelle'],
      vertes: [0],
      motCle: 'GRAPHISME',
      promesse: 'Logo, charte, affiche : une identité qu’on reconnaît au premier coup d’œil.',
      photo: 'identite-visuelle.jpg',
      visage: [720, 390],
      geste: [640, 600],
      modules: [
        { titre: 'Les bases du graphisme', icone: 'palette', points: ['Couleurs, contrastes et harmonies', 'Typographies et hiérarchie du texte', 'Composition et équilibre d’une page', 'Prise en main de Canva Pro et Photoshop'] },
        { titre: 'Logo &amp; charte graphique', icone: 'design_services', points: ['Du brief à l’idée : recherches et croquis', 'Dessiner et décliner un logo', 'Construire la charte graphique', 'Présenter une identité à un client'] },
        { titre: 'Affiches &amp; retouche photo', icone: 'brush', points: ['Une affiche qui se lit de loin', 'Retouche et détourage photo', 'Décliner l’identité sur les réseaux', 'Projet final et remise du certificat'] }
      ],
      vitrine: 'identite',
      cible1: { etiquette: 'Étudiants &amp; créatifs', lignes: ['Pas besoin', 'de savoir dessiner.', 'Il faut savoir composer.'], vertes: [2],
        texte: 'Couleurs, typographies, composition : les règles qui font un bon visuel.' },
      cible2: { etiquette: 'Commerçants &amp; entrepreneurs', question: 'Votre marque se reconnaît-elle au premier coup d’œil ?', reponse: 'Donnez-lui une identité.',
        points: ['Un logo simple et mémorable', 'Une charte : couleurs, typographies, règles', 'Des affiches cohérentes partout'] },
      cible3: { etiquette: 'Freelances', lignes: ['Un logo', 'se vend avec', 'sa charte.'], suite: 'Du brief à la présentation client.',
        texte: 'La méthode d’un vrai projet d’identité, dans votre portfolio.' },
      questions: [
        ['Faut-il savoir dessiner ?', 'Non. Le graphisme s’apprend par des règles de composition, de couleur et de typographie.'],
        ['Quels logiciels utilise-t-on ?', 'Canva Pro pour aller vite, Photoshop pour la retouche et les créations poussées.'],
        ['Que vais-je réaliser ?', 'Un logo, sa charte graphique et une affiche, réunis dans votre portfolio.']
      ]
    },

    'marketing-digital': {
      titre: 'Marketing digital',
      court: 'Marketing digital',
      lignes: ['Marketing', 'digital'],
      vertes: [1],
      motCle: 'MARKETING',
      promesse: 'Attirez une audience, transformez-la en clients et mesurez ce qui marche.',
      photo: 'marketing-digital.jpg',
      visage: [725, 480],
      geste: [560, 760],
      modules: [
        { titre: 'Stratégie', icone: 'lightbulb', points: ['Comprendre son marché et sa cible', 'Définir son offre et son message', 'Choisir ses réseaux sociaux', 'Construire un calendrier de publication'] },
        { titre: 'Campagnes', icone: 'campaign', points: ['Des contenus qui attirent et qui vendent', 'Publicité Facebook et Instagram : les bases', 'Vendre sur WhatsApp Business', 'Lancer une campagne pas à pas'] },
        { titre: 'Résultats', icone: 'trending_up', points: ['Les indicateurs qui comptent vraiment', 'Lire les statistiques de ses pages', 'Ajuster une campagne qui ne marche pas', 'Projet final et remise du certificat'] }
      ],
      vitrine: 'campagne',
      cible1: { etiquette: 'Commerçants &amp; entrepreneurs', lignes: ['Vos clients sont', 'sur Facebook', 'et WhatsApp.'], vertes: [1, 2],
        texte: 'Cible, message, contenus, WhatsApp Business : une méthode pour vendre en ligne.' },
      cible2: { etiquette: 'Salariés &amp; ONG', question: 'On publie, mais rien ne se passe ?', reponse: 'Il vous manque un plan.',
        points: ['Une cible et un message clairs', 'Un calendrier de publication', 'Les indicateurs qui comptent'] },
      cible3: { etiquette: 'Étudiants &amp; porteurs de projet', lignes: ['Apprenez', 'sur un vrai', 'cas concret.'], suite: 'Sans dépenser en publicité.',
        texte: 'Une stratégie et une campagne complètes, dans votre portfolio.' },
      questions: [
        ['Faut-il un budget publicitaire ?', 'Non. Vous construisez stratégie et campagne sur un cas concret, sans dépenser en publicité.'],
        ['Je n’ai pas encore d’entreprise.', 'Travaillez sur un projet personnel, ou sur l’entreprise que vous voulez accompagner.'],
        ['Que vais-je réaliser ?', 'Une stratégie digitale complète et une campagne, dans votre portfolio.']
      ]
    },

    'ia-appliquee': {
      titre: 'Création de site web avec iA',
      court: 'Site web avec iA',
      lignes: ['Création', 'de site web', 'avec l’iA'],
      vertes: [2],
      motCle: 'SITE',
      promesse: 'Décrivez votre site à l’IA, ajustez-le et mettez-le en ligne, sans écrire de code.',
      photo: 'ia-appliquee.jpg',
      visage: [745, 470],
      geste: [560, 760],
      modules: [
        { titre: 'Préparer son site avec l’IA', icone: 'lightbulb', points: ['Bien utiliser ChatGPT, et ses limites', 'Définir l’objectif et le public du site', 'Écrire des instructions précises', 'Plan du site et contenus de chaque page'] },
        { titre: 'Construire le site', icone: 'smart_toy', points: ['Une première version avec Claude Code et Antigravity', 'Ajuster le design et la mise en page', 'Rédiger et illustrer avec l’IA', 'Adapter le site au téléphone'] },
        { titre: 'Mettre en ligne', icone: 'rocket_launch', points: ['Nom de domaine et hébergement', 'Formulaire de contact et lien WhatsApp', 'Être trouvé sur Google : les bases', 'Mise en ligne et remise du certificat'] }
      ],
      vitrine: 'site',
      cible1: { etiquette: 'Commerçants &amp; entrepreneurs', lignes: ['Pas de site,', 'pas de vitrine.', 'Créez la vôtre.'], vertes: [2],
        texte: 'Un site professionnel avec bouton WhatsApp, sans être développeur.' },
      cible2: { etiquette: 'Associations &amp; ONG', question: 'Un site, c’est trop compliqué ?', reponse: 'Plus avec l’IA.',
        points: ['Vous décrivez, l’IA construit', 'Vous ajustez, sans coder', 'Vous le mettez en ligne'] },
      cible3: { etiquette: 'Curieux &amp; freelances', lignes: ['Apprenez', 'à guider l’IA,', 'pas à coder.'], suite: 'De l’idée au site en ligne.',
        texte: 'Prompts, design, mise en ligne : une méthode complète.' },
      questions: [
        ['Faut-il savoir coder ?', 'Non. Vous décrivez votre site en français, l’IA le construit ; vous apprenez à la guider.'],
        ['Quels outils utilise-t-on ?', 'ChatGPT pour préparer le projet, Claude Code et Antigravity pour construire le site.'],
        ['Que faut-il apporter ?', 'Un ordinateur portable et une connexion internet. Aucune connaissance en programmation.']
      ]
    },

    'photo-video': {
      titre: 'Réalisation et Montage vidéo',
      court: 'Vidéo',
      lignes: ['Réalisation', '&amp; Montage', 'vidéo'],
      vertes: [2],
      motCle: 'VIDÉO',
      promesse: 'Du scénario au montage final : apprenez à raconter une histoire en images.',
      photo: 'photo-video.jpg',
      visage: [720, 270],
      geste: [600, 460],
      modules: [
        { titre: 'Écrire et préparer', icone: 'edit_note', points: ['Trouver une idée, l’écrire en scénario', 'Le découpage technique, plan par plan', 'Les valeurs de plan et leur sens', 'Préparer un tournage'] },
        { titre: 'Cadrer et tourner', icone: 'photo_camera', points: ['Règles de cadrage et de composition', 'Lumière naturelle et éclairage simple', 'Prise de son de base', 'Tournage d’une courte séquence'] },
        { titre: 'Monter et livrer', icone: 'movie', points: ['CapCut Pro et DaVinci Resolve', 'Rythme, raccords et transitions', 'Étalonnage, musique et titres', 'Export et remise du certificat'] }
      ],
      vitrine: 'video',
      cible1: { etiquette: 'Créateurs &amp; étudiants', lignes: ['Votre téléphone', 'suffit. Il manque', 'la méthode.'], vertes: [2],
        texte: 'Écrire, cadrer, tourner, monter : de l’idée à la vidéo aboutie.' },
      cible2: { etiquette: 'Entrepreneurs', question: 'Des vidéos floues, trop longues, sans son ?', reponse: 'Passez au niveau pro.',
        points: ['Un cadrage net, une lumière simple', 'Un son propre', 'Un montage rythmé, prêt à publier'] },
      cible3: { etiquette: 'Associations &amp; ONG', lignes: ['Racontez', 'votre impact', 'en images.'], suite: 'Une vidéo qui donne envie de vous suivre.',
        texte: 'Du scénario au montage final, en 6 soirées.' },
      questions: [
        ['Faut-il une caméra professionnelle ?', 'Non. Un smartphone récent suffit pour apprendre à cadrer, tourner et monter.'],
        ['Quels logiciels de montage ?', 'CapCut Pro et DaVinci Resolve.'],
        ['Que vais-je réaliser ?', 'Une courte vidéo, de l’écriture au montage final, dans votre portfolio.']
      ]
    }
  }
};

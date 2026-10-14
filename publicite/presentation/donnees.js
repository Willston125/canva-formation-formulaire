/* =========================================================================
   IMPACTALI — Présentation vidéo : TOUT CE QUI SE MODIFIE SANS CODER
   -------------------------------------------------------------------------
   Textes à l'écran, adresse du site, état des inscriptions, formations, voix
   off et sous-titres. Après une modification : refaire le rendu
   (voir LISEZMOI.md). Garder les apostrophes typographiques ( ’ ) et les
   espaces avant « : » comme ici.

   Vérifié sur www.impactali.site le 10/10/2026 :
     - 5 formations actives, sessions ouvertes aux inscriptions aux Comores
       et à Djibouti (d'où « Inscrivez-vous ») ;
     - « Community Management » n'est plus au catalogue : il n'apparaît pas ;
     - « Informatique et outils bureautiques » n'est pas encore ouverte :
       elle n'apparaît que sous « À venir ».
   La vidéo est GÉNÉRIQUE : ni date, ni tarif, ni lieu, ni numéro, ni mode
   (présentiel / en ligne), car elle est vue dans les deux pays.
   ========================================================================= */
window.DONNEES = {
  site: {
    // L'adresse officielle (forme canonique ; impactali.site y redirige)
    adresse: 'www.impactali.site',
    /* true tant qu'au moins une session est ouverte aux inscriptions.
       false : l'appel final dit « Rendez-vous sur » au lieu de « Inscrivez-vous sur ». */
    inscriptionsOuvertes: true
  },

  textes: {
    // 0 – 3 s : une ligne par entrée en 9:16 (regroupées par deux en 4:5) ; le mot à l'indice `motFort` passe au vert
    accroche: ['Votre', 'prochaine', 'compétence', 'commence', 'ici.'],
    motFort: 2,
    // 3 – 7 s : la signature, sous le logo
    signature: ['Plateforme de formation', '& de développement des compétences'],
    // Fin des domaines (40 s) : la phrase est aussi dite par la voix
    domainesTitre: ['Développez les compétences', 'qui font avancer', 'vos projets.'],
    aVenir: { etiquette: 'À venir', titre: 'Informatique & outils bureautiques' },
    pratique: {
      titre: ['Apprendre', 'en faisant.'],
      lignes: ['Des formations pratiques.', 'Des projets concrets.'],
      // Légendes des extraits filmés en cours (section « En classe » du site)
      enClasse: 'En classe · Promotion 2026',
      creation: 'Une création, pas à pas'
    },
    parcours: {
      etapes: ['Choisir une formation', 'Découvrir le programme', 'Accéder à l’inscription'],
      courts: ['Choisir', 'Découvrir', 'S’inscrire'],
      note: ['Via le formulaire officiel.', 'Place confirmée après validation du paiement.']
    },
    appel: {
      slogan: ['Apprendre.', 'Créer.', 'Évoluer.'],
      bouton: 'Découvrir les formations',
      invitation: 'Inscrivez-vous sur',
      invitationSansInscription: 'Rendez-vous sur'
    }
  },

  /* Les quatre usages et les formations RÉELLES du catalogue (intitulés exacts
     du site). `realisation` : ce que montre la carte animée. */
  domaines: [
    { verbe: 'Créer', realisation: 'Composition graphique', formations: ['Canva Pro & Création de contenu', 'Graphisme & identité visuelle'] },
    { verbe: 'Communiquer', realisation: 'Calendrier de publication', formations: ['Marketing digital'] },
    { verbe: 'Produire', realisation: 'Séquence de montage', formations: ['Réalisation et Montage vidéo'] },
    { verbe: 'Accélérer', realisation: 'Site web assisté par l’IA', formations: ['Création de site web avec iA'] }
  ],

  /* La voix off, phrase par phrase, avec l'instant où chaque phrase commence.
     - texte : ce qui est dit, tel qu'on l'écrit (sous-titres) ;
     - dire  : ce que lit la voix de synthèse témoin, si l'écriture diffère ;
     - incruste : false quand la phrase est déjà écrite à l'écran (titre) —
       elle reste dans le fichier SRT, mais n'est pas incrustée une 2e fois.
     Une voix enregistrée remplace la voix témoin phrase par phrase : déposer
     son/voix/finale/<id>.wav (voir LISEZMOI.md), aucune image à refaire. */
  voix: {
    '40': [
      { id: 'a01', debut: 0.30, texte: 'Votre prochaine compétence commence ici.', incruste: false },
      { id: 'a02', debut: 3.55, texte: 'Bienvenue sur IMPACTALI.', dire: 'Bienvenue sur Impactali.' },
      { id: 'a03', debut: 7.15, texte: 'Création de contenu,' },
      { id: 'a04', debut: 9.15, texte: 'communication,' },
      { id: 'a05', debut: 11.15, texte: 'photo, vidéo,' },
      { id: 'a06', debut: 13.15, texte: 'intelligence artificielle :' },
      { id: 'a07', debut: 14.95, texte: 'développez les compétences qui font avancer vos projets.', incruste: false },
      { id: 'a08', debut: 18.60, texte: 'Des formations pratiques et des projets concrets, pour apprendre en faisant.', incruste: false },
      { id: 'a09', debut: 25.70, texte: 'Choisissez la formation adaptée à vos objectifs,' },
      { id: 'a10', debut: 28.90, texte: 'découvrez son programme,' },
      { id: 'a11', debut: 30.50, texte: 'puis accédez à l’inscription.' },
      { id: 'a12', debut: 33.55, texte: 'IMPACTALI.', dire: 'Impactali.', incruste: false },
      { id: 'a13', debut: 34.35, texte: 'Apprendre.', incruste: false },
      { id: 'a14', debut: 35.10, texte: 'Créer.', incruste: false },
      { id: 'a15', debut: 35.65, texte: 'Évoluer.', incruste: false },
      { id: 'a16', debut: 36.40, texte: 'Découvrez votre prochaine formation sur notre site.', incruste: false }
    ],
    '15': [
      { id: 'b01', debut: 0.22, texte: 'Votre prochaine compétence commence ici.', incruste: false },
      { id: 'b02', debut: 2.60, texte: 'IMPACTALI.', dire: 'Impactali.', incruste: false },
      { id: 'b03', debut: 3.60, texte: 'Création de contenu,' },
      { id: 'b04', debut: 5.00, texte: 'communication,' },
      { id: 'b05', debut: 6.20, texte: 'photo, vidéo,' },
      { id: 'b06', debut: 7.50, texte: 'intelligence artificielle.' },
      { id: 'b07', debut: 9.25, texte: 'Des formations pratiques, pour apprendre en faisant.', incruste: false },
      { id: 'b08', debut: 12.35, texte: 'Inscrivez-vous sur notre site.', incruste: false }
    ]
  }
};

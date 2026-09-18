/* =========================================
   BLOCS DE FICHE — programme détaillé et questions fréquentes.

   Une seule source de vérité pour un balisage produit DEUX fois : par
   `scripts/build-fiches.js` au moment de générer les pages (le texte est alors
   présent pour Google et sans JavaScript), et par `script.js` quand le
   catalogue modifié depuis le tableau de bord arrive. Écrire ce balisage aux
   deux endroits l'aurait fait diverger à la première retouche.

   Fonctions PURES : aucune API du navigateur, afin que Node puisse les exécuter.
   ========================================= */
(function (racine) {
  'use strict';

  function echapper(valeur) {
    return String(valeur === null || valeur === undefined ? '' : valeur)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Une couleur par module, reprise en boucle au-delà de quatre. Elles ne
     portent aucune information : elles servent à distinguer les blocs d'un
     coup d'œil, et le titre reste lisible quelle que soit la teinte. */
  var TEINTES = ['blue', 'purple', 'pink', 'amber'];
  var ICONE_PAR_DEFAUT = 'menu_book';

  /** Normalise ce qui vient des données : objet complet, ou simple liste de modules. */
  function lireProgramme(formation) {
    var brut = formation && formation.programme;
    if (!brut) return null;
    var modules = Array.isArray(brut) ? brut : brut.modules;
    if (!Array.isArray(modules) || !modules.length) return null;
    return {
      sousTitre: (Array.isArray(brut) ? '' : brut.sousTitre) || '',
      modules: modules.filter(function (m) {
        return m && (m.titre || (Array.isArray(m.points) && m.points.length));
      })
    };
  }

  function lireFaq(formation) {
    var brut = formation && formation.faq;
    if (!Array.isArray(brut)) return [];
    return brut.filter(function (q) { return q && q.question && q.reponse; });
  }

  /**
   * Programme détaillé, module par module.
   * Le premier module est ouvert : la page doit montrer du contenu, pas une
   * rangée de titres repliés qui n'apprend rien au visiteur.
   */
  function programmeInterieur(formation) {
    var programme = lireProgramme(formation);
    if (!programme) return '';

    var modules = programme.modules.map(function (module, i) {
      var teinte = TEINTES[i % TEINTES.length];
      var ouvert = i === 0;
      var points = (module.points || []).map(function (point) {
        return '<div class="flex items-center gap-2 text-sm text-[#E5E5E5]">'
          + '<span class="material-symbols-outlined text-green-500 text-base" style="font-variation-settings: \'FILL\' 1;">check_circle</span>'
          + echapper(point) + '</div>';
      }).join('');

      return '<div class="programme-accordion bg-[#0D1723]/40 border border-[#CBFD00]/20 rounded-2xl overflow-hidden'
        + (ouvert ? ' accordion-open' : '') + '">'
        + '<button type="button" class="accordion-header w-full flex items-center gap-2.5 p-5 text-left" aria-expanded="'
        + (ouvert ? 'true' : 'false') + '">'
        + '<span class="w-8 h-8 rounded-xl bg-' + teinte + '-500 flex items-center justify-center flex-shrink-0">'
        + '<span class="material-symbols-outlined text-[#FFFFFF] text-base" style="font-variation-settings: \'FILL\' 1;">'
        + echapper(module.icone || ICONE_PAR_DEFAUT) + '</span></span>'
        + '<h3 class="text-sm font-extrabold text-[#FFFFFF] font-headline flex-1">' + echapper(module.titre) + '</h3>'
        + '<span class="accordion-arrow material-symbols-outlined text-' + teinte
        + '-400 text-xl transition-transform duration-300">expand_more</span>'
        + '</button>'
        + '<div class="accordion-body px-5 pb-5' + (ouvert ? '' : ' hidden') + '"'
        + (ouvert ? '' : ' hidden') + '>'
        + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1">' + points + '</div>'
        + '</div></div>';
    }).join('');

    /* L'en-tête garde ces classes telles quelles : une règle de style.css cible
       « #programme-section .bg-gradient-to-r h2 » pour imposer du texte sombre
       sur le vert de la marque. Les renommer rendrait le titre illisible. */
    return '<div class="glass-card rounded-2xl sm:rounded-3xl shadow-xl shadow-black/20 border border-white/40 overflow-hidden">'
      + '<div class="bg-gradient-to-r from-[#CBFD00] to-[#A5CF00] px-6 sm:px-8 py-5 flex items-center gap-3">'
      + '<span class="material-symbols-outlined text-[#FFFFFF] text-2xl" style="font-variation-settings: \'FILL\' 1;">menu_book</span>'
      + '<div><h2 class="text-lg sm:text-xl font-extrabold text-[#FFFFFF] font-headline tracking-tight" id="programme-title">'
      + 'Qu’allez-vous apprendre ?</h2>'
      + (programme.sousTitre
        ? '<p class="text-[#FFFFFF]/70 text-xs font-medium">' + echapper(programme.sousTitre) + '</p>' : '')
      + '</div></div>' + modules + '</div>';
  }

  /** Programme de repli : les acquis déclarés, quand aucun module n'est saisi. */
  function programmeSimpleInterieur(formation) {
    var acquis = (formation && formation.learnings) || [];
    if (!acquis.length) return '';
    var items = acquis.map(function (item) {
      return '<li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>'
        + echapper(item) + '</li>';
    }).join('');
    return '<div class="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8">'
      + '<p class="eyebrow">PROGRAMME</p>'
      + '<h2 id="programme-title" class="text-xl sm:text-2xl font-extrabold text-white font-headline">Ce que vous allez apprendre</h2>'
      + '<p class="text-[#94A3B8] mt-2">Un parcours pratique centré sur des compétences directement applicables.</p>'
      /* « fiche-prerequisites » n'existe pas dans la feuille de style : cette
         liste s'affichait avec les puces du navigateur. « prerequis-list » est
         la classe réelle, et elle attend justement une icône par ligne. */
      + '<ul class="prerequis-list mt-6">' + items + '</ul></div>';
  }

  /** Questions fréquentes propres à la formation. Même dépliant que le programme. */
  function faqInterieur(formation) {
    var questions = lireFaq(formation);
    if (!questions.length) return '';
    var titre = (formation && (formation.shortTitle || formation.title)) || '';
    var items = questions.map(function (item, i) {
      return '<div class="programme-accordion bg-[#0D1723]/40 border border-[#CBFD00]/20 rounded-2xl overflow-hidden hover:border-[#CBFD00]/30 transition-colors">'
        + '<button type="button" class="accordion-header w-full flex items-center justify-between p-5 text-left" aria-expanded="false" aria-controls="faq-reponse-' + i + '">'
        + '<h3 class="text-sm font-bold text-[#FFFFFF] font-headline pr-4">' + echapper(item.question) + '</h3>'
        + '<span class="accordion-arrow material-symbols-outlined text-[#E5E5E5] text-xl transition-transform duration-300">expand_more</span>'
        + '</button>'
        + '<div class="accordion-body px-5 pb-5 hidden" id="faq-reponse-' + i + '" hidden>'
        + '<p class="text-sm text-[#E5E5E5]">' + echapper(item.reponse) + '</p></div></div>';
    }).join('');

    return '<div class="flex items-center gap-3 mb-5 px-2">'
      + '<span class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#E5E5E5] font-bold" aria-hidden="true">?</span>'
      + '<h2 class="text-lg sm:text-xl font-extrabold text-[#FFFFFF] font-headline" id="faq-title">'
      + 'Questions fréquentes' + (titre ? ' sur ' + echapper(titre) : '') + '</h2></div>'
      + '<div class="space-y-3">' + items + '</div>';
  }

  /** Prérequis saisis pour CETTE formation, une ligne par exigence. */
  function lirePrerequis(formation) {
    var brut = formation && formation.prerequis;
    if (!Array.isArray(brut)) return [];
    return brut.map(function (p) { return String(p == null ? '' : p).trim(); }).filter(Boolean);
  }

  /**
   * Prérequis propres à la formation.
   *
   * Ils étaient un texte UNIQUE, partagé par les six fiches : ce qui vaut pour
   * Canva Pro — « un compte Canva gratuit suffit » — n'a aucun sens pour Photo
   * & Vidéo. Chaque formation porte désormais les siens, comme son programme et
   * sa FAQ. Tant qu'aucun n'est saisi, la fiche garde ceux de son HTML.
   */
  function prerequisInterieur(formation) {
    var lignes = lirePrerequis(formation);
    if (!lignes.length) return '';
    var items = lignes.map(function (ligne) {
      return '<li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>'
        + echapper(ligne) + '</li>';
    }).join('');
    return '<div class="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8">'
      + '<div class="flex items-center gap-3 mb-5">'
      + '<span class="material-symbols-outlined text-[#CBFD00] text-2xl" aria-hidden="true">checklist</span>'
      + '<h2 class="text-lg sm:text-xl font-extrabold text-[#FFFFFF] font-headline" id="prerequis-title">'
      + 'Prérequis</h2></div>'
      + '<ul class="prerequis-list">' + items + '</ul></div>';
  }

  racine.FicheBlocs = {
    programmeInterieur: programmeInterieur,
    programmeSimpleInterieur: programmeSimpleInterieur,
    faqInterieur: faqInterieur,
    prerequisInterieur: prerequisInterieur,
    aUnProgramme: function (formation) { return !!lireProgramme(formation); },
    aUneFaq: function (formation) { return lireFaq(formation).length > 0; },
    aDesPrerequis: function (formation) { return lirePrerequis(formation).length > 0; }
  };
})(typeof window !== 'undefined' ? window : this);

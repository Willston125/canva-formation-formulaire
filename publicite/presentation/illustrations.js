/* Les quatre « réalisations » des domaines, dessinées en HTML et en SVG.
 *
 * Chacune occupe une toile de 800 × 450 points (mise à l'échelle par la
 * carte qui la porte) et expose `anime(p, t)` : p, l'avancement de 0 à 1 sur
 * la durée de la carte ; t, l'instant absolu (pour les extraits filmés).
 * Rien n'y est inventé qui ressemble à un résultat : pas de chiffre
 * d'audience, pas de témoignage — des gestes de métier.
 *
 *   creer        Composition graphique (Canva Pro, identité visuelle)
 *   communiquer  Calendrier de publication (Marketing digital)
 *   produire     Séquence de montage (Réalisation et Montage vidéo)
 *   accelerer    Site web assisté par l'IA (Création de site web avec iA)
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const borne = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const av = (p, a, b) => borne((p - a) / (b - a));
  const entre = (a, b, k) => a + (b - a) * k;
  const E = {
    outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    outCubic: k => 1 - Math.pow(1 - k, 3),
    inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outBack: k => { const s = 1.45; return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); }
  };

  function bloc(parent, classe, style = {}, texte) {
    const el = document.createElement('div');
    if (classe) el.className = classe;
    Object.assign(el.style, style);
    if (texte !== undefined) el.textContent = texte;
    parent.appendChild(el);
    return el;
  }
  function boite(parent, x, y, l, h, classe, style = {}, texte) {
    return bloc(parent, classe, { position: 'absolute', left: x + 'px', top: y + 'px', width: l + 'px', height: h + 'px', ...style }, texte);
  }
  function svg(parent, tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
  }
  function dessin(parent, x, y, l, h, vue = `0 0 ${l} ${h}`) {
    const s = svg(parent, 'svg', { viewBox: vue, width: l, height: h });
    Object.assign(s.style, { position: 'absolute', left: x + 'px', top: y + 'px', overflow: 'visible' });
    return s;
  }
  function poser(el, { x = 0, y = 0, s = 1, sx = 1, sy = 1, o = 1, r = 0 } = {}) {
    el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${(s * sx).toFixed(4)}, ${(s * sy).toFixed(4)})`;
    el.style.opacity = borne(o).toFixed(3);
  }

  /** L'en-tête commun : trois pastilles, le nom de la réalisation, un détail à droite. */
  function entete(racine, titre, droite) {
    const e = boite(racine, 0, 0, 800, 52, 'illu-entete');
    const pastilles = bloc(e, 'illu-pastilles');
    ['#26313F', '#26313F', '#CBFD00'].forEach(c => bloc(pastilles, '', { background: c }));
    bloc(e, 'illu-titre', {}, titre);
    const d = bloc(e, 'illu-droite', {}, droite || '');
    return { e, d };
  }

  /** Une flèche de souris. */
  function curseur(racine) {
    const s = dessin(racine, 0, 0, 26, 32, '0 0 26 32');
    s.classList.add('illu-curseur');
    svg(s, 'path', { d: 'M2 2 L2 26 L8.5 20 L13 30 L17.5 28 L13 18.5 L22 18.5 Z', fill: '#FFFFFF', stroke: '#050709', 'stroke-width': '2', 'stroke-linejoin': 'round' });
    return s;
  }

  /** Un cadre de sélection, avec ses quatre poignées. */
  function selection(racine) {
    const s = boite(racine, 0, 0, 10, 10, 'illu-selection');
    ['hg', 'hd', 'bg', 'bd'].forEach(c => bloc(s, 'poignee ' + c));
    return s;
  }
  function placerSelection(el, b, o) {
    Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.l + 'px', height: b.h + 'px', opacity: borne(o).toFixed(3) });
  }
  /** Passe d'une boîte à la suivante : [[p, boîte], …] */
  function suivre(p, etapes) {
    if (p <= etapes[0][0]) return etapes[0][1];
    for (let i = 1; i < etapes.length; i++) {
      const [p1, b1] = etapes[i];
      const [p0, b0] = etapes[i - 1];
      if (p <= p1) {
        const k = E.inOut(av(p, p0, p1));
        return { x: entre(b0.x, b1.x, k), y: entre(b0.y, b1.y, k), l: entre(b0.l, b1.l, k), h: entre(b0.h, b1.h, k) };
      }
    }
    return etapes[etapes.length - 1][1];
  }

  /** Des lignes de texte qui montent d'un masque. */
  function lignesMasquees(parent, x, y, lignes, classe, interligne) {
    return lignes.map((texte, k) => {
      const m = boite(parent, x, y + k * interligne, 400, interligne + 6, 'illu-masque');
      const l = bloc(m, classe, {}, texte);
      return l;
    });
  }

  // =================================================================== CRÉER ==
  function creer(parent) {
    const r = boite(parent, 0, 0, 800, 450, 'illu illu-creer');
    const { e } = entete(r, 'Composition graphique', 'Affiche · 4:5');

    // Barre d'outils à gauche
    const rail = boite(r, 20, 72, 46, 352, 'creer-rail');
    const icones = [
      'M7 6 H19 M13 6 V20',                                  // texte
      'M5 5 H21 V21 H5 Z',                                    // forme
      'M13 4 A9 9 0 1 0 13.01 4 Z',                           // cercle
      'M4 18 L10 11 L14 15 L17 12 L22 18 Z M7 7 A1.6 1.6 0 1 0 7.01 7',  // image
      'M6 20 L6 14 L12 8 L18 14 L18 20'                       // calque
    ];
    icones.forEach((d, k) => {
      const c = boite(rail, 7, 10 + k * 66, 32, 32, 'creer-outil' + (k === 3 ? ' actif' : ''));
      const s = dessin(c, 4, 4, 24, 24, '0 0 26 26');
      svg(s, 'path', { d, fill: 'none', stroke: k === 3 ? '#050709' : '#9CA6B2', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    });

    // Le plan de travail : l'affiche en cours
    const plan = boite(r, 196, 72, 260, 325, 'creer-plan');
    const image = boite(plan, 14, 14, 232, 140, 'creer-image');
    const decor = dessin(image, 0, 0, 232, 140);
    svg(decor, 'path', { d: 'M0 140 L0 104 L52 62 L92 96 L142 44 L232 120 L232 140 Z', fill: '#1E3A57' });
    svg(decor, 'path', { d: 'M0 140 L0 122 L70 88 L120 116 L180 84 L232 132 L232 140 Z', fill: '#2C5079' });
    const soleil = svg(decor, 'circle', { cx: 176, cy: 42, r: 20, fill: '#CBFD00' });
    const tag = boite(plan, 14, 166, 76, 24, 'creer-tag', {}, '#Design');
    const surligne = boite(plan, 12, 230, 150, 30, 'creer-surligne');
    const titre = lignesMasquees(plan, 16, 198, ['Créer,', 'captiver,', 'partager.'], 'creer-titre', 32);
    boite(plan, 16, 300, 200, 14, 'creer-pied', {}, 'Atelier créatif');

    // Le panneau de marque
    const panneau = boite(r, 492, 72, 290, 352, 'creer-panneau');
    boite(panneau, 0, 0, 290, 20, 'creer-etiquette', {}, 'Brand Kit');
    const nuancier = ['#CBFD00', '#050709', '#0D1723', '#F6F5EF', '#9CA6B2'].map((c, k) =>
      boite(panneau, k * 50, 32, 38, 38, 'creer-nuance', { background: c }));
    boite(panneau, 0, 98, 290, 20, 'creer-etiquette doux', {}, 'Typographies');
    const typo1 = boite(panneau, 0, 124, 290, 52, 'creer-typo');
    bloc(typo1, 'aa jakarta', {}, 'Aa');
    bloc(typo1, 'nom', {}, 'Plus Jakarta Sans');
    const typo2 = boite(panneau, 0, 184, 290, 52, 'creer-typo');
    bloc(typo2, 'aa inter', {}, 'Aa');
    bloc(typo2, 'nom', {}, 'Inter');
    const exporter = boite(panneau, 0, 268, 150, 44, 'creer-bouton', {}, 'Exporter');

    const sel = selection(r);
    const souris = curseur(r);

    // Boîtes repères, dans la toile
    const B = {
      image: { x: 210 - 4, y: 86 - 4, l: 240, h: 148 },
      titre: { x: 208, y: 266, l: 170, h: 104 },
      tag: { x: 206, y: 234, l: 84, h: 32 },
      nuances: { x: 488, y: 100, l: 240, h: 46 },
      bouton: { x: 488, y: 336, l: 158, h: 52 }
    };

    return {
      racine: r,
      anime(p) {
        poser(e, { o: av(p, 0, 0.1) });
        poser(rail, { x: -20 * (1 - E.outExpo(av(p, 0, 0.16))), o: av(p, 0, 0.1) });
        poser(panneau, { x: 20 * (1 - E.outExpo(av(p, 0.02, 0.18))), o: av(p, 0.02, 0.12) });
        poser(plan, { s: 0.9 + 0.1 * E.outExpo(av(p, 0.04, 0.24)), o: av(p, 0.04, 0.12) });
        poser(image, { y: -26 * (1 - E.outExpo(av(p, 0.16, 0.34))), o: av(p, 0.16, 0.24) });
        soleil.setAttribute('r', (20 * E.outBack(av(p, 0.26, 0.4))).toFixed(2));
        titre.forEach((l, k) => poser(l, { y: 40 * (1 - E.outExpo(av(p, 0.3 + k * 0.06, 0.44 + k * 0.06))) }));
        surligne.style.transform = `scaleX(${E.outExpo(av(p, 0.5, 0.64)).toFixed(4)})`;
        poser(tag, { s: E.outBack(av(p, 0.6, 0.72)), o: av(p, 0.6, 0.64) });
        nuancier.forEach((n, k) => poser(n, { s: E.outBack(av(p, 0.34 + k * 0.035, 0.46 + k * 0.035)) }));
        [typo1, typo2].forEach((t, k) => poser(t, { y: 12 * (1 - E.outCubic(av(p, 0.5 + k * 0.05, 0.64 + k * 0.05))), o: av(p, 0.5 + k * 0.05, 0.6 + k * 0.05) }));
        poser(exporter, { s: 0.86 + 0.14 * E.outBack(av(p, 0.74, 0.84)), o: av(p, 0.74, 0.78) });

        const b = suivre(p, [[0.3, B.image], [0.42, B.image], [0.5, B.titre], [0.6, B.titre], [0.66, B.tag], [0.74, B.tag], [0.82, B.bouton]]);
        const oSel = av(p, 0.28, 0.33) * (1 - av(p, 0.9, 0.96));
        placerSelection(sel, b, oSel);
        poser(souris, { x: b.x + b.l - 6, y: b.y + b.h - 8, o: oSel });
      }
    };
  }

  // ============================================================ COMMUNIQUER ==
  function communiquer(parent) {
    const r = boite(parent, 0, 0, 800, 450, 'illu illu-communiquer');
    const { e } = entete(r, 'Calendrier de publication', '');
    const pilule = boite(r, 640, 13, 136, 28, 'cal-pilule', {}, 'Cette semaine');

    const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const X0 = 24, L = 100, G = (752 - 7 * L) / 6;
    const colX = k => X0 + k * (L + G);
    const jours = JOURS.map((j, k) => boite(r, colX(k), 64, L, 20, 'cal-jour', {}, j));
    const cases = JOURS.map((j, k) => boite(r, colX(k), 92, L, 214, 'cal-case' + (k === 3 ? ' auj' : '')));

    function tuile(k, type, legende) {
      const t = boite(r, colX(k) + 8, 104, L - 16, 190, 'cal-tuile');
      const v = boite(t, 0, 0, L - 16, 96, 'cal-vignette ' + type);
      const s = dessin(v, 0, 0, L - 16, 96, `0 0 ${L - 16} 96`);
      if (type === 'carrousel') {
        [[18, 30], [26, 24], [34, 18]].forEach(([x, y], i) => svg(s, 'rect', { x, y, width: 34, height: 46, rx: 6, fill: i === 2 ? '#050709' : 'rgba(5,7,9,.35)' }));
      } else if (type === 'reel') {
        svg(s, 'path', { d: 'M34 30 L58 48 L34 66 Z', fill: '#FFFFFF' });
      } else if (type === 'post') {
        svg(s, 'circle', { cx: 60, cy: 30, r: 13, fill: '#CBFD00' });
        svg(s, 'rect', { x: 12, y: 54, width: 52, height: 8, rx: 4, fill: '#050709' });
        svg(s, 'rect', { x: 12, y: 68, width: 36, height: 8, rx: 4, fill: 'rgba(5,7,9,.4)' });
      } else if (type === 'story') {
        svg(s, 'circle', { cx: 42, cy: 40, r: 18, fill: 'none', stroke: '#050709', 'stroke-width': 4 });
        svg(s, 'rect', { x: 20, y: 68, width: 44, height: 8, rx: 4, fill: '#050709' });
      }
      bloc(t, 'cal-legende', { marginTop: '104px' }, legende);
      const statut = bloc(t, 'cal-statut');
      bloc(statut, 'point');
      bloc(statut, '', {}, 'Programmé');
      return t;
    }
    const tuiles = [tuile(0, 'carrousel', 'Carrousel'), tuile(2, 'reel', 'Reel'), tuile(4, 'post', 'Post')];
    const glissee = tuile(3, 'story', 'Story');

    // En bas : le nombre de publications de la semaine (celles du calendrier), et la confirmation
    const graph = boite(r, 24, 322, 360, 108, 'cal-graph');
    boite(graph, 16, 12, 300, 18, 'cal-graph-titre', {}, 'Publications de la semaine');
    const hauteurs = [1, 0, 1, 1, 1, 0, 0];
    const barres = hauteurs.map((h, k) => boite(graph, 22 + k * 46, 40, 26, 52, 'cal-barre' + (h ? ' pleine' : '')));
    const toast = boite(r, 404, 342, 372, 66, 'cal-toast');
    const coche = dessin(toast, 18, 17, 32, 32, '0 0 32 32');
    svg(coche, 'circle', { cx: 16, cy: 16, r: 15, fill: '#CBFD00' });
    const trait = svg(coche, 'path', { d: 'M9 16.5 L14 21.5 L23.5 11.5', fill: 'none', stroke: '#050709', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': 1 });
    bloc(toast, 'cal-toast-texte', {}, '4 publications programmées');

    const souris = curseur(r);

    return {
      racine: r,
      anime(p) {
        poser(e, { o: av(p, 0, 0.1) });
        poser(pilule, { o: av(p, 0.04, 0.14) });
        jours.forEach((j, k) => poser(j, { o: av(p, 0.02 + k * 0.015, 0.1 + k * 0.015) }));
        cases.forEach((c, k) => poser(c, { y: 16 * (1 - E.outExpo(av(p, 0.02 + k * 0.02, 0.16 + k * 0.02))), o: av(p, 0.02 + k * 0.02, 0.1 + k * 0.02) }));
        tuiles.forEach((t, k) => {
          const d = 0.16 + k * 0.1;
          poser(t, { y: -46 * (1 - E.outBack(av(p, d, d + 0.14))), o: av(p, d, d + 0.05) });
        });
        // La « Story » glisse depuis l'extérieur jusqu'au jeudi
        const g = E.inOut(av(p, 0.5, 0.7));
        const pose = E.outBack(av(p, 0.68, 0.76));
        poser(glissee, { x: entre(520, 0, g), y: entre(150, 0, g), s: 1.06 - 0.06 * pose, r: entre(8, 0, g), o: av(p, 0.46, 0.5) });
        poser(souris, { x: colX(3) + 60 + entre(520, 0, g), y: 190 + entre(150, 0, g), o: av(p, 0.46, 0.5) * (1 - av(p, 0.8, 0.86)) });
        barres.forEach((b, k) => { b.style.transform = `scaleY(${E.outCubic(av(p, 0.56 + k * 0.025, 0.7 + k * 0.025)).toFixed(4)})`; });
        poser(graph, { o: av(p, 0.5, 0.58) });
        poser(toast, { y: 22 * (1 - E.outExpo(av(p, 0.76, 0.88))), o: av(p, 0.76, 0.8) });
        trait.setAttribute('stroke-dashoffset', (1 - E.outCubic(av(p, 0.82, 0.92))).toFixed(4));
      }
    };
  }

  // =============================================================== PRODUIRE ==
  function produire(parent, { films }) {
    const r = boite(parent, 0, 0, 800, 450, 'illu illu-produire');
    const { e, d: horodatage } = entete(r, 'Séquence de montage', '00:00:00:00');
    horodatage.classList.add('mont-tc');

    // Le moniteur : l'extrait filmé en classe (au tableau), qui défile avec la tête de lecture
    const ecran = boite(r, 24, 64, 176, 313, 'mont-ecran');
    const toile = document.createElement('canvas');
    toile.width = 352; toile.height = 626;
    Object.assign(toile.style, { width: '176px', height: '313px', display: 'block' });
    ecran.appendChild(toile);
    boite(r, 24, 388, 176, 40, 'mont-legende', {}, 'Aperçu');

    const tl = boite(r, 216, 64, 560, 366, 'mont-timeline');
    boite(tl, 16, 12, 200, 18, 'mont-titre', {}, 'Timeline');
    const outils = dessin(tl, 440, 8, 104, 24, '0 0 104 24');
    // ciseaux, lecture, aimant
    svg(outils, 'path', { d: 'M6 6 L20 18 M6 18 L20 6', stroke: '#9CA6B2', 'stroke-width': 2, 'stroke-linecap': 'round' });
    svg(outils, 'path', { d: 'M44 5 L58 12 L44 19 Z', fill: '#CBFD00' });
    svg(outils, 'path', { d: 'M82 6 L82 13 A6 6 0 0 0 94 13 L94 6', fill: 'none', stroke: '#9CA6B2', 'stroke-width': 2.4 });

    // La règle
    const regle = boite(tl, 0, 40, 560, 22, 'mont-regle');
    for (let k = 0; k <= 12; k++) {
      boite(regle, 50 + k * 40, k % 2 ? 12 : 6, 1, k % 2 ? 6 : 12, 'mont-graduation');
      if (k % 2 === 0) boite(regle, 54 + k * 40, 0, 40, 12, 'mont-seconde', {}, (k) + ' s');
    }
    ['V2', 'V1', 'A1'].forEach((n, k) => boite(tl, 12, [84, 146, 230][k], 30, 16, 'mont-piste', {}, n));
    [72, 122, 206].forEach((y, k) => boite(tl, 48, y, 500, [40, 70, 56][k], 'mont-couloir'));

    // Les plans sur la piste V1, avec une vignette tirée des extraits
    function plan(x, l, couleur, film, legende) {
      const c = boite(tl, x, 122, l, 70, 'mont-plan', { background: couleur });
      const v = document.createElement('canvas');
      v.width = 76; v.height = 124;
      Object.assign(v.style, { position: 'absolute', left: '4px', top: '4px', width: '38px', height: '62px', borderRadius: '6px' });
      c.appendChild(v);
      const f = films[film];
      if (f && f.images.length) v.getContext('2d').drawImage(f.images[Math.floor(f.images.length / 2)], 0, 0, 76, 124);
      bloc(c, 'mont-plan-nom', {}, legende);
      return c;
    }
    const plans = [plan(50, 150, '#284B7A', 'tableau', 'Plan 1'), plan(204, 176, '#35618F', 'creation', 'Plan 2'), plan(384, 164, '#1F3E66', 'outils', 'Plan 3')];
    const titreClip = boite(tl, 232, 76, 128, 32, 'mont-titreclip', {}, 'Titre');

    // La forme d'onde de la musique
    const onde = boite(tl, 50, 210, 498, 48, 'mont-onde');
    const s = dessin(onde, 0, 0, 498, 48);
    for (let k = 0; k < 110; k++) {
      const h = 6 + Math.abs(Math.sin(k * 0.47) * 16 + Math.sin(k * 1.3) * 9 + Math.sin(k * 0.13) * 8);
      svg(s, 'rect', { x: k * 4.5, y: 24 - h / 2, width: 2.6, height: h, rx: 1.3, fill: 'rgba(203,253,0,.62)' });
    }

    const coupe = boite(tl, 298, 116, 3, 82, 'mont-coupe');
    const tete = boite(tl, 0, 36, 18, 236, 'mont-tete');
    bloc(tete, 'triangle');
    bloc(tete, 'barre');

    return {
      racine: r,
      anime(p, t) {
        poser(e, { o: av(p, 0, 0.1) });
        poser(ecran, { o: av(p, 0.02, 0.12), s: 0.94 + 0.06 * E.outExpo(av(p, 0.02, 0.2)) });
        poser(tl, { x: 24 * (1 - E.outExpo(av(p, 0.02, 0.18))), o: av(p, 0.02, 0.12) });
        plans.forEach((c, k) => poser(c, { x: 90 * (1 - E.outExpo(av(p, 0.08 + k * 0.06, 0.24 + k * 0.06))), o: av(p, 0.08 + k * 0.06, 0.14 + k * 0.06) }));
        onde.style.transform = `scaleY(${E.outCubic(av(p, 0.12, 0.3)).toFixed(4)})`;

        const lecture = av(p, 0.18, 0.97);
        const x = 50 + 470 * lecture;
        poser(tete, { x: x - 9, o: av(p, 0.14, 0.2) });
        const secondes = lecture * 10;
        const ff = Math.floor((secondes % 1) * 25);
        horodatage.textContent = `00:00:${String(Math.floor(secondes)).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;

        // La coupe : un éclair blanc, puis le plan 2 s'écarte et se referme
        const c = av(p, 0.5, 0.56);
        poser(coupe, { o: c > 0 && c < 1 ? 1 - Math.abs(c - 0.5) * 2 : 0, sy: 0.6 + 0.4 * c });
        const ecart = Math.sin(Math.PI * av(p, 0.54, 0.66)) * 10;
        plans[1].style.clipPath = p > 0.54 && p < 0.66 ? `polygon(0 0, 94px 0, 94px 100%, 0 100%, 0 0, ${98 + ecart}px 0, 100% 0, 100% 100%, ${98 + ecart}px 100%)` : 'none';
        poser(titreClip, { y: -36 * (1 - E.outBack(av(p, 0.66, 0.78))), o: av(p, 0.66, 0.7) });

        // Le moniteur suit la tête de lecture dans l'extrait « au tableau »
        const f = films.tableau;
        if (f && f.images.length) {
          const i = Math.min(f.images.length - 1, Math.floor(lecture * (f.images.length - 1)));
          const ctx = toile.getContext('2d');
          const img = f.images[i];
          const k = Math.max(352 / img.width, 626 / img.height);
          ctx.drawImage(img, (352 - img.width * k) / 2, (626 - img.height * k) / 2, img.width * k, img.height * k);
        }
      }
    };
  }

  // ============================================================== ACCÉLÉRER ==
  function accelerer(parent) {
    const r = boite(parent, 0, 0, 800, 450, 'illu illu-accelerer');
    const { e } = entete(r, 'Site web assisté par l’IA', '');

    const chat = boite(r, 24, 64, 300, 366, 'ia-chat');
    const demande = 'Crée la page d’accueil de ma boutique en ligne.';
    const bulleU = boite(chat, 52, 16, 232, 92, 'ia-bulle moi');
    const texteU = bloc(bulleU, 'ia-texte');
    const bulleIA = boite(chat, 16, 130, 268, 86, 'ia-bulle elle');
    const avatar = bloc(bulleIA, 'ia-avatar', {}, 'IA');
    const points = bloc(bulleIA, 'ia-points');
    const lesPoints = [0, 1, 2].map(() => bloc(points, 'pt'));
    const reponse = bloc(bulleIA, 'ia-texte rep', {}, 'Voici une première version de votre site.');
    const saisie = boite(chat, 16, 306, 268, 44, 'ia-saisie');
    bloc(saisie, 'ia-placeholder', {}, 'Décrivez votre projet…');
    const envoyer = bloc(saisie, 'ia-envoyer');
    const fl = dessin(envoyer, 7, 7, 18, 18, '0 0 18 18');
    svg(fl, 'path', { d: 'M3 9 H15 M10 4 L15 9 L10 14', fill: 'none', stroke: '#050709', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

    // Le navigateur : la page se construit
    const nav = boite(r, 344, 64, 432, 366, 'ia-navig');
    const barre = boite(nav, 0, 0, 432, 30, 'ia-barre');
    [0, 1, 2].forEach(k => boite(barre, 12 + k * 14, 10, 9, 9, 'ia-feu'));
    boite(barre, 66, 7, 300, 16, 'ia-adresse');
    const page = boite(nav, 0, 30, 432, 336, 'ia-page');

    // Squelette (gris) puis contenu, bloc par bloc
    const blocs = [];
    function morceau(x, y, l, h, construire) {
      const sq = boite(page, x, y, l, h, 'ia-squelette');
      const c = boite(page, x, y, l, h, 'ia-contenu');
      construire(c);
      blocs.push({ sq, c });
    }
    morceau(16, 12, 400, 22, c => {
      boite(c, 0, 4, 58, 14, 'ia-logo');
      [0, 1, 2].forEach(k => boite(c, 190 + k * 44, 8, 32, 6, 'ia-lien'));
      boite(c, 334, 0, 66, 22, 'ia-btn-vert', {}, 'Contact');
    });
    morceau(16, 50, 220, 134, c => {
      bloc(c, 'ia-h1', {}, 'Votre boutique,');
      bloc(c, 'ia-h1', {}, 'en ligne.');
      boite(c, 0, 72, 170, 7, 'ia-ligne');
      boite(c, 0, 84, 120, 7, 'ia-ligne');
      boite(c, 0, 102, 104, 30, 'ia-btn-noir', {}, 'Commander');
    });
    morceau(250, 50, 166, 134, c => {
      const im = boite(c, 0, 0, 166, 134, 'ia-image');
      const s = dessin(im, 0, 0, 166, 134);
      svg(s, 'path', { d: 'M58 52 H108 L116 104 H50 Z', fill: '#050709' });
      svg(s, 'path', { d: 'M70 52 C70 34 96 34 96 52', fill: 'none', stroke: '#050709', 'stroke-width': 5 });
    });
    [0, 1, 2].forEach(k => morceau(16 + k * 136, 198, 128, 126, c => {
      boite(c, 0, 0, 128, 70, 'ia-carte-img' + (k === 1 ? ' vert' : ''));
      boite(c, 8, 82, 90, 8, 'ia-ligne fonce');
      boite(c, 8, 98, 60, 8, 'ia-ligne');
      boite(c, 8, 112, 40, 10, 'ia-pastille');
    }));
    const balayage = boite(nav, 0, 30, 432, 3, 'ia-balayage');

    return {
      racine: r,
      anime(p, t) {
        poser(e, { o: av(p, 0, 0.1) });
        poser(chat, { x: -20 * (1 - E.outExpo(av(p, 0, 0.16))), o: av(p, 0, 0.1) });
        poser(nav, { x: 20 * (1 - E.outExpo(av(p, 0.03, 0.19))), o: av(p, 0.03, 0.12) });
        // La demande s'écrit
        const n = Math.round(demande.length * av(p, 0.08, 0.36));
        texteU.textContent = demande.slice(0, n);
        poser(bulleU, { o: av(p, 0.06, 0.09) });
        // Envoi
        const env = av(p, 0.37, 0.43);
        poser(envoyer, { s: 1 + Math.sin(Math.PI * env) * 0.18 });
        // La réponse : trois points, puis le texte
        poser(bulleIA, { y: 16 * (1 - E.outExpo(av(p, 0.43, 0.5))), o: av(p, 0.43, 0.47) });
        const attente = p >= 0.47 && p < 0.58;
        points.style.display = attente ? 'flex' : 'none';
        lesPoints.forEach((pt, k) => poser(pt, { y: -5 * Math.max(0, Math.sin(t * 12 - k * 0.9)) }));
        poser(reponse, { o: av(p, 0.58, 0.64) });
        reponse.style.display = p >= 0.58 ? 'block' : 'none';
        poser(avatar, { s: E.outBack(av(p, 0.44, 0.52)) });
        // La page : squelettes, puis contenus, de haut en bas
        blocs.forEach(({ sq, c }, k) => {
          const d = 0.5 + k * 0.035;
          poser(sq, { o: av(p, d, d + 0.04) * (1 - av(p, d + 0.12, d + 0.18)) });
          poser(c, { y: 8 * (1 - E.outCubic(av(p, d + 0.12, d + 0.22))), o: av(p, d + 0.12, d + 0.18) });
        });
        const b = av(p, 0.52, 0.94);
        poser(balayage, { y: 336 * b, o: b > 0 && b < 1 ? 1 : 0 });
      }
    };
  }

  window.ILLUSTRATIONS = { creer, communiquer, produire, accelerer };
})();

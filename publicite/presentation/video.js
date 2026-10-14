/* IMPACTALI — Présentation vidéo : le moteur.
 *
 * `rendre(t)` pose chaque élément à l'instant t, sans rien retenir de l'image
 * précédente. Trois parties :
 *   MONTAGES  les instants de chaque geste (40 s et 15 s) ;
 *   MISES     les mises en page, réellement différentes en 9:16 et en 4:5 ;
 *   le FIL    la ligne vert citron qui relie les séquences : elle souligne
 *             l'accroche, dévoile le logo, devient le contour du téléphone puis
 *             des cartes, accompagne une réalisation, trace le parcours et finit
 *             en bouton.
 * Les textes viennent de donnees.js. */
(function () {
  'use strict';

  // ============================================================== réglages ==
  const P = new URLSearchParams(location.search);
  const FORMAT = P.get('format') === '4x5' ? '4x5' : '9x16';
  const MONTAGE = P.get('montage') === '15' ? '15' : '40';
  const CALQUE_ST = P.get('calque') === 'st';
  const AVEC_ST = CALQUE_ST || P.get('st') === '1';
  const COUVERTURE = P.has('couverture');
  const CAPTURE = P.has('capture');
  const D = window.DONNEES;
  const W = 1080;
  const H = FORMAT === '4x5' ? 1350 : 1920;
  const VERT = '#CBFD00';

  // ================================================================ outils ==
  const $ = id => document.getElementById(id);
  const borne = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const avance = (t, a, b) => borne((t - a) / (b - a));
  const entre = (a, b, k) => a + (b - a) * k;
  const E = {
    lin: k => k,
    outCubic: k => 1 - Math.pow(1 - k, 3),
    inCubic: k => k * k * k,
    inOutCubic: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outQuart: k => 1 - Math.pow(1 - k, 4),
    outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inExpo: k => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
    inOutExpo: k => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
    outBack: k => { const s = 1.4; return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); }
  };
  /** Une valeur qui passe par des clés [[instant, valeur, courbe?], …] ; la courbe règle le trajet qui MÈNE à la clé. */
  function cle(t, cles) {
    if (t <= cles[0][0]) return cles[0][1];
    for (let i = 1; i < cles.length; i++) {
      const [t1, v1, courbe] = cles[i];
      const [t0, v0] = cles[i - 1];
      if (t <= t1) return entre(v0, v1, (courbe || E.inOutCubic)(avance(t, t0, t1)));
    }
    return cles[cles.length - 1][1];
  }
  function cree(tag, classe, parent, texte) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texte !== undefined) el.textContent = texte;
    if (parent) parent.appendChild(el);
    return el;
  }
  function placer(el, x, y, l, h) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (l !== undefined) el.style.width = l + 'px';
    if (h !== undefined) el.style.height = h + 'px';
  }
  function poser(el, { x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, r = 0, rx = 0, ry = 0, o = 1 } = {}) {
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotate(${r.toFixed(3)}deg) scale(${(s * sx).toFixed(5)}, ${(s * sy).toFixed(5)})`;
    el.style.opacity = borne(o).toFixed(3);
  }
  /* Une séquence absente est retirée de l'affichage (display) : un enfant marqué « visible » ne peut plus apparaître. */
  const visible = (el, oui) => { el.style.display = oui ? 'block' : 'none'; };
  const pr = n => n.toFixed(1);

  /** Une ligne de titre dans son masque : { m, mi, l, h } (largeur et hauteur mesurées). */
  function ligneMasquee(parent, texte, { x, y, taille, classe = 't-titre', vert = false }) {
    const m = cree('div', 'm', parent);
    const mi = cree('span', 'mi ' + classe + (vert ? ' t-vert' : ''), m, texte);
    m.style.fontSize = taille + 'px';
    mi.style.fontSize = taille + 'px';
    placer(m, x, y);
    return { m, mi, get l() { return mi.offsetWidth; }, get h() { return mi.offsetHeight; } };
  }
  /** Monte une ligne de son masque à `debut`, la fait sortir par le haut à `sortie`. */
  function monter(ligne, t, debut, { duree = 0.55, courbe = E.outExpo, sortie = null, dureeSortie = 0.32 } = {}) {
    let y = (1 - courbe(avance(t, debut, debut + duree))) * 165;
    if (sortie !== null) y -= E.inExpo(avance(t, sortie, sortie + dureeSortie)) * 165;
    ligne.mi.style.transform = `translateY(${y.toFixed(2)}%)`;
    // Tout à fait sortie (ou pas encore entrée) : rien ne doit dépasser du masque
    ligne.mi.style.visibility = Math.abs(y) > 164 ? "hidden" : "inherit";
    return y;
  }

  /** La largeur d'un texte, dans une police donnée. */
  const regle = document.createElement('canvas').getContext('2d');
  function largeurTexte(texte, police, espacement = 0) {
    regle.font = police;
    regle.letterSpacing = espacement + 'px';
    return regle.measureText(texte).width;
  }
  /** La plus grande taille (≤ max) pour que chaque texte tienne dans `largeur`. */
  function ajuster(textes, largeur, max, poids = 800, famille = 'Plus Jakarta Sans', espacementEm = -0.045) {
    let t = max;
    for (const texte of textes) {
      const l = largeurTexte(texte, `${poids} ${max}px "${famille}"`, espacementEm * max);
      if (l > largeur) t = Math.min(t, Math.floor(max * largeur / l));
    }
    return t;
  }

  // ============================================================== montages ==
  /* Chaque séquence : son début, sa fin, et les instants de ses gestes. Les
     voix sont placées dans donnees.js ; ces instants les suivent. */
  const MONTAGES = {
    '40': {
      duree: 40,
      accroche: { debut: 0, mots: [-0.62, -0.48, 0.0, 0.36, 0.52], fort: [0.62, 1.05], sortie: 2.3, fin: 3.0 },
      marque: { debut: 3.0, balayage: [3.0, 3.5], signature: 3.62, site: 4.85, fin: 7.0 },
      domaines: { debut: 7.0, cartes: [7.0, 9.0, 11.0, 13.0], recap: 15.0, fin: 18.0 },
      pratique: { debut: 18.0, monte: 18.55, lignes: [19.15, 20.5], fenetres: [18.92, 20.5], bascules: [21.9, 23.1], fin: 25.5 },
      parcours: { debut: 25.5, etapes: [25.5, 28.75, 30.5], appuis: [27.9, 31.0], fin: 33.5 },
      appel: { debut: 33.5, logo: 33.52, mots: [34.35, 35.1, 35.65], bouton: [36.0, 36.5], adresse: 36.7, fin: 40 }
    },
    '15': {
      duree: 15,
      accroche: { debut: 0, mots: [-0.62, -0.48, 0.0, 0.32, 0.46], fort: [0.56, 0.96], sortie: 2.02, fin: 2.5 },
      marque: { debut: 2.5, balayage: [2.5, 2.9], signature: 2.85, site: null, fin: 3.5 },
      domaines: { debut: 3.5, cartes: [3.5, 4.875, 6.25, 7.625], recap: null, fin: 9.0 },
      pratique: { debut: 9.0, monte: 9.38, lignes: [9.95], fenetres: [9.62], bascules: [], fin: 11.75 },
      parcours: null,
      appel: { debut: 11.75, logo: 11.77, mots: [12.15, 12.4, 12.65], bouton: [12.9, 13.3], adresse: 13.5, fin: 15 }
    }
  };
  const M = MONTAGES[MONTAGE];
  /* Le passage qui fait entrer chaque carte des domaines (la première sort du téléphone en 40 s) */
  const PASSAGES_CARTES = ['glisse', 'glisse', 'traverse', 'monte'];
  /* Le récapitulatif s'ouvre sur la pratique par un zoom à travers ; la pratique cède la place au parcours en glissant */
  const ZOOM_RECAP = M.domaines.recap !== null;
  const POUSSE_PARCOURS = !!M.parcours;
  const DUREE = M.duree;

  // ======================================================== mises en page ==
  /* Zone sûre en 9:16 (Reels, TikTok, Shorts, octobre 2026) : textes entre
     y = 290 et y = 1200, x = 120 à 960, et pas au-delà de x = 840 sous
     y = 840 (colonne de boutons des applications). */
  const MISES = {
    '9x16': {
      st: { cx: 540, bas: 1196, largeurMax: 640 },
      lueurs: { // centre de la lueur verte, par séquence
        accroche: [560, 820], marque: [540, 640], domaines: [620, 860], pratique: [480, 900], parcours: [560, 860], appel: [540, 1000]
      },
      accroche: { x: 120, centreY: 765, largeurMax: 840, groupes: [[0], [1], [2], [3], [4]], tailles: [150, 150, 150, 150, 150] },
      marque: {
        logo: { cx: 540, y: 400, l: 720 },
        signature: { cx: 540, y: 836, taille: 34 },
        logoHaut: { cx: 540, y: 300, l: 330 },
        telephone: { cx: 540, y: 520, echelle: 1.32 }
      },
      domaines: {
        index: { x: 120, y: 300 }, verbe: { x: 120, y: 336, taille: 112 },
        formations: { x: 120, y: 482 },
        carte: { x: 120, y: 600, l: 840, h: 472 },
        recapTitre: { x: 120, y: 300, taille: 56 },
        grille: { x: 120, y: 516, l: 840, h: 500, gap: 20 },
        aVenir: { x: 120, y: 1058 }
      },
      pratique: {
        titreGrand: { x: 120, y: 690, taille: 128 },
        titrePetit: { y: 296, echelle: 0.6 },
        lignes: { x: 120, y: 484, ecart: 50 },
        fenetres: [{ x: 120, y: 612, l: 440, h: 550, legende: 'bas' }, { x: 590, y: 680, l: 370, h: 462, legende: 'haut' }],
        fenetreSeule: { x: 120, y: 600, l: 720, h: 560, legende: 'haut' }
      },
      parcours: {
        noeuds: { x: [200, 540, 880], y: [330, 330, 330], labels: 'dessous' },
        titre: { x: 120, y: 424, taille: 54 },
        note: { x: 120, y: 500 },
        ecran: { x: 150, y: 592, l: 780, h: 452 }
      },
      appel: {
        logo: { cx: 540, y: 330, l: 470 },
        slogan: { cx: 540, y: 636, taille: 88, lignes: [[0], [1], [2]], interligne: 1.1 },
        bouton: { cx: 540, y: 950, l: 600, h: 116 },
        invitation: { cx: 540, y: 1094 },
        adresse: { cx: 540, y: 1136 }
      },
      couverture: { logo: { cx: 540, y: 300, l: 420 }, accroche: { centreY: 820, groupes: [[0, 1], [2], [3, 4]], tailles: [100, 156, 100] }, verbes: { x: 120, y: 1070, largeur: 600 } }
    },
    '4x5': {
      st: { cx: 540, bas: 1266, largeurMax: 840 },
      lueurs: { accroche: [520, 640], marque: [380, 500], domaines: [600, 560], pratique: [560, 640], parcours: [480, 700], appel: [540, 760] },
      accroche: { x: 90, centreY: 705, largeurMax: 900, groupes: [[0, 1], [2], [3, 4]], tailles: [94, 158, 94] },
      marque: {
        logo: { x: 90, y: 360, l: 470 },
        signature: { x: 90, y: 652, taille: 32 },
        logoHaut: null,
        telephone: { x: 604, y: 150, echelle: 0.9 }
      },
      domaines: {
        index: { x: 90, y: 92 }, verbe: { x: 90, y: 128, taille: 106 },
        carte: { x: 90, y: 292, l: 900, h: 506 },
        formations: { x: 90, y: 842 },
        recapTitre: { x: 90, y: 92, taille: 50 },
        grille: { x: 90, y: 300, l: 900, h: 520, gap: 20 },
        aVenir: { x: 90, y: 862 }
      },
      pratique: {
        titreGrand: { x: 90, y: 460, taille: 136 },
        titrePetit: { y: 90, echelle: 0.55 },
        lignes: { x: 90, y: 262, ecart: 48 },
        fenetres: [{ x: 90, y: 380, l: 430, h: 538, legende: 'bas' }, { x: 560, y: 430, l: 430, h: 538, legende: 'haut' }]
      },
      parcours: {
        noeuds: { x: [900, 900, 900], y: [330, 620, 910], labels: 'dessous' },
        titre: { x: 90, y: 88, taille: 54 },
        note: { x: 90, y: 160 },
        ecran: { x: 90, y: 250, l: 700, h: 910 }
      },
      appel: {
        logo: { cx: 540, y: 250, l: 420 },
        slogan: { cx: 540, y: 552, taille: 92, lignes: [[0, 1], [2]], interligne: 1.14 },
        bouton: { cx: 540, y: 818, l: 620, h: 118 },
        invitation: { cx: 540, y: 982 },
        adresse: { cx: 540, y: 1024 }
      },
      couverture: { logo: { cx: 540, y: 150, l: 380 }, accroche: { centreY: 700 }, verbes: { x: 90, y: 1060, largeur: 900 } }
    }
  };
  const L = MISES[FORMAT];
  const RATIO_LOGO = 2400 / 1333;

  // ============================================================ la scène ==
  const cadre = $('cadre');
  const scene = $('scene');
  cadre.style.width = W + 'px';
  cadre.style.height = H + 'px';
  if (CALQUE_ST) {
    // Le calque des sous-titres est transparent partout ailleurs : rien d'opaque, pas même la page
    document.body.classList.add('calque-st');
    document.documentElement.style.background = 'transparent';
  }

  const fond = cree('div', '', scene); fond.id = 'fond';
  const lueurBleue = cree('div', 'lueur', fond); lueurBleue.id = 'lueurBleue';
  const lueurVerte = cree('div', 'lueur', fond); lueurVerte.id = 'lueurVerte';
  cree('div', '', fond).id = 'grain';
  /* La caméra : tout ce qui est filmé (séquences et fil) bouge ensemble ; le fond, derrière, en parallaxe. */
  const camera = cree('div', '', scene); camera.id = 'camera';
  camera.style.cssText = 'position:absolute;inset:0;transform-origin:' + (W / 2) + 'px ' + Math.round(H * 0.42) + 'px';

  const S = {}; // les séquences : leurs éléments
  const plan = nom => { const p = cree('section', 'plan', camera); p.id = 'p-' + nom; p.style.transformOrigin = (W / 2) + 'px ' + Math.round(H * 0.42) + 'px'; return p; };

  // Le fil : au-dessus des séquences
  const NS = 'http://www.w3.org/2000/svg';
  const filSvg = document.createElementNS(NS, 'svg');
  filSvg.id = 'fil';
  filSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  filSvg.setAttribute('width', W);
  filSvg.setAttribute('height', H);
  const filLueur = document.createElementNS(NS, 'path'); filLueur.id = 'filLueur';
  const filTrait = document.createElementNS(NS, 'path'); filTrait.id = 'filTrait';
  filSvg.append(filLueur, filTrait);
  const mesureur = document.createElementNS(NS, 'path');
  const mesureurSvg = document.createElementNS(NS, 'svg');
  mesureurSvg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  mesureurSvg.appendChild(mesureur);

  const calqueST = cree('div', '', null); calqueST.id = 'calqueST';
  const bulleST = cree('div', 'st', calqueST);

  // ============================================== les extraits filmés ==
  const FILMS = {};
  function chargerFilms() {
    const promesses = [];
    for (const [nom, info] of Object.entries(window.CLIPS_CLASSE || {})) {
      const images = [];
      for (let i = 1; i <= info.images; i++) {
        const img = new Image();
        img.src = `medias/classe/${nom}/${String(i).padStart(3, '0')}.jpg`;
        images.push(img);
        promesses.push(img.decode().catch(() => null));
      }
      FILMS[nom] = { images, recadrage: info.recadrage };
    }
    return Promise.all(promesses);
  }
  /** Dessine l'image d'un extrait dans une toile, recadrée pour la remplir. */
  function dessinerFilm(toile, nom, secondes, vitesse = 1) {
    const f = FILMS[nom];
    if (!f || !f.images.length) return;
    const i = borne(Math.floor(Math.max(0, secondes) * 30 * vitesse), 0, f.images.length - 1);
    const img = f.images[i];
    const ctx = toile.getContext('2d');
    const k = Math.max(toile.width / img.naturalWidth, toile.height / img.naturalHeight) * 1.0;
    const l = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (toile.width - l) / 2, (toile.height - h) * f.recadrage, l, h);
  }

  // ========================================================= construction ==
  const G = {}; // les géométries mesurées, utiles au fil

  function construireAccroche() {
    const p = plan('accroche');
    const A = L.accroche;
    const lignes = A.groupes.map(g => g.map(i => D.textes.accroche[i]).join(' '));
    const fort = A.groupes.findIndex(g => g.includes(D.textes.motFort));
    const tailles = A.tailles.map((t, k) => ajuster([lignes[k]], A.largeurMax, t));
    // Hauteurs : la ligne du mot fort garde de la place pour le soulignement
    const pas = tailles.map((t, k) => t * 1.06 + (k === fort ? t * 0.3 : 0));
    const total = pas.reduce((a, b) => a + b, 0) - tailles[tailles.length - 1] * 0.06;
    let y = A.centreY - total / 2;
    const objets = lignes.map((texte, k) => {
      const ligne = ligneMasquee(p, texte, { x: A.x, y, taille: tailles[k] });
      if (k === fort) {
        // Le même mot en vert, par-dessus, dévoilé au passage du fil
        const v = cree('span', 'accroche-vert t-titre', ligne.mi, texte);
        v.style.fontSize = tailles[k] + 'px';
        ligne.vert = v;
      }
      ligne.y = y;
      ligne.taille = tailles[k];
      y += pas[k];
      return ligne;
    });
    S.accroche = { p, lignes: objets, fort };
  }

  function construireMarque() {
    const p = plan('marque');
    const ML = L.marque;
    const logo = cree('img', '', p);
    logo.src = 'medias/marque/logo-vert.png';
    logo.alt = 'IMPACTALI';
    logo.style.position = 'absolute';
    const lx = ML.logo.cx !== undefined ? ML.logo.cx - ML.logo.l / 2 : ML.logo.x;
    placer(logo, lx, ML.logo.y, ML.logo.l, ML.logo.l / RATIO_LOGO);
    logo.style.transformOrigin = '0 0';
    G.logo = { x: lx, y: ML.logo.y, l: ML.logo.l, h: ML.logo.l / RATIO_LOGO };

    const sig = D.textes.signature.map((texte, k) => {
      const t = ML.signature.taille;
      const m = cree('div', 'm', p);
      const mi = cree('span', 'mi signature', m, texte);
      mi.style.position = 'relative';
      mi.style.fontSize = t + 'px';
      m.style.fontSize = t + 'px';
      const largeur = largeurTexte(texte, `600 ${t}px "Inter"`);
      const x = ML.signature.cx !== undefined ? ML.signature.cx - largeur / 2 : ML.signature.x;
      placer(m, x, ML.signature.y + k * t * 1.32);
      return { m, mi };
    });

    let tel = null;
    if (M.marque.site !== null) {
      const T = ML.telephone;
      const l = 390 * T.echelle + 28;
      const h = 844 * T.echelle + 28;
      const x = T.cx !== undefined ? T.cx - l / 2 : T.x;
      tel = cree('div', 'telephone', p);
      placer(tel, x, T.y, l, h);
      const ecran = cree('div', 'ecran', tel);
      const img = cree('img', '', ecran);
      img.src = 'medias/site/accueil-ecran.png';
      tel.encoche = cree('div', 'encoche', tel);
      G.telephone = { x, y: T.y, l, h, r: 64 };
      tel.ecran = ecran;
      tel.image = img;
    }
    S.marque = { p, logo, sig, tel };
  }

  function construireDomaines() {
    const p = plan('domaines');
    p.style.perspective = '1800px';
    const DL = L.domaines;
    const index = cree('div', 'index', p);
    placer(index, DL.index.x, DL.index.y);
    const tailleVerbe = ajuster(D.domaines.map(d => d.verbe), FORMAT === '4x5' ? 900 : 840, DL.verbe.taille);
    const verbes = D.domaines.map(d => ligneMasquee(p, d.verbe, { x: DL.verbe.x, y: DL.verbe.y, taille: tailleVerbe }));
    const formations = D.domaines.map(d => {
      const f = cree('div', 'formations', p);
      placer(f, DL.formations.x, DL.formations.y);
      d.formations.forEach(n => cree('div', '', f, n));
      return f;
    });
    const C = DL.carte;
    const echelleToile = C.l / 800;
    const cartes = D.domaines.map((d, k) => {
      const c = cree('div', 'carte', p);
      placer(c, C.x, C.y, C.l, C.h);
      c.style.transformOrigin = '0 0';
      const toile = cree('div', 'toile', c);
      toile.style.transform = `scale(${echelleToile})`;
      const fabrique = window.ILLUSTRATIONS[['creer', 'communiquer', 'produire', 'accelerer'][k]];
      const illu = fabrique(toile, { films: FILMS });
      const mini = cree('div', 'mini-verbe', c, d.verbe);
      // Le libellé des vignettes du récapitulatif, à sa taille une fois la carte réduite
      const g = DL.grille;
      const k2 = Math.min((g.l - g.gap) / 2 / C.l, (g.h - g.gap) / 2 / C.h);
      mini.style.fontSize = (46 / k2).toFixed(1) + 'px';
      mini.style.padding = `${(40 / k2).toFixed(0)}px ${(20 / k2).toFixed(0)}px ${(16 / k2).toFixed(0)}px`;
      return { c, illu, mini };
    });
    G.carte = { x: C.x, y: C.y, l: C.l, h: C.h, r: 30 };

    // Le récapitulatif (40 s)
    let recap = null;
    if (M.domaines.recap !== null) {
      const R = DL.recapTitre;
      const taille = ajuster(D.textes.domainesTitre, FORMAT === '4x5' ? 900 : 840, R.taille);
      const titre = D.textes.domainesTitre.map((texte, k) =>
        ligneMasquee(p, texte, { x: R.x, y: R.y + k * taille * 1.06, taille, vert: k === D.textes.domainesTitre.length - 1 }));
      const g = DL.grille;
      const lc = (g.l - g.gap) / 2;
      const hc = (g.h - g.gap) / 2;
      const k2 = Math.min(lc / C.l, hc / C.h);
      const cellules = [0, 1, 2, 3].map(i => {
        const cx = g.x + (i % 2) * (lc + g.gap) + lc / 2;
        const cy = g.y + Math.floor(i / 2) * (hc + g.gap) + hc / 2;
        return { x: cx - C.l * k2 / 2, y: cy - C.h * k2 / 2, s: k2 };
      });
      const aVenir = cree('div', 'a-venir', p);
      placer(aVenir, DL.aVenir.x, DL.aVenir.y);
      cree('span', 'etiq', aVenir, D.textes.aVenir.etiquette);
      cree('span', '', aVenir, D.textes.aVenir.titre);
      recap = { titre, cellules, aVenir, taille };
      const derniere = titre[titre.length - 1];
      G.recapSouligne = { x: R.x, y: R.y + (titre.length - 1) * taille * 1.06 + taille * 1.14, l: largeurTexte(derniere.mi.textContent, `800 ${taille}px "Plus Jakarta Sans"`, -0.045 * taille) };
    }
    S.domaines = { p, index, verbes, formations, cartes, recap };
  }

  function construirePratique() {
    const p = plan('pratique');
    const PL = L.pratique;
    const boiteTitre = cree('div', 'abs', p);
    boiteTitre.style.transformOrigin = '0 0';
    placer(boiteTitre, PL.titreGrand.x, PL.titreGrand.y);
    const taille = ajuster(D.textes.pratique.titre, FORMAT === '4x5' ? 900 : 840, PL.titreGrand.taille);
    const titre = D.textes.pratique.titre.map((texte, k) => ligneMasquee(boiteTitre, texte, { x: 0, y: k * taille * 1.06, taille }));
    const lignes = D.textes.pratique.lignes.slice(0, M.pratique.lignes.length).map((texte, k) => {
      const m = cree('div', 'm', p);
      const mi = cree('span', 'mi pratique-ligne', m, texte);
      mi.style.position = 'relative';
      m.style.fontSize = '36px';
      placer(m, PL.lignes.x, PL.lignes.y + k * PL.lignes.ecart);
      return { m, mi };
    });
    const sources = [['formateur', 'outils'], ['creation', 'salle']];
    const legendes = [[D.textes.pratique.enClasse, D.textes.pratique.enClasse], [D.textes.pratique.creation, D.textes.pratique.enClasse]];
    const seule = M.pratique.fenetres.length === 1 && PL.fenetreSeule;
    const fenetres = M.pratique.fenetres.map((t0, k) => {
      const F = seule ? PL.fenetreSeule : PL.fenetres[k];
      const f = cree('div', 'fenetre', p);
      placer(f, F.x, F.y, F.l, F.h);
      const toile = cree('canvas', '', f);
      toile.width = Math.round(F.l * 1.25);
      toile.height = Math.round(F.h * 1.25);
      const legende = cree('div', 'legende', f, legendes[k][0]);
      if (F.legende === 'haut') { legende.style.bottom = 'auto'; legende.style.top = '16px'; }
      return { f, toile, legende, sources: sources[k], legendes: legendes[k], boite: F };
    });
    // Le soulignement du titre, en coordonnées de la boîte du titre (grand format)
    const l2 = largeurTexte(D.textes.pratique.titre[1], `800 ${taille}px "Plus Jakarta Sans"`, -0.045 * taille);
    G.pratiqueSouligne = { x: 0, y: taille * 1.06 + taille * 1.12, l: l2 };
    S.pratique = { p, boiteTitre, titre, lignes, fenetres, taille };
  }

  function construireParcours() {
    if (!M.parcours) return;
    const p = plan('parcours');
    const PA = L.parcours;
    const noeuds = [0, 1, 2].map(k => {
      const n = cree('div', 'noeud', p, String(k + 1));
      placer(n, PA.noeuds.x[k], PA.noeuds.y[k]);
      const lab = cree('div', 'noeud-label', p, D.textes.parcours.courts[k]);
      placer(lab, PA.noeuds.x[k], PA.noeuds.y[k] + 48);
      return { n, lab };
    });
    const taille = ajuster(D.textes.parcours.etapes, FORMAT === '4x5' ? 700 : 840, PA.titre.taille);
    const titres = D.textes.parcours.etapes.map(texte => ligneMasquee(p, texte, { x: PA.titre.x, y: PA.titre.y, taille }));
    const notes = D.textes.parcours.note.map((texte, k) => {
      const m = cree('div', 'm', p);
      const mi = cree('span', 'mi note', m, texte);
      mi.style.position = 'relative';
      m.style.fontSize = '28px';
      placer(m, PA.note.x, PA.note.y + k * 38);
      return { m, mi };
    });

    // L'écran : trois piles de captures du site, une par étape
    const ecran = cree('div', 'ecran-site', p);
    const B = PA.ecran;
    placer(ecran, B.x, B.y, B.l, B.h);
    const R = window.REPERES_SITE;
    const k = B.l / 1170;
    function pile(noms) {
      const el = cree('div', 'pile', ecran);
      let y = 0;
      const places = {};
      for (const nom of noms) {
        const r = R[nom];
        const img = cree('img', '', el);
        img.src = `medias/site/${nom}.png`;
        const x = (1170 - r.largeur) / 2;
        img.style.left = x + 'px';
        img.style.top = y + 'px';
        img.style.width = r.largeur + 'px';
        places[nom] = { x, y, r };
        y += r.hauteur;
      }
      el.style.width = '1170px';
      el.style.height = y + 'px';
      return { el, places, hauteur: y };
    }
    const piles = [
      pile(['catalogue-filtres', 'catalogue-carte']),
      pile(['fiche-programme']),
      pile(['fiche-bouton', 'formulaire-entete', 'formulaire-etapes', 'formulaire-champs'])
    ];
    const appui = cree('div', 'appui', p);
    const haut = cree('div', 'fondu', ecran); haut.style.top = '0'; haut.style.height = '34px'; haut.style.background = 'linear-gradient(rgba(10,15,21,.85), transparent)';
    const bas = cree('div', 'fondu', ecran); bas.style.bottom = '0'; bas.style.background = 'linear-gradient(transparent, rgba(10,15,21,.9))';
    S.parcours = { p, noeuds, titres, notes, ecran, piles, appui, k };
    G.noeuds = PA.noeuds;
    G.ecranSite = { x: B.x, y: B.y, l: B.l, h: B.h, r: 30 };
  }

  function construireAppel() {
    const p = plan('appel');
    const AL = L.appel;
    const logo = cree('img', '', p);
    logo.src = 'medias/marque/logo-vert.png';
    logo.alt = 'IMPACTALI';
    logo.style.position = 'absolute';
    const lh = AL.logo.l / RATIO_LOGO;
    placer(logo, AL.logo.cx - AL.logo.l / 2, AL.logo.y, AL.logo.l, lh);
    G.logoAppel = { x: AL.logo.cx - AL.logo.l / 2, y: AL.logo.y, l: AL.logo.l, h: lh };

    // Le slogan : chaque mot dans son masque, disposé ligne par ligne
    const SL = AL.slogan;
    const mots = D.textes.appel.slogan;
    const taille = ajuster(SL.lignes.map(l => l.map(i => mots[i]).join(' ')), FORMAT === '4x5' ? 900 : 840, SL.taille);
    const objets = [];
    SL.lignes.forEach((ligne, n) => {
      const espace = taille * 0.24;
      const largeurs = ligne.map(i => largeurTexte(mots[i], `800 ${taille}px "Plus Jakarta Sans"`, -0.045 * taille));
      const total = largeurs.reduce((a, b) => a + b, 0) + espace * (ligne.length - 1);
      let x = SL.cx - total / 2;
      ligne.forEach((i, j) => {
        // Le point final en vert : la signature du site
        const o = ligneMasquee(p, '', { x, y: SL.y + n * taille * SL.interligne, taille });
        o.mi.textContent = mots[i].replace(/\.$/, '');
        if (/\.$/.test(mots[i])) cree('span', 't-vert', o.mi, '.');
        objets[i] = o;
        x += largeurs[j] + espace;
      });
    });

    const B = AL.bouton;
    const bouton = cree('div', 'bouton-final', p);
    placer(bouton, B.cx - B.l / 2, B.y, B.l, B.h);
    const fondBouton = cree('div', 'fond', bouton);
    const texte = cree('span', '', bouton, D.textes.appel.bouton);
    const fleche = document.createElementNS(NS, 'svg');
    fleche.setAttribute('viewBox', '0 0 40 40');
    fleche.setAttribute('width', '44');
    fleche.setAttribute('height', '44');
    const fp = document.createElementNS(NS, 'path');
    fp.setAttribute('d', 'M6 20 H32 M22 10 L32 20 L22 30');
    fp.setAttribute('fill', 'none');
    fp.setAttribute('stroke', '#050709');
    fp.setAttribute('stroke-width', '4.4');
    fp.setAttribute('stroke-linecap', 'round');
    fp.setAttribute('stroke-linejoin', 'round');
    fleche.appendChild(fp);
    bouton.appendChild(fleche);
    G.bouton = { x: B.cx - B.l / 2, y: B.y, l: B.l, h: B.h };

    const invitation = cree('div', 'invitation', p, D.site.inscriptionsOuvertes ? D.textes.appel.invitation : D.textes.appel.invitationSansInscription);
    placer(invitation, 0, AL.invitation.y, W);
    const adresse = cree('div', 'adresse', p, D.site.adresse);
    placer(adresse, 0, AL.adresse.y, W);
    const la = largeurTexte(D.site.adresse, '800 46px "Inter"', -0.46);
    G.adresseSouligne = { x: AL.adresse.cx - la / 2, y: AL.adresse.y + 60, l: la };
    S.appel = { p, logo, mots: objets, bouton, fondBouton, texte, fleche, invitation, adresse };
  }

  // ================================================================ le fil ==
  /* Le fil est une seule ligne. À chaque instant, un « geste » dit quel
     chemin il suit et quelle portion en est visible (a → b, en fractions de
     la longueur). Entre deux gestes, le dernier reste posé. */
  const longueurs = new Map();
  function longueur(d) {
    if (!longueurs.has(d)) { mesureur.setAttribute('d', d); longueurs.set(d, mesureur.getTotalLength()); }
    return longueurs.get(d);
  }
  const seg = (x1, y1, x2, y2) => `M${pr(x1)} ${pr(y1)} L${pr(x2)} ${pr(y2)}`;
  /** Rectangle arrondi, parcouru dans le sens des aiguilles d'une montre depuis le coin haut gauche. */
  function rr(b) {
    const r = Math.min(b.r || 0, b.l / 2, b.h / 2);
    const { x, y, l, h } = b;
    return `M${pr(x + r)} ${pr(y)} H${pr(x + l - r)} A${pr(r)} ${pr(r)} 0 0 1 ${pr(x + l)} ${pr(y + r)} V${pr(y + h - r)} A${pr(r)} ${pr(r)} 0 0 1 ${pr(x + l - r)} ${pr(y + h)} H${pr(x + r)} A${pr(r)} ${pr(r)} 0 0 1 ${pr(x)} ${pr(y + h - r)} V${pr(y + r)} A${pr(r)} ${pr(r)} 0 0 1 ${pr(x + r)} ${pr(y)}`;
  }
  /** Une courbe douce d'un point à un autre (pour les voyages du fil). */
  function courbe(x1, y1, x2, y2, bombe = 0.35) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const mx = (x1 + x2) / 2 - dy * bombe;
    const my = (y1 + y2) / 2 + dx * bombe;
    return `M${pr(x1)} ${pr(y1)} Q${pr(mx)} ${pr(my)} ${pr(x2)} ${pr(y2)}`;
  }
  const interpBoite = (a, b, k) => ({ x: entre(a.x, b.x, k), y: entre(a.y, b.y, k), l: entre(a.l, b.l, k), h: entre(a.h, b.h, k), r: entre(a.r || 0, b.r || 0, k) });

  const GESTES = [];
  /** Le fil se trace : b va de `de` à `a` (a fixe à 0). */
  function trace(t0, t1, chemin, { courbe: c = E.outCubic, de = 0, jusque = 1 } = {}) {
    GESTES.push({ t0, t1, f: (u, t) => ({ d: typeof chemin === 'function' ? chemin(t) : chemin, a: 0, b: entre(de, jusque, c(u)) }) });
  }
  /** Le fil s'efface : la queue rejoint la tête (a va de 0 à 1). */
  function efface(t0, t1, chemin, { courbe: c = E.inCubic } = {}) {
    GESTES.push({ t0, t1, f: (u, t) => ({ d: typeof chemin === 'function' ? chemin(t) : chemin, a: c(u), b: 1 }), finit: true });
  }
  /** Le fil voyage : un trait de `longueurTrait` points court le long du chemin. */
  function comete(t0, t1, chemin, longueurTrait = 180, { courbe: c = E.inOutCubic } = {}) {
    GESTES.push({
      t0, t1, finit: true, f: u => {
        const Lc = longueur(chemin);
        const s = c(u) * (Lc + longueurTrait);
        return { d: chemin, a: borne((s - longueurTrait) / Lc), b: borne(s / Lc) };
      }
    });
  }
  /** Le fil suit un chemin qui bouge (a = 0, b = 1). */
  function suit(t0, t1, chemin) {
    GESTES.push({ t0, t1, f: (u, t) => ({ d: chemin(t), a: 0, b: 1 }) });
  }

  function etatFil(t) {
    let g = null;
    for (const x of GESTES) if (t >= x.t0) g = x;
    if (!g) return null;
    if (t > g.t1 && g.finit) return null;
    return g.f(avance(t, g.t0, g.t1), t);
  }

  function rendreFil(t) {
    const e = etatFil(t);
    if (!e || e.b - e.a <= 0.0005) { filTrait.style.display = filLueur.style.display = 'none'; return; }
    const Lc = longueur(e.d);
    const visibleL = Math.max(0.5, (e.b - e.a) * Lc);
    for (const el of [filTrait, filLueur]) {
      el.style.display = '';
      el.setAttribute('d', e.d);
      el.setAttribute('stroke-dasharray', `${visibleL.toFixed(2)} ${(Lc * 2 + 10).toFixed(2)}`);
      el.setAttribute('stroke-dashoffset', (-e.a * Lc).toFixed(2));
    }
    const ep = FORMAT === '4x5' ? 7 : 8;
    filTrait.setAttribute('stroke-width', ep);
    filLueur.setAttribute('stroke-width', ep * 2.6);
  }

  // ===================================================== les séquences ==

  // ---- 1. L'accroche --------------------------------------------------
  function soulignementAccroche() {
    const A = S.accroche;
    const l = A.lignes[A.fort];
    const largeurMot = largeurTexte(D.textes.accroche[D.textes.motFort], `800 ${l.taille}px "Plus Jakarta Sans"`, -0.045 * l.taille);
    // Le mot fort peut être précédé d'autres mots sur sa ligne (4:5) : il est seul dans les données actuelles
    return { x1: L.accroche.x + 4, x2: L.accroche.x + largeurMot, y: l.y + l.taille * 1.13 };
  }
  function rendreAccroche(t) {
    const A = S.accroche;
    const T = M.accroche;
    const actif = t < T.fin + 0.04;
    visible(A.p, actif);
    if (!actif) return;
    A.lignes.forEach((l, k) => monter(l, t, T.mots[k], { duree: 0.6, sortie: T.sortie + k * 0.045, dureeSortie: 0.3 }));
    // Le mot fort passe au vert à mesure que le fil le souligne
    const u = soulignementAccroche();
    const tete = E.outCubic(avance(t, T.fort[0], T.fort[1]));
    const ligne = A.lignes[A.fort];
    if (!ligne.largeur) ligne.largeur = ligne.mi.offsetWidth;
    const montre = borne((tete * (u.x2 - u.x1) + (u.x1 - L.accroche.x)) / ligne.largeur);
    ligne.vert.style.clipPath = `inset(-20% ${((1 - montre) * 100).toFixed(2)}% -20% 0)`;
  }

  // ---- 2. La marque ---------------------------------------------------
  function boiteTelephone(t) {
    const T = M.marque;
    const g = G.telephone;
    const monte = E.outExpo(avance(t, T.site + 0.05, T.site + 0.85));
    const derive = avance(t, T.site + 0.85, T.fin) * -14;
    let b = { x: g.x, y: entre(H + 60, g.y, monte) + derive, l: g.l, h: g.h, r: 64 };
    // À la fin, le téléphone devient la première carte des domaines
    const k = E.inOutCubic(avance(t, T.fin - 0.28, T.fin + 0.22));
    if (k > 0) b = interpBoite(b, G.carte, k);
    return b;
  }
  function rendreMarque(t) {
    const Q = S.marque;
    const T = M.marque;
    const actif = t >= T.debut - 0.02 && t < T.fin + 0.25;
    visible(Q.p, actif);
    if (!actif) return;
    // Le logo, dévoilé par le passage du fil
    const balaye = E.outCubic(avance(t, T.balayage[0], T.balayage[1]));
    Q.logo.style.clipPath = `inset(-2% ${((1 - balaye) * 100).toFixed(2)}% -2% 0)`;
    const tasse = 1.035 - 0.035 * E.outCubic(avance(t, T.balayage[0], T.balayage[0] + 1.4));
    let ox = G.logo.l * (1 - tasse) / 2;
    let oy = G.logo.h * (1 - tasse) / 2;
    let s = tasse;
    let o = 1;
    // 40 s en 9:16 : le logo monte et se réduit pour laisser place au site
    if (T.site !== null && L.marque.logoHaut) {
      const H2 = L.marque.logoHaut;
      const k = E.inOutCubic(avance(t, T.site - 0.1, T.site + 0.5));
      const s2 = H2.l / G.logo.l;
      ox = entre(ox, (H2.cx - H2.l / 2) - G.logo.x, k);
      oy = entre(oy, H2.y - G.logo.y, k);
      s = entre(s, s2, k);
      o = 1 - avance(t, T.fin - 0.3, T.fin - 0.05);
    } else {
      // Sinon il s'efface en fin de séquence
      const sortie = E.inCubic(avance(t, T.fin - 0.32, T.fin));
      oy -= sortie * 60;
      o = 1 - sortie;
    }
    poser(Q.logo, { x: ox, y: oy, s, o });
    const sortieSig = T.site !== null && L.marque.logoHaut ? T.site - 0.15 : T.fin - 0.34;
    Q.sig.forEach((l, k) => monter(l, t, T.signature + k * 0.1, { duree: 0.55, sortie: sortieSig + k * 0.04, dureeSortie: 0.3 }));

    if (Q.tel) {
      const b = boiteTelephone(t);
      Q.tel.style.left = pr(b.x) + 'px';
      Q.tel.style.top = pr(b.y) + 'px';
      Q.tel.style.width = pr(b.l) + 'px';
      Q.tel.style.height = pr(b.h) + 'px';
      Q.tel.style.borderRadius = pr(b.r) + 'px';
      const fondu = 1 - avance(t, T.fin - 0.3, T.fin - 0.02);
      Q.tel.ecran.style.opacity = fondu.toFixed(3);
      Q.tel.encoche.style.opacity = fondu.toFixed(3);
      Q.tel.style.visibility = t >= T.site ? 'inherit' : 'hidden';
      Q.tel.style.opacity = (1 - avance(t, T.fin + 0.05, T.fin + 0.22)).toFixed(3);
      // Défilement sobre de la page d'accueil
      const defile = E.inOutCubic(avance(t, T.site + 1.0, T.fin - 0.35)) * 150 * L.marque.telephone.echelle;
      Q.tel.image.style.transform = `translateY(${(-defile).toFixed(2)}px)`;
    }
  }

  // ---- 3. Les domaines --------------------------------------------------
  function bornesCarte(k) {
    const T = M.domaines;
    const debut = T.cartes[k];
    const fin = k < 3 ? T.cartes[k + 1] : (T.recap !== null ? T.recap : T.fin);
    return [debut, fin];
  }
  function rendreDomaines(t) {
    const Q = S.domaines;
    const T = M.domaines;
    const actif = t >= T.debut - 0.3 && t < T.fin + 0.05;
    visible(Q.p, actif);
    if (!actif) return;
    const enRecap = T.recap !== null && t >= T.recap;
    // La sortie du récapitulatif : la caméra plonge dedans
    const plonge = ZOOM_RECAP ? E.inCubic(avance(t, T.fin - 0.32, T.fin)) : 0;
    Q.p.style.transform = plonge > 0 ? 'scale(' + (1 + 0.85 * plonge).toFixed(4) + ')' : 'none';
    Q.p.style.opacity = (1 - plonge).toFixed(3);
    const actuelle = T.cartes.reduce((a, c, k) => (t >= c - 0.02 ? k : a), 0);
    Q.index.textContent = `0${actuelle + 1} / 04`;
    const sortieGenerale = T.recap !== null ? T.recap - 0.05 : T.fin - 0.32;
    poser(Q.index, { y: 10 * (1 - E.outExpo(avance(t, T.debut, T.debut + 0.4))), o: avance(t, T.debut, T.debut + 0.25) * (1 - avance(t, sortieGenerale, sortieGenerale + 0.2)) });

    Q.verbes.forEach((v, k) => {
      const [d, f] = bornesCarte(k);
      const sort = k < 3 ? f - 0.3 : sortieGenerale;
      monter(v, t, d + 0.02, { duree: 0.5, sortie: sort, dureeSortie: 0.24 });
      v.m.style.visibility = t >= d - 0.1 && t < sort + 0.3 ? 'inherit' : 'hidden';
    });
    Q.formations.forEach((f, k) => {
      const [d, fin] = bornesCarte(k);
      const sort = k < 3 ? fin - 0.3 : sortieGenerale;
      const e = E.outExpo(avance(t, d + 0.12, d + 0.6));
      const s = E.inCubic(avance(t, sort, sort + 0.22));
      poser(f, { y: 22 * (1 - e) - 14 * s, o: e * (1 - s) });
      f.style.visibility = t >= d && t < sort + 0.25 ? 'inherit' : 'hidden';
    });

    const premiereDepuisTelephone = T.debut === M.marque.fin && M.marque.site !== null;
    Q.cartes.forEach((c, k) => {
      const [d, f] = bornesCarte(k);
      let etat = { x: 0, y: 0, s: 1, ry: 0, o: 1 };
      let vu = t >= d - 0.25 && t < f + 0.25;
      // Entrée : trois passages différents, pour que le regard ne s'habitue pas
      const entree = PASSAGES_CARTES[k];
      if (k === 0 && premiereDepuisTelephone) {
        etat.o = avance(t, d - 0.08, d + 0.16);
      } else if (entree === 'traverse') {
        // La carte vient du fond, à travers la précédente
        const e = E.outExpo(avance(t, d - 0.12, d + 0.42));
        etat.s = 0.8 + 0.2 * e;
        etat.o = borne(e * 1.8);
      } else if (entree === 'monte') {
        // La carte monte du bas, légèrement inclinée, et se pose à plat
        const e = E.outExpo(avance(t, d - 0.2, d + 0.4));
        etat.y = (1 - e) * H * 0.42;
        etat.rx = (1 - e) * 16;
        etat.o = borne(e * 2);
      } else {
        const e = E.outExpo(avance(t, d - 0.22, d + 0.36));
        etat.x = (1 - e) * W * 0.82;
        etat.ry = (1 - e) * -16;
        etat.s = 0.94 + 0.06 * e;
        etat.o = borne(e * 2.2);
      }
      // Sortie : elle répond à l'entrée de la carte suivante (sauf vers le récapitulatif)
      if (k < 3 || T.recap === null) {
        const suivante = k < 3 ? PASSAGES_CARTES[k + 1] : 'glisse';
        const sortie = k < 3 ? f - 0.22 : T.fin - 0.32;
        if (suivante === 'traverse') {
          // Elle passe derrière la caméra : elle grandit et s'efface
          const s = E.inCubic(avance(t, f - 0.24, f + 0.12));
          etat.s *= 1 + 0.4 * s;
          etat.o *= 1 - s;
        } else if (suivante === 'monte') {
          const s = E.inCubic(avance(t, f - 0.24, f + 0.16));
          etat.y -= s * H * 0.35;
          etat.rx = (etat.rx || 0) - s * 10;
          etat.o *= 1 - s;
        } else {
          const s = E.inCubic(avance(t, sortie, sortie + 0.42));
          etat.x -= s * W * 0.34;
          etat.s *= 1 - s * 0.12;
          etat.ry += s * 12;
          etat.o *= 1 - s;
        }
      }
      // Le récapitulatif : chaque carte rejoint sa case
      if (enRecap || (T.recap !== null && t >= T.recap - 0.01)) {
        const cel = Q.recap.cellules[k];
        const debutK = T.recap + (k === 3 ? 0 : 0.12 + k * 0.07);
        const m = E.inOutCubic(avance(t, debutK, debutK + (k === 3 ? 0.55 : 0.5)));
        const ox = cel.x - G.carte.x;
        const oy = cel.y - G.carte.y;
        if (k === 3) {
          etat = { x: entre(0, ox, m), y: entre(0, oy, m), s: entre(1, cel.s, m), ry: 0, o: 1 };
        } else {
          etat = { x: ox, y: oy + 40 * (1 - m), s: cel.s * (0.92 + 0.08 * m), ry: 0, o: m };
        }
        const sortie = ZOOM_RECAP ? 0 : E.inCubic(avance(t, T.fin - 0.42 + k * 0.04, T.fin - 0.1 + k * 0.04));
        etat.y += sortie * 70;
        etat.o *= 1 - sortie;
        vu = t >= debutK - 0.02 || k === 3;
        c.mini.style.opacity = avance(t, T.recap + 0.35, T.recap + 0.65).toFixed(3);
      } else {
        c.mini.style.opacity = '0';
      }
      c.c.style.visibility = vu && etat.o > 0.001 ? 'inherit' : 'hidden';
      poser(c.c, etat);
      // La réalisation s'anime pendant la carte ; dans le récapitulatif, elle est achevée
      const p = enRecap ? 1 : avance(t, d - 0.1, f - 0.12);
      if (c.c.style.visibility === 'inherit') c.illu.anime(p, t);
    });

    if (Q.recap) {
      const R = Q.recap;
      const vu = t >= T.recap;
      R.titre.forEach((l, k) => {
        l.m.style.visibility = vu ? 'inherit' : 'hidden';
        monter(l, t, T.recap + 0.15 + k * 0.09, { duree: 0.6, sortie: ZOOM_RECAP ? null : T.fin - 0.4 + k * 0.04, dureeSortie: 0.3 });
      });
      const e = E.outExpo(avance(t, T.recap + 0.85, T.recap + 1.3));
      const s = ZOOM_RECAP ? 0 : E.inCubic(avance(t, T.fin - 0.38, T.fin - 0.1));
      R.aVenir.style.visibility = vu ? 'inherit' : 'hidden';
      poser(R.aVenir, { y: 24 * (1 - e) + 30 * s, o: e * (1 - s) });
    }
  }

  // ---- 4. La pratique ----------------------------------------------------
  function etatTitrePratique(t) {
    const T = M.pratique;
    const PL = L.pratique;
    const k = E.inOutCubic(avance(t, T.monte, T.monte + 0.62));
    const s = entre(1, PL.titrePetit.echelle, k);
    const y = entre(PL.titreGrand.y, PL.titrePetit.y, k);
    return { x: PL.titreGrand.x, y, s };
  }
  function rendrePratique(t) {
    const Q = S.pratique;
    const T = M.pratique;
    const actif = t >= T.debut - 0.05 && t < T.fin + 0.12;
    visible(Q.p, actif);
    if (!actif) return;
    const arrivee = ZOOM_RECAP ? E.outExpo(avance(t, T.debut - 0.02, T.debut + 0.45)) : 1;
    const pousse = POUSSE_PARCOURS ? E.inOutCubic(avance(t, T.fin - 0.32, T.fin + 0.08)) : 0;
    Q.p.style.transform = 'translateX(' + (-pousse * W).toFixed(1) + 'px) scale(' + (0.86 + 0.14 * arrivee).toFixed(4) + ')';
    Q.p.style.opacity = borne(arrivee * 1.6).toFixed(3);
    const sortieP = k => (POUSSE_PARCOURS ? null : T.fin - 0.42 + k * 0.04);
    const et = etatTitrePratique(t);
    Q.boiteTitre.style.left = et.x + 'px';
    Q.boiteTitre.style.top = pr(et.y) + 'px';
    Q.boiteTitre.style.transform = `scale(${et.s.toFixed(5)})`;
    Q.titre.forEach((l, k) => monter(l, t, T.debut + 0.04 + k * 0.1, { duree: 0.6, sortie: sortieP(k), dureeSortie: 0.3 }));
    Q.lignes.forEach((l, k) => monter(l, t, T.lignes[k], { duree: 0.55, sortie: sortieP(k), dureeSortie: 0.3 }));
    Q.fenetres.forEach((F, k) => {
      const t0 = T.fenetres[k];
      const ouvre = E.outExpo(avance(t, t0, t0 + 0.7));
      const sortie = POUSSE_PARCOURS ? 0 : E.inCubic(avance(t, T.fin - 0.42 + k * 0.05, T.fin - 0.06 + k * 0.05));
      F.f.style.visibility = t >= t0 && sortie < 1 ? 'inherit' : 'hidden';
      // Le rideau s'ouvre du haut vers le bas, l'image se pose en douceur
      F.f.style.clipPath = `inset(0 0 ${((1 - ouvre) * 100).toFixed(2)}% 0 round 26px)`;
      poser(F.f, { y: 30 * (1 - ouvre) + sortie * 90 - avance(t, t0, T.fin) * 16, s: 1 - sortie * 0.06, o: 1 - sortie });
      const bascule = T.bascules[k];
      const second = bascule !== undefined && t >= bascule;
      const nom = second ? F.sources[1] : F.sources[0];
      const depart = second ? bascule : t0;
      const fin = second ? T.fin : (bascule !== undefined ? bascule : T.fin);
      const n = FILMS[nom] ? FILMS[nom].images.length : 1;
      const vitesse = borne(n / ((fin - depart) * 30), 0.82, 1);
      dessinerFilm(F.toile, nom, t - depart, vitesse);
      F.legende.textContent = second ? F.legendes[1] : F.legendes[0];
      const zoom = 1.08 - 0.08 * E.outCubic(avance(t, depart, depart + 1.6));
      F.toile.style.transform = `scale(${zoom.toFixed(4)})`;
      poser(F.legende, { o: avance(t, t0 + 0.45, t0 + 0.7) });
    });
  }

  // ---- 5. Le parcours ------------------------------------------------------
  function rendreParcours(t) {
    if (!S.parcours) return;
    const Q = S.parcours;
    const T = M.parcours;
    const actif = t >= T.debut - 0.36 && t < T.fin + 0.05;
    visible(Q.p, actif);
    if (!actif) return;
    // Il arrive de la droite, en poussant la pratique
    const glisse = E.inOutCubic(avance(t, T.debut - 0.32, T.debut + 0.08));
    Q.p.style.transform = 'translateX(' + ((1 - glisse) * W).toFixed(1) + 'px)';
    const entree = 1;
    const sortie = E.inCubic(avance(t, T.fin - 0.4, T.fin - 0.05));

    Q.noeuds.forEach(({ n, lab }, k) => {
      const actifK = t >= T.etapes[k];
      const pop = E.outBack(avance(t, T.etapes[k] + 0.08, T.etapes[k] + 0.4));
      n.style.background = actifK ? VERT : 'rgba(5,7,9,.9)';
      n.style.color = actifK ? '#050709' : 'rgba(246,245,239,.6)';
      n.style.boxShadow = actifK ? '0 0 0 6px rgba(203,253,0,.16), 0 0 30px rgba(203,253,0,.35)' : 'inset 0 0 0 2px rgba(246,245,239,.28)';
      poser(n, { s: (actifK ? 0.85 + 0.15 * pop : 0.9) * (0.6 + 0.4 * entree) * (1 - sortie * 0.3), o: entree * (1 - sortie) });
      lab.style.color = actifK ? '#FFFFFF' : 'rgba(246,245,239,.55)';
      poser(lab, { o: entree * (1 - sortie), y: -50 * 0 });
      lab.style.transform += ' translateX(-50%)';
    });
    Q.titres.forEach((l, k) => {
      const debut = T.etapes[k] + (k === 0 ? 0.15 : 0.05);
      const fin = k < 2 ? T.etapes[k + 1] - 0.12 : T.fin - 0.4;
      monter(l, t, debut, { duree: 0.5, sortie: fin, dureeSortie: 0.24 });
      l.m.style.visibility = t >= debut - 0.05 && t < fin + 0.3 ? 'inherit' : 'hidden';
    });
    Q.notes.forEach((l, k) => monter(l, t, T.etapes[2] + 0.55 + k * 0.12, { duree: 0.5, sortie: T.fin - 0.4, dureeSortie: 0.24 }));

    // L'écran et ses captures
    poser(Q.ecran, { y: 70 * (1 - entree) + sortie * 60, s: (0.95 + 0.05 * entree) * (1 - sortie * 0.06), o: borne(entree * 1.5) * (1 - sortie) });
    const B = L.parcours.ecran;
    const k = Q.k;
    const R = window.REPERES_SITE;
    Q.piles.forEach((pile, i) => {
      const debut = T.etapes[i];
      const fin = i < 2 ? T.etapes[i + 1] : T.fin;
      const arrive = i === 0 ? 1 : E.outExpo(avance(t, debut - 0.08, debut + 0.5));
      const part = i < 2 ? E.inCubic(avance(t, fin - 0.12, fin + 0.22)) : 0;
      // Le défilement de chaque pile, vers ce qui compte
      let defile = 0;
      if (i === 0) {
        const p = pile.places['catalogue-carte'];
        const cible = (p.y + R['catalogue-carte'].bouton.y + R['catalogue-carte'].bouton.h / 2) * k - B.h * 0.66;
        defile = cible * E.inOutCubic(avance(t, debut + 0.7, T.appuis[0] - 0.12));
      } else if (i === 1) {
        const cible = Math.max(0, pile.hauteur * k - B.h + 20);
        defile = cible * E.inOutCubic(avance(t, debut + 0.55, fin - 0.15));
      } else {
        const p = pile.places['formulaire-etapes'];
        const cible = p.y * k - 30;
        defile = cible * E.inOutCubic(avance(t, T.appuis[1] + 0.25, T.appuis[1] + 1.1));
      }
      pile.el.style.visibility = t >= debut - 0.1 && part < 1 ? 'inherit' : 'hidden';
      pile.el.style.transform = `translateY(${((1 - arrive) * B.h - part * B.h - defile + 26).toFixed(2)}px) scale(${k.toFixed(5)})`;
      pile.defile = defile;
    });

    // L'appui du doigt, sur le bouton visé
    let appui = null;
    if (t >= T.appuis[0] - 0.05 && t < T.appuis[0] + 0.55) {
      const pile = Q.piles[0];
      const p = pile.places['catalogue-carte'];
      const b = R['catalogue-carte'].bouton;
      appui = { t0: T.appuis[0], x: B.x + (p.x + b.x + b.l / 2) * k, y: B.y + 26 + (p.y + b.y + b.h / 2) * k - pile.defile };
    } else if (t >= T.appuis[1] - 0.05 && t < T.appuis[1] + 0.55) {
      const pile = Q.piles[2];
      const p = pile.places['fiche-bouton'];
      const b = R['fiche-bouton'].bouton;
      appui = { t0: T.appuis[1], x: B.x + (p.x + b.x + b.l / 2) * k, y: B.y + 26 + (p.y + b.y + b.h / 2) * k - pile.defile };
    }
    if (appui) {
      const u = avance(t, appui.t0, appui.t0 + 0.5);
      Q.appui.style.visibility = 'inherit';
      placer(Q.appui, appui.x, appui.y + (FORMAT === '4x5' ? 0 : 0));
      poser(Q.appui, { s: 0.45 + 1.1 * E.outCubic(u), o: (t < appui.t0 ? avance(t, appui.t0 - 0.05, appui.t0) : 1) * (1 - u) * 0.9 });
    } else {
      Q.appui.style.visibility = 'hidden';
    }
  }

  // ---- 6. L'appel ----------------------------------------------------------
  function rendreAppel(t) {
    const Q = S.appel;
    const T = M.appel;
    const actif = t >= T.debut - 0.02;
    visible(Q.p, actif);
    if (!actif) return;
    const balaye = E.outCubic(avance(t, T.logo, T.logo + 0.48));
    Q.logo.style.clipPath = `inset(-2% ${((1 - balaye) * 100).toFixed(2)}% -2% 0)`;
    const tasse = 1.03 - 0.03 * E.outCubic(avance(t, T.logo, T.logo + 1.3));
    poser(Q.logo, { x: G.logoAppel.l * (1 - tasse) / 2, y: G.logoAppel.h * (1 - tasse) / 2, s: tasse });
    Q.mots.forEach((m, k) => monter(m, t, T.mots[k], { duree: 0.5 }));
    // Le bouton : le fil en trace le contour, puis il se remplit
    const remplit = E.outExpo(avance(t, T.bouton[1] - 0.06, T.bouton[1] + 0.4));
    Q.fondBouton.style.transform = `scaleX(${remplit.toFixed(4)})`;
    Q.fondBouton.style.transformOrigin = '0 50%';
    poser(Q.bouton, { s: 1 + 0.035 * Math.sin(Math.PI * avance(t, T.bouton[1], T.bouton[1] + 0.35)) });
    Q.bouton.style.visibility = t >= T.bouton[0] ? 'inherit' : 'hidden';
    const lettre = E.outExpo(avance(t, T.bouton[1] + 0.05, T.bouton[1] + 0.5));
    poser(Q.texte, { y: 16 * (1 - lettre), o: lettre });
    poser(Q.fleche, { x: -22 * (1 - E.outExpo(avance(t, T.bouton[1] + 0.15, T.bouton[1] + 0.6))), o: avance(t, T.bouton[1] + 0.15, T.bouton[1] + 0.4) });
    const a = E.outExpo(avance(t, T.adresse, T.adresse + 0.5));
    poser(Q.invitation, { y: 16 * (1 - a), o: a });
    const a2 = E.outExpo(avance(t, T.adresse + 0.1, T.adresse + 0.6));
    poser(Q.adresse, { y: 16 * (1 - a2), o: a2 });
  }

  // ---- La caméra ----------------------------------------------------------
  /* Une caméra continue : elle pousse lentement pendant une séquence et recule
     pendant la suivante, de sorte qu'aucun changement de séquence ne la fait
     sauter. À l'ouverture, elle se pose d'un léger recul (l'accroche « arrive »).
     Elle s'immobilise sur l'écran final, qui doit rester stable pour être lu. */
  function etatCamera(t) {
    const seq = ['accroche', 'marque', 'domaines', 'pratique', 'parcours', 'appel'].filter(n => M[n]);
    const arret = M.appel.adresse + 0.6;
    const AMPLITUDE = 0.022;
    let s = 1;
    seq.forEach((n, i) => {
      if (t < M[n].debut) return;
      const fin = n === 'appel' ? arret : M[n].fin;
      const debut = n === 'accroche' ? 0.9 : M[n].debut;
      const u = E.inOutCubic(avance(t, debut, fin));
      s = i % 2 === 0 ? 1 + AMPLITUDE * u : 1 + AMPLITUDE * (1 - u);
    });
    // L'arrivée : de 5 % plus près, posée en 0,9 s
    s += 0.05 * (1 - E.outExpo(avance(t, 0, 0.9)));
    const tf = Math.min(t, arret);
    return { s, x: Math.sin(tf * 0.35) * 7, y: Math.cos(tf * 0.28) * 5 };
  }
  function rendreCamera(t) {
    const c = etatCamera(t);
    camera.style.transform = `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) scale(${c.s.toFixed(5)})`;
    // Le fond suit à moitié, en sens contraire : la profondeur
    fond.style.transform = `translate(${(-c.x * 0.6).toFixed(2)}px, ${(-c.y * 0.6).toFixed(2)}px) scale(${(1 + (c.s - 1) * 0.4).toFixed(5)})`;
  }

  // ---- Le fond ------------------------------------------------------------
  function rendreFond(t) {
    const seq = ['accroche', 'marque', 'domaines', 'pratique', 'parcours', 'appel'].filter(n => M[n]);
    const cles = [];
    seq.forEach(n => {
      const [x, y] = L.lueurs[n];
      cles.push([M[n].debut + 0.2, x, y], [M[n].fin - 0.2, x, y]);
    });
    const x = cle(t, cles.map(c => [c[0], c[1]]));
    const y = cle(t, cles.map(c => [c[0], c[2]]));
    poser(lueurVerte, { x: x + Math.sin(t * 0.5) * 40, y: y + Math.cos(t * 0.4) * 30, s: 1 + Math.sin(t * 0.7) * 0.04, o: 0.85 + 0.15 * Math.sin(t * 0.9) });
    poser(lueurBleue, { x: W * 0.15 + Math.cos(t * 0.23) * 120, y: H * 0.78 + Math.sin(t * 0.31) * 90 });
  }

  // ================================================== le fil, geste par geste ==
  function composerFil() {
    const A = M.accroche;
    const u = soulignementAccroche();
    const U = seg(u.x1, u.y, u.x2, u.y);
    // Dès la première image, l'amorce du trait attend sous la ligne du mot fort
    trace(-0.01, A.fort[0], U, { de: 0.1, jusque: 0.1 });
    trace(A.fort[0], A.fort[1], U, { de: 0.1 });
    efface(A.sortie + 0.14, A.sortie + 0.36, U, { courbe: E.inCubic });
    // Le voyage vers le logo, puis le balayage qui le dévoile
    const Q = M.marque;
    const yb = G.logo.y + G.logo.h + 14;
    const R = seg(G.logo.x, yb, G.logo.x + G.logo.l, yb);
    comete(A.sortie + 0.42, Q.balayage[0] + 0.03, courbe(u.x2, u.y, G.logo.x, yb, -0.3), 220);
    trace(Q.balayage[0], Q.balayage[1], R, { courbe: E.outCubic });

    if (Q.site !== null) {
      // Le soulignement du logo rejoint le téléphone et en dessine le contour
      efface(Q.site - 0.05, Q.site + 0.15, R);
      const coin = boiteTelephone(Q.site + 0.2);
      comete(Q.site + 0.1, Q.site + 0.3, courbe(G.logo.x + G.logo.l, yb, coin.x + coin.r, coin.y, 0.25), 160);
      trace(Q.site + 0.28, Q.site + 1.0, t => rr(boiteTelephone(t)), { courbe: E.outCubic });
      suit(Q.site + 1.0, M.domaines.cartes[1] - 0.28, t => rr(t < Q.fin + 0.22 ? boiteTelephone(t) : G.carte));
    } else {
      efface(Q.fin - 0.34, Q.fin - 0.1, R);
      comete(Q.fin - 0.14, M.domaines.cartes[0] + 0.12, courbe(G.logo.x + G.logo.l, yb, G.carte.x + G.carte.r, G.carte.y, 0.3), 160);
      trace(M.domaines.cartes[0] + 0.12, M.domaines.cartes[0] + 0.62, rr(G.carte));
    }
    // Chaque carte : le contour s'efface quand elle part, se redessine sur la suivante
    const T = M.domaines;
    for (let k = 1; k < 4; k++) {
      efface(T.cartes[k] - 0.3, T.cartes[k] - 0.02, rr(G.carte));
      trace(T.cartes[k] + 0.2, T.cartes[k] + 0.7, rr(G.carte));
    }
    const P = M.pratique;
    const PL = L.pratique;
    const soul = tt => { const e = etatTitrePratique(tt); const g = G.pratiqueSouligne; return seg(e.x + 4 * e.s, e.y + g.y * e.s, e.x + g.l * e.s, e.y + g.y * e.s); };
    if (T.recap !== null) {
      // Le contour suit la dernière carte dans sa case, puis souligne « vos projets »
      const cel = S.domaines.recap.cellules[3];
      const boiteCel = { x: cel.x, y: cel.y, l: G.carte.l * cel.s, h: G.carte.h * cel.s, r: 30 * cel.s };
      trace(T.recap - 0.01, T.recap + 0.55, tt => rr(interpBoite(G.carte, boiteCel, E.inOutCubic(avance(tt, T.recap, T.recap + 0.55)))), { courbe: () => 1 });
      efface(T.recap + 0.55, T.recap + 0.8, rr(boiteCel));
      const s = G.recapSouligne;
      const Us = seg(s.x + 4, s.y, s.x + s.l, s.y);
      comete(T.recap + 0.72, T.recap + 0.92, courbe(boiteCel.x + boiteCel.l, boiteCel.y, s.x, s.y, 0.3), 150);
      trace(T.recap + 0.9, T.recap + 1.3, Us);
      efface(T.fin - 0.56, T.fin - 0.34, Us);
    } else {
      efface(T.fin - 0.34, T.fin - 0.1, rr(G.carte));
      const debutP = soul(P.debut + 0.2).match(/M([\d.]+) ([\d.]+)/);
      comete(T.fin - 0.14, P.debut + 0.2, courbe(G.carte.x + G.carte.r, G.carte.y, Number(debutP[1]), Number(debutP[2]), 0.25), 170);
    }
    // La pratique : souligne « en faisant », puis entoure la création
    // Après le zoom à travers le récapitulatif, le souligné attend que le titre soit posé
    const debutSouligne = ZOOM_RECAP ? P.debut + 0.45 : P.debut + 0.18;
    trace(debutSouligne, debutSouligne + 0.42, soul, { courbe: E.outCubic });
    if (P.fenetres.length > 1) {
      const F = PL.fenetres[1];
      const boiteF = tt => {
        const ouvre = E.outExpo(avance(tt, P.fenetres[1], P.fenetres[1] + 0.7));
        const derive = -avance(tt, P.fenetres[1], P.fin) * 16;
        return { x: F.x, y: F.y + 30 * (1 - ouvre) + derive, l: F.l, h: F.h, r: 26 };
      };
      efface(P.fenetres[1] - 0.25, P.fenetres[1] - 0.02, soul);
      const fin = soul(P.fenetres[1] - 0.02).match(/L([\d.]+) ([\d.]+)/);
      comete(P.fenetres[1] - 0.05, P.fenetres[1] + 0.18, courbe(Number(fin[1]), Number(fin[2]), F.x + 26, F.y, 0.2), 150);
      trace(P.fenetres[1] + 0.16, P.fenetres[1] + 0.8, tt => rr(boiteF(tt)), { courbe: E.outCubic });
      suit(P.fenetres[1] + 0.8, P.fin - 0.38, tt => rr(boiteF(tt)));
      efface(P.fin - 0.38, P.fin - 0.12, tt => rr(boiteF(tt)));
    } else {
      suit(P.debut + 0.6, P.fin - 0.36, soul);
      efface(P.fin - 0.36, P.fin - 0.12, soul);
    }
    // Le parcours : le fil relie les étapes
    const AP = M.appel;
    const yApp = G.logoAppel.y + G.logoAppel.h + 14;
    const Rapp = seg(G.logoAppel.x, yApp, G.logoAppel.x + G.logoAppel.l, yApp);
    if (M.parcours) {
      const C = M.parcours;
      const N = G.noeuds;
      // D'un bord de pastille à l'autre ; en colonne, le fil part sous le libellé de l'étape
      const bord = (a, b) => { const dx = N.x[b] - N.x[a]; const dy = N.y[b] - N.y[a]; const l = Math.hypot(dx, dy); const depart = Math.abs(dx) < 1 ? 92 : 42; return `M${pr(N.x[a] + dx / l * depart)} ${pr(N.y[a] + dy / l * depart)} L${pr(N.x[b] - dx / l * 42)} ${pr(N.y[b] - dy / l * 42)}`; };
      const Sg = bord(0, 1) + ' ' + bord(1, 2);
      trace(C.etapes[1] - 0.2, C.etapes[1] + 0.2, Sg, { de: 0, jusque: 0.5 });
      trace(C.etapes[2] - 0.2, C.etapes[2] + 0.2, Sg, { de: 0.5, jusque: 1 });
      efface(C.fin - 0.36, C.fin - 0.08, Sg, { courbe: E.inCubic });
      comete(C.fin - 0.12, AP.logo + 0.02, courbe(N.x[2], N.y[2], G.logoAppel.x, yApp, -0.3), 200);
    } else {
      const fin = soul(P.fin - 0.12).match(/L([\d.]+) ([\d.]+)/);
      comete(P.fin - 0.14, AP.logo + 0.02, courbe(Number(fin[1]), Number(fin[2]), G.logoAppel.x, yApp, 0.3), 200);
    }
    // L'appel : dévoile le logo, puis devient le bouton, enfin souligne l'adresse
    trace(AP.logo, AP.logo + 0.48, Rapp, { courbe: E.outCubic });
    efface(AP.bouton[0] - 0.42, AP.bouton[0] - 0.12, Rapp);
    const B = G.bouton;
    const pil = rr({ ...B, r: B.h / 2 });
    comete(AP.bouton[0] - 0.2, AP.bouton[0] + 0.02, courbe(G.logoAppel.x + G.logoAppel.l, yApp, B.x + B.h / 2, B.y, 0.25), 150);
    trace(AP.bouton[0], AP.bouton[1] + 0.02, pil, { courbe: E.inOutCubic });
    efface(AP.bouton[1] + 0.3, AP.bouton[1] + 0.5, pil);
    const sa = G.adresseSouligne;
    const Ua = seg(sa.x + 4, sa.y, sa.x + sa.l, sa.y);
    comete(AP.adresse + 0.05, AP.adresse + 0.32, courbe(B.x + B.l, B.y + B.h, sa.x, sa.y, -0.35), 150);
    trace(AP.adresse + 0.3, AP.adresse + 0.85, Ua, { courbe: E.outCubic });
  }

  // ============================================================ sous-titres ==
  const SOUS_TITRES = [];
  function composerSousTitres() {
    const liste = D.voix[MONTAGE];
    const mesures = window.MESURES_VOIX || {};
    liste.forEach((v, i) => {
      if (v.incruste === false) return;
      const duree = mesures[v.id] ? mesures[v.id].duree : 2;
      const suivant = liste[i + 1] ? liste[i + 1].debut : DUREE;
      const fin = Math.min(Math.max(v.debut + duree + 0.35, v.debut + 0.95), suivant - 0.04);
      SOUS_TITRES.push({ id: v.id, debut: v.debut - 0.04, fin, texte: v.texte });
    });
  }
  let etatST = '';
  function rendreSousTitres(t) {
    const st = SOUS_TITRES.find(s => t >= s.debut && t < s.fin);
    if (!st || !AVEC_ST) { bulleST.style.visibility = 'hidden'; etatST = ''; return; }
    if (bulleST.dataset.id !== st.id) {
      bulleST.dataset.id = st.id;
      bulleST.textContent = st.texte;
      bulleST.style.maxWidth = L.st.largeurMax + 'px';
      bulleST.style.left = '0px';
      bulleST.style.top = '0px';
      bulleST.style.whiteSpace = 'normal';
      const l = bulleST.offsetWidth;
      const h = bulleST.offsetHeight;
      bulleST.style.left = pr(L.st.cx - l / 2) + 'px';
      bulleST.style.top = pr(L.st.bas - h) + 'px';
    }
    const o = avance(t, st.debut, st.debut + 0.1) * (1 - avance(t, st.fin - 0.1, st.fin));
    bulleST.style.visibility = 'visible';
    poser(bulleST, { y: 8 * (1 - avance(t, st.debut, st.debut + 0.14)), o });
    etatST = st.id + ':' + o.toFixed(2) + ':' + (8 * (1 - avance(t, st.debut, st.debut + 0.14))).toFixed(1);
  }

  // ========================================================== la couverture ==
  function rendreCouverture() {
    // L'accroche posée, le mot fort en vert et souligné, le logo au-dessus, les quatre verbes
    visible(S.accroche.p, true);
    S.accroche.lignes.forEach(l => { l.mi.style.transform = 'none'; });
    S.accroche.lignes[S.accroche.fort].vert.style.clipPath = 'none';
    const u = soulignementAccroche();
    const U = seg(u.x1, u.y, u.x2, u.y);
    for (const el of [filTrait, filLueur]) {
      el.style.display = '';
      el.setAttribute('d', U);
      el.removeAttribute('stroke-dasharray');
      el.setAttribute('stroke-dashoffset', '0');
    }
    filTrait.setAttribute('stroke-width', 8);
    filLueur.setAttribute('stroke-width', 21);
    const C = L.couverture;
    const logo = cree('img', '', scene);
    logo.src = 'medias/marque/logo-vert.png';
    logo.style.position = 'absolute';
    placer(logo, C.logo.cx - C.logo.l / 2, C.logo.y, C.logo.l, C.logo.l / RATIO_LOGO);
    const verbes = cree('div', 'abs', scene);
    verbes.style.cssText += `left:${C.verbes.x}px;top:${C.verbes.y}px;display:flex;gap:14px;flex-wrap:wrap;width:${C.verbes.largeur}px`;
    D.domaines.forEach(d => {
      const v = cree('span', '', verbes, d.verbe);
      v.style.cssText = 'padding:14px 24px;border-radius:999px;border:2px solid rgba(203,253,0,.5);background:rgba(203,253,0,.08);font:700 34px/1 Inter, sans-serif;color:#fff';
    });
    poser(lueurVerte, { x: 600, y: H * 0.45, s: 1.1 });
    poser(lueurBleue, { x: W * 0.1, y: H * 0.85 });
  }

  // ================================================================ rendu ==
  function rendre(t) {
    t = borne(t, 0, DUREE);
    if (COUVERTURE) return;
    if (!CALQUE_ST) {
      rendreFond(t);
      rendreCamera(t);
      rendreAccroche(t);
      rendreMarque(t);
      rendreDomaines(t);
      rendrePratique(t);
      rendreParcours(t);
      rendreAppel(t);
      rendreFil(t);
    }
    rendreSousTitres(t);
  }

  // ======================================================= repères sonores ==
  /* Les instants des bruitages et des accents musicaux, tirés du montage :
     son/musique.js s'en sert, la musique tombe donc juste. */
  function reperesSonores() {
    const c = [];
    const A = M.accroche;
    A.mots.forEach((m, k) => c.push({ t: Math.max(0, m + 0.02), type: 'mot', force: k === A.mots.length - 1 ? 0.8 : 0.55 }));
    c.push({ t: A.fort[0], type: 'trait', force: 1, duree: A.fort[1] - A.fort[0] });
    c.push({ t: A.sortie, type: 'souffle', force: 0.8, duree: 0.5 });
    const Q = M.marque;
    c.push({ t: Q.balayage[0], type: 'impact', force: 1 });
    c.push({ t: Q.balayage[0], type: 'balayage', force: 0.9, duree: Q.balayage[1] - Q.balayage[0] });
    c.push({ t: Q.signature, type: 'mot', force: 0.5 });
    if (Q.site !== null) {
      c.push({ t: Q.site, type: 'montee', force: 0.7, duree: 0.8 });
      c.push({ t: Q.site + 0.3, type: 'trait', force: 0.6, duree: 0.7 });
      c.push({ t: Q.fin - 0.3, type: 'souffle', force: 0.9, duree: 0.55 });
    } else {
      c.push({ t: Q.fin - 0.3, type: 'souffle', force: 0.9, duree: 0.5 });
    }
    const T = M.domaines;
    T.cartes.forEach((d, k) => {
      if (k > 0 || Q.site === null) c.push({ t: d - 0.24, type: 'souffle', force: 0.85, duree: 0.48 });
      c.push({ t: d + 0.14, type: 'contour', force: 0.6 });
    });
    if (T.recap !== null) {
      c.push({ t: T.recap, type: 'eclat', force: 0.8 });
      c.push({ t: T.recap + 0.9, type: 'contour', force: 0.5 });
    }
    c.push({ t: T.fin - 0.3, type: 'souffle', force: 0.8, duree: 0.5 });
    const P = M.pratique;
    P.fenetres.forEach(f => c.push({ t: f, type: 'fenetre', force: 0.7, duree: 0.6 }));
    P.lignes.forEach(l => c.push({ t: l, type: 'mot', force: 0.45 }));
    P.bascules.forEach(b => c.push({ t: b, type: 'coupe', force: 0.5 }));
    if (M.parcours) {
      const C = M.parcours;
      C.etapes.forEach((e, k) => c.push({ t: e + (k === 0 ? 0.1 : 0.0), type: 'noeud', force: 0.8, rang: k }));
      C.etapes.slice(1).forEach(e => c.push({ t: e - 0.08, type: 'glisse', force: 0.6, duree: 0.4 }));
      C.appuis.forEach(a => c.push({ t: a, type: 'appui', force: 0.9 }));
      c.push({ t: P.fin - 0.34, type: 'souffle', force: 0.9, duree: 0.45 });
      c.push({ t: C.fin - 0.35, type: 'souffle', force: 0.8, duree: 0.5 });
    } else {
      c.push({ t: P.fin - 0.3, type: 'souffle', force: 0.8, duree: 0.5 });
    }
    const AP = M.appel;
    c.push({ t: AP.logo, type: 'impact', force: 1 });
    c.push({ t: AP.logo, type: 'balayage', force: 0.8, duree: 0.48 });
    AP.mots.forEach((m, k) => c.push({ t: m, type: 'mot', force: 0.7 + k * 0.1 }));
    c.push({ t: AP.bouton[0], type: 'trait', force: 0.7, duree: AP.bouton[1] - AP.bouton[0] });
    c.push({ t: AP.bouton[1], type: 'bouton', force: 1 });
    c.push({ t: AP.adresse + 0.3, type: 'trait', force: 0.5, duree: 0.5 });
    return c.sort((a, b) => a.t - b.t);
  }

  // ============================================================ démarrage ==
  const pret = (async () => {
    await Promise.all([
      document.fonts.load('800 100px "Plus Jakarta Sans"', 'ÉéàçÀ'),
      document.fonts.load('500 30px "Inter"', 'é'), document.fonts.load('600 30px "Inter"', 'é'),
      document.fonts.load('700 30px "Inter"', 'é'), document.fonts.load('800 30px "Inter"', 'é')
    ]);
    await document.fonts.ready;
    await chargerFilms();
    scene.appendChild(mesureurSvg);
    if (COUVERTURE) {
      L.accroche = { ...L.accroche, ...L.couverture.accroche };
      construireAccroche();
      camera.appendChild(filSvg);
      rendreCouverture();
    } else {
      if (!CALQUE_ST) {
        construireAccroche();
        construireMarque();
        construireDomaines();
        construirePratique();
        construireParcours();
        construireAppel();
        camera.appendChild(filSvg);
        composerFil();
      } else {
        fond.remove();
        scene.style.background = 'transparent';
      }
      scene.appendChild(calqueST);
      composerSousTitres();
    }
    await Promise.all([...document.images].map(img => img.decode().catch(() => null)));
    rendre(0);
    return true;
  })();

  window.rendre = rendre;
  window.pret = pret;
  window.DUREE = DUREE;
  window.etatSousTitres = () => etatST;
  window.REPERES_SONORES = () => reperesSonores();
  window.SOUS_TITRES = () => SOUS_TITRES;
  window.MONTAGE_ACTUEL = () => ({ montage: MONTAGE, format: FORMAT, M });
  // Les phrases de la voix, à leur place (la musique s'y fait plus discrète)
  window.VOIX_PLACEES = () => D.voix[MONTAGE].map(v => ({ debut: v.debut, fin: v.debut + ((window.MESURES_VOIX || {})[v.id] ? window.MESURES_VOIX[v.id].duree : 2) }));

  // ====================================================== prévisualisation ==
  if (!CAPTURE) {
    document.body.classList.add('apercu');
    const ajuster2 = () => {
      const k = Math.min(window.innerWidth / W, (window.innerHeight - 70) / H);
      cadre.style.transform = `scale(${k})`;
      cadre.style.left = Math.max(0, (window.innerWidth - W * k) / 2) + 'px';
    };
    ajuster2();
    window.addEventListener('resize', ajuster2);
    let enCours = true;
    let origine = performance.now();
    let temps = 0;
    const curseurTemps = $('curseurTemps');
    curseurTemps.max = String(DUREE);
    $('lecture').addEventListener('click', () => {
      enCours = !enCours;
      $('lecture').textContent = enCours ? 'Pause' : 'Lecture';
      origine = performance.now() - temps * 1000;
    });
    curseurTemps.addEventListener('input', () => {
      temps = Number(curseurTemps.value);
      origine = performance.now() - temps * 1000;
      rendre(temps);
    });
    pret.then(() => {
      const boucle = maintenant => {
        if (enCours) {
          temps = ((maintenant - origine) / 1000) % DUREE;
          curseurTemps.value = String(temps);
          rendre(temps);
        }
        $('temps').textContent = temps.toFixed(2) + ' s';
        requestAnimationFrame(boucle);
      };
      requestAnimationFrame(boucle);
    });
  }
})();

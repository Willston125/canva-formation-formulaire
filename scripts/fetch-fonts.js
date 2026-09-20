/* Télécharge les polices Google et génère un fonts.css local. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const KEEP_SUBSETS = ['latin', 'latin-ext'];

/**
 * Liste des icônes : relevée dans les sources (HTML générés + scripts), jamais figée
 * dans un fichier temporaire — toute icône ajoutée est ainsi embarquée à la régénération.
 */
/** Les fichiers où un nom d'icône peut être écrit. Partagée : le relevé et son
    contrôle doivent regarder exactement les mêmes sources. */
function fichiersSources() {
  const fichiers = [
    'index.html', 'entreprises/index.html', 'mentions-legales/index.html',
    'formations/_template/fiche.html', 'script.js', 'site-common.js', 'landing.js',
    'scripts/build-fiches.js',
    /* Le tableau de bord utilise ses propres icônes (dashboard, settings, upload,
       public…). Sans ces deux fichiers, elles étaient absentes du sous-ensemble
       et s'affichaient en toutes lettres : « UPLOAD » au lieu du pictogramme. */
    'admin/index.html', 'admin/admin.js',
    /* Le balisage partagé des fiches et les données du site nomment eux aussi
       des icônes, en français (`icone:`) pour les modules du programme. */
    'fiche-blocs.js', 'formations-data.js'
  ];
  for (const dossier of fs.readdirSync('formations')) {
    const page = path.join('formations', dossier, 'index.html');
    if (fs.existsSync(page)) fichiers.push(page);
  }
  return fichiers;
}

function collectIcons() {
  const fichiers = fichiersSources();
  const noms = new Set();
  /* Toutes les façons dont un nom d'icône entre dans une page. Il en manquait
     une : `vide('inbox', …)`, l'aide du tableau de bord qui construit un état
     vide. Son icône n'apparaissait donc dans aucun fichier sous une forme
     reconnue, et le mot « inbox » s'affichait en toutes lettres à la place du
     pictogramme, sur l'écran d'accueil de l'administration. */
  const MOTIFS = [
    // <span class="material-symbols-outlined">nom</span>
    /material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*</g,
    // textContent = 'nom', icon: 'nom', icone: 'nom' (clef française des modules)
    /(?:textContent|icon|icone)\s*[:=]\s*['"]([a-z][a-z0-9_]{2,})['"]/g,
    // vide('nom', 'message') : l'icône est le premier argument
    /\bvide\(\s*['"]([a-z][a-z0-9_]{2,})['"]/g,
    /* Tableaux [icône, libellé] : la forme des métadonnées d'une carte et des
       informations d'une fiche — `items.push(['view_module', '4 modules'])`.
       `view_module` n'apparaissait nulle part ailleurs, et s'affichait en
       toutes lettres sur la carte de Canva Pro.
       Ce motif attrape aussi quelques premiers éléments qui ne sont pas des
       icônes — « nom », « blue ». Sans conséquence : Google ignore
       silencieusement un nom qu'il ne connaît pas, vérifié. */
    /\[\s*['"]([a-z][a-z0-9_]{2,})['"]\s*,/g
  ];

  /* Tables qui associent une icône à autre chose que le mot « icon ».
   *
   * `ICONES_DOMAINE` de landing.js prend le NOM DU DOMAINE pour clé :
   *     'Design & Contenu': 'palette',
   *     'Intelligence artificielle': 'smart_toy'
   * Aucun motif ci-dessus ne les voyait, et ces deux icônes manquaient au
   * sous-ensemble. Sur l'accueil, les cartes « Design & Contenu » et
   * « Intelligence artificielle » affichaient donc PALETTE et SMART_TOY en
   * toutes lettres, tandis que leurs voisines montraient leur pictogramme —
   * celles-là se trouvant nommées ailleurs dans une page.
   *
   * On relève donc toutes les valeurs des déclarations dont le nom annonce
   * qu'elles portent des icônes. Le nom de la table fait foi : chercher
   * n'importe quelle chaîne ressemblant à un nom d'icône ramasserait la moitié
   * du dépôt. */
  const TABLES_ICONES = /\b(?:const|let|var)\s+\w*ICONES?\w*\s*=\s*\{([\s\S]*?)\}/g;
  for (const fichier of fichiers) {
    if (!fs.existsSync(fichier)) continue;
    const contenu = fs.readFileSync(fichier, 'utf8');
    for (const re of MOTIFS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(contenu))) noms.add(m[1]);
    }

    TABLES_ICONES.lastIndex = 0;
    let table;
    while ((table = TABLES_ICONES.exec(contenu))) {
      const valeurs = /:\s*['"]([a-z][a-z0-9_]{2,})['"]/g;
      let v;
      while ((v = valeurs.exec(table[1]))) noms.add(v[1]);
    }
  }
  // Icônes basculées en JS (menu ouvert/fermé, flèches d'accordéon)
  ['menu', 'close', 'expand_more', 'arrow_forward', 'arrow_back'].forEach(n => noms.add(n));
  return [...noms].sort();
}

const ICONES = collectIcons();
const ICONS = ICONES.join(',');
console.log(`  ${ICONES.length} icônes relevées dans les sources`);

/**
 * Signale les noms d'icônes ÉCRITS quelque part mais non relevés.
 *
 * Quatre fois déjà, une nouvelle façon d'écrire un nom d'icône a échappé aux
 * motifs ci-dessus, et le mot s'est affiché en toutes lettres sur le site :
 * « INBOX » dans l'administration, « PALETTE » et « SMART_TOY » sur l'accueil,
 * « VIEW_MODULE » sur une carte. Chaque fois, un motif de plus — et l'attente
 * du suivant.
 *
 * Ce contrôle prend le problème par l'autre bout : il compare TOUS les mots
 * écrits en littéral à la liste officielle des 6 000 icônes, et nomme ceux qui
 * y figurent sans avoir été relevés.
 *
 * Il AVERTIT, il ne bloque pas. Beaucoup de mots ordinaires sont aussi des noms
 * d'icônes — « title », « password », « function », « transform » — et en faire
 * une erreur ferait échouer la construction pour rien, trois fois par semaine.
 * La liste ci-dessous écarte ceux qu'on a déjà reconnus comme tels.
 */
const MOTS_ORDINAIRES = new Set([
  'title', 'eyebrow', 'portrait', 'input', 'password', 'circle', 'navigation',
  'step', 'source', 'email', 'conditions', 'spoke', 'draft', 'target',
  'smartphone', 'start', 'mobile', 'script', 'height', 'class', 'cable',
  'select', 'transform', 'resize', 'function', 'vignette', 'category', 'image',
  'code', 'mode', 'label', 'place', 'phone'
]);

async function signalerIconesOubliees(fichiers) {
  let officiels;
  try {
    const t = await fetch('https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols')
      .then(r => r.text());
    officiels = new Set((JSON.parse(t.replace(/^\)\]\}'\s*/, '')).icons || []).map(i => i.name));
  } catch (e) {
    console.log('  (liste officielle des icônes injoignable, contrôle passé : ' + e.message + ')');
    return;
  }

  const connus = new Set(ICONES);
  const suspects = new Map();
  for (const f of fichiers) {
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"]([a-z][a-z0-9_]{2,})['"]/g)) {
      if (officiels.has(m[1]) && !connus.has(m[1]) && !MOTS_ORDINAIRES.has(m[1])
        && !suspects.has(m[1])) suspects.set(m[1], f);
    }
  }
  if (!suspects.size) return;
  console.log('  ⚠ noms d’icônes écrits mais NON relevés — ils s’afficheraient en toutes lettres :');
  for (const [nom, f] of suspects) console.log(`      ${nom.padEnd(24)} ${f}`);
  console.log('    Ajoutez un motif dans collectIcons, ou le mot à MOTS_ORDINAIRES si ce n’est pas une icône.');
}

const SOURCES = [
  {
    key: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300..800&display=swap',
    subsetFilter: true
  },
  {
    key: 'inter',
    label: 'Inter',
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300..800&display=swap',
    subsetFilter: true
  },
  {
    key: 'material-symbols-outlined',
    label: 'Material Symbols Outlined',
    url: `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=${ICONS}&display=block`,
    subsetFilter: false
  }
];

/** Découpe la CSS Google en blocs { subset, block }. */
function parseFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let m;
  while ((m = re.exec(css))) faces.push({ subset: m[1], block: m[2] });
  if (!faces.length) {
    const re2 = /@font-face\s*\{[^}]*\}/g;
    let n;
    while ((n = re2.exec(css))) faces.push({ subset: 'all', block: n[0] });
  }
  return faces;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = [
    '/* =========================================',
    '   POLICES AUTO-HÉBERGÉES',
    '   Générées depuis Google Fonts (voir scripts/fetch-fonts.js).',
    '   Material Symbols est réduit aux icônes réellement utilisées.',
    '   ========================================= */',
    ''
  ];
  let total = 0;
  /** Empreinte du contenu de chaque fichier, pour versionner son adresse. */
  const empreintes = {};

  for (const source of SOURCES) {
    const css = await fetch(source.url, { headers: { 'User-Agent': UA } }).then(r => {
      if (!r.ok) throw new Error(`${source.label}: HTTP ${r.status}`);
      return r.text();
    });

    const faces = parseFaces(css).filter(f => !source.subsetFilter || KEEP_SUBSETS.includes(f.subset));
    if (!faces.length) throw new Error(`${source.label}: aucun bloc @font-face retenu`);

    out.push(`/* ---------- ${source.label} ---------- */`);

    for (const face of faces) {
      // L'URL d'un sous-ensemble Material Symbols n'a pas d'extension : on se fie au format déclaré
      const urlMatch = face.block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\(['"]woff2['"]\)/);
      if (!urlMatch) throw new Error(`${source.label}/${face.subset}: pas de woff2`);

      const fileName = faces.length > 1 && source.subsetFilter
        ? `${source.key}-${face.subset}.woff2`
        : `${source.key}.woff2`;
      const buffer = Buffer.from(await fetch(urlMatch[1], { headers: { 'User-Agent': UA } }).then(r => r.arrayBuffer()));
      fs.writeFileSync(path.join(OUT_DIR, fileName), buffer);
      total += buffer.length;
      console.log(`  ${fileName.padEnd(38)} ${(buffer.length / 1024).toFixed(1)} Ko`);

      /* L'ADRESSE PORTE UNE EMPREINTE DU CONTENU.
       *
       * Le fichier gardait la même adresse d'une version à l'autre. Quand le
       * sous-ensemble d'icônes a gagné `palette` et `smart_toy`, le serveur
       * servait bien la nouvelle police — mesuré — mais les navigateurs qui
       * avaient déjà l'ancienne continuaient de l'utiliser, et deux cartes de
       * l'accueil affichaient encore PALETTE et SMART_TOY en toutes lettres.
       *
       * Huit caractères suffisent à distinguer deux versions, et l'adresse
       * change alors d'elle-même : aucun visiteur ne reste sur l'ancienne. */
      const empreinte = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 8);
      empreintes[fileName] = empreinte;
      out.push(face.block.replace(urlMatch[1], `/assets/fonts/${fileName}?v=${empreinte}`).trim(), '');
    }

    // La classe de base des icônes était fournie par la CSS du CDN : on la conserve
    const baseClass = css.match(/\.material-symbols-outlined\s*\{[^}]*\}/);
    if (baseClass) out.push(baseClass[0].trim(), '');
  }

  fs.writeFileSync(path.join(process.cwd(), 'fonts.css'), out.join('\n') + '\n');

  /* Les liens de préchargement portent la MÊME empreinte que la feuille.
     Sans cela ils demanderaient l'adresse nue pendant que la feuille en
     demande une autre : deux téléchargements du même fichier, et un
     préchargement qui ne précharge rien. */
  const PAGES = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html',
    'admin/index.html', 'formations/_template/fiche.html'];
  let pagesTouchees = 0;
  for (const page of PAGES) {
    if (!fs.existsSync(page)) continue;
    const avant = fs.readFileSync(page, 'utf8');
    const apres = avant.replace(
      /(href="\/assets\/fonts\/([a-z0-9-]+\.woff2))(\?v=[a-f0-9]+)?"/g,
      (tout, debut, fichier) => empreintes[fichier] ? `${debut}?v=${empreintes[fichier]}"` : tout);
    if (apres !== avant) { fs.writeFileSync(page, apres); pagesTouchees++; }
  }
  if (pagesTouchees) {
    console.log(`  ${pagesTouchees} page(s) : préchargements réalignés`);
    console.log('  ⚠ relancez « npm run build:fiches » : le gabarit a changé');
  }

  await signalerIconesOubliees(fichiersSources());
  console.log(`Total : ${(total / 1024).toFixed(1)} Ko`);
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });

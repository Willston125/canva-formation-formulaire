/* Ce que Vercel publie, et ce qui reste dans le dépôt.
 *
 * LE DÉFAUT, relevé par l'audit du 2 octobre 2026. `.vercelignore` écartait les
 * sources (scripts, gabarit, affiches de William), mais rien d'autre. Résultat :
 * `/docs/SCRIPT-GOOGLE.md`, `/docs/DEPANNAGE.md`, `/.claude/launch.json`,
 * `/will.jpg` ou `/ChatGPT Image….png` répondaient 200 sur www.impactali.site.
 * La documentation explique où vit le mot de passe, ce qui n'est pas protégé et
 * comment parler à l'API. Les photos de travail n'avaient rien à faire en ligne :
 * douze mégaoctets d'images qu'aucune page n'affiche.
 *
 * LA RÈGLE. Le site publie ses pages, ses styles, ses scripts et `assets/`. Le
 * reste est écarté par `.vercelignore`, et rien de ce qu'une page cite ne doit
 * l'être : sinon la page casse en production, sans que rien ne le montre en local.
 *
 * CETTE ÉPREUVE LIT `.vercelignore` COMME VERCEL, pour les motifs qu'il emploie :
 * un nom seul vaut à toute profondeur, un chemin qui contient « / » part de la
 * racine, « * » remplace des caractères d'un même nom. Un motif qu'elle ne sait
 * pas lire la fait échouer, plutôt que de deviner. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 0. Les motifs de .vercelignore ----------------------------------------

const motifs = fs.readFileSync(path.join(RACINE, '.vercelignore'), 'utf8')
  .split(/\r?\n/)
  .map(l => l.replace(/\s+$/, ''))   // comme Git : les espaces de fin ne comptent pas
  .filter(l => l && !l.startsWith('#'));

verifier('chaque motif est lisible par cette épreuve',
  motifs.filter(m => /[?[\]!\\]/.test(m) || m.startsWith('/') || m.endsWith('/')
    || (m.includes('/') && m.includes('*'))), []);

const versRegex = nom => new RegExp('^' + nom.split('*')
  .map(s => s.replace(/[.+^${}()|]/g, '\\$&')).join('[^/]*') + '$');

/** `chemin` est relatif à la racine, séparé par des « / ». */
function exclu(chemin) {
  const noms = chemin.split('/');
  return motifs.some(m => m.includes('/')
    ? chemin === m || chemin.startsWith(m + '/')
    : noms.some(n => versRegex(m).test(n)));
}

/** Tous les fichiers sous `dossier`, hors node_modules et .git. */
function fichiersSous(dossier) {
  const liste = [];
  (function parcourir(rel) {
    const absolu = path.join(RACINE, rel);
    if (!fs.existsSync(absolu)) return;
    for (const e of fs.readdirSync(absolu, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) parcourir(r); else liste.push(r);
    }
  })(dossier);
  return liste;
}

// --- 1. Ce qui ne part jamais ----------------------------------------------

/* LE CŒUR DE L'AFFAIRE. Chaque fichier réellement présent dans ces dossiers est
   vérifié, pas seulement le nom du dossier : un motif mal écrit laisserait
   passer un fichier sans que le contrôle du dossier le voie. */
const internes = fichiersSous('docs').concat(fichiersSous('.claude'));
verifier('la documentation et les réglages d’outils existent (sinon rien n’est éprouvé)',
  internes.length > 3, true);
verifier('aucun fichier de docs/ ni de .claude/ n’est publié',
  internes.filter(f => !exclu(f)), []);

verifier('aucun fichier Markdown n’est publié, où qu’il soit',
  fichiersSous('').filter(f => /\.md$/i.test(f) && !exclu(f)), []);

[
  'formations/_template/fiche.html',
  'module de william/module community manager.png',
  'affiche format A4/ia.jpg',
  'assets/images/formation canva 01.png',
  // La base : son schéma, et ce que l'import génère (SQL, CSV d'inscriptions)
  'supabase/migrations/20261002120000_schema.sql',
  'exports/catalogue.sql',
  'exports/inscriptions.csv'
].forEach(f => verifier('reste dans le dépôt : ' + f, exclu(f), true));

// --- 2. Contre-contrôle : le site, lui, part bien ---------------------------

/* Sans lui, un `*` glissé dans .vercelignore satisferait tout ce qui précède…
   en vidant le site. */
const pages = ['index.html', '404.html', 'entreprises/index.html', 'mentions-legales/index.html',
  'inscription/index.html', 'admin/index.html']
  .concat(fs.readdirSync(path.join(RACINE, 'formations'))
    .filter(d => fs.existsSync(path.join(RACINE, 'formations', d, 'index.html')))
    .map(d => 'formations/' + d + '/index.html'));
const indispensables = pages.concat([
  'style.css', 'tailwind.css', 'fonts.css', 'site-common.js', 'landing.js', 'script.js',
  'fiche-blocs.js', 'formations-data.js', 'admin/admin.js', 'admin/admin.css',
  'assets/brand/impactali-logo.webp', 'assets/images/partage-impactali.jpg',
  /* Le code partagé de l'API : écarté, il manquerait aux fonctions Vercel, qui
     ne reçoivent que ce qui est déployé. */
  'api/index.js', 'api/quotidien.js', 'api/_lib/catalogue.js', 'api/_lib/champs.js', 'api/_lib/base.js',
  'api/_lib/inscription.js', 'api/_lib/prix.js', 'api/_lib/courriel.js', 'api/_lib/admin.js', 'api/_lib/supabase-ca-2021.crt',
  'api/_lib/ecritures.js', 'api/_lib/calendrier.js', 'api/_lib/transaction.js', 'api/_lib/photos.js',
  'api/_lib/journal.js'
]);
verifier('les fiches générées sont bien comptées', pages.length >= 8, true);
verifier('aucun fichier du site n’est écarté', indispensables.filter(exclu), []);

// --- 3. Rien de ce qu'une page cite n'est écarté ----------------------------

/** Ramène une référence à un chemin de fichier du dépôt, ou null si elle sort du site. */
function resoudre(ref, depuis) {
  let u = ref.trim();
  if (/^https:\/\/www\.impactali\.site/i.test(u)) u = u.replace(/^https:\/\/www\.impactali\.site/i, '') || '/';
  else if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return null; // autre site, mailto:, data:…
  u = u.split('#')[0].split('?')[0];
  if (!u) return null;
  /* /_vercel/… est servi par Vercel lui-même (Web Analytics), jamais par le
     dépôt : il n'a pas à y exister. */
  if (/^\/_vercel\//.test(u)) return null;
  try { u = decodeURIComponent(u); } catch (e) { /* laissée telle quelle */ }
  let chemin = u.startsWith('/') ? u.slice(1) : path.posix.join(path.posix.dirname(depuis), u);
  if (chemin === '' || chemin.endsWith('/')) chemin += 'index.html';
  return path.posix.normalize(chemin);
}

const EXTENSION = /\.(html|css|js|jpe?g|png|webp|gif|svg|ico|woff2?|pdf|mp4|webm|json)$/i;
const publies = fichiersSous('').filter(f => !exclu(f));
const citees = new Map(); // chemin → fichier qui le cite

for (const f of publies) {
  const texte = fs.readFileSync(path.join(RACINE, f), 'utf8');
  let refs = [];
  if (/\.html$/i.test(f)) {
    for (const m of texte.matchAll(/\s(?:src|href|poster|data-image-origine)="([^"]+)"/g)) refs.push(m[1]);
    for (const m of texte.matchAll(/\scontent="(https:\/\/www\.impactali\.site[^"]*)"/g)) refs.push(m[1]);
  } else if (/\.css$/i.test(f)) {
    for (const m of texte.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push(m[1]);
  } else if (/\.js$/i.test(f)) {
    /* Dans un script, seules les adresses absolues vers un fichier : une adresse
       relative dépend de la page qui charge le script, et un « /formations/ »
       seul n'est que le début d'une adresse assemblée. */
    for (const m of texte.matchAll(/['"`](\/[^'"`$\n]*)['"`]/g)) refs.push(m[1]);
  } else continue;

  for (const ref of refs) {
    const chemin = resoudre(ref, f);
    if (!chemin) continue;
    // Un script ne compte que pour un fichier NOMMÉ ; une page, aussi pour un dossier (→ index.html)
    if (/\.js$/i.test(f) && !EXTENSION.test(ref.split('#')[0].split('?')[0])) continue;
    if (!EXTENSION.test(chemin)) continue;
    if (!citees.has(chemin)) citees.set(chemin, f);
  }
}

/* Contre-contrôle : si le relevé se cassait, les deux contrôles suivants
   passeraient sur une liste vide. */
verifier('les références relevées sont assez nombreuses pour que le contrôle vaille',
  citees.size >= 30, true);
verifier('rien de ce qu’une page cite n’est écarté du déploiement',
  [...citees].filter(([c]) => exclu(c)).map(([c, f]) => c + ' (cité par ' + f + ')'), []);
verifier('tout ce qu’une page cite existe dans le dépôt',
  [...citees].filter(([c]) => !fs.existsSync(path.join(RACINE, c))).map(([c, f]) => c + ' (cité par ' + f + ')'), []);

// --- 4. Une image posée à la racine ne part pas sans qu'une page la cite -----

/* C'est là qu'arrivent les photos de travail : will.jpg, Formateur.jpg… Les
   images du site vivent dans assets/. Une nouvelle image déposée à la racine
   fait échouer cette épreuve tant qu'elle n'est ni écartée ni citée. */
const aLaRacine = fs.readdirSync(RACINE, { withFileTypes: true })
  .filter(e => e.isFile() && /\.(jpe?g|png|webp|gif|heic|pdf|mp4|mov|psd|ai)$/i.test(e.name))
  .map(e => e.name);
verifier('aucune photo de travail posée à la racine n’est publiée (à écarter dans .vercelignore, ou à ranger dans assets/)',
  aLaRacine.filter(n => !exclu(n) && !citees.has(n)), []);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

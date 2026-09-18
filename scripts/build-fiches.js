/* Génère les fiches statiques depuis la fiche de référence et formations-data.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'formations', '_template', 'fiche.html');
const SITE_URL = 'https://canva-formation-formulaire.vercel.app';
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'formations-data.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fiche-blocs.js'), 'utf8'), sandbox);
/* Le balisage du programme et de la FAQ vit dans fiche-blocs.js, partage avec
   le site : ecrire le meme HTML ici l'aurait fait diverger a la premiere retouche. */
const BLOCS = sandbox.window.FicheBlocs;
const FORMATIONS = sandbox.window.FORMATIONS || [];
const PAYS = sandbox.window.PAYS || [];
/* Pays de référence des pages générées : le visiteur peut en changer dans le
   formulaire, et script.js réécrit alors tarif et devise. Ce qui est écrit ici
   n'est donc qu'un point de départ, celui du marché par défaut. */
const PAYS_DEFAUT = PAYS.find(p => p.defaut && p.active !== false) || PAYS[0] || null;

/** Adresse absolue pour les aperçus de partage : une image déjà absolue (Drive) est laissée telle quelle. */
const absolue = u => (/^https?:/i.test(String(u || '')) ? String(u) : SITE_URL + String(u || ''));

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const known = value => typeof value === 'string' && value.trim() && !/^à confirmer$/i.test(value.trim());
/** Tarif du pays par défaut : `prices` s'il existe, sinon l'ancien champ `price`. */
const priceOf = f => {
  const table = f && f.prices;
  if (PAYS_DEFAUT && table && typeof table === 'object' && typeof table[PAYS_DEFAUT.code] === 'number') {
    return table[PAYS_DEFAUT.code];
  }
  return f && typeof f.price === 'number' ? f.price : null;
};
const price = value => typeof value === 'number'
  ? `${value.toLocaleString('fr-FR')} ${(PAYS_DEFAUT && PAYS_DEFAUT.devise) || ''}`.trim()
  : 'À confirmer';

function replace(html, pattern, value, label) {
  if (!pattern.test(html)) throw new Error(`Zone introuvable dans le template : ${label}`);
  return html.replace(pattern, value);
}

function setMeta(html, selector, value) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(<meta\\s+${escaped}\\s+content=")[^"]*(")`, 'i'), `$1${esc(value)}$2`);
}

function facts(f) {
  // [icône, libellé, valeur, id, ligneDeSession]
  // Les lignes « de session » sont masquées tant qu'aucune session réelle n'est sélectionnée ;
  // script.js (renderSessionDetails) les remplit et les révèle.
  const rows = [];
  if (known(f.duration)) rows.push(['timelapse', 'Durée', [f.duration, typeof f.modules === 'number' ? `${f.modules} modules` : ''].filter(Boolean).join(' · '), '', false]);
  if (known(f.level)) rows.push(['signal_cellular_alt', 'Niveau', f.level, '', false]);
  if (known(f.mode)) rows.push(['co_present', 'Mode', f.mode, '', false]);
  rows.push(['schedule', 'Horaires', '', 'fiche-schedule', true]);
  rows.push(['location_on', 'Lieu', '', 'fiche-location', true]);
  rows.push(['payments', 'Participation', price(priceOf(f)), 'fiche-price', false]);
  rows.push(['event', 'Prochaine session', 'Dates à annoncer', 'fiche-next-session', false]);
  return `<dl class="fiche-facts" aria-label="Informations clés">${rows.map(([icon, label, value, id, sessionRow]) =>
    `<div${sessionRow ? ' data-session-fact hidden' : ''}><dt><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${esc(label)}</dt><dd${id ? ` id="${id}"` : ''}>${esc(value)}</dd></div>`).join('')}</dl>`;
}

/**
 * Programme : les modules saisis pour la formation, sinon la liste de ses acquis.
 * Le balisage vient de fiche-blocs.js, partagé avec le site, pour que le
 * tableau de bord et les pages générées produisent exactement la même chose.
 */
function sectionProgramme(f) {
  const interieur = BLOCS.aUnProgramme(f)
    ? BLOCS.programmeInterieur(f)
    : BLOCS.programmeSimpleInterieur(f);
  if (!interieur) return '<!-- Programme : rien de saisi pour cette formation -->';
  return `<section class="fiche-block reveal-on-scroll" id="programme-section" aria-labelledby="programme-title">${interieur}</section>`;
}

/**
 * Prérequis génériques — vrais pour toute formation, sans inventer de modalité.
 *
 * Deux oublis vivaient ici. La liste portait la classe `fiche-prerequisites`,
 * absente de la feuille de style : cinq fiches sur six affichaient donc des
 * puces de navigateur au milieu d'une page soignée. Et le bloc ne portait aucun
 * `data-texte` : les champs « Fiche formation » du tableau de bord ne
 * changeaient qu'une seule fiche, celle du gabarit.
 */
function genericPrerequisites() {
  const ligne = (n, icone, texte) =>
    `<li data-texte-html="fiche.prerequis.${n}" data-texte-groupe="Fiche formation" `
    + `data-texte-libelle="Prérequis ${n}"><span class="material-symbols-outlined" aria-hidden="true">`
    + `${icone}</span>${texte}</li>`;

  return `<section class="fiche-block reveal-on-scroll" id="prerequis-section" aria-labelledby="prerequis-title">`
    + `<div class="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8">`
    + `<div class="flex items-center gap-3 mb-5">`
    + `<span class="material-symbols-outlined text-[#CBFD00] text-2xl" aria-hidden="true">checklist</span>`
    + `<h2 class="text-lg sm:text-xl font-extrabold text-[#FFFFFF] font-headline" id="prerequis-title" `
    + `data-texte="fiche.prerequis.titre" data-texte-groupe="Fiche formation" `
    + `data-texte-libelle="Titre « Prérequis »">Prérequis</h2></div>`
    + `<ul class="prerequis-list">`
    + ligne(1, 'school', 'Aucun niveau avancé n’est requis.')
    + ligne(2, 'laptop_mac', 'Un ordinateur portable est recommandé pour pratiquer dans de bonnes conditions.')
    + ligne(3, 'info', 'Les modalités précises seront confirmées avec la prochaine session.')
    /* Quatrième ligne : le gabarit exige d'être disponible à SES horaires, propres
       à Canva Pro. On garde l'exigence, pas l'horaire — chaque date annoncée
       porte le sien. Ainsi la clé « Prérequis 4 » existe sur les six fiches. */
    + ligne(4, 'event_available', 'Être disponible aux jours et horaires de la session choisie, indiqués sur chaque date annoncée.')
    + `</ul></div></section>`;
}

/**
 * Bloc « Votre formateur » générique — même squelette que le gabarit.
 *
 * Il portait un sur-titre « VOTRE FORMATEUR » et un titre au nom du formateur,
 * là où le gabarit met un titre « Votre Formateur » et le nom en dessous. La
 * clé `fiche.formateur.titre` aurait donc désigné deux textes différents selon
 * la fiche, ce que l'épreuve des textes refuse. On aligne la structure : le
 * titre devient le même mot, porte la même clé, et le nom passe en dessous.
 * La carte photo animée du gabarit n'est pas reprise — elle est propre à la
 * fiche Canva Pro, et son texte ne se modifie pas depuis le tableau de bord.
 */
function genericTrainer(f) {
  return `<section class="fiche-block reveal-on-scroll" id="formateur-section" aria-labelledby="formateur-title">`
    + `<div class="glass-card rounded-2xl sm:rounded-3xl shadow-xl shadow-black/20 border border-white/40 p-6 sm:p-8">`
    + `<div class="flex items-center gap-2 mb-3">`
    + `<span class="material-symbols-outlined text-[#CBFD00] text-2xl" style="font-variation-settings: 'FILL' 1;" aria-hidden="true">verified</span>`
    + `<h2 class="text-xl sm:text-2xl font-extrabold text-[#FFFFFF] font-headline" id="formateur-title" `
    + `data-texte="fiche.formateur.titre" data-texte-groupe="Fiche formation" `
    + `data-texte-libelle="Titre « Votre formateur »">Votre Formateur</h2></div>`
    + `<p class="font-bold text-[#FFFFFF] font-headline mb-3">Ali William</p>`
    + `<p class="text-sm sm:text-base text-[#E5E5E5] leading-relaxed">Expert en communication multimédia, réalisateur et stratège digital, `
    + `Ali William transmet pour la formation « ${esc(f.title)} » une méthode pratique issue de son expérience de terrain.</p>`
    + `</div></section>`;
}

/**
 * Questions fréquentes. Celles saisies pour la formation, sinon trois réponses
 * communes — vraies pour toutes les formations, et qui n'inventent ni date ni
 * modalité. Elles se remplacent depuis le tableau de bord, formation par formation.
 */
const FAQ_COMMUNE = [
  { question: 'Cette formation est-elle accessible aux débutants ?', reponse: 'Oui. Le parcours est progressif et privilégie la pratique.' },
  { question: 'Quand aura lieu la prochaine session ?', reponse: 'La date est affichée sur cette fiche dès sa confirmation.' },
  { question: 'Comment confirmer mon inscription ?', reponse: 'Votre inscription est confirmée après validation du paiement et de la preuve envoyée sur WhatsApp.' }
];

function sectionFaq(f) {
  const source = BLOCS.aUneFaq(f) ? f : Object.assign({}, f, { faq: FAQ_COMMUNE });
  return `<section class="fiche-block reveal-on-scroll" id="faq-section" aria-labelledby="faq-title">${BLOCS.faqInterieur(source)}</section>`;
}

/** Métadonnées du bandeau « Formation choisie » : uniquement des valeurs confirmées. */
function metaShort(f) {
  return [f.duration, f.mode].filter(known).join(' · ') || 'Informations pratiques à annoncer';
}

/** Libellés de la question de niveau, dérivés du sujet déclaré dans les données. */
function levelTexts(f) {
  const sujet = f.levelSubject;
  return sujet
    ? { question: `Où en es-tu avec ${sujet} ?`, never: `Je n’ai jamais utilisé ${sujet}`, sometimes: `J’utilise ${sujet} de temps en temps`, often: `J’utilise ${sujet} régulièrement` }
    : { question: 'Où en es-tu dans ce domaine ?', never: 'Je débute complètement', sometimes: 'J’ai déjà quelques bases', often: 'Je pratique régulièrement' };
}

function objectives(f) {
  const defaults = [
    { icon: 'laptop_mac', label: 'Lancer une activité freelance' },
    { icon: 'business_center', label: 'Développer mon entreprise' },
    { icon: 'work', label: 'Trouver un emploi dans ce domaine' },
    { icon: 'swap_horiz', label: 'Changer de carrière' },
    { icon: 'trending_up', label: 'Améliorer mes compétences actuelles' }
  ];
  const list = f.objectives?.length ? f.objectives : defaults;
  return list.map((item, i) => `<label class="checkbox-card${i === list.length - 1 && list.length % 2 ? ' md:col-span-2' : ''}"><input type="checkbox" name="objectifs" value="${esc(item.value || item.label)}" class="checkbox-input"><span class="material-symbols-outlined text-lg text-primary/60 group-hover:text-primary">${esc(item.icon)}</span><span class="text-sm text-white font-bold">${esc(item.label)}</span></label>`).join('');
}

function render(template, f) {
  let html = template;
  const url = `${SITE_URL}/formations/${f.slug}/`;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(f.title)} — Fiche formation &amp; inscription | IMPACTALI</title>`);
  html = setMeta(html, 'name="title"', `${f.title} — Fiche formation & inscription`);
  html = setMeta(html, 'name="description"', f.shortDescription);
  html = setMeta(html, 'property="og:url"', url);
  html = setMeta(html, 'property="og:title"', `${f.title} — Fiche formation & inscription`);
  html = setMeta(html, 'property="og:description"', f.shortDescription);
  html = setMeta(html, 'property="og:image"', absolue(f.image));
  html = setMeta(html, 'property="twitter:url"', url);
  html = setMeta(html, 'property="twitter:title"', `${f.title} — Fiche formation & inscription`);
  html = setMeta(html, 'property="twitter:description"', f.shortDescription);
  html = setMeta(html, 'property="twitter:image"', absolue(f.image));
  html = html.replace(/<link rel="canonical" href="[^"]+">/i, `<link rel="canonical" href="${url}">`);
  html = html.replaceAll('data-register-formation="canva-pro"', `data-register-formation="${esc(f.formId)}"`);
  html = html.replaceAll('/formations/canva-pro/#inscription', `/formations/${f.slug}/#inscription`);
  html = html.replace(/(<main id="inscription" data-formation-id=")[^"]+/, `$1${esc(f.formId)}`);
  html = html.replace(/(<input type="hidden" id="formation" name="formation" value=")[^"]+/, `$1${esc(f.formId)}`);
  html = replace(html, /<span aria-current="page">[\s\S]*?<\/span>/i, `<span aria-current="page">${esc(f.shortTitle || f.title)}</span>`, 'fil d’Ariane');
  html = replace(html, /<p class="eyebrow">FICHE FORMATION[\s\S]*?<\/p>/i, `<p class="eyebrow">FICHE FORMATION · ${esc(f.category.toUpperCase())}</p>`, 'catégorie');
  html = replace(html, /<h1 id="fiche-title">[\s\S]*?<\/h1>/i, `<h1 id="fiche-title">${esc(f.title)}</h1>`, 'titre');
  // `lead` autorise un HTML léger (mise en gras) ; sans lui, la description courte échappée.
  html = replace(html, /<p class="fiche-hero__lead">[\s\S]*?<\/p>/i, `<p class="fiche-hero__lead">${f.lead || esc(f.shortDescription)}</p>`, 'accroche');
  html = replace(html, /<dl class="fiche-facts"[\s\S]*?<\/dl>/i, facts(f), 'informations clés');
  html = html.replaceAll('/assets/images/formation canva (2).jpg', f.poster || f.image);
  html = html.replace(/alt="Affiche de la formation Canva Pro[^"]*"/g, `alt="${esc(`Affiche de la formation ${f.title}`)}"`);
  html = replace(html, /(<strong id="selected-training-title">)[\s\S]*?(<\/strong>)/i, `$1${esc(f.title)}$2`, 'formation sélectionnée');
  html = replace(html, /(<small id="selected-training-meta">)[\s\S]*?(<\/small>)/i, `$1${esc(metaShort(f))}$2`, 'métadonnées du formulaire');
  html = replace(html, /(<strong class="text-primary tracking-wide" id="registered-training-title">)[\s\S]*?(<\/strong>)/i, `$1${esc(f.title)}$2`, 'formation de la carte « déjà inscrit »');
  // Question de niveau : dérivée du sujet déclaré dans les données, sans cas particulier par formation.
  const niveau = levelTexts(f);
  html = replace(html, /(<label class="field-label">)Où en es-tu[^<]*(<span)/i, `$1${esc(niveau.question)} $2`, 'question de niveau');
  html = html.replace(/aria-label="Votre niveau sur Canva"/i, 'aria-label="Votre niveau"')
    .replace(/Je n['’]ai\s+jamais utilisé Canva/g, esc(niveau.never))
    .replace(/J['’]utilise\s+Canva de temps en temps/g, esc(niveau.sometimes))
    .replace(/J['’]utilise\s+Canva régulièrement/g, esc(niveau.often));
  html = replace(html, /(<div[^>]*id="objectifs-grid"[\s\S]*?>)[\s\S]*?(<\/div>\s*<span class="field-error" id="objectifs-error")/i, `$1${objectives(f)}$2`, 'objectifs');

  /* Programme et FAQ viennent des données pour TOUTES les fiches, Canva Pro
     comprise : son programme n'est plus écrit dans le gabarit, il se modifie
     depuis le tableau de bord comme celui des autres. */
  html = replace(html, /<section[^>]*id="programme-section"[\s\S]*?<\/section>/i, sectionProgramme(f), 'programme');
  html = replace(html, /<section[^>]*id="faq-section"[\s\S]*?<\/section>/i, sectionFaq(f), 'FAQ');

  if (f.slug !== 'canva-pro') {
    html = replace(html, /<section[^>]*id="prerequis-section"[\s\S]*?<\/section>/i, genericPrerequisites(), 'prérequis');
    html = replace(html, /<section[^>]*id="formateur-section"[\s\S]*?<\/section>/i, genericTrainer(f), 'formateur');
    html = html
      .replace(/Canva Pro &amp; Création de contenu/g, esc(f.title))
      .replace(/Canva Pro & Création de contenu/g, esc(f.title));
    html = html.replaceAll('/formations/canva-pro/', `/formations/${f.slug}/`);
  }
  // Bouton WhatsApp flottant : message propre à la formation, pour toutes les fiches.
  html = replace(html, /(<a href="https:\/\/wa\.me\/[^"]*") data-whatsapp-float/,
    `$1 data-whatsapp-message="${esc(`Bonjour, je suis en train de m’inscrire à la formation ${f.title} mais j’ai une question.`)}"`,
    'bouton WhatsApp flottant');
  html = replace(html, /(<img src="[^"]*" alt=")Affiche de la formation(" id="poster-validation")/,
    `$1${esc(`Affiche de la formation ${f.title}`)}$2`, 'affiche de l’étape 4');
  return html;
}

const template = fs.readFileSync(TEMPLATE, 'utf8');
for (const formation of FORMATIONS.filter(item => item.active !== false)) {
  const dir = path.join(ROOT, 'formations', formation.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(template, formation));
  console.log(`formations/${formation.slug}/index.html`);
}

/* ---------------------------------------------------------------------------
   Page d'inscription générique : /inscription/?trainingId=<formation>

   Une formation créée depuis le tableau de bord n'a pas de page générée tant
   que le site n'a pas été republié. Sans cette page, son lien tomberait sur
   l'accueil à cause de la réécriture Vercel. Ici, le titre, le tarif et la
   session sont écrits par script.js à partir de la formation demandée.
--------------------------------------------------------------------------- */
const GENERIQUE = {
  id: 'inscription-generique',
  slug: 'inscription',
  title: 'Inscription',
  shortTitle: 'Inscription',
  category: 'Inscription',
  shortDescription: 'Choisissez votre formation et complétez votre inscription en quatre étapes.',
  image: '/assets/images/formations/canva-pro.webp',
  imageAlt: 'Formations IMPACTALI',
  duration: 'À confirmer', level: 'À confirmer', mode: 'À confirmer',
  price: null, modules: null, learnings: [], objectives: null,
  formId: '', href: '/inscription/', hasDetailPage: true
};

let generique = render(template, GENERIQUE);
// La page ne porte aucune formation : celle-ci vient du paramètre d'URL
generique = generique.replace(/(<main id="inscription" data-formation-id=")[^"]*/, '$1');
generique = generique.replace(/(<input type="hidden" id="formation" name="formation" value=")[^"]*/, '$1');
// Signale à script.js qu'il doit écrire lui-même l'en-tête de la page
generique = generique.replace('<body ', '<body data-fiche-generique ');
/* Sections laissées VIDES plutôt que supprimées : une formation créée depuis le
   tableau de bord n'a pas de page générée tant que le site n'a pas été republié,
   et c'est ici que script.js écrit son programme et ses questions fréquentes. */
generique = generique.replace(/<section[^>]*id="programme-section"[\s\S]*?<\/section>/i,
  '<section class="fiche-block reveal-on-scroll" id="programme-section" aria-labelledby="programme-title" hidden></section>');
generique = generique.replace(/<section[^>]*id="faq-section"[\s\S]*?<\/section>/i,
  '<section class="fiche-block reveal-on-scroll" id="faq-section" aria-labelledby="faq-title" hidden></section>');
generique = generique.replace(/<section[^>]*id="prerequis-section"[\s\S]*?<\/section>/i, '');
generique = generique.replace(/<meta name="robots"[^>]*>/i, '');
generique = generique.replace('</head>', '    <meta name="robots" content="noindex, follow">\n</head>');

fs.mkdirSync(path.join(ROOT, 'inscription'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'inscription', 'index.html'), generique);
console.log('inscription/index.html (page générique)');

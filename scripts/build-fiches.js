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
const FORMATIONS = sandbox.window.FORMATIONS || [];

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const known = value => typeof value === 'string' && value.trim() && !/^à confirmer$/i.test(value.trim());
const price = value => typeof value === 'number' ? `${value.toLocaleString('fr-FR')} FDJ` : 'À confirmer';

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
  rows.push(['payments', 'Participation', price(f.price), 'fiche-price', false]);
  rows.push(['event', 'Prochaine session', 'Dates à annoncer', 'fiche-next-session', false]);
  return `<dl class="fiche-facts" aria-label="Informations clés">${rows.map(([icon, label, value, id, sessionRow]) =>
    `<div${sessionRow ? ' data-session-fact hidden' : ''}><dt><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${esc(label)}</dt><dd${id ? ` id="${id}"` : ''}>${esc(value)}</dd></div>`).join('')}</dl>`;
}

function genericProgramme(f) {
  const items = (f.learnings || []).map(item => `<li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>${esc(item)}</li>`).join('');
  return `<section class="fiche-block reveal-on-scroll" id="programme-section" aria-labelledby="programme-title"><div class="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"><p class="eyebrow">PROGRAMME</p><h2 id="programme-title" class="text-xl sm:text-2xl font-extrabold text-white font-headline">Ce que vous allez apprendre</h2><p class="text-[#94A3B8] mt-2">Un parcours pratique centré sur des compétences directement applicables.</p><ul class="fiche-prerequisites mt-6">${items}</ul></div></section>`;
}

function genericPrerequisites() {
  return `<section class="fiche-block reveal-on-scroll" id="prerequis-section" aria-labelledby="prerequis-title"><div class="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8"><h2 id="prerequis-title" class="text-xl font-extrabold text-white font-headline">Prérequis</h2><ul class="fiche-prerequisites"><li>Aucun niveau avancé n’est requis.</li><li>Un ordinateur portable est recommandé pour pratiquer dans de bonnes conditions.</li><li>Les modalités précises seront confirmées avec la prochaine session.</li></ul></div></section>`;
}

function genericTrainer(f) {
  return `<section class="fiche-block reveal-on-scroll" id="formateur-section" aria-labelledby="formateur-title"><div class="glass-card rounded-2xl sm:rounded-3xl shadow-xl shadow-black/20 border border-white/40 p-6 sm:p-8"><p class="eyebrow">VOTRE FORMATEUR</p><h2 id="formateur-title" class="text-xl sm:text-2xl font-extrabold text-white font-headline">Ali William</h2><p class="text-[#E5E5E5] mt-3 leading-relaxed">Expert en communication multimédia, réalisateur et stratège digital, Ali William transmet pour la formation « ${esc(f.title)} » une méthode pratique issue de son expérience de terrain.</p></div></section>`;
}

function genericFaq(f) {
  const entries = [
    ['Cette formation est-elle accessible aux débutants ?', 'Oui. Le parcours est progressif et privilégie la pratique.'],
    ['Quand aura lieu la prochaine session ?', 'La date sera affichée sur cette fiche dès sa confirmation.'],
    ['Comment confirmer mon inscription ?', 'Votre inscription est confirmée après validation du paiement et de la preuve envoyée sur WhatsApp.']
  ];
  return `<section class="fiche-block reveal-on-scroll" id="faq-section" aria-labelledby="faq-title"><div class="flex items-center gap-3 mb-5 px-2"><h2 class="text-lg sm:text-xl font-extrabold text-white font-headline" id="faq-title">Questions fréquentes sur ${esc(f.shortTitle || f.title)}</h2></div><div class="faq-list">${entries.map((entry, i) => `<div class="faq-item"><h3><button class="faq-question" type="button" aria-expanded="false" aria-controls="faq-${i}" id="faq-q-${i}">${esc(entry[0])}<span class="material-symbols-outlined" aria-hidden="true">expand_more</span></button></h3><div class="faq-answer" id="faq-${i}" role="region" aria-labelledby="faq-q-${i}" hidden><p>${esc(entry[1])}</p></div></div>`).join('')}</div></section>`;
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
  html = setMeta(html, 'property="og:image"', `${SITE_URL}${f.image}`);
  html = setMeta(html, 'property="twitter:url"', url);
  html = setMeta(html, 'property="twitter:title"', `${f.title} — Fiche formation & inscription`);
  html = setMeta(html, 'property="twitter:description"', f.shortDescription);
  html = setMeta(html, 'property="twitter:image"', `${SITE_URL}${f.image}`);
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

  if (f.slug !== 'canva-pro') {
    html = replace(html, /<section[^>]*id="programme-section"[\s\S]*?<\/section>/i, genericProgramme(f), 'programme');
    html = replace(html, /<section[^>]*id="prerequis-section"[\s\S]*?<\/section>/i, genericPrerequisites(), 'prérequis');
    html = replace(html, /<section[^>]*id="formateur-section"[\s\S]*?<\/section>/i, genericTrainer(f), 'formateur');
    html = replace(html, /<section[^>]*id="faq-section"[\s\S]*?<\/section>/i, genericFaq(f), 'FAQ');
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

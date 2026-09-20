/* Génère les fiches statiques depuis la fiche de référence et formations-data.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'formations', '_template', 'fiche.html');
const SITE_URL = 'https://www.impactali.site';
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
  /* Sans programme, la section reste EN PLACE, simplement masquée. Elle était
     remplacée par un commentaire : script.js n'avait alors plus rien à remplir,
     et le programme saisi ensuite dans le tableau de bord ne s'affichait nulle
     part — notamment sur la page d'inscription générique, la seule dont dispose
     une formation créée après la publication du site. */
  if (!interieur) {
    return '<section class="fiche-block reveal-on-scroll" id="programme-section" '
      + 'aria-labelledby="programme-title" hidden></section>';
  }
  return `<section class="fiche-block reveal-on-scroll" id="programme-section" aria-labelledby="programme-title">${interieur}</section>`;
}

/** Prérequis saisis pour cette formation, dans leur section. */
function sectionPrerequis(f) {
  return '<section class="fiche-block reveal-on-scroll" id="prerequis-section" aria-labelledby="prerequis-title">'
    + BLOCS.prerequisInterieur(f) + '</section>';
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
 * Bloc « Votre formateur », DÉRIVÉ de celui du gabarit.
 *
 * Il était autrefois réécrit à la main, en version appauvrie : pas de carte
 * photo animée, pas d'étiquettes. Les cinq autres fiches avaient donc un
 * formateur plus terne que celui de Canva Pro, sans raison — c'est le même
 * homme. On repart maintenant du bloc du gabarit et on ne remplace que ce qui
 * est propre à sa formation : le badge et la phrase de présentation. La carte
 * ne peut plus diverger, puisqu'elle n'est écrite qu'à un seul endroit.
 */
function genericTrainer(f, template) {
  const debut = template.indexOf('<section class="fiche-block reveal-on-scroll" id="formateur-section"');
  if (debut < 0) throw new Error('Bloc formateur introuvable dans le template');
  let bloc = template.slice(debut, template.indexOf('</section>', debut) + '</section>'.length);

  /* Le badge nomme la formation, comme « CANVA PRO » sur le gabarit : premier
     mot en plein, le reste en retrait. */
  const nom = String(f.shortTitle || f.title || '').toUpperCase();
  const mots = nom.split(/\s+/).filter(Boolean);
  const badge = mots.length > 1
    ? `${esc(mots[0])} <span class="text-[#050709]/60">${esc(mots.slice(1).join(' '))}</span>`
    : esc(nom);
  bloc = bloc.replace(/(<small[^>]*class="badge[^"]*"[^>]*>)[\s\S]*?(<\/small>)/,
    (_, ouvre, ferme) => ouvre + badge + ferme);

  // La présentation parle de CETTE formation
  bloc = bloc.replace(/(<p class="text-sm sm:text-base text-\[#E5E5E5\] leading-relaxed mb-5">)[\s\S]*?(<\/p>)/,
    (_, ouvre, ferme) => ouvre + 'Expert en communication multimédia, réalisateur et stratège digital, '
      + `Ali William transmet pour la formation « ${esc(f.title)} » une méthode pratique issue de `
      + 'son expérience de terrain.' + ferme);

  return bloc;
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
  /* La page d'inscription générique vit à /inscription/, pas sous /formations/.
     Dériver son adresse du slug lui donnait /formations/inscription/ — dans le
     canonical, les balises de partage et deux liens internes : quatre 404 sur
     la seule page qu'une formation créée après publication possède. */
  const chemin = f.id === 'inscription-generique' ? '/inscription/' : `/formations/${f.slug}/`;
  const url = `${SITE_URL}${chemin}`;
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
  html = html.replaceAll('/formations/canva-pro/#inscription', `${chemin}#inscription`);
  html = html.replace(/(<main id="inscription" data-formation-id=")[^"]+/, `$1${esc(f.formId)}`);
  html = html.replace(/(<input type="hidden" id="formation" name="formation" value=")[^"]+/, `$1${esc(f.formId)}`);

  html = replace(html, /<span aria-current="page">[\s\S]*?<\/span>/i, `<span aria-current="page">${esc(f.shortTitle || f.title)}</span>`, 'fil d’Ariane');
  html = replace(html, /<p class="eyebrow">FICHE FORMATION[\s\S]*?<\/p>/i, `<p class="eyebrow">FICHE FORMATION · ${esc(f.category.toUpperCase())}</p>`, 'catégorie');
  html = replace(html, /<h1 id="fiche-title">[\s\S]*?<\/h1>/i, `<h1 id="fiche-title">${esc(f.title)}</h1>`, 'titre');
  // `lead` autorise un HTML léger (mise en gras) ; sans lui, la description courte échappée.
  html = replace(html, /<p class="fiche-hero__lead">[\s\S]*?<\/p>/i, `<p class="fiche-hero__lead">${f.lead || esc(f.shortDescription)}</p>`, 'accroche');
  html = replace(html, /<dl class="fiche-facts"[\s\S]*?<\/dl>/i, facts(f), 'informations clés');
  /* Ce fichier sert à DEUX choses dans le gabarit : l'affiche de la formation,
     et la photo du formateur dans sa carte. Les remplacer toutes les deux par
     l'image de la formation mettrait son affiche sous le nom du formateur. On
     ne vise donc que les affiches, reconnaissables à leur texte de remplacement. */
  html = html.replace(/<img([^>]*?)src="\/assets\/images\/formation canva \(2\)\.jpg"([^>]*?)>/g,
    (balise, avant, apres) => /alt="Affiche/.test(avant + apres)
      ? `<img${avant}src="${esc(f.poster || f.image)}"${apres}>`
      : balise);
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

  /* Prérequis : ceux saisis pour CETTE formation l'emportent, sur toutes les
     fiches — y compris celle du gabarit. Sans rien de saisi, une fiche générée
     reçoit les prérequis communs, et le gabarit garde les siens, écrits à la
     main pour Canva Pro. */
  const ZONE_PREREQUIS = /<section[^>]*id="prerequis-section"[\s\S]*?<\/section>/i;
  if (BLOCS.aDesPrerequis(f)) {
    html = replace(html, ZONE_PREREQUIS, () => sectionPrerequis(f), 'prérequis');
  } else if (f.slug !== 'canva-pro') {
    html = replace(html, ZONE_PREREQUIS, () => genericPrerequisites(), 'prérequis');
  }

  if (f.slug !== 'canva-pro') {
    html = replace(html, /<section[^>]*id="formateur-section"[\s\S]*?<\/section>/i, () => genericTrainer(f, template), 'formateur');
    html = html
      .replace(/Canva Pro &amp; Création de contenu/g, esc(f.title))
      .replace(/Canva Pro & Création de contenu/g, esc(f.title));
    html = html.replaceAll('/formations/canva-pro/', chemin);
  }

  /* UNE CLÉ DE VISUEL PAR FICHE, pour que chaque formation puisse porter sa
     propre photo de formateur. Elles partageaient toutes `fiche.formateur.photo` :
     une photo envoyée depuis le tableau de bord s'appliquait aux six fiches à la
     fois, et rien ne permettait d'en distinguer une.

     La page générique garde la clé commune : elle ne parle d'aucune formation en
     particulier. Et c'est cette même clé que chaque fiche déclare en repli — on
     pose donc une photo valable partout, puis on n'en surcharge qu'une si besoin.

     Ce remplacement vient APRÈS `genericTrainer` : ce dernier reconstruit le bloc
     formateur depuis le gabarit, et le faisait plus haut, il remettait la clé
     commune sur les cinq fiches autres que Canva Pro. */
  if (f.formId) {
    html = html.replace(/(data-image=")fiche\.formateur\.photo(")/,
      `$1fiche.${esc(f.formId)}.formateur.photo$2`);
    html = html.replace(/(data-image-libelle=")Photo du formateur(")/,
      `$1Photo du formateur · ${esc(f.shortTitle || f.title)}$2`);
  } else {
    /* La page générique porte la clé commune, et c'est elle qui apparaît dans le
       tableau de bord à côté des six photos par formation. Un libellé nu ne
       disait pas son rôle : on l'aurait prise pour une septième fiche, alors
       qu'elle sert de repli à toutes. */
    html = html.replace(/(data-image-libelle=")Photo du formateur(")/,
      `$1Photo du formateur · toutes les fiches$2`);
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

/**
 * Les formations dont on génère la fiche.
 *
 * Par défaut celles du fichier. Avec `--depuis-le-site`, celles de la BASE :
 * une formation créée dans le tableau de bord n'existe pas dans le fichier et
 * n'aurait donc jamais sa page — seulement l'inscription générique, sans
 * programme, sans FAQ, sans prérequis. C'est ce qui permet de donner une vraie
 * fiche à chaque nouvelle formation sans toucher au code.
 */
async function formationsAGenerer() {
  if (!process.argv.includes('--depuis-le-site')) return FORMATIONS;

  const api = (sandbox.window.SITE_ENDPOINTS || {}).registration;
  if (!api) throw new Error('Adresse de l’API absente de formations-data.js');
  const reponse = await fetch(`${api}?action=catalogue`, { redirect: 'follow' });
  if (!reponse.ok) throw new Error(`L’API a répondu ${reponse.status}`);
  const donnees = await reponse.json();
  const liste = Array.isArray(donnees.formations) ? donnees.formations : [];
  /* Une base vide écraserait toutes les fiches par rien : on s'arrête plutôt
     que de publier un site sans catalogue. */
  if (!liste.length) throw new Error('La base ne renvoie aucune formation : rien n’est généré.');
  console.log(`Catalogue lu depuis la base : ${liste.length} formation(s).`);
  return liste;
}

async function principal() {
  const formations = (await formationsAGenerer()).filter(item => item.active !== false);
  for (const formation of formations) {
    if (!formation.slug) { console.log(`ignorée : une formation sans lien (${formation.title || '?'})`); continue; }
    const dir = path.join(ROOT, 'formations', formation.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(template, formation));
    console.log(`formations/${formation.slug}/index.html`);
  }

  /* Une fiche générée n'est atteignable que si la formation annonce qu'elle en
     a une. Sans cela, son lien continue de pointer vers l'inscription
     générique, et la page qu'on vient d'écrire ne sert à personne. */
  const aPrevenir = formations.filter(f => f.slug && f.hasDetailPage === false);
  if (aPrevenir.length) {
    console.log('\n⚠ Ces formations ont désormais une fiche, mais le site renvoie encore');
    console.log('  vers l’inscription générique. Cochez « Elle a sa propre page »');
    console.log('  dans le tableau de bord, une fois le site publié :');
    aPrevenir.forEach(f => console.log('   · ' + (f.title || f.slug) + '  →  /formations/' + f.slug + '/'));
  }
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
/* Gardée VIDE comme le programme et la FAQ : une formation créée depuis le
   tableau de bord y porte ses propres prérequis, écrits par script.js. */
generique = generique.replace(/<section[^>]*id="prerequis-section"[\s\S]*?<\/section>/i,
  '<section class="fiche-block reveal-on-scroll" id="prerequis-section" aria-labelledby="prerequis-title" hidden></section>');
generique = generique.replace(/<meta name="robots"[^>]*>/i, '');
generique = generique.replace('</head>', '    <meta name="robots" content="noindex, follow">\n</head>');

fs.mkdirSync(path.join(ROOT, 'inscription'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'inscription', 'index.html'), generique);
console.log('inscription/index.html (page générique)');

principal().catch(err => { console.error('\n' + err.message); process.exitCode = 1; });

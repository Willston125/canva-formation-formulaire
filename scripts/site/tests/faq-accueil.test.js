/* La FAQ de l'accueil : des réponses justes, et un accordéon qui ne cache rien.
 *
 * Relevé le 9 octobre 2026 : deux réponses ne disaient plus vrai depuis que le
 * serveur reconnaît le pays du visiteur — « choisissez votre pays à la
 * première étape du formulaire » (ce menu n'existe plus), et « le mode dépend
 * de chaque session » (il dépend du pays). Et comme toute page servie à tous,
 * la FAQ ne doit nommer aucun pays, tarif, lieu ni numéro : la ligne propre au
 * pays du visiteur est posée par le script, depuis la réponse du serveur. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const page = lire('index.html');
const landing = lire('landing.js');
const commun = lire('site-common.js');
const css = lire('style.css').replace(/\/\*[\s\S]*?\*\//g, '');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

function corpsDe(source, entete) {
  const debut = source.indexOf(entete);
  if (debut < 0) return '';
  let profondeur = 0;
  for (let j = source.indexOf(') {', debut) + 2; j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}' && !--profondeur) return source.slice(debut, j + 1);
  }
  return '';
}

const faq = (page.match(/<section class="faq"[\s\S]*?<\/section>/) || [''])[0];
const texte = faq.replace(/<[^>]+>/g, ' ');
verifier('la FAQ est retrouvée', faq.length > 1000, true);

// --- 1. Des réponses justes ----------------------------------------------------

verifier('plus de « choisissez votre pays à la première étape du formulaire »', /première étape du formulaire/.test(texte), false);
verifier('le pays mal reconnu se choisit en bas de page, comme partout', /tout en bas de la page/.test(texte), true);
verifier('aucun pays, devise, lieu ni moyen de paiement nommé',
  (texte.match(/Comores|Djibouti|Moroni|\bKMF\b|\bFDJ\b|Waafi|Mvola|Cac ?pay|D-Money|American corner|Saalam/g) || []), []);
verifier('ni aucun numéro', /\+\s?(253|269)|wa\.me\/\d/.test(faq), false);

const pays = corpsDe(landing, 'function renderFaqPays(');
verifier('la ligne du pays vient du marché reconnu par le serveur, et rien hors marché',
  /const mode = marche && marche\.code \? marche\.mode : null;/.test(pays) && /el\.hidden = !texte;/.test(pays), true);
verifier('elle suit un changement de pays', (landing.match(/renderFaqPays\(\);/g) || []).length >= 3, true);

// --- 2. L'encart « Une autre question ? » mène à l'e-mail -------------------------

/* Hors du parcours d'inscription, le site propose l'e-mail : WhatsApp n'y
   paraît qu'au moment de s'inscrire (affichage.test.js, section 20). */
const contact = (faq.match(/<a class="button button--primary faq__contact-bouton"[^>]*>/) || [''])[0];
verifier('le bouton ouvre un e-mail, avec son sujet', /href="mailto:/.test(contact) && /data-email-sujet="/.test(contact), true);
verifier('et pas WhatsApp', /data-whatsapp|wa\.me/.test(contact), false);

// --- 3. Un accordéon qui ne cache rien -------------------------------------------

const bascule = corpsDe(commun, 'function basculerCorps(');
verifier('l’ouverture glisse, mais l’état reste porté par « hidden »', /body\.hidden = !visible;/.test(bascule), true);
verifier('« animations réduites » : on bascule sans mouvement', /if \(calme \|\| typeof body\.animate !== 'function'\) \{ poser\(ouvrir\); return; \}/.test(bascule), true);
verifier('un second clic annule le mouvement en cours', /body\._mouvement\.cancel\(\)/.test(bascule), true);
verifier('fermée, la réponse n’est cachée qu’à la fin du mouvement', /mouvement\.onfinish = \(\) => \{[\s\S]*if \(!ouvrir\) poser\(false\);/.test(bascule), true);
verifier('les questions ne sont cachées avant leur entrée que sous « est-pret »',
  /\.faq\.est-pret \.faq-item \{/.test(css.replace(/,\s*/g, ', ').replace(/\.faq\.est-pret \.faq__intro, /, '')), true);

// --- 4. Chaque texte reste modifiable --------------------------------------------

const cles = [...faq.matchAll(/data-texte(?:-html)?="([^"]+)"/g)].map(m => m[1]);
verifier('huit questions et leurs réponses, modifiables depuis le tableau de bord',
  [1, 2, 3, 4, 5, 6, 7, 8].filter(n => cles.indexOf('faq.q' + n) < 0 || cles.indexOf('faq.r' + n) < 0), []);
verifier('la question porte son texte dans un élément à elle : le modifier n’efface plus l’icône',
  /<button class="faq-question"[^>]*data-texte/.test(faq), false);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

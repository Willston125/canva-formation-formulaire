/* « Vous formez une équipe ? » : la carte animée de l'accueil.
 *
 * Ce que cette épreuve garde : la carte ne cache jamais son contenu quand
 * l'animation ne peut pas jouer (« animations réduites », navigateur sans
 * observateur), les thématiques viennent du catalogue et non d'une liste
 * écrite à la main, et chaque texte reste modifiable depuis le tableau de bord. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const landing = lire('landing.js');
const page = lire('index.html');
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

const section = (page.match(/<section class="enterprise-cta"[\s\S]*?<\/section>/) || [''])[0];
verifier('la section est retrouvée', section.length > 500, true);

// --- 1. Rien ne reste caché ---------------------------------------------------

const init = corpsDe(landing, 'function initEntreprise(');
verifier('l’état « caché avant l’entrée » n’est posé que si l’animation peut jouer',
  /if \(!calme && 'IntersectionObserver' in window\) \{\s*section\.classList\.add\('est-pret'\);/.test(init), true);
verifier('sinon la carte s’affiche d’emblée', /\} else \{\s*section\.classList\.add\('est-en-vue'\);/.test(init), true);
verifier('l’entrée n’est cachée que sous « est-pret »',
  /\.enterprise-cta\.est-pret \.enterprise-cta__copy > \*/.test(css)
  && !/(^|\})\s*\.enterprise-cta__copy > \*[^{]*\{[^}]*opacity:\s*0/.test(css), true);
verifier('« animations réduites » arrête lueurs, étapes et défilement',
  /@media \(prefers-reduced-motion: reduce\) \{\s*\.enterprise-cta__lueurs span,\s*\.enterprise-cta\.est-en-vue \.enterprise-cta__numero,\s*\.enterprise-cta__piste \{ animation: none; \}/.test(css), true);
verifier('l’ancienne apparition générique n’est pas cumulée avec la nouvelle', /enterprise-cta__inner[^"]*reveal-on-scroll/.test(section), false);

// --- 2. Les thématiques viennent du catalogue -----------------------------------

const thematiques = corpsDe(landing, 'function renderThematiquesEntreprise(');
verifier('elles sont tirées des formations publiées', /FORMATIONS\.map\(f => String\(f\.shortTitle \|\| f\.title/.test(thematiques), true);
verifier('aucune n’est écrite dans la page', /<ul class="enterprise-cta__piste" id="entreprise-thematiques-piste"><\/ul>/.test(section), true);
verifier('les copies du défilement sont muettes pour les lecteurs d’écran',
  /liste\(false\) \+ liste\(true\) \+ liste\(true\) \+ liste\(true\)/.test(thematiques) && /aria-hidden="true"/.test(thematiques), true);
verifier('elles suivent le catalogue reçu', (landing.match(/renderThematiquesEntreprise\(\);/g) || []).length >= 2, true);

// --- 3. Le tableau de bord garde la main ----------------------------------------

const cles = [...section.matchAll(/data-texte(?:-html)?="([^"]+)"/g)].map(m => m[1]);
verifier('chaque texte de la carte est modifiable depuis le tableau de bord', [
  'entreprises.surtitre', 'entreprises.titre', 'entreprises.texte', 'entreprises.atout.1', 'entreprises.atout.2',
  'entreprises.atout.3', 'entreprises.parcours', 'entreprises.etape.1.titre', 'entreprises.etape.3.texte',
  'entreprises.bouton', 'entreprises.thematiques'
].filter(c => cles.indexOf(c) < 0), []);
verifier('le bouton mène au formulaire de la page Entreprises', /href="\/entreprises\/#entreprise-form"/.test(section)
  && /id="entreprise-form"/.test(lire('entreprises/index.html')), true);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

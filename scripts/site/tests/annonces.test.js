/* La fenêtre d'annonce : où elle s'ouvre, et ce qu'elle promet.
 *
 * Décisions du propriétaire (9 octobre 2026) : 5 secondes après l'arrivée, sur
 * l'accueil et les fiches formation seulement — jamais sur la page
 * d'inscription, les mentions légales ou le tableau de bord —, une publicité
 * toujours signalée comme telle, et trois compteurs : affichée, cliquée,
 * fermée. Le tri par pays, lui, est fait par le serveur
 * (scripts/supabase/tests/annonces.test.js). */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const annonces = lire('annonces.js');
const charge = f => /<script src="\/?annonces\.js"><\/script>/.test(lire(f));

// --- 1. Les pages qui l'ouvrent, et celles qui ne l'ouvrent jamais ----------

const fiches = fs.readdirSync(path.join(RACINE, 'formations'))
  .filter(d => d !== '_template' && fs.existsSync(path.join(RACINE, 'formations', d, 'index.html')))
  .map(d => `formations/${d}/index.html`);
verifier('l’accueil charge la fenêtre d’annonce', charge('index.html'), true);
verifier('chaque fiche formation aussi', fiches.filter(f => !charge(f)), []);
verifier('le gabarit des fiches aussi, pour les fiches à venir', charge('formations/_template/fiche.html'), true);
verifier('jamais la page d’inscription, ni les pages secondaires, ni le tableau de bord',
  ['inscription/index.html', 'entreprises/index.html', 'mentions-legales/index.html', '404.html', 'admin/index.html']
    .filter(charge), []);
/* La page d'inscription est faite du même gabarit : si le générateur cessait
   de retirer le script, le fichier lui-même doit encore s'y refuser. */
verifier('et le script se tait de lui-même sur la page d’inscription',
  /hasAttribute\('data-fiche-generique'\) \? null/.test(annonces), true);

// --- 2. Quand -----------------------------------------------------------------

verifier('elle s’ouvre 5 secondes après l’arrivée', /const DELAI_MS = 5000;/.test(annonces), true);
/* Le défaut relevé le 9 octobre 2026 : la page pose d'abord le catalogue gardé
   de la visite précédente. Antérieur à l'annonce, il n'en contenait aucune, et
   la fenêtre renonçait avant que la réponse du serveur n'arrive — elle ne
   s'ouvrait donc jamais sur la première page de la visite. Une liste vide doit
   faire ATTENDRE le catalogue suivant, pas renoncer. */
verifier('une liste encore vide fait attendre la réponse du serveur, au lieu de renoncer',
  /if \(!annonce\) \{ attendreLeCatalogue\(\); return; \}/.test(annonces), true);
verifier('jamais pendant une inscription commencée', /common\.inscriptionCommencee\(\)/.test(annonces), true);
verifier('une fiche n’en montre qu’une par visite', /page === 'fiche' && lire\(sessionStorage, CLE_FICHE\)/.test(annonces), true);
verifier('une fiche ne promeut pas sa propre formation', /a\.formation === formation/.test(annonces), true);
verifier('une offre expirée, restée en cache, ne s’ouvre pas', /!a\.fin \|\| a\.fin >= jour/.test(annonces), true);
verifier('l’affiche est chargée avant d’ouvrir : jamais de cadre vide', /charger\(versionPour\(annonce\)\)/.test(annonces), true);

// --- 3. Ce qu'elle montre -------------------------------------------------------

verifier('une publicité est signalée comme telle, avec son annonceur',
  /'Publicité' \+ \(annonce\.annonceur \? ' · ' \+ annonce\.annonceur : ''\)/.test(annonces), true);
verifier('et son lien vers un autre site est marqué « sponsored »', /'sponsored '/.test(annonces), true);
verifier('le lien passe par le filtre du site (jamais de « javascript: »)', /common\.lienSur\(annonce\.lien/.test(annonces), true);
verifier('les textes venus du tableau de bord sont échappés', /const e = common\.escapeHtml;/.test(annonces)
  && !/\$\{annonce\.(titre|annonceur|bouton|imageAlt)\}/.test(annonces), true);
verifier('la croix est un vrai bouton, nommé pour les lecteurs d’écran',
  /<button type="button" class="annonce__fermer" data-annonce-fermer aria-label="Fermer l’annonce">/.test(annonces), true);
verifier('Échap la ferme aussi', /event\.key === 'Escape'/.test(annonces), true);

const css = lire('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const regle = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };
verifier('la croix se touche du pouce : 44 px', /width:\s*44px/.test(regle('.annonce__fermer')) && /height:\s*44px/.test(regle('.annonce__fermer')), true);
verifier('l’affiche n’est ni rognée ni recolorée', /object-fit|filter/.test(regle('.annonce__visuel img')), false);

// --- 4. Ce qu'elle compte -------------------------------------------------------

['vue', 'clic', 'fermee'].forEach(e => verifier(`elle compte « ${e} »`,
  new RegExp(`mesurerAnnonce\\('${e}', annonce\\.id\\)`).test(annonces), true));
verifier('un clic qui mène ailleurs n’est pas aussi compté comme une fermeture',
  /common\.mesurerAnnonce\('clic', annonce\.id\);\s*\/\/[^\n]*\n\s*fermer\(false\)/.test(annonces), true);
const commun = lire('site-common.js');
verifier('le lien WhatsApp d’un partenaire n’est pas une question posée à IMPACTALI',
  /lien\.closest\('\[data-annonce\]'\)/.test(commun), true);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

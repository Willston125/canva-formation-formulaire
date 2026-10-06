/* Le site parle à sa propre API.
 *
 * Avant la bascule du 5 octobre 2026, le site annonçait la version du script
 * Google qu'il attendait, et le tableau de bord la comparait à celle servie :
 * Google continue de servir l'ANCIEN code tant qu'on n'a pas publié une
 * nouvelle version du déploiement, sans le moindre avertissement. Le code de
 * l'API part désormais avec le site, dans le même dépôt : cette mécanique n'a
 * plus de raison d'être, et l'épreuve vérifie qu'elle n'est pas revenue. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const gs = fs.readFileSync(path.join(RACINE, 'scripts', 'apps-script', 'impactali-inscriptions.gs'), 'utf8');

const site = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'formations-data.js'), 'utf8'), site);

verifier('le site n’attend plus de version de script',
  Object.keys(site.window.SITE_ENDPOINTS), ['registration']);
verifier('et le tableau de bord ne la surveille plus',
  /versionScript|Script périmé/.test(fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8')), false);

/* Depuis la bascule, le site parle à SA propre API. L'adresse du script Google
   reste à part, pour la reprise et le retour arrière : elle doit être une
   application web publiée, pas un lien de test. */
const adresse = site.window.SITE_ENDPOINTS && site.window.SITE_ENDPOINTS.registration;
verifier('le site parle à sa propre API', adresse, '/api');
const { ADRESSE_GOOGLE } = require('../../supabase/google');
verifier('l’adresse du retour arrière est un script Google publié (/exec)',
  /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ADRESSE_GOOGLE), true);
/* Audit T6 : le repli par balise <script> (JSONP) exécutait ce que servait le
   script Google. L'API étant sur le site même, il n'a plus de raison d'être. */
verifier('le site ne charge plus de script à distance (JSONP)',
  /callback=/.test(fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8')), false);

// Le mot de passe par défaut ne doit jamais partir en production
verifier('mot de passe non laissé en clair dans le dépôt',
  /var MOT_DE_PASSE_ADMIN = 'CHANGEZ-MOI-avant-de-deployer';/.test(gs), true);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

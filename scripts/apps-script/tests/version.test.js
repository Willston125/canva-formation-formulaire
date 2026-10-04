/* Le site annonce la version du script Google qu'il attend, et le tableau de
   bord la compare à celle réellement servie. Ces deux numéros doivent donc
   rester alignés dans le dépôt — sinon l'avertissement se déclencherait à tort,
   ou pire, resterait muet alors que Google sert du vieux code. */
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
const versionDuScript = (/^var VERSION = '(.+)';$/m.exec(gs) || [])[1];

const site = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'formations-data.js'), 'utf8'), site);
const attendueParLeSite = site.window.SITE_ENDPOINTS && site.window.SITE_ENDPOINTS.versionScript;

verifier('le script déclare une version', !!versionDuScript, true);
verifier('le site déclare la version attendue', !!attendueParLeSite, true);
verifier('les deux numéros correspondent', attendueParLeSite, versionDuScript);

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

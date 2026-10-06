/* Le site parle à sa propre API, et à personne d'autre.
 *
 * Avant la bascule du 5 octobre 2026, le site annonçait la version du script
 * Google qu'il attendait, et le tableau de bord la comparait à celle servie :
 * Google continuait de servir l'ANCIEN code tant qu'on n'avait pas publié une
 * nouvelle version du déploiement, sans le moindre avertissement. Le code de
 * l'API part désormais avec le site, dans le même dépôt : cette mécanique n'a
 * plus de raison d'être, et l'épreuve vérifie qu'elle n'est pas revenue — pas
 * plus que le repli par balise <script> (JSONP, audit T6), qui exécutait ce que
 * le serveur distant servait. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const site = { window: {} };
vm.runInNewContext(lire('formations-data.js'), site);

verifier('le site parle à sa propre API', site.window.SITE_ENDPOINTS.registration, '/api');
verifier('et n’attend plus de version de script', Object.keys(site.window.SITE_ENDPOINTS), ['registration']);
verifier('le tableau de bord ne la surveille plus', /versionScript|Script périmé/.test(lire('admin/admin.js')), false);
verifier('le site ne charge plus de script à distance (JSONP)', /callback=/.test(lire('site-common.js')), false);

/* Aucune page publique ne nomme plus un service de Google pour ses DONNÉES.
   (Les polices et les photos des fiches, elles, ont leurs propres épreuves.) */
const code = ['site-common.js', 'script.js', 'landing.js', 'formations-data.js', 'admin/admin.js']
  .map(lire).join('\n');
verifier('plus aucun appel vers script.google.com', /script\.google\.com/.test(code), false);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

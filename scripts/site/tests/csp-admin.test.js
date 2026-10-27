/* La politique de sécurité (CSP) du tableau de bord, et ce qu'elle exige de lui.
 *
 * Le tableau de bord garde le jeton de connexion de l'administrateur dans
 * sessionStorage, sur la même origine que le site public. Si une injection de
 * script existait un jour, ce jeton partirait avec — et le compte qui change
 * les numéros de paiement avec lui. La politique de /admin/ (vercel.json) ne
 * laisse donc s'exécuter que les scripts du site, et ne laisse la page parler
 * qu'au site et à Supabase.
 *
 * Elle a un prix : le jour où la page ou son script fait ce qu'elle interdit —
 * un gestionnaire onclick="…" glissé dans du balisage, un eval, une adresse
 * Supabase qui change —, le tableau de bord ne s'ouvre plus EN PRODUCTION, et
 * personne ne le sait avant de s'y connecter. Cette épreuve garde les deux
 * bouts : la politique est déclarée et stricte, et le code ne la viole pas. */
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

// --- 1. La politique déclarée -------------------------------------------------

const regles = JSON.parse(lire('vercel.json')).headers;
const regleAdmin = regles.find(r => /^\/admin\//.test(r.source));
verifier('une règle d’en-têtes vise /admin/', !!regleAdmin, true);
const valeur = ((regleAdmin || { headers: [] }).headers.find(h => h.key === 'Content-Security-Policy') || {}).value || '';
verifier('elle porte une politique de sécurité', valeur.length > 0, true);

const directives = {};
valeur.split(';').map(d => d.trim()).filter(Boolean).forEach(d => {
  const [nom, ...sources] = d.split(/\s+/);
  directives[nom] = sources;
});
verifier('les scripts : ceux du site, et rien d’autre (ni en ligne, ni eval)', directives['script-src'], ["'self'"]);
verifier('aucun plugin', directives['object-src'], ["'none'"]);
verifier('aucune balise <base> pour détourner les liens', directives['base-uri'], ["'none'"]);
verifier('la page ne se glisse dans aucun cadre', directives['frame-ancestors'], ["'none'"]);
verifier('un formulaire ne part que vers le site', directives['form-action'], ["'self'"]);

/* La seule adresse extérieure à qui la page parle : Supabase, pour la connexion.
   Elle se compare à celle que le serveur sert à la page (api/_lib/admin.js). */
const supabase = /SUPABASE_URL = process\.env\.SUPABASE_URL \|\| '(https:\/\/[a-z0-9]+\.supabase\.co)'/.exec(lire('api/_lib/admin.js'));
verifier('l’adresse Supabase du serveur est retrouvée', !!supabase, true);
verifier('la page peut parler au site et à CETTE adresse Supabase seulement',
  directives['connect-src'], ["'self'", supabase ? supabase[1] : '?']);
verifier('aucun joker dans les sources de scripts, de connexions ni de formulaires',
  ['script-src', 'connect-src', 'form-action'].filter(d => (directives[d] || []).some(s => /\*/.test(s) || /^https?:$/.test(s))), []);

// --- 2. Ce que la page et son script ne font pas ------------------------------

const page = lire('admin/index.html');
const scripts = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
verifier('la page n’a aucun script en ligne', scripts.filter(([, attrs, corps]) => !/\bsrc\s*=/.test(attrs) || corps.trim()).length, 0);
verifier('tous ses scripts sont ceux du site',
  scripts.filter(([, attrs]) => { const m = /\bsrc\s*=\s*"([^"]+)"/.exec(attrs); return !m || !m[1].startsWith('/'); }).length, 0);
verifier('aucun gestionnaire onclick="…" dans la page', /\son[a-z]+\s*=\s*["']/i.test(page.replace(/<script[\s\S]*?<\/script>/gi, '')), false);
verifier('aucun lien « javascript: » dans la page', /javascript:/i.test(page), false);

const code = lire('admin/admin.js');
verifier('le script n’évalue aucun texte', [/\beval\s*\(/.test(code), /new Function\s*\(/.test(code), /document\.write\s*\(/.test(code)], [false, false, false]);
verifier('ni ne glisse de gestionnaire onclick="…" dans le balisage qu’il fabrique',
  /\son(click|change|input|submit|error|load|focus|blur|key[a-z]+|mouse[a-z]+)\s*=\s*\\?["']/.test(code), false);
verifier('ni de lien « javascript: »', /["']javascript:/i.test(code), false);
verifier('ni de script chargé dynamiquement', /createElement\(\s*['"]script['"]\s*\)/.test(code), false);

/* Le formulaire de connexion part en POST : sans « method », un envoi avant que le script
   ne soit prêt (réseau lent) mettrait l'e-mail et le mot de passe dans l'adresse, donc
   dans l'historique du navigateur et peut-être les journaux. */
verifier('le formulaire de connexion ne passe jamais ses champs dans l’adresse',
  /<form[^>]*id="form-connexion"[^>]*method="post"/i.test(page), true);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

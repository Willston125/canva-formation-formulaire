/* La nouvelle API répond-elle comme le script Google ? Vérifié EN LIGNE.
 *
 *   npm run comparer                     → www.impactali.site/api
 *   npm run comparer -- --api <adresse>  → une autre adresse (déploiement d'essai)
 *
 * Interroge les deux, chronomètre, puis compare champ par champ. Seuls les
 * écarts voulus sont tolérés (voir scripts/supabase/tests/import.test.js) :
 * tarif vide absent, rangs à égalité renumérotés, `jours` et `seances` en plus.
 * Avant la bascule, c'est la preuve que le site ne verra pas la différence. */
'use strict';

const { ADRESSE_GOOGLE } = require('./google');

const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };

const sansNuls = o => (o && typeof o === 'object' && !Array.isArray(o))
  ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) : {};
const trier = v => Array.isArray(v) ? v.map(trier)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, trier(v[k])])) : v;
const pareil = (a, b) => JSON.stringify(trier(a)) === JSON.stringify(trier(b));

async function lire(adresse) {
  const debut = Date.now();
  const r = await fetch(adresse, { redirect: 'follow' });
  const texte = await r.text();
  const ms = Date.now() - debut;
  if (!r.ok) throw new Error(`${adresse} a répondu ${r.status} : ${texte.slice(0, 120)}`);
  return { json: JSON.parse(texte), ms };
}

/** Les écarts entre deux catalogues, en phrases. */
function ecarts(google, api) {
  const liste = [];
  const parId = (l, k = 'id') => Object.fromEntries((l || []).map(x => [x[k], x]));

  const fG = parId(google.formations), fA = parId(api.formations);
  for (const id of new Set([...Object.keys(fG), ...Object.keys(fA)])) {
    if (!fG[id] || !fA[id]) { liste.push(`formation ${id} : présente d'un seul côté`); continue; }
    const g = Object.assign({}, fG[id], { prices: sansNuls(fG[id].prices), ordre: null });
    const a = Object.assign({}, fA[id], { prices: sansNuls(fA[id].prices), ordre: null });
    for (const cle of new Set([...Object.keys(g), ...Object.keys(a)])) {
      if (!pareil(g[cle], a[cle])) liste.push(`formation ${id}, ${cle} : ${JSON.stringify(g[cle])} ≠ ${JSON.stringify(a[cle])}`);
    }
  }
  if (!pareil((google.formations || []).map(f => f.id), (api.formations || []).map(f => f.id))) {
    liste.push('ordre des formations différent');
  }

  const sG = parId(google.sessions), sA = parId(api.sessions);
  for (const id of new Set([...Object.keys(sG), ...Object.keys(sA)])) {
    if (!sG[id] || !sA[id]) { liste.push(`session ${id} : présente d'un seul côté`); continue; }
    const { jours, seances, ...a } = sA[id];
    for (const cle of new Set([...Object.keys(sG[id]), ...Object.keys(a)])) {
      if (!pareil(sG[id][cle], a[cle])) liste.push(`session ${id}, ${cle} : ${JSON.stringify(sG[id][cle])} ≠ ${JSON.stringify(a[cle])}`);
    }
  }

  for (const cle of ['pays', 'portfolio', 'reglages', 'textes', 'images', 'cadrages', 'places']) {
    if (!pareil(google[cle], api[cle])) liste.push(`${cle} : différent`);
  }
  return liste;
}

async function principal() {
  const adresseGoogle = ADRESSE_GOOGLE + '?action=catalogue';
  const adresseApi = (option('--api') || 'https://www.impactali.site/api') + '?action=catalogue';

  const [google, api] = await Promise.all([lire(adresseGoogle), lire(adresseApi)]);
  console.log(`Script Google : ${google.ms} ms`);
  console.log(`Nouvelle API  : ${api.ms} ms`);

  const liste = ecarts(google.json, api.json);
  console.log(liste.length
    ? `\n${liste.length} ÉCART(S) :\n` + liste.map(l => '  - ' + l).join('\n')
    : `\nIDENTIQUE : ${api.json.formations.length} formations, ${api.json.sessions.length} sessions, `
      + `${api.json.pays.length} pays, ${api.json.portfolio.length} réalisations, places comprises.`);
  process.exitCode = liste.length ? 1 : 0;
}

if (require.main === module) principal().catch(e => { console.log('Comparaison impossible : ' + e.message); process.exitCode = 1; });

module.exports = { ecarts };

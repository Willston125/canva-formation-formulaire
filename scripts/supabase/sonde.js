/* Sonde de sécurité de la base, vue de l'extérieur.
 *
 * Fait ce que ferait n'importe quel navigateur muni de la clé PUBLIQUE de
 * Supabase : lire chaque table, écrire une inscription « Payé », appeler les
 * fonctions. Tout doit être refusé — seule l'API du site parle à la base.
 * À relancer après chaque phase de la migration, et après toute nouvelle table.
 *
 *   SUPABASE_CLE_PUBLIQUE=sb_publishable_… npm run sonde
 *
 * La clé publique est faite pour être vue, mais elle n'est pas écrite ici : le
 * dépôt ne porte AUCUNE clé, et la règle reste simple à tenir. La liste des
 * tables et des fonctions est lue dans le schéma lui-même : une table ajoutée
 * est sondée sans qu'on y pense. */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJET = process.env.SUPABASE_URL || 'https://isxkyikakrssekrxudjw.supabase.co';
const CLE = process.env.SUPABASE_CLE_PUBLIQUE;
const DOSSIER = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');

if (!CLE) {
  console.log('Indiquez la clé publique : SUPABASE_CLE_PUBLIQUE=sb_publishable_… npm run sonde');
  process.exit(1);
}

const schema = fs.readdirSync(DOSSIER).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(path.join(DOSSIER, f), 'utf8')).join('\n');
const tables = [...schema.matchAll(/create table (\w+)/g)].map(m => m[1]);
const fonctions = [...schema.matchAll(/create function (\w+)/g)].map(m => m[1]);

const entetes = Object.assign({ apikey: CLE, 'Content-Type': 'application/json' },
  CLE.startsWith('ey') ? { Authorization: 'Bearer ' + CLE } : {});
const court = t => t.replace(/\s+/g, ' ').slice(0, 90);

(async () => {
  const ouvertes = [];

  for (const t of tables) {
    const r = await fetch(`${PROJET}/rest/v1/${t}?select=*&limit=1`, { headers: entetes });
    const corps = await r.text();
    console.log(`${r.ok ? 'OUVERTE' : 'fermée '}  lecture  ${t.padEnd(18)} ${r.status} ${court(corps)}`);
    if (r.ok) ouvertes.push('lecture de ' + t);
  }

  /* Une écriture : l'attaque de l'audit (S1), une inscription qui se dit payée. */
  const w = await fetch(`${PROJET}/rest/v1/inscriptions`, {
    method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, entetes),
    body: JSON.stringify({ form_id: 'sonde', nom: 'SONDE — à supprimer', statut: 'Payé' })
  });
  console.log(`${w.ok ? 'OUVERTE' : 'fermée '}  écriture inscriptions       ${w.status} ${court(await w.text())}`);
  if (w.ok) ouvertes.push('écriture dans inscriptions (une ligne « SONDE » est à supprimer)');

  for (const f of fonctions) {
    const r = await fetch(`${PROJET}/rest/v1/rpc/${f}`, { method: 'POST', headers: entetes, body: '{}' });
    const corps = await r.text();
    // 404 « introuvable » ou 401 « permission denied » : dans les deux cas, inaccessible
    const ferme = !r.ok;
    console.log(`${ferme ? 'fermée ' : 'OUVERTE'}  appel    ${f.padEnd(18)} ${r.status} ${court(corps)}`);
    if (!ferme) ouvertes.push('appel de ' + f);
  }

  console.log(ouvertes.length
    ? `\n>>> ${ouvertes.length} ACCÈS OUVERT(S) : ${ouvertes.join(' ; ')}`
    : `\n>>> Tout est fermé : ${tables.length} tables, l'écriture et ${fonctions.length} fonction(s).`);
  process.exitCode = ouvertes.length ? 1 : 0;
})().catch(e => { console.log('Sonde impossible : ' + e.message); process.exitCode = 1; });

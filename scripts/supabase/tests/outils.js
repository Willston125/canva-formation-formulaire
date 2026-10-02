/* Outils communs aux épreuves de la base.
 *
 * La base des épreuves est un VRAI Postgres, en mémoire (PGlite) : les règles du
 * schéma s'y appliquent exactement comme chez Supabase, sans Docker ni réseau. */
'use strict';

const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const DOSSIER_MIGRATIONS = path.join(RACINE, 'supabase', 'migrations');

function migrations() {
  return fs.readdirSync(DOSSIER_MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    .map(f => path.join(DOSSIER_MIGRATIONS, f));
}

/**
 * Une base neuve, montée comme un projet Supabase puis migrée.
 *
 * Supabase crée lui-même les rôles `anon` et `authenticated`, et leur DONNE
 * tous les droits sur chaque nouvelle table du schéma public. On reproduit ces
 * droits AVANT la migration : sans eux, l'épreuve « le navigateur ne lit rien »
 * passerait toute seule, sans rien prouver du schéma.
 */
async function baseNeuve() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const fichier of migrations()) await db.exec(fs.readFileSync(fichier, 'utf8'));
  return db;
}

/** Le contrôle du projet : une ligne OK / ÉCHEC par vérification, et un bilan. */
function verificateur() {
  const resultats = [];
  const verifier = (libelle, obtenu, attendu) => {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
      + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
  };
  const bilan = () => {
    resultats.forEach(l => console.log(l));
    const echecs = resultats.filter(l => l.startsWith('ÉCHEC')).length;
    console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
    /* Pas de process.exit() : sous Windows, quitter de force pendant que PGlite
       finit de se fermer fait planter Node (« UV_HANDLE_CLOSING »), et une
       épreuve réussie passait pour un échec. Le processus s'arrête seul. */
    process.exitCode = echecs ? 1 : 0;
  };
  return { verifier, bilan };
}

/** « acceptée » si la requête passe, « refusée » si la base la rejette. */
async function issue(db, texte, valeurs) {
  try { await db.query(texte, valeurs); return 'acceptée'; }
  catch (e) { return 'refusée'; }
}

module.exports = { RACINE, migrations, baseNeuve, verificateur, issue };

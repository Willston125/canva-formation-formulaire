/* Le jour de la bascule : UN fichier à coller dans Supabase.
 *
 *   npm run bascule -- --inscriptions "…/Inscriptions.csv"
 *   … --catalogue fichier.json   → catalogue lu dans un fichier plutôt qu'au script Google
 *
 * Écrit exports/bascule.sql : le catalogue de la feuille, lu à l'instant même
 * au script Google (public), et les inscriptions du CSV de l'onglet
 * Inscriptions. Le tout en UNE transaction : tout passe, ou rien. La dernière
 * ligne affiche les comptes, à comparer à la feuille.
 *
 * UNE SEULE FOIS. Le fichier commence par un garde-fou : collé APRÈS que le
 * tableau de bord a écrit dans la nouvelle base, il s'arrête sans rien toucher.
 * Il remettrait sinon le catalogue de la feuille par-dessus les modifications
 * faites depuis la bascule. Pour rattraper une inscription arrivée sur la
 * feuille pendant la bascule, `npm run import:inscriptions` se relance, lui,
 * sans risque.
 *
 * DONNÉES PERSONNELLES : le fichier ne s'écrit que dans exports/, ni versionné
 * ni publié. */
'use strict';

const fs = require('fs');
const path = require('path');
const { catalogueVersSql, lit } = require('./import-catalogue');
const { inscriptionsDepuisCsv, inscriptionsVersSql } = require('./import-inscriptions');
const { lireCatalogueGoogle } = require('./google');

const RACINE = path.resolve(__dirname, '..', '..');

/** Le corps d'un SQL généré, sans son begin/commit : il entre dans la transaction de la bascule. */
const sansTransaction = sql => sql.split('\n').filter(l => l !== 'begin;' && l !== 'commit;').join('\n');

/**
 * Le SQL de la bascule.
 * @param catalogue  le catalogue tel que le sert le script Google
 * @param inscriptions  les lignes rendues par inscriptionsDepuisCsv
 * @param quand  l'heure de préparation : toute écriture du tableau de bord après elle bloque le fichier
 */
function basculeVersSql(catalogue, inscriptions, quand) {
  const { sql: catalogueSql, avertissements } = catalogueVersSql(catalogue);
  const date = quand.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Djibouti' });
  const garde = 'Ce fichier a été préparé le ' + date + ' (heure de Djibouti). Depuis, le tableau de bord a '
    + 'écrit dans la nouvelle base : le coller remettrait la feuille Google par-dessus. Rien n’a été modifié.';
  const sql = [
    '-- BASCULE IMPACTALI : catalogue et inscriptions repris de la feuille Google.',
    '-- Préparé le ' + date + ' (heure de Djibouti) par scripts/supabase/bascule.js.',
    '-- DONNÉES PERSONNELLES : ne pas partager. À coller UNE fois dans l\'éditeur SQL de Supabase.',
    'begin;',
    '',
    '-- Garde-fou : rien ne se fait si le tableau de bord a déjà écrit depuis la préparation.',
    'do $garde$',
    'begin',
    `  if exists (select 1 from journal where quand > ${lit(quand.toISOString())}::timestamptz and action like 'admin.%') then`,
    `    raise exception ${lit(garde)};`,
    '  end if;',
    'end',
    '$garde$;',
    '',
    sansTransaction(catalogueSql),
    sansTransaction(inscriptionsVersSql(inscriptions)),
    'commit;',
    '',
    '-- À comparer à la feuille Google :',
    'select (select count(*) from formations) as formations, (select count(*) from sessions) as sessions,',
    '       (select count(*) from pays) as pays, (select count(*) from realisations) as realisations,',
    '       (select count(*) from inscriptions) as inscriptions;',
    ''
  ].join('\n');
  return { sql, avertissements };
}

async function principal() {
  const args = process.argv.slice(2);
  const option = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
  if (!option('--inscriptions')) throw new Error('Indiquez le CSV : --inscriptions "chemin/vers/Inscriptions.csv"');

  const catalogue = option('--catalogue')
    ? JSON.parse(fs.readFileSync(path.resolve(option('--catalogue')), 'utf8'))
    : await lireCatalogueGoogle();
  if (!Array.isArray(catalogue.formations) || !catalogue.formations.length) {
    throw new Error('Catalogue vide : rien n’est écrit, pour ne pas vider la base.');
  }
  const { inscriptions, avertissements: avisCsv } = inscriptionsDepuisCsv(
    fs.readFileSync(path.resolve(option('--inscriptions')), 'utf8'));

  const { sql, avertissements } = basculeVersSql(catalogue, inscriptions, new Date());
  const vers = path.join(RACINE, 'exports', 'bascule.sql');
  fs.mkdirSync(path.dirname(vers), { recursive: true });
  fs.writeFileSync(vers, sql);

  console.log('Fichier prêt : exports/bascule.sql');
  console.log(`${catalogue.formations.length} formations, ${(catalogue.sessions || []).length} sessions, `
    + `${(catalogue.pays || []).length} pays, ${(catalogue.portfolio || []).length} réalisations, `
    + `${inscriptions.length} inscription(s).`);
  const tous = avertissements.concat(avisCsv);
  if (tous.length) {
    console.log('\nÀ SAVOIR (' + tous.length + ') :');
    tous.forEach(a => console.log('  - ' + a));
  }
}

if (require.main === module) {
  principal().catch(e => { console.error('Échec : ' + e.message); process.exit(1); });
}

module.exports = { basculeVersSql };

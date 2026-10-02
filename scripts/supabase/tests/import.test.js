/* Le catalogue réel passe de la feuille à la base, et en ressort identique.
 *
 * Le jeu d'essai est le catalogue public du 2 octobre 2026, tel que le site le
 * recevait du script Google. On l'importe, puis on le relit avec le code de la
 * future API (api/_lib/catalogue.js). Si la relecture diffère, le site
 * changerait d'apparence au moment de la bascule — c'est ce que cette épreuve
 * empêche.
 *
 * Écarts ATTENDUS, et seulement ceux-là :
 * - un tarif vide (« À confirmer ») n'est pas une ligne : il disparaît de
 *   `prices`, ce que le site lit de la même façon ;
 * - `placesAvailable` est recalculé depuis les inscriptions, plus recopié ;
 * - les sessions gagnent `jours` et `seances` (audit C1). */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql, joursDepuisHoraires, seancesDepuisDuree, lit } = require('../import-catalogue');
const { lireCatalogue } = require('../../../api/_lib/catalogue');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

const sansNuls = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== null));
const parId = (liste, cle = 'id') => Object.fromEntries(liste.map(x => [x[cle], x]));
/** L'ordre des clés d'un objet JSON ne compte pas pour le site ; celui des listes, si. */
const trier = v => Array.isArray(v) ? v.map(trier)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, trier(v[k])])) : v;
const pareil = (libelle, obtenu, attendu) => verifier(libelle, trier(obtenu), trier(attendu));

(async () => {
  // --------------------------------------------------- 0. Les petits outils ---

  verifier('les jours se lisent dans les horaires', joursDepuisHoraires('Lundi et mercredi · 18h – 20h'), [1, 3]);
  verifier('même au pluriel et dans le désordre', joursDepuisHoraires('Les samedis et mardis'), [2, 6]);
  verifier('les séances se lisent dans la durée', seancesDepuisDuree('15 séances · 24 heures'), 15);
  verifier('une durée sans séances ne donne rien', seancesDepuisDuree('1 Mois'), null);
  /* Le SQL n'est jamais collé brut : une apostrophe ne ferme pas la chaîne. */
  verifier('une apostrophe est doublée', lit("d'Ifere'); drop table pays; --"), "'d''Ifere''); drop table pays; --'");

  // ------------------------------------------------------ 1. L'import passe ---

  const { sql, avertissements } = catalogueVersSql(source);
  const db = await baseNeuve();
  let erreur = null;
  try { await db.exec(sql); } catch (e) { erreur = e.message; }
  verifier('le catalogue réel entre dans la base sans erreur', erreur, null);

  const compte = async t => (await db.query(`select count(*)::int as n from ${t}`)).rows[0].n;
  verifier('formations', await compte('formations'), source.formations.length);
  verifier('sessions', await compte('sessions'), source.sessions.length);
  verifier('pays', await compte('pays'), source.pays.length);
  verifier('moyens de paiement', await compte('moyens_paiement'),
    source.pays.reduce((n, p) => n + p.paymentMethods.length, 0));
  verifier('tarifs saisis (les « À confirmer » ne sont pas des lignes)', await compte('formation_tarifs'),
    source.formations.reduce((n, f) => n + Object.values(f.prices || {}).filter(v => typeof v === 'number').length, 0));
  verifier('réalisations', await compte('realisations'), source.portfolio.length);
  verifier('photos', await compte('visuels'), Object.keys(source.images).length);
  verifier('aucune inscription touchée', await compte('inscriptions'), 0);

  /* Audit C1, reproduit sur les vraies données : quatre sessions annoncent plus
     de séances que leur calendrier n'en permet. L'import ne les force pas : il
     les signale, et laisse leur nombre de séances vide. */
  const impossibles = avertissements.filter(a => /n'en permet que/.test(a)).map(a => a.split(' ')[1]).sort();
  verifier('les quatre sessions impossibles sont signalées', impossibles,
    ['canva-pro-2026-11', 'ia-appliquee-2027-01', 'identite-visuelle-2027-01', 'photo-video-2027-01']);
  /* Photo & vidéo et IA portent toutes deux le rang 3 : la feuille les
     départageait par leur position, l'import les renumérote dans l'ordre affiché. */
  verifier('les rangs à égalité sont signalés',
    avertissements.filter(a => /rangs à égalité/.test(a)).map(a => a.split(' :')[0]), ['formations']);
  verifier('et rien d’autre n’est signalé', avertissements.length, 5);
  const md = (await db.query(`select jours, seances from sessions where id = 'marketing-digital-2026-11'`)).rows[0];
  verifier('la session cohérente garde ses jours et ses séances', [md.jours, md.seances], [[3, 6], 12]);

  // ------------------------------------------ 2. Il en ressort identique ---

  const relu = await lireCatalogue(db);

  const formationsSource = parId(source.formations);
  for (const f of relu.formations) {
    const attendu = Object.assign({}, formationsSource[f.id], { prices: sansNuls(formationsSource[f.id].prices), ordre: null });
    pareil('formation ' + f.slug + ' identique', Object.assign({}, f, { prices: sansNuls(f.prices), ordre: null }), attendu);
  }
  /* Ce qui compte à l'écran : l'ordre des cartes, pas la valeur des rangs. */
  verifier('formations dans le même ordre qu’aujourd’hui', relu.formations.map(f => f.id), source.formations.map(f => f.id));
  verifier('et leurs rangs ne sont plus à égalité', relu.formations.map(f => f.ordre), [0, 1, 2, 3, 4]);

  const sessionsSource = parId(source.sessions);
  for (const s of relu.sessions) {
    const { jours, seances, placesAvailable, ...reste } = s;
    const { placesAvailable: _p, ...attendu } = sessionsSource[s.id];
    pareil('session ' + s.id + ' identique', reste, attendu);
    verifier('session ' + s.id + ' : places recalculées', placesAvailable, s.placesTotal);
  }

  pareil('pays identiques (moyens de paiement compris)', relu.pays, source.pays);
  pareil('portfolio identique', relu.portfolio, source.portfolio);
  pareil('réglages identiques', relu.reglages, source.reglages);
  pareil('textes identiques', relu.textes, source.textes);
  pareil('photos identiques', relu.images, source.images);
  pareil('cadrages identiques', relu.cadrages, source.cadrages);
  verifier('aucune place prise', relu.places, {});

  // --------------------------------- 3. Relancé, il ne crée pas de doublon ---

  await db.exec(sql);
  verifier('relancé : toujours ' + source.formations.length + ' formations', await compte('formations'), source.formations.length);
  verifier('relancé : toujours ' + source.sessions.length + ' sessions', await compte('sessions'), source.sessions.length);

  /* Et il ne touche jamais aux inscriptions. */
  await db.exec(`insert into inscriptions (form_id, nom, statut, session_id) values ('canva-pro', 'Awa', 'Confirmé', 'canva-pro-2026-11')`);
  await db.exec(sql);
  verifier('relancé : l’inscription est toujours là', await compte('inscriptions'), 1);
  const apres = await lireCatalogue(db);
  verifier('et elle occupe sa place', apres.places, { 'canva-pro-2026-11': 1 });
  verifier('les places restantes en tiennent compte',
    apres.sessions.find(s => s.id === 'canva-pro-2026-11').placesAvailable, 19);

  await db.close();   // fermée avant de sortir : sous Windows, une base ouverte fait planter la sortie
  bilan();
})().catch(e => { console.error(e); process.exit(1); });

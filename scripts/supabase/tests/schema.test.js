/* Le schéma de la base tient ses promesses.
 *
 * 1. Un navigateur, avec la clé publique de Supabase, ne lit ni n'écrit rien.
 * 2. Ce que l'audit du 2 octobre 2026 a trouvé dans la feuille devient
 *    impossible à enregistrer : statut forgé, session plus longue que son
 *    calendrier, lien qui exécute du code, cadrage qui injecte du style, deux
 *    pays par défaut…
 *
 * Chaque refus a son contre-contrôle : la même ligne, correcte, est acceptée.
 * Sans lui, une table cassée qui refuserait TOUT passerait pour une table sûre. */
'use strict';

const { baseNeuve, verificateur, issue } = require('./outils');
const { verifier, bilan } = verificateur();

(async () => {
  const db = await baseNeuve();
  const q = async (t, v) => (await db.query(t, v)).rows;

  // --------------------------------------------------- 1. LA PORTE FERMÉE ---

  const tables = (await q(`select c.relname as nom, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`));
  verifier('les quinze tables existent (photos et mesures comprises)', tables.length, 15);
  /* LE CŒUR DE L'AFFAIRE. Une table ajoutée plus tard sans RLS serait lisible
     par tout navigateur muni de la clé publique : ce contrôle la verrait. */
  verifier('la RLS est activée sur chaque table', tables.filter(t => !t.rls).map(t => t.nom), []);
  verifier('et aucune règle ne l’ouvre', (await q(`select count(*)::int as n from pg_policies where schemaname = 'public'`))[0].n, 0);

  // Une ligne dans chaque table qui en reçoit, pour que « rien lu » veuille dire quelque chose
  await db.exec(`
    insert into pays (code, nom, devise, indicatif) values ('KM', 'Comores', 'KMF', '+269');
    insert into formations (id, form_id, slug, title) values ('f1', 'canva-pro', 'canva-pro', 'Canva Pro');
    insert into inscriptions (form_id, nom, telephone) values ('canva-pro', 'Awa', '3212345');
  `);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    const lisibles = [];
    for (const { nom } of tables) {
      if (await issue(db, `select * from ${nom} limit 1`) === 'acceptée') lisibles.push(nom);
    }
    const inscriptible = await issue(db, `insert into inscriptions (form_id, nom) values ('canva-pro', 'Intrus')`);
    await db.exec('reset role');
    verifier(`le rôle « ${role} » ne lit aucune table`, lisibles, []);
    verifier(`et il n’écrit pas d’inscription`, inscriptible, 'refusée');
  }
  /* Contre-contrôle : le propriétaire, lui — la connexion de l'API — lit bien. */
  verifier('le propriétaire lit les inscriptions', (await q('select count(*)::int as n from inscriptions'))[0].n, 1);

  /* Une table créée PLUS TARD n'hérite pas des droits que Supabase donne par
     défaut : la migration les a retirés pour l'avenir aussi. */
  await db.exec('create table plus_tard (id int); insert into plus_tard values (1);');
  await db.exec('set role anon');
  const plusTard = await issue(db, 'select * from plus_tard');
  await db.exec('reset role');
  verifier('une table créée plus tard reste fermée au navigateur', plusTard, 'refusée');
  await db.exec('drop table plus_tard');

  // ------------------------------------------- 2. LES RÈGLES DE LA FEUILLE ---

  /* Audit S1 : le statut ne se choisit pas en s'inscrivant. */
  verifier('une inscription arrive « En attente »',
    (await q(`insert into inscriptions (form_id, nom) values ('canva-pro', 'Bilal') returning statut`))[0].statut, 'En attente');
  verifier('un statut inventé est refusé',
    await issue(db, `insert into inscriptions (form_id, nom, statut) values ('canva-pro', 'X', 'Payé!')`), 'refusée');
  verifier('un statut connu reste possible pour le tableau de bord',
    await issue(db, `insert into inscriptions (form_id, nom, statut) values ('canva-pro', 'X', 'Payé')`), 'acceptée');
  verifier('une inscription sans aucun nom est refusée',
    await issue(db, `insert into inscriptions (form_id, telephone) values ('canva-pro', '3212345')`), 'refusée');

  /* Audit C1 : « 12 séances, mardi et vendredi, du 6 au 13 octobre » — 3 possibles. */
  verifier('le calendrier compte bien les séances possibles',
    (await q(`select seances_possibles('2026-10-06', '2026-10-13', '{2,5}') as n`))[0].n, 3);
  const session = (id, seances, jours, fin = "'2026-10-13'") =>
    issue(db, `insert into sessions (id, form_id, start_date, end_date, jours, seances)
               values ('${id}', 'canva-pro', '2026-10-06', ${fin}, '${jours}', ${seances})`);
  verifier('une session de 12 séances en 3 jours de cours est refusée', await session('s-impossible', 12, '{2,5}'), 'refusée');
  verifier('la même, à 3 séances, est acceptée', await session('s-possible', 3, '{2,5}'), 'acceptée');
  verifier('un nombre de séances sans jours de cours est refusé', await session('s-sans-jours', 3, '{}'), 'refusée');
  verifier('un nombre de séances sans date de fin est refusé', await session('s-sans-fin', 3, '{2,5}', 'null'), 'refusée');
  verifier('un jour de semaine inexistant est refusé', await session('s-jour-8', 'null', '{2,8}'), 'refusée');
  verifier('une session qui finit avant de commencer est refusée',
    await issue(db, `insert into sessions (id, form_id, start_date, end_date) values ('s-envers', 'canva-pro', '2026-10-13', '2026-10-06')`), 'refusée');
  verifier('une session d’une formation inconnue est refusée',
    await issue(db, `insert into sessions (id, form_id, start_date) values ('s-orpheline', 'fantome', '2026-10-06')`), 'refusée');

  /* Audit T2 : le lien d'une formation ne mène qu'à une page du site. */
  const lien = href => issue(db, `update formations set href = $1 where id = 'f1'`, [href]);
  verifier('un lien « javascript: » est refusé', await lien("javascript:alert(document.cookie)//"), 'refusée');
  verifier('un lien vers un autre site est refusé', await lien('https://exemple.com/'), 'refusée');
  verifier('le lien d’une fiche est accepté', await lien('/formations/canva-pro/'), 'acceptée');

  /* Audit T4 : le cadrage d'une réalisation, deux pourcentages et rien d'autre. */
  const cadrage = pos => issue(db, `insert into realisations (id, title, image_position) values ($1, 'R', $2)`, ['r-' + Math.random(), pos]);
  verifier('un cadrage qui glisse du style est refusé', await cadrage('50% 50%; position:fixed; inset:0'), 'refusée');
  verifier('un cadrage ordinaire est accepté', await cadrage('50% 18%'), 'acceptée');

  /* Une vidéo ne vient que de YouTube. */
  verifier('une vidéo hors YouTube est refusée',
    await issue(db, `insert into realisations (id, title, video) values ('v1', 'V', 'https://exemple.com/x.mp4')`), 'refusée');

  /* Un seul pays par défaut. */
  verifier('un premier pays par défaut est accepté', await issue(db, `update pays set defaut = true where code = 'KM'`), 'acceptée');
  verifier('un second est refusé',
    await issue(db, `insert into pays (code, nom, devise, indicatif, defaut) values ('DJ', 'Djibouti', 'FDJ', '+253', true)`), 'refusée');

  /* Les tarifs : saisis, positifs, jamais pour un pays inconnu. */
  verifier('un tarif nul est refusé',
    await issue(db, `insert into formation_tarifs values ('f1', 'KM', 0)`), 'refusée');
  verifier('un tarif pour un pays inconnu est refusé',
    await issue(db, `insert into formation_tarifs values ('f1', 'XX', 15000)`), 'refusée');
  verifier('un tarif ordinaire est accepté',
    await issue(db, `insert into formation_tarifs values ('f1', 'KM', 15000)`), 'acceptée');

  /* Un paiement mobile sans numéro enverrait l'argent nulle part. */
  verifier('un paiement mobile sans numéro est refusé',
    await issue(db, `insert into moyens_paiement (pays_code, kind, label, value) values ('KM', 'mobile', 'Mvola', 'Mvola')`), 'refusée');
  verifier('le même, avec son numéro, est accepté',
    await issue(db, `insert into moyens_paiement (pays_code, kind, label, value, number) values ('KM', 'mobile', 'Mvola', 'Mvola', '4866807')`), 'acceptée');

  /* Un cadrage de photo est entier ou absent : à moitié, il décalerait la photo. */
  verifier('un cadrage à moitié rempli est refusé',
    await issue(db, `insert into visuels (cle, url, position_x) values ('accueil.hero', '/a.webp', 50)`), 'refusée');
  verifier('une photo sans cadrage est acceptée',
    await issue(db, `insert into visuels (cle, url) values ('accueil.hero', '/a.webp')`), 'acceptée');

  /* Une adresse d'image ne peut pas exécuter de code. */
  verifier('une image en « javascript: » est refusée',
    await issue(db, `update formations set image = 'javascript:alert(1)' where id = 'f1'`), 'refusée');

  await db.close();   // fermée avant de sortir : sous Windows, une base ouverte fait planter la sortie
  bilan();
})().catch(e => { console.error(e); process.exit(1); });

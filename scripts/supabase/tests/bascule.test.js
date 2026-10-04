/* Le fichier du jour de la bascule.
 *
 * La nouvelle base a vécu en mode essai : catalogue modifié, formation ajoutée,
 * inscription reçue directement, photo envoyée. Collé, le fichier doit remettre
 * le catalogue de la feuille, reprendre les inscriptions du CSV, et ne rien
 * perdre de ce qui n'appartient pas à la feuille. Recollé APRÈS la bascule, il
 * doit s'arrêter sans rien toucher. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { inscriptionsDepuisCsv } = require('../import-inscriptions');
const { basculeVersSql } = require('../bascule');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

const CSV = 'Horodatage réception,formationId,nom,prenom,telephone,statut,JSON complet\n'
  + '20/09/2026 19:24:28,marketing-digital,ALI,Bilal,3299999,Confirmé,{}\n'
  + '01/10/2026 10:00:00,canva-pro,SAID,Awa,3212345,En attente,{}\n';

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);

  // --- Ce que le mode essai a laissé dans la nouvelle base
  const avant = new Date('2026-10-10T15:00:00Z');
  await db.exec(`
    update formations set promise = 'Promesse d''essai' where id = 'formation-canva-pro';
    insert into formations (id, form_id, slug, title) values ('form-essai', 'essai', 'essai', 'Essai');
    insert into inscriptions (form_id, nom, statut) values ('canva-pro', 'DIRECTE', 'En attente');
    insert into photos (type, octets) values ('image/webp', '\\x52494646');
    insert into journal (quand, qui, action) values ('2026-10-10T14:00:00Z', 'infos@impactali.site', 'admin.formation.save');`);

  const { inscriptions } = inscriptionsDepuisCsv(CSV);
  const { sql } = basculeVersSql(source, inscriptions, avant);
  verifier('le fichier tient en une transaction', [sql.split('\nbegin;').length - 1, sql.split('\ncommit;').length - 1], [1, 1]);

  const compte = (await db.query(sql.slice(sql.lastIndexOf('select (select count(*)')))).rows[0];
  await db.exec(sql);
  const lire = async t => (await db.query(t)).rows;

  verifier('le catalogue redevient celui de la feuille',
    (await lire(`select promise from formations where id = 'formation-canva-pro'`))[0].promise,
    source.formations.find(f => f.id === 'formation-canva-pro').promise);
  verifier('ce qui n’existait qu’en essai disparaît', (await lire(`select id from formations where id = 'form-essai'`)).length, 0);
  verifier('les inscriptions de la feuille sont reprises',
    (await lire(`select nom from inscriptions where charge->>'reprise' = 'feuille-google' order by nom`)).map(r => r.nom), ['ALI', 'SAID']);
  verifier('une inscription reçue directement reste', (await lire(`select 1 from inscriptions where nom = 'DIRECTE'`)).length, 1);
  verifier('les photos restent', (await lire('select count(*)::int as n from photos'))[0].n, 1);
  verifier('les places se recomptent sur les inscriptions reprises',
    (await lire(`select count(*)::int as n from inscriptions where statut in ('Confirmé', 'Payé')`))[0].n, 1);

  // Le bilan affiché en dernière ligne dans Supabase
  const bilanFinal = (await db.query(sql.slice(sql.lastIndexOf('select (select count(*)')))).rows[0];
  verifier('la dernière ligne affiche les comptes à comparer à la feuille',
    [bilanFinal.formations, bilanFinal.sessions, bilanFinal.pays, bilanFinal.inscriptions].map(Number), [5, 5, 2, 3]);
  verifier('(et ils ont bougé : le fichier a bien agi)', Number(compte.formations), 6);

  // --- Après la bascule : le tableau de bord écrit, puis quelqu'un recolle le fichier
  await db.exec(`
    update formations set promise = 'Modifiée après la bascule' where id = 'formation-canva-pro';
    insert into journal (quand, qui, action) values ('2026-10-10T16:00:00Z', 'infos@impactali.site', 'admin.formation.save');`);
  let refus = null;
  try { await db.exec(sql); } catch (e) { refus = e.message; }
  await db.exec('rollback').catch(() => {});
  verifier('recollé après la bascule, il s’arrête', /le tableau de bord a écrit dans la nouvelle base/.test(String(refus)), true);
  verifier('sans écraser ce qui a été modifié depuis',
    (await lire(`select promise from formations where id = 'formation-canva-pro'`))[0].promise, 'Modifiée après la bascule');

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

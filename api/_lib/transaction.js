/* Une transaction, que la base soit PGlite (épreuves) ou node-postgres (en ligne).
 * Partagée par le formulaire public et par le tableau de bord. */
'use strict';

async function enTransaction(db, travail) {
  if (typeof db.transaction === 'function') return db.transaction(travail);
  const client = await db.connect();
  try {
    await client.query('begin');
    const r = await travail(client);
    await client.query('commit');
    return r;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { enTransaction };

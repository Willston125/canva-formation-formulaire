/* Le journal : qui a fait quoi depuis le tableau de bord, et quand.
 * Une ligne par écriture, écrite DANS la transaction de l'écriture : l'une ne
 * va jamais sans l'autre. */
'use strict';

async function noter(db, qui, action, cible, details) {
  await db.query('insert into journal (qui, action, cible, details) values ($1, $2, $3, $4::jsonb)',
    [qui, action, cible, JSON.stringify(details || {})]);
}

module.exports = { noter };

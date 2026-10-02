/* Le catalogue tel que le site le reçoit : la réponse de `?action=catalogue`.
 *
 * Même forme, mêmes clés que celle du script Google (lireCatalogue dans
 * scripts/apps-script/impactali-inscriptions.gs) : le site et le tableau de bord
 * la lisent sans changer une ligne. Une épreuve le vérifie en important le
 * catalogue réel puis en le relisant ici.
 *
 * `db.query(texte, valeurs)` rend `{ rows }` : c'est la forme de PGlite, la base
 * des épreuves, comme de node-postgres en production. */
'use strict';

const { FORMATION, SESSION, PAYS, MOYEN_PAIEMENT, REALISATION, colonnes, versObjet } = require('./champs');

/** Statuts qui occupent une place : ceux que le propriétaire a validés. */
const STATUTS_COMPTES = ['Confirmé', 'Payé'];

/** Inscrits par session, au statut validé. Jamais mis en cache ici. */
async function compterInscrits(db) {
  const { rows } = await db.query(
    `select session_id, count(*)::int as n from inscriptions
      where statut = any($1) and coalesce(session_id, '') <> ''
      group by session_id`, [STATUTS_COMPTES]);
  const compte = {};
  for (const r of rows) compte[r.session_id] = r.n;
  return compte;
}

/** Comme le script Google : sans ordre, en fin de liste. */
const parOrdre = (a, b) => (typeof a.ordre === 'number' ? a.ordre : 999) - (typeof b.ordre === 'number' ? b.ordre : 999);

async function lireCatalogue(db) {
  const q = async (texte, valeurs) => (await db.query(texte, valeurs)).rows;
  const [formations, tarifs, sessions, sessionPays, pays, moyens, realisations,
    reglages, textes, visuels, places] = [
    await q(`select ${colonnes(FORMATION)} from formations order by id`),
    await q('select formation_id, pays_code, montant from formation_tarifs order by pays_code'),
    await q(`select ${colonnes(SESSION)} from sessions order by start_date, id`),
    await q('select * from session_pays order by session_id, ordre, pays_code'),
    await q(`select ${colonnes(PAYS)} from pays order by code`),
    await q(`select pays_code, ${colonnes(MOYEN_PAIEMENT)} from moyens_paiement order by pays_code, ordre, id`),
    await q(`select ${colonnes(REALISATION)} from realisations order by id`),
    await q('select cle, valeur from reglages order by cle'),
    await q('select cle, valeur from textes order by cle'),
    await q('select * from visuels order by cle'),
    await compterInscrits(db)
  ];

  return {
    formations: formations.map(ligne => {
      const f = versObjet(ligne, FORMATION);
      const propres = tarifs.filter(t => t.formation_id === f.id);
      // Une cellule vide valait [] dans la feuille : on garde la même forme.
      f.prices = propres.length ? Object.fromEntries(propres.map(t => [t.pays_code, t.montant])) : [];
      return f;
    }).sort(parOrdre),

    sessions: sessions.map(ligne => {
      const s = versObjet(ligne, SESSION);
      const lignes = sessionPays.filter(p => p.session_id === s.id);
      const proposes = lignes.filter(p => p.propose).map(p => p.pays_code);
      s.pays = proposes.length ? proposes.join(',') : null;
      const parPays = {};
      for (const p of lignes) {
        const reglage = {};
        if (p.mode !== null) reglage.mode = p.mode;
        if (p.tarif !== null) reglage.tarif = p.tarif;
        if (p.lieu !== null) reglage.lieu = p.lieu;
        if (Object.keys(reglage).length) parPays[p.pays_code] = reglage;
      }
      s.parPays = Object.keys(parPays).length ? parPays : [];
      s.placesAvailable = typeof s.placesTotal === 'number'
        ? Math.max(0, s.placesTotal - (places[s.id] || 0))
        : null;
      return s;
    }),

    pays: pays.map(ligne => {
      const p = versObjet(ligne, PAYS);
      p.paymentMethods = moyens.filter(m => m.pays_code === p.code).map(m => {
        const o = {};
        for (const [cle, col] of MOYEN_PAIEMENT) if (m[col] !== null && m[col] !== undefined) o[cle] = m[col];
        return o;
      });
      return p;
    }).sort(parOrdre),

    portfolio: realisations.map(ligne => versObjet(ligne, REALISATION)).sort(parOrdre),

    reglages: Object.fromEntries(reglages.map(r => [r.cle, r.valeur])),
    textes: Object.fromEntries(textes.map(r => [r.cle, r.valeur])),
    images: Object.fromEntries(visuels.map(v => [v.cle, v.url])),
    cadrages: Object.fromEntries(visuels.filter(v => v.zoom !== null)
      .map(v => [v.cle, { x: v.position_x, y: v.position_y, zoom: v.zoom }])),

    places,
    maj: new Date().toISOString()
  };
}

module.exports = { lireCatalogue, compterInscrits, STATUTS_COMPTES };

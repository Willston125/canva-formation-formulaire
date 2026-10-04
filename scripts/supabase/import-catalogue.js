/* Reprise du catalogue : feuille Google → base Supabase.
 *
 * Lit le catalogue tel que le site le reçoit (`?action=catalogue` du script
 * Google, public), et écrit le SQL qui le range dans les tables de
 * supabase/migrations. Ce SQL se colle dans l'éditeur SQL de Supabase.
 *
 *   node scripts/supabase/import-catalogue.js                 → lit l'API en ligne
 *   node scripts/supabase/import-catalogue.js --depuis c.json → lit un fichier
 *   … --vers exports/catalogue.sql                            → où écrire (par défaut)
 *
 * Le SQL vide d'abord les tables du CATALOGUE, puis les remplit : on peut le
 * relancer sans doublon. Il ne touche jamais aux inscriptions.
 *
 * Ce qui ne passe pas les règles de la base n'est pas forcé : c'est écarté ou
 * laissé vide, et AFFICHÉ. Une session qui annonce plus de séances que le
 * calendrier n'en permet garde son texte affiché, mais son nombre de séances
 * reste vide jusqu'à correction (audit C1). */
'use strict';

const fs = require('fs');
const path = require('path');
const { FORMATION, SESSION, PAYS, MOYEN_PAIEMENT, REALISATION } = require('../../api/_lib/champs');
const { lireCatalogueGoogle } = require('./google');

const RACINE = path.resolve(__dirname, '..', '..');

// ------------------------------------------------------------ SQL sûr ----

/** Une valeur JS → un littéral SQL. Rien n'est jamais collé sans passer ici. */
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Nombre invalide : ' + v);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
const json = v => lit(JSON.stringify(v)) + '::jsonb';
const liste = nombres => `'{${nombres.join(',')}}'::smallint[]`;

function insertion(table, valeurs) {
  const cols = Object.keys(valeurs);
  return `insert into ${table} (${cols.join(', ')}) values (${cols.map(c => valeurs[c]).join(', ')});`;
}

// ------------------------------------------------- jours et séances ----

/* Les mêmes que l'API : la reprise et le tableau de bord lisent les horaires
   de la même façon (api/_lib/calendrier.js). */
const { joursDepuisHoraires, seancesDepuisDuree, seancesPossibles } = require('../../api/_lib/calendrier');

const estDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* Deux lignes au même rang : dans la feuille, c'était leur position qui les
   départageait. Une base n'a pas de position. On renumérote donc selon l'ordre
   affiché — celui de la liste reçue, déjà triée — pour que rien ne bouge à
   l'écran. Sans égalité, les rangs saisis sont gardés tels quels. */
function rangs(liste, quoi, avertir) {
  const vus = liste.map(x => (typeof x.ordre === 'number' ? x.ordre : 999));
  const egalite = vus.some((o, i) => vus.indexOf(o) !== i);
  if (!egalite) return liste;
  avertir(`${quoi} : rangs à égalité, renumérotés 0, 1, 2… dans l'ordre affiché (rien ne bouge à l'écran)`);
  return liste.map((x, i) => Object.assign({}, x, { ordre: i }));
}

// ------------------------------------------------------- le catalogue ----

/** Les colonnes d'une ligne, depuis un objet du contrat. */
function colonnesDe(objet, champs, avertir, quoi) {
  const valeurs = {};
  for (const [cle, col, type] of champs) {
    let v = objet[cle];
    if (type === 'liste') continue;                       // calculé à part
    if (type === 'json') {
      if (col === 'programme') {
        // Un programme est un objet ; une cellule vide valait [].
        if (v === null || v === undefined || (Array.isArray(v) && !v.length)) { valeurs[col] = 'null'; continue; }
        if (typeof v !== 'object' || Array.isArray(v)) { avertir(`${quoi} : programme illisible, laissé vide`); valeurs[col] = 'null'; continue; }
        valeurs[col] = json(v);
        continue;
      }
      valeurs[col] = json(Array.isArray(v) ? v : (v === null || v === undefined ? [] : v));
      continue;
    }
    if (type === 'date') {
      if (v !== null && v !== undefined && !estDate(v)) { avertir(`${quoi} : date « ${v} » illisible, laissée vide`); v = null; }
    }
    // Un booléen vide prend la valeur par défaut de la colonne (celle que lit le site).
    if ((v === null || v === undefined) && typeof objet[cle] !== 'number') {
      if (['featured', 'registration_open', 'active', 'allow_registration_without_session',
        'has_detail_page', 'defaut'].includes(col)) continue;
    }
    valeurs[col] = lit(v === undefined ? null : v);
  }
  return valeurs;
}

function catalogueVersSql(catalogue) {
  const avertissements = [];
  const avertir = m => avertissements.push(m);
  const sql = [];
  const codesPays = new Set();

  sql.push('-- Catalogue IMPACTALI repris de la feuille Google le ' + new Date().toISOString().slice(0, 10));
  sql.push('-- Généré par scripts/supabase/import-catalogue.js. Les inscriptions ne sont pas touchées.');
  sql.push('begin;');
  for (const t of ['session_pays', 'sessions', 'formation_tarifs', 'formations', 'moyens_paiement',
    'pays', 'realisations', 'reglages', 'textes', 'visuels']) sql.push(`delete from ${t};`);

  // --- Pays et moyens de paiement
  for (const p of rangs(catalogue.pays || [], 'pays', avertir)) {
    if (!/^[A-Z]{2}$/.test(String(p.code || ''))) { avertir(`pays « ${p.code} » : code illisible, écarté`); continue; }
    const valeurs = colonnesDe(p, PAYS, avertir, 'pays ' + p.code);
    if (p.whatsappNumber !== null && p.whatsappNumber !== undefined && !/^[0-9]{6,15}$/.test(String(p.whatsappNumber))) {
      avertir(`pays ${p.code} : numéro WhatsApp « ${p.whatsappNumber} » illisible, laissé vide`);
      valeurs.whatsapp_number = 'null';
    } else if (p.whatsappNumber !== null && p.whatsappNumber !== undefined) {
      valeurs.whatsapp_number = lit(String(p.whatsappNumber));
    }
    sql.push(insertion('pays', valeurs));
    codesPays.add(p.code);

    (Array.isArray(p.paymentMethods) ? p.paymentMethods : []).forEach((m, i) => {
      if (!m || !['mobile', 'cash'].includes(m.kind)) { avertir(`pays ${p.code} : moyen de paiement « ${m && m.label} » de type inconnu, écarté`); return; }
      if (m.kind === 'mobile' && !String(m.number || '').trim()) { avertir(`pays ${p.code} : « ${m.label} » sans numéro, écarté`); return; }
      const valeurs = { pays_code: lit(p.code), ordre: lit(i) };
      for (const [cle, col] of MOYEN_PAIEMENT) if (m[cle] !== undefined && m[cle] !== null) valeurs[col] = lit(String(m[cle]));
      sql.push(insertion('moyens_paiement', valeurs));
    });
  }

  // --- Formations et tarifs par pays
  const formations = rangs(catalogue.formations || [], 'formations', avertir);
  for (const f of formations) {
    const quoi = 'formation ' + (f.slug || f.id);
    const valeurs = colonnesDe(f, FORMATION, avertir, quoi);
    if (f.href && !/^\/(formations\/[a-z0-9-]+\/|inscription\/)/.test(f.href)) {
      avertir(`${quoi} : lien « ${f.href} » refusé (seules les pages du site sont permises), laissé vide`);
      valeurs.href = 'null';
    }
    sql.push(insertion('formations', valeurs));
    const prix = f.prices && typeof f.prices === 'object' && !Array.isArray(f.prices) ? f.prices : {};
    for (const [code, montant] of Object.entries(prix)) {
      if (montant === null || montant === undefined || montant === '') continue;   // « À confirmer »
      if (!codesPays.has(code)) { avertir(`${quoi} : tarif pour un pays inconnu (${code}), écarté`); continue; }
      if (typeof montant !== 'number' || !(montant > 0)) { avertir(`${quoi} : tarif ${code} « ${montant} » illisible, écarté`); continue; }
      sql.push(insertion('formation_tarifs', { formation_id: lit(f.id), pays_code: lit(code), montant: lit(montant) }));
    }
  }

  // --- Sessions et réglages par pays
  const formIds = new Set(formations.map(f => f.formId));
  for (const s of catalogue.sessions || []) {
    const quoi = 'session ' + s.id;
    if (!formIds.has(s.formId)) { avertir(`${quoi} : formation « ${s.formId} » inconnue, session écartée`); continue; }
    const valeurs = colonnesDe(s, SESSION, avertir, quoi);
    delete valeurs.seances;
    const jours = joursDepuisHoraires(s.schedule);
    const annoncees = seancesDepuisDuree(s.duration);
    const possibles = seancesPossibles(s.startDate, s.endDate, jours);
    valeurs.jours = liste(jours);
    if (annoncees !== null && possibles !== null && annoncees > possibles) {
      avertir(`${quoi} : annonce ${annoncees} séances (« ${s.duration} »), mais « ${s.schedule} » du ${s.startDate} au ${s.endDate} n'en permet que ${possibles}. Nombre de séances laissé vide : à corriger dans le tableau de bord.`);
      valeurs.seances = 'null';
    } else {
      valeurs.seances = lit(annoncees !== null && possibles !== null ? annoncees : null);
    }
    sql.push(insertion('sessions', valeurs));

    // Pays proposés (colonne « pays ») et réglages propres (colonne « parPays »)
    const coches = String(s.pays || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    const reglages = s.parPays && typeof s.parPays === 'object' && !Array.isArray(s.parPays) ? s.parPays : {};
    const codes = coches.slice();
    for (const code of Object.keys(reglages)) {
      const CODE = code.toUpperCase();
      if (codes.includes(CODE)) continue;
      if (coches.length) { avertir(`${quoi} : réglages pour ${CODE}, pays non coché, écartés`); continue; }
      codes.push(CODE);
    }
    codes.forEach((code, i) => {
      if (!codesPays.has(code)) { avertir(`${quoi} : pays inconnu (${code}), écarté`); return; }
      const r = reglages[code] || reglages[code.toLowerCase()] || {};
      const ligne = {
        session_id: lit(s.id), pays_code: lit(code), propose: lit(coches.includes(code)), ordre: lit(i),
        mode: lit(typeof r.mode === 'string' && r.mode.trim() ? r.mode.trim() : null),
        lieu: lit(typeof r.lieu === 'string' && r.lieu.trim() ? r.lieu.trim() : null),
        tarif: lit(typeof r.tarif === 'number' && r.tarif > 0 ? r.tarif : null)
      };
      if (!coches.includes(code) && ligne.mode === 'null' && ligne.lieu === 'null' && ligne.tarif === 'null') return;
      sql.push(insertion('session_pays', ligne));
    });
  }

  // --- Portfolio
  for (const r of rangs(catalogue.portfolio || [], 'réalisations', avertir)) {
    const quoi = 'réalisation ' + r.id;
    const valeurs = colonnesDe(r, REALISATION, avertir, quoi);
    if (r.imagePosition && !/^[0-9]{1,3}% [0-9]{1,3}%$/.test(r.imagePosition)) {
      avertir(`${quoi} : cadrage « ${r.imagePosition} » refusé, laissé vide`);
      valeurs.image_position = 'null';
    }
    if (r.video && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(r.video)) {
      avertir(`${quoi} : vidéo « ${r.video} » refusée (YouTube seulement), laissée vide`);
      valeurs.video = 'null';
    }
    sql.push(insertion('realisations', valeurs));
  }

  // --- Réglages, textes, visuels
  for (const [cle, valeur] of Object.entries(catalogue.reglages || {})) {
    if (valeur === null || valeur === undefined || valeur === '') continue;
    sql.push(insertion('reglages', { cle: lit(cle), valeur: json(valeur) }));
  }
  for (const [cle, valeur] of Object.entries(catalogue.textes || {})) {
    if (valeur === null || valeur === undefined || valeur === '') continue;
    sql.push(insertion('textes', { cle: lit(cle), valeur: lit(String(valeur)) }));
  }
  const cadrages = catalogue.cadrages || {};
  for (const [cle, url] of Object.entries(catalogue.images || {})) {
    if (!/^(\/[^/]|https:\/\/)/.test(String(url || ''))) { avertir(`visuel ${cle} : adresse « ${url} » refusée, écarté`); continue; }
    const c = cadrages[cle];
    const valeurs = { cle: lit(cle), url: lit(url) };
    if (c && [c.x, c.y, c.zoom].every(n => typeof n === 'number')) {
      Object.assign(valeurs, { position_x: lit(c.x), position_y: lit(c.y), zoom: lit(c.zoom) });
    }
    sql.push(insertion('visuels', valeurs));
  }
  for (const cle of Object.keys(cadrages)) {
    if (!(cle in (catalogue.images || {}))) avertir(`cadrage ${cle} sans photo : écarté`);
  }

  sql.push('commit;');
  return { sql: sql.join('\n') + '\n', avertissements };
}

// -------------------------------------------------------- en commande ----

async function principal() {
  const args = process.argv.slice(2);
  const option = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
  const vers = path.resolve(RACINE, option('--vers') || 'exports/catalogue.sql');

  let catalogue;
  if (option('--depuis')) {
    catalogue = JSON.parse(fs.readFileSync(path.resolve(option('--depuis')), 'utf8'));
  } else {
    catalogue = await lireCatalogueGoogle();
  }
  if (!Array.isArray(catalogue.formations) || !catalogue.formations.length) {
    throw new Error('Catalogue vide : rien n’est écrit, pour ne pas vider la base.');
  }

  const { sql, avertissements } = catalogueVersSql(catalogue);
  fs.mkdirSync(path.dirname(vers), { recursive: true });
  fs.writeFileSync(vers, sql);
  console.log(`SQL écrit : ${path.relative(RACINE, vers)} (${sql.split('\n').length} lignes)`);
  console.log(`${catalogue.formations.length} formations, ${(catalogue.sessions || []).length} sessions, `
    + `${(catalogue.pays || []).length} pays, ${(catalogue.portfolio || []).length} réalisations.`);
  if (avertissements.length) {
    console.log('\nÀ SAVOIR (' + avertissements.length + ') :');
    avertissements.forEach(a => console.log('  - ' + a));
  }
}

if (require.main === module) {
  principal().catch(e => { console.error('Échec : ' + e.message); process.exit(1); });
}

module.exports = { catalogueVersSql, joursDepuisHoraires, seancesDepuisDuree, seancesPossibles, lit };

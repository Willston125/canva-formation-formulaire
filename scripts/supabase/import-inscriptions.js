/* Reprise des inscriptions : export CSV de la feuille Google → base Supabase.
 *
 *   node scripts/supabase/import-inscriptions.js --depuis "…/Inscriptions.csv"
 *   … --vers exports/inscriptions.sql      → où écrire (par défaut)
 *
 * Le CSV vient de la feuille (onglet Inscriptions → Fichier → Télécharger →
 * CSV). Il ne se colle PAS tel quel dans Supabase : ce script en fait le SQL
 * que le propriétaire colle dans l'éditeur SQL, comme pour le catalogue.
 *
 * DONNÉES PERSONNELLES. Le CSV et le SQL ne vont que dans exports/, que le dépôt
 * (public) ne versionne pas et que Vercel ne publie pas. Le script n'affiche
 * que des comptes et des numéros de ligne, jamais un nom ni un numéro.
 *
 * ON PEUT LE RELANCER. Le SQL remplace une reprise précédente — et elle seule :
 * chaque ligne reprise porte la marque `charge.reprise`. Une inscription reçue
 * directement par la nouvelle base, après la bascule, n'est jamais touchée. */
'use strict';

const fs = require('fs');
const path = require('path');
const { lit } = require('./import-catalogue');

const RACINE = path.resolve(__dirname, '..', '..');
const MARQUE = 'feuille-google';
const STATUTS = ['En attente', 'Confirmé', 'Payé', 'Annulé'];

// ------------------------------------------------------------ lire le CSV ----

/** Le CSV d'un tableur : guillemets, guillemets doublés, virgules et sauts de ligne dans une cellule. */
function lireCsv(texte) {
  const t = texte.replace(/^﻿/, '');
  const lignes = [];
  let ligne = [], cellule = '', entreGuillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreGuillemets) {
      if (c === '"' && t[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === ',') { ligne.push(cellule); cellule = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(cellule); lignes.push(ligne); ligne = []; cellule = '';
    } else cellule += c;
  }
  if (entreGuillemets) throw new Error('CSV mal fermé : un guillemet ouvert n’est jamais refermé.');
  if (cellule !== '' || ligne.length) { ligne.push(cellule); lignes.push(ligne); }
  /* Les lignes vides restent : un enregistrement du CSV est une ligne de la
     feuille, et c'est par son numéro que le propriétaire la retrouve. */
  return lignes;
}

// --------------------------------------------------- des cellules aux colonnes ----

/* Colonnes de la feuille → colonnes de la base. Les mêmes noms que lit le
   tableau de bord (api/_lib/admin.js, COLONNES_FEUILLE). */
const TEXTES = {
  dateInscription: 'date_inscription', formationTitle: 'formation_title', sessionId: 'session_id',
  sessionLabel: 'session_label', sessionStartDate: 'session_start_date', nom: 'nom', prenom: 'prenom',
  telephone: 'telephone', telephoneInternational: 'telephone_international', email: 'email',
  profession: 'profession', professionDetail: 'profession_detail', niveau: 'niveau', objectifs: 'objectifs',
  motivation: 'motivation', modePaiement: 'mode_paiement', telPaiement: 'tel_paiement', currency: 'devise',
  pays: 'pays', paysCode: 'pays_code', source: 'source', pageUrl: 'page_url'
};
const OBLIGATOIRES = ['Horodatage réception', 'formationId', 'nom', 'prenom', 'statut'];

/* La feuille affiche l'heure de Djibouti et des Comores (UTC+3, sans heure
   d'été) : « 20/09/2026 19:24:28 » est 16:24:28 UTC. */
function horodatage(brut) {
  const t = String(brut || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) return versIso(m[3], m[2], m[1], m[4], m[5], m[6]);
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) return versIso(m[1], m[2], m[3], m[4], m[5], m[6]);
  return null;
}
function versIso(a, mo, j, h = '0', mi = '0', s = '0') {
  // Lue d'abord telle quelle : un 31/02 ou un 25 h ne doit pas glisser au lendemain
  const telle = new Date(Date.UTC(+a, +mo - 1, +j, +h, +mi, +(s || 0)));
  if (isNaN(telle) || telle.getUTCFullYear() !== +a || telle.getUTCMonth() !== +mo - 1
    || telle.getUTCDate() !== +j || telle.getUTCHours() !== +h || telle.getUTCMinutes() !== +mi) return null;
  return new Date(telle.getTime() - 3 * 3600 * 1000).toISOString();
}

/** Un nombre de la feuille : « 15 000 », « 15000 », « 15000,00 ». */
function entier(brut) {
  const t = String(brut || '').replace(/[\s  ]/g, '').replace(/,00$/, '');
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** Les lignes du CSV → les valeurs à insérer, et ce qu'il faut savoir. */
function inscriptionsDepuisCsv(texte) {
  const lignes = lireCsv(texte);
  if (!lignes.length || !lignes[0].some(c => c.trim())) throw new Error('CSV vide.');
  const entetes = lignes[0].map(e => e.trim());
  const manquantes = OBLIGATOIRES.filter(o => !entetes.includes(o));
  if (manquantes.length) {
    throw new Error('Ce n’est pas l’onglet Inscriptions : colonnes absentes (' + manquantes.join(', ') + ').');
  }
  const avertissements = [];
  const avertir = (n, m) => avertissements.push('ligne ' + n + ' : ' + m);
  const inscriptions = [];

  lignes.slice(1).forEach((cellules, k) => {
    const n = k + 2;                                  // numéro de ligne dans la feuille
    if (!cellules.some(c => c.trim() !== '')) return; // ligne vide de la feuille
    const v = {};
    entetes.forEach((e, i) => { v[e] = (cellules[i] === undefined ? '' : cellules[i]); });
    const ligne = {};

    ligne.form_id = v.formationId.trim();
    if (!ligne.form_id) { avertir(n, 'sans formation, écartée'); return; }
    if (!v.nom.trim() && !v.prenom.trim()) { avertir(n, 'sans nom ni prénom, écartée'); return; }

    ligne.recue_le = horodatage(v['Horodatage réception']);
    if (!ligne.recue_le && /^\d{4}-\d{2}-\d{2}T/.test(v.dateInscription || '')) {
      ligne.recue_le = new Date(v.dateInscription).toISOString();
      avertir(n, 'horodatage illisible, date du navigateur reprise');
    }
    if (!ligne.recue_le) { avertir(n, 'aucune date lisible, écartée'); return; }

    for (const [cle, col] of Object.entries(TEXTES)) {
      const t = String(v[cle] === undefined ? '' : v[cle]).trim();
      ligne[col] = t === '' ? null : t;
    }

    const age = entier(v.age);
    ligne.age = age !== null && age <= 120 ? age : null;
    if (v.age && v.age.trim() && ligne.age === null) avertir(n, 'âge illisible, laissé vide');
    ligne.montant = entier(v.montant);
    if (v.montant && v.montant.trim() && ligne.montant === null) avertir(n, 'montant illisible, laissé vide');

    /* Le statut que le propriétaire a donné est gardé. Un statut inconnu
       repasse « En attente » : il n'occupe pas de place tant qu'on ne l'a pas revu. */
    const statut = v.statut.trim();
    ligne.statut = STATUTS.includes(statut) ? statut : 'En attente';
    if (!STATUTS.includes(statut)) avertir(n, 'statut « ' + statut + ' » inconnu, remis « En attente »');

    let complet = {};
    try {
      const j = JSON.parse(v['JSON complet'] || '{}');
      if (j && typeof j === 'object' && !Array.isArray(j)) complet = j;
    } catch (e) { avertir(n, 'JSON complet illisible, non repris'); }
    ligne.charge = { reprise: MARQUE, ligneFeuille: n, envoi: complet };

    inscriptions.push(ligne);
  });

  return { inscriptions, avertissements };
}

// ------------------------------------------------------------------ le SQL ----

const COLONNES = ['recue_le', 'form_id', 'statut', 'age', 'montant'].concat(Object.values(TEXTES));

function inscriptionsVersSql(inscriptions) {
  const sql = [
    '-- Inscriptions reprises de la feuille Google le ' + new Date().toISOString().slice(0, 10),
    '-- Généré par scripts/supabase/import-inscriptions.js. DONNÉES PERSONNELLES : ne pas partager.',
    'begin;',
    '-- Remplace une reprise précédente, et elle seule : une inscription reçue',
    '-- directement par la nouvelle base n\'est jamais touchée.',
    `delete from inscriptions where charge->>'reprise' = ${lit(MARQUE)};`
  ];
  for (const i of inscriptions) {
    const valeurs = COLONNES.map(c => (c === 'recue_le' ? lit(i[c]) + '::timestamptz' : lit(i[c])));
    sql.push(`insert into inscriptions (${COLONNES.join(', ')}, charge) values (${valeurs.join(', ')}, `
      + lit(JSON.stringify(i.charge)) + '::jsonb);');
  }
  sql.push('commit;');
  return sql.join('\n') + '\n';
}

// -------------------------------------------------------------- en commande ----

function principal() {
  const args = process.argv.slice(2);
  const option = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
  if (!option('--depuis')) throw new Error('Indiquez le CSV : --depuis "chemin/vers/Inscriptions.csv"');
  const vers = path.resolve(RACINE, option('--vers') || 'exports/inscriptions.sql');
  if (!vers.startsWith(path.join(RACINE, 'exports') + path.sep)) {
    throw new Error('Le SQL contient des données personnelles : il ne s’écrit que dans exports/.');
  }

  const { inscriptions, avertissements } = inscriptionsDepuisCsv(fs.readFileSync(path.resolve(option('--depuis')), 'utf8'));
  fs.mkdirSync(path.dirname(vers), { recursive: true });
  fs.writeFileSync(vers, inscriptionsVersSql(inscriptions));

  const parStatut = {};
  inscriptions.forEach(i => { parStatut[i.statut] = (parStatut[i.statut] || 0) + 1; });
  console.log(`SQL écrit : ${path.relative(RACINE, vers)}`);
  console.log(`${inscriptions.length} inscription(s) : ` + Object.entries(parStatut).map(([s, n]) => n + ' ' + s).join(', '));
  if (avertissements.length) {
    console.log('\nÀ SAVOIR (' + avertissements.length + ') :');
    avertissements.forEach(a => console.log('  - ' + a));
  }
}

if (require.main === module) {
  try { principal(); } catch (e) { console.error('Échec : ' + e.message); process.exit(1); }
}

module.exports = { lireCsv, horodatage, inscriptionsDepuisCsv, inscriptionsVersSql, MARQUE };

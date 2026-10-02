/* Le tarif, calculé par le SERVEUR comme le site l'affiche.
 *
 * Audit S8 : le montant, la devise et le titre d'une inscription venaient du
 * navigateur, et le script Google les recopiait tels quels — dans la feuille
 * comme dans l'alerte. N'importe qui pouvait s'inscrire « à 1 KMF ». Ici, ils
 * sont recalculés depuis le catalogue.
 *
 * Copie fidèle de prixDe() dans site-common.js : le montant enregistré est
 * exactement celui que le candidat a vu à l'écran. Aucune conversion de devise,
 * aucun repli d'un pays sur un autre : un tarif non saisi vaut null
 * (« À confirmer »). Les objets lus ici sont ceux du contrat
 * (api/_lib/catalogue.js). */
'use strict';

const paysDisponibles = catalogue => (catalogue.pays || []).filter(p => p && p.code && p.active !== false);

function paysParDefaut(catalogue) {
  const liste = paysDisponibles(catalogue);
  return liste.find(p => p.defaut) || liste[0] || null;
}

function trouverPays(catalogue, code) {
  if (!code) return null;
  const cible = String(code).trim().toUpperCase();
  return paysDisponibles(catalogue).find(p => String(p.code).toUpperCase() === cible) || null;
}

function paysDeSession(session) {
  return String((session && session.pays) || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
}

function sessionOuverteAu(session, code) {
  const liste = paysDeSession(session);
  return !liste.length || liste.indexOf(String(code || '').toUpperCase()) >= 0;
}

function reglagesDuPays(session, code) {
  const table = session && session.parPays;
  if (!table || typeof table !== 'object' || Array.isArray(table)) return {};
  const cible = String(code || '').toUpperCase();
  const trouve = Object.keys(table).find(c => String(c).toUpperCase() === cible);
  const valeur = trouve ? table[trouve] : null;
  return (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) ? valeur : {};
}

/** prixDe() de site-common.js, pour un pays donné. @returns {number|null} */
function prixDe(catalogue, objet, code) {
  if (!objet) return null;
  const pays = trouverPays(catalogue, code);
  if (!pays) return null;

  const duPays = reglagesDuPays(objet, pays.code).tarif;
  if (typeof duPays === 'number' && isFinite(duPays)) return duPays;

  const table = objet.prices;
  if (table && typeof table === 'object') {
    const valeur = table[pays.code];
    if (typeof valeur === 'number' && isFinite(valeur)) return valeur;
    if (Object.prototype.hasOwnProperty.call(table, pays.code)) return null;
  }

  const codesSession = paysDeSession(objet);
  if (codesSession.length) {
    if (codesSession.length > 1) return null;
    return sessionOuverteAu(objet, pays.code) && typeof objet.price === 'number' ? objet.price : null;
  }

  if (objet.prices && typeof objet.prices === 'object') return null;

  const defaut = paysParDefaut(catalogue);
  if (defaut && defaut.code === pays.code && typeof objet.price === 'number') return objet.price;
  return null;
}

/** currentPrice() de script.js : la session d'abord, la formation sinon. */
function tarifInscription(catalogue, formation, session, code) {
  const duSession = prixDe(catalogue, session, code);
  return typeof duSession === 'number' ? duSession : prixDe(catalogue, formation, code);
}

/** formatSessionDate() de site-common.js : « 6 octobre 2026 ». */
function dateEnFrancais(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

module.exports = { prixDe, tarifInscription, trouverPays, paysParDefaut, sessionOuverteAu, dateEnFrancais };

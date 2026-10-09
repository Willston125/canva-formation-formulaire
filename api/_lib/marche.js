/* Le marché du visiteur : un pays, et rien que ce pays.
 *
 * C'EST LE SERVEUR QUI DÉCIDE, comme sur les grandes plateformes. Vercel joint
 * à chaque requête le pays de l'adresse IP du visiteur (en-tête
 * `x-vercel-ip-country`, ISO 3166-1, calculé par son réseau). Le catalogue
 * envoyé au navigateur est FILTRÉ ici : un visiteur de Djibouti ne reçoit ni
 * les sessions, ni les tarifs, ni les numéros des Comores — ils ne quittent
 * jamais le serveur pour lui, et inversement. Le réseau de Vercel garde une
 * copie par pays (Vary: X-Vercel-IP-Country), jamais celle d'un autre.
 *
 * Trois issues, et aucune n'est « le pays par défaut » :
 * - un pays ouvert dans le tableau de bord → son offre ;
 * - un pays qui ne l'est pas (France, Mayotte…) → « hors marché » : les
 *   formations, présentées en ligne, sans tarif, sans session, sans numéro ;
 * - pas de pays lisible → hors marché aussi. Jamais le mauvais pays.
 *
 * Un CHOIX explicite (le sélecteur discret du pied de page) passe avant
 * l'adresse IP : un visiteur mal reconnu — VPN, itinérance — choisit son pays,
 * comme sur les grands sites. Il fait partie de l'adresse demandée
 * (`&marche=KM`), donc de la clé du cache : aucune confusion possible entre
 * deux visiteurs. Limite assumée, la même que partout : un VPN fait passer
 * pour un autre pays. Un visiteur ordinaire, lui, ne voit que le sien. */
'use strict';

const { sessionOuverteAu } = require('./prix');

const FORMAT_CODE = /^[A-Z]{2}$/;
/* Le mode présenté hors marché : décision du propriétaire (9 octobre 2026). */
const MODE_HORS_MARCHE = 'En ligne';
/* Seuls ces réglages sont publics : le numéro WhatsApp « général » (celui de
   Djibouti) et le lieu par défaut des sessions ne servent qu'au tableau de bord. */
const REGLAGES_PUBLICS = ['contactName', 'contactEmail'];

const paysDeSession = s => String((s && s.pays) || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
const paysOuverts = catalogue => (catalogue.pays || []).filter(p => p && p.code && p.active !== false);

/** Le code lisible d'un en-tête ou d'un paramètre, en majuscules, ou ''. */
function code(valeur) {
  const t = String(valeur || '').trim().toUpperCase();
  return FORMAT_CODE.test(t) ? t : '';
}

/**
 * Le marché retenu pour cette requête.
 * @param {object} catalogue  le catalogue complet (lireCatalogue)
 * @param {{ demande?: string, ip?: string }} indices
 *   demande : le choix du visiteur (« KM », « aucun » pour hors marché, vide = automatique)
 *   ip      : l'en-tête x-vercel-ip-country
 * @returns {{ code: string|null, source: 'choix'|'ip'|'hors-marche'|'inconnu' }}
 */
function choisirMarche(catalogue, { demande = '', ip = '' } = {}) {
  const ouverts = paysOuverts(catalogue).map(p => p.code);
  const voulu = String(demande || '').trim().toLowerCase();
  if (voulu === 'aucun') return { code: null, source: 'choix' };
  const choisi = code(demande);
  if (choisi && ouverts.indexOf(choisi) >= 0) return { code: choisi, source: 'choix' };
  const lu = code(ip);
  if (lu && ouverts.indexOf(lu) >= 0) return { code: lu, source: 'ip' };
  return { code: null, source: lu ? 'hors-marche' : 'inconnu' };
}

/** Le mode commun aux sessions d'un marché (« Présentiel », « En ligne »), ou null s'il varie. */
function modeDuMarche(sessions, marche) {
  if (!marche) return MODE_HORS_MARCHE;
  const modes = new Set();
  for (const s of sessions) {
    const propre = s.parPays && !Array.isArray(s.parPays) && s.parPays[marche] && s.parPays[marche].mode;
    const mode = String(propre || s.mode || '').trim();
    if (mode) modes.add(mode);
  }
  return modes.size === 1 ? [...modes][0] : null;
}

/**
 * Une session telle que ce marché doit la voir : ses seuls réglages, et rien
 * qui appartienne à un autre pays. Une session proposée dans plusieurs pays
 * portait un tarif et une adresse qui ne valent que pour l'un d'eux : ils sont
 * remplacés par ceux du marché, ou retirés.
 */
function sessionDuMarche(s, marche) {
  const proposes = paysDeSession(s);
  const propre = (s.parPays && !Array.isArray(s.parPays) && marche && s.parPays[marche]) || null;
  const copie = Object.assign({}, s, { parPays: propre ? { [marche]: propre } : [] });
  if (proposes.length) copie.pays = marche;
  if (proposes.length > 1) {
    copie.price = null;
    copie.currency = null;
    copie.location = (propre && propre.lieu) || null;
  }
  return copie;
}

/** Le jour à Moroni et à Djibouti (UTC+3, sans heure d'été), en AAAA-MM-JJ. */
const jourLocal = maintenant => new Date(maintenant + 3 * 3600 * 1000).toISOString().slice(0, 10);

/* Une page n'en fait défiler qu'une à chaque arrivée : au-delà, aucune ne
   serait jamais vue, et la réponse grossirait pour rien. */
const ANNONCES_MAX = 10;

/**
 * Les annonces qu'un visiteur de ce marché peut voir aujourd'hui, réduites à
 * ce qu'il faut pour les afficher.
 *
 * Une annonce qui vise des pays ne part QUE dans ces pays : une affiche faite
 * pour Djibouti porte son prix, son lieu, parfois son numéro — elle n'a rien à
 * faire chez un visiteur des Comores. Sans pays visé, elle part à tous, hors
 * marché compris. Les pays visés, les dates et l'interrupteur ne quittent pas
 * le serveur : seule la date de fin part, pour qu'une page restée en cache ne
 * montre pas une offre expirée.
 */
function annoncesDuMarche(catalogue, marche, aujourdhui) {
  const formations = new Map((catalogue.formations || []).map(f => [f.formId, f]));
  const visibles = [];
  for (const a of catalogue.annonces || []) {
    if (!a || !a.id || !a.image || a.active === false) continue;
    if (a.debut && a.debut > aujourdhui) continue;
    if (a.fin && a.fin < aujourdhui) continue;
    const vises = Array.isArray(a.pays) ? a.pays : [];
    if (vises.length && (!marche || vises.indexOf(marche) < 0)) continue;

    // Une formation retirée du catalogue n'a plus rien à promouvoir
    const f = a.formation ? formations.get(a.formation) : null;
    if (a.formation && (!f || f.active === false)) continue;

    visibles.push({
      id: a.id,
      type: a.type === 'partenaire' ? 'partenaire' : 'promotion',
      titre: a.titre,
      annonceur: a.annonceur || null,
      image: a.image,
      imageLarge: a.imageLarge || null,
      imageAlt: a.imageAlt || null,
      lien: a.lien || (f && f.href) || null,
      bouton: a.bouton || null,
      formation: a.formation || null,
      fin: a.fin || null
    });
    if (visibles.length >= ANNONCES_MAX) break;
  }
  return visibles;
}

/**
 * Le catalogue d'un marché. `marche` null = hors marché.
 * Les textes, les visuels et les réalisations ne dépendent d'aucun pays : ils
 * passent tels quels. Les annonces, elles, en dépendent (annoncesDuMarche).
 */
function catalogueDuMarche(catalogue, choix, horsMarcheMode = MODE_HORS_MARCHE, { maintenant = Date.now() } = {}) {
  const marche = choix && choix.code ? choix.code : null;
  const ouverts = paysOuverts(catalogue);
  const pays = marche ? ouverts.filter(p => p.code === marche) : [];

  const sessions = (catalogue.sessions || [])
    .filter(s => (marche ? sessionOuverteAu(s, marche) : paysDeSession(s).length === 0))
    .map(s => sessionDuMarche(s, marche));
  const mode = marche ? modeDuMarche(sessions, marche) : horsMarcheMode;

  const formations = (catalogue.formations || []).map(f => {
    const table = f.prices && typeof f.prices === 'object' && !Array.isArray(f.prices) ? f.prices : {};
    return Object.assign({}, f, {
      prices: marche && typeof table[marche] === 'number' ? { [marche]: table[marche] } : {},
      /* L'ancien tarif unique est celui du pays par défaut : un montant dans la
         devise d'un AUTRE marché. Il ne part jamais. */
      price: null,
      mode: mode || f.mode
    });
  });

  const gardees = new Set(sessions.map(s => s.id));
  const places = Object.fromEntries(Object.entries(catalogue.places || {}).filter(([id]) => gardees.has(id)));
  const reglages = Object.fromEntries(Object.entries(catalogue.reglages || {})
    .filter(([cle]) => REGLAGES_PUBLICS.indexOf(cle) >= 0));

  return Object.assign({}, catalogue, {
    formations, sessions, pays, places, reglages,
    annonces: annoncesDuMarche(catalogue, marche, jourLocal(maintenant)),
    marche: {
      code: marche,
      nom: pays.length ? pays[0].nom : null,
      mode,
      source: choix ? choix.source : 'inconnu'
    },
    /* Les noms des pays ouverts, pour le sélecteur du pied de page : rien
       d'autre que des noms — ni offre, ni tarif, ni numéro. */
    marches: ouverts.map(p => ({ code: p.code, nom: p.nom }))
  });
}

/** Les inscrits par session, réduits aux sessions de ce marché. */
async function placesDuMarche(db, compte, marche) {
  const { rows } = await db.query(
    `select s.id from sessions s
      where ($1::text is null and not exists (select 1 from session_pays p where p.session_id = s.id and p.propose))
         or ($1::text is not null and (
              not exists (select 1 from session_pays p where p.session_id = s.id and p.propose)
           or exists (select 1 from session_pays p where p.session_id = s.id and p.propose and p.pays_code = $1)))`,
    [marche || null]);
  const gardees = new Set(rows.map(r => r.id));
  return Object.fromEntries(Object.entries(compte || {}).filter(([id]) => gardees.has(id)));
}

module.exports = {
  choisirMarche, catalogueDuMarche, annoncesDuMarche, placesDuMarche, modeDuMarche, jourLocal,
  MODE_HORS_MARCHE, REGLAGES_PUBLICS
};

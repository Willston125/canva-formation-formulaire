/* Les annonces : la fenêtre qui s'ouvre à l'arrivée sur le site.
 *
 * Tout passe par le vrai gestionnaire HTTP (api/index.js), sur une vraie base
 * Postgres en mémoire. Quatre promesses :
 * 1. le tableau de bord seul les écrit, et une annonce bancale est refusée
 *    avec une phrase (pas d'affiche, publicité sans annonceur, lien piégé…) ;
 * 2. UNE ANNONCE QUI VISE UN PAYS NE PART QUE DANS CE PAYS — même règle que le
 *    reste de l'offre : on cherche son titre et son affiche dans le TEXTE de la
 *    réponse des autres pays ;
 * 3. les compteurs (affichée, cliquée, fermée) comptent les vraies annonces,
 *    et rien d'autre ;
 * 4. une affiche d'annonce n'est jamais effacée tant qu'elle sert, et part
 *    avec l'annonce. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur, RACINE } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { EVENEMENTS_ANNONCE } = require('../../../api/_lib/mesures.js');
const { jourLocal } = require('../../../api/_lib/marche.js');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

const JETON = 'aaa.admin.zzz';
const REGLAGES = {
  cle: 'sb_publishable_essai', admin: 'infos@impactali.site',
  lireUtilisateur: async j => (j === JETON ? { email: 'infos@impactali.site' } : null)
};

let api, db;
async function poster(corps, { ip = '10.0.0.1', jeton = '' } = {}) {
  const res = { statusCode: 200, corps: '', entetes: {}, setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c || ''; } };
  const headers = { 'x-forwarded-for': ip };
  if (jeton) headers.authorization = 'Bearer ' + jeton;
  await api({ method: 'POST', url: '/api', body: JSON.stringify(corps), headers }, res);
  let json = null;
  try { json = JSON.parse(res.corps); } catch (e) { /* 204 */ }
  return { statut: res.statusCode, json };
}
const admin = (action, charge) => poster(Object.assign({ action }, charge), { jeton: JETON }).then(r => r.json || {});
const erreurDe = r => (r.ok ? 'accepté' : r.erreur);

/** Le catalogue tel qu'un visiteur le reçoit, selon le pays de son adresse. */
async function catalogueVu(paysIp, choix) {
  const res = { statusCode: 200, corps: '', entetes: {}, setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c || ''; } };
  const url = '/api?action=catalogue' + (choix ? '&marche=' + choix : '');
  await api({ method: 'GET', url, headers: { 'x-vercel-ip-country': paysIp } }, res);
  return { texte: res.corps, json: JSON.parse(res.corps) };
}

const AFFICHE = id => '/api?photo=' + id;
const UUID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const jour = decalage => jourLocal(Date.now() + decalage * 86400000);

(async () => {
  db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  // Deux marchés ouverts, comme en production depuis octobre 2026
  await db.exec("update pays set active = true where code = 'DJ'");
  api = creerGestionnaire(() => db, { admin: REGLAGES, envoyer: async () => ({ envoye: true, erreur: null }) });

  // --------------------------------------------- 0. Les listes concordent ---

  const migration = fs.readFileSync(path.join(RACINE, 'supabase', 'migrations', '20261009180000_annonces.sql'), 'utf8');
  const dansLaBase = [...migration.match(/evenement in \(([\s\S]*?)\)\)/)[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);
  verifier('l’API et la base acceptent les mêmes événements d’annonce',
    Object.values(EVENEMENTS_ANNONCE).sort(), dansLaBase.sort());

  // ------------------------------------------------- 1. L'écriture ---

  const anonyme = await poster({ action: 'admin.annonce.save', donnees: { id: 'pirate', titre: 'X', image: '/a.webp' } });
  verifier('écrire une annonce exige d’être connecté', anonyme.statut, 401);

  const promo = {
    id: 'promo-canva', type: 'promotion', titre: 'Canva Pro · rentrée 2026', image: AFFICHE(UUID(1)),
    imageLarge: AFFICHE(UUID(2)), imageAlt: 'Affiche de la formation Canva Pro', formation: 'canva-pro', pays: []
  };
  const cree = await admin('admin.annonce.save', { donnees: promo });
  verifier('une formation à la une s’enregistre', [cree.ok, cree.cree], [true, true]);
  verifier('et le tableau de bord la relit, avec ses pays et ses dates',
    (cree.catalogue.annonces || []).map(a => [a.id, a.type, a.formation, a.active, a.pays.length]),
    [['promo-canva', 'promotion', 'canva-pro', true, 0]]);

  const refus = async (donnees, attendu, libelle) => {
    const r = await admin('admin.annonce.save', { donnees });
    verifier(libelle, erreurDe(r).indexOf(attendu) >= 0 ? attendu : erreurDe(r), attendu);
  };
  await refus({ id: 'sans-image', titre: 'Sans affiche' }, 'affiche verticale est obligatoire',
    'une annonce sans affiche verticale est refusée');
  await refus({ id: 'sans-titre', image: AFFICHE(UUID(3)) }, 'titre est obligatoire', 'sans titre aussi');
  await refus({ id: 'pub-anonyme', type: 'partenaire', titre: 'Promo', image: AFFICHE(UUID(3)) },
    'nomme son annonceur', 'une publicité sans annonceur est refusée');
  await refus({ id: 'piege', titre: 'Piège', image: AFFICHE(UUID(3)), lien: 'javascript:alert(1)' },
    'Le lien doit être', 'un lien « javascript: » est refusé');
  await refus({ id: 'piege-2', titre: 'Piège', image: 'data:image/png;base64,AAAA' },
    'L’affiche doit être', 'une affiche hors du site ou de https:// aussi');
  await refus({ id: 'pays-faux', titre: 'Ailleurs', image: AFFICHE(UUID(3)), pays: ['FR'] },
    'Pays inconnu : FR', 'un pays visé qui n’existe pas est refusé');
  await refus({ id: 'formation-fausse', titre: 'Fausse', image: AFFICHE(UUID(3)), formation: 'cuisine' },
    'Formation introuvable', 'une formation inconnue aussi');
  await refus({ id: 'dates', titre: 'Dates', image: AFFICHE(UUID(3)), debut: '2026-12-10', fin: '2026-12-01' },
    'La date de fin précède', 'une fin avant le début aussi');
  await refus({ id: 'Majuscules !', titre: 'Id', image: AFFICHE(UUID(3)) },
    'Identifiant d’annonce invalide', 'un identifiant hors format aussi');
  verifier('rien de tout cela n’a été écrit',
    (await db.query('select count(*)::int as n from annonces')).rows[0].n, 1);

  /* Une modification partielle garde ce qu'elle ne mentionne pas — et reste
     jugée sur l'annonce entière : passer en publicité exige un annonceur. */
  await admin('admin.annonce.save', { donnees: { id: 'promo-canva', ordre: 2 } });
  const relue = (await db.query('select titre, image, formation, ordre from annonces where id = $1', ['promo-canva'])).rows[0];
  verifier('une modification partielle ne vide pas le reste', [relue.titre, relue.formation, relue.ordre],
    ['Canva Pro · rentrée 2026', 'canva-pro', 2]);
  await refus({ id: 'promo-canva', type: 'partenaire' }, 'nomme son annonceur',
    'devenir une publicité sans annonceur est refusé');

  // Les autres annonces de l'épreuve
  const enregistrer = d => admin('admin.annonce.save', { donnees: d });
  await enregistrer({ id: 'pub-dj', type: 'partenaire', annonceur: 'Boutique Saalam', titre: 'Soldes à Djibouti',
    image: AFFICHE(UUID(10)), lien: 'https://exemple.dj/soldes', bouton: 'J’en profite', pays: ['DJ'], ordre: 1 });
  await enregistrer({ id: 'pub-km', type: 'partenaire', annonceur: 'Imprimerie Moroni', titre: 'Cartes de visite',
    image: AFFICHE(UUID(11)), pays: 'KM', ordre: 1 });
  await enregistrer({ id: 'eteinte', titre: 'Éteinte', image: AFFICHE(UUID(12)), active: false });
  await enregistrer({ id: 'future', titre: 'Plus tard', image: AFFICHE(UUID(13)), debut: jour(3) });
  await enregistrer({ id: 'finie', titre: 'Terminée', image: AFFICHE(UUID(14)), fin: jour(-1) });
  await enregistrer({ id: 'du-jour', titre: 'Aujourd’hui seulement', image: AFFICHE(UUID(15)), debut: jour(0), fin: jour(0) });

  // ------------------------------------- 2. Chaque pays ne voit que la sienne ---

  const km = await catalogueVu('KM');
  const dj = await catalogueVu('DJ');
  const ailleurs = await catalogueVu('FR');
  const ids = c => c.json.annonces.map(a => a.id);

  verifier('un visiteur des Comores voit les annonces pour tous, et celle des Comores, dans l’ordre',
    ids(km), ['pub-km', 'promo-canva', 'du-jour']);
  verifier('un visiteur de Djibouti, celle de Djibouti', ids(dj), ['pub-dj', 'promo-canva', 'du-jour']);
  verifier('hors marché, seulement celles qui ne visent aucun pays', ids(ailleurs), ['promo-canva', 'du-jour']);

  /* LE CONTRÔLE QUI COMPTE : rien de l'annonce de l'autre pays dans le TEXTE
     de la réponse — ni son titre, ni son annonceur, ni son affiche. */
  const traces = (texte, mots) => mots.filter(m => texte.indexOf(m) >= 0);
  verifier('rien de l’annonce de Djibouti dans la réponse des Comores',
    traces(km.texte, ['Soldes à Djibouti', 'Boutique Saalam', UUID(10), 'exemple.dj']), []);
  verifier('rien de celle des Comores dans la réponse de Djibouti',
    traces(dj.texte, ['Cartes de visite', 'Imprimerie Moroni', UUID(11)]), []);
  verifier('ni éteinte, ni à venir, ni terminée, nulle part',
    traces(km.texte + dj.texte + ailleurs.texte, ['Éteinte', 'Plus tard', 'Terminée']), []);

  const vue = km.json.annonces.find(a => a.id === 'promo-canva');
  verifier('une annonce publique ne dit ni ses pays, ni ses dates de début, ni son interrupteur',
    Object.keys(vue).sort(),
    ['annonceur', 'bouton', 'fin', 'formation', 'id', 'image', 'imageAlt', 'imageLarge', 'lien', 'titre', 'type']);
  verifier('une formation à la une mène à sa fiche', vue.lien, '/formations/canva-pro/');
  verifier('une publicité garde son lien et son annonceur',
    ['lien', 'annonceur', 'bouton'].map(k => dj.json.annonces.find(a => a.id === 'pub-dj')[k]),
    ['https://exemple.dj/soldes', 'Boutique Saalam', 'J’en profite']);
  verifier('la date de fin part, pour qu’une page en cache ne montre pas une offre expirée',
    km.json.annonces.find(a => a.id === 'du-jour').fin, jour(0));

  /* Le choix du pied de page vaut comme le pays de l'adresse. */
  verifier('un visiteur qui choisit Djibouti voit l’annonce de Djibouti', ids(await catalogueVu('KM', 'DJ')).indexOf('pub-dj') >= 0, true);

  /* Une formation désactivée n'a plus rien à promouvoir. */
  await db.exec("update formations set active = false where form_id = 'canva-pro'");
  verifier('une formation désactivée retire son annonce', ids(await catalogueVu('KM')).indexOf('promo-canva'), -1);
  await db.exec("update formations set active = true where form_id = 'canva-pro'");

  // ------------------------------------------------------ 3. Les compteurs ---

  const compte = async (annonce, evenement, pays = '') => (await db.query(
    'select coalesce(sum(n), 0)::int as n from annonces_mesures where annonce = $1 and evenement = $2 and pays = $3',
    [annonce, evenement, pays])).rows[0].n;

  const signal = await poster({ mesure: 'annonce_vue', annonce: 'pub-km', pays: 'KM' });
  verifier('un affichage reçoit 204', signal.statut, 204);
  await poster({ mesure: 'annonce_vue', annonce: 'pub-km', pays: 'KM' });
  await poster({ mesure: 'annonce_clic', annonce: 'pub-km', pays: 'KM' });
  await poster({ mesure: 'annonce_fermee', annonce: 'promo-canva', pays: '' });
  verifier('il compte, comme le clic et la fermeture',
    [await compte('pub-km', 'vue', 'KM'), await compte('pub-km', 'clic', 'KM'), await compte('promo-canva', 'fermee')],
    [2, 1, 1]);

  const avant = (await db.query('select coalesce(sum(n), 0)::int as n from annonces_mesures')).rows[0].n;
  await poster({ mesure: 'annonce_vue', annonce: 'inventee', pays: 'KM' });
  await poster({ mesure: 'annonce_vue', annonce: 'pub-km', pays: 'FR' });
  await poster({ mesure: 'annonce_vue', annonce: 'Pub KM !', pays: 'KM' });
  await poster({ mesure: 'annonce_vue', pays: 'KM' });
  await poster({ mesure: 'annonce_like', annonce: 'pub-km', pays: 'KM' });
  await poster({ mesure: 'vue', annonce: 'pub-km', pays: 'KM' });
  verifier('annonce inventée, pays inconnu, événement hors liste : rien d’écrit',
    (await db.query('select coalesce(sum(n), 0)::int as n from annonces_mesures')).rows[0].n, avant);
  verifier('et rien dans les compteurs de l’entonnoir',
    (await db.query('select count(*)::int as n from mesures')).rows[0].n, 0);

  verifier('les compteurs se lisent seulement connecté',
    (await poster({ action: 'admin.annonces.mesures' })).statut, 401);
  const lus = await admin('admin.annonces.mesures', { jours: 30 });
  verifier('connecté, par annonce, événement et pays',
    (lus.lignes || []).find(l => l.annonce === 'pub-km' && l.evenement === 'vue' && l.pays === 'KM').n, 2);

  // --------------------------------------------------- 4. Les affiches ---

  /* Une vraie photo de la base, posée comme affiche : elle ne s'efface pas
     tant qu'une annonce s'en sert, et part avec la dernière qui s'en servait. */
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);
  const envoi = await admin('admin.image.upload', { donnees: { base64: webp.toString('base64'), type: 'image/webp', nom: 'pub' } });
  verifier('une affiche s’envoie', envoi.ok, true);
  await enregistrer({ id: 'pub-km', imageLarge: envoi.url });
  verifier('une affiche large en service ne s’efface pas',
    (await admin('admin.image.delete', { url: envoi.url })).supprime, false);

  const suppression = await admin('admin.annonce.delete', { id: 'pub-km' });
  verifier('une annonce se supprime', suppression.ok, true);
  verifier('ses affiches partent avec elle',
    (await db.query('select count(*)::int as n from photos where id = $1', [envoi.id])).rows[0].n, 0);
  verifier('et ses compteurs aussi',
    (await db.query("select count(*)::int as n from annonces_mesures where annonce = 'pub-km'")).rows[0].n, 0);
  verifier('une annonce déjà supprimée : introuvable', erreurDe(await admin('admin.annonce.delete', { id: 'pub-km' })),
    'Annonce introuvable.');

  /* Supprimer une formation emporte ses annonces : elles n'auraient plus
     rien à promouvoir. (La formation n'a aucun inscrit dans cette base.) */
  const formation = (await db.query("select id from formations where form_id = 'photo-video'")).rows[0].id;
  await enregistrer({ id: 'promo-photo', titre: 'Photo & vidéo', image: AFFICHE(UUID(20)), formation: 'photo-video' });
  const sansFormation = await admin('admin.formation.delete', { id: formation });
  verifier('la formation se supprime', sansFormation.ok, true);
  verifier('et son annonce avec elle',
    (await db.query("select count(*)::int as n from annonces where id = 'promo-photo'")).rows[0].n, 0);

  // ------------------------------------------------ 5. La base, seule, tient ---

  const refusSql = async sql => { try { await db.exec(sql); return 'acceptée'; } catch (e) { return 'refusée'; } };
  verifier('la base refuse une publicité sans annonceur',
    await refusSql("insert into annonces (id, type, titre, image) values ('x1', 'partenaire', 'X', '/a.webp')"), 'refusée');
  verifier('un pays mal écrit',
    await refusSql("insert into annonces (id, titre, image, pays) values ('x2', 'X', '/a.webp', '{km}')"), 'refusée');
  verifier('un lien piégé',
    await refusSql("insert into annonces (id, titre, image, lien) values ('x3', 'X', '/a.webp', 'javascript:alert(1)')"), 'refusée');
  verifier('et un compteur d’événement inconnu',
    await refusSql("insert into annonces_mesures (jour, annonce, evenement) values (current_date, 'du-jour', 'like')"), 'refusée');

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

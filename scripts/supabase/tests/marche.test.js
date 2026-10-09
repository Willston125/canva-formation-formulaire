/* Chaque pays ne voit que son offre.
 *
 * Le catalogue public est réduit au MARCHÉ du visiteur : le pays de son adresse
 * IP (en-tête x-vercel-ip-country, posé par Vercel), ou celui qu'il a choisi en
 * bas de page. On éprouve ici, par le vrai gestionnaire HTTP, que les numéros,
 * les tarifs, les moyens de paiement et les lieux d'un pays n'apparaissent
 * NULLE PART dans la réponse servie à l'autre — pas seulement à l'écran : dans
 * le texte même de la réponse. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { choisirMarche, catalogueDuMarche } = require('../../../api/_lib/marche.js');

const { verifier, bilan } = verificateur();

/* Le catalogue du 2 octobre 2026, avec Djibouti ouvert et une session en ligne
   à Djibouti — la situation du lancement — plus une session proposée dans les
   deux pays, avec un tarif et une adresse de session qui n'en valent qu'un. */
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));
source.pays.find(p => p.code === 'DJ').active = true;
source.sessions.push({
  id: 'canva-pro-dj-2026', formId: 'canva-pro', startDate: '2026-10-21', endDate: '2026-10-30',
  schedule: 'Mercredi, jeudi et vendredi · 18h30 – 20h30', duration: '6 séances · 12 heures',
  location: null, mode: 'En ligne', price: 6000, placesTotal: 20, placesAvailable: 20,
  registrationOpen: true, currency: null, pays: 'DJ', parPays: { DJ: { mode: 'En ligne', tarif: 6000 } }
}, {
  id: 'marketing-mixte-2026', formId: 'marketing-digital', startDate: '2026-11-18', endDate: '2026-11-27',
  schedule: 'Mercredi · 18h30 – 20h30', duration: '2 séances', location: 'Saalam Tower, 5ème étage',
  mode: 'Présentiel', price: 7500, placesTotal: 20, placesAvailable: 20, registrationOpen: true,
  currency: null, pays: 'DJ,KM', parPays: { KM: { mode: 'En ligne', tarif: 10000 }, DJ: { lieu: 'Saalam Tower, 5ème étage' } }
});

/* Ce qui n'appartient qu'à un pays. Les NOMS des pays, eux, peuvent paraître :
   le sélecteur du pied de page les liste, comme sur les grands sites. */
const DE_DJIBOUTI = ['25377145306', '77 14 53 06', '77 55 63 44', '11000012127', 'Waafi', 'Cacpay', 'Saalam', 'FDJ', 'canva-pro-dj-2026'];
const DES_COMORES = ['2693804648', '380 46 48', '4866807', 'Mvola', 'KMF', 'American corner', 'Ifere', 'canva-pro-2026-11'];
const presents = (texte, liste) => liste.filter(m => texte.indexOf(m) >= 0);

let api;
async function lire(url, pays) {
  const res = { statusCode: 200, entetes: {}, corps: '', setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c || ''; } };
  const headers = { 'x-forwarded-for': '102.0.0.1' };
  if (pays) headers['x-vercel-ip-country'] = pays;
  await api({ method: 'GET', url, headers }, res);
  return { statut: res.statusCode, entetes: res.entetes, texte: res.corps, json: JSON.parse(res.corps) };
}

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  api = creerGestionnaire(() => db);

  // ------------------------------------------------------- 1. Les Comores ---

  const km = await lire('/api?action=catalogue', 'KM');
  verifier('un visiteur des Comores reçoit le marché des Comores, d’après son adresse IP',
    [km.json.marche.code, km.json.marche.source], ['KM', 'ip']);
  verifier('rien de Djibouti dans la réponse : ni numéro, ni moyen de paiement, ni devise, ni lieu, ni session',
    presents(km.texte, DE_DJIBOUTI), []);
  verifier('un seul pays, le sien', km.json.pays.map(p => p.code), ['KM']);
  verifier('ses moyens de paiement', km.json.pays[0].paymentMethods.map(m => m.label), ['Mvola']);
  verifier('les tarifs ne gardent que sa devise', km.json.formations.map(f => Object.keys(f.prices)).flat().filter(c => c !== 'KM'), []);
  verifier('le mode du marché vient de ses sessions', km.json.marche.mode, null);
  verifier('une copie par pays dans le réseau de Vercel', km.entetes.vary, 'X-Vercel-IP-Country');

  const mixte = km.json.sessions.find(s => s.id === 'marketing-mixte-2026');
  verifier('une session proposée dans deux pays perd l’adresse et le tarif de l’autre',
    [mixte.pays, mixte.price, mixte.location, mixte.parPays], ['KM', null, null, { KM: { mode: 'En ligne', tarif: 10000 } }]);

  // --------------------------------------------------------- 2. Djibouti ---

  const dj = await lire('/api?action=catalogue', 'DJ');
  verifier('un visiteur de Djibouti reçoit le marché de Djibouti', dj.json.marche.code, 'DJ');
  verifier('rien des Comores dans la réponse : ni numéro, ni Mvola, ni KMF, ni American Corner, ni session',
    presents(dj.texte, DES_COMORES), []);
  verifier('un seul pays, le sien', dj.json.pays.map(p => p.code), ['DJ']);
  verifier('ses sessions seulement', dj.json.sessions.map(s => s.id).sort(), ['canva-pro-dj-2026', 'marketing-mixte-2026']);
  const mixteDj = dj.json.sessions.find(s => s.id === 'marketing-mixte-2026');
  verifier('la session à deux pays garde l’adresse de Djibouti, et elle seule',
    [mixteDj.location, mixteDj.price], ['Saalam Tower, 5ème étage', null]);

  // ------------------------------------------- 3. Ailleurs, ou illisible ---

  for (const [libelle, pays] of [['un visiteur de France', 'FR'], ['un visiteur de Mayotte', 'YT'], ['un pays illisible', ''], ['un en-tête trafiqué', 'KM; DJ']]) {
    const r = await lire('/api?action=catalogue', pays);
    verifier(`${libelle} : hors marché, jamais un pays par défaut`, [r.json.marche.code, r.json.pays.length, r.json.sessions.length], [null, 0, 0]);
    verifier(`${libelle} : aucun numéro, aucun tarif, aucun lieu d’aucun pays`,
      presents(r.texte, DE_DJIBOUTI.concat(DES_COMORES)), []);
    verifier(`${libelle} : les formations sont présentées en ligne`,
      [...new Set(r.json.formations.map(f => f.mode))], ['En ligne']);
  }
  verifier('la source dit pourquoi : pays non ouvert, ou pas de pays du tout',
    [(await lire('/api?action=catalogue', 'FR')).json.marche.source, (await lire('/api?action=catalogue', '')).json.marche.source],
    ['hors-marche', 'inconnu']);

  // ---------------------------------------- 4. Le choix du pied de page ---

  const choixKm = await lire('/api?action=catalogue&marche=KM', 'DJ');
  verifier('un visiteur de Djibouti qui CHOISIT les Comores les voit', [choixKm.json.marche.code, choixKm.json.marche.source], ['KM', 'choix']);
  verifier('« aucun » : hors marché, même depuis un pays ouvert',
    (await lire('/api?action=catalogue&marche=aucun', 'KM')).json.marche.code, null);
  verifier('un pays non ouvert ne se choisit pas : l’adresse IP reprend la main',
    (await lire('/api?action=catalogue&marche=FR', 'DJ')).json.marche.code, 'DJ');
  verifier('une valeur piégée non plus',
    (await lire('/api?action=catalogue&marche=%3Cscript%3E', 'DJ')).json.marche.code, 'DJ');
  verifier('la liste du sélecteur ne porte que des noms',
    km.json.marches, [{ code: 'DJ', nom: 'Djibouti' }, { code: 'KM', nom: 'Comores' }]);

  // -------------------------------- 5. Ce qui ne part jamais, nulle part ---

  for (const [nom, r] of [['Comores', km], ['Djibouti', dj]]) {
    verifier(`${nom} : ni le numéro WhatsApp général, ni le lieu par défaut des sessions`,
      Object.keys(r.json.reglages).filter(c => /whatsapp|defaultLocation/i.test(c)), []);
    verifier(`${nom} : l’ancien tarif unique d’une formation (d’une autre devise) n’est jamais servi`,
      r.json.formations.filter(f => f.price !== null).map(f => f.formId), []);
  }

  // -------------------------------------------------------- 6. Les places ---

  await db.exec(`insert into inscriptions (form_id, nom, statut, session_id) values
    ('canva-pro', 'Awa', 'Confirmé', 'canva-pro-2026-11'),
    ('canva-pro', 'Hodan', 'Payé', 'canva-pro-dj-2026')`);
  const placesKm = await lire('/api?action=places', 'KM');
  verifier('les places d’un pays ne montrent pas les sessions de l’autre', placesKm.json, { sessions: { 'canva-pro-2026-11': 1 } });
  verifier('et elles aussi, une copie par pays', placesKm.entetes.vary, 'X-Vercel-IP-Country');
  verifier('Djibouti : ses places à lui', (await lire('/api?action=places', 'DJ')).json, { sessions: { 'canva-pro-dj-2026': 1 } });
  verifier('hors marché : aucune session, aucune place', (await lire('/api?action=places', 'FR')).json, { sessions: {} });

  // ------------------------------------------- 7. Un pays fermé ne vend rien ---

  const ferme = JSON.parse(JSON.stringify(source));
  ferme.pays.find(p => p.code === 'DJ').active = false;
  verifier('un pays fermé dans le tableau de bord ne reçoit pas son offre',
    choisirMarche(ferme, { ip: 'DJ' }).code, null);
  verifier('ni par l’adresse IP, ni par le sélecteur',
    choisirMarche(ferme, { demande: 'DJ', ip: 'DJ' }).code, null);
  verifier('et la fonction se passe de base pour le dire',
    catalogueDuMarche(ferme, { code: null, source: 'hors-marche' }).marches.map(m => m.code), ['KM']);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

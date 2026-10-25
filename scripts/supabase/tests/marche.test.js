/* Chaque pays ne voit que son offre.
 *
 * Le catalogue public est réduit au MARCHÉ du visiteur : le pays de son adresse
 * IP (en-tête x-vercel-ip-country, posé par Vercel), sinon celui de sa position
 * s'il active la localisation. Il ne le choisit pas (25 octobre 2026). On
 * éprouve ici, par le vrai gestionnaire HTTP, que les numéros,
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

/* Ce qui n'appartient qu'à un pays. */
/* L'accroche de l'accueil (24/10/2026) : celle de Djibouti dit son pays en toutes lettres. */
const ACCROCHE_DJ = 'Première académie audiovisuelle de Djibouti';
const ACCROCHE_KM = 'Accroche réservée aux Comores';
/* Les coordonnées de la page Contact (24/10/2026) : l'adresse de Djibouti nomme Saalam Tower. */
const CONTACT_DJ = { adresse: 'Saalam Tower, 5ème étage, Djibouti-ville', horaires: 'Accueil propre à Djibouti', carte: 'https://maps.example/djibouti' };
const CONTACT_KM = { adresse: 'Adresse propre aux Comores', horaires: 'Accueil propre aux Comores', carte: 'https://maps.example/comores' };
const DE_DJIBOUTI = ['25377145306', '77 14 53 06', '77 55 63 44', '11000012127', 'Waafi', 'Cacpay', 'Saalam', 'FDJ', 'canva-pro-dj-2026', ACCROCHE_DJ,
  ...Object.values(CONTACT_DJ)];
const DES_COMORES = ['2694742688', '474 26 88', '4866807', 'Mvola', 'KMF', 'American corner', 'Ifere', 'canva-pro-2026-11', ACCROCHE_KM,
  ...Object.values(CONTACT_KM)];
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
  await db.query(`update pays set accroche = case code when 'DJ' then $1 when 'KM' then $2 end`, [ACCROCHE_DJ, ACCROCHE_KM]);
  for (const [code, c] of [['DJ', CONTACT_DJ], ['KM', CONTACT_KM]]) {
    await db.query('update pays set adresse = $2, horaires = $3, carte = $4 where code = $1', [code, c.adresse, c.horaires, c.carte]);
  }
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
  verifier('l’accroche de l’accueil est la sienne', dj.json.pays[0].accroche, ACCROCHE_DJ);
  verifier('ses coordonnées de la page Contact aussi',
    [dj.json.pays[0].adresse, dj.json.pays[0].horaires, dj.json.pays[0].carte], Object.values(CONTACT_DJ));
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

  // ------------------------------------------ 4. Le pays ne se choisit pas ---

  /* Décision du propriétaire (25 octobre 2026) : plus de sélecteur, et aucun
     paramètre ne force un pays. */
  const forceKm = await lire('/api?action=catalogue&marche=KM', 'DJ');
  verifier('un visiteur de Djibouti qui demande les Comores reste à Djibouti',
    [forceKm.json.marche.code, forceKm.json.marche.source], ['DJ', 'ip']);
  verifier('et ne reçoit rien des Comores', presents(forceKm.texte, DES_COMORES), []);
  verifier('hors marché, demander un pays n’ouvre rien non plus',
    (await lire('/api?action=catalogue&marche=DJ', 'FR')).json.marche.code, null);
  verifier('la liste des pays ouverts ne part plus : chacun ne voit que le nom du sien',
    [km.json.marches, dj.json.marches], [undefined, undefined]);

  // ----------------------------------- 5. La localisation, seul recours ---

  const MORONI = '-11.70,43.26';
  const DJIBOUTI_VILLE = '11.59,43.15';
  const moroni = await lire('/api?action=catalogue&position=' + MORONI, 'FR');
  verifier('adresse non reconnue, appareil localisé à Moroni : le marché des Comores',
    [moroni.json.marche.code, moroni.json.marche.source], ['KM', 'localisation']);
  verifier('et rien de Djibouti', presents(moroni.texte, DE_DJIBOUTI), []);
  const djVille = await lire('/api?action=catalogue&position=' + DJIBOUTI_VILLE, '');
  verifier('sans adresse lisible, appareil localisé à Djibouti-ville : Djibouti',
    [djVille.json.marche.code, djVille.json.marche.source], ['DJ', 'localisation']);
  verifier('et rien des Comores', presents(djVille.texte, DES_COMORES), []);
  const invente = await lire('/api?action=catalogue&position=' + MORONI, 'DJ');
  verifier('reconnu à Djibouti, une position des Comores n’y change rien : l’adresse IP l’emporte',
    [invente.json.marche.code, invente.json.marche.source], ['DJ', 'ip']);
  verifier('ni numéro ni offre des Comores pour autant', presents(invente.texte, DES_COMORES), []);
  for (const [libelle, position] of [['Mayotte', '-12.78,45.23'], ['Aden, en face de Djibouti', '12.79,45.03'],
    ['Addis-Abeba', '9.03,38.74'], ['une île du détroit (Yémen)', '12.66,43.42'], ['Paris', '48.86,2.35']]) {
    verifier(`localisé à ${libelle} : hors marché`,
      (await lire('/api?action=catalogue&position=' + encodeURIComponent(position), 'FR')).json.marche.code, null);
  }
  for (const [libelle, position] of [['une valeur piégée', '<script>'], ['une latitude impossible', '91,43.26'],
    ['une position trop précise (le site arrondit au kilomètre)', '-11.7012,43.2601'], ['un pays au lieu d’une position', 'KM']]) {
    verifier(`${libelle} : ignorée`,
      (await lire('/api?action=catalogue&position=' + encodeURIComponent(position), 'FR')).json.marche.code, null);
  }

  // -------------------------------- 6. Ce qui ne part jamais, nulle part ---

  for (const [nom, r] of [['Comores', km], ['Djibouti', dj]]) {
    verifier(`${nom} : ni le numéro WhatsApp général, ni le lieu par défaut des sessions`,
      Object.keys(r.json.reglages).filter(c => /whatsapp|defaultLocation/i.test(c)), []);
    verifier(`${nom} : l’ancien tarif unique d’une formation (d’une autre devise) n’est jamais servi`,
      r.json.formations.filter(f => f.price !== null).map(f => f.formId), []);
  }

  // -------------------------------------------------------- 7. Les places ---

  await db.exec(`insert into inscriptions (form_id, nom, statut, session_id) values
    ('canva-pro', 'Awa', 'Confirmé', 'canva-pro-2026-11'),
    ('canva-pro', 'Hodan', 'Payé', 'canva-pro-dj-2026')`);
  const placesKm = await lire('/api?action=places', 'KM');
  verifier('les places d’un pays ne montrent pas les sessions de l’autre', placesKm.json, { sessions: { 'canva-pro-2026-11': 1 } });
  verifier('et elles aussi, une copie par pays', placesKm.entetes.vary, 'X-Vercel-IP-Country');
  verifier('Djibouti : ses places à lui', (await lire('/api?action=places', 'DJ')).json, { sessions: { 'canva-pro-dj-2026': 1 } });
  verifier('hors marché : aucune session, aucune place', (await lire('/api?action=places', 'FR')).json, { sessions: {} });
  verifier('localisé aux Comores : leurs places à elles',
    (await lire('/api?action=places&position=-11.70,43.26', 'FR')).json, { sessions: { 'canva-pro-2026-11': 1 } });

  // ------------------------------------------- 8. Un pays fermé ne vend rien ---

  const ferme = JSON.parse(JSON.stringify(source));
  ferme.pays.find(p => p.code === 'DJ').active = false;
  verifier('un pays fermé dans le tableau de bord ne reçoit pas son offre',
    choisirMarche(ferme, { ip: 'DJ' }).code, null);
  verifier('ni par l’adresse IP, ni par la localisation',
    choisirMarche(ferme, { ip: 'DJ', position: '11.59,43.15' }).code, null);
  verifier('et la fonction se passe de base pour le dire',
    catalogueDuMarche(ferme, { code: null, source: 'hors-marche' }).pays, []);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

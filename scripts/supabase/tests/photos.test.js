/* Les photos dans la base : envoi, lecture, effacement, rapatriement de Drive.
 *
 * Google Drive est remplacé par un faux qui rend des octets choisis : on
 * éprouve ce que l'API fait d'une vraie photo, d'une page d'erreur déguisée,
 * et d'une adresse qui n'est pas chez Google. Le tout passe par le vrai
 * gestionnaire HTTP (api/index.js). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { baseNeuve, verificateur, RACINE } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { creerTache } = require('../../../api/quotidien.js');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

// Des octets qui COMMENCENT comme de vraies images : c'est tout ce que l'API regarde
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(40, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');

const JETON = 'aaa.admin.zzz';
const telechargements = [];
let renduParDrive = WEBP;
const fauxDrive = async url => {
  telechargements.push(url);
  return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => renduParDrive };
};
const REGLAGES = {
  cle: 'sb_publishable_essai', admin: 'infos@impactali.site',
  lireUtilisateur: async j => (j === JETON ? { email: 'infos@impactali.site' } : null),
  telecharger: fauxDrive
};

let api;
async function admin(action, charge) {
  const res = { statusCode: 200, corps: '', setHeader() {}, end(c) { this.corps = c; } };
  await api({ method: 'POST', url: '/api', body: JSON.stringify(Object.assign({ action }, charge)),
    headers: { authorization: 'Bearer ' + JETON } }, res);
  return JSON.parse(res.corps || '{}');
}
async function lire(url) {
  const res = { statusCode: 200, entetes: {}, corps: null, setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c; } };
  await api({ method: 'GET', url, headers: {} }, res);
  return res;
}
const envoyer = (octets, type) => admin('admin.image.upload', { donnees: { base64: octets.toString('base64'), type, nom: 'Affiche été 2026' } });
const erreurDe = r => (r.ok ? 'accepté' : r.erreur);

/** Une fonction d'un script du site, extraite et exécutée telle qu'elle y est écrite. */
function fonctionDe(fichier, entete, nom) {
  const texte = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
  const debut = texte.indexOf(entete);
  let profondeur = 0, fin = -1;
  for (let j = texte.indexOf('{', debut); j < texte.length; j++) {
    if (texte[j] === '{') profondeur++;
    else if (texte[j] === '}' && !--profondeur) { fin = j + 1; break; }
  }
  const bac = {};
  vm.createContext(bac);
  vm.runInContext(texte.slice(debut, fin) + '\nglobalThis.f = ' + nom + ';', bac);
  return bac.f;
}

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  api = creerGestionnaire(() => db, { admin: REGLAGES, envoyer: async () => ({ envoye: true, erreur: null }) });

  // ---------------------------------------------------------- 1. L'envoi ---

  const envoi = await envoyer(WEBP, 'image/webp');
  verifier('une photo s’envoie', envoi.ok, true);
  verifier('et reçoit une adresse du site', /^\/api\?photo=[0-9a-f-]{36}$/.test(envoi.url), true);
  verifier('son nom est nettoyé', (await db.query('select nom from photos where id = $1', [envoi.id])).rows[0].nom, 'Affiche--t--2026');

  const servie = await lire(envoi.url);
  verifier('elle est servie telle quelle', [servie.statusCode, servie.entetes['content-type'],
    Buffer.isBuffer(servie.corps) && servie.corps.equals(WEBP)], [200, 'image/webp', true]);
  verifier('gardée un an par le réseau de Vercel', servie.entetes['cache-control'], 'public, max-age=31536000, s-maxage=31536000, immutable');
  verifier('et jamais lue comme autre chose qu’une image',
    [servie.entetes['x-content-type-options'], servie.entetes['content-security-policy']], ['nosniff', "default-src 'none'; sandbox"]);

  verifier('un SVG est refusé (il peut porter du code)',
    erreurDe(await envoyer(Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml')), 'Format d’image non accepté.');
  verifier('une page HTML déguisée en JPEG aussi',
    erreurDe(await envoyer(HTML, 'image/jpeg')), 'Ce fichier n’est pas une image JPEG : il n’a pas été enregistré.');
  verifier('un WebP annoncé PNG aussi',
    erreurDe(await envoyer(WEBP, 'image/png')), 'Ce fichier n’est pas une image PNG : il n’a pas été enregistré.');
  verifier('une photo trop lourde aussi',
    /Image trop lourde \(1600 Ko pour 1536 Ko autorisés\)/.test(erreurDe(await envoyer(Buffer.alloc(1600 * 1024), 'image/webp'))), true);
  verifier('et rien de tout cela n’a été rangé', (await db.query('select count(*)::int as n from photos')).rows[0].n, 1);

  verifier('une photo inconnue : introuvable', (await lire('/api?photo=00000000-0000-0000-0000-000000000000')).statusCode, 404);
  verifier('une adresse mal formée aussi', (await lire('/api?photo=../../etc')).statusCode, 404);

  /* La page reconnaît une photo de Drive à « id= » dans l'adresse, et la
     renverrait chez Google en cas d'échec d'affichage. La nôtre ne doit pas
     s'y laisser prendre. */
  const identifiantDrive = fonctionDe('site-common.js', 'function identifiantDrive(url)', 'identifiantDrive');
  verifier('le site ne prend pas nos photos pour des photos de Drive', identifiantDrive(envoi.url), null);
  verifier('(contre-contrôle : il reconnaît bien une adresse Drive)',
    identifiantDrive('https://lh3.googleusercontent.com/d/1_CqBRtKSlQ0AVOilmJrtdnLO5QtliVKO=w1200-rw'), '1_CqBRtKSlQ0AVOilmJrtdnLO5QtliVKO');

  // --------------------------------------------------- 2. L'effacement ---

  const enAttente = await envoyer(JPEG, 'image/jpeg');
  verifier('une photo envoyée puis abandonnée s’efface', (await admin('admin.image.delete', { url: enAttente.url })).supprime, true);
  verifier('et n’est plus servie', (await lire(enAttente.url)).statusCode, 404);

  await admin('admin.images.save', { donnees: { 'accueil.hero': envoi.url } });
  verifier('une photo dont le site se sert ne s’efface pas', (await admin('admin.image.delete', { url: envoi.url })).supprime, false);
  verifier('elle reste servie', (await lire(envoi.url)).statusCode, 200);
  verifier('une photo de Drive n’est pas à nous : rien n’est effacé, sans erreur',
    await admin('admin.image.delete', { url: 'https://lh3.googleusercontent.com/d/1_CqBRtKSlQ0AVOilmJrtdnLO5QtliVKO=w1200-rw' }),
    { ok: true, supprime: false });
  verifier('un fichier du site non plus', (await admin('admin.image.delete', { url: '/assets/images/waafi.png' })).supprime, false);

  /* Le script effaçait de Drive l'affiche d'une formation supprimée. */
  const affiche = await envoyer(WEBP, 'image/webp');
  const partagee = await envoyer(JPEG, 'image/jpeg');
  await admin('admin.formation.save', { donnees: { id: 'form-x', slug: 'x', title: 'X', poster: affiche.url, image: partagee.url } });
  await admin('admin.portfolio.save', { donnees: { id: 'real-x', title: 'X', image: partagee.url } });
  verifier('une formation supprimée emporte son affiche', [(await admin('admin.formation.delete', { id: 'form-x' })).ok,
    (await lire(affiche.url)).statusCode], [true, 404]);
  verifier('mais pas une photo qui sert encore ailleurs', (await lire(partagee.url)).statusCode, 200);

  // ------------------------------------------------ 3. Le rapatriement ---

  const DRIVE = 'https://lh3.googleusercontent.com/d/1_CqBRtKSlQ0AVOilmJrtdnLO5QtliVKO=w1200-rw';
  const rapatriee = await admin('admin.image.rapatrier', { url: DRIVE });
  verifier('une photo de Drive se rapatrie', rapatriee.ok, true);
  verifier('téléchargée chez Google à sa taille d’origine',
    telechargements, ['https://lh3.googleusercontent.com/d/1_CqBRtKSlQ0AVOilmJrtdnLO5QtliVKO=w2400-rw']);
  verifier('et remplacée là où le site s’en servait', rapatriee.catalogue.images['accueil.methode.1'], rapatriee.url);
  verifier('servie depuis la base', (await lire(rapatriee.url)).statusCode, 200);

  const autreForme = await admin('admin.image.rapatrier', { url: 'https://drive.google.com/thumbnail?id=1_CqBRtKSlQ0AVOilmJrtdnLO5QtliVKO&sz=w1200' });
  verifier('le même fichier sous une autre adresse n’est pas retéléchargé', [autreForme.url, telechargements.length], [rapatriee.url, 1]);

  verifier('une adresse hors de Google est refusée, sans rien télécharger',
    [erreurDe(await admin('admin.image.rapatrier', { url: 'https://lh3.googleusercontent.com.pirate.test/d/1FichierInconnuDeDriveXYZ123' })),
      telechargements.length],
    ['Ce n’est pas une photo de Google Drive : https://lh3.googleusercontent.com.pirate.test/d/1FichierInconnuDeDriveXYZ123', 1]);
  renduParDrive = HTML;
  verifier('une page d’erreur rendue par Google n’est pas rangée comme photo',
    /n’a pas rendu une image utilisable/.test(erreurDe(await admin('admin.image.rapatrier', { url: 'https://lh3.googleusercontent.com/d/1PyAYG7-dOoCWX0SbIxBQVSlY-pHsHJcu=w1200-rw' }))), true);
  renduParDrive = WEBP;

  /* Ce que fait le bouton du tableau de bord : SA liste des photos de Drive,
     une à une. Après le passage, il ne doit plus en rester aucune — la liste
     du tableau de bord et les remplacements de l'API couvrent les mêmes endroits. */
  const photosSurDrive = fonctionDe('admin/admin.js', 'function photosSurDrive(c)', 'photosSurDrive');
  let catalogue = rapatriee.catalogue;
  const aRapatrier = photosSurDrive(catalogue);
  // 19 au départ, moins celle déjà rapatriée et « accueil.hero », remplacée plus haut par une photo envoyée
  verifier('le tableau de bord voit les photos restées sur Drive', aRapatrier.length, 17);
  for (const url of aRapatrier) catalogue = (await admin('admin.image.rapatrier', { url })).catalogue;
  verifier('après le rapatriement, il n’en reste aucune', photosSurDrive(catalogue), []);
  verifier('ni dans la base, nulle part',
    (await db.query(`select count(*)::int as n from (
      select url as u from visuels union all select image from formations union all select poster from formations
      union all select image from realisations union all select image from moyens_paiement) t
      where u like '%google%'`)).rows[0].n, 0);
  verifier('chaque rapatriement est au journal',
    (await db.query(`select count(*)::int as n from journal where action = 'admin.image.rapatrier'`)).rows[0].n, 19);

  // --------------------------------------------------- 4. La sauvegarde ---

  let copie = null;
  const tache = creerTache(() => db, { envoyer: async m => { copie = m; return { envoye: true, erreur: null }; } });
  await tache({ method: 'GET', url: '/api/quotidien', headers: {} }, { setHeader() {}, end() {} });
  const tables = JSON.parse(Buffer.from(copie.piecesJointes[0].content, 'base64').toString('utf8')).tables;
  verifier('la sauvegarde liste les photos', tables.photos.length > 0 && 'poids' in tables.photos[0], true);
  verifier('sans en joindre les octets', tables.photos.some(p => 'octets' in p), false);

  // -------------------------------------- 5. Avant que la table existe ---

  /* La migration des photos se colle à la main dans Supabase. Tant qu'elle ne
     l'est pas, l'administrateur doit lire quoi faire, pas « indisponible ». */
  await db.exec('drop table photos');
  verifier('sans la table, l’envoi dit quelle migration manque',
    /un fichier de supabase\/migrations reste à coller/.test(erreurDe(await envoyer(WEBP, 'image/webp'))), true);
  verifier('et le reste du tableau de bord fonctionne', (await admin('admin.catalogue', {})).ok, true);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

/* Les photos du tableau de bord : reçues, servies, effacées, rapatriées de Drive.
 *
 * Elles étaient dans Google Drive, déposées par le script. Elles sont désormais
 * dans la base (table `photos`), et le site les lit à l'adresse /api?photo=…,
 * que le réseau de Vercel garde en cache un an : une photo ne change jamais
 * de contenu, puisqu'un remplacement crée une nouvelle photo, donc une
 * nouvelle adresse — comme le faisait déjà le script avec Drive.
 *
 * L'adresse ne porte pas « id= » : la page reconnaît une photo de Drive à ce
 * motif (identifiantDrive, site-common.js), et la renverrait chez Google.
 *
 * SÛRETÉ. Seuls WebP, JPEG et PNG entrent, vérifiés sur leurs premiers octets
 * et pas sur ce qu'annonce l'envoi : un SVG ou une page HTML déguisés
 * pourraient porter du code. Le rapatriement ne télécharge que chez Google,
 * jamais à une adresse choisie par la requête. Une photo n'est effacée que si
 * elle est à nous et que rien ne s'en sert plus. */
'use strict';

const { enTransaction } = require('./transaction');
const { lireCatalogue } = require('./catalogue');
const { noter } = require('./journal');

const TYPES = ['image/webp', 'image/jpeg', 'image/png'];
const POIDS_MAX = 1.5 * 1024 * 1024;            // comme le script Google
const POIDS_MAX_REPRISE = 3 * 1024 * 1024;      // une photo de Drive, à sa taille d'origine
const FORMAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOMS_TYPES = { 'image/webp': 'WebP', 'image/jpeg': 'JPEG', 'image/png': 'PNG' };

const adresse = id => '/api?photo=' + id;

/** L'identifiant d'une de NOS photos, ou null (Drive, fichier du site, autre). */
function idDe(url) {
  const m = /^\/api\?photo=([0-9a-f-]{36})$/i.exec(String(url || '').trim());
  return m && FORMAT_ID.test(m[1]) ? m[1].toLowerCase() : null;
}

/** Le format réel d'un fichier, d'après ses premiers octets. */
function formatReel(o) {
  if (o.length >= 12 && o.toString('latin1', 0, 4) === 'RIFF' && o.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  if (o.length >= 8 && o.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/** Le fichier Drive d'une adresse Google, comme le lit le site (identifiantDrive). */
function identifiantDrive(url) {
  const t = String(url || '').trim();
  if (!/^https:\/\/(lh3\.googleusercontent\.com|drive\.google\.com)\//.test(t)) return null;
  const m = t.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]{20,})/)
    || t.match(/[?&]id=([A-Za-z0-9_-]{20,})/)
    || t.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// ------------------------------------------------------------- lecture ----

async function lirePhoto(db, id) {
  if (!FORMAT_ID.test(String(id || ''))) return null;
  const { rows } = await db.query('select type, octets from photos where id = $1', [id]);
  return rows.length ? { type: rows[0].type, octets: Buffer.from(rows[0].octets) } : null;
}

/** Combien d'endroits du site se servent de cette adresse. */
async function utilisations(db, url) {
  const id = idDe(url) || '';
  const { rows } = await db.query(`select
      (select count(*) from visuels where url = $1)
    + (select count(*) from formations where image = $1 or poster = $1)
    + (select count(*) from realisations where image = $1)
    + (select count(*) from annonces where image = $1 or image_large = $1)
    + (select count(*) from moyens_paiement where image = $1)
    + (select count(*) from reglages where $2 <> '' and strpos(valeur::text, $2) > 0)
    + (select count(*) from textes where $2 <> '' and strpos(valeur, $2) > 0) as n`, [url, id]);
  return Number(rows[0].n);
}

// ---------------------------------------------------------- écritures ----

async function televerser(db, d, qui) {
  if (!d || typeof d !== 'object' || !d.base64) throw new Error('Aucune image reçue.');
  const type = d.type || 'image/webp';
  if (!TYPES.includes(type)) throw new Error('Format d’image non accepté.');

  /* Le poids est contrôlé AVANT le décodage : vérifier après aurait déjà
     consommé la mémoire que le garde-fou est censé protéger. */
  const base64 = String(d.base64);
  const poidsEstime = Math.floor(base64.length * 3 / 4);
  if (poidsEstime > POIDS_MAX) {
    throw new Error('Image trop lourde (' + Math.round(poidsEstime / 1024) + ' Ko pour '
      + Math.round(POIDS_MAX / 1024) + ' Ko autorisés).');
  }
  const octets = Buffer.from(base64, 'base64');
  if (formatReel(octets) !== type) {
    throw new Error('Ce fichier n’est pas une image ' + NOMS_TYPES[type] + ' : il n’a pas été enregistré.');
  }
  const nom = String(d.nom || 'image').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40);

  return enTransaction(db, async tx => {
    const { rows } = await tx.query('insert into photos (type, octets, nom) values ($1, $2, $3) returning id', [type, octets, nom]);
    await noter(tx, qui, 'admin.image.upload', rows[0].id, { nom, poids: octets.length });
    return { ok: true, url: adresse(rows[0].id), id: rows[0].id, poids: octets.length };
  });
}

/**
 * Efface une de nos photos si plus rien ne s'en sert. Une photo de Drive ou un
 * fichier du site ne sont pas à nous : on n'y touche pas, sans erreur — le
 * tableau de bord demande l'effacement de tout visuel qu'il remplace.
 * À appeler dans une transaction qui tient le verrou du catalogue.
 */
async function supprimerSiInutile(tx, url) {
  const id = idDe(url);
  if (!id) return { supprime: false };
  if (await utilisations(tx, url) > 0) return { supprime: false, utilisee: true };
  const { rows } = await tx.query('delete from photos where id = $1 returning id', [id]);
  return { supprime: rows.length > 0, id };
}

const VERROU = "select pg_advisory_xact_lock(hashtext('impactali-catalogue'))";

async function supprimer(db, url, qui) {
  return enTransaction(db, async tx => {
    await tx.query(VERROU);
    const r = await supprimerSiInutile(tx, url);
    if (r.supprime) await noter(tx, qui, 'admin.image.delete', r.id, {});
    return { ok: true, supprime: r.supprime };
  });
}

/** Remplace une adresse par une autre partout où le site s'en sert. */
async function remplacerPartout(tx, ancienne, nouvelle) {
  let n = 0;
  for (const [table, col] of [['visuels', 'url'], ['formations', 'image'], ['formations', 'poster'],
    ['realisations', 'image'], ['annonces', 'image'], ['annonces', 'image_large'], ['moyens_paiement', 'image']]) {
    n += (await tx.query(`update ${table} set ${col} = $2 where ${col} = $1 returning 1`, [ancienne, nouvelle])).rows.length;
  }
  return n;
}

/**
 * Rapatrie une photo de Google Drive dans la base, et la remplace partout où
 * le site s'en sert. Rien ne change à l'écran : c'est la même photo, à sa
 * taille d'origine. Une photo déjà rapatriée — un essai précédent, une autre
 * forme d'adresse du même fichier — n'est pas téléchargée deux fois.
 */
async function rapatrier(db, url, qui, { telecharger = fetch } = {}) {
  const ancienne = String(url || '').trim();
  const fichier = identifiantDrive(ancienne);
  if (!fichier) throw new Error('Ce n’est pas une photo de Google Drive : ' + ancienne);
  const origine = 'drive:' + fichier;

  let { rows } = await db.query('select id from photos where origine = $1', [origine]);
  let octets = null, type = null;
  if (!rows.length) {
    // Google ne l'agrandit pas : demander 2400 px rend la photo à sa taille d'origine, en WebP
    const r = await telecharger('https://lh3.googleusercontent.com/d/' + fichier + '=w2400-rw',
      { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Google Drive ne rend plus cette photo (' + r.status + ') : ' + ancienne);
    if (Number(r.headers.get('content-length')) > POIDS_MAX_REPRISE) throw new Error('Photo trop lourde sur Drive : ' + ancienne);
    octets = Buffer.from(await r.arrayBuffer());
    type = formatReel(octets);
    if (!type || octets.length > POIDS_MAX_REPRISE) throw new Error('Google Drive n’a pas rendu une image utilisable pour ' + ancienne);
  }

  return enTransaction(db, async tx => {
    await tx.query(VERROU);
    let id = rows.length ? rows[0].id : null;
    if (!id) {
      const cree = await tx.query(`insert into photos (type, octets, nom, origine) values ($1, $2, $3, $4)
        on conflict (origine) do nothing returning id`, [type, octets, 'drive-' + fichier.slice(0, 20), origine]);
      id = cree.rows.length ? cree.rows[0].id
        : (await tx.query('select id from photos where origine = $1', [origine])).rows[0].id;
    }
    const nouvelle = adresse(id);
    const remplacees = await remplacerPartout(tx, ancienne, nouvelle);
    await noter(tx, qui, 'admin.image.rapatrier', id, { ancienne, remplacees });
    return { url: nouvelle, remplacees };
  });
}

const PHOTOS = {
  'admin.image.upload': (db, d, qui) => televerser(db, d.donnees, qui),
  'admin.image.delete': (db, d, qui) => supprimer(db, d.url, qui),
  'admin.image.rapatrier': async (db, d, qui, options) => Object.assign({ ok: true },
    await rapatrier(db, d.url, qui, options), { catalogue: await lireCatalogue(db) })
};

module.exports = {
  PHOTOS, lirePhoto, rapatrier, supprimerSiInutile, utilisations, idDe, formatReel, identifiantDrive,
  adresse, TYPES, POIDS_MAX
};

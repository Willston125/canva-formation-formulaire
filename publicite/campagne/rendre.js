/* La campagne des 5 formations : 10 maquettes par formation, photographiées par Chrome.
 *
 *   node publicite/campagne/rendre.js                    → tout (≈ 2 minutes)
 *   node publicite/campagne/rendre.js --f canva-pro      → une formation
 *   node publicite/campagne/rendre.js --v places,story-places   → seulement ces maquettes (ex. le chiffre du jour)
 *   node publicite/campagne/rendre.js --hors-ligne       → sans interroger le site (reprend le dernier _live.json)
 *
 * Les dates, tarifs, numéros WhatsApp et places restantes viennent de impactali.site
 * (catalogue public de chaque pays) : relancer le rendu suffit à remettre les visuels
 * d'aplomb après un changement dans le tableau de bord.
 *
 * Sortie : publicite/rendus/campagne/<formation>/{Comores,Djibouti,Generique}/ + planches. */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));

const RACINE = path.resolve(__dirname, '../..');
const SORTIE = path.join(RACINE, 'publicite', 'rendus', 'campagne');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(c => fs.existsSync(c));

const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf('--' + nom); return i >= 0 ? args[i + 1] : null; };
const SEULE_F = option('f');
const SEULES_V = option('v') ? option('v').split(',') : null;
const HORS_LIGNE = args.includes('--hors-ligne');

const FORMATIONS = [
  ['canva-pro', '01 Canva Pro'],
  ['identite-visuelle', '02 Graphisme'],
  ['marketing-digital', '03 Marketing digital'],
  ['ia-appliquee', '04 Site web avec IA'],
  ['photo-video', '05 Montage video']
];
const MARCHES = { km: { code: 'KM', dossier: 'Comores' }, dj: { code: 'DJ', dossier: 'Djibouti' } };
const MARQUES = {
  km: [/\+269/, /KMF/, /Mvola/, /Moroni/, /American Corner/i, /IFERE/, /Comores/i, /380\s46\s48/],
  dj: [/\+253/, /FDJ/, /Waafi/, /Cacpay/, /Saalam/, /Djibouti/i, /77\s14\s53\s06/, /enregistr/i]
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ------------------------------------------------------ données du site ----

async function lireSite() {
  const fichier = path.join(SORTIE, '_live.json');
  if (HORS_LIGNE) return JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const live = { maj: new Date().toISOString() };
  for (const [m, { code }] of Object.entries(MARCHES)) {
    const r = await fetch(`https://www.impactali.site/api?action=catalogue&marche=${code}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`Le site répond ${r.status} pour ${code}`);
    const c = await r.json();
    const pays = c.pays.find(p => p.code === code);
    if (!pays) throw new Error(`Le catalogue ${code} ne contient pas son pays (pays inactif ?)`);
    const sessions = {};
    for (const s of c.sessions) {
      if (!s.registrationOpen) continue;
      const deja = sessions[s.formId];
      if (deja && deja.debut <= s.startDate) continue; // la prochaine session de chaque formation
      sessions[s.formId] = { debut: s.startDate, fin: s.endDate, prix: s.price, places: s.placesAvailable, total: s.placesTotal };
    }
    live[m] = { wa: pays.whatsappDisplay, devise: pays.devise, sessions };
  }
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify(live, null, 2));
  return live;
}

// ------------------------------------------------------ serveur local ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};
function servir() {
  return new Promise(resoudre => {
    const serveur = http.createServer((req, res) => {
      const chemin = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', TYPES[path.extname(chemin).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(chemin).pipe(res);
    });
    serveur.listen(0, '127.0.0.1', () => resoudre(serveur));
  });
}

// ------------------------------------------------- Chrome, sans fenêtre ----

async function lancerChrome() {
  if (!CHROME) throw new Error('Chrome introuvable sur cette machine.');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'impactali-campagne-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--window-size=1080,1920', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise((resoudre, rejeter) => {
    let tampon = '';
    const delai = setTimeout(() => rejeter(new Error('Chrome ne répond pas.')), 20000);
    chrome.stderr.on('data', morceau => {
      tampon += morceau;
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(tampon);
      if (m) { clearTimeout(delai); resoudre(Number(m[1])); }
    });
    chrome.on('exit', () => rejeter(new Error('Chrome s’est arrêté au démarrage.')));
  });
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(c => c.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resoudre, rejeter) => { ws.onopen = resoudre; ws.onerror = rejeter; });
  let numero = 0;
  const attentes = new Map();
  let surChargement = null;
  ws.onmessage = evenement => {
    const message = JSON.parse(evenement.data);
    if (message.id && attentes.has(message.id)) {
      const { resoudre, rejeter } = attentes.get(message.id);
      attentes.delete(message.id);
      if (message.error) rejeter(new Error(message.error.message)); else resoudre(message.result);
    } else if (message.method === 'Page.loadEventFired' && surChargement) { const f = surChargement; surChargement = null; f(); }
  };
  const envoyer = (methode, params = {}) => new Promise((resoudre, rejeter) => {
    const id = ++numero;
    attentes.set(id, { resoudre, rejeter });
    ws.send(JSON.stringify({ id, method: methode, params }));
  });
  const evaluer = async expression => {
    const r = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Dans la page : ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const naviguer = async (adresse, largeur, hauteur, echelle = 1) => {
    await envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: echelle, mobile: false });
    const charge = new Promise(resoudre => { surChargement = resoudre; });
    await envoyer('Page.navigate', { url: adresse });
    await charge;
  };
  const fermer = () => { try { ws.close(); } catch (e) { /* déjà fermé */ } chrome.kill(); setTimeout(() => fs.rmSync(profil, { recursive: true, force: true }), 1500); };
  await envoyer('Page.enable');
  return { envoyer, evaluer, naviguer, fermer };
}
const capture = async (chrome, params) => Buffer.from((await chrome.envoyer('Page.captureScreenshot', params)).data, 'base64');

// ------------------------------------------------------------ certificats ----

/* Le modèle de certificat (certificat/, hors git), avec « Votre nom » et les dates de la session. */
async function rendreCertificat(chrome, base, slug, titre, m, S) {
  const theme = m === 'km' ? 'clair' : 'sombre';
  const lieu = m === 'km' ? 'Moroni, Comores' : 'En ligne';
  const ville = m === 'km' ? 'Moroni' : 'Djibouti';
  const d = iso => { const [a, mo, j] = iso.split('-').map(Number); return { a, mo: mo - 1, j: j === 1 ? '1er' : String(j) }; };
  const A = d(S.debut), B = d(S.fin);
  const dates = A.mo === B.mo ? `du ${A.j} au ${B.j} ${MOIS[B.mo]} ${B.a}` : `du ${A.j} ${MOIS[A.mo]} au ${B.j} ${MOIS[B.mo]} ${B.a}`;
  const champs = {
    nom: 'Votre nom', formation: titre,
    details: `6 séances · 12 heures · ${dates} · ${lieu}`,
    lieudate: `Délivré à ${ville}, le ${B.j} ${MOIS[B.mo]} ${B.a}`,
    numero: `N° IMP-${B.a}-${MARCHES[m].code}-0001`
  };
  await chrome.naviguer(`${base}/certificat/outils/certificat.html?theme=${theme}&capture=1`, 1123, 794, 2);
  await chrome.evaluer('window.pret');
  await chrome.evaluer(`(() => { const c = ${JSON.stringify(champs)}; for (const [k, v] of Object.entries(c)) { const t = document.querySelector('[data-champ="' + k + '"] .t'); if (t) t.textContent = v; } return true; })()`);
  await chrome.evaluer('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const boite = await chrome.evaluer(`(() => { const r = document.getElementById('page').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
  fs.writeFileSync(path.join(SORTIE, `_certificat-${slug}-${theme}.png`), await capture(chrome, { format: 'png', clip: { ...boite, scale: 1 } }));
}

// ------------------------------------------------------------ plan de rendu ----

const slugifier = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&amp;|&/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function plan(slug, dossier, F) {
  const n = F.modules.length;
  const deux = (v, nom) => ['km', 'dj'].map(m => ({ v, m, fichiers: [`${dossier}/${MARCHES[m].dossier}/${nom}.png`] }));
  const commun = (v, nom, generique = true) => ({ v, m: null, fichiers: [
    `${dossier}/Comores/${nom}.png`, `${dossier}/Djibouti/${nom}.png`, ...(generique ? [`${dossier}/Generique/${nom}.png`] : [])] });
  const cible = k => slugifier(F['cible' + k].etiquette.replace('&amp;', 'et'));
  const liste = [
    ...deux('annonce', '01_annonce'),
    commun('formateur', '02_formateur'),
    commun('programme-0', '03_programme-1'),
    ...Array.from({ length: n }, (_, i) => commun('programme-' + (i + 1), `03_programme-${i + 2}`)),
    ...deux('programme-fin', `03_programme-${n + 2}`),
    commun('vitrine', '04_ce-que-vous-allez-creer'),
    commun('cible1', '05_' + cible(1)),
    commun('cible2', '06_' + cible(2)),
    commun('cible3', '07_' + cible(3)),
    ...deux('questions', '08_questions'),
    ...deux('certificat', '09_certificat'),
    ...deux('places', '10_places-restantes'),
    ...deux('story-annonce', 'Statuts/S1_annonce'),
    ...deux('story-places', 'Statuts/S6_places-restantes')
  ];
  if (slug === 'canva-pro') liste.push(...deux('story-programme', 'Statuts/S2_programme'), ...deux('story-questions', 'Statuts/S4_questions'));
  return liste;
}

function controler(m, v) {
  const alertes = [];
  if (m) MARQUES[m === 'km' ? 'dj' : 'km'].forEach(re => { if (re.test(v.texte)) alertes.push(`contient ${re} (autre pays)`); });
  else [...MARQUES.km, ...MARQUES.dj, /\d[\d\s\u00A0]*(KMF|FDJ)/].forEach(re => { if (re.test(v.texte)) alertes.push(`générique mais contient ${re}`); });
  v.icones.forEach(i => alertes.push(`icône absente de la police : ${i}`));
  v.hors.forEach(t => alertes.push(`hors du cadre : ${t}`));
  v.chevauchements.forEach(t => alertes.push(`chevauchement : ${t}`));
  v.debordements.forEach(t => alertes.push(`texte qui déborde : ${t}`));
  v.images.forEach(t => alertes.push(`image introuvable : ${t}`));
  return alertes;
}

/* La planche d'une formation pour un pays : les 10 maquettes, dans l'ordre. */
async function planche(dossier, pays) {
  const rep = path.join(SORTIE, dossier, pays);
  const fichiers = fs.readdirSync(rep).filter(f => /^(01|02|03_programme-1\.|04|05|06|07|08|09|10)/.test(f) && f.endsWith('.png')).sort();
  const L = 432, H = 540, G = 24;
  const composites = await Promise.all(fichiers.map(async (f, i) => ({
    input: await sharp(path.join(rep, f)).resize(L, H).toBuffer(), left: G + (i % 5) * (L + G), top: G + Math.floor(i / 5) * (H + G)
  })));
  await sharp({ create: { width: G + 5 * (L + G), height: G + 2 * (H + G), channels: 3, background: '#1A1F26' } })
    .composite(composites).png().toFile(path.join(SORTIE, dossier, `Planche ${pays}.png`));
}

async function main() {
  const live = await lireSite();
  console.log('  données du site :', HORS_LIGNE ? 'reprises (hors ligne)' : 'lues à l’instant', '·',
    Object.entries(live).filter(([k]) => k !== 'maj').map(([m, l]) => `${m.toUpperCase()} ${Object.keys(l.sessions).length} sessions`).join(' · '));
  const serveur = await servir();
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome();
  const donnees = fs.readFileSync(path.join(__dirname, 'donnees.js'), 'utf8');
  const CAMPAGNE = new Function('window', donnees + '; return window.CAMPAGNE;')({});
  fs.mkdirSync(path.join(SORTIE, 'apercus'), { recursive: true });
  let total = 0, alertesTotal = 0;
  try {
    for (const [slug, dossier] of FORMATIONS) {
      if (SEULE_F && SEULE_F !== slug) continue;
      const F = CAMPAGNE.FORMATIONS[slug];
      const liste = plan(slug, dossier, F).filter(r => !SEULES_V || SEULES_V.includes(r.v));
      if (!liste.length) continue;
      if (liste.some(r => r.v === 'certificat')) {
        for (const m of ['km', 'dj']) await rendreCertificat(chrome, base, slug, F.titre, m, live[m].sessions[slug]);
      }
      console.log(`\n  ${F.titre}`);
      for (const r of liste) {
        const adresse = `${base}/publicite/campagne/campagne.html?f=${slug}&v=${r.v}${r.m ? '&m=' + r.m : ''}`;
        const story = r.v.startsWith('story') || r.v === 'reel-fin';
        await chrome.naviguer(adresse, 1080, story ? 1920 : 1350);
        await chrome.evaluer('window.pret');
        const alertes = controler(r.m, await chrome.evaluer('window.verifier()'));
        const png = await capture(chrome, { format: 'png' });
        for (const f of r.fichiers) { const cible = path.join(SORTIE, f); fs.mkdirSync(path.dirname(cible), { recursive: true }); fs.writeFileSync(cible, png); }
        const w = 1080, h = story ? 1920 : 1350;
        fs.writeFileSync(path.join(SORTIE, 'apercus', `${slug}__${r.v}${r.m ? '__' + r.m : ''}.webp`),
          await capture(chrome, { format: 'webp', quality: 82, clip: { x: 0, y: 0, width: w, height: h, scale: 0.5 } }));
        total++; alertesTotal += alertes.length;
        console.log(`  ${alertes.length ? '!!' : 'ok'} ${(r.v + (r.m ? ' · ' + r.m : '')).padEnd(24)} → ${r.fichiers[0].split('/').slice(1).join('/')}${r.fichiers.length > 1 ? ` (+${r.fichiers.length - 1})` : ''}`);
        alertes.forEach(a => console.log('       ' + a));
      }
      for (const pays of ['Comores', 'Djibouti']) await planche(dossier, pays);
    }
    if (!SEULE_F && !SEULES_V) {
      await chrome.naviguer(`${base}/publicite/campagne/campagne.html?f=canva-pro&v=reel-fin`, 1080, 1920);
      await chrome.evaluer('window.pret');
      fs.mkdirSync(path.join(SORTIE, 'Reels'), { recursive: true });
      fs.writeFileSync(path.join(SORTIE, 'Reels', 'fin-de-reel.png'), await capture(chrome, { format: 'png' }));
      total++;
    }
  } finally {
    chrome.fermer();
    serveur.close();
  }
  console.log(`\n${total} maquettes · ${alertesTotal ? alertesTotal + ' alerte(s) à regarder' : 'aucune alerte'}`);
  console.log('Dossier :', SORTIE);
}

main().catch(e => { console.error(e); process.exit(1); });

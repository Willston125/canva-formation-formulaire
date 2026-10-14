/* Chrome sans fenêtre, piloté par son protocole de débogage (WebSocket natif
 * de Node, aucune dépendance). Partagé par le tournage (rendre.js) et par les
 * captures du site (capturer-site.js). */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(c => fs.existsSync(c));

async function lancerChrome({ largeur = 1080, hauteur = 1920 } = {}) {
  if (!CHROME) throw new Error('Chrome introuvable sur cette machine.');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'impactali-presentation-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
    `--window-size=${largeur},${hauteur}`, 'about:blank'
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

  const cibles = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = cibles.find(c => c.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resoudre, rejeter) => { ws.onopen = resoudre; ws.onerror = rejeter; });

  let numero = 0;
  const attentes = new Map();
  const ecouteurs = [];
  ws.onmessage = evenement => {
    const message = JSON.parse(evenement.data);
    if (message.id && attentes.has(message.id)) {
      const { resoudre, rejeter } = attentes.get(message.id);
      attentes.delete(message.id);
      if (message.error) rejeter(new Error(message.error.message));
      else resoudre(message.result);
    } else if (message.method) {
      ecouteurs.forEach(f => f(message));
    }
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
  /** Attend un événement du protocole (ex. Page.loadEventFired). */
  const attendre = (methode, delai = 30000) => new Promise((resoudre, rejeter) => {
    const minuterie = setTimeout(() => rejeter(new Error('Délai dépassé : ' + methode)), delai);
    const f = m => {
      if (m.method !== methode) return;
      clearTimeout(minuterie);
      ecouteurs.splice(ecouteurs.indexOf(f), 1);
      resoudre(m.params);
    };
    ecouteurs.push(f);
  });
  const fermer = () => {
    try { ws.close(); } catch (e) { /* déjà fermé */ }
    chrome.kill();
    setTimeout(() => fs.rmSync(profil, { recursive: true, force: true }), 1500);
  };
  return { envoyer, evaluer, attendre, ecouteurs, fermer };
}

module.exports = { lancerChrome };

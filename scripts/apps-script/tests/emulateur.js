/* Exécute le VRAI code Apps Script dans Node, avec des services Google simulés.
   Sert à éprouver le tableau de bord sans toucher au classeur de production. */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

const SOURCE = path.resolve(process.env.GS_SOURCE || process.argv[2]
  || path.join(__dirname, '..', 'impactali-inscriptions.gs'));
const PORT = Number(process.argv[3] || 5174);

// ------------------------------ CLASSEUR ---------------------------------


/* Google Sheets interprète une chaîne saisie qui commence par « = » ou « + »
   comme une FORMULE. On reproduit ce comportement, sinon l'émulateur serait
   plus indulgent que la réalité et masquerait le défaut. */
function commeSheets(v) {
  if (typeof v !== 'string') return v;
  if (v.charAt(0) === "'") return v.slice(1);            // apostrophe = texte forcé
  if ('=+-'.indexOf(v.charAt(0)) < 0) return v;
  const reste = v.replace(/^[=+-]/, '').trim();
  const n = Number(reste);
  return Number.isFinite(n) && reste !== '' ? n : '#ERROR!';
}

const classeur = { feuilles: {} };

function creerFeuille(nom) {
  const grille = [];
  const borner = () => {
    const colonnes = grille.reduce((n, l) => Math.max(n, l.length), 0);
    grille.forEach(l => { while (l.length < colonnes) l.push(''); });
    return colonnes;
  };
  const feuille = {
    getName: () => nom,
    getLastRow: () => grille.length,
    getLastColumn: () => borner(),
    setFrozenRows: () => feuille,
    getDataRange: () => ({ getValues: () => { borner(); return grille.map(l => l.slice()); } }),
    appendRow: valeurs => { grille.push(valeurs.map(commeSheets)); borner(); return feuille; },
    deleteRow: n => { grille.splice(n - 1, 1); return feuille; },
    getRange: (ligne, colonne, nbLignes, nbColonnes) => {
      nbLignes = nbLignes || 1;
      nbColonnes = nbColonnes || 1;
      return {
        getValues: () => {
          const sortie = [];
          for (let i = 0; i < nbLignes; i++) {
            const source = grille[ligne - 1 + i] || [];
            const l = [];
            for (let j = 0; j < nbColonnes; j++) l.push(source[colonne - 1 + j] === undefined ? '' : source[colonne - 1 + j]);
            sortie.push(l);
          }
          return sortie;
        },
        setValues: valeurs => {
          valeurs.forEach((l, i) => {
            while (grille.length < ligne + i) grille.push([]);
            const cible = grille[ligne - 1 + i];
            l.forEach((v, j) => { cible[colonne - 1 + j] = commeSheets(v); });
          });
          borner();
        },
        setValue: v => {
          while (grille.length < ligne) grille.push([]);
          grille[ligne - 1][colonne - 1] = commeSheets(v);
          borner();
        }
      };
    }
  };
  classeur.feuilles[nom] = feuille;
  return feuille;
}

const proprietes = {};
const fichiersDrive = {};

// ------------------------------- SERVICES --------------------------------

const bac = {
  console,
  Logger: { log: m => console.log('[gs]', m) },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => tableur,
    openById: () => tableur
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: c => (c in proprietes ? proprietes[c] : null),
      setProperty: (c, v) => { proprietes[c] = String(v); },
      deleteProperty: c => { delete proprietes[c]; }
    })
  },
  LockService: { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => true }) },
  Utilities: {
    sleep: () => { },
    formatDate: d => new Date(d).toISOString().slice(0, 10),
    base64Decode: s => Buffer.from(s, 'base64'),
    newBlob: (octets, type, nom) => ({ octets, type, nom })
  },
  Session: { getScriptTimeZone: () => 'Africa/Djibouti' },
  MailApp: { sendEmail: o => console.log('[courriel]', o.subject || o.to) },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'lien' },
    Permission: { VIEW: 'lecture' },
    getFolderById: id => { if (!fichiersDrive[id]) throw new Error('introuvable'); return fichiersDrive[id]; },
    getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
    getFileById: id => { if (!fichiersDrive[id]) throw new Error('introuvable'); return fichiersDrive[id]; },
    createFolder: nom => {
      const id = 'dossier-' + Object.keys(fichiersDrive).length;
      const dossier = {
        getId: () => id, getName: () => nom, isTrashed: () => false,
        createFile: blob => {
          const fid = 'fichier' + Object.keys(fichiersDrive).length + 'xxxxxxxxxxxxxxxxxxxx';
          const f = { getId: () => fid, setSharing: () => f, setTrashed: () => f, isTrashed: () => false, getName: () => blob.nom };
          fichiersDrive[fid] = f;
          return f;
        }
      };
      fichiersDrive[id] = dossier;
      return dossier;
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json', JAVASCRIPT: 'text/javascript' },
    createTextOutput: t => ({ _t: t, _m: 'application/json', setMimeType(m) { this._m = m; return this; } })
  }
};

const tableur = {
  getSheetByName: nom => classeur.feuilles[nom] || null,
  insertSheet: nom => creerFeuille(nom)
};

vm.createContext(bac);
vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), bac, { filename: SOURCE });
// Le mot de passe par défaut est volontairement refusé par le script
vm.runInContext("MOT_DE_PASSE_ADMIN = 'motdepasse-de-test';", bac);

// -------------------------------- SERVEUR --------------------------------

module.exports = { bac, classeur, creerFeuille };
if (require.main !== module) return;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const entetes = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, entetes); res.end(); return; }

  let corps = '';
  req.on('data', c => { corps += c; });
  req.on('end', () => {
    let sortie;
    try {
      sortie = req.method === 'POST'
        ? bac.doPost({ postData: { contents: corps } })
        : bac.doGet({ parameter: Object.fromEntries(url.searchParams) });
    } catch (err) {
      sortie = { _t: JSON.stringify({ ok: false, erreur: String(err) }) };
    }
    res.writeHead(200, entetes);
    res.end(sortie && sortie._t ? sortie._t : '{}');
  });
}).listen(PORT, () => console.log('Émulateur Apps Script sur http://localhost:' + PORT));

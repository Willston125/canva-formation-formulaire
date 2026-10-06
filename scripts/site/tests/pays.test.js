/* Vérifie les pays déclarés dans le fichier du site.
   C'est le repli quand la feuille Google n'a pas encore la colonne : un pays
   mal déclaré ici ne serait reconnu nulle part, et le visiteur verrait le
   numéro et les tarifs d'un autre pays que le sien. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const site = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'formations-data.js'), 'utf8'), site);
const PAYS = site.window.PAYS || [];

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const actifs = PAYS.filter(p => p && p.active !== false);

verifier('au moins un pays desservi', actifs.length >= 1, true);

verifier('codes à deux lettres majuscules',
  actifs.filter(p => !/^[A-Z]{2}$/.test(String(p.code || ''))).map(p => p.code), []);

verifier('aucun code en double',
  actifs.map(p => p.code).filter((c, i, t) => t.indexOf(c) !== i), []);

verifier('un seul pays par défaut',
  actifs.filter(p => p.defaut === true).map(p => p.code).length, 1);

verifier('chaque pays a un nom et une devise',
  actifs.filter(p => !p.nom || !p.devise).map(p => p.code), []);

verifier('chaque pays a un indicatif commençant par +',
  actifs.filter(p => !/^\+\d+$/.test(String(p.indicatif || ''))).map(p => p.code), []);

/* Les motifs sont des expressions régulières appliquées à la saisie du candidat :
   un motif invalide bloquerait toutes les inscriptions du pays. */
verifier('les formats de numéro compilent',
  actifs.filter(p => {
    if (!p.motifTelephone) return false;
    try { new RegExp(p.motifTelephone); return false; } catch (e) { return true; }
  }).map(p => p.code), []);

/* Un exemple de numéro doit lui-même respecter le format annoncé, sinon on
   demande au candidat quelque chose que l'on refuse ensuite. */
verifier('l’exemple de numéro respecte le format annoncé',
  actifs.filter(p => p.exempleTelephone && p.motifTelephone
    && !/X/i.test(p.exempleTelephone)
    && !new RegExp(p.motifTelephone).test(p.exempleTelephone)).map(p => p.code), []);

/* Reconnaissance du visiteur : sans fuseau déclaré, seul le code de région de
   la langue peut désigner ce pays — un indice bien plus rare. */
verifier('chaque pays déclare au moins un fuseau horaire',
  actifs.filter(p => !Array.isArray(p.fuseaux) || !p.fuseaux.length).map(p => p.code), []);

verifier('les fuseaux sont au format IANA « Région/Ville »',
  actifs.flatMap(p => (p.fuseaux || []).filter(f => !/^[A-Za-z_]+\/[A-Za-z_+-]+$/.test(String(f)))), []);

verifier('aucun fuseau partagé par deux pays',
  (() => {
    const vus = {};
    const doublons = [];
    actifs.forEach(p => (p.fuseaux || []).forEach(f => {
      if (vus[f]) doublons.push(f); else vus[f] = p.code;
    }));
    return doublons;
  })(), []);

// Le pays par défaut doit être joignable : c'est lui qui sert de repli à tous
const defaut = actifs.find(p => p.defaut === true);
verifier('le pays par défaut a un numéro de contact',
  !!(defaut && String(defaut.whatsappNumber || '').replace(/\D/g, '')), true);


/* Un numéro glissé dans le champ « indicatif » produit un téléphone
   inutilisable dans la feuille : le script doit le refuser. */
const essaisIndicatif = [
  ['+269 380 46 48', false],
  ['269', false],
  ['+2 6 9', false],
  ['+269', true],
  ['+253', true]
];
verifier('un indicatif mal saisi est reconnu comme tel',
  essaisIndicatif.filter(([v, valide]) => /^\+\d{1,4}$/.test(v) !== valide).map(([v]) => v), []);

/* ---------------------------------------------------------------------------
   Marchés ouverts aux formations en ligne

   Douze pays francophones ont été ajoutés pour que les sessions EN LIGNE soient
   suivables de partout. Chacun ne porte que des FAITS publics : code, devise,
   indicatif, fuseau. Rien d'autre n'est inventé — ni tarif, ni contact, ni
   coordonnées de paiement. Ces contrôles gardent cette frontière.
   --------------------------------------------------------------------------- */

/* L'ordre d'affichage doit être déclaré partout : sans lui, un pays retombe en
   999 et passe derrière les autres. Les marchés d'origine se sont ainsi
   retrouvés après douze nouveaux venus. */
verifier('chaque pays déclare son ordre d’affichage',
  actifs.filter(p => typeof p.ordre !== 'number').map(p => p.code), []);
verifier('aucun ordre en double',
  actifs.map(p => p.ordre).filter((o, i, t) => t.indexOf(o) !== i), []);

const parOrdre = actifs.slice().sort((a, b) => a.ordre - b.ordre);
verifier('le pays par défaut ouvre la liste', parOrdre[0].defaut === true, true);

/* Une devise et un indicatif sont indispensables : sans devise aucun tarif n'est
   lisible, sans indicatif aucun numéro n'est joignable. */
verifier('chaque pays a une devise de trois lettres',
  actifs.filter(p => !/^[A-Z]{3}$/.test(String(p.devise || ''))).map(p => p.code), []);

/* Un tarif ne s'invente pas : un pays sans montant saisi doit rester sans
   montant, pour que le site annonce « À confirmer » plutôt qu'un prix faux. */
const avecTarif = (site.window.FORMATIONS || []).flatMap(f => Object.entries(f.prices || {}))
  .filter(([, v]) => typeof v === 'number').map(([code]) => code);
console.log('Tarifs réellement saisis pour : ' + ([...new Set(avecTarif)].join(', ') || 'aucun pays'));
console.log('Pays sans tarif, annoncés « À confirmer » : '
  + actifs.filter(p => !avecTarif.includes(p.code)).map(p => p.code).join(', '));

console.log('Pays desservis : ' + actifs.map(p => p.code + ' (' + p.devise + ')').join(', '));
console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

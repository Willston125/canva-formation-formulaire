/* Aligne les sessions écrites dans formations-data.js sur celles de la feuille.
 *
 * POURQUOI CE FICHIER PORTE DES SESSIONS. La page s'affiche AVANT que la
 * feuille Google n'ait répondu — plusieurs secondes sur une première visite.
 * Pendant ce temps, ce sont ces valeurs-là qui s'affichent. Elles servent
 * aussi de repli quand l'API est injoignable, et au visiteur sans JavaScript.
 *
 * LE DÉFAUT QUE CELA A CAUSÉ. Le fichier annonçait « Canva Pro · 5 novembre
 * 2026 » quand la feuille portait le 10 octobre. La bannière du haut montrait
 * donc une date introuvable dans le tableau de bord, impossible à corriger.
 * La bannière se reconstruit désormais dès l'arrivée du catalogue, mais la
 * première seconde reste celle du fichier : autant qu'elle soit juste.
 *
 * À RELANCER après toute modification de session faite depuis le tableau de
 * bord, puis à redéployer :
 *     npm run sync:sessions
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const FICHIER = path.join(RACINE, 'formations-data.js');

/* L'ordre des champs du fichier est conservé, puis viennent ceux que la feuille
   ajoute. Un ordre stable rend les différences Git lisibles ; un ordre au gré
   de JSON.stringify rendrait chaque synchronisation illisible. */
const ORDRE = ['id', 'formId', 'startDate', 'endDate', 'schedule', 'duration',
  'location', 'mode', 'pays', 'price', 'currency', 'placesTotal',
  'placesAvailable', 'registrationOpen', 'parPays'];

const litteral = valeur => {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === 'string') return "'" + valeur.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  if (typeof valeur === 'object') {
    /* VIDE = PAS ÉCRIT. La feuille renvoie « parPays: [] » — un tableau, pas
       un objet — quand aucun réglage par pays n'a été saisi. Le site traite
       déjà un tableau comme « aucun réglage » : l'écrire n'encombrerait le
       fichier que d'une valeur sans effet. */
    if (!Object.keys(valeur).length) return null;
    /* Guillemets DOUBLES conservés, tels que JSON les produit. Les remplacer
       par des apostrophes pour coller au style du fichier casserait la
       première valeur contenant une apostrophe — « L'atelier » deviendrait
       'L'atelier', et tout le fichier de données cesserait de se charger. */
    return JSON.stringify(valeur);
  }
  return null;
};

function sessionEnTexte(session) {
  const lignes = [];
  for (const champ of ORDRE) {
    if (!(champ in session)) continue;
    const v = litteral(session[champ]);
    /* Un champ vide n'est pas écrit : `currency: null` dans le fichier
       vaudrait une devise absente déclarée, là où son absence laisse la
       valeur du pays faire foi. */
    if (v === null || v === "''" || v === '{}') continue;
    lignes.push('    ' + champ + ': ' + v);
  }
  return '  Object.freeze({\n' + lignes.join(',\n') + '\n  })';
}

/* Exporté pour l’épreuve : elle vérifie la mise en forme sans rien
   télécharger ni réécrire. */
module.exports = { litteral, sessionEnTexte, ORDRE };
if (require.main !== module) return;

(async () => {
  const source = fs.readFileSync(FICHIER, 'utf8');

  const point = (/SITE_ENDPOINTS[\s\S]{0,400}?registration:\s*'([^']+)'/.exec(source) || [])[1]
    || (/https:\/\/script\.google\.com\/macros\/[^'"]+/.exec(source) || [])[0];
  if (!point) { console.error('Point de terminaison introuvable dans formations-data.js.'); process.exit(1); }

  let catalogue;
  try {
    const reponse = await fetch(point + (point.includes('?') ? '&' : '?') + 'action=catalogue');
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
    catalogue = JSON.parse(await reponse.text());
  } catch (e) {
    console.error('Feuille injoignable : ' + e.message + '\nRien n’a été modifié.');
    process.exit(1);
  }

  const sessions = Array.isArray(catalogue.sessions) ? catalogue.sessions : [];

  /* REFUS DE TOUT EFFACER. Une feuille momentanément vide, un script Google
     redéployé de travers, une réponse tronquée : écrire une liste vide
     priverait le site de tout repli, et l'on ne s'en apercevrait qu'à la
     prochaine panne de l'API — c'est-à-dire au pire moment. */
  if (!sessions.length) {
    console.error('La feuille ne renvoie aucune session. Rien n’a été modifié.');
    process.exit(1);
  }
  const incompletes = sessions.filter(s => !s || !s.id || !s.formId || !s.startDate);
  if (incompletes.length) {
    console.error(incompletes.length + ' session(s) sans identifiant ni date. Rien n’a été modifié.');
    process.exit(1);
  }

  const debut = source.indexOf('window.SESSIONS = Object.freeze([');
  const fin = source.indexOf('\n]);', debut);
  if (debut < 0 || fin < 0) { console.error('Bloc SESSIONS introuvable.'); process.exit(1); }

  const ancien = eval(source.slice(debut + 'window.SESSIONS = Object.freeze('.length, fin + 2));
  const parId = liste => Object.fromEntries(liste.map(s => [s.id, s]));
  const avant = parId(ancien), apres = parId(sessions);

  console.log('Sessions de la feuille : ' + sessions.length + ', du fichier : ' + ancien.length + '\n');
  for (const id of Object.keys(avant)) {
    if (!(id in apres)) console.log('  RETIRÉE   ' + id + ' (' + avant[id].startDate + ') — absente de la feuille');
  }
  for (const id of Object.keys(apres)) {
    if (!(id in avant)) { console.log('  AJOUTÉE   ' + id + ' (' + apres[id].startDate + ')'); continue; }
    const ecarts = ORDRE.filter(c => JSON.stringify(avant[id][c]) !== JSON.stringify(apres[id][c])
      && !(avant[id][c] === undefined && (apres[id][c] === null || apres[id][c] === '')));
    if (ecarts.length) console.log('  MODIFIÉE  ' + id + ' → ' + ecarts.join(', '));
  }

  const bloc = 'window.SESSIONS = Object.freeze([\n'
    + sessions.map(sessionEnTexte).join(',\n') + '\n]);';
  const nouveau = source.slice(0, debut) + bloc + source.slice(fin + 4);

  if (nouveau === source) { console.log('\nLe fichier était déjà aligné.'); return; }
  fs.writeFileSync(FICHIER, nouveau);
  console.log('\nformations-data.js aligné sur la feuille.');
})();

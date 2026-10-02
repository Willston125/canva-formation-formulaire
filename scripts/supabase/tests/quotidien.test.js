/* La tâche quotidienne : une sauvegarde par e-mail, et l'écriture qui garde
 * le projet gratuit éveillé.
 *
 * Elle est appelable de l'extérieur (Vercel la déclenche par une simple
 * adresse) : on éprouve donc aussi qu'on ne peut pas s'en servir pour remplir
 * la boîte e-mail ni épuiser le quota de Resend. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerTache, TABLES } = require('../../../api/quotidien.js');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

async function lancer(tache, entetes = {}) {
  const res = { statusCode: 200, corps: '', setHeader() {}, end(c) { this.corps = c; } };
  await tache({ method: 'GET', url: '/api/quotidien', headers: entetes }, res);
  return { statut: res.statusCode, json: JSON.parse(res.corps || '{}') };
}

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  await db.exec(`insert into inscriptions (form_id, nom, telephone, statut) values ('canva-pro', 'Awa', '3212345', 'Confirmé')`);

  let heure = new Date('2026-10-04T03:00:00Z');
  const envois = [];
  let reponseResend = { envoye: true, erreur: null };
  const tache = creerTache(() => db, {
    envoyer: async m => { envois.push(m); return reponseResend; },
    maintenant: () => heure
  });
  const lignes = async () => (await db.query('select * from sauvegardes order by id')).rows;

  // --------------------------------------------- 1. La première sauvegarde ---

  const premiere = await lancer(tache);
  verifier('la sauvegarde part', [premiere.statut, premiere.json.envoyee], [200, true]);
  verifier('un seul e-mail', envois.length, 1);
  verifier('daté du jour', envois[0].sujet, 'Sauvegarde IMPACTALI du 2026-10-04');
  const piece = envois[0].piecesJointes && envois[0].piecesJointes[0];
  verifier('avec la copie en pièce jointe', piece && piece.filename, 'impactali-sauvegarde-2026-10-04.json');
  const copie = JSON.parse(Buffer.from(piece.content, 'base64').toString('utf8'));
  verifier('la copie contient chaque table', Object.keys(copie.tables), TABLES);
  verifier('les inscriptions comprises', copie.tables.inscriptions.length, 1);
  verifier('et tout le catalogue', copie.tables.formations.length, 5);
  /* L'écriture qui empêche Supabase de mettre le projet gratuit en pause. */
  const apres = await lignes();
  verifier('une ligne est ÉCRITE dans sauvegardes', apres.length, 1);
  verifier('elle dit la taille et la réussite', [apres[0].envoyee, apres[0].octets > 1000], [true, true]);

  // ------------------------------- 2. On ne peut pas s'en servir pour spammer ---

  heure = new Date('2026-10-04T15:00:00Z');                        // 12 h plus tard
  const relance = await lancer(tache);
  verifier('relancée 12 h après : rien ne repart', [relance.json.deja, envois.length], [true, 1]);
  for (let i = 0; i < 20; i++) await lancer(tache);
  verifier('vingt appels de plus : toujours un seul e-mail', envois.length, 1);
  verifier('et aucune ligne de plus', (await lignes()).length, 1);

  heure = new Date('2026-10-05T03:00:00Z');                        // le lendemain
  verifier('le lendemain, elle repart', (await lancer(tache)).json.envoyee, true);
  verifier('deux e-mails en deux jours', envois.length, 2);

  // --------------------------------------- 3. Un envoi raté garde la base éveillée ---

  reponseResend = { envoye: false, erreur: 'Resend 429 daily quota exceeded' };
  heure = new Date('2026-10-06T03:00:00Z');
  const ratee = await lancer(tache);
  verifier('envoi refusé par Resend : la tâche le dit', ratee.json.envoyee, false);
  const derniere = (await lignes()).pop();
  verifier('mais la ligne est écrite quand même', [derniere.envoyee, /429/.test(derniere.erreur)], [false, true]);
  heure = new Date('2026-10-06T03:30:00Z');
  verifier('une nouvelle tentative attend une heure', (await lancer(tache)).json.deja, true);
  heure = new Date('2026-10-06T04:30:00Z');
  reponseResend = { envoye: true, erreur: null };
  verifier('après une heure, elle réessaie', (await lancer(tache)).json.envoyee, true);

  // -------------------------------------------------- 4. Le secret de Vercel ---

  process.env.CRON_SECRET = 'secret-des-epreuves';
  heure = new Date('2026-10-08T03:00:00Z');
  verifier('avec CRON_SECRET, un inconnu est refusé', (await lancer(tache)).statut, 401);
  verifier('Vercel, qui présente le secret, passe',
    (await lancer(tache, { authorization: 'Bearer secret-des-epreuves' })).json.envoyee, true);
  delete process.env.CRON_SECRET;

  // ------------------------------------------------------- 5. Base en panne ---

  const enPanne = creerTache(() => ({ query: async () => { throw Object.assign(new Error('connexion SECRETE refusée'), { code: 'ECONNREFUSED' }); } }));
  const panne = await lancer(enPanne);
  verifier('base en panne : 503 au message générique', [panne.statut, panne.json.erreur], [503, 'Service momentanément indisponible.']);
  verifier('sans rien de l’erreur interne', JSON.stringify(panne.json).includes('SECRETE'), false);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

/* La tâche quotidienne : une sauvegarde par e-mail, qui garde aussi la base éveillée.
 *
 * L'offre gratuite de Supabase n'a AUCUNE sauvegarde, et elle met en pause un
 * projet resté une semaine sans activité. Cette tâche traite les deux :
 * 1. elle exporte toutes les tables et envoie la copie, en pièce jointe, à
 *    infos@impactali.site ;
 * 2. elle ÉCRIT une ligne dans `sauvegardes` — une écriture est l'activité que
 *    Supabase ne peut pas ignorer.
 *
 * Vercel la lance une fois par jour (vercel.json, « crons »). Si CRON_SECRET
 * est réglée dans Vercel, seul Vercel peut la lancer. Sans elle, n'importe qui
 * peut l'appeler, mais sans effet : une sauvegarde réussie n'est refaite
 * qu'après 20 heures, une tentative ratée qu'après une heure, et la copie part
 * toujours à la même adresse. */
'use strict';

const { base } = require('./_lib/base');
const { envoyer: envoyerCourriel } = require('./_lib/courriel');

const TABLES = ['pays', 'moyens_paiement', 'formations', 'formation_tarifs', 'sessions', 'session_pays',
  'realisations', 'reglages', 'textes', 'visuels', 'inscriptions', 'journal', 'sauvegardes', 'photos', 'mesures',
  'annonces', 'annonces_mesures'];

/* Les photos ne partent pas dans l'e-mail : quelques centaines de Ko chacune,
   chaque jour, la copie dépasserait vite ce qu'un e-mail transporte. La copie
   en donne la LISTE (nom, poids, origine) ; les photos elles-mêmes restent dans
   la base, et leurs originaux chez le propriétaire. */
const LECTURES = {
  photos: 'select id, type, octet_length(octets) as poids, nom, origine, creee_le from photos'
};
const APRES_REUSSITE_H = 20;
const APRES_ECHEC_H = 1;

function repondre(res, statut, donnees) {
  res.statusCode = statut;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(donnees));
}

function creerTache(obtenirBase, { envoyer = envoyerCourriel, maintenant = () => new Date() } = {}) {
  return async function tache(req, res) {
    const secret = process.env.CRON_SECRET;
    if (secret && (req.headers || {}).authorization !== 'Bearer ' + secret) {
      return repondre(res, 401, { ok: false });
    }
    try {
      const db = obtenirBase();
      const { rows: [dernieres] } = await db.query(
        `select max(faite_le) filter (where envoyee) as reussie, max(faite_le) as tentee from sauvegardes`);
      const depuis = d => (d ? (maintenant().getTime() - new Date(d).getTime()) / 3600e3 : Infinity);
      if (depuis(dernieres.reussie) < APRES_REUSSITE_H || depuis(dernieres.tentee) < APRES_ECHEC_H) {
        return repondre(res, 200, { ok: true, deja: true });
      }

      const tables = {};
      /* Une table illisible — absente, par exemple, tant qu'une migration n'a pas
         été collée dans Supabase — ne doit pas tout arrêter : sans la ligne
         écrite plus bas, le projet gratuit se mettrait en pause. On copie le
         reste, et on le dit. */
      const illisibles = {};
      for (const t of TABLES) {
        try { tables[t] = (await db.query(LECTURES[t] || `select * from ${t}`)).rows; }
        catch (e) { tables[t] = []; illisibles[t] = String((e && e.code) || 'erreur'); }
      }
      const jour = maintenant().toISOString().slice(0, 10);
      const contenu = JSON.stringify({ projet: 'IMPACTALI', faite_le: maintenant().toISOString(), tables });
      const octets = Buffer.byteLength(contenu);
      const resume = TABLES.map(t => `${t} : ` + (illisibles[t] ? `ILLISIBLE (${illisibles[t]})` : tables[t].length)).join('\n');

      const envoi = await envoyer({
        sujet: 'Sauvegarde IMPACTALI du ' + jour,
        texte: 'Sauvegarde quotidienne de la base du site, en pièce jointe (' + Math.ceil(octets / 1024) + ' Ko).\n\n'
          + resume + '\n\nLes photos y sont listées, mais pas jointes : elles restent dans la base.'
          + '\n\nElle contient les inscriptions, donc des données personnelles : '
          + 'gardez-la dans cette boîte, ne la transférez pas.',
        piecesJointes: [{ filename: 'impactali-sauvegarde-' + jour + '.json', content: Buffer.from(contenu).toString('base64') }]
      });

      /* L'écriture qui garde le projet éveillé — faite même si l'envoi a échoué.
         L'heure est celle de la TÂCHE, qui la relit pour son délai de 20 heures :
         une seule horloge, sinon le délai se mesurerait entre deux montres. */
      await db.query('insert into sauvegardes (faite_le, octets, envoyee, erreur) values ($1, $2, $3, $4)',
        [maintenant().toISOString(), octets, envoi.envoye, envoi.erreur ? String(envoi.erreur).slice(0, 300) : null]);
      if (!envoi.envoye) console.error('[quotidien] envoi :', envoi.erreur);
      return repondre(res, 200, { ok: envoi.envoye, octets, envoyee: envoi.envoye });
    } catch (e) {
      console.error('[quotidien]', (e && e.code) || '', e && e.message);
      return repondre(res, 503, { ok: false, erreur: 'Service momentanément indisponible.' });
    }
  };
}

module.exports = creerTache(base);
module.exports.creerTache = creerTache;
module.exports.TABLES = TABLES;

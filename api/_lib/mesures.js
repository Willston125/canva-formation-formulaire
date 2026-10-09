/* Mesure d'audience : l'entonnoir d'inscription, compté jour par jour.
 *
 * ÉCRITURE — ouverte à tous, comme le formulaire. Le site envoie un signal
 * léger à chaque étape du parcours ({ mesure, formation, pays }) ; l'API
 * ajoute 1 au compteur du jour. Rien n'identifie le visiteur : la table ne
 * garde que des totaux (supabase/migrations/20261009120000_mesures.sql).
 *
 * Ce qui est fermé :
 * - seules les étapes de la liste passent, et seulement pour une formation et
 *   un pays qui existent dans la base — on ne fabrique pas de lignes au hasard ;
 * - une même connexion est bornée. Large : aux Comores, beaucoup de téléphones
 *   sortent par l'adresse de l'opérateur. Le plafond arrête une boucle, pas un
 *   visiteur pressé. Il vit en mémoire de l'instance : ce n'est pas un rempart,
 *   et des compteurs gonflés à la main restent possibles — ils ne coûtent rien
 *   qu'un chiffre faux, que les inscriptions réelles permettent de recouper.
 *
 * LECTURE — réservée au tableau de bord (commande « admin.audience »). */
'use strict';

const crypto = require('crypto');

/* La même liste que la contrainte de la table : une étape ajoutée d'un seul
   côté serait refusée par la base, ou jamais envoyée. Une épreuve les compare. */
const EVENEMENTS = ['fiche_vue', 'formulaire_commence', 'etape_2', 'etape_3', 'etape_4',
  'inscription_envoyee', 'preuve_whatsapp', 'contact_whatsapp'];

/* Les annonces ont leur table (annonces_mesures) : le site envoie « annonce_vue »,
   la table range « vue ». Même règle : une épreuve compare les deux listes. */
const EVENEMENTS_ANNONCE = { annonce_vue: 'vue', annonce_clic: 'clic', annonce_fermee: 'fermee' };
const FORMAT_ANNONCE = /^[a-z0-9-]{1,60}$/;

const FORMAT_FORMATION = /^[a-z0-9-]{0,60}$/;
const FORMAT_PAYS = /^([A-Z]{2})?$/;
/* Un signal tient en une centaine d'octets : au-delà, ce n'en est pas un. */
const TAILLE_MAX_MESURE = 300;
const PAR_CONNEXION = 300;
const FENETRE_MS = 10 * 60 * 1000;

const empreinte = (ip, sel) => crypto.createHmac('sha256', String(sel)).update(String(ip || '')).digest('hex').slice(0, 32);

/* Connexion → { n, jusqua }. Borné à quelques milliers d'entrées : une
   instance de fonction ne vit pas assez longtemps pour en voir davantage. */
const connexions = new Map();
function depasse(cle, maintenant) {
  const c = connexions.get(cle);
  if (!c || c.jusqua <= maintenant) {
    connexions.set(cle, { n: 1, jusqua: maintenant + FENETRE_MS });
    if (connexions.size > 5000) connexions.delete(connexions.keys().next().value);
    return false;
  }
  c.n++;
  return c.n > PAR_CONNEXION;
}

/** La mesure lisible dans ce qui est arrivé, ou null si ce n'en est pas une. */
function lireMesure(charge) {
  if (!charge || typeof charge !== 'object' || Array.isArray(charge)) return null;
  const { mesure, formation = '', pays = '', annonce } = charge;
  if (typeof pays !== 'string' || !FORMAT_PAYS.test(pays)) return null;
  if (typeof mesure === 'string' && Object.prototype.hasOwnProperty.call(EVENEMENTS_ANNONCE, mesure)) {
    if (typeof annonce !== 'string' || !FORMAT_ANNONCE.test(annonce)) return null;
    return { evenement: EVENEMENTS_ANNONCE[mesure], annonce, pays };
  }
  if (typeof mesure !== 'string' || EVENEMENTS.indexOf(mesure) < 0) return null;
  if (typeof formation !== 'string' || !FORMAT_FORMATION.test(formation)) return null;
  return { evenement: mesure, formation, pays };
}

/**
 * Compte une étape. Rend true si un compteur a bougé, false si le signal a
 * été écarté (illisible, inconnu, plafond atteint). Le site n'attend pas la
 * réponse : il ne doit jamais ralentir pour une mesure.
 */
async function recevoirMesure(db, charge, { ip = '', sel = 'local', maintenant = Date.now } = {}) {
  const m = lireMesure(charge);
  if (!m) return false;
  if (depasse(empreinte(ip, sel), maintenant())) return false;

  // Une annonce : même principe, sa propre table. Elle doit exister, le pays aussi.
  if (m.annonce) {
    const { rows } = await db.query(
      `insert into annonces_mesures (jour, annonce, evenement, pays)
         select (now() at time zone 'UTC' + interval '3 hours')::date, $1, $2, $3
          where exists (select 1 from annonces where id = $1)
            and ($3 = '' or exists (select 1 from pays where code = $3))
       on conflict (jour, annonce, evenement, pays)
         do update set n = annonces_mesures.n + 1, derniere = now()
       returning n`, [m.annonce, m.evenement, m.pays]);
    return rows.length > 0;
  }

  /* Un seul ordre, atomique : deux visiteurs au même instant ajoutent chacun
     leur 1, aucun n'écrase l'autre. La formation et le pays doivent exister —
     sinon rien n'est écrit. Le jour est celui de Moroni et de Djibouti. */
  const { rows } = await db.query(
    `insert into mesures (jour, evenement, formation, pays)
       select (now() at time zone 'UTC' + interval '3 hours')::date, $1, $2, $3
        where ($2 = '' or exists (select 1 from formations where form_id = $2))
          and ($3 = '' or exists (select 1 from pays where code = $3))
     on conflict (jour, evenement, formation, pays)
       do update set n = mesures.n + 1, derniere = now()
     returning n`, [m.evenement, m.formation, m.pays]);
  return rows.length > 0;
}

/**
 * Les compteurs d'une période, pour l'onglet « Audience ».
 * Totaux par étape, formation et pays sur les `jours` derniers jours (aujourd'hui
 * compris), et l'heure de la dernière mesure reçue, toutes périodes confondues.
 */
async function lireAudience(db, jours) {
  const n = [7, 30, 90, 365].indexOf(Number(jours)) >= 0 ? Number(jours) : 30;
  const { rows } = await db.query(
    `select evenement, formation, pays, sum(n)::int as n
       from mesures
      where jour > (now() at time zone 'UTC' + interval '3 hours')::date - $1::int
      group by evenement, formation, pays`, [n]);
  const dernier = await db.query('select max(derniere) as d from mesures');
  const d = dernier.rows[0] && dernier.rows[0].d;
  return { ok: true, jours: n, lignes: rows, derniere: d ? new Date(d).toISOString() : null };
}

/**
 * Les compteurs des annonces sur une période, pour l'onglet « Annonces » :
 * totaux par annonce, événement et pays. Mêmes périodes que l'audience.
 */
async function lireMesuresAnnonces(db, jours) {
  const n = [7, 30, 90, 365].indexOf(Number(jours)) >= 0 ? Number(jours) : 30;
  const { rows } = await db.query(
    `select annonce, evenement, pays, sum(n)::int as n
       from annonces_mesures
      where jour > (now() at time zone 'UTC' + interval '3 hours')::date - $1::int
      group by annonce, evenement, pays`, [n]);
  return { ok: true, jours: n, lignes: rows };
}

const MESURES = {
  'admin.audience': async (db, d) => lireAudience(db, d.jours),
  'admin.annonces.mesures': async (db, d) => lireMesuresAnnonces(db, d.jours)
};

module.exports = {
  EVENEMENTS, EVENEMENTS_ANNONCE, TAILLE_MAX_MESURE, lireMesure, recevoirMesure, lireAudience, lireMesuresAnnonces, MESURES
};

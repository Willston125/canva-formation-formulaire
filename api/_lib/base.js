/* La connexion à la base, pour les fonctions de l'API.
 *
 * DATABASE_URL est saisie par le propriétaire dans Vercel (Environment
 * Variables) : l'adresse « Transaction pooler » de Supabase, mot de passe
 * compris. Elle n'est JAMAIS dans le dépôt, qui est public.
 *
 * Le chiffrement est VÉRIFIÉ. Le certificat présenté par Supabase doit
 * descendre de sa racine publique (supabase-ca-2021.crt). Sans cette
 * vérification, la connexion serait chiffrée, mais n'importe quel
 * intermédiaire pourrait se faire passer pour la base et lire les
 * inscriptions au passage.
 *
 * Un seul client par instance de fonction : Vercel garde une instance chaude
 * d'un appel à l'autre, et l'accès groupé de Supabase (port 6543) répartit
 * les connexions entre toutes les instances. */
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const RACINE_SUPABASE = fs.readFileSync(path.join(__dirname, 'supabase-ca-2021.crt'), 'utf8');

let groupe = null;

function base() {
  if (groupe) return groupe;
  const adresse = process.env.DATABASE_URL;
  if (!adresse) throw Object.assign(new Error('DATABASE_URL absente'), { code: 'SANS_ADRESSE' });

  /* Un « sslmode » dans l'adresse prendrait le pas sur le réglage ci-dessous,
     et certains le traduisent en « chiffré mais non vérifié ». On le retire :
     le chiffrement se règle ici, et une seule fois. */
  const url = new URL(adresse);
  url.searchParams.delete('sslmode');

  groupe = new Pool({
    connectionString: url.toString(),
    ssl: { ca: RACINE_SUPABASE, rejectUnauthorized: true },
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  });
  // Un client perdu en route (base relancée, réseau coupé) : on en refera un
  groupe.on('error', () => { groupe = null; });
  return groupe;
}

module.exports = { base, RACINE_SUPABASE };

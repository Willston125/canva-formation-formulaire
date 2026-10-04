-- IMPACTALI — les photos du tableau de bord, rangées dans la base
--
-- Elles étaient dans Google Drive. Elles vont ici plutôt que dans Supabase
-- Storage : dépasser les 5 Go de bande passante gratuite de Storage bloquerait
-- tout le projet, inscriptions comprises. Rangées dans la base, elles sont
-- servies par l'API (/api?photo=…) et gardées en cache par le réseau de Vercel,
-- qui en offre 100 Go : chaque photo ne sort de la base qu'une fois.
--
-- Même règle d'accès que le reste : RLS activée, aucune règle, aucun droit pour
-- le navigateur. Seule l'API lit et écrit.

begin;

create table photos (
  id       uuid primary key default gen_random_uuid(),
  -- Les trois formats que prépare le tableau de bord. Un SVG ou un HTML, eux,
  -- pourraient porter du code : ils ne passent pas.
  type     text not null check (type in ('image/webp', 'image/jpeg', 'image/png')),
  octets   bytea not null check (octet_length(octets) between 1 and 3145728),
  nom      text,                                   -- nom du fichier d'origine, pour s'y retrouver
  origine  text unique,                            -- adresse Google Drive d'où elle a été rapatriée
  creee_le timestamptz not null default now()
);
comment on table photos is 'Photos téléversées depuis le tableau de bord, servies par /api?photo=…';

alter table photos enable row level security;
revoke all on photos from anon, authenticated;

commit;

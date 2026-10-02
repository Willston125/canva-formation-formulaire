-- IMPACTALI — schéma de la base (Supabase / Postgres)
--
-- Remplace les onglets de la feuille Google. Plan :
-- docs/superpowers/plans/2026-10-02-migration-supabase.md
--
-- LA RÈGLE D'ACCÈS. Seule l'API du site (/api, fonctions Vercel) parle à cette
-- base, avec la connexion du propriétaire. Toutes les tables ont la RLS activée
-- et AUCUNE règle : avec la clé publique de Supabase, un navigateur ne lit ni
-- n'écrit rien. Les droits des rôles `anon` et `authenticated` sont en plus
-- retirés, pour que rien ne s'ouvre même si la RLS était coupée par erreur.
--
-- LES RÈGLES MÉTIER vivent ici quand une base sait les tenir : ce que la feuille
-- ne pouvait pas faire (statut forgé, session impossible, lien « javascript: »,
-- deux pays par défaut…) devient impossible à enregistrer, quel que soit le
-- chemin d'écriture.

begin;

-- ---------------------------------------------------------------- PAYS ----

create table pays (
  code               text primary key check (code ~ '^[A-Z]{2}$'),
  nom                text not null check (nom <> ''),
  devise             text not null check (devise <> ''),          -- telle qu'affichée : KMF, FDJ…
  indicatif          text not null check (indicatif ~ '^\+[0-9]{1,4}$'),
  motif_telephone    text,                                         -- expression régulière, vérifiée par l'API
  aide_telephone     text,
  exemple_telephone  text,
  longueur_telephone smallint check (longueur_telephone between 4 and 15),
  defaut             boolean not null default false,
  active             boolean not null default true,
  ordre              integer,                                      -- vide = en fin de liste
  whatsapp_number    text check (whatsapp_number ~ '^[0-9]{6,15}$'),
  whatsapp_display   text,
  fuseaux            jsonb not null default '[]' check (jsonb_typeof(fuseaux) = 'array'),
  regions            jsonb not null default '[]' check (jsonb_typeof(regions) = 'array')
);
comment on table pays is 'Marchés desservis : devise, indicatif, format des numéros, contact local.';

-- Un seul pays par défaut (zéro est permis : le site prend alors le premier ouvert).
create unique index pays_un_seul_defaut on pays (defaut) where defaut;

/* Les moyens de paiement étaient une liste JSON dans une cellule. Ils ont leur
   table parce qu'un numéro de paiement est ce qu'un intrus modifierait en
   premier : chaque changement passe par l'API, qui le journalise et prévient
   par e-mail. */
create table moyens_paiement (
  id           bigint generated always as identity primary key,
  pays_code    text not null references pays (code) on update cascade on delete cascade,
  ordre        integer not null default 0,
  kind         text not null check (kind in ('mobile', 'cash')),
  label        text not null check (label <> ''),
  value        text not null check (value <> ''),                 -- ce que reçoit modePaiement
  number_label text,
  number       text,
  account_name text,
  recipient    text,                                              -- espèces : à qui remettre
  place        text,                                              -- espèces : où
  phone        text,                                              -- espèces : qui appeler
  image        text check (image is null or image = '' or image ~ '^(/[^/]|https://)'),
  check (kind <> 'mobile' or coalesce(number, '') <> '')
);
create index moyens_paiement_pays on moyens_paiement (pays_code, ordre);
comment on table moyens_paiement is 'Comment payer, pays par pays. Toute modification est journalisée.';

-- ---------------------------------------------------------- FORMATIONS ----

create table formations (
  id                                 text primary key check (id <> ''),
  form_id                            text not null unique check (form_id ~ '^[a-z0-9-]+$'),
  slug                               text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title                              text not null check (title <> ''),
  short_title                        text,
  category                           text,
  family                             text,
  promise                            text,
  short_description                  text,
  image                              text check (image is null or image ~ '^(/[^/]|https://)'),
  image_alt                          text,
  poster                             text check (poster is null or poster ~ '^(/[^/]|https://)'),
  duration                           text,
  level                              text,
  mode                               text,
  price                              integer check (price > 0),   -- ancien tarif unique : repli du pays par défaut
  modules                            smallint check (modules >= 0),
  learnings                          jsonb not null default '[]' check (jsonb_typeof(learnings) = 'array'),
  objectives                         jsonb not null default '[]' check (jsonb_typeof(objectives) = 'array'),
  programme                          jsonb check (programme is null or jsonb_typeof(programme) = 'object'),
  faq                                jsonb not null default '[]' check (jsonb_typeof(faq) = 'array'),
  prerequis                          jsonb not null default '[]' check (jsonb_typeof(prerequis) = 'array'),
  featured                           boolean not null default false,
  registration_open                  boolean not null default false,  -- vide = fermé, comme le lit le site
  active                             boolean not null default true,
  allow_registration_without_session boolean not null default false,
  has_detail_page                    boolean not null default false,
  -- Le lien d'une formation ne mène qu'à une page du site (audit T2 : un
  -- « javascript: » y exécutait du code chez chaque visiteur).
  href                               text check (href is null or href ~ '^/(formations/[a-z0-9-]+/|inscription/)'),
  lead                               text,
  level_subject                      text,
  ordre                              integer                      -- vide = en fin de liste
);
comment on table formations is 'Le catalogue. form_id est l''identifiant que portent les sessions et les inscriptions.';

/* Un tarif par pays, saisi à la main, jamais converti. Absent = « À confirmer ». */
create table formation_tarifs (
  formation_id text not null references formations (id) on update cascade on delete cascade,
  pays_code    text not null references pays (code) on update cascade on delete cascade,
  montant      integer not null check (montant > 0),
  primary key (formation_id, pays_code)
);
comment on table formation_tarifs is 'Tarif d''une formation dans un pays. Aucune conversion de devise.';

-- ------------------------------------------------------------ SESSIONS ----

/* Combien de jours de cours tombent entre deux dates, pour des jours de la
   semaine donnés (1 = lundi … 7 = dimanche).

   L'audit du 2 octobre 2026 a trouvé quatre sessions sur cinq qui annonçaient
   plus de séances que le calendrier n'en permet — « 12 séances, mardi et
   vendredi, du 6 au 13 octobre » : il n'y en a que 3. La règle ci-dessous rend
   une telle session impossible à enregistrer. */
create function seances_possibles(debut date, fin date, jours smallint[])
returns integer
language plpgsql
immutable
set search_path = ''   -- n'appelle que des fonctions de base : rien à détourner
as $$
declare
  n integer := 0;
  d date := debut;
begin
  if debut is null or fin is null or jours is null then
    return null;
  end if;
  while d <= fin loop
    if extract(isodow from d)::smallint = any (jours) then
      n := n + 1;
    end if;
    d := d + 1;
  end loop;
  return n;
end
$$;

create table sessions (
  id                text primary key check (id ~ '^[a-z0-9-]+$'),
  form_id           text not null references formations (form_id) on update cascade on delete restrict,
  start_date        date not null,
  end_date          date,
  schedule          text,                                         -- horaires affichés
  duration          text,                                         -- durée affichée
  jours             smallint[] not null default '{}'
                    check (jours <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  seances           smallint check (seances > 0),
  places_total      smallint check (places_total >= 0),
  registration_open boolean not null default false,  -- vide = fermé, comme le lit le site
  -- Valeurs de la session, qui servent de repli quand un pays n'a pas les siennes
  mode              text check (mode is null or mode in ('Présentiel', 'En ligne', 'Hybride')),
  location          text,
  price             integer check (price > 0),
  currency          text,
  check (end_date is null or end_date >= start_date),
  -- Un nombre de séances se vérifie : il faut alors les jours et la date de fin…
  check (seances is null or (end_date is not null and cardinality(jours) > 0)),
  -- … et le calendrier doit pouvoir les contenir.
  check (seances is null or seances <= seances_possibles(start_date, end_date, jours))
);
create index sessions_formation on sessions (form_id, start_date);
comment on table sessions is 'Dates de formation. Une session impossible (plus de séances que de jours de cours) est refusée.';

/* Les pays d'une session, avec ce qui leur est propre (mode, lieu, tarif ; vide
   = la valeur de la session).

   `propose` dit si la session est PROPOSÉE dans ce pays. Aucune ligne proposée =
   proposée partout, comme une colonne « pays » vide dans la feuille. Une ligne
   non proposée ne porte que des réglages : c'est le cas d'une session en ligne
   ouverte à tous, mais à un tarif différent selon le pays. */
create table session_pays (
  session_id text not null references sessions (id) on update cascade on delete cascade,
  pays_code  text not null references pays (code) on update cascade on delete cascade,
  propose    boolean not null default true,
  ordre      smallint not null default 0,
  mode       text check (mode is null or mode in ('Présentiel', 'En ligne', 'Hybride')),
  lieu       text,
  tarif      integer check (tarif > 0),
  primary key (session_id, pays_code),
  check (propose or mode is not null or lieu is not null or tarif is not null)
);
comment on table session_pays is 'Pays d''une session : mode, lieu et tarif propres à chacun.';

-- ----------------------------------------------------- CONTENU DU SITE ----

create table realisations (
  id             text primary key check (id <> ''),
  category       text,
  title          text not null check (title <> ''),
  description    text,
  image          text check (image is null or image = '' or image ~ '^(/[^/]|https://)'),
  image_alt      text,
  -- Deux pourcentages, rien d'autre (audit T4 : un « ; » ajoutait n'importe quel style)
  image_position text check (image_position is null or image_position ~ '^[0-9]{1,3}% [0-9]{1,3}%$'),
  href           text check (href is null or href = '' or href ~ '^(/[^/]|https?://)'),
  video          text check (video is null or video = '' or video ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'),
  ordre          integer                                          -- vide = en fin de liste
);
comment on table realisations is 'Portfolio de l''accueil.';

create table reglages (
  cle    text primary key check (cle ~ '^[A-Za-z0-9._-]+$'),
  valeur jsonb not null
);
comment on table reglages is 'Réglages du site (contact WhatsApp, lieu habituel…).';

create table textes (
  cle    text primary key check (cle ~ '^[A-Za-z0-9._-]+$'),
  valeur text not null
);
comment on table textes is 'Textes modifiables du site. Une clé absente rend le texte d''origine de la page.';

/* Le cadrage est facultatif, et entier ou absent. Absent, la page garde le
   cadrage prévu par sa feuille de style pour cet emplacement : un cadrage
   « neutre » par défaut le remplacerait, et décalerait la photo. */
create table visuels (
  cle        text primary key check (cle ~ '^[A-Za-z0-9._-]+$'),
  url        text not null check (url ~ '^(/[^/]|https://)'),
  position_x smallint check (position_x between 0 and 100),
  position_y smallint check (position_y between 0 and 100),
  zoom       smallint check (zoom between 100 and 250),
  check ((position_x is null) = (position_y is null) and (position_y is null) = (zoom is null))
);
comment on table visuels is 'Photos remplacées depuis le tableau de bord, et leur cadrage.';

-- -------------------------------------------------------- INSCRIPTIONS ----

/* Une inscription est un fait daté : elle n'est jamais rejetée parce qu'une
   formation ou une session a disparu depuis. Les identifiants ne sont donc PAS
   des clés étrangères ; l'API vérifie qu'ils existent au moment de l'envoi. */
create table inscriptions (
  id                      uuid primary key default gen_random_uuid(),
  recue_le                timestamptz not null default now(),
  date_inscription        text,
  form_id                 text not null check (form_id <> ''),
  formation_title         text,
  session_id              text,
  session_label           text,
  session_start_date      text,
  nom                     text,
  prenom                  text,
  telephone               text,
  telephone_international text,
  email                   text,
  age                     smallint check (age between 0 and 120),
  profession              text,
  profession_detail       text,
  niveau                  text,
  objectifs               text,
  motivation              text,
  mode_paiement           text,
  tel_paiement            text,
  montant                 integer check (montant >= 0),
  devise                  text,
  pays                    text,
  pays_code               text,
  -- Le statut ne se choisit pas en s'inscrivant (audit S1) : « En attente »,
  -- puis le tableau de bord seul le fait avancer.
  statut                  text not null default 'En attente'
                          check (statut in ('En attente', 'Confirmé', 'Payé', 'Annulé')),
  source                  text,
  page_url                text,
  empreinte_ip            text,                                    -- empreinte salée, jamais l'adresse
  charge                  jsonb not null default '{}' check (jsonb_typeof(charge) = 'object'),
  check (coalesce(nom, '') <> '' or coalesce(prenom, '') <> '')
);
create index inscriptions_places on inscriptions (session_id, statut);
create index inscriptions_recentes on inscriptions (recue_le desc);
create index inscriptions_telephone on inscriptions (telephone_international, form_id, recue_le desc);
comment on table inscriptions is 'Candidatures reçues. Seules « Confirmé » et « Payé » occupent une place.';

-- --------------------------------------------------- SUIVI ET SÉCURITÉ ----

create table journal (
  id      bigint generated always as identity primary key,
  quand   timestamptz not null default now(),
  qui     text not null,                                           -- e-mail de l'administrateur, ou « site »
  action  text not null,
  cible   text,
  details jsonb not null default '{}'
);
create index journal_recent on journal (quand desc);
comment on table journal is 'Qui a fait quoi depuis le tableau de bord, et quand.';

/* Une ligne par sauvegarde quotidienne. C'est aussi l'ÉCRITURE qui empêche
   Supabase de mettre en pause un projet gratuit resté une semaine sans activité. */
create table sauvegardes (
  id       bigint generated always as identity primary key,
  faite_le timestamptz not null default now(),
  octets   integer not null check (octets >= 0),
  envoyee  boolean not null,
  erreur   text
);
comment on table sauvegardes is 'Sauvegardes quotidiennes envoyées par e-mail.';

-- ------------------------------------------------------ FERMER LA PORTE ----

alter table pays             enable row level security;
alter table moyens_paiement  enable row level security;
alter table formations       enable row level security;
alter table formation_tarifs enable row level security;
alter table sessions         enable row level security;
alter table session_pays     enable row level security;
alter table realisations     enable row level security;
alter table reglages         enable row level security;
alter table textes           enable row level security;
alter table visuels          enable row level security;
alter table inscriptions     enable row level security;
alter table journal          enable row level security;
alter table sauvegardes      enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function seances_possibles(date, date, smallint[]) from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

commit;

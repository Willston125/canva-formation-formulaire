-- IMPACTALI — annonces : la fenêtre qui s'ouvre à l'arrivée sur le site
--
-- Deux usages, une seule table :
-- - « promotion » : une formation d'IMPACTALI mise en avant (« À la une ») ;
-- - « partenaire » : la publicité d'un annonceur, toujours signalée comme telle.
--
-- Une annonce porte une affiche VERTICALE (téléphone, 1080 × 1350 conseillé)
-- et, si on l'a, une affiche LARGE pour les écrans d'ordinateur (1600 × 900).
-- Elle vise des pays, ou tous ; elle a ses dates et un interrupteur. Le serveur
-- ne l'envoie qu'aux visiteurs de ces pays, pendant ces dates
-- (api/_lib/marche.js) : une annonce faite pour Djibouti ne part jamais aux
-- Comores, comme le reste de l'offre.
--
-- Ses compteurs (affichée, cliquée, fermée) suivent la règle de la table
-- `mesures` : des totaux par jour, rien qui identifie un visiteur.
--
-- Même règle d'accès que le reste : RLS activée, aucune règle, aucun droit pour
-- le navigateur. Seule l'API lit et écrit.

begin;

create table annonces (
  id          text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
  type        text not null default 'promotion' check (type in ('promotion', 'partenaire')),
  titre       text not null check (btrim(titre) <> '' and length(titre) <= 120),
  -- Le nom de l'annonceur. Obligatoire pour un partenaire : une publicité doit
  -- être identifiable comme telle, et dire pour qui elle est faite.
  annonceur   text check (annonceur is null or length(annonceur) <= 80),
  image       text not null check (image ~ '^(/[^/]|https://)'),
  image_large text check (image_large is null or image_large = '' or image_large ~ '^(/[^/]|https://)'),
  image_alt   text check (image_alt is null or length(image_alt) <= 300),
  -- Où mène le bouton. Vide avec une formation : sa fiche. Vide sans formation : pas de bouton.
  lien        text check (lien is null or lien = '' or lien ~ '^(/[^/]|https?://)'),
  bouton      text check (bouton is null or length(bouton) <= 40),
  -- La formation mise en avant : l'annonce mène à sa fiche, et ne s'affiche pas sur cette fiche.
  -- Supprimer la formation supprime ses annonces : elles n'auraient plus rien à promouvoir.
  formation   text references formations (form_id) on update cascade on delete cascade,
  -- Les pays visés, en codes (« KM », « DJ »). Vide = tous les visiteurs, y compris hors marché.
  pays        text[] not null default '{}'
              check (array_to_string(pays, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  -- Jours de Moroni et de Djibouti (UTC+3), bornes comprises. Vides = sans limite.
  debut       date,
  fin         date,
  active      boolean not null default true,
  ordre       integer,                                             -- vide = en fin de liste
  check (fin is null or debut is null or fin >= debut),
  check (type <> 'partenaire' or coalesce(btrim(annonceur), '') <> '')
);
create index annonces_formation on annonces (formation);
comment on table annonces is 'Fenêtre d''annonce à l''arrivée sur le site : formations mises en avant et publicités de partenaires.';

create table annonces_mesures (
  -- Le jour aux Comores et à Djibouti (UTC+3, sans heure d'été)
  jour      date not null,
  annonce   text not null references annonces (id) on update cascade on delete cascade,
  -- La liste fermée : api/_lib/mesures.js porte la même
  evenement text not null check (evenement in ('vue', 'clic', 'fermee')),
  pays      text not null default '' check (pays ~ '^([A-Z]{2})?$'),
  n         integer not null default 1 check (n > 0),
  derniere  timestamptz not null default now(),
  primary key (jour, annonce, evenement, pays)
);
-- La suppression d'une annonce emporte ses compteurs : sans index, elle parcourrait toute la table
create index annonces_mesures_annonce on annonces_mesures (annonce, jour);
comment on table annonces_mesures is 'Compteurs anonymes des annonces, par jour : affichées, cliquées, fermées.';

alter table annonces         enable row level security;
alter table annonces_mesures enable row level security;
revoke all on annonces, annonces_mesures from anon, authenticated;

commit;

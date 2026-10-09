-- IMPACTALI — mesure d'audience : l'entonnoir d'inscription, en compteurs
--
-- Une ligne = un jour, une étape du parcours, une formation, un pays, et
-- combien de fois cette étape a été atteinte ce jour-là. Rien d'autre : ni
-- adresse, ni téléphone, ni identifiant de visiteur, ni cookie. On compte, on
-- ne suit personne. Un an de mesures tient en quelques dizaines de milliers de
-- lignes au plus (8 étapes × 6 formations × 3 pays × 365 jours).
--
-- Même règle d'accès que le reste : RLS activée, aucune règle, aucun droit pour
-- le navigateur. Seule l'API écrit (un compteur à la fois) et lit (pour le
-- tableau de bord, onglet « Audience »).

begin;

create table mesures (
  -- Le jour aux Comores et à Djibouti (UTC+3, sans heure d'été)
  jour      date not null,
  -- La liste fermée des étapes : api/_lib/mesures.js porte la même
  evenement text not null check (evenement in (
              'fiche_vue', 'formulaire_commence', 'etape_2', 'etape_3', 'etape_4',
              'inscription_envoyee', 'preuve_whatsapp', 'contact_whatsapp')),
  -- '' quand l'étape n'appartient à aucune formation (une question posée depuis l'accueil)
  formation text not null default '' check (formation ~ '^[a-z0-9-]{0,60}$'),
  pays      text not null default '' check (pays ~ '^([A-Z]{2})?$'),
  n         integer not null default 1 check (n > 0),
  -- La dernière mesure reçue : si elle date de plusieurs jours, le comptage est cassé
  derniere  timestamptz not null default now(),
  primary key (jour, evenement, formation, pays)
);
comment on table mesures is 'Compteurs anonymes de l''entonnoir d''inscription, par jour (onglet Audience du tableau de bord)';

alter table mesures enable row level security;
revoke all on mesures from anon, authenticated;

commit;

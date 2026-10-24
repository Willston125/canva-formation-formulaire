-- Cineworld Académie — les coordonnées de chaque pays, pour la page Contact
--
-- La page Contact montre au visiteur où trouver l'académie DANS SON PAYS :
-- l'adresse, les horaires d'accueil, un lien vers la carte. Comme tout ce qui
-- appartient à un pays, ces coordonnées passent par l'API filtrée
-- (api/_lib/marche.js) : un visiteur des Comores ne reçoit jamais l'adresse
-- de Djibouti, et inversement. Hors marché, la page ne montre que l'e-mail.
--
-- À coller dans Supabase (SQL Editor) AVANT de publier le code qui les lit :
-- l'API les sélectionne avec les autres colonnes du pays, et une colonne
-- absente ferait échouer tout le catalogue. Sans effet sur le site actuel.
-- Relançable : les colonnes ne sont ajoutées qu'une fois, et l'adresse de
-- Djibouti (celle du paiement en espèces) n'écrase pas une valeur déjà saisie.

begin;

alter table pays add column if not exists adresse text
  check (adresse is null or char_length(adresse) <= 200);
alter table pays add column if not exists horaires text
  check (horaires is null or char_length(horaires) <= 300);
alter table pays add column if not exists carte text
  check (carte is null or carte ~ '^https://');

comment on column pays.adresse is 'Où rencontrer l''académie dans ce pays (page Contact). Vide = non affichée.';
comment on column pays.horaires is 'Horaires d''accueil, une ligne par plage (page Contact). Vide = non affichés.';
comment on column pays.carte is 'Lien https:// vers la carte (Google Maps…) du lieu d''accueil. Vide = pas de bouton.';

update pays set adresse = 'Saalam Tower, 5ème étage, Djibouti-ville'
 where code = 'DJ' and adresse is null;

commit;

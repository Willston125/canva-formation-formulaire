-- Cineworld Académie — une accroche propre à chaque pays, en haut de l'accueil
--
-- Le 24/10/2026, IMPACTALI devient Cineworld Académie. Décision du
-- propriétaire : la signature « École de l'image » vaut pour tous les
-- visiteurs, et une ligne propre à un pays n'est vue que par les visiteurs de
-- ce pays. Comme tout ce qui appartient à un pays, elle passe par l'API
-- filtrée (api/_lib/marche.js) : jamais écrite dans une page.
--
-- À coller dans Supabase (SQL Editor) AVANT de publier le code qui la lit :
-- l'API la sélectionne avec les autres colonnes du pays, et une colonne
-- absente ferait échouer tout le catalogue. Sans effet sur le site actuel,
-- qui ne la lit pas. Relançable : la colonne n'est ajoutée qu'une fois, et
-- l'accroche de Djibouti n'écrase pas une valeur déjà saisie.

begin;

alter table pays add column if not exists accroche text
  check (accroche is null or char_length(accroche) <= 120);
comment on column pays.accroche is
  'Ligne affichée sous le nom de l''académie, en haut de l''accueil, aux seuls visiteurs de ce pays. Vide = rien.';

update pays set accroche = 'Première académie audiovisuelle de Djibouti'
 where code = 'DJ' and accroche is null;

commit;

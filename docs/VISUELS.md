# Les visuels du site

Onglet **Visuels du site** du tableau de bord. Chaque emplacement remplaçable y
apparaît avec son aperçu, un bouton **« Choisir une image »** et un bouton
**« Retirer »**.

**Retirer rétablit le visuel d'origine du site.** Rien n'est perdu.

---

## Les emplacements, et leur format

Les rapports ci-dessous ont été **mesurés** sur le site affiché, pas estimés.

| Emplacement | Rapport réel | À fournir |
|---|---|---|
| Bannière d'accueil | 0,95 — quasiment carré | 1200 × 1260 |
| Étapes de la méthode (×3) | 1,71 — paysage franc | 720 × 420 minimum |
| Photo du formateur, accueil | 4/5 — portrait | 1000 × 1250 |
| Photo du formateur, fiches | 3/4 — portrait | 900 × 1200 |

> La bannière d'accueil était annoncée « paysage » alors que son emplacement est
> presque carré. Une vraie bannière large y perdait l'essentiel de son sujet.

**Le visage doit être dans le tiers supérieur** des photos de formateur :
l'image est ancrée en haut, ce qui dépasse est coupé par le bas.

---

## Une photo de formateur par formation

La section **Fiche formation** contient **sept** entrées :

- Photo du formateur · **toutes les fiches** ← la commune
- Photo du formateur · Canva Pro
- Photo du formateur · Community Management
- … une par formation

**La commune sert de repli.** Posez une photo dessus : elle s'affiche sur les six
fiches. N'en surchargez une que si vous voulez une photo différente pour cette
formation-là. Pas besoin d'envoyer six fois le même fichier.

---

## Ce qui arrive à votre photo

- **Elle n'est plus recolorée.** Six règles ajoutaient saturation, contraste et
  assombrissement — elles ont été retirées. Vos photos s'affichent avec leurs
  vraies couleurs.
- **Elle n'est plus rognée à l'envoi.** Le fichier part entier, borné à sa
  largeur d'affichage et compressé. Le pire cas mesuré représente 34 % de la
  limite acceptée.
- **Les effets sont conservés.** Le retournement de la carte, l'effet de verre,
  le badge et la légende floutés vivent sur le conteneur et les éléments voisins,
  jamais sur la photo. Les remplacer ne change que l'image.

### Photos iPhone

Le format **HEIC** n'est pas lisible par le navigateur. Dans *Réglages →
Appareil photo → Formats*, choisissez **« Le plus compatible »**, ou envoyez-vous
la photo par email — ce qui la convertit en JPEG.

---

## Ce qui n'est pas encore là

**Le réglage du cadrage.** L'écran qui permettrait de choisir la partie visible
d'une photo est commencé mais **ni terminé ni relu**. Il attend sur la branche
`cadrage-visuels-ecran-reglage`.

En attendant, c'est l'ancrage prévu par le design qui s'applique — d'où
l'importance du visage dans le tiers supérieur.

**Les photos déjà en place** ont été rognées définitivement par l'ancien code. Le
nouveau ne récupère pas les pixels perdus : renvoyez-les pour en profiter.

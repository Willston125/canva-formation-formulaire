# Réglage du cadrage des visuels remplacés

**Date :** 19 septembre 2026
**État :** conception validée, implémentation à planifier

## Le problème

Quand l'administrateur remplace une photo depuis `/admin`, elle ne s'affiche pas
comme la photo d'origine : le sujet est décalé, agrandi, parfois coupé. Le
recadrage choisi à l'envoi ne se retrouve pas à l'écran.

Ce n'est pas l'envoi qui est en cause — un recadrage avec glisser et zoom existe
déjà. **C'est le site qui impose à chaque emplacement une mise en scène taillée
pour la photo d'origine**, et toute photo posée à la place en hérite.

Relevé par mesure du site servi en local, viewport 1280 px :

| Emplacement | Ce que le CSS impose | Conséquence |
|---|---|---|
| `.landing-hero__visual img` | `object-position: 14% 50%` · `scale(1.24)` · `transform-origin: 18% 60%` | Zoom de 1,24× ancré sur un point réglé pour une seule photo |
| `.method-step img` | `object-position: 30% 50%` | Ancrage commun aux trois étapes |
| `.method-step:nth-child(2) img` | `object-position: 50% 8%` | Ancrage **par rang dans le HTML** |
| `.method-step:nth-child(3) img` | `object-position: 23% 50%` | Idem |
| `.trainer__photo img` | `object-position: 14% 50%` · `scale(1.35)` · `transform-origin: 20% 58%` | Zoom de 1,35× |
| `@media (max-width: 767px)` sur le hero | `scale(1.26)` · `transform-origin: 30% 62%` | Une seconde mise en scène pour mobile |

Trois écarts aggravants, mesurés :

1. **`accueil.hero` est déclaré `data-image-format="paysage"`** (le tableau de
   bord rogne donc en 1400 × 788), **mais son emplacement affiché fait 570 × 600,
   soit un rapport de 0,95 — quasiment un carré.** L'étiquette annoncée dans
   l'administration induit en erreur, et l'image est rognée deux fois.
2. **`accueil.formateur.photo` change de rapport sous 1023 px** : `.trainer__photo`
   passe de `aspect-ratio: 4/5` à `5/4`, soit de portrait à paysage. **Aucun
   recadrage figé dans le fichier ne peut être juste aux deux tailles.**
3. **`fiche.formateur.photo` est une seule clé répétée dans huit fichiers** — les
   six fiches formation, la page d'inscription et le gabarit. Une photo envoyée
   sur cette clé s'applique partout à la fois.

En parallèle, six déclarations `filter:` recolorent des photos :

| Fichier | Ligne | Sélecteur | Déclaration |
|---|---|---|---|
| `style.css` | 1479 | `.landing-hero__visual img` | `saturate(0.95) contrast(1.06) brightness(0.9)` |
| `style.css` | 1918 | `.method-step img` | `saturate(0.85) contrast(1.02)` |
| `style.css` | 1981 | `.training-dialog > img` | `saturate(0.82) brightness(0.72)` |
| `style.css` | 2578 | `.trainer__photo img` | `saturate(0.95) contrast(1.06) brightness(0.9)` |
| `style.css` | 3686 | `.training-dialog__media img` | `none` (neutralisation, écrasée par 3850) |
| `style.css` | 3850 | `.training-dialog__media img` | `saturate(0.9) contrast(1.05) brightness(0.86)` |

## Décisions prises avec l'utilisateur

1. **Une photo remplacée arrive neutre** — ni zoom imposé, ni filtre — et se
   règle ensuite. Les visuels d'origine gardent leur mise en scène.
2. **Le réglage se fait dans un aperçu à la forme réelle de l'emplacement**,
   à la souris, avec un curseur de zoom et un bouton de réinitialisation.
   Pas de liste de positions en mots : le manque, c'est de voir le résultat.
3. **Les filtres colorimétriques sont retirés partout**, y compris sur les
   visuels d'origine. L'accueil changera visiblement d'aspect : c'est accepté.

## Conception

### 1. Stockage — une colonne de plus, sur l'onglet Images seulement

L'onglet `Images` passe de deux à trois colonnes : `cle`, `valeur`, `cadrage`.
La colonne `cadrage` contient un objet JSON `{"x":50,"y":35,"zoom":118}`, ou
reste vide.

`lirePaires` et `ecrirePaires` **ne sont pas touchées** : elles servent aussi aux
Textes et aux Réglages, et les élargir propagerait le risque. L'onglet Images
reçoit son propre couple `lireVisuels` / `ecrireVisuels`.

Le catalogue continue d'exposer `images[cle] = adresse` **inchangé**, et expose
en plus `cadrages[cle] = {x, y, zoom}`.

Rétrocompatibilité : une feuille à deux colonnes donne des cadrages vides et un
site strictement identique à aujourd'hui. Aucune migration.

La règle existante « une valeur vide remet le visuel d'origine » est préservée :
elle porte sur l'adresse. Adresse vide ⇒ la ligne entière est effacée, cadrage
compris.

### 2. Envoi — ne plus graver le recadrage dans le fichier

`preparerImage` rogne aujourd'hui définitivement à `ctx.drawImage(...)`. Un
cadrage stocké par-dessus un fichier déjà rogné **cumulerait les deux**.

L'envoi conserve donc l'image entière, bornée en largeur (1400 px) et compressée.
`choisirCadrage` calcule déjà la position et le zoom : elle rendra ces valeurs
normalisées (`x`, `y` en pourcentage, `zoom` en pourcentage) au lieu de les
convertir en zone de pixels.

Conséquence voulue : le cadrage devient **réversible**. On le reprend sans
renvoyer la photo, et il s'adapte aux emplacements dont le rapport change selon
la taille de l'écran.

### 3. Site — n'agir que sur ce qui est remplacé

Dans `appliquerImages` (`site-common.js`), le contrôle `typeof valeur !== 'string'`
doit accepter la nouvelle forme, sous peine de faire disparaître le visuel.

Pour une image effectivement remplacée, on pose un style en ligne — il l'emporte
sur les règles au sélecteur, y compris celles au rang :

```js
el.style.objectPosition = x + '% ' + y + '%';
el.style.transform = zoom > 100 ? 'scale(' + (zoom / 100) + ')' : 'none';
el.style.transformOrigin = 'center';
```

Une image **non remplacée** ne reçoit aucun style : elle garde exactement son
apparence actuelle.

### 4. Aperçu — la forme réelle de l'emplacement

Chaque élément remplaçable déclare `data-image-ratio`, mesuré et non deviné :

| Clé | Rapport mesuré | À déclarer |
|---|---|---|
| `accueil.hero` | 570 × 600 → 0,95 | `19/20` |
| `accueil.methode.1` · `.2` · `.3` | 359,7 × 210 → 1,71 | `12/7` |
| `accueil.formateur.photo` | 472,7 × 591,3 → 0,80 | `4/5` |
| `fiche.formateur.photo` | 220 × 294 → 0,748 | `3/4` |

`accueil.hero` corrige au passage son `data-image-format`, qui annonce
aujourd'hui « paysage » pour un emplacement quasi carré.

`fiche.formateur.photo` est déclarée dans `formations/_template/fiche.html` :
l'attribut y est ajouté puis **les six fiches sont régénérées**, jamais éditées
à la main.

Le tableau de bord affiche l'aperçu à ce rapport, permet de déplacer la photo à
la souris, propose un zoom de 100 à 250 %, et un bouton « Réinitialiser ».
Les réglages partent avec « Enregistrer les visuels ».

Sur `accueil.formateur.photo`, l'aperçu signale que l'emplacement devient
paysage sous 1023 px : le réglage doit laisser de la marge en haut et en bas.

### 5. Filtres — retrait

Les six déclarations du tableau ci-dessus sont supprimées. La ligne 3686
(`filter: none`) devient sans objet et part avec.

Les `backdrop-filter` **restent** : ils floutent des cartouches de texte posés
par-dessus les photos, ils ne recolorent rien.

### 6. Bornes

- `zoom` ramené dans 100–250. En dessous de 100, la photo ne remplit plus
  l'emplacement et laisse du vide.
- `x` et `y` ramenés dans 0–100.
- Un cadrage illisible dans la feuille est ignoré, sans casser l'affichage.

## Épreuves

Chaque contrôle sera prouvé en régression — retiré du code, il doit échouer.

1. Une feuille Images à deux colonnes donne des cadrages vides et un site
   inchangé.
2. Un cadrage écrit se relit à l'identique, après un aller-retour complet.
3. Une adresse vide efface la ligne entière, cadrage compris.
4. Une image non remplacée ne reçoit ni style en ligne ni cadrage.
5. Les valeurs aberrantes (`zoom: 5000`, `x: -40`, cadrage illisible) sont
   bornées ou ignorées, jamais propagées.
6. Aucune déclaration `filter:` ne subsiste sur un sélecteur visant une photo.
7. Chaque clé `data-image` porte un `data-image-ratio`, et les six fiches
   générées sont identiques au gabarit.
8. `preparerImage` ne rogne plus : l'image envoyée garde son rapport d'origine.

Deux épreuves existantes liront un code modifié et devront être mises à jour en
même temps : `textes.test.js:75` (lit `FORMATS_IMAGE` au caractère près) et
`affichage.test.js:160` (lit une ligne de `chargerVisuelsDuSite`).

## Hors périmètre, signalé

**`fiche.formateur.photo` reste une clé unique pour huit pages.** Donner une
photo différente par formation demanderait une clé par fiche et une reprise du
moteur de remplacement. C'est un autre chantier, à décider séparément.

**`entreprises/index.html` ne porte aucun `data-image`** : ses deux images ne
sont pas remplaçables depuis l'administration. Probablement un oubli, à confirmer.

## Ce qui n'est pas fait

Aucune conversion, aucun réglage automatique de couleur, aucune détection de
visage : le cadrage reste un choix humain, posé à la souris et relu tel quel.

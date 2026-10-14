# Campagne IMPACTALI : 10 maquettes par formation

Les visuels des 5 formations (Canva Pro, Graphisme, Marketing digital, Site web avec iA,
Montage vidéo), dans un même système graphique, pour les pages Facebook de chaque pays,
les statuts WhatsApp, Instagram, TikTok et LinkedIn.

## Les fichiers à publier : `publicite/rendus/campagne/`

Un dossier par formation (`01 Canva Pro` … `05 Montage video`), et dans chacun :

| Dossier | Pour quoi |
|---|---|
| `Comores/` | La page Facebook Comores et les statuts du +269 : tarif en KMF, American Corner, Moroni. |
| `Djibouti/` | La page Facebook Djibouti et les statuts du +253 : tarif en FDJ, en ligne, séances enregistrées. |
| `Generique/` | Instagram, TikTok, LinkedIn : ni prix, ni lieu, ni numéro. |
| `Planche Comores.png`, `Planche Djibouti.png` | Les 10 maquettes d'un coup d'œil. |

Les 10 maquettes : `01` annonce · `02` formateur · `03` programme (carrousel, dans l'ordre) ·
`04` ce que vous allez créer · `05` à `07` une maquette par public · `08` questions ·
`09` certificat · `10` places restantes · `Statuts/` (annonce et places, 1080 × 1920).
`Reels/fin-de-reel.png` : la carte de fin des vidéos courtes.

Format 1080 × 1350 (fil Facebook et Instagram), 1080 × 1920 pour les statuts.

## Refaire les visuels

```
node publicite/campagne/rendre.js
```

Environ deux minutes. Les dates, tarifs, numéros WhatsApp et **places restantes** sont lus
sur impactali.site au moment du rendu : après un changement dans le tableau de bord, ou le
jour d'une publication « places restantes », relancer suffit.

- `--f canva-pro` : une seule formation (`identite-visuelle`, `marketing-digital`, `ia-appliquee`, `photo-video`).
- `--v places,story-places` : seulement ces maquettes (ici, le chiffre du jour).
- `--hors-ligne` : sans interroger le site (reprend le dernier `_live.json`).

Chaque maquette est contrôlée avant d'être écrite : un visuel des Comores ne contient rien de
Djibouti (et inversement), un visuel générique ne porte ni prix, ni lieu, ni numéro ; aucun
texte ne sort du cadre ni n'en chevauche un autre ; aucune icône ne manque.

## Ce qu'il y a dedans

- `donnees.js` : les textes (accroches, publics, programmes, questions) et les points focaux des photos.
- `campagne.html` : les maquettes, dessinées en HTML (`?f=canva-pro&v=annonce&m=km`).
- `rendre.js` : lit le site, fabrique les certificats modèles, photographie chaque maquette avec Chrome sans fenêtre, range et fait les planches.
- `retouche.js` : les photos de `medias/`, tirées des affiches de William (`module de william/`) dont le texte est effacé, et les deux portraits studio (dossier « APPEL A PROJET festival »). `medias/` est hors git : le dépôt est public.

Les marques montrées dans les vitrines (Boutique Nour, Pâtisserie Nour, Baobab Café) sont
fictives. Le certificat est montré avec « Votre nom », un filigrane « MODÈLE » et sans cachet.

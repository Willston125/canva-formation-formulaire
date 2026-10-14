# Publicité vidéo IMPACTALI

Vidéo verticale 1080 × 1920, 30 secondes, pour Instagram (Reels, Stories),
Facebook, TikTok et YouTube Shorts.

## Les fichiers à publier — `rendus/`

| Fichier | Pour quoi |
|---|---|
| `impactali-pub-generique.mp4` | La page IMPACTALI, vue partout : rien qui appartienne à un pays (ni tarif, ni date, ni mode). |
| `impactali-pub-km.mp4` | Publicité **ciblée sur les Comores** : en présentiel, dès le 19 octobre, 10 000 KMF. |
| `impactali-pub-dj.mp4` | Publicité **ciblée sur Djibouti** : en ligne, en direct, dès le 21 octobre, 6 000 FDJ. |
| `…-muette.mp4` | La même vidéo sans musique, pour poser un son tendance dans Instagram ou TikTok. |
| `couverture.jpg` | Image de couverture du Reel (le logo et « Se former pour devenir meilleur »). |

Une version Comores ne doit être montrée qu'aux Comores, une version Djibouti
qu'à Djibouti : dans le gestionnaire de publicités, réglez le **lieu** de
l'audience sur le seul pays de la version.

Les textes importants restent dans la zone que ne couvrent ni le nom du compte,
ni la légende, ni les boutons des applications.

## Refaire les vidéos (dates, tarifs, textes)

Les versions Comores et Djibouti annoncent la **première** session. Quand elle
change, modifiez `VARIANTES` en haut du script de `video.html`, puis :

```
node publicite/rendre.js --flou
```

Il faut Chrome et ffmpeg (installés sur cet ordinateur). Comptez environ 6 minutes
par version. Sans `--flou`, le rendu est quatre fois plus rapide (sans flou de
mouvement). `--version km` ne refait qu'une version ; `--images 2,9.5,28` produit
quelques images fixes dans `rendus/apercu/` pour vérifier un changement.

Ouvert dans un navigateur à travers un serveur local (par exemple le banc :
`npm run banc`, puis `http://localhost:5180/publicite/video.html`), `video.html`
joue l'animation en boucle, avec une barre pour se déplacer dans le temps.

## Les visuels fixes de la campagne — `campagne/`

Les 10 maquettes de chaque formation (Canva Pro, Graphisme, Marketing digital, Site web
avec iA, Montage vidéo), par pays, se fabriquent dans `campagne/` : voir
[campagne/LISEZMOI.md](campagne/LISEZMOI.md). Les fichiers à publier sont dans
`rendus/campagne/`.

## Le spot de 35 secondes — `spot/`

Une publicité de cinéma pour impactali.site, en 9:16 et en 16:9, générique (ni prix, ni
lieu, ni date) : voir [spot/LISEZMOI.md](spot/LISEZMOI.md). Les fichiers à publier sont dans
`rendus/spot/`.

## Ce qu'il y a dedans

- `video.html` — l'animation, image par image (aucun outil extérieur).
- `musique.js` — la musique, composée et synthétisée sur place : aucun droit à payer.
- `rendre.js` — le tournage : Chrome sans fenêtre filme chaque image, ffmpeg encode.
- `campagne/` — les maquettes des 5 formations (textes, dessin, rendu, retouche des photos).
- `spot/` — le spot de 35 secondes (animation, musique, tournage).
- `medias/` — les visuels du site (affiches, portrait, logo officiel en haute définition).

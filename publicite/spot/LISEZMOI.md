# Le spot IMPACTALI : 35 secondes, en motion design

Une publicité de cinéma pour impactali.site, en deux formats :

| Fichier (`publicite/rendus/spot/`) | Pour quoi |
|---|---|
| `IMPACTALI_Spot_35s_9x16.mp4` | Reels, Stories, TikTok, Shorts, statuts WhatsApp (1080 × 1920). |
| `IMPACTALI_Spot_35s_16x9.mp4` | YouTube, page Facebook, LinkedIn, écran de salle (1920 × 1080, bandes de cinéma 2,39:1). |
| `…_leger.mp4` | La même vidéo en 720p, plus légère : statuts WhatsApp, envoi sur données mobiles. |
| `couverture-9x16.jpg`, `couverture-16x9.jpg` | L'image de couverture : le logo, le slogan et l'adresse. |

Le spot est **générique** : ni prix, ni lieu, ni date, ni numéro, ni mode (présentiel ou en
ligne). On peut donc le montrer partout, dans les deux pays, et il ne se périme pas quand une
session change. Le prix et la date se donnent dans la légende de la publication, ou dans les
visuels de la campagne (`publicite/rendus/campagne/`), pays par pays.

## Le découpage

| Temps | Plan |
|---|---|
| 0 – 7,5 s | Un point de lumière : « Vous avez des idées. » Il trace l'anneau du logo autour de « Du talent. », puis « Il ne vous manque qu'une méthode. » ; tout est aspiré. |
| 7,5 – 10 s | Choc. « Transformez votre talent en compétences professionnelles » (la promesse du site). |
| 10 – 15 s | Le formateur : Ali William, ses trois titres. |
| 15 – 21 s | Les 5 formations, une par plan, sur la musique. |
| 21 – 22,5 s | « 5 formations. Choisissez la vôtre. » |
| 22,5 – 25 s | La méthode : 6 soirées, 12 heures, 20 places par session, 1 projet réel. |
| 25 – 27,5 s | Le certificat, « qui se mérite » : modèle « Votre nom », filigrane MODÈLE. |
| 27,5 – 30 s | Le vrai site sur un téléphone : on touche une formation, on plonge dans l'écran. |
| 30 – 35 s | Le logo se dessine. « Se former pour devenir meilleur. » · impactali.site · #quedubon · Inscriptions ouvertes. |

La musique est composée et synthétisée sur place (`son.js`) : aucun droit à payer, aucun
échantillon emprunté. Chaque changement de plan tombe sur un son : l'image et la musique
lisent les mêmes repères (`REPERES` dans `spot.html`).

## Refaire le spot

```
node publicite/spot/rendre.js
```

Il faut Chrome et ffmpeg (installés sur cet ordinateur). Comptez 20 à 30 minutes pour les deux
formats. Options :

- `--format 9x16` (ou `16x9`) : un seul format. Deux tournages peuvent tourner en même temps,
  un par format, pour aller deux fois plus vite.
- `--images 3,8.2,31` : quelques images fixes dans `rendus/spot/apercu/`, pour juger un plan.
- `--sans-flou` : sans flou de mouvement, quatre fois plus rapide, pour un essai.
- `--son` : seulement la musique (`IMPACTALI_Spot_musique.wav`).

Quand plus aucune session n'est ouverte, passez `INSCRIPTIONS_OUVERTES` à `false` en haut de
`spot.html` : la fin dira « Découvrez nos formations ».

Ouvert dans un navigateur à travers un serveur local (`npm run banc`, puis
`http://localhost:5180/publicite/spot/spot.html?format=9x16`), `spot.html` joue l'animation en
boucle, sans le son.

## Ce qu'il y a dedans

- `spot.html` : l'animation, image par image (`rendre(t)`), pour les deux formats.
- `son.js` : la musique (ré mineur, qui s'éclaire en ré majeur au logo).
- `rendre.js` : réunit les médias, fabrique le certificat modèle, filme avec Chrome sans
  fenêtre (4 captures par image, moyennées : le flou de mouvement d'une caméra), cale la
  musique à −14 LUFS et assemble.
- `medias/` (hors git, le dépôt est public) : les photos des formations et le portrait
  détouré (faits par `campagne/retouche.js`), le logo officiel rogné, deux captures du site
  (`presentation/medias/site/`) et le certificat modèle (tiré de `certificat/`, hors git).

Aucune image d'élève : les extraits de cours ne sont pas utilisés.

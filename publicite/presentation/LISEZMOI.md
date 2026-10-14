# IMPACTALI — Présentation vidéo (motion design)

Fil conducteur : **« Votre prochaine compétence commence ici. »** Une intention devient une
compétence, puis une réalisation concrète. Une ligne vert citron relie les séquences : elle
souligne l'accroche, dévoile le logo, devient le contour du téléphone puis des cartes,
accompagne une réalisation, trace le parcours d'inscription et finit en bouton.

Ce dossier est indépendant de la publicité de 30 s du 09/10 (`publicite/video.html`), qui n'a
pas été modifiée.

## Les fichiers livrés — `livrables/`

| Fichier | Pour quoi |
|---|---|
| `IMPACTALI_Presentation_40s_9x16.mp4` | Version principale, 1080 × 1920, 40 s, 30 i/s : Reels, Stories, TikTok, Shorts. Sous-titres incrustés. |
| `IMPACTALI_Presentation_15s_9x16.mp4` | Version courte, 1080 × 1920, 15 s. Sous-titres incrustés. |
| `IMPACTALI_Presentation_40s_4x5.mp4` | Fil d'actualité Facebook et Instagram, 1080 × 1350, composition réorganisée. |
| `sans-sous-titres/` | Les trois vidéos sans sous-titres incrustés : à publier **avec** le fichier SRT. |
| `sans-voix/` | Les trois vidéos avec musique et bruitages seuls. |
| `IMPACTALI_Presentation_40s.fr_FR.srt`, `…_15s.fr_FR.srt` | Sous-titres. Le nom suit la règle de Meta (`.fr_FR.srt`). Le fichier 40 s sert aussi au 4:5. |
| `couverture/` | Miniatures de couverture 9:16 et 4:5 (PNG et JPG). |
| `images-cles/` | Les trois images clés de la direction artistique, en 9:16 et en 4:5. |
| `storyboard/storyboard.html` | Le storyboard, plan par plan, avec vignettes (s'ouvre dans un navigateur). |
| `VOIX-OFF.md` | Le texte final de la voix, phrase par phrase, avec le créneau de chaque phrase. |
| `LICENCES.md` | L'origine et les droits de chaque élément. |

Tous les fichiers sont à −14 LUFS (crête vraie ≤ −1 dBTP après encodage), H.264 High, BT.709, son AAC 48 kHz :
ce que demandent Instagram, Facebook, TikTok et YouTube. Le contrôle de chaque fichier est
dans `rendus/controle-livrables.json`.

## Ce qui est prêt, ce qui attend

- **Prêt** : l'image (trois versions), le montage, la musique, les bruitages, le mixage, les
  sous-titres, la couverture, le storyboard.
- **En attente : la voix définitive.** La voix actuelle est une **voix témoin** (synthèse vocale
  de Windows, 16 kHz, timbre de synthèse) : elle cale le rythme et sert à valider le texte,
  elle n'est pas faite pour la diffusion. Pour la remplacer, voir « La voix » ci-dessous :
  aucune image à refaire. Les versions `sans-voix/` sont diffusables dès maintenant.
- **À confirmer par vous** : l'accord des personnes visibles dans les extraits de cours
  (Promotion 2026) pour une **publicité** — ces extraits sont déjà publiés sur le site, mais
  une diffusion payante est un autre usage ; la prononciation d'« IMPACTALI ».
- **Absent** : des travaux d'apprenants. La vidéo n'en montre aucun : aucune réalisation n'y
  est attribuée à un apprenant (les réalisations des cartes sont des démonstrations dessinées).

## Ce que la vidéo dit — vérifié sur le site le 10/10/2026

- 5 formations actives, sessions ouvertes aux Comores et à Djibouti → **« Inscrivez-vous »**.
- Intitulés exacts du catalogue : Canva Pro & Création de contenu, Graphisme & identité
  visuelle, Réalisation et Montage vidéo, Création de site web avec iA, Marketing digital.
- **Community Management n'est plus au catalogue** : il n'apparaît pas (le domaine
  « Communiquer » montre Marketing digital et un calendrier de publication).
- **Informatique & outils bureautiques** : seulement « À venir » (récapitulatif, 40 s).
- Adresse : **www.impactali.site** (forme officielle ; impactali.site y redirige).
- Vidéo **générique** : ni date, ni tarif, ni lieu, ni numéro, ni mode (présentiel / en
  ligne) — elle est vue dans les deux pays. Les captures du site sont faites sur le site servi
  en local, avec le catalogue réel ; seuls le bandeau « Prochaine session · date » et la ligne
  « Présentiel » de la carte ont été retirés avant la photo. Le formulaire est vide ; aucune
  inscription, aucun paiement n'est simulé ; la vidéo rappelle que la place est confirmée après
  validation du paiement.

## Publier

- **Reels, TikTok, Shorts, Stories** : `IMPACTALI_Presentation_40s_9x16.mp4` ou la 15 s.
  Si la plateforme affiche ses propres sous-titres (fichier SRT chargé), prendre la version
  `sans-sous-titres/` pour ne pas avoir deux fois le texte.
- **Fil Facebook / Instagram** : `IMPACTALI_Presentation_40s_4x5.mp4`.
- **Statuts WhatsApp** : la 15 s passe en un seul statut.
- **Zones de sécurité** (octobre 2026) : en 9:16, tous les textes importants tiennent entre
  y = 290 et y = 1200, x = 120 à 960, et ne dépassent pas x = 840 sous y = 840 (colonne de
  boutons de TikTok et Reels). Le bas de l'image est laissé libre pour le nom du compte et la
  légende.

## Modifier

Après chaque modification : refaire les rendus (dernière partie).

### Les textes
Tout est dans **`donnees.js`** : accroche, signature, titres, légendes des extraits, étapes,
slogan, bouton, et la voix off phrase par phrase (avec l'instant où chaque phrase commence).
Garder les apostrophes typographiques ( ’ ). Les tailles de texte s'ajustent seules à la
largeur disponible.

### L'adresse du site
`donnees.js` → `site.adresse`. Puis rendus.

### L'état des inscriptions
`donnees.js` → `site.inscriptionsOuvertes` : `false` remplace « Inscrivez-vous sur » par
« Rendez-vous sur ». Penser aussi à la dernière phrase de la 15 s (`b08`).

### Les formations
`donnees.js` → `domaines` (verbe, intitulés exacts du catalogue, nom de la réalisation). Les
réalisations animées elles-mêmes sont dans `illustrations.js`.

### Les images
- **Captures du site** : `node publicite/presentation/outils/capturer-site.js` les refait
  depuis les fichiers du dépôt. Le catalogue vient du relevé `site/catalogue-2026-10-10.json`
  (réponse de `https://www.impactali.site/api?action=catalogue&marche=KM`, numéros retirés) :
  le remplacer par un relevé récent pour suivre le site. Le script refuse toute capture qui
  contiendrait un numéro, un montant, un indicatif ou une date. Cadrages : `outils/cadrages-site.js`.
- **Extraits de cours** : `outils/extraire-classe.js` (passages, en secondes, dans `PASSAGES`).
  Les sources sont les deux vidéos reçues le 09/10/2026 dans `Téléchargements`.
- **Logo** : `medias/marque/logo-vert.png`, tiré de la source haute définition
  (`../Nouveau dossier/assets/logo impactali.png`), recoloré en vert officiel, proportions
  intactes. Ne pas le retoucher.

### La voix
1. Enregistrer chaque phrase de `VOIX-OFF.md` (un WAV par phrase, sans musique, avec une
   seconde de silence avant et après), nommé comme indiqué (`a01.wav` … `a16.wav`,
   `b01.wav` … `b08.wav`), et le déposer dans `son/voix/finale/`. Respecter le créneau.
2. Lancer :
   ```
   node publicite/presentation/son/voix.js --mesurer
   node publicite/presentation/rendre.js --seulement-st
   node publicite/presentation/assembler.js
   ```
   Les phrases sont recalées sur leur instant, les sous-titres suivent leur durée réelle, le
   mixage et les exports sont refaits (3 à 4 minutes).

Pour régénérer la voix témoin : `node publicite/presentation/son/voix.js`.

### La musique
`son/musique.js` (composée par le code : tempo, accords, instruments, bruitages). Le mixage
est dans `assembler.js` (la musique s'efface d'environ 8 dB sous la voix).

## Refaire les rendus

Il faut Chrome et ffmpeg (installés sur cet ordinateur).

```
node publicite/presentation/rendre.js --flou          # l'image, 3 versions, avec flou de mouvement (≈ 20 min)
node publicite/presentation/assembler.js              # son, sous-titres, exports, contrôles (≈ 4 min)
node publicite/presentation/outils/documents.js       # storyboard, texte de la voix, images clés, couvertures
node publicite/presentation/rendre.js --couverture    # les couvertures (avant documents.js)
```

- `--version 40-9x16` (ou `15-9x16`, `40-4x5`) : une seule version.
- `--images 2.5,8.6,38` : quelques images fixes dans `rendus/apercu/`, pour juger un
  changement (`--avec-st` pour y voir les sous-titres).
- Sans `--flou`, le rendu est quatre fois plus rapide (sans flou de mouvement).

**Aperçu dans un navigateur** : `npm run serve`, puis
`http://localhost:5173/publicite/presentation/video?format=9x16&montage=40&st=1`
(`format=4x5`, `montage=15`) — lecture en boucle avec une barre de temps.

## Ce qu'il y a dedans

| Fichier | Rôle |
|---|---|
| `video.html`, `video.js` | L'animation, image par image (`rendre(t)`) : montages 40 / 15 s, mises en page 9:16 / 4:5, le fil, les sous-titres incrustés. |
| `illustrations.js` | Les quatre réalisations animées des domaines. |
| `donnees.js` | Tous les textes et la voix (à modifier ici). |
| `rendre.js` | Le tournage : Chrome sans fenêtre filme chaque image, ffmpeg encode. |
| `assembler.js` | Voix, mixage, sous-titres SRT, exports, contrôles. |
| `son/` | Musique (`musique.js`), calcul (`composer.js`), voix (`voix.js`, `tts-windows.ps1`, `voix/finale/`). |
| `outils/` | Captures du site, extraits de cours, planches-contacts, documents. |
| `medias/` | Logo, captures du site, extraits de cours (hors dépôt). |
| `rendus/`, `livrables/` | Fichiers fabriqués (hors dépôt git). |

Hors du dépôt public (`.gitignore`) : rendus, livrables, extraits de cours (élèves
reconnaissables), relevé du catalogue et ses photos (données de pays). Hors du site publié
(`.vercelignore`) : tout `publicite/`.

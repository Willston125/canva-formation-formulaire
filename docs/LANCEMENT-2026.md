# Lancement des formations — fiche de saisie (octobre → décembre 2026)

Décidé le 8 octobre 2026. Tout se saisit dans le **tableau de bord** (`/admin`) ;
le site se met à jour dans la minute.

> **Fait le 8 octobre 2026.** Tarifs et durée des 5 formations, les 5 sessions existantes
> **modifiées** (aucune supprimée : c'est la règle), les 5 sessions de Djibouti créées
> (`<formation>-dj-2026`), Djibouti activé. Vérifié sur le site dans les deux pays.
> Une inscription « En attente » (Marketing digital) a vu sa session passer du 7 au
> 9 novembre : la personne est à prévenir.

## Les règles du lancement

- **Un seul créneau : 18h30 – 20h30**, un seul formateur. Aucune date ne sert deux sessions.
- **Comores** : lundi, mardi, samedi, dimanche — **présentiel** — **10 000 KMF**.
- **Djibouti** : mercredi, jeudi, vendredi — **en ligne uniquement** — **6 000 FDJ**.
- **Chaque formation = 6 séances de 2 h (12 h) en « 12 jours »** — 12 jours est le
  maximum : de date à date, une formation tient en 9 jours (Comores) ou 10 jours (Djibouti).
- **Certificat pour toutes les formations.**
- **Tout est fini avant le 31 décembre 2026** : dernière séance le 8 décembre aux
  Comores, le 25 décembre à Djibouti.

Les 5 formations se suivent, dans cet ordre : Canva Pro, Graphisme, Marketing digital,
Création de site web avec iA, Réalisation et Montage vidéo.

---

## Avant de commencer

1. **Onglet Inscriptions** : regardez si quelqu'un est déjà inscrit aux anciennes
   sessions (13 octobre, 19 octobre, 7 novembre). Prévenez-les avant de supprimer
   quoi que ce soit.
2. **Onglet Réglages** : le « lieu proposé par défaut » est *Saalam Tower, 5ème étage,
   Djibouti*. Il préremplit le lieu des nouvelles sessions. **Pour chaque session des
   Comores, remplacez-le par « American corner ».**

## 1. Pays → Djibouti

- Cochez **actif**. Tant qu'il ne l'est pas, aucun visiteur de Djibouti ne voit ses sessions.
- Moyens de paiement actuels : Waafi, Cacpay, Espèces (« Saalam Tower, 5ème étage »).
  Le paiement en espèces suppose de passer sur place : gardez-le ou retirez-le.

## 2. Formations → « Tarifs par pays » (les 5 formations)

| Pays | Tarif |
|---|---|
| Comores (KMF) | **10000** |
| Djibouti (FDJ) | **6000** |

Aujourd'hui : Canva Pro n'a pas de tarif Djibouti ; les quatre autres affichent 15 000 KMF
et 7 500 FDJ. **Ne remplissez pas « Tarif de cette session »** : le tarif de la formation suffit.

À corriger au passage, dans chaque formation :
- **Durée** : `12 jours` (aujourd'hui : « 12 séances », « 1 Mois », « 12 jours »).
- **Canva Pro → programme → sous-titre** : remplacer
  « 12 jours · 24 heures · 4 modules · 3 séances/semaine » par
  « 12 jours · 12 heures · 4 modules ». Quatre modules en 6 séances est serré : à vous de voir.

## 3. Sessions → modifier les 5 actuelles (Comores), créer les 5 de Djibouti

On ne supprime jamais une session : une inscription y est peut-être rattachée.

Champs communs : **Nombre de places** 20 · **Inscriptions ouvertes** coché ·
**Tarif de cette session** vide · volume : `6 séances · 12 heures`.

### Comores — pays coché : Comores · mode Présentiel · lieu « American corner »

Jours et horaires : `Lundi, mardi, samedi et dimanche · 18h30 – 20h30`

| Formation | Début | Fin | Les 6 soirées |
|---|---|---|---|
| Canva Pro & Création de contenu | 2026-10-19 | 2026-10-27 | lun 19, mar 20, sam 24, dim 25, lun 26, mar 27 oct |
| Graphisme & identité visuelle | 2026-10-31 | 2026-11-08 | sam 31 oct, dim 1, lun 2, mar 3, sam 7, dim 8 nov |
| Marketing digital | 2026-11-09 | 2026-11-17 | lun 9, mar 10, sam 14, dim 15, lun 16, mar 17 nov |
| Création de site web avec iA | 2026-11-21 | 2026-11-29 | sam 21, dim 22, lun 23, mar 24, sam 28, dim 29 nov |
| Réalisation et Montage vidéo | 2026-11-30 | 2026-12-08 | lun 30 nov, mar 1, sam 5, dim 6, lun 7, mar 8 déc |

### Djibouti — pays coché : Djibouti · mode En ligne (aucun lieu : il disparaît tout seul)

Jours et horaires : `Mercredi, jeudi et vendredi · 18h30 – 20h30`

| Formation | Début | Fin | Les 6 soirées |
|---|---|---|---|
| Canva Pro & Création de contenu | 2026-10-21 | 2026-10-30 | mer 21, jeu 22, ven 23, mer 28, jeu 29, ven 30 oct |
| Graphisme & identité visuelle | 2026-11-04 | 2026-11-13 | mer 4, jeu 5, ven 6, mer 11, jeu 12, ven 13 nov |
| Marketing digital | 2026-11-18 | 2026-11-27 | mer 18, jeu 19, ven 20, mer 25, jeu 26, ven 27 nov |
| Création de site web avec iA | 2026-12-02 | 2026-12-11 | mer 2, jeu 3, ven 4, mer 9, jeu 10, ven 11 déc |
| Réalisation et Montage vidéo | 2026-12-16 | 2026-12-25 | mer 16, jeu 17, ven 18, mer 23, jeu 24, ven 25 déc |

Chaque session a été éprouvée avec la règle du site (`api/_lib/calendrier.js`) : elle
contient exactement 6 soirées, aucune de moins que ce qu'elle annonce. Les dates ne se
croisent jamais, ni entre formations ni entre pays.

## 4. Vérifier sur le site (en navigation privée)

- Visiteur des Comores : 5 sessions, 10 000 KMF, présentiel, American corner.
- Visiteur de Djibouti (ou choix du pays à l'étape 1 du formulaire) : 5 sessions,
  6 000 FDJ, **En ligne**, aucune adresse.
- La bannière du haut annonce « Prochaine session · Canva Pro · 19 octobre 2026 ».
- Un candidat peut aller jusqu'à l'écran de succès sans erreur, dans chaque pays.

## Marge qui reste

- **Comores** : du 9 au 31 décembre, toutes les soirées sont libres. De quoi ouvrir une
  deuxième session de la formation la plus demandée, ou rattraper une séance annulée.
- **Djibouti** : les 30 et 31 décembre sont libres.
- Si « 12 h » paraît trop court pour le certificat, on peut monter à **8 séances (16 h)** par
  formation aux Comores en finissant le 27 décembre. Il faudrait alors refaire les dates.

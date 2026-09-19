# Le tableau de bord — mode d'emploi

Adresse : **`/admin`** sur votre site.

Tout ce qui s'affiche sur le site public se règle depuis cet écran. Vous n'avez
jamais à ouvrir la feuille Google ni à toucher au code.

---

## Se connecter

Tapez votre phrase de passe et laissez **« Rester connecté sur cet appareil »**
cochée : elle l'est par défaut, et votre choix est retenu d'une visite à l'autre.

L'ouverture prend quelques secondes — Google met du temps à réveiller le script.
C'est normal la première fois de la journée.

Si l'écran affiche **« Mot de passe incorrect »** alors que vous êtes sûr de
vous, voyez [DEPANNAGE.md](DEPANNAGE.md).

---

## Les neuf onglets

### Vue d'ensemble
Le nombre de formations publiées, de sessions ouvertes, d'inscriptions reçues et
de places encore libres. Le bouton **« Importer le catalogue du site »** n'est à
utiliser qu'une seule fois, à l'installation : il **écrase** ce qui est dans la
feuille par ce qui est écrit dans le code du site.

> ⚠️ Ne l'utilisez jamais « pour remettre à zéro » : vos tarifs, vos moyens de
> paiement et vos pays saisis à la main seraient perdus.

### Formations
Le catalogue. Pour chaque formation : titre, description, programme, questions
fréquentes, prérequis, et **les tarifs pays par pays**.

**Les tarifs ne se convertissent jamais.** Un montant saisi pour Djibouti
s'affiche en FDJ, un montant saisi pour les Comores en KMF. Une formation sans
tarif pour un pays affiche **« À confirmer »** aux visiteurs de ce pays — jamais
un montant approché.

### Sessions
Les dates. Voir [SESSIONS-PAR-PAYS.md](SESSIONS-PAR-PAYS.md) : une même session
peut se tenir en présentiel ici et en ligne ailleurs, à un tarif différent.

### Inscriptions
Les candidats reçus, les plus récents d'abord. Vous pouvez changer leur statut
et leur écrire sur WhatsApp d'un clic. C'est le seul onglet qui contient des
données personnelles.

### Pays
Les marchés desservis. Pour chacun : devise, indicatif téléphonique, format des
numéros, moyens de paiement, et votre numéro de contact local.

Le champ **« Exemple affiché sous le champ du candidat »** attend un **gabarit**
en X (`77XXXXXX`), jamais un vrai numéro : c'est ce que le candidat a sous les
yeux pendant qu'il tape le sien. Votre vrai numéro se saisit dans
**« Contact dans ce pays »**.

### Réalisations
Le portfolio affiché sur l'accueil.

### Visuels du site
Les photos remplaçables. Voir [VISUELS.md](VISUELS.md).

### Textes du site
Tous les textes marqués comme modifiables. **Un champ vidé rétablit le texte
d'origine** — c'est ainsi qu'on annule une modification sans avoir à retrouver
la formulation initiale.

### Réglages
Votre nom, votre numéro WhatsApp général, le lieu proposé par défaut à la
création d'une session.

---

## Après chaque enregistrement

Le site se met à jour **dans la minute**. Vous n'avez rien à republier.

Si vous ne voyez pas votre modification, actualisez la page du site. Elle garde
le catalogue une minute en mémoire pour ne pas rappeler le serveur à chaque
navigation.

---

## Ce qui n'est pas dans le tableau de bord

- **Le mot de passe** : il vit dans le script Google. Voir
  [SCRIPT-GOOGLE.md](SCRIPT-GOOGLE.md).
- **Les pages elles-mêmes** (structure, mise en page) : elles sont dans le code.
- **Le réglage du cadrage des photos** : commencé, non terminé. Voir
  [VISUELS.md](VISUELS.md).

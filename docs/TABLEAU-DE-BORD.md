# Le tableau de bord — mode d'emploi

Adresse : **`/admin`** sur votre site.

Tout ce qui s'affiche sur le site public se règle depuis cet écran. Vous n'avez
jamais à toucher au code.

---

## Se connecter

Entrez l'**e-mail et le mot de passe de votre compte Supabase** — le compte du
propriétaire, le seul autorisé. La session reste ouverte tant que l'onglet l'est :
fermez-le, et il faudra vous reconnecter. C'est voulu, pour qu'un appareil oublié
n'ouvre pas le tableau de bord.

Un mot de passe oublié ou à changer se règle dans Supabase (Authentication →
Users). Si l'écran refuse la bonne connexion, voyez [DEPANNAGE.md](DEPANNAGE.md).

---

## Les dix onglets

### Vue d'ensemble
Le nombre de formations publiées, de sessions ouvertes, d'inscriptions reçues et
de places encore libres.

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

**Une session ne peut pas annoncer plus de séances que ses dates n'en
contiennent.** « 12 séances, mardi et vendredi, du 6 au 13 octobre » n'en compte
que 3 : l'enregistrement est refusé, avec le calcul. Corrigez le volume, les
jours ou les dates.

### Inscriptions
Les candidats reçus, les plus récents d'abord. Vous pouvez changer leur statut
et leur écrire sur WhatsApp d'un clic. C'est le seul onglet qui contient des
données personnelles.

Toute inscription arrive **« En attente »** et ne prend aucune place. C'est en
la passant à **« Confirmé »** ou **« Payé »** que vous lui réservez sa place :
le compteur du site baisse à ce moment-là, pas avant.

### Audience
Le parcours des visiteurs, de la fiche à l'inscription, formation par formation :
fiche vue → formulaire commencé → étape 2 → paiement → validation → inscription
envoyée → preuve envoyée sur WhatsApp, et les questions posées sur WhatsApp. Sur
7 jours, 30 jours, 3 mois ou un an, pour tous les pays ou un seul.

Ce sont des **compteurs anonymes** : ni cookie, ni adresse, seulement des totaux
par jour (table `mesures`). Une étape compte au plus une fois par visiteur et par
onglet. Dès 20 fiches vues, l'écran nomme **la marche où l'on perd le plus de
monde** : c'est là qu'une amélioration rapporte le plus.

« Dernière mesure reçue » doit dater de la journée. Si elle date de plusieurs
jours alors que le site a des visiteurs, le comptage est cassé : voir
[DEPANNAGE.md](DEPANNAGE.md). « Une table manque dans la base » veut dire que
`supabase/migrations/20261009120000_mesures.sql` n'a pas été collé.

Le nombre de visiteurs, leur provenance (Facebook, WhatsApp, Google…) et les
pages vues sont dans **Vercel → le projet → Analytics** (gratuit jusqu'à 50 000
pages vues par mois ; au-delà, la collecte s'arrête jusqu'au mois suivant, sans
rien facturer).

### Pays
Les marchés desservis. Pour chacun : devise, indicatif téléphonique, format des
numéros, moyens de paiement, et votre numéro de contact local.

**Un changement de moyen de paiement vous est signalé par e-mail**, sur
infos@impactali.site, avec l'ancien et le nouveau numéro côte à côte. Si vous
recevez ce message sans avoir rien changé, changez aussitôt le mot de passe de
votre compte Supabase.

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

- **Le mot de passe** : il vit dans Supabase (Authentication → Users).
- **Les sauvegardes** : une copie de la base arrive chaque nuit par e-mail. Voir
  [BASE-SUPABASE.md](BASE-SUPABASE.md).
- **Les pages elles-mêmes** (structure, mise en page) : elles sont dans le code.
- **Le réglage du cadrage des photos** : commencé, non terminé. Voir
  [VISUELS.md](VISUELS.md).

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

## Les onze onglets

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

**Chaque visiteur ne voit que l'offre de SON pays.** C'est le serveur qui le
reconnaît, d'après son adresse IP (Vercel la localise pour chaque visite), et qui
ne lui envoie que ce pays : ses sessions, ses tarifs, ses moyens de paiement, son
numéro WhatsApp. Un visiteur de Djibouti ne reçoit jamais le numéro, les tarifs
ni les sessions des Comores — même dans le code de la page —, et inversement.

| Le visiteur est… | Il voit |
|---|---|
| dans un pays **ouvert** (actif) | l'offre de ce pays, et elle seule |
| ailleurs (France, Mayotte…) ou impossible à situer | les formations présentées **en ligne**, sans tarif, sans session, sans numéro ; contact par e-mail |

Tout en bas de chaque page, un sélecteur discret « Pays » permet à un visiteur
mal reconnu (VPN, téléphone en itinérance) de choisir son pays lui-même. Il ne
montre que des noms de pays.

**Ouvrir un nouveau pays** (France, Madagascar…) : créez-le ici avec sa devise,
son indicatif, ses moyens de paiement et son WhatsApp, cochez-le **actif**, puis
donnez-lui des tarifs (onglet Formations) et des sessions en ligne. Ses visiteurs
le reçoivent aussitôt — sans rien publier.

Le **numéro WhatsApp général** des Réglages n'est plus montré à personne : seul
le numéro du pays du visiteur l'est.

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

**Les vidéos de vos classes** (section « En classe » de l'accueil) se rangent
ici aussi : une réalisation de catégorie **« En classe »**, avec le lien YouTube
de la vidéo (un Short vertical, mis en ligne en « non répertorié »). Elle quitte
alors la grille des réalisations et s'affiche dans la bande des vidéos de classe,
au format vertical. Titre conseillé : la formation et l'année (« Promotion
Canva Pro · 2025 »). La section reste invisible tant qu'aucune n'est saisie.

Comme sur les réseaux sociaux, une vidéo **démarre seule, sans le son, quand le
visiteur arrive dessus**, dans son cadre (elle ne s'ouvre pas en grand), et
s'arrête quand il la quitte. Le son, la pause et le plein écran se règlent sur
le lecteur YouTube lui-même. Rien ne se charge chez YouTube pour qui ne descend
pas jusqu'à la section ; et rien ne part seul sur un téléphone réglé en
« économie de données » ou « animations réduites » : le visiteur touche alors la
vidéo, qui se lit sur place.

Le lecteur YouTube affiche **le titre de la vidéo sur YouTube** quand elle
démarre : donnez-lui un vrai titre dans YouTube Studio (« Promotion 2026 · le
cours ») plutôt que le nom du fichier envoyé. Réglez aussi sa langue sur le
français : les sous-titres automatiques, affichés quand le son est coupé,
suivent cette langue.

Sous les vidéos, une phrase dit à chaque
visiteur comment se tiennent SES séances : « en présentiel » aux Comores, « en
ligne, en direct » à Djibouti.

### Annonces
La fenêtre qui s'ouvre à l'arrivée sur le site, et qu'une croix referme. Deux
usages :

- **Formation à la une** : une formation d'IMPACTALI mise en avant. Choisissez-la
  dans « Formation mise en avant » : le bouton mène à sa fiche, et l'annonce ne
  s'ouvre pas sur cette fiche-là. Une formation désactivée retire son annonce.
- **Publicité d'un partenaire** : toujours signalée **« Publicité · nom de
  l'annonceur »** (le nom est obligatoire). Son lien s'ouvre dans un nouvel
  onglet.

**Quand elle s'ouvre** (décisions du 9 octobre 2026) : 5 secondes après
l'arrivée ; à chaque arrivée sur l'accueil ; une fois par visite au plus sur les
fiches formation. Jamais sur la page d'inscription, les mentions légales ou ce
tableau de bord, ni devant un visiteur qui a commencé à remplir le formulaire,
qui tape dans un champ, regarde une vidéo ou a ouvert le menu. Plusieurs
annonces en ligne passent à tour de rôle (« Ordre de passage »).

**Les affiches** se montrent entières, jamais rognées ni retouchées : le texte
que vous y mettez est celui que le visiteur lit.

| Affiche | Taille conseillée | Pour |
|---|---|---|
| verticale (obligatoire) | 1080 × 1350 px (4:5, comme un post Instagram) | les téléphones, et les ordinateurs s'il n'y a pas de large |
| large (facultative) | 1600 × 900 px (16:9) | les écrans d'ordinateur |

**Les pays visés** : comme le reste de l'offre, une annonce ne part qu'aux
visiteurs des pays cochés — le serveur ne l'envoie pas ailleurs. Aucun pays
coché = tout le monde, y compris les visiteurs des pays non ouverts. Une affiche
qui porte un prix, un numéro ou une adresse doit donc viser **son seul pays**.

**Les dates** (« Du », « Au ») se comptent en jours de Moroni et de Djibouti,
bornes comprises. Pour retirer une annonce en gardant ses résultats, décochez
**« Annonce active »** ; « Supprimer » efface aussi ses affiches et ses
résultats.

**Les résultats**, sur 7 jours, 30 jours, 3 mois ou un an : les **vues** (la
fenêtre réellement ouverte devant un visiteur), les **clics** sur l'affiche ou
le bouton, avec leur part des vues, et les **fermetures**. Des totaux par jour,
anonymes, comme l'Audience (table `annonces_mesures`) : de quoi rendre compte
à un annonceur. « Une table manque dans la base » veut dire que
`supabase/migrations/20261009180000_annonces.sql` n'a pas été collé.

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

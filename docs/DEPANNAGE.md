# Dépannage

Les pannes déjà rencontrées, leur cause réelle, et ce qui les règle.

---

## « Mot de passe incorrect » alors que je suis sûr de ma phrase

**Cause la plus fréquente :** un caractère qui ne se voit pas. Une espace
emportée par un copier-coller, une espace insécable venue d'un traitement de
texte, une apostrophe courbe `’` là où le clavier tape `'`.

**Ce qui règle :** ouvrez le fichier `.gs` et **relisez la ligne 112**. C'est le
seul endroit qui fasse foi, et il est en clair. Réécrivez la phrase au clavier
— sans la coller — puis enregistrez et **redéployez une nouvelle version**.

Le champ du tableau de bord retire maintenant les espaces de début et de fin, et
le script fait le même nettoyage : ce piège-là ne peut plus se reproduire.

---

## L'écran de connexion reste sur « Vérification… »

**Ce qui est normal :** quelques secondes. Google met du temps à réveiller un
script inactif, surtout la première fois de la journée.

**Ce qui ne l'est pas :** au-delà d'une dizaine de secondes. La vérification est
désormais bornée à 8 secondes et laisse passer au-delà — c'est l'envoi suivant
qui rapporte l'échec, avec son message.

Si le problème persiste, vérifiez que l'adresse `/exec` répond :

```
https://VOTRE_ADRESSE/exec?action=version
```

---

## « Rester connecté » semble ne rien faire

**Corrigé.** La case n'était ni mémorisée ni restaurée : elle repartait décochée
à chaque visite, et l'enregistrement suivant reléguait la phrase dans un stockage
effacé à la fermeture du navigateur.

Votre choix est maintenant retenu, et la case est cochée par défaut.

---

## J'ai modifié quelque chose, le site n'a pas changé

**Attendez une minute et actualisez.** Chaque page garde le catalogue une minute
en mémoire d'onglet pour ne pas rappeler le serveur à chaque navigation.

**Si ça persiste :** regardez le bandeau en bas du tableau de bord. S'il affiche
**« Script périmé »**, Google sert encore l'ancien code — vous avez collé le
fichier sans publier une nouvelle version. Voir
[SCRIPT-GOOGLE.md](SCRIPT-GOOGLE.md).

---

## Un tarif s'affiche « À confirmer » alors que je l'ai saisi

Vérifiez que vous l'avez saisi **pour le bon pays**. Les tarifs sont par pays, et
rien n'est converti : un montant saisi pour Djibouti ne s'affiche pas aux
Comores. Voir [SESSIONS-PAR-PAYS.md](SESSIONS-PAR-PAYS.md).

---

## Une photo s'affiche mal cadrée

L'emplacement a un rapport fixe, et votre photo y est recadrée pour le remplir.
Fournissez le format attendu, et placez le sujet **dans le tiers supérieur**.
Les formats sont dans [VISUELS.md](VISUELS.md).

---

## « You do not have permission to call DriveApp »

L'étape des autorisations a été sautée à l'installation. Apps Script conserve les
anciennes permissions et n'en redemande jamais.

Ouvrez l'éditeur, choisissez **`testerInstallation`** dans le menu du haut,
cliquez ▶, et acceptez les autorisations demandées. Le journal doit afficher
« Autorisation Drive : accordée. »

---

## Je veux tout remettre à zéro

**Ne le faites pas avec « Importer le catalogue du site ».** Ce bouton écrase la
feuille par ce qui est écrit dans le code : vos tarifs, vos moyens de paiement et
vos pays saisis à la main seraient perdus.

Il n'est là que pour l'amorçage d'une installation neuve.

---

## Avant de signaler un problème

Lancez le banc d'essai :

```bash
npm run test:api
```

S'il passe, le défaut est dans les données ou dans le déploiement, pas dans le
code. S'il échoue, le message nomme le contrôle qui tombe.

---

## Un mot s'affiche en toutes lettres à la place d'une icône

Symptôme : `VIEW_MODULE`, `PALETTE`, `INBOX` apparaît en majuscules là où on
attend un pictogramme.

Cause : la police des icônes n'est pas chargée entière — elle est réduite aux
seules icônes employées, relevées automatiquement dans les sources. Une icône
écrite sous une forme que le relevé ne reconnaît pas n'entre pas dans le
fichier téléchargé, et le navigateur affiche alors son nom.

C'est arrivé quatre fois, chaque fois avec une écriture nouvelle :

| Forme dans le code | Icône perdue |
|---|---|
| `vide('inbox', …)` | `inbox` |
| `'Design & Contenu': 'palette'` | `palette`, `smart_toy` |
| `items.push(['view_module', …])` | `view_module` |

Correction :

```bash
npm run build:fonts
npm run build:fiches
```

La construction compare désormais tous les mots écrits en littéral à la liste
officielle des icônes de Google, et **nomme** ceux qu'elle n'a pas relevés :

```
⚠ noms d'icônes écrits mais NON relevés — ils s'afficheraient en toutes lettres :
      kayaking                 landing.js
```

Elle avertit sans bloquer : beaucoup de mots ordinaires — `title`, `password`,
`transform` — sont aussi des noms d'icônes. Si l'avertissement nomme une vraie
icône, ajoutez un motif dans `collectIcons` de `scripts/fetch-fonts.js` ; si ce
n'est pas une icône, ajoutez le mot à `MOTS_ORDINAIRES`.

### Vérifier depuis le navigateur

Une boîte carrée ne prouve rien : le carré vient de la feuille de style, pas de
la police. Il faut mesurer la largeur du **texte**, et la comparer à un témoin
qui ne peut pas exister :

```js
await document.fonts.ready;
const c = document.createElement('canvas').getContext('2d');
c.font = '24px "Material Symbols Outlined"';
c.measureText('view_module').width;      // 24  → un seul pictogramme
c.measureText('zzz_nexiste_pas').width;  // 360 → quinze lettres, le témoin
```

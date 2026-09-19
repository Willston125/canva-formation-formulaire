# Le script Google — installer, mettre à jour, dépanner

Le site est statique : il ne sait rien faire tout seul. C'est un script Apps
Script, attaché à une feuille Google, qui reçoit les inscriptions et sert de
base de données au tableau de bord.

Fichier : **`scripts/apps-script/impactali-inscriptions.gs`**

---

## Mettre à jour le script — les DEUX étapes

C'est l'erreur la plus coûteuse de tout ce montage, et elle ne prévient pas.

1. **Coller le fichier** dans l'éditeur Apps Script, puis **Ctrl+S**.
2. **Déployer → Gérer les déploiements → crayon → Version : « Nouvelle version »
   → Déployer.**

> ⚠️ **Coller ne suffit pas.** Google continue de servir l'ancien code tant
> qu'une nouvelle version n'est pas publiée. Les commandes répondent, le site
> semble marcher — mais avec les règles d'hier.

N'utilisez jamais **« Nouveau déploiement »** pour une mise à jour : il crée une
**autre adresse**, et le site continuerait d'appeler la précédente.

### Vérifier que c'est bien parti

Ouvrez dans le navigateur :

```
https://VOTRE_ADRESSE/exec?action=version
```

Le numéro affiché doit être celui écrit en haut du fichier que vous venez de
coller. Le tableau de bord le vérifie aussi tout seul, et affiche **« Script
périmé »** si les deux ne correspondent pas.

---

## Le mot de passe

Il est **ligne 112** du fichier, en clair :

```js
var MOT_DE_PASSE_ADMIN = 'CHANGEZ-MOI-avant-de-deployer';
```

C'est la **seule** ligne à renseigner. Rien à ouvrir dans les réglages, rien à
cocher ailleurs.

### Vous n'avez pas à la réécrire à chaque mise à jour

Le script garde une copie de votre phrase de son côté. Si vous recollez un
fichier dont la ligne 112 est restée sur sa valeur d'usine, cette copie reprend
la main : **vous entrez comme d'habitude**.

| Ligne 112 du fichier collé | Ce qui se passe |
|---|---|
| Laissée sur `CHANGEZ-MOI-avant-de-deployer` | Votre phrase mémorisée reprend la main |
| Réécrite avec votre phrase | C'est elle qui fait loi, et la copie est mise à jour |

Pour **changer** de mot de passe, il faut donc bien l'écrire ligne 112 : la copie
ne se met à jour que par le fichier.

### Choisir une bonne phrase

Longue, propre à ce site, jamais réutilisée ailleurs, en **lettres, chiffres et
tirets**. Tapez-la au clavier plutôt que de la coller : un copier-coller apporte
des caractères qui ne se voient pas — espace insécable, apostrophe courbe — et
qu'il faudrait ensuite retaper à l'identique.

---

## Première installation, sur un compte neuf

1. Créer un classeur Google Sheets vide. N'y créer **aucun onglet** : le script
   les crée lui-même.
2. Dans ce classeur : **Extensions → Apps Script**.
3. Coller le fichier, écrire le mot de passe ligne 112, enregistrer.
4. **⚙ Paramètres du projet** → cocher « Afficher le fichier manifeste
   appsscript.json », l'ouvrir, y recopier `scripts/apps-script/appsscript.json`.
5. Lancer **`testerInstallation`** (menu déroulant du haut, puis ▶). Google
   demande alors les autorisations, Drive compris. Le journal doit afficher
   « Autorisation Drive : accordée. »
6. **Déployer → Nouveau déploiement → Application web**, exécuter en tant que
   « Moi », accès « Tout le monde ». Copier l'adresse `/exec`.
7. Reporter cette adresse dans `window.SITE_ENDPOINTS.registration`
   (`formations-data.js`), publier le site.
8. Ouvrir `/admin` → Vue d'ensemble → **« Importer le catalogue du site »**.

> L'étape 4 n'est pas facultative. Apps Script conserve les anciennes
> autorisations et n'en redemande jamais : sans elle, le premier envoi d'image
> échoue sur « You do not have permission to call DriveApp… ».

**Préférez un compte Google personnel.** Un compte Workspace peut interdire par
politique la publication « accessible à tout le monde », ce qui empêcherait le
site d'enregistrer les inscriptions.

---

## Ce que le script protège

- **Les 18 commandes du tableau de bord** exigent toutes le mot de passe.
- **Le formulaire public** est ouvert — il le doit — mais gardé : nom, téléphone
  et formation obligatoires, champs trop longs tronqués, statut ramené à la liste
  connue, montants non numériques écartés, requêtes de plus de 1,5 Mo refusées.
- **Les alertes email** sont plafonnées à 60 par jour. Au-delà, les inscriptions
  continuent d'être enregistrées, sans email : épuiser le quota de Google ferait
  perdre les alertes des inscriptions suivantes — les vraies.

**Limite connue, assumée :** Apps Script n'expose pas l'adresse IP du visiteur.
Aucune limitation par IP n'est donc possible. Les garde-fous arrêtent le bruit,
pas un acharnement ciblé.

---

## Le banc d'essai

```bash
npm run test:api
```

Il exécute le **vrai** script dans un bac à sable, avec les services Google
simulés. Lancez-le après toute modification du fichier `.gs`.

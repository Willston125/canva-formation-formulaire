# Dépannage

Les pannes déjà rencontrées, leur cause réelle, et ce qui les règle.

**Premier réflexe, toujours :** ouvrez `https://www.impactali.site/api?action=version`.
Cette page dit si le site est publié, si la base répond, et ce qui est réglé dans
Vercel — sans jamais montrer une valeur :

```json
{"version":"0d4e06e","base":"ok","ms":3,"courriel":"configuré","admin":"configuré","cle":"configurée"}
```

---

## Je n'arrive pas à me connecter au tableau de bord

**Vérifiez d'abord** que vous utilisez l'e-mail et le mot de passe de votre
**compte Supabase**, pas un ancien mot de passe du tableau de bord : il n'existe
plus.

**Si le message dit « Connexion requise » juste après une connexion réussie :**
`/api?action=version` doit afficher `"admin":"configuré"`.
- `"absent"` → la variable `ADMIN_EMAIL` n'est pas réglée dans Vercel.
- `"pas un e-mail"` → elle est réglée avec autre chose qu'un e-mail (une clé
  collée par erreur, par exemple).
- Dans les deux cas, corrigez-la puis **redéployez** : une variable ne vaut
  qu'après un redéploiement. Sans elle, personne n'entre — c'est voulu.

**Si `"cle"` n'affiche pas `"configurée"`** : `SUPABASE_PUBLISHABLE_KEY` est
absente ou n'est pas une clé « publishable ». Même remède.

**Mot de passe oublié :** Supabase → Authentication → Users → votre compte →
« Send password recovery », ou définissez-en un nouveau.

**L'écran reste sur « Vérification… » ou sur une étape de la connexion :** le
bouton affiche l'étape en cours (« Connexion à Supabase… », « Lecture du
catalogue… »). Au-delà de 20 secondes, un message le dit. Vérifiez alors
`/api?action=version` : `"base"` doit valoir `"ok"`.

---

## `/api?action=version` dit que la base est injoignable

Le `code` affiché oriente, sans rien révéler :

| Code | Cause probable |
|---|---|
| `28P01` | Le mot de passe de `DATABASE_URL` est faux (changé dans Supabase ?). |
| `ENOTFOUND` | L'adresse de `DATABASE_URL` est fausse. |
| `SELF_SIGNED_CERT_IN_CHAIN`, `CERT_HAS_EXPIRED` | Le certificat vérifié (`api/_lib/supabase-ca-2021.crt`) ne correspond plus : **expire en avril 2031**. |
| `57P01`, délai dépassé | Le projet Supabase est **en pause** (une semaine sans activité). Réveillez-le depuis le tableau de bord de Supabase. La tâche quotidienne est là pour l'éviter. |

---

## « Une table manque dans la base »

Un fichier de `supabase/migrations/` n'a pas été collé dans Supabase. Ouvrez-le,
copiez-le en entier, collez-le dans **SQL Editor** → **Run**. Rien n'a été
modifié par la commande refusée.

---

## « La base a refusé cet enregistrement (règle « … »)»

Une saisie que le tableau de bord n'a pas su refuser avant la base : une valeur
hors limites, un lien qui n'est pas une page du site, un nombre trop grand. **Rien
n'a été modifié.** Le nom de la règle dit laquelle (`supabase/migrations/`).

---

## Je ne reçois plus la sauvegarde quotidienne

1. Regardez dans les courriers indésirables.
2. `/api?action=version` doit afficher `"courriel":"configuré"`. Sinon,
   `RESEND_API_KEY` manque ou n'a pas été redéployée.
3. Dans Supabase, la table `sauvegardes` porte une ligne par nuit, avec
   `envoyee` à `true` ou l'erreur d'envoi.
4. Resend (resend.com) : la clé a-t-elle expiré ? Les enregistrements DNS du
   domaine sont-ils toujours « Verified » ?

---

## Une session est refusée : « annonce 12 séances… »

Ce n'est pas une panne : une session ne peut pas annoncer plus de séances que ses
dates n'en contiennent. Le message donne le calcul. Corrigez le volume, les jours
ou les dates. Voir [TABLEAU-DE-BORD.md](TABLEAU-DE-BORD.md).

---

## J'ai modifié quelque chose, le site n'a pas changé

**Attendez une minute et actualisez.** Chaque page garde le catalogue une minute
en mémoire d'onglet pour ne pas rappeler le serveur à chaque navigation, et le
réseau de Vercel le garde 15 secondes de plus.

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

## Avant de signaler un problème

Lancez les bancs d'essai :

```bash
npm run test:base
npm run test:site
```

S'ils passent, le défaut est dans les données ou dans le déploiement, pas dans le
code. S'ils échouent, le message nomme le contrôle qui tombe.

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

---

## L'ancienne photo s'affiche avant la nouvelle

Symptôme : on actualise le site, l'ancienne bannière apparaît une à plusieurs
secondes, puis la nouvelle la remplace.

Cause : le fichier HTML porte une photo — celle du dernier déploiement — que le
navigateur peint tout de suite. La vraie photo, elle, n'est connue qu'après
interrogation de la base. Mesuré sur le site publié avant correction (au temps
de Google) : photo du fichier peinte à **384 ms**, vraie photo demandée à
**569 ms** seulement, et la réponse dépassait **3,5 secondes** à froid. L'API
actuelle répond en une à deux secondes, mais l'ordre des choses reste le même.

Deux mécanismes corrigent cela, et les deux doivent rester en place.

### 1. La mémoire d'apparence

`site-common.js` retient dans `localStorage`, sous `impactali_apparence`,
l'adresse réellement posée sur chaque visuel. Un bloc placé dans l'en-tête des
pages la rejoue **avant le premier affichage**, et précharge les photos dès la
première milliseconde.

Ce bloc est délimité par `<!-- apparence-tot:debut -->` et `<!-- apparence-tot:fin -->`,
recopié à l'identique dans `index.html` et `formations/_template/fiche.html`.
**Ne le modifiez que dans les deux à la fois**, puis relancez
`npm run build:fiches` — une épreuve vérifie que les copies restent identiques.

> **Il doit rester la première chose de l'en-tête**, avant toute feuille de
> style. Un script n'est pas exécuté tant qu'une feuille reste à charger :
> placé après elles, il ne tournait qu'à 569 ms, soit pas plus tôt que le
> script qu'il devait devancer.

### 2. Afficher d'abord, vérifier ensuite

Le cache des données vit lui aussi dans `localStorage` — dans `sessionStorage`
il mourait avec l'onglet, donc précisément entre deux visites. Il est appliqué
tout de suite **même périmé**, puis la base est interrogée et corrige en
silence ce qui a bougé.

### Vérifier

Videz le cache des données en gardant la mémoire des photos, puis rechargez :

```js
localStorage.removeItem('impactali_places');
location.reload();
```

La photo doit être la bonne **avant** que le texte du bandeau ne change. Si la
photo attend le texte, le bloc d'en-tête ne fait pas son travail.

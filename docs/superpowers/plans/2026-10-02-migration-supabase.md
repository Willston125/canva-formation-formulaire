# Passer de Google Sheets à Supabase — plan

> Rédigé le 2 octobre 2026, après l'audit complet. **Rien n'est encore construit.**
> Ce plan se valide avant la première ligne de code.

## Ce qui est décidé

| Sujet | Décision | Pourquoi |
|---|---|---|
| Base de données | **Supabase, offre gratuite** | Pas de budget pour l'offre Pro. Les deux limites de l'offre gratuite (pause, sauvegardes) sont traitées plus bas. |
| Où vit la logique | **Une API dans ce dépôt** (`/api`, fonctions Vercel), publiée à chaque `git push` comme le site | Fin du copier-coller dans Apps Script et de la « Nouvelle version » oubliée. La logique reste en JavaScript, portée depuis le script actuel. |
| Accès à la base | **Seule l'API parle à la base.** Tout accès direct depuis un navigateur est refusé (RLS activée partout, aucune règle ouverte) | Le piège classique de Supabase — une règle d'accès mal écrite qui rend les inscriptions lisibles par tous — ne peut pas se produire. |
| Tableau de bord | **Un seul compte** administrateur (Supabase Auth, e-mail + mot de passe), inscriptions publiques désactivées | Remplace le mot de passe partagé : vraie session qui expire, limites d'essais gérées par Supabase. |
| Alertes e-mail | **Resend**, envoyées au nom d'`infos@impactali.site` | Gratuit : 3 000 e-mails par mois, 100 par jour (au-dessus du plafond actuel de 60 alertes par jour). Clé limitée à l'envoi : volée, elle ne donne pas accès à la boîte. La boîte reste chez LWS. |
| Photos | **Supabase Storage** (à la place de Drive) | Un seul endroit. La suppression ne peut toucher que les photos du site. |
| Région | **Paris** pour la base et pour les fonctions | La plus proche, en pratique, de Moroni et de Djibouti. À mesurer en phase 2. |

**Le contrat ne change pas.** Le site et le tableau de bord appellent aujourd'hui
`?action=catalogue`, `?action=places`, un POST d'inscription et un POST
`{ action: 'admin.…' }`. La nouvelle API répond aux **mêmes appels, avec les mêmes
réponses**, à l'adresse `/api`. Le front change donc très peu : l'adresse, et la
connexion du tableau de bord.

## L'offre gratuite, et ses deux limites

**1. Pause après une semaine sans activité.** Supabase met en pause un projet
gratuit qui ne reçoit pas de requêtes pendant 7 jours. D'après des retours récents, une
simple lecture ne suffit plus toujours ; une **écriture** dans la base, si.

→ **Tâche quotidienne** (cron Vercel, gratuit : une fois par jour) : elle écrit une
ligne dans la table `sauvegardes`. La base ne reste donc jamais inactive.

**2. Aucune sauvegarde.** L'offre gratuite n'en fait pas.

→ La **même tâche quotidienne** exporte toutes les tables et envoie la copie à
`infos@impactali.site`. Les données sont minuscules : quelques kilo-octets. La
ligne écrite dans `sauvegardes` note la date et la taille de chaque copie.
*À vérifier en phase 3 :* pièces jointes autorisées sur l'offre gratuite de Resend.
Sinon, la copie va dans un dépôt GitHub **privé**, jamais dans ce dépôt, qui est public.

**Si la base est quand même en pause :**
- le site s'affiche avec sa copie locale (`formations-data.js`), comme aujourd'hui quand Google ne répond pas ;
- le formulaire dit que l'envoi a échoué et propose WhatsApp, comme aujourd'hui ;
- le projet se relance depuis le tableau de bord Supabase.

**Les autres limites gratuites, toutes larges pour ce site :**

| Limite | Valeur | Usage prévu |
|---|---|---|
| Base | 500 Mo | quelques Mo |
| Fichiers | 1 Go | ~50 photos de 100 à 200 Ko |
| **Bande passante** | **5 Go par mois** | La seule à surveiller : les photos chargées par les visiteurs y comptent. Elles sont en WebP et mises en cache un an. |
| E-mails (Resend) | 100 par jour | 60 alertes au plus, et 1 sauvegarde |

## Les tables

Chaque onglet de la feuille devient une table. Ce qui était rangé en JSON dans une
cellule devient une table liée quand on a besoin d'y poser des règles.

| Onglet actuel | Table(s) | Règles posées dans la base (ce que Sheets ne savait pas faire) |
|---|---|---|
| Formations | `formations` | `slug` et `form_id` uniques. `href` limité à `/formations/…` ou `/inscription/…` (audit T2). |
| Formations → `prices` | `formation_tarifs` (formation, pays, montant) | Montant > 0. Pays existant. Un tarif absent s'affiche « À confirmer ». Aucune conversion. |
| Sessions | `sessions` | Liée à une formation existante. `end_date ≥ start_date`. |
| Sessions → `parPays` | `session_pays` (session, pays, mode, lieu, tarif) | Mode « Présentiel » ou « En ligne ». Présentiel ⇒ lieu obligatoire. |
| *(nouveau)* | `sessions.jours`, `sessions.seances` | Les jours de cours et le nombre de séances deviennent des champs, plus du texte libre. L'API **refuse une session impossible**, par exemple 12 séances le mardi et le vendredi entre le 6 et le 13 octobre (audit C1). |
| Pays | `pays` | Un seul pays par défaut. Au moins un pays ouvert. |
| Pays → `paymentMethods` | `moyens_paiement` | Toute modification d'un numéro est **journalisée et signalée par e-mail** (audit S3 : on ne détourne plus un paiement en silence). |
| Portfolio | `realisations` | `image_position` au format « 50% 50% » (audit T4). Lien en http(s) uniquement. |
| Reglages / Textes | `reglages`, `textes` | Fini les apostrophes et le piège des formules : une valeur est du texte, point. |
| Images | `visuels` (clé, adresse, position, zoom) | Position 0–100, zoom 100–250. |
| Inscriptions | `inscriptions` | `statut` limité aux 4 valeurs, « En attente » par défaut. Formation, session et pays existants. Titre, date et montant **calculés par l'API**, jamais repris de la requête (audit S8). La charge brute est conservée à part. |
| *(nouveau)* | `journal` | Qui a fait quoi dans le tableau de bord, et quand. |
| *(nouveau)* | `sauvegardes` | Une ligne par sauvegarde quotidienne. |

**Les places** se calculent toujours à partir des inscriptions au statut
« Confirmé » ou « Payé ». La requête est mise en cache 15 secondes et invalidée à
chaque inscription et à chaque changement de statut (audit P1).

## Les garde-fous du formulaire public

- Statut toujours « En attente » (déjà corrigé dans le script actuel, commit `fc6d90f`).
- **Limite par visiteur** : l'API voit l'adresse IP, ce qu'Apps Script ne pouvait pas. Elle n'est jamais stockée en clair, seulement en empreinte salée.
- Un même téléphone pour la même formation n'est enregistré qu'une fois en 24 h.
- Plafond de 150 inscriptions par jour, et de 60 alertes, comme aujourd'hui.
- Toute valeur est convertie en texte et tronquée (audit S6).

## Les secrets

Le dépôt est **public**. Aucune clé n'y entre jamais.

- Les clés (base, Supabase, Resend, tâche quotidienne) sont saisies **par vous**
  dans Vercel → Settings → Environment Variables. Je ne les manipule pas.
- `.gitignore` reçoit `.env*` et `exports/`. Les exports d'inscriptions (CSV)
  contiennent des données personnelles : ils ne sont jamais versionnés.
- Une épreuve vérifie qu'aucun fichier publié ne contient une clé.
- Seule la clé « publique » de Supabase, publique par conception, va dans la page
  du tableau de bord, pour la connexion. Avec la RLS fermée, elle ne lit rien.

## Les épreuves

Le banc d'essai continue de tourner sur votre ordinateur, sans Docker, avec une
**vraie base Postgres en mémoire** (PGlite). C'est la première chose à valider (phase 1).

- Les épreuves de comportement sont **réécrites contre la nouvelle API** : abus, pays et sessions, tarifs, statuts, places, adresse du site, fichiers publiés.
- Celles qui n'éprouvent que les pièges de Sheets (formules, colonnes, émulateur Google) partent avec le script Google, en phase 5.
- Après chaque phase : une sonde en ligne avec la clé publique vérifie qu'aucune table n'est lisible depuis un navigateur.

## Les phases

**Construire à côté, basculer d'un coup.** C'est un ajustement du 2/10, fait
avant la phase 2.

Tant que le tableau de bord écrit dans la feuille, le site doit lire la feuille.
Sinon, une modification faite au tableau de bord n'apparaîtrait plus sur le site,
et une inscription confirmée ne serait plus comptée : la dernière place pourrait
être vendue deux fois.

Chaque partie de l'API est donc construite et vérifiée **en ligne, sans que le
site s'en serve**. Puis tout bascule en une seule mise en ligne, en phase 4. Le
retour arrière tient en un changement : remettre l'adresse du script Google.

### Phase 0 — Sécuriser l'existant (vous, 10 minutes)

Le chantier prendra plusieurs semaines. Le site actuel doit être sûr pendant ce temps.

- [ ] Publier la nouvelle version du script Google (`2026-10-02-statut-en-attente`).
- [ ] Archiver l'ancien déploiement `AKfycbzq…r8w` dans l'ancien projet Apps Script.

### Phase 1 — Fondations : faite le 2/10

- Projet Supabase : `https://isxkyikakrssekrxudjw.supabase.co`.
- Schéma : `supabase/migrations/20261002120000_schema.sql`, collé dans l'éditeur SQL.
- Catalogue importé (`npm run import:catalogue`, puis `exports/catalogue.sql` collé). Résultat : 5 formations, 5 sessions, 2 pays, 4 moyens de paiement, 9 tarifs, 6 réalisations, 8 photos. C'est exactement la feuille.
- Épreuves : `npm run test:base`, sur PGlite. Chacune est prouvée en régression : la RLS, le retrait des droits du navigateur, la règle du calendrier, la liste des statuts.
- Sonde en ligne : `npm run sonde`, avec la clé publique. Les 13 tables, l'écriture d'une inscription « Payé » et la fonction de calendrier sont toutes refusées.
- Ajustements en cours de route :
  - Deux formations avaient le même rang. Elles sont renumérotées dans l'ordre affiché, sans que rien ne bouge à l'écran.
  - L'export CSV des inscriptions est repoussé au jour de la bascule.

### Phase 2 — Lecture, à blanc : faite le 3/10

**Résultat :**
- `npm run comparer` : **identique** au script Google, places comprises, en **0,8 s contre 5,9 s**, mesuré depuis Le Cap.
- La base est à **Francfort** (et non Paris) : les fonctions y sont aussi (`fra1`).
- Le chiffrement est vérifié contre la racine de Supabase (`api/_lib/supabase-ca-2021.crt`, **à remplacer avant avril 2031**).
- En-têtes de sécurité actifs sur toutes les pages, `api/_lib/` en 404, ancien domaine redirigé (308).
- Sonde : tout reste fermé.
- Création de comptes fermée dans Supabase, `DATABASE_URL` saisie dans Vercel par le propriétaire.
- Le site lit toujours le script Google.

Ce qui était prévu :

- **Moi :**
  - `/api` répond à `?action=catalogue` et `?action=places` depuis Supabase, avec des fonctions en région Paris. **Le site continue de lire le script Google** ;
  - une épreuve compare, champ par champ, la réponse de `/api` à celle du script Google ;
  - premier `vercel.json` : en-têtes de sécurité (audit T3), région, redirection de l'ancien domaine (audit H3) ;
  - `api/_lib/` répond 404. Constaté le 2/10 : tant qu'aucune fonction n'existe, Vercel sert ces fichiers tels quels.
- **Vous :**
  - désactiver la création de comptes dans Supabase (Authentication → Sign In / Providers → « Allow new users to sign up ») ;
  - saisir dans Vercel l'adresse de connexion à la base (`DATABASE_URL`), mot de passe compris. **Ne me l'envoyez jamais.**
- **Fini quand :** `/api?action=catalogue` répond en ligne la même chose que le script Google, en moins d'une seconde.

### Phase 3 — Inscriptions et e-mails, à blanc (1 à 2 séances)

**État au 3/10 :** le code est en ligne (commit `f5c027c`). Il comprend :
- le POST d'inscription, avec ses garde-fous et le recalcul du tarif (`api/_lib/prix.js`, copie de `prixDe`) ;
- l'alerte par Resend ;
- la tâche quotidienne `/api/quotidien`, lancée chaque jour à 3 h UTC.

Les épreuves comptent 48 + 22 + 22 contrôles, prouvés en régression sur cinq cas. Les DNS de Resend sont en place chez LWS (DKIM, `rsend`, `send`).
**Faite et vérifiée en ligne le 3/10**, avec `RESEND_API_KEY` saisie dans Vercel par le propriétaire :
- **Sauvegarde :** la première est partie (18 Ko). Trois appels de plus ont tous répondu « déjà faite », et rien n'est reparti.
- **Inscription « ESSAI » :** une requête a été envoyée exprès avec le statut « Payé », 1 EUR et un faux titre. La base a enregistré En attente, 15000 KMF, « Canva Pro & Création de contenu » et le 10 octobre 2026. Le renvoi identique est resté une seule ligne.
- **Places et refus :** les places sont inchangées. Une liste dans un champ et une commande d'administration sont refusées.
- **E-mails :** la sauvegarde et l'alerte sont arrivées **en boîte de réception** : la signature DKIM du domaine est reconnue.
- **Nettoyage et sonde :** l'inscription de test a été effacée par le propriétaire, et la sonde trouve tout fermé.

Ce qui était prévu :

- **Vous :**
  - créer le compte Resend ;
  - ajouter chez LWS les 3 enregistrements DNS qu'il indique (je vous guide ; le SPF actuel du domaine n'est pas modifié) ;
  - saisir la clé Resend dans Vercel.
- **Moi :**
  - le POST d'inscription écrit dans Supabase, avec les garde-fous ci-dessus ;
  - l'alerte e-mail est reprise du script actuel (même contenu, même bouton WhatsApp) ;
  - la tâche quotidienne fait la sauvegarde et l'écriture qui empêche la pause ;
  - essais en ligne avec des inscriptions de test, supprimées ensuite. **Le formulaire du site envoie toujours au script Google.**
- **Fini quand :** une inscription de test arrive dans la base et déclenche l'alerte, et la première sauvegarde est reçue.

### Phase 4 — Tableau de bord, puis la bascule (2 à 3 séances)

**État au 3/10 : première partie en ligne** (commit `ad3b379`).
- `/admin/?essai` ouvre le tableau de bord sur la nouvelle base, avec une connexion par compte Supabase. Sans `?essai`, rien ne change.
- Commandes portées : connexion, catalogue, inscriptions, statut. Le statut se change par identifiant (S8), et chaque changement va au journal.
- Compte administrateur créé. `ADMIN_EMAIL` et `SUPABASE_PUBLISHABLE_KEY` sont dans Vercel.
- **Ajustement — les photos vont dans la base**, servies par le réseau de Vercel, au lieu de Supabase Storage. Dépasser les 5 Go de bande passante gratuite bloquerait tout le projet Supabase, inscriptions comprises, alors que Vercel en offre 100 Go et garde les photos en cache.
- **Reste :**
  - formations, sessions, pays, portfolio, réglages, textes, visuels ;
  - les photos ;
  - l'import ;
  - le journal des moyens de paiement ;
  - puis la bascule.

Ce qui était prévu :

- **Vous :**
  - créer votre compte administrateur (Authentication → Users → Add user) ;
  - le jour de la bascule : ne rien modifier pendant environ 15 minutes, et exporter l'onglet Inscriptions en CSV dans `exports/`, qui n'est ni versionné ni publié.
- **Moi :**
  - connexion par compte, en session de navigateur, sans « Rester connecté » coché d'office (audit T1) ;
  - les 18 commandes répondent sur `/api` ;
  - les photos passent dans Supabase Storage, avec reprise des photos Drive actuelles ;
  - ajout du journal des actions et de l'alerte quand un numéro de paiement change ;
  - **puis la bascule, en une seule mise en ligne :**
    1. ré-import du catalogue et des inscriptions ;
    2. le site, le formulaire et le tableau de bord passent sur `/api` ;
    3. le repli JSONP est retiré (audit T6) ;
    4. vérification en ligne et sonde.
- **Retour arrière :** remettre l'adresse du script Google. Les inscriptions reçues entre-temps sont recopiées dans la feuille ; il y en aura peu.
- **Fini quand :** le site, le formulaire et toutes les rubriques du tableau de bord fonctionnent sur la nouvelle base.

### Phase 5 — Fin de Google (1 séance)

- **Moi :**
  - `build:fiches` et `sync` lisent `/api` ;
  - la mécanique de version (« Script périmé ») est retirée : le code part désormais avec le site ;
  - la documentation et la mémoire du projet sont mises à jour ;
  - les épreuves liées à Sheets sont retirées.
- **Vous :** archiver le déploiement Apps Script, et garder la feuille en lecture seule comme archive.
- **Fini quand :** plus aucun appel ne part vers `script.google.com`.

**Total estimé : 6 à 9 séances, sur 2 à 4 semaines, avec une vérification en ligne
à chaque phase.**

## Risques

| Risque | Parade |
|---|---|
| Pause du projet gratuit | Écriture quotidienne. Le site se replie sur sa copie locale et sur WhatsApp. Le projet se relance depuis Supabase. |
| Perte de données (pas de sauvegarde gratuite) | Copie quotidienne envoyée par e-mail. Export manuel avant chaque phase. |
| Inscriptions lisibles par erreur | RLS fermée et aucun accès direct depuis le navigateur. Sonde en ligne après chaque déploiement. |
| Bande passante (5 Go par mois) | WebP, cache d'un an, suivi mensuel dans Supabase. |
| Clé exposée | Clés seulement dans Vercel. Épreuve anti-fuite. Dépôt à passer en privé (audit H1). |
| Démarrage à froid des fonctions | Environ 0,5 à 1 s de temps en temps, contre 5 s aujourd'hui. Le site garde sa copie locale. |
| Conditions de Vercel | L'offre gratuite est réservée à un usage non commercial : décision laissée au propriétaire, avec un risque de suspension du projet. |
| Changement des conditions de Supabase | La logique est en JavaScript sur du SQL standard : elle pourrait passer sur une autre base Postgres sans réécriture. |

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

À chaque phase, le site reste en ligne, et l'ancienne adresse peut être remise
d'un seul changement.

### Phase 0 — Sécuriser l'existant (vous, 10 minutes)

Le chantier prendra plusieurs semaines. Le site actuel doit être sûr pendant ce temps.

- [ ] Publier la nouvelle version du script Google (`2026-10-02-statut-en-attente`).
- [ ] Archiver l'ancien déploiement `AKfycbzq…r8w` dans l'ancien projet Apps Script.

### Phase 1 — Fondations (1 à 2 séances)

- **Vous :**
  - ~~créer le projet Supabase~~ — fait le 2/10 : `https://isxkyikakrssekrxudjw.supabase.co` ;
  - coller dans l'éditeur SQL de Supabase le schéma, puis le SQL du catalogue.
- **Moi, fait le 2/10 :**
  - PGlite validé (PostgreSQL 18 en mémoire, 1,5 s, sans Docker) ;
  - schéma : `supabase/migrations/20261002120000_schema.sql` ;
  - import du catalogue : `npm run import:catalogue`, qui écrit `exports/catalogue.sql` ;
  - épreuves : `npm run test:base`. Chacune est prouvée en régression : la RLS, le retrait des droits du navigateur, la règle du calendrier et la liste des statuts.
- **Ajusté en cours de route :**
  - Deux formations avaient le même rang. L'import les renumérote dans l'ordre affiché ; rien ne bouge à l'écran.
  - L'export CSV des inscriptions **passe en phase 3**. L'exporter maintenant obligerait à le refaire, puisque les inscriptions arrivent encore dans Google jusqu'à la bascule.
- **Fini quand :**
  - la base existe et contient le catalogue actuel ;
  - une sonde avec la clé publique ne lit aucune table ;
  - **rien n'a changé sur le site**.

### Phase 2 — Lecture (1 séance)

- **Moi :**
  - `/api` répond à `?action=catalogue` et `?action=places`, fonctions en région Paris ;
  - le site bascule sur `/api`, le script Google restant en secours ;
  - le repli JSONP est retiré (audit T6) ;
  - premier `vercel.json` : en-têtes de sécurité (audit T3), redirection de l'ancien domaine (audit H3), région.
- **Vous :** saisir dans Vercel l'adresse de la base et la clé de service.
- **Fini quand :** le catalogue s'affiche depuis la nouvelle base, avec un temps de réponse mesuré. Cible : moins d'une seconde, contre 4,5 à 7 aujourd'hui.

### Phase 3 — Inscriptions et e-mails (1 à 2 séances)

- **Vous :**
  - créer le compte Resend ;
  - ajouter chez LWS les 3 enregistrements DNS qu'il indique (je vous guide ; le SPF actuel du domaine n'est pas modifié) ;
  - saisir la clé Resend dans Vercel ;
  - au moment de la bascule, exporter l'onglet Inscriptions en CSV (Fichier → Télécharger) dans `exports/`, qui n'est ni versionné ni publié.
- **Moi :**
  - le POST d'inscription écrit dans Supabase, avec les garde-fous ci-dessus ;
  - l'alerte e-mail est reprise du script actuel (même contenu, même bouton WhatsApp) ;
  - la tâche quotidienne fait la sauvegarde et l'écriture qui empêche la pause ;
  - les inscriptions historiques sont importées.
- **Fini quand :** une inscription de test arrive dans la base et déclenche l'alerte, et la première sauvegarde est reçue.

### Phase 4 — Tableau de bord (2 à 3 séances)

- **Vous :**
  - créer votre compte administrateur dans Supabase Auth ;
  - désactiver les inscriptions publiques (je vous indique où).
- **Moi :**
  - connexion par compte, en session de navigateur, sans « Rester connecté » coché d'office (audit T1) ;
  - les 18 commandes répondent sur `/api` ;
  - les photos passent dans Supabase Storage, avec reprise des photos Drive actuelles ;
  - ajout du journal des actions et de l'alerte quand un numéro de paiement change.
- **Fini quand :** toutes les rubriques du tableau de bord fonctionnent sur la nouvelle base.

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

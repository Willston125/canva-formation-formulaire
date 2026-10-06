# La base Supabase — comment le site est monté

Depuis le 5 octobre 2026, les données vivent dans une base **Supabase** (offre
gratuite, hébergée à Francfort). Le site, lui, reste statique ; une petite API
dans le dépôt fait le lien.

```
visiteur ─▶ site statique (Vercel) ─▶ /api (fonctions Vercel, Francfort) ─▶ base Supabase
                                         │
                                         └─▶ e-mails (Resend, depuis infos@impactali.site)
```

**Seule l'API parle à la base.** Un navigateur, même muni de la clé publique de
Supabase, ne lit ni n'écrit rien : toutes les tables ont la sécurité par ligne
activée **sans aucune règle**, et les droits des rôles du navigateur sont
retirés. `npm run sonde` le vérifie depuis l'extérieur.

---

## Ce qu'on trouve où

| Chose | Où |
|---|---|
| Le schéma de la base | `supabase/migrations/*.sql` |
| L'API | `api/index.js` (routes), `api/_lib/*` (règles) |
| La sauvegarde quotidienne | `api/quotidien.js` |
| Les réglages de déploiement | `vercel.json` |
| Les épreuves de la base | `scripts/supabase/tests/` (`npm run test:base`) |

### Les routes de l'API

| Appel | Rôle |
|---|---|
| `GET /api?action=catalogue` | Le catalogue complet (formations, sessions, pays, portfolio, réglages, textes, visuels, places). Gardé 15 s par le réseau de Vercel. |
| `GET /api?action=places` | Les inscrits par session. |
| `GET /api?photo=<identifiant>` | Une photo téléversée depuis le tableau de bord. Gardée un an : une photo ne change jamais, la remplacer en crée une autre. |
| `GET /api?action=version` | Diagnostic : version publiée, base joignable, ce qui est réglé dans Vercel — jamais une valeur. |
| `POST /api` (sans `action`) | Une inscription du formulaire public. |
| `POST /api` (avec `action: "admin.…"`) | Une commande du tableau de bord. Exige la session de l'administrateur. |

---

## Les réglages de Vercel

Saisis par le propriétaire dans Vercel (Settings → Environment Variables), jamais
dans le dépôt, qui est public.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | La connexion à la base (le « pooler » de Supabase). |
| `RESEND_API_KEY` | L'envoi des e-mails. Une clé « Sending access » : volée, elle n'ouvre pas la boîte. |
| `ADMIN_EMAIL` | L'e-mail du seul compte autorisé au tableau de bord. **Absente, personne n'entre.** |
| `SUPABASE_PUBLISHABLE_KEY` | La clé publique, pour la page de connexion. Publique par conception. |
| `CRON_SECRET` | Facultative : si elle est réglée, seul Vercel peut lancer la tâche quotidienne. |

Une variable ne vaut qu'après un redéploiement.

---

## Les inscriptions

Le tarif, le titre de la formation, la date et la devise sont **recalculés par
l'API** : ce que le navigateur envoie n'est jamais cru sur parole. Un statut
choisi à l'inscription est ignoré — toute inscription arrive « En attente », et
seul le tableau de bord la fait avancer.

Garde-fous du formulaire public : une même inscription répétée dans les 24 h est
acceptée sans être enregistrée deux fois ; 20 envois par heure et par connexion
(on ne garde qu'une empreinte salée de l'adresse, jamais l'adresse) ; 150
inscriptions par jour au total ; au-delà de 60 par jour, plus d'alerte e-mail
(pour ne pas épuiser le quota gratuit de Resend).

---

## Le tableau de bord

La connexion se fait avec **le compte Supabase du propriétaire** (e-mail et mot
de passe). Le navigateur n'en garde qu'une session qui expire avec l'onglet.
Chaque commande présente ce jeton ; l'API le fait vérifier par Supabase, puis
compare l'e-mail à `ADMIN_EMAIL`.

Le propriétaire peut changer son mot de passe dans Supabase (Authentication →
Users). La création de comptes est fermée.

**Chaque écriture est notée au journal** (qui, quoi, quand), dans la même
transaction que l'écriture. Un changement de **moyen de paiement** envoie en plus
un e-mail à infos@impactali.site, avant et après côte à côte : un numéro de
paiement est ce qu'un intrus changerait en premier.

---

## Les photos

Elles sont **dans la base** (table `photos`), pas dans Supabase Storage : dépasser
les 5 Go de bande passante gratuite de Storage bloquerait tout le projet,
inscriptions comprises. Servies par l'API et gardées un an par Vercel, chacune ne
sort de la base qu'une fois.

Seuls WebP, JPEG et PNG entrent, vérifiés sur leurs premiers octets. Une photo
n'est effacée que si plus rien ne s'en sert.

---

## La sauvegarde — la seule

L'offre gratuite de Supabase **n'a aucune sauvegarde**, et met en pause un projet
resté une semaine sans activité. Chaque nuit (3 h, heure universelle),
`api/quotidien.js` :

1. exporte toutes les tables et envoie la copie, en pièce jointe, à
   infos@impactali.site (les photos y sont listées, pas jointes) ;
2. **écrit** une ligne dans la table `sauvegardes` — une écriture est la seule
   activité que Supabase ne peut pas ignorer.

**Gardez ces e-mails.** Si vous n'en recevez plus, ou si la table `sauvegardes`
n'a pas de ligne récente, regardez `/api?action=version` puis les journaux de
Vercel.

---

## Une copie contient des données personnelles

La sauvegarde nocturne contient les inscriptions. Elle ne se partage pas, et ne
se dépose jamais dans le dépôt (`exports/` n'est ni versionné ni publié).

**Recharger une copie** n'est pas automatisé : elle est lisible (une liste par
table, au format JSON), mais aucun outil ne la transforme encore en SQL à coller
dans Supabase. Il sera à écrire le jour où il servira, et à tester d'abord sur
une base d'essai (`npm run banc` en monte une).

---

## Modifier le schéma

1. Ajoutez un fichier daté dans `supabase/migrations/`.
2. Si c'est une table : activez la sécurité par ligne **sans règle**, et retirez
   les droits de `anon` et `authenticated` (copiez ce que font les fichiers
   existants). `npm run test:base` échoue sinon.
3. Collez-le dans l'éditeur SQL de Supabase.
4. Lancez `npm run sonde` : tout doit rester fermé.
5. Ajoutez le fichier d'API éventuel dans `api/_lib/` **et** dans la liste de
   l'épreuve `fichiers-publies`.

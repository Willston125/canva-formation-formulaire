# IMPACTALI — documentation

Site de formation statique, déployé sur Vercel, adossé à une base **Supabase**
par une petite API qui vit dans le dépôt (`api/`). Administration à `/admin`.

Depuis le **5 octobre 2026**, plus rien ne passe par Google : ni le catalogue, ni
les inscriptions, ni les photos. L'ancien script Apps Script et ses épreuves ont
été retirés du dépôt le 6 octobre ; son code reste dans l'historique git
(`git show 0d4e06e:scripts/apps-script/impactali-inscriptions.gs`).

---

## Par où commencer

| Vous voulez… | Lisez |
|---|---|
| Modifier le contenu du site | [TABLEAU-DE-BORD.md](TABLEAU-DE-BORD.md) |
| Régler une session selon le pays | [SESSIONS-PAR-PAYS.md](SESSIONS-PAR-PAYS.md) |
| Remplacer une photo | [VISUELS.md](VISUELS.md) |
| Comprendre comment le site est monté, ou le réparer | [BASE-SUPABASE.md](BASE-SUPABASE.md) |
| Comprendre une panne | [DEPANNAGE.md](DEPANNAGE.md) |

---

## Les trois règles qui ne se négocient pas

**On n'invente jamais une donnée.** Pas de date, pas de tarif, pas de lieu, pas
de témoignage, pas de certification. Une valeur non saisie s'annonce
« À confirmer ».

**Aucune conversion de devise.** Les tarifs sont saisis pays par pays, à la
main. `7 500 FDJ` ne devient jamais `7 500 KMF`.

**Les photos ne sont pas recolorées.** Ni saturation, ni contraste, ni
assombrissement : elles s'affichent telles qu'elles ont été fournies.

---

## Les pièges du montage

Ils sont tenus par des épreuves, mais mieux vaut les connaître.

**Une variable de Vercel ne vaut qu'après un redéploiement.** On la saisit, rien
ne change : il faut republier. `/api?action=version` dit, sans jamais montrer la
valeur, ce qui est réglé.

**Une nouvelle table ne se crée pas toute seule.** Chaque fichier de
`supabase/migrations/` se **colle à la main** dans l'éditeur SQL de Supabase
(SQL Editor → coller → Run). Tant que ce n'est pas fait, la commande concernée
répond « Une table manque dans la base ».

**Le projet gratuit de Supabase se met en pause après une semaine sans activité,
et n'a aucune sauvegarde.** La tâche quotidienne (`api/quotidien.js`) traite les
deux : elle écrit une ligne chaque nuit et envoie une copie complète à
infos@impactali.site. **Gardez ces e-mails**, ce sont les seules sauvegardes.

**Les fiches sont générées.** `formations/<slug>/index.html` et
`inscription/index.html` ne se modifient **jamais** à la main : on édite
`formations/_template/fiche.html` puis on lance `npm run build:fiches`.

**Tout fichier de l'API vit dans `api/_lib/`**, jamais dans `scripts/` ni dans un
dossier exclu par `.vercelignore` : ce qui est exclu du site l'est aussi des
fonctions. Une épreuve (`fichiers-publies`) le vérifie.

---

## Commandes

```bash
npm run test:base        # l'API et la base, sur un vrai Postgres en mémoire
npm run test:site         # le site et le tableau de bord (26 suites)
npm run banc             # le site + la vraie API sur une base d'essai, en local
npm run sonde            # la base vue de l'extérieur : tout doit être fermé
npm run sync             # réaligne formations ET sessions de formations-data.js sur la base
npm run build:fiches     # régénère les fiches, depuis la BASE
npm run build:css        # recompile Tailwind
npm run build:fonts      # reconstruit les polices auto-hébergées
```

**`npm run sync` avant toute publication.** `formations-data.js` porte une copie
du catalogue : c'est elle qui s'affiche pendant la seconde où l'API n'a pas
encore répondu, elle qui sert de repli quand la base est injoignable, et elle
que lit `build:fiches -- --du-fichier`. Sans réalignement, l'accueil montrait une
carte fantôme — une formation retirée du tableau de bord que le fichier annonçait
encore. Les deux scripts refusent d'écrire une liste vide ou une réponse
incomplète, et ne suppriment jamais de page : ils signalent celles restées en
place.

**`build:fiches` lit la base, pas le fichier.** La commande nue lisait autrefois
`formations-data.js`, et republiait donc les fiches avec la version du dépôt — un
programme, une FAQ ou une accroche corrigés dans le tableau de bord étaient
ramenés en arrière. Deux options, à ne sortir qu'à bon escient :

```bash
npm run build:fiches -- --du-fichier   # repli assumé : publie les données du dépôt
npm run build:fiches -- --nettoyer     # retire les fiches sans formation dans la base
```

Une base injoignable **arrête** la génération. Se rabattre sur le fichier
écraserait ce qui a été saisi depuis le tableau de bord, et rien ne le dirait.

Chaque contrôle des deux bancs d’essai a été prouvé en régression : on remet le
défaut, on vérifie qu'il échoue, on restaure.

---

## Ce qui reste ouvert

- **L'écran de réglage du cadrage des photos** — commencé, ni terminé ni relu,
  sur la branche `cadrage-visuels-ecran-reglage`.
- **Les 12 marchés francophones** déclarés dans le code mais pas créés dans la
  base. À trancher : deux marchés physiques, ou des sessions en ligne ouvertes
  à tous.
- **Le certificat de la base expire en avril 2031.** `api/_lib/supabase-ca-2021.crt`
  est à remplacer avant : sans cela, l'API ne se connecte plus.
- **Recharger une sauvegarde** : la copie envoyée chaque nuit est lisible (une
  liste par table), mais aucun outil ne la transforme encore en SQL à coller. À
  écrire le jour où il servira, en la testant sur une base d'essai.
- **Le script Google, encore déployé chez Google**, doit être archivé par le
  propriétaire (Apps Script → Déployer → Gérer les déploiements). Le site ne s'en
  sert plus.

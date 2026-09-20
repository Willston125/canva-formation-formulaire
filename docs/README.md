# IMPACTALI — documentation

Site de formation statique, déployé sur Vercel, adossé à une feuille Google
pilotée par un script Apps Script. Administration à `/admin`.

---

## Par où commencer

| Vous voulez… | Lisez |
|---|---|
| Modifier le contenu du site | [TABLEAU-DE-BORD.md](TABLEAU-DE-BORD.md) |
| Régler une session selon le pays | [SESSIONS-PAR-PAYS.md](SESSIONS-PAR-PAYS.md) |
| Remplacer une photo | [VISUELS.md](VISUELS.md) |
| Installer ou mettre à jour le script Google | [SCRIPT-GOOGLE.md](SCRIPT-GOOGLE.md) |
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

Trois choses se sont retournées contre nous plus d'une fois. Elles sont tenues
par des épreuves, mais mieux vaut les connaître.

**Coller le script ne suffit pas.** Google sert un instantané du code : il faut
publier une **nouvelle version** du déploiement. Sans cela les commandes
répondent, mais avec les règles d'hier — et rien ne le signale.

**Les fiches sont générées.** `formations/<slug>/index.html` et
`inscription/index.html` ne se modifient **jamais** à la main : on édite
`formations/_template/fiche.html` puis on lance `npm run build:fiches`.

**Une valeur commençant par `=`, `+` ou `-` devient une formule** dans une
feuille Google. Un numéro `+253 77…` s'y transformait en `#ERROR!`. Le script
les protège, mais toute nouvelle écriture doit passer par les mêmes fonctions.

---

## Commandes

```bash
npm run sync             # réaligne formations ET sessions sur la feuille
npm run sync:formations  # les formations seules
npm run sync:sessions    # les sessions seules
npm run test:api         # le banc d’essai : 32 suites
npm run build:fiches     # régénère les fiches, depuis la BASE
npm run build:css        # recompile Tailwind
npm run build:fonts      # reconstruit les polices auto-hébergées
```

**`npm run sync` avant toute publication.** `formations-data.js` porte une copie
du catalogue : c'est elle qui s'affiche pendant la seconde où l'API n'a pas
encore répondu, elle qui sert de repli quand la feuille est injoignable, et elle
que lit `build:fiches -- --du-fichier`. Sans réalignement, l'accueil montrait une
carte fantôme — une formation retirée du tableau de bord que le fichier annonçait
encore. Les deux scripts refusent d'écrire une liste vide ou une réponse
incomplète, et ne suppriment jamais de page : ils signalent celles restées en
place.

**`build:fiches` lit la base, pas le fichier.** C'est ce qui a changé le
20 septembre 2026 : la commande nue lisait `formations-data.js`, et republiait
donc les fiches avec la version du dépôt — un programme, une FAQ ou une
accroche corrigés dans le tableau de bord étaient ramenés en arrière, par la
commande même que cette page recommandait.

Deux options, à ne sortir qu'à bon escient :

```bash
npm run build:fiches -- --du-fichier   # repli assumé : publie les données du dépôt
npm run build:fiches -- --nettoyer     # retire les fiches sans formation dans la base
```

Une base injoignable **arrête** la génération. Se rabattre sur le fichier
écraserait ce qui a été saisi depuis le tableau de bord, et rien ne le dirait.

Le banc d'essai exécute le **vrai** script Apps Script dans un bac à sable, avec
les services Google simulés. Chaque contrôle qu'il porte a été prouvé en
régression : on remet le défaut, on vérifie qu'il échoue, on restaure.

---

## Ce qui reste ouvert

- **L'écran de réglage du cadrage des photos** — commencé, ni terminé ni relu,
  sur la branche `cadrage-visuels-ecran-reglage`.
- **Les 12 marchés francophones** déclarés dans le code mais pas créés dans la
  feuille. À trancher : deux marchés physiques, ou des sessions en ligne ouvertes
  à tous.
- **Aucune limitation par IP** sur le formulaire public — Apps Script n'expose
  pas l'adresse du visiteur. Limite assumée, documentée dans
  [SCRIPT-GOOGLE.md](SCRIPT-GOOGLE.md).

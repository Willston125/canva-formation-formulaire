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
npm run test:api       # le banc d’essai : 22 suites
npm run build:fiches   # régénère les fiches depuis le gabarit
npm run build:css      # recompile Tailwind
npm run build:fonts    # reconstruit les polices auto-hébergées
```

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

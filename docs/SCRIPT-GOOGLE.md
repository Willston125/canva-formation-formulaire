# L'ancien script Google — archive

**Le site ne s'en sert plus depuis le 5 octobre 2026.** Le catalogue, les
inscriptions et les photos passent par la base Supabase
([BASE-SUPABASE.md](BASE-SUPABASE.md)). Cette page dit ce qui reste de l'ancien
montage, comment revenir en arrière si besoin, et comment le fermer pour de bon.

---

## Ce qui reste

| Chose | Où | État |
|---|---|---|
| Le script déployé chez Google | Apps Script, ancien projet | **Toujours en ligne**, sans plus aucun appel du site |
| La feuille Google | Google Sheets | Gelée au 5 octobre : ne reçoit plus rien |
| Les photos d'avant | Google Drive | Copiées dans la base ; les originaux restent dans Drive |
| Le code du script | `scripts/apps-script/impactali-inscriptions.gs` | Gardé pour le retour arrière |
| Son banc d'essai | `scripts/apps-script/tests/` | Gardé : il contient aussi des épreuves du **site** |
| L'adresse du script | `scripts/supabase/google.js` | Sert au retour arrière et à `npm run comparer` |

**Un ancien déploiement est un risque tant qu'il répond.** Il porte l'ancien mot
de passe partagé, et quiconque en connaît l'adresse peut encore l'interroger.
Fermez-le dès que le retour arrière n'est plus voulu.

---

## Revenir en arrière

Possible tant que le script est en ligne et la feuille intacte.

1. Dans le dépôt, annulez la bascule : `git revert` du commit
   « Bascule : le site, le formulaire et le tableau de bord passent sur la base »
   et des commits de nettoyage qui l'ont suivi, ou remettez simplement dans
   `formations-data.js` l'adresse de `scripts/supabase/google.js`.
2. Publiez. Le site relit la feuille.
3. **Les inscriptions reçues depuis le 5 octobre sont dans la nouvelle base, pas
   dans la feuille.** Recopiez-les à la main dans l'onglet Inscriptions.

Plus le temps passe, plus ce retour coûte : les modifications faites depuis dans
le tableau de bord ne sont pas, elles non plus, dans la feuille.

---

## Fermer pour de bon

À faire quand vous êtes sûr de ne plus revenir en arrière — quelques jours de
fonctionnement normal suffisent en général.

1. **Archivez le déploiement.** Éditeur Apps Script → Déployer → Gérer les
   déploiements → l'ancien déploiement → l'archiver. L'adresse cesse de répondre.
2. **Gardez la feuille** en lecture seule, comme archive des inscriptions
   d'avant le 5 octobre.
3. **Allégez le dépôt**, si vous le souhaitez : le dossier
   `scripts/apps-script/` (le `.gs` et son émulateur), `scripts/supabase/google.js`
   et la commande `npm run comparer` n'ont plus d'usage. Attention : plusieurs
   épreuves de ce dossier vérifient le **site** (noms de fonctions, fichiers
   publiés, formulaires, textes…) et doivent être déplacées avant de le supprimer.

---

## Ce que l'ancien montage avait comme limites

Pour mémoire, et parce que la base les lève :

- un mot de passe partagé, essayable sans limite, gardé en clair dans le
  navigateur → remplacé par un compte Supabase, avec une session qui expire ;
- aucune limitation du formulaire public par visiteur (Apps Script n'expose pas
  l'adresse) → 20 envois par heure et par connexion ;
- un statut d'inscription que le visiteur pouvait forger (« Payé ») → toute
  inscription arrive « En attente » ;
- des sessions qui annonçaient plus de séances que le calendrier n'en permet →
  désormais refusées ;
- une feuille qui transformait un numéro `+253…` en formule `#ERROR!` → plus de
  feuille.

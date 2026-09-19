# Réglage du cadrage des visuels — plan d'implémentation

> **Pour l'ouvrier agentique :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`).

**But :** permettre de régler le cadrage d'une photo remplacée depuis `/admin`
(position et zoom), de façon réversible, et retirer les filtres qui recolorent
les photos.

**Architecture :** le cadrage est rangé à côté de l'adresse, dans une troisième
colonne de l'onglet `Images`. Il est appliqué en style en ligne sur les seules
images remplacées, ce qui l'emporte sur les règles CSS au sélecteur — y compris
celles au rang (`:nth-child`). L'envoi cesse de graver le recadrage dans le
fichier, faute de quoi les deux se cumuleraient.

**Outils :** HTML/CSS statique, JavaScript ES5 côté `admin/admin.js` et Apps
Script, ES6 côté `site-common.js`. Banc d'essai maison : des scripts Node dans
`scripts/apps-script/tests/`, lancés par `npm run test:api`, qui exécutent le
vrai `.gs` dans un `vm` avec les services Google simulés.

**Spécification :** `docs/superpowers/specs/2026-09-19-reglage-cadrage-visuels-design.md`

**Conventions du dépôt à respecter :**
- Les fiches `formations/<slug>/index.html` sont **générées**. Ne jamais les
  éditer à la main : modifier `formations/_template/fiche.html` puis lancer
  `npm run build:fiches`.
- Commentaires et messages en français.
- Chaque nouveau contrôle doit être **prouvé en régression** : on retire le
  correctif, on vérifie que le contrôle échoue, on restaure.

---

### Task 1 : Retirer les six filtres qui recolorent les photos

**Fichiers :**
- Modifier : `style.css` (lignes 1479, 1918, 1981, 2578, 3686, 3850)
- Créer : `scripts/apps-script/tests/filtres-photo.test.js`
- Modifier : `scripts/apps-script/tests/run.js`

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `scripts/apps-script/tests/filtres-photo.test.js` :

```js
/* Aucune règle ne doit recolorer une photo.
 *
 * Six déclarations `filter:` étaient calibrées sur les visuels livrés avec le
 * design : saturation, contraste et luminosité y étaient retouchés. Toute photo
 * posée à leur place héritait de la retouche, ce qui la dénaturait.
 *
 * Les `backdrop-filter` ne sont PAS concernés : ils floutent des cartouches de
 * texte posés par-dessus une photo, ils ne touchent pas la photo elle-même. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Sélecteurs qui désignent une photo. Ils sont nommés un par un : un contrôle
   qui chercherait « toute règle contenant img » attraperait aussi les vignettes
   du tableau de bord et les illustrations, et deviendrait ingouvernable. */
const SELECTEURS_PHOTO = [
  '.landing-hero__visual img',
  '.method-step img',
  '.training-dialog > img',
  '.trainer__photo img',
  '.training-dialog__media img',
  '.front .img'
];

const css = fs.readFileSync(path.join(RACINE, 'style.css'), 'utf8');

/** Déclarations `filter:` (jamais `backdrop-filter:`) d'une règle donnée. */
function filtresDe(selecteur) {
  const trouves = [];
  const lignes = css.split('\n');
  let dansLaRegle = false;
  lignes.forEach((ligne, i) => {
    const avantAccolade = ligne.split('{')[0];
    if (ligne.includes('{') && avantAccolade.split(',').some(s => s.trim() === selecteur)) {
      dansLaRegle = true;
      return;
    }
    if (dansLaRegle && ligne.includes('}')) { dansLaRegle = false; return; }
    if (dansLaRegle && /(^|[^-])\bfilter\s*:/.test(ligne)) {
      trouves.push({ ligne: i + 1, texte: ligne.trim() });
    }
  });
  return trouves;
}

SELECTEURS_PHOTO.forEach(sel => {
  verifier('aucun filtre sur « ' + sel + ' »', filtresDe(sel), []);
});

/* Le contrôle ne vaut que s'il sait reconnaître un filtre : sans cette preuve,
   il passerait aussi sur un fichier où rien n'aurait été retiré. */
const temoin = '.temoin-de-controle {\n  filter: saturate(0.5);\n}';
const cssAvant = css;
verifier('le contrôle sait repérer un filtre (témoin)',
  (() => {
    const lignes = temoin.split('\n');
    return lignes.some(l => /(^|[^-])\bfilter\s*:/.test(l));
  })(), true);
verifier('et il ne confond pas backdrop-filter',
  /(^|[^-])\bfilter\s*:/.test('  backdrop-filter: blur(8px);'), false);

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);
```

- [ ] **Étape 2 : lancer l'épreuve pour la voir échouer**

```bash
node scripts/apps-script/tests/filtres-photo.test.js
```

Attendu : ÉCHEC sur `.landing-hero__visual img`, `.method-step img`,
`.training-dialog > img`, `.trainer__photo img` et `.training-dialog__media img`
— cinq sélecteurs porteurs d'un filtre. `.front .img` doit déjà passer.

- [ ] **Étape 3 : retirer les six déclarations**

Supprimer ces lignes de `style.css`, en gardant le reste de chaque règle :

| Ligne | À supprimer |
|---|---|
| 1479 | `filter: saturate(0.95) contrast(1.06) brightness(0.9);` |
| 1918 | `filter: saturate(0.85) contrast(1.02);` |
| 1981 | `filter: saturate(0.82) brightness(0.72);` |
| 2578 | `filter: saturate(0.95) contrast(1.06) brightness(0.9);` |
| 3686 | `filter: none;` |
| 3850 | `filter: saturate(0.9) contrast(1.05) brightness(0.86);` |

Le commentaire de la ligne 1478 (« Le liseré vert néon de la photo d'origine
passe en orange chaleureux ») décrit le filtre retiré : le supprimer aussi.

Les numéros se décalent à chaque suppression : les traiter **du plus grand au
plus petit** (3850, 3686, 2578, 1981, 1918, 1479).

- [ ] **Étape 4 : relancer l'épreuve**

```bash
node scripts/apps-script/tests/filtres-photo.test.js
```

Attendu : `Tous les contrôles passent.`

- [ ] **Étape 5 : inscrire l'épreuve au banc d'essai**

Dans `scripts/apps-script/tests/run.js`, ajouter à la fin du tableau `EPREUVES` :

```js
  ['filtres-photo.test.js', 'Aucune regle ne recolore une photo']
```

Ne pas oublier la virgule sur la ligne précédente.

- [ ] **Étape 6 : lancer tout le banc d'essai**

```bash
npm run test:api
```

Attendu : `Toutes les épreuves passent.`

- [ ] **Étape 7 : prouver la régression**

Remettre une seule déclaration, par exemple dans `.method-step img` :
`filter: saturate(0.85) contrast(1.02);`. Relancer
`node scripts/apps-script/tests/filtres-photo.test.js` : l'épreuve doit
**échouer** sur ce sélecteur. Puis retirer de nouveau la déclaration et vérifier
que tout repasse.

- [ ] **Étape 8 : commit**

```bash
git add style.css scripts/apps-script/tests/filtres-photo.test.js scripts/apps-script/tests/run.js
git commit -m "Plus aucune regle ne recolore une photo"
```

---

### Task 2 : Le script Google range un cadrage à côté de l'adresse

**Fichiers :**
- Modifier : `scripts/apps-script/impactali-inscriptions.gs`
- Créer : `scripts/apps-script/tests/cadrage-visuels.test.js`
- Modifier : `scripts/apps-script/tests/run.js`

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `scripts/apps-script/tests/cadrage-visuels.test.js` :

```js
/* Le cadrage d'un visuel se range dans une TROISIÈME colonne de l'onglet Images.
 *
 * `lirePaires` et `ecrirePaires` servent aussi aux Textes et aux Réglages : les
 * élargir propagerait le risque à des onglets qui n'ont rien demandé. L'onglet
 * Images reçoit donc son propre couple de lecture et d'écriture.
 *
 * Une feuille déjà remplie n'a que deux colonnes : elle doit continuer de
 * fonctionner sans migration, en rendant simplement des cadrages vides. */
'use strict';

const path = require('path');
const CHEMIN_GS = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};
const evaluer = (code) => require('vm').runInContext(code, bac);
const poste = (charge) => JSON.parse(bac.doPost({ postData: { contents: JSON.stringify(
  Object.assign({ motDePasse: 'motdepasse-de-test' }, charge)) } })._t);
const catalogue = () => JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);

// --- 1. Une feuille vierge : ni visuel ni cadrage ---
verifier('catalogue vierge : aucun visuel', catalogue().images, {});
verifier('catalogue vierge : aucun cadrage', catalogue().cadrages, {});

// --- 2. Un visuel sans cadrage reste une simple adresse ---
poste({ action: 'admin.images.save', donnees: { 'accueil.hero': 'https://exemple/photo.webp' } });
verifier('l’adresse est rendue telle quelle',
  catalogue().images['accueil.hero'], 'https://exemple/photo.webp');
verifier('et son cadrage est absent', catalogue().cadrages['accueil.hero'], undefined);

// --- 3. Un cadrage est écrit puis relu à l'identique ---
poste({ action: 'admin.images.save',
  donnees: { 'accueil.hero': 'https://exemple/photo.webp' },
  cadrages: { 'accueil.hero': { x: 40, y: 22, zoom: 135 } } });
verifier('le cadrage se relit à l’identique',
  catalogue().cadrages['accueil.hero'], { x: 40, y: 22, zoom: 135 });
verifier('et l’adresse n’a pas bougé',
  catalogue().images['accueil.hero'], 'https://exemple/photo.webp');

// --- 4. Les valeurs aberrantes sont bornées, jamais propagées ---
poste({ action: 'admin.images.save',
  donnees: { 'accueil.hero': 'https://exemple/photo.webp' },
  cadrages: { 'accueil.hero': { x: -40, y: 900, zoom: 5000 } } });
verifier('les valeurs aberrantes sont ramenées dans leurs bornes',
  catalogue().cadrages['accueil.hero'], { x: 0, y: 100, zoom: 250 });

poste({ action: 'admin.images.save',
  donnees: { 'accueil.hero': 'https://exemple/photo.webp' },
  cadrages: { 'accueil.hero': { x: 'gauche', y: null, zoom: 'beaucoup' } } });
verifier('un cadrage illisible est ignoré, sans casser la lecture',
  catalogue().cadrages['accueil.hero'], undefined);
verifier('et l’adresse survit à un cadrage illisible',
  catalogue().images['accueil.hero'], 'https://exemple/photo.webp');

// --- 5. Une adresse vide efface la ligne ENTIÈRE, cadrage compris ---
poste({ action: 'admin.images.save',
  donnees: { 'accueil.hero': 'https://exemple/photo.webp' },
  cadrages: { 'accueil.hero': { x: 40, y: 22, zoom: 135 } } });
verifier('préalable : le cadrage est bien en place',
  catalogue().cadrages['accueil.hero'], { x: 40, y: 22, zoom: 135 });
poste({ action: 'admin.images.save', donnees: { 'accueil.hero': '' } });
verifier('une adresse vide efface l’adresse', catalogue().images['accueil.hero'], undefined);
verifier('et emporte le cadrage avec elle',
  catalogue().cadrages['accueil.hero'], undefined);

// --- 6. Une feuille à deux colonnes continue de fonctionner ---
/* C'est l'état de toutes les installations existantes : la troisième colonne
   n'existe pas encore. Rien ne doit se casser, et le site doit rester
   exactement tel qu'il est. */
const feuille = bac.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Images');
feuille.clear();
feuille.appendRow(['cle', 'valeur']);
feuille.appendRow(['accueil.methode.1', 'https://exemple/ancienne.webp']);
verifier('une feuille à deux colonnes rend bien son adresse',
  catalogue().images['accueil.methode.1'], 'https://exemple/ancienne.webp');
verifier('et rend un cadrage vide plutôt qu’une erreur',
  catalogue().cadrages['accueil.methode.1'], undefined);

// --- 7. Les autres onglets clé/valeur ne sont pas touchés ---
poste({ action: 'admin.textes.save', donnees: { 'accueil.chiffre.1': '6 formations' } });
verifier('les textes continuent de fonctionner',
  catalogue().textes['accueil.chiffre.1'], '6 formations');

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);
```

- [ ] **Étape 2 : lancer l'épreuve pour la voir échouer**

```bash
node scripts/apps-script/tests/cadrage-visuels.test.js
```

Attendu : ÉCHEC dès le deuxième contrôle — `catalogue().cadrages` vaut
`undefined`, la clé n'existe pas encore.

- [ ] **Étape 3 : ajouter la lecture, l'écriture et les bornes**

Dans `scripts/apps-script/impactali-inscriptions.gs`, remplacer la ligne 929 :

```js
/** Visuels du site remplaces depuis le tableau de bord (cle -> adresse). */
function lireImages() { return lirePaires(F_IMAGES); }
```

par :

```js
/**
 * Visuels du site remplacés depuis le tableau de bord (clé → adresse).
 *
 * L'onglet Images porte une TROISIÈME colonne, `cadrage`, que les autres
 * onglets clé/valeur n'ont pas. On ne passe donc pas par `lirePaires` : elle
 * sert aussi aux Textes et aux Réglages, et l'élargir propagerait le risque à
 * des onglets qui n'ont rien demandé.
 *
 * Une feuille à deux colonnes — l'état de toute installation antérieure — rend
 * simplement des cadrages vides. Aucune migration n'est nécessaire.
 */
function lireImages() {
  var feuille = onglet(F_IMAGES);
  var valeurs = feuille.getDataRange().getValues();
  var o = {};
  for (var i = 1; i < valeurs.length; i++) {
    var cle = String(valeurs[i][0] || '').trim();
    if (!cle) continue;
    o[cle] = valeurReglage(valeurs[i][1]);
  }
  return o;
}

/** Cadrage de chaque visuel remplacé : { x, y, zoom } en pourcentages. */
function lireCadrages() {
  var feuille = onglet(F_IMAGES);
  var valeurs = feuille.getDataRange().getValues();
  var o = {};
  for (var i = 1; i < valeurs.length; i++) {
    var cle = String(valeurs[i][0] || '').trim();
    if (!cle) continue;
    var cadre = normaliserCadrage(valeurs[i][2]);
    if (cadre) o[cle] = cadre;
  }
  return o;
}

/**
 * Ramène un cadrage à une forme sûre, ou rend null.
 *
 * Un zoom sous 100 laisserait du vide autour de la photo : l'emplacement ne
 * serait plus rempli. Au-delà de 250, il ne reste qu'un détail méconnaissable.
 * Une valeur illisible est ignorée plutôt que propagée : mieux vaut un cadrage
 * neutre qu'un affichage cassé.
 */
function normaliserCadrage(brut) {
  var o = brut;
  if (typeof o === 'string') {
    var t = o.trim();
    if (!t) return null;
    try { o = JSON.parse(t); } catch (e) { return null; }
  }
  if (!o || typeof o !== 'object') return null;
  var x = Number(o.x), y = Number(o.y), zoom = Number(o.zoom);
  if (isNaN(x) || isNaN(y) || isNaN(zoom)) return null;
  var borner = function (v, bas, haut) { return Math.max(bas, Math.min(haut, Math.round(v))); };
  return { x: borner(x, 0, 100), y: borner(y, 0, 100), zoom: borner(zoom, 100, 250) };
}
```

- [ ] **Étape 4 : écrire les deux colonnes ensemble**

Toujours dans le même fichier, remplacer `enregistrerImages` (ligne 986) :

```js
function enregistrerImages(donnees) {
  ecrirePaires(F_IMAGES, donnees, 'Visuels invalides.');
  return { ok: true, catalogue: lireCatalogue() };
}
```

par :

```js
/**
 * Visuels du site. Une adresse vide REMET l'image d'origine : la ligne entière
 * est effacée, cadrage compris, et la page réaffiche ce que son HTML contient.
 * C'est le moyen d'annuler un remplacement sans rien reverser.
 *
 * L'écriture porte sur trois colonnes, et se fait en une seule fois : les
 * visuels se comptent par dizaines, et les traiter un par un coûterait autant
 * d'allers-retours chez Google que de clés.
 */
function enregistrerImages(donnees, cadrages) {
  if (!donnees || typeof donnees !== 'object') throw new Error('Visuels invalides.');
  cadrages = cadrages && typeof cadrages === 'object' ? cadrages : {};

  var feuille = onglet(F_IMAGES);
  assurerEntetes(feuille, ['cle', 'valeur', 'cadrage']);

  var grille = feuille.getDataRange().getValues();
  var ordre = [], table = {};
  for (var i = 1; i < grille.length; i++) {
    var existante = String(grille[i][0] || '').trim();
    if (!existante) continue;
    if (!Object.prototype.hasOwnProperty.call(table, existante)) ordre.push(existante);
    table[existante] = { valeur: grille[i][1], cadrage: grille[i][2] };
  }

  Object.keys(donnees).forEach(function (cle) {
    var brut = donnees[cle];
    /* Le vide porte sur l'ADRESSE : un cadrage seul ne suffit pas à garder la
       ligne, sans quoi « retirer le remplacement » laisserait une ligne
       fantôme que plus rien ne viendrait effacer. */
    if (brut === null || brut === undefined || String(brut).trim() === '') {
      delete table[cle];
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(table, cle)) ordre.push(cle);
    var cadre = normaliserCadrage(cadrages[cle]);
    table[cle] = {
      valeur: forcerTexte(typeof brut === 'string' ? brut : JSON.stringify(brut)),
      cadrage: cadre ? JSON.stringify(cadre) : ''
    };
  });

  var corps = ordre
    .filter(function (cle) { return Object.prototype.hasOwnProperty.call(table, cle); })
    .map(function (cle) { return [cle, table[cle].valeur, table[cle].cadrage]; });

  // On efface l'ancien corps avant de réécrire : sinon une clé supprimée subsisterait
  var anciennes = Math.max(0, grille.length - 1);
  if (anciennes) feuille.getRange(2, 1, anciennes, 3).clearContent();
  if (corps.length) feuille.getRange(2, 1, corps.length, 3).setValues(corps);

  return { ok: true, catalogue: lireCatalogue() };
}
```

- [ ] **Étape 5 : exposer les cadrages et transmettre la charge**

Dans `lireCatalogue` (ligne 512), ajouter après `images: lireImages(),` :

```js
    cadrages: lireCadrages(),
```

Dans `commandeAdmin`, remplacer la ligne `case 'admin.images.save'` :

```js
      case 'admin.images.save':      return repondre(enregistrerImages(d.donnees), null);
```

par :

```js
      case 'admin.images.save':      return repondre(enregistrerImages(d.donnees, d.cadrages), null);
```

- [ ] **Étape 6 : relancer l'épreuve**

```bash
node scripts/apps-script/tests/cadrage-visuels.test.js
```

Attendu : `Tous les contrôles passent.`

- [ ] **Étape 7 : inscrire l'épreuve et lancer le banc complet**

Dans `run.js`, ajouter au tableau `EPREUVES` :

```js
  ['cadrage-visuels.test.js', 'Cadrage range a cote de l adresse du visuel']
```

Puis :

```bash
npm run test:api
```

Attendu : `Toutes les épreuves passent.` Si `installation-neuve.test.js` échoue
sur le nombre d'opérations Sheets, c'est que `lireCadrages` relit la feuille une
seconde fois : mettre en cache la grille lue dans `lireImages` plutôt que
d'augmenter le plafond.

- [ ] **Étape 8 : prouver la régression**

Dans `normaliserCadrage`, remplacer la ligne des bornes par
`return { x: x, y: y, zoom: zoom };`. Relancer
`node scripts/apps-script/tests/cadrage-visuels.test.js` : le contrôle
« les valeurs aberrantes sont ramenées dans leurs bornes » doit échouer.
Restaurer.

- [ ] **Étape 9 : commit**

```bash
git add scripts/apps-script/impactali-inscriptions.gs scripts/apps-script/tests/cadrage-visuels.test.js scripts/apps-script/tests/run.js
git commit -m "Le cadrage d un visuel se range a cote de son adresse"
```

---

### Task 3 : Le site applique le cadrage, sur les images remplacées seulement

**Fichiers :**
- Modifier : `site-common.js` (fonction `appliquerImages`, ligne 442)
- Créer : `scripts/apps-script/tests/cadrage-affichage.test.js`
- Modifier : `scripts/apps-script/tests/run.js`

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `scripts/apps-script/tests/cadrage-affichage.test.js` :

```js
/* Le cadrage doit s'appliquer en STYLE EN LIGNE, et seulement sur une image
 * réellement remplacée.
 *
 * Le site impose à chaque emplacement une mise en scène taillée pour la photo
 * d'origine — zoom de 1,24× ancré à 18%/60% sur la bannière, ancrage différent
 * par rang dans la section méthode. Une règle CSS de plus n'y suffirait pas :
 * `.method-step:nth-child(2) img` l'emporterait sur une classe. Le style en
 * ligne, lui, gagne toujours.
 *
 * Et une image NON remplacée ne doit rien recevoir : elle garde exactement son
 * apparence actuelle, c'est la décision prise à la conception. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Extrait une fonction nommée par comptage d'accolades, et l'exécute isolée. */
function charger(nom) {
  const debut = source.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut < 0) throw new Error('fonction ' + nom + ' introuvable dans site-common.js');
  let profondeur = 0;
  for (let j = source.indexOf('{', debut); j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}') {
      profondeur--;
      if (!profondeur) {
        const bac = {};
        vm.createContext(bac);
        vm.runInContext(source.slice(debut, j + 1) + ';\nglobalThis.__f = ' + nom + ';', bac);
        return bac.__f;
      }
    }
  }
  throw new Error('accolade de fin introuvable pour ' + nom);
}

const cadrageEnStyle = charger('cadrageEnStyle');

// --- Un cadrage complet devient trois propriétés ---
verifier('un cadrage devient un style complet',
  cadrageEnStyle({ x: 40, y: 22, zoom: 135 }),
  { objectPosition: '40% 22%', transform: 'scale(1.35)', transformOrigin: 'center' });

/* Un zoom de 100 % ne doit PAS produire scale(1) : une transformation, même
   neutre, crée un contexte d'empilement et peut flouter le rendu. */
verifier('un zoom de 100 % ne pose aucune transformation',
  cadrageEnStyle({ x: 50, y: 50, zoom: 100 }),
  { objectPosition: '50% 50%', transform: 'none', transformOrigin: 'center' });

// --- Rien à appliquer : on ne touche pas à l'élément ---
verifier('aucun cadrage : aucun style', cadrageEnStyle(null), null);
verifier('cadrage vide : aucun style', cadrageEnStyle({}), null);
verifier('cadrage illisible : aucun style', cadrageEnStyle('n’importe quoi'), null);

// --- Les bornes tiennent aussi côté navigateur ---
/* La feuille borne déjà à l'écriture, mais elle peut être modifiée à la main :
   le site ne doit jamais faire confiance à ce qu'il reçoit. */
verifier('un zoom démesuré est ramené à 250',
  cadrageEnStyle({ x: 50, y: 50, zoom: 5000 }).transform, 'scale(2.5)');
verifier('un zoom sous 100 est ramené à 100',
  cadrageEnStyle({ x: 50, y: 50, zoom: 20 }).transform, 'none');
verifier('une position négative est ramenée à 0',
  cadrageEnStyle({ x: -30, y: 50, zoom: 100 }).objectPosition, '0% 50%');

// --- Le contrôle de forme sur appliquerImages ---
const corps = source.slice(source.indexOf('function appliquerImages'));
verifier('appliquerImages ne rejette plus les valeurs non textuelles sans regarder',
  /typeof valeur !== 'string'/.test(corps.slice(0, 1200)), false);
verifier('appliquerImages pose bien le style en ligne',
  /style\.objectPosition/.test(corps.slice(0, 2000)), true);

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);
```

- [ ] **Étape 2 : lancer l'épreuve pour la voir échouer**

```bash
node scripts/apps-script/tests/cadrage-affichage.test.js
```

Attendu : ÉCHEC — `fonction cadrageEnStyle introuvable dans site-common.js`.

- [ ] **Étape 3 : écrire la fonction pure**

Dans `site-common.js`, juste avant `function appliquerImages`, ajouter :

```js
    /**
     * Traduit un cadrage en style à poser sur l'image.
     *
     * Rend `null` quand il n'y a rien à appliquer : l'appelant laisse alors
     * l'élément intact, et un visuel d'origine garde exactement l'apparence
     * réglée à la main dans la feuille de style.
     *
     * Les bornes sont refaites ici, bien que le script les applique déjà à
     * l'écriture : la feuille se modifie à la main, et le site ne doit jamais
     * faire confiance à ce qu'il reçoit.
     */
    function cadrageEnStyle(cadrage) {
        if (!cadrage || typeof cadrage !== 'object') return null;
        const x = Number(cadrage.x), y = Number(cadrage.y), zoom = Number(cadrage.zoom);
        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(zoom)) return null;
        const borner = (v, bas, haut) => Math.max(bas, Math.min(haut, Math.round(v)));
        const z = borner(zoom, 100, 250);
        return {
            objectPosition: borner(x, 0, 100) + '% ' + borner(y, 0, 100) + '%',
            /* Un zoom de 100 % ne pose AUCUNE transformation : même neutre, elle
               crée un contexte d'empilement et peut adoucir le rendu. */
            transform: z > 100 ? 'scale(' + (z / 100) + ')' : 'none',
            transformOrigin: 'center'
        };
    }
```

- [ ] **Étape 4 : appliquer le cadrage dans `appliquerImages`**

Remplacer le corps de la boucle (lignes 446-458) :

```js
        document.querySelectorAll('[data-image]').forEach(el => {
            const valeur = images[el.dataset.image];
            if (typeof valeur !== 'string' || !valeur.trim()) return;
            const adresse = normaliserImage(valeur.trim(), 1400);
            if (el.getAttribute('src') === adresse) return;
            el.setAttribute('src', adresse);
            el.removeAttribute('width');
            el.removeAttribute('height');
            change = true;
        });
```

par :

```js
        document.querySelectorAll('[data-image]').forEach(el => {
            const valeur = images[el.dataset.image];
            if (typeof valeur !== 'string' || !valeur.trim()) return;
            const adresse = normaliserImage(valeur.trim(), 1400);

            /* Le cadrage se pose en style EN LIGNE, et non par une classe : la
               feuille de style cadre certains visuels au rang
               (`.method-step:nth-child(2) img`), et un sélecteur au rang
               l'emporterait sur une classe. Le style en ligne, lui, gagne
               toujours — et il n'est posé que sur une image REMPLACÉE, donc un
               visuel d'origine garde son réglage fait à la main. */
            const style = cadrageEnStyle(cadrages[el.dataset.image]);
            if (style) {
                el.style.objectPosition = style.objectPosition;
                el.style.transform = style.transform;
                el.style.transformOrigin = style.transformOrigin;
            }

            if (el.getAttribute('src') === adresse) return;
            el.setAttribute('src', adresse);
            /* Les dimensions d'origine décrivaient l'ancienne image : les garder
               réserverait une place au mauvais rapport, et la nouvelle photo
               s'afficherait déformée le temps de son chargement. */
            el.removeAttribute('width');
            el.removeAttribute('height');
            change = true;
        });
```

`appliquerImages` reçoit les visuels en paramètre, pas le catalogue entier.
Changer sa signature (ligne 442) :

```js
    function appliquerImages(images) {
        if (!images || typeof images !== 'object') return false;
        let change = false;
```

devient :

```js
    function appliquerImages(images, cadrages) {
        if (!images || typeof images !== 'object') return false;
        cadrages = cadrages && typeof cadrages === 'object' ? cadrages : {};
        let change = false;
```

Et son unique appelant, ligne 515 :

```js
            const imagesChangees = appliquerImages(donnees && donnees.images);
```

devient :

```js
            const imagesChangees = appliquerImages(donnees && donnees.images,
                donnees && donnees.cadrages);
```

- [ ] **Étape 5 : relancer l'épreuve**

```bash
node scripts/apps-script/tests/cadrage-affichage.test.js
```

Attendu : `Tous les contrôles passent.`

- [ ] **Étape 6 : inscrire l'épreuve et lancer le banc complet**

Dans `run.js` :

```js
  ['cadrage-affichage.test.js', 'Le cadrage s applique aux seules images remplacees']
```

```bash
npm run test:api
```

- [ ] **Étape 7 : prouver la régression**

Dans `cadrageEnStyle`, remplacer `const z = borner(zoom, 100, 250);` par
`const z = zoom;`. Relancer l'épreuve : les contrôles sur les bornes doivent
échouer. Restaurer.

- [ ] **Étape 8 : commit**

```bash
git add site-common.js scripts/apps-script/tests/cadrage-affichage.test.js scripts/apps-script/tests/run.js
git commit -m "Une image remplacee porte son propre cadrage"
```

---

### Task 4 : Chaque emplacement déclare son rapport réel

**Fichiers :**
- Modifier : `index.html` (lignes 127, 240, 244, 248, 258)
- Modifier : `formations/_template/fiche.html` (ligne 405)
- Régénérer : `formations/*/index.html`, `inscription/index.html`
- Créer : `scripts/apps-script/tests/rapports-visuels.test.js`
- Modifier : `scripts/apps-script/tests/run.js`

Rapports mesurés sur le site servi en local, viewport 1280 px :

| Clé | Mesure | À déclarer |
|---|---|---|
| `accueil.hero` | 570 × 600 → 0,950 | `19/20` |
| `accueil.methode.1` · `.2` · `.3` | 359,7 × 210 → 1,713 | `12/7` |
| `accueil.formateur.photo` | 472,7 × 591,3 → 0,800 | `4/5` |
| `fiche.formateur.photo` | 220 × 294 → 0,748 | `3/4` |

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `scripts/apps-script/tests/rapports-visuels.test.js` :

```js
/* Chaque emplacement remplaçable doit annoncer le rapport qu'il occupe VRAIMENT
 * à l'écran.
 *
 * `accueil.hero` était déclaré « paysage » alors que son emplacement mesure
 * 570 × 600, soit 0,95 — quasiment un carré. Le tableau de bord rognait donc en
 * 16/9 une image que le site réduisait ensuite à un carré : rognée deux fois,
 * pour deux formes différentes. L'aperçu du tableau de bord ne peut être
 * honnête que si le rapport annoncé est le rapport réel. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Rapports mesurés sur le site servi, viewport 1280 px. */
const ATTENDUS = {
  'accueil.hero': '19/20',
  'accueil.methode.1': '12/7',
  'accueil.methode.2': '12/7',
  'accueil.methode.3': '12/7',
  'accueil.formateur.photo': '4/5',
  'fiche.formateur.photo': '3/4'
};

const PAGES = [
  'index.html',
  'formations/_template/fiche.html',
  'formations/canva-pro/index.html',
  'formations/community-management/index.html',
  'formations/identite-visuelle/index.html',
  'formations/photo-video/index.html',
  'formations/marketing-digital/index.html',
  'formations/ia-appliquee/index.html',
  'inscription/index.html'
];

const sansRapport = [];
const rapports = {};
PAGES.forEach(p => {
  const html = fs.readFileSync(path.join(RACINE, p), 'utf8');
  const balises = html.match(/<img[^>]*data-image=[^>]*>/g) || [];
  balises.forEach(b => {
    const cle = (b.match(/data-image="([^"]+)"/) || [])[1];
    const ratio = (b.match(/data-image-ratio="([^"]+)"/) || [])[1];
    if (!ratio) { sansRapport.push(p + ' → ' + cle); return; }
    rapports[cle] = rapports[cle] || new Set();
    rapports[cle].add(ratio);
  });
});

verifier('tout emplacement déclare son rapport', sansRapport, []);

Object.keys(ATTENDUS).forEach(cle => {
  verifier('rapport de ' + cle, [...(rapports[cle] || [])], [ATTENDUS[cle]]);
});

/* La même clé apparaît dans huit fichiers : si les valeurs divergeaient, le
   tableau de bord afficherait un aperçu juste sur une page et faux sur sept. */
Object.keys(rapports).forEach(cle => {
  verifier('un seul rapport déclaré pour ' + cle, rapports[cle].size, 1);
});

/* Les fiches sont GÉNÉRÉES : une divergence avec le gabarit signifie qu'on les
   a éditées à la main, ce que le dépôt interdit. */
const gabarit = fs.readFileSync(path.join(RACINE, 'formations/_template/fiche.html'), 'utf8');
const rapportGabarit = (gabarit.match(/data-image="fiche\.formateur\.photo"[^>]*data-image-ratio="([^"]+)"/) || [])[1];
verifier('le gabarit porte bien le rapport', rapportGabarit, '3/4');

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);
```

- [ ] **Étape 2 : lancer l'épreuve pour la voir échouer**

```bash
node scripts/apps-script/tests/rapports-visuels.test.js
```

Attendu : ÉCHEC — aucun emplacement ne déclare de rapport.

- [ ] **Étape 3 : déclarer les rapports dans l'accueil**

Dans `index.html`, ajouter `data-image-ratio` à chaque balise, juste après
`data-image-format` :

- Ligne 127 : `data-image-format="paysage"` → `data-image-format="carre" data-image-ratio="19/20"`
  (le format change aussi : l'emplacement n'a jamais été un paysage)
- Ligne 240 : ajouter `data-image-ratio="12/7"`
- Ligne 244 : ajouter `data-image-ratio="12/7"`
- Ligne 248 : ajouter `data-image-ratio="12/7"`
- Ligne 258 : ajouter `data-image-ratio="4/5"`

- [ ] **Étape 4 : déclarer le rapport dans le gabarit, puis régénérer**

Dans `formations/_template/fiche.html` ligne 405, ajouter `data-image-ratio="3/4"`.

```bash
npm run build:fiches
```

Vérifier que les six fiches **et** `inscription/index.html` ont été réécrites :

```bash
git status --short
```

Attendu : sept fichiers modifiés sous `formations/` et `inscription/`.

- [ ] **Étape 5 : ajouter le format « carre » à la table des formats**

Dans `admin/admin.js`, dans `FORMATS_IMAGE` (ligne 1441), ajouter :

```js
    carre: { largeur: 1200, hauteur: null, libelle: 'largeur 1200 px, format d’origine conservé' },
```

La hauteur reste **libre** : à partir de la Task 5, plus aucun format ne rogne à
l'envoi, et une hauteur imposée rognerait encore.

- [ ] **Étape 6 : relancer l'épreuve et le banc complet**

```bash
node scripts/apps-script/tests/rapports-visuels.test.js
npm run test:api
```

Si `textes.test.js` échoue, c'est son contrôle de `FORMATS_IMAGE` (ligne 75) qui
lit la table au caractère près : y ajouter `carre` à la liste attendue.

- [ ] **Étape 7 : inscrire l'épreuve**

Dans `run.js` :

```js
  ['rapports-visuels.test.js', 'Chaque emplacement annonce son rapport reel']
```

- [ ] **Étape 8 : prouver la régression**

Retirer `data-image-ratio="12/7"` de la ligne 240 de `index.html`. Relancer
l'épreuve : « tout emplacement déclare son rapport » doit échouer en nommant le
fichier et la clé. Restaurer.

- [ ] **Étape 9 : commit**

```bash
git add index.html formations/ inscription/ admin/admin.js scripts/apps-script/tests/rapports-visuels.test.js scripts/apps-script/tests/run.js
git commit -m "Chaque emplacement annonce le rapport qu il occupe vraiment"
```

---

### Task 5 : L'envoi cesse de graver le recadrage dans le fichier

**Fichiers :**
- Modifier : `admin/admin.js` (`preparerImage` ligne 1464, `choisirCadrage` ligne 1539)
- Créer : `scripts/apps-script/tests/envoi-non-destructif.test.js`
- Modifier : `scripts/apps-script/tests/run.js`, `scripts/apps-script/tests/textes.test.js`

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `scripts/apps-script/tests/envoi-non-destructif.test.js` :

```js
/* L'envoi ne doit plus rogner le fichier.
 *
 * `preparerImage` gravait le recadrage à `ctx.drawImage(bitmap, zone.x, …)`.
 * Un cadrage rangé dans la feuille et appliqué ensuite par le site se serait
 * ajouté à celui déjà gravé : les deux se cumulaient, et la photo partait deux
 * fois plus loin que demandé.
 *
 * L'image part donc entière, bornée en largeur, et `choisirCadrage` rend des
 * valeurs relatives — position du centre en pourcentage, facteur
 * d'agrandissement — au lieu d'une zone de pixels. Ces valeurs se rejouent à
 * l'affichage, et se reprennent sans renvoyer la photo. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/* Le rognage se reconnaît à la forme à neuf arguments de drawImage, celle qui
   prend une zone SOURCE. La forme à cinq arguments ne rogne pas. */
verifier('plus aucun rognage à l’envoi',
  /drawImage\(\s*bitmap\s*,\s*zone\./.test(src), false);

verifier('l’image part entière, bornée en largeur',
  /drawImage\(bitmap, 0, 0, largeur, hauteur\)/.test(src), true);

/* Le cadrage doit remonter en valeurs RELATIVES, seules rejouables sur un
   emplacement dont le rapport change avec la taille de l'écran. */
verifier('le cadrage remonte en pourcentages',
  /cadrage:\s*\{\s*x:.*y:.*zoom:/s.test(src.slice(src.indexOf('function choisirCadrage'))), true);

verifier('la zone de pixels ne sert plus à rogner',
  /zone\.largeur\s*,\s*zone\.hauteur\s*,\s*0\s*,\s*0/.test(src), false);

/* Aucun format ne doit plus imposer une hauteur : elle servait à rogner. */
const table = src.slice(src.indexOf('var FORMATS_IMAGE'), src.indexOf('var FORMATS_IMAGE') + 1400);
const hauteursImposees = (table.match(/hauteur:\s*\d+/g) || []);
verifier('aucun format n’impose plus de hauteur', hauteursImposees, []);

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);
```

- [ ] **Étape 2 : lancer l'épreuve pour la voir échouer**

```bash
node scripts/apps-script/tests/envoi-non-destructif.test.js
```

Attendu : ÉCHEC sur les cinq contrôles.

- [ ] **Étape 3 : faire remonter un cadrage relatif depuis `choisirCadrage`**

Dans `admin/admin.js`, remplacer le gestionnaire de `[data-valider]` (vers la
ligne 1655) :

```js
      boite.querySelector('[data-valider]').addEventListener('click', function () {
        borner();
        fermer({
          x: centreX - largeurScene / (2 * echelle),
          y: centreY - hauteurScene / (2 * echelle),
          largeur: largeurScene / echelle,
          hauteur: hauteurScene / echelle
        });
      });
```

par :

```js
      boite.querySelector('[data-valider]').addEventListener('click', function () {
        borner();
        /* On rend le cadrage en valeurs RELATIVES, et non en pixels.
           L'emplacement de la photo du formateur passe de 4/5 à 5/4 sous
           1023 px : une zone de pixels y serait juste à une taille d'écran et
           fausse à l'autre. Un centre en pourcentage et un facteur
           d'agrandissement se rejouent partout, et se reprennent sans renvoyer
           la photo. */
        fermer({
          cadrage: {
            x: Math.round(centreX / bitmap.width * 100),
            y: Math.round(centreY / bitmap.height * 100),
            zoom: Math.round(echelle / echelleMin * 100)
          }
        });
      });
```

- [ ] **Étape 4 : envoyer l'image entière**

Remplacer le bloc de `preparerImage` qui construit la toile (vers la ligne 1504) :

```js
          var f = FORMATS_IMAGE[format] || FORMATS_IMAGE.poster;
          var largeur = f.hauteur ? f.largeur : Math.round(Math.min(f.largeur, zone.largeur));
          var hauteur = f.hauteur ? f.hauteur : Math.round(largeur * zone.hauteur / zone.largeur);

          var toile = document.createElement('canvas');
          toile.width = largeur;
          toile.height = hauteur;
          var ctx = toile.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, largeur, hauteur);
          bitmap.close && bitmap.close();

          return encoder(toile, 'image/webp', 0.82)
            .catch(function () { return encoder(toile, 'image/jpeg', 0.85); });
```

par :

```js
          var f = FORMATS_IMAGE[format] || FORMATS_IMAGE.poster;
          /* L'image part ENTIÈRE, bornée en largeur : le cadrage est rangé à
             côté d'elle et rejoué à l'affichage. Rogner ici le graverait dans
             le fichier, et le cadrage stocké s'y ajouterait — la photo partirait
             deux fois plus loin que demandé, sans retour possible. */
          var largeur = Math.round(Math.min(f.largeur, bitmap.width));
          var hauteur = Math.round(largeur * bitmap.height / bitmap.width);

          var toile = document.createElement('canvas');
          toile.width = largeur;
          toile.height = hauteur;
          var ctx = toile.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
          bitmap.close && bitmap.close();

          return encoder(toile, 'image/webp', 0.82)
            .catch(function () { return encoder(toile, 'image/jpeg', 0.85); })
            /* On ACCROCHE le cadrage à l'objet rendu par `encoder`, sans
               l'emballer : l'appelant lit déjà `prete.poids`, `prete.base64` et
               `prete.type`, et une enveloppe casserait ces trois lectures. */
            .then(function (prete) { prete.cadrage = zone.cadrage; return prete; });
```

La variable reçue de `choisirCadrage` s'appelle `zone` dans le code actuel et
porte désormais `{ cadrage }` : le nom est conservé pour limiter la diff.

- [ ] **Étape 5 : retirer les hauteurs imposées de `FORMATS_IMAGE`**

Une hauteur imposée servait à rogner à l'envoi. Elle n'a plus lieu d'être :
seule la largeur borne encore le poids du fichier. Remplacer la table entière
(elle porte déjà `carre`, ajouté à la Task 4) :

```js
  /* Aucune hauteur n'est imposée : le fichier part ENTIER, borné en largeur, et
     le cadrage est rangé à côté de lui puis rejoué à l'affichage. Une hauteur
     ici rognerait le fichier, et le cadrage stocké s'y ajouterait. */
  var FORMATS_IMAGE = {
    image: { largeur: 760, hauteur: null, libelle: 'largeur 760 px, format d’origine conservé' },
    poster: { largeur: 1000, hauteur: null, libelle: 'largeur 1000 px, format d’origine conservé' },
    // Logo d'un moyen de paiement : affiché sur environ 48 px de haut, donc petit
    logo: { largeur: 240, hauteur: null, libelle: 'largeur 240 px, format d’origine conservé' },
    carre: { largeur: 1200, hauteur: null, libelle: 'largeur 1200 px, format d’origine conservé' },
    paysage: { largeur: 1400, hauteur: null, libelle: 'largeur 1400 px, format d’origine conservé' },
    portrait: { largeur: 900, hauteur: null, libelle: 'largeur 900 px, format d’origine conservé' },
    portfolio: { largeur: 1000, hauteur: null, libelle: 'largeur 1000 px, format d’origine conservé' }
  };
```

`calculerTaille` (ligne 1667) lit `f.hauteur` et prend déjà la branche
« hauteur libre » quand elle vaut `null` : rien à y changer.

- [ ] **Étape 6 : relancer l'épreuve**

```bash
node scripts/apps-script/tests/envoi-non-destructif.test.js
```

Attendu : `Tous les contrôles passent.`

- [ ] **Étape 7 : mettre à jour l'épreuve existante qui lit la table**

`scripts/apps-script/tests/textes.test.js` ligne 75 lit `FORMATS_IMAGE` par
expression régulière sur la forme « quatre espaces, nom, `: { largeur: ` ».
Relancer `node scripts/apps-script/tests/textes.test.js` ; si le contrôle échoue,
mettre à jour la liste attendue pour inclure `carre` et accepter
`hauteur: null`.

- [ ] **Étape 8 : lancer tout le banc d'essai**

```bash
npm run test:api
```

- [ ] **Étape 9 : prouver la régression**

Remettre `ctx.drawImage(bitmap, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, largeur, hauteur);`.
Relancer `node scripts/apps-script/tests/envoi-non-destructif.test.js` : deux
contrôles doivent échouer. Restaurer.

- [ ] **Étape 10 : commit**

```bash
git add admin/admin.js scripts/apps-script/tests/envoi-non-destructif.test.js scripts/apps-script/tests/run.js scripts/apps-script/tests/textes.test.js
git commit -m "L envoi d une photo ne la rogne plus"
```

---

### Task 6 : Le tableau de bord règle le cadrage dans un aperçu au rapport réel

**Fichiers :**
- Modifier : `admin/admin.js` (`chargerVisuelsDuSite` 1859, `rendreVisuels` 1897,
  `activerChampImage` 1738, `champImage` 2507)
- Modifier : `admin/admin.css`
- Créer : `scripts/apps-script/tests/reglage-cadrage-admin.test.js`
- Modifier : `scripts/apps-script/tests/run.js`, `scripts/apps-script/tests/affichage.test.js`

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `scripts/apps-script/tests/reglage-cadrage-admin.test.js` :

```js
/* Le tableau de bord doit permettre de régler le cadrage APRÈS l'envoi, dans un
 * aperçu qui a la forme réelle de l'emplacement.
 *
 * Le manque n'était pas le nombre de curseurs : c'était de ne pas voir ce que
 * le réglage donne. Un aperçu au mauvais rapport est pire que pas d'aperçu du
 * tout, puisqu'il promet un résultat qui n'arrivera pas. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');
const css = fs.readFileSync(path.join(RACINE, 'admin', 'admin.css'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// Le relevé du site doit rapporter le rapport déclaré
verifier('le relevé lit data-image-ratio',
  /getAttribute\('data-image-ratio'\)/.test(src), true);
verifier('et le range dans la fiche du visuel',
  /rapport:\s*el\.getAttribute\('data-image-ratio'\)/.test(src), true);

// L'aperçu prend ce rapport
verifier('l’aperçu applique le rapport de l’emplacement',
  /aspect-ratio/.test(css), true);

// Les réglages existent et partent avec l'enregistrement
verifier('un curseur de zoom est proposé',
  /data-cadrage-zoom/.test(src), true);
verifier('un bouton de réinitialisation est proposé',
  /data-cadrage-reinit/.test(src), true);
verifier('les cadrages partent avec l’enregistrement',
  /appeler\('admin\.images\.save',\s*\{\s*donnees:\s*donnees,\s*cadrages:\s*cadrages\s*\}\)/.test(src), true);

/* Un visuel NON remplacé n'a rien à régler : le bloc est rendu mais masqué,
   et il se révèle dès qu'une photo est posée. Le rendre seulement après
   enregistrement obligerait à sauvegarder pour découvrir le cadrage. */
verifier('le bloc de réglage est masqué tant qu’aucune photo n’est posée',
  /reglagesCadrage\(v\.cle, valeur \|\| v\.origine, v\.rapport/.test(src), true);
verifier('et il se révèle après un envoi réussi',
  /data-cadrage="'\s*\+\s*cle/.test(src) && /\.hidden = false/.test(src), true);

resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);
```

- [ ] **Étape 2 : lancer l'épreuve pour la voir échouer**

```bash
node scripts/apps-script/tests/reglage-cadrage-admin.test.js
```

Attendu : ÉCHEC sur les sept contrôles.

- [ ] **Étape 3 : relever le rapport déclaré**

Dans `chargerVisuelsDuSite` (ligne 1878), ajouter au littéral poussé dans
`liste` :

```js
            rapport: el.getAttribute('data-image-ratio') || '',
```

- [ ] **Étape 4 : afficher les réglages sous un visuel remplacé**

Ajouter, avant `rendreVisuels` :

```js
  /**
   * Réglages de cadrage d'un visuel remplacé.
   *
   * L'aperçu prend le rapport RÉEL de l'emplacement sur le site : un aperçu au
   * mauvais rapport promettrait un résultat qui n'arrivera pas.
   */
  function reglagesCadrage(cle, adresse, rapport, cadrage, masque) {
    var c = cadrage || { x: 50, y: 50, zoom: 100 };
    return '<div class="cadrage" data-cadrage="' + echapper(cle) + '"'
      + (masque ? ' hidden' : '')
      + ' style="--rapport:' + echapper(rapport || '1/1') + '">'
      + '<div class="cadrage__scene">'
      + '<img src="' + echapper(adresse) + '" alt="" draggable="false"'
      + ' style="object-position:' + c.x + '% ' + c.y + '%;'
      + 'transform:' + (c.zoom > 100 ? 'scale(' + (c.zoom / 100) + ')' : 'none') + '">'
      + '</div>'
      + '<p class="aide">Faites glisser la photo pour choisir la partie visible.</p>'
      + '<label class="cadrage__zoom">Zoom'
      + '<input type="range" min="100" max="250" value="' + c.zoom + '"'
      + ' data-cadrage-zoom="' + echapper(cle) + '"></label>'
      + '<button type="button" class="bouton bouton--discret bouton--petit"'
      + ' data-cadrage-reinit="' + echapper(cle) + '">Réinitialiser</button>'
      + '<input type="hidden" data-cadrage-valeur="' + echapper(cle) + '"'
      + ' value="' + echapper(JSON.stringify(c)) + '">'
      + '</div>';
  }
```

Dans `rendreVisuels`, après l'appel à `champImage`, ajouter :

```js
              /* Le bloc est TOUJOURS rendu, masqué tant qu'aucune photo n'est
                 posée. Ne le créer qu'après enregistrement obligerait à
                 sauvegarder pour découvrir le réglage — et à recommencer si le
                 cadrage ne convient pas. */
              + reglagesCadrage(v.cle, valeur || v.origine, v.rapport,
                  (etat.catalogue.cadrages || {})[v.cle], !valeur)
```

- [ ] **Étape 5 : câbler le glisser, le zoom et la réinitialisation**

Après la boucle `etat.visuelsDeclares.forEach(... activerChampImage ...)`,
ajouter :

```js
    $$('[data-cadrage]').forEach(function (bloc) {
      var cle = bloc.dataset.cadrage;
      var img = bloc.querySelector('img');
      var champ = bloc.querySelector('[data-cadrage-valeur]');
      var zoom = bloc.querySelector('[data-cadrage-zoom]');
      var etatCadre = JSON.parse(champ.value);

      function appliquer() {
        img.style.objectPosition = etatCadre.x + '% ' + etatCadre.y + '%';
        img.style.transform = etatCadre.zoom > 100
          ? 'scale(' + (etatCadre.zoom / 100) + ')' : 'none';
        champ.value = JSON.stringify(etatCadre);
      }

      var glisse = false, departX = 0, departY = 0;
      img.addEventListener('mousedown', function (e) {
        glisse = true; departX = e.clientX; departY = e.clientY; e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!glisse) return;
        var boite = bloc.querySelector('.cadrage__scene').getBoundingClientRect();
        /* Un déplacement d'une largeur d'aperçu parcourt toute la photo :
           le réglage reste praticable quelle que soit la taille de l'écran. */
        etatCadre.x = Math.max(0, Math.min(100,
          etatCadre.x - (e.clientX - departX) / boite.width * 100));
        etatCadre.y = Math.max(0, Math.min(100,
          etatCadre.y - (e.clientY - departY) / boite.height * 100));
        departX = e.clientX; departY = e.clientY;
        appliquer();
      });
      window.addEventListener('mouseup', function () { glisse = false; });

      zoom.addEventListener('input', function () {
        etatCadre.zoom = Number(zoom.value);
        appliquer();
      });
      bloc.querySelector('[data-cadrage-reinit]').addEventListener('click', function () {
        etatCadre = { x: 50, y: 50, zoom: 100 };
        zoom.value = 100;
        appliquer();
      });
    });
```

- [ ] **Étape 6 : révéler le bloc dès qu'une photo est posée**

`activerChampImage` (ligne 1738) ne connaît aujourd'hui que l'adresse. Après un
envoi réussi, elle doit révéler le bloc de réglage, y poser la photo et y
inscrire le cadrage choisi pendant le recadrage.

Dans le `.then(function (reponse) { … })`, après `champ.value = reponse.url;`,
ajouter :

```js
          /* Le cadrage choisi pendant le recadrage doit suivre la photo :
             sans cela il faudrait le refaire après enregistrement, alors qu'il
             vient d'être réglé à l'écran. */
          var bloc = document.querySelector('[data-cadrage="' + cle.replace(/^visuel-/, '') + '"]');
          if (bloc) {
            bloc.hidden = false;
            var vue = bloc.querySelector('img');
            var stock = bloc.querySelector('[data-cadrage-valeur]');
            var curseur = bloc.querySelector('[data-cadrage-zoom]');
            var c = prete.cadrage || { x: 50, y: 50, zoom: 100 };
            vue.src = reponse.url;
            vue.style.objectPosition = c.x + '% ' + c.y + '%';
            vue.style.transform = c.zoom > 100 ? 'scale(' + (c.zoom / 100) + ')' : 'none';
            stock.value = JSON.stringify(c);
            curseur.value = c.zoom;
          }
```

`prete` n'est pas visible dans ce `.then` : le conserver en remontant d'un
maillon. Remplacer le premier `.then(function (prete) { … })` pour qu'il rende
un objet portant les deux :

```js
        .then(function (prete) {
          etatEl.textContent = 'Envoi (' + Math.round(prete.poids / 1024) + ' Ko)…';
          return appeler('admin.image.upload', {
            donnees: {
              base64: prete.base64, type: prete.type, format: format,
              nom: fichier.name.replace(/\.[^.]+$/, '')
            }
          }).then(function (reponse) { return { reponse: reponse, prete: prete }; });
        })
        .then(function (paquet) {
          var reponse = paquet.reponse, prete = paquet.prete;
```

Et dans le gestionnaire de `[data-retirer]`, masquer de nouveau le bloc :

```js
      var bloc = document.querySelector('[data-cadrage="' + cle.replace(/^visuel-/, '') + '"]');
      if (bloc) bloc.hidden = true;
```

- [ ] **Étape 7 : envoyer les cadrages avec les visuels**

Dans le gestionnaire de `#btn-visuels`, remplacer la construction de `donnees`
et l'appel :

```js
      var donnees = {};
      var cadrages = {};
      etat.visuelsDeclares.forEach(function (v) {
        var champ = document.getElementById('champ-visuel-' + v.cle);
        if (!champ) return;
        var valeur = champ.value.trim();
        donnees[v.cle] = (valeur && valeur !== v.origine) ? valeur : '';
        var cadre = document.querySelector('[data-cadrage-valeur="' + v.cle + '"]');
        /* Un visuel revenu à son image d'origine n'emporte aucun cadrage : la
           ligne sera effacée, et un cadrage orphelin n'aurait plus de sujet. */
        if (cadre && donnees[v.cle]) {
          try { cadrages[v.cle] = JSON.parse(cadre.value); } catch (e) { /* illisible : on n'envoie rien */ }
        }
      });
      appeler('admin.images.save', { donnees: donnees, cadrages: cadrages }).then(function () {
```

- [ ] **Étape 8 : styler l'aperçu au rapport réel**

Dans `admin/admin.css`, ajouter :

```css
/* Aperçu de cadrage : il prend le rapport RÉEL de l'emplacement sur le site,
   déclaré par --rapport. Un aperçu au mauvais rapport promettrait un résultat
   qui n'arrivera pas — c'est précisément le défaut qu'on corrige ici. */
.cadrage__scene {
  aspect-ratio: var(--rapport, 1 / 1);
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.cadrage__scene img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: grab;
  user-select: none;
}

.cadrage__scene img:active { cursor: grabbing; }

.cadrage__zoom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}
```

- [ ] **Étape 9 : relancer l'épreuve**

```bash
node scripts/apps-script/tests/reglage-cadrage-admin.test.js
```

Attendu : `Tous les contrôles passent.`

- [ ] **Étape 10 : mettre à jour l'épreuve existante et lancer le banc**

`scripts/apps-script/tests/affichage.test.js` ligne 160 lit une ligne de
`chargerVisuelsDuSite` au caractère près : la mettre à jour pour inclure
`rapport:`.

```js
  ['reglage-cadrage-admin.test.js', 'Reglage du cadrage dans un apercu au rapport reel']
```

```bash
npm run test:api
```

- [ ] **Étape 11 : prouver la régression**

Retirer `rapport: el.getAttribute('data-image-ratio') || '',` de
`chargerVisuelsDuSite`. Relancer l'épreuve : deux contrôles doivent échouer.
Restaurer.

- [ ] **Étape 12 : vérifier dans le navigateur**

Le tableau de bord ne peut pas être ouvert sans le mot de passe. Éprouver
l'interface en simulant la réponse du serveur, comme lors de l'audit :
remplacer `window.fetch` pour rendre `{ok:true, catalogue:<catalogue public>}`
sur `admin.login`, puis vérifier que l'aperçu de `accueil.hero` a bien un
rapport de 0,95 et non de 1,78.

- [ ] **Étape 13 : commit**

```bash
git add admin/admin.js admin/admin.css scripts/apps-script/tests/reglage-cadrage-admin.test.js scripts/apps-script/tests/run.js scripts/apps-script/tests/affichage.test.js
git commit -m "Le cadrage se regle dans un apercu a la forme de l emplacement"
```

---

### Task 7 : Publier

- [ ] **Étape 1 : monter la version du script**

Dans `scripts/apps-script/impactali-inscriptions.gs`, remplacer la ligne 78 :

```js
var VERSION = '2026-09-19-cadrage-visuels';
```

Dans `formations-data.js`, aligner `versionScript` sur la même valeur.

- [ ] **Étape 2 : lancer tout le banc d'essai**

```bash
npm run test:api
```

Attendu : `Toutes les épreuves passent.`

- [ ] **Étape 3 : commit et publication**

```bash
git add scripts/apps-script/impactali-inscriptions.gs formations-data.js
git commit -m "Version du script : cadrage des visuels"
git push origin main
```

- [ ] **Étape 4 : remettre le fichier `.gs` à l'utilisateur**

Le script doit être recollé dans l'éditeur Apps Script puis redéployé
(Déployer → Gérer les déploiements → crayon → Nouvelle version). **Le mot de
passe est à réécrire ligne 112** : le fichier est livré sur sa valeur d'usine.

- [ ] **Étape 5 : vérifier en ligne**

```bash
curl -s -L "<adresse /exec>?action=version"
```

Attendu : `"version":"2026-09-19-cadrage-visuels"`, et le catalogue doit
contenir une clé `cadrages`.

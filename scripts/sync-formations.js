/* Aligne les formations écrites dans formations-data.js sur celles de la feuille.
 *
 * POURQUOI CE FICHIER PORTE DES FORMATIONS. La page s'affiche AVANT que la
 * feuille Google n'ait répondu — jusqu'à plusieurs secondes sur une première
 * visite. Pendant ce temps, ce sont ces valeurs-là qui s'affichent. Elles
 * servent aussi de repli quand l'API est injoignable, au visiteur sans
 * JavaScript, et à `npm run build:fiches -- --du-fichier`.
 *
 * LE DÉFAUT QUE CELA A CAUSÉ. Le fichier annonçait six formations quand la
 * feuille n'en portait plus que cinq : « Community management » avait été
 * retirée du tableau de bord. L'accueil affichait donc une carte fantôme le
 * temps que le catalogue arrive, pour une formation qui n'existe plus — et sa
 * fiche, elle, restait servie.
 *
 * CE QUI EST ÉCRIT. Tout ce que la feuille renvoie, programme et FAQ compris :
 * c'est ce qui permet à `--du-fichier` de regénérer des fiches complètes le
 * jour où la base est injoignable. Les champs `nextSession` et `places` du
 * fichier ne sont plus écrits : la feuille ne les porte pas, et rien ne les
 * lit — les places se déduisent des inscrits.
 *
 * À RELANCER après toute modification de formation faite depuis le tableau de
 * bord, puis à redéployer :
 *     npm run sync:formations
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { litteral, enregistrementEnTexte, pointDeTerminaison, remplacerBloc } = require('./sync-commun.js');

const RACINE = path.resolve(__dirname, '..');
const FICHIER = path.join(RACINE, 'formations-data.js');

/* L'ordre de lecture : ce qui identifie, puis ce qui se lit, puis ce qui
   s'affiche, puis ce qui se règle. Un ordre stable rend les différences Git
   lisibles ; un ordre au gré de JSON.stringify les rendrait illisibles. */
const ORDRE = [
  'id', 'slug', 'formId',
  'title', 'shortTitle', 'category', 'family', 'promise', 'shortDescription', 'lead',
  'image', 'imageAlt', 'poster',
  'duration', 'modules', 'level', 'levelSubject', 'mode',
  'price', 'prices',
  'learnings', 'objectives', 'programme', 'faq', 'prerequis',
  'featured', 'registrationOpen', 'active', 'allowRegistrationWithoutSession',
  'hasDetailPage', 'href', 'ordre'
];

/** Un programme de quatre modules ne tient pas sur une ligne : on l'étale. */
const MISE_EN_FORME = { multiligne: true, seuil: 100 };

const formationEnTexte = formation => enregistrementEnTexte(formation, ORDRE, MISE_EN_FORME);

/* Exporté pour l'épreuve : elle vérifie la mise en forme sans rien
   télécharger ni réécrire. */
module.exports = { litteral, formationEnTexte, ORDRE };
if (require.main !== module) return;

(async () => {
  const source = fs.readFileSync(FICHIER, 'utf8');

  const point = pointDeTerminaison(source);
  if (!point) { console.error('Point de terminaison introuvable dans formations-data.js.'); process.exit(1); }

  let catalogue;
  try {
    const reponse = await fetch(point + (point.includes('?') ? '&' : '?') + 'action=catalogue');
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
    catalogue = JSON.parse(await reponse.text());
  } catch (e) {
    console.error('Feuille injoignable : ' + e.message + '\nRien n’a été modifié.');
    process.exit(1);
  }

  const formations = Array.isArray(catalogue.formations) ? catalogue.formations : [];

  /* REFUS DE TOUT EFFACER. Une feuille momentanément vide, un script Google
     redéployé de travers, une réponse tronquée : écrire une liste vide
     priverait le site de tout repli, et l'on ne s'en apercevrait qu'à la
     prochaine panne de l'API — c'est-à-dire au pire moment. */
  if (!formations.length) {
    console.error('La feuille ne renvoie aucune formation. Rien n’a été modifié.');
    process.exit(1);
  }
  const incompletes = formations.filter(f => !f || !f.formId || !f.slug || !f.title);
  if (incompletes.length) {
    console.error(incompletes.length + ' formation(s) sans identifiant, sans lien ou sans titre. '
      + 'Rien n’a été modifié.');
    process.exit(1);
  }

  const bloc = remplacerBloc(source, 'FORMATIONS');
  if (!bloc) { console.error('Bloc FORMATIONS introuvable.'); process.exit(1); }

  const ancien = eval(bloc.ancien);
  const parId = liste => Object.fromEntries(liste.map(f => [f.formId, f]));
  const avant = parId(ancien), apres = parId(formations);

  console.log('Formations de la feuille : ' + formations.length
    + ', du fichier : ' + ancien.length + '\n');
  for (const id of Object.keys(avant)) {
    if (!(id in apres)) {
      console.log('  RETIRÉE   ' + id + ' (' + (avant[id].title || '?') + ') — absente de la feuille');
      /* Sa fiche, elle, reste sur le disque : la retirer est une décision,
         pas un effet de bord d'une synchronisation de données. */
      if (fs.existsSync(path.join(RACINE, 'formations', avant[id].slug || '', 'index.html'))) {
        console.log('            sa page /formations/' + avant[id].slug + '/ est toujours servie :');
        console.log('            « npm run build:fiches -- --nettoyer » la retire.');
      }
    }
  }
  for (const id of Object.keys(apres)) {
    if (!(id in avant)) { console.log('  AJOUTÉE   ' + id + ' (' + apres[id].title + ')'); continue; }
    const ecarts = ORDRE.filter(c => JSON.stringify(avant[id][c]) !== JSON.stringify(apres[id][c])
      && !(avant[id][c] === undefined && (apres[id][c] === null || apres[id][c] === '')));
    if (ecarts.length) console.log('  MODIFIÉE  ' + id + ' → ' + ecarts.join(', '));
  }

  const nouveau = bloc.remplacer(formations.map(formationEnTexte).join(',\n'));

  if (nouveau === source) { console.log('\nLe fichier était déjà aligné.'); return; }
  fs.writeFileSync(FICHIER, nouveau);
  console.log('\nformations-data.js aligné sur la feuille.');
})();

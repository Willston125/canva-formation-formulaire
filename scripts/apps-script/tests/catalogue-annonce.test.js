/* Une modification du tableau de bord doit atteindre la page, même au
 * rechargement.
 *
 * `refreshPlaces` applique le catalogue SYNCHRONEMENT quand le cache de session
 * est encore chaud, depuis le gestionnaire DOMContentLoaded de site-common.js.
 * Or site-common.js est chargé avant script.js : au moment où l'annonce partait,
 * la fiche n'avait pas encore posé son écouteur. Au premier chargement le cache
 * est froid, la réponse vient du réseau, tout marche ; au rechargement suivant,
 * dans la minute, la page gardait les valeurs d'avant.
 *
 * Le défaut n'était pas théorique : un tarif comorien saisi dans le tableau de
 * bord s'affichait « À confirmer » à tout visiteur revenu sur la fiche. Mesuré
 * en ligne, puis corrigé en différant l'annonce d'un tour de boucle. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const commun = fs.readFileSync(path.join(RACINE, 'site-common.js'), 'utf8');
const fiche = fs.readFileSync(path.join(RACINE, 'script.js'), 'utf8');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Corps d'une fonction, délimité par comptage d'accolades. */
function corpsDe(source, entete) {
  const debut = source.indexOf(entete);
  if (debut < 0) throw new Error('fonction introuvable : ' + entete);
  let profondeur = 0;
  for (let j = source.indexOf('{', debut); j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}') {
      profondeur--;
      if (!profondeur) return source.slice(debut, j + 1);
    }
  }
  throw new Error('accolade de fin introuvable : ' + entete);
}

const corpsCatalogue = corpsDe(commun, 'function appliquerCatalogue(donnees)');

/* Contre-contrôle : sans lui, tous les contrôles suivants passeraient sur une
   tranche vide si la fonction était renommée. */
verifier('le corps d’appliquerCatalogue est bien trouvé',
  corpsCatalogue.length > 400 && corpsCatalogue.length < 4000, true);
verifier('et il est bien celui qui annonce le catalogue',
  corpsCatalogue.indexOf("'impactali:catalogue'") !== -1, true);

/* Le cœur du contrat : l'annonce ne doit PAS partir dans le même tour de boucle
   que l'application, sinon un écouteur posé par un script chargé plus tard ne
   l'entendra jamais. */
verifier('l’annonce du catalogue est différée d’un tour de boucle',
  /setTimeout\([\s\S]{0,120}impactali:catalogue/.test(corpsCatalogue), true);

/* Et elle ne doit pas rester AUSSI en version immédiate : une annonce doublée
   ferait travailler la page deux fois, et masquerait la régression en cas de
   retour en arrière partiel. On compte les annonces plutôt que de chercher une
   forme « immédiate » — la ligne différée s'écrit exactement comme l'autre, et
   une regex sur son indentation prendrait l'une pour l'autre. */
const annonces = (corpsCatalogue.match(/dispatchEvent\(new CustomEvent\('impactali:catalogue'\)\)/g) || []);
verifier('le catalogue n’est annoncé qu’une seule fois', annonces.length, 1);

/* La raison doit être écrite : sans elle, le premier qui trouvera ce setTimeout
   le prendra pour une scorie et le retirera. */
verifier('le motif du report est expliqué sur place',
  /cache/i.test(corpsCatalogue) && /script\.js/.test(corpsCatalogue), true);

/* La course n'existe que parce que le cache s'applique sans attendre. Si cette
   branche disparaissait, le report ci-dessus perdrait sa raison d'être — et ce
   contrôle doit alors être relu, pas supprimé. */
const corpsRefresh = corpsDe(commun, 'function refreshPlaces(force)');
verifier('le cache de session est bien appliqué sans attendre',
  /return Promise\.resolve\(appliquer\(cache\.releve\)\);/.test(corpsRefresh), true);

/* L'écouteur de la fiche doit exister : c'est lui que l'annonce vient réveiller.
   Sans ce contrôle, le report ne servirait personne. */
verifier('la fiche écoute bien l’annonce du catalogue',
  /addEventListener\('impactali:catalogue'/.test(fiche), true);
verifier('et elle en reprend les formations',
  /FORMATIONS = Array\.isArray\(window\.FORMATIONS\)/.test(fiche), true);

/* L'ordre de chargement est la cause première : si script.js passait avant
   site-common.js, la course disparaîtrait. Il est donc tenu ici. */
/* On vise les BALISES, pas les mentions : « script.js » apparaît aussi dans les
   commentaires de la fiche, et une simple recherche de texte le trouvait dès la
   ligne 146 — bien avant les balises de la fin de page. Le contrôle passait
   alors pour une raison qui n'avait rien à voir avec l'ordre de chargement. */
const page = fs.readFileSync(path.join(RACINE, 'formations', 'canva-pro', 'index.html'), 'utf8');
const balises = (page.match(/<script src="\/[^"]+\.js"><\/script>/g) || [])
  .map(b => (b.match(/src="\/([^"]+)"/) || [])[1]);
verifier('les quatre scripts de la fiche sont bien trouvés', balises.length >= 3, true);
verifier('site-common.js est chargé avant script.js',
  balises.indexOf('site-common.js') > -1
  && balises.indexOf('site-common.js') < balises.indexOf('script.js'), true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

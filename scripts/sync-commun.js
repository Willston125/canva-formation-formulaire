/* Ce que les deux synchronisations partagent : la mise en forme des valeurs.
 *
 * POURQUOI UN FICHIER COMMUN. `sync-sessions.js` et `sync-formations.js`
 * réécrivent tous deux `formations-data.js`. Une mise en forme fautive n'y
 * casse pas une ligne : elle empêche le fichier ENTIER de se charger, et le
 * site n'a plus ni formations, ni pays, ni coordonnées. Deux copies de cette
 * fonction, c'est le piège de l'apostrophe corrigé d'un côté et pas de l'autre
 * — le genre d'écart qu'on ne découvre qu'en production, un dimanche.
 */
'use strict';

/**
 * Une valeur JavaScript, écrite comme on l'écrirait à la main.
 *
 * Rend `null` pour tout ce qui ne doit PAS être écrit : une valeur absente,
 * un objet ou un tableau vide. Zéro et faux, eux, sont des valeurs — les
 * écarter afficherait « 20 places » sur une session complète, ou rouvrirait
 * une inscription fermée.
 *
 * @param {*} valeur
 * @param {{multiligne?: boolean, seuil?: number, marge?: string}} [options]
 *   `multiligne` met en forme les objets longs sur plusieurs lignes, décalés de
 *   `marge`. Sans lui, tout objet tient sur une ligne — c'est la forme d'origine,
 *   celle des réglages par pays d'une session, qui tiennent en trois champs.
 */
function litteral(valeur, options) {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === 'string') {
    /* Guillemets DOUBLES interdits ici : le fichier écrit ses chaînes entre
       apostrophes, et « L'atelier » fermerait la chaîne au milieu du mot. */
    return "'" + valeur.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  if (typeof valeur === 'object') {
    // VIDE = PAS ÉCRIT : la feuille renvoie « [] » quand rien n'est saisi.
    if (!Object.keys(valeur).length) return null;
    /* Guillemets DOUBLES conservés, tels que JSON les produit. Les remplacer
       par des apostrophes pour coller au style du fichier casserait la première
       valeur contenant une apostrophe. */
    const compact = JSON.stringify(valeur);
    const opts = options || {};
    if (!opts.multiligne || compact.length <= (opts.seuil || 100)) return compact;
    /* Un programme de quatre modules tient sur 2 000 caractères : écrit d'un
       seul tenant, il rend toute différence Git illisible, et personne ne relit
       plus ce que la synchronisation a changé. */
    return JSON.stringify(valeur, null, 2).split('\n').join('\n' + (opts.marge || ''));
  }
  return null;
}

/**
 * Un enregistrement complet, prêt à être posé dans le fichier.
 *
 * L'ORDRE des champs est imposé par l'appelant, et non laissé à
 * `JSON.stringify` : un ordre stable rend les différences Git lisibles, un
 * ordre au gré du sérialiseur les rend illisibles dès la deuxième
 * synchronisation.
 */
function enregistrementEnTexte(objet, ordre, options) {
  const opts = options || {};
  const marge = opts.marge === undefined ? '  ' : opts.marge;
  const champs = marge + '  ';
  const lignes = [];
  for (const champ of ordre) {
    if (!(champ in objet)) continue;
    const v = litteral(objet[champ], {
      multiligne: opts.multiligne,
      seuil: opts.seuil,
      marge: champs
    });
    /* Un champ vide n'est pas écrit : « currency: null » vaudrait une devise
       absente DÉCLARÉE, là où son absence laisse celle du pays faire foi. */
    if (v === null || v === "''" || v === '{}' || v === '[]') continue;
    lignes.push(champs + champ + ': ' + v);
  }
  return marge + 'Object.freeze({\n' + lignes.join(',\n') + '\n' + marge + '})';
}

/** L'adresse de l'API, lue dans le fichier lui-même : aucun repli codé en dur. */
function pointDeTerminaison(source) {
  return (/SITE_ENDPOINTS[\s\S]{0,400}?registration:\s*'([^']+)'/.exec(source) || [])[1]
    || (/https:\/\/script\.google\.com\/macros\/[^'"]+/.exec(source) || [])[0]
    || null;
}

/**
 * Remplace un bloc `window.NOM = Object.freeze([ … ]);` dans le fichier.
 * Rend `null` si le bloc est introuvable : mieux vaut ne rien écrire que
 * d'écrire à côté.
 */
function remplacerBloc(source, nom, contenu) {
  const entete = 'window.' + nom + ' = Object.freeze([';
  const debut = source.indexOf(entete);
  if (debut < 0) return null;
  const fin = source.indexOf('\n]);', debut);
  if (fin < 0) return null;
  const ancien = source.slice(debut + ('window.' + nom + ' = Object.freeze(').length, fin + 2);
  return {
    ancien,
    remplacer: bloc => source.slice(0, debut) + entete + '\n' + bloc + '\n]);' + source.slice(fin + 4)
  };
}

module.exports = { litteral, enregistrementEnTexte, pointDeTerminaison, remplacerBloc };

/* Ce que le tableau de bord enregistre doit se voir — et ce qu'il masque doit
   disparaître. Quatre défauts mesurés dans le navigateur, gardés ici au niveau
   de la source : l'épreuve ne rejoue pas le navigateur, elle empêche le retour
   des lignes exactes qui produisaient chaque défaut.

   1. « Visible sur le site » ne retirait la formation de rien.
   2. Le nettoyeur de texte enrichi effaçait la classe des icônes, qui sont des
      ligatures : « check_circle » s'affichait en toutes lettres.
   3. Après une suppression réussie, le bouton de confirmation restait désactivé.
   4. Supprimer la dernière réalisation faisait réapparaître celles du fichier. */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const landing = lire('landing.js');
const commun = lire('site-common.js');
const admin = lire('admin/admin.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. Une formation masquée ne paraît nulle part sur l'accueil ---

/* Le serveur renvoie TOUT : le tableau de bord doit voir les fiches masquées.
   C'est donc au site de trier, et il ne le faisait pas. */
verifier('le serveur ne filtre pas lui-même (sinon ce contrôle ne sert à rien)',
  /active/.test(lire('scripts/apps-script/impactali-inscriptions.gs')
    .slice(lire('scripts/apps-script/impactali-inscriptions.gs').indexOf('function lireCatalogue'),
           lire('scripts/apps-script/impactali-inscriptions.gs').indexOf('function lireTable'))), false);

verifier('l’accueil écarte les formations masquées',
  /const visibles = liste => \(Array\.isArray\(liste\) \? liste : \[\]\)\.filter\(f => f && f\.active !== false\);/.test(landing), true);

const affectations = (landing.match(/FORMATIONS = /g) || []).length;
const filtrees = (landing.match(/FORMATIONS = visibles\(window\.FORMATIONS\)/g) || []).length;
verifier('chaque affectation de FORMATIONS passe par le filtre', filtrees, affectations);

verifier('le calendrier écarte les sessions d’une formation masquée',
  /const f = FORMATIONS\.find\(x => x\.formId === session\.formId\);\s*\n\s*return !f \|\| f\.active !== false;/.test(commun), true);

// --- 2. Le nettoyeur garde la classe des icônes, et rien d'autre ---

verifier('la classe des icônes est explicitement autorisée',
  /const CLASSES_SURES = \['material-symbols-outlined'\];/.test(commun), true);
verifier('seuls les jetons autorisés sont conservés',
  /\.filter\(c => CLASSES_SURES\.includes\(c\)\)/.test(commun), true);
/* La suppression de TOUS les attributs doit rester : c'est elle qui retire
   style, onclick, onerror, id et les adresses. La classe est reposée après. */
verifier('tous les attributs sont toujours retirés d’abord',
  /Array\.from\(el\.attributes\)\.forEach\(attr => el\.removeAttribute\(attr\.name\)\);/.test(commun), true);
verifier('une icône conservée reste muette pour les lecteurs d’écran',
  /el\.setAttribute\('aria-hidden', 'true'\);/.test(commun), true);

/* Les balises acceptées ne doivent pas s'être élargies au passage. */
const balises = /const BALISES = \[([^\]]*)\]/.exec(commun);
verifier('la liste des balises acceptées est inchangée',
  balises ? balises[1].replace(/['\s]/g, '').split(',') : null,
  ['SPAN', 'STRONG', 'EM', 'B', 'I', 'BR', 'SMALL']);

// --- 3. Le bouton de confirmation ne reste pas désactivé ---

verifier('le bouton de confirmation est réactivé à chaque ouverture',
  /var nouveau = bouton\.cloneNode\(true\);[\s\S]{0,400}?nouveau\.disabled = false;/.test(admin), true);

// --- 4. La dernière réalisation ne se supprime pas ---

verifier('supprimer la dernière réalisation est refusé',
  /if \(listeRealisations\(\)\.length <= 1\) \{/.test(admin), true);

/* Le refus n'a de sens que tant que le site retombe sur son fichier quand la
   base est vide. Si cette garde disparaissait, le refus deviendrait absurde. */
verifier('le site retombe bien sur son fichier quand la base n’a aucune réalisation',
  /if \(Array\.isArray\(donnees\.portfolio\) && donnees\.portfolio\.length\) \{/.test(commun), true);

// --- 5. Un texte de fiche doit changer TOUTES les fiches ---

/* Le générateur remplace les blocs « Prérequis » et « Votre formateur » par une
   version générique sur toutes les fiches sauf celle du gabarit. Cette version
   ne portait aucun `data-texte` : les champs « Fiche formation » du tableau de
   bord ne changeaient qu'une fiche sur six. Elle portait aussi une classe
   absente de la feuille de style, d'où des puces de navigateur au milieu d'une
   page soignée. */
const fiches = fs.readdirSync(path.join(RACINE, 'formations'))
  .filter(d => d !== '_template' && fs.existsSync(path.join(RACINE, 'formations', d, 'index.html')));

const clesDe = f => [...new Set((fs.readFileSync(path.join(RACINE, 'formations', f, 'index.html'), 'utf8')
  .match(/data-texte(?:-html)?="[^"]+"/g) || []))].sort();

verifier('les six fiches sont bien générées', fiches.length, 6);

/* Deux clés restent propres au gabarit, et on le dit plutôt que de le masquer.
   `fiche.prerequis.4` : la version générique ne compte que trois lignes, et en
   inventer une quatrième serait inventer du contenu.
   `fiche.formateur.titre` : sur le gabarit c'est un titre (« Votre Formateur »),
   sur la version générique ce rôle est tenu par un sur-titre en capitales. Leur
   donner la même clé ferait désigner DEUX textes différents par un seul champ —
   ce que l'épreuve des textes refuse, à juste titre. Les réunir demanderait de
   refondre le bloc générique, ce qui dépasse une correction de défaut. */
const EXCEPTIONS = [
  'data-texte-html="fiche.prerequis.4"',
  'data-texte="fiche.formateur.titre"'
];
const reference = clesDe('canva-pro').filter(c => EXCEPTIONS.indexOf(c) < 0);
const manquantes = {};
fiches.filter(f => f !== 'canva-pro').forEach(f => {
  const absentes = reference.filter(c => clesDe(f).indexOf(c) < 0);
  if (absentes.length) manquantes[f] = absentes;
});
verifier('chaque fiche expose les mêmes textes modifiables', manquantes, {});
resultats.push('NOTE  clé propre au gabarit, assumée : ' + JSON.stringify(EXCEPTIONS));

/* Une classe sans règle produit un affichage nu. Celle-ci n'a jamais existé
   dans la feuille de style. */
const style = lire('style.css');
verifier('la classe de liste employée existe dans la feuille de style',
  style.indexOf('.prerequis-list') >= 0, true);
const nue = fiches.filter(f =>
  fs.readFileSync(path.join(RACINE, 'formations', f, 'index.html'), 'utf8').indexOf('fiche-prerequisites') >= 0);
verifier('aucune fiche n’emploie la classe sans style', nue, []);
/* On cherche une ÉMISSION — `class="fiche-prerequisites` — et non une simple
   mention : les commentaires qui expliquent la correction citent le nom. */
const emet = f => /class="fiche-prerequisites/.test(lire(f));
verifier('aucun générateur n’émet plus la classe sans style',
  ['fiche-blocs.js', 'scripts/build-fiches.js'].filter(emet), []);

// --- 6. Aucune coordonnée de paiement d'un pays ne doit fuir sur un autre ---

/* La page porte en dur les coordonnées djiboutiennes. N'y écrire que si la
   valeur existe les laissait donc en place : un candidat comorien voyait le
   nom, le lieu et le téléphone de Djibouti, et serait venu payer là-bas. */
const formulaire = lire('script.js');

verifier('une coordonnée absente masque sa case au lieu de garder l’ancienne',
  /function poserCoordonnee\(el, valeur\) \{[\s\S]*?boite\.style\.display = v \? '' : 'none';/.test(formulaire), true);
verifier('les coordonnées mobiles passent par là',
  /poserCoordonnee\(numText, method\?\.number\);/.test(formulaire)
  && /poserCoordonnee\(account, method\?\.accountName\);/.test(formulaire), true);
verifier('les coordonnées en espèces aussi',
  /const set = \(id, value\) => poserCoordonnee\(document\.getElementById\(id\), value\);/.test(formulaire), true);

/* Le moyen « espèces » se reconnaissait à son libellé exact : le renommer
   depuis le tableau de bord faisait disparaître les instructions de paiement. */
verifier('le paiement en espèces se reconnaît à sa nature, pas à son libellé',
  /\} else if \(method \? method\.kind === 'cash' : value === 'Espèces'\) \{/.test(formulaire), true);

/* Le repli sur le libellé ne vaut que pour une donnée ancienne sans `kind` :
   la nature doit rester déclarée dans les données du site. */
const donneesSite = lire('formations-data.js');
verifier('les moyens de paiement déclarent leur nature',
  /kind: 'cash'/.test(donneesSite) && /kind: 'mobile'/.test(donneesSite), true);

// --- 7. L'aperçu d'un visuel doit pointer où il faut ---

/* Les pages déclarent leurs visuels en relatif. Le tableau de bord vit dans
   /admin/ : la même adresse y désignait /admin/assets/…, qui n'existe pas.
   Mesuré : 404 avant, 200 après. */
verifier('l’adresse d’un visuel est résolue depuis sa page, pas depuis /admin/',
  /function adresseAbsolue\(src, adressePage\)/.test(admin)
  && /new URL\(src, window\.location\.origin \+ \(adressePage \|\| '\/'\)\)\.pathname/.test(admin), true);
verifier('le relevé des visuels sait de quelle page vient chaque adresse',
  /origine: adresseAbsolue\(el\.getAttribute\('src'\) \|\| '', adressePage\)/.test(admin), true);

/* Le contrôle ne vaut que tant que le site déclare bien des adresses relatives. */
const accueil = lire('index.html');
const relatifs = [...accueil.matchAll(/<img[^>]*data-image="([^"]+)"[^>]*>/g)]
  .filter(m => !/src="(?:https?:|data:|\/)/.test(m[0])).map(m => m[1]);
verifier('des visuels sont bien déclarés en relatif (sinon ce contrôle ne prouve rien)',
  relatifs.length > 0, true);

// --- 8. Le téléphone d'un candidat s'affiche avec son indicatif ---

verifier('le tableau de bord affiche le numéro international',
  /echapper\(i\.telephoneInternational \|\| i\.telephone \|\| '—'\)/.test(admin), true);

const colonnes = lire('scripts/apps-script/impactali-inscriptions.gs');
const blocColonnes = colonnes.slice(colonnes.indexOf('var COLONNES = ['), colonnes.indexOf('CHAMPS_FORMATION'));
verifier('« countryCode » n’est toujours pas une colonne : on ne peut donc pas s’y fier',
  /countryCode/.test(blocColonnes), false);
verifier('« telephoneInternational », lui, en est une',
  /telephoneInternational/.test(blocColonnes), true);

// --- 9. Un échec d'ouverture n'efface pas le mot de passe mémorisé ---

verifier('le mot de passe n’est oublié que si le serveur l’a refusé',
  /var refuse = !!\(err && err\.authentification === false\);/.test(admin)
  && /if \(refuse\) \{\s*\n\s*etat\.motDePasse = '';/.test(admin), true);

// --- 10. Échap ne ferme que la fenêtre du dessus ---

/* Le recadrage s'ouvre par-dessus le panneau et pose son propre écouteur. Les
   deux répondaient à Échap : on annulait un cadrage, et tout le formulaire en
   cours disparaissait avec le panneau. */
verifier('Échap laisse le panneau tranquille quand un recadrage est ouvert',
  /if \(document\.querySelector\('\.recadrage'\)\) return;/.test(admin), true);

/* Et le recadrage rend le défilement tel qu'il l'a trouvé : le remettre à vide
   laissait la page glisser derrière un panneau toujours ouvert. */
verifier('le recadrage rend le défilement tel qu’il l’a trouvé',
  /var defilementAvant = document\.body\.style\.overflow;/.test(admin)
  && /document\.body\.style\.overflow = defilementAvant;/.test(admin), true);

// --- 11. Un échec d'enregistrement ne peut pas être muet ---

verifier('une erreur arrivée après la fermeture du panneau s’affiche en pleine page',
  /if \(\$\('#panneau'\)\.hidden\) \{\s*\n\s*afficherMessage\('#erreur-globale', erreur, 9000\);/.test(admin), true);

/* Le délai d'attente abandonne l'attente, pas la requête : le message ne doit
   pas laisser croire à un échec certain. */
verifier('le message de délai dit quoi faire avant de réessayer',
  /actualisez la page avant de réessayer/.test(admin), true);

// --- 12. Le lien d'une fiche publiée ne se change pas depuis le tableau de bord ---

/* La fiche est un fichier généré puis publié. Changer le lien ne déplace rien :
   l'ancienne adresse reste servie, la nouvelle n'existe nulle part. */
verifier('changer le lien d’une fiche publiée est refusé',
  /if \(valeurs\.hasDetailPage && valeurs\.slug !== donnees\.slug\) \{/.test(admin), true);

/* Le refus n'a de sens que si les fiches sont bien des fichiers du dépôt. */
verifier('les fiches sont bien des fichiers publiés', fiches.length > 0, true);

// --- 13. Aucun tarif ne doit être inventé en changeant de pays par défaut ---

/* `price` est le tarif unique d'avant les tarifs par pays. En sortir un montant
   parce que le pays demandé se trouve être celui par défaut faisait afficher les
   7 500 FDJ djiboutiens en « 7 500 KMF » dès qu'on désignait les Comores par
   défaut. Mesuré dans le navigateur : ancienne règle « 7500 KMF », nouvelle
   « À confirmer ». */
verifier('le tarif hérité ne sert que faute de table de tarifs',
  /if \(objet\.prices && typeof objet\.prices === 'object'\) return null;/.test(commun), true);

/* Le contrôle ne vaut que tant que les formations ont bien une table, sans quoi
   la garde serait inerte et ne prouverait rien. */
const site = { window: {} };
require('vm').runInNewContext(donneesSite, site);

const sansTable = (site.window.FORMATIONS || [])
  .filter(f => !f.prices || typeof f.prices !== 'object').map(f => f.formId);
verifier('chaque formation déclare une table de tarifs', sansTable, []);

/* Et personne n'a saisi de tarif comorien : c'est justement le cas qui
   fabriquait un montant. */
const paysDeclares = (site.window.PAYS || []).map(p => p.code);
const sansTarif = {};
paysDeclares.forEach(code => {
  const manquent = (site.window.FORMATIONS || [])
    .filter(f => typeof (f.prices || {})[code] !== 'number').map(f => f.formId);
  if (manquent.length) sansTarif[code] = manquent.length + ' formation(s)';
});
resultats.push('NOTE  tarifs non fixés, annoncés « À confirmer » : ' + JSON.stringify(sansTarif));

/* Aucune conversion : un tarif se rend tel qu'il a été saisi. Une regex sur le
   mot « conversion » ne prouverait rien — les commentaires l'emploient. On
   regarde donc le corps de prixDe : il ne doit y avoir aucun calcul. */
const corpsPrixDe = commun.slice(commun.indexOf('function prixDe(objet, code)'));
const finPrixDe = corpsPrixDe.indexOf('\n    }\n');
const code = corpsPrixDe.slice(0, finPrixDe).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
verifier('aucun calcul appliqué à un tarif', /[*\/]\s*(?:taux|[\d.]+)/.test(code), false);

// --- 14. Le texte du tableau de bord doit rester lisible ---

/* Mesuré : --texte-faible donnait 3,56 et 3,27 sur les deux fonds, sous le
   seuil AA de 4,5 — alors qu'il sert à du texte normal (messages d'erreur
   d'envoi d'image, coordonnées des candidats). */
const css = lire('admin/admin.css');
const variable = nom => (new RegExp('--' + nom + ':\\s*(#[0-9A-Fa-f]{6})').exec(css) || [])[1];

const canal = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luminance = hex => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
};
const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const fonds = ['surface-2', 'surface-3'].map(variable).filter(Boolean);
const textes = ['texte', 'texte-doux', 'texte-faible'].map(n => [n, variable(n)]).filter(p => p[1]);

verifier('les couleurs du tableau de bord sont bien lues',
  fonds.length === 2 && textes.length === 3, true);

const souslesSeuil = [];
textes.forEach(([nom, couleur]) => {
  fonds.forEach(fond => {
    const r = contraste(couleur, fond);
    if (r < 4.5) souslesSeuil.push(nom + ' sur ' + fond + ' = ' + r.toFixed(2));
  });
});
verifier('chaque couleur de texte atteint le seuil AA (4,5)', souslesSeuil, []);
resultats.push('NOTE  contrastes mesurés : '
  + textes.map(([n, c]) => n + ' ' + Math.min(...fonds.map(f => contraste(c, f))).toFixed(2)).join(' · '));

// --- 15. On n'enregistre pas pendant l'envoi d'une image ---

/* Le panneau pouvait être validé pendant qu'une image montait encore : la fiche
   partait SANS elle, avec un message de succès, et rien ne le démentait. Le
   compteur doit être rendu dans les DEUX issues — succès et échec — sinon il
   resterait positif et plus rien ne s'enregistrerait. */
verifier('un envoi d’image en cours empêche l’enregistrement',
  admin.indexOf('if (etat.envoisImage > 0) {') >= 0, true);
verifier('le compteur est rendu dans les deux issues',
  (admin.match(/etat\.envoisImage--;/g) || []).length, 2);
verifier('et pris une seule fois',
  (admin.match(/etat\.envoisImage\+\+;/g) || []).length, 1);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

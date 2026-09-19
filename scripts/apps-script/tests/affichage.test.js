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

/* Plus aucune exception : les blocs génériques « Prérequis » et « Votre
   formateur » portent désormais le même squelette que le gabarit, donc les
   mêmes clés — la quatrième ligne de prérequis et le titre du formateur
   compris. Un champ « Fiche formation » du tableau de bord change les six. */
const reference = clesDe('canva-pro');
const manquantes = {};
fiches.filter(f => f !== 'canva-pro').forEach(f => {
  const absentes = reference.filter(c => clesDe(f).indexOf(c) < 0);
  if (absentes.length) manquantes[f] = absentes;
});
verifier('chaque fiche expose TOUS les textes modifiables du gabarit', manquantes, {});
verifier('le titre « Votre formateur » est sur les six fiches',
  fiches.filter(f => clesDe(f).indexOf('data-texte="fiche.formateur.titre"') < 0), []);

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
   regarde donc le corps de prixDe : il ne doit y avoir aucun calcul.
 *
 * La fin de la fonction se cherche en COMPTANT LES ACCOLADES, et non par le
 * repère « \n    }\n » qui servait avant. Ce repère supposait des fins de ligne
 * Unix : le jour où git a réécrit le fichier en CRLF, il a cessé de matcher,
 * la tranche est passée de 1 944 à 26 325 caractères, et la garde s'est mise à
 * inspecter du code qui n'a rien à voir avec un tarif — une division dans le
 * calcul d'un zoom l'a fait crier. Une garde qui déborde finit par accuser à
 * tort, puis par être désarmée : elle ne doit lire QUE ce qu'elle annonce. */
function corpsDeLaFonction(source, entete) {
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

const corpsPrixDe = corpsDeLaFonction(commun, 'function prixDe(objet, code)');
const code = corpsPrixDe.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
/* Le découpage doit rester serré : au-delà, c'est qu'il a débordé sur les
   fonctions voisines, et la garde ne prouverait plus rien de prixDe. */
verifier('la garde ne lit que le corps de prixDe', code.length < 4000, true);
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

// --- 16. Une affiche de réalisation garde son format d'origine ---

/* La grille de l'accueil montre les réalisations en 4/3, mais par recadrage
   CSS — réversible. Imposer ce cadre À L'ENVOI rognait l'affiche pour de bon,
   alors que le survol et la visionneuse promettent de la montrer entière. */
const formatPortfolio = /portfolio: \{ largeur: (\d+), hauteur: (null|\d+)/.exec(admin);
verifier('le format des réalisations est bien déclaré', !!formatPortfolio, true);
verifier('une réalisation n’est pas rognée à l’envoi',
  formatPortfolio ? formatPortfolio[2] : null, 'null');

/* La promesse doit exister quelque part, sinon ce contrôle ne défend rien. */
verifier('le survol montre bien l’affiche entière',
  /object-fit: contain/.test(style), true);

// --- 17. Le choix du pays doit être atteignable partout ---

/* Le seul sélecteur vivait dans le formulaire d'inscription, masqué justement
   quand aucune session n'est ouverte : un visiteur mal reconnu voyait alors les
   tarifs et le numéro d'un autre pays sans aucun recours. */
verifier('un choix du pays est greffé au pied de page',
  /function initChoixPays\(\)/.test(commun)
  && /document\.querySelector\('\.site-footer__brand'\)/.test(commun), true);
verifier('il n’apparaît pas quand un seul pays est desservi',
  /if \(dispo\.length < 2\) \{ if \(ancien\) ancien\.remove\(\); return; \}/.test(commun), true);
verifier('il reste d’accord avec celui du formulaire',
  /document\.addEventListener\('impactali:pays', \(\) => \{\s*\n\s*const select = document\.getElementById\('choix-pays-pied'\);/.test(commun), true);

/* Le greffon ne tient que si ce pied existe sur TOUTES les pages, fiches
   générées comprises — sinon le sélecteur manquerait là où il sert le plus. */
const pagesDuSite = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html',
  'inscription/index.html'].concat(fiches.map(f => 'formations/' + f + '/index.html'));
const sansPied = pagesDuSite.filter(p => lire(p).indexOf('site-footer__brand') < 0);
verifier('chaque page porte le pied où le sélecteur se greffe', sansPied, []);

verifier('le sélecteur est habillé', /\.choix-pays__select \{/.test(style), true);
/* Cible tactile : un menu déroulant de moins de 44 px se rate au doigt. */
const hauteurSelect = /\.choix-pays__select \{[^}]*min-height: (\d+)px/.exec(style);
verifier('sa hauteur permet de le viser au doigt',
  hauteurSelect ? Number(hauteurSelect[1]) >= 44 : false, true);

// --- 18. Une image envoyée puis abandonnée ne reste pas dans Drive ---

/* L'image part vers Drive dès qu'on la choisit, bien avant d'enregistrer.
   Renoncer ensuite la laissait là pour toujours : rien ne la référençait, rien
   ne la supprimait. Sur un compte dont l'espace est compté, elles s'accumulent. */
verifier('les images envoyées non encore enregistrées sont suivies',
  /if \(etat\.imagesPosees\.indexOf\(reponse\.url\) < 0\) etat\.imagesPosees\.push\(reponse\.url\);/.test(admin), true);
verifier('un enregistrement réussi les retire de la liste à effacer',
  /function viderCorbeilleImages\(\)[\s\S]{0,400}?etat\.imagesPosees = \[\];/.test(admin), true);

const abandons = ['function fermerPanneau', 'function allerA'].filter(f => {
  const i = admin.indexOf(f);
  return i >= 0 && /abandonnerImagesPosees\(\);/.test(admin.slice(i, i + 900));
});
verifier('renoncer les efface — panneau fermé ET vue changée',
  abandons, ['function fermerPanneau', 'function allerA']);

// --- 19. La barre d'en-tête doit passer à la ligne sur petit écran ---

/* `order: 3` et `width: 100%` ne peuvent rien dans un conteneur flex qui ne
   passe pas à la ligne : tout reste sur une rangée et se comprime. Mesuré à
   375 px : le bouton d'action tenait dans 167 px et faisait 57 px de haut,
   c'est-à-dire deux lignes, collé au titre. Après : 343 px, 44 px, une ligne. */
const petitEcran = css.slice(css.indexOf('@media (max-width: 900px)'));
verifier('l’en-tête passe à la ligne sous 900 px',
  /\.entete \{ flex-wrap: wrap; \}/.test(petitEcran.slice(0, 900)), true);
verifier('la règle qui en dépend est toujours là',
  /\.entete__actions \{ width: 100%; margin-left: 0; order: 3; \}/.test(petitEcran.slice(0, 900)), true);

// --- 20. WhatsApp ne paraît QUE dans le parcours d'inscription ---

/* Ailleurs — accueil, entreprises, mentions légales, pied de page — c'est
   l'adresse email qui est proposée. Le numéro WhatsApp, lui, suit le pays du
   candidat, et n'a de sens qu'au moment où il s'inscrit. */
const HORS_INSCRIPTION = ['index.html', 'entreprises/index.html', 'mentions-legales/index.html'];
const DANS_INSCRIPTION = ['inscription/index.html'].concat(fiches.map(f => 'formations/' + f + '/index.html'));

const compte = (f, motif) => (lire(f).match(motif) || []).length;

const fuites = HORS_INSCRIPTION.filter(f =>
  compte(f, /data-whatsapp-(message|affiche|tel)/g) > 0 || compte(f, /wa\.me\//g) > 0);
verifier('aucun WhatsApp hors du parcours d’inscription', fuites, []);

const muettes = DANS_INSCRIPTION.filter(f => compte(f, /data-whatsapp-message/g) === 0);
verifier('le parcours d’inscription garde bien WhatsApp', muettes, []);

/* Et il y affiche le numéro : c'est là que le candidat doit le lire. */
const sansNumero = DANS_INSCRIPTION.filter(f => compte(f, /data-whatsapp-affiche/g) === 0);
verifier('le numéro du pays s’affiche à l’inscription', sansNumero, []);

// --- 21. L'adresse email est déclarée, affichée et modifiable ---

verifier('le site déclare une adresse de contact',
  /contactEmail: '[^']+@[^']+'/.test(donneesSite), true);
verifier('le site sait poser les liens email',
  /function initLiensEmail\(\)/.test(commun) && /\[data-email-sujet\]/.test(commun), true);
verifier('l’adresse se change depuis les réglages',
  /cle: 'contactEmail'/.test(admin), true);

/* Chaque lien email doit porter un sujet : un mailto nu ouvre un message vide,
   et on ne sait plus d'où vient la personne. */
const sansSujet = HORS_INSCRIPTION.concat(DANS_INSCRIPTION).filter(f => {
  const liens = (lire(f).match(/<a[^>]*href="mailto:[^>]*>/g) || []);
  return liens.some(l => l.indexOf('data-email-sujet') < 0);
});
verifier('chaque lien email annonce son sujet', sansSujet, []);

/* La bulle flottante ouvrait WhatsApp : elle ouvre l'email, elle ne peut plus
   en porter les couleurs. Et sur le vert de marque, le texte est SOMBRE. */
const accueil2 = lire('index.html');
verifier('la bulle ne se fait plus passer pour WhatsApp',
  /25D366|whatsapp-float/.test(accueil2), false);
const bulle = /<a[^>]*id="contact-float"[\s\S]{0,700}?<\/a>/.exec(accueil2);
verifier('la bulle est repérée', !!bulle, true);
verifier('la bulle porte le vert de marque et une icône sombre',
  bulle ? /bg-\[#CBFD00\]/.test(bulle[0]) && /text-\[#050709\]/.test(bulle[0]) : false, true);

// --- 22. Les six fiches ont le même formateur, pas une version appauvrie ---

/* Le bloc « Votre formateur » était réécrit à la main pour les cinq autres
   fiches, sans la carte photo animée ni les étiquettes : le même homme y
   paraissait plus terne, sans raison. Il se dérive maintenant du gabarit, et
   seul le badge change — il nomme la formation. */
const sansCarte = fiches.filter(f =>
  lire('formations/' + f + '/index.html').indexOf('class="card shrink-0"') < 0);
verifier('chaque fiche porte la carte du formateur', sansCarte, []);

const badges = {};
fiches.forEach(f => {
  const m = /<small[^>]*class="badge[^"]*"[^>]*>([\s\S]*?)<\/small>/
    .exec(lire('formations/' + f + '/index.html'));
  badges[f] = m ? m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : null;
});
verifier('chaque badge nomme SA formation',
  Object.entries(badges).filter(([, b]) => !b || b === 'CANVA PRO' && badges['canva-pro'] !== b).map(([f]) => f), []);
verifier('aucun badge n’est vide', Object.entries(badges).filter(([, b]) => !b).map(([f]) => f), []);
resultats.push('NOTE  badges : ' + Object.values(badges).join(' · '));

/* La photo du formateur ne doit PAS être remplacée par l'affiche de la
   formation : le gabarit sert le même fichier aux deux usages, et un
   remplacement aveugle mettait l'affiche sous le nom du formateur. */
const photosFausses = fiches.filter(f => {
  const h = lire('formations/' + f + '/index.html');
  const img = /<img[^>]*alt="Ali William"[^>]*>/.exec(h);
  return !img || !/formation canva \(2\)\.jpg/.test(img[0]);
});
verifier('la carte montre bien le formateur, pas l’affiche', photosFausses, []);

verifier('la photo du formateur se remplace depuis le tableau de bord',
  fiches.filter(f => lire('formations/' + f + '/index.html').indexOf('data-image="fiche.formateur.photo"') < 0), []);

// --- 23. Les prérequis appartiennent à la formation, pas au site ---

/* Ils étaient un texte UNIQUE partagé par les six fiches : « un compte Canva
   gratuit suffit » s'affichait sur Photo & Vidéo. Chaque formation porte
   maintenant les siens, comme son programme et sa FAQ — même chaîne complète :
   colonne au serveur, champ au tableau de bord, rendu au build ET à l'exécution. */
const blocs = lire('fiche-blocs.js');
verifier('le module des blocs sait rendre des prérequis',
  /prerequisInterieur: prerequisInterieur/.test(blocs) && /aDesPrerequis: function/.test(blocs), true);

const gs = lire('scripts/apps-script/impactali-inscriptions.gs');
verifier('le serveur déclare la colonne', /\['prerequis', 'json'\]/.test(gs), true);
verifier('le tableau de bord la propose', /cle: 'prerequis'/.test(admin), true);

const generateur = lire('scripts/build-fiches.js');
verifier('le générateur préfère les prérequis de la formation',
  /if \(BLOCS\.aDesPrerequis\(f\)\) \{/.test(generateur), true);
verifier('et retombe sur les communs pour une fiche générée',
  /\} else if \(f\.slug !== 'canva-pro'\) \{/.test(generateur), true);

verifier('la fiche les réactualise sans régénération',
  /remplir\('prerequis-section', blocs\.aDesPrerequis\?\.\(formation\)/.test(formulaire), true);

/* Une colonne ajoutée au serveur oblige à republier : la version doit changer
   des DEUX côtés, sinon le tableau de bord ne saura pas le dire. */
const versionGs = /var VERSION = '([^']+)'/.exec(gs);
const versionSite = /versionScript: '([^']+)'/.exec(donneesSite);
verifier('le script et le site annoncent la même version',
  versionGs && versionSite ? versionGs[1] === versionSite[1] : false, true);
resultats.push('NOTE  version attendue en production : ' + (versionGs ? versionGs[1] : '?'));

// --- 24. Une formation ajoutée plus tard peut avoir sa vraie fiche ---

/* Le générateur ne lisait que le FICHIER : une formation créée dans le tableau
   de bord n'y figure pas, et n'aurait donc jamais eu de page — seulement
   l'inscription générique, sans programme, sans FAQ, sans prérequis. */
verifier('le générateur sait lire la base',
  /--depuis-le-site/.test(generateur) && /action=catalogue/.test(generateur), true);
/* Une base vide écraserait toutes les fiches par rien. */
verifier('une base vide interrompt la génération',
  /if \(!liste\.length\) throw new Error/.test(generateur), true);

/* Générer la fiche ne suffit pas : tant que la formation annonce qu'elle n'a
   pas de page, son lien pointe vers l'inscription générique. */
verifier('le tableau de bord permet de déclarer une fiche',
  /cle: 'hasDetailPage'/.test(admin), true);
verifier('et prévient avant de le faire',
  /a-t-elle bien été /.test(admin), true);

/* La page générique garde ses trois sections en réserve : c'est là que
   script.js écrit programme, FAQ et prérequis d'une formation sans fiche. */
const generique = lire('inscription/index.html');
['programme-section', 'faq-section', 'prerequis-section'].forEach(id => {
  verifier('la page générique garde « ' + id + ' » en réserve',
    new RegExp('id="' + id + '"[^>]*hidden').test(generique), true);
});

// --- 25. Une session peut être proposée dans PLUSIEURS pays ---

/* Le champ ne portait qu'UN code : une session s'ouvrait à un pays, ou à tous.
   Il accepte maintenant une liste — « DJ,KM » — cochée pays par pays. Vide
   garde l'ancien sens : partout, y compris dans un pays ajouté plus tard. */
verifier('le site sait lire une liste de pays',
  /function paysDeSession\(session\)/.test(commun) && /function sessionOuverteAu\(session, code\)/.test(commun), true);
verifier('le calendrier filtre sur cette liste',
  /\.filter\(session => !pays \|\| sessionOuverteAu\(session, pays\.code\)\)/.test(commun), true);

/* Une session n'a qu'UN prix, donc une seule devise. L'appliquer à plusieurs
   pays afficherait 7 500 FDJ en « 7 500 KMF » — un montant que personne n'a
   saisi, et la conversion que l'exploitant refuse. */
verifier('le prix d’une session multi-pays est écarté',
  /if \(codesSession\.length > 1\) return null;/.test(commun), true);

verifier('le tableau de bord coche les pays un à un',
  /type: 'paysCases'/.test(admin) && /function lirePaysCases\(cle, racine\)/.test(admin), true);
verifier('et relit toutes les cases cochées',
  /\.filter\(function \(e\) \{ return e\.checked; \}\)/.test(admin), true);

/* Supprimer un pays doit voir les sessions qui le citent PARMI d'autres, sinon
   elles resteraient en renvoyant à un pays disparu. */
verifier('le serveur détecte un pays cité parmi d’autres',
  /String\(s\.pays \|\| ''\)\.split\(','\)\.some\(function \(c\) \{/.test(gs), true);

// --- 26. Audit avant lancement : polices, liens, cibles tactiles ---

/* Aucune face italique n'est chargée : demander un `font: italic` fait
   fabriquer au navigateur un faux penché. Seule la signature du hero était
   dans ce cas. Elle ne doit plus réclamer d'italique. (`style` et `generateur`
   sont déjà lus plus haut dans ce fichier.) */
const sig = /\.hero-signature\s*\{[\s\S]*?\}/.exec(style);
verifier('la signature du hero ne réclame plus d’italique',
  sig ? /font:\s*italic/.test(sig[0]) : true, false);

/* Tous les titres du site sont en Plus Jakarta Sans. Les h2 du pied faisaient
   exception, seuls titres en Inter. */
const piedH2 = /\.site-footer__col h2\s*\{[\s\S]*?\}/.exec(style);
verifier('les titres du pied de page sont dans la famille des titres',
  piedH2 ? /'Plus Jakarta Sans'/.test(piedH2[0]) : false, true);

/* La page d'inscription générique vit à /inscription/, pas sous /formations/.
   Son adresse ne doit plus jamais être dérivée du slug. */
verifier('l’adresse de la page générique n’est pas dérivée du slug',
  /f\.id === 'inscription-generique' \? '\/inscription\/'/.test(generateur), true);
const inscriptionHtml = lire('inscription/index.html');
verifier('la page générique ne contient aucun lien /formations/inscription/',
  inscriptionHtml.indexOf('formations/inscription') >= 0, false);

/* La zone tactile des points du carrousel : au moins 36 px, mesuré à 375 px. */
const dot = /\.carousel-dot\s*\{[\s\S]*?\}/.exec(style);
const tailleDot = dot ? Number((/(?:width|height):\s*(\d+)px/.exec(dot[0]) || [])[1]) : 0;
verifier('la cible tactile des points du carrousel atteint 36 px', tailleDot >= 36, true);

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

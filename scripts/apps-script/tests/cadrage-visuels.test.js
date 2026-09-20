/* Le cadrage d'un visuel se range À CÔTÉ de son adresse, pas dans le fichier.
 *
 * Une photo remplacée depuis le tableau de bord ne s'affiche pas comme celle
 * livrée avec le design : le site impose à chaque emplacement un cadrage taillé
 * pour la photo d'origine, et la nouvelle arrive décapitée ou de travers.
 * Recadrer le fichier lui-même serait sans retour — on ne pourrait plus
 * reprendre le réglage sans renvoyer la photo, et l'original serait perdu. On
 * range donc position et zoom dans une TROISIÈME colonne de l'onglet Images,
 * à côté de l'adresse.
 *
 * Cet onglet ne peut plus passer par lirePaires / ecrirePaires : ces deux
 * fonctions servent aussi Textes et Reglages, qui n'ont que deux colonnes.
 * Les élargir aurait fait porter le risque à des onglets qui n'ont rien
 * demandé — c'est pourquoi la dernière épreuve les relit, eux aussi. */
'use strict';

const path = require('path');
const CHEMIN_GS = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
process.env.GS_SOURCE = CHEMIN_GS;
const { bac, creerFeuille } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

const poste = (charge) => JSON.parse(bac.doPost({ postData: { contents: JSON.stringify(
  Object.assign({ motDePasse: 'motdepasse-de-test' }, charge)) } })._t);
const catalogue = () => JSON.parse(bac.doGet({ parameter: { action: 'catalogue' } })._t);
/* Un catalogue qui ne porterait aucune de ces deux tables ferait échouer chaque
   contrôle sur place, et l'on ne verrait plus rien du reste. On le laisse donc
   rendre « rien » pour la clé demandée — les deux premiers contrôles, eux,
   éprouvent que les tables existent bel et bien. */
const images = () => catalogue().images || {};
const cadrages = () => catalogue().cadrages || {};

/* Deux adresses distinctes : réutiliser la même laisserait passer une écriture
   qui n'a rien écrit du tout. */
const VISUEL = 'https://lh3.googleusercontent.com/d/aaaaaaaaaaaaaaaaaaaaaa=w1200-rw';
const AUTRE_VISUEL = 'https://lh3.googleusercontent.com/d/bbbbbbbbbbbbbbbbbbbbbb=w1200-rw';

// --- 1. Une base vierge ne propose ni visuel ni cadrage ---
verifier('feuille vierge : aucun visuel', catalogue().images, {});
verifier('feuille vierge : aucun cadrage', catalogue().cadrages, {});

// --- 2. Un visuel sans cadrage : l'adresse suffit ---
/* C'est l'état de tout remplacement fait jusqu'ici. Rien ne doit exiger un
   cadrage pour que la photo s'affiche.
   On enregistre un VOISIN cadré dans le même mouvement : sans lui, le contrôle
   d'absence ci-dessous passerait tout seul devant une lecture des cadrages
   morte, qui ne rendrait jamais rien. */
verifier('un visuel s’enregistre',
  poste({
    action: 'admin.images.save',
    donnees: { 'accueil-hero': VISUEL, 'entreprises-banniere': AUTRE_VISUEL },
    cadrages: { 'entreprises-banniere': { x: 70, y: 30, zoom: 160 } }
  }).ok, true);
verifier('son adresse est rendue telle quelle', images()['accueil-hero'], VISUEL);
verifier('et il n’a aucun cadrage', cadrages()['accueil-hero'], undefined);
verifier('alors que le visuel voisin, lui, rend le sien',
  cadrages()['entreprises-banniere'], { x: 70, y: 30, zoom: 160 });

// --- 3. Un cadrage posé se relit à l'identique ---
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL },
  cadrages: { 'accueil-hero': { x: 40, y: 22, zoom: 135 } }
});
verifier('le cadrage se relit sans rien perdre',
  cadrages()['accueil-hero'], { x: 40, y: 22, zoom: 135 });
verifier('et l’adresse n’a pas bougé', images()['accueil-hero'], VISUEL);

// --- 4. Ce qui sort des bornes y est ramené, ce qui est illisible est écarté ---
/* Un zoom sous 100 laisserait du vide autour de la photo ; au-delà de 250 il ne
   resterait qu'un détail méconnaissable. Une position hors de 0–100 sortirait la
   photo du cadre. Ces valeurs arrivent d'une charge publique en JSON : rien ne
   garantit qu'elles viennent du réglage prévu. */
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL },
  cadrages: { 'accueil-hero': { x: -40, y: 900, zoom: 5000 } }
});
verifier('les valeurs aberrantes sont ramenées dans leurs bornes',
  cadrages()['accueil-hero'], { x: 0, y: 100, zoom: 250 });

poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': AUTRE_VISUEL },
  cadrages: { 'accueil-hero': { x: 'gauche', y: null, zoom: 'beaucoup' } }
});
verifier('un cadrage illisible est écarté', cadrages()['accueil-hero'], undefined);
/* Un cadrage qu'on ne sait pas lire ne doit pas emporter la photo avec lui :
   l'administrateur la reverrait disparaître sans comprendre pourquoi. */
verifier('mais l’adresse, elle, survit', images()['accueil-hero'], AUTRE_VISUEL);

/* Un cadrage PARTIEL est le cas dangereux, et le plus discret : les trois
   mesures illisibles d'un coup se remarquent, une seule manquante non. Retenir
   ce qui se lit et abandonner le reste stockerait un cadrage à moitié faux —
   une photo déplacée sur un axe et pas sur l'autre, sans qu'aucun écran ne dise
   pourquoi. On rejette donc en entier. */
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL },
  cadrages: { 'accueil-hero': { x: 50 } }
});
verifier('un cadrage partiel est rejeté en entier', cadrages()['accueil-hero'], undefined);
verifier('et là encore l’adresse survit', images()['accueil-hero'], VISUEL);
/* Le contrôle ci-dessus ne prouverait rien si tout cadrage était refusé : on
   pose aussitôt les trois mesures, qui doivent, elles, être retenues. */
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL },
  cadrages: { 'accueil-hero': { x: 50, y: 50, zoom: 100 } }
});
verifier('alors que les trois mesures réunies sont retenues',
  cadrages()['accueil-hero'], { x: 50, y: 50, zoom: 100 });

// --- 5. Une adresse vide efface la ligne ENTIÈRE ---
/* « Retirer le remplacement » passe par une adresse vide. Si le vide portait sur
   l'objet entier plutôt que sur l'adresse, la ligne survivrait par son cadrage
   seul — un cadrage qui ne recadre plus rien, et que plus aucune commande ne
   viendrait jamais effacer. */
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL },
  cadrages: { 'accueil-hero': { x: 12, y: 88, zoom: 180 } }
});
verifier('le cadrage à effacer est bien là d’abord',
  cadrages()['accueil-hero'], { x: 12, y: 88, zoom: 180 });
verifier('et l’adresse aussi', images()['accueil-hero'], VISUEL);

poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': '' },
  cadrages: { 'accueil-hero': { x: 12, y: 88, zoom: 180 } }
});
verifier('une adresse vide retire l’adresse', images()['accueil-hero'], undefined);
verifier('et emporte le cadrage avec elle', cadrages()['accueil-hero'], undefined);

/* L'effacement doit viser la seule clé demandée : vider un visuel ne peut pas
   faire disparaître les autres. */
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL, 'entreprises-banniere': AUTRE_VISUEL },
  cadrages: { 'accueil-hero': { x: 5, y: 5, zoom: 110 }, 'entreprises-banniere': { x: 60, y: 30, zoom: 200 } }
});
poste({ action: 'admin.images.save', donnees: { 'accueil-hero': '' } });
verifier('le voisin garde son adresse',
  images()['entreprises-banniere'], AUTRE_VISUEL);
verifier('et son cadrage',
  cadrages()['entreprises-banniere'], { x: 60, y: 30, zoom: 200 });

// --- 6. Une installation existante n'a que DEUX colonnes ---
/* C'est l'état de toute base déjà en service : la colonne « cadrage » n'y a
   jamais été écrite. Lire une troisième colonne qui n'existe pas ne doit ni
   échouer ni faire disparaître les visuels déjà remplacés. */
const feuilleImages = creerFeuille('Images');
feuilleImages.appendRow(['cle', 'valeur']);
feuilleImages.appendRow(['accueil-hero', VISUEL]);
/* La feuille vient d'être refaite À LA MAIN, sans passer par le tableau de
   bord : rien n'a donc prévenu le script, et le catalogue qu'il garde en
   mémoire décrit encore l'état précédent. C'est exactement ce qui se produit
   en production quand on corrige une cellule directement — le site met alors
   jusqu'à cinq minutes à s'en apercevoir. On l'oublie ici pour observer la
   feuille telle qu'elle est. */
bac.oublierCatalogue();
verifier('la feuille fabriquée n’a bien que deux colonnes',
  feuilleImages.getLastColumn(), 2);
verifier('une base à deux colonnes rend son visuel',
  images()['accueil-hero'], VISUEL);
verifier('et un cadrage vide, sans erreur', catalogue().cadrages, {});

/* La colonne manquante doit pouvoir être ajoutée sans perdre l'existant : c'est
   ce qui se passera la première fois qu'un cadrage sera réglé en production. */
poste({
  action: 'admin.images.save',
  donnees: { 'accueil-hero': VISUEL },
  cadrages: { 'accueil-hero': { x: 33, y: 66, zoom: 145 } }
});
verifier('la troisième colonne s’ajoute à une base existante',
  cadrages()['accueil-hero'], { x: 33, y: 66, zoom: 145 });
verifier('sans perdre l’adresse déjà enregistrée',
  images()['accueil-hero'], VISUEL);

// --- 7. Textes et Reglages n'ont pas été emportés au passage ---
/* Ils partagent lirePaires et ecrirePaires avec l'onglet Images jusqu'ici :
   c'est précisément le risque que l'onglet Images cesse de les emprunter. */
verifier('un texte s’enregistre toujours',
  poste({ action: 'admin.textes.save', donnees: { 'accueil.titre': 'Formez-vous à Djibouti' } }).ok, true);
verifier('et se relit', catalogue().textes['accueil.titre'], 'Formez-vous à Djibouti');
verifier('un réglage s’enregistre toujours',
  poste({ action: 'admin.reglages.save', donnees: { whatsappNumber: '25377145306' } }).ok, true);
/* Le numéro doit rester une chaîne : converti en nombre, il perdrait un zéro
   initial et le lien WhatsApp ne mènerait nulle part. */
verifier('et se relit sans devenir un nombre',
  catalogue().reglages.whatsappNumber, '25377145306');

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

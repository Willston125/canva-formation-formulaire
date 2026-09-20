/* Le formulaire public est ouvert à tous. Il ne doit pas être une porte d'abus.
 *
 * CE QUE L'AUDIT A TROUVÉ, et que quatre lentilles ont découvert séparément :
 * n'importe qui pouvait fermer les inscriptions de TOUT le site avec une centaine
 * de requêtes, sans compte et sans mot de passe.
 *
 * Le chemin : formations-data.js, servi publiquement, donne l'adresse du script.
 * `?action=catalogue`, public lui aussi, donne l'identifiant de chaque session et
 * sa capacité. Vingt POST par session suffisaient alors, car TOUTE ligne comptait
 * une place — y compris « En attente », puisque STATUTS_COMPTES valait null. Le
 * site calculait zéro place restante, `sessionState` renvoyait « complète », et le
 * formulaire ne devenait pas grisé : il DISPARAISSAIT de la page. Un vrai candidat
 * ne pouvait plus s'inscrire du tout.
 *
 * Deux effets s'ajoutaient. Au bout de soixante envois, le plafond d'alertes se
 * déclenchait et les VRAIES inscriptions du reste de la journée arrivaient en
 * silence. Et la feuille se remplissait de milliers de fausses lignes.
 *
 * Trois remèdes sont éprouvés ici : ne compter comme place occupée qu'une
 * inscription validée par le propriétaire ; refuser ce qui ne correspond à
 * aucune formation ni session réelle ; borner le nombre d'écritures par jour,
 * exactement comme le plafond d'alertes qui existait déjà et fonctionnait. */
'use strict';

const path = require('path');
process.env.GS_SOURCE = path.resolve(__dirname, '..', 'impactali-inscriptions.gs');
const { bac, creerFeuille, classeur } = require('./emulateur.js');

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

/** Le formulaire public : un POST SANS champ « action », donc sans mot de passe. */
const poster = charge => JSON.parse(bac.doPost({
  postData: { contents: JSON.stringify(charge) }
})._t);

// ------------------------------- LE CLASSEUR -------------------------------

const formations = creerFeuille('Formations');
formations.appendRow(['id', 'formId', 'slug', 'title', 'active']);
formations.appendRow(['f-canva', 'canva-pro', 'canva-pro', 'Canva Pro', true]);

const sessions = creerFeuille('Sessions');
sessions.appendRow(['id', 'formId', 'startDate', 'placesTotal', 'registrationOpen', 'pays']);
sessions.appendRow(['canva-pro-2026-11', 'canva-pro', '2026-11-05', 20, true, 'KM']);

const CANDIDAT = {
  nom: 'Ali', telephone: '3801234',
  formationId: 'canva-pro', sessionId: 'canva-pro-2026-11',
};

// ------------- 1. Une place n'est prise que par une inscription validée -------------

/* LE CŒUR DE LA CORRECTION. Tant que toute ligne comptait, vingt requêtes
   anonymes fermaient une session. Seules comptent désormais celles que le
   propriétaire a lui-même passées à « Confirmé » ou « Payé ». */
verifier('le décompte ne retient que des statuts nommés',
  Array.isArray(bac.STATUTS_COMPTES), true);
verifier('et ce sont bien ceux du tableau de bord',
  (bac.STATUTS_COMPTES || []).filter(s => bac.STATUTS_ACCEPTES.indexOf(s) < 0), []);
/* Contre-contrôle indispensable : une faute d'accent dans « Confirmé » ne
   fermerait plus jamais aucune session, et personne ne s'en apercevrait. */
verifier('« En attente » n’occupe pas de place',
  (bac.STATUTS_COMPTES || []).indexOf('En attente'), -1);

const premiere = poster(CANDIDAT);
verifier('une inscription ordinaire est acceptée', premiere.ok, true);

const places = () => JSON.parse(bac.doGet({ parameter: { action: 'places' } })._t).sessions;
verifier('mais elle n’occupe aucune place tant qu’elle est en attente',
  places()['canva-pro-2026-11'], undefined);

/* Vingt requêtes anonymes, l'attaque telle qu'elle a été décrite. */
for (let i = 0; i < 20; i++) poster(Object.assign({}, CANDIDAT, { nom: 'Bot ' + i }));
verifier('vingt inscriptions anonymes ne ferment pas la session',
  places()['canva-pro-2026-11'], undefined);

/* Et le propriétaire garde la main : ce qu'il valide occupe bien une place. */
const feuille = classeur.feuilles['Inscriptions'];
const entetes = feuille.getDataRange().getValues()[0].map(v => String(v).trim());
const colStatut = entetes.indexOf('statut');
feuille.getRange(2, colStatut + 1).setValue('Confirmé');
verifier('une inscription confirmée occupe une place',
  places()['canva-pro-2026-11'], 1);

// ---------------- 2. Ce qui ne correspond à rien de réel est refusé ----------------

const inventee = poster(Object.assign({}, CANDIDAT, { sessionId: 'session-qui-n-existe-pas' }));
verifier('une session inventée est refusée', inventee.ok === true, false);
verifier('et le refus le dit', /session/i.test(String(inventee.erreur || '')), true);

const formationInventee = poster(Object.assign({}, CANDIDAT, { formationId: 'formation-fantome' }));
verifier('une formation inventée est refusée', formationInventee.ok === true, false);

/* Une session qui appartient à une AUTRE formation ne doit pas passer non plus :
   c'est par là qu'on remplirait la session d'un concurrent interne. */
sessions.appendRow(['autre-2027-01', 'autre-formation', '2027-01-05', 20, true, 'KM']);
formations.appendRow(['f-autre', 'autre-formation', 'autre', 'Autre', true]);
const melangee = poster(Object.assign({}, CANDIDAT, { sessionId: 'autre-2027-01' }));
verifier('une session d’une autre formation est refusée', melangee.ok === true, false);

/* MAIS une inscription SANS session reste possible : plusieurs formations
   acceptent qu'on s'inscrive avant l'annonce des dates. */
const sansSession = poster({ nom: 'Sans date', telephone: '3801234', formationId: 'canva-pro' });
verifier('une inscription sans session reste acceptée', sansSession.ok, true);

// -------------------- 3. Le nombre d'écritures par jour est borné --------------------

verifier('un plafond d’écritures est déclaré',
  typeof bac.INSCRIPTIONS_PAR_JOUR === 'number' && bac.INSCRIPTIONS_PAR_JOUR > 0, true);
/* Il doit rester très au-dessus d'une vraie journée — sinon il refuserait de
   vrais candidats — et très en dessous de ce qu'une boucle produit. */
verifier('et il laisse largement passer une vraie journée',
  bac.INSCRIPTIONS_PAR_JOUR >= 100, true);

const avant = compterLignes();
for (let i = 0; i < bac.INSCRIPTIONS_PAR_JOUR + 30; i++) {
  poster(Object.assign({}, CANDIDAT, { nom: 'Flot ' + i }));
}
const apres = compterLignes();
verifier('l’inondation est stoppée au plafond',
  apres - avant <= bac.INSCRIPTIONS_PAR_JOUR, true);
verifier('et le plafond a bien mordu', apres - avant < bac.INSCRIPTIONS_PAR_JOUR + 30, true);

const refuse = poster(Object.assign({}, CANDIDAT, { nom: 'Apres le plafond' }));
verifier('au-delà, la réponse est un refus', refuse.ok === true, false);

function compterLignes() {
  const f = classeur.feuilles['Inscriptions'];
  return f ? f.getDataRange().getValues().length : 0;
}

// ---------------------------------- BILAN ----------------------------------
resultats.forEach(l => console.log(l));
const echecs = resultats.filter(l => l.indexOf('ÉCHEC') === 0).length;
console.log(echecs ? '\n' + echecs + ' contrôle(s) en échec.' : '\nTous les contrôles passent.');
process.exit(echecs ? 1 : 0);

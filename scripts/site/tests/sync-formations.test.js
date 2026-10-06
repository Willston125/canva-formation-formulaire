/* Vérifie le script qui aligne les formations du fichier sur la feuille.

   Ce script RÉÉCRIT formations-data.js, d'où le site tire ce qu'il affiche
   avant que l'API n'ait répondu. Une mise en forme fautive n'y casserait pas
   une ligne : elle empêcherait le fichier entier de se charger, et le site
   n'aurait plus ni formations, ni pays, ni coordonnées.

   Le défaut qu'il corrige : le fichier annonçait six formations quand la
   feuille n'en portait plus que cinq. L'accueil montrait donc une carte
   fantôme le temps que le catalogue arrive, pour une formation retirée du
   tableau de bord.

   L'épreuve n'appelle jamais la feuille : elle éprouve la mise en forme sur
   des valeurs choisies, dont celles qui piègent. */
'use strict';

const path = require('path');
const fs = require('fs');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const CHEMIN = path.join(RACINE, 'scripts', 'sync-formations.js');
const COMMUN = path.join(RACINE, 'scripts', 'sync-commun.js');
const { litteral, formationEnTexte, ORDRE } = require(CHEMIN);
const { remplacerBloc } = require(COMMUN);

const resultats = [];
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  resultats.push((ok ? 'OK   ' : 'ÉCHEC') + ' ' + libelle + ' → ' + JSON.stringify(obtenu)
    + (ok ? '' : ' (attendu ' + JSON.stringify(attendu) + ')'));
};

// --- 1. Les valeurs qui piègent ------------------------------------------

/* L'APOSTROPHE, encore : les titres et les accroches en sont pleins.
   « L'atelier » écrit entre apostrophes fermerait la chaîne au milieu du mot
   et tout le fichier cesserait de se charger. */
verifier('une chaîne à apostrophe est échappée',
  litteral("L'identité visuelle d'une marque"), "'L\\'identité visuelle d\\'une marque'");
verifier('un objet gardant une apostrophe reste du JavaScript valide',
  litteral({ titre: "L'atelier" }), '{"titre":"L\'atelier"}');

/* Le `lead` porte du HTML : les chevrons et les guillemets doivent traverser
   la mise en forme sans être touchés. */
verifier('le HTML d’une accroche traverse intact',
  litteral('Un programme <strong>intensif</strong>'),
  "'Un programme <strong>intensif</strong>'");

verifier('un tableau vide n’est pas écrit', litteral([]), null);
verifier('un objet vide non plus', litteral({}), null);
verifier('zéro et faux restent écrits', [litteral(0), litteral(false)], ['0', 'false']);

/* MISE EN FORME SUR PLUSIEURS LIGNES. Un programme de quatre modules tient sur
   deux mille caractères : écrit d'un seul tenant, il rend toute différence Git
   illisible, et personne ne relit plus ce que la synchronisation a changé. */
const gros = { modules: Array.from({ length: 6 }, (_, i) => ({ titre: 'MODULE ' + i, points: ['a', 'b'] })) };
verifier('un gros objet est étalé sur plusieurs lignes',
  litteral(gros, { multiligne: true }).includes('\n'), true);
verifier('un petit objet reste sur une seule ligne',
  litteral({ DJ: 7500 }, { multiligne: true }), '{"DJ":7500}');

// --- 2. Ce que le script écrit se relit à l'identique ---------------------

/* Le contrôle qui compte : on met en forme, puis on RELIT ce qu'on a écrit.
   Une mise en forme valide mais inexacte passerait tous les contrôles
   ci-dessus ; celui-ci la prend. */
const FORMATION = {
  id: 'formation-essai', slug: 'essai', formId: 'essai',
  title: "L'atelier d'Ali", shortTitle: 'Atelier', category: 'Création de contenu',
  family: 'Design & Contenu', promise: 'Créer, captiver, partager.',
  shortDescription: 'Une description courte.',
  lead: 'Devenez graphiste grâce à <strong>12 jours de pratique</strong>.',
  image: '/assets/images/formations/essai.webp', imageAlt: '',
  poster: 'https://lh3.googleusercontent.com/d/ABC=w1200-rw',
  duration: '12 jours', modules: 4, level: 'Tous niveaux', levelSubject: 'Canva',
  mode: 'Présentiel', price: 7500, prices: { DJ: 7500, KM: 15000 },
  learnings: ["Créer un Brand Kit", "Vendre une offre de design"],
  objectives: [{ icon: 'forum', label: "Devenir Community Manager" }],
  programme: {
    sousTitre: '12 jours · 24 heures · 4 modules',
    modules: [{ icone: 'design_services', titre: 'MODULE 1 · DESIGN', points: ["Création d'un Brand Kit pro", 'Hiérarchie visuelle'] }]
  },
  faq: [{ question: 'Faut-il un ordinateur ?', reponse: 'Oui, c’est préférable.' }],
  prerequis: [],
  featured: true, registrationOpen: true, active: false,
  allowRegistrationWithoutSession: true, hasDetailPage: true,
  href: '/formations/essai/', ordre: 0
};

let relu = null;
let erreur = null;
try { relu = eval('(' + formationEnTexte(FORMATION).replace(/^\s*Object\.freeze\(/, '').replace(/\)$/, '') + ')'); }
catch (e) { erreur = e.message; }

verifier('la formation mise en forme se relit sans erreur', erreur, null);

/* Si la relecture a échoué, on poursuit avec un objet vide : les contrôles
   suivants doivent ÉCHOUER en nommant ce qui manque, au lieu d'interrompre
   l'épreuve sur une exception qui ne dit rien. */
if (!relu) relu = {};

verifier('le titre à apostrophe est rendu intact', relu.title, "L'atelier d'Ali");
verifier('le HTML de l’accroche est rendu intact',
  relu.lead, 'Devenez graphiste grâce à <strong>12 jours de pratique</strong>.');
verifier('les tarifs par pays sont rendus intacts', relu.prices, { DJ: 7500, KM: 15000 });
verifier('le programme est rendu intact', relu.programme, FORMATION.programme);
verifier('la FAQ est rendue intacte', relu.faq, FORMATION.faq);
verifier('les acquis sont rendus intacts', relu.learnings, FORMATION.learnings);

/* `active: false` DOIT être écrit : l'écarter comme une valeur vide
   remettrait en ligne une formation que le gestionnaire vient de masquer. */
verifier('une formation masquée le reste', relu.active, false);
verifier('et « featured » vrai aussi', relu.featured, true);

/* Un texte vide n'est pas DÉCLARÉ vide : son absence laisse le repli jouer. */
verifier('un texte vide n’est pas écrit', 'imageAlt' in relu, false);
verifier('ni une liste vide', 'prerequis' in relu, false);

/* L'ORDRE des champs est stable, sans quoi chaque synchronisation produirait
   une différence Git illisible et l'on cesserait de les relire. */
verifier('les champs sortent dans l’ordre annoncé',
  Object.keys(relu), ORDRE.filter(c => c in relu));

// --- 3. Le bloc est remplacé au bon endroit ------------------------------

/* Écrire à côté du bloc casserait le fichier aussi sûrement qu'une apostrophe
   mal échappée. On éprouve le repérage sur un fichier fabriqué. */
const FAUX = "window.AUTRE = 1;\nwindow.FORMATIONS = Object.freeze([\n  Object.freeze({ formId: 'a' })\n]);\nwindow.PAYS = Object.freeze([]);\n";
const bloc = remplacerBloc(FAUX, 'FORMATIONS');
verifier('le bloc FORMATIONS est repéré', !!bloc, true);
verifier('et ce qui l’entoure est conservé',
  bloc ? bloc.remplacer("  Object.freeze({ formId: 'b' })") : '',
  "window.AUTRE = 1;\nwindow.FORMATIONS = Object.freeze([\n  Object.freeze({ formId: 'b' })\n]);\nwindow.PAYS = Object.freeze([]);\n");
verifier('un bloc absent ne rend rien', remplacerBloc(FAUX, 'INTROUVABLE'), null);

// --- 4. Le script refuse d'effacer le repli ------------------------------

const source = fs.readFileSync(CHEMIN, 'utf8');
verifier('il refuse une feuille sans aucune formation',
  /if \(!formations\.length\)[\s\S]{0,200}process\.exit\(1\)/.test(source), true);
verifier('et une formation sans identifiant, lien ou titre',
  /!f\.formId \|\| !f\.slug \|\| !f\.title[\s\S]{0,300}process\.exit\(1\)/.test(source), true);
verifier('et il n’écrit rien quand la feuille est injoignable',
  /injoignable[\s\S]{0,120}process\.exit\(1\)/.test(source), true);

/* Il ne supprime AUCUNE page : retirer une fiche publiée est une décision,
   pas un effet de bord d'une synchronisation de données. Il la signale. */
verifier('il ne supprime aucun fichier', /fs\.(rmSync|unlinkSync|rmdirSync)/.test(source), false);
verifier('mais il signale la page restée en place', /--nettoyer/.test(source), true);

// --- 5. Les deux synchronisations partagent la même mise en forme --------

/* Deux copies de `litteral`, c'est le piège de l'apostrophe corrigé d'un côté
   et pas de l'autre — l'écart qu'on ne découvre qu'en production. */
const sessions = fs.readFileSync(path.join(RACINE, 'scripts', 'sync-sessions.js'), 'utf8');
verifier('les sessions emploient le module commun',
  /require\('\.\/sync-commun\.js'\)/.test(sessions), true);
verifier('les formations aussi',
  /require\('\.\/sync-commun\.js'\)/.test(source), true);
verifier('et aucune des deux ne redéfinit la mise en forme',
  [/^const litteral =/m.test(sessions), /^const litteral =/m.test(source)], [false, false]);

console.log(resultats.join('\n'));
const echecs = resultats.filter(x => x.startsWith('ÉCHEC')).length;
console.log(echecs ? '\n>>> ' + echecs + ' ÉCHEC(S)' : '\n>>> Tout est conforme');
process.exit(echecs ? 1 : 0);

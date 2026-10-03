/* Les enregistrements du tableau de bord sur la nouvelle base.
 *
 * Chaque règle du script Google est rejouée ici sur le catalogue réel du
 * 2 octobre 2026, en passant par le vrai gestionnaire HTTP (api/index.js) :
 * mêmes refus, mêmes messages, et surtout la règle de ecrireLigne — CE QUI
 * N'EST PAS MENTIONNÉ N'EST PAS EFFACÉ. S'y ajoutent ce que la base apporte :
 * la règle du calendrier (audit C1), le journal, et l'alerte quand un numéro
 * de paiement change. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { baseNeuve, verificateur, RACINE } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { creerGestionnaire } = require('../../../api/index.js');
const { executer } = require('../../../api/_lib/admin');
const { reprochesPaysSession } = require('../../../api/_lib/ecritures');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

const JETON = 'aaa.admin.zzz';
const REGLAGES = {
  cle: 'sb_publishable_essai', admin: 'infos@impactali.site',
  lireUtilisateur: async j => (j === JETON ? { email: 'infos@impactali.site' } : null)
};
const courriels = [];
const fauxEnvoi = async m => { courriels.push(m); return { envoye: true, erreur: null }; };

let api;
async function admin(action, charge) {
  const res = { statusCode: 200, corps: '', setHeader() {}, end(c) { this.corps = c; } };
  await api({ method: 'POST', url: '/api', body: JSON.stringify(Object.assign({ action }, charge)),
    headers: { authorization: 'Bearer ' + JETON } }, res);
  const json = JSON.parse(res.corps || '{}');
  json.statut = res.statusCode;
  return json;
}
const erreurDe = r => (r.ok ? 'accepté' : r.erreur);

(async () => {
  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  await db.exec(`insert into inscriptions (form_id, nom, telephone, statut, session_id) values
    ('canva-pro', 'SAID', '3212345', 'Confirmé', 'canva-pro-2026-11'),
    ('marketing-digital', 'ALI', '3299999', 'En attente', 'marketing-digital-2026-11')`);
  api = creerGestionnaire(() => db, { admin: REGLAGES, envoyer: fauxEnvoi });
  const catalogue = async () => (await admin('admin.catalogue')).catalogue;
  const formation = async id => (await catalogue()).formations.find(f => f.id === id);
  const session = async id => (await catalogue()).sessions.find(s => s.id === id);
  const paysDe = async code => (await catalogue()).pays.find(p => p.code === code);

  // ------------------------------------------------------- 1. Formations ---

  const nouvelle = {
    id: 'form-essai1', slug: 'montage-video', title: 'Montage vidéo', formId: 'montage-video',
    href: '/inscription/?trainingId=montage-video', hasDetailPage: false, active: true,
    registrationOpen: true, mode: 'Présentiel', prices: { DJ: null, KM: 20000 }, price: null,
    learnings: ['Couper', 'Monter'], ordre: 5
  };
  const creee = await admin('admin.formation.save', { donnees: nouvelle });
  verifier('une formation se crée', [creee.ok, creee.cree], [true, true]);
  const lue = creee.catalogue.formations.find(f => f.id === 'form-essai1');
  verifier('et revient avec ses tarifs par pays (vide = « À confirmer »)', lue && lue.prices, { KM: 20000 });
  verifier('ses listes', lue && lue.learnings, ['Couper', 'Monter']);
  verifier('et un booléen non coché vaut ce que lit le site', lue && lue.featured, false);

  verifier('sans titre, refus', erreurDe(await admin('admin.formation.save', { donnees: { id: 'x', slug: 'x' } })),
    'Le titre est obligatoire.');
  verifier('un lien en majuscules est refusé',
    erreurDe(await admin('admin.formation.save', { donnees: { id: 'x', slug: 'Canva', title: 'X' } })),
    'Le lien ne peut contenir que des minuscules, des chiffres et des tirets.');
  verifier('le lien d’une autre formation est refusé',
    erreurDe(await admin('admin.formation.save', { donnees: { id: 'x', slug: 'canva-pro', title: 'X' } })),
    'Le lien « canva-pro » est déjà utilisé par une autre formation.');
  verifier('l’identifiant d’inscription d’une autre formation aussi',
    erreurDe(await admin('admin.formation.save', { donnees: { id: 'x', slug: 'autre', formId: 'canva-pro', title: 'X' } })),
    'L’identifiant d’inscription « canva-pro » est déjà celui d’une autre formation.');

  /* Audit T2 : un lien « javascript: » exécutait du code chez chaque visiteur. */
  const piege = await admin('admin.formation.save', { donnees: Object.assign({}, nouvelle, { href: 'javascript:alert(1)' }) });
  verifier('un lien « javascript: » est refusé, avec une phrase', /ne mène qu’à une page du site/.test(erreurDe(piege)), true);
  verifier('une image « javascript: » aussi',
    /adresse https:\/\//.test(erreurDe(await admin('admin.formation.save', { donnees: Object.assign({}, nouvelle, { image: 'javascript:x' }) }))), true);
  verifier('un tarif nul est refusé',
    /supérieur à zéro/.test(erreurDe(await admin('admin.formation.save', { donnees: Object.assign({}, nouvelle, { prices: { KM: 0 } }) }))), true);
  verifier('un tarif pour un pays inconnu aussi',
    erreurDe(await admin('admin.formation.save', { donnees: Object.assign({}, nouvelle, { prices: { FR: 100 } }) })),
    'Tarif pour un pays inconnu : FR.');
  verifier('un ordre à virgule aussi',
    erreurDe(await admin('admin.formation.save', { donnees: Object.assign({}, nouvelle, { ordre: 1.5 }) })),
    '« Ordre d’affichage » : un nombre entier est attendu (reçu « 1.5 »).');
  verifier('et rien de tout cela n’a été écrit', (await formation('form-essai1')).href, '/inscription/?trainingId=montage-video');

  /* CE QUI N'EST PAS MENTIONNÉ N'EST PAS EFFACÉ (ecrireLigne). */
  const avantCanva = await formation('formation-canva-pro');
  const partielle = await admin('admin.formation.save', { donnees: {
    id: 'formation-canva-pro', slug: 'canva-pro', title: avantCanva.title, promise: 'Nouvelle promesse' } });
  verifier('une modification partielle passe', partielle.ok, true);
  const apresCanva = await formation('formation-canva-pro');
  verifier('elle change ce qu’elle mentionne', apresCanva.promise, 'Nouvelle promesse');
  verifier('et garde TOUT le reste : programme, FAQ, tarifs, image…',
    Object.assign({}, apresCanva, { promise: avantCanva.promise }), avantCanva);

  const fermee = await admin('admin.formation.save', { donnees: { id: 'form-essai1', slug: 'montage-video', title: 'Montage vidéo', registrationOpen: null } });
  verifier('une case vidée reprend la valeur par défaut de la base', [fermee.ok, (await formation('form-essai1')).registrationOpen], [true, false]);

  // --------------------------------------------------------- 2. Sessions ---

  const sessionNeuve = {
    id: 'sess-essai1', formId: 'montage-video', startDate: '2026-11-02', endDate: '2026-12-17',
    schedule: 'Lundi et jeudi · 18h – 20h', duration: '12 séances · 24 heures', mode: 'Présentiel',
    location: 'American corner', pays: 'KM', parPays: { KM: { tarif: 20000 } }, placesTotal: 12,
    placesAvailable: 12, registrationOpen: true
  };
  const sCree = await admin('admin.session.save', { donnees: sessionNeuve });
  verifier('une session se crée', [sCree.ok, sCree.cree], [true, true]);
  const sLue = sCree.catalogue.sessions.find(s => s.id === 'sess-essai1');
  verifier('avec ses pays et ses réglages par pays', [sLue.pays, sLue.parPays], ['KM', { KM: { tarif: 20000 } }]);
  verifier('ses places se déduisent des inscrits', sLue.placesAvailable, 12);
  verifier('et la base connaît ses jours et ses séances',
    (await db.query(`select jours, seances from sessions where id = 'sess-essai1'`)).rows[0], { jours: [1, 4], seances: 12 });

  /* AUDIT C1 : « 12 séances, mardi et vendredi, du 6 au 13 octobre » — il n'y en a que 3. */
  const impossible = await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, {
    id: 'sess-essai2', schedule: 'Mardi et vendredi · 18h – 20h', startDate: '2026-10-06', endDate: '2026-10-13' }) });
  verifier('une session impossible est refusée', impossible.ok, false);
  verifier('et le refus montre le calcul',
    /annonce 12 séances.*il n’y a que 3 mardis et vendredis/.test(String(impossible.erreur)), true);
  verifier('elle n’a pas été écrite', await session('sess-essai2'), undefined);

  /* Une session enregistrée avant la règle (reprise de la feuille) : la moindre
     modification la fait vérifier ENTIÈRE — pas seulement ce qui change. */
  const ancienne = await admin('admin.session.save', { donnees: {
    id: 'identite-visuelle-2027-01', formId: 'identite-visuelle', startDate: '2026-10-06', registrationOpen: false } });
  verifier('une session reprise impossible ne se modifie pas sans correction', /il n’y a que 3/.test(String(ancienne.erreur)), true);
  const corrigee = await admin('admin.session.save', { donnees: {
    id: 'identite-visuelle-2027-01', formId: 'identite-visuelle', startDate: '2026-10-06', endDate: '2026-11-20' } });
  verifier('et passe une fois les dates corrigées', corrigee.ok, true);
  const identite = await session('identite-visuelle-2027-01');
  verifier('sans perdre son pays ni ses réglages, non mentionnés',
    [identite.pays, identite.parPays, identite.schedule], ['KM', { KM: { mode: 'Présentiel', tarif: 15000, lieu: 'American corner' } }, 'Mardi et vendredi · 18h – 20h']);

  verifier('deux pays en présentiel avec une seule adresse : refus qui nomme le pays',
    /pour KM sans lieu propre/.test(erreurDe(await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, {
      pays: 'DJ,KM', parPays: { DJ: { lieu: 'Saalam Tower' } } }) }))), true);
  const enLigne = await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, {
    pays: 'KM', mode: 'En ligne', location: 'Google Meet', parPays: { KM: { mode: 'En ligne', lieu: 'American corner' } } }) });
  verifier('un pays en ligne ne garde pas d’adresse', [enLigne.ok, (await session('sess-essai1')).parPays], [true, { KM: { mode: 'En ligne' } }]);
  verifier('un pays inconnu est refusé',
    erreurDe(await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, { pays: 'FR', mode: 'En ligne', parPays: {} }) })),
    'Pays inconnu : FR. Créez-le d’abord dans l’onglet Pays.');
  verifier('une formation inconnue aussi',
    erreurDe(await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, { formId: 'inconnue' }) })),
    'Formation « inconnue » inconnue.');
  verifier('une fin avant le début aussi',
    erreurDe(await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, { endDate: '2026-10-01' }) })),
    'La date de fin précède la date de début.');
  verifier('un 30 février aussi',
    erreurDe(await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, { endDate: '2027-02-30', duration: '' }) })),
    '« Date de fin » : date invalide (« 2027-02-30 »).');

  verifier('une session avec un inscrit confirmé ne se supprime pas',
    erreurDe(await admin('admin.session.delete', { id: 'canva-pro-2026-11' })),
    'Cette session compte 1 inscrit(s). Fermez les inscriptions plutôt que de la supprimer.');
  verifier('une session sans inscrit confirmé se supprime', (await admin('admin.session.delete', { id: 'sess-essai1' })).ok, true);
  verifier('une session inconnue : « introuvable »', erreurDe(await admin('admin.session.delete', { id: 'sess-essai1' })), 'Session introuvable.');

  // ------------------------------------------------------------- 3. Pays ---

  const km = await paysDe('KM');
  const sansMoyens = Object.assign({}, km);
  delete sansMoyens.paymentMethods;
  courriels.length = 0;
  const kmPartiel = await admin('admin.pays.save', { donnees: Object.assign(sansMoyens, { whatsappDisplay: '+269 380 46 48' }) });
  verifier('un pays se met à jour', kmPartiel.ok, true);
  verifier('sans « paymentMethods », ses moyens de paiement restent', (await paysDe('KM')).paymentMethods, km.paymentMethods);
  verifier('et aucune alerte ne part', courriels.length, 0);

  const pirate = JSON.parse(JSON.stringify(km));
  pirate.paymentMethods[0].number = '9999999';
  const change = await admin('admin.pays.save', { donnees: pirate });
  verifier('changer un numéro de paiement passe', change.ok, true);
  verifier('mais prévient aussitôt le propriétaire', courriels.map(c => c.sujet), ['Moyens de paiement modifiés · Comores (KM)']);
  verifier('avec l’ancien et le nouveau numéro sous les yeux',
    /AVANT\n- Mvola : 4866807[\s\S]*APRÈS\n- Mvola : 9999999/.test(courriels[0] && courriels[0].texte), true);
  verifier('et le journal en garde la trace',
    (await db.query(`select details->'moyens'->'apres'->0->>'number' as n from journal
      where action = 'admin.pays.save' order by id desc limit 1`)).rows[0].n, '9999999');
  courriels.length = 0;
  const logo = JSON.parse(JSON.stringify(pirate));
  logo.paymentMethods[0].image = '/assets/images/mvola.png';
  await admin('admin.pays.save', { donnees: logo });
  verifier('changer seulement un logo ne déclenche pas d’alerte', courriels.length, 0);

  verifier('un indicatif avec un numéro est refusé',
    /ne contient que le « \+ »/.test(erreurDe(await admin('admin.pays.save', { donnees: Object.assign({}, km, { indicatif: '+269 380' }) }))), true);
  verifier('un format de numéro invalide aussi',
    erreurDe(await admin('admin.pays.save', { donnees: Object.assign({}, km, { motifTelephone: '^(\\d{7}$' }) })),
    'Le format de numéro n’est pas une expression valide : ^(\\d{7}$');
  verifier('un exemple que le format refuserait aussi',
    /ne respecte pas le format accepté/.test(erreurDe(await admin('admin.pays.save', { donnees: Object.assign({}, km, { exempleTelephone: '12' }) }))), true);
  verifier('un numéro WhatsApp avec des lettres aussi',
    /ne prend que des chiffres/.test(erreurDe(await admin('admin.pays.save', { donnees: Object.assign({}, km, { whatsappNumber: '269XXXXXXX' }) }))), true);
  verifier('un paiement mobile sans numéro aussi',
    erreurDe(await admin('admin.pays.save', { donnees: Object.assign({}, km, { paymentMethods: [{ kind: 'mobile', label: 'Mvola' }] }) })),
    '« Mvola » : le numéro à créditer est obligatoire.');
  verifier('un nouveau pays sans indicatif aussi',
    erreurDe(await admin('admin.pays.save', { donnees: { code: 'so', nom: 'Somalie', devise: 'SOS' } })),
    'L’indicatif est obligatoire : +253, +269…');

  verifier('fermer le dernier pays ouvert est refusé',
    /dernier pays proposé/.test(erreurDe(await admin('admin.pays.save', { donnees: Object.assign({}, km, { active: false }) }))), true);
  const dj = await paysDe('DJ');
  verifier('ouvrir un pays et en faire le pays par défaut passe',
    (await admin('admin.pays.save', { donnees: Object.assign({}, dj, { active: true, defaut: true }) })).ok, true);
  await admin('admin.pays.save', { donnees: Object.assign({}, km, { defaut: true }) });
  verifier('un seul pays par défaut : le dernier choisi', (await catalogue()).pays.filter(p => p.defaut).map(p => p.code), ['KM']);
  await admin('admin.pays.save', { donnees: Object.assign({}, km, { active: false }) });
  const apresFermeture = (await catalogue()).pays;
  verifier('un pays fermé passe la main à un pays ouvert',
    apresFermeture.map(p => [p.code, p.active, p.defaut]), [['DJ', true, true], ['KM', false, false]]);

  courriels.length = 0;
  const so = await admin('admin.pays.save', { donnees: { code: 'so', nom: 'Somalie', devise: 'SOS', indicatif: '+252',
    paymentMethods: [{ kind: 'mobile', label: 'EVC Plus', number: '615000000' }] } });
  verifier('un pays se crée, son code mis en majuscules', [so.ok, so.cree, !!(await paysDe('SO'))], [true, true, true]);
  verifier('et ses premiers numéros de paiement sont signalés', courriels.length, 1);
  verifier('un pays où se tiennent des sessions ne se supprime pas',
    erreurDe(await admin('admin.pays.delete', { code: 'km' })),
    '5 session(s) se tiennent dans ce pays. Rattachez-les ailleurs, ou supprimez-les d’abord.');
  verifier('un pays sans session se supprime', (await admin('admin.pays.delete', { code: 'SO' })).ok, true);
  verifier('avec ses moyens de paiement',
    (await db.query(`select count(*)::int as n from moyens_paiement where pays_code = 'SO'`)).rows[0].n, 0);

  // -------------------------------------------------------- 4. Portfolio ---

  verifier('une réalisation se crée',
    (await admin('admin.portfolio.save', { donnees: { id: 'real-1', title: 'Affiche', imagePosition: '50% 50%', ordre: 6 } })).cree, true);
  await admin('admin.portfolio.save', { donnees: { id: 'real-1', title: 'Affiche', description: 'Pour un client' } });
  verifier('une modification partielle garde le cadrage',
    (await catalogue()).portfolio.find(r => r.id === 'real-1').imagePosition, '50% 50%');
  verifier('un cadrage qui glisse du style est refusé (audit T4)',
    /deux pourcentages/.test(erreurDe(await admin('admin.portfolio.save', { donnees: { id: 'real-1', title: 'A', imagePosition: '50% 50%; background:url(x)' } }))), true);
  verifier('une vidéo hors YouTube aussi',
    /lien YouTube/.test(erreurDe(await admin('admin.portfolio.save', { donnees: { id: 'real-1', title: 'A', video: 'https://exemple.test/v' } }))), true);
  verifier('une réalisation se supprime', (await admin('admin.portfolio.delete', { id: 'real-1' })).ok, true);
  verifier('une réalisation inconnue : « introuvable »',
    erreurDe(await admin('admin.portfolio.delete', { id: 'real-1' })), 'Réalisation introuvable.');

  // --------------------------------------- 5. Réglages, textes, visuels ---

  await admin('admin.reglages.save', { donnees: { contactName: 'Ali', inscriptionsOuvertes: 'true', quota: 5, defaultLocation: '' } });
  const reglages = (await catalogue()).reglages;
  verifier('un réglage relu comme le relisait la feuille',
    [reglages.contactName, reglages.inscriptionsOuvertes, reglages.quota], ['Ali', true, '5']);
  verifier('une valeur vide efface la clé', 'defaultLocation' in reglages, false);
  verifier('et ce qui n’est pas mentionné reste', reglages.whatsappDisplay, '+253 77 14 53 06');
  verifier('un nom de réglage invalide est refusé',
    erreurDe(await admin('admin.reglages.save', { donnees: { 'a b': 1 } })), 'Réglages invalides. Nom refusé : « a b ».');

  await admin('admin.textes.save', { donnees: { 'accueil.titre': 'Bienvenue', 'accueil.vide': '' } });
  verifier('un texte s’enregistre tel quel', (await catalogue()).textes['accueil.titre'], 'Bienvenue');

  const visuels = await admin('admin.images.save', {
    donnees: { 'accueil.hero': '/assets/images/hero.webp', 'accueil.methode.1': '' },
    cadrages: { 'accueil.hero': { x: 40, y: 120, zoom: 999 } } });
  verifier('un visuel s’enregistre, cadrage borné',
    [visuels.catalogue.images['accueil.hero'], visuels.catalogue.cadrages['accueil.hero']],
    ['/assets/images/hero.webp', { x: 40, y: 100, zoom: 250 }]);
  verifier('un visuel vidé rend celui de la page', 'accueil.methode.1' in visuels.catalogue.images, false);
  verifier('une adresse « javascript: » est refusée',
    /adresse https:\/\//.test(erreurDe(await admin('admin.images.save', { donnees: { 'accueil.hero': 'javascript:x' } }))), true);

  // ---------------------------------------------- 6. Suppression, journal ---

  verifier('une formation avec des inscrits ne se supprime pas',
    /compte 1 inscription\(s\)/.test(erreurDe(await admin('admin.formation.delete', { id: 'formation-canva-pro' }))), true);
  await admin('admin.session.save', { donnees: Object.assign({}, sessionNeuve, { id: 'sess-essai3' }) });
  const supprimee = await admin('admin.formation.delete', { id: 'form-essai1' });
  verifier('une formation sans inscrit se supprime, avec ses sessions', [supprimee.ok, supprimee.sessionsSupprimees], [true, 1]);

  const journal = (await db.query('select distinct qui, action from journal order by action')).rows;
  verifier('chaque écriture est au journal, avec son auteur',
    journal.every(j => j.qui === 'infos@impactali.site') && journal.length >= 10, true);
  verifier('l’import depuis les fichiers du site explique qu’il ne sert plus',
    /ne sert plus/.test(erreurDe(await admin('admin.importer', { donnees: {} }))), true);
  verifier('« constructor » n’est pas une commande',
    erreurDe(await admin('constructor', {})), 'Cette commande n’est pas encore disponible sur la nouvelle base.');

  // ------------------------------------------- 7. Ce que la base refuse ---

  /* Une règle de la base que l'API n'a pas su dire avant elle : l'administrateur
     apprend que RIEN n'est écrit, et laquelle. Une panne, elle, reste muette. */
  const refusante = code => ({ query: async () => { const e = new Error('détail interne'); e.code = code; e.constraint = 'sessions_check'; throw e; } });
  const refus = await executer(refusante('23514'), { action: 'admin.catalogue' }, JETON, REGLAGES);
  verifier('un refus de la base est dit à l’administrateur',
    refus.corps.erreur, 'La base a refusé cet enregistrement (règle « sessions_check ») : rien n’a été modifié.');
  let panne = null;
  try { await executer(refusante('57P01'), { action: 'admin.catalogue' }, JETON, REGLAGES); } catch (e) { panne = e.code; }
  verifier('une panne de la base, elle, remonte (réponse générique, audit S9)', panne, '57P01');

  // ------------------------- 8. La même règle des deux côtés du réseau ---

  /* Le tableau de bord vérifie pays et mode avant l'envoi, l'API avant
     d'écrire. Mêmes cas, mêmes verdicts : une règle corrigée d'un seul côté se
     verrait. (Mêmes cas que coherence-pays-mode, côté script Google.) */
  const adminJs = fs.readFileSync(path.join(RACINE, 'admin', 'admin.js'), 'utf8');
  const debut = adminJs.indexOf('function reprochesPaysSession(s)');
  let profondeur = 0, fin = -1;
  for (let j = adminJs.indexOf('{', debut); j < adminJs.length; j++) {
    if (adminJs[j] === '{') profondeur++;
    else if (adminJs[j] === '}' && !--profondeur) { fin = j + 1; break; }
  }
  const bac = {};
  vm.createContext(bac);
  vm.runInContext(adminJs.slice(debut, fin) + '\nglobalThis.r = reprochesPaysSession;', bac);
  const CAS = [
    { pays: '', mode: 'En ligne', location: 'Google Meet' },
    { pays: '', mode: 'Présentiel', location: 'Saalam Tower' },
    { pays: '', mode: 'Hybride', location: 'Saalam Tower' },
    { pays: 'DJ', mode: 'Présentiel', location: 'Saalam Tower' },
    { pays: 'DJ', mode: 'Présentiel', location: '' },
    { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower' },
    { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower', parPays: { DJ: { lieu: 'Saalam Tower' }, KM: { lieu: 'American corner' } } },
    { pays: 'DJ,KM', mode: 'Présentiel', location: 'Saalam Tower', parPays: { DJ: { lieu: 'Saalam Tower' }, KM: { mode: 'En ligne' } } },
    { pays: 'DJ,KM', mode: 'En ligne', location: '' },
    { pays: 'DJ,KM', mode: 'En ligne', location: '', parPays: { DJ: { mode: 'Présentiel' } } },
    { pays: 'KM', mode: 'Présentiel', location: '', parPays: { km: { lieu: 'American corner' } } }
  ];
  verifier('le tableau de bord et l’API rendent les mêmes reproches, cas par cas',
    CAS.map(c => JSON.stringify(bac.r(c)) === JSON.stringify(reprochesPaysSession(c))), CAS.map(() => true));
  verifier('et les cas éprouvent bien les deux issues',
    CAS.map(c => reprochesPaysSession(c).length > 0), [false, true, true, false, true, true, false, false, false, true, false]);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

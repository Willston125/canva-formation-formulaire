/* Les enregistrements du tableau de bord : formations, sessions, pays,
 * portfolio, réglages, textes, visuels.
 *
 * MÊMES RÈGLES, MÊMES MESSAGES que le script Google, repris fonction par
 * fonction (enregistrerFormation, enregistrerSession, enregistrerPays… dans
 * scripts/apps-script/impactali-inscriptions.gs) : le tableau de bord ne doit
 * pas changer de comportement en changeant de base.
 *
 * CE QUI N'EST PAS MENTIONNÉ N'EST PAS EFFACÉ. Comme ecrireLigne, une
 * modification ne touche que les clés qu'elle porte ; les autres gardent leur
 * valeur. Un enregistrement partiel ne vide jamais le reste d'une fiche.
 *
 * CE QUI CHANGE, et pourquoi :
 *  - une session qui annonce plus de séances que ses dates n'en contiennent
 *    est refusée, le calcul sous les yeux (audit C1) ;
 *  - une valeur que la base refuserait (lien « javascript: », numéro WhatsApp
 *    avec des lettres…) est arrêtée ICI, avec une phrase : la base, elle, ne
 *    saurait dire que le nom de sa règle ;
 *  - chaque écriture va au journal, et un changement de moyen de paiement
 *    prévient aussitôt le propriétaire par e-mail ;
 *  - une écriture à la fois, sous verrou, comme le LockService du script. */
'use strict';

const { FORMATION, SESSION, PAYS, MOYEN_PAIEMENT, REALISATION, colonnes } = require('./champs');
const { lireCatalogue, compterInscrits, objetSession } = require('./catalogue');
const { joursDepuisHoraires, seancesDepuisDuree, seancesPossibles, NOMS_JOURS } = require('./calendrier');
const { dateEnFrancais } = require('./prix');
const { alerteMoyensPaiement, envoyer: envoyerCourriel } = require('./courriel');
const { enTransaction } = require('./transaction');

const possede = (o, cle) => Object.prototype.hasOwnProperty.call(o, cle);
const estObjet = v => !!v && typeof v === 'object' && !Array.isArray(v);
const estAdresse = v => /^(\/[^/]|https:\/\/)/.test(v);
const vide = v => v === null || v === undefined || String(v).trim() === '';
const MODES = ['Présentiel', 'En ligne', 'Hybride'];
const CLE_PAIRE = /^[A-Za-z0-9._-]+$/;

/** « set colonne = default » : un booléen laissé vide prend la valeur que lit le site. */
const DEFAUT = Symbol('valeur par défaut de la colonne');

// ------------------------------------------------- DE LA SAISIE AUX COLONNES ----

/* Les noms que l'administrateur lit dans le tableau de bord : un message qui
   parlerait de « placesTotal » ne dirait pas quelle case corriger. */
const LIBELLES = {
  price: 'Tarif', modules: 'Nombre de modules', ordre: 'Ordre d’affichage', placesTotal: 'Nombre de places',
  longueurTelephone: 'Longueur du numéro', learnings: 'Ce que vous apprendrez', objectives: 'Objectifs',
  faq: 'Questions fréquentes', prerequis: 'Prérequis', fuseaux: 'Fuseaux horaires', regions: 'Régions',
  startDate: 'Date de début', endDate: 'Date de fin', programme: 'Programme'
};
const libelle = cle => LIBELLES[cle] || cle;

// Les colonnes « smallint » de la base : au-delà, elle refuserait
const PETITS_ENTIERS = new Set(['modules', 'places_total', 'longueur_telephone', 'seances']);

/* Ce que chaque colonne exige, dit en clair. Ce sont les règles du schéma
   (supabase/migrations) : les tenir ici aussi, c'est répondre par une phrase
   au lieu d'un refus muet de la base. Elles ne s'appliquent qu'à une valeur
   présente — une case vide reste permise. */
const REGLES = {
  formations: {
    form_id: [v => /^[a-z0-9-]+$/.test(v),
      'L’identifiant d’inscription (formId) ne contient que des minuscules, des chiffres et des tirets.'],
    image: [estAdresse, 'L’image doit être une adresse https:// ou un fichier du site (/assets/…).'],
    poster: [estAdresse, 'L’affiche doit être une adresse https:// ou un fichier du site (/assets/…).'],
    // Audit T2 : un lien « javascript: » exécutait du code chez chaque visiteur
    href: [v => /^\/(formations\/[a-z0-9-]+\/|inscription\/)/.test(v),
      'Le lien d’une formation ne mène qu’à une page du site : /formations/<lien>/ ou /inscription/….'],
    price: [v => v > 0, 'Le tarif doit être supérieur à zéro. Laissez la case vide pour « À confirmer ».'],
    modules: [v => v >= 0, 'Le nombre de modules ne peut pas être négatif.']
  },
  sessions: {
    mode: [v => MODES.includes(v), 'Mode inconnu : choisissez Présentiel, En ligne ou Hybride.'],
    price: [v => v > 0, 'Le tarif de la session doit être supérieur à zéro, ou laissé vide.'],
    places_total: [v => v >= 0, 'Le nombre de places ne peut pas être négatif.']
  },
  pays: {
    longueur_telephone: [v => v >= 4 && v <= 15, 'La longueur du numéro va de 4 à 15 chiffres.'],
    whatsapp_number: [v => /^[0-9]{6,15}$/.test(v),
      'Le numéro WhatsApp ne prend que des chiffres, indicatif compris, sans + ni espace : '
      + '2693804648 pour +269 380 46 48.']
  },
  realisations: {
    image: [estAdresse, 'L’image doit être une adresse https:// ou un fichier du site (/assets/…).'],
    href: [v => /^(\/[^/]|https?:\/\/)/.test(v), 'Le lien doit être une page du site (/…) ou une adresse http(s)://.'],
    video: [v => /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(v),
      'La vidéo doit être un lien YouTube : https://www.youtube.com/… ou https://youtu.be/….'],
    // Audit T4 : un « ; » ajoutait n'importe quel style à la page
    image_position: [v => /^[0-9]{1,3}% [0-9]{1,3}%$/.test(v),
      'Le cadrage de l’image s’écrit en deux pourcentages, comme « 50% 18% ».']
  }
};

/** Une date AAAA-MM-JJ qui existe au calendrier (pas de 30 février). */
function estDateReelle(t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === t;
}

/** Une valeur reçue → ce qu'on écrit dans la colonne. Reprend versCellule. */
function convertir(brut, type, cle, col) {
  if (type === 'bool') {
    if (brut === null || brut === undefined || brut === '') return DEFAUT;
    return brut === true || brut === 'true';
  }
  if (type === 'num') {
    if (brut === null || brut === undefined || brut === '') return null;
    const n = Number(brut);
    const max = PETITS_ENTIERS.has(col) ? 32767 : 2147483647;
    if (typeof brut === 'boolean' || !Number.isInteger(n) || Math.abs(n) > max) {
      throw new Error('« ' + libelle(cle) + ' » : un nombre entier est attendu (reçu « ' + brut + ' »).');
    }
    return n;
  }
  if (type === 'json') {
    // Un programme est un objet ; une cellule vide valait [] dans la feuille.
    if (col === 'programme') {
      if (brut === null || brut === undefined || brut === '' || (Array.isArray(brut) && !brut.length)) return null;
      if (!estObjet(brut)) throw new Error('Le programme est illisible.');
      return { v: JSON.stringify(brut), cast: 'jsonb' };
    }
    if (brut === null || brut === undefined || brut === '') return { v: '[]', cast: 'jsonb' };
    if (!Array.isArray(brut)) throw new Error('« ' + libelle(cle) + ' » doit être une liste.');
    return { v: JSON.stringify(brut), cast: 'jsonb' };
  }
  if (type === 'date') {
    if (brut === null || brut === undefined || brut === '') return null;
    if (!estDateReelle(String(brut))) throw new Error('« ' + libelle(cle) + ' » : date invalide (« ' + brut + ' »).');
    return String(brut);
  }
  // Texte. Une case vide s'efface : la feuille ne distinguait pas « vide » de « rien ».
  if (brut === null || brut === undefined) return null;
  if (typeof brut === 'object') throw new Error('« ' + libelle(cle) + ' » est illisible.');
  const t = String(brut);
  return t === '' ? null : t;
}

/** Les colonnes à écrire, depuis les SEULES clés présentes dans la saisie. */
function versColonnes(donnees, champs, table) {
  const valeurs = {};
  for (const [cle, col, type] of champs) {
    if (type === 'liste' || !possede(donnees, cle)) continue;
    const v = convertir(donnees[cle], type, cle, col);
    const regle = (REGLES[table] || {})[col];
    if (regle && v !== null && v !== DEFAUT && !regle[0](v)) throw new Error(regle[1]);
    valeurs[col] = v;
  }
  return valeurs;
}

/**
 * Crée ou modifie UNE ligne, en ne touchant qu'aux colonnes données. Rend
 * true si elle a été créée. Les noms de table et de colonnes viennent de ce
 * fichier, jamais de la requête ; les valeurs passent toujours en paramètres.
 */
async function ecrireLigne(tx, table, colCle, valCle, valeurs) {
  const existe = (await tx.query(`select 1 from ${table} where ${colCle} = $1 for update`, [valCle])).rows.length > 0;
  const params = [];
  const expr = x => {
    if (x === DEFAUT) return 'default';
    if (x && typeof x === 'object' && 'cast' in x) { params.push(x.v); return '$' + params.length + '::' + x.cast; }
    params.push(x);
    return '$' + params.length;
  };
  const cols = Object.keys(valeurs).filter(c => c !== colCle);
  if (existe) {
    if (!cols.length) return false;
    const affectations = cols.map(c => c + ' = ' + expr(valeurs[c]));
    params.push(valCle);
    await tx.query(`update ${table} set ${affectations.join(', ')} where ${colCle} = $${params.length}`, params);
    return false;
  }
  const exprs = [expr(valCle)].concat(cols.map(c => expr(valeurs[c])));
  await tx.query(`insert into ${table} (${[colCle].concat(cols).join(', ')}) values (${exprs.join(', ')})`, params);
  return true;
}

// ------------------------------------------------------------ FORMATIONS ----

async function ecrireTarifs(tx, formationId, prix) {
  if (!vide(prix) && !estObjet(prix) && !(Array.isArray(prix) && !prix.length)) {
    throw new Error('Les tarifs par pays sont illisibles.');
  }
  const connus = new Set((await tx.query('select code from pays')).rows.map(r => r.code));
  const tarifs = new Map();
  for (const [brut, montant] of Object.entries(estObjet(prix) ? prix : {})) {
    if (vide(montant)) continue;                                   // « À confirmer »
    const code = String(brut).trim().toUpperCase();
    if (!connus.has(code)) throw new Error('Tarif pour un pays inconnu : ' + code + '.');
    const n = Number(montant);
    if (typeof montant === 'boolean' || !Number.isInteger(n) || n <= 0 || n > 2147483647) {
      throw new Error('Le tarif pour ' + code + ' doit être un nombre entier supérieur à zéro (reçu « '
        + montant + ' »). Laissez la case vide pour « À confirmer ».');
    }
    tarifs.set(code, n);
  }
  await tx.query('delete from formation_tarifs where formation_id = $1', [formationId]);
  for (const [code, n] of tarifs) {
    await tx.query('insert into formation_tarifs (formation_id, pays_code, montant) values ($1, $2, $3)', [formationId, code, n]);
  }
}

async function enregistrerFormation(tx, donnees) {
  const f = estObjet(donnees) ? Object.assign({}, donnees) : null;
  if (!f || !f.id) throw new Error('Identifiant de formation manquant.');
  if (!f.slug) throw new Error('Le lien (slug) est obligatoire.');
  if (!f.title) throw new Error('Le titre est obligatoire.');
  if (!/^[a-z0-9-]+$/.test(f.slug)) {
    throw new Error('Le lien ne peut contenir que des minuscules, des chiffres et des tirets.');
  }
  f.id = String(f.id);
  // Le slug doit rester unique : deux formations ne peuvent pas partager une URL
  if ((await tx.query('select 1 from formations where slug = $1 and id <> $2', [f.slug, f.id])).rows.length) {
    throw new Error('Le lien « ' + f.slug + ' » est déjà utilisé par une autre formation.');
  }
  if (!f.formId) f.formId = f.slug;
  if (!f.href) f.href = '/formations/' + f.slug + '/';
  /* La feuille ne le vérifiait pas : deux formations au même identifiant
     d'inscription se seraient partagé sessions et candidats. */
  if ((await tx.query('select 1 from formations where form_id = $1 and id <> $2', [String(f.formId), f.id])).rows.length) {
    throw new Error('L’identifiant d’inscription « ' + f.formId + ' » est déjà celui d’une autre formation.');
  }

  const cree = await ecrireLigne(tx, 'formations', 'id', f.id, versColonnes(f, FORMATION, 'formations'));
  if (possede(f, 'prices')) await ecrireTarifs(tx, f.id, f.prices);
  return { cree, cible: f.id, journal: { cree } };
}

async function supprimerFormation(tx, id) {
  if (!id) throw new Error('Identifiant manquant.');
  const { rows } = await tx.query('select form_id from formations where id = $1 for update', [String(id)]);
  if (!rows.length) throw new Error('Formation introuvable.');
  const formId = rows[0].form_id;

  // Toutes les inscriptions comptent ici, quel que soit leur statut (compterInscritsFormation)
  const inscrits = (await tx.query('select count(*)::int as n from inscriptions where form_id = $1', [formId])).rows[0].n;
  if (inscrits > 0) {
    throw new Error('Cette formation compte ' + inscrits + ' inscription(s). '
      + 'Désactivez-la plutôt que de la supprimer, pour ne pas perdre le lien avec ces candidats.');
  }
  const sessions = await tx.query('delete from sessions where form_id = $1 returning id', [formId]);
  await tx.query('delete from formations where id = $1', [String(id)]);
  const sessionsSupprimees = sessions.rows.length;
  return { sessionsSupprimees, cible: String(id), journal: { sessions: sessions.rows.map(r => r.id) } };
}

// -------------------------------------------------------------- SESSIONS ----

/* Copie mot pour mot de la règle du script Google et du tableau de bord
   (reprochesPaysSession). Une épreuve fait tourner les trois sur les mêmes
   cas : une règle corrigée d'un seul côté se verrait. */
function reprochesPaysSession(s) {
  var reproches = [];
  if (!s) return reproches;

  var surPlace = function (mode) { return /^(pr[ée]sentiel|hybride)$/i.test(String(mode || '').trim()); };
  var codes = String(s.pays || '').split(',').map(function (c) {
    return c.trim().toUpperCase();
  }).filter(Boolean);

  var table = (s.parPays && typeof s.parPays === 'object' && !Array.isArray(s.parPays)) ? s.parPays : {};
  var reglageDe = function (code) {
    var trouve = null;
    Object.keys(table).forEach(function (c) {
      if (String(c).toUpperCase() === code) trouve = table[c];
    });
    return (trouve && typeof trouve === 'object' && !Array.isArray(trouve)) ? trouve : {};
  };
  var modeDe = function (code) {
    var propre = reglageDe(code).mode;
    return String((typeof propre === 'string' && propre.trim()) ? propre : (s.mode || '')).trim();
  };

  /* 1. AUCUNE CASE COCHÉE = PROPOSÉE PARTOUT, y compris dans un pays ajouté
     plus tard. Seule une session qu'on suit de chez soi peut l'être. */
  if (!codes.length) {
    if (surPlace(s.mode)) {
      reproches.push('Cette session est en « ' + String(s.mode).trim() + ' » et n’est cochée dans '
        + 'aucun pays : elle serait proposée partout, y compris là où personne ne peut s’y rendre. '
        + 'Cochez le ou les pays où elle se tient, ou passez-la « En ligne ».');
    }
    return reproches;
  }

  codes.forEach(function (code) {
    var mode = modeDe(code);
    if (!surPlace(mode)) return;
    if (String(reglageDe(code).lieu || '').trim()) return;

    /* 2. Un pays sur place veut un lieu. */
    if (codes.length === 1) {
      if (!String(s.location || '').trim()) {
        reproches.push('La session est en « ' + mode + ' » pour ' + code + ' sans aucun lieu. '
          + 'Indiquez l’adresse dans « Lieu ou plateforme », ou passez ce pays « En ligne ».');
      }
      return;
    }
    /* 3. Et dès que plusieurs pays sont cochés, il veut LE SIEN : le lieu de la
       session est une adresse, elle n'est que dans un pays. */
    reproches.push('La session est en « ' + mode + ' » pour ' + code + ' sans lieu propre à ce '
      + 'pays : elle reprendrait l’adresse de la session, qui se trouve ailleurs. Indiquez le '
      + 'lieu de ' + code + ', ou passez ce pays « En ligne ».');
  });

  return reproches;
}

/* Copie de nettoyerParPays : seuls les pays cochés gardent leurs réglages, et
   un pays en ligne ne garde pas d'adresse — elle ressortirait le jour où il
   repasse en présentiel, sans que personne l'ait revue. */
function nettoyerParPays(s) {
  if (!s || !s.parPays || typeof s.parPays !== 'object' || Array.isArray(s.parPays)) return;
  var coches = String(s.pays || '').split(',').map(function (c) {
    return c.trim().toUpperCase();
  }).filter(Boolean);
  var propre = {};
  Object.keys(s.parPays).forEach(function (code) {
    var reglage = s.parPays[code];
    if (!reglage || typeof reglage !== 'object' || Array.isArray(reglage)) return;
    var CODE = String(code).toUpperCase();
    if (coches.length && coches.indexOf(CODE) < 0) return;
    var garde = {};
    if (typeof reglage.mode === 'string' && reglage.mode.trim()) garde.mode = reglage.mode.trim();
    if (typeof reglage.tarif === 'number' && isFinite(reglage.tarif)) garde.tarif = reglage.tarif;
    var enLigne = /^en ligne$/i.test(garde.mode || String(s.mode || '').trim());
    if (!enLigne && typeof reglage.lieu === 'string' && reglage.lieu.trim()) {
      garde.lieu = reglage.lieu.trim();
    }
    if (Object.keys(garde).length) propre[CODE] = garde;
  });
  s.parPays = propre;
}

/** « lundis et mercredis », « mardis, jeudis et samedis ». */
function joursEnMots(jours) {
  const noms = jours.map(j => NOMS_JOURS[j] + 's');
  return noms.length > 1 ? noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1] : noms[0];
}

/**
 * Jours de cours et nombre de séances d'une session, lus dans ce qu'elle
 * affiche. AUDIT C1 : une session qui annonce plus de séances que ses dates
 * n'en contiennent est refusée — « 12 séances, mardi et vendredi, du 6 au
 * 13 octobre » n'en compte que 3. Le candidat paierait pour des cours qui
 * n'ont nulle part où tenir.
 */
function calendrierDe(s) {
  const jours = joursDepuisHoraires(s.schedule);
  const annoncees = seancesDepuisDuree(s.duration);
  const possibles = seancesPossibles(s.startDate, s.endDate || null, jours);
  if (annoncees !== null && possibles !== null && annoncees > possibles) {
    throw new Error('La session annonce ' + annoncees + ' séances (« ' + s.duration + ' »), mais du '
      + dateEnFrancais(s.startDate) + ' au ' + dateEnFrancais(s.endDate) + ', il n’y a que ' + possibles
      + ' ' + joursEnMots(jours) + ' (« ' + s.schedule + ' »). Corrigez le volume, les jours ou les dates : '
      + 'un candidat compterait sur des cours qui n’ont pas de place dans le calendrier.');
  }
  const seances = annoncees !== null && annoncees > 0 && possibles !== null ? annoncees : null;
  return { jours, seances };
}

/** La session enregistrée, telle que la voit le tableau de bord. null si elle n'existe pas. */
async function lireSession(tx, id) {
  const { rows } = await tx.query(`select ${colonnes(SESSION)} from sessions where id = $1 for update`, [id]);
  if (!rows.length) return null;
  const pays = (await tx.query('select * from session_pays where session_id = $1 order by ordre, pays_code', [id])).rows;
  return objetSession(rows[0], pays);
}

/** Les pays d'une session (colonne « pays ») et leurs réglages (colonne « parPays »). */
async function ecrirePaysSession(tx, id, s) {
  const connus = new Set((await tx.query('select code from pays')).rows.map(r => r.code));
  const coches = String(s.pays || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  const reglages = {};
  if (estObjet(s.parPays)) for (const [c, r] of Object.entries(s.parPays)) reglages[String(c).toUpperCase()] = r;

  const lignes = [];
  [...new Set(coches.concat(Object.keys(reglages)))].forEach((code, ordre) => {
    if (!connus.has(code)) throw new Error('Pays inconnu : ' + code + '. Créez-le d’abord dans l’onglet Pays.');
    const r = reglages[code] || {};
    const mode = r.mode || null;
    if (mode !== null && !MODES.includes(mode)) {
      throw new Error('Mode inconnu pour ' + code + ' : choisissez Présentiel, En ligne ou Hybride.');
    }
    const tarif = r.tarif === undefined || r.tarif === null ? null : r.tarif;
    if (tarif !== null && !(Number.isInteger(tarif) && tarif > 0 && tarif <= 2147483647)) {
      throw new Error('Le tarif pour ' + code + ' doit être un nombre entier supérieur à zéro, ou laissé vide.');
    }
    const lieu = r.lieu || null;
    const propose = coches.includes(code);
    // Un pays non coché n'a de ligne que s'il porte un réglage
    if (!propose && mode === null && lieu === null && tarif === null) return;
    lignes.push([code, propose, ordre, mode, lieu, tarif]);
  });

  await tx.query('delete from session_pays where session_id = $1', [id]);
  for (const l of lignes) {
    await tx.query(`insert into session_pays (session_id, pays_code, propose, ordre, mode, lieu, tarif)
      values ($1, $2, $3, $4, $5, $6, $7)`, [id].concat(l));
  }
}

async function enregistrerSession(tx, donnees) {
  const s = estObjet(donnees) ? Object.assign({}, donnees) : null;
  if (!s || !s.id) throw new Error('Identifiant de session manquant.');
  if (!s.formId) throw new Error('La session doit être rattachée à une formation.');
  if (!s.startDate) throw new Error('La date de début est obligatoire.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) throw new Error('Date de début invalide.');
  if (s.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.endDate)) throw new Error('Date de fin invalide.');
  s.id = String(s.id);
  if (!/^[a-z0-9-]+$/.test(s.id)) {
    throw new Error('L’identifiant de session ne contient que des minuscules, des chiffres et des tirets.');
  }

  if (!(await tx.query('select 1 from formations where form_id = $1', [String(s.formId)])).rows.length) {
    throw new Error('Formation « ' + s.formId + ' » inconnue.');
  }
  if (typeof s.placesTotal === 'number' && typeof s.placesAvailable === 'number'
      && s.placesAvailable > s.placesTotal) {
    throw new Error('Les places disponibles dépassent le total.');
  }

  /* Les règles se vérifient sur la session TELLE QU'ELLE SERA : l'enregistrée,
     recouverte de ce qui change. Vérifier la seule saisie laisserait un
     enregistrement partiel composer une session que personne n'a vue entière. */
  const fusion = Object.assign({}, (await lireSession(tx, s.id)) || {}, s);
  if (fusion.endDate && fusion.endDate < fusion.startDate) throw new Error('La date de fin précède la date de début.');
  nettoyerParPays(fusion);
  const reproches = reprochesPaysSession(fusion);
  if (reproches.length) throw new Error(reproches.join(' '));
  const calendrier = calendrierDe(fusion);

  // `placesAvailable` n'est plus rangé : les places se déduisent toujours des inscrits
  const valeurs = versColonnes(s, SESSION, 'sessions');
  valeurs.jours = { v: '{' + calendrier.jours.join(',') + '}', cast: 'smallint[]' };
  valeurs.seances = calendrier.seances;
  const cree = await ecrireLigne(tx, 'sessions', 'id', s.id, valeurs);
  if (possede(s, 'pays') || possede(s, 'parPays')) await ecrirePaysSession(tx, s.id, fusion);
  return { cree, cible: s.id, journal: { cree } };
}

async function supprimerSession(tx, id) {
  if (!id) throw new Error('Identifiant manquant.');
  const inscrits = (await compterInscrits(tx))[id] || 0;
  if (inscrits > 0) {
    throw new Error('Cette session compte ' + inscrits + ' inscrit(s). '
      + 'Fermez les inscriptions plutôt que de la supprimer.');
  }
  if (!(await tx.query('delete from sessions where id = $1 returning id', [String(id)])).rows.length) {
    throw new Error('Session introuvable.');
  }
  return { cible: String(id) };
}

// ------------------------------------------------------------------ PAYS ----

/* Ce qui dit à un candidat OÙ et À QUI payer. Le logo ou le petit titre
   peuvent changer sans alerte ; pas un numéro ni un nom de compte. */
const empreinteMoyen = m => [m.kind, m.label, m.value, m.number, m.accountName, m.recipient, m.place, m.phone]
  .map(v => (v === null || v === undefined ? '' : String(v)));

function normaliserMoyen(m) {
  if (!estObjet(m)) throw new Error('Un moyen de paiement est illisible.');
  // Comme le tableau de bord : tout ce qui n'est pas des espèces est un paiement mobile
  const o = { kind: m.kind === 'cash' ? 'cash' : 'mobile' };
  for (const [cle] of MOYEN_PAIEMENT) {
    if (cle === 'kind' || m[cle] === null || m[cle] === undefined) continue;
    if (typeof m[cle] === 'object') throw new Error('Un moyen de paiement est illisible.');
    o[cle] = String(m[cle]);
  }
  if (!String(o.label || '').trim()) throw new Error('Chaque moyen de paiement a besoin d’un nom : Waafi, Espèces…');
  if (!String(o.value || '').trim()) o.value = o.label;
  if (o.kind === 'mobile' && !String(o.number || '').trim()) {
    throw new Error('« ' + o.label + ' » : le numéro à créditer est obligatoire.');
  }
  if (o.image && !estAdresse(o.image)) {
    throw new Error('Le logo de « ' + o.label + ' » doit être une adresse https:// ou un fichier du site.');
  }
  return o;
}

async function lireMoyens(tx, code) {
  const { rows } = await tx.query(`select ${colonnes(MOYEN_PAIEMENT)} from moyens_paiement
    where pays_code = $1 order by ordre, id`, [code]);
  return rows.map(r => {
    const o = {};
    for (const [cle, col] of MOYEN_PAIEMENT) if (r[col] !== null && r[col] !== undefined) o[cle] = r[col];
    return o;
  });
}

async function ecrireMoyens(tx, code, brute) {
  // Comme le script : une liste illisible vaut « aucun moyen »
  const apres = (Array.isArray(brute) ? brute : []).map(normaliserMoyen);
  const avant = await lireMoyens(tx, code);
  await tx.query('delete from moyens_paiement where pays_code = $1', [code]);
  for (const [i, m] of apres.entries()) {
    const cols = ['pays_code', 'ordre'];
    const params = [code, i];
    for (const [cle, col] of MOYEN_PAIEMENT) {
      if (m[cle] === undefined) continue;
      cols.push(col);
      params.push(m[cle]);
    }
    await tx.query(`insert into moyens_paiement (${cols.join(', ')}) values (${params.map((_, k) => '$' + (k + 1)).join(', ')})`, params);
  }
  const change = JSON.stringify(avant.map(empreinteMoyen)) !== JSON.stringify(apres.map(empreinteMoyen));
  return { avant, apres, change };
}

async function enregistrerPays(tx, donnees) {
  const p = estObjet(donnees) ? Object.assign({}, donnees) : null;
  if (!p || !p.code) throw new Error('Le code du pays est obligatoire.');
  p.code = String(p.code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(p.code)) {
    throw new Error('Le code du pays s’écrit en deux lettres, comme DJ ou KM.');
  }
  if (!p.nom) throw new Error('Le nom du pays est obligatoire.');
  if (!p.devise) throw new Error('La devise est obligatoire : sans elle, aucun tarif n’est lisible.');
  const existe = (await tx.query('select 1 from pays where code = $1 for update', [p.code])).rows.length > 0;

  /* L'indicatif s'affiche collé devant le numéro que tape le candidat. Y glisser
     un numéro complet produit un téléphone inutilisable — « +269 380 46 483801234 »
     — sans que rien ne le signale au moment de l'inscription. */
  if (p.indicatif) {
    p.indicatif = String(p.indicatif).trim();
    if (!/^\+\d{1,4}$/.test(p.indicatif)) {
      throw new Error('L’indicatif ne contient que le « + » et l’indicatif du pays, sans espace ni '
        + 'numéro : +253, +269… Reçu : « ' + p.indicatif + ' ». '
        + 'Un numéro de contact se saisit dans whatsappNumber.');
    }
  }
  // La feuille acceptait un pays sans indicatif ; le formulaire, lui, ne savait plus composer le numéro
  if ((!existe || possede(p, 'indicatif')) && !p.indicatif) {
    throw new Error('L’indicatif est obligatoire : +253, +269…');
  }

  // Un motif de numéro invalide bloquerait toutes les inscriptions du pays
  if (p.motifTelephone) {
    try { new RegExp(p.motifTelephone); }
    catch (err) { throw new Error('Le format de numéro n’est pas une expression valide : ' + p.motifTelephone); }
  }

  /* L'exemple est ce que le candidat a sous les yeux et recopie. S'il ne
     satisfait pas le format annoncé, on refuse exactement ce qu'on vient de
     lui montrer. Un gabarit — 77XXXXXX — reste permis : il n'est pas un numéro. */
  if (p.exempleTelephone) {
    p.exempleTelephone = String(p.exempleTelephone).trim();
    if (p.motifTelephone && !/X/i.test(p.exempleTelephone)
      && !new RegExp(p.motifTelephone).test(p.exempleTelephone)) {
      throw new Error('L’exemple « ' + p.exempleTelephone + ' » ne respecte pas le format accepté ('
        + p.motifTelephone + ') : un candidat qui le recopierait serait refusé. '
        + 'Mettez un gabarit, comme 77XXXXXX. Votre vrai numéro de contact se saisit '
        + 'dans « Contact dans ce pays ».');
    }
  }

  /* FERMER LE DERNIER PAYS OUVERT revient à supprimer le seul : le site
     n'aurait plus ni devise, ni format de numéro, ni moyen de paiement. */
  let releve = null;
  if (p.active === false) {
    const autresOuverts = (await tx.query(`select code, defaut from pays where code <> $1 and active
      order by ordre nulls last, code`, [p.code])).rows;
    if (!autresOuverts.length) {
      throw new Error('C’est le dernier pays proposé : le site n’aurait plus ni devise, ni format '
        + 'de numéro, ni moyen de paiement. Ouvrez-en un autre avant de fermer celui-ci.');
    }
    /* Un pays fermé ne peut pas rester celui par défaut : c'est lui que verrait
       un visiteur qui n'a rien choisi. On passe la main à un pays ouvert. */
    if (!autresOuverts.some(a => a.defaut)) releve = autresOuverts[0].code;
    p.defaut = false;
  }

  /* Un seul pays par défaut : c'est celui que voit un visiteur qui n'a rien
     choisi. La base le garantit aussi (index unique) : on libère la place AVANT. */
  if (p.defaut === true) await tx.query('update pays set defaut = false where code <> $1 and defaut', [p.code]);

  const cree = await ecrireLigne(tx, 'pays', 'code', p.code, versColonnes(p, PAYS, 'pays'));
  if (releve) await tx.query('update pays set defaut = (code = $1)', [releve]);

  /* Une saisie sans « paymentMethods » ne les efface pas : le script les
     remettait à zéro, et une modification partielle aurait vidé les moyens de
     paiement du pays sans que personne ne l'ait demandé. */
  const moyens = possede(p, 'paymentMethods') ? await ecrireMoyens(tx, p.code, p.paymentMethods) : null;
  const journal = { cree };
  if (moyens && moyens.change) journal.moyens = { avant: moyens.avant, apres: moyens.apres };
  return { cree, cible: p.code, journal, nom: p.nom, moyens };
}

async function supprimerPays(tx, brut) {
  if (!brut) throw new Error('Code manquant.');
  const code = String(brut).trim().toUpperCase();

  const restants = (await tx.query('select code, defaut from pays where code <> $1 order by ordre nulls last, code', [code])).rows;
  if (!restants.length) {
    throw new Error('C’est le dernier pays : le site n’aurait plus ni devise ni moyen de paiement. '
      + 'Créez-en un autre avant de supprimer celui-ci.');
  }

  /* Une session qui se tient dans ce pays deviendrait invisible partout : on
     refuse plutôt que de la faire disparaître en silence. */
  const sessions = (await tx.query('select count(*)::int as n from session_pays where pays_code = $1 and propose', [code])).rows[0].n;
  if (sessions) {
    throw new Error(sessions + ' session(s) se tiennent dans ce pays. '
      + 'Rattachez-les ailleurs, ou supprimez-les d’abord.');
  }

  const moyens = await lireMoyens(tx, code);
  if (!(await tx.query('delete from pays where code = $1 returning code', [code])).rows.length) {
    throw new Error('Pays introuvable.');
  }
  // Le pays supprimé était peut-être celui par défaut : il en faut toujours un
  if (!restants.some(r => r.defaut)) await tx.query('update pays set defaut = (code = $1)', [restants[0].code]);
  return { cible: code, journal: { moyens } };
}

// ----------------------------------------------------------- PORTFOLIO ----

async function enregistrerRealisation(tx, donnees) {
  const r = estObjet(donnees) ? Object.assign({}, donnees) : null;
  if (!r || !r.id) throw new Error('Identifiant de réalisation manquant.');
  if (!r.title) throw new Error('Le titre est obligatoire.');
  r.id = String(r.id);
  const cree = await ecrireLigne(tx, 'realisations', 'id', r.id, versColonnes(r, REALISATION, 'realisations'));
  return { cree, cible: r.id, journal: { cree } };
}

async function supprimerRealisation(tx, id) {
  if (!id) throw new Error('Identifiant manquant.');
  if (!(await tx.query('delete from realisations where id = $1 returning id', [String(id)])).rows.length) {
    throw new Error('Réalisation introuvable.');
  }
  return { cible: String(id) };
}

// --------------------------------------------- RÉGLAGES, TEXTES, VISUELS ----

/* Ce que le script relisait d'une cellule (valeurReglage) : « true » devient
   vrai, un texte JSON devient sa valeur. On range directement ce qui serait
   relu, pour que le site reçoive exactement ce qu'il recevait. */
function valeurReglage(brut) {
  if (brut === '' || brut === null || brut === undefined) return null;
  if (typeof brut !== 'string') return brut;
  const t = brut.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t.charAt(0) === '{' || t.charAt(0) === '[' || t.charAt(0) === '"') {
    try { return JSON.parse(t); } catch (e) { return brut; }
  }
  return brut;
}

/**
 * Écrit des paires clé / valeur (ecrirePaires) : une valeur vide efface la
 * clé, et la page retombe alors sur ce que son HTML contient.
 */
async function ecrirePaires(tx, table, donnees, message, versValeur) {
  if (!estObjet(donnees)) throw new Error(message);
  const cles = Object.keys(donnees);
  for (const cle of cles) if (!CLE_PAIRE.test(cle)) throw new Error(message + ' Nom refusé : « ' + cle + ' ».');
  for (const cle of cles) {
    if (vide(donnees[cle])) {
      await tx.query(`delete from ${table} where cle = $1`, [cle]);
      continue;
    }
    const [valeur, cast] = versValeur(donnees[cle]);
    await tx.query(`insert into ${table} (cle, valeur) values ($1, $2${cast})
      on conflict (cle) do update set valeur = excluded.valeur`, [cle, valeur]);
  }
  return { cible: table, journal: { cles } };
}

const enTexte = brut => (typeof brut === 'string' ? brut : JSON.stringify(brut));
const versReglage = brut => [JSON.stringify(valeurReglage(enTexte(brut))), '::jsonb'];
const versTexte = brut => [enTexte(brut), ''];

/* Le cadrage d'un visuel (normaliserCadrage) : trois nombres bornés, ou rien.
   Absent, la page garde le cadrage prévu par sa feuille de style. */
function borner(valeur, mini, maxi) {
  if (valeur === '' || valeur === null || valeur === undefined) return null;
  const n = Number(valeur);
  if (isNaN(n) || !isFinite(n)) return null;
  return Math.round(Math.min(maxi, Math.max(mini, n)));
}
function normaliserCadrage(brut) {
  if (brut === '' || brut === null || brut === undefined) return null;
  if (typeof brut === 'string') {
    const texte = brut.trim();
    if (!texte) return null;
    try { brut = JSON.parse(texte); } catch (e) { return null; }
  }
  if (!brut || typeof brut !== 'object') return null;
  const x = borner(brut.x, 0, 100);
  const y = borner(brut.y, 0, 100);
  const zoom = borner(brut.zoom, 100, 250);
  if (x === null || y === null || zoom === null) return null;
  return { x, y, zoom };
}

async function enregistrerVisuels(tx, donnees, cadrages) {
  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) throw new Error('Visuels invalides.');
  if (!cadrages || typeof cadrages !== 'object') cadrages = {};
  const cles = Object.keys(donnees);
  for (const cle of cles) if (!CLE_PAIRE.test(cle)) throw new Error('Visuels invalides. Emplacement refusé : « ' + cle + ' ».');
  for (const cle of cles) {
    const adresse = donnees[cle];
    if (vide(adresse)) {
      await tx.query('delete from visuels where cle = $1', [cle]);
      continue;
    }
    const url = enTexte(adresse);
    if (!estAdresse(url)) {
      throw new Error('Le visuel « ' + cle + ' » doit être une adresse https:// ou un fichier du site.');
    }
    const c = normaliserCadrage(cadrages[cle]) || { x: null, y: null, zoom: null };
    await tx.query(`insert into visuels (cle, url, position_x, position_y, zoom) values ($1, $2, $3, $4, $5)
      on conflict (cle) do update set url = excluded.url, position_x = excluded.position_x,
        position_y = excluded.position_y, zoom = excluded.zoom`, [cle, url, c.x, c.y, c.zoom]);
  }
  return { cible: 'visuels', journal: { cles } };
}

// ------------------------------------------------------------ COMMANDES ----

async function noter(db, qui, action, cible, details) {
  await db.query('insert into journal (qui, action, cible, details) values ($1, $2, $3, $4::jsonb)',
    [qui, action, cible, JSON.stringify(details || {})]);
}

/* Une écriture à la fois, comme le LockService du script : deux onglets
   ouverts ne se marchent pas dessus. L'écriture et sa trace au journal vont
   ensemble, ou pas du tout. */
async function ecrire(db, qui, action, travail) {
  return enTransaction(db, async tx => {
    await tx.query("select pg_advisory_xact_lock(hashtext('impactali-catalogue'))");
    const r = (await travail(tx)) || {};
    await noter(tx, qui, action, r.cible || null, r.journal);
    return r;
  });
}

/** Une commande d'écriture : l'écriture, puis le catalogue à jour, comme le script. */
function commande(action, travail, reponse) {
  return async (db, d, qui, options) => {
    const r = await ecrire(db, qui, action, tx => travail(tx, d));
    if (r.apres) await r.apres(options || {}, qui);
    return Object.assign({ ok: true }, reponse ? reponse(r) : {}, { catalogue: await lireCatalogue(db) });
  };
}

/* L'alerte part APRÈS l'écriture validée, et son échec ne l'annule pas : le
   numéro est enregistré, et le journal en garde la trace de toute façon. */
async function prevenirMoyens(r, options, qui) {
  const a = alerteMoyensPaiement({ code: r.cible, nom: r.nom, avant: r.moyens.avant, apres: r.moyens.apres, qui });
  const envoi = await (options.envoyer || envoyerCourriel)({ sujet: a.sujet, texte: a.texte, html: a.html });
  if (!envoi.envoye) console.error('[alerte paiement]', envoi.erreur);
}

const avecCree = r => ({ cree: r.cree });

const ECRITURES = {
  'admin.formation.save': commande('admin.formation.save', (tx, d) => enregistrerFormation(tx, d.donnees), avecCree),
  'admin.formation.delete': commande('admin.formation.delete', (tx, d) => supprimerFormation(tx, d.id),
    r => ({ sessionsSupprimees: r.sessionsSupprimees })),
  'admin.session.save': commande('admin.session.save', (tx, d) => enregistrerSession(tx, d.donnees), avecCree),
  'admin.session.delete': commande('admin.session.delete', (tx, d) => supprimerSession(tx, d.id)),
  'admin.pays.save': commande('admin.pays.save', async (tx, d) => {
    const r = await enregistrerPays(tx, d.donnees);
    if (r.moyens && r.moyens.change) r.apres = (options, qui) => prevenirMoyens(r, options, qui);
    return r;
  }, avecCree),
  'admin.pays.delete': commande('admin.pays.delete', (tx, d) => supprimerPays(tx, d.code)),
  'admin.portfolio.save': commande('admin.portfolio.save', (tx, d) => enregistrerRealisation(tx, d.donnees), avecCree),
  'admin.portfolio.delete': commande('admin.portfolio.delete', (tx, d) => supprimerRealisation(tx, d.id)),
  'admin.reglages.save': commande('admin.reglages.save',
    (tx, d) => ecrirePaires(tx, 'reglages', d.donnees, 'Réglages invalides.', versReglage)),
  'admin.textes.save': commande('admin.textes.save',
    (tx, d) => ecrirePaires(tx, 'textes', d.donnees, 'Textes invalides.', versTexte)),
  'admin.images.save': commande('admin.images.save', (tx, d) => enregistrerVisuels(tx, d.donnees, d.cadrages)),

  /* L'amorçage depuis les fichiers du site ne sert qu'à une base VIDE. Celle-ci
     a été remplie depuis la feuille, et le sera de nouveau à la bascule ; les
     fichiers du site, eux, sont plus anciens que la feuille. */
  'admin.importer': async () => ({
    ok: false,
    erreur: 'L’import depuis les fichiers du site ne sert plus : la nouvelle base reprend le catalogue de la '
      + 'feuille Google. Ajoutez ce qui manque depuis les onglets Formations, Sessions et Pays.'
  })
};

module.exports = {
  ECRITURES, noter, reprochesPaysSession, nettoyerParPays, calendrierDe, valeurReglage, normaliserCadrage
};

/* La reprise des inscriptions : du CSV de la feuille à la base.
 *
 * Le CSV ci-dessous est INVENTÉ (le vrai porte des données personnelles et ne
 * vit que dans exports/). Il réunit ce qu'un tableur produit de plus retors :
 * virgules, guillemets et sauts de ligne dans une cellule, apostrophe dans un
 * nom, montant avec espace, statut inconnu. Le SQL produit est joué sur une
 * vraie base, puis relu par le tableau de bord. */
'use strict';

const fs = require('fs');
const path = require('path');
const { baseNeuve, verificateur } = require('./outils');
const { catalogueVersSql } = require('../import-catalogue');
const { inscriptionsDepuisCsv, inscriptionsVersSql, horodatage } = require('../import-inscriptions');
const { lireInscriptions } = require('../../../api/_lib/admin');
const { lireCatalogue } = require('../../../api/_lib/catalogue');

const { verifier, bilan } = verificateur();
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogue-2026-10-02.json'), 'utf8'));

const ENTETES = 'Horodatage réception,dateInscription,formationId,formationTitle,sessionId,sessionLabel,sessionStartDate,'
  + 'nom,prenom,telephone,telephoneInternational,email,age,profession,professionDetail,niveau,objectifs,motivation,'
  + 'modePaiement,telPaiement,montant,currency,pays,paysCode,statut,source,pageUrl,JSON complet';
const CSV = '﻿' + ENTETES + '\r\n'
  + '20/09/2026 19:24:28,2026-09-20T16:24:26.214Z,canva-pro,Canva Pro,canva-pro-2026-11,10 octobre 2026,2026-10-10,'
  + 'O\'BRIEN,Awa,3212345,+2693212345,awa@exemple.test,21,Étudiant,,Débutant,"Créer, publier",'
  + '"Je veux ""vraiment"" apprendre,\nsur deux lignes",Mvola,3212345,15 000,KMF,Comores,KM,Confirmé,www.impactali.site,'
  + 'https://www.impactali.site/formations/canva-pro/,"{""nom"":""O\'BRIEN""}"\r\n'
  + '21/09/2026 08:05:00,,canva-pro,Canva Pro,canva-pro-2026-11,,,ALI,Bilal,3299999,+2693299999,,trente,,,,,,'
  + 'Espèces,,,KMF,Comores,KM,Remboursé,,,\r\n'
  + ',,,,,,,,,,,,,,,,,,,,,,,,,,,\r\n'                         // ligne vide en fin de feuille
  + '22/09/2026 10:00:00,,,,,,,SANS,Formation,,,,,,,,,,,,,,,,En attente,,,\r\n';

(async () => {
  verifier('la feuille donne l’heure de Djibouti (UTC+3)', horodatage('20/09/2026 19:24:28'), '2026-09-20T16:24:28.000Z');
  verifier('un 31 février n’est pas une date', horodatage('31/02/2026 10:00:00'), null);

  const { inscriptions, avertissements } = inscriptionsDepuisCsv(CSV);
  verifier('deux inscriptions reprises, la ligne vide et celle sans formation écartées', inscriptions.length, 2);
  verifier('ce qui a été écarté ou corrigé est dit, par numéro de ligne',
    avertissements, ['ligne 3 : âge illisible, laissé vide', 'ligne 3 : statut « Remboursé » inconnu, remis « En attente »',
      'ligne 5 : sans formation, écartée']);
  verifier('et aucun avertissement ne cite un nom ni un numéro', /BRIEN|Bilal|3212345/.test(avertissements.join(' ')), false);

  const db = await baseNeuve();
  await db.exec(catalogueVersSql(source).sql);
  // Une inscription reçue directement par la nouvelle base, avant la reprise
  await db.exec(`insert into inscriptions (form_id, nom, statut, session_id) values ('canva-pro', 'DIRECT', 'Confirmé', 'canva-pro-2026-11')`);

  const sql = inscriptionsVersSql(inscriptions);
  await db.exec(sql);
  await db.exec(sql);                                           // relancée : rien en double
  const liste = await lireInscriptions(db);
  verifier('le SQL se joue, deux fois sans doublon, à côté de l’inscription directe',
    liste.map(i => i.nom).sort(), ['ALI', 'DIRECT', 'O\'BRIEN']);

  const awa = liste.find(i => i.prenom === 'Awa');
  verifier('le texte retors arrive intact', awa.motivation, 'Je veux "vraiment" apprendre,\nsur deux lignes');
  verifier('les virgules d’une cellule ne la coupent pas', awa.objectifs, 'Créer, publier');
  verifier('le montant « 15 000 » est un nombre', awa.montant, 15000);
  verifier('l’heure de réception est la bonne', awa['Horodatage réception'], '2026-09-20T16:24:28.000Z');
  verifier('le statut donné par le propriétaire est gardé', awa.statut, 'Confirmé');
  verifier('le tableau de bord la lit sous ses noms de colonnes',
    [awa.formationId, awa.telephoneInternational, awa.currency, awa.paysCode], ['canva-pro', '+2693212345', 'KMF', 'KM']);
  const charge = (await db.query(`select charge from inscriptions where nom = 'O''BRIEN'`)).rows[0].charge;
  verifier('l’envoi d’origine est gardé, avec la marque de la reprise',
    [charge.reprise, charge.ligneFeuille, charge.envoi], ['feuille-google', 2, { nom: 'O\'BRIEN' }]);

  /* Les places se recomptent : Awa (Confirmé) et l'inscription directe occupent
     chacune une place ; Bilal (statut inconnu → En attente) n'en prend pas. */
  verifier('les places tiennent compte des inscriptions reprises',
    (await lireCatalogue(db)).places['canva-pro-2026-11'], 2);

  await db.close();
  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

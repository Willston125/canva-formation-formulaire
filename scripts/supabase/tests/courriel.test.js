/* L'alerte d'inscription, et son envoi par Resend.
 *
 * Le contenu vient d'un formulaire PUBLIC : un nom peut contenir du HTML, un
 * saut de ligne, un faux e-mail. Rien de cela ne doit passer dans l'alerte
 * comme du code, ni ajouter un en-tête, ni détourner la réponse. L'envoi est
 * éprouvé avec un faux Resend : on regarde ce qui partirait, rien ne part. */
'use strict';

const { verificateur } = require('./outils');
const { alerteInscription, envoyer, echapper } = require('../../../api/_lib/courriel');

const { verifier, bilan } = verificateur();

const LIGNE = {
  form_id: 'canva-pro', formation_title: 'Canva Pro & Création de contenu', session_id: 'canva-pro-2026-11',
  session_label: '10 octobre 2026', nom: 'SAID', prenom: 'Awa', telephone: '3212345',
  telephone_international: '+2693212345', email: 'awa@exemple.test', age: 24, profession: 'Étudiant',
  niveau: 'Débutant', motivation: 'Créer mes visuels', mode_paiement: 'Mvola', tel_paiement: '3212345',
  montant: 15000, devise: 'KMF', pays: 'Comores', pays_code: 'KM', statut: 'En attente', source: 'Site'
};

(async () => {
  // ------------------------------------------------- 1. Le contenu attendu ---

  const a = alerteInscription(LIGNE);
  verifier('le sujet nomme la formation et la personne', a.sujet, 'Nouvelle inscription · Canva Pro & Création de contenu · SAID Awa');
  verifier('la réponse va au candidat', a.repondreA, 'awa@exemple.test');
  verifier('le montant est écrit avec sa devise', /15\s?000 KMF/.test(a.texte.replace(/ /g, ' ')), true);
  const lien = (a.texte.match(/https:\/\/wa\.me\/(\S+)/) || [])[1] || '';
  verifier('le lien WhatsApp vise le numéro, chiffres seuls', lien.split('?')[0], '2693212345');
  verifier('et porte le message de relance déjà rédigé',
    decodeURIComponent(lien.split('?text=')[1] || '').includes('session du 10 octobre 2026'), true);
  verifier('un montant inconnu s’écrit « À confirmer »', /Montant : À confirmer/.test(alerteInscription(Object.assign({}, LIGNE, { montant: null })).texte), true);

  // -------------------------------------- 2. Un formulaire public est hostile ---

  const piege = alerteInscription(Object.assign({}, LIGNE, {
    nom: '<img src=x onerror=alert(1)>', prenom: 'Awa"><script>vol()</script>',
    motivation: '<a href="javascript:alert(1)">clic</a>'
  }));
  verifier('aucune balise du candidat ne passe dans l’alerte', /<img|<script|<a href="javascript/i.test(piege.html), false);
  verifier('elles y sont écrites en texte', piege.html.includes('&lt;img src=x onerror=alert(1)&gt;'), true);
  verifier('le guillemet ne referme pas l’attribut du bouton', piege.html.includes('Awa&quot;&gt;&lt;script&gt;'), true);

  const entete = alerteInscription(Object.assign({}, LIGNE, { nom: 'SAID\r\nBcc: tout@exemple.test' }));
  verifier('un saut de ligne ne crée pas d’en-tête dans le sujet', /[\r\n]/.test(entete.sujet), false);

  verifier('un e-mail mal formé ne devient pas l’adresse de réponse',
    alerteInscription(Object.assign({}, LIGNE, { email: 'pas-un-email' })).repondreA, null);
  verifier('ni une liste d’adresses glissée dans le champ',
    alerteInscription(Object.assign({}, LIGNE, { email: 'a@b.c, intrus@exemple.test' })).repondreA, null);
  verifier('l’échappement couvre l’apostrophe', echapper("l'école"), 'l&#39;école');

  // ---------------------------------------------------- 3. L'envoi par Resend ---

  const appels = [];
  const vraiFetch = global.fetch;
  global.fetch = async (url, options) => {
    appels.push({ url, options });
    return { ok: true, text: async () => '{"id":"essai"}' };
  };
  const ok = await envoyer({ sujet: a.sujet, texte: a.texte, html: a.html, repondreA: a.repondreA }, 'cle-des-epreuves');
  const parti = appels[0] && JSON.parse(appels[0].options.body);
  verifier('l’envoi réussit', ok, { envoye: true, erreur: null });
  verifier('il passe par l’API de Resend', appels[0] && appels[0].url, 'https://api.resend.com/emails');
  verifier('avec la clé en en-tête, jamais dans l’adresse', appels[0] && appels[0].options.headers.Authorization, 'Bearer cle-des-epreuves');
  verifier('au nom d’infos@impactali.site', parti && parti.from, 'Inscriptions IMPACTALI <infos@impactali.site>');
  verifier('vers infos@impactali.site', parti && parti.to, ['infos@impactali.site']);
  verifier('en répondant au candidat', parti && parti.reply_to, 'awa@exemple.test');

  /* Resend refuse (quota, clé révoquée) : l'échec est rendu, jamais levé. */
  global.fetch = async () => ({ ok: false, status: 429, text: async () => 'daily quota exceeded' });
  const refus = await envoyer({ sujet: 's', texte: 't' }, 'cle-des-epreuves');
  verifier('un refus de Resend est rendu, sans exception', [refus.envoye, /429/.test(refus.erreur)], [false, true]);
  global.fetch = async () => { throw new Error('réseau coupé'); };
  verifier('une coupure réseau aussi', (await envoyer({ sujet: 's', texte: 't' }, 'cle-des-epreuves')).envoye, false);
  global.fetch = vraiFetch;

  /* Sans clé (pas encore saisie dans Vercel) : rien ne part, et on le sait. */
  verifier('sans clé, rien ne part', await envoyer({ sujet: 's', texte: 't' }, ''), { envoye: false, erreur: 'RESEND_API_KEY absente' });

  bilan();
})().catch(e => { console.error(e); process.exitCode = 1; });

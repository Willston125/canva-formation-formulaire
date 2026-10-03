/* Les e-mails : l'alerte de nouvelle inscription, et l'envoi par Resend.
 *
 * L'alerte reprend MOT POUR MOT celle du script Google (envoyerAlerte,
 * corpsHtml, texteBrut) : même tableau, même bouton « Relancer sur WhatsApp »
 * avec le message déjà rédigé. Une seule différence voulue : les valeurs
 * viennent de la ligne ENREGISTRÉE — titre, date, montant recalculés par le
 * serveur — et plus de ce qu'a envoyé le navigateur (audit S8).
 *
 * RESEND_API_KEY est saisie par le propriétaire dans Vercel, jamais dans le
 * dépôt. Une clé « Sending access » : volée, elle n'ouvre pas la boîte. */
'use strict';

const EMAIL_PRO = 'infos@impactali.site';
const EXPEDITEUR = 'Inscriptions IMPACTALI <infos@impactali.site>';

/** Échappe pour le HTML, attributs compris. */
function echapper(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const numeroWhatsapp = i => String(i.telephone_international || '').replace(/\D/g, '');

function messageRelance(i, formation, session) {
  return 'Bonjour ' + (i.prenom || '') + ', ici IMPACTALI. Nous avons bien reçu votre inscription à la formation '
    + formation + (session && session !== 'Session non datée' ? ' (session du ' + session + ')' : '')
    + '. Pouvons-nous confirmer votre participation ?';
}

function lignesRecap(i, nomComplet, formation, session) {
  return [
    ['Formation', formation], ['Session', session], ['Nom et prénom', nomComplet],
    ['Pays', i.pays || i.pays_code || '—'],
    ['Téléphone', i.telephone_international || i.telephone || '—'], ['Email', i.email || '—'],
    ['Âge', i.age ? i.age + ' ans' : '—'],
    ['Profession', [i.profession, i.profession_detail].filter(Boolean).join(' · ') || '—'],
    ['Niveau', i.niveau || '—'], ['Objectifs', i.objectifs || '—'],
    ['Motivation', i.motivation || '—'], ['Mode de paiement', i.mode_paiement || '—'],
    ['Numéro de paiement', i.tel_paiement || '—'],
    ['Montant', typeof i.montant === 'number' ? i.montant.toLocaleString('fr-FR') + ' ' + (i.devise || '') : 'À confirmer'],
    ['Statut', i.statut || '—'], ['Origine', i.source || '—']
  ];
}

/** L'alerte d'une inscription enregistrée : { sujet, texte, html, repondreA }. */
function alerteInscription(i) {
  const nomComplet = [i.nom, i.prenom].filter(Boolean).join(' ');
  const formation = i.formation_title || i.form_id || 'Formation non précisée';
  const session = i.session_label || i.session_id || 'Session non datée';
  const lien = 'https://wa.me/' + numeroWhatsapp(i) + '?text=' + encodeURIComponent(messageRelance(i, formation, session));
  const lignes = lignesRecap(i, nomComplet, formation, session);

  const texte = 'NOUVELLE INSCRIPTION\n\n' + lignes.map(l => l[0] + ' : ' + l[1]).join('\n')
    + '\n\nRelancer sur WhatsApp :\n' + lien;

  const rangs = lignes.map(l =>
    '<tr><td style="padding:8px 14px;border-bottom:1px solid #e6e6e6;color:#5f6368;white-space:nowrap;vertical-align:top">'
    + echapper(l[0]) + '</td><td style="padding:8px 14px;border-bottom:1px solid #e6e6e6;color:#111;font-weight:600">'
    + echapper(l[1]) + '</td></tr>').join('');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">'
    + '<div style="background:#050709;padding:20px 24px;border-radius:12px 12px 0 0">'
    + '<p style="margin:0;color:#CBFD00;font-size:12px;letter-spacing:1px;font-weight:700">IMPACTALI</p>'
    + '<h1 style="margin:6px 0 0;color:#ffffff;font-size:20px">Nouvelle inscription</h1>'
    + '<p style="margin:6px 0 0;color:#9CA6B2;font-size:14px">' + echapper(formation) + ' — ' + echapper(session) + '</p>'
    + '</div><div style="border:1px solid #e6e6e6;border-top:0;border-radius:0 0 12px 12px;padding:8px 0 20px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rangs + '</table>'
    + '<div style="text-align:center;padding:22px 16px 4px">'
    + '<a href="' + echapper(lien) + '" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;'
    + 'font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px">Relancer '
    + echapper(i.prenom || nomComplet) + ' sur WhatsApp</a>'
    + '<p style="margin:10px 0 0;color:#5f6368;font-size:12px">Le message de relance est déjà rédigé, il suffit de l’envoyer.</p>'
    + '</div></div></div>';

  /* Le sujet ne garde que du texte sur une ligne : un saut de ligne glissé
     dans un nom n'ajoute pas d'en-tête à l'e-mail. */
  const sujet = ('Nouvelle inscription · ' + formation + ' · ' + nomComplet).replace(/[\r\n\t]+/g, ' ').slice(0, 200);
  const repondreA = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(i.email || '')) ? String(i.email) : null;
  return { sujet, texte, html, repondreA };
}

/** « Waafi : +253 77 55 63 44 — Ali William » : ce qu'un candidat lirait pour payer. */
function decrireMoyen(m) {
  if (m.kind === 'cash') {
    return (m.label || 'Espèces') + ' : ' + ([m.recipient, m.place, m.phone].filter(Boolean).join(', ') || '—');
  }
  return (m.label || 'Paiement mobile') + ' : ' + (m.number || '—') + (m.accountName ? ' — ' + m.accountName : '');
}

/**
 * L'alerte d'un changement de moyens de paiement : { sujet, texte, html }.
 *
 * Un numéro de paiement est ce qu'un intrus changerait en premier : les
 * candidats paieraient chez lui, sans que rien ne paraisse sur le site. Chaque
 * changement part donc aussitôt dans la boîte du propriétaire, avant et après
 * côte à côte, pour qu'un changement qu'il n'a pas fait saute aux yeux.
 */
function alerteMoyensPaiement({ code, nom, avant, apres, qui, quand = new Date() }) {
  const pays = (nom || code) + (nom && code ? ' (' + code + ')' : '');
  const date = quand.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Djibouti' });
  const liste = moyens => (moyens.length ? moyens.map(decrireMoyen) : ['(aucun)']);
  const mise = 'Si ce changement ne vient pas de vous, changez tout de suite le mot de passe de votre compte '
    + 'Supabase, puis rétablissez les bons numéros dans le tableau de bord.';

  const texte = 'MOYENS DE PAIEMENT MODIFIÉS — ' + pays + '\n\n'
    + 'Par ' + qui + ', le ' + date + ' (heure de Djibouti).\n\n'
    + 'AVANT\n' + liste(avant).map(l => '- ' + l).join('\n') + '\n\n'
    + 'APRÈS\n' + liste(apres).map(l => '- ' + l).join('\n') + '\n\n' + mise;

  const bloc = (titre, moyens) => '<p style="margin:18px 0 6px;color:#5f6368;font-size:12px;font-weight:700;letter-spacing:1px">'
    + titre + '</p><ul style="margin:0;padding-left:20px;color:#111;font-size:14px;line-height:1.6">'
    + liste(moyens).map(l => '<li>' + echapper(l) + '</li>').join('') + '</ul>';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">'
    + '<div style="background:#050709;padding:20px 24px;border-radius:12px 12px 0 0">'
    + '<p style="margin:0;color:#CBFD00;font-size:12px;letter-spacing:1px;font-weight:700">IMPACTALI</p>'
    + '<h1 style="margin:6px 0 0;color:#ffffff;font-size:20px">Moyens de paiement modifiés</h1>'
    + '<p style="margin:6px 0 0;color:#9CA6B2;font-size:14px">' + echapper(pays) + '</p>'
    + '</div><div style="border:1px solid #e6e6e6;border-top:0;border-radius:0 0 12px 12px;padding:4px 24px 20px">'
    + '<p style="margin:16px 0 0;color:#111;font-size:14px">Par <strong>' + echapper(qui) + '</strong>, le '
    + echapper(date) + ' (heure de Djibouti).</p>'
    + bloc('AVANT', avant) + bloc('APRÈS', apres)
    + '<p style="margin:20px 0 0;padding:12px 14px;background:#fff4e5;border-radius:8px;color:#5a3b00;font-size:13px">'
    + echapper(mise) + '</p></div></div>';

  const sujet = ('Moyens de paiement modifiés · ' + pays).replace(/[\r\n\t]+/g, ' ').slice(0, 200);
  return { sujet, texte, html };
}

/**
 * Envoie un e-mail par Resend. Ne lève jamais : rend { envoye, erreur }.
 * Une alerte qui échoue ne doit pas faire perdre l'inscription.
 */
async function envoyer({ a = EMAIL_PRO, sujet, texte, html, repondreA = null, piecesJointes = null }, cle = process.env.RESEND_API_KEY) {
  if (!cle) return { envoye: false, erreur: 'RESEND_API_KEY absente' };
  const corps = { from: EXPEDITEUR, to: [a], subject: sujet, text: texte };
  if (html) corps.html = html;
  if (repondreA) corps.reply_to = repondreA;
  if (piecesJointes) corps.attachments = piecesJointes;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) return { envoye: true, erreur: null };
    const detail = await r.text().catch(() => '');
    return { envoye: false, erreur: 'Resend ' + r.status + ' ' + detail.slice(0, 160) };
  } catch (e) {
    return { envoye: false, erreur: (e && (e.name || e.message)) || 'erreur réseau' };
  }
}

module.exports = { alerteInscription, alerteMoyensPaiement, envoyer, echapper, EMAIL_PRO };

/* Correspondance entre le CONTRAT du site — les clés JSON que lisent les pages
 * et le tableau de bord, héritées des colonnes de la feuille Google — et les
 * colonnes de la base Supabase.
 *
 * Une seule table, lue dans les deux sens : l'import y trouve où ranger chaque
 * valeur, l'API comment rebâtir la réponse que le site attend. Deux listes
 * tenues à part finiraient par diverger, et une clé oubliée d'un côté
 * disparaîtrait du site sans le moindre message.
 *
 * Chaque entrée : [clé du contrat, colonne, type]. Le type dit ce que rend une
 * valeur absente, comme le faisait le script Google (depuisCellule) : un champ
 * « json » vide vaut [], tout autre champ vide vaut null. « date » est relu en
 * texte AAAA-MM-JJ : un objet Date décalerait le jour selon le fuseau. */
'use strict';

const FORMATION = [
  ['id', 'id'], ['slug', 'slug'], ['title', 'title'], ['shortTitle', 'short_title'],
  ['category', 'category'], ['family', 'family'], ['promise', 'promise'],
  ['shortDescription', 'short_description'], ['image', 'image'], ['imageAlt', 'image_alt'],
  ['duration', 'duration'], ['level', 'level'], ['mode', 'mode'], ['price', 'price'],
  ['modules', 'modules'], ['learnings', 'learnings', 'json'], ['featured', 'featured'],
  ['registrationOpen', 'registration_open'], ['active', 'active'],
  ['allowRegistrationWithoutSession', 'allow_registration_without_session'],
  ['hasDetailPage', 'has_detail_page'], ['href', 'href'], ['formId', 'form_id'],
  ['poster', 'poster'], ['lead', 'lead'], ['levelSubject', 'level_subject'],
  ['objectives', 'objectives', 'json'], ['ordre', 'ordre'], ['programme', 'programme', 'json'],
  ['faq', 'faq', 'json'], ['prerequis', 'prerequis', 'json']
];

/* `pays`, `parPays` et `placesAvailable` ne sont pas des colonnes : ils se
   rebâtissent depuis session_pays et les inscriptions. `jours` et `seances` sont
   nouveaux : ils servent à refuser une session que le calendrier ne peut pas
   contenir (audit C1). */
const SESSION = [
  ['id', 'id'], ['formId', 'form_id'], ['startDate', 'start_date', 'date'],
  ['endDate', 'end_date', 'date'], ['schedule', 'schedule'], ['duration', 'duration'],
  ['location', 'location'], ['mode', 'mode'], ['price', 'price'],
  ['placesTotal', 'places_total'], ['registrationOpen', 'registration_open'],
  ['currency', 'currency'], ['jours', 'jours', 'liste'], ['seances', 'seances']
];

const PAYS = [
  ['code', 'code'], ['nom', 'nom'], ['devise', 'devise'], ['indicatif', 'indicatif'],
  ['motifTelephone', 'motif_telephone'], ['aideTelephone', 'aide_telephone'],
  ['exempleTelephone', 'exemple_telephone'], ['longueurTelephone', 'longueur_telephone'],
  ['defaut', 'defaut'], ['active', 'active'], ['ordre', 'ordre'],
  ['whatsappNumber', 'whatsapp_number'], ['whatsappDisplay', 'whatsapp_display'],
  ['fuseaux', 'fuseaux', 'json'], ['regions', 'regions', 'json']
];

/* Un moyen de paiement n'a que les clés qui le concernent : un paiement mobile
   n'a pas de « recipient », des espèces n'ont pas de « number ». Les clés
   vides ne sont donc pas rendues. */
const MOYEN_PAIEMENT = [
  ['kind', 'kind'], ['label', 'label'], ['numberLabel', 'number_label'], ['number', 'number'],
  ['accountName', 'account_name'], ['recipient', 'recipient'], ['place', 'place'],
  ['phone', 'phone'], ['value', 'value'], ['image', 'image']
];

const REALISATION = [
  ['id', 'id'], ['category', 'category'], ['title', 'title'], ['description', 'description'],
  ['image', 'image'], ['imageAlt', 'image_alt'], ['imagePosition', 'image_position'],
  ['href', 'href'], ['video', 'video'], ['ordre', 'ordre']
];

/** Liste de colonnes pour un SELECT : les dates reviennent en texte. */
function colonnes(champs) {
  return champs.map(([, col, type]) => (type === 'date' ? `${col}::text as ${col}` : col)).join(', ');
}

/** Une ligne de la base → un objet du contrat, toutes les clés présentes. */
function versObjet(ligne, champs) {
  const o = {};
  for (const [cle, col, type] of champs) {
    const v = ligne[col];
    if (v === null || v === undefined) o[cle] = (type === 'json' || type === 'liste') ? [] : null;
    else o[cle] = v;
  }
  return o;
}

module.exports = { FORMATION, SESSION, PAYS, MOYEN_PAIEMENT, REALISATION, colonnes, versObjet };

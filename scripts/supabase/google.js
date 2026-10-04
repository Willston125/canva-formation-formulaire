/* L'adresse du script Google : la source du catalogue et des inscriptions
 * jusqu'à la bascule, puis le chemin du retour arrière.
 *
 * Écrite ICI, et non plus lue dans formations-data.js : à la bascule, le site
 * passe sur /api, et la reprise doit pourtant savoir encore où lire la feuille.
 * L'adresse est publique : elle figure dans le code du site depuis le début. */
'use strict';

const ADRESSE_GOOGLE = 'https://script.google.com/macros/s/AKfycbw_fGtr_y_Mso7aKbg43mnKpSffZtb3XMiCvxcfTxOd76FM9HAJA6BBmdWS0_FkY5AmFQ/exec';

/** Le catalogue tel que le script Google le sert au site (public). */
async function lireCatalogueGoogle() {
  const reponse = await fetch(ADRESSE_GOOGLE + '?action=catalogue', { redirect: 'follow' });
  if (!reponse.ok) throw new Error('Le script Google a répondu ' + reponse.status);
  return reponse.json();
}

module.exports = { ADRESSE_GOOGLE, lireCatalogueGoogle };

/* Jours de cours et nombre de séances d'une session, lus dans ce qu'affiche
 * le site : « Lundi et mercredi · 18h – 20h », « 15 séances · 24 heures ».
 *
 * L'audit du 2 octobre 2026 (C1) a trouvé quatre sessions sur cinq qui
 * annonçaient plus de séances que leurs dates n'en contiennent. La base refuse
 * désormais une telle session (seances_possibles, dans le schéma) ; l'API fait
 * le même calcul AVANT d'écrire, pour dire en clair ce qui ne va pas.
 *
 * Partagé par l'API et par la reprise du catalogue (scripts/supabase) : les
 * deux doivent lire les horaires de la même façon. */
'use strict';

const JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7 };
const NOMS_JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « Lundi et mercredi · 18h – 20h » → [1, 3]. */
function joursDepuisHoraires(texte) {
  const bas = String(texte || '').toLowerCase();
  return Object.keys(JOURS).filter(j => new RegExp('\\b' + j + 's?\\b').test(bas)).map(j => JOURS[j]).sort((a, b) => a - b);
}

/** « 15 séances · 24 heures » → 15. */
function seancesDepuisDuree(texte) {
  const m = /(\d+)\s*s[ée]ances?/i.exec(String(texte || ''));
  return m ? Number(m[1]) : null;
}

/** Même calcul que seances_possibles() dans la base. */
function seancesPossibles(debut, fin, jours) {
  if (!debut || !fin || !jours.length) return null;
  let n = 0;
  for (let d = new Date(debut + 'T00:00:00Z'); d <= new Date(fin + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const isodow = ((d.getUTCDay() + 6) % 7) + 1;
    if (jours.includes(isodow)) n++;
  }
  return n;
}

module.exports = { joursDepuisHoraires, seancesDepuisDuree, seancesPossibles, NOMS_JOURS };

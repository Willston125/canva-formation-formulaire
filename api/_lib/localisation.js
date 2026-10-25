/* Le pays d'une position (latitude, longitude), quand le visiteur active la
 * localisation de son appareil.
 *
 * C'EST ENCORE LE SERVEUR QUI DÉCIDE : le navigateur n'envoie que des
 * coordonnées, jamais un pays. Elles ne servent qu'à défaut d'adresse IP
 * reconnue (api/_lib/marche.js) : une adresse de Djibouti ou des Comores
 * l'emporte toujours, si bien qu'une position inventée ne fait pas voir
 * l'offre d'un autre pays à un visiteur déjà reconnu.
 *
 * Les contours sont ceux des pays ouverts, eaux territoriales comprises (on
 * peut se localiser depuis un bateau ou une plage), simplifiés à quelques
 * centaines de mètres près. Mayotte, voisine des Comores, en est exclue.
 * Contours : © les contributeurs d'OpenStreetMap (ODbL), relations 192801 et
 * 535790. Un pays ouvert plus tard dans le tableau de bord se reconnaît par son
 * adresse IP dès son ouverture ; par la localisation, une fois son contour
 * ajouté ici. */
'use strict';

/* [longitude, latitude], dans l'ordre du GeoJSON d'origine. */
const CONTOURS = {
  DJ: [[
    [41.7713, 11.4938], [41.8177, 10.9629], [41.9650, 10.9153], [42.1450, 10.9812], [42.4213, 10.9819],
    [42.6289, 11.0956], [42.6888, 11.0563], [42.7527, 11.0795], [42.7924, 10.9873], [42.9616, 10.9844],
    [43.4253, 11.7114], [43.4099, 11.7831], [43.5212, 11.8462], [43.5967, 11.9816], [43.6365, 12.5180],
    [43.3205, 12.5953], [43.2730, 12.6871], [43.2978, 12.7923], [42.8894, 12.6169], [42.8019, 12.5096],
    [42.8249, 12.4341], [42.7010, 12.3548], [42.4640, 12.5239], [41.9622, 11.8197], [41.8361, 11.7328]
  ]],
  KM: [[
    [42.8262, -11.8034], [42.8803, -11.9399], [43.5260, -12.5639], [44.4375, -12.9854], [44.9731, -12.1975],
    [44.6001, -11.9044], [43.4281, -11.1722], [43.2449, -11.1781], [43.1457, -11.2344], [42.8514, -11.7068]
  ]]
};

/* Deux décimales, soit un kilomètre environ : assez pour dire le pays, trop
   peu pour désigner une maison. Le navigateur arrondit déjà avant d'envoyer. */
const FORMAT_POSITION = /^(-?\d{1,2}(?:\.\d{1,2})?),(-?\d{1,3}(?:\.\d{1,2})?)$/;

/** « -11.70,43.25 » → { lat, lon }, ou null si illisible ou hors du globe. */
function lirePosition(texte) {
  const m = FORMAT_POSITION.exec(String(texte || '').trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Le point est-il dans l'anneau ? (rayon lancé vers l'est, règle pair-impair) */
function dansAnneau(lon, lat, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Le code du pays où se trouve cette position (« -11.70,43.25 »), ou ''. */
function paysDeLaPosition(texte) {
  const p = lirePosition(texte);
  if (!p) return '';
  for (const [code, anneaux] of Object.entries(CONTOURS)) {
    if (anneaux.some(anneau => dansAnneau(p.lon, p.lat, anneau))) return code;
  }
  return '';
}

module.exports = { paysDeLaPosition, lirePosition, CONTOURS };

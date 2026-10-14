/* La musique et les bruitages de la présentation, composés et synthétisés ici.
 *
 * RIEN N'EST EMPRUNTÉ : chaque son (grosse caisse, claquements, charleston,
 * basse, nappes, arpèges, souffles, impacts, carillons, clics) est fabriqué
 * par le code, puis calculé hors temps réel (OfflineAudioContext). Les droits
 * appartiennent donc à IMPACTALI : diffusion publicitaire libre, sans licence.
 *
 * Le morceau suit le montage (120 battements par minute, un accord par mesure
 * de 2 s, ré mineur : Rém – Si♭ – Fa – Do) :
 *   accroche   une nappe filtrée, une note par ligne, la montée vers le logo
 *   marque     l'impact du logo, un rythme à demi-temps
 *   domaines   le rythme plein (le moment le plus énergique), un souffle par carte
 *   pratique   le rythme se retire : nappe et notes douces, puis il revient
 *   parcours   un rythme posé, un carillon par étape, un clic par appui
 *   appel      l'impact, un accent par mot, le carillon du bouton, l'accord final
 *
 * `fabriquerSon({ partie })` rend un WAV (48 kHz, stéréo, 16 bits) en base64 :
 *   partie = 'musique'   la musique seule ;
 *   partie = 'bruitages' les bruitages seuls (tirés des repères de video.js).
 * Lancé par son/composer.js, dans la page video.html du montage voulu. */
(function () {
  'use strict';

  const FE = 48000;
  const TEMPS = 0.5;
  const note = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const ACCORDS = [
    { nom: 'Rém', basse: 38, nappe: [62, 65, 69, 74], arpege: [74, 77, 81, 86] },
    { nom: 'Si♭', basse: 34, nappe: [62, 65, 70, 74], arpege: [70, 74, 77, 82] },
    { nom: 'Fa', basse: 41, nappe: [60, 65, 69, 72], arpege: [69, 72, 77, 81] },
    { nom: 'Do', basse: 36, nappe: [60, 64, 67, 72], arpege: [67, 72, 76, 79] }
  ];
  const FA = ACCORDS[2];
  const accordA = t => ACCORDS[Math.floor(Math.max(0, t) / 2 + 1e-6) % 4];

  /* Un hasard reproductible : deux rendus donnent exactement le même son. */
  function hasard(graine) {
    let s = graine >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  window.fabriquerSon = async function ({ partie = 'musique' } = {}) {
    const { M } = window.MONTAGE_ACTUEL();
    const reperes = window.REPERES_SONORES();
    const voixPlacees = window.VOIX_PLACEES();
    /** Quelqu'un parle-t-il entre a et b ? Les montées s'y font discrètes, les roulements s'y taisent. */
    const parle = (a, b) => voixPlacees.some(v => v.debut < b && v.fin > a);
    const duree = M.duree;
    const ctx = new OfflineAudioContext(2, Math.ceil(duree * FE), FE);
    const alea = hasard(partie === 'musique' ? 20261010 : 77);

    // ------------------------------------------------------------ console ----
    const limiteur = ctx.createDynamicsCompressor();
    limiteur.threshold.value = -3; limiteur.knee.value = 0; limiteur.ratio.value = 20;
    limiteur.attack.value = 0.001; limiteur.release.value = 0.06;
    limiteur.connect(ctx.destination);
    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -18; compresseur.knee.value = 10; compresseur.ratio.value = 2.6;
    compresseur.attack.value = 0.008; compresseur.release.value = 0.16;
    compresseur.connect(limiteur);
    const maitre = ctx.createGain();
    maitre.gain.value = 0.55;
    maitre.connect(compresseur);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulsion(ctx, 2.6, 3.0, alea);
    const retourReverb = ctx.createGain();
    retourReverb.gain.value = 0.26;
    reverb.connect(retourReverb);
    retourReverb.connect(maitre);

    const echo = ctx.createDelay(1);
    echo.delayTime.value = TEMPS * 0.75;
    const reinjection = ctx.createGain();
    reinjection.gain.value = 0.3;
    const filtreEcho = ctx.createBiquadFilter();
    filtreEcho.type = 'lowpass';
    filtreEcho.frequency.value = 3400;
    echo.connect(filtreEcho); filtreEcho.connect(reinjection); reinjection.connect(echo);
    const retourEcho = ctx.createGain();
    retourEcho.gain.value = 0.3;
    filtreEcho.connect(retourEcho); retourEcho.connect(maitre);

    // Le « pompage » : nappe et basse s'effacent à chaque grosse caisse
    const pompe = ctx.createGain();
    pompe.connect(maitre);

    const bruit = ctx.createBuffer(2, FE * 2, FE);
    for (let c = 0; c < 2; c++) {
      const d = bruit.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = alea() * 2 - 1;
    }

    // -------------------------------------------------------- instruments ----
    function enveloppe(g, t, crete, attaque, chute, fin = 0.0001) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, crete), t + attaque);
      g.gain.exponentialRampToValueAtTime(fin, t + attaque + chute);
    }
    function souffleBruit(t, d, filtres, crete, vers, { attaque = 0.002, pan = 0 } = {}) {
      const src = ctx.createBufferSource();
      src.buffer = bruit;
      src.loop = true;
      let noeud = src;
      for (const f of filtres) {
        const filtre = ctx.createBiquadFilter();
        filtre.type = f.type;
        filtre.frequency.value = f.f;
        if (f.q) filtre.Q.value = f.q;
        noeud.connect(filtre);
        noeud = filtre;
      }
      const g = ctx.createGain();
      enveloppe(g, t, crete, attaque, d);
      noeud.connect(g);
      let sortie = g;
      if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); sortie = p; }
      (Array.isArray(vers) ? vers : [vers]).forEach(v => sortie.connect(v));
      src.start(t, alea() * 1.5);
      src.stop(t + attaque + d + 0.05);
    }
    function grosseCaisse(t, force = 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(54, t + 0.09);
      o.frequency.exponentialRampToValueAtTime(43, t + 0.36);
      const g = ctx.createGain();
      enveloppe(g, t, 0.95 * force, 0.003, 0.4);
      o.connect(g); g.connect(maitre);
      o.start(t); o.stop(t + 0.48);
      souffleBruit(t, 0.012, [{ type: 'highpass', f: 2400 }], 0.2 * force, maitre);
      pompe.gain.setValueAtTime(0.3, t);
      pompe.gain.setTargetAtTime(1, t + 0.03, 0.08);
    }
    function claquement(t, force = 1) {
      [0, 0.011, 0.022].forEach(d => souffleBruit(t + d, 0.028, [{ type: 'bandpass', f: 1500, q: 0.9 }], 0.38 * force, [maitre, reverb]));
      souffleBruit(t + 0.03, 0.16, [{ type: 'bandpass', f: 1300, q: 0.7 }], 0.18 * force, [maitre, reverb]);
    }
    function charleston(t, ouvert = false, force = 1) {
      souffleBruit(t, ouvert ? 0.22 : 0.04, [{ type: 'highpass', f: 7800 }, { type: 'peaking', f: 10500, q: 1 }],
        (ouvert ? 0.085 : 0.11) * force, maitre, { pan: ouvert ? 0.18 : -0.12 });
    }
    function shaker(t, force = 1) {
      souffleBruit(t, 0.05, [{ type: 'highpass', f: 6000 }, { type: 'lowpass', f: 11000 }], 0.05 * force, maitre, { attaque: 0.012, pan: 0.25 });
    }
    function basse(t, midi, d = 0.22, force = 1) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass'; filtre.Q.value = 2.6;
      filtre.frequency.setValueAtTime(1100, t);
      filtre.frequency.exponentialRampToValueAtTime(300, t + 0.18);
      const g = ctx.createGain();
      enveloppe(g, t, 0.22 * force, 0.006, d);
      ['sawtooth', 'square'].forEach((type, k) => {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = note(midi); o.detune.value = k ? -6 : 6;
        o.connect(filtre); o.start(t); o.stop(t + d + 0.05);
      });
      // Une sous-basse pure, pour la tenue sur téléphone et casque
      const sub = ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = note(midi);
      const gs = ctx.createGain();
      enveloppe(gs, t, 0.16 * force, 0.006, d);
      sub.connect(gs); gs.connect(pompe); sub.start(t); sub.stop(t + d + 0.05);
      filtre.connect(g); g.connect(pompe);
    }
    function nappe(debut, fin, accord, force = 1, coupure = 1600, coupureFin = null) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass'; filtre.Q.value = 0.7;
      filtre.frequency.setValueAtTime(coupure, debut);
      if (coupureFin) filtre.frequency.exponentialRampToValueAtTime(coupureFin, fin);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, debut);
      g.gain.exponentialRampToValueAtTime(0.03 * force, debut + 0.3);
      g.gain.setValueAtTime(0.03 * force, Math.max(debut + 0.3, fin - 0.1));
      g.gain.exponentialRampToValueAtTime(0.0001, fin + 0.4);
      accord.nappe.forEach(midi => [-9, 9].forEach(desaccord => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = note(midi); o.detune.value = desaccord;
        o.connect(filtre); o.start(debut); o.stop(fin + 0.45);
      }));
      filtre.connect(g); g.connect(pompe); g.connect(reverb);
    }
    function pince(t, midi, force = 1, d = 0.26, vers = null) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass'; filtre.Q.value = 2;
      filtre.frequency.setValueAtTime(4400, t);
      filtre.frequency.exponentialRampToValueAtTime(700, t + d);
      const g = ctx.createGain();
      enveloppe(g, t, 0.1 * force, 0.004, d);
      ['triangle', 'sawtooth'].forEach((type, k) => {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = note(midi); o.detune.value = k ? 5 : 0;
        o.connect(filtre); o.start(t); o.stop(t + d + 0.05);
      });
      filtre.connect(g);
      (vers || [maitre, echo, reverb]).forEach(v => g.connect(v));
    }
    /** Une note « piano électrique » douce (pour la pratique). */
    function clochette(t, midi, force = 1, d = 1.2) {
      const porteuse = ctx.createOscillator();
      const modulante = ctx.createOscillator();
      const indice = ctx.createGain();
      porteuse.type = 'sine'; modulante.type = 'sine';
      porteuse.frequency.value = note(midi);
      modulante.frequency.value = note(midi) * 2;
      indice.gain.setValueAtTime(note(midi) * 1.4, t);
      indice.gain.exponentialRampToValueAtTime(note(midi) * 0.1, t + d * 0.6);
      modulante.connect(indice); indice.connect(porteuse.frequency);
      const g = ctx.createGain();
      enveloppe(g, t, 0.12 * force, 0.004, d);
      porteuse.connect(g); g.connect(maitre); g.connect(reverb); g.connect(echo);
      porteuse.start(t); modulante.start(t); porteuse.stop(t + d + 0.1); modulante.stop(t + d + 0.1);
    }
    function montee(debut, fin, force = 1, vers = maitre) {
      if (parle(debut + 0.2, fin)) force *= 0.32;
      const src = ctx.createBufferSource();
      src.buffer = bruit; src.loop = true;
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'bandpass'; filtre.Q.value = 1.3;
      filtre.frequency.setValueAtTime(320, debut);
      filtre.frequency.exponentialRampToValueAtTime(7800, fin);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, debut);
      g.gain.exponentialRampToValueAtTime(0.17 * force, fin - 0.02);
      g.gain.linearRampToValueAtTime(0.0001, fin);
      src.connect(filtre); filtre.connect(g); g.connect(vers); g.connect(reverb);
      src.start(debut); src.stop(fin + 0.02);
    }
    function roulement(debut, fin, force = 1) {
      if (parle(debut, fin)) return;
      for (let t = debut, k = 0; t < fin - 0.02; k++) {
        claquement(t, force * (0.16 + 0.5 * (t - debut) / (fin - debut)));
        t += t < (debut + fin) / 2 ? 0.125 : 0.0625;
      }
    }
    function impact(t, force = 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(92, t);
      o.frequency.exponentialRampToValueAtTime(31, t + 1.2);
      const g = ctx.createGain();
      enveloppe(g, t, 0.8 * force, 0.004, 1.1);
      o.connect(g); g.connect(maitre);
      o.start(t); o.stop(t + 1.2);
      souffleBruit(t, 0.5, [{ type: 'lowpass', f: 1700 }], 0.45 * force, [maitre, reverb]);
      souffleBruit(t, 0.9, [{ type: 'bandpass', f: 650, q: 0.5 }], 0.12 * force, reverb);
      pompe.gain.setValueAtTime(0.22, t);
      pompe.gain.setTargetAtTime(1, t + 0.05, 0.2);
    }
    function souffle(t, d = 0.5, force = 1, sens = 1, grave = false) {
      const src = ctx.createBufferSource();
      src.buffer = bruit; src.loop = true;
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'bandpass'; filtre.Q.value = 1.1;
      const f0 = grave ? 220 : 340;
      filtre.frequency.setValueAtTime(f0, t);
      filtre.frequency.exponentialRampToValueAtTime(grave ? 1400 : 2800, t + d * 0.62);
      filtre.frequency.exponentialRampToValueAtTime(f0 * 1.4, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3 * force, t + d * 0.62);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.7 * sens, t);
      p.pan.linearRampToValueAtTime(0.7 * sens, t + d);
      src.connect(filtre); filtre.connect(g); g.connect(p); p.connect(maitre); p.connect(reverb);
      src.start(t, alea()); src.stop(t + d + 0.02);
    }
    function scintille(t, d = 0.5, force = 1) {
      // Un trait lumineux : un sifflement aigu qui monte, et du bruit très fin
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(5200, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03 * force, t + d * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
      o.connect(g); g.connect(maitre); g.connect(reverb); g.connect(echo);
      o.start(t); o.stop(t + d + 0.2);
      souffleBruit(t, d, [{ type: 'highpass', f: 6500 }], 0.07 * force, [maitre, reverb], { attaque: d * 0.4, pan: 0.2 });
    }
    function tic(t, force = 1, aigu = 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(2400 * aigu, t);
      o.frequency.exponentialRampToValueAtTime(1300 * aigu, t + 0.03);
      const g = ctx.createGain();
      enveloppe(g, t, 0.06 * force, 0.001, 0.05);
      o.connect(g); g.connect(maitre); g.connect(reverb);
      o.start(t); o.stop(t + 0.08);
      souffleBruit(t, 0.012, [{ type: 'highpass', f: 4000 }], 0.06 * force, maitre);
    }
    function carillon(t, midi, force = 1, d = 1.4) {
      // Une cloche (synthèse FM) : claire, sans dureté
      clochette(t, midi, force * 1.1, d);
      clochette(t + 0.004, midi + 12, force * 0.35, d * 0.7);
    }
    function appui(t, force = 1) {
      souffleBruit(t, 0.018, [{ type: 'bandpass', f: 3200, q: 1.2 }], 0.22 * force, maitre);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
      const g = ctx.createGain();
      enveloppe(g, t, 0.2 * force, 0.002, 0.07);
      o.connect(g); g.connect(maitre);
      o.start(t); o.stop(t + 0.1);
    }

    // ============================================================ MUSIQUE ==
    if (partie === 'musique') {
      const A = M.accroche, Q = M.marque, Dm = M.domaines, P = M.pratique, C = M.parcours, AP = M.appel;
      const finRythme = AP.bouton[1] + 1.25;
      // Un temps sur la grille de 0,5 s, arrondi
      const grille = t => Math.round(t / TEMPS) * TEMPS;

      // Les nappes, mesure par mesure : filtrées pendant l'accroche, pleines ensuite, douces pendant la pratique
      // Découpe aux barres de mesure ET aux changements de séquence : aucun trou entre deux nappes
      const coupes = new Set([duree - 0.3, Q.debut, P.debut, P.fin, AP.bouton[1]]);
      for (let d = 0; d < duree; d += 2) coupes.add(d);
      const bornes = [...coupes].filter(x => x >= 0 && x <= duree - 0.3).sort((a, b) => a - b);
      for (let i = 0; i < bornes.length - 1; i++) {
        const d = bornes[i];
        const f = bornes[i + 1];
        if (f - d < 0.05) continue;
        const accord = d >= AP.bouton[1] - 0.05 ? FA : accordA(d);
        if (d < Q.debut) nappe(d, f, accord, 0.95, 560 + d * 300, 950 + f * 300);
        else if (d >= P.debut - 0.01 && d < P.fin) nappe(d, f, accord, 1.05, 1300);
        else nappe(d, f, accord, 0.9, 1900);
      }
      // Accroche : une note par ligne, la montée vers le logo
      const notesAccroche = [74, 77, 81, 84, 86];
      reperes.filter(r => r.type === 'mot' && r.t < Q.debut).forEach((r, k) => pince(r.t, notesAccroche[k % 5], 0.9, 0.35));
      montee(Q.debut - 1.1, Q.debut, 0.8);
      // Marque : le rythme à demi-temps
      for (let t = grille(Q.debut); t < Dm.debut - 0.01; t += TEMPS) {
        const dansMesure = (t % 2 + 2) % 2;
        if (dansMesure < 0.01 || Math.abs(dansMesure - 1) < 0.01) grosseCaisse(t, 0.9);
        if (Q.site !== null && t >= Q.site && Math.abs(dansMesure - 1) < 0.01) claquement(t, 0.6);
        charleston(t + TEMPS / 2, false, 0.7);
        if (dansMesure < 0.01) basse(t, accordA(t).basse, 0.9, 0.9);
      }
      roulement(Dm.debut - 1, Dm.debut, 0.8);
      // Domaines : le rythme plein
      const plein = (debut, fin, { claps = true, arpege = true, force = 1 } = {}) => {
        for (let t = grille(debut); t < fin - 0.01; t += TEMPS) {
          const dansMesure = (t % 2 + 2) % 2;
          grosseCaisse(t, force);
          if (claps && (Math.abs(dansMesure - 0.5) < 0.01 || Math.abs(dansMesure - 1.5) < 0.01)) claquement(t, 0.85 * force);
          charleston(t + TEMPS / 2, Math.abs(dansMesure - 1.5) < 0.01, force);
          charleston(t + TEMPS / 4, false, 0.45 * force);
          basse(t + TEMPS / 2, accordA(t).basse, 0.2, force);
          if (arpege) {
            const a = accordA(t).arpege;
            [0, 1].forEach(k => pince(t + k * TEMPS / 2, a[(Math.round(t / TEMPS) * 2 + k) % 4], 0.55 * force, 0.2));
          }
        }
      };
      const finDomaines = Dm.recap !== null ? Dm.fin - 0.5 : Dm.fin;
      plein(Dm.debut, finDomaines);
      // Un accent d'accord à chaque nouvelle carte
      Dm.cartes.forEach((c, k) => { if (k > 0) accordA(c).arpege.forEach((m, i) => pince(c + i * 0.012, m, 0.7, 0.4)); });
      if (Dm.recap !== null) {
        accordA(Dm.recap).arpege.forEach((m, i) => pince(Dm.recap + i * 0.03, m + 12, 0.6, 0.6));
        montee(Dm.fin - 1.4, Dm.fin, 0.6);
      }
      // Pratique : le rythme se retire, puis revient
      const retour = grille(P.debut + (P.fin - P.debut) * 0.52);
      for (let t = grille(P.debut); t < P.fin - 0.01; t += TEMPS) {
        const dansMesure = (t % 2 + 2) % 2;
        const a = accordA(t);
        if (dansMesure < 0.01) { basse(t, a.basse, 1.7, 0.42); }
        // Des notes douces, en croches, sur l'accord
        clochette(t, a.arpege[(Math.round(t / TEMPS)) % 4] - 12, 0.55, 0.9);
        if (t >= retour) {
          if (dansMesure < 0.01 || Math.abs(dansMesure - 1) < 0.01) grosseCaisse(t, 0.75);
          charleston(t + TEMPS / 2, false, 0.6);
        }
        shaker(t + TEMPS / 4, 0.8); shaker(t + 3 * TEMPS / 4, 0.6);
      }
      const suivant = C ? C.debut : AP.debut;
      montee(suivant - 1.2, suivant, 0.85);
      roulement(suivant - 0.75, suivant, 0.6);
      // Parcours : un rythme posé
      if (C) {
        for (let t = grille(C.debut); t < C.fin - 0.01; t += TEMPS) {
          const dansMesure = (t % 2 + 2) % 2;
          grosseCaisse(t, 0.85);
          if (Math.abs(dansMesure - 1) < 0.01) claquement(t, 0.55);
          charleston(t + TEMPS / 2, false, 0.75);
          basse(t + TEMPS / 2, accordA(t).basse, 0.2, 0.85);
        }
        montee(C.fin - 1.1, C.fin, 0.8);
      }
      // Appel : impact, rythme, puis l'accord final qui sonne jusqu'au bout
      plein(AP.debut + 0.5, finRythme, { arpege: false, force: 0.9 });
      AP.mots.forEach((m, k) => { [62, 65, 69].forEach((n, i) => pince(m + i * 0.01, n + 12 + k * 2, 0.75, 0.45)); });
      const accordFinal = AP.bouton[1];
      FA.arpege.forEach((m, i) => pince(accordFinal + i * 0.04, m, 0.85, 0.9));
      FA.nappe.forEach(m => clochette(accordFinal, m, 0.45, 2.6));
      basse(accordFinal, FA.basse, duree - accordFinal - 0.3, 0.8);
      // Le dernier souffle : tout s'éteint sur les 0,6 dernières secondes
      maitre.gain.setValueAtTime(0.55, duree - 0.65);
      maitre.gain.linearRampToValueAtTime(0.0001, duree - 0.02);
    }

    // ========================================================== BRUITAGES ==
    if (partie === 'bruitages') {
      maitre.gain.value = 0.62;
      let sens = 1;
      for (const r of reperes) {
        const f = r.force || 1;
        switch (r.type) {
          case 'mot': tic(r.t, 0.8 * f, 1); break;
          case 'trait': scintille(r.t, r.duree || 0.45, f); break;
          case 'souffle': souffle(r.t, r.duree || 0.5, 0.9 * f, (sens = -sens)); break;
          case 'impact': impact(r.t, parle(r.t, r.t + 0.6) ? f * 0.45 : f); break;
          case 'balayage': scintille(r.t, r.duree || 0.45, 0.8 * f); souffle(r.t, (r.duree || 0.45) + 0.2, 0.4 * f, 1); break;
          case 'montee': montee(r.t, r.t + (r.duree || 0.8), 0.5 * f); break;
          case 'contour': tic(r.t, 0.55 * f, 1.6); tic(r.t + 0.09, 0.4 * f, 1.9); break;
          case 'eclat': scintille(r.t, 0.7, f); souffle(r.t - 0.2, 0.7, 0.5 * f, -1); break;
          case 'fenetre': souffle(r.t, r.duree || 0.6, 0.55 * f, (sens = -sens), true); break;
          case 'coupe': tic(r.t, 0.6 * f, 0.7); break;
          case 'noeud': carillon(r.t, [84, 88, 91][r.rang || 0], 0.9 * f, 1.1); break;
          case 'glisse': souffle(r.t, r.duree || 0.4, 0.5 * f, 1); break;
          case 'appui': appui(r.t, f); break;
          case 'bouton': carillon(r.t, 84, f, 1.8); carillon(r.t + 0.11, 88, 0.85 * f, 1.8); carillon(r.t + 0.22, 91, 0.7 * f, 2.2); break;
          default: break;
        }
      }
      maitre.gain.setValueAtTime(0.62, duree - 0.4);
      maitre.gain.linearRampToValueAtTime(0.0001, duree - 0.02);
    }

    const rendu = await ctx.startRendering();
    return enWav(rendu);
  };

  /** Une réverbération : du bruit stéréo qui s'éteint en `duree` secondes. */
  function impulsion(ctx, duree, pente, alea) {
    const n = Math.floor(FE * duree);
    const ir = ctx.createBuffer(2, n, FE);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (alea() * 2 - 1) * Math.pow(1 - i / n, pente);
    }
    return ir;
  }

  /** Le rendu → un WAV 16 bits stéréo, en base64. */
  function enWav(tampon) {
    const n = tampon.length;
    const g = tampon.getChannelData(0);
    const d = tampon.getChannelData(1);
    const octets = new ArrayBuffer(44 + n * 4);
    const v = new DataView(octets);
    const texte = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    texte(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); texte(8, 'WAVE');
    texte(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, FE, true); v.setUint32(28, FE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    texte(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) {
      v.setInt16(o, Math.max(-1, Math.min(1, g[i])) * 32767, true);
      v.setInt16(o + 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    }
    const tous = new Uint8Array(octets);
    let s = '';
    for (let i = 0; i < tous.length; i += 0x8000) s += String.fromCharCode.apply(null, tous.subarray(i, i + 0x8000));
    return btoa(s);
  }
})();

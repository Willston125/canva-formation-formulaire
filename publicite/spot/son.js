/* La bande-son du spot IMPACTALI : une musique de film, composée et synthétisée ici.
 *
 * Aucun échantillon emprunté : chaque son — nappes de cordes, piano, cuivres graves
 * (« braam »), impacts, montées, souffles, tambours, tic-tac, scintillements — est
 * fabriqué par synthèse, puis calculé hors temps réel (OfflineAudioContext) à
 * l'échantillon près. Les événements suivent les repères de l'image (REPERES dans
 * spot.html) : un changement de plan tombe toujours sur un son.
 *
 * Tonalité : ré mineur, qui s'éclaire en ré majeur au logo (l'espoir tenu).
 *   0 – 7,5 s    l'éveil : un bourdon, trois notes de piano, la tension monte
 *   7,5 s        le manifeste : impact, cuivres graves sur si bémol
 *   10 – 15 s    le formateur : la pulsation entre (cordes staccato, tic-tac)
 *   15 – 21 s    les 5 formations : un accord, un tambour, un souffle à chaque plan
 *   21 – 22,5 s  montée, aspiration
 *   22,5 – 25 s  la méthode : un impact par chiffre
 *   25 – 27,5 s  le certificat : le piano revient, scintillement
 *   27,5 – 30 s  le site : pédale de dominante, grande montée
 *   30 s         le logo : impact, cuivres et cordes en ré majeur, piano, résonance
 *
 * fabriquerBandeSon(duree, REPERES) rend un WAV 48 kHz stéréo 16 bits, en base64. */
(function () {
  'use strict';

  const FE = 48000;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function generateur(graine) {
    let s = (graine >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* Une salle de concert synthétique : un bruit qui décroît et s'assombrit. */
  function impulsion(ctx, duree, alea) {
    const n = Math.floor(FE * duree);
    const b = ctx.createBuffer(2, n, FE);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / FE;
        const enveloppe = t < 0.018 ? 0 : Math.pow(1 - t / duree, 2) * Math.exp(-t * 1.1);
        const k = 0.35 + 0.6 * Math.min(1, t / 1.8);
        lp = lp * k + (alea() * 2 - 1) * (1 - k);
        d[i] = lp * enveloppe;
      }
    }
    return b;
  }

  window.fabriquerBandeSon = async function (duree, R) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duree * FE), FE);
    const alea = generateur(20261014);

    const bruit = ctx.createBuffer(2, FE * 4, FE);
    for (let c = 0; c < 2; c++) { const d = bruit.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = alea() * 2 - 1; }

    // ------------------------------------------------------------ console ----
    const limiteur = ctx.createDynamicsCompressor();
    limiteur.threshold.value = -2.5; limiteur.knee.value = 0; limiteur.ratio.value = 20;
    limiteur.attack.value = 0.002; limiteur.release.value = 0.12;
    limiteur.connect(ctx.destination);
    const sortie = ctx.createGain();
    sortie.connect(limiteur);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 8; comp.ratio.value = 2.6;
    comp.attack.value = 0.012; comp.release.value = 0.3;
    comp.connect(sortie);
    const bus = ctx.createGain(); bus.gain.value = 0.85; bus.connect(comp);
    const salle = ctx.createConvolver(); salle.normalize = true; salle.buffer = impulsion(ctx, 4.2, alea);
    const retour = ctx.createGain(); retour.gain.value = 0.5; salle.connect(retour); retour.connect(comp);

    // Fondu de sortie : la résonance du dernier accord s'éteint avec l'image
    sortie.gain.setValueAtTime(1, duree - 1.9);
    sortie.gain.linearRampToValueAtTime(0, duree - 0.02);

    // ------------------------------------------------------------ outils ----
    const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const filtre = (type, f, q = 0.707) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const pan = p => { const s = ctx.createStereoPanner(); s.pan.value = p; return s; };
    const osc = (type, f, t, d) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + d); return o; };
    const souffleSource = (t, d) => { const s = ctx.createBufferSource(); s.buffer = bruit; s.loop = true; s.start(t, alea() * 3); s.stop(t + d); return s; };
    const saturation = k => {
      const w = ctx.createWaveShaper(), n = 4096, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
      w.curve = c; w.oversample = '4x'; return w;
    };
    const chaine = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
    const versBus = (n, reverb = 0) => { n.connect(bus); if (reverb > 0) { const e = gain(reverb); n.connect(e); e.connect(salle); } };
    const enveloppe = (p, t, points) => {
      p.setValueAtTime(points[0][1], t + points[0][0]);
      for (let i = 1; i < points.length; i++) {
        const [dt, v, exp] = points[i];
        if (exp) p.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + dt);
        else p.linearRampToValueAtTime(v, t + dt);
      }
    };

    // ------------------------------------------------------------ instruments ----

    /* Impact de bande-annonce : un corps grave qui plonge, un claquement, une queue de sous-graves. */
    function impact(t, force = 1) {
      const sat = saturation(2.2);
      const sortieImpact = gain(0.9 * force);
      chaine(sat, sortieImpact); versBus(sortieImpact, 0.28);
      const corps = osc('sine', 150, t, 2);
      corps.frequency.setValueAtTime(150, t);
      corps.frequency.exponentialRampToValueAtTime(40, t + 0.5);
      const gc = gain(0); enveloppe(gc.gain, t, [[0, 0], [0.004, 1], [1.8, 0.0001, true]]);
      chaine(corps, gc, sat);
      const sous = osc('sine', 36, t, 2.6);
      const gs = gain(0); enveloppe(gs.gain, t, [[0, 0], [0.02, 0.55 * force], [2.5, 0.0001, true]]);
      chaine(sous, gs); versBus(gs, 0);
      const coup = souffleSource(t, 0.6);
      const fc = filtre('bandpass', 1600, 0.7);
      const gk = gain(0); enveloppe(gk.gain, t, [[0, 0], [0.002, 0.55 * force], [0.35, 0.0001, true]]);
      chaine(coup, fc, gk); versBus(gk, 0.35);
      const sourd = souffleSource(t, 0.9);
      const fs = filtre('lowpass', 380, 0.8);
      const gd = gain(0); enveloppe(gd.gain, t, [[0, 0], [0.004, 0.9], [0.7, 0.0001, true]]);
      chaine(sourd, fs, gd, sat);
    }

    /* « Braam » : cuivres graves saturés dont le filtre s'ouvre puis se referme. */
    function braam(t, notes, duree, force = 1) {
      const f = filtre('lowpass', 100, 5);
      enveloppe(f.frequency, t, [[0, 100], [0.14, 1500 * force, true], [duree, 240, true]]);
      const sat = saturation(1.8);
      const g = gain(0);
      enveloppe(g.gain, t, [[0, 0], [0.04, 0.32 * force], [duree * 0.6, 0.22 * force], [duree + 1.2, 0.0001, true]]);
      chaine(f, sat, g); versBus(g, 0.5);
      notes.forEach(m => [-11, 0, 9].forEach(c => {
        const o = osc('sawtooth', hz(m), t, duree + 1.3);
        o.detune.value = c + (alea() - 0.5) * 4;
        o.connect(f);
      }));
    }

    /* Montée : bruit filtré qui s'ouvre, deux dents de scie qui grimpent, coupées net. */
    function montee(t0, t1, force = 1) {
      const d = t1 - t0;
      const s = souffleSource(t0, d + 0.05);
      const bp = filtre('bandpass', 250, 1.1);
      enveloppe(bp.frequency, t0, [[0, 250], [d, 7500, true]]);
      const g = gain(0); enveloppe(g.gain, t0, [[0, 0.0001], [d - 0.01, 0.42 * force, true], [d + 0.008, 0]]);
      chaine(s, bp, g); versBus(g, 0.25);
      [1, 2].forEach(k => {
        const o = osc('sawtooth', 70 * k, t0, d + 0.05);
        o.frequency.setValueAtTime(70 * k, t0);
        o.frequency.exponentialRampToValueAtTime(560 * k, t1);
        const hp = filtre('highpass', 160);
        const go = gain(0); enveloppe(go.gain, t0, [[0, 0.0001], [d - 0.01, 0.07 * force / k, true], [d + 0.008, 0]]);
        chaine(o, hp, go); versBus(go, 0.2);
      });
    }

    /* Aspiration : une cymbale à l'envers, coupée sur le choc. */
    function aspiration(t0, t1, force = 1) {
      const d = t1 - t0;
      const s = souffleSource(t0, d + 0.02);
      const hp = filtre('highpass', 2600, 0.7);
      const g = gain(0); enveloppe(g.gain, t0, [[0, 0.0001], [d - 0.005, 0.5 * force, true], [d + 0.004, 0]]);
      chaine(s, hp, g); versBus(g, 0.1);
    }

    /* Souffle : un passage d'air qui traverse l'image de gauche à droite. */
    function souffle(t, d, montant = true, force = 1) {
      const s = souffleSource(t, d + 0.1);
      const bp = filtre('bandpass', montant ? 320 : 2800, 1.4);
      enveloppe(bp.frequency, t, [[0, montant ? 320 : 2800], [d, montant ? 3200 : 260, true]]);
      const g = gain(0); enveloppe(g.gain, t, [[0, 0], [d * 0.55, 0.42 * force], [d, 0]]);
      const p = pan(-0.85); enveloppe(p.pan, t, [[0, -0.85], [d, 0.85]]);
      chaine(s, bp, g, p); versBus(p, 0.3);
    }

    /* Piano : partiels légèrement inharmoniques, chacun avec sa décroissance, et le marteau. */
    const busPiano = filtre('lowpass', 5200, 0.5);
    versBus(busPiano, 0.55);
    function piano(t, m, v = 0.5) {
      const f0 = hz(m);
      const p = pan(Math.max(-0.6, Math.min(0.6, (m - 64) / 30)));
      p.connect(busPiano);
      for (let n = 1; n <= 9; n++) {
        const f = n * f0 * Math.sqrt(1 + 0.0004 * n * n);
        if (f > 11000) break;
        const a = (v * 0.3) / Math.pow(n, 1.3) * (n === 2 ? 0.75 : 1);
        const o = osc('sine', f, t, 6);
        const g = gain(0);
        enveloppe(g.gain, t, [[0, 0], [0.004, a], [0.28 / Math.pow(n, 0.25), a * 0.35, true], [4.8 / Math.pow(n, 0.55), 0.0001, true]]);
        chaine(o, g, p);
      }
      const m1 = souffleSource(t, 0.05);
      const hp = filtre('highpass', 1800);
      const gm = gain(0); enveloppe(gm.gain, t, [[0, 0], [0.002, v * 0.05], [0.035, 0.0001, true]]);
      chaine(m1, hp, gm, p);
    }

    /* Nappe de cordes : dents de scie désaccordées, filtrées, vibrato lent. */
    function nappe(t0, t1, notes, v = 0.06, attaque = 1.1) {
      const f = filtre('lowpass', 1500, 0.4);
      const g = gain(0); enveloppe(g.gain, t0, [[0, 0], [attaque, v], [Math.max(attaque, t1 - t0), v], [t1 - t0 + 1.4, 0]]);
      chaine(f, g); versBus(g, 0.7);
      const lfo = osc('sine', 4.6, t0, t1 - t0 + 1.5);
      const prof = gain(5); lfo.connect(prof);
      notes.forEach((m, i) => [-8, 7].forEach(c => {
        const o = osc('sawtooth', hz(m), t0, t1 - t0 + 1.5);
        o.detune.value = c + i * 1.5;
        prof.connect(o.detune);
        const pp = pan(c < 0 ? -0.35 : 0.35);
        chaine(o, pp, f);
      }));
    }

    /* Bourdon grave. */
    function bourdon(t0, t1, notes, v = 0.12) {
      const f = filtre('lowpass', 260, 0.6);
      const g = gain(0); enveloppe(g.gain, t0, [[0, 0], [2.2, v], [Math.max(2.2, t1 - t0 - 0.05), v], [t1 - t0, 0]]);
      chaine(f, g); versBus(g, 0.2);
      notes.forEach(m => [-4, 4].forEach(c => { const o = osc('triangle', hz(m), t0, t1 - t0 + 0.1); o.detune.value = c; o.connect(f); }));
      const r = souffleSource(t0, t1 - t0);
      const fr = filtre('lowpass', 110, 0.7);
      const gr = gain(0); enveloppe(gr.gain, t0, [[0, 0], [2.5, v * 0.9], [Math.max(2.5, t1 - t0 - 0.05), v * 0.9], [t1 - t0, 0]]);
      chaine(r, fr, gr); versBus(gr, 0);
    }

    /* Cordes staccato : la pulsation (croches). */
    function ostinato(t0, t1, racine, v = 0.08, crescendo = 1) {
      const croche = R.temps / 2;
      const motif = [0, 0, 12, 0, 7, 0, 12, 7];
      for (let i = 0, t = t0; t < t1 - 0.01; i++, t = t0 + i * croche) {
        const k = 1 + (crescendo - 1) * ((t - t0) / Math.max(0.01, t1 - t0));
        const m = racine + motif[i % 8];
        const accent = i % 4 === 0 ? 1.25 : 1;
        const f = filtre('lowpass', 2200, 1.6);
        enveloppe(f.frequency, t, [[0, 2400], [0.16, 480, true]]);
        const g = gain(0); enveloppe(g.gain, t, [[0, 0], [0.006, v * accent * k], [0.21, 0.0001, true]]);
        chaine(f, g); versBus(g, 0.18);
        [-6, 6].forEach(c => { const o = osc('sawtooth', hz(m), t, 0.3); o.detune.value = c; o.connect(f); });
        const sous = osc('sine', hz(m - 12), t, 0.3);
        const gs = gain(0); enveloppe(gs.gain, t, [[0, 0], [0.006, v * 0.9 * k], [0.24, 0.0001, true]]);
        chaine(sous, gs); versBus(gs, 0);
      }
    }

    /* Tic-tac : bruit très aigu, très court (doubles croches). */
    function tictac(t0, t1, v0 = 0.03, v1 = v0, pas = R.temps / 4) {
      for (let i = 0, t = t0; t < t1 - 0.005; i++, t = t0 + i * pas) {
        const v = v0 + (v1 - v0) * ((t - t0) / Math.max(0.01, t1 - t0));
        const s = souffleSource(t, 0.06);
        const hp = filtre('highpass', 6800, 0.9);
        const g = gain(0); enveloppe(g.gain, t, [[0, 0], [0.001, v * (i % 4 === 0 ? 1.4 : 1)], [0.035, 0.0001, true]]);
        const p = pan(i % 2 ? 0.28 : -0.28);
        chaine(s, hp, g, p); versBus(p, 0.08);
      }
    }

    /* Tambour (type taiko) et caisse claire. */
    function tambour(t, v = 0.8) {
      const o = osc('sine', 120, t, 1);
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.28);
      const g = gain(0); enveloppe(g.gain, t, [[0, 0], [0.003, v], [0.75, 0.0001, true]]);
      chaine(o, g); versBus(g, 0.35);
      const s = souffleSource(t, 0.3);
      const lp = filtre('lowpass', 700, 0.8);
      const gs = gain(0); enveloppe(gs.gain, t, [[0, 0], [0.002, v * 0.45], [0.18, 0.0001, true]]);
      chaine(s, lp, gs); versBus(gs, 0.3);
    }
    function caisse(t, v = 0.4) {
      const s = souffleSource(t, 0.3);
      const bp = filtre('bandpass', 1900, 0.6);
      const g = gain(0); enveloppe(g.gain, t, [[0, 0], [0.002, v], [0.2, 0.0001, true]]);
      chaine(s, bp, g); versBus(g, 0.4);
      const o = osc('triangle', 210, t, 0.2);
      const go = gain(0); enveloppe(go.gain, t, [[0, 0], [0.002, v * 0.6], [0.09, 0.0001, true]]);
      chaine(o, go); versBus(go, 0.2);
    }
    function roulement(t0, t1, v0 = 0.3, v1 = 0.9) {
      let t = t0, pas = R.temps / 2;
      while (t < t1 - 0.02) {
        const k = (t - t0) / (t1 - t0);
        tambour(t, v0 + (v1 - v0) * k);
        if (k > 0.45) caisse(t + pas / 2, 0.15 + 0.35 * k);
        pas = k < 0.4 ? R.temps / 2 : k < 0.75 ? R.temps / 4 : R.temps / 8;
        t += pas;
      }
    }

    /* Scintillement : clochettes aiguës, presque noyées dans la salle. */
    function scintille(t, v = 0.2) {
      [86, 93, 98, 105].forEach((m, i) => {
        const o = osc('sine', hz(m), t + i * 0.035, 2.2);
        const mod = osc('sine', hz(m) * 3.5, t + i * 0.035, 2.2);
        const pm = gain(hz(m) * 0.6); mod.connect(pm); pm.connect(o.frequency);
        const g = gain(0); enveloppe(g.gain, t + i * 0.035, [[0, 0], [0.004, v * 0.12], [1.8, 0.0001, true]]);
        const p = pan((i - 1.5) * 0.35);
        chaine(o, g, p); versBus(p, 0.8);
      });
    }

    /* Clic : le doigt sur l'écran, la souris sur le bouton. */
    function clic(t, v = 0.5) {
      const o = osc('sine', 2100, t, 0.03);
      const g = gain(0); enveloppe(g.gain, t, [[0, 0], [0.001, v * 0.5], [0.018, 0.0001, true]]);
      chaine(o, g); versBus(g, 0.15);
      const s = souffleSource(t, 0.03);
      const hp = filtre('highpass', 3000);
      const gs = gain(0); enveloppe(gs.gain, t, [[0, 0], [0.001, v * 0.35], [0.012, 0.0001, true]]);
      chaine(s, hp, gs); versBus(gs, 0.1);
    }

    // ------------------------------------------------------------ partition ----
    const A = R; // les repères de l'image
    const ACC = {
      Dm: { b: 38, n: [50, 53, 57, 62] }, Bb: { b: 34, n: [50, 53, 58, 62] }, F: { b: 41, n: [48, 53, 57, 60] },
      C: { b: 36, n: [48, 52, 55, 60] }, A: { b: 33, n: [49, 52, 57, 61] }, D: { b: 38, n: [50, 54, 57, 62, 66] }
    };

    // 0 – 7,5 s : l'éveil
    bourdon(0, A.aspiration[1], [26, 38, 45], 0.075);
    scintille(A.eveil, 0.16); impact(A.eveil, 0.22);
    piano(A.ligne1, 69, 0.42);
    impact(A.talent, 0.32); souffle(A.talent - 0.35, 0.9, true, 0.22);
    piano(A.talent + 0.04, 74, 0.5); piano(A.talent + 0.04, 50, 0.3);
    nappe(A.talent, A.aspiration[1], ACC.Dm.n, 0.035, 2.2);
    piano(A.methode, 64, 0.34);
    piano(A.methode2, 65, 0.42); piano(A.methode2, 69, 0.36);
    montee(A.methode2, A.aspiration[1], 0.75);
    aspiration(A.aspiration[0], A.aspiration[1], 0.9);

    // 7,5 s : le manifeste
    impact(A.choc1, 1); braam(A.choc1, [34, 46, 53], 2.3, 1);
    nappe(A.choc1, A.formateur, ACC.Bb.n, 0.06, 0.4);
    scintille(A.eclat, 0.18);
    souffle(A.formateur - 0.42, 0.5, false, 0.3);

    // 10 – 15 s : le formateur
    impact(A.formateur, 0.62);
    nappe(A.formateur, A.formateur + 2.5, ACC.F.n, 0.06, 0.6);
    nappe(A.formateur + 2.5, A.fouet + 0.3, ACC.C.n, 0.06, 0.8);
    ostinato(A.formateur, A.formateur + 2.5, ACC.F.b, 0.085, 1.15);
    ostinato(A.formateur + 2.5, A.fouet, ACC.C.b, 0.095, 1.25);
    // un battement de coeur sous le portrait, qui s'affirme jusqu'au fouet
    for (let t = A.formateur + 2 * A.temps; t < A.fouet - 0.1; t += A.temps) tambour(t, 0.3 + 0.25 * (t - A.formateur) / (A.fouet - A.formateur));
    tictac(A.formateur + 0.6, A.fouet, 0.022, 0.045);
    A.credits.forEach((t, i) => piano(t, [79, 76, 72][i], 0.22));
    souffle(A.fouet - 0.05, 0.42, true, 0.55);

    // 15 – 21,25 s : les 5 formations
    const accFormations = ['Dm', 'Bb', 'F', 'C', 'Dm'];
    A.formations.forEach((t, i) => {
      const acc = ACC[accFormations[i]];
      impact(t, i === 0 ? 0.75 : 0.5); tambour(t, 0.85);
      if (i > 0) souffle(t - 0.2, 0.36, i % 2 === 0, 0.32);
      caisse(t + A.temps, 0.32);
      tambour(t + A.temps * 1.5, 0.45);
      nappe(t, t + 1.25, acc.n, 0.065, 0.12);
      ostinato(t, t + 1.25, acc.b, 0.085);
    });
    tictac(A.formations[0], A.choisir, 0.04, 0.05);

    // 21,25 – 22,5 s : « Choisissez la vôtre », montée
    nappe(A.choisir, A.choc2, ACC.A.n, 0.07, 0.3);
    ostinato(A.choisir, A.choc2 - 0.03, ACC.A.b, 0.08, 1.5);
    montee(A.choisir, A.choc2 - 0.03, 0.9);
    roulement(A.choisir + 0.5, A.choc2 - 0.04, 0.3, 0.85);
    aspiration(A.choc2 - 0.55, A.choc2 - 0.03, 0.85);

    // 22,5 – 25 s : la méthode
    impact(A.choc2, 1); braam(A.choc2, [26, 38, 45], 2.0, 0.9);
    nappe(A.choc2, A.certificat, ACC.Dm.n, 0.055, 0.3);
    A.methodePas.forEach((t, i) => { if (i > 0) { impact(t, 0.45); tambour(t, 0.7); } tictac(t, t + A.temps, 0.03, 0.03, A.temps / 2); });

    // 25 – 27,5 s : le certificat
    souffle(A.certificat - 0.3, 0.6, true, 0.25);
    [62, 65, 70, 74].forEach((m, i) => piano(A.certificat + i * 0.22, m, 0.34));
    scintille(A.certificat + 0.6, 0.24);
    nappe(A.certificat, A.certificat + 1.25, ACC.Bb.n, 0.05, 0.5);
    nappe(A.certificat + 1.25, A.site, ACC.C.n, 0.055, 0.5);
    piano(A.certificat + 1.25, 76, 0.28); piano(A.certificat + 1.25, 67, 0.22);
    ostinato(A.certificat + 1.25, A.site, ACC.C.b, 0.05, 1.3);

    // 27,5 – 30 s : le site, pédale de dominante
    souffle(A.site - 0.25, 0.5, false, 0.3);
    nappe(A.site, A.final, ACC.A.n, 0.065, 0.4);
    ostinato(A.site, A.final - 0.03, ACC.A.b, 0.07, 1.8);
    tictac(A.site, A.final - 0.03, 0.035, 0.07);
    clic(A.tap, 0.6);
    montee(A.monteeFinale[0], A.final - 0.03, 1);
    roulement(A.final - 1.2, A.final - 0.04, 0.35, 1);
    aspiration(A.final - 0.7, A.final - 0.03, 1);

    // 30 – 35 s : le logo, ré majeur
    impact(A.final, 1.15); braam(A.final, [26, 38, 50, 54, 57], 3.4, 1.05);
    nappe(A.final, duree, ACC.D.n, 0.09, 0.25);
    bourdon(A.final, duree, [26, 38], 0.08);
    scintille(A.final + 0.15, 0.3);
    [[A.slogan, 62], [A.slogan + 0.22, 66], [A.slogan + 0.44, 69], [A.url, 74], [A.hashtag, 78], [A.clic, 81]].forEach(([t, m], i) => piano(t, m, 0.42 - i * 0.03));
    scintille(A.url, 0.2); scintille(A.hashtag, 0.14);
    clic(A.clic, 0.5);

    // ------------------------------------------------------------ rendu ----
    const rendu = await ctx.startRendering();
    const L = rendu.getChannelData(0), Rr = rendu.getChannelData(1);
    let crete = 0;
    for (let i = 0; i < L.length; i++) crete = Math.max(crete, Math.abs(L[i]), Math.abs(Rr[i]));
    const k = crete > 0 ? 0.92 / crete : 1;
    const n = L.length;
    const tampon = new ArrayBuffer(44 + n * 4);
    const v = new DataView(tampon);
    const ecrire = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ecrire(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); ecrire(8, 'WAVE'); ecrire(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, FE, true);
    v.setUint32(28, FE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); ecrire(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true);
      v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, Rr[i] * k)) * 32767, true);
    }
    const octets = new Uint8Array(tampon);
    let binaire = '';
    for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(binaire);
  };
})();

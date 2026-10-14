/* La musique de la publicité, composée et synthétisée dans le navigateur.
 *
 * Rien n'est emprunté : chaque son — grosse caisse, claquements, charleston,
 * basse, nappes, arpèges, souffles, impacts — est fabriqué ici, puis calculé
 * hors temps réel (OfflineAudioContext), à l'échantillon près. Le morceau
 * suit le montage de video.html : 120 battements par minute, une mesure
 * toutes les 2 secondes, et chaque changement de scène tombe sur un temps.
 *
 *    0 –  4 s  montée : une nappe, trois chocs sur TALENT, MÉTHODE, COMPÉTENCES, puis le roulement
 *    4 s       le logo : impact, le rythme entre
 *    8 – 18 s  les affiches : un souffle à chaque passage, un arpège léger par-dessus
 *   18 – 22 s  le format : une note pour chaque tuile
 *   22 – 26 s  le formateur : le rythme respire, puis remonte
 *   26 – 30 s  l'appel : impact, le rythme reprend, l'adresse s'écrit, accord final
 *
 * `fabriquerMusique(duree)` rend un fichier WAV (48 kHz, stéréo, 16 bits)
 * encodé en base64 : rendre.js l'écrit, ffmpeg le mixe à −14 LUFS. */
(function () {
  'use strict';

  const FE = 48000;
  const TEMPS = 0.5;                       // 120 battements par minute
  const note = midi => 440 * Math.pow(2, (midi - 69) / 12);

  // Accords : la basse, puis la nappe (voix proches les unes des autres)
  const ACCORDS = {
    Am: { basse: 45, nappe: [57, 60, 64, 69], arpege: [69, 72, 76, 81] },
    F: { basse: 41, nappe: [57, 60, 65, 69], arpege: [65, 69, 72, 77] },
    C: { basse: 48, nappe: [55, 60, 64, 67], arpege: [67, 72, 76, 79] },
    G: { basse: 43, nappe: [55, 59, 62, 67], arpege: [67, 71, 74, 79] }
  };
  // Une mesure (2 s) par accord, à partir de l'instant indiqué
  const GRILLE = [
    [0, 'Am'], [2, 'F'],
    [4, 'Am'], [6, 'F'], [8, 'C'], [10, 'G'], [12, 'Am'], [14, 'F'], [16, 'C'], [18, 'G'],
    [20, 'Am'], [22, 'F'], [24, 'C'], [26, 'F'], [28, 'G']
  ];

  window.fabriquerMusique = async function (duree) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duree * FE), FE);

    // --------------------------------------------------- la console ----

    // Un limiteur en bout de chaîne : aucune crête ne dépasse, rien ne sature
    const limiteur = ctx.createDynamicsCompressor();
    limiteur.threshold.value = -4;
    limiteur.knee.value = 0;
    limiteur.ratio.value = 20;
    limiteur.attack.value = 0.001;
    limiteur.release.value = 0.08;
    limiteur.connect(ctx.destination);

    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -16;
    compresseur.knee.value = 10;
    compresseur.ratio.value = 3;
    compresseur.attack.value = 0.006;
    compresseur.release.value = 0.14;
    compresseur.connect(limiteur);

    const maitre = ctx.createGain();
    maitre.gain.value = 0.6;
    maitre.connect(compresseur);

    // Réverbération : une réponse fabriquée, du bruit qui s'éteint
    const reverb = ctx.createConvolver();
    reverb.buffer = impulsion(ctx, 2.4, 3.2);
    const retourReverb = ctx.createGain();
    retourReverb.gain.value = 0.28;
    reverb.connect(retourReverb);
    retourReverb.connect(maitre);

    // Écho rythmé (une croche pointée), pour l'arpège et les notes
    const echo = ctx.createDelay(1);
    echo.delayTime.value = TEMPS * 0.75;
    const reinjection = ctx.createGain();
    reinjection.gain.value = 0.32;
    const filtreEcho = ctx.createBiquadFilter();
    filtreEcho.type = 'lowpass';
    filtreEcho.frequency.value = 3200;
    echo.connect(filtreEcho);
    filtreEcho.connect(reinjection);
    reinjection.connect(echo);
    const retourEcho = ctx.createGain();
    retourEcho.gain.value = 0.35;
    filtreEcho.connect(retourEcho);
    retourEcho.connect(maitre);

    /* Le « pompage » : nappe et basse s'effacent à chaque grosse caisse et
       reviennent aussitôt. C'est ce qui fait respirer un morceau électronique. */
    const pompe = ctx.createGain();
    pompe.connect(maitre);

    const bruit = ctx.createBuffer(2, FE * 2, FE);
    for (let c = 0; c < 2; c++) {
      const d = bruit.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    // ------------------------------------------------- les instruments ----

    function enveloppe(g, t, crete, attaque, chute, fin = 0.0001) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(crete, t + attaque);
      g.gain.exponentialRampToValueAtTime(fin, t + attaque + chute);
    }

    function souffleBruit(t, duree, filtres, crete, vers, { attaque = 0.002, pan = 0 } = {}) {
      const src = ctx.createBufferSource();
      src.buffer = bruit;
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
      enveloppe(g, t, crete, attaque, duree);
      noeud.connect(g);
      let sortie = g;
      if (pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        sortie = p;
      }
      (Array.isArray(vers) ? vers : [vers]).forEach(v => sortie.connect(v));
      src.loop = true;
      src.start(t, Math.random() * 1.5);
      src.stop(t + attaque + duree + 0.05);
    }

    function grosseCaisse(t, force = 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(165, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.1);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.38);
      const g = ctx.createGain();
      enveloppe(g, t, 0.95 * force, 0.003, 0.42);
      o.connect(g);
      g.connect(maitre);
      o.start(t);
      o.stop(t + 0.5);
      // L'attaque, qui fait entendre la grosse caisse même sur un téléphone
      souffleBruit(t, 0.014, [{ type: 'highpass', f: 2200 }], 0.22 * force, maitre);
      // Le pompage de la nappe et de la basse
      pompe.gain.setValueAtTime(0.28, t);
      pompe.gain.setTargetAtTime(1, t + 0.03, 0.075);
    }

    function claquement(t, force = 1) {
      [0, 0.011, 0.023].forEach(d => souffleBruit(t + d, 0.03, [{ type: 'bandpass', f: 1450, q: 0.9 }], 0.42 * force, [maitre, reverb]));
      souffleBruit(t + 0.03, 0.17, [{ type: 'bandpass', f: 1300, q: 0.7 }], 0.2 * force, [maitre, reverb]);
    }

    function charleston(t, ouvert = false, force = 1) {
      souffleBruit(t, ouvert ? 0.24 : 0.045, [{ type: 'highpass', f: 7600 }, { type: 'peaking', f: 10000, q: 1 }],
        (ouvert ? 0.1 : 0.13) * force, maitre, { pan: ouvert ? 0.15 : -0.12 });
    }

    function basse(t, midi, duree = 0.2) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.Q.value = 3;
      filtre.frequency.setValueAtTime(1300, t);
      filtre.frequency.exponentialRampToValueAtTime(340, t + 0.16);
      const g = ctx.createGain();
      enveloppe(g, t, 0.24, 0.006, duree);
      ['sawtooth', 'square'].forEach((type, k) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = note(midi);
        o.detune.value = k ? -7 : 7;
        o.connect(filtre);
        o.start(t);
        o.stop(t + duree + 0.05);
      });
      filtre.connect(g);
      g.connect(pompe);
    }

    function nappe(debut, fin, accord, force = 1, coupure = 1500) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.frequency.value = coupure;
      filtre.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, debut);
      g.gain.exponentialRampToValueAtTime(0.034 * force, debut + 0.25);
      g.gain.setValueAtTime(0.034 * force, Math.max(debut + 0.25, fin - 0.12));
      g.gain.exponentialRampToValueAtTime(0.0001, fin + 0.35);
      ACCORDS[accord].nappe.forEach(midi => {
        [-8, 8].forEach(desaccord => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = note(midi);
          o.detune.value = desaccord;
          o.connect(filtre);
          o.start(debut);
          o.stop(fin + 0.4);
        });
      });
      filtre.connect(g);
      g.connect(pompe);
      g.connect(reverb);
    }

    function pince(t, midi, force = 1, duree = 0.28) {
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.Q.value = 2;
      filtre.frequency.setValueAtTime(4200, t);
      filtre.frequency.exponentialRampToValueAtTime(700, t + duree);
      const g = ctx.createGain();
      enveloppe(g, t, 0.11 * force, 0.004, duree);
      ['triangle', 'sawtooth'].forEach((type, k) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = note(midi);
        o.detune.value = k ? 4 : 0;
        o.connect(filtre);
        o.start(t);
        o.stop(t + duree + 0.05);
      });
      filtre.connect(g);
      g.connect(maitre);
      g.connect(echo);
      g.connect(reverb);
    }

    function note_courte(t, midi, force = 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(note(midi) * 1.02, t);
      o.frequency.exponentialRampToValueAtTime(note(midi), t + 0.03);
      const g = ctx.createGain();
      enveloppe(g, t, 0.22 * force, 0.003, 0.22);
      o.connect(g);
      g.connect(maitre);
      g.connect(echo);
      g.connect(reverb);
      o.start(t);
      o.stop(t + 0.3);
    }

    function montee(debut, fin, force = 1) {
      // Du bruit dont le filtre s'ouvre, et une note qui grimpe
      const src = ctx.createBufferSource();
      src.buffer = bruit;
      src.loop = true;
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'bandpass';
      filtre.Q.value = 1.4;
      filtre.frequency.setValueAtTime(350, debut);
      filtre.frequency.exponentialRampToValueAtTime(7500, fin);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, debut);
      g.gain.exponentialRampToValueAtTime(0.2 * force, fin - 0.02);
      g.gain.linearRampToValueAtTime(0.0001, fin);
      src.connect(filtre);
      filtre.connect(g);
      g.connect(maitre);
      g.connect(reverb);
      src.start(debut);
      src.stop(fin + 0.02);

      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(note(45), debut);
      o.frequency.exponentialRampToValueAtTime(note(81), fin);
      const fo = ctx.createBiquadFilter();
      fo.type = 'lowpass';
      fo.frequency.setValueAtTime(400, debut);
      fo.frequency.exponentialRampToValueAtTime(5000, fin);
      const go = ctx.createGain();
      go.gain.setValueAtTime(0.0001, debut);
      go.gain.exponentialRampToValueAtTime(0.05 * force, fin - 0.02);
      go.gain.linearRampToValueAtTime(0.0001, fin);
      o.connect(fo);
      fo.connect(go);
      go.connect(maitre);
      o.start(debut);
      o.stop(fin + 0.02);
    }

    function impact(t, force = 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const g = ctx.createGain();
      enveloppe(g, t, 0.85 * force, 0.004, 1.5);
      o.connect(g);
      g.connect(maitre);
      o.start(t);
      o.stop(t + 1.6);
      souffleBruit(t, 0.55, [{ type: 'lowpass', f: 1600 }], 0.5 * force, [maitre, reverb]);
      souffleBruit(t, 1.2, [{ type: 'bandpass', f: 600, q: 0.5 }], 0.18 * force, reverb);
      pompe.gain.setValueAtTime(0.2, t);
      pompe.gain.setTargetAtTime(1, t + 0.05, 0.18);
    }

    function souffle(t, duree = 0.5, force = 1, sens = 1) {
      const src = ctx.createBufferSource();
      src.buffer = bruit;
      src.loop = true;
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'bandpass';
      filtre.Q.value = 1.1;
      filtre.frequency.setValueAtTime(320, t);
      filtre.frequency.exponentialRampToValueAtTime(2600, t + duree * 0.6);
      filtre.frequency.exponentialRampToValueAtTime(500, t + duree);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * force, t + duree * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.7 * sens, t);
      p.pan.linearRampToValueAtTime(0.7 * sens, t + duree);
      src.connect(filtre);
      filtre.connect(g);
      g.connect(p);
      p.connect(maitre);
      p.connect(reverb);
      src.start(t, Math.random());
      src.stop(t + duree + 0.02);
    }

    function clic(t) {
      souffleBruit(t, 0.012, [{ type: 'highpass', f: 3500 }], 0.09, maitre, { pan: (Math.random() - 0.5) * 0.4 });
    }

    // ----------------------------------------------------- l'arrangement ----

    const accordA = t => { let a = 'Am'; for (const [d, n] of GRILLE) if (t >= d) a = n; return a; };

    // Les nappes : douces pendant la montée, pleines ensuite
    GRILLE.forEach(([d, nom], i) => {
      const fin = i + 1 < GRILLE.length ? GRILLE[i + 1][0] : 29.5;
      const intro = d < 4;
      nappe(d, fin, nom, intro ? 0.75 : 1, intro ? 700 + d * 250 : 1600);
    });

    // 0 – 4 s : trois chocs sur l'équation, puis la montée et le roulement
    [0.42, 1.45].forEach(t => { grosseCaisse(t, 0.8); claquement(t, 0.6); });
    grosseCaisse(2.55, 1);
    impact(2.55, 0.55);
    montee(2.6, 3.92, 0.9);
    for (let t = 3.0, k = 0; t < 3.9; k++) {
      claquement(t, 0.18 + k * 0.05);
      t += t < 3.5 ? 0.125 : 0.0625;
    }

    // 4 s : le logo — impact, et le rythme entre
    impact(4.0, 1);

    const groove = (debut, fin, { claps = true, hats = true } = {}) => {
      for (let t = debut; t < fin - 1e-6; t += TEMPS) {
        const dansMesure = ((t - 4) % 2 + 2) % 2;
        grosseCaisse(t, 1);
        if (claps && Math.abs(dansMesure - 0.5) < 1e-6 || claps && Math.abs(dansMesure - 1.5) < 1e-6) claquement(t, 0.9);
        if (hats) charleston(t + TEMPS / 2, Math.abs(dansMesure - 1.5) < 1e-6);
        basse(t + TEMPS / 2, ACCORDS[accordA(t)].basse);
      }
    };
    groove(4, 22);
    // 22 – 24 s : le formateur — le rythme respire (ni claquements ni charleston)
    groove(22, 24, { claps: false, hats: false });
    groove(24, 25.5);
    montee(24.6, 25.98, 1);
    for (let t = 25.0, k = 0; t < 25.95; k++) {
      claquement(t, 0.2 + k * 0.05);
      t += t < 25.5 ? 0.125 : 0.0625;
    }

    // 8 – 18 s : un arpège léger sur les affiches, un souffle à chaque passage
    for (let t = 8; t < 18 - 1e-6; t += TEMPS / 2) {
      const a = ACCORDS[accordA(t)].arpege;
      const k = Math.round((t - 8) / (TEMPS / 2));
      pince(t, a[[0, 2, 1, 3, 2, 1, 3, 2][k % 8]], 0.8);
    }
    souffle(7.45, 0.55, 1, 1);
    [9.55, 11.55, 13.55, 15.55].forEach((t, i) => souffle(t, 0.55, 0.9, i % 2 ? -1 : 1));
    souffle(17.4, 0.55, 1, -1);

    // 18 – 22 s : une note par tuile, en montant
    [[18.5, 76], [18.8, 79], [19.1, 81], [19.4, 84]].forEach(([t, m]) => note_courte(t, m));
    [[19.9, 72], [20.2, 76]].forEach(([t, m]) => note_courte(t, m, 0.7));

    // 22 s : le formateur
    souffle(21.25, 0.6, 1, 1);
    impact(21.75, 0.45);

    // 26 – 30 s : l'appel
    impact(26.0, 1);
    groove(26, 29.5);
    // L'adresse qui s'écrit : un clic par lettre
    for (let i = 0; i < 14; i++) clic(28.0 + i * (0.75 / 14));
    // L'accord final, qui sonne jusqu'au bout
    impact(29.5, 0.8);
    nappe(29.5, 29.95, 'C', 1.4, 2400);
    ACCORDS.C.arpege.forEach((m, k) => pince(29.5 + k * 0.03, m, 0.9, 0.5));
    grosseCaisse(29.5, 1);
    claquement(29.5, 1);

    // Le dernier quart de seconde s'éteint, pour une boucle propre
    maitre.gain.setValueAtTime(0.6, duree - 0.22);
    maitre.gain.linearRampToValueAtTime(0.0001, duree - 0.01);

    const rendu = await ctx.startRendering();
    return enWav(rendu);
  };

  /** Une réverbération : du bruit stéréo qui s'éteint en `duree` secondes. */
  function impulsion(ctx, duree, pente) {
    const n = Math.floor(FE * duree);
    const ir = ctx.createBuffer(2, n, FE);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, pente);
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
    const ecrireTexte = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ecrireTexte(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); ecrireTexte(8, 'WAVE');
    ecrireTexte(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, FE, true); v.setUint32(28, FE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    ecrireTexte(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) {
      v.setInt16(o, Math.max(-1, Math.min(1, g[i])) * 32767, true);
      v.setInt16(o + 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    }
    const tous = new Uint8Array(octets);
    let texte = '';
    for (let i = 0; i < tous.length; i += 0x8000) texte += String.fromCharCode.apply(null, tous.subarray(i, i + 0x8000));
    return btoa(texte);
  }
})();

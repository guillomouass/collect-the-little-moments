/*
 * Audio — everything is synthesized with WebAudio, so there are no files to
 * load or lose. Music is a soft generative music-box lullaby in F major that
 * is scheduled from the main game loop (no second timer loop).
 */
(function () {
  'use strict';
  const LM = window.LM;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Fmaj9 · Dm7 · B♭maj7 · C(add9)
  const CHORDS = [
    { bass: 41, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76, 79, 77] },
    { bass: 38, pad: [50, 57, 60, 65], arp: [62, 65, 69, 72, 74, 77] },
    { bass: 46, pad: [50, 53, 57, 62], arp: [62, 65, 69, 70, 74, 77] },
    { bass: 48, pad: [52, 55, 60, 62], arp: [64, 67, 72, 74, 76, 79] }
  ];
  const ARP = [0, 2, 1, 3, 2, 4, 3, 1];
  // A gentle bell melody used in the romantic part (per bar: [step, note]).
  const MELODY = [
    [[0, 81], [3, 79], [6, 77]],
    [[0, 77], [4, 76], [6, 74]],
    [[0, 74], [3, 77], [6, 81]],
    [[0, 79], [4, 76]]
  ];

  const MODES = {
    menu: { bpm: 76, arpDensity: 0.55, pad: 0.03, bass: 0.045, melody: false, shaker: false, bright: 0 },
    play: { bpm: 84, arpDensity: 0.8, pad: 0.026, bass: 0.05, melody: false, shaker: true, bright: 0 },
    romantic: { bpm: 68, arpDensity: 0.5, pad: 0.036, bass: 0.04, melody: true, shaker: false, bright: 0 },
    celebrate: { bpm: 96, arpDensity: 1, pad: 0.03, bass: 0.055, melody: true, shaker: true, bright: 12 }
  };

  class AudioEngine {
    constructor(enabled) {
      this.enabled = enabled;
      this.ctx = null;
      this.mode = 'menu';
      this.pendingMode = null;
      this.step = 0;
      this.bar = 0;
      this.nextTime = 0;
      this.musicLevel = 1;
      this.rand = LM.U.rng(1234);
    }

    /** Must be called from a user gesture (browser autoplay rules). */
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = new AC());
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 3;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.value = this.enabled ? 0.9 : 0;
        this.master.connect(comp);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0.6;
        this.musicBus.connect(this.master);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.value = 0.85;
        this.sfxBus.connect(this.master);
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this.makeImpulse(2.6);
        const wet = ctx.createGain();
        wet.gain.value = 0.42;
        this.reverb.connect(wet);
        wet.connect(this.master);
        this.noise = this.makeNoise();
        this.nextTime = ctx.currentTime + 0.12;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    makeImpulse(seconds) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      return buf;
    }

    makeNoise() {
      const ctx = this.ctx, len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    setEnabled(on) {
      this.enabled = on;
      if (!this.ctx) return;
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(on ? 0.9 : 0, t + 0.25);
      if (on && this.ctx.state === 'suspended') this.ctx.resume();
    }

    /** Duck or restore the music (message cards, pause, the kiss…). */
    setMusicLevel(level, seconds) {
      this.musicLevel = level;
      if (!this.ctx) return;
      const g = this.musicBus.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.6 * level, t + (seconds || 0.4));
    }

    setMode(mode, immediate) {
      if (!MODES[mode] || mode === this.mode) return;
      if (immediate) {
        this.mode = mode;
        this.pendingMode = null;
      } else this.pendingMode = mode;
    }

    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
    resume() { if (this.ctx && this.enabled && this.ctx.state === 'suspended') this.ctx.resume(); }

    /* ── Scheduling (called once per animation frame) ───────── */
    update() {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      // Coming back from a hidden tab: never "catch up" a flood of notes.
      if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.3) {
        if (this.step === 0 && this.pendingMode) {
          this.mode = this.pendingMode;
          this.pendingMode = null;
        }
        this.scheduleStep(this.nextTime);
        const m = MODES[this.mode];
        this.nextTime += 60 / m.bpm / 2; // eighth notes
        this.step = (this.step + 1) % 8;
        if (this.step === 0) this.bar = (this.bar + 1) % 4;
      }
    }

    scheduleStep(t) {
      const m = MODES[this.mode];
      const chord = CHORDS[this.bar];
      const beat = 60 / m.bpm;
      if (this.step === 0) {
        this.pad(chord.pad, t, beat * 4.2, m.pad);
        this.bass(midi(chord.bass), t, beat * 1.8, m.bass);
      }
      if (this.step === 4) this.bass(midi(chord.bass + 12), t, beat * 1.6, m.bass * 0.7);
      // Music-box arpeggio with a little gentle randomness.
      const density = this.step === 0 ? 1 : m.arpDensity;
      if (this.rand() < density) {
        const note = chord.arp[ARP[this.step]] + m.bright;
        const vel = (this.step % 2 === 0 ? 0.03 : 0.022) * (0.8 + this.rand() * 0.4);
        this.pluck(midi(note), t, 1.1, vel, true);
      }
      if (m.melody) {
        for (const [s, n] of MELODY[this.bar]) if (s === this.step) this.bell(midi(n + (m.bright ? 0 : -12) + 12), t, 1.8, 0.03);
      }
      if (m.shaker && this.step % 2 === 1) this.tick(t, 0.012);
    }

    /* ── Voices ─────────────────────────────────────────────── */
    env(gainNode, t, peak, attack, dur) {
      const g = gainNode.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(peak, t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    out(node, send, music) {
      node.connect(music ? this.musicBus : this.sfxBus);
      if (send) node.connect(this.reverb);
    }

    pluck(freq, t, dur, vel, music) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      this.env(g, t, vel, 0.006, dur);
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = freq * 2.001;
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      o1.connect(g);
      o2.connect(g2);
      g2.connect(g);
      this.out(g, true, music);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }

    bell(freq, t, dur, vel) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      this.env(g, t, vel, 0.01, dur);
      [1, 2.76, 5.4].forEach((ratio, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * ratio;
        const og = ctx.createGain();
        og.gain.value = [1, 0.18, 0.06][i];
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
      this.out(g, true, true);
    }

    pad(notes, t, dur, vel) {
      const ctx = this.ctx;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      const g = ctx.createGain();
      const gg = g.gain;
      gg.setValueAtTime(0.0001, t);
      gg.linearRampToValueAtTime(vel, t + 0.9);
      gg.setValueAtTime(vel, t + dur - 1.2);
      gg.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      filter.connect(g);
      this.out(g, true, true);
      for (const n of notes) {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midi(n);
          o.detune.value = det;
          o.connect(filter);
          o.start(t);
          o.stop(t + dur + 0.7);
        }
      }
    }

    bass(freq, t, dur, vel) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      const gg = g.gain;
      gg.setValueAtTime(0.0001, t);
      gg.linearRampToValueAtTime(vel, t + 0.04);
      gg.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      this.out(g, false, true);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    noiseBurst(t, dur, vel, type, freq, q, music, send) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q || 1;
      const g = ctx.createGain();
      this.env(g, t, vel, Math.min(0.01, dur / 4), dur);
      src.connect(f);
      f.connect(g);
      this.out(g, send, music);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
      return f;
    }

    tick(t, vel) { this.noiseBurst(t, 0.05, vel, 'highpass', 6500, 0.7, true, false); }

    sweep(type, f0, f1, t, dur, vel, send) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      this.env(g, t, vel, 0.008, dur);
      o.connect(g);
      this.out(g, send, false);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    /* ── Sound effects ──────────────────────────────────────── */
    play(name, arg) {
      if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.005;
      switch (name) {
        case 'jump':
          this.sweep('sine', 380, 720, t, 0.13, 0.09, false);
          this.sweep('triangle', 760, 1300, t, 0.08, 0.02, false);
          break;
        case 'land': {
          const v = Math.min(1, (arg || 400) / 900);
          this.noiseBurst(t, 0.08, 0.09 * v + 0.03, 'lowpass', 520, 0.8, false, false);
          this.sweep('sine', 150, 80, t, 0.09, 0.07 * v + 0.02, false);
          break;
        }
        case 'bounce':
          this.sweep('sine', 260, 820, t, 0.22, 0.12, true);
          this.sweep('triangle', 520, 1640, t + 0.02, 0.18, 0.025, true);
          break;
        case 'heart':
          [84, 88, 91, 96].forEach((n, i) => this.pluck(midi(n), t + i * 0.075, 1.3, 0.11, false));
          this.noiseBurst(t + 0.05, 0.6, 0.02, 'highpass', 7000, 0.5, false, true);
          break;
        case 'card': {
          const f = this.noiseBurst(t, 0.45, 0.035, 'bandpass', 700, 1.4, false, true);
          f.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
          this.pluck(midi(81), t + 0.12, 1.2, 0.05, false);
          break;
        }
        case 'click':
          this.sweep('sine', 900, 1200, t, 0.04, 0.035, false);
          break;
        case 'bonk':
          this.sweep('triangle', 330, 150, t, 0.2, 0.1, false);
          this.noiseBurst(t, 0.06, 0.04, 'lowpass', 900, 0.8, false, false);
          break;
        case 'fall':
          this.sweep('sine', 700, 220, t, 0.45, 0.06, true);
          break;
        case 'respawn':
          this.pluck(midi(72), t, 0.6, 0.07, false);
          this.pluck(midi(79), t + 0.09, 0.8, 0.07, false);
          break;
        case 'hint':
          this.pluck(midi(76), t, 0.7, 0.05, false);
          this.pluck(midi(72), t + 0.12, 0.9, 0.05, false);
          break;
        case 'bridge':
          [65, 69, 72, 76, 77, 81, 84, 88, 89, 93].forEach((n, i) => this.pluck(midi(n), t + i * 0.09, 1.4, 0.06, false));
          this.noiseBurst(t, 1.4, 0.02, 'highpass', 6000, 0.5, false, true);
          break;
        case 'flower':
          [72, 74, 77, 79, 81, 84].forEach((n, i) => this.pluck(midi(n), t + i * 0.06, 1.2, 0.055, false));
          break;
        case 'surprise':
          this.sweep('sine', 520, 980, t, 0.16, 0.05, true);
          break;
        case 'kiss': {
          // a tiny, soft "mwah": a filtered pop with a quick rising chirp
          this.noiseBurst(t, 0.06, 0.07, 'bandpass', 1900, 3, false, false);
          this.sweep('sine', 680, 1350, t + 0.01, 0.08, 0.06, true);
          [77, 81, 84, 89].forEach((n, i) => this.bell(midi(n), t + 0.18 + i * 0.12, 2.2, 0.035));
          break;
        }
        case 'celebrate':
          [65, 69, 72, 77, 81, 84, 89].forEach((n, i) => this.pluck(midi(n), t + i * 0.07, 1.6, 0.07, false));
          [60, 65, 69].forEach((n) => this.bell(midi(n + 12), t + 0.5, 2.6, 0.03));
          this.noiseBurst(t + 0.2, 1.2, 0.025, 'highpass', 6500, 0.5, false, true);
          break;
        case 'shy':
          this.pluck(midi(79), t, 0.5, 0.04, false);
          this.pluck(midi(76), t + 0.14, 0.7, 0.035, false);
          break;
      }
    }
  }

  LM.AudioEngine = AudioEngine;
})();

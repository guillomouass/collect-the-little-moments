/*
 * The final sequence: arrival → flower offer → flower accepted → the kiss →
 * invitation → answers. Each phase is a game state; inside a phase, poses are
 * pure functions of the phase clock and one-shot events fire exactly once.
 */
(function () {
  'use strict';
  const LM = window.LM;
  const { clamp, lerp, seg, ease, invLerp } = LM.U;
  const { basePose } = LM.Characters;

  const OFFER_GAP = 60; // Mahmood's feet → Nuwara's feet when offering the flower
  const KISS_GAP = 53;  // …and when they kiss (their muzzles meet at full lean)

  const DUR = { flowerOffer: 4.4, flowerAccept: 3.4, kiss: 5.3 };

  class Ending {
    constructor(game) {
      this.game = game;
      this.reset();
    }

    reset() {
      this.phase = null;
      this.t = 0;
      this.fired = new Set();
      this.flower = { owner: null, scale: 0, angle: 0 };
      this.arrivedAt = -1;
      this.surpriseAt = -1;
      this.mX = 0;
      this.moreStage = 0;
      this.stageT = 0;
      this.heartTimer = 0;
    }

    get nX() { return this.game.level.nuwaraX; }
    get groundY() { return this.game.level.final.y; }

    enter(phase) {
      this.phase = phase;
      this.t = 0;
      this.fired.clear();
      const g = this.game;
      if (phase === 'finalReached') {
        this.arrivedAt = -1;
        this.surpriseAt = -1;
        this.flower = { owner: null, scale: 0, angle: 0 };
        this.mX = g.player.x;
      }
      if (phase === 'flowerOffer') this.mX = this.nX - OFFER_GAP;
      if (phase === 'kiss') g.audio.setMusicLevel(0.45, 1.2);
      if (phase === 'responseMore') { this.moreStage = 0; this.stageT = 0; }
    }

    /** Fire `fn` once when the phase clock passes `at`. */
    at(at, key, fn) {
      if (this.t >= at && !this.fired.has(key)) {
        this.fired.add(key);
        fn();
      }
    }

    update(dt) {
      const g = this.game;
      this.t += dt;
      this.stageT += dt;
      const pl = g.player;
      const fx = g.particles;
      switch (this.phase) {
        case 'finalReached': {
          // Mahmood walks the last few steps by himself, slowing as he gets close.
          const target = this.nX - OFFER_GAP;
          const dx = target - pl.x;
          if (this.arrivedAt < 0) {
            pl.vx = clamp(dx * 2.4, -165, 165);
            if (Math.abs(pl.vx) < 22) pl.vx = 22 * Math.sign(dx || 1);
            pl.x += pl.vx * dt;
            if ((dx > 0 && pl.x >= target) || (dx <= 0 && pl.x <= target) || Math.abs(dx) < 1.5) {
              pl.x = target;
              pl.vx = 0;
              this.arrivedAt = this.t;
            }
            if (Math.abs(pl.vx) > 1) pl.facing = Math.sign(pl.vx);
            pl.runPhase += Math.abs(pl.vx) * dt * 0.05;
          } else pl.facing = 1;
          this.mX = pl.x;
          if (this.surpriseAt < 0 && this.nX - pl.x < 200) {
            this.surpriseAt = this.t;
            g.audio.play('surprise');
            this.sparkleAbove(this.nX, this.groundY - 74);
          }
          if (this.arrivedAt >= 0 && this.t - this.arrivedAt > 0.8) g.setState('flowerOffer');
          break;
        }
        case 'flowerOffer':
          this.mX = this.nX - OFFER_GAP + 7 * seg(this.t, 1.7, 2.6);
          this.flower.owner = 'M';
          this.flower.scale = seg(this.t, 1.25, 1.6, ease.outBack);
          this.flower.angle = lerp(0.25, 0.55, seg(this.t, 1.7, 2.6));
          this.at(1.25, 'pop', () => {
            g.audio.play('flower');
            const h = g.handPos('M');
            if (h) fx.burst(h.x, h.y - 18, { n: 12, speed: 90, colors: ['#FFFFFF', '#FFB8D2'], size: 3.4, g: -20, life: 0.8 });
            g.announce(`${LM.config.mainCharacterName} shyly offers ${LM.config.secondCharacterName} a little pink flower.`);
          });
          this.at(1.45, 'surprise', () => {
            g.audio.play('surprise');
            this.sparkleAbove(this.nX, this.groundY - 74);
          });
          if (this.t > DUR.flowerOffer) g.setState('flowerAccept');
          break;
        case 'flowerAccept':
          this.mX = this.nX - OFFER_GAP + 7;
          this.at(0.62, 'handoff', () => {
            this.flower.owner = 'N';
            const h = g.handPos('M');
            if (h) fx.burst(h.x, h.y - 16, { n: 10, speed: 70, colors: ['#FFFFFF', '#FFE08A'], size: 3, g: -10 });
            g.announce(`${LM.config.secondCharacterName} accepts the flower with a delighted smile.`);
          });
          // in Nuwara's hand: raised to her nose for a little sniff, then held at her chest
          this.flower.angle = this.flower.owner === 'N' ? lerp(lerp(0.3, 0.15, seg(this.t, 0.7, 1.3)), 0.75, seg(this.t, 1.9, 2.4)) : 0.55;
          this.at(1.1, 'hearts', () => this.floatHearts(this.nX - 4, this.groundY - 70, 4));
          this.at(2.2, 'sparkle', () => {
            fx.burst((this.mX + this.nX) / 2, this.groundY - 50, { n: 14, speed: 110, colors: ['#FFFFFF', '#DDF3FF', '#FFB8D2'], size: 3.6, g: -30, life: 1.1 });
          });
          if (this.t > DUR.flowerAccept) g.setState('kiss');
          break;
        case 'kiss': {
          const from = this.nX - OFFER_GAP + 7, to = this.nX - KISS_GAP;
          this.mX = lerp(from, to, seg(this.t, 0.8, 1.4));
          this.flower.angle = 0.75; // kept at her chest so both faces stay visible
          this.at(2.0, 'contact', () => {
            g.audio.play('kiss');
            g.audio.setMusicLevel(1, 1.6);
            const m = g.kissPoint();
            fx.burst(m.x, m.y, { n: 18, speed: 150, type: 'heart', colors: ['#F58FB8', '#FFB8D2', '#8FCDF0', '#BDE7FF'], size: 4.2, g: -40, life: 1.4, wobble: 60 });
            fx.ring(m.x, m.y, '#FFFFFF', 4, 0.6, 70);
            g.announce(`${LM.config.mainCharacterName} and ${LM.config.secondCharacterName} lean in and share a sweet little kiss.`);
          });
          for (const [i, at] of [[0, 2.3], [1, 2.55], [2, 2.8]]) {
            this.at(at, 'rise' + i, () => {
              const m = g.kissPoint();
              fx.spawn({ x: m.x + (i - 1) * 4, y: m.y - 6, vx: (i - 1) * 12, vy: -55, g: -10, drag: 0.6, life: 1.6, size: 4 + i, type: 'heart', color: i === 1 ? '#8FCDF0' : '#F58FB8', wobble: 40 });
            });
          }
          this.at(3.7, 'after', () => {
            for (let i = 0; i < fx.count(10); i++) {
              fx.spawn({ x: lerp(this.mX - 30, this.nX + 30, Math.random()), y: this.groundY - 10 - Math.random() * 40, vy: -40 - Math.random() * 40, g: -6, drag: 0.4, life: 2 + Math.random(), size: 2.6 + Math.random() * 2, type: 'sparkle', color: i % 3 ? '#FFFFFF' : '#FFB8D2' });
            }
          });
          if (this.t > DUR.kiss) g.setState('invitation');
          break;
        }
        case 'invitation':
        case 'responseYes':
        case 'responseMore': {
          this.mX = this.nX - KISS_GAP;
          // a few soft hearts drifting up through the scene
          const rate = this.phase === 'responseYes' ? 9 : 1.4;
          this.heartTimer -= dt * (LM.U.motion.reduced ? 0.35 : 1);
          if (this.heartTimer <= 0) {
            this.heartTimer = 1 / rate;
            const cam = g.cam;
            const x = cam.x + (Math.random() - 0.5) * cam.viewW * 0.9;
            const y = this.phase === 'responseYes' ? this.groundY - 40 - Math.random() * 30 : cam.y + cam.viewH * 0.5;
            const pinkish = Math.random() > 0.3;
            if (this.phase === 'responseYes') {
              fx.spawn({ x: lerp(this.mX - 60, this.nX + 60, Math.random()), y, vx: (Math.random() - 0.5) * 160, vy: -180 - Math.random() * 160, g: 140, drag: 0.6, life: 2.2, size: 3 + Math.random() * 3, type: Math.random() > 0.4 ? 'heart' : 'sparkle', color: pinkish ? '#F58FB8' : '#8FCDF0', wobble: 50 });
            } else {
              fx.spawn({ x, y, vx: 0, vy: -30 - Math.random() * 25, g: 0, drag: 0, life: 7, size: 3 + Math.random() * 3.5, type: 'heart', color: pinkish ? '#FFB8D2' : '#BDE7FF', wobble: 30, alpha: 0.8 });
            }
          }
          if (this.phase === 'responseYes') {
            this.at(0.05, 'yay', () => {
              g.audio.play('celebrate');
              fx.burst((this.mX + this.nX) / 2, this.groundY - 50, { n: 30, speed: 260, type: 'heart', colors: ['#F58FB8', '#FFB8D2', '#8FCDF0', '#FFFFFF'], size: 4.5, g: 120, life: 1.8, wobble: 40 });
            });
          }
          break;
        }
      }
    }

    sparkleAbove(x, y) {
      const fx = this.game.particles;
      for (let i = 0; i < 3; i++) fx.spawn({ x: x + (i - 1) * 9, y: y - Math.abs(i - 1) * -4, vx: (i - 1) * 30, vy: -60, g: 60, drag: 2, life: 0.7, size: 4, type: 'sparkle', color: '#FFFFFF' });
    }

    floatHearts(x, y, n) {
      const fx = this.game.particles;
      for (let i = 0; i < fx.count(n); i++) fx.spawn({ x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 40, vy: -50 - Math.random() * 30, g: -10, drag: 0.5, life: 1.6 + Math.random() * 0.6, size: 3.2 + Math.random() * 2, type: 'heart', color: i % 2 ? '#FFB8D2' : '#F58FB8', wobble: 50 });
    }

    /* ── Poses ─────────────────────────────────────────────── */
    poses(time) {
      const g = this.game;
      const mf = g.mFace, nf = g.nFace;
      const t = this.t;
      let m, n;
      const N = this.nX;
      let nx = N, mLift = 0;

      switch (this.phase) {
        case 'finalReached': {
          if (this.arrivedAt < 0) m = LM.Characters.playerPose(g.player, mf, time);
          else {
            m = basePose();
            m.eyeOpen = mf.eyeOpen;
            m.turn = 0.5;
            m.lookX = 0.9;
            m.sy = 1 + Math.sin(time * 2.4) * 0.018;
            m.blush = 0.2;
          }
          const toward = clamp(invLerp(900, 260, N - this.mX), 0, 1);
          n = LM.Characters.nuwaraIdlePose(nf, time, toward);
          if (this.surpriseAt >= 0) {
            const s = this.t - this.surpriseAt;
            const k = 1 - seg(s, 0.7, 1.2);
            if (k > 0) {
              n.eyes = 'wide';
              n.mouth = 'o';
              n.lift = Math.sin(clamp(s / 0.35, 0, 1) * Math.PI) * 6;
              n.armF = lerp(n.armF, 2.6, k);
              n.armB = lerp(n.armB, 2.6, k);
            } else n.mouth = 'smile';
            n.blush = 0.35;
            n.lookX = 0.9;
            n.turn = 0.5;
          }
          break;
        }
        case 'flowerOffer': {
          m = basePose();
          m.eyeOpen = mf.eyeOpen;
          m.turn = 0.55;
          const shy = seg(t, 0, 0.5) * (1 - seg(t, 1.4, 1.9));
          m.lookY = lerp(0, 0.9, shy);
          m.lookX = lerp(0.9, 0.2, shy);
          m.headTilt = 0.13 * shy;
          m.brow = 0.25 + 0.7 * shy;
          m.blush = 0.15 + 0.7 * seg(t, 0, 1.2);
          const scratch = seg(t, 0.05, 0.4) * (1 - seg(t, 1.0, 1.4));
          m.armB = lerp(-0.15, 3.45 + Math.sin(time * 14) * 0.12, scratch);
          m.legF = Math.sin(time * 9) * 0.25 * scratch;
          const hold = seg(t, 0.8, 1.3);
          const offer = seg(t, 1.7, 2.6);
          m.armF = lerp(lerp(0.22, -0.25, hold), 1.32, offer) + (t > 2.6 ? Math.sin(time * 5) * 0.035 : 0);
          m.lean = 0.07 * offer;
          m.mouth = shy > 0.5 ? 'small' : 'smile';
          m.sy = 1 + Math.sin(time * 2.4) * 0.015;

          n = basePose();
          n.eyeOpen = nf.eyeOpen;
          n.turn = 0.5;
          n.lookX = 0.9;
          n.blush = 0.1;
          n.armF = n.armB = 0.55;
          n.headTilt = -0.12 * (1 - seg(t, 1.3, 1.5));
          n.sy = 1 + Math.sin(time * 2.2) * 0.016;
          if (t > 1.3) {
            const s = t - 1.3;
            n.eyes = t < 2.6 ? 'wide' : 'happy';
            n.mouth = t < 2.6 ? 'o' : 'grin';
            n.lift = s < 0.6 ? Math.sin((s / 0.6) * Math.PI) * 6 : 0;
            const cheeks = seg(t, 1.35, 1.65);
            n.armF = lerp(0.55, 2.75, cheeks);
            n.armB = lerp(0.55, 2.75, cheeks);
            n.blush = 0.25 + 0.4 * seg(t, 1.5, 2.6);
            if (t > 2.6) n.lean = Math.sin(time * 3) * 0.04;
          }
          break;
        }
        case 'flowerAccept': {
          m = basePose();
          m.eyeOpen = mf.eyeOpen;
          m.turn = 0.55;
          m.lookX = 0.9;
          m.blush = 0.85;
          m.armF = lerp(1.32, 0.22, seg(t, 0.65, 1.2));
          m.lean = 0.07 * (1 - seg(t, 0.65, 1.2));
          const happy = t > 0.9 && t < 2.1;
          m.eyes = happy ? 'happy' : 'open';
          m.mouth = t > 0.8 ? 'grin' : 'smile';
          const scratch = seg(t, 1.0, 1.3) * (1 - seg(t, 2.0, 2.4));
          m.armB = lerp(-0.15, 3.45 + Math.sin(time * 13) * 0.12, scratch);
          m.sy = 1 + Math.sin(time * 2.4) * 0.015;

          n = basePose();
          n.eyeOpen = nf.eyeOpen;
          n.turn = 0.5;
          n.lookX = 0.9;
          const reach = seg(t, 0, 0.6) * (1 - seg(t, 0.7, 1.2));
          n.armF = lerp(lerp(2.75, 1.4, seg(t, 0, 0.6)), 1.15, seg(t, 0.7, 1.3));
          if (t > 1.9) n.armF = lerp(1.15, 0.45, seg(t, 1.9, 2.4));
          n.armB = lerp(2.75, 0.6, seg(t, 0.5, 1.1));
          n.lean = 0.13 * reach;
          nx = N - 5 * reach;
          const sniff = t > 0.95 && t < 1.95;
          n.eyes = sniff ? 'closed' : t > 1.95 ? 'open' : 'happy';
          n.mouth = sniff ? 'smile' : 'grin';
          n.blush = 0.6 + 0.3 * seg(t, 0.8, 1.6);
          n.sy = 1 + Math.sin(time * 2.2) * 0.016;
          break;
        }
        case 'kiss': {
          const leanIn = seg(t, 1.35, 2.0);
          const leanOut = seg(t, 2.85, 3.5);
          const lean = 0.2 * leanIn * (1 - leanOut) + 0.035 * leanOut;
          const turn = lerp(0.5, 0.92, seg(t, 0.3, 1.2)) - 0.25 * seg(t, 3.6, 4.4);
          const closed = t > 1.6 && t < 3.0;
          const afterK = t >= 3.0;

          m = basePose();
          m.eyeOpen = mf.eyeOpen;
          m.turn = turn;
          m.lean = lean;
          m.blush = lerp(0.85, 1, seg(t, 0, 0.8));
          m.lookX = 0.9;
          m.lookY = Math.sin(clamp(t / 0.8, 0, 1) * Math.PI) * 0.7; // a shy glance down, then back up
          m.headTilt = 0.08 * leanIn * (1 - leanOut);
          m.eyes = closed ? 'closed' : afterK && t < 4.2 ? 'happy' : 'open';
          m.mouth = t > 1.5 && t < 2.95 ? 'kiss' : afterK ? 'grin' : 'smile';
          m.armF = lerp(0.22, 0.6, leanIn * (1 - leanOut));
          const scratch = seg(t, 3.5, 3.8) * (1 - seg(t, 4.8, 5.2));
          m.armB = lerp(-0.15, 3.45 + Math.sin(time * 13) * 0.12, scratch);
          m.brow = afterK ? 0.4 * scratch : 0;
          m.sy = 1 + Math.sin(time * 2.4) * 0.012;

          n = basePose();
          n.eyeOpen = nf.eyeOpen;
          n.turn = turn;
          n.lean = lean;
          n.blush = lerp(0.9, 1, seg(t, 0, 0.8));
          n.lookX = 0.9;
          n.headTilt = -0.1 * (1 - seg(t, 0.8, 1.4)) - 0.04 * leanIn * (1 - leanOut);
          n.eyes = closed ? 'closed' : afterK && t < 4.4 ? 'happy' : 'open';
          n.mouth = t > 1.5 && t < 2.95 ? 'kiss' : afterK ? 'grin' : 'smile';
          n.armF = 0.45 + Math.sin(time * 2) * 0.03;
          n.armB = lerp(0.6, 0.5, seg(t, 3.5, 4.0));
          n.lift = 1.6 * leanIn * (1 - leanOut);
          // the classic little foot-pop
          n.legB = -1.5 * seg(t, 1.9, 2.15) * (1 - seg(t, 2.8, 3.1));
          n.sy = 1 + Math.sin(time * 2.2) * 0.012;
          break;
        }
        case 'invitation':
        case 'responseYes':
        case 'responseMore': {
          m = basePose();
          m.eyeOpen = mf.eyeOpen;
          n = basePose();
          n.eyeOpen = nf.eyeOpen;
          m.turn = n.turn = 0.6;
          m.lookX = n.lookX = 0.9;
          m.blush = 0.55;
          n.blush = 0.5;
          n.armF = 0.45;
          n.armB = 0.5;
          this.flower.angle = 0.75;
          m.sy = 1 + Math.sin(time * 2.4) * 0.016;
          n.sy = 1 + Math.sin(time * 2.2 + 1) * 0.016;
          m.lean = Math.sin(time * 1.2) * 0.02;
          n.lean = Math.sin(time * 1.2 + 0.6) * 0.02;
          if (this.phase === 'invitation') {
            const shyGlance = (time % 6) > 4.6;
            if (shyGlance) { m.lookY = 0.8; m.lookX = 0.3; m.mouth = 'small'; }
          } else if (this.phase === 'responseYes') {
            const hop = Math.abs(Math.sin(t * 6.4));
            m.lift = hop * 16;
            m.armF = 2.7 + Math.sin(t * 12.8) * 0.3;
            m.armB = 2.6 - Math.sin(t * 12.8) * 0.3;
            m.legF = hop > 0.3 ? 0.6 : 0;
            m.legB = hop > 0.3 ? -0.4 : 0;
            m.eyes = 'happy';
            m.mouth = 'grin';
            m.turn = 0.4;
            m.blush = 0.7;
            m.sy = hop < 0.15 ? 0.92 : 1.04;
            n.lift = Math.abs(Math.sin(t * 3.2)) * 5;
            n.eyes = 'happy';
            n.mouth = 'grin';
            n.armF = 2.2 + Math.sin(t * 6) * 0.1; // flower raised in celebration
            n.armB = 2.5;
            this.flower.angle = -0.2;
            n.blush = 0.75;
            n.turn = 0.45;
          } else {
            if (this.moreStage === 0) {
              m.lookY = 0.9;
              m.lookX = 0.2;
              m.headTilt = 0.15;
              m.brow = 0.9;
              m.blush = 1;
              m.mouth = 'small';
              m.armB = 3.45 + Math.sin(time * 13) * 0.12;
              m.armF = 0.35 + Math.sin(time * 4) * 0.08;
              m.legF = Math.sin(time * 8) * 0.25;
              m.sweat = 0.55 + Math.sin(time * 3) * 0.3;
              m.lean = -0.04;
              n.headTilt = -0.18;
              n.mouth = 'smile';
              n.blush = 0.55;
            } else {
              const s = this.stageT;
              m.lift = s < 1.0 ? Math.abs(Math.sin((s / 1.0) * Math.PI * 2)) * 12 : 0;
              m.eyes = s < 1.4 ? 'happy' : 'open';
              m.mouth = 'grin';
              m.armF = s < 1.6 ? 2.7 + Math.sin(time * 11) * 0.3 : 0.4;
              m.blush = 0.8;
              n.eyes = s < 1.8 ? 'happy' : 'open';
              n.mouth = 'grin';
              n.armF = 2.0;
              n.armB = 2.6;
              n.blush = 0.8;
              this.flower.angle = -0.1;
            }
          }
          break;
        }
        default:
          m = basePose();
          n = basePose();
      }
      return { m, n, mX: this.mX, nX: nx, mLift };
    }

    /** Camera framing for the current phase. */
    framing() {
      const g = this.game;
      const G = this.groundY;
      const mid = (this.mX + this.nX) / 2;
      const base = g.baseView();
      const close = clamp(Math.min(base.w / 280, base.h / 235), 1, 1.75);
      if (this.phase === 'invitation' || this.phase === 'responseYes' || this.phase === 'responseMore') {
        const z = clamp(Math.min(base.w / 300, base.h / 330), 1, 1.5);
        const viewH = base.h / z;
        return { x: (this.mX + this.nX) / 2, y: G - (0.87 - 0.5) * viewH, zoom: z };
      }
      if (this.phase === 'finalReached') {
        const near = clamp(invLerp(this.nX - 230, this.nX - OFFER_GAP, this.mX), 0, 1);
        return { x: lerp((this.mX + this.nX) / 2 + 20, mid, near), y: G - 44, zoom: lerp(1.15, close, near) };
      }
      return { x: mid, y: G - 44, zoom: close };
    }
  }

  LM.Ending = Ending;
  LM.Ending.KISS_GAP = KISS_GAP;
})();

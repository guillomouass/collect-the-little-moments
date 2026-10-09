/*
 * Mahmood & Nuwara — custom vector characters drawn on Canvas.
 *
 * Both share one local coordinate system: origin at the feet, y up is
 * negative, ~64 units tall. Every animation only changes a *pose* (angles,
 * offsets, expression) — never the proportions — so the characters stay
 * on-model in every state. `turn` rotates the face from front (0) toward
 * profile (1) for the kiss.
 */
(function () {
  'use strict';
  const LM = window.LM;
  const { clamp, rng, ellipse, heartPath, damp } = LM.U;

  const STYLES = {
    mahmood: {
      name: 'mahmood',
      scale: 1,
      fur: '#B87950',
      furLight: '#CF9468',
      furDark: '#94603D',
      face: '#F4DAB8',
      palm: '#EBC9A2',
      innerEar: '#E8B4A0',
      eye: '#2D2630',
      headR: 17,
      earR: 6.6,
      blushBase: 0.12
    },
    nuwara: {
      name: 'nuwara',
      scale: 0.94,
      fur: '#9C6B55',
      furLight: '#B5846C',
      furDark: '#7C5242',
      face: '#F7E3CF',
      palm: '#EFD2BA',
      innerEar: '#EDB7AE',
      eye: '#2D2630',
      headR: 17.6,
      earR: 5.6,
      blushBase: 0.38
    }
  };

  function basePose() {
    return {
      lean: 0, sx: 1, sy: 1, lift: 0, bodyBob: 0,
      headTilt: 0, headX: 0, headY: 0,
      turn: 0.42, lookX: 0.5, lookY: 0,
      eyes: 'open', eyeOpen: 1, brow: 0,
      mouth: 'smile', blush: 0,
      armF: 0.22, armB: -0.15, legF: 0, legB: 0,
      tail: 0, scarf: 0.15, sweat: 0,
      shadowGap: 0, shadow: true, alpha: 1
    };
  }

  /* ── Blinking & looking around ───────────────────────────── */
  class Face {
    constructor(seed) {
      this.r = rng(seed);
      this.blinkIn = 1.2 + this.r() * 2;
      this.blinkT = -1;
      this.eyeOpen = 1;
      this.lookX = 0.6;
      this.lookY = 0;
      this.turnOff = 0;
      this.timer = 2.5;
      this.target = [0.6, 0, 0];
      this.idle = 0;
    }
    update(dt, mode) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkT = 0;
        this.blinkIn = this.r() < 0.2 ? 0.25 : 2.2 + this.r() * 2.8; // sometimes a double blink
      }
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        if (this.blinkT > 0.15) this.blinkT = -1;
      }
      this.eyeOpen = this.blinkT < 0 ? 1 : 1 - Math.sin((this.blinkT / 0.15) * Math.PI) * 0.95;
      if (mode === 'idle') {
        this.idle += dt;
        this.timer -= dt;
        if (this.timer <= 0) {
          const looks = [[0.6, 0, 0], [1, -0.4, 0.15], [-0.9, -0.2, -0.45], [0.2, -1, 0], [0.8, 0.7, 0.1], [0.6, 0, 0]];
          this.target = looks[Math.floor(this.r() * looks.length)];
          this.timer = 1.3 + this.r() * 2.4;
        }
      } else {
        this.idle = 0;
        this.timer = 1.6;
        this.target = [0.7, 0, 0];
      }
      this.lookX = damp(this.lookX, this.target[0], 9, dt);
      this.lookY = damp(this.lookY, this.target[1], 9, dt);
      this.turnOff = damp(this.turnOff, this.target[2], 6, dt);
    }
  }

  /* ── Drawing helpers ─────────────────────────────────────── */
  function limb(ctx, sx, sy, ang, len, width, color, endColor, isLeg) {
    const ex = sx + Math.sin(ang) * len, ey = sy + Math.cos(ang) * len;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = endColor;
    if (isLeg) ellipse(ctx, ex + 1.5, ey + 0.6, 4.9, 3.3, -ang * 0.5);
    else ellipse(ctx, ex, ey, 3.4, 3.4);
    ctx.fill();
    return { x: ex, y: ey };
  }

  function drawTail(ctx, st, p, time) {
    ctx.save();
    ctx.translate(-9, -13 + p.bodyBob * 0.5);
    ctx.rotate(Math.sin(time * 2.1 + (st.name === 'nuwara' ? 1.7 : 0)) * 0.1 + p.tail * 0.35);
    ctx.strokeStyle = st.furDark;
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-15, 3, -22, -16, -13, -23);
    if (st.name === 'mahmood') {
      ctx.arc(-10, -23, 3, Math.PI, Math.PI * 2.55);
      ctx.stroke();
    } else {
      ctx.stroke();
      // Nuwara's tail curls into a little heart.
      ctx.lineWidth = 2.8;
      ctx.save();
      ctx.translate(-13, -27);
      ctx.rotate(-0.25);
      heartPath(ctx, 0, 0, 4.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBow(ctx, x, y, rot, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = '#F58FB8';
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(d * 4, -8, d * 12, -7, d * 11, 0);
      ctx.bezierCurveTo(d * 12, 7, d * 4, 8, 0, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#FFC9DC';
    ellipse(ctx, -6.5, -1.2, 2.6, 1.8, 0.3); ctx.fill();
    ellipse(ctx, 6.5, -1.2, 2.6, 1.8, -0.3); ctx.fill();
    ctx.fillStyle = '#E97DA8';
    ctx.beginPath();
    ctx.moveTo(-1, 1); ctx.lineTo(-5, 8.5); ctx.lineTo(-1.5, 7.5); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1, 1); ctx.lineTo(4.5, 9); ctx.lineTo(1.2, 7.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F7A6C6';
    ellipse(ctx, 0, 0, 2.7, 3.1); ctx.fill();
    ctx.restore();
  }

  function drawEye(ctx, ex, ey, rx, p, st, outer) {
    ctx.strokeStyle = st.eye;
    ctx.fillStyle = st.eye;
    ctx.lineCap = 'round';
    const lashes = st.name === 'nuwara';
    switch (p.eyes) {
      case 'happy': // ∩
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.arc(ex, ey + 1.6, rx * 1.05, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        break;
      case 'closed': // gentle ∪ with lashes
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ex, ey - 1.4, rx * 1.05, Math.PI * 0.14, Math.PI * 0.86);
        ctx.stroke();
        if (lashes) {
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(ex + outer * rx * 0.95, ey + 0.1);
          ctx.lineTo(ex + outer * (rx + 2.2), ey + 1.4);
          ctx.stroke();
        }
        break;
      case 'squeeze': // > <
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ex - outer * 2.4, ey - 2.4);
        ctx.lineTo(ex + outer * 1.6, ey);
        ctx.lineTo(ex - outer * 2.4, ey + 2.4);
        ctx.stroke();
        break;
      default: {
        const wide = p.eyes === 'wide' ? 1.18 : 1;
        const ry = 4.5 * wide * clamp(p.eyeOpen, 0.06, 1);
        ellipse(ctx, ex, ey, rx * wide, ry);
        ctx.fill();
        if (p.eyeOpen > 0.35) {
          const lx = p.lookX * 1.1, ly = p.lookY * 1.1;
          ctx.fillStyle = '#FFFFFF';
          ellipse(ctx, ex + 1.1 + lx * 0.5, ey - 1.7 + ly * 0.4, 1.35 * wide, 1.35 * wide);
          ctx.fill();
          ellipse(ctx, ex - 1.2 + lx * 0.4, ey + 1.6, 0.6, 0.6);
          ctx.fill();
        }
        if (lashes) {
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(ex + outer * rx * 0.8, ey - ry * 0.65);
          ctx.lineTo(ex + outer * (rx + 2), ey - ry - 0.6);
          ctx.moveTo(ex + outer * rx * 0.35, ey - ry * 0.95);
          ctx.lineTo(ex + outer * (rx * 0.6 + 1), ey - ry - 2);
          ctx.stroke();
        }
      }
    }
  }

  function drawMouth(ctx, mx, my, p, st) {
    ctx.strokeStyle = '#5B3730';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.35;
    switch (p.mouth) {
      case 'grin':
        ctx.fillStyle = '#7A3E45';
        ctx.beginPath();
        ctx.moveTo(mx - 3.9, my - 1.2);
        ctx.quadraticCurveTo(mx, my - 0.2, mx + 3.9, my - 1.2);
        ctx.quadraticCurveTo(mx + 3.4, my + 4.6, mx, my + 4.6);
        ctx.quadraticCurveTo(mx - 3.4, my + 4.6, mx - 3.9, my - 1.2);
        ctx.fill();
        ctx.fillStyle = '#F28FA8';
        ellipse(ctx, mx + 0.3, my + 3, 2.1, 1.3);
        ctx.fill();
        break;
      case 'o':
        ctx.fillStyle = '#6A3940';
        ellipse(ctx, mx, my + 0.6, 1.7, 2.2);
        ctx.fill();
        break;
      case 'kiss':
        ctx.fillStyle = '#E76F93';
        ellipse(ctx, mx + 1.2 + p.turn * 2.6, my, 2.3, 2.5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ellipse(ctx, mx + 1.6 + p.turn * 2.6, my - 1, 0.8, 0.6);
        ctx.fill();
        break;
      case 'wobble':
        ctx.beginPath();
        ctx.moveTo(mx - 3.4, my);
        ctx.quadraticCurveTo(mx - 1.7, my - 1.6, mx, my);
        ctx.quadraticCurveTo(mx + 1.7, my + 1.6, mx + 3.4, my);
        ctx.stroke();
        break;
      case 'small':
        ctx.beginPath();
        ctx.arc(mx, my - 1.4, 2.1, Math.PI * 0.22, Math.PI * 0.78);
        ctx.stroke();
        break;
      default: // smile
        ctx.beginPath();
        ctx.arc(mx, my - 2.6, 3.5, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
    }
  }

  function drawHead(ctx, st, p, time) {
    const R = st.headR;
    const turn = p.turn;
    const fx = turn * 7;
    const kn = 1 - 0.1 * Math.abs(turn), kf = 1 - 0.5 * Math.abs(turn);
    const isN = st.name === 'nuwara';

    // ears (behind the head)
    for (const side of [-1, 1]) {
      const ex = side < 0 ? -(R - 1.5) + turn * 3 : R - 1.5 - turn * 13;
      ctx.fillStyle = st.fur;
      ellipse(ctx, ex, -48, st.earR, st.earR);
      ctx.fill();
      ctx.fillStyle = st.innerEar;
      ellipse(ctx, ex + side * 0.6, -48, st.earR * 0.58, st.earR * 0.62);
      ctx.fill();
    }

    // head
    const g = ctx.createRadialGradient(-5, -54, 2, 0, -46, R + 3);
    g.addColorStop(0, st.furLight);
    g.addColorStop(1, st.fur);
    ctx.fillStyle = g;
    ellipse(ctx, 0, -46, R, R * 0.97);
    ctx.fill();

    // tuft
    ctx.fillStyle = st.fur;
    const top = -46 - R * 0.97;
    if (!isN) {
      // a soft, windswept little fringe
      const ox = fx * 0.3;
      ctx.beginPath();
      ctx.moveTo(-6 + ox, top + 3);
      ctx.quadraticCurveTo(-5.5 + ox, top - 2.5, -1.5 + ox, top - 3.2);
      ctx.quadraticCurveTo(-3 + ox, top - 0.5, -1 + ox, top + 1);
      ctx.quadraticCurveTo(1 + ox, top - 4.2, 5.2 + ox, top - 3.4);
      ctx.quadraticCurveTo(2.6 + ox, top - 1.6, 4.5 + ox, top + 3);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = st.fur;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx * 0.3 - 1, top + 2);
      ctx.quadraticCurveTo(fx * 0.3 - 2, top - 5, fx * 0.3 + 3, top - 4.5);
      ctx.quadraticCurveTo(fx * 0.3 + 5.5, top - 2, fx * 0.3 + 2.6, top - 0.8);
      ctx.stroke();
    }

    const eyeY = -49.5;
    const eN = fx + 6.2 * kn, eF = fx - 6.2 * kf;
    const mzX = fx * 1.5;

    // face mask
    ctx.fillStyle = st.face;
    if (!isN) {
      ellipse(ctx, eF, eyeY + 0.3, 7.2 * kf, 7.7); ctx.fill();
      ellipse(ctx, eN, eyeY + 0.3, 7.5 * kn, 7.7); ctx.fill();
      ellipse(ctx, mzX, -40.6, 9.8 * (1 - 0.1 * turn), 7.3); ctx.fill();
    } else {
      ctx.save();
      ctx.translate(fx, -46.5);
      ctx.scale(1 - 0.28 * turn, 1);
      heartPath(ctx, 0, 0, 13.2);
      ctx.restore();
      ctx.fill();
      ctx.fillStyle = '#FBEDE0';
      ellipse(ctx, mzX, -40.4, 8.2 * (1 - 0.1 * turn), 6.1); ctx.fill();
    }

    // eyes
    drawEye(ctx, eF, eyeY, 3.4 * kf, p, st, -1);
    drawEye(ctx, eN, eyeY, 3.6 * kn, p, st, 1);

    // brows (worried > 0, cheeky < 0)
    if (Math.abs(p.brow) > 0.05) {
      ctx.strokeStyle = st.furDark;
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      const by = eyeY - 6.6, b = p.brow * 1.8;
      ctx.beginPath();
      ctx.moveTo(eF - 2.6 * kf, by + b * 0.2);
      ctx.lineTo(eF + 2.2 * kf, by - b);
      ctx.moveTo(eN - 2.2 * kn, by - b);
      ctx.lineTo(eN + 2.6 * kn, by + b * 0.2);
      ctx.stroke();
    }

    // nose
    const nx = mzX + turn * 2.2;
    if (!isN) {
      ctx.fillStyle = '#5A3826';
      ellipse(ctx, nx, -43.8, 2.4, 1.55); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ellipse(ctx, nx - 0.7, -44.3, 0.8, 0.45); ctx.fill();
    } else {
      ctx.fillStyle = '#C86F80';
      heartPath(ctx, nx, -43.9, 2.1); ctx.fill();
    }

    // mouth
    drawMouth(ctx, mzX + turn * 2.6, -39.4, p, st);

    // blush
    const blush = clamp(st.blushBase + p.blush, 0, 1);
    if (blush > 0.02) {
      ctx.fillStyle = `rgba(245,143,184,${blush * 0.72})`;
      ellipse(ctx, eN + 4 * kn, -42.3, 3.7 * kn, 2.2); ctx.fill();
      ellipse(ctx, eF - 4 * kf, -42.3, 3.5 * kf, 2.1); ctx.fill();
    }

    // sweat drop (shy)
    if (p.sweat > 0.02) {
      ctx.fillStyle = `rgba(160,214,245,${p.sweat})`;
      ctx.beginPath();
      const sx = -R * 0.72, sy = -58;
      ctx.moveTo(sx, sy - 4);
      ctx.quadraticCurveTo(sx + 3, sy + 1, sx, sy + 2.4);
      ctx.quadraticCurveTo(sx - 3, sy + 1, sx, sy - 4);
      ctx.fill();
    }

    if (isN) drawBow(ctx, -R * 0.42 + turn * 3, -46 - R * 0.86, -0.42, 0.95);
  }

  /**
   * Draw a monkey with feet at (x, y).
   * `out` (optional) receives this frame's hand / mouth positions in world space.
   */
  function drawMonkey(ctx, x, y, facing, p, st, time, out) {
    const W = out ? ctx.getTransform() : null;
    ctx.save();
    ctx.translate(x, y);
    if (p.alpha < 1) ctx.globalAlpha *= p.alpha;

    if (p.shadow) {
      const gap = p.shadowGap + p.lift;
      const k = clamp(1 - gap / 180, 0.3, 1);
      ctx.fillStyle = `rgba(52,81,107,${0.17 * k})`;
      ellipse(ctx, 0, p.shadowGap + 1, 15.5 * k * st.scale, 3.6 * k * st.scale);
      ctx.fill();
    }

    ctx.scale(facing * st.scale, st.scale);
    ctx.translate(0, -p.lift);
    ctx.rotate(p.lean);
    ctx.scale(p.sx, p.sy);

    const bob = p.bodyBob;
    const isN = st.name === 'nuwara';
    const local = (lx, ly) => {
      if (!W) return null;
      const m = W.inverse().multiply(ctx.getTransform());
      const pt = m.transformPoint(new DOMPoint(lx, ly));
      return { x: pt.x, y: pt.y };
    };

    drawTail(ctx, st, p, time);

    // back leg + back arm
    limb(ctx, -5, -10 + bob * 0.4, p.legB, 6.6, 6.6, st.furDark, st.palm, true);
    const hb = limb(ctx, -8.5, -27 + bob, p.armB, 11.5, 5.4, st.furDark, st.palm, false);

    // scarf tails flutter behind
    if (!isN) {
      for (const k of [0, 1]) {
        const len = 13 - k * 2.5;
        const flow = clamp(p.scarf, 0, 1);
        const wave = Math.sin(time * 9 + k * 1.4) * (1.2 + flow * 2.2);
        const ex = -8 - len * (0.42 + flow * 0.58);
        const ey = -28.5 + len * (0.92 - flow * 0.75) + wave;
        ctx.fillStyle = k ? '#7DBFE8' : '#93D0F2';
        ctx.beginPath();
        ctx.moveTo(-7, -31 + bob);
        ctx.quadraticCurveTo((ex - 7) / 2, -30 + bob + wave * 0.4, ex, ey + bob - 1.8);
        ctx.lineTo(ex + 0.6, ey + bob + 1.8);
        ctx.quadraticCurveTo((ex - 7) / 2, -25.5 + bob + wave * 0.4, -7, -26.5 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }

    // body
    const bg = ctx.createRadialGradient(-4, -29 + bob, 2, 0, -20 + bob, 20);
    bg.addColorStop(0, st.furLight);
    bg.addColorStop(1, st.fur);
    ctx.fillStyle = bg;
    ellipse(ctx, 0, -20 + bob, 12.8, 14.8);
    ctx.fill();
    ctx.fillStyle = st.face;
    ellipse(ctx, 1.5 + p.turn * 2.5, -18 + bob, 8.6 * (1 - 0.15 * Math.abs(p.turn)), 10);
    ctx.fill();

    // front leg
    limb(ctx, 5, -10 + bob * 0.4, p.legF, 6.6, 6.6, st.fur, st.palm, true);

    // Nuwara's little ruffled skirt
    if (isN) {
      ctx.fillStyle = '#DCD6FF';
      ctx.beginPath();
      ctx.moveTo(-12, -21.5 + bob);
      ctx.lineTo(12, -21.5 + bob);
      ctx.lineTo(15.5, -10.5 + bob);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x0 = 15.5 - (31 / n) * i, x1 = 15.5 - (31 / n) * (i + 1);
        ctx.quadraticCurveTo((x0 + x1) / 2, -7 + bob, x1, -10.5 + bob);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#FFB8D2';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(15.5, -10.5 + bob);
      for (let i = 0; i < n; i++) {
        const x0 = 15.5 - (31 / n) * i, x1 = 15.5 - (31 / n) * (i + 1);
        ctx.quadraticCurveTo((x0 + x1) / 2, -7 + bob, x1, -10.5 + bob);
      }
      ctx.stroke();
      ctx.fillStyle = '#F7A6C6';
      ctx.fillRect(-12.2, -22.6 + bob, 24.4, 2.2);
    }

    // head group
    ctx.save();
    ctx.translate(p.headX, bob + p.headY);
    ctx.translate(0, -31);
    ctx.rotate(p.headTilt);
    ctx.translate(0, 31);
    drawHead(ctx, st, p, time);
    if (out) out.mouth = local(p.turn * 7 * 1.5 + 9, -40);
    ctx.restore();

    // scarf band + knot (in front of the chin)
    if (!isN) {
      ctx.fillStyle = '#A6DBF7';
      ellipse(ctx, p.turn * 2.4, -29.2 + bob, 12.6, 4.4);
      ctx.fill();
      ctx.fillStyle = '#DDF3FF';
      ellipse(ctx, p.turn * 2.4, -30.2 + bob, 10.5, 1.05);
      ctx.fill();
      ctx.fillStyle = '#8FCDF0';
      ellipse(ctx, p.turn * 6.3 + 3.2, -28 + bob, 3.3, 3.1);
      ctx.fill();
    }

    // front arm
    const hf = limb(ctx, 8.5, -27 + bob, p.armF, 11.5, 5.4, st.fur, st.palm, false);
    if (out) {
      out.handF = local(hf.x, hf.y);
      out.handB = local(hb.x, hb.y);
    }
    ctx.restore();
  }

  /** A small pink flower with a clearly visible stem; (x, y) is the bottom of the stem. */
  function drawFlower(ctx, x, y, angle, scale, time) {
    if (scale <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#6DBF8B';
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.quadraticCurveTo(1.6, -8, 0, -17);
    ctx.stroke();
    ctx.fillStyle = '#8ED6A5';
    ellipse(ctx, 3.2, -7.5, 3.6, 1.6, -0.6);
    ctx.fill();
    ellipse(ctx, -2.8, -11, 2.8, 1.3, 0.6);
    ctx.fill();
    const wob = Math.sin(time * 3) * 0.06;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + wob;
      ctx.fillStyle = i % 2 ? '#FFB8D2' : '#FFA6C8';
      ellipse(ctx, Math.sin(a) * 3.7, -19.5 - Math.cos(a) * 3.7, 3.1, 4.1, a);
      ctx.fill();
    }
    ctx.fillStyle = '#F58FB8';
    ellipse(ctx, 0, -19.5, 2.9, 2.9);
    ctx.fill();
    ctx.fillStyle = '#FFE08A';
    ellipse(ctx, 0, -19.5, 2, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ellipse(ctx, -0.6, -20.2, 0.7, 0.6);
    ctx.fill();
    ctx.restore();
  }

  /* ── Gameplay poses ──────────────────────────────────────── */
  function playerPose(pl, face, t) {
    const p = basePose();
    p.eyeOpen = face.eyeOpen;
    p.lookX = face.lookX;
    p.lookY = face.lookY;
    p.turn = 0.42 + face.turnOff;
    const speed = Math.abs(pl.vx);
    const fwd = pl.vx * pl.facing;
    if (!pl.onGround) {
      const up = pl.vy < 0;
      const k = clamp(-pl.vy / 800, -1, 1);
      p.armF = up ? 2.6 : 2.15 + Math.sin(t * 20) * 0.15;
      p.armB = up ? 2.25 : 1.8 + Math.cos(t * 20) * 0.15;
      p.legF = up ? 0.85 : 0.35;
      p.legB = up ? -0.6 : -0.25;
      p.sy = 1 + k * 0.07;
      p.sx = 1 - k * 0.05;
      p.mouth = up ? 'grin' : 'o';
      p.lean = clamp(fwd / 290, -1, 1) * 0.1;
      p.tail = up ? -0.6 : 0.5;
      p.scarf = 0.85;
      p.lookY = up ? -0.6 : 0.7;
    } else if (speed > 25) {
      const ph = pl.runPhase, s = Math.sin(ph), c = Math.cos(ph);
      const k = clamp(speed / 290, 0.35, 1);
      p.legF = s * 0.95 * k;
      p.legB = -s * 0.95 * k;
      p.armF = 0.25 - s * 0.95 * k;
      p.armB = s * 0.95 * k;
      p.bodyBob = -Math.abs(c) * 2.4 * k;
      p.lean = 0.13 * k * Math.sign(fwd || 1);
      p.scarf = k;
      p.tail = s * 0.3;
      p.lookX = 0.8;
    } else {
      const br = Math.sin(t * 2.4);
      p.sy = 1 + br * 0.018;
      p.sx = 1 - br * 0.012;
      p.armF = 0.2 + br * 0.05;
      p.armB = -0.12 - br * 0.04;
      p.tail = Math.sin(t * 1.3) * 0.25;
      if (face.idle > 6 && (face.idle % 9) < 1.6) { // a little wave when left idle
        p.armF = 2.7 + Math.sin(t * 11) * 0.35;
        p.mouth = 'grin';
      }
    }
    if (pl.landT < 0.2) {
      const q = 1 - pl.landT / 0.2;
      p.sy *= 1 - 0.2 * q;
      p.sx *= 1 + 0.16 * q;
    }
    if (pl.hurtT < 0.7) {
      p.eyes = 'squeeze';
      p.mouth = 'wobble';
      p.brow = 1;
    }
    return p;
  }

  /** Nuwara waiting on her island; `towardM` 0..1 is how much she has noticed him. */
  function nuwaraIdlePose(face, t, towardM) {
    const p = basePose();
    p.eyeOpen = face.eyeOpen;
    p.lookX = face.lookX * (1 - towardM) + 0.9 * towardM;
    p.lookY = face.lookY * (1 - towardM);
    p.turn = 0.42 + face.turnOff * (1 - towardM);
    const sway = Math.sin(t * 1.4);
    p.lean = sway * 0.035;
    p.headTilt = -0.06 + Math.sin(t * 0.9) * 0.05;
    p.sy = 1 + Math.sin(t * 2.2) * 0.016;
    p.armF = 0.55 + sway * 0.05; // hands clasped in front
    p.armB = 0.6 - sway * 0.05;
    p.tail = Math.sin(t * 1.1) * 0.3;
    // a happy little heel-bounce now and then
    const hop = (t % 7) / 7;
    if (hop > 0.86) p.lift = Math.sin(((hop - 0.86) / 0.14) * Math.PI * 2) * 1.6 + 1.6;
    p.blush = towardM * 0.2;
    return p;
  }

  LM.Characters = { STYLES, basePose, Face, drawMonkey, drawFlower, playerPose, nuwaraIdlePose };
})();

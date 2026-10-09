/*
 * The dreamy sky world: gradient sky, stars, parallax clouds and distant
 * islands, the cloud sea, platforms, hearts, hazards, the heart-bridge and
 * Nuwara's island. Soft clouds are pre-rendered once into sprites.
 */
(function () {
  'use strict';
  const LM = window.LM;
  const { clamp, lerp, rng, mix, ellipse, roundRect, heartPath, sparklePath, ease, motion } = LM.U;

  const LAYER_WRAP = 3400;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /** A soft, fluffy cloud sprite. Size is in world units, rendered at `ppu` pixels per unit. */
  function cloudSprite(wU, hU, seed, ppu, shade) {
    const pad = 14;
    const c = makeCanvas(wU * ppu + pad * 2, hU * ppu + pad * 2);
    const g = c.getContext('2d');
    g.translate(pad, pad);
    g.scale(ppu, ppu);
    const r = rng(seed);
    const base = hU * 0.8;
    g.shadowColor = 'rgba(255,255,255,0.95)';
    g.shadowBlur = 9;
    g.fillStyle = '#FFFFFF';
    ellipse(g, wU * 0.5, base - hU * 0.06, wU * 0.47, hU * 0.2);
    g.fill();
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const rad = hU * (0.2 + 0.3 * Math.sin(Math.PI * t)) * (0.85 + r() * 0.35);
      const px = wU * (0.1 + 0.8 * t) + (r() - 0.5) * wU * 0.05;
      ellipse(g, px, base - rad * 0.6, rad, rad);
      g.fill();
    }
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, hU);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0)');
    gr.addColorStop(1, shade || 'rgba(196,226,248,0.85)');
    g.fillStyle = gr;
    g.fillRect(-pad, -pad, wU + pad * 2, hU + pad * 2);
    return { canvas: c, w: wU, h: hU, pad: pad / ppu };
  }

  /** A small distant floating island with a pink blossom tree. */
  function islandSprite(wU, seed, ppu) {
    const hU = wU * 0.9;
    const pad = 6;
    const c = makeCanvas(wU * ppu + pad * 2, hU * ppu + pad * 2);
    const g = c.getContext('2d');
    g.translate(pad, pad);
    g.scale(ppu, ppu);
    const r = rng(seed);
    const top = hU * 0.42;
    // rock
    const gr = g.createLinearGradient(0, top, 0, hU);
    gr.addColorStop(0, '#CFD7F6');
    gr.addColorStop(1, '#AEB6E6');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(wU * 0.06, top + 4);
    g.quadraticCurveTo(wU * 0.2, top + hU * 0.28, wU * (0.45 + r() * 0.1), hU * 0.98);
    g.quadraticCurveTo(wU * 0.8, top + hU * 0.3, wU * 0.94, top + 4);
    g.closePath();
    g.fill();
    // tree
    if (r() > 0.25) {
      const tx = wU * (0.3 + r() * 0.4);
      g.strokeStyle = '#B9A3B8';
      g.lineWidth = wU * 0.035;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(tx, top + 2);
      g.quadraticCurveTo(tx - wU * 0.03, top - hU * 0.14, tx + wU * 0.02, top - hU * 0.24);
      g.stroke();
      g.fillStyle = '#FFD3E3';
      for (let i = 0; i < 5; i++) {
        ellipse(g, tx + (r() - 0.5) * wU * 0.22, top - hU * 0.28 + (r() - 0.5) * hU * 0.12, wU * 0.09, wU * 0.09);
        g.fill();
      }
    }
    // cloud top
    g.fillStyle = '#FFFFFF';
    const n = 6;
    for (let i = 0; i < n; i++) {
      ellipse(g, wU * (0.08 + (0.84 * i) / (n - 1)), top + 2, wU * 0.085, wU * 0.07);
      g.fill();
    }
    roundRect(g, wU * 0.04, top - 1, wU * 0.92, wU * 0.08, wU * 0.04);
    g.fill();
    return { canvas: c, w: wU, h: hU, pad: pad / ppu };
  }

  function glowSprite(size, inner, outer) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  class World {
    constructor(level) {
      this.level = level;
      this.ppu = 0;
      const r = rng(42);
      const items = (count, opts) => {
        const out = [];
        for (let i = 0; i < count; i++) {
          out.push({
            x: (i / count) * LAYER_WRAP + r() * (LAYER_WRAP / count) * 0.8,
            y: lerp(opts.y0, opts.y1, r()),
            s: lerp(opts.s0, opts.s1, r()),
            v: Math.floor(r() * 6),
            drift: 3 + r() * 6
          });
        }
        return out;
      };
      this.layers = [
        { p: 0.1, pv: 0.04, alpha: 0.5, items: items(9, { y0: -220, y1: 180, s0: 0.9, s1: 1.4 }), kind: 'far' },
        { p: 0.22, pv: 0.08, alpha: 0.75, items: items(6, { y0: -60, y1: 230, s0: 0.7, s1: 1.2 }), kind: 'island' },
        { p: 0.42, pv: 0.18, alpha: 0.82, items: items(8, { y0: 60, y1: 420, s0: 0.75, s1: 1.15 }), kind: 'mid' },
        { p: 1.32, pv: 1.1, alpha: 0.34, items: items(4, { y0: 560, y1: 660, s0: 1.1, s1: 1.5 }), kind: 'fore' }
      ];
      this.stars = [];
      for (let i = 0; i < 46; i++) this.stars.push({ x: r(), y: r() * 0.55, s: 0.6 + r() * 1.4, ph: r() * 6, sparkle: r() > 0.7 });
      this.motes = [];
      for (let i = 0; i < 34; i++) this.motes.push({ x: r(), y: r(), s: 0.7 + r() * 1.6, sp: 0.01 + r() * 0.02, ph: r() * 6, pink: r() > 0.7 });
      this.seaPuffs = [];
      for (let i = 0; i < 40; i++) this.seaPuffs.push({ x: (i / 40) * 1600, r: 46 + r() * 34, y: r() * 16 });
      this.prepareArt();
    }

    /* Deterministic per-platform art (puffs, rock outline, flowers). */
    prepareArt() {
      for (const p of this.level.platforms) {
        const r = rng(p.seed);
        const top = [], bottom = [];
        const n = Math.max(3, Math.round(p.w / 24));
        for (let i = 0; i < n; i++) top.push({ dx: 9 + ((p.w - 18) * i) / (n - 1), r: 8.5 + r() * 3.5 });
        const m = Math.max(2, Math.round(p.w / 30));
        for (let i = 0; i < m; i++) bottom.push({ dx: 12 + ((p.w - 24) * i) / Math.max(1, m - 1), r: 8 + r() * 4 });
        const rock = [];
        if (p.kind === 'island') {
          const k = Math.max(5, Math.round(p.w / 45));
          for (let i = 0; i <= k; i++) {
            const t = i / k;
            const depth = p.depth * Math.pow(Math.sin(Math.PI * clamp(t, 0.02, 0.98)), 0.85) * (0.82 + r() * 0.3);
            rock.push({ t, d: 12 + depth });
          }
        }
        p.art = { top, bottom, rock };
      }
      for (const d of this.level.decor) {
        if (d.type !== 'flowers') continue;
        const r = rng(d.seed);
        d.items = [];
        const n = Math.round(d.w / (d.dense ? 22 : 40));
        const colors = ['#FFB8D2', '#FFFFFF', '#DCD6FF', '#FFA6C8'];
        for (let i = 0; i < n; i++) d.items.push({ x: d.x + r() * d.w, h: 6 + r() * 7, c: colors[Math.floor(r() * colors.length)], s: 0.75 + r() * 0.5, ph: r() * 6 });
        d.items.sort((a, b) => a.h - b.h);
      }
    }

    /** (Re)build sprites when the pixel density changes noticeably. */
    ensureSprites(ppu) {
      if (this.ppu && Math.abs(ppu - this.ppu) / this.ppu < 0.2) return;
      this.ppu = ppu;
      const sp = Math.min(ppu, 3);
      this.clouds = [];
      for (let i = 0; i < 6; i++) this.clouds.push(cloudSprite(300 + i * 25, 120 + (i % 3) * 18, 100 + i, sp * 0.6, 'rgba(200,225,250,0.75)'));
      this.islands = [];
      for (let i = 0; i < 4; i++) this.islands.push(islandSprite(110 + i * 14, 300 + i, sp * 0.6));
      this.heartGlow = glowSprite(128, 'rgba(255,170,205,0.75)', 'rgba(255,184,210,0)');
      this.softGlow = glowSprite(128, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    }

    /* ── Screen-space background ─────────────────────────────── */
    drawSky(ctx, W, H, magic, time) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mix('#8CC9EF', '#A7B6EE', magic * 0.55));
      g.addColorStop(0.45, mix('#BDE7FF', '#CCDAFF', magic * 0.45));
      g.addColorStop(1, mix('#E2F4FF', '#FFE3EE', magic * 0.7));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // soft sun glow
      const sx = W * 0.8, sy = H * 0.1, sr = Math.max(W, H) * 0.55;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, `rgba(255,255,255,${0.55 + magic * 0.1})`);
      sg.addColorStop(0.35, 'rgba(255,255,255,0.18)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
    }

    drawStars(ctx, W, H, camX, magic, time, unit) {
      const vis = 0.45 + magic * 0.5;
      for (const s of this.stars) {
        const x = (((s.x * W - camX * 0.03 * unit) % W) + W) % W;
        const y = s.y * H;
        const tw = 0.5 + 0.5 * Math.sin(time * (1.3 + s.s) + s.ph);
        ctx.globalAlpha = vis * (0.35 + tw * 0.65) * (1 - s.y);
        ctx.fillStyle = '#FFFFFF';
        const size = s.s * unit * 1.1;
        if (s.sparkle) { sparklePath(ctx, x, y, size * 2.4); ctx.fill(); }
        else { ellipse(ctx, x, y, size * 0.7, size * 0.7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    /** One parallax layer. `cam` = { x, y, zoom }, S = pixels per world unit. */
    drawLayer(ctx, layer, cam, W, H, S, time) {
      const zl = 1 + (cam.zoom - 1) * layer.p;
      const k = S * zl;
      const viewHalf = W / k / 2;
      ctx.globalAlpha = layer.alpha;
      for (const it of layer.items) {
        const sprite = layer.kind === 'island' ? this.islands[it.v % this.islands.length] : this.clouds[it.v];
        const w = sprite.w * it.s * (layer.kind === 'island' ? 1 : layer.kind === 'far' ? 1.1 : 0.85);
        const h = sprite.h * it.s * (layer.kind === 'island' ? 1 : layer.kind === 'far' ? 1.1 : 0.85);
        let rx = it.x + time * it.drift * (layer.kind === 'island' ? 0.3 : 1) - cam.x * layer.p;
        rx = ((rx + LAYER_WRAP / 2) % LAYER_WRAP + LAYER_WRAP) % LAYER_WRAP - LAYER_WRAP / 2;
        if (rx + w < -viewHalf - 40 || rx - w > viewHalf + 40) continue;
        const bob = layer.kind === 'island' ? Math.sin(time * 0.6 + it.x) * 6 : 0;
        // Item y is authored for a camera centred at y=250; deeper layers follow less.
        const rel = it.y + bob - 250 - (cam.y - 250) * layer.pv;
        const sx = W / 2 + (rx - w / 2) * k;
        const sy = H / 2 + (rel - h / 2) * k;
        const pad = sprite.pad * it.s;
        ctx.drawImage(sprite.canvas, sx - pad * k, sy - pad * k, (w + pad * 2) * k, (h + pad * 2) * k);
      }
      ctx.globalAlpha = 1;
    }

    drawMotes(ctx, W, H, time, unit) {
      const n = motion.reduced ? 12 : this.motes.length;
      for (let i = 0; i < n; i++) {
        const m = this.motes[i];
        const y = ((m.y - time * m.sp) % 1 + 1) % 1;
        const x = m.x + Math.sin(time * 0.6 + m.ph) * 0.015;
        ctx.globalAlpha = 0.25 + 0.3 * Math.sin(time * 1.7 + m.ph) ** 2;
        ctx.fillStyle = m.pink ? '#FFD3E3' : '#FFFFFF';
        ellipse(ctx, x * W, y * H, m.s * unit, m.s * unit);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawVignette(ctx, W, H, magic) {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      g.addColorStop(0, 'rgba(77,148,199,0)');
      g.addColorStop(1, `rgba(${Math.round(lerp(77, 160, magic))},${Math.round(lerp(148, 140, magic))},${Math.round(lerp(199, 220, magic))},0.16)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* ── World-space drawing (ctx already in world transform) ──── */

    /** The endless soft cloud sea far below the platforms. */
    drawSea(ctx, view, time, front) {
      const y0 = front ? 660 : 610;
      const left = view.x0 - 120, right = view.x1 + 120;
      const period = 1600;
      const startK = Math.floor(left / period);
      ctx.fillStyle = front ? 'rgba(255,255,255,0.92)' : '#F4FAFF';
      for (let k = startK; k * period < right; k++) {
        for (const p of this.seaPuffs) {
          const x = k * period + p.x + (front ? 40 : 0);
          if (x + p.r < left || x - p.r > right) continue;
          const y = y0 + p.y + Math.sin(time * 0.5 + p.x) * 3;
          ellipse(ctx, x, y, p.r, p.r * 0.72);
          ctx.fill();
        }
      }
      if (view.y1 > y0) {
        const g = ctx.createLinearGradient(0, y0, 0, y0 + 220);
        g.addColorStop(0, front ? 'rgba(255,255,255,0.92)' : '#F4FAFF');
        g.addColorStop(1, front ? 'rgba(234,245,255,0.98)' : '#E6F3FF');
        ctx.fillStyle = g;
        ctx.fillRect(left, y0, right - left, Math.max(0, view.y1 - y0 + 40));
      }
    }

    drawFinalGlow(ctx, intensity, time) {
      const x = this.level.nuwaraX, y = 250;
      const r = 560 + Math.sin(time * 0.8) * 20;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,230,240,${0.55 * intensity})`);
      g.addColorStop(0.45, `rgba(255,214,232,${0.22 * intensity})`);
      g.addColorStop(1, 'rgba(220,214,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    platformVisible(p, view) {
      return p.x + p.w > view.x0 - 60 && p.x < view.x1 + 60 && p.y - 120 < view.y1 && p.y + p.depth + 60 > view.y0;
    }

    drawPlatforms(ctx, view, time) {
      for (const p of this.level.platforms) {
        if (p.kind === 'bridge' || !this.platformVisible(p, view)) continue;
        if (p.kind === 'island') this.drawIsland(ctx, p, time);
        else this.drawCloud(ctx, p, time);
      }
    }

    drawCloudTop(ctx, p, x, y, w, colors) {
      const a = p.art;
      ctx.fillStyle = colors.under;
      for (const b of a.bottom) { ellipse(ctx, x + b.dx, y + 15, b.r, b.r * 0.85); ctx.fill(); }
      const g = ctx.createLinearGradient(0, y - 6, 0, y + 22);
      g.addColorStop(0, colors.top);
      g.addColorStop(1, colors.body);
      ctx.fillStyle = g;
      roundRect(ctx, x, y - 2, w, 21, 10.5);
      ctx.fill();
      ctx.fillStyle = colors.top;
      for (const t of a.top) { ellipse(ctx, x + t.dx, y + 5, t.r, t.r); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < a.top.length; i += 2) { const t = a.top[i]; ellipse(ctx, x + t.dx - t.r * 0.3, y + 1, t.r * 0.35, t.r * 0.22); ctx.fill(); }
    }

    drawCloud(ctx, p, time) {
      const { x, y, w } = p;
      // drop shadow
      ctx.fillStyle = 'rgba(77,148,199,0.10)';
      ellipse(ctx, x + w / 2, y + 44, w * 0.42, 7);
      ctx.fill();
      ctx.save();
      if (p.kind === 'bounce') {
        const bt = p.bounceT;
        const squash = bt < 0.6 ? 0.28 * Math.exp(-bt * 7) * Math.cos(bt * 24) : 0;
        const idle = Math.sin(time * 3) * 0.02;
        ctx.translate(x + w / 2, y + 10);
        ctx.scale(1 + squash * 0.6 - idle, 1 - squash + idle);
        ctx.translate(-(x + w / 2), -(y + 10));
        this.drawCloudTop(ctx, p, x, y, w, { top: '#FFF3F8', body: '#F9D3E3', under: '#F5C3D8' });
        ctx.fillStyle = 'rgba(245,143,184,0.75)';
        heartPath(ctx, x + w / 2, y + 10, 6.5);
        ctx.fill();
        // springy swirls
        ctx.strokeStyle = 'rgba(245,143,184,0.55)';
        ctx.lineWidth = 1.6;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + w / 2 + s * 26, y + 10, 4, 0, Math.PI * 1.5);
          ctx.stroke();
        }
      } else {
        this.drawCloudTop(ctx, p, x, y, w, { top: '#FFFFFF', body: '#E4F2FD', under: '#D3E9FA' });
        if (p.move) this.drawWings(ctx, p, time);
      }
      ctx.restore();
    }

    drawWings(ctx, p, time) {
      const flap = Math.sin(time * 9 + p.index) * 0.35;
      for (const side of [-1, 1]) {
        const wx = side < 0 ? p.x + 2 : p.x + p.w - 2;
        ctx.save();
        ctx.translate(wx, p.y + 8);
        ctx.scale(side, 1);
        ctx.rotate(-0.25 + flap);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = 'rgba(141,196,234,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(10, -16, 24, -14);
        ctx.quadraticCurveTo(20, -9, 22, -6);
        ctx.quadraticCurveTo(16, -4, 18, 0);
        ctx.quadraticCurveTo(10, 2, 0, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    drawIsland(ctx, p, time) {
      const { x, y, w } = p;
      const a = p.art;
      // rock underside
      const g = ctx.createLinearGradient(0, y, 0, y + p.depth + 12);
      g.addColorStop(0, '#DCE3FA');
      g.addColorStop(0.5, '#C2CBF1');
      g.addColorStop(1, '#A9B2E4');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 8);
      for (let i = 0; i < a.rock.length; i++) {
        const r = a.rock[i];
        const px = x + 4 + (w - 8) * r.t, py = y + r.d;
        if (i === 0) ctx.lineTo(px, py);
        else {
          const prev = a.rock[i - 1];
          const mx = x + 4 + (w - 8) * (prev.t + r.t) / 2;
          ctx.quadraticCurveTo(x + 4 + (w - 8) * prev.t, y + prev.d, mx, y + (prev.d + r.d) / 2);
        }
      }
      ctx.lineTo(x + w - 4, y + 8);
      ctx.closePath();
      ctx.fill();
      // facets
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < a.rock.length - 1; i += 2) {
        const r = a.rock[i];
        const px = x + 4 + (w - 8) * r.t;
        ctx.beginPath();
        ctx.moveTo(px, y + 18);
        ctx.lineTo(px + 6, y + r.d * 0.7);
        ctx.stroke();
      }
      // a few tiny glints hanging under the rock
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 2; i < a.rock.length - 2; i += 3) {
        const r = a.rock[i];
        const px = x + 4 + (w - 8) * r.t;
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
        sparklePath(ctx, px + 4, y + r.d + 10 + Math.sin(time + i) * 3, 2.2 + tw * 1.4);
        ctx.fill();
      }
      this.drawCloudTop(ctx, p, x - 4, y, w + 8, { top: '#FFFFFF', body: '#EAF5FE', under: '#D9ECFB' });
    }

    drawBridge(ctx, time, worldTime, hearts) {
      const b = this.level.bridge;
      const formAt = this.level.bridgeFormAt;
      const n = 9;
      if (formAt === null) {
        // a dotted ghost path with five heart "sockets" above the gap
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(245,143,184,0.45)';
        ctx.lineWidth = 2;
        for (let i = 0; i < n; i++) {
          const px = b.x + 14 + ((b.w - 28) * i) / (n - 1);
          ellipse(ctx, px, b.y + 7 + Math.sin(time * 1.5 + i) * 2, 13, 10);
          ctx.stroke();
        }
        ctx.restore();
        for (let i = 0; i < 5; i++) {
          const hx = b.x + b.w / 2 + (i - 2) * 30;
          const hy = b.y - 70 + Math.sin(time * 2 + i) * 3;
          const filled = i < hearts;
          ctx.globalAlpha = filled ? 0.95 : 0.55;
          ctx.fillStyle = filled ? '#F58FB8' : 'rgba(255,255,255,0.6)';
          heartPath(ctx, hx, hy, 8);
          ctx.fill();
          ctx.strokeStyle = filled ? '#FFFFFF' : 'rgba(245,143,184,0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        return;
      }
      const f = (worldTime - formAt) / 1.6;
      for (let i = 0; i < n; i++) {
        const local = clamp(f * 1.4 - (i / n) * 0.9, 0, 1);
        if (local <= 0) continue;
        const s = ease.outBack(local);
        const px = b.x + 14 + ((b.w - 28) * i) / (n - 1);
        const py = b.y + 7 + Math.sin(time * 1.5 + i) * 1.5;
        ctx.fillStyle = 'rgba(77,148,199,0.08)';
        ellipse(ctx, px, py + 30, 14 * s, 4 * s);
        ctx.fill();
        const g = ctx.createRadialGradient(px - 4, py - 5, 1, px, py, 17 * s);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(1, '#FFD9E8');
        ctx.fillStyle = g;
        ellipse(ctx, px, py, 17 * s, 13 * s);
        ctx.fill();
        ctx.fillStyle = 'rgba(245,143,184,0.8)';
        heartPath(ctx, px, py + 2, 3.6 * s);
        ctx.fill();
      }
    }

    drawDecor(ctx, view, time) {
      for (const d of this.level.decor) {
        if (d.x + (d.w || 80) < view.x0 - 80 || d.x > view.x1 + 80) continue;
        if (d.type === 'flowers') {
          for (const f of d.items) {
            const sway = Math.sin(time * 1.6 + f.ph) * 0.12;
            ctx.save();
            ctx.translate(f.x, d.y + 2);
            ctx.rotate(sway);
            ctx.scale(f.s, f.s);
            ctx.strokeStyle = '#8ED6A5';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -f.h);
            ctx.stroke();
            ctx.fillStyle = f.c;
            for (let i = 0; i < 5; i++) {
              const a = (i / 5) * Math.PI * 2;
              ellipse(ctx, Math.sin(a) * 2.4, -f.h - Math.cos(a) * 2.4, 2.1, 2.1);
              ctx.fill();
            }
            ctx.fillStyle = '#FFE08A';
            ellipse(ctx, 0, -f.h, 1.4, 1.4);
            ctx.fill();
            ctx.restore();
          }
        } else if (d.type === 'tree') this.drawTree(ctx, d.x, d.y, time);
        else if (d.type === 'lantern') this.drawLantern(ctx, d.x, d.y + Math.sin(time * 1.2 + d.x) * 6, time);
        else if (d.type === 'sign') this.drawSign(ctx, d.x, d.y, time);
      }
    }

    drawTree(ctx, x, y, time) {
      ctx.strokeStyle = '#B48F80';
      ctx.lineCap = 'round';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.quadraticCurveTo(x - 10, y - 50, x + 6, y - 92);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 55);
      ctx.quadraticCurveTo(x - 26, y - 70, x - 34, y - 88);
      ctx.moveTo(x + 2, y - 70);
      ctx.quadraticCurveTo(x + 24, y - 80, x + 34, y - 98);
      ctx.stroke();
      const blobs = [[-36, -98, 26], [-8, -118, 32], [26, -108, 28], [40, -88, 20], [-46, -80, 18], [8, -90, 26], [-18, -88, 22]];
      const colors = ['#FFD9E6', '#FFC7DB', '#FFB8D2'];
      blobs.forEach((b, i) => {
        ctx.fillStyle = colors[i % 3];
        ellipse(ctx, x + b[0] + Math.sin(time * 0.8 + i) * 1.5, y + b[1], b[2], b[2] * 0.9);
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      blobs.forEach((b, i) => {
        if (i % 2) return;
        ellipse(ctx, x + b[0] - b[2] * 0.3, y + b[1] - b[2] * 0.35, b[2] * 0.35, b[2] * 0.22);
        ctx.fill();
      });
    }

    drawLantern(ctx, x, y, time) {
      const size = 60 + Math.sin(time * 2 + x) * 6;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.heartGlow, x - size / 2, y - size / 2, size, size);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#FFF6FA';
      ellipse(ctx, x, y, 8, 9.5);
      ctx.fill();
      ctx.fillStyle = '#FFB8D2';
      heartPath(ctx, x, y + 0.5, 3.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 9.5);
      ctx.lineTo(x, y - 18);
      ctx.stroke();
    }

    drawSign(ctx, x, y, time) {
      ctx.fillStyle = '#D9BFA9';
      roundRect(ctx, x - 2.5, y - 46, 5, 48, 2.5);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y - 50);
      ctx.rotate(Math.sin(time * 1.2) * 0.03);
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#8DC4EA';
      ctx.lineWidth = 2;
      roundRect(ctx, -26, -14, 52, 26, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F58FB8';
      heartPath(ctx, -9, -1, 6);
      ctx.fill();
      ctx.strokeStyle = '#4D94C7';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(3, -1); ctx.lineTo(16, -1);
      ctx.moveTo(11, -6); ctx.lineTo(16, -1); ctx.lineTo(11, 4);
      ctx.stroke();
      ctx.restore();
    }

    drawHeart(ctx, h, time) {
      if (h.collected && h.collectT > 0.6) return;
      const bob = Math.sin(time * 2.2 + h.index * 1.3) * 5;
      const pulse = 1 + Math.sin(time * 4 + h.index) * 0.06;
      let s = 13 * pulse, a = 1;
      if (h.collected) {
        const k = h.collectT / 0.6;
        s *= 1 + ease.out(k) * 0.9;
        a = 1 - k;
      }
      const x = h.x, y = h.y + bob;
      ctx.globalAlpha = a * (0.65 + Math.sin(time * 3 + h.index) * 0.2);
      const gs = 96 * pulse;
      ctx.drawImage(this.heartGlow, x - gs / 2, y - gs / 2, gs, gs);
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
      g.addColorStop(0, '#FFC8DD');
      g.addColorStop(1, '#F07AAD');
      ctx.fillStyle = g;
      heartPath(ctx, x, y, s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ellipse(ctx, x - s * 0.45, y - s * 0.32, s * 0.27, s * 0.16, -0.6);
      ctx.fill();
      if (!h.collected) {
        ctx.fillStyle = '#FFFFFF';
        for (let k = 0; k < 2; k++) {
          const ang = time * 1.8 + k * Math.PI + h.index;
          const tw = 0.5 + 0.5 * Math.sin(time * 5 + k * 2);
          sparklePath(ctx, x + Math.cos(ang) * s * 1.75, y + Math.sin(ang) * s * 1.2, 2 + tw * 2.2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    drawHazard(ctx, h, time) {
      const x = h.x, y = h.y + h.bob, dir = h.dir;
      ctx.strokeStyle = 'rgba(140,195,235,0.85)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const ph = (time * 1.5 + i * 0.27) % 1;
        const dx = (i - 1.5) * 8.5;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.beginPath();
        ctx.moveTo(x + dx, y + 16 + ph * 26);
        ctx.lineTo(x + dx - 1, y + 21 + ph * 26);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, y - 22, 0, y + 18);
      g.addColorStop(0, '#C5C9E6');
      g.addColorStop(1, '#9EA4CC');
      ctx.fillStyle = g;
      for (const c of [[-12, 3, 11.5], [0, -5, 15.5], [13, 2, 11.5], [3, 7, 12.5], [-5, 6, 11]]) {
        ellipse(ctx, x + c[0], y + c[1], c[2], c[2]);
        ctx.fill();
      }
      // grumpy little face
      ctx.strokeStyle = '#5E6390';
      ctx.lineWidth = 1.6;
      const fx = x + dir * 3;
      ctx.beginPath();
      ctx.arc(fx - 5.5, y + 0.5, 2.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(fx + 3.3, y + 0.5);
      ctx.arc(fx + 5.5, y + 0.5, 2.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(fx - 8.5, y - 5);
      ctx.lineTo(fx - 3, y - 3);
      ctx.moveTo(fx + 8.5, y - 5);
      ctx.lineTo(fx + 3, y - 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx, y + 9, 3, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }

    drawForeground(ctx, cam, W, H, S, time) {
      this.drawLayer(ctx, this.layers[3], cam, W, H, S, time);
    }
  }

  LM.World = World;
})();

/* A tiny pooled particle system: sparkles, hearts, dust, rings. */
(function () {
  'use strict';
  const LM = window.LM;
  const { heartPath, sparklePath, ellipse, motion } = LM.U;

  class Particles {
    constructor() {
      this.list = [];
      this.max = 420;
    }

    clear() { this.list.length = 0; }

    /** Fewer optional particles when the player prefers reduced motion. */
    count(n) { return motion.reduced ? Math.max(1, Math.round(n * 0.35)) : n; }

    spawn(o) {
      if (this.list.length >= this.max) this.list.shift();
      const p = Object.assign({
        x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 1.5,
        life: 1, age: 0, size: 4, grow: 0, rot: 0, vr: 0,
        color: '#FFFFFF', type: 'sparkle', alpha: 1, wobble: 0
      }, o);
      this.list.push(p);
      return p;
    }

    burst(x, y, opts) {
      const o = Object.assign({ n: 16, speed: 220, type: 'sparkle', colors: ['#FFFFFF', '#FFB8D2'], life: 0.9, size: 5, g: 60, spread: Math.PI * 2, dir: -Math.PI / 2 }, opts);
      const n = this.count(o.n);
      for (let i = 0; i < n; i++) {
        const a = o.dir + (Math.random() - 0.5) * o.spread;
        const s = o.speed * (0.4 + Math.random() * 0.6);
        this.spawn({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          g: o.g,
          life: o.life * (0.7 + Math.random() * 0.5),
          size: o.size * (0.6 + Math.random() * 0.7),
          color: o.colors[i % o.colors.length],
          type: o.type,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 6,
          wobble: o.wobble || 0
        });
      }
    }

    dust(x, y, n) {
      const count = this.count(n || 6);
      for (let i = 0; i < count; i++) {
        const dir = i % 2 ? 1 : -1;
        this.spawn({
          x: x + dir * (4 + Math.random() * 6), y: y - 2,
          vx: dir * (40 + Math.random() * 70), vy: -20 - Math.random() * 40,
          g: 0, drag: 4, life: 0.45 + Math.random() * 0.2, size: 4 + Math.random() * 3, grow: 8,
          color: '#FFFFFF', type: 'dust'
        });
      }
    }

    ring(x, y, color, size, life, grow) {
      this.spawn({ x, y, type: 'ring', color: color || '#FFFFFF', size: size || 8, grow: grow || 140, life: life || 0.6, drag: 0 });
    }

    update(dt) {
      const list = this.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) { list.splice(i, 1); continue; }
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy = p.vy * d + p.g * dt;
        if (p.wobble) p.vx += Math.sin(p.age * 5 + p.rot) * p.wobble * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.size += p.grow * dt;
      }
    }

    draw(ctx) {
      for (const p of this.list) {
        const t = p.age / p.life;
        const fade = t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 1.6);
        ctx.globalAlpha = Math.max(0, fade * p.alpha);
        ctx.fillStyle = p.color;
        switch (p.type) {
          case 'heart':
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.sin(p.rot) * 0.3);
            heartPath(ctx, 0, 0, p.size);
            ctx.fill();
            ctx.restore();
            break;
          case 'dust':
            ellipse(ctx, p.x, p.y, p.size, p.size * 0.8);
            ctx.fill();
            break;
          case 'ring':
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.2 * (1 - t) + 0.4;
            ellipse(ctx, p.x, p.y, p.size, p.size);
            ctx.stroke();
            break;
          case 'dot':
            ellipse(ctx, p.x, p.y, p.size, p.size);
            ctx.fill();
            break;
          default:
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * 0.2);
            sparklePath(ctx, 0, 0, p.size * (1 - t * 0.4));
            ctx.fill();
            ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  LM.Particles = Particles;
})();

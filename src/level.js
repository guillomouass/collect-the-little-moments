/*
 * The handcrafted sky level. World units: y grows downward, platform `y` is
 * the walkable top surface. Mahmood jumps ≈155 units high and ≈215 far, so
 * every gap below is ≤ 90 wide and every climb ≤ 110 — forgiving on purpose.
 */
(function () {
  'use strict';
  const LM = window.LM;

  const DATA = {
    bounds: { minX: -240, maxX: 6700, killY: 700, camTop: -560, camBottom: 780 },
    spawn: { x: 40, y: 420 },
    platforms: [
      { id: 'start', x: -240, y: 420, w: 620, kind: 'island', depth: 120 },
      { x: 470, y: 400, w: 170, kind: 'cloud' },
      { x: 720, y: 360, w: 160, kind: 'cloud' },
      { x: 960, y: 400, w: 260, kind: 'island', depth: 80 },
      { x: 1300, y: 330, w: 140, kind: 'cloud' },
      { x: 1500, y: 250, w: 140, kind: 'cloud' },
      { x: 1700, y: 180, w: 170, kind: 'cloud' },
      { x: 1960, y: 300, w: 280, kind: 'island', depth: 90 },
      { id: 'mover1', x: 2330, y: 320, w: 130, kind: 'cloud', move: { dx: 200, dy: 0, period: 4.4 } },
      { x: 2720, y: 300, w: 200, kind: 'cloud' },
      { x: 3000, y: 230, w: 120, kind: 'cloud', move: { dx: 0, dy: 150, period: 4.0 } },
      { x: 3200, y: 220, w: 160, kind: 'cloud' },
      { x: 3450, y: 380, w: 360, kind: 'island', depth: 100 },
      { id: 'bounce', x: 3900, y: 420, w: 110, kind: 'bounce' },
      { x: 4080, y: 170, w: 180, kind: 'cloud' },
      { x: 4330, y: 230, w: 150, kind: 'cloud' },
      { x: 4560, y: 300, w: 300, kind: 'island', depth: 95 },
      { x: 4950, y: 260, w: 120, kind: 'cloud', move: { dx: 200, dy: 0, period: 4.0, phase: 0.5 } },
      { x: 5330, y: 320, w: 150, kind: 'cloud' },
      { id: 'gate', x: 5560, y: 360, w: 300, kind: 'island', depth: 100 },
      { x: 5640, y: 250, w: 100, kind: 'cloud' },
      { id: 'bridge', x: 5860, y: 360, w: 240, kind: 'bridge' },
      { id: 'final', x: 6100, y: 360, w: 560, kind: 'island', depth: 150 }
    ],
    // Exactly five hearts, in route order. `ride` attaches a heart to a moving platform.
    hearts: [
      { x: 800, y: 318 },
      { x: 1785, y: 140 },
      { ride: 'mover1', ox: 65, oy: -48 },
      { x: 3955, y: 150 },
      { x: 5690, y: 208 }
    ],
    // Grumpy little rain clouds: touching one only bumps Mahmood back.
    hazards: [
      { x: 2040, y: 274, dx: 130, period: 5.0, r: 19 },
      { x: 3520, y: 354, dx: 220, period: 4.6, r: 19 },
      { x: 4630, y: 274, dx: 170, period: 3.8, r: 19 }
    ],
    gateX: 5860,
    nuwaraX: 6420,
    finalTriggerX: 6170,
    decor: [
      { type: 'sign', x: 250, y: 420 },
      { type: 'flowers', x: -150, y: 420, w: 240, seed: 3 },
      { type: 'flowers', x: 1000, y: 400, w: 180, seed: 5 },
      { type: 'flowers', x: 1990, y: 300, w: 200, seed: 8 },
      { type: 'flowers', x: 3480, y: 380, w: 300, seed: 11 },
      { type: 'flowers', x: 4590, y: 300, w: 240, seed: 13 },
      { type: 'flowers', x: 5590, y: 360, w: 240, seed: 17 },
      { type: 'tree', x: 6540, y: 360 },
      { type: 'flowers', x: 6130, y: 360, w: 500, seed: 21, dense: true },
      { type: 'lantern', x: 6200, y: 230 },
      { type: 'lantern', x: 6330, y: 180 },
      { type: 'lantern', x: 6600, y: 210 }
    ]
  };

  class Level {
    constructor() {
      this.data = DATA;
      this.bounds = DATA.bounds;
      this.spawn = DATA.spawn;
      this.gateX = DATA.gateX;
      this.nuwaraX = DATA.nuwaraX;
      this.finalTriggerX = DATA.finalTriggerX;
      this.platforms = DATA.platforms.map((p, i) => ({
        ...p,
        index: i,
        baseX: p.x,
        baseY: p.y,
        prevX: p.x,
        prevY: p.y,
        dx: 0,
        dy: 0,
        depth: p.depth || (p.kind === 'island' ? 90 : 24),
        solid: p.kind !== 'bridge',
        bounceT: 9,
        seed: i * 97 + 13
      }));
      this.byId = {};
      for (const p of this.platforms) if (p.id) this.byId[p.id] = p;
      this.final = this.byId.final;
      this.bridge = this.byId.bridge;
      this.gate = this.byId.gate;
      this.hearts = DATA.hearts.map((h, i) => ({ ...h, index: i, x: h.x || 0, y: h.y || 0, collected: false, collectT: 9 }));
      this.hazards = DATA.hazards.map((h, i) => ({ ...h, baseX: h.x, x: h.x, y: h.y, index: i }));
      this.decor = DATA.decor;
      this.reset();
    }

    reset() {
      for (const p of this.platforms) {
        p.x = p.prevX = p.baseX;
        p.y = p.prevY = p.baseY;
        p.dx = p.dy = 0;
        p.bounceT = 9;
      }
      this.bridge.solid = false;
      this.bridgeFormAt = null; // world time when the heart-bridge starts forming
      for (const h of this.hearts) { h.collected = false; h.collectT = 9; }
      this.update(0);
      for (const p of this.platforms) { p.prevX = p.x; p.prevY = p.y; p.dx = p.dy = 0; }
    }

    get collectedCount() { return this.hearts.reduce((n, h) => n + (h.collected ? 1 : 0), 0); }

    /** Advance moving parts to absolute world time `t` (deterministic). */
    update(t) {
      for (const p of this.platforms) {
        p.prevX = p.x;
        p.prevY = p.y;
        if (p.move) {
          const k = 0.5 - 0.5 * Math.cos(((t / p.move.period) + (p.move.phase || 0)) * Math.PI * 2);
          p.x = p.baseX + p.move.dx * k;
          p.y = p.baseY + p.move.dy * k;
        }
        p.dx = p.x - p.prevX;
        p.dy = p.y - p.prevY;
      }
      for (const h of this.hazards) {
        const k = 0.5 - 0.5 * Math.cos((t / h.period) * Math.PI * 2);
        h.x = h.baseX + h.dx * k;
        h.dir = Math.sin((t / h.period) * Math.PI * 2) >= 0 ? 1 : -1;
        h.bob = Math.sin(t * 2.6 + h.index) * 4;
      }
      for (const h of this.hearts) {
        if (h.ride) {
          const p = this.byId[h.ride];
          h.x = p.x + h.ox;
          h.y = p.y + h.oy;
        }
      }
      if (this.bridgeFormAt !== null && !this.bridge.solid && t - this.bridgeFormAt > 1.6) this.bridge.solid = true;
    }

    formBridge(t) {
      if (this.bridgeFormAt === null) this.bridgeFormAt = t;
    }

    /** Top of the nearest solid platform below (x, y), for the soft drop shadow. */
    groundBelow(x, y) {
      let best = null;
      for (const p of this.platforms) {
        if (!p.solid || x < p.x || x > p.x + p.w || p.y < y - 1) continue;
        if (!best || p.y < best.y) best = p;
      }
      return best;
    }
  }

  LM.Level = Level;
})();

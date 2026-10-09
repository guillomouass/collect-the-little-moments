/* Smooth platformer camera with look-ahead, level clamping and cutscene focus. */
(function () {
  'use strict';
  const LM = window.LM;
  const { clamp, damp, lerp, invLerp } = LM.U;

  class Camera {
    constructor() {
      this.x = 0;
      this.y = 250;
      this.zoom = 1;
      this.look = 0;
      this.viewW = 800; // visible world size at the current zoom (set by the game)
      this.viewH = 520;
    }

    setView(W, H, S) {
      this.viewW = W / (S * this.zoom);
      this.viewH = H / (S * this.zoom);
    }

    snap(x, y) {
      this.x = x;
      this.y = y;
      this.look = 0;
    }

    /** Follow Mahmood during play. `feetFrac` = where his feet sit on screen (0 top → 1 bottom). */
    follow(dt, pl, level, feetFrac) {
      const moving = Math.abs(pl.vx) > 40;
      this.look = damp(this.look, pl.facing * (moving ? 95 : 55), 2.2, dt);
      let tx = pl.x + this.look;
      // Near the heart gate, drift toward Nuwara so she is revealed in the distance.
      const reveal = invLerp(5450, 5800, pl.x);
      if (reveal > 0) tx = lerp(tx, (pl.x + level.nuwaraX) / 2, reveal * 0.55);
      const ty = pl.y - (feetFrac - 0.5) * this.viewH;
      this.x = damp(this.x, tx, 4.5, dt);
      this.y = damp(this.y, ty, pl.onGround ? 4 : 2.6, dt);
      // Hard margins so a big bounce never leaves the screen.
      const headroom = this.y - this.viewH / 2 + 70;
      if (pl.y - 64 < headroom) this.y -= headroom - (pl.y - 64);
      this.clamp(level.bounds);
    }

    /** Ease toward a cutscene framing. */
    focus(dt, tx, ty, tzoom, k, bounds) {
      this.x = damp(this.x, tx, k, dt);
      this.y = damp(this.y, ty, k, dt);
      this.zoom = damp(this.zoom, tzoom, k * 0.7, dt);
      if (bounds) this.clamp(bounds);
    }

    clamp(b) {
      const minX = b.minX + this.viewW / 2, maxX = b.maxX + 140 - this.viewW / 2;
      this.x = minX > maxX ? (b.minX + b.maxX) / 2 : clamp(this.x, minX, maxX);
      const minY = b.camTop + this.viewH / 2, maxY = b.camBottom - this.viewH / 2;
      this.y = minY > maxY ? (b.camTop + b.camBottom) / 2 : clamp(this.y, minY, maxY);
    }
  }

  LM.Camera = Camera;
})();

/*
 * Mahmood's body: movement, gravity, one-way platform collision, landing,
 * bouncing, knockback. Called with small fixed sub-steps by the game loop.
 * One-way platforms mean there are no walls to get stuck in.
 */
(function () {
  'use strict';
  const LM = window.LM;
  const { clamp, approach } = LM.U;

  const PHYS = {
    RUN: 290,
    ACC_GROUND: 2500,
    DEC_GROUND: 3400, // stops quickly: no ice-skating
    TURN: 4600,
    ACC_AIR: 1800,
    DEC_AIR: 800,
    JUMP_V: 800,
    G_UP: 2050,
    G_DOWN: 2500,
    MAX_FALL: 1050,
    COYOTE: 0.11,
    BOUNCE_V: 1180,
    HALF_W: 13,
    H: 54
  };

  class Player {
    constructor() {
      this.events = null; // (name, data) => void
      this.reset(0, 0);
    }

    reset(x, y) {
      this.x = x;
      this.y = y; // feet
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.ground = null;
      this.facing = 1;
      this.coyote = 0;
      this.jumping = false;
      this.jumpCut = false;
      this.invuln = 0;
      this.lock = 0;
      this.airTime = 0;
      this.landT = 9;
      this.hurtT = 9;
      this.groundedTime = 0;
      this.runPhase = 0;
      this.safe = { x, y };
      this.gateLocked = true;
      this.gateBumpT = 9;
    }

    emit(name, data) { if (this.events) this.events(name, data); }

    /**
     * @param dt     sub-step seconds
     * @param ctl    { move, jumpHeld, wantJump, onJump } or null for no control
     * @param level  LM.Level
     */
    step(dt, ctl, level) {
      const P = PHYS;
      // Ride moving platforms.
      if (this.onGround && this.ground) {
        this.x += this.ground.dx;
        this.y = this.ground.y;
      }

      let move = ctl ? ctl.move : 0;
      if (this.lock > 0) { this.lock -= dt; move = 0; }
      const target = move * P.RUN;
      let a;
      if (this.lock > 0) a = 260; // let a knockback carry a little
      else if (this.onGround) a = move === 0 ? P.DEC_GROUND : (this.vx !== 0 && Math.sign(move) !== Math.sign(this.vx) ? P.TURN : P.ACC_GROUND);
      else a = move === 0 ? P.DEC_AIR : P.ACC_AIR;
      this.vx = approach(this.vx, target, a * dt);
      if (move !== 0) this.facing = move > 0 ? 1 : -1;

      // Jump (buffered press + coyote time make it forgiving).
      if (ctl && ctl.wantJump && (this.onGround || this.coyote > 0) && this.lock <= 0) {
        this.vy = -P.JUMP_V;
        this.onGround = false;
        this.ground = null;
        this.coyote = 0;
        this.jumping = true;
        this.jumpCut = false;
        ctl.wantJump = false;
        if (ctl.onJump) ctl.onJump();
        this.emit('jump');
      }
      // Releasing early gives a shorter hop.
      if (this.jumping && !this.jumpCut && this.vy < 0 && !(ctl && ctl.jumpHeld)) {
        this.vy *= 0.5;
        this.jumpCut = true;
      }

      if (!this.onGround) {
        let g = this.vy < 0 ? P.G_UP : P.G_DOWN;
        if (ctl && ctl.jumpHeld && Math.abs(this.vy) < 140) g *= 0.55; // floaty apex
        this.vy = Math.min(this.vy + g * dt, P.MAX_FALL);
      }

      // Horizontal motion + world bounds + the heart gate.
      this.x += this.vx * dt;
      const b = level.bounds;
      this.x = clamp(this.x, b.minX + P.HALF_W, b.maxX - P.HALF_W);
      if (this.gateLocked && this.x > level.gateX - P.HALF_W) {
        this.x = level.gateX - P.HALF_W;
        if (this.vx > 0) this.vx = 0;
        if (this.gateBumpT > 0.4) this.emit('gate');
        this.gateBumpT = 0;
      }
      this.gateBumpT += dt;

      // Vertical motion and one-way landing.
      const prevBottom = this.y;
      if (!this.onGround) {
        this.y += this.vy * dt;
        if (this.vy >= 0) {
          let best = null;
          for (const p of level.platforms) {
            if (!p.solid) continue;
            if (this.x + P.HALF_W - 2 < p.x || this.x - P.HALF_W + 2 > p.x + p.w) continue;
            if (prevBottom <= p.prevY + 0.75 && this.y >= p.y) {
              if (!best || p.y < best.y) best = p;
            }
          }
          if (best) this.land(best);
        }
      } else {
        const p = this.ground;
        if (!p.solid || this.x + P.HALF_W - 2 < p.x || this.x - P.HALF_W + 2 > p.x + p.w) {
          this.onGround = false;
          this.ground = null;
          this.coyote = P.COYOTE;
          this.vy = Math.max(0, this.vy);
        }
      }

      if (this.onGround) {
        this.airTime = 0;
        this.groundedTime += dt;
        const g = this.ground;
        // Remember a safe respawn point on solid, static ground.
        if (!g.move && g.kind !== 'bounce') {
          this.safe.x = clamp(this.x, g.x + 26, g.x + g.w - 26);
          this.safe.y = g.y;
        }
      } else {
        this.airTime += dt;
        this.groundedTime = 0;
        this.coyote = Math.max(0, this.coyote - dt);
      }

      const speed = Math.abs(this.vx);
      if (this.onGround && speed > 10) this.runPhase += speed * dt * 0.046;
      this.landT += dt;
      this.hurtT += dt;
      if (this.invuln > 0) this.invuln -= dt;
    }

    land(p) {
      const impact = this.vy;
      this.y = p.y;
      if (p.kind === 'bounce') {
        this.vy = -PHYS.BOUNCE_V;
        this.jumping = false;
        this.jumpCut = true;
        p.bounceT = 0;
        this.landT = 0;
        this.emit('bounce', p);
        return;
      }
      this.vy = 0;
      this.onGround = true;
      this.ground = p;
      this.jumping = false;
      if (impact > 220) {
        this.landT = 0;
        this.emit('land', impact);
      }
    }

    /** Overlap test against a circle (hearts, hazards), with a forgiving margin. */
    touchesCircle(cx, cy, r, shrink) {
      const s = shrink || 0;
      const left = this.x - PHYS.HALF_W + s, right = this.x + PHYS.HALF_W - s;
      const top = this.y - PHYS.H + s, bottom = this.y - s;
      const nx = clamp(cx, left, right), ny = clamp(cy, top, bottom);
      const dx = cx - nx, dy = cy - ny;
      return dx * dx + dy * dy <= r * r;
    }

    knockback(fromX) {
      const dir = this.x < fromX ? -1 : 1;
      this.vx = dir * 380;
      this.vy = -520;
      this.onGround = false;
      this.ground = null;
      this.jumping = false;
      this.lock = 0.28;
      this.invuln = 1.3;
      this.hurtT = 0;
      this.facing = -dir;
    }
  }

  LM.Player = Player;
  LM.PHYS = PHYS;
})();

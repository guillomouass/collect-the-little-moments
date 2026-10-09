/* Keyboard and touch input. Gameplay reads a small, uniform snapshot. */
(function () {
  'use strict';
  const LM = window.LM;

  const GAME_KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', KeyW: 'jump', ArrowUp: 'jump'
  };
  const JUMP_BUFFER = 0.13; // seconds a jump press is remembered before landing

  class Input {
    constructor() {
      this.keys = new Set();
      this.touch = { left: false, right: false, jump: false };
      this.jumpAt = -Infinity;
      this.handlers = {};
      this.isGameplay = () => false; // set by the game
      this.usingTouch = false;
    }

    on(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); }
    emit(name, e) { (this.handlers[name] || []).forEach((fn) => fn(e)); }

    now() { return performance.now() / 1000; }

    attach() {
      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.releaseAll());
      document.addEventListener('visibilitychange', () => document.hidden && this.releaseAll());
    }

    onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = GAME_KEYS[e.code];
      if (action && this.isGameplay()) {
        // Swallow the key so it never scrolls the page or presses a focused button.
        e.preventDefault();
        if (!this.keys.has(e.code)) {
          this.keys.add(e.code);
          if (action === 'jump' && !e.repeat) this.jumpAt = this.now();
        }
        return;
      }
      if (action) this.keys.add(e.code); // remember held keys, but no jump edge
      if (e.code === 'Escape') { e.preventDefault(); this.emit('pause'); }
      else if (e.code === 'KeyR' && !e.repeat) this.emit('restart');
      else if (e.code === 'KeyM' && !e.repeat) this.emit('mute');
    }

    held(action) {
      for (const code of this.keys) if (GAME_KEYS[code] === action) return true;
      return this.touch[action];
    }

    get move() { return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0); }
    get jumpHeld() { return this.held('jump'); }
    get anyMove() { return this.move !== 0 || this.jumpHeld; }

    hasJump() { return this.now() - this.jumpAt <= JUMP_BUFFER; }
    consumeJump() { this.jumpAt = -Infinity; }
    clearJump() { this.jumpAt = -Infinity; }

    releaseAll() {
      this.keys.clear();
      this.touch.left = this.touch.right = this.touch.jump = false;
      this.jumpAt = -Infinity;
      this.emit('touchchange');
    }

    /* ── Touch / pointer controls ───────────────────────────── */
    bindTouch(dpad, jumpBtn) {
      const dirPointers = new Map();
      const jumpPointers = new Set();

      const refresh = () => {
        const sides = [...dirPointers.values()];
        this.touch.left = sides.includes('left');
        this.touch.right = sides.includes('right');
        this.touch.jump = jumpPointers.size > 0;
        dpad.classList.toggle('is-left', this.touch.left);
        dpad.classList.toggle('is-right', this.touch.right);
        jumpBtn.classList.toggle('is-down', this.touch.jump);
      };
      const sideOf = (e) => {
        const r = dpad.getBoundingClientRect();
        return e.clientX < r.left + r.width / 2 ? 'left' : 'right';
      };

      dpad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.usingTouch = true;
        try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        dirPointers.set(e.pointerId, sideOf(e));
        refresh();
      });
      dpad.addEventListener('pointermove', (e) => {
        if (!dirPointers.has(e.pointerId)) return;
        dirPointers.set(e.pointerId, sideOf(e)); // slide between ◀ and ▶
        refresh();
      });
      const endDir = (e) => { dirPointers.delete(e.pointerId); refresh(); };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => dpad.addEventListener(t, endDir));

      jumpBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.usingTouch = true;
        try { jumpBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (!jumpPointers.size) this.jumpAt = this.now();
        jumpPointers.add(e.pointerId);
        refresh();
      });
      const endJump = (e) => { jumpPointers.delete(e.pointerId); refresh(); };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => jumpBtn.addEventListener(t, endJump));

      [dpad, jumpBtn].forEach((el) => el.addEventListener('contextmenu', (e) => e.preventDefault()));
      this.on('touchchange', () => { dirPointers.clear(); jumpPointers.clear(); refresh(); });
    }
  }

  LM.Input = Input;
})();

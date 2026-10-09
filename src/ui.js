/* DOM interface: start screen, HUD, cards, pause menu, ending text. */
(function () {
  'use strict';
  const LM = window.LM;
  const $ = (id) => document.getElementById(id);

  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 20.5C5.6 16.4 3 12.8 3.4 9.3 3.9 5.9 8 4.5 12 8c4-3.5 8.1-2.1 8.6 1.3.4 3.5-2.2 7.1-8.6 11.2z"/></svg>';
  const SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5h3l4.5-3.8v12.6l-4.5-3.8h-3z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5h3l4.5-3.8v12.6l-4.5-3.8h-3z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {
        start: $('screen-start'), hud: $('hud'), slots: $('hud-slots'), count: $('hud-count'),
        hearts: document.querySelector('.hud-hearts'),
        tutorial: $('tutorial'), tutorialText: $('tutorial-text'), tutorialKeys: $('tutorial-keys'),
        toast: $('toast'), banner: $('banner'),
        message: $('overlay-message'), msgKicker: $('msg-kicker'), msgTitle: $('msg-title'), msgText: $('msg-text'), cont: $('btn-continue'),
        pause: $('overlay-pause'), pauseMain: $('pause-main'), pauseConfirm: $('pause-confirm'),
        info: $('overlay-info'),
        ending: $('ending'), panel: $('ending-panel'),
        fade: $('fade'), live: $('sr-live'), hero: $('hero-spot'),
        dpad: $('dpad'), jump: $('touch-jump')
      };
      this.armedAt = 0;
      this.pauseView = 'menu';
      this.openOverlay = null;
      this.lastFocus = null;
      this.toastTimer = null;
      this.bannerTimer = null;
      this.tutorialTimer = null;
      this.fillStatic();
      this.bind();
    }

    fillStatic() {
      const c = LM.config, f = LM.fill;
      $('subtitle').textContent = c.subtitle;
      const ded = f(c.dedication);
      if (ded) { $('dedication').textContent = ded; $('dedication').hidden = false; }
      // Title keeps its designed two-line split when it is the default; otherwise show it plainly.
      if (c.gameTitle.toLowerCase() !== 'collect the little moments') {
        $('game-title').innerHTML = '';
        const big = document.createElement('span');
        big.className = 't-big';
        big.textContent = c.gameTitle;
        $('game-title').appendChild(big);
      }
      document.title = c.gameTitle;
      $('info-goal').textContent = `Help ${c.mainCharacterName} collect all five hearts to reach ${c.secondCharacterName}. 💙`;
      document.querySelector('#pause-confirm .card-sub').textContent = `Your hearts will reset and ${c.mainCharacterName} goes back to the very first cloud.`;
      this.el.slots.innerHTML = Array.from({ length: 5 }, () => `<span class="slot">${HEART_SVG}</span>`).join('');
    }

    bind() {
      const g = this.game;
      const on = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(e); });
      on('btn-play', () => g.startFromMenu());
      on('btn-info', () => this.openInfo());
      on('btn-info-close', () => this.closeInfo());
      on('btn-pause', () => g.togglePause());
      on('btn-restart', () => g.requestRestart());
      on('btn-resume', () => g.resume());
      on('btn-pause-restart', () => this.showPauseView('confirm'));
      on('btn-pause-help', () => this.openInfo());
      on('btn-confirm-restart', () => g.confirmRestart());
      on('btn-cancel-restart', () => (this.pauseView === 'confirm' && g.state === 'paused' ? g.resume() : null));
      on('btn-continue', () => {
        // Ignore activations in the first moments (e.g. a held Space from the jump into the heart).
        if (performance.now() < this.armedAt) return;
        g.continueFromMessage();
      });
      document.querySelectorAll('.js-sound, .js-sound-text').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); g.toggleSound(); }));
      // Clicking on the backdrop of the info card closes it.
      this.el.info.addEventListener('click', (e) => { if (e.target === this.el.info) this.closeInfo(); });
      // Keep keyboard focus inside the open dialog.
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && this.openOverlay) this.trapFocus(e);
        if (e.key === 'Escape' && this.openOverlay === this.el.info) { e.stopPropagation(); this.closeInfo(); }
      }, true);
      // HUD buttons shouldn't keep focus during play (Space must not re-press them).
      ['btn-pause', 'btn-restart', 'btn-sound'].forEach((id) => $(id).addEventListener('pointerup', () => $(id).blur()));
      g.input.bindTouch(this.el.dpad, this.el.jump);
    }

    trapFocus(e) {
      const nodes = [...this.openOverlay.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!this.openOverlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }

    setStateClass(state) {
      const b = document.body;
      b.className = b.className.replace(/\bstate-\S+/g, '').trim();
      b.classList.add('state-' + state);
    }

    setTouchMode(on) { document.body.classList.toggle('show-touch', !!on); }

    heroRect() {
      const r = this.el.hero.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, w: r.width };
    }

    /* ── Overlays (shared open/close with focus handling) ───── */
    show(overlay, focusEl, delay) {
      this.lastFocus = document.activeElement;
      overlay.hidden = false;
      // next frame → fade/scale in
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
      this.openOverlay = overlay;
      const focus = () => { if (!overlay.hidden && focusEl) focusEl.focus({ preventScroll: true }); };
      if (delay) this.game.after(delay, focus);
      else focus();
    }

    hide(overlay) {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      if (this.openOverlay === overlay) this.openOverlay = null;
      if (document.activeElement && overlay.contains(document.activeElement)) document.activeElement.blur();
    }

    /* ── Start screen ───────────────────────────────────── */
    showStart(on) {
      this.el.start.hidden = !on;
      this.el.start.classList.remove('is-leaving');
    }
    leaveStart() { this.el.start.classList.add('is-leaving'); }

    openInfo() {
      this.infoReturn = this.openOverlay;
      if (this.infoReturn) this.infoReturn.hidden = true;
      this.show(this.el.info, $('btn-info-close'));
    }
    closeInfo() {
      this.hide(this.el.info);
      if (this.infoReturn) {
        const back = this.infoReturn;
        this.infoReturn = null;
        back.hidden = false;
        this.openOverlay = back;
        $('btn-pause-help').focus({ preventScroll: true });
      } else $('btn-info').focus({ preventScroll: true });
    }

    /* ── HUD ────────────────────────────────────────────── */
    showHud(on) { this.el.hud.hidden = !on; }

    hudHearts(n, popIndex) {
      [...this.el.slots.children].forEach((s, i) => {
        s.classList.toggle('is-full', i < n);
        if (i === popIndex) {
          s.classList.remove('is-pop');
          void s.offsetWidth;
          s.classList.add('is-pop');
        }
      });
      this.el.count.textContent = `${n}/5`;
      this.el.hearts.setAttribute('aria-label', `Hearts collected: ${n} of 5`);
    }

    setSound(on) {
      document.querySelectorAll('.js-sound').forEach((b) => {
        b.innerHTML = on ? SOUND_ON : SOUND_OFF;
        b.setAttribute('aria-label', on ? 'Sound on — mute' : 'Sound off — unmute');
        b.setAttribute('aria-pressed', String(on));
      });
      document.querySelectorAll('.js-sound-text').forEach((b) => {
        b.textContent = on ? 'Sound: on' : 'Sound: off';
        b.setAttribute('aria-pressed', String(on));
      });
    }

    /* ── Tutorial / toast / banner ──────────────────────── */
    showTutorial(touch) {
      const c = LM.config;
      this.el.tutorialText.textContent = `Move, jump, and collect all five hearts to find ${c.secondCharacterName}.`;
      this.el.tutorialKeys.innerHTML = touch
        ? '<span>◀ ▶ move</span><span>Jump button to jump</span>'
        : '<span><kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>Space</kbd> jump</span><span><kbd>Esc</kbd> pause</span>';
      this.el.toast.classList.add('is-hidden');
      this.el.tutorial.classList.remove('is-hidden');
      if (this.tutorialTimer) this.tutorialTimer.cancelled = true;
      this.tutorialTimer = this.game.after(8, () => this.hideTutorial());
    }
    hideTutorial() { this.el.tutorial.classList.add('is-hidden'); }

    toast(text, seconds) {
      this.hideTutorial();
      const t = this.el.toast;
      t.textContent = text;
      t.classList.remove('is-hidden');
      if (this.toastTimer) this.toastTimer.cancelled = true;
      this.toastTimer = this.game.after(seconds || 3.2, () => t.classList.add('is-hidden'));
    }

    banner(text, seconds) {
      const b = this.el.banner;
      b.textContent = text;
      b.classList.remove('is-hidden');
      if (this.bannerTimer) this.bannerTimer.cancelled = true;
      this.bannerTimer = this.game.after(seconds || 3, () => b.classList.add('is-hidden'));
    }

    announce(text) {
      this.el.live.textContent = '';
      this.game.after(0.05, () => (this.el.live.textContent = text));
    }

    /* ── Heart message card ─────────────────────────────── */
    openMessage(index, msg) {
      const e = this.el;
      e.msgKicker.textContent = `Heart ${index + 1} of 5`;
      e.msgTitle.textContent = msg.title;
      e.msgText.textContent = msg.message;
      this.armedAt = performance.now() + 550;
      this.hideTutorial();
      this.show(e.message, e.cont, 0.55);
    }
    closeMessage() { this.hide(this.el.message); }

    /* ── Pause ──────────────────────────────────────────── */
    openPause(view) {
      this.showPauseView(view || 'menu', true);
      this.show(this.el.pause, null);
    }
    showPauseView(view, silent) {
      this.pauseView = view;
      this.el.pauseMain.hidden = view !== 'menu';
      this.el.pauseConfirm.hidden = view !== 'confirm';
      const target = view === 'menu' ? $('btn-resume') : $('btn-cancel-restart');
      if (silent) this.game.after(0.05, () => target.focus({ preventScroll: true }));
      else target.focus({ preventScroll: true });
    }
    closePause() {
      if (this.openOverlay === this.el.info) this.hide(this.el.info);
      this.infoReturn = null;
      this.hide(this.el.pause);
    }

    /* ── Ending ─────────────────────────────────────────── */
    endingOpen() {
      this.el.ending.hidden = false;
      this.el.panel.innerHTML = '';
    }
    endingClear() {
      [...this.el.panel.children].forEach((c) => c.classList.remove('is-in'));
      const old = [...this.el.panel.children];
      this.game.after(0.6, () => old.forEach((c) => c.remove()));
    }
    endingLine(text, cls) {
      if (!text) return null;
      const p = document.createElement('p');
      p.className = 'end-line ' + cls;
      p.textContent = text;
      this.el.panel.appendChild(p);
      requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('is-in')));
      return p;
    }
    endingButtons(list) {
      const wrap = document.createElement('div');
      wrap.className = 'end-line end-choices';
      const buttons = list.map((b) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = b.cls;
        el.textContent = b.label;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          if (wrap.dataset.used) return; // one click → one transition
          wrap.dataset.used = '1';
          buttons.forEach((x) => (x.disabled = true));
          this.game.audio.play('click');
          b.onClick();
        });
        wrap.appendChild(el);
        return el;
      });
      this.el.panel.appendChild(wrap);
      requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('is-in')));
      this.game.after(0.3, () => buttons[0] && !buttons[0].disabled && buttons[0].focus({ preventScroll: true }));
      return buttons;
    }
    endingClose() {
      this.el.ending.hidden = true;
      this.el.panel.innerHTML = '';
    }

    fade(on) { this.el.fade.classList.toggle('is-on', !!on); }

    /** Close everything — used by restart. */
    resetAll() {
      [this.el.message, this.el.pause, this.el.info].forEach((o) => this.hide(o));
      this.infoReturn = null;
      this.endingClose();
      this.el.toast.classList.add('is-hidden');
      this.el.banner.classList.add('is-hidden');
      this.hideTutorial();
      this.fade(false);
      this.showStart(false);
    }
  }

  LM.UI = UI;
})();

/*
 * Game: one requestAnimationFrame loop, an explicit state machine, fixed
 * physics sub-steps, and the render pipeline.
 */
(function () {
  'use strict';
  const LM = window.LM;
  const { clamp, lerp, damp, invLerp, motion, store } = LM.U;
  const { STYLES, Face, drawMonkey, drawFlower, playerPose, nuwaraIdlePose } = LM.Characters;

  const S = {
    MENU: 'menu',
    INTRO: 'intro',
    PLAYING: 'playing',
    HEART_COLLECT: 'heartCollect',
    MESSAGE: 'message',
    PAUSED: 'paused',
    RESPAWNING: 'respawning',
    ALL_HEARTS: 'allHearts',
    FINAL_REACHED: 'finalReached',
    FLOWER_OFFER: 'flowerOffer',
    FLOWER_ACCEPT: 'flowerAccept',
    KISS: 'kiss',
    INVITATION: 'invitation',
    RESPONSE_YES: 'responseYes',
    RESPONSE_MORE: 'responseMore'
  };
  const ENDING = new Set([S.FINAL_REACHED, S.FLOWER_OFFER, S.FLOWER_ACCEPT, S.KISS, S.INVITATION, S.RESPONSE_YES, S.RESPONSE_MORE]);
  const PAUSABLE = new Set([S.INTRO, S.PLAYING, S.RESPAWNING, S.ALL_HEARTS]);
  const KEYS_CAPTURED = new Set([S.INTRO, S.PLAYING, S.RESPAWNING, S.ALL_HEARTS]);
  const SUBSTEP = 1 / 120;
  const VIEW_H = 480; // world units visible vertically (at zoom 1) on landscape screens
  const VIEW_W = 420; // …and the minimum visible width on narrow screens

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.config = LM.config;
      this.level = new LM.Level();
      this.world = new LM.World(this.level);
      this.player = new LM.Player();
      this.cam = new LM.Camera();
      this.particles = new LM.Particles();
      this.input = new LM.Input();
      const saved = store.get('lm-sound', null);
      this.audio = new LM.AudioEngine(saved === null ? this.config.soundEnabled : !!saved);
      this.mFace = new Face(11);
      this.nFace = new Face(29);
      this.timers = [];
      this.ending = new LM.Ending(this);
      this.ui = new LM.UI(this);

      this.state = null;
      this.stateTime = 0;
      this.time = 0;
      this.worldTime = 0;
      this.hearts = 0;
      this.paused = null;
      this.magicV = 0;
      this.glowV = 0.3;
      this.out = { M: {}, N: {} };
      this.fellOnce = false;
      this.lastGateHint = -99;
      this.ctl = { move: 0, jumpHeld: false, wantJump: false, onJump: () => this.input.consumeJump() };
      this.menuCloud = { art: null, w: 170 };

      this.player.events = (name, data) => this.onPlayerEvent(name, data);
      this.input.isGameplay = () => KEYS_CAPTURED.has(this.state);
      this.input.on('pause', () => this.togglePause());
      this.input.on('restart', () => this.requestRestart());
      this.input.on('mute', () => this.toggleSound());
      this.input.attach();

      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      this.ui.setTouchMode(coarse);
      window.addEventListener('touchstart', () => { this.input.usingTouch = true; this.ui.setTouchMode(true); }, { passive: true });
      // iOS: stop pinch / double-tap zoom gestures from moving the page during play.
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !e.target.closest('.card, .ending-panel')) e.preventDefault(); }, { passive: false });
      document.addEventListener('visibilitychange', () => this.onVisibility());
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

      this.ui.setSound(this.audio.enabled);
      this.prepareMenuCloud();
      this.resize();
      this.setState(S.MENU);
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ── Timers driven by the main loop (cleared on restart) ─── */
    after(seconds, fn) {
      const t = { at: this.time + seconds, fn, cancelled: false };
      this.timers.push(t);
      return t;
    }
    runTimers() {
      for (let i = 0; i < this.timers.length; i++) {
        const t = this.timers[i];
        if (this.time >= t.at) {
          this.timers.splice(i, 1);
          i--;
          if (!t.cancelled) t.fn();
        }
      }
    }

    /* ── Layout ──────────────────────────────────────────── */
    resize() {
      const W = window.innerWidth, H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = W;
      this.H = H;
      this.dpr = dpr;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.S = Math.min(H / VIEW_H, W / VIEW_W);
      this.world.ensureSprites(this.S * dpr);
      this.cam.setView(W, H, this.S);
      this.hero = this.ui.heroRect();
    }

    baseView() { return { w: this.W / this.S, h: this.H / this.S }; }

    /* ── State machine ───────────────────────────────────── */
    setState(to) {
      if (this.state === to) return;
      const from = this.state;
      this.state = to;
      this.stateTime = 0;
      this.ui.setStateClass(to);
      this.onEnter(to, from);
    }

    onEnter(s, from) {
      const ui = this.ui, c = this.config, E = c.ending, f = LM.fill;
      switch (s) {
        case S.MENU:
          ui.showStart(true);
          ui.showHud(false);
          this.audio.setMode('menu', true);
          break;
        case S.INTRO: {
          const sp = this.level.spawn;
          this.player.reset(sp.x, sp.y - 230);
          this.player.facing = 1;
          this.landedIntro = false;
          ui.showHud(true);
          ui.hudHearts(0);
          ui.showTutorial(this.input.usingTouch || document.body.classList.contains('show-touch'));
          this.audio.setMode('play');
          break;
        }
        case S.PLAYING:
          this.input.clearJump();
          this.audio.setMusicLevel(1, 0.5);
          break;
        case S.HEART_COLLECT: {
          const h = this.collecting;
          const bob = Math.sin(this.time * 2.2 + h.index * 1.3) * 5;
          this.audio.play('heart');
          this.particles.burst(h.x, h.y + bob, { n: 20, speed: 260, colors: ['#FFFFFF', '#FFB8D2', '#F58FB8', '#DDF3FF'], size: 5, g: 80, life: 0.9 });
          this.particles.burst(h.x, h.y + bob, { n: 8, speed: 150, type: 'heart', colors: ['#F58FB8', '#FFB8D2'], size: 4, g: -40, life: 1.1, wobble: 40 });
          this.particles.ring(h.x, h.y + bob, '#FFFFFF', 10, 0.6);
          ui.hudHearts(this.hearts, h.index);
          ui.hideTutorial();
          ui.announce(`Heart ${this.hearts} of 5 collected.`);
          break;
        }
        case S.MESSAGE:
          this.audio.play('card');
          this.audio.setMusicLevel(0.55, 0.4);
          ui.openMessage(this.collecting.index, c.heartMessages[this.collecting.index]);
          break;
        case S.PAUSED:
          this.audio.setMusicLevel(0.35, 0.3);
          ui.openPause(this.pauseView || 'menu');
          break;
        case S.RESPAWNING:
          this.respawned = false;
          this.audio.play('fall');
          break;
        case S.ALL_HEARTS:
          this.level.formBridge(this.worldTime);
          this.audio.play('bridge');
          this.audio.setMusicLevel(1, 0.5);
          ui.toast(`All five hearts! A path to ${c.secondCharacterName} is appearing… 💙`, 3.4);
          ui.announce(`All five hearts collected. A cloud bridge to ${c.secondCharacterName} appears.`);
          break;
        case S.FINAL_REACHED:
          ui.showHud(false);
          ui.hideTutorial();
          this.audio.setMode('romantic', true);
          this.audio.setMusicLevel(0.85, 1);
          ui.banner(f(E.approach), 3.4);
          ui.announce(`${c.mainCharacterName} reaches ${c.secondCharacterName}'s island.`);
          this.ending.enter(s);
          break;
        case S.FLOWER_OFFER:
        case S.FLOWER_ACCEPT:
        case S.KISS:
          this.ending.enter(s);
          break;
        case S.INVITATION:
          this.ending.enter(s);
          this.startInvitation();
          break;
        case S.RESPONSE_YES:
          this.ending.enter(s);
          this.audio.setMode('celebrate', true);
          ui.endingClear();
          this.after(0.6, () => ui.endingLine(f(E.yesHeadline), 'end-headline'));
          this.after(2.4, () => ui.endingLine(f(E.yesFollowUp), 'end-text'));
          this.after(4.0, () => ui.endingLine(this.activityLine(), 'end-question'));
          this.after(5.6, () => this.finalButtons());
          ui.announce(`${c.mainCharacterName} celebrates with joy.`);
          break;
        case S.RESPONSE_MORE:
          this.ending.enter(s);
          this.audio.play('shy');
          ui.endingClear();
          this.after(0.6, () => ui.endingLine(f(E.moreShy), 'end-question'));
          this.after(2.2, () => ui.endingButtons([{ label: f(E.moreButton2), cls: 'btn btn-pink', onClick: () => this.moreReveal() }]));
          break;
      }
    }

    activityLine() {
      const E = this.config.ending;
      return this.config.dateActivity ? LM.fill(E.activityLine) : LM.fill(E.noActivityLine);
    }

    startInvitation() {
      const ui = this.ui, c = this.config, E = c.ending, f = LM.fill;
      ui.endingOpen();
      const question = c.finalInvitation ? f(c.finalInvitation) : f(E.invitation);
      this.after(0.3, () => ui.endingLine(f(E.arrival), 'end-headline'));
      this.after(2.5, () => ui.endingLine(f(E.reflection), 'end-text'));
      this.after(4.8, () => ui.endingLine(question, 'end-question'));
      this.after(6.3, () => ui.endingButtons([
        { label: f(E.yesButton), cls: 'btn btn-pink', onClick: () => this.respond('yes') },
        { label: f(E.moreButton), cls: 'btn btn-soft', onClick: () => this.respond('more') }
      ]));
    }

    respond(kind) {
      if (this.state !== S.INVITATION) return;
      this.setState(kind === 'yes' ? S.RESPONSE_YES : S.RESPONSE_MORE);
    }

    moreReveal() {
      if (this.state !== S.RESPONSE_MORE || this.ending.moreStage !== 0) return;
      const ui = this.ui, f = LM.fill, E = this.config.ending;
      this.ending.moreStage = 1;
      this.ending.stageT = 0;
      this.audio.play('celebrate');
      this.audio.setMode('celebrate');
      const m = this.ending.mX, n = this.ending.nX;
      this.particles.burst((m + n) / 2, this.level.final.y - 50, { n: 22, speed: 220, type: 'heart', colors: ['#F58FB8', '#FFB8D2', '#8FCDF0'], size: 4.2, g: 100, life: 1.6, wobble: 40 });
      ui.endingClear();
      this.after(0.6, () => ui.endingLine(f(E.moreReveal), 'end-question'));
      if (this.config.dateActivity) this.after(2.0, () => ui.endingLine(this.activityLine(), 'end-text'));
      this.after(this.config.dateActivity ? 3.4 : 2.4, () => this.finalButtons());
    }

    finalButtons() {
      const ui = this.ui, f = LM.fill, E = this.config.ending;
      const hint = f(E.replyHint);
      if (hint) ui.endingLine(hint, 'end-hint');
      ui.endingButtons([{ label: f(E.playAgain), cls: 'btn btn-soft', onClick: () => this.replay() }]);
    }

    replay() {
      if (this.state !== S.RESPONSE_YES && this.state !== S.RESPONSE_MORE) return;
      this.ui.fade(true);
      this.after(0.5, () => {
        this.restart();
        this.after(0.1, () => this.ui.fade(false));
      });
    }

    /* ── Menu → game ─────────────────────────────────────── */
    startFromMenu() {
      if (this.state !== S.MENU || this.starting) return;
      this.starting = true;
      this.audio.unlock();
      this.audio.play('click');
      this.ui.leaveStart();
      this.ui.fade(true);
      this.after(0.5, () => {
        this.restart();
        this.starting = false;
        this.after(0.08, () => this.ui.fade(false));
      });
    }

    restart() {
      this.timers.length = 0;
      this.ui.resetAll();
      this.paused = null;
      this.pauseView = 'menu';
      this.level.reset();
      this.hearts = 0;
      this.collecting = null;
      this.particles.clear();
      this.ending.reset();
      this.worldTime = 0;
      this.fellOnce = false;
      const sp = this.level.spawn;
      this.player.reset(sp.x, sp.y);
      this.cam.zoom = 1;
      this.cam.setView(this.W, this.H, this.S);
      this.cam.snap(sp.x + 55, sp.y - (this.feetFrac() - 0.5) * this.cam.viewH);
      this.cam.clamp(this.level.bounds);
      this.ui.hudHearts(0);
      this.audio.setMode('play', true);
      this.audio.setMusicLevel(1, 0.3);
      this.state = null;
      this.setState(S.INTRO);
    }

    /* ── Pause / restart / sound ─────────────────────────── */
    togglePause() {
      if (this.state === S.PAUSED) {
        if (this.ui.openOverlay === this.ui.el.info) return;
        if (this.ui.pauseView === 'menu') this.resume();
        else this.ui.showPauseView('menu');
      } else this.pause('menu');
    }

    pause(view) {
      if (!PAUSABLE.has(this.state)) return false;
      this.paused = { state: this.state, stateTime: this.stateTime };
      this.pauseView = view;
      this.setState(S.PAUSED);
      return true;
    }

    resume() {
      if (this.state !== S.PAUSED || !this.paused) return;
      const p = this.paused;
      this.paused = null;
      this.ui.closePause();
      this.state = p.state; // restore without re-running the state's entry
      this.stateTime = p.stateTime;
      this.ui.setStateClass(this.state);
      this.input.clearJump();
      this.audio.setMusicLevel(1, 0.4);
    }

    requestRestart() {
      if (this.state === S.PAUSED) {
        if (this.ui.pauseView === 'confirm') this.confirmRestart();
        else this.ui.showPauseView('confirm');
        return;
      }
      this.pause('confirm');
    }

    confirmRestart() {
      if (this.state !== S.PAUSED) return;
      this.audio.play('click');
      this.restart();
    }

    toggleSound() {
      this.audio.unlock();
      this.audio.setEnabled(!this.audio.enabled);
      store.set('lm-sound', this.audio.enabled);
      this.ui.setSound(this.audio.enabled);
      if (this.audio.enabled) this.audio.play('click');
    }

    continueFromMessage() {
      if (this.state !== S.MESSAGE) return;
      this.ui.closeMessage();
      this.audio.play('click');
      this.setState(this.hearts >= 5 ? S.ALL_HEARTS : S.PLAYING);
    }

    onVisibility() {
      if (document.hidden) {
        if (PAUSABLE.has(this.state)) this.pause('menu');
        this.audio.suspend();
      } else {
        this.audio.resume();
        this.last = performance.now();
      }
    }

    announce(text) { this.ui.announce(text); }

    /* ── Player events → sound & particles ───────────────── */
    onPlayerEvent(name, data) {
      const pl = this.player;
      switch (name) {
        case 'jump':
          this.audio.play('jump');
          this.particles.dust(pl.x, pl.y, 4);
          break;
        case 'land':
          this.audio.play('land', data);
          this.particles.dust(pl.x, pl.y, data > 700 ? 8 : 5);
          break;
        case 'bounce':
          this.audio.play('bounce');
          this.particles.burst(pl.x, pl.y, { n: 12, speed: 200, colors: ['#FFFFFF', '#FFB8D2'], size: 4, g: 200, life: 0.6, dir: -Math.PI / 2, spread: Math.PI * 0.9 });
          break;
        case 'gate':
          if (this.state === S.PLAYING && this.time - this.lastGateHint > 4.5) {
            this.lastGateHint = this.time;
            this.audio.play('hint');
            this.ui.toast(`${this.config.secondCharacterName} is waiting just ahead… collect all 5 hearts to open the path (${this.hearts}/5) 💙`, 4);
          }
          break;
      }
    }

    /* ── Main loop ───────────────────────────────────────── */
    loop(now) {
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.update(dt);
      this.render();
      this.audio.update();
      requestAnimationFrame(this.loop);
    }

    feetFrac() { return document.body.classList.contains('show-touch') ? 0.6 : 0.65; }

    update(dt) {
      this.time += dt;
      this.stateTime += dt;
      this.runTimers();
      const st = this.state;
      if (st === S.PAUSED) return;

      const pl = this.player;
      const idle = (st === S.PLAYING || st === S.MENU) && (st === S.MENU || (pl.onGround && Math.abs(pl.vx) < 10));
      this.mFace.update(dt, idle ? 'idle' : 'active');
      this.nFace.update(dt, 'idle');
      for (const h of this.level.hearts) if (h.collected && h.collectT < 9) h.collectT += dt;
      pl.gateLocked = !this.level.bridge.solid;

      switch (st) {
        case S.MENU:
          break;
        case S.INTRO:
          this.simulate(dt, this.landedIntro ? 'player' : 'none');
          if (!this.landedIntro && pl.onGround) { this.landedIntro = true; this.introLandAt = this.stateTime; }
          if (this.state === S.INTRO && this.landedIntro && (this.stateTime - this.introLandAt > 0.5 || this.input.anyMove)) this.setState(S.PLAYING);
          break;
        case S.PLAYING:
          this.simulate(dt, 'player');
          break;
        case S.RESPAWNING:
          this.simulate(dt, 'frozen');
          this.updateRespawn();
          break;
        case S.ALL_HEARTS:
          this.simulate(dt, 'none');
          if (this.stateTime > 2.9) this.setState(S.PLAYING);
          break;
        case S.HEART_COLLECT:
          if (this.stateTime > 0.75) this.setState(S.MESSAGE);
          break;
        case S.MESSAGE:
          break;
        default:
          if (ENDING.has(st)) {
            this.simulate(dt, 'frozen');
            this.ending.update(dt);
          }
      }
      this.particles.update(dt);
      this.updateCamera(dt);
      this.updateAmbient(dt);
    }

    simulate(dt, mode) {
      const n = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-6));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.worldTime += h;
        this.level.update(this.worldTime);
        for (const p of this.level.platforms) if (p.kind === 'bounce') p.bounceT += h;
        if (mode === 'frozen') continue;
        let ctl = null;
        if (mode === 'player') {
          ctl = this.ctl;
          ctl.move = this.input.move;
          ctl.jumpHeld = this.input.jumpHeld;
          ctl.wantJump = this.input.hasJump();
        }
        this.player.step(h, ctl, this.level);
        if (this.checkInteractions(mode)) return;
      }
    }

    /** Hearts, hazards, falling and the final trigger. Returns true when the state changed. */
    checkInteractions(mode) {
      const pl = this.player, lv = this.level;
      if (pl.y > lv.bounds.killY) {
        this.setState(S.RESPAWNING);
        return true;
      }
      if (mode !== 'player') return false;
      for (const h of lv.hearts) {
        if (h.collected) continue;
        const bob = Math.sin(this.time * 2.2 + h.index * 1.3) * 5;
        if (pl.touchesCircle(h.x, h.y + bob, 24, 0)) {
          h.collected = true; // marked first: a heart can only ever count once
          h.collectT = 0;
          this.hearts = lv.collectedCount;
          this.collecting = h;
          this.setState(S.HEART_COLLECT);
          return true;
        }
      }
      if (pl.invuln <= 0) {
        for (const hz of lv.hazards) {
          if (pl.touchesCircle(hz.x, hz.y + hz.bob, hz.r, 4)) {
            pl.knockback(hz.x);
            this.audio.play('bonk');
            this.particles.burst(pl.x, pl.y - 30, { n: 8, speed: 140, colors: ['#FFFFFF', '#C5C9E6'], size: 3.5, g: 100, life: 0.5 });
            break;
          }
        }
      }
      if (this.hearts >= 5 && pl.onGround && pl.ground === lv.final && pl.x >= lv.finalTriggerX) {
        this.setState(S.FINAL_REACHED);
        return true;
      }
      return false;
    }

    updateRespawn() {
      const pl = this.player;
      if (!this.respawned && this.stateTime > 0.55) {
        this.respawned = true;
        const s = pl.safe;
        pl.reset(s.x, s.y);
        pl.safe = { x: s.x, y: s.y };
        const ground = this.level.groundBelow(s.x, s.y - 1);
        if (ground) { pl.onGround = true; pl.ground = ground; pl.y = ground.y; }
        pl.invuln = 1.4;
        pl.landT = 0;
        this.audio.play('respawn');
        this.particles.dust(pl.x, pl.y, 8);
        this.particles.burst(pl.x, pl.y - 28, { n: 12, speed: 120, colors: ['#FFFFFF', '#DDF3FF', '#FFB8D2'], size: 4, g: 0, life: 0.7 });
        if (!this.fellOnce) {
          this.fellOnce = true;
          this.ui.toast('Oops! The clouds caught you. 💙', 2.6);
        }
      }
      if (this.stateTime > 0.95) this.setState(S.PLAYING);
    }

    updateCamera(dt) {
      const st = this.state, cam = this.cam;
      cam.setView(this.W, this.H, this.S);
      if (st === S.MENU) return;
      if (ENDING.has(st)) {
        const f = this.ending.framing();
        cam.focus(dt, f.x, f.y, f.zoom, 2.2, null);
      } else if (st === S.ALL_HEARTS && this.stateTime < 2.3) {
        const b = this.level.bridge;
        cam.focus(dt, b.x + b.w / 2 + 40, b.y - 50, 1, 2.6, this.level.bounds);
      } else if (st === S.INTRO || st === S.PLAYING || st === S.RESPAWNING || st === S.ALL_HEARTS) {
        cam.zoom = damp(cam.zoom, 1, 3, dt);
        cam.setView(this.W, this.H, this.S);
        cam.follow(dt, this.player, this.level, this.feetFrac());
      }
      cam.setView(this.W, this.H, this.S);
    }

    updateAmbient(dt) {
      const st = this.state;
      const progress = this.hearts / 5;
      const near = invLerp(5200, 6300, this.cam.x);
      let magic = progress * 0.55 + near * 0.35;
      let glow = 0.3 + progress * 0.55 + near * 0.15;
      if (ENDING.has(st)) { magic = 1; glow = 1; }
      if (st === S.MENU) { magic = 0.15; }
      this.magicV = damp(this.magicV, magic, 1.2, dt);
      this.glowV = damp(this.glowV, glow, 1.2, dt);
      // drifting petals and tiny hearts around Nuwara's island
      const nx = this.level.nuwaraX;
      if (st !== S.MENU && Math.abs(this.cam.x - nx) < this.cam.viewW + 300) {
        this.petalT = (this.petalT || 0) - dt * (motion.reduced ? 0.3 : 1);
        if (this.petalT <= 0) {
          this.petalT = 0.35;
          const x = nx + 120 + (Math.random() - 0.5) * 160;
          this.particles.spawn({ x, y: this.level.final.y - 120 + Math.random() * 30, vx: -30 - Math.random() * 30, vy: 15, g: 8, drag: 0.2, life: 4.5, size: 2.4 + Math.random() * 1.5, type: Math.random() > 0.75 ? 'heart' : 'dot', color: Math.random() > 0.5 ? '#FFC7DB' : '#FFFFFF', wobble: 30, alpha: 0.85 });
        }
      }
    }

    /** World position of a character's front hand, from the last rendered frame. */
    handPos(who) { return this.out[who] && this.out[who].handF; }

    kissPoint() {
      const a = this.out.M.mouth, b = this.out.N.mouth;
      if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return { x: (this.ending.mX + this.ending.nX) / 2, y: this.level.final.y - 38 };
    }

    /* ── Rendering ───────────────────────────────────────── */
    render() {
      const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr, time = this.time;
      const magic = this.magicV;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.world.drawSky(ctx, W, H, magic, time);
      if (this.state === S.MENU || (this.starting && this.state === S.MENU)) {
        this.renderMenu(ctx);
        return;
      }
      const cam = this.cam, Sc = this.S;
      this.world.drawStars(ctx, W, H, cam.x, magic, time, Sc);
      for (let i = 0; i < 3; i++) this.world.drawLayer(ctx, this.world.layers[i], cam, W, H, Sc, time);

      const k = Sc * cam.zoom;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 - cam.x * k), dpr * (H / 2 - cam.y * k));
      const view = { x0: cam.x - cam.viewW / 2, x1: cam.x + cam.viewW / 2, y0: cam.y - cam.viewH / 2, y1: cam.y + cam.viewH / 2 };
      const w = this.world;
      if (view.x1 > this.level.nuwaraX - 900) w.drawFinalGlow(ctx, this.glowV, time);
      w.drawSea(ctx, view, time, false);
      w.drawPlatforms(ctx, view, time);
      w.drawBridge(ctx, time, this.worldTime, this.hearts);
      w.drawDecor(ctx, view, time);
      for (const h of this.level.hearts) if (h.x > view.x0 - 60 && h.x < view.x1 + 60) w.drawHeart(ctx, h, time);
      for (const hz of this.level.hazards) if (hz.x > view.x0 - 60 && hz.x < view.x1 + 60) w.drawHazard(ctx, hz, time);
      this.drawCharacters(ctx, view, time);
      this.particles.draw(ctx);
      w.drawSea(ctx, view, time, true);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w.drawForeground(ctx, cam, W, H, Sc, time);
      w.drawMotes(ctx, W, H, time, Sc);
      w.drawVignette(ctx, W, H, magic);
    }

    drawCharacters(ctx, view, time) {
      const pl = this.player, lv = this.level, st = this.state;
      let m, n, mx = pl.x, my = pl.y, nx = lv.nuwaraX, mFacing = pl.facing;
      if (ENDING.has(st)) {
        const e = this.ending.poses(time);
        m = e.m;
        n = e.n;
        mx = e.mX;
        nx = e.nX;
        my = lv.final.y;
        mFacing = st === S.FINAL_REACHED ? pl.facing : 1;
      } else {
        m = playerPose(pl, this.mFace, time);
        if (st === S.HEART_COLLECT || st === S.MESSAGE) {
          m.armF = 2.75;
          m.armB = 2.55;
          m.eyes = 'happy';
          m.mouth = 'grin';
          m.blush = 0.35;
          m.sy = 1.04;
        } else if (st === S.ALL_HEARTS && pl.onGround) {
          m.eyes = 'happy';
          m.mouth = 'grin';
          m.armF = 2.6 + Math.sin(time * 11) * 0.3;
          m.lift = Math.abs(Math.sin(this.stateTime * 6)) * 8 * (this.stateTime < 1.6 ? 1 : 0);
        } else if (st === S.INTRO && this.landedIntro) {
          m.armF = 2.7 + Math.sin(time * 11) * 0.35; // hello!
          m.mouth = 'grin';
        }
        if (!pl.onGround) {
          const g = lv.groundBelow(pl.x, pl.y);
          if (g && g.y - pl.y < 320) m.shadowGap = g.y - pl.y;
          else m.shadow = false;
        }
        if (pl.invuln > 0 && st !== S.RESPAWNING && Math.floor(time * 12) % 2 === 0) m.alpha = 0.5;
        const toward = clamp(invLerp(1100, 300, Math.abs(lv.nuwaraX - pl.x)), 0, 1);
        n = nuwaraIdlePose(this.nFace, time, toward);
      }
      if (nx > view.x0 - 80 && nx < view.x1 + 80) drawMonkey(ctx, nx, lv.final.y, -1, n, STYLES.nuwara, time, this.out.N);
      const hidden = st === S.RESPAWNING && !this.respawned;
      if (!hidden) drawMonkey(ctx, mx, my, mFacing, m, STYLES.mahmood, time, this.out.M);

      const f = this.ending.flower;
      if (ENDING.has(st) && f.owner && f.scale > 0) {
        const hand = f.owner === 'M' ? this.out.M.handF : this.out.N.handF;
        if (hand) drawFlower(ctx, hand.x, hand.y + 1.5, f.angle, f.scale * 1.05, time);
      }
    }

    prepareMenuCloud() {
      const r = LM.U.rng(77);
      const p = { w: 170, art: { top: [], bottom: [] } };
      for (let i = 0; i < 8; i++) p.art.top.push({ dx: 10 + (150 * i) / 7, r: 10 + r() * 5 });
      for (let i = 0; i < 6; i++) p.art.bottom.push({ dx: 14 + (142 * i) / 5, r: 10 + r() * 5 });
      this.menuCloud = p;
    }

    renderMenu(ctx) {
      const W = this.W, H = this.H, dpr = this.dpr, time = this.time;
      const cam = { x: time * 26, y: 250, zoom: 1 };
      const w = this.world;
      w.drawStars(ctx, W, H, cam.x, 0.25, time, this.S);
      for (let i = 0; i < 3; i++) w.drawLayer(ctx, w.layers[i], cam, W, H, this.S, time);

      // Mahmood floating on his cloud inside the hero area of the start screen.
      const hero = this.hero || { x: W / 2, y: H * 0.6, h: 200 };
      const k = clamp(Math.min(hero.h / 135, hero.w / 330), 1.0, 3.2);
      const float = Math.sin(time * 1.5) * 4;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * hero.x, dpr * (hero.y + 40 * k * 0.55));
      // floating hearts around him
      const hs = [[-118, -78, 0], [112, -96, 1], [-74, -142, 2], [138, -26, 3], [-150, -18, 4]];
      for (const [hx, hy, i] of hs) {
        const y = hy + Math.sin(time * 1.8 + i * 1.7) * 6;
        const s = 7.5 + (i % 2) * 2.5;
        ctx.globalAlpha = 0.6;
        ctx.drawImage(w.heartGlow, hx - 30, y - 30, 60, 60);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = i % 2 ? '#F58FB8' : '#FFB8D2';
        LM.U.heartPath(ctx, hx, y, s * (1 + Math.sin(time * 3 + i) * 0.05));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // twinkling sparkles
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const tw = Math.max(0, Math.sin(time * 2.2 + a * 3));
        if (tw < 0.05) continue;
        ctx.globalAlpha = tw;
        LM.U.sparklePath(ctx, Math.cos(a) * (90 + i * 9), -60 + Math.sin(a) * 60, 2.5 + tw * 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.translate(0, float);
      ctx.fillStyle = 'rgba(77,148,199,0.10)';
      LM.U.ellipse(ctx, 0, 46 - float, 70, 8);
      ctx.fill();
      w.drawCloudTop(ctx, this.menuCloud, -85, 0, 170, { top: '#FFFFFF', body: '#E4F2FD', under: '#D3E9FA' });
      const p = LM.Characters.basePose();
      p.eyeOpen = this.mFace.eyeOpen;
      p.lookX = this.mFace.lookX;
      p.lookY = this.mFace.lookY;
      p.turn = 0.3 + this.mFace.turnOff;
      const br = Math.sin(time * 2.4);
      p.sy = 1 + br * 0.02;
      p.sx = 1 - br * 0.012;
      p.tail = Math.sin(time * 1.3) * 0.3;
      p.scarf = 0.35;
      const wave = (time % 6) < 1.5;
      if (wave) {
        p.armF = 2.75 + Math.sin(time * 11) * 0.35;
        p.mouth = 'grin';
        p.turn = 0.25;
        p.lookX = 0.2;
        p.lookY = 0;
      }
      drawMonkey(ctx, 0, 4, 1, p, STYLES.mahmood, time, null);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w.drawMotes(ctx, W, H, time, this.S);
      w.drawVignette(ctx, W, H, 0.15);
    }
  }

  function boot() {
    try {
      LM.game = new Game();
    } catch (err) {
      console.error(err);
      const p = document.createElement('p');
      p.className = 'noscript';
      p.textContent = 'Something went wrong while starting the game. Please reload the page. 💙';
      document.body.appendChild(p);
    }
  }

  LM.States = S;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

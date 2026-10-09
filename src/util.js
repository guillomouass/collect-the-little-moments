/* Shared math, color, drawing and config helpers. */
(function () {
  'use strict';
  const LM = (window.LM = window.LM || {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  /** Frame-rate independent exponential smoothing toward `b`. */
  const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
  const approach = (v, target, step) =>
    v < target ? Math.min(v + step, target) : Math.max(v - step, target);

  const ease = {
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  };

  /** Eased 0→1 progress of `t` inside the window [a, b]. */
  const seg = (t, a, b, fn) => (fn || ease.inOut)(invLerp(a, b, t));

  /** Small deterministic PRNG (mulberry32). */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  /** Heart centred on (x, y); `s` ≈ half-width. */
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 1.05, y - s * 1.0, x, y - s * 0.42);
    ctx.bezierCurveTo(x + s * 1.05, y - s * 1.0, x + s * 1.25, y + s * 0.05, x, y + s * 0.9);
    ctx.closePath();
  }

  /** Four-pointed sparkle centred on (x, y). */
  function sparklePath(ctx, x, y, r) {
    const k = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.closePath();
  }

  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* Reduced-motion preference, kept live. */
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const motion = { reduced: !!(motionQuery && motionQuery.matches) };
  if (motionQuery) {
    const onChange = (e) => (motion.reduced = e.matches);
    motionQuery.addEventListener ? motionQuery.addEventListener('change', onChange) : motionQuery.addListener(onChange);
  }

  /* Storage can throw in private windows — never let it break the game. */
  const store = {
    get(key, fallback) {
      try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* ignore */ }
    }
  };

  /* ── Configuration with graceful defaults ─────────────────── */
  const DEFAULTS = {
    gameTitle: 'Collect the Little Moments',
    subtitle: 'A tiny adventure made of little things that matter.',
    mainCharacterName: 'Mahmood',
    secondCharacterName: 'Nuwara',
    recipientName: 'Nuwara',
    creatorName: 'Mahmood',
    dateActivity: '',
    finalInvitation: '',
    dedication: '',
    soundEnabled: true,
    heartMessages: [
      { title: 'A little reminder...', message: 'You deserve little moments that make you smile.' },
      { title: 'A little secret...', message: 'Your smile is kind of contagious.' },
      { title: 'Okay, one thing...', message: 'Talking to you is becoming one of my favorite things.' },
      { title: 'Between you and me...', message: 'Some people just make an ordinary day feel different.' },
      { title: 'One last thing...', message: 'Maybe we should make a little memory together?' }
    ],
    ending: {
      approach: 'Just one more little moment...',
      arrival: '{MAIN} FINALLY MADE IT TO {SECOND}... 💙',
      reflection: 'Some moments are too special to keep inside a little game.',
      invitation: '{recipient}, would you let {creator} take you on a date? 🐒💙',
      yesButton: 'Yes, why not? 💙',
      moreButton: 'Tell me more 👀',
      yesHeadline: '{MAIN} IS OFFICIALLY THE HAPPIEST MONKEY IN THE WORLD! 💙',
      yesFollowUp: "Now, let's make a real little memory together.",
      activityLine: 'How about {activity}?',
      noActivityLine: 'How about we plan a cute date?',
      moreShy: "{main} is a little shy... but he'd really love to spend some time with you. 👀",
      moreButton2: 'Okay, tell me more 💙',
      moreReveal: "Then let's choose a day and make a little memory together.",
      replyHint: '',
      playAgain: 'Play again 💙'
    }
  };

  const str = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

  function buildConfig(raw) {
    raw = raw || {};
    const c = {};
    for (const k of ['gameTitle', 'subtitle', 'mainCharacterName', 'secondCharacterName', 'recipientName', 'creatorName']) {
      c[k] = str(raw[k], DEFAULTS[k]);
    }
    c.dateActivity = str(raw.dateActivity, '');
    c.finalInvitation = str(raw.finalInvitation, '');
    c.dedication = typeof raw.dedication === 'string' ? raw.dedication.trim() : DEFAULTS.dedication;
    c.soundEnabled = raw.soundEnabled !== false;
    const msgs = Array.isArray(raw.heartMessages) ? raw.heartMessages : [];
    c.heartMessages = DEFAULTS.heartMessages.map((d, i) => ({
      title: str(msgs[i] && msgs[i].title, d.title),
      message: str(msgs[i] && msgs[i].message, d.message)
    }));
    const e = raw.ending || {};
    c.ending = {};
    for (const k of Object.keys(DEFAULTS.ending)) {
      // replyHint may be intentionally empty
      c.ending[k] = k === 'replyHint' ? (typeof e[k] === 'string' ? e[k].trim() : '') : str(e[k], DEFAULTS.ending[k]);
    }
    return c;
  }

  const config = buildConfig(window.LITTLE_MOMENTS_CONFIG);

  /** Fill {placeholders}; unknown keys disappear rather than leaking into the UI. */
  function fill(template) {
    const vars = {
      main: config.mainCharacterName,
      second: config.secondCharacterName,
      recipient: config.recipientName,
      creator: config.creatorName,
      activity: config.dateActivity
    };
    return String(template || '')
      .replace(/\{(\w+)\}/g, (m, key) => {
        const lower = key.toLowerCase();
        const v = vars[lower];
        if (v === undefined) return '';
        return key === key.toUpperCase() && key !== lower ? v.toUpperCase() : v;
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  LM.U = { clamp, lerp, invLerp, damp, approach, ease, seg, rng, mix, rgba, hexToRgb, heartPath, sparklePath, ellipse, roundRect, motion, store };
  LM.config = config;
  LM.fill = fill;

  /* Shared palette. Blue leads; pink is reserved for hearts, flowers and romance. */
  LM.C = {
    sky: '#BDE7FF',
    pale: '#DDF3FF',
    white: '#FFFFFF',
    deep: '#4D94C7',
    pink: '#FFB8D2',
    rose: '#F58FB8',
    lavender: '#DCD6FF',
    brown: '#B87950',
    text: '#34516B'
  };
})();

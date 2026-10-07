// UI capture: plays whole runs of the real page in headless Edge (or Chrome) with the test skip and snapshots
// every UI moment along each run (captions, prompts, thought bubbles, panel lines, menus, cards, the ocean
// window, the ending card and the title, fresh and after an ending), with DOM metrics per snapshot and a
// contact sheet per run x size x language.
//   node tools/uishots.js [outDir] [--runs=home,stay] [--sizes=375x812] [--langs=en] [--jobs=6] [--speed=3]
//                         [--no-build] [--browser=<exe>]
// outDir defaults to tools/out/ui. It runs npm run build:site, copies the four published pages into
// <outDir>/pages with the engine exposed (a hook at the end of the game's IIFE and a timer shim in the head),
// serves them on 127.0.0.1 and drives them over CDP. Every browser is launched with --mute-audio and the
// pages have no AudioContext at all, so nothing is ever heard. The game's clock (update, and its setTimeouts)
// runs SPEED times faster and stops at each moment while it is captured, so a typed line is caught fully
// typed and a caption at full opacity (CSS transitions and animations are switched off for the capture).
// The plans are tools/sim.js's (read from its source), so choice indices stay the sim's.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { spawn, execSync, spawnSync } = require('child_process');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find(s => s.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, 'tools', 'out', 'ui'));
const SPEED = +opt('speed', 3);
const JOBS = +opt('jobs', 6);
const RUN_TIMEOUT = 8 * 60 * 1000;

const SIZES = {
  '320x568': { w: 320, h: 568, dpr: 2, mobile: true },
  '375x812': { w: 375, h: 812, dpr: 3, mobile: true },
  '430x932': { w: 430, h: 932, dpr: 2, mobile: true },
  '1280x800': { w: 1280, h: 800, dpr: 1, mobile: false },
};
const LANGS = ['en', 'ru'];

// The runs: each names a plan in tools/sim.js by its label. fish: the first catch is fished for real, so the
// cast, wait, bite and reel prompts show; tapRed: tap the turned companion at the last menu; seed: a later
// run (localStorage as after earlier runs); page 'test': the test build's page (the Skip button in the HUD).
const RUNS = [
  { id: 'home', sim: 'let go, company (someone), forever, yes -> home', fish: true },
  { id: 'dark-sea-kept', sim: 'keep, fish (wait), hear -> dark (sea)' },
  { id: 'dark-lake', sim: 'let go, home, nothing -> dark (lake, the cabin line)' },
  { id: 'swallowed', sim: 'let go, fish, cast into the big one -> swallowed' },
  { id: 'cut-lake-boat', sim: 'keep, company (someone), hear, say nothing -> cut' },
  { id: 'cut-lake-sunk', sim: 'let go, home, gold -> cut (lake, sunk: no pocket line)' },
  { id: 'cut-sea-heard', sim: 'let go, fish (wait), hear -> cut (sea, heard)' },
  { id: 'cut-sea-not-heard', sim: 'let go, fish (wait), forever -> cut (sea, not heard)' },
  { id: 'silent', sim: 'let go, nothing, nothing, nothing -> silent' },
  { id: 'refuse-once', sim: 'let go, nothing, gold -> cut (lake, sunk, the one-refusal line)' },
  { id: 'stay', sim: 'let go, company (someone), forever, yes, tap him each act -> stay', tapRed: true },
  { id: 'deep', sim: 'let go, home, gold -> deep' },
  { id: 'inside', sim: 'let go, home, forever -> inside' },
  { id: 'inside-sunk', sim: 'keep, home, gold -> inside (sunk)' },
  { id: 'later-run', sim: 'keep, company (someone), hear, say nothing -> cut', tap: true, seed: { runs: 1, last: 'cut', endings: ['cut', 'home'] } },
  { id: 'test-page', sim: 'let go, fish, cast into the big one -> swallowed', page: 'test' },
];

function simPlans() {
  const src = fs.readFileSync(path.join(__dirname, 'sim.js'), 'utf8');
  const a = src.indexOf('const BAIT_END'), b = src.indexOf('let ok = true');
  if (a < 0 || b < 0) throw new Error('tools/sim.js: cannot find its plans');
  return vm.runInNewContext(src.slice(a, b) + '\nplans;', {});
}

// ------------------------------------------------------------------ in-page code (injected as source text)
// The head: no audio at all, the game's setTimeouts on the game clock, and the capture style.
function headHook() {
  try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch (e) { /* read-only */ }
  const Q = [];
  let id = 1;
  const T = window.__UIS_TIMERS = { Q, now: 0 };
  window.setTimeout = (fn, ms, ...a) => { Q.push({ id: id, due: T.now + (+ms || 0) / 1000, fn, a }); return id++; };
  window.clearTimeout = n => { const k = Q.findIndex(t => t.id === n); if (k >= 0) Q.splice(k, 1); };
}
const SNAP_CSS = 'html.__uisnap *, html.__uisnap *::before, html.__uisnap *::after { transition: none !important; animation: none !important; }';

// The end of the game's IIFE: every identifier below is the engine's own (this text is pasted inside it).
function engineHook() {
  /* eslint-disable no-undef */
  const T = window.__UIS_TIMERS, CFG = window.__UIS_CFG || {};
  const S = window.__UIS = { events: [], paused: false, done: false, gt: 0, log: [], err: null, endShot: false };
  const speed = CFG.speed || 3, GAP = 0.45;
  if (CFG.forceTest) TEST = true;
  const fail = e => { S.err = S.err || String(e && e.stack || e); };
  const emit = (kind, extra) => { S.events.push(Object.assign({ kind, t: +G.t.toFixed(2), phase: G.phase }, extra)); S.paused = true; };
  const promptSeen = new Set();
  let pendThink = null;
  const panelInfo = () => { const L = DLG.cur || {}; return { who: L.who || '', style: L.style || '', text: L.text || '' }; };
  const mk = makeUI;
  makeUI = function () {
    const ui = mk();
    const on = (name, fn) => {
      const o = ui[name];
      ui[name] = function () { const r = o.apply(this, arguments); try { fn.apply(this, arguments); } catch (e) { fail(e); } return r; };
    };
    on('caption', (t, dur, style) => emit('caption', { text: t, style: style || '' }));
    on('prompt', t => {
      if (!t || S.skipping) return; // a test skip passes through 'reeling' within one step
      const k = G.phase + '|' + t;
      if (promptSeen.has(k)) return;
      promptSeen.add(k);
      emit(G.phase === 'ocean' ? 'ocean' : 'prompt', { text: t });
    });
    on('think', (text, o) => {
      o = o || {};
      if (o.choices) emit('bubble-menu', { text, side: ui.thinkSide, labels: o.choices.map(c => c.label) });
      else if (o.more) emit('bubble', { text, side: ui.thinkSide });
      else pendThink = { text, side: ui.thinkSide }; // his own lines: caught once the ▾ lights
    });
    on('thinkMore', v => { if (v && pendThink) { emit('bubble', pendThink); pendThink = null; } });
    on('thinkHide', () => { if (pendThink) S.log.push('bubble hidden before capture: ' + pendThink.text); pendThink = null; });
    on('dlgMore', v => { if (v && DLG.cur) emit('panel', panelInfo()); });
    on('dlgChoices', list => { if (list) emit('menu', Object.assign(panelInfo(), { labels: list.map(c => c.label) })); });
    on('dlgShow', (who, style) => { if (style === 'whisper') emit('whisper', { who }); });
    on('cardReady', () => emit('card', { text: ui.el.cardName.textContent }));
    on('title', (v, found) => {
      if (!v) return;
      emit(found && found.length ? 'title-found' : 'title', { found: found ? found.length : 0 });
      if (S.endShot) S.finishAfter = true;
    });
    return ui;
  };
  const runTimers = () => {
    for (;;) {
      let k = -1;
      T.Q.forEach((t, i) => { if (t.due <= T.now && (k < 0 || t.due < T.Q[k].due)) k = i; });
      if (k < 0) return;
      const t = T.Q.splice(k, 1)[0];
      try { t.fn(...t.a); } catch (e) { fail(e); }
    }
  };
  const upd = update;
  update = function (dt) {
    if (S.paused || S.done) return;
    let left = Math.min(dt, 0.1) * speed;
    try {
      while (left > 1e-6 && !S.paused && !S.done) {
        const d = Math.min(left, 1 / 60);
        left -= d;
        upd(d); T.now += d; S.gt += d;
        runTimers();
        afterStep();
      }
    } catch (e) { fail(e); S.paused = true; }
  };
  let lastAct = -9, ci = 0, tappedAct = -1, redTapped = false, fishLeft = CFG.fish ? 1 : 0, clicked = false;
  function afterStep() {
    const E = UI.el;
    if (pendThink && G.thinkUntil !== Infinity && E.think.classList.contains('on')) { emit('bubble', pendThink); pendThink = null; } // the timed one-word Stay bubble
    if (E.ending.classList.contains('on') && !E.again.disabled && !S.endShot) { S.endShot = true; emit('ending', { text: E.endTitle.textContent }); }
    if (!S.paused) drive();
  }
  const tap = () => { press(); release(); };
  const skip = () => { S.skipping = true; try { testCatch(); } finally { S.skipping = false; } };
  function drive() {
    const p = G.phase, now = S.gt;
    if (p === 'reeling' && G.reel) { // the reel bot, every step, like the sim's (no reaction lag)
      const r = G.reel;
      if (G.holding && (r.surge > 0 || r.T > 0.7)) G.holding = false;
      else if (!G.holding && !(r.surge > 0) && r.T < 0.3) G.holding = true;
      return;
    }
    if (p === 'bite' && fishLeft > 0 && !(G.t < G.thinkUntil)) { press(); G.holding = true; return; }
    if (now - lastAct < GAP) return;
    const act = f => { lastAct = now; f(); };
    if (G.t < G.thinkUntil) { if (!thinkCold()) act(tap); return; } // a waiting bubble: dismiss it
    if (p === 'title') return act(tap);
    if (p === 'ready') {
      if (!G.arrived) return;
      if (CFG.tap && WS.companion > 0.5 && tappedAct < STORY.act && companionOpen()) { tappedAct = STORY.act; S.log.push('tap companion, act ' + STORY.act); return act(companionTap); }
      return act(fishLeft > 0 ? tap : skip);
    }
    if (fishLeft > 0 && (p === 'casting' || p === 'waiting' || p === 'landing' || p === 'lost')) return;
    if (p === 'casting' || p === 'waiting' || p === 'bite' || p === 'lost') return act(skip);
    if (p === 'card') {
      if (!UI.el.card.classList.contains('ready')) return;
      if (fishLeft > 0) fishLeft--;
      return act(tap);
    }
    if (p === 'ocean') { if (!CFG.wait && G.pt >= OCEAN_GRACE + 0.3) act(tap); return; }
    if (p === 'dialog') {
      const L = DLG.cur;
      if (UI.choices) {
        if (UI.choicesCold()) return;
        if (CFG.tapRed && !redTapped && WS.companionTurn > 0.5) {
          if (G.t < G.capUntil) return;
          if (companionOpen()) { redTapped = true; S.log.push('tap companion, red'); return act(companionTap); }
        }
        const k = (CFG.plan || [])[ci++] || 0, c = UI.choices[k] || UI.choices[0];
        S.log.push('choose: ' + c.label);
        return act(() => c.cb());
      }
      if (!L) return;
      if (!L.bubble && DLG.n < L.text.length) return; // let it type
      return act(tap);
    }
    if (p === 'end' && S.endShot && !UI.el.again.disabled && !clicked) { clicked = true; act(() => UI.el.again.click()); }
  }
  // ---- the Node side's calls
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));
  S.poll = () => ({ paused: S.paused, events: S.events, done: S.done, phase: G.phase, gt: +S.gt.toFixed(2), err: S.err, log: S.log.slice() });
  S.prep = async () => {
    document.documentElement.classList.add('__uisnap');
    await raf();
    // the web font (a Cyrillic or italic face loads only once used): wait for it, up to 4 s of real time
    // (setTimeout runs on the paused game clock here, so the wait counts frames instead)
    const t0 = performance.now();
    while ((document.fonts.status !== 'loaded') && performance.now() - t0 < 4000) await raf();
    await document.fonts.ready;
    await raf(); await raf();
    return true;
  };
  S.resume = () => {
    document.documentElement.classList.remove('__uisnap');
    document.querySelectorAll('[data-uis]').forEach(n => n.removeAttribute('data-uis'));
    S.events = [];
    if (S.finishAfter) S.done = true; else S.paused = false;
    return true;
  };
  // Every visible box and text, with what the checks need. o: box (a box to test for overlap), slab (an
  // opaque slab: on the game grid), text, loose (text over the picture), bg: 'solid' (index 0), 'raise'
  // (index 1), or 'loose' (sampled from the canvas).
  const SPEC = [
    ['caption', '#caption', { box: 1, slab: 1, text: 1, bg: 'solid' }],
    ['prompt', '#prompt', { box: 1, text: 1, loose: 1, bg: 'loose' }],
    ['bubble', '#think', { box: 1, slab: 1 }],
    ['bubbleText', '#thinkText', { text: 1, bg: 'solid' }],
    ['bubbleMenu', '#thinkChoices', { box: 1, slab: 1 }],
    ['bubbleChoice', '#thinkChoices .choice .lb', { text: 1, bg: 'solid', button: '.choice' }],
    ['card', '#card', { box: 1, slab: 1 }],
    ['cardName', '#cardName', { text: 1, bg: 'solid' }],
    ['cardMeta', '#cardMeta', { text: 1, bg: 'solid' }],
    ['cardDesc', '#cardDesc', { text: 1, bg: 'solid' }],
    ['cardVoice', '#cardVoice', { text: 1, bg: 'solid' }],
    ['panel', '#dialog', { box: 1, slab: 1 }],
    ['who', '#who', { text: 1, bg: 'solid' }],
    ['text', '#text', { text: 1, bg: 'solid' }],
    ['plate', '#choices.grid .choice', { slab: 1 }],
    ['choice', '#choices .choice .lb', { text: 1, bg: 'solid', button: '.choice' }],
    ['logo', '#title h1 svg', { box: 1 }],
    ['begin', '#title .begin', { box: 1, text: 1, loose: 1, bg: 'loose' }],
    ['found', '#found', { box: 1, slab: 1, text: 1, bg: 'solid' }],
    ['endBox', '#ending .endBox', { box: 1, slab: 1 }],
    ['endTitle', '#endTitle', { text: 1, bg: 'solid' }],
    ['endText', '#endText', { text: 1, bg: 'solid' }],
    ['endAsked', '#endAsked', { text: 1, bg: 'solid' }],
    ['endHead', '#endAsked .head', { text: 1, bg: 'solid' }],
    ['endCount', '#endPips b', { text: 1, bg: 'solid' }],
    ['again', '#again', { box: 1, slab: 1, text: 1, bg: 'raise', button: '#again' }],
    ['count', '#count', { box: 1, slab: 1, text: 1, bg: 'solid' }],
    ['mute', '#mute', { box: 1, button: '#mute' }],
    ['lang', '#lang', { box: 1, text: 1, bg: 'solid', button: '#lang' }],
    ['skip', '#skip', { box: 1, button: '#skip' }],
  ];
  const opac = (el, stop) => { let a = 1; for (let n = el; n && n.nodeType === 1 && n !== stop; n = n.parentElement) a *= +getComputedStyle(n).opacity; return a; };
  const R = r => ({ x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
  // The slab's colours as the UI draws them (UIRGB: the palette without the Dark dimming), else the live one.
  const pal = i => { const P = typeof UIRGB !== 'undefined' && UIRGB[0] + UIRGB[1] + UIRGB[2] + UIRGB[3] > 0 ? UIRGB : PALRGB; return [P[i * 3] | 0, P[i * 3 + 1] | 0, P[i * 3 + 2] | 0]; };
  const visible = el => !!el && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) &&
    opac(el) > 0.02 && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
  // The picture under loose text, from the game canvas: its mean and its lightest and darkest pixels.
  const sample = (rect, sr, gp) => {
    const cv = document.getElementById('c'), cx = cv.getContext('2d');
    const x0 = Math.max(0, Math.floor((rect.x - sr.left) / gp)), y0 = Math.max(0, Math.floor((rect.y - sr.top) / gp));
    const x1 = Math.min(W, Math.ceil((rect.x + rect.w - sr.left) / gp)), y1 = Math.min(H, Math.ceil((rect.y + rect.h - sr.top) / gp));
    if (x1 <= x0 || y1 <= y0) return null;
    const d = cx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let n = 0, m = [0, 0, 0], lo = null, hi = null;
    for (let i = 0; i < d.length; i += 4) {
      const c = [d[i], d[i + 1], d[i + 2]];
      m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; n++;
      if (!lo || lum(...c) < lum(...lo)) lo = c;
      if (!hi || lum(...c) > lum(...hi)) hi = c;
    }
    return { mean: m.map(v => Math.round(v / n)), darkest: lo, lightest: hi };
  };
  // The boat group and the golden fish as drawn: each sprite at its place, in game pixels (above the waterline).
  function engineSprites() {
    const o = [];
    // The red eye-sun's disc (sunKind 1), as a round sprite, so a box over the eye shows as covers-eye.
    if (WS.sunKind === 1 && WS.sunR > 0) {
      const r = Math.round(WS.sunR), n = 2 * r + 1, data = new Uint8Array(n * n).fill(255);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - r) * (x - r) + (y - r) * (y - r) <= r * r) data[y * n + x] = 0;
      o.push({ name: 'eye', s: { w: n, h: n, data }, x: Math.round(WS.sunX) - r, y: Math.round(WS.sunY) - r, wl: true });
    }
    if (G.inside || !farLive() || WS.dive > DIVE_SWITCH) return o;
    const bx = boatLeft(), dy = boatSinkPx();
    o.push({ name: 'boat', s: BOAT, x: bx, y: WL - BOAT.wl + dy, wl: true });
    o.push({ name: 'man', s: FISHER, x: bx + 18, y: fisherY(dy), wl: true });
    if (WS.companion > 0.5 && WS.leap <= 0 && !(WS.cling > 0)) { const s = compSprite(); o.push({ name: 'companion', s, x: bx + COMP_DX, y: seatTop(s, dy), wl: true }); }
    if (STORY.kept && WS.goldKept > 0.01) o.push({ name: 'keptFish', s: KEPT, x: bx + KEPT_DX, y: WL + afloat(KEPT_DY, dy, -KEPT.h), wl: true });
    const g = WS.goldFish;
    if (g && g.a > 0.01) o.push({ name: 'goldFish', s: GOLD, x: Math.round(g.x), y: Math.round(g.y), wl: false });
    return o;
  }
  // How many of each sprite's opaque pixels a UI box hides: inside(gx, gy) says whether a game pixel's centre
  // is under the box (a rectangle, or the bubble's own cloud of rects).
  function covered(objs, inside) {
    const r = {};
    for (const o of objs) {
      let n = 0;
      for (let y = 0; y < o.s.h; y++) for (let x = 0; x < o.s.w; x++) {
        if (o.s.data[y * o.s.w + x] === 255 || (o.wl && o.y + y >= WL)) continue;
        if (inside(o.x + x + 0.5, o.y + y + 0.5)) n++;
      }
      if (n) r[o.name] = n;
    }
    return r;
  }
  function cloudMask(sr, gp) {
    const svg = UI.el.thinkPix, vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number), q = svg.getBoundingClientRect();
    const ox = (q.left - sr.left) / gp - vb[0], oy = (q.top - sr.top) / gp - vb[1], rs = [];
    svg.querySelectorAll('rect').forEach(e => rs.push([ox + +e.getAttribute('x'), oy + +e.getAttribute('y'), +e.getAttribute('width'), +e.getAttribute('height')]));
    return (gx, gy) => rs.some(([x, y, w, h]) => gx >= x && gx < x + w && gy >= y && gy < y + h);
  }
  S.metrics = () => {
    const E = UI.el, sr = E.stage.getBoundingClientRect(), gp = sr.width / W;
    const els = [];
    let i = 0;
    for (const [name, sel, o] of SPEC) {
      document.querySelectorAll(sel).forEach((el, k) => {
        if (!visible(el)) return;
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        const text = o.text ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (o.text && !text && !o.box) return;
        const e = { i: i++, name: k ? name + k : name, box: !!o.box, slab: !!o.slab, loose: !!o.loose, rect: R(r), text };
        el.setAttribute('data-uis', String(e.i));
        if (name === 'bubble') e.cloud = R(E.thinkPix.getBoundingClientRect());
        if (o.button) { const b = el.closest(o.button); e.target = R(b.getBoundingClientRect()); }
        if (text) {
          const rg = document.createRange();
          rg.selectNodeContents(el);
          e.textRect = R(rg.getBoundingClientRect());
          e.font = { family: cs.fontFamily, size: parseFloat(cs.fontSize), weight: +cs.fontWeight || cs.fontWeight, style: cs.fontStyle };
          e.color = cs.color;
          const grid = name === 'choice' && el.closest('#choices.grid');
          const bg = o.bg === 'raise' || grid ? 'raise' : o.bg;
          const owner = bg === 'raise' ? el.closest('#again, .choice') : el.closest('.slab, #think');
          if (bg === 'loose') { e.alpha = opac(el); e.bg = sample(e.textRect, sr, gp); e.ring = pal(0); } else { e.alpha = opac(el, owner); e.bg = { mean: pal(bg === 'raise' ? 1 : 0) }; }
          e.bgKind = bg;
        }
        if (el.clientWidth || el.clientHeight) e.scroll = { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, oy: cs.overflowY };
        if (o.slab) e.pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat);
        e.z = cs.zIndex;
        els.push(e);
      });
    }
    const fonts = [...document.fonts].filter(f => /Literata/i.test(f.family)).map(f => ({ style: f.style, weight: f.weight, status: f.status, range: f.unicodeRange.slice(0, 24) }));
    // Which drawn pixels of the boat group and the golden fish each box hides.
    const objs = engineSprites(), cover = {};
    for (const e of els) {
      if (!/^(panel|card|caption|bubble|bubbleMenu|prompt)$/.test(e.name)) continue;
      let inside;
      if (e.name === 'bubble') inside = cloudMask(sr, gp);
      else {
        const q = e.loose ? e.textRect : e.rect, x0 = (q.x - sr.left) / gp, y0 = (q.y - sr.top) / gp, x1 = x0 + q.w / gp, y1 = y0 + q.h / gp;
        inside = (gx, gy) => gx >= x0 && gx < x1 && gy >= y0 && gy < y1;
      }
      const c = covered(objs, inside);
      if (Object.keys(c).length) cover[e.name] = c;
    }
    const engine = {};
    for (const o of objs) engine[o.name] = { x: o.x, y: o.y, w: o.s.w, h: o.s.h };
    // Boxes inside boxes (Cast again in the ending's slab) are not overlaps; the effective stacking order
    // (the nearest positioned ancestor's z-index) says what the black fade covers.
    const nodes = els.map(e => document.querySelector('[data-uis="' + e.i + '"]'));
    els.forEach((e, k) => {
      e.inside = els.filter((f, j) => j !== k && nodes[j].contains(nodes[k])).map(f => f.name);
      for (let n = nodes[k]; n && n !== E.stage; n = n.parentElement) { const z = getComputedStyle(n).zIndex; if (z !== 'auto') { e.zEff = +z; break; } }
    });
    return {
      vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, gp: +gp.toFixed(4), H, stage: R(sr), fade: +getComputedStyle(E.fade).opacity,
      fontsStatus: document.fonts.status, fonts, mood: +WS.mood.toFixed(2), lang: LANG, els, engine, cover,
      dlgClass: E.dlg.className, choicesClass: E.choices.className,
    };
  };
  // Label strips for the contact sheets, drawn in the page so Cyrillic renders (pngjs has no text).
  S.labels = async (items, w) => {
    const out = [], lh = 13, LINES = 4, F = '11px "Segoe UI", Arial, sans-serif';
    for (const it of items) {
      const cv = new OffscreenCanvas(w, LINES * lh + 6), g = cv.getContext('2d');
      g.fillStyle = it.bad ? '#3a1712' : '#15181d'; g.fillRect(0, 0, w, cv.height);
      const lines = [];
      g.font = 'bold ' + F;
      lines.push(it.head);
      g.font = F;
      let cur = '';
      for (const word of (it.text || '').split(/\s+/)) {
        const t = cur ? cur + ' ' + word : word;
        if (g.measureText(t).width > w - 8 && cur) { lines.push(cur); cur = word; } else cur = t;
      }
      if (cur) lines.push(cur);
      if (lines.length > LINES) { lines.length = LINES; lines[LINES - 1] += ' …'; }
      lines.forEach((L, k) => { g.font = (k ? '' : 'bold ') + F; g.fillStyle = k ? '#e6e6e6' : it.bad ? '#ff9a88' : '#ffd479'; g.fillText(L, 4, 3 + lh * (k + 1) - 3); });
      const b = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let j = 0; j < b.length; j += 0x8000) s += String.fromCharCode.apply(null, b.subarray(j, j + 0x8000));
      out.push(btoa(s));
    }
    return out;
  };
}

// ------------------------------------------------------------------ pages and server
const PAGES = ['index.html', 'test.html', 'ru/index.html', 'ru/test.html'];
function instrument() {
  const dir = path.join(OUT, 'pages');
  for (const p of PAGES) {
    let h = fs.readFileSync(path.join(ROOT, 'site', p), 'utf8');
    const i = h.lastIndexOf('})();');
    if (i < 0) throw new Error('site/' + p + ': no IIFE end');
    h = h.slice(0, i) + '\n;(' + engineHook.toString() + ')();\n' + h.slice(i);
    h = h.replace('<head>', '<head>\n<script>(' + headHook.toString() + ')();</script>\n<style>' + SNAP_CSS + '</style>');
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), h);
  }
  return dir;
}
function serve(dir) {
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(dir, u);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ------------------------------------------------------------------ the browser over CDP
const sleep = ms => new Promise(r => setTimeout(r, ms));
function findBrowser() {
  const c = [opt('browser'), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const f = c.filter(p => p && fs.existsSync(p));
  if (!f.length) throw new Error('no Edge or Chrome found; pass --browser=<exe>');
  return f;
}
// The first browser that opens its debugging port: one can quit at once (Edge does while an update waits to install).
async function pickBrowser() {
  const errs = [];
  for (const exe of findBrowser()) {
    try { const b = await launch(exe, 0); b.close(); return exe; } catch (e) { errs.push(path.basename(exe) + ': ' + e.message); }
  }
  throw new Error('no browser opened its debugging port (' + errs.join('; ') + ')');
}
async function launch(exe, n) {
  const port = 9400 + Math.floor(Math.random() * 400) + n * 7;
  const prof = path.join(OUT, '.profiles', 'p' + port);
  // --mute-audio always; never an autoplay flag.
  const proc = spawn(exe, ['--headless=new', '--mute-audio', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  let list = null, gone = false;
  proc.on('exit', () => { gone = true; });
  for (let i = 0; i < 100 && !list && !gone; i++) { try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch (e) { await sleep(150); } }
  if (!list) throw new Error('the browser did not open its debugging port');
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pend = new Map(), b = { proc, prof, errors: [] };
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') b.errors.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
  };
  b.send = (method, params) => new Promise((r, j) => {
    const i = ++id;
    pend.set(i, d => (d.error ? j(new Error(method + ': ' + d.error.message)) : r(d.result)));
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  b.eval = async expr => {
    const r = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  };
  b.close = () => {
    try { ws.close(); } catch (e) { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']); else proc.kill('SIGKILL');
  };
  await b.send('Page.enable'); await b.send('Runtime.enable'); await b.send('DOM.enable'); await b.send('CSS.enable');
  return b;
}

// ------------------------------------------------------------------ the checks
const parseColor = s => { const m = String(s).match(/[\d.]+/g) || []; return { c: m.slice(0, 3).map(Number), a: m.length > 3 ? +m[3] : 1 }; };
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
const inter = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? { w, h, area: w * h } : null; };
const fracOff = v => Math.abs(v - Math.round(v));
const GRID_TOL = 0.1; // of a game pixel
function check(m) {
  const f = [], add = (type, el, detail) => f.push({ type, el, detail });
  const st = m.stage, view = { x: 0, y: 0, w: m.vw, h: m.vh };
  if (m.fontsStatus !== 'loaded') add('fonts-not-loaded', '-', m.fontsStatus);
  for (const fo of m.fonts) if (fo.status === 'error') add('font-load-error', '-', fo.style + ' ' + fo.weight + ' ' + fo.range);
  for (const e of m.els) {
    if (e.text && e.font) {
      if (!/^\s*"?Literata/i.test(e.font.family)) add('font-family', e.name, e.font.family);
      const other = (e.platform || []).filter(p => !/Literata/i.test(p.family) && p.glyphs > 0);
      if (other.length) add('font-fallback', e.name, other.map(p => p.family + ' (' + p.glyphs + ' glyphs)').join(', ') + ' in "' + e.text.slice(0, 40) + '"');
      if (e.font.size < 11) add('small-text', e.name, e.font.size + 'px');
      if (m.lang === 'ru' && /[A-Za-z]/.test(e.text) && e.name !== 'lang') add('latin-in-ru', e.name, e.text.slice(0, 60));
      const col = parseColor(e.color), a = col.a * (e.alpha === undefined ? 1 : e.alpha);
      if (e.bg && e.bg.mean) {
        const large = e.font.size >= 24 || (e.font.size >= 18.66 && +e.font.weight >= 700);
        const need = large ? 3 : 4.5;
        if (m.fade > 0.5 && !(e.zEff > 8)) { /* under the black fade: not seen at all */ } else if (e.bgKind === 'loose') {
          // Outlined text reads against its own closed ring (the picture's mean is kept as a note only).
          const ring = e.ring || [0, 0, 0], r = ratio(over(col.c, a, ring), ring);
          if (r < 4.5) add('contrast-loose', e.name, 'ratio ' + r.toFixed(2) + ' against its outline (picture mean ' + ratio(over(col.c, a, e.bg.mean), e.bg.mean).toFixed(2) + ')');
        } else {
          const r = ratio(over(col.c, a, e.bg.mean), e.bg.mean);
          if (r < need) add('contrast', e.name, 'ratio ' + r.toFixed(2) + ' < ' + need + ' (' + e.color + ' x' + a.toFixed(2) + ' on rgb(' + e.bg.mean.join(',') + '))');
        }
      }
    }
    // Overflow: a box that clips or scrolls its text (the panel's question scrolls by design while choices
    // show); a nowrap line wider than its box; text that runs out of its slab (or out of the bubble's box).
    if (e.scroll && e.name !== 'bubble' && !e.button) {
      const x = e.scroll.sw - e.scroll.cw, y = e.scroll.sh - e.scroll.ch, clips = e.scroll.oy !== 'visible';
      if (clips && (x > 1 || y > 1)) add(e.name === 'text' && /choosing/.test(m.dlgClass) ? 'overflow-scrolls' : 'overflow-clipped', e.name, 'content ' + e.scroll.sw + 'x' + e.scroll.sh + ' in ' + e.scroll.cw + 'x' + e.scroll.ch);
      else if (x > 1) add('overflow-wide', e.name, 'content ' + e.scroll.sw + ' wide in ' + e.scroll.cw);
    }
    if (e.text && e.textRect && !e.loose) {
      const own = e.slab ? e : m.els.filter(f => f.slab && e.inside.includes(f.name)).sort((a, b) => b.inside.length - a.inside.length)[0];
      if (own) {
        const q = own.rect, t = e.textRect, d = Math.max(q.x - t.x, t.x + t.w - (q.x + q.w), q.y - t.y, t.y + t.h - (q.y + q.h));
        if (d > 1) add('text-outside-box', e.name, 'text ' + d.toFixed(1) + 'px out of ' + own.name);
      }
    }
    const shape = e.cloud || e.rect;
    const out = s => Math.max(s.x - shape.x, shape.x + shape.w - (s.x + s.w), s.y - shape.y, shape.y + shape.h - (s.y + s.h));
    const os = out(st), ov = out(view);
    if (os > 0.5) add('outside-stage', e.name, os.toFixed(1) + 'px past the stage edge');
    if (ov > 0.5) add('outside-viewport', e.name, ov.toFixed(1) + 'px past the viewport');
    if (e.target && e.target.h < 43.5) add('small-target', e.name, e.target.w.toFixed(0) + 'x' + e.target.h.toFixed(1));
    if (e.slab) {
      // the canvas grid: columns are stage width / W, rows stage height / H (not always the same)
      const gy = m.stage.h / m.H, ed = [(e.rect.x - st.x) / m.gp, (e.rect.y - st.y) / gy, (e.rect.x + e.rect.w - st.x) / m.gp, (e.rect.y + e.rect.h - st.y) / gy];
      const bad = ['left', 'top', 'right', 'bottom'].filter((n, k) => fracOff(ed[k]) > GRID_TOL);
      if (bad.length) add('off-grid', e.name, bad.map(n => n + ' ' + ed[['left', 'top', 'right', 'bottom'].indexOf(n)].toFixed(2) + 'gp').join(', '));
      // the bottom padding takes the remainder that rounds a slab's height to whole game pixels, by design
      if (e.pad) { const pb = e.pad.filter((v, k) => k !== 2).map(v => v / m.gp).filter(v => fracOff(v) > GRID_TOL); if (pb.length) add('padding-off-grid', e.name, e.pad.map(v => (v / m.gp).toFixed(2)).join(' ') + ' gp'); }
    }
    if (m.fade > 0.5 && e.text && !/^(count|lang|mute|skip)$/.test(e.name) && !(e.zEff > 8)) add('under-fade', e.name, 'the black fade is at ' + m.fade.toFixed(2) + ' over "' + e.text.slice(0, 40) + '"');
  }
  const boxes = m.els.filter(e => e.box).map(e => ({ name: e.name, inside: e.inside, r: e.cloud || (e.loose ? e.textRect : e.rect) })).filter(b => b.r);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (boxes[i].inside.includes(boxes[j].name) || boxes[j].inside.includes(boxes[i].name)) continue;
    const q = inter(boxes[i].r, boxes[j].r);
    if (q && q.area > 4) add('overlap', boxes[i].name + '+' + boxes[j].name, q.w.toFixed(0) + 'x' + q.h.toFixed(0) + ' CSS px');
  }
  // The panel, the card, the caption, the prompt and the bubble must not hide the boat group or the golden fish
  // (counted in drawn sprite pixels, the bubble by its own cloud).
  for (const el in m.cover || {}) for (const k in m.cover[el]) add('covers-' + k, el, m.cover[el][k] + ' drawn px of the ' + k + ' hidden');
  return f;
}

// ------------------------------------------------------------------ PNG helpers and contact sheets
function downscale(src, tw) {
  const s = src.width / tw, th = Math.max(1, Math.round(src.height / s)), dst = new PNG({ width: tw, height: th });
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * s), y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor((y + 1) * s)));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * s), x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor((x + 1) * s)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * src.width + xx) * 4; r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++; }
      const o = (y * tw + x) * 4;
      dst.data[o] = r / n; dst.data[o + 1] = g / n; dst.data[o + 2] = b / n; dst.data[o + 3] = 255;
    }
  }
  return dst;
}
async function sheet(b, shots, title, file, desk) {
  const TW = desk ? 300 : 200, COLS = desk ? 5 : 8, GAP = 6;
  const items = [{ head: title, text: shots.length + ' snapshots; red labels have metric failures' }].concat(shots.map(s => ({
    head: s.seq + ' ' + s.kinds + (s.fails.length ? '  (' + s.fails.length + ' fails)' : ''), text: s.label, bad: s.fails.length > 0,
  })));
  const labels = (await b.eval('__UIS.labels(' + JSON.stringify(items) + ',' + TW + ')')).map(x => PNG.sync.read(Buffer.from(x, 'base64')));
  const head = (await b.eval('__UIS.labels(' + JSON.stringify([items[0]]) + ',' + (COLS * (TW + GAP) + GAP) + ')')).map(x => PNG.sync.read(Buffer.from(x, 'base64')))[0];
  const thumbs = shots.map(s => downscale(PNG.sync.read(fs.readFileSync(s.path)), TW));
  const th = thumbs.length ? thumbs[0].height : 100, lh = labels[0].height, cell = th + lh + GAP;
  const rows = Math.ceil(shots.length / COLS), W2 = COLS * (TW + GAP) + GAP, H2 = head.height + GAP + rows * cell + GAP;
  const out = new PNG({ width: W2, height: H2 });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 8; out.data[i + 1] = 9; out.data[i + 2] = 12; out.data[i + 3] = 255; }
  PNG.bitblt(head, out, 0, 0, head.width, head.height, 0, 0);
  thumbs.forEach((t, k) => {
    const x = GAP + (k % COLS) * (TW + GAP), y = head.height + GAP + Math.floor(k / COLS) * cell;
    PNG.bitblt(t, out, 0, 0, t.width, Math.min(t.height, th), x, y);
    PNG.bitblt(labels[k + 1], out, 0, 0, TW, lh, x, y + th);
  });
  fs.writeFileSync(file, PNG.sync.write(out));
}

// ------------------------------------------------------------------ one run
function seedScript(cfg, seed) {
  const s = ['window.__UIS_CFG=' + JSON.stringify(cfg) + ';', 'try{localStorage.clear();'];
  if (seed) {
    s.push("localStorage.setItem('stillwater-runs'," + JSON.stringify(JSON.stringify(seed.runs)) + ');');
    s.push("localStorage.setItem('stillwater-last'," + JSON.stringify(JSON.stringify(seed.last)) + ');');
    s.push("localStorage.setItem('stillwater-endings'," + JSON.stringify(JSON.stringify(seed.endings)) + ');');
  }
  s.push('}catch(e){}');
  return s.join('');
}
const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
async function runJob(b, job, base) {
  const { run, size, sizeId, lang, plan } = job;
  const dir = path.join(OUT, lang + '-' + sizeId, run.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const page = (lang === 'ru' ? 'ru/' : '') + (run.page === 'test' ? 'test.html' : 'index.html');
  const cfg = { plan: plan[0], wait: !!(plan[3] && plan[3].wait), tap: !!(run.tap || (plan[3] && plan[3].tap)), tapRed: !!run.tapRed, fish: !!run.fish, speed: SPEED, forceTest: run.page !== 'test' };
  b.errors.length = 0;
  await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: size.dpr, mobile: size.mobile });
  await b.send('Page.navigate', { url: 'about:blank' });
  await sleep(150);
  const { identifier } = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(cfg, run.seed) });
  await b.send('Page.navigate', { url: base + page });
  for (let i = 0; i < 100; i++) { if (await b.eval('!!(window.__UIS && window.__UIS.poll)').catch(() => false)) break; await sleep(100); }
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await b.eval('document.fonts.ready.then(() => true)').catch(() => {});
  const shots = [], t0 = Date.now();
  let seq = 0, lastGt = -1, lastMove = Date.now(), st = null, outcome = 'done';
  for (;;) {
    st = await b.eval('__UIS.poll()');
    if (st.err) { outcome = 'page error'; break; }
    if (st.events.length) {
      await b.eval('__UIS.prep()');
      const m = await b.eval('__UIS.metrics()');
      const doc = await b.send('DOM.getDocument', { depth: 0 });
      for (const e of m.els) {
        if (!e.text) continue;
        try {
          const q = await b.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-uis="' + e.i + '"]' });
          if (q.nodeId) e.platform = (await b.send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId })).fonts.map(x => ({ family: x.familyName, custom: x.isCustomFont, glyphs: x.glyphCount }));
        } catch (err) { e.platformErr = err.message; }
      }
      const shot = await b.send('Page.captureScreenshot', { format: 'png' });
      seq++;
      const kinds = [...new Set(st.events.map(e => e.kind))].join('+');
      const name = String(seq).padStart(3, '0') + '-' + kinds.replace(/[^a-z+-]/gi, '') + '.png';
      const p = path.join(dir, name);
      fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
      const fails = check(m);
      const el = n => (m.els.find(e => e.name === n) || {}).text;
      const label = st.events.map(e => {
        if (e.kind === 'panel' || e.kind === 'menu') return (e.who ? e.who + ': ' : e.style ? e.style + ': ' : '') + (el('text') || e.text) + (e.labels ? ' [' + e.labels.join(' | ') + ']' : '');
        if (e.kind === 'whisper') return (el('who') || 'whisper') + ': ' + el('text');
        if (e.kind === 'card') return [el('cardName'), el('cardDesc'), el('cardVoice')].filter(Boolean).join(' / ');
        if (e.kind === 'ending') return [el('endTitle'), el('endText')].filter(Boolean).join(': ');
        if (e.kind === 'title' || e.kind === 'title-found') return (el('found') || 'fresh title');
        if (e.kind === 'bubble' || e.kind === 'bubble-menu') return '(' + e.side + ') ' + (el('bubbleText') || e.text) + (e.labels ? ' [' + e.labels.join(' | ') + ']' : '');
        return el(e.kind === 'ocean' ? 'prompt' : e.kind) || e.text || '';
      }).join(' // ');
      shots.push({ seq: String(seq).padStart(3, '0'), file: path.relative(OUT, p).replace(/\\/g, '/'), path: p, kinds, label, events: st.events, fails, metrics: m });
      await b.eval('__UIS.resume()');
      lastMove = Date.now();
      continue;
    }
    if (st.done) break;
    if (st.gt !== lastGt) { lastGt = st.gt; lastMove = Date.now(); }
    if (Date.now() - lastMove > 30000) { outcome = 'stalled in ' + st.phase; break; }
    if (Date.now() - t0 > RUN_TIMEOUT) { outcome = 'timed out in ' + st.phase; break; }
    await sleep(60);
  }
  const ending = shots.filter(s => s.kinds.includes('ending')).map(s => s.label)[0] || null;
  const res = { run: run.id, sim: run.sim, plan: plan[0], lang, size: sizeId, page, outcome, err: st && st.err, pageErrors: b.errors.slice(), log: st ? st.log : [], ending, secs: Math.round((Date.now() - t0) / 1000), shots: shots.map(s => ({ seq: s.seq, file: s.file, kinds: s.kinds, label: s.label, events: s.events, fails: s.fails, metrics: s.metrics })) };
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(res, null, 1));
  const sheetFile = path.join(OUT, 'sheets', run.id + '__' + lang + '-' + sizeId + '.png');
  if (shots.length) await sheet(b, shots, run.id + '  ' + lang + '  ' + sizeId + ' @' + size.dpr + 'x  (' + run.sim + ')  ' + outcome, sheetFile, !size.mobile);
  res.sheet = shots.length ? path.relative(OUT, sheetFile).replace(/\\/g, '/') : null;
  return res;
}

// ------------------------------------------------------------------ summary
function summarize(results) {
  const groups = new Map(), counts = {};
  for (const r of results) {
    const k = r.lang + ' ' + r.size;
    counts[k] = (counts[k] || 0) + r.shots.length;
    for (const s of r.shots) for (const f of s.fails) {
      const key = f.type + ' | ' + f.el;
      if (!groups.has(key)) groups.set(key, { type: f.type, el: f.el, n: 0, sizes: new Set(), langs: new Set(), files: [], details: new Set() });
      const g = groups.get(key);
      g.n++; g.sizes.add(r.size); g.langs.add(r.lang);
      if (g.files.length < 6) g.files.push(s.file);
      if (g.details.size < 4) g.details.add(f.detail);
    }
  }
  const list = [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || b.n - a.n)
    .map(g => ({ type: g.type, el: g.el, n: g.n, sizes: [...g.sizes], langs: [...g.langs], details: [...g.details], files: g.files }));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines = ['UI shots: ' + results.length + ' runs, ' + total + ' snapshots', ''];
  lines.push('Snapshots per language and size:');
  for (const k of Object.keys(counts).sort()) lines.push('  ' + k.padEnd(14) + counts[k]);
  lines.push('', 'Runs that did not finish:');
  const bad = results.filter(r => r.outcome !== 'done' || r.err || r.pageErrors.length);
  if (!bad.length) lines.push('  none');
  for (const r of bad) lines.push('  ' + r.lang + ' ' + r.size + ' ' + r.run + ': ' + r.outcome + (r.err ? ' ' + short(r.err, 200) : '') + (r.pageErrors.length ? ' page errors: ' + short(r.pageErrors.join(' / '), 200) : ''));
  lines.push('', 'Metric failures, grouped (type | element: count, sizes, langs; examples):');
  for (const g of list) {
    lines.push('  ' + g.type + ' | ' + g.el + ': ' + g.n + ' (' + g.sizes.join(' ') + '; ' + g.langs.join(' ') + ')');
    for (const d of g.details) lines.push('      ' + short(d, 160));
    for (const f of g.files) lines.push('      ' + f);
  }
  lines.push('', 'Sheets: ' + OUT.replace(/\\/g, '/') + '/sheets/');
  for (const r of results) if (r.sheet) lines.push('  ' + r.sheet + '  (' + r.shots.length + ')');
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ counts, groups: list, runs: results.map(r => ({ run: r.run, lang: r.lang, size: r.size, outcome: r.outcome, err: r.err, pageErrors: r.pageErrors, ending: r.ending, shots: r.shots.length, secs: r.secs, sheet: r.sheet, log: r.log })) }, null, 1));
  fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
  return lines.join('\n');
}

// ------------------------------------------------------------------ main
async function main() {
  const want = (n, all) => { const v = opt(n); return v ? v.split(',').filter(x => all.includes(x)) : all; };
  const runs = want('runs', RUNS.map(r => r.id)).map(id => RUNS.find(r => r.id === id));
  const sizes = want('sizes', Object.keys(SIZES)), langs = want('langs', LANGS);
  const plans = simPlans();
  for (const r of runs) if (!plans.find(p => p[1] === r.sim)) throw new Error('no plan in tools/sim.js labelled: ' + r.sim);
  if (!args.includes('--no-build')) execSync('npm run build:site', { cwd: ROOT, stdio: 'inherit' });
  fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
  const srv = await serve(instrument());
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const queue = [];
  for (const lang of langs) for (const sizeId of sizes) for (const run of runs) queue.push({ run, lang, sizeId, size: SIZES[sizeId], plan: plans.find(p => p[1] === run.sim) });
  const exe = await pickBrowser(), results = [];
  console.log('uishots: ' + queue.length + ' runs, ' + Math.min(JOBS, queue.length) + ' browsers (' + path.basename(exe) + ', muted), speed ' + SPEED + 'x, into ' + OUT);
  const worker = async n => {
    let b = await launch(exe, n);
    while (queue.length) {
      const job = queue.shift();
      let r;
      try { r = await runJob(b, job, base); } catch (e) {
        r = { run: job.run.id, lang: job.lang, size: job.sizeId, outcome: 'harness error: ' + e.message, err: null, pageErrors: [], log: [], shots: [], sheet: null };
        b.close(); b = await launch(exe, n);
      }
      results.push(r);
      const nf = r.shots.reduce((a, s) => a + s.fails.length, 0);
      console.log('[' + results.length + '] ' + r.lang + ' ' + r.size + ' ' + r.run + ': ' + r.outcome + ', ' + r.shots.length + ' snapshots, ' + nf + ' fails' + (r.ending ? ', ' + short(r.ending, 60) : ''));
    }
    b.close();
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, (_, n) => worker(n)));
  srv.close();
  try { fs.rmSync(path.join(OUT, '.profiles'), { recursive: true, force: true }); } catch (e) { /* a profile still locked */ }
  results.sort((a, b) => (a.lang + a.size + a.run).localeCompare(b.lang + b.size + b.run));
  console.log('\n' + summarize(results));
}
main().catch(e => { console.error(e); process.exit(1); });

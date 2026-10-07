// Renders every synthesised sound in the game, silently, and measures it (npm run sfx).
//   node tools/sfxrender.js [--out=<dir>] [--only=knock,hiss] [--timeline=stay,sea,swallowed,inside|none] [--browser=<exe>]
// The real SFX object (src/game.js) runs in headless Edge or Chrome, started with --mute-audio, against an
// OfflineAudioContext: window.AudioContext is swapped for it while SFX.init() builds the real chain, so nothing
// ever reaches a speaker. Each sound is rendered with its call sites' arguments to a 44.1 kHz WAV with a
// spectrogram PNG and measured (tools/sfxmeasure.js). Then the mix: the game is played headless in Node by a
// bot with human pacing, every SFX call is logged with its time, and the log is replayed offline into one WAV
// per run, with the ambient bed, the drone, the heartbeat and the weight, and a loudness-over-time plot.
// Writes to tools/out/sfx (gitignored): sounds/, timeline/, summary.json; prints the tables.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module'), { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const M = require('./sfxmeasure.js');
const { SR, fx } = M;

const ROOT = path.join(__dirname, '..');
const arg = n => { const a = process.argv.find(s => s.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const OUT = path.resolve(arg('out') || path.join(ROOT, 'tools', 'out', 'sfx'));
const ONLY = arg('only') ? arg('only').split(',') : null;
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'game.js'), 'utf8');
const num = n => { const m = SRC.match(new RegExp('\\b' + n + '\\s*=\\s*([\\d.]+)')); if (!m) throw new Error('no constant ' + n + ' in src/game.js'); return +m[1]; };
const TRIM = num('SFX_TRIM'), SNAP_K = num('STAY_SNAP_K');
const SFX_DECL = '\nconst SFX = {';
if (SRC.split(SFX_DECL).length !== 2) throw new Error('src/game.js must declare `const SFX = {` exactly once');

// ---------------------------------------------------------------- the sounds and where they play
const KWALK = num('KNOCK_WALK'), HB = num('HB_GAP'), STRAIN = num('STAY_STRAIN'), WOUT = num('WEIGHT_OUT'), CROSS = num('OCEAN_CROSS');
const WHERE = {
  whoosh: 'cast; Stay push-off; Swallowed lunge; Inside cast', plop: 'float lands; ocean cast lands; Stay push-off; boat goes under; Inside',
  nibble: 'each nibble', bite: 'a bite', hook: 'tap on a bite', reelTick: 'about 6.5 a second while holding the reel (pitch rises with tension)',
  drag: 'each surge cue while reeling', slack: 'too early; slipped the hook',
  snap: 'line snaps; Stay snap (x' + SNAP_K + '); Still water cut (then far)', snapLow: 'Stay snap; the red sequence', splash: 'fish landed; golden fish; cut; Stay; Deep',
  row: 'opening row-in (x2); Inside', caught: 'catch card (sour in act 2)', chime: 'golden fish; wishes granted (a semitone lower each); red sky fish', select: 'every choice tap',
  swell: 'sunset (glide); ocean cutscene; Deep', match: 'lantern lit at sunset', hiss: 'steam: cut (2.2); Stay disc (3); Stay impact (0.5, 0.6)',
  snuff: 'Dark: the lantern goes out', gurgle: 'gold sink', glint: 'gold glint (sink, Deep)', toll: 'a granted wish: each sun step', bird: 'Still water dawn, lake',
  lap: 'the lake against the hull, every few seconds out of the red', impact: 'Stay: he lands on the eye',
  rumble: 'Home jaws', surge: 'Swallowed rise', slam: 'Swallowed mouth closes', douse: 'Swallowed spray', crunch: 'Home jaws',
  creak: 'Stay strain (0.7); Inside door (0.6, door)', knock: 'cabin knocks (1); Inside door shuts (0.7); Inside walk (' + KWALK + '); from inside (0.3)',
  heartbeat: 'in the red, in runs with rests; quicker in Stay', drone: 'the red (CINE_RED) until Dark, Deep, Stay or cut; ducked for Stay and the Inside door', weight: 'the big one crossing and leaving',
  ambient: 'the bed, from the first tap, always', mute: 'the Mute button',
};
const ev = (t, name, ...args) => ({ t, name, args });
const LEAD = 0.4;
const one = (name, args, len) => ({ id: name + (args.length ? '(' + args.join(',') + ')' : ''), name, bare: true, len, events: [ev(0, name, ...args)] });
const SOUNDS = [
  one('whoosh', [], 0.7), one('plop', [], 0.6), one('nibble', [], 0.4), one('bite', [], 0.6), one('hook', [], 0.4), one('reelTick', [0.3], 0.2),
  { id: 'reelTick(reel 3s)', name: 'reelTick', bare: true, len: 3.4, events: Array.from({ length: 21 }, (_, i) => ev(i * 0.155, 'reelTick', 0.2 + i * 0.03)) },
  one('drag', [], 0.6), one('slack', [], 0.6),
  one('snap', [], 0.6), one('snap', [false, SNAP_K], 0.6), one('snap', [true], 0.8), one('snapLow', [], 1.3), one('splash', [], 1), one('row', [], 1.3),
  one('caught', [], 0.7), one('caught', [true], 0.7), one('chime', [], 2.6), one('chime', [2], 2.6), one('chime', [2, true], 2.6),
  one('select', [], 0.3), one('swell', [], 7.6), one('swell', [7, true], 7.6), one('match', [], 0.9),
  one('hiss', [2.2], 2.7), one('hiss', [3], 3.5), one('snuff', [], 0.6), one('gurgle', [3.5], 4), one('glint', [], 0.9), one('toll', [196], 2.8),
  one('bird', [], 0.5), one('lap', [true], 0.8), one('impact', [], 1),
  one('rumble', [], 5), one('surge', [], 2.7), one('slam', [], 1.3), one('douse', [], 1.9), one('crunch', [], 1.4),
  one('creak', [STRAIN], 1.2), one('creak', [0.6, true], 1.1),
  one('knock', [], 0.5), one('knock', [0.7], 0.5), one('knock', [KWALK], 0.5), one('knock', [0.3], 0.5),
  one('heartbeat', [], 0.8),
  { id: 'heartbeat(x6 at HB_GAP)', name: 'heartbeat', bare: true, len: HB * 6 + 0.6, events: Array.from({ length: 6 }, (_, i) => ev(i * HB, 'heartbeat')) },
  { id: 'heartbeat(x6 quick)', name: 'heartbeat', bare: true, len: HB * 0.45 * 6 + 0.6, events: Array.from({ length: 6 }, (_, i) => ev(i * HB * 0.45, 'heartbeat')) },
  { id: 'drone(on 0, off 8)', name: 'drone', bare: true, len: 14, events: [ev(0, 'drone', true), ev(8, 'drone', false)] },
  { id: 'weight(on 0, off ' + (CROSS + 3) + ')', name: 'weight', bare: true, len: CROSS + 3 + WOUT + 1.5, events: [ev(0, 'weight', true), ev(CROSS + 3, 'weight', false)] },
  { id: 'ambient(30s)', name: 'ambient', bare: false, len: 30, events: [ev(0, 'init')] },
  { id: 'mute(chime, mute at 1.5, chime)', name: 'mute', bare: false, len: 4, events: [ev(0, 'init'), ev(0.5, 'chime'), ev(1.5, 'setMuted', true), ev(2, 'chime')] },
  { id: 'mute(before init, chime)', name: 'mute', bare: false, len: 2, events: [ev(0, 'setMuted', true), ev(0.01, 'init'), ev(0.3, 'chime')] },
];

// ---------------------------------------------------------------- the page: the game with SFX reachable
function writePage() {
  const tpl = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
  const code = SRC.replace(SFX_DECL, '\nconst SFX = window.__SFX = {');
  const file = path.join(OUT, 'page.html');
  fs.writeFileSync(file, tpl.replace('/*GAME*/', () => code));
  return file;
}
// Runs in the page: renders a job's events through the real SFX against an OfflineAudioContext.
const PAGE_HELPER = `window.__sw = (() => {
  const S = window.__SFX, SR = ${SR};
  let last = null;
  async function render(job) {
    const len = Math.ceil(job.len * SR), oc = new OfflineAudioContext(1, len, SR), errors = [], groups = new Map();
    const keep = { AC: window.AudioContext, WAC: window.webkitAudioContext, ST: window.setTimeout, resume: S.resume, rnd: Math.random };
    // Every buffer source is watched: one that is not looped and asked to play past its buffer's end goes
    // silent early (the noise buffer is 2 s, started at a random offset).
    const srcs = [], mk = oc.createBufferSource.bind(oc);
    oc.createBufferSource = () => {
      const n = mk(), st = n.start.bind(n), sp = n.stop.bind(n), r = {};
      srcs.push(r);
      n.start = (w, off, d) => { r.at = Math.max(w || 0, oc.currentTime); r.off = off || 0; r.bufDur = n.buffer ? n.buffer.duration : 0; r.loop = n.loop; return st(w || 0, off || 0, d); };
      n.stop = w => { r.end = w === undefined ? oc.currentTime : w; return sp(w); };
      return n;
    };
    let seed = job.seed || 7; // a seeded Math.random, so every render is the same
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const frameNow = () => Math.round(oc.currentTime * SR);
    // Events (and the SFX's own setTimeout stops) run at render-quantum boundaries through suspend().
    const at = (t, fn) => {
      const f = Math.round(t * SR / 128) * 128;
      if (f >= len) return;
      if (f <= frameNow()) { try { fn(); } catch (e) { errors.push(String(e)); } return; }
      let g = groups.get(f);
      if (!g) {
        g = []; groups.set(f, g);
        oc.suspend(f / SR).then(() => { groups.delete(f); for (let i = 0; i < g.length; i++) { try { g[i](); } catch (e) { errors.push(String(e)); } } return oc.resume(); });
      }
      g.push(fn);
    };
    const call = (name, args) => {
      if (name === 'init') {
        S.init();
        if (S.ctx !== oc) errors.push('SFX.init did not take the offline context');
        // A lone sound: no ambient bed and no 50 ms fade-in of the mute under it (in the game the first sound
        // comes well after the first tap); the master chain stays.
        else if (job.bare && S.amb) { S.amb.g.disconnect(); S.out.gain.cancelScheduledValues(0); S.out.gain.setValueAtTime(1, 0); }
        return;
      }
      S[name].apply(S, args || []);
    };
    try {
      window.AudioContext = function () { return oc; }; window.webkitAudioContext = undefined;
      window.setTimeout = (fn, ms, ...a) => { at(oc.currentTime + (ms || 0) / 1000, () => fn(...a)); return 0; };
      S.resume = () => {}; Math.random = rnd;
      S.ctx = null; S.out = null; S.buf = null; S.drn = null; S.wgt = null; S.amb = null; S.sc = null; S.fol = null; S.dst = null; S.muted = false;
      if (job.bare) call('init');
      for (const e of job.events) at(e.t, () => call(e.name, e.args));
      const buf = await oc.startRendering();
      last = buf.getChannelData(0);
      const starved = srcs.filter(r => r.at !== undefined && !r.loop && r.end !== undefined && r.end - r.at > r.bufDur - r.off + 0.01)
        .map(r => ({ at: r.at, want: r.end - r.at, got: r.bufDur - r.off }));
      return { len: last.length, errors, starved };
    } finally {
      Math.random = keep.rnd;
      window.AudioContext = keep.AC; window.webkitAudioContext = keep.WAC; window.setTimeout = keep.ST; S.resume = keep.resume;
      S.ctx = null; S.out = null; S.drn = null; S.wgt = null; S.fol = null; S.dst = null; S.muted = false;
    }
  }
  function chunk(i, n) {
    const a = last.subarray(i, Math.min(last.length, i + n)), u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    let s = '';
    for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
    return btoa(s);
  }
  return { render, chunk };
})(); true`;

// ---------------------------------------------------------------- a headless browser over the DevTools protocol
function findBrowser() {
  const c = [arg('browser'), process.env.SFX_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  const f = c.filter(p => p && fs.existsSync(p));
  if (!f.length) throw new Error('no Edge or Chrome found; pass --browser=<path>');
  return f;
}
function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url), pend = new Map();
    let id = 0;
    ws.onerror = () => rej(new Error('DevTools socket error'));
    ws.onmessage = m => { const d = JSON.parse(m.data), p = d.id && pend.get(d.id); if (!p) return; pend.delete(d.id); if (d.error) p.no(new Error(d.error.message)); else p.ok(d.result); };
    ws.onopen = () => res({
      send: (method, params) => new Promise((ok, no) => { const i = ++id; pend.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }),
      close: () => ws.close(),
    });
  });
}
// Tries each browser found in turn: one can quit at once (Edge does while an update waits to install).
async function launch() {
  const errs = [];
  for (const exe of findBrowser()) {
    try { return await launchWith(exe); } catch (e) { errs.push(path.basename(exe) + ': ' + e.message); }
  }
  throw new Error('no browser opened DevTools (' + errs.join('; ') + ')');
}
async function launchWith(exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfxrender-'));
  // --mute-audio: nothing may reach the speakers. No autoplay flag: the offline context needs none.
  const proc = spawn(exe, ['--headless=new', '--mute-audio', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let s = '';
    const to = setTimeout(() => rej(new Error('the browser did not open DevTools')), 30000);
    proc.stderr.on('data', d => { s += d; const m = s.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(to); res(m[1]); } });
    proc.on('exit', c => rej(new Error('the browser exited (' + c + ')')));
  });
  const list = await (await fetch('http://127.0.0.1:' + new URL(wsUrl).port + '/json/list')).json();
  const cdp = await connect(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  const evaluate = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  };
  const close = async () => {
    try { await Promise.race([cdp.send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch (e) { /* already gone */ }
    try { proc.kill(); } catch (e) { /* already gone */ }
    for (let i = 0; i < 10; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch (e) { await new Promise(r => setTimeout(r, 300)); } }
  };
  return { cdp, evaluate, close };
}
async function openGame(b, file) {
  await b.cdp.send('Page.navigate', { url: pathToFileURL(file).href });
  for (let i = 0; i < 100; i++) {
    if (await b.evaluate('document.readyState === "complete" && !!window.__SFX').catch(() => false)) return b.evaluate(PAGE_HELPER);
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('the game page did not load');
}
async function render(b, job) {
  const r = await b.evaluate('__sw.render(' + JSON.stringify(job) + ')');
  const x = new Float32Array(r.len), N = 1 << 20;
  for (let i = 0; i < r.len; i += N) {
    const buf = Buffer.from(await b.evaluate('__sw.chunk(' + i + ',' + N + ')'), 'base64');
    x.set(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)), i);
  }
  return { x, errors: r.errors, starved: r.starved };
}

// ---------------------------------------------------------------- a run played in Node, every SFX call logged
function loadGame() {
  const file = path.join(ROOT, 'src', 'game.js');
  const m = new Module(file, module);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(SRC.replace('module.exports = {', 'module.exports = { SFX,'), file);
  return m.exports;
}
const RUNS = {
  stay: { plan: [0, 0, 0, 0, 0, 3], tap: true, label: 'let go, company, forever, yes -> Stay' },
  sea: { plan: [1, 1, 1, 1], wait: true, label: 'keep, fish (wait), hear -> Dark at sea' },
  swallowed: { plan: [0, 1], label: 'let go, fish, cast -> Swallowed' },
  inside: { plan: [0, 2, 0, 3], label: 'let go, home, forever -> Inside' },
};
// A bot with human pacing: it reads each line (0.9 s plus 45 ms a character), thinks 2.5 s at a menu, looks at
// a card for 2.8 s, hits a bite in 0.4 s and reels like the sim's bot (it sees the line 0.35 s late).
function recordRun(g, spec) {
  const S = g.SFX, UI = g.UI, log = [], orig = {};
  let now = 0, depth = 0;
  for (const k of Object.keys(S)) {
    if (typeof S[k] !== 'function' || ['tone', 'noise', 'resume', 'ambient'].includes(k)) continue;
    orig[k] = S[k];
    // Only the game's own calls: a sound that calls another (impact plays a hiss) is replayed once.
    S[k] = function (...a) { if (!depth) log.push({ t: now, name: k, args: a }); depth++; try { return orig[k].apply(this, a); } finally { depth--; } };
  }
  try {
    g.resetAll(); UI.log.length = 0;
    const dt = 1 / 30, REACT = 0.35, seen = [];
    let t = 0, ci = 0, holding = false, frames = 0, sig = '', since = 0, pressedSig = null, endAt = -1, tapped = -1, thinks = 0, lastThink = '', scanned = 0;
    while (t < 1200) {
      now = t;
      for (; scanned < UI.log.length; scanned++) if (UI.log[scanned][0] === 'think') { thinks++; lastThink = UI.log[scanned][1] || ''; }
      const p = g.phase, cur = g.DLG.cur, bubble = g.G.t < g.G.thinkUntil;
      const s = [p, cur ? cur.text : '', bubble, !!UI.choices, thinks].join('|');
      if (s !== sig) { sig = s; since = t; }
      let need = Infinity;
      if (bubble) need = 1 + lastThink.length * 0.045;
      else if (p === 'title') need = 1.5;
      else if (p === 'ready') need = 1.2;
      else if (p === 'card') need = 2.8;
      else if (p === 'bite') need = 0.4;
      else if (p === 'ocean') need = spec.wait ? Infinity : 2.5;
      else if (p === 'dialog') need = UI.choices ? 2.5 : cur ? 0.9 + String(cur.text || '').length * 0.045 : 6;
      if (pressedSig === sig && need < Infinity) need = 1.2;
      if (t - since >= need) {
        pressedSig = sig; since = t;
        if (!bubble && p === 'dialog' && UI.choices) { const c = UI.choices[spec.plan[ci++] || 0] || UI.choices[0]; c.cb(); }
        else if (!bubble && p === 'ready' && spec.tap && g.WS.companion > 0.5 && tapped < g.STORY.act) { g.companionTap(); tapped = g.STORY.act; }
        else if (!bubble && p === 'bite') { g.press(); holding = true; }
        else { g.press(); g.release(); }
      }
      if (p === 'reeling' && g.G.reel) {
        const r = g.G.reel;
        seen.push({ t, T: r.T, surge: r.surge > 0 });
        while (seen.length > 1 && seen[1].t <= t - REACT) seen.shift();
        const v = seen[0].t <= t - REACT ? seen[0] : null;
        if (v) {
          if (holding && (v.surge || v.T > 0.7)) { g.release(); holding = false; }
          else if (!holding && !v.surge && v.T < 0.3) { g.press(); holding = true; }
        }
      } else { seen.length = 0; if (holding && p !== 'reeling') { g.release(); holding = false; } }
      g.update(dt);
      if (frames++ % 7 === 0) g.render(t);
      t += dt;
      if (g.phase === 'end' && endAt < 0) endAt = t;
      if (endAt >= 0 && t > endAt + 8) break;
    }
    const card = UI.log.filter(l => l[0] === 'ending').map(l => l[1])[0];
    return { log, end: t, ending: card ? card.id + (card.variant ? ':' + card.variant : '') : 'none (' + g.phase + ')' };
  } finally { for (const k of Object.keys(orig)) S[k] = orig[k]; }
}

// ---------------------------------------------------------------- reports
const key = e => e.name + (e.args.length ? '(' + e.args.join(',') + ')' : '');
const notes = a => {
  const n = [];
  if (a.clipped) n.push(a.clipped + ' clipped samples');
  if (a.truePeak > -1) n.push('true peak over -1 dBTP');
  if (a.below150 > 0.7) n.push(Math.round(a.below150 * 100) + '% below 150 Hz (near silent on a phone speaker)');
  else if (a.below150 > 0.4) n.push(Math.round(a.below150 * 100) + '% below 150 Hz');
  if (a.clicks.length) n.push(a.clicks.length + ' click(s) at ' + a.clicks.slice(0, 3).map(c => c.t.toFixed(3) + 's').join(', '));
  if (a.cuts.length) n.push('stops dead (over 30 dB in 5 ms) at ' + a.cuts.slice(0, 3).map(c => c.toFixed(2) + 's').join(', '));
  if (a.first > 1e-3) n.push('starts non-zero');
  if (a.last > 1e-3) n.push('still sounding at the end of the render');
  if (a.attackMs < 2 && a.dur > 0.05) n.push('hard onset (' + a.attackMs + ' ms)');
  if (Math.abs(a.dc) > 5e-3 && a.dur > 0.5) n.push('DC ' + a.dc.toExponential(1));
  return n.join('; ');
};
const pad = (s, n) => String(s).padEnd(n);
function soundTable(rows) {
  const head = pad('sound', 30) + pad('peak', 7) + pad('TP', 7) + pad('RMS', 7) + pad('Mmax', 7) + pad('phone', 7) + pad('dur', 6) + pad('centr', 7) + pad('>4k', 5) + 'notes';
  console.log('\n' + head + '\n' + '-'.repeat(head.length + 30));
  for (const r of rows) {
    const a = r.a;
    console.log(pad(r.id, 30) + pad(fx(a.peak), 7) + pad(fx(a.truePeak), 7) + pad(fx(a.rms), 7) + pad(fx(a.Mmax), 7) + pad(fx(a.phoneMmax), 7) +
      pad(a.dur.toFixed(2), 6) + pad(Math.round(a.centroid), 7) + pad(Math.round(a.above4k * 100) + '%', 5) + r.notes);
  }
  console.log('peak, TP (true peak, 4x) and RMS in dBFS; Mmax: loudest 400 ms in LUFS as played (mono on both channels); phone: the same through a 250 Hz 4th-order high-pass; dur: above -60 dB of its own peak; centr: spectral centroid in Hz; >4k: share of energy above 4 kHz.');
}
function busiest(events, durOf) {
  let maxV = 0, at = 0;
  const iv = events.filter(e => !['init', 'drone', 'weight', 'setMuted', 'scene', 'under', 'droneDuck'].includes(e.name)).map(e => [e.t, e.t + durOf(e), e]);
  for (const [s] of iv) { const n = iv.filter(([a, b]) => a <= s && b > s).length; if (n > maxV) { maxV = n; at = s; } }
  const per = {};
  for (const e of events) { if (e.name === 'init') continue; const p = per[e.name] || (per[e.name] = { n: 0, minGap: Infinity, last: -1e9 }); p.n++; p.minGap = Math.min(p.minGap, e.t - p.last); p.last = e.t; }
  return { maxV, at, near: iv.filter(([a, b]) => a <= at && b > at).map(x => key(x[2])), per };
}
// The red's heart: the beats while the drone runs (at least one every 6 s on average, rests included), and
// any two beats under 0.5 s apart (a scripted beat on top of the loop's).
function heartCheck(events) {
  let red = 0, on = null;
  for (const e of events) {
    if (e.name !== 'drone') continue;
    if (e.args[0] && on === null) on = e.t;
    else if (!e.args[0] && on !== null) { red += e.t - on; on = null; }
  }
  if (on !== null) red += events[events.length - 1].t - on;
  const beats = events.filter(e => e.name === 'heartbeat').map(e => e.t), flams = beats.filter((t, i) => i && t - beats[i - 1] < 0.5);
  const warn = red > 12 && beats.length < red / 6 ? 'too few beats for the red' : flams.length ? 'doubled beats' : '';
  return { n: beats.length, red, flams, warn };
}
function timelineReport(name, spec, run, a, events) {
  const L = a.loud, top = [];
  const M = L.M.map((v, i) => ({ v, t: i * 0.1 + 0.4 })).sort((p, q) => q.v - p.v);
  for (const m of M) { if (top.length >= 5) break; if (top.every(o => Math.abs(o.t - m.t) > 3)) top.push(m); }
  const S = L.S.filter(Number.isFinite).sort((p, q) => p - q), q = f => S[Math.floor(f * (S.length - 1))];
  let holes = [], st = -1;
  L.S.forEach((v, i) => { if (v < -45) { if (st < 0) st = i; } else { if (st >= 0 && (i - st) * 0.1 > 8) holes.push([st * 0.1, i * 0.1]); st = -1; } });
  console.log(`\n[timeline ${name}] ${spec.label}: ending ${run.ending}, ${a.dur.toFixed(1)} s, ${events.length} SFX calls`);
  console.log(`   integrated ${fx(a.I)} LUFS, loudest 400 ms ${fx(a.Mmax)} LUFS, loudest 3 s ${fx(a.Smax)} LUFS, short-term 10-95% ${fx(q(0.1))} to ${fx(q(0.95))} LUFS, true peak ${fx(a.truePeak)} dBTP, peak ${fx(a.peak)} dBFS, ${a.clipped} clipped, phone Mmax ${fx(a.phoneMmax)}`);
  const beds = t => ['drone', 'weight'].filter(b => { const l = events.filter(e => e.name === b && e.t <= t).pop(); return l && l.args[0]; });
  for (const m of top) console.log(`   loud at ${m.t.toFixed(1)} s (${fx(m.v)} LUFS): ` + events.filter(e => e.t > m.t - 0.9 && e.t <= m.t + 0.1 && e.name !== 'init').map(key).concat(beds(m.t).map(b => b + ' bed')).join(' + '));
  if (holes.length) console.log('   below -45 LUFS short-term for over 8 s: ' + holes.map(h => h[0].toFixed(0) + '-' + h[1].toFixed(0) + ' s').join(', '));
  if (a.cuts.length) console.log('   stops dead at ' + a.cuts.slice(0, 10).map(c => c.toFixed(2) + ' s (' + events.filter(e => e.t <= c && e.t > c - 8).map(key).slice(-2).join(', ') + ')').join('; '));
  if (a.clicks.length) console.log('   clicks at ' + a.clicks.slice(0, 8).map(c => c.t.toFixed(2) + ' s (' + events.filter(e => Math.abs(e.t - c.t) < 8).map(key).slice(-3).join(', ') + ')').join('; '));
  return { top, holes };
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'sounds'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'timeline'), { recursive: true });
  const tl = arg('timeline') === 'none' ? [] : (arg('timeline') ? arg('timeline').split(',') : Object.keys(RUNS));
  const runs = {};
  if (tl.length) {
    for (const n of tl) {
      if (!RUNS[n]) throw new Error('unknown timeline ' + n + ' (' + Object.keys(RUNS).join(', ') + ')');
      // A fresh game per run, as a fresh page: no state from an earlier run's ending can leak into this one.
      const g = loadGame();
      g.init(); g.setOut(new Uint32Array(g.W * g.H));
      runs[n] = recordRun(g, RUNS[n]);
    }
  }
  const b = await launch();
  const summary = { trim: TRIM, sounds: [], timelines: {} };
  try {
    await openGame(b, writePage());
    const rows = [];
    for (const job of SOUNDS.filter(j => !ONLY || ONLY.includes(j.name))) {
      // A lone sound plays LEAD seconds in: a DynamicsCompressor starts out clamped and needs about 0.25 s to
      // open, which in the game passes long before the first sound after the first tap.
      const lead = job.bare ? LEAD : 0, j = Object.assign({}, job, { len: job.len + lead, events: job.events.map(e => Object.assign({}, e, { t: e.t + lead })) });
      const rendered = await render(b, j), { x, errors } = rendered;
      const a = M.analyse(x), file = job.id.replace(/[^\w.,-]+/g, '_').replace(/_+$/, '');
      fs.writeFileSync(path.join(OUT, 'sounds', file + '.wav'), M.wav16(x));
      fs.writeFileSync(path.join(OUT, 'sounds', file + '.png'), M.spectrogram(x, job.id + '  PEAK ' + fx(a.peak) + '  MMAX ' + fx(a.Mmax) + ' LUFS'));
      const { starved } = rendered;
      let n = [notes(a)].concat(starved.map(v => 'noise runs out after ' + v.got.toFixed(2) + ' s of ' + v.want.toFixed(2) + ' s')).filter(Boolean).join('; ');
      if (job.name === 'mute') {
        const cut = job.events.find(e => e.name === 'setMuted').t;
        const after = M.db(x.subarray(Math.round((cut + 0.4) * SR)).reduce((m, v) => Math.max(m, Math.abs(v)), 0));
        const before = cut > 0.1 ? M.db(x.subarray(0, Math.round(cut * SR)).reduce((m, v) => Math.max(m, Math.abs(v)), 0)) : null;
        n = 'peak ' + (before !== null ? fx(before) + ' dBFS before the mute, ' : '') + fx(after) + ' dBFS from 0.4 s after it';
      }
      if (errors.length) n += '; page errors: ' + errors.join(' | ');
      rows.push({ id: job.id, name: job.name, where: WHERE[job.name], notes: n, a });
      summary.sounds.push({ id: job.id, where: WHERE[job.name], peak: a.peak, truePeak: a.truePeak, rms: a.rms, Mmax: a.Mmax, phoneMmax: a.phoneMmax, I: a.I, dur: a.dur,
        centroid: a.centroid, above4k: a.above4k, below150: a.below150, attackMs: a.attackMs, clipped: a.clipped, dc: a.dc, first: a.first, last: a.last, clicks: a.clicks.map(c => c.t), cuts: a.cuts, starved, notes: n });
    }
    soundTable(rows);
    const durOf = e => { const r = rows.find(o => o.id === key(e)) || rows.find(o => o.name === e.name); return r ? Math.max(0.05, r.a.dur) : 0.5; };
    for (const n of Object.keys(runs)) {
      const run = runs[n], t0Ev = run.log.find(e => e.name === 'init'), t0 = t0Ev ? Math.max(0, t0Ev.t - 0.5) : 0;
      const events = run.log.filter(e => e.t >= t0 && e.name !== 'resume').map(e => ({ t: +(e.t - t0).toFixed(4), name: e.name, args: e.args }));
      const { x, errors, starved } = await render(b, { len: run.end - t0, bare: false, events });
      const a = M.analyse(x);
      fs.writeFileSync(path.join(OUT, 'timeline', n + '.wav'), M.wav16(x));
      fs.writeFileSync(path.join(OUT, 'timeline', n + '_spectrogram.png'), M.spectrogram(x, 'TIMELINE ' + n, { width: 2400, height: 320 }));
      fs.writeFileSync(path.join(OUT, 'timeline', n + '_loudness.png'), M.loudnessPlot(a.loud, events, x.length / SR, 'TIMELINE ' + n + '  I ' + fx(a.I) + ' LUFS'));
      fs.writeFileSync(path.join(OUT, 'timeline', n + '_events.txt'), events.map(e => e.t.toFixed(2).padStart(8) + '  ' + key(e)).join('\n') + '\n');
      const rep = timelineReport(n, RUNS[n], run, a, events), bz = busiest(events, durOf);
      console.log(`   most voices at once: ${bz.maxV} at ${bz.at.toFixed(1)} s (${bz.near.join(', ')})`);
      console.log('   calls (count, shortest gap): ' + Object.entries(bz.per).sort((p, q) => q[1].n - p[1].n).map(([k, v]) => k + ' ' + v.n + (v.n > 1 ? ' / ' + v.minGap.toFixed(2) + 's' : '')).join(', '));
      const hb = heartCheck(events);
      console.log('   heartbeat: ' + hb.n + ' beats over ' + hb.red.toFixed(1) + ' s of drone' + (hb.flams.length ? ', doubled at ' + hb.flams.map(t => t.toFixed(2) + ' s').join(', ') : '') + (hb.warn ? '  WARNING: ' + hb.warn : ''));
      if (starved.length) console.log('   noise ran out early ' + starved.length + ' times: ' + starved.slice(0, 8).map(v => v.at.toFixed(1) + ' s (' + (events.filter(e => Math.abs(e.t - v.at) < 0.02).map(key).join(', ') || '?') + ', ' + v.got.toFixed(2) + ' of ' + v.want.toFixed(2) + ' s)').join('; '));
      if (errors.length) console.log('   page errors: ' + errors.join(' | '));
      summary.timelines[n] = { label: RUNS[n].label, ending: run.ending, dur: a.dur, I: a.I, Mmax: a.Mmax, Smax: a.Smax, truePeak: a.truePeak, peak: a.peak,
        clipped: a.clipped, phoneMmax: a.phoneMmax, clicks: a.clicks.map(c => c.t), cuts: a.cuts, loudest: rep.top, quiet: rep.holes, maxVoices: bz.maxV, maxVoicesAt: bz.at, calls: bz.per, starved, heartbeat: hb };
    }
  } finally { await b.close(); }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 1));
  console.log('\nwrote ' + path.relative(ROOT, OUT) + ' (sounds/*.wav|png, timeline/*.wav|png|txt, summary.json); trim ' + TRIM + (/createDynamicsCompressor|WaveShaper/.test(SRC) ? ', with dynamics in the chain' : ', no compressor or limiter after it'));
}
main().catch(e => { console.error(e); process.exit(1); });

const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });
const g = require('../src/game.js');
g.init();
const W = g.W;
const out = new Uint32Array(W * g.H);
g.setOut(out);
function write(name) {
  const H = g.H, s = 2;
  const png = new PNG({ width: W * s, height: H * s });
  for (let y = 0; y < H * s; y++) for (let x = 0; x < W * s; x++) {
    const p = out[Math.floor(y / s) * W + Math.floor(x / s)], i = (y * W * s + x) * 4;
    png.data[i] = p & 255; png.data[i + 1] = (p >>> 8) & 255; png.data[i + 2] = (p >>> 16) & 255; png.data[i + 3] = 255;
  }
  fs.writeFileSync(path.join(OUT_DIR, name), PNG.sync.write(png));
}
function play(plan, prefix, offsets, opts) {
  opts = opts || {};
  g.resetAll();
  const UI = g.UI;
  let t = 0, ci = 0, lastAct = 0, holding = false, tFinal = -1, redT = -1, cineT = -1;
  const dt = 1 / 30, shots = offsets.slice();
  while (t < 900 && g.phase !== 'end') {
    const p = g.phase;
    if (t - lastAct > 0.25) {
      if (g.G.t < g.G.thinkUntil) { g.press(); g.release(); lastAct = t; } // a waiting bubble over play is dismissed first (bible, 4b), as in the sim
      else if (p === 'title' || p === 'ready' || p === 'card') { g.press(); g.release(); lastAct = t; }
      else if (p === 'ocean') { if (!opts.wait) { g.press(); g.release(); } lastAct = t; }
      else if (p === 'bite') { g.press(); holding = true; lastAct = t; }
      else if (p === 'dialog') {
        if (UI.choices) { const c = UI.choices[plan[ci++] || 0]; if (g.WS.sunKind === 1) tFinal = t; c.cb(); } else { g.press(); g.release(); }
        lastAct = t;
      }
    }
    if (p === 'reeling' && g.G.reel) {
      if (holding && g.G.reel.T > 0.7) { g.release(); holding = false; }
      else if (!holding && g.G.reel.T < 0.3) { g.press(); holding = true; }
    }
    if (redT < 0 && g.WS.sunKind === 1) redT = t;
    if (cineT < 0 && tFinal >= 0 && p === 'cine') cineT = t; // the ending cinematic itself, after the last lines
    g.update(dt);
    t += dt;
    const kind = shots.length ? shots[0][2] : '';
    const ref = kind === 'red' ? redT : kind === 'cine' ? cineT : tFinal; // timed from the red rise, the ending cinematic's start, or the wish 3 choice
    if (shots.length && ref >= 0 && t - ref >= shots[0][0]) { g.render(t); write(prefix + shots[0][1] + '.png'); shots.shift(); }
  }
}
// Plans are choice indices in menu order (see tools/sim.js). tFinal is the wish 3 choice, made under the red sun.
play([0, 0, 0, 0, 0, 0], 'e_', [[6, 'redrise', 'red'], [3.5, 'jaw']]);
play([0, 2, 1, 1], 'e_', [[3.4, 'dark_cap'], [5, 'dark']]); // released, with a cabin: the sky fish gone, the boat still readable under the caption at 3.4 s
play([0, 2, 1, 0], 'e_', [[2.6, 'jaw_cabin']]); // Home with a cabin: the window glow slides down with the cabin
play([0, 2, 2, 2], 'e_', [[2.2, 'cutfall']]);
play([0, 2, 1, 2], 'e_', [[16, 'cutdawn', 'cine']]); // the lake boat rows away (situation 9)
play([0, 3, 3, 3], 'e_', [[2.2, 'silentfall'], [18, 'silentdawn']]);
play([0, 2, 2, 3], 'e_', [[5, 'deepmid'], [11, 'deep']]); // the descent: the horizon half way up, then the mirror filling the frame after the glint
// Phase 9: Home on the open sea (the fish wish waited out: the jaw closes with no mountains). The still-water
// dawn on a sunk run is phase 21's loop below.
play([0, 1, 0, 0], 'e_', [[3.5, 'jaw_sea']], { wait: true });
// Phase 14, Stay, timed from the cinematic's start (phase 23: the 2.4 s leap and the held impact): early and mid-leap, the impact frame (the glow spike, the eye closed),
// mid-drop with him riding the disc down, and the night boat alone with the lantern once the disc and the companion are gone.
play([0, 0, 0, 0, 0, 3], 'e_', [[2.6, 'stay_leap_early', 'cine'], [3.2, 'stay_leap', 'cine'], [4.6, 'stay_hit', 'cine'], [5.6, 'stay_fall', 'cine'], [12, 'stay_after', 'cine']]);
// Phase 17, Stay on a sunk run: he floats (no standing frame) before the leap, then leaps from the water.
play([0, 0, 0, 2, 0, 3], 'e_', [[1.5, 'stay_sunk_wait', 'cine'], [3.2, 'stay_sunk_leap', 'cine']]);
// Phase 21, the Still water pictures, timed from the cut cinematic's start: at sea with the fish heard, the new
// shore risen and the shapes leading the boat to it; at sea without them, the boat (then the swimmer) a speck
// on an endless sea; on the lake with the boat sunk, him reaching the shore, then back in the water above the gold.
play([0, 1, 1, 2], 'e_', [[9, 'cut_gather', 'cine'], [13, 'cut_newshore', 'cine']], { wait: true });
play([0, 1, 0, 2], 'e_', [[9, 'cut_pull', 'cine'], [15, 'cut_speck', 'cine']], { wait: true });
play([0, 1, 2, 2], 'e_', [[9, 'cut_swimpull', 'cine'], [15, 'cut_swimspeck', 'cine']], { wait: true });
play([0, 2, 2, 2], 'e_', [[9.5, 'cut_loop_shore', 'cine'], [13.5, 'cut_loop_back', 'cine']]);
console.log('wrote tools/out/e_*.png');

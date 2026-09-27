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
function play(plan, prefix, offsets) {
  g.resetAll();
  const UI = g.UI;
  let t = 0, ci = 0, lastAct = 0, holding = false, tFinal = -1, redT = -1;
  const dt = 1 / 30, shots = offsets.slice();
  while (t < 900 && g.phase !== 'end') {
    const p = g.phase;
    if (t - lastAct > 0.25) {
      if (p === 'title' || p === 'ready' || p === 'card') { g.press(); g.release(); lastAct = t; }
      else if (p === 'bite') { g.press(); holding = true; lastAct = t; }
      else if (p === 'dialog') {
        if (UI.choices) { const c = UI.choices[plan[ci++] || 0]; if (ci === 4) tFinal = t; c.cb(); } else { g.press(); g.release(); }
        lastAct = t;
      }
    }
    if (p === 'reeling' && g.G.reel) {
      if (holding && g.G.reel.T > 0.7) { g.release(); holding = false; }
      else if (!holding && g.G.reel.T < 0.3) { g.press(); holding = true; }
    }
    if (redT < 0 && g.WS.sunKind === 1) redT = t;
    g.update(dt);
    t += dt;
    const ref = shots.length && shots[0][2] === 'red' ? redT : tFinal;
    if (shots.length && ref >= 0 && t - ref >= shots[0][0]) { g.render(t); write(prefix + shots[0][1] + '.png'); shots.shift(); }
  }
}
play([0, 0, 0, 0], 'e_', [[6, 'redrise', 'red'], [3.5, 'jaw']]);
play([0, 1, 1, 1], 'e_', [[5, 'dark']]);
play([0, 2, 2, 2], 'e_', [[2.2, 'cutfall'], [18, 'cutdawn']]);
console.log('wrote tools/out/e_*.png');

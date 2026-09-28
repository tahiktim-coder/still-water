// Renders the sky for cloud work to tools/out/clouds_*.png (3x): day at t = 0 and 40 s, night and red,
// plus wrap-seam frames at t = 20, 60 and 133 s, then times render() 300 times.
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });
const g = require('../src/game.js');
g.init();
const W = g.W, SCALE = 3;
const out = new Uint32Array(W * g.H);
g.setOut(out);

function write(name) {
  const H = g.HY, s = SCALE; // the sky only
  const png = new PNG({ width: W * s, height: H * s });
  for (let y = 0; y < H * s; y++) for (let x = 0; x < W * s; x++) {
    const p = out[Math.floor(y / s) * W + Math.floor(x / s)], i = (y * W * s + x) * 4;
    png.data[i] = p & 255; png.data[i + 1] = (p >>> 8) & 255; png.data[i + 2] = (p >>> 16) & 255; png.data[i + 3] = 255;
  }
  fs.writeFileSync(path.join(OUT_DIR, name), PNG.sync.write(png));
}
const night = ws => { ws.mood = 1; ws.sunY = g.HY + 14; ws.sunGlow = 0.12; ws.horizGlow = 0.3; ws.starA = 1; };
const red = ws => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.ash = 1; };
function shot(name, setup, cloudT) {
  g.resetAll();
  if (setup) setup(g.WS);
  g.setCloudT(cloudT);
  g.render(3);
  write(name);
}
function all(prefix) {
  shot(prefix + 'day0.png', null, 0);
  shot(prefix + 'day40.png', null, 40);
  shot(prefix + 'night.png', night, 5);
  shot(prefix + 'red.png', red, 7);
  for (const t of [20, 60, 133]) shot(prefix + 'seam' + t + '.png', null, t);
}
all('clouds_');
const t0 = Date.now();
for (let i = 0; i < 300; i++) g.render(3 + i / 60);
console.log('render x300: ' + (Date.now() - t0) + ' ms');

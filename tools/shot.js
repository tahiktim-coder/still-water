const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });
const g = require('../src/game.js');

g.init();
const W = g.W;
function save(name, scale, H) {
  H = H || g.H;
  const out = new Uint32Array(W * H);
  g.setOut(out);
  return out;
}
function write(out, name, scale) {
  const H = g.H;
  const png = new PNG({ width: W * scale, height: H * scale });
  for (let y = 0; y < H * scale; y++) for (let x = 0; x < W * scale; x++) {
    const p = out[Math.floor(y / scale) * W + Math.floor(x / scale)];
    const i = (y * W * scale + x) * 4;
    png.data[i] = p & 255; png.data[i + 1] = (p >>> 8) & 255; png.data[i + 2] = (p >>> 16) & 255; png.data[i + 3] = 255;
  }
  fs.writeFileSync(path.join(OUT_DIR, name), PNG.sync.write(png));
}
function shot(name, setup, t) {
  g.resetAll();
  const out = save();
  if (setup) setup(g.WS, g.G, g.STORY);
  // settle a few frames so tweens/particles exist
  for (let i = 0; i < 3; i++) g.update(1 / 60);
  g.render(t || 3);
  write(out, name, 3);
}
const which = process.argv[2] || 'all';
if (which === 'all' || which === 'day') shot('out_day.png', null, 3.3);
if (which === 'all' || which === 'night') shot('out_night.png', (ws) => { ws.mood = 1; ws.sunY = g.HY + 14; ws.sunGlow = 0.12; ws.horizGlow = 0.3; ws.starA = 1; ws.lantern = 1; ws.companion = 1; ws.troubled = 0.35; }, 5);
if (which === 'all' || which === 'red') shot('out_red.png', (ws) => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.pupilDx = 4; ws.stalk = 1; ws.ash = 1; ws.lantern = 1; ws.companion = 1; ws.companionTurn = 1; ws.cabin = 1; ws.gold = 1; ws.troubled = 0.7; }, 7);
if (which === 'all' || which === 'wish') shot('out_wish.png', (ws) => { ws.companion = 1; ws.cabin = 1; ws.gold = 1; ws.boatSink = 2; ws.fishShadows = 1; g.spawnShadows(); ws.goldFish = { x: 44, y: 238, a: 1, surf: 262 }; ws.sunY = 182; ws.troubled = 0.22; }, 4);

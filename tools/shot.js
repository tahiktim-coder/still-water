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
if (which === 'all' || which === 'low') shot('out_low.png', (ws) => { ws.sunY = 172 + 16; ws.troubled = 0.22; }, 3.3); // after wish 1: the sun two steps lower
if (which === 'all' || which === 'wish') shot('out_wish.png', (ws) => { ws.companion = 1; ws.cabin = 1; ws.gold = 1; ws.boatSink = 2; ws.fishShadows = 1; g.spawnShadows(); ws.goldFish = { x: 44, y: 238, a: 1, surf: 262 }; ws.sunY = 182; ws.troubled = 0.22; }, 4);

// Phase 2 scenes. night() is the act 2 night as out_night.png sets it up.
const night = ws => { ws.mood = 1; ws.sunY = g.HY + 14; ws.sunGlow = 0.12; ws.horizGlow = 0.3; ws.starA = 1; ws.lantern = 1; ws.companion = 1; ws.troubled = 0.35; };
if (which === 'all' || which === 'open') shot('out_open.png', (ws) => { g.setPhase('ready'); ws.boatX = -60; }, 1.2); // mid row-in
if (which === 'all' || which === 'frozen') shot('out_frozen.png', (ws) => { ws.frozen = 1; g.spawnBirds(); g.BIRDS.forEach((b, k) => { b.x = 66 + k * 14; b.y = 96 + k * 3; }); }, 3.3);
if (which === 'all' || which === 'eyes') shot('out_eyes.png', (ws) => { night(ws); ws.eyes = 1; ws.lanternFlicker = 0.1; }, 5);
if (which === 'all' || which === 'clouds_night') shot('out_clouds_night.png', (ws) => { night(ws); ws.companion = 0; ws.lantern = 0; }, 20); // the cumulus at night, drifted
if (which === 'all' || which === 'clouds_red') shot('out_clouds_red.png', (ws) => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.ash = 1; ws.troubled = 0.55; }, 20); // the cumulus in the red
if (which === 'all' || which === 'title_far') shot('out_title_far.png', (ws) => { ws.farBoat = 1; }, 3.3);

// Phase 3, the ocean. The big one at rest under the speck; the sea mid-swallow; the shore returned closer.
const ocean = ws => { ws.far = 1; ws.troubled = 0.15; g.setPhase('ocean'); g.bigRise(); g.untween(g.OCEAN.big, 'y'); g.OCEAN.big.y = g.bigRestY(); };
if (which === 'all' || which === 'ocean') shot('out_ocean.png', (ws) => { ocean(ws); }, 6);
if (which === 'all' || which === 'ocean_mid') shot('out_ocean_mid.png', (ws) => { ws.far = 0.6; ws.troubled = 0.15; g.setPhase('cine'); for (let k = 0; k < 8; k++) { g.spawnOceanShadow(2 + (k % 5)); const s = g.OCEAN.shad[k]; s.x = 20 + k * 26; s.y = g.HY + 30 + ((k * 37) % 90); } }, 6);
if (which === 'all' || which === 'swallow') shot('out_swallow.png', (ws, G) => { ocean(ws); ws.swallow = 60; G.bob = { x: g.W / 2 + 16, y: g.bigRestY() - 4, fly: false }; g.setPhase('cine'); }, 6.5);
// Phase 4, Stay: mid drift toward the left shore (company excludes a cabin), the companion facing the fisherman,
// the lantern glow warmed, the line still taut to the red sun.
const redSky = ws => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.stalk = 1; ws.ash = 1; ws.lantern = 1; ws.troubled = 0.55; };
if (which === 'all' || which === 'stay') shot('out_stay.png', (ws, G) => { redSky(ws); ws.companion = 1; ws.companionTurn = 1; ws.companionFace = 1; ws.boatX = -40; ws.lanternWarm = 0.7; G.bob = { x: 101, y: g.HY + 5, taut: true }; g.setPhase('cine'); }, 7);
if (which === 'all' || which === 'shore') shot('out_shore.png', (ws) => { ws.shoreShift = 10; ws.fishShadows = 1; g.spawnShadows(); ws.troubled = 0.22; ws.sunY = 172 + 16; }, 3.3);

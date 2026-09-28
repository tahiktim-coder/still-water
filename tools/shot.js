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
if (which === 'all' || which === 'red') shot('out_red.png', (ws) => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.pupilDx = 4; ws.stalk = 1; ws.ash = 1; ws.lantern = 1; ws.companion = 1; ws.companionTurn = 1; ws.cabin = 1; ws.gold = 1; ws.boatSunk = 1; ws.troubled = 0.7; }, 7); // gold wished: the boat gone, the fisherman swimming in the red
if (which === 'all' || which === 'low') shot('out_low.png', (ws) => { ws.sunY = 172 + 16; ws.troubled = 0.22; }, 3.3); // after wish 1: the sun two steps lower
if (which === 'all' || which === 'wish') shot('out_wish.png', (ws) => { ws.companion = 1; ws.cabin = 1; ws.gold = 1; ws.boatSunk = 1; ws.fishShadows = 1; g.spawnShadows(); ws.goldFish = { x: 44, y: 238, a: 1, surf: 262 }; ws.sunY = 182; ws.troubled = 0.22; }, 4);

// Phase 2 scenes. night() is the act 2 night as out_night.png sets it up.
const night = ws => { ws.mood = 1; ws.sunY = g.HY + 14; ws.sunGlow = 0.12; ws.horizGlow = 0.3; ws.starA = 1; ws.lantern = 1; ws.companion = 1; ws.troubled = 0.35; };
if (which === 'all' || which === 'open') shot('out_open.png', (ws) => { g.setPhase('ready'); ws.boatX = -60; }, 1.2); // mid row-in
if (which === 'all' || which === 'frozen') shot('out_frozen.png', (ws) => { ws.frozen = 1; g.spawnBirds(); g.BIRDS.forEach((b, k) => { b.x = 66 + k * 14; b.y = 96 + k * 3; }); }, 3.3);
if (which === 'all' || which === 'eyes') shot('out_eyes.png', (ws) => { night(ws); ws.eyes = 1; ws.lanternFlicker = 0.1; }, 5);
if (which === 'all' || which === 'clouds_night') shot('out_clouds_night.png', (ws) => { night(ws); ws.companion = 0; ws.lantern = 0; }, 20); // the cumulus at night, drifted
if (which === 'all' || which === 'clouds_red') shot('out_clouds_red.png', (ws) => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.ash = 1; ws.troubled = 0.55; }, 20); // the cumulus in the red
if (which === 'all' || which === 'title_far') shot('out_title_far.png', (ws) => { ws.farBoat = 1; }, 3.3);

// Phase 3, the ocean. The big one at rest under the speck; the sea mid-swallow.
const ocean = ws => { ws.far = 1; ws.sea = 1; ws.troubled = 0.15; g.setPhase('ocean'); g.bigRise(); g.untween(g.OCEAN.big, 'y'); g.OCEAN.big.y = g.bigRestY(); };
if (which === 'all' || which === 'ocean') shot('out_ocean.png', (ws) => { ocean(ws); }, 6);
// Phase 10: the big one mid-crossing, deep, at the left third, the smaller shapes ahead of it not yet scattered.
if (which === 'all' || which === 'ocean_enter') shot('out_ocean_enter.png', (ws) => { ws.far = 1; ws.sea = 1; ws.troubled = 0.15; g.setPhase('cine'); for (let k = 0; k < 8; k++) { g.spawnOceanShadow(2 + (k % 5)); const s = g.OCEAN.shad[k]; s.x = 60 + k * 20; s.y = g.HY + 30 + ((k * 37) % 90); } g.bigEnter(); const b = g.OCEAN.big; g.untween(b, 'x'); g.untween(b, 'y'); g.untween(b, 'deep'); b.x = g.W / 3; b.y = g.bigRestY() + 10; b.deep = 0.8; }, 6);
// Phase 10: act 0, the float in the water with the stranger's bait, one gold pixel on the hook.
if (which === 'all' || which === 'bait') shot('out_bait.png', (ws, G) => { g.setPhase('waiting'); G.wait = { t: 0, nib: [], bite: 99 }; G.bob = { x: 70, y: 280, fly: false }; }, 3.3);
if (which === 'all' || which === 'ocean_mid') shot('out_ocean_mid.png', (ws) => { ws.far = 0.6; ws.sea = 0.6; ws.troubled = 0.15; g.setPhase('cine'); for (let k = 0; k < 8; k++) { g.spawnOceanShadow(2 + (k % 5)); const s = g.OCEAN.shad[k]; s.x = 20 + k * 26; s.y = g.HY + 30 + ((k * 37) % 90); } }, 6);
if (which === 'all' || which === 'swallow') shot('out_swallow.png', (ws, G) => { ocean(ws); ws.swallow = 60; G.bob = { x: g.W / 2 + 16, y: g.bigRestY() - 4, fly: false }; g.setPhase('cine'); }, 6.5);
// Phase 4, Stay: mid drift toward the left shore (company excludes a cabin), the companion facing the fisherman,
// the lantern glow warmed, the line still taut to the red sun.
const redSky = ws => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.stalk = 1; ws.ash = 1; ws.lantern = 1; ws.troubled = 0.55; };
if (which === 'all' || which === 'stay') shot('out_stay.png', (ws, G) => { redSky(ws); ws.companion = 1; ws.companionTurn = 1; ws.companionFace = 1; ws.boatX = -40; ws.lanternWarm = 0.7; G.bob = { x: 101, y: g.HY + 5, taut: true }; g.setPhase('cine'); }, 7);
// Phase 9, the open sea: sea 1 for the rest of a fish-wish run, the boat back at full size on an empty horizon,
// the giant shapes still passing beneath, by day (after the cost drop), at night and in the red.
const sea = ws => { ws.sea = 1; ws.fishShadows = 1; g.spawnShadows(); g.spawnSeaShoal(); g.OCEAN.shad.forEach((s, k) => { s.x = 30 + k * 40; s.y = g.HY + 24 + ((k * 53) % 110); }); };
if (which === 'all' || which === 'sea') shot('out_sea.png', (ws) => { sea(ws); ws.troubled = 0.22; ws.sunY = 172 + 16; }, 3.3);
if (which === 'all' || which === 'sea_night') shot('out_sea_night.png', (ws) => { night(ws); ws.companion = 0; sea(ws); }, 5);
if (which === 'all' || which === 'sea_red') shot('out_sea_red.png', (ws, G) => { redSky(ws); sea(ws); G.bob = { x: 101, y: g.HY + 5, taut: true }; g.setPhase('dialog'); }, 7);
// Phase 5, the kept fish: in the boat by day at full alpha; at night on the 0.45 rung; in the red with no sky
// fish, the boat fish glowing back to 1 while the line is dragged to the horizon.
if (which === 'all' || which === 'kept') shot('out_kept.png', (ws) => { ws.goldKept = 1; }, 3.3);
if (which === 'all' || which === 'kept_night') shot('out_kept_night.png', (ws) => { night(ws); ws.companion = 0; ws.goldKept = 0.45; }, 5);
if (which === 'all' || which === 'kept_red') shot('out_kept_red.png', (ws, G, S) => { redSky(ws); S.kept = true; ws.goldKept = 1; G.bob = { x: 101, y: g.HY + 5, taut: true }; g.setPhase('dialog'); }, 7);
// Phase 6, the gold sink and Deep: the boat settled to the gunwales with the lantern afloat beside it (bubbles
// still rising); then mid descent, the horizon well up the screen, the sky mirrored below, the boat hanging
// from the surface as a shape seen from beneath.
if (which === 'all' || which === 'sink') shot('out_sink.png', (ws, G) => { ws.gold = 1; ws.boatSunk = 0.45; ws.sunY = 172 + 16; ws.troubled = 0.22; ws.companion = 1; g.setPhase('cine'); for (let k = 0; k < 9; k++) g.bubble(g.boatLeft() + 6 + k * 8, g.WL + (k % 3)); }, 4);
// Phase 9, the full sink: the boat gone, the fisherman swimming with the lantern afloat beside him by day; at
// night with the companion floating at his seat and the kept fish glowing at the surface.
if (which === 'all' || which === 'swim') shot('out_swim.png', (ws) => { ws.gold = 1; ws.boatSunk = 1; ws.sunY = 172 + 16; ws.troubled = 0.22; }, 4);
if (which === 'all' || which === 'swim_night') shot('out_swim_night.png', (ws, G, S) => { night(ws); ws.gold = 1; ws.boatSunk = 1; S.kept = true; ws.goldKept = 0.45; }, 5);
if (which === 'all' || which === 'deep') shot('out_deep.png', (ws, G) => { redSky(ws); ws.lantern = 0; ws.ash = 0; ws.sunGlow = 0; ws.horizGlow = 0; ws.gold = 1; ws.boatSunk = 1; ws.companion = 1; ws.companionTurn = 1; ws.dive = 0.6; ws.dim = 3; ws.starA = 0.7; ws.troubled = 0.2; g.setPhase('cine'); }, 7);
// Phase 7, the still-water dawn with the shoal: the fish wish's shadows steer to the horizon at full weight
// and leave as they arrive (shoalOut), under the returning sun.
if (which === 'all' || which === 'cut_shoal') shot('out_cut_shoal.png', (ws) => { ws.mood = 0.6; ws.sunY = g.HY + 10; ws.sunGlow = 0.4; ws.horizGlow = 0.5; ws.starA = 0.4; ws.lantern = 1; sea(ws); ws.shoalOut = 1; g.setPhase('cine'); for (let i = 0; i < 90; i++) g.update(1 / 30); }, 8);

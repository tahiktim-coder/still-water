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

// Phase 3, the ocean. The big one at rest under the speck.
const ocean = ws => { ws.far = 1; ws.sea = 1; ws.troubled = 0.15; g.setPhase('ocean'); g.bigRise(); g.untween(g.OCEAN.big, 'y'); g.OCEAN.big.y = g.bigRestY(); };
if (which === 'all' || which === 'ocean') shot('out_ocean.png', (ws) => { ocean(ws); }, 6);
// Phase 10: the big one mid-crossing, deep, at the left third, the smaller shapes ahead of it not yet scattered.
if (which === 'all' || which === 'ocean_enter') shot('out_ocean_enter.png', (ws) => { ws.far = 1; ws.sea = 1; ws.troubled = 0.15; g.setPhase('cine'); for (let k = 0; k < 8; k++) { g.spawnOceanShadow(2 + (k % 5)); const s = g.OCEAN.shad[k]; s.a = 1; s.x = 60 + k * 20; s.y = g.HY + 30 + ((k * 37) % 90); } g.bigEnter(); const b = g.OCEAN.big; g.untween(b, 'x'); g.untween(b, 'y'); g.untween(b, 'a'); b.x = g.W / 3; b.y = g.bigRestY() + 10; b.a = 0.6; }, 6);
// Phase 10, reworked in phase 15: act 0, the float in the water with the stranger's bait on the hook, one gold
// pixel with a dark eye beside it; and the same lure in flight, mid-cast.
if (which === 'all' || which === 'bait') shot('out_bait.png', (ws, G) => { g.setPhase('waiting'); G.wait = { t: 0, nib: [], bite: 99 }; G.bob = { x: 70, y: 280, fly: false }; }, 3.3);
if (which === 'all' || which === 'bait_fly') shot('out_bait_fly.png', (ws, G) => { g.setPhase('casting'); G.cast = { t: 0.55, tx: 70, ty: 280, from: null }; }, 3.3);
if (which === 'all' || which === 'ocean_mid') shot('out_ocean_mid.png', (ws) => { ws.far = 0.6; ws.sea = 0.6; ws.troubled = 0.15; g.setPhase('cine'); for (let k = 0; k < 8; k++) { g.spawnOceanShadow(2 + (k % 5)); const s = g.OCEAN.shad[k]; s.a = 1; s.x = 20 + k * 26; s.y = g.HY + 30 + ((k * 37) % 90); } }, 6);
// Phase 22: the shoal alone after the pull-back, before the big one; the big one settled under the speck with
// the landing marker pulsing on its back; Swallowed mid whirlpool (the speck on the spiral); the eye open.
const step = secs => { for (let i = 0; i < secs * 30; i++) g.update(1 / 30); };
if (which === 'all' || which === 'ocean_shoal') shot('out_ocean_shoal.png', () => { g.playCine(g.CINE_OCEAN); step(8.5); }, 8.5);
if (which === 'all' || which === 'ocean_marker') shot('out_ocean_marker.png', (ws, G) => { ocean(ws); G.pt = 2.2; }, 6);
const swallowAt = secs => (ws, G) => { ocean(ws); G.pt = 2; G.tip = { x: g.W / 2, y: g.WL - 2 }; g.oceanCast(); step(secs); };
if (which === 'all' || which === 'swallow_spin') shot('out_swallow_spin.png', swallowAt(3.3), 9);
if (which === 'all' || which === 'swallow_eye') shot('out_swallow_eye.png', swallowAt(7.4), 12);
// Phase 14, Stay: the companion standing at his seat under the red sun, the eye snapped toward him, the line
// still taut, before the leap.
const redSky = ws => { ws.mood = 2; ws.sunKind = 1; ws.sunR = 16; ws.sunY = 178; ws.sunGlow = 1.25; ws.horizGlow = 1.3; ws.pupil = 1; ws.stalk = 1; ws.ash = 1; ws.lantern = 1; ws.troubled = 0.55; };
if (which === 'all' || which === 'stay') shot('out_stay.png', (ws, G) => { redSky(ws); ws.companion = 1; ws.companionTurn = 1; ws.companionStand = 1; ws.pupilDx = 7; G.bob = { x: 101, y: g.HY + 5, taut: true }; g.setPhase('cine'); }, 7);
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
// Phase 13, the catch cards: every species in every act at 6x on the card panel's colour, acts 0 and 1
// under the day palette and act 2 under the night one (the card takes the live palette). out_cards.png is
// the sheet, one row per species and one column per act; fish_<id>_<act>.png is each sprite alone.
const CARD_BG = [16, 30, 56], FISH_SC = 6, CELL_W = 34, CELL_H = 20;
function fishPng(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { png.data[i * 4] = CARD_BG[0]; png.data[i * 4 + 1] = CARD_BG[1]; png.data[i * 4 + 2] = CARD_BG[2]; png.data[i * 4 + 3] = 255; }
  return png;
}
function blitFish(png, s, x0, y0) {
  for (let y = 0; y < s.h * FISH_SC; y++) for (let x = 0; x < s.w * FISH_SC; x++) {
    const v = s.data[Math.floor(y / FISH_SC) * s.w + Math.floor(x / FISH_SC)];
    if (v === 255) continue;
    const p = g.PAL[v], i = ((y0 + y) * png.width + x0 + x) * 4;
    png.data[i] = p & 255; png.data[i + 1] = (p >>> 8) & 255; png.data[i + 2] = (p >>> 16) & 255;
  }
}
function fishSheet() {
  const sheet = fishPng(CELL_W * FISH_SC * 3, CELL_H * FISH_SC * g.SPECIES.length);
  g.SPECIES.forEach((sp, row) => {
    for (let a = 0; a < 3; a++) {
      g.buildPalette(a === 2 ? 1 : 0, 0);
      const s = g.makeFish(g.fishOpts(sp, a, 5));
      const one = fishPng((s.w + 2) * FISH_SC, (s.h + 2) * FISH_SC);
      blitFish(one, s, FISH_SC, FISH_SC);
      fs.writeFileSync(path.join(OUT_DIR, 'fish_' + sp.id + '_' + a + '.png'), PNG.sync.write(one));
      blitFish(sheet, s, (a * CELL_W + 2) * FISH_SC, (row * CELL_H + Math.floor((CELL_H - s.h) / 2)) * FISH_SC);
    }
  });
  fs.writeFileSync(path.join(OUT_DIR, 'out_cards.png'), PNG.sync.write(sheet));
}
if (which === 'all' || which === 'cards') fishSheet();
// Phase 19: the review panel's visual calls. The golden fish surfacing at the left with its reflection at
// about 40%; the sunset mid-drop (the disc reads solid); the tension bar mid-reel with the red zone; Home's
// jaws half closed (the pixel teeth); the night
// silhouettes with the lantern-side rim; the Deep descent with the gold glints below.
if (which === 'all' || which === 'gold_enter') shot('out_gold_enter.png', (ws) => { ws.goldFish = { x: 26, y: 240, a: 1, surf: 263 }; }, 3.3);
if (which === 'all' || which === 'sunset') shot('out_sunset.png', (ws) => { ws.sunY = 220; ws.mood = 0.43; ws.sunGlow = 0.93; ws.horizGlow = 0.95; ws.troubled = 0.28; }, 4);
if (which === 'all' || which === 'sunset_low') shot('out_sunset_low.png', (ws) => { ws.sunY = 233; ws.mood = 0.7; ws.sunGlow = 0.5; ws.horizGlow = 0.7; ws.troubled = 0.32; ws.starA = 0.3; }, 4);
if (which === 'all' || which === 'tension') shot('out_tension.png', (ws, G) => { g.setPhase('reeling'); G.bob = { x: 70, y: 280, fly: false }; G.reel = { p: 0.45, T: 0.62, d: 1, surge: 0, sAge: 0, next: 9, x0: 70, y0: 280, golden: false, spec: null, tick: 0 }; G.holding = true; }, 3.3);
if (which === 'all' || which === 'tension_hi') shot('out_tension_hi.png', (ws, G) => { g.setPhase('reeling'); G.bob = { x: 70, y: 280, fly: false }; G.reel = { p: 0.7, T: 0.9, d: 1, surge: 0, sAge: 0, next: 9, x0: 70, y0: 280, golden: false, spec: null, tick: 0 }; G.holding = true; }, 3.3);
if (which === 'all' || which === 'jaws') shot('out_jaws.png', (ws) => { redSky(ws); ws.companion = 1; ws.companionTurn = 1; ws.jaw = 0.55; g.setPhase('cine'); }, 7);
if (which === 'all' || which === 'night_rim') shot('out_night_rim.png', (ws) => { night(ws); ws.companion = 1; }, 5);
if (which === 'all' || which === 'deep_glint') shot('out_deep_glint.png', (ws, G) => { redSky(ws); ws.lantern = 0; ws.ash = 0; ws.sunGlow = 0; ws.horizGlow = 0; ws.gold = 1; ws.boatSunk = 1; ws.dive = 0.95; ws.dim = 5; ws.starA = 0.9; ws.troubled = 0.15; g.setPhase('cine'); }, 9);

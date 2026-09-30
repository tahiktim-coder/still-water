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

// Phase 23, the knocking: act 1 on the home path with the cabin window lit, then blinked dark on a knock;
// and the act 2 night on a knock (the window's glow off for that beat).
const low = ws => { ws.cabin = 1; ws.sunY = 188; ws.troubled = 0.22; };
if (which === 'all' || which === 'knock') shot('out_knock.png', (ws) => { low(ws); ws.cabinKnock = 1; }, 3.3);
if (which === 'all' || which === 'knock_night') shot('out_knock_night.png', (ws) => { ws.cabin = 1; ws.mood = 1; ws.sunY = g.HY + 14; ws.sunGlow = 0.12; ws.horizGlow = 0.3; ws.starA = 1; ws.lantern = 1; ws.troubled = 0.35; ws.cabinKnock = 1; }, 5);
if (which === 'all' || which === 'knock_night_lit') shot('out_knock_night_lit.png', (ws) => { ws.cabin = 1; ws.mood = 1; ws.sunY = g.HY + 14; ws.sunGlow = 0.12; ws.horizGlow = 0.3; ws.starA = 1; ws.lantern = 1; ws.troubled = 0.35; }, 5);

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
// the landing marker pulsing on its back.
const step = secs => { for (let i = 0; i < secs * 30; i++) g.update(1 / 30); };
if (which === 'all' || which === 'ocean_shoal') shot('out_ocean_shoal.png', () => { g.playCine(g.CINE_OCEAN); step(8.5); }, 8.5);
if (which === 'all' || which === 'ocean_marker') shot('out_ocean_marker.png', (ws, G) => { ocean(ws); G.pt = 2.2; }, 6);
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
// Phase 24, the zoom the player can follow: eight frames across the pull-back (far 0 to 1, the mountains
// sinking in step), tiled four across into one contact sheet, each settled 1.6 s so a tracking ring is out;
// the same for the swimmer (a sunk run at sea).
const ZOOM_FARS = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86, 1], STRIP_COLS = 4, STRIP_SC2 = 2;
// A contact sheet: one frame per entry, set up by frame(entry) after a reset, tiled four across at 2x.
function strip(name, entries, frame, overlay, sc) {
  const STRIP_SC = sc || STRIP_SC2, H = g.H, rows = Math.ceil(entries.length / STRIP_COLS);
  const png = new PNG({ width: W * STRIP_SC * STRIP_COLS, height: H * STRIP_SC * rows });
  entries.forEach((e, k) => {
    g.resetAll();
    const out = save();
    g.render(frame(e));
    if (overlay) overlay(out, e, k);
    const ox = (k % STRIP_COLS) * W * STRIP_SC, oy = Math.floor(k / STRIP_COLS) * H * STRIP_SC;
    for (let y = 0; y < H * STRIP_SC; y++) for (let x = 0; x < W * STRIP_SC; x++) {
      const p = out[Math.floor(y / STRIP_SC) * W + Math.floor(x / STRIP_SC)], i = ((oy + y) * png.width + ox + x) * 4;
      png.data[i] = p & 255; png.data[i + 1] = (p >>> 8) & 255; png.data[i + 2] = (p >>> 16) & 255; png.data[i + 3] = 255;
    }
  });
  fs.writeFileSync(path.join(OUT_DIR, name), PNG.sync.write(png));
}
function zoomFrame(swim) {
  return f => {
    const ws = g.WS;
    ws.sea = f; ws.troubled = 0.15; g.setPhase('cine');
    if (swim) { ws.gold = 1; ws.boatSunk = 1; }
    ws.far = f;
    for (let i = 0; i < 96; i++) g.update(1 / 60); // 1.6 s: the first ring is out and spreading
    ws.far = f;
    return 6;
  };
}
if (which === 'all' || which === 'zoom_strip') strip('out_zoom_strip.png', ZOOM_FARS, zoomFrame(false));
if (which === 'all' || which === 'zoom_swim_strip') strip('out_zoom_swim_strip.png', ZOOM_FARS, zoomFrame(true));
// Phase 26: the clouds pull back with the camera: the same eight frames at a fixed cloud time, the clouds
// shrinking toward the horizon under the sun and more of them filling the sky that opens above.
function cloudZoomFrame(f) { const t = zoomFrame(false)(f); g.setCloudT(40); return t; }
if (which === 'all' || which === 'zoom_clouds_strip') strip('out_zoom_clouds_strip.png', ZOOM_FARS, cloudZoomFrame);
// Phase 25, Swallowed as one lunge: eight frames from the cast into the big one (seconds into the cinematic):
// the head rising round the speck, the mouth open with the speck on its lip, the speck and the sheet tipping
// in, the mouth closing, the head sinking, the splash, the shadow swimming away, the empty sea.
const LUNGE_TS = [1.9, 2.85, 3.5, 4.15, 5.35, 5.95, 8.1, 10.2];
function lungeFrame(secs) {
  ocean(g.WS); g.G.pt = 2; g.G.tip = { x: g.W / 2, y: g.WL - 2 };
  g.oceanCast();
  for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
  return 6 + secs;
}
if (which === 'all' || which === 'lunge_strip') strip('out_lunge_strip.png', LUNGE_TS, lungeFrame);
// Phase 32, the shadow and the head as one fish: settled with its snout under the speck, darkening and drawn
// in to the breach point as it comes up, gone as the head clears, no shadow while the head is up, re-forming
// from the rings as it sinks, grown back, and swimming off right the way it came.
const SHADOW_TS = [0.9, 1.4, 1.75, 2.0, 3.2, 5.7, 6.4, 8.7];
if (which === 'all' || which === 'lunge_shadow_strip') strip('out_lunge_shadow_strip.png', SHADOW_TS, lungeFrame);
// Phase 27, the lunge head as a fish: crops round the horizon at 4x across the rise (closed, opening, open with
// the speck on the lip, the speck sliding in, closing, sinking), so the head reads up close.
const HEAD_TS = [1.75, 1.9, 2.2, 2.85, 3.5, 4.2, 4.6, 5.1], CROP = { x: 20, y: 170, w: 176, h: 100, sc: 4 };
function cropStrip(name, entries, frame) {
  const cols = 2, rows = Math.ceil(entries.length / cols), cw = CROP.w * CROP.sc, chh = CROP.h * CROP.sc;
  const png = new PNG({ width: cw * cols, height: chh * rows });
  entries.forEach((e, k) => {
    g.resetAll();
    const out = save();
    g.render(frame(e));
    const ox = (k % cols) * cw, oy = Math.floor(k / cols) * chh;
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const p = out[(CROP.y + Math.floor(y / CROP.sc)) * W + CROP.x + Math.floor(x / CROP.sc)], i = ((oy + y) * png.width + ox + x) * 4;
      png.data[i] = p & 255; png.data[i + 1] = (p >>> 8) & 255; png.data[i + 2] = (p >>> 16) & 255; png.data[i + 3] = 255;
    }
  });
  fs.writeFileSync(path.join(OUT_DIR, name), PNG.sync.write(png));
}
if (which === 'all' || which === 'lunge_head') cropStrip('out_lunge_head.png', HEAD_TS, lungeFrame);
// Phase 29, Stay as a fight you can see: eight beats timed from the cinematic's start: the crouch with his
// one-word bubble (its DOM box marked by a dashed outline at THINK_AT.companionRed), the launch from the
// rocking boat, mid-flight, the eye widening as he arrives, clinging to the rim, the line snapping, the fall
// and the splash with steam, the night after.
const STAY_TS = [1.5, 1.95, 2.9, 3.95, 4.5, 5.0, 6.1, 12];
function stayFrame(secs) {
  const ws = g.WS;
  redSky(ws); ws.companion = 1; ws.companionTurn = 1; g.G.bob = { x: 101, y: g.HY + 5, taut: true };
  g.playCine(g.CINE_STAY);
  for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
  return 7 + secs;
}
const BUBBLE_H = 20; // about one line of bubble text at phone size, in internal pixels
function markBubble(out, secs) {
  if (!g.UI.log.some(l => l[0] === 'think') || secs >= 1.8) return;
  const a = g.THINK_AT.companionRed, x0 = a.left, x1 = Math.round(a.left + W * 0.4), y1 = a.y, y0 = y1 - BUBBLE_H;
  const dot = (x, y) => { if ((x + y) & 2) out[y * W + x] = 0xffffffff; };
  for (let x = x0; x <= x1; x++) { dot(x, y0); dot(x, y1); }
  for (let y = y0; y <= y1; y++) { dot(x0, y); dot(x1, y); }
}
if (which === 'all' || which === 'stay_strip') strip('out_stay_strip.png', STAY_TS, stayFrame, markBubble);
// Phase 30, Inside: eight beats timed from the cinematic's start on the house path in the red: the drift and
// the push-in, the walk up the shore, the door opening, the other stepping out, the door closing, the other
// rowing out, the cast, the empty shore. The sunk variant: the swim ashore, the walk, the door, the pass, the
// other walking down and into the water toward the gold, going under, the empty shore.
const INSIDE_TS = [3, 6.8, 8.6, 9.6, 10.55, 12.6, 13.45, 16];
const INSIDE_SUNK_TS = [3, 6.8, 8.6, 9.6, 10.55, 11.8, 12.9, 16];
function insideFrame(sunk) {
  return secs => {
    const ws = g.WS;
    redSky(ws); ws.cabin = 1; ws.companion = 0; g.G.bob = { x: 101, y: g.HY + 5, taut: true };
    if (sunk) { ws.gold = 1; ws.boatSunk = 1; }
    g.playCine(g.CINE_INSIDE);
    for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
    return 7 + secs;
  };
}
if (which === 'all' || which === 'inside_strip') strip('out_inside_strip.png', INSIDE_TS, insideFrame(false));
if (which === 'all' || which === 'inside_sunk_strip') strip('out_inside_sunk_strip.png', INSIDE_SUNK_TS, insideFrame(true));
// Phase 31: the Inside close shot at phone size (1x, eight beats each), to judge that the boat, the cabin
// with its door and the two people read without magnification.
if (which === 'all' || which === 'inside_1x') strip('out_inside_1x.png', INSIDE_TS, insideFrame(false), null, 1);
if (which === 'all' || which === 'inside_sunk_1x') strip('out_inside_sunk_1x.png', INSIDE_SUNK_TS, insideFrame(true), null, 1);

/* Still Water: a small fishing tale */
(function () {
'use strict';
const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

// ---------------------------------------------------------------- constants
const W = 216, HY = 236, H_MIN = 384, H_MAX = 470;
let H = H_MIN;
const SUNX = 104, SUN0Y = 172;
const WL = HY + 6;            // boat waterline
const BOAT_X = 118;
const ROD_LEN = 28;
const REST_A = -2.25, BACK_A = -1.05, FWD_A = -2.85, AIM_A = -2.55;
const JAW_MAX = 92;

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: t => t,
  io: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  out2: t => 1 - (1 - t) * (1 - t), // a gentler ease-out, for the big one's long glide
  in: t => t * t * t,
};
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct) {
  let f = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x, y, s + i * 131); tot += amp; x *= 2.02; y *= 2.02; amp *= 0.5; }
  return f / tot;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
// continuous ramp value -> integer index, with clean bands and ordered dither only at transitions
function dith(f, x, y) {
  const fl = Math.floor(f);
  let fr = f - fl;
  fr = fr < 0.28 ? 0 : fr > 0.72 ? 1 : (fr - 0.28) / 0.44;
  return fl + (fr > BAYER[((y & 3) << 2) | (x & 3)] ? 1 : 0);
}
const ci = v => (v < 0 ? 0 : v > 11 ? 11 : v);

// ---------------------------------------------------------------- palettes
// Ramp indices 0..11 recolour with the mood. Accents 12..21 are special colours.
const hexc = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const RAMP = {
  day: ['#0a1a33', '#0e2444', '#13305a', '#1a3f72', '#214f89', '#2a609e', '#3673b1', '#4687c2', '#5e9ed3', '#7fb6e1', '#a9d2ee', '#eaf7ff'].map(hexc),
  night: ['#02030a', '#060a1a', '#0b1128', '#111938', '#172248', '#1e2b58', '#263568', '#314177', '#3e4f86', '#506096', '#6878a8', '#8e9cc4'].map(hexc),
  blood: ['#060103', '#130207', '#24040c', '#380710', '#520b14', '#6e0f17', '#8c1519', '#aa1d1b', '#c62b1f', '#de4426', '#f06838', '#ff9e5e'].map(hexc),
};
// 12 bobber, 13-16 gold ramp, 17 lantern, 18 fish eye, 19 black, 20 star, 21 red eyes, 22-23 bone, 24 eye glint
const ACC = {
  day: ['#e2483a', '#5c3a08', '#a86f12', '#e2aa2a', '#ffe27c', '#ffd27a', '#1a0c02', '#000000', '#ffffff', '#ff3322', '#eee4d2', '#a89a86', '#7d1a12', '#27451f'].map(hexc),
  night: ['#e0503f', '#3e2a0a', '#7c5614', '#c2902c', '#f2d47c', '#ffc766', '#1a0c02', '#000000', '#e8eeff', '#ff3322', '#c9c6d2', '#7c7a8c', '#7d1a12', '#18291c'].map(hexc),
  blood: ['#ffe4cc', '#1e0203', '#5e0808', '#a8140e', '#ff4a22', '#ff3b1f', '#ff2a14', '#000000', '#ffc6a8', '#ff3322', '#f4c9ab', '#a8584a', '#7d1a12', '#2a1a0c'].map(hexc),
};
// 25 is the new shore's dark green (phase 21), the only green in the game.
const SHORE_GREEN = 25;
const PAL = new Uint32Array(32);
const PALRGB = new Float32Array(32 * 3);
function setPal(i, r, g, b) {
  r = clamp(r | 0, 0, 255); g = clamp(g | 0, 0, 255); b = clamp(b | 0, 0, 255);
  PAL[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  PALRGB[i * 3] = r; PALRGB[i * 3 + 1] = g; PALRGB[i * 3 + 2] = b;
}
const _ramp = [];
for (let i = 0; i < 12; i++) _ramp.push([0, 0, 0]);
function buildPalette(mood, dim) {
  let A, B, t;
  if (mood <= 1) { A = 'day'; B = 'night'; t = clamp(mood, 0, 1); } else { A = 'night'; B = 'blood'; t = clamp(mood - 1, 0, 1); }
  const ra = RAMP[A], rb = RAMP[B], aa = ACC[A], ab = ACC[B];
  for (let i = 0; i < 12; i++) {
    const c = _ramp[i];
    c[0] = lerp(ra[i][0], rb[i][0], t); c[1] = lerp(ra[i][1], rb[i][1], t); c[2] = lerp(ra[i][2], rb[i][2], t);
  }
  for (let i = 0; i < 12; i++) {
    const f = i - dim;
    if (f >= 0) {
      const fl = Math.floor(f), fr = f - fl;
      const c0 = _ramp[fl], c1 = _ramp[Math.min(11, fl + 1)];
      setPal(i, lerp(c0[0], c1[0], fr), lerp(c0[1], c1[1], fr), lerp(c0[2], c1[2], fr));
    } else {
      const k = Math.max(0, 1 + f / 2.5), c = _ramp[0];
      setPal(i, c[0] * k, c[1] * k, c[2] * k);
    }
  }
  for (let j = 0; j < aa.length; j++) setPal(12 + j, lerp(aa[j][0], ab[j][0], t), lerp(aa[j][1], ab[j][1], t), lerp(aa[j][2], ab[j][2], t));
}

// ---------------------------------------------------------------- buffers
const TOP = new Uint8Array(W * HY);          // above-horizon frame (sky, sun, clouds, mountains)
const MOUNT = new Uint8Array(W * HY).fill(255);
// Two cloud layers drift at different speeds, each a strip CW wide that wraps seamlessly: the big
// cumulus (near, faster) and the small wisps high up and by the horizon (far, slower). idx holds the
// shaded indices. vis holds, per cloud pixel, the least sun-corridor factor (0..255) at which it still
// shows, so the corridor that keeps the sun's path clear (KCOR, fixed to the screen) is cut at sample
// time and stays put while the clouds move through it.
const CW = W * 2;
const CLOUDS = [
  { speed: 3, ph: 0, off: 0, oy: 0, idx: new Uint8Array(CW * HY).fill(255), vis: new Uint8Array(CW * HY) },
  { speed: 1.1, ph: Math.PI, off: 0, oy: 0, idx: new Uint8Array(CW * HY).fill(255), vis: new Uint8Array(CW * HY) },
];
// Cumulus: layer, cx, base y, width, height, bumps, rmin, rmax. Each is a union of circles: a row along
// the flat base with the largest in the middle and a lifted second row on top (the cauliflower). The
// first half of the strip is the sky on screen at t = 0; the rest fills the hidden half.
const CUMULUS = [
  [0, 36, 94, 118, 46, 9, 9, 14],
  [0, 178, 54, 90, 38, 8, 8, 13],
  [0, 48, 168, 100, 26, 9, 7, 11],
  [0, 150, 140, 62, 30, 6, 7, 11],
  [0, 294, 76, 120, 46, 9, 9, 14],
  [0, 368, 152, 92, 30, 8, 7, 12],
  [0, 412, 98, 60, 30, 6, 7, 11],
  [1, 64, 213, 50, 10, 5, 4, 6],
  [1, 332, 207, 56, 10, 5, 4, 6],
];
const KCOR = new Uint8Array(W * HY);        // the sun corridor: 255 outside, 0 where the sky is kept clear
let cloudT = 0;                              // cloud time; it stops while the day is frozen
let FRAME, SPR, IDX, RIPX, OUT32 = null;
function alloc() {
  FRAME = new Uint8Array(W * H);
  SPR = new Uint8Array(W * H);
  IDX = new Uint8Array(W * H);
  RIPX = new Int8Array(H);
}

// ---------------------------------------------------------------- world generation
// Noise made periodic in x over the strip: the last CLOUD_SEAM columns blend toward column 0.
const CLOUD_SEAM = 24;
function tiled(fn, x, y) {
  const s = x - (CW - CLOUD_SEAM);
  return s <= 0 ? fn(x, y) : lerp(fn(x, y), fn(x - CW, y), E.io(s / CLOUD_SEAM));
}
const wrapX = x => ((x % CW) + CW) % CW;
function genClouds() {
  for (let y = 0; y < HY; y++) for (let x = 0; x < W; x++) {
    const sdx = x - SUNX, sdy = y < SUN0Y ? SUN0Y - y : 0;
    KCOR[y * W + x] = Math.round(clamp((Math.sqrt(sdx * sdx + sdy * sdy) - 21) / 10, 0, 1) * 255);
  }
  const rng = mulberry32(1337);
  const clouds = CUMULUS.map(c => makeCumulus(c, rng));
  CLOUDS.forEach((L, k) => { L.idx.fill(255); L.vis.fill(0); genCloudLayer(L, clouds.filter(c => c.layer === k)); L.band = cloudBand(L); });
  cloudView();
}
// One cumulus as circles: a base row whose bottoms sit just under the flat base, and a lifted top row.
function makeCumulus([layer, cx, base, w, h, n, r0, r1], rng) {
  const circles = [], half = w * 0.5 - r0;
  const bump = (u, k) => lerp(r0, r1, (1 - Math.pow(Math.abs(u), 1.5)) * (0.75 + 0.25 * rng())) * k;
  for (let k = 0; k < n; k++) {
    const u = (n > 1 ? (k / (n - 1)) * 2 - 1 : 0) + (rng() - 0.5) * 0.25, r = bump(u, 1);
    circles.push({ x: cx + u * half, y: base - r + 2, r });
  }
  const m = Math.max(2, Math.ceil(n / 2));
  for (let k = 0; k < m; k++) {
    const u = ((k / (m - 1)) * 2 - 1) * 0.6 + (rng() - 0.5) * 0.2, r = bump(u, 0.9);
    const mid = 1 - Math.abs(u);
    circles.push({ x: cx + u * half, y: base - r - Math.max(0, h - 2 * r) * (0.55 + 0.45 * mid), r });
  }
  return { layer, cx, base, top: base - h, w, h, r1, circles };
}
// Signed distance to the silhouette (negative inside), the owning cloud's base and top per pixel.
function cloudField(clouds) {
  const sd = new Float32Array(CW * HY).fill(99), cb = new Float32Array(CW * HY), ct = new Float32Array(CW * HY);
  for (const c of clouds) {
    const x0 = Math.floor(c.cx - c.w * 0.5 - c.r1), x1 = Math.ceil(c.cx + c.w * 0.5 + c.r1);
    const y0 = Math.max(0, Math.floor(c.top - c.r1 - 4)), y1 = Math.min(HY - 1, c.base + 4);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let d = 99;
      for (const k of c.circles) { const dd = Math.hypot(x - k.x, y - k.y) - k.r; if (dd < d) d = dd; }
      d = Math.max(d, y - c.base);
      const i = y * CW + wrapX(x);
      if (d < sd[i]) { sd[i] = d; cb[i] = c.base; ct[i] = c.top; }
    }
  }
  const n1 = (x, y) => fbm(x * 0.07, y * 0.1, 11, 3), n2 = (x, y) => fbm(x * 0.25, y * 0.25, 23, 2);
  for (let y = 0; y < HY; y++) for (let x = 0; x < CW; x++) { // the tiled noise roughens the arcs
    const i = y * CW + x;
    if (sd[i] < 50) sd[i] += (tiled(n1, x, y) - 0.5) * 4 + (tiled(n2, x, y) - 0.5) * 2;
  }
  return { sd, cb, ct };
}
function genCloudLayer(L, clouds) {
  const { sd, cb, ct } = cloudField(clouds);
  const at = (x, y) => sd[clamp(y, 0, HY - 1) * CW + wrapX(x)];
  for (let y = 0; y < HY; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x, d = sd[i];
    if (d >= 0) continue;
    const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1), gl = Math.hypot(gx, gy) || 1;
    const sx = Math.sign(SUNX + CW * Math.round((x - SUNX) / CW) - x); // toward the nearest copy of the sun
    const lit = (gx * sx * 0.37 - gy * 0.93) / gl;                     // the outward normal against the light
    const f = shadeCloud(-d, lit, y, cb[i], ct[i]);
    L.idx[i] = ci(dith(f, x, y));
    L.vis[i] = Math.min(254, Math.round(255 * 3 / (3 - d)));
  }
}
// depth is the distance inside the silhouette, lit the contour's facing toward the light (1 straight
// at it); vy is 0 at the base and 1 at the top; low pales the clouds near the horizon. A thick bright
// band along the lit upper contour, a softer band under it, a mid body and a flat dark base.
function shadeCloud(depth, lit, y, base, top) {
  const vy = clamp((base - y) / Math.max(1, base - top), 0, 1), low = 0.5 * y / HY;
  const hw = 2 + 2.5 * lit;
  if (lit > 0.1 && depth < hw) return 11;
  if (y > base - 3) return 7 + low;
  if (lit < -0.3 && depth < 2.5) return 7.5 + low;
  if (lit > 0 && depth < hw + 2.5) return 10.2;
  return 8.4 + 1.1 * vy + low;
}
// Per-layer offsets for this frame: the drift, and a slow breathing of a pixel or two.
function cloudTick() {
  for (const L of CLOUDS) {
    L.off = Math.floor(cloudT * L.speed) % CW;
    L.oy = Math.round(Math.sin(cloudT * 0.06 + L.ph) * 1.4);
  }
  cloudView();
}
// Phase 26, the clouds pull back with the camera: while WS.far > 0 the layers are sampled at coordinates
// scaled by 1 / s about the horizon under the sun (s = lerp(1, CLOUD_FAR_S, far), the eased far that shrinks
// the boat), so every cloud shrinks toward the horizon. The sky the pull-back opens above the strip (y' < 0)
// samples the strip again, tiled upward with the period L.band (the rows down to just under the layer's
// lowest cloud, whose top rows are empty sky, so tiles never touch) and CLOUD_TILE_DX more drift per tile
// so repeats never line up. The far wisps do not tile (CLOUD_TILES 0), so the horizon stays hazy. The drift
// and breathing go on in scaled space; KCOR stays fixed to the screen. Per frame: a source column per screen
// column (L.xs, drift folded in) and a source row base and tile shift per screen row (L.rb, -1 for none, L.rd).
const CLOUD_FAR_S = 0.5, CLOUD_TILE_DX = [157, 311], CLOUD_TILES = [9, 0], CLOUD_BAND_GAP = 3;
for (const L of CLOUDS) { L.band = HY; L.xs = new Int32Array(W); L.rb = new Int32Array(HY); L.rd = new Int32Array(HY); }
function cloudView() {
  const is = 1 / lerp(1, CLOUD_FAR_S, clamp(WS.far, 0, 1));
  for (let k = 0; k < CLOUDS.length; k++) {
    const L = CLOUDS[k];
    for (let x = 0; x < W; x++) L.xs[x] = wrapX(Math.round(SUNX + (x - SUNX) * is) + L.off);
    for (let y = 0; y < HY; y++) cloudRow(L, k, y, Math.round(HY - (HY - y) * is) + L.oy);
  }
}
function cloudRow(L, k, y, sy) {
  if (sy >= 0) { L.rb[y] = Math.min(sy, HY - 1) * CW; L.rd[y] = 0; return; }
  const t = -sy - 1, n = Math.floor(t / L.band) + 1;
  if (n > CLOUD_TILES[k]) { L.rb[y] = -1; return; }
  L.rb[y] = (L.band - 1 - (t % L.band)) * CW; L.rd[y] = (n * CLOUD_TILE_DX[k]) % CW;
}
// The period a layer tiles with: every row down to just under its lowest cloud pixel.
function cloudBand(L) {
  let low = 0;
  for (let i = 0; i < L.idx.length; i++) if (L.idx[i] !== 255) low = Math.floor(i / CW);
  return Math.min(HY, low + 1 + CLOUD_BAND_GAP);
}
function cloudAt(L, x, y) {
  const rb = L.rb[y];
  if (rb < 0) return -1;
  let bx = L.xs[x] + L.rd[y]; if (bx >= CW) bx -= CW;
  return rb + bx;
}
function cloudIdx(x, y) {
  for (let k = 0; k < CLOUDS.length; k++) {
    const cp = cloudAt(CLOUDS[k], x, y);
    if (cp >= 0 && CLOUDS[k].idx[cp] !== 255) return CLOUDS[k].idx[cp];
  }
  return 255;
}


function genRidge(pts, rough, seed) {
  const rng = mulberry32(seed);
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  const ys = new Float32Array(x1 - x0 + 1);
  function sub(a, l, r) {
    if (r - l < 2) return;
    const m = (l + r) >> 1;
    a[m] = lerp(a[l], a[r], (m - l) / (r - l)) + (rng() - 0.5) * (r - l) * rough;
    sub(a, l, m); sub(a, m, r);
  }
  for (let k = 0; k < pts.length - 1; k++) {
    const ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1];
    const n = bx - ax;
    if (n <= 0) continue;
    const seg = new Float32Array(n + 1);
    seg[0] = ay; seg[n] = by;
    sub(seg, 0, n);
    for (let i = 0; i <= n; i++) ys[ax - x0 + i] = seg[i];
  }
  return { x0, ys };
}
const MCFG = {
  far: { base: 5.0, ang: 2.0, streak: 6, snow: 0.8, rim: 1.5, hazeH: 18, hazeAmt: 2.2, litSign: 0, seed: 31, fu: 0.1, fv: 0.35 },
  left: { base: 0.6, ang: 1.05, streak: 16, snow: 2.0, rim: 3.0, hazeH: 64, hazeAmt: 5.2, litSign: 1, seed: 41, fu: 0.07, fv: 0.32 },
  right: { base: 0.8, ang: 1.95, streak: 16, snow: 2.0, rim: 3.4, hazeH: 76, hazeAmt: 5.6, litSign: -1, seed: 51, fu: 0.07, fv: 0.32 },
  fore: { base: 0.1, ang: 1.1, streak: 6, snow: 0.8, rim: 1.2, hazeH: 16, hazeAmt: 1.2, litSign: 1, seed: 61, fu: 0.08, fv: 0.3 },
};
function shadeM(x, y, depth, slope, c) {
  let f = c.base;
  const face = c.litSign === 0 ? 0.3 : clamp(c.litSign * slope * 0.9, -1, 1);
  const lit = 0.5 + 0.5 * face;
  const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
  const u = x * ca + y * sa, v = -x * sa + y * ca;
  const n1 = fbm(u * c.fu, v * c.fv, c.seed, 4);        // gully streaks along the slope
  const n2 = fbm(x * 0.1, y * 0.12, c.seed + 50, 3);    // snow patches
  const n3 = fbm(x * 0.3, y * 0.3, c.seed + 90, 2);     // grain
  const sk = c.streak / 16;
  if (n1 > 0.6) f += (1.2 + 2.6 * lit) * sk;
  else if (n1 > 0.55) f += (0.5 + 1.2 * lit) * sk;
  if (n2 > 0.64) f += c.snow * (0.4 + lit);
  f += (n3 - 0.5) * 0.7;
  if (depth < 2 && face > 0.15) f += c.rim;
  const hz = clamp((y - (HY - c.hazeH)) / c.hazeH, 0, 1);
  f += hz * hz * c.hazeAmt;
  return ci(dith(f, x, y));
}
function paintMountain(m) {
  const r = genRidge(m.pts, m.rough, m.seed);
  const c = MCFG[m.kind];
  const n = r.ys.length;
  for (let i = 0; i < n; i++) {
    const x = r.x0 + i;
    if (x < 0 || x >= W) continue;
    const top = Math.max(0, Math.ceil(r.ys[i]));
    const i0 = Math.max(0, i - 3), i1 = Math.min(n - 1, i + 3);
    const slope = (r.ys[i1] - r.ys[i0]) / Math.max(1, i1 - i0);
    for (let y = top; y < HY; y++) MOUNT[y * W + x] = shadeM(x, y, y - top, slope, c);
  }
}
function genMountains() {
  const list = [
    { kind: 'far', pts: [[44, 236], [52, 231], [60, 226], [68, 221], [76, 223], [84, 229], [92, 236]], rough: 0.35, seed: 5 },
    { kind: 'far', pts: [[112, 236], [118, 232], [125, 229], [132, 233], [138, 236]], rough: 0.3, seed: 6 },
    { kind: 'left', pts: [[-2, 146], [8, 152], [18, 163], [28, 177], [38, 191], [48, 205], [58, 217], [68, 228], [78, 236]], rough: 0.42, seed: 7 },
    { kind: 'right', pts: [[116, 236], [124, 225], [131, 213], [137, 199], [144, 184], [150, 166], [156, 146], [162, 124], [168, 100], [173, 78], [177, 60], [180, 48], [184, 60], [190, 76], [198, 90], [207, 98], [218, 104]], rough: 0.3, seed: 8 },
    { kind: 'fore', pts: [[-2, 204], [10, 210], [24, 220], [36, 230], [46, 236]], rough: 0.45, seed: 9 },
  ];
  for (const m of list) paintMountain(m);
}
// The stars: 70 in the open sky, and 30 more behind the mountains that only ever show on the open sea
// (topExtras asks mountIdx, so a ridge that is still there hides them).
const STARS = [];
function starPass(rng, n, behind) {
  for (let k = 0, c = 0; k < 500 && c < n; k++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * 160);
    const i = y * W + x;
    if ((MOUNT[i] !== 255) !== behind || cloudIdx(x, y) !== 255) continue;
    STARS.push({ i, x, y, p: rng() * 6.283, b: rng(), s: 1 + rng() * 2 });
    c++;
  }
}
function genStars() { starPass(mulberry32(99), 70, false); starPass(mulberry32(98), 30, true); }
// The shore nobody from home has seen (bible, Still water at sea with the fish heard): low, wide and flat,
// nothing like the fjord, long flat headlands with open water between them (under the sun), one rising to a tall cliff,
// and a thin dark line of green (SHORE_GREEN) where it meets the sea. Heights above the horizon from its own
// seed, built once into NEWSHORE (NS_H rows above HY); drawNewShore blends it into TOP, so it reflects.
const NS_H = 26, NS_Y0 = HY - NS_H, NEWSHORE = new Uint8Array(W * NS_H).fill(255);
const NS_PTS = [[-2, -1], [3, 3], [12, 6], [30, 7], [40, 8], [47, 12], [53, 12], [58, 15], [64, 15], [68, 19], [72, 20], [73, 18], [74, 5], [76, -1],
  [80, -1], [82, 4], [85, 3], [87, -1], [113, -1], [118, 4], [128, 6], [160, 7], [184, 6], [196, 3], [203, -1], [218, -1]];
function newShorePix(x, y, top) {
  if (y === HY - 1 || (y === HY - 2 && hash2(x, y, 5) < 0.5)) return SHORE_GREEN; // the green line at the water
  const n = fbm(x * 0.22, y * 0.3, 77, 2), lit = y - top < 1 ? 1.6 : 0; // the dawn catches the top edge
  return ci(dith(3.2 + (n - 0.5) * 1.4 + lit + (y - top) * 0.05, x, y));
}
function genNewShore() {
  const r = genRidge(NS_PTS, 0.16, 71);
  for (let i = 0; i < r.ys.length; i++) {
    const x = r.x0 + i, h = r.ys[i];
    if (x < 0 || x >= W || h < 0.8) continue;
    const top = HY - Math.min(NS_H, Math.round(h));
    for (let y = top; y < HY; y++) NEWSHORE[(y - NS_Y0) * W + x] = newShorePix(x, y, top);
  }
}
// It rises out of the horizon haze: row y samples the source row that far above the horizon scaled by
// 1 / newShore, and blends toward the sky behind it by newShore. Only its own NS_H rows are touched.
function drawNewShore() {
  const a = WS.newShore;
  if (a <= 0) return;
  const inv = 1 / Math.max(0.05, a);
  for (let y = NS_Y0; y < HY; y++) {
    const ys = HY - Math.round((HY - y) * inv);
    if (ys < NS_Y0) continue;
    const src = (ys - NS_Y0) * W, row = y * W;
    for (let x = 0; x < W; x++) {
      const m = NEWSHORE[src + x];
      if (m === 255) continue;
      const i = row + x, v = TOP[i] > 11 ? 11 : TOP[i];
      TOP[i] = m > 11 ? (hash2(x, y, 13) < a ? m : v) : ci(dith(v + (m - v) * a, x, y));
    }
  }
}

// ---------------------------------------------------------------- sprites
const CH = { '.': 255, '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, a: 10, b: 11, R: 12, d: 13, g: 14, y: 15, w: 16, L: 17, E: 18, K: 19, S: 20, X: 21 };
function sprite(rows) {
  const h = rows.length, w = rows[0].length;
  const data = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = CH[rows[y][x]];
    data[y * w + x] = v === undefined ? 255 : v;
  }
  return { w, h, data };
}
const FISHER = sprite([
  '.....00....',
  '....0000...',
  '...000000..',
  '...000000..',
  '...00000...',
  '....0000...',
  '...000000..',
  '..00000000.',
  '.000.00000.',
  '00...00000.',
  '.....000000',
  '.....000000',
  '....0000000',
  '....0000000',
  '....0000000',
  '....000.000',
  '....00...00',
  '....00...00',
]);
const COMP = sprite([
  '...000...',
  '..00000..',
  '..000000.',
  '..000000.',
  '...0000..',
  '..000000.',
  '.0000000.',
  '.00000000',
  '000000000',
  '000000000',
  '.0000000.',
]);
const COMP_TURN = sprite([
  '...000...',
  '..00000..',
  '.0011100.',
  '.01X1X10.',
  '.0011100.',
  '..00000..',
  '.0000000.',
  '.00000000',
  '000000000',
  '000000000',
  '.0000000.',
]);
// Stay (bible, section 8): he stands at his seat, taller and still dark, the turned face kept; then the
// leaping frame, head and arms toward the sun on his left, the legs trailing.
const COMP_STAND = sprite([
  '...000...',
  '..00000..',
  '.0011100.',
  '.01X1X10.',
  '.0011100.',
  '..00000..',
  '...000...',
  '..00000..',
  '.0000000.',
  '.0000000.',
  '00.000.00',
  '00.000.00',
  '...000...',
  '...000...',
  '...0.0...',
  '...0.0...',
  '..00.00..',
]);
// Phase 29: the crouch before the launch, in profile toward the sun on his left: head low and forward, one red
// eye, the arms swung back, the knees bent over the plank.
const COMP_CROUCH = sprite([
  '..000......',
  '.00000.....',
  '.X00000....',
  '.000000....',
  '..00000....',
  '..00000000.',
  '.0000000000',
  '.00000000.00',
  '000000000..0',
  '00..000000..',
  '.00...0000..',
  '..00..000...',
  '..000.0000..',
].map(r => r.padEnd(12, '.')));
// (The crouch's rim, lit by the eye up and to the left, is added once sunRim is defined, below.)
const COMP_LEAP = sprite([
  '.....000....',
  '....00000...',
  '0...00000...',
  '00...000....',
  '.00.00000...',
  '..000000000.',
  '...00000.000',
  '....0000..00',
  '.....00....0',
  '....00......',
  '....0.......',
  '...0........',
]);
// Phase 23: at phone size the 12 px frame read as a speck, so the leap stamps it at 2x (nearest neighbour)
// on a higher arc, with a fading trail of three earlier positions in dark ramp indices.
const LEAP_ARC = 52; // how high the parabola rises above the straight line from the seat to the disc
const LEAP_TRAIL = [{ dp: 0.06, v: 2, a: 0.6 }, { dp: 0.12, v: 3, a: 0.38 }, { dp: 0.18, v: 4, a: 0.2 }];
function scale2(s) {
  const w = s.w * 2, h = s.h * 2, data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = s.data[(y >> 1) * s.w + (x >> 1)];
  return { w, h, data };
}
// Backlit by the eye: a 1 px rim of a bright ramp index on the edges facing the disc (left and below), so
// the dark frame reads against the dark ridge behind the stern as well as against the sky.
const LEAP_RIM = 10;
function sunRim(s, v, up) {
  const d = s.data.slice();
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const k = j * s.w + i;
    if (s.data[k] === 255) continue;
    const left = i === 0 || s.data[k - 1] === 255;
    const edge = up ? j === 0 || s.data[k - s.w] === 255 : j === s.h - 1 || s.data[k + s.w] === 255;
    if (left || edge) d[k] = v;
  }
  return { w: s.w, h: s.h, data: d };
}
const COMP_LEAP2 = sunRim(scale2(COMP_LEAP), LEAP_RIM);
const COMP_CROUCH_LIT = sunRim(COMP_CROUCH, LEAP_RIM, true);
// Phase 29: hanging from the eye by both hands, the left hooked over the top of the rim and the right on its
// slope, the head between the arms, the legs kicking (two frames). Stamped at 2x like the leap, solid dark:
// on the lit disc the silhouette is the read, so it carries no rim.
const CLING_TOP = ['0.....', '0.....', '0.00..', '0.00.0', '000000', '.0000.', '.0000.', '.0000.', '.0000.'];
const COMP_CLING2 = [
  scale2(sprite(CLING_TOP.concat(['.0..0.', '.0..0.', '.0...0', '0....0']))),
  scale2(sprite(CLING_TOP.concat(['.0..0.', '0...0.', '0..0..', '...0..']))),
];
const BIRD = [sprite(['1...1', '.1.1.', '..1..']), sprite(['.....', '11.11', '..1..'])];
const EXCL = sprite(['.1.', '1b1', '1b1', '1b1', '.1.', '1b1', '.1.']);
const ICON = sprite(['.bbb.b', 'bbbbbb', '.bbb.b']);
const CABIN_ROWS = [
  '....00....',
  '...0000.0.',
  '..00000000',
  '.000000000',
  '0000000000',
  '.00000KK0.',
  '.0LL00KK0.',
  '.0LL00KK0.',
  '.00000KK0.',
];
const CABIN = sprite(CABIN_ROWS);
// The same cabin with the window dark (WS.cabinLit 0, after the still-water dawn): the building stays.
const CABIN_DARK = sprite(CABIN_ROWS.map(r => r.replace(/L/g, '0')));
// Phase 30, Inside: the door's dark gap (K, columns 6 and 7) opens into a warm lit doorway (WS.door).
const CABIN_OPEN = sprite(CABIN_ROWS.map((r, j) => r.replace(/K/g, j < 7 ? 'S' : 'w'))); // white-hot with a gold sill, so it reads in the red
// Phase 31, the Inside close shot: the cabin as the pushed-in camera sees it, drawn at full resolution (the
// small cabin's own self, 30 by 25): log walls in three ramp steps (lit top, middle, shadowed underside) with
// the log ends out at the corners, a pitched roof (the lit slope toward the eye) with a dark ridge and eave,
// a chimney, a four-pane window lit white-hot (so it reads in the red) and a dark planked door with a pale
// handle. Open, the door leaf is a dark edge inside the frame and the doorway burns white-hot over a gold sill.
const CLOSE_ROWS = [
  '....................00000.....',
  '.....................125......',
  '.............0000....125......',
  '...........02224440..125......',
  '.........022222444440125......',
  '.......01212121414141405......',
  '.....02222222224444444440.....',
  '...012121212121414141414140...',
  '..02222222222224444444444440..',
  '000000000000000000000000000000',
  '..11111111111111111111111111..',
  '.4155555555555555122022015556.',
  '..12211111112222212202201222..',
  '.21661SS1SS166666122022016665.',
  '.41551SS1SS155555122022015556.',
  '..12211111112222212202201222..',
  '.21661SS1SS166666122022016665.',
  '.41551SS1SS15555512202b015556.',
  '..12211111112222212202201222..',
  '.2167777777776666122022016665.',
  '.4155555555555555122022015556.',
  '..12222222222222212202201222..',
  '.2166666666666666122022016665.',
  '.4155555555555555122022015556.',
  '..12222222222222212202201222..',
];
const DOOR_C0 = 18, DOOR_C1 = 23, DOOR_R0 = 11;  // the doorway's columns and top row; its sill is the bottom row
const doorway = (r, j) => j < DOOR_R0 ? r : r.slice(0, DOOR_C0) + [...'012345'].map((_, k) => {
  const x = DOOR_C0 + k;
  if (j === CLOSE_ROWS.length - 1) return 'w';
  return x === DOOR_C0 ? '1' : j === DOOR_R0 ? 'L' : 'S';
}).join('') + r.slice(DOOR_C1 + 1);
const CLOSE_CABIN = sprite(CLOSE_ROWS);
const CLOSE_DARK = sprite(CLOSE_ROWS.map(r => r.replace(/S/g, '1')));
const CLOSE_OPEN = sprite(CLOSE_ROWS.map(doorway));
// Two people, 6 by 13, facing left (the way to the door): two walking frames and a standing one. The
// fisherman in his hat and long coat (the boat's fisherman standing up) in the boat's dark; whoever was inside
// bareheaded, a little stooped, head pushed forward, darker (19), with no face. On the dark hill each is rimmed
// on its top and on the side facing the eye (walkRim, a line of light just outside the shape, so the body keeps
// its width): the fisherman in the eye's light, the other dimmer.
const MAN_TOP = ['..00..', '.0000.', '000000', '.000..', '..00..', '.0000.', '000000', '00000.', '.0000.', '.0000.'];
const OTHER_TOP = ['......', '.00...', '0000..', '.000..', '..000.', '.00000', '000000', '00000.', '0.000.', '..000.', '..000.'];
const MAN_LEGS = [['.0..0.', '0...0.', '0....0'], ['..00..', '..00..', '.00...'], ['.0..0.', '.0..0.', '.0..0.']];
const OTHER_LEGS = [['.0..0.', '0...0.'], ['..00..', '..0...'], ['.0..0.', '.0..0.']];
const WALK_RIM_MAN = 11, WALK_RIM_OTHER = 8;
// side 1 lights the right (walking left, the eye behind him), -1 the left (the sprite is then flipped). The
// result is one column wider (on the lit side) and one row taller (the light over the head).
function walkRim(s, v, side) {
  const w = s.w + 1, h = s.h + 1, ox = side > 0 ? 0 : 1, d = new Uint8Array(w * h).fill(255);
  const at = (i, j) => (i < 0 || j < 0 || i >= s.w || j >= s.h ? 255 : s.data[j * s.w + i]);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const si = i - ox, sj = j - 1, v0 = at(si, sj);
    if (v0 !== 255) d[j * w + i] = v0;
    else if (at(si - side, sj) !== 255 || at(si, sj + 1) !== 255) d[j * w + i] = v;
  }
  return { w, h, data: d };
}
const tone = (rows, c) => rows.map(r => r.replace(/0/g, c));
const walkSet = (top, legs, v, c) => [1, -1].map(side => legs.map(l => walkRim(sprite(tone(top.concat(l), c)), v, side)));
const WALK_MAN = walkSet(MAN_TOP, MAN_LEGS, WALK_RIM_MAN, '3');
const WALK_OTHER = walkSet(OTHER_TOP, OTHER_LEGS, WALK_RIM_OTHER, 'K');
// Whoever was inside, seated in the boat's stern seat with the rod, stooped over it.
const OTHER_SEAT = walkRim(sprite(tone(['.00...', '0000..', '.000..', '..000.', '.00000', '000000', '000000', '.00000'], 'K')), WALK_RIM_OTHER, 1);
const GOLDPILE = sprite(['...y.w..', '..yygyy.', '.gyygyyg', 'dgggdggd']);
// The kept golden fish (bible, section 8): about 10 by 4 in the gold indices 13 to 16, lying in the boat
// bottom beside the gold-pile slot, head to the left. KEPT_OPEN is the open-mouth variant used while it talks.
const KEPT = sprite(['..wyyw..d.', 'dywwwwygdd', '.gyyyyygd.', '..dgg...d.']);
const KEPT_OPEN = sprite(['..wyyw..d.', '.ywwwwygdd', 'dgyyyyygd.', '..dgg...d.']);
const KEPT_DX = 40, KEPT_DY = -10;   // from the boat's corner and the waterline
const KEPT_LADDER = [1, 0.7, 0.45];  // its alpha per act (bible, 8c); 0.05 after the silent ending
// The far boat on the title, at the horizon: 8 px, a hull with both ends raised, in hazy mid tones (6, with
// a 5 keel) so it reads as a boat far off on the bright water, not a speck of dirt. It sits in
// the open stretch of horizon under the sun, clear of the far mountain foot and of the rod.
const FARBOAT = sprite(['6......6', '.666666.', '..5555..']);
const FAR_X = 97;
const HB_GAP = 1.7;               // seconds between heartbeats in the red; Stay stretches it until it stops
const COMP_DX = 50, COMP_DY = -17; // the companion's seat, from the boat's corner and the waterline
const KNIFE_X = 12;               // hull column of the knife, beside the lantern pole

function makeBoat() {
  const L = 76, ox = 3, w = L + ox + 6, h = 32, wl = 30;
  const data = new Uint8Array(w * h).fill(255);
  const set = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < w && y >= 0 && y < wl) data[y * w + x] = v; };
  const tops = [];
  for (let x = 0; x < L; x++) {
    const t = x / (L - 1), e = Math.abs(2 * t - 1);
    const top = wl - 6 - Math.round(7 * Math.pow(e, 4.5));
    const bot = wl + 1 - Math.round(7 * Math.pow(e, 2.4));
    tops.push(top);
    for (let y = top; y <= bot; y++) set(ox + x, y, 0);
  }
  for (let x = 4; x < L - 4; x++) set(ox + x, tops[x] + 2, 1); // plank line
  // The stern seat, an empty plank exactly where the companion sits, so he visibly fills it (bible, Title).
  const seatY = wl + COMP_DY + COMP.h - 1;
  for (let x = COMP_DX - 1; x <= COMP_DX + COMP.w; x++) { set(x, seatY - 1, 3); set(x, seatY, 1); }
  // The knife: three bone pixels on the gunwale beside the lantern pole.
  const ky = tops[KNIFE_X] - 1;
  set(ox + KNIFE_X, ky, 23); set(ox + KNIFE_X + 1, ky, 22); set(ox + KNIFE_X + 2, ky, 22);
  const line = (pts, thick) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
      for (let s = 0; s <= n; s++) {
        const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n;
        set(x, y, 0);
        if (thick) set(x + 1, y, 0);
      }
    }
  };
  const px = ox + L - 1, py = wl;
  line([[px - 1, py - 13], [px, py - 15], [px + 1, py - 17], [px + 2, py - 19], [px + 2, py - 21], [px + 1, py - 23]], true);
  line([[px + 1, py - 23], [px, py - 24], [px - 2, py - 24], [px - 3, py - 23], [px - 4, py - 21], [px - 3, py - 19], [px - 1, py - 19]], false);
  const sx = ox;
  line([[sx + 1, py - 13], [sx, py - 15], [sx - 1, py - 17], [sx - 1, py - 19], [sx, py - 20], [sx + 2, py - 20], [sx + 3, py - 19]], false);
  return { w, h, data, wl };
}

// procedural pixel fish, head facing left
function makeFish(o) {
  const L = o.len, tl = o.tail, ht = o.ht, dh = o.dorsalH || 0;
  const bar = o.barbel ? 3 : 0;
  const w = bar + L + tl, h = ht + dh + 3 + (o.barbel ? 2 : 0);
  const cy = dh + 1 + (ht - 1) / 2;
  const data = new Uint8Array(w * h).fill(255);
  const P = o.pal;
  const set = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < w && y >= 0 && y < h) data[y * w + x] = v; };
  const hh = [];
  for (let x = 0; x < L; x++) {
    const t = (x + 0.5) / L;
    hh.push(o.eel ? (ht / 2) * Math.min(1, t / 0.12) * (1 - 0.35 * t) : (ht / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.8));
  }
  for (let k = 0; k < tl; k++) { // tail
    const x = bar + L - 1 + k;
    const half = 0.5 + ((k + 1) / tl) * tl * 0.62;
    for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
      const dy = Math.abs(y - cy);
      if (o.fork && k >= tl * 0.45 && dy < (k - tl * 0.45 + 1) * 0.75) continue;
      set(x, y, P.f);
    }
  }
  if (dh > 0) { // dorsal fin
    const x0 = Math.round(L * 0.3), x1 = Math.round(L * 0.7);
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const hg = o.crown ? Math.round(dh * (0.45 + 0.55 * Math.abs(Math.cos(t * Math.PI * 2.5)))) : Math.round(dh * (1 - t * 0.7));
      const top = Math.round(cy - hh[x]);
      for (let y = top - hg; y < top; y++) set(bar + x, y, P.f);
    }
  }
  for (let x = 0; x < L; x++) { // body
    const top = Math.round(cy - hh[x]), bot = Math.round(cy + hh[x]);
    for (let y = top; y <= bot; y++) {
      const v = (y - top) / Math.max(1, bot - top);
      let c = v < 0.36 ? P.b : v < 0.68 ? P.m : P.l;
      if (o.stripes && v < 0.62 && x > L * 0.28 && x < L * 0.86 && x % o.stripes === 0) c = P.bar !== undefined ? P.bar : P.o;
      if (o.spots && v < 0.6 && hash2(x, y, o.seed || 3) > 0.84) c = o.spotC !== undefined ? o.spotC : P.spot !== undefined ? P.spot : P.l;
      set(bar + x, y, c);
    }
  }
  const pfx = Math.round(L * 0.3);
  set(bar + pfx, cy + hh[pfx] * 0.3 + 1, P.f);
  set(bar + pfx + 1, cy + hh[pfx] * 0.3 + 2, P.f);
  const out = data.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { // outline
    const i = y * w + x;
    if (data[i] === 255) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || data[i - 1] === 255 || data[i + 1] === 255 || data[i - w] === 255 || data[i + w] === 255;
    if (edge) out[i] = P.o;
  }
  for (let x = Math.round(L * 0.25); x < Math.round(L * 0.65); x++) { // shine
    const yy = Math.round(cy - hh[x] * 0.15);
    const i = yy * w + bar + x;
    if (out[i] !== 255 && out[i] !== P.o) out[i] = P.s;
  }
  if (!o.noEye) {
    const ex = Math.max(1, Math.round(L * 0.15));
    const ey = Math.round(cy - hh[ex] * 0.35);
    out[ey * w + bar + ex] = P.e;
  }
  if (o.barbel) {
    const y0 = Math.round(cy + 1);
    out[y0 * w + bar - 1] = P.o; out[(y0 + 1) * w + bar - 2] = P.o; out[(y0 + 2) * w + bar - 3] = P.o;
  }
  fishMarks(o, out, w, L, bar, cy);
  return { w, h, data: out, cy: Math.round(cy), bar };
}
// The species signatures that sit on top of the body (bible, section 5): the perch's one dark heart pixel
// behind the gill, and the grinning smelt's row of bone teeth along the lower lip.
function fishMarks(o, out, w, L, bar, cy) {
  const P = o.pal;
  if (P.heart !== undefined) out[Math.round(cy + 1) * w + bar + Math.round(L * 0.3)] = P.heart;
  if (o.teeth) {
    const y = Math.round(cy) + 1;
    for (let k = 0; k < o.teeth; k++) out[y * w + bar + 1 + k * 2] = P.tooth !== undefined ? P.tooth : 22;
  }
}
const FPAL = { o: 3, b: 6, m: 8, l: 10, s: 11, f: 5, e: 1 };
const GPAL = { o: 13, b: 14, m: 15, l: 16, s: 16, f: 14, e: 18 };
let BOAT, GOLD, GOLD_OPEN;
// The zoom silhouettes for the ocean pull-back (bible, section 8, phase 24). The whole boat group (hull,
// fisherman, the rod at rest, the lantern on its pole) is drawn once into one canvas in the boat's own dark
// indices (accents read as index 1), then shrunk at each of FAR_SCALES with nearest-neighbour cells, a cell
// taking the darkest source pixel in it, so the thin hull lines, the rod and the curled ends survive while
// they are more than a pixel; then the 5 by 2 speck. farSprite picks one from WS.far step by small step (the
// step before the first is the live group itself). Each frame keeps its anchor (ax the group's centre column,
// wl the waterline row) and its rod tip (tx, ty), so it shrinks round the point the camera glides toward.
// The swimmer (a sunk run at sea) has the same ladder: head, shoulders, the rod and the floating lantern.
const FAR_SCALES = [0.85, 0.72, 0.6, 0.5, 0.42, 0.34, 0.27, 0.2, 0.14, 0.09];
const ZOOM_H = 40, SWIM_CX = 18; // the canvas rows above the waterline (the rod tip at rest is 37 up); the swimmer's centre column
let BOAT_ZOOM, SWIM_ZOOM, IN_BOAT, IN_SWIM, IN_EMPTY, BOAT_SPECK, SPECK_TIP, SPECK_BIT, SWIM_SPECK;
// A canvas in boat coordinates: x from the boat's left, y relative to the waterline (negative is up).
function zoomCanvas(cx) {
  const w = BOAT.w, h = ZOOM_H, data = new Uint8Array(w * h).fill(255);
  const put = (x, y, v) => {
    x = Math.round(x); y = h + Math.round(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x, d = v < 12 ? v : 1;
    if (data[i] === 255 || d < data[i]) data[i] = d;
  };
  return { w, h, data, cx, put };
}
function zoomSprite(c, s, x0, y0, rows) {
  for (let y = 0; y < Math.min(s.h, rows || s.h); y++) for (let x = 0; x < s.w; x++) if (s.data[y * s.w + x] !== 255) c.put(x0 + x, y0 + y, s.data[y * s.w + x]);
}
function zoomRod(c, hx, hy) {
  const dx = Math.cos(REST_A), dy = Math.sin(REST_A);
  for (let k = 0; k <= ROD_LEN * 2; k++) c.put(hx + dx * k / 2, hy + dy * k / 2, 0);
  c.tx = Math.round(hx + dx * ROD_LEN); c.ty = c.h + Math.round(hy + dy * ROD_LEN);
}
function zoomLantern(c, ly) {
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) c.put(6 + i, ly + j, i === 0 || i === 2 || j === 0 || j === 3 ? 0 : 2);
}
// empty: the hull and the lantern only (Inside: the boat once he has stepped out of it). The Inside ladder
// (INSIDE_SS) is in screen sizes: the boat on the pushed-in shore, never an enlarged far frame.
function boatZoomSource(empty) {
  const c = zoomCanvas(BOAT.w / 2);
  zoomSprite(c, BOAT, 0, -BOAT.wl);
  if (!empty) zoomSprite(c, FISHER, 18, FISHER_DY);
  for (let y = -27; y < -8; y++) c.put(9, y, 0); // the lantern pole and its hook
  c.put(8, -27, 0); c.put(7, -27, 0); c.put(7, -26, 0);
  zoomLantern(c, LANTERN_DY);
  if (!empty) zoomRod(c, 18, FISHER_DY + 9);
  return c;
}
function swimZoomSource() {
  const c = zoomCanvas(SWIM_CX);
  zoomSprite(c, FISHER, 18, -FISHER_FLOAT, FISHER_FLOAT);
  zoomLantern(c, -4);
  zoomRod(c, 18, -FISHER_FLOAT + 9);
  return c;
}
// One step of the ladder: the source shrunk round its anchor column and its waterline.
function zoomFrame(c, sc) {
  const ax = Math.ceil(c.cx * sc), w = Math.ceil(c.w * sc) + 2, h = Math.ceil(c.h * sc);
  const data = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const v = c.data[y * c.w + x];
    if (v === 255) continue;
    const dx = ax + Math.floor((x - c.cx) * sc), dy = h + Math.floor((y - c.h) * sc);
    if (dx < 0 || dx >= w || dy < 0) continue;
    const i = dy * w + dx;
    if (data[i] === 255 || v < data[i]) data[i] = v;
  }
  return { w, h, data, wl: h, ax, tx: ax + Math.floor((c.tx - c.cx) * sc), ty: h + Math.floor((c.ty - c.h) * sc) };
}
// Inside: the eye's light along every upper edge that has body under it (the gunwale, the hat, the shoulders),
// so the silhouette keeps its volume on the pushed-in shore; thin lines (the rod, the curls) stay dark.
const TOP_LIT = 7;
function topLit(f) {
  const d = f.data.slice(), at = (i, j) => (i < 0 || j < 0 || i >= f.w || j >= f.h ? 255 : f.data[j * f.w + i]);
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    if (at(i, j) !== 255 && at(i, j - 1) === 255 && at(i, j + 1) !== 255 && at(i, j + 2) !== 255) d[j * f.w + i] = TOP_LIT;
  }
  return Object.assign({}, f, { data: d });
}
const speckOf = (rows, wl) => Object.assign(sprite(rows), { wl, ax: rows[0].length / 2, tx: rows[0].length / 2, ty: 0 });
function buildFarBoats() {
  const boat = boatZoomSource(), swim = swimZoomSource();
  BOAT_ZOOM = FAR_SCALES.map(sc => zoomFrame(boat, sc));
  SWIM_ZOOM = FAR_SCALES.map(sc => zoomFrame(swim, sc));
  IN_BOAT = INSIDE_SS.map(sc => topLit(zoomFrame(boat, sc))); // Inside: screen sizes, stamped at 1 px per pixel
  IN_SWIM = INSIDE_SS.map(sc => topLit(zoomFrame(swim, sc)));
  IN_EMPTY = topLit(zoomFrame(boatZoomSource(true), INSIDE_SS[INSIDE_SS.length - 1]));
  BOAT_SPECK = speckOf(['.000.', '00000'], 2);
  SWIM_SPECK = speckOf(['00'], 1);
  SPECK_TIP = speckOf(['..000', '0000.'], 2); // tipping into the mouth (Swallowed), which is to its left
  SPECK_BIT = speckOf(['00'], 1);
}
function buildSprites() {
  BOAT = makeBoat();
  buildFarBoats();
  GOLD = makeFish({ len: 23, ht: 10, tail: 8, dorsalH: 4, crown: true, fork: true, barbel: true, pal: GPAL });
  GOLD_OPEN = { w: GOLD.w, h: GOLD.h, data: GOLD.data.slice(), cy: GOLD.cy, bar: GOLD.bar };
  const mi = GOLD.cy * GOLD.w + GOLD.bar;
  GOLD_OPEN.data[mi] = 255;
  GOLD_OPEN.data[mi + 1] = 13;
}

// Each species has its own small palette (bible, section 5, 'How the fish look'): pal for acts 0 and 1,
// pal2 for the act 2 name, greyer and darker. Keys are makeFish's o b m l s f e plus the marks: bar (the
// perch's dark bars), spot, heart (the perch's one dark pixel), tooth (the grinning smelt, bone). The
// warm accents (13 dark brown, 14 ochre, 22-23 bone, 24 red-brown) stand in for olive and grey, since the
// ramp itself is blue; the night ramp greys the act 2 cards further on its own. Every pal2 outline and body
// index is 3 or above, so the act 2 fish reads on the night panel (index 0, nearly black).
const SPECIES = [
  { id: 'perch', names: ['Glass perch', 'Glass perch', 'Eyeless perch'], len: 12, ht: 7, tail: 4, dorsalH: 2, stripes: 2, fork: true, wt: [0.2, 0.6], d: 0.9,
    pal: { o: 7, b: 10, m: 10, l: 11, s: 11, f: 9, e: 18, bar: 4, heart: 24 },
    pal2: { o: 4, b: 23, m: 23, l: 22, s: 22, f: 9, e: 18, bar: 2, heart: 24 } },
  { id: 'char', names: ['Mirror char', 'Mirror char', 'Hollow char'], len: 15, ht: 6, tail: 4, dorsalH: 1, spots: true, fork: true, wt: [0.5, 1.4], d: 1.0,
    pal: { o: 3, b: 7, m: 9, l: 10, s: 9, f: 6, e: 18, spot: 11 },
    pal2: { o: 3, b: 6, m: 7, l: 9, s: 9, f: 5, e: 18 } },
  { id: 'smelt', names: ['Blue smelt', 'Grinning smelt', 'Grinning smelt'], len: 9, ht: 4, tail: 3, dorsalH: 1, fork: true, wt: [0.05, 0.2], d: 0.7,
    pal: { o: 3, b: 6, m: 8, l: 10, s: 11, f: 6, e: 20, tooth: 22 },
    pal2: { o: 1, b: 4, m: 6, l: 8, s: 9, f: 4, e: 20, tooth: 22 } },
  { id: 'trout', names: ['Fjord trout', 'Fjord trout', 'Drowned trout'], len: 17, ht: 8, tail: 5, dorsalH: 1, spots: true, fork: false, wt: [0.8, 2.2], d: 1.25,
    pal: { o: 18, b: 13, m: 23, l: 22, s: 14, f: 13, e: 18, spot: 24 },
    pal2: { o: 3, b: 5, m: 6, l: 23, s: 7, f: 4, e: 18, spot: 24 } },
  { id: 'eel', names: ['Needle eel', 'Knot eel', 'Endless eel'], len: 24, ht: 3, tail: 2, eel: true, wt: [0.3, 0.9], d: 1.1,
    pal: { o: 19, b: 18, m: 13, l: 14, s: 15, f: 13, e: 22 },
    pal2: { o: 3, b: 5, m: 6, l: 23, s: 7, f: 4, e: 22 } },
  { id: 'grayling', names: ['Pale grayling', 'Pale grayling', 'Ash grayling'], len: 14, ht: 6, tail: 4, dorsalH: 5, fork: true, wt: [0.3, 0.8], d: 1.0,
    pal: { o: 4, b: 23, m: 22, l: 11, s: 11, f: 7, e: 18 },
    pal2: { o: 1, b: 3, m: 23, l: 22, s: 22, f: 4, e: 18 } },
];
// The makeFish options for one species in one act: the act 2 palette past act 1, no eye on the eyeless
// perch, the tooth row on the grinning smelt from act 1 (its act 1 line is 'It has teeth.').
function fishOpts(sp, a, seed) {
  return { len: sp.len, ht: sp.ht, tail: sp.tail, dorsalH: sp.dorsalH, stripes: sp.stripes, spots: sp.spots, fork: sp.fork, eel: sp.eel,
    noEye: a === 2 && sp.id === 'perch', teeth: sp.id === 'smelt' && a >= 1 ? 3 : 0, seed, pal: a === 2 ? sp.pal2 : sp.pal };
}
// One card line per species per act (story bible, section 5).
const DESC = {
  perch: ['You can see its heart beating through it.', 'There is an old hook inside it. Not yours.', 'No eyes. It still turns toward the lantern.'],
  char: ['Its scales show you the sky. You check. It matches.', 'Its scales show you a red sky.', 'Its scales show your boat from underneath.'],
  smelt: ['Small and cold. It holds still for the knife.', 'It has teeth. They look like yours.', 'It is dry. It came out of the water dry.'],
  trout: ['It fought like it had somewhere to be.', 'It keeps looking at the sun.', 'It drowned. It is a fish. It drowned.'],
  eel: ['Longer than the boat. It weighs nothing.', 'It knotted itself so you couldn\u2019t keep it.', 'It is still coming out of the water.'],
  grayling: ['It smells of snow.', 'It smells of smoke.', 'It smells like you.'],
};
// The act 2 card voice, only if the player asked to hear the fish, keyed to the first wish.
const VOICE = {
  company: 'I wished for company too. Now I have plenty.',
  fish: 'I wished to go where the fish are too. Here I am.',
  home: 'I wished for a home too. This is it.',
  nothing: 'I wanted nothing too. It waited.',
};
const ENDING_COUNT = 7;
const ENDINGS = {
  home: { title: 'Home' }, dark: { title: 'Dark' }, cut: { title: 'Still water' },
  swallowed: { title: 'Swallowed' }, stay: { title: 'Stay' }, deep: { title: 'Deep' }, inside: { title: 'Inside' },
};
// The ending card's BASE (bible, section 4 Ending cards: twenty situations), keyed by ending (the silent
// variant as 'silent'), then by lake or sea (WS.sea past 0.5), then by boat or sunk (WS.boatSunk at 1); Still
// water at sea splits once more on whether he heard the fish. The number after each line is the bible's.
// A cell built from shared pieces is an array of parts, translated one by one before joining (endingBase).
const NEXT_SUN = ' Somewhere a sun is coming up. Someone is rowing out.';
const NO_BOTTOM = 'The water is warmer than you thought, and full of light, and ';
const STAY_END = 'He took the sun down with him. ';
const STAY_DARK = 'It does not get light, and after a while you stop minding.';
const KNOW_WAY = 'You cut it. The fish you can hear know the way. They ';
const NEW_SHORE = ' you to a shore nobody from home has seen, and you start again there.';
const GUTTER = 'You never reel it in.';
const END_BASES = {
  home: {
    lake: {
      boat: ['The lake is quiet again. The fish are hungry.', NEXT_SUN], // 1
      sunk: ['The lake is quiet again. The boat is on the bottom and so is the gold.', NEXT_SUN], // 2
    },
    sea: {
      boat: ['The sea is quiet again. Nobody will come this far to look.', NEXT_SUN], // 3
      sunk: ['The sea is quiet again. The gold is on the bottom, and it is a long way down.', NEXT_SUN], // 4
    },
  },
  dark: {
    lake: {
      boat: ['You sit with the lantern until it gutters out. Sometimes something takes the bait. ', GUTTER], // 5
      sunk: ['You hang in the water beside the lantern until it gutters out. Sometimes something takes the bait. ', GUTTER], // 6
    },
    sea: {
      boat: ['You sit with the lantern until it gutters out. There is no shore to see it from. Sometimes something takes the bait. ', GUTTER], // 7
      sunk: 'You hang in the water beside the lantern until it gutters out. The big ones pass under you all night. You never reel anything in.', // 8
    },
  },
  cut: {
    lake: {
      boat: 'You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.', // 9
      sunk: 'You swim for the shore and reach it. Every morning you wake in the water again, above the gold. You can always come back for it, it said.', // 10, no pocket line
    },
    sea: {
      boat: {
        quiet: 'You cut it. The red sun goes down for everyone. There is no shore in any direction. You row anyway, for a while.', // 11
        heard: [KNOW_WAY, 'bring', NEW_SHORE], // 12
      },
      sunk: {
        quiet: 'You cut it. The red sun goes down for everyone. You swim for a while.', // 13
        heard: [KNOW_WAY, 'carry', NEW_SHORE], // 14 (unreachable: hear and gold share wish 2)
      },
    },
  },
  stay: { // lake only: the companion is a first wish
    lake: {
      boat: ['You stay. ', STAY_END, 'The seat behind you is empty again. ', STAY_DARK], // 15
      sunk: ['You stay, in the water. ', STAY_END, STAY_DARK], // 16
    },
  },
  deep: { // sunk only: Deep needs the gold
    lake: { sunk: ['The gold is where you left it. So is everything else. ', NO_BOTTOM, 'there is no bottom.'] }, // 17
    sea: { sunk: ['The gold is somewhere below. ', NO_BOTTOM, 'the big ones let you pass. There is no bottom.'] }, // 18
  },
  silent: { // lake, boat: Silent needs two refusals, so no gold and no sea
    lake: { boat: 'You wanted nothing. It showed you anyway. You row until the water is only water. Some evenings, the sunset looks back.' }, // 19
  },
  swallowed: { // act 0, the sea
    sea: { boat: 'Somewhere far above, the sun is still shining on the sea. There is no boat on it.' }, // 20
  },
  inside: { // lake only: the cabin is a first wish
    lake: {
      boat: 'You open the door. Someone was waiting to get out. They take the boat. Some nights you hear them cast. Some nights, you knock.', // 21
      sunk: 'You swim ashore and open the door. Someone was waiting to get out. They walk into the water, toward the gold. Some nights, you knock.', // 22
    },
  },
};
// ONE extra sentence after the base: the first true state in each ending's priority order. A line is a
// string, or an alternate keyed by boat/sunk or lake/sea; an alternate with no entry for the situation is
// skipped (Still water's heard line is lake only).
const END_EXTRA = {
  home: {
    order: ['kept', 'company', 'cabin', 'heard', 'forever', 'refused2'],
    lines: {
      kept: { boat: 'The golden fish slips out of the boat as you go in.', sunk: 'The golden fish follows you in.' },
      company: { boat: 'The seat behind you is empty now. It was your turn.', sunk: 'The water behind you is empty now. It was your turn.' },
      cabin: 'The knocking stops. Nobody answers it now.',
      heard: 'You know the words already. You will say them.',
      forever: 'The day does not end. You aren’t in it.',
      refused2: 'You asked for nothing, and then for home. Home was the only thing it had.',
    },
  },
  dark: {
    order: ['kept', 'heard', 'company', 'forever', 'cabin', 'refused2'],
    lines: {
      kept: { boat: 'The golden fish dries in the bottom of the boat. It stops asking before you do.', sunk: 'The golden fish circles you all night, glowing less each time.' },
      heard: { lake: 'The lake keeps talking. You stop answering.', sea: 'The sea keeps talking. You stop answering.' },
      company: 'Someone breathes behind you all night. You do not turn around.',
      forever: 'The day never ends. It never begins either.',
      cabin: 'The knocking goes on all night. Nobody opens.',
      refused2: 'You asked for nothing twice. Here it is.',
    },
  },
  cut: {
    order: ['company', 'cabin', 'kept', 'forever', 'heard', 'refused1', 'refused2'],
    lines: {
      company: { boat: 'There is someone in the stern. You do not ask. You row.', sunk: 'Someone swims behind you. You do not ask.' },
      cabin: 'The cabin goes dark. The knocking stops. You don’t go back to see why.',
      kept: { boat: 'You lifted it over the side. It let you.', sunk: 'You let it go. It let you.' },
      forever: { lake: 'Dawn comes anyway. You did not ask for it.', sea: 'Dawn comes anyway, over nothing.' },
      heard: { lake: 'You can still hear them from the shore. You stop listening.' },
      refused1: 'You asked once for nothing. It kept count.',
      refused2: 'Twice you said nothing. The knife said it a third time.',
    },
  },
  stay: { // Stay needs the companion (wish 1), so a cabin can never join it
    order: ['kept', 'heard', 'forever'],
    lines: {
      kept: 'The golden fish stays with you. It is the only light that answers.',
      heard: 'The lake keeps talking about him.',
      forever: 'The day did not end. Now it will not begin.',
    },
  },
  deep: { // Deep needs the gold (wish 2), so hear and forever can never join it
    order: ['kept', 'company'],
    lines: {
      kept: 'The golden fish goes down with you. It knows the way.',
      company: 'Someone comes down after you. You do not look back.',
    },
  },
  silent: { order: ['kept'], lines: { kept: 'It went over the side on its own. You let it.' } },
  swallowed: { order: ['kept'], lines: { kept: 'The golden fish went in with you. It had been in before.' } },
  inside: { // the house path: no companion, no sea
    order: ['kept', 'forever'],
    lines: {
      kept: 'The golden fish goes with them. You stay behind the door.',
      forever: 'The day outside does not end. You watch it through the window.',
    },
  },
};
// The wish button labels, read back on the ending card (gold as one phrase, so the list reads as one wish each).
const WISH_LABELS = {
  company: 'Someone to sit with me', fish: 'Take me where the fish are', home: 'A home on the shore',
  forever: 'Make this day last forever', hear: 'Let me hear the fish', gold: 'A boat full of gold',
};
// The recount at wish 3: the player's own labels shifted to the second person, one clause per granted wish, in order.
const RECOUNT = {
  company: 'someone to sit with you', fish: 'where the fish are', home: 'a home on the shore',
  forever: 'a day that never ends', hear: 'to hear the fish', gold: 'a boat full of gold',
};

// ---------------------------------------------------------------- language
// One page per language: the build bakes DEFAULT_LANG in (build.js --lang=ru), and ?lang=ru or ?lang=en
// overrides it for testing. There is no saved choice and no browser detection. RU is keyed by the exact
// English string; tr(s) returns the Russian in RU mode and s otherwise. Text is translated where it reaches
// the player (cap, thinkLine, dlgRun, lakeWhisper, showCard, composeEnding, refreshPrompt, makeUI and
// staticText), and composed text translates its parts before joining (trJoin, recountLine, askedLine,
// endingBase). Logic never reads translated text: choices pick by closure, and a dialogue line keeps its
// English `who`. To add a string, write it in English where it is used and add 'English': 'Russian' to RU;
// the sim's Russian pass fails on any Latin letter the player would see.
const DEFAULT_LANG = 'en';
const LANGS = ['en', 'ru'];
let LANG = DEFAULT_LANG;
function pickLang() {
  if (!IS_BROWSER) return DEFAULT_LANG;
  const q = new URLSearchParams(window.location.search).get('lang');
  return LANGS.indexOf(q) >= 0 ? q : DEFAULT_LANG;
}
const RU = {
  'Still Water': 'Тихий омут',
  'Still Water, a short fishing tale': 'Тихий омут, короткая рыбацкая сказка',
  'Mute': 'Без звука',
  'Skip fish': 'Пропустить рыбу',
  'Fisherman': 'Рыбак',
  'Tap to continue': 'Нажми, чтобы продолжить',
  'A short fishing tale': 'Короткая рыбацкая сказка',
  'Tap to begin': 'Нажми, чтобы начать',
  'Tap to cast. Tap when the float goes under. Hold to reel.': 'Нажми, чтобы забросить. Поплавок ушёл под воду — подсекай. Держи, чтобы тянуть.',
  'Cast again': 'Забросить снова',
  'Glass perch': 'Стеклянный окунь',
  'Eyeless perch': 'Безглазый окунь',
  'Mirror char': 'Зеркальный голец',
  'Hollow char': 'Пустой голец',
  'Blue smelt': 'Синяя корюшка',
  'Grinning smelt': 'Оскаленная корюшка',
  'Fjord trout': 'Фьордовая форель',
  'Drowned trout': 'Утонувшая форель',
  'Needle eel': 'Игольчатый угорь',
  'Knot eel': 'Узловатый угорь',
  'Endless eel': 'Бесконечный угорь',
  'Pale grayling': 'Бледный хариус',
  'Ash grayling': 'Пепельный хариус',
  'You can see its heart beating through it.': 'Сквозь него видно, как бьётся сердце.',
  'There is an old hook inside it. Not yours.': 'Внутри него старый крючок. Не твой.',
  'No eyes. It still turns toward the lantern.': 'Глаз нет. Он всё равно поворачивается к фонарю.',
  'Its scales show you the sky. You check. It matches.': 'В его чешуе отражается небо. Ты проверяешь. Совпадает.',
  'Its scales show you a red sky.': 'В его чешуе отражается красное небо.',
  'Its scales show your boat from underneath.': 'В его чешуе — днище твоей лодки.',
  'Small and cold. It holds still for the knife.': 'Маленькая и холодная. Замирает под ножом.',
  'It has teeth. They look like yours.': 'У неё зубы. Похожи на твои.',
  'It is dry. It came out of the water dry.': 'Она сухая. Из воды она вышла сухой.',
  'It fought like it had somewhere to be.': 'Она билась так, будто куда-то спешила.',
  'It keeps looking at the sun.': 'Она всё смотрит на солнце.',
  'It drowned. It is a fish. It drowned.': 'Она утонула. Это рыба. Она утонула.',
  'Longer than the boat. It weighs nothing.': 'Длиннее лодки. Ничего не весит.',
  'It knotted itself so you couldn’t keep it.': 'Он завязался узлом, чтобы ты не смог его оставить.',
  'It is still coming out of the water.': 'Он всё ещё тянется из воды.',
  'It smells of snow.': 'Он пахнет снегом.',
  'It smells of smoke.': 'Он пахнет дымом.',
  'It smells like you.': 'Он пахнет тобой.',
  'Its scales show someone sitting behind you.': 'В его чешуе отражается кто-то у тебя за спиной.',
  'There is a gold scale in its mouth.': 'Во рту — золотая чешуйка.',
  'Its stomach is full of hooks. All of them yours.': 'Желудок набит крючками. Все до одного твои.',
  'It swam to the hook. It didn’t have to.': 'Рыба сама пошла на крючок. Её никто не заставлял.',
  'It smells of woodsmoke. Someone’s home.': 'Он пахнет печным дымом. Кто-то дома.',
  'There are coins in it. They are still warm.': 'Внутри — монеты. Ещё тёплые.',
  'It is looking at you the way you look at it.': 'Рыба смотрит на тебя так же, как ты на неё.',
  'There is an old hook in its lip.': 'В губе застрял старый крючок.',
  'I wished for company too. Now I have plenty.': 'Мне тоже хотелось компании. Теперь нас тут много.',
  'I wished to go where the fish are too. Here I am.': 'Мне тоже хотелось туда, где рыба. Вот я и здесь.',
  'I wished for a home too. This is it.': 'Мне тоже хотелось своего дома. Вот он.',
  'I wanted nothing too. It waited.': 'Мне тоже ничего не хотелось. Оно ждало.',
  ' kg': ' кг',
  'Home': 'Дом',
  'Dark': 'Тьма',
  'Still water': 'Тихая вода',
  'Swallowed': 'Проглочен',
  'Stay': 'Остаться',
  'Deep': 'Глубина',
  'Inside': 'Внутри',
  'You open the door. Someone was waiting to get out. They take the boat. Some nights you hear them cast. Some nights, you knock.': 'Ты открываешь дверь. Там кто-то ждал, чтобы выйти. Он берёт твою лодку. Иногда ночью ты слышишь, как он забрасывает леску. Иногда ночью стучишь ты.',
  'You swim ashore and open the door. Someone was waiting to get out. They walk into the water, toward the gold. Some nights, you knock.': 'Ты доплываешь до берега и открываешь дверь. Там кто-то ждал, чтобы выйти. Он уходит в воду, к золоту. Иногда ночью стучишь ты.',
  'The golden fish goes with them. You stay behind the door.': 'Золотая рыбка уходит с ним. Ты остаёшься за дверью.',
  'The day outside does not end. You watch it through the window.': 'День за окном не кончается. Ты смотришь на него в окно.',
  ' Somewhere a sun is coming up. Someone is rowing out.': ' Где-то встаёт солнце. Кто-то отчаливает от берега.',
  'The water is warmer than you thought, and full of light, and ': 'Вода теплее, чем ты думал, и полна света, и ',
  'He took the sun down with him. ': 'Он унёс солнце с собой под воду. ',
  'It does not get light, and after a while you stop minding.': 'Светло так и не становится, и через какое-то время тебе уже всё равно.',
  'You cut it. The fish you can hear know the way. They ': 'Ты перерезаешь леску. Рыбы, которых ты слышишь, знают дорогу. Они ',
  'bring': 'выводят',
  'carry': 'выносят',
  ' you to a shore nobody from home has seen, and you start again there.': ' тебя к берегу, которого никто в твоих краях не видел, и там ты начинаешь всё сначала.',
  'You never reel it in.': 'Ты его так и не вытаскиваешь.',
  'The lake is quiet again. The fish are hungry.': 'Озеро снова спокойно. Рыба голодна.',
  'The lake is quiet again. The boat is on the bottom and so is the gold.': 'Озеро снова спокойно. Лодка на дне, и золото тоже.',
  'The sea is quiet again. Nobody will come this far to look.': 'Море снова спокойно. Так далеко искать никто не поплывёт.',
  'The sea is quiet again. The gold is on the bottom, and it is a long way down.': 'Море снова спокойно. Золото на дне, а до дна далеко.',
  'You sit with the lantern until it gutters out. Sometimes something takes the bait. ': 'Ты сидишь с фонарём, пока он не догорит. Иногда что-то берёт наживку. ',
  'You hang in the water beside the lantern until it gutters out. Sometimes something takes the bait. ': 'Ты висишь в воде рядом с фонарём, пока он не догорит. Иногда что-то берёт наживку. ',
  'You sit with the lantern until it gutters out. There is no shore to see it from. Sometimes something takes the bait. ': 'Ты сидишь с фонарём, пока он не догорит. Нет берега, с которого его было бы видно. Иногда что-то берёт наживку. ',
  'You hang in the water beside the lantern until it gutters out. The big ones pass under you all night. You never reel anything in.': 'Ты висишь в воде рядом с фонарём, пока он не догорит. Громадины всю ночь проходят под тобой. Ты так ничего и не вытаскиваешь.',
  'You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.': 'Ты гребёшь, пока вода не станет просто водой. Здесь ты больше не рыбачишь. Иногда по вечерам закат смотрит на тебя в ответ.',
  'You swim for the shore and reach it. Every morning you wake in the water again, above the gold. You can always come back for it, it said.': 'Ты плывёшь к берегу и добираешься до него. Каждое утро ты снова просыпаешься в воде, над золотом. «Ты всегда можешь за ним вернуться», — сказала рыбка.',
  'You cut it. The red sun goes down for everyone. There is no shore in any direction. You row anyway, for a while.': 'Ты перерезаешь леску. Красное солнце заходит для всех. Берега нет ни с одной стороны. Ты всё равно гребёшь — какое-то время.',
  'You cut it. The red sun goes down for everyone. You swim for a while.': 'Ты перерезаешь леску. Красное солнце заходит для всех. Какое-то время ты плывёшь.',
  'You stay. ': 'Ты остаёшься. ',
  'The seat behind you is empty again. ': 'Место позади тебя снова пустое. ',
  'You stay, in the water. ': 'Ты остаёшься — в воде. ',
  'The gold is where you left it. So is everything else. ': 'Золото там, где ты его оставил. Как и всё остальное. ',
  'there is no bottom.': 'дна нет.',
  'The gold is somewhere below. ': 'Золото где-то внизу. ',
  'the big ones let you pass. There is no bottom.': 'громадины пропускают тебя. Дна нет.',
  'You wanted nothing. It showed you anyway. You row until the water is only water. Some evenings, the sunset looks back.': 'Ты ничего не хотел. Оно всё равно всё тебе показало. Ты гребёшь, пока вода не станет просто водой. Иногда по вечерам закат смотрит на тебя в ответ.',
  'Somewhere far above, the sun is still shining on the sea. There is no boat on it.': 'Где-то далеко наверху солнце всё ещё светит над морем. Лодки на нём нет.',
  'The golden fish slips out of the boat as you go in.': 'Золотая рыбка выскальзывает из лодки, пока ты заходишь внутрь.',
  'The golden fish follows you in.': 'Золотая рыбка заплывает внутрь следом за тобой.',
  'The seat behind you is empty now. It was your turn.': 'Место позади тебя теперь пустое. Настал твой черёд.',
  'The water behind you is empty now. It was your turn.': 'Вода позади тебя теперь пуста. Настал твой черёд.',
  'The knocking stops. Nobody answers it now.': 'Стук стихает. Теперь на него некому ответить.',
  'You know the words already. You will say them.': 'Ты уже знаешь слова. Ты их скажешь.',
  'The day does not end. You aren’t in it.': 'День не кончается. Тебя в нём нет.',
  'You asked for nothing, and then for home. Home was the only thing it had.': 'Ты просил «ничего», а потом попросился домой. Дом — единственное, что у него было.',
  'The golden fish dries in the bottom of the boat. It stops asking before you do.': 'Золотая рыбка сохнет на дне лодки. Она перестаёт просить раньше, чем ты.',
  'The golden fish circles you all night, glowing less each time.': 'Золотая рыбка всю ночь кружит вокруг тебя и с каждым кругом светится слабее.',
  'The lake keeps talking. You stop answering.': 'Озеро всё говорит. Ты больше не отвечаешь.',
  'The sea keeps talking. You stop answering.': 'Море всё говорит. Ты больше не отвечаешь.',
  'Someone breathes behind you all night. You do not turn around.': 'Всю ночь кто-то дышит у тебя за спиной. Ты не оборачиваешься.',
  'The day never ends. It never begins either.': 'День не кончается никогда. Но и не начинается.',
  'The knocking goes on all night. Nobody opens.': 'Стук не стихает всю ночь. Никто не открывает.',
  'You asked for nothing twice. Here it is.': 'Ты дважды попросил «ничего». Вот оно.',
  'There is someone in the stern. You do not ask. You row.': 'На корме кто-то есть. Ты не спрашиваешь. Ты гребёшь.',
  'Someone swims behind you. You do not ask.': 'Кто-то плывёт за тобой. Ты не спрашиваешь.',
  'The cabin goes dark. The knocking stops. You don’t go back to see why.': 'В избушке гаснет свет. Стук прекращается. Ты не возвращаешься узнать почему.',
  'You lifted it over the side. It let you.': 'Ты опустил рыбку за борт. Она позволила.',
  'You let it go. It let you.': 'Ты отпустил рыбку. Она позволила.',
  'Dawn comes anyway. You did not ask for it.': 'Рассвет всё равно приходит. Ты его не просил.',
  'Dawn comes anyway, over nothing.': 'Рассвет всё равно приходит — над пустым морем.',
  'You can still hear them from the shore. You stop listening.': 'С берега их всё ещё слышно. Ты перестаёшь слушать.',
  'You asked once for nothing. It kept count.': 'Один раз ты попросил «ничего». Оно вело счёт.',
  'Twice you said nothing. The knife said it a third time.': 'Дважды ты сказал «ничего». В третий раз это сказал нож.',
  'The golden fish stays with you. It is the only light that answers.': 'Золотая рыбка остаётся с тобой. Это единственный свет, который отвечает.',
  'The lake keeps talking about him.': 'Озеро всё говорит о нём.',
  'The day did not end. Now it will not begin.': 'День не кончился. Теперь он не начнётся.',
  'The golden fish goes down with you. It knows the way.': 'Золотая рыбка опускается вместе с тобой. Она знает дорогу.',
  'Someone comes down after you. You do not look back.': 'Кто-то спускается следом за тобой. Ты не оглядываешься.',
  'It went over the side on its own. You let it.': 'Рыбка сама ушла за борт. Ты не стал мешать.',
  'The golden fish went in with you. It had been in before.': 'Золотая рыбка оказалась внутри вместе с тобой. Она там уже бывала.',
  'There is a bait in your pocket. It has an eye.': 'У тебя в кармане наживка. У неё есть глаз.',
  'You asked for nothing.': 'Ты ничего не просил.',
  'You asked for nothing, once. And for:': 'Один раз ты попросил «ничего». А ещё ты просил:',
  'You asked for:': 'Ты просил:',
  'Someone to sit with me': 'Кого-нибудь, кто посидит со мной',
  'Take me where the fish are': 'Отвези меня туда, где рыба',
  'A home on the shore': 'Дом на берегу',
  'Make this day last forever': 'Пусть этот день останется навсегда',
  'Let me hear the fish': 'Дай мне слышать рыб',
  'A boat full of gold': 'Полную лодку золота',
  'someone to sit with you': 'кого-нибудь, кто посидит с тобой',
  'where the fish are': 'туда, где рыба',
  'a home on the shore': 'дом на берегу',
  'a day that never ends': 'день без конца',
  'to hear the fish': 'слышать рыб',
  'a boat full of gold': 'полную лодку золота',
  'Everything you asked for. ': 'Всё, что ты просил. ',
  ' And forever. Your words, not mine.': ' И навсегда. Твои слова, не мои.',
  'You light the lantern. The shore does not.': 'Ты зажигаешь фонарь. Берег — нет.',
  'You light the lantern.': 'Ты зажигаешь фонарь.',
  'The sun sets the way suns do.': 'Солнце садится, как и положено солнцу.',
  'The sun slips into the ': 'Солнце соскальзывает в ',
  ' like a coin into a well.': ', как монета в колодец.',
  'lake': 'озеро',
  'sea': 'море',
  'Something rises where the sun went down.': 'Там, где село солнце, что-то поднимается.',
  'Something gold slips by you on the way down.': 'Что-то золотое проскальзывает мимо тебя по пути вниз.',
  'Something gold circles you. It has time.': 'Что-то золотое кружит вокруг тебя. Ему некуда спешить.',
  'Something gold circles the boat. It has time.': 'Что-то золотое кружит вокруг лодки. Ему некуда спешить.',
  'The line goes slack.': 'Леска провисает.',
  'You let the golden fish go.': 'Ты отпускаешь золотую рыбку.',
  'You lift the golden fish over the side.': 'Ты опускаешь золотую рыбку за борт.',
  'The float lands on something that is not water.': 'Поплавок ложится на что-то. Это не вода.',
  'The lake stays glass.': 'Озеро стоит как стекло.',
  'The water goes very still.': 'Вода совсем замирает.',
  'The water goes very still. The fish in the boat does not.': 'Вода совсем замирает. Рыбка в лодке — нет.',
  'The water goes very still again.': 'Вода снова замирает.',
  'The water goes very still. The flame leans toward it.': 'Вода совсем замирает. Пламя клонится к ней.',
  'The water goes very still. The flame leans toward the fish.': 'Вода совсем замирает. Пламя клонится к рыбке.',
  'The water goes very still. The flame leans to your feet.': 'Вода совсем замирает. Пламя клонится к твоим ногам.',
  'Someone knocks on the cabin door.': 'Кто-то стучит в дверь избушки.',
  'The knocking again. Slower.': 'Опять стучат. Медленнее.',
  'The line snapped.': 'Леска лопнула.',
  'The line snapped. Let go when it pulls.': 'Леска лопнула. Отпускай, когда рыба рвётся.',
  'It slipped away. Cast again.': 'Сорвалась. Забрасывай снова.',
  'It slipped the hook.': 'Сорвалась с крючка.',
  'Too early.': 'Рано.',
  'Too early. Nothing was biting yet.': 'Рано. Ещё не клевало.',
  'Test mode on': 'Тестовый режим включён',
  'Test mode off': 'Тестовый режим выключен',
  'Golden fish': 'Золотая рыбка',
  'The lake': 'Озеро',
  'The sea': 'Море',
  'Nothing on the lake is moving except you.': 'На озере ничего не движется, кроме тебя.',
  'The stranger’s bait. Cursed or blessed, he said. It has an eye.': 'Наживка того незнакомца. На беду или на удачу, сказал он. У неё есть глаз.',
  'Something interesting, for once.': 'Хоть бы раз что-нибудь интересное.',
  'First time out here. Look at that sun.': 'Первый раз здесь. Ты посмотри, какое солнце.',
  'I could stay out here forever.': 'Я бы остался здесь навсегда.',
  'Wait. Don’t gut me, fisherman.': 'Постой. Не потроши меня, рыбак.',
  'Back out already? It doesn’t usually let go.': 'Уже снова здесь? Оно обычно не отпускает.',
  'You cut the line last time. It’s the same line.': 'В прошлый раз ты перерезал леску. Леска всё та же.',
  'You again. Or someone wearing you.': 'Опять ты. Или кто-то в твоей шкуре.',
  'Something interesting, you said. Here I am.': 'Что-нибудь интересное — так ты сказал. Вот она я.',
  'Put me back and I’ll grant you a wish. Three, if you’re patient.': 'Отпусти меня — исполню желание. А наберёшься терпения — три.',
  'Let it go': 'Отпустить',
  'Keep it': 'Оставить себе',
  'You lift it into the boat. It is heavier than a fish.': 'Ты поднимаешь её в лодку. Она тяжелее, чем бывает рыба.',
  'Cold hands. He had cold hands too.': 'Холодные руки. У него тоже были холодные руки.',
  'Keep me, then. The wish comes anyway.': 'Что ж, оставь меня себе. Желание всё равно сбудется.',
  'Kind. Nobody kind comes out this far alone.': 'Добрый ты. Никто из добрых не заплывает так далеко в одиночку.',
  'First time here, you said. You said that last time too.': 'Первый раз здесь — так ты сказал. Ты и в прошлый раз так говорил.',
  'First time here, you said. Nobody comes here twice.': 'Первый раз здесь — так ты сказал. Никто не бывает здесь дважды.',
  'What would you like, fisherman?': 'Чего тебе надобно, рыбак?',
  'Nothing': 'Ничего',
  'Who?': 'Кого?',
  'Doesn’t matter. Someone': 'Неважно. Кого-нибудь',
  'Someone. You didn’t ask who.': 'Кого-нибудь. Ты не сказал, кого.',
  'If they ask you anything, don’t answer.': 'Если тебя о чём-то спросят — не отвечай.',
  'A home on the shore. One has just come free.': 'Дом на берегу. Один как раз освободился.',
  'Every light out here is for someone. That one is for you.': 'Каждый огонь здесь горит для кого-то. Этот — для тебя.',
  'A wish costs a little daylight. You said you could stay out here forever.': 'Желание стоит немного дневного света. Ты говорил, что остался бы здесь навсегда.',
  'You’ll get to.': 'Останешься.',
  'Where the fish are. I know a spot. Hold on to something.': 'Туда, где рыба. Знаю одно место. Держись крепче.',
  'Here. I wouldn’t cast while it’s under you. It’s been waiting longer than you have.': 'Здесь. Я бы не забрасывала, пока оно под тобой. Оно ждёт дольше, чем ты.',
  'Look how they all go the same way.': 'Смотри, все плывут в одну сторону.',
  'Nothing. Nobody asks for nothing. I’ll ask again.': 'Ничего. Никто не просит «ничего». Я спрошу ещё раз.',
  'You said you could stay out here forever. There’s time.': 'Ты говорил, что остался бы здесь навсегда. Время есть.',
  'You cast anyway. Habit. Still wanting nothing?': 'Всё равно закинул. Привычка. Всё ещё ничего не хочешь?',
  'You cast anyway. Habit. And this time?': 'Всё равно закинул. Привычка. А теперь чего?',
  'Back again. Still wanting nothing?': 'Снова ты. Всё ещё ничего не хочешь?',
  'Back so soon? I’d only just got down. And this time?': 'Уже вернулся? Я только до дна добралась. А теперь чего?',
  'Don’t mind the knocking. They’re not trying to get in.': 'Не обращай внимания на стук. Они не пытаются войти.',
  'Gold. A boat full of it': 'Золота. Полную лодку',
  'That’s twice you’ve said forever. It’s a long time for a sun.': 'Ты уже второй раз говоришь «навсегда». Для солнца это долго.',
  'This one is tired. I know one that never sets.': 'Это солнце устало. Я знаю другое, которое никогда не заходит.',
  'Listen, then. They all say the same thing.': 'Что ж, слушай. Они все говорят одно и то же.',
  'That was my first, too.': 'Это было и моё первое желание.',
  'That was my second, too.': 'Это было и моё второе желание.',
  ' This one costs the rest of the day.': ' За него ты отдашь остаток дня.',
  'You’ll miss the sun. I’ll bring you another.': 'Ты будешь скучать по солнцу. Я принесу тебе другое.',
  'Gold. A boat full of it.': 'Золота. Полную лодку.',
  'Sorry. Gold is heavy. You can always come back for it.': 'Прости. Золото тяжёлое. Ты всегда можешь за ним вернуться.',
  'Twice. Nobody asks for nothing twice. What are you?': 'Дважды. Никто не просит «ничего» дважды. Что ты такое?',
  'Full already? It’s a little late for that.': 'Уже сыт? Поздновато спохватился.',
  'Then the sun sets for free. You’ll miss it. I’ll bring you another.': 'Тогда солнце сядет даром. Ты будешь по нему скучать. Я принесу тебе другое.',
  'Will you stay?': 'Ты останешься?',
  'Yes': 'Да',
  'Say nothing': 'Промолчать',
  'He does not turn around.': 'Он не оборачивается.',
  'He goes back to watching the horizon.': 'Он снова смотрит на горизонт.',
  'The line goes taut. You did not feel a bite.': 'Леска натягивается. Поклёвки ты не почувствовал.',
  'One wish left. You said forever, then asked for nothing twice.': 'Осталось одно желание. Ты сказал «навсегда», а потом дважды попросил «ничего».',
  'It wants to see why.': 'Оно хочет разглядеть, зачем.',
  'I’m right here, fisherman.': 'Я здесь, рыбак. Совсем рядом.',
  'One wish left. But first, the sun I promised you.': 'Осталось одно желание. Но сначала — солнце, которое я тебе обещала.',
  'You said forever. I passed that on.': 'Ты сказал «навсегда». Я передала.',
  'You said forever, then you wished for it. I listened twice.': 'Ты сказал «навсегда», а потом ещё и загадал это. Я услышала оба раза.',
  'You said forever. I listened.': 'Ты сказал «навсегда». Я услышала.',
  'i could stay out here forever. i could stay out here forever.': 'я бы остался здесь навсегда. я бы остался здесь навсегда.',
  'There it is. Forever, like you said.': 'Вот оно. Навсегда, как ты сказал.',
  'That bait was never for fish. I should have said.': 'Та наживка была вовсе не для рыбы. Надо было тебе сказать.',
  'Nobody rows this far to want nothing. So why are you here.': 'Никто не гребёт в такую даль, чтобы ничего не хотеть. Так зачем ты здесь.',
  'You said you’d stay.': 'Ты сказал, что останешься.',
  'Don’t answer it. Cut the line.': 'Не отвечай ей. Перережь леску.',
  'You answered him. I did ask you not to.': 'Ты ему ответил. А я ведь просила не отвечать.',
  'I’m sorry.': 'Прости.',
  'I sat where you sit. I said what you said. Three times.': 'Я сидела на твоём месте. Говорила твои слова. Трижды.',
  'I’d like to go home now. What would you like.': 'Я хочу домой. Чего тебе надобно.',
  'Let me go home': 'Отпусти меня домой',
  'Take the light away': 'Забери свет',
  'Cut the line': 'Перерезать леску',
  'Stay with him': 'Остаться с ним',
  'Let me get my gold': 'Дай мне забрать моё золото',
  'Let me in.': 'Впусти меня.',
  'Of course. They’ve been waiting to get out.': 'Конечно. Там давно ждут, чтобы их выпустили.',
  'Home. Yes. Come inside.': 'Домой. Да. Заходи.',
  'Thank you.': 'Спасибо.',
  'As you wish. Without light you won’t have to see the teeth.': 'Как пожелаешь. Без света тебе не придётся видеть зубы.',
  'Don’t leave me out here.': 'Не оставляй меня здесь.',
  'Don’t leave me in the boat.': 'Не оставляй меня в лодке.',
  'You reach for the knife in your belt.': 'Ты тянешься к ножу на поясе.',
  'You reach for the knife on the gunwale.': 'Ты тянешься к ножу на борту.',
  'No. Nobody cuts the—': 'Нет. Никто не перерезает ле—',
  'Stay with him. Two wishes, one seat.': 'Остаться с ним. Два желания, одно место.',
  'He said he’d stay with me.': 'Он сказал, что останется со мной.',
  'He said a lot of things.': 'Мало ли что он говорил.',
  'Stay.': 'Останься.',
  'It’s all still down there. Nobody comes back up with it.': 'Золото всё там же, внизу. Никто не поднимается с ним наверх.',
  'You say nothing.': 'Ты молчишь.',
  'It waits. Then it goes dark in the bottom of the boat.': 'Она ждёт. Потом гаснет на дне лодки.',
  'It waits. Then it splashes its tail once and goes down.': 'Она ждёт. Потом один раз бьёт хвостом и уходит в глубину.',
  'Look at that sun.': 'Ты посмотри, какое солнце.',
  'First time here.': 'Первый раз здесь.',
  'We could stay out here forever.': 'Мы бы остались здесь навсегда.',
  'Still there.': 'Всё ещё там.',
  'It’s coming back.': 'Оно возвращается.',
  'Don’t you want it to?': 'А ты разве не хочешь?',
  'First time here. You said that last time.': 'Первый раз здесь. Ты и в прошлый раз так говорил.',
  'You said.': 'Ты же сказал.',
  'Cut the line.': 'Перережь леску.',
  'Tap to cast': 'Нажми, чтобы забросить',
  'Wait for the float to go under': 'Жди, пока поплавок уйдёт под воду',
  'Tap now': 'Подсекай',
  'Hold to reel. Let go when it pulls hard.': 'Держи, чтобы тянуть. Отпускай, когда рыба рвётся.',
  'Hold to reel': 'Держи, чтобы тянуть',
  '1 fish': '1 рыба',
  ' fish': ' рыб',
  'Endings found: ': 'Найдено концовок: ',
  ' of ': ' из ',
  'not found': 'не найдена',
  'Unmute': 'Со звуком',
  ' (test build)': ' (тестовая сборка)', // the test build tab title (build.js --test)
};
// The counter's plural forms: 1 рыба, 2-4 рыбы, 5+ рыб.
const RU_FISH = ['рыба', 'рыбы', 'рыб'];
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const tr = s => (LANG === 'ru' && s && hasOwn(RU, s) ? RU[s] : s);
const trJoin = parts => parts.map(tr).join('');
function ruPlural(n, forms) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? forms[1] : forms[2];
}
// The HUD counter, the card's weight (a decimal comma in Russian) and the endings counter.
const countText = n => (n <= 0 ? '' : LANG === 'ru' ? n + ' ' + ruPlural(n, RU_FISH) : n === 1 ? '1 fish' : n + ' fish');
const kgText = w => (LANG === 'ru' ? w.toFixed(2).replace('.', ',') : w.toFixed(2)) + tr(' kg');
const foundText = n => tr('Endings found: ') + n + tr(' of ') + ENDING_COUNT;

// ---------------------------------------------------------------- state
const WS = {};
function resetWS() {
  Object.assign(WS, {
    mood: 0, dim: 0, sunX: SUNX, sunY: SUN0Y, sunR: 8, sunKind: 0, sunGlow: 1, horizGlow: 1, lid: 0,
    pupil: 0, pupilDx: 0, stalk: 0, stalkCut: 0, troubled: 0, starA: 0, lantern: 0, lanternFlicker: 1,
    jaw: 0, companion: 0, companionTurn: 0, cabin: 0, cabinLit: 1, cabinKnock: 0, fishShadows: 0, gold: 0, boatX: 0, ash: 0,
    lineCut: false, goldFish: null,
    // story bible, section 3. goldKept is the fish in the boat; boatSunk the gold sink (1: the boat is gone and
    // the fisherman swims); far the ocean camera pull-back (0 to 1 and back); sea the mountains gone (0 to 1,
    // then held at 1 for the rest of the run).
    goldKept: 0, boatSunk: 0, frozen: 0, far: 0, sea: 0, eyes: 0, farBoat: 0,
    // Phase 25, Swallowed as one lunge: bulge the water heaving round the speck before the head breaks it,
    // lunge the head's rise out of the sea (0 under, 1 up), gape its lower jaw dropped open (phase 27), gulp the
    // speck and a sheet of water tipping in (1: gone), streak the water streaming off it, slosh the water
    // closing over it (0 to 1, a heap that rises and falls), shed the sheets sliding off the snout (1 to 0).
    bulge: 0, lunge: 0, gape: 0, gulp: 0, streak: 0, slosh: 0, shed: 0,
    // Stay: companionStand swaps in the standing frame, leap is his progress along the parabola to the disc
    // (held at 1 while he rides it down), rock the boat's push-off wobble, lanternWarm widens the glow.
    companionStand: 0, leap: 0, rock: 0, lanternWarm: 0,
    // Phase 29: companionCrouch the crouch before the launch, cling him hanging from the disc's rim, strain the
    // line bowing and shivering under his weight (0 to 1, back to 0 as it snaps), eyeWide the eye widening
    // as he comes (the pupil and the iris grow).
    companionCrouch: 0, cling: 0, strain: 0, eyeWide: 0,
    // Phase 6: dive is the Deep descent (the horizon rises past the top and the mirror fills the frame);
    // glint is the gold pile's two-frame sparkle seen from beneath.
    dive: 0, glint: 0,
    shoalOut: 0, // the still-water dawn: the shoal steers to the horizon at full weight and leaves as it arrives
    // Phase 21, the Still water pictures: newShore the far coastline rising (sea, heard), farDrift the speck's
    // slow drift from the centre once the camera has pulled back (sea, not heard), goldBelow the one glint
    // under the swimmer when he wakes in the water again (lake, sunk).
    newShore: 0, farDrift: 0, goldBelow: 0,
    // Phase 30, Inside: push the camera's push-in toward the cabin door (0 to 1: zoom 1 to PUSH_Z, the
    // centre eased from the screen's to the door), door the cabin door open (the warm doorway and its glow).
    push: 0, door: 0,
  });
}
const G = {
  phase: 'title', t: 0, pt: 0, holding: false, bob: null, cast: null, wait: null, reel: null, land: null,
  rodA: REST_A, rodBend: 0, bobDip: 0, biteWin: 1, tip: { x: 110, y: 205 }, hand: { x: 136, y: 227 }, farRing: 0.6,
  lanternPos: { x: 124, y: 218 }, tutorial: 0, ringT: 0, hb: 0, hbGap: HB_GAP,
  capUntil: 0, thinkUntil: 0, thinkAt: -9, thinkMore: false, cardReady: false, thinkPending: [], knock: null,
  arrived: true, open: null, eyesDone: false, eyesAt: -9, frozeT: 0, inside: null,
};
// wishes holds granted wishes only, in order. kept, firstAsk, refused, answered, ocean, said and usedRepl follow
// the bible, section 3: said counts the fisherman's four act 0 lines that have shown (0 to 4), usedRepl the card replacements fired.
// casts counts casts for the opening captions; shown1 lists the species whose act 1 card was shown, for the act 2 pick.
const freshStory = () => ({
  act: 0, catches: 0, actCatches: 0, wishes: [], heard: false, goldenNext: false, lastSpecies: null,
  kept: false, firstAsk: null, refused: 0, answered: null, ocean: 'none', said: 0, usedRepl: [], casts: 0, shown1: [],
  keptNext: false, // kept, act 1: the next normal card closes into golden scene 2 from the boat
  actSeen: [], // species whose card showed this act, so a card never repeats within one act
  tap: 0, tapPool: '', // the companion's lines: how many of the current pool have shown, and which pool it was
  compSpoke: false, // the companion's one unprompted line this run (after the first act 1 card)
  openQ: [], // which of the act 0 thoughts (OPENING_CAPS keys) have been queued, so each shows once
  snaps: 0, // lines snapped this run: the first one teaches
});
const STORY = freshStory();
const has = w => STORY.wishes.indexOf(w) >= 0;
// Across runs (bible, section 7): completed runs and the last ending, from storage plus this session.
const RUN = { count: 0, last: null };
const isLaterRun = () => RUN.count > 0;

// ---------------------------------------------------------------- UI (DOM in browser, stub elsewhere)
let UI = null;
// prefers-reduced-motion, read in boot: no glow flash at the Stay impact, no boat rock, and the camera moves
// (the ocean pull-back and return, the Deep descent) take CAM_SOFT times as long.
let REDUCED_MOTION = false;
const CAM_SOFT = 1.5;
const camDur = d => (REDUCED_MOTION ? d * CAM_SOFT : d);
function stubUI() {
  const log = [];
  const f = name => (...a) => log.push([name, ...a]);
  return {
    log, choices: null,
    prompt: f('prompt'), caption: f('caption'), count: f('count'),
    card: f('card'), cardHide: f('cardHide'),
    // The panel's text types out a character at a time: one 'dialogue' entry per line, grown in place as it
    // types, so the log holds each line whole. Every menu is logged as a 'choices' entry of its labels.
    dlgShow: f('dlgShow'),
    dlgText(t) {
      const e = log[log.length - 1];
      if (e && e[0] === 'dialogue' && t.startsWith(e[1])) log[log.length - 1] = ['dialogue', t];
      else if (t) log.push(['dialogue', t]);
    },
    dlgChoices(list) { this.choices = list; if (list) log.push(['choices', list.map(c => c.label)]); },
    dlgMore() {}, dlgBusy() {}, dlgHide: f('dlgHide'), thinkMore() {}, cardReady() {},
    // The thought bubble: logged as 'think' entries; its choices (the companion's question) go in choices.
    think(text, opts) {
      log.push(['think', text, opts && opts.side || 'fisherman']);
      if (opts && opts.choices) { this.choices = opts.choices; this.thinkOwns = true; log.push(['choices', opts.choices.map(c => c.label)]); }
    },
    thinkHide() { if (this.thinkOwns) { this.choices = null; this.thinkOwns = false; } },
    title: f('title'), ending: f('ending'), endingHide: f('endingHide'), fade: f('fade'), colors() {},
  };
}

// ---------------------------------------------------------------- tweens
const TW = [];
function untween(obj, key) {
  for (let k = TW.length - 1; k >= 0; k--) if (TW[k].obj === obj && TW[k].key === key) TW.splice(k, 1);
}
function tween(obj, key, to, dur, ease, done) {
  untween(obj, key);
  TW.push({ obj, key, from: obj[key], to, dur: Math.max(0.001, dur), t: 0, ease: ease || E.io, done });
}
function updTweens(dt) {
  for (let k = TW.length - 1; k >= 0; k--) {
    const w = TW[k];
    if (!w) continue;
    w.t += dt;
    const p = Math.min(1, w.t / w.dur);
    w.obj[w.key] = lerp(w.from, w.to, w.ease(p));
    if (p >= 1) { const i = TW.indexOf(w); if (i >= 0) TW.splice(i, 1); if (w.done) w.done(); }
  }
}

// ---------------------------------------------------------------- particles, rings, ambient life
const PARTS = [], RINGS = [], ASH = [], SHAD = [], BIRDS = [];
let birdTimer = 3, jumpTimer = 5;
function splash(x, y, n) {
  for (let k = 0; k < n; k++) PARTS.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 45, life: 0, max: 0.9, v: Math.random() < 0.5 ? 11 : 10, floor: y, g: 140 });
}
function sparkle(x, y) {
  PARTS.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: -6 - Math.random() * 6, life: 0, max: 0.6 + Math.random() * 0.5, v: 16, floor: 9999, g: 0, blink: true });
}
function updParts(dt) {
  for (let k = PARTS.length - 1; k >= 0; k--) {
    const p = PARTS[k];
    p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life > p.max || (p.g > 0 && p.vy > 0 && p.y >= p.floor)) PARTS.splice(k, 1);
  }
}
// sc scales its spread; a dark ring (the far boat’s tracking cue) shades the water down instead of up, so it
// reads on the bright glare under the sun.
function ring(x, y, big, sc = 1, dark = false) { RINGS.push({ x, y, r: 1, v: (big ? 26 : 12) * sc, life: 0, max: big ? 2.6 : 1.6, dark }); }
// A bubble: a small round ring that grows a little and pops (the gold sink).
function bubble(x, y) { RINGS.push({ x, y, r: 1, v: 3, life: 0, max: 0.5 + Math.random() * 0.4, round: true }); }
function updRings(dt) {
  // Frozen only stops the jump spawn (updJumps, bible 8c); a ring in flight still spreads and fades.
  for (let k = RINGS.length - 1; k >= 0; k--) {
    const r = RINGS[k];
    r.life += dt;
    r.r += r.v * dt * (1 - (r.life / r.max) * 0.6);
    if (r.life > r.max) RINGS.splice(k, 1);
  }
}
function updAsh(dt) {
  const want = Math.round(WS.ash * 70);
  while (ASH.length < want) ASH.push({ x: Math.random() * W, y: -Math.random() * 60, vy: 5 + Math.random() * 8, ph: Math.random() * 6.28, end: HY + 8 + Math.random() * (H - HY - 20) });
  for (let k = ASH.length - 1; k >= 0; k--) {
    const a = ASH[k];
    a.y += a.vy * dt;
    a.x += Math.sin(G.t * 0.8 + a.ph) * 4 * dt;
    if (a.y > a.end) {
      if (ASH.length > want) ASH.splice(k, 1);
      else { a.y = -2; a.x = Math.random() * W; }
    }
  }
}
// The shoal. Every shadow faces the horizon from the moment it spawns and drifts toward the sun's
// column; one that reaches the horizon comes back in at the bottom, so they all keep going the same way.
const SHAD_TOP = HY + 12;
function shadowHeading(s) { return Math.atan2(HY - 200 - s.y, WS.sunX - s.x); }
function spawnShadows() {
  SHAD.length = 0;
  for (let k = 0; k < 16; k++) {
    const s = { x: Math.random() * W, y: HY + 16 + Math.random() * (H - HY - 40), a: 0, sp: 6 + Math.random() * 8, dir: 1 };
    s.a = shadowHeading(s) + (Math.random() - 0.5) * 0.6;
    s.dir = Math.cos(s.a) >= 0 ? 1 : -1;
    SHAD.push(s);
  }
}
function updShadows(dt) {
  if (!WS.fishShadows) return;
  for (let k = SHAD.length - 1; k >= 0; k--) {
    const s = SHAD[k];
    if (!WS.shoalOut) s.a += (hash2(s.x | 0, s.y | 0, (G.t * 2) | 0) - 0.5) * 1.2 * dt;
    s.a += Math.sin(shadowHeading(s) - s.a) * (WS.shoalOut ? 6 : 2) * dt;
    if (Math.sin(s.a) > 0) s.a = -s.a; // never past horizontal: every shadow keeps moving toward the horizon
    s.x += Math.cos(s.a) * s.sp * dt;
    s.y += Math.sin(s.a) * s.sp * (WS.shoalOut ? 1.2 : 0.3) * dt; // at the dawn they hurry
    const cx = Math.cos(s.a);
    if (Math.abs(cx) > 0.15) s.dir = cx >= 0 ? 1 : -1;
    if (s.x < -10) s.x = W + 8;
    if (s.x > W + 10) s.x = -8;
    if (s.y < SHAD_TOP) {
      if (WS.shoalOut) { SHAD.splice(k, 1); continue; } // bible, Still water: removed as they arrive
      s.y = H - 22 - Math.random() * 12; s.x = Math.random() * W; s.a = shadowHeading(s);
    }
    if (s.y > H - 20) s.y = H - 20;
  }
}
function spawnBirds() {
  const fromL = Math.random() < 0.5, y = 40 + Math.random() * 80, n = 2 + ((Math.random() * 3) | 0);
  for (let k = 0; k < n; k++) BIRDS.push({ x: fromL ? -8 - k * 9 : W + 8 + k * 9, y: y + (Math.random() - 0.5) * 12 + k * 3, vx: (fromL ? 1 : -1) * (14 + Math.random() * 4), ph: Math.random() * 3 });
}
// Birds only while it is day, the shore is there and the day is not frozen (bible, 8c). Frozen, they hang.
const birdsHidden = () => WS.sea > 0.5 || WS.far > 0.5;
function updBirds(dt) {
  if (WS.frozen) return;
  birdTimer -= dt;
  if (birdTimer <= 0 && WS.mood < 0.5 && !birdsHidden()) { birdTimer = 10 + Math.random() * 14; spawnBirds(); }
  for (let k = BIRDS.length - 1; k >= 0; k--) {
    const b = BIRDS[k];
    b.x += b.vx * dt;
    b.y += Math.sin(G.t * 2 + b.ph) * 2 * dt;
    if (b.x < -40 || b.x > W + 40) BIRDS.splice(k, 1);
  }
}
function updJumps(dt) {
  jumpTimer -= dt;
  if (jumpTimer <= 0) {
    jumpTimer = 5 + Math.random() * 9;
    // Bible, 8c: not while frozen, far or in a cinematic; and not while the water is 'very still' (a golden
    // cast pending) or the fish is talking.
    const still = DLG.active || STORY.goldenNext || STORY.keptNext;
    if (WS.mood < 1.2 && !WS.frozen && WS.far === 0 && G.phase !== 'cine' && !still) {
      const x = 14 + Math.random() * (W - 28), y = HY + 12 + Math.random() * (H - HY - 60);
      splash(x, y, 4); ring(x, y);
    }
  }
}

// ---------------------------------------------------------------- rendering
// The mountains sink toward the horizon (bible, Ocean): their height is scaled by 1 - sea. Output row y
// samples the source row that high above the horizon; past sea 0.98 nothing of them remains, and sea is
// never cleared, so every reader of MOUNT goes through here and tolerates an empty shore.
function mountShift(x, y, inv) {
  const ys = HY - Math.round((HY - y) * inv);
  return ys < 0 ? 255 : MOUNT[ys * W + x];
}
const seaGone = () => WS.sea > 0.98;
function mountIdx(x, y) {
  const sea = WS.sea;
  if (sea <= 0) return MOUNT[y * W + x];
  if (sea > 0.98) return 255;
  return mountShift(x, y, 1 / (1 - sea));
}
function renderTop(t) {
  cloudTick();
  const sea = WS.sea, shifted = sea > 0, gone = seaGone(), inv = 1 / Math.max(0.02, 1 - sea);
  const sx = WS.sunX, sy = WS.sunY, sr = WS.sunR;
  const glow = WS.sunGlow, hg = WS.horizGlow;
  const red = WS.sunKind === 1;
  const g1 = red ? 30 : 24, g2 = red ? 80 : 62;
  const i1 = 1 / (g1 * g1), i2 = 1 / (g2 * g2);
  const srr = (sr + 0.4) * (sr + 0.4);
  const lidH = sr * (1 - WS.lid);
  const L0 = CLOUDS[0], L1 = CLOUDS[1], idx0 = L0.idx, vis0 = L0.vis, idx1 = L1.idx, vis1 = L1.vis, xs0 = L0.xs, xs1 = L1.xs;
  for (let y = 0; y < HY; y++) {
    const ty = y / HY;
    const base = 4.1 + 4.5 * Math.pow(ty, 1.5);
    const dyh = HY - y;
    const hb = hg * 1.7 * Math.exp(-(dyh * dyh) / 700);
    const dy = y - sy, dy2 = dy * dy;
    const row = y * W;
    const row0 = L0.rb[y], row1 = L1.rb[y], rd0 = L0.rd[y], rd1 = L1.rd[y];
    const litY = SUN0Y - y; // a corridor edge this far above the sun is sun-lit where litY < 3.2 |dx|
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const m = gone ? 255 : shifted ? mountShift(x, y, inv) : MOUNT[i];
      if (m !== 255 && !shifted) { TOP[i] = m; continue; }
      const dx = x - sx, d2 = dx * dx + dy2;
      const g = glow * (2.1 * Math.exp(-d2 * i1) + 1.2 * Math.exp(-d2 * i2)) + hb * Math.exp(-(dx * dx) / 4500);
      let bx = xs0[x] + rd0; if (bx >= CW) bx -= CW;
      let cp = row0 + bx, c = row0 < 0 ? 255 : idx0[cp], cv = vis0;
      if (c === 255 && row1 >= 0) { bx = xs1[x] + rd1; if (bx >= CW) bx -= CW; cp = row1 + bx; c = idx1[cp]; cv = vis1; }
      let v = -1;
      if (c !== 255) {
        const k = KCOR[i], vv = cv[cp];
        if (k > vv) { // in the corridor a cloud pixel shows only where enough of it is left, and the cut gets a rim
          if (k < 255 && k < vv * 1.2333) c = litY < 3.2 * Math.abs(x - SUNX) ? 11 : c > 0 ? c - 1 : 0;
          v = ci(dith(c + g * 0.55, x, y));
        }
      }
      if (v < 0) v = sr > 0 && d2 <= srr && Math.abs(dy) <= lidH ? sunPix(dx, dy, d2) : ci(dith(base + g, x, y));
      TOP[i] = m === 255 ? v : ci(dith(m + (v - m) * sea, x, y)); // a sinking mountain blends toward the sky behind it
    }
  }
}

// The white sun: a bright disc with a rim a shade darker. Once the sky starts to darken (the sunset and the
// still-water dawn) its halo reaches the top of the ramp, and a darker rim read as a hollow ring; there the
// disc takes the star white (index 20, above the ramp) with an index 11 rim, so it reads as a solid coin.
const SUN_SOLID_MOOD = 0.04;
// Stay: as he comes the eye widens, the pupil slit by up to EYE_WIDE_PX a side and the pale iris by a fifth.
const EYE_WIDE_PX = 3, EYE_WIDE_IRIS = 0.2;
function sunPix(dx, dy, d2) {
  const r = WS.sunR;
  if (WS.sunKind === 0) {
    const rim = d2 > (r - 1) * (r - 1);
    return WS.mood > SUN_SOLID_MOOD ? (rim ? 11 : 20) : (rim ? 10 : 11);
  }
  const ir = r * (0.5 + EYE_WIDE_IRIS * WS.eyeWide);
  let v = d2 > (r - 1.6) * (r - 1.6) ? 8 : d2 < ir * ir ? 10 : 9;
  if (WS.pupil > 0.01) {
    const ph = r * 0.84, px = dx - WS.pupilDx;
    if (Math.abs(dy) < ph) {
      const half = WS.pupil * (2.3 + EYE_WIDE_PX * WS.eyeWide) * Math.sqrt(1 - (dy * dy) / (ph * ph));
      const ax = Math.abs(px);
      if (ax <= half) v = 1; else if (ax <= half + 1.1) v = 6;
    }
  }
  return v;
}
function stampTop(s, x0, y0, alpha) {
  for (let j = 0; j < s.h; j++) {
    const y = y0 + j;
    if (y < 0 || y >= HY) continue;
    for (let i = 0; i < s.w; i++) {
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      const v = s.data[j * s.w + i];
      if (v === 255) continue;
      if (alpha !== undefined && alpha < 1 && hash2(i + 3, j + 5, 11) > alpha) continue;
      TOP[y * W + x] = v;
    }
  }
}
const CABIN_X = 62, CABIN_Y = HY - 12;
const cabinSprite = () => WS.door > 0.5 ? CABIN_OPEN : WS.cabinLit < 0.5 || WS.cabinKnock > 0.5 ? CABIN_DARK : CABIN;
function topExtras(t) {
  if (WS.starA > 0.02) {
    for (const s of STARS) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.s + s.p);
      if (s.b * 0.7 + (1 - tw) * 0.3 < WS.starA && TOP[s.i] < 8 && mountIdx(s.x, s.y) === 255 && cloudIdx(s.x, s.y) === 255) TOP[s.i] = 20;
    }
  }
  const bt = WS.frozen ? G.frozeT : t; // frozen, the wings hold too
  if (!birdsHidden()) for (const b of BIRDS) stampTop(BIRD[((bt * 5 + b.ph) | 0) & 1], b.x | 0, b.y | 0);
  // The building fades with the mountains; its window goes dark on its own (cabinLit, the still-water dawn).
  drawNewShore();
  if (WS.cabin > 0 && !seaGone()) stampTop(cabinSprite(), CABIN_X, CABIN_Y, WS.cabin * (1 - WS.sea) * (1 - insideSwap()));
  // The far boat reflects for free, and stays through the opening's dip to black (it leaves behind full black).
  if (WS.farBoat > 0 && (G.phase === 'title' || (G.open && G.open.stage === 0))) stampTop(FARBOAT, FAR_X, HY - FARBOAT.h);
  drawLunge(t); // Swallowed: the head is in the sky buffer, so it reflects
  if (WS.stalk > 0) drawStalk(t);
}
// The line holding the sun. Stay: under his weight it bows toward the stern and shivers (strain), and after
// the snap the loose upper part keeps whipping as it recoils (strain dies out while stalkCut rises).
const STALK_BOW = 5, STALK_SHIVER = 1.3;
function drawStalk(t) {
  const yEnd = WS.sunY - WS.sunR * 0.9, st = WS.strain;
  const y1 = yEnd * WS.stalk * (1 - WS.stalkCut), iy = 1 / Math.max(1, yEnd);
  for (let y = 0; y < Math.min(HY, y1); y++) {
    const f = y * iy;
    let x = WS.sunX + Math.sin(y * 0.04 + t * 0.9) * 0.8 * f;
    if (st > 0) x += st * (STALK_BOW * Math.sin(Math.PI * f) + Math.sin(t * 71 + y * 0.45) * STALK_SHIVER * f);
    x = Math.round(x);
    if (x >= 0 && x < W && mountIdx(x, y) === 255) TOP[y * W + x] = 1;
  }
}
// The sun's reflection is one pixel larger than the disc (bible, 8c). The white sun is redrawn in the
// water with the sunPix rule at radius sr + 1 (fill and rim both a pixel further out); the red sun,
// whose pupil must stay as mirrored, only gets a rim in its edge colour outside the disc.
function sunRing(y, row, src, ixr, dyS, darkF, haze) {
  const srow = src * W;
  const sx = WS.sunX, sr = WS.sunR, r0 = (sr + 0.4) * (sr + 0.4), r1 = (sr + 1.4) * (sr + 1.4);
  const white = WS.sunKind === 0, fill2 = sr * sr, dy2 = dyS * dyS;
  const x0 = Math.max(0, Math.floor(sx - sr - 2 - ixr)), x1 = Math.min(W - 1, Math.ceil(sx + sr + 2 - ixr));
  for (let x = x0; x <= x1; x++) {
    const sxp = clamp(x + ixr, 0, W - 1), dx = sxp - sx, d2 = dx * dx + dy2;
    if (d2 > r1 || (!white && d2 <= r0)) continue;
    const si = srow + sxp;
    if (mountIdx(sxp, src) !== 255 || TOP[si] >= 12) continue;
    const v = white ? (d2 > fill2 ? 10 : 11) : 8;
    FRAME[row + x] = ci(dith(v - darkF + haze, x, y));
  }
}
// The Deep descent (bible, section 8): the horizon row rises past the top of the screen with WS.dive, and
// the mirror's source rows are spread so the whole sky fills the growing water region. At dive 0 the
// horizon is HY and every source row maps one to one, as before.
function waterTop() { return WS.dive > 0 ? Math.max(0, Math.round(HY - (HY + 6) * WS.dive)) : HY; }
function computeWater(t) {
  FRAME.set(TOP, 0);
  const tr = WS.troubled, hy = waterTop(), span = H - hy;
  const srcK = lerp(H - HY, HY, WS.dive) / span; // sky rows per water row: 1 at rest, the whole sky over the whole frame at dive 1
  const sy = WS.sunY, sr = WS.sunR, lidH = sr * (1 - WS.lid);
  for (let y = hy; y < H; y++) {
    const k = (y - hy) / span;
    const amp = 0.35 + k * 1.5 + tr * (0.5 + k * 2.4);
    RIPX[y] = Math.round(Math.sin(y * 0.55 + t * 1.6 + Math.sin(y * 0.11 + t * 0.7) * 2.2) * amp);
    const oy = Math.round(Math.sin(y * 0.9 + t * 2.1) * (0.3 + tr * 0.9));
    let src = Math.round(HY - 1 - (y - hy) * srcK) + oy;
    if (src < 0) src = 0; else if (src > HY - 1) src = HY - 1;
    const darkF = 0.75 + k * 1.1 + tr * 0.4;
    const haze = 1.1 * Math.pow(1 - k, 8);
    const row = y * W, srow = src * W, ixr = RIPX[y];
    for (let x = 0; x < W; x++) {
      let sxp = x + ixr;
      if (sxp < 0) sxp = 0; else if (sxp >= W) sxp = W - 1;
      let v = TOP[srow + sxp];
      if (v < 12) v = ci(dith(v - darkF + haze, x, y));
      FRAME[row + x] = v;
    }
    const dyS = src - sy;
    if (sr > 0 && Math.abs(dyS) <= lidH + 1) sunRing(y, row, src, ixr, dyS, darkF, haze);
  }
  const hr = hy * W;
  for (let x = 0; x < W; x++) { const v = FRAME[hr + x]; if (v < 12) FRAME[hr + x] = ci(v + 2); }
  const gl = WS.sunGlow;
  for (let y = hy + 1; y < H; y++) {
    const k = (y - hy) / span;
    const wdt = WS.sunR + 3 + k * 26;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      if (vnoise(x * 0.09 + t * 0.35, y * 0.7 - t * 0.2, 17) > 0.78 - tr * 0.08 && FRAME[i] < 12) FRAME[i] = ci(FRAME[i] + 1);
      if (gl > 0.2 && Math.abs(x - WS.sunX) < wdt && hash2(x, y, (t * 7) | 0) > 0.955 && FRAME[i] < 12) FRAME[i] = ci(FRAME[i] + 2);
    }
  }
}
function drawRings() {
  for (const r of RINGS) {
    const fade = 1 - r.life / r.max;
    const add = fade > (r.dark ? 0.25 : 0.5) ? 2 : 1;
    const rx = r.r, ry = r.round ? r.r : r.r * 0.32;
    const n = Math.max(12, Math.ceil(rx * 5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.round(r.x + Math.cos(a) * rx), y = Math.round(r.y + Math.sin(a) * ry);
      if (y < HY || y >= H || x < 0 || x >= W) continue;
      if (hash2(k, (r.life * 10) | 0, 5) > fade + 0.3) continue;
      const i = y * W + x, u = FRAME[i];
      if (u < 12) FRAME[i] = ci(r.dark ? u - add : u + add);
    }
  }
}
// One fish shadow, size 1 being the shoal's. Larger ones (the ocean, 2x to 6x) get a flared tail. a dithers
// it away as it fades. Head toward dir.
function drawShadowShape(sx, sy, dir, size, a) {
  for (let k = -5 * size; k <= 4 * size; k++) {
    const kk = k / size, tail = kk * dir < -3;
    const hgt = tail ? (size >= 2 ? Math.round(size * 0.4 * (Math.abs(kk) - 3)) : 0) : Math.round(1.3 * size * Math.sqrt(Math.max(0, 1 - (kk / 4.6) * (kk / 4.6))));
    for (let j = -hgt; j <= hgt; j++) {
      const x = Math.round(sx + k), y = Math.round(sy + j);
      if (x < 0 || x >= W || y < HY || y >= H) continue;
      if (a < 1 && hash2(x, y, 3) > a) continue;
      const i = y * W + x, u = FRAME[i];
      if (u < 12) FRAME[i] = Math.max(0, u - 2);
    }
  }
}
function drawShadows() {
  if (!WS.fishShadows) return;
  for (const s of SHAD) drawShadowShape(s.x, s.y, s.dir, 1, 1);
}
// The ocean (bible, section 8): a dozen large shadows drifting to the horizon, then the big one.
const OCEAN = { shad: [], big: null, tr0: 0, hint: false };
function drawOceanShadows() {
  for (const s of OCEAN.shad) drawShadowShape(s.x, s.y, s.dir, s.size, s.a);
  if (OCEAN.big) drawBigShadow(OCEAN.big);
}
// The big one (phase 33, one fish in perspective). The boat is a speck on the horizon, so the fish under it is
// seen at a grazing angle: its head end lies flat along the horizon under the speck, squashed, and its body runs
// down and to the left toward the camera, thicker as it comes nearer, to a forked tail. b.x, b.y are the snout
// and the head end's centre row; b.t0 the head end's half thickness. The body's centre line drops BIG_DROP rows
// over BIG_LEN columns on a curve (q ** BIG_BEND, so it hugs the horizon near the head) and its half thickness
// grows from t0 to BIG_T1 the same way. k (1 at rest, down to SHADOW_IN) draws the body in toward the head end
// as it tips up to breach: foreshortened, and paler toward the tail as the tail goes down into the deep (BIG_SINK,
// a dithered gradient, so only the head end is left dark), while dk (0 to 1) darkens it BIG_DARK steps and
// thickens the head end by BIG_T0_UP. a is its presence: each shade step is dithered by it, so it fades as a
// whole and never grows past this size.
const BIG_LEN = 124, BIG_DROP = 56, BIG_T0 = 3.5, BIG_T1 = 20, BIG_BEND = 1.8, BIG_GROW = 1, BIG_T0_UP = 2.4;
const BIG_DARK = 2, SHADOW_IN = 0.5, BIG_SINK = 0.95;
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// Its plan shape at q along it (0 the snout, 1 the tail tips) and v across (in half thicknesses, negative toward
// the horizon): the darkness 0..1 inside, 0 outside. A blunt head, the body tapering to a narrow root, a forked
// tail, one swept-back dorsal on the far side and one slim pectoral near the head on the near side.
const BIG_ROOT = 0.8, BIG_FULL = 0.5, FIN_D = [0.34, 0.5, 0.6, 0.8], FIN_P = [0.16, 0.28, 0.45, 1.1];
function bigBodyH(q) {
  if (q < 0.12) { const s = (0.12 - q) / 0.12; return 0.45 + 0.55 * Math.sqrt(1 - s * s); }
  return q < BIG_FULL ? 1 : 1 - 0.68 * smooth01((q - BIG_FULL) / (BIG_ROOT - BIG_FULL));
}
function finAt(q, z, f) { // a swept-back fin: base f[0]..f[1], tip at q f[2], z f[3] out from the body
  if (z < 0 || z > f[3]) return false;
  const k = z / f[3];
  return q > f[0] + (f[2] - f[0]) * k && q < f[1] + (f[2] - f[1]) * k * k;
}
function bigShape(q, v) {
  if (q < 0 || q > 1) return 0;
  const av = Math.abs(v);
  if (q >= BIG_ROOT) { // the tail: flaring from the root, forked
    const tt = (q - BIG_ROOT) / (1 - BIG_ROOT), p = 0.32 + 0.55 * Math.pow(tt, 0.8), notch = 0.72 * Math.pow(tt, 2.2);
    return av < p && av > notch ? 0.45 + 0.3 * (1 - tt) : 0;
  }
  const h = bigBodyH(q);
  if (av < h) { const r = av / h; return 0.3 + 0.7 * (1 - r * r); }
  if (v < 0 && finAt(q, av - h, FIN_D)) return 0.5;
  if (v > 0 && finAt(q, av - h, FIN_P)) return 0.5;
  return 0;
}
// The live pose, from b: length, drop, head and tail half thickness.
function bigPose(b) {
  const k = b.k === undefined ? 1 : b.k, dk = b.dk || 0, r = clamp((k - SHADOW_IN) / (1 - SHADOW_IN), 0, 1);
  const t0 = (b.t0 === undefined ? BIG_T0 : b.t0) + dk * BIG_T0_UP;
  return { len: BIG_LEN * k, drop: BIG_DROP * k * k, t0, t1: lerp(t0, BIG_T1, r), sink: (1 - r) * BIG_SINK };
}
// Its centre row at column x (for the landing marker).
function bigRowAt(b, x) {
  const p = bigPose(b), q = clamp((b.x - x) / p.len, 0, 1);
  return b.y + p.drop * Math.pow(q, BIG_BEND);
}
// Per column (the ripple shifts a row by a few columns, so PAD either side): q along the body, the centre
// row, the half thickness and the presence left by the sink. Filled once a frame, so the pixel loop is cheap.
const BIG_PAD = 8, BIG_Q = new Float32Array(W + 2 * BIG_PAD), BIG_YC = new Float32Array(W + 2 * BIG_PAD);
const BIG_T = new Float32Array(W + 2 * BIG_PAD), BIG_A = new Float32Array(W + 2 * BIG_PAD);
function bigColumns(b, p, a) {
  for (let c = -BIG_PAD; c < W + BIG_PAD; c++) {
    const q = (b.x - c) / p.len, k = c + BIG_PAD;
    BIG_Q[k] = q;
    if (q < 0 || q > 1) continue;
    BIG_YC[k] = b.y + p.drop * Math.pow(q, BIG_BEND);
    BIG_T[k] = p.t0 + (p.t1 - p.t0) * Math.pow(q, BIG_GROW);
    BIG_A[k] = a * (1 - p.sink * Math.pow(q, 1.2));
  }
}
function drawBigShadow(b) {
  const a = b.a === undefined ? 1 : b.a;
  if (a <= 0) return;
  const p = bigPose(b), dk = (b.dk || 0) * BIG_DARK;
  const x0 = Math.max(0, Math.floor(b.x - p.len - 3)), x1 = Math.min(W - 1, Math.ceil(b.x + 3));
  const y1 = Math.min(H - 1, Math.ceil(b.y + p.drop + p.t1 * 1.4));
  if (x0 > x1) return;
  bigColumns(b, p, a);
  for (let y = HY + 1; y <= y1; y++) {
    const row = y * W, rk = clamp(RIPX[y], -BIG_PAD, BIG_PAD) + BIG_PAD;
    for (let x = x0; x <= x1; x++) {
      const k = x + rk, q = BIG_Q[k];
      if (q < 0 || q > 1) continue;
      const d = bigShape(q, (y - BIG_YC[k]) / BIG_T[k]);
      if (d <= 0) continue;
      const i = row + x, f = FRAME[i];
      if (f < 12) FRAME[i] = Math.max(0, f - Math.floor(((d > 0.7 ? 4 : d > 0.4 ? 3 : 2) + dk) * BIG_A[k] + BAYER[((y & 3) << 2) | (x & 3)]));
    }
  }
}
// Swallowed (bible, section 8, phase 27): the big one's head breaches round the speck, seen from the water at
// the horizon, drawn into TOP so it reflects. It is a fish in profile facing right (phase 32: the way its
// shadow swam in), tilted HEAD_ANG: the snout to the upper right and the body running down to the left into
// the sea. The frame is built facing left and mirrored about the speck (HEAD_M). It is built in its own frame (a along
// the body from the snout, b across it, + toward the belly): a blunt snout, a lower jaw hinged at the corner of
// the mouth that drops by gape so the gape is a dark wedge, a gill plate, a faint lateral line, sparse scales on
// the back, a paler throat, a lit rim along the top and the gold slit eye above the corner. lunge slides it up
// out of the sea along RISE and back down the same way, at the same angle.
const HEAD_ANG = 0.6, RISE_ANG = 1.25; // tilted up as it breaks the surface, snout first, easing to HEAD_ANG
const SNOUT_DX = -26, SNOUT_UP = 44, RISE_X = 0.25, RISE_Y = 0.97, RISE_LEN = 66;
const HEAD_LEN = 150, HEAD_B0 = -30, HEAD_B1 = 30; // the frame's box, along the body and across it
const FORE = 30, NOSE_B = 2, SNOUT_BACK = 4, BROW_B = -20, HUMP = 6, HUMP_A = 34, TAPER = 0.12; // the forehead, then the back
const LIP0 = 9, LIP1 = 3, JAW_C = 40, JAW_T = -1, JAW_DEEP = 9, CHIN_K = 1.2, GAPE_ANG = 0.62;
const MOUTH_RIM = 60, VENT0 = 12, VENT_K = 0.12, THROAT_A = 70;
const GILL_A = 52, GILL_BOW = 5, GILL_H = 15, LAT_B = -9, LAT_K = 0.04;
const RIM_A0 = 8, RIM_A1 = 90, BACK = 2, BELLY = 4, JAW_V = 3.6, THROAT_V = 4.4, SHUT = 0.15;
const lungeCx = () => Math.round(W / 2 + WS.farDrift);
const HEAD_M = -1; // the head faces right: screen x runs against the frame's
const lipB = a => LIP0 + (LIP1 - LIP0) * a / JAW_C; // the upper lip line (the lower lip too, shut)
const ventB = a => VENT0 + (a - JAW_C) * VENT_K;     // the belly behind the corner of the mouth
function topB(a) { // the upper outline: the heavy forehead from the snout, the nape's hump, the back tapering
  if (a < FORE) {
    const k = 1 - a / FORE;
    return NOSE_B - (NOSE_B - BROW_B) * (1 - k * k);
  }
  const h = a - FORE;
  return h < HUMP_A ? BROW_B - HUMP * (1 - Math.cos(h / HUMP_A * Math.PI)) / 2 : BROW_B - HUMP + (h - HUMP_A) * TAPER;
}
// The pose for this frame: the snout's screen point, the jaw's rotation, and the gape's front and throat lines.
const HP = { sx: 0, sy: 0, c: 1, s: 0, jc: 1, js: 0, ua: 0, ub: 0, ta: 0, tb: 0, fs: 0, ca: 0, cb: 0, va: 0, vb: 0, vs: 0 };
function jawToHead(la, lb) { // the lower jaw's frame (shut coordinates) to the head's, rotated about the corner
  const ja = la - JAW_C, jb = lb - LIP1;
  return { a: HP.jc * ja + HP.js * jb + JAW_C, b: -HP.js * ja + HP.jc * jb + LIP1 };
}
const headXY = (a, b) => ({ x: HP.sx + HEAD_M * (a * HP.c - b * HP.s), y: HP.sy + a * HP.s + b * HP.c });
const side = (pa, pb, qa, qb, a, b) => (qa - pa) * (b - pb) - (qb - pb) * (a - pa);
function headPose(cx) {
  const off = (1 - WS.lunge) * RISE_LEN, ph = WS.gape * GAPE_ANG;
  const ang = WS.gulp < 1 ? lerp(RISE_ANG, HEAD_ANG, E.io(WS.lunge)) : HEAD_ANG; // it sinks at the angle it holds
  HP.sx = cx + HEAD_M * (SNOUT_DX + off * RISE_X); HP.sy = HY - SNOUT_UP + off * RISE_Y; HP.c = Math.cos(ang); HP.s = Math.sin(ang);
  HP.jc = Math.cos(ph); HP.js = Math.sin(ph);
  const tip = jawToHead(JAW_T, lipB(JAW_T)), chin = jawToHead(JAW_T + CHIN_K * JAW_DEEP, lipB(JAW_T) + JAW_DEEP);
  HP.ua = SNOUT_BACK; HP.ub = lipB(SNOUT_BACK); HP.ta = tip.a; HP.tb = tip.b; HP.fs = Math.sign(side(HP.ua, HP.ub, tip.a, tip.b, JAW_C, LIP1));
  HP.ca = chin.a; HP.cb = chin.b; HP.va = THROAT_A; HP.vb = ventB(THROAT_A);
  HP.vs = Math.sign(side(chin.a, chin.b, THROAT_A, HP.vb, JAW_C, LIP1));
}
function inGape(a, b, la, lb) { // the wedge between the upper lip, the dropped lower lip and the open front
  return a < JAW_C && b > lipB(a) && lb < lipB(la) && side(HP.ua, HP.ub, HP.ta, HP.tb, a, b) * HP.fs > 0;
}
function underThroat(a, b) { // past the line from the chin to the belly: outside the head
  if (a >= HP.va) return b > ventB(a);
  return side(HP.ca, HP.cb, HP.va, HP.vb, a, b) * HP.vs < 0;
}
function gillIdx(a, b) { // the gill plate's curved edge, dark, with a lit lip in front of it
  const q = b / GILL_H;
  if (q * q >= 1) return -1;
  const e = a - (GILL_A + GILL_BOW * (1 - q * q));
  return e > -0.6 && e < 0.6 ? 0 : e > -2 && e <= -0.6 ? 4 : -1;
}
// The pectoral fin behind the gill plate, laid back along the flank: a paler fan with darker rays.
const FIN_A = 58, FIN_B = -6, FIN_L = 16, FIN_SLOPE = 0.3, FIN_W = 0.32;
function finIdx(a, b) {
  const fa = a - FIN_A, hw = 0.8 + fa * FIN_W, fb = b - FIN_B - fa * FIN_SLOPE;
  if (fa < 0 || fa > FIN_L * (1 - 0.25 * Math.abs(fb) / hw) || Math.abs(fb) > hw) return -1;
  return fa > 3 && Math.round(fb / hw * 2.5) % 2 === 0 && Math.abs(fb % 1) < 0.5 ? 4 : 5;
}
function upperIdx(x, y, a, b, d) { // the skull, upper jaw and body above the belly line
  const crown = a > RIM_A0 && a < RIM_A1;
  if (d < 1) return crown ? 7 : 5; // the lit rim, brightest on the crown facing the sun
  if (d < 2) return crown ? 4 : 3;
  if (a < JAW_C && lipB(a) - b < 1) return WS.gape > SHUT ? 4 : 1; // the upper lip's wet edge, or the shut seam
  const g = gillIdx(a, b);
  if (g >= 0) return g;
  const fin = finIdx(a, b);
  if (fin >= 0) return fin;
  if (a > GILL_A + GILL_BOW + 2 && Math.abs(b - LAT_B - (a - GILL_A) * LAT_K) < 0.5 && Math.round(a) % 4) return 4;
  return ci(dith(BACK + (BELLY - BACK) * clamp((b + 4) / 16, 0, 1), x, y));
}
function lowerIdx(x, y, dl) { // the lower jaw (its lip lit) and the pale throat under it
  if (dl < 1) return WS.gape > SHUT ? 5 : 3;
  if (dl < JAW_DEEP) return ci(dith(JAW_V, x, y));
  return dl < JAW_DEEP + 1 ? 2 : ci(dith(THROAT_V, x, y));
}
function headIdx(x, y) { // the head's index at a screen pixel, or -1
  const dx = HEAD_M * (x - HP.sx), dy = y - HP.sy, a = dx * HP.c + dy * HP.s, b = dy * HP.c - dx * HP.s;
  if (a < JAW_T - 1 || a > HEAD_LEN) return -1;
  const top = topB(a);
  if (b < top || (b > NOSE_B && a < SNOUT_BACK * ((b - NOSE_B) / (LIP0 - NOSE_B)) ** 2 && a < JAW_C && b <= LIP0)) return -1;
  const ra = a - JAW_C, rb = b - LIP1, la = HP.jc * ra - HP.js * rb + JAW_C, lb = HP.js * ra + HP.jc * rb + LIP1;
  if (inGape(a, b, la, lb)) return side(HP.ua, HP.ub, HP.ta, HP.tb, a, b) * HP.fs < MOUTH_RIM ? 0 : 19; // lit just inside
  if (a < JAW_C ? b <= lipB(a) : b <= ventB(a)) return upperIdx(x, y, a, b, b - top);
  const dl = lb - lipB(la);
  if (dl < 0 || la < JAW_T + CHIN_K * Math.min(dl, JAW_DEEP) || underThroat(a, b)) return -1;
  return lowerIdx(x, y, dl);
}
// Per column this frame: the head's top row (HY where it is absent) and whether it meets the sea there.
const HEAD_TOPS = new Int16Array(W), HEAD_FOOT = new Uint8Array(W);
const HEAD_BOX = { x0: 0, x1: -1 };
function headBox() {
  let x0 = W, x1 = -1, y0 = HY;
  for (const [a, b] of [[0, HEAD_B0], [HEAD_LEN, HEAD_B0], [0, HEAD_B1], [HEAD_LEN, HEAD_B1]]) {
    const p = headXY(a, b);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y);
  }
  return { x0: Math.max(0, Math.floor(x0)), x1: Math.min(W - 1, Math.ceil(x1)), y0: Math.max(0, Math.floor(y0)) };
}
function drawHead() {
  const bx = headBox();
  HEAD_TOPS.fill(HY); HEAD_FOOT.fill(0); HEAD_BOX.x0 = bx.x0; HEAD_BOX.x1 = bx.x1;
  for (let y = bx.y0; y < HY; y++) for (let x = bx.x0; x <= bx.x1; x++) {
    const v = headIdx(x, y);
    if (v < 0) continue;
    TOP[y * W + x] = v;
    if (y < HEAD_TOPS[x]) HEAD_TOPS[x] = y;
    if (y === HY - 1) HEAD_FOOT[x] = 1;
  }
}
// Sparse scales on the back: a few curved 2 px marks, a step lighter than the back, behind the gill plate.
const SCALE_DA = 8, SCALE_DB = 5, SCALE_V = 4;
function drawScales() {
  for (let a = GILL_A + GILL_BOW + 6, r = 0; a < HEAD_LEN; a += SCALE_DA, r++) {
    for (let b = topB(a) + 4 + (r & 1) * 2; b < LAT_B - 2; b += SCALE_DB) {
      if (hash2(a, b | 0, 53) > 0.55) continue;
      const p = headXY(a, b), x = Math.round(p.x), y = Math.round(p.y);
      if (y + 1 >= HY - 1 || x < 1 || x >= W - 1 || TOP[y * W + x] !== BACK) continue;
      TOP[y * W + x] = SCALE_V; TOP[(y + 1) * W + x - 1] = SCALE_V;
    }
  }
}
// One small gold eye above the corner of the mouth, the same slit eye as the bait: gold 13 to 16, a black slit.
const HEAD_EYE = [[-1, -1, 15], [0, -1, 19], [1, -1, 15], [-2, 0, 14], [-1, 0, 16], [0, 0, 19], [1, 0, 16], [2, 0, 14], [-1, 1, 13], [0, 1, 19], [1, 1, 13]];
const EYE_A = 34, EYE_B = -6;
function drawHeadEye() {
  const p = headXY(EYE_A, EYE_B), ex = Math.round(p.x), ey = Math.round(p.y);
  for (const [dx, dy, v] of HEAD_EYE) if (ey + dy < HY - 1 && ex + dx >= 0 && ex + dx < W) TOP[(ey + dy) * W + ex + dx] = v;
}
// Water pouring off it: short bright dashes that fall from the lower lip's tip, the chin, the underside toward
// the throat and the corner of the mouth, lengthening as they fall, two dashes per stream.
const STREAMS = 14, POUR_RATE = 1.6, DASH_MAX = 5, CORNER_FALL = 7;
function streamSrc(k) {
  const kind = k === 4 ? 4 : k % 4, f = hash2(k, 4, 41); // one stream from the corner, the rest from the jaw
  if (kind === 0) return jawToHead(JAW_T + 1 + f * 4, lipB(JAW_T));                    // over the lip's tip
  if (kind === 1) return { a: HP.ca + f * 2, b: HP.cb };                              // the chin
  if (kind === 4) return jawToHead(JAW_C - 2 - f * 3, lipB(JAW_C) + 1);                // the corner of the mouth
  const g = 0.15 + 0.5 * f;                                                            // the underside
  return { a: lerp(HP.ca, HP.va, g), b: lerp(HP.cb, HP.vb, g) };
}
function drawStreaks(t) {
  for (let k = 0; k < STREAMS; k++) {
    if (hash2(k, 1, 41) > WS.streak) continue;
    const s = streamSrc(k), p = headXY(s.a, s.b), x = Math.round(p.x), y0 = Math.round(p.y) + 1;
    const corner = k === 4, fall = corner ? Math.min(HY - y0, CORNER_FALL) : HY - y0; // the corner only drips
    if (fall < 3 || x < 0 || x >= W) continue;
    for (let n = 0; n < 2; n++) {
      const ph = (t * POUR_RATE + hash2(k, 3, 41) + n * 0.5) % 1, y = y0 + Math.round(ph * ph * fall);
      const len = corner ? 1 : 1 + Math.round(ph * DASH_MAX);
      for (let j = 0; j < len; j++) if (y - j >= y0 && y - j < y0 + fall) TOP[(y - j) * W + x] = j === 0 ? 11 : j < len - 1 ? 10 : 9;
    }
  }
}
// In the first half second of the rise (shed 1 to 0) sheets of water slide off the top of the snout, back down
// the crown and off the nose, thinning as they go.
const SHED_A0 = 0, SHED_A1 = 40, SHED_SLIDE = 14, SHED_DUR = 0.5;
function drawShed() {
  const k = WS.shed;
  if (k <= 0) return;
  const slide = (1 - k) * SHED_SLIDE, thick = k > 0.3 ? 2 : 1;
  for (let a = SHED_A0 + slide; a < SHED_A1 + slide; a += 0.6) {
    if (hash2(a * 2 | 0, 0, 61) > k + 0.2) continue;
    for (let j = 0; j < thick; j++) {
      const p = headXY(a, topB(a) + 0.5 + j), x = Math.round(p.x), y = Math.round(p.y);
      if (x >= 0 && x < W && y >= 0 && y < HY) TOP[y * W + x] = j ? 10 : 11;
    }
  }
}
// The pale water round the speck: while it rises the surface bulges into a low mound; once the mouth is open a
// sheet of water lies on the lower lip and pours into the wedge, sliding in with the speck (gulp) until gone.
const BULGE_W = 30, BULGE_H = 6, MOUND_H = 5, SHEET_A0 = 3, SHEET_A1 = 26, GULP_IN = 16, SLOSH_W = 22, SLOSH_H = 11, SLOSH_FOAM = 4;
function drawBulge(cx) { // behind the head: it shows either side of it while the head is still narrow
  if (WS.gulp > 0) return;
  const k = WS.bulge;
  for (let dx = -BULGE_W; dx <= BULGE_W; dx++) {
    const h = Math.round(BULGE_H * k * (1 - (dx * dx) / (BULGE_W * BULGE_W)));
    for (let j = 1; j <= h; j++) TOP[(HY - j) * W + cx + dx] = j === h ? 10 : 9;
  }
}
function drawSheet(t) {
  const g = WS.gulp, cov = WS.gape * (1 - g);
  if (cov <= 0.05) return;
  const s = g * GULP_IN, tk = (t * 10) | 0, mid = JAW_T + SPECK_LA + s;
  for (let la = SHEET_A0 + s; la < SHEET_A1 + s && la < JAW_C - 2; la += 0.5) {
    const top = Math.max(2, Math.round(MOUND_H - Math.abs(la - mid) * 0.5)); // heaped round the speck, so it shows
    for (let j = 1; j <= top; j++) {
      if (hash2(la * 2 | 0, j + tk, 23) > cov + (j === 1 ? 0.25 : j < top ? 0.1 : -0.2)) continue;
      const q = jawToHead(la, lipB(la) - j), p = headXY(q.a, q.b), x = Math.round(p.x), y = Math.round(p.y);
      if (x >= 0 && x < W && y >= 0 && y < HY) TOP[y * W + x] = j === top ? 11 : hash2(x, y, tk) > 0.3 ? 10 : 9;
    }
  }
}
// The water closing over it: a heap of sea at the horizon point that rises and falls back.
function drawSlosh(cx) {
  const h = SLOSH_H * Math.sin(Math.PI * WS.slosh), w = SLOSH_W * (0.6 + 0.4 * WS.slosh);
  for (let dx = -Math.ceil(w); dx <= w; dx++) {
    const c = Math.round(h * (1 - (dx * dx) / (w * w)) * (0.6 + 0.4 * hash2(dx, 0, 31))); // ragged, thrown up
    for (let j = 1; j <= c && cx + dx >= 0 && cx + dx < W; j++) TOP[(HY - j) * W + cx + dx] = j === c ? 10 : j === c - 1 ? 9 : 8;
  }
}
// The white foam collar where the body meets the sea: piled against it above the line (in TOP) and churned on
// the rows below it (after the mirror), 10 and 11 broken with 9.
const COLLAR_PAD = 2;
function nearFoot(x) {
  for (let k = -COLLAR_PAD; k <= COLLAR_PAD; k++) if (x + k >= 0 && x + k < W && HEAD_FOOT[x + k]) return true;
  return false;
}
const foamIdx = (x, j, tk) => { const h = hash2(x, j, tk); return h > 0.7 ? 11 : h > 0.3 ? 10 : 9; };
function drawCollar(t) {
  const tk = (t * 8) | 0;
  for (let x = HEAD_BOX.x0; x <= HEAD_BOX.x1; x++) {
    if (!nearFoot(x)) continue;
    TOP[(HY - 1) * W + x] = foamIdx(x, 0, tk);
    if (HEAD_FOOT[x] && hash2(x, 1, tk) > 0.6) TOP[(HY - 2) * W + x] = foamIdx(x, 1, tk);
  }
}
// The water at its foot (after the mirror): the collar's churned rows, and the head's reflection broken into
// rows by the heave, so the head and its mirror never close into one shape.
const FOAM_ROWS = 2;
function lungeWaterPix(v, x, y, j, tk) {
  if (v === 19) v = 1; // the open mouth's mirror is the dark water, not a hole
  if (v < 5 && ((y + (tk >> 1)) % 3 === 0 || hash2(x >> 2, y, tk >> 2) > 0.8)) return v + 3;
  return v;
}
function drawSloshFoam(cx, t) { // churned white water under the heap, where its mirror would be
  const rows = Math.ceil(SLOSH_FOAM * Math.sin(Math.PI * WS.slosh)), w = SLOSH_W * (0.6 + 0.4 * WS.slosh) + 4, tk = (t * 8) | 0;
  for (let j = 0; j < rows; j++) for (let dx = -Math.round(w * (1 - j / (rows + 1))); dx <= w * (1 - j / (rows + 1)); dx++) {
    const x = cx + dx;
    if (x >= 0 && x < W) FRAME[(HY + j) * W + x] = hash2(x, j, tk) > 0.5 ? 10 : 9;
  }
}
function drawLungeWater(t) {
  if (WS.slosh > 0 && WS.slosh < 1) drawSloshFoam(lungeCx(), t);
  if (WS.lunge <= 0) return;
  const tk = (t * 8) | 0;
  for (let x = HEAD_BOX.x0; x <= HEAD_BOX.x1; x++) {
    const foot = nearFoot(x);
    for (let j = foot ? 0 : FOAM_ROWS; j < HY - HEAD_TOPS[x] && HY + j < H; j++) {
      const i = (HY + j) * W + x;
      FRAME[i] = foot && j < FOAM_ROWS ? foamIdx(x, j + 2, tk) : lungeWaterPix(FRAME[i], x, HY + j, j, tk);
    }
    if (foot && HEAD_TOPS[x] === HY) for (let j = 0; j < FOAM_ROWS; j++) FRAME[(HY + j) * W + x] = foamIdx(x, j + 2, tk);
  }
}
function drawLunge(t) {
  const cx = lungeCx();
  HEAD_BOX.x1 = -1;
  if (WS.slosh > 0 && WS.slosh < 1) drawSlosh(cx);
  if (WS.lunge <= 0 && WS.bulge <= 0) return;
  headPose(cx);
  drawBulge(cx);
  if (WS.lunge <= 0) return;
  drawHead(); drawScales(); drawHeadEye(); drawShed(); drawSheet(t); drawStreaks(t); drawCollar(t);
}
// The eyes in the water (bible, section 8): about eight pairs of red pixels on the surface rows under
// the horizon beside the boat, fixed per run, with a dimmer pair a row below as the glint. Never reflected.
const EYES = [];
function genEyes() {
  const rng = mulberry32(RUN.count + 7); // fixed per run, and the shots stay deterministic
  EYES.length = 0;
  for (let tries = 0; tries < 60 && EYES.length < 8; tries++) {
    const right = EYES.length >= 6;
    const x = right ? 206 + ((rng() * 6) | 0) : 70 + ((rng() * 43) | 0);
    const y = HY + 1 + ((rng() * 3) | 0);
    if (EYES.some(e => e.y === y && Math.abs(e.x - x) < 5)) continue;
    EYES.push({ x, y });
  }
}
function drawEyes() {
  const a = WS.eyes;
  if (a <= 0.02) return;
  for (let k = 0; k < EYES.length; k++) {
    const e = EYES[k];
    if (hash2(k, 3, 1) > a) continue; // each pair opens at its own moment
    const i = e.y * W + e.x;
    FRAME[i] = 21; FRAME[i + 2] = 21;
    if (a > 0.6) { const yr = e.y + 1, xr = clamp(e.x + RIPX[yr], 0, W - 3), j = yr * W + xr; FRAME[j] = 24; FRAME[j + 2] = 24; }
  }
}
function plot(x, y, v) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  SPR[y * W + x] = v;
}
const refl = v => (v >= 12 ? v : v <= 2 ? v + 1 : v - 1);
// noRefl: plot the pixel but not its reflection (stampR's thinner reflections).
function plotR(x, y, v, wl, noRefl) {
  x = Math.round(x); y = Math.round(y);
  if (y >= wl) return;
  plot(x, y, v);
  if (noRefl) return;
  const yr = 2 * wl - 1 - y;
  if (yr >= HY && yr < H) plot(x + RIPX[yr], yr, refl(v));
}
// ra, when given, dithers the reflection to about that fraction of its pixels (the golden fish's is faint).
function stampR(s, x0, y0, wl, alpha, flip, ra) {
  for (let j = 0; j < s.h; j++) {
    const y = y0 + j;
    if (y >= wl) break;
    for (let i = 0; i < s.w; i++) {
      const v = s.data[j * s.w + (flip ? s.w - 1 - i : i)];
      if (v === 255) continue;
      if (alpha !== undefined && alpha < 1 && hash2(i, j, 7) > alpha) continue;
      plotR(x0 + i, y, v, wl, ra !== undefined && hash2(i, j, 13) > ra);
    }
  }
}
function stamp(s, x0, y0, flip, alpha) {
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const v = s.data[j * s.w + (flip ? s.w - 1 - i : i)];
    if (v === 255) continue;
    if (alpha !== undefined && alpha < 1 && hash2(i, j, 9) > alpha) continue;
    plot(x0 + i, y0 + j, v);
  }
}
function drawRod(hx, hy, wl) {
  const a = G.rodA, bend = G.rodBend;
  const tx = hx + Math.cos(a) * ROD_LEN, ty = hy + Math.sin(a) * ROD_LEN;
  const nx = -Math.sin(a), ny = Math.cos(a), sg = ny > 0 ? 1 : -1;
  const cx = (hx + tx) / 2 + nx * bend * sg, cy = (hy + ty) / 2 + ny * bend * sg;
  for (let k = 0; k <= 40; k++) {
    const q = k / 40;
    plotR((1 - q) * (1 - q) * hx + 2 * (1 - q) * q * cx + q * q * tx, (1 - q) * (1 - q) * hy + 2 * (1 - q) * q * cy + q * q * ty, 0, wl);
  }
  G.tip = { x: tx, y: ty };
}
// The camera pull-back (bible, Ocean, phase 24): the group's anchor (its centre column on the waterline)
// glides from where it sits to the centre of the horizon on the same eased far that picks the frame, so the
// eye can follow it all the way; the frames step down FAR_STEPS sizes, the live group first and the speck last.
const FAR_STEPS = FAR_SCALES.length + 2;
const farStep = far => Math.min(FAR_STEPS - 1, Math.floor(far * FAR_STEPS));
const farLive = () => farStep(WS.far) === 0;
const zoomCx = () => (swimming() ? SWIM_CX : BOAT.w / 2);
const zoomAnchorX = () => lerp(BOAT_X + WS.boatX + zoomCx(), W / 2 + WS.farDrift, WS.far);
function farSprite(far) {
  const k = farStep(far), sw = swimming();
  if (k > FAR_SCALES.length) return sw ? SWIM_SPECK : BOAT_SPECK;
  return (sw ? SWIM_ZOOM : BOAT_ZOOM)[k - 1];
}
// In the Swallowed lunge the speck is lifted onto the lip and tips in instead (drawLungeSpeck).
function drawFarBoat() {
  if (WS.bulge > 0 || WS.lunge > 0 || WS.gulp > 0) { drawLungeSpeck(); return; }
  const s = farSprite(WS.far), x0 = Math.round(zoomAnchorX() - s.ax), y0 = WL - s.wl;
  stampR(s, x0, y0, WL);
  G.tip = { x: x0 + s.tx, y: y0 + s.ty }; // a cast from out here leaves from the silhouette's rod
}
// The tracking cue: while the camera is out (far > 0) a small ring leaves the group's waterline every
// FAR_RING_GAP seconds, sized to the frame, so even the speck visibly sits on the water (not in the lunge).
const FAR_RING_GAP = 1.2, FAR_RING_FIRST = 0.6, FAR_RING_MIN = 1;
function farRings(dt) {
  if (WS.far <= 0 || WS.lunge > 0 || WS.gulp > 0) { G.farRing = FAR_RING_FIRST; return; }
  G.farRing += dt;
  if (G.farRing < FAR_RING_GAP) return;
  G.farRing -= FAR_RING_GAP;
  const w = farLive() ? BOAT.w : farSprite(WS.far).w;
  ring(zoomAnchorX(), WL + 1, false, clamp(w / 18, FAR_RING_MIN, 2.4), true); // it outgrows the frame
}
// Swallowed: the bulge lifts the speck out of the water, the water drawing it a little toward the mouth; the
// rising lower jaw scoops it up onto its lip, and it slides into the wedge with the sheet (gulp): tipped, then a
// bit, dithered away, gone at 1.
const SPECK_LIFT = 0.6, SPECK_SIT = HY - 1, BULGE_LIFT = 0.3, SPECK_LA = 16, SUCK = 0.7, GULP_DEEP = 3;
function lungeSpeckAt() {
  const g = WS.gulp, lift = E.out(clamp(WS.bulge * BULGE_LIFT + WS.lunge / SPECK_LIFT, 0, 1)), wy = lerp(WL, SPECK_SIT, lift);
  headPose(lungeCx());
  const la = JAW_T + SPECK_LA + g * GULP_IN, q = jawToHead(la, lipB(la) - g * GULP_DEEP), p = headXY(q.a, q.b);
  if (WS.lunge > 0 && p.y <= wy) return p;
  return { x: lerp(zoomAnchorX(), p.x, E.io(clamp(WS.lunge / SUCK, 0, 1))), y: wy };
}
function drawLungeSpeck() {
  const g = WS.gulp;
  if (g >= 1) return;
  const s = g < 0.3 ? BOAT_SPECK : g < 0.65 ? SPECK_TIP : SPECK_BIT, p = lungeSpeckAt();
  const b = Math.round(p.y), x0 = Math.round(p.x - s.ax);
  stampR(s, x0, b - s.wl, b, 1 - g * g);
  G.tip = { x: x0 + s.tx, y: b - s.wl };
}
// Facing the horizon, turned (the red), or standing (Stay).
function compSprite() {
  if (WS.companionCrouch > 0.5) return COMP_CROUCH_LIT;
  return WS.companionStand > 0.5 ? COMP_STAND : WS.companionTurn > 0.5 ? COMP_TURN : COMP;
}
// The boat's left corner on screen, the origin of every sprite in the boat group.
function boatLeft() { return Math.round(zoomAnchorX() - zoomCx()); }
// The gold sink (bible, section 8): at boatSunk 1 the hull rides SINK_PX lower, which puts the prow curl and
// the lantern pole under the waterline too, so the reflecting stamp masks the whole boat. The people do not
// go with it: each rides the hull down only until it floats (FISHER_FLOAT rows of the fisherman above the
// surface: head, shoulders and the rod arm; COMP_FLOAT for the companion; the kept fish and the lantern at
// water level), and from boatSunk SWIM_AT they bob. Everything keeps its x, so casting, the reel and every
// cutscene that moves boatX simply move the swimmer.
const SINK_PX = 28, SWIM_AT = 0.6, FISHER_FLOAT = 10, COMP_FLOAT = 7;
const FISHER_DY = -24, LANTERN_DY = -25;
function boatSinkPx() { return Math.round(WS.boatSunk * SINK_PX); }
const swimming = () => WS.boatSunk > SWIM_AT;
const swimBob = (t, ph) => (swimming() && Math.sin(t * 1.7 + ph) > 0.35 ? 1 : 0);
// Where a thing in the boat sits: down with the hull until its own float depth, where it stays.
const afloat = (rest, dy, float) => Math.min(rest + dy, float);
const fisherY = dy => WL + afloat(FISHER_DY, dy, -FISHER_FLOAT);
const compY = dy => WL + afloat(COMP_DY, dy, -COMP_FLOAT);
// The lantern hangs from its pole, or floats at water level once the pole has gone under.
function drawLantern(t, bx, dy) {
  const lpx = bx + 9, ltop = WL - 27 + dy;
  for (let y = ltop; y < WL - 8 + dy; y++) plotR(lpx, y, 0, WL);
  plotR(lpx - 1, ltop, 0, WL); plotR(lpx - 2, ltop, 0, WL); plotR(lpx - 2, ltop + 1, 0, WL);
  const lx = lpx - 3, ly = WL + afloat(LANTERN_DY, dy, -4) + swimBob(t, 0);
  const lit = WS.lantern > 0.3 && WS.lanternFlicker > 0.5;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
    const edge = i === 0 || i === 2 || j === 0 || j === 3;
    plotR(lx + i, ly + j, edge ? 0 : lit ? 17 : 2, WL);
  }
  G.lanternPos = { x: lx + 1, y: ly + 1.5 };
}
function drawGoldPile(bx, dy) {
  const y0 = WL - 10 + dy;
  stampR(GOLDPILE, bx + 32, y0, WL, WS.gold);
  if (WS.glint > 0) { plotR(bx + 34, y0 - 1, 16, WL); plotR(bx + 36, y0, 15, WL); plotR(bx + 35, y0 + 1, 16, WL); }
}
// A sprite's rows above the water mirrored under the surface row hy: what the Deep descent sees from beneath.
function stampBeneath(s, x0, hy, above, flip) {
  for (let j = 0; j < above && j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const v = s.data[j * s.w + (flip ? s.w - 1 - i : i)];
    if (v !== 255) plot(x0 + i, hy + above - 1 - j, v);
  }
}
// Light through the water around a shape: every empty pixel in the box touching a drawn one gets index 9.
// Collect first, then plot: plotting in the scan would make each rim pixel a neighbour of the next.
function rimBox(x0, y0, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 255 : SPR[y * W + x]);
  const rim = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (at(x, y) !== 255) continue;
    if (at(x - 1, y) !== 255 || at(x + 1, y) !== 255 || at(x, y - 1) !== 255 || at(x, y + 1) !== 255) rim.push(x, y);
  }
  for (let i = 0; i < rim.length; i += 2) plot(rim[i], rim[i + 1], 9);
}
// Deep: the swimmer as a dark shape hanging from the surface near the top of the screen, seen from beneath
// (the boat is already on the bottom), the companion and the kept fish beside him, one gold glint below.
// Once the surface has risen past DEEP_SWIM_Y he no longer hangs from it: he sinks with the view and stays in
// the upper third, with the gold far below him, drifting and glinting (drawDeepGold), so the frame is full of light.
const DEEP_SWIM_Y = 84, DEEP_GOLD_GLOW = 16;
// The glints use the accents that stay bright in the red (16, and the pale 12 and 20), since the dim darkens only the ramp.
const DEEP_GOLD = [[0, 0, 16], [3, -2, 12], [-3, 1, 16], [5, 2, 20], [-1, 4, 16], [2, 5, 12], [-5, -1, 20], [7, -1, 16], [-2, -4, 12], [-7, 3, 16], [9, 3, 12]];
function drawDeepGold(t, x0, y0) {
  const cx = Math.round(x0 + Math.sin(t * 0.45) * 5), cy = Math.round(y0 + Math.sin(t * 0.3 + 1) * 3), f = (t * 6) | 0;
  G.deepGold = { x: cx, y: cy }; // applyGlows lights the water around it
  for (let k = 0; k < DEEP_GOLD.length; k++) {
    const p = DEEP_GOLD[k];
    if (WS.glint > 0 || hash2(k, f, 21) > 0.3) plot(cx + p[0], cy + p[1], WS.glint > 0 ? 12 : p[2]);
  }
}
function drawSwimmerBeneath() {
  const hy = Math.max(waterTop(), DEEP_SWIM_Y), bx = boatLeft(), fx = bx + 18;
  stampBeneath(FISHER, fx, hy, FISHER_FLOAT);
  if (WS.companion > 0) stampBeneath(compSprite(), bx + COMP_DX, hy, COMP_FLOAT);
  rimBox(fx - 2, hy, COMP_DX + COMP.w - 14, FISHER_FLOAT + 2);
  if (STORY.kept && WS.goldKept > 0.01) stampBeneath(KEPT, bx + KEPT_DX, hy, KEPT.h);
  drawDeepGold(G.t, bx + 34, hy + 70);
}
// From night on the people are dark on a dark shore, so each gets a 1 px rim on its left edge, the side the
// lantern is on, in the ochre accent RIM_WARM: the lantern's light at low strength, warm against the blue
// mountain (a ramp index read as part of the rock). The rimmed copy is made once per sprite and kept on it.
const RIM_WARM = 14, RIM_MOOD = 0.999;
function lanternRim(s) {
  if (WS.mood < RIM_MOOD) return s;
  if (!s.rim) {
    const d = s.data.slice();
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const k = j * s.w + i;
      if (s.data[k] !== 255 && (i === 0 || s.data[k - 1] === 255)) d[k] = RIM_WARM;
    }
    s.rim = { w: s.w, h: s.h, data: d, wl: s.wl };
  }
  return s.rim;
}
function drawFisherman(t, bx, dy) {
  const fx = bx + 18, fy = fisherY(dy) + swimBob(t, 1.2);
  stampR(lanternRim(FISHER), fx, fy, WL);
  G.hand = { x: fx, y: fy + 9 };
  drawRod(G.hand.x, G.hand.y, WL);
}
const DIVE_SWITCH = 0.02; // Deep: the view swaps to the shape from beneath once the horizon has risen a little
function drawBoatGroup(t) {
  if (G.inside) return; // Inside: drawn after the push-in, at full resolution (drawInsideClose)
  if (!farLive()) { drawFarBoat(); return; }
  drawBoatLive(t);
}
function drawBoatLive(t) {
  if (WS.dive > DIVE_SWITCH) { drawSwimmerBeneath(); return; } // a few rows of rise first, no one-frame cut
  const bob = Math.round(Math.sin(t * 1.3) * WS.troubled * 1.2) + rockPx(t);
  const bx = boatLeft(), dy = boatSinkPx() + bob;
  stampR(BOAT, bx, WL - BOAT.wl + dy, WL);
  drawLantern(t, bx, dy);
  if (WS.gold > 0) drawGoldPile(bx, dy);
  drawKeptFish(t, bx, dy);
  if (WS.companion > 0) drawCompanion(t, bx, dy);
  drawFisherman(t, bx, dy);
  if (WS.goldBelow > 0) drawGoldBelow(t, bx);
}
// Lake, sunk, Still water: he wakes in the water again above the gold, one glint a few rows under him.
const GOLD_BELOW_DX = 22, GOLD_BELOW_DY = 30;
function drawGoldBelow(t, bx) {
  const x = bx + GOLD_BELOW_DX, y = WL + GOLD_BELOW_DY, on = ((t * 3) | 0) % 3 !== 0;
  plot(x, y, 16);
  if (on) { plot(x - 1, y, 14); plot(x + 1, y, 14); plot(x, y - 1, 12); }
  G.goldBelow = { x, y };
}
// The push-off (Stay): a small rock of the whole boat that dies out as WS.rock tweens back to 0.
const rockPx = t => REDUCED_MOTION ? 0 : Math.round(Math.sin(t * 15) * WS.rock * 1.6);
// A taller frame keeps his feet where the seated frame's are.
const seatTop = (s, dy) => compY(dy) - (s.h - COMP.h);
// At his seat, or (Stay) in the air: the leaping frame follows a parabola from the seat to the red disc,
// then rides the disc down at leap 1. It is a reflecting sprite whose mirror line slides from the boat's
// waterline to the horizon, where the disc's own reflection is, so the two go under together.
function drawCompanion(t, bx, dy) {
  if (WS.cling > 0) { const c = clingAt(); stampR(COMP_CLING2[((t * 7) | 0) & 1], c.x, c.y, HY); return; }
  if (WS.leap <= 0) { stampR(lanternRim(compSprite()), bx + COMP_DX, seatTop(compSprite(), dy) + swimBob(t, 2.6), WL, WS.companion); return; }
  const p = WS.leap, s = COMP_LEAP2;
  for (let k = LEAP_TRAIL.length - 1; k >= 0; k--) { // the oldest first, so the nearer ones sit on top
    const tr = LEAP_TRAIL[k], q = p - tr.dp;
    if (q <= 0 || p >= 1) continue; // no trail on the ground, and none once he rides the disc
    const c = leapXY(q, bx, dy);
    stampSolidR(s, Math.round(c.x - s.w / 2), Math.round(c.y - s.h / 2), leapWL(q), tr.v, tr.a);
  }
  const c = leapXY(p, bx, dy);
  stampR(s, Math.round(c.x - s.w / 2), Math.round(c.y - s.h / 2), leapWL(p));
}
// The centre of the leaping frame: from his seat (feet on the plank) along the parabola to where he clings.
function leapXY(p, bx, dy) {
  const x0 = bx + COMP_DX + COMP.w / 2, y0 = compY(dy) + COMP.h - COMP_LEAP2.h / 2, c = clingAt();
  const x1 = c.x + COMP_CLING2[0].w / 2, y1 = c.y + COMP_CLING2[0].h / 2;
  // x leads (out-eased), so he is over the open sky between the ridges before the top of the arc
  return { x: lerp(x0, x1, E.out2(p)), y: lerp(y0, y1, p) - LEAP_ARC * 4 * p * (1 - p) };
}
// The cling frame's top-left: its left hand hooked over the rim CLING_DX right of the top, the body down the
// disc's stern side, clear of the pupil.
const CLING_DX = 8;
function clingAt() {
  const r = WS.sunR, hx = CLING_DX + 1;
  return { x: Math.round(WS.sunX + CLING_DX), y: Math.round(WS.sunY - Math.sqrt(r * r - hx * hx) - 3) };
}
const leapWL = p => Math.round(lerp(WL, HY, p));
// A sprite's silhouette in one index, Bayer-dithered to alpha in screen space (the leap's trail, an even
// ghost rather than noise), reflected like any sprite.
function stampSolidR(s, x0, y0, wl, v, alpha) {
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const x = x0 + i, y = y0 + j;
    if (s.data[j * s.w + i] === 255 || BAYER[((y & 3) << 2) | (x & 3)] > alpha) continue;
    plotR(x, y, v, wl);
  }
}
function drawBobber() {
  const b = G.bob;
  if (!b) return;
  const x = Math.round(b.x), y = Math.round(b.y);
  const gold = STORY.goldenNext && (G.phase === 'waiting' || G.phase === 'bite' || G.phase === 'casting');
  const col = gold ? 15 : 12;
  const bait = STORY.act === 0; // the stranger's bait on the hook for all of act 0 (bible, Opening)
  if (b.fly) { plot(x, y - 1, 11); plot(x, y, col); plot(x + 1, y, col); if (bait) drawBait(x + 1, y + 1); return; }
  if (G.phase === 'bite' || b.taut) return;
  const yy = y + (G.bobDip > 0 ? 1 : 0), wl = yy + 1;
  plotR(x, yy - 2, 11, wl); plotR(x, yy - 1, col, wl); plotR(x + 1, yy - 1, col, wl); plotR(x, yy, col, wl); plotR(x + 1, yy, col, wl);
  if (bait) drawBait(x + 1, yy + 1); // under the float, in the water, not reflected
}
const BAIT_IDX = 16, BAIT_EYE_IDX = 19; // the bright end of the gold ramp (13 is dark and reads as a sinker at 3x), and black
// The lure: one gold pixel with one dark pixel beside it, the eye (bible, Opening). It moves with the float.
function drawBait(x, y) { plot(x, y, BAIT_IDX); plot(x + 1, y, BAIT_EYE_IDX); }
function linePix(x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  if (SPR[i] !== 255) return;
  const u = FRAME[i];
  SPR[i] = u >= 12 ? 11 : ci(u >= 7 ? u - 4 : u + 3);
}
function drawLine() {
  if (WS.lineCut || !G.tip) return;
  const t0 = G.tip;
  if (!G.bob) {
    if (G.phase === 'landing') return;
    for (let k = 1; k <= 6; k++) linePix(t0.x, t0.y + k);
    linePix(t0.x + 1, t0.y + 6);
    return;
  }
  const b = G.bob;
  const dist = Math.hypot(b.x - t0.x, b.y - t0.y);
  let sag = b.fly ? 4 : 12;
  if (G.phase === 'reeling' && G.reel) sag = (1 - G.reel.T) * 10;
  if (b.taut) sag = 0.5;
  const cx = (t0.x + b.x) / 2, cy = (t0.y + b.y) / 2 + sag;
  const steps = Math.ceil(dist * 1.3) + 2;
  for (let k = 0; k <= steps; k++) {
    const q = k / steps;
    const x = (1 - q) * (1 - q) * t0.x + 2 * (1 - q) * q * cx + q * q * b.x;
    const y = (1 - q) * (1 - q) * t0.y + 2 * (1 - q) * q * cy + q * q * b.y;
    linePix(x, y);
  }
}
// The talking test shared by the sky fish and the boat fish: a Golden fish line is still typing.
function fishSpeaking() {
  const L = DLG.cur;
  return !!(L && L.text && DLG.n < L.text.length && L.who === FISHN);
}
const mouthOpen = t => ((t * 10) | 0) & 1;
// The kept fish in the boat bottom. Its alpha follows the ladder and returns to 1 whenever it speaks,
// with a soft sparkle (bible, section 8). Not shown out on the ocean, when the boat is a speck. Once the
// boat has gone under it swims beside the fisherman at the surface, glowing at full alpha.
function drawKeptFish(t, bx, dy) {
  if (!STORY.kept || WS.goldKept <= 0.01) return;
  const speaking = fishSpeaking();
  const a = speaking || swimming() ? 1 : WS.goldKept;
  const x0 = bx + KEPT_DX, y0 = WL + afloat(KEPT_DY, dy, -KEPT.h) + swimBob(t, 4);
  stampR(speaking && mouthOpen(t) ? KEPT_OPEN : KEPT, x0, y0, WL, a);
  if (speaking && Math.random() < 0.12) sparkle(x0 + Math.random() * KEPT.w, y0 + Math.random() * KEPT.h);
}
const GOLD_REFL_A = 0.4;
function drawGoldFish(t) {
  const g = WS.goldFish;
  const a = g ? g.a * clamp(1 - (WS.far - 0.3) / 0.3, 0, 1) : 0; // out on the ocean it is out of sight too
  if (!g || a <= 0.01) return;
  const talking = fishSpeaking() && mouthOpen(t);
  const s = talking ? GOLD_OPEN : GOLD;
  const x0 = Math.round(g.x), y0 = Math.round(g.y + Math.sin(t * 2.1) * 1.5);
  stampR(s, x0, y0, g.surf, a, false, GOLD_REFL_A); // a faint reflection, so it reads as one fish, not two
  if (a > 0.6 && Math.random() < 0.25) sparkle(x0 + Math.random() * s.w, y0 + Math.random() * s.h);
}
function drawLanding() {
  if (G.phase !== 'landing' || !G.land) return;
  const l = G.land, k = Math.min(1, l.t / 0.62);
  const x = lerp(l.x0, G.hand.x - 4, k), y = lerp(l.y0, G.hand.y - 6, k) - Math.sin(k * Math.PI) * 22;
  const s = l.fish.spr;
  stamp(s, Math.round(x - s.w / 2), Math.round(y - s.h / 2), true);
}
function drawParts(t) {
  for (const p of PARTS) {
    if (p.blink && (((t * 12 + p.x) | 0) % 3) === 0) continue;
    if (p.fade && BAYER[((p.y & 3) << 2) | (p.x & 3)] > 1 - p.life / p.max) continue; // steam thins as it rises
    plot(p.x, p.y, p.v);
    if (p.tall) plot(p.x, p.y + 1, p.v - 1); // spray: a drop and its trail
  }
  if (!G.inside) for (const a of ASH) plot(a.x, a.y, 10); // Inside: drawn crisp over the push-in
}
function jawShift() { return Math.round(WS.jaw * JAW_MAX); }
function composite() {
  const s = jawShift(), n = W * H;
  if (s === 0) {
    for (let i = 0; i < n; i++) { const v = SPR[i]; IDX[i] = v !== 255 ? v : FRAME[i]; }
    return;
  }
  const jd = WS.jaw * 7.5;
  for (let y = 0; y < H; y++) {
    const ya = y - s, yb = y + s;
    const hasA = ya >= 0 && ya < HY, hasB = yb >= HY && yb < H;
    const msrc = 2 * HY - 1 - yb;
    for (let x = 0; x < W; x++) {
      let v = 19, tooth = false;
      const ta = hasA && mountIdx(x, ya) !== 255; // the jaws close from the shifted shore (bible, 8c)
      const tb = hasB && msrc >= 0 && msrc < HY && mountIdx(x, msrc) !== 255;
      const sp = yb >= 0 && yb < H ? SPR[yb * W + x] : 255;
      if (sp !== 255) v = sp; // sprites ride the lower jaw and stay in front, so the boat never blinks out behind the shore
      else if (ta) { v = FRAME[ya * W + x]; tooth = true; }
      else if (tb) { v = FRAME[yb * W + x]; tooth = true; }
      else if (hasA && hasB) v = Math.min(FRAME[ya * W + x], FRAME[yb * W + x]);
      else if (hasA) v = FRAME[ya * W + x];
      else if (hasB) v = FRAME[yb * W + x];
      if (!tooth && v < 12) { const d = v - jd; v = d <= 0 ? 0 : Math.round(d); }
      IDX[y * W + x] = v;
    }
  }
}
const FANGS_UP = [[50, 9, 118], [77, 12, 150], [104, 14, 172], [131, 12, 150], [158, 9, 118]];
const FANGS_DN = [[37, 8, 96], [63, 11, 124], [90, 13, 142], [118, 13, 142], [145, 11, 124], [171, 8, 96]];
// One of Home's teeth as pixel art: a stepped, slightly hooked silhouette with a 1 px black outline (19), lit
// from the left in hard bands (one highlight column of 11, bone 22, bone shade 23, a ramp 7 core shadow on the
// right) and a gum band of ramp tones at the root.
const FANG_GUM = 0.88;
function fangShade(xi, n, t) {
  if (t > FANG_GUM) return xi === 0 ? 8 : 6;
  if (xi === 0) return 11;
  const rel = xi / Math.max(1, n);
  return rel < 0.55 ? 22 : rel < 0.86 || n < 4 ? 23 : 7;
}
function fangRow(y, c, half, t) {
  const x0 = c - half, n = 2 * half, row = y * W;
  for (let xi = 0; xi <= n; xi++) { const x = x0 + xi; if (x >= 0 && x < W) IDX[row + x] = fangShade(xi, n, t); }
  if (x0 - 1 >= 0) IDX[row + x0 - 1] = 19;
  if (x0 + n + 1 < W) IDX[row + x0 + n + 1] = 19;
}
function drawFang(cx, hb, len, tip, dir) {
  const yTip = Math.round(tip + dir);
  if (yTip >= 0 && yTip < H && cx >= 0 && cx < W) IDX[yTip * W + cx] = 19; // the outline closes over the point
  for (let k = 0; k <= len; k++) {
    const y = Math.round(tip - dir * k);
    if (y < 0 || y >= H) continue;
    const t = k / len;
    const half = Math.floor(hb * Math.pow(t, 0.8)); // whole-pixel steps, so the flanks stair-step
    const c = cx + Math.round(Math.sin(t * Math.PI * 0.5) * hb * 0.35 * dir);
    fangRow(y, c, half, t);
  }
}
function drawFangs() {
  const j = WS.jaw;
  if (j <= 0) return;
  const up = lerp(-10, HY + 4, j), dn = lerp(H + 10, HY - 4, j);
  for (const f of FANGS_UP) drawFang(f[0], f[1], f[2], up, 1);
  for (const f of FANGS_DN) drawFang(f[0], f[1], f[2], dn, -1);
}
function rectI(x, y, w, h, v) {
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < w; i++) { const xx = x + i; if (xx >= 0 && xx < W) IDX[yy * W + xx] = v; }
  }
}
function stampIdx(s, x0, y0) {
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const v = s.data[j * s.w + i];
    if (v === 255) continue;
    const x = x0 + i, y = y0 + j;
    if (x >= 0 && x < W && y >= 0 && y < H) IDX[y * W + x] = v;
  }
}
// The tension bar: BAR_H px of fill in a dark trough, the snap zone from BAR_DANGER to the end shaded dim red
// (index 24) all the time, so it reads as the place to stay out of rather than a goal.
const BAR_W = 116, BAR_H = 5, BAR_DANGER = 0.78;
function drawTensionBar(t, r) {
  const bx = (W - BAR_W) >> 1, by = H - 28, zx = bx + Math.round(BAR_W * BAR_DANGER);
  rectI(bx - 2, by - 2, BAR_W + 4, BAR_H + 4, 0);
  rectI(bx - 1, by - 1, BAR_W + 2, BAR_H + 2, 2);
  rectI(zx, by - 1, bx + BAR_W + 1 - zx, BAR_H + 2, 24);
  const danger = r.T > BAR_DANGER;
  const col = danger ? (((t * 10) | 0) & 1 ? 21 : 11) : r.T > 0.55 ? 9 : 7;
  rectI(bx, by, Math.round(clamp(r.T, 0, 1) * BAR_W), BAR_H, col);
  stampIdx(ICON, bx + Math.round(r.p * (BAR_W - ICON.w)), by - 7);
}
function drawUIPix(t) {
  if (G.phase === 'bite' && G.bob && ((t * 8) | 0) & 1) stampIdx(EXCL, Math.round(G.bob.x) - 1, Math.round(G.bob.y) - 13);
  if (G.phase === 'reeling' && G.reel) drawTensionBar(t, G.reel);
}
function glowTint(cx, cy, r, acc, str) {
  if (VIEW.z !== 1) { cx = (cx - VIEW.x0) * VIEW.z; cy = (cy - VIEW.y0) * VIEW.z; r *= VIEW.z; } // Inside: the glows ride the push-in
  const cr = PALRGB[acc * 3], cg = PALRGB[acc * 3 + 1], cb = PALRGB[acc * 3 + 2];
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = (y - cy) * 1.25, d2 = dx * dx + dy * dy;
    if (d2 >= r2) continue;
    let k = 1 - d2 / r2;
    k = k * k * str;
    k = Math.floor(k * 5 + BAYER[((y & 3) << 2) | (x & 3)]) / 5;
    if (k <= 0) continue;
    const i = y * W + x, p = OUT32[i];
    const pr = p & 255, pg = (p >>> 8) & 255, pb = (p >>> 16) & 255;
    const nr = Math.min(255, pr + (cr - pr) * k * 0.55 + cr * k * 0.3) | 0;
    const ng = Math.min(255, pg + (cg - pg) * k * 0.55 + cg * k * 0.3) | 0;
    const nb = Math.min(255, pb + (cb - pb) * k * 0.55 + cb * k * 0.3) | 0;
    OUT32[i] = (0xff000000 | (nb << 16) | (ng << 8) | nr) >>> 0;
  }
}
function applyGlows(t) {
  const s = jawShift();
  if (WS.lantern > 0.01 && WS.lanternFlicker > 0.05 && farLive() && !insideFar()) { // far out the lantern is a silhouette, and its light is off
    const fl = WS.lanternFlicker * WS.lantern * (0.88 + 0.12 * Math.sin(t * 13) * Math.sin(t * 7.3));
    const lx = G.lanternPos.x, ly = G.lanternPos.y;
    const warm = WS.lanternWarm;
    glowTint(lx, ly - s, 18 + 12 * warm, 17, (0.8 + 0.25 * warm) * fl);
    glowTint(lx, 2 * WL - 1 - ly - s, 12 + 8 * warm, 17, (0.45 + 0.15 * warm) * fl);
  }
  if (WS.goldBelow > 0 && G.goldBelow) glowTint(G.goldBelow.x, G.goldBelow.y, 8, 16, 0.7 * WS.goldBelow);
  if (WS.dive > DIVE_SWITCH && G.deepGold) glowTint(G.deepGold.x, G.deepGold.y, DEEP_GOLD_GLOW, 16, WS.glint > 0 ? 0.9 : 0.55);
  const cab = WS.cabin * WS.cabinLit * (1 - WS.cabinKnock) * (1 - WS.sea) * (1 - WS.dive); // the window's glow is fixed to the shore, which the dive leaves
  if (cab > 0.4) {
    const wx = G.inside ? WIN_G.x : CABIN_X + 2.5, wy = G.inside ? WIN_G.y : CABIN_Y + 7; // Inside: the close cabin's window
    glowTint(wx, wy + s, 7, 17, 0.55 * cab); // the sky (and the cabin in it) slides down with the upper jaw
    glowTint(wx, 2 * HY - 1 - wy - s, 5, 17, 0.35 * cab);
  }
  const door = WS.cabin * WS.door * (1 - WS.sea);
  if (door > 0.5) { glowTint(DOOR_G.x, DOOR_G.y, DOOR_GLOW, 17, 0.7 * door); glowTint(DOOR_G.x, 2 * HY - 1 - DOOR_G.y, DOOR_GLOW - 2, 17, 0.4 * door); }
}
function render(t) {
  buildPalette(WS.mood, WS.dim);
  renderTop(t);
  topExtras(t);
  computeWater(t);
  drawLungeWater(t);
  drawRings();
  drawShadows();
  drawOceanShadows();
  drawOceanMarker(t);
  drawEyes();
  SPR.fill(255);
  drawBoatGroup(t);
  drawBobber();
  drawGoldFish(t);
  drawLanding();
  drawParts(t);
  if (!G.inside && (farLive() || G.bob)) drawLine(); // far out the rod is in the silhouette; a float in the water still trails its line
  composite();
  drawFangs();
  drawUIPix(t);
  pushView();
  if (G.inside) drawInsideClose(t);
  for (let i = 0, n = W * H; i < n; i++) OUT32[i] = PAL[IDX[i]];
  applyGlows(t);
}

// ---------------------------------------------------------------- audio (synthesised, no files)
const SFX = {
  ctx: null, out: null, buf: null, muted: false, drn: null,
  init() {
    if (this.ctx || !IS_BROWSER) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      this.ctx = c;
      this.out = c.createGain();
      this.out.gain.value = 0; // silent until unmuted, so a mute before the first tap never lets a burst through
      if (!this.muted) this.out.gain.setTargetAtTime(0.6, c.currentTime, 0.05);
      this.out.connect(c.destination);
      const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.buf = b;
      this.ambient();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') { try { this.ctx.resume(); } catch (e) { /* not allowed yet */ } } },
  setMuted(m) { this.muted = m; if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05); },
  tone(f, dur, type, vol, f2, delay) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, type, f, f2, q, delay) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this.buf;
    const fl = c.createBiquadFilter(); fl.type = type || 'lowpass';
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  ambient() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(); g.gain.value = 0.035;
    const l = c.createOscillator(); l.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.02;
    l.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(); l.start();
  },
  whoosh() { this.noise(0.35, 0.09, 'bandpass', 600, 2400, 1.4); },
  plop() { this.tone(560, 0.16, 'sine', 0.22, 170); this.noise(0.2, 0.08, 'bandpass', 1500, 500, 1.2); },
  nibble() { this.tone(320, 0.07, 'sine', 0.09, 210); },
  bite() { this.noise(0.3, 0.14, 'bandpass', 900, 300, 1); this.tone(740, 0.1, 'triangle', 0.14); this.tone(990, 0.14, 'triangle', 0.12, null, 0.09); },
  hook() { this.tone(300, 0.12, 'triangle', 0.12, 600); },
  tick() { this.tone(1400 + Math.random() * 300, 0.02, 'square', 0.025); },
  snap() { this.noise(0.14, 0.2, 'highpass', 2500, null, 0.6); this.tone(700, 0.22, 'sawtooth', 0.08, 90); },
  snapLow() { this.tone(140, 0.9, 'sawtooth', 0.07, 60); this.noise(0.8, 0.08, 'lowpass', 500, 120); },
  splash() { this.noise(0.55, 0.2, 'lowpass', 3200, 380, 0.7); },
  row() { this.noise(0.9, 0.07, 'lowpass', 160, 520, 0.6); this.noise(0.28, 0.05, 'bandpass', 1400, 600, 1.1, 0.55); }, // one oar stroke
  caught() { this.tone(660, 0.12, 'triangle', 0.1); this.tone(880, 0.22, 'triangle', 0.1, null, 0.1); },
  chime() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 1.8, 'sine', 0.07, null, i * 0.11)); },
  select() { this.tone(520, 0.08, 'triangle', 0.08); },
  swell() { this.noise(7, 0.07, 'lowpass', 250, 900, 0.5); },
  match() { this.noise(0.25, 0.12, 'bandpass', 2800, 900, 2); this.tone(180, 0.5, 'sine', 0.04, 120, 0.1); },
  hiss(d) { this.noise(d || 2, 0.16, 'highpass', 2200, 7000, 0.4); },
  rumble() { this.noise(4.5, 0.18, 'lowpass', 120, 300, 0.7); this.tone(38, 4.4, 'sawtooth', 0.1, 55); },
  // Swallowed: a deep surge as the head rises (sub-bass and low noise swelling up with no attack, no stinger),
  // a heavy water slam as the mouth closes, and the water closing over it.
  surge() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, d = SURGE_DUR;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(70, t); f.frequency.exponentialRampToValueAtTime(360, t + d * 0.6); f.frequency.exponentialRampToValueAtTime(110, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const n = c.createBufferSource(); n.buffer = this.buf; n.loop = true;
    const o = c.createOscillator(); o.frequency.setValueAtTime(32, t); o.frequency.exponentialRampToValueAtTime(56, t + d * 0.6);
    n.connect(f); o.connect(f); f.connect(g); g.connect(this.out);
    n.start(t, Math.random()); o.start(t); n.stop(t + d + 0.05); o.stop(t + d + 0.05);
  },
  slam() { this.noise(0.9, 0.34, 'lowpass', 700, 70, 1); this.tone(62, 0.8, 'sine', 0.32, 30); },
  douse() { this.noise(1.4, 0.24, 'lowpass', 2800, 260, 0.7); this.noise(0.6, 0.08, 'highpass', 3000, 1200, 0.5, 0.2); },
  crunch() { this.noise(0.9, 0.45, 'lowpass', 900, 60, 1.2); this.tone(90, 1, 'sawtooth', 0.25, 28); },
  // Stay: the line straining under him, a rising creak (a rough low saw sliding up through a narrow band).
  creak(d) { this.tone(58, d, 'sawtooth', 0.12, 150); this.noise(d, 0.07, 'bandpass', 320, 1500, 7); this.tone(117, d, 'square', 0.03, 300); },
  knock(v = 1) { this.tone(88, 0.16, 'sine', 0.32 * v, 52); this.noise(0.12, 0.16 * v, 'lowpass', 380, 140, 1.2); }, // one knock, muffled by the water between (v: quieter)
  heartbeat() { this.tone(52, 0.2, 'sine', 0.3, 40); this.tone(48, 0.22, 'sine', 0.24, 36, 0.26); },
  drone(on) {
    const c = this.ctx; if (!c) return;
    if (on && !this.drn) {
      const g = c.createGain(); g.gain.value = 0.0001;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
      const os = [[55, 'sawtooth'], [55.7, 'sawtooth'], [41.2, 'sine']].map(([fr, ty]) => { const o = c.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      f.connect(g); g.connect(this.out);
      g.gain.setTargetAtTime(0.08, c.currentTime, 2.5);
      this.drn = { g, os };
    } else if (!on && this.drn) {
      const d = this.drn; this.drn = null;
      d.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.8);
      setTimeout(() => d.os.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }), 4000);
    }
  },
  // The big one's weight (bible, section 8): a sub-bass swell, two low oscillators through a low-pass and a
  // slow filtered noise bed, rising over the crossing with no attack, held while it sits under the boat, and
  // fading over WEIGHT_OUT seconds when it leaves or the Swallowed cinematic takes over. Never a hit.
  wgt: null,
  weight(on) {
    const c = this.ctx; if (!c) return;
    const now = c.currentTime;
    if (on && !this.wgt) {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(WEIGHT_VOL, now + OCEAN_CROSS);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 90; f.Q.value = 1.2;
      const os = [[44, 'sine'], [52.5, 'triangle']].map(([fr, ty]) => { const o = c.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      const n = c.createBufferSource(); n.buffer = this.buf; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 140; nf.Q.value = 0.7;
      const ng = c.createGain(); ng.gain.value = 0.35;
      n.connect(nf); nf.connect(ng); ng.connect(g); n.start();
      f.connect(g); g.connect(this.out);
      this.wgt = { g, os: os.concat([n]) };
    } else if (!on && this.wgt) {
      const w = this.wgt; this.wgt = null;
      w.g.gain.cancelScheduledValues(now); w.g.gain.setValueAtTime(w.g.gain.value, now);
      w.g.gain.linearRampToValueAtTime(0.0001, now + WEIGHT_OUT);
      setTimeout(() => w.os.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }), (WEIGHT_OUT + 0.5) * 1000);
    }
  },
};
const WEIGHT_VOL = 0.22, WEIGHT_OUT = 2;

// ---------------------------------------------------------------- dialogue
// A line is {who, text, style, choices, mark, bubble}, {act: fn} or {pause: seconds}. mark asks the UI for
// the wrong question mark (the companion's question). A choice whose pick() does not start a new dlgRun
// lets the current list continue, so a choice can sit in the middle of a scene. A bubble line (the
// companion's) shows complete in the thought bubble instead of the panel
// and stays until a tap, never on a timer (bible, 4b), with the panel's ▾ marker; with choices it waits for
// one under the bubble. A tapped choice is already the fisherman's line and is never echoed in his bubble
// (bible, 4b): the tap closes the panel and runs its pick at once.
const DLG = { q: [], cur: null, n: 0, done: null, wait: 0, active: false, run: 0 };
// A line as the player reads it: its text and choice labels translated (tr). Its `who` stays English, since
// fishSpeaking reads it; the label is translated where it is shown.
const trChoice = c => Object.assign({}, c, { label: tr(c.label) });
const trLine = L => (typeof L.text !== 'string' ? L : Object.assign({}, L, { text: tr(L.text), choices: L.choices && L.choices.map(trChoice) }));
function dlgRun(lines, done) {
  DLG.q = lines.map(trLine); DLG.done = done || null; DLG.active = true; DLG.cur = null; DLG.wait = 0; DLG.run++;
  setPhase('dialog');
  dlgNext();
}
function dlgNext() {
  while (DLG.q.length) {
    const L = DLG.q.shift();
    if (L.act) { L.act(); continue; }
    if (L.pause) { DLG.cur = null; DLG.wait = L.pause; UI.dlgHide(); return; }
    DLG.cur = L; DLG.n = 0;
    if (L.bubble) { dlgBubble(L); return; }
    thinkHide();
    UI.dlgShow(tr(L.who || ''), L.style || '');
    UI.dlgText('', L.mark);
    UI.dlgChoices(null);
    return;
  }
  DLG.cur = null; DLG.active = false;
  UI.dlgHide();
  const d = DLG.done; DLG.done = null;
  if (d) d();
}
// A line in a bubble, complete at once; the panel closes for it. The companion's has no label, the
// fisherman's (side 'fisherman') carries his.
function dlgBubble(L) {
  DLG.n = L.text.length; G.thinkUntil = 0;
  UI.dlgHide();
  const side = L.side || 'companion';
  UI.think(L.text, { side, who: side === 'fisherman' ? tr(L.who) : '', mark: L.mark, choices: L.choices ? choiceList(L) : null, more: !L.choices });
}
// The choice buttons for a line. A tap closes the panel (or the bubble) and runs the pick at once; the
// label never shows in the bubble. A pick that did not start a new dlgRun lets the list continue.
function choiceList(L) {
  return L.choices.map(c => ({
    label: c.label,
    cb: () => {
      if (DLG.cur !== L) return;
      UI.dlgChoices(null); DLG.cur = null; SFX.select();
      UI.dlgHide(); thinkHide();
      const run = DLG.run;
      c.pick();
      if (DLG.run === run && DLG.active) dlgNext();
    },
  }));
}
function dlgFull() {
  const L = DLG.cur;
  DLG.n = L.text.length;
  UI.dlgBusy(false);
  UI.dlgText(L.text, L.mark);
  if (L.choices) UI.dlgChoices(choiceList(L));
  else UI.dlgMore(true);
}
function dlgUpdate(dt) {
  if (!DLG.active) return;
  if (DLG.wait > 0) { DLG.wait -= dt; if (DLG.wait <= 0) { DLG.wait = 0; dlgNext(); } return; }
  const L = DLG.cur;
  if (!L || DLG.n >= L.text.length) return;
  const prev = Math.floor(DLG.n);
  DLG.n = Math.min(L.text.length, DLG.n + dt * 42);
  if (Math.floor(DLG.n) !== prev) UI.dlgText(L.text.slice(0, Math.floor(DLG.n)), L.mark);
  if (DLG.n >= L.text.length) dlgFull();
}
function dlgTap() {
  const L = DLG.cur;
  if (!L) return;
  if (L.bubble) { if (!L.choices) { thinkHide(); dlgNext(); } return; } // a bubble line waits for this tap
  if (DLG.n < L.text.length) { dlgFull(); return; }
  if (L.choices) return;
  UI.dlgMore(false);
  dlgNext();
}

// ---------------------------------------------------------------- cinematics
let CINE = null;
function playCine(def, done) {
  CINE = { def, t: 0, fired: {}, done, st: {} };
  setPhase('cine');
  if (def.init) def.init(CINE.st);
}
function cineUpdate(dt) {
  if (!CINE) return;
  const c = CINE;
  c.t += dt;
  const at = (k, time, fn) => { if (!c.fired[k] && c.t >= time) { c.fired[k] = true; fn(); } };
  c.def.update(c.t, dt, at, c.st);
  if (CINE === c && c.t >= c.def.dur) { CINE = null; if (c.done) c.done(); }
}
// The sunset. After a refusal the caption changes. If the day was wished to last forever the stars
// never come up and the glow under the horizon never fully dies.
// The lantern caption: on the lake with no cabin wished, the far shore stays dark (bible, Wish 2 grants).
const lanternLine = () => placeWord() === 'lake' && !has('home') ? 'You light the lantern. The shore does not.' : 'You light the lantern.';
const sunsetCine = refused => ({
  dur: 10,
  init(s) { s.y0 = WS.sunY; s.tr0 = WS.troubled; },
  update(t, dt, at, s) {
    at('snd', 0, () => SFX.swell());
    at('cap', 0.4, () => cap(refused ? 'The sun sets the way suns do.' : trJoin(['The sun slips into the ', placeWord(), ' like a coin into a well.']), 4.8));
    const k = clamp(t / 7.5, 0, 1);
    WS.sunY = lerp(s.y0, HY + 14, E.io(k));
    WS.mood = clamp((t - 1) / 7, 0, 1);
    WS.sunGlow = Math.max(WS.frozen ? 0.4 : 0, lerp(1, 0.12, E.io(clamp((t - 3) / 5, 0, 1))));
    WS.horizGlow = lerp(1, 0.3, clamp((t - 4) / 5, 0, 1));
    WS.starA = WS.frozen ? 0 : clamp((t - 5) / 4, 0, 1);
    WS.troubled = lerp(s.tr0, 0.35, k);
    at('lan', 7.8, () => { tween(WS, 'lantern', 1, 0.7); cap(lanternLine(), 2.6); SFX.match(); });
  },
});
// The red sun. The companion turns at the pupil beat, before anyone speaks. The pupil slides toward
// the boat only if the player ever asked for something. If the fish were heard, the lake whispers.
const CINE_RED = {
  dur: 15.5,
  init(s) {
    WS.sunKind = 1; WS.sunR = 16; WS.sunY = HY + 24; WS.pupil = 0; WS.pupilDx = 0; WS.stalk = 0;
    s.tr0 = WS.troubled; s.g0 = WS.sunGlow; s.hg0 = WS.horizGlow; s.asked = STORY.wishes.length > 0; // the glow starts from what it finds
  },
  update(t, dt, at, s) {
    at('drone', 0.2, () => SFX.drone(true));
    at('c1', 0.6, () => cap('Something rises where the sun went down.', 4));
    const k = clamp((t - 1) / 8.5, 0, 1);
    WS.sunY = lerp(HY + 24, 178, E.out(k));
    WS.mood = 1 + clamp((t - 1.5) / 7.5, 0, 1);
    WS.sunGlow = lerp(s.g0, 1.25, clamp((t - 1) / 6, 0, 1));
    WS.horizGlow = lerp(s.hg0, 1.3, clamp((t - 1) / 6, 0, 1));
    WS.starA = WS.frozen ? 0 : 1 - clamp((t - 2) / 4, 0, 1);
    WS.troubled = lerp(s.tr0, 0.55, clamp(t / 9, 0, 1));
    WS.ash = clamp((t - 6) / 4, 0, 1);
    WS.stalk = clamp((t - 9.2) / 2.3, 0, 1);
    at('lake', 9.2, () => { if (STORY.heard) lakeWhisper('i could stay out here forever. i could stay out here forever.'); });
    at('lakeOff', 13.4, () => { if (STORY.heard) UI.dlgHide(); });
    WS.pupil = clamp((t - 12) / 1.3, 0, 1);
    WS.pupilDx = s.asked ? clamp((t - 13.6) / 1.0, 0, 1) * 4 : 0;
    at('turn', 13.6, () => { if (WS.companion > 0) tween(WS, 'companionTurn', 1, 0.4); });
    at('hb', 13.6, () => SFX.heartbeat());
  },
};
const CINE_JAWS = {
  dur: 5.2,
  update(t, dt, at) {
    WS.jaw = E.in(clamp(t / 4.2, 0, 1));
    at('rumble', 0.1, () => SFX.rumble());
    at('cap', 1.5, () => { if (!STORY.kept) cap('Something gold slips by you on the way down.', 3); });
    at('snap', 4.15, () => { SFX.crunch(); UI.fade(1, 0.12); });
  },
};
const CINE_DARK = {
  dur: 9.5,
  init(s) { s.g0 = WS.sunGlow; s.h0 = WS.horizGlow; goldFishFade(1.5); }, // the released sky fish is gone before the caption
  update(t, dt, at, s) {
    WS.lid = clamp(t / 1.6, 0, 1);
    WS.sunGlow = lerp(s.g0, 0, clamp(t / 3, 0, 1));
    WS.horizGlow = lerp(s.h0, 0, clamp(t / 3, 0, 1));
    WS.dim = 11 * E.io(clamp((t - 2.5) / 4.5, 0, 1)); // under half until the caption is read (t 4.75), full by 7
    WS.ash = 1 - clamp(t / 3, 0, 1);
    at('drone', 2, () => SFX.drone(false));
    at('cap', 2, () => { if (!STORY.kept) cap(swimming() ? 'Something gold circles you. It has time.' : 'Something gold circles the boat. It has time.', 3); });
    if (t > 6 && t < 8) WS.lanternFlicker = Math.random() < 0.5 ? 1 : 0.1;
    else if (t >= 8) WS.lanternFlicker = 0;
    WS.eyes = t > 7.5 && t < 7.8 ? 1 : 0; // one look from the water before the lantern dies
    if (WS.eyes) WS.lanternFlicker = 0.1;
    at('out', 8, () => SFX.hiss(0.6));
    at('fade', 8.3, () => UI.fade(1, 1));
  },
};
// Stay (bible, section 8), phase 29: a fight you can see. He stands, the eye snaps to him and the heartbeat
// quickens; he crouches and says one word (the only timed bubble in the game); he launches from a rocking
// boat with a spray at the stern and flies a long arc at the eye, which widens and tracks him; he lands and
// clings to its rim; the line strains, creaks and snaps, and the disc falls into the sea with him on it in a
// hiss of steam. Then the red drains back to night without a sun: the lantern stays lit and warms a little,
// the seat is empty, and the last three seconds fade to black. The sun never returns; sunX never moves.
const STAY_LOOK = 7;                    // pupilDx toward the stern, which is to the right of the disc
const STAY_WORD = 'Stay.';
const STAY_SAY_AT = 0.4, STAY_CROUCH_AT = 1.2, STAY_LEAP_AT = 1.8, STAY_LEAP_DUR = 2.4, STAY_HIT = STAY_LEAP_AT + STAY_LEAP_DUR;
const STAY_STRAIN = 0.7, STAY_SNAP = STAY_HIT + STAY_STRAIN, STAY_DROP = 1.5, STAY_UNDER = STAY_SNAP + STAY_DROP;
const STAY_SAG = 3, STAY_STEAM = 2, STAY_STEAM_RATE = 70, STAY_NIGHT = 5, STAY_FADE_AT = 13;
// The eye follows him through the arc: from STAY_LOOK at the stern to straight at him as he reaches it.
function stayEyeTrack() {
  const c = leapXY(WS.leap, boatLeft(), boatSinkPx());
  WS.pupilDx = clamp((c.x - WS.sunX) * 0.12, -STAY_LOOK, STAY_LOOK);
}
// His one word, in his bubble, shown for STAY_LEAP_AT - STAY_SAY_AT and hidden as he launches.
function staySay() { UI.think(tr(STAY_WORD), { side: 'companion', more: false }); }
// Sunk: he floats, so there is nothing to crouch on and nothing to rock.
function stayCrouch() { if (!swimming()) { WS.companionStand = 0; WS.companionCrouch = 1; } }
const sternX = () => boatLeft() + COMP_DX + 4;
// Stay's water, thrown up pale (the bone accent and the star white) so it reads on the glare and the ridge
// alike: tall drops from x, spread w wide, pushed by vx0 and vx, rising to vy.
const STAY_WATER = [22, 20, 12];
function stayBurst(x, y, n, w, vx0, vx, vy) {
  for (let k = 0; k < n; k++) PARTS.push({ x: x + (Math.random() - 0.5) * w, y, vx: vx0 + (Math.random() - 0.5) * vx, vy: -vy * (0.35 + Math.random() * 0.65), life: 0, max: 1.6, v: STAY_WATER[k % 3], floor: y + 1, g: 150, tall: true });
}
function stayPushOff() {
  UI.thinkHide();
  WS.companionStand = 0; WS.companionCrouch = 0;
  if (!swimming()) { WS.rock = 2.2; tween(WS, 'rock', 0, 1.6); }
  const x = sternX();
  ring(x, WL + 1); ring(x + 4, WL + 2); stayBurst(x + 4, WL - 1, 22, 10, 26, 44, 70); SFX.plop(); SFX.whoosh();
}
function stayFlight(t) {
  WS.leap = clamp((t - STAY_LEAP_AT) / STAY_LEAP_DUR, 0, 1);
  WS.eyeWide = E.io(WS.leap);
  stayEyeTrack();
}
// He lands and hangs on: the glow spikes for two frames (skipped for reduced motion), the crunch, the creak.
function stayImpact(s) {
  if (!REDUCED_MOTION) WS.sunGlow = 2.4;
  WS.leap = 0; WS.cling = 1; WS.eyeWide = 1; s.yHit = WS.sunY;
  SFX.crunch(); SFX.creak(STAY_STRAIN); goldFishFade(STAY_STRAIN + STAY_DROP);
}
// The line takes his weight: it bows and shivers harder, the disc sags and trembles.
function stayStrain(t, s) {
  const k = clamp((t - STAY_HIT) / STAY_STRAIN, 0, 1);
  WS.strain = 0.35 + 0.65 * k;
  WS.sunY = s.yHit + Math.round(STAY_SAG * k) + (REDUCED_MOTION ? 0 : ((t * 24) | 0) & 1);
}
function staySnap(s) { SFX.snap(); SFX.snapLow(); s.ySnap = WS.sunY; }
// The disc and he fall together; the upper line recoils, whipping; where they meet the water, the splash.
function stayFall(t, dt, s) {
  const k = clamp((t - STAY_SNAP) / STAY_DROP, 0, 1);
  WS.sunY = lerp(s.ySnap, HY + 28, E.in(k));
  WS.stalkCut = clamp((t - STAY_SNAP) / 0.5, 0, 1);
  WS.strain = Math.max(0, 1 - (t - STAY_SNAP) / 0.6);
  WS.sunGlow = lerp(1.25, 0.12, clamp((t - STAY_SNAP - 0.1) / 1.8, 0, 1));
  if (!s.wet && WS.sunY + WS.sunR >= HY) { s.wet = t; stayDiscHitsWater(); }
  if (s.wet && t - s.wet < STAY_STEAM) staySteam(dt * STAY_STEAM_RATE * (1 - (t - s.wet) / STAY_STEAM), s);
}
function stayDiscHitsWater() {
  SFX.hiss(3); SFX.splash(); SFX.drone(false);
  ring(SUNX, HY + 3, true); ring(SUNX, HY + 3); ring(SUNX, HY + 5, true, 1.5);
  stayBurst(SUNX, HY, 40, 26, 0, 80, 105);
}
// Steam off the drowned sun: pale specks rising and drifting, thinning as they go (fade dithers them out).
function staySteam(n, s) {
  s.steam = (s.steam || 0) + n;
  for (; s.steam >= 1; s.steam--) PARTS.push({ x: SUNX + (Math.random() - 0.5) * 22, y: HY - 1, vx: (Math.random() - 0.5) * 7 + 2, vy: -6 - Math.random() * 10, life: 0, max: 1.4 + Math.random() * 0.8, v: STAY_WATER[(Math.random() * 2) | 0], floor: 9999, g: 0, fade: true });
}
function stayGoneUnder() { WS.companion = 0; WS.leap = 0; WS.cling = 0; WS.pupil = 0; WS.eyeWide = 0; }
// The red drains back to night: stars (none if frozen), no ash, the night glows, the lantern warmer.
function stayNight(t) {
  const k = clamp((t - STAY_UNDER) / STAY_NIGHT, 0, 1);
  if (k <= 0) return;
  WS.mood = lerp(2, 1, k); WS.starA = WS.frozen ? 0 : k; WS.ash = 1 - k;
  WS.horizGlow = lerp(1.3, 0.3, k); WS.lanternWarm = 0.6 * k;
}
const CINE_STAY = {
  dur: 16,
  init(s) {
    if (!swimming()) WS.companionStand = 1; // sunk: he leaps from the water, never stands on it
    tween(WS, 'pupilDx', STAY_LOOK, 0.4);
    G.hbGap = HB_GAP * 0.45; G.hb = Math.min(G.hb, 0.4); // the heartbeat quickens
  },
  update(t, dt, at, s) {
    at('say', STAY_SAY_AT, staySay);
    at('crouch', STAY_CROUCH_AT, stayCrouch);
    at('leap', STAY_LEAP_AT, stayPushOff);
    if (t >= STAY_LEAP_AT && t < STAY_HIT && WS.companion > 0) stayFlight(t);
    at('hit', STAY_HIT, () => stayImpact(s));
    at('unspike', STAY_HIT + 0.07, () => { WS.sunGlow = 1.25; }); // the spike lasts two frames
    if (t >= STAY_HIT && t < STAY_SNAP) stayStrain(t, s);
    at('snap', STAY_SNAP, () => staySnap(s));
    if (t >= STAY_SNAP) stayFall(t, dt, s);
    at('under', STAY_UNDER, stayGoneUnder);
    stayNight(t);
    at('fade', STAY_FADE_AT, () => UI.fade(1, 3));
  },
};
// The released sky fish at the horizon fades out over dur and is cleared (Stay: with the dropping disc).
function goldFishFade(dur) {
  const g = WS.goldFish;
  if (g) tween(g, 'a', 0, dur, E.lin, () => { if (WS.goldFish === g) WS.goldFish = null; });
}
// The released sky fish drops below the horizon with a splash (the cut and silent endings).
function goldFishDrop() {
  const g = WS.goldFish;
  if (!g) return;
  tween(g, 'y', g.surf - GOLD.h + 2, 0.45, E.in, () => {
    splash(g.x + 12, g.surf, 8); ring(g.x + 12, g.surf + 1); SFX.splash();
    tween(g, 'a', 0, 0.2, E.lin, () => { if (WS.goldFish === g) WS.goldFish = null; });
  });
}
// The cut, or (silent) the line going slack: no snap, and the stalk sinks with the disc. No caption on
// the cut itself: the interrupted word, the snap and the splash say it. Silent gets `The line goes slack.`
// Phase 21: the dawn shows what the card says (bible, section 8, Still water), from the state the composer
// reads: at sea with the fish heard the shapes lead the boat to a new shore (12; 14 has no path); at sea
// without them, or sunk there, the camera pulls back to a speck (11, 13); on the lake with the boat sunk he
// swims ashore and wakes in the water again above the gold (10); the lake boat rows away (9, and Silent).
function cutVariant(silent) {
  if (silent) return 'row';
  if (WS.sea > 0.5) return STORY.heard ? 'shore' : 'speck';
  return swimming() ? 'loop' : 'row';
}
const CUT_DUR = { row: 17.5, shore: 17.5, speck: 17.5, loop: 15 };
const CUT_ROW_AT = 11, CUT_ROW_DUR = 6.5, CUT_ROW_PX = 120;
const rowAway = (t, from, dur) => (t > from ? E.io(clamp((t - from) / dur, 0, 1)) * CUT_ROW_PX : 0);
const SHORE_AT = 7, SHORE_RISE = 4, SHORE_ROW = 10, SHORE_ROW_DUR = 7.5, SHORE_FADE = 15;
function cutShore(t, at) {
  at('gather', 6, gatherShoal);
  WS.newShore = E.io(clamp((t - SHORE_AT) / SHORE_RISE, 0, 1));
  WS.boatX = rowAway(t, SHORE_ROW, SHORE_ROW_DUR);
  at('fade', SHORE_FADE, () => UI.fade(1, 2.5));
}
const SPECK_FAR = 8, SPECK_DRIFT = 1.2, SPECK_FADE = 15.5;
function cutSpeck(t, at) {
  WS.far = E.io(clamp((t - 6) / camDur(SPECK_FAR), 0, 1));
  WS.farDrift = Math.max(0, t - 6 - SPECK_FAR) * SPECK_DRIFT;
  at('fade', SPECK_FADE, () => UI.fade(1, 2));
}
const LOOP_SWIM = 3.5, LOOP_PX = 58, LOOP_BLACK = 9.7, LOOP_WAKE = 10.1, LOOP_BACK = 10.7, LOOP_FADE = 13.7;
function cutLoop(t, at) {
  WS.boatX = t < LOOP_WAKE ? -E.io(clamp((t - 6) / LOOP_SWIM, 0, 1)) * LOOP_PX : 0;
  at('black', LOOP_BLACK, () => UI.fade(1, 0.1));
  at('wake', LOOP_WAKE, () => { WS.goldBelow = 1; });
  at('back', LOOP_BACK, () => UI.fade(0, 1));
  at('fade', LOOP_FADE, () => UI.fade(1, 1.3));
}
const CUT_MOVE = { row: t => { WS.boatX = rowAway(t, CUT_ROW_AT, CUT_ROW_DUR); }, shore: cutShore, speck: cutSpeck, loop: cutLoop };
const cutCine = (silent, v = cutVariant(silent)) => ({
  dur: CUT_DUR[v],
  init(s) { s.y0 = WS.sunY; s.tr0 = WS.troubled; },
  update(t, dt, at, s) {
    at('cut', 0.15, () => {
      if (silent) { if (G.bob) G.bob.taut = false; SFX.splash(); }
      else { WS.lineCut = true; G.bob = null; SFX.snap(); if (WS.gold > 0) tween(WS, 'gold', 0, 0.8); }
      WS.shoalOut = 1;
      goldFishDrop();
      splash(SUNX - 3, HY + 2, 6);
    });
    at('stalk', 1.0, () => { if (!silent) SFX.snap(); });
    if (t > 1.0 && !silent) WS.stalkCut = clamp((t - 1) / 0.7, 0, 1);
    if (t < 6) WS.sunY = lerp(s.y0, HY + 28, E.in(clamp((t - 1.1) / 1.5, 0, 1)));
    at('hiss', 2.5, () => { SFX.hiss(2.2); ring(SUNX, HY + 3, true); ring(SUNX, HY + 3); WS.pupil = 0; SFX.drone(false); });
    if (t < 6) {
      WS.sunGlow = lerp(1.25, 0, clamp((t - 2.4) / 1.5, 0, 1));
      WS.horizGlow = lerp(1.3, 0.15, clamp((t - 2.4) / 2, 0, 1));
    }
    WS.mood = t < 3 ? 2 : t < 6 ? lerp(2, 1, (t - 3) / 3) : lerp(1, 0, clamp((t - 6) / 6, 0, 1));
    WS.ash = 1 - clamp((t - 2) / 3, 0, 1);
    WS.starA = t < 3 ? 0 : t < 6 ? (t - 3) / 3 : 1 - clamp((t - 6) / 3, 0, 1);
    WS.troubled = lerp(s.tr0, 0, clamp((t - 3) / 8, 0, 1));
    at('dawn', 6, () => {
      WS.sunKind = 0; WS.sunR = 8; WS.stalk = 0; WS.stalkCut = 0; WS.companionTurn = 0; WS.frozen = 0;
      if (silent) G.bob = null;
      if (WS.cabin > 0) tween(WS, 'cabinLit', 0, 1.5); // the window goes dark; the cabin stays
      keptOver(!silent); // kept: the fish goes over the side; the silent ending says nothing about it
    });
    if (t >= 6) {
      const kd = clamp((t - 6) / 6.5, 0, 1);
      WS.sunY = lerp(HY + 14, SUN0Y, E.out(kd));
      WS.sunGlow = kd;
      WS.horizGlow = lerp(0.15, 1, kd);
    }
    if (t > 9) WS.lantern = 1 - clamp((t - 9) / 2, 0, 1);
    CUT_MOVE[v](t, at);
    at('cap', 3.4, () => { if (silent) cap('The line goes slack.', 3); });
  },
});

// ---------------------------------------------------------------- story
// The script is docs/story.md. The golden fish speaks in every act, including the red.
const FISHN = 'Golden fish';
const narr = text => ({ who: '', text, style: 'narr' });
const fish = text => ({ who: FISHN, text });
const red = text => ({ who: FISHN, text, style: 'red' });
const whisperFish = text => ({ who: FISHN, text, style: 'whisper' });
// The companion's lines go in his thought bubble (bible, 4b), never the panel.
const comp = (text, extra) => Object.assign({ who: 'Companion', text, bubble: true }, extra);
// The lake's one line (bible, section 4): a labelled whisper in the dialogue panel, shown from inside the red
// cinematic. DLG is inactive there, so the text appears whole and the cinematic hides the panel itself.
const placeWord = () => WS.sea > 0.5 ? 'sea' : 'lake'; // the lake, or the open sea after the fish wish
function lakeWhisper(text) { UI.dlgShow(tr(WS.sea > 0.5 ? 'The sea' : 'The lake'), 'whisper'); UI.dlgText(tr(text)); }
function goldenScene() {
  G.bob = null;
  WS.goldFish = { x: 26, y: 240, a: 0, surf: 263 };
  tween(WS.goldFish, 'a', 1, 0.8);
  splash(42, 262, 10); ring(42, 264); ring(42, 264, true);
  SFX.chime();
  if (STORY.act === 0) wish1(); else wish2();
}
// Kept, act 1: the fish speaks from the boat with no surfacing splash (bible, Act 1).
// Its still caption shows here, right before the greeting, not a whole catch earlier.
const KEPT_STILL_HOLD = 2.4;
function keptScene() {
  G.bob = null;
  tween(WS, 'goldKept', 1, 0.8);
  cap(stillCaption(), 3.2);
  dlgRun([{ pause: KEPT_STILL_HOLD }], wish2);
}
function goldenDive() {
  const g = WS.goldFish;
  if (!g) return;
  splash(g.x + 12, g.surf, 8); ring(g.x + 12, g.surf + 1);
  SFX.splash();
  tween(g, 'a', 0, 0.5, E.io, () => { if (WS.goldFish === g) WS.goldFish = null; });
}
// The kept fish dims one rung of the ladder as the scene ends (0.7 after wish 1, 0.45 after wish 2).
function keptDim(act) { if (STORY.kept) tween(WS, 'goldKept', KEPT_LADDER[act], 1.5); }
// Keep it: the sky fish is lifted into the boat, where it stays for the rest of the run.
function keptLift() {
  goldFishFade(0.4);
  tween(WS, 'goldKept', 1, 1);
  splash(42, 262, 5); SFX.splash();
}
// The kept fish goes over the side (the still-water dawn; silently after the silent ending).
function keptOver(withCaption) {
  if (!STORY.kept || WS.goldKept <= 0) return;
  const x = boatLeft() + KEPT_DX + 8;
  splash(x, WL, 8); ring(x, WL + 1); SFX.splash();
  tween(WS, 'goldKept', 0, 0.3, E.lin);
  if (withCaption) cap(swimming() ? 'You let the golden fish go.' : 'You lift the golden fish over the side.', 3);
}
function startAct(act) { STORY.act = act; STORY.actCatches = 0; STORY.actSeen = []; }

// -- golden scene 1 and wish 1
// The fish's first line changes on a later run (bible, sections 4 and 7).
function greeting1() {
  if (!isLaterRun()) return 'Wait. Don’t gut me, fisherman.';
  if (RUN.last === 'home') return 'Back out already? It doesn’t usually let go.';
  if (RUN.last === 'cut') return 'You cut the line last time. It’s the same line.';
  return 'You again. Or someone wearing you.';
}
function wish1() {
  dlgRun([
    { pause: 3 },
    fish(greeting1()),
    fish('Something interesting, you said. Here I am.'),
    { who: FISHN, text: 'Put me back and I’ll grant you a wish. Three, if you’re patient.', choices: [
      { label: 'Let it go', pick: () => wish1b(false) },
      { label: 'Keep it', pick: () => wish1b(true) },
    ] },
  ]);
}
// Keep it lifts the fish into the boat (keptLift); it dims each act and speaks from there (drawKeptFish).
function wish1b(kept) {
  STORY.kept = kept;
  const L = kept ? [
    { act: keptLift },
    narr('You lift it into the boat. It is heavier than a fish.'),
    fish('Cold hands. He had cold hands too.'),
    fish('Keep me, then. The wish comes anyway.'),
  ] : [fish('Kind. Nobody kind comes out this far alone.')];
  dlgRun(L.concat([
    fish(isLaterRun() ? 'First time here, you said. You said that last time too.' : 'First time here, you said. Nobody comes here twice.'),
    { who: FISHN, text: 'What would you like, fisherman?', choices: [
      { label: 'Someone to sit with me', pick: () => grant1('company') },
      { label: 'Take me where the fish are', pick: () => grant1('fish') },
      { label: 'A home on the shore', pick: () => grant1('home') },
      { label: 'Nothing', pick: refuse1 },
    ] },
  ]));
}
const GRANT1 = {
  company: () => [
    { who: FISHN, text: 'Who?', choices: [{ label: 'Doesn’t matter. Someone', pick() { /* the list continues */ } }] },
    { act: () => { tween(WS, 'companion', 1, 2.2); SFX.chime(); } },
    fish('Someone. You didn’t ask who.'),
    fish('If they ask you anything, don’t answer.'),
  ],
  home: () => [
    { act: () => { WS.cabinLit = 1; tween(WS, 'cabin', 1, 2.2); SFX.chime(); } },
    fish('A home on the shore. One has just come free.'),
    fish('Every light out here is for someone. That one is for you.'),
  ],
};
// The cost: the sun starts dropping as the first cost line begins. No caption; the drop is the sentence.
const costLines = () => [
  { act: sunDrop },
  fish('A wish costs a little daylight. You said you could stay out here forever.'),
  fish('You’ll get to.'),
  { act: () => { goldenDive(); keptDim(1); } },
  { pause: 0.8 },
];
function afterGrant1() { startAct(1); setPhase('ready'); }
function grant1(w) {
  STORY.wishes.push(w); STORY.firstAsk = w;
  if (w === 'fish') { dlgRun([fish('Where the fish are. I know a spot. Hold on to something.')], () => playCine(CINE_OCEAN, oceanTold)); return; }
  dlgRun(GRANT1[w]().concat(costLines()), afterGrant1);
}

// -- the ocean (bible, sections 4 and 8). The shore sinks into the sky for good, the boat shrinks to a speck
// on a vast lit sea, huge shadows drift to the horizon, and one vast fish settles with its head under the boat.
const OCEAN_FAR_DUR = 8, OCEAN_SPAWN_T = 1.4, OCEAN_SPAWN_GAP = 0.35, OCEAN_BIG_T = 11.5, OCEAN_CROSS = 7, OCEAN_WINDOW = 10, OCEAN_RETURN = 2.5, OCEAN_FADE_IN = 3;
function spawnOceanShadow(size) {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -10 + Math.random() * W * 0.45 : W + 10 - Math.random() * W * 0.45; // already in the water, fading in
  const s = { x, y: HY + 30 + Math.random() * (H - HY - 50), size, a: 0, fade: 0 };
  s.vx = (fromLeft ? 1 : -1) * (5 + Math.random() * 6); s.vy = -(1.5 + Math.random() * 2.5);
  s.dir = s.vx >= 0 ? 1 : -1;
  OCEAN.shad.push(s);
}
// The open sea (bible, The open sea): a few giant shapes keep passing beneath at a slow rate, all toward the
// horizon, at every mood for the rest of the run. One that arrives comes back in at the bottom (or leaves for
// good at the still-water dawn, with shoalOut).
const SEA_SHOAL = 5, SEA_HURRY = 4, SHOAL_FADE_IN = 0.7;
function seaShadow(s, y) {
  const x = Math.random() * W, vx = (WS.sunX - x) / 60;
  return Object.assign(s, { x, y, size: 2 + ((Math.random() * 3) | 0), a: 1, fade: 0, vx, vy: -(1 + Math.random() * 1.2), dir: vx >= 0 ? 1 : -1, sea: true });
}
function spawnSeaShoal() {
  OCEAN.shad.length = 0;
  for (let k = 0; k < SEA_SHOAL; k++) OCEAN.shad.push(seaShadow({}, HY + 30 + Math.random() * (H - HY - 50)));
}
// At rest its head end lies along the horizon under the speck (phase 33): the centre row BIG_REST_DY rows under
// the horizon, the snout BIG_SNOUT_LEAD px right of the speck, where the breaching head's snout comes up, and
// the body running down and left toward the camera.
const BIG_REST_DY = 4, BIG_SNOUT_LEAD = 26;
const bigRestY = () => HY + BIG_REST_DY;
const bigRestX = () => lungeCx() + BIG_SNOUT_LEAD;
// While crossing it is nearer: BIG_NEAR_DY rows lower and its head end BIG_NEAR_T0 thick (the same fish, only
// closer); it swims away from the camera to the boat, rising to the horizon and thinning as it goes.
const BIG_NEAR_DY = 26, BIG_NEAR_T0 = 5.5;
// The big one (bible, section 8) does not rise from below: after the shoal has swum alone for a while its head
// comes in at the left edge, near and faint (its presence a rising from 0 over OCEAN_FADE_IN seconds), crosses
// over OCEAN_CROSS seconds slowing all the way, rising toward the horizon as it goes, and settles with its head
// under the boat (bigRestX). drawBigShadow reads a.
function bigEnter() {
  const restY = bigRestY();
  OCEAN.big = { x: -6, y: restY + BIG_NEAR_DY, t0: BIG_NEAR_T0, a: 0, crossing: true };
  tween(OCEAN.big, 'x', bigRestX(), OCEAN_CROSS, E.out2, () => { if (OCEAN.big) OCEAN.big.crossing = false; });
  tween(OCEAN.big, 'y', restY, OCEAN_CROSS, E.io);
  tween(OCEAN.big, 't0', BIG_T0, OCEAN_CROSS, E.io);
  tween(OCEAN.big, 'a', 1, OCEAN_FADE_IN, E.io);
}
// For the shots: the big one already at rest under the boat.
function bigRise() {
  bigEnter();
  const b = OCEAN.big;
  untween(b, 'x'); untween(b, 'y'); untween(b, 't0'); untween(b, 'a');
  Object.assign(b, { x: bigRestX(), y: bigRestY(), t0: BIG_T0, a: 1, crossing: false });
}
// The smaller shapes scatter from the big one as its head reaches them, one by one, not all at once.
const SCATTER_AHEAD = 40;
function scatterFrom(b) {
  for (const s of OCEAN.shad) {
    if (s.fade > 0 || s.x > b.x + SCATTER_AHEAD || s.x < b.x - BIG_LEN) continue;
    const dx = s.x - b.x + BIG_LEN * 0.3, dy = s.y - b.y, n = Math.hypot(dx, dy) || 1;
    s.vx = (dx / n) * 70; s.vy = (dy / n) * 25 - 6; s.fade = 2; s.dir = s.vx >= 0 ? 1 : -1;
  }
}
// Still water at sea with the fish heard (bible, section 8): at the dawn the giant shapes gather in a line
// just right of the boat, all facing right, and lead it as it rows. Old ones are kept, missing ones come up
// from below; each steers to its slot (leadSlot), which moves with the boat.
const LEAD_N = 5, LEAD_SIZES = [3, 2, 4, 2, 3], LEAD_PULL = 0.8;
const leadSlot = k => ({ x: boatLeft() + 44 + k * 8, y: WL + 16 + k * 14 });
function gatherShoal() {
  const keep = OCEAN.shad.filter(s => s.sea && s.fade <= 0).slice(0, LEAD_N);
  while (keep.length < LEAD_N) keep.push(seaShadow({}, H + 14));
  keep.forEach((s, k) => Object.assign(s, { lead: k, size: LEAD_SIZES[k], fade: 0 }));
  OCEAN.shad.length = 0;
  OCEAN.shad.push(...keep);
}
function steerLead(s, dt) {
  const p = leadSlot(s.lead), f = Math.min(1, dt * LEAD_PULL);
  s.x += (p.x - s.x) * f;
  s.y += (p.y + Math.sin(G.t * 0.8 + s.lead) * 2 - s.y) * f;
  s.dir = 1;
  s.a = Math.min(1, s.a + dt);
}
function updOcean(dt) {
  const hurry = WS.shoalOut ? SEA_HURRY : 1;
  for (let k = OCEAN.shad.length - 1; k >= 0; k--) {
    const s = OCEAN.shad[k];
    if (s.lead !== undefined) { steerLead(s, dt); continue; }
    s.x += s.vx * dt; s.y += s.vy * (s.sea ? hurry : 1) * dt;
    if (s.fade > 0) { s.a -= dt / s.fade; if (s.a <= 0) { OCEAN.shad.splice(k, 1); continue; } } else if (s.a < 1) s.a = Math.min(1, s.a + dt * SHOAL_FADE_IN);
    if (s.y < HY + 4 + s.size * 2) {
      if (s.sea && WS.shoalOut) { OCEAN.shad.splice(k, 1); continue; }
      if (s.sea) seaShadow(s, H - 10); else { s.y = H - 10; s.x = Math.random() * W; }
    }
    if (s.x < -60 || s.x > W + 60) s.vx = -s.vx, s.dir = -s.dir;
  }
  if (OCEAN.big && OCEAN.big.crossing) scatterFrom(OCEAN.big);
  if (G.phase === 'ocean' && !OCEAN.hint && G.pt >= OCEAN_GRACE) { OCEAN.hint = true; refreshPrompt(); } // the prompt after the grace
  if (G.phase === 'ocean' && G.pt >= OCEAN_WINDOW) oceanLeave();
}
const CINE_OCEAN = {
  dur: OCEAN_BIG_T + OCEAN_CROSS,
  init(s) {
    OCEAN.tr0 = WS.troubled; OCEAN.shad.length = 0; OCEAN.big = null;
    tween(WS, 'far', 1, camDur(OCEAN_FAR_DUR), E.io); tween(WS, 'sea', 1, OCEAN_FAR_DUR, E.io); tween(WS, 'troubled', 0.15, 2);
    s.next = OCEAN_SPAWN_T; s.n = 0;
  },
  update(t, dt, at, s) {
    at('snd', 0, () => SFX.swell());
    if (s.n < 12 && t >= s.next) { s.next += OCEAN_SPAWN_GAP; s.n++; spawnOceanShadow(2 + Math.round((s.n / 12) * 4)); } // a dozen, the shoal alone for a while
    at('big', OCEAN_BIG_T, () => { bigEnter(); SFX.weight(true); }); // no stinger: the swell rises with the crossing
  },
};
// The tap that dismisses the warning must not also cast: the first second of the window ignores taps. After
// it the prompt comes back and a pale ring pulses on the big one's head end just ahead of the speck, where the
// float would land (oceanMark, drawOceanMarker).
const OCEAN_GRACE = 1.0, MARK_DX = 7, MARK_DY = 1, SURGE_DUR = 2.2;
function oceanTold() {
  dlgRun([fish('Here. I wouldn’t cast while it’s under you. It’s been waiting longer than you have.')], () => { OCEAN.hint = false; setPhase('ocean'); });
}
function oceanMark() {
  const b = OCEAN.big, x = lungeCx() + MARK_DX;
  return { x, y: Math.round((b ? bigRowAt(b, x) : bigRestY()) + MARK_DY) };
}
const MARK_RING = [[-1, -1], [0, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [0, 1], [1, 1]]; // 5 px wide, flat on the water
function drawOceanMarker(t) {
  if (G.phase !== 'ocean' || G.pt < OCEAN_GRACE || !OCEAN.big) return;
  const m = oceanMark(), v = 9 + Math.round(1 + Math.sin(t * 2.2)); // 9 to 11, slowly
  for (const [dx, dy] of MARK_RING) {
    const x = m.x + dx, y = m.y + dy;
    if (x >= 0 && x < W && y > HY && y < H) FRAME[y * W + x] = v;
  }
}
// The choice is made by input: a cast while the big one is under the boat is the Swallowed ending; waiting the
// window out lets it leave. Skip fish counts as a cast here.
function oceanCast() {
  STORY.ocean = 'swallowed'; // the weight holds through the lunge and fades as it swims off (bigSwimsOff)
  playCine(CINE_SWALLOW, () => showEnding('swallowed'));
}
// Swallowed (bible, section 8, phase 25): one continuous lunge seen from the water. The float lands on the big
// one's head; after a beat its head rises out of the sea round the speck with the mouth open along the
// waterline, the speck and a sheet of water tip in, the mouth closes, the head sinks, the water closes with a
// splash and three rings, and its shadow swims off right along the horizon. The empty sea, then black and the
// card. Phases 32 and 33, one fish: the shadow draws in to its head end under the speck as it tips up
// (shadowUp), is gone while the head is out (shadowGone), re-forms at the rings as the head sinks and extends
// back to its rest pose (shadowBack), then swims on the way it faces (bigSwimsOff).
const SW = {
  up: 1.0, upDur: 0.8, gone: 1.7, goneDur: 0.4, back: 5.5, backA: 1.0, backDur: 1.4,
  fly: 0.7, bulge: 1.3, bulgeDur: 0.5, rise: 1.5, riseDur: 1.4, gape: 1.65, gapeDur: 1.1, gulp: 2.9, gulpDur: 1.0,
  close: 3.9, closeDur: 0.5, sink: 4.4, sinkDur: 1.4, splash: 5.6, sloshDur: 1.2, swim: 7.0, swimDur: 2.5, black: 10.7,
};
const SPRAY_N = 60, RING_GAP = 0.3;
function swallowFloat(t, at, s) {
  if (t < SW.fly) { const k = t / SW.fly; G.bob = { x: lerp(s.from.x, s.to.x, k), y: lerp(s.from.y, s.to.y, k) - Math.sin(k * Math.PI) * 14, fly: true }; }
  at('land', SW.fly, () => { G.bob = { x: s.to.x, y: s.to.y, fly: false }; ring(s.to.x, s.to.y + 1); SFX.plop(); });
  at('float', SW.bulge, () => { if (G.bob) ring(G.bob.x, G.bob.y + 1); G.bob = null; }); // pulled under as it rises
}
function lungeBulge() { tween(WS, 'bulge', 1, SW.bulgeDur, E.io); SFX.surge(); }
function lungeRise() {
  tween(WS, 'lunge', 1, SW.riseDur, E.out); tween(WS, 'streak', 1, 0.6);
  WS.shed = 1; tween(WS, 'shed', 0, SHED_DUR, E.lin); // sheets of water slide off the snout
}
// The shadow and the head are one fish (phase 33). Coming up, it tips toward the surface: the body draws in to
// the head end along the horizon under the speck (k to SHADOW_IN), its tail lifting, while the head end darkens
// and thickens, and the head breaches out of that spot, its snout where the shadow's was; the shadow is gone as
// the head clears the water. Sinking, the head end re-forms at the rings' row, pale at first, and the body
// extends back out toward the camera to its full length (shadowBack), before it swims on (bigSwimsOff).
function shadowUp() {
  const b = OCEAN.big;
  if (!b) return;
  Object.assign(b, { k: 1, dk: 0 });
  tween(b, 'k', SHADOW_IN, SW.upDur, E.in); tween(b, 'dk', 1, SW.upDur, E.io);
}
function shadowGone() { if (OCEAN.big) tween(OCEAN.big, 'a', 0, SW.goneDur, E.in); }
function shadowBack() {
  const b = OCEAN.big;
  if (!b) return;
  Object.assign(b, { x: bigRestX(), y: bigRestY(), a: 0, k: SHADOW_IN, dk: 1 });
  tween(b, 'a', 1, SW.backA, E.out); tween(b, 'k', 1, SW.backDur, E.io); tween(b, 'dk', 0, SW.backDur, E.io);
}
function lungeGape() { tween(WS, 'gape', 1, SW.gapeDur, E.out); tween(WS, 'bulge', 0, SW.gapeDur); }
function waterCloses() {
  spray(lungeCx(), HY, SPRAY_N); SFX.douse();
  tween(WS, 'slosh', 1, SW.sloshDur, E.lin);
}
function lungeSink() { tween(WS, 'lunge', 0, SW.sinkDur, E.in); tween(WS, 'streak', 0, SW.sinkDur); }
function spray(x, y, n) { // the water closing: tall spray that rises and falls back to the horizon
  for (let k = 0; k < n; k++) PARTS.push({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 64, vy: -32 - Math.random() * 66, life: 0, max: 1.6, v: Math.random() < 0.55 ? 11 : 10, floor: y + 1, g: 115, tall: true });
}
// It swims on the way it faces, right along the horizon and a little down into the deep, fading as a whole at
// its rest size (bigLeaves), in Swallowed and when the window is waited out alike.
const BIG_LEAVE_DY = 10;
function bigLeaves(dur) {
  const b = OCEAN.big;
  if (!b) return;
  b.crossing = false;
  tween(b, 'x', W + BIG_LEN * 0.6, dur, E.in, () => { if (OCEAN.big === b) OCEAN.big = null; });
  tween(b, 'y', b.y + BIG_LEAVE_DY, dur, E.io);
  tween(b, 'a', 0, dur, E.in);
}
function bigSwimsOff() { SFX.weight(false); bigLeaves(SW.swimDur); }
const CINE_SWALLOW = {
  dur: SW.black + 0.4,
  init(s) {
    s.from = { x: G.tip ? G.tip.x : W / 2, y: WL - 2 }; s.to = oceanMark();
    G.bob = { x: s.from.x, y: s.from.y, fly: true };
    SFX.whoosh();
  },
  update(t, dt, at, s) {
    swallowFloat(t, at, s);
    at('cap', 1.1, () => cap('The float lands on something that is not water.', 3.2));
    at('up', SW.up, shadowUp);
    at('bulge', SW.bulge, lungeBulge);
    at('rise', SW.rise, lungeRise);
    at('gone', SW.gone, shadowGone);
    at('gape', SW.gape, lungeGape);
    at('gulp', SW.gulp, () => tween(WS, 'gulp', 1, SW.gulpDur, E.in));
    at('close', SW.close, () => tween(WS, 'gape', 0, SW.closeDur, E.in));
    at('slam', SW.close + SW.closeDur * 0.8, () => SFX.slam());
    at('sink', SW.sink, lungeSink);
    at('back', SW.back, shadowBack);
    at('splash', SW.splash, waterCloses);
    for (let k = 0; k < 3; k++) at('ring' + k, SW.splash + k * RING_GAP, () => ring(lungeCx(), HY + 3, true, 1.5 - k * 0.3));
    at('swim', SW.swim, bigSwimsOff);
    at('black', SW.black, () => UI.fade(1, 0.25));
  },
};
// Waited out: the camera comes back, the shore does not. The rest of the run is played on the open sea.
// No plea from him (phase 16): the fish only notes the shoal, then the cost.
function oceanLeave() {
  STORY.ocean = 'waited';
  playCine(CINE_OCEAN_BACK, () => dlgRun([
    fish('Look how they all go the same way.'),
  ].concat(costLines()), afterGrant1));
}
// The big one swims on the way it faces (bigLeaves, as in Swallowed), then the boat comes back to full size
// while sea stays 1: an empty horizon, the giant shapes still passing beneath, the shoal spawned. No caption.
const CINE_OCEAN_BACK = {
  dur: OCEAN_RETURN * 2 + 0.6,
  init() { SFX.weight(false); bigLeaves(OCEAN_RETURN); },
  update(t, dt, at) {
    at('back', OCEAN_RETURN, () => {
      spawnSeaShoal();
      tween(WS, 'far', 0, camDur(OCEAN_RETURN), E.io); tween(WS, 'troubled', OCEAN.tr0, OCEAN_RETURN);
      WS.fishShadows = 1; spawnShadows();
    });
  },
};
// The sun drops in two visible steps, about 16 px over 5 s, and the water grows a little troubled.
const SUN_STEP = 8;
function sunDrop() {
  const y0 = WS.sunY;
  tween(WS, 'sunY', y0 + SUN_STEP, 1.6, E.io, () =>
    tween(WS, 'sunY', y0 + SUN_STEP, 1.4, E.lin, () =>
      tween(WS, 'sunY', y0 + 2 * SUN_STEP, 1.6, E.io)));
  tween(WS, 'troubled', 0.22, 5);
}
function refuse1() {
  STORY.refused = 1; STORY.firstAsk = 'nothing';
  dlgRun([
    { pause: 1.2 },
    fish('Nothing. Nobody asks for nothing. I’ll ask again.'),
    fish('You said you could stay out here forever. There’s time.'),
    { act: goldenDive },
    { pause: 0.8 },
  ], () => {
    startAct(1);
    cap('The lake stays glass.', 3);
    setPhase('ready');
  });
}

// -- golden scene 2 and wish 2
// Greeting by priority: kept and refused once > kept > refused once > default (bible, Golden scene 2).
function greeting2() {
  if (STORY.kept && STORY.refused === 1) return 'You cast anyway. Habit. Still wanting nothing?';
  if (STORY.kept) return 'You cast anyway. Habit. And this time?';
  if (STORY.refused === 1) return 'Back again. Still wanting nothing?';
  return 'Back so soon? I’d only just got down. And this time?';
}
// Home path (phase 23): the greeting stays as it is and the knocking line follows it, carrying the choices.
const KNOCK_LINE = 'Don’t mind the knocking. They’re not trying to get in.';
function wish2() {
  const choices = [
    { label: 'Make this day last forever', pick: () => grant2('forever') },
    { label: 'Let me hear the fish', pick: () => grant2('hear') },
    { label: 'Gold. A boat full of it', pick: () => grant2('gold') },
    { label: 'Nothing', pick: refuse2 },
  ];
  const ask = has('home') ? [fish(greeting2()), { who: FISHN, text: KNOCK_LINE, choices }] : [{ who: FISHN, text: greeting2(), choices }];
  dlgRun([{ pause: 0.9 }].concat(ask));
}
const GRANT2 = {
  forever: () => [
    { act: freezeDay },
    fish('That’s twice you’ve said forever. It’s a long time for a sun.'),
    fish('This one is tired. I know one that never sets.'),
  ],
  hear: () => [
    { act: () => { STORY.heard = true; SFX.chime(); } },
    fish('Listen, then. They all say the same thing.'),
  ],
};
// Forever: the clouds stop, the birds hang, the fish stop jumping and the sun holds until the sunset
// cinematic, which drives it directly (bible, 8b). Nothing says so.
function freezeDay() { WS.frozen = 1; G.frozeT = G.t; untween(WS, 'sunY'); SFX.chime(); }
// The lines that close a granted wish 2, then the sunset.
function wish2Cost() {
  return [
    fish(trJoin([STORY.refused === 1 ? 'That was my first, too.' : 'That was my second, too.', ' This one costs the rest of the day.'])),
    fish('You’ll miss the sun. I’ll bring you another.'),
    { act: () => { goldenDive(); keptDim(2); } },
    { pause: 0.6 },
  ];
}
const wish2Sunset = () => playCine(sunsetCine(false), afterSunset);
function grant2(w) {
  STORY.wishes.push(w);
  if (w === 'gold') { grantGold(); return; }
  dlgRun(GRANT2[w]().concat(wish2Cost()), wish2Sunset);
}
// Gold (bible, Wish 2 grants and section 8): the pile appears, the boat settles to the gunwales in the sink
// cutscene, then the apology and the usual cost lines.
function grantGold() {
  dlgRun([
    fish('Gold. A boat full of it.'),
    { act: () => { tween(WS, 'gold', 1, 1.5); SFX.chime(); } },
    { pause: 1.2 },
  ], () => playCine(CINE_SINK, () => dlgRun([fish('Sorry. Gold is heavy. You can always come back for it.')].concat(wish2Cost()), wish2Sunset)));
}
// The gold sink (6 s, bible section 8): boatSunk 0 to 1 over 4 s, the hull going under with bubbles along it,
// two rings and one glint of the gold as it goes. The fisherman is left swimming with the lantern beside him,
// for the rest of the run.
const SINK_DUR = 4;
const CINE_SINK = {
  dur: 6,
  init() { tween(WS, 'boatSunk', 1, SINK_DUR, E.io); SFX.hiss(3.5); },
  update(t, dt, at) {
    if (t < SINK_DUR && Math.random() < dt * 14) {
      const bx = boatLeft();
      bubble(bx + 4 + Math.random() * (BOAT.w - 10), WL + Math.random() * 3);
    }
    at('ring1', 1.4, () => ring(boatLeft() + BOAT.w * 0.35, WL + 2, true));
    at('glint', 1.8, () => { WS.glint = 1; SFX.tick(); });
    at('glintOff', 1.9, () => { WS.glint = 0; });
    at('under', SINK_DUR, () => { SFX.plop(); ring(boatLeft() + BOAT.w * 0.6, WL + 2, true); });
  },
};
function refuse2() {
  STORY.refused++;
  const L = STORY.refused === 2 ? [
    { pause: 1.2 },
    fish('Twice. Nobody asks for nothing twice. What are you?'),
  ] : [fish('Full already? It’s a little late for that.')];
  dlgRun(L.concat([
    fish('Then the sun sets for free. You’ll miss it. I’ll bring you another.'),
    { act: () => { goldenDive(); keptDim(2); } },
    { pause: 0.6 },
  ]), () => playCine(sunsetCine(true), afterSunset));
}
function afterSunset() {
  startAct(2);
  if (has('company')) companionQuestion(() => setPhase('ready'));
  else setPhase('ready');
}
// The companion's one question, right after the lantern lights. The mark is drawn wrong.
const CAP_FADE = 0.5; // the caption's CSS fade-out, waited out before the bubble
function companionQuestion(done) {
  const answer = yes => () => {
    STORY.answered = yes;
    dlgRun([narr(yes ? 'He does not turn around.' : 'He goes back to watching the horizon.')], done);
  };
  dlgRun([
    { pause: Math.max(0, G.capUntil - G.t) + CAP_FADE }, // the lantern caption finishes first: two texts never share the stage
    comp('Will you stay?', { mark: true, choices: [
      { label: 'Yes', pick: answer(true) },
      { label: 'Say nothing', pick: answer(false) },
    ] }),
  ], done);
}

// -- the red sequence and wish 3
// Refused twice replaces the whole set on either path (bible, Red sequence).
function redLines() {
  const L = STORY.refused === 2 ? ['One wish left. You said forever, then asked for nothing twice.', 'It wants to see why.']
    : STORY.kept ? ['I’m right here, fisherman.', 'One wish left. But first, the sun I promised you.', 'You said forever. I passed that on.']
      : ['One wish left. But first, the sun I promised you.', has('forever') ? 'You said forever, then you wished for it. I listened twice.' : 'You said forever. I listened.'];
  return L.map(fish);
}
function redSequence() {
  STORY.goldenNext = false;
  G.holding = false;
  if (G.bob) { G.bob.taut = true; tween(G.bob, 'x', SUNX - 3, 2.6); tween(G.bob, 'y', HY + 5, 2.6); }
  SFX.snapLow();
  dlgRun([
    { pause: 1.4 },
    narr('The line goes taut. You did not feel a bite.'),
    // Released: the fish appears above the horizon where the sun set. Kept: nothing appears in the sky;
    // the boat fish glows back to 1 and speaks from there (bible, Red sequence).
    { act: () => {
      if (STORY.kept) { tween(WS, 'goldKept', 1, 0.9); return; }
      WS.goldFish = { x: SUNX - 14, y: HY - 24, a: 0, surf: HY + 1 }; tween(WS.goldFish, 'a', 1, 0.9); SFX.chime();
    } },
    { pause: 2 }, // two seconds of silence, no caption
  ].concat(redLines()), () => playCine(CINE_RED, wish3));
}
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1) + '.';
// One line, up to 125 characters: the granted wishes in order, then always forever (bible, section 1).
function recountLine() {
  const parts = STORY.wishes.map(w => sentence(tr(RECOUNT[w])));
  return tr('Everything you asked for. ') + parts.join(' ') + tr(' And forever. Your words, not mine.');
}
function wish3Choices() {
  const c = [
    { label: 'Let me go home', pick: endHome },
    { label: 'Take the light away', pick: endDark },
    { label: 'Cut the line', pick: endCut },
  ];
  if (has('home')) c.push({ label: 'Let me in.', pick: endInside });
  if (STORY.answered === true) c.push({ label: 'Stay with him', pick: endStay });
  if (has('gold')) c.push({ label: 'Let me get my gold', pick: endDeep });
  if (STORY.refused === 2) c.push({ label: 'Nothing', pick: endSilent });
  return c;
}
// The bible's ordered list: seven lines at most before the buttons, five in a typical run.
function wish3() {
  const nothing = STORY.wishes.length === 0;
  const L = [
    red('There it is. Forever, like you said.'),
    red('That bait was never for fish. I should have said.'),
    red(nothing ? 'Nobody rows this far to want nothing. So why are you here.' : recountLine()),
  ];
  if (has('company')) L.push(comp(STORY.answered === true ? 'You said you’d stay.' : 'Don’t answer it. Cut the line.'));
  if (STORY.answered === true) L.push(red('You answered him. I did ask you not to.'));
  if (STORY.kept) L.push(whisperFish('I’m sorry.'));
  L.push(
    red('I sat where you sit. I said what you said. Three times.'),
    { who: FISHN, text: 'I’d like to go home now. What would you like.', style: 'red', choices: wish3Choices() },
  );
  dlgRun(L);
}

// -- endings
function endHome() {
  const L = [red('Home. Yes. Come inside.')];
  if (STORY.kept) L.push(whisperFish('Thank you.'));
  dlgRun(L, () => playCine(CINE_JAWS, () => showEnding('home')));
}
function endDark() {
  const L = [red('As you wish. Without light you won’t have to see the teeth.')];
  if (STORY.kept) L.push(whisperFish(swimming() ? 'Don’t leave me out here.' : 'Don’t leave me in the boat.'));
  dlgRun(L, () => playCine(CINE_DARK, () => showEnding('dark')));
}
function endCut() {
  dlgRun([
    narr(swimming() ? 'You reach for the knife in your belt.' : 'You reach for the knife on the gunwale.'),
    red('No. Nobody cuts the—'),
  ], () => playCine(cutCine(false), () => showEnding('cut')));
}
function endStay() {
  dlgRun([
    red('Stay with him. Two wishes, one seat.'),
    comp('He said he’d stay with me.'),
    red('He said a lot of things.'),
  ], () => playCine(CINE_STAY, () => showEnding('stay')));
}
// Deep (bible, sections 4 and 8): down for the gold. The horizon rises past the top of the screen and the
// mirror fills the frame, the palette dims, stars show below, the boat hangs from the surface as a dark
// shape seen from beneath, the gold glints once, then black. There is no bottom.
function endDeep() {
  dlgRun([red('It’s all still down there. Nobody comes back up with it.')], () => playCine(CINE_DEEP, () => showEnding('deep')));
}
const CINE_DEEP = {
  dur: 14,
  init(s) {
    s.g0 = WS.sunGlow; s.h0 = WS.horizGlow; s.tr0 = WS.troubled;
    G.bob = null; G.tip = null; G.hbGap = 1e9;
    tween(WS, 'ash', 0, 3);
    if (WS.goldFish) tween(WS.goldFish, 'a', 0, 1.5); // the sky fish stays above; under the surface it is out of sight
    SFX.splash(); SFX.swell();
  },
  update(t, dt, at, s) {
    const k = E.io(clamp((t - 0.4) / camDur(6), 0, 1));
    WS.dive = k;
    if (k > DIVE_SWITCH && WS.lantern > 0) { untween(WS, 'lantern'); WS.lantern = 0; } // the lantern goes with the surface view, not after it
    WS.dim = 6 * clamp((t - 1) / 7, 0, 1);
    WS.sunGlow = lerp(s.g0, 0, clamp(t / 4, 0, 1));
    WS.horizGlow = lerp(s.h0, 0, clamp(t / 4, 0, 1));
    WS.troubled = lerp(s.tr0, 0.15, clamp(t / 5, 0, 1));
    WS.starA = clamp((t - 3) / 4, 0, 1);
    at('drone', 2, () => SFX.drone(false));
    at('glint', 8, () => { WS.glint = 1; SFX.tick(); });
    at('glintOff', 8.08, () => { WS.glint = 0; });
    at('fade', 12, () => UI.fade(1, 2));
  },
};
// Silent: nothing, asked a third time. Counts as Still water. Kept: the boat fish dims with no caption.
function endSilent() {
  const L = [narr('You say nothing.'), { pause: 3 }, narr(STORY.kept ? 'It waits. Then it goes dark in the bottom of the boat.' : 'It waits. Then it splashes its tail once and goes down.')];
  if (STORY.kept) L.push({ act: () => tween(WS, 'goldKept', 0.05, 1.5) });
  dlgRun(L, () => playCine(cutCine(true), () => showEnding('cut', 'silent')));
}
// Inside (phase 30, bible sections 4 and 8), the house path: let in. The eye turns to the cabin; the boat
// drifts to the shore under it (shrinking through the far ladder to the frame whose man is the walkers' size)
// while the camera pushes in toward the door; he steps out and walks up; the knocking stops; the door opens
// and someone darker steps out; they pass, he goes in, the door shuts; the other walks down, takes the boat,
// rows a little way out and casts. Three faint knocks, from inside. Sunk: he swims ashore, and the other walks
// down into the water toward the gold and goes under.
function endInside() {
  dlgRun([red('Of course. They’ve been waiting to get out.')], () => playCine(CINE_INSIDE, () => showEnding('inside')));
}
const INSIDE_LOOK = -7;              // pupilDx toward the cabin, left of the disc
// Phase 31: only the background zooms (sky, clouds, mountains, water, the eye: pushView after the composite);
// the cabin, the boat and the two people are drawn after it at full resolution (drawInsideClose), placed by
// the same mapping, screen = (world - VIEW origin) * zoom, so nothing in front is ever enlarged pixel by pixel.
const SHORE_AX = 100, PUSH_Z = 2.6;  // the boat's anchor at the shore, just off the foot under the cabin; the final zoom
const INSIDE_SS = [1, 0.94, 0.88, 0.82, 0.76, 0.71, 0.66, 0.62]; // the boat's screen size over the drift, from the full boat
const SS_END = INSIDE_SS[INSIDE_SS.length - 1];
const LIVE_K = 1 / 8;                // the live group drifts until the push reaches this, then the crisp ladder takes over
const SWAP_Z = 1.6, SWAP_DUR = 0.3;  // the small cabin hands over to the close one as the zoom passes 1.6
const CAB_AX = CABIN_X + CABIN_ROWS[0].length / 2, CAB_BY = CABIN_Y + CABIN_ROWS.length; // both cabins' foot, bottom centre
// A close-cabin pixel (column, row) in world coordinates: the close cabin is the small one seen at PUSH_Z.
const cabW = (px, py) => ({ x: CAB_AX + (px - CLOSE_CABIN.w / 2) / PUSH_Z, y: CAB_BY + (py - CLOSE_CABIN.h) / PUSH_Z });
const DOOR_G = cabW(21, 17.5), WIN_G = cabW(8.5, 15.5), DOOR_GLOW = 7;
const IN_CAM = { x: DOOR_G.x + 12, y: DOOR_G.y }; // the push-in's target: the door, with the shore and the boat in frame
const IN = {
  drift: 0.2, driftDur: 5, knockGap: 1.4, walk: 5.3, walkDur: 2.8, step: 0.5, open: 8.4, appear: 8.8, out: 9.3, outDur: 0.8,
  enter: 9.7, enterDur: 0.45, close: 10.5, down: 10.7, downDur: 1.4, row: 12.2, rowDur: 0.9, cast: 13.2,
  castDur: 0.5, under: 11.9, underDur: 1.4, knocks: [14.1, 14.55, 15], fade: 16.5, dur: 17.6,
};
const SWAP_T = IN.drift + IN.driftDur * Math.sqrt((SWAP_Z - 1) / (PUSH_Z - 1) / 2); // E.io inverted below one half
// The walkers' feet, in world coordinates: at the boat's seat (or, sunk, in the water where he swam), on the
// bank beside the boat, beside the door, in the doorway, past it, and (sunk) under the water.
const W_SEAT = { x: SHORE_AX - 5, y: HY - 2 }, W_SWIM = { x: SHORE_AX - 3, y: HY + 3 }, W_SHORE = { x: SHORE_AX - 13, y: HY - 1 };
const W_SIDE = cabW(29, 24), W_DOOR = cabW(21, 23), W_PASS = cabW(35, 24), W_UNDER = { x: SHORE_AX - 4, y: HY + 7 };
const ROW_DX = 4, ROW_DY = 3, CAST_SX = -30, CAST_SY = 14, CAST_ARC = 12; // rowing out (world); the cast (screen)
const span = (t, a, d) => clamp((t - a) / d, 0, 1);
function walkPose(p, a, b, t) {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), f: p > 0 && p < 1 ? ((t * 6) | 0) & 1 : 2, flip: b.x > a.x };
}
// The fisherman: in the boat until the walk, out onto the bank, up beside the door, then into it.
function insideMan(t, sunk) {
  if (t < IN.walk) return null;
  const bank = IN.walk + IN.step;
  if (t < bank) return walkPose(span(t, IN.walk, IN.step), sunk ? W_SWIM : W_SEAT, W_SHORE, t);
  if (t < IN.enter) return walkPose(span(t, bank, IN.walkDur - IN.step), W_SHORE, W_SIDE, t);
  return t < IN.enter + IN.enterDur ? walkPose(span(t, IN.enter, IN.enterDur), W_SIDE, W_DOOR, t) : null;
}
// Whoever was inside: in the doorway, out past him, then down to the boat and into it (or into the water).
function insideOther(t, sunk) {
  if (t < IN.appear) return null;
  if (t < IN.down) return walkPose(span(t, IN.out, IN.outDur), W_DOOR, W_PASS, t); // in the doorway first, blocking its light
  if (sunk) {
    if (t < IN.under) return walkPose(span(t, IN.down, IN.under - IN.down), W_PASS, W_SHORE, t);
    return t < IN.under + IN.underDur ? walkPose(span(t, IN.under, IN.underDur), W_SHORE, W_UNDER, t) : null;
  }
  const bank = IN.down + IN.downDur - IN.step;
  if (t < bank) return walkPose(span(t, IN.down, bank - IN.down), W_PASS, W_SHORE, t);
  return t < IN.down + IN.downDur ? walkPose(span(t, bank, IN.step), W_SHORE, W_SEAT, t) : null;
}
// The whole picture at time t: the boat (anchor, waterline, screen size, who is in it), the cabin hand-over
// and the walkers.
function insidePose(t, s) {
  const k = E.io(span(t, IN.drift, IN.driftDur)), row = E.io(span(t, IN.row, IN.rowDur));
  let boat = 'man';
  if (t >= IN.walk) boat = s.sunk ? null : t < IN.down + IN.downDur ? 'empty' : 'other';
  return {
    sunk: s.sunk, k, live: k < LIVE_K, ss: lerp(1, SS_END, k), boat, swap: span(t, SWAP_T - SWAP_DUR / 2, SWAP_DUR),
    man: insideMan(t, s.sunk), other: insideOther(t, s.sunk),
    ax: lerp(s.ax0, SHORE_AX, k) + ROW_DX * row, wl: lerp(WL, HY, k) + ROW_DY * row, cast: span(t, IN.cast, IN.castDur),
  };
}
const insideFar = () => !!(G.inside && !G.inside.live);
const insideSwap = () => (G.inside ? G.inside.swap : 0);
// Screen space for the Inside foreground: the world-to-screen mapping of the push-in (VIEW), and a stamp that
// writes straight into IDX after the zoom, with its reflection mirrored about its own waterline row and
// shifted by the zoomed ripple (the one reflection drawn by hand: the sky buffer it would come from is zoomed).
const sxW = x => (x - VIEW.x0) * VIEW.z, syW = y => (y - VIEW.y0) * VIEW.z;
let HYS = HY;
function putS(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < H) IDX[y * W + x] = v; }
const ripS = y => Math.round(RIPX[clamp((VIEW.y0 + y / VIEW.z) | 0, 0, H - 1)] * VIEW.z);
function putR(x, y, v, wl) {
  if (y >= wl) return; // masked by the surface
  putS(x, y, v);
  const yr = 2 * wl - 1 - y;
  if (yr >= HYS && yr < H && ((yr - wl) & 3) !== 2) putS(x + ripS(yr), yr, reflS(v));
}
// Paler than the thing and broken every fourth row, so a dark figure on the bright shore water reads once.
const reflS = v => (v >= 12 ? v : ci(v + 3));
// sc below 1 shrinks by nearest cells (the close cabin while the zoom is still short of PUSH_Z); a, the
// cross-fade, dithers on screen cells.
function stampS(s, x0, y0, wl, a = 1, flip = false, sc = 1) {
  const w = Math.round(s.w * sc), h = Math.round(s.h * sc);
  for (let j = 0; j < h; j++) {
    const y = y0 + j, sj = Math.min(s.h - 1, (j / sc) | 0) * s.w;
    for (let i = 0; i < w; i++) {
      const si = Math.min(s.w - 1, (i / sc) | 0), v = s.data[sj + (flip ? s.w - 1 - si : si)];
      if (v === 255 || (a < 1 && BAYER[((y & 3) << 2) | ((x0 + i) & 3)] >= a)) continue;
      putR(x0 + i, y, v, wl);
    }
  }
}
function lineS(x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x, u = IDX[i];
  IDX[i] = u >= 12 ? 11 : ci(u >= 7 ? u - 4 : u + 3);
}
// The Inside foreground, after the zoom: the live group (first beat only), the cabin, the boat, the people, ash.
function drawInsideClose(t) {
  const I = G.inside;
  HYS = Math.round(syW(HY));
  if (I.live) drawLiveShifted(t, I);
  drawCloseCabin(I);
  if (!I.live && I.boat) drawCloseBoat(I);
  drawWalker(I.other, WALK_OTHER);
  drawWalker(I.man, WALK_MAN);
  for (const a of ASH) putS(Math.round(a.x), Math.round(a.y), 10); // the ash falls in front of it all, crisp
}
// Before the ladder the live group is drawn as always and moved, not scaled, to where the mapping puts it.
function drawLiveShifted(t, I) {
  SPR.fill(255);
  drawBoatLive(t);
  drawLine();
  const dx = Math.round(sxW(I.ax) - I.ax), dy = Math.round(syW(WL) - WL);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = SPR[y * W + x];
    if (v !== 255) putS(x + dx, y + dy, v);
  }
  const lp = G.lanternPos; // the glows map world to screen: keep the lantern's light on the lantern
  G.lanternPos = { x: VIEW.x0 + (lp.x + dx) / VIEW.z, y: VIEW.y0 + (lp.y + dy) / VIEW.z };
}
const closeCabin = () => WS.door > 0.5 ? CLOSE_OPEN : WS.cabinLit < 0.5 || WS.cabinKnock > 0.5 ? CLOSE_DARK : CLOSE_CABIN;
function drawCloseCabin(I) {
  if (I.swap <= 0 || WS.cabin <= 0) return;
  const s = closeCabin(), sc = Math.min(1, VIEW.z / PUSH_Z);
  stampS(s, Math.round(sxW(CAB_AX) - s.w * sc / 2), Math.round(syW(CAB_BY) - s.h * sc), HYS, I.swap, false, sc);
}
function ladderAt(ss) {
  let best = 0;
  for (let i = 1; i < INSIDE_SS.length; i++) if (Math.abs(INSIDE_SS[i] - ss) < Math.abs(INSIDE_SS[best] - ss)) best = i;
  return best;
}
function drawCloseBoat(I) {
  const f = I.boat !== 'man' ? IN_EMPTY : (I.sunk ? IN_SWIM : IN_BOAT)[ladderAt(I.ss)];
  const wl = Math.round(syW(I.wl)), x0 = Math.round(sxW(I.ax)) - f.ax, y0 = wl - f.wl;
  G.tip = null;
  stampS(f, x0, y0, wl);
  if (I.boat === 'other') drawOtherSeated(x0 + f.ax + Math.floor((18 - BOAT.w / 2) * SS_END), wl - Math.round(6 * SS_END), wl, I.cast);
}
// Whoever was inside, in the stern seat with the rod out at rest, and the cast: a thin arc from the rod tip
// out onto the water, then the line settling with the float on it.
function drawOtherSeated(x, bottom, wl, q) {
  const s = OTHER_SEAT, y0 = bottom - s.h + 1;
  stampS(s, x, y0, wl);
  const hx = x + 1, hy = y0 + 6, L = ROD_LEN * SS_END, cx = Math.cos(REST_A), cy = Math.sin(REST_A);
  for (let k = 0; k <= L * 2; k++) putR(Math.round(hx + cx * k / 2), Math.round(hy + cy * k / 2), 0, wl);
  if (q > 0) drawInsideCast(Math.round(hx + cx * L), Math.round(hy + cy * L), q);
}
const bez = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;
let INSIDE_LAND = null;
function drawInsideCast(tx, ty, q) {
  const lx = tx + CAST_SX, ly = HYS + CAST_SY, cx = (tx + lx) / 2;
  const cy = q < 1 ? Math.min(ty, ly) - CAST_ARC : (ty + ly) / 2 + 3, m = Math.round(60 * q);
  for (let k = 0; k <= m; k++) lineS(bez(tx, cx, lx, k / 60), bez(ty, cy, ly, k / 60));
  if (q >= 1) { putS(lx, ly, 12); putS(lx + 1, ly, 12); }
  INSIDE_LAND = { x: VIEW.x0 + lx / VIEW.z, y: VIEW.y0 + ly / VIEW.z };
}
function drawWalker(p, set) {
  if (!p) return;
  const s = set[p.flip ? 1 : 0][p.f], fx = Math.round(sxW(p.x)), fy = Math.round(syW(p.y));
  stampS(s, fx - (s.w >> 1), fy - s.h + 1, HYS, 1, p.flip);
}
// The push-in: the background (everything composed so far) resampled from a shrinking rectangle (nearest
// neighbour, one pass); VIEW maps the foreground and the glows, which come after, into it.
const VIEW = { z: 1, x0: 0, y0: 0 };
let ZBUF = null, ZXS = null;
function pushView() {
  const k = WS.push;
  if (k <= 0) { VIEW.z = 1; VIEW.x0 = 0; VIEW.y0 = 0; return; }
  const z = lerp(1, PUSH_Z, k), w = W / z, h = H / z;
  VIEW.z = z;
  VIEW.x0 = clamp(lerp(W / 2, IN_CAM.x, k) - w / 2, 0, W - w);
  VIEW.y0 = clamp(lerp(H / 2, IN_CAM.y, k) - h / 2, 0, H - h);
  if (!ZBUF || ZBUF.length !== IDX.length) { ZBUF = new Uint8Array(IDX.length); ZXS = new Int32Array(W); }
  ZBUF.set(IDX);
  for (let x = 0; x < W; x++) ZXS[x] = Math.min(W - 1, (VIEW.x0 + x / z) | 0);
  for (let y = 0; y < H; y++) {
    const r = Math.min(H - 1, (VIEW.y0 + y / z) | 0) * W, o = y * W;
    for (let x = 0; x < W; x++) IDX[o + x] = ZBUF[r + ZXS[x]];
  }
}
function insideKnock(v) { SFX.knock(v); WS.cabinKnock = 1; tween(WS, 'cabinKnock', 0, KNOCK_BLINK, E.lin); }
const CINE_INSIDE = {
  dur: IN.dur,
  init(s) {
    s.sunk = swimming(); s.ax0 = zoomAnchorX(); s.bx0 = WS.boatX; s.nextKnock = IN.drift; s.ring = IN.drift; INSIDE_LAND = null;
    G.bob = null;
    tween(WS, 'pupilDx', INSIDE_LOOK, 0.8);
  },
  update(t, dt, at, s) {
    const I = G.inside = insidePose(t, s);
    WS.push = I.k;
    if (I.live) WS.boatX = s.bx0 + I.ax - s.ax0; // the live group drifts first, then the ladder takes over
    if (t >= s.nextKnock && t < IN.walk + IN.walkDur - 0.3) { s.nextKnock += IN.knockGap; insideKnock(0.4); }
    if (s.sunk && t >= s.ring && t < IN.drift + IN.driftDur) { s.ring += 0.8; ring(I.ax, I.wl + 1, false, 0.6, true); }
    at('open', IN.open, () => { WS.door = 1; SFX.creak(0.6); });
    at('close', IN.close, () => { WS.door = 0; SFX.knock(0.7); G.hbGap = 1e9; });
    at('row', IN.row, () => { if (!s.sunk) SFX.row(); });
    at('cast', IN.cast, () => { if (!s.sunk) SFX.whoosh(); });
    at('plop', IN.cast + IN.castDur, () => { if (!s.sunk) { SFX.plop(); const p = INSIDE_LAND || { x: I.ax - 16, y: HY + 5 }; ring(p.x, p.y); } });
    at('under', IN.under + IN.underDur * 0.8, () => { if (s.sunk) { SFX.plop(); ring(W_UNDER.x, HY + 1); } });
    IN.knocks.forEach((k, i) => at('k' + i, k, () => insideKnock(0.3)));
    at('fade', IN.fade, () => UI.fade(1, 1));
  },
};
function loadJSON(key, fallback) {
  try { const v = JSON.parse((IS_BROWSER && window.localStorage.getItem(key)) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function saveJSON(key, v) {
  try { if (IS_BROWSER) window.localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
}
function loadEndings() { const v = loadJSON('stillwater-endings', []); return Array.isArray(v) ? v : []; }
function saveEnding(id) {
  const list = loadEndings();
  if (list.indexOf(id) < 0) list.push(id);
  saveJSON('stillwater-endings', list);
  return list;
}
let sessionRuns = 0, sessionLast = null;
function loadRun() {
  RUN.count = Math.max(sessionRuns, +loadJSON('stillwater-runs', 0) || 0);
  RUN.last = sessionLast || loadJSON('stillwater-last', null);
}
function saveRun(id) {
  sessionRuns++; sessionLast = id;
  saveJSON('stillwater-runs', (+loadJSON('stillwater-runs', 0) || 0) + 1);
  saveJSON('stillwater-last', id);
}
// The ending card (bible, Ending cards): the base for the situation, one extra sentence, the pocket line on
// every Still water card but the lake-sunk one (situation 10: the lake keeps him), then what was asked for.
const END_STATES = {
  kept: () => STORY.kept, company: () => has('company'), cabin: () => has('home'), heard: () => STORY.heard,
  forever: () => has('forever'), refused1: () => STORY.refused === 1, refused2: () => STORY.refused === 2,
};
const endingPlace = () => WS.sea > 0.5 ? 'sea' : 'lake';
const endingBoat = () => WS.boatSunk >= 1 ? 'sunk' : 'boat';
// A line that is a string holds everywhere; an object is read by boat/sunk first, then by lake/sea.
const altLine = (v, place, boat) => typeof v === 'string' ? v : (v[boat] || v[place] || '');
// The table holds only the reachable cells; a missing place or boat falls back to the one the ending has.
function endingBase(key, place, boat) {
  const t = END_BASES[key];
  const byPlace = t[place] || t.lake || t.sea;
  const cell = byPlace[boat] || byPlace.boat || byPlace.sunk;
  const v = typeof cell === 'string' || Array.isArray(cell) ? cell : cell[STORY.heard ? 'heard' : 'quiet'];
  return Array.isArray(v) ? trJoin(v) : tr(v);
}
// Returns the sentence and the state it came from, so the asked-for line can avoid repeating a refusal.
function endingExtra(key, place, boat) {
  const x = END_EXTRA[key];
  for (const st of x.order) {
    if (!END_STATES[st]()) continue;
    const line = altLine(x.lines[st], place, boat);
    if (line) return { line: tr(line), state: st };
  }
  return { line: '', state: null };
}
// refusalSaid: the extra sentence already told the refusal, so the list drops its "nothing" part (and is
// left out entirely when nothing was granted).
// The labels are his own words, so they are listed one per line under the head rather than run into a sentence.
const ASKED_SEP = '\n'; // #endAsked keeps the line breaks (white-space: pre-line)
function askedLine(refusalSaid) {
  const labels = STORY.wishes.map(w => tr(WISH_LABELS[w]));
  if (!labels.length) return refusalSaid ? '' : tr('You asked for nothing.');
  const head = STORY.refused === 1 && !refusalSaid ? 'You asked for nothing, once. And for:' : 'You asked for:';
  return [tr(head)].concat(labels).join(ASKED_SEP);
}
// Stay after the forever wish: its extra line already says it will not get light, so the base drops STAY_DARK.
const stayBase = (key, base) => key === 'stay' && has('forever') ? base.replace(' ' + tr(STAY_DARK), '') : base;
// Every Still water card (the silent variant too) ends with the bait still in his pocket: he will be the
// stranger for the next one. The exception is situation 10, the lake with the boat sunk. No other ending gets it.
const BAIT_END = 'There is a bait in your pocket. It has an eye.';
const hasPocket = (id, place, boat) => id === 'cut' && !(place === 'lake' && boat === 'sunk');
function composeEnding(id, variant) {
  const place = endingPlace(), boat = endingBoat(), key = variant === 'silent' ? 'silent' : id;
  const extra = endingExtra(key, place, boat);
  const parts = [stayBase(key, endingBase(key, place, boat)), extra.line];
  if (hasPocket(id, place, boat)) parts.push(tr(BAIT_END));
  const refusalSaid = extra.state === 'refused1' || extra.state === 'refused2';
  return { id, variant: variant || '', title: tr(ENDINGS[id].title), text: parts.filter(Boolean).join(' '), asked: askedLine(refusalSaid) };
}
let sessionEndings = [];
// The endings found, from storage and this session (the silent variant is saved as cut, so it counts as Still water).
const foundEndings = () => loadEndings().concat(sessionEndings).filter((id, i, a) => ENDINGS[id] && a.indexOf(id) === i);
function showEnding(id, variant) {
  setPhase('end');
  if (sessionEndings.indexOf(id) < 0) sessionEndings.push(id);
  saveEnding(id);
  saveRun(variant ? id + ':' + variant : id);
  UI.ending(composeEnding(id, variant), foundEndings());
}

// ---------------------------------------------------------------- fishing
function promptFor(p) {
  if (p === 'ready') return 'Tap to cast';
  if (p === 'ocean') return G.pt >= OCEAN_GRACE ? 'Tap to cast' : ''; // the window, after its grace (phase 22)
  if (p === 'waiting' && G.tutorial < 2) return 'Wait for the float to go under';
  if (p === 'bite') return 'Tap now';
  if (p === 'reeling') return G.tutorial < 3 ? 'Hold to reel. Let go when it pulls hard.' : 'Hold to reel';
  return '';
}
// The tutorial prompt is hidden while a thought bubble is up, so two texts never share the stage.
function refreshPrompt() { UI.prompt(G.t < G.thinkUntil || !G.arrived ? '' : tr(promptFor(G.phase))); }
function setPhase(p) {
  G.phase = p; G.pt = 0;
  refreshPrompt();
}
// Captions, with their end time tracked so the said lines can wait their turn.
function cap(t, dur, style) {
  G.capUntil = G.t + (dur || 2.5);
  UI.caption(tr(t), dur, style);
}
// The fisherman's lines (bible, Opening) in his thought bubble. A line that finds a caption on screen
// waits in G.thinkPending and shows at the next beat (a cast landing or a card closing).
function thinkBeat(text) {
  if (text) G.thinkPending.push(text);
  if (!G.thinkPending.length || G.t < G.capUntil) return;
  STORY.said++;
  thinkLine(G.thinkPending.shift(), 'fisherman');
}
// A bubble over play (his own lines, and the companion's tapped ones): complete at once, with the ▾ marker,
// up until a tap and never on a timer (bible, 4b), the prompt hidden meanwhile. G.thinkUntil is Infinity
// while it waits, so the same `G.t < G.thinkUntil` gate hides the prompt, holds bites and makes the next
// tap a dismissal only (press, companionHit).
// The tap that brought the bubble up (a card closing) is often followed by a reflex tap, so a dismissal is
// ignored for THINK_GRACE seconds and the ▾ marker lights only after that.
const THINK_GRACE = 0.8;
function thinkLine(text, side) {
  UI.think(tr(text), { who: side === 'fisherman' ? tr('Fisherman') : '', side, more: false });
  G.thinkUntil = Infinity; G.thinkAt = G.t; G.thinkMore = false;
  refreshPrompt();
}
const thinkCold = () => G.t - G.thinkAt < THINK_GRACE;
function thinkHide() {
  G.thinkUntil = 0;
  UI.thinkHide();
  refreshPrompt();
}
// A carried-over line also shows as soon as the stage is free during play, so the three lines cannot
// cascade past the third catch (the fish quotes them right after).
const THINK_PHASES = ['ready', 'casting', 'waiting'];
function thinkUpdate() {
  if (G.thinkUntil === Infinity && !G.thinkMore && !thinkCold()) { G.thinkMore = true; UI.thinkMore(true); }
  if (G.thinkPending.length && G.t >= G.capUntil && THINK_PHASES.indexOf(G.phase) >= 0) thinkBeat(null);
}
function lose(msg) {
  G.bob = null; G.reel = null; G.holding = false; G.bobDip = 0;
  setPhase('lost');
  cap(msg, 1.8);
}
function cast() {
  const tx = 34 + Math.random() * 58, ty = 262 + Math.random() * 36;
  G.cast = { t: 0, tx, ty, from: null };
  STORY.casts++;
  setPhase('casting');
  SFX.whoosh();
}
// The eyes (bible, Act 2 play), once per run: EYES_AFTER_LAND seconds after the act 2 golden cast lands,
// never under a caption (they wait for it to clear). They last EYES_DUR, and the line does not go taut
// until EYES_CLEAR after they close, so the red sequence never starts on top of them. The lantern dips
// for a second while they show.
const EYES_AFTER_LAND = 1.5, EYES_DUR = 2, EYES_CLEAR = 0.4;
function eyesLook() {
  if (G.eyesDone) return;
  G.eyesDone = true; G.eyesAt = G.t;
  WS.lanternFlicker = 0.1;
  tween(WS, 'eyes', 1, 1, E.io, () => { tween(WS, 'eyes', 0, 1, E.io); tween(WS, 'lanternFlicker', 1, 0.6, E.out); });
}
const redCast = () => STORY.act === 2 && STORY.goldenNext;
function eyesUpdate() {
  if (G.eyesDone || !redCast() || G.phase !== 'waiting' || G.wait.t < EYES_AFTER_LAND || G.t < G.capUntil) return;
  eyesLook();
}
const eyesOver = () => G.eyesDone && G.t - G.eyesAt >= EYES_DUR + EYES_CLEAR;
// In act 2 the golden cast has nothing bite for slightly too long.
const RED_BITE_DELAY = 1.8, FIRST_BITE_WIN = 1.6, BITE_WIN = 1.2, BITE_WAIT = 1.2, BITE_WAIT_RND = 2.4;
function startWaiting() {
  const golden = STORY.goldenNext;
  const bite = golden ? (1.6 + Math.random() * 0.8) * (STORY.act === 2 ? RED_BITE_DELAY : 1) : BITE_WAIT + Math.random() * BITE_WAIT_RND * (WS.fishShadows ? 0.4 : 1);
  const nib = [];
  if (!golden) {
    const n = (Math.random() * 3) | 0;
    for (let i = 0; i < n; i++) nib.push(0.5 + Math.random() * Math.max(0.1, bite - 0.8));
    nib.sort((a, b) => a - b);
  }
  G.wait = { t: 0, bite, nib };
  setPhase('waiting');
}
// The act 2 species is chosen from those whose act 1 line was not shown this run. After the later-run
// hook line, the perch is excluded from the act 1 picks so the two hook lines never both show.
// A species whose card already showed this act (STORY.actSeen) is left out too, unless nothing else is left.
function pickSpecies() {
  const lip = STORY.act === 1 && usedRepl('lip');
  const narrow = (pool, keep) => { const p = pool.filter(keep); return p.length ? p : pool; };
  let pool = SPECIES.filter(s => s.id !== STORY.lastSpecies && !(lip && s.id === 'perch'));
  pool = narrow(pool, s => STORY.actSeen.indexOf(s.id) < 0);
  if (STORY.act === 2) pool = narrow(pool, s => STORY.shown1.indexOf(s.id) < 0);
  const s = pool[(Math.random() * pool.length) | 0];
  STORY.lastSpecies = s.id;
  return s;
}
// Conditional card replacements (bible, section 5): at most one per card, each fires at most once per run
// (STORY.usedRepl), first match wins. once() returns null when the replacement has already fired.
const usedRepl = key => STORY.usedRepl.indexOf(key) >= 0;
function once(key, text) {
  if (usedRepl(key)) return null;
  STORY.usedRepl.push(key);
  return text;
}
function cardLine(id, a) {
  const first = STORY.actCatches === 0;
  const line = (a === 2 && id === 'char' && has('company') && once('char2', 'Its scales show someone sitting behind you.'))
    || (a === 1 && first && STORY.kept && once('kept1', 'There is a gold scale in its mouth.'))
    || (a === 2 && id === 'trout' && has('fish') && once('trout2', 'Its stomach is full of hooks. All of them yours.'))
    || (a === 1 && has('fish') && once('fish1', 'It swam to the hook. It didn’t have to.'))
    || (a === 1 && id === 'grayling' && has('home') && once('home1', 'It smells of woodsmoke. Someone’s home.'))
    || (a === 2 && has('gold') && once('gold2', 'There are coins in it. They are still warm.'))
    || (a === 2 && STORY.refused === 2 && once('refused2', 'It is looking at you the way you look at it.'))
    || (a === 0 && first && isLaterRun() && once('lip', 'There is an old hook in its lip.'));
  return line || DESC[id][a];
}
function makeCatch(sp) {
  const a = Math.min(2, STORY.act);
  const spr = makeFish(fishOpts(sp, a, (Math.random() * 1000) | 0));
  const desc = cardLine(sp.id, a);
  if (a === 1) STORY.shown1.push(sp.id);
  STORY.actSeen.push(sp.id);
  const voice = STORY.heard && a === 2 ? VOICE[STORY.firstAsk] || '' : '';
  return { name: sp.names[a], weight: lerp(sp.wt[0], sp.wt[1], Math.random()), desc, spr, voice };
}
// Where a reeled fish arrives: beside the hull, or, once the boat has gone under, beside the swimmer. It
// follows boatX, so the reel works wherever a cutscene has moved him.
const REEL_DX = -4, SWIM_REEL_DX = 12, REEL_DY = 5;
const reelEnd = () => ({ x: boatLeft() + (swimming() ? SWIM_REEL_DX : REEL_DX), y: WL + REEL_DY });
function hook() {
  if (STORY.goldenNext && STORY.act === 2) { redSequence(); return; }
  const golden = STORY.goldenNext;
  const spec = golden ? null : pickSpecies();
  G.reel = { p: 0, T: 0.15, d: golden ? GOLD_REEL_D : spec.d, surge: 0, sAge: 0, next: 0.6 + Math.random(), x0: G.bob.x, y0: G.bob.y, golden, spec, tick: 0 };
  G.holding = true;
  G.bobDip = 0;
  setPhase('reeling');
  SFX.hook();
}
// A surge is cued (ring, sound, jitter) SURGE_WARN seconds before it pulls, so a player can react and let go.
// Letting go costs RELEASE_LOSS of progress a second. The golden fish is heavy (GOLD_REEL_D) but its tension
// is capped at GOLD_T_CAP, so it can never snap.
const SURGE_WARN = 0.25, RELEASE_LOSS = 0.06, GOLD_REEL_D = 1.0, GOLD_T_CAP = 0.62;
// Reel feel (eased 2026-09-30 so a first-time phone player lands fish faster): progress per second while
// holding, the steady and surge tension climbs, how fast tension falls on release, and the gap between surges.
const REEL_RATE = 0.42, PULL_BASE = 0.32, PULL_SURGE = 1.0, RELEASE_EASE = 0.95, SURGE_GAP = 1.2, SURGE_GAP_RND = 1.8;
function reelUpdate(dt) {
  const r = G.reel;
  if (G.holding) {
    r.p += (dt * REEL_RATE) / r.d;
    r.T += dt * (PULL_BASE + (r.surge > 0 && r.sAge > SURGE_WARN ? PULL_SURGE : 0)) * r.d;
    r.tick -= dt;
    if (r.tick <= 0) { r.tick = 0.07; SFX.tick(); }
  } else { r.p -= dt * RELEASE_LOSS; r.T -= dt * RELEASE_EASE; }
  if (!r.golden) {
    if (r.surge > 0) {
      r.surge -= dt; r.sAge += dt;
      if (!G.holding) r.T += dt * 0.12 * r.d;
      G.bobDip = 0.05;
      if (Math.random() < dt * 14) splash(G.bob.x, G.bob.y, 1);
    } else {
      r.next -= dt;
      if (r.next <= 0) { r.surge = 0.45 + Math.random() * 0.55 + SURGE_WARN; r.sAge = 0; r.next = SURGE_GAP + Math.random() * SURGE_GAP_RND; ring(G.bob.x, G.bob.y + 1); SFX.nibble(); }
    }
  } else r.T = Math.min(r.T, GOLD_T_CAP);
  r.T = clamp(r.T, 0, 1.05); r.p = clamp(r.p, 0, 1);
  G.rodA = lerp(G.rodA, AIM_A + 0.2 + r.T * 0.35, Math.min(1, dt * 10));
  G.rodBend = lerp(G.rodBend, 1 + r.T * 6, Math.min(1, dt * 10));
  const jx = r.surge > 0 ? (Math.random() - 0.5) * 2 : 0, end = reelEnd();
  G.bob = { x: lerp(r.x0, end.x, E.io(r.p)) + jx, y: lerp(r.y0, end.y, r.p), fly: false };
  if (r.T >= 1) { SFX.snap(); lose(STORY.snaps++ ? 'The line snapped.' : 'The line snapped. Let go when it pulls.'); return; } // the first snap of a run teaches
  if (r.p >= 1) land();
}
function land() {
  const r = G.reel;
  G.reel = null; G.holding = false;
  const end = reelEnd(), bx = G.bob ? G.bob.x : end.x, by = G.bob ? G.bob.y : end.y;
  if (r.golden) { STORY.goldenNext = false; goldenScene(); return; } // no splash here: it surfaces at the left with its own
  splash(bx, by, 10); ring(bx, by + 1);
  SFX.splash();
  G.land = { t: 0, x0: bx, y0: by, fish: makeCatch(r.spec) };
  G.bob = null;
  setPhase('landing');
}
// The card as the player sees it: the name, line and voice translated, the weight formatted (kgText).
const cardView = f => Object.assign({}, f, { name: tr(f.name), desc: tr(f.desc), voice: tr(f.voice), meta: kgText(f.weight) });
function showCard(f) { thinkHide(); setPhase('card'); G.cardReady = false; UI.card(cardView(f)); SFX.caught(); }
// The first half second of a card ignores taps (a reflex tap from the reel would close it unread); the
// "Tap to continue" hint fades in once it can be closed.
const CARD_GRACE = 0.5;
function closeCard() { UI.cardHide(); afterCatch(); }
// The fisherman's four act 0 lines (bible, Opening): the bait once the boat has arrived (BAIT_LINE), the
// throwaway wish when the first cast lands (0), then one after each of the first two cards close (1, 2).
const BAIT_LINE = 'The stranger’s bait. Cursed or blessed, he said. It has an eye.';
const OPENING_CAPS = { 0: 'Something interesting, for once.', 1: 'First time out here. Look at that sun.', 2: 'I could stay out here forever.' };
function stillCaption() {
  if (STORY.act === 0) return 'The water goes very still.';
  if (STORY.act === 1) return STORY.kept ? 'The water goes very still. The fish in the boat does not.' : 'The water goes very still again.';
  if (!STORY.kept) return 'The water goes very still. The flame leans toward it.';
  return swimming() ? 'The water goes very still. The flame leans toward the fish.' : 'The water goes very still. The flame leans to your feet.';
}
// Kept, act 1: the cast after the second catch is a normal hook with a normal card, and when that card
// closes the fish speaks from the boat (STORY.keptNext marks the wait; bible, Act 1).
// A later run has two act 0 catches instead of three (the replay is shorter), so its fourth thought moves
// from the second card onto the second cast landing, and all four still show before the still caption.
const actNeed = act => [isLaterRun() ? 2 : 3, 2, 1][act];
const shortAct0 = () => actNeed(0) < 3;
// Each act 0 thought (an OPENING_CAPS key) is queued once; null once it has been, or outside act 0.
function openingThought(i) {
  if (STORY.act !== 0 || !OPENING_CAPS[i] || STORY.openQ.indexOf(i) >= 0) return null;
  STORY.openQ.push(i);
  return OPENING_CAPS[i];
}
// The thought for a cast that has just landed: the first cast's, or, on a short act 0, the last one once
// the first card has closed.
const castThought = () => openingThought(STORY.casts === 1 ? 0 : shortAct0() && STORY.catches >= 1 ? 2 : -1);
function afterCatch() {
  STORY.catches++; STORY.actCatches++; G.tutorial++;
  UI.count(STORY.catches);
  if (STORY.keptNext) { STORY.keptNext = false; keptScene(); return; }
  if (STORY.actCatches >= actNeed(STORY.act) && !STORY.goldenNext) {
    if (STORY.kept && STORY.act === 1) STORY.keptNext = true; // its still caption shows in keptScene
    else { STORY.goldenNext = true; cap(stillCaption(), 3.2); }
    if (STORY.act === 2) knockBeat(1); // after the still caption: the knocking again, slower
  } else if (STORY.act === 0) thinkBeat(openingThought(STORY.catches));
  else if (STORY.act === 1 && STORY.actCatches === 1) { companionSpeaks(); knockBeat(0); }
  setPhase('ready');
}
function fishUpdate(dt) {
  const ph = G.phase;
  if (ph === 'card' && G.pt >= CARD_GRACE && !G.cardReady) { G.cardReady = true; UI.cardReady(); }
  if (ph === 'ready' || ph === 'title' || ph === 'lost' || ph === 'card') {
    G.rodA = lerp(G.rodA, REST_A, Math.min(1, dt * 4));
    G.rodBend = lerp(G.rodBend, 0, Math.min(1, dt * 6));
  }
  if (G.bobDip > 0 && G.bobDip < 900) G.bobDip = Math.max(0, G.bobDip - dt);
  if (ph === 'casting') {
    const c = G.cast;
    c.t += dt;
    const T = c.t;
    if (T < 0.22) G.rodA = lerp(REST_A, BACK_A, E.out(T / 0.22));
    else if (T < 0.36) G.rodA = lerp(BACK_A, FWD_A, E.in((T - 0.22) / 0.14));
    else G.rodA = lerp(FWD_A, AIM_A, E.out(Math.min(1, (T - 0.36) / 0.45)));
    if (T >= 0.33) {
      if (!c.from) c.from = { x: G.tip.x, y: G.tip.y };
      const k = Math.min(1, (T - 0.33) / 0.5);
      G.bob = { x: lerp(c.from.x, c.tx, k), y: lerp(c.from.y, c.ty, k) - Math.sin(k * Math.PI) * 18, fly: true };
      if (k >= 1) {
        G.bob = { x: c.tx, y: c.ty, fly: false };
        ring(c.tx, c.ty + 1); splash(c.tx, c.ty, 4);
        SFX.plop();
        thinkBeat(castThought());
        startWaiting();
      }
    }
  } else if (ph === 'waiting') {
    G.rodA = lerp(G.rodA, AIM_A, Math.min(1, dt * 3));
    const w = G.wait;
    if (G.t >= G.thinkUntil) w.t += dt; // no nibble or bite while a thought bubble is up
    if (w.nib.length && w.t >= w.nib[0]) { w.nib.shift(); G.bobDip = 0.16; ring(G.bob.x, G.bob.y + 1); SFX.nibble(); }
    const glitter = STORY.goldenNext && !STORY.kept; // kept: no sparkles and no chime; the fish is in the boat
    if (glitter && Math.random() < dt * 6) sparkle(G.bob.x + (Math.random() - 0.5) * 10, G.bob.y - Math.random() * 4);
    if (w.t >= w.bite && redCast()) { if (eyesOver()) redSequence(); return; } // no bite: the line goes taut once the eyes have closed
    if (w.t >= w.bite) {
      G.biteWin = STORY.goldenNext ? 3.2 : G.tutorial < 1 ? FIRST_BITE_WIN : BITE_WIN; // the first bite is a little longer
      setPhase('bite');
      G.bobDip = 999;
      ring(G.bob.x, G.bob.y + 1); ring(G.bob.x, G.bob.y + 1, true); splash(G.bob.x, G.bob.y, 3);
      SFX.bite();
      if (glitter) SFX.chime();
      G.ringT = 0;
    }
  } else if (ph === 'bite') {
    G.ringT += dt;
    if (G.ringT > 0.35) { G.ringT = 0; ring(G.bob.x, G.bob.y + 1); }
    G.rodA = lerp(G.rodA, AIM_A + 0.12, Math.min(1, dt * 8));
    if (G.pt > G.biteWin) lose(STORY.goldenNext ? 'It slipped away. Cast again.' : 'It slipped the hook.');
  } else if (ph === 'reeling') {
    reelUpdate(dt);
  } else if (ph === 'landing') {
    const l = G.land;
    l.t += dt;
    G.rodA = lerp(G.rodA, -1.95, Math.min(1, dt * 8));
    if (l.t >= 0.62) { G.land = null; showCard(l.fish); }
  } else if (ph === 'lost') {
    if (G.pt > 1.1) setPhase('ready');
  }
}

// ---------------------------------------------------------------- the knocking (phase 23, the home path)
// Someone is in the cabin. Three slow knocks from the shore after the first act 1 card closes, and three
// slower ones after the act 2 card (once its still caption is done). The caption waits for the stage like
// any text (two texts never share it), each knock blinks the window (WS.cabinKnock), and leaving play drops
// a knocking that has not finished.
const KNOCKS = 3, KNOCK_HOLD = 1.8, KNOCK_BLINK = 0.3;
const KNOCK_BEATS = [
  { gap: 0.55, text: 'Someone knocks on the cabin door.' },
  { gap: 0.8, text: 'The knocking again. Slower.' },
];
const KNOCK_PHASES = ['ready', 'card', 'casting', 'waiting', 'bite', 'reeling', 'landing', 'lost'];
function knockBeat(k) {
  if (!has('home') || WS.cabin < 0.5 || seaGone()) return;
  G.knock = { gap: KNOCK_BEATS[k].gap, text: KNOCK_BEATS[k].text, at: -1, n: 0 };
}
function knockUpdate() {
  const k = G.knock;
  if (!k) return;
  if (KNOCK_PHASES.indexOf(G.phase) < 0) { G.knock = null; return; }
  if (k.at < 0) {
    if (G.t < G.capUntil || G.t < G.thinkUntil) return;
    k.at = G.t;
    cap(k.text, k.gap * (KNOCKS - 1) + KNOCK_HOLD);
  }
  if (G.t - k.at < k.n * k.gap) return;
  k.n++;
  SFX.knock();
  WS.cabinKnock = 1; tween(WS, 'cabinKnock', 0, KNOCK_BLINK, E.lin);
  if (k.n >= KNOCKS) G.knock = null;
}

// ---------------------------------------------------------------- the companion (bible, section 6)
// He only ever says the fisherman's words, bent a little. Pools are drawn in order, then the last repeats.
const COMP_LINES = {
  day: ['Look at that sun.', 'First time here.', 'We could stay out here forever.', 'Still there.'],
  night: ['Look at that sun.', 'It’s coming back.', 'Don’t you want it to?'],
};
const COMP_LATER = 'First time here. You said that last time.';
function compPool() {
  if (WS.companionTurn > 0.5) return { key: 'red', lines: [STORY.answered === true ? 'You said.' : 'Cut the line.'] };
  return STORY.act === 2 ? { key: 'night', lines: COMP_LINES.night } : { key: 'day', lines: COMP_LINES.day };
}
function companionLine() {
  const pool = compPool();
  if (STORY.tapPool !== pool.key) { STORY.tapPool = pool.key; STORY.tap = 0; }
  const first = STORY.tap === 0 && STORY.tapPool === 'day' && isLaterRun();
  const text = first ? COMP_LATER : pool.lines[Math.min(STORY.tap, pool.lines.length - 1)];
  STORY.tap++;
  return text;
}
// Once per run he speaks unprompted, after the first act 1 card closes: one line from his pool in his
// bubble, so the player learns he is there to be tapped. Under a caption or a bubble it is skipped.
function companionSpeaks() {
  if (STORY.compSpoke || WS.companion <= 0.5 || G.t < G.capUntil || G.t < G.thinkUntil) return;
  STORY.compSpoke = true;
  thinkLine(companionLine(), 'companion');
}
// One line in his bubble instead of a cast. He never turns for it.
function companionTap() {
  SFX.init(); SFX.resume();
  if (WS.companion <= 0.5) return;
  thinkLine(companionLine(), 'companion');
}
// His sprite box padded by 6 px, only while he is there and the stage is his to answer: during play, or in
// the red once he has turned and the last choices are showing.
const COMP_PAD = 6;
// Whether he can be tapped at all (the C key asks only this): a tap on a waiting bubble only dismisses it,
// and under a caption it is a plain tap.
function companionOpen() {
  if (WS.companion <= 0.5 || WS.far > 0.5 || G.t < G.thinkUntil || G.t < G.capUntil) return false;
  return G.phase === 'ready' || (G.phase === 'dialog' && !!UI.choices && WS.companionTurn > 0.5);
}
function companionHit(x, y) {
  if (!companionOpen()) return false;
  const x0 = boatLeft() + COMP_DX - COMP_PAD, y0 = compY(boatSinkPx()) - COMP_PAD;
  return x >= x0 && x < x0 + COMP.w + 2 * COMP_PAD && y >= y0 && y < y0 + COMP.h + 2 * COMP_PAD;
}

// ---------------------------------------------------------------- input and flow
function press() {
  SFX.init(); SFX.resume();
  const p = G.phase;
  if (G.t < G.thinkUntil) { if (!thinkCold()) thinkHide(); return; } // a tap dismisses a bubble over play instead of acting
  if (p === 'title') startGame();
  else if (p === 'ready') { if (G.arrived) cast(); } // no cast until the boat has rowed in
  else if (p === 'ocean') { if (G.pt >= OCEAN_GRACE) oceanCast(); }
  else if (p === 'waiting') lose(STORY.goldenNext ? 'Too early.' : 'Too early. Nothing was biting yet.');
  else if (p === 'bite') hook();
  else if (p === 'reeling') G.holding = true;
  else if (p === 'card') { if (G.pt >= CARD_GRACE) closeCard(); }
  else if (p === 'dialog') dlgTap();
}
function release() { G.holding = false; }

// ---------------------------------------------------------------- test mode (temporary)
// Skips the fishing minigame: one call lands the next fish, or triggers the golden
// scene or the red sequence, exactly as a real catch would. In the test build, enable with ?test in the
// URL or the T key. The S key or the Skip button performs a skip.
// TEST_BUILD gates the T and S keys, the Skip fish button and the ?test flag in the browser. It is false in
// the shipping build; npm run build:test flips it (build.js). Node tools call setTestMode directly.
const TEST_BUILD = false;
let TEST = false;
function setTestMode(on) {
  TEST = !!on;
  if (UI.el && UI.el.skip) UI.el.skip.hidden = !TEST;
  cap(TEST ? 'Test mode on' : 'Test mode off', 1.5);
}
const SKIP_BOB = { x: 63, y: 280 };
function testCatch() {
  if (!TEST) return;
  if (G.t < G.thinkUntil) thinkHide(); // a waiting bubble goes first, then the skip proceeds
  const p = G.phase;
  if (p === 'title') { startGame(); return; }
  if (p === 'card') { closeCard(); return; }
  if (p === 'ocean') { oceanCast(); return; } // a skip is a cast into the big one; it never bypasses the choice
  if (p === 'ready' && !G.arrived) return; // no skip before the boat has rowed in either
  if (p !== 'ready' && p !== 'casting' && p !== 'waiting' && p !== 'bite' && p !== 'reeling' && p !== 'lost') return;
  G.cast = null; G.wait = null; G.holding = false; G.bobDip = 0;
  G.bob = { x: SKIP_BOB.x, y: SKIP_BOB.y, fly: false };
  if (redCast()) eyesLook(); // the skipped red cast still shows them once
  hook();
  if (G.phase === 'reeling' && G.reel) { G.reel.p = 1; land(); }
}
// The opening (bible, section 8): a short dip to black under the title fade, then the boat rows in from
// off screen left in two eased strokes over 4 s, under the first caption. No cast until it has arrived.
// The bible says -120, but BOAT_X is 118 and the hull 85 wide, so -120 would leave the boat on screen;
// -208 is the value that actually starts it off the left edge. The dip hides the jump from the title's boat.
const ROW_FROM = -208, ROW_DUR = 4, OPEN_DIP = 0.4;
function startGame() {
  UI.title(false);
  UI.fade(1, OPEN_DIP - 0.05);
  G.arrived = false; G.open = { t: 0, stage: 0 };
  setPhase('ready');
}
function openingUpdate(dt) {
  const o = G.open;
  if (!o) return;
  o.t += dt;
  if (o.stage === 0 && o.t >= OPEN_DIP) {
    o.stage = 1;
    WS.boatX = ROW_FROM;
    tween(WS, 'boatX', ROW_FROM * 0.25, ROW_DUR / 2, E.out, () =>
      tween(WS, 'boatX', 0, ROW_DUR / 2, E.out, openingLine));
    UI.fade(0, 1.2);
    SFX.row();
  } else if (o.stage === 1 && o.t >= OPEN_DIP + ROW_DUR / 2) { o.stage = 2; SFX.row(); }
  else if (o.stage === 2 && G.arrived) G.open = null;
}
// The boat has arrived: the narrator's first line in the panel, waiting for a tap (not a timed caption, so it
// can be read), then the bait bubble, which waits for the next tap, then play. OPENING_LINE is the bible's.
const OPENING_LINE = 'Nothing on the lake is moving except you.';
function openingLine() {
  dlgRun([narr(OPENING_LINE)], () => { G.arrived = true; setPhase('ready'); thinkBeat(BAIT_LINE); });
}
function resetAll() {
  resetWS();
  Object.assign(STORY, freshStory());
  loadRun();
  Object.assign(G, { bob: null, cast: null, wait: null, reel: null, land: null, holding: false, rodA: REST_A, rodBend: 0, bobDip: 0, capUntil: 0, thinkUntil: 0, thinkAt: -9, thinkMore: false, cardReady: false, thinkPending: [], knock: null, arrived: true, open: null, eyesDone: false, eyesAt: -9, frozeT: 0, hbGap: HB_GAP, tip: { x: 110, y: 205 }, farRing: FAR_RING_FIRST, inside: null });
  PARTS.length = 0; RINGS.length = 0; ASH.length = 0; SHAD.length = 0; BIRDS.length = 0; TW.length = 0;
  OCEAN.shad.length = 0; OCEAN.big = null; OCEAN.tr0 = 0;
  cloudT = 0; genEyes();
  WS.farBoat = RUN.count > 0 || loadEndings().length > 0 || sessionEndings.length > 0 ? 1 : 0; // bible, Title
  CINE = null;
  DLG.q = []; DLG.cur = null; DLG.active = false; DLG.done = null; DLG.wait = 0;
  SFX.drone(false); SFX.weight(false);
  UI.count(0); UI.dlgHide(); UI.thinkHide(); UI.cardHide(); UI.endingHide();
  setPhase('title');
  UI.title(true, foundEndings());
}
function restart() {
  UI.fade(1, 0.6);
  setTimeout(() => { resetAll(); UI.fade(0, 1.4); }, 650);
}
function ambientUpdate(dt) {
  if (WS.mood > 1.6 && G.phase !== 'end' && WS.dim < 5) {
    G.hb -= dt;
    if (G.hb <= 0) { G.hb = G.hbGap; SFX.heartbeat(); }
  }
}
function update(dt) {
  G.t += dt; G.pt += dt;
  updTweens(dt);
  cineUpdate(dt);
  openingUpdate(dt);
  thinkUpdate();
  fishUpdate(dt);
  knockUpdate(); // before the eyes, which wait for the stage to be clear
  eyesUpdate();
  if (!WS.frozen) cloudT += dt;
  dlgUpdate(dt);
  updParts(dt); farRings(dt); updRings(dt); updAsh(dt); updShadows(dt); updOcean(dt); updBirds(dt); updJumps(dt);
  ambientUpdate(dt);
}
function init() {
  genClouds(); genMountains(); genStars(); genNewShore(); buildSprites();
  alloc();
  resetWS();
}

// ---------------------------------------------------------------- browser boot
// The thought bubble (bible, 4b) is a solid pixel cloud on the game's own grid: a mask in game pixels (1 the
// cloud, 2 the tail) with THINK_PAD cells round the gw by gh box. The cloud is the box inset 3 with a row
// of bumps along the top, a smaller row along the bottom and one round each end; the tail is three pixel
// circles (TAIL_PUFFS, radius 3, 2 and 1) stepping down from x tx toward the speaker (dir).
const THINK_PAD = 2, THINK_GW = Math.round(W * 0.4), THINK_GUTTER = 16, BUMP_R = 5.5;
const TAIL_PUFFS = [
  { dx: 0, dy: 4, rows: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'] },
  { dx: 5, dy: 10, rows: ['.###.', '#####', '#####', '#####', '.###.'] },
  { dx: 9, dy: 14, rows: ['.#.', '###', '.#.'] },
];
function thinkMask(gw, gh, tx, dir) {
  const mw = gw + 2 * THINK_PAD, mh = gh + 18 + THINK_PAD, m = new Uint8Array(mw * mh);
  const set = (x, y, v) => {
    x += THINK_PAD; y += THINK_PAD;
    if (x >= 0 && x < mw && y >= 0 && y < mh && !m[y * mw + x]) m[y * mw + x] = v;
  };
  const disc = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= r * r) set(x, y, 1);
    }
  };
  for (let y = 3; y < gh - 3; y++) for (let x = 3; x < gw - 3; x++) set(x, y, 1);
  const r = BUMP_R, nT = Math.max(3, Math.round(gw / 17)), nB = Math.max(3, nT - 1);
  for (let i = 0; i < nT; i++) disc(r + 0.5 + (gw - 2 * r - 1) * i / (nT - 1), r + 0.3, r + (i % 2) * 0.8);
  for (let i = 0; i < nB; i++) disc(r + 3 + (gw - 2 * r - 6) * i / (nB - 1), gh - r - 0.3, r - 0.4);
  disc(r * 0.9, gh / 2, Math.min(r + 0.5, gh / 2)); disc(gw - r * 0.9, gh / 2, Math.min(r + 0.5, gh / 2));
  for (const p of TAIL_PUFFS) {
    const n = p.rows.length, h = (n - 1) / 2, cx = Math.round(tx + dir * p.dx);
    p.rows.forEach((row, j) => { for (let i = 0; i < n; i++) if (row[i] === '#') set(cx - h + i, gh + p.dy - h + j, 2); });
  }
  return { m, mw, mh };
}
// The mask as SVG rects in game pixels, one run per row: cells with an empty 4-neighbour of their own kind
// are the outline, the rest the fill.
function thinkRects(k) {
  const { m, mw, mh } = k, at = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh ? 0 : m[y * mw + x]);
  let fill = '', line = '';
  for (let y = 0; y < mh; y++) {
    let x = 0;
    while (x < mw) {
      const v = at(x, y);
      if (!v) { x++; continue; }
      const edge = xx => at(xx - 1, y) !== v || at(xx + 1, y) !== v || at(xx, y - 1) !== v || at(xx, y + 1) !== v;
      const e = edge(x);
      let x1 = x + 1;
      while (x1 < mw && at(x1, y) === v && edge(x1) === e) x1++;
      const r = '<rect x="' + (x - THINK_PAD) + '" y="' + (y - THINK_PAD) + '" width="' + (x1 - x) + '" height="1"/>';
      if (e) line += r; else fill += r;
      x = x1;
    }
  }
  return '<g class="fill">' + fill + '</g><g class="line">' + line + '</g>';
}
// Where each bubble sits, in internal pixels: its left edge, the y of its bottom edge, the x where the tail
// leaves it, and which way the tail leans (-1 toward the fisherman's head, +1 toward the companion's).
// The companion's question keeps his bubble where it is and puts its two buttons above it, in the sky, so they
// never sit on the rod, the lantern or the tail. In the red (mood past 1) the eye hangs where his bubble would
// sit, so his bubble moves down to y 205 and right of the disc (companionRed), clear of the eye and still
// above both heads. thinkLayout keeps every bubble THINK_GUTTER CSS px inside the stage's right edge.
const THINK_AT = {
  fisherman: { left: 122, y: 186, tail: 150, dir: -1 },
  companion: { left: 100, y: 190, tail: 160, dir: 1 },
  companionRed: { left: 124, y: 205, tail: 168, dir: 1 },
};
const thinkAnchor = side => (WS.mood > 1 && THINK_AT[side + 'Red']) || THINK_AT[side];
// The catch card's sprite scale: the largest integer factor that keeps the fish inside CARD_FISH_W of the
// panel's width and CARD_FISH_H percent of the stage's width tall, between CARD_FISH_MIN and CARD_FISH_MAX,
// so the species signatures read on a phone (bible, section 5).
const CARD_FISH_W = 0.6, CARD_FISH_H = 26, CARD_FISH_MIN = 2, CARD_FISH_MAX = 8;
function cardFishScale(w, h, stageW, panelW) {
  const u = stageW / 100;
  return clamp(Math.floor(Math.min((CARD_FISH_W * (panelW || 80 * u)) / w, (CARD_FISH_H * u) / h)), CARD_FISH_MIN, CARD_FISH_MAX);
}
// Russian typography on screen: a one-letter word (в, с, к, у, о, и, а, я) keeps the next word on its line,
// and an em dash keeps the word before it, through a no-break space. Only the displayed text changes (the
// UI sinks call it): tr, the logic and the sim see the plain strings. Two passes catch "и в дом".
const NB_ONE = /(^|[\s («"])([вВсСкКуУоОиИаАяЯ]) /g;
function nbsp(t) {
  if (LANG !== 'ru' || !t) return t;
  return t.replace(NB_ONE, '$1$2 ').replace(NB_ONE, '$1$2 ').replace(/ —/g, ' —');
}
function makeUI() {
  const $ = id => document.getElementById(id);
  const el = {
    stage: $('stage'), prompt: $('prompt'), caption: $('caption'), count: $('count'),
    think: $('think'), thinkPix: $('thinkPix'), thinkWho: $('thinkWho'), thinkText: $('thinkText'), thinkChoices: $('thinkChoices'), thinkMore: $('thinkMore'),
    card: $('card'), cardFish: $('cardFish'), cardName: $('cardName'), cardMeta: $('cardMeta'), cardDesc: $('cardDesc'), cardVoice: $('cardVoice'),
    dlg: $('dialog'), who: $('who'), text: $('text'), choices: $('choices'), more: $('more'),
    title: $('title'), found: $('found'), foundList: $('foundList'), ending: $('ending'), endTitle: $('endTitle'), endText: $('endText'), endAsked: $('endAsked'), endFound: $('endFound'), endList: $('endList'),
    again: $('again'), fade: $('fade'), mute: $('mute'), skip: $('skip'), lang: $('lang'),
  };
  let capTimer = null;
  const rgb = (i, a) => 'rgba(' + (PALRGB[i * 3] | 0) + ',' + (PALRGB[i * 3 + 1] | 0) + ',' + (PALRGB[i * 3 + 2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  const mixWhite = (i, k) => 'rgb(' + [0, 1, 2].map(j => Math.round(PALRGB[i * 3 + j] + (255 - PALRGB[i * 3 + j]) * k)).join(',') + ')';
  // mark: the one line whose question mark is drawn wrong. Only that glyph gets a span; everything is text.
  const setText = (node, t, mark) => {
    t = nbsp(t);
    node.textContent = t;
    if (!mark || !t.endsWith('?')) return;
    node.textContent = t.slice(0, -1);
    const s = document.createElement('span');
    s.className = 'mark'; s.textContent = '?';
    node.appendChild(s);
  };
  // New buttons are cold for CHOICE_GRACE seconds of game time: the tap that finished the line often comes
  // twice, and the second must not pick an ending. The cold class blocks pointer events; the check in the
  // click handler and the digit keys (choicesCold) covers the rest.
  const buttons = (box, list) => {
    box.innerHTML = '';
    box.hidden = !list;
    box.classList.remove('cold');
    if (!list) return;
    ui.choicesAt = G.t;
    box.classList.add('cold');
    list.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'choice'; b.textContent = nbsp(c.label);
      b.addEventListener('click', ev => { ev.stopPropagation(); b.blur(); if (!ui.choicesCold()) c.cb(); });
      box.appendChild(b);
    });
  };
  // On a short stage the buttons may not fit under the question at a comfortable size: when the question has
  // to scroll to make room for them, four or more go into two columns.
  const fitChoices = () => {
    el.choices.classList.remove('grid');
    if (el.choices.hidden || !el.choices.classList.contains('many')) return;
    if (el.text.scrollHeight > el.text.clientHeight + 1 || el.dlg.scrollHeight > el.dlg.clientHeight + 1) el.choices.classList.add('grid');
  };
  const endingList = (box, found) => {
    box.innerHTML = '';
    if (!found) return;
    Object.keys(ENDINGS).forEach(id => {
      const s = document.createElement('span');
      const got = found.indexOf(id) >= 0;
      s.textContent = got ? tr(ENDINGS[id].title) : '?'; // a neutral mark: a dash between titles read as punctuation
      if (!got) s.setAttribute('aria-label', tr('not found'));
      box.appendChild(s);
    });
  };
  let againTimer = null, cardSize = null;
  const cardScale = () => {
    if (!cardSize) return;
    const sc = cardFishScale(cardSize.w, cardSize.h, el.stage.clientWidth, el.card.clientWidth);
    el.cardFish.style.width = cardSize.w * sc + 'px'; el.cardFish.style.height = cardSize.h * sc + 'px';
  };
  // The bubble's place and cloud from the live stage size, all in whole game pixels (gp CSS px each): the
  // width is THINK_GW, the height the measured text's rounded up, so the cloud always holds its text; its
  // right edge stays THINK_GUTTER CSS px inside the stage. The cloud is drawn by thinkMask and thinkRects.
  const thinkLayout = side => {
    const a = thinkAnchor(side), gp = el.stage.clientWidth / W, gw = THINK_GW;
    const left = Math.min(a.left, Math.floor(W - THINK_GUTTER / gp) - gw - 1);
    el.think.style.width = gw * gp + 'px';
    el.think.style.height = 'auto';
    const gh = Math.max(12, Math.ceil(el.think.getBoundingClientRect().height / gp - 0.01));
    el.think.style.height = gh * gp + 'px';
    el.think.style.left = left * gp + 'px';
    el.think.style.top = (a.y - gh) * gp + 'px';
    el.think.style.bottom = 'auto';
    const k = thinkMask(gw, gh, a.tail - left, a.dir), svg = el.thinkPix;
    svg.setAttribute('viewBox', -THINK_PAD + ' ' + -THINK_PAD + ' ' + k.mw + ' ' + k.mh);
    svg.style.left = -THINK_PAD * gp + 'px'; svg.style.top = -THINK_PAD * gp + 'px';
    svg.style.width = k.mw * gp + 'px'; svg.style.height = k.mh * gp + 'px';
    svg.innerHTML = thinkRects(k);
  };
  // Press Start 2P (.px) is drawn on an 8 px grid: its size is snapped to a whole multiple of 8 device px
  // (from the CSS size, read afresh each time), and a title set nowrap (h1, h2) steps down until it fits
  // its box with a 24 px gutter, so a long title never clips or crowds the edge.
  const snapPx = () => {
    const dpr = window.devicePixelRatio || 1, step = 8 / dpr;
    el.stage.querySelectorAll('.px').forEach(n => {
      n.style.fontSize = '';
      let k = Math.max(1, Math.round((parseFloat(getComputedStyle(n).fontSize) || 8) * dpr / 8));
      n.style.fontSize = k * step + 'px';
      if (n.tagName !== 'H1' && n.tagName !== 'H2') return;
      const box = n.parentElement, cs = getComputedStyle(box);
      const room = Math.min(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), el.stage.clientWidth - 48);
      while (k > 1 && n.scrollWidth > room) { k--; n.style.fontSize = k * step + 'px'; }
    });
  };
  const ui = {
    el, choices: null, thinkOwns: false, thinkSide: null, choicesAt: -9,
    choicesCold() { return G.t - this.choicesAt < CHOICE_GRACE; },
    // Called every frame: warms the buttons once the grace has passed.
    tick() {
      if (this.choicesCold()) return;
      el.choices.classList.remove('cold'); el.thinkChoices.classList.remove('cold');
    },
    thinkMore(on) { el.thinkMore.classList.toggle('on', !!on); },
    cardReady() { el.card.classList.add('ready'); },
    dlgBusy(on) { if (on) el.dlg.setAttribute('aria-busy', 'true'); else el.dlg.removeAttribute('aria-busy'); },
    fitChoices,
    // The dialogue panel never reaches the companion: its cap is the stage below his head (at his seat, or
    // floating once the boat has sunk), less the panel's bottom margin (4u). Set on resize and with every menu.
    dlgCap() {
      const top = compY(boatSinkPx()) - 4;
      el.stage.style.setProperty('--dlg-max', 'min(46%, calc(' + ((H - top) / H * 100).toFixed(2) + '% - var(--u) * 4))');
    },
    inDialog(t) { return !!(t && t.closest && t.closest('#dialog.on')); },
    // The thought bubble (bible, 4b): opts.side 'fisherman' (default) or 'companion', opts.who the tiny label,
    // opts.mark the wrong question mark, opts.choices buttons under it (the companion's question), opts.more
    // the ▾ marker in the lower right for a bubble that waits for a tap (every bubble does).
    think(text, opts) {
      opts = opts || {};
      const side = opts.side || 'fisherman';
      el.thinkWho.hidden = !opts.who; el.thinkWho.textContent = opts.who || '';
      setText(el.thinkText, text, opts.mark);
      el.thinkMore.classList.toggle('on', !!opts.more);
      buttons(el.thinkChoices, opts.choices || null);
      if (opts.choices) { this.choices = opts.choices; this.thinkOwns = true; }
      el.think.classList.toggle('ask', !!opts.choices);
      this.thinkSide = side;
      thinkLayout(side);
      el.think.classList.add('on');
    },
    thinkHide() {
      el.think.classList.remove('on', 'ask');
      el.thinkMore.classList.remove('on');
      buttons(el.thinkChoices, null);
      this.thinkSide = null;
      if (this.thinkOwns) { this.choices = null; this.thinkOwns = false; }
    },
    thinkRelayout() { if (this.thinkSide) thinkLayout(this.thinkSide); },
    snapPx,
    prompt(t) { el.prompt.textContent = t || ''; el.prompt.classList.toggle('on', !!t); el.prompt.classList.toggle('urgent', t === tr('Tap now')); },
    caption(t, dur, style) {
      el.caption.textContent = nbsp(t); el.caption.className = 'shade on' + (style ? ' ' + style : '');
      clearTimeout(capTimer);
      capTimer = setTimeout(() => el.caption.classList.remove('on'), (dur || 2.5) * 1000);
    },
    count(n) { el.count.textContent = countText(n); },
    card(f) {
      const s = f.spr, cv = el.cardFish;
      el.card.classList.remove('ready');
      cv.width = s.w + 2; cv.height = s.h + 2;
      const cx = cv.getContext('2d');
      const im = cx.createImageData(cv.width, cv.height);
      const o = new Uint32Array(im.data.buffer);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const v = s.data[y * s.w + x]; if (v !== 255) o[(y + 1) * cv.width + x + 1] = PAL[v]; }
      cx.putImageData(im, 0, 0);
      cardSize = { w: cv.width, h: cv.height };
      cardScale();
      el.cardName.textContent = f.name;
      el.cardMeta.textContent = f.meta || kgText(f.weight);
      el.cardDesc.textContent = nbsp(f.desc);
      el.cardVoice.textContent = nbsp(f.voice || '');
      el.cardVoice.hidden = !f.voice;
      el.card.classList.add('on');
    },
    cardHide() { el.card.classList.remove('on', 'ready'); },
    // After a resize or rotation, the open card's fish is rescaled to the new card.
    cardRelayout() { if (el.card.classList.contains('on')) cardScale(); },
    dlgShow(who, style) { el.dlg.className = 'panel on ' + (style || ''); el.who.textContent = who || ''; el.who.hidden = !who; el.more.classList.remove('on'); this.dlgBusy(true); },
    dlgText(t, mark) { setText(el.text, t, mark); },
    dlgChoices(list) {
      buttons(el.choices, list);
      this.choices = list; this.thinkOwns = false;
      el.dlg.classList.toggle('choosing', !!list);
      if (list) el.choices.classList.toggle('many', list.length > 3);
      this.dlgCap();
      fitChoices();
    },
    dlgMore(on) { el.more.classList.toggle('on', !!on); },
    dlgHide() { el.dlg.classList.remove('on', 'choosing'); el.dlg.removeAttribute('aria-busy'); el.choices.innerHTML = ''; el.choices.hidden = true; this.choices = null; },
    // found: the ids of the endings found so far. The counter, then the six titles in order, a dash for each unfound one.
    title(on, found) {
      el.title.classList.toggle('on', !!on);
      el.lang.hidden = !on; // the language link only on the title
      const n = found ? found.length : 0;
      el.found.textContent = n ? foundText(n) : '';
      endingList(el.foundList, n ? found : null);
    },
    ending(e, found) {
      el.endTitle.textContent = e.title; el.endText.textContent = nbsp(e.text); el.endAsked.textContent = nbsp(e.asked || '');
      el.endFound.textContent = foundText(found.length);
      endingList(el.endList, found);
      el.ending.classList.add('on');
      snapPx(); // the title steps down to fit its line
      // Cast again wakes only once the card has faded in (AGAIN_DELAY), so a stray tap from the finale cannot
      // restart before the ending is read; until then it is disabled and out of the tab order.
      this.againOff();
      againTimer = setTimeout(() => {
        againTimer = null;
        if (!el.ending.classList.contains('on')) return;
        el.again.disabled = false; el.again.tabIndex = 0;
        try { el.again.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
      }, AGAIN_DELAY);
    },
    againOff() { clearTimeout(againTimer); againTimer = null; el.again.disabled = true; el.again.tabIndex = -1; },
    endingHide() { el.ending.classList.remove('on'); this.againOff(); },
    fade(v, dur) { el.fade.style.transitionDuration = (dur || 0.6) + 's'; el.fade.style.opacity = v; },
    colors() {
      const s = document.documentElement.style;
      s.setProperty('--ui-panel', rgb(0, 0.86));
      s.setProperty('--ui-panel-soft', rgb(0, 0.6)); // under Mute and the language link
      s.setProperty('--ui-solid', rgb(0));
      s.setProperty('--ui-edge', rgb(6));
      s.setProperty('--ui-ink', mixWhite(11, WS.mood > 1 ? 0.25 : 0.4));
      s.setProperty('--ui-dim', mixWhite(9, 0.2));
      s.setProperty('--ui-accent', WS.mood > 1 ? mixWhite(15, 0.45) : rgb(15)); // the ▾ and labels stay visible on the red panel
      document.body.style.background = rgb(0);
    },
  };
  return ui;
}
const CHOICE_GRACE = 0.4, AGAIN_DELAY = 1600;
// The template's own text, in the page's language: the tab title, the labels and the title screen.
const STATIC_TEXT = [
  ['#stage', 'aria-label', 'Still Water, a short fishing tale'], ['#mute', '', 'Mute'], ['#skip', '', 'Skip fish'],
  ['#thinkWho', '', 'Fisherman'], ['#card .hint', '', 'Tap to continue'], ['#title h1', '', 'Still Water'],
  ['#title .sub', '', 'A short fishing tale'], ['#title .begin', '', 'Tap to begin'],
  ['#title .how', '', 'Tap to cast. Tap when the float goes under. Hold to reel.'], ['#again', '', 'Cast again'],
];
function staticText() {
  document.documentElement.lang = LANG;
  document.title = tr('Still Water') + (TEST_BUILD ? tr(' (test build)') : '');
  for (const [sel, attr, s] of STATIC_TEXT) {
    const n = document.querySelector(sel);
    if (n && attr) n.setAttribute(attr, tr(s)); else if (n) n.textContent = tr(s);
  }
}
// The link to the other language's page (one page per language): the English page sits at the root with
// ru/ below it, so from index.html or test.html it goes down to ru/, and from the Russian page back up to
// ../, keeping the test page's name. Under file:// a folder does not open its index, so it is named. With a
// ?lang override the page links to itself in the other language instead.
const OTHER_LANG = { en: { code: 'ru', label: 'RU', name: 'Русский' }, ru: { code: 'en', label: 'EN', name: 'English' } };
function langHref() {
  const other = OTHER_LANG[LANG].code;
  if (LANG !== DEFAULT_LANG) return '?lang=' + other;
  const file = window.location.pathname.split('/').pop();
  const page = /test\.html$/.test(file) ? file : window.location.protocol === 'file:' ? 'index.html' : '';
  return (DEFAULT_LANG === 'ru' ? '../' : 'ru/') + page;
}
function langLink(a) {
  const o = OTHER_LANG[LANG];
  a.textContent = o.label; a.href = langHref();
  a.setAttribute('hreflang', o.code); a.setAttribute('lang', o.code); a.setAttribute('aria-label', o.name);
}
function boot() {
  LANG = pickLang();
  staticText();
  try { REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (err) { REDUCED_MOTION = false; }
  UI = makeUI();
  langLink(UI.el.lang);
  init();
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.getElementById('stage');
  const wrap = document.getElementById('wrap');
  let IMG = null;
  function resize() {
    const aw = Math.max(1, wrap.clientWidth), ah = Math.max(1, wrap.clientHeight);
    const nh = clamp(Math.round((W * ah) / aw), H_MIN, H_MAX);
    if (nh !== H || !IMG) {
      H = nh;
      canvas.width = W; canvas.height = H;
      alloc();
      IMG = ctx.createImageData(W, H);
      OUT32 = new Uint32Array(IMG.data.buffer);
      ASH.length = 0;
    }
    const sc = Math.min(aw / W, ah / H);
    const sw = Math.floor(W * sc), sh = Math.floor(H * sc);
    stage.style.width = sw + 'px'; stage.style.height = sh + 'px';
    document.documentElement.style.setProperty('--u', sw / 100 + 'px');
    document.documentElement.style.setProperty('--gp', sw / W + 'px');
    document.getElementById('prompt').style.bottom = ((34 / H) * 100).toFixed(2) + '%';
    UI.snapPx();
    UI.dlgCap();
    UI.thinkRelayout();
    UI.fitChoices();
    UI.cardRelayout();
  }
  window.addEventListener('resize', resize);
  resize();
  // The web fonts arrive after the first layout (display=swap), and the Cyrillic or italic subset only when
  // first used: the bubble, the panel's cap, the two columns and the pixel sizes are measured again with the
  // real metrics each time a load finishes.
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(resize, () => {});
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', resize);
  }
  resetAll();
  UI.fade(0, 1.6);

  stage.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('button, a')) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect(); // the stage is scaled uniformly, so internal pixels map by ratio
    const ix = (e.clientX - r.left) / Math.max(1, r.width) * W, iy = (e.clientY - r.top) / Math.max(1, r.height) * H;
    if (!UI.inDialog(e.target) && companionHit(ix, iy)) companionTap(); else press();
  });
  window.addEventListener('pointerup', release);
  const unlockAudio = e => { if (e && e.target && e.target.id === 'mute') return; SFX.init(); SFX.resume(); };
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(t => window.addEventListener(t, unlockAudio, { passive: true }));
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (/^Digit[1-6]$/.test(e.code) && UI.choices) {
      if (UI.choicesCold()) return;
      const c = UI.choices[+e.code.slice(5) - 1];
      if (c) { e.preventDefault(); c.cb(); }
      return;
    }
    if (e.code === 'KeyC') { if (companionOpen()) companionTap(); return; } // the keyboard's way to tap him
    if (TEST_BUILD && e.code === 'KeyT') { setTestMode(!TEST); return; }
    if (TEST_BUILD && e.code === 'KeyS' && TEST) { testCatch(); return; }
    if (e.code === 'Space' || e.code === 'Enter') {
      if (document.activeElement && /^(BUTTON|A)$/.test(document.activeElement.tagName)) return;
      e.preventDefault();
      press();
    }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') release(); });
  document.addEventListener('visibilitychange', () => {
    if (!SFX.ctx) return;
    if (document.hidden) SFX.ctx.suspend(); else SFX.ctx.resume();
  });
  UI.el.mute.addEventListener('click', e => {
    e.stopPropagation();
    SFX.setMuted(!SFX.muted); // before init, so a mute before the first tap starts the audio silent
    SFX.init(); SFX.resume();
    UI.el.mute.textContent = tr(SFX.muted ? 'Unmute' : 'Mute'); // the label is the action
    UI.el.mute.blur();
  });
  UI.el.again.addEventListener('click', e => { e.stopPropagation(); if (UI.el.again.disabled) return; UI.el.again.blur(); UI.againOff(); restart(); });
  UI.againOff();
  if (TEST_BUILD) {
    UI.el.skip.addEventListener('click', e => { e.stopPropagation(); UI.el.skip.blur(); testCatch(); });
    if (new URLSearchParams(window.location.search).has('test') || window.location.hash === '#test') setTestMode(true);
  }

  let last = 0, lastMood = -1, lastDim = -1;
  function frame(ts) {
    const now = ts / 1000;
    let dt = last ? now - last : 1 / 60;
    last = now;
    dt = clamp(dt, 0, 0.1);
    update(dt);
    UI.tick();
    render(G.t);
    ctx.putImageData(IMG, 0, 0);
    if (Math.abs(WS.mood - lastMood) > 0.004 || Math.abs(WS.dim - lastDim) > 0.05) { lastMood = WS.mood; lastDim = WS.dim; UI.colors(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (IS_BROWSER) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
} else if (typeof module !== 'undefined') {
  UI = stubUI();
  module.exports = {
    init, render, update, press, release, resetAll, setPhase, setTestMode, testCatch, companionTap, companionHit,
    WS, G, STORY, DLG, SPECIES, makeFish, fishOpts, cardFishScale, buildPalette, PAL, FPAL, GPAL,
    get UI() { return UI; },
    get phase() { return G.phase; },
    setOut(buf) { OUT32 = buf; },
    setH(h) { H = h; alloc(); },
    get H() { return H; }, W, HY,
    spawnShadows, SHAD, spawnBirds, BIRDS, RINGS, RUN, ENDING_COUNT,
    OCEAN, spawnOceanShadow, spawnSeaShoal, bigRise, bigEnter, bigRestY, untween, bubble, boatLeft, WL,
    oceanCast, oceanTold, oceanLeave, playCine, CINE_OCEAN, CINE_STAY, CINE_INSIDE, THINK_AT,
    setCloudT(v) { cloudT = v; },
    setLang(l) { LANG = LANGS.indexOf(l) >= 0 ? l : DEFAULT_LANG; }, tr, get LANG() { return LANG; },
  };
}
})();

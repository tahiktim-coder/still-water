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
  CLOUDS.forEach((L, k) => { L.idx.fill(255); L.vis.fill(0); genCloudLayer(L, clouds.filter(c => c.layer === k)); });
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
}
function cloudIdx(x, y) {
  for (let k = 0; k < CLOUDS.length; k++) {
    const L = CLOUDS[k];
    let bx = x + L.off; if (bx >= CW) bx -= CW;
    const v = L.idx[clamp(y + L.oy, 0, HY - 1) * CW + bx];
    if (v !== 255) return v;
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
function sunRim(s, v) {
  const d = s.data.slice();
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const k = j * s.w + i;
    if (s.data[k] === 255) continue;
    const left = i === 0 || s.data[k - 1] === 255, below = j === s.h - 1 || s.data[k + s.w] === 255;
    if (left || below) d[k] = v;
  }
  return { w: s.w, h: s.h, data: d };
}
const COMP_LEAP2 = sunRim(scale2(COMP_LEAP), LEAP_RIM);
const BIRD = [sprite(['1...1', '.1.1.', '..1..']), sprite(['.....', '11.11', '..1..'])];
const EXCL = sprite(['.1.', '1b1', '1b1', '1b1', '.1.', '1b1', '.1.']);
const ICON = sprite(['.bbb.b', 'bbbbbb', '.bbb.b']);
const CABIN_ROWS = [
  '....00....',
  '...0000.0.',
  '..00000000',
  '.000000000',
  '0000000000',
  '.00000000.',
  '.0LL00000.',
  '.0LL00000.',
  '.00000000.',
];
const CABIN = sprite(CABIN_ROWS);
// The same cabin with the window dark (WS.cabinLit 0, after the still-water dawn): the building stays.
const CABIN_DARK = sprite(CABIN_ROWS.map(r => r.replace(/L/g, '0')));
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
let BOAT_ZOOM, SWIM_ZOOM, BOAT_SPECK, SPECK_LEAN_R, SPECK_LEAN_L, SWIM_SPECK;
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
function boatZoomSource() {
  const c = zoomCanvas(BOAT.w / 2);
  zoomSprite(c, BOAT, 0, -BOAT.wl);
  zoomSprite(c, FISHER, 18, FISHER_DY);
  for (let y = -27; y < -8; y++) c.put(9, y, 0); // the lantern pole and its hook
  c.put(8, -27, 0); c.put(7, -27, 0); c.put(7, -26, 0);
  zoomLantern(c, LANTERN_DY);
  zoomRod(c, 18, FISHER_DY + 9);
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
const speckOf = (rows, wl) => Object.assign(sprite(rows), { wl, ax: rows[0].length / 2, tx: rows[0].length / 2, ty: 0 });
function buildFarBoats() {
  const boat = boatZoomSource(), swim = swimZoomSource();
  BOAT_ZOOM = FAR_SCALES.map(sc => zoomFrame(boat, sc));
  SWIM_ZOOM = FAR_SCALES.map(sc => zoomFrame(swim, sc));
  BOAT_SPECK = speckOf(['.000.', '00000'], 2);
  SWIM_SPECK = speckOf(['00'], 1);
  SPECK_LEAN_R = speckOf(['..000', '0000.'], 2); // tipped toward the whirlpool's centre
  SPECK_LEAN_L = speckOf(['000..', '.0000'], 2);
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
const ENDING_COUNT = 6;
const ENDINGS = {
  home: { title: 'Home' }, dark: { title: 'Dark' }, cut: { title: 'Still water' },
  swallowed: { title: 'Swallowed' }, stay: { title: 'Stay' }, deep: { title: 'Deep' },
};
// The ending card's BASE (bible, section 4 Ending cards: twenty situations), keyed by ending (the silent
// variant as 'silent'), then by lake or sea (WS.sea past 0.5), then by boat or sunk (WS.boatSunk at 1); Still
// water at sea splits once more on whether he heard the fish. The number after each line is the bible's.
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
      boat: 'The lake is quiet again. The fish are hungry.' + NEXT_SUN, // 1
      sunk: 'The lake is quiet again. The boat is on the bottom and so is the gold.' + NEXT_SUN, // 2
    },
    sea: {
      boat: 'The sea is quiet again. Nobody will come this far to look.' + NEXT_SUN, // 3
      sunk: 'The sea is quiet again. The gold is on the bottom, and it is a long way down.' + NEXT_SUN, // 4
    },
  },
  dark: {
    lake: {
      boat: 'You sit with the lantern until it gutters out. Sometimes something takes the bait. ' + GUTTER, // 5
      sunk: 'You hang in the water beside the lantern until it gutters out. Sometimes something takes the bait. ' + GUTTER, // 6
    },
    sea: {
      boat: 'You sit with the lantern until it gutters out. There is no shore to see it from. Sometimes something takes the bait. ' + GUTTER, // 7
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
        heard: KNOW_WAY + 'bring' + NEW_SHORE, // 12
      },
      sunk: {
        quiet: 'You cut it. The red sun goes down for everyone. You swim for a while.', // 13
        heard: KNOW_WAY + 'carry' + NEW_SHORE, // 14 (unreachable: hear and gold share wish 2)
      },
    },
  },
  stay: { // lake only: the companion is a first wish
    lake: {
      boat: 'You stay. ' + STAY_END + 'The seat behind you is empty again. ' + STAY_DARK, // 15
      sunk: 'You stay, in the water. ' + STAY_END + STAY_DARK, // 16
    },
  },
  deep: { // sunk only: Deep needs the gold
    lake: { sunk: 'The gold is where you left it. So is everything else. ' + NO_BOTTOM + 'there is no bottom.' }, // 17
    sea: { sunk: 'The gold is somewhere below. ' + NO_BOTTOM + 'the big ones let you pass. There is no bottom.' }, // 18
  },
  silent: { // lake, boat: Silent needs two refusals, so no gold and no sea
    lake: { boat: 'You wanted nothing. It showed you anyway. You row until the water is only water. Some evenings, the sunset looks back.' }, // 19
  },
  swallowed: { // act 0, the sea
    sea: { boat: 'Somewhere far above, the sun is still shining on the sea. There is no boat on it.' }, // 20
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
      cabin: 'The knocking stops. Now it’s you on the inside.',
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
    // Phase 22, Swallowed: whirl is the whirlpool's radius, whirlSpin its turning, whirlDark its dark centre,
    // whirlPh the accumulated turn; whirlBoat the speck's way round the spiral (1 at the centre, past 1 under);
    // seaEye the eye opening where it went down.
    whirl: 0, whirlSpin: 0, whirlDark: 0, whirlPh: 0, whirlBoat: 0, seaEye: 0,
    // Stay: companionStand swaps in the standing frame, leap is his progress along the parabola to the disc
    // (held at 1 while he rides it down), rock the boat's push-off wobble, lanternWarm widens the glow.
    companionStand: 0, leap: 0, rock: 0, lanternWarm: 0,
    // Phase 6: dive is the Deep descent (the horizon rises past the top and the mirror fills the frame);
    // glint is the gold pile's two-frame sparkle seen from beneath.
    dive: 0, glint: 0,
    shoalOut: 0, // the still-water dawn: the shoal steers to the horizon at full weight and leaves as it arrives
    // Phase 21, the Still water pictures: newShore the far coastline rising (sea, heard), farDrift the speck's
    // slow drift from the centre once the camera has pulled back (sea, not heard), goldBelow the one glint
    // under the swimmer when he wakes in the water again (lake, sunk).
    newShore: 0, farDrift: 0, goldBelow: 0,
  });
}
const G = {
  phase: 'title', t: 0, pt: 0, holding: false, bob: null, cast: null, wait: null, reel: null, land: null,
  rodA: REST_A, rodBend: 0, bobDip: 0, biteWin: 1, tip: { x: 110, y: 205 }, hand: { x: 136, y: 227 }, farRing: 0.6,
  lanternPos: { x: 124, y: 218 }, tutorial: 0, ringT: 0, hb: 0, hbGap: HB_GAP,
  capUntil: 0, thinkUntil: 0, thinkAt: -9, thinkMore: false, cardReady: false, thinkPending: [], knock: null,
  arrived: true, open: null, eyesDone: false, eyesAt: -9, frozeT: 0,
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
    dlgShow: f('dlgShow'), dlgText() {}, dlgChoices(list) { this.choices = list; },
    dlgMore() {}, dlgBusy() {}, dlgHide: f('dlgHide'), thinkMore() {}, cardReady() {},
    // The thought bubble: logged as 'think' entries; its choices (the companion's question) go in choices.
    think(text, opts) { log.push(['think', text, opts && opts.side || 'fisherman']); if (opts && opts.choices) { this.choices = opts.choices; this.thinkOwns = true; } },
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
  const L0 = CLOUDS[0], L1 = CLOUDS[1], idx0 = L0.idx, vis0 = L0.vis, idx1 = L1.idx, vis1 = L1.vis, off0 = L0.off, off1 = L1.off;
  for (let y = 0; y < HY; y++) {
    const ty = y / HY;
    const base = 4.1 + 4.5 * Math.pow(ty, 1.5);
    const dyh = HY - y;
    const hb = hg * 1.7 * Math.exp(-(dyh * dyh) / 700);
    const dy = y - sy, dy2 = dy * dy;
    const row = y * W;
    const row0 = clamp(y + L0.oy, 0, HY - 1) * CW, row1 = clamp(y + L1.oy, 0, HY - 1) * CW;
    const litY = SUN0Y - y; // a corridor edge this far above the sun is sun-lit where litY < 3.2 |dx|
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const m = gone ? 255 : shifted ? mountShift(x, y, inv) : MOUNT[i];
      if (m !== 255 && !shifted) { TOP[i] = m; continue; }
      const dx = x - sx, d2 = dx * dx + dy2;
      const g = glow * (2.1 * Math.exp(-d2 * i1) + 1.2 * Math.exp(-d2 * i2)) + hb * Math.exp(-(dx * dx) / 4500);
      let bx = x + off0; if (bx >= CW) bx -= CW;
      let cp = row0 + bx, c = idx0[cp], cv = vis0;
      if (c === 255) { bx = x + off1; if (bx >= CW) bx -= CW; cp = row1 + bx; c = idx1[cp]; cv = vis1; }
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
function sunPix(dx, dy, d2) {
  const r = WS.sunR;
  if (WS.sunKind === 0) {
    const rim = d2 > (r - 1) * (r - 1);
    return WS.mood > SUN_SOLID_MOOD ? (rim ? 11 : 20) : (rim ? 10 : 11);
  }
  let v = d2 > (r - 1.6) * (r - 1.6) ? 8 : d2 < (r * 0.5) * (r * 0.5) ? 10 : 9;
  if (WS.pupil > 0.01) {
    const ph = r * 0.84, px = dx - WS.pupilDx;
    if (Math.abs(dy) < ph) {
      const half = WS.pupil * 2.3 * Math.sqrt(1 - (dy * dy) / (ph * ph));
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
  if (WS.cabin > 0 && !seaGone()) stampTop(WS.cabinLit < 0.5 || WS.cabinKnock > 0.5 ? CABIN_DARK : CABIN, CABIN_X, CABIN_Y, WS.cabin * (1 - WS.sea));
  // The far boat reflects for free, and stays through the opening's dip to black (it leaves behind full black).
  if (WS.farBoat > 0 && (G.phase === 'title' || (G.open && G.open.stage === 0))) stampTop(FARBOAT, FAR_X, HY - FARBOAT.h);
  if (WS.stalk > 0) {
    const yEnd = WS.sunY - WS.sunR * 0.9;
    const y1 = yEnd * WS.stalk * (1 - WS.stalkCut);
    for (let y = 0; y < Math.min(HY, y1); y++) {
      const x = Math.round(WS.sunX + Math.sin(y * 0.04 + t * 0.9) * 0.8 * (y / Math.max(1, yEnd)));
      if (x >= 0 && x < W && mountIdx(x, y) === 255) TOP[y * W + x] = 1;
    }
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
// The big one's plan shape, u along the body (head at u = -1, tail tip at u = 1), v across it, both -1..1.
// Returns the darkness 0..1 inside, 0 outside: an elliptical body with a ridge down the middle, a pair of
// pectoral fins, and a forked tail that flares from the root.
function bigShape(u, v) {
  const av = Math.abs(v);
  if (u < 0.44) { // body, an ellipse from -1 to 0.44
    const ub = (u + 0.28) / 0.72, q = ub * ub + v * v;
    if (q < 1) return 0.25 + 0.75 * (1 - q);
    const fu = Math.abs(u + 0.15); // fins root by the head
    if (fu < 0.2 && av < 1 + 0.42 * (1 - fu / 0.2) - Math.abs(u + 0.15) * 0.8) return 0.3;
    return 0;
  }
  const tt = (u - 0.44) / 0.56; // tail: flaring, forked at the tip
  const p = lerp(0.14, 0.72, tt), notch = 0.55 * tt * tt * tt;
  return av < p && av > notch ? 0.3 + 0.3 * (1 - av / p) : 0;
}
// a is its presence (0 to 1 as it fades in from the deep): each shade step is dithered by it.
function drawBigShadow(b) {
  const hw = b.w * 0.5, hh = b.h * 0.5, a = b.a === undefined ? 1 : b.a;
  if (a <= 0) return;
  const y0 = Math.max(HY, Math.floor(b.y - hh * 1.5)), y1 = Math.min(H - 1, Math.ceil(b.y + hh * 1.5));
  const x0 = Math.max(0, Math.floor(b.x - hw - 2)), x1 = Math.min(W - 1, Math.ceil(b.x + hw + 2));
  for (let y = y0; y <= y1; y++) {
    const v = (y - b.y) / hh, rip = RIPX[y], row = y * W;
    for (let x = x0; x <= x1; x++) {
      const d = bigShape(-(x + rip - b.x) / hw, v);
      if (d <= 0) continue;
      const i = row + x, f = FRAME[i];
      if (f < 12) FRAME[i] = Math.max(0, f - Math.floor((d > 0.7 ? 4 : d > 0.4 ? 3 : 2) * a + BAYER[((y & 3) << 2) | (x & 3)]));
    }
  }
}
// The Swallowed whirlpool (bible, section 8): inside an ellipse around the sinking point the water already
// computed is resampled at an angle that grows toward the centre, so the mirrored sky visibly turns; three
// spiral arms lighten and darken it, and the centre sinks to the darkest index. The far half is squashed
// under the horizon. In the water only, never reflected.
const WHIRL_R = 70, WHIRL_CY = WL + 8, WHIRL_UP = 12, WHIRL_FLAT = 0.4, WHIRL_WIND = 2.4, WHIRL_ARMS = 3;
const WSCR = new Uint8Array(216 * 600);
const whirlRy = r => ({ up: Math.min(r * WHIRL_FLAT, WHIRL_UP), dn: r * WHIRL_FLAT });
function whirlSrc(x, y, r, ry, rot, out) { // the source pixel of (x, y) and its depth q, into out
  const dx = x - W / 2, up = y < WHIRL_CY, ey = (y - WHIRL_CY) * (r / (up ? ry.up : ry.dn)), d = Math.sqrt(dx * dx + ey * ey);
  if (d >= r) return false;
  const q = 1 - d / r, a = Math.atan2(ey, dx) - rot(q), sy = d * Math.sin(a);
  out.x = Math.round(W / 2 + d * Math.cos(a));
  out.y = Math.round(WHIRL_CY + sy * ((sy < 0 ? ry.up : ry.dn) / r));
  out.q = q; out.a = a;
  return true;
}
const WSRC = { x: 0, y: 0, q: 0, a: 0 };
function drawWhirl() {
  const r = WS.whirl;
  if (r < 1) return;
  const ry = whirlRy(r), y0 = Math.max(HY + 1, Math.floor(WHIRL_CY - ry.up)), y1 = Math.min(H - 1, Math.ceil(WHIRL_CY + ry.dn));
  const x0 = Math.max(0, Math.floor(W / 2 - r)), x1 = Math.min(W - 1, Math.ceil(W / 2 + r));
  WSCR.set(FRAME.subarray(y0 * W, (y1 + 1) * W), 0);
  const wind = WHIRL_WIND * (r / WHIRL_R), ph = WS.whirlPh, rot = q => q * q * wind + q * ph;
  const spin = WS.whirlSpin, dark = WS.whirlDark * 11;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!whirlSrc(x, y, r, ry, rot, WSRC)) continue;
    const sy = clamp(WSRC.y, y0, y1), sx = clamp(WSRC.x, 0, W - 1);
    let v = WSCR[(sy - y0) * W + sx];
    if (v > 11) v = 11;
    const arm = Math.sin(WHIRL_ARMS * WSRC.a) * spin * Math.min(1, WSRC.q * 4);
    const f = v + (arm > 0.7 ? 2 : arm > 0.4 ? 1 : arm < -0.5 ? -1 : 0) - dark * Math.pow(WSRC.q, 1.3);
    FRAME[y * W + x] = ci(dith(f, x, y));
  }
}
// The eye where the boat went down (bible, Swallowed): an almond about 40 px wide in the dark ramp, a gold
// iris (13 to 16) and a black slit pupil (19), the same eye as the bait and the red sun, looking up.
const SEA_EYE_HW = 20, SEA_EYE_HH = 7, SEA_IRIS = 6;
function seaEyePix(dx, dy, e) { // the index for a pixel of the eye, or -1 outside it
  const u = dx / SEA_EYE_HW;
  if (Math.abs(u) >= 1) return -1;
  const lid = (1 - u * u) * e, top = Math.round(-SEA_EYE_HH * lid), bot = Math.round(SEA_EYE_HH * 0.8 * lid);
  if (dy < top - 1 || dy > bot + 1) return -1;
  if (dy < top || dy > bot || top === 0) return 0; // the lid line
  const ir = Math.hypot(dx, dy);
  if (ir <= SEA_IRIS) {
    if (Math.abs(dx) <= 1.2 * (1 - (dy / SEA_IRIS) * (dy / SEA_IRIS)) + 0.2) return 19; // the slit
    if (dx === -2 && dy === -3) return 20; // one glint
    const lit = (-dx - dy) / (SEA_IRIS * 1.4) + 0.5 - ir / (SEA_IRIS * 3);
    return lit > 0.75 ? 16 : lit > 0.45 ? 15 : lit > 0.15 ? 14 : 13;
  }
  return dy < top + 2 ? 2 : Math.abs(u) > 0.75 ? 3 : 4; // the white, in the dark ramp, shaded under the lid
}
function drawSeaEye() {
  const e = WS.seaEye;
  if (e <= 0.02) return;
  const cx = W / 2, cy = WHIRL_CY;
  for (let dy = -SEA_EYE_HH - 1; dy <= SEA_EYE_HH + 1; dy++) {
    const y = cy + dy;
    if (y <= HY || y >= H) continue;
    for (let dx = -SEA_EYE_HW; dx <= SEA_EYE_HW; dx++) {
      const v = seaEyePix(dx, dy, e);
      if (v >= 0) FRAME[y * W + cx + dx] = v;
    }
  }
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
// In the whirlpool the speck rides the spiral instead (drawWhirlBoat).
function drawFarBoat() {
  if (WS.whirlBoat > 0) { drawWhirlBoat(); return; }
  const s = farSprite(WS.far), x0 = Math.round(zoomAnchorX() - s.ax), y0 = WL - s.wl;
  stampR(s, x0, y0, WL);
  G.tip = { x: x0 + s.tx, y: y0 + s.ty }; // a cast from out here leaves from the silhouette's rod
}
// The tracking cue: while the camera is out (far > 0) a small ring leaves the group's waterline every
// FAR_RING_GAP seconds, sized to the frame, so even the speck visibly sits on the water (not in the whirlpool).
const FAR_RING_GAP = 1.2, FAR_RING_FIRST = 0.6, FAR_RING_MIN = 1;
function farRings(dt) {
  if (WS.far <= 0 || WS.whirl > 0 || WS.whirlBoat > 0) { G.farRing = FAR_RING_FIRST; return; }
  G.farRing += dt;
  if (G.farRing < FAR_RING_GAP) return;
  G.farRing -= FAR_RING_GAP;
  const w = farLive() ? BOAT.w : farSprite(WS.far).w;
  ring(zoomAnchorX(), WL + 1, false, clamp(w / 18, FAR_RING_MIN, 2.4), true); // it outgrows the frame
}
// Swallowed: the speck goes once round the centre on a shrinking spiral, leaning in toward it, and slips
// under at the centre (whirlBoat past 1). It starts where it sat, on the whirlpool's far side.
const WHIRL_SINK = 0.3;
function drawWhirlBoat() {
  const p = Math.min(1, WS.whirlBoat), sink = clamp((WS.whirlBoat - 1) / WHIRL_SINK, 0, 1);
  const ry = whirlRy(WHIRL_R), r0 = (WHIRL_CY - WL) * WHIRL_R / ry.up, rr = r0 * Math.pow(1 - p, 0.8);
  const a = -Math.PI / 2 + p * Math.PI * 2, sn = Math.sin(a);
  const x = W / 2 + rr * Math.cos(a), wl = Math.round(WHIRL_CY + rr * sn * ((sn < 0 ? ry.up : ry.dn) / WHIRL_R));
  const c = Math.cos(a), s = c < -0.3 ? SPECK_LEAN_R : c > 0.3 ? SPECK_LEAN_L : BOAT_SPECK;
  stampR(s, Math.round(x - s.w / 2), wl - s.wl + Math.round(sink * 3), wl);
  G.tip = { x: Math.round(x), y: wl - s.wl }; // the line, while the float is still out, follows the speck
}
// Facing the horizon, turned (the red), or standing (Stay).
function compSprite() { return WS.companionStand > 0.5 ? COMP_STAND : WS.companionTurn > 0.5 ? COMP_TURN : COMP; }
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
  if (!farLive()) { drawFarBoat(); return; }
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
// The centre of the leaping frame: from his seat (feet on the plank) along the parabola to the disc's centre.
function leapXY(p, bx, dy) {
  const x0 = bx + COMP_DX + COMP.w / 2, y0 = compY(dy) + COMP.h - COMP_LEAP2.h / 2;
  // x leads (out-eased), so he is over the open sky between the ridges before the top of the arc
  return { x: lerp(x0, WS.sunX, E.out2(p)), y: lerp(y0, WS.sunY + 1, p) - LEAP_ARC * 4 * p * (1 - p) };
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
    plot(p.x, p.y, p.v);
  }
  for (const a of ASH) plot(a.x, a.y, 10);
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
  if (WS.lantern > 0.01 && WS.lanternFlicker > 0.05 && farLive()) { // far out the lantern is a silhouette, and its light is off
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
    const wx = CABIN_X + 2.5, wy = CABIN_Y + 7;
    glowTint(wx, wy + s, 7, 17, 0.55 * cab); // the sky (and the cabin in it) slides down with the upper jaw
    glowTint(wx, 2 * HY - 1 - wy - s, 5, 17, 0.35 * cab);
  }
}
function render(t) {
  buildPalette(WS.mood, WS.dim);
  renderTop(t);
  topExtras(t);
  computeWater(t);
  drawRings();
  drawShadows();
  drawOceanShadows();
  drawWhirl();
  drawSeaEye();
  drawOceanMarker(t);
  drawEyes();
  SPR.fill(255);
  drawBoatGroup(t);
  drawBobber();
  drawGoldFish(t);
  drawLanding();
  drawParts(t);
  if (farLive() || G.bob) drawLine(); // far out the rod is in the silhouette; a float in the water still trails its line
  composite();
  drawFangs();
  drawUIPix(t);
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
  // Swallowed: a slow rising swirl, noise through a band-pass that falls and wobbles as it turns.
  swirl() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, d = SWIRL_DUR;
    const s = c.createBufferSource(); s.buffer = this.buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(130, t + d);
    const l = c.createOscillator(); l.frequency.value = 2.5;
    const lg = c.createGain(); lg.gain.value = 60;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + d * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    l.connect(lg); lg.connect(f.frequency); s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random()); l.start(t); s.stop(t + d + 0.05); l.stop(t + d + 0.05);
  },
  crunch() { this.noise(0.9, 0.45, 'lowpass', 900, 60, 1.2); this.tone(90, 1, 'sawtooth', 0.25, 28); },
  knock() { this.tone(88, 0.16, 'sine', 0.32, 52); this.noise(0.12, 0.16, 'lowpass', 380, 140, 1.2); }, // one knock, muffled by the water between
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
function dlgRun(lines, done) {
  DLG.q = lines.slice(); DLG.done = done || null; DLG.active = true; DLG.cur = null; DLG.wait = 0; DLG.run++;
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
    UI.dlgShow(L.who || '', L.style || '');
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
  UI.think(L.text, { side, who: side === 'fisherman' ? L.who : '', mark: L.mark, choices: L.choices ? choiceList(L) : null, more: !L.choices });
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
    at('cap', 0.4, () => cap(refused ? 'The sun sets the way suns do.' : 'The sun slips into the ' + placeWord() + ' like a coin into a well.', 4.8));
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
// Stay (bible, section 8): two claims collide over him. He stands, the eye snaps to him and the heartbeat
// quickens; he leaps from the stern along a parabola to the red disc; on impact the glow spikes, the eye
// closes and the disc drops from its line into the sea exactly as in the still-water cut, and he goes under
// with it. Then the night comes back without a sun: the lantern stays lit and warms a little, the boat sits
// where it is, and the last three seconds fade to black. The sun never returns; sunX never moves.
const STAY_LOOK = 7;                    // pupilDx toward the stern, which is to the right of the disc
// Phase 23: a slower leap (2.4 s) so a phone can follow it, and the impact frame held STAY_HOLD before the drop.
const STAY_LEAP_AT = 2, STAY_LEAP_DUR = 2.4, STAY_HIT = STAY_LEAP_AT + STAY_LEAP_DUR, STAY_HOLD = 0.45;
const STAY_DROP_AT = STAY_HIT + STAY_HOLD, STAY_DROP = 1.5, STAY_UNDER = STAY_DROP_AT + STAY_DROP, STAY_NIGHT = 5, STAY_FADE_AT = 13;
// The eye follows him through the arc: from STAY_LOOK at the stern to straight at him as he reaches it.
function stayEyeTrack() {
  const c = leapXY(WS.leap, boatLeft(), boatSinkPx());
  WS.pupilDx = clamp((c.x - WS.sunX) * 0.12, -STAY_LOOK, STAY_LOOK);
}
function stayPushOff() {
  WS.companionStand = 0;
  if (!swimming()) { WS.rock = 1; tween(WS, 'rock', 0, 1.2); } // no boat to rock on the sunk path
  const x = boatLeft() + COMP_DX + 4;
  ring(x, WL + 1); ring(x + 3, WL + 2); SFX.plop();
}
// The glow spike is skipped for a player who asked for less motion; the sky fish goes under with the sun.
function stayImpact() {
  if (!REDUCED_MOTION) WS.sunGlow = 2.4;
  WS.leap = 1; WS.pupil = 0; SFX.crunch(); goldFishFade(STAY_HOLD + STAY_DROP);
}
function stayDiscHitsWater() { SFX.hiss(2.2); ring(SUNX, HY + 3, true); ring(SUNX, HY + 3); splash(SUNX, HY + 2, 10); SFX.drone(false); }
function stayGoneUnder() { WS.companion = 0; WS.leap = 0; }
const CINE_STAY = {
  dur: 16,
  init(s) {
    s.y0 = WS.sunY;
    if (!swimming()) WS.companionStand = 1; // sunk: he leaps from the water, never stands on it
    tween(WS, 'pupilDx', STAY_LOOK, 0.4);
    G.hbGap = HB_GAP * 0.45; G.hb = Math.min(G.hb, 0.4); // the heartbeat quickens
  },
  update(t, dt, at, s) {
    at('leap', STAY_LEAP_AT, stayPushOff);
    if (t >= STAY_LEAP_AT && t < STAY_HIT && WS.companion > 0) { WS.leap = clamp((t - STAY_LEAP_AT) / STAY_LEAP_DUR, 0, 1); stayEyeTrack(); }
    at('hit', STAY_HIT, stayImpact);
    at('unspike', STAY_HIT + 0.07, () => { WS.sunGlow = 1.25; }); // the spike lasts two frames; the frame holds STAY_HOLD
    if (t >= STAY_DROP_AT) {
      WS.sunY = lerp(s.y0, HY + 28, E.in(clamp((t - STAY_DROP_AT) / STAY_DROP, 0, 1)));
      WS.stalkCut = clamp((t - STAY_DROP_AT) / 0.7, 0, 1);
    }
    at('hiss', STAY_DROP_AT + 1.3, stayDiscHitsWater);
    at('under', STAY_UNDER, stayGoneUnder);
    if (t > STAY_DROP_AT + 0.1) WS.sunGlow = lerp(1.25, 0.12, clamp((t - STAY_DROP_AT - 0.1) / 2.5, 0, 1));
    const k = clamp((t - STAY_UNDER) / STAY_NIGHT, 0, 1);
    if (k > 0) {
      WS.mood = lerp(2, 1, k); WS.starA = WS.frozen ? 0 : k; WS.ash = 1 - k; // a frozen sky stays starless
      WS.horizGlow = lerp(1.3, 0.3, k); WS.lanternWarm = 0.6 * k;
    }
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
function lakeWhisper(text) { UI.dlgShow(WS.sea > 0.5 ? 'The sea' : 'The lake', 'whisper'); UI.dlgText(text); }
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
// on a vast lit sea, huge shadows drift to the horizon, and one the width of the screen stops under the boat.
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
const bigRestY = () => HY + 16 + (H - HY) / 6; // its back just under the surface, the fins clear of the horizon
const BIG_DEEP_PX = 12; // how many rows lower it swims while crossing, before it rises to rest
// The big one (bible, section 8) does not rise from below: after the shoal has swum alone for a while it
// enters at the left edge, faint and deep (a few rows lower, its presence a rising from 0 over OCEAN_FADE_IN
// seconds), crosses to the centre over OCEAN_CROSS seconds slowing all the way, rises a little as it slows and
// settles under the boat. drawBigShadow reads a.
function bigEnter() {
  const h = (H - HY) / 3, restY = bigRestY();
  OCEAN.big = { x: -W * 0.55, y: restY + BIG_DEEP_PX, w: W, h, a: 0, crossing: true };
  tween(OCEAN.big, 'x', W / 2, OCEAN_CROSS, E.out2, () => { if (OCEAN.big) OCEAN.big.crossing = false; });
  tween(OCEAN.big, 'y', restY, OCEAN_CROSS, E.in);
  tween(OCEAN.big, 'a', 1, OCEAN_FADE_IN, E.io);
}
// For the shots: the big one already at rest under the boat.
function bigRise() {
  bigEnter();
  const b = OCEAN.big;
  untween(b, 'x'); untween(b, 'y'); untween(b, 'a');
  Object.assign(b, { x: W / 2, y: bigRestY(), a: 1, crossing: false });
}
// The smaller shapes scatter from the big one as its head reaches them, one by one, not all at once.
const SCATTER_REACH = 0.55;
function scatterFrom(b) {
  for (const s of OCEAN.shad) {
    if (s.fade > 0 || Math.abs(s.x - b.x) > b.w * SCATTER_REACH) continue;
    const dx = s.x - b.x, dy = s.y - b.y, n = Math.hypot(dx, dy) || 1;
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
// it the prompt comes back and a pale ring pulses on the big one's back below the speck, where the float
// would land (oceanMark, drawOceanMarker).
const OCEAN_GRACE = 1.0, MARK_UP = 0.2, SWIRL_DUR = 5;
function oceanTold() {
  dlgRun([fish('Here. I wouldn’t cast while it’s under you. It’s been waiting longer than you have.')], () => { OCEAN.hint = false; setPhase('ocean'); });
}
function oceanMark() {
  const b = OCEAN.big;
  return { x: Math.round(W / 2 + WS.farDrift), y: Math.round(b ? b.y - b.h * MARK_UP : bigRestY() - (H - HY) / 15) };
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
  STORY.ocean = 'swallowed';
  SFX.weight(false);
  playCine(CINE_SWALLOW, () => showEnding('swallowed'));
}
// Swallowed (bible, section 8): the float lands on the marker, the water round the boat turns into a
// whirlpool, the speck circles once and slips under at the centre, the water slows, and an eye opens where it
// went down, looking up. Black, then the card.
const SW = { fly: 0.7, open: 0.9, grow: 3, circle: 1.6, round: 3.4, still: 5.0, eye: 5.7, eyeOpen: 1.2, black: 8.4, spin: 2.2 };
function swallowFloat(t, at, s) {
  if (t < SW.fly) { const k = t / SW.fly; G.bob = { x: lerp(s.from.x, s.to.x, k), y: lerp(s.from.y, s.to.y, k) - Math.sin(k * Math.PI) * 14, fly: true }; }
  at('land', SW.fly, () => { G.bob = { x: s.to.x, y: s.to.y, fly: false }; ring(s.to.x, s.to.y + 1); SFX.plop(); });
  at('float', SW.open + SW.grow * 0.55, () => { G.bob = null; }); // the whirlpool has reached the float
}
const CINE_SWALLOW = {
  dur: SW.black + 0.4,
  init(s) {
    s.from = { x: G.tip ? G.tip.x : W / 2, y: WL - 2 }; s.to = oceanMark();
    G.bob = { x: s.from.x, y: s.from.y, fly: true };
    WS.whirlPh = 0;
    SFX.whoosh();
  },
  update(t, dt, at, s) {
    swallowFloat(t, at, s);
    WS.whirlPh += dt * SW.spin * WS.whirlSpin;
    at('cap', 1.1, () => cap('The float lands on something that is not water.', 3.2));
    at('open', SW.open, () => {
      tween(WS, 'whirl', WHIRL_R, SW.grow, E.io); tween(WS, 'whirlSpin', 1, SW.grow * 0.7, E.io); tween(WS, 'whirlDark', 1, SW.grow, E.in);
      if (OCEAN.big) tween(OCEAN.big, 'a', 0.4, SW.grow);
      SFX.swirl();
    });
    at('circle', SW.circle, () => tween(WS, 'whirlBoat', 1 + WHIRL_SINK, SW.round, E.in));
    at('still', SW.still, () => { tween(WS, 'whirlSpin', 0, 1.2, E.out); tween(WS, 'whirlDark', 0.85, 1.2); });
    at('eye', SW.eye, () => { tween(WS, 'seaEye', 1, SW.eyeOpen, E.out); SFX.heartbeat(); });
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
// The big one slides off left over 4 s, then the boat comes back to full size over 4 s while sea stays 1: an
// empty horizon, the giant shapes still passing beneath, the shoal spawned. No caption about it.
const CINE_OCEAN_BACK = {
  dur: OCEAN_RETURN * 2 + 0.6,
  init() {
    const b = OCEAN.big;
    SFX.weight(false);
    if (b) tween(b, 'x', -b.w * 0.65, OCEAN_RETURN, E.in, () => { if (OCEAN.big === b) OCEAN.big = null; });
  },
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
    fish((STORY.refused === 1 ? 'That was my first, too.' : 'That was my second, too.') + ' This one costs the rest of the day.'),
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
  const parts = STORY.wishes.map(w => RECOUNT[w]);
  return 'Everything you asked for. ' + parts.map(sentence).join(' ') + ' And forever. Your words, not mine.';
}
function wish3Choices() {
  const c = [
    { label: 'Let me go home', pick: endHome },
    { label: 'Take the light away', pick: endDark },
    { label: 'Cut the line', pick: endCut },
  ];
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
  return typeof cell === 'string' ? cell : cell[STORY.heard ? 'heard' : 'quiet'];
}
// Returns the sentence and the state it came from, so the asked-for line can avoid repeating a refusal.
function endingExtra(key, place, boat) {
  const x = END_EXTRA[key];
  for (const st of x.order) {
    if (!END_STATES[st]()) continue;
    const line = altLine(x.lines[st], place, boat);
    if (line) return { line, state: st };
  }
  return { line: '', state: null };
}
// refusalSaid: the extra sentence already told the refusal, so the list drops its "nothing" part (and is
// left out entirely when nothing was granted).
// The labels are his own words, so they are listed one per line under the head rather than run into a sentence.
const ASKED_SEP = '\n'; // #endAsked keeps the line breaks (white-space: pre-line)
function askedLine(refusalSaid) {
  const labels = STORY.wishes.map(w => WISH_LABELS[w]);
  if (!labels.length) return refusalSaid ? '' : 'You asked for nothing.';
  const head = STORY.refused === 1 && !refusalSaid ? 'You asked for nothing, once. And for:' : 'You asked for:';
  return [head].concat(labels).join(ASKED_SEP);
}
// Stay after the forever wish: its extra line already says it will not get light, so the base drops STAY_DARK.
const stayBase = (key, base) => key === 'stay' && has('forever') ? base.replace(' ' + STAY_DARK, '') : base;
// Every Still water card (the silent variant too) ends with the bait still in his pocket: he will be the
// stranger for the next one. The exception is situation 10, the lake with the boat sunk. No other ending gets it.
const BAIT_END = 'There is a bait in your pocket. It has an eye.';
const hasPocket = (id, place, boat) => id === 'cut' && !(place === 'lake' && boat === 'sunk');
function composeEnding(id, variant) {
  const place = endingPlace(), boat = endingBoat(), key = variant === 'silent' ? 'silent' : id;
  const extra = endingExtra(key, place, boat);
  const parts = [stayBase(key, endingBase(key, place, boat)), extra.line];
  if (hasPocket(id, place, boat)) parts.push(BAIT_END);
  const refusalSaid = extra.state === 'refused1' || extra.state === 'refused2';
  return { id, variant: variant || '', title: ENDINGS[id].title, text: parts.filter(Boolean).join(' '), asked: askedLine(refusalSaid) };
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
function refreshPrompt() { UI.prompt(G.t < G.thinkUntil || !G.arrived ? '' : promptFor(G.phase)); }
function setPhase(p) {
  G.phase = p; G.pt = 0;
  refreshPrompt();
}
// Captions, with their end time tracked so the said lines can wait their turn.
function cap(t, dur, style) {
  G.capUntil = G.t + (dur || 2.5);
  UI.caption(t, dur, style);
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
  UI.think(text, { who: side === 'fisherman' ? 'Fisherman' : '', side, more: false });
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
function showCard(f) { thinkHide(); setPhase('card'); G.cardReady = false; UI.card(f); SFX.caught(); }
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
  Object.assign(G, { bob: null, cast: null, wait: null, reel: null, land: null, holding: false, rodA: REST_A, rodBend: 0, bobDip: 0, capUntil: 0, thinkUntil: 0, thinkAt: -9, thinkMore: false, cardReady: false, thinkPending: [], knock: null, arrived: true, open: null, eyesDone: false, eyesAt: -9, frozeT: 0, hbGap: HB_GAP, tip: { x: 110, y: 205 }, farRing: FAR_RING_FIRST });
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
// The thought bubble's outline (bible, 4b): a scalloped loop of outward arcs, four along the top, three
// along the bottom and one or two up each side, inset by the bulge so the bumps stay inside the box.
function cloudPath(w, h, u) {
  const b = Math.min(u * 1.5, h / 4);
  const x0 = b, y0 = b, x1 = w - b, y1 = h - b;
  const arcs = (ax, ay, bx, by, n, vert) => {
    let s = '';
    const c = Math.hypot(bx - ax, by - ay) / n, r = vert ? b + ',' + c / 2 : c / 2 + ',' + b;
    for (let i = 1; i <= n; i++) s += 'A' + r + ' 0 0 1 ' + (ax + (bx - ax) * i / n).toFixed(1) + ',' + (ay + (by - ay) * i / n).toFixed(1);
    return s;
  };
  const side = y1 - y0 > u * 9 ? 2 : 1;
  return 'M' + x0 + ',' + y0 + arcs(x0, y0, x1, y0, 4) + arcs(x1, y0, x1, y1, side, true) + arcs(x1, y1, x0, y1, 3) + arcs(x0, y1, x0, y0, side, true) + 'Z';
}
// Where each bubble sits, in internal pixels: its left edge, the y of its bottom edge, the x where the tail
// leaves it, and which way the tail leans (-1 toward the fisherman's head, +1 toward the companion's).
// The companion's question sits 18 px higher (yAsk) so its two 44 px buttons clear the fisherman's hat (y 218).
// In the red (mood past 1) the eye hangs where his bubble would sit, so his bubble moves down to y 205 and
// right of the disc (companionRed), clear of the eye and still above both heads.
const THINK_AT = {
  fisherman: { left: 122, y: 186, tail: 150, dir: -1 },
  companion: { left: 100, y: 190, yAsk: 172, tail: 160, dir: 1 },
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
function makeUI() {
  const $ = id => document.getElementById(id);
  const el = {
    stage: $('stage'), prompt: $('prompt'), caption: $('caption'), count: $('count'),
    think: $('think'), thinkPath: $('thinkPath'), thinkTail1: $('thinkTail1'), thinkTail2: $('thinkTail2'), thinkWho: $('thinkWho'), thinkText: $('thinkText'), thinkChoices: $('thinkChoices'), thinkMore: $('thinkMore'),
    card: $('card'), cardFish: $('cardFish'), cardName: $('cardName'), cardMeta: $('cardMeta'), cardDesc: $('cardDesc'), cardVoice: $('cardVoice'),
    dlg: $('dialog'), who: $('who'), text: $('text'), choices: $('choices'), more: $('more'),
    title: $('title'), found: $('found'), foundList: $('foundList'), ending: $('ending'), endTitle: $('endTitle'), endText: $('endText'), endAsked: $('endAsked'), endFound: $('endFound'), endList: $('endList'),
    again: $('again'), fade: $('fade'), mute: $('mute'), skip: $('skip'),
  };
  let capTimer = null;
  const rgb = (i, a) => 'rgba(' + (PALRGB[i * 3] | 0) + ',' + (PALRGB[i * 3 + 1] | 0) + ',' + (PALRGB[i * 3 + 2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  const mixWhite = (i, k) => 'rgb(' + [0, 1, 2].map(j => Math.round(PALRGB[i * 3 + j] + (255 - PALRGB[i * 3 + j]) * k)).join(',') + ')';
  // mark: the one line whose question mark is drawn wrong. Only that glyph gets a span; everything is text.
  const setText = (node, t, mark) => {
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
      b.type = 'button'; b.className = 'choice'; b.textContent = c.label;
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
      s.textContent = got ? ENDINGS[id].title : '—';
      if (!got) s.setAttribute('aria-label', 'not found');
      box.appendChild(s);
    });
  };
  let againTimer = null, cardSize = null;
  const cardScale = () => {
    if (!cardSize) return;
    const sc = cardFishScale(cardSize.w, cardSize.h, el.stage.clientWidth, el.card.clientWidth);
    el.cardFish.style.width = cardSize.w * sc + 'px'; el.cardFish.style.height = cardSize.h * sc + 'px';
  };
  const circle = (c, x, y, r) => { c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', r.toFixed(1)); };
  // The bubble's place and outline from the live stage size: W is fixed, so x turns into a constant
  // percentage; H is not, so the bottom edge is recomputed from it.
  const thinkLayout = side => {
    const a = thinkAnchor(side), u = el.stage.clientWidth / 100;
    const y = el.think.classList.contains('ask') && a.yAsk ? a.yAsk : a.y;
    el.think.style.left = (a.left / W * 100).toFixed(2) + '%';
    el.think.style.bottom = ((H - y) / H * 100).toFixed(2) + '%';
    const w = el.think.clientWidth, h = el.think.clientHeight, tx = (a.tail - a.left) / W * 100 * u;
    el.thinkPath.setAttribute('d', cloudPath(w, h, u));
    circle(el.thinkTail1, tx, h + 1.7 * u, 1.3 * u);
    circle(el.thinkTail2, tx + a.dir * 2.8 * u, h + 5.6 * u, 0.75 * u);
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
    prompt(t) { el.prompt.textContent = t || ''; el.prompt.classList.toggle('on', !!t); el.prompt.classList.toggle('urgent', t === 'Tap now'); },
    caption(t, dur, style) {
      el.caption.textContent = t; el.caption.className = 'shade on' + (style ? ' ' + style : '');
      clearTimeout(capTimer);
      capTimer = setTimeout(() => el.caption.classList.remove('on'), (dur || 2.5) * 1000);
    },
    count(n) { el.count.textContent = n > 0 ? (n === 1 ? '1 fish' : n + ' fish') : ''; },
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
      el.cardMeta.textContent = f.weight.toFixed(2) + ' kg';
      el.cardDesc.textContent = f.desc;
      el.cardVoice.textContent = f.voice || '';
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
      const n = found ? found.length : 0;
      el.found.textContent = n ? 'Endings found: ' + n + ' of ' + ENDING_COUNT : '';
      endingList(el.foundList, n ? found : null);
    },
    ending(e, found) {
      el.endTitle.textContent = e.title; el.endText.textContent = e.text; el.endAsked.textContent = e.asked || '';
      el.endFound.textContent = 'Endings found: ' + found.length + ' of ' + ENDING_COUNT;
      endingList(el.endList, found);
      el.ending.classList.add('on');
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
function boot() {
  try { REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (err) { REDUCED_MOTION = false; }
  UI = makeUI();
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
    document.getElementById('prompt').style.bottom = ((34 / H) * 100).toFixed(2) + '%';
    UI.dlgCap();
    UI.thinkRelayout();
    UI.fitChoices();
    UI.cardRelayout();
  }
  window.addEventListener('resize', resize);
  resize();
  resetAll();
  UI.fade(0, 1.6);

  stage.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('button')) return;
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
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
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
    UI.el.mute.textContent = SFX.muted ? 'Unmute' : 'Mute'; // the label is the action
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
    oceanCast, oceanTold, playCine, CINE_OCEAN,
    setCloudT(v) { cloudT = v; },
  };
}
})();

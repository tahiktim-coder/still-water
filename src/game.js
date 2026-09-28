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
  day: ['#e2483a', '#5c3a08', '#a86f12', '#e2aa2a', '#ffe27c', '#ffd27a', '#1a0c02', '#000000', '#ffffff', '#ff3322', '#eee4d2', '#a89a86', '#7d1a12'].map(hexc),
  night: ['#e0503f', '#3e2a0a', '#7c5614', '#c2902c', '#f2d47c', '#ffc766', '#1a0c02', '#000000', '#e8eeff', '#ff3322', '#c9c6d2', '#7c7a8c', '#7d1a12'].map(hexc),
  blood: ['#ffe4cc', '#1e0203', '#5e0808', '#a8140e', '#ff4a22', '#ff3b1f', '#ff2a14', '#000000', '#ffc6a8', '#ff3322', '#f4c9ab', '#a8584a', '#7d1a12'].map(hexc),
};
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
const STARS = [];
function genStars() {
  const rng = mulberry32(99);
  for (let k = 0; k < 500 && STARS.length < 70; k++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * 160);
    const i = y * W + x;
    if (MOUNT[i] !== 255 || cloudIdx(x, y) !== 255) continue;
    STARS.push({ i, x, y, p: rng() * 6.283, b: rng(), s: 1 + rng() * 2 });
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
const BIRD = [sprite(['1...1', '.1.1.', '..1..']), sprite(['.....', '11.11', '..1..'])];
const EXCL = sprite(['.1.', '1b1', '1b1', '1b1', '.1.', '1b1', '.1.']);
const ICON = sprite(['.bbb.b', 'bbbbbb', '.bbb.b']);
const CABIN = sprite([
  '....00....',
  '...0000.0.',
  '..00000000',
  '.000000000',
  '0000000000',
  '.00000000.',
  '.0LL00000.',
  '.0LL00000.',
  '.00000000.',
]);
const GOLDPILE = sprite(['...y.w..', '..yygyy.', '.gyygyyg', 'dgggdggd']);
const FARBOAT = sprite(['....0', '00000']); // the far boat on the title, at the horizon: a hull and a curled prow
const FAR_X = 206; // the horizon is only open in the centre, so it sits on the lit foot of the right mountain, clear of the prow curl and of the screen edge
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
      if (o.stripes && v < 0.62 && x > L * 0.28 && x < L * 0.86 && x % o.stripes === 0) c = P.o;
      if (o.spots && v < 0.6 && hash2(x, y, o.seed || 3) > 0.84) c = o.spotC !== undefined ? o.spotC : P.l;
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
  return { w, h, data: out, cy: Math.round(cy), bar };
}
const FPAL = { o: 3, b: 6, m: 8, l: 10, s: 11, f: 5, e: 1 };
const GPAL = { o: 13, b: 14, m: 15, l: 16, s: 16, f: 14, e: 18 };
let BOAT, GOLD, GOLD_OPEN;
function buildSprites() {
  BOAT = makeBoat();
  GOLD = makeFish({ len: 23, ht: 10, tail: 8, dorsalH: 4, crown: true, fork: true, barbel: true, pal: GPAL });
  GOLD_OPEN = { w: GOLD.w, h: GOLD.h, data: GOLD.data.slice(), cy: GOLD.cy, bar: GOLD.bar };
  const mi = GOLD.cy * GOLD.w + GOLD.bar;
  GOLD_OPEN.data[mi] = 255;
  GOLD_OPEN.data[mi + 1] = 13;
}

const SPECIES = [
  { id: 'perch', names: ['Glass perch', 'Glass perch', 'Eyeless perch'], len: 12, ht: 7, tail: 4, dorsalH: 2, stripes: 3, fork: true, wt: [0.2, 0.6], d: 0.9 },
  { id: 'char', names: ['Mirror char', 'Mirror char', 'Hollow char'], len: 15, ht: 6, tail: 4, dorsalH: 1, spots: true, fork: true, wt: [0.5, 1.4], d: 1.0 },
  { id: 'smelt', names: ['Blue smelt', 'Grinning smelt', 'Grinning smelt'], len: 9, ht: 4, tail: 3, dorsalH: 1, fork: true, wt: [0.05, 0.2], d: 0.7 },
  { id: 'trout', names: ['Fjord trout', 'Fjord trout', 'Drowned trout'], len: 17, ht: 7, tail: 5, dorsalH: 1, spots: true, spotC: 3, fork: false, wt: [0.8, 2.2], d: 1.25 },
  { id: 'eel', names: ['Needle eel', 'Knot eel', 'Endless eel'], len: 24, ht: 3, tail: 2, eel: true, wt: [0.3, 0.9], d: 1.1 },
  { id: 'grayling', names: ['Pale grayling', 'Pale grayling', 'Ash grayling'], len: 14, ht: 6, tail: 4, dorsalH: 4, fork: true, wt: [0.3, 0.8], d: 1.0 },
];
// One card line per species per act (story bible, section 5).
const DESC = {
  perch: ['You can see its heart beating through it.', 'There is an old hook inside it. Not yours.', 'No eyes. It still turns toward the lantern.'],
  char: ['Its scales show you the sky. You check. It matches.', 'Its scales show you a red sky.', 'Its scales show your boat from underneath.'],
  smelt: ['Small and cold. Not afraid of you at all.', 'It has teeth. Smelt don\u2019t have teeth.', 'Its teeth point inward.'],
  trout: ['It fought like it had somewhere to be.', 'It keeps looking at the sun.', 'It drowned. It is a fish. It drowned.'],
  eel: ['Longer than it has any right to be.', 'It knotted itself so you couldn\u2019t keep it.', 'It is still coming out of the water.'],
  grayling: ['It smells of snow.', 'It smells of smoke.', 'It smells like you.'],
};
// The act 2 card voice, only if the player asked to hear the fish, keyed to the first wish.
const VOICE = {
  company: 'I wished for company too. Now I have plenty.',
  fish: 'I wished for more fish too. Here I am.',
  home: 'I wished for a home too. This is it.',
  nothing: 'I wanted nothing too. It waited.',
};
const ENDING_COUNT = 3; // raised as later phases add Stay, Deep and Swallowed
const ENDINGS = {
  home: { title: 'Home', text: 'The lake is quiet again. The fish are hungry. Somewhere, a new sun is rising for the next fisherman.' },
  dark: { title: 'Dark', text: 'You sit with the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.' },
  cut: { title: 'Still water', text: 'You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.' },
};
const SILENT_TEXT = 'You wanted nothing. It had nothing to show you. You row until the water is only water. Some evenings, the sunset looks back.';
// One variant sentence per ending card (bible, section 4 Ending cards): kept, else (Still water only) the
// one-refusal line, else the most relevant wish in the order given per ending, else refused twice.
const END_VARIANTS = {
  home: {
    kept: 'The golden fish slips out of the boat as you go in.',
    refused2: 'You asked for nothing, and then for home. Home was the only thing it had.',
    order: ['home', 'company', 'gold', 'fish', 'hear', 'forever'],
    lines: {
      home: 'The light on the shore goes out. Nobody was inside.',
      company: 'The seat behind you is empty now. It was your turn.',
      gold: 'The gold goes down first. It has done this before.',
      fish: 'The lake is full. It was always full.',
      hear: 'You know the words already. You will say them.',
      forever: 'The day does not end. You aren\u2019t in it.',
    },
  },
  dark: {
    kept: 'The golden fish dries in the bottom of the boat. It stops asking before you do.',
    refused2: 'You asked for nothing twice. This is what it looks like.',
    order: ['hear', 'fish', 'forever', 'company', 'gold', 'home'],
    lines: {
      hear: 'The lake keeps talking. You stop answering.',
      fish: 'Something is always biting. You let them.',
      forever: 'The day never ends. It never begins either.',
      company: 'Someone breathes behind you all night. You do not turn around.',
      gold: 'The boat rides low. You do not bail.',
      home: 'The light on the shore stays on. Nobody comes down.',
    },
  },
  cut: {
    kept: 'You lifted it over the side. It let you.',
    refused2: 'Twice you said nothing. The knife said it a third time.',
    refused1: 'You asked once for nothing. It kept count.',
    order: ['company', 'home', 'fish', 'gold', 'forever', 'hear'],
    lines: {
      company: 'There is someone in the stern. You do not ask. You row.',
      home: 'The cabin is dark. You do not check whether anyone left.',
      fish: 'The fish behind you all face one way. You do not look.',
      gold: 'The gold is on the bottom. Your hands stayed on the oars.',
      forever: 'Dawn comes anyway. You had forgotten it could.',
      hear: 'You can still hear them from the shore. You stop listening.',
    },
  },
};
// The wish button labels, read back on the ending card.
const WISH_LABELS = {
  company: 'Someone to sit with me', fish: 'Take me where the fish are', home: 'A home on the shore',
  forever: 'Make this day last forever', hear: 'Let me hear the fish', gold: 'Gold. A boat full of it',
};
// The recount at wish 3: the player's own labels shifted to the second person, one clause per granted wish, in order.
const RECOUNT = {
  company: 'someone to sit with you', fish: 'where the fish are', home: 'a home on the shore',
  forever: 'a day that lasts forever', hear: 'to hear the fish', gold: 'a boat full of gold',
};

// ---------------------------------------------------------------- state
const WS = {};
function resetWS() {
  Object.assign(WS, {
    mood: 0, dim: 0, sunX: SUNX, sunY: SUN0Y, sunR: 8, sunKind: 0, sunGlow: 1, horizGlow: 1, lid: 0,
    pupil: 0, pupilDx: 0, stalk: 0, stalkCut: 0, troubled: 0, starA: 0, lantern: 0, lanternFlicker: 1,
    jaw: 0, companion: 0, companionTurn: 0, cabin: 0, fishShadows: 0, gold: 0, boatSink: 0, boatX: 0, ash: 0,
    lineCut: false, goldFish: null,
    // story bible, section 3. Only frozen is read in this phase; the rest are drawn by later phases.
    goldKept: 0, boatSunk: 0, frozen: 0, far: 0, eyes: 0, farBoat: 0,
  });
}
const G = {
  phase: 'title', t: 0, pt: 0, holding: false, bob: null, cast: null, wait: null, reel: null, land: null,
  rodA: REST_A, rodBend: 0, bobDip: 0, biteWin: 1, tip: { x: 110, y: 205 }, hand: { x: 136, y: 227 },
  lanternPos: { x: 124, y: 218 }, tutorial: 0, ringT: 0, hb: 0,
  capUntil: 0, saidUntil: 0, saidPending: [],
  arrived: true, open: null, eyesDone: false, act2Casts: 0, frozeT: 0,
};
// wishes holds granted wishes only, in order. kept, firstAsk, refused, answered, ocean, said and usedRepl follow
// the bible, section 3: said counts the fisherman's lines that have shown, usedRepl the card replacements fired.
// casts counts casts for the opening captions; shown1 lists the species whose act 1 card was shown, for the act 2 pick.
const freshStory = () => ({
  act: 0, catches: 0, actCatches: 0, wishes: [], heard: false, goldenNext: false, lastSpecies: null,
  kept: false, firstAsk: null, refused: 0, answered: null, ocean: 'none', said: 0, usedRepl: [], casts: 0, shown1: [],
});
const STORY = freshStory();
const has = w => STORY.wishes.indexOf(w) >= 0;
// Across runs (bible, section 7): completed runs and the last ending, from storage plus this session.
const RUN = { count: 0, last: null };
const isLaterRun = () => RUN.count > 0;

// ---------------------------------------------------------------- UI (DOM in browser, stub elsewhere)
let UI = null;
function stubUI() {
  const log = [];
  const f = name => (...a) => log.push([name, ...a]);
  return {
    log, choices: null,
    prompt: f('prompt'), caption: f('caption'), count: f('count'),
    card: f('card'), cardHide: f('cardHide'),
    dlgShow: f('dlgShow'), dlgText() {}, dlgChoices(list) { this.choices = list; },
    dlgMore() {}, dlgHide: f('dlgHide'),
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
function ring(x, y, big) { RINGS.push({ x, y, r: 1, v: big ? 26 : 12, life: 0, max: big ? 2.6 : 1.6 }); }
function updRings(dt) {
  if (WS.frozen) return; // frozen, a ring in flight holds, like the birds (bible, 8b)
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
  for (const s of SHAD) {
    s.a += (hash2(s.x | 0, s.y | 0, (G.t * 2) | 0) - 0.5) * 1.2 * dt;
    s.a += Math.sin(shadowHeading(s) - s.a) * 2 * dt;
    if (Math.sin(s.a) > 0) s.a = -s.a; // never past horizontal: every shadow keeps moving toward the horizon
    s.x += Math.cos(s.a) * s.sp * dt;
    s.y += Math.sin(s.a) * s.sp * 0.3 * dt;
    const cx = Math.cos(s.a);
    if (Math.abs(cx) > 0.15) s.dir = cx >= 0 ? 1 : -1;
    if (s.x < -10) s.x = W + 8;
    if (s.x > W + 10) s.x = -8;
    if (s.y < SHAD_TOP) { s.y = H - 22 - Math.random() * 12; s.x = Math.random() * W; s.a = shadowHeading(s); }
    if (s.y > H - 20) s.y = H - 20;
  }
}
function spawnBirds() {
  const fromL = Math.random() < 0.5, y = 40 + Math.random() * 80, n = 2 + ((Math.random() * 3) | 0);
  for (let k = 0; k < n; k++) BIRDS.push({ x: fromL ? -8 - k * 9 : W + 8 + k * 9, y: y + (Math.random() - 0.5) * 12 + k * 3, vx: (fromL ? 1 : -1) * (14 + Math.random() * 4), ph: Math.random() * 3 });
}
// Birds only while it is day, the shore is near and the day is not frozen (bible, 8c). Frozen, they hang.
function updBirds(dt) {
  if (WS.frozen) return;
  birdTimer -= dt;
  if (birdTimer <= 0 && WS.mood < 0.5 && WS.far < 0.5) { birdTimer = 10 + Math.random() * 14; spawnBirds(); }
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
    if (WS.mood < 1.2 && !WS.frozen && WS.far === 0 && G.phase !== 'cine') { // bible, 8c
      const x = 14 + Math.random() * (W - 28), y = HY + 12 + Math.random() * (H - HY - 60);
      splash(x, y, 4); ring(x, y);
    }
  }
}

// ---------------------------------------------------------------- rendering
function renderTop(t) {
  cloudTick();
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
      const m = MOUNT[i];
      if (m !== 255) { TOP[i] = m; continue; }
      const dx = x - sx, d2 = dx * dx + dy2;
      const g = glow * (2.1 * Math.exp(-d2 * i1) + 1.2 * Math.exp(-d2 * i2)) + hb * Math.exp(-(dx * dx) / 4500);
      let bx = x + off0; if (bx >= CW) bx -= CW;
      let cp = row0 + bx, c = idx0[cp], cv = vis0;
      if (c === 255) { bx = x + off1; if (bx >= CW) bx -= CW; cp = row1 + bx; c = idx1[cp]; cv = vis1; }
      if (c !== 255) {
        const k = KCOR[i], v = cv[cp];
        if (k > v) { // in the corridor a cloud pixel shows only where enough of it is left, and the cut gets a rim
          if (k < 255 && k < v * 1.2333) c = litY < 3.2 * Math.abs(x - SUNX) ? 11 : c > 0 ? c - 1 : 0;
          TOP[i] = ci(dith(c + g * 0.55, x, y)); continue;
        }
      }
      if (sr > 0 && d2 <= srr && Math.abs(dy) <= lidH) { TOP[i] = sunPix(dx, dy, d2); continue; }
      TOP[i] = ci(dith(base + g, x, y));
    }
  }
}

function sunPix(dx, dy, d2) {
  const r = WS.sunR;
  if (WS.sunKind === 0) return d2 > (r - 1) * (r - 1) ? 10 : 11;
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
      if (s.b * 0.7 + (1 - tw) * 0.3 < WS.starA && TOP[s.i] < 8 && cloudIdx(s.x, s.y) === 255) TOP[s.i] = 20;
    }
  }
  const bt = WS.frozen ? G.frozeT : t; // frozen, the wings hold too
  for (const b of BIRDS) stampTop(BIRD[((bt * 5 + b.ph) | 0) & 1], b.x | 0, b.y | 0);
  if (WS.cabin > 0) stampTop(CABIN, CABIN_X, CABIN_Y, WS.cabin);
  if (WS.farBoat > 0 && G.phase === 'title') stampTop(FARBOAT, FAR_X, HY - FARBOAT.h); // it reflects for free
  if (WS.stalk > 0) {
    const yEnd = WS.sunY - WS.sunR * 0.9;
    const y1 = yEnd * WS.stalk * (1 - WS.stalkCut);
    for (let y = 0; y < Math.min(HY, y1); y++) {
      const x = Math.round(WS.sunX + Math.sin(y * 0.04 + t * 0.9) * 0.8 * (y / Math.max(1, yEnd)));
      if (x >= 0 && x < W && MOUNT[y * W + x] === 255) TOP[y * W + x] = 1;
    }
  }
}
// The sun's reflection is one pixel larger than the disc (bible, 8c). The white sun is redrawn in the
// water with the sunPix rule at radius sr + 1 (fill and rim both a pixel further out); the red sun,
// whose pupil must stay as mirrored, only gets a rim in its edge colour outside the disc.
function sunRing(y, row, srow, ixr, dyS, darkF, haze) {
  const sx = WS.sunX, sr = WS.sunR, r0 = (sr + 0.4) * (sr + 0.4), r1 = (sr + 1.4) * (sr + 1.4);
  const white = WS.sunKind === 0, fill2 = sr * sr, dy2 = dyS * dyS;
  const x0 = Math.max(0, Math.floor(sx - sr - 2 - ixr)), x1 = Math.min(W - 1, Math.ceil(sx + sr + 2 - ixr));
  for (let x = x0; x <= x1; x++) {
    const sxp = clamp(x + ixr, 0, W - 1), dx = sxp - sx, d2 = dx * dx + dy2;
    if (d2 > r1 || (!white && d2 <= r0)) continue;
    const si = srow + sxp;
    if (MOUNT[si] !== 255 || TOP[si] >= 12) continue;
    const v = white ? (d2 > fill2 ? 10 : 11) : 8;
    FRAME[row + x] = ci(dith(v - darkF + haze, x, y));
  }
}
function computeWater(t) {
  FRAME.set(TOP, 0);
  const tr = WS.troubled, span = H - HY;
  const sy = WS.sunY, sr = WS.sunR, lidH = sr * (1 - WS.lid);
  for (let y = HY; y < H; y++) {
    const k = (y - HY) / span;
    const amp = 0.35 + k * 1.5 + tr * (0.5 + k * 2.4);
    RIPX[y] = Math.round(Math.sin(y * 0.55 + t * 1.6 + Math.sin(y * 0.11 + t * 0.7) * 2.2) * amp);
    const oy = Math.round(Math.sin(y * 0.9 + t * 2.1) * (0.3 + tr * 0.9));
    let src = 2 * HY - 1 - y + oy;
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
    if (sr > 0 && Math.abs(dyS) <= lidH + 1) sunRing(y, row, srow, ixr, dyS, darkF, haze);
  }
  const hr = HY * W;
  for (let x = 0; x < W; x++) { const v = FRAME[hr + x]; if (v < 12) FRAME[hr + x] = ci(v + 2); }
  const gl = WS.sunGlow;
  for (let y = HY + 1; y < H; y++) {
    const k = (y - HY) / span;
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
    const add = fade > 0.5 ? 2 : 1;
    const rx = r.r, ry = r.r * 0.32;
    const n = Math.max(12, Math.ceil(rx * 5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.round(r.x + Math.cos(a) * rx), y = Math.round(r.y + Math.sin(a) * ry);
      if (y < HY || y >= H || x < 0 || x >= W) continue;
      if (hash2(k, (r.life * 10) | 0, 5) > fade + 0.3) continue;
      const i = y * W + x, u = FRAME[i];
      if (u < 12) FRAME[i] = ci(u + add);
    }
  }
}
function drawShadows() {
  if (!WS.fishShadows) return;
  for (const s of SHAD) {
    const dir = s.dir;
    for (let k = -5; k <= 4; k++) {
      const tail = k * dir < -3;
      const hgt = tail ? 0 : Math.round(1.3 * Math.sqrt(Math.max(0, 1 - (k / 4.6) * (k / 4.6))));
      for (let j = -hgt; j <= hgt; j++) {
        const x = Math.round(s.x + k), y = Math.round(s.y + j);
        if (x < 0 || x >= W || y < HY || y >= H) continue;
        const i = y * W + x, u = FRAME[i];
        if (u < 12) FRAME[i] = Math.max(0, u - 2);
      }
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
function plotR(x, y, v, wl) {
  x = Math.round(x); y = Math.round(y);
  if (y >= wl) return;
  plot(x, y, v);
  const yr = 2 * wl - 1 - y;
  if (yr >= HY && yr < H) plot(x + RIPX[yr], yr, refl(v));
}
function stampR(s, x0, y0, wl, alpha, flip) {
  for (let j = 0; j < s.h; j++) {
    const y = y0 + j;
    if (y >= wl) break;
    for (let i = 0; i < s.w; i++) {
      const v = s.data[j * s.w + (flip ? s.w - 1 - i : i)];
      if (v === 255) continue;
      if (alpha !== undefined && alpha < 1 && hash2(i, j, 7) > alpha) continue;
      plotR(x0 + i, y, v, wl);
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
function drawBoatGroup(t) {
  const bob = Math.round(Math.sin(t * 1.3) * WS.troubled * 1.2);
  const sink = Math.round(WS.boatSink);
  const bx = Math.round(BOAT_X + WS.boatX);
  const dy = sink + bob;
  stampR(BOAT, bx, WL - BOAT.wl + dy, WL);
  const lpx = bx + 9, ltop = WL - 27 + dy;
  for (let y = ltop; y < WL - 8 + dy; y++) plotR(lpx, y, 0, WL);
  plotR(lpx - 1, ltop, 0, WL); plotR(lpx - 2, ltop, 0, WL); plotR(lpx - 2, ltop + 1, 0, WL);
  const lx = lpx - 3, ly = ltop + 2;
  const lit = WS.lantern > 0.3 && WS.lanternFlicker > 0.5;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
    const edge = i === 0 || i === 2 || j === 0 || j === 3;
    plotR(lx + i, ly + j, edge ? 0 : lit ? 17 : 2, WL);
  }
  G.lanternPos = { x: lx + 1, y: ly + 1.5 };
  if (WS.gold > 0) stampR(GOLDPILE, bx + 32, WL - 10 + dy, WL, WS.gold);
  if (WS.companion > 0) stampR(WS.companionTurn > 0.5 ? COMP_TURN : COMP, bx + COMP_DX, WL + COMP_DY + dy, WL, WS.companion);
  const fx = bx + 18, fy = WL - 24 + dy;
  stampR(FISHER, fx, fy, WL);
  G.hand = { x: fx, y: fy + 9 };
  drawRod(G.hand.x, G.hand.y, WL);
}
function drawBobber() {
  const b = G.bob;
  if (!b) return;
  const x = Math.round(b.x), y = Math.round(b.y);
  const gold = STORY.goldenNext && (G.phase === 'waiting' || G.phase === 'bite' || G.phase === 'casting');
  const col = gold ? 15 : 12;
  if (b.fly) { plot(x, y - 1, 11); plot(x, y, col); plot(x + 1, y, col); return; }
  if (G.phase === 'bite' || b.taut) return;
  const yy = y + (G.bobDip > 0 ? 1 : 0), wl = yy + 1;
  plotR(x, yy - 2, 11, wl); plotR(x, yy - 1, col, wl); plotR(x + 1, yy - 1, col, wl); plotR(x, yy, col, wl); plotR(x + 1, yy, col, wl);
}
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
function drawGoldFish(t) {
  const g = WS.goldFish;
  if (!g || g.a <= 0.01) return;
  const L = DLG.cur;
  const talking = L && L.text && DLG.n < L.text.length && /fish/i.test(L.who || '') && ((t * 10) | 0) & 1;
  const s = talking ? GOLD_OPEN : GOLD;
  const x0 = Math.round(g.x), y0 = Math.round(g.y + Math.sin(t * 2.1) * 1.5);
  stampR(s, x0, y0, g.surf, g.a);
  if (g.a > 0.6 && Math.random() < 0.25) sparkle(x0 + Math.random() * s.w, y0 + Math.random() * s.h);
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
      const ta = hasA && MOUNT[ya * W + x] !== 255;
      const tb = hasB && msrc >= 0 && msrc < HY && MOUNT[msrc * W + x] !== 255;
      const sp = yb >= 0 && yb < H ? SPR[yb * W + x] : 255;
      if (ta) { v = FRAME[ya * W + x]; tooth = true; }
      else if (sp !== 255) v = sp;
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
function drawFang(cx, hb, len, tip, dir) {
  // dir = 1: hangs from above, tip pointing down. dir = -1: rises from below.
  for (let k = 0; k <= len; k++) {
    const y = Math.round(tip - dir * k);
    if (y < 0 || y >= H) continue;
    const t = k / len;
    const half = hb * Math.pow(t, 0.75);
    const shift = Math.sin(t * Math.PI * 0.5) * hb * 0.35 * dir;
    const x0 = Math.floor(cx + shift - half), x1 = Math.ceil(cx + shift + half);
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= W) continue;
      const dx = x - (cx + shift);
      let v;
      if (Math.abs(dx) > half - 1 || k === 0) v = 1;
      else if (dx < -half * 0.35) v = 22;
      else if (dx < half * 0.2) v = (k > 3 && Math.abs(dx + half * 0.1) < 0.6) ? 11 : 22;
      else v = 23;
      IDX[y * W + x] = v;
    }
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
function drawUIPix(t) {
  if (G.phase === 'bite' && G.bob && ((t * 8) | 0) & 1) stampIdx(EXCL, Math.round(G.bob.x) - 1, Math.round(G.bob.y) - 13);
  if (G.phase === 'reeling' && G.reel) {
    const r = G.reel, bw = 116, bx = (W - bw) >> 1, by = H - 26;
    rectI(bx - 2, by - 2, bw + 4, 7, 0);
    rectI(bx - 1, by - 1, bw + 2, 5, 2);
    const danger = r.T > 0.78;
    const col = danger ? (((t * 10) | 0) & 1 ? 12 : 11) : r.T > 0.55 ? 9 : 7;
    rectI(bx, by, Math.round(clamp(r.T, 0, 1) * bw), 3, col);
    rectI(bx + Math.round(bw * 0.8), by - 1, 1, 5, 11);
    stampIdx(ICON, bx + Math.round(r.p * (bw - ICON.w)), by - 7);
  }
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
  if (WS.lantern > 0.01 && WS.lanternFlicker > 0.05) {
    const fl = WS.lanternFlicker * WS.lantern * (0.88 + 0.12 * Math.sin(t * 13) * Math.sin(t * 7.3));
    const lx = G.lanternPos.x, ly = G.lanternPos.y;
    glowTint(lx, ly - s, 18, 17, 0.8 * fl);
    glowTint(lx, 2 * WL - 1 - ly - s, 12, 17, 0.45 * fl);
  }
  if (WS.cabin > 0.4) {
    const wx = CABIN_X + 2.5, wy = CABIN_Y + 7;
    glowTint(wx, wy - s, 7, 17, 0.55 * WS.cabin);
    glowTint(wx, 2 * HY - 1 - wy - s, 5, 17, 0.35 * WS.cabin);
  }
}
function render(t) {
  buildPalette(WS.mood, WS.dim);
  renderTop(t);
  topExtras(t);
  computeWater(t);
  drawRings();
  drawShadows();
  drawEyes();
  SPR.fill(255);
  drawBoatGroup(t);
  drawBobber();
  drawGoldFish(t);
  drawLanding();
  drawParts(t);
  drawLine();
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
      this.out.gain.value = this.muted ? 0 : 0.6;
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
  crunch() { this.noise(0.9, 0.45, 'lowpass', 900, 60, 1.2); this.tone(90, 1, 'sawtooth', 0.25, 28); },
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
};

// ---------------------------------------------------------------- dialogue
// A line is {who, text, style, choices, mark}, {act: fn} or {pause: seconds}. mark asks the UI for the
// wrong question mark (the companion's question). A choice whose pick() does not start a new dlgRun
// lets the current list continue, so a choice can sit in the middle of a scene.
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
function dlgFull() {
  const L = DLG.cur;
  DLG.n = L.text.length;
  UI.dlgText(L.text, L.mark);
  if (L.choices) {
    UI.dlgChoices(L.choices.map(c => ({
      label: c.label,
      cb: () => {
        if (DLG.cur !== L) return;
        UI.dlgChoices(null); DLG.cur = null; SFX.select();
        const run = DLG.run;
        c.pick();
        if (DLG.run === run && DLG.active) dlgNext();
      },
    })));
  } else UI.dlgMore(true);
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
const sunsetCine = refused => ({
  dur: 10,
  init(s) { s.y0 = WS.sunY; s.tr0 = WS.troubled; },
  update(t, dt, at, s) {
    at('snd', 0, () => SFX.swell());
    at('cap', 0.4, () => cap(refused ? 'The sun sets the way suns do.' : 'The sun slips into the lake like a coin into a well.', 4.8));
    const k = clamp(t / 7.5, 0, 1);
    WS.sunY = lerp(s.y0, HY + 14, E.io(k));
    WS.mood = clamp((t - 1) / 7, 0, 1);
    WS.sunGlow = Math.max(WS.frozen ? 0.4 : 0, lerp(1, 0.12, E.io(clamp((t - 3) / 5, 0, 1))));
    WS.horizGlow = lerp(1, 0.3, clamp((t - 4) / 5, 0, 1));
    WS.starA = WS.frozen ? 0 : clamp((t - 5) / 4, 0, 1);
    WS.troubled = lerp(s.tr0, 0.35, k);
    at('lan', 7.8, () => { tween(WS, 'lantern', 1, 0.7); cap('You light the lantern.', 2.6); SFX.match(); });
  },
});
// The red sun. The companion turns at the pupil beat, before anyone speaks. The pupil slides toward
// the boat only if the player ever asked for something. If the fish were heard, the lake whispers.
const CINE_RED = {
  dur: 15.5,
  init(s) {
    WS.sunKind = 1; WS.sunR = 16; WS.sunY = HY + 24; WS.sunGlow = 0; WS.pupil = 0; WS.pupilDx = 0; WS.stalk = 0;
    s.tr0 = WS.troubled; s.hg0 = WS.horizGlow; s.asked = STORY.wishes.length > 0;
  },
  update(t, dt, at, s) {
    at('drone', 0.2, () => SFX.drone(true));
    at('c1', 0.6, () => cap('Something rises where the sun went down.', 4));
    const k = clamp((t - 1) / 8.5, 0, 1);
    WS.sunY = lerp(HY + 24, 178, E.out(k));
    WS.mood = 1 + clamp((t - 1.5) / 7.5, 0, 1);
    WS.sunGlow = lerp(0, 1.25, clamp((t - 1) / 6, 0, 1));
    WS.horizGlow = lerp(s.hg0, 1.3, clamp((t - 1) / 6, 0, 1));
    WS.starA = WS.frozen ? 0 : 1 - clamp((t - 2) / 4, 0, 1);
    WS.troubled = lerp(s.tr0, 0.55, clamp(t / 9, 0, 1));
    WS.ash = clamp((t - 6) / 4, 0, 1);
    WS.stalk = clamp((t - 9.2) / 2.3, 0, 1);
    at('lake', 9.2, () => { if (STORY.heard) lakeWhisper('i could watch that sun forever. i could watch that sun forever.'); });
    at('lakeOff', 12.4, () => { if (STORY.heard) UI.dlgHide(); });
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
  init(s) { s.g0 = WS.sunGlow; s.h0 = WS.horizGlow; },
  update(t, dt, at, s) {
    WS.lid = clamp(t / 1.6, 0, 1);
    WS.sunGlow = lerp(s.g0, 0, clamp(t / 3, 0, 1));
    WS.horizGlow = lerp(s.h0, 0, clamp(t / 3, 0, 1));
    WS.dim = 11 * E.io(clamp((t - 1) / 4.5, 0, 1));
    WS.ash = 1 - clamp(t / 3, 0, 1);
    at('drone', 2, () => SFX.drone(false));
    at('cap', 2, () => { if (!STORY.kept) cap('Something gold circles the boat. It has time.', 3); }); // the dim is still under half
    if (t > 6 && t < 8) WS.lanternFlicker = Math.random() < 0.5 ? 1 : 0.1;
    else if (t >= 8) WS.lanternFlicker = 0;
    WS.eyes = t > 7.5 && t < 7.8 ? 1 : 0; // one look from the water before the lantern dies
    if (WS.eyes) WS.lanternFlicker = 0.1;
    at('out', 8, () => SFX.hiss(0.6));
    at('fade', 8.3, () => UI.fade(1, 1));
  },
};
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
const cutCine = silent => ({
  dur: 17.5,
  init(s) { s.y0 = WS.sunY; s.tr0 = WS.troubled; },
  update(t, dt, at, s) {
    at('cut', 0.15, () => {
      if (silent) { if (G.bob) G.bob.taut = false; SFX.splash(); }
      else { WS.lineCut = true; G.bob = null; SFX.snap(); if (WS.gold > 0) tween(WS, 'gold', 0, 0.8); }
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
      if (WS.cabin > 0) tween(WS, 'cabin', 0, 1.5);
    });
    if (t >= 6) {
      const kd = clamp((t - 6) / 6.5, 0, 1);
      WS.sunY = lerp(HY + 14, SUN0Y, E.out(kd));
      WS.sunGlow = kd;
      WS.horizGlow = lerp(0.15, 1, kd);
    }
    if (t > 9) WS.lantern = 1 - clamp((t - 9) / 2, 0, 1);
    WS.boatX = t > 11 ? E.io(clamp((t - 11) / 6.5, 0, 1)) * 120 : 0;
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
// The lake's one line (bible, section 4): a labelled whisper in the dialogue panel, shown from inside the red
// cinematic. DLG is inactive there, so the text appears whole and the cinematic hides the panel itself.
function lakeWhisper(text) { UI.dlgShow('The lake', 'whisper'); UI.dlgText(text); }
function goldenScene() {
  G.bob = null;
  WS.goldFish = { x: 26, y: 240, a: 0, surf: 263 };
  tween(WS.goldFish, 'a', 1, 0.8);
  splash(42, 262, 10); ring(42, 264); ring(42, 264, true);
  SFX.chime();
  if (STORY.act === 0) wish1(); else wish2();
}
function goldenDive() {
  const g = WS.goldFish;
  if (!g) return;
  splash(g.x + 12, g.surf, 8); ring(g.x + 12, g.surf + 1);
  SFX.splash();
  tween(g, 'a', 0, 0.5, E.io, () => { if (WS.goldFish === g) WS.goldFish = null; });
}
function startAct(act) { STORY.act = act; STORY.actCatches = 0; }

// -- golden scene 1 and wish 1
// The fish's first line changes on a later run (bible, sections 4 and 7).
function greeting1() {
  if (!isLaterRun()) return 'Wait. Don’t gut me, fisherman.';
  return RUN.last === 'home' ? 'Back out already? It doesn’t usually let go.' : 'You again. Or someone wearing you.';
}
function wish1() {
  dlgRun([
    { pause: 3 },
    fish(greeting1()),
    { who: FISHN, text: 'Put me back and I’ll grant you a wish. Three, if you’re patient.', choices: [
      { label: 'Let it go', pick: () => wish1b(false) },
      { label: 'Keep it', pick: () => wish1b(true) },
    ] },
  ]);
}
// Keep it is text and state only for now: the boat fish sprite and the kept flow are a later phase.
function wish1b(kept) {
  STORY.kept = kept;
  const L = kept ? [
    narr('You lift it into the boat. It is heavier than a fish.'),
    fish('Cold hands. He had cold hands too.'),
    fish('Keep me, then. The wish comes anyway.'),
  ] : [fish('Kind. Nobody kind comes out this far alone.')];
  dlgRun(L.concat([
    fish('First time here, you said. Nobody comes here twice.'),
    { who: FISHN, text: 'What do you lack, fisherman?', choices: [
      { label: 'Someone to sit with me', pick: () => grant1('company') },
      { label: 'Take me where the fish are', pick: () => grant1('fish') },
      { label: 'A home on the shore', pick: () => grant1('home') },
      { label: 'Nothing', pick: refuse1 },
    ] },
  ]));
}
const GRANT1 = {
  company: () => [
    { who: FISHN, text: 'Who?', choices: [{ label: 'Doesn’t matter. Someone.', pick() { /* the list continues */ } }] },
    { act: () => { tween(WS, 'companion', 1, 2.2); SFX.chime(); } },
    fish('Someone. Nobody asks who.'),
    fish('If they ask you anything, don’t answer.'),
  ],
  fish: () => [
    fish('Where the fish are. I know a spot. Hold on.'),
    { act: () => { WS.fishShadows = 1; spawnShadows(); SFX.chime(); } }, // the ocean cutscene is a later phase
    { pause: 1.2 },
    fish('Look how they all go the same way.'),
  ],
  home: () => [
    { act: () => { tween(WS, 'cabin', 1, 2.2); SFX.chime(); } },
    fish('A home on the shore. One has just come free.'),
    fish('Every light out here is for someone. That one is for you.'),
  ],
};
// The cost: the sun starts dropping as the first cost line begins. No caption; the drop is the sentence.
function grant1(w) {
  STORY.wishes.push(w); STORY.firstAsk = w;
  dlgRun(GRANT1[w]().concat([
    { act: sunDrop },
    fish('A wish costs a little daylight. You said you could watch that sun forever.'),
    fish('You’ll get to.'),
    { act: goldenDive },
    { pause: 0.8 },
  ]), () => {
    startAct(1);
    setPhase('ready');
  });
}
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
  if (STORY.kept) return 'You cast anyway. Habit.';
  if (STORY.refused === 1) return 'Back again. Still wanting nothing?';
  return 'Back so soon? The lake keeps count.';
}
function wish2() {
  dlgRun([
    { pause: 0.9 },
    fish(greeting2()),
    { who: FISHN, text: 'What do you lack now?', choices: [
      { label: 'Make this day last forever', pick: () => grant2('forever') },
      { label: 'Let me hear the fish', pick: () => grant2('hear') },
      { label: 'Gold. A boat full of it', pick: () => grant2('gold') },
      { label: 'Nothing', pick: refuse2 },
    ] },
  ]);
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
  gold: () => [
    fish('Gold. A boat full of it.'),
    { act: () => { tween(WS, 'gold', 1, 1.5); tween(WS, 'boatSink', 2, 3); SFX.chime(); } }, // the sink cutscene is a later phase
    { pause: 1.6 },
    fish('Sorry. Gold is heavy. You can always come back for it.'),
  ],
};
// Forever: the clouds stop, the birds hang, the fish stop jumping and the sun holds until the sunset
// cinematic, which drives it directly (bible, 8b). Nothing says so.
function freezeDay() { WS.frozen = 1; G.frozeT = G.t; untween(WS, 'sunY'); SFX.chime(); }
function grant2(w) {
  STORY.wishes.push(w);
  dlgRun(GRANT2[w]().concat([
    fish((STORY.refused === 1 ? 'That was my first, too.' : 'That was my second, too.') + ' This one costs the rest of the day.'),
    fish('You’ll miss the sun. I’ll bring you another.'),
    { act: goldenDive },
    { pause: 0.6 },
  ]), () => playCine(sunsetCine(false), afterSunset));
}
function refuse2() {
  STORY.refused++;
  const L = STORY.refused === 2 ? [
    { pause: 1.2 },
    fish('Twice. Nobody asks for nothing twice. What are you?'),
  ] : [fish('Full already? It’s a little late for that.')];
  dlgRun(L.concat([
    fish('Then the sun keeps its own hours. You’ll miss it. I’ll bring you another.'),
    { act: goldenDive },
    { pause: 0.6 },
  ]), () => playCine(sunsetCine(true), afterSunset));
}
function afterSunset() {
  startAct(2);
  if (has('company')) companionQuestion(() => setPhase('ready'));
  else setPhase('ready');
}
// The companion's one question, right after the lantern lights. The mark is drawn wrong.
function companionQuestion(done) {
  const answer = yes => () => {
    STORY.answered = yes;
    dlgRun([narr(yes ? 'He does not turn around.' : 'He goes back to watching the horizon.')], done);
  };
  dlgRun([
    { who: 'Companion', text: 'Will you stay?', style: 'whisper', mark: true, choices: [
      { label: 'Yes', pick: answer(true) },
      { label: 'Say nothing', pick: answer(false) },
    ] },
  ], done);
}

// -- the red sequence and wish 3
// Refused twice replaces the whole set on either path (bible, Red sequence).
function redLines() {
  const L = STORY.refused === 2 ? ['One wish left. You said you could watch that sun forever, then asked for nothing twice.', 'It wants to see why.']
    : STORY.kept ? ['That isn’t me pulling. It never was.', 'One wish left. But first, the sun I promised you.', 'You said you could watch it forever. I passed that on.']
      : ['One wish left. But first, the sun I promised you.', has('forever') ? 'You said forever, then you wished for it. I listened twice.' : 'You said you could watch it forever. I listened.'];
  return L.map(fish);
}
function redSequence() {
  STORY.goldenNext = false;
  G.holding = false;
  if (G.bob) { G.bob.taut = true; tween(G.bob, 'x', SUNX - 3, 2.6); tween(G.bob, 'y', HY + 5, 2.6); }
  if (has('gold')) tween(WS, 'boatSink', WS.boatSink + 2, 2.6);
  SFX.snapLow();
  dlgRun([
    { pause: 1.4 },
    narr('The line goes taut. You did not feel a bite.'),
    // The fish appears above the horizon where the sun set. (Kept: it should speak from the boat, a later phase.)
    { act: () => { WS.goldFish = { x: SUNX - 14, y: HY - 24, a: 0, surf: HY + 1 }; tween(WS.goldFish, 'a', 1, 0.9); SFX.chime(); } },
    { pause: 2 }, // two seconds of silence, no caption
  ].concat(redLines()), () => playCine(CINE_RED, wish3));
}
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1) + '.';
// One line, up to 125 characters: the granted wishes in order, then always the sun.
function recountLine() {
  const parts = STORY.wishes.map(w => RECOUNT[w]);
  return 'Everything you asked for. ' + parts.map(sentence).join(' ') + ' And the sun you wanted. Your words, not mine.';
}
function wish3Choices() {
  const c = [
    { label: 'Let me go home', pick: endHome },
    { label: 'Take the light away', pick: endDark },
    { label: 'Cut the line', pick: endCut },
    // Stay with them (if answered) and Let me get my gold (if gold) are added by later phases, here.
  ];
  if (STORY.refused === 2) c.push({ label: 'Nothing', pick: endSilent });
  return c;
}
// The bible's ordered list: seven lines at most before the buttons, five in a typical run.
function wish3() {
  const nothing = STORY.wishes.length === 0;
  const L = [
    red('There it is. You can watch it forever now.'),
    red('Every sun is bait. I should have said. It didn’t come up.'),
    red(nothing ? 'Nobody rows this far to want nothing. So why are you here.' : recountLine()),
  ];
  if (has('company')) L.push({ who: 'Companion', text: STORY.answered === true ? 'You said you’d stay.' : 'Don’t answer it. Cut the line.', style: 'whisper' });
  if (STORY.kept) L.push(whisperFish('I’m sorry.'));
  L.push(
    red('I sat where you sit. I said what you said. Three times.'),
    { who: FISHN, text: 'I’d like to go home now. What do you lack, fisherman.', style: 'red', choices: wish3Choices() },
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
  const L = [red('As you wish. Without light you won’t see the teeth.')];
  if (STORY.kept) L.push(whisperFish('Don’t leave me in the boat.'));
  dlgRun(L, () => playCine(CINE_DARK, () => showEnding('dark')));
}
function endCut() {
  dlgRun([
    narr('You reach for the knife on the gunwale.'),
    red('No. Nobody cuts the'),
  ], () => playCine(cutCine(false), () => showEnding('cut')));
}
// Silent: nothing, asked a third time. Counts as Still water. Kept: the boat fish dims with no caption.
function endSilent() {
  const L = [narr('You say nothing.'), { pause: 3 }, narr('It waits. Then it splashes its tail once and goes down.')];
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
  saveJSON('stillwater-runs', Math.max(sessionRuns, +loadJSON('stillwater-runs', 0) || 0));
  saveJSON('stillwater-last', id);
}
// The ending card: the base text, one variant sentence, and what was asked for.
// Priority: kept > one refusal (Still water only: a run with one refusal always has one granted wish, so this
// line has to outrank the wish sentence to ever show) > the most relevant wish (order per ending) > refused twice.
function endingVariant(id) {
  const v = END_VARIANTS[id];
  if (STORY.kept) return v.kept;
  if (v.refused1 && STORY.refused === 1) return v.refused1;
  for (const w of v.order) if (has(w)) return v.lines[w];
  if (v.refused2 && STORY.refused === 2) return v.refused2;
  return '';
}
function askedLine() {
  const labels = STORY.wishes.map(w => WISH_LABELS[w]);
  if (!labels.length) return 'You asked for nothing.';
  const head = STORY.refused === 1 ? 'You asked for nothing, once. And for: ' : 'You asked for: ';
  return head + labels.join('. ') + '.';
}
function composeEnding(id, variant) {
  const e = ENDINGS[id];
  const text = variant === 'silent' ? SILENT_TEXT : (e.text + ' ' + endingVariant(id)).trim();
  return { id, variant: variant || '', title: e.title, text, asked: askedLine() };
}
let sessionEndings = [];
function showEnding(id, variant) {
  setPhase('end');
  if (sessionEndings.indexOf(id) < 0) sessionEndings.push(id);
  const saved = saveEnding(id);
  const n = Math.max(saved.length, sessionEndings.length);
  saveRun(id);
  UI.ending(composeEnding(id, variant), n);
}

// ---------------------------------------------------------------- fishing
function promptFor(p) {
  if (p === 'ready') return 'Tap to cast';
  if (p === 'waiting' && G.tutorial < 2) return 'Wait for the float to dip';
  if (p === 'bite') return 'Tap now!';
  if (p === 'reeling') return G.tutorial < 3 ? 'Hold to reel. Let go when it pulls hard.' : 'Hold to reel';
  return '';
}
// The tutorial prompt is hidden while a said caption is on screen, so two texts never share the stage.
function refreshPrompt() { UI.prompt(G.t < G.saidUntil || !G.arrived ? '' : promptFor(G.phase)); }
function setPhase(p) {
  G.phase = p; G.pt = 0;
  refreshPrompt();
}
// Captions, with their end time tracked so the said lines can wait their turn.
function cap(t, dur, style) {
  G.capUntil = G.t + (dur || 2.5);
  UI.caption(t, dur, style);
}
// The fisherman's lines (bible, Opening): quoted, in the said style. A line that finds another caption on
// screen waits in G.saidPending and shows at the next beat (a cast landing or a card closing).
const SAID_DUR = 2.6;
function saidBeat(text) {
  if (text) G.saidPending.push(text);
  if (!G.saidPending.length || G.t < G.capUntil) return;
  STORY.said++;
  cap('“' + G.saidPending.shift() + '”', SAID_DUR, 'said');
  G.saidUntil = G.capUntil;
  refreshPrompt();
}
// A carried-over line also shows as soon as the stage is free during play, so the three lines cannot
// cascade past the third catch (the fish quotes them right after).
const SAID_PHASES = ['ready', 'casting', 'waiting'];
function saidUpdate() {
  if (G.saidUntil && G.t >= G.saidUntil) { G.saidUntil = 0; refreshPrompt(); }
  if (G.saidPending.length && G.t >= G.capUntil && SAID_PHASES.indexOf(G.phase) >= 0) saidBeat(null);
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
  eyesCast();
  setPhase('casting');
  SFX.whoosh();
}
// The eyes (bible, Act 2 play), once per run, between casts: on the first ready phase that lasts six
// seconds without a cast, on the second ordinary act 2 cast if the player is quick, or, once the act 2
// catch has made the next cast golden, half a second after the card closes (under "The water goes very
// still"). A player who casts even faster than that gets them on the golden cast itself; at 2 s they are
// over well before the earliest bite (3.7 s). The lantern dips for a second while they show.
const EYES_WAIT = 6, EYES_WAIT_STILL = 0.5;
function eyesLook() {
  if (G.eyesDone) return;
  G.eyesDone = true;
  WS.lanternFlicker = 0.1;
  tween(WS, 'eyes', 1, 1, E.io, () => { tween(WS, 'eyes', 0, 1, E.io); tween(WS, 'lanternFlicker', 1, 0.6, E.out); });
}
function eyesCast() {
  if (STORY.act !== 2) return;
  if (STORY.goldenNext || ++G.act2Casts === 2) eyesLook(); // the golden cast is the last chance this run
}
function eyesUpdate() {
  if (G.eyesDone || STORY.act !== 2 || G.phase !== 'ready' || G.pt < (STORY.goldenNext ? EYES_WAIT_STILL : EYES_WAIT)) return;
  eyesLook();
}
// In act 2 the golden cast has nothing bite for slightly too long.
const RED_BITE_DELAY = 1.8;
function startWaiting() {
  const golden = STORY.goldenNext;
  const bite = golden ? (1.6 + Math.random() * 0.8) * (STORY.act === 2 ? RED_BITE_DELAY : 1) : 1.6 + Math.random() * 3.2 * (WS.fishShadows ? 0.4 : 1);
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
function pickSpecies() {
  let pool = SPECIES.filter(s => s.id !== STORY.lastSpecies);
  if (STORY.act === 1 && usedRepl('lip')) pool = pool.filter(s => s.id !== 'perch');
  if (STORY.act === 2) { const unseen = pool.filter(s => STORY.shown1.indexOf(s.id) < 0); if (unseen.length) pool = unseen; }
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
    || (a === 2 && has('gold') && once('gold2', 'Heavy for its size. Something in it clinks.'))
    || (a === 2 && STORY.refused === 2 && once('refused2', 'It is looking at you the way you look at it.'))
    || (a === 0 && first && isLaterRun() && once('lip', 'There is an old hook in its lip.'));
  return line || DESC[id][a];
}
function makeCatch(sp) {
  const a = Math.min(2, STORY.act);
  const spr = makeFish({ len: sp.len, ht: sp.ht, tail: sp.tail, dorsalH: sp.dorsalH, stripes: sp.stripes, spots: sp.spots, spotC: sp.spotC, fork: sp.fork, eel: sp.eel, noEye: a === 2 && sp.id === 'perch', seed: (Math.random() * 1000) | 0, pal: FPAL });
  const desc = cardLine(sp.id, a);
  if (a === 1) STORY.shown1.push(sp.id);
  const voice = STORY.heard && a === 2 ? VOICE[STORY.firstAsk] || '' : '';
  return { name: sp.names[a], weight: lerp(sp.wt[0], sp.wt[1], Math.random()), desc, spr, voice };
}
const REEL_END = { x: BOAT_X - 4, y: WL + 5 };
function hook() {
  if (STORY.goldenNext && STORY.act === 2) { redSequence(); return; }
  const golden = STORY.goldenNext;
  const spec = golden ? null : pickSpecies();
  G.reel = { p: 0, T: 0.15, d: golden ? 0.4 : spec.d, surge: 0, next: 0.6 + Math.random(), x0: G.bob.x, y0: G.bob.y, golden, spec, tick: 0 };
  G.holding = true;
  G.bobDip = 0;
  setPhase('reeling');
  SFX.hook();
}
function reelUpdate(dt) {
  const r = G.reel;
  if (G.holding) {
    r.p += (dt * 0.3) / r.d;
    r.T += dt * (0.4 + (r.surge > 0 ? 1.3 : 0)) * r.d;
    r.tick -= dt;
    if (r.tick <= 0) { r.tick = 0.07; SFX.tick(); }
  } else { r.p -= dt * 0.05; r.T -= dt * 0.85; }
  if (!r.golden) {
    if (r.surge > 0) {
      r.surge -= dt;
      if (!G.holding) r.T += dt * 0.12 * r.d;
      G.bobDip = 0.05;
      if (Math.random() < dt * 14) splash(G.bob.x, G.bob.y, 1);
    } else {
      r.next -= dt;
      if (r.next <= 0) { r.surge = 0.45 + Math.random() * 0.55; r.next = 0.8 + Math.random() * 1.6; ring(G.bob.x, G.bob.y + 1); SFX.nibble(); }
    }
  } else r.T = Math.min(r.T, 0.62);
  r.T = clamp(r.T, 0, 1.05); r.p = clamp(r.p, 0, 1);
  G.rodA = lerp(G.rodA, AIM_A + 0.2 + r.T * 0.35, Math.min(1, dt * 10));
  G.rodBend = lerp(G.rodBend, 1 + r.T * 6, Math.min(1, dt * 10));
  const jx = r.surge > 0 ? (Math.random() - 0.5) * 2 : 0;
  G.bob = { x: lerp(r.x0, REEL_END.x, E.io(r.p)) + jx, y: lerp(r.y0, REEL_END.y, r.p), fly: false };
  if (r.T >= 1) { SFX.snap(); lose('The line snapped.'); return; }
  if (r.p >= 1) land();
}
function land() {
  const r = G.reel;
  G.reel = null; G.holding = false;
  const bx = G.bob ? G.bob.x : REEL_END.x, by = G.bob ? G.bob.y : REEL_END.y;
  splash(bx, by, 10); ring(bx, by + 1);
  SFX.splash();
  if (r.golden) { STORY.goldenNext = false; goldenScene(); return; }
  G.land = { t: 0, x0: bx, y0: by, fish: makeCatch(r.spec) };
  G.bob = null;
  setPhase('landing');
}
function showCard(f) { setPhase('card'); UI.card(f); SFX.caught(); }
function closeCard() { UI.cardHide(); afterCatch(); }
// The fisherman's other two lines, after the first and second cards close.
const OPENING_CAPS = { 1: 'Look at that sun.', 2: 'I could watch that sun forever.' };
function stillCaption() {
  if (STORY.act === 0) return 'The water goes very still.';
  if (STORY.act === 1) return STORY.kept ? 'The water goes very still. The fish in the boat does not.' : 'The water goes very still again.';
  return STORY.kept ? 'The water goes very still. The flame leans toward your feet.' : 'The water goes very still. The lantern flame leans toward it.';
}
function afterCatch() {
  STORY.catches++; STORY.actCatches++; G.tutorial++;
  UI.count(STORY.catches);
  const need = [3, 2, 1][STORY.act];
  if (STORY.actCatches >= need && !STORY.goldenNext) {
    STORY.goldenNext = true;
    cap(stillCaption(), 3.2);
  } else saidBeat(STORY.act === 0 ? OPENING_CAPS[STORY.catches] : null);
  setPhase('ready');
}
function fishUpdate(dt) {
  const ph = G.phase;
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
        saidBeat(STORY.casts === 1 ? 'First time here.' : null);
        startWaiting();
      }
    }
  } else if (ph === 'waiting') {
    G.rodA = lerp(G.rodA, AIM_A, Math.min(1, dt * 3));
    const w = G.wait;
    if (G.t >= G.saidUntil) w.t += dt; // no nibble or bite while a said caption is on screen
    if (w.nib.length && w.t >= w.nib[0]) { w.nib.shift(); G.bobDip = 0.16; ring(G.bob.x, G.bob.y + 1); SFX.nibble(); }
    if (STORY.goldenNext && Math.random() < dt * 6) sparkle(G.bob.x + (Math.random() - 0.5) * 10, G.bob.y - Math.random() * 4);
    if (w.t >= w.bite) {
      G.biteWin = STORY.goldenNext ? 3.2 : 0.95;
      setPhase('bite');
      G.bobDip = 999;
      ring(G.bob.x, G.bob.y + 1); ring(G.bob.x, G.bob.y + 1, true); splash(G.bob.x, G.bob.y, 3);
      SFX.bite();
      if (STORY.goldenNext) SFX.chime();
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

// ---------------------------------------------------------------- input and flow
function press() {
  SFX.init(); SFX.resume();
  const p = G.phase;
  if (p === 'title') startGame();
  else if (p === 'ready') { if (G.arrived) cast(); } // no cast until the boat has rowed in
  else if (p === 'waiting') lose(STORY.goldenNext ? 'Too early.' : 'Too early. Nothing was biting yet.');
  else if (p === 'bite') hook();
  else if (p === 'reeling') G.holding = true;
  else if (p === 'card') closeCard();
  else if (p === 'dialog') dlgTap();
}
function release() { G.holding = false; }

// ---------------------------------------------------------------- test mode (temporary)
// Skips the fishing minigame: one call lands the next fish, or triggers the golden
// scene or the red sequence, exactly as a real catch would. Enable with ?test in the
// URL or the T key. The S key or the Skip button performs a skip.
let TEST = false;
function setTestMode(on) {
  TEST = !!on;
  if (UI.el && UI.el.skip) UI.el.skip.hidden = !TEST;
  cap(TEST ? 'Test mode on' : 'Test mode off', 1.5);
}
const SKIP_BOB = { x: 63, y: 280 };
function testCatch() {
  if (!TEST) return;
  const p = G.phase;
  if (p === 'title') { startGame(); return; }
  if (p === 'card') { closeCard(); return; }
  if (p === 'ready' && !G.arrived) return; // no skip before the boat has rowed in either
  if (p !== 'ready' && p !== 'casting' && p !== 'waiting' && p !== 'bite' && p !== 'reeling' && p !== 'lost') return;
  G.cast = null; G.wait = null; G.holding = false; G.bobDip = 0;
  G.bob = { x: SKIP_BOB.x, y: SKIP_BOB.y, fly: false };
  eyesCast(); // a skip counts as a cast for the eyes
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
      tween(WS, 'boatX', 0, ROW_DUR / 2, E.out, () => { G.arrived = true; refreshPrompt(); }));
    UI.fade(0, 1.2);
    SFX.row();
    cap('Nothing on the lake is moving except you.', 3.5);
  } else if (o.stage === 1 && o.t >= OPEN_DIP + ROW_DUR / 2) { o.stage = 2; SFX.row(); }
  else if (o.stage === 2 && G.arrived) G.open = null;
}
function resetAll() {
  resetWS();
  Object.assign(STORY, freshStory());
  loadRun();
  Object.assign(G, { bob: null, cast: null, wait: null, reel: null, land: null, holding: false, rodA: REST_A, rodBend: 0, bobDip: 0, capUntil: 0, saidUntil: 0, saidPending: [], arrived: true, open: null, eyesDone: false, act2Casts: 0, frozeT: 0 });
  PARTS.length = 0; RINGS.length = 0; ASH.length = 0; SHAD.length = 0; BIRDS.length = 0; TW.length = 0;
  cloudT = 0; genEyes();
  WS.farBoat = RUN.count > 0 || loadEndings().length > 0 || sessionEndings.length > 0 ? 1 : 0; // bible, Title
  CINE = null;
  DLG.q = []; DLG.cur = null; DLG.active = false; DLG.done = null; DLG.wait = 0;
  SFX.drone(false);
  UI.count(0); UI.dlgHide(); UI.cardHide(); UI.endingHide();
  setPhase('title');
  UI.title(true, Math.max(loadEndings().length, sessionEndings.length));
}
function restart() {
  UI.fade(1, 0.6);
  setTimeout(() => { resetAll(); UI.fade(0, 1.4); }, 650);
}
function ambientUpdate(dt) {
  if (WS.mood > 1.6 && G.phase !== 'end' && WS.dim < 5) {
    G.hb -= dt;
    if (G.hb <= 0) { G.hb = 1.7; SFX.heartbeat(); }
  }
}
function update(dt) {
  G.t += dt; G.pt += dt;
  updTweens(dt);
  cineUpdate(dt);
  openingUpdate(dt);
  saidUpdate();
  fishUpdate(dt);
  eyesUpdate();
  if (!WS.frozen) cloudT += dt;
  dlgUpdate(dt);
  updParts(dt); updRings(dt); updAsh(dt); updShadows(dt); updBirds(dt); updJumps(dt);
  ambientUpdate(dt);
}
function init() {
  genClouds(); genMountains(); genStars(); buildSprites();
  alloc();
  resetWS();
}

// ---------------------------------------------------------------- browser boot
function makeUI() {
  const $ = id => document.getElementById(id);
  const el = {
    stage: $('stage'), prompt: $('prompt'), caption: $('caption'), count: $('count'),
    card: $('card'), cardFish: $('cardFish'), cardName: $('cardName'), cardMeta: $('cardMeta'), cardDesc: $('cardDesc'), cardVoice: $('cardVoice'),
    dlg: $('dialog'), who: $('who'), text: $('text'), choices: $('choices'), more: $('more'),
    title: $('title'), found: $('found'), ending: $('ending'), endTitle: $('endTitle'), endText: $('endText'), endAsked: $('endAsked'), endFound: $('endFound'),
    again: $('again'), fade: $('fade'), mute: $('mute'), skip: $('skip'),
  };
  let capTimer = null;
  const rgb = (i, a) => 'rgba(' + (PALRGB[i * 3] | 0) + ',' + (PALRGB[i * 3 + 1] | 0) + ',' + (PALRGB[i * 3 + 2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  const mixWhite = (i, k) => 'rgb(' + [0, 1, 2].map(j => Math.round(PALRGB[i * 3 + j] + (255 - PALRGB[i * 3 + j]) * k)).join(',') + ')';
  return {
    el, choices: null,
    prompt(t) { el.prompt.textContent = t || ''; el.prompt.classList.toggle('on', !!t); el.prompt.classList.toggle('urgent', t === 'Tap now!'); },
    caption(t, dur, style) {
      el.caption.textContent = t; el.caption.className = 'shade on' + (style ? ' ' + style : '');
      clearTimeout(capTimer);
      capTimer = setTimeout(() => el.caption.classList.remove('on'), (dur || 2.5) * 1000);
    },
    count(n) { el.count.textContent = n > 0 ? (n === 1 ? '1 fish' : n + ' fish') : ''; },
    card(f) {
      const s = f.spr, cv = el.cardFish;
      cv.width = s.w + 2; cv.height = s.h + 2;
      const cx = cv.getContext('2d');
      const im = cx.createImageData(cv.width, cv.height);
      const o = new Uint32Array(im.data.buffer);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const v = s.data[y * s.w + x]; if (v !== 255) o[(y + 1) * cv.width + x + 1] = PAL[v]; }
      cx.putImageData(im, 0, 0);
      const u = el.stage.clientWidth / 100;
      const sc = Math.max(2, Math.floor(Math.min((50 * u) / cv.width, (18 * u) / cv.height)));
      cv.style.width = cv.width * sc + 'px'; cv.style.height = cv.height * sc + 'px';
      el.cardName.textContent = f.name;
      el.cardMeta.textContent = f.weight.toFixed(2) + ' kg';
      el.cardDesc.textContent = f.desc;
      el.cardVoice.textContent = f.voice || '';
      el.cardVoice.hidden = !f.voice;
      el.card.classList.add('on');
    },
    cardHide() { el.card.classList.remove('on'); },
    dlgShow(who, style) { el.dlg.className = 'panel on ' + (style || ''); el.who.textContent = who || ''; el.who.hidden = !who; el.more.classList.remove('on'); },
    // mark: the one line whose question mark is drawn wrong. Only that glyph gets a span; everything is text.
    dlgText(t, mark) {
      el.text.textContent = t;
      if (!mark || !t.endsWith('?')) return;
      el.text.textContent = t.slice(0, -1);
      const s = document.createElement('span');
      s.className = 'mark'; s.textContent = '?';
      el.text.appendChild(s);
    },
    dlgChoices(list) {
      el.choices.innerHTML = '';
      this.choices = list;
      if (!list) { el.choices.hidden = true; return; }
      el.choices.hidden = false;
      el.choices.classList.toggle('many', list.length > 3);
      list.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'choice'; b.textContent = c.label;
        b.addEventListener('click', ev => { ev.stopPropagation(); b.blur(); c.cb(); });
        el.choices.appendChild(b);
      });
    },
    dlgMore(on) { el.more.classList.toggle('on', !!on); },
    dlgHide() { el.dlg.classList.remove('on'); el.choices.innerHTML = ''; el.choices.hidden = true; this.choices = null; },
    title(on, found) { el.title.classList.toggle('on', !!on); el.found.textContent = found ? 'Endings found: ' + found + ' of ' + ENDING_COUNT : ''; },
    ending(e, n) {
      el.endTitle.textContent = e.title; el.endText.textContent = e.text; el.endAsked.textContent = e.asked || '';
      el.endFound.textContent = 'Endings found: ' + n + ' of ' + ENDING_COUNT;
      el.ending.classList.add('on');
      setTimeout(() => { try { el.again.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }, 60);
    },
    endingHide() { el.ending.classList.remove('on'); },
    fade(v, dur) { el.fade.style.transitionDuration = (dur || 0.6) + 's'; el.fade.style.opacity = v; },
    colors() {
      const s = document.documentElement.style;
      s.setProperty('--ui-panel', rgb(0, 0.86));
      s.setProperty('--ui-solid', rgb(0));
      s.setProperty('--ui-edge', rgb(6));
      s.setProperty('--ui-ink', mixWhite(11, WS.mood > 1 ? 0.25 : 0.4));
      s.setProperty('--ui-dim', mixWhite(9, 0.2));
      s.setProperty('--ui-accent', rgb(15));
      document.body.style.background = rgb(0);
    },
  };
}
function boot() {
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
  }
  window.addEventListener('resize', resize);
  resize();
  resetAll();
  UI.fade(0, 1.6);

  stage.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    press();
  });
  window.addEventListener('pointerup', release);
  const unlockAudio = () => { SFX.init(); SFX.resume(); };
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(t => window.addEventListener(t, unlockAudio, { passive: true }));
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (/^Digit[1-6]$/.test(e.code) && UI.choices) {
      const c = UI.choices[+e.code.slice(5) - 1];
      if (c) { e.preventDefault(); c.cb(); }
      return;
    }
    if (e.code === 'KeyT') { setTestMode(!TEST); return; }
    if (e.code === 'KeyS' && TEST) { testCatch(); return; }
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
    SFX.init();
    SFX.setMuted(!SFX.muted);
    UI.el.mute.textContent = SFX.muted ? 'Sound off' : 'Sound on';
    UI.el.mute.setAttribute('aria-pressed', SFX.muted ? 'true' : 'false');
    UI.el.mute.blur();
  });
  UI.el.again.addEventListener('click', e => { e.stopPropagation(); UI.el.again.blur(); restart(); });
  UI.el.skip.addEventListener('click', e => { e.stopPropagation(); UI.el.skip.blur(); testCatch(); });
  if (new URLSearchParams(window.location.search).has('test') || window.location.hash === '#test') setTestMode(true);

  let last = 0, lastMood = -1, lastDim = -1;
  function frame(ts) {
    const now = ts / 1000;
    let dt = last ? now - last : 1 / 60;
    last = now;
    dt = clamp(dt, 0, 0.1);
    update(dt);
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
    init, render, update, press, release, resetAll, setPhase, setTestMode, testCatch,
    WS, G, STORY, DLG, SPECIES, makeFish, FPAL, GPAL,
    get UI() { return UI; },
    get phase() { return G.phase; },
    setOut(buf) { OUT32 = buf; },
    setH(h) { H = h; alloc(); },
    get H() { return H; }, W, HY,
    spawnShadows, SHAD, spawnBirds, BIRDS, RUN, ENDING_COUNT,
    setCloudT(v) { cloudT = v; },
  };
}
})();

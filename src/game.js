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
// 12 bobber, 13-16 gold ramp, 17 lantern, 18 fish eye, 19 black, 20 star, 21 red eyes, 22-23 bone
const ACC = {
  day: ['#e2483a', '#5c3a08', '#a86f12', '#e2aa2a', '#ffe27c', '#ffd27a', '#1a0c02', '#000000', '#ffffff', '#ff3322', '#eee4d2', '#a89a86'].map(hexc),
  night: ['#e0503f', '#3e2a0a', '#7c5614', '#c2902c', '#f2d47c', '#ffc766', '#1a0c02', '#000000', '#e8eeff', '#ff3322', '#c9c6d2', '#7c7a8c'].map(hexc),
  blood: ['#ffe4cc', '#1e0203', '#5e0808', '#a8140e', '#ff4a22', '#ff3b1f', '#ff2a14', '#000000', '#ffc6a8', '#ff3322', '#f4c9ab', '#a8584a'].map(hexc),
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
  for (let j = 0; j < 12; j++) setPal(12 + j, lerp(aa[j][0], ab[j][0], t), lerp(aa[j][1], ab[j][1], t), lerp(aa[j][2], ab[j][2], t));
}

// ---------------------------------------------------------------- buffers
const TOP = new Uint8Array(W * HY);          // above-horizon frame (sky, sun, clouds, mountains)
const MOUNT = new Uint8Array(W * HY).fill(255);
const CLOUD = new Uint8Array(W * HY).fill(255);
let FRAME, SPR, IDX, RIPX, OUT32 = null;
function alloc() {
  FRAME = new Uint8Array(W * H);
  SPR = new Uint8Array(W * H);
  IDX = new Uint8Array(W * H);
  RIPX = new Int8Array(H);
}

// ---------------------------------------------------------------- world generation
function genClouds() {
  const rng = mulberry32(1337);
  const clusters = [ // cx, cy, width, height, puffs, rmin, rmax
    [16, 70, 84, 40, 24, 12, 24],
    [44, 150, 100, 34, 26, 11, 22],
    [142, 112, 40, 96, 24, 11, 20],
    [154, 200, 60, 20, 12, 8, 14],
    [46, 208, 60, 16, 12, 6, 12],
    [200, 32, 48, 22, 10, 7, 14],
  ];
  const puffs = [];
  for (const [cx, cy, cw, chh, n, r0, r1] of clusters) {
    for (let k = 0; k < n; k++) {
      const u = rng() * 2 - 1, v = rng() * 2 - 1;
      const r = lerp(r0, r1, rng()) * (1 - 0.3 * Math.abs(u));
      puffs.push({ x: cx + u * cw * 0.5, y: cy + v * chh * 0.5 - r * 0.25, r, base: cy + chh * 0.5 });
    }
  }
  const dens = new Float32Array(W * HY);
  for (let y = 0; y < HY; y++) for (let x = 0; x < W; x++) {
    let d = 0;
    for (let k = 0; k < puffs.length; k++) {
      const p = puffs[k];
      const dx = x - p.x, dy = (y - p.y) * 1.25;
      const q = (dx * dx + dy * dy) / (p.r * p.r);
      if (q < 1) { let kk = 1 - q; kk *= kk; if (y > p.base) kk *= Math.exp(-(y - p.base) / 2); d += kk; }
    }
    if (d > 0.02) d += (fbm(x * 0.07, y * 0.1, 11, 3) - 0.5) * 0.3 + (fbm(x * 0.25, y * 0.25, 23, 2) - 0.5) * 0.1;
    const sdx = Math.abs(x - SUNX), sdy = y < SUN0Y ? SUN0Y - y : 0;
    d *= clamp((Math.sqrt(sdx * sdx + sdy * sdy) - 21) / 10, 0, 1); // keep the sun's path clear
    dens[y * W + x] = d;
  }
  const T = 0.3;
  const sample = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= HY) return 0;
    return dens[y * W + x];
  };
  for (let y = 0; y < HY; y++) for (let x = 0; x < W; x++) {
    const d = dens[y * W + x];
    if (d <= T) continue;
    let lx = SUNX - x, ly = SUN0Y + 6 - y;
    const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
    const shade = d - sample(x + lx * 4, y + ly * 4);
    const e = d - T;
    let f = 8.3 + clamp(shade * 5, -2.4, 2.2);
    if (e < 0.07 && shade > 0) f = 11;
    else if (e < 0.05) f -= 0.8;
    else if (Math.abs(d - 0.72) < 0.025) f = shade > 0.02 ? Math.max(f, 10.3) : Math.min(f, 7.2);
    if (sample(x, y - 1) <= T) f = Math.max(f, 10.6);          // sky-lit tops
    else if (sample(x, y + 2) <= T) f = Math.min(f, 7.0);     // shaded undersides
    f -= clamp((100 - y) / 100, 0, 1) * 1.0;
    f += (vnoise(x * 0.35, y * 0.35, 77) - 0.5) * 0.5;
    CLOUD[y * W + x] = ci(Math.round(f));
  }
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
    if (MOUNT[i] !== 255 || CLOUD[i] !== 255) continue;
    STARS.push({ i, p: rng() * 6.283, b: rng(), s: 1 + rng() * 2 });
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
const DESC = {
  perch: ['You can see its heart beating through it.', 'Its heart isn\u2019t beating.', 'It\u2019s warm. Fish shouldn\u2019t be warm.'],
  char: ['Its scales show you the sky.', 'Its scales show you a red sky.', 'Its scales show someone sitting behind you.'],
  smelt: ['Small, cold, perfect.', 'It has teeth. Smelt don\u2019t have teeth.', 'It is smiling at you.'],
  trout: ['It fought like it had somewhere to be.', 'It keeps looking at the sun.', 'It was already dead. It fought anyway.'],
  eel: ['Longer than it has any right to be.', 'It tied itself in a knot so you\u2019d let go.', 'It is still coming out of the water.'],
  grayling: ['It smells of snow.', 'It smells of smoke.', 'It smells like you.'],
};
const VOICES = ['\u201CWhen it asks for your last wish, cut the line.\u201D', '\u201CThat sun is bait.\u201D', '\u201CDon\u2019t look at the horizon.\u201D'];
const ENDINGS = {
  home: { title: 'Home', text: 'The lake is quiet again. The fish are hungry. Somewhere, a new sun is rising for the next fisherman.' },
  dark: { title: 'Dark', text: 'You sit with the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.' },
  cut: { title: 'Still water', text: 'You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.' },
};

// ---------------------------------------------------------------- state
const WS = {};
function resetWS() {
  Object.assign(WS, {
    mood: 0, dim: 0, sunX: SUNX, sunY: SUN0Y, sunR: 8, sunKind: 0, sunGlow: 1, horizGlow: 1, lid: 0,
    pupil: 0, pupilDx: 0, stalk: 0, stalkCut: 0, troubled: 0, starA: 0, lantern: 0, lanternFlicker: 1,
    jaw: 0, companion: 0, companionTurn: 0, cabin: 0, fishShadows: 0, gold: 0, boatSink: 0, boatX: 0, ash: 0,
    lineCut: false, goldFish: null,
  });
}
const G = {
  phase: 'title', t: 0, pt: 0, holding: false, bob: null, cast: null, wait: null, reel: null, land: null,
  rodA: REST_A, rodBend: 0, bobDip: 0, biteWin: 1, tip: { x: 110, y: 205 }, hand: { x: 136, y: 227 },
  lanternPos: { x: 124, y: 218 }, tutorial: 0, ringT: 0, hb: 0,
};
const STORY = { act: 0, catches: 0, actCatches: 0, wishes: [], heard: false, goldenNext: false, lastSpecies: null, voiceI: 0 };
const has = w => STORY.wishes.indexOf(w) >= 0;

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
function tween(obj, key, to, dur, ease, done) {
  for (let k = TW.length - 1; k >= 0; k--) if (TW[k].obj === obj && TW[k].key === key) TW.splice(k, 1);
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
function spawnShadows() {
  SHAD.length = 0;
  for (let k = 0; k < 16; k++) SHAD.push({ x: Math.random() * W, y: HY + 16 + Math.random() * (H - HY - 40), a: Math.random() * 6.28, sp: 6 + Math.random() * 8 });
}
function updShadows(dt) {
  if (!WS.fishShadows) return;
  for (const s of SHAD) {
    s.a += (hash2(s.x | 0, s.y | 0, (G.t * 2) | 0) - 0.5) * 3 * dt;
    if (WS.mood > 1.3) { const da = Math.atan2(WL + 18 - s.y, 150 - s.x); s.a += Math.sin(da - s.a) * 2 * dt; }
    s.x += Math.cos(s.a) * s.sp * dt;
    s.y += Math.sin(s.a) * s.sp * 0.3 * dt;
    if (s.x < -10) s.x = W + 8;
    if (s.x > W + 10) s.x = -8;
    if (s.y < HY + 12) { s.y = HY + 12; s.a = -s.a; }
    if (s.y > H - 20) { s.y = H - 20; s.a = -s.a; }
  }
}
function updBirds(dt) {
  birdTimer -= dt;
  if (birdTimer <= 0 && WS.mood < 0.5) {
    birdTimer = 10 + Math.random() * 14;
    const fromL = Math.random() < 0.5, y = 40 + Math.random() * 80, n = 2 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) BIRDS.push({ x: fromL ? -8 - k * 9 : W + 8 + k * 9, y: y + (Math.random() - 0.5) * 12 + k * 3, vx: (fromL ? 1 : -1) * (14 + Math.random() * 4), ph: Math.random() * 3 });
  }
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
    if (WS.mood < 1.2 && G.phase !== 'cine') {
      const x = 14 + Math.random() * (W - 28), y = HY + 12 + Math.random() * (H - HY - 60);
      splash(x, y, 4); ring(x, y);
    }
  }
}

// ---------------------------------------------------------------- rendering
function renderTop(t) {
  const sx = WS.sunX, sy = WS.sunY, sr = WS.sunR;
  const glow = WS.sunGlow, hg = WS.horizGlow;
  const red = WS.sunKind === 1;
  const g1 = red ? 30 : 24, g2 = red ? 80 : 62;
  const i1 = 1 / (g1 * g1), i2 = 1 / (g2 * g2);
  const srr = (sr + 0.4) * (sr + 0.4);
  const lidH = sr * (1 - WS.lid);
  for (let y = 0; y < HY; y++) {
    const ty = y / HY;
    const base = 4.1 + 4.5 * Math.pow(ty, 1.5);
    const dyh = HY - y;
    const hb = hg * 1.7 * Math.exp(-(dyh * dyh) / 700);
    const dy = y - sy, dy2 = dy * dy;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const m = MOUNT[i];
      if (m !== 255) { TOP[i] = m; continue; }
      const dx = x - sx, d2 = dx * dx + dy2;
      const g = glow * (2.1 * Math.exp(-d2 * i1) + 1.2 * Math.exp(-d2 * i2)) + hb * Math.exp(-(dx * dx) / 4500);
      const c = CLOUD[i];
      if (c !== 255) { TOP[i] = ci(dith(c + g * 0.55, x, y)); continue; }
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
      if (s.b * 0.7 + (1 - tw) * 0.3 < WS.starA && TOP[s.i] < 8) TOP[s.i] = 20;
    }
  }
  for (const b of BIRDS) stampTop(BIRD[((t * 5 + b.ph) | 0) & 1], b.x | 0, b.y | 0);
  if (WS.cabin > 0) stampTop(CABIN, CABIN_X, CABIN_Y, WS.cabin);
  if (WS.stalk > 0) {
    const yEnd = WS.sunY - WS.sunR * 0.9;
    const y1 = yEnd * WS.stalk * (1 - WS.stalkCut);
    for (let y = 0; y < Math.min(HY, y1); y++) {
      const x = Math.round(WS.sunX + Math.sin(y * 0.04 + t * 0.9) * 0.8 * (y / Math.max(1, yEnd)));
      if (x >= 0 && x < W && MOUNT[y * W + x] === 255) TOP[y * W + x] = 1;
    }
  }
}
function computeWater(t) {
  FRAME.set(TOP, 0);
  const tr = WS.troubled, span = H - HY;
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
    const dir = Math.cos(s.a) >= 0 ? 1 : -1;
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
  if (WS.companion > 0) stampR(WS.companionTurn > 0.5 ? COMP_TURN : COMP, bx + 50, WL - 17 + dy, WL, WS.companion);
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
const DLG = { q: [], cur: null, n: 0, done: null, wait: 0, active: false };
function dlgRun(lines, done) {
  DLG.q = lines.slice(); DLG.done = done || null; DLG.active = true; DLG.cur = null; DLG.wait = 0;
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
    UI.dlgText('');
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
  UI.dlgText(L.text);
  if (L.choices) {
    UI.dlgChoices(L.choices.map(c => ({
      label: c.label,
      cb: () => { if (DLG.cur !== L) return; UI.dlgChoices(null); DLG.cur = null; SFX.select(); c.pick(); },
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
  if (Math.floor(DLG.n) !== prev) UI.dlgText(L.text.slice(0, Math.floor(DLG.n)));
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
const CINE_SUNSET = {
  dur: 10,
  init(s) { s.y0 = WS.sunY; s.tr0 = WS.troubled; },
  update(t, dt, at, s) {
    at('snd', 0, () => SFX.swell());
    at('cap', 0.4, () => UI.caption('The sun slips into the lake like a coin into a well.', 4.8));
    const k = clamp(t / 7.5, 0, 1);
    WS.sunY = lerp(s.y0, HY + 14, E.io(k));
    WS.mood = clamp((t - 1) / 7, 0, 1);
    WS.sunGlow = lerp(1, 0.12, E.io(clamp((t - 3) / 5, 0, 1)));
    WS.horizGlow = lerp(1, 0.3, clamp((t - 4) / 5, 0, 1));
    WS.starA = clamp((t - 5) / 4, 0, 1);
    WS.troubled = lerp(s.tr0, 0.35, k);
    at('lan', 7.8, () => { tween(WS, 'lantern', 1, 0.7); UI.caption('You light the lantern.', 2.6); SFX.match(); });
  },
};
const CINE_RED = {
  dur: 15.5,
  init(s) { WS.sunKind = 1; WS.sunR = 16; WS.sunY = HY + 24; WS.sunGlow = 0; WS.pupil = 0; WS.pupilDx = 0; WS.stalk = 0; s.tr0 = WS.troubled; s.hg0 = WS.horizGlow; },
  update(t, dt, at, s) {
    at('drone', 0.2, () => SFX.drone(true));
    at('c1', 0.6, () => UI.caption('Something rises where the sun went down.', 4));
    const k = clamp((t - 1) / 8.5, 0, 1);
    WS.sunY = lerp(HY + 24, 178, E.out(k));
    WS.mood = 1 + clamp((t - 1.5) / 7.5, 0, 1);
    WS.sunGlow = lerp(0, 1.25, clamp((t - 1) / 6, 0, 1));
    WS.horizGlow = lerp(s.hg0, 1.3, clamp((t - 1) / 6, 0, 1));
    WS.starA = 1 - clamp((t - 2) / 4, 0, 1);
    WS.troubled = lerp(s.tr0, 0.55, clamp(t / 9, 0, 1));
    WS.ash = clamp((t - 6) / 4, 0, 1);
    WS.stalk = clamp((t - 9.2) / 2.3, 0, 1);
    WS.pupil = clamp((t - 12) / 1.3, 0, 1);
    at('c3', 12.2, () => UI.caption('It is not a sun.', 2.8));
    WS.pupilDx = clamp((t - 13.6) / 1.0, 0, 1) * 4;
    at('hb', 13.6, () => SFX.heartbeat());
  },
};
const CINE_JAWS = {
  dur: 5.2,
  update(t, dt, at) {
    WS.jaw = E.in(clamp(t / 4.2, 0, 1));
    at('rumble', 0.1, () => SFX.rumble());
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
    if (t > 6 && t < 8) WS.lanternFlicker = Math.random() < 0.5 ? 1 : 0.1;
    else if (t >= 8) WS.lanternFlicker = 0;
    at('out', 8, () => SFX.hiss(0.6));
    at('fade', 8.3, () => UI.fade(1, 1));
  },
};
const CINE_CUT = {
  dur: 17.5,
  init(s) { s.y0 = WS.sunY; s.tr0 = WS.troubled; },
  update(t, dt, at, s) {
    at('cut', 0.15, () => { WS.lineCut = true; G.bob = null; SFX.snap(); if (WS.goldFish) tween(WS.goldFish, 'a', 0, 0.9); splash(SUNX - 3, HY + 2, 6); });
    at('stalk', 1.0, () => SFX.snap());
    if (t > 1.0) WS.stalkCut = clamp((t - 1) / 0.7, 0, 1);
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
    at('dawn', 6, () => { WS.sunKind = 0; WS.sunR = 8; WS.stalk = 0; WS.stalkCut = 0; WS.companionTurn = 0; });
    if (t >= 6) {
      const kd = clamp((t - 6) / 6.5, 0, 1);
      WS.sunY = lerp(HY + 14, SUN0Y, E.out(kd));
      WS.sunGlow = kd;
      WS.horizGlow = lerp(0.15, 1, kd);
    }
    if (t > 9) WS.lantern = 1 - clamp((t - 9) / 2, 0, 1);
    WS.boatX = t > 11 ? E.io(clamp((t - 11) / 6.5, 0, 1)) * 120 : 0;
    at('cap', 3.4, () => UI.caption('You cut the line.', 3));
  },
};

// ---------------------------------------------------------------- story
const FISHN = 'Golden fish', THE_FISH = 'The fish';
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
function wish1() {
  dlgRun([
    { pause: 0.9 },
    { who: FISHN, text: 'Wait. Don\u2019t gut me, fisherman.' },
    { who: FISHN, text: 'Put me back, and I\u2019ll grant you a wish. Three, if you\u2019re patient.', choices: [
      { label: 'Let it go', pick: () => wish1b(false) },
      { label: 'Keep it', pick: () => wish1b(true) },
    ] },
  ]);
}
function wish1b(kept) {
  const L = kept ? [
    { who: '', text: 'You tighten your grip. It slides through your fingers like water.', style: 'narr' },
    { who: FISHN, text: 'Cold hands can\u2019t hold me. Now. A wish.' },
  ] : [
    { who: FISHN, text: 'Kind. Kindness is rare out here.' },
  ];
  L.push({ who: FISHN, text: 'Tell me what you want.', choices: [
    { label: 'Someone to sit with me', pick: () => grant1('company') },
    { label: 'More fish', pick: () => grant1('fish') },
    { label: 'A home on the shore', pick: () => grant1('home') },
  ] });
  dlgRun(L);
}
function grant1(w) {
  STORY.wishes.push(w);
  const L = {
    company: [
      { act: () => { tween(WS, 'companion', 1, 2.2); SFX.chime(); } },
      { who: FISHN, text: 'Done. Someone will keep you company.' },
      { who: FISHN, text: 'Don\u2019t ask them who they are.' },
    ],
    fish: [
      { act: () => { WS.fishShadows = 1; spawnShadows(); SFX.chime(); } },
      { who: FISHN, text: 'Done. This lake will never be empty again.' },
    ],
    home: [
      { act: () => { tween(WS, 'cabin', 1, 2.2); SFX.chime(); } },
      { who: FISHN, text: 'Done. Look, a light on the shore.' },
      { who: FISHN, text: 'It was always yours. You just never noticed.' },
    ],
  }[w];
  dlgRun(L.concat([
    { who: FISHN, text: 'When you want the next wish, just cast.' },
    { act: goldenDive },
    { pause: 0.8 },
  ]), () => {
    STORY.act = 1; STORY.actCatches = 0;
    tween(WS, 'sunY', SUN0Y + 10, 5); tween(WS, 'troubled', 0.22, 5);
    UI.caption('The sun sits a little lower now.', 3);
    setPhase('ready');
  });
}
function wish2() {
  dlgRun([
    { pause: 0.9 },
    { who: FISHN, text: 'Back so soon? The lake remembers every wish.' },
    { who: FISHN, text: 'Your second?', choices: [
      { label: 'Make this day last forever', pick: () => grant2('forever') },
      { label: 'Let me understand the fish', pick: () => grant2('hear') },
      { label: 'Gold. A boat full of it', pick: () => grant2('gold') },
    ] },
  ]);
}
function grant2(w) {
  STORY.wishes.push(w);
  const L = {
    forever: [
      { who: FISHN, text: 'Forever is a long time for a sun.' },
      { who: FISHN, text: 'Let this one rest. I know a sun that never sets.' },
    ],
    hear: [
      { act: () => { STORY.heard = true; SFX.chime(); } },
      { who: FISHN, text: 'Listen, then.' },
      { who: FISHN, text: 'They talk about me constantly.' },
    ],
    gold: [
      { act: () => { tween(WS, 'gold', 1, 1.5); tween(WS, 'boatSink', 2, 3); SFX.chime(); } },
      { who: FISHN, text: 'Gold is heavy. Mind the waterline.' },
    ],
  }[w];
  dlgRun(L.concat([
    { who: FISHN, text: w === 'forever' ? 'Watch.' : 'Look how late it\u2019s gotten.' },
    { act: goldenDive },
    { pause: 0.6 },
  ]), () => playCine(CINE_SUNSET, () => { STORY.act = 2; STORY.actCatches = 0; setPhase('ready'); }));
}
function redSequence() {
  STORY.goldenNext = false;
  G.holding = false;
  if (G.bob) { G.bob.taut = true; tween(G.bob, 'x', SUNX - 3, 2.6); tween(G.bob, 'y', HY + 5, 2.6); }
  SFX.snapLow();
  dlgRun([
    { pause: 1.4 },
    { who: '', text: 'The line goes taut. Something is pulling it toward the horizon.', style: 'narr' },
    { act: () => { WS.goldFish = { x: SUNX - 14, y: HY - 24, a: 0, surf: HY + 1 }; tween(WS.goldFish, 'a', 1, 0.9); SFX.chime(); } },
    { pause: 0.9 },
    { who: FISHN, text: 'One wish left.' },
    { who: FISHN, text: 'But first, the sun I promised you.' },
  ], () => playCine(CINE_RED, wish3));
}
function wish3() {
  const L = [
    { who: THE_FISH, text: 'Every sun is bait, fisherman. Look up. Do you see the line?', style: 'red' },
    { who: THE_FISH, text: 'You thought you were fishing. You were swimming toward the light.', style: 'red' },
    { who: THE_FISH, text: 'And those were never mountains.', style: 'red' },
  ];
  if (has('company')) L.push({ act: () => tween(WS, 'companionTurn', 1, 0.4) }, { pause: 0.7 }, { who: 'Companion', text: 'Don\u2019t answer it. Cut the line.', style: 'whisper' });
  if (has('home')) L.push({ who: THE_FISH, text: 'The light on the shore was mine too. It always is.', style: 'red' });
  if (has('fish')) L.push({ who: THE_FISH, text: 'All those fish I gave you. Did you think they were food?', style: 'red' });
  if (has('gold')) L.push({ who: THE_FISH, text: 'And all that gold. You\u2019ll sink so nicely.', style: 'red' });
  if (has('forever')) L.push({ who: THE_FISH, text: 'You wanted a sun that never sets. Here it is.', style: 'red' });
  if (STORY.heard) L.push({ who: 'The lake', text: 'cut the line cut the line cut the line', style: 'whisper' });
  L.push({ who: THE_FISH, text: 'Make your last wish.', style: 'red', choices: [
    { label: 'Let me go home', pick: endHome },
    { label: 'Take the red sun away', pick: endDark },
    { label: 'Cut the line', pick: endCut },
  ] });
  dlgRun(L);
}
function endHome() {
  dlgRun([
    { who: THE_FISH, text: 'Home. Yes.', style: 'red' },
    { who: THE_FISH, text: 'Come inside.', style: 'red' },
  ], () => playCine(CINE_JAWS, () => showEnding('home')));
}
function endDark() {
  dlgRun([
    { who: THE_FISH, text: 'As you wish.', style: 'red' },
    { who: THE_FISH, text: 'Without light, you won\u2019t see the teeth. That is my kindness.', style: 'red' },
  ], () => playCine(CINE_DARK, () => showEnding('dark')));
}
function endCut() {
  dlgRun([
    { who: '', text: 'You draw your knife across the line.', style: 'narr' },
    { who: THE_FISH, text: 'No. Nobody cuts the', style: 'red' },
  ], () => playCine(CINE_CUT, () => showEnding('cut')));
}
function loadEndings() {
  try { const v = JSON.parse((IS_BROWSER && window.localStorage.getItem('stillwater-endings')) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function saveEnding(id) {
  const list = loadEndings();
  if (list.indexOf(id) < 0) list.push(id);
  try { if (IS_BROWSER) window.localStorage.setItem('stillwater-endings', JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  return list;
}
let sessionEndings = [];
function showEnding(id) {
  setPhase('end');
  if (sessionEndings.indexOf(id) < 0) sessionEndings.push(id);
  const saved = saveEnding(id);
  const n = Math.max(saved.length, sessionEndings.length);
  UI.ending(ENDINGS[id], n);
}

// ---------------------------------------------------------------- fishing
function setPhase(p) {
  G.phase = p; G.pt = 0;
  let msg = '';
  if (p === 'ready') msg = 'Tap to cast';
  else if (p === 'waiting' && G.tutorial < 2) msg = 'Wait for the float to dip';
  else if (p === 'bite') msg = 'Tap now!';
  else if (p === 'reeling') msg = G.tutorial < 3 ? 'Hold to reel. Let go when it pulls hard.' : 'Hold to reel';
  UI.prompt(msg);
}
function lose(msg) {
  G.bob = null; G.reel = null; G.holding = false; G.bobDip = 0;
  setPhase('lost');
  UI.caption(msg, 1.8);
}
function cast() {
  const tx = 34 + Math.random() * 58, ty = 262 + Math.random() * 36;
  G.cast = { t: 0, tx, ty, from: null };
  setPhase('casting');
  SFX.whoosh();
}
function startWaiting() {
  const golden = STORY.goldenNext;
  const bite = golden ? 1.6 + Math.random() * 0.8 : 1.6 + Math.random() * 3.2 * (WS.fishShadows ? 0.4 : 1);
  const nib = [];
  if (!golden) {
    const n = (Math.random() * 3) | 0;
    for (let i = 0; i < n; i++) nib.push(0.5 + Math.random() * Math.max(0.1, bite - 0.8));
    nib.sort((a, b) => a - b);
  }
  G.wait = { t: 0, bite, nib };
  setPhase('waiting');
}
function pickSpecies() {
  let s;
  do { s = SPECIES[(Math.random() * SPECIES.length) | 0]; } while (s.id === STORY.lastSpecies);
  STORY.lastSpecies = s.id;
  return s;
}
function makeCatch(sp) {
  const a = Math.min(2, STORY.act);
  const spr = makeFish({ len: sp.len, ht: sp.ht, tail: sp.tail, dorsalH: sp.dorsalH, stripes: sp.stripes, spots: sp.spots, spotC: sp.spotC, fork: sp.fork, eel: sp.eel, noEye: a === 2 && sp.id === 'perch', seed: (Math.random() * 1000) | 0, pal: FPAL });
  const voice = STORY.heard ? VOICES[Math.min(VOICES.length - 1, STORY.voiceI++)] : '';
  return { name: sp.names[a], weight: lerp(sp.wt[0], sp.wt[1], Math.random()), desc: DESC[sp.id][a], spr, voice };
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
function afterCatch() {
  STORY.catches++; STORY.actCatches++; G.tutorial++;
  UI.count(STORY.catches);
  const need = [3, 2, 1][STORY.act];
  if (STORY.actCatches >= need && !STORY.goldenNext) {
    STORY.goldenNext = true;
    UI.caption(['The water goes very still.', 'Something gold turns beneath the surface.', 'The lantern flame leans toward the water.'][STORY.act], 3.2);
  }
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
        startWaiting();
      }
    }
  } else if (ph === 'waiting') {
    G.rodA = lerp(G.rodA, AIM_A, Math.min(1, dt * 3));
    const w = G.wait;
    w.t += dt;
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
  else if (p === 'ready') cast();
  else if (p === 'waiting') lose(STORY.goldenNext ? 'Too early.' : 'Too early. Nothing was biting yet.');
  else if (p === 'bite') hook();
  else if (p === 'reeling') G.holding = true;
  else if (p === 'card') closeCard();
  else if (p === 'dialog') dlgTap();
}
function release() { G.holding = false; }
function startGame() {
  UI.title(false);
  setPhase('ready');
  UI.caption('The lake is so still it could be glass.', 3.5);
}
function resetAll() {
  resetWS();
  Object.assign(STORY, { act: 0, catches: 0, actCatches: 0, wishes: [], heard: false, goldenNext: false, lastSpecies: null, voiceI: 0 });
  Object.assign(G, { bob: null, cast: null, wait: null, reel: null, land: null, holding: false, rodA: REST_A, rodBend: 0, bobDip: 0 });
  PARTS.length = 0; RINGS.length = 0; ASH.length = 0; SHAD.length = 0; BIRDS.length = 0; TW.length = 0;
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
  fishUpdate(dt);
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
    title: $('title'), found: $('found'), ending: $('ending'), endTitle: $('endTitle'), endText: $('endText'), endFound: $('endFound'),
    again: $('again'), fade: $('fade'), mute: $('mute'),
  };
  let capTimer = null;
  const rgb = (i, a) => 'rgba(' + (PALRGB[i * 3] | 0) + ',' + (PALRGB[i * 3 + 1] | 0) + ',' + (PALRGB[i * 3 + 2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  const mixWhite = (i, k) => 'rgb(' + [0, 1, 2].map(j => Math.round(PALRGB[i * 3 + j] + (255 - PALRGB[i * 3 + j]) * k)).join(',') + ')';
  return {
    el, choices: null,
    prompt(t) { el.prompt.textContent = t || ''; el.prompt.classList.toggle('on', !!t); el.prompt.classList.toggle('urgent', t === 'Tap now!'); },
    caption(t, dur) {
      el.caption.textContent = t; el.caption.classList.add('on');
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
    dlgText(t) { el.text.textContent = t; },
    dlgChoices(list) {
      el.choices.innerHTML = '';
      this.choices = list;
      if (!list) { el.choices.hidden = true; return; }
      el.choices.hidden = false;
      list.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'choice'; b.textContent = c.label;
        b.addEventListener('click', ev => { ev.stopPropagation(); b.blur(); c.cb(); });
        el.choices.appendChild(b);
      });
    },
    dlgMore(on) { el.more.classList.toggle('on', !!on); },
    dlgHide() { el.dlg.classList.remove('on'); el.choices.innerHTML = ''; el.choices.hidden = true; this.choices = null; },
    title(on, found) { el.title.classList.toggle('on', !!on); el.found.textContent = found ? 'Endings found: ' + found + ' of 3' : ''; },
    ending(e, n) {
      el.endTitle.textContent = e.title; el.endText.textContent = e.text;
      el.endFound.textContent = 'Endings found: ' + n + ' of 3';
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
    if (/^Digit[1-3]$/.test(e.code) && UI.choices) {
      const c = UI.choices[+e.code.slice(5) - 1];
      if (c) { e.preventDefault(); c.cb(); }
      return;
    }
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
    init, render, update, press, release, resetAll, setPhase,
    WS, G, STORY, DLG, SPECIES, makeFish, FPAL, GPAL,
    get UI() { return UI; },
    get phase() { return G.phase; },
    setOut(buf) { OUT32 = buf; },
    setH(h) { H = h; alloc(); },
    get H() { return H; }, W, HY,
    spawnShadows,
  };
}
})();

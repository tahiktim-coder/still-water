// DSP, WAV and PNG helpers for tools/sfxrender.js: levels, a BS.1770-style loudness, spectra, envelope and
// click checks, a log-frequency spectrogram and a loudness-over-time plot. Mono float input at SR.
'use strict';
const { PNG } = require('pngjs');

const SR = 44100;
const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const fx = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-inf');

// ---------------------------------------------------------------- filters
function biquad(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const norm = (b0, b1, b2, a0, a1, a2) => ({ b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 });
function highShelf(fs, fc, q, gainDb) {
  const A = 10 ** (gainDb / 40), w = 2 * Math.PI * fc / fs, cw = Math.cos(w), al = Math.sin(w) / (2 * q), sa = 2 * Math.sqrt(A) * al;
  return norm(A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa),
    (A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa);
}
function highPass(fs, fc, q) {
  const w = 2 * Math.PI * fc / fs, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  return norm((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al);
}
// The K-weighting of ITU-R BS.1770 at 44.1 kHz (the pre-filter shelf and the RLB high-pass).
const K1 = highShelf(SR, 1681.9744509555319, 0.7071752369554193, 3.99984385397);
const K2 = highPass(SR, 38.13547087613982, 0.5003270373253953);
// A rough phone speaker: 4th-order high-pass at 250 Hz (two Butterworth sections).
const PH1 = highPass(SR, 250, 0.5412), PH2 = highPass(SR, 250, 1.3066);

// ---------------------------------------------------------------- loudness
// The game's graph is mono into a stereo destination (both channels the same), so the stereo sum adds 3.01 dB.
const DUAL = 10 * Math.log10(2);
const lufs = z => (z > 0 ? -0.691 + 10 * Math.log10(z) + DUAL : -Infinity);
function loudness(x, phone) {
  let k = biquad(biquad(x, K1), K2);
  if (phone) k = biquad(biquad(k, PH1), PH2);
  const sub = Math.round(SR * 0.1), nSub = Math.max(4, Math.ceil(k.length / sub));
  const ms = new Float64Array(nSub);
  for (let j = 0; j < nSub; j++) {
    let s = 0;
    for (let i = j * sub, e = Math.min(k.length, i + sub); i < e; i++) s += k[i] * k[i];
    ms[j] = s / sub;
  }
  const win = n => { const o = []; for (let j = 0; j + n <= nSub; j++) { let s = 0; for (let q = 0; q < n; q++) s += ms[j + q]; o.push(s / n); } return o; };
  const M = win(4), S = nSub >= 30 ? win(30) : [];
  const abs = M.filter(z => lufs(z) > -70);
  let I = -Infinity;
  if (abs.length) {
    const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const g = abs.filter(z => lufs(z) > rel);
    if (g.length) I = lufs(g.reduce((a, b) => a + b, 0) / g.length);
  }
  return { M: M.map(lufs), S: S.map(lufs), Mmax: maxOf(M.map(lufs)), Smax: S.length ? maxOf(S.map(lufs)) : -Infinity, I };
}

// ---------------------------------------------------------------- levels, true peak, envelope, clicks
// 4x oversampled true peak with a 32-tap Hann-windowed sinc, only where the signal is near its sample peak.
function truePeak(x, peak) {
  let tp = peak;
  const T = 16, cand = peak * 0.5;
  for (let i = T; i < x.length - T; i++) {
    if (Math.abs(x[i]) < cand && Math.abs(x[i + 1]) < cand) continue;
    for (let k = 1; k < 4; k++) {
      const f = k / 4;
      let v = 0;
      for (let j = -T + 1; j <= T; j++) {
        const d = j - f, w = 0.5 + 0.5 * Math.cos(Math.PI * d / T);
        v += x[i + j] * (Math.sin(Math.PI * d) / (Math.PI * d)) * w;
      }
      if (Math.abs(v) > tp) tp = Math.abs(v);
    }
  }
  return tp;
}
function envelope(x) { // 1 ms RMS windows
  const n = Math.round(SR / 1000), e = new Float64Array(Math.ceil(x.length / n));
  for (let j = 0; j < e.length; j++) { let s = 0, c = 0; for (let i = j * n; i < Math.min(x.length, j * n + n); i++) { s += x[i] * x[i]; c++; } e[j] = Math.sqrt(s / Math.max(1, c)); }
  return e;
}
// A click is a second difference far above its 10 ms neighbourhood's (and above -60 dBFS).
function clicks(x) {
  const n = x.length, d2 = new Float64Array(n), P = new Float64Array(n + 1), H = 220, out = [];
  for (let i = 2; i < n; i++) d2[i] = x[i] - 2 * x[i - 1] + x[i - 2];
  for (let i = 0; i < n; i++) P[i + 1] = P[i] + d2[i] * d2[i];
  for (let i = 2; i < n; i++) {
    // Both sides of a click are quiet next to it; an onset (quiet, then bright) is not a click.
    const lo = Math.max(0, i - H), hi = Math.min(n, i + H + 1), a = Math.abs(d2[i]);
    const rms = Math.max(Math.sqrt((P[Math.max(lo + 1, i - 2)] - P[lo]) / Math.max(1, i - 2 - lo)), Math.sqrt((P[hi] - P[Math.min(hi - 1, i + 3)]) / Math.max(1, hi - i - 3)));
    if (a > 1e-3 && a > 10 * rms && (!out.length || i - out[out.length - 1].i > 441)) out.push({ i, t: i / SR, a });
  }
  // A raw sawtooth or square has an edge every period; only an isolated jump (none within 60 ms) is a click.
  const far = Math.round(SR * 0.06);
  return out.filter((c, k) => (!k || c.i - out[k - 1].i > far) && (k === out.length - 1 || out[k + 1].i - c.i > far));
}
// A cut: the 1 ms envelope falls more than 30 dB within 5 ms from above -70 dBFS and within 40 dB of the
// sound's own peak (a source stopped mid-sound).
function cuts(env) {
  const out = [], top = maxOf(env);
  for (let j = 0; j + 6 < env.length; j++) {
    if (env[j] < 3.16e-4 || env[j] < top * 0.01) continue;
    let m = 0;
    for (let k = j + 2; k <= j + 6; k++) m = Math.max(m, env[k]);
    if (m < env[j] * 0.0316 && (!out.length || j - out[out.length - 1] > 20)) out.push(j);
  }
  return out.map(j => j / 1000);
}
const maxOf = a => { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };

// ---------------------------------------------------------------- spectra
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], k = i + j + len / 2;
        const vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[k] = ur - vr; im[k] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const HANN = {};
const hann = N => HANN[N] || (HANN[N] = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)));
// The amplitude spectrum (a full-scale sine reads 1) of the N samples centred on c.
function frame(x, c, N) {
  const re = new Float64Array(N), im = new Float64Array(N), w = hann(N), o = Math.round(c - N / 2);
  for (let i = 0; i < N; i++) { const k = o + i; if (k >= 0 && k < x.length) re[i] = x[k] * w[i]; }
  fft(re, im);
  const m = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) m[i] = 4 * Math.hypot(re[i], im[i]) / N;
  return m;
}
function spectrum(x) {
  const N = 4096, P = new Float64Array(N / 2);
  for (let c = N / 2; c < x.length + N / 2; c += N / 2) { const m = frame(x, c, N); for (let i = 0; i < m.length; i++) P[i] += m[i] * m[i]; }
  let tot = 0, cen = 0, hi = 0, lo = 0;
  for (let i = 1; i < P.length; i++) { const f = i * SR / N; tot += P[i]; cen += f * P[i]; if (f > 4000) hi += P[i]; if (f < 150) lo += P[i]; }
  return { centroid: tot ? cen / tot : 0, above4k: tot ? hi / tot : 0, below150: tot ? lo / tot : 0 };
}

function analyse(x) {
  let peak = 0, sum = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  const env = envelope(x), em = maxOf(env);
  const on = env.findIndex(v => v >= em * 1e-3), offR = env.length - 1 - [...env].reverse().findIndex(v => v >= em * 1e-3);
  const a0 = Math.max(0, on) * 44, a1 = Math.min(x.length, (offR + 1) * 44 + 44);
  let ss = 0;
  for (let i = a0; i < a1; i++) { sum += x[i]; ss += x[i] * x[i]; }
  const n = Math.max(1, a1 - a0);
  const t10 = env.findIndex(v => v >= em * 0.1), t90 = env.findIndex(v => v >= em * 0.9);
  let clip = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 1) clip++;
  const L = loudness(x), Lp = loudness(x, true), sp = spectrum(x);
  return {
    peak: db(peak), truePeak: db(truePeak(x, peak)), rms: db(Math.sqrt(ss / n)), Mmax: L.Mmax, Smax: L.Smax, I: L.I,
    phoneMmax: Lp.Mmax, dur: on < 0 ? 0 : (offR - on + 1) / 1000, attackMs: Math.max(0, t90 - t10),
    centroid: sp.centroid, above4k: sp.above4k, below150: sp.below150, clipped: clip, dc: sum / n,
    first: Math.abs(x[0]), last: Math.abs(x[x.length - 1]), clicks: clicks(x), cuts: cuts(env), loud: L,
  };
}

// ---------------------------------------------------------------- WAV
function wav16(x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}

// ---------------------------------------------------------------- PNG drawing
// A 3x5 pixel font (rows top to bottom) for labels.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', '(': '001010010010001', ')': '100010010010100',
  '/': '001001010100100', '=': '000111000111000', '+': '000010111010000', '%': '101001010100101', _: '000000000000111', ',': '000000000010100',
};
function canvas(w, h, bg) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { p.data[i * 4] = bg[0]; p.data[i * 4 + 1] = bg[1]; p.data[i * 4 + 2] = bg[2]; p.data[i * 4 + 3] = 255; }
  const set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; p.data[o] = c[0]; p.data[o + 1] = c[1]; p.data[o + 2] = c[2]; };
  const text = (x, y, s, c, sc = 2) => {
    for (const ch of String(s).toUpperCase()) {
      const g = FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === '1') for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) set(x + q * sc + a, y + r * sc + b, c);
      x += 4 * sc;
    }
    return x;
  };
  return { p, set, text, w, h, png: () => PNG.sync.write(p) };
}
const STOPS = [[0, 0, 0], [30, 10, 70], [110, 20, 110], [200, 50, 60], [245, 140, 30], [252, 230, 120], [255, 255, 240]];
function heat(v) {
  v = Math.max(0, Math.min(1, v)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(v)), f = v - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
}
const F_LO = 20, F_HI = 20000, DB_LO = -115, DB_HI = -20;
// A log-frequency spectrogram (20 Hz to 20 kHz, -115 to -20 dBFS per bin) with a header line.
function spectrogram(x, title, opts = {}) {
  const dur = x.length / SR, ML = 40, MT = 16, MB = 14;
  const PW = opts.width || Math.round(Math.max(480, Math.min(1400, dur * 400))), PH = opts.height || 300;
  const cv = canvas(ML + PW + 6, MT + PH + MB, [12, 12, 16]);
  const N = x.length < SR ? 2048 : 4096;
  const rowF = y => F_LO * (F_HI / F_LO) ** (1 - (y + 0.5) / PH);
  for (let c = 0; c < PW; c++) {
    const m = frame(x, (c + 0.5) / PW * x.length, N);
    for (let y = 0; y < PH; y++) {
      const f0 = F_LO * (F_HI / F_LO) ** (1 - (y + 1) / PH), f1 = F_LO * (F_HI / F_LO) ** (1 - y / PH);
      let b0 = Math.floor(f0 * N / SR), b1 = Math.ceil(f1 * N / SR), v = 0;
      if (b1 <= b0) b1 = b0 + 1;
      for (let b = b0; b < b1 && b < m.length; b++) v = Math.max(v, m[b]);
      if (b1 - b0 === 1) { const fb = rowF(y) * N / SR, i = Math.floor(fb), t = fb - i; v = (m[i] || 0) * (1 - t) + (m[i + 1] || 0) * t; }
      cv.set(ML + c, MT + y, heat((db(v) - DB_LO) / (DB_HI - DB_LO)));
    }
  }
  const grid = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  for (const f of grid) {
    const y = MT + Math.round(PH * (1 - Math.log(f / F_LO) / Math.log(F_HI / F_LO)));
    for (let xx = ML; xx < ML + PW; xx += 3) cv.set(xx, y, [90, 90, 100]);
    cv.text(2, y - 3, f >= 1000 ? f / 1000 + 'K' : f, [170, 170, 180], 1);
  }
  const step = dur <= 0.5 ? 0.05 : dur <= 2 ? 0.25 : dur <= 10 ? 1 : dur <= 60 ? 5 : 30;
  for (let t = 0; t <= dur + 1e-9; t += step) {
    const xx = ML + Math.round(t / dur * (PW - 1));
    for (let y = MT + PH; y < MT + PH + 3; y++) cv.set(xx, y, [170, 170, 180]);
    cv.text(xx - 4, MT + PH + 5, +t.toFixed(2) + 'S', [170, 170, 180], 1);
  }
  cv.text(4, 3, title, [235, 235, 240], 2);
  return cv.png();
}
// Momentary (400 ms) and short-term (3 s) loudness over time, with each SFX event as a tick in its colour.
function loudnessPlot(L, events, dur, title) {
  const ML = 44, MT = 20, PW = 1600, PH = 260, names = [...new Set(events.map(e => e.name))].sort();
  const legendRows = Math.ceil(names.length / 6);
  const cv = canvas(ML + PW + 10, MT + PH + 34 + legendRows * 12 + 8, [14, 14, 18]);
  const col = n => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return heat(0.35 + (h % 1000) / 1000 * 0.65).map((v, i) => Math.min(255, v + (i === 2 ? 60 : 0))); };
  const Y = v => MT + Math.round((1 - (Math.max(-60, Math.min(0, v)) + 60) / 60) * (PH - 1));
  for (let v = 0; v >= -60; v -= 10) { for (let xx = ML; xx < ML + PW; xx += 4) cv.set(xx, Y(v), [60, 60, 70]); cv.text(4, Y(v) - 3, v + ' LU', [160, 160, 170], 1); }
  for (let t = 0; t <= dur; t += 10) { const xx = ML + Math.round(t / dur * (PW - 1)); for (let y = MT; y < MT + PH; y += 4) cv.set(xx, y, [40, 40, 50]); if (t % 30 === 0) cv.text(xx - 6, MT + PH + 3, t + 'S', [160, 160, 170], 1); }
  const plot = (series, step, off, c) => {
    let py = null;
    for (let i = 0; i < series.length; i++) {
      const xx = ML + Math.round((i * step + off) / dur * (PW - 1)), y = Y(series[i]);
      if (!Number.isFinite(series[i])) { py = null; continue; }
      if (py !== null) for (let k = Math.min(py, y); k <= Math.max(py, y); k++) cv.set(xx, k, c);
      cv.set(xx, y, c); py = y;
    }
  };
  plot(L.M, 0.1, 0.4, [120, 170, 255]);
  plot(L.S, 0.1, 3, [255, 200, 90]);
  for (const e of events) { const xx = ML + Math.round(e.t / dur * (PW - 1)); for (let y = MT + PH + 12; y < MT + PH + 26; y++) cv.set(xx, y, col(e.name)); }
  names.forEach((n, i) => cv.text(ML + (i % 6) * 260, MT + PH + 32 + Math.floor(i / 6) * 12, n, col(n), 2));
  cv.text(4, 3, title + '   BLUE MOMENTARY  ORANGE SHORT-TERM  (LUFS)', [235, 235, 240], 2);
  return cv.png();
}

module.exports = { SR, db, fx, analyse, loudness, wav16, spectrogram, loudnessPlot };

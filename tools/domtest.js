const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const errors = [];
// One page in jsdom with the canvas stubbed. The Russian page opens at its Pages address, so its language
// link can be checked against the real path.
function open(file, url) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
  vc.on('error', e => errors.push('console.error: ' + e));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', virtualConsole: vc, url,
    beforeParse(win) {
      win.__raf = [];
      win.requestAnimationFrame = cb => { win.__raf.push(cb); return win.__raf.length; };
      win.HTMLCanvasElement.prototype.getContext = function () {
        return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData() {} };
      };
      Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get() { return (this.id === 'wrap' || this.id === 'stage') ? 390 : 0; } });
      Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get() { return this.id === 'wrap' ? 780 : 0; } });
      win.addEventListener('error', e => errors.push('window.error: ' + e.message));
    },
  });
  return dom.window;
}
let win, doc, $, ts = 0;
function use(w) { win = w; doc = w.document; $ = id => doc.getElementById(id); }
function pump(n) { for (let i = 0; i < n; i++) { const q = win.__raf; win.__raf = []; ts += 100; q.forEach(cb => cb(ts)); } }
const ev = (type, target) => (target || $('stage')).dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }));
const down = () => ev('pointerdown', $('stage'));
const up = () => win.dispatchEvent(new win.MouseEvent('pointerup', { bubbles: true }));
const tap = () => { down(); up(); };
// The prompts the first catches must show (they step aside later, so the bot reads the stage's data-phase).
const EN = { cast: 'Tap to cast', wait: 'Wait for a bite', bite: 'Tap now', reel: 'Hold to reel. Let go when it pulls.' };
const RU = { cast: 'Нажми, чтобы забросить', wait: 'Жди поклёвки', bite: 'Подсекай', reel: 'Держи, чтобы тянуть. Рыба рвётся — отпускай.' };
// The visible text of the overlay, for the Russian run's Latin check.
const SHOWN = ['caption', 'prompt', 'who', 'text', 'choices', 'thinkText', 'thinkChoices', 'card', 'ending', 'title', 'count', 'mute'];
function latinOnScreen(found) {
  for (const id of SHOWN) {
    const t = $(id).textContent;
    if (/[A-Za-z]/.test(t)) found.add(id + ': ' + t.trim().slice(0, 80));
  }
}
// fresh: the page's first run, where the first catches' prompts must show (they do not come back after).
async function run(plan, label, useKeys, P, latin, fresh) {
  P = P || EN;
  let ci = 0, frame = 0, holdUntil = -1, restUntil = -1, taps = 0;
  const trace = [], prompts = new Set();
  while (frame < 10 * 600) {
    pump(1); frame++;
    if (latin) latinOnScreen(latin);
    prompts.add($('prompt').textContent);
    if ($('ending').classList.contains('on')) break;
    if (holdUntil > 0) { if (frame >= holdUntil) { up(); holdUntil = -1; restUntil = frame + 3; } continue; }
    if (frame % 3) continue;
    const choices = [...$('choices').querySelectorAll('button'), ...$('thinkChoices').querySelectorAll('button')]; // the companion's question sits under his bubble
    const prompt = $('prompt').textContent, phase = $('stage').dataset.phase;
    const cold = $('choices').classList.contains('cold') || $('thinkChoices').classList.contains('cold'); // fresh buttons ignore taps briefly
    if (choices.length && cold) continue;
    if (choices.length) {
      const k = plan[ci++] || 0;
      trace.push(choices[k].textContent);
      if (useKeys) win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'Digit' + (k + 1), bubbles: true }));
      else choices[k].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    } else if ($('dialog').classList.contains('on') || $('think').classList.contains('on') || $('card').classList.contains('on') || $('title').classList.contains('on') || phase === 'ready' || (phase === 'ocean' && prompt === P.cast)) { tap(); taps++; } // a waiting bubble is tapped through too
    else if (phase === 'bite' || phase === 'reeling') { if (frame >= restUntil) { down(); holdUntil = frame + 5; } }
  }
  if (fresh) for (const k of ['cast', 'wait', 'bite', 'reel']) if (!prompts.has(P[k])) errors.push(label + ': the prompt never said ' + P[k]);
  console.log(`[${label}] ending="${$('endTitle').textContent}" found="${$('endPips').getAttribute('aria-label')}" pips="${$('endPips').textContent}" count="${$('count').textContent}" frames=${frame} choices=${trace.join(' | ')}`);
}
async function english() {
  use(open('dist/index.html'));
  await new Promise(r => setTimeout(r, 50));
  pump(5);
  console.log('stage size:', $('stage').style.width, $('stage').style.height, 'canvas', $('c').width + 'x' + $('c').height, 'title on:', $('title').classList.contains('on'));
  console.log('language link:', $('lang').textContent, $('lang').getAttribute('href'), 'shown on the title:', !$('lang').hidden);
  $('mute').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  console.log('mute label after click:', $('mute').getAttribute('aria-label'), 'muted:', $('mute').dataset.muted);
  console.log('title found line on a first run:', JSON.stringify($('found').textContent));
  await run([0, 0, 0, 0, 0, 2], 'mouse, company+forever, yes -> cut', false, EN, null, true);
  console.log('Cast again disabled at the ending:', $('again').disabled);
  await new Promise(r => setTimeout(r, 1700)); // Cast again wakes 1.6 s after the card
  console.log('Cast again disabled after 1.7 s:', $('again').disabled);
  $('again').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 800));
  pump(5);
  console.log('after Cast again: title on =', $('title').classList.contains('on'), 'ending on =', $('ending').classList.contains('on'), 'found =', $('found').textContent);
  await run([1, 1, 2, 0], 'keys, keep, fish+gold -> home', true);
}
// The Russian page (build.js --lang=ru): its title and static text, the link back to the English page, and
// one run with nothing Latin on screen.
async function russian() {
  use(open('tools/out/ru/index.html', 'https://tahiktim-coder.github.io/still-water/ru/'));
  await new Promise(r => setTimeout(r, 50));
  pump(5);
  console.log('ru: <html lang>', doc.documentElement.lang, 'tab', doc.title, 'h1', $('title').querySelector('h1').getAttribute('aria-label'), 'logo', !!$('title').querySelector('h1 svg'));
  console.log('ru: language link:', $('lang').textContent, $('lang').getAttribute('href'), 'shown on the title:', !$('lang').hidden);
  if ($('lang').getAttribute('href') !== '../') errors.push('the Russian page should link back to ../');
  const latin = new Set();
  await run([0, 2, 1, 0], 'ru: mouse, let go, home, hear -> home', false, RU, latin, true);
  if ($('lang').hidden !== true) errors.push('the language link should hide once the game starts');
  console.log('ru: Latin on screen:', latin.size ? [...latin].join(' / ') : 'none');
  if (latin.size) errors.push('Latin letters on the Russian page: ' + [...latin].join(' / '));
}
(async () => {
  await english();
  await russian();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  process.exit(0);
})();

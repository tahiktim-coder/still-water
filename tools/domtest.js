const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', e => errors.push('console.error: ' + e));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc,
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
const win = dom.window, doc = win.document, $ = id => doc.getElementById(id);
let ts = 0;
function pump(n) { for (let i = 0; i < n; i++) { const q = win.__raf; win.__raf = []; ts += 100; q.forEach(cb => cb(ts)); } }
const ev = (type, target) => (target || $('stage')).dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }));
const down = () => ev('pointerdown', $('stage'));
const up = () => win.dispatchEvent(new win.MouseEvent('pointerup', { bubbles: true }));
const tap = () => { down(); up(); };
async function run(plan, label, useKeys) {
  let ci = 0, frame = 0, holdUntil = -1, restUntil = -1, taps = 0;
  const trace = [];
  while (frame < 10 * 600) {
    pump(1); frame++;
    if ($('ending').classList.contains('on')) break;
    if (holdUntil > 0) { if (frame >= holdUntil) { up(); holdUntil = -1; restUntil = frame + 3; } continue; }
    if (frame % 3) continue;
    const choices = [...$('choices').querySelectorAll('button')];
    const prompt = $('prompt').textContent;
    if (choices.length) {
      const k = plan[ci++] || 0;
      trace.push(choices[k].textContent);
      if (useKeys) win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'Digit' + (k + 1), bubbles: true }));
      else choices[k].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    } else if ($('dialog').classList.contains('on') || $('card').classList.contains('on') || $('title').classList.contains('on') || prompt === 'Tap to cast') { tap(); taps++; }
    else if (prompt === 'Tap now!' || prompt.startsWith('Hold to reel')) { if (frame >= restUntil) { down(); holdUntil = frame + 5; } }
  }
  console.log(`[${label}] ending="${$('endTitle').textContent}" found="${$('endFound').textContent}" count="${$('count').textContent}" frames=${frame} choices=${trace.join(' | ')}`);
}
(async () => {
  await new Promise(r => setTimeout(r, 50));
  pump(5);
  console.log('stage size:', $('stage').style.width, $('stage').style.height, 'canvas', $('c').width + 'x' + $('c').height, 'title on:', $('title').classList.contains('on'));
  $('mute').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  console.log('mute label after click:', $('mute').textContent);
  await run([0, 0, 0, 2], 'mouse, company+forever -> cut', false);
  $('again').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 800));
  pump(5);
  console.log('after Cast again: title on =', $('title').classList.contains('on'), 'ending on =', $('ending').classList.contains('on'), 'found =', $('found').textContent);
  await run([1, 1, 2, 0], 'keys, fish+gold -> home', true);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  process.exit(0);
})();

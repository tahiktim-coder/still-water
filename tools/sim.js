const g = require('../src/game.js');
g.init();
const out = new Uint32Array(g.W * g.H);
g.setOut(out);

function play(plan, label, snapAt) {
  g.resetAll();
  const UI = g.UI;
  UI.log.length = 0;
  let t = 0, ci = 0, lastAct = 0, holding = false, frames = 0;
  const dt = 1 / 30;
  const trace = [];
  while (t < 900) {
    const p = g.phase;
    if (t - lastAct > 0.25) {
      if (p === 'title' || p === 'ready' || p === 'card') { g.press(); g.release(); lastAct = t; }
      else if (p === 'bite') { g.press(); holding = true; lastAct = t; }
      else if (p === 'dialog') {
        if (UI.choices) { const c = UI.choices[plan[ci++] || 0]; trace.push('choose:' + c.label); c.cb(); }
        else { g.press(); g.release(); }
        lastAct = t;
      }
    }
    if (p === 'reeling' && g.G.reel) {
      if (holding && g.G.reel.T > 0.7) { g.release(); holding = false; }
      else if (!holding && g.G.reel.T < 0.3) { g.press(); holding = true; }
    } else if (holding && p !== 'reeling') { g.release(); holding = false; }
    g.update(dt);
    if (frames++ % 7 === 0) g.render(t);
    t += dt;
    if (snapAt && snapAt(t, g)) {}
    if (p === 'end') break;
  }
  const caps = UI.log.filter(l => l[0] === 'caption').map(l => l[1]);
  const ending = UI.log.filter(l => l[0] === 'ending').map(l => l[1].title);
  console.log(`[${label}] phase=${g.phase} t=${t.toFixed(1)}s catches=${g.STORY.catches} wishes=${g.STORY.wishes.join(',')} ending=${ending.join(',')}`);
  console.log('   ' + trace.join(' | '));
  console.log('   captions: ' + caps.join(' / '));
  return g.phase === 'end';
}
let ok = true;
// plan indices: [let go/keep, wish1, wish2, final]
ok &= play([0, 0, 0, 0], 'company+forever -> home');
ok &= play([1, 1, 1, 1], 'keep, fish+hear -> dark');
ok &= play([0, 2, 2, 2], 'home+gold -> cut');
ok &= play([1, 0, 1, 2], 'company+hear -> cut');
console.log(ok ? 'ALL ENDINGS REACHED' : 'SOMETHING STALLED');

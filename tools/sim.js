// A headless bot that plays the story to every ending. Plans are index lists consumed in
// order at every choice menu. Menus in order: scene 1 (Let it go / Keep it), wish 1 (company /
// fish / home / Nothing), Who? (company only, one option), wish 2 (forever / hear / gold /
// Nothing), the companion's question (company only: Yes / Say nothing), wish 3 (home / dark /
// cut / Nothing if refused twice).
const g = require('../src/game.js');
g.init();
const out = new Uint32Array(g.W * g.H);
g.setOut(out);

function play(plan, label) {
  g.resetAll();
  const UI = g.UI;
  UI.log.length = 0;
  let t = 0, ci = 0, lastAct = 0, holding = false, frames = 0, lastLine = null, stalled = '';
  const dt = 1 / 30;
  const trace = [], lines = [];
  while (t < 900) {
    const p = g.phase;
    const cur = g.DLG.cur;
    if (cur && cur !== lastLine) { lastLine = cur; lines.push((cur.who ? cur.who + ': ' : '') + cur.text); }
    if (t - lastAct > 0.25) {
      if (p === 'title' || p === 'ready' || p === 'card') { g.press(); g.release(); lastAct = t; }
      else if (p === 'bite') { g.press(); holding = true; lastAct = t; }
      else if (p === 'dialog') {
        if (UI.choices) {
          const k = plan[ci++] || 0, c = UI.choices[k] || UI.choices[0]; // a missing index falls back to 0 (bible, section 9)
          if (!c) { stalled = 'no choices at all'; break; }
          trace.push('choose:' + c.label); c.cb();
        } else { g.press(); g.release(); }
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
    if (p === 'end') break;
  }
  const caps = UI.log.filter(l => l[0] === 'caption').map(l => l[1]);
  const cards = UI.log.filter(l => l[0] === 'card').map(l => l[1].name + ': ' + l[1].desc + (l[1].voice ? ' ' + l[1].voice : ''));
  const card = (UI.log.filter(l => l[0] === 'ending').map(l => l[1]))[0];
  const S = g.STORY;
  console.log(`[${label}] phase=${g.phase} t=${t.toFixed(1)}s catches=${S.catches} wishes=${S.wishes.join(',')} kept=${S.kept} firstAsk=${S.firstAsk} refused=${S.refused} answered=${S.answered} ending=${card ? card.title + (card.variant ? ' (' + card.variant + ')' : '') : stalled}`);
  console.log('   ' + trace.join(' | '));
  console.log('   lines: ' + lines.join(' / '));
  console.log('   captions: ' + caps.join(' / '));
  console.log('   cards: ' + cards.join(' / '));
  if (card) console.log('   card: ' + card.text + ' | ' + card.asked);
  return { ok: g.phase === 'end', id: card ? card.id + (card.variant ? ':' + card.variant : '') : null };
}
const plans = [
  [[0, 0, 0, 0, 0, 0], 'let go, company (someone), forever, yes -> home'],
  [[1, 1, 1, 1], 'keep, fish, hear -> dark'],
  [[0, 2, 2, 2], 'let go, home, gold -> cut'],
  [[1, 0, 0, 1, 1, 2], 'keep, company (someone), hear, say nothing -> cut'],
  [[0, 3, 3, 3], 'let go, nothing, nothing, nothing -> silent'],
  [[0, 3, 0, 0], 'let go, nothing, forever -> home'],
  [[1, 2, 3, 2], 'keep, home, nothing -> cut'],
  [[0, 3, 3, 0], 'let go, nothing, nothing -> home'],
  [[1, 1, 2, 1], 'keep, fish, gold -> dark'],
];
let ok = true;
const seen = {};
for (const [plan, label] of plans) {
  const r = play(plan, label);
  ok = ok && r.ok;
  if (r.id) seen[r.id] = true;
}
const need = ['home', 'dark', 'cut', 'cut:silent'];
const missing = need.filter(id => !seen[id]);
if (missing.length) { ok = false; console.log('missing endings: ' + missing.join(', ')); }
console.log(ok ? 'ALL ENDINGS REACHED' : 'SOMETHING STALLED');

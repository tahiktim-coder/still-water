// A headless bot that plays the story to every ending. Plans are index lists consumed in
// order at every choice menu. Menus in order: scene 1 (Let it go / Keep it), wish 1 (company /
// fish / home / Nothing), the ocean window after the fish wish (no menu: a press casts, { wait } does not), Who? (company only, one option), wish 2 (forever / hear / gold /
// Nothing), the companion's question (company only: Yes / Say nothing), wish 3 (home / dark /
// cut / Stay with them if answered / Let me get my gold if gold / Nothing if refused twice). { tap: true } taps the companion once
// per act during play, so his lines show up in the captions.
const g = require('../src/game.js');
g.init();
const out = new Uint32Array(g.W * g.H);
g.setOut(out);

function play(plan, label, opts) {
  opts = opts || {};
  g.resetAll();
  const UI = g.UI;
  UI.log.length = 0;
  let t = 0, ci = 0, lastAct = 0, holding = false, frames = 0, lastLine = null, stalled = '', tapped = -1, keptMax = 0;
  const dt = 1 / 30;
  const trace = [], lines = [];
  while (t < 900) {
    const p = g.phase;
    const cur = g.DLG.cur;
    if (cur && cur !== lastLine) { lastLine = cur; lines.push((cur.who ? cur.who + ': ' : '') + cur.text); }
    if (p === 'dialog') keptMax = Math.max(keptMax, g.WS.goldKept); // the released path never stamps a kept fish
    if (t - lastAct > 0.25) {
      // A waiting bubble over play (his own lines, the companion's; in 'ready' or 'waiting') holds the float and
      // is dismissed by a press that does nothing else; the next press casts. The bot taps the companion only
      // when none is up.
      const bubbleUp = g.G.t < g.G.thinkUntil;
      if (bubbleUp) { g.press(); g.release(); lastAct = t; }
      else if (p === 'ready' && opts.tap && g.WS.companion > 0.5 && tapped < g.STORY.act) { g.companionTap(); tapped = g.STORY.act; lastAct = t; }
      else if (p === 'title' || p === 'ready' || p === 'card') { g.press(); g.release(); lastAct = t; }
      else if (p === 'ocean') { if (!opts.wait) { g.press(); g.release(); } lastAct = t; } // the ocean window: cast into the big one unless the plan waits
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
  // Captions and thought bubbles in order; a bubble shows as (fisherman) or (companion) plus its text.
  const caps = UI.log.filter(l => l[0] === 'caption' || l[0] === 'think').map(l => l[0] === 'think' ? '(' + l[2] + ') ' + l[1] : l[1]);
  const cards = UI.log.filter(l => l[0] === 'card').map(l => l[1].name + ': ' + l[1].desc + (l[1].voice ? ' ' + l[1].voice : ''));
  const card = (UI.log.filter(l => l[0] === 'ending').map(l => l[1]))[0];
  const S = g.STORY;
  console.log(`[${label}] phase=${g.phase} t=${t.toFixed(1)}s catches=${S.catches} wishes=${S.wishes.join(',')} kept=${S.kept} firstAsk=${S.firstAsk} refused=${S.refused} answered=${S.answered} ocean=${S.ocean} ending=${card ? card.title + (card.variant ? ' (' + card.variant + ')' : '') : stalled}`);
  console.log('   ' + trace.join(' | '));
  console.log('   lines: ' + lines.join(' / '));
  console.log('   captions: ' + caps.join(' / '));
  console.log('   cards: ' + cards.join(' / '));
  if (card) console.log('   card: ' + card.text + ' | ' + card.asked);
  // Let go: STORY.kept stays false and WS.goldKept stays 0 while the fish speaks, so drawKeptFish's guard
  // (!STORY.kept || goldKept <= 0.01) skips the stamp on every frame of the dialogue.
  let ok = g.phase === 'end';
  if (!S.kept && keptMax > 0) { ok = false; console.log('   a kept fish was drawn on a released path (goldKept ' + keptMax + ')'); }
  return { ok, id: card ? card.id + (card.variant ? ':' + card.variant : '') : null, text: card ? card.text : '' };
}
const plans = [
  [[0, 0, 0, 0, 0, 0], 'let go, company (someone), forever, yes -> home'],
  [[1, 1, 1, 1], 'keep, fish (wait), hear -> dark', null, { wait: true }],
  [[0, 1], 'let go, fish, cast into the big one -> swallowed'],
  [[0, 2, 2, 2], 'let go, home, gold -> cut'],
  [[1, 0, 0, 1, 1, 2], 'keep, company (someone), hear, say nothing -> cut'],
  [[0, 3, 3, 3], 'let go, nothing, nothing, nothing -> silent'],
  [[0, 3, 0, 0], 'let go, nothing, forever -> home'],
  [[1, 2, 3, 2], 'keep, home, nothing -> cut'],
  [[0, 3, 3, 0], 'let go, nothing, nothing -> home'],
  [[1, 1, 2, 1], 'keep, fish (wait), gold -> dark', null, { wait: true }],
  // A third element is a sentence the ending card must end with; a fourth is options ({ wait } holds the
  // bot's hand through the ocean window, so the big one leaves; { has } is a sentence the card must contain).
  [[0, 3, 0, 2], 'let go, nothing, forever -> cut', 'You asked once for nothing. It kept count.'],
  [[0, 0, 0, 0, 0, 3], 'let go, company (someone), forever, yes, tap him each act -> stay', 'after a while you stop minding.', { tap: true }],
  // Phase 5, the kept fish: act 1 is a normal hook (one more catch), the fish speaks from the boat, and
  // the ending card carries the kept sentence.
  [[1, 2, 0, 2], 'keep, home, forever -> cut (still water, the fish over the side)', 'You lifted it over the side. It let you.'],
  [[1, 2, 1, 0], 'keep, home, hear -> home', 'The golden fish slips out of the boat as you go in.'],
  [[1, 3, 3, 3], 'keep, nothing, nothing, nothing -> silent', 'Some evenings, the sunset looks back.'],
  // Phase 6, the gold sink and Deep: gold at wish 2 sinks the boat to the gunwales; 'Let me get my gold' sits
  // after Cut the line (no Stay) or after Stay with them.
  [[0, 2, 2, 3], 'let go, home, gold -> deep', 'and there is no bottom.'],
  [[1, 0, 0, 2, 0, 4], 'keep, company (someone), gold, yes -> deep (kept)', 'The golden fish goes down with you. It knows the way.'],
  // Phase 9: the fish wish waited out continues on the open sea (no shore) to Home, Dark and Still water; the
  // gold sink leaves the fisherman in the water, and the Still water and Dark cards swap their verb.
  [[0, 1, 0, 0], 'let go, fish (wait), forever -> home (sea)', 'The lake is full. It was always full.', { wait: true }],
  [[0, 1, 1, 2], 'let go, fish (wait), hear -> cut (sea)', 'The fish behind you all face one way. You do not look.', { wait: true }],
  [[0, 2, 2, 2], 'let go, home, gold -> cut (swimming)', null, { has: 'You swim until the water is only water.' }],
  [[0, 1, 2, 1], 'let go, fish (wait), gold -> dark (swimming, sea)', null, { wait: true, has: 'You hang in the water beside the lantern until it gutters out.' }],
];
let ok = true;
const seen = {};
for (const [plan, label, cardEnd, opts] of plans) {
  const r = play(plan, label, opts);
  ok = ok && r.ok;
  if (cardEnd && !r.text.endsWith(cardEnd)) { ok = false; console.log('   card should end with: ' + cardEnd); }
  if (opts && opts.has && r.text.indexOf(opts.has) < 0) { ok = false; console.log('   card should contain: ' + opts.has); }
  if (r.id) seen[r.id] = true;
}
// One line per ending id (six, plus the silent variant of cut), then the verdict: every plan must end and
// all six ids must have been seen.
const need = ['home', 'dark', 'cut', 'stay', 'deep', 'swallowed', 'cut:silent'];
for (const id of need) console.log('ending ' + id.padEnd(11) + (seen[id] ? 'reached' : 'MISSING'));
const missing = need.filter(id => !seen[id]);
if (missing.length) ok = false;
console.log(ok ? 'ALL ENDINGS REACHED' : 'SOMETHING STALLED');

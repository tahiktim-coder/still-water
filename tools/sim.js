// A headless bot that plays the story to every ending. Plans are index lists consumed in
// order at every choice menu. Menus in order: scene 1 (Let it go / Keep it), wish 1 (company /
// fish / home / Nothing), the ocean window after the fish wish (no menu: a press casts, { wait } does not), Who? (company only, one option), wish 2 (forever / hear / gold /
// Nothing), the companion's question (company only: Yes / Say nothing), wish 3 (home / dark /
// cut / Stay with him if answered / Let me get my gold if gold / Nothing if refused twice). { tap: true } taps the companion once
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
  let t = 0, ci = 0, lastAct = 0, holding = false, frames = 0, lastLine = null, stalled = '', tapped = -1, keptMax = 0, snaps = 0;
  // The reel bot sees the line REACT seconds late, like a person: it lets go when it sees a surge (or the
  // tension high) and holds again once it sees the surge over and the tension low. A snap costs a recast.
  const REACT = 0.35, seen = [];
  // Phase 17: after the forever wish a ring in flight still spreads (only the jump spawn is frozen), so on a
  // forever plan some ring's radius must be seen growing while WS.frozen is 1.
  let ringGrew = false, ringSeen = null;
  const dt = 1 / 30;
  const trace = [], lines = [], labels = new Set();
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
          UI.choices.forEach(o => labels.add(o.label)); // every label offered, for the no-echo check below
          const k = plan[ci++] || 0, c = UI.choices[k] || UI.choices[0]; // a missing index falls back to 0 (bible, section 9)
          if (!c) { stalled = 'no choices at all'; break; }
          trace.push('choose:' + c.label); c.cb();
        } else { g.press(); g.release(); }
        lastAct = t;
      }
    }
    if (p === 'reeling' && g.G.reel) {
      const r = g.G.reel;
      seen.push({ t, T: r.T, surge: r.surge > 0 });
      while (seen.length > 1 && seen[1].t <= t - REACT) seen.shift();
      const v = seen[0].t <= t - REACT ? seen[0] : null; // nothing seen yet in the first REACT seconds
      if (v) {
        if (holding && (v.surge || v.T > 0.7)) { g.release(); holding = false; }
        else if (!holding && !v.surge && v.T < 0.3) { g.press(); holding = true; }
      }
    } else {
      seen.length = 0;
      if (holding && p !== 'reeling') { g.release(); holding = false; }
    }
    const wasReel = p === 'reeling';
    g.update(dt);
    if (wasReel && g.phase === 'lost' && !g.G.reel) snaps++;
    if (g.WS.frozen && !ringGrew) {
      const r = g.RINGS[0];
      if (r && ringSeen && ringSeen.ring === r && r.r > ringSeen.r) ringGrew = true;
      ringSeen = r ? { ring: r, r: r.r } : null;
    }
    if (frames++ % 7 === 0) g.render(t);
    t += dt;
    if (p === 'end') break;
  }
  // Captions and thought bubbles in order; a bubble shows as (fisherman) or (companion) plus its text.
  const caps = UI.log.filter(l => l[0] === 'caption' || l[0] === 'think').map(l => l[0] === 'think' ? '(' + l[2] + ') ' + l[1] : l[1]);
  const cards = UI.log.filter(l => l[0] === 'card').map(l => l[1].name + ': ' + l[1].desc + (l[1].voice ? ' ' + l[1].voice : ''));
  const card = (UI.log.filter(l => l[0] === 'ending').map(l => l[1]))[0];
  const S = g.STORY;
  console.log(`[${label}] phase=${g.phase} t=${t.toFixed(1)}s snaps=${snaps} catches=${S.catches} wishes=${S.wishes.join(',')} kept=${S.kept} firstAsk=${S.firstAsk} refused=${S.refused} answered=${S.answered} ocean=${S.ocean} ending=${card ? card.title + (card.variant ? ' (' + card.variant + ')' : '') : stalled}`);
  console.log('   ' + trace.join(' | '));
  console.log('   lines: ' + lines.join(' / '));
  console.log('   captions: ' + caps.join(' / '));
  console.log('   cards: ' + cards.join(' / '));
  if (card) console.log('   card: ' + card.text + ' | ' + card.asked);
  // Let go: STORY.kept stays false and WS.goldKept stays 0 while the fish speaks, so drawKeptFish's guard
  // (!STORY.kept || goldKept <= 0.01) skips the stamp on every frame of the dialogue.
  let ok = g.phase === 'end';
  if (!S.kept && keptMax > 0) { ok = false; console.log('   a kept fish was drawn on a released path (goldKept ' + keptMax + ')'); }
  // Bible, 4b: a tapped choice is already his line and is never echoed in the bubble, so no bubble text may
  // equal a label from any menu this run offered.
  const echoed = UI.log.filter(l => l[0] === 'think' && labels.has(l[1])).map(l => l[1]);
  if (echoed.length) { ok = false; console.log('   a choice label was echoed in the bubble: ' + echoed.join(' / ')); }
  // Phase 17: the sunk and open-sea variants of the lines and captions, and the whisper's label, on the plans
  // that reach them ({ says }: each must appear among the dialogue lines, captions or panel labels).
  const said = lines.concat(caps, UI.log.filter(l => l[0] === 'dlgShow').map(l => l[1]));
  for (const s of opts.says || []) if (!said.some(x => x.indexOf(s) >= 0)) { ok = false; console.log('   missing line or caption: ' + s); }
  for (const s of opts.saysNot || []) if (said.some(x => x.indexOf(s) >= 0)) { ok = false; console.log('   unexpected line or caption: ' + s); }
  // Phase 19: a later run has two act 0 catches, and all four of his act 0 thoughts still show before the
  // still caption.
  const stillAt = caps.findIndex(c => c.startsWith('The water goes very still'));
  const thoughts = caps.slice(0, stillAt).filter(c => c.startsWith('(fisherman)')).length;
  if (stillAt < 0 || thoughts !== 4) { ok = false; console.log('   ' + thoughts + ' act 0 thoughts before the still caption, not 4'); }
  if (S.wishes.indexOf('forever') >= 0 && !ringGrew) { ok = false; console.log('   no ring grew while frozen'); }
  return { ok, snaps, t, id: card ? card.id + (card.variant ? ':' + card.variant : '') : null, text: card ? card.text : '', asked: card ? card.asked : '' };
}
// Phase 16: the ending card's base is one of the bible's twenty situations (ending x lake/sea x boat/sunk, and
// for Still water at sea x heard). A plan's options may carry { base: n } to assert the card starts with that
// exact text; a Still water card ends with the bait sentence unless { noPocket } (situation 10, the lake
// with the boat sunk), and no other ending's card carries it. Situation 14 (sea, sunk, heard) is in the table
// but has no path: hear and gold are both wish 2.
const BAIT_END = 'There is a bait in your pocket. It has an eye.';
// Phase 23, the knocking on the home path: both captions and the fish's line, and the cabin card sentences.
const KNOCKS = ['Someone knocks on the cabin door.', 'The knocking again. Slower.', 'Don’t mind the knocking. They’re not trying to get in.'];
const CABIN_HOME = 'The knocking stops. Now it’s you on the inside.';
const CABIN_DARK = 'The knocking goes on all night. Nobody opens.';
const CABIN_CUT = 'The cabin goes dark. The knocking stops. You don’t go back to see why.';
const NEXT_SUN = ' Somewhere a sun is coming up. Someone is rowing out.';
const BASES = {
  1: 'The lake is quiet again. The fish are hungry.' + NEXT_SUN,
  2: 'The lake is quiet again. The boat is on the bottom and so is the gold.' + NEXT_SUN,
  3: 'The sea is quiet again. Nobody will come this far to look.' + NEXT_SUN,
  4: 'The sea is quiet again. The gold is on the bottom, and it is a long way down.' + NEXT_SUN,
  5: 'You sit with the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.',
  6: 'You hang in the water beside the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.',
  7: 'You sit with the lantern until it gutters out. There is no shore to see it from. Sometimes something takes the bait. You never reel it in.',
  8: 'You hang in the water beside the lantern until it gutters out. The big ones pass under you all night. You never reel anything in.',
  9: 'You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.',
  10: 'You swim for the shore and reach it. Every morning you wake in the water again, above the gold. You can always come back for it, it said.',
  11: 'You cut it. The red sun goes down for everyone. There is no shore in any direction. You row anyway, for a while.',
  12: 'You cut it. The fish you can hear know the way. They bring you to a shore nobody from home has seen, and you start again there.',
  13: 'You cut it. The red sun goes down for everyone. You swim for a while.',
  15: 'You stay. He took the sun down with him. The seat behind you is empty again. It does not get light, and after a while you stop minding.',
  '15f': 'You stay. He took the sun down with him. The seat behind you is empty again. The day did not end.', // forever: no STAY_DARK before its own line
  16: 'You stay, in the water. He took the sun down with him. It does not get light, and after a while you stop minding.',
  17: 'The gold is where you left it. So is everything else. The water is warmer than you thought, and full of light, and there is no bottom.',
  18: 'The gold is somewhere below. The water is warmer than you thought, and full of light, and the big ones let you pass. There is no bottom.',
  19: 'You wanted nothing. It showed you anyway. You row until the water is only water. Some evenings, the sunset looks back.',
  20: 'Somewhere far above, the sun is still shining on the sea. There is no boat on it.',
};
function baitOk(r, opts) {
  if (!r.id.startsWith('cut')) return r.text.indexOf(BAIT_END) < 0;
  if (opts && opts.noPocket) return r.text.indexOf(BAIT_END) < 0;
  return r.text.endsWith(BAIT_END) && r.asked.startsWith('You asked');
}
// [plan, label, the sentence the card must end with (or null), options]. Options: { wait } holds the bot's
// hand through the ocean window so the big one leaves; { tap } taps the companion once per act; { has } is a
// sentence the card must contain; { base } the situation number; { noPocket } as above.
const plans = [
  [[0, 0, 0, 0, 0, 0], 'let go, company (someone), forever, yes -> home', 'The seat behind you is empty now. It was your turn.', { base: 1, says: ['Someone. You didn’t ask who.', 'ay that never ends. And forever. Your words, not mine.', 'First time out here. Look at that sun.'] }],
  [[1, 1, 1, 1], 'keep, fish (wait), hear -> dark (sea)', 'The golden fish dries in the bottom of the boat. It stops asking before you do.', { wait: true, base: 7 }],
  [[0, 1], 'let go, fish, cast into the big one -> swallowed', null, { base: 20 }],
  [[0, 2, 2, 2], 'let go, home, gold -> cut (lake, sunk: no pocket line)', CABIN_CUT, { base: 10, noPocket: true, says: ['You reach for the knife in your belt.'].concat(KNOCKS) }],
  [[1, 0, 0, 1, 1, 2], 'keep, company (someone), hear, say nothing -> cut', 'There is someone in the stern. You do not ask. You row. ' + BAIT_END, { base: 9, says: ['You cut the line last time. It’s the same line.', 'You cast anyway. Habit. And this time?', 'You light the lantern. The shore does not.'] }],
  [[0, 3, 3, 3], 'let go, nothing, nothing, nothing -> silent', 'Some evenings, the sunset looks back. ' + BAIT_END, { base: 19, says: ['You said you could stay out here forever. There’s time.'] }],
  [[0, 3, 0, 0], 'let go, nothing, forever -> home', 'The day does not end. You aren’t in it.', { base: 1, says: ['You again. Or someone wearing you.'] }],
  [[1, 2, 3, 2], 'keep, home, nothing -> cut', CABIN_CUT + ' ' + BAIT_END, { base: 9, says: ['You light the lantern.'].concat(KNOCKS), saysNot: ['The shore does not.'] }],
  [[0, 3, 3, 0], 'let go, nothing, nothing -> home', 'You asked for nothing, and then for home. Home was the only thing it had.', { base: 1 }],
  [[1, 1, 2, 1], 'keep, fish (wait), gold -> dark (sea, sunk)', 'The golden fish circles you all night, glowing less each time.', { wait: true, base: 8, says: ['The sun slips into the sea like a coin into a well.', 'Don’t leave me out here.'] }],
  [[0, 3, 0, 2], 'let go, nothing, forever -> cut', 'Dawn comes anyway. You did not ask for it. ' + BAIT_END, { base: 9 }],
  [[0, 3, 2, 2], 'let go, nothing, gold -> cut (lake, sunk, the one-refusal line)', 'You asked once for nothing. It kept count.', { base: 10, noPocket: true }],
  [[0, 0, 0, 0, 0, 3], 'let go, company (someone), forever, yes, tap him each act -> stay', 'The day did not end. Now it will not begin.', { tap: true, base: '15f', says: ['Stay with him', 'Stay with him. Two wishes, one seat.', 'You answered him. I did ask you not to.'], saysNot: KNOCKS }],
  [[0, 0, 0, 2, 0, 3], 'let go, company (someone), gold, yes -> stay (sunk)', 'after a while you stop minding.', { base: 16 }],
  // Phase 5, the kept fish: act 1 is a normal hook (one more catch), the fish speaks from the boat, and
  // the ending card carries the kept sentence where nothing outranks it.
  [[1, 3, 0, 2], 'keep, nothing, forever -> cut (the fish over the side)', 'You lifted it over the side. It let you. ' + BAIT_END, { base: 9 }],
  [[1, 2, 1, 0], 'keep, home, hear -> home', 'The golden fish slips out of the boat as you go in.', { base: 1 }],
  [[1, 3, 3, 3], 'keep, nothing, nothing, nothing -> silent (kept)', 'It went over the side on its own. You let it. ' + BAIT_END, { base: 19, says: ['It waits. Then it goes dark in the bottom of the boat.'] }],
  [[1, 2, 2, 1], 'keep, home, gold -> dark (lake, sunk)', 'The golden fish circles you all night, glowing less each time.', { base: 6, says: ['The water goes very still. The flame leans toward the fish.', 'Don’t leave me out here.'] }],
  // Phase 6, the gold sink and Deep: gold at wish 2 sinks the boat; 'Let me get my gold' sits after Cut the
  // line (no Stay) or after Stay with him.
  [[0, 2, 2, 3], 'let go, home, gold -> deep', 'and there is no bottom.', { base: 17 }],
  [[1, 0, 0, 2, 0, 4], 'keep, company (someone), gold, yes -> deep (kept)', 'The golden fish goes down with you. It knows the way.', { base: 17 }],
  [[0, 2, 2, 0], 'let go, home, gold -> home (lake, sunk)', CABIN_HOME, { base: 2, says: KNOCKS }],
  [[0, 2, 3, 1], 'let go, home, nothing -> dark (lake, the cabin line)', CABIN_DARK, { base: 5, says: KNOCKS }],
  [[0, 2, 1, 1], 'let go, home, hear -> dark (lake)', 'The lake keeps talking. You stop answering.', { base: 5 }],
  // Phase 9, the open sea: the fish wish waited out continues on the open sea (no shore) to every ending
  // but Stay; the gold sink leaves the fisherman in the water.
  [[0, 1, 0, 0], 'let go, fish (wait), forever -> home (sea)', 'The day does not end. You aren’t in it.', { wait: true, base: 3 }],
  [[0, 1, 1, 2], 'let go, fish (wait), hear -> cut (sea, heard)', 'and you start again there. ' + BAIT_END, { wait: true, base: 12, says: ['Back so soon? I’d only just got down. And this time?', 'The sea', 'You light the lantern.'], saysNot: ['The shore does not.'] }],
  [[0, 1, 0, 2], 'let go, fish (wait), forever -> cut (sea, not heard)', 'Dawn comes anyway, over nothing. ' + BAIT_END, { wait: true, base: 11 }],
  [[0, 1, 2, 2], 'let go, fish (wait), gold -> cut (sea, sunk)', BAIT_END, { wait: true, base: 13 }],
  [[0, 1, 2, 1], 'let go, fish (wait), gold -> dark (sea, sunk)', null, { wait: true, base: 8, has: 'You hang in the water beside the lantern until it gutters out.', says: ['Something gold circles you. It has time.'] }],
  [[0, 1, 2, 3], 'let go, fish (wait), gold -> deep (sea)', 'the big ones let you pass. There is no bottom.', { wait: true, base: 18 }],
  // Phase 17: the sunk variants of the kept and companion lines on Still water and Home.
  [[1, 3, 2, 2], 'keep, nothing, gold -> cut (lake, sunk, kept let go)', 'You let it go. It let you.', { base: 10, noPocket: true, says: ['You let the golden fish go.'] }],
  [[0, 0, 0, 2, 0, 2], 'let go, company (someone), gold, yes -> cut (lake, sunk, company)', 'Someone swims behind you. You do not ask.', { base: 10, noPocket: true }],
  [[0, 0, 0, 2, 0, 0], 'let go, company (someone), gold, yes -> home (lake, sunk, company)', 'The water behind you is empty now. It was your turn.', { base: 2 }],
];
let ok = true, snapsAll = 0, tAll = 0;
const seen = {};
for (const [plan, label, cardEnd, opts] of plans) {
  const r = play(plan, label, opts);
  ok = ok && r.ok;
  snapsAll += r.snaps; tAll += r.t;
  if (cardEnd && !r.text.endsWith(cardEnd)) { ok = false; console.log('   card should end with: ' + cardEnd); }
  if (opts && opts.has && r.text.indexOf(opts.has) < 0) { ok = false; console.log('   card should contain: ' + opts.has); }
  if (opts && opts.base && !r.text.startsWith(BASES[opts.base])) { ok = false; console.log('   card should start with situation ' + opts.base + ': ' + BASES[opts.base]); }
  if (r.id) seen[r.id] = true;
  if (r.id && !baitOk(r, opts)) { ok = false; console.log('   the bait sentence is ' + (r.id.startsWith('cut') && !(opts && opts.noPocket) ? 'missing from' : 'on') + ' the ' + r.id + ' card'); }
}
// One line per ending id (six, plus the silent variant of cut), then the verdict: every plan must end and
// all six ids must have been seen.
const need = ['home', 'dark', 'cut', 'stay', 'deep', 'swallowed', 'cut:silent'];
for (const id of need) console.log('ending ' + id.padEnd(11) + (seen[id] ? 'reached' : 'MISSING'));
console.log('reel with a ' + 0.35 + ' s reaction: ' + snapsAll + ' snaps over ' + plans.length + ' runs (' + (snapsAll / plans.length).toFixed(2) + ' a run), mean run ' + (tAll / plans.length / 60).toFixed(2) + ' min');
const missing = need.filter(id => !seen[id]);
if (missing.length) ok = false;
console.log(ok ? 'ALL ENDINGS REACHED' : 'SOMETHING STALLED');

// Checks the temporary test mode: one call to testCatch() must land a fish
// (or trigger the golden scene / red sequence) without playing the minigame.
const g = require('../src/game.js');
g.init();
g.setOut(new Uint32Array(g.W * g.H));

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
const dt = 1 / 30;
function tick(n) { for (let i = 0; i < n; i++) g.update(dt); }

// 1. With test mode off, testCatch is a no-op.
g.resetAll();
g.press(); g.release(); tick(3); // title -> ready
if (g.phase !== 'ready') fail('expected ready after title tap, got ' + g.phase);
g.testCatch(); tick(3);
if (g.phase !== 'ready') fail('testCatch should do nothing when test mode is off, phase=' + g.phase);

// 2. With test mode on, a skip does nothing until the boat has rowed in; then three skips reach the
// golden fish dialogue in act 0.
g.setTestMode(true);
g.testCatch(); tick(3);
if (g.phase !== 'ready' || g.STORY.catches !== 0) fail('a skip before the boat arrives should do nothing, phase=' + g.phase);
let skips = 0;
const t0 = Date.now();
let t = 0;
// 2a. Once the boat has arrived the narrator's first line waits in the panel; two presses read it through,
// then the bait bubble waits: a press dismisses it without casting, and no bubble is on a timer.
while (g.phase !== 'dialog' && t < 10) { tick(1); t += dt; }
if (g.phase !== 'dialog' || !g.DLG.cur || g.DLG.cur.text !== 'Nothing on the lake is moving except you.') fail('the opening line should wait in the panel after the row-in, phase=' + g.phase);
g.press(); g.release(); tick(1); g.press(); g.release(); tick(1);
if (g.phase !== 'ready' || !g.G.arrived) fail('two presses should read the opening line through to play, phase=' + g.phase);
if (!(g.G.t < g.G.thinkUntil)) fail('the bait bubble should be waiting after the opening line');
tick(150); t += 5;
if (!(g.G.t < g.G.thinkUntil)) fail('a waiting bubble must not time out');
g.press(); g.release(); tick(1);
if (g.phase !== 'ready' || g.G.cast || g.G.t < g.G.thinkUntil) fail('the dismissing press must only dismiss the bubble, phase=' + g.phase);
// 2b. Three skips land three fish and the fourth reaches the golden dialogue; the bubbles after the first two
// cards ('Look at that sun.', 'I could watch that sun forever.') are dismissed by the skip itself.
while (!(g.phase === 'dialog' && g.STORY.catches === 3) && t < 60) {
  const p = g.phase;
  if (p === 'ready' || p === 'card' || p === 'lost' || p === 'landing') { g.testCatch(); if (p === 'ready' && g.G.arrived) skips++; }
  else if (p === 'dialog') { g.press(); g.release(); }
  tick(1); t += dt;
}
if (g.phase !== 'dialog') fail('never reached the golden dialogue, phase=' + g.phase);
if (g.STORY.said !== 3) fail('expected the bait line and the two card bubbles to have shown (said 3), got ' + g.STORY.said);
if (skips !== 4) fail('expected 4 skips (3 fish + golden) before the dialogue, got ' + skips);
if (g.STORY.catches !== 3) fail('expected 3 catches, got ' + g.STORY.catches);

// 3. Skipping through the whole game with a fixed plan reaches an ending fast.
const plan = [1, 0, 0, 1, 0, 2]; // keep, company, someone, hear, yes, cut
let ci = 0, last = -1, sawRed = false, redSkip = -1;
while (g.phase !== 'end' && t < 400) {
  const p = g.phase;
  if (g.WS.sunKind === 1 && !sawRed) { sawRed = true; redSkip = skips; } // the red cinematic has begun
  if (p === 'ready' && g.G.arrived && g.STORY.act === 2 && g.STORY.goldenNext) skips++;
  if (t - last > 0.2) {
    if (p === 'ready' || p === 'card' || p === 'lost') g.testCatch();
    else if (p === 'dialog') { if (g.UI.choices) g.UI.choices[plan[ci++] || 0].cb(); else { g.press(); g.release(); } }
    last = t;
  }
  tick(1); t += dt;
}
if (g.phase !== 'end') fail('never reached an ending, phase=' + g.phase + ' act=' + g.STORY.act);
const ending = g.UI.log.filter(l => l[0] === 'ending').map(l => l[1].title);
console.log(`ending=${ending.join(',')} catches=${g.STORY.catches} wishes=${g.STORY.wishes.join(',')} simulated=${t.toFixed(0)}s real=${Date.now() - t0}ms`);
if (g.STORY.catches !== 7) fail('expected 7 catches over the run (kept: act 1 ends on a normal hook), got ' + g.STORY.catches);
// 3a. The act 2 golden skip reached the red sequence (the line dragged to the horizon, then the red sun).
if (!sawRed) fail('the act 2 skip never reached the red sequence');
const redLine = g.UI.log.filter(l => l[0] === 'dlgShow').length;
if (!redLine) fail('no dialogue was shown on the way to the red');

// 3b. During the ocean window a skip acts as a cast into the big one, so the choice is never bypassed.
g.resetAll(); g.press(); g.release(); tick(3);
const oplan = [0, 1]; // let go, fish
ci = 0; last = -1; t = 0;
let sawOcean = false;
while (g.phase !== 'end' && t < 200) {
  const p = g.phase;
  if (p === 'ocean') sawOcean = true;
  if (t - last > 0.2) {
    if (p === 'ready' || p === 'card' || p === 'lost' || p === 'ocean') g.testCatch();
    else if (p === 'dialog') { if (g.UI.choices) g.UI.choices[oplan[ci++] || 0].cb(); else { g.press(); g.release(); } }
    last = t;
  }
  tick(1); t += dt;
}
if (!sawOcean) fail('the fish wish never reached the ocean window');
const oend = g.UI.log.filter(l => l[0] === 'ending').map(l => l[1].id);
if (g.phase !== 'end' || oend[oend.length - 1] !== 'swallowed') fail('a skip in the ocean window should cast into the big one, got ' + g.phase + ' ' + oend.join(','));

// 4. Turning test mode off again hides the skip and stops the shortcut.
g.setTestMode(false);
g.resetAll(); g.press(); g.release(); tick(3);
g.testCatch(); tick(3);
if (g.phase !== 'ready') fail('testCatch leaked after test mode was turned off');
console.log('SKIPCHECK OK');

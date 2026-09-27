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

// 2. With test mode on, three skips reach the golden fish dialogue in act 0.
g.setTestMode(true);
let skips = 0;
const t0 = Date.now();
let t = 0;
while (g.phase !== 'dialog' && t < 60) {
  const p = g.phase;
  if (p === 'ready' || p === 'card' || p === 'lost' || p === 'landing') { g.testCatch(); if (p === 'ready') skips++; }
  tick(1); t += dt;
}
if (g.phase !== 'dialog') fail('never reached the golden dialogue, phase=' + g.phase);
if (skips !== 4) fail('expected 4 skips (3 fish + golden) before the dialogue, got ' + skips);
if (g.STORY.catches !== 3) fail('expected 3 catches, got ' + g.STORY.catches);

// 3. Skipping through the whole game with a fixed plan reaches an ending fast.
const plan = [1, 0, 1, 2]; // keep, company, hear, cut
let ci = 0, last = -1;
while (g.phase !== 'end' && t < 400) {
  const p = g.phase;
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
if (g.STORY.catches !== 6) fail('expected 6 catches over the run, got ' + g.STORY.catches);

// 4. Turning test mode off again hides the skip and stops the shortcut.
g.setTestMode(false);
g.resetAll(); g.press(); g.release(); tick(3);
g.testCatch(); tick(3);
if (g.phase !== 'ready') fail('testCatch leaked after test mode was turned off');
console.log('SKIPCHECK OK');

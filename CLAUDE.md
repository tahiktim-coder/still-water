# Still Water

A short procedural pixel-art fishing horror game in one self-contained HTML file, built for mobile portrait and itch.io.

The art style follows NakoFrish's "AM: The Verdant Reach" image: a blue fjord, big pixel cumulus with bright tops, a low white sun in the centre, a mirror-still lake, and a dark boat with curled prow and stern.

Premise: it starts as a calm fishing game, and a golden fish grants three wishes. Then the sun sets and a red eye-sun rises, hanging on a line from the sky. Every sun is bait, the mountains are teeth, and the player is the fish. There are three endings.

## Commands
- `npm install`: run once. It only installs the dev tools, pngjs and jsdom.
- `npm run build`: writes `dist/index.html` by inlining `src/game.js` into `src/template.html` at `/*GAME*/`. Never edit `dist/` by hand.
- `npm run sim`: a headless bot plays through every ending (plans are choice indices in menu order, listed at the top of `tools/sim.js`; a `{ wait: true }` option holds the bot through the ocean window). It must print `ALL ENDINGS REACHED`.
- `npm run shots`: renders scene states and ending frames to `tools/out/*.png`. Look at them after any visual change.
- `node tools/cloudshots.js`: renders the sky alone to `tools/out/clouds_*.png` (day at t 0 and 40 s, night, red, and the wrap seam at 20, 60 and 133 s) and times `render()` 300 times. Use it when touching the clouds.
- `npm run domtest`: plays the built page in jsdom with the canvas stubbed. It is slow and takes a few minutes.
- `npm run skipcheck`: verifies the temporary test mode below. It takes under a second.
- `npm run build:test`: writes `tools/out/test.html`, a copy of the game with test mode already on. Publish that file when someone needs to play through the story on a phone without fishing. It is gitignored and must never be uploaded to itch.io.

## Test mode (temporary)
Skips the fishing minigame so the story can be reached in seconds. Open `dist/index.html?test` (or `#test`), or press T in any build to toggle it. A dashed "Skip fish" button appears in the HUD; each click (or the S key) lands the next fish as if it had been reeled in, including the golden fish and the act 2 red sequence. Dialogue and cinematics still play normally. It lives in `setTestMode` and `testCatch` in `src/game.js`, next to `release()`, and is exported to `tools/`. Remove or hide it before the itch.io release.

## Rules
- The game stays a single HTML file, with no image or audio assets. All art is procedural and all sound is synthesised with WebAudio. The only external request is the Pixelify Sans Google Font, which has fallbacks.
- Everything is palette-indexed. Add colours as palette indices, never as raw RGB in the render path, so they recolour with the mood.
- Design for mobile first: portrait layout and tap/hold controls. Keep per-pixel work cheap, because `renderTop` and `computeWater` run every frame.
- UI copy is sentence case, short and eerie.

## Architecture (src/game.js)
The internal resolution is 216 wide by H tall. H ranges from 384 to 470, chosen from the screen aspect, and the image is upscaled with nearest-neighbour. The horizon row is `HY = 236` and the boat waterline is `WL = HY + 6`.

Palette: `buildPalette(mood, dim)` fills `PAL` (RGBA) and `PALRGB`.
- 0–11: the main ramp, blended day, then night, then blood as `WS.mood` goes 0, 1, 2. `dim` darkens it for the Dark ending.
- 12 bobber, 13–16 gold, 17 lantern, 18 fish eye, 19 black, 20 star, 21 red eyes, 22–23 bone, 24 eye glint (the dimmer pair under each pair of eyes). Each mood's values are in `ACC`.
- Sprite strings map characters to indices through `CH`: `0-9 a b` for the ramp, `R d g y w L E K S X` for accents, and `.` for transparent.
- `dith(f, x, y)` turns a continuous shade into an index, using Bayer dithering only near band edges.

Buffers:
- `MOUNT` is generated once in `init`. `CLOUDS` holds two cloud layers (the near cumulus at 3 px/s and the far wisps by the horizon at 1.1 px/s), each a strip `CW = 2W` wide that wraps. `CUMULUS` lists each cloud (layer, centre, flat base, size, bumps); `makeCumulus` builds it as a union of circles with a lifted top row, `cloudField` takes the signed distance to the silhouette (roughened by tiled noise so the strip wraps) and `shadeCloud` lights it: a 2 to 4 px band of index 11 along the upper contour facing the sun, a softer band under it, a mid body, a flat dark base, Bayer dither only at tone edges. `renderTop` samples the layers with a per-layer offset from `cloudT` (which stops while `WS.frozen`), and `KCOR` cuts the fixed sun corridor at sample time so it never drifts with them.
- `TOP` holds the sky, sun, clouds and mountains above the horizon.
- `FRAME` is `TOP` plus the mirrored water.
- `SPR` holds sprites, with 255 meaning transparent.
- `IDX` holds the final indices, and `OUT32` is the RGBA written to the canvas.

Frame order in `render(t)`:
1. Palette.
2. `renderTop`.
3. `topExtras`: stars, birds, cabin and the stalk line.
4. `computeWater`: the mirror with per-row ripple `RIPX`, plus glints.
5. Rings, fish shadows and the eyes (`drawEyes`, in the water, never reflected).
6. Sprites with reflections, via `plotR` and `stampR`.
7. `composite`, which includes the jaw shift.
8. `drawFangs`.
9. `drawUIPix`: the bite marker and reel bar.
10. RGBA conversion.
11. `applyGlows`: lantern and cabin light.

State:
- `WS` holds the world and mood. Each visual beat is a numeric field, such as `mood`, `sunY`, `sunKind`, `pupil`, `stalk`, `jaw`, `lantern`, `ash`, `companion`, `cabin` and `gold`. Animate them with `tween(obj, key, to, dur, ease, done)`; `untween` cancels one. Phase 3 fields: `far` (the ocean pull-back: the mountains sink and blend into the sky through `mountShift`, the boat slides to the centre and swaps to `BOAT_FAR2`, `BOAT_FAR4` and a speck past 0.5, rod, line, float, lantern, birds and the sky fish hidden), `shoreShift` (px the shore sits lower after the ocean, `cabinY` follows), `swallow` and `boatDrop` (the Swallowed circle and the fall). `OCEAN` holds the ocean shoal and the big one (`bigShape`, `drawBigShadow`). Phase 2 fields: `frozen` (the forever wish via `freezeDay`: cloud time, birds and fish jumps stop, cleared at the still-water dawn), `eyes` (the act 2 look from the water, `eyesLook`, once per run through `G.eyesDone`; reused for one beat in `CINE_DARK`), `farBoat` (the title's far boat after any finished run, stamped into `TOP`). The opening row-in lives in `openingUpdate` (`G.open`, `G.arrived` gates the first cast and the test skip); it starts at `ROW_FROM` -208 (off screen; the bible's -120 leaves the boat on screen) after a 0.4 s dip to black. The eyes' positions come from `mulberry32(RUN.count + 7)`, so shots are deterministic.
- `G` is the fishing state machine. Its phases are title, ready, casting, waiting, bite, reeling, landing, card, lost, dialog, cine, ocean (the cast-or-wait window) and end. The only inputs are `press()` and `release()`.
- `STORY` holds the act (0–2), catches, `wishes` (granted wishes only, in order), `heard`, `goldenNext`, and the bible's flags: `kept`, `firstAsk` ('company' | 'fish' | 'home' | 'nothing'), `refused` (0–2), `answered` (null | true | false), `ocean` ('none' | 'waited' | 'swallowed'), `said` (how many of the fisherman's three lines have shown), `usedRepl` (keys of the card replacements that have fired this run). Also `casts` (for the opening captions) and `shown1` (species whose act 1 card was shown, so act 2 picks another). `freshStory()` is the reset shape.
- `RUN` holds `count` (completed runs, from localStorage `stillwater-runs` plus this session) and `last` (the last ending id, `stillwater-last`). `isLaterRun()` gates the second-run lines. It is reloaded in `resetAll`, and `showEnding` bumps it.

Fishing loop:
- Cast, then nibbles, then a bite. The bite window is 0.95 s, or 3.2 s for the golden fish.
- Hold to reel. Tension `reel.T` rises while holding, surges spike it, and it falls on release. The line snaps at 1.
- When progress `reel.p` reaches 1 the fish lands and a card appears.
- Species are in `SPECIES` and per-act descriptions are in `DESC`.

Story (the script is `docs/story.md`; phase 1 of its build plan is in, text and state only, copy verbatim from the bible):
- Captions go through `cap(text, dur, style)`, which tracks the end time in `G.capUntil`. The fisherman's three lines are quoted 'said' captions (`saidBeat`): they fire when the first cast lands and after the first and second cards close (`OPENING_CAPS`), wait in `G.saidPending` if another caption is on and carry over to the next beat, hide the prompt (`refreshPrompt`) and hold nibbles and bites while on screen (`G.saidUntil`), and count in `STORY.said`.
- Act 0 needs 3 catches, then golden scene 1 (`wish1`, `wish1b`): `greeting1` gives the later-run first line (from `RUN`), then Let it go / Keep it (`STORY.kept`, text and state only for now; the boat fish is phase 3), then wish 1: company (the "Who?" exchange), fish (`CINE_OCEAN`, then the 'ocean' phase: a press or a test skip within `OCEAN_WINDOW` casts into the big one, `CINE_SWALLOW` and the Swallowed ending; waiting plays `CINE_OCEAN_BACK`, sets `shoreShift` and spawns the shoal), home, or Nothing (`refuse1`). A granted wish drops the sun in two steps (`sunDrop`) as the cost line begins, with no caption.
- Act 1 needs 2 catches, then golden scene 2 (`greeting2`: kept and refused once > kept > refused once > default), then wish 2: forever (`WS.frozen`, starless sunset), hear, gold, or Nothing (`refuse2`). Then `sunsetCine(refused)`, and if company, the companion's question (`companionQuestion`, `STORY.answered`, the wrong question mark via `mark`).
- Act 2 needs 1 catch (species picked from those whose act 1 line was not shown). The golden hook triggers `redSequence` (`redLines` per released / kept / refused twice, the two-second hold), then `CINE_RED` (companion turn and pupil slide inside it; if heard, the lake's line is a labelled 'The lake' whisper in the dialogue panel through `lakeWhisper`, hidden again at 12.4 s), then `wish3` (the bible's ordered list; `recountLine` is one line ending "And the sun you wanted. Your words, not mine."; `wish3Choices`).
- The companion (bible, section 6): a pointerdown on the stage is mapped to internal pixels and, if `companionHit` says it landed on him (his sprite box padded by `COMP_PAD`, only in 'ready', or in the red once turned while the last choices show), `companionTap` shows one said-style caption from `COMP_LINES` (`compPool`: day, night, or the single red line; `STORY.tap` and `tapPool` track the position; `COMP_LATER` is the later-run first line) instead of `press()`. Keyboard, the sim and `testCatch` call `press()` bare. `compSprite` picks `COMP`, `COMP_TURN` (the red, index 21 eyes) or `COMP_FACE` (`WS.companionFace`, lantern eyes, Stay only).
- The endings are Home (`CINE_JAWS`), Dark (`CINE_DARK`), Swallowed (`CINE_SWALLOW`, act 0 only), Stay (`CINE_STAY`, only offered when `STORY.answered === true`: he faces the fisherman, `boatX` drifts to `STAY_DRIFT_CABIN` or `STAY_DRIFT_SHORE`, `WS.lanternWarm` widens the glow in `applyGlows`, `G.hbGap` stretches the heartbeat until it stops, fade over the last 3 s), Still water (`cutCine(false)`, no caption; the released sky fish drops with a splash via `goldFishDrop`) and Silent (`cutCine(true)`, "The line goes slack.", counts as 'cut'). Home and Dark carry the released "Something gold" captions. `composeEnding` builds the card: base + one variant sentence (`END_VARIANTS`, `endingVariant`: kept > one refusal, Still water only > wish order > refused twice) + the "You asked for" line (`askedLine`, with the one-refusal header). `ENDING_COUNT` is the "of N" on the counter. Endings found are saved in localStorage under `stillwater-endings`.
- Cards: `cardLine` applies the bible's conditional replacements over `DESC`: one per card, first match wins, each at most once per run through `once(key, text)` and `STORY.usedRepl`; after the later-run 'lip' line `pickSpecies` excludes the perch in act 1. `VOICE` is keyed to `STORY.firstAsk` on the act 2 card when heard.

Dialogue: `dlgRun(lines, done)`. A line is `{who, text, style, choices, mark}`, `{act: fn}` or `{pause: seconds}`. The styles are '', 'narr', 'whisper' and 'red'. Choices are `{label, pick}`; a choice whose `pick` does not start a new `dlgRun` lets the list continue, so choices can sit mid-scene. `mark` flips the trailing question mark (the companion's question). `UI.caption(text, dur, style)` accepts 'whisper' and 'said'; call it through `cap`. The dialogue panel is capped at 46% of the stage with the text scrolling, so up to six buttons never cover the companion.

Cinematics: `playCine(def, done)`, where `def = {dur, init(s), update(t, dt, at, s)}` and `at(key, time, fn)` fires once.

Audio: `SFX` synthesises every sound. The audio context is created and unlocked on the first user gesture.

UI: the DOM overlay lives in `src/template.html` and is wired up in `makeUI()`. `UI.colors()` pushes the live palette into CSS variables. In Node, `stubUI()` replaces it and `module.exports` exposes the engine to `tools/`.

## Known issues
- Home ending: the jaw composite leaves a horizontal seam mid-screen, which the darkening and fangs mostly hide.
- Upscaling isn't an integer multiple on some screens, so pixel sizes are slightly uneven.
- The keyboard controls (Space/Enter, and 1–6 for choices) are only lightly tested.

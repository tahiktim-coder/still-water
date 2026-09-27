# Still Water

A short procedural pixel-art fishing horror game in one self-contained HTML file, built for mobile portrait and itch.io.

The art style follows NakoFrish's "AM: The Verdant Reach" image: a blue fjord, big pixel cumulus with bright tops, a low white sun in the centre, a mirror-still lake, and a dark boat with curled prow and stern.

Premise: it starts as a calm fishing game, and a golden fish grants three wishes. Then the sun sets and a red eye-sun rises, hanging on a line from the sky. Every sun is bait, the mountains are teeth, and the player is the fish. There are three endings.

## Commands
- `npm install`: run once. It only installs the dev tools, pngjs and jsdom.
- `npm run build`: writes `dist/index.html` by inlining `src/game.js` into `src/template.html` at `/*GAME*/`. Never edit `dist/` by hand.
- `npm run sim`: a headless bot plays through every ending. It must print `ALL ENDINGS REACHED`.
- `npm run shots`: renders scene states and ending frames to `tools/out/*.png`. Look at them after any visual change.
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
- 12 bobber, 13–16 gold, 17 lantern, 18 fish eye, 19 black, 20 star, 21 red eyes, 22–23 bone. Each mood's values are in `ACC`.
- Sprite strings map characters to indices through `CH`: `0-9 a b` for the ramp, `R d g y w L E K S X` for accents, and `.` for transparent.
- `dith(f, x, y)` turns a continuous shade into an index, using Bayer dithering only near band edges.

Buffers:
- `MOUNT` and `CLOUD` are generated once in `init`.
- `TOP` holds the sky, sun, clouds and mountains above the horizon.
- `FRAME` is `TOP` plus the mirrored water.
- `SPR` holds sprites, with 255 meaning transparent.
- `IDX` holds the final indices, and `OUT32` is the RGBA written to the canvas.

Frame order in `render(t)`:
1. Palette.
2. `renderTop`.
3. `topExtras`: stars, birds, cabin and the stalk line.
4. `computeWater`: the mirror with per-row ripple `RIPX`, plus glints.
5. Rings and fish shadows.
6. Sprites with reflections, via `plotR` and `stampR`.
7. `composite`, which includes the jaw shift.
8. `drawFangs`.
9. `drawUIPix`: the bite marker and reel bar.
10. RGBA conversion.
11. `applyGlows`: lantern and cabin light.

State:
- `WS` holds the world and mood. Each visual beat is a numeric field, such as `mood`, `sunY`, `sunKind`, `pupil`, `stalk`, `jaw`, `lantern`, `ash`, `companion`, `cabin` and `gold`. Animate them with `tween(obj, key, to, dur, ease, done)`.
- `G` is the fishing state machine. Its phases are title, ready, casting, waiting, bite, reeling, landing, card, lost, dialog, cine and end. The only inputs are `press()` and `release()`.
- `STORY` holds the act (0–2), catches, wishes, `heard` and `goldenNext`.

Fishing loop:
- Cast, then nibbles, then a bite. The bite window is 0.95 s, or 3.2 s for the golden fish.
- Hold to reel. Tension `reel.T` rises while holding, surges spike it, and it falls on release. The line snaps at 1.
- When progress `reel.p` reaches 1 the fish lands and a card appears.
- Species are in `SPECIES` and per-act descriptions are in `DESC`.

Story:
- Act 0 needs 3 catches, then the golden fish offers wish 1: company, fish or home.
- Act 1 needs 2 catches, then wish 2: forever, hear or gold. This is followed by `CINE_SUNSET`.
- Act 2 needs 1 catch. The golden hook triggers `redSequence`, then `CINE_RED`, then `wish3`, whose lines depend on the earlier wishes.
- The endings are Home (`CINE_JAWS`), Dark (`CINE_DARK`) and Still water (`CINE_CUT`). Endings found are saved in localStorage under `stillwater-endings`.

Dialogue: `dlgRun(lines, done)`. A line is `{who, text, style, choices}`, `{act: fn}` or `{pause: seconds}`. The styles are '', 'narr', 'whisper' and 'red'. Choices are `{label, pick}`.

Cinematics: `playCine(def, done)`, where `def = {dur, init(s), update(t, dt, at, s)}` and `at(key, time, fn)` fires once.

Audio: `SFX` synthesises every sound. The audio context is created and unlocked on the first user gesture.

UI: the DOM overlay lives in `src/template.html` and is wired up in `makeUI()`. `UI.colors()` pushes the live palette into CSS variables. In Node, `stubUI()` replaces it and `module.exports` exposes the engine to `tools/`.

## Known issues
- Home ending: the jaw composite leaves a horizontal seam mid-screen, which the darkening and fangs mostly hide.
- Upscaling isn't an integer multiple on some screens, so pixel sizes are slightly uneven.
- The keyboard controls (Space/Enter, and 1–3 for choices) are only lightly tested.

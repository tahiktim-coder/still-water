# Still Water

A short fishing tale. **Play it here: https://tahiktim-coder.github.io/still-water/** (best on a phone in portrait). You can also open `dist/index.html` in a browser.

Testing the story? **https://tahiktim-coder.github.io/still-water/test.html** is the same game with a Skip fish button: each tap lands the next fish, so you can reach any wish and ending in a couple of minutes.

In Russian (Тихий омут): **https://tahiktim-coder.github.io/still-water/ru/**, and the test build **https://tahiktim-coder.github.io/still-water/ru/test.html**. Each language has its own page; the RU and EN link on the title switches between them.

Controls: tap to cast, then tap when the float goes under. Hold to reel, and let go before the line snaps. When the golden fish speaks, tap to read on and pick an answer. Someone in the boat can be tapped too.

A run takes about four minutes and ends one of seven ways (Home, Dark, Still water, Stay, Deep, Swallowed, Inside), depending on what you ask for and what you keep. The endings you have found are counted on the title.

## Develop
```
npm install
npm run build
```
To work on it with Claude Code, run `claude` in this folder. `CLAUDE.md` explains how the engine works.

To build the Russian pages, run `node build.js --lang=ru` (add `--test` for the test build); they land in `tools/out/ru/`. `npm run build:site` builds all four published pages into `site/`.

While developing, run `npm run build:test` and open `tools/out/test.html?test`, or press T in that build, to turn on test mode (the shipping `dist/index.html` has none). A "Skip fish" button then lands each fish with one click so you can reach any part of the story quickly.

## Publish on itch.io
1. Run `npm run build`.
2. Zip `dist/index.html`. The zip must have `index.html` at its root.
3. Create a new project, set Kind to HTML, upload the zip and tick "This file will be played in the browser".
4. Under embed options, set the viewport to 405 × 720 and tick "Mobile friendly" (portrait) and "Fullscreen button".

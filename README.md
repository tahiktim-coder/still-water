# Still Water

A short fishing tale. To play, open `dist/index.html` in a browser. It's best on a phone in portrait.

Controls: tap to cast, then tap when the float dips. Hold to reel, and let go before the line snaps. When the golden fish speaks, tap to read on and pick an answer. Someone in the boat can be tapped too.

A run takes about four minutes and ends one of six ways (Home, Dark, Still water, Stay, Deep, Swallowed), depending on what you ask for and what you keep. The endings you have found are counted on the title.

## Develop
```
npm install
npm run build
```
To work on it with Claude Code, run `claude` in this folder. `CLAUDE.md` explains how the engine works.

While developing, open `dist/index.html?test` or press T in the game to turn on test mode. A "Skip fish" button then lands each fish with one click so you can reach any part of the story quickly.

## Publish on itch.io
1. Run `npm run build`.
2. Zip `dist/index.html`. The zip must have `index.html` at its root.
3. Create a new project, set Kind to HTML, upload the zip and tick "This file will be played in the browser".
4. Under embed options, set the viewport to 405 × 720 and tick "Mobile friendly" (portrait) and "Fullscreen button".

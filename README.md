# Still Water

A short fishing tale. To play, open `dist/index.html` in a browser. It's best on a phone in portrait.

Controls: tap to cast, then tap when the float dips. Hold to reel, and let go before the line snaps.

## Develop
```
npm install
npm run build
```
To work on it with Claude Code, run `claude` in this folder. `CLAUDE.md` explains how the engine works.

## Publish on itch.io
1. Run `npm run build`.
2. Zip `dist/index.html`. The zip must have `index.html` at its root.
3. Create a new project, set Kind to HTML, upload the zip and tick "This file will be played in the browser".
4. Under embed options, set the viewport to 405 × 720 and tick "Mobile friendly" (portrait) and "Fullscreen button".

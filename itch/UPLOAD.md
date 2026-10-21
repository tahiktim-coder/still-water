# Still Water: upload to itch.io

English only, free. Copy the text for each field from `PAGE.md`.

## Before you start
1. In the project folder, run `npm run itch`. It writes `itch/still-water.zip`, which holds one `index.html` (about 94 KB). Upload this zip. Do not upload a zip of `dist/index.html`: that page has the RU link on the title, and the Russian page does not exist on itch.

## Create the project
2. On itch.io, sign in, open the arrow next to your name (top right) and choose **Upload new project**.
3. **Title**: `Still Water`. Leave the **Project URL** as `still-water`.
4. **Short description or tagline**: paste the tagline.
5. **Classification**: Games. **Kind of project**: HTML.
6. **Release status**: Released.
7. **Pricing**: No payments.
8. **Uploads**: click **Upload files**, pick `itch/still-water.zip`, then tick **This file will be played in the browser**.
9. **Embed options**, which show once the zip is in:
   - **Viewport dimensions**: 432 × 768. That is exactly 2× the game's pixels, so they stay sharp. 405 × 720 also works if you want the embed shorter.
   - **Frame options**: tick **Mobile friendly** and set **Orientation** to Portrait. Tick **Fullscreen button**. Leave **Enable scrollbars** and **SharedArrayBuffer support** unticked. **Automatically start on page load** is up to you: nothing plays before the first tap, so ticking it is safe and saves desktop players one click.
10. **Description**: paste Description, then Controls, Content note and Credits, each under its own heading.
11. **Genre**: Interactive Fiction. **Tags**: the ten in `PAGE.md`.
12. **AI generation disclosure**: the code was written with Claude, so answer Yes and tick what applies. It's your call; see the note in `PAGE.md`.
13. Fill in the other details further down if you want them: Inputs (Mouse, Keyboard, Touchscreen), Average session (A few minutes), Languages (English).
14. **Community**: Comments.
15. **Visibility & access**: leave it on **Draft** for now.
16. In the right-hand column, under **Cover image**, upload `cover_b.png`. Use `cover_a.png` instead if you'd rather keep the red sun a surprise.
17. Under **Screenshots**, add `shot_1`, `shot_2`, `shot_3`, `shot_5`, then `shot_4`, so the red sun comes last.
18. Click **Save & view page**.

## Check the draft page
19. On a desktop browser: click **Run game** (unless it starts on its own), then tap. Check that:
    - the sound starts on the first tap;
    - the text uses the game's serif (Literata), not a plain fallback;
    - there is no RU link on the title;
    - a fish lands and its card shows.
    Then try the Fullscreen button.
20. On your phone, held upright, open the same page (signed in, since it's a draft). Tap **Run game**: it opens fullscreen in portrait. Catch one fish.
21. Optional: **Edit theme** and set the page background to `#0a1a33`, the game's night blue, so the embed doesn't sit in a white page.

## Publish
22. **Edit game**, set **Visibility & access** to **Public**, then **Save**.

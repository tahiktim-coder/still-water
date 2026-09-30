# Still Water, story bible (draft 5)

This is the spec the game is built from. When code and this file disagree, fix one of them the same day. Lines are final copy unless marked (draft).

## 1. What it is about

Being unable to let go of a good day. The lake is the day. Still water is water that does not move on.

Two readings must both fit every scene, and the game never picks one:

- The lake has one angler. Its lure is the sun, its line is the thin dark stalk you only see at night, its jaw is the mountains. It does not fish with hooks. It fishes with wanting. The golden fish is not the angler. It is the last catch, sent back up to talk the next one in.
- One man, alone, comes back to the same lake and the same afternoon, wanting the same things. The voice in the water sounds like his own. The red sun is the sunset he stares at until it looks back.

Each wish quietly borrows a figure from Slavic water lore, never named: Pushkin's golden fish and its refrain, the rusalka who sits with you and asks one question, the light on the shore that leads travellers astray, the vodyanoy's hoard and the drowned he keeps as fish, Viy's eyelids and the rule that if you don't look it can't see you, Sadko who goes down for the gold.

### Why the fish brings the sun

The player must see this chain, so it is said three times in plain words. It starts with the bait:

0. The fisherman was given a bait by a stranger who called it cursed or blessed. It has an eye, as lures do. He casts it with a throwaway thought, `Something interesting, for once.` The bait takes wishes literally: the golden fish surfaces and its second line is `Something interesting, you said. Here I am.` From then on everything he thinks near that bait is an order.
1. The fisherman, act 0: `I could stay out here forever.`
2. The fish quotes it after wish 1 (`You said you could stay out here forever. You'll get to.`) and promises after wish 2 (`You'll miss the sun. I'll bring you another.`), on every path including refusals.
3. The fish delivers it: `But first, the sun I promised you.` / `You said forever. I listened.` and opens wish 3 with `There it is. Forever, like you said.`

The recount at wish 3 always ends with `And forever.`

## 2. Rules for copy

- Sentence case. Short. Eerie. Dialogue under 90 characters (the wish 3 recount may run to 125), captions under 60, card lines under 60. This file writes apostrophes straight; the game renders every one as the typographic ’.
- The fisherman never speaks in the fish's panel and never in the caption strip. His lines appear in a THOUGHT BUBBLE (section 4b): a thin comic-book bubble with small text, floating above him to the right, with a tail of small circles down to his head. He thinks four lines of his own in act 0 (the bait, the throwaway wish, the sun twice). A tapped choice is already his line and is never echoed in the bubble. Everything else quotes him. The companion's lines use the same bubble on his side of the boat. Narrator captions stay in the caption strip, no quotes.
- The golden fish is polite, patient and never lies. It gives exactly what was asked for and reads the player's own words back as consent. It never threatens. It is never rude, only accurate. Its rules begin with "Nobody".
- Never say memory, remember, past, stuck, grief, nostalgia, lure, or "you are the fish". "Bait" appears once in dialogue, at wish 3. The Dark ending's base card keeps its own "bait" because it shipped that way.
- No line explains a metaphor the picture already shows.
- No empty sentences. Every fish line must do at least one of three jobs: move the scene, quote the player, or show character. Two lines that can be one line are one line. The fish never says "just cast", "watch" or "done" on its own.
- Callbacks, not forks. A choice matters because a later line proves the game saw it.
- Budget: wish 3 is at most seven lines before the buttons and usually five. A full run stays under seven minutes (measured in phase 7: the longest path, kept, company, gold, answered, then Cut, runs about 3 min 50 s at 0.6 s between taps and 42 characters a second plus 0.8 s per line).

## 3. State

`STORY` gains: `kept` (bool), `firstAsk` ('company' | 'fish' | 'home' | 'nothing'), `refused` (0 to 2), `answered` (null | true | false), `ocean` ('none' | 'waited' | 'swallowed'), `said` (0 to 4, how many of the fisherman's act 0 lines have shown), `usedRepl` (set of card replacements already fired this run), `tap` and `tapPool` (how many of the companion's current line pool have shown, and which pool it was; the code uses these instead of a per-act `compTaps`), `keptNext` (kept, act 1: the next normal card closes into golden scene 2), `casts` (for the opening captions), `shown1` (species whose act 1 card showed, so act 2 picks another). Existing: `wishes[]` (granted wishes only, in order), `heard`, `goldenNext`, `actCatches`, `lastSpecies`. Saved across runs: `stillwater-endings` (list), `stillwater-runs` (count), `stillwater-last` (the last ending id).

`WS` gains: `goldKept` (0 to 1, the fish in the boat; alpha ladder 1.0 in act 0, 0.7 in act 1, 0.45 in act 2, 0.05 after the silent ending), `boatSunk` (0 to 1, the gold sink), `frozen` (0 or 1, clouds and birds stop), `far` (0 to 1 and back, the ocean camera pull-back), `sea` (0 to 1, the mountains gone; set once by the ocean and held at 1 for the rest of the run), `eyes` (0 to 1, the water full of eyes), `farBoat` (0 or 1, title only), `bulge`, `lunge`, `gape`, `gulp`, `streak`, `shed` and `slosh` (the Swallowed lunge: the water heaving round the speck, the head rising, its lower jaw dropped open, the boat tipping in, the water pouring off the jaw, the sheets sliding off the snout, the water closing over it), `companionFace`, `lanternWarm`, `companionCrouch`, `cling`, `strain` and `eyeWide` (Stay), `dive` and `glint` (Deep), `shoalOut` (the still-water dawn: the shoal leaves as it reaches the horizon).

Endings: `home`, `dark`, `cut`, `stay`, `deep`, `swallowed`, `inside` (phase 30). Silent is a variant of `cut`. The counter says "of 7". `ENDINGS` becomes a composer: base + one variant sentence + the asked-for list; `UI.ending` receives `{title, text, asked}` and the template gets an `#endAsked` block under the text.

## 4. The script

Speaker labels: **narr** is the unnamed narrator caption, **Fisherman** is a thought bubble by the fisherman (section 4b), **Golden fish** is the fish in the dialogue panel in every act including the red, **Companion** is a bubble by the companion, **The lake** is whisper style in the dialogue panel (labelled **The sea** on a fish-wish run, where the lake is gone for good).

### 4b. The thought bubble

A DOM element over the stage, not drawn in pixels. Thin one-pixel outline in the UI ink colour, a near-transparent fill, a rounded cloud outline (three or four bumps), and a tail of two small circles leading down and left toward the fisherman's head. Text is small (about two thirds of the panel's size), sentence case, no quotation marks, and a tiny label `Fisherman` sits on the bubble's upper edge in the same size. It sits above and to the right of the fisherman so the mountain is behind it: anchor about x 150, y 186 in internal pixels, converted to stage percentages from the live stage size (the boat's position is fixed, the stage height is not), width about 40% of the stage. It never overlaps the fish's panel: when a bubble is up, the panel is hidden, and the reverse.

Three uses:
1. **His own lines** (the four in act 0): the bubble fades in with the text already complete and STAYS UNTIL A TAP (a tap in its first 0.8 s is ignored, and the ▾ lights only after that, so a reflex tap cannot dismiss it unread), never on a timer, with the same small ▾ marker the fish's panel uses. The tap that dismisses it does nothing else (it does not cast). No prompt and no bite while it is up. The companion's tapped lines behave the same way. No bubble is on a timer, with one exception: his one word in the Stay cinematic (`Stay.`, section 8), which shows for about 1.4 s while he crouches, with no ▾, and hides as he launches; it is inside a cinematic, so no tap is waited for.
2. **No choice echo.** A tapped choice is already his line; it is never repeated in the bubble. The bubble shows only what he thinks unprompted. (An earlier draft echoed the tapped label; it read as the game repeating a menu item and was removed.)
3. **The companion**: the same bubble, no label, tail toward the companion, anchored above and to his left (about x 160, y 190; in the red, where the eye hangs there, lower and right of the disc, its bottom at about y 205, so it never covers the eye), for every line in section 6 and for `Will you stay?` (the wrong question mark stays). His question is the one bubble that waits for a choice: the two answers appear as buttons under the bubble.

### Title

Unchanged text. Two silent additions: three bone pixels of a knife on the gunwale beside the lantern, and the stern seat drawn as an empty plank. After any ending has been reached, a far boat sits on the lake: 8 px, both ends curled, in hazy mid tones on the bright horizon under the sun (x 97), with its reflection. Under the endings counter (here and on every ending card) the six ending titles are listed in order, Home, Dark, Still water, Swallowed, Stay, Deep, with a dash for each one not found yet; the silent variant counts as Still water.

### Opening

The boat rows in from the left at dawn while the title fades (a short dip to black, then `boatX` from -208, off screen, to 0 over 4 s). Casting is not possible until it arrives. Captions, one per beat, in pace with play:

- When the boat has arrived, narr, in the dialogue panel, waiting for a tap: `Nothing on the lake is moving except you.` (not a timed caption: the player must be able to read it).
- Then, before the first cast, Fisherman (bubble): `The stranger's bait. Cursed or blessed, he said. It has an eye.` The bait on the hook is drawn for all of act 0 as two pixels: gold (index 16, the bright end of the gold ramp) with one dark pixel beside it, the eye. Real lures have painted eyes, so it is fair; and when the red sun opens its eye on a line at the end, it is this bait, enlarged. Nobody says so.
- When the first cast lands, Fisherman (bubble): `Something interesting, for once.`
- After the first card closes, Fisherman (bubble): `First time out here. Look at that sun.`
- After the second card closes, Fisherman (bubble): `I could stay out here forever.`

On a later run act 0 has two catches, not three (the replay is shorter), so the last line moves: `I could stay out here forever.` shows when the second cast lands instead of after the second card, and all four still show before the still caption.

These four are his only lines before the fish surfaces. `First time here.` is no longer said by him; the fish still says `First time here, you said.` because he thought it, and that is the point.

While a bubble is on screen the tutorial prompt is hidden and no nibble or bite happens, so two texts never share the stage. A line that did not get to show carries over to the next beat. `STORY.said` counts them.

### Act 0, day. Three catches (two on a later run).

Prompts and fail copy unchanged, with two changes: the bite prompt is `Tap now` (no exclamation mark), and the first snap of each run says `The line snapped. Let go when it pulls.` (after that, `The line snapped.`). The very first bite of a run stays up about 1.3 s instead of 0.95 s. Letting go costs a little progress (0.15 a second), and the golden fish reels heavy (d 1.0) under its tension cap, so it cannot snap. After catch 3: `The water goes very still.` The golden cast is as coded (sparkles, long bite, no fight).

#### Golden scene 1

The fish surfaces at the left. Splash, rings, chime. Three seconds of total silence before it speaks.

- Golden fish: `Wait. Don't gut me, fisherman.` On a later run this line is `You again. Or someone wearing you.`; if the last ending was Home: `Back out already? It doesn't usually let go.`; if it was Still water (`cut`, not the silent variant, which is stored as `cut:silent`): `You cut the line last time. It's the same line.`
- Golden fish: `Something interesting, you said. Here I am.`
- Golden fish: `Put me back and I'll grant you a wish. Three, if you're patient.`
- Choice: **Let it go** / **Keep it**

Let it go:
- Golden fish: `Kind. Nobody kind comes out this far alone.`

Keep it (`kept = true`; the fish is lifted into the boat as a small gold shape beside the gold-pile slot and stays there for the rest of the run):
- narr: `You lift it into the boat. It is heavier than a fish.`
- Golden fish: `Cold hands. He had cold hands too.`
- Golden fish: `Keep me, then. The wish comes anyway.`

Both:
- Golden fish: `First time here, you said. Nobody comes here twice.` On a later run: `First time here, you said. You said that last time too.` (the fish never lies, and it has just said "last time")
- Golden fish: `What would you like, fisherman?`
- Choice: **Someone to sit with me** / **Take me where the fish are** / **A home on the shore** / **Nothing**

#### Wish 1 grants

Someone to sit with me:
- Golden fish: `Who?`
- Choice (one option): **Doesn't matter. Someone**
- The companion fades onto the empty plank, facing the horizon. Chime.
- Golden fish: `Someone. You didn't ask who.`
- Golden fish: `If they ask you anything, don't answer.`

Take me where the fish are:
- Golden fish: `Where the fish are. I know a spot. Hold on to something.`
- The ocean cutscene (section 8): the shore sinks into haze, the boat shrinks to a speck on a vast lit sea, huge shapes pass beneath, one stops under the boat.
- Golden fish, as the big one settles: `Here. I wouldn't cast while it's under you. It's been waiting longer than you have.`
- A window of about 10 s: casting is a choice made against his warning, and the player must know a tap casts. The first second ignores taps, so the tap that dismisses the warning cannot also cast; after it the prompt `Tap to cast` shows as usual, and a small pale ring pulses on the big one's back directly below the boat speck, where the float would land. Cast into it and the Swallowed ending plays. Wait, and it slides away.
- The camera comes back to the boat, but the shore does not come back. The rest of the run is played on the open sea: no mountains, the horizon a clean line, the huge shapes still passing beneath toward the horizon for the rest of the game, through the sunset, the red sun and every ending. Bites come faster for the rest of the game.
- Golden fish: `Look how they all go the same way.`

A home on the shore:
- The cabin lights on the far shore, directly under the sun.
- Golden fish: `A home on the shore. One has just come free.`
- Golden fish: `Every light out here is for someone. That one is for you.`
- Someone is in it (phase 23). Nobody is ever seen: only three slow knocks from the shore in act 1 and again, slower, in act 2, the window blinking dark with each one, and the ending cards pay it off.

Nothing (`refused = 1`, `firstAsk = 'nothing'`):
- pause 1.2 s
- Golden fish: `Nothing. Nobody asks for nothing. I'll ask again.`
- Golden fish: `You said you could stay out here forever. There's time.`
- The fish dives (if kept, the boat fish stays bright). No cost. Caption: `The lake stays glass.` Straight to act 1.

After any granted wish, the sun starts dropping as the first line begins, so the cost is spoken while the sun is visibly moving:
- Golden fish: `A wish costs a little daylight. You said you could stay out here forever.`
- Golden fish: `You'll get to.`
- The fish dives (if kept, the boat fish dims to 0.7). The sun drops in two visible steps, about 16 px over 5 s, so it sits clearly lower in the gap between the far ranges and its reflection shortens; it does not need to touch a ridge. Check it in shots. `troubled` to 0.22. No caption: the drop is the sentence.

### Act 1, low sun. Two catches.

Cards from section 5. The companion can be tapped (section 6). Home path only: after the first catch's card closes, three slow knocks (`SFX.knock`, a short low muffled thump, about 0.55 s apart; the cabin window blinks dark with each) and the narr caption `Someone knocks on the cabin door.` It waits for the stage like any text. After catch 2:

- released: `The water goes very still again.`
- kept: `The water goes very still. The fish in the boat does not.` (shown when the next card closes, right before `You cast anyway. Habit.`, not a catch earlier)

Released: the golden cast as before. Kept: the next hook is a normal fish (no sparkles, no chime), normal card, and when the card closes the fish speaks from the boat with no surfacing splash.

#### Golden scene 2

Greeting, by priority: kept and refused once > kept > refused once > default.
- kept and refused once: `You cast anyway. Habit. Still wanting nothing?`
- kept: `You cast anyway. Habit. And this time?`
- refused once: `Back again. Still wanting nothing?`
- default: `Back so soon? I'd only just got down. And this time?` (the same on the sea)

Home path: the greeting stays as it is, and the fish adds one line after it, which carries the choices:
- Golden fish: `Don't mind the knocking. They're not trying to get in.`

The choices come straight under the greeting (home: under the knocking line):
- Choice: **Make this day last forever** / **Let me hear the fish** / **Gold. A boat full of it** / **Nothing**

#### Wish 2 grants

Make this day last forever (`frozen = 1`: clouds and birds stop moving; the sun is held only until the sunset cinematic, which drives it directly):
- Golden fish: `That's twice you've said forever. It's a long time for a sun.`
- Golden fish: `This one is tired. I know one that never sets.`

Let me hear the fish (`heard = true`):
- Golden fish: `Listen, then. They all say the same thing.`

Gold. A boat full of it (the gold pile appears, then the gold sink cutscene, section 8):
- Golden fish: `Gold. A boat full of it.`
- The boat goes down under him (section 8, Gold sink). He is left chest-deep in the water holding the rod up, the lantern floating beside him. He fishes like that for the rest of the run.
- Golden fish: `Sorry. Gold is heavy. You can always come back for it.`

Nothing, first refusal (`refused = 1`):
- Golden fish: `Full already? It's a little late for that.`

Nothing, second refusal (`refused = 2`):
- pause 1.2 s
- Golden fish: `Twice. Nobody asks for nothing twice. What are you?`

After a granted wish:
- Golden fish: `That was my second, too. This one costs the rest of the day.` (if wish 1 was Nothing: `That was my first, too. This one costs the rest of the day.`)
- Golden fish: `You'll miss the sun. I'll bring you another.`

After a refusal:
- Golden fish: `Then the sun sets for free. You'll miss it. I'll bring you another.`

The fish dives (kept: the boat fish dims to 0.45). Sunset cinematic as coded; while the sky darkens the disc is drawn solid (the star white with a pale rim), so it reads as a coin, not a hollow ring. Caption after a wish: `The sun slips into the lake like a coin into a well.` (sea: `The sun slips into the sea like a coin into a well.`) After a refusal: `The sun sets the way suns do.` Then `You light the lantern.` (on the lake with no cabin: `You light the lantern. The shore does not.`) Forever variant: `starA` held at 0 and `sunGlow` floored at 0.4 under the horizon, so the stars never come up and the glow never fully dies; the red cinematic starts from the stars it finds, so a starless night stays starless.

#### The companion's question (company only)

Right after the lantern lights, unprompted, once the `You light the lantern.` caption has finished (the bubble waits it out, so two texts never share the stage). The question mark is drawn wrong (a span with the glyph flipped and slightly off its baseline).

- Companion: `Will you stay?`
- Choice: **Yes** / **Say nothing**

Yes (`answered = true`):
- narr: `He does not turn around.`

Say nothing (`answered = false`):
- narr: `He goes back to watching the horizon.`

### Act 2, night. One catch.

The card carries a VOICE if `heard` (section 5). Once during act 2, between casts, the lantern dips for one second and for two seconds the water is full of eyes at the surface. Then it recovers. After the catch:
- released: `The water goes very still. The flame leans toward it.`
- kept: `The water goes very still. The flame leans to your feet.` (sunk: `The water goes very still. The flame leans toward the fish.`)
- Home path, once that caption has ended: three knocks again, slower (about 0.8 s apart, the window blinking with each), and the narr caption `The knocking again. Slower.` The eyes wait for it.

The golden cast: nothing bites for slightly too long (bite delay 1.8x), then the line goes taut and is dragged to the horizon. There is no bite, no `Tap now` and no way to miss it: when the bite time comes the red sequence starts. Kept: no sparkles and no chime; the fish is visibly in the boat.

#### Red sequence

- narr: `The line goes taut. You did not feel a bite.`
- Released: the golden fish appears above the horizon exactly where the sun set. Hold two seconds in silence; no caption.
- Kept: nothing appears in the sky. The boat fish glows back to 1. Its lines are spoken from the boat.

Released:
- Golden fish: `One wish left. But first, the sun I promised you.`
- Golden fish: `You said forever. I listened.` (forever wished: `You said forever, then you wished for it. I listened twice.`)

Kept:
- Golden fish: `I'm right here, fisherman.`
- Golden fish: `One wish left. But first, the sun I promised you.`
- Golden fish: `You said forever. I passed that on.`

Refused twice (either path, replaces the lines above):
- Golden fish: `One wish left. You said forever, then asked for nothing twice.`
- Golden fish: `It wants to see why.`

Then the red cinematic as coded, with three changes: the companion turns at the pupil beat (inside the cinematic, before anyone speaks); the pupil slides toward the boat only if the player ever asked for something; if `heard`, at the stalk beat The lake whispers `i could stay out here forever. i could stay out here forever.` (the fisherman's words back from every fish at once; on the open sea the label is The sea). The red glow starts from whatever the sunset left under the horizon (0.4 if forever), never from zero. (The gold path's extra two-pixel sink is gone: the boat is already under.) The cinematic's own narr caption at 0.6 s stays: `Something rises where the sun went down.` There is no caption at the pupil beat.

#### Wish 3

Red style. One voice. The only insertions are the optional lines marked below, in their places. Eight lines at most, five in a typical run.

1. Golden fish: `There it is. Forever, like you said.`
2. Golden fish: `That bait was never for fish. I should have said.` (the stranger's bait from act 0; this is the reveal, and it tells the player who the stranger was without saying so)
3. Golden fish, the recount: `Everything you asked for.` then the granted wishes in order as short clauses, then `And forever.`, then `Your words, not mine.` All in one line, up to 125 characters. The clauses are the player's own labels, shifted to the second person: company `someone to sit with you`, fish `where the fish are`, home `a home on the shore`, forever `a day that never ends`, hear `to hear the fish`, gold `a boat full of gold`. Example: `Everything you asked for. Someone to sit with you. A boat full of gold. And forever. Your words, not mine.` If nothing was granted: `Nobody rows this far to want nothing. So why are you here.`
4. Optional, companion present and silent: Companion: `Don't answer it. Cut the line.` Companion present and answered: Companion: `You said you'd stay.` then Golden fish, red: `You answered him. I did ask you not to.`
5. Optional, kept: Golden fish, whisper from the boat: `I'm sorry.`
6. Golden fish: `I sat where you sit. I said what you said. Three times.`
7. Golden fish: `I'd like to go home now. What would you like.`
- Choice: **Let me go home** / **Take the light away** / **Cut the line** / **Let me in.** (only if home was wished) / **Stay with him** (only if `answered`) / **Let me get my gold** (only if gold) / **Nothing** (only if `refused = 2`)

Buttons are a flex column with smaller padding when there are more than three. Keys 1 to 6 select them. The dialogue panel is capped at 46% of the stage height with the text scrolling, so the buttons never cover the turned companion. Check the five-button case in shots at 320 px width.

#### Endings

**Home.** Golden fish: `Home. Yes. Come inside.` If kept, Golden fish, whisper: `Thank you.` The jaws cinematic as coded, the teeth drawn as pixel art (stepped flanks, a 1 px black outline, hard bands of bone light and shade, a gum band at the root); the banded shift behind them stays. Released: a caption at 1.5 s, `Something gold slips by you on the way down.`

**Dark.** Golden fish: `As you wish. Without light you won't have to see the teeth.` If kept, Golden fish, whisper: `Don't leave me in the boat.` (sunk: `Don't leave me out here.`) The dark cinematic as coded, plus one frame of the water full of eyes in the last lantern flicker. Released: the sky fish fades out over the first 1.5 s, then a caption at 2 s, for 3 s, while the dim is still under half: `Something gold circles the boat. It has time.` (sunk: `Something gold circles you. It has time.`)

**Still water.** narr: `You reach for the knife on the gunwale.` (sunk: `You reach for the knife in your belt.`) Golden fish: `No. Nobody cuts the—` The cut cinematic as coded, plus: the gold pile goes over with the line, the cabin window goes dark at the dawn beat (`cabinLit` to 0; the cabin itself stays standing), the shadows steer to the horizon at full weight and are removed as they arrive, the companion stays in the stern. No caption at 3.4 s on any path: the interrupted word, the snap and the splash say it (released: the sky fish drops below the horizon with a splash). Kept adds a splash beside the boat at the dawn beat with `goldKept` to 0 and the caption `You lift the golden fish over the side.` (sunk: `You let the golden fish go.`)

**Stay.** Two claims collide over him. Golden fish, red: `Stay with him. Two wishes, one seat.` Companion (bubble), the first thing he ever says that is not the fisherman's own words: `He said he'd stay with me.` Golden fish: `He said a lot of things.` Then the stay cinematic (section 8): the companion stands, the eye snaps to him, he crouches and says his one word, Companion (bubble, timed, the only timed bubble in the game): `Stay.` He launches at the red sun, clings to it until its line snaps, and takes it down into the sea with him. He does not come up.

**Deep.** Golden fish: `It's all still down there. Nobody comes back up with it.` The deep cinematic (section 8).

**Silent.** narr: `You say nothing.` pause 3 s. narr: `It waits. Then it splashes its tail once and goes down.` If kept (there is no sky fish to go down), narr: `It waits. Then it goes dark in the bottom of the boat.` and `goldKept` drops to 0.05 with no caption. The cut cinematic with a silent flag: no snap sounds, the stalk sinks with the disc instead of being cut, the 3.4 s caption is `The line goes slack.`; if kept the boat fish goes over at the dawn beat. Counts as Still water.

**Inside** (phase 30, the house path; only if home was wished). Golden fish, red: `Of course. They've been waiting to get out.` The inside cinematic (section 8): the boat drifts to the shore under the cabin while the camera pushes in, he walks up to the door, the knocking stops, the door opens and someone darker steps out; they pass, he goes in and the door shuts; the other takes the boat, rows a little way out and casts. Three faint knocks, from inside. Sunk: he swims ashore, and the other walks into the water toward the gold and goes under.

**Swallowed** (act 0, ocean). narr: `The float lands on something that is not water.` The swallow cinematic (section 8), one continuous lunge seen from our place on the water: the head of an enormous fish breaches at an angle round the speck, its lower jaw dropped open, the boat and a sheet of water slide into the gape, the jaw closes and the head sinks back, the water slams shut, and its shadow swims away.

#### Ending cards

The card is composed from three parts: a BASE chosen by ending, location (lake or open sea) and boat (intact or sunk, and for Still water at sea also whether he heard the fish); ONE extra sentence chosen by the priority listed under each ending, from the states that are true; then the asked-for list, one label per line under `You asked for:` (the granted wishes' button labels, with gold read back as `A boat full of gold` so each wish is one phrase; after one refusal it opens `You asked for nothing, once. And for:`, and with none granted it is `You asked for nothing.`). When the extra sentence is itself a refusal line (nothing once, nothing twice), the list does not repeat it: it drops the "nothing" part, and is left out entirely when nothing was granted. Every Still water card ends with `There is a bait in your pocket. It has an eye.` except the lake-sunk one (he is not leaving). Twenty-two situations cover every reachable combination: a companion, a cabin and the sea cannot coexist (all first wishes), Stay needs the companion (lake only), Deep needs gold (sunk only), Silent needs a first refusal (lake, boat), Inside needs the cabin (lake only).

**Home.** Priority: kept > companion > cabin > heard > forever > nothing twice.
1. Lake, boat: `The lake is quiet again. The fish are hungry. Somewhere a sun is coming up. Someone is rowing out.`
2. Lake, sunk: `The lake is quiet again. The boat is on the bottom and so is the gold. Somewhere a sun is coming up. Someone is rowing out.`
3. Sea, boat: `The sea is quiet again. Nobody will come this far to look. Somewhere a sun is coming up. Someone is rowing out.`
4. Sea, sunk: `The sea is quiet again. The gold is on the bottom, and it is a long way down. Somewhere a sun is coming up. Someone is rowing out.`
- kept: `The golden fish slips out of the boat as you go in.` (sunk: `The golden fish follows you in.`)
- companion: `The seat behind you is empty now. It was your turn.` (sunk: `The water behind you is empty now. It was your turn.`)
- cabin: `The knocking stops. Nobody answers it now.` (phase 30: changed so Home does not repeat Inside)
- heard: `You know the words already. You will say them.`
- forever: `The day does not end. You aren't in it.`
- nothing twice: `You asked for nothing, and then for home. Home was the only thing it had.`

**Dark.** Priority: kept > heard > companion > forever > cabin > nothing twice.
5. Lake, boat: `You sit with the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.`
6. Lake, sunk: `You hang in the water beside the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.`
7. Sea, boat: `You sit with the lantern until it gutters out. There is no shore to see it from. Sometimes something takes the bait. You never reel it in.`
8. Sea, sunk: `You hang in the water beside the lantern until it gutters out. The big ones pass under you all night. You never reel anything in.`
- kept: `The golden fish dries in the bottom of the boat. It stops asking before you do.` (sunk: `The golden fish circles you all night, glowing less each time.`)
- heard: `The lake keeps talking. You stop answering.` (sea: `The sea keeps talking. You stop answering.`)
- companion: `Someone breathes behind you all night. You do not turn around.`
- forever: `The day never ends. It never begins either.`
- cabin: `The knocking goes on all night. Nobody opens.`
- nothing twice: `You asked for nothing twice. Here it is.`

**Still water.** Priority: companion > cabin > kept > forever > heard (lake only) > nothing once > nothing twice.
9. Lake, boat: `You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.`
10. Lake, sunk: `You swim for the shore and reach it. Every morning you wake in the water again, above the gold. You can always come back for it, it said.` (no pocket line; the lake keeps him)
11. Sea, boat, did not hear: `You cut it. The red sun goes down for everyone. There is no shore in any direction. You row anyway, for a while.` (the white dawn still comes, as the cinematic shows)
12. Sea, boat, heard: `You cut it. The fish you can hear know the way. They bring you to a shore nobody from home has seen, and you start again there.`
13. Sea, sunk, did not hear: `You cut it. The red sun goes down for everyone. You swim for a while.`
14. Sea, sunk, heard (unreachable: hear and gold share wish 2): `You cut it. The fish you can hear know the way. They carry you to a shore nobody from home has seen, and you start again there.`
- companion: `There is someone in the stern. You do not ask. You row.` (sunk: `Someone swims behind you. You do not ask.`)
- cabin: `The cabin goes dark. The knocking stops. You don't go back to see why.`
- kept: `You lifted it over the side. It let you.` (sunk: `You let it go. It let you.`)
- forever: `Dawn comes anyway. You did not ask for it.` (sea: `Dawn comes anyway, over nothing.`)
- heard, lake: `You can still hear them from the shore. You stop listening.`
- nothing once: `You asked once for nothing. It kept count.`
- nothing twice: `Twice you said nothing. The knife said it a third time.`
- then, except situation 10: `There is a bait in your pocket. It has an eye.`

**Stay.** Lake only. Priority: kept > heard > forever (Stay needs the companion, so a cabin cannot join it).
After the forever wish the base drops its last sentence (`It does not get light, and after a while you stop minding.`), since the forever line says it.
15. Boat: `You stay. He took the sun down with him. The seat behind you is empty again. It does not get light, and after a while you stop minding.`
16. Sunk: `You stay, in the water. He took the sun down with him. It does not get light, and after a while you stop minding.`
- kept: `The golden fish stays with you. It is the only light that answers.`
- heard: `The lake keeps talking about him.`
- forever: `The day did not end. Now it will not begin.`

**Deep.** Sunk only. Priority: kept > companion (Deep needs the gold, so hear and forever cannot join it).
17. Lake: `The gold is where you left it. So is everything else. The water is warmer than you thought, and full of light, and there is no bottom.`
18. Sea: `The gold is somewhere below. The water is warmer than you thought, and full of light, and the big ones let you pass. There is no bottom.`
- kept: `The golden fish goes down with you. It knows the way.`
- companion: `Someone comes down after you. You do not look back.`

**Silent.** Lake, boat.
19. `You wanted nothing. It showed you anyway. You row until the water is only water. Some evenings, the sunset looks back. There is a bait in your pocket. It has an eye.`
- kept: `It went over the side on its own. You let it.` (inserted before the pocket line)

**Swallowed.** Act 0, the sea.
20. `Somewhere far above, the sun is still shining on the sea. There is no boat on it.`
- kept: `The golden fish went in with you. It had been in before.`

**Inside** (phase 30). Lake only (the cabin is a first wish, so no companion and no sea). Priority: kept > forever.
21. Boat: `You open the door. Someone was waiting to get out. They take the boat. Some nights you hear them cast. Some nights, you knock.`
22. Sunk: `You swim ashore and open the door. Someone was waiting to get out. They walk into the water, toward the gold. Some nights, you knock.`
- kept: `The golden fish goes with them. You stay behind the door.`
- forever: `The day outside does not end. You watch it through the window.`

## 5. Cards

Names per act unchanged. The rule for every card line: one plain fact that a fish cannot have (it smells of snow, it has your teeth, it came out dry, it knotted itself on purpose), said flatly, never explained. A line that is merely eerie or merely descriptive is a weak line. One line per species per act:

| Species | Act 0 | Act 1 | Act 2 |
|---|---|---|---|
| Glass perch / Glass perch / Eyeless perch | You can see its heart beating through it. | There is an old hook inside it. Not yours. | No eyes. It still turns toward the lantern. |
| Mirror char / Mirror char / Hollow char | Its scales show you the sky. You check. It matches. | Its scales show you a red sky. | Its scales show your boat from underneath. |
| Blue smelt / Grinning smelt / Grinning smelt | Small and cold. It holds still for the knife. | It has teeth. They look like yours. | It is dry. It came out of the water dry. |
| Fjord trout / Fjord trout / Drowned trout | It fought like it had somewhere to be. | It keeps looking at the sun. | It drowned. It is a fish. It drowned. |
| Needle eel / Knot eel / Endless eel | Longer than the boat. It weighs nothing. | It knotted itself so you couldn't keep it. | It is still coming out of the water. |
| Pale grayling / Pale grayling / Ash grayling | It smells of snow. | It smells of smoke. | It smells like you. |

Conditional replacements: at most one per card, each fires at most once per run (`STORY.usedRepl`), first match wins, checked in `makeCatch`:
- company, char act 2: `Its scales show someone sitting behind you.`
- kept, first act 1 card: `There is a gold scale in its mouth.`
- fish, trout act 2: `Its stomach is full of hooks. All of them yours.`
- fish, the first act 1 card not already replaced: `It swam to the hook. It didn't have to.`
- home, grayling act 1: `It smells of woodsmoke. Someone's home.`
- gold, any act 2 card: `There are coins in it. They are still warm.`
- refused twice, act 2 card: `It is looking at you the way you look at it.`
- second run or later, first act 0 card: `There is an old hook in its lip.` When it fired, the perch is excluded from the act 1 picks so the two hook lines never both show.

The act 2 species is chosen from those whose act 1 line was not shown this run.

**How the fish look.** Each species must be told apart on the card at a glance, without reinventing the generator: its own small palette (three or four indices, not the one shared FPAL) and one silhouette signature. Glass perch: pale, translucent-looking, dark vertical bars, a visible dark heart pixel. Mirror char: silver with a pale belly and a scatter of light spots. Blue smelt: slim, silver-blue, almost no markings, a bright eye. Fjord trout: dark olive back, red-brown spots, the deepest body. Needle eel: long, thin, olive-dark, no fins to speak of. Pale grayling: tall sail of a dorsal fin, grey-white. Act 2 versions go grey and darker (the ash and drowned names), the eyeless perch has no eye pixel, the hollow char loses its spots, and the grinning smelt keeps its eye and gains a tooth row. The card canvas may scale the sprite larger than today so these read on a phone.

VOICE, in the accent colour on the act 2 card, only if `heard`, keyed to `firstAsk`:
- company: `I wished for company too. Now I have plenty.`
- fish: `I wished to go where the fish are too. Here I am.`
- home: `I wished for a home too. This is it.`
- nothing: `I wanted nothing too. It waited.`

## 6. The companion

He sits on the stern plank facing the horizon and never turns until the pupil beat of the red cinematic. Tapping him (or pressing C) shows one said-style caption instead of casting. Once per run he speaks unprompted: after the first act 1 card closes, the next line of his pool shows in his bubble, so the player learns he is there. From night on he and the fisherman carry a 1 px rim of ramp index 5 on the lantern side, so they read against the dark shore. He only ever says the fisherman's words, bent a little: in daylight they are the fisherman's words, at night they start to be his, in the red he says the one thing the fisherman never said. Pools, drawn in order then repeating the last:

- Act 0 and 1: `Look at that sun.` / `First time here.` / `We could stay out here forever.` / `Still there.` (the last repeats while the sun sinks)
- Act 2: `Look at that sun.` / `It's coming back.` / `Don't you want it to?` (there is no sun; the words have not changed, the world has)
- In the red, after he has turned: `Cut the line.` (if answered: `You said.`)
- Second run or later, his first line becomes: `First time here. You said that last time.`

He never answers anything. There is no way to ask.

Engine: the stage's pointerdown maps the tap to internal pixels (`ix = (clientX - rect.left) * W / rect.width`, the same for y) and asks `companionHit(ix, iy)`; a hit calls `companionTap()`, anything else calls `press()`, which takes no coordinates. The hit box is his sprite box padded by 6 px (`COMP_PAD`; about x 162 to 196, y 219 to 253 internal, following `boatX`). It applies only when `WS.companion > 0.5`, `WS.far <= 0.5` and the phase is `ready`, and in the red while `WS.companionTurn > 0.5` and choices are showing. Keyboard, the sim and `testCatch` call `press()` bare, which never hits. `companionTap()` and `companionHit()` are exported for tools.

## 7. Across runs

`stillwater-runs` counts completed runs and `stillwater-last` stores the last ending id (the silent variant as `cut:silent`). On any later run:
- The title shows a tiny far boat on the lake.
- The golden fish's first line changes (section 4, Golden scene 1).
- The first act 0 card and the companion's first line change as above.

Nothing is locked behind replay.

## 8. Cutscenes

Timed functions in the existing cinematic system. Durations are targets.

- **Opening** (4 s, under the title fade): a short dip to black, then `boatX` from -208 (off screen; -120 would leave the hull on screen) to 0, eased out. Row sound, two strokes. No cast until it arrives.
- **Ocean** (about 30 s): mountains sink toward the horizon and blend into the sky colour until gone (`sea` 0 to 1 over 8 s, and `sea` then stays 1 for the rest of the run). The camera pulls back slowly (`far` 0 to 1 over the same 8 s, eased in and out) and the player can follow it all the way (phase 24): the whole boat group (hull, fisherman, rod and lantern as one silhouette in the boat’s dark indices, the curled ends kept while they are more than a pixel) shrinks step by small step through ten sizes (0.85 down to 0.09 of full size) to the 5 by 2 speck, while its anchor glides on the same easing from where it sat to the centre of the horizon; the float and line are hidden once it is a silhouette. The sky pulls back with it (phase 26): the clouds shrink on the same easing toward the horizon under the sun, to half their size at `far` 1, and the sky that opens above them fills with more clouds (the near cumulus repeated upward, each repeat shifted sideways so no two line up; the far wisps stay by the horizon, so it stays hazy), still drifting and breathing; the sun's corridor stays clear and the water mirrors it all. A small dark ring leaves its waterline every 1.2 s at every size, spreading wider than the silhouette, through the pull-back, the window and the return, so even the speck visibly sits on the water. Shadows fade in already in the water, large and larger (2x to 6x), a dozen. After the pull-back the shoal swims alone for about 3.5 s, several shapes crossing, clearly many fish. Only then the big one, at 11.5 s: it does not rise from below and it does not arrive fast. It appears at the left edge faint and deep (lower in the water, its presence rising from nothing over 3 s so its darkness deepens as it comes), crosses left to right over about 7 s, slowing as it comes, rising a little as it slows, and settles under the boat. The others scatter from it as it passes. Its sound is weight, not a scare: a low swell (sub-bass, a slow filtered rumble) that rises over the crossing and holds while it sits under the boat, with no attack, no stinger and no one-shot hit. The player should feel the mass before it stops. As it settles: `Here. I wouldn't cast while it's under you. It's been waiting longer than you have.` Then the usual `Tap to cast` after a 1 s grace, and a pale 5 px ring (a light ramp index) pulsing slowly on the big one's back directly below the speck: where the float would land. If the player casts within about 10 s, the float lands on the ring and the Swallowed cinematic starts. Otherwise the shape slides off left over 2.5 s and the camera returns (`far` back to 0 over 2.5 s, the same ladder, glide and rings in reverse) while `sea` stays 1: the boat is back at full size on an empty horizon with the huge shapes still passing beneath. Then `Look how they all go the same way.` and the cost lines. No shore ever returns on this path; `shoreShift` is not used. Skip fish acts as a cast during the window.
- **The open sea** (the rest of a fish-wish run): `sea` 1 hides the mountains everywhere they are read (render, sun ring, stalk, jaw). The sunset sets the sun into the sea; the red sun rises from the sea; Home's jaw closes with the sky sliding down onto a fang line at the horizon with no mountains; Still water rows away across open water; Deep and Dark as usual. The cabin and the companion cannot exist on this path (they are wish 1 too). The giant shapes keep passing beneath at a slow rate, all toward the horizon, at every mood.
- **Swallowed** (about 11 s, one continuous lunge seen from the water, the boat a speck on the horizon; no teeth, no whirlpool, no floating eye): the float flies onto the ring and lands on the big one's back at 0.7 s, the caption at 1.1 s. A beat, then at 1.3 s the water round the speck bulges into a low pale mound (`bulge`, 0.5 s) that lifts the speck, and the float is pulled under. From 1.5 s the head of an enormous fish breaches round the speck and rises over 1.4 s (ease out), sliding up and a little left out of the sea: a fish in profile facing left, about 110 px wide at full rise, its snout to the upper left and its body running down to the right into the water. It breaks the surface snout first, tilted steeply up, and settles to about 34 degrees as it rises, and it holds that angle as it sinks. Its parts, all in the ramp so they recolour with the mood: a blunt, heavy, rounded snout over the upper jaw; a big lower jaw hinged at the corner of the mouth that drops open (`gape`, from 1.65 s, 1.1 s) so the gape is a clear dark wedge (19, with 0 just inside the front) between the upper and lower jaws, wide at the front and narrowing to the corner, the lips lit (4 above, 5 below); a paler throat and lower jaw (two ramp steps lighter than the back, 4 against 2) with a dark fold between them; a curved gill-plate line (0, lit 4 in front of it) behind the mouth; a pectoral fin laid back behind it (5 with 4 rays); a faint dotted lateral line (4) running back from the gill plate; a few sparse curved 2 px scale marks on the back (4); the small gold slit eye (13 to 16, the slit 19, the same eye as the bait) above the corner of the mouth; a lit rim along the top of the head (7, then 4, on the crown facing the sun). No teeth. It is drawn into the sky above the horizon, so it reflects; the reflection is broken into rows by the heave. Water pours, it does not rain: in the first 0.5 s of the rise (`shed`) pale sheets (11, 10) slide back off the top of the snout; while it is up, short bright dashes (11, 10, trailing 9) fall only from the lower jaw's tip, the chin and its underside toward the throat, lengthening as they fall to the sea, with a few drops at the corner of the mouth; and a white foam collar (10 and 11 broken with 9) churns where the body meets the sea, piled a row above the line and churned two rows below it. The speck is drawn toward the mouth on the heaving water and the rising lower jaw scoops it up; it sits on the lip on a heaped pale sheet of water (10, 9, topped 11) that pours into the wedge. At 2.9 s the speck and the sheet slide into the wedge toward the corner over 1.0 s (`gulp`: the speck tips, shrinks and dithers away) and are gone. At 3.9 s the lower jaw swings up and the gape closes with the speck inside (0.5 s), then from 4.4 s the head sinks back below the horizon over 1.4 s (ease in) the way it came, at the same angle, the streaks thinning. At 5.6 s the water closes at the horizon point: a heap of white water thrown up and falling back (`slosh`, 1.2 s) with churned foam under it, spray rising and falling (11 and 10), and three rings spreading. At 7.0 s the big shadow under the water glides off to the right and down, fading, over 2.5 s, while the weight swell fades. The empty sea holds, black at 10.7 s, then the card. Sound: the weight swell holds through the lunge; a deep surge as it rises (sub-bass and low noise swelling with no attack, no stinger), a heavy water slam as the mouth closes, the splash, then quiet.
- **Gold sink** (6 s): `boatSunk` 0 to 1. The whole boat sinks: over 4 s the hull descends until it is fully under the surface (rows below the waterline masked by water), with bubbles and two rings, the gold glinting once as it goes. The fisherman does not go with it. From `boatSunk` 0.6 he is drawn as a swimmer: head, shoulders and one arm above the surface holding the rod up, the rest masked by water, at the same x as before; the lantern floats beside him at water level with its glow on the water; the companion, if present, floats too, sitting on the surface at his seat's position, still facing the horizon, as if nothing happened; the kept fish, if present, swims beside the fisherman at the surface, glowing. Persists for the rest of the run: casting, the float and the reel work from the water, the rod tip is lower, and every later cutscene that moved `boatX` moves the swimmer instead. Ending cards on this path have their own sunk bases (Ending cards): Still water swims (situations 10 and 13), Dark says `You hang in the water beside the lantern until it gutters out.` (6 and 8), and Stay says `You stay, in the water.` (16). Silent is never sunk. The Deep ending is the natural end of it: he goes down after the boat.
- **Kept fish**: a sprite about 10 by 4 in the gold indices 13 to 16 with an open-mouth variant used while a Golden fish line is typing (the same talking test as the sky fish), stamped with the reflecting stamp at about (bx + 40, WL - 10). Its alpha follows the ladder in section 3 and returns to 1 whenever it speaks.
- **Forever** (instant on grant): `frozen = 1`. Cloud drift stops, birds hang, fish jumps stop spawning (a ring already in the water, and every later cast, bite or cinematic ring, still spreads and fades), the sun holds until the sunset cinematic. Nothing says so.
- **Eyes** (2 s, once in act 2, 1.5 s after the golden cast lands, never under a caption; the line goes taut only after they have closed): `lanternFlicker` to 0.1 for the first second, `eyes` 0 to 1 to 0 over 2 s: about eight pairs of red-eye pixels (index 21) on the two or three surface rows near the boat, positions fixed per run, faint reflections. Reused for one frame in the dark ending's last flicker.
- **Companion turn** moves from wish 3 into the red cinematic at the pupil beat.
- **Stay** (about 16 s; phase 29, a fight you can see at phone size): after the three lines, the companion stands (a standing frame, taller, still dark; on the sunk path he does not stand or crouch, he leaps from the water where he floats), `pupilDx` snaps toward him over 0.4 s and the heartbeat quickens. The crouch: at 0.4 s his bubble shows the single word `Stay.` (the only timed bubble, section 4b; it hides at the launch, about 1.4 s later), and at 1.2 s he drops into a crouch (a crouching frame in profile toward the sun, knees bent, arms back, rimmed on its top and sun-side edges by the eye's light) for 0.6 s. The launch at 1.8 s: he pushes off hard, the boat rocks (`rock`), a pale burst of water (the bone accent and the star white, so it reads on the ridge and on the glare) flies back off the stern, and two rings spread (sunk: the burst and the rings, no rock). The flight: a long high parabola over 2.4 s, x leading, the leaping frame at 2x rimmed 1 px on the edges facing the disc, a short fading trail of three dithered earlier positions; the eye widens as he comes (`eyeWide` 0 to 1: the pupil slit grows by up to 3 px a side and the pale iris by a fifth) and its pupil tracks him the whole way. The impact at 4.2 s: he lands on the disc and clings to its rim (a clinging frame at 2x, solid dark, one hand hooked over the upper rim on the stern side and the other on its slope, the head between the arms, the legs kicking in two frames, the body down the disc's edge clear of the pupil); the glow spikes for two frames and the crunch plays. The strain, 0.7 s: the line holding the sun bows toward the stern and shivers (`strain` 0.35 to 1), the disc sags 3 px and trembles, a rising creak. The snap at 4.9 s: the snap sound, the upper line recoils upward (`stalkCut` 0 to 1 over 0.5 s) still whipping as its strain dies. The fall: the disc and the companion on it drop into the sea together over 1.5 s (`sunY` to below the horizon, ease in); where the disc meets the water, a big pale splash, the hiss, rings (one wide), and steam (pale specks rising and drifting, thinning as they go, for 2 s); `companion` goes to 0 as the disc goes under (no separate splash). The red drains: `mood` 2 to 1 over 5 s, `starA` 0 to 1 (forever: stays 0), `ash` to 0, `sunGlow` and `horizGlow` to the night values, the lantern stays lit and its glow warms slightly, the seat is empty; the boat sits where it is; slow fade to black over the last 3 s. The sun does not come back. `out_stay_strip.png` shows eight beats (the crouch with the bubble's place marked, the launch, mid-flight, the eye widening, clinging, the snap, the fall and splash, the night after).
- **Deep** (14 s): the horizon rises past the top of the screen over 6 s (the mirror's source row shifts so the reflection fills the frame), the palette dims toward the night ramp, stars appear below, the swimmer becomes a silhouette seen from beneath near the top once the horizon has risen a few rows (`dive` past 0.02; the lantern and its glow go out at that same switch, not after it), with a one-pixel rim of light around the shapes; once the surface has risen past the upper third he sinks with the view and stays there (y 84), and below him the gold drifts as a cluster of glints with a warm glow on the water around it, flaring once; fade.
- **Still water** (the cut cinematic, about 17.5 s): the cut, the drop and the dawn as in the ledger, then the dawn shows what the card says, chosen from the state the card composer reads. Lake, boat (situation 9) and Silent: he rows away to the right from 11 s. Sea, heard (12; 14 has no path but takes the same picture): at the dawn beat the giant shapes gather in a line just right of the boat and below it, all facing right; from 7 s a new coastline rises out of the horizon haze over 4 s (`newShore` 0 to 1): low, wide and flat, nothing like the fjord, long headlands with open water under the sun, one rising to a tall cliff, a small stack, and a thin dark-green line where it meets the sea (palette index 25, the only green), drawn into the sky buffer so it reflects; from 10 s he rows toward it with the shapes leading, and the picture fades from 15 s. Sea, not heard (11) and sea, sunk (13): at the dawn beat the camera pulls back exactly like the ocean (`far` 0 to 1 over 8 s, the same ten sizes, glide, rings and shrinking clouds), the boat (or the swimmer: head, shoulders, the rod and the floating lantern, then a 2 by 1 speck) shrinking through its far silhouettes to a speck at the centre; no shore; the speck drifts slowly (`farDrift`); fade from 15.5 s. Lake, sunk (10, about 15 s): at the dawn beat he swims left for 3.5 s and reaches the shore under the left mountain; black for about a second; the dawn fades back in with him at his old spot in the water, the lantern floating beside him and one gold glint below him (`goldBelow`), held 2.5 s, then fade.
- **Silent**: the cut cinematic with the silent flag (section 4, Endings).
- **Inside** (phase 30, about 17.5 s, the same view as the rest of the game): the eye's pupil turns toward the cabin (`pupilDx` to -7 over 0.8 s). From 0.2 s, over 5 s, the boat drifts to the shore just off the foot under the cabin (anchor x 100 at the horizon), shrinking through the ocean's far ladder to its 0.27 frame (the seated man in it about the size of the walkers), while the camera pushes in (`push` 0 to 1: after the composite the picture is resampled from a shrinking rectangle, nearest neighbour, zoom 1 to 2.2, its centre eased from the screen's to the cabin door; the glows follow it). The knocking repeats faintly every 1.4 s from the drift until he reaches the door, the window blinking with each. At 5.3 s he steps out (the empty-boat frame, hull and lantern) as a 4 by 7 walking figure (two frames, a line of the eye's light on its top and sun side) and walks up the shore beside the door over 2.8 s; the knocking has stopped. At 8.4 s the door opens (`door` 1: `CABIN_OPEN`, the doorway white-hot with a gold sill, and its glow). At 8.8 s someone stands in the doorway, blocking its light: the same size, darker (19, a dimmer rim). At 9.3 s they step out past him while he goes in (9.7 s); at 10.5 s the door shuts (the warm light cut, a thud; the heartbeat stops). From 10.7 s the other walks down to the boat (1.4 s) and is in it (the seated frame), rows a few pixels out (12.2 s) and casts (13.2 s: a thin arc from the rod tip onto the water, then the line settling with the float on it, a plop and a ring). Three faint knocks from inside at 14.1, 14.55 and 15 s, the window blinking; hold; fade from 16.5 s. Sunk: he swims ashore (the swimmer's far ladder, small dark rings behind him), climbs out and walks up; after the pass the other walks down to the shore and on into the water toward the gold (11.9 s), masked by the surface row by row, and goes under with a plop and a ring. `out_inside_strip.png` and `out_inside_sunk_strip.png` show eight beats each.

## 8b. World state ledger

The world is a set of numbers in `WS`. Every scene below says which of them it OWNS (may change) and what it must leave alone. Anything not listed for a scene holds its current value. Values are the engine's: mood 0 day, 1 night, 2 blood; the sun at rest is `SUN0Y`; the horizon is `HY`.

| Scene | Owns and changes | Must hold |
|---|---|---|
| Title | `farBoat` (1 if any run finished), clouds drift, birds, fish jumps | mood 0, sun at rest, glow 1, troubled 0, no lantern |
| Opening row-in | `boatX` -208 to 0 over 4 s, under a 0.4 s dip to black (the far boat stays through the dip and leaves behind full black) | everything else as the title |
| Act 0 play | nothing | mood 0, sun at rest, troubled 0 |
| Golden scene 1 | the sky fish (`goldFish`) appears and dives; kept: `goldKept` 0 to 1 and no sky fish | the world |
| Wish 1 grant | company: `companion` 0 to 1 over 2.2 s. Home: `cabin` 0 to 1 over 2.2 s. Fish: the ocean cutscene, then `sea` 1 for good, `fishShadows` 1 and the giant shapes beneath. Nothing: no change | mood 0 |
| Cost drop (after any granted wish 1) | `sunY` +8, hold 1 s, +8 (about 5 s total), starting as the first cost line begins; `troubled` to 0.22 | mood 0; `sunX` never moves |
| Ocean | `sea` 0 to 1 over 8 s and then held at 1 for the rest of the run (mountains gone for good); `far` 0 to 1 over 8 s (ease in-out) and back to 0 over 2.5 s at the end (camera only); by `far`: the live group, ten boat silhouettes and the speck, the anchor gliding to the horizon centre on the same easing, a small dark ring from the waterline every 1.2 s while `far > 0`; giant shadows, kept alive at a slow rate for the rest of the run; the shoal alone until 11.5 s, then the big one fades in (presence 0 to 1 over 3 s) at the left edge and crosses over about 7 s to settle under the boat, with a rising low swell and no stinger; in the window, after 1 s, the prompt and the landing ring; `troubled` 0.15 while `far > 0`, then 0.22 with the cost; birds hidden while `sea > 0.5` | sun, mood, clouds keep drifting; no companion or cabin can exist on this path |
| Open sea play (fish-wish runs) | the giant shadows keep passing | `sea` 1; everything else as the equivalent lake scene |
| Swallowed | `bulge` 0 to 1 over 1.3 to 1.8 s and back to 0 as the mouth opens; `lunge` 0 to 1 over 1.5 to 2.9 s (ease out) and 1 to 0 over 4.4 to 5.8 s (ease in); `gape` (the lower jaw dropped open) 0 to 1 over 1.65 to 2.75 s and 1 to 0 over 3.9 to 4.4 s; `shed` 1 to 0 over 1.5 to 2.0 s (the sheets off the snout); `gulp` 0 to 1 over 2.9 to 3.9 s (the speck gone at 1); `streak` 0 to 1 with the rise and to 0 with the sink; `slosh` 0 to 1 over 5.6 to 6.8 s with spray and three rings; the big one dims to 0.35 while the head is up, back to 0.9 as it sinks, then glides right and down to 0 over 7.0 to 9.5 s with the weight swell fading; black at 10.7 s; cutscene about 11.1 s | `far` 1, sun, mood |
| Act 1 play | home only, after the first card: `cabinKnock` 1 to 0 over 0.3 s with each of three knocks (the window blinks dark) | mood 0, sun lowered, troubled 0.22, wish 1 props |
| Golden scene 2 | sky fish appears and dives; kept: `goldKept` to 1 while speaking, then 0.7 | the world |
| Wish 2 grant | forever: `frozen` 1. Gold: `gold` 0 to 1 over 1.5 s, then the gold sink (`boatSunk` 0 to 1 over 6 s; the boat is gone, the fisherman swims). Hear, Nothing: no change | mood 0 |
| Sunset | `sunY` to `HY + 14` over 7.5 s; `mood` 0 to 1 over t 1 to 8; `sunGlow` to 0.12 (forever: floor 0.4); `horizGlow` to 0.3; `starA` to 1 from t 5 (forever: stays 0); `troubled` to 0.35; `lantern` 1 at 7.8 s | `sunX`, companion, cabin, gold, sunk boat, `frozen` (a frozen sky stays frozen through the night) |
| Companion question | nothing | the night |
| Act 2 play | home only, after the card's still caption: `cabinKnock` blinks with three slower knocks; once, 1.5 s after the golden cast lands (never under a caption): `lanternFlicker` 0.1 for 1 s and `eyes` 0 to 1 to 0 over 2 s | mood 1, sun below the horizon, stars as the sunset left them |
| Red sequence | the float dragged to the horizon; released: sky fish at the sun's spot; kept: `goldKept` to 1 | mood 1, stars |
| Red cinematic | `sunKind` 1, `sunR` 16, `sunY` `HY + 24` to 178 over 8.5 s; `mood` 1 to 2 over t 1.5 to 9; `sunGlow` to 1.25; `horizGlow` to 1.3; `starA` from whatever it finds to 0 by t 6; `troubled` to 0.55; `ash` 0 to 1 from t 6; `stalk` from t 9.2; `pupil` from t 12; `companionTurn` 1 at t 13.6; `pupilDx` from t 13.6 only if the player ever asked; heartbeat from t 13.6 | lantern 1, cabin, gold, sunk boat, `frozen`, `sea` |
| Wish 3 | nothing | the red |
| Home | `jaw` 0 to 1 over 4.2 s, fangs, black at 4.15 s | everything in the red |
| Dark | `lid` 0 to 1 over 1.6 s; released: the sky fish fades over 1.5 s; `sunGlow` and `horizGlow` to 0 over 3 s; `dim` 0 to 11 over t 2.5 to 7 (under half while the caption shows); `ash` to 0 over 3 s; `lanternFlicker` random over t 6 to 8 with one `eyes` frame; `lantern` 0 at t 8; black at 8.3 | pupil hidden under the lid, stalk stays, companion stays turned |
| Still water | `lineCut`; released: the sky fish drops below the horizon with a splash; `stalkCut` (silent: `stalk` to 0 instead, no snaps); `sunY` to `HY + 28` by t 2.6; `sunGlow` to 0, `horizGlow` to 0.15; `mood` 2 to 1 (t 3 to 6) to 0 (t 6 to 12); `ash` to 0; `starA` 0 to 1 to 0; `troubled` to 0; `gold` to 0 at the cut; at t 6 (dawn): `sunKind` 0, `sunR` 8, `stalk` 0, `companionTurn` 0, cabin light off (`cabinLit` to 0 over 1.5 s; `cabin` stays 1, the dark building stands), `frozen` 0, kept: splash and `goldKept` 0; `shoalOut` 1 from the cut: the shadows steer to the horizon at full weight, hurry, and are removed as they arrive; `sunY` back to rest with glow 1 by t 12.5; `lantern` 0 over t 9 to 11; then by the card's state (section 8, Still water): lake, boat and Silent: `boatX` to +120 from t 11; sea, heard: the shapes gather ahead of the boat at t 6, `newShore` 0 to 1 over t 7 to 11, `boatX` to +120 from t 10, fade from t 15; sea, not heard or sunk: `far` 0 to 1 over t 6 to 14 (the ocean’s ladder, glide and rings, the swimmer’s ladder when sunk), `farDrift` after, fade from t 15.5; lake, sunk: `boatX` to -58 over t 6 to 9.5, black at 9.7, back to 0 with `goldBelow` 1 at 10.1, fade in at 10.7, fade out at 13.7 (15 s) | `sunX`; the companion stays in the stern facing the horizon; a sunk boat stays sunk (he rows it anyway) |
| Stay | the companion stands (sunk: no standing or crouching frame, no rock); the bubble `Stay.` from t 0.4 to 1.8 (timed); `companionCrouch` 1 from t 1.2 to 1.8; at t 1.8 the launch: `rock`, a pale burst at the stern, two rings; `leap` 0 to 1 over 2.4 s (the 2x rimmed frame on a high parabola with a three-step trail), `eyeWide` 0 to 1 with it; `pupilDx` snaps to him, then follows his x through the arc; at t 4.2: `leap` 0, `cling` 1, glow spike for two frames, crunch; `strain` 0.35 to 1 and `sunY` +3 (trembling) over t 4.2 to 4.9 with a creak; t 4.9: snap, `stalkCut` 0 to 1 over 0.5 s, `strain` back to 0 over 0.6 s; `sunY` to below the horizon over t 4.9 to 6.4 with the splash, hiss, rings and 2 s of steam where it meets the water; `sunGlow` to 0.12; t 6.4: `companion`, `cling`, `pupil`, `eyeWide` to 0; then `mood` 2 to 1 over 5 s, `starA` to 1 (forever: stays 0), `ash` to 0, glows to night values, lantern warm; black over the last 3 s | `boatX` (no drift), `sunX`, `frozen` |
| Deep | `dive` 0 to 1 over 6 s (the horizon row rises past the top; the mirror fills the frame); `dim` 0 to 6; stars in the lower half; the swimmer as a silhouette from beneath near the top from `dive` 0.02; `ash` to 0; `lantern` 0 at that switch (the glow goes with the sprite); one gold glint; black | mood 2 under the dim, `sunX` |
| Inside | `pupilDx` to -7 (toward the cabin); `push` 0 to 1 over t 0.2 to 5.2 (the camera, ease in-out); the boat's anchor to the shore under the cabin over the same span (`boatX` while it is the live group, then the far ladder to the 0.27 frame, the waterline rising to the horizon); `cabinKnock` blinks with each faint knock until t 8.1 and with the three from inside; `door` 1 over t 8.4 to 10.5; the walkers (no WS field: the cinematic's own pose); the heartbeat stops at t 10.5; rows out 4 px (t 12.2 to 13.1); black at 17.5 | mood 2, `sunX`, `sunY`, stalk, ash, `frozen`, gold, sunk boat, `cabin`, `cabinLit`, the kept fish (it stays where it was) |
| Restart | `resetWS` returns every field to the title values | |

## 8c. Consistency rules

- **Mood changes only in cinematics**: sunset (0 to 1), red (1 to 2), still water (2 to 0), deep (dim only). Never during play or dialogue.
- **The sun moves only** in the cost drop, the sunset, the red cinematic, the still-water dawn, and the frozen hold. `sunX` is a constant; the cabin sits under it for the whole game. The sun's reflection is one pixel larger than the disc.
- **The reflection is never drawn by hand.** Everything above the horizon is in `TOP` and is mirrored by `computeWater` with the ripple scaled by `troubled`; sprites use the reflecting stamp. The far boat, the cabin, the mountains and the Swallowed head (with the heap of water that closes over it) go into `TOP` so they reflect for free. The kept fish, the sunk boat, the floating lantern and the companion are sprites and use `stampR`.
- **Things that live in the water, not in the sky**: fish shadows, the giant ocean shadows, the eyes, rings and splashes, the churned water at the foot of the Swallowed head. They are drawn in the water region after the mirror and are never reflected.
- **Clouds drift always**, recoloured by the mood, except while `frozen` is 1. `frozen` is set by the forever wish and cleared only at the still-water dawn, so a frozen sky stays frozen through the night, the red, and the Home, Dark, Stay and Deep endings. **Clouds pull back with the camera**: whenever `far` > 0 (the ocean pull-back and its return, and the Still water pull-backs at sea, situations 11 and 13) they shrink toward the horizon under the sun on the same eased `far` as the boat and more of them fill the opened sky, with no seams and no two alike side by side; at `far` 0 the sky is exactly as before. A frozen sky shrinks too but does not drift.
- **Birds** only while mood < 0.5, `far` < 0.5 and not frozen. **Fish jumps** only while mood < 1.2, `far` is 0, not frozen, and the water is not still (no golden cast pending, no dialogue running). Frozen stops only the jump spawn: rings already in flight and every later ring still spread and fade.
- **Two texts never share the stage**: a thought bubble waits for the caption to end (the companion's tapped lines, and his question after `You light the lantern.`); a tap on him under a caption is a plain tap.
- **Stars** come from the sunset (or not, if forever), are removed by the red cinematic from whatever value they have, and come back briefly at the still-water dawn. They never appear in the day.
- **Ash** exists only at mood above 1.5 and is cleared by the endings that leave the red (Dark, Still water, Deep). Home, Stay and Inside keep it falling.
- **The lantern** lights at sunset 7.8 s, floats beside a sunk boat, dips once for the eyes, dies in Dark at t 8, in Still water over t 9 to 11 and in Deep at the view switch, warms in Stay, and has no glow while the boat is a far silhouette (the ocean, Still water at sea, Inside at the shore). Its glow is applied last in RGBA and follows its position. The cabin's window glow follows the cabin too, down with the sky under Home's jaw, and is keyed to `cabinLit`, not to the building.
- **Troubled ladder**: 0, then 0.22 (wish 1), 0.35 (sunset), 0.55 (red), back to 0 at the dawn. Refusals never raise it. The ocean uses 0.15 while `far > 0` and restores the previous value.
- **The companion** faces the horizon from the moment he appears until the red cinematic's pupil beat, turns back to the horizon at the still-water dawn, and in Stay stands, crouches, leaps at the sun, clings to it until its line snaps and is gone with it.
- **Kept fish alpha**: 1 in act 0, 0.7 in act 1, 0.45 in act 2, back to 1 whenever it speaks, 0 when lifted over the side, 0.05 after the silent ending.
- **`sea`** is set once by the ocean and never cleared: the mountains are gone for the rest of that run, and every scene that read MOUNT (render, sun ring, stalk, jaw) must tolerate an empty shore. Home's jaw still closes; it is the sky and a fang line at the horizon.
- **Props persist across scenes** unless a row above removes them: companion, cabin, gold, the sunk boat (the swimmer), shadows, kept fish, frozen, the open sea. A new scene never resets a prop it does not own.
- **Nothing recolours by hand.** All colour comes from the palette built from `mood` and `dim`; a prop that must read the same in every mood uses an accent index.

## 9. Build phases

Each phase ends with `npm run build`, `npm run sim` (must reach every ending that exists so far), `npm run skipcheck`, `npm run shots` (look at every PNG), `npm run domtest`, a commit, and a republish of `tools/out/test.html`.

1. Text and state: everything in sections 3 to 5 and 7 that is dialogue, captions, cards, flags, the ending composer with `#endAsked`, the fourth to sixth buttons and keys with the panel cap, the silent variant, the two-step sun drop started under the cost line, the said caption style, the refrains, the ending-cinematic captions. Placeholders: the fish wish keeps the existing shadows (steered to the horizon at every mood) until phase 3; Stay and Deep buttons do not appear until phases 4 and 6. `tools/sim.js` falls back to index 0 when a planned index does not exist.
2. Atmosphere: cloud drift, the opening row-in, the forever freeze, the eyes, the knife and the plank, the far boat, the sun glint one pixel larger, the companion turn and pupil gating in the red cinematic, the hold and caption at the red sequence.
3. Ocean and Swallowed, the shore returning closer, the shoal mechanics.
4. Companion: tap hit-testing, line pools, the Stay ending.
5. Kept path: the boat fish sprite and its ladder, the act 1 flow, the red sequence variant, the cut and silent beats.
6. Gold sink and Deep.
7. Final: sim plans for all six endings and every branch axis, domtest, CLAUDE.md, README, this file, a runtime measurement of the longest path. Done: the sim prints one line per ending id and the silent variant; skipcheck reaches the ocean window and the red sequence; the build drops full-line comments so `dist/index.html` stays under 140 KB; the shoal drain at the still-water dawn (`shoalOut`) was the one ledger row the code had not implemented.

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

0. The fisherman was given a bait by a stranger who called it cursed or blessed and laughed. He casts it with a throwaway thought, `Something interesting, for once.` The bait takes wishes literally: the golden fish surfaces and its second line is `Something interesting, you said. Here I am.` From then on everything he thinks near that bait is an order.
1. The fisherman, act 0: `I could watch that sun forever.`
2. The fish quotes it after wish 1 (`You said you could watch that sun forever. You'll get to.`) and promises after wish 2 (`You'll miss the sun. I'll bring you another.`), on every path including refusals.
3. The fish delivers it: `But first, the sun I promised you.` / `You said you could watch it forever. I listened.` and opens wish 3 with `There it is. You can watch it forever now.`

The recount at wish 3 always ends with `and the sun you wanted.`

## 2. Rules for copy

- Sentence case. Short. Eerie. Dialogue under 90 characters (the wish 3 recount may run to 125), captions under 60, card lines under 60. This file writes apostrophes straight; the game renders every one as the typographic ’.
- The fisherman never speaks in the fish's panel and never in the caption strip. His lines appear in a THOUGHT BUBBLE (section 4b): a thin comic-book bubble with small text, floating above him to the right, with a tail of small circles down to his head. He thinks four lines of his own in act 0 (the bait, the throwaway wish, the sun twice), thinks each choice he taps for a moment before the fish answers, and thinks "Take me back." on the open sea. Everything else quotes him. The companion's lines use the same bubble on his side of the boat. Narrator captions stay in the caption strip, no quotes.
- The golden fish is polite, patient and never lies. It gives exactly what was asked for and reads the player's own words back as consent. It never threatens. It is never rude, only accurate. Its rules begin with "Nobody".
- Never say memory, remember, past, stuck, grief, nostalgia, lure, or "you are the fish". "Bait" appears once in dialogue, at wish 3. The Dark ending's base card keeps its own "bait" because it shipped that way.
- No line explains a metaphor the picture already shows.
- No empty sentences. Every fish line must do at least one of three jobs: move the scene, quote the player, or show character. Two lines that can be one line are one line. The fish never says "just cast", "watch" or "done" on its own.
- Callbacks, not forks. A choice matters because a later line proves the game saw it.
- Budget: wish 3 is at most seven lines before the buttons and usually five. A full run stays under seven minutes (measured in phase 7: the longest path, kept, company, gold, answered, then Cut, runs about 3 min 50 s at 0.6 s between taps and 42 characters a second plus 0.8 s per line).

## 3. State

`STORY` gains: `kept` (bool), `firstAsk` ('company' | 'fish' | 'home' | 'nothing'), `refused` (0 to 2), `answered` (null | true | false), `ocean` ('none' | 'waited' | 'swallowed'), `said` (0 to 3, how many of the fisherman's lines have shown), `usedRepl` (set of card replacements already fired this run), `tap` and `tapPool` (how many of the companion's current line pool have shown, and which pool it was; the code uses these instead of a per-act `compTaps`), `keptNext` (kept, act 1: the next normal card closes into golden scene 2), `casts` (for the opening captions), `shown1` (species whose act 1 card showed, so act 2 picks another). Existing: `wishes[]` (granted wishes only, in order), `heard`, `goldenNext`, `actCatches`, `lastSpecies`. Saved across runs: `stillwater-endings` (list), `stillwater-runs` (count), `stillwater-last` (the last ending id).

`WS` gains: `goldKept` (0 to 1, the fish in the boat; alpha ladder 1.0 in act 0, 0.7 in act 1, 0.45 in act 2, 0.05 after the silent ending), `boatSunk` (0 to 1, the gold sink), `frozen` (0 or 1, clouds and birds stop), `far` (0 to 1 and back, the ocean camera pull-back), `sea` (0 to 1, the mountains gone; set once by the ocean and held at 1 for the rest of the run), `eyes` (0 to 1, the water full of eyes), `farBoat` (0 or 1, title only), `swallow` and `boatDrop` (the Swallowed circle and the fall), `companionFace` and `lanternWarm` (Stay), `dive` and `glint` (Deep), `shoalOut` (the still-water dawn: the shoal leaves as it reaches the horizon).

Endings: `home`, `dark`, `cut`, `stay`, `deep`, `swallowed`. Silent is a variant of `cut`. The counter says "of 6". `ENDINGS` becomes a composer: base + one variant sentence + the asked-for list; `UI.ending` receives `{title, text, asked}` and the template gets an `#endAsked` block under the text.

## 4. The script

Speaker labels: **narr** is the unnamed narrator caption, **Fisherman** is a thought bubble by the fisherman (section 4b), **Golden fish** is the fish in the dialogue panel in every act including the red, **Companion** is a bubble by the companion, **The lake** is whisper style in the dialogue panel.

### 4b. The thought bubble

A DOM element over the stage, not drawn in pixels. Thin one-pixel outline in the UI ink colour, a near-transparent fill, a rounded cloud outline (three or four bumps), and a tail of two small circles leading down and left toward the fisherman's head. Text is small (about two thirds of the panel's size), sentence case, no quotation marks, and a tiny label `Fisherman` sits on the bubble's upper edge in the same size. It sits above and to the right of the fisherman so the mountain is behind it: anchor about x 150, y 186 in internal pixels, converted to stage percentages from the live stage size (the boat's position is fixed, the stage height is not), width about 40% of the stage. It never overlaps the fish's panel: when a bubble is up, the panel is hidden, and the reverse.

Three uses:
1. **His own lines** (the three in act 0, and `Take me back.` on the sea): the bubble fades in with the text already complete, stays about 3 s or until a tap, fades out. No prompt and no bite while it is up.
2. **Choice echo**: when the player taps any choice, the panel closes, the chosen label appears in his bubble for about 1.2 s, then the fish's reply opens. This is what makes the scene a conversation. Ending choices echo too.
3. **The companion**: the same bubble, no label, tail toward the companion, anchored above and to his left (about x 160, y 190), for every line in section 6 and for `Will you stay?` (the wrong question mark stays). His question is the one bubble that waits for a choice: the two answers appear as buttons under the bubble.

### Title

Unchanged text. Two silent additions: three bone pixels of a knife on the gunwale beside the lantern, and the stern seat drawn as an empty plank. After any ending has been reached, a tiny far boat sits on the lake.

### Opening

The boat rows in from the left at dawn while the title fades (a short dip to black, then `boatX` from -208, off screen, to 0 over 4 s). Casting is not possible until it arrives. Captions, one per beat, in pace with play:

- On start, narr: `Nothing on the lake is moving except you.`
- When the boat has arrived and before the first cast, Fisherman (bubble): `The stranger's bait. Cursed or blessed, he said, and laughed.` The float carries one gold pixel (index 13) on the hook for all of act 0.
- When the first cast lands, Fisherman (bubble): `Something interesting, for once.`
- After the first card closes, Fisherman (bubble): `Look at that sun.`
- After the second card closes, Fisherman (bubble): `I could watch that sun forever.`

These four are his only lines before the fish surfaces. `First time here.` is no longer said by him; the fish still says `First time here, you said.` because he thought it, and that is the point.

While a bubble is on screen the tutorial prompt is hidden and no nibble or bite happens, so two texts never share the stage. A line that did not get to show carries over to the next beat. `STORY.said` counts them.

### Act 0, day. Three catches.

Prompts and fail copy unchanged. After catch 3: `The water goes very still.` The golden cast is as coded (sparkles, long bite, no fight).

#### Golden scene 1

The fish surfaces at the left. Splash, rings, chime. Three seconds of total silence before it speaks.

- Golden fish: `Wait. Don't gut me, fisherman.` On a later run this line is `You again. Or someone wearing you.`; if the last ending was Home: `Back out already? It doesn't usually let go.`
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
- Golden fish: `First time here, you said. Nobody comes here twice.`
- Golden fish: `What would you like, fisherman?`
- Choice: **Someone to sit with me** / **Take me where the fish are** / **A home on the shore** / **Nothing**

#### Wish 1 grants

Someone to sit with me:
- Golden fish: `Who?`
- Choice (one option): **Doesn't matter. Someone.**
- The companion fades onto the empty plank, facing the horizon. Chime.
- Golden fish: `Someone. Nobody asks who.`
- Golden fish: `If they ask you anything, don't answer.`

Take me where the fish are:
- Golden fish: `Where the fish are. I know a spot. Hold on.`
- The ocean cutscene (section 8): the shore sinks into haze, the boat shrinks to a speck on a vast lit sea, huge shapes pass beneath, one stops under the boat.
- Golden fish: `Told you. I'd let that one pass.`
- The prompt `Tap to cast` and a window of about 10 s. Cast into it and the Swallowed ending plays. Wait, and it slides away.
- The camera comes back to the boat, but the shore does not come back. The rest of the run is played on the open sea: no mountains, the horizon a clean line, the huge shapes still passing beneath toward the horizon for the rest of the game, through the sunset, the red sun and every ending. Bites come faster for the rest of the game.
- Fisherman (bubble): `Take me back.`
- Golden fish: `You said where the fish are. This is where they are.`
- Golden fish: `Look how they all go the same way.`

A home on the shore:
- The cabin lights on the far shore, directly under the sun.
- Golden fish: `A home on the shore. One has just come free.`
- Golden fish: `Every light out here is for someone. That one is for you.`

Nothing (`refused = 1`, `firstAsk = 'nothing'`):
- pause 1.2 s
- Golden fish: `Nothing. Nobody asks for nothing. I'll ask again.`
- The fish dives (if kept, the boat fish stays bright). No cost. Caption: `The lake stays glass.` Straight to act 1.

After any granted wish, the sun starts dropping as the first line begins, so the cost is spoken while the sun is visibly moving:
- Golden fish: `A wish costs a little daylight. You said you could watch that sun forever.`
- Golden fish: `You'll get to.`
- The fish dives (if kept, the boat fish dims to 0.7). The sun drops in two visible steps, about 16 px over 5 s, so it sits clearly lower in the gap between the far ranges and its reflection shortens; it does not need to touch a ridge. Check it in shots. `troubled` to 0.22. No caption: the drop is the sentence.

### Act 1, low sun. Two catches.

Cards from section 5. The companion can be tapped (section 6). After catch 2:

- released: `The water goes very still again.`
- kept: `The water goes very still. The fish in the boat does not.`

Released: the golden cast as before. Kept: the next hook is a normal fish (no sparkles, no chime), normal card, and when the card closes the fish speaks from the boat with no surfacing splash.

#### Golden scene 2

Greeting, by priority: kept and refused once > kept > refused once > default.
- kept and refused once: `You cast anyway. Habit. Still wanting nothing?`
- kept: `You cast anyway. Habit.`
- refused once: `Back again. Still wanting nothing?`
- default: `Back so soon? The lake keeps count.`

Then:
- Golden fish: `And this time?`
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
- Golden fish: `Then the sun keeps its own hours. You'll miss it. I'll bring you another.`

The fish dives (kept: the boat fish dims to 0.45). Sunset cinematic as coded. Caption after a wish: `The sun slips into the lake like a coin into a well.` After a refusal: `The sun sets the way suns do.` Then `You light the lantern.` Forever variant: `starA` held at 0 and `sunGlow` floored at 0.4 under the horizon, so the stars never come up and the glow never fully dies; the red cinematic starts from the stars it finds, so a starless night stays starless.

#### The companion's question (company only)

Right after the lantern lights, unprompted. The question mark is drawn wrong (a span with the glyph flipped and slightly off its baseline).

- Companion: `Will you stay?`
- Choice: **Yes** / **Say nothing**

Yes (`answered = true`):
- narr: `He does not turn around.`

Say nothing (`answered = false`):
- narr: `He goes back to watching the horizon.`

### Act 2, night. One catch.

The card carries a VOICE if `heard` (section 5). Once during act 2, between casts, the lantern dips for one second and for two seconds the water is full of eyes at the surface. Then it recovers. After the catch:
- released: `The water goes very still. The lantern flame leans toward it.`
- kept: `The water goes very still. The flame leans toward your feet.`

The golden cast: nothing bites for slightly too long (bite delay 1.8x), then the line goes taut and is dragged to the horizon. Kept: no sparkles and no chime; the fish is visibly in the boat.

#### Red sequence

- narr: `The line goes taut. You did not feel a bite.`
- Released: the golden fish appears above the horizon exactly where the sun set. Hold two seconds in silence; no caption.
- Kept: nothing appears in the sky. The boat fish glows back to 1. Its lines are spoken from the boat.

Released:
- Golden fish: `One wish left. But first, the sun I promised you.`
- Golden fish: `You said you could watch it forever. I listened.` (forever wished: `You said forever, then you wished for it. I listened twice.`)

Kept:
- Golden fish: `I'm right here, fisherman.`
- Golden fish: `One wish left. But first, the sun I promised you.`
- Golden fish: `You said you could watch it forever. I passed that on.`

Refused twice (either path, replaces the lines above):
- Golden fish: `One wish left. You said you could watch that sun forever, then asked for nothing twice.`
- Golden fish: `It wants to see why.`

Then the red cinematic as coded, with three changes: the companion turns at the pupil beat (inside the cinematic, before anyone speaks); the pupil slides toward the boat only if the player ever asked for something; if `heard`, at the stalk beat The lake whispers `i could watch that sun forever. i could watch that sun forever.` (the fisherman's words back from every fish at once). (The gold path's extra two-pixel sink is gone: the boat is already under.) The cinematic's own narr caption at 0.6 s stays: `Something rises where the sun went down.` There is no caption at the pupil beat.

#### Wish 3

Red style. One voice. The only insertions are the two optional lines marked below, in their places. Seven lines at most, five in a typical run.

1. Golden fish: `There it is. You can watch it forever now.`
2. Golden fish: `Every sun is bait. I should have said. It didn't come up.`
3. Golden fish, the recount: `Everything you asked for.` then the granted wishes in order as short clauses, then `and the sun you wanted.`, then `Your words, not mine.` All in one line, up to 125 characters. The clauses are the player's own labels, shifted to the second person: company `someone to sit with you`, fish `where the fish are`, home `a home on the shore`, forever `a day that lasts forever`, hear `to hear the fish`, gold `a boat full of gold`. Example: `Everything you asked for. Someone to sit with you. A boat full of gold. And the sun you wanted. Your words, not mine.` If nothing was granted: `Nobody rows this far to want nothing. So why are you here.`
4. Optional, companion present and silent: Companion: `Don't answer it. Cut the line.` Companion present and answered: Companion: `You said you'd stay.`
5. Optional, kept: Golden fish, whisper from the boat: `I'm sorry.`
6. Golden fish: `I sat where you sit. I said what you said. Three times.`
7. Golden fish: `I'd like to go home now. What would you like.`
- Choice: **Let me go home** / **Take the light away** / **Cut the line** / **Stay with them** (only if `answered`) / **Let me get my gold** (only if gold) / **Nothing** (only if `refused = 2`)

Buttons are a flex column with smaller padding when there are more than three. Keys 1 to 6 select them. The dialogue panel is capped at 46% of the stage height with the text scrolling, so the buttons never cover the turned companion. Check the five-button case in shots at 320 px width.

#### Endings

**Home.** Golden fish: `Home. Yes. Come inside.` If kept, Golden fish, whisper: `Thank you.` The jaws cinematic as coded. Released: a caption at 1.5 s, `Something gold slips by you on the way down.`

**Dark.** Golden fish: `As you wish. Without light you won't see the teeth.` If kept, Golden fish, whisper: `Don't leave me in the boat.` The dark cinematic as coded, plus one frame of the water full of eyes in the last lantern flicker. Released: a caption at 2 s, for 3 s, while the dim is still under half: `Something gold circles the boat. It has time.`

**Still water.** narr: `You reach for the knife on the gunwale.` Golden fish: `No. Nobody cuts the` The cut cinematic as coded, plus: the gold pile goes over with the line, the cabin window goes dark at the dawn beat, the shadows steer to the horizon at full weight and are removed as they arrive, the companion stays in the stern. No caption at 3.4 s on any path: the interrupted word, the snap and the splash say it (released: the sky fish drops below the horizon with a splash). Kept adds a splash beside the boat at the dawn beat with `goldKept` to 0 and the caption `You lift the golden fish over the side.`

**Stay.** Companion: `Then stay.` Golden fish: `Someone to sit with you. It's what you asked for.` The stay cinematic (section 8).

**Deep.** Golden fish: `It's still down there. All of it. Mind the waterline.` The deep cinematic (section 8).

**Silent.** narr: `You say nothing.` pause 3 s. narr: `It waits. Then it splashes its tail once and goes down.` If kept, `goldKept` drops to 0.05 with no caption. The cut cinematic with a silent flag: no snap sounds, the stalk sinks with the disc instead of being cut, the 3.4 s caption is `The line goes slack.`; if kept the boat fish goes over at the dawn beat. Counts as Still water.

**Swallowed** (act 0, ocean). narr: `The float lands on something that is not water.` The swallow cinematic (section 8).

#### Ending cards

Card = the base text (unchanged for the three original endings) + one variant sentence + the asked-for list. Variant priority: silent > kept > one refusal (Still water only; a run with exactly one refusal always has one granted wish, so this line has to outrank the wish sentence to ever show) > the most relevant wish (order given per ending) > refused twice. The list is `You asked for:` followed by the wish 1 and wish 2 labels taken, in order (the wish 3 button is the ending, not a request), or `You asked for nothing.`; with exactly one refusal the header is `You asked for nothing, once. And for:`. Every ending card carries the list, Stay, Deep and Swallowed included.

Home. Base: `The lake is quiet again. The fish are hungry. Somewhere, a new sun is rising for the next fisherman.`
- kept: `The golden fish slips out of the boat as you go in.`
- home > company > gold > fish > hear > forever: `The light on the shore goes out. Nobody was inside.` / `The seat behind you is empty now. It was your turn.` / `The gold goes down first. It has done this before.` / `The lake is full. It was always full.` / `You know the words already. You will say them.` / `The day does not end. You aren't in it.`
- refused twice: `You asked for nothing, and then for home. Home was the only thing it had.`

Dark. Base: `You sit with the lantern until it gutters out. Sometimes something takes the bait. You never reel it in.`
- kept: `The golden fish dries in the bottom of the boat. It stops asking before you do.`
- hear > fish > forever > company > gold > home: `The lake keeps talking. You stop answering.` / `Something is always biting. You let them.` / `The day never ends. It never begins either.` / `Someone breathes behind you all night. You do not turn around.` / `The boat rides low. You do not bail.` / `The light on the shore stays on. Nobody comes down.`
- refused twice: `You asked for nothing twice. This is what it looks like.`

Still water. Base: `You row until the water is only water. You never fish here again. Some evenings, the sunset looks back.`
- kept: `You lifted it over the side. It let you.`
- company > home > fish > gold > forever > hear: `There is someone in the stern. You do not ask. You row.` / `The cabin is dark. You do not check whether anyone left.` / `The fish behind you all face one way. You do not look.` / `The gold is on the bottom. Your hands stayed on the oars.` / `Dawn comes anyway. You had forgotten it could.` / `You can still hear them from the shore. You stop listening.`
- refused twice: `Twice you said nothing. The knife said it a third time.`
- one refusal (outranks the wish sentence): `You asked once for nothing. It kept count.`

Silent. Card: `You wanted nothing. It had nothing to show you. You row until the water is only water. Some evenings, the sunset looks back.`

Stay. Card: `You stay. He never says who he is and you never ask. The light on the shore is warm. The sun does not come up, and after a while you stop minding.`
- home wished: `It was your cabin all along.`

Deep. Card: `The gold is where you left it. So is everything else. The water is warmer than you thought, and full of light, and there is no bottom.`
- kept: `The golden fish goes down with you. It knows the way.`

Swallowed. Card: `You asked to be taken where the fish are. Somewhere far above, the sun is still shining on a lake with no boat on it.`

## 5. Cards

Names per act unchanged. One line per species per act:

| Species | Act 0 | Act 1 | Act 2 |
|---|---|---|---|
| Glass perch / Glass perch / Eyeless perch | You can see its heart beating through it. | There is an old hook inside it. Not yours. | No eyes. It still turns toward the lantern. |
| Mirror char / Mirror char / Hollow char | Its scales show you the sky. You check. It matches. | Its scales show you a red sky. | Its scales show your boat from underneath. |
| Blue smelt / Grinning smelt / Grinning smelt | Small and cold. Not afraid of you at all. | It has teeth. Smelt don't have teeth. | Its teeth point inward. |
| Fjord trout / Fjord trout / Drowned trout | It fought like it had somewhere to be. | It keeps looking at the sun. | It drowned. It is a fish. It drowned. |
| Needle eel / Knot eel / Endless eel | Longer than it has any right to be. | It knotted itself so you couldn't keep it. | It is still coming out of the water. |
| Pale grayling / Pale grayling / Ash grayling | It smells of snow. | It smells of smoke. | It smells like you. |

Conditional replacements: at most one per card, each fires at most once per run (`STORY.usedRepl`), first match wins, checked in `makeCatch`:
- company, char act 2: `Its scales show someone sitting behind you.`
- kept, first act 1 card: `There is a gold scale in its mouth.`
- fish, trout act 2: `Its stomach is full of hooks. All of them yours.`
- fish, the first act 1 card not already replaced: `It swam to the hook. It didn't have to.`
- home, grayling act 1: `It smells of woodsmoke. Someone's home.`
- gold, any act 2 card: `Heavy for its size. Something in it clinks.`
- refused twice, act 2 card: `It is looking at you the way you look at it.`
- second run or later, first act 0 card: `There is an old hook in its lip.` When it fired, the perch is excluded from the act 1 picks so the two hook lines never both show.

The act 2 species is chosen from those whose act 1 line was not shown this run.

VOICE, in the accent colour on the act 2 card, only if `heard`, keyed to `firstAsk`:
- company: `I wished for company too. Now I have plenty.`
- fish: `I wished for more fish too. Here I am.`
- home: `I wished for a home too. This is it.`
- nothing: `I wanted nothing too. It waited.`

## 6. The companion

He sits on the stern plank facing the horizon and never turns until the pupil beat of the red cinematic. Tapping him shows one said-style caption instead of casting. He only ever says the fisherman's words, bent a little: in daylight they are the fisherman's words, at night they start to be his, in the red he says the one thing the fisherman never said. Pools, drawn in order then repeating the last:

- Act 0 and 1: `Look at that sun.` / `First time here.` / `We could watch that sun forever.` / `Still there.` (the last repeats while the sun sinks)
- Act 2: `Look at that sun.` / `It's coming back.` / `Don't you want it to?` (there is no sun; the words have not changed, the world has)
- In the red, after he has turned: `Cut the line.` (if answered: `You said.`)
- Second run or later, his first line becomes: `First time here. You said that last time.`

He never answers anything. There is no way to ask.

Engine: the stage's pointerdown maps the tap to internal pixels (`ix = (clientX - rect.left) * W / rect.width`, the same for y) and asks `companionHit(ix, iy)`; a hit calls `companionTap()`, anything else calls `press()`, which takes no coordinates. The hit box is his sprite box padded by 3 px (`COMP_PAD`; about x 165 to 193, y 222 to 250 internal, following `boatX`). It applies only when `WS.companion > 0.5`, `WS.far <= 0.5` and the phase is `ready`, and in the red while `WS.companionTurn > 0.5` and choices are showing. Keyboard, the sim and `testCatch` call `press()` bare, which never hits. `companionTap()` and `companionHit()` are exported for tools.

## 7. Across runs

`stillwater-runs` counts completed runs and `stillwater-last` stores the last ending id. On any later run:
- The title shows a tiny far boat on the lake.
- The golden fish's first line changes (section 4, Golden scene 1).
- The first act 0 card and the companion's first line change as above.

Nothing is locked behind replay.

## 8. Cutscenes

Timed functions in the existing cinematic system. Durations are targets.

- **Opening** (4 s, under the title fade): a short dip to black, then `boatX` from -208 (off screen; -120 would leave the hull on screen) to 0, eased out. Row sound, two strokes. No cast until it arrives.
- **Ocean** (about 25 s): mountains sink toward the horizon and blend into the sky colour until gone (`sea` 0 to 1 over 6 s, and `sea` then stays 1 for the rest of the run). The camera pulls back (`far` 0 to 1 over the same 6 s): the boat swaps through three smaller silhouettes to a few pixels at the centre; rod, line, float and lantern hidden while `far > 0.5`. Shadows spawn large and larger (2x to 6x), a dozen. Then the big one: it does not rise from below and it does not arrive fast. It enters from the left edge of the screen, deep (drawn darker and lower in the water), and crosses left to right over about 8 s, slowing as it comes, rising a little as it slows, and settles under the boat. The others scatter from it as it passes. Its sound is weight, not a scare: a low swell (sub-bass, a slow filtered rumble) that rises over the crossing and holds while it sits under the boat, with no attack, no stinger and no one-shot hit. The player should feel the mass before it stops. `Told you. I'd let that one pass.` Then the prompt `Tap to cast`. If the player casts within about 10 s, the float lands on it and the Swallowed cinematic starts. Otherwise the shape slides off left over 4 s and the camera returns (`far` back to 0 over 4 s) while `sea` stays 1: the boat is back at full size on an empty horizon with the huge shapes still passing beneath. Then the bubble `Take me back.` and the fish's two lines. No shore ever returns on this path; `shoreShift` is not used. Skip fish acts as a cast during the window.
- **The open sea** (the rest of a fish-wish run): `sea` 1 hides the mountains everywhere they are read (render, sun ring, stalk, jaw). The sunset sets the sun into the sea; the red sun rises from the sea; Home's jaw closes with the sky sliding down onto a fang line at the horizon with no mountains; Still water rows away across open water; Deep and Dark as usual. The cabin and the companion cannot exist on this path (they are wish 1 too). The giant shapes keep passing beneath at a slow rate, all toward the horizon, at every mood.
- **Swallowed** (7.6 s): the float flies onto the big one and lands at 0.7 s, the caption at 1.1 s, then the water inside a growing circle around the boat goes to the darkest index with a rippling edge (from 1.6 s), the boat drops into it at 4.6 s, black and crunch at 7.1 s.
- **Gold sink** (6 s): `boatSunk` 0 to 1. The whole boat sinks: over 4 s the hull descends until it is fully under the surface (rows below the waterline masked by water), with bubbles and two rings, the gold glinting once as it goes. The fisherman does not go with it. From `boatSunk` 0.6 he is drawn as a swimmer: head, shoulders and one arm above the surface holding the rod up, the rest masked by water, at the same x as before; the lantern floats beside him at water level with its glow on the water; the companion, if present, floats too, sitting on the surface at his seat's position, still facing the horizon, as if nothing happened; the kept fish, if present, swims beside the fisherman at the surface, glowing. Persists for the rest of the run: casting, the float and the reel work from the water, the rod tip is lower, and every later cutscene that moved `boatX` moves the swimmer instead. Ending cards on this path swap one verb: Still water and Silent say `You swim until the water is only water.`, Dark says `You hang in the water beside the lantern until it gutters out.` The Deep ending is the natural end of it: he goes down after the boat.
- **Kept fish**: a sprite about 10 by 4 in the gold indices 13 to 16 with an open-mouth variant used while a Golden fish line is typing (the same talking test as the sky fish), stamped with the reflecting stamp at about (bx + 40, WL - 10). Its alpha follows the ladder in section 3 and returns to 1 whenever it speaks.
- **Forever** (instant on grant): `frozen = 1`. Cloud drift stops, birds hang, fish-jump rings stop, the sun holds until the sunset cinematic. Nothing says so.
- **Eyes** (2 s, once in act 2 between casts): `lanternFlicker` to 0.1 for the first second, `eyes` 0 to 1 to 0 over 2 s: about eight pairs of red-eye pixels (index 21) on the two or three surface rows near the boat, positions fixed per run, faint reflections. Reused for one frame in the dark ending's last flicker.
- **Companion turn** moves from wish 3 into the red cinematic at the pupil beat.
- **Stay** (14 s): the companion turns to face the fisherman (a face variant with lantern-coloured eyes, not red), `boatX` drifts toward the cabin light over 8 s (toward the left shore if there is no cabin), the red sun does not move, the lantern glow warms, slow fade to black over the last 3 s.
- **Deep** (14 s): the horizon rises past the top of the screen over 6 s (the mirror's source row shifts so the reflection fills the frame), the palette dims toward the night ramp, stars appear below, the boat becomes a silhouette seen from beneath near the top, the gold pile glints once, fade.
- **Silent**: the cut cinematic with the silent flag (section 4, Endings).

## 8b. World state ledger

The world is a set of numbers in `WS`. Every scene below says which of them it OWNS (may change) and what it must leave alone. Anything not listed for a scene holds its current value. Values are the engine's: mood 0 day, 1 night, 2 blood; the sun at rest is `SUN0Y`; the horizon is `HY`.

| Scene | Owns and changes | Must hold |
|---|---|---|
| Title | `farBoat` (1 if any run finished), clouds drift, birds, fish jumps | mood 0, sun at rest, glow 1, troubled 0, no lantern |
| Opening row-in | `boatX` -208 to 0 over 4 s, under a 0.4 s dip to black | everything else as the title |
| Act 0 play | nothing | mood 0, sun at rest, troubled 0 |
| Golden scene 1 | the sky fish (`goldFish`) appears and dives; kept: `goldKept` 0 to 1 and no sky fish | the world |
| Wish 1 grant | company: `companion` 0 to 1 over 2.2 s. Home: `cabin` 0 to 1 over 2.2 s. Fish: the ocean cutscene, then `sea` 1 for good, `fishShadows` 1 and the giant shapes beneath. Nothing: no change | mood 0 |
| Cost drop (after any granted wish 1) | `sunY` +8, hold 1 s, +8 (about 5 s total), starting as the first cost line begins; `troubled` to 0.22 | mood 0; `sunX` never moves |
| Ocean | `sea` 0 to 1 over 6 s and then held at 1 for the rest of the run (mountains gone for good); `far` 0 to 1 over 6 s and back to 0 over 4 s at the end (camera only); boat silhouettes by `far`; giant shadows, kept alive at a slow rate for the rest of the run; the big one crosses left to right over about 8 s and settles under the boat, with a rising low swell and no stinger; `troubled` 0.15 while `far > 0`, then 0.22 with the cost; birds hidden while `sea > 0.5` | sun, mood, clouds keep drifting; no companion or cabin can exist on this path |
| Open sea play (fish-wish runs) | the giant shadows keep passing | `sea` 1; everything else as the equivalent lake scene |
| Swallowed | the circle radius 0 to three boat widths over 4 s; the boat's y offset drops after 3 s; black at 5.5 s | `far` 1, sun, mood |
| Act 1 play | nothing | mood 0, sun lowered, troubled 0.22, wish 1 props |
| Golden scene 2 | sky fish appears and dives; kept: `goldKept` to 1 while speaking, then 0.7 | the world |
| Wish 2 grant | forever: `frozen` 1. Gold: `gold` 0 to 1 over 1.5 s, then the gold sink (`boatSunk` 0 to 1 over 6 s; the boat is gone, the fisherman swims). Hear, Nothing: no change | mood 0 |
| Sunset | `sunY` to `HY + 14` over 7.5 s; `mood` 0 to 1 over t 1 to 8; `sunGlow` to 0.12 (forever: floor 0.4); `horizGlow` to 0.3; `starA` to 1 from t 5 (forever: stays 0); `troubled` to 0.35; `lantern` 1 at 7.8 s | `sunX`, companion, cabin, gold, sunk boat, `frozen` (a frozen sky stays frozen through the night) |
| Companion question | nothing | the night |
| Act 2 play | once: `lanternFlicker` 0.1 for 1 s and `eyes` 0 to 1 to 0 over 2 s | mood 1, sun below the horizon, stars as the sunset left them |
| Red sequence | the float dragged to the horizon; released: sky fish at the sun's spot; kept: `goldKept` to 1 | mood 1, stars |
| Red cinematic | `sunKind` 1, `sunR` 16, `sunY` `HY + 24` to 178 over 8.5 s; `mood` 1 to 2 over t 1.5 to 9; `sunGlow` to 1.25; `horizGlow` to 1.3; `starA` from whatever it finds to 0 by t 6; `troubled` to 0.55; `ash` 0 to 1 from t 6; `stalk` from t 9.2; `pupil` from t 12; `companionTurn` 1 at t 13.6; `pupilDx` from t 13.6 only if the player ever asked; heartbeat from t 13.6 | lantern 1, cabin, gold, sunk boat, `frozen`, `sea` |
| Wish 3 | nothing | the red |
| Home | `jaw` 0 to 1 over 4.2 s, fangs, black at 4.15 s | everything in the red |
| Dark | `lid` 0 to 1 over 1.6 s; `sunGlow` and `horizGlow` to 0 over 3 s; `dim` 0 to 11 over t 1 to 5.5; `ash` to 0 over 3 s; `lanternFlicker` random over t 6 to 8 with one `eyes` frame; `lantern` 0 at t 8; black at 8.3 | pupil hidden under the lid, stalk stays, companion stays turned |
| Still water | `lineCut`; released: the sky fish drops below the horizon with a splash; `stalkCut` (silent: `stalk` to 0 instead, no snaps); `sunY` to `HY + 28` by t 2.6; `sunGlow` to 0, `horizGlow` to 0.15; `mood` 2 to 1 (t 3 to 6) to 0 (t 6 to 12); `ash` to 0; `starA` 0 to 1 to 0; `troubled` to 0; `gold` to 0 at the cut; at t 6 (dawn): `sunKind` 0, `sunR` 8, `stalk` 0, `companionTurn` 0, cabin light off, `frozen` 0, kept: splash and `goldKept` 0; `shoalOut` 1 from the cut: the shadows steer to the horizon at full weight, hurry, and are removed as they arrive; `sunY` back to rest with glow 1 by t 12.5; `lantern` 0 over t 9 to 11; `boatX` to +120 from t 11 | `sunX`; the companion stays in the stern facing the horizon; a sunk boat stays sunk (he rows it anyway) |
| Stay | `companionTurn` to the face variant; `boatX` toward the cabin (or the left shore) over 8 s; `pupilDx` to 0 (the eye stops tracking); lantern glow radius up; heartbeat slows and stops; black over the last 3 s | `sunY` 178, mood 2, ash keeps falling, stalk |
| Deep | `dive` 0 to 1 over 6 s (the horizon row rises past the top; the mirror fills the frame); `dim` 0 to 6; stars in the lower half; the boat as a silhouette from beneath near the top; `ash` to 0; lantern glow to 0; one gold glint; black | mood 2 under the dim, `sunX` |
| Restart | `resetWS` returns every field to the title values | |

## 8c. Consistency rules

- **Mood changes only in cinematics**: sunset (0 to 1), red (1 to 2), still water (2 to 0), deep (dim only). Never during play or dialogue.
- **The sun moves only** in the cost drop, the sunset, the red cinematic, the still-water dawn, and the frozen hold. `sunX` is a constant; the cabin sits under it for the whole game. The sun's reflection is one pixel larger than the disc.
- **The reflection is never drawn by hand.** Everything above the horizon is in `TOP` and is mirrored by `computeWater` with the ripple scaled by `troubled`; sprites use the reflecting stamp. The far boat, the cabin and the mountains go into `TOP` so they reflect for free. The kept fish, the sunk boat, the floating lantern and the companion are sprites and use `stampR`.
- **Things that live in the water, not in the sky**: fish shadows, the giant ocean shadows, the eyes, rings and splashes, the Swallowed circle. They are drawn in the water region after the mirror and are never reflected.
- **Clouds drift always**, recoloured by the mood, except while `frozen` is 1. `frozen` is set by the forever wish and cleared only at the still-water dawn, so a frozen sky stays frozen through the night, the red, and the Home, Dark, Stay and Deep endings.
- **Birds** only while mood < 0.5, `far` < 0.5 and not frozen. **Fish jumps** only while mood < 1.2, `far` is 0 and not frozen.
- **Stars** come from the sunset (or not, if forever), are removed by the red cinematic from whatever value they have, and come back briefly at the still-water dawn. They never appear in the day.
- **Ash** exists only at mood above 1.5 and is cleared by the endings that leave the red (Dark, Still water, Deep). Home and Stay keep it falling.
- **The lantern** lights at sunset 7.8 s, floats beside a sunk boat, dips once for the eyes, dies in Dark at t 8 and in Still water over t 9 to 11, and warms in Stay. Its glow is applied last in RGBA and follows its position.
- **Troubled ladder**: 0, then 0.22 (wish 1), 0.35 (sunset), 0.55 (red), back to 0 at the dawn. Refusals never raise it. The ocean uses 0.15 while `far > 0` and restores the previous value.
- **The companion** faces the horizon from the moment he appears until the red cinematic's pupil beat, turns back to the horizon at the still-water dawn, and faces the fisherman only in Stay.
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

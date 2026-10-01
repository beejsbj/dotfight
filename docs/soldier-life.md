# Soldier life

Burooj asked for soldiers you want to protect: a little heart, with no eyes or faces. They stay scribble shapes, and whatever they feel has to come from motion, timing, sound, and how the ink behaves.

This builds on the living boil (PR #5): **alive means still being drawn.** A standing soldier's dot swaps between three drawings of itself, like a cartoon's lines crawling; the dead hold still. (This was first built on a "draw" boil, a pen scribbling each dot round and round. Burooj preferred the swap, so the bodies now ride on the swapped dots.) That gives a faceless dot two things to act with, which the rest of this leans on:

- **His body.** His dot can sit a little off his spot, squash and stretch along an axis, and swell or shrink. That's the whole of Luxo Jr.'s and La Linea's vocabulary, and it fits a dot.
- **His heartbeat.** How fast his drawings swap is his pulse. They swap steadily when he's calm, race when he's excited or frightened, and **stop dead** when a comrade is crossed out, the way you hold your breath. The dead are already still, so a living soldier going still for a beat reads immediately.

The **flinch** is the headline: Burooj's favourite from the first look, so it got the most care (below). The **volley** is his second ask: a lunger who lands in an enemy camp is shot on the spot by the men inside.

Everything is presentation only. The engine is untouched, and nothing random touches game state: poses are seeded from a soldier's id and the clock, so a pinned clock replays the same motion. Poses are key drawings sampled on the boil's 12 fps grid, so the soldiers are animated on twos, like hand-drawn animation, and a reaction is a short run of drawings (crouch, spring, hang, land, settle) rather than a tween.

## What's built

Each idea has its own switch in `LIFE` (`src/life.ts`). In a dev build, `pft.LIFE.voices = false` changes one live.

| # | Idea | What you see and hear | Switch |
|---|---|---|---|
| 1 | **A body, and a pulse** | His scribble is his pulse: steady when calm, racing when excited or scared, stopped dead when he holds his breath. On his side's go, now and then one does a little ready-hop (screen-up, stretched on the way up, squashed on landing), each at his own moments. The waiting side just stands, scribbling. | `LIFE.idle` |
| 2 | **The line, and the flinch** | When a pen points your way (you aiming, or Dawood-bot lining up), the men in its cone cower away from it, shrink, tremble and race. **As ink goes by, anyone it passes within 85 units flinches** (see below). A man it will cross out rears up tall, scribbling wildly, for the few frames before it reaches him. The shooter is knocked back along his shot. | `LIFE.line` |
| 3 | **A camp's feelings, and the volley** | A kill: the shooter's camp cheers in a ripple (hops back to back, more for a multi-kill, the shooter highest). A man crossed out: his campmates hold still, their scribbles stopped, leaning slightly toward his cross, then come back slowly and a little smaller. The last three of a side huddle toward each other and tremble, hearts racing. **A lunger who lands in the camp is shot on the spot** (see below). | `LIFE.crowd` |
| 4 | **The one in your hand** | Picked up, he does a little crouch and pops up tall; his campmates turn to him (a lean and a stretch his way, rippling outward). Under the pull he winds up, stretched along the line and drawn back from it, shivering at full. On a move he's smeared along his ink as he rides it and lands squashed, then springs up. | `LIFE.chosen` |
| 5 | **A camp's pulse** | A camp's ring swaps briskly when it's full and tiredly as it empties (at the last man, half pace). It hurries while its men are in the line of fire, and holds still for a beat when one of them falls. | `LIFE.camps` |
| 6 | **Voices** | Tiny synthesised gibberish, one pitch per soldier, **occasional, never a chorus** (Burooj: "I want sounds for them, but not this much"). Each moment gets one voice, now and then two, never everyone: a shot through a camp is the gasp of the man it crosses out, or the squeak of the man it grazes, and sometimes a cheer or an "oh..." after; a volley is one "ta!" and his gasp. Picked up, he says "hm? ba!" about half the time (now and then a campmate mutters instead). At most two voices at once, spaced, each word on a long cooldown (3 to 30s), and quieter than before (about -4 dB). Silent in replays. | `LIFE.voices`, and **Settings → voices: on / soft / off** |
| 7 | **Pencil notes** | Rarely, a man says something in writing: a word or two pencilled in his side's colour in a gap on the page beside him, a loose pencil ring round it, a small tail to him and a loose ring round his dot, so who's talking is plain from bird's-eye. The big stuff comes from a **camp** instead, written arcing along its ring: battle cries as a man lunges or a big snipe fires, a camp that shot an intruder, the last stand, the win, and chants in beats ("Da-wood! Da-wood!"). Each line has a **mood** with its own hand: tiny (only caught leaning in), whisper, say, shout (bigger, stretched, leaning, in a spiky burst, with shout marks off the ring), chant (a word a beat, a tick under each). Lines grow with the war's heat (turns, crosses, last stands): "for Dawood!" early, "fooor Dawooood!" late; a shout's size grows with it too, capped, and a long line wraps or is written smaller. The moments (`LINES` in `bubble.ts`): picked up, aimed with, a near miss, a pen pointed at him, a kill claimed, a campmate mourned, marching off, arriving; and stray thoughts on your go picked by the situation (`strayKind`): plain, cocky or gloomy by the score, existential, tired and cowardly, banter at the other side by its pen name, jokes about shapes and colours, the paper they're on, inside or outside a ring, the hour of the day ("past your bedtime"), yawns and crickets in a long wait, tiny whispers, an exchange (a line and a nearby comrade's reply, the one time two notes are up), a chant now and then. It's written **at whatever angle finds clear paper**, never upside down for the reader; written the way a hand would, read, then **rubbed out** by an eraser (a ghost, a smudge, crumbs), never inked into the append-only page. One on the page at most (plus one reply), 11s between them (a shout or chant after 5s), and most chances pass. Seeded, silent in replays; reduced motion writes it at once and takes it away at once. | `LIFE.bubbles`, `NOTE` in `scene.ts` |
| 8 | **Unit cam** | While leaning in with a man in hand, **tap him again**. The camera drops down low behind him, turned to look where he looks (down your last cancelled pull, or at the nearest enemy): the squares run to a dark horizon, his camp's ring is a fence round him, enemy camps sit low in the fog. He says "hm?" and hops "hup!" when it gets there. After about 2.4s (0.5s down, 1.5s held, 0.4s up) it stands back up to where you were and the pen drops back onto him. Any touch skips it. The status line teaches it ("or tap him again") until you've tried it once. | `LIFE.unitCam` |
| 9 | **The pen** | Set down on a dot, it rocks a few times finding its balance, then stands. At full pull it shivers under the finger. Put down, it lifts off and fades instead of vanishing. | `LIFE.pen` |
| + | **Haptics** | For your own men only: your camp cheering your kill (a patter), the bot's ink going right past one of yours (a tick), the unit cam's drop (a soft double step), your side's last stand (two slow heartbeats), a volley on your man (a rattle of jabs). This runs on Android's `vibrate` today. With feel/haptics (PR #7), one line at boot routes it through `haptic()` and its iPhone backend; see `src/feel.ts`. | `LIFE.haptics` |

### The flinch

The flinch is a little performance, fifteen drawings at 12 fps:

1. **He sees it coming.** Two drawings before the ink's head reaches him, he leans away from the line, tight and tall.
2. **It goes by.** He jerks away, flattened against the air and shrunk, and his scribble races at four times its pace. That's the drawing the ink passes on.
3. **He shakes.** Six drawings of dying side-to-side shake as he eases back.
4. **Phew.** A big breath out: he swells, and his scribble slows to less than half its pace for a moment, then comes back to itself.

It's generous: anyone within 85 units of the line jumps, and a near-ish miss still makes a real jump (the falloff is gentle). From bird's-eye, where you watch the ink land, it's drawn up to 1.6x bigger, still inside his box. A close one makes the men right beside him twitch a beat later. The closest squeaks "eep" as it passes and one says "phew" after. Your own men near your line flinch too, a little less. If it's the bot's ink going past one of yours, you feel a tick.

### The volley

When a lunger lands inside an enemy camp while anyone's home, the men inside turn on him:

1. Every living defender rounds on him, a stretch his way.
2. They jab, in a fast ripple round the ring starting from the man nearest him, 55 ms apart. Each draws back and lunges, and a tiny quick line shoots from his dot to the intruder's ("ta! ta! ta!"). Each jab jolts the intruder, who rears up.
3. The last jab lands and he's crossed out in the camp's ink (a gasp, cut off; the snag's scratch and thud). He stops being drawn.
4. The camp gives a grim little cheer, and its pen stops for a beat.

It's quick: a full camp is done in well under a second (nine jabs: the cross at about 0.8s). An empty ring does nothing. The jabs are a pen's flick, not a mark: they're drawn on the live layer and gone in half a second. `planVolley()` is pure and tested.

**The rule isn't on this branch.** The lunge death lives on the rules-lab branches (on rules/lab-2 the engine reports `o.crashed = <base>` with a "lost" cross), so here the volley plays by hand: `pft.volley(baseId, soldierId)`. `fire()` already holds the call site. When `o.crashed` arrives, the volley starts as he lands, and the engine's own "lost" cross is held back to land on the last jab (the capture used the hand trigger after flicking a man into the middle of a camp). Two things to finish when the rule lands:

- `lifeOf` should keep him standing, at the end of his line, until that cross lands.
- The pen, falling flat at the end of his line, lies over the camp for the first jabs. Lifting it sooner on a crash would clear the view.

### Why these, in this order

The most heart for the least code came from the two things a boiling dot already had: a body and a pulse. After that, it came from making the page react to the one moment that matters, a flick, from both sides: **dread** before it (a pen pointing at you), **flinch** and **gasp** as it lands, **grief** and **joy** after. That's what makes you want to protect them. The camp's pen was nearly free once its head was integrated. Voices do the most for the least on a 5-pixel dot seen from bird's-eye, which is where you watch kills land. The unit cam and the pen are the playful ones Burooj asked for.

### Where it doesn't reach

- **Reduced motion:** no boil, so no bodies (everything is ink on the page, as before), no pen rocking or shiver, no ride smear. The unit cam becomes a flat, close look with no swoop. Voices and haptics still carry what happens: that's how it reduces the motion but keeps the meaning.
- **Slow phones:** the boil's own guard (the slow-device probe, and its tick budget) switches it off, and the bodies with it. Voices still play.
- **Breathing** was built, then cut: a slow swell was a half-pixel change on a dot leaning in (invisible), and it sent every soldier through the resampled draw every tick. The scribble is his breath.
- **Unit cam at "eye level":** honestly, it's a low over-the-shoulder shot. A dot is ink with no height, so there's no literal eye level to get down to. Tilted further, the page flattens into a thin strip and half the screen goes dark; the chosen framing (zoom 5.5, tilt 1.15, him at 76% down the screen) keeps the page running to a horizon with the enemy in view.

## Ideas considered and not built

- **Eyes, faces, arms.** Ruled out by the brief, and rightly: the scribble is the character.
- **Soldiers actually shuffling closer together.** That moves dots on the page, which is game state and rules. Leaning within a few units of the spot gives the huddle without moving anyone.
- **A death animation** (the dot falling over, fading, a little soul rising). The dead must be exactly the page's ink the moment the cross lands. Instead, the gasp before it and the camp's stillness after it carry the death.
- **Per-soldier temperaments** (brave ones, timid ones). It's another tuning surface, and unreadable at 5 px. Only the voice's pitch is individual.
- **Idle chatter** (murmurs from a camp now and then). It gets annoying fast. The voices only answer to things that happen.
- **Soldiers everywhere turning to follow the pen as you aim.** Too busy. Only the chosen man's campmates turn, and only the men in the line of fire react.
- **A camp's ring tightening (shrinking) when threatened.** It would mean retracing the whole ring every tick, not just round its pen's head. Hurrying the pen says the same thing at almost no cost.
- **Unit cam while you pull** (looking down the line as you aim). Turning the camera under a pull would move the aim under your thumb.
- **Paper flex or cockle under a hard flick.** CSS can't bend a layer, and warping the page means redrawing it, which breaks the append-only page. The camera shake on each cross already sells the hit.
- **Ink dust where a line lands, a page breathing under the lamp.** Dust is cheap on the live layer but adds little heart next to the snag, cross and shake. A breathing page reads as the camera zooming, like a bug.
- **The pen sputtering when it runs out of ink.** The refill never really runs dry (the ink bar bottoms out at 5%), so there's no moment to hang it on.
- **Slow motion on kills.** It changes the game's timing; the ink's snags already give each kill its beat.
- **Stereo voices by page position.** Phones are mostly one speaker, held close.
- **A haptic for every hop or voice.** That's buzzing. Only five moments, for your own men.

## How it stays cheap

The architecture from PR #5 is unchanged. The page is append-only, and only living things are drawn on their small page-space boil layers, placed by CSS.

- **A soldier's body costs one transformed `drawImage`.** He's his own swap sprite, as in PR #5, drawn through his pose's matrix instead of the identity. His box on the boil layer has room for the largest pose (`LIFE_BOX`, and a test pins every pose inside it), so the layer's dirty rectangles still clear exactly what was drawn.
- **A man is redrawn only when his drawing or his pose changes.** His look is his drawing plus his pose (to an eighth of a page unit), so a man at rest is redrawn at the swap rate, exactly as in PR #5, and a man mid-reaction on the 12 fps grid. A redraw under someone else's box draws him in the pose he was last drawn in, never a new one, so he's never half-moved.
- **The heartbeat is integrated**, a frame at a time, and picks which of his three drawings shows. No new sprites. A camp's pulse is integrated the same way; a camp holding its breath redraws nothing.
- **A note is pencil words, a ring, a tail and a ring round the speaker on the `#talk` layer** (the live layer's blend, its own dirty box), redrawn only while it's written or rubbed out (on twos), or while the camera moves. A camp's note is `arcText` along its ring (`drawBaseNote`), on the side nearest the top of the screen that's on the page. An exchange's reply is a second note on the same layer; the layer's dirty box is the union. The eraser is `rubOut` in `ink.ts`: two seeded zigzag scrubs of `destination-out` strokes (the first at 72%, leaving the ghost; the second lifting the rest), a faint smear of the lead along the first, and crumbs; at the end nothing is left on the layer, so the incremental redraw matches a full one. The gap search (`noteSpot`) runs once per note over the marks near him (geometry only, no pixel reads): eleven angles (screen-relative, so the reader never sees it upside down) by two rings of twelve spots, each turned rectangle scored by the men, camp rings, lines and crosses it would cover plus a cost for the angle (0 upright, rising to 3.8 at vertical), and remembers the spot (page units) and the angle. A shout's ring is a spiky burst and its words are stretched and leaning; a long line is written smaller rather than across half the screen.
- **A pose is worked out once per soldier per tick**, and most men, most ticks, return rest at once: no reactions, not in hand, not a campmate of the man in hand, no pen pointed at him, not mid-hop. A man at rest is drawn by the plain copy, exactly as before. Last stands are counted once a frame, and the line of fire once per rendered frame. `planFlick` runs once per flick.
- **A living soldier's dirty rectangle is where he was drawn and where he's going**, not all the room he has to move in, so neighbours aren't redrawn for nothing. Checked pixel by pixel: incremental redraws with every living soldier mid-reaction match a from-scratch redraw exactly (0 of 2M pixels over four rounds), and with the union broken on purpose the same check finds the trails.
- **Voices are a handful of WebAudio nodes per syllable**, at most two phrases at once.

### Perf

The existing `perf` playtest was run at 6x CPU throttle in headless Chrome, 390×844, with the boil pinned on and the slow-device probe stopped (`BOIL=on`). It gained one row: a shot into the fullest enemy camp, and the reactions that follow. Before and after ran interleaved, three runs each, against two servers (the base commit and this branch). Each cell is the median over runs of script ms per rendered frame, as p50 / p95. The box was loaded (load average 5 to 11 from other work), so treat single cells as ±30%.

Mid-war (turn 12, about 40 living):

| | before (living boil) | after (soldier life) |
|---|---|---|
| idle (boil only) | 2.7 / 6.5 | 4.3 / 6.6 |
| lean in (camera move) | 10.6 / 17.6 | 12.3 / 17.1 |
| aiming (held pull) | 8.6 / 13.6 | 9.9 / 14.4 |
| flick + pull back | 11.1 / 15.2 | 10.9 / 18.4 |
| page turn (pnp) | 11.3 / 15.4 | 5.8* / 15.2 |
| a kill, camps reacting | 8.3 / 25.9 | 9.1 / 17.4 |

Late war (turn 70, 3 or 4 living):

| | before (living boil) | after (soldier life) |
|---|---|---|
| idle (boil only) | 2.7 / 8.7 | 2.6 / 7.1 |
| lean in (camera move) | 8.5 / 12.8 | 6.3 / 10.9 |
| aiming (held pull) | 7.4 / 13.0 | 9.6 / 13.4 |
| flick + pull back | 8.7 / 13.3 | 10.5 / 16.3 |
| page turn (pnp) | 6.6 / 11.5 | 10.0 / 12.7 |
| a kill, camps reacting | 6.6 / 45.8 | 8.0 / 48.2 |

\* In one of the three runs the boil's budget guard tripped and the boil switched off, which makes the page turn cheaper.

What it costs:

- **Mid-war, about +1.5 ms at 6x** while things are happening (idle with the ready-hops, leaning in, aiming): roughly 0.25 ms a frame on a real phone. Late war it's within the noise.
- **The budget guard tripped in 1 of 3 mid-war runs with soldier life, and in 0 of 3 before.** Mid-war the boil was already close to its 6 ms line at 6x, and soldier life moves it closer. On a phone that slow, the boil (and the bodies) switch off as designed, and voices still play. Before the last round of cuts it tripped in 2 or 3 of 3 runs. The cuts: no breathing, a fast path for men at rest, tight dirty boxes, per-tick pixel boxes, and a gentler hurry for a camp's pen. `perf-raw.txt` beside the captures has every run.
- The kill row's p95 is dominated by the frame the page's layers are rebuilt on, before and after alike.

## Captures

In `docs/shots/soldier-life/`, as GIF and WebM. Time is stepped by hand (`pft.hand(true)`, `pft.step(ms)`), so the game, the camera and the boil advance together one frame at a time.

Start with these:

0. **`voices/busy-before-then-after.mp3`**: a pick-up and a shot through a full camp, voiced as before (13 lines: hup, murmur, 2 gasps, 3 eeps, 3 cheers, phew, 2 ohs, at the old level), a pause, then as now (the hup and one gasp, quieter; now and then a second voice).
0. **`notes/*.jpg`** (stills) and **`notes/*.gif`** (written, read, rubbed out, frame by frame): a line pencilled on the page beside the man who said it, leaning in and from bird's-eye, on Lamplight and on blueprint. `*-turned.jpg`: a stray thought written at an angle to find clear paper on a busy page; `*-lunge.jpg`: "Luuunge!" from his camp as a real lunge flies; `*-dawood.jpg`: "fooor Dawooood!"; `*-quiet.jpg`: a whisper; `shout-written-erased-*.gif`: a shout's whole life. Round three: `*-chant.jpg` (a camp's chant along its ring, from bird's-eye), `*-who.jpg` (a man's line: tail and ring round his dot), `*-early.jpg` / `*-late.jpg` ("for Dawood!" early in the war, "fooor Dawooood!" late), `*-tiny-lean.jpg` / `*-tiny-bird.jpg` (a tiny whisper leaning in, and barely there from above), `*-chat.jpg` (an exchange), `*-crickets-*.jpg` (a long wait), `chant-*.gif` and `chat-*.gif`. (The capture takes the first chance that's offered; in play most pass.)
0. **`aiming-streaks-before-after.jpg`**: the stale pencil streaks beside the camps while aiming (left, main) and gone (right). See PR #5.

The captures below were made on the first, drawn boil (dots scribbled round); the motion is the same on the swap boil.

1. **`flinch`**: a shot grazing just outside a camp, close up at 24 fps. The near side sees it coming, is flattened away as it passes, shakes, and breathes out. Nobody's hit.
2. **`bot-lines-up-on-you`**: one of your camps while Dawood-bot takes its turn (from bird's-eye, cropped). Your men cower and tremble while its pen points their way, and the camp's pen hurries round. Then the ink comes through: the men in its way gasp and are crossed out, and the rest hold still. (The bot's clock-seeded aim is pinned so the capture repeats.)
3. **`volley`**: a man flicked into the middle of a full enemy camp, then `pft.volley`. Nine defenders round on him, a ripple of jabs goes in, and he's crossed out.
4. **`unit-cam`**: leaning in, tap him again: the camera goes down low behind him and comes back up.
5. **`shot-into-a-camp`** and **`cheer`**: the same shot seen at its target (flinches, gasps, crosses, stillness) and at the shooter's camp (a ripple of hops), from bird's-eye.

The rest:

- `pickup-close`: a man picked up, pen hidden. He perks up tall; his campmates turn to him.
- `pickup-leanin`: the same, as you see it, leaning in.
- `pen`: the pen landing on a dot and rocking to balance, a full pull shivering, and lifting off when you stand up.
- `move`: riding his ink, smeared along it, and landing squashed.
- `idle-camp`, `idle-birdseye`: nothing happening but scribbling, and the odd ready-hop on his side's go. Micro on purpose.
- `last-stand`: the last three of a side, huddled and trembling, on the earliest page of a seeded war where it happens.
- `shot-birdseye`, `bot-turn-birdseye`: whole-screen views of the shot and the bot's turn.

The voices are in `docs/shots/soldier-life/voices/` as MP3, rendered offline with the game's own synthesis (the `life` playtest writes WAV). There's one file per phrase, said by three soldiers, plus whole moments voiced in order: `a-near-miss` ("eep!", then "phew"), `a-kill`, `a-volley`, `a-move` and `last-stand`.

## Unverified

- **Feel on a real phone.** The captures are headless Chrome, frame-stepped. Motion sizes were tuned by eye at 390×844 in both views, but at bird's-eye a dot is about 5 css px, and whether a 3 px hop reads as "cheering" in the hand is still to be judged.
- **Sound, by ear.** The voices have been checked for level (peaks around 0.1 to 0.35 of full scale after the vowel balancing, quieter than the pen's scratches), length and spectrum, not for charm. The voice's gain relative to the pen sounds and how long before it gets annoying need a listen.
- **Haptics on hardware.** Patterns are written and gated, but untested on a device.

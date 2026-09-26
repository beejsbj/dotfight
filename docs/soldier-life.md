# Soldier life

Burooj asked for soldiers you want to protect: a little heart, with no eyes or faces. They stay scribble shapes, and whatever they feel has to come from motion, timing, sound, and how the ink behaves.

This builds on the living boil (PR #5): **alive means still being drawn.** A standing soldier is a dot a pen keeps scribbling round and round. That gives a faceless dot two things to act with, which the rest of this leans on:

- **His body.** The scribble can sit a little off his spot, squash and stretch along an axis, and swell or shrink. That's the whole of Luxo Jr.'s and La Linea's vocabulary, and it fits a dot.
- **His heartbeat.** The scribble's speed is his pulse. It goes round steadily when he's calm, races when he's excited or frightened, and **stops dead** when a comrade is crossed out, the way you hold your breath. The dead are already still, so a living soldier going still for a beat reads immediately.

The **flinch** is the headline: Burooj's favourite from the first look, so it got the most care (below). The **volley** is his second ask: a lunger who lands in an enemy camp is shot on the spot by the men inside.

Everything is presentation only. The engine is untouched, and nothing random touches game state: poses are seeded from a soldier's id and the clock, so a pinned clock replays the same motion. Poses are key drawings sampled on the boil's 12 fps grid, so the soldiers are animated on twos, like hand-drawn animation, and a reaction is a short run of drawings (crouch, spring, hang, land, settle) rather than a tween.

## What's built

Each idea has its own switch in `LIFE` (`src/life.ts`). In a dev build, `pft.LIFE.voices = false` changes one live.

| # | Idea | What you see and hear | Switch |
|---|---|---|---|
| 1 | **A body that breathes** | Each man swells and shrinks slowly at his own pace. On his side's go, now and then one does a little ready-hop (screen-up, stretched on the way up, squashed on landing). The waiting side only breathes. | `LIFE.idle` |
| 2 | **The line, and the flinch** | When a pen points your way (you aiming, or Dawood-bot lining up), the men in its cone cower away from it, shrink, tremble and race. **As ink goes by, anyone it passes within 85 units flinches** (see below). A man it will cross out rears up tall, scribbling wildly, for the few frames before it reaches him. The shooter is knocked back along his shot. | `LIFE.line` |
| 3 | **A camp's feelings, and the volley** | A kill: the shooter's camp cheers in a ripple (hops back to back, more for a multi-kill, the shooter highest). A man crossed out: his campmates hold still, their scribbles stopped, leaning slightly toward his cross, then come back slowly and a little smaller. The last three of a side huddle toward each other and tremble, hearts racing. **A lunger who lands in the camp is shot on the spot** (see below). | `LIFE.crowd` |
| 4 | **The one in your hand** | Picked up, he does a little crouch and pops up tall; his campmates turn to him (a lean and a stretch his way, rippling outward). Under the pull he winds up, stretched along the line and drawn back from it, shivering at full. On a move he's smeared along his ink as he rides it and lands squashed, then springs up. | `LIFE.chosen` |
| 5 | **The pen round a camp** | Brisk round a full camp, tired round an emptying one (at the last man it goes at half pace). It hurries while its men are in the line of fire, and stops dead for a beat when one of them falls. | `LIFE.camps` |
| 6 | **Voices** | Tiny synthesised gibberish, one pitch per soldier. Picked up: "hm? ba!", and a campmate mutters. A squeak from whoever ink goes close by. A gasp, cut off as his cross lands. "Wheee" while riding a move, "hup" on landing. A cheer from the shooter and a ripple of his campmates. "Oh..." from the fallen man's camp. "Uh-oh" when a side is down to three. A crowd is never more than five voices, and they're silent in replays. | `LIFE.voices`, and **Settings → voices: on / soft / off** |
| 7 | **Unit cam** | While leaning in with a man in hand, **tap him again**. The camera drops down low behind him, turned to look where he looks (down your last cancelled pull, or at the nearest enemy): the squares run to a dark horizon, his camp's ring is a fence round him, enemy camps sit low in the fog. He says "hm?" and hops "hup!" when it gets there. After about 2.4s (0.5s down, 1.5s held, 0.4s up) it stands back up to where you were and the pen drops back onto him. Any touch skips it. The status line teaches it ("or tap him again") until you've tried it once. | `LIFE.unitCam` |
| 8 | **The pen** | Set down on a dot, it rocks a few times finding its balance, then stands. At full pull it shivers under the finger. Put down, it lifts off and fades instead of vanishing. | `LIFE.pen` |
| + | **Haptics** | For your own men only: your camp cheering your kill (a patter), the bot's ink going right past one of yours (a tick), the unit cam's drop (a soft double step), your side's last stand (two slow heartbeats). This runs on Android's `vibrate` today. With feel/haptics (PR #7), one line at boot routes it through `haptic()` and its iPhone backend; see `src/feel.ts`. | `LIFE.haptics` |

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
- **A haptic for every hop or voice.** That's buzzing. Only four moments, for your own men.

## How it stays cheap

The architecture from PR #5 is unchanged. The page is append-only, and only living things are drawn on their small page-space boil layers, placed by CSS.

- **A soldier's body costs one transformed `drawImage`.** He's the same shared scribble sprite as before, drawn through his pose's matrix instead of the identity. His box on the boil layer has room for the largest pose (`LIFE_BOX`, and a test pins every pose inside it), so the layer's dirty rectangles still clear exactly what was drawn. Living soldiers were already redrawn every 12 fps tick (they're being scribbled), so moving them adds no redraws.
- **The heartbeat is integrated**, a frame at a time, and picks which of the 12 shared scribble pictures shows. No new sprites.
- **A camp's pen head is integrated too**, so a change of pace never jumps and only the box round its head is retraced, as before. A stopped pen redraws nothing.
- **A pose is worked out once per soldier per tick.** Last stands are counted once a frame, and the line of fire once per rendered frame. `planFlick` runs once per flick.
- **Voices are a handful of WebAudio nodes per syllable**, at most five phrases at once.

### Perf

PERF_TABLE

## Captures

In `docs/shots/soldier-life/`, as GIF and WebM. Time is stepped by hand (`pft.hand(true)`, `pft.step(ms)`), so the game, the camera and the boil advance together one frame at a time.

CAPTURES_LIST

The voices are in `docs/shots/soldier-life/voices/` as WAV, rendered offline with the game's own synthesis: one file per phrase (three soldiers each), plus `a-kill.wav`, `a-move.wav` and `last-stand.wav`, which voice whole moments in order.

## Unverified

- **Feel on a real phone.** The captures are headless Chrome, frame-stepped. Motion sizes were tuned by eye at 390×844 in both views, but at bird's-eye a dot is about 5 css px, and whether a 3 px hop reads as "cheering" in the hand is still to be judged.
- **Sound, by ear.** The WAVs have been checked for level (peaks around 0.15 to 0.35 after the vowel balancing) and length, not for charm. The voice's gain relative to the pen sounds and how long before it gets annoying need a listen.
- **Haptics on hardware.** Patterns are written and gated, but untested on a device.

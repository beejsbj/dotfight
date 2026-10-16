# Real time at the table: the prototype

An experiment (BJS-458), not canon: none of this is Dawood's yet. It is a third way to play a Quick battle (or Classic, or Custom) on the cover, next to pass & play: **real time**, and **v Dawood-bot** in real time. Whether any of it ships is Burooj's and Dawood's call.

## What's in it

**Tabletop mode.** One phone, flat on the table between two players. Blue sits at the bottom, red at the top; each owns their half of the screen, and red's strip is turned round to face them. Camps are drawn and the men arranged as ever, by turns, with red reading the status line turned round at the top. Once both have pressed done there are no more turns: the page lies still, bird's-eye (nobody can lean in while two people aim), and both pens flick whenever they can, at the same time if they like. No network: this is the only real-time mode in the prototype.

**The ink meter.** Each pen holds up to 3 ink and starts play with 2. A snipe costs 1.25, a lunge 0.85, and the pen refills 0.4 a second: sustained, about a snipe every 3 s or a lunge every 2 s, with two in a row from a full pen. A flick the pen can't pay for is refused ("out of ink: wait for the pen to fill") and the man stays in hand. The core rules' extra flick becomes a refund: a snipe that takes two, or a lunge that kills, costs nothing. A last stand refills the pen twice as fast (the core rules' two flicks a turn). The meter is the bar on each strip, with a notch at what a lunge and a snipe cost, and it is also the refill of the pen standing on a man in hand (the pull's power still shows there while you pull).

**Wet ink.** A soldier who flicked is wet for 4 s and can't flick again until he dries: his dot carries a bead of ink and a highlight under the lamp, fading as it dries, and a tap on him says so. A lunger who killed and lived is dry at once, so he can lunge on if his pen has the ink. Drying is a cue (`dry`), a quiet tick.

**Haste.** The flick stays imprecise, and haste adds wobble: a flick let go within 1.5 s of the same pen's last one gets up to 0.06 rad (about 3.5°, 1 sd) of extra hand error, most right after, none at 1.5 s. The held-flick wobble and release error are the core game's.

**Dawood-bot at the table.** Optional, cheap: it is the ordinary bot (its level from the cover), asked on the worker every 1.7 to 2.6 s with its own pen and the clock as it stands, and it lets go after a visible 0.8 s pull-back if its pen can still pay. It never sends (there are none).

## The numbers, and where they live

All in `REALTIME` in `src/rules.ts`, a `realtime` block like the long war's `long`:

| What | Value |
|---|---|
| `meter.full` / `meter.start` | 3 / 2 |
| `meter.snipe` / `meter.lunge` | 1.25 / 0.85 |
| `meter.perSec` | 0.4 (×`lastStandFlicks` in a last stand) |
| `dryMs` | 4000 |
| `haste.ms` / `haste.tremor` | 1500 / 0.06 rad |

The bot's cadence (`BOT`) and the strip height (`STRIP`) are in `src/tabletop.ts`; the gloss's rate in `src/wet.ts`.

## How it's built

- **Engine** (`src/game.ts`, "real time"): gated on `rules.realtime`, like the long war on `rules.long`; a core game never takes a real-time path, and the core-4 fixture still replays hash for hash. Every flick carries its moment `ms` on one engine clock (ms from the first flick), which the page advances; the engine never reads a wall clock. `act()` takes a flick from either pen at `ms` if the meter can pay and the man is dry, and refuses "time runs one way", "out of ink", "his ink is still wet". `s.rt` holds each meter as of its last settle and when each man dries; `s.turn` counts flicks. `canFlickAt`, `meterAt`, `wetUntil`, `handAt` are the pure helpers.
- **Record** (`src/record.ts`): a timed game is record format **v3** (rules carry `realtime`, flicks carry `ms`); games with turns stay v2, so older copies of the game keep reading those and ignore a v3 rather than replay it by the wrong rules. Old saves and drawer pages (v1, v2) load as before. A real-time page replays from the drawer like any other.
- **Page** (`src/tabletop.ts`): takes the page over from `main.ts` when a table game reaches play: input (one finger a half, two pulls at once), the clock, several lines resolving at once, the strips, the wet layer, the bot. `main.ts` keeps setup and positioning, hands over in `next()`, and takes the page back for the dawn and the drawer. `src/scene.ts` draws several pens, aims and movers (`pens`, `aims`, `movers` on the frame).
- **Wet layer** (`src/wet.ts`): a small page-space canvas round the wet men, redrawn at 8 fps while anyone is wet, or when the look changes; the page itself is untouched. Under reduced motion or on a slow phone the highlight holds still.

## Playing it on one phone

1. On the cover pick a size (not the long war: real time falls back to Quick) and tap **real time**, or **v Dawood-bot** for a solo game.
2. Draw camps by turns: blue on the near half, red on the far half (the page never turns). Arrange your men; red presses the turned-round **done arranging**.
3. Lay the phone flat. Pick up one of your men on your half, pull back toward yourself from anywhere on your half, let go. Slide back to the start to cancel. Pick snipe or lunge on your strip.
4. Watch the bar: if it is under the snipe notch you can't snipe yet. A glossy dot is still wet.
5. The war ends as ever, with the dawn and the drawer.

Dev: `node scripts/playtest.mjs realtime <devurl> <out>` plays a short table game with two simultaneous touches (both aiming, both ink, the wet refusal, the meter running dry) and then the engine's own flicks to the end; `realtime-bot` checks the bot flicks at the table. `window.pft.table` exposes the clock, the sides, the meters and `flick(side, f)`.

## What to feel for at the table

- Does it feel like a pen fight, or like tapping as fast as you can? The meter and the wet ink are there to make each flick a choice; if it still feels like spamming, raise the costs or the drying time first.
- Are the costs right? Should a lunge be this much cheaper than a snipe?
- Is 4 s of wet ink enough to make you spread your flicks across your men? Too long and a camp feels frozen.
- Does haste bite? Two flicks a second apart should feel wilder than one.
- Can two thumbs really share a 390 px screen? Do the pulls get in each other's way across the middle? Do red's pulls (toward the top) feel as natural as blue's?
- Is the far strip readable turned round? Does red find the kind buttons?
- The simultaneous case: two lines released in the same instant are applied in the order the touches lifted; the second may find its target already crossed out. Does that feel fair?
- Does moving (lunging) matter without a moving target, or do men just stand and snipe?

## Left out, and why

- **Sends (convoys)** are refused in real time. A send's exposure was built on turns (out for exactly one enemy turn); in real time it would be a walk on the clock, which is really the "ink travels" family of mechanics (moving targets). Lunging is the way to move in the prototype.
- **Ink travels** (lines drawn at pen speed so you can dodge): not tried; a lunge still moves a man, so try the table first and add it only if moves feel pointless.
- **Lunge chains** as a state: the core rule's "lunge on or stop" becomes "he's dry at once and refunded"; there is no stop.
- **Online real time and blind volleys**: out of scope (BJS-458). A real-time room would be engine `realtime-1`, which no client reads.
- **Pinch-zoom and leaning in** at the table: the page stays whole and still.
- **Soldier life, voices and notes** at the table: the boil runs, the rest doesn't (two players would be spoken over).
- **Hit-stop** on kills: the ink doesn't snag at the table; several lines fly at once and a shared ink clock would need one snag list per line.

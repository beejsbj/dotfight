# Rules lab, round 2

_2026-09-25. Branch `rules/lab-2`, on top of round 1 (`rules/lab`, PR #3). Raw data: [data/round-2/](data/round-2/). Screenshots: [shots/round-2/](shots/round-2/)._

Round 2 builds Burooj's new direction into the engine, lets the bot play it, and measures it. The design principle he keeps returning to is a real pen on paper. Round 1's own-ink and page-edge bounces stay out of every new set (a matter of taste, not a law), and the page does four new things to a line instead: it jolts the hand, pulls the pen into grooves, soaks it up in scribbles, and wears it down.

## The short version

- **Play "Lunge & snipe".** It's Burooj's lunge and snipe on Dawood's classic page, with free walking sends and empty rings, plus three things the lab added to keep it fair: a rising bar on snipe streaks, a tremor on lunge chains, and round 1's last stand. Soldiers are arranged before the first flick. It's even (52% to the first player), streaks stay short (a 4.7-flick worst turn on average, 9 at most), and every new mechanic gets used: lunges are 37% of flicks, sends 10 a game, and a ring is manned again in 99% of games.
- **Billiards is the second game**: the same rules with camps, a prism and two cushions. It averages 15 bank shots and 7 split lines a game, and it's just as fair.
- **Pen physics works, but the page fights back.** Every ink effect makes games longer, because ink piles up right in front of the targets. The shipped version is the lightest of each (jolts, grooves, wall friction) and still runs about half as long again as Lunge & snipe. Scribble cover and taper are left out: every combination with them stalled.
- **The cost of round 2 is length.** A kill no longer reliably earns a flick, so games take ~88 flicks rather than Last stand's 55. That's the first thing to feel out at the table.

## Results

2,000 bot-vs-bot games per set, a human-like hand, the round-1 harness (`npm run lab`), seeds 1–2000 for every set. Standard error on the percentages is about ±1.1 points.

<!-- TABLE -->

How to read it (as in round 1):
- **Turns** are pen hand-overs; a free send doesn't hand over the pen.
- **Comebacks** is how often the side ahead at half-time loses; the bracket counts only leads of at least 15% of an army.
- **Longest turn** is the most flicks one player makes in a single turn (sends not counted): how long the other person watches.
- **Stalled** games hit the 400-turn cap with nobody winning.

"Last stand (round 1)" is round 1's recommendation re-run on this engine and bot. Round 1 published 21.3 turns and 46% first-player wins; the re-run gives 21.4 and 49%. The small shift comes from the bot now counting a last stand's second flick the way the earn rules do. "As stated (r2)" is Burooj's round-2 direction taken literally on the classic page: lunge and snipe with unlimited chains, free walking sends, empty rings, and nothing added.

## What the lab found

Exploration ran in six passes of 100–140 games per variant (tables in [data/round-2/explore.md](data/round-2/explore.md)), one change at a time, then the finals.

1. **Do the stricter triggers self-limit? Partly.** Snipe-on-two and lunge-kills-only halve the worst turn compared with classic's any-kill chain (6.1 flicks against 14.7), but they don't bound it: "as stated" still produces turns of up to 17 flicks, and big comebacks fall to 5%, because whoever gets ahead gets more doubles. Snipe-on-one goes straight back to 9.6. **The lightest fix is a rising bar** (`earn.rise`): each further snipe in a turn needs one more kill (two, then three, then four). The worst turn falls to 3.6 with no hard cap, and the first-player edge stays at 52%. A hard cap of three also bounds it, but gave 58% to the first player and no big comebacks.
2. **Death at the wall is the whole lunge economy.** With it, lunges are only 6% of flicks, because at the start everyone is inside a base and lunging in is suicide. Without it, 86% of flicks are lunges, a quarter of lunge chains run to six or more, and games collapse to 15 turns. Lunges come alive when soldiers stand in the open: positioning outside the walls took them to 44–49%.
3. **"Shakier every link" needs a tremor, not a multiplier.** Chain lunges are short, soft flicks whose error is tiny, so multiplying it by 1.35 or 1.6 per link changed almost nothing (chains of up to 14). A fixed tremor of 0.05 rad per link, however soft the flick, cut 6+ chains from 6% to 0% and the longest to 8–10, and it still reads as Burooj's rule.
4. **Free walking sends get used: 10–13 a game.** When a send costs the flick, it's 2 a game. Walk speed barely matters in the range tried (90–300 units per hand-over).
5. **Empty rings get manned again in nearly every game** (3–4 times a game). Crumbling makes no difference on an all-circle page, because circles have no wall effects to lose.
6. **Positioning changes the game only if soldiers may stand outside their walls.** Inside only, the bot's arrangement changed nothing measurable. Within 40 of the wall, the bot spreads soldiers outside to spoil the enemy's lines, which feeds lunges (49% of flicks) and shortens games (65 → 51 turns). Within 20 is the middle ground that ships. A flaw: the bot sometimes moves a whole garrison outside, so that base counts as empty from the first flick (visible in the screenshots). The simplest fix is "each base keeps at least one inside"; it isn't in these numbers.
7. **Ink physics: the page fights back.** Ink piles up where the targets are, because every line runs toward an enemy base. So anything that weakens a line as ink accumulates makes bases into fortresses:
   - wobble of 0.02 rad per crossing: 99 turns; 0.035: 140 turns, with 7% of games stalled;
   - scribble cover (three lines in 40 units): 168 turns, 32% stalled;
   - taper (25% per kill, 15% per wall): 111 turns, 13% stalled;
   - grooves at 17° and 24 units: 188 catches a game and 95 turns (lines get pulled off their targets).

   Gentle versions are fine one at a time (grooves at 0.12 rad and 12 units, jolts limited to one per line, scribble five-in-30, taper 10%/5%), but they compound. The shipped Pen physics keeps jolts, grooves and a little wall friction.
8. **Dawood's version (friendly ink boosts, enemy ink slows) is the least fair thing tried**: 74 turns, 62% to the first player, 2% big comebacks. Enemy ink radiates from enemy bases, so every attack drags, and the side that shoots first lays the ink the other must cross. Combined with wobble it was longer again (119 turns). Wobble is the better of the two, but only gently.
9. **Longer flicks are less accurate, as they should be** (table above). In play the bot's hit rate falls from ~89% for 300–600-unit shots to ~59% beyond 1500.
10. **Billiards works as a skill layer.** 15 banks and 7 splits a game with a glance angle of 0.6 rad. Reflecting every incoming line would make a hexagon a fortress; with the glance rule, a straight shot still gets in.

## Recommendation

**Play Lunge & snipe.** It's the only round-2 set that keeps round 1's fairness and short streaks while using every new mechanic. Lunges, sends and rings all matter in it, and its last stand keeps a big lead losable 13% of the time. It's twice as long as Last stand in turns (53 against 21) and 60% longer in flicks. That's the price of kills no longer reliably earning a flick, and the one thing to check with real people. If it drags, the first lever is a smaller army (four bases), not the chain rules.

**Billiards** is the second game and the more tactical one: bank shots and prisms in front of your other bases are real plans. **Pen physics** is for trying the feel of the page. It's slower, and the numbers say to keep it light; the grooves are the part Burooj likes, and they're in. **"As stated"** stays in the lab as the reference for Dawood: it's what the direction does on its own.

## What failed, and why

- **Scribble cover and taper**, in every strength that showed on the page: ink piles up in front of the targets, so lines die exactly where they matter and games stall.
- **Strong wobble** (0.035 rad per crossing and up), for the same reason.
- **Grooves as a lock-on** (my first version) was replaced by gravity at Burooj's direction. Strong gravity grabbed lines everywhere.
- **Dawood's boost/drag**: unfair to the second player (above).
- **Lunges without the wall rule**: a lunge fest with 15-link chains.
- **A plain multiplier for "shakier"**: no effect on short chains; replaced by the tremor.
- **A hard streak cap** worked, but less fairly than the rising bar.

## What I guessed

Every number below is invented, and most were chosen by the lab from a handful of alternatives:

- the walk pace (150 per hand-over);
- rise 1 and the tremor 0.05 rad;
- positioning reach 20;
- the glance angle 0.6 rad (34°) and three banks per line;
- camps of 12, cushions of 8, the prism of 6;
- every ink constant;
- that an earned lunge is the same soldier's (tested: letting any soldier take it made little difference);
- that kills before the wall still count when a lunge crashes, and the crash ends the chain;
- that sends are free once a turn.

The one design addition beyond Burooj's brief is the glance rule on hexagons, so a cushion isn't a fortress.


## Screenshots

Phone size (390×844), headless Chrome, from seeded scenes (`scripts/round2-scenes.ts`, then `scripts/round2-shots.mjs`). Each has a close-up, a `-page` view, and for flicks a `-drawing` frame mid-stroke:

- [wobble](shots/round-2/wobble.jpg) (zigzags where the hand jolted crossing ink)
- [groove](shots/round-2/groove.jpg) ("=" where a groove caught the pen)
- [lunge](shots/round-2/lunge.jpg) (a lunge kill: lunge again or stop)
- [crash](shots/round-2/crash.jpg) (dead at a manned wall)
- [send](shots/round-2/send.jpg) and [convoy](shots/round-2/convoy.jpg) (walkers on the road)
- [empty](shots/round-2/empty.jpg) (an empty ring)
- [bank](shots/round-2/bank.jpg) (a cushion bounce)
- [split](shots/round-2/split.jpg) (a prism split)
- [position](shots/round-2/position-page.jpg) (the positioning phase)
- rules cards: [Lunge & snipe](shots/round-2/card-lunge-snipe.png), [Pen physics](shots/round-2/card-pen-physics.png), [Billiards](shots/round-2/card-billiards.png)

The marks are deliberately plain so they port to Lamplight. At full-page zoom on a busy page the groove "=" is hard to pick out; the close-ups read.

## What I built

Everything is a `RuleSet` option (defaults off, so round-1 sets play as before), with pure unit tests in `src/round2.test.ts` (50 tests) and the round-1 suite still green.

### Lunge and snipe

- **The move is now a Lunge** (Burooj's name). It goes as far as a shot, crosses out every enemy along its path, and the lunger stands where the ink stops.
- **A lunge kill earns another lunge by the same soldier**, with no limit, and each link widens his hand error by 35% of a steady hand (`earn.shake`). The earned lunge can be turned down: the strip shows **stop**. The game requires the next flick to be a lunge by him (`s.must`), and the bot knows it.
- **Lunging into a manned enemy base kills the lunger at the wall.** I decided that whatever the lunge crossed before the wall still dies (the ink got there), but the chain ends with him. An empty ring is not deadly: lunge into it and, with capture on, it's yours. Off the page still kills him.
- **A snipe earns another flick only if one line crosses out two or more.** It chains with no aim penalty. An optional `rise` raises the bar by one for each extra flick already earned this turn.

### Sends, empty rings, positioning

- **Sends are free, once a turn**, and **walk the page**: the convoy stands in a column on the road and steps `pace` units every time the pen changes hands (150 in the sets). Any line that touches a walker crosses him out, and a lunge through a column chains. Round 1's off-page convoy and "a line across the road kills them all" stay for the round-1 sets.
- **Bases don't disappear.** An emptied base stays as a ring with "empty" pencilled in it. A soldier of its side standing in it again, or a send arriving, mans it again (`refill: "own"`); with `refill: "any"` and capture you can take the enemy's. **Crumble** (`empty: "crumble"`) is an option: the ring's walls stop working. On an all-circle page it makes no difference at all, because circles have no wall effects to lose.
- **Positioning**: after the bases, whoever flicks first arranges first (drag a soldier, then **done**), then the other side, seeing the first. A soldier may stand anywhere in his base or up to `reach` (40) outside its wall. The bot spreads its soldiers to spoil the enemy's best line.

### Ink physics

The tracer was rewritten as a turtle: a heading plus the arc's own curvature, walked step by step, so every effect is a change of heading rather than a transform of pre-sampled points. Round-1 sets reproduce: Geometry and Last stand give identical games; Wet ink shifts slightly because old strokes now keep finer collision geometry.

- **The angle the pen meets a line decides.** Shallow (within 0.3 rad, about 17°) is a groove; steeper is a crossing.
- **Crossing jolts the hand** (`ink.wobble`): the line turns by a random angle from that point on, drawn from a seed resolved with the flick, so the engine stays pure and replayable. No range is lost. `joltMax` limits how many crossings jolt one line.
- **Dawood's version** (`ink.boost` / `ink.drag`): crossing your own line adds range; crossing theirs costs range. It can be combined with wobble.
- **Grooves pull like gravity** (Burooj's correction, replacing my first lock-on version). A pen within `grooveReach` (24) of a line and within the groove angle of parallel is turned along it and leaned into it. The pull is stronger the closer, the more parallel, and the slower the pen. Speed goes as the square root of the line it has left, so a hard flick slices across and a slowing pen gets caught. There's no fixed "follow for N units": it rides for as long as the geometry holds it. Riding your own groove costs 0.6 range per unit; theirs costs 1.6.
- **Scribbles are cover**: crossing three lines within 40 units of travel soaks the line up (a blot where it stopped).
- **Taper**: each soldier crossed out takes 25% of what's left of the line, and each wall passed 15%. Pierce still works on top, and the stricter wins.
- **Walls have friction**: passing through a wall jolts the line (`shapes.*.wobble`). In the Billiards set circles are soft; triangles and hexagons jolt.

### Shapes (square and spiral dropped)

- **Circle ("camp")**: soft walls. It holds the most soldiers (12 in Billiards, against 8 and 6).
- **Triangle ("prism")**: a property of where it stands. Any of your shots passing out through it splits in two, including shots from your other bases. Lunges don't split (the lunger is one body).
- **Hexagon ("cushion"), billiards**: its walls bank everyone's lines, yours too, by the angle of incidence. I added one rule so a hexagon isn't a fortress: only a line that glances (more than 0.6 rad, about 34°, off square) bounces. A line coming in straighter goes through into the base. Lines leaving a hexagon from inside pass out. Nothing breaks, and at most three bank bounces happen per line.

### Longer flicks are less accurate

The pen's model already does this, and steeply. For a human hand (no bot aiming error), the chance a flick aimed at a dot touches it:

| distance | just past it: power, hit chance | full power: hit chance |
|---|---|---|
| 200 | 0.00, 100% | 58% |
| 400 | 0.08, 96% | 32% |
| 600 | 0.20, 77% | 21% |
| 800 | 0.33, 53% | 16% |
| 1000 | 0.47, 34% | 13% |
| 1500 | 0.82, 12% | 9% |

The tradeoff is real (at 400, a soft flick hits three times as often), so I didn't tune it. One flag: at 200 units a soft flick is practically certain. If that feels like clicking, raise `FEEL.jitterBase` (0.012).

## The bot, and where it's weak

Dawood-bot still previews candidate flicks with the real engine and re-tries the best with a shaky hand. For round 2 it:

- honours an earned lunge (only that soldier, only a lunge) and stops when every lunge looks worse than stopping;
- values a snipe's extra flick only when the line takes two;
- prices a lunge chain from where the lunger ends up, with his shakier hand;
- shoots at walkers;
- aims bank shots at targets' mirror images in bank walls;
- tries lines that meet its own grooves nearly parallel;
- sends walking convoys, pricing the road, and refills rings;
- arranges its soldiers before the first flick.

Where it's weak (and so where the numbers are least trustworthy):

- **It looks one flick ahead.** It never plans a lunge chain as a chain, or sets up a lunge by baiting a soldier into the open. People will.
- **Its idea of danger is snipes.** Its position score is "their best line against us"; it adds a crude 30% extra exposure for soldiers outside walls when lunges can kill them, but it doesn't model the enemy's lunge chains.
- **Grooves and banks come from sampling**, not planning. It finds bank shots when a mirror image lines up, and grooves only along its own lines. It never deliberately lays a line down to ride later.
- **Positioning is greedy and myopic**: it spreads soldiers to spoil the best enemy line, and ends up pushing them out of their walls, where lunges eat them. That may be the bot being dumb rather than the rule being bad.
- **Sends are priced with a heuristic** (the road's exposure against where they'll stand), not played out.

## What a Lamplight port needs

Engine, bot, lab and rules cards are UI-agnostic and port as they are (`src/game.ts`, `trace.ts`, `bases.ts`, `geom.ts`, `rules.ts`, `rulesets.ts`, `bot.ts`, `cards.ts`, `lab/`). The notebook-specific parts are deliberately thin:

1. **Verbs**: under round-2 rules the strip says lunge/snipe (`verb()` in `main.ts`). During an earned lunge it offers lunge/stop, and the lunger is pre-selected.
2. **Positioning phase**: drag a soldier (legal spots from `canArrange`), a pencil zone per base (base radius + `reach`), and a done button. The bot's arrangement plays back one soldier at a time.
3. **Walkers**: soldiers with `transit` set and `walked` on their transit are drawn on the page, tweened from their old spots when the pen changes hands.
4. **Six small marks** (`Mark` type `kink`, drawn from its `x, y, dir`): a zigzag for a jolt, "=" for a groove catch, a small star for a bank, split or crash, and a blot for a scribble absorb. Plus the `empty` mark: "empty" in a ring, or cracks if crumbled.
5. **Shape names** come from the rules (`shapeName`: a banking hexagon is a "cushion").
6. **Round-2 cards** are generated from the rules (`round2Card`), so any look can render the list.
7. **Aim cone**: `steadiness(s, id, kind)` now includes the lunge chain's shake, so the cone widens link by link.

## Questions for Burooj and Dawood

For Burooj:

1. **Is ~50 turns (~90 flicks) a game you'd play on a phone?** It's the main cost of lunge and snipe. If not, try four bases before touching the chain rules.
2. **Positioning: inside the base, or just outside it too?** Inside only changed nothing; outside turns the game toward lunges. And should a base have to keep one soldier inside?
3. **Which ink effect matters most to you?** Each one costs length. Jolts and grooves are in Pen physics; scribble cover and taper are options that stalled games in every strength that showed.
4. **Hexagon cushions with the glance rule**: does a straight shot going through feel right, or should they bank everything and hold fewer soldiers?
5. **Is the lunge tremor the "shakier" you meant?** It widens the aim cone by a fixed amount per link, however softly you flick.

For Dawood:

1. **Did friendly lines really carry a flick further, and enemy lines slow it?** Taken literally, it favours whoever shoots first (62%).
2. **When a line ran along another one, did it follow it?** Grooves are in as gravity: the slower the pen, the more it's pulled.
3. **Did a soldier who charged through someone go again, and was it the same soldier?**
4. **How fast did sent soldiers walk?** Here, a column crosses a typical road in two to four turns, and anyone can cross them out on the way.
5. **Did an empty base stay a base?** Here it stays as a ring, and anyone of yours who walks in (or is sent in) mans it again.


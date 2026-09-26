# Rules lab, round 2

_2026-09-25. Branch `rules/lab-2`, on top of round 1 (`rules/lab`, PR #3). Raw data: [data/round-2/](data/round-2/). Screenshots: [shots/round-2/](shots/round-2/)._

Round 2 builds Burooj's new direction into the engine, lets the bot play it, and measures it. The design principle he keeps returning to is a real pen on paper. Round 1's own-ink and page-edge bounces stay out of every new set (a matter of taste, not a law), and the page does four new things to a line instead: it jolts the hand, pulls the pen into grooves, soaks it up in scribbles, and wears it down.

<!-- RESULTS -->

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

<!-- QUESTIONS -->

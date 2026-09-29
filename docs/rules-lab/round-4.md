# Rules lab, round 4: garrisoned walls

_2026-09-29. Branch `rules/garrison-walls`. On the game's own engine (`src/game.ts`), like round 3. Raw tables: [data/round-4/](data/round-4/)._

**The question.** Burooj asked what a base does for you in the core rules. Round 3's honest answer was "not much". A flat wall cost a snipe 10% of what was left and a lunger 0.08 rad of shake. Forcing men inside changed nothing, and lunges were 69–76% of all flicks. His decision: **a wall is as strong as the men inside it.**

**The rule as built.** When a line crosses a base's wall, the price depends on the garrison at that moment: the base's own living soldiers inside the wall, less any this line already crossed out. Men just outside the wall don't count, nor do men out on a road or the man flicking. With `f = min(1, garrison / soldiers a base starts with) ^ curve`, a snipe loses `lo + (hi − lo) · f` of what's left of it, and a lunger's heading jolts by the same shape. Your own bases' walls work the same way on your lines, and the wall at your back as you leave your own base is still free. An empty ring costs the floor.

## Recommendation: B, a straight line from nearly paper to a thick wall

| | empty ring | half full | full base |
|---|---|---|---|
| snipe: share of what's left, lost at the wall | 3% | 44% | 85% |
| lunge: heading jolt at the wall (1 sd) | 0.02 rad (1°) | 0.51 rad (29°) | 1.0 rad (57°) |

`CORE.garrison = { snipeLoss: [0.03, 0.85], lungeShake: [0.02, 1.0], curve: 1 }`. Everything else is unchanged from round 3.

**Why B:**
- **Bases matter now.** With the bot's own positioning, a man inside is crossed out about half as often as one outside: 5.0 against 11.6 kills per 100 exposed in Quick, and 3.8 against 6.5 in Classic. On flat walls it was 8.2 against 9.3, and 5.5 against 5.9.
- **Staying in wins.** Head to head, a side that keeps everyone inside beats one that spreads out 57% of the time in Quick and 69% in Classic. On flat walls it's 54% at both sizes.
- **It isn't a turtle, and it doesn't drag.** Games run about a third longer: Quick 16 → 22 turns and Classic 29 → 36, with no stalls, and the first player wins 48% and 53%. The concave curves (C, D) cut lunges a few points more but stretch Classic to 41–46 turns. A mirror of full turtles under B runs 29 and 43 turns, which is the long case to watch at a table.
- **Shooting a base down pays off.** The first base falls at turn 12 in Quick (flat: 8) and 15 in Classic (flat: 10). Men crossed out on the way in stop holding the far wall.

**What it doesn't do: lunges stay the majority.** They fall from 77% to 73% in Quick and stay at 69% in Classic. With everyone inside they fall to 60–64%. Most lunges go after men standing outside, and a lunge earns another on a single kill, so walls alone can't reach them. The chain tremor from round 3 is still the lever for that. B plus a 0.10 rad tremor a link brings lunges to 69% and 63%, and 4+ chains from 16–18% down to 9–12%, at 24 and 40 turns. That's a separate decision, so it isn't changed here.

## Candidates (the bot's own positioning; Quick 500 games, Classic 500, or 1000 for flat and B)

`lo–hi` is empty ring to full base: snipe loss, then lunge shake. Curve 1 is a straight line; 0.5 (√) means a few men already make a wall tough.

| variant | size | turns (p90) | 1st wins | lunge / snipe | kills/flick | longest turn: mean, max | 4+ chains | kill rate in / out (per 100 exposed) | bases emptied (turn) | first base emptied | stalled |
|---|---|---|---|---|---|---|---|---|---|---|---|
| flat walls (round 3) | Quick | 16.1 (22) | 51% | 77% / 23% | 1.00 | 6.6, 12 | 21% | 8.2 / 9.3 | 86% (t12) | t7.8 | 0% |
| A: 3–50%, 0.02–0.4, straight | Quick | 17.3 (23) | 50% | 76% / 24% | 0.96 | 6.3, 14 | 19% | 6.9 / 10.8 | 84% (t14) | t9.4 | 0% |
| **B: 3–85%, 0.02–1.0, straight** | Quick | **21.8 (30)** | **48%** | **73% / 27%** | 0.85 | 5.9, 11 | 16% | **5.0 / 11.6** | 82% (t18) | t11.9 | 0% |
| C: 3–85%, 0.02–1.0, √ | Quick | 27.5 (39) | 51% | 65% / 35% | 0.75 | 5.5, 10 | 13% | 4.2 / 11.7 | 80% (t22) | t15.2 | 0% |
| D: 3–70%, 0.02–0.8, √ | Quick | 24.7 (35) | 53% | 68% / 32% | 0.80 | 5.7, 11 | 14% | 4.8 / 11.6 | 80% (t20) | t13.5 | 0% |
| B + chain tremor 0.10 | Quick | 24.1 (32) | 51% | 69% / 31% | 0.82 | 5.3, 11 | 9% | 4.9 / 10.8 | 82% (t19) | t12.8 | 0% |
| flat walls (round 3) | Classic | 29.0 (38) | 53% | 69% / 31% | 1.21 | 7.6, 14 | 22% | 5.5 / 5.9 | 89% (t21) | t10.3 | 0% |
| A | Classic | 29.7 (39) | 52% | 72% / 28% | 1.18 | 7.5, 15 | 22% | 4.9 / 6.4 | 88% (t22) | t12.1 | 0% |
| **B** | Classic | **35.9 (47)** | **53%** | **69% / 31%** | 1.06 | 7.1, 15 | 18% | **3.8 / 6.5** | 86% (t27) | t14.7 | 0% |
| C | Classic | 45.7 (62) | 49% | 65% / 35% | 0.94 | 6.6, 14 | 15% | 3.1 / 6.7 | 83% (t35) | t19.0 | 0% |
| D | Classic | 40.7 (53) | 53% | 66% / 34% | 1.00 | 6.9, 13 | 16% | 3.5 / 6.6 | 83% (t30) | t16.3 | 0% |
| B + chain tremor 0.10 | Classic | 40.2 (51) | 53% | 63% / 37% | 1.02 | 6.3, 12 | 12% | 3.7 / 6.1 | 86% (t30) | t15.9 | 0% |

"Kill rate in / out" is soldiers crossed out per 100 soldier-flicks exposed: at every flick, each enemy soldier counts as inside if he stands in his own base's garrison, and outside otherwise (just outside the wall, lungers who landed out in the open, walkers on a road). "Bases emptied" is the share of bases that become an empty ring at some point, with the average turn it happens; "first base emptied" is the turn a game's first base falls. Standard error on win rates is about ±2.2 points at 500 games and ±1.6 at 1000.

## Positioning: all inside, spread out (400 games each)

Stances for both sides: **all** keeps everyone inside; **spread** keeps at most a quarter inside, the rest on the paper just outside the wall; the bot's own (**half**, the table above) keeps at least half in and, left to itself, keeps about two in three in under garrisoned walls (half on flat walls).

| rules | size | all v all: turns, lunges | spread v spread: turns, lunges | all-inside side beats spread (as 1st player; as 2nd; mean) |
|---|---|---|---|---|
| flat | Quick | 17.0, 71% | 15.6, 78% | 57%, 52%, **54%** |
| flat | Classic | 29.8, 66% | 27.8, 71% | 59%, 50%, **54%** |
| B | Quick | 28.8, 60% | 17.1, 77% | 61%, 54%, **57%** |
| B | Classic | 43.4, 64% | 29.3, 70% | 73%, 64%, **69%** |

On flat walls keeping men inside barely paid, which matches round 3's "inside-only changed nothing". Under B it pays, most in Classic, where bases are bigger and walls matter over more turns. Two full turtles make the longest games in this round (29 and 43 turns); a side that spreads out gets punished for it rather than stalling the game.

## Screens (150 Quick games each, before the finals)

The screening runs (seven curves, and the first look at stances) are in [data/round-4/screen.md](data/round-4/screen.md). What they showed: a moderate wall (50% of a snipe, 0.35 rad) barely moved anything. A lunger's kills inside a base come right after the entry wall, so a small jolt barely matters, and half of what's left of a snipe still crosses a base. Only walls that eat most of a line change the game.

## Design calls

- **Garrison = the base's own living men inside its wall (the engine's `inside`, 1.05 r), at the moment the line crosses.** Men just outside don't count: the positioning ring is a choice to stand in the open, and counting it would make "spread" free. Walkers on a road don't count; men ordered to send but still standing at home do.
- **Kills earlier on the same line count.** A snipe through a base pays full at the near wall and less at the far one, having crossed out men on the way. That's the "shot down" feeling within one flick.
- **Capacity is what a base starts with** (`size.soldiers`). Sends can overfill a base; overfull is no tougher than full.
- **Own bases scale the same, and the wall at your back stays free.** The man flicking never counts toward a wall's garrison.
- **Empty rings keep a floor** (3%, 0.02 rad): nearly paper, still a line on the page, like the camp's faint pull in the long war.
- **Old games keep flat walls.** A game copies its rules when it starts; `garrison` missing from a saved record, save or room means flat walls (`savedRules` in `src/rules.ts`). A test replays two wars recorded on `origin/main`'s engine and gets the same page. `CORE.version` is 2.
- **Rooms: `ENGINE` is bumped to `core-3`.** A room's setup carries its rules, so a core-2 room replays flat on this client, which still opens core-2 rooms (`canRead`). The bump is for the other direction: an older client opening a new room would play garrisoned moves on flat walls and drift. With the bump it's told to reload instead.

## How the bot changed (fair test, not a strawman)

It still previews every candidate with the real engine, so it has always paid the real wall prices. What's new is that it now *values* them. A man inside is worth less as a target the fuller his base, priced with the same numbers the engine charges, so it aims more often at men in the open and in thinned bases. Thinning a base raises the worth of those left in it. Sends are priced by the walls they leave thinner and the ones they man. Positioning scores each spot with the same worth, which is why it now keeps about two in three inside of its own accord. It still looks one flick ahead and over-sends (road kills are 5 a game in Quick, 11 in Classic).

## How it was run

`npm run lab` with `--garrison lo-hi,lo-hi,curve`, `--stances`, and `--from/--to` seed ranges. Each chunk (500 Quick games or 250 Classic) was its own `t3-test-run` job on 3 threads, 2–4 minutes each. `--raw` files were added up by `scripts/lab-table.ts`. Seeds 1–N are shared by every variant.

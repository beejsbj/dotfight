# Rules lab, round 6: the ruler, the star, and the prism's men

_2026-10-04. Branch `long-war/lab6`, stacked on `long-war/play` (PR #36), with round 5's harness merged in. On the game's own engine (`src/game.ts`). Raw chunks, merged tables and the run log: [data/round-6/](data/round-6/)._

**The question.** Six bases, two new shapes, convoys that walk while you aim, and a bot that plays the shapes: does one kit now beat the rest, and should the prism, ruler or star have different numbers? **I recommend; Burooj decides.** Nothing in `LONG` was changed.

**Read this first.**

- These are Dawood-bot against itself. They measure this bot's outcomes, not how a ruled line or an aiming star feels under a thumb.
- The shipped baseline is 400 games. Screens share seeds 1–120; kit matchups play both seats for each seed, giving 240 games. The prism-8 matchup only reached seeds 1–60, giving **120 games**, so its comparison uses that same subset of prism-6 games.
- All ± values are one standard error. Win-rate errors in the tables use the harness's binomial calculation over decided games; the two seat-swapped games share a seed, so these are approximate. Treatment differences below use paired seeds, averaging both seats within a seed for the prism-kit comparison.
- The original runbook limited guarded simulation time to about four hours. The handoff was already at 3h 54m including its timing run and killed attempt. I preserved its complete chunks and finished the requested 400-game baseline, then stopped new screens. **Square 8, pentagon cone 0.26/0.8, pentagon 6, and walk time 3000/12000 were not run.** Their recommendations below are next tests or provisional retention, with no measured treatment effect claimed.

## The rules as built

- **Six bases a side.** Dawood-bot's free pick is 32% camp, 22% cushion, 16% square, 15% prism and 15% pentagon. Camps have 12 men; cushions and pentagons 8; prisms and squares 6. The kit comparisons therefore change both shape powers and army size.
- **Square (the ruler).** A friendly line passing out through it becomes dead straight: no further hand curve, well, groove or ink jolt. A soldier standing inside it starts ruled. Walls, men and cushion banks still act on the line. Both snipes and lunges can be ruled.
- **Pentagon (the star).** A friendly line leaving it turns toward the nearest living enemy ahead within `cone 0.52` rad (about 30°) and the line's remaining reach. Each pentagon can turn it once; the hand's curve and page effects continue afterwards. Both snipes and lunges home.
- **Walking convoys.** Up to five men a send, 150 units a hand-over, walking that stretch over `walkMs 6000` of the turn's clock. A flick's recorded `ms` sets their position when it is released. They wait after finishing the stretch and arrive at the hand-over that reaches the far wall.
- **Prism.** Six men shipped; a friendly snipe leaving it splits at ±0.2 rad, with friendly prism walls free. The screen changes only its garrison to 8, for both sides, including prisms in the mix.

## The baselines

| | games | turns mean ± se (p90) | 1st wins ± se | stalled | kills/flick | sends (road kills) | army |
|---|---|---|---|---|---|---|---|
| Long as shipped | 400 | 40.5 ± 0.63 (53) | 52.5% ± 2.5 | 0% | 1.03 | 19.6 (12.1) | 52.5 |
| Long as shipped, seeds 1–120 | 120 | 41.1 ± 1.09 (54) | 50.8% ± 4.6 | 0% | 1.03 | 19.9 (12.3) | 52.6 |
| Long prism 8, seeds 1–120 | 120 | 39.4 ± 0.90 (52) | 50.8% ± 4.6 | 0% | 1.09 | 20.1 (13.3) | 54.5 |

The shipped baseline is **40.5 ± 0.6 turns** (p90 53), with first-player rate at **52.5% ± 2.5** and no stalls in 400 games. On seeds 1–120, the shipped baseline averages **41.1 ± 1.1 turns** (p90 54), while prism 8 on the same seeds runs **39.4 ± 0.9 turns** (p90 52), a paired difference of **−1.69 ± 1.03 turns** with first-player wins identical at **50.8% ± 4.6**.

Do not read a difference from round 5 as a treatment effect. Its baseline had five bases, an older bot and shape lottery, and sends without this turn-clock movement. This round has six bases and all five shapes.

## Recommendation per item

| item | recommendation | evidence and remaining question |
|---|---|---|
| **Prism men** | **8 is the next candidate; confirm before adopting.** | Against mix, 6 wins 42.5% ± 4.5 on matched seeds; 8 wins 48.3% ± 4.6. The paired gain is +5.8 ± 5.3 points, too uncertain to establish an improvement. Mixed-game length changes −1.7 ± 1.0 turns; first-player rate is unchanged. |
| **Square men** | **Test 8 next; no verdict on the unrun change.** | All-square at 6 wins 27.1% ± 2.9 against mix and 32.5% ± 3.0 against all-pentagon. Its power happens, but those armies lose badly. The 8-man screen is needed to separate headcount from power. |
| **Pentagon cone** | **Keep 0.52 provisionally.** | All-pentagon is level with mix, 49.6% ± 3.2, with 22.5 home events a game. Neither 0.26 nor 0.8 was screened. |
| **Pentagon men** | **Keep 8 provisionally.** | Six pentagons field 48 men and have no observed advantage over mix. Pentagon 6 was not screened; reducing its army has no measured justification here. |
| **Convoy walk time** | **Keep 6000 provisionally; test the timing with people.** | Shipped convoys lose 24.4% of sent walkers (12.1 road kills from 49.5 walkers over 19.6 sends a game). Neither 3000 nor 12000 was screened. The bot aims at walkers' earlier positions (below). |

### The prism's men

The fair baseline comparison is seeds 1–120: **41.1 ± 1.1 turns, p90 54** at 6 men, against **39.4 ± 0.9, p90 52** at 8. The paired difference is **−1.69 ± 1.03 turns**. Both have **61 first-player wins out of 120, 50.8% ± 4.6**, and neither stalls. Raising the garrison did not reveal a length or fairness cost in this screen.

The matchup needs its own matched comparison. On seeds 1–60 with both seats played, prism 6 wins **51/120 (42.5% ± 4.5)**; prism 8 wins **58/120 (48.3% ± 4.6)**. Mean length is 38.4 turns in both, p90 53 and 50; no stalls. Averaging the two seats within each seed gives **+5.8 ± 5.3 points** in prism wins and **−0.04 ± 1.28 turns**. That is consistent with a useful correction, but also with no improvement. The full shipped matchup is **98/239 decided games (41.0% ± 3.2)**; comparing it directly to the shorter prism-8 sample would overstate the gain.

**My call: take 8 forward as a candidate, not an established fix.** Finish its missing seeds 61–120 and test prism 8 against cushions before changing `LONG`. This round no longer has round 5's bot with no prism play, but the shipped all-prism kit still falls behind mix.

### The ruler and the star

| variant | games | rule events | ruled flicks (kills each) | home events | home flicks (kills each) |
|---|---|---|---|---|---|
| shipped (baseline) | 400 | 1.4 | 8.4 (0.99) | 7.2 | 7.0 (1.08) |
| all square v mix | 240 | 2.3 | 20.5 (1.01) | 2.9 | 2.8 (1.02) |
| all pentagon v mix | 240 | 0.9 | 4.5 (0.91) | 22.5 | 19.7 (1.09) |
| square v pentagon | 240 | 1.7 | 15.9 (1.07) | 15.1 | 13.0 (0.98) |

These rates are per whole game, across both sides. A `rule` event counts a line becoming ruled on the way out of a square. A flick starting inside a square is already ruled and emits no such event; **ruled flicks** includes both. Homing events count actual turns toward a target, not every pentagon exit, and a flick can home at more than one pentagon.

**Square: keep the mechanic, test its garrison.** At six squares the army has only 36 men, against roughly 52 in the mix and 48 in six pentagons. That is a plausible cause of its weak outcomes; these runs do not isolate it. Ruled lines still take about one man a flick. Their kills/flick is a selected set of shots, not a measurement of the extra kills the ruler causes. The 8-man screen remains the first useful test.

**Pentagon: retain 0.52 and 8 pending the missing screens.** It is used often, and the all-pentagon kit is level with mix over 240 games, averaging **37.1 turns (p90 48)**, **50.4% ± 3.2 first-player wins**, no stalls. Its 67.5% against squares shows a weak opponent, not general dominance. Nothing here selects a narrower or wider cone, or six men.

### The walking convoys

In 400 shipped baseline games, players execute **19.6 sends** per game and send **49.5 walkers**. Of those, **12.1 walkers per game are crossed out on the road**, so **24.4% of walkers sent are lost**. The harness counts enemy convoys exposed at turn starts: **24.0 convoy-turns** (59.0 walker-turns) per game.

**There is a bot limitation worth fixing before treating walk time as a balance dial.** Candidate flicks are previewed without `ms` (`src/bot.ts`); only the chosen action gets `(s.clock ?? 0) + 1200`. `marchView` keeps the current state when `ms` is absent, but the actual flick moves walkers before tracing. At shipped pace and walk time, an unfinished stretch advances by up to **30 units** in that gap. The bot plans against earlier positions and does not explicitly lead that movement. This can change interception results; these runs do not establish the direction or size of the bias against a human who leads the target.

The harness test proves that the bot records a finite flick moment and that a line can catch a walker at its later position while missing its earlier one. It establishes that the simulation uses the clock, not that Dawood-bot uses it well.

## Shape dominance

Each pairing uses seeds 1–120, both seats, **240 games**. Kit win rates are over decided games; turns include the capped game. `mix` is the bot's lottery, not every possible mixed army.

| pairing | mono kit wins / decided | mono kit win rate ± se | turns mean (p90) | 1st wins ± se | stalled |
|---|---|---|---|---|---|
| square v mix | 65/240 | **27.1% ± 2.9** | 33.5 (43) | 52.1% ± 3.2 | 0 |
| pentagon v mix | 119/240 | 49.6% ± 3.2 | 37.1 (48) | 50.4% ± 3.2 | 0 |
| prism v mix | 98/239 | **41.0% ± 3.2** | 38.9 (50) | 46.9% ± 3.2 | **1/240 (0.4%)** |
| camp v mix | 129/240 | 53.8% ± 3.2 | 41.0 (51) | 47.9% ± 3.2 | 0 |
| cushion v mix | 145/240 | **60.4% ± 3.2** | 48.0 (67) | 52.9% ± 3.2 | 0 |
| square v pentagon | 78/240 | **32.5% ± 3.0** (square) | 31.2 (41) | 49.2% ± 3.2 | 0 |

**Verdict: the mix does not dominate; no universally dominant mono kit has been established.** Cushion beats this mix by 60.4%, with the longest games (48 turns, p90 67). It has earned a follow-up against camps and pentagons; those pairings were not run, so "cushion beats every shape" would be unsupported. Camp and pentagon are within about 1.2 se of even against mix. Squares are clearly weak in both tested pairings, and prisms are weaker than mix.

The extra prism-8 screen is 120 games and belongs in the prism comparison above, not in this 240-game table. One shipped prism game reached the 250-turn cap: seed 81, prism in the first seat (499 flicks). Its seat-swapped counterpart finished in 31 turns. The raw summary does not establish why it stalled. No other completed round-6 game reached the cap.

## What Burooj decides

1. **Prism 8:** adopt a promising but uncertain screen, or finish its matched sample and cushion pairing first. I recommend finishing those comparisons.
2. **Square 8:** prioritise its unrun garrison screen. All-square is the weakest tested kit; these data cannot decide how much is its 36-man army.
3. **Cushion:** investigate its 60.4% over mix and length cost before calling it the best shape. Camp and pentagon opponents are missing.
4. **Star:** keep the present cone and garrison while testing the alternatives. Its shipped mono kit is level with mix.
5. **Convoys:** play the six-second walk with people and correct the bot's timing prediction before using its road kills to choose a walk time.

## How it was run

- Sim: `scripts/rules-lab.ts` through `/home/admin/.local/bin/t3-test-run`, one guarded job at a time, 3 threads, `--max-turns 250`. Default agents `steady,steady`, positioning stances `half,half`, six-base `--sizes long`.
- Command shape: `node --import ./scripts/ts-resolve.mjs scripts/rules-lab.ts --rules long --sizes long --from A --to B --threads 3 --max-turns 250 --label LABEL --raw raw/LABEL-A-B.json [--kits A:B --swap] [--set long.shapes.prism.soldiers=8]`. Exact arguments and wall times are in [the log](data/round-6/log.md).
- Chunks: 60 ordinary games or 30 seeds with `--swap`; the final baseline chunk is 40. Baseline seeds 1–400; shipped matchups 1–120; prism-8 baseline 1–120; prism-8 matchup 1–60 with swaps. **2,080 retained games**, plus the six-game timing run (not retained in the raw experiment set).
- Handoff: the earlier worker wrote the harness and ran all matchups, prism screens and baseline seeds 1–300. I checked and committed its uncommitted seeds 121–300, removed the killed 301–360 line, reran 301–360 and ran 361–400. A separate worker extracted shared-seed evidence without launching simulations or changing tracked files.
- Time: **14,825 s (4h 07m 05s) of guarded simulation**, including 57 s timing and 90 s from the killed attempt. Completed raw chunks account for 14,678 s. Aggregation and final checks add 105 s: **14,930 s (4h 08m 50s) total recorded guarded wall time**. This continuation used 849 s (14m 09s), of which 744 s was simulation. Two lock deferrals ran no job.
- Merging: `scripts/lab-table.ts` checks matching configurations and duplicate seeds, then writes [tables.md](data/round-6/tables.md). Its `JSON=1` final line supplies [summary.json](data/round-6/summary.json). These include all retained experiments. Mean-turn standard errors use sample SD / √N; paired errors apply the same formula to per-seed treatment differences. For swapped prism comparisons, average the two seat results within each seed before calculating differences (N = 60).
- **Not run:** square soldiers 8; pentagon cone 0.26 and 0.8; pentagon soldiers 6; `walkMs` 3000 and 12000; prism-8 matchup seeds 61–120. The time limit was applied across the handoff and this continuation. No Core comparison or browser/performance playtest was added; this continuation changes data and documentation.
- Final checks, each through the guard: `npm run typecheck` exit 0; `npm test -- --maxWorkers=1`: **34 files, 487 tests passed**, including the Core step-by-step replay pin; `npm run build`: **`✓ built in 896ms`**. Exact terminal output and commands: [verification.md](data/round-6/verification.md).

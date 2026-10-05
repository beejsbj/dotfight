# Rules lab, round 6: the ruler, the star, and the prism's men

_2026-10-04. Branch `long-war/lab6`, stacked on `long-war/play` (PR #36), with round 5's harness merged in. On the game's own engine (`src/game.ts`). Round 6b completes the screens stopped at round 6's time limit. Raw chunks, merged tables, paired estimates and run log: [data/round-6/](data/round-6/)._

**The question.** Six bases, two new shapes, convoys that walk while you aim, and a bot that plays the shapes: does one kit beat the rest, and should the prism, ruler or star have different numbers? **I recommend; Burooj decides.** No shipped number in `LONG` was changed.

**Read this first.**

- These are Dawood-bot against itself. They measure this bot's outcomes, not how ruling, homing or moving targets feel under a thumb.
- The shipped baseline is 400 games. Every treatment baseline uses seeds 1–120; compare it with those same 120 shipped seeds. Every kit matchup now uses both seats for each of seeds 1–120: **240 games each**, including the completed prism-eight comparison and both cushion follow-ups. **4,360 retained games**, of which round 6b adds 2,280.
- All ± values are **one standard error**. Win-rate table errors use the harness's binomial estimate over decided games and are approximate because two games share a seed. Treatment differences pair seeds; swapped comparisons average the two seat differences within each seed before calculating the error. Descriptive turn errors in tables use sample SD / √games; paired differences use independent seed units.
- Turns include capped games. Win rates exclude stalls. Prism-six has one stalled game at seed 81; the main paired prism win comparison excludes **both seats of that seed**, leaving 119 complete decided seeds. A sensitivity calculation scores that stall half a win. The raw rates and paired difference therefore use explicitly different denominators.

## The rules as built

- **Six bases a side.** Dawood-bot's free pick is 32% camp, 22% cushion, 16% square, 15% prism and 15% pentagon. Camps have 12 men; cushions and pentagons 8; prisms and squares 6. The kit comparisons therefore change both shape powers and army size.
- **Square (the ruler).** A friendly line passing out through it becomes dead straight: no further hand curve, well, groove or ink jolt. A soldier standing inside it starts ruled. Walls, men and cushion banks still act on the line. Both snipes and lunges can be ruled.
- **Pentagon (the star).** A friendly line leaving it turns toward the nearest living enemy ahead within `cone 0.52` rad (about 30°) and the line's remaining reach. Each pentagon can turn it once; the hand's curve and page effects continue afterwards. Both snipes and lunges home.
- **Walking convoys.** Up to five men a send, 150 units a hand-over, walking that stretch over `walkMs 6000` of the turn's clock. A flick's recorded `ms` sets their position when it is released. They wait after finishing the stretch and arrive at the hand-over that reaches the far wall.
- **Prism.** Six men shipped; a friendly snipe leaving it splits at ±0.2 rad, with friendly prism walls free. The screen changes only its garrison to 8, for both sides, including prisms in the mix.

## The baselines

The full shipped baseline is **40.50 ± 0.63 turns** (p90 53), **52.5% ± 2.5 first-player wins**, and **0/400 stalls**. It averages 1.03 kills/flick, 19.61 sends and 12.10 road kills a game. The table below uses the matched 120-game baseline for each treatment; its errors and paired effects are reproduced in [paired.json](data/round-6/paired.json).

| variant | games | turns mean ± se (p90) | 1st wins ± se | stalled | Δ turns vs shipped, paired | rule events | home events | road kills | walkers lost |
|---|---|---|---|---|---|---|---|---|---|
| shipped seeds 1–120 | 120 | 41.09 ± 1.09 (54) | 50.8% ± 4.6 | 0/120 | — | 1.18 | 7.49 | 12.30 | 24.9% |
| square eight | 120 | 40.89 ± 1.11 (51) | 55.8% ± 4.5 | 0/120 | -0.20 ± 1.29 | 1.31 | 7.12 | 12.91 | 24.6% |
| cone 0.26 | 120 | 41.38 ± 1.14 (54) | 48.3% ± 4.6 | 0/120 | +0.29 ± 1.25 | 1.38 | 6.17 | 12.07 | 24.9% |
| cone 0.8 | 120 | 39.92 ± 1.13 (55) | 57.5% ± 4.5 | 0/120 | -1.17 ± 0.92 | 1.00 | 7.78 | 12.24 | 24.6% |
| pentagon six | 120 | 39.74 ± 1.05 (51) | 44.2% ± 4.5 | 0/120 | -1.35 ± 1.05 | 1.32 | 6.62 | 12.62 | 25.4% |
| walk 3000 | 120 | 40.92 ± 0.91 (55) | 56.7% ± 4.5 | 0/120 | -0.17 ± 1.32 | 1.43 | 7.14 | 11.30 | 21.7% |
| walk 12000 | 120 | 37.75 ± 0.78 (49) | 56.7% ± 4.5 | 0/120 | -3.34 ± 1.21 | 0.84 | 7.41 | 13.74 | 28.4% |
| prism eight | 120 | 39.40 ± 0.90 (52) | 50.8% ± 4.6 | 0/120 | -1.69 ± 1.03 | 1.00 | 7.19 | 13.29 | 25.8% |

All these baselines are mixed armies; a garrison override applies to that shape on **both sides**, including shapes drawn by mix. This separates the overall game's outcome from the mono kit's performance. The square-eight baseline's first-player change is **+5.0 ± 5.7 points**, wider cone **+6.7 ± 5.6**, pentagon-six **−6.7 ± 5.9**, and prism-eight **0.0 ± 6.3**. The two walk treatments each gain 5.8 points, with paired errors 6.4 and 6.0. None establishes a treatment-induced seat imbalance at these sample sizes.

Do not read the difference from round 5 as a treatment effect: that round used five bases, an older bot and shape lottery, and sends without this turn-clock movement.

## Recommendation per item

| item | final recommendation | measured outcome and tradeoff |
|---|---|---|
| **Square men** | **Raise 6 → 8.** | Against mix, 27.1% → 41.7% wins; paired gain **+14.6 ± 4.2 points**. Matchup length rises **2.69 ± 0.77 turns**, to 36.21; the mixed baseline changes **−0.20 ± 1.29 turns**. No stalls. It remains weaker than mix. |
| **Pentagon cone** | **Keep 0.52.** | At 0.26 / 0.52 / 0.8, mono-pentagon wins **49.6% / 49.6% / 54.2%** against mix; wider-cone paired gain **+4.6 ± 4.8 points** is inconclusive. Home events **21.8 / 22.5 / 23.3** a matchup game. No stalls. |
| **Pentagon men** | **Keep 8.** | Six men gives **45.4% ± 3.2** wins against mix, versus **49.6% ± 3.2** at eight; paired change **−4.2 ± 4.6 points**. Six shortens that matchup **1.83 ± 0.83 turns**, but does not establish a balance benefit. No stalls. |
| **Convoy walk time** | **Keep 6000; correct the bot's prediction and playtest the timing.** | At 3000 / 6000 / 12000, matched-baseline road kills **11.30 / 12.30 / 13.74**, walker loss **21.7% / 24.9% / 28.4%**, turns **40.92 / 41.09 / 37.75**. Twelve seconds shortens the bot's games **3.34 ± 1.21 turns**, with more road losses. No stalls; the bot does not lead moving targets. |
| **Prism men** | **Raise 6 → 8.** | Full mono-prism matchup **41.0% ± 3.2 → 50.8% ± 3.2** wins. Complete decided seed pairs give **+9.2 ± 4.2 points** (119 seeds). Mixed baseline **−1.69 ± 1.03 turns**, identical first-player rates. Prism-eight has no stalls. |
| **Cushion** | **Keep its shipped numbers; no general dominance established.** | Cushion wins **60.4% ± 3.2** against mix, **52.5% ± 3.2** against camps and **59.2% ± 3.2** against pentagons. Corresponding mean turns **47.99 / 48.26 / 41.95**, banks **23.0 / 17.2 / 15.3** a game; no stalls. Its edge extends to pentagons, with no clear advantage over camps. |

### The ruler: eight men, with a remaining weakness

Square-six wins **65/240 (27.1% ± 2.9)** against mix; square-eight wins **100/240 (41.7% ± 3.2)**. The paired gain is **+14.58 ± 4.24 points** across 120 seeds. That is the clearest garrison result here. The matchup grows from **33.52 ± 0.60 turns (p90 43)** to **36.21 ± 0.51 (p90 46)**: **+2.69 ± 0.77 turns**. Its first-player rate is 52.1% ± 3.2 at six and 53.3% ± 3.2 at eight; neither stalls.

The cost belongs to the mono kit comparison. In mixed armies, raising square men changes length only **−0.20 ± 1.29 turns**, with first-player rate 55.8% ± 4.5 and no stalls. Rule exits fall from 2.32 to 1.92 a matchup game, while ruled flicks rise from 20.50 to 21.07; selected ruled flicks take **1.01 → 1.10 kills each**. The higher win rate comes with fewer recorded rule-exit events.

**My call: raise the square to eight.** Six squares then field 48 men rather than 36. It still trails mix. The larger garrison corrects an observed weakness while leaving that gap. The screen changes garrison count and the resulting game trajectory; it does not isolate the value of dead-straight lines.

### The star: keep the cone and eight men

| variant, pentagon v mix | wins / decided | pentagon wins ± se | turns mean ± se (p90) | 1st wins ± se | stalls | home events/game |
|---|---|---|---|---|---|---|
| cone 0.26, eight men | 119/240 | 49.6% ± 3.2 | 37.60 ± 0.58 (48) | 52.1% ± 3.2 | 0/240 | 21.80 |
| **cone 0.52, eight men: shipped** | 119/240 | 49.6% ± 3.2 | 37.11 ± 0.69 (48) | 50.4% ± 3.2 | 0/240 | 22.52 |
| cone 0.8, eight men | 130/240 | 54.2% ± 3.2 | 36.32 ± 0.49 (46) | 56.7% ± 3.2 | 0/240 | 23.29 |
| cone 0.52, six men | 109/240 | 45.4% ± 3.2 | 35.28 ± 0.52 (47) | 52.9% ± 3.2 | 0/240 | 22.33 |

Narrowing the cone gives **0.00 ± 4.77 points** in kit wins and **+0.48 ± 0.86 turns**. Widening it gives **+4.58 ± 4.77 points** and **−0.79 ± 0.73 turns**. Its first-player change is **+6.25 ± 4.45 points** in the swapped matchup; the mixed baseline is 57.5% ± 4.5 first-player wins. That is a reason to watch the wide cone's seat balance, not an established bias. The wider cone has no demonstrated kit-win gain; its small length reduction is uncertain, and all three cones activate often with this bot. **Keep 0.52.** The feel of a narrower or wider aiming aid still needs a thumb.

Reducing the star to six men gives **−4.17 ± 4.57 points** in kit wins and **−1.83 ± 0.83 turns**. Its mixed baseline shortens **1.35 ± 1.05 turns**, with 44.2% ± 4.5 first-player wins and no stalls. The measured tradeoff is a shorter mono-kit war with a lower, uncertain win rate. **Keep eight**: I favour the shipped kit's even result against mix over the six-man screen's roughly two-turn saving and lower raw win rate. The paired win-rate difference remains uncertain. The star's 67.5% win rate against square-six is a result against the weakest tested opponent, not evidence of general dominance.

### The prism: the full sample supports eight

Prism-six wins **98/239 decided games (41.0% ± 3.2)**; prism-eight wins **122/240 (50.8% ± 3.2)**. Both use seeds 1–120 with seat swaps. Excluding both seats of stalled seed 81 gives **98/238 (41.2%) → 120/238 (50.4%)**, a paired improvement of **+9.24 ± 4.22 points** over 119 independent seeds. Scoring the shipped stall half a win and keeping all 120 seeds gives **+9.79 ± 4.22 points**. The conclusion does not hinge on how that one stall is handled.

Mean matchup length is **38.92 ± 1.12 turns (p90 50)** at six and **39.20 ± 0.62 (p90 52)** at eight. The paired length change, including the capped game, is **+0.27 ± 1.23 turns**. First-player wins are **46.9% ± 3.2 → 50.0% ± 3.2**; stalls **1/240 → 0/240**. Splits remain frequent, **19.46 → 19.27 per whole matchup game**.

In the matched mixed baseline, eight men shortens the game **1.69 ± 1.03 turns**, to **39.40 ± 0.90 (p90 52)**. Both garrisons have **61/120 first-player wins (50.8% ± 4.6)** and no stalls. **My call: raise the prism to eight.** Its kit reaches even against this mix with no detected length or seat cost. This supports a number to adopt; direct prism-eight matchups against every other shape and human play were outside this runbook.

### What ruling and homing count

| variant | rule events | ruled flicks | kills per ruled flick | home events | homed flicks | kills per homed flick |
|---|---|---|---|---|---|---|
| mixed, cone 0.26 | 1.38 | 8.22 | 0.97 | 6.17 | 6.03 | 1.10 |
| mixed, cone 0.8 | 1.00 | 8.13 | 1.06 | 7.78 | 7.41 | 1.02 |
| mixed, pentagon six | 1.32 | 8.26 | 1.02 | 6.62 | 6.47 | 1.02 |
| mixed, prism eight | 1.00 | 8.00 | 1.12 | 7.19 | 7.03 | 1.11 |
| mixed, square eight | 1.31 | 8.51 | 0.98 | 7.12 | 6.97 | 1.14 |
| shipped baseline (400) | 1.43 | 8.38 | 0.99 | 7.18 | 7.04 | 1.08 |
| pppppp:mix | 0.74 | 3.65 | 0.83 | 3.36 | 3.26 | 0.90 |
| pppppp:mix prism8 | 0.58 | 4.42 | 0.95 | 3.75 | 3.60 | 1.01 |
| ssssss:mix | 2.32 | 20.50 | 1.01 | 2.87 | 2.83 | 1.02 |
| ssssss:mix square8 | 1.92 | 21.07 | 1.10 | 3.03 | 2.97 | 1.11 |
| ssssss:tttttt | 1.70 | 15.91 | 1.07 | 15.15 | 13.03 | 0.98 |
| tttttt:mix | 0.85 | 4.46 | 0.91 | 22.52 | 19.69 | 1.09 |
| tttttt:mix cone026 | 0.66 | 4.25 | 0.98 | 21.80 | 19.44 | 1.05 |
| tttttt:mix cone08 | 0.56 | 4.09 | 0.98 | 23.29 | 20.07 | 1.11 |
| tttttt:mix pentagon6 | 0.45 | 3.62 | 0.86 | 22.33 | 19.51 | 1.04 |

The shipped baseline row uses 400 games; treatment baseline rows use 120, and matchup rows use 240. Rates are per whole game, across both sides. A `rule` event counts a line becoming ruled when it leaves a friendly square; a flick starting inside one emits no such event. **Ruled flicks** includes both. A `home` event is an actual turn toward a target, not every pentagon exit; one flick can home at more than one pentagon.

Kills/flick is a description of selected ruled or homed shots, including all kills on those flicks. It does not measure the extra kills caused by ruling or homing. The mechanics, shooters and targets are selected together by the bot.

### The walking convoys: keep six seconds, with the bot caveat

| walkMs, mixed baseline seeds 1–120 | turns mean ± se (p90) | 1st wins ± se | stalls | sends/game | walkers sent/game | road kills/game | walkers lost |
|---|---|---|---|---|---|---|---|
| 3000 | 40.92 ± 0.91 (55) | 56.7% ± 4.5 | 0/120 | 20.55 | 52.08 | 11.30 ± 0.43 | 21.7% |
| **6000 shipped** | 41.09 ± 1.09 (54) | 50.8% ± 4.6 | 0/120 | 19.86 | 49.37 | 12.30 ± 0.51 | 24.9% |
| 12000 | 37.75 ± 0.78 (49) | 56.7% ± 4.5 | 0/120 | 18.89 | 48.41 | 13.74 ± 0.52 | 28.4% |

Against the shipped timing, 3000 changes length **−0.17 ± 1.32 turns** and road kills **−1.00 ± 0.56 per game**. At 12000, length changes **−3.34 ± 1.21 turns** and road kills **+1.44 ± 0.61**. The twelve-second bot wars are shorter and lose more walkers. That is a measured alternative, but it is not sufficient to select a human aiming time.

**Dawood-bot does not lead moving targets.** Its candidate flicks are previewed without `ms` (`src/bot.ts`), and only the chosen action gets `(s.clock ?? 0) + 1200`. `marchView` leaves positions as they are when `ms` is absent; the actual flick moves walkers before tracing. Over that delay, an unfinished 150-unit stretch can advance by up to **60 / 30 / 15 units** at 3000 / 6000 / 12000. The size of the prediction error changes with the dial being screened. These runs cannot separate walk timing from a bot that plans against earlier positions.

**My call: keep 6000, correct the bot's release-time prediction, and compare timing with people.** Retaining it leaves the twelve-second bot screen's roughly three-turn reduction on the table. The harness test establishes that walkers move at the recorded flick moment and can be hit mid-walk; it does not establish that the bot predicts that movement well.

The full 400-game shipped reference averages **19.61 sends, 49.51 walkers sent and 12.10 road kills**, a **24.4%** loss share, with 24.05 enemy convoy-turns and 58.95 walker-turns exposed a game. The table uses 120 matched seeds and therefore has slightly different rates. Walker loss is total road kills / total walkers sent; these are send events, and a surviving soldier can be sent again.

## Shape dominance

Every row uses **240 games**, seeds 1–120, both seats. Mono-kit rates exclude stalls; turns include them. The first eight rows use shipped numbers; the final two show the recommended garrison screens. `mix` is Dawood-bot's lottery, not all possible mixed armies.

| pairing | mono kit wins / decided | mono kit wins ± se | turns mean ± se (p90) | 1st wins ± se | stalls | banks/game |
|---|---|---|---|---|---|---|
| square-six v mix | 65/240 | 27.1% ± 2.9 | 33.52 ± 0.60 (43) | 52.1% ± 3.2 | 0/240 | 2.87 |
| pentagon-eight v mix | 119/240 | 49.6% ± 3.2 | 37.11 ± 0.69 (48) | 50.4% ± 3.2 | 0/240 | 3.23 |
| prism-six v mix | 98/239 | 41.0% ± 3.2 | 38.92 ± 1.12 (50) | 46.9% ± 3.2 | 1/240 | 4.50 |
| camp v mix | 129/240 | 53.8% ± 3.2 | 41.02 ± 0.59 (51) | 47.9% ± 3.2 | 0/240 | 3.57 |
| cushion v mix | 145/240 | 60.4% ± 3.2 | 47.99 ± 1.18 (67) | 52.9% ± 3.2 | 0/240 | 22.98 |
| square-six v pentagon-eight | 78/240 | 32.5% ± 3.0 (square) | 31.16 ± 0.46 (41) | 49.2% ± 3.2 | 0/240 | 0.00 |
| **cushion v camp** | **126/240** | **52.5% ± 3.2** | **48.26 ± 0.83 (62)** | **55.8% ± 3.2** | **0/240** | **17.21** |
| **cushion v pentagon-eight** | **142/240** | **59.2% ± 3.2** | **41.95 ± 0.65 (55)** | **50.0% ± 3.2** | **0/240** | **15.32** |
| square-eight v mix | 100/240 | 41.7% ± 3.2 | 36.21 ± 0.51 (46) | 53.3% ± 3.2 | 0/240 | 2.99 |
| prism-eight v mix | 122/240 | 50.8% ± 3.2 | 39.20 ± 0.62 (52) | 50.0% ± 3.2 | 0/240 | 3.85 |

**Verdict: mix does not dominate; cushion's advantage extends to pentagons, with no clear edge over camps. No universal mono-kit dominance is established.** Cushion versus camp is only 0.8 approximate se above even; versus pentagon is 2.9 se above even, and both armies have 48 men. It is therefore more than an advantage over this particular mix, but the camp follow-up does not support calling it superior to every shape. The direct cushion–square and cushion–prism pairings were outside round 6b's requested screens.

**Keep the cushion's shipped numbers.** Its measured advantage over the star warrants attention in play, but camps are a viable alternative in this bot screen and a nerf was not tested. The cushion pairings also carry a length observation: about 48 turns against mix or camps, 42 against pentagons. Different opponents and headcounts prevent treating those differences as the causal cost of banks.

One game stalled in the entire retained round-6 set: shipped prism-six seed 81, prism in the first seat, at the 250-turn cap (499 flicks). Its swapped counterpart finished in 31 turns; the raw summary does not establish the cause. Every round-6b game completed below the cap.

## Final recommendations for Burooj

1. **Prism: choose eight men.** The finished sample brings its mono kit to even against mix; the paired improvement is +9.2 ± 4.2 points. Direct comparisons with all other shapes remain outside this screen.
2. **Square: choose eight men.** The paired gain is +14.6 ± 4.2 points; accept about 2.7 extra turns in an all-square matchup. It still loses more than it wins against mix.
3. **Cushion: retain its numbers.** The follow-ups establish a pentagon advantage, with no clear camp advantage. They do not establish a dominant shape or identify a justified nerf.
4. **Star: retain cone 0.52 and eight men.** Wider cone and fewer men supply uncertain win changes; six men shorten the mono-kit matchup about 1.8 turns while its raw win rate falls.
5. **Convoys: retain 6000 and repair the bot's prediction before another balance verdict.** Twelve seconds is shorter in the bot screen, with higher road losses; moving-target aiming needs people as well.

These are recommendations for the rule decision. They do not change `LONG`, the rulebook's shipped values, or production.

## How it was run

- Sim: `scripts/rules-lab.ts` through `/home/admin/.local/bin/t3-test-run`, one guarded job at a time, 3 threads, `--max-turns 250`. Default agents `steady,steady`, positioning stances `half,half`, six-base `--sizes long`.
- Command shape: `node --import ./scripts/ts-resolve.mjs scripts/rules-lab.ts --rules long --sizes long --from A --to B --threads 3 --max-turns 250 --label LABEL --raw raw/LABEL-A-B.json [--kits A:B --swap] [--set long.key=value]`. The log records each label, seed range, exact treatment arguments, return code and wall seconds.
- Chunks: 60 ordinary games or 30 seeds with `--swap`; the original baseline ends with a 40-game chunk. Baseline seeds 1–400; every treatment baseline and matchup seeds 1–120. Round 6b ran in the specified order: square-eight; cone 0.26 then 0.8; pentagon-six; walks 3000 then 12000; missing prism-eight seeds; cushion–camp then cushion–pentagon. **73 raw chunks and 4,360 retained games**, plus the original six-game timing run outside the experiment set.
- Handoff: the earlier workers completed the harness and 2,080 games. Round 6b adds **2,280 games in 38 guarded chunks**, using the same `/tmp/lab6run.sh` helper. A fixed sequential queue stopped on any guard failure or deferral and committed each completed experiment. All its jobs passed; no continuation deferrals or retries occurred. A bounded Sol worker wrote the statistics script without starting simulations or guarded jobs; I reviewed its formulas and ran it after the queue completed.
- Time: prior recorded guarded time **14,930 s (4h 08m 50s)**, including 14,825 s simulation, the timing run and the discarded killed attempt. Round 6b simulation **15,545 s (4h 19m 05s)**; aggregation, paired analysis, table formatting and final checks **89 s**; round 6b total **15,634 s (4h 20m 34s)**. **All recorded round-6 guarded time: 30,564 s (8h 29m 24s)**. The continuation's seven-hour allowance was not reached. These are the sum of recorded integer wall seconds for guarded jobs; editing and waiting are outside that total.
- Merging: guarded `env JSON=1 node --import ./scripts/ts-resolve.mjs scripts/lab-table.ts docs/rules-lab/data/round-6/raw/*.json` regenerated [tables.md](data/round-6/tables.md) and [summary.json](data/round-6/summary.json), checking configurations and duplicate seeds. Guarded `python3 docs/rules-lab/data/round-6/paired-analysis.py` reproduces the full statistical output; [paired.json](data/round-6/paired.json) keeps its estimates with redundant path and per-seed inventories omitted. All 21 labels have their intended counts and complete seed ranges; all 12 treatment comparisons have 120 matched seeds. Mean-turn errors use sample SD / √N; swapped paired errors use N = 120 seed means, with N = 119 for the main decided prism win comparison.
- **All requested round-6b screens completed.** No combined square-eight/prism-eight treatment, new Core balance comparison, human playtest or browser/performance playtest was requested here. Implementation stayed unchanged; the full suite verifies the existing Core replay pin.
- Final checks, each sequentially through the guard: `npm run typecheck` exit 0; `npm test -- --maxWorkers=1` exit 0; `npm run build` exit 0. Exact capture: [verification.md](data/round-6/verification.md).

```text
 Test Files  34 passed (34)
      Tests  487 passed (487)
   Duration  79.16s (tests 95%, transform 2%, import 2%)
✓ built in 782ms
```

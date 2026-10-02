# Rules lab, round 5: the long war

_2026-10-02. Branch `long-war/lab`, stacked on `long-war/engine` (PR #33). On the game's own engine (`src/game.ts`), like rounds 3 and 4. Raw chunks, merged tables and the run log: [data/round-5/](data/round-5/)._

**The question.** The long war is built (PR #33) with numbers that are lab guesses: `LONG` in `src/rules.ts`. For each mechanic, does it earn its place, and is the shipped number right? A mechanic "earns its place" if it happens often, doesn't tip the game to the first player, doesn't stall it, and doesn't stretch it past what a table will play. **I recommend; Burooj decides.** Nothing in `LONG` was changed.

**Read this first.**
- The players are Dawood-bot against itself, so these runs say whether a rule breaks fairness or length. They say nothing about how a bent line *feels* to a person. The bot aims off its target to allow for wells and plans bank shots, so it shrugs off both. A well that costs the bot nothing can still frustrate a child.
- 120-game screens carry about ±4.5 points on a win rate (one standard error) and about ±1.1 on a mean game length. So "no effect" below means "none bigger than roughly 9 points of win rate or 3 turns". The exceptions are said out loud.
- Screens run seeds 1 to 120. The like-for-like baseline for them is **long as shipped on the same 120 seeds: 38.9 ± 1.3 turns, 50.8% first**. The 400-game number is in the table too.

## The rules as built

- **Camp (circle): a gravity well.** Lines near it, anyone's, bend round it, and the pull follows the garrison. Shipped: `pull 0.004`, `reach 3.5`, `floor 0.12`, `maxTurn 1.2`. 12 soldiers.
- **Cushion (hexagon): billiards.** A line meeting its wall at more than `glance 0.6` rad off square bounces, up to `maxBanks 3`. 8 soldiers.
- **Prism (triangle): splits.** A line passing out through your own prism splits in two (`spread 0.2` rad; `ownFree: true`, so it costs nothing to shoot through your own). 6 soldiers.
- **Ink.** Crossing an old line jolts the pen (`jolt 0.03` rad, up to 1 per line); a shallow line is pulled into a groove (`groovePull 0.02`) and carried along it, further along your own ink (`grooveOwn 0.7`) and cut short along the enemy's (`grooveEnemy 1.4`).
- **Sends.** Convoys walk 150 units a turn (`sendPace`).
- **Armies.** Five bases a side, each in a shape. The bot's free pick is 45% camps, 35% cushions, 20% prisms.

## The baselines

| | games | turns mean (p90) | 1st wins ± se | stalled | kills/flick | sends (road kills) | army |
|---|---|---|---|---|---|---|---|
| Core Classic (today's `CORE`) | 400 | 35.4 (44) | 50% ± 2.5 | 0% | 1.05 | 14.5 (11.4) | 50.0 |
| Long as shipped | 400 | 40.7 (55) | 51% ± 2.5 | 0% | 0.94 | 15.9 (11.2) | 47.3 |
| Long as shipped, seeds 1–120 | 120 | 38.9 (55) | 51% | 0% | | | |

The long war is **5.4 ± 1.0 turns longer** than Classic, and its p90 is 11 turns longer. It has 5 fewer soldiers a side on average (47.3 against 50), so it is not yet a "bigger army" game (see Armies). The first player's edge is nowhere. Nothing stalled in 400 games. Round 2's pen-physics war ran about 81 turns; this one is about half that.

How often each mechanic happens in a shipped game (400): 9.2 banks, 5.8 splits, 82.7 jolts, 32 well-bent flicks (37% of all flicks; "bent" means turned more than 0.05 rad), 8,835 units of groove ridden (1,307 of them on enemy ink), 66% lunges to 34% snipes.

## Recommendation per mechanic

All "Δ turns" are against the 38.9 baseline on seeds 1–120, with the standard error of the difference.

| mechanic | variant | turns (p90) | Δ turns | 1st wins | stalled | how often it happens |
|---|---|---|---|---|---|---|
| **Well** | off (`pull 0`) | 38.9 (55) | +0.1 ± 1.6 | 43% | 0% | 0 bent |
| | `pull 0.002` | 39.5 (55) | +0.6 ± 1.7 | 58% | 0% | 19% of flicks bent |
| | **`0.004` shipped** | 38.9 (55) | | 51% | 0% | 37% bent |
| | `pull 0.008` | 39.8 (52) | +0.9 ± 1.7 | 53% | 0% | 52% bent |
| | `reach 2.5` | 39.5 (55) | +0.6 ± 1.6 | 51% | 0% | 24% bent |
| | `reach 5` | 38.5 (52) | −0.4 ± 1.6 | 46% | 0% | 49% bent |
| **Cushion** | off (`maxBanks 0`) | 36.0 (45) | −2.9 ± 1.5 | 55% | 0% | 0 banks |
| | `glance 0.4` | 41.1 (58) | +2.2 ± 1.8 | 56% | 0% | 12.5 banks |
| | **`0.6` shipped** | 38.9 (55) | | 51% | 0% | 9.2 banks (400) |
| | `glance 0.8` | 38.8 (56) | 0.0 ± 1.7 | 56% | 0% | 5.7 banks |
| **Prism** | `spread 0.1` | 41.0 (60) | +2.2 ± 1.7 | 44% | 0% | 7.9 splits |
| | **`0.2` shipped** | 38.9 (55) | | 51% | 0% | 5.8 splits (400) |
| | `spread 0.35` | 38.9 (54) | +0.1 ± 1.6 | 52% | 0% | 3.9 splits |
| | `ownFree false` | 40.1 (50) | +1.2 ± 2.3 | 56% | 1% | 5.0 splits |
| **Ink** | all off | 34.0 (42) | −4.8 ± 2.3 | 51% | 1% | 0 jolts |
| | jolts only | 39.6 (56) | +0.8 ± 2.2 | 58% | 0% | 82.5 jolts |
| | grooves only | 35.3 (43) | −3.6 ± 1.7 | 50% | 0% | 5,016 ridden (793 on enemy ink) |
| | symmetric grooves | 41.1 (55) | +2.3 ± 1.9 | 48% | 0% | 7,598 ridden (1,530) |
| | **shipped** | 38.9 (55) | | 51% | 0% | 82.7 jolts; 8,835 ridden |
| | `jolt 0.06` | **49.1 (66)** | **+10.3 ± 2.0** | 57% | 0% | 92.5 jolts |
| **Send pace** | 100 | 39.4 (53) | +0.5 ± 1.7 | 57% | 0% | 15.9 sends (12.0 road kills) |
| | **150 shipped** | 38.9 (55) | | 51% | 0% | 15.9 (11.2) (400) |
| | 250 | 40.4 (58) | +1.5 ± 1.7 | 57% | 0% | 15.7 (10.4) |

**Well: keep `pull 0.004`, `reach 3.5`.** It bends 37% of all flicks and costs nothing the lab can see: no variant moves the game length by more than a turn, and no win rate is more than 1.8 se off 50% (the 43% for "off" and 58% for 0.002 aren't ordered by strength, so I read them as noise). Pull and reach are feel dials, not balance dials; the bot can't tell Burooj which feels right. If playtests find wells too fiddly, 0.002 still bends one flick in five and is just as fair. Cutting the well isn't indicated by anything here.

**Cushion: keep, `glance 0.6`.** Banks are the one mechanic with a measurable length cost: switching them off shortens a game by 2.9 ± 1.5 turns (p90 45 against 55). That is a 7% cost for 9 banks a game. The glance angle itself doesn't matter: 0.4 and 0.8 sit within noise of 0.6 (they change how many banks the bot takes, 12.5 and 5.7, not how long the war goes). No fairness cost.

**Prism: keep `spread 0.2`, `ownFree true`.** Neither knob shows up in any column. Spread 0.1 to 0.35 and paying to split through your own prism all land within noise on length and fairness. The splits are rare (5.8 a game), and *the bot doesn't use them on purpose*: `src/bot.ts` has no prism logic at all, only `botShape` picking one 20% of the time. So these runs can't say whether the prism is a good rule, only that it breaks nothing. The shape-dominance runs below say more, and none of it is flattering.

**Ink: keep the shipped numbers, and don't double the jolt.** Jolt 0.06 is the only variant here that is plainly worse: +10.3 ± 2.0 turns (49.1, p90 66), kills per flick down to 0.83 from 0.94, a 26% longer war for the same fairness. The pieces come apart like this: all ink off is the shortest (34.0), jolts alone add about 5.6 turns to that, grooves alone about 1.3. Jolts are what stretches the war. Making grooves symmetric (own 1.0 and enemy 1.0) moves nothing measurable (48% first, +2.3 ± 1.9 turns), so the "friendly carries further, enemy cuts shorter" asymmetry is balanced enough; RULES.md recorded Dawood's earlier version at 62% to the first player, and this one isn't. If a rule has to go for simplicity, symmetric grooves cost the least: the asymmetry is free to keep but has no measured payoff either. Keep it as the more interesting rule, and that's Burooj's taste, not data.

**Send pace: keep 150.** 100, 150 and 250 differ by under two turns and in no fairness number. Road kills go 12.0, 11.2, 10.4 as the pace rises, in the direction you'd expect but inside noise. The one thing worth knowing: the bot loses about **11 walkers a game on the road under the long war, and 11.4 under Classic**. It sends 15.9 times a game here and 14.5 there. That over-sending is the core bot's habit (round 3 and 4 said so too), and the long roads did not make it worse.

## Armies

Same seeds 1–120, `--sizes long4 / long / long6` (N bases a side):

| bases a side | army (soldiers a side, mean) | turns mean (p90) | Δ turns vs 5 | 1st wins ± se | stalled | sends (road kills) |
|---|---|---|---|---|---|---|
| 4 | 37.8 | 31.2 (43) | −7.7 ± 1.5 | 62% ± 4.4 | 0% | 11.3 (8.7) |
| **5 shipped** | 47.3 | 38.9 (55) | | 51% | 0% | 15.9 (11.2) |
| 6 | 56.8 | 47.9 (61) | +9.0 ± 1.8 | 53% ± 4.6 | 0% | 19.4 (12.7) |
| Core Classic | 50.0 | 35.4 (44) | | 50% ± 2.5 | 0% | 14.5 (11.4) |

**Verdict: about 8 to 9 turns a base, linear, no stalls, no lopsidedness at 5 or 6.** The call is Burooj's. Two points to put in front of him:
- **The shipped 5 bases is not "bigger than Classic".** RULES.md says the long war has bigger armies than a Classic battle. At 5 bases of mixed shapes it fields 47.3 soldiers a side, fewer than Classic's 50 (camps hold 12, cushions 8, prisms 6). 6 bases is the first size that is both bigger (56.8) and longer than Classic (47.9 turns against 35.4, p90 61 against 44), at about a third more time.
- **4 bases is the one that leans.** First player 62% ± 4.4, which is 2.7 standard errors from even. At 120 games that's suggestive, not established, but it matches the shorter game (31 turns, shorter than Classic's 35). Don't go below 5 without running a 400.

## Shape dominance

`--kits A:B --swap`: every seed is played twice, once with each kit in the first seat, so the first-player edge cancels. 120 seeds, so **240 games a pairing**; rates are a kit's wins over those games. `c` = five camps, `h` = five cushions, `p` = five prisms, `mix` = the bot's own free pick.

| pairing | kit | wins | win rate ± se | turns mean (p90) | what happens |
|---|---|---|---|---|---|
| camp v cushion | camp | 114 | 47.5% ± 3.2 | 44.4 (61) | fair; the longest pairing, with 14.3 banks a game |
| | cushion | 126 | 52.5% ± 3.2 | | |
| camp v prism | camp | 153 | **63.7% ± 3.1** | 36.2 (48) | |
| | prism | 87 | 36.3% ± 3.1 | | |
| cushion v prism | cushion | 174 | **72.5% ± 2.9** | 38.0 (55) | |
| | prism | 66 | 27.5% ± 2.9 | | |
| camp v mix | camp | 125 | 52.1% ± 3.2 | 39.2 (54) | fair |
| | mix | 115 | 47.9% ± 3.2 | | |
| cushion v mix | cushion | 131 | 54.6% ± 3.2 | 45.1 (65) | cushion ahead, 1.4 se |
| | mix | 109 | 45.4% ± 3.2 | | |
| prism v mix | prism | 79 | **32.9% ± 3.0** | 36.5 (50) | |
| | mix | 161 | 67.1% ± 3.0 | | |

No game stalled in any pairing.

**Verdict: no mix dominates, but all-prism is a trap, and the numbers say why it might be fixable.**
- **The free pick is safe where it matters.** The bot's mix, with a camp bias, beats all-prism at 67%, but gives 47.9% to all-camp and 45.4% to all-cushion. Mixing wins only against the weak shape, so "a mix that wins much more than 50%" is not found. Camp against cushion is level (47.5 / 52.5).
- **Prism loses to every kit it meets:** 36% to camp, 27.5% to cushion, 33% to mix. A side that picks prisms across the board starts well behind.
- **The prism's army is half a camp's.** 5 camps field 60 soldiers, 5 cushions 40, 5 prisms 30. That is the clearest number in the pairings. Cushions beat camps (52.5%) with two thirds of the men, so a cushion soldier is worth more than a camp soldier. Prisms lose with half to three quarters of the opposing army. I can't tell from this how much is the 6 soldiers and how much is the shape's power, and I can't tell how much is a bot with no prism play.
- **The number I'd try first: prism `soldiers` 6 → 8**, the cushion's count (army 40, level with cushions). It is untested. I ran out of guarded time before step 9 (below), and a 6 → 8 trial is two pairings (`ppppp:hhhhh`, `ppppp:ccccc`) of about 14 minutes each. If it lands near 50% against cushions, soldier count was the whole gap.
- **What's special about the pairings:** well-bent flicks only show up where a camp is on the page (0% in cushion v prism), banks only with cushions, splits only with prisms. That confirms each mechanic belongs to its shape.

## What the bot does wrong

- **It has no prism play.** The bot never places a prism in front of a base, never shoots through one on purpose, and never counts a split. That means the prism's numbers above are a floor, not the shape's real strength. If Burooj wants a verdict on the prism as a rule, the bot needs a prism pass first (a separate, Long-only change, with the core-bot identity check). I didn't make it.
- **It over-sends**, as in rounds 3 and 4: 15.9 sends and 11.2 walkers lost a game under the long rules, against 14.5 and 11.4 under Classic. The long roads didn't make it worse, and at pace 250 or 100 it barely moves. It's the old habit, not a long-war regression.
- **Its free pick (45% camp, 35% cushion, 20% prism) is below all-cushion** by 54.6 against 45.4, at 1.4 se. Weak evidence that the bot's shape lottery isn't smart; no more than that.

## What Burooj decides

1. **Army size.** 5 bases (47 soldiers, 39 turns, fewer men than Classic) or 6 (57 soldiers, 48 turns, bigger than Classic). Don't go to 4.
2. **The prism.** Leave it weak, or raise its soldiers to 8 (to test), or give the bot prism play first so there's a fair test.
3. **Free pick.** All-prism is a bad pick that loses 27 to 36% of games. Fine if choosing is part of the game; a trap if not. Nothing else in the pairings is lopsided.
4. **Ink jolt.** Keep 0.03, which costs about 5 turns over no ink at all. Don't go to 0.06.
5. **Cushion banks** cost about 3 turns a war. Keep unless he wants shorter games.

## How it was run

- Sim: `scripts/rules-lab.ts` through `t3-test-run`, one guarded job at a time, 3 threads, `--max-turns 250` (no game hit the cap except 1 stalled in each of `inkOff` and `prismPaid`). Seeds are shared: variants use 1–120, kit pairings 1–60 and 61–120 (each seed played twice with `--swap`), baselines 1–400 in chunks of 120 and 140.
- Command shape: `node --import ./scripts/ts-resolve.mjs scripts/rules-lab.ts --rules <core|long> --sizes <size> --from A --to B --threads 3 --max-turns 250 --label <label> --raw raw/<label>-A.json [--set long.key=value,...] [--kits A:B --swap]`. All variants and their exact `--set` strings are in [the log](data/round-5/log.md).
- Time: 120 long games take 5 to 9 minutes on 3 threads (about 8 s of CPU a game). A 4-base game takes about two thirds of that. About 4 hours of guarded time in all.
- Merging: `node --import ./scripts/ts-resolve.mjs scripts/lab-table.ts docs/rules-lab/data/round-5/raw/*.json` gives [tables.md](data/round-5/tables.md); `JSON=1` gives [summary.json](data/round-5/summary.json). The raw chunks (3.7 MB) are kept; they're the evidence.
- **Not run:** step 9, the finals at 400 games for a recommended combination. I recommend no change to the shipped numbers for any dial, so there is nothing to confirm except the one untested idea (prism soldiers 8).
- **Bookkeeping:** the first worker ran the baselines and most of the screens, and the chunk timings in the log are from file times. I ran the last three kit chunks and the merge.

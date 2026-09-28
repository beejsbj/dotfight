# Rules lab, round 3: the core rules as the game plays them

_2026-09-27. Branch `rules/core-port`. Unlike rounds 1 and 2, this round runs on the game's own engine (`src/game.ts`), not a lab copy: what was simulated is what ships. Raw tables: [data/round-3/](data/round-3/)._

`npm run lab -- --games 2000 --sizes quick,classic`. Dawood-bot (steady, a human-like hand) against itself, seeds 1–2000 for both sizes. Standard error on the percentages is about ±1.1 points.

## Finals (the numbers in `src/rules.ts`, unchanged)

| size | turns (p10–p90) | flicks | 1st-player wins | kills/flick | lunge share | snipes taking 2+ | sends a game (walkers crossed out) | longest turn in flicks: mean, p90, max | lunge chains: mean; length 1/2/3/4+; longest | lungers shot on landing / off the page (a game) | last stand begins (both sides) | comebacks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Quick (3 × 8) | 15.9 (11–22) | 41.1 | 52% | 1.01 | 76% | 43% | 6.2 (4.5) | 6.4, 8, 13 | 2.37; 36/27/18/20%; 11 | 1.9 / 1.1 | 100% (81%) | 33% |
| Classic (5 × 10) | 28.4 (21–37) | 72.8 | 52% | 1.23 | 69% | 48% | 14.3 (9.0) | 7.5, 10, 15 | 2.48; 35/25/18/22%; 15 | 3.9 / 2.2 | 100% (72%) | 31% |

No game stalled. "Turns" are pen hand-overs; "comebacks" is how often the side ahead at half-time loses.

Numbers played: flicks 300–1800 long; snipe power loss 10% of what's left at a wall and 5% at a soldier crossed out; a snipe taking 2 flicks again (no rising bar); lunge shake 0.08 rad at a wall and 0.04 at a soldier; +0.05 rad a chain link; sends of up to 5; positioning 20 outside the wall; last stand at 4, two flicks, hand error × 0.6.

## What it says

- **Fair.** 52% to the first player at both sizes.
- **Short.** Quick is about 16 turns (41 flicks), Classic 28 turns (73 flicks), against round 2's 53 turns for Lunge & snipe. The main cause is below: lunges through bases are now legal.
- **Lunges dominate: 69–76% of flicks.** Round 2's lunger died at the first manned wall; now he may cut through a base and only dies if he *lands* among its men. The bot lunges through camps and out the far side, and a kill earns another lunge, so a fifth of chains run to four or more. This is the clearest thing to feel at a table.
- **Streaks without the rising bar**: the worst turn averages 6–7.5 flicks (round 2, with the bar: 4.7), up to 13–15 in the worst game of 2000. The long turns are lunge chains, not snipes: power loss does keep snipe streaks short.
- **Sends get used and get shot**: 6 a game in Quick, 14 in Classic, and about two in three walkers are crossed out on the road. The bot sends more than it should; exposure is real.
- **Last stand comes every game**, for both sides in three games out of four, and the side ahead at half-time still loses a third of the time.

## Levers tried (300 games each, same seeds)

| variant | Quick: turns, lunge share, longest turn mean/max, 4+ chains | Classic: the same |
|---|---|---|
| as shipped | 15.9, 75%, 6.5/13, 19% | 28.2, 69%, 7.6/14, 22% |
| wall shake 0.15, soldier 0.06 | 17.8, 71%, 6.3/11, 17% | 31.5, 64%, 7.3/13, 20% |
| wall shake 0.25, soldier 0.10 | 19.4, 66%, 6.3/12, 16% | 35.1, 58%, 7.3/14, 18% |
| chain tremor 0.10 a link | 19.1, 70%, 5.8/10, 12% | 33.4, 62%, 6.7/13, 13% |

Stronger wall shake makes cutting through a base dearer and games a little longer, but lunges stay the majority. A bigger chain tremor is the lever that cuts long chains. **No number was changed**: the game is fair and short, and whether lunging through camps is too cheap is a question for the table, not the bot. If it is, try the chain tremor first (0.10), then wall shake.

## How the bot plays (and where it's weak)

Ported from round 2 and taught the core rules. It previews every candidate with the real engine (walls, power loss, the lunger's jolts, where he lands), re-tries the best with a shaky hand, turns down an earned lunge that looks bad, prices a send by where the column will stand for the enemy's turn, and arranges its men without ever emptying a base (at least half stay inside). It still looks one flick ahead, never plans a chain as a chain, and over-sends.

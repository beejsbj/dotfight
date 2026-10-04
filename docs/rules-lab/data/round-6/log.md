# Round 6 run log

Every guarded job, in order. Raw chunks are in `raw/`. Times are wall seconds for the job (3 threads).

- Timing (step 2): 6 games, seeds 1–6, `--sizes long` (6 bases, mix kits), `--max-turns 250`, 3 threads: **57 s wall** (157 s CPU), so about 9.5 s wall and 26 s CPU a game. Round 5's five-base games cost about 3 to 4 s wall. At that rate a 20-minute guard holds about 120 games; chunks of 60 games (about 10 minutes) are used.

- 00:58Z `long baseline` seeds 1–60, args `--sizes long`: rc=0, 454s wall. 0 deferrals. Row: | long long baseline | 60 | 42.2 (54) | 55% | 0% | 63% / 37% | 1.02 | 7.0, 12 | 13% | 61% | 3.85 / 6.00 | 51% | 89% (t26.3; 63%) | t12.0 | 57% of 53 |
- Chunk 1 baseline (60 games): **454 s wall**, 7.6 s a game. Plan from this: chunks of 60 games (about 8 minutes); steps 1 to 3 at the runbook's sizes come to about 2,200 games, about 4.3 hours; steps 4 to 6 are left for after step 3 only if time remains (see the report). Jobs below run from a one-at-a-time queue.
- 01:06Z `long baseline` seeds 61–120, args `--sizes long`: rc=0, 456s wall. 0 deferrals. Row: | long long baseline | 60 | 40.0 (52) | 47% | 0% | 64% / 36% | 1.04 | 6.9, 11 | 15% | 60% | 4.02 / 6.01 | 51% | 90% (t25.7; 64%) | t10.3 | 60% of 57 |
- 01:11Z `ssssss:mix` seeds 1–30, args `--sizes long --kits ssssss:mix --swap`: rc=0, 304s wall. 0 deferrals. Row: | long ssssss:mix | 60 | 33.7 (43) | 52% | 0% | 69% / 31% | 1.04 | 6.7, 10 | 13% | 60% | 4.12 / 6.59 | 48% | 88% (t21.2; 62%) | t9.4 | 68% of 59 |
- 01:16Z `ssssss:mix` seeds 31–60, args `--sizes long --kits ssssss:mix --swap`: rc=0, 284s wall. 0 deferrals. Row: | long ssssss:mix | 60 | 32.1 (44) | 58% | 0% | 70% / 30% | 1.03 | 6.5, 12 | 14% | 61% | 4.07 / 6.89 | 47% | 87% (t20.1; 62%) | t8.5 | 78% of 59 |
- 01:22Z `tttttt:mix` seeds 1–30, args `--sizes long --kits tttttt:mix --swap`: rc=0, 377s wall. 0 deferrals. Row: | long tttttt:mix | 60 | 35.8 (48) | 58% | 0% | 69% / 31% | 1.07 | 7.1, 11 | 15% | 60% | 4.15 / 5.99 | 50% | 91% (t22.2; 63%) | t9.3 | 60% of 57 |
- 01:29Z `tttttt:mix` seeds 31–60, args `--sizes long --kits tttttt:mix --swap`: rc=0, 397s wall. 0 deferrals. Row: | long tttttt:mix | 60 | 38.8 (50) | 50% | 0% | 68% / 32% | 1.01 | 7.0, 12 | 14% | 61% | 3.92 / 5.86 | 51% | 88% (t24.8; 63%) | t10.2 | 38% of 53 |

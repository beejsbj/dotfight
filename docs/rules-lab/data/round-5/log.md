# Round 5 run log

Every job through `t3-test-run`, one at a time, 3 threads, `--max-turns 250`. Raw chunks in `raw/`.
Command shape: `node --import ./scripts/ts-resolve.mjs scripts/rules-lab.ts --rules <core|long> --sizes <size> --from A --to B --threads 3 --max-turns 250 --label <label> --raw raw/<label>-A.json [--set ...] [--kits ... --swap]`

| label | seeds | wall | result |
|---|---|---|---|
| (timing check, no raw) long, 6 games | 1-6 | 32 s | about 8 s of CPU a long game; 3 threads, so ~2.7 s a game wall: 120 games is ~5-6 min, 400 is ~18 min (split in chunks) |
| core (Classic, CORE as it stands) | 1-400 | 244 s | 35.4 turns (p90 44), 50% first, 0% stalled; round 4's B Classic was 35.9 (47), 53% |
| long as shipped | 1-120 | 6.5 min* | chunk 1 of 3 |
| long as shipped | 121-260 | 9.4 min* | chunk 2 of 3 (140 games); 400 together: 40.7 turns (p90 55), 51% first, 0% stalled |
| long as shipped | 261-400 | 8.5 min* | chunk 3 of 3 (140 games) |
| well0 (`long.well.pull=0`) | 1-120 | 8.8 min* | 38.9 turns, 43% first, 0 bent flicks |
| well0.002 | 1-120 | 6.9 min* | 39.5 turns, 58% first, 19% of flicks bent |
| well0.008 | 1-120 | 6.5 min* | 39.8 turns, 53% first, 52% of flicks bent |
| reach2.5 (`long.well.reach`) | 1-120 | 6.2 min* | 39.5 turns, 51% first, 24% bent |
| reach5 | 1-120 | 6.0 min* | 38.5 turns, 46% first, 49% bent |
| cushOff (`long.cushion.maxBanks=0`) | 1-120 | 5.9 min* | 36.0 turns (p90 45), 55% first, 0 banks |
| glance0.4 (`long.cushion.glance`) | 1-120 | 7.2 min* | 41.1 turns, 56% first, 12.5 banks |
| glance0.8 | 1-120 | 6.1 min* | 38.8 turns, 56% first, 5.7 banks |
| prism0.1 (`long.prism.spread`) | 1-120 | 6.1 min* | 41.0 turns, 44% first |
| prism0.35 | 1-120 | 5.7 min* | 38.9 turns, 52% first |
| prismPaid (`long.prism.ownFree=false`) | 1-120 | 6.7 min* | 40.1 turns, 56% first, 1 stalled |
| inkOff (`jolt=0,groovePull=0,grooveOwn=1,grooveEnemy=1`) | 1-120 | 7.4 min* | 34.0 turns (p90 42), 51% first, 1 stalled |
| inkJolts (`groovePull=0,grooveOwn=1,grooveEnemy=1`) | 1-120 | 8.1 min* | 39.6 turns, 58% first |
| inkGrooves (`jolt=0`) | 1-120 | 6.8 min* | 35.3 turns, 50% first |
| inkSym (`grooveOwn=1,grooveEnemy=1`) | 1-120 | 6.3 min* | 41.1 turns, 48% first |
| jolt0.06 (`long.ink.jolt=0.06`) | 1-120 | 7.0 min* | 49.1 turns (p90 66), 57% first |
| pace100 (`long.sendPace`) | 1-120 | 5.9 min* | 39.4 turns, 57% first |
| pace250 | 1-120 | 6.3 min* | 40.4 turns, 57% first |
| armies4 (`--sizes long4`) | 1-120 | 4.1 min* | 31.2 turns (p90 43), 62% first |
| armies6 (`--sizes long6`) | 1-120 | 8.5 min* | 47.9 turns (p90 61), 53% first |
| kitCvH (`--kits ccccc:hhhhh --swap`) | 1-60 | 6.2 min* | 120 games |
| kitCvH | 61-120 | 6.8 min* | 240 games together: camp 47.5% |
| kitCvP (`ccccc:ppppp`) | 1-60 | 6.5 min* | 120 games |
| kitCvP | 61-120 | 7.2 min* | 240 together: camp 63.7% |
| kitHvP (`hhhhh:ppppp`) | 1-60 | 4.9 min* | 120 games |
| kitHvP | 61-120 | 4.7 min* | 240 together: cushion 72.5% |
| kitCvMix (`ccccc:mix`) | 1-60 | 6.7 min* | 120 games |
| kitCvMix | 61-120 | 7.8 min* | 240 together: camp 52.1% |
| kitHvMix (`hhhhh:mix`) | 1-60 | 6.3 min* | 120 games |
| kitHvMix | 61-120 | 430 s (7.2 min) | 240 together: cushion 54.6% |
| kitPvMix (`ppppp:mix`) | 1-60 | 347 s (5.8 min) | 120 games |
| kitPvMix | 61-120 | 496 s (8.3 min) | 240 together: prism 32.9% |

\* Chunks finished by the first worker, which didn't log their wall time. These figures are the gap between one chunk's raw file and the previous one's (`mtime`), so they include any wait between jobs and are upper bounds. The three bottom rows from `kitHvMix` 61 on were timed by `time`.

Not run: step 9, the finals. The guarded time had reached about 4 hours (03:05 to 06:43 for the first worker's chunks, 21 minutes for the last three, a few minutes of typecheck, tests and merging), which is the runbook's point to stop after step 8.

Merged tables: `tables.md` (from `scripts/lab-table.ts raw/*.json`); `summary.json` is the same as JSON (`JSON=1`).

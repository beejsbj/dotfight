# Round 6b final verification

_2026-10-04. Sequential guarded jobs on `long-war/lab6`; one Vitest worker. The passing suite includes the Core step-by-step replay pin in `src/record.test.ts`. No shipped rule numbers or game implementation changed._

## typecheck

Command: `/home/admin/.local/bin/t3-test-run npm run typecheck`. Exit status: **0**. Recorded wall time: **2 s**.

```text
Guarded test: three CPUs, 2 GiB RAM, no swap, 20-minute timeout; temp=/mnt/server-ssd/t3-test-tmp/run.fZXKz8fo

> dotfight@0.1.0 typecheck
> tsc --noEmit
```

## test

Command: `/home/admin/.local/bin/t3-test-run npm test -- --maxWorkers=1`. Exit status: **0**. Recorded wall time: **81 s**.

```text
Guarded test: three CPUs, 2 GiB RAM, no swap, 20-minute timeout; temp=/mnt/server-ssd/t3-test-tmp/run.WDgqbWrk

> dotfight@0.1.0 test
> vitest run --maxWorkers=1


 RUN  v5.0.1 /mnt/server-ssd/BJsWorkspace/Projects/Worktrees/dotfight/long-war-lab6


 Test Files  34 passed (34)
      Tests  487 passed (487)
   Start at  05:31:17
   Duration  79.16s (tests 95%, transform 2%, import 2%)

    Isolate  34 workers spawned · ~182ms startup each (spawn + environment, per file)
             at least ~6.02s faster with isolate: false — reuses workers across files instead of one per file
```

## build

Command: `/home/admin/.local/bin/t3-test-run npm run build`. Exit status: **0**. Recorded wall time: **3 s**.

```text
Guarded test: three CPUs, 2 GiB RAM, no swap, 20-minute timeout; temp=/mnt/server-ssd/t3-test-tmp/run.CFqBh9Rs

> dotfight@0.1.0 build
> tsc --noEmit && vite build

vite v8.3.1 building client environment for production...
transforming...
✓ 64 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                                  4.16 kB │ gzip:  1.41 kB
dist/assets/patrick-hand-vietnamese-400-normal-CZjY324Y.woff     6.49 kB
dist/assets/patrick-hand-vietnamese-400-normal-65jA92mZ.woff2   11.57 kB
dist/assets/patrick-hand-latin-ext-400-normal-C2ywpnn3.woff     13.41 kB
dist/rules/advanced.html                                        17.36 kB │ gzip:  5.52 kB
dist/assets/patrick-hand-latin-400-normal-Df9_VoRQ.woff         17.65 kB
dist/assets/caveat-latin-ext-400-normal-D7hBUiug.woff2          18.60 kB
dist/assets/caveat-latin-ext-700-normal-DFbRgDry.woff2          19.57 kB
dist/rules.html                                                 20.03 kB │ gzip:  6.25 kB
dist/assets/patrick-hand-latin-ext-400-normal-Dno5CMlI.woff2    20.11 kB
dist/assets/patrick-hand-latin-400-normal-B7HHA2Vw.woff2        23.94 kB
dist/assets/caveat-latin-ext-400-normal-DtiRFvw0.woff           24.09 kB
dist/assets/caveat-cyrillic-ext-400-normal-3iEGd-c5.woff2       24.22 kB
dist/assets/caveat-latin-ext-700-normal-DjJQd59I.woff           24.99 kB
dist/assets/special-elite-latin-ext-400-normal-ChcxYnmu.woff2   25.19 kB
dist/assets/caveat-cyrillic-ext-700-normal-CrK2-ngJ.woff2       25.34 kB
dist/assets/botworker-Bxm-ATvg.js                               28.92 kB
dist/assets/caveat-cyrillic-ext-400-normal-Cg0RnRQ5.woff        29.72 kB
dist/assets/special-elite-latin-ext-400-normal-CaJZjSVf.woff    29.99 kB
dist/assets/caveat-cyrillic-ext-700-normal-DjFGiEhD.woff        30.53 kB
dist/assets/caveat-cyrillic-400-normal-9cDH9rLW.woff2           45.11 kB
dist/assets/caveat-cyrillic-700-normal-BIyejhEL.woff2           45.39 kB
dist/assets/caveat-latin-400-normal-D6LQsQ_v.woff2              48.83 kB
dist/assets/caveat-latin-700-normal-D8_1Nw6V.woff2              51.02 kB
dist/assets/caveat-cyrillic-400-normal-CebvvJET.woff            53.09 kB
dist/assets/caveat-cyrillic-700-normal-Bhcx9qBB.woff            53.12 kB
dist/assets/special-elite-latin-400-normal-YjDd9tmf.woff2       53.29 kB
dist/assets/caveat-latin-400-normal-BzhAQZkN.woff               60.10 kB
dist/assets/caveat-latin-700-normal-cPyBTTZN.woff               62.18 kB
dist/assets/special-elite-latin-400-normal-BtSRmyJ6.woff        63.41 kB
dist/assets/main-PoIMPOFZ.css                                   21.34 kB │ gzip:  5.77 kB
dist/assets/main-BPOciICz.css                                   28.19 kB │ gzip:  6.87 kB
dist/assets/main-B5JPimAZ.js                                    41.21 kB │ gzip: 17.16 kB
dist/assets/textures-CYl0cGof.js                                64.84 kB │ gzip: 24.79 kB
dist/assets/main-CWIfUb8c.js                                   228.06 kB │ gzip: 88.61 kB

✓ built in 782ms
```

## Data verification and time

- Guarded `scripts/lab-table.ts`: **21 labels, 4,360 games**, configurations consistent and no duplicate seed/seat identities. Both artifacts regenerated from all 73 raw chunks.
- Guarded `paired-analysis.py`: all expected labels present, all 12 treatment comparisons have 120 shared seeds; kit win differences exclude the shipped prism stall's whole seed (119 complete decided pairs), with the half-win sensitivity retained.
- Independent inventory read: shipped baseline seeds 1–400; all other labels seeds 1–120; every matchup contains 120 swapped games and 120 ordinary games.
- Every requested continuation screen completed. No guard deferrals or failed simulation/check jobs occurred in round 6b.
- Round 6b guarded simulation **15,545 s (4h 19m 05s)**, other guarded jobs **89 s**, total **15,634 s (4h 20m 34s)**. Prior total **14,930 s (4h 08m 50s)**; combined **30,564 s (8h 29m 24s)**. Times are sums of recorded integer wall seconds.

## Final document audit

A separate Sol worker reviewed the report, PR body, stored summaries, paired denominators, raw inventory, run log and check captures without launching guarded jobs. It found one bookkeeping defect: the raw-chunk count was understated by one. Corrected everywhere to **73 chunks (35 prior + 38 new)**. Its remaining numerical, coverage, uncertainty and placeholder checks passed. Final process inventory found no guarded helper or simulation processes remaining.

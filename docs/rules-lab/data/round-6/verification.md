# Round 6 final verification

_2026-10-04. Sequential guarded jobs on `long-war/lab6`; one Vitest worker. The passing suite includes `src/record.test.ts` and its Core step-by-step replay pin. No shipped rule numbers changed._

## typecheck

Command: `/home/admin/.local/bin/t3-test-run npm run typecheck`. Exit status: **0**.

```text
> dotfight@0.1.0 typecheck
> tsc --noEmit
```

## test

Command: `/home/admin/.local/bin/t3-test-run npm test -- --maxWorkers=1`. Exit status: **0**.

```text
> dotfight@0.1.0 test
> vitest run --maxWorkers=1


 RUN  v5.0.1 /mnt/server-ssd/BJsWorkspace/Projects/Worktrees/dotfight/long-war-lab6


 Test Files  34 passed (34)
      Tests  487 passed (487)
   Start at  01:01:28
   Duration  96.46s (tests 96%, transform 2%, import 2%)

    Isolate  34 workers spawned · ~228ms startup each (spawn + environment, per file)
             at least ~7.54s faster with isolate: false — reuses workers across files instead of one per file
```

## build

Command: `/home/admin/.local/bin/t3-test-run npm run build`. Exit status: **0**.

```text
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

✓ built in 896ms
```

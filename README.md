# Pen Flick Tactics

A digital version of Dawood's pen-and-paper flick tactics game. The feel of imprecise pen flicks and the hand-drawn notebook aesthetic are core constraints. [RULES.md](RULES.md) has the canon (what Dawood and Burooj remember), every guess made to fill it in, and the evolved rule sets, with the simulation numbers behind them and the questions for Dawood; the raw lab data is in [docs/rules-lab/data/](docs/rules-lab/data/).

The Linear board is canonical for status, decisions, and work history.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run phone    # serves on bjslab's Tailscale address, for testing on a phone over the tailnet
npm test         # game-logic tests
npm run build    # static bundle in dist/
npm run share-art -- http://localhost:5173/   # regenerate og.jpg + icons from a scripted game (needs the dev server and Chrome)
npm run lab -- --games 2000                    # rules lab: bot-vs-bot games for every named rule set, no browser
npm run lab -- --games 400 --sets classic,classic-once --out docs/rules-lab/data/x.json
npm run playtest -- http://localhost:5173/     # every rule set by touch at phone sizes (needs the dev server and Chrome)
```

Pick the rule set on the title card (**rules: …**, then **read** for its card).

On your turn, touch one of your soldiers or anywhere in one of your bases (the camera closes in), pull back from anywhere, and let go. Pick **move** or **shoot** at the bottom. Pinch to zoom; tap **page** to see the whole sheet. Pass & play shows a hand-off sheet between turns; Dawood-bot plays red. A finished page can be saved as a PNG.

## Shape

- `src/rules.ts`: the `RuleSet` type (every rule, documented) and the flick feel
- `src/rulesets.ts`: the named rule sets on the new-game screen; `src/cards.ts` their rules cards
- `src/game.ts`: pure, seeded game state driven by `s.rules` (setup, flicks, transfers, turn flow, win) and the action log for replay. No DOM.
- `src/trace.ts`: where a flicked line goes (walls, mirrors, prisms, dried ink, page edges); `src/bases.ts` base shapes; `src/geom.ts` geometry
- `src/lab/`: the rules lab (`sim.ts` plays and measures games; `variants.ts` every rule set tried)
- `src/flick.ts`: turns a pull-back gesture into a flick, with wobble and release error
- `src/ink.ts`: ballpoint and pencil drawing primitives (seeded, so the page redraws identically)
- `src/view.ts`: camera and page rendering
- `src/bot.ts`: Dawood-bot (previews candidate flicks with the engine, prices the shaky hand, weighs position)
- `src/main.ts`: input, turn flow, HUD and sheets
- `src/sound.ts`: synthesised pen scratches and haptics
- `src/timeline.ts`: when each mark is being drawn on (pure, tested)
- `src/hand.ts`: which soldier a tap means, and the order dots get jotted (pure, tested)

In dev builds, `window.pft` exposes the game state, camera, timeline and renderer for scripted playtests.

## Source prototype

An earlier [AI Studio build](https://aistudio.google.com/apps/d2c29067-ed8f-4b5e-a98a-fb47ed65190a) exists but sits behind Google sign-in and couldn't be imported. This repo started clean from Burooj's 2026-06-07 description of the game. If that build is exported later, compare its base shapes and soldier classes against [RULES.md](RULES.md) rather than merging it in wholesale.

## Relevant Linear issues

- [BJS-67 — Capture Pen Flick Tactics game seed](https://linear.app/bjs-projects/issue/BJS-67/capture-pen-flick-tactics-game-seed)
- [BJS-127 — Import the AI Studio prototype as repo baseline](https://linear.app/bjs-projects/issue/BJS-127/import-the-pen-flick-tactics-ai-studio-prototype-as-the-repo-baseline)
- [BJS-128 — Reconstruct the canonical ruleset with Dawood](https://linear.app/bjs-projects/issue/BJS-128/reconstruct-the-canonical-ruleset-with-daud)
- [BJS-129 — Scope true async / online multiplayer](https://linear.app/bjs-projects/issue/BJS-129/scope-and-design-true-async-online-multiplayer)
- [BJS-131 — Mobile/touch flick feel, zoom, and limited perspective](https://linear.app/bjs-projects/issue/BJS-131/mobiletouch-flick-feel-with-zoom-and-limited-perspective)
- [BJS-134 — Taste and polish the hand-drawn aesthetic](https://linear.app/bjs-projects/issue/BJS-134/taste-and-polish-pass-on-the-hand-drawn-aesthetic)

# Pen Flick Tactics

A digital version of Daud's pen-and-paper flick tactics game. The feel of imprecise pen flicks and the hand-drawn notebook aesthetic are core constraints. The canonical rules still need Daud's review; see [RULES.md](RULES.md) for what the prototype assumes and what to ask him.

The Linear board is canonical for status, decisions, and work history.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run phone    # serves on bjslab's Tailscale address, for testing on a phone over the tailnet
npm test         # game-logic tests
npm run build    # static bundle in dist/
npm run share-art -- http://localhost:5173/   # regenerate og.jpg + icons from a scripted game (needs the dev server and Chrome)
```

On your turn, touch one of your soldiers or anywhere in one of your bases (the camera closes in), pull back from anywhere, and let go. Pick **move** or **shoot** at the bottom. Pinch to zoom; tap **page** to see the whole sheet. Pass & play shows a hand-off sheet between turns; Daud-bot plays red. A finished page can be saved as a PNG.

## Shape

- `src/rules.ts`: every tunable rule and the flick feel, in one place
- `src/game.ts`: pure, seeded game state (setup, flick resolution, hits, win). No DOM.
- `src/flick.ts`: turns a pull-back gesture into a flick, with wobble and release error
- `src/ink.ts`: ballpoint and pencil drawing primitives (seeded, so the page redraws identically)
- `src/view.ts`: camera and page rendering
- `src/bot.ts`: Daud-bot
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
- [BJS-128 — Reconstruct the canonical ruleset with Daud](https://linear.app/bjs-projects/issue/BJS-128/reconstruct-the-canonical-ruleset-with-daud)
- [BJS-129 — Scope true async / online multiplayer](https://linear.app/bjs-projects/issue/BJS-129/scope-and-design-true-async-online-multiplayer)
- [BJS-131 — Mobile/touch flick feel, zoom, and limited perspective](https://linear.app/bjs-projects/issue/BJS-131/mobiletouch-flick-feel-with-zoom-and-limited-perspective)
- [BJS-134 — Taste and polish the hand-drawn aesthetic](https://linear.app/bjs-projects/issue/BJS-134/taste-and-polish-pass-on-the-hand-drawn-aesthetic)

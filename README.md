# Pen Flick Tactics

A digital version of Dawood's pen-and-paper flick tactics game, fought on the back page of a maths copy under a desk lamp. The imprecise pen flick and the page as a permanent record are the core constraints. The rules are in [RULES.md](RULES.md), and drawn out by hand in two books: [/rules](https://pen-flick-tactics.vercel.app/rules), the core rules ([rules.html](rules.html)), and [/rules/advanced](https://pen-flick-tactics.vercel.app/rules/advanced), the long war ([rules/advanced.html](rules/advanced.html)); the game itself still plays the first, simpler rules. The name is a working title, kept in [src/name.ts](src/name.ts). The redesign's concept and rejected directions are in [docs/redesign/concept.md](docs/redesign/concept.md); rules ideas for Dawood are in [docs/redesign/ideas.md](docs/redesign/ideas.md).

The Linear board is canonical for status, decisions, and work history.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run phone    # serves on bjslab's Tailscale address, for testing on a phone over the tailnet
npm test         # engine, projection, replay and timeline tests
npm run build    # static bundle in dist/
npm run share-art -- http://localhost:5173/   # regenerate og.jpg + icons (needs the dev server and Chrome)
npm run rules-art -- http://localhost:5173/ --og   # screenshots of both rulebooks into docs/shots/rules-page/, and their og cards
node scripts/playtest.mjs <scenario> http://localhost:5173/ /tmp/out   # scripted phone playtests
```

Open the exercise book and pick an opponent. Take turns drawing camps. On your turn, touch one of your soldiers (or anywhere in one of your camps): you lean in low over him and the pen stands on his dot; distant camps fade into haze. Pull back from anywhere on the screen and let go, and the view pulls straight back up to bird's-eye to watch the ink land. **Move** or **shoot** is chosen on the two cards at the bottom. Tap empty paper or **page** to stand back up; pinch to zoom. In pass and play the sheet turns round on the desk to face whoever's go it is. A finished page is signed, filed in the drawer, and can be replayed or saved as an image.

## Shape

- `src/rules.ts`: every tunable rule and the flick feel, in one place
- `src/game.ts`: pure, seeded game state (setup, flick resolution, hits, win). No DOM.
- `src/flick.ts`: turns a pull-back gesture into a flick, with wobble and release error
- `src/bot.ts`: Dawood-bot
- `src/record.ts`: a page as seed + camps + flicks; replay, the drawer, reading old saves (pure, tested)
- `src/projection.ts`: world ↔ screen through the tilted-desk camera; the CSS perspective and touch input share it (pure, tested)
- `src/inkclock.ts`: ink time, which snags for a beat on every soldier it crosses (pure, tested)
- `src/camera.ts`: the eye at the desk: bird's-eye by default, leaning in to aim, turning the page
- `src/light.ts`: the lamp, the fog while aiming, and the dawn (painted at quarter resolution and stretched)
- `src/page.ts`: the sheet as an append-only page-space canvas: every mark and every dot a soldier ever stood on is ink, drawn once
- `src/scene.ts`: one frame: the desk and page are placed by CSS `matrix3d` (never repainted for the camera); only ink still being drawn, pencil and the pen are drawn per frame
- `src/pen.ts`: the clear hexagonal ballpoint, in 3D projection, and its lamp shadow
- `src/ink.ts`: ballpoint and pencil drawing primitives (seeded, so the page redraws identically)
- `src/textures.ts`: walnut, the desk around the sheet, the sheet's shadow
- `src/timeline.ts`, `src/hand.ts`: draw-on timing, which soldier a tap means (pure, tested)
- `src/sound.ts`: synthesised pen, paper, lamp switch, clatter, dawn birds; haptics
- `src/main.ts`: turn flow, input, HUD, the cover, cards, drawer and replay
- `rules.html`, `rules/advanced.html`, `src/rulebook/`: the two rulebooks; `figures.ts` draws each mechanic with the game's ink

In dev builds, `window.pft` exposes the game state, camera, timelines, a speed knob (`pft.speed`), a frame-time probe (`pft.frames()`), `renderNow`, `pageCanvas`, and helpers that file, resume and replay seeded bot-v-bot wars. `scripts/scenarios/` has the playtests used to build this: `first`, `pnp` (a whole war to the drawer), `tour` (first-time notes, bot turn; run with `TAUGHT=0`), `sizes` (set `W`, `H`, `DPR`), `fog` (the lean-in), `perf` (main-thread cost per frame on a late-war page; `THROTTLE=6`).

## Saves

`localStorage` keeps the game in progress under `pft:save` (the same `{ s, mode }` shape as before, `GameState.v === 1`, so older saves load unchanged) and finished pages under `pft:drawer`, each stored as its seed, camps and flicks and redrawn by replaying them.

## Source prototype

An earlier [AI Studio build](https://aistudio.google.com/apps/d2c29067-ed8f-4b5e-a98a-fb47ed65190a) exists but sits behind Google sign-in and couldn't be imported. This repo started clean from Burooj's 2026-06-07 description of the game. If that build is exported later, compare its base shapes and soldier classes against [RULES.md](RULES.md) rather than merging it in wholesale.

## Relevant Linear issues

- [BJS-67 — Capture Pen Flick Tactics game seed](https://linear.app/bjs-projects/issue/BJS-67/capture-pen-flick-tactics-game-seed)
- [BJS-127 — Import the AI Studio prototype as repo baseline](https://linear.app/bjs-projects/issue/BJS-127/import-the-pen-flick-tactics-ai-studio-prototype-as-the-repo-baseline)
- [BJS-128 — Reconstruct the canonical ruleset with Dawood](https://linear.app/bjs-projects/issue/BJS-128/reconstruct-the-canonical-ruleset-with-daud)
- [BJS-129 — Scope true async / online multiplayer](https://linear.app/bjs-projects/issue/BJS-129/scope-and-design-true-async-online-multiplayer)
- [BJS-131 — Mobile/touch flick feel, zoom, and limited perspective](https://linear.app/bjs-projects/issue/BJS-131/mobiletouch-flick-feel-with-zoom-and-limited-perspective)
- [BJS-134 — Taste and polish the hand-drawn aesthetic](https://linear.app/bjs-projects/issue/BJS-134/taste-and-polish-pass-on-the-hand-drawn-aesthetic)

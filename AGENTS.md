# AGENTS.md

Dotfight: a pen-flick war game for phones, played on a hand-drawn exercise book under a desk lamp ("Lamplight"). Vite + TypeScript + Canvas 2D, no framework. The owner is Burooj; the game's inventor is his friend **Dawood** (always spelled Dawood; the bot is Dawood-bot). Live at https://dotfight.vercel.app, repo `beejsbj/dotfight` (private). The local folder is still named `pen-flick-tactics`.

## Ground rules

- **Commit as beejsbj.** Set the repo-local identity (`git config user.name beejsbj; git config user.email burooj.bj@gmail.com`) in every new worktree before committing. Vercel silently blocks deploys authored by any other identity (the global bjslab identity is Otto, and it gets blocked).
- **Work in a worktree** under `.claude/worktrees/<name>` on its own branch, and open a PR against `main`. Stack on another PR's branch only when you build on its unmerged work. Run `npm ci` in the worktree: a symlinked `node_modules` misses packages (fonts) and breaks the build.
- **Merging and anything outward-facing** (renames, domains, publishing) need Burooj's go-ahead.
- **Stop servers by PID.** `pkill -f` / `pgrep -f` match your own shell's command line and kill it. Find the PID with `ss -ltnp | grep :<port>`.
- **The name lives in `src/name.ts`.** HTML gets it through `%GAME_NAME%` / `%GAME_NAME_HTML%`, and a test checks the manifest against it. Storage keys (`pft:*`) and the dev hook (`window.pft`) keep the old "pft" prefix on purpose, so players keep their saves.

## How the code stays fast and replayable

- **The engine is pure and deterministic.** `src/game.ts` and everything marked "(pure, tested)" below has no DOM. Randomness is seeded, and a flick's randomness is resolved *before* `act()`, so a game is fully described by its seed, camps and flicks (`src/record.ts`). Replays, the drawer, the future room links (BJS-457) and rule simulations all rely on this. Keep presentation randomness cosmetic and out of game state.
- **The page is append-only.** `src/page.ts` inks each mark once onto a page-space canvas. The desk and page are placed on screen by CSS `matrix3d`, never repainted for the camera, and light and fog are quarter-resolution canvases. Only ink still being drawn, pencil and the pen are drawn per frame. New per-frame visuals go on their own small layer with dirty rectangles, never a full-page redraw.
- **Measure performance changes** with the perf playtest at `THROTTLE=6`, before and after, and report the table. Honour the slow-device path (it skips expensive effects) and `prefers-reduced-motion`.

## Module map

- `src/rules.ts`: every tunable rule and the flick feel
- `src/game.ts`: game state, setup, flick resolution, hits, win (pure, tested)
- `src/flick.ts`: pull-back gesture → flick, with wobble and release error
- `src/bot.ts`: Dawood-bot
- `src/record.ts`: a page as seed + camps + flicks; replay, the drawer, old saves (pure, tested)
- `src/projection.ts`: world ↔ screen through the tilted-desk camera; CSS perspective and touch input share it (pure, tested)
- `src/inkclock.ts`: ink time, which snags on every soldier crossed (pure, tested)
- `src/camera.ts`: bird's-eye by default, leaning in to aim, turning the page
- `src/light.ts`: the lamp, the aiming fog, the dawn
- `src/page.ts`, `src/scene.ts`: the append-only sheet, and one frame's composition
- `src/pen.ts`, `src/ink.ts`, `src/textures.ts`: the ballpoint, seeded ink and pencil primitives, desk and paper
- `src/timeline.ts`, `src/hand.ts`: draw-on timing, which soldier a tap means (pure, tested)
- `src/sound.ts`: synthesised pen, paper and lamp sounds
- `src/main.ts`: turn flow, input, HUD, cover, cards, drawer, replay
- `rules.html`, `rules/advanced.html`, `src/rulebook/`: the two rulebooks; `figures.ts` draws each mechanic with the game's ink

## Seeing it work

- `npm run dev`, then drive it in headless Chrome at phone size: `node scripts/playtest.mjs <scenario> http://localhost:5173/ /tmp/out`. It uses playwright-core with `/usr/bin/google-chrome` and real CDP touch events, and takes `W`, `H`, `DPR`, `THROTTLE` and `TAUGHT=0` from the environment. Scenarios are in `scripts/scenarios/` (`first`, `pnp`, `tour`, `sizes`, `fog`, `perf`, …).
- In dev builds, `window.pft` exposes state, camera, timelines, `speed`, `frames()`, `renderNow`, and helpers that file, resume and replay seeded bot-v-bot wars (`fileWar`, `resumeRecord`).
- `npm run phone` serves on bjslab's Tailscale address for testing on a real phone.
- **Share art:** after changing the title, cover or rulebook look, regenerate with `npm run share-art -- <devurl>` and `npm run rules-art -- <devurl> --og`, and look at the images.
- **Vercel previews** sit behind a Vercel login, so only production is public. Send people production links.

## Rules: where they stand

`RULES.md` is the single rulebook: Core (Quick battle) and Advanced (Long war), with an open/to-test table. The playable game still runs the older simple rules (shoot or move). The new rules were simulated on the rules-lab branches `rules/lab` (PR #3, report `docs/rules-lab/report.md`) and `rules/lab-2` (PR #4, `docs/rules-lab/round-2.md`). Both are built on the retired notebook UI, so bringing a rule into the game means porting it into Lamplight. Rule decisions are Burooj's; record them in `RULES.md` and on the `/rules` pages together.

## Coordination

- Linear (team BJS, project "pen-flick-tactics") holds status and decisions. Use the `cockpit linear` CLI with the app actor. On bjslab, source `/home/admin/.config/cockpit/env` only inside the subprocess that runs cockpit, and check `cockpit linear linear-doctor` reports `app actor: OK` before writing.
- Key issues:
  - BJS-128: rules with Dawood
  - BJS-457: room link / online play
  - BJS-458: real-time mode
  - BJS-459: motion-sensor aiming
  - BJS-460: notebook as a theme
  - BJS-461: Android + iOS via Capacitor
  - BJS-462: tutorials
- End commit messages with the `Co-Authored-By:` trailer for the model that wrote them, and PR bodies with the Claude Code line.

# Rules lab report

_Copied from the PR #3 description (2026-09-25). Raw data: [data/](data/), playtest shots: [shots/](shots/)._

The rules lab evolves Dawood's game with evidence. A serialisable `RuleSet` now drives a pure, seeded engine. The bot understands every mechanic. A headless harness played about 32,000 bot-vs-bot games across 57 rule sets. Five named sets are playable in the app, each with a handwritten rules card.

## The rule sets

| Set | What it is | Where from |
|---|---|---|
| **Dawood classic** | 5 bases × 10. Shoot or move, both as long as a shot. A kill earns another flick, and it chains. Send up to 5 between bases; they arrive after the opponent's next go, and a cut road kills the convoy. Empty bases are gone. | Canon (Dawood, Burooj). Every gap is a labelled guess in RULES.md. |
| **Last stand** ⭐ | Shared foundation (below). At 4 soldiers, the survivors are circled and that side flicks **twice a turn with a steadier hand**. | Burooj's idea; the numbers are invented |
| **Geometry set** | Shared foundation. Draw 2 camps (circles, 10), a fort (square, 8: walls stop an enemy line, once), a mirror (hexagon, 8: walls bounce it, once) and a prism (triangle, 6: your own line splits leaving it). | Burooj (shapes) and earlier sessions; the properties are invented |
| **Wet ink** | Shared foundation. Each colour's **newest** line is wet: yours bounces your lines, theirs stops them. Dried lines stay on the page but don't interact. | Burooj (lines as walls and reflections); invented (wet) |
| **Siege** | Shared foundation. A base with none of your soldiers in it has fallen; leave the enemy none standing and you win. Walk into ruins to take them. Sends are free, once a turn. | Guess, earlier sessions, invented |

The shared foundation for the evolved sets: the canon, but **a streak stops after two extra flicks**, and **the opening turn can't earn an extra flick**. Both are invented.

## Simulation results (2,000 games per set, human-like hand)

| rule set | turns (p10–p90) | 1st-player wins | kills/flick | ≥3 kills in one flick | comebacks (big) | endgame drag: flicks once a side has ≤3 (share) | moves | sends | turns that change the balance | longest streak |
|---|---|---|---|---|---|---|---|---|---|---|
| Prototype (June) | 62.6 (42–87) | 52% | 0.90 | 10% | 27% (14%) | 20.0 (30%) | 1% | – | 49% | 1.0 |
| **Dawood classic** | 9.5 (4–16) | 54% | 1.80 | 27% | 30% (25%) | 7.8 (16%) | 38% | 0% | 77% | 14.7 |
| **Last stand** | 21.3 (17–26) | 46% | 1.74 | 25% | 33% (21%) | 8.7 (16%) | 39% | 0% | 86% | 4.0 |
| **Geometry set** | 27.9 (20–37) | 48% | 1.26 | 14% | 28% (16%) | 8.8 (14%) | 35% | 0% | 73% | 3.0 |
| **Wet ink** | 26.5 (19–36) | 50% | 1.58 | 22% | 27% (10%) | 10.7 (17%) | 36% | 0% | 74% | 3.0 |
| **Siege** | 22.3 (17–28) | 46% | 1.70 | 24% | 33% (18%) | 3.6 (6%) | 43% | 1% | 82% | 3.4 |

How to read the columns:
- **Turns** are pen hand-overs.
- **Comebacks** is how often the side ahead at half-time loses; the bracketed figure counts only leads of at least 15% of an army.
- **Longest streak** is the most actions one player takes in a single turn: how long the other person watches.

Mechanics per game:
- Geometry set: 9 bounces, 6 wall stops, 1.6 splits.
- Wet ink: 7 bounces, 6 stops.
- Siege: 1.2 bases taken.
- Last stand triggers in every game.

Standard error is about ±1.1 points.

**Is the bot any good?** It beats the June prototype's bot 99% of the time on classic (300 games from each seat) and 74% on the prototype's rules. How it plays:
- it previews 64 candidate flicks and moves with the real engine;
- it re-flicks the best 8 with a shaky hand 6 times each, so it prices risk;
- it weighs its own best next shot against the enemy's best reply.

The hand is the app's own release error, plus 0.02 rad of aiming by eye and 5% error judging power.

## What the lab found

1. **Whether the extra flick chains is the game.** With no limit (the classic guess), there are 15-flick streaks, and in round 1 the first player won 59%. Capped at 2, you get about 21 turns and streaks of 3–4. Total flicks barely change; what changes is who makes them. "Once per turn" was fair but leaders almost never lost (0–4% big comebacks).
2. **Burooj's full-length move makes move a real choice:** about 40% of flicks. With the June short move it was 0–1%. The cost is about one soldier a game flicked off the page.
3. **Transfers, as guessed, are a trap.** 0% of actions in every variant that charged a flick for it. I instrumented the bot to rule out a blind spot. In siege, the median best flick scored 7.6 against the best send's −0.4. With an extra flick on every kill, giving up your flick costs about two. Even free sends only reach 1%. **This is the top question for Dawood.**
4. **Last stand: fighting harder works, being harder to kill doesn't.** Two flicks and a steadier hand raise comebacks (big: 11% → 21% on the shared foundation) and shorten the hunt. Two-hit survivors lengthened the endgame (3.9 → 5.6 turns). The "hero" version (two hits, bigger dots) dragged to 13.7 flicks.
5. **Ink as terrain chokes the page if every line counts.** Friction and own-ink bounces stalled 12–46% of games at the turn cap. Trenches (enemy ink stops you) gave the first player 80%. Wet ink (newest line only) keeps the mechanics with 0% stalls.
6. **Shapes cut alpha strikes almost in half** (≥3 kills: 27% → 14%). Walls eat the big lines.
7. **Siege nearly removes the endgame hunt** (6% of the game), and bases change hands 1.2 times a game.
8. **Moving first is worth about 54–58% everywhere.** Barring an extra flick on the opening turn brings it to 46–51%. It slightly overcorrects in two sets, so alternate who starts.
9. **Pierce 2** (a line stops at its second body) removes 3+ kill flicks entirely. It's kept as an option, not a set. **Page-edge bounces** ("sides of the page") were the fairest single change (48%) and halved off-page losses; also an option.

Tried and discarded:
- unlimited chain as the default;
- once per turn, and no extra flick at all;
- the short move;
- pierce 1 (22-flick streaks under chaining);
- armour-style last stand;
- friction, own-ink bounces and trenches with every line counting (including a wide clear zone around the pen);
- red flicking first (it just moves the edge).

Per-round tables are in `docs/rules-lab/data/`.

## Recommendation

**Play "Last stand."** It's the canon plus two small house rules plus Burooj's own idea, and it's the best all-rounder:
- 21 turns, with the most turns that change something (86%);
- real comebacks (21% of big leads lost) and a short endgame;
- no 15-flick blowouts.

It also delivers exactly the "they lost their comrades" feeling: the last four fight back rather than hide. **Geometry set** is the best second game, the most tactical, with walls you can see yourself planning around. **Siege** is for short, decisive games. **Wet ink** is clever but the least comeback-friendly (10%), so it suits players who know the game. **Classic** is the reference to show Dawood, not the one to play every day. Numbers are evidence, not the verdict: bots don't get bored watching a streak, and people will spread out and bait in ways the bot's placement doesn't.

## Canon vs invented

RULES.md is rewritten around provenance:
- canon from Dawood (2026-09-25);
- canon from Burooj (full-length move, lines stay);
- every guess, with its reason;
- every invention;
- every `RuleSet` option, and who it came from;
- questions for Dawood (10) and Burooj (4).

## What changed in code

- **Engine** (`src/game.ts`, `src/trace.ts`, `src/bases.ts`, `src/geom.ts`, `src/rules.ts`): `newGame(ruleSet, seed, page)`. It stays pure, seeded, DOM-free and UI-agnostic, so it can be ported to Lamplight (#2).
  - The line tracer handles fort walls, mirrors, prism splits, own and enemy ink, friction and page-edge bounces.
  - Transfers have roads and ambushes; bases fall and can be captured.
  - Last stand, extra-turn modes, chain caps, the opening rule, and a choice of win conditions.
  - Every action (bases, flicks, transfers, passes) goes in `s.actions`, and `replay(rules, seed, actions)` rebuilds the page.
  - v1 saves migrate: their bases and flicks become the action log, and they keep the prototype rules. Missing rule fields default to the prototype's behaviour.
- **Bot** (`src/bot.ts`): as described above. Pure and seeded.
- **Lab** (`src/lab/`, `scripts/rules-lab.ts`): `npm run lab -- --games 2000 --sets …`. Worker threads under plain `node` (types stripped, and a tiny resolve hook adds the `.ts` extension). All 57 experiments are named in `src/lab/variants.ts`.
- **UI:**
  - a rule-set picker and rules cards on the title card;
  - a shape picker during setup, with hand-drawn polygons;
  - **send**: tap a base, tap another, pick a number from the handwritten chips; a dashed road shows the count, with crosses on the road when a convoy is cut;
  - wall cracks, bases struck out when they fall, re-circled when taken;
  - "last stand!" in the margin, with survivors circled;
  - a wet-ink sheen on the newest line;
  - a narrower aim cone for steadier hands;
  - extra flicks keep the pen, with no hand-off.

  The flick stays imprecise; no mechanic erases ink.

## How to try each

`npm run dev`. On the title card, tap **rules: Dawood classic** to pick a set (its card opens), then **play these**, then **pass & play** or **vs Dawood-bot**. Each card is under **read**.
- **Geometry set:** choose each shape from the strip at the bottom while drawing bases.
- **Send:** switch the strip to **send**, tap a base, tap another, then pick how many.

## Verified

- `npm test`: 179 tests pass, including:
  - a test for every rule;
  - a replay-determinism test and a "marks are only ever added" test for every one of the 57 rule sets;
  - a JSON save round-trip;
  - v1 save migration.
- `npm run typecheck` and `npm run build` pass.
- `npm run playtest`: headless Chrome with real touch events at iPhone SE (375×667) and Pixel 7 (412×915). For every named set it:
  - picks the rules on the title card;
  - draws all 10 bases by touch (choosing shapes for Geometry set);
  - shoots and moves by touch, and sends (with count chips);
  - checks that the HUD fits the screen.

  102/102 checks pass, with no page errors. Screenshots are in `docs/rules-lab/shots/`.
- A read-only code review of the engine and bot found five issues. Four were fixed with regression tests:
  - capture order;
  - arrivals into bases that just fell;
  - split branches sharing one bounce budget;
  - send scoring.

  The fifth (one flick wiping out both sides) is documented as a rule: the flicker wins. The finals ran on the fixed engine.
- The "lines stay" test caught a real aliasing bug: a line's first point was the soldier object, so it moved when he did. It's fixed.

Not done: `docs/rules-lab/report.md`. Writing a file with that name was blocked in this session, so the full write-up is in this description, and RULES.md holds the rules, the summary table and the questions.



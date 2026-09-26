# Rules

_Margin Front (working title, it may still change; the repo and site are still pen-flick-tactics). Consolidated 2026-09-26 from Burooj's decisions and two rounds of the rules lab. The same rules, with drawings, are in two books: [Core rules](https://pen-flick-tactics.vercel.app/rules) ([rules.html](rules.html)) and [Advanced rules](https://pen-flick-tactics.vercel.app/rules/advanced) ([rules/advanced.html](rules/advanced.html))._

This is Dawood's game. He made it up at school, and he and Burooj played it in grades 5 and 6 with ballpoint pens on the back pages of their exercise books. Nobody wrote the rules down. What follows is the game remembered, argued over and rebuilt.

**The playable game on the site still runs the first, simpler rules** (shoot or move, see [the appendix](#appendix-the-rules-from-memory)). The rules below come from the rules lab (branches `rules/lab` and `rules/lab-2`) and are still to be ported into the game.

Anything marked **(to test)** has a number or strength nobody has felt at a real table yet. **(being designed)** means the idea exists and the rule doesn't. Lab values are what the simulations used, on a page 1000 units wide and 1700 tall.

- [Core rules](#core-rules-quick-battle): Dawood's game, played as a Quick battle. Everything you need to play.
- [Advanced rules](#advanced-rules-long-war): the Long war, which adds shaped bases and a page that fights back.
- [Open / to test](#open--to-test)

# Core rules (Quick battle)

## The page

Two players, two pens (blue and red) and one sheet of paper. Everything drawn stays drawn. Dead soldiers are crossed out, never erased, so a finished game is a page full of lines and crosses.

## Setup

1. **Bases.** Players take turns drawing bases (circles), one at a time. Each base is jotted full of soldier dots.
2. **Positioning.** Before the first flick, each side arranges its soldiers, anywhere inside its bases or a little outside the walls (lab: 20 units, a dot and a bit). The first player arranges first; the second sees that arrangement before arranging. There's no minimum inside, but staying in is worth it: walls protect (a line loses power and a lunger shakes crossing them), and a lunger who lands among enemy soldiers is shot.

## A turn

One flick, either a **snipe** or a **lunge**, plus one free **send**.

## Flicking

Pull back and release, like flicking a pen stood on its tip. The harder the flick, the longer the line and the less accurate it is. A soft flick is short and precise.

## Snipe

- The ink line crosses out every enemy soldier it crosses. It pierces.
- **Power loss.** Passing through a base wall costs the line a lot of its power; passing through a soldier costs less. The line tapers and falls short. (to test: lab gentle values of 5% a wall and 10% a kill were fine on their own; 15% and 25% stalled games.)
- **Extra flick.** Cross out two or more with one line ("two with one bullet") and you flick again. It can chain, and power loss is the natural limit. The lab's rising bar (each further snipe needing one more kill) is dropped. (to test: whether power loss alone keeps streaks short.)

## Lunge

_Formerly "move"._

- The soldier runs along his own ink, as far as a shot can go, and crosses out every enemy he passes. He stands where the ink stops.
- **Walls shake him.** Crossing a wall shakes his hand; crossing a soldier shakes it a little. It's the same foundation as a snipe's power loss, paid in shake instead of power. (to test)
- **Lunge again.** Each lunge kill earns another lunge by the same soldier, and you may stop instead. Every link adds a fixed shake (lab: 0.05 rad, about 3°, however softly you flick).
- **Through a base.** He may cut right through an enemy base, crossing out the soldiers inside, as long as he doesn't land in it. He pays shake at both walls and at every soldier he crosses: costly, but legal.
- **Where he lands decides.** Inside an enemy base with enemy soldiers in it, they shoot him on the spot. In an empty enemy ring nothing happens; he's fine. Off the page, he's lost. Whatever he crossed out on the way stays crossed out.

## Send

- Free, once a turn, alongside your flick: **up to 5 soldiers** per send. (to test)
- **On the road for one turn.** In a Quick battle the convoy walks out visibly between turns (seen as a quick time-lapse) and arrives at the start of your next turn. That leaves exactly one enemy turn in which it's on the road, and any line that crosses it then crosses them out. (to test)
- Exposure is the cost, and the size limits itself: a big convoy on open paper is exactly what a "two with one bullet" snipe is looking for.
- In the Long war, convoys walk for several turns instead (see [Sends in the long war](#sends-in-the-long-war)).

## Bases

- An emptied base doesn't vanish. It stays on the page as an empty ring, and a send can man it again. Until then an enemy lunger can land in it safely.
- Walls have friction: power loss for snipes, shake for lunges (above).

## Last stand

When a side is down to its last 4 soldiers, they've lost their comrades: that side flicks **twice a turn, with a steadier hand**.

## Winning

Cross out every enemy soldier.

## Quick battle

Dawood's game: circles only, with the core rules. You choose the size:

- **Quick**: 3 bases of 8 (to test)
- **Classic**: Dawood's 5 bases of 10
- **Custom**: pick the bases and the soldiers per base

## How you play

A separate choice from the size of the war:

- pass one phone
- against Dawood-bot
- by a shared link (planned)
- real time on two devices (planned)

# Advanced rules (Long war)

For players who like long games. Everything in the core rules still holds. The Long war adds:

- **shaped bases** (below), each with its own walls;
- **full pen physics**: grooves, jolts, wall friction and ink cover;
- **bigger armies** than a Classic battle (to test);
- **longer roads**: sends walk for several turns.

## Sends in the long war

A convoy walks over several turns, in real time during each turn, (lab: 150 units a turn, so a road takes two to four turns), exposed to any line the whole way. Still up to 5 at a time, once a turn. (to test)

## Ink on the page

- Crossing an old line gives the pen a slight jolt of wobble.
- **The angle the pen meets a line decides.** At a shallow angle the pen is pulled into the groove, like gravity, and carried along it. At a steep angle it jolts.
- Friendly grooves carry you further; enemy grooves cut you short. (to test)

## Ink as cover

Every line runs at somebody's base, so ink piles up round bases over the game and becomes natural cover. That's intended: bases get more protection as the page fills. (strengths to test)

## Shaped bases

| Shape | Name | What it does |
|---|---|---|
| Circle | camp | A **gravity well**: lines passing near it, anyone's, yours too, bend round it, so you can curve shots round a camp or through a gap. **Its pull is its garrison**: the more soldiers inside, the harder it bends. A full camp bends lines hard; as it's shot down the well weakens; an empty ring keeps a faint pull (the dent in the paper); a send arriving strengthens it again (to test). Soft walls. Still holds the most soldiers (lab: 12, against 8 and 6). |
| Triangle | prism | Your lines passing out through it split in two, so place it in front of your other bases. (Lunges don't split: a lunger is one body.) |
| Hexagon | cushion | Billiards: banks everyone's lines, yours too, by angle. Only a glancing line bounces (lab: more than 0.6 rad, about 34°, off square); a straight one goes in. |
| Square | eraser | Idea: a loose block. Lines that hit its walls shove it along, and as it slides it erases the ink beneath it (grooves and cover included). |
| Pentagon | | (being designed) |

## Shaped soldiers

- Soldiers are drawn in their base's shape: dots in a camp, little triangles in a prism, little hexagons in a cushion. For now it's only a look.
- Their shape's power might wake up only in a last stand. (idea)

# Open / to test

Every value here is a lab guess or a direction nobody has played yet.

## Core

| What | Where it stands |
|---|---|
| Snipe power loss per wall and per kill | Lab: 5% a wall and 10% a kill were fine alone; 15% and 25% stalled games. Now a core rule, so its strength is the first thing to feel out. |
| Snipe extra flick with no rising bar | The lab needed a rising bar to keep turns short (without it, turns of up to 17 flicks). Whether power loss alone does the job is untested. |
| Lunge shake at walls and soldiers | Direction only; no numbers yet. Is cutting through a base too cheap, or too dear? |
| Lunge chain shake per link | Lab: 0.05 rad (about 3°). |
| Positioning reach | Lab: 20 units. Inside-only changed nothing; 40 turned the game towards lunges. The lab also saw a whole garrison walk out of its base; "keep at least one inside" is not a rule. |
| Send limit of 5 | New. The bet is that big convoys limit themselves as snipe targets. |
| Quick battle send timing | New: out between turns, on the road for exactly one enemy turn, home at the start of your next. |
| Quick preset: 3 bases of 8 | Untried. The lab's advice if games drag was a smaller army. |
| Game length | The lab's Lunge & snipe ran about 53 turns (88 flicks). Is that a phone game? |

## Advanced

| What | Where it stands |
|---|---|
| Circle as a gravity well: strength | New. The pull scales with the soldiers inside: how hard a full camp bends, how far out, and how fast it weakens as the camp is shot down. |
| Long war send pace | Lab: 150 units a turn, two to four turns on a typical road. |
| Crossing jolt, groove pull, and how far grooves carry or cut | Lab shipped jolts of 0.03 rad (one per line) and grooves within 7°. Dawood's version, friendly ink boosting and enemy ink slowing, was the least fair thing the lab tried (62% to the first player). |
| Ink cover round bases | Intended, but the lab's scribble cover stalled games at every strength that showed. |
| Camp, prism and cushion sizes (12, 6, 8), the glance angle (0.6 rad) | Lab guesses. |
| Bigger armies | How big is undecided. |
| Game length | The lab's pen-physics war ran about 81 turns. |
| Square and pentagon | Square: the eraser block is an idea (shoving erases). Pentagon: being designed. |
| Shape powers waking in a last stand | Idea. |
| Shared-link and real-time play | Planned. |

# Appendix: the rules from memory

The first build (June 2026) started from Burooj's description of the game and plays these rules today: bases of 10 soldiers, one soldier acts a turn, **shoot** (the line runs nearly off the page and crosses out every enemy it touches) or **move** (the soldier goes where the ink stops, and the line still kills), nothing erased, cross out every enemy to win.

What Dawood confirmed on 2026-09-25: 5 bases of 10 soldiers; no new soldiers, ever; a base whose soldiers are all dead is gone; a kill earns another flick; soldiers can be sent between bases, arriving after the opponent's next strike. Burooj remembers for sure that a move goes as far as a shot and that lines stay. The consolidated rules keep 5 × 10 as the Classic size and change the rest on purpose: an empty base stays as a ring, sends are free and walk, and only a snipe that takes two earns an extra flick.

## Still to ask Dawood

1. Did friendly lines really carry a flick further, and enemy lines slow it?
2. When a line ran along another one, did it follow it?
3. Did a soldier who charged through someone go again, and was it the same soldier?
4. How fast did sent soldiers walk, and how many could you send at once? (The rulebook now says up to 5.)
5. Did an empty base stay a base?
6. How did the game end: every soldier dead, or every base?
7. What happened when a flick went off the page?
8. Could you hit your own soldiers?
9. Who went first, and did the second player get anything for it?

## The lab reports

- Round 1: 32,000 simulated games, five rule sets ([report](https://github.com/beejsbj/pen-flick-tactics/blob/rules/lab/docs/rules-lab/report.md), [PR #3](https://github.com/beejsbj/pen-flick-tactics/pull/3)).
- Round 2: lunge and snipe, walking sends, rings, positioning, pen physics, billiards ([report](https://github.com/beejsbj/pen-flick-tactics/blob/rules/lab-2/docs/rules-lab/round-2.md), [PR #4](https://github.com/beejsbj/pen-flick-tactics/pull/4)).

# Rules

_Dotfight. Consolidated 2026-09-26 from Burooj's decisions and three rounds of the rules lab. The same rules, with drawings, are in two books: [Core rules](https://dotfight.vercel.app/rules) ([rules.html](rules.html)) and [Long war rules](https://dotfight.vercel.app/rules/advanced) ([rules/advanced.html](rules/advanced.html))._

This is Dawood's game. He made it up at school, and he and Burooj played it in grades 5 and 6 with ballpoint pens on the back pages of their exercise books. Nobody wrote the rules down. What follows is the game remembered, argued over and rebuilt.

**The game plays the core rules below** (Quick battle). Old saves and pages filed before the port keep the first, simpler rules (shoot or move, see [the appendix](#appendix-the-rules-from-memory)) and still replay by them. The long war rules are still to be ported. The numbers are in `src/rules.ts`; round 3 of the rules lab measured them on the game's own engine ([report](docs/rules-lab/round-3.md)), and round 4 tuned garrisoned walls ([report](docs/rules-lab/round-4.md)). Games and pages begun before garrisoned walls keep the flat walls they were played with.

Anything marked **(to test)** has a number or strength nobody has felt at a real table yet. **(being designed)** means the idea exists and the rule doesn't. Lab values are what the simulations used, on a page 1000 units wide and 1700 tall.

- [Core rules](#core-rules-quick-battle): Dawood's game, played as a Quick battle. Everything you need to play.
- [Long war rules](#long-war-rules): book 2, which adds shaped bases and a page that fights back.
- [Open / to test](#open--to-test)

# Core rules (Quick battle)

## The page

Two players, two pens (blue and red) and one sheet of paper. Everything drawn stays drawn. Dead soldiers are crossed out, never erased, so a finished game is a page full of lines and crosses.

## Setup

1. **Bases.** Players take turns drawing bases (circles), one at a time. Each base is jotted full of soldier dots.
2. **Positioning.** Before the first flick, each side arranges its soldiers, anywhere inside its bases or a little outside the walls (20 units, a dot and a bit; to test). The first player arranges first; the second sees that arrangement before arranging. There's no minimum inside, but staying in is worth it: **a wall is as strong as the men inside it** (see [Garrisoned walls](#garrisoned-walls)), so a full base's wall eats most of a snipe and badly shakes a lunger, and a lunger who lands among enemy soldiers is shot. Men just outside the wall don't hold it. (Round 4: a man inside is about twice as hard to cross out as one outside; on the old flat walls it made almost no difference.)

## A turn

One flick, either a **snipe** or a **lunge**, plus one free **send**.

## Flicking

Pull back and release, like flicking a pen stood on its tip. The harder the flick, the longer the line and the less accurate it is. A soft flick is short and precise. The pull is long and forgiving: a thumb's whole travel down a phone covers the whole reach, with the short lines that matter most spread widest, so a finger's slip changes the line a little, not a lot.

## Snipe

- The ink line crosses out every enemy soldier it crosses. It pierces.
- **Power loss.** Passing through a base wall costs the line power, **as much as the wall's garrison makes it** ([Garrisoned walls](#garrisoned-walls)): a full base eats most of it, an empty ring almost none. Passing through a soldier costs a little. The line tapers and falls short. Every wall counts, your own other bases too, except the wall at your back as the line leaves the base you stand in. (to test: from 3% of what's left at an empty ring to 85% at a full base; 5% at a soldier crossed out.)
- **Extra flick.** Cross out two or more with one line ("two with one bullet") and you flick again. It can chain, and power loss is the natural limit. The lab's rising bar (each further snipe needing one more kill) is dropped. (Round 3: power loss does keep snipe streaks short; the long turns are lunge chains.)

## Lunge

_Formerly "move"._

- The soldier runs along his own ink, as far as a shot can go, and crosses out every enemy he passes. He stands where the ink stops.
- **Walls shake him.** Crossing a wall shakes his hand, **as hard as its garrison**: a full base's wall throws him badly off line, an empty ring barely. Crossing a soldier shakes it a little. It's the same foundation as a snipe's power loss, paid in shake instead of power: his heading jolts at each wall and each soldier and the rest of his line turns with it. (to test: from 0.02 rad, about 1°, at an empty ring to 1 rad, about 57°, at a full base (1 sd); 0.04 at a soldier)
- **Lunge again.** A lunge that crosses someone out earns another lunge by the same soldier, and you may stop instead. Every link adds a fixed shake (0.05 rad, about 3°, however softly you flick; to test).
- **Through a base.** He may cut right through an enemy base, crossing out the soldiers inside, as long as he doesn't land in it. He pays shake at both walls and at every soldier he crosses: through a full base that's a wild gamble; through one shot down to a man or two, it's cheap.
- **Where he lands decides.** Inside an enemy base with enemy soldiers in it, they shoot him on the spot. In an empty enemy ring nothing happens; he's fine (and if he crossed out the last man inside on the way in, it's an empty ring by the time he lands). Off the page, he's lost. Whatever he crossed out on the way stays crossed out.

## Send

- Free, once a turn, alongside your flick: **up to 5 soldiers** per send, from one of your bases to another of yours (an empty ring included). Send before your last flick: the flick that ends your turn hands the pen over. The ones nearest the road go. (to test)
- **On the road for one turn.** In a Quick battle the convoy walks out visibly between turns (seen as a quick time-lapse) and arrives at the start of your next turn. That leaves exactly one enemy turn in which it's on the road, and any line that crosses it then crosses them out. On the road they stand in a column across its middle. (to test)
- Exposure is the cost, and the size limits itself: a big convoy on open paper is exactly what a "two with one bullet" snipe is looking for.
- In the Long war, convoys walk for several turns instead (see [Sends in the long war](#sends-in-the-long-war)).

## Bases

- An emptied base doesn't vanish. It stays on the page as an empty ring, and a send can man it again. Until then an enemy lunger can land in it safely.
- Walls have friction: power loss for snipes, shake for lunges (above), and how much depends on who's inside.

### Garrisoned walls

_Burooj's decision, 2026-09-29: a base should be worth something._

- **A wall is as strong as the men inside it.** Its garrison is the base's own living soldiers standing inside the wall at the moment a line crosses it. Men a little outside the wall, or out on a road, don't count, and neither does the man flicking.
- **Full, thinned, empty.** A full base (as many as it was jotted with) has the toughest wall; each man lost weakens it in a straight line; an empty ring is nearly paper. More than full is no tougher. (to test: a snipe loses 3% of what's left at an empty ring, 85% at a full base, 44% at half; a lunger jolts 0.02 rad at an empty ring, 1 rad at a full base, 0.51 at half.)
- **Shooting a base down makes it easier to hit**, even within one line: men a line crosses out on its way in no longer hold the far wall on its way out. A send that mans a ring again makes it tough again.
- Your own bases' walls work the same way on your lines. The wall at your back as you leave your own base is still free.
- It rhymes with the long war's camp, whose [gravity well](#shaped-bases) pulls as hard as its garrison.

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

## Tactics

_Plays that fall out of the rules, for players. Also the outline for the Core tutorial (BJS-462)._

- **Stay behind the wall.** A full base's wall eats most of a snipe and throws a lunger off line, and every man inside makes it tougher for the rest. Men inside a manned ring are hard to reach; men on open paper are free. (Round 4: a man inside is crossed out about half as often as one outside.)
- **Shoot the base down.** Thin a base and its wall thins with it: the last few inside are far easier to reach than the first. Man a thinned base with a send before they finish it.
- **Look for a row.** Two with one bullet: enemy soldiers standing in a line give you another flick. Never leave yours in one.
- **Bait the lunge.** One man just outside your base invites a lunge; a lunger who lands among the rest gets shot.
- **Catch the convoy.** A send is on open paper for exactly one enemy turn, and five together is a row. Send small, and behind a base.
- **Soft to finish, hard to gamble.** Soft flicks are short and sure; save the hard, wild one for when a miss costs nothing.
- **Mind the last four.** A side down to four flicks twice, steadier. Take the last few in one turn if you can.

# Long war rules

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

## Tactics

_Plays that fall out of the long war's rules. Also the outline for the War and Advanced tutorials (BJS-462)._

- **Curve it round a camp.** A full camp bends lines near it, so a shot can swing round into a base you can't see straight. Your own camps bend your lines too.
- **Shoot the well down.** A camp's pull is its garrison: thin it and it stops bending.
- **Bank off a cushion.** A glancing line bounces off a hexagon to reach behind a wall; a square one goes in.
- **Put the prism in front.** Lines passing out through a triangle split: one flick, two targets.
- **Ride your own grooves.** Meet your old line shallow and it carries you on; meet theirs steep and take the jolt rather than be cut short.
- **Let the page fill.** Ink piles up round bases as cover: the open game is early, the scribble late.
- **Walk the long road behind something.** Convoys are out for several turns; route them behind a cushion or a wall of ink.

# Open / to test

Every value here is a lab guess or a direction nobody has played yet.

## Core

| What | Where it stands |
|---|---|
| Garrisoned walls: the curve | A straight line from an empty ring (3% of a snipe, 0.02 rad of shake) to a full base (85%, 1 rad). Round 4: a man inside is about twice as hard to cross out as one outside (Quick 5.0 against 11.6 kills per 100 exposed; flat walls 8.2 against 9.3), fair (48% and 53% to the first player), games a third longer (Quick 22 turns, Classic 36). Lunges only fall from 77% to 73% in Quick and stay at 69% in Classic: they feed on men outside and on chains. A concave curve (a few men already make a wall tough) cuts lunges to 65% but stretches Classic to 46 turns. |
| Snipe power loss per kill | 5% at a soldier crossed out. Flat walls (10% a wall, for games begun before garrisoned walls): round 3 found it fair, and snipe streaks stay short. |
| Snipe extra flick with no rising bar | Round 3: the worst turn averages 6.4 flicks in Quick and 7.5 in Classic (up to 13–15), and it's lunge chains that make them long, not snipes. |
| Flick reach and pull | One reach for snipe and lunge, so the pull is one thing to learn: 200 to 2000 units over 240 px of thumb travel, so full power crosses the page corner to corner (the page is 1000 by 1700, about 1970 across the diagonal). A power^2 curve gives the short lines you want most the most travel: 300 to 700 units take 69 to 134 px, including the 16 px cancel zone. A lunger who runs off the page is lost, so a lunge is best kept short. Error follows a line's length, so a 700-unit line is as accurate as before. Rules version 2 (games begun on the earlier 200 to 1200 keep it). |
| Lunge shake at walls and soldiers | Walls: by garrison (above). 0.04 at a soldier. Round 3 (flat 0.08 at a wall): lunges 69–76% of flicks. Round 4: garrisoned walls make cutting through a full base a gamble, but most lunges are at men outside, so the share barely moves; the chain tremor is still the lever for that. |
| Lunge chain shake per link | 0.05 rad (about 3°). A fifth of chains run to four or more; 0.10 a link cut that to an eighth. The first lever to try if chains feel long. |
| Positioning reach | 20 units. On flat walls inside-only changed nothing in the lab; 40 turned the game towards lunges. With garrisoned walls staying in has a real reason (round 4: all inside beats spread out 57% of the time in Quick and 69% in Classic, against 54% on flat walls). "Keep at least one inside" is not a rule (the bot keeps at least half inside by choice, and in practice about two in three). |
| Send limit of 5 | Round 3: 6 sends a game in Quick, 14 in Classic, and about two walkers in three are crossed out on the road. |
| Quick battle send timing | Out when the pen changes hands, a column across the middle of the road for exactly one enemy turn, home at the start of your next. |
| Quick preset: 3 bases of 8 | Round 3: about 16 turns (41 flicks), 52% to the first player. Round 4 (garrisoned walls): about 22 turns, 48%. |
| Game length | Round 3: Quick about 16 turns (41 flicks), Classic 28 (73). Round 4 with garrisoned walls: Quick 22, Classic 36. Round 2's Lunge & snipe ran 53. |

## Long war

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

- Round 1: 32,000 simulated games, five rule sets ([report](https://github.com/beejsbj/dotfight/blob/rules/lab/docs/rules-lab/report.md), [PR #3](https://github.com/beejsbj/dotfight/pull/3)).
- Round 2: lunge and snipe, walking sends, rings, positioning, pen physics, billiards ([report](https://github.com/beejsbj/dotfight/blob/rules/lab-2/docs/rules-lab/round-2.md), [PR #4](https://github.com/beejsbj/dotfight/pull/4)).
- Round 3: the core rules on the game's own engine, 2,000 games each of Quick and Classic ([report](docs/rules-lab/round-3.md)).
- Round 4: garrisoned walls, four curves against flat walls, and all-inside against spread out ([report](docs/rules-lab/round-4.md)).

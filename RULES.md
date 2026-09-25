# Rules

Pen Flick Tactics is **Dawood's** game. He and Burooj played it in grades 5 and 6 with ballpoint pens. Nobody wrote the rules down, and at 30 Dawood doesn't remember all of them, so the canon has to be evolved rather than recalled. This file keeps three kinds of rule apart:

- **Canon (Dawood)**: what Dawood said on 2026-09-25.
- **Canon (Burooj)**: what Burooj remembers for sure.
- **Guess** / **Invented**: filled in or added in the rules lab. Every guess has a reason, and most have simulation data (summaries in [docs/rules-lab/data/](docs/rules-lab/data/); reproduce with `npm run lab`).

Every rule is an option on a `RuleSet` ([src/rules.ts](src/rules.ts)). The named sets are in [src/rulesets.ts](src/rulesets.ts), and the app's new-game screen lets you pick one.

## The game everyone agrees on

1. Players draw circle **bases** on a sheet. Each base holds 10 dot **soldiers**. *(Canon, Dawood)*
2. On a turn, a soldier is **flicked**: the pen is balanced on its tip on the dot and flicked with the other hand, so aim and power are imprecise. The ink line kills any enemy dot it crosses. *(Canon)*
3. Dead dots are crossed out in the killer's colour. **Nothing is ever erased**: a finished game is a sheet full of lines and crosses. *(Canon, Burooj. Dawood once suggested clearing dead units and lines; Burooj said no.)*
4. **Shoot or move.** A shot leaves the soldier where he is. A move is the same flick, but the soldier ends up where the ink stops, and a move's line kills whatever it crosses, exactly like a shot. **A move goes as far as a shot.** You move to spread out, so one line can't take many, or to get closer, because a closer flick is more accurate. *(Canon, Burooj. The June prototype's short move was wrong.)*

The screen keeps the imprecision. On release, a hidden angle error grows with power, and a visible tremble sets in if you hold a hard flick too long ([src/flick.ts](src/flick.ts)). No rule turns aiming into precise clicking. The only rule that touches the hand at all is last stand's steadier aim, and the engine never lets that error reach zero.

## Dawood classic: the canon, gaps filled

| Rule | Classic | Where from |
|---|---|---|
| Bases each | 5 | Canon (Dawood) |
| Soldiers per base | 10 | Canon (Dawood) |
| New soldiers | never | Canon (Dawood) |
| A base with none of its soldiers left | gone for good (struck through) | Canon (Dawood). *Guess:* "its soldiers" means your living soldiers standing inside the circle, so a base whose last soldier walks out is gone too. |
| A kill | earns another flick; crossing out several in one flick still earns just one | Canon (Dawood) |
| Does the extra flick chain if it kills again? | yes, with no limit | **Guess.** Kids' games like carrom and marbles keep going while you score. The lab shows this is the biggest single lever in the game: with no limit, the longest streak averages 15 flicks. |
| Transfers | instead of flicking, send soldiers from one of your bases to another; they arrive after your opponent's next action | Canon (Dawood): transfers exist and arrive after the opponent's next strike |
| How many per transfer? | up to 5; the base they leave keeps at least one | **Guess** |
| Vulnerable on the road? | yes: an enemy line that crosses the road while they're on it kills the whole convoy | **Guess.** It makes the road a real risk, and short hops safer than long hauls. |
| Does "the opponent's next strike" include a transfer or a pass? | yes, any action | **Guess** |
| Move length | the same range as a shot | Canon (Burooj) |
| Line length | 300 to 1800 on a 1000 × 1700 page, by how hard you flick | **Guess.** The prototype's 700 floor on shots was lowered so a soft flick is possible for both kinds. The lab found this barely matters. |
| A move's line kills | yes | Canon (Burooj) |
| A line crossing several enemies | kills them all (a line is a line) | **Guess.** Pierce limits were tested. |
| Friendly fire | no | **Guess** |
| A move off the page | the soldier is lost | **Guess** |
| Drawing bases | alternately, one at a time, not too near an enemy base | Recalled (Burooj), gap sizes guessed |
| Who flicks first | whoever drew the first base | **Guess.** The lab measured the first-move advantage. |
| Winning | cross out every enemy soldier | **Guess** (it could have been "destroy every base"; see siege) |
| One flick wipes out both sides | the flicker wins: his line lands before he runs off the page | **Guess** |

## Evolved rule sets (invented in the rules lab)

The four evolved sets share one foundation. Both parts of it are **invented**:

- **A streak stops after two extra flicks.** A kill still earns another flick, but with no limit the simulations show one player often taking about 15 flicks in a row.
- **The opening turn of the game can't earn an extra flick.** This softens the first-move edge.

Transfers work as in classic. Numbers are from 2,000 bot-vs-bot games per set; the full table is further down and the raw summaries are in [docs/rules-lab/data/](docs/rules-lab/data/).

### Last stand (recommended)

When a side is down to **4** soldiers, its survivors are circled where they stand and "last stand!" is written in the margin. From then on that side **flicks twice every turn, with a steadier hand**: the hidden error drops by 40%, and the engine never lets it reach zero. *(Burooj's idea: "they lost their comrades". The numbers are invented.)*

The data backs the "fight harder" half of Burooj's idea over the "harder to kill" half. Two flicks and a steadier hand raise comebacks and shorten the hunt. Making survivors take two hits (tried: wounds drawn as one stroke of a cross) or drawing them bigger made the endgame drag instead, so those stay as options (`lastStand.hits`, `lastStand.grow`) but aren't in this set.

### Geometry set

Each player draws **2 camps** (circles, 10 dots), **a fort** (square, 8), **a mirror** (hexagon, 8) and **a prism** (triangle, 6), in any order, choosing the shape at the bottom of the screen. Polygons are drawn by hand like everything else. *(Burooj: shaped bases with properties. Earlier sessions: fewer, stronger soldiers; a prism that splits a line; walls. The properties and numbers are invented.)*

- A **fort's** wall stops an enemy line dead, once. The crack stays drawn and that wall is open from then on.
- A **mirror's** wall bounces an enemy line away, once, and is then cracked.
- **Your own** line leaving **your own prism** splits in two.
- Your own walls never stop your own lines.

### Wet ink

The newest line in each colour is still **wet**, and it shines a little. Your line hitting **your own** wet line bounces off it; hitting **theirs**, it stops dead. Older lines have dried: they stay on the page but don't get in the way. *(Burooj: lines as walls and reflections. Earlier sessions: your own ink reflects, enemy ink blocks. Invented: only the newest line counts. Counting every line choked the page: 12–46% of simulated games stalled.)*

### Siege

- **A base with none of your soldiers standing in it has fallen.** Leave the enemy no standing base and you win; dots in the open don't keep you alive. *(Guess about the canon's "a base whose soldiers are all dead is gone" plus earlier sessions; the win condition is invented.)*
- **Move a soldier into a fallen base, anyone's, and it's yours.** It's circled again in your pen. *(Earlier sessions: capture.)*
- **Send before your flick, once a turn, without spending the flick.** *(Invented: when a send costs your flick, nobody ever sends; see the questions below.)*

### Fairness and length at a glance

From 2,000 bot-vs-bot games each, with a human-like shaky hand:

| rule set | turns | 1st-player wins | kills/flick | comebacks when well ahead at half-time | endgame (flicks once a side has ≤3) | longest streak |
|---|---|---|---|---|---|---|
| Prototype (June) | 62.6 | 52% | 0.90 | 14% | 20.0 | 1.0 |
| Dawood classic | 9.5 | 54% | 1.80 | 25% | 7.8 | 14.7 |
| Last stand | 21.3 | 46% | 1.74 | 21% | 8.7 | 4.0 |
| Geometry set | 27.9 | 48% | 1.26 | 16% | 8.8 | 3.0 |
| Wet ink | 26.5 | 50% | 1.58 | 10% | 10.7 | 3.0 |
| Siege | 22.3 | 46% | 1.70 | 18% | 3.6 | 3.4 |

## Every option

The engine's options, grouped. Each is a field on `RuleSet` with a comment in [src/rules.ts](src/rules.ts).

| Option | What it does | Where from |
|---|---|---|
| `basesPerPlayer`, `soldiersPerBase` | how many | Canon (Dawood) |
| `kit`, `shapes` | shaped bases: which shapes each player draws, and what each does (soldiers, size, walls, prism) | Burooj (shapes existed), invented (properties) |
| `shoot`, `move` | line length range | Canon (Burooj): the same for both |
| `moveKills` | a move's line kills | Canon (Burooj) |
| `pierce` | how many soldiers one line can cross out before it stops (0 = all) | Earlier sessions |
| `friendlyFire`, `offPageMoveKills` | as named | Guesses |
| `extraTurn`, `chainCap` | none, once per turn, or chained (with an optional cap) | Canon (the extra flick) plus lab variants |
| `transfer` (`max`, `ambush`, `free`) | sending soldiers between bases; ambush kills none, one per crossing, or the whole convoy; `free` means sending doesn't use up your flick | Canon (Dawood) plus invented details |
| `win` | `soldiers` (cross out every one) or `bases` (leave the enemy no standing base) | Guess / invented |
| `capture` | a soldier who moves into a fallen base re-founds it for his side | Earlier sessions |
| `lastStand` (`at`, `hits`, `steady`, `shots`, `grow`) | when a side is down to a few, its survivors take more hits, aim steadier, flick more, or are drawn bigger | Burooj |
| `ink` (`friction`, `ownBounces`, `enemyStops`, `edgeBounces`, `clear`, `fresh`) | lines as terrain: dried ink drags on a line, your own ink bounces it, enemy ink stops it, the page edge bounces it; `fresh` counts only each player's newest lines (wet ink) | Burooj (lines as walls and reflections), earlier sessions (friction, own ink reflects, enemy ink blocks), invented (wet ink) |
| `firstFlick`, `openingExtra` | who flicks first once the bases are drawn; whether the opening turn can earn an extra flick | Invented (fairness) |
| `prismSpread` | angle between a split line's halves | Invented |

## Questions for Dawood

1. **When you crossed someone out and flicked again, did it keep going for as long as you kept killing?** This decides more than any other rule. With no limit, simulated games average 9.5 turns, with a 15-flick streak in each. Capped at two extra flicks, they run to about 21 turns with streaks of 3–4.
2. **When did you actually send soldiers to another base, and what did it get you?** As guessed (instead of your flick, arriving after the opponent's next go), the bot never finds it worth doing. A kill earns another flick, so giving up a flick costs about two. Was sending free? Did arrivals fight at once? Did something make keeping a base alive matter?
3. **How did the game end: every soldier dead, or every base?** "A base with no soldiers is gone" suggests bases mattered. Winning by bases (Siege) has by far the shortest endgame.
4. **Could soldiers on the road be killed?** All of them at once, one per line, or none?
5. **Was there a limit on how many you could send at once?**
6. **What happened when a flick went off the page?** Was a moving soldier lost?
7. **Did one line cross out everything it touched, or stop at the first dot?**
8. **Could you hit your own soldiers?**
9. **Who went first, and did the second player get anything for it?** Moving first is worth about 54–58% in simulation.
10. **The complicated-units variant:** what did multi-hit and multi-shot units look like, and how were they marked?

## Questions for Burooj

1. **Last stand:** a rule you remember, or an idea? The data backs the "fight harder" half (more flicks, a steadier hand) over the "harder to kill" half (two hits).
2. **Shaped bases:** do you remember specific shapes and what they did? The Geometry set's properties are invented.
3. **"Sides of the page":** did lines bounce off the page edge, or did each player own a side? (Edge bounces are available as `ink.edgeBounces`. They were the fairest single change tested, and halved soldiers lost off the page.)
4. **Is a streak cap of two faithful enough** to how it felt, or was the long streak the point?

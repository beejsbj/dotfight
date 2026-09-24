# Rules (from memory, pending Daud)

The source is Burooj's description of Daud's pen-and-paper game (ChatGPT, 2026-06-07, "Flick-line strategy game"). Nothing here is canonical until Daud reviews it ([BJS-128](https://linear.app/bjs-projects/issue/BJS-128/reconstruct-the-canonical-ruleset-with-daud)). Every value below is in `src/rules.ts`.

## What the prototype plays

1. Each player has a coloured pen: blue and red.
2. Players take turns drawing bases (circles) on the page, 3 each. Each base holds 10 soldiers (dots).
3. On your turn, one soldier acts: **shoot** or **move**. Both are flicks, not drawn lines.
4. **Shoot:** the line runs almost to the end of the page. Every enemy dot it crosses is crossed out in the shooter's ink. The shooter stays put.
5. **Move:** a shorter line. The soldier ends up where the ink stops. His old dot is crossed out in his own ink. The movement line also kills enemies it crosses.
6. The page keeps everything: lines, crosses, old positions.
7. Cross out every enemy soldier to win.

## Recalled with some confidence

- Pens, not pencils: the slide of the ballpoint mattered.
- Bases were drawn one at a time, alternating.
- 10 dots per base.
- Shoot vs move; a shot doesn't move the soldier.
- The flick: the pen balanced on the page, flicked with the other hand. You can't just draw a line.
- A cross in the enemy's colour means killed. A cross in your own colour means moved.

## Guesses the prototype had to make (ask Daud)

| Question | Prototype default | `rules.ts` |
|---|---|---|
| How many bases each? | 3 | `basesPerPlayer` |
| One soldier per turn, or more? | one | (turn loop in `game.ts`) |
| Can you build a base right next to an enemy? | no, 180 units apart | `minEnemyBaseGap` |
| Does a movement line kill? | yes | `moveKills` |
| Does a shot stop at the first body, or go through? | goes through | `shotPierces` |
| Can you hit your own soldiers? | no | `friendlyFire` |
| What happens if a move flicks off the page? | soldier is lost | `offPageMoveKills` |
| How long is a shot, really? | 700–1800 on a 1000×1700 page | `shootMinLen`, `shootMaxLen` |
| How far can a move go? | 60–380 | `moveMinLen`, `moveMaxLen` |
| Could bases be destroyed, or make new soldiers? | no | — |
| Soldier or base types, and powers ("move base to base")? | none yet | — |
| Who goes first after setup? | whoever drew the first base | — |

## Not in the paper game, added for the screen

- A slight hidden angle error on release and a visible tremble if you hold a hard flick. These stand in for the physical unreliability of a real flick.
- Close-up aim: the camera zooms onto your soldier while you aim, so you can't see the whole page. This is the "limited perspective" idea from the seed.
- Daud-bot, a computer opponent.

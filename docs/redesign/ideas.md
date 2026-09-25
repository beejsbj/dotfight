# Rules ideas for Burooj and Dawood

None of these are implemented. The redesign changes how the game looks and feels, not what happens: `game.ts` and `RULES` are exactly as they were. These are pitches, ordered by how well I think they fit the paper game. Each notes whether it can still be played with a real pen on real paper, because that is the test that matters.

## Ones that grow out of the page itself

**1. Ink is a wall.** A line already on the page stops a *move* that tries to cross it: the soldier halts at the ink, the way a pen tip catches on a ridge of dried ballpoint. Shots still go through. The page then gets more tactical as it fills up: early game is open field, late game is trenches. It rewards the "nothing is ever erased" soul of the game, because every past line keeps mattering.
*Paper test:* yes. "Your line stops where it touches mine."

**2. Scars as cover.** A soldier standing inside a cluster of crossed-out dead (say three crosses within a dot's width) can't be killed by a *move* line, only by a shot. The dead become sandbags.
*Paper test:* yes, and it makes the crosses you leave behind into terrain.

**3. The margin ricochets.** A shot that meets the red margin line bounces off it once instead of running on. That's Burooj's "square bases bounce lines" seed, but using the one straight edge every page already has. It opens bank shots at soldiers hiding behind their own camp.
*Paper test:* hard (you'd have to flick again from the margin), so maybe digital-only, or "flick again from where it hit".

## Base shapes (Burooj's seed)

**4. Circle, square, triangle.** Each player draws one of each instead of three circles:
- **Circle:** as now.
- **Square:** its walls bounce any enemy line that hits them (ink ricochets once, off the wall).
- **Triangle:** soldiers in it may *move* twice as far, but the camp holds only 6.

The shape is part of your setup decision and part of what your opponent aims at.
*Paper test:* yes, if bounces are judged by eye ("it hit the square, flick again from there").

**5. Camps can fall.** When a camp is empty (all crossed out), the enemy may draw a flag in it and gets one extra soldier dot there. That's a small comeback and a reason to raid rather than snipe.

## Soldiers

**6. The officer.** One dot per camp is drawn bigger (a filled circle, not a dot). Crossing him out needs two hits. If he dies, that camp's soldiers can only *move* on their next turn: they're rattled.
*Paper test:* yes; that's how kids invent units anyway.

**7. Runners.** A soldier who *moved* last turn is tired: he can't shoot this turn. It stops one soldier dashing and shooting in alternation and makes the moved-cross in your own colour mean something.

## The pen as a resource

**8. The pen runs dry.** Each player has a fixed length of ink for the war (the redesign already shows it: the refill level on each name tag). Long shots cost more. When you're dry, you can only move. It turns the flick's power into a spending decision: a full-power shot across the page is expensive.
*Paper test:* no (you can't really measure ink), but it's the most "digital-native" honest idea here.

**9. Two pens.** Each player owns a ballpoint (as now) and one *gel pen* flick per game: the gel line is wider (hits more), but it smudges if you move through it later. One per war, so it's an event.

## Tempo and async

**10. One flick a day.** Burooj's async seed. The page is posted back and forth (a share link with the filed record: seed, camps, flicks; the drawer already stores exactly that). Each post adds one flick. Nothing new is needed in the engine: `record.ts` can already replay any page from its record.

**11. The last-stand rule.** When a player is down to three soldiers, they may flick twice per turn. It makes endgames swing instead of slowly bleeding out, and games at the moment can run 60 to 100 turns.

## Questions the redesign made me want to ask Dawood

- When a flicked pen fell over, did it matter where it landed? (The redesign has the pen fall flat at the end of its line. If the fallen pen crossed dots too, that's a rule waiting to be remembered.)
- Did you ever play with the page turned, each of you from your own side of the desk? The pass-and-play view now spins the sheet round to face whoever's turn it is.
- Were there "no man's land" rules, like camps not allowed in the middle band? The keep-out rings in setup currently come only from `minEnemyBaseGap`.

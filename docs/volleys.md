# Volleys: one, two, three, flick!

A prototype, not canon. Nothing here is Dawood's or Burooj's decision yet; every rule and number is **(to test)**.

## Why

The tabletop real-time prototype (PR #42: one phone flat between two players, an ink meter, wet ink) lost three things Burooj cares about: the lean in (the camera dropping low behind your soldier to aim), a page close enough to read, and the extra flicks and sends that make Dawood's game. A shared screen took the lean in, and a meter turned the game into waiting out cooldowns.

Volleys keep the game's deliberation and everything in it, and remove only waiting for your turn. Both pens aim in secret, then both lines go down at once, and two men can cross each other out. That is how kids play at the same time on paper: "one, two, three, flick!"

## Turning it on

Settings → **Experiments** → **volleys: both flick at once**. It is saved under `pft:volleys`. With it on, **pass & play** and **play Dawood-bot** start their games in volleys. The cover still offers only Quick battle and Long war, and writes "volleys" under the two buttons it changes. It applies to a quick battle's sizes (Quick, Classic, Custom). A long war chosen with the setting on is still played by turns (see "Left out"). Shared-link rooms are never volleys. The setting only decides how new games start: a game keeps the rules it began with, so turning it off doesn't change a war already on the page.

## The rules as built

Setup and positioning are unchanged. Then play is in **volleys**.

1. **A volley.** Each side picks one turn's worth in secret: an optional **send**, then a **snipe or a lunge**, the same choices as a normal turn. Then every line is traced against **the page as it stood when the volley began**, and they all go on the page at once.
2. **Mutual kills.** A man crossed out by the enemy's line in the same volley still gets his own line off. Two snipers aimed at each other both fall.
3. **A lunger crossed out as he goes** is crossed out where he stood, which is where the enemy's ink found him. His run is still drawn and its kills still stand, but he doesn't stand at the end of it, and he earns nothing.
4. **Enemy ink only finds a lunger where he set off**, never where he lands. Lines are traced against the start of the volley, so nobody's line knows where anyone else's man is going.
5. **Lines never meet lines.** Two lungers can cross paths and both run on.
6. **Landing among men who fall in the same volley.** If a lunger lands in an enemy base whose men were home when the volley began, they shoot him. This holds even if they were crossed out in the same volley (by his own side's other line, in a last stand), or were lunging out of the base, or were in this volley's send. They fire as they fall.
7. **A man two lines cross out** (a last stand's two lines) gets one cross, drawn by the first line. Each line still counts him toward its own extra flick.
8. **Extra flicks, taken right after.** A snipe that takes two, or a lunge that kills and lives, earns its side an **earned run**: ordinary flicks right after the volley, as many as were earned, chained the way they are in a turn (a lunger who kills again lunges on, shakier each link, or stops). If both sides earned, **the side that aimed second runs first**, then the other side. Who aims first alternates, so neither colour is favoured. A run has no send, because the send went with the volley.
9. **Sends.** A send planned in a volley takes the men nearest the road, never a man drawing a line in that volley. They stay home through the volley they were sent in (where they can be hit like anyone at home), walk out when it's over (after any earned runs), stand on the road through **the next volley** and its runs, and arrive when that volley is over. That is one volley of exposure, the same as one enemy turn in the turn game.
10. **Last stand.** A side down to its last four draws **two lines a volley**, by two different men, both aimed at the start of the volley and both going at once with the enemy's line. It keeps the steadier hand from the turn game.
11. **Winning.** Cross out every enemy soldier. **A volley that crosses out both sides' last men is a draw**: it is filed in the drawer, which reads "a draw", and the morning card says "Nobody held the page: a draw."
12. **Who aims first.** Blue aims first in the first volley. After that, whoever last held the pen aims first: on one phone, the player still holding it after the last volley's lines (or the last earned run) goes first, so the phone changes hands once a volley.

### Choices made, and why

- **One clock for everything ("the page at three").** The awkward cases (two lungers, a landing base shot empty in the same volley, a convoy sent in the same volley) all follow from a single rule: every line is judged against the page as it was when the volley began, and nothing a line does changes another line. It's the simplest rule a player can check by looking at the page, and the order of resolution can't favour a colour, because there is no order.
- **Extra flicks after the volley (model a), not banked into the next one (model b).** An earned flick is a reward you want to take now, while you can see what your line did. A lunge chain has to feel like a chain: the same man, again, right away, shakier. Banking it into the next volley would make lunge-on a blind second line aimed at a page that's about to change, and the chain would come apart across volleys. Model (a) also reuses the turn game's own machinery for runs, so chains, "stop here", tremor and the last stand behave exactly as they do there. The cost is a short wait while the other side takes its run. That wait has been earned, and it's usually one flick.
- **The side that aimed second runs first** when both earned. It holds the phone, so there's no extra pass, and who aims second alternates.
- **One line per man per volley** (a last stand's two lines need two men), so nobody runs two ways at once.
- **Draws** only come out of a volley. Earned runs are sequential, so as in the turn game, whoever crosses out the last man wins.

## How it plays on the page

- **Pass & play (one phone).** The first player aims with the whole normal experience: pick up a man, the camera leans in, slide to turn the page, pull down and let go. The line isn't drawn. It goes into a hidden plan, the pen lifts away, and the camera stands back up. Every layer is redrawn whole at that point, so no stray pencil pixel of the aim is left. The page then turns to the other player behind a **no-peek card** ("Blue has aimed, in secret. Your pen, Red. Blue: pass it over, no peeking."). The card shows every time, whatever "pause between turns" is set to. The second player aims the same way. Then **"one, two, three!"** is written in pencil across the middle of the page, each word on its beat with a tick under the thumb, and every line starts at once from its own pen. Each kill lands as its own ink head reaches the man. While you aim, your own planned send is pencilled on the page for you alone. The other player never sees it, because the plan isn't part of the page until "three!".
- **Against Dawood-bot.** The bot makes its plan at the start of the volley, from the page as it stands, before you've aimed. It sees nothing of your plan. Then you aim, the count comes, and both lines go. Its earned runs are its ordinary moves.
- **Replay and the drawer.** A volley replays as both lines at once. Earned runs replay as flicks.
- **Reduced motion.** The count is written all at once and lasts half a second. **Slow phones** take the same path as a flick.

## Engine and record

- `rules.volley` (the `VOLLEY` block in `src/rules.ts`) is null in every game played by turns and in every record made before volleys. A long war never plays in volleys. A test pins that a core war never takes a volley path, and the core-4 fixture still replays hash for hash.
- A volley is **one action**: `{ t: "volley", a: Plan | null, b: Plan | null }`, where `a` is blue's plan and `b` is red's, and each `Plan` is `{ send?, flicks: Flick[] }` with every flick's randomness already resolved. A game is still seed + camps + actions, and replays exactly. Earned runs are ordinary `flick` and `stop` actions.
- `GameState.vol` says where the page is: `aim` (waiting for the volley, `first` aims first) or `follow` (a side's earned run, with the other side's run waiting in `then`). `GameState.drawn` marks a draw.
- **Record format v3.** A game of volleys files as record `v: 3`, which has the same shape as v2 but can hold `volley` actions, so older copies of the game skip it instead of replaying it by the wrong rules. v1 and v2 pages and saves load as before. PR #42 also uses v3 for its real-time records, with the same meaning: "not played by turns". If both land, the v3 reader should accept both. A drawn page also carries `drawn: true`.
- Pure and tested in `src/volley.test.ts`: gating, mutual kills, the lunger who falls, lines that never meet, landings among men who are leaving or falling, earned runs (one side, both sides, lunge-on), sends on the road for exactly one volley, last stand lines, draws, the bot's plan, and whole bot-v-bot volley wars replaying mark for mark from their records.
- Page: `src/volley.ts` holds the `Draft` (each side's plan while it's aimed) and `botPlan`. `src/main.ts` holds the flow (`volleyNext`, `takeLine`, `takeSend`, `volleyGo`, `fireVolley`) and `land()`, which `fire()` now shares: one line, or several on one ink clock. `src/scene.ts` draws extra `pens` and `movers`, and the pencil count (`teach.kind = "count"`). `src/boil.ts` holds several riders off the page at once.

## What to feel for at the table

- Does aiming in secret feel like a duel, or like waiting for your friend to finish? Is a pass per volley too much on one phone?
- Do mutual kills feel fair and funny ("we got each other!"), or cheap?
- Does "the page at three" read? When a lunger runs off and the enemy's line crosses the empty spot where he stood, and he's crossed out there, does anyone mind?
- Do earned runs after the volley keep the excitement of two-for-one and lunge chains, or does the wait break the rhythm? Would banking (model b) be better after all?
- With both sides shooting at once, do men still stay behind walls, or does it turn into a shootout in the open?
- Is a convoy still a fair target, out for one volley?
- Is the last stand's second line, aimed blind at the same page, worth as much as it is in the turn game?
- Is the "one, two, three!" beat the right length? (`COUNT` in `src/rules.ts`.)

## Left out, and why

- **The long war.** Its convoys walk on a turn's clock, in real time while the pen is in hand, and two secret aims one after the other have no shared clock. The well, grooves and prism would work as they are, but "where is the convoy when the line goes?" has no answer yet. Quick battle sizes only.
- **Rooms (a shared link).** Each phone would have to send its plan sealed, and the server would reveal both at once. That's room-protocol work (BJS-457), and a v3 room would need its own engine name.
- **Changing your mind.** A line, once released, is in the plan. There's no "take it back" before the pass, and no "hold fire" button (a side that can't flick at all holds fire automatically). Same as the turn game, where a release is final.
- **Closing the app mid-volley.** The plans live only on the page. Resuming starts the volley's aiming over (the page itself is safe).
- **The camp's jabs** (soldier life) play for only one lunger shot where he lands per volley. A second one that volley gets the plain cross.
- **Hit-stop.** Two lines share one ink clock, so a kill on one line hitches both for its beat. Felt right in the playtest captures, but it hasn't been tried on a phone.
- **Draws in the signature.** A drawn page has no signature line at the foot.
- **The tutorial and rulebook pages** say nothing about volleys yet. Neither does `RULES.md`: this is a prototype, and rule decisions are Burooj's.

// Pencil notes: now and then, a soldier (or a whole camp) says something in writing.
//
// A word or two pencilled on the page in a gap beside the man who said it, in
// his side's colour, with a speech tail to him and a loose pencil ring round
// his dot so you can tell who from bird's-eye. The big stuff (battle cries,
// chants, a camp shooting an intruder, the last stand, the win) comes from a
// camp instead: written arcing along its ring, so the speaker is obvious from
// above. Rare on purpose: one on the page at most (an exchange is two men,
// each line at its own man's far side from the other, the answer a beat after
// the question), a long gap between them, and most chances pass. Seeded,
// cosmetic, never game state.
//
// Each line has a mood, and each mood its own hand: tiny (only caught leaning
// in), whisper, say, shout (big, stretched, scrawled, a spiky burst), chant
// (from a camp, in beats). Lines grow with the war: "for Dawood!" early,
// "fooor Dawooood!" once the crosses pile up.
//
// It's pencil, not ink: written stroke by stroke on the same sheet, read, then
// rubbed out with an eraser (a scrub that lifts it, a smudge, a few crumbs),
// so the append-only page never keeps it and a long war isn't cluttered with
// talk. It only redraws while being written or rubbed out, on the 12 fps grid,
// or while the camera moves.

import { distToPath, pathLen, type Pt } from "./geom";
import { LIFE, unit } from "./life";

export type Mood = "tiny" | "whisper" | "say" | "shout" | "chant";
export type BubbleKind =
  // a man
  | "ready" | "aim" | "phew" | "dread" | "kill" | "mourn" | "send" | "arrive"
  | "idle" | "idleUp" | "idleDown" | "ponder" | "tired" | "banter" | "shapes" | "paper" | "home" | "afield" | "clock" | "wait" | "tiny" | "chat"
  // a camp
  | "last" | "win" | "lunge" | "snipe" | "deny" | "chant" | "chantLast"
  // a streak (chained lunges, or snipes that keep earning): the streaker, the enemy man next in line; his home camp, the camp he's tearing through, its relief when he stops
  | "streakMe" | "streakFoe" | "streakCamp" | "streakFoeCamp" | "streakEnd"
  // a botch (the shooter's embarrassing miss): the flicker, his own camp, the enemy man or camp; and a sly callback on the other side's next go
  | "botchMe" | "botchCamp" | "botchFoe" | "botchFoeCamp" | "botchBack";
export type Anchor = "man" | "base";
export type StreakKind = "streakMe" | "streakFoe" | "streakCamp" | "streakFoeCamp" | "streakEnd";
export type BotchKind = "botchMe" | "botchCamp" | "botchFoe" | "botchFoeCamp" | "botchBack";
/** A line: bare, or with its own mood, a longer form for late in the war, a reply (an exchange), or written slowly (`slow`: its writing takes this many times as long). */
type Line = string | { t: string; mood?: Mood; late?: string; reply?: string; slow?: number };

export const BUBBLE = {
  /** At least this long between one note and the next (ms); a shout or chant may come sooner. */
  gapMs: 11000,
  loudGapMs: 5000,
  /** On the page this long, all told (ms): written, read, rubbed out. Shouts are written faster and read longer. */
  timing: {
    tiny: { showMs: 2600, writeMs: 700, eraseMs: 640 },
    whisper: { showMs: 2400, writeMs: 620, eraseMs: 720 },
    say: { showMs: 2500, writeMs: 560, eraseMs: 720 },
    shout: { showMs: 2900, writeMs: 420, eraseMs: 760 },
    chant: { showMs: 3400, writeMs: 1100, eraseMs: 800 },
  } as Record<Mood, { showMs: number; writeMs: number; eraseMs: number }>,
  /**
   * An exchange is two beats: the first line is written and read on its own,
   * then the answer comes (`replyMs` after it starts). The first is held
   * `holdMs` longer than a lone line so the two are read together, and it's
   * rubbed out a moment before the answer (`replyHoldMs`).
   */
  exchange: { replyMs: 1150, holdMs: 1250, replyHoldMs: 450 },
  /**
   * A botch: how often a mild one (1) and a spectacular one (2) is remarked on;
   * how soon after the last note it may come (ms); and, on the other side's
   * next go, the chance each stray-thought window brings the callback.
   */
  botch: { chance: [0, 0.45, 0.9], gapMs: 4000, backChance: 0.6 },
  /** Stray thoughts: a chance this often (ms), on your go while nothing's happening. */
  idleEveryMs: 8000,
  idleChance: 0.2,
  /** A wait this long (ms) since the last move brings yawns and crickets, more often. */
  longWaitMs: 25000,
  /** The grid it animates on: hand-drawn, on twos. */
  fps: 12,
  /** Lines take their late form from this much heat (0..1: turns, crosses, last stands). */
  lateFrom: 0.5,
};

/** Each moment's usual mood and where it's written from; a line can say otherwise about the mood. */
export const MOOD: Record<BubbleKind, Mood> = {
  ready: "say", aim: "whisper", phew: "say", dread: "whisper", kill: "say", mourn: "whisper", send: "say", arrive: "say",
  idle: "say", idleUp: "say", idleDown: "whisper", ponder: "whisper", tired: "whisper", banter: "say", shapes: "say", paper: "say",
  home: "say", afield: "whisper", clock: "say", wait: "tiny", tiny: "tiny", chat: "say",
  last: "shout", win: "shout", lunge: "shout", snipe: "shout", deny: "shout", chant: "chant", chantLast: "chant",
  streakMe: "say", streakFoe: "whisper", streakCamp: "say", streakFoeCamp: "say", streakEnd: "say",
  botchMe: "whisper", botchCamp: "whisper", botchFoe: "say", botchFoeCamp: "say", botchBack: "say",
};
export const ANCHOR: Record<BubbleKind, Anchor> = {
  ready: "man", aim: "man", phew: "man", dread: "man", kill: "man", mourn: "man", send: "man", arrive: "man",
  idle: "man", idleUp: "man", idleDown: "man", ponder: "man", tired: "man", banter: "man", shapes: "man", paper: "man",
  home: "man", afield: "man", clock: "man", wait: "man", tiny: "man", chat: "man",
  last: "base", win: "base", lunge: "base", snipe: "base", deny: "base", chant: "base", chantLast: "base",
  streakMe: "man", streakFoe: "man", streakCamp: "base", streakFoeCamp: "base", streakEnd: "base",
  botchMe: "man", botchCamp: "base", botchFoe: "man", botchFoeCamp: "base", botchBack: "man",
};

const shout = (t: string, late?: string): Line => ({ t, mood: "shout", late });
const whisper = (t: string): Line => ({ t, mood: "whisper" });
const tiny = (t: string): Line => ({ t, mood: "tiny" });
const say = (t: string): Line => ({ t, mood: "say" });
const grow = (t: string, late: string): Line => ({ t, late });
const chat = (t: string, reply: string): Line => ({ t, reply });
const chant = (t: string): Line => ({ t, mood: "chant" });

/**
 * What the men say, by moment. Schoolboy war; Dawood invented the game and
 * they know it. `{me}` and `{them}` are the sides' pen names on this paper
 * ("Blue", "Red", "White", "Yellow", "Lead", …); `{paper}` is the paper's name.
 */
export const LINES: Record<Exclude<BubbleKind, StreakKind | BotchKind>, readonly Line[]> = {
  // picked up
  ready: ["I'm ready", "ready!", "me?", "ok!", "finally", "pick me!", "right then", "here we go", "oh. me.", "again?", whisper("be gentle"), "put me down", "I was napping", "at last"],
  // aimed with (the pull held)
  aim: ["steady…", "hold still", "don't miss", "a bit left", "a bit right", "for the camp", "I can see him", "not too hard", "deep breath", "you've got this", "aim for the big one", tiny("I'm scared"), "don't sneeze"],
  // a near miss
  phew: ["phew", "phew!", "close one", "that was close", "my hat!", "oi!", "missed me", "rude", "hey!", shout("HEY!"), "I felt that", "watch it", "so rude"],
  // a pen pointed at him
  dread: ["!", "!!", "eep", "not me not me", "mum?", "oh no", "gulp", "why me", "I have a family", "…", tiny("please no"), "I'm too round to die", "he's looking at me"],
  // the shooter, his kill landed
  kill: ["got him!", "yes!", "down!", "ha!", grow("for Dawood!", "fooor Dawooood!"), "another one", "sorry mate", "did you see that?", "one for the book", shout("YES!"), shout("got him!"), "nothing personal", "tell Dawood"],
  // a campmate crossed out beside him
  mourn: ["no…", "he owed me lunch", "we'll remember him", "…", "he was so young", "who'll tell his mum", "Dawood, why", "avenge him", "that was my bunk mate", "he had a sandwich", "he never learned to snipe", tiny("not him")],
  // marching off
  send: ["off we go", "left, left", "are we there yet", "march!", "bye camp", "wait for me", "I hate walking", "single file", "keep up", "did anyone pack lunch", "where are we going"],
  // arriving in a camp
  arrive: ["made it", "we're here", "budge up", "room for one more?", "nice camp", "tea?", "what did we miss", "is this the front?", "smaller than I thought", "hello new camp"],
  // stray thoughts on your go
  idle: [grow("for Dawood!", "fooor Dawooood!"), "mum?", "hold the line", "…", "not me", "hm", "is it lunch?", "I spy…", "whose go is it?", "is Dawood watching?", "my feet hurt", "anyone got a rubber?", "what's the plan", "dot dot dot", "I need a wee", "did we win yet", "who drew me", "is this a test", "ready when you are", "I'm bored", "left or right?", "is that a smudge", "I've got a pen mark", "ooh, a fly"],
  // stray thoughts, well ahead
  idleUp: ["easy", "too easy", "they've got no chance", "Dawood would be proud", "can we go home yet", "we're so good", "look at them", "who's winning? us", "…", "is it lunch?", "this is going well", "I could do this all day"],
  // stray thoughts, well behind
  idleDown: ["we're losing aren't we", "can we go home", "Dawood wouldn't like this", "I miss camp", "don't tell mum", "is there a plan?", "…", "hm", "we can still do this", "ask Dawood for help", tiny("I'm not crying"), "why do we bother"],
  // existential pondering
  ponder: ["why are we dots", "who holds the pen", "am I the ink or the page", "what's past the margin", "when the page turns, do we", "do dots dream", "is the lamp god", "who erases us", tiny("is any of this real"), "I think, therefore I'm a dot", "the grid goes on forever", "what did the cross feel"],
  // fatigue and cowardice
  tired: ["I'm knackered", "can I sit down", "my legs", "five more minutes", "let someone else go", "I've done my bit", "hide me", "I'll be at the back", "not it", "I've got a note from mum", tiny("zzz"), "is it home time", "I'm too tired to lunge"],
  // banter and insults at the other side
  banter: ["oi {them}!", "{them} can't aim", "{them}'s scared", "your camp's wonky", "nice miss {them}", "come and get us", "we've got more men", "who drew you", "{them} smells", "run home {them}", "is that your best?", "{them}'s pen leaks", "you missed. again."],
  // jokes about shapes and colours
  shapes: ["{them}'s a sad colour", "why are we dots", "at least I'm round", "he's a bit oval", "I'm more of a blob", "{me} is the best colour", "we're all the same shape", "a cross is just two lines", "I've got a good side", "I'd rather be a square", "who chose {me}", "is {them} even a colour"],
  // the paper they're on (by theme id; "any" for the rest)
  paper: ["is this graph paper?", "the lines are a bit close", "I liked the last page better", "this page smells new", "mind the margin", "somebody's drawn on this", "which page are we on", "don't turn it yet"],
  // inside a camp ring
  home: ["cosy in here", "the ring holds", "don't leave camp", "home sweet camp", "who's on watch", "budge up", "it's warm in the ring", "nobody gets in", "safe as houses"],
  // out in the open
  afield: ["it's cold out here", "I'm very alone", "can I come back in", "no cover out here", "they can all see me", "who put me here", "it's quiet. too quiet", tiny("mum"), "long way from camp"],
  // the user's time of day (by hour; "any" for the rest)
  clock: ["what time is it", "is it lunch yet", "shouldn't you be somewhere", "one more turn", "the lamp's still on"],
  // a long wait: yawns, coughs, crickets
  wait: ["…", "*cough*", "*crickets*", "*yawn*", "zzz", "*ahem*", "hello?", "anyone there?", "…?", "*tumbleweed*", "still here", "*scratches*"],
  // tiny whispers, only caught leaning in
  tiny: ["psst", "I like you", "don't tell", "I'm scared", "he's cute", "is it me or", "shh", "I hid a sweet", "I can't feel my dot", "I miss Dawood", "the pen is huge", "I've never lunged"],
  // an exchange: a line and a nearby comrade's reply
  chat: [chat("what's the plan", "no idea"), chat("you alright?", "no"), chat("is it lunch?", "it's always lunch"), chat("who's Dawood?", "the boss"), chat("did you see that", "I saw nothing"), chat("I'm going to lunge", "don't"), chat("cover me", "with what"), chat("are we winning", "define winning"), chat("I spy…", "a dot"), chat("nice weather", "it's a lamp"), chat("psst", "what"), chat("hold the line", "which line"), chat("left or right", "yes"), chat("scared?", "obviously"), chat("this page is nice", "it's fine"),
    chat("I've got a plan", "oh no"), chat("any sweets?", "one. mine."), chat("what if we lose", "new page"), chat("we're outnumbered", "count again"),
    chat("my feet hurt", "you're a dot"), chat("is this the front?", "it's all front"), chat("where's Dawood?", "holding the pen"), chat("we're winning!", "don't jinx it"),
    chat("any last words?", "lunch?"), chat("you blinked", "I don't have eyes"), chat("shall we sing?", "please don't"), chat("I think I'm smudged", "suits you"),
    chat("tell my mum", "tell her what"), chat("they're coming", "they're dots"), chat("did he miss?", "he always misses"), chat("why are we round", "ask the pen"),
    chat("is that a cross?", "don't look"), chat("whose go is it", "not ours"), chat("I'm knackered", "you've not moved"), chat("{them} look scared", "so do you"),
    chat("do erasers hurt?", "shh"), chat("I'll go first", "after you")],
  // the last few (from their camp)
  last: ["hold the line!", "to the last!", "we few", "it's just us", grow("for Dawood!", "fooor Dawooood!"), "not like this", "stand fast!", whisper("it's been an honour"), "they shall not pass", "remember the camp"],
  // the war is won (from the winners' camp)
  win: ["we won!", "Victory!", "hooray!", "chaaampions!", "tell Dawood!", "fooor Dawooood!", "we did it!", say("I never doubted us"), "Da-wood! Da-wood!", "who's the best"],
  // a lunge, as he leaves (from his camp)
  lunge: [grow("Lunge!", "Luuunge!"), grow("Charge!", "Chaaarge!"), grow("for Dawood!", "fooor Dawooood!"), grow("Geronimo!", "Geronimooo!"), "wheeee!", grow("banzai!", "banzaaai!"), "hold my hat!", "cover him!", grow("go go go", "goooo!"), "run!"],
  // a big snipe, as it fires (from his camp)
  snipe: [grow("Bang!", "Baaang!"), "eat this!", grow("Fire!", "Fiiire!"), "take that!", "pew pew!", "incoming!", grow("for Dawood!", "fooor Dawooood!"), "watch this"],
  // a camp that shot the intruder
  deny: ["not in our camp!", "gotcha!", "who's next?", "nice try", "denied!", "wrong camp mate", shout("GET OUT!"), "welcome to camp", "no entry", "we saw you coming"],
  // a camp's chant, in beats
  chant: ["Da-wood! Da-wood!", "{me}! {me}! {me}!", "we want lunch! we want lunch!", "one more! one more!", "lunge lunge lunge", "hold-the-line! hold-the-line!", "{them} out! {them} out!", "Da-wood! Da-wood! Da-wood!"],
  // the last few, chanting from their camp
  chantLast: ["hold! hold! hold!", "never! never!", "we few! we few!", "Da-wood! Da-wood!", "not today! not today!"],
};

/** Lines about the paper, by theme id (added to `paper` on that paper). */
export const PAPER_LINES: Record<string, readonly string[]> = {
  lamplight: ["squared paper. classy", "who did the sums here", "it's a maths copy", "the lamp's in my eyes", "2 mm squares, lovely"],
  notebook: ["a quiet notebook", "very posh paper", "don't crease it", "it's a nice notebook this"],
  copy: ["it's a school copy", "there's a staple", "mind the pink line", "whose copy is this", "thin paper. careful"],
  legal: ["yellow paper?", "is this legal", "very yellow", "it's a legal pad", "objection!"],
  graph: ["graph paper. respect", "we're on a graph", "plot me", "x marks the dead", "it's all squares", "pencil? we're pencil?"],
  blueprint: ["we're on a blueprint", "it's very blue", "are we a plan", "chalk. fancy", "I feel architectural", "mind the cutting mat"],
  worksheet: ["the back of a worksheet", "is this homework", "there's maths on the other side", "don't hand this in", "gel pens. posh"],
};

/** Lines by the hour of the day (24h), first match wins; the rest of `clock` at any hour. */
export const CLOCK_LINES: readonly [from: number, to: number, lines: readonly string[]][] = [
  [0, 5, ["past your bedtime", "it's the middle of the night", "go to bed", "the lamp's very bright at 2am", "even Dawood's asleep"]],
  [5, 9, ["before school?", "it's early", "have you had breakfast", "morning", "the paper's cold"]],
  [12, 14, ["is it lunch?", "lunch!", "I can smell chips", "lunchtime lunge"]],
  [17, 20, ["nearly tea time", "homework first", "is dinner ready", "the light's going"]],
  [22, 24, ["past your bedtime", "one more then bed", "it's late", "shouldn't you be asleep", "the lamp's tired"]],
];

/**
 * A streak's lines, by how far it's gone: [link 2, link 3, link 4 and on].
 * `{n}` is the count so far ("two", "three", …), `{N}` shouted ("FOUR").
 * It builds: link 2 is a mutter, link 3 a shout, four and on the camp roars.
 */
const END: readonly Line[] = ["phew", "finally!", "he's out of ink", "is he done?", "and stay out!", "we survived", "count us", "that was rude", "is it over?", "never again", "count us. slowly", "someone check on Gary", "I need a lie down", shout("FINALLY")];
export const STREAK_LINES: Record<StreakKind, readonly [readonly Line[], readonly Line[], readonly Line[]]> = {
  // the streaker himself, mid-chain: cocky, then frantic
  streakMe: [
    ["again!", "one more", "that's {n}", "easy", "hold my hat", "I'm on a roll", "did you see that?", "who's next?", "still going", whisper("I can't stop"), "warming up", "don't clap yet", "and another", "is this allowed?"],
    [shout("{N}!"), shout("I can't stop!"), shout("who's next?!"), "someone stop me", shout("for Dawood!", "fooor Dawooood!"), shout("wheee!"), "I'm unstoppable", "my legs won't stop", shout("hat trick!"), "I'm a bit dizzy", "keep the pen on me", shout("MORE!")],
    [shout("{N}!!"), shout("I AM THE PEN"), shout("nobody stop me"), shout("fooor Dawooood!"), shout("I can't feel my dot"), shout("AAAAAH"), shout("tell mum I'm famous"), shout("put me in the rulebook"), "I think I'm going to be sick", shout("I'M A LEGEND"), shout("where's the brake?!"), shout("I've gone too far"), "I've forgotten how to stop", shout("NEXT!")],
  ],
  // the next enemy man in line, bracing
  streakFoe: [
    ["he's back", "not again", "uh oh", "is he coming here?", "look busy", "don't make eye contact", "stand still, he won't see us", "he looks hungry", tiny("not me")],
    [say("run!"), say("he's coming back!"), say("hide!"), say("not me not me"), say("why won't he stop"), say("mum!"), say("I'm too young!"), say("somebody do something"), say("play dead!"), say("I've got a family!")],
    [shout("HE WON'T STOP"), shout("RUN!!"), shout("everybody down!"), shout("this isn't fair!"), shout("call Dawood!"), shout("take his pen!"), shout("I SURRENDER"), shout("MUM!!"), shout("he's a monster"), shout("not the face!")],
  ],
  // his camp, back home, watching from its ring and counting
  streakCamp: [
    [whisper("that's {n}!"), "go on!", "look at him", "go on, son", "he's off!", whisper("is he allowed to do that?"), "that's our lad", "steady…"],
    [shout("{n}! {n}!"), shout("go go go!"), "that's our boy!", shout("he's on fire!"), chant("one more! one more!"), "we taught him that", shout("{N} for {me}!"), "don't stop now!"],
    [chant("{n}! {n}! {n}!"), chant("Da-wood! Da-wood!"), chant("go-on! go-on! go-on!"), chant("MORE! MORE! MORE!"), shout("we're not worthy!"), chant("legend! legend!"), shout("put him in the book!"), chant("{me}! {me}! {me}!"), shout("{N}! that's {N}!"), chant("again! again! again!")],
  ],
  // the camp he's tearing through
  streakFoeCamp: [
    ["who let him in", "watch him!", "that's {n} of ours", "he's got a taste for it", "someone watch the gate", "rude"],
    [shout("stop him!"), shout("man the ring!"), shout("he's coming round again!"), shout("close the camp!"), "that's {n} now!", shout("somebody catch him!"), shout("oi! {them}!")],
    [shout("ABANDON CAMP!"), shout("every man for himself!"), chant("stop! stop! stop!"), shout("we surrender! (not really)"), shout("REF! REF!"), shout("is this even legal?!"), shout("{N}?! {N}!?"), shout("tell Dawood!"), shout("save the small dots!"), chant("no more! no more!")],
  ],
  // the streak's over (three or more): the camp he tore through, relieved (the same at any length)
  streakEnd: [END, END, END],
};
const slowClap = (t: string): Line => ({ t, mood: "chant", slow: 2.6 });
const BACK: readonly Line[] = [
  "still thinking about that one?", "remember the last one?", "try not to miss this time", "we're still laughing", "do the thing again",
  "that last shot, though", "aim at us again, it's safer", whisper("he's still red"), "the margin says hi", "{them} can't aim (still)",
  "we framed your last one", "is the wind still bad?", tiny("don't mention it"), "Dawood saw that, you know", "new pen?",
];
/** A botch's lines, [a mutter, the full treatment]. `botchBack` is the callback on the other side's next go. */
export const BOTCH_LINES: Record<BotchKind, readonly [readonly Line[], readonly Line[]]> = {
  // the flicker himself
  botchMe: [
    ["I meant that", "the pen slipped", "…wind", "nobody saw that", tiny("oh no"), "warm-up shot", "that was a practice one", "I blinked", tiny("don't tell Dawood"), "the paper moved", "it's the lamp", "hm.", "sighting shot", "that was a warning"],
    [say("I meant that"), say("the pen slipped. a lot."), say("…wind. indoor wind."), say("nobody saw that. right?"), tiny("oh no"), say("it's a new pen"), say("I was aiming for the margin"), say("that's a tactic"), say("Dawood, look away"), say("can I have that back?"), shout("NOT MY FAULT"), say("the page is wonky"), say("I'll be in my camp"), say("that was for the other game")],
  ],
  // his own camp, from its ring
  botchCamp: [
    ["…", "we saw that", "sir?", "hm.", "oh dear", "…right", "don't look at him", "moving on", "we'll say it was the wind"],
    [say("…"), say("we saw that"), say("sir?"), say("that's going in the book"), chant("groan. groan. groan."), say("we'll never live this down"), say("who taught him that"), say("Dawood's watching"), say("back to training"), whisper("pretend we don't know him"), shout("WHY"), say("we're not with him"), say("…oh no")],
  ],
  // the enemy man it went nowhere near
  botchFoe: [
    ["HA!", "missed!", "nice try", "is that it?", "{them} can't aim", "close. not really.", "you missed", "whoosh", "over here!", "I'm right here"],
    [shout("HA!"), say("nice shot!"), say("do it again!"), say("{them} can't aim"), say("was that on purpose?"), say("my nan aims better"), say("I wasn't even hiding"), say("thanks for that"), say("wrong way, mate"), shout("MISSED!"), say("can we keep him?"), say("I felt the breeze"), shout("for Dawood! (thanks)")],
  ],
  // the enemy camp, laughing from its ring
  botchFoeCamp: [
    ["ha!", "nice shot!", "missed!", chant("ha ha ha"), "do it again!", "try again!"],
    [slowClap("clap. clap. clap."), chant("ha ha ha ha"), shout("nice shot!"), shout("do it again!"), chant("{them} can't aim! {them} can't aim!"), chant("again! again!"), say("frame it!"), shout("put it in the book!"), chant("one more! one more!"), slowClap("clap. clap. clap. clap.")],
  ],
  // on the other side's next go, one of theirs brings it up
  botchBack: [BACK, BACK],
};

const NUMBER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** A streak's count in words, or figures past twelve. Pure. */
export const countWord = (n: number) => NUMBER[n] ?? String(n);
/** Which stage of a streak `n` links long is at: 0 (link 2), 1 (link 3), 2 (four and on). Pure. */
export const streakTier = (n: number) => Math.max(0, Math.min(2, n - 2));

/** Who's heard at each stage of a streak, and how likely: the streaker and the enemy early, the camps roaring once it's long. */
const STREAK_VOICES: readonly (readonly [StreakKind, number][])[] = [
  [["streakMe", 0.4], ["streakFoe", 0.35], ["streakCamp", 0.25]],
  [["streakMe", 0.3], ["streakCamp", 0.35], ["streakFoeCamp", 0.35]],
  [["streakCamp", 0.45], ["streakFoeCamp", 0.3], ["streakMe", 0.25]],
];
/**
 * Who might speak at link `n` of a streak, most wanted first: the seeded roll
 * `r` (0..1) picks one by weight, and the rest follow by weight, for when the
 * first is off screen or just spoke (`not`). Pure.
 */
export function streakVoices(n: number, r: number, not?: StreakKind): StreakKind[] {
  return voices(STREAK_VOICES[streakTier(n)], r, not);
}
/** A weighted pick from `opts` by the roll `r`, then the rest by weight; `not` (who spoke last) goes last. Pure. */
function voices<K extends string>(opts: readonly (readonly [K, number])[], r: number, not?: K): K[] {
  let acc = 0, first = opts[opts.length - 1][0];
  for (const [k, w] of opts) { acc += w; if (r < acc) { first = k; break; } }
  const rest = [...opts].sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => k !== first);
  const order = [first, ...rest];
  return not ? [...order.filter((k) => k !== not), not] : order;
}

/**
 * A botch: the shooter's embarrassing miss, graded from the resolved flick
 * alone. `from` and `aim` are where he flicked from and which way; `path`
 * the ink as it ran; `foes` the other side's men standing; `own` his side's
 * camps. A kill, or a lunger shot where he landed (that has its own
 * moment), is no botch.
 */
export interface BotchIn {
  kind: "snipe" | "lunge";
  from: Pt;
  aim: number;
  path: Pt[];
  killed: number;
  lost: boolean;
  crashed: boolean;
  offPage: boolean;
  foes: Pt[];
  own: { x: number; y: number; r: number }[];
}
export interface Botch {
  /** 0 no botch, 1 a mutter, 2 the full treatment. */
  grade: 0 | 1 | 2;
  score: number;
  /** What made it one: "wide", "short", "offline", "stranded", "home", "offpage". */
  why: string[];
}
/** How grades are drawn: what counts for how much (page units and radians). */
export const BOTCH = {
  /** The closest the ink came to any of theirs: from `near` (a near miss is the target's "phew", not a botch) to `far` counts up to `wide`. */
  near: 30, far: 290, wide: 0.45,
  /** A snipe that dies this far short of the first man it was aimed at (within `lane` of the line): from `shortFrom` over `shortSpan`. */
  lane: 90, shortFrom: 80, shortSpan: 320, short: 0.55,
  /** A lunge thrown off line by the shake: from `offFrom` radians over `offSpan`. */
  offFrom: 0.3, offSpan: 0.9, offline: 0.55,
  /** A lunger stranded in the open, this far from anyone. */
  strandedAt: 260, stranded: 0.25,
  /** The ink ends in his own camp; or runs off the page. */
  home: 0.45, offpage: 0.6,
  /** Grades: 1 from here, 2 from here. */
  mild: 0.18, full: 0.6,
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export function botchOf(b: BotchIn): Botch {
  if (b.killed > 0 || b.crashed || b.path.length < 2) return { grade: 0, score: 0, why: [] };
  const B = BOTCH, why: string[] = [];
  const end = b.path[b.path.length - 1], len = pathLen(b.path);
  let score = 0;
  // how wide: the closest the ink came to any of theirs
  const miss = b.foes.length ? Math.min(...b.foes.map((p) => distToPath(p, b.path).d)) : B.far;
  const wide = clamp01((miss - B.near) / (B.far - B.near)) * B.wide;
  if (wide > 0.1) why.push("wide");
  score += wide;
  const dx = Math.cos(b.aim), dy = Math.sin(b.aim);
  if (b.kind === "snipe") {
    // way short: the first of theirs along the line he aimed, and how far the ink stopped short of him
    const ahead = b.foes.map((p) => ({ t: (p.x - b.from.x) * dx + (p.y - b.from.y) * dy, off: Math.abs((p.y - b.from.y) * dx - (p.x - b.from.x) * dy) }))
      .filter((q) => q.t > 0 && q.off < B.lane).sort((p, q) => p.t - q.t)[0];
    const short = ahead ? ahead.t - len : 0;
    const k = clamp01((short - B.shortFrom) / B.shortSpan) * B.short;
    if (k > 0) why.push("short");
    score += k;
  } else if (len > 40) {
    // thrown off line: where he ended up against where he was aimed
    const went = Math.atan2(end.y - b.from.y, end.x - b.from.x);
    const off = Math.abs(Math.atan2(Math.sin(went - b.aim), Math.cos(went - b.aim)));
    const k = clamp01((off - B.offFrom) / B.offSpan) * B.offline;
    if (k > 0) why.push("offline");
    score += k;
    // stranded in the open, nowhere near anyone
    const home = b.own.some((c) => Math.hypot(end.x - c.x, end.y - c.y) < c.r);
    const nearest = b.foes.length ? Math.min(...b.foes.map((p) => Math.hypot(p.x - end.x, p.y - end.y))) : Infinity;
    if (!b.lost && !home && nearest > B.strandedAt) { why.push("stranded"); score += B.stranded; }
  }
  // the ink ends back in his own camp; or it runs off the page
  if (len > 60 && !b.offPage && b.own.some((c) => Math.hypot(end.x - c.x, end.y - c.y) < c.r * 1.1)) { why.push("home"); score += B.home; }
  if (b.offPage) { why.push("offpage"); score += B.offpage; }
  const grade = score >= B.full ? 2 : score >= B.mild ? 1 : 0;
  return { grade, score, why };
}

/** Who remarks on a botch, most wanted first: a mild one's the flicker's mutter or his camp's; a spectacular one, the enemy's laughter. */
const BOTCH_VOICES: readonly (readonly [BotchKind, number][])[] = [
  [["botchMe", 0.4], ["botchCamp", 0.3], ["botchFoe", 0.3]],
  [["botchFoeCamp", 0.35], ["botchFoe", 0.25], ["botchCamp", 0.2], ["botchMe", 0.2]],
];
/** Who might remark on a botch of `grade`, as `streakVoices`. Pure. */
export function botchVoices(grade: number, r: number, not?: BotchKind): BotchKind[] {
  return voices(BOTCH_VOICES[grade >= 2 ? 1 : 0], r, not);
}

/** How often a chance to speak is taken. */
const CHANCE: Record<BubbleKind, number> = {
  ready: 0.3, aim: 0.12, phew: 0.55, dread: 0.3, kill: 0.45, mourn: 0.4, send: 0.5, arrive: 0.5,
  idle: 1, idleUp: 1, idleDown: 1, ponder: 1, tired: 1, banter: 1, shapes: 1, paper: 1, home: 1, afield: 1, clock: 1, wait: 1, tiny: 1, chat: 1,
  last: 0.9, win: 1, lunge: 0.7, snipe: 0.5, deny: 0.6, chant: 1, chantLast: 1,
  streakMe: 1, streakFoe: 1, streakCamp: 1, streakFoeCamp: 1, streakEnd: 0.6,
  botchMe: 1, botchCamp: 1, botchFoe: 1, botchFoeCamp: 1, botchBack: 1,
};

/** What a line is said in the light of: the sides' pen names, the paper, the hour, and how hot the war is. */
export interface Context {
  me: string;
  them: string;
  paper: string;
  hour: number;
  /** 0..1: turns played, men crossed out, last stands. Lines take their late form from `BUBBLE.lateFrom`. */
  heat: number;
  /** A streak: how many links long it is (the streak kinds' lines, `{n}`). */
  streak?: number;
  /** A botch: how bad (1 a mutter, 2 the full treatment; `botchOf`). */
  botch?: number;
}

export interface Bubble {
  kind: BubbleKind;
  /** The man (anchor "man"), or the camp's base (anchor "base"). */
  id: number;
  anchor: Anchor;
  /** A departure line stays beside the displayed position where it was offered. */
  at?: { x: number; y: number };
  text: string;
  mood: Mood;
  /** Wall ms it starts being written. */
  t0: number;
  /** Which side of him it sits (screen): 1 right, -1 left. */
  side: 1 | -1;
  seed: number;
  /** Held this much longer than its mood's time (ms): the first line of an exchange. */
  hold?: number;
  /** Written this many times slower (a slow clap), and on the page that much longer. */
  slow?: number;
  /** An exchange: a nearby comrade's reply, written as this line is read. */
  reply?: { text: string; mood: Mood; id: number; t0: number; seed: number; hold: number };
}

const fill = (t: string, c: Context) => t.replace(/\{me\}/g, c.me).replace(/\{them\}/g, c.them).replace(/\{paper\}/g, c.paper)
  .replace(/\{n\}/g, countWord(c.streak ?? 0)).replace(/\{N\}/g, countWord(c.streak ?? 0).toUpperCase());

/** The lines a moment offers in this context (paper and hour lines join theirs). */
export function linesFor(kind: BubbleKind, c: Context): readonly Line[] {
  if (kind in STREAK_LINES) return STREAK_LINES[kind as StreakKind][streakTier(c.streak ?? 2)];
  if (kind === "paper") return [...LINES.paper, ...(PAPER_LINES[c.paper] ?? [])];
  if (kind === "clock") { const h = CLOCK_LINES.find(([a, b]) => c.hour >= a && c.hour < b); return h ? [...h[2], ...LINES.clock] : LINES.clock; }
  if (kind in BOTCH_LINES) return BOTCH_LINES[kind as BotchKind][(c.botch ?? 1) >= 2 ? 1 : 0];
  return LINES[kind as Exclude<BubbleKind, StreakKind | BotchKind>];
}

/** The line seed `seed` picks for `kind` in context `c`: its text and mood, and a reply if it's an exchange. Pure. */
export function lineFor(kind: BubbleKind, seed: number, c: Context): { text: string; mood: Mood; reply?: string; slow?: number } {
  const lines = linesFor(kind, c);
  const l = lines[Math.floor(unit(seed, 7) * lines.length)];
  if (typeof l === "string") return { text: fill(l, c), mood: MOOD[kind] };
  const text = l.late && c.heat >= BUBBLE.lateFrom ? l.late : l.t;
  return { text: fill(text, c), mood: l.mood ?? MOOD[kind], reply: l.reply && fill(l.reply, c), slow: l.slow };
}

/**
 * What a note looks like at wall `ms`: how much is written (p), how much the
 * eraser has rubbed out (e), and a key that changes only when that does. Pure.
 * Reduced motion: written at once, and gone at once (no scrub).
 */
export function noteAt(mood: Mood, t0: number, seed: number, ms: number, reduced = false, hold = 0, slow = 1) {
  const T = BUBBLE.timing[mood], writeMs = T.writeMs * slow, eraseMs = T.eraseMs, showMs = T.showMs + T.writeMs * (slow - 1) + hold;
  const dt = ms - t0;
  if (dt < 0 || dt >= showMs) return null;
  const f = Math.floor((dt * BUBBLE.fps) / 1000), q = (f * 1000) / BUBBLE.fps;
  const p = reduced ? 1 : Math.min(1, q / writeMs);
  const e = reduced ? 0 : Math.max(0, Math.min(1, (q - (showMs - eraseMs)) / eraseMs));
  return { p, e, key: `${seed}|${p.toFixed(3)}|${e.toFixed(3)}` };
}
export const bubbleAt = (b: Bubble, ms: number, reduced = false) => noteAt(b.mood, b.t0, b.seed, ms, reduced, b.hold, b.slow);
export const replyAt = (b: Bubble, ms: number, reduced = false) => (b.reply ? noteAt(b.reply.mood, b.reply.t0, b.reply.seed, ms, reduced, b.reply.hold) : null);

/** How long a note stays, all told, its reply included. */
export const showOf = (b: Bubble) => Math.max(BUBBLE.timing[b.mood].showMs + BUBBLE.timing[b.mood].writeMs * ((b.slow ?? 1) - 1) + (b.hold ?? 0), b.reply ? b.reply.t0 - b.t0 + BUBBLE.timing[b.reply.mood].showMs + b.reply.hold : 0);

/** One note at a time, rarely. */
export class Bubbles {
  cur: Bubble | null = null;
  /** A streak's line, waiting for the one up to be rubbed out. */
  next: Bubble | null = null;
  private last = -Infinity;
  private window = -1;

  /**
   * Soldier (or camp) `id` might say something of `kind`, starting at wall
   * `t0`. Returns the note if it does: not while another shows, not soon after
   * the last (a shout or chant may follow sooner), and only on the seeded
   * chance. `mate`: a nearby comrade, for the reply in an exchange.
   */
  offer(kind: BubbleKind, id: number, t0: number, seed: number, c: Context, mate?: number, gapMs?: number): Bubble | null {
    if (!LIFE.bubbles) return null;
    if (this.next || (this.cur && t0 < this.cur.t0 + showOf(this.cur))) return null;
    const { text, mood, reply, slow } = lineFor(kind, seed, c);
    const loud = mood === "shout" || mood === "chant";
    if (t0 - this.last < (gapMs ?? (loud ? BUBBLE.loudGapMs : BUBBLE.gapMs))) return null;
    if (unit(seed, 5) >= CHANCE[kind]) return null;
    this.cur = { kind, id, anchor: ANCHOR[kind], text, mood, t0, side: unit(seed, 11) < 0.5 ? -1 : 1, seed };
    if (slow) this.cur.slow = slow;
    if (reply && mate !== undefined) {
      const x = BUBBLE.exchange;
      this.cur.hold = x.holdMs;
      this.cur.reply = { text: reply, mood: "say", id: mate, t0: t0 + x.replyMs, seed: seed + 101, hold: x.replyHoldMs };
    }
    this.last = t0;
    return this.cur;
  }

  /**
   * A streak's line: it can't wait for the usual gap or the dice. If a note
   * is up, it's rubbed out now (once it's finished being written) and this
   * one is written straight after, so there's still one on the page; a line
   * already waiting its turn is replaced by the newer, bigger one.
   */
  urgent(kind: BubbleKind, id: number, t0: number, seed: number, c: Context): Bubble | null {
    if (!LIFE.bubbles) return null;
    const { text, mood, slow } = lineFor(kind, seed, c);
    const b: Bubble = { kind, id, anchor: ANCHOR[kind], text, mood, t0, side: unit(seed, 11) < 0.5 ? -1 : 1, seed };
    if (slow) b.slow = slow;
    const cur = this.cur;
    if (cur && t0 < cur.t0 + showOf(cur)) {
      // cut it short: its eraser starts at t0, or as soon as it's written
      const cut = (m: Mood, at: number, hold: number) => {
        const T = BUBBLE.timing[m], from = Math.max(t0, at + T.writeMs + 120);
        return Math.min(hold, from - at - (T.showMs - T.eraseMs));
      };
      cur.hold = cut(cur.mood, cur.t0, cur.hold ?? 0);
      if (cur.reply) cur.reply.hold = cut(cur.reply.mood, cur.reply.t0, cur.reply.hold);
      b.t0 = Math.max(t0, cur.t0 + showOf(cur));
      this.next = b;
    } else { this.cur = b; this.next = null; }
    this.last = b.t0;
    return b;
  }

  /** Is it time for a stray thought? Once per window, on a seeded chance (a long wait: more often). */
  idleDue(ms: number, seed: number, waited = 0, boost = false) {
    const w = Math.floor(ms / BUBBLE.idleEveryMs);
    if (w === this.window) return false;
    this.window = w;
    return unit(seed, w, 13) < (boost ? BUBBLE.botch.backChance : waited > BUBBLE.longWaitMs ? BUBBLE.idleChance * 2 : BUBBLE.idleChance);
  }

  /** The note showing at `ms`, if any. */
  showing(ms: number) {
    if (this.cur && ms >= this.cur.t0 + showOf(this.cur)) this.cur = null;
    if (!this.cur && this.next) { this.cur = this.next; this.next = null; }
    return this.cur && ms >= this.cur.t0 ? this.cur : null;
  }

  clear() { this.cur = null; this.next = null; }
  /** Forget the last one too, so the next chance can be taken at once (dev captures). */
  reset() { this.cur = null; this.next = null; this.last = -Infinity; this.window = -1; }
}

/**
 * Which stray thought to have, from the seeded roll `r` (0..1) and the
 * situation: a long wait brings crickets; well ahead or behind colours the
 * rest; the paper, the hour, the shapes, the other side, where he stands,
 * an exchange, a tiny whisper, a camp's chant now and then. Pure.
 */
export function strayKind(r: number, o: { lead: number; waited: number; inBase: boolean; heat: number }): BubbleKind {
  const long = o.waited > BUBBLE.longWaitMs;
  if (long && r < 0.45) return "wait";
  const pick = long ? (r - 0.45) / 0.55 : r; // the rest of the roll picks from the table
  const table: [BubbleKind, number][] = [
    ["idle", 16], [o.lead >= 4 ? "idleUp" : o.lead <= -4 ? "idleDown" : "idle", 8], ["ponder", 6], ["tired", 5 + o.heat * 4], ["banter", 7 + o.heat * 3], ["shapes", 6],
    ["paper", 5], [o.inBase ? "home" : "afield", 5], ["clock", 4], ["tiny", 7], ["chat", 8], ["chant", o.lead >= 3 || o.heat > 0.6 ? 5 : 1.5],
  ];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [k, w] of table) { acc += w; if (pick * total < acc) return k; }
  return "idle";
}

/** How hot the war is (0..1): turns played, men crossed out, last stands. Pure. */
export function heatOf(turn: number, dead: number, total: number, standing: boolean) {
  return Math.max(0, Math.min(1, (turn / 30) * 0.45 + (total ? dead / total : 0) * 0.7 + (standing ? 0.3 : 0)));
}

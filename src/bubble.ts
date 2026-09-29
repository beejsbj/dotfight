// Pencil notes: now and then, a soldier says something in writing.
//
// A word or two pencilled on the page in a gap beside the man who said it, in
// his side's colour, with a little speech tail to him: "I'm ready" when you
// pick him up, "phew" after a near miss, "!" when a pen points at him, a yell
// as he lunges, and the odd stray thought. Rare on purpose: one on screen at
// most, a long gap between them, and most chances pass. Seeded, cosmetic,
// never game state.
//
// Each line has a mood. A whisper is small and neat; a shout is big, bold,
// stretched and scrawled, with a spiky ring, and may come sooner after the
// last note (never over it). The moments that shout: a lunge, a big snipe, a
// win, a camp shooting an intruder, a last stand.
//
// It's pencil, not ink: written stroke by stroke on the same sheet, read, then
// rubbed out with an eraser (a scrub that lifts it, a smudge, a few crumbs),
// so the append-only page never keeps it and a long war isn't cluttered with
// talk. It only redraws while being written or rubbed out, on the 12 fps grid,
// or while the camera moves.

import { LIFE, unit } from "./life";

export type Mood = "whisper" | "say" | "shout";
export type BubbleKind =
  | "ready" | "aim" | "phew" | "dread" | "kill" | "mourn" | "send" | "arrive"
  | "last" | "win" | "lunge" | "snipe" | "deny" | "idle" | "idleUp" | "idleDown"
  // moments the field must announce (Bubbles.moment): always written, whatever the chance
  | "stand" | "twoFor" | "chain";
type Line = string | { t: string; mood: Mood };

export const BUBBLE = {
  /** At least this long between one note and the next (ms); a shout may come sooner. */
  gapMs: 11000,
  loudGapMs: 5000,
  /** On the page this long, all told (ms): written, read, rubbed out. Shouts are written faster and read longer. */
  timing: {
    whisper: { showMs: 2400, writeMs: 620, eraseMs: 720 },
    say: { showMs: 2500, writeMs: 560, eraseMs: 720 },
    shout: { showMs: 2900, writeMs: 420, eraseMs: 760 },
  } as Record<Mood, { showMs: number; writeMs: number; eraseMs: number }>,
  /** Stray thoughts: a chance this often (ms), on your go while nothing's happening. */
  idleEveryMs: 8000,
  idleChance: 0.2,
  /** The grid it animates on: hand-drawn, on twos. */
  fps: 12,
};

/** Each moment's usual mood; a line can say otherwise. */
export const MOOD: Record<BubbleKind, Mood> = {
  ready: "say", aim: "whisper", phew: "say", dread: "whisper", kill: "say", mourn: "whisper", send: "say", arrive: "say",
  last: "shout", win: "shout", lunge: "shout", snipe: "shout", deny: "say", idle: "say", idleUp: "say", idleDown: "whisper",
  stand: "shout", twoFor: "shout", chain: "shout",
};

const shout = (t: string): Line => ({ t, mood: "shout" });
const whisper = (t: string): Line => ({ t, mood: "whisper" });
const say = (t: string): Line => ({ t, mood: "say" });

/** What the men say, by moment. Schoolboy war; Dawood invented the game and they know it. */
export const LINES: Record<BubbleKind, readonly Line[]> = {
  // picked up
  ready: ["I'm ready", "ready!", "me?", "ok!", "finally", "pick me!", "right then", "here we go", "oh. me.", "again?", whisper("be gentle")],
  // aimed with (the pull held)
  aim: ["steady…", "hold still", "don't miss", "a bit left", "a bit right", "for the camp", "I can see him", "not too hard", "deep breath"],
  // a near miss
  phew: ["phew", "phew!", "close one", "that was close", "my hat!", "oi!", "missed me", "rude", "hey!", shout("HEY!")],
  // a pen pointed at him
  dread: ["!", "!!", "eep", "not me not me", "mum?", "oh no", "gulp", "why me", "I have a family", "…"],
  // the shooter, his kill landed
  kill: ["got him!", "yes!", "down!", "ha!", "for Dawood!", "another one", "sorry mate", "did you see that?", "one for the book", shout("YES!"), shout("got him!")],
  // a campmate crossed out beside him
  mourn: ["no…", "he owed me lunch", "we'll remember him", "…", "he was so young", "who'll tell his mum", "Dawood, why", "avenge him", "that was my bunk mate"],
  // marching off
  send: ["off we go", "left, left", "are we there yet", "march!", "bye camp", "wait for me", "I hate walking", "single file", "keep up"],
  // arriving in a camp
  arrive: ["made it", "we're here", "budge up", "room for one more?", "nice camp", "tea?", "what did we miss", "is this the front?"],
  // the last few
  last: ["hold the line!", "to the last!", "we few", "it's just us", "for Dawood!", "not like this", "stand fast!", whisper("it's been an honour")],
  // the war is won
  win: ["we won!", "Victory!", "hooray!", "chaaampions!", "tell Dawood!", "fooor Dawooood!", "we did it!", "for Dawood!", say("I never doubted us")],
  // a lunge, as he leaves
  lunge: ["Luuunge!", "Chaaarge!", "fooor Dawooood!", "Geronimooo!", "wheeee!", "banzaaai!", "hold my hat!", "cover meee!", "yaaaah!"],
  // a big snipe, as it fires
  snipe: ["Baaang!", "eat this!", "Fiiire!", "take that!", "pew pew!", "incoming!", "fooor Dawooood!"],
  // a camp that shot the intruder
  deny: ["not in our camp!", "gotcha!", "who's next?", "nice try", "denied!", "wrong camp mate", shout("GET OUT!"), "welcome to camp"],
  // stray thoughts on your go
  idle: ["for Dawood!", "mum?", "hold the line", "…", "not me", "hm", "is it lunch?", "I spy…", "whose go is it?", "is Dawood watching?", "my feet hurt", "anyone got a rubber?", "I'm a dot", "what's the plan", "dot dot dot", "is this graph paper?"],
  // stray thoughts, well ahead
  idleUp: ["easy", "too easy", "they've got no chance", "Dawood would be proud", "can we go home yet", "we're so good", "look at them", "who's winning? us", "…", "is it lunch?"],
  // stray thoughts, well behind
  // moments (Bubbles.moment writes its own words)
  stand: ["LAST STAND!"], twoFor: ["2 for 1!"], chain: ["lunge again!"],
  idleDown: ["we're losing aren't we", "can we go home", "Dawood wouldn't like this", "I miss camp", "don't tell mum", "is there a plan?", "…", "hm", "we can still do this", "ask Dawood for help"],
};

/** How often a chance to speak is taken. */
const CHANCE: Record<BubbleKind, number> = {
  ready: 0.3, aim: 0.12, phew: 0.55, dread: 0.3, kill: 0.45, mourn: 0.4, send: 0.5, arrive: 0.5,
  last: 0.9, win: 1, lunge: 0.7, snipe: 0.5, deny: 0.6, idle: 1, idleUp: 1, idleDown: 1,
  stand: 1, twoFor: 1, chain: 1,
};

export interface Bubble {
  kind: BubbleKind;
  id: number;
  text: string;
  mood: Mood;
  /** Wall ms it starts being written. */
  t0: number;
  /** Which side of him it sits (screen): 1 right, -1 left. */
  side: 1 | -1;
  seed: number;
  /** A moment the field must announce (last stand, two for one, a lunge chain): never chance-gated, waits its turn rather than talk over another, and chatter gives way to it. */
  important?: boolean;
}

/** The line seed `seed` picks for `kind`: its text and mood. Pure. */
export function lineFor(kind: BubbleKind, seed: number): { text: string; mood: Mood } {
  const lines = LINES[kind];
  const l = lines[Math.floor(unit(seed, 7) * lines.length)];
  return typeof l === "string" ? { text: l, mood: MOOD[kind] } : { text: l.t, mood: l.mood };
}

/**
 * What a note looks like at wall `ms`: how much is written (p), how much the
 * eraser has rubbed out (e), and a key that changes only when that does. Pure.
 * Reduced motion: written at once, and gone at once (no scrub).
 */
export function bubbleAt(b: Bubble, ms: number, reduced = false) {
  const { showMs, writeMs, eraseMs } = BUBBLE.timing[b.mood];
  const dt = ms - b.t0;
  if (dt < 0 || dt >= showMs) return null;
  const f = Math.floor((dt * BUBBLE.fps) / 1000), q = (f * 1000) / BUBBLE.fps;
  const p = reduced ? 1 : Math.min(1, q / writeMs);
  const e = reduced ? 0 : Math.max(0, Math.min(1, (q - (showMs - eraseMs)) / eraseMs));
  return { p, e, key: `${b.seed}|${p.toFixed(3)}|${e.toFixed(3)}` };
}

/** How long a note stays, all told. */
export const showOf = (b: Bubble) => BUBBLE.timing[b.mood].showMs;

/** One note at a time, rarely. */
export class Bubbles {
  cur: Bubble | null = null;
  private last = -Infinity;
  private window = -1;
  /** Important notes waiting for the one showing to finish (in order). */
  pending: Bubble[] = [];

  /**
   * Soldier `id` might say something of `kind`, starting at wall `t0`.
   * Returns the note if he does: not while another shows, not soon after
   * the last (a shout may follow sooner), and only on the seeded chance.
   */
  offer(kind: BubbleKind, id: number, t0: number, seed: number): Bubble | null {
    if (!LIFE.bubbles) return null;
    if (this.cur && t0 < this.cur.t0 + showOf(this.cur)) return null;
    if (this.pending.length) return null;
    const { text, mood } = lineFor(kind, seed);
    if (t0 - this.last < (mood === "shout" ? BUBBLE.loudGapMs : BUBBLE.gapMs)) return null;
    if (unit(seed, 5) >= CHANCE[kind]) return null;
    this.cur = { kind, id, text, mood, t0, side: unit(seed, 11) < 0.5 ? -1 : 1, seed };
    this.last = t0;
    return this.cur;
  }

  /**
   * Something the field must announce: soldier `id` writes `text` (a shout) at
   * wall `t0`, always. Chatter showing gives way to it; another moment showing
   * is let finish first, and this one is written straight after it. Pure of
   * game state, and seeded by the caller.
   */
  moment(kind: BubbleKind, id: number, t0: number, seed: number, text: string): Bubble | null {
    if (!LIFE.bubbles) return null;
    const b: Bubble = { kind, id, text, mood: "shout", t0, side: unit(seed, 11) < 0.5 ? -1 : 1, seed, important: true };
    const tail = this.pending.length ? this.pending[this.pending.length - 1] : this.cur?.important ? this.cur : null;
    if (tail && t0 < tail.t0 + showOf(tail) + 150) {
      b.t0 = tail.t0 + showOf(tail) + 150;
      this.pending.push(b);
    } else {
      this.cur = b;
    }
    this.last = Math.max(this.last, b.t0);
    return b;
  }

  /** Is it time for a stray thought? Once per window, on a seeded chance. */
  idleDue(ms: number, seed: number) {
    const w = Math.floor(ms / BUBBLE.idleEveryMs);
    if (w === this.window) return false;
    this.window = w;
    return unit(seed, w, 13) < BUBBLE.idleChance;
  }

  /** The note showing at `ms`, if any. */
  showing(ms: number) {
    if (this.cur && ms >= this.cur.t0 + showOf(this.cur)) this.cur = null;
    if (!this.cur && this.pending.length) this.cur = this.pending.shift()!;
    return this.cur && ms >= this.cur.t0 ? this.cur : null;
  }

  clear() { this.cur = null; this.pending = []; }
  /** Forget the last one too, so the next chance can be taken at once (dev captures). */
  reset() { this.cur = null; this.pending = []; this.last = -Infinity; }
}

// The one adapter between room logs and the engine. Rooms carry opaque
// payloads; this says what they mean for the current rules. When the rules
// change shape, bump ENGINE and teach `check`/`apply` the new actions (old
// rooms keep their engine id, so a client can tell it can't read them).
// Pure: no DOM.
//
// A payload is one engine `Action` plus `h`, a hash of the page after it.
// Replay is deterministic, but Math.sin/cos/hypot may differ in the last bit
// between browsers; the hash lets a phone notice when its copy has drifted
// from the sender's instead of quietly playing on a different page.

import { act, illegal, newGame, type Action, type GameState, type Player } from "./game";
import { savedRules, type CoreRules, type Size } from "./rules";

// core-4: garrisoned walls. A core-2/core-3 room's setup has no `garrison`, so it
// replays with the flat walls it was played by (savedRules); this client
// still opens those. The bump is for the other direction: an older client,
// which would play a core-4 room on flat walls and drift, is told to reload.
export const ENGINE = "core-4";

// long-1: the long war, a second rule set on the same reducer (`rules.long`).
// Its own name, so a client that predates it says it can't read the room
// instead of playing it by the core rules. Not in READS until this client can
// show and play a long war (shapes, split lines, long roads).
export const LONG_ENGINE = "long-1";

/** core-2: original reach; core-3: shorter pull reach; core-4: garrisoned walls. */
export const READS: readonly string[] = ["core-2", "core-3", ENGINE];
export const canRead = (engine: string) => READS.includes(engine);

/** The engine a new room with these rules is played on. */
export const engineFor = (rules: CoreRules) => (rules.long ? LONG_ENGINE : ENGINE);

/** What a blank page needs: the v2 record minus its actions. */
export interface Setup {
  seed: number;
  size: Size;
  rules: CoreRules;
  page?: GameState["page"];
}

export interface Payload {
  a: Action;
  /** hash(state) after `a`, as the sender saw it */
  h?: string;
}

export const setupOf = (s: GameState): Setup =>
  ({ seed: s.seed, size: { ...s.size }, rules: structuredClone(s.rules), ...(s.page && { page: s.page }) });

export function fresh(setup: Setup): GameState {
  return newGame(setup.size, setup.seed >>> 0, setup.page, savedRules(setup.rules));
}

/** Whose move it is, or null once the page is won. The actor is always `current`. */
export const turn = (s: GameState): Player | null => (s.phase === "over" ? null : s.current);

/** Why `seat` can't send this payload now, or null if it can. */
export function check(s: GameState, seat: Player, p: unknown): string | null {
  if (turn(s) !== seat) return "not their turn";
  const a = (p as Partial<Payload> | null)?.a as Action | undefined;
  if (!a || typeof a !== "object" || typeof a.t !== "string") return "unknown action";
  return illegal(s, a);
}

export function apply(s: GameState, p: Payload) {
  return act(s, p.a);
}

/**
 * A cheap fingerprint of the page: who stands where, rounded well below a
 * pixel. A long war's also takes in the ink (a groove or a jolt can drift
 * where nobody stands) and how far each convoy has walked.
 */
export function hash(s: GameState): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => { h ^= n; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(s.actions.length); mix(s.current); mix(s.turn); mix(["setup", "position", "play", "over"].indexOf(s.phase));
  for (const x of s.soldiers) { mix(Math.round(x.x * 100)); mix(Math.round(x.y * 100)); mix(x.alive ? 1 : 0); }
  if (s.rules.long) {
    mix(s.marks.length);
    for (const m of s.marks) if (m.t === "stroke") {
      mix(m.owner); mix(m.pts.length);
      for (const p of m.pts) { mix(Math.round(p.x * 100)); mix(Math.round(p.y * 100)); }
    }
    for (const c of s.convoys) mix(Math.round((c.at ?? 0) * 100));
  }
  return h.toString(36);
}

/** Does this payload's hash disagree with our page after applying it? */
export const drifted = (s: GameState, p: Payload) => p.h !== undefined && p.h !== hash(s);

/**
 * Replay a log. Stops at the first payload that doesn't add up and says where;
 * notes the first place our page stopped matching the sender's hash.
 */
export function replay(setup: Setup, log: { seat: Player; a: unknown }[]): { s: GameState; bad?: number; drift?: number } {
  const s = fresh(setup);
  let drift: number | undefined;
  for (let i = 0; i < log.length; i++) {
    if (check(s, log[i].seat, log[i].a)) return { s, bad: i, drift };
    const p = log[i].a as Payload;
    apply(s, p);
    if (drift === undefined && drifted(s, p)) drift = i;
  }
  return { s, drift };
}

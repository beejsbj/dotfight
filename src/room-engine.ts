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
import { CORE, type CoreRules, type Size } from "./rules";

/** The engine a new room is made with. core-3: version-2 rules (a shorter lunge reach, a steeper reach curve). */
export const ENGINE = "core-3";
/** The engines this build can read: core-2 rooms carry version-1 rules in their setup, and replay on those exactly. */
export const READS: readonly string[] = ["core-2", ENGINE];

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
  return newGame(setup.size, setup.seed >>> 0, setup.page, { ...CORE, ...setup.rules });
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

/** A cheap fingerprint of the page: who stands where, rounded well below a pixel. */
export function hash(s: GameState): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => { h ^= n; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(s.actions.length); mix(s.current); mix(s.turn); mix(["setup", "position", "play", "over"].indexOf(s.phase));
  for (const x of s.soldiers) { mix(Math.round(x.x * 100)); mix(Math.round(x.y * 100)); mix(x.alive ? 1 : 0); }
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

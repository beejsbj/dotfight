// The one adapter between room logs and the engine. Rooms carry opaque
// actions; this says what they mean for the current rules. When the rules
// change shape, bump ENGINE and teach `check`/`apply` the new actions (old
// rooms keep their engine id, so a client can tell it can't read them).
// Pure: no DOM.

import { canAct, canPlaceBase, newGame, type GameState, type Player } from "./game";
import { apply as applyStep, steps, type Step } from "./record";

export const ENGINE = "flick-1";

/** What a blank page needs. */
export interface Setup {
  seed: number;
  page?: GameState["page"];
}

export type Act = Step;

export function fresh(setup: Setup): GameState {
  return newGame(setup.seed >>> 0, setup.page);
}

/** Whose move it is, or null once the page is won. */
export const turn = (s: GameState): Player | null => (s.phase === "over" ? null : s.current);

/** Why `seat` can't make this move now, or null if it can. */
export function check(s: GameState, seat: Player, a: unknown): string | null {
  if (turn(s) !== seat) return "not their turn";
  const st = a as Partial<Act> | null;
  if (st?.t === "base") {
    if (!Number.isFinite(st.x) || !Number.isFinite(st.y)) return "bad camp";
    return canPlaceBase(s, st.x!, st.y!);
  }
  if (st?.t === "flick") {
    const f = st.f;
    if (!f || !["shoot", "move"].includes(f.kind) || ![f.angle, f.length, f.bend].every(Number.isFinite)) return "bad flick";
    return canAct(s, f.soldierId) ? null : "illegal flick";
  }
  return "unknown action";
}

export const apply = (s: GameState, a: Act) => applyStep(s, a);

/** Every action on this page so far, in log order. */
export const acts = (s: GameState): Act[] => steps(s);

/** Replay a log. Stops at the first action that doesn't add up and says where. */
export function replay(setup: Setup, log: { seat: Player; a: unknown }[]): { s: GameState; bad?: number } {
  const s = fresh(setup);
  for (let i = 0; i < log.length; i++) {
    if (check(s, log[i].seat, log[i].a)) return { s, bad: i };
    apply(s, log[i].a as Act);
  }
  return { s };
}

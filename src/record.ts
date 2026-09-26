// A war on file. A page is fully described by its seed, where the bases went,
// and the flicks: replaying those through the engine redraws every mark
// exactly. That keeps the drawer of past pages tiny, gives the time-lapse
// replay for free, and lets old saves load unchanged. Pure: no DOM.

import { act, newGame, placeBase, type Flick, type GameState, type Player } from "./game";

export type Mode = { kind: "pnp" } | { kind: "bot"; level: 0 | 1 | 2 } | { kind: "room"; code: string };

/** The live save, as stored under `pft:save`. Old saves are `{ s, mode }` only. */
export interface Save {
  s: GameState;
  mode: Mode;
}

export interface Filed {
  v: 1;
  seed: number;
  page?: GameState["page"];
  bases: [number, number][];
  flicks: Flick[];
  mode: Mode;
  winner?: Player;
  turns: number;
  /** When it was filed (ms since epoch). */
  at: number;
}

export type Step = { t: "base"; x: number; y: number } | { t: "flick"; f: Flick };

/** Every action that made this page, in order. */
export function steps(s: Pick<GameState, "bases" | "flicks">): Step[] {
  return [
    ...s.bases.map((b): Step => ({ t: "base", x: b.x, y: b.y })),
    ...s.flicks.map((f): Step => ({ t: "flick", f })),
  ];
}

/** A fresh game with the same seed and page stamp: the blank sheet a replay starts from. */
export function blank(s: Pick<GameState, "seed" | "page">): GameState {
  return newGame(s.seed, s.page);
}

/** Apply one step. */
export function apply(s: GameState, st: Step) {
  if (st.t === "base") placeBase(s, st.x, st.y);
  else act(s, st.f);
}

export function file(s: GameState, mode: Mode, at = Date.now()): Filed {
  return {
    v: 1, seed: s.seed, page: s.page, mode, winner: s.winner, turns: s.turn, at,
    bases: s.bases.map((b) => [b.x, b.y]),
    flicks: s.flicks.map((f) => ({ ...f })),
  };
}

/** Rebuild the whole page from its record. */
export function unfile(r: Filed): GameState {
  const s = blank(r);
  for (const [x, y] of r.bases) placeBase(s, x, y);
  for (const f of r.flicks) act(s, f);
  return s;
}

/** Read `pft:save`. Anything unreadable or from a future format is ignored. */
export function readSave(raw: string | null): Save | null {
  try {
    const v = JSON.parse(raw || "null");
    if (v?.s?.v !== 1 || !Array.isArray(v.s.marks)) return null;
    const mode: Mode = v.mode?.kind === "bot" ? { kind: "bot", level: ([0, 1, 2].includes(v.mode.level) ? v.mode.level : 1) } : { kind: "pnp" };
    return { s: v.s, mode };
  } catch {
    return null;
  }
}

/** The drawer keeps the most recent pages, newest first, one copy of each. */
export function addToDrawer(drawer: Filed[], r: Filed, cap = 40): Filed[] {
  const same = (a: Filed) => a.seed === r.seed && a.page?.no === r.page?.no;
  return [r, ...drawer.filter((a) => !same(a))].slice(0, cap);
}

export function readDrawer(raw: string | null): Filed[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((r) => r?.v === 1 && Array.isArray(r.bases) && Array.isArray(r.flicks)) : [];
  } catch {
    return [];
  }
}

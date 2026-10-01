// A war on file. A core-rules game is fully described by its record: seed,
// size, rule numbers and the ordered actions. Replaying those through the
// engine redraws every mark exactly. That keeps the drawer of past pages
// tiny, gives the time-lapse replay for free, and is what a room link sends.
//
// Pages from the June prototype (v1: seed, bases and flicks) still load and
// replay through src/legacy.ts. Pure: no DOM.

import { act, newGame, type Action, type GameState, type Player } from "./game";
import * as legacy from "./legacy";
import type { LegacyFlick, LegacyState } from "./legacy";
import { SIZES, savedRules, type CoreRules, type Size } from "./rules";

export type Mode = { kind: "pnp" } | { kind: "bot"; level: 0 | 1 | 2 } | { kind: "room"; code: string };

/** Any game the desk can hold: the core rules (v2), or a prototype page (v1). */
export type AnyState = GameState | LegacyState;
export const isLegacy = (s: AnyState): s is LegacyState => s.v === 1;

/**
 * Everything needed to replay a core-rules game, and nothing else. Plain JSON.
 * `v` versions this format; `rules.version` versions the rules' logic.
 */
export interface GameRecord {
  v: 2;
  seed: number;
  size: Size;
  rules: CoreRules;
  actions: Action[];
  page?: GameState["page"];
}

export function toRecord(s: GameState): GameRecord {
  return { v: 2, seed: s.seed, size: { ...s.size }, rules: structuredClone(s.rules), actions: structuredClone(s.actions), ...(s.page && { page: s.page }) };
}

/** Replay a record from a blank page. */
export function fromRecord(r: GameRecord, upTo = r.actions.length): GameState {
  const s = newGame(r.size, r.seed, r.page, savedRules(r.rules));
  for (const a of r.actions.slice(0, upTo)) act(s, a);
  return s;
}

/** The live save, as stored under `pft:save`. Old saves hold a v1 state. */
export interface Save {
  s: AnyState;
  mode: Mode;
}

/** A prototype page in the drawer. */
export interface FiledV1 {
  v: 1;
  seed: number;
  page?: GameState["page"];
  bases: [number, number][];
  flicks: LegacyFlick[];
  mode: Mode;
  winner?: Player;
  turns: number;
  /** When it was filed (ms since epoch). */
  at: number;
}

/** A core-rules page in the drawer: its record, plus what the drawer shows. */
export interface FiledV2 extends GameRecord {
  mode: Mode;
  winner?: Player;
  turns: number;
  at: number;
}

export type Filed = FiledV1 | FiledV2;

export function file(s: AnyState, mode: Mode, at = Date.now()): Filed {
  if (isLegacy(s)) {
    return {
      v: 1, seed: s.seed, page: s.page, mode, winner: s.winner, turns: s.turn, at,
      bases: s.bases.map((b) => [b.x, b.y]),
      flicks: s.flicks.map((f) => ({ ...f })),
    };
  }
  return { ...toRecord(s), mode, winner: s.winner, turns: s.turn, at };
}

/** Rebuild the whole page from its record. */
export function unfile(r: Filed): AnyState {
  if (r.v === 2) return fromRecord(r);
  const s = legacy.newGame(r.seed, r.page);
  for (const [x, y] of r.bases) legacy.placeBase(s, x, y);
  for (const f of r.flicks) legacy.act(s, f);
  return s;
}

/** A replay's steps, in order. */
export type Step =
  | { t: "legacy-base"; x: number; y: number }
  | { t: "legacy-flick"; f: LegacyFlick }
  | Action;

export function steps(r: Filed): Step[] {
  if (r.v === 2) return structuredClone(r.actions);
  return [
    ...r.bases.map(([x, y]): Step => ({ t: "legacy-base", x, y })),
    ...r.flicks.map((f): Step => ({ t: "legacy-flick", f })),
  ];
}

/** The blank sheet a replay starts from. */
export function blank(r: Filed): AnyState {
  return r.v === 2 ? newGame(r.size, r.seed, r.page, savedRules(r.rules)) : legacy.newGame(r.seed, r.page);
}

/** Apply one step. */
export function apply(s: AnyState, st: Step) {
  if (isLegacy(s)) {
    if (st.t === "legacy-base") return void legacy.placeBase(s, st.x, st.y);
    if (st.t === "legacy-flick") return void legacy.act(s, st.f);
    throw new Error("a core-rules step on a prototype page");
  }
  if (st.t === "legacy-base" || st.t === "legacy-flick") throw new Error("a prototype step on a core-rules page");
  act(s, st);
}

const MODE = (v: { kind?: string; level?: number } | undefined): Mode =>
  v?.kind === "bot" ? { kind: "bot", level: ([0, 1, 2].includes(v.level!) ? v.level : 1) as 0 | 1 | 2 } : { kind: "pnp" };

/** Read `pft:save`. Anything unreadable or from a future format is ignored. */
export function readSave(raw: string | null): Save | null {
  try {
    const v = JSON.parse(raw || "null");
    if (!Array.isArray(v?.s?.marks)) return null;
    if (v.s.v === 1) return { s: v.s, mode: MODE(v.mode) };
    if (v.s.v === 2 && Array.isArray(v.s.actions) && v.s.size && v.s.rules) return { s: { ...v.s, rules: savedRules(v.s.rules) }, mode: MODE(v.mode) };
    return null;
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
    if (!Array.isArray(v)) return [];
    return v.filter((r) =>
      (r?.v === 1 && Array.isArray(r.bases) && Array.isArray(r.flicks)) ||
      (r?.v === 2 && Array.isArray(r.actions) && r.size && r.rules));
  } catch {
    return [];
  }
}

/** The size a new game gets from the picker. */
export function sizeFor(name: Size["name"], custom?: { bases: number; soldiers: number }): Size {
  if (name === "custom" && custom) return { name, bases: custom.bases, soldiers: custom.soldiers };
  return { ...(name === "quick" ? SIZES.quick : SIZES.classic) };
}

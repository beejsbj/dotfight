// One face for the two rule books the desk can hold: the core rules (v2,
// src/game.ts) for every new game, and the June prototype (v1,
// src/legacy.ts) for old saves carried on and drawer pages replayed. The
// flow in main.ts talks to this. Pure.

import { botAction, LEVELS, powerOf, type Level } from "./bot";
import { STEADY, type Hand } from "./flick";
import * as core from "./game";
import type { Action, Flick, GameState, Kind, Outcome, Player } from "./game";
import * as legacy from "./legacy";
import { isLegacy, type AnyState } from "./record";

export { isLegacy, LEVELS, type Level };

/** What the two flicks are called on this page. */
export const verb = (s: AnyState, k: Kind) => (isLegacy(s) ? (k === "snipe" ? "shoot" : "move") : k);
const toLegacy = (k: Kind): legacy.LegacyKind => (k === "snipe" ? "shoot" : "move");

export const aliveOf = (s: AnyState, p: Player) => s.soldiers.filter((x) => x.alive && x.owner === p);

export const basesLeft = (s: AnyState, p: Player) => (isLegacy(s) ? legacy.basesLeft(s, p) : core.basesLeft(s, p));

export const canPlaceBase = (s: AnyState, x: number, y: number) => (isLegacy(s) ? legacy.canPlaceBase(s, x, y) : core.canPlaceBase(s, x, y));

/** Soldiers a new base is jotted with. */
export const perBase = (s: AnyState) => (isLegacy(s) ? 10 : s.size.soldiers);

/** How long a flick of this power is (snipe and lunge reach alike; the legacy game had its own). */
export const lengthFor = (s: AnyState, k: Kind, power: number) => (isLegacy(s) ? legacy.legacyReach(toLegacy(k), power) : core.reachOf(s.rules, power));

/** How steady this soldier's hand is right now (a last stand, a lunge chain). */
export const handFor = (s: AnyState, id: number, k: Kind): Hand => (isLegacy(s) ? STEADY : core.hand(s, id, k));

export const canFlick = (s: AnyState, id: number, k?: Kind) => (isLegacy(s) ? legacy.canAct(s, id) : core.canFlick(s, id, k));

/** The flick's outcome in core terms; a prototype flick always hands the pen over. */
export function flick(s: AnyState, f: Flick): Outcome {
  if (!isLegacy(s)) return core.act(s, { t: "flick", ...f });
  const who = s.current;
  const o = legacy.act(s, { soldierId: f.soldier, kind: toLegacy(f.kind), angle: f.angle, length: f.length, bend: f.bend });
  const over = s.phase === "over";
  return {
    path: o.path, killed: o.killed, movedTo: o.movedTo, lost: o.lost, events: [], again: false, earned: false,
    stood: [], walked: [], arrived: [], handover: !over && s.current !== who,
  };
}

/** A base drawn in setup. */
export function placeBase(s: AnyState, x: number, y: number) {
  if (isLegacy(s)) legacy.placeBase(s, x, y);
  else core.act(s, { t: "base", x, y });
}

/** What Dawood-bot does now (a prototype page: always a flick). */
export function botMove(s: AnyState, level: Level, seed: number): Action {
  if (!isLegacy(s)) return botAction(s, level, seed);
  const f = legacy.legacyBotFlick(s, level, seed);
  return { t: "flick", soldier: f.soldierId, kind: f.kind === "shoot" ? "snipe" : "lunge", angle: f.angle, length: f.length, bend: f.bend, wob: 0 };
}

/** How hard a flick of this length was pulled (to animate the bot's pull-back). */
export function powerOfFlick(s: AnyState, f: Flick) {
  return isLegacy(s) ? legacy.legacyPower({ kind: toLegacy(f.kind), length: f.length }) : powerOf(s, f);
}

/** The core state, or undefined on a prototype page. */
export const coreOf = (s: AnyState): GameState | undefined => (isLegacy(s) ? undefined : s);

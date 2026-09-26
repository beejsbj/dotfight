// Soldier life, under the thumb. A few moments only, each for your own men:
//
//   cheer    your camp cheering a kill you made: a little patter, like applause
//   flinch   the bot's ink goes right past one of yours: a single tiny tick
//   unitcam  down at his level: a soft double step
//   stand    your side is down to its last three: two slow heartbeats
//   volley   a camp turning on a lunger in it: a rattle of jabs, then the cross
//
// feel/haptics (PR #7) brings a semantic vocabulary, haptic("..."), with one
// global gate and an iPhone backend. This doesn't depend on it: until it
// lands, these play on Android's navigator.vibrate through a gate of their
// own. When both are merged, route them through it once, at boot:
//
//   import { haptic } from "./haptics";
//   setFeel((ev) => haptic(TO_HAPTICS[ev] as HapticEvent));
//
// "stand" is already in that vocabulary (PR #7 lists it, unwired). "cheer",
// "flinch", "unitcam" and "volley" would be added there, with PATTERNS below
// as their Android shapes and the iOS tick rhythms in IOS below.

import { LIFE } from "./life";

export type Feel = "cheer" | "flinch" | "unitcam" | "stand" | "volley";

/** navigator.vibrate patterns: on, off, on... (ms). Short and sparse, never a buzz. */
export const PATTERNS: Record<Feel, number[]> = {
  cheer: [6, 55, 6, 55, 9],
  flinch: [5],
  unitcam: [9, 70, 6],
  stand: [35, 130, 35, 160, 60],
  volley: [5, 45, 5, 45, 5, 45, 18],
};
/** The same moments as iOS switch-tick times (ms from start), for feel/haptics' iPhone backend. */
export const IOS: Record<Feel, number[]> = { cheer: [0, 90, 180], flinch: [0], unitcam: [0, 90], stand: [0, 160, 340], volley: [0, 60, 120, 240] };
/** Their names in feel/haptics' vocabulary. */
export const TO_HAPTICS: Record<Feel, string> = { cheer: "cheer", flinch: "flinch", unitcam: "unitcam", stand: "stand", volley: "volley" };

/** Nothing within this long of the last thing felt (ms), unless it's a last stand. */
export const GAP = 120;

/** Pure: may `ev` play at `now`, given what was last felt and when? */
export function allow(ev: Feel, now: number, last?: { ev: Feel; at: number }) {
  if (!last) return true;
  if (ev === "stand") return true;
  return now - last.at >= GAP;
}

type Sink = (ev: Feel, pattern: number[]) => void;
const vibrate: Sink = (_ev, p) => {
  // Android only; switched off in feel/haptics' setting too
  if (typeof localStorage !== "undefined" && localStorage.getItem("pft:haptics") === "0") return;
  try { navigator.vibrate?.(p); } catch { /* not before a touch */ }
};
let sink: Sink = vibrate;
let last: { ev: Feel; at: number } | undefined;

/** Route soldier-life haptics somewhere else (feel/haptics' `haptic`, once both are merged). */
export function setFeel(fn: Sink) { sink = fn; }

/** Feel a soldier-life moment, if LIFE.haptics is on and the gate allows. Returns whether it played. */
export function feel(ev: Feel) {
  if (!LIFE.haptics) return false;
  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  if (!allow(ev, now, last)) return false;
  last = { ev, at: now };
  sink(ev, PATTERNS[ev]);
  return true;
}

// Named moments in a war, for anything that wants to feel or voice them
// (haptics, soldier life, sound). The flow calls `cue()` at the moment the
// player sees each thing happen, live play only (replays are watched, not
// felt). Subscribe with one line: `onCue((c, arg) => ...)`.
//
//   lunge-death  a lunger lands among a base's men and is shot (arg: base id)
//   last-stand   a side is down to its last few (arg: the player, 0 or 1)
//   earned       a flick earned another: a snipe that took two, or a lunge kill (arg: flicks left)
//   send         a convoy is ordered (arg: how many)
//   walk-out     convoys walk out onto the road as the pen changes hands (arg: how many soldiers)
//   arrive       convoys arrive at their base (arg: how many soldiers)
//
// main.ts routes lunge-death → haptic("thud") and last-stand → haptic("stand") (#7).

export type Cue = "lunge-death" | "last-stand" | "earned" | "send" | "walk-out" | "arrive";

type Listener = (c: Cue, arg?: number) => void;
const listeners = new Set<Listener>();

export function onCue(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function cue(c: Cue, arg?: number) {
  for (const fn of listeners) fn(c, arg);
}

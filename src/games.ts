// The cover's "games with friends": one line per room on this device, and the
// order they go in. Pure, tested.

import type { Saved } from "./room";

export type Standing = "your go" | "their go" | "watching" | "you won" | "they won" | "done" | "";

export interface GameLine {
  code: string;
  foe: string;
  standing: Standing;
  /** Still being played (or waiting on a move), as opposed to finished. */
  running: boolean;
  /** Your move: the one that wants you. */
  yours: boolean;
  turn: number | null;
}

export function gameLine(r: Saved): GameLine {
  const sm = r.summary;
  const foe = r.seat === null ? `${r.names[0]} v ${r.names[1] ?? "?"}` : r.names[r.seat === 0 ? 1 : 0] ?? "your friend";
  const over = !!sm && sm.next === null;
  const standing: Standing = !sm ? "" : over
    ? (r.seat === null ? "done" : sm.winner === r.seat ? "you won" : "they won")
    : r.seat === null ? "watching" : sm.next === r.seat ? "your go" : "their go";
  return { code: r.code, foe, standing, running: !over, yours: standing === "your go", turn: sm?.turn ?? null };
}

/** Running games first, yours before theirs, each group most recent first (the list is already that way). */
export function orderGames(rooms: Saved[]): { running: GameLine[]; finished: GameLine[] } {
  const lines = rooms.map(gameLine);
  const running = lines.filter((l) => l.running);
  return { running: [...running.filter((l) => l.yours), ...running.filter((l) => !l.yours)], finished: lines.filter((l) => !l.running) };
}

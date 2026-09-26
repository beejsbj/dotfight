// Client-side room logic. Handles joining, syncing, and replaying the action log.

import { act, newGame, placeBase, type Flick, type GameState } from "./game";

export interface RoomInfo {
  code: string;
  seat: 0 | 1 | null; // null if spectating
  secret: string | null;
  opponentName: string;
  opponentSeat: 0 | 1 | null;
}

export interface RoomAction {
  i: number;
  t: "base" | "flick";
  seat: 0 | 1;
  data: unknown;
}

export interface RoomState {
  meta: {
    v: 1;
    created: number;
    players: Array<{ seat: 0 | 1; name: string; secret: string }>;
    seed: number;
    theme?: string;
  };
  actions: RoomAction[];
}

const API_BASE = "/api/rooms";

// Store room info in localStorage
function getStorageKey(code: string): string {
  return `room:${code}`;
}

export function saveRoomInfo(code: string, info: RoomInfo): void {
  localStorage.setItem(getStorageKey(code), JSON.stringify(info));
}

export function loadRoomInfo(code: string): RoomInfo | null {
  const raw = localStorage.getItem(getStorageKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Create a new room with the given seed. Returns room info and initial game state. */
export async function createRoom(seed: number, theme?: string): Promise<{ info: RoomInfo; state: GameState }> {
  const res = await fetch(`${API_BASE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed, theme }),
  });
  if (!res.ok) throw new Error(`failed to create room: ${res.statusText}`);

  const { code, seat, secret } = await res.json();
  const info: RoomInfo = { code, seat, secret, opponentName: "", opponentSeat: null };
  saveRoomInfo(code, info);

  const gameState = newGame(seed);
  if (theme) gameState.theme = theme;

  return { info, state: gameState };
}

/** Join an existing room by code. Returns room info and replayed game state. */
export async function joinRoom(code: string, name: string): Promise<{ info: RoomInfo; state: GameState }> {
  // Fetch the room state
  const res1 = await fetch(`${API_BASE}/${code}`);
  if (!res1.ok) throw new Error(`room not found: ${code}`);
  const roomState: RoomState = await res1.json();

  // Join as a player
  const res2 = await fetch(`${API_BASE}/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res2.ok) throw new Error(`failed to join room: ${res2.statusText}`);

  const { seat, secret } = await res2.json();
  if (seat === null) {
    // Joining as spectator
    const info: RoomInfo = { code, seat: null, secret: null, opponentName: "", opponentSeat: null };
    const gameState = replayActions(roomState.meta.seed, roomState.actions);
    return { info, state: gameState };
  }

  const info: RoomInfo = {
    code,
    seat,
    secret,
    opponentName: "",
    opponentSeat: null,
  };

  // Find opponent
  for (const p of roomState.meta.players) {
    if (p.seat !== seat) {
      info.opponentName = p.name;
      info.opponentSeat = p.seat;
      break;
    }
  }

  saveRoomInfo(code, info);

  // Replay actions to reconstruct the game state
  const gameState = replayActions(roomState.meta.seed, roomState.actions);
  if (roomState.meta.theme) gameState.theme = roomState.meta.theme;

  return { info, state: gameState };
}

/** Replay a list of actions from the start to reconstruct game state. */
export function replayActions(seed: number, actions: RoomAction[]): GameState {
  const game = newGame(seed);

  for (const action of actions) {
    try {
      if (action.t === "base") {
        const { x, y } = action.data as { x: number; y: number };
        placeBase(game, x, y);
      } else if (action.t === "flick") {
        const flick = action.data as Flick;
        act(game, flick);
      }
    } catch (e) {
      console.error(`failed to replay action ${action.i}:`, e);
      throw e;
    }
  }

  return game;
}

/** Send an action to the room (append to the log). Returns true if successful, false if conflict. */
export async function sendAction(
  info: RoomInfo,
  actionIndex: number,
  actionType: "base" | "flick",
  actionData: unknown,
): Promise<boolean> {
  if (info.seat === null || info.secret === null) {
    throw new Error("cannot send action as spectator");
  }

  const res = await fetch(`${API_BASE}/${info.code}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seat: info.seat,
      secret: info.secret,
      actionIndex,
      actionType,
      actionData,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    if (res.status === 409) {
      // Conflict: another player moved first
      console.log("action conflict, expected index", error.expectedIndex);
      return false;
    }
    throw new Error(`failed to send action: ${res.statusText}`);
  }

  return true;
}

/** Fetch the latest room state. */
export async function fetchRoomState(code: string): Promise<RoomState> {
  const res = await fetch(`${API_BASE}/${code}`);
  if (!res.ok) throw new Error(`room not found: ${code}`);
  return res.json();
}

/** Get the opponent name from the room state. */
export function getOpponentInfo(roomState: RoomState, mySeat: 0 | 1 | null): { name: string; seat: 0 | 1 | null } {
  for (const p of roomState.meta.players) {
    if (p.seat !== mySeat) return { name: p.name, seat: p.seat };
  }
  return { name: "", seat: null };
}

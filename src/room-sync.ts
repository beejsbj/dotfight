// Room synchronization logic. Handles joining, syncing, and playing in a room.
// This module is separate from the main game loop and can be integrated independently.

import { type GameState } from "./game";
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  replayActions,
  sendAction as apiSendAction,
  fetchRoomState,
  type RoomInfo,
  type RoomState,
  loadRoomInfo,
} from "./room";

export interface RoomSync {
  code: string;
  info: RoomInfo;
  state: RoomState;
  lastFetch: number;
  pendingAction: { index: number; type: "base" | "flick"; data: unknown } | null;
}

/** Create a new room. Returns sync state and initial game state. */
export async function createRoom(seed: number, theme?: string): Promise<{ sync: RoomSync; game: GameState }> {
  const { info, state: gameState } = await apiCreateRoom(seed, theme);

  // Fetch the actual room state from server
  const state = await fetchRoomState(info.code);

  const sync: RoomSync = {
    code: info.code,
    info,
    state,
    lastFetch: Date.now(),
    pendingAction: null,
  };

  return { sync, game: gameState };
}

/** Join an existing room and resume the game. Returns sync state and replayed game state. */
export async function joinRoom(code: string, playerName: string): Promise<{ sync: RoomSync; game: GameState }> {
  const { info, state: gameState } = await apiJoinRoom(code, playerName);
  const state = await fetchRoomState(code);

  const sync: RoomSync = {
    code,
    info,
    state,
    lastFetch: Date.now(),
    pendingAction: null,
  };

  return { sync, game: gameState };
}

/** Try to join a room from localStorage or URL. Returns null if not available. */
export async function resumeRoom(code: string): Promise<{ sync: RoomSync; game: GameState } | null> {
  try {
    const info = loadRoomInfo(code);
    const state = await fetchRoomState(code);
    const game = replayActions(state.meta.seed, state.actions);
    if (state.meta.theme) game.theme = state.meta.theme;

    const sync: RoomSync = {
      code,
      info: info || { code, seat: null, secret: null, opponentName: "", opponentSeat: null },
      state,
      lastFetch: Date.now(),
      pendingAction: null,
    };

    return { sync, game };
  } catch (e) {
    console.error("failed to resume room:", e);
    return null;
  }
}

/** Sync with the server: fetch latest state and merge any new actions. */
export async function sync(sync: RoomSync): Promise<{ game: GameState; newActions: number }> {
  const state = await fetchRoomState(sync.code);
  const prevActionCount = sync.state.actions.length;
  sync.state = state;
  sync.lastFetch = Date.now();

  const newActions = state.actions.length - prevActionCount;
  const game = replayActions(state.meta.seed, state.actions);
  if (state.meta.theme) game.theme = state.meta.theme;

  return { game, newActions };
}

/** Send an action (a base placement or flick). Optimistically applies locally, then uploads. */
export async function sendAction(
  sync: RoomSync,
  actionIndex: number,
  actionType: "base" | "flick",
  actionData: unknown,
): Promise<boolean> {
  // Store as pending
  sync.pendingAction = { index: actionIndex, type: actionType, data: actionData };

  // Try to upload
  try {
    const success = await apiSendAction(sync.info, actionIndex, actionType, actionData);
    if (success) {
      sync.pendingAction = null;
      // Also update local state
      const newAction = { i: actionIndex, t: actionType, seat: sync.info.seat!, data: actionData };
      sync.state.actions.push(newAction);
    }
    return success;
  } catch (e) {
    console.error("failed to send action:", e);
    return false;
  }
}

/** Get the opponent info from the current room state. */
export function getOpponentInfo(sync: RoomSync): { name: string; present: boolean } {
  for (const p of sync.state.meta.players) {
    if (p.seat !== sync.info.seat) {
      return { name: p.name, present: true };
    }
  }
  return { name: "", present: false };
}

/** Check if I should act (it's my turn and I'm a player, not a spectator). */
export function shouldAct(sync: RoomSync, game: GameState): boolean {
  if (sync.info.seat === null) return false; // spectator
  if (game.phase === "setup") return game.current === sync.info.seat;
  if (game.phase === "play") return game.current === sync.info.seat;
  return false;
}

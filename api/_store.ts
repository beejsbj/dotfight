// Room store abstraction. Implemented with Upstash Redis in prod, in-memory in dev.

export interface RoomMeta {
  v: 1;
  created: number; // ms since epoch
  players: Array<{ seat: 0 | 1; name: string; secret: string }>;
  seed: number;
  theme?: string;
}

export interface RoomAction {
  i: number; // index in the action list
  t: "base" | "flick";
  seat: 0 | 1;
  data: unknown; // opaque action (checked by client replay)
}

export interface Room {
  meta: RoomMeta;
  actions: RoomAction[];
}

// Singleton store, replaced in _setup.ts by Upstash client in prod
let store: Map<string, Room> = new Map();

export function getRoom(code: string): Room | null {
  return store.get(code) || null;
}

export async function setRoom(code: string, room: Room): Promise<void> {
  store.set(code, room);
}

export function deleteRoom(code: string): void {
  store.delete(code);
}

// For testing
export function clearStore(): void {
  store = new Map();
}

export function setStore(newStore: Map<string, Room>): void {
  store = newStore;
}

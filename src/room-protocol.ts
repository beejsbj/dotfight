// The room wire protocol, shared by the browser and `api/room.ts`. A room is
// its setup (whatever the engine needs to lay out a blank page) plus an
// append-only log of opaque actions. Nothing here knows the game's rules:
// `room-engine.ts` is the one adapter between these actions and the engine.

export type Seat = 0 | 1;

/** One logged action. `a` is opaque to the server; `at` is the server's clock. */
export interface Entry {
  seat: Seat;
  a: unknown;
  at: number;
}

export interface RoomView {
  code: string;
  engine: string;
  setup: unknown;
  theme?: string;
  created: number;
  /** [creator, friend]; the friend's is null until someone takes the seat. */
  names: [string, string | null];
  /** Entries on the server. */
  n: number;
  /** `entries` start at this index. */
  since: number;
  entries: Entry[];
}

export type Joined = { seat: Seat; secret: string } | { seat: null; secret: null };
export type Acted = { ok: true; n: number } | { ok: false; conflict: true; n: number };

export class RoomHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface RoomApi {
  create(b: { name: string; engine: string; setup: unknown; theme?: string }): Promise<{ code: string; seat: Seat; secret: string }>;
  join(code: string, name: string): Promise<Joined>;
  read(code: string, since?: number): Promise<RoomView>;
  act(b: { code: string; seat: Seat; secret: string; i: number; a: unknown }): Promise<Acted>;
}

/** The HTTP client. Network failures throw TypeError; server refusals throw RoomHttpError. */
export function httpApi(base = "/api/room", f: typeof fetch = (...a) => fetch(...a)): RoomApi {
  async function call<T>(res: Promise<Response>): Promise<T> {
    const r = await res;
    const body = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) throw new RoomHttpError(r.status, body.error ?? r.statusText);
    return { ...body, status: r.status } as T;
  }
  const post = (body: unknown) => f(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return {
    create: (b) => call(post({ op: "create", ...b })),
    join: (code, name) => call(post({ op: "join", code, name })),
    read: (code, since = 0) => call(f(`${base}?code=${encodeURIComponent(code)}&since=${since}`, { cache: "no-store" })),
    async act(b) {
      const r = await call<{ n: number; status: number }>(post({ op: "act", ...b }));
      return r.status === 409 ? { ok: false, conflict: true, n: r.n } : { ok: true, n: r.n };
    },
  };
}

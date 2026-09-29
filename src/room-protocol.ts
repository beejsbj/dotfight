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
  read(code: string, since?: number, signal?: AbortSignal): Promise<RoomView>;
  act(b: { code: string; seat: Seat; secret: string; i: number; a: unknown }, signal?: AbortSignal): Promise<Acted>;
}

/** The HTTP client. Network failures throw TypeError; server refusals throw RoomHttpError. */
export function httpApi(base = "/api/room", f: typeof fetch = (...a) => fetch(...a)): RoomApi {
  async function call<T>(request: () => Promise<Response>, signal?: AbortSignal): Promise<T> {
    for (;;) {
      signal?.throwIfAborted();
      const r = await request();
      const body = await r.json().catch(() => ({}));
      if (r.status === 429) {
        const header = r.headers.get("retry-after");
        const seconds = header?.trim() ? Number(header) : NaN;
        const date = header && !Number.isFinite(seconds) ? Date.parse(header) : NaN;
        const fallback = typeof body.retryAfter === "number" ? body.retryAfter : NaN;
        const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000
          : Number.isFinite(date) ? Math.max(0, date - Date.now())
          : Number.isFinite(fallback) && fallback >= 0 ? fallback * 1000 : 1000;
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(signal!.reason); };
          const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
        });
        continue;
      }
      if (!r.ok && r.status !== 409) throw new RoomHttpError(r.status, body.error ?? r.statusText);
      return { ...body, status: r.status } as T;
    }
  }
  const post = (body: unknown, signal?: AbortSignal) => {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal };
    return () => f(base, init);
  };
  return {
    create: (b) => call(post({ op: "create", ...b })),
    join: (code, name) => call(post({ op: "join", code, name })),
    read: (code, since = 0, signal) => call(() => f(`${base}?code=${encodeURIComponent(code)}&since=${since}`, { cache: "no-store", signal }), signal),
    async act(b, signal) {
      const r = await call<{ n: number; status: number }>(post({ op: "act", ...b }, signal), signal);
      return r.status === 409 ? { ok: false, conflict: true, n: r.n } : { ok: true, n: r.n };
    },
  };
}

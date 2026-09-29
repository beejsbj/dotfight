// A room link on this device: which room, which seat (and its secret), the
// log as far as we've seen it, and our own moves still on their way. It posts
// our moves in order, polls for the other side's while we wait, and keeps the
// lot in localStorage so a closed app picks up where it left off.
//
// main.ts applies what arrives (`next()`), and hands over what the player
// does (`push()`). The engine is only touched through `room-engine.ts`.

import type { Setup } from "./room-engine";
import type { Entry, RoomApi, Seat } from "./room-protocol";

export interface Saved {
  v: 1;
  code: string;
  seat: Seat | null; // null: watching
  secret: string | null;
  engine: string;
  setup: Setup;
  theme?: string;
  names: [string, string | null];
  /** The server's log as far as we know it. */
  log: Entry[];
  /** How many of `log` are on the page here; the rest are still to be drawn. */
  applied: number;
  /** Our own moves, on the page here, not yet on the server. They follow `log`. */
  pending: unknown[];
  updated: number;
  /** For the cover's list. */
  summary?: { turn: number; next: Seat | null; winner?: Seat };
}

export interface Env {
  api: RoomApi;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  hidden?: () => boolean;
  now?: () => number;
  /** Something arrived: entries to draw, a name, or a net state change. */
  onNews?: () => void;
  /** Our pending moves were refused because the page moved on without them. Rebuild from `log`. */
  onDiverged?: () => void;
}

const KEY = (code: string) => `pft:room:${code}`;
const INDEX = "pft:rooms";

export function readRoom(storage: Env["storage"], code: string): Saved | null {
  try {
    const v = JSON.parse(storage.getItem(KEY(code)) || "null");
    return v?.v === 1 && Array.isArray(v.log) && Array.isArray(v.pending) ? v : null;
  } catch {
    return null;
  }
}

/** Rooms this device has played in, most recent first. */
export function listRooms(storage: Env["storage"]): Saved[] {
  let codes: string[] = [];
  try { codes = JSON.parse(storage.getItem(INDEX) || "[]"); } catch { /* start over */ }
  return (Array.isArray(codes) ? codes : []).map((c) => readRoom(storage, c)).filter((r): r is Saved => !!r);
}

export function forgetRoom(storage: Env["storage"], code: string) {
  storage.removeItem(KEY(code));
  storage.setItem(INDEX, JSON.stringify(listRooms(storage).map((r) => r.code).filter((c) => c !== code)));
}

const same = (e: Entry, seat: Seat | null, a: unknown) => e.seat === seat && JSON.stringify(e.a) === JSON.stringify(a);

export class RoomLink {
  /** The last request failed for want of a network. */
  offline = false;
  /** The page on the server stopped adding up (or needs a newer client). */
  broken = "";
  private waitingFor = false;
  private lastNews = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | null = null;
  private polling: Promise<void> | null = null;
  private retry = 0;
  private running = false;
  private lifetime = new AbortController();
  private readonly now: () => number;

  constructor(public data: Saved, private env: Env) {
    this.now = env.now ?? Date.now;
    this.lastNews = this.now();
  }

  get code() { return this.data.code; }
  get seat() { return this.data.seat; }
  get names() { return this.data.names; }
  get url() { return `${location.origin}/r/${this.data.code}`; }
  /** Entries on the server that aren't drawn here yet. */
  get queued() { return this.data.log.length - this.data.applied; }

  /** The next entry to draw; call `drawn()` once it's on the page. */
  peek(): Entry | undefined { return this.data.log[this.data.applied]; }
  drawn() { this.data.applied++; this.save(); }

  save(summary?: Saved["summary"]) {
    const d = this.data;
    d.updated = this.now();
    if (summary) d.summary = summary;
    const { storage } = this.env;
    storage.setItem(KEY(d.code), JSON.stringify(d));
    const rest = listRooms(storage).map((r) => r.code).filter((c) => c !== d.code);
    storage.setItem(INDEX, JSON.stringify([d.code, ...rest].slice(0, 20)));
  }

  /** The player made a move here. It's already on the page; send it. */
  push(a: unknown) {
    if (this.data.seat === null) return;
    this.data.pending.push(a);
    this.save();
    void this.flush();
  }

  /** Tell the link whether we're waiting on the other side (it polls only then). */
  waiting(on: boolean) {
    if (on === this.waitingFor) return;
    this.waitingFor = on;
    if (on) this.lastNews = this.now();
    this.schedule();
  }

  start() {
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
    this.running = true;
    this.schedule(0);
  }

  stop() {
    this.running = false;
    this.lifetime.abort();
    clearTimeout(this.timer);
  }

  /** The app came back to the front, or the network did: catch up now. */
  wake() {
    if (this.running) this.schedule(0);
  }

  /** How long until the next poll, given how long it's been quiet. */
  pollDelay() {
    const quiet = this.now() - this.lastNews;
    return quiet < 2 * 60e3 ? 1500 : quiet < 10 * 60e3 ? 4000 : 10000;
  }

  private schedule(ms?: number) {
    clearTimeout(this.timer);
    if (!this.running || this.broken) return;
    const hidden = this.env.hidden?.() ?? false;
    if (this.data.pending.length) {
      // keep trying to deliver, hidden or not
      const wait = ms ?? Math.min(15000, 1000 * 2 ** this.retry);
      this.timer = setTimeout(() => void this.flush(), wait);
      return;
    }
    if (hidden) return; // visibilitychange wakes us
    // on our go, still look in now and then while the friend's seat is empty, to learn their name
    const lonely = this.data.seat === 0 && this.data.names[1] === null;
    if (ms === undefined && !this.waitingFor && !lonely) return;
    ms ??= this.waitingFor ? this.pollDelay() : 4000;
    this.timer = setTimeout(() => void this.poll().finally(() => this.schedule()), ms);
  }

  /** Fetch whatever is new. Only when nothing of ours is in flight. */
  poll(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.resolve();
    if (this.data.pending.length) return this.flush();
    if (this.polling) return this.polling;
    const signal = this.lifetime.signal;
    this.polling = (async () => {
      try {
        const d = this.data;
        const v = await this.env.api.read(d.code, d.log.length, signal);
        if (signal.aborted) return;
        let news = this.offline;
        this.offline = false;
        if (v.engine !== d.engine) { this.broken = "this page needs a newer copy of the game: reload"; news = true; }
        if (JSON.stringify(v.names) !== JSON.stringify(d.names)) { d.names = v.names; news = true; }
        // a move of ours may have been sent while this read was out
        if (!d.pending.length && v.since === d.log.length && v.entries.length) {
          d.log.push(...v.entries);
          news = true;
        }
        if (news) { this.lastNews = this.now(); this.save(); this.env.onNews?.(); }
      } catch (e) {
        if (signal.aborted) return;
        this.netFail(e);
      } finally {
        this.polling = null;
      }
    })();
    return this.polling;
  }

  /** Send our moves, oldest first. A lost reply is fine: the retry finds it already there. */
  flush(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      const d = this.data;
      const signal = this.lifetime.signal;
      try {
        while (d.pending.length && d.seat !== null && d.secret) {
          const a = d.pending[0];
          const i = d.log.length;
          const r = await this.env.api.act({ code: d.code, seat: d.seat, secret: d.secret, i, a }, signal);
          if (signal.aborted) return;
          if (r.ok) {
            d.log.push({ seat: d.seat, a, at: this.now() });
            d.applied++;
            d.pending.shift();
          } else {
            const v = await this.env.api.read(d.code, i, signal);
            if (signal.aborted) return;
            if (v.entries[0] && same(v.entries[0], d.seat, a)) {
              // it had landed; the reply hadn't
              d.log.push(v.entries[0]);
              d.applied++;
              d.pending.shift();
            } else {
              // the page moved on without our move(s): drop them, take the server's
              d.pending = [];
              if (v.since === d.log.length) d.log.push(...v.entries);
              this.save();
              this.env.onDiverged?.();
              break;
            }
          }
          this.save();
        }
        if (this.offline) { this.offline = false; this.env.onNews?.(); }
        this.retry = 0;
      } catch (e) {
        if (signal.aborted) return;
        this.netFail(e);
        this.retry = Math.min(4, this.retry + 1);
      } finally {
        this.flushing = null;
        this.schedule();
      }
    })();
    return this.flushing;
  }

  private netFail(e: unknown) {
    const was = this.offline;
    this.offline = true;
    if (!(e instanceof TypeError)) console.warn("room:", e);
    if (!was) this.env.onNews?.();
  }
}

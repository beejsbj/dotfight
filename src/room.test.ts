import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubRedis } from "../api/_redis-stub";
import { RoomError, rooms, type Rooms } from "../api/_rooms";
import { botAction, botArrange, botBase, botShape } from "./bot";
import { rng } from "./geom";
import { canPlaceBase, illegal, reachOf, type Action, type GameState } from "./game";
import { file, fromRecord, readSave, toRecord, unfile } from "./record";
import { CORE, LONG, SIZES } from "./rules";
import { ENGINE, LONG_ENGINE, READS, apply, canRead, check, drifted, engineFor, fresh, hash, replay, turn, type Payload, type Setup } from "./room-engine";
import { httpApi, RoomHttpError, type RoomApi, type Seat } from "./room-protocol";
import { listRooms, readRoom, RoomLink, type Saved } from "./room";

/** The real store over a stub Redis, behind the same interface as the HTTP client. */
function fakeApi(r: Rooms) {
  const net = { down: false, dropReply: false };
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (net.down) throw new TypeError("Failed to fetch");
    try {
      const out = await fn();
      if (net.dropReply) { net.dropReply = false; throw new TypeError("Failed to fetch"); }
      return out;
    } catch (e) {
      if (e instanceof RoomError) throw new RoomHttpError(e.status, e.message);
      throw e;
    }
  };
  const api: RoomApi = {
    create: (b) => wrap(() => r.create(b)),
    join: (code, name) => wrap(() => r.join({ code, name })),
    read: (code, since) => wrap(() => r.read({ code, since })),
    act: (b) => wrap(async () => {
      try { return { ok: true as const, n: (await r.act(b)).n }; } catch (e) {
        if (e instanceof RoomError && e.status === 409) return { ok: false as const, conflict: true as const, n: e.extra.n as number };
        throw e;
      }
    }),
  };
  return { api, net };
}

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** One phone: its link, and its page, kept the way main.ts keeps it. */
function phone(data: Saved, api: RoomApi) {
  const storage = memStorage();
  let s: GameState = replay(data.setup, data.log).s;
  const p = {
    storage,
    get s() { return s; },
    link: new RoomLink(data, { api, storage, onDiverged: () => { s = replay(p.link.data.setup, p.link.data.log.slice(0, p.link.data.applied)).s; } }),
    /** draw whatever has arrived */
    catchUp() {
      for (let e = p.link.peek(); e; e = p.link.peek()) {
        expect(check(s, e.seat, e.a)).toBeNull();
        p.link.drawn();
        apply(s, e.a as Payload);
        expect(drifted(s, e.a as Payload)).toBe(false);
      }
    },
    move(a: Action) {
      const pl: Payload = { a };
      expect(check(s, p.link.seat!, pl)).toBeNull();
      apply(s, pl);
      p.link.push({ a, h: hash(s) });
    },
  };
  return p;
}

const setup: Setup = { seed: 424242, size: SIZES.quick, rules: CORE, page: { no: 1, date: "26 Sep 2026" } };
const saved = (code: string, seat: Seat | null, secret: string | null, names: Saved["names"]): Saved =>
  ({ v: 1, code, seat, secret, engine: ENGINE, setup, names, log: [], applied: 0, pending: [], updated: 0 });

describe("room link rate limit waits", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const limited = () => new Response('{"retryAfter":2}', { status: 429 });

  it("finishing delivers a throttled winning move before stopping", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(limited())
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response('{"n":1}'));
    const storage = memStorage();
    const link = new RoomLink(saved("abc234", 0, "test", ["B", "D"]), { api: httpApi("/room", fetcher), storage });
    link.start();
    link.push({ winner: 0 });
    link.finish();
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readRoom(storage, link.code)?.pending).toEqual([{ winner: 0 }]);
    await vi.advanceTimersByTimeAsync(2001);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(readRoom(storage, link.code)?.pending).toEqual([]);
    expect(link.data.log[0].a).toEqual({ winner: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([403, 404, 413])("finishing stops retrying a final move refused for good (%i)", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"no"}', { status }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memStorage();
    const link = new RoomLink(saved("abc234", 0, "test", ["B", "D"]), { api: httpApi("/room", fetcher), storage });
    link.start();
    link.push({ winner: 0 });
    link.finish();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(readRoom(storage, link.code)?.pending).toEqual([{ winner: 0 }]);
    warn.mockRestore();
  });

  it("finishing keeps retrying a final move through a server error", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":"down"}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"n":1}'));
    const link = new RoomLink(saved("abc234", 0, "test", ["B", "D"]), { api: httpApi("/room", fetcher), storage: memStorage() });
    link.start();
    link.push({ winner: 0 });
    link.finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(link.data.pending).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains moves and deduplicates push, poll and wake during a wait", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(new Response('{"n":1}'))
      .mockResolvedValueOnce(new Response('{"n":2}'));
    const storage = memStorage();
    const diverged = vi.fn();
    const link = new RoomLink(saved("abc234", 0, "test", ["B", "D"]), { api: httpApi("/room", fetcher), storage, onDiverged: diverged });
    link.start();
    link.push({ move: 1 });
    const sending = link.flush();
    await vi.advanceTimersByTimeAsync(0);
    link.push({ move: 2 });
    link.wake();
    expect(link.poll()).toBe(sending);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readRoom(storage, link.code)?.pending).toEqual([{ move: 1 }, { move: 2 }]);
    expect(link.offline).toBe(false);
    expect(link.broken).toBe("");
    expect(diverged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await sending;
    expect(fetcher.mock.calls[1]).toEqual(fetcher.mock.calls[0]);
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toMatchObject({ i: 1, a: { move: 2 } });
    expect(link.data.pending).toEqual([]);
    expect(link.data.log.map(e => e.a)).toEqual([{ move: 1 }, { move: 2 }]);
    link.stop();
  });

  it("stop cancels a waiting send and preserves moves for restart", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(limited()).mockResolvedValueOnce(new Response('{"n":1}'));
    const storage = memStorage();
    const link = new RoomLink(saved("abc234", 0, "test", ["B", "D"]), { api: httpApi("/room", fetcher), storage });
    link.start();
    link.push({ move: 1 });
    const sending = link.flush();
    await vi.advanceTimersByTimeAsync(0);
    link.stop();
    await sending;
    link.wake();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readRoom(storage, link.code)?.pending).toEqual([{ move: 1 }]);
    expect(link.offline).toBe(false);
    link.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(link.data.pending).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    link.stop();
  });

  it("wake does not bypass a polling wait and stop cancels it", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(limited());
    const link = new RoomLink(saved("abc234", null, null, ["B", "D"]), { api: httpApi("/room", fetcher), storage: memStorage() });
    link.start();
    const reading = link.poll();
    await vi.advanceTimersByTimeAsync(0);
    link.wake();
    await vi.advanceTimersByTimeAsync(1000);
    expect(link.poll()).toBe(reading);
    expect(fetcher).toHaveBeenCalledTimes(1);
    link.stop();
    await reading;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(link.offline).toBe(false);
  });
});

let k = 1;
function botMove(s: GameState): Action {
  if (s.phase === "setup") {
    const shape = s.rules.long ? botShape(rng(k++)) : undefined;
    const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y, shape), k++)!;
    return { t: "base", x: spot.x, y: spot.y, ...(shape && { shape }) };
  }
  if (s.phase === "position") return botArrange(s, k++).find((a) => !illegal(s, a)) ?? { t: "ready" };
  return botAction(s, 1, k++);
}

describe("room engine adapter", () => {
  it("replays a log to the same page, and stops where it stops adding up", () => {
    const s = fresh(setup);
    const log: { seat: Seat; a: Payload }[] = [];
    while (s.phase !== "over" && log.length < 120) {
      const a = botMove(s);
      const seat = turn(s)!;
      apply(s, { a });
      log.push({ seat, a: { a, h: hash(s) } });
    }
    const kinds = new Set(log.map((e) => e.a.a.t));
    expect(kinds.has("arrange") && kinds.has("ready") && kinds.has("flick")).toBe(true);
    const r = replay(setup, log);
    expect(r.s).toEqual(s);
    expect(r.drift).toBeUndefined();
    expect(s.actions).toEqual(log.map((e) => e.a.a));
    const bad = [...log.slice(0, 7), { seat: log[7].seat === 0 ? 1 : 0, a: log[7].a } as { seat: Seat; a: Payload }];
    expect(replay(setup, bad).bad).toBe(7);
    // a hash that doesn't match our page is flagged, not swallowed
    const off = log.map((e, i) => (i === 9 ? { ...e, a: { ...e.a, h: "nope" } } : e));
    expect(replay(setup, off).drift).toBe(9);
    expect(check(fresh(setup), 0, { a: { t: "flick", soldier: 0, kind: "snipe", angle: 0, length: 1, bend: 0, wob: 0 } })).toBeTruthy();
    expect(check(fresh(setup), 0, { a: { t: "base", x: NaN, y: 1 } })).toBeTruthy();
    expect(check(fresh(setup), 0, { a: { t: "nope" } })).toBeTruthy();
    expect(check(fresh(setup), 0, { t: "base", x: 1, y: 1 })).toBe("unknown action");
    expect(check(fresh(setup), 1, { a: { t: "ready" } })).toBe("not their turn");
  });
});

describe("room engines", () => {
  it("new rooms use core-4, or long-1 for the long war, which older clients reject for the reload path", () => {
    expect(ENGINE).toBe("core-4");
    expect(LONG_ENGINE).toBe("long-1");
    expect(READS).toEqual(["core-2", "core-3", "core-4"]); // long-1 joins once the page can play it
    expect(canRead(LONG_ENGINE)).toBe(false);
    expect(engineFor(CORE)).toBe("core-4");
    expect(engineFor(LONG)).toBe("long-1");
    expect(["core-2", "core-3"].includes(ENGINE)).toBe(false);
    expect(canRead("core-1")).toBe(false);
    expect(canRead("core-5")).toBe(false);
  });

  it.each(["core-2", "core-3", "core-4"])("%s rooms, records and saves retain their rules and replay without drift", (engine) => {
    expect(canRead(engine)).toBe(true);
    const { garrison: _g, ...flat } = CORE;
    void _g;
    const rules = engine === "core-4" ? CORE : engine === "core-3" ? { ...flat, reach: { min: 200, max: 1200, curve: 1.5 } } : { ...flat, version: 1, reach: { min: 300, max: 1800 } };
    const old: Setup = JSON.parse(JSON.stringify({ ...setup, rules }));
    const s = fresh(old);
    expect(s.rules.garrison).toEqual(engine === "core-4" ? CORE.garrison : null);
    expect(reachOf(s.rules, 0)).toBe(engine === "core-2" ? 300 : 200);
    expect(reachOf(s.rules, 1)).toBe(engine === "core-2" ? 1800 : engine === "core-3" ? 1200 : CORE.reach.max);
    const log: { seat: Seat; a: Payload }[] = [];
    while (s.phase !== "over" && log.length < 150) {
      const a = botMove(s);
      const seat = turn(s)!;
      apply(s, { a });
      log.push({ seat, a: { a, h: hash(s) } });
      const step = replay(old, log);
      expect(step.s).toEqual(s);
      expect(step.bad).toBeUndefined();
      expect(step.drift).toBeUndefined();
    }
    const r = replay(JSON.parse(JSON.stringify(old)), log);
    expect(r.s).toEqual(s);
    expect(r.drift).toBeUndefined();
    expect(r.bad).toBeUndefined();
    const record = JSON.parse(JSON.stringify({ ...toRecord(s), rules }));
    expect(fromRecord(record)).toEqual(s);
    const filed = JSON.parse(JSON.stringify({ ...file(s, { kind: "pnp" }), rules }));
    expect(unfile(filed)).toEqual(s);
    expect(readSave(JSON.stringify({ s: { ...s, rules }, mode: { kind: "pnp" } }))!.s).toEqual(s);
  });
});

describe("long-1 rooms", () => {
  it("a long war replays from its log, step by step, without drift; and from its record, filed page and save", () => {
    const long: Setup = JSON.parse(JSON.stringify({ seed: 515151, size: SIZES.long, rules: LONG }));
    const s = fresh(long);
    expect(s.rules.long).toEqual(LONG.long);
    const log: { seat: Seat; a: Payload }[] = [];
    let flicks = 0;
    while (s.phase !== "over" && flicks < 12) {
      const a = botMove(s);
      const seat = turn(s)!;
      apply(s, { a });
      log.push({ seat, a: { a, h: hash(s) } });
      if (a.t === "flick") flicks++;
      if (log.length % 20) continue;
      const step = replay(long, log);
      expect(step.s).toEqual(s);
      expect(step.drift).toBeUndefined();
    }
    expect(s.bases.every((b) => b.shape)).toBe(true);
    const r = replay(JSON.parse(JSON.stringify(long)), log);
    expect(r).toEqual({ s, drift: undefined });
    expect(fromRecord(JSON.parse(JSON.stringify(toRecord(s))))).toEqual(s);
    expect(unfile(JSON.parse(JSON.stringify(file(s, { kind: "pnp" }))))).toEqual(s);
    expect(readSave(JSON.stringify({ s, mode: { kind: "pnp" } }))!.s).toEqual(s);
  }, 60_000);

  it("a long war's hash detects interior ink drift and groove ownership", () => {
    const s = fresh({ seed: 9, size: SIZES.long, rules: LONG });
    const mark = { t: "stroke" as const, kind: "snipe" as const, owner: 0 as Seat, pts: [{ x: 100, y: 100 }, { x: 150, y: 120 }, { x: 200, y: 100 }], seed: 1, turn: 1 };
    s.marks.push(mark);
    const original = hash(s);
    mark.pts[1].y = 180;
    expect(hash(s)).not.toBe(original);
    mark.pts[1].y = 120;
    mark.owner = 1;
    expect(hash(s)).not.toBe(original);
  });

  it("a long war's hash notices ink and roads that a core hash wouldn't", () => {
    const s = fresh({ seed: 9, size: SIZES.long, rules: LONG });
    const h = hash(s);
    s.marks.push({ t: "stroke", kind: "snipe", owner: 0, pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }], seed: 1, turn: 1 });
    expect(hash(s)).not.toBe(h);
    const c = fresh(setup);
    const hc = hash(c);
    c.marks.push({ t: "stroke", kind: "snipe", owner: 0, pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }], seed: 1, turn: 1 });
    expect(hash(c)).toBe(hc);
  });
});

describe("room link", () => {
  let r: Rooms, api: RoomApi, net: { down: boolean; dropReply: boolean };
  beforeEach(() => { r = rooms(stubRedis()); ({ api, net } = fakeApi(r)); });

  async function pair() {
    const c = await api.create({ name: "Burooj", engine: ENGINE, setup });
    const j = await api.join(c.code, "Dawood");
    const a = phone(saved(c.code, 0, c.secret, ["Burooj", null]), api);
    const b = phone(saved(c.code, 1, j.secret, ["Burooj", "Dawood"]), api);
    return { a, b, code: c.code };
  }

  /** Whoever's turn it is moves; the other polls and draws it. */
  async function turnOf(a: ReturnType<typeof phone>, b: ReturnType<typeof phone>) {
    const [me, them] = turn(a.s) === 0 ? [a, b] : [b, a];
    me.move(botMove(me.s));
    await me.link.flush();
    await them.link.poll();
    them.catchUp();
  }

  it("two phones play a whole war and end on the same page", async () => {
    const { a, b } = await pair();
    await a.link.poll();
    expect(a.link.names).toEqual(["Burooj", "Dawood"]);
    for (let i = 0; i < 400 && a.s.phase !== "over"; i++) await turnOf(a, b);
    expect(a.s.phase).toBe("over");
    expect(b.s).toEqual(a.s);
    expect(a.link.data.log.map((e) => (e.a as Payload).a)).toEqual(a.s.actions);
  });

  it("a phone that was away catches up from the log", async () => {
    const { a, b } = await pair();
    for (let i = 0; i < 6; i++) await turnOf(a, b);
    // b closes the app: all that survives is its storage
    b.link.save();
    const code = b.link.code;
    const kept = readRoom(b.storage, code)!;
    expect(turn(a.s)).toBe(0);
    a.move(botMove(a.s));
    await a.link.flush();
    // b comes back later
    const b2 = phone(kept, api);
    await b2.link.poll();
    expect(b2.link.queued).toBe(1);
    b2.catchUp();
    expect(b2.s).toEqual(a.s);
    expect(listRooms(b.storage).map((x) => x.code)).toEqual([code]);
  });

  it("moves made offline go when the network comes back", async () => {
    const { a, b } = await pair();
    net.down = true;
    a.move(botMove(a.s));
    await a.link.flush();
    expect(a.link.offline).toBe(true);
    expect(a.link.data.pending).toHaveLength(1);
    net.down = false;
    await a.link.flush();
    expect(a.link.offline).toBe(false);
    expect(a.link.data.pending).toHaveLength(0);
    await b.link.poll();
    b.catchUp();
    expect(b.s).toEqual(a.s);
  });

  it("a lost reply doesn't double the move", async () => {
    const { a, b } = await pair();
    net.dropReply = true;
    a.move(botMove(a.s));
    await a.link.flush(); // landed, but we never heard
    expect(a.link.data.pending).toHaveLength(1);
    await a.link.flush(); // the retry gets a 409 and finds its own move there
    expect(a.link.data.pending).toHaveLength(0);
    expect((await api.read(a.link.code)).n).toBe(1);
    await b.link.poll();
    b.catchUp();
    expect(b.s).toEqual(a.s);
  });

  it("a stale double-tap is refused and the page stays put", async () => {
    const { a, b } = await pair();
    await turnOf(a, b);
    const first = a.link.data.log[0];
    const again = await api.act({ code: a.link.code, seat: 0, secret: a.link.data.secret!, i: 0, a: first.a });
    expect(again).toEqual({ ok: false, conflict: true, n: 1 });
    expect((await api.read(a.link.code)).n).toBe(1);
  });

  it("if the page moved on without our move, we drop it and take the server's", async () => {
    const { a, b, code } = await pair();
    // a second device on seat 0 (same secret) gets there first
    const twin = phone(saved(code, 0, a.link.data.secret, ["Burooj", "Dawood"]), api);
    twin.move(botMove(twin.s));
    await twin.link.flush();
    a.move(botMove(a.s)); // a different camp, same index
    await a.link.flush();
    expect(a.link.data.pending).toHaveLength(0);
    a.catchUp();
    expect(a.s).toEqual(twin.s);
    await b.link.poll();
    b.catchUp();
    expect(b.s).toEqual(twin.s);
  });

  it("watchers read along but can't write", async () => {
    const { a, b, code } = await pair();
    const w = await api.join(code, "Someone");
    expect(w.seat).toBeNull();
    const watcher = phone(saved(code, null, null, ["Burooj", "Dawood"]), api);
    for (let i = 0; i < 4; i++) await turnOf(a, b);
    watcher.link.push(botMove(watcher.s)); // ignored
    await watcher.link.poll();
    watcher.catchUp();
    expect(watcher.s).toEqual(a.s);
    expect(watcher.link.data.pending).toHaveLength(0);
  });

  it("polls fast while waiting, then backs off", () => {
    let t = 0;
    const l = new RoomLink(saved("abc234", 0, "s", ["B", null]), { api, storage: memStorage(), now: () => t });
    expect(l.pollDelay()).toBe(1500);
    t = 3 * 60e3;
    expect(l.pollDelay()).toBe(4000);
    t = 20 * 60e3;
    expect(l.pollDelay()).toBe(10000);
  });
});

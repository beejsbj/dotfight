// The room store against a stub Redis that runs each Lua script's logic in JS.
// Set ROOM_TEST_REDIS_URL / ROOM_TEST_REDIS_TOKEN (an Upstash REST endpoint, or
// a local serverless-redis-http proxy) to run the same tests against the real
// Lua on a real Redis.

import { Redis } from "@upstash/redis";
import { beforeEach, describe, expect, it } from "vitest";
import { CODE_RE, cleanName, RoomError, rooms, SCRIPTS, TTL_S, type Evaluator, type Rooms } from "./_rooms";

declare const process: { env: Record<string, string | undefined> };

/** Just enough Redis for our four scripts: hashes, lists and TTLs. */
export function stubRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const lists = new Map<string, string[]>();
  const ttl = new Map<string, number>();
  const exists = (k: string) => hashes.has(k) || lists.has(k);
  const ev: Evaluator & { hashes: typeof hashes; lists: typeof lists; ttl: typeof ttl } = {
    hashes, lists, ttl,
    async eval(script, [m, log], a) {
      if (script === SCRIPTS.create) {
        if (exists(m)) return 0;
        hashes.set(m, new Map([["v", "1"], ["engine", a[0]], ["setup", a[1]], ["theme", a[2]], ["created", a[3]], ["name0", a[4]], ["secret0", a[5]]]));
        ttl.set(m, +a[6]);
        return 1;
      }
      if (script === SCRIPTS.join) {
        const h = hashes.get(m);
        if (!h) return -1;
        for (const seat of [0, 1]) {
          if (!h.has(`secret${seat}`)) {
            h.set(`name${seat}`, a[0]);
            h.set(`secret${seat}`, a[1]);
            ttl.set(m, +a[2]);
            if (lists.has(log)) ttl.set(log, +a[2]);
            return seat;
          }
        }
        return -2;
      }
      if (script === SCRIPTS.append) {
        const secret = hashes.get(m)?.get(`secret${a[0]}`);
        if (secret === undefined) return [-1, 0];
        if (secret !== a[1]) return [-2, 0];
        const l = lists.get(log) ?? [];
        if (l.length !== +a[2]) return [-3, l.length];
        if (l.length >= +a[5]) return [-4, l.length];
        l.push(a[3]);
        lists.set(log, l);
        ttl.set(m, +a[4]);
        ttl.set(log, +a[4]);
        return [1, l.length];
      }
      if (script === SCRIPTS.read) {
        const h = hashes.get(m);
        if (!h) return null;
        const l = lists.get(log) ?? [];
        const g = (k: string) => h.get(k) ?? "";
        return [g("engine"), g("setup"), g("theme"), h.get("created") ?? "0", g("name0"), g("name1"), h.has("secret1") ? 1 : 0, l.length, l.slice(+a[0])];
      }
      throw new Error("unknown script");
    },
  };
  return ev;
}

const live = process.env.ROOM_TEST_REDIS_URL;
const backends: [string, () => Evaluator][] = [["stub", () => stubRedis()]];
if (live) {
  const redis = new Redis({ url: live, token: process.env.ROOM_TEST_REDIS_TOKEN ?? "", automaticDeserialization: false });
  backends.push(["live redis", () => ({ eval: (s, k, a) => redis.eval(s, k, a) })]);
}

const fail = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { if (e instanceof RoomError) return { status: e.status, ...e.extra }; throw e; }
  throw new Error("expected a RoomError");
};

describe.each(backends)("room store (%s)", (_, make) => {
  let r: Rooms;
  beforeEach(() => { r = rooms(make()); });

  const setup = { seed: 1234567, page: { no: 3, date: "26 Sep 2026" } };
  const open = async () => {
    const a = await r.create({ name: "Burooj", engine: "flick-1", setup, theme: "lamplight" });
    const b = await r.join({ code: a.code, name: "Dawood" });
    return { a, b: b as { seat: 1; secret: string } };
  };

  it("creates a room with a short code, and reads it back without secrets", async () => {
    const a = await r.create({ name: "  Burooj ", engine: "flick-1", setup });
    expect(a.code).toMatch(CODE_RE);
    expect(a.seat).toBe(0);
    expect(a.secret).toMatch(/^[0-9a-f]{32}$/);
    const v = await r.read({ code: a.code });
    expect(v).toMatchObject({ code: a.code, engine: "flick-1", setup, names: ["Burooj", null], n: 0, since: 0, entries: [] });
    expect(JSON.stringify(v)).not.toContain(a.secret);
  });

  it("gives the free seat to the first friend; everyone after watches", async () => {
    const { a, b } = await open();
    expect(b.seat).toBe(1);
    expect(b.secret).not.toBe(a.secret);
    expect(await r.join({ code: a.code, name: "Someone" })).toEqual({ seat: null, secret: null });
    expect((await r.read({ code: a.code })).names).toEqual(["Burooj", "Dawood"]);
  });

  it("appends only at the log's length (compare-and-set)", async () => {
    const { a, b } = await open();
    expect(await r.act({ code: a.code, seat: 0, secret: a.secret, i: 0, a: { t: "base", x: 1, y: 2 } })).toEqual({ n: 1 });
    // a stale double-tap of the same move
    expect(await fail(r.act({ code: a.code, seat: 0, secret: a.secret, i: 0, a: { t: "base", x: 1, y: 2 } }))).toEqual({ status: 409, n: 1 });
    // a move from the future
    expect(await fail(r.act({ code: a.code, seat: 1, secret: b.secret, i: 5, a: {} }))).toEqual({ status: 409, n: 1 });
    expect(await r.act({ code: a.code, seat: 1, secret: b.secret, i: 1, a: { t: "base", x: 3, y: 4 } })).toEqual({ n: 2 });
    const v = await r.read({ code: a.code, since: 1 });
    expect(v.n).toBe(2);
    expect(v.since).toBe(1);
    expect(v.entries).toEqual([{ seat: 1, a: { t: "base", x: 3, y: 4 }, at: expect.any(Number) }]);
  });

  it("only the seat's own device can write for it", async () => {
    const { a, b } = await open();
    expect(await fail(r.act({ code: a.code, seat: 0, secret: b.secret, i: 0, a: 1 }))).toMatchObject({ status: 403 });
    expect(await fail(r.act({ code: a.code, seat: 1, secret: "nope", i: 0, a: 1 }))).toMatchObject({ status: 403 });
    const solo = await r.create({ name: "Burooj", engine: "flick-1", setup });
    expect(await fail(r.act({ code: solo.code, seat: 1, secret: "", i: 0, a: 1 }))).toMatchObject({ status: 404 });
  });

  it("keeps floating-point actions exact", async () => {
    const { a } = await open();
    const f = { soldierId: 3, kind: "shoot", angle: 0.1 + 0.2, length: 1234.5678901234567, bend: -1e-17 };
    await r.act({ code: a.code, seat: 0, secret: a.secret, i: 0, a: { t: "flick", f } });
    expect((await r.read({ code: a.code })).entries[0].a).toEqual({ t: "flick", f });
  });

  it("turns away nonsense", async () => {
    expect(await fail(r.create({ name: "", engine: "flick-1", setup }))).toMatchObject({ status: 400 });
    expect(await fail(r.create({ name: "x", engine: 7, setup }))).toMatchObject({ status: 400 });
    expect(await fail(r.read({ code: "../etc" }))).toMatchObject({ status: 404 });
    expect(await fail(r.read({ code: "zzzzzz" }))).toMatchObject({ status: 404 });
    expect(await fail(r.join({ code: "zzzzzz", name: "x" }))).toMatchObject({ status: 404 });
    const { a } = await open();
    expect(await fail(r.act({ code: a.code, seat: 0, secret: a.secret, i: -1, a: 1 }))).toMatchObject({ status: 400 });
    expect(await fail(r.act({ code: a.code, seat: 0, secret: a.secret, i: 0, a: "x".repeat(5000) }))).toMatchObject({ status: 413 });
  });
});

describe("room store (stub only)", () => {
  it("refreshes the 30-day TTL on every move", async () => {
    const redis = stubRedis();
    const r = rooms(redis);
    const a = await r.create({ name: "B", engine: "e", setup: 1 });
    redis.ttl.set(`room:${a.code}:m`, 5);
    await r.act({ code: a.code, seat: 0, secret: a.secret, i: 0, a: 1 });
    expect(redis.ttl.get(`room:${a.code}:m`)).toBe(TTL_S);
    expect(redis.ttl.get(`room:${a.code}:log`)).toBe(TTL_S);
  });

  it("cleans names", () => {
    expect(cleanName("  <b>Dawood</b>\n ")).toBe("bDawood/b");
    expect(cleanName("x".repeat(40))).toHaveLength(24);
    expect(cleanName(42)).toBe("");
  });
});

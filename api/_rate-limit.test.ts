import { describe, expect, it, vi } from "vitest";
import { clientIp, rateLimit, type RoomOp } from "./_rate-limit";
import { stubRedis } from "./_redis-stub";
import { RATE_LIMITS, SCRIPTS } from "./_rooms";
import { roomHandler } from "./room";

const request = (ip = "192.0.2.1") => new Request("http://localhost/api/room", { headers: { "x-real-ip": ip } });

describe("room rate limiter (Lua emulated by stub)", () => {
  it.each(Object.keys(RATE_LIMITS) as RoomOp[])("admits the %s budget and rejects the next request", async (op) => {
    const redis = stubRedis();
    const b = RATE_LIMITS[op];
    for (let i = 0; i < b.requests; i++) await rateLimit(redis, request(), op);
    await expect(rateLimit(redis, request(), op)).rejects.toMatchObject({ status: 429, extra: { retryAfter: expect.any(Number) } });
    expect(redis.ttl.get(`room-rate:${op}:192.0.2.1`)).toBe(b.windowSeconds);
  });

  it("resets at expiry; refusals don't extend the window", async () => {
    let now = 0;
    const redis = stubRedis(() => now);
    for (let i = 0; i < RATE_LIMITS.create.requests; i++) await rateLimit(redis, request(), "create");
    now = 1000;
    await expect(rateLimit(redis, request(), "create")).rejects.toMatchObject({ extra: { retryAfter: 3599 } });
    now = 3600000;
    await expect(rateLimit(redis, request(), "create")).resolves.toBeUndefined();
  });

  it("keeps IPs and operations separate, but shares the budget across rooms", async () => {
    const redis = stubRedis();
    for (let i = 0; i < RATE_LIMITS.create.requests; i++) await rateLimit(redis, request(), "create");
    await expect(rateLimit(redis, request("192.0.2.2"), "create")).resolves.toBeUndefined();
    for (const op of ["join", "read", "act"] as const) await expect(rateLimit(redis, request(), op)).resolves.toBeUndefined();
    await expect(rateLimit(redis, request(), "create")).rejects.toMatchObject({ status: 429 });
  });

  it("chooses real IP, then first forwarded IP, then a shared fallback", () => {
    const req = (headers: Record<string, string>) => new Request("http://localhost", { headers });
    expect(clientIp(req({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "192.0.2.2, 192.0.2.3" }))).toBe("192.0.2.1");
    expect(clientIp(req({ "x-real-ip": " ", "x-forwarded-for": "192.0.2.2, 192.0.2.3" }))).toBe("192.0.2.2");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("admits exactly the budget during concurrent attempts", async () => {
    const redis = stubRedis();
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => rateLimit(redis, request(), "create")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(RATE_LIMITS.create.requests);
  });

  it("allows a long NAT-shared game and a full-log reconnect burst", async () => {
    let now = 0;
    const redis = stubRedis(() => now);
    // Two phones at the fastest 1.5-second poll cadence for an hour.
    for (let minute = 0; minute < 60; minute++) {
      for (let poll = 0; poll < 40; poll++) {
        await rateLimit(redis, request(), "read");
        await rateLimit(redis, request(), "read");
        now += 1500;
      }
    }
    // Catch-up can post every possible log entry, sequentially with no delay.
    for (let i = 0; i < 3000; i++) await rateLimit(redis, request(), "act");
    await expect(rateLimit(redis, request(), "read")).resolves.toBeUndefined();
  });

  it("returns a 429 header/body and never runs room Lua after rejection", async () => {
    const redis = stubRedis(() => 0);
    const spy = vi.spyOn(redis, "eval");
    const handler = roomHandler(redis);
    const post = () => new Request("http://localhost/api/room", { method: "POST", headers: { "x-real-ip": "192.0.2.1", "content-type": "application/json" }, body: JSON.stringify({ op: "create", name: "B", engine: "core-2", setup: {} }) });
    for (let i = 0; i < RATE_LIMITS.create.requests; i++) expect((await handler.POST(post())).status).toBe(200);
    spy.mockClear();
    const response = await handler.POST(post());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await response.json()).toEqual({ error: "too many room requests; wait and retry", retryAfter: 3600 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls.some(([s]) => s === SCRIPTS.create)).toBe(false);
  });

  it("charges invalid reads and join/act attempts before room lookup", async () => {
    const redis = stubRedis(() => 0);
    const handler = roomHandler(redis);
    for (const op of ["read", "join", "act"] as const) {
      const req = () => op === "read" ? request() : new Request("http://localhost/api/room", { method: "POST", body: JSON.stringify({ op }) });
      const run = () => op === "read" ? handler.GET(req()) : handler.POST(req());
      for (let i = 0; i < RATE_LIMITS[op].requests; i++) expect((await run()).status).toBe(404);
      expect((await run()).status).toBe(429);
    }
  });
});

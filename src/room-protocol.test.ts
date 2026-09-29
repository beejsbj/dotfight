import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpApi, RoomHttpError, type RoomApi } from "./room-protocol";

describe("room HTTP rate limits", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-29T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  const operations: [string, (api: RoomApi) => Promise<unknown>][] = [
    ["create", api => api.create({ name: "B", engine: "core", setup: { seed: 1 } })],
    ["join", api => api.join("abc234", "Dawood")],
    ["read", api => api.read("abc234", 3)],
    ["act", api => api.act({ code: "abc234", seat: 0, secret: "test", i: 3, a: { t: "ready" } })],
  ];
  it.each(operations)("waits and repeats the exact %s request through repeated 429s", async (_name, operation) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ retryAfter: 99 }), { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ n: 4, code: "abc234", seat: 0, secret: "test" })));
    let settled = false;
    const result = operation(httpApi("/room", fetcher)).then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1]).toEqual(fetcher.mock.calls[0]);
    expect(fetcher.mock.calls[2]).toEqual(fetcher.mock.calls[0]);
  });

  it.each([
    ["create", (api: RoomApi, signal: AbortSignal) => api.create({ name: "B", engine: "core", setup: { seed: 1 } }, signal)],
    ["join", (api: RoomApi, signal: AbortSignal) => api.join("abc234", "Dawood", signal)],
  ] as const)("cancels %s during repeated 429 waits without another request", async (_name, operation) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementation(async () => new Response("{}", { status: 429, headers: { "retry-after": "1" } }));
    const controller = new AbortController();
    const result = operation(httpApi("/room", fetcher), controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetcher.mock.calls[1][1]?.signal).toBe(controller.signal);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["HTTP date", "Tue, 29 Sep 2026 12:00:03 GMT", {}, 3000],
    ["JSON fallback", "invalid", { retryAfter: 2 }, 2000],
    ["missing header", undefined, { retryAfter: 2 }, 2000],
    ["default", undefined, {}, 1000],
  ] as const)("uses %s wait", async (_name, header, body, delay) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 429, headers: header ? { "retry-after": header } : {} }))
      .mockResolvedValueOnce(new Response("{}"));
    const result = httpApi("/room", fetcher).read("abc234");
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("still distinguishes a real conflict and refusal after waiting", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response('{"n":4}', { status: 409 }))
      .mockResolvedValueOnce(new Response('{"error":"no seat"}', { status: 403 }));
    const api = httpApi("/room", fetcher);
    const move = api.act({ code: "abc234", seat: 0, secret: "test", i: 3, a: {} });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await move).toEqual({ ok: false, conflict: true, n: 4 });
    await expect(api.read("abc234")).rejects.toBeInstanceOf(RoomHttpError);
  });
});

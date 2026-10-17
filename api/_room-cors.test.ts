import { describe, expect, it } from "vitest";
import { APP_ORIGINS, GET, OPTIONS, POST, preflight, withCors } from "./room";

const req = (origin?: string, init: RequestInit = {}) =>
  new Request("https://dotfight.vercel.app/api/room?code=abc234", { ...init, headers: { ...(origin && { origin }), ...init.headers } });

describe("the room API and the store apps", () => {
  it("lets the iOS and Android apps read it", () => {
    expect(APP_ORIGINS).toEqual(["capacitor://localhost", "https://localhost"]);
    for (const origin of APP_ORIGINS) {
      const r = withCors(req(origin), new Response("{}"));
      expect(r.headers.get("access-control-allow-origin")).toBe(origin);
      expect(r.headers.get("access-control-expose-headers")).toBe("retry-after");
      expect(r.headers.get("vary")).toMatch(/origin/);
    }
  });

  it("leaves the web's same-origin responses as they were, and other sites out", () => {
    for (const origin of [undefined, "https://dotfight.vercel.app", "https://evil.example", "http://localhost", "capacitor://evil"]) {
      const r = withCors(req(origin), new Response("{}"));
      expect(r.headers.get("access-control-allow-origin"), origin).toBe(null);
      expect(r.headers.get("vary"), origin).toBe(null);
    }
  });

  it("answers an app's preflight for a JSON POST", async () => {
    const r = await OPTIONS(req("capacitor://localhost", { method: "OPTIONS", headers: { "access-control-request-method": "POST", "access-control-request-headers": "content-type" } }));
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
    expect(r.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(preflight(req("https://evil.example")).headers.get("access-control-allow-methods")).toBe(null);
  });

  it("carries the headers on the real handlers, errors included", async () => {
    // no store configured in tests: a 503, which an app must still be able to read
    const g = await GET(req("https://localhost"));
    expect(g.status).toBe(503);
    expect(g.headers.get("access-control-allow-origin")).toBe("https://localhost");
    const p = await POST(req("capacitor://localhost", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(p.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect((await GET(req())).headers.get("access-control-allow-origin")).toBe(null);
  });
});

import { describe, expect, it } from "vitest";
import {
  createHaptics, detect, DETENTS, Gate, IOS_TICK_GAP, iosMode, length, MIN_GAP, pattern, Ratchet, STORAGE_KEY,
  type Backend, type BackendKind, type HapticEvent, type Pattern,
} from "./haptics";

const EVENTS: HapticEvent[] = ["tap", "pickup", "notch", "brink", "wobble", "flick", "settle", "land", "kill", "thud", "turn", "stand", "over"];

describe("pattern", () => {
  it("gives every event a playable pattern on both backends", () => {
    for (const ev of EVENTS) for (const arg of [0, 0.5, 1, 2, 5]) {
      const p = pattern(ev, arg);
      expect(p.android.length % 2, ev).toBe(1); // ends on a pulse, not a pause
      expect(p.android.every((d) => Number.isInteger(d) && d > 0), ev).toBe(true);
      expect(p.ios[0], ev).toBe(0); // the first tick lands with the event
      for (let i = 1; i < p.ios.length; i++) expect(p.ios[i] - p.ios[i - 1], ev).toBeGreaterThanOrEqual(IOS_TICK_GAP);
      expect(length(p, "vibrate"), ev).toBeLessThanOrEqual(420); // weight, never a buzz
    }
  });

  it("builds the ratchet up as power builds, with full power its own detent", () => {
    const soft = pattern("notch", 0).android[0], mid = pattern("notch", 0.5).android[0];
    expect(mid).toBeGreaterThan(soft);
    const full = pattern("notch", 1);
    expect(full.android[0]).toBeGreaterThan(pattern("notch", 0.96).android[0]);
    expect(full.ios).toHaveLength(2);
  });

  it("flicks harder the harder you pulled", () => {
    expect(pattern("flick", 1).android[0]).toBeGreaterThan(pattern("flick", 0.1).android[0]);
  });

  it("knocks once for the first cross on a line and twice for every one after", () => {
    const one = pattern("kill", 1), two = pattern("kill", 2), four = pattern("kill", 4);
    expect(one.android).toHaveLength(1);
    expect(one.ios).toHaveLength(1);
    expect(two.android).toHaveLength(3);
    expect(two.ios).toHaveLength(2);
    expect(four.android[2]).toBeGreaterThan(two.android[2]);
    expect(pattern("kill").android).toEqual(one.android); // no index: a single cross
  });

  it("ranks the moments: the end of the war over a cross over a flick over the ratchet", () => {
    const pr = (ev: HapticEvent) => pattern(ev).priority;
    expect(pr("over")).toBeGreaterThan(pr("kill"));
    expect(pr("thud")).toBeGreaterThan(pr("kill"));
    expect(pr("kill")).toBeGreaterThan(pr("flick"));
    expect(pr("flick")).toBeGreaterThan(pr("notch"));
    expect(pr("tap")).toBe(1);
    expect(pr("settle")).toBe(1);
  });

  it("measures how long a pattern keeps the motor busy", () => {
    const p: Pattern = { android: [10, 20, 30], ios: [0, 70, 140], priority: 1 };
    expect(length(p, "vibrate")).toBe(60);
    expect(length(p, "switch")).toBe(140);
  });
});

describe("Gate", () => {
  it("drops anything that doesn't outrank what was felt a moment ago", () => {
    const g = new Gate();
    expect(g.allow(1, 0, 5)).toBe(true);
    expect(g.allow(1, 10, 5)).toBe(false);
    expect(g.allow(1, MIN_GAP - 1, 5)).toBe(false);
    expect(g.allow(1, MIN_GAP, 5)).toBe(true);
  });

  it("lets a bigger moment cut in at once", () => {
    const g = new Gate();
    g.allow(1, 0, 5);
    expect(g.allow(4, 5, 30)).toBe(true);
    expect(g.allow(2, 10, 5)).toBe(false);
  });

  it("holds lesser events back until a long pattern has played out", () => {
    const g = new Gate();
    g.allow(6, 0, 400);
    expect(g.allow(1, 200, 5)).toBe(false);
    expect(g.allow(5, 200, 5)).toBe(false);
    expect(g.allow(1, 401, 5)).toBe(true);
  });

  it("lets each cross on a line knock, cutting the last one short, but not closer than MIN_GAP", () => {
    const g = new Gate();
    g.allow(4, 0, 120);
    expect(g.allow(4, 20, 120)).toBe(false);
    expect(g.allow(4, 80, 120)).toBe(true);
  });

  it("caps a scrubbing thumb at one tick per MIN_GAP", () => {
    const g = new Gate();
    let n = 0;
    for (let t = 0; t < 1000; t += 5) if (g.allow(1, t, 8)) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(1000 / MIN_GAP));
  });
});

describe("Ratchet", () => {
  it("clicks each detent once on the way up, denser toward full power", () => {
    const r = new Ratchet();
    const clicks: number[] = [];
    for (let p = 0; p <= 1.0001; p += 0.01) { const d = r.step(Math.min(1, p), true); if (d !== null) clicks.push(d); }
    expect(clicks).toEqual(DETENTS.map((_, i) => i));
    const gaps = DETENTS.slice(1).map((d, i) => d - DETENTS[i]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
  });

  it("says nothing before the pull goes live", () => {
    const r = new Ratchet();
    expect(r.step(0, false)).toBeNull();
    expect(r.step(0, true)).toBe(0);
  });

  it("reports only the highest detent when a fast pull skips several", () => {
    const r = new Ratchet();
    r.step(0, true);
    expect(r.step(0.6, true)).toBe(3);
    expect(r.step(0.61, true)).toBeNull();
  });

  it("doesn't chatter when a thumb trembles on a detent", () => {
    const r = new Ratchet();
    r.step(0, true);
    expect(r.step(0.37, true)).toBe(2);
    expect(r.step(0.36, true)).toBeNull();
    expect(r.step(0.37, true)).toBeNull();
    // eased clearly back, it clicks again
    expect(r.step(0.3, true)).toBeNull();
    expect(r.step(0.38, true)).toBe(2);
  });

  it("feels the wobble start once per pull", () => {
    const r = new Ratchet();
    expect(r.shake(false)).toBe(false);
    expect(r.shake(true)).toBe(true);
    expect(r.shake(true)).toBe(false);
    r.reset();
    expect(r.shake(true)).toBe(true);
  });
});

describe("detect", () => {
  it("uses vibrate wherever it exists (Android)", () => {
    expect(detect({ vibrate: () => true, maxTouchPoints: 5 })).toBe("vibrate");
    expect(detect({ vibrate: () => true, maxTouchPoints: 5, hasSwitch: true })).toBe("vibrate");
  });
  it("uses the switch on a touch screen that knows it (iPhone, Safari 18+)", () => {
    expect(detect({ maxTouchPoints: 5, hasSwitch: true })).toBe("switch");
  });
  it("stays silent on a Mac, an old iPhone, or no browser at all", () => {
    expect(detect({ maxTouchPoints: 0, hasSwitch: true })).toBe("none");
    expect(detect({ maxTouchPoints: 5, hasSwitch: false })).toBe("none");
    expect(detect({ vibrate: "nope", maxTouchPoints: 5 })).toBe("none");
    expect(detect({ vibrate: () => true, maxTouchPoints: 0 })).toBe("none"); // desktop Chrome
    expect(detect({})).toBe("none");
    // iOS 17.4 knows `switch` but never ticks it
    expect(detect({ maxTouchPoints: 5, hasSwitch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile/15E148 Safari/604.1" })).toBe("none");
    expect(detect({ maxTouchPoints: 5, hasSwitch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1" })).toBe("switch");
    // iPads have no Taptic Engine, whether they say iPad or pose as a Mac
    expect(detect({ maxTouchPoints: 5, hasSwitch: true, ua: "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1" })).toBe("none");
    expect(detect({ maxTouchPoints: 5, hasSwitch: true, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15" })).toBe("none");
  });
});

describe("iosMode", () => {
  const safari = (os: string, v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Mobile/15E148 Safari/604.1`;
  const app = (os: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;
  it("lets script tick up to iOS 26.4", () => {
    expect(iosMode(safari("18_0", "18.0"))).toBe("script");
    expect(iosMode(safari("18_6", "26.0"))).toBe("script");
    expect(iosMode(safari("18_6", "26.4.1"))).toBe("script");
  });
  it("needs real taps from iOS 26.5 on", () => {
    expect(iosMode(safari("18_6", "26.5"))).toBe("tap");
    expect(iosMode(safari("18_6", "27.0"))).toBe("tap");
  });
  it("reads the OS where there's no Safari version (home-screen app, other browsers), and plays safe on the frozen 18_6", () => {
    expect(iosMode(app("18_3"))).toBe("script");
    expect(iosMode(app("18_6"))).toBe("tap");
    expect(iosMode("")).toBe("tap");
  });
});

function rig(kind: BackendKind = "vibrate", stored: Record<string, string> = {}) {
  let t = 1000;
  const played: Pattern[] = [];
  let cancelled = 0;
  const backend: Backend = { kind, play: (p) => played.push(p), cancel: () => cancelled++ };
  const mem = { ...stored };
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const h = createHaptics({ backend, now: () => t, storage, log: true });
  return { h, played, mem, advance: (ms: number) => { t += ms; }, cancelled: () => cancelled };
}

describe("createHaptics", () => {
  it("is on by default and plays through the backend", () => {
    const { h, played } = rig();
    expect(h.enabled).toBe(true);
    expect(h.fire("pickup")).toBe(true);
    expect(played).toEqual([pattern("pickup")]);
  });

  it("remembers being switched off, next to the sound mute", () => {
    const { h, played, mem, cancelled } = rig();
    h.setEnabled(false);
    expect(mem[STORAGE_KEY]).toBe("0");
    expect(cancelled()).toBe(1);
    expect(h.fire("over")).toBe(false);
    expect(played).toHaveLength(0);
    expect(rig("vibrate", { [STORAGE_KEY]: "0" }).h.enabled).toBe(false);
    expect(rig("vibrate", { [STORAGE_KEY]: "1" }).h.enabled).toBe(true);
  });

  it("logs what was felt, in order, and nothing the gate dropped", () => {
    const { h, advance } = rig("switch");
    h.fire("pickup");
    advance(10);
    h.fire("notch", 0); // too soon after the pick-up
    advance(100);
    h.fire("notch", 0.4);
    advance(300);
    h.fire("flick", 0.8);
    advance(200);
    h.fire("kill", 1);
    advance(150);
    h.fire("kill", 2);
    expect(h.felt.map((f) => f.ev)).toEqual(["pickup", "notch", "flick", "kill", "kill"]);
    expect(h.felt[4]).toMatchObject({ arg: 2, backend: "switch", ios: [0, 75] });
  });

  it("reports whether there's anything to feel", () => {
    expect(rig("none").h.supported).toBe(false);
    expect(rig("switch").h.supported).toBe(true);
  });
});

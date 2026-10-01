import { beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => {
  const gains: any[] = [];
  const starts: number[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node = () => ({
    gain: param(), frequency: param(), Q: param(),
    connect(target: unknown) { return target; }, disconnect: vi.fn(),
    start(at: number) { starts.push(at); }, stop: vi.fn(),
  });
  const room = node();
  const ac = {
    currentTime: 0,
    createGain() { const g = node(); gains.push(g); return g; },
    createBiquadFilter: node, createOscillator: node, createBufferSource: node,
  };
  return { gains, starts, ac, room, bus: { ac, out: room, noise: {} } };
});
vi.mock("./sound", () => ({ bus: () => audio.bus, muted: false }));
import { allowedScheduled, reset, say, setLevel } from "./voice";

describe("page-scoped voice playback", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    reset();
    audio.gains.length = 0; audio.starts.length = 0;
    audio.ac.currentTime = 0;
    setLevel(1);
  });

  it("does not let later volley voices suppress an earlier nonoverlapping flick voice", () => {
    say("gasp", 1, 0, 3);
    say("jab", 2, 0, 4);
    const count = audio.starts.length;
    say("gasp", 3, 0, 0);
    expect(audio.starts.length).toBeGreaterThan(count);
  });

  it("enforces cooldown, spacing and actual peak concurrency in either booking order", () => {
    const booked = [{ what: "gasp" as const, start: 3, end: 3.2 }, { what: "jab" as const, start: 4, end: 4.1 }];
    expect(allowedScheduled({ what: "gasp", start: 0, end: 0.2 }, booked)).toBe(true);
    expect(allowedScheduled({ what: "gasp", start: 1, end: 1.2 }, booked)).toBe(false);
    expect(allowedScheduled({ what: "look", start: 2.9, end: 3.1 }, booked)).toBe(false);
    // A long phrase overlapping two successive voices still has only two at once.
    expect(allowedScheduled({ what: "wheee", start: 2, end: 4.2 }, booked)).toBe(true);
    expect(allowedScheduled({ what: "wheee", start: 2, end: 4.2 }, [...booked, { what: "oh", start: 3.1, end: 3.5 }])).toBe(false);
  });

  it("disconnects delayed voices without disconnecting room sounds, and permits the new page's first voice", () => {
    say("gasp", 1, 0, 3);
    const old = audio.gains[0];
    expect(audio.starts.some((at) => at >= 3)).toBe(true);
    reset();
    expect(old.disconnect).toHaveBeenCalledOnce();
    expect(audio.room.disconnect).not.toHaveBeenCalled();
    const count = audio.starts.length;
    say("gasp", 1, 0, 3);
    expect(audio.starts.length).toBeGreaterThan(count);
    expect(audio.gains.some((g) => g !== old && !g.disconnect.mock.calls.length)).toBe(true);
  });

  it("turns down the active voice output immediately even when the next say is skipped", () => {
    say("gasp", 1, 0, 3);
    const out = audio.gains[0];
    audio.ac.currentTime = 1;
    setLevel(0);
    expect(out.gain.setValueAtTime).toHaveBeenCalledWith(0, 1);
    const count = audio.starts.length;
    say("look", 2, 0);
    expect(audio.starts).toHaveLength(count);
  });
});

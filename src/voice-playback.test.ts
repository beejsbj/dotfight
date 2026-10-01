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
import { reset, say, setLevel } from "./voice";

describe("page-scoped voice playback", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    reset();
    audio.gains.length = 0; audio.starts.length = 0;
    audio.ac.currentTime = 0;
    setLevel(1);
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

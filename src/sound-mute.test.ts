import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./theme", () => ({ theme: {} }));
let gains: any[], starts: number[], context: any;

beforeEach(() => {
  vi.resetModules();
  gains = []; starts = [];
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node = () => ({
    gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(),
    connect(target: unknown) { return target; }, disconnect: vi.fn(),
    start(at: number) { starts.push(at); }, stop: vi.fn(),
  });
  context = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: {},
    createBuffer: () => ({ getChannelData: () => new Float32Array(4) }),
    createGain: () => { const g = node(); gains.push(g); return g; },
    createDynamicsCompressor: node, createBiquadFilter: node, createOscillator: node, createBufferSource: node,
  };
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
});

describe("master mute for scheduled voices", () => {
  it("silences a voice already queued, preserving audio nodes and restoring the master level", async () => {
    const sound = await import("./sound"), voice = await import("./voice");
    sound.unlock();
    voice.say("gasp", 1, 0, 3);
    expect(starts.some((t) => t === 3)).toBe(true);
    const master = gains[0];
    context.currentTime = 1;
    sound.setMuted(true);
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 1);
    expect(gains.every((g) => g.disconnect.mock.calls.length === 0)).toBe(true);
    const count = starts.length;
    voice.say("look", 2, 0);
    expect(starts).toHaveLength(count);
    context.currentTime = 2;
    sound.setMuted(false);
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(0.9, 2);
  });

  it("keeps an audio bus first unlocked while muted silent", async () => {
    const sound = await import("./sound");
    sound.setMuted(true);
    sound.unlock();
    expect(gains[0].gain.value).toBe(0);
    expect(sound.bus()).toBeNull();
    sound.setMuted(false);
    expect(gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0.9, 0);
    expect(sound.bus()).not.toBeNull();
  });
});

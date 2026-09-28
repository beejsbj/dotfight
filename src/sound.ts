// The room, synthesised: pen on paper, the lamp's switch, the clatter of a
// pen falling over, a page turned on the desk, birds at dawn. No samples.
// The pen's scratch takes the theme's timbre: a pencil is gritty and low, a
// gel pen glides, thin copy paper hisses a little higher.

import { theme } from "./theme";

let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let out: GainNode | null = null;
export let muted = localStorage.getItem("pft:muted") === "1";

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem("pft:muted", m ? "1" : "0");
  if (m) creak(0);
}

export function unlock() {
  if (!ac) {
    try { ac = new AudioContext(); } catch { return; }
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a gentle bus compressor so stacked scratches don't clip
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    out = ac.createGain();
    out.gain.value = 0.9;
    out.connect(comp).connect(ac.destination);
  }
  if (ac.state === "suspended") ac.resume();
}

const ready = () => !muted && ac && noise && out;

// Filtered noise shaped like a stroke: fast attack, decays as the pen lifts.
export function scratch(dur: number, gain = 0.5, pitch = 2600, delay = 0, q = 0.9) {
  if (!ready()) return;
  const t = ac!.currentTime + delay;
  const src = ac!.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bp = ac!.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(pitch, t);
  bp.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + dur);
  bp.Q.value = q;
  const g = ac!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out!);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

// A pitched knock: plastic, wood, a switch.
function knock(freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = "triangle") {
  if (!ready()) return;
  const t = ac!.currentTime + delay;
  const o = ac!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
  const g = ac!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** The pen on the paper, in the theme's timbre. */
export function stroke(dur: number, gain = 0.5, pitch = 2600, delay = 0, q = 0.9) {
  const t = theme.sound;
  scratch(dur, gain * t.gain, pitch * t.pitch, delay, q * t.q);
}

export const tap = () => scratch(0.05, 0.35, 3800);
export const cross = (delay = 0, gain = 1) => { stroke(0.07, 0.45 * gain, 3000, delay); stroke(0.07, 0.4 * gain, 3300, delay + 0.09); };
export const circle = () => stroke(0.38, 0.3, 2200);
export const dot = (delay = 0) => stroke(0.035, 0.22, 4000 + Math.random() * 700, delay);
/** The pen set down on a dot: a click and the tick of the ball on paper. */
export const pick = () => { knock(1900, 0.03, 0.18); scratch(0.02, 0.3, 5200, 0.012); };
export const rustle = () => { scratch(0.32, 0.35, 900); scratch(0.22, 0.2, 1500, 0.12); };
/** The sheet slid and turned round on the desk. */
export const turnPage = () => { scratch(0.55, 0.28, 700, 0, 0.6); scratch(0.35, 0.18, 1300, 0.18, 0.7); };
/** The light coming on: the lamp's push switch, a tube light's starter ticking, or nothing (daylight). */
export const lamp = () => {
  const kind = theme.light.switch;
  if (kind === "day") return;
  if (kind === "tube") {
    knock(3200, 0.012, 0.18); knock(3000, 0.012, 0.16, 0.07); knock(3400, 0.012, 0.14, 0.16);
    knock(120, 0.6, 0.06, 0.2, "sawtooth"); // the hum as it catches
    return;
  }
  knock(2600, 0.02, 0.35); knock(900, 0.05, 0.25, 0.004, "square"); scratch(0.02, 0.2, 6000);
};
/** The ink snags on a soldier: a hard scratch with a little weight under it. */
export const snag = (last = false) => {
  scratch(0.06, last ? 0.8 : 0.55, 2400, 0, 1.4);
  knock(last ? 110 : 150, last ? 0.35 : 0.12, last ? 0.5 : 0.25, 0, "sine");
};
/** A flicked pen falls over and rattles to rest. */
export const clatter = (hard = 0.6) => {
  const hits = [0, 0.07, 0.12, 0.155, 0.18];
  hits.forEach((d, i) => {
    const g = hard * 0.3 * Math.pow(0.62, i);
    knock(1500 + Math.random() * 900, 0.03, g, d);
    scratch(0.025, g * 1.3, 4200, d);
  });
};
/** The slip: the pen gets away from the finger. */
export const slip = (power: number) => { knock(2400, 0.015, 0.2 + power * 0.25); scratch(0.03, 0.4, 6200, 0.004); };

// While you hold a charged flick, the pen creaks under the finger.
let creakSrc: AudioBufferSourceNode | null = null;
let creakGain: GainNode | null = null;
let creakBp: BiquadFilterNode | null = null;
export function creak(power: number, tremble = 0) {
  if (!ready() || power <= 0) {
    if (creakGain && ac) creakGain.gain.setTargetAtTime(0, ac.currentTime, 0.03);
    return;
  }
  if (!creakSrc) {
    creakSrc = ac!.createBufferSource();
    creakSrc.buffer = noise;
    creakSrc.loop = true;
    creakBp = ac!.createBiquadFilter();
    creakBp.type = "bandpass";
    creakBp.Q.value = 6;
    creakGain = ac!.createGain();
    creakGain.gain.value = 0;
    creakSrc.connect(creakBp).connect(creakGain).connect(out!);
    creakSrc.start();
  }
  const t = ac!.currentTime;
  creakBp!.frequency.setTargetAtTime(380 + power * 900 + tremble * 400 * Math.random(), t, 0.04);
  creakGain!.gain.setTargetAtTime(0.02 + power * 0.07 + tremble * 0.05, t, 0.05);
}

/** A bird or two outside: it's morning. */
export function birds() {
  if (!ready()) return;
  const chirp = (at: number, f: number) => {
    const t = ac!.currentTime + at;
    const o = ac!.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.09);
    const g = ac!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(out!);
    o.start(t);
    o.stop(t + 0.12);
  };
  const phrase = (at: number, f: number, n: number) => { for (let i = 0; i < n; i++) chirp(at + i * (0.13 + Math.random() * 0.05), f * (1 + (Math.random() - 0.5) * 0.08)); };
  phrase(0.2, 3200, 3);
  phrase(1.3, 2600, 2);
  phrase(2.4, 3500, 4);
}

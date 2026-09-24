// Pen-on-paper sounds, synthesised: filtered noise shaped like a stroke.

let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;
export let muted = localStorage.getItem("pft:muted") === "1";

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem("pft:muted", m ? "1" : "0");
}

export function unlock() {
  if (!ac) {
    ac = new AudioContext();
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") ac.resume();
}

// A stroke: fast attack, decays as the pen lifts. `gain` 0..1, `dur` seconds.
export function scratch(dur: number, gain = 0.5, pitch = 2600, delay = 0) {
  if (muted || !ac || !noise) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(pitch, t);
  bp.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + dur);
  bp.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

export const tap = () => scratch(0.05, 0.35, 3800);
export const cross = (delay = 0) => { scratch(0.07, 0.45, 3000, delay); scratch(0.07, 0.4, 3300, delay + 0.09); };
export const circle = () => scratch(0.5, 0.3, 2200);

export function buzz(pattern: number | number[]) {
  navigator.vibrate?.(pattern);
}

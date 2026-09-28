// Voices: tiny gibberish from tiny men.
//
// Each soldier has his own pitch (seeded from who he is), and says a few
// syllables of nonsense: a vowel shaped by two formant filters over a buzzy
// tone, gliding up for a question or a cheer, down for a sigh. A consonant is
// the tick of a pen on paper. They're made small and far away, down on the
// page: bright, thin, soft. No samples.
//
// Occasional, never a chorus (Burooj: "I want sounds for them, but not this
// much"). At most two voices at once; a moment (a flick, a volley, a pick-up)
// gets one voice, now and then two, never everyone (curate); each word has a
// long cooldown; and they're quiet, down on the page.

import { bus, muted } from "./sound";
import { LIFE, unit } from "./life";

export type Say =
  | "hup" // picked up: "hm? ba!"
  | "murmur" // his campmates, under their breath
  | "eep" // ink goes by close
  | "gasp" // he sees it coming (cut off by the cross)
  | "oh" // a comrade crossed out
  | "cheer" // a kill
  | "wheee" // riding his ink on a move
  | "land" // arriving
  | "uhoh" // his side's down to its last few
  | "look" // the unit cam: "hm?"
  | "phew" // the ink missed him: a breath out
  | "jab"; // a defender jabbing an intruder: "ta!"

export type Vowel = "a" | "e" | "i" | "o" | "u";

export interface Syllable {
  /** Start, seconds after the phrase begins. */
  at: number;
  dur: number;
  /** Pitch at the start and end, Hz. */
  f0: number;
  f1: number;
  vowel: Vowel;
  /** 0..1, before the voice's level. */
  gain: number;
  /** A pen tick before it: the consonant. */
  tick?: boolean;
  /** Vibrato rate, Hz (a wobble on held notes). */
  vib?: number;
  /** Cut off, not faded: the cross lands on it. */
  cut?: boolean;
}

// Formants (F1, F2) of each vowel for a very small throat: an adult's, scaled up.
const SMALL = 1.45;
export const FORMANTS: Record<Vowel, [number, number]> = {
  a: [800 * SMALL, 1200 * SMALL],
  e: [420 * SMALL, 2000 * SMALL],
  i: [300 * SMALL, 2350 * SMALL],
  o: [460 * SMALL, 820 * SMALL],
  u: [340 * SMALL, 720 * SMALL],
};

/**
 * How much each vowel lets through, evened out: a tiny "i" has its first
 * formant under the voice's pitch and comes out thin, so it's lifted.
 */
const VOWEL_GAIN: Record<Vowel, number> = { a: 0.8, e: 1, i: 2.6, o: 1.25, u: 1.35 };

/** A soldier's own pitch (Hz): blue a touch lower than red, each man his own. Pure. */
export function voicePitch(id: number, owner: 0 | 1) {
  return (owner === 0 ? 420 : 500) * (0.84 + 0.36 * unit(id, 404));
}

/** What a soldier says, as syllables. Pure: the same man says the same thing the same way on the same seed. */
export function phrase(what: Say, pitch: number, seed: number, len = 0.6): Syllable[] {
  const r = (k: number) => unit(seed, k);
  const pick = (k: number, vs: Vowel[]) => vs[Math.floor(r(k) * vs.length)];
  const p = pitch;
  switch (what) {
    case "hup": return [
      { at: 0, dur: 0.07, f0: p * 0.92, f1: p * 1.2, vowel: pick(1, ["u", "o"]), gain: 0.8, tick: true },
      { at: 0.1, dur: 0.1, f0: p * 1.25, f1: p * 1.5, vowel: pick(2, ["a", "e"]), gain: 1 },
    ];
    case "look": return [
      { at: 0, dur: 0.16, f0: p * 1.05, f1: p * 1.45, vowel: pick(3, ["u", "e"]), gain: 0.65, vib: 6 },
    ];
    case "murmur": {
      const n = 2 + Math.floor(r(4) * 2);
      return Array.from({ length: n }, (_, i) => ({
        at: i * (0.07 + r(10 + i) * 0.05), dur: 0.05 + r(20 + i) * 0.04,
        f0: p * (0.9 + r(30 + i) * 0.25), f1: p * (0.85 + r(40 + i) * 0.3),
        vowel: pick(50 + i, ["a", "e", "o", "u", "i"]), gain: 0.35, tick: i === 0 || r(60 + i) < 0.4,
      }));
    }
    case "eep": return [{ at: 0, dur: 0.065, f0: p * 1.5, f1: p * 1.9, vowel: pick(11, ["i", "e"]), gain: 0.8, tick: true }];
    case "gasp": return [{ at: 0, dur: 0.16, f0: p * 1.2, f1: p * 1.95, vowel: pick(5, ["a", "e"]), gain: 0.85, cut: true }];
    case "oh": return [{ at: 0, dur: 0.42, f0: p * 0.82, f1: p * 0.6, vowel: "o", gain: 0.6, vib: 5 }];
    case "cheer": {
      const n = 2 + Math.floor(r(6) * 2);
      return Array.from({ length: n }, (_, i) => {
        const last = i === n - 1;
        return {
          at: i * 0.1, dur: last ? 0.18 : 0.07,
          f0: p * (1.1 + i * 0.18), f1: p * (1.35 + i * 0.2 + (last ? 0.25 : 0)),
          vowel: last ? pick(7, ["a", "e"]) : pick(8 + i, ["e", "i", "a"]), gain: last ? 1 : 0.8, tick: i === 0, vib: last ? 8 : undefined,
        };
      });
    }
    case "wheee": return [{ at: 0, dur: Math.max(0.25, Math.min(1, len)), f0: p * 1.35, f1: p * 1.9, vowel: "i", gain: 0.75, tick: true, vib: 7 }];
    case "land": return [{ at: 0, dur: 0.07, f0: p * 1.05, f1: p * 0.82, vowel: pick(9, ["u", "o"]), gain: 0.7, tick: true }];
    case "phew": return [
      { at: 0, dur: 0.07, f0: p * 1.3, f1: p * 1.25, vowel: "i", gain: 0.45 },
      { at: 0.1, dur: 0.3, f0: p * 1.12, f1: p * 0.72, vowel: pick(12, ["u", "o"]), gain: 0.6 },
    ];
    case "jab": return [{ at: 0, dur: 0.045, f0: p * (1.25 + r(13) * 0.2), f1: p * 1.05, vowel: pick(14, ["a", "e"]), gain: 0.6, tick: true }];
    case "uhoh": return [
      { at: 0, dur: 0.1, f0: p * 1.2, f1: p * 1.25, vowel: "u", gain: 0.7 },
      { at: 0.17, dur: 0.2, f0: p * 0.98, f1: p * 0.8, vowel: "o", gain: 0.7, vib: 5 },
    ];
  }
}

// --- the level -------------------------------------------------------------------

/** Voices' own level, kept apart from the room's sound: 1 on, 0.5 soft, 0 off. */
export let level = (() => {
  const v = typeof localStorage === "undefined" ? null : localStorage.getItem("pft:voices");
  return v === "0" ? 0 : v === "0.5" ? 0.5 : 1;
})();
export function setLevel(v: number) {
  level = v;
  localStorage.setItem("pft:voices", String(v));
}
export const levelName = () => (level >= 1 ? "on" : level > 0 ? "soft" : "off");
/** Loudness of a voice at level 1, into the room's bus. */
const PEAK = 0.09;
/** Never more voices at once than this. */
export const MAX_VOICES = 2;
/** And never two starting closer together than this (s), unless planned as a pair. */
export const SPACING = 0.35;

// --- playing --------------------------------------------------------------------

let busyUntil: number[] = [];
const lastSaid = new Map<string, number>();
let lastAny: number | undefined;
let n = 0;
let chain: { ac: AudioContext; bus: GainNode; out: AudioNode } | null = null;

/**
 * Should `what` be said now? Its own cooldown, room among the voices
 * already going, and a little space after the last one started. Pure over its inputs.
 */
export function allowed(now: number, busy: number[], last: number | undefined, gap: number, lastAny?: number) {
  if (last !== undefined && now - last < gap) return false;
  if (lastAny !== undefined && Math.abs(now - lastAny) < SPACING) return false;
  return busy.filter((t) => t > now).length < MAX_VOICES;
}
/** How long before the same word is said again (s): long, so a word stays a small event. */
export const GAP: Record<Say, number> = { phew: 6, jab: 8, hup: 5, look: 4, murmur: 14, eep: 3, gasp: 2.5, oh: 6, cheer: 6, wheee: 5, land: 5, uhoh: 30 };

/** What a moment's voices are worth: the one that speaks is the one that matters most. */
const WORTH: Record<Say, number> = { gasp: 9, eep: 8, cheer: 7, uhoh: 7, oh: 6, phew: 5, jab: 4, hup: 4, look: 4, wheee: 3, land: 2, murmur: 1 };

/**
 * One moment's cues, cut down to what's said: the one that matters most,
 * and now and then (seeded) a second, later, from someone else with
 * something else to say. Never everyone. Pure.
 */
export function curate<T extends { at: number; id: number; say: Say }>(cues: readonly T[], seed: number, most = 2): T[] {
  if (!cues.length) return [];
  const ranked = [...cues].sort((a, b) => WORTH[b.say] - WORTH[a.say] || a.at - b.at);
  const out = [ranked[0]];
  if (most > 1 && unit(seed, 71) < 0.4) {
    const second = ranked.find((c) => c.say !== out[0].say && c.id !== out[0].id && Math.abs(c.at - out[0].at) >= SPACING * 1000);
    if (second) out.push(second);
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Soldier `id` (of side `owner`) says `what`, `delay` seconds from now,
 * `gain` (0..1) as loud as he can. Nothing before the first touch (the room's
 * audio doesn't exist yet), when muted, or with voices off.
 */
export function say(what: Say, id: number, owner: 0 | 1, delay = 0, gain = 1, len?: number) {
  if (!LIFE.voices || level <= 0 || muted) return;
  const b = bus();
  if (!b) return;
  const { ac, noise } = b;
  if (!chain || chain.ac !== ac) {
    // soft and small: a gentle lowpass, then the voices' own level into the room
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    const g = ac.createGain();
    lp.connect(g).connect(b.out);
    chain = { ac, bus: lp, out: g };
  }
  (chain.out as GainNode).gain.value = level;
  const t = ac.currentTime + Math.max(0, delay);
  busyUntil = busyUntil.filter((x) => x > ac.currentTime);
  const key = `${what}`;
  if (!allowed(t, busyUntil, lastSaid.get(key), GAP[what], lastAny)) return;
  lastSaid.set(key, t);
  lastAny = t;
  const syl = phrase(what, voicePitch(id, owner), id * 7919 + n++, len);
  const end = Math.max(...syl.map((s) => s.at + s.dur));
  busyUntil.push(t + end);
  for (const s of syl) syllable(ac, noise, chain.bus, t + s.at, s, gain);
}

function syllable(ac: BaseAudioContext, noise: AudioBuffer, dest: AudioNode, t: number, s: Syllable, gain: number) {
  const peak = PEAK * s.gain * gain * VOWEL_GAIN[s.vowel];
  const o = ac.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(s.f0, t);
  o.frequency.exponentialRampToValueAtTime(s.f1, t + s.dur);
  if (s.vib) {
    const lfo = ac.createOscillator(), depth = ac.createGain();
    lfo.frequency.value = s.vib;
    depth.gain.value = s.f0 * 0.035;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + s.dur + 0.05);
  }
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  if (s.cut) {
    env.gain.setValueAtTime(peak, t + s.dur - 0.01);
    env.gain.linearRampToValueAtTime(0.0001, t + s.dur);
  } else {
    env.gain.setValueAtTime(peak, t + s.dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + s.dur + 0.04);
  }
  // the vowel: two formants in parallel
  const [F1, F2] = FORMANTS[s.vowel];
  for (const [f, q, g] of [[F1, 7, 1], [F2, 9, 0.7]] as const) {
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    const fg = ac.createGain();
    fg.gain.value = g * 3;
    o.connect(bp).connect(fg).connect(env);
  }
  env.connect(dest);
  o.start(t);
  o.stop(t + s.dur + 0.06);
  if (s.tick) {
    // the consonant: a pen's tick on paper
    const src = ac.createBufferSource();
    src.buffer = noise;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3800;
    const tg = ac.createGain();
    tg.gain.setValueAtTime(peak * 0.9, t - 0.012);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
    src.connect(hp).connect(tg).connect(dest);
    src.start(Math.max(ac.currentTime, t - 0.012), unit(t * 1000, 1) * 0.5, 0.02);
  }
}

/**
 * Render lines offline, for listening to outside the game (dev: the `life`
 * playtest writes them out as WAVs). Each line: who says what, when (s).
 * Same synthesis as in the game, through the same lowpass, at level 1.
 */
export async function renderLines(lines: { what: Say; id: number; owner: 0 | 1; at: number; gain?: number; len?: number }[], rate = 44100) {
  const end = Math.max(...lines.map((l) => l.at + Math.max(...phrase(l.what, 500, 0, l.len).map((s) => s.at + s.dur)))) + 0.25;
  const ac = new OfflineAudioContext(1, Math.ceil(end * rate), rate);
  const noise = ac.createBuffer(1, rate, rate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = unit(i, 99) * 2 - 1;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200;
  lp.connect(ac.destination);
  lines.forEach((l, k) => {
    for (const s of phrase(l.what, voicePitch(l.id, l.owner), l.id * 7919 + k, l.len)) syllable(ac, noise, lp, l.at + s.at + 0.02, s, l.gain ?? 1);
  });
  return (await ac.startRendering()).getChannelData(0);
}

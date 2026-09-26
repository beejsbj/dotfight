// Haptics: the pen felt under the thumb. A small vocabulary of semantic events
// (pick up, ratchet, flick, settle, cross-out...) played on whatever the phone
// offers:
//   - Android (Chrome, Samsung Internet...): navigator.vibrate with real durations.
//   - iPhone (Safari 18+): no vibrate. Toggling an <input type=checkbox switch>
//     plays the system's one "selection" tick, so a hidden switch is clicked.
//     The tick has one intensity: "stronger" is spelt as a short rhythm of ticks.
//   - anything else: silent.
// Fewer, well-timed haptics beat buzzing: every event passes one global gate.

export type HapticEvent =
  | "tap" // a card, a button
  | "pickup" // the pen set down on a soldier
  | "notch" // a detent while pulling back (arg: power 0..1)
  | "wobble" // the hand starts to shake on a held flick
  | "flick" // let go (arg: power 0..1)
  | "settle" // ink lands: a line reaches its end, a camp is drawn
  | "kill" // a cross drawn (arg: which cross on this line, 1-based)
  | "thud" // a lunge dies at a base wall
  | "turn" // the page turned round, the book opened
  | "stand" // a side's last stand begins
  | "over"; // the last cross of the war

export interface Pattern {
  /** navigator.vibrate pattern: on, off, on... (ms) */
  android: number[];
  /** when each iOS tick fires (ms from start) */
  ios: number[];
  /** a higher priority may interrupt a lower one; see Gate */
  priority: number;
}

// iOS ticks closer than this blur into one (and the switch can't toggle faster
// than WebKit lets it repaint), so rhythms space them at least this far apart.
export const IOS_TICK_GAP = 60;
// Nothing starts closer than this to the last thing felt, unless it outranks it.
export const MIN_GAP = 45;

// Detents on the pull: the first as the pull goes live, then closer and closer
// together toward full power, like a ratchet tightening.
export const DETENTS = [0, 0.19, 0.37, 0.53, 0.67, 0.79, 0.89, 0.96, 1];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x || 0));

/** What each event feels like. Pure. */
export function pattern(ev: HapticEvent, arg = 0): Pattern {
  switch (ev) {
    case "tap": return { android: [8], ios: [0], priority: 1 };
    case "pickup": return { android: [12], ios: [0], priority: 2 };
    case "notch": {
      const p = clamp01(arg);
      // full power is its own detent: a firmer click, and a second tick on iOS
      if (p >= 1) return { android: [22], ios: [0, IOS_TICK_GAP], priority: 2 };
      return { android: [Math.round(5 + 8 * p)], ios: [0], priority: 1 };
    }
    // a tremor: uneven, fading in
    case "wobble": return { android: [5, 40, 7, 60, 9, 40, 6], ios: [0, 70, 170], priority: 2 };
    case "flick": return { android: [Math.round(14 + 14 * clamp01(arg))], ios: [0], priority: 3 };
    case "settle": return { android: [7], ios: [0], priority: 1 };
    case "kill": {
      const n = Math.max(1, Math.round(arg) || 1);
      // one firm tap for a cross; every further cross on the same line lands
      // as a double knock, a little harder each time
      if (n === 1) return { android: [26], ios: [0], priority: 4 };
      return { android: [18, 50, Math.min(44, 28 + 6 * (n - 2))], ios: [0, 75], priority: 4 };
    }
    // heavy: one long hit and its rebound; iOS can only pile ticks up
    case "thud": return { android: [60, 40, 20], ios: [0, IOS_TICK_GAP, IOS_TICK_GAP * 2], priority: 5 };
    // a paper riffle, quickening
    case "turn": return { android: [6, 45, 6, 35, 6, 25, 10], ios: [0, 90, 160], priority: 2 };
    // two slow heartbeats
    case "stand": return { android: [35, 130, 35, 160, 60], ios: [0, 160, 340], priority: 5 };
    // the final cross, and the page settling under it
    case "over": return { android: [40, 70, 40, 120, 110], ios: [0, 100, 200, 420], priority: 6 };
  }
}

/** How long a pattern keeps the motor (or the tick rhythm) busy, in ms. */
export function length(p: Pattern, backend: BackendKind) {
  if (backend === "switch") return p.ios[p.ios.length - 1] ?? 0;
  return p.android.reduce((a, b) => a + b, 0);
}

/**
 * The global rate limit. Within MIN_GAP of the last start only something that
 * outranks it gets through; while a pattern is still playing, an equal rank may
 * cut in (each cross on a line gets its knock) but nothing lesser.
 */
export class Gate {
  private at = -Infinity;
  private until = -Infinity;
  private rank = 0;
  allow(priority: number, now: number, dur: number) {
    const recent = now - this.at < MIN_GAP;
    const playing = now < this.until;
    if (recent && priority <= this.rank) return false;
    if (playing && priority < this.rank) return false;
    this.at = now;
    this.until = now + dur;
    this.rank = priority;
    return true;
  }
  reset() { this.at = this.until = -Infinity; this.rank = 0; }
}

/** The pull under the thumb: which detent it's past, and when the hand starts to shake. */
export class Ratchet {
  private d = -1;
  private shook = false;
  /** Pulling back again after easing off must come this far past a detent to re-click. */
  static HYSTERESIS = 0.03;
  reset() { this.d = -1; this.shook = false; }
  /** The detent just clicked past going up (index into DETENTS), or null. */
  step(power: number, live: boolean): number | null {
    let d = -1;
    if (live) for (let i = 0; i < DETENTS.length; i++) if (power >= DETENTS[i] - 1e-9) d = i;
    if (d > this.d) { this.d = d; return d; }
    // easing off: release detents only once clearly back under them
    while (this.d >= 0 && (!live || power < DETENTS[this.d] - Ratchet.HYSTERESIS)) this.d--;
    return null;
  }
  /** True once, as the held flick starts to wobble. */
  shake(wobbling: boolean) {
    if (!wobbling || this.shook) return false;
    this.shook = true;
    return true;
  }
}

// --- backends -----------------------------------------------------------------

export type BackendKind = "vibrate" | "switch" | "none";

export interface Env {
  vibrate?: unknown;
  maxTouchPoints?: number;
  /** does this browser know the checkbox `switch` attribute? */
  hasSwitch?: boolean;
}

/** Pick a backend by capability. Pure. */
export function detect(env: Env): BackendKind {
  if (typeof env.vibrate === "function") return "vibrate";
  // Safari on a touch screen with switch controls: an iPhone or iPad on iOS 18+.
  // (Desktop Safari knows `switch` too, but there's nothing to feel on a Mac.)
  if (env.hasSwitch && (env.maxTouchPoints ?? 0) > 0) return "switch";
  return "none";
}

export interface Backend {
  kind: BackendKind;
  play(p: Pattern): void;
  /** stop whatever is still to come */
  cancel(): void;
}

export function browserEnv(): Env {
  if (typeof navigator === "undefined" || typeof document === "undefined") return {};
  const nav = navigator as Navigator & { vibrate?: unknown };
  let hasSwitch = false;
  try { hasSwitch = "switch" in document.createElement("input"); } catch { /* old engine */ }
  return { vibrate: nav.vibrate, maxTouchPoints: nav.maxTouchPoints, hasSwitch };
}

function vibrateBackend(): Backend {
  return {
    kind: "vibrate",
    // a new pattern replaces whatever was playing
    play: (p) => { try { navigator.vibrate(p.android); } catch { /* blocked before first tap */ } },
    cancel: () => { try { navigator.vibrate(0); } catch { /* ignore */ } },
  };
}

// A switch the thumb never sees. Clicking its label toggles it, and iOS plays
// the switch's tick. It stays in the page (display:none would stop it) but out
// of sight, out of the tab order, out of the accessibility tree, and can't take
// a real touch.
function switchBackend(): Backend {
  let label: HTMLLabelElement | null = null;
  const timers: number[] = [];
  const tick = () => {
    if (!label) {
      label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;clip-path:inset(50%)";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
  };
  const cancel = () => { while (timers.length) clearTimeout(timers.pop()); };
  return {
    kind: "switch",
    play: (p) => {
      cancel();
      for (const at of p.ios) {
        // the first tick inside the gesture that caused it; the rest on a timer
        if (at <= 0) tick();
        else timers.push(window.setTimeout(tick, at));
      }
    },
    cancel,
  };
}

const silent: Backend = { kind: "none", play: () => {}, cancel: () => {} };

export function makeBackend(kind: BackendKind): Backend {
  return kind === "vibrate" ? vibrateBackend() : kind === "switch" ? switchBackend() : silent;
}

// --- the player -------------------------------------------------------------

export interface Felt { ev: HapticEvent; arg?: number; t: number; backend: BackendKind; android: number[]; ios: number[] }

export interface HapticsOptions {
  backend: Backend;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** keep a log of what was felt (dev builds: window.pft.haptics) */
  log?: boolean;
}

export const STORAGE_KEY = "pft:haptics";

export function createHaptics({ backend, now = () => performance.now(), storage, log = false }: HapticsOptions) {
  const gate = new Gate();
  const felt: Felt[] = [];
  let enabled = storage?.getItem(STORAGE_KEY) !== "0"; // on unless switched off
  return {
    get backend() { return backend.kind; },
    /** is there anything to feel on this device? */
    get supported() { return backend.kind !== "none"; },
    get enabled() { return enabled; },
    setEnabled(on: boolean) {
      enabled = on;
      storage?.setItem(STORAGE_KEY, on ? "1" : "0");
      if (!on) { backend.cancel(); gate.reset(); }
    },
    /** Feel an event, if it's on and the gate lets it through. Returns whether it played. */
    fire(ev: HapticEvent, arg?: number) {
      if (!enabled) return false;
      const p = pattern(ev, arg);
      const t = now();
      if (!gate.allow(p.priority, t, length(p, backend.kind))) return false;
      backend.play(p);
      if (log) {
        felt.push({ ev, arg, t: Math.round(t), backend: backend.kind, android: p.android, ios: p.ios });
        if (felt.length > 500) felt.shift();
      }
      return true;
    },
    /** what was felt, oldest first (only kept when `log` is on) */
    felt,
  };
}

export type Haptics = ReturnType<typeof createHaptics>;

const store = typeof localStorage === "undefined" ? undefined : localStorage;
export const haptics: Haptics = createHaptics({
  backend: makeBackend(detect(browserEnv())),
  storage: store,
  log: import.meta.env.DEV,
});

/** Feel an event: haptic("pickup"), haptic("notch", power), haptic("kill", n)... */
export const haptic = (ev: HapticEvent, arg?: number) => haptics.fire(ev, arg);

// Haptics: the pen felt under the thumb. A small vocabulary of semantic events
// (pick up, ratchet, flick, settle, cross-out...) played on whatever the phone
// offers:
//   - Android (Chrome, Samsung Internet...): navigator.vibrate with real durations.
//   - iPhone (iOS 18+): no vibrate. Toggling an <input type=checkbox switch>
//     plays the system's one light tick, and nothing else on the web can. The
//     tick has one intensity: "stronger" is spelt as a short rhythm of ticks.
//     How much of the vocabulary reaches the thumb depends on the iOS version:
//       "script" (iOS 18.0 to 26.4): clicking a hidden switch's label from code
//         ticks, within about a second of a real touch (WebKit forwards the
//         gesture through timers and animation frames for 1s since 18.4).
//       "tap" (iOS 26.5 on): WebKit only ticks when a real tap lands on the
//         switch's label (bug 309082). So hidden labels lie over the buttons and
//         round the canvas; a tap on a button ticks, and a tap on the page ticks
//         only if it picked someone up or drew a camp. A flick is a drag, and
//         drags never click: the ratchet, the flick and the crosses go unfelt.
//   - anything else: silent.
// Fewer, well-timed haptics beat buzzing: every event passes one global gate.

export type HapticEvent =
  | "tap" // a card, a button
  | "pickup" // the pen set down on a soldier
  | "notch" // a detent while pulling back (arg: power 0..1)
  | "wobble" // the hand starts to shake on a held flick
  | "flick" // let go (arg: power 0..1)
  | "settle" // a camp is drawn (under a tap)
  | "land" // a flicked line reaches its end (after a drag)
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
    case "tap": return { android: [18], ios: [0], priority: 1 };
    case "pickup": return { android: [28], ios: [0], priority: 2 };
    case "notch": {
      const p = clamp01(arg);
      // full power is its own detent: a firmer click, and a second tick on iOS
      if (p >= 1) return { android: [40], ios: [0, IOS_TICK_GAP], priority: 2 };
      return { android: [Math.round(12 + 14 * p)], ios: [0], priority: 1 };
    }
    // a tremor: uneven, fading in
    case "wobble": return { android: [12, 40, 16, 60, 20, 40, 14], ios: [0, 70, 170], priority: 2 };
    case "flick": return { android: [Math.round(32 + 30 * clamp01(arg))], ios: [0], priority: 3 };
    case "settle": case "land": return { android: [16], ios: [0], priority: 1 };
    case "kill": {
      const n = Math.max(1, Math.round(arg) || 1);
      // one firm tap for a cross; every further cross on the same line lands
      // as a double knock, a little harder each time
      if (n === 1) return { android: [50], ios: [0], priority: 4 };
      return { android: [36, 50, Math.min(80, 55 + 8 * (n - 2))], ios: [0, 75], priority: 4 };
    }
    // heavy: one long hit and its rebound; iOS can only pile ticks up
    case "thud": return { android: [110, 40, 45], ios: [0, IOS_TICK_GAP, IOS_TICK_GAP * 2], priority: 5 };
    // a paper riffle, quickening
    case "turn": return { android: [14, 45, 14, 35, 14, 25, 22], ios: [0, 90, 160], priority: 2 };
    // two slow heartbeats
    case "stand": return { android: [65, 90, 65, 110, 90], ios: [0, 160, 340], priority: 5 };
    // the final cross, and the page settling under it
    case "over": return { android: [70, 60, 70, 90, 130], ios: [0, 100, 200, 420], priority: 6 };
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
export type IosMode = "script" | "tap";

export interface Env {
  vibrate?: unknown;
  maxTouchPoints?: number;
  /** does this browser know the checkbox `switch` attribute? */
  hasSwitch?: boolean;
  /** the user agent, for the iOS version */
  ua?: string;
}

/** An iPad, including iPadOS's desktop-class "Macintosh" user agent on a touch screen. Pure. */
export function isIpad(ua = ""): boolean {
  return /iPad/.test(ua) || /Macintosh/.test(ua);
}

/** iOS major version from a user agent (Safari's `Version/` is the iOS version). Pure. */
export function iosMajor(ua = ""): number | undefined {
  const v = /Version\/(\d+)/.exec(ua) ?? /OS (\d+)_\d+/.exec(ua);
  return v ? +v[1] : undefined;
}

/** Pick a backend by capability. Pure. */
export function detect(env: Env): BackendKind {
  // a laptop's browser may know vibrate or `switch` too, with nothing to feel
  const touch = (env.maxTouchPoints ?? 0) > 0;
  if (typeof env.vibrate === "function" && touch) return "vibrate";
  // Safari on a touch screen with switch controls: an iPhone or iPad
  // iOS 17.4-17.x knows `switch` but never ticks it, and an iPad (which
  // may call itself a Mac) has no Taptic Engine to tick
  if (env.hasSwitch && touch) return !isIpad(env.ua) && (iosMajor(env.ua) ?? 18) >= 18 ? "switch" : "none";
  return "none";
}

/**
 * Can script still tick the switch on this iOS? Pure. Safari says its version
 * (= iOS) as `Version/26.4`; a home-screen app or another iOS browser only has
 * `iPhone OS 18_3`, frozen at 18_6 from iOS 26 on, so 18_6 could be anything
 * and gets the mode that works everywhere.
 */
export function iosMode(ua: string): IosMode {
  const v = /Version\/(\d+)(?:\.(\d+))?/.exec(ua);
  if (v) { const [maj, min] = [+v[1], +(v[2] ?? 0)]; return maj < 26 || (maj === 26 && min < 5) ? "script" : "tap"; }
  const os = /OS (\d+)_(\d+)/.exec(ua);
  if (os && +os[1] === 18 && +os[2] < 6) return "script";
  return "tap";
}

export interface Backend {
  kind: BackendKind;
  mode?: IosMode;
  play(p: Pattern, ev: HapticEvent): void;
  /** stop whatever is still to come */
  cancel(): void;
  /** set up anything that needs the page (tap mode: labels to land on) */
  install?(canvas: HTMLElement, on: () => boolean): void;
}

export function browserEnv(): Env {
  if (typeof navigator === "undefined" || typeof document === "undefined") return {};
  const nav = navigator as Navigator & { vibrate?: unknown };
  let hasSwitch = false;
  try { hasSwitch = "switch" in document.createElement("input"); } catch { /* old engine */ }
  return { vibrate: nav.vibrate, maxTouchPoints: nav.maxTouchPoints, hasSwitch, ua: nav.userAgent };
}

function vibrateBackend(): Backend {
  return {
    kind: "vibrate",
    // a new pattern replaces whatever was playing
    play: (p) => { try { navigator.vibrate(p.android); } catch { /* blocked before first tap */ } },
    cancel: () => { try { navigator.vibrate(0); } catch { /* ignore */ } },
  };
}

// A switch, and a label that toggles it. The switch is aria-hidden and never
// given a tabindex (WebKit would then focus it on every click); an overlay
// label is hidden too, but a label wrapping real content (the page) is not.
function switchIn(label: HTMLLabelElement, hideLabel = true) {
  if (hideLabel) label.setAttribute("aria-hidden", "true");
  label.dataset.haptic = "";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.setAttribute("aria-hidden", "true");
  input.style.cssText = "position:absolute;width:1px;height:1px;margin:0;opacity:0;pointer-events:none";
  // the label forwards its click to the switch; that copy is ours alone
  input.addEventListener("click", (e) => e.stopPropagation());
  label.appendChild(input);
  return label;
}

// iOS 18.0 to 26.4: click a hidden label from code and the switch ticks.
function scriptSwitch(): Backend {
  let label: HTMLLabelElement | null = null;
  const timers: number[] = [];
  const tick = () => {
    if (!label) {
      label = switchIn(document.createElement("label"));
      // rendered but invisible: a switch outside the render tree may not tick
      label.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      document.body.appendChild(label);
    }
    label.click();
  };
  const cancel = () => { while (timers.length) clearTimeout(timers.pop()); };
  return {
    kind: "switch", mode: "script",
    play: (p) => {
      cancel();
      for (const at of p.ios) {
        // the first tick inside the gesture that caused it; the rest on timers,
        // which WebKit lets carry the gesture for a second
        if (at <= 0) tick();
        else timers.push(window.setTimeout(tick, at));
      }
    },
    cancel,
  };
}

// iOS 26.5 on: only a real tap on a label ticks, so put labels where taps land.
// What a tap on the page can deliver (the rest come from drags or timers).
const TAPPED: HapticEvent[] = ["pickup", "settle"];
function tapSwitch(): Backend {
  let owed = -Infinity; // when the game last felt something a tap could deliver
  // a gesture that has moved past tap slop won't click, so it can't deliver a tick
  let from: { x: number; y: number } | null = null, dragged = false, down = 0;
  const overlay = (b: HTMLElement) => {
    if (b.querySelector(":scope > label[data-haptic]")) return;
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    const l = switchIn(document.createElement("label"));
    l.style.cssText = "position:absolute;inset:0;z-index:1;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
    b.appendChild(l);
  };
  return {
    kind: "switch", mode: "tap",
    play: (_p, ev) => { if (TAPPED.includes(ev)) owed = dragged ? -Infinity : performance.now(); },
    cancel: () => { owed = -Infinity; },
    install(canvas, on) {
      // every button, now and later, wears a label: tapping it ticks
      const dress = () => document.querySelectorAll<HTMLElement>("button").forEach(overlay);
      dress();
      new MutationObserver(dress).observe(document.body, { childList: true, subtree: true });
      // the page: wrapped in a label that takes no room. Its taps still reach
      // the canvas; the label ticks only if that tap did something to feel.
      const wrap = switchIn(document.createElement("label"), false);
      wrap.style.display = "contents";
      canvas.replaceWith(wrap);
      wrap.prepend(canvas);
      // capture phase, so this runs before the game's own handler for the same press:
      // whatever an earlier gesture owed is stale, and a second finger makes a pinch
      const drop = () => { dragged = true; owed = -Infinity; };
      document.addEventListener("pointerdown", (e) => {
        owed = -Infinity;
        from = { x: e.clientX, y: e.clientY };
        dragged = ++down > 1;
      }, true);
      document.addEventListener("pointerup", () => { down = Math.max(0, down - 1); }, true);
      document.addEventListener("pointercancel", () => { down = Math.max(0, down - 1); drop(); }, true);
      document.addEventListener("pointermove", (e) => {
        if (!from || dragged || Math.hypot(e.clientX - from.x, e.clientY - from.y) < 10) return;
        drop();
      }, true);
      // last word, after the button's own handler (a settings toggle may just
      // have switched haptics off): no tick unless it's on and was earned
      document.addEventListener("click", (e) => {
        const l = (e.target as Element | null)?.closest?.("label[data-haptic]");
        if (!l) return;
        const earned = l !== wrap || performance.now() - owed < 800;
        if (!on() || !earned) e.preventDefault();
        if (l === wrap) owed = -Infinity;
      });
    },
  };
}

const silent: Backend = { kind: "none", play: () => {}, cancel: () => {} };

export function makeBackend(kind: BackendKind, mode: IosMode = "tap"): Backend {
  return kind === "vibrate" ? vibrateBackend() : kind === "switch" ? (mode === "script" ? scriptSwitch() : tapSwitch()) : silent;
}

// --- the player -------------------------------------------------------------

export interface Felt { ev: HapticEvent; arg?: number; t: number; backend: BackendKind; mode?: IosMode; android: number[]; ios: number[] }

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
    /** iOS: whether script can tick ("script") or only real taps ("tap") */
    get mode() { return backend.mode; },
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
      backend.play(p, ev);
      if (log) {
        felt.push({ ev, arg, t: Math.round(t), backend: backend.kind, mode: backend.mode, android: p.android, ios: p.ios });
        if (felt.length > 500) felt.shift();
      }
      return true;
    },
    /** Once, at boot: lets tap-mode iOS put its labels over the buttons and round the page. */
    install(canvas: HTMLElement) { backend.install?.(canvas, () => enabled); },
    /** what was felt, oldest first (only kept when `log` is on) */
    felt,
  };
}

export type Haptics = ReturnType<typeof createHaptics>;

const store = typeof localStorage === "undefined" ? undefined : localStorage;
// dev: ?haptics=vibrate|script|tap|none forces a backend, so headless Chrome can
// exercise the iPhone's DOM rigs (it has nothing to feel either way)
const forced = import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search).get("haptics") : null;
const kind: BackendKind = forced === "script" || forced === "tap" ? "switch" : forced === "vibrate" || forced === "none" ? forced : detect(browserEnv());
const mode: IosMode = forced === "script" || forced === "tap" ? forced : iosMode(typeof navigator === "undefined" ? "" : navigator.userAgent);
export const haptics: Haptics = createHaptics({
  backend: makeBackend(kind, mode),
  storage: store,
  log: import.meta.env.DEV,
});

/** Feel an event: haptic("pickup"), haptic("notch", power), haptic("kill", n)... */
export const haptic = (ev: HapticEvent, arg?: number) => haptics.fire(ev, arg);

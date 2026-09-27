// The phone's motion sensors, for the aiming experiment in `motion.ts`: the
// settings, the permission dance, and the listeners. Nothing here reaches the
// engine: main.ts turns these readings into a flick's angle, power and wobble,
// and records the flick.

import { GunHold, LEVELS, nudge, pose, SENS, Steadiness, type Level, type Motion, type Orientation, type Pose } from "./motion";

type Perm = { requestPermission?: () => Promise<"granted" | "denied"> };
const DOE = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : undefined) as unknown as Perm | undefined;
const DME = (typeof DeviceMotionEvent !== "undefined" ? DeviceMotionEvent : undefined) as unknown as Perm | undefined;
/** iOS 13+: sensors stay silent until the player allows them, from a tap. */
const mustAsk = typeof DOE?.requestPermission === "function";
const coarse = matchMedia("(pointer: coarse)").matches;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const key = (k: string) => `pft:motion:${k}`;
export const on: Record<Level, boolean> = { nudge: false, steady: false, gun: false };
export const sens: Record<Level, number> = { nudge: 1, steady: 1, gun: 1 };
for (const l of LEVELS) {
  on[l] = localStorage.getItem(key(l)) === "1";
  const v = +(localStorage.getItem(key(`${l}:sens`)) ?? 1);
  sens[l] = (SENS as readonly number[]).includes(v) ? v : 1;
}
const anyOn = () => LEVELS.some((l) => on[l]);

let o: Orientation | null = null; // latest readings
let seen = false; // a real reading arrived: this phone has the sensors
let allowed = !mustAsk;
let denied = false;
let listening = false;
const steadiness = new Steadiness();
export let gun: GunHold | null = null;

function onOrient(e: DeviceOrientationEvent) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return; // desktops send nulls
  o = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
  seen = true;
  gun?.feed(o, null, performance.now());
  if (!anyOn()) stop(); // it was only a check for sensors
}
function onMotion(e: DeviceMotionEvent) {
  const r = e.rotationRate, a = e.acceleration;
  const m: Motion = {
    rate: r && r.alpha != null ? { alpha: r.alpha, beta: r.beta ?? 0, gamma: r.gamma ?? 0 } : null,
    accel: a && a.x != null ? { x: a.x, y: a.y ?? 0, z: a.z ?? 0 } : null,
  };
  const t = performance.now();
  if (on.steady) steadiness.feed(m, t);
  gun?.feed(null, m, t);
}

function listen() {
  if (listening || !allowed) return;
  listening = true;
  window.addEventListener("deviceorientation", onOrient);
  window.addEventListener("devicemotion", onMotion);
}
function stop() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("deviceorientation", onOrient);
  window.removeEventListener("devicemotion", onMotion);
}

/** Ask iOS for the sensors. Must run inside a tap; both prompts go out before either answer. */
async function ask() {
  if (allowed) return true;
  try {
    const answers = await Promise.all([DOE!.requestPermission!(), DME?.requestPermission?.() ?? "granted"]);
    allowed = answers.every((a) => a === "granted");
  } catch {
    allowed = false; // not from a gesture, or refused outright
  }
  denied = !allowed;
  if (allowed) { denied = false; listen(); }
  return allowed;
}

// Android and desktops: listen once to learn whether there are sensors at all.
// iOS: the levels you switched on come back after your first tap (the permission lasts the visit).
listen();
if (mustAsk) {
  const again = () => { if (anyOn() && !allowed && !denied) void ask(); };
  for (const ev of ["touchend", "click"]) window.addEventListener(ev, again, { once: true, passive: true });
}

// --- what main.ts reads --------------------------------------------------------

export const live = (l: Level) => on[l] && allowed && o !== null;
/** How the phone is held right now, if the nudge is on. */
export const held = (): Pose | null => (live("nudge") ? pose(o!) : null);
/** The nudge since the pull began at `from`. */
export const nudged = (from: Pose | null) => (from && live("nudge") ? nudge(from, pose(o!), sens.nudge) : { angle: 0, side: 0 });
/** How steady the hand is (scales the wobble), or undefined with the level off. */
export const steady = () => (live("steady") ? steadiness.factor(sens.steady) : undefined);

/** Raise the phone: a gun hold starts, straight ahead wherever it points now. */
export function raise() {
  if (!live("gun")) return false;
  gun = new GunHold(sens.gun);
  gun.centre(o!);
  return true;
}
export function lower() { gun = null; }

// --- settings --------------------------------------------------------------------

type Row = (k: string, on: boolean, label: string, hint: string) => string;
const LABEL: Record<Level, [string, string]> = {
  nudge: ["tilt to fine-tune", "while you pull, tilt the phone a little: the aim trims a few degrees and the pen leans"],
  steady: ["steady hand", "the phone feels your hand: hold it still and the pen stops shaking"],
  gun: ["pen falcon", "tap a soldier, raise the phone and point it, hold still, then flick your wrist to fire"],
};

/** The settings rows, or nothing on a phone without the sensors. */
export function settingsHtml(row: Row) {
  if (!seen && !(mustAsk && coarse)) return "";
  if (reduced && !anyOn() && localStorage.getItem(key("show")) !== "1") {
    return `<button class="toggle more" data-set="m:show"><b>aim with the phone…</b><i>hidden because your phone asks for less motion</i></button>`;
  }
  const names = ["soft", "normal", "keen"];
  const sensRow = (l: Level) => `<p class="sens">${SENS.map((v, i) => `<button data-sens="${l}:${v}" class="${sens[l] === v ? "on" : ""}">${names[i]}</button>`).join("")}</p>`;
  return `<p class="sub motion">aim with the phone <i>(an experiment)</i></p>
    ${LEVELS.map((l) => row(`m:${l}`, on[l], ...LABEL[l]) + (on[l] ? sensRow(l) : "")).join("")}
    ${denied ? `<p class="fine">The phone said no to its motion sensors. Reload the page and switch a level on to be asked again.</p>` : ""}`;
}

/** A tap in the settings sheet. Returns false if it wasn't ours. */
export function settingsClick(b: HTMLElement, redraw: () => void) {
  const k = b.dataset.set, sv = b.dataset.sens;
  if (k === "m:show") { localStorage.setItem(key("show"), "1"); redraw(); return true; }
  if (k?.startsWith("m:")) {
    const l = k.slice(2) as Level;
    on[l] = !on[l];
    localStorage.setItem(key(l), on[l] ? "1" : "0");
    if (!on[l] && l === "gun") lower();
    if (on[l]) {
      denied = false;
      if (allowed) listen();
      else void ask().then((ok) => {
        if (!ok) { on[l] = false; localStorage.setItem(key(l), "0"); }
        redraw();
      });
    } else if (!anyOn()) stop();
    redraw();
    return true;
  }
  if (sv) {
    const [l, v] = sv.split(":");
    sens[l as Level] = +v;
    localStorage.setItem(key(`${l}:sens`), v);
    redraw();
    return true;
  }
  return false;
}

// --- dev: a phone in a headless browser -------------------------------------------

/**
 * Synthetic sensor events, dispatched through the same listeners real ones use.
 * Everything streams at 60 Hz in real time; rates are deg/s.
 */
export function simulator() {
  let at: Orientation = { alpha: 0, beta: 40, gamma: 0 };
  const orient = (x: Orientation) => {
    at = x;
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { ...x, absolute: false }));
  };
  const move = (rate: [number, number, number], accel: [number, number, number] = [0, 0, 0]) =>
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
      rotationRate: { alpha: rate[0], beta: rate[1], gamma: rate[2] },
      acceleration: { x: accel[0], y: accel[1], z: accel[2] }, interval: 16,
    }));
  const tick = () => new Promise((r) => setTimeout(r, 16));
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return {
    get at() { return at; },
    orient, move,
    /** Turn the phone smoothly to `to` over `ms`, with `noise` deg/s of hand tremor. */
    async sweep(to: Partial<Orientation>, ms: number, noise = 0.6) {
      const from = at, dest = { ...at, ...to };
      const n = Math.max(1, Math.round(ms / 16));
      const r = (k: keyof Orientation) => ((dest[k] - from[k]) / ms) * 1000;
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        orient({ alpha: from.alpha + (dest.alpha - from.alpha) * f, beta: from.beta + (dest.beta - from.beta) * f, gamma: from.gamma + (dest.gamma - from.gamma) * f });
        move([r("beta") + rand() * noise, r("gamma") + rand() * noise, r("alpha") + rand() * noise]);
        await tick();
      }
    },
    /** Hold where it is for `ms`, with `noise` deg/s of tremor: a steady hand is under 1, a shaky one 30+. */
    async hold(ms: number, noise = 0.6) {
      for (let t = 0; t < ms; t += 16) {
        const j = noise / 25; // the tremor moves the phone a little, too
        orient({ alpha: at.alpha + rand() * j, beta: at.beta + rand() * j, gamma: at.gamma + rand() * j });
        move([rand() * noise, rand() * noise, rand() * noise]);
        await tick();
      }
    },
    /** A wrist snap peaking at `peak` deg/s over about 110 ms: the phone pitches forward and back. */
    async snap(peak = 600) {
      const base = at;
      for (let i = 1; i <= 12; i++) {
        const w = peak * Math.sin(Math.min(1, i / 7) * Math.PI);
        orient({ ...base, beta: base.beta - Math.sin((i / 12) * Math.PI) * 25 });
        move([-w, w * 0.2, 0], [0, w / 60, 0]);
        await tick();
      }
      orient(base);
    },
  };
}

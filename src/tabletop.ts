// Tabletop: the real-time prototype on one phone (BJS-458, docs/realtime.md).
// The phone lies flat between two players. Each owns half the screen, the far
// half's strip is turned round to face its player, and both pull back and let
// go whenever their pen can: there are no turns after positioning. The page
// stays bird's-eye and still (nobody can lean in while two people aim), so a
// pull on the screen is a pull on the page.
//
// This module takes the page over from main.ts once a table game reaches
// play: it owns the input, the clock, the ink resolving (several lines at
// once), the strips and the wet gloss, and builds each frame for scene.ts.
// Setup and positioning stay main.ts's turn-based flow. The engine never sees
// a wall clock: this is where the game clock is advanced, and every flick is
// stamped with it before act() (game.ts, "real time").

import { boldAt, boilFrame, lifeOf } from "./boil";
import { botMoveLater } from "./botclient";
import type { Level } from "./bot";
import type { Camera } from "./camera";
import { cue } from "./cues";
import { aimError, pull, pullSpan, release, wobble, type Aim as Pull } from "./flick";
import { act, canFlickAt, costOf, handAt, meterAt, other, pathLen, reachOf, type Flick, type GameState, type Kind, type Outcome, type Player, type Pt } from "./game";
import { pickSoldier } from "./hand";
import { haptic, Ratchet } from "./haptics";
import type { Lamp } from "./light";
import { SETTLED, type Ink } from "./page";
import { leaning, lift, LIFT_MS, settle, SETTLE_MS, shiver, type PenPose } from "./pen";
import { cssMatrix, layerMatrix, screenDirToWorld } from "./projection";
import type { AnyState, Mode } from "./record";
import { RULES } from "./rules";
import { boilTick, pageState, renderOverlay, renderStage, type Els, type Frame } from "./scene";
import * as sfx from "./sound";
import { hudPen } from "./theme";
import { reachFraction, Timeline } from "./timeline";
import { dried, WET, WetLayer, wetMen } from "./wet";

/** What the page lends the table (main.ts hands these over once, at boot). */
export interface Deps {
  els: Els;
  over: HTMLCanvasElement;
  og: CanvasRenderingContext2D;
  cam: Camera;
  dims: () => { W: number; H: number; dpr: number; sdpr: number };
  lamp: () => Lamp;
  save: () => void;
  /** The war is over: the flow takes the page back (the dawn, the signature, the drawer). */
  exit: () => void;
  /** The player tapped the menu: back to the cover. */
  menu: () => void;
  reduced: boolean;
  slow: () => boolean;
  boilOn: () => boolean;
  heard: () => boolean;
  speed: () => number;
}

/** The strips at either end of the screen, css px: the page fits between them. */
export const STRIP = 88;
const TAP = 10;
/** Dawood-bot at the table: how long it waits between looks at the page, and how long its pull-back shows. */
export const BOT = { gapMs: 1700, jitterMs: 900, aimMs: 800 };

/** Which half of the screen a touch is on: the near half (the bottom) is blue's, the far half red's. Pure. */
export const sideOf = (y: number, H: number): Player => (y > H / 2 ? 0 : 1);
/** How far a pull from screen height `y` can go on its own half before the edge, as flick.ts has it. Pure. */
export const spanFor = (p: Player, y: number, H: number) => pullSpan(p === 0 ? y : H - y, H);

interface Side {
  p: Player;
  kind: Kind;
  /** The soldier in hand. */
  sel?: number;
  /** When the pen was set on him (T). */
  penDrop: number;
  /** The pointer that owns this half right now, and where it went down. */
  ptr?: number;
  sx: number;
  sy: number;
  tapOn?: number;
  aim?: Pull;
  /** The pull as the page has it: a world angle, and the thumb's power. */
  angle: number;
  power: number;
  live: boolean;
  ratchet: Ratchet;
  /** The pen lifted off a man put down. */
  penLift?: { t0: number; x: number; y: number };
  /** A short word on the strip, until T. */
  said: string;
  saidUntil: number;
  /** Dawood-bot's pull-back, on show before it lets go. */
  botAim?: { f: Flick; power: number; t0: number };
}

/** A flick's ink still going on (one of several at once). */
interface Resolve {
  f: Flick; o: Outcome; owner: Player; power: number; t0: number; dur: number; first: number; lean: number; end: number;
  kills: { i: number; at: number; hit: boolean; last: boolean }[];
  settled?: boolean;
}

let deps: Deps | null = null;
let s: GameState | null = null;
let mode: Mode = { kind: "table" };
let active = false;
/** Presentation time (ms, scaled by `speed`), the game clock (ms, what flicks are stamped with) and the boil's wall time. */
let T = 0, clock = 0, clockWas = 0, wall = 0, last = 0;
let dirty = true;
const tl = new Timeline();
let resolves: Resolve[] = [];
const sides: [Side, Side] = [side(0), side(1)];
const wet = new WetLayer();
let wetHost: HTMLElement | null = null;
let wetCss = "";
let strips: HTMLElement | null = null;
let farNote: HTMLElement | null = null;
let mirrorOn = false;
let ending = false;
let bot: { level: Level; nextAt: number; thinking: boolean } | null = null;
let hudAt = -1e9;

function side(p: Player): Side {
  return { p, kind: "snipe", penDrop: -1e9, sx: 0, sy: 0, angle: 0, power: 0, live: false, ratchet: new Ratchet(), said: "", saidUntil: -1e9 };
}

const lively = () => !!deps && !deps.reduced && !deps.slow();
const sheetUp = () => { const el = document.getElementById("sheet"); return !!el && !el.hidden; };
const penLean = (power: number) => 0.06 + power * 0.5;
const meterOf = (p: Player) => (s?.rules.realtime ? meterAt(s, p, clock) / s.rules.realtime.meter.full : 1);

// --- in and out ---------------------------------------------------------------

function install(d: Deps) {
  deps = d;
  wetHost = document.createElement("div");
  wetHost.id = "wet-host";
  d.els.boilHost.after(wetHost);
  farNote = document.createElement("div");
  farNote.id = "table-far";
  farNote.hidden = true;
  farNote.innerHTML = `<button class="go" hidden>done arranging</button><p class="say"></p>`;
  document.body.append(farNote);
  farNote.querySelector("button")!.onclick = () => document.querySelector<HTMLButtonElement>("#acts [data-act=ready]")?.click();
  // the far player reads the same status line, turned round, while the page is still turn-based
  const status = document.getElementById("status");
  if (status) new MutationObserver(() => mirror()).observe(status, { childList: true, characterData: true, subtree: true });
  d.over.addEventListener("pointerdown", down);
  d.over.addEventListener("pointermove", move);
  d.over.addEventListener("pointerup", up);
  d.over.addEventListener("pointercancel", up);
  window.addEventListener("resize", () => { if (active) fit(); });
}

/** Both sides are arranged: the table takes the page. */
function enter(st: GameState) {
  if (!deps) throw new Error("the table was never installed");
  s = st;
  active = true;
  ending = false;
  last = performance.now();
  clock = clockWas = st.clock ?? 0;
  tl.clear();
  resolves = [];
  sides[0] = side(0);
  sides[1] = side(1);
  bot = mode.kind === "table" && mode.bot !== undefined ? { level: mode.bot, nextAt: T + 1200, thinking: false } : null;
  document.body.classList.add("rt");
  buildStrips();
  fit();
  dirty = true;
}

/** Hand the page back (the war is over, or the menu). */
function leave() {
  if (!active) return;
  active = false;
  bot = null;
  resolves = [];
  tl.clear();
  document.body.classList.remove("rt");
  strips?.remove();
  strips = null;
  if (wet.c.parentElement) wet.c.style.visibility = "hidden";
  sfx.creak(0);
}

/** The page fits between the two strips, flat and the right way up for blue. */
function fit() {
  const { W, H } = deps!.dims();
  deps!.cam.resize(W, H, STRIP, STRIP);
  deps!.cam.overview(0);
  deps!.cam.snap();
  deps!.cam.tgt.rot = deps!.cam.cur.rot = 0;
  wetCss = "";
  dirty = true;
}

/** Called from the page's hud(): keep the far player's note in step while the page is turn-based. */
function hud(m: Mode, st: AnyState, screen: string) {
  mode = m;
  const table = m.kind === "table" && screen === "game";
  document.body.classList.toggle("table", table);
  mirrorOn = table && !active && st.phase !== "play" && st.phase !== "over" && st.current === 1 && !(m.kind === "table" && m.bot !== undefined);
  if (farNote) {
    farNote.hidden = !mirrorOn;
    farNote.querySelector("button")!.hidden = !(mirrorOn && st.phase === "position");
  }
  mirror();
}
function mirror() {
  if (!farNote || !mirrorOn) return;
  const t = document.getElementById("status")?.textContent ?? "";
  const say = farNote.querySelector(".say")!;
  if (say.textContent !== t) say.textContent = t;
}

// --- the strips -----------------------------------------------------------------

function buildStrips() {
  strips?.remove();
  strips = document.createElement("div");
  strips.id = "table";
  const one = (p: Player) => `
    <div class="strip ${p === 0 ? "near" : "far"}" data-p="${p}" style="--pen: ${hudPen(p)}">
      <div class="row">
        <b class="name"></b><span class="count"></span>
        <span class="meter" aria-label="ink in the pen"><i></i><s class="lunge"></s><s class="snipe"></s></span>
        <span class="kinds" role="radiogroup"><button data-kind="lunge" role="radio">lunge</button><button data-kind="snipe" role="radio">snipe</button></span>
        ${p === 0 ? `<button class="menu" aria-label="Menu">≡</button>` : ""}
      </div>
      <p class="say"></p>
    </div>`;
  strips.innerHTML = one(1) + one(0);
  document.body.append(strips);
  const R = s!.rules.realtime!;
  for (const el of strips.querySelectorAll<HTMLElement>(".strip")) {
    const p = +el.dataset.p! as Player;
    el.querySelector<HTMLElement>(".meter .snipe")!.style.setProperty("--at", String(R.meter.snipe / R.meter.full));
    el.querySelector<HTMLElement>(".meter .lunge")!.style.setProperty("--at", String(R.meter.lunge / R.meter.full));
    for (const b of el.querySelectorAll<HTMLButtonElement>("button[data-kind]")) {
      b.onclick = () => {
        const k = b.dataset.kind as Kind;
        if (sides[p].kind !== k) sfx.tap();
        sides[p].kind = k;
        if (sides[p].aim) sides[p].aim!.kind = k;
        dirty = true;
        hudTick(true);
      };
    }
  }
  strips.querySelector<HTMLButtonElement>(".menu")!.onclick = () => { sfx.tap(); leave(); deps!.menu(); };
  hudTick(true);
}

const sayFor = (side: Side): string => {
  if (!s) return "";
  if (s.phase === "over") return s.winner === side.p ? "you held the page" : `${nameOf(s.winner!)} held the page`;
  if (T < side.saidUntil) return side.said;
  if (side.botAim) return "Dawood-bot is lining up…";
  if (bot && side.p === 1) return bot.thinking ? "Dawood-bot is looking…" : "";
  const a = side.aim;
  if (a) return side.live ? `let go to ${side.kind}` : a.charged ? "let go to cancel" : "pull back further…";
  if (side.sel !== undefined) return "pull back from anywhere on your half, let go";
  const can = meterAt(s, side.p, clock) + 1e-9 >= costOf(s, side.kind);
  return can ? "pick up a soldier" : "ink refilling…";
};
const nameOf = (p: Player) => (bot && p === 1 ? "Dawood-bot" : hudName(p));
const hudName = (p: Player) => document.querySelector(`.tag[data-p="${p}"] .name`)?.textContent ?? (p === 0 ? "Blue" : "Red");

/** The strips: the meter, the count, the word. Cheap DOM writes, only when they change, ten times a second. */
function hudTick(force = false) {
  if (!strips || !s || (!force && T - hudAt < 100)) return;
  hudAt = T;
  const R = s.rules.realtime!;
  for (const el of strips.querySelectorAll<HTMLElement>(".strip")) {
    const p = +el.dataset.p! as Player, side = sides[p];
    const ink = meterAt(s, p, clock);
    const set = (q: string, t: string) => { const n = el.querySelector<HTMLElement>(q)!; if (n.textContent !== t) n.textContent = t; };
    set(".name", nameOf(p));
    const n = s.soldiers.filter((x) => x.alive && x.owner === p).length;
    set(".count", s.stand[p] ? `last ${n}` : `${n} standing`);
    set(".say", sayFor(side));
    const fill = (Math.round((ink / R.meter.full) * 100) / 100).toFixed(2);
    const meter = el.querySelector<HTMLElement>(".meter")!;
    if (meter.style.getPropertyValue("--fill") !== fill) meter.style.setProperty("--fill", fill);
    for (const b of el.querySelectorAll<HTMLButtonElement>("button[data-kind]")) {
      const k = b.dataset.kind as Kind;
      b.classList.toggle("on", k === side.kind);
      b.classList.toggle("cant", ink + 1e-9 < costOf(s, k));
      b.setAttribute("aria-checked", String(k === side.kind));
    }
  }
}

function say(side: Side, t: string, ms = 1400) {
  side.said = t;
  side.saidUntil = T + ms;
  hudTick(true);
}

// --- input: one finger a half -----------------------------------------------------

function down(e: PointerEvent) {
  if (!active || !s || !deps) return;
  sfx.unlock();
  const { H } = deps.dims();
  const p = sideOf(e.clientY, H), side = sides[p];
  if (side.ptr !== undefined || (bot && p === 1) || s.phase !== "play" || sheetUp()) return;
  deps.over.setPointerCapture(e.pointerId);
  const w = deps.cam.toWorld(e.clientX, e.clientY);
  side.ptr = e.pointerId;
  side.sx = e.clientX;
  side.sy = e.clientY;
  side.tapOn = undefined;
  if (!w) return;
  const z = deps.cam.fitZ * deps.cam.cur.m;
  const dry = (id: number) => canFlickAt(s!, id, clock) === null;
  const tol = Math.max(RULES.soldierRadius * 2.5, 24 / z);
  // a tap right on a wet man says so, rather than handing you his neighbour
  const onOne = pickSoldier({ ...s, current: p }, w, { soldier: tol, base: 0 });
  if (onOne !== undefined && !dry(onOne)) { say(side, "his ink is still wet"); haptic("brink"); side.tapOn = onOne; dirty = true; return; }
  const near = pickSoldier({ ...s, current: p }, w, { soldier: tol, base: side.sel === undefined ? Math.max(18, 30 / z) : 0 }, dry);
  if (near !== undefined && near !== side.sel) select(side, near);
  side.tapOn = near;
  dirty = true;
}

function select(side: Side, id: number) {
  side.sel = id;
  side.penDrop = T;
  side.penLift = undefined;
  sfx.pick();
  haptic("pickup");
  hudTick(true);
}

function putDown(side: Side) {
  if (side.sel !== undefined && lively()) { const me = s!.soldiers[side.sel]; side.penLift = { t0: T, x: me.x, y: me.y }; }
  side.sel = undefined;
  side.aim = undefined;
  dirty = true;
  hudTick(true);
}

function move(e: PointerEvent) {
  if (!active || !s || !deps) return;
  const side = sides.find((q) => q.ptr === e.pointerId);
  if (!side || side.sel === undefined) return;
  const { H } = deps.dims();
  if (!side.aim) {
    if (Math.hypot(e.clientX - side.sx, e.clientY - side.sy) < TAP) return;
    side.aim = { soldierId: side.sel, kind: side.kind, ax: side.sx, ay: side.sy, x: e.clientX, y: e.clientY, t0: T, charged: false, span: spanFor(side.p, side.sy, H) };
    side.ratchet.reset();
  }
  side.aim.x = e.clientX;
  side.aim.y = e.clientY;
  steer(side);
  dirty = true;
}

/** The pull as the page has it: the flick's direction on the page, and its power. */
function steer(side: Side) {
  const a = side.aim;
  if (!a || !s || !deps) return;
  const me = s.soldiers[a.soldierId];
  const p = pull(a);
  side.angle = screenDirToWorld(deps.cam.view(), me, Math.cos(p.angle), Math.sin(p.angle));
  side.power = p.power;
  side.live = p.live;
  a.kind = side.kind;
  if (p.live && !a.charged) { a.charged = true; a.t0 = T; }
  if (side.ratchet.step(p.power, p.live) !== null) haptic("notch", p.power);
  hudTick();
}

function up(e: PointerEvent) {
  if (!active || !s || !deps) return;
  const side = sides.find((q) => q.ptr === e.pointerId);
  if (!side) return;
  side.ptr = undefined;
  const a = side.aim;
  side.aim = undefined;
  dirty = true;
  if (a && e.type === "pointerup" && side.sel !== undefined) {
    a.x = e.clientX; a.y = e.clientY;
    steer(side);
    const p = pull(a);
    if (a.charged && !p.live) { sfx.creak(0); hudTick(true); return; } // back at the start: a quiet cancel, he stays in hand
    const h = handAt(s, a.soldierId, side.kind, clock);
    const f = release(a, T, (pw) => reachOf(s!.rules, pw), h);
    sfx.creak(0);
    if (!f) { say(side, "too soft: pull back further"); return; }
    // the pull was read on the screen; the page has it turned to the world (the hand's error rides along)
    f.angle = side.angle + (f.angle - p.angle);
    const why = canFlickAt(s, f.soldier, clock, f.kind);
    if (why) { say(side, why === "out of ink" ? "out of ink: wait for the pen to fill" : why); haptic("brink"); return; }
    haptic("flick", p.power);
    fire(side, f, p.power);
    return;
  }
  if (a) { sfx.creak(0); return; }
  // a tap on empty paper puts the pen down
  const tapped = Math.hypot(e.clientX - side.sx, e.clientY - side.sy) < TAP;
  if (tapped && side.tapOn === undefined && side.sel !== undefined) putDown(side);
  hudTick(true);
}

// --- a flick, resolving ---------------------------------------------------------------

/** Let go: the engine takes it at this moment of the clock, and the ink goes on. */
function fire(side: Side, f: Flick, power: number): boolean {
  if (!s || !deps) return false;
  const ms = clock;
  const first = s.marks.length;
  let o: Outcome;
  try {
    o = act(s, { t: "flick", ...f, ms });
  } catch (e) {
    say(side, (e as Error).message.replace(/^illegal flick: /, ""));
    return false;
  }
  deps.save();
  if (side.sel === f.soldier) side.sel = undefined;
  side.aim = undefined;
  side.botAim = undefined;
  const quick = 1;
  const len = pathLen(o.path);
  const dur = Math.min(900, Math.max(300, 220 + len * 0.42)) * quick;
  tl.add(`m${first}`, T, 0, dur, "out2");
  const kills: Resolve["kills"] = [];
  const over = s.phase === "over";
  let killed = 0, lastKill = -1;
  for (let i = first + 1; i < s.marks.length; i++) if (s.marks[i].t === "cross" && (s.marks[i] as { kind: string }).kind === "kill") lastKill = i;
  for (let i = first + 1; i < s.marks.length; i++) {
    const m = s.marks[i];
    if (m.t === "stand") { tl.add(`m${i}`, T, dur + 380, 500); continue; }
    if (m.t !== "cross") continue;
    if (m.kind === "kill") {
      const victim = o.killed[killed++];
      const v = s.soldiers[victim];
      const at = inkAt(o.path, dur, v);
      kills.push({ i, at, hit: false, last: over && i === lastKill });
      tl.add(`m${i}`, T, 1e9, 1); // held until the ink gets there
    } else tl.add(`m${i}`, T, m.kind === "lost" ? dur + 40 : dur + 160, 150);
  }
  if (deps.heard()) { sfx.slip(power); sfx.stroke(dur / 1000 / deps.speed() + 0.05, f.kind === "snipe" ? 0.6 : 0.45); }
  const r: Resolve = { f, o, owner: side.p, power, t0: T, dur, first, lean: penLean(power), kills, end: dur + 900 + 60 };
  resolves.push(r);
  if (o.earned) { say(side, f.kind === "snipe" ? "two with one: the ink's refunded" : "lunge on: he's dry, and refunded", 1800); cue("earned", 0); }
  if (o.lost) say(side, o.crashed !== undefined ? "he landed among them and was shot" : "off the page: he's gone", 1800);
  dirty = true;
  hudTick(true);
  return true;
}

/** Ink ms at which the line's head reaches `p` (the same easing the stroke draws with). */
function inkAt(path: Pt[], dur: number, p: Pt) {
  let bi = 0, bd = Infinity;
  path.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } });
  return reachFraction(bi, Math.max(1, path.length - 1)) * dur;
}

/** Where the head of a line is at progress p, and which way it is going. */
function headAt(pts: Pt[], p: number) {
  const n = pts.length - 1, h = Math.min(n, Math.max(0, p * n));
  const i = Math.min(n - 1, Math.floor(h)), f = h - i;
  const a = pts[i], b = pts[i + 1] ?? a;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
const headOf = (r: Resolve, it: number) => headAt(r.o.path, 1 - Math.pow(1 - Math.min(1, Math.max(0, it / r.dur)), 2));

function stepResolves() {
  if (!s || !deps) return;
  for (const r of resolves) {
    const it = T - r.t0;
    for (const k of r.kills) {
      if (k.hit || it < k.at) continue;
      k.hit = true;
      tl.add(`m${k.i}`, T, 0, k.last ? 260 : 150);
      if (deps.heard()) { sfx.snag(k.last); sfx.cross(0.02, k.last ? 1.2 : 1); }
      deps.cam.shake(k.last ? 9 : 4);
      haptic(k.last ? "over" : "kill", r.kills.filter((x) => x.hit).length);
      if (k.last) cue("last-stand", other(r.owner)); // the closing cross: felt like a stand's end
    }
    if (!r.settled && it >= r.dur) { r.settled = true; haptic("land"); }
  }
  const before = resolves.length;
  resolves = resolves.filter((r) => T - r.t0 < r.end);
  if (resolves.length !== before) dirty = true;
}

/** The pen through a flick: rides its ink, tips forward, falls flat, is picked up. */
function penOf(r: Resolve, it: number): PenPose {
  const p = Math.min(1, it / r.dur), e = 1 - Math.pow(1 - p, 2);
  const h = headOf(r, it);
  const ink = meterOf(r.owner);
  if (it < r.dur) return leaning(h.x, h.y, h.angle, r.lean + (1.1 - r.lean) * e, r.owner, ink);
  const t = it - r.dur;
  const fall = Math.min(1, t / 170);
  const bounce = fall < 1 ? 1.05 + (Math.PI / 2 - 1.05) * fall * fall : Math.PI / 2 - Math.sin(Math.min(1, (t - 170) / 160) * Math.PI) * 0.07;
  const pose = leaning(h.x, h.y, h.angle, bounce, r.owner, ink);
  const up = Math.max(0, (t - 520) / 330);
  if (up > 0) { pose.h = 160 * up * up; pose.alpha = 1 - up; }
  return pose;
}

// --- Dawood-bot at the table ----------------------------------------------------------

function stepBot() {
  if (!bot || !s || !deps || s.phase !== "play") return;
  const side = sides[1];
  if (side.botAim) {
    if (T - side.botAim.t0 < BOT.aimMs) return;
    const { f, power } = side.botAim;
    side.botAim = undefined;
    if (canFlickAt(s, f.soldier, clock, f.kind) === null) fire(side, f, power);
    else side.sel = undefined;
    bot.nextAt = T + BOT.gapMs + Math.random() * BOT.jitterMs;
    dirty = true;
    return;
  }
  if (bot.thinking || T < bot.nextAt) return;
  bot.thinking = true;
  const asked = s, b = bot;
  // the bot's view: its own pen, the clock as it stands, and no sends (there are none in real time)
  const view: GameState = { ...s, current: 1, clock, sent: true };
  void botMoveLater(view, bot.level, (Math.random() * 2 ** 32) >>> 0).then((a) => {
    if (bot !== b || s !== asked || !active) return;
    b.thinking = false;
    if (a.t !== "flick" || canFlickAt(s!, a.soldier, clock, a.kind) !== null) { b.nextAt = T + 700; return; }
    const { t: _t, ...f } = a;
    void _t;
    side.sel = f.soldier;
    side.penDrop = T;
    side.botAim = { f, power: Math.max(0.05, Math.min(1, (f.length - 200) / 1800)), t0: T };
    sfx.pick();
    dirty = true;
    hudTick(true);
  });
}

// --- the frame -------------------------------------------------------------------------

function frame(now: number) {
  if (!active || !s || !deps) return;
  const sp = deps.speed();
  const dt = Math.min(50, Math.max(0, now - last)) * sp;
  last = now;
  wall = now;
  T += dt;
  const cam = deps.cam;
  if (cam.top !== STRIP || cam.bottom !== STRIP) fit();
  // the game clock runs while the war is on and the page is in view
  if (s.phase === "play" && !document.hidden && !sheetUp()) clock += dt;
  if (clock !== clockWas) {
    for (const id of dried(s.rt?.wet, clockWas, clock)) {
      if (!s.soldiers[id]?.alive) continue;
      cue("dry", id);
      if (deps.heard()) sfx.dot();
      dirty = true;
    }
    clockWas = clock;
  }
  stepResolves();
  stepBot();
  let creak = 0, tremble = 0;
  for (const side of sides) {
    if (!side.aim || side.sel === undefined) continue;
    steer(side);
    const w = wobble(side.aim, T, handAt(s, side.sel, side.kind, clock));
    creak = Math.max(creak, side.power);
    tremble = Math.max(tremble, Math.abs(w) * 12);
    if (side.ratchet.shake(w !== 0)) haptic("wobble");
  }
  sfx.creak(creak, tremble);
  const moving = cam.tick(dt);
  const penBusy = sides.some((q) => q.aim || q.botAim || T - q.penDrop < SETTLE_MS + 240 || (q.penLift && T - q.penLift.t0 < LIFT_MS));
  const activeNow = moving || resolves.length > 0 || tl.end(T) > T || penBusy;
  if (activeNow || dirty) { render(); dirty = false; }
  else if (deps.boilOn()) boilTick(wall);
  drawWet();
  hudTick();
  if (s.phase === "over" && !resolves.length && !ending) {
    ending = true;
    hudTick(true);
    setTimeout(() => { if (active && ending) { leave(); deps!.exit(); } }, 900);
  }
}

function render() {
  const f = currentFrame();
  const { W, H, dpr } = deps!.dims();
  renderStage(deps!.els, f);
  renderOverlay(deps!.og, f, W, H, dpr);
}

function currentFrame(): Frame {
  const d = deps!, st = s!, cam = d.cam;
  const { W, H, sdpr } = d.dims();
  const live = tl.live(T);
  const ink: Ink = live.size ? { p: (k) => tl.p(k, T), live } : SETTLED;
  const f: Frame = {
    s: st, pageSource: st, view: cam.view(), lamp: d.lamp(), ink, dpr: sdpr, sw: W, cw: W + cam.ox * 2, ch: H + cam.oy + cam.ob,
    lean: 0, boil: { on: d.boilOn(), ms: wall, bold: boldAt(cam.cur.m) }, pens: [], aims: [], movers: [],
  };
  // ink going on: every line flying, each with its rider and its pen
  for (const r of resolves) {
    const it = T - r.t0;
    if (r.f.kind === "lunge" && it < r.dur && st.soldiers[r.f.soldier].alive) {
      const h = headOf(r, it), p = Math.min(1, it / r.dur);
      f.movers!.push({ id: r.f.soldier, at: h, angle: h.angle, stretch: lively() ? 1 + 0.6 * (1 - p) : 1 });
    }
    f.pens!.push(penOf(r, it));
  }
  // the pens in hand, and the pulls
  for (const side of sides) {
    if (side.sel === undefined) {
      if (side.penLift) {
        const l = lift(T - side.penLift.t0);
        if (l) { const pen = leaning(side.penLift.x, side.penLift.y, 0, 0.05, side.p, meterOf(side.p)); pen.h = l.h; pen.alpha = l.alpha; f.pens!.push(pen); }
        else side.penLift = undefined;
      }
      continue;
    }
    const me = st.soldiers[side.sel];
    if (!me.alive) { side.sel = undefined; side.aim = undefined; continue; }
    const ink = meterOf(side.p);
    const hand = handAt(st, side.sel, side.kind, clock);
    if (side.aim) {
      const ang = side.angle + wobble(side.aim, T, hand);
      f.aims!.push({ soldierId: side.sel, angle: ang, power: side.power, spread: aimError(side.power, hand) * 2, reach: reachOf(st.rules, side.power), kind: side.kind });
      const sh = lively() && side.live ? shiver(T, side.power) : 0;
      const pen = leaning(me.x, me.y, ang + sh * 3, side.live ? penLean(side.power) + sh : 0.04, side.p, ink);
      pen.charge = side.live ? side.power : 0;
      f.pens!.push(pen);
    } else if (side.botAim) {
      const k = Math.min(1, (T - side.botAim.t0) / (BOT.aimMs * 0.8));
      const pw = side.botAim.power * (1 - Math.pow(1 - k, 2));
      const tremble = Math.sin((T / 1000) * 7.3) * 0.02 * pw;
      f.aims!.push({ soldierId: side.sel, angle: side.botAim.f.angle + tremble, power: pw, spread: aimError(pw, hand) * 2, reach: reachOf(st.rules, pw), kind: side.botAim.f.kind });
      const pen = leaning(me.x, me.y, side.botAim.f.angle + tremble, penLean(pw), side.p, ink);
      pen.charge = pw;
      f.pens!.push(pen);
    } else {
      // set down on the dot: drops in, then rocks a few times finding its balance
      const k = Math.min(1, (T - side.penDrop) / 240);
      const rock = lively() ? settle(T - side.penDrop - 240) : 0;
      const pen = leaning(me.x, me.y, (me.id * 2.39) % 6.283, 0.03 + rock, side.p, ink);
      pen.h = 70 * (1 - k) * (1 - k);
      pen.alpha = k;
      f.pens!.push(pen);
    }
  }
  // the ring round a man in hand, and a side in its last stand
  const held = ([0, 1] as Player[]).filter((p) => st.stand[p] > 0);
  if (held.length) {
    const living = lifeOf(st, ink).soldiers;
    const riding = new Set(f.movers!.map((m) => m.id));
    f.stand = st.soldiers.filter((x) => living.has(x.id) && held.includes(x.owner) && !riding.has(x.id)).map((x) => ({ x: x.x, y: x.y, id: x.id }));
  }
  const onlyOne = sides.filter((q) => q.sel !== undefined && !q.aim && !q.botAim);
  if (onlyOne.length === 1) f.selected = onlyOne[0].sel; // the pencil ring round him (scene draws one)
  return f;
}

/** The wet gloss: redrawn at the boil's rate while anyone is wet, on its own small layer. */
function drawWet() {
  const st = s!, d = deps!, R = st.rules.realtime!;
  const riding = new Set(resolves.filter((r) => T - r.t0 < r.dur).map((r) => r.f.soldier));
  const men = wetMen(st.rt?.wet, clock, R.dryMs).filter((m) => st.soldiers[m.id]?.alive && !riding.has(m.id)).map((m) => ({ ...m, owner: st.soldiers[m.id].owner }));
  const lamp = d.lamp();
  const still = d.reduced || d.slow();
  const drawn = wet.draw(men, (id) => st.soldiers[id], { x: lamp.x, y: lamp.y }, pageState.S, boilFrame(wall, WET.fps), still);
  const c = wet.c;
  if (c.parentElement !== wetHost) wetHost!.replaceChildren(c);
  const vis = wet.empty ? "hidden" : "";
  if (c.style.visibility !== vis) c.style.visibility = vis;
  if (wet.empty) return;
  const css = cssMatrix(layerMatrix(d.cam.view(), wet.S, wet.ox, wet.oy));
  if (drawn || css !== wetCss) { c.style.transform = css; wetCss = css; }
}

/** The table, as main.ts and the dev hook see it. */
export const tabletop = {
  install,
  enter,
  leave,
  frame,
  hud,
  get active() { return active; },
  get clock() { return clock; },
  get T() { return T; },
  get resolving() { return resolves.length; },
  get sides() { return sides.map((q) => ({ p: q.p, kind: q.kind, sel: q.sel, aiming: !!q.aim, angle: q.angle, power: q.power, live: q.live, ptr: q.ptr })); },
  get wet() { return s ? wetMen(s.rt?.wet, clock, s.rules.realtime?.dryMs ?? 0) : []; },
  /** Dev: a flick by this side at the clock's moment, resolved on screen as a real one would be. */
  flick: (p: Player, f: Flick, power = 0.6) => fire(sides[p], f, power),
  /** Dev: pick a kind for a side. */
  kind: (p: Player, k: Kind) => { sides[p].kind = k; },
  meter: (p: Player) => (s ? meterAt(s, p, clock) : 0),
};

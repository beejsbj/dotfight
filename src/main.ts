import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/special-elite/400.css";
import "./style.css";

import { botBase, botFlick, LEVELS, type Level } from "./bot";
import { Camera } from "./camera";
import { pull, reach, release, sigma, wobble, type Aim as Pull } from "./flick";
import {
  act, alive, basesLeft, canAct, canPlaceBase, newGame, pathLen, placeBase,
  type ActionKind, type Flick, type GameState, type Outcome, type Player, type Pt,
} from "./game";
import { jotOrder, pickSoldier, inBase } from "./hand";
import { inkTime, type Snag } from "./inkclock";
import * as inkLib from "./ink";
import { INK } from "./ink";
import { farColour, lampFor } from "./light";
import { PageLayer, SETTLED, type Ink } from "./page";
import { leaning, PEN, type PenPose } from "./pen";
import { screenDirToWorld, stageCss } from "./projection";
import { addToDrawer, apply, blank, file, readDrawer, readSave, steps, unfile, type Filed, type Mode, type Save, type Step } from "./record";
import { RULES } from "./rules";
import { dbg, page, pageState, stageStats, renderOverlay, renderStage, worldTransform, type Frame } from "./scene";
import * as sfx from "./sound";
import { Timeline, reachFraction } from "./timeline";

// --- state ------------------------------------------------------------------

const settings = {
  tilt: localStorage.getItem("pft:tilt") !== "0", // sit down at the desk to aim
  handoff: localStorage.getItem("pft:handoff") === "1", // pause for a tap between pass-and-play turns
};

let s: GameState = newGame();
let mode: Mode = { kind: "pnp" };
let kind: ActionKind = "shoot";
let selected: number | undefined;
let aim: Pull | null = null;
let aimAngle = 0; // world angle of the current pull
let botAim: { soldierId: number; angle: number; power: number; t0: number } | null = null;
let ghost: Frame["ghost"];
let busy = false; // a flick is resolving, the bot is thinking, or the page is turning
let lastNote = "";
let gen = 0; // bumps on every new/resumed game so stale callbacks stand down
let screen: "title" | "game" | "view" | "replay" = "title";
let viewing: Filed | null = null; // a page out of the drawer

// time: T is the game's own clock (ms). `speed` slows or speeds everything, for playtests.
let T = 0;
let speed = 1;
const fx = new Timeline(); // bases, dots, hints, notes, crosses: wall time
const inkTL = new Timeline(); // the stroke of the flick resolving now: ink time

// small tweens on T
class Tween {
  from = 0; to = 0; t0 = 0; dur = 1;
  constructor(public v: number) { this.from = this.to = v; }
  go(to: number, dur: number) { this.from = this.at(T); this.to = to; this.t0 = T; this.dur = Math.max(1, dur); }
  set(v: number) { this.from = this.to = v; this.dur = 1; this.t0 = -1e9; }
  at(t: number) { const k = Math.min(1, Math.max(0, (t - this.t0) / this.dur)); const e = k * k * (3 - 2 * k); return this.from + (this.to - this.from) * e; }
  get moving() { return T < this.t0 + this.dur; }
}
const lampOn = new Tween(0);
const dawn = new Tween(0);

// things to do later, on the game clock
let later: { at: number; fn: () => void; g: number }[] = [];
function after(ms: number, fn: () => void) { later.push({ at: T + ms, fn, g: gen }); }

// the flick resolving now
interface Resolve {
  f: Flick; o: Outcome; owner: Player; power: number;
  t0: number; dur: number; snags: Snag[];
  kills: { i: number; at: number; hit: boolean; last: boolean }[];
  first: number; mover?: number; end: number;
  pen: boolean; cam: boolean; startLean: number; startAngle: number;
  stood: boolean; done: () => void;
}
let res: Resolve | null = null;
let penDrop = -1e9; // when the pen was set down on the selected soldier

const $ = <T extends HTMLElement>(q: string) => document.querySelector(q) as T;
const stage = $<HTMLCanvasElement>("#stage");
const over = $<HTMLCanvasElement>("#over");
const sg = stage.getContext("2d", { alpha: false })!;
const og = over.getContext("2d")!;
const cam = new Camera();
let W = 0, H = 0, dpr = 1, sdpr = 1, dirty = true;

const isBot = (p: Player) => mode.kind === "bot" && p === 1;
const name = (p: Player) => (isBot(p) ? "Dawood-bot" : INK.names[p]);
const rotFor = (p: Player) => (mode.kind === "pnp" && p === 1 ? Math.PI : 0);

function save() {
  if (screen !== "game") return;
  localStorage.setItem("pft:save", JSON.stringify({ s, mode } satisfies Save));
}
const load = () => readSave(localStorage.getItem("pft:save"));
const drawer = () => readDrawer(localStorage.getItem("pft:drawer"));

// --- layout -----------------------------------------------------------------

function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  sdpr = Math.min(2, dpr);
  W = window.innerWidth;
  H = window.innerHeight;
  const top = $("#top").getBoundingClientRect().bottom;
  const bottom = H - $("#bottom").getBoundingClientRect().top;
  cam.resize(W, H, top, bottom);
  const cw = W + cam.ox * 2, ch = H + cam.oy + cam.ob;
  stage.style.left = `${-cam.ox}px`;
  stage.style.top = `${-cam.oy}px`;
  stage.style.width = `${cw}px`;
  stage.style.height = `${ch}px`;
  const [pw, ph] = [Math.round(cw * sdpr), Math.round(ch * sdpr)];
  if (stage.width !== pw || stage.height !== ph) { stage.width = pw; stage.height = ph; }
  const [ow, oh] = [Math.round(W * dpr), Math.round(H * dpr)];
  if (over.width !== ow || over.height !== oh) { over.width = ow; over.height = oh; }
  // page texture resolution: sharp at the closest the camera sits, capped for memory
  pageState.S = Math.round(Math.min(2.4, Math.max(1.2, sdpr * cam.fitZ * 2.6)) * 10) / 10;
  if (!res && !aim && cam.tgt.tilt === 0 && cam.tgt.m === 1) { cam.overview(); cam.snap(); }
  dirty = true;
}
window.addEventListener("resize", resize);
new ResizeObserver(() => resize()).observe($("#bottom"));
new ResizeObserver(() => resize()).observe($("#top"));
for (const ev of ["touchend", "click", "keydown"]) window.addEventListener(ev, sfx.unlock, { passive: true });
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function applyTilt() { cam.tiltScale = settings.tilt && !reduced ? 1 : 0; }
applyTilt();

// --- hud --------------------------------------------------------------------

function inkLeft(p: Player) {
  let used = 0;
  for (const m of s.marks) if (m.t === "stroke" && m.owner === p) used += pathLen(m.pts);
  return Math.max(0.05, 1 - used / 60000);
}

function hud() {
  const inGame = screen === "game" || screen === "view" || screen === "replay";
  document.body.classList.toggle("playing", inGame);
  for (const p of [0, 1] as Player[]) {
    const el = $(`.tag[data-p="${p}"]`);
    el.classList.toggle("on", s.current === p && s.phase !== "over" && screen === "game");
    el.classList.toggle("won", s.phase === "over" && s.winner === p);
    (el.querySelector(".name") as HTMLElement).textContent = name(p);
    const n = alive(s, p).length;
    const c = el.querySelector(".count") as HTMLElement;
    c.textContent = s.phase === "setup" ? `${basesLeft(s, p)} camps to draw` : `${n} standing`;
    el.style.setProperty("--ink-left", inkLeft(p).toFixed(3));
  }
  document.documentElement.style.setProperty("--ink", INK.pens[s.current]);
  for (const b of document.querySelectorAll<HTMLButtonElement>("#kind button")) {
    const on = b.dataset.kind === kind;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  }
  $("#kind").classList.toggle("off", s.phase !== "play" || isBot(s.current) || screen !== "game" || busy && !aim);
  $("#bottom").classList.toggle("view", screen === "view" || screen === "replay");
  status();
}

function status(msg?: string) {
  let t = msg ?? "";
  if (!msg) {
    const who = name(s.current);
    if (screen === "replay") t = "the war, again";
    else if (screen === "view") t = viewing ? `page ${viewing.page?.no ?? "?"} · ${viewing.page?.date ?? ""}` : "";
    else if (s.phase === "setup") t = isBot(s.current) ? `${who} is drawing a camp…` : `${who}: draw a camp`;
    else if (s.phase === "over") t = `${name(s.winner!)} held the page`;
    else if (res) t = "";
    else if (isBot(s.current)) t = `${who} is lining up…`;
    else if (aim) t = pull(aim).live ? `let go to ${kind}` : "pull back further…";
    else if (selected !== undefined) t = `pull back from anywhere, let go`;
    else t = lastNote ? `${lastNote}` : `${who}: pick up a soldier`;
  }
  $("#status").textContent = t;
}

// --- flow -------------------------------------------------------------------

function pageStamp() {
  const no = +(localStorage.getItem("pft:pageNo") ?? 0) + 1;
  localStorage.setItem("pft:pageNo", String(no));
  const d = new Date();
  return { no, date: `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}` };
}

const taught = (k: string) => localStorage.getItem(`pft:taught:${k}`) === "1";
const learn = (k: string) => localStorage.setItem(`pft:taught:${k}`, "1");

function reset() {
  gen++;
  later = [];
  busy = false;
  res = null;
  aim = null;
  botAim = null;
  ghost = undefined;
  selected = undefined;
  lastNote = "";
  fx.clear();
  inkTL.clear();
  sfx.creak(0);
}

function start(m: Mode) {
  reset();
  restoreKindBar();
  s = newGame(undefined, pageStamp());
  mode = m;
  kind = "shoot";
  screen = "game";
  viewing = null;
  dawn.go(0, 800);
  save();
  closeCover();
  closeSheet();
  cam.overview(0);
  if (!taught("place")) fx.add("teach", T, 700, 1100, "linear");
  hud();
  after(300, next);
}

function resume(v: Save) {
  reset();
  restoreKindBar();
  s = v.s;
  mode = v.mode;
  screen = "game";
  viewing = null;
  closeCover();
  closeSheet();
  cam.overview(rotFor(s.current));
  dawn.set(s.phase === "over" ? 1 : 0);
  hud();
  if (s.phase === "over") { viewBar(); return void after(400, showOver); }
  next();
}

// whoever's turn it is: let a human act, or have the bot go
function next() {
  hud();
  dirty = true;
  if (screen !== "game") return;
  if (s.phase === "over") return finish();
  if (!isBot(s.current)) {
    if (s.phase === "play") fx.add("hint", T, 150, 620, "out");
    busy = false;
    hud();
    return;
  }
  busy = true;
  hud();
  if (s.phase === "setup") {
    after(650, () => {
      const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y));
      if (spot) drawBase(spot.x, spot.y);
      after(900, () => { busy = false; next(); });
    });
    return;
  }
  after(500, () => {
    const f = botFlick(s, (mode as { level: Level }).level);
    const me = s.soldiers[f.soldierId];
    selected = f.soldierId;
    kind = f.kind;
    // sit where the ink will come toward you
    const down = Math.sin(f.angle + cam.tgt.rot) > 0;
    sitOn(me, down ? 0.36 : 0.64);
    sfx.pick();
    penDrop = T;
    hud();
    const power = f.kind === "shoot"
      ? (f.length - RULES.shootMinLen) / (RULES.shootMaxLen - RULES.shootMinLen)
      : (f.length - RULES.moveMinLen) / (RULES.moveMaxLen - RULES.moveMinLen);
    after(650, () => {
      botAim = { soldierId: f.soldierId, angle: f.angle, power: Math.max(0.05, Math.min(1, power)), t0: T };
      after(900, () => {
        const pw = botAim?.power ?? 0.5;
        const lean = penLean(pw);
        botAim = null;
        fire(f, pw, lean);
      });
    });
  });
}

function sitOn(p: Pt, fy = 0.64) {
  if (cam.tiltScale > 0) cam.sit(p, 2.3, 0.62, fy);
  else cam.sit(p, 2.1, 0, 0.5);
}

// The circle goes round, then the soldiers are jotted in, one tap each.
function drawBase(x: number, y: number, quick = 1) {
  const b = placeBase(s, x, y);
  hud();
  fx.add(`b${b.id}`, T, 0, 380 * quick, "out");
  sfx.circle();
  sfx.buzz(10);
  const dots = s.soldiers.slice(-RULES.soldiersPerBase);
  jotOrder(dots).forEach((i, k) => {
    const delay = (430 + k * 62) * quick;
    fx.add(`d${dots[i].id}`, T, delay, 90 * quick, "out");
    sfx.dot(delay / 1000 / speed);
  });
  save();
}

// after a human draws a base: hand the page over if it's someone else's go
function afterBase() {
  busy = true;
  after(1000, () => handOver());
}

function handOver() {
  // does the sheet need turning round to face whoever's go it is?
  const turned = mode.kind === "pnp" && Math.cos(cam.tgt.rot - rotFor(s.current)) < 0.5;
  if (turned) {
    cam.overview();
    cam.turnTo(rotFor(s.current));
    sfx.turnPage();
    after(settings.handoff && s.phase === "play" ? 700 : 900, () => {
      if (settings.handoff && s.phase === "play") showHandoff();
      else { busy = false; next(); }
    });
  } else { busy = false; next(); }
}

// how far the pen leans back under a pull of this power
const penLean = (power: number) => 0.06 + power * 0.5;

// `power` is how hard the pen was pulled back; `lean` how far it was leaning when it went.
function fire(f: Flick, power: number, lean: number, opts: { pen?: boolean; cam?: boolean; quick?: number } = {}) {
  const who = s.current;
  const first = s.marks.length; // act() appends the stroke, then its crosses
  const o = act(s, f);
  save();
  selected = undefined;
  aim = null;
  busy = true;
  sfx.creak(0);
  const quick = opts.quick ?? 1;
  const len = pathLen(o.path);
  const dur = Math.min(900, Math.max(300, 220 + len * 0.42)) * quick;
  const n = o.path.length - 1;
  inkTL.clear();
  inkTL.add(`m${first}`, 0, 0, dur, "out2");
  const over = s.phase === "over";
  const kills: Resolve["kills"] = [];
  const snags: Snag[] = [];
  let lastKill = -1;
  for (let i = first + 1; i < s.marks.length; i++) if (s.marks[i].t === "cross" && (s.marks[i] as { kind: string }).kind === "kill") lastKill = i;
  const killCount = s.marks.slice(first + 1).filter((m) => m.t === "cross" && m.kind === "kill").length;
  for (let i = first + 1; i < s.marks.length; i++) {
    const m = s.marks[i];
    if (m.t !== "cross") continue;
    if (m.kind === "kill") {
      const at = reachFraction(nearestIndex(o.path, m), n) * dur;
      const last = over && i === lastKill;
      kills.push({ i, at, hit: false, last });
      // held until the ink gets there; then drawn on the wall clock during the snag
      fx.add(`m${i}`, T, 1e9, 1);
      snags.push({ at, hold: (last ? 560 : killCount > 2 ? 70 : 105) * quick });
    } else {
      inkTL.add(`m${i}`, 0, m.kind === "lost" ? dur + 40 * quick : dur + 160 * quick, 150 * quick);
      if (m.kind === "moved") after(((dur + 160 * quick) + snags.reduce((a, b) => a + b.hold, 0)), () => sfx.cross(0, 0.5));
    }
  }
  snags.sort((a, b) => a.at - b.at);
  const pen = opts.pen ?? true;
  const penTail = pen ? 900 * quick : 0;
  res = {
    f, o, owner: who, power, t0: T, dur, snags, kills, first,
    mover: f.kind === "move" ? f.soldierId : undefined,
    end: Math.max(dur + penTail, dur + 330 * quick) + 60,
    pen, cam: opts.cam ?? true, startLean: lean, startAngle: f.angle, stood: false,
    done: () => {
      const k = o.killed.length;
      const verb = f.kind === "shoot" ? "shot" : "run";
      lastNote = o.lost ? `${name(who)} flicked a soldier off the page`
        : k ? `${name(who)}'s ${verb} crossed out ${k}` : f.kind === "move" ? `${name(who)} moved a soldier` : `${name(who)} missed`;
      if (screen === "replay") return replayNext();
      if (s.phase === "over") return next();
      handOver();
    },
  };
  sfx.slip(power);
  sfx.scratch(dur / 1000 / speed + 0.05, f.kind === "shoot" ? 0.6 : 0.45);
  sfx.buzz(12);
  hud();
}

function nearestIndex(pts: Pt[], p: Pt) {
  let bi = 0, bd = Infinity;
  pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } });
  return bi;
}

// where the head of a line is at progress p, and which way it is going
function headAt(pts: Pt[], p: number) {
  const n = pts.length - 1, h = Math.min(n, Math.max(0, p * n));
  const i = Math.min(n - 1, Math.floor(h)), f = h - i;
  const a = pts[i], b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Per frame while a flick resolves: land the crosses, chase the ink, stand up after.
function stepResolve() {
  const r = res!;
  const e = T - r.t0;
  const it = inkTime(e, r.snags);
  for (const k of r.kills) {
    if (k.hit || it < k.at) continue;
    k.hit = true;
    fx.add(`m${k.i}`, T, 0, k.last ? 260 : 150);
    sfx.snag(k.last);
    sfx.cross(0.02, k.last ? 1.2 : 1);
    sfx.buzz(k.last ? [30, 40, 60] : 16);
    if (r.cam) cam.shake(k.last ? 9 : 4);
  }
  const p = Math.min(1, it / r.dur);
  const head = headAt(r.o.path, 1 - Math.pow(1 - p, 2));
  if (r.cam && it < r.dur) cam.chase(head, cam.tiltScale ? 1.55 : 1.4, 0.3, 0.52);
  if (r.cam && !r.stood && it > r.dur + 380) { r.stood = true; cam.overview(); }
  if (it >= r.end) {
    const done = r.done;
    res = null;
    inkTL.clear();
    dirty = true;
    done();
  }
}

// The pen through a flick: rides its ink, tips forward, falls flat, is picked up.
function resolvePen(r: Resolve, it: number): PenPose | undefined {
  if (!r.pen) return undefined;
  const p = Math.min(1, it / r.dur);
  const e = 1 - Math.pow(1 - p, 2);
  const h = headAt(r.o.path, e);
  const ink = inkLeft(r.owner);
  if (it < r.dur) {
    // already tipped toward the shot, it pitches further forward as it skids
    const lean = r.startLean + (1.1 - r.startLean) * e;
    return leaning(h.x, h.y, h.angle, lean, r.owner, ink);
  }
  const t = it - r.dur;
  const fall = Math.min(1, t / 170);
  // falls flat with a little bounce
  const bounce = fall < 1 ? 1.05 + (Math.PI / 2 - 1.05) * fall * fall : Math.PI / 2 - Math.sin(Math.min(1, (t - 170) / 160) * Math.PI) * 0.07;
  const pose = leaning(h.x, h.y, h.angle, bounce, r.owner, ink);
  const lift = Math.max(0, (t - 520) / 330);
  if (lift > 0) { pose.h = 160 * lift * lift; pose.alpha = 1 - lift; }
  return pose;
}

function finish() {
  busy = true;
  hud();
  const w = s.winner!;
  if (screen === "game") {
    localStorage.setItem("pft:drawer", JSON.stringify(addToDrawer(drawer(), file(s, mode))));
    localStorage.removeItem("pft:save");
  }
  // the page is turned square to the desk, the way it will be filed
  cam.overview();
  cam.turnTo(0);
  after(500, () => {
    dawn.go(1, 2600);
    sfx.birds();
  });
  after(1500, () => { fx.add("sign", T, 0, 1500, "linear"); sfx.scratch(1.2, 0.3, 2800); });
  after(3400, () => { busy = false; if (screen === "game") { viewBar(); showOver(); } });
  void w;
}

// --- title: the exercise book's cover --------------------------------------

let botLevel = (+(localStorage.getItem("pft:lvl") ?? 1) as Level);

function showTitle() {
  screen = "title";
  reset();
  closeSheet();
  restoreKindBar();
  const saved = load();
  const d = drawer();
  // the desk shows the page you're on, or a clean one
  if (saved) { s = saved.s; mode = saved.mode; } else { s = newGame(1); mode = { kind: "pnp" }; }
  cam.overview(rotFor(s.current));
  cam.snap();
  dawn.set(0);
  hud();
  const canResume = saved && saved.s.phase !== "over";
  const menu = $("#cover .menu");
  menu.innerHTML = `
    ${canResume ? `<button data-a="resume" class="ink blue">carry on page ${saved!.s.page?.no ?? ""}<small>${saved!.s.phase === "setup" ? "still drawing camps" : `turn ${saved!.s.turn}, ${alive(saved!.s, 0).length} v ${alive(saved!.s, 1).length}`}</small></button>` : ""}
    <button data-a="bot" class="ink red">play Dawood-bot</button>
    <p class="levels">${LEVELS.map((l, i) => `<button data-lvl="${i}" class="${i === botLevel ? "on" : ""}">${l}</button>`).join("")}</p>
    <button data-a="pnp" class="ink blue">pass &amp; play<small>two of you, one phone</small></button>
    <p class="row">
      <button data-a="drawer" class="pencil">the drawer${d.length ? ` (${d.length})` : ""}</button>
      <button data-a="how" class="pencil">how it's played</button>
      <button data-a="settings" class="pencil">settings</button>
    </p>`;
  const cover = $("#cover");
  cover.hidden = false;
  cover.classList.remove("open");
  menu.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.unlock();
    sfx.tap();
    const a = b.dataset.a;
    if (a === "resume" && saved) resume(saved);
    else if (a === "pnp") start({ kind: "pnp" });
    else if (a === "bot") start({ kind: "bot", level: botLevel });
    else if (a === "how") showHow();
    else if (a === "drawer") showDrawer();
    else if (a === "settings") showSettings();
    else if (b.dataset.lvl) {
      botLevel = +b.dataset.lvl as Level;
      localStorage.setItem("pft:lvl", String(botLevel));
      for (const x of menu.querySelectorAll<HTMLElement>("[data-lvl]")) x.classList.toggle("on", x === b);
    }
  };
  // the lamp comes on
  if (lampOn.to < 1) after(450, switchOn);
}

function switchOn() {
  sfx.lamp();
  // a flicker: on, off, on
  lampOn.go(0.75, 40);
  after(70, () => lampOn.go(0.15, 50));
  after(160, () => lampOn.go(1, 180));
  document.body.classList.add("lit");
}

function closeCover() {
  const c = $("#cover");
  if (c.hidden) return;
  c.classList.add("open");
  sfx.rustle();
  setTimeout(() => { if (c.classList.contains("open")) c.hidden = true; }, 700);
}

// --- sheets -------------------------------------------------------------------

function sheet(html: string, cls = "") {
  const el = $("#sheet");
  const card = el.querySelector(".card") as HTMLElement;
  card.className = `card ${cls}`;
  card.innerHTML = html;
  el.hidden = false;
  el.onclick = null;
  return card;
}
function closeSheet() { $("#sheet").hidden = true; }

function showHow() {
  sheet(`
    <h2>How Dawood played it</h2>
    <ol>
      <li>Take turns drawing camps: circles with ten men in each.</li>
      <li>On your go, pick up one soldier. Pull back from anywhere on the screen and let go, like flicking a pen stood on its tip.</li>
      <li><b>Shoot</b>: the ink runs nearly off the page. Every enemy it touches is crossed out. Your man stays put.</li>
      <li><b>Move</b>: a shorter line, and your man ends up where the ink stops. It still crosses out anyone it runs through. Flick him off the page and he's gone.</li>
      <li>Hold a hard flick too long and your hand starts to shake.</li>
      <li>Nothing is ever rubbed out. Cross out every enemy to win.</li>
    </ol>
    <p class="fine">Pinch to zoom · tap <b>page</b> to stand up and see everything. Rules from memory, waiting on Dawood.</p>
    <button class="act" data-a="back">back</button>`).onclick = (e) => {
    if ((e.target as HTMLElement).closest("button")) { closeSheet(); }
  };
}

function showSettings() {
  const row = (k: string, on: boolean, label: string, hint: string) =>
    `<button class="toggle ${on ? "on" : ""}" data-set="${k}"><b>${label}</b><i>${hint}</i></button>`;
  const card = sheet(`
    <h2>Settings</h2>
    ${row("tilt", settings.tilt, "sit down to aim", "the camera drops low behind your soldier")}
    ${row("handoff", settings.handoff, "pause between turns", "pass & play: tap before the next go")}
    ${row("sound", !sfx.muted, "sound", "pen, paper, lamp")}
    <button class="act" data-a="back">done</button>`);
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.tap();
    const k = b.dataset.set;
    if (k === "sound") sfx.setMuted(!sfx.muted);
    else if (k === "tilt" || k === "handoff") {
      settings[k] = !settings[k];
      localStorage.setItem(`pft:${k}`, settings[k] ? "1" : "0");
      applyTilt();
    } else if (b.dataset.a === "back") return closeSheet();
    showSettings();
  };
}

function showHandoff() {
  const nextP = s.current;
  const card = sheet(`
    <p class="sub">${lastNote}</p>
    <h2 style="color:${INK.pens[nextP]}">Your pen, ${name(nextP)}</h2>
    <p class="fine">tap when you've got it</p>`, "handoff");
  sfx.rustle();
  card.parentElement!.onclick = () => {
    card.parentElement!.onclick = null;
    closeSheet();
    busy = false;
    next();
  };
}

function showOver() {
  if (s.phase !== "over") return;
  const w = s.winner!;
  // the page is 21cm across: a real length of ballpoint
  const metres = s.marks.reduce((a, m) => a + (m.t === "stroke" ? pathLen(m.pts) : 0), 0) * 0.21 / RULES.pageW;
  const crossed = (p: Player) => s.marks.filter((m) => m.t === "cross" && m.kind === "kill" && m.owner === p).length;
  sheet(`
    <p class="sub">morning. page ${s.page?.no ?? ""} is done.</p>
    <h2 style="color:${INK.pens[w]}">${name(w)} held the page.</h2>
    <p class="stats">${s.turn} turns · ${metres.toFixed(1)} metres of ink · ${([0, 1] as Player[]).map((p) => `<span style="color:${INK.pens[p]}">${name(p)} crossed out ${crossed(p)}</span>`).join(" · ")}</p>
    <button class="act" data-a="replay">watch the war again</button>
    <button class="act" data-a="keep">keep the page (image)</button>
    <button class="act" data-a="look">look at it</button>
    <button class="act red" data-a="new">new page</button>
    <p class="fine">It's filed in the drawer.</p>`, "over").onclick = (e) => {
    const a = (e.target as HTMLElement).closest("button")?.dataset.a;
    if (a === "keep") keepPage();
    else if (a === "look") closeSheet();
    else if (a === "replay") { closeSheet(); replay(file(s, mode)); }
    else if (a === "new") showTitle();
  };
}

// --- the drawer ----------------------------------------------------------------

function thumb(r: Filed, w: number) {
  const st = unfile(r);
  const c = document.createElement("canvas");
  const sc = (w * Math.min(2, dpr)) / RULES.pageW;
  c.width = Math.round(RULES.pageW * sc);
  c.height = Math.round(RULES.pageH * sc);
  drawPageInto(c.getContext("2d")!, st, sc, r);
  return c;
}

function showDrawer() {
  const d = drawer();
  const card = sheet(`
    <h2>The drawer</h2>
    <p class="sub">${d.length ? "every page you've finished" : "nothing filed yet. Finish a war and it lands here."}</p>
    <div class="pages"></div>
    <button class="act" data-a="back">back</button>`, "drawer");
  const grid = card.querySelector(".pages")!;
  d.forEach((r, i) => {
    const b = document.createElement("button");
    b.className = "page";
    b.dataset.i = String(i);
    b.appendChild(thumb(r, 130));
    const who = r.mode.kind === "bot" ? ["Blue", "Dawood-bot"] : ["Blue", "Red"];
    const cap = document.createElement("span");
    cap.innerHTML = `No. ${r.page?.no ?? "?"} · ${r.page?.date ?? ""}<br><b style="color:${INK.pens[r.winner ?? 0]}">${r.winner !== undefined ? who[r.winner] : "unfinished"}</b> · ${r.turns} turns`;
    b.appendChild(cap);
    grid.appendChild(b);
  });
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.tap();
    if (b.dataset.a === "back") return closeSheet();
    if (b.dataset.i) viewPage(d[+b.dataset.i]);
  };
}

function viewPage(r: Filed) {
  reset();
  closeSheet();
  closeCover();
  viewing = r;
  s = unfile(r);
  mode = r.mode;
  screen = "view";
  cam.overview(0);
  dawn.set(1);
  hud();
  viewBar();
}

function viewBar() {
  $("#bottom").classList.add("view");
  const kindEl = $("#kind");
  kindEl.classList.remove("off");
  kindEl.innerHTML = `<button data-v="replay"><b>replay</b><i>watch it drawn again</i></button><button data-v="keep"><b>keep</b><i>save as an image</i></button>`;
  kindEl.onclick = (e) => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.v;
    if (v === "replay") replay(viewing ?? file(s, mode));
    if (v === "keep") keepPage();
  };
}
function restoreKindBar() {
  const kindEl = $("#kind");
  kindEl.onclick = null;
  kindEl.innerHTML = `<button data-kind="move" role="radio"><b>move</b><i>he goes where the ink stops</i></button><button data-kind="shoot" role="radio"><b>shoot</b><i>the ink runs off the page</i></button>`;
  bindKind();
}

// The whole war, drawn again: the page fills itself in, flick by flick.
let replayQueue: Step[] = [];
function replay(r: Filed) {
  reset();
  closeSheet();
  viewing = r;
  mode = r.mode;
  s = blank(r);
  screen = "replay";
  cam.overview(0);
  cam.snap();
  dawn.go(0, 600);
  replayQueue = steps({ bases: r.bases.map(([x, y], id) => ({ id, owner: 0 as Player, x, y, r: RULES.baseRadius, seed: 0 })), flicks: r.flicks });
  hud();
  $("#kind").innerHTML = `<button data-v="stop"><b>stop</b><i>jump to the end</i></button>`;
  $("#kind").onclick = () => viewPage(r);
  after(500, replayNext);
}
function replayNext() {
  if (screen !== "replay") return;
  const st = replayQueue.shift();
  if (!st) {
    after(300, () => { dawn.go(1, 1600); sfx.birds(); fx.add("sign", T, 400, 1200, "linear"); });
    after(2200, () => { if (screen === "replay" && viewing) { screen = "view"; hud(); viewBar(); } });
    return;
  }
  if (st.t === "base") { drawBase(st.x, st.y, 0.45); after(560, replayNext); }
  else fire(st.f, 0.5, 0, { pen: false, cam: false, quick: 0.5 });
  hud();
}

// --- the page as an image -------------------------------------------------------

const exportLayer = new PageLayer();
function drawPageInto(g: CanvasRenderingContext2D, st: GameState, sc: number, r?: Filed) {
  const sig = signatureFor(st, r?.mode ?? mode);
  exportLayer.sync(st, SETTLED, sc, -1, sig);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(exportLayer.c!, 0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.globalCompositeOperation = "multiply";
  const age = Math.min(1, st.turn / 70);
  if (age > 0) { g.fillStyle = `rgba(236, 214, 170, ${0.55 * age})`; g.fillRect(0, 0, RULES.pageW, RULES.pageH); }
  for (const x of st.soldiers) if (x.alive) inkLib.inkDot(g, x.x, x.y, RULES.soldierRadius, INK.pens[x.owner], x.id * 131 + 7);
  g.globalCompositeOperation = "source-over";
}

function pageCanvas(scale = 2) {
  const c = document.createElement("canvas");
  c.width = RULES.pageW * scale;
  c.height = RULES.pageH * scale;
  drawPageInto(c.getContext("2d")!, s, scale);
  return c;
}

function keepPage() {
  pageCanvas().toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `pen-flick-page-${s.page?.no ?? ""}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}

function signatureFor(st: GameState, m: Mode) {
  if (st.phase !== "over" || st.winner === undefined) return undefined;
  const who = m.kind === "bot" && st.winner === 1 ? "Dawood-bot" : INK.names[st.winner];
  return { text: `${who} held the page. ${st.turn} turns.`, owner: st.winner };
}

// --- input ------------------------------------------------------------------

type Gesture =
  | { t: "aim"; id: number; sx: number; sy: number; tapOn?: number }
  | { t: "pan"; id: number; lx: number; ly: number; sx: number; sy: number }
  | { t: "place"; id: number; off: number }
  | { t: "pinch"; d0: number; m0: number }
  | { t: "none" };

const ptrs = new Map<number, Pt>();
let g: Gesture = { t: "none" };
const TAP = 10;

function nearestOwn(w: Pt): number | undefined {
  const z = cam.fitZ * cam.cur.m;
  return pickSoldier(s, w, {
    soldier: Math.max(RULES.soldierRadius * 2.5, 24 / z),
    base: selected === undefined ? Math.max(18, 30 / z) : 0,
  });
}

function select(id: number) {
  if (selected !== id) { sfx.pick(); penDrop = T; }
  if (!taught("aim") && selected === undefined) fx.add("teach", T, 500, 1100, "linear");
  selected = id;
  sitOn(s.soldiers[id]);
  dirty = true;
  status();
}

function standUp() {
  selected = undefined;
  cam.overview();
  dirty = true;
  status();
}

function pinchInfo() {
  const [a, b] = [...ptrs.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

const humanTurn = () => screen === "game" && !isBot(s.current) && !busy && $("#sheet").hidden;

over.addEventListener("pointerdown", (e) => {
  sfx.unlock();
  over.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    // two fingers always mean the camera: stand up, then zoom
    if (aim) sfx.creak(0);
    aim = null;
    ghost = undefined;
    if (cam.cur.tilt > 0.02 || cam.tgt.tilt > 0) { cam.tgt = { ...cam.tgt, tilt: 0, fy: cam.fitFy }; cam.cur = { ...cam.cur, tilt: 0, fy: cam.fitFy }; }
    const { d } = pinchInfo();
    g = { t: "pinch", d0: d, m0: cam.cur.m };
    dirty = true;
    status();
    return;
  }
  if (ptrs.size > 2) return;
  const w = cam.toWorld(e.clientX, e.clientY);
  if (humanTurn() && s.phase === "setup") {
    // hold to see the camp, drag to adjust, lift to draw it. On touch the
    // circle floats above the finger so you can see where it goes.
    const off = e.pointerType === "touch" ? 80 : 0;
    g = { t: "place", id: e.pointerId, off };
    moveGhost(e.clientX, e.clientY - off);
    return;
  }
  if (humanTurn() && s.phase === "play" && w) {
    const near = nearestOwn(w);
    if (near !== undefined || selected !== undefined) {
      if (near !== undefined && near !== selected) select(near);
      g = { t: "aim", id: e.pointerId, sx: e.clientX, sy: e.clientY, tapOn: near };
      return;
    }
  }
  g = { t: "pan", id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY };
});

function moveGhost(sx: number, sy: number) {
  const w = cam.toWorld(sx, sy);
  if (!w) return;
  const why = canPlaceBase(s, w.x, w.y);
  ghost = { x: w.x, y: w.y, ok: !why, owner: s.current };
  status(why ? `can't draw here: ${why}` : "lift to draw the camp");
  dirty = true;
}

over.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (g.t === "pinch" && ptrs.size === 2) {
    const { d, m } = pinchInfo();
    cam.zoomAt(m.x, m.y, (g.m0 * (d / g.d0)) / cam.cur.m);
    dirty = true;
    return;
  }
  if (g.t === "place" && g.id === e.pointerId) return moveGhost(e.clientX, e.clientY - g.off);
  if (g.t === "pan" && g.id === e.pointerId) {
    if (cam.cur.m > 1.001 && cam.cur.tilt < 0.02) {
      cam.pan(e.clientX - g.lx, e.clientY - g.ly);
      dirty = true;
    }
    g.lx = e.clientX;
    g.ly = e.clientY;
    return;
  }
  if (g.t === "aim" && g.id === e.pointerId && selected !== undefined) {
    if (!aim) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < TAP) return;
      aim = { soldierId: selected, kind, ax: 0, ay: 0, x: 0, y: 0, t0: T, charged: false };
    }
    updateAim(e.clientX, e.clientY);
    status();
    dirty = true;
  }
});

// The pull, in page terms: the pen should point exactly opposite your thumb
// on screen, even with the desk tilted. Power stays in screen px.
function updateAim(x: number, y: number) {
  if (!aim || g.t !== "aim") return;
  const dx = g.sx - x, dy = g.sy - y, dist = Math.hypot(dx, dy);
  const me = s.soldiers[aim.soldierId];
  aimAngle = screenDirToWorld(cam.view(), me, dx, dy);
  aim.x = -Math.cos(aimAngle) * dist;
  aim.y = -Math.sin(aimAngle) * dist;
  aim.kind = kind;
  const p = pull(aim);
  if (p.live && !aim.charged) { aim.charged = true; aim.t0 = T; sfx.buzz(6); }
  // a notch every fifth of full power
  const notch = Math.floor(p.power * 5 + 1e-6);
  if (notch !== lastNotch) { if (notch > lastNotch) sfx.buzz(4); lastNotch = notch; }
}
let lastNotch = 0;

function up(e: PointerEvent) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId)!;
  ptrs.delete(e.pointerId);
  if (g.t === "pinch") { if (ptrs.size === 0) g = { t: "none" }; return; }
  if (g.t === "place" && g.id === e.pointerId) {
    if (e.type === "pointerup" && ghost?.ok && humanTurn()) {
      learn("place");
      fx.clear();
      drawBase(ghost.x, ghost.y);
      ghost = undefined;
      afterBase();
    }
    ghost = undefined;
    g = { t: "none" };
    status();
    dirty = true;
    return;
  }
  if (g.t === "aim" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (aim && e.type === "pointerup") {
      updateAim(p.x, p.y);
      const f = release(aim, T);
      const pw = pull(aim).power;
      const lean = penLean(pw);
      aim = null;
      lastNotch = 0;
      sfx.creak(0);
      if (f && canAct(s, f.soldierId)) { learn("aim"); fire(f, pw, lean); }
      else status("too soft: pull back further");
    } else if (tapped && g.tapOn === undefined) {
      standUp(); // tap on empty paper puts the pen down
    }
    aim = null;
    sfx.creak(0);
    g = { t: "none" };
    if (!res) status();
    dirty = true;
    return;
  }
  if (g.t === "pan" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (tapped && selected !== undefined && !busy) standUp();
    g = { t: "none" };
    dirty = true;
  }
}
over.addEventListener("pointerup", up);
over.addEventListener("pointercancel", up);
over.addEventListener("contextmenu", (e) => e.preventDefault());
over.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (cam.cur.tilt > 0.02) { cam.tgt = { ...cam.tgt, tilt: 0, fy: cam.fitFy }; cam.cur = { ...cam.cur, tilt: 0, fy: cam.fitFy }; }
  cam.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002));
  dirty = true;
}, { passive: false });

function bindKind() {
  for (const b of document.querySelectorAll<HTMLButtonElement>("#kind button[data-kind]")) {
    b.onclick = () => {
      if (kind !== b.dataset.kind) { sfx.tap(); sfx.buzz(5); }
      kind = b.dataset.kind as ActionKind;
      if (aim) aim.kind = kind;
      hud();
      dirty = true;
    };
  }
}
bindKind();
$("#page-btn").onclick = () => {
  sfx.tap();
  if (selected !== undefined && !busy) standUp();
  else cam.overview();
  dirty = true;
};
$("#menu-btn").onclick = () => {
  sfx.unlock();
  sfx.tap();
  if (screen === "view" || screen === "replay") restoreKindBar();
  showTitle();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "m") $<HTMLButtonElement>('#kind [data-kind="move"]')?.click();
  if (e.key === "s") $<HTMLButtonElement>('#kind [data-kind="shoot"]')?.click();
  if (e.key === "Escape") { aim = null; sfx.creak(0); if (!busy) standUp(); }
});

// --- frame ------------------------------------------------------------------

let last = performance.now();
const frameTimes: number[] = []; // raw ms between frames, for the dev perf probe
const scriptTimes: number[] = []; // ms of main-thread script per rendered frame (drawing is recorded, not rastered)
let wasLive = false;
let lastCss = "";

function frame(now: number) {
  requestAnimationFrame(frame);
  frameTimes.push(now - last);
  if (frameTimes.length > 240) frameTimes.shift();
  const dt = Math.min(50, now - last) * speed;
  last = now;
  T += dt;
  // due callbacks (from this game only)
  if (later.length) {
    const due = later.filter((l) => l.at <= T);
    later = later.filter((l) => l.at > T);
    for (const l of due) if (l.g === gen) l.fn();
  }
  let active = cam.tick(dt);
  if (res) { stepResolve(); active = true; }
  const live = fx.end(T) > T || inkTL.end(0) > 0;
  if (live || wasLive || aim || botAim || lampOn.moving || dawn.moving || T - penDrop < 260) active = true;
  wasLive = live;
  if (aim) {
    const p = pull(aim);
    sfx.creak(p.power, Math.abs(wobble(aim, T)) * 12);
  }
  if (active || dirty) {
    const t0 = performance.now();
    renderNow();
    scriptTimes.push(performance.now() - t0);
    if (scriptTimes.length > 240) scriptTimes.shift();
    dirty = false;
  }
}

function currentFrame(): Frame {
  const v = cam.view();
  const lamp = lampFor(cam.cur, dawn.at(T), lampOn.at(T));
  let ink: Ink = SETTLED;
  const it = res ? inkTime(T - res.t0, res.snags) : 0;
  const lf = fx.live(T), li = inkTL.live(it);
  if (lf.size || li.size) {
    const liveSet = new Set([...lf, ...li]);
    ink = { p: (k) => (inkTL.pending(k, it) ? inkTL.p(k, it) : fx.p(k, T)), live: liveSet };
  }
  const f: Frame = {
    s, view: v, lamp, ink, dpr: sdpr, cw: W + cam.ox * 2, ch: H + cam.oy + cam.ob,
    selected, ghost, age: Math.min(1, s.turn / 70), sig: signatureFor(s, mode),
  };
  const human = screen === "game" && !isBot(s.current) && $("#sheet").hidden;
  // setup: show where camps can't go while you're placing one
  if (ghost) {
    f.keepOut = s.bases.map((b) => ({ x: b.x, y: b.y, r: b.r + RULES.baseRadius + (b.owner === s.current ? RULES.minBaseGap : RULES.minEnemyBaseGap) }));
  }
  if (human && s.phase === "setup" && !ghost && !busy && !taught("place")) {
    const ownY = mode.kind === "pnp" && s.current === 1 ? 0.3 : 0.7;
    f.teach = { kind: "place", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * ownY }, p: fx.p("teach", T), rot: cam.cur.rot };
  }
  if (human && s.phase === "play" && selected !== undefined && !aim && !res && !taught("aim")) {
    f.teach = { kind: "aim", at: s.soldiers[selected], p: fx.p("teach", T), rot: cam.cur.rot };
  }
  if (human && s.phase === "play" && selected === undefined && !aim && !res && !busy) {
    const mine = alive(s, s.current);
    f.hint = { p: fx.p("hint", T), bases: s.bases.filter((b) => b.owner === s.current && inBase(mine, b).length) };
  }
  // the pen
  if (res) {
    const r = res;
    const p = Math.min(1, it / r.dur);
    const h = headAt(r.o.path, 1 - Math.pow(1 - p, 2));
    if (r.mover !== undefined && it < r.dur) f.mover = { id: r.mover, at: h };
    f.pen = resolvePen(r, it);
  } else if (selected !== undefined && screen === "game") {
    const me = s.soldiers[selected];
    const owner = me.owner;
    const ink = inkLeft(owner);
    if (aim) {
      const pl = pull(aim);
      const ang = aimAngle + wobble(aim, T);
      f.aim = { soldierId: selected, angle: ang, power: pl.power, spread: sigma(pl.power) * 2, reach: reach(kind, pl.power), kind };
      f.pen = leaning(me.x, me.y, ang, pl.live ? penLean(pl.power) : 0.04, owner, ink);
    } else if (botAim) {
      const k = Math.min(1, (T - botAim.t0) / 700);
      const pw = botAim.power * (1 - Math.pow(1 - k, 2));
      const tremble = Math.sin(T / 1000 * 7.3) * 0.02 * pw;
      f.aim = { soldierId: selected, angle: botAim.angle + tremble, power: pw, spread: sigma(pw) * 2, reach: reach(kind, pw), kind };
      f.pen = leaning(me.x, me.y, botAim.angle + tremble, penLean(pw), owner, ink);
    } else {
      // set down on the dot: drops in, then stands
      const k = Math.min(1, (T - penDrop) / 240);
      f.pen = leaning(me.x, me.y, 0, 0.03, owner, ink);
      f.pen.h = 70 * (1 - k) * (1 - k);
      f.pen.alpha = k;
    }
  }
  return f;
}

function renderNow() {
  const f = currentFrame();
  const css = stageCss(f.view);
  const key = css.transform + css.origin;
  if (key !== lastCss) {
    stage.style.transform = css.transform;
    stage.style.transformOrigin = css.origin;
    lastCss = key;
  }
  const bg = farColour(f.lamp);
  if (document.body.style.backgroundColor !== bg) document.body.style.backgroundColor = bg;
  document.body.style.setProperty("--lamp", f.lamp.on.toFixed(3));
  document.body.style.setProperty("--dawn", f.lamp.dawn.toFixed(3));
  renderStage(sg, f, cam.settled && !lampOn.moving && !dawn.moving);
  renderOverlay(og, f, W, H, dpr);
}

function showBoot() {
  resize();
  hud();
  document.fonts?.ready.then(() => { pageState.epoch++; dirty = true; });
  requestAnimationFrame(frame);
  showTitle();
}
showBoot();

// dev-only handle for scripted playtests
if (import.meta.env.DEV) {
  (window as unknown as { pft: object }).pft = {
    get s() { return s; }, get T() { return T; }, get screen() { return screen; }, get busy() { return busy; },
    get selected() { return selected; }, get res() { return res; },
    set speed(v: number) { speed = v; }, get speed() { return speed; },
    poke: () => { dirty = true; },
    frame: () => { const f = currentFrame(); return { lamp: f.lamp, view: f.view }; },
    frames: (reset = false) => {
      const stats = (src: number[]) => {
        const a = [...src].sort((x, y) => x - y);
        const q = (k: number) => a[Math.min(a.length - 1, Math.floor(a.length * k))] ?? 0;
        return { n: a.length, mean: a.reduce((x, y) => x + y, 0) / (a.length || 1), p50: q(0.5), p95: q(0.95), max: a[a.length - 1] ?? 0 };
      };
      const r = { ...stats(frameTimes), script: stats(scriptTimes) };
      if (reset) { frameTimes.length = 0; scriptTimes.length = 0; }
      return r;
    },
    dbg, stageStats, cam, fx, inkTL, pageCanvas, ink: inkLib, INK, stage, canvas: over, renderNow, worldTransform, page, pen: PEN,
    start, showTitle, replay: () => replay(file(s, mode)), apply: (st: Step) => { apply(s, st); dirty = true; },
    unfile, file: () => file(s, mode), act: (f: Flick) => fire(f, 0.6, 0.3),
    /** A whole seeded bot-v-bot war, filed in the drawer. Returns the record. */
    fileWar: (seed = 7, maxTurns = 400) => {
      const st = newGame(seed, pageStamp());
      let k = seed;
      while (st.phase === "setup") { const spot = botBase(st, (x, y) => !canPlaceBase(st, x, y), k++)!; apply(st, { t: "base", x: spot.x, y: spot.y }); }
      while (st.phase === "play" && st.turn < maxTurns) apply(st, { t: "flick", f: botFlick(st, 1, k++) });
      const r = file(st, { kind: "bot", level: 1 });
      localStorage.setItem("pft:drawer", JSON.stringify(addToDrawer(drawer(), r)));
      return r;
    },
    view: (r: Filed) => viewPage(r), replayRecord: (r: Filed) => replay(r),
    resumeRecord: (r: Filed) => resume({ s: unfile(r), mode: r.mode }),
  };
}

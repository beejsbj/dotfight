import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";
import "./style.css";

import { botBase, botFlick, LEVELS, type Level } from "./bot";
import { pull, release, reach, sigma, wobble, type Aim } from "./flick";
import {
  act, alive, basesLeft, canAct, canPlaceBase, newGame, pathLen, placeBase,
  type ActionKind, type Flick, type GameState, type Player, type Pt,
} from "./game";
import * as inkLib from "./ink";
import { INK } from "./ink";
import { RULES } from "./rules";
import * as sfx from "./sound";
import { inBase, jotOrder, pickSoldier } from "./hand";
import { Timeline, reachFraction } from "./timeline";
import { Camera, invalidatePage, render, renderOpts, type Overlay } from "./view";

// --- state ------------------------------------------------------------------

type Mode = { kind: "pnp" } | { kind: "bot"; level: Level };
interface Save { s: GameState; mode: Mode }

const settings = {
  closeUp: localStorage.getItem("pft:closeUp") !== "0",
  handoff: localStorage.getItem("pft:handoff") !== "0",
};

let s: GameState = newGame();
let mode: Mode = { kind: "pnp" };
let kind: ActionKind = "shoot";
let selected: number | undefined;
let aim: Aim | null = null;
let botAim: { soldierId: number; angle: number; power: number } | null = null;
let ghost: Overlay["ghost"];
// marks being drawn on, and the flick currently resolving
const fx = new Timeline();
let anim: { key: string; path: Pt[]; mover?: number; owner: Player; power: number; t0: number; end: number; done: () => void } | null = null;
let busy = false; // a flick is resolving or the bot is thinking
let lastNote = "";
let gen = 0; // bumps on every new/resumed game so stale bot timers stand down

const $ = <T extends HTMLElement>(q: string) => document.querySelector(q) as T;
const canvas = $<HTMLCanvasElement>("#page");
const ctx = canvas.getContext("2d")!;
const cam = new Camera();
let W = 0, H = 0, dpr = 1, dirty = true;

const isBot = (p: Player) => mode.kind === "bot" && p === 1;
const name = (p: Player) => (isBot(p) ? "Dawood-bot" : INK.names[p]);

function save() {
  localStorage.setItem("pft:save", JSON.stringify({ s, mode } satisfies Save));
}
function load(): Save | null {
  try {
    const v = JSON.parse(localStorage.getItem("pft:save") || "null");
    return v?.s?.v === 1 ? v : null;
  } catch { return null; }
}

// --- layout -----------------------------------------------------------------

function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const top = $("#top").getBoundingClientRect().bottom;
  const bottom = $("#bottom").getBoundingClientRect().top;
  const vh = Math.max(100, bottom - top);
  if (cam.vy === top && cam.vh === vh && cam.vw === W) return void (dirty = true);
  const wasFit = Math.abs(cam.z - cam.fitZ) < 1e-3;
  cam.setViewport(0, top, W, vh);
  if (wasFit || cam.z < cam.fitZ) cam.fit(); else cam.clamp();
  dirty = true;
}
window.addEventListener("resize", resize);
// the HUD can change height (a two-line status on a narrow phone): re-frame the page
new ResizeObserver(() => resize()).observe($("#bottom"));
new ResizeObserver(() => resize()).observe($("#top"));
// iOS only unlocks audio inside some gestures; try on all of them
for (const ev of ["touchend", "click", "keydown"]) window.addEventListener(ev, sfx.unlock, { passive: true });
if (matchMedia("(prefers-reduced-motion: reduce)").matches) fx.speed = 0.35;

// --- hud --------------------------------------------------------------------

function tallyPath(n: number, seed: number) {
  // groups of five: four strokes and a slash, a little crooked
  let d = "", x = 2, r = seed;
  const j = () => ((r = (r * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
  for (let i = 0; i < n; i++) {
    if (i % 5 === 4) {
      d += `M${x - 17 + j()} ${16 + j()} L${x - 1 + j()} ${5 + j()} `;
      x += 7;
    } else {
      d += `M${x + j() * 0.6} ${3 + j()} L${x + j() * 0.6} ${19 + j()} `;
      x += 4.2;
    }
  }
  return { d, w: x + 2 };
}

function circlePath(w: number, h: number, seed: number) {
  let r = seed;
  const j = () => ((r = (r * 9301 + 49297) % 233280) / 233280 - 0.5);
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const start = j() * 2;
  let d = "";
  for (let i = 0; i <= 40; i++) {
    const a = start + (i / 40) * Math.PI * 2.12;
    const k = 1 + j() * 0.05;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)} `;
  }
  return d;
}

function hud() {
  for (const p of [0, 1] as Player[]) {
    const el = $(`.side[data-p="${p}"]`);
    el.classList.toggle("on", s.current === p && s.phase !== "over");
    (el.querySelector(".name") as HTMLElement).textContent = name(p);
    const n = s.phase === "setup" ? basesLeft(s, p) * RULES.soldiersPerBase : alive(s, p).length;
    const t = tallyPath(n, 17 + p);
    const svg = el.querySelector("svg")!;
    svg.setAttribute("viewBox", `0 0 ${Math.max(10, t.w)} 22`);
    svg.setAttribute("preserveAspectRatio", p === 0 ? "xMinYMid meet" : "xMaxYMid meet");
    svg.innerHTML = `<path d="${t.d}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="${s.phase === "setup" ? 0.3 : 0.85}"/>`;
  }
  const ink = INK.pens[s.current];
  document.documentElement.style.setProperty("--ink", ink);
  for (const b of document.querySelectorAll<HTMLButtonElement>("#kind button")) {
    const on = b.dataset.kind === kind;
    b.classList.toggle("on", on);
    b.innerHTML = b.dataset.kind! + (on ? `<svg viewBox="0 0 100 50" preserveAspectRatio="none"><path d="${circlePath(100, 50, b.dataset.kind === "move" ? 3 : 8)}" fill="none" stroke="${ink}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>` : "");
  }
  $("#kind").classList.toggle("off", s.phase !== "play" || isBot(s.current));
  $("#turn-no").textContent = s.phase === "play" ? `turn ${s.turn}` : "";
  status();
}

function status(msg?: string) {
  let t = msg ?? "";
  if (!msg) {
    const who = name(s.current);
    if (s.phase === "setup") t = isBot(s.current) ? `${who} is drawing a base…` : `${who}: draw a base (${basesLeft(s, s.current)} left)`;
    else if (s.phase === "over") t = `${name(s.winner!)} wins`;
    else if (isBot(s.current)) t = `${who} is lining up…`;
    else if (aim) t = pull(aim).live ? `let go to ${kind}` : "pull back further…";
    else if (selected !== undefined) t = "pull back from anywhere, let go";
    else t = lastNote ? `${lastNote} ${who}: pick a soldier` : `${who}: pick a soldier`;
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

// first-time pencil notes, shown once ever per device
const taught = (k: string) => localStorage.getItem(`pft:taught:${k}`) === "1";
const learn = (k: string) => localStorage.setItem(`pft:taught:${k}`, "1");

function start(m: Mode) {
  gen++;
  s = newGame(undefined, pageStamp());
  mode = m;
  kind = "shoot";
  selected = undefined;
  aim = botAim = null;
  anim = null;
  fx.clear();
  busy = false;
  lastNote = "";
  save();
  closeSheet();
  cam.fit(true);
  if (!taught("place")) fx.add("teach", performance.now(), 500, 900, "linear");
  hud();
  next();
}

function resume(v: Save) {
  gen++;
  busy = false;
  anim = botAim = null;
  fx.clear();
  s = v.s;
  mode = v.mode;
  selected = undefined;
  closeSheet();
  cam.fit();
  hud();
  if (s.phase === "over") return showOver();
  next();
}

// whoever's turn it is: let a human act, or have the bot go
function next() {
  hud();
  dirty = true;
  if (s.phase === "over") return setTimeout(showOver, 500);
  if (!isBot(s.current)) {
    // a light pencil loop round your bases: these are yours to move
    if (s.phase === "play") fx.add("hint", performance.now(), 150, 520, "out");
    return;
  }
  busy = true;
  const g0 = gen;
  const live = (fn: () => void) => () => { if (gen === g0) fn(); };
  if (s.phase === "setup") {
    setTimeout(live(() => {
      const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y));
      if (spot) drawBase(spot.x, spot.y);
      busy = false;
      next();
    }), 450 + Math.max(0, fx.end(performance.now()) - performance.now()));
    return;
  }
  setTimeout(live(() => {
    const f = botFlick(s, (mode as { level: Level }).level);
    const me = s.soldiers[f.soldierId];
    selected = f.soldierId;
    if (settings.closeUp) cam.to(me.x, me.y, Math.max(cam.z, cam.fitZ * 2.2), 450);
    const power = f.kind === "shoot"
      ? (f.length - RULES.shootMinLen) / (RULES.shootMaxLen - RULES.shootMinLen)
      : (f.length - RULES.moveMinLen) / (RULES.moveMaxLen - RULES.moveMinLen);
    kind = f.kind;
    hud();
    const t0 = performance.now();
    const charge = live(() => {
      const p = Math.min(1, (performance.now() - t0) / 700);
      botAim = { soldierId: f.soldierId, angle: f.angle, power: Math.max(0, Math.min(1, power)) * p };
      dirty = true;
      if (p < 1) requestAnimationFrame(charge);
      else setTimeout(live(() => { const pw = botAim?.power ?? 0; botAim = null; fire(f, pw); }), 120);
    });
    setTimeout(charge, 350);
  }), 450);
}

// The circle goes round, then the soldiers are jotted in, one tap each.
function drawBase(x: number, y: number) {
  const b = placeBase(s, x, y);
  const now = performance.now();
  fx.add(`b${b.id}`, now, 0, 380, "out");
  sfx.circle();
  sfx.buzz(10);
  const dots = s.soldiers.slice(-RULES.soldiersPerBase);
  jotOrder(dots).forEach((i, k) => {
    const delay = 430 + k * 62;
    fx.add(`d${dots[i].id}`, now, delay, 90, "out");
    sfx.dot((delay * fx.speed) / 1000);
  });
  save();
  if (s.phase === "play") lastNote = "";
}

function nearestIndex(pts: Pt[], p: Pt) {
  let bi = 0, bd = Infinity;
  pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } });
  return bi;
}

// `power` is how hard the pen was pulled back: it springs forward on release.
function fire(f: Flick, power: number) {
  const who = s.current;
  const first = s.marks.length; // act() appends the stroke, then its crosses
  const o = act(s, f);
  save();
  selected = undefined;
  aim = null;
  busy = true;
  const now = performance.now();
  const dur = Math.min(650, Math.max(220, 160 + pathLen(o.path) * 0.3));
  const n = o.path.length - 1;
  fx.add(`m${first}`, now, 0, dur, "out2");
  // each cross lands when the ink reaches it: two quick strokes
  for (let i = first + 1; i < s.marks.length; i++) {
    const m = s.marks[i];
    if (m.t !== "cross") continue;
    const delay = m.kind === "kill" ? reachFraction(nearestIndex(o.path, m), n) * dur
      : m.kind === "lost" ? dur + 40 : dur + 140;
    fx.add(`m${i}`, now, delay, m.kind === "moved" ? 150 : 170);
    const at = delay * fx.speed;
    if (m.kind === "moved") sfx.cross(at / 1000, 0.5);
    else {
      sfx.cross(at / 1000 + 0.02);
      setTimeout(() => sfx.buzz([18, 30, 18]), at);
    }
  }
  fx.add("pen", now, dur, 300, "out"); // then the pen lifts off the page
  anim = {
    key: `m${first}`, path: o.path, owner: who, power, t0: now,
    mover: f.kind === "move" ? f.soldierId : undefined,
    end: fx.end(now) + 120 * fx.speed,
    done: () => {
      anim = null;
      busy = false;
      const n = o.killed.length;
      const verb = f.kind === "shoot" ? "shot" : "run";
      lastNote = o.lost ? `${name(who)} flicked a soldier off the page.`
        : n ? `${name(who)}'s ${verb} crossed out ${n}.` : f.kind === "move" ? `${name(who)} moved a soldier.` : `${name(who)} missed.`;
      if (s.phase === "play" && mode.kind === "pnp" && settings.handoff) showHandoff();
      else next();
    },
  };
  sfx.scratch((dur * fx.speed) / 1000 + 0.05, f.kind === "shoot" ? 0.6 : 0.45);
  sfx.buzz(12);
  // pull back to see what the ink did
  if (settings.closeUp) setTimeout(() => cam.fit(true), 60);
  hud();
}

// --- sheets -----------------------------------------------------------------

function sheet(html: string, cls = "") {
  const el = $("#sheet");
  const card = el.querySelector(".card") as HTMLElement;
  card.className = `card ${cls}`;
  card.innerHTML = html;
  el.hidden = false;
  return card;
}
function closeSheet() { $("#sheet").hidden = true; }

function showTitle() {
  const saved = load();
  const canResume = saved && (saved.s.phase !== "over");
  const card = sheet(`
    <h1>Pen Flick <em>Tactics</em></h1>
    <p class="sub">a notebook war, after Dawood</p>
    ${canResume ? `<button class="act" data-a="resume">↳ carry on the page</button>` : ""}
    <button class="act" data-a="pnp">↳ pass &amp; play</button>
    <button class="act red" data-a="bot">↳ vs Dawood-bot</button>
    <div class="row">${LEVELS.map((l, i) => `<button class="act small ${i === botLevel ? "on" : ""}" data-lvl="${i}">${l}</button>`).join(" · ")}</div>
    <button class="act small" data-a="how">how to play</button>
    <p class="fine">
      <button class="act small ${settings.closeUp ? "on" : ""}" data-set="closeUp">close-up aim</button> ·
      <button class="act small ${settings.handoff ? "on" : ""}" data-set="handoff">hand-off screen</button> ·
      <button class="act small ${!sfx.muted ? "on" : ""}" data-set="sound">sound</button>
    </p>
    <p class="fine">rules from memory — waiting on Dawood</p>`);
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.unlock();
    sfx.tap();
    const a = b.dataset.a, set = b.dataset.set;
    if (a === "resume" && saved) resume(saved);
    else if (a === "pnp") start({ kind: "pnp" });
    else if (a === "bot") start({ kind: "bot", level: botLevel });
    else if (a === "how") showHow();
    else if (b.dataset.lvl) { botLevel = +b.dataset.lvl as Level; localStorage.setItem("pft:lvl", String(botLevel)); showTitle(); }
    else if (set === "sound") { sfx.setMuted(!sfx.muted); showTitle(); }
    else if (set === "closeUp" || set === "handoff") {
      settings[set] = !settings[set];
      localStorage.setItem(`pft:${set}`, settings[set] ? "1" : "0");
      showTitle();
    }
  };
}
let botLevel = (+(localStorage.getItem("pft:lvl") ?? 1) as Level);

function showHow() {
  sheet(`
    <h2>How to play</h2>
    <ol>
      <li>Take turns drawing bases. Each holds ${RULES.soldiersPerBase} soldiers.</li>
      <li>On your turn, touch one soldier. Pull back from anywhere and let go, like flicking a pen.</li>
      <li><b>Shoot</b>: the ink runs nearly off the page. Every enemy it touches is crossed out. Your soldier stays put.</li>
      <li><b>Move</b>: a shorter line. Your soldier ends where the ink stops, and still crosses out what it runs through. Flick him off the page and he's gone.</li>
      <li>Hold a hard flick too long and your hand starts to shake.</li>
      <li>Pinch to zoom. Cross out every enemy to win.</li>
    </ol>
    <button class="act" data-a="back">↳ back</button>`).onclick = (e) => {
    if ((e.target as HTMLElement).closest("button")) showTitle();
  };
}

function showHandoff() {
  const nextP = s.current;
  const card = sheet(`
    <p class="sub">${lastNote}</p>
    <h2 style="color:${INK.pens[nextP]}">Pass the pen to ${name(nextP)}</h2>
    <p class="fine">tap when ready</p>`, "handoff");
  sfx.rustle();
  card.parentElement!.onclick = () => {
    card.parentElement!.onclick = null;
    sfx.unlock();
    closeSheet();
    next();
  };
}

function showOver() {
  if (s.phase !== "over") return;
  const w = s.winner!;
  sheet(`
    <h2 style="color:${INK.pens[w]}">${name(w)} wins.</h2>
    <p class="sub">${s.turn} turns, ${s.marks.filter((m) => m.t === "stroke").length} lines of ink.</p>
    <p class="fine">${([0, 1] as Player[]).map((p) => `<span style="color:${INK.pens[p]}">${name(p)} crossed out ${s.marks.filter((m) => m.t === "cross" && m.kind === "kill" && m.owner === p).length}</span>`).join(" · ")}</p>
    <button class="act" data-a="keep">↳ keep this page</button>
    <button class="act" data-a="look">↳ look at the page</button>
    <button class="act red" data-a="new">↳ new page</button>`).onclick = (e) => {
    const a = (e.target as HTMLElement).closest("button")?.dataset.a;
    if (a === "keep") keepPage();
    else if (a === "look") closeSheet();
    else if (a === "new") showTitle();
  };
}

// the battlefield as an image: the whole point of the game is this page
function pageCanvas(scale = 2) {
  const c = document.createElement("canvas");
  c.width = RULES.pageW * scale;
  c.height = RULES.pageH * scale;
  const k = new Camera();
  k.setViewport(0, 0, RULES.pageW, RULES.pageH);
  k.z = 1;
  render(c.getContext("2d")!, k, s, {}, RULES.pageW, RULES.pageH, scale);
  return c;
}

function keepPage() {
  pageCanvas().toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `pen-flick-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}

// --- input ------------------------------------------------------------------

type Gesture =
  | { t: "aim"; id: number; sx: number; sy: number; tapOn?: number }
  | { t: "pan"; id: number; lx: number; ly: number; sx: number; sy: number }
  | { t: "place"; id: number; off: number }
  | { t: "pinch"; d0: number; z0: number; w0: Pt }
  | { t: "none" };

const ptrs = new Map<number, Pt>();
let g: Gesture = { t: "none" };
const TAP = 10;

// Which of your soldiers a touch means. With none selected, anywhere in or
// near one of your bases will do; once one is picked, only a near-direct hit
// on another soldier switches, so pressing inside the base to pull is safe.
function nearestOwn(w: Pt): number | undefined {
  return pickSoldier(s, w, {
    soldier: Math.max(RULES.soldierRadius * 2.5, 22 / cam.z),
    base: selected === undefined ? Math.max(18, 30 / cam.z) : 0,
  });
}

function select(id: number) {
  if (selected !== id) sfx.click();
  if (!taught("aim") && selected === undefined) fx.add("teach", performance.now(), 350, 900, "linear");
  selected = id;
  const me = s.soldiers[id];
  if (settings.closeUp && cam.z < cam.fitZ * 2.1) cam.to(me.x, me.y, cam.fitZ * 2.2, 380);
  dirty = true;
  status();
}

function pinchInfo() {
  const [a, b] = [...ptrs.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

canvas.addEventListener("pointerdown", (e) => {
  sfx.unlock();
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    // two fingers always mean the camera; drop whatever one finger was doing
    aim = null;
    ghost = undefined;
    cam.stop();
    const { d, m } = pinchInfo();
    g = { t: "pinch", d0: d, z0: cam.z, w0: cam.toWorld(m.x, m.y) };
    dirty = true;
    status();
    return;
  }
  if (ptrs.size > 2) return;
  const w = cam.toWorld(e.clientX, e.clientY);
  const human = !isBot(s.current) && !busy && $("#sheet").hidden;

  if (human && s.phase === "setup") {
    // hold to see the base, drag to adjust, lift to draw it. On touch the
    // circle floats above the finger so you can see where it goes.
    const off = e.pointerType === "touch" ? 70 : 0;
    g = { t: "place", id: e.pointerId, off };
    moveGhost(e.clientX, e.clientY - off);
    return;
  }
  if (human && s.phase === "play") {
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
  const why = canPlaceBase(s, w.x, w.y);
  ghost = { x: w.x, y: w.y, ok: !why };
  status(why ? `can't draw here: ${why}` : "lift to draw the base");
  dirty = true;
}

canvas.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (g.t === "pinch" && ptrs.size === 2) {
    const { d, m } = pinchInfo();
    cam.z = Math.min(cam.fitZ * 4, Math.max(cam.fitZ, g.z0 * (d / g.d0)));
    // keep the point under the fingers under the fingers
    cam.x = g.w0.x - (m.x - cam.cx) / cam.z;
    cam.y = g.w0.y - (m.y - cam.cy) / cam.z;
    cam.clamp();
    dirty = true;
    return;
  }
  if (g.t === "place" && g.id === e.pointerId) return moveGhost(e.clientX, e.clientY - g.off);
  if (g.t === "pan" && g.id === e.pointerId) {
    if (cam.z > cam.fitZ + 1e-3) {
      cam.stop();
      cam.x -= (e.clientX - g.lx) / cam.z;
      cam.y -= (e.clientY - g.ly) / cam.z;
      cam.clamp();
      dirty = true;
    }
    g.lx = e.clientX;
    g.ly = e.clientY;
    return;
  }
  if (g.t === "aim" && g.id === e.pointerId && selected !== undefined) {
    if (!aim) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < TAP) return;
      aim = { soldierId: selected, kind, ax: g.sx, ay: g.sy, x: e.clientX, y: e.clientY, t0: performance.now(), charged: false };
    }
    aim.x = e.clientX;
    aim.y = e.clientY;
    const live = pull(aim).live;
    if (live && !aim.charged) { aim.charged = true; aim.t0 = performance.now(); sfx.buzz(6); }
    status();
    dirty = true;
  }
});

function up(e: PointerEvent) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId)!;
  ptrs.delete(e.pointerId);
  if (g.t === "pinch") { if (ptrs.size === 0) g = { t: "none" }; return; }
  if (g.t === "place" && g.id === e.pointerId) {
    if (e.type === "pointerup" && ghost?.ok) { learn("place"); drawBase(ghost.x, ghost.y); ghost = undefined; next(); }
    ghost = undefined;
    g = { t: "none" };
    status();
    dirty = true;
    return;
  }
  if (g.t === "aim" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (aim && e.type === "pointerup") {
      const f = release(aim, performance.now());
      const pw = pull(aim).power;
      aim = null;
      if (f && canAct(s, f.soldierId)) { learn("aim"); fire(f, pw); }
    } else if (tapped && g.tapOn === undefined) {
      selected = undefined; // tap on empty paper puts the pen down
    }
    aim = null;
    g = { t: "none" };
    status();
    dirty = true;
    return;
  }
  if (g.t === "pan" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (tapped && selected !== undefined && !busy) selected = undefined;
    g = { t: "none" };
    dirty = true;
  }
}
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const w = cam.toWorld(e.clientX, e.clientY);
  cam.stop();
  cam.z = Math.min(cam.fitZ * 4, Math.max(cam.fitZ, cam.z * Math.exp(-e.deltaY * 0.002)));
  cam.x = w.x - (e.clientX - cam.cx) / cam.z;
  cam.y = w.y - (e.clientY - cam.cy) / cam.z;
  cam.clamp();
  dirty = true;
}, { passive: false });

for (const b of document.querySelectorAll<HTMLButtonElement>("#kind button")) {
  b.onclick = () => {
    if (kind !== b.dataset.kind) sfx.tap();
    kind = b.dataset.kind as ActionKind;
    if (aim) aim.kind = kind;
    hud();
    dirty = true;
  };
}
$("#fit-btn").onclick = () => { cam.fit(true); dirty = true; };
$("#menu-btn").onclick = () => { sfx.unlock(); showTitle(); };
window.addEventListener("keydown", (e) => {
  if (e.key === "m") $<HTMLButtonElement>('#kind [data-kind="move"]').click();
  if (e.key === "s") $<HTMLButtonElement>('#kind [data-kind="shoot"]').click();
  if (e.key === "Escape") { aim = null; selected = undefined; dirty = true; status(); }
});

// --- frame ------------------------------------------------------------------

let wasLive = false;
function frame(now: number) {
  // schedule first: one bad frame must never stop the game
  requestAnimationFrame(frame);
  let active = cam.tick(now);
  if (anim && now >= anim.end) { const done = anim.done; anim = null; dirty = true; done(); }
  const live = fx.end(now) > now;
  if (live || wasLive || anim || aim || botAim) active = true; // one more frame once the ink settles
  wasLive = live;
  if (active || dirty) {
    render(ctx, cam, s, overlay(now), W, H, dpr);
    dirty = false;
  }
}

// where the head of a line is at progress p, and which way it is going
function headAt(pts: Pt[], p: number) {
  const n = pts.length - 1, h = Math.min(n, Math.max(0, p * n));
  const i = Math.min(n - 1, Math.floor(h)), f = h - i;
  const a = pts[i], b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function overlay(now: number): Overlay {
  const o: Overlay = { selected, ghost, ink: { p: (k) => fx.p(k, now), live: fx.live(now) } };
  const human = !isBot(s.current) && $("#sheet").hidden;
  if (human && s.phase === "setup" && !ghost && !taught("place")) {
    o.teach = { kind: "place", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * (s.current === 0 ? 0.72 : 0.28) }, p: fx.p("teach", now) };
  }
  if (human && s.phase === "play" && selected !== undefined && !aim && !anim && !taught("aim")) {
    o.teach = { kind: "aim", at: s.soldiers[selected], p: fx.p("teach", now) };
  }
  if (s.phase === "play" && !isBot(s.current) && selected === undefined && !aim && !anim && $("#sheet").hidden) {
    const mine = alive(s, s.current);
    o.hint = {
      p: fx.p("hint", now),
      bases: s.bases.filter((b) => b.owner === s.current && inBase(mine, b).length),
    };
  }
  if (anim) {
    const sp = fx.p(anim.key, now);
    const h = headAt(anim.path, sp);
    if (anim.mover !== undefined && sp < 1) o.mover = { id: anim.mover, at: h };
    const lift = fx.p("pen", now);
    if (lift < 1) {
      // the pen skids along with its ink, then comes up off the page
      const drift = lift * 22;
      o.pen = {
        x: h.x + Math.cos(h.angle) * drift, y: h.y + Math.sin(h.angle) * drift, angle: h.angle,
        pull: anim.power * Math.max(0, 1 - (now - anim.t0) / 90), lift, owner: anim.owner,
      };
    }
  }
  if (aim) {
    const p = pull(aim);
    o.aim = {
      soldierId: aim.soldierId,
      angle: p.angle + wobble(aim, now),
      power: p.power,
      spread: sigma(p.power) * 2,
      reach: reach(aim.kind, p.power),
    };
  } else if (botAim) {
    o.aim = { ...botAim, spread: sigma(botAim.power) * 2, reach: reach(kind, botAim.power) };
  }
  return o;
}

resize();
hud();
document.fonts?.ready.then(() => { invalidatePage(); dirty = true; });
requestAnimationFrame(frame);
showTitle();

// dev-only handle for scripted playtests
if (import.meta.env.DEV) (window as unknown as { pft: object }).pft = { get s() { return s; }, cam, fx, pageCanvas, ink: inkLib, INK, renderOpts, canvas, renderNow: () => render(ctx, cam, s, overlay(performance.now()), W, H, dpr) };

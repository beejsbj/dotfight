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
import { INK } from "./ink";
import { RULES } from "./rules";
import * as sfx from "./sound";
import { Camera, render, type Overlay } from "./view";

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
let anim: (NonNullable<Overlay["anim"]> & { t0: number; dur: number; done: () => void }) | null = null;
let busy = false; // a flick is resolving or the bot is thinking
let lastNote = "";
let gen = 0; // bumps on every new/resumed game so stale bot timers stand down

const $ = <T extends HTMLElement>(q: string) => document.querySelector(q) as T;
const canvas = $<HTMLCanvasElement>("#page");
const ctx = canvas.getContext("2d")!;
const cam = new Camera();
let W = 0, H = 0, dpr = 1, dirty = true;

const isBot = (p: Player) => mode.kind === "bot" && p === 1;
const name = (p: Player) => (isBot(p) ? "Daud-bot" : INK.names[p]);

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
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const top = $("#top").getBoundingClientRect().bottom;
  const bottom = $("#bottom").getBoundingClientRect().top;
  const wasFit = Math.abs(cam.z - cam.fitZ) < 1e-3;
  cam.setViewport(0, top, W, Math.max(100, bottom - top));
  if (wasFit || cam.z < cam.fitZ) cam.fit(); else cam.clamp();
  dirty = true;
}
window.addEventListener("resize", resize);

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

function start(m: Mode) {
  gen++;
  s = newGame();
  mode = m;
  kind = "shoot";
  selected = undefined;
  aim = botAim = null;
  anim = null;
  busy = false;
  lastNote = "";
  save();
  closeSheet();
  cam.fit(true);
  hud();
  next();
}

function resume(v: Save) {
  gen++;
  busy = false;
  anim = botAim = null;
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
  if (!isBot(s.current)) return;
  busy = true;
  const g0 = gen;
  const live = (fn: () => void) => () => { if (gen === g0) fn(); };
  if (s.phase === "setup") {
    setTimeout(live(() => {
      const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y));
      if (spot) drawBase(spot.x, spot.y);
      busy = false;
      next();
    }), 550);
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
      else setTimeout(live(() => { botAim = null; fire(f); }), 120);
    });
    setTimeout(charge, 350);
  }), 450);
}

function drawBase(x: number, y: number) {
  placeBase(s, x, y);
  sfx.circle();
  sfx.buzz(10);
  save();
  if (s.phase === "play") lastNote = "";
}

function fire(f: Flick) {
  const turn = s.turn;
  const who = s.current;
  const o = act(s, f);
  save();
  selected = undefined;
  aim = null;
  busy = true;
  const dur = Math.min(650, Math.max(220, 160 + pathLen(o.path) * 0.3));
  anim = {
    turn, p: 0, t0: performance.now(), dur,
    mover: f.kind === "move" ? f.soldierId : undefined,
    path: o.path,
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
  sfx.scratch(dur / 1000 + 0.05, f.kind === "shoot" ? 0.6 : 0.45);
  sfx.buzz(12);
  o.killed.forEach((id, i) => {
    const v = s.soldiers[id];
    let k = 0, bd = Infinity;
    o.path.forEach((q, j) => { const d = Math.hypot(q.x - v.x, q.y - v.y); if (d < bd) { bd = d; k = j; } });
    const at = (k / (o.path.length - 1)) * dur;
    sfx.cross(at / 1000 + 0.02);
    setTimeout(() => sfx.buzz([18, 30, 18]), at + i);
  });
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
    <p class="sub">a notebook war, after Daud</p>
    ${canResume ? `<button class="act" data-a="resume">↳ carry on the page</button>` : ""}
    <button class="act" data-a="pnp">↳ pass &amp; play</button>
    <button class="act red" data-a="bot">↳ vs Daud-bot</button>
    <div class="row">${LEVELS.map((l, i) => `<button class="act small ${i === botLevel ? "on" : ""}" data-lvl="${i}">${l}</button>`).join(" · ")}</div>
    <button class="act small" data-a="how">how to play</button>
    <p class="fine">
      <button class="act small ${settings.closeUp ? "on" : ""}" data-set="closeUp">close-up aim</button> ·
      <button class="act small ${settings.handoff ? "on" : ""}" data-set="handoff">hand-off screen</button> ·
      <button class="act small ${!sfx.muted ? "on" : ""}" data-set="sound">sound</button>
    </p>
    <p class="fine">rules from memory — waiting on Daud</p>`);
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
function keepPage() {
  const c = document.createElement("canvas");
  c.width = RULES.pageW * 2;
  c.height = RULES.pageH * 2;
  const k = new Camera();
  k.setViewport(0, 0, RULES.pageW, RULES.pageH);
  k.z = 1;
  render(c.getContext("2d")!, k, s, {}, RULES.pageW, RULES.pageH, 2);
  c.toBlob((b) => {
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

function nearestOwn(w: Pt): number | undefined {
  const tol = Math.max(RULES.soldierRadius * 2.5, 26 / cam.z);
  let best: number | undefined, bd = tol;
  for (const x of alive(s, s.current)) {
    const d = Math.hypot(x.x - w.x, x.y - w.y);
    if (d < bd) { bd = d; best = x.id; }
  }
  return best;
}

function select(id: number) {
  if (selected !== id) sfx.tap();
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
    if (e.type === "pointerup" && ghost?.ok) { drawBase(ghost.x, ghost.y); ghost = undefined; next(); }
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
      aim = null;
      if (f && canAct(s, f.soldierId)) fire(f);
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

function frame(now: number) {
  // schedule first: one bad frame must never stop the game
  requestAnimationFrame(frame);
  let active = cam.tick(now);
  if (anim) {
    // rAF's timestamp can predate the flick by a few ms, so clamp at 0 too
    anim.p = Math.min(1, Math.max(0, (now - anim.t0) / anim.dur));
    active = true;
    if (anim.p >= 1) { const done = anim.done; anim.p = 1; render(ctx, cam, s, overlay(now), W, H, dpr); done(); }
  }
  if (aim || botAim) active = true;
  if (active || dirty) {
    render(ctx, cam, s, overlay(now), W, H, dpr);
    dirty = false;
  }
}

function overlay(now: number): Overlay {
  const o: Overlay = { selected, ghost };
  if (anim) o.anim = { turn: anim.turn, p: 1 - Math.pow(1 - anim.p, 2), mover: anim.mover, path: anim.path };
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
document.fonts?.ready.then(() => { dirty = true; });
requestAnimationFrame(frame);
showTitle();

// dev-only handle for scripted playtests
if (import.meta.env.DEV) (window as unknown as { pft: object }).pft = { get s() { return s; }, cam };

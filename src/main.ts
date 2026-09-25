import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";
import "./style.css";

import { insideBase } from "./bases";
import { botAction, botBase, LEVELS, type Level } from "./bot";
import { CARDS, SHAPE_NAMES } from "./cards";
import { pull, release, reach, sigma, wobble, type Aim } from "./flick";
import {
  act, alive, basesLeft, canAct, canPlaceBase, canTransfer, garrison, kitLeft, migrate, newGame, pass, pathLen,
  placeBase, powerFor, standing, nextBaseRot, steadiness, stuck, transfer, transferMax, baseRadius,
  type ActionKind, type Flick, type GameState, type Outcome, type Player, type Pt,
} from "./game";
import * as inkLib from "./ink";
import { INK } from "./ink";
import { RULES, type Shape } from "./rules";
import { RULESETS, ruleSet } from "./rulesets";
import * as sfx from "./sound";
import { inBase, jotOrder, pickSoldier } from "./hand";
import { Timeline, reachFraction } from "./timeline";
import { Camera, invalidatePage, render, renderOpts, type Overlay } from "./view";

// --- state ------------------------------------------------------------------

type Mode = { kind: "pnp" } | { kind: "bot"; level: Level };
type Kind = ActionKind | "send";
interface Save { s: GameState; mode: Mode }

const settings = {
  closeUp: localStorage.getItem("pft:closeUp") !== "0",
  handoff: localStorage.getItem("pft:handoff") !== "0",
};

let rulesId = localStorage.getItem("pft:rules") ?? "classic";
let s: GameState = newGame(ruleSet(rulesId));
let mode: Mode = { kind: "pnp" };
let kind: Kind = "shoot";
let shape: Shape = "circle";
let pick: { from?: number; to?: number } = {}; // a transfer being set up
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
    return v?.s && (v.s.v === 1 || v.s.v === 2) ? { s: migrate(v.s), mode: v.mode } : null;
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

const soldiersIn = (sh: Shape) => (sh === "circle" ? s.rules.soldiersPerBase : s.rules.shapes[sh].soldiers);

// The strip's choices: shapes while drawing a kit, then move / shoot (/ send).
function choices(): { key: string; label: string }[] {
  if (s.phase === "setup") {
    if (!s.rules.kit) return [];
    const left = kitLeft(s, s.current);
    return [...new Set(left)].map((sh) => {
      const n = left.filter((x) => x === sh).length;
      return { key: `shape:${sh}`, label: SHAPE_NAMES[sh] + (n > 1 ? `×${n}` : "") };
    });
  }
  return [
    { key: "move", label: "move" },
    { key: "shoot", label: "shoot" },
    ...(s.rules.transfer && !(s.rules.transfer.free && s.sent) ? [{ key: "send", label: "send" }] : []),
  ];
}

function hud() {
  for (const p of [0, 1] as Player[]) {
    const el = $(`.side[data-p="${p}"]`);
    el.classList.toggle("on", s.current === p && s.phase !== "over");
    (el.querySelector(".name") as HTMLElement).textContent = name(p);
    const n = s.phase === "setup" ? kitLeft(s, p).reduce((a, sh) => a + soldiersIn(sh), 0) : alive(s, p).length;
    const t = tallyPath(n, 17 + p);
    const svg = el.querySelector("svg")!;
    svg.setAttribute("viewBox", `0 0 ${Math.max(10, t.w)} 22`);
    svg.setAttribute("preserveAspectRatio", p === 0 ? "xMinYMid meet" : "xMaxYMid meet");
    svg.innerHTML = `<path d="${t.d}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="${s.phase === "setup" ? 0.3 : 0.85}"/>`;
  }
  const ink = INK.pens[s.current];
  document.documentElement.style.setProperty("--ink", ink);
  const opts = choices();
  if (s.phase === "setup" && s.rules.kit && !kitLeft(s, s.current).includes(shape)) shape = kitLeft(s, s.current)[0] ?? "circle";
  const on = (key: string) => (s.phase === "setup" ? key === `shape:${shape}` : key === kind);
  const box = $("#kind");
  box.classList.toggle("three", opts.length > 2);
  box.innerHTML = opts.map((o, i) => `<button data-key="${o.key}" class="${on(o.key) ? "on" : ""}">${o.label}${on(o.key)
    ? `<svg viewBox="0 0 100 50" preserveAspectRatio="none"><path d="${circlePath(100, 50, 3 + i * 5)}" fill="none" stroke="${ink}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>` : ""}</button>`).join("");
  const off = isBot(s.current) || s.phase === "over" || (s.phase === "setup" && !s.rules.kit);
  box.classList.toggle("off", off);
  $("#turn-no").textContent = s.phase === "play" ? `turn ${s.turn}` : "";
  chips();
  status();
}

function status(msg?: string) {
  let t = msg ?? "";
  if (!msg) {
    const who = name(s.current);
    const again = s.phase === "play" && s.actions.length && lastActor() === s.current ? " again" : "";
    if (s.phase === "setup") {
      const what = s.rules.kit ? `draw a ${SHAPE_NAMES[shape]}` : "draw a base";
      t = isBot(s.current) ? `${who} is drawing a base…` : `${who}: ${what} (${basesLeft(s, s.current)} left)`;
    } else if (s.phase === "over") t = `${name(s.winner!)} wins`;
    else if (isBot(s.current)) t = `${who} is lining up${again ? " again" : ""}…`;
    else if (kind === "send") {
      t = pick.from === undefined ? `${who}: tap the base to send from`
        : pick.to === undefined ? "now tap the base they go to" : "how many go?";
    } else if (aim) t = pull(aim).live ? `let go to ${kind}` : "pull back further…";
    else if (selected !== undefined) t = "pull back from anywhere, let go";
    else if (lastNote.endsWith("Go again.")) t = `${lastNote} Pick a soldier.`;
    else t = lastNote ? `${lastNote} ${who}${again}: pick a soldier` : `${who}${again}: pick a soldier`;
  }
  $("#status").textContent = t;
}

// who took the last action (a base, a flick or a transfer)
function lastActor(): Player | undefined {
  for (let i = s.marks.length - 1; i >= 0; i--) {
    const m = s.marks[i];
    if (m.t === "stroke" || m.t === "road") return m.owner;
  }
  return undefined;
}

// The count picker for a transfer: 1..max as handwritten numbers.
function chips() {
  const el = $("#chips");
  const show = kind === "send" && pick.from !== undefined && pick.to !== undefined && !isBot(s.current) && s.phase === "play";
  el.hidden = !show;
  if (!show) return;
  const max = transferMax(s, pick.from!);
  el.innerHTML = Array.from({ length: max }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join("") + `<button data-n="0" class="x">✕</button>`;
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

function reset() {
  gen++;
  kind = "shoot";
  pick = {};
  selected = undefined;
  aim = botAim = null;
  anim = null;
  fx.clear();
  busy = false;
  lastNote = "";
}

function start(m: Mode) {
  reset();
  s = newGame(ruleSet(rulesId), undefined, pageStamp());
  mode = m;
  shape = kitLeft(s, 0)[0] ?? "circle";
  save();
  closeSheet();
  cam.fit(true);
  if (!taught("place")) fx.add("teach", performance.now(), 500, 900, "linear");
  hud();
  next();
}

function resume(v: Save) {
  reset();
  s = v.s;
  mode = v.mode;
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
  if (s.phase === "play" && stuck(s)) {
    // nothing on the page can move: the pen passes
    lastNote = `${name(s.current)} has nobody to flick.`;
    pass(s);
    save();
    return next();
  }
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
      const spot = botBase(s, (x, y, sh) => !canPlaceBase(s, x, y, sh));
      if (spot) drawBase(spot.x, spot.y, spot.shape);
      busy = false;
      next();
    }), 450 + Math.max(0, fx.end(performance.now()) - performance.now()));
    return;
  }
  setTimeout(live(() => {
    const a = botAction(s, (mode as { level: Level }).level);
    if (a.t === "pass") { pass(s); busy = false; return next(); }
    if (a.t === "transfer") {
      kind = "send";
      pick = { from: a.from };
      hud();
      dirty = true;
      setTimeout(live(() => { pick = { from: a.from, to: a.to }; dirty = true; }), 450);
      setTimeout(live(() => send(a.from, a.to, a.n)), 1000);
      return;
    }
    if (a.t !== "flick") { busy = false; return next(); }
    const { t: _t, ...f } = a;
    void _t;
    const me = s.soldiers[f.soldierId];
    selected = f.soldierId;
    if (settings.closeUp) cam.to(me.x, me.y, Math.max(cam.z, cam.fitZ * 2.2), 450);
    const power = powerFor(s.rules, f.kind, f.length);
    kind = f.kind;
    hud();
    const t0 = performance.now();
    const charge = live(() => {
      const p = Math.min(1, (performance.now() - t0) / 700);
      botAim = { soldierId: f.soldierId, angle: f.angle, power: power * p };
      dirty = true;
      if (p < 1) requestAnimationFrame(charge);
      else setTimeout(live(() => { const pw = botAim?.power ?? 0; botAim = null; fire(f, pw); }), 120);
    });
    setTimeout(charge, 350);
  }), 450);
}

// The outline goes round, then the soldiers are jotted in, one tap each.
function drawBase(x: number, y: number, sh: Shape) {
  const before = s.soldiers.length;
  const b = placeBase(s, x, y, sh);
  const now = performance.now();
  fx.add(`b${b.id}`, now, 0, 380, "out");
  sfx.circle();
  sfx.buzz(10);
  const dots = s.soldiers.slice(before);
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

// Schedule the marks an action just added, from index `first`: lines draw on,
// crosses land when the ink reaches them, then the aftermath.
function animate(first: number, o: Outcome, dur: number, now: number) {
  const strokes = s.marks.slice(first).flatMap((m, k) => (m.t === "stroke" ? [{ pts: m.pts, k: first + k }] : []));
  const main = strokes[0]?.pts ?? o.path;
  const reachAt = (p: Pt) => {
    // when the nearest new line gets to p
    let best = { d: Infinity, t: 0 };
    for (const st of strokes) {
      const i = nearestIndex(st.pts, p);
      const d = Math.hypot(st.pts[i].x - p.x, st.pts[i].y - p.y);
      const start = st.k === strokes[0].k ? 0 : reachFraction(nearestIndex(main, st.pts[0]), main.length - 1) * dur;
      if (d < best.d) best = { d, t: start + reachFraction(i, st.pts.length - 1) * dur };
    }
    return best.t;
  };
  let tail = dur;
  for (let i = first; i < s.marks.length; i++) {
    const m = s.marks[i];
    const key = `m${i}`;
    if (m.t === "stroke") {
      const start = i === strokes[0].k ? 0 : reachFraction(nearestIndex(main, m.pts[0]), main.length - 1) * dur;
      fx.add(key, now, start, dur, "out2");
      tail = Math.max(tail, start + dur);
    } else if (m.t === "road") {
      fx.add(key, now, 0, 700, "out");
      tail = Math.max(tail, 700);
    } else if (m.t === "notch") {
      const at = reachAt(m);
      fx.add(key, now, at, 160);
      sfx.cross(at * fx.speed / 1000, 0.7);
    } else if (m.t === "cross") {
      const delay = m.kind === "kill" || m.kind === "wound" ? (strokes.length ? reachAt(m) : 300)
        : m.kind === "lost" ? dur + 40 : strokes.length ? dur + 140 : 80 + (i - first) * 50;
      fx.add(key, now, delay, m.kind === "moved" ? 150 : 170);
      const at = delay * fx.speed;
      if (m.kind === "moved") sfx.cross(at / 1000, 0.5);
      else {
        sfx.cross(at / 1000 + 0.02);
        setTimeout(() => sfx.buzz([18, 30, 18]), at);
      }
    } else if (m.t === "raze" || m.t === "found" || m.t === "stand") {
      fx.add(key, now, tail + 220, m.t === "raze" ? 380 : 600, "out");
      tail += 260;
    }
  }
  // soldiers arriving from the road are jotted into their base
  (o.arrived ?? []).forEach((id, k) => {
    const delay = tail + 260 + k * 70;
    fx.add(`d${id}`, now, delay, 90, "out");
    sfx.dot((delay * fx.speed) / 1000);
  });
}

function note(who: Player, o: Outcome, verb: string) {
  const parts: string[] = [];
  const n = o.killed.length, w = o.wounded.length, c = o.cut.reduce((a, x) => a + x.ids.length, 0);
  if (o.lost) parts.push(`${name(who)} flicked a soldier off the page.`);
  else if (n || w) parts.push(`${name(who)}'s ${verb} crossed out ${n}${w ? `, wounded ${w}` : ""}.`);
  else if (verb === "sent") parts.push(`${name(who)} sent soldiers down the road.`);
  else parts.push(verb === "run" ? `${name(who)} moved a soldier.` : `${name(who)} missed.`);
  if (c) parts.push(`Cut the road: ${c} lost.`);
  if (o.fell?.length) parts.push(o.fell.length > 1 ? `${o.fell.length} bases fell.` : "A base fell.");
  if (o.founded?.length) parts.push("Took a base!");
  if (o.stood?.length) parts.push(`${o.stood.map((p) => name(p)).join(" & ")}: last stand!`);
  if (o.again && (n || w || c)) parts.push("Go again.");
  return parts.join(" ");
}

function finish(who: Player, o: Outcome, verb: string) {
  anim = null;
  busy = false;
  lastNote = note(who, o, verb);
  kind = kind === "send" ? "shoot" : kind;
  pick = {};
  if (s.phase === "play" && mode.kind === "pnp" && settings.handoff && s.current !== who) showHandoff();
  else next();
}

// `power` is how hard the pen was pulled back: it springs forward on release.
function fire(f: Flick, power: number) {
  const who = s.current;
  const first = s.marks.length;
  const o = act(s, f);
  save();
  selected = undefined;
  aim = null;
  busy = true;
  const now = performance.now();
  const dur = Math.min(650, Math.max(220, 160 + pathLen(o.path) * 0.3));
  animate(first, o, dur, now);
  fx.add("pen", now, dur, 300, "out"); // then the pen lifts off the page
  anim = {
    key: `m${first}`, path: o.path, owner: who, power, t0: now,
    mover: f.kind === "move" ? f.soldierId : undefined,
    end: fx.end(now) + 120 * fx.speed,
    done: () => finish(who, o, f.kind === "shoot" ? "shot" : "run"),
  };
  sfx.scratch((dur * fx.speed) / 1000 + 0.05, f.kind === "shoot" ? 0.6 : 0.45);
  sfx.buzz(12);
  // pull back to see what the ink did
  if (settings.closeUp) setTimeout(() => cam.fit(true), 60);
  hud();
}

function send(from: number, to: number, n: number) {
  const who = s.current;
  const first = s.marks.length;
  const o = transfer(s, from, to, n);
  save();
  busy = true;
  const now = performance.now();
  animate(first, o, 700, now);
  sfx.scratch(0.7, 0.35);
  anim = { key: `m${first}`, path: o.path, owner: who, power: 0, t0: now, end: fx.end(now) + 200, done: () => finish(who, o, "sent") };
  hud();
}

// --- sheets -----------------------------------------------------------------

function sheet(html: string, cls = "") {
  const el = $("#sheet");
  const card = el.querySelector(".card") as HTMLElement;
  card.className = `card ${cls}`;
  card.innerHTML = html;
  el.hidden = false;
  card.scrollTop = 0;
  return card;
}
function closeSheet() { $("#sheet").hidden = true; }

function showTitle() {
  const saved = load();
  const canResume = saved && (saved.s.phase !== "over");
  const R = ruleSet(rulesId);
  const card = sheet(`
    <h1>Pen Flick <em>Tactics</em></h1>
    <p class="sub">a notebook war, after Dawood</p>
    ${canResume ? `<button class="act" data-a="resume">↳ carry on the page <span class="aside">(${saved!.s.rules.name})</span></button>` : ""}
    <p class="rules-line">rules: <button class="act small on" data-a="rules">${R.name}</button> <button class="act small" data-a="card">read</button></p>
    <button class="act" data-a="pnp">↳ pass &amp; play</button>
    <button class="act red" data-a="bot">↳ vs Dawood-bot</button>
    <div class="row">${LEVELS.map((l, i) => `<button class="act small ${i === botLevel ? "on" : ""}" data-lvl="${i}">${l}</button>`).join(" · ")}</div>
    <button class="act small" data-a="how">how to play</button>
    <p class="fine">
      <button class="act small ${settings.closeUp ? "on" : ""}" data-set="closeUp">close-up aim</button> ·
      <button class="act small ${settings.handoff ? "on" : ""}" data-set="handoff">hand-off screen</button> ·
      <button class="act small ${!sfx.muted ? "on" : ""}" data-set="sound">sound</button>
    </p>
    <p class="fine">rules evolved in the rules lab — waiting on Dawood</p>`);
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
    else if (a === "rules") showRules();
    else if (a === "card") showCard(rulesId, showTitle);
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

// Which rules to play: each set with its one-line identity.
function showRules() {
  sheet(`
    <h2>Which rules?</h2>
    <p class="sub">pick one for the next page</p>
    ${RULESETS.map((r) => `
      <button class="act ${r.id === rulesId ? "chosen" : ""}" data-id="${r.id}">↳ ${r.name}</button>
      <p class="motto">${r.motto}</p>`).join("")}
    <button class="act small" data-a="back">back</button>`, "rules").onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.tap();
    if (b.dataset.id) { rulesId = b.dataset.id; localStorage.setItem("pft:rules", rulesId); showCard(rulesId, showRules, true); }
    else showTitle();
  };
}

// A rule set's card: the rules as a friend would write them down for you.
function showCard(id: string, back: () => void, chosen = false) {
  const R = ruleSet(id);
  const c = CARDS[R.id] ?? CARDS.classic;
  sheet(`
    <h2>${R.name}</h2>
    <p class="sub">${R.motto}</p>
    <ol class="hand">${c.rules.map((l) => `<li>${l}</li>`).join("")}</ol>
    ${c.feel ? `<p class="margin-note">${c.feel}</p>` : ""}
    ${chosen ? `<button class="act" data-a="title">↳ play these</button>` : ""}
    <button class="act small" data-a="back">back</button>`, "rules").onclick = (e) => {
    const a = (e.target as HTMLElement).closest("button")?.dataset.a;
    if (!a) return;
    sfx.tap();
    if (a === "title") showTitle();
    else back();
  };
}

function showHow() {
  sheet(`
    <h2>How to play</h2>
    <ol>
      <li>Take turns drawing bases${s.rules.kit ? " (pick the shape at the bottom)" : ""}. Each fills with soldiers.</li>
      <li>On your turn, touch one soldier. Pull back from anywhere and let go, like flicking a pen.</li>
      <li><b>Shoot</b>: every enemy the ink touches is crossed out. Your soldier stays put.</li>
      <li><b>Move</b>: the same flick, but your soldier ends where the ink stops. Flick him off the page and he's gone.</li>
      <li><b>Send</b> (if the rules have it): tap a base, tap another, pick how many. They walk the road and arrive after your opponent's next go.</li>
      <li>Hold a hard flick too long and your hand starts to shake.</li>
      <li>Pinch to zoom. The rules card says how to win.</li>
    </ol>
    <button class="act" data-a="card">↳ this page's rules</button>
    <button class="act small" data-a="back">back</button>`).onclick = (e) => {
    const a = (e.target as HTMLElement).closest("button")?.dataset.a;
    if (a === "card") showCard(s.rules.id, showHow);
    else if (a) showTitle();
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
  const how = s.rules.win === "bases" ? "took the last base" : "crossed out the last soldier";
  sheet(`
    <h2 style="color:${INK.pens[w]}">${name(w)} wins.</h2>
    <p class="sub">${how} · ${s.turn} turns, ${s.marks.filter((m) => m.t === "stroke").length} lines of ink.</p>
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
    soldier: Math.max(s.rules.soldierRadius * 2.5, 22 / cam.z),
    base: selected === undefined ? Math.max(18, 30 / cam.z) : 0,
  });
}

// Which of your standing bases a tap means (for sending soldiers).
function baseAt(w: Pt): number | undefined {
  let best: number | undefined, bd = Infinity;
  for (const b of standing(s, s.current)) {
    const d = Math.hypot(b.x - w.x, b.y - w.y);
    if ((insideBase(b, w, 1.35) || d < b.r + 26 / cam.z) && d < bd) { bd = d; best = b.id; }
  }
  return best;
}

function tapBase(w: Pt) {
  const id = baseAt(w);
  if (id === undefined) { pick = {}; hud(); dirty = true; return; }
  if (pick.from === undefined || pick.to !== undefined || id === pick.from) {
    if (id === pick.from && pick.to === undefined) { pick = {}; hud(); dirty = true; return; }
    if (transferMax(s, id) < 1) { pick = {}; status(`can't spare anyone from there (${garrison(s, s.bases[id]).length} left)`); dirty = true; return; }
    pick = { from: id };
    sfx.click();
  } else {
    pick = { from: pick.from, to: id };
    sfx.click();
  }
  hud();
  dirty = true;
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
    // outline floats above the finger so you can see where it goes.
    const off = e.pointerType === "touch" ? 70 : 0;
    g = { t: "place", id: e.pointerId, off };
    moveGhost(e.clientX, e.clientY - off);
    return;
  }
  if (human && s.phase === "play" && kind !== "send") {
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
  const why = canPlaceBase(s, w.x, w.y, shape);
  ghost = { x: w.x, y: w.y, ok: !why, shape, r: baseRadius(s.rules, shape), rot: nextBaseRot(s, shape) };
  status(why ? `can't draw here: ${why}` : `lift to draw the ${s.rules.kit ? SHAPE_NAMES[shape] : "base"}`);
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
  if (g.t === "aim" && g.id === e.pointerId && selected !== undefined && kind !== "send") {
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
    if (e.type === "pointerup" && ghost?.ok) { learn("place"); drawBase(ghost.x, ghost.y, ghost.shape); ghost = undefined; next(); }
    ghost = undefined;
    g = { t: "none" };
    status();
    dirty = true;
    return;
  }
  if (g.t === "aim" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (aim && e.type === "pointerup") {
      const f = release(aim, performance.now(), s.rules, Math.random, steadiness(s, aim.soldierId));
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
    const human = !isBot(s.current) && !busy && $("#sheet").hidden && s.phase === "play";
    if (tapped && human && kind === "send") tapBase(cam.toWorld(p.x, p.y));
    else if (tapped && selected !== undefined && !busy) selected = undefined;
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

$("#kind").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b?.dataset.key) return;
  const key = b.dataset.key;
  if (key.startsWith("shape:")) {
    if (shape !== key.slice(6)) sfx.tap();
    shape = key.slice(6) as Shape;
  } else {
    if (kind !== key) sfx.tap();
    kind = key as Kind;
    pick = {};
    if (kind === "send") { selected = undefined; aim = null; }
    else if (aim) aim.kind = kind;
  }
  hud();
  dirty = true;
});
$("#chips").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b?.dataset.n) return;
  const n = +b.dataset.n;
  if (!n || pick.from === undefined || pick.to === undefined) { pick = {}; hud(); dirty = true; return; }
  if (canTransfer(s, pick.from, pick.to, n)) return;
  sfx.tap();
  send(pick.from, pick.to, n);
});
$("#fit-btn").onclick = () => { cam.fit(true); dirty = true; };
$("#menu-btn").onclick = () => { sfx.unlock(); showTitle(); };
window.addEventListener("keydown", (e) => {
  const key = e.key === "m" ? "move" : e.key === "s" ? "shoot" : e.key === "t" ? "send" : null;
  if (key) $<HTMLButtonElement>(`#kind [data-key="${key}"]`)?.click();
  if (e.key === "Escape") { aim = null; selected = undefined; pick = {}; hud(); dirty = true; }
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
  if (kind === "send" && s.phase === "play") o.pick = pick;
  if (human && s.phase === "setup" && !ghost && !taught("place")) {
    o.teach = { kind: "place", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * (s.current === 0 ? 0.72 : 0.28) }, p: fx.p("teach", now) };
  }
  if (human && s.phase === "play" && selected !== undefined && !aim && !anim && !taught("aim")) {
    o.teach = { kind: "aim", at: s.soldiers[selected], p: fx.p("teach", now) };
  }
  if (s.phase === "play" && !isBot(s.current) && selected === undefined && !aim && !anim && $("#sheet").hidden && kind !== "send") {
    const mine = alive(s, s.current).filter((x) => x.transit === undefined);
    o.hint = {
      p: fx.p("hint", now),
      bases: s.bases.filter((b) => b.owner === s.current && !b.fallen && inBase(mine, b).length),
    };
  }
  if (anim && anim.path.length > 1 && s.marks[+anim.key.slice(1)]?.t === "stroke") {
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
    const st = steadiness(s, aim.soldierId);
    o.aim = {
      soldierId: aim.soldierId,
      angle: p.angle + wobble(aim, now) * st,
      power: p.power,
      spread: sigma(p.power) * 2 * st,
      reach: reach(s.rules, aim.kind, p.power),
    };
  } else if (botAim) {
    const k = kind === "send" ? "shoot" : kind;
    o.aim = { ...botAim, spread: sigma(botAim.power) * 2 * steadiness(s, botAim.soldierId), reach: reach(s.rules, k, botAim.power) };
  }
  return o;
}

resize();
hud();
document.fonts?.ready.then(() => { invalidatePage(); dirty = true; });
requestAnimationFrame(frame);
showTitle();

// dev-only handle for scripted playtests
if (import.meta.env.DEV) (window as unknown as { pft: object }).pft = {
  get s() { return s; }, cam, fx, pageCanvas, ink: inkLib, INK, renderOpts, canvas, RULESETS,
  get rulesId() { return rulesId; },
  get busy() { return busy || !!anim; },
  renderNow: () => render(ctx, cam, s, overlay(performance.now()), W, H, dpr),
};

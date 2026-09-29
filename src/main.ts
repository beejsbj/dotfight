import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/special-elite/400.css";
import "./style.css";

import { botArrange, botBase, LEVELS, type Level } from "./bot";
import { Camera } from "./camera";
import { cue, onCue } from "./cues";
import { aimError, pull, release, wobble, type Aim as Pull } from "./flick";
import {
  act, canArrange, canSend, garrison, illegal, newGame, pathLen, sendMax,
  type Action, type Flick, type GameState, type Kind, type Outcome, type Player, type Pt,
} from "./game";
import { jotOrder, pickSoldier, inBase } from "./hand";
import { haptic, haptics, Ratchet } from "./haptics";
import { inkTime, type Snag } from "./inkclock";
import * as inkLib from "./ink";
import { INK } from "./ink";
import { farColour, lampFor } from "./light";
import { drawPaper, drawYellow, PageLayer, SETTLED, type Ink } from "./page";
import { leaning, PEN, type PenPose } from "./pen";
import { screenDirToWorld } from "./projection";
import { addToDrawer, apply, blank, file, readDrawer, readSave, sizeFor, steps, unfile, type AnyState, type Filed, type Mode, type Save, type Step } from "./record";
import { GAME } from "./name";
import { CUSTOM, RULES, SIZES, type Size } from "./rules";
import { page, pageState, stageStats, renderOverlay, renderStage, worldTransform, type Els, type Frame } from "./scene";
import * as sfx from "./sound";
import { applyTheme, chooseTheme, chosenTheme, currentTheme, homeTheme, hudPen, onTheme, roomTheme, setRoomTheme, theme, themeOf, THEMES, withTheme } from "./theme";
import { listRooms, readRoom, RoomLink, type Saved as RoomSaved } from "./room";
import { apply as roomApply, check as roomCheck, drifted as roomDrifted, ENGINE, hash as roomHash, replay as roomReplay, setupOf, turn as roomTurn, type Payload, type Setup } from "./room-engine";
import { httpApi, RoomHttpError, type RoomView } from "./room-protocol";
import { Timeline, reachFraction } from "./timeline";
import * as turn from "./turn";

// --- state ------------------------------------------------------------------

const settings = {
  tilt: localStorage.getItem("pft:tilt") !== "0", // sit down at the desk to aim
  handoff: localStorage.getItem("pft:handoff") === "1", // pause for a tap between pass-and-play turns
};

let s: AnyState = newGame();
let mode: Mode = { kind: "pnp" };
let kind: Kind = "snipe";
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
  pen: boolean; cam: boolean; startLean: number; startAngle: number; settled?: boolean;
  /** Moments to cue once the ink gets there: a lunger shot where he lands, a last stand. */
  moments: { at: number; fn: () => void; done?: boolean }[];
  done: () => void;
}
let res: Resolve | null = null;
let penDrop = -1e9; // when the pen was set down on the selected soldier

// Convoys between turns: the engine moves them the moment the pen changes
// hands; the page holds their new dots back and shows the march as a quick
// time-lapse before the next go (see holdLapse / runLapse).
interface Walk { id: number; from: Pt; to: Pt }
let lapseDue: { walkers: Walk[]; marks: number[]; out: number; home: number } | null = null;
let lapse: { walkers: Walk[]; t0: number; dur: number } | null = null;

// A send being drawn (pick a camp, drag to another, choose how many), and
// a soldier being arranged before the first flick.
let sending: { from?: number; to?: number } | null = null;
let dragging: { id: number; at: Pt; ok: boolean } | null = null;
let arrowTo: Pt | null = null; // the pencil end of a send being drawn

const $ = <T extends HTMLElement>(q: string) => document.querySelector(q) as T;
const els: Els = {
  desk: $<HTMLCanvasElement>("#desk"), pageHost: $("#page-host"), live: $<HTMLCanvasElement>("#live"),
  light: $<HTMLCanvasElement>("#light"), haze: $<HTMLCanvasElement>("#haze"),
};
const over = $<HTMLCanvasElement>("#over");
const og = over.getContext("2d")!;
haptics.install(over); // iOS 26.5+: labels for real taps to land on
onCue((c) => { if (c === "lunge-death") haptic("thud"); else if (c === "last-stand") haptic("stand"); });
const cam = new Camera();
let W = 0, H = 0, dpr = 1, sdpr = 1, dirty = true;

const isBot = (p: Player) => mode.kind === "bot" && p === 1;
// in a room, the other seat's moves come down the link (watchers: both seats')
const remote = (p: Player) => mode.kind === "room" && link?.seat !== p;
const away = (p: Player) => isBot(p) || remote(p);
const core = () => turn.coreOf(s);
const name = (p: Player) => (isBot(p) ? "Dawood-bot" : mode.kind === "room" && link ? (link.names[p] ?? "your friend") : INK.names[p]);
// pass & play turns the page for red; in a room, red's page sits the other way up for good
const rotFor = (p: Player) => ((mode.kind === "pnp" && p === 1) || (mode.kind === "room" && link?.seat === 1) ? Math.PI : 0);

function save() {
  if (screen !== "game") return;
  if (mode.kind === "room") return roomSave();
  localStorage.setItem("pft:save", JSON.stringify({ s, mode } satisfies Save));
}
const load = () => readSave(localStorage.getItem("pft:save"));
/** The paper a page was started on (pages from before themes were Lamplight). */
const paperOf = (p?: GameState["page"]) => themeOf(p?.theme).id;
const drawer = () => readDrawer(localStorage.getItem("pft:drawer"));

// --- layout -----------------------------------------------------------------

function resize() {
  // past 2x the extra pixels cost more than a phone's eye can see
  dpr = Math.min(2, window.devicePixelRatio || 1);
  sdpr = dpr;
  W = window.innerWidth;
  H = window.innerHeight;
  // a hidden bar takes no room (a zero rect would otherwise read as full height)
  const tr = $("#top").getBoundingClientRect(), br = $("#bottom").getBoundingClientRect();
  const top = tr.height ? tr.bottom : 0;
  const bottom = br.height ? H - br.top : 0;
  cam.resize(W, H, top, bottom);
  const cw = W + cam.ox * 2, ch = H + cam.oy + cam.ob;
  const live = els.live;
  live.style.left = `${-cam.ox}px`;
  live.style.top = `${-cam.oy}px`;
  live.style.width = `${cw}px`;
  live.style.height = `${ch}px`;
  const [pw, ph] = [Math.round(cw * sdpr), Math.round(ch * sdpr)];
  if (live.width !== pw || live.height !== ph) { live.width = pw; live.height = ph; }
  const [ow, oh] = [Math.round(W * dpr), Math.round(H * dpr)];
  if (over.width !== ow || over.height !== oh) { over.width = ow; over.height = oh; }
  // light and fog are gradients: a quarter of a css pixel is plenty
  for (const c of [els.light, els.haze]) {
    const [aw, ah] = [Math.ceil(W / 4), Math.ceil(H / 4)];
    if (c.width !== aw || c.height !== ah) { c.width = aw; c.height = ah; }
  }
  // page texture resolution: sharp where the camera leans in to aim, capped for memory
  pageState.S = Math.round(Math.min(2, Math.max(1.1, sdpr * cam.fitZ * 2.1 * 1.1)) * 10) / 10;
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

// Ink each pen has spent, summed once per new mark rather than every frame.
let inkMemo = { s: null as AnyState | null, n: -1, used: [0, 0] };
function inkLeft(p: Player) {
  if (inkMemo.s !== s || inkMemo.n !== s.marks.length) {
    const used = [0, 0];
    for (const m of s.marks) if (m.t === "stroke") used[m.owner] += pathLen(m.pts);
    inkMemo = { s, n: s.marks.length, used };
  }
  return Math.max(0.05, 1 - inkMemo.used[p] / 60000);
}

function hud() {
  const inGame = screen === "game" || screen === "view" || screen === "replay";
  document.body.classList.toggle("playing", inGame);
  const c0 = core();
  for (const p of [0, 1] as Player[]) {
    const el = $(`.tag[data-p="${p}"]`);
    el.classList.toggle("on", s.current === p && s.phase !== "over" && screen === "game");
    el.classList.toggle("won", s.phase === "over" && s.winner === p);
    const stand = !!c0 && c0.stand[p] > 0 && s.phase === "play";
    el.classList.toggle("stand", stand);
    (el.querySelector(".name") as HTMLElement).textContent = name(p);
    const n = turn.aliveOf(s, p).length;
    const c = el.querySelector(".count") as HTMLElement;
    c.textContent = s.phase === "setup" ? `${turn.basesLeft(s, p)} camps to draw`
      : s.phase === "position" ? (c0?.ready[p] ? "arranged" : "arranging")
      : stand ? `last ${n} · two flicks` : `${n} standing`;
    el.style.setProperty("--ink-left", inkLeft(p).toFixed(3));
  }
  document.documentElement.style.setProperty("--ink", hudPen(s.current));
  const chain = !!c0?.chain;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#kind button[data-kind]")) {
    const k = b.dataset.kind as Kind;
    const on = k === kind;
    b.classList.toggle("on", on);
    b.classList.toggle("barred", chain && k === "snipe");
    b.setAttribute("aria-checked", String(on));
    b.querySelector("b")!.textContent = k === "lunge" && chain ? "lunge on" : turn.verb(s, k);
    b.querySelector("i")!.textContent = CARD[turn.isLegacy(s) ? "legacy" : "core"][k];
  }
  $("#kind").classList.toggle("off", s.phase !== "play" || away(s.current) || screen !== "game" || busy && !aim || !!sending);
  $("#bottom").classList.toggle("view", screen === "view" || screen === "replay");
  acts();
  status();
}

// The cards' one-liners.
const CARD = {
  core: { lunge: "run your ink, stand where it stops", snipe: "stay put, the ink goes through them" },
  legacy: { lunge: "he goes where the ink stops", snipe: "the ink runs off the page" },
};

// Pencilled buttons under the status line: send, stop, done. What's there
// depends on where the turn is.
function acts() {
  const el = $("#acts");
  const c0 = core();
  const mine = screen === "game" && !away(s.current) && !busy && !aim && !!c0 && $("#sheet").hidden;
  let html = "";
  if (mine && c0.phase === "position") html = `<button data-act="ready" class="go">done arranging</button>`;
  else if (mine && c0.phase === "play") {
    if (sending?.to !== undefined) {
      const max = sendMax(c0, sending.from!);
      html = `<span>send</span>${Array.from({ length: max }, (_, i) => `<button data-act="n" data-n="${i + 1}">${i + 1}</button>`).join("")}<button data-act="cancel" class="x">cancel</button>`;
    } else if (sending) html = `<button data-act="cancel" class="x">cancel the send</button>`;
    else {
      if (c0.chain) html += `<button data-act="stop" class="go">stop here</button>`;
      if (!c0.sent && canSendAny(c0)) html += `<button data-act="send">send men <small>free</small></button>`;
    }
  }
  if (el.innerHTML !== html) el.innerHTML = html;
}

/** Is there any send the current player could make? */
function canSendAny(c0: GameState) {
  return c0.bases.some((a) => a.owner === c0.current && sendMax(c0, a.id) > 0 && c0.bases.some((b) => b !== a && !canSend(c0, a.id, b.id, 1)));
}

function status(msg?: string) {
  let t = msg ?? "";
  if (!msg) {
    const who = name(s.current);
    const c0 = core();
    if (screen === "replay") t = "the war, again";
    else if (screen === "game" && roomStatus() !== null) t = roomStatus()!;
    else if (screen === "view") t = viewing ? `page ${viewing.page?.no ?? "?"} · ${viewing.page?.date ?? ""}` : "";
    else if (s.phase === "setup") t = isBot(s.current) ? `${who} is drawing a camp…` : `${who}: draw a camp`;
    else if (s.phase === "position") t = isBot(s.current) ? `${who} is arranging…` : dragging ? (dragging.ok ? "let go to put him here" : "too far from his camp") : `${who}: arrange your men, then done`;
    else if (s.phase === "over") t = `${name(s.winner!)} held the page`;
    else if (res || lapse) t = "";
    else if (isBot(s.current)) t = `${who} is lining up…`;
    else if (sending) t = sending.to !== undefined ? "how many go?" : sending.from !== undefined ? "…to another of your camps" : "drag from one of your camps to another";
    else if (aim) t = pull(aim).live ? `let go to ${turn.verb(s, kind)}` : "pull back further…";
    else if (c0?.chain) t = "he lunges again, or stop";
    else if (selected !== undefined) t = `pull back from anywhere, let go`;
    else if (c0 && c0.left > 1) t = `${who}: ${c0.left} flicks this turn`;
    else t = lastNote ? `${lastNote}` : `${who}: pick up a soldier`;
  }
  $("#status").textContent = t;
  $("#status").classList.toggle("tap", t === RESEND);
}

// --- flow -------------------------------------------------------------------

function pageStamp() {
  const no = +(localStorage.getItem("pft:pageNo") ?? 0) + 1;
  localStorage.setItem("pft:pageNo", String(no));
  const d = new Date();
  return { no, date: `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`, theme: currentTheme() };
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
  lapse = null;
  lapseDue = null;
  sending = null;
  dragging = null;
  fx.clear();
  inkTL.clear();
  sfx.creak(0);
  // a different page is about to be on the desk: draw it even if nothing moves
  dirty = true;
}

function start(m: Mode, size: Size = pickedSize()) {
  reset();
  restoreKindBar();
  s = newGame(size, undefined, pageStamp());
  mode = m;
  kind = "snipe";
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
  applyTheme(paperOf(v.s.page)); // back on the paper it was started on
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
  if (mode.kind === "room" && (link?.queued || remote(s.current))) return roomNext();
  const c0 = core();
  if (!isBot(s.current)) {
    link?.waiting(false);
    if (s.phase === "play") {
      fx.add("hint", T, 150, 620, "out");
      // an earned lunge: he's already in hand
      if (c0?.chain) { kind = "lunge"; select(c0.chain.soldier); }
    }
    if (s.phase === "position" && !taught("arrange")) fx.add("teach", T, 300, 1100, "linear");
    busy = false;
    hud();
    return;
  }
  busy = true;
  hud();
  const level = (mode as { level: Level }).level;
  if (s.phase === "setup") {
    after(650, () => {
      const spot = botBase(s as GameState, (x, y) => !turn.canPlaceBase(s, x, y));
      if (spot) drawBase(spot.x, spot.y);
      after(900, () => { busy = false; next(); });
    });
    return;
  }
  if (s.phase === "position" && c0) return botArranges(c0);
  after(500, () => {
    const a = turn.botMove(s, level, (Math.random() * 2 ** 32) >>> 0);
    if (a.t === "send") return botSends(a);
    if (a.t === "stop") { lastNote = `${name(s.current)} stopped`; return perform(a, () => { busy = false; next(); }); }
    if (a.t !== "flick") return;
    const { t: _t, ...f } = a;
    void _t;
    showFlick(f);
  });
}

// Someone else's flick, played out: the pen goes down on the soldier, pulls
// back, and lets go. You watch from above, the way you'd lean over a friend's.
function showFlick(f: Flick) {
  selected = f.soldier;
  kind = f.kind;
  sfx.pick();
  penDrop = T;
  hud();
  const power = turn.powerOfFlick(s, f);
  after(650, () => {
    botAim = { soldierId: f.soldier, angle: f.angle, power, t0: T };
    after(900, () => {
      const pw = botAim?.power ?? 0.5;
      const lean = penLean(pw);
      botAim = null;
      fire(f, pw, lean);
    });
  });
}

// The bot arranges its men: they walk to their spots together, then it's done.
function botArranges(c0: GameState) {
  const moves = botArrange(c0, (Math.random() * 2 ** 32) >>> 0).filter((a): a is Extract<Action, { t: "arrange" }> => a.t === "arrange");
  after(500, () => {
    const walkers: Walk[] = [];
    for (const a of moves) {
      const x = c0.soldiers[a.soldier];
      const from = { x: x.x, y: x.y };
      try { act(c0, a); } catch { continue; }
      walkers.push({ id: a.soldier, from, to: { x: a.x, y: a.y } });
      fx.add(`d${a.soldier}`, T, 1e9, 1);
    }
    lapseDue = { walkers, marks: [], out: 0, home: 0 };
    runLapse(() => after(300, () => { act(c0, { t: "ready" }); save(); handOver(); }));
  });
}

// The bot draws its send in pencil, then gets on with its flick.
function botSends(a: Extract<Action, { t: "send" }>) {
  const c0 = core()!;
  const from = c0.bases[a.from], to = c0.bases[a.to];
  sending = { from: a.from };
  arrowTo = { x: from.x, y: from.y };
  const t0 = T;
  // the pencil goes from camp to camp
  const draw = () => {
    if (!sending) return;
    const k = Math.min(1, (T - t0) / 600);
    arrowTo = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    dirty = true;
    if (k < 1) after(16, draw);
  };
  draw();
  after(900, () => {
    sending = null;
    arrowTo = null;
    lastNote = `${name(s.current)} sent ${a.n}`;
    perform(a, () => after(300, () => { busy = false; next(); }));
  });
}

/**
 * Apply a non-flick action and show what it did: a send ordered, a turn
 * handed over (with any convoys marching), a soldier arranged. Then `then`.
 */
function perform(a: Action, then: () => void) {
  const c0 = core();
  if (!c0) return then();
  const before = c0.soldiers.map((x) => ({ x: x.x, y: x.y }));
  const first = c0.marks.length;
  const o = act(c0, a);
  save();
  if (a.t === "send") { sfx.scratch(0.4, 0.3, 1800); cue("send", a.n); }
  holdLapse(o, before, first);
  hud();
  if (o.handover) return runLapse(() => handOver());
  then();
}

// Anything that marched as the pen changed hands: hold its new dots and
// footprints back, to be shown as a time-lapse before the next go.
function holdLapse(o: Outcome, before: Pt[], first: number) {
  const c0 = core();
  if (!c0 || (!o.walked.length && !o.arrived.length)) return;
  const convoys = new Set([...o.walked, ...o.arrived]);
  const walkers: Walk[] = [];
  let out = 0, home = 0;
  for (const c of c0.convoys) {
    if (!convoys.has(c.id)) continue;
    for (const id of c.ids) {
      const x = c0.soldiers[id], b = before[id];
      if (!x.alive || (b.x === x.x && b.y === x.y)) continue;
      walkers.push({ id, from: b, to: { x: x.x, y: x.y } });
      if (o.walked.includes(c.id)) out++; else home++;
    }
  }
  const ids = new Set(walkers.map((w) => w.id));
  const marks: number[] = [];
  for (let i = first; i < c0.marks.length; i++) {
    const m = c0.marks[i];
    if (m.t === "walk" || (m.t === "cross" && m.kind === "moved" && m.id !== undefined && ids.has(m.id))) marks.push(i);
  }
  for (const w of walkers) fx.add(`d${w.id}`, T, 1e9, 1);
  for (const i of marks) fx.add(`m${i}`, T, 1e9, 1);
  lapseDue = { walkers, marks, out, home };
}

// The march itself: footprints drawn on, each man walking his way.
function runLapse(then: () => void) {
  const due = lapseDue;
  lapseDue = null;
  if (!due || !due.walkers.length) return then();
  const quick = screen === "replay" ? 0.5 : 1;
  const dur = (reduced ? 350 : 1100) * quick;
  const c0 = core()!;
  for (const i of due.marks) {
    const m = c0.marks[i];
    fx.add(`m${i}`, T, m.t === "walk" ? 0 : 60, m.t === "walk" ? dur : 150, m.t === "walk" ? "linear" : "out");
  }
  for (const w of due.walkers) fx.add(`d${w.id}`, T, 0, dur);
  lapse = { walkers: due.walkers, t0: T, dur };
  sfx.scratch(dur / 1000 / speed, 0.12, 900);
  if (screen === "game") {
    if (due.out) cue("walk-out", due.out);
    if (due.home) cue("arrive", due.home);
  }
  busy = true;
  hud();
  after(dur + 80, () => { lapse = null; dirty = true; then(); });
}

// Lean in low to the pen to aim. Everything else is watched from above.
function sitOn(p: Pt, fy = 0.66) {
  if (cam.tiltScale > 0) cam.sit(p, 2.1, 0.55, fy);
  else cam.sit(p, 2, 0, 0.55);
}

// The circle goes round, then the soldiers are jotted in, one tap each.
function drawBase(x: number, y: number, quick = 1) {
  turn.placeBase(s, x, y);
  const b = s.bases[s.bases.length - 1];
  hud();
  fx.add(`b${b.id}`, T, 0, 380 * quick, "out");
  sfx.circle();
  const dots = s.soldiers.slice(-turn.perBase(s));
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
    if (slow) cam.snap(); // a struggling phone skips the spin
    sfx.turnPage();
    haptic("turn");
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
  const first = s.marks.length; // the flick appends its stroke, then its crosses
  const before = s.soldiers.map((x) => ({ x: x.x, y: x.y }));
  const o = turn.flick(s, f);
  save();
  selected = undefined;
  aim = null;
  busy = true;
  sfx.creak(0);
  // convoys marching as the pen changes hands wait for the ink to land
  holdLapse(o, before, first);
  const held = new Set(lapseDue?.marks ?? []);
  const quick = opts.quick ?? 1;
  const len = pathLen(o.path);
  const dur = Math.min(900, Math.max(300, 220 + len * 0.42)) * quick;
  const n = o.path.length - 1;
  inkTL.clear();
  inkTL.add(`m${first}`, 0, 0, dur, "out2");
  const over = s.phase === "over";
  const kills: Resolve["kills"] = [];
  const snags: Snag[] = [];
  const moments: Resolve["moments"] = [];
  const live = opts.cam ?? true; // replays are watched, not felt
  let lastKill = -1;
  for (let i = first + 1; i < s.marks.length; i++) if (s.marks[i].t === "cross" && (s.marks[i] as { kind: string }).kind === "kill") lastKill = i;
  const killCount = s.marks.slice(first + 1).filter((m) => m.t === "cross" && m.kind === "kill").length;
  for (let i = first + 1; i < s.marks.length; i++) {
    const m = s.marks[i];
    if (held.has(i)) continue;
    if (m.t === "stand") {
      // their comrades are gone: the last few are ringed once the crosses are down
      const at = dur + 380 * quick;
      inkTL.add(`m${i}`, 0, at, 500 * quick);
      moments.push({ at, fn: () => { sfx.scratch(0.5, 0.35, 1600); if (live) cue("last-stand", m.owner); } });
      continue;
    }
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
  if (o.crashed !== undefined) {
    // he lands among their men, and they shoot him where he stands
    const base = o.crashed;
    moments.push({ at: dur + 20 * quick, fn: () => { sfx.snag(true); sfx.cross(0.03, 1.1); if (live) { cam.shake(7); cue("lunge-death", base); } } });
  }
  if (o.earned && live) moments.push({ at: dur, fn: () => cue("earned", core()?.left ?? 0) });
  const pen = opts.pen ?? true;
  const penTail = pen ? 900 * quick : 0;
  res = {
    f, o, owner: who, power, t0: T, dur, snags, kills, first, moments,
    mover: f.kind === "lunge" ? f.soldier : undefined,
    end: Math.max(dur + penTail, dur + 330 * quick) + 60,
    pen, cam: opts.cam ?? true, startLean: lean, startAngle: f.angle,
    done: () => {
      lastNote = noteFor(who, f, o);
      if (screen === "replay") return runLapse(replayNext);
      if (s.phase === "over") return next();
      if (o.again) { busy = false; return next(); }
      runLapse(() => handOver());
    },
  };
  // straight back up to a bird's-eye view to watch the ink land
  if (opts.cam ?? true) cam.overview();
  sfx.slip(power);
  sfx.stroke(dur / 1000 / speed + 0.05, f.kind === "snipe" ? 0.6 : 0.45);
  hud();
}

// What the status line says after a flick.
function noteFor(who: Player, f: Flick, o: Outcome) {
  const k = o.killed.length;
  const v = turn.verb(s, f.kind);
  const c0 = core();
  if (o.crashed !== undefined) return k ? `${name(who)}'s lunger took ${k}, landed among them, and was shot` : `${name(who)}'s lunger landed among them and was shot`;
  if (o.lost) return `${name(who)} flicked a soldier off the page`;
  const stood = o.stood.length ? ` · ${o.stood.map((p) => name(p)).join(" and ")}: the last ${c0?.rules.lastStandAt ?? 4}, two flicks a turn` : "";
  if (o.earned && f.kind === "snipe") return `two with one: ${name(who)} flicks again${stood}`;
  if (o.earned) return `${name(who)}'s lunger took ${k}: lunge again or stop${stood}`;
  if (k) return `${name(who)}'s ${v === "shoot" ? "shot" : v === "move" ? "run" : v} crossed out ${k}${stood}`;
  return (f.kind === "lunge" ? `${name(who)} ${v === "move" ? "moved" : "lunged"}` : `${name(who)} missed`) + stood;
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

// Per frame while a flick resolves: land the crosses on time.
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
    // replays are watched, not felt
    if (r.cam) { cam.shake(k.last ? 9 : 4); haptic(k.last ? "over" : "kill", r.kills.filter((x) => x.hit).length); }
  }
  for (const m of r.moments) if (!m.done && it >= m.at) { m.done = true; m.fn(); }
  if (!r.settled && it >= r.dur) { r.settled = true; if (r.pen && !away(r.owner)) haptic("land"); }
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
    if (mode.kind === "room") link?.stop();
    else localStorage.removeItem("pft:save");
  }
  // the page is turned square to the desk, the way it will be filed
  cam.overview();
  cam.turnTo(0);
  after(500, () => {
    dawn.go(1, 2600);
    sfx.birds();
  });
  after(1500, () => { fx.add("sign", T, 0, 1500, "linear"); sfx.stroke(1.2, 0.3, 2800); });
  after(3400, () => { busy = false; if (screen === "game") { viewBar(); showOver(); } });
  void w;
}

// --- title: the exercise book's cover --------------------------------------

let botLevel = (+(localStorage.getItem("pft:lvl") ?? 1) as Level);

// Quick battle's size: Quick, Classic, or Custom (bases and soldiers per base).
let sizeName: Size["name"] = (["quick", "classic", "custom"] as const).find((k) => k === localStorage.getItem("pft:size")) ?? "quick";
const custom = (() => {
  const v = (localStorage.getItem("pft:custom") ?? "").split("x").map(Number);
  const ok = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max;
  return { bases: ok(v[0], CUSTOM.bases) ? v[0] : 4, soldiers: ok(v[1], CUSTOM.soldiers) ? v[1] : 8 };
})();
const pickedSize = () => sizeFor(sizeName, custom);

function sizeRow() {
  const one = (k: Size["name"], label: string, sub: string) => `<button data-size="${k}" class="${sizeName === k ? "on" : ""}"><b>${label}</b><small>${sub}</small></button>`;
  const step = (k: "bases" | "soldiers", label: string) =>
    `<span class="step"><button data-step="${k}" data-d="-1" aria-label="fewer ${label}">−</button><b>${custom[k]}</b><button data-step="${k}" data-d="1" aria-label="more ${label}">+</button><small>${label}</small></span>`;
  return `<p class="sizes">${one("quick", "quick", `${SIZES.quick.bases} × ${SIZES.quick.soldiers}`)}${one("classic", "classic", `${SIZES.classic.bases} × ${SIZES.classic.soldiers}`)}${one("custom", "custom", `${custom.bases} × ${custom.soldiers}`)}</p>
    ${sizeName === "custom" ? `<p class="custom">${step("bases", "camps")}${step("soldiers", "men each")}</p>` : ""}`;
}

// The desk under the cover: the page you're on if it's on today's paper, or a clean sheet of it.
function titleDesk(saved = load()) {
  if (saved && paperOf(saved.s.page) === currentTheme()) { s = saved.s; mode = saved.mode; } else { s = newGame(SIZES.quick, 1); mode = { kind: "pnp" }; }
  cam.overview(rotFor(s.current));
  cam.snap();
  dirty = true;
}

function showTitle() {
  screen = "title";
  leaveRoom();
  restoreLabel();
  reset();
  applyTheme(homeTheme());
  closeSheet();
  restoreKindBar();
  dawn.set(0);
  coverMenu();
  const cover = $("#cover");
  cover.hidden = false;
  cover.classList.remove("open");
  // the lamp comes on
  if (lampOn.to < 1) after(450, switchOn);
}

// The slip tucked in the cover, and the page on the desk under it.
function coverMenu() {
  const saved = load();
  const d = drawer();
  titleDesk(saved);
  hud();
  const canResume = saved && saved.s.phase !== "over";
  // a page started on another paper says so
  const elsewhere = saved && paperOf(saved.s.page) !== currentTheme() ? ` · ${themeOf(saved.s.page?.theme).name.toLowerCase()}` : "";
  const menu = $("#cover .menu");
  const where = (x: AnyState) => x.phase === "setup" ? "still drawing camps" : x.phase === "position" ? "arranging the men" : `turn ${x.turn}, ${turn.aliveOf(x, 0).length} v ${turn.aliveOf(x, 1).length}${turn.isLegacy(x) ? " · first rules" : ""}`;
  const draw = () => {
    menu.innerHTML = `
    ${canResume ? `<button data-a="resume" class="ink blue">carry on ${saved!.s.page ? `page ${saved!.s.page.no}` : "this page"}<small>${where(saved!.s)}${elsewhere}</small></button>` : ""}
    <p class="head">quick battle</p>
    ${sizeRow()}
    <button data-a="bot" class="ink red">play Dawood-bot</button>
    <p class="levels">${LEVELS.map((l, i) => `<button data-lvl="${i}" class="${i === botLevel ? "on" : ""}">${l}</button>`).join("")}</p>
    <button data-a="pnp" class="ink blue">pass &amp; play<small>two of you, one phone</small></button>
    <button data-a="friend" class="ink blue">play a friend<small>send a link: each on your own phone</small></button>
    ${friendsList()}
    <p class="row">
      <button data-a="drawer" class="pencil">the drawer${d.length ? ` (${d.length})` : ""}</button>
      <button data-a="how" class="pencil">how it's played</button>
      <a href="/rules" class="pencil">the rulebook</a>
      <button data-a="settings" class="pencil">settings</button>
    </p>`;
  };
  draw();
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
    else if (a === "friend") newRoomOnCover();
    else if (b.dataset.room) { const x = readRoom(localStorage, b.dataset.room); if (x) enterRoom(x); }
    else if (b.dataset.lvl) {
      botLevel = +b.dataset.lvl as Level;
      localStorage.setItem("pft:lvl", String(botLevel));
      for (const x of menu.querySelectorAll<HTMLElement>("[data-lvl]")) x.classList.toggle("on", x === b);
    } else if (b.dataset.size) {
      sizeName = b.dataset.size as Size["name"];
      localStorage.setItem("pft:size", sizeName);
      draw();
    } else if (b.dataset.step) {
      const k = b.dataset.step as "bases" | "soldiers";
      const r = CUSTOM[k];
      custom[k] = Math.max(r.min, Math.min(r.max, custom[k] + +b.dataset.d!));
      localStorage.setItem("pft:custom", `${custom.bases}x${custom.soldiers}`);
      draw();
    }
  };
}

function switchOn() {
  sfx.lamp();
  const kind = theme.light.switch;
  if (kind === "day") lampOn.go(1, 700); // daylight: the room just brightens
  else if (kind === "tube") {
    // a tube light: blinks twice on its starter, then catches
    lampOn.go(0.55, 30);
    after(60, () => lampOn.go(0.08, 40));
    after(210, () => lampOn.go(0.65, 30));
    after(270, () => lampOn.go(0.12, 50));
    after(430, () => lampOn.go(1, 80));
  } else {
    // a lamp's flicker: on, off, on
    lampOn.go(0.75, 40);
    after(70, () => lampOn.go(0.15, 50));
    after(160, () => lampOn.go(1, 180));
  }
  document.body.classList.add("lit");
}

function closeCover() {
  const c = $("#cover");
  if (c.hidden) return;
  c.classList.add("open");
  sfx.rustle();
  haptic("turn");
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
      <li>Take turns drawing camps, each jotted full of men. Then arrange your men: in camp, or just outside the wall.</li>
      <li>On your go, pick up one soldier. Pull back from anywhere on the screen and let go, like flicking a pen stood on its tip.</li>
      <li><b>Snipe</b>: he stays put and the ink goes through every enemy it crosses. Walls and bodies sap it. Take two with one line and you flick again.</li>
      <li><b>Lunge</b>: he runs along his ink and crosses out whoever he passes. A kill earns him another lunge, shakier each time. Land among a camp's men and they shoot him; an empty camp is safe; off the page, he's gone.</li>
      <li><b>Send</b>, free, once a turn: up to five men walk to another of your camps. They're out on the open page for one enemy turn.</li>
      <li>Down to your last four, you flick twice a turn, steadier.</li>
      <li>Nothing is ever rubbed out. Cross out every enemy to win.</li>
    </ol>
    <p class="fine">Pinch to zoom · tap <b>page</b> to stand up and see everything. The rulebook has it all, with drawings.</p>
    <a class="act" href="/rules">the rulebook</a>
    <button class="act" data-a="back">back</button>`).onclick = (e) => {
    if ((e.target as HTMLElement).closest("button")) { closeSheet(); }
  };
}

// A swatch of a theme's paper: a corner of the sheet with a camp and a flick on it.
function swatch(id: string, w = 66, h = 88) {
  const c = document.createElement("canvas");
  const k = Math.min(2, dpr);
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext("2d")!;
  withTheme(id, () => {
    const sc = (w * k) / 300;
    g.setTransform(sc, 0, 0, sc, -20 * sc, -10 * sc);
    drawPaper(g, newGame(SIZES.quick, 1, { no: 1, date: "" }));
    g.globalCompositeOperation = inkLib.inkOp();
    const t = theme;
    inkLib.inkCircle(g, 190, 250, 58, t.ink.pens[0], 11, 3.4 * t.ink.width);
    for (let i = 0; i < 6; i++) inkLib.inkDot(g, 172 + (i % 3) * 18, 236 + Math.floor(i / 3) * 26, 8, t.ink.pens[0], 40 + i);
    inkLib.inkFlick(g, [{ x: 250, y: 380 }, { x: 222, y: 300 }, { x: 196, y: 238 }], t.ink.pens[1], 5, 4.4 * t.ink.width);
    inkLib.inkCross(g, 190, 250, 16, t.ink.pens[1], 3, 3.2 * t.ink.width);
  });
  return c;
}

function showSettings() {
  const row = (k: string, on: boolean, label: string, hint: string) =>
    `<button class="toggle ${on ? "on" : ""}" data-set="${k}"><b>${label}</b><i>${hint}</i></button>`;
  const chosen = chosenTheme();
  const room = roomTheme();
  const card = sheet(`
    <h2>Settings</h2>
    ${row("tilt", settings.tilt, "sit down to aim", "the camera drops low behind your soldier")}
    ${row("handoff", settings.handoff, "pause between turns", "pass & play: tap before the next go")}
    ${row("sound", !sfx.muted, "sound", "pen, paper, lamp")}
    ${haptics.supported ? row("haptics", haptics.enabled, "haptics", "the pen felt under your thumb") : ""}
    <h3>Paper</h3>
    ${row("surprise", !chosen, "a surprise each time", chosen ? `always the ${themeOf(chosen).name.toLowerCase()}` : "a different book every time you open it")}
    <div class="papers" role="radiogroup" aria-label="Paper"></div>
    ${room ? `<p class="fine">This room is on the ${themeOf(room).name.toLowerCase()}: a room is one sheet, so its paper wins. Your pick is kept for later.</p>` : ""}
    <button class="act" data-a="back">done</button>`, "settings");
  const papers = card.querySelector(".papers")!;
  for (const t of THEMES) {
    const b = document.createElement("button");
    b.className = `paper${t.id === chosen ? " on" : ""}${t.id === currentTheme() ? " here" : ""}`;
    b.dataset.theme = t.id;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(t.id === chosen));
    b.title = t.blurb;
    b.appendChild(swatch(t.id));
    const cap = document.createElement("span");
    cap.textContent = t.name;
    b.appendChild(cap);
    papers.appendChild(b);
  }
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.tap();
    const k = b.dataset.set;
    if (b.dataset.theme || k === "surprise") {
      const id = b.dataset.theme ?? null;
      // tapping your pick again, or "surprise", goes back to a surprise each load
      chooseTheme(id && id !== chosen ? id : null);
      if (screen === "title") coverMenu(); // the desk and the slip follow the new paper
      sfx.rustle();
    } else if (k === "sound") sfx.setMuted(!sfx.muted);
    else if (k === "haptics") { haptics.setEnabled(!haptics.enabled); haptic("tap"); }
    else if (k === "tilt" || k === "handoff") {
      settings[k] = !settings[k];
      localStorage.setItem(`pft:${k}`, settings[k] ? "1" : "0");
      applyTilt();
    } else if (b.dataset.a === "back") return closeSheet();
    // re-draw after this click has finished: on iPhone the tick is the tapped
    // label's own default action, which needs its switch still in the page
    setTimeout(showSettings);
  };
}

function showHandoff() {
  const nextP = s.current;
  // a real button, so an iPhone's tap-only haptics have a switch label to land on
  const card = sheet(`
    <button type="button" class="handoff-tap">
      <p class="sub">${lastNote}</p>
      <h2 style="color:${hudPen(nextP)}">Your pen, ${name(nextP)}</h2>
      <p class="fine">tap when you've got it</p>
    </button>`, "handoff");
  sfx.rustle();
  // only the card goes on: it's the button wearing the iPhone's switch label
  const go = card.querySelector<HTMLButtonElement>(".handoff-tap")!;
  go.onclick = () => {
    go.onclick = null;
    haptic("tap");
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
    <h2 style="color:${hudPen(w)}">${name(w)} held the page.</h2>
    <p class="stats">${s.turn} turns · ${metres.toFixed(1)} ${theme.ink.tool === "pencil" ? "metres of lead" : "metres of ink"} · ${([0, 1] as Player[]).map((p) => `<span style="color:${hudPen(p)}">${name(p)} crossed out ${crossed(p)}</span>`).join(" · ")}</p>
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
  // on its own paper, whatever today's is
  withTheme(paperOf(r.page), () => drawPageInto(c.getContext("2d")!, st, sc, r));
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
    const names = themeOf(r.page?.theme).ink.names;
    const who = r.mode.kind === "bot" ? [names[0], "Dawood-bot"] : names;
    const cap = document.createElement("span");
    cap.innerHTML = `No. ${r.page?.no ?? "?"} · ${r.page?.date ?? ""}<br><b style="color:${hudPen(r.winner ?? 0)}">${r.winner !== undefined ? who[r.winner] : "unfinished"}</b> · ${r.turns} turns`;
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
  applyTheme(paperOf(r.page));
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
  kindEl.innerHTML = `<button data-kind="lunge" role="radio"><b>lunge</b><i></i></button><button data-kind="snipe" role="radio"><b>snipe</b><i></i></button>`;
  bindKind();
}

// The whole war, drawn again: the page fills itself in, move by move.
let replayQueue: Step[] = [];
function replay(r: Filed) {
  reset();
  applyTheme(paperOf(r.page));
  closeSheet();
  viewing = r;
  mode = r.mode;
  s = blank(r);
  screen = "replay";
  cam.overview(0);
  cam.snap();
  dawn.go(0, 600);
  replayQueue = steps(r);
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
  if (st.t === "legacy-base" || st.t === "base") { drawBase(st.x, st.y, 0.45); after(560, replayNext); }
  else if (st.t === "legacy-flick") fire({ soldier: st.f.soldierId, kind: st.f.kind === "shoot" ? "snipe" : "lunge", angle: st.f.angle, length: st.f.length, bend: st.f.bend, wob: 0 }, 0.5, 0, { pen: false, cam: false, quick: 0.5 });
  else if (st.t === "flick") { const { t: _t, ...f } = st; void _t; fire(f, 0.5, 0, { pen: false, cam: false, quick: 0.5 }); }
  else {
    // arranging, sends and stops: the page shows what they did, briefly
    const c0 = core()!;
    const before = c0.soldiers.map((x) => ({ x: x.x, y: x.y }));
    const first = c0.marks.length;
    const o = act(c0, st);
    if (st.t === "arrange") { dirty = true; return void after(30, replayNext); }
    holdLapse(o, before, first);
    runLapse(() => after(st.t === "ready" ? 200 : 120, replayNext));
  }
  hud();
}

// --- rooms: one page, two phones, a link sent on WhatsApp ----------------------------

const roomApi = httpApi();
let link: RoomLink | null = null;
let roomDrift = 0; // the move from which our page stopped matching theirs (0: never)
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cleanName = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 24);
const RESEND = "tap here to send the link again";

// Every save in a room: whatever is on our page past what the link knows is
// ours (the other side's moves are counted as drawn before they're applied),
// so post it. The last carries a hash of the page, for drift.
function roomSave() {
  const l = link, c0 = core();
  if (!l || !c0) return;
  const mine = c0.actions.slice(l.data.applied + l.data.pending.length);
  mine.forEach((a, i) => l.push(i === mine.length - 1 ? { a, h: roomHash(c0) } : { a }));
  l.save({ turn: c0.turn, next: roomTurn(c0), winner: c0.winner });
}

function leaveRoom() {
  if (!link) return;
  link.stop();
  link = null;
  setRoomTheme();
  if (location.pathname.startsWith("/r/")) history.replaceState(null, "", "/");
}

function openLink(d: RoomSaved) {
  link?.stop();
  link = new RoomLink(d, {
    api: roomApi,
    storage: localStorage,
    hidden: () => document.hidden,
    onNews: () => {
      hud();
      if (screen === "game" && !busy && !res && link?.queued) next();
    },
    onDiverged: () => {
      // our move lost a race (the same seat on another device, say): take the server's page
      const l = link!;
      reset();
      s = roomReplay(l.data.setup as Setup, l.data.log.slice(0, l.data.applied)).s;
      lastNote = "your last move didn't make it: the page had moved on";
      hud();
      next();
    },
  });
  return link;
}

function enterRoom(d: RoomSaved) {
  reset();
  roomDrift = 0;
  restoreKindBar();
  closeCover();
  closeSheet();
  const l = openLink(d);
  mode = { kind: "room", code: d.code };
  const r = roomReplay(d.setup as Setup, d.log.slice(0, d.applied));
  const c0 = r.s;
  s = c0;
  if (r.bad !== undefined) l.broken = "this page doesn't add up: one copy of it is different";
  if (r.drift !== undefined) roomDrift = r.drift + 1;
  for (const p of d.pending) if (d.seat !== null && !roomCheck(c0, d.seat, p)) roomApply(c0, p as Payload);
  kind = "snipe";
  screen = "game";
  viewing = null;
  cam.overview(rotFor(s.current));
  cam.snap();
  dawn.set(s.phase === "over" && !l.queued ? 1 : 0);
  setRoomTheme(d.theme);
  if (location.pathname !== `/r/${d.code}`) history.replaceState(null, "", `/r/${d.code}`);
  save();
  l.start();
  hud();
  if (s.phase === "over" && !l.queued) { viewBar(); return void after(400, showOver); }
  after(300, next);
}

// The other side's go: draw what has come down the link, or wait for it.
function roomNext() {
  const l = link!;
  const e = l.peek();
  if (!e) {
    busy = false;
    l.waiting(true);
    fx.add("note", T, 300, 1300, "linear");
    hud();
    return;
  }
  const c0 = core()!;
  const p = e.a as Payload;
  // try it on a copy first: is it legal here, and does our page come out as theirs did?
  const sim = roomCheck(c0, e.seat, p) ? null : structuredClone(c0);
  try { if (sim) roomApply(sim, p); } catch { /* treated as broken below */ }
  if (!sim || sim.actions.length !== c0.actions.length + 1) {
    l.broken = "this page doesn't add up: one copy of it is different";
    l.stop();
    busy = false;
    return hud();
  }
  if (roomDrift === 0 && roomDrifted(sim, p)) { roomDrift = c0.actions.length + 1; console.warn("room: page drifted at move", roomDrift); }
  busy = true;
  l.waiting(false);
  hud();
  const a = p.a;
  const then = () => { busy = false; next(); };
  if (a.t === "arrange") return remoteArranges();
  l.drawn();
  if (a.t === "base") after(400, () => { drawBase(a.x, a.y); after(900, then); });
  else if (a.t === "flick") { const { t: _t, ...f } = a; void _t; after(300, () => showFlick(f)); }
  else if (a.t === "send") botSends(a);
  else if (a.t === "stop") { lastNote = `${name(s.current)} stopped`; perform(a, then); }
  else perform(a, then);
}

// Their men walk to where they arranged them, all together.
function remoteArranges() {
  const l = link!, c0 = core()!;
  const walkers: Walk[] = [];
  for (let e = l.peek(); e && (e.a as Partial<Payload> | null)?.a?.t === "arrange" && !roomCheck(c0, e.seat, e.a); e = l.peek()) {
    const a = (e.a as Payload).a as Extract<Action, { t: "arrange" }>;
    const x = c0.soldiers[a.soldier];
    const from = { x: x.x, y: x.y };
    l.drawn();
    act(c0, a);
    walkers.push({ id: a.soldier, from, to: { x: a.x, y: a.y } });
    fx.add(`d${a.soldier}`, T, 1e9, 1);
  }
  save();
  lapseDue = { walkers, marks: [], out: 0, home: 0 };
  after(300, () => runLapse(() => after(200, () => { busy = false; next(); })));
}

// Pencilled on the page, at your end of it, while the other side has the pen.
function waitNote(): string | null {
  const l = link;
  if (screen !== "game" || !l || l.broken || s.phase === "over" || busy || res || !remote(s.current)) return null;
  if (l.seat === null) return `${name(s.current)}'s go…`;
  if (l.names[1] === null) return "waiting for your friend to open the link…";
  return `waiting for ${name(s.current)}…`;
}

// The line under the page, when a room has something to say; null to fall through.
function roomStatus(): string | null {
  const l = link;
  if (mode.kind !== "room" || !l) return null;
  if (l.broken) return l.broken;
  if (roomDrift) return `careful: your page and theirs differ slightly from move ${roomDrift}`;
  if (l.offline) return l.data.pending.length ? "no signal: your move goes when it can" : "no signal: still trying…";
  if (s.phase === "over" || res || !remote(s.current)) return null;
  const who = name(s.current);
  if (busy) return s.phase === "setup" ? `${who} is drawing a camp…` : s.phase === "position" ? `${who} is arranging…` : `${who} is lining up…`;
  if (l.seat === 0 && l.names[1] === null) return RESEND;
  if (l.seat === null) return `watching ${name(0)} v ${name(1)}`;
  return lastNote;
}

function showShare() {
  const l = link;
  if (!l) return;
  const me = l.names[l.seat ?? 0];
  const text = `${me} challenges you to ${GAME.name}, a pen-flick war on the back page of an exercise book. Your red pen's waiting:`;
  const card = sheet(`
    <p class="sub">page ${s.page?.no ?? ""} is on the desk</p>
    <h2>Send it to your friend</h2>
    <p class="link">${esc(l.url)}</p>
    <button class="act" data-a="send">send the link</button>
    <button class="act" data-a="copy">copy it</button>
    <button class="act red" data-a="back">${s.bases.length === 0 && l.seat === 0 ? "draw your first camp" : "back to the page"}</button>
    <p class="fine">They open it, write their name and take the red pen. You go first; they can come later.</p>`, "share");
  card.onclick = async (e) => {
    const a = (e.target as HTMLElement).closest("button")?.dataset.a;
    if (!a) return;
    sfx.tap();
    if (a === "back") return closeSheet();
    if (a === "send" && navigator.share) {
      try { await navigator.share({ title: GAME.name, text, url: l.url }); closeSheet(); } catch { /* they changed their mind */ }
      return;
    }
    const btn = card.querySelector<HTMLElement>('[data-a="copy"]')!;
    try {
      await navigator.clipboard.writeText(`${text} ${l.url}`);
      btn.textContent = "copied: paste it in a chat";
    } catch {
      getSelection()?.selectAllChildren(card.querySelector(".link")!);
      btn.textContent = "press and hold the link to copy it";
    }
  };
}

// On the cover: your name goes on the label, in pencil.
function nameOnLabel(): HTMLInputElement {
  const old = $("#cover .label input");
  if (old) return old as HTMLInputElement;
  const input = document.createElement("input");
  input.className = "hand pencil-in";
  input.maxLength = 24;
  input.placeholder = "your name";
  input.setAttribute("autocomplete", "nickname");
  input.enterKeyHint = "go";
  input.value = localStorage.getItem("pft:name") ?? "";
  $("#cover .label .field b").replaceWith(input);
  return input;
}
function restoreLabel() {
  $("#cover .label input")?.replaceWith(Object.assign(document.createElement("b"), { className: "hand blue", textContent: "Dawood" }));
}
function coverNote(t: string) {
  const menu = $("#cover .menu");
  let n = menu.querySelector(".note");
  if (!n) { n = document.createElement("p"); n.className = "note"; menu.prepend(n); }
  n.textContent = t;
}

function friendsList() {
  const rs = listRooms(localStorage).slice(0, 4);
  if (!rs.length) return "";
  return `<p class="friends"><span>games with friends</span>${rs.map((r) => {
    const foe = r.seat === null ? `${r.names[0]} v ${r.names[1] ?? "?"}` : r.names[r.seat === 0 ? 1 : 0] ?? "your friend";
    const sm = r.summary;
    const st = !sm ? "" : sm.next === null ? (r.seat === null ? "done" : sm.winner === r.seat ? "you won" : "they won")
      : r.seat === null ? "watching" : sm.next === r.seat ? "your go" : "their go";
    return `<button data-room="${esc(r.code)}" class="pencil">${esc(foe)}${st ? ` · ${st}` : ""}</button>`;
  }).join("")}</p>`;
}

function newRoomOnCover() {
  const input = nameOnLabel();
  const menu = $("#cover .menu");
  menu.innerHTML = `
    <p class="note">write your name on the label</p>
    <button data-a="make" class="ink blue">start a page for two<small>you get a link to send</small></button>
    <p class="row"><button data-a="back" class="pencil">back</button></p>`;
  input.focus();
  const go = async (b: HTMLButtonElement) => {
    const who = cleanName(input.value);
    if (!who) { coverNote("your name first, on the label"); return input.focus(); }
    localStorage.setItem("pft:name", who);
    b.disabled = true;
    coverNote("tearing out a page…");
    try {
      const setup = setupOf(newGame(pickedSize(), undefined, pageStamp()));
      const theme = currentTheme();
      const c = await roomApi.create({ name: who, engine: ENGINE, setup, theme });
      restoreLabel();
      enterRoom({ v: 1, code: c.code, seat: 0, secret: c.secret, engine: ENGINE, setup, theme, names: [who, null], log: [], applied: 0, pending: [], updated: Date.now() });
      showShare();
    } catch (e) {
      b.disabled = false;
      coverNote(e instanceof RoomHttpError ? `the page server said no: ${e.message}` : "can't reach the page server: check your signal and try again");
    }
  };
  const make = menu.querySelector<HTMLButtonElement>('[data-a="make"]')!;
  input.onkeydown = (e) => { if (e.key === "Enter" && !make.disabled) void go(make); };
  menu.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || b.disabled) return;
    sfx.tap();
    if (b.dataset.a === "make") void go(b);
    else if (b.dataset.a === "back") { restoreLabel(); showTitle(); }
  };
}

// Someone opened /r/<code>: back to our seat, or take the free one, or watch.
async function openRoom(code: string) {
  const mine = readRoom(localStorage, code);
  if (mine) return enterRoom(mine);
  const menu = $("#cover .menu");
  const home = (why: string) => { history.replaceState(null, "", "/"); showTitle(); coverNote(why); };
  menu.onclick = null;
  menu.innerHTML = `<p class="note">opening the page…</p>`;
  let v: RoomView;
  try {
    v = await roomApi.read(code);
  } catch (e) {
    return home(e instanceof RoomHttpError && e.status === 404 ? "that page has gone: links last 30 days after the last move" : "couldn't open that page: check your signal and open the link again");
  }
  if (v.engine !== ENGINE) return home("that page needs a newer copy of the game: reload");
  const host = v.names[0];
  const input = v.names[1] === null ? nameOnLabel() : null;
  menu.innerHTML = input ? `
      <p class="note"><b>${esc(host)}</b> challenges you. Write your name on the label.</p>
      <button data-a="take" class="ink red">take the red pen<small>${esc(host)} draws first</small></button>
      <p class="row"><button data-a="watch" class="pencil">just watch</button><button data-a="back" class="pencil">not now</button></p>`
    : `<p class="note">${esc(host)} v ${esc(v.names[1] ?? "")}</p>
      <button data-a="watch" class="ink blue">watch the war<small>both pens are taken</small></button>
      <p class="row"><button data-a="back" class="pencil">back</button></p>`;
  const saved = (seat: RoomSaved["seat"], secret: string | null, names: RoomSaved["names"]): RoomSaved => ({
    v: 1, code, seat, secret, engine: v.engine, setup: v.setup as RoomSaved["setup"], theme: v.theme, names,
    // arriving late, only the last couple of moves are drawn in
    log: v.entries, applied: Math.max(0, v.entries.length - 2), pending: [], updated: Date.now(),
  });
  const take = async (b: HTMLButtonElement) => {
    const who = cleanName(input!.value);
    if (!who) { coverNote("your name first, on the label"); return input!.focus(); }
    localStorage.setItem("pft:name", who);
    b.disabled = true;
    coverNote("picking up the red pen…");
    try {
      const j = await roomApi.join(code, who);
      restoreLabel();
      if (j.seat === null) { enterRoom(saved(null, null, v.names)); lastNote = "someone got to the red pen first: you're watching"; return hud(); }
      enterRoom(saved(j.seat, j.secret, j.seat === 1 ? [host, who] : [who, v.names[1]]));
    } catch (e) {
      b.disabled = false;
      coverNote(e instanceof RoomHttpError ? `the page server said no: ${e.message}` : "can't reach the page server: check your signal and try again");
    }
  };
  if (input) input.onkeydown = (e) => {
    const b = menu.querySelector<HTMLButtonElement>('[data-a="take"]')!;
    if (e.key === "Enter" && !b.disabled) void take(b);
  };
  menu.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || b.disabled) return;
    sfx.unlock();
    sfx.tap();
    const a = b.dataset.a;
    if (a === "back") { restoreLabel(); history.replaceState(null, "", "/"); showTitle(); }
    else if (a === "watch") { restoreLabel(); enterRoom(saved(null, null, v.names)); }
    else if (a === "take") void take(b);
  };
}

$("#status").onclick = () => { if ($("#status").classList.contains("tap")) { sfx.tap(); showShare(); } };
document.addEventListener("visibilitychange", () => { if (!document.hidden) link?.wake(); });
window.addEventListener("focus", () => link?.wake());
window.addEventListener("online", () => link?.wake());

// --- the page as an image -------------------------------------------------------

const exportLayer = new PageLayer();
function drawPageInto(g: CanvasRenderingContext2D, st: AnyState, sc: number, r?: Filed) {
  const sig = signatureFor(st, r?.mode ?? mode);
  exportLayer.sync(st, SETTLED, sc, -1, sig);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(exportLayer.c!, 0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.globalCompositeOperation = "multiply";
  drawYellow(g, st); // on screen the lamp tints it; the kept page carries it
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
    a.download = `${GAME.short.toLowerCase().replace(/\W+/g, "-")}-page-${s.page?.no ?? ""}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}

function signatureFor(st: AnyState, m: Mode) {
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
  | { t: "arrange"; id: number; soldier: number; off: number; sx: number; sy: number }
  | { t: "send"; id: number; from: number }
  | { t: "none" };

const ptrs = new Map<number, Pt>();
let g: Gesture = { t: "none" };
const TAP = 10;

function nearestOwn(w: Pt): number | undefined {
  const z = cam.fitZ * cam.cur.m;
  return pickSoldier(s, w, {
    soldier: Math.max(RULES.soldierRadius * 2.5, 24 / z),
    base: selected === undefined ? Math.max(18, 30 / z) : 0,
  }, (id) => (s.phase === "position" ? true : turn.canFlick(s, id)));
}

/** One of the current player's camps under this point (generous at bird's-eye). */
function ownBaseAt(w: Pt) {
  const z = cam.fitZ * cam.cur.m;
  const slack = Math.max(12, 26 / z);
  let best: number | undefined, bd = Infinity;
  for (const b of s.bases) {
    if (b.owner !== s.current) continue;
    const d = Math.hypot(b.x - w.x, b.y - w.y);
    if (d <= b.r + slack && d < bd) { bd = d; best = b.id; }
  }
  return best;
}

function select(id: number) {
  if (selected !== id) { sfx.pick(); haptic("pickup"); penDrop = T; }
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

const humanTurn = () => screen === "game" && !away(s.current) && !busy && $("#sheet").hidden;

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
  const c0 = core();
  if (humanTurn() && s.phase === "position" && c0 && w) {
    const near = nearestOwn(w);
    if (near !== undefined) {
      // on touch the soldier rides a little above the finger, so you can see where he goes
      const off = e.pointerType === "touch" ? 46 : 0;
      g = { t: "arrange", id: e.pointerId, soldier: near, off, sx: e.clientX, sy: e.clientY };
      sfx.pick();
      return;
    }
  }
  if (humanTurn() && s.phase === "play" && c0 && sending && sending.to === undefined && w) {
    const from = ownBaseAt(w);
    if (from !== undefined && sendMax(c0, from) > 0) {
      sending.from = from;
      arrowTo = w;
      g = { t: "send", id: e.pointerId, from };
      sfx.pick();
      status();
      dirty = true;
      return;
    }
  }
  if (humanTurn() && s.phase === "play" && !sending && w) {
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
  const why = turn.canPlaceBase(s, w.x, w.y);
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
  if (g.t === "arrange" && g.id === e.pointerId) {
    if (!dragging && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < TAP) return;
    const w = cam.toWorld(e.clientX, e.clientY - g.off);
    if (!w) return;
    dragging = { id: g.soldier, at: w, ok: !canArrange(core()!, g.soldier, w.x, w.y) };
    status();
    dirty = true;
    return;
  }
  if (g.t === "send" && g.id === e.pointerId) {
    const w = cam.toWorld(e.clientX, e.clientY);
    if (w) arrowTo = w;
    dirty = true;
    return;
  }
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
      ratchet.reset();
      acts();
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
  if (p.live && !aim.charged) { aim.charged = true; aim.t0 = T; }
  // a ratchet: detents as power builds, tightening toward full
  if (ratchet.step(p.power, p.live) !== null) haptic("notch", p.power);
}
const ratchet = new Ratchet();

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
      haptic("settle"); // our own camp lands under the thumb; the bot's is only seen
      ghost = undefined;
      afterBase();
    }
    ghost = undefined;
    g = { t: "none" };
    status();
    dirty = true;
    return;
  }
  if (g.t === "arrange" && g.id === e.pointerId) {
    const d = dragging;
    dragging = null;
    g = { t: "none" };
    if (d?.ok && e.type === "pointerup" && humanTurn()) {
      learn("arrange");
      sfx.dot();
      perform({ t: "arrange", soldier: d.id, x: d.at.x, y: d.at.y }, () => undefined);
    }
    status();
    dirty = true;
    return;
  }
  if (g.t === "send" && g.id === e.pointerId) {
    g = { t: "none" };
    const c0 = core()!;
    const w = cam.toWorld(p.x, p.y);
    const to = w ? ownBaseAt(w) : undefined;
    if (sending && to !== undefined && to !== sending.from && !canSend(c0, sending.from!, to, 1) && e.type === "pointerup") {
      sending.to = to;
      arrowTo = { x: c0.bases[to].x, y: c0.bases[to].y };
      sfx.tap();
    } else if (sending) { sending.from = undefined; arrowTo = null; }
    hud();
    dirty = true;
    return;
  }
  if (g.t === "aim" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (aim && e.type === "pointerup") {
      updateAim(p.x, p.y);
      const f = release(aim, T, (pw) => turn.lengthFor(s, kind, pw), turn.handFor(s, aim.soldierId, kind));
      const pw = pull(aim).power;
      const lean = penLean(pw);
      aim = null;
      sfx.creak(0);
      if (f && turn.canFlick(s, f.soldier, f.kind)) { learn("aim"); haptic("flick", pw); fire(f, pw, lean); }
      else status("too soft: pull back further");
    } else if (tapped && g.tapOn === undefined) {
      standUp(); // tap on empty paper puts the pen down
    }
    aim = null;
    sfx.creak(0);
    g = { t: "none" };
    acts();
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
      if (core()?.chain && b.dataset.kind !== "lunge") return; // an earned lunge is a lunge
      if (kind !== b.dataset.kind) sfx.tap();
      kind = b.dataset.kind as Kind;
      if (aim) aim.kind = kind;
      hud();
      dirty = true;
    };
  }
}
bindKind();
$("#acts").onclick = (e) => {
  const b = (e.target as HTMLElement).closest("button");
  const c0 = core();
  if (!b || !c0 || !humanTurn()) return;
  sfx.tap();
  const a = b.dataset.act;
  if (a === "ready") return perform({ t: "ready" }, () => handOver());
  if (a === "send") { sending = {}; selected = undefined; cam.overview(); }
  else if (a === "cancel") { sending = null; arrowTo = null; }
  else if (a === "n" && sending?.to !== undefined) {
    const act0: Action = { t: "send", from: sending.from!, to: sending.to, n: +b.dataset.n! };
    sending = null;
    arrowTo = null;
    lastNote = `${name(c0.current)} sent ${act0.n}`;
    busy = true;
    perform(act0, () => { busy = false; next(); });
  } else if (a === "stop") {
    selected = undefined;
    cam.overview();
    busy = true;
    perform({ t: "stop" }, () => { busy = false; next(); });
  }
  hud();
  dirty = true;
};
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
// every button, card and toggle: a light tick as it's pressed (never on pan or scroll)
document.addEventListener("click", (e) => { if (e.isTrusted && (e.target as Element).closest?.("button")) haptic("tap"); }, true);
window.addEventListener("keydown", (e) => {
  if (e.key === "l" || e.key === "m") $<HTMLButtonElement>('#kind [data-kind="lunge"]')?.click();
  if (e.key === "s") $<HTMLButtonElement>('#kind [data-kind="snipe"]')?.click();
  if (e.key === "Escape") { aim = null; sfx.creak(0); if (!busy) standUp(); }
});

// --- frame ------------------------------------------------------------------

let last = performance.now();
const frameTimes: number[] = []; // raw ms between frames, for the dev perf probe
const scriptTimes: number[] = []; // ms of main-thread script per rendered frame (drawing is recorded, not rastered)
let wasLive = false;
// Camera-move frames on this device: if they're struggling, stop spinning the page
// and settle moves faster.
const moveTimes: number[] = [];
let slow = false;
let probeSlow = true; // dev: headless Chrome has no GPU and would always look slow

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
  const moving = cam.tick(dt);
  let active = moving;
  if (moving && !slow && probeSlow) {
    moveTimes.push(frameTimes[frameTimes.length - 1]);
    if (moveTimes.length > 40) moveTimes.shift();
    if (moveTimes.length >= 24) {
      const med = [...moveTimes].sort((a, b) => a - b)[moveTimes.length >> 1];
      if (med > 45) { slow = true; cam.quick = 1.8; }
    }
  }
  if (res) { stepResolve(); active = true; }
  const live = fx.end(T) > T || inkTL.end(0) > 0;
  if (live || wasLive || aim || botAim || lampOn.moving || dawn.moving || T - penDrop < 260) active = true;
  wasLive = live;
  if (aim) {
    const p = pull(aim);
    const w = wobble(aim, T);
    sfx.creak(p.power, Math.abs(w) * 12);
    if (ratchet.shake(w !== 0)) haptic("wobble");
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
    s, view: v, lamp, ink, dpr: sdpr, sw: W, cw: W + cam.ox * 2, ch: H + cam.oy + cam.ob,
    selected, ghost, sig: signatureFor(s, mode), lean: leanOf(),
  };
  const human = screen === "game" && !away(s.current) && $("#sheet").hidden;
  // setup: show where camps can't go while you're placing one
  if (ghost) {
    f.keepOut = s.bases.map((b) => ({ x: b.x, y: b.y, r: b.r + RULES.baseRadius + (b.owner === s.current ? RULES.minBaseGap : RULES.minEnemyBaseGap) }));
  }
  if (human && s.phase === "setup" && !ghost && !busy && !taught("place")) {
    const ownY = mode.kind === "pnp" && s.current === 1 ? 0.3 : 0.7;
    const n = turn.perBase(s);
    f.teach = { kind: "place", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * ownY }, p: fx.p("teach", T), rot: cam.cur.rot, note: `(${n === 10 ? "ten" : n} men in each)` };
  }
  const c0 = core();
  if (c0 && human && c0.phase === "position" && !busy) {
    f.zones = c0.bases.filter((b) => b.owner === c0.current).map((b) => ({ x: b.x, y: b.y, r: b.r + c0.rules.positionReach }));
    if (dragging) f.drag = dragging;
    if (!taught("arrange") && !dragging) {
      const ownY = mode.kind === "pnp" && c0.current === 1 ? 0.3 : 0.7;
      f.teach = { kind: "arrange", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * ownY }, p: fx.p("teach", T), rot: cam.cur.rot };
    }
  }
  if (c0 && c0.phase === "play" && screen === "game") {
    // sends ordered this turn wait in pencil until the pen changes hands
    const orders = c0.convoys.filter((c) => c.state === "ordered");
    if (orders.length) f.orders = orders.map((c) => ({ a: c.road[0], b: c.road[1], at: c.ids.map((id) => c0.soldiers[id]) }));
    if (sending?.from !== undefined && arrowTo) {
      const from = c0.bases[sending.from];
      const w = sending.to ?? ownBaseAt(arrowTo);
      f.sendArrow = { from, to: arrowTo, ok: w !== undefined && w !== sending.from && !canSend(c0, sending.from, w, 1) };
    }
  }
  if (lapse) {
    const p = Math.min(1, Math.max(0, (T - lapse.t0) / lapse.dur));
    f.walkers = lapse.walkers.map((w) => ({ ...w, p: Math.max(0.001, p) }));
  }
  if (human && s.phase === "play" && selected !== undefined && !aim && !res && !taught("aim")) {
    f.teach = { kind: "aim", at: s.soldiers[selected], p: fx.p("teach", T), rot: cam.cur.rot };
  }
  if (human && s.phase === "play" && selected === undefined && !aim && !res && !busy) {
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && turn.canFlick(s, x.id));
    if (!sending) f.hint = { p: fx.p("hint", T), bases: s.bases.filter((b) => b.owner === s.current && inBase(mine, b).length) };
  }
  const note = waitNote();
  if (note) {
    // at your end of the page, whichever way up it is (clear of the header)
    const low = Math.cos(cam.cur.rot) > 0;
    f.teach = { kind: "note", text: note, at: { x: RULES.pageW / 2, y: low ? RULES.pageH - 70 : 160 }, p: fx.p("note", T), rot: cam.cur.rot };
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
      f.aim = { soldierId: selected, angle: ang, power: pl.power, spread: aimError(pl.power, turn.handFor(s, selected, kind)) * 2, reach: turn.lengthFor(s, kind, pl.power), kind };
      f.pen = leaning(me.x, me.y, ang, pl.live ? penLean(pl.power) : 0.04, owner, ink);
      // a lunger landing among their men is shot: those camps are hatched while you aim one
      if (kind === "lunge" && c0) f.danger = c0.bases.filter((b) => b.owner !== c0.current && garrison(c0, b).length).map((b) => ({ x: b.x, y: b.y, r: b.r }));
    } else if (botAim) {
      const k = Math.min(1, (T - botAim.t0) / 700);
      const pw = botAim.power * (1 - Math.pow(1 - k, 2));
      const tremble = Math.sin(T / 1000 * 7.3) * 0.02 * pw;
      f.aim = { soldierId: selected, angle: botAim.angle + tremble, power: pw, spread: aimError(pw, turn.handFor(s, selected, kind)) * 2, reach: turn.lengthFor(s, kind, pw), kind };
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

// How far the camera has leaned in to aim (brings up the fog round the pen).
function leanOf() {
  const p = cam.cur;
  return Math.max(0, Math.min(1, cam.tiltScale > 0 ? p.tilt / 0.55 : (p.m - 1) / 1.1));
}

function renderNow() {
  const f = currentFrame();
  const bg = farColour(f.lamp);
  if (document.body.style.backgroundColor !== bg) document.body.style.backgroundColor = bg;
  document.body.style.setProperty("--lamp", f.lamp.on.toFixed(3));
  document.body.style.setProperty("--dawn", f.lamp.dawn.toFixed(3));
  renderStage(els, f);
  renderOverlay(og, f, W, H, dpr);
}

function showBoot() {
  applyTheme(homeTheme());
  // a new paper re-inks the page and repaints the desk and the light (they key on the theme)
  onTheme(() => { dirty = true; hud(); });
  resize();
  hud();
  document.fonts?.ready.then(() => { pageState.epoch++; dirty = true; });
  requestAnimationFrame(frame);
  showTitle();
}
const roomPath = location.pathname.match(/^\/r\/([a-z0-9]{6})\/?$/)?.[1];
showBoot();
if (roomPath) void openRoom(roomPath);

// dev-only handle for scripted playtests
if (import.meta.env.DEV) {
  (window as unknown as { pft: object }).pft = {
    get s() { return s; }, get T() { return T; }, get screen() { return screen; }, get busy() { return busy; },
    get selected() { return selected; }, get res() { return res; }, get lapse() { return lapse; }, haptics, get link() { return link; }, get mode() { return mode; }, get roomDrift() { return roomDrift; },
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
    stageStats, cam, fx, inkTL, pageCanvas, ink: inkLib, INK, els, canvas: over, renderNow, worldTransform, page, pen: PEN,
    get slow() { return slow; }, set slow(v: boolean) { slow = v; cam.quick = v ? 1.8 : 1; probeSlow = v; },
    start, showTitle, replay: () => replay(file(s, mode)), apply: (st: Step) => { apply(s, st); dirty = true; },
    unfile, file: () => file(s, mode), flick: (f: Flick) => fire(f, 0.6, 0.3),
    /** What Dawood-bot would do now (for driving a human seat in playtests). */
    botMove: (level: Level = 1) => turn.botMove(s, level, (Math.random() * 2 ** 32) >>> 0),
    /** Apply an action as the flow would (flicks resolve on screen). */
    act: (x: Action | { soldierId: number; kind: "shoot" | "move"; angle: number; length: number; bend: number }) => {
      // older playtest scripts pass a prototype flick
      const a: Action = "soldierId" in x ? { t: "flick", soldier: x.soldierId, kind: x.kind === "shoot" ? "snipe" : "lunge", angle: x.angle, length: x.length, bend: x.bend, wob: 0 } : x;
      return a.t === "flick" ? fire(a, 0.6, 0.3) : perform(a, () => { busy = false; next(); });
    },
    /**
     * A seeded bot-v-bot war on the core rules, filed in the drawer (finished or
     * not: `maxTurns` stops it early). Returns the record.
     */
    fileWar: (seed = 7, maxTurns = 400, size: Size["name"] = "quick") => {
      const st = newGame(sizeFor(size, custom), seed, pageStamp());
      let k = seed;
      while (st.phase === "setup") { const spot = botBase(st, (x, y) => !turn.canPlaceBase(st, x, y), k++)!; act(st, { t: "base", x: spot.x, y: spot.y }); }
      while (st.phase === "position") for (const a of botArrange(st, k++)) { if (!illegal(st, a)) act(st, a); if (a.t === "ready") break; }
      while (st.phase === "play" && st.turn < maxTurns) act(st, turn.botMove(st, 1, k++));
      const r = file(st, { kind: "bot", level: 1 });
      if (st.phase === "over") localStorage.setItem("pft:drawer", JSON.stringify(addToDrawer(drawer(), r)));
      return r;
    },
    view: (r: Filed) => viewPage(r), replayRecord: (r: Filed) => replay(r),
    theme: { apply: applyTheme, choose: chooseTheme, room: setRoomTheme, get current() { return currentTheme(); }, list: THEMES.map((t) => t.id) },
    resumeRecord: (r: Filed) => resume({ s: unfile(r), mode: r.mode }),
  };
}

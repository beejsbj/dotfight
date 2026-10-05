import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/special-elite/400.css";
import "./style.css";

import { botArrange, botBase, botShape, LEVELS, type Level } from "./bot";
import { botMoveLater } from "./botclient";
import { Camera, type Pose } from "./camera";
import { cue, onCue } from "./cues";
import { aimError, pull, pullSpan, release, wobble, type Aim as Pull } from "./flick";
import {
  act, baseAt, canArrange, marchView, steadyTrace, canSend, corners, garrison, illegal, inLastStand, inside, newGame, other, pathLen, preview, radiusOf, rng, scatterIn, sendMax, wallGap,
  type Action, type Base, type Flick, type GameState, type Kind, type Outcome, type Player, type Pt, type Soldier, type StarKind,
} from "./game";
import { offsetPolygon } from "./geom";
import { jotOrder, pickSoldier, inBase } from "./hand";
import { Dial, haptic, haptics, Ratchet } from "./haptics";
import { inkTime, wallTime, type Snag } from "./inkclock";
import * as inkLib from "./ink";
import { INK } from "./ink";
import { farColour, lampFor } from "./light";
import { drawDot, drawPaper, drawYellow, CLARITY, PageLayer, SETTLED, type Ink } from "./page";
import { LIFT_MS, SETTLE_MS, leaning, lift, PEN, settle, shiver, type PenPose } from "./pen";
import { gunPull, tip, type Pose as Held } from "./motion";
import * as motion from "./motion-input";
import { screenDirToWorld } from "./projection";
import { addToDrawer, apply, blank, file, readDrawer, readSave, settleSave, sizeFor, steps, unfile, type AnyState, type Filed, type Mode, type Save, type Step } from "./record";
import { GAME } from "./name";
import { CORE, CUSTOM, FEEL, LONG, RULES, SHAPES, SIZES, type Shape, type Size } from "./rules";
import { boldAt, lifeOf } from "./boil";
import { beforeMarch, comrades, LIFE, planFlick, planVolley, unit as seeded, VOLLEY, type VolleyPlan } from "./life";
import * as voice from "./voice";
import { ANCHOR, BUBBLE, Bubbles, botchOf, botchVoices, bubbleAt, heatOf, replyAt, strayKind, streakVoices, type BotchKind, type BubbleKind, type Context, type StreakKind, type Mood } from "./bubble";
import { feel, setFeel } from "./feel";
import { UNIT_CAM, facing, phaseAt, rotFacing } from "./unitcam";
import { boil, boilSeen, boilTick, field, standRays, streak as streakLayer, forgetDrawn, life, NOTE, noteSpotNow, noteSpotsNow, page, pageState, stageStats, renderOverlay, renderStage, worldTransform, type Els, type Frame } from "./scene";

import * as sfx from "./sound";
import { applyTheme, chooseTheme, chosenTheme, currentTheme, homeTheme, hudPen, onTheme, roomTheme, setRoomTheme, theme, themeOf, THEMES, withTheme } from "./theme";
import { keepIcon, levelIcon, paperIcon, tearIcon } from "./icons";
import { orderGames, type GameLine } from "./games";
import { forgetRoom, listRooms, readRoom, RoomLink, type Saved as RoomSaved } from "./room";
import { apply as roomApply, canRead as roomCanRead, check as roomCheck, drifted as roomDrifted, engineFor, hash as roomHash, replay as roomReplay, setupOf, turn as roomTurn, type Payload, type Setup } from "./room-engine";
import { httpApi, RoomHttpError, type RoomView } from "./room-protocol";
import { Timeline, reachFraction, signable, walkerAt } from "./timeline";
import * as turn from "./turn";

setFeel((ev) => haptic(ev));

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
let aimFrom = 0; // the aim's angle when the thumb went down: straight up the screen
let aimAngle = 0; // world angle of the current pull
let byThumb = { angle: 0, dist: 0 }; // the pull as the thumb has it, before the phone's nudge
let nudgeFrom: Held | null = null; // how the phone was held when the pull began
let penSide = 0; // the pen's sideways lean from the nudge
let gunFwd = 0; // pen falcon: straight ahead on the page when the phone was raised
let gunTap = false; // this touch put a raised phone down: the tap does nothing else
let botAim: { soldierId: number; angle: number; power: number; t0: number } | null = null;
let ghost: Frame["ghost"];
let busy = false; // a flick is resolving, the bot is thinking, or the page is turning
let lastNote = "";
let gen = 0; // bumps on every new/resumed game so stale callbacks stand down
let screen: "title" | "game" | "view" | "replay" = "title";
let viewing: Filed | null = null; // a page out of the drawer
/** The finale has begun to write the signature (a won page is signed by its finale, not by the winning flick). */
let signing = false;

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
// the room's own business (the lamp) outlives any one game
const ROOM = -1;
function whenever(ms: number, fn: () => void) { later.push({ at: T + ms, fn, g: ROOM }); }

/** How long the ink catches (wall ms) at each of the long war's pencil notes: shorter than a kill's snag. */
const STAR_HOLD: Record<StarKind, number> = { bank: 60, split: 70, rule: 40, home: 60 };

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
let penLift: { t0: number; x: number; y: number; owner: Player } | null = null; // and when it was picked up off him
/** The unit cam (unitcam.ts): down at his level for a beat. `back`: where the camera was. */
let unit: { id: number; t0: number; back: Pose; skip?: number; greeted?: boolean; rising?: boolean } | null = null;
/**
 * A volley (life.planVolley): a camp turning on an intruder. `t0`: wall ms he
 * landed. `stamp`: draw his cross here, when the rules haven't marked him dead.
 */
let volley: { plan: VolleyPlan; t0: number; stamp: boolean; ended?: boolean } | null = null;
/** The last pull on a man that wasn't let go (he looks down it in the unit cam). */
let lastPull: { id: number; angle: number } | null = null;

// Convoys between turns: the engine moves them the moment the pen changes
// hands; the page holds their new dots back and shows the march as a quick
// time-lapse before the next go (see holdLapse / runLapse).
interface Walk { id: number; from: Pt; to: Pt; departing?: boolean; convoy?: number }
let lapseDue: { walkers: Walk[]; marks: number[]; out: number; home: number; on?: number; seen?: AnyState } | null = null;
let lapse: { walkers: Walk[]; t0: number; dur: number } | null = null;

// A send being drawn (pick a camp, drag to another, choose how many), and
// a soldier being arranged before the first flick.
let sending: { from?: number; to?: number } | null = null;
let dragging: { id: number; at: Pt; ok: boolean } | null = null;
let arrowTo: Pt | null = null; // the pencil end of a send being drawn

const $ = <T extends HTMLElement>(q: string) => document.querySelector(q) as T;
const els: Els = {
  desk: $<HTMLCanvasElement>("#desk"), pageHost: $("#page-host"), boilHost: $("#boil-host"), fieldHost: $("#field-host"), streakHost: $("#streak-host"), raysHost: $("#rays-host"), live: $<HTMLCanvasElement>("#live"), talk: $<HTMLCanvasElement>("#talk"),

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
/**
 * A page that was won but never filed (the app closed between the winning flick
 * and the finale): file it in the drawer and clear the save, as finish() would.
 * Run before the cover reads the save, so it is never stranded.
 */
function fileFinishedSave() {
  const out = settleSave(load(), drawer());
  if (!out.filed) return;
  localStorage.setItem("pft:drawer", JSON.stringify(out.drawer));
  localStorage.removeItem("pft:save");
}

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
  const [pw, ph] = [Math.round(cw * sdpr), Math.round(ch * sdpr)];
  for (const live of [els.live, els.talk]) {
    live.style.left = `${-cam.ox}px`;
    live.style.top = `${-cam.oy}px`;
    live.style.width = `${cw}px`;
    live.style.height = `${ch}px`;
    if (live.width !== pw || live.height !== ph) { live.width = pw; live.height = ph; }
  }
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
// Reduced motion cuts the vestibular kind (camera zooms, spins, swoops, tilt). Ink drawing on is
// the game's content, and its timing drives the sound and haptics, so a flick's ink draws on at full
// length. (A few other beats, like the lapse's footprint march, still shorten; this is about the ink.)
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The pen's and a moving man's own motion (LIFE.pen, the ride's smear): not with reduced motion. */
const lively = () => !reduced && !slow && !boil.tooDear;
function applyTilt() { cam.tiltScale = settings.tilt && !reduced ? 1 : 0; }
cam.cut = reduced; // reduced motion: the camera cuts, it doesn't swoop, zoom or spin
applyTilt();

// The line boil (boil.ts): the living are drawn over and over. Not with reduced
// motion, not under the cover, and not on a phone that's struggling: one whose
// camera moves are slow (the same check that skips the page-turn spin) or whose
// boil ticks run over budget. Off, everything is simply ink on the page.
let boilForce: boolean | undefined; // dev: pin it on or off for playtests
function boilOn() {
  if (boilForce !== undefined) return boilForce;
  return !reduced && !slow && !boil.tooDear && screen !== "title";
}
let boilWas = false;

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
    c.textContent = s.phase === "setup" ? `${turn.basesLeft(s, p)} ${baseWord()}s to draw`
      : s.phase === "position" ? (c0?.ready[p] ? "arranged" : "arranging")
      : stand ? `last ${n} · two flicks` : `${n} standing`;
    el.style.setProperty("--ink-left", inkLeft(p).toFixed(3));
  }
  document.documentElement.style.setProperty("--ink", hudPen(s.current));
  const chain = !!c0?.chain;
  if (screen === "game") {
    // drawing a long war's bases: the cards are the three shapes
    const shaping = turn.shaped(s) && s.phase === "setup";
    if (shaping !== ($("#kind").dataset.bar === "shapes") || (shaping && cardPen !== s.current && !carrying)) { if (shaping) shapeBar(); else restoreKindBar(); }
    if (shaping) $("#kind").classList.toggle("off", away(s.current) || busy);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("#kind button[data-kind]")) {
    const k = b.dataset.kind as Kind;
    const on = k === kind;
    b.classList.toggle("on", on);
    b.classList.toggle("barred", chain && k === "snipe");
    b.setAttribute("aria-checked", String(on));
    b.querySelector("b")!.textContent = k === "lunge" && chain ? "lunge on" : turn.verb(s, k);
    b.querySelector("i")!.textContent = CARD[turn.isLegacy(s) ? "legacy" : "core"][k];
  }
  if ($("#kind").dataset.bar !== "shapes") $("#kind").classList.toggle("off", s.phase !== "play" || away(s.current) || screen !== "game" || busy && !aim || !!sending);
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
      if (selected !== undefined && !c0.chain) html += `<button data-act="down" class="x">put down</button>`;
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

// A pencilled mark for the whole pull: a dot where the thumb went down, and the
// dead zone drawn faintly as a ring at that height, riding under the thumb (the
// page turns as you slide sideways; the pull is only the way down). With no
// downward pull left after a real pull, the ring firms up (and ticks): let go
// and the aim is dropped, nothing fired. One small fixed DOM element in screen
// space, so no page or canvas layer is touched. How hard you're pulling shows
// in the pen itself: its refill fills with the pull (pen.ts, `charge`). The
// ring is in the side's ink, and once the thumb has pulled away a light line
// runs from it back up to the ring, so where to go to stop is never lost.
let ringOn = false; // the thumb is inside the ring
/** The line back to the ring: px clear of the ring, px left for the fingertip, and the shortest worth drawing. */
const BACK_GAP = 4, BACK_FINGER = 26, BACK_MIN = 28;
let markOn = false;
let thumbX = 0; // where the thumb is across the screen
const ringEl = document.createElement("div");
ringEl.id = "cancel-ring";
ringEl.hidden = true;
ringEl.innerHTML = `<i></i><b class="back"></b>`;
const backEl = ringEl.querySelector<HTMLElement>(".back")!;
document.body.append(ringEl);
function syncRing() {
  const shown = !!aim && g.t === "aim";
  if (shown && g.t === "aim") {
    const r = FEEL.minPullPx;
    ringEl.style.transform = `translate(${thumbX - r}px, ${g.sy - r}px)`;
    ringEl.style.width = ringEl.style.height = `${r * 2}px`;
    (ringEl.firstElementChild as HTMLElement).style.transform = `translate(${g.sx - thumbX}px, 0)`; // the dot stays where the thumb began
    // the line back: from just above the fingertip up to the ring's edge
    const len = byThumb.dist - r - BACK_GAP - BACK_FINGER;
    backEl.style.height = `${Math.max(0, len)}px`;
    backEl.classList.toggle("on", len > BACK_MIN);
  }
  if (shown !== markOn) { markOn = shown; ringEl.hidden = !shown; }
  const on = shown && !!aim && aim.charged && !pull(aim).live;
  if (on === ringOn) return;
  ringOn = on;
  ringEl.classList.toggle("in", on);
  if (on) { haptic("brink"); learn("cancel"); }
}

/** What a base is called in the status lines: a camp in the core rules; in the long war "base", or its own shape where one base is meant. */
function baseWord(b?: { shape?: Shape }, st: AnyState = s) {
  return turn.shaped(st) ? b?.shape ?? "base" : "camp";
}

function status(msg?: string) {
  let t = msg ?? "";
  if (!msg) {
    const who = name(s.current);
    const c0 = core();
    if (screen === "replay") t = "the war, again";
    else if (screen === "game" && roomStatus() !== null) t = roomStatus()!;
    else if (screen === "view") t = viewing ? `page ${viewing.page?.no ?? "?"} · ${viewing.page?.date ?? ""}` : "";
    else if (s.phase === "setup") t = isBot(s.current) ? `${who} is drawing a ${baseWord()}…` : turn.shaped(s) ? `${who}: drag a base up from the cards` : `${who}: draw a camp`;
    else if (s.phase === "position") t = isBot(s.current) ? `${who} is arranging…` : dragging ? (dragging.ok ? "let go to put him here" : `too far from his ${baseWord(s.bases[s.soldiers[dragging.id]?.home ?? -1])}`) : `${who}: arrange your men, then done`;
    else if (s.phase === "over") t = `${name(s.winner!)} held the page`;
    else if (res || lapse) t = "";
    else if (isBot(s.current)) t = `${who} is lining up…`;
    else if (sending) t = sending.to !== undefined ? "how many go?" : sending.from !== undefined ? `…to another of your ${baseWord()}s` : `drag from one of your ${baseWord()}s to another`;
    else if (aim) t = pull(aim).live ? (taught("cancel") ? `let go to ${turn.verb(s, kind)}` : `let go to ${turn.verb(s, kind)}, or slide back to the start to cancel`) : aim.charged ? "let go to cancel" : "pull back further…";
    else if (c0?.chain) t = `one more for ${who}: lunge on, or stop`;
    else if (unit) t = "";
    else if (motion.gun) t = motion.gun.armed < 1 ? "point the phone, hold it still…" : "flick your wrist to fire";
    else if (selected !== undefined) t = motion.live("gun") ? "pull back, or tap him and raise the phone" : LIFE.unitCam && !taught("unitcam") && taught("aim") ? "slide to turn, pull down, or tap him again" : `slide to turn the page, pull down, let go`;
    else if (c0 && c0.left > 1) t = `${who}: ${c0.left} flicks this turn`;
    else t = lastNote ? `${lastNote}` : `${who}: pick up a soldier`;
  }
  syncRing();
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
  last = performance.now();
  turnClock = 0;
  clockTurn = -1;
  clockHeld = false;
  botThinking = false;
  botReleaseMs = undefined;
  shown = null;
  guideKey = "";
  guideVal = {};
  signing = false;
  later = later.filter((l) => l.g === ROOM);
  busy = false;
  res = null;
  aim = null;
  botAim = null;
  ghost = undefined;
  selected = undefined;
  lastNote = "";
  motion.lower();
  lapse = null;
  lapseDue = null;
  sending = null;
  dragging = null;
  fx.clear();
  inkTL.clear();
  sfx.creak(0);
  life.clear();
  voice.reset();
  bubbles.reset();
  bubbleKey = "";
  streak = { who: -1, turn: -1, kind: "", n: 0, last: undefined };
  botchBack = null;
  botchLast = undefined;
  lastMoveWall = wall;
  chosenAt = { id: -1, t0: wall };
  dreadWas.clear();
  volley = null;
  unit = null;
  penLift = null;
  lastPull = null;
  momentQ.length = 0;
  earnedBy = null;
  bubbles.reset();
  // a different page is about to be on the desk: draw it even if nothing moves
  dirty = true;
}

/** The rules a new game of this size is played by: a long war's, or the core rules. */
const rulesFor = (size: Size) => (size.name === "long" ? LONG : CORE);

function start(m: Mode, size: Size = pickedSize()) {
  reset();
  restoreKindBar();
  s = newGame(size, undefined, pageStamp(), rulesFor(size));
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
  if (s.phase === "over") { signing = true; viewBar(); return void after(400, showOver); }
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
      const sh = turn.shaped(s) ? botShape(Math.random) : undefined;
      const spot = botBase(s as GameState, (x, y) => !turn.canPlaceBase(s, x, y, sh));
      if (spot) drawBase(spot.x, spot.y, 1, sh);
      after(900, () => { busy = false; next(); });
    });
    return;
  }
  if (s.phase === "position" && c0) return botArranges(c0);
  const botGoes = (a: Action) => {
    if (a.t === "send") return botSends(a);
    if (a.t === "stop") { lastNote = `${name(s.current)} stopped`; return perform(a, () => { busy = false; next(); }); }
    if (a.t !== "flick") return;
    const { t: _t, ...f } = a;
    void _t;
    showFlick(f);
  };
  after(500, () => {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const c1 = core();
    if (!c1?.rules.long) return botGoes(turn.botMove(s, level, seed));
    // a long-war move is a few hundred previews: think on a worker, and carry on when it answers
    const g0 = gen, n0 = c1.actions.length;
    botThinking = true;
    const asked = { ...marchView(c1, momentNow()), clock: momentNow() };
    void botMoveLater(asked, level, seed).then((a) => after(0, () => {
      if (g0 !== gen || c1 !== s || n0 !== c1.actions.length) return;
      botThinking = false;
      botReleaseMs = a.t === "flick" ? a.ms : undefined;
      botGoes(a);
    }));
  });
}

// Someone else's flick, played out: the pen goes down on the soldier, pulls
// back, and lets go. You watch from above, the way you'd lean over a friend's.
// The bot and room peer both play at their recorded release moment.
function showFlick(f: Flick) {
  selected = f.soldier;
  pickUp(f.soldier);
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
      if (f.ms !== undefined) turnClock = f.ms;
      botReleaseMs = undefined;
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
  lastMoveWall = wall;
  if (!c0) return then();
  const before = marchView(c0, momentNow()).soldiers.map((x) => ({ x: x.x, y: x.y }));
  const first = c0.marks.length;
  const o = act(c0, a);
  if (a.t === "stop") streak = { who: -1, turn: -1, kind: "", n: 0, last: undefined };
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
  const on = o.advanced ?? [];
  if (!c0 || (!o.walked.length && !o.arrived.length && !on.length)) return;
  const convoys = new Set([...o.walked, ...o.arrived, ...on]);
  const walkers: Walk[] = [];
  let out = 0, home = 0, onward = 0;
  for (const c of c0.convoys) {
    if (!convoys.has(c.id)) continue;
    for (const id of c.ids) {
      const x = c0.soldiers[id], b = before[id];
      if (!x.alive || (b.x === x.x && b.y === x.y)) continue;
      walkers.push({ id, from: b, to: { x: x.x, y: x.y }, departing: o.walked.includes(c.id), convoy: c.id });
      if (o.walked.includes(c.id)) out++; else if (o.arrived.includes(c.id)) home++; else onward++;
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
  lapseDue = { walkers, marks, out, home, on: onward };
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
    if (due.on) cue("walk-on", due.on);
    if (due.home) cue("arrive", due.home);
    // one of the marchers, setting off; or, once they're there, one arriving
    const group = due.walkers.filter((w) => w.departing === !!due.out);
    const w = group[Math.floor(seeded(s.seed, s.turn, 71) * group.length)];
    if (w && due.out) speak("send", w.id);
    else if (w && due.home) speak("arrive", w.id, wall + dur / speed);
  }
  busy = true;
  hud();
  after(dur + 80, () => { lapse = null; dirty = true; then(); });
}

// The soldier sits low on the screen when you aim, so the page ahead of the shot is what you see.
const AIM_FY = 0.74;
// Aiming turns the page under your thumb: sliding sideways swings the aim by
// turnK() rad per px: the width of the phone (less the free zones) is a full turn (from the
// middle of the screen you can reach straight back toward your own side). The
// first TURN_DEAD px are free, so a straight pull stays straight.
const TURN_DEAD = 8;
const turnK = () => (Math.PI * 2) / Math.max(200, cam.W - TURN_DEAD * 2);
/** Straight up the screen for this player, as a world angle. */
const forwardAngle = () => -(Math.PI / 2 + rotFor(s.current));
/** Nothing is being aimed: the page goes back to facing its player. */
function faceForward() { cam.face(rotFor(s.current), reduced); }

// Lean in low to the pen to aim. Everything else is watched from above.
function sitOn(p: Pt, fy = AIM_FY) {
  if (cam.tiltScale > 0) cam.sit(p, 2.1, 0.55, fy);
  else cam.sit(p, 2, 0, 0.55);
}

// The circle goes round, then the soldiers are jotted in, one tap each.
function drawBase(x: number, y: number, quick = 1, sh?: Shape) {
  turn.placeBase(s, x, y, sh);
  const b = s.bases[s.bases.length - 1];
  hud();
  fx.add(`b${b.id}`, T, 0, 380 * quick, "out");
  sfx.circle();
  const dots = s.soldiers.slice(-turn.perBase(s, sh));
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

// The long war's turn clock: ms the pen has been in hand this turn. Convoys on
// the road walk on it, so where a walker stands depends on when a line is let
// go; every flick played here records the moment (`Flick.ms`). It runs while
// whoever holds the pen can act: not while ink lands, convoys march at the
// hand-over, a sheet is up, or the phone is away.
let turnClock = 0;
let clockTurn = -1;
let botThinking = false;
let botReleaseMs: number | undefined;
let clockHeld = false; // dev: hold the clock still, for captures and the redraw check
/** The page's march steps at the boil's 8 fps, so the page and its layers settle between steps. */
const MARCH_STEP = 125;
function stepClock(dt: number) {
  const c0 = core();
  if (!c0?.rules.long || c0.phase !== "play") return false;
  if (c0.turn !== clockTurn) { clockTurn = c0.turn; turnClock = c0.clock ?? 0; }
  turnClock = Math.max(turnClock, c0.clock ?? 0);
  if (screen !== "game" || res || lapse || lapseDue || document.hidden || !$("#sheet").hidden) return false;
  // Another phone owns its turn clock; busy handovers cannot spend the next turn.
  // A local bot advances only while playing its scheduled release animation.
  if (remote(c0.current) || (busy && botReleaseMs === undefined)) return false;
  const walking = c0.convoys.some((c) => c.state === "road" && turnClock < c0.rules.long!.walkMs);
  if (!clockHeld && !botThinking) turnClock = Math.min(turnClock + dt, botReleaseMs ?? Infinity);
  return walking;
}
/** The moment a flick played on this phone is let go. */
const momentNow = () => Math.max(turnClock, core()?.clock ?? 0);
/** A flick of ours, stamped with its moment (the long war). */
const stamped = (f: Flick): Flick => (core()?.rules.long ? { ...f, ms: momentNow() } : f);

// The long war's aim guide follows the ink a steady hand would draw: round a
// camp's well, off a cushion, along a groove, and a prism's other half. Traced
// again only when the aim moves past a hair or the page changes.
let guideKey = "";
let guideVal: { path?: Pt[]; branches?: Pt[][] } = {};
function guide(id: number, k: Kind, angle: number, length: number) {
  const c0 = core();
  if (!c0?.rules.long || c0.phase !== "play") return {};
  const ms = momentNow();
  const walking = c0.convoys.some((c) => c.state === "road") && ms < c0.rules.long.walkMs;
  const key = `${c0.actions.length}|${id}|${k}|${angle.toFixed(3)}|${Math.round(length)}|${walking ? Math.round(ms / 100) : "-"}`;
  if (key !== guideKey) {
    const tr = steadyTrace(c0, { soldier: id, kind: k, angle, length, bend: 0, wob: 0, ms });
    guideKey = key;
    guideVal = tr ? { path: tr.pts, ...(tr.branches && { branches: tr.branches }) } : {};
  }
  return guideVal;
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
  lastMoveWall = wall;
  const first = s.marks.length; // the flick appends its stroke, then its crosses
  // Handover starts from where the convoy stood as the line was released.
  const released = turn.isLegacy(s) ? s : marchView(s, f.ms);
  const before = released.soldiers.map((x) => ({ x: x.x, y: x.y }));
  const o = turn.flick(s, f);
  save();
  selected = undefined;
  aim = null;
  busy = true;
  acts();
  sfx.creak(0);
  // convoys marching as the pen changes hands wait for the ink to land
  holdLapse(o, before, first);
  const held = new Set(lapseDue?.marks ?? []);
  const quick = opts.quick ?? 1;
  const len = pathLen(o.path);
  const dur = Math.min(900, Math.max(300, 220 + len * 0.42)) * quick;
  inkTL.clear();
  inkTL.add(`m${first}`, 0, 0, dur, "out2");
  // a prism's other half runs on from where the line split
  const splitAt = splitMs(o, dur);
  o.branches?.forEach((_, k) => inkTL.add(`m${first + 1 + k}`, 0, splitAt, Math.max(120, dur - splitAt), "out2"));
  const over = s.phase === "over";
  const kills: Resolve["kills"] = [];
  const snags: Snag[] = [];
  const moments: Resolve["moments"] = [];
  const stands: { i: number; owner: Player }[] = [];
  const live = opts.cam ?? true; // replays are watched, not felt
  let lastKill = -1;
  for (let i = first + 1; i < s.marks.length; i++) if (s.marks[i].t === "cross" && (s.marks[i] as { kind: string }).kind === "kill") lastKill = i;
  let killed = 0; // the kill crosses come in the order of o.killed
  const killCount = s.marks.slice(first + 1).filter((m) => m.t === "cross" && m.kind === "kill").length;
  for (let i = first + 1; i < s.marks.length; i++) {
    const m = s.marks[i];
    if (held.has(i)) continue;
    if (m.t === "stand") {
      // their comrades are gone: the last few are ringed once the crosses are down
      stands.push({ i, owner: m.owner });
      continue;
    }
    if (m.t === "star") {
      // the long war: the pencil note goes down as the ink gets there, with a beat in the
      // ink, a sound, and (your own line) one tick under the thumb; the beat is skipped under
      // reduced motion, the note and the sound stay
      const kind = m.kind, ev = o.events.find((e) => (e.kind === kind || e.kind === "wall") && e.at.x === m.x && e.at.y === m.y);
      const at = inkAt(o, dur, ev?.branch ?? 0, m);
      inkTL.add(`m${i}`, 0, at, 220 * quick);
      if (!reduced) snags.push({ at, hold: STAR_HOLD[kind] * quick });
      moments.push({ at, fn: () => { sfx[kind](); if (live) { cue(kind, ev?.base); if (!away(who)) haptic(kind); } } });
      continue;
    }
    if (m.t !== "cross") continue;
    if (m.kind === "kill") {
      // a man the prism's other half crosses out falls when that ink reaches him
      const victim = o.killed[killed++];
      const by = o.events.find((e) => e.kind === "kill" && e.soldier === victim)?.branch ?? 0;
      const at = inkAt(o, dur, by, m);
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
  // the long war: old ink crossed steeply kinks the line (no mark, it would litter the page): the faintest tick
  for (const e of o.events) if (e.kind === "ink") {
    const at = inkAt(o, dur, e.branch ?? 0, e.at);
    moments.push({ at, fn: () => { sfx.jolt(); if (live) { cue("jolt"); if (!away(who)) haptic("jolt"); } } });
  }
  snags.sort((a, b) => a.at - b.at);
  const seen = pendingState();
  let volleyHold = 0;
  if (o.crashed !== undefined) {
    // he lands among their men, and they shoot him where he stands: every man
    // home turns on him and jabs (life.planVolley), and his cross, the snag and
    // the thud land on the last jab
    const base = o.crashed, end = o.path[o.path.length - 1];
    const plan = startVolley(base, { id: f.soldier, x: end.x, y: end.y }, wall + wallTime(dur, snags) / speed, false, seen);
    if (plan) {
      volleyHold = plan.cross * speed;
      s.marks.forEach((m, i) => { if (i >= first && m.t === "cross" && m.kind === "lost") inkTL.add(`m${i}`, 0, dur + volleyHold, VOLLEY.crossMs * speed); });
    }
    moments.push({ at: dur + 20 * quick + volleyHold, fn: () => { if (live) { sfx.snag(true); sfx.cross(0.03, 1.1); cam.shake(7); cue("lunge-death", base); } } });
  }
  feelFlick(o, f, dur, snags, seen, volleyHold);
  for (const { i, owner } of stands) {
    const at = dur + Math.max(380 * quick, volleyHold ? volleyHold + VOLLEY.crossMs * speed : 0);
    inkTL.add(`m${i}`, 0, at, 500 * quick);
    moments.push({ at, fn: () => { sfx.scratch(0.5, 0.35, 1600); if (live) cue("last-stand", owner); } });
  }
  if (o.earned && live) moments.push({ at: dur, fn: () => { earnedBy = { id: f.soldier, kind: f.kind }; cue("earned", core()?.left ?? 0); } });
  const pen = opts.pen ?? true;
  const penTail = pen ? 900 * quick : 0;
  res = {
    f, o, owner: who, power, t0: T, dur, snags, kills, first, moments,
    mover: f.kind === "lunge" ? f.soldier : undefined,
    end: Math.max(dur + penTail, dur + 330 * quick, volleyHold ? dur + volleyHold + VOLLEY.crossMs * speed + 300 : 0) + 60,
    pen, cam: opts.cam ?? true, startLean: lean, startAngle: f.angle,
    done: () => {
      lastNote = noteFor(who, f, o);
      if (screen === "replay") return runLapse(replayNext);
      if (s.phase === "over") return next();
      if (o.again) { busy = false; return next(); }
      runLapse(() => handOver());
    },
  };
  // straight back up to a bird's-eye view to watch the ink land. The page stays
  // turned the way it was aimed, so the ink runs straight up the screen (slid
  // across if that would leave the soldier off the side); once the ink has
  // landed and the pen has fallen, it turns back to face whoever flicked (the
  // state has already moved on to the next player) and settles centred, so the
  // turn is done about as the pen is lifted.
  if (live) {
    const home = rotFor(who);
    cam.overview(undefined, before[f.soldier]);
    moments.push({ at: dur + 350 * quick, fn: () => { cam.face(home, reduced); cam.overview(); } });
  }
  sfx.slip(power);
  sfx.stroke(dur / 1000 / speed + 0.05, f.kind === "snipe" ? 0.6 : 0.45);
  hud();
}

// --- the living feel it (life.ts, voice.ts) --------------------------------------

const heard = () => screen === "game"; // replays are watched in silence

// Comic bubbles (bubble.ts): rare, one at a time, seeded by the page and the man.
const bubbles = new Bubbles();
let bubbleKey = "";
let devHour: number | undefined; // dev: pin the hour of the day the men remark on
let devHeat: number | undefined; // dev: pin how hot the war is (captures of early and late lines)
let lastMoveWall = 0; // wall ms of the last move: a long wait brings yawns and crickets
/** What a line is said in the light of: the sides' pen names on this paper, the paper, the hour, how hot the war is. */
function noteContext(owner: Player): Context {
  const c0 = core();
  const dead = s.soldiers.filter((x) => !x.alive).length;
  const standing = !!c0 && (inLastStand(c0, 0) || inLastStand(c0, 1));
  return { me: theme.ink.names[owner], them: theme.ink.names[other(owner)], paper: theme.id, hour: devHour ?? new Date().getHours(), heat: devHeat ?? heatOf(s.turn, dead, s.soldiers.length, standing) };
}
/** The camp a man speaks from: his home base, else his side's nearest. */
function campOf(id: number) {
  const x = pendingState().soldiers[id];
  if (!x) return undefined;
  const home = "home" in x ? x.home : undefined;
  if (home !== undefined && s.bases[home]) return home;
  const own = s.bases.filter((b) => b.owner === x.owner).sort((a, b) => Math.hypot(a.x - x.x, a.y - x.y) - Math.hypot(b.x - x.x, b.y - x.y));
  return own[0]?.id;
}
/** One departure snapshot per pending march; the reducer remains at the destination. */
/** What the page shows: convoys held back for a march, or (the long war) walked on to this moment of the turn. Once a frame. */
let shown: { at: number; s: AnyState; n: number; v: AnyState } | null = null;
function shownState(): AnyState {
  const p = pendingState();
  if (turn.isLegacy(p) || p !== s || !p.rules.long) return p;
  // the march in steps, and still once every convoy has walked its stretch
  const at = Math.min(Math.floor(turnClock / MARCH_STEP) * MARCH_STEP, p.rules.long.walkMs);
  if (shown && shown.at === at && shown.s === p && shown.n === p.actions.length) return shown.v;
  shown = { at, s: p, n: p.actions.length, v: marchView(p, at) };
  return shown.v;
}

function pendingState(): AnyState {
  if (!lapseDue) return s;
  return lapseDue.seen ??= beforeMarch(s, lapseDue.walkers);
}

/** A moving soldier's displayed position, rather than the reducer's destination. */
function displayedAt(id: number): Pt {
  if (res?.mover === id) {
    const it = inkTime(T - res.t0, res.snags);
    if (it < res.dur) return resolveHead(res, it);
  }
  const pending = lapseDue?.walkers.find((w) => w.id === id);
  if (pending) return pending.from;
  const w = lapse?.walkers.find((w) => w.id === id);
  if (!w || !lapse) return shownState().soldiers[id];
  const p = Math.min(1, Math.max(0.001, (T - lapse.t0) / lapse.dur));
  return walkerAt(w.from, w.to, p);
}

/** Future offers wait for the display camera; immediate offers need a visible anchor. */
function noteOnScreen(p: Pt, t0 = wall) {
  if (t0 > wall) return true;
  const q = cam.toScreen(p.x, p.y);
  return q.x >= 20 && q.x <= W - 20 && q.y >= 60 && q.y <= H - 120;
}

/** Offer a line from a man or camp; `mate` is a nearby comrade who replies. */
function speak(kind: BubbleKind, id: number, t0 = wall, seed?: number, mate?: number) {
  if (!heard() || slow || boil.tooDear || !LIFE.bubbles) return;
  const base = ANCHOR[kind] === "base";
  const at = base ? s.bases[id] : s.soldiers[id];
  if (!at || (!base && !(at as Soldier).alive)) return;
  const pos = base ? at : displayedAt(id);
  if (!noteOnScreen(pos, t0)) return; // off screen, or under the HUD when offered now
  const b = bubbles.offer(kind, id, t0, seed ?? Math.floor(seeded(s.seed, s.turn, id, kind.length) * 2 ** 31), noteContext(at.owner), mate);
  if (b) {
    if (kind === "send") b.at = { x: pos.x, y: pos.y };
    dirty = true;
  }
}

/**
 * A streak on the page: chained lunges (the engine's `chain.link`), or snipes
 * that keep earning, in one turn. Counted here, for presentation only.
 */
let streak = { who: -1, turn: -1, kind: "", n: 0, last: undefined as StreakKind | undefined };
/** How long the streak is after this flick (0: it didn't earn, and any streak is over; `ended`: how long the one it ended was). */
function countStreak(o: Outcome, f: Flick, who: Player) {
  if (!o.earned) { const ended = streak.n; streak.n = 0; streak.last = undefined; return { n: 0, ended }; }
  const c0 = core();
  if (streak.who === who && streak.turn === s.turn && streak.kind === f.kind) streak.n++;
  else streak = { who, turn: s.turn, kind: f.kind, n: 1, last: undefined };
  // a lunge chain's count is the engine's own
  if (f.kind === "lunge" && c0?.chain?.soldier === f.soldier) streak.n = c0.chain.link;
  return { n: streak.n, ended: 0 };
}
/**
 * The page reacts to a streak `n` links long (from 2), at wall `t0`: the
 * streaker, the enemy man nearest him, his home camp, or the camp nearest him
 * he's tearing through; picked by a seeded roll, not the one who spoke last,
 * and only someone on screen when displayed. It rubs out whatever's there.
 */
function speakStreak(n: number, id: number, t0: number, seed: number, only?: StreakKind) {
  if (!heard() || slow || boil.tooDear || n < 2) return null;
  const seen = pendingState();
  const me = seen.soldiers[id];
  if (!me) return null;
  const foe = other(me.owner);
  const d = (p: Pt) => Math.hypot(p.x - me.x, p.y - me.y);
  const onScreen = (p: Pt) => noteOnScreen(p, t0);
  const who = (k: StreakKind): number | undefined => {
    if (k === "streakMe") return me.alive ? id : undefined;
    if (k === "streakFoe") return turn.aliveOf(seen, foe).filter(onScreen).sort((a, b) => d(a) - d(b))[0]?.id;
    if (k === "streakCamp") return campOf(id);
    const manned = seen.bases.filter((b) => b.owner === foe && seen.soldiers.some((x) => x.alive && x.owner === foe && inside(b, x, 1)));
    return manned.filter(onScreen).sort((a, b) => d(a) - d(b))[0]?.id;
  };
  for (const k of only ? [only] : streakVoices(n, seeded(seed, n, 71), streak.last)) {
    const at = who(k);
    if (at === undefined) continue;
    const p = ANCHOR[k] === "base" ? seen.bases[at] : seen.soldiers[at];
    if (!p || !onScreen(p)) continue;
    const owner = k === "streakMe" || k === "streakCamp" ? me.owner : foe;
    const b = bubbles.urgent(k, at, t0, Math.floor(seeded(seed, n, 73) * 2 ** 31), { ...noteContext(owner), streak: n });
    if (b) { streak.last = k; dirty = true; return b; }
  }
  return null;
}

/**
 * A botch on the page: the shooter's miss, graded (bubble.ts botchOf) and
 * remarked on by the flicker, his own camp, or the enemy man or camp nearest
 * where the ink ended; not the voice that remarked last, only someone on
 * screen when displayed, and only if nothing's up (a streak's line comes first). A
 * spectacular one is remembered for a sly callback on the other side's go.
 */
let botchLast: BotchKind | undefined;
let botchBack: { who: Player; turn: number; queued?: NonNullable<ReturnType<Bubbles["urgent"]>> } | null = null;
function speakBotch(grade: number, id: number, end: Pt, t0: number, seed: number, only?: BotchKind) {
  if (!heard() || slow || boil.tooDear || grade < 1) return null;
  const seen = pendingState();
  const me = seen.soldiers[id];
  if (!me) return null;
  if (!only && seeded(seed, 17) >= BUBBLE.botch.chance[Math.min(2, grade)]) return null;
  const foe = other(me.owner);
  const d = (p: Pt) => Math.hypot(p.x - end.x, p.y - end.y);
  const onScreen = (p: Pt) => noteOnScreen(p, t0);
  const who = (k: BotchKind): number | undefined => {
    if (k === "botchMe") return me.alive ? id : undefined;
    if (k === "botchCamp") return campOf(id);
    if (k === "botchFoe") return turn.aliveOf(seen, foe).filter(onScreen).sort((a, b) => d(a) - d(b))[0]?.id;
    const manned = seen.bases.filter((b) => b.owner === foe && seen.soldiers.some((x) => x.alive && x.owner === foe && inside(b, x, 1)));
    return manned.filter(onScreen).sort((a, b) => d(a) - d(b))[0]?.id;
  };
  for (const k of only ? [only] : botchVoices(grade, seeded(seed, grade, 79), botchLast)) {
    const at = who(k);
    if (at === undefined) continue;
    const p = ANCHOR[k] === "base" ? seen.bases[at] : seen.soldiers[at];
    if (!p || !onScreen(p)) continue;
    const owner = k === "botchMe" || k === "botchCamp" ? me.owner : foe;
    // a spectacular one rubs out whatever's up ("Charge!" and then this), unless it's a streak's line;
    // a mild one waits its turn like any other note
    const up = bubbles.next ?? bubbles.cur, streaking = !!up && up.kind.startsWith("streak");
    const ls = Math.floor(seeded(seed, grade, 83) * 2 ** 31), c = { ...noteContext(owner), botch: grade };
    const b = grade >= 2 && !streaking ? bubbles.urgent(k, at, t0, ls, c) : bubbles.offer(k, at, t0, ls, c, undefined, BUBBLE.botch.gapMs);
    if (b) { botchLast = k; dirty = true; return b; }
    return null; // something's up (a streak's line, a phew): it keeps the page
  }
  return null;
}

/**
 * A moment the field must announce: written whatever the chance, after any other
 * moment showing (bubble.ts Bubbles.moment). It waits for the camera to settle
 * first (a note's gap is chosen once, so one picked while the camera swings out
 * to bird's-eye would sit where the screen no longer is), for at most 1.5s.
 */
const momentQ: { kind: BubbleKind; id: number; text: string; mood: Mood; since: number; salt: number }[] = [];
/** `salt` tells apart the same line said twice in one turn (a lunge chain's "One more!"), so each gets its own placement. */
function announce(kind: BubbleKind, id: number, text: string, delay = 120, mood: Mood = "shout", salt = 0) {
  if (!heard() || slow || boil.tooDear || !s.soldiers[id]?.alive) return;
  momentQ.push({ kind, id, text, mood, since: wall + delay, salt });
  dirty = true;
}
function flushMoments() {
  // Keep later announcements outside Bubbles until they can actually start.
  // Their camera wait begins after the previous mandatory note finishes.
  bubbles.showing(wall);
  if (bubbles.cur?.important) {
    if (momentQ.length) momentQ[0].since = Math.max(momentQ[0].since, wall + 150);
    return;
  }
  while (momentQ.length && wall >= momentQ[0].since && (cam.settled || wall - momentQ[0].since > 1500)) {
    const m = momentQ.shift()!;
    if (!heard() || slow || boil.tooDear) continue;
    const speaker = s.soldiers[m.id];
    if (!speaker) continue;
    if (!speaker.alive && m.kind === "stand") m.id = turn.aliveOf(s, speaker.owner)[0]?.id ?? m.id;
    if (bubbles.moment(m.kind, m.id, wall, Math.floor(seeded(s.seed, s.turn, m.id, m.kind.length, m.text.length, m.salt) * 2 ** 31), m.text, m.mood)) { dirty = true; return; }
  }
}

/** A soldier picked up: he perks up and says so; a campmate mutters. */
function pickUp(id: number) {
  const x = s.soldiers[id];
  if (LIFE.chosen) life.add(id, { kind: "perk", t0: wall, amp: 1 });
  if (!heard()) return;
  // one voice at most, and not every time: him, now and then; or, rarely, a campmate's mutter
  speak("ready", id);
  const roll = seeded(id, s.turn, 61);
  if (roll < 0.5) voice.say("hup", id, x.owner, 0.03);
  else if (roll < 0.62) {
    const mate = comrades(s, x.owner, x, RULES.baseRadius * 1.6, id)[0];
    if (mate) voice.say("murmur", mate.id, x.owner, 0.2, 0.8);
  }
}

/** Tap your man again while leaning in: the camera drops to his eye level, looking where he looks. */
function startUnitCam(id: number) {
  if (!LIFE.unitCam || unit || aim || res) return;
  const me = s.soldiers[id];
  learn("unitcam");
  const face = facing(s, id, lastPull?.id === id ? lastPull.angle : undefined);
  unit = { id, t0: T, back: { ...cam.tgt } };
  const rot = rotFacing(face, cam.cur.rot);
  if (cam.tiltScale > 0 && lively()) cam.tgt = { ...cam.tgt, x: me.x, y: me.y, m: UNIT_CAM.m, tilt: UNIT_CAM.tilt, fy: UNIT_CAM.fy, rot };
  else cam.tgt = { ...cam.tgt, x: me.x, y: me.y, m: UNIT_CAM.flatM, tilt: 0, fy: 0.55, rot };
  if (!lively()) cam.snap(); // no swoop: just his view
  if (LIFE.chosen) life.add(id, { kind: "perk", t0: wall, amp: 1 });
  if (heard()) voice.say("look", id, me.owner, 0.05);
  speak("ready", id);
  feel("unitcam");
  status("");
  dirty = true;
}

/** Per frame while the unit cam runs: greet at the bottom, stand back up when it's time. */
function stepUnitCam() {
  const u = unit!;
  const p = phaseAt(T - u.t0, u.skip);
  if (p.phase === "hold" && !u.greeted) {
    u.greeted = true;
    const me = s.soldiers[u.id];
    if (LIFE.chosen) life.add(u.id, { kind: "hop", t0: wall, amp: 0.8 });
    if (heard() && seeded(u.id, s.turn, 63) < 0.35) voice.say("hup", u.id, me.owner, 0.08);
  }
  if ((p.phase === "rise" || p.phase === "done") && !u.rising) {
    u.rising = true;
    // back to where you were; or, if the touch that cut it short picked another man or stood you up, there
    if (selected === u.id) cam.tgt = { ...u.back };
    else if (selected === undefined) cam.overview(u.back.rot);
    else cam.tgt = { ...cam.tgt, rot: u.back.rot };
    if (!lively()) cam.snap();
    penDrop = T; // the pen comes back down onto him
    dirty = true; // includes the reduced/slow camera snap and the pen returning
    status();
  }
  if (p.phase === "done") { unit = null; dirty = true; }
}
/** Any touch cuts the unit cam short. */
function skipUnitCam() { if (unit && !unit.rising) unit.skip = T - unit.t0; }

/**
 * A flick just fired: plan how the page feels it (life.planFlick), on the wall
 * clock the boil draws by. Ink time is snagged on each kill; `when` turns a
 * place on the line into the wall ms at which the ink's head gets there.
 */
function feelFlick(o: Outcome, f: Flick, dur: number, snags: Snag[], seen: AnyState, volleyHold: number) {
  const when = (i: number, branch = 0) => wallTime(lineAt(o, dur, branch, i), snags) / speed;
  const arrive = wallTime(dur, snags) / speed;
  const plan = planFlick(seen, o, f.soldier, f.kind === "snipe" ? "shoot" : "move", when, arrive, arrive + volleyHold / speed);
  const on = (k: string) => (k === "recoil" || k === "flinch" || k === "gasp" ? LIFE.line : k === "land" ? LIFE.chosen : LIFE.crowd);
  for (const { id, r } of plan.acts) if (on(r.kind)) life.add(id, { ...r, t0: wall + r.t0 });
  if (LIFE.camps) for (const h of plan.hush) life.hold(h.base, wall + h.at, wall + h.at + h.ms);
  const st = countStreak(o, f, s.soldiers[f.soldier].owner); // counted even unheard, so it's right when the sound comes back
  if (!heard()) return;
  // under your thumb: your camp cheering your kill; the bot's ink going right past one of yours
  const shooter = s.soldiers[f.soldier].owner;
  const cheer = plan.acts.find((a) => a.r.kind === "cheer");
  if (cheer && !away(shooter)) after(cheer.r.t0 * speed, () => feel("cheer"));
  const close = plan.cues.find((c) => c.say === "eep" && !away(s.soldiers[c.id].owner));
  if (close && away(shooter)) after(close.at * speed, () => feel("flinch"));
  // a botch: graded from the flick as it ran; a spectacular one takes the page from the target's "phew"
  const bo = st.n === 0 && st.ended < 3 ? botchOf({
    kind: f.kind, from: o.path[0], aim: f.angle, path: o.path, ...(o.branches && { branches: o.branches }), killed: o.killed.length, lost: o.lost, crashed: o.crashed !== undefined,
    offPage: o.events.some((e) => e.kind === "edge") || (o.lost && o.crashed === undefined),
    foes: turn.aliveOf(seen, other(shooter)), own: seen.bases.filter((b) => b.owner === shooter),
  }) : null;
  const phew = plan.cues.find((c) => c.say === "phew");
  if (phew && (bo?.grade ?? 0) < 2) speak("phew", phew.id, wall + phew.at);
  // in writing: a lunger yells as he goes, a big snipe fires with a shout; a kill
  // (or the last one: the war is won) is claimed; a campmate mourns the fallen
  const camp = campOf(f.soldier);
  // a streak: the page reacts once the kill that keeps it going lands, bigger with every link; when a long one ends, the camp it tore through breathes out
  const seed = s.seed * 31 + s.turn * 977 + f.soldier;
  if (f.kind === "lunge" && camp !== undefined) speak("lunge", camp);
  else if (pathLen(o.path) > 480 && camp !== undefined) speak("snipe", camp);
  if (st.n >= 2) speakStreak(st.n, f.soldier, wall + arrive + 180, seed);
  else if (cheer && !o.lost) { if (s.phase === "over") { if (camp !== undefined) speak("win", camp, wall + cheer.r.t0 + 120); } else speak("kill", f.soldier, wall + cheer.r.t0 + 120); }
  if (bo?.grade) {
    const end = o.path[o.path.length - 1];
    speakBotch(bo.grade, f.soldier, end, wall + arrive + 260, seed + 5);
    if (bo.grade >= 2) botchBack = { who: shooter, turn: o.handover ? s.turn - 1 : s.turn }; // the turn he flicked in (a miss hands the pen over)
  }
  if (st.ended >= 3 && s.phase !== "over") {
    const foe = other(shooter), me = s.soldiers[f.soldier];
    const near = s.bases.filter((b) => b.owner === foe).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    if (near) speak("streakEnd", near.id, wall + arrive + 400);
  }
  const oh = plan.cues.find((c) => c.say === "oh");
  if (oh) speak("mourn", oh.id, wall + oh.at + 240);
  // a flick is one moment: one voice, now and then two, never the crowd
  for (const c of voice.curate(plan.cues, f.soldier * 131 + s.turn)) {
    const x = s.soldiers[c.id];
    voice.say(c.say, c.id, x.owner, c.at / 1000, c.gain, c.len);
  }
}

/**
 * A camp turns on an intruder: every living defender jabs a quick line at him
 * in a ripple round the ring, and he's crossed out. `at`: wall ms he lands.
 * `stamp`: the rules haven't crossed him out, so draw it (the dev hook; with
 * the lunge rule the engine's own cross is held back to land on the last jab).
 * Returns the plan, or null for an empty ring or disabled optional motion.
 */
function startVolley(base: number, target: { id: number; x: number; y: number }, at = wall, stamp = true, seen: AnyState = s) {
  if (!LIFE.crowd || !lively()) return null;
  const plan = planVolley(seen, base, target);
  if (!plan) return null;
  volley = { plan, t0: at, stamp };
  for (const { id, r } of plan.acts) life.add(id, { ...r, t0: at + r.t0 });
  if (stamp) life.still(target.id, at + plan.cross);
  if (LIFE.camps) life.hold(base, at + plan.cross, at + plan.cross + 500);
  if (heard()) {
    const lead = Math.max(0, at - wall);
    for (const c of voice.curate(plan.cues, target.id * 17 + base)) voice.say(c.say as voice.Say, c.id, s.soldiers[c.id].owner, (lead + c.at) / 1000, c.gain);
    after(lead * speed, () => { if (heard() && !away(s.soldiers[target.id].owner)) feel("volley"); });
    if (stamp) after((lead + plan.cross) * speed, () => { sfx.snag(false); sfx.cross(0.02, 1); });
    speak("deny", base, at + plan.cross + 260);
  }
  dirty = true;
  return plan;
}

// A side down to its last few (the core rules' last stand, cues.ts): one of them
// says so, once. The haptic for it is routed with the other cues.
onCue((c, p) => {
  if (c !== "last-stand" || p === undefined || !heard()) return;
  const few = turn.aliveOf(s, p as Player);
  if (few[0]) voice.say("uhoh", few[0].id, p as Player, 0.15, 0.8);
  if (few.length) {
    // beside the survivors: the one nearest their centre speaks
    const cx = few.reduce((a, x) => a + x.x, 0) / few.length, cy = few.reduce((a, x) => a + x.y, 0) / few.length;
    const mid = few.reduce((b, x) => (Math.hypot(x.x - cx, x.y - cy) < Math.hypot(b.x - cx, b.y - cy) ? x : b));
    announce("stand", mid.id, "LAST STAND!", 250);
  }
});

// Two with one, and a lunge chain: the earning flick's soldier writes it on the
// field. What stays (the "+1" beside the shooter, the chain's ring) is drawn from
// state, not from here.
let earnedBy: { id: number; kind: Kind } | null = null;
onCue((c) => {
  if (c !== "earned" || !earnedBy) return;
  const who = earnedBy, c0 = core();
  // the same note for both ways of earning another go: a snipe that took two, a lunge that killed
  const salt = (c0?.chain?.link ?? 0) * 8 + (c0?.left ?? 0);
  if (who.kind === "snipe") announce("more", who.id, "One more!", 120, "say", salt);
  else if (c0?.chain) announce("more", c0.chain.soldier, "One more!", 120, "say", salt);

});

// What the status line says after a flick.
function noteFor(who: Player, f: Flick, o: Outcome) {
  const k = o.killed.length;
  const v = turn.verb(s, f.kind);
  const c0 = core();
  if (o.crashed !== undefined) return k ? `${name(who)}'s lunger took ${k}, landed among them, and was shot` : `${name(who)}'s lunger landed among them and was shot`;
  if (o.lost) return `${name(who)} flicked a soldier off the page`;
  const stood = o.stood.length ? ` · ${o.stood.map((p) => name(p)).join(" and ")}: the last ${c0?.rules.lastStandAt ?? 4}, two flicks a turn` : "";
  if (o.earned && f.kind === "snipe") return `one more for ${name(who)}${stood}`;
  if (o.earned) return `${name(who)}'s lunger took ${k}: one more, lunge on or stop${stood}`;
  if (k) return `${name(who)}'s ${v === "shoot" ? "shot" : v === "move" ? "run" : v} crossed out ${k}${stood}`;
  return (f.kind === "lunge" ? `${name(who)} ${v === "move" ? "moved" : "lunged"}` : `${name(who)} missed`) + stood;
}

/** Ink ms at which the line a prism split off (or the main line, 0) has run `i` vertices. */
function lineAt(o: Outcome, dur: number, branch: number, i: number): number {
  if (!branch || !o.branches?.[branch - 1]) {
    const n = o.path.length - 1;
    return reachFraction(Math.min(n, Math.max(0, Math.round(i))), n) * dur;
  }
  const pts = o.branches[branch - 1], nb = pts.length - 1, from = splitMs(o, dur);
  return from + reachFraction(Math.min(nb, Math.max(0, Math.round(i))), nb) * Math.max(120, dur - from);
}
/** Ink ms at which that line's head reaches the point `p`. */
function inkAt(o: Outcome, dur: number, branch: number, p: Pt) {
  return lineAt(o, dur, branch, nearestIndex(branch && o.branches?.[branch - 1] ? o.branches[branch - 1] : o.path, p));
}
/** When the main line's ink head is at the split, so the other half sets out from there. */
function splitMs(o: Outcome, dur: number): number {
  const split = o.events.find((e) => e.kind === "split");
  const n = o.path.length - 1;
  return split ? Math.min(0.95 * dur, reachFraction(nearestIndex(o.path, split.at), n) * dur) : 0;
}

function nearestIndex(pts: Pt[], p: Pt) {
  let bi = 0, bd = Infinity;
  pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } });
  return bi;
}

/** The same eased, snag-aware ink head positions the rider, pen and live notes. */
function resolveHead(r: Resolve, it: number) {
  const p = Math.min(1, Math.max(0, it / r.dur));
  return headAt(r.o.path, 1 - Math.pow(1 - p, 2));
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
  const h = resolveHead(r, it);
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
    if (mode.kind === "room") link?.finish();
    else localStorage.removeItem("pft:save");
  }
  // the page is turned square to the desk, the way it will be filed
  cam.overview();
  cam.turnTo(0);
  after(500, () => {
    dawn.go(1, 2600);
    sfx.birds();
  });
  after(1500, () => { signing = true; fx.add("sign", T, 0, 1500, "linear"); sfx.stroke(1.2, 0.3, 2800); });
  after(3400, () => { busy = false; if (screen === "game") { viewBar(); showOver(); } });
  void w;
}

// --- title: the exercise book's cover --------------------------------------

let botLevel = (+(localStorage.getItem("pft:lvl") ?? 1) as Level);

// Quick battle's size: Quick, Classic, or Custom (bases and soldiers per base).
let sizeName: Size["name"] = (["quick", "classic", "custom", "long"] as const).find((k) => k === localStorage.getItem("pft:size")) ?? "quick";
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
  return `<p class="sizes">${one("quick", "quick", `${SIZES.quick.bases} × ${SIZES.quick.soldiers}`)}${one("classic", "classic", `${SIZES.classic.bases} × ${SIZES.classic.soldiers}`)}${one("custom", "custom", `${custom.bases} × ${custom.soldiers}`)}${one("long", "long war", `${SIZES.long.bases} shapes`)}</p>
    ${sizeName === "custom" ? `<p class="custom">${step("bases", "camps")}${step("soldiers", "men each")}</p>` : ""}`;
}

// The desk under the cover: the page you're on if it's on today's paper, or a clean sheet of it.
function titleDesk(saved = load()) {
  if (saved && paperOf(saved.s.page) === currentTheme()) { s = saved.s; mode = saved.mode; } else { s = newGame(SIZES.quick, 1); mode = { kind: "pnp" }; }
  cam.overview(rotFor(s.current));
  cam.snap();
  dirty = true;
}

let tearing: string | null = null; // a cover row waiting on "tear it out?"
let coverDraw: (() => void) | null = null; // redraws the slip to fit, while it shows the main menu

// The cover is the outside of the book: it never scrolls. Whatever is on the slip is
// drawn smaller until the whole leaf fits between the boards.
function fitLeaf() {
  const leaf = $("#cover .leaf");
  leaf.style.removeProperty("--fit");
  for (let i = 0; i < 3 && leaf.scrollHeight > leaf.clientHeight + 1; i++) {
    const z = +(leaf.style.getPropertyValue("--fit") || 1);
    leaf.style.setProperty("--fit", Math.max(0.5, z * leaf.clientHeight / leaf.scrollHeight - 0.005).toFixed(3));
  }
}
const coverFits = () => { const leaf = $("#cover .leaf"); return leaf.scrollHeight <= leaf.clientHeight + 1; };
function refitCover() {
  if (screen !== "title" || $("#cover").hidden) return;
  if (coverDraw) coverDraw(); else fitLeaf();
}
window.addEventListener("resize", refitCover);
void document.fonts.ready.then(refitCover);

function showTitle() {
  screen = "title";
  tearing = null;
  leaveRoom();
  restoreLabel();
  reset();
  applyTheme(homeTheme());
  closeSheet();
  restoreKindBar();
  dawn.set(0);
  const cover = $("#cover");
  cover.hidden = false; // shown first: the slip measures itself to fit
  cover.classList.remove("open");
  coverMenu();
  // the lamp comes on
  if (lampOn.to < 1 && !later.some((l) => l.fn === switchOn)) whenever(450, switchOn);
}

// The slip tucked in the cover, and the page on the desk under it.
function coverMenu() {
  fileFinishedSave();
  const saved = load();
  const d = drawer();
  titleDesk(saved);
  hud();
  const canResume = saved && saved.s.phase !== "over";
  // a page started on another paper says so
  const elsewhere = saved && paperOf(saved.s.page) !== currentTheme() ? ` · ${themeOf(saved.s.page?.theme).name.toLowerCase()}` : "";
  const menu = $("#cover .menu");
  menu.querySelector(".note")?.remove();
  const mark = $("#cover .tabs .m1 sup");
  mark.textContent = d.length ? String(d.length) : "";
  const where = (x: AnyState) => x.phase === "setup" ? `still drawing ${baseWord(undefined, x)}s` : x.phase === "position" ? "arranging the men" : `turn ${x.turn}, ${turn.aliveOf(x, 0).length} v ${turn.aliveOf(x, 1).length}${turn.isLegacy(x) ? " · first rules" : turn.shaped(x) ? " · long war" : ""}`;
  const draw = () => {
    const note = menu.querySelector(".note")?.textContent;
    // "tear it out?" is written over its row, which fades underneath: asking never moves the slip
    const carry = canResume ? `
      <div class="carry">
        <span class="carry-icon">${paperIcon(themeOf(saved!.s.page?.theme).paper, -2)}</span><button data-a="resume" class="ink blue">carry on ${saved!.s.page ? `page ${saved!.s.page.no}` : "this page"}<small>${where(saved!.s)}${elsewhere}</small></button>
        <button data-a="ask" data-code="local" class="x" aria-label="tear this page out">×</button>${tearing === "local" ? `
        <div class="tearing">
          <p class="ask">tear it out<br>for good?</p>
          <span class="acts"><button data-a="tear" data-code="local" class="ico rip" aria-label="tear this page out for good">${tearIcon()}</button><button data-a="keep" class="ico" aria-label="keep it">${keepIcon()}</button></span>
        </div>` : ""}
      </div>` : "";
    const slip = (rows: number) => `${note ? `<p class="note">${esc(note)}</p>` : ""}${carry}${friendsList(rows)}
    <h2 class="sect">new game</h2>
    ${sizeRow()}
    <div class="bot">
      <button data-a="bot" class="ink red">play Dawood-bot</button>
      <button data-lvl="next" class="level" aria-label="Dawood-bot flicks ${LEVELS[botLevel]}: tap to change">${LEVELS[botLevel]}${levelIcon(botLevel)}</button>
    </div>
    <div class="duo">
      <button data-a="pnp" class="ink blue">pass &amp; play<small>one phone</small></button>
      <button data-a="friend" class="ink blue">play a friend<small>send a link</small></button>
    </div>`;
    // as many friends' games as fit; the rest wait in the drawer
    $("#cover .leaf").style.removeProperty("--fit");
    let rows = COVER_GAMES;
    do menu.innerHTML = slip(rows); while (!coverFits() && rows-- > 0);
    fitLeaf();
  };
  coverDraw = draw;
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
    else if (a === "friend") newRoomOnCover();
    else if (a === "ask") { tearing = b.dataset.code!; draw(); }
    else if (a === "keep") { tearing = null; draw(); }
    else if (a === "tear") {
      const code = b.dataset.code!;
      if (code === "local") { localStorage.removeItem("pft:save"); tearing = null; sfx.rustle(); coverMenu(); return; }
      forgetRoom(localStorage, code);
      tearing = null;
      sfx.rustle();
      draw();
    } else if (a === "more") showDrawer();
    else if (b.dataset.room) { const x = readRoom(localStorage, b.dataset.room); if (x) enterRoom(x); }
    else if (b.dataset.lvl) {
      const focused = document.activeElement === b;
      botLevel = (botLevel + 1) % LEVELS.length as Level; // one word, tapped round: sloppy, steady, sharp
      localStorage.setItem("pft:lvl", String(botLevel));
      draw();
      if (focused) menu.querySelector<HTMLButtonElement>("[data-lvl]")!.focus({ preventScroll: true });
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

// the bookmarks on the cover's top edge
$("#cover .tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  sfx.unlock();
  sfx.tap();
  if (b.dataset.a === "how") showHow();
  else if (b.dataset.a === "drawer") showDrawer();
  else if (b.dataset.a === "settings") showSettings();
});

function switchOn() {
  sfx.lamp();
  const kind = theme.light.switch;
  if (kind === "day") lampOn.go(1, 700); // daylight: the room just brightens
  else if (kind === "tube") {
    // a tube light: blinks twice on its starter, then catches
    lampOn.go(0.55, 30);
    whenever(60, () => lampOn.go(0.08, 40));
    whenever(210, () => lampOn.go(0.65, 30));
    whenever(270, () => lampOn.go(0.12, 50));
    whenever(430, () => lampOn.go(1, 80));
  } else {
    // a lamp's flicker: on, off, on
    lampOn.go(0.75, 40);
    whenever(70, () => lampOn.go(0.15, 50));
    whenever(160, () => lampOn.go(1, 180));
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
  if (turn.shaped(s)) return showHowLong();
  sheet(`
    <h2>How Dawood played it</h2>
    <ol>
      <li>Take turns drawing camps, each jotted full of men. Then arrange your men: in camp, or just outside the wall.</li>
      <li>On your go, pick up one soldier. Pull back from anywhere on the screen and let go, like flicking a pen stood on its tip: a small pull is a short line, a long one crosses the page (lunge and snipe reach alike).</li>
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

// The long war's help: book 1 still holds; these are what it adds, short enough to read at the desk.
function showHowLong() {
  sheet(`
    <h2>The long war</h2>
    <ol>
      <li>Six bases each, dragged up from the shape cards, any mix. Then arrange your men, and flick, snipe or lunge, as in a quick battle.</li>
      <li><b>Camp</b>, 12 men: lines passing near it bend round it, anyone's, harder the fuller it is.</li>
      <li><b>Prism</b>, 8: your snipes passing out through it split in two. Its walls don't slow your own lines.</li>
      <li><b>Cushion</b>, 8: a glancing line banks off it, anyone's; a straight one goes in.</li>
      <li><b>Square</b>, 8: your lines passing out through it are ruled dead straight, and nothing on the page can bend them.</li>
      <li><b>Pentagon</b>, 8: your lines passing out through it turn on the nearest enemy man ahead.</li>
      <li>Old ink jolts a line a little, and draws a shallow one along its groove. Your pencil guide shows where the page will take your line; your hand still wobbles.</li>
      <li><b>Sends walk while you aim</b>: a convoy walks a stretch of its road each turn, in real time, and is out for two or three. Lead it.</li>
    </ol>
    <p class="fine">Men keep their base's shape wherever they go. The second rulebook has it all, with drawings.</p>
    <a class="act" href="/rules/advanced">the long war rulebook</a>
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
    ${row("voices", voice.level > 0, `voices: ${voice.levelName()}`, "the soldiers' little voices")}
    ${motion.settingsHtml(row)}
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
    if (motion.settingsClick(b, () => { if (!$("#sheet").hidden) showSettings(); })) return;
    const k = b.dataset.set;
    if (b.dataset.theme || k === "surprise") {
      const id = b.dataset.theme ?? null;
      // tapping your pick again, or "surprise", goes back to a surprise each load
      chooseTheme(id && id !== chosen ? id : null);
      if (screen === "title") coverMenu(); // the desk and the slip follow the new paper
      sfx.rustle();
    } else if (k === "sound") sfx.setMuted(!sfx.muted);
    else if (k === "haptics") { haptics.setEnabled(!haptics.enabled); haptic("tap"); }
    else if (k === "voices") {
      // on, soft, off
      voice.setLevel(voice.level >= 1 ? 0.5 : voice.level > 0 ? 0 : 1);
      const mine = turn.aliveOf(s, s.current)[0] ?? s.soldiers[0];
      if (mine) voice.say("hup", mine.id, mine.owner, 0.05);
    }
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
    <p class="sub">morning. page ${s.page?.no ?? ""} is done${turn.shaped(s) ? ": a long war" : ""}.</p>
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
    <div class="friends"></div>
    <button class="act" data-a="back">back</button>`, "drawer");
  // every game with a friend on this phone: the cover only has room for a few
  const friends = card.querySelector(".friends")!;
  const games = () => { friends.innerHTML = friendsList(Infinity, true); };
  games();
  const grid = card.querySelector(".pages")!;
  d.forEach((r, i) => {
    const b = document.createElement("button");
    b.className = "page";
    b.dataset.i = String(i);
    b.appendChild(thumb(r, 130));
    const names = themeOf(r.page?.theme).ink.names;
    const who = r.mode.kind === "bot" ? [names[0], "Dawood-bot"] : names;
    const cap = document.createElement("span");
    cap.innerHTML = `No. ${r.page?.no ?? "?"} · ${r.page?.date ?? ""}<br><b style="color:${hudPen(r.winner ?? 0)}">${r.winner !== undefined ? who[r.winner] : "unfinished"}</b> · ${r.turns} turns${r.v === 2 && r.rules?.long ? " · long war" : ""}`;
    b.appendChild(cap);
    grid.appendChild(b);
  });
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    sfx.tap();
    const a = b.dataset.a;
    if (a === "back") { tearing = null; return closeSheet(); }
    if (b.dataset.i) return viewPage(d[+b.dataset.i]);
    if (a === "ask") tearing = b.dataset.code!;
    else if (a === "keep") tearing = null;
    else if (a === "tear") { forgetRoom(localStorage, b.dataset.code!); tearing = null; sfx.rustle(); coverDraw?.(); }
    else if (b.dataset.room) { const x = readRoom(localStorage, b.dataset.room); tearing = null; if (x) enterRoom(x); return; }
    else return;
    games();
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
  kindEl.dataset.bar = "view";
  kindEl.classList.remove("shapes");
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
  kindEl.dataset.bar = "kinds";
  kindEl.classList.remove("shapes");
  kindEl.innerHTML = `<button data-kind="lunge" role="radio"><b>lunge</b><i></i></button><button data-kind="snipe" role="radio"><b>snipe</b><i></i></button>`;
  bindKind();
}

// The long war's setup: five shape cards, each the base drawn in ink with
// its men jotted in. Press one and drag a copy of it up onto the page; let go
// to draw it there, or back over the cards to put it back. `shape` is the one in hand.
let shape: Shape = "camp";
/** What each shape does: the card carries only its name and men, this is the status line while it is pressed. */
const SHAPE_CARD: Record<Shape, string> = { camp: "12 men · bends lines round it", prism: "8 men · splits your shots", cushion: "8 men · banks glancing lines", square: "8 men · rules your lines straight", pentagon: "8 men · homes your lines on them" };
const CARD_PX = 30; // the card's drawing
let cardPen = -1; // whose pen the cards are drawn in
let carrying: { id: number; off: number; shape: Shape; sx: number; sy: number; moved: boolean; el: HTMLButtonElement } | null = null;
let ghostWasOk: boolean | undefined;

function shapeBar() {
  const kindEl = $("#kind");
  kindEl.dataset.bar = "shapes";
  kindEl.classList.add("shapes");
  kindEl.onclick = null;
  cardPen = s.current;
  kindEl.innerHTML = SHAPES.map((k) => `<button data-shape="${k}" aria-label="drag a ${k} onto the page"><canvas></canvas><b>${k}</b><i>${LONG.long!.shapes[k].soldiers} men</i></button>`).join("");
  for (const b of kindEl.querySelectorAll<HTMLButtonElement>("button[data-shape]")) {
    drawCard(b.querySelector("canvas")!, b.dataset.shape as Shape);
    b.onpointerdown = (e) => pickCard(e, b);
    b.onpointermove = (e) => carryCard(e);
    b.onpointerup = b.onpointercancel = (e) => dropCard(e);
  }
}

/** A shape card's drawing: the base in the current player's ink, its full garrison jotted in, a prism or pentagon point up, a square flat. */
function drawCard(cv: HTMLCanvasElement, k: Shape) {
  const d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.round(CARD_PX * d);
  cv.style.width = cv.style.height = `${CARD_PX}px`;
  const ctx = cv.getContext("2d")!;
  const L = LONG.long!, owner = s.current as Player;
  const r = RULES.baseRadius * L.shapes[k].size, k0 = 12.5 / RULES.baseRadius;
  const b: Base = { id: 0, owner, x: 0, y: 0, r, seed: 4243 + k.length * 31, shape: k, ...(k !== "camp" && { rot: k === "prism" || k === "pentagon" ? -Math.PI / 2 : k === "square" ? Math.PI / 4 : 0 }) };
  ctx.scale(d, d);
  ctx.translate(CARD_PX / 2, CARD_PX / 2 + (k === "prism" ? r * k0 * 0.22 : k === "pentagon" ? r * k0 * 0.1 : 0));
  ctx.scale(k0, k0);
  const vs = corners(b), w = (2.8 / k0) * 0.5 * theme.ink.width;
  if (vs) inkLib.inkPolygon(ctx, vs, INK.pens[owner], b.seed, w, 2);
  else inkLib.inkCircle(ctx, 0, 0, r, INK.pens[owner], b.seed, w, 2);
  scatterIn(b, L.shapes[k].soldiers, 99).forEach((p, i) => {
    const man = { id: 900 + i, owner, x: p.x, y: p.y, shape: k, rot: b.rot };
    drawDot(ctx, man, 1, 1, p, 0, 1.6);
  });
}

/** The cards wiggle: what you tapped is something you drag. */
function nudgeCards(only?: HTMLElement) {
  if (reduced || slow) return;
  for (const c of document.querySelectorAll<HTMLElement>("#kind button[data-shape]")) if (!only || c === only) c.animate([{ rotate: "0deg" }, { rotate: "1.5deg" }, { rotate: "-1.5deg" }, { rotate: "0deg" }], { duration: 240 });
}

/** The drawing lifting off a card toward (x, y) on screen, or settling back onto it. */
function flyCopy(card: HTMLElement, x: number, y: number, back = false) {
  if (reduced || slow) return;
  const src = card.querySelector("canvas")!, at = src.getBoundingClientRect();
  const fly = document.createElement("canvas");
  fly.width = src.width; fly.height = src.height;
  fly.getContext("2d")!.drawImage(src, 0, 0);
  Object.assign(fly.style, { position: "fixed", left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px`, pointerEvents: "none", zIndex: "30" });
  document.body.appendChild(fly);
  const scale = Math.max(1, (RULES.baseRadius * cam.cur.m * 2) / CARD_PX);
  const there = `translate(${x - at.left - at.width / 2}px, ${y - at.top - at.height / 2}px) scale(${scale})`;
  const frames = [{ transform: "none", opacity: 1 }, { transform: there, opacity: 0.15 }];
  fly.animate(back ? frames.reverse() : frames, { duration: back ? 140 : 160, easing: "cubic-bezier(.2,.9,.3,1.1)" }).onfinish = () => fly.remove();
}

function pickCard(e: PointerEvent, b: HTMLButtonElement) {
  if (!humanTurn() || s.phase !== "setup" || carrying) return;
  e.preventDefault();
  b.setPointerCapture(e.pointerId);
  sfx.unlock();
  sfx.pick();
  haptic("pickup");
  carrying = { id: e.pointerId, off: e.pointerType === "touch" ? 80 : 0, shape: b.dataset.shape as Shape, sx: e.clientX, sy: e.clientY, moved: false, el: b };
  shape = carrying.shape;
  ghostWasOk = undefined;
  $("#kind").classList.add("carrying");
  b.classList.add("held");
  status(`${shape}: ${SHAPE_CARD[shape].split(" · ")[1]}`);
}

function carryCard(e: PointerEvent) {
  const c = carrying;
  if (!c || e.pointerId !== c.id) return;
  if (!c.moved) {
    if (Math.hypot(e.clientX - c.sx, e.clientY - c.sy) < TAP) return;
    c.moved = true;
    flyCopy(c.el, e.clientX, e.clientY - c.off);
  }
  moveGhost(e.clientX, e.clientY - c.off);
  if (ghost && ghostWasOk === true && !ghost.ok) haptic("notch", 1);
  ghostWasOk = ghost?.ok;
}

function dropCard(e: PointerEvent) {
  const c = carrying;
  if (!c || e.pointerId !== c.id) return;
  carrying = null;
  $("#kind").classList.remove("carrying");
  c.el.classList.remove("held");
  // let go well inside the cards, off the page, or somewhere it can't go: it goes back
  const cards = $("#kind").getBoundingClientRect();
  const back = e.clientY > cards.top + 24 || !ghost?.ok || e.type !== "pointerup" || !humanTurn();
  if (!c.moved) { ghost = undefined; nudgeCards(c.el); status(`drag a ${c.shape} onto the page`); dirty = true; return; }
  if (back) {
    if (ghost && e.type === "pointerup") flyCopy(c.el, e.clientX, e.clientY - c.off, true);
    sfx.tap();
    ghost = undefined;
    status();
    dirty = true;
    return;
  }
  learn("place");
  fx.clear();
  const at = ghost!;
  ghost = undefined;
  drawBase(at.x, at.y, 1, c.shape);
  haptic("settle");
  afterBase();
  status();
  dirty = true;
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
  $("#kind").dataset.bar = "view";
  $("#kind").classList.remove("shapes");
  $("#kind").innerHTML = `<button data-v="stop"><b>stop</b><i>jump to the end</i></button>`;
  $("#kind").onclick = () => viewPage(r);
  after(500, replayNext);
}
function replayNext() {
  if (screen !== "replay") return;
  const st = replayQueue.shift();
  if (!st) {
    after(300, () => { dawn.go(1, 1600); sfx.birds(); signing = true; fx.add("sign", T, 400, 1200, "linear"); });
    after(2200, () => { if (screen === "replay" && viewing) { screen = "view"; hud(); viewBar(); } });
    return;
  }
  if (st.t === "legacy-base" || st.t === "base") { drawBase(st.x, st.y, 0.45, st.t === "base" ? st.shape : undefined); after(560, replayNext); }
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
let roomEntry: AbortController | null = null;
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
  if (s.phase === "over" && !l.queued) { signing = true; viewBar(); return void after(400, showOver); }
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
  if (a.t === "base") after(400, () => { drawBase(a.x, a.y, 1, a.shape); after(900, then); });
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
  if (busy) return s.phase === "setup" ? `${who} is drawing a ${baseWord()}…` : s.phase === "position" ? `${who} is arranging…` : `${who} is lining up…`;
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
    <button class="act red" data-a="back">${s.bases.length === 0 && l.seat === 0 ? `draw your first ${baseWord()}` : "back to the page"}</button>
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
  roomEntry?.abort();
  roomEntry = null;
  $("#cover .label input")?.replaceWith(Object.assign(document.createElement("b"), { className: "hand blue", textContent: "Dawood" }));
}
function coverNote(t: string) {
  const menu = $("#cover .menu");
  let n = menu.querySelector(".note");
  if (!n) { n = document.createElement("p"); n.className = "note"; menu.prepend(n); }
  n.textContent = t;
  refitCover();
}

/** The cover lists at most this many games with friends; fewer on a short phone. */
const COVER_GAMES = 4;

// Games with friends: the first `max` still running go on the cover's slip, and the
// drawer (`all`) lists every one, finished ones last.
function friendsList(max: number, drawerList = false) {
  const all = listRooms(localStorage);
  const rooms = new Map(all.map((r) => [r.code, r]));
  const { running, finished } = orderGames(all);
  if (!running.length && !finished.length) return "";
  const tilt = (c: string) => [...c].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 7 - 3;
  const acts = (code: string, tear: string, keep: string) =>
    `<span class="acts"><button data-a="tear" data-code="${esc(code)}" class="ico rip" aria-label="${tear}">${tearIcon()}</button><button data-a="keep" class="ico" aria-label="${keep}">${keepIcon()}</button></span>`;
  const row = (g: GameLine) => {
    const r = rooms.get(g.code)!;
    return `<li class="game ${g.yours ? "yours" : g.running ? "theirs" : "done"}">
      <button data-room="${esc(g.code)}" class="go">${paperIcon(themeOf(r.theme ?? r.setup?.page?.theme).paper, tilt(g.code))}<b>${esc(g.foe)}</b>${g.standing ? `<span>${g.standing}</span>` : ""}${g.turn && g.running ? `<small>turn ${g.turn}</small>` : ""}</button>
      <button data-a="ask" data-code="${esc(g.code)}" class="x" aria-label="tear ${esc(g.foe)}'s game out of this phone">×</button>${tearing === g.code ? `
      <div class="tearing">
        <p class="ask">tear it out?<br>${esc(g.foe)} keeps theirs</p>
        ${acts(g.code, `tear ${esc(g.foe)}'s game out of this phone`, "keep it")}
      </div>` : ""}
    </li>`;
  };
  if (drawerList) return `<h3>games with friends</h3><ul class="games">${[...running, ...finished].map(row).join("")}</ul>`;
  if (!running.length) return ""; // finished games are in the drawer
  const shown = running.slice(0, max);
  const rest = running.length - shown.length + finished.length;
  // a game waiting on you that didn't fit: the count is circled, like "your go"
  const waiting = running.slice(shown.length).filter((g) => g.yours).length;
  return `<h2 class="sect">games with friends${rest ? `<button data-a="more" class="pencil${waiting ? " yours" : ""}" aria-label="${rest} more in the drawer${waiting ? `, ${waiting} of them your go` : ""}">+${rest}</button>` : ""}</h2>
    <ul class="games">${shown.map(row).join("")}</ul>`;
}

function newRoomOnCover() {
  roomEntry?.abort();
  const entry = roomEntry = new AbortController();
  const input = nameOnLabel();
  const menu = $("#cover .menu");
  coverDraw = null;
  menu.innerHTML = `
    <p class="note">write your name on the label</p>
    <button data-a="make" class="ink blue">start a page for two<small>you get a link to send</small></button>
    <p class="row"><button data-a="back" class="pencil">back</button></p>`;
  fitLeaf();
  input.focus();
  const go = async (b: HTMLButtonElement) => {
    const who = cleanName(input.value);
    if (!who) { coverNote("your name first, on the label"); return input.focus(); }
    localStorage.setItem("pft:name", who);
    b.disabled = true;
    coverNote("tearing out a page…");
    try {
      const setup = setupOf(newGame(pickedSize(), undefined, pageStamp(), rulesFor(pickedSize())));
      const theme = currentTheme();
      const engine = engineFor(setup.rules);
      const c = await roomApi.create({ name: who, engine, setup, theme }, entry.signal);
      const d: RoomSaved = { v: 1, code: c.code, seat: 0, secret: c.secret, engine, setup, theme, names: [who, null], log: [], applied: 0, pending: [], updated: Date.now() };
      new RoomLink(d, { api: roomApi, storage: localStorage }).save();
      if (entry.signal.aborted) return;
      restoreLabel();
      enterRoom(d);
      showShare();
    } catch (e) {
      if (entry.signal.aborted) return;
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
  coverDraw = null;
  menu.innerHTML = `<p class="note">opening the page…</p>`;
  fitLeaf();
  let v: RoomView;
  try {
    v = await roomApi.read(code);
  } catch (e) {
    return home(e instanceof RoomHttpError && e.status === 404 ? "that page has gone: links last 30 days after the last move" : "couldn't open that page: check your signal and open the link again");
  }
  if (!roomCanRead(v.engine)) return home("that page needs a newer copy of the game: reload");
  roomEntry?.abort();
  const entry = roomEntry = new AbortController();
  const host = v.names[0];
  const input = v.names[1] === null ? nameOnLabel() : null;
  menu.innerHTML = input ? `
      <p class="note"><b>${esc(host)}</b> challenges you. Write your name on the label.</p>
      <button data-a="take" class="ink red">take the red pen<small>${esc(host)} draws first</small></button>
      <p class="row"><button data-a="watch" class="pencil">just watch</button><button data-a="back" class="pencil">not now</button></p>`
    : `<p class="note">${esc(host)} v ${esc(v.names[1] ?? "")}</p>
      <button data-a="watch" class="ink blue">watch the war<small>both pens are taken</small></button>
      <p class="row"><button data-a="back" class="pencil">back</button></p>`;
  fitLeaf();
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
      const j = await roomApi.join(code, who, entry.signal);
      const d = saved(j.seat, j.secret, j.seat === 1 ? [host, who] : [who, v.names[1]]);
      // Watch may already have opened this same page while the claim was in flight.
      // Retain its current log and give that link the credentials too, so its
      // next save cannot overwrite the recovered seat with a spectator record.
      if (j.seat !== null && entry.signal.aborted && link?.code === code && link.seat === null) {
        Object.assign(link.data, { seat: j.seat, secret: j.secret, names: d.names });
        link.save();
        hud();
        return;
      }
      if (j.seat !== null) new RoomLink(d, { api: roomApi, storage: localStorage }).save();
      if (entry.signal.aborted) return;
      restoreLabel();
      if (j.seat === null) { enterRoom(saved(null, null, v.names)); lastNote = "someone got to the red pen first: you're watching"; return hud(); }
      enterRoom(d);
    } catch (e) {
      if (entry.signal.aborted) return;
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
document.addEventListener("visibilitychange", () => {
  // No hidden interval belongs to the next visible march frame.
  last = performance.now();
  if (!document.hidden) link?.wake();
});
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
  | { t: "aim"; id: number; sx: number; sy: number; tapOn?: number; again?: boolean }
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
    if (wallGap(b, w) <= slack && d < bd) { bd = d; best = b.id; }
  }
  return best;
}

function select(id: number) {
  if (selected !== id) { sfx.pick(); haptic("pickup"); penDrop = T; pickUp(id); }
  if (!taught("aim") && selected === undefined) fx.add("teach", T, 500, 1100, "linear");
  selected = id;
  faceForward();
  sitOn(s.soldiers[id]);
  dirty = true;
  acts();
  status();
}

/**
 * Aiming only ever happens leaned in over the soldier in hand, under the fog:
 * the camera is sitting on him (close, tilted unless "sit down to aim" is off).
 * Anything that moves the camera off him (a pinch, the wheel) puts him down.
 */
function leanedIn(id: number | undefined) {
  if (id === undefined) return false;
  const p = s.soldiers[id], t = cam.tgt;
  return t.m >= 1.9 && Math.hypot(t.x - p.x, t.y - p.y) < 2 && (cam.tiltScale === 0 || t.tilt > 0.3);
}

function standUp() {
  if (selected !== undefined && LIFE.pen && lively() && screen === "game") { const me = s.soldiers[selected]; penLift = { t0: T, x: me.x, y: me.y, owner: me.owner }; }
  selected = undefined;
  motion.lower();
  faceForward();
  cam.overview();
  dirty = true;
  acts();
  status();
}

function pinchInfo() {
  const [a, b] = [...ptrs.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

const humanTurn = () => screen === "game" && !away(s.current) && !busy && $("#sheet").hidden;

over.addEventListener("pointerdown", (e) => {
  sfx.unlock();
  const cut = !!unit && !unit.rising;
  skipUnitCam();
  // touching the screen puts a raised phone down (the touch then does what it always did)
  gunTap = !!motion.gun;
  if (motion.gun) lowerGun();
  over.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    // two fingers always mean the camera: put the soldier down (no aim survives
    // zoomed out, out of the fog), then zoom
    if (aim) sfx.creak(0);
    aim = null;
    faceForward();
    ghost = undefined;
    if (selected !== undefined) standUp();
    if (cam.cur.tilt > 0.02 || cam.tgt.tilt > 0) { cam.tgt = { ...cam.tgt, tilt: 0, fy: cam.fitFy }; cam.cur = { ...cam.cur, tilt: 0, fy: cam.fitFy }; }
    const { d } = pinchInfo();
    g = { t: "pinch", d0: d, m0: cam.cur.m };
    dirty = true;
    status();
    return;
  }
  if (ptrs.size > 2) return;
  const w = cam.toWorld(e.clientX, e.clientY);
  if (humanTurn() && s.phase === "setup" && turn.shaped(s)) {
    // a long war's bases come from the cards, not the page
    nudgeCards();
    status("drag a base up from the cards");
  } else if (humanTurn() && s.phase === "setup") {
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
    // a soldier in hand but the camera off him (never should be): put him down, then treat this as a fresh touch
    if (selected !== undefined && !leanedIn(selected)) standUp();
    if (near !== undefined || selected !== undefined) {
      // a second tap on the man already in hand: the unit cam, on lift
      const again = !cut && near !== undefined && near === selected;
      if (near !== undefined && near !== selected) select(near);
      g = { t: "aim", id: e.pointerId, sx: e.clientX, sy: e.clientY, tapOn: near, again };
      return;
    }
  }
  g = { t: "pan", id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY };
});

function moveGhost(sx: number, sy: number) {
  const w = cam.toWorld(sx, sy);
  if (!w) return;
  const sh = turn.shaped(s) ? shape : undefined;
  const why = turn.canPlaceBase(s, w.x, w.y, sh);
  const b = turn.isLegacy(s) ? undefined : baseAt(s, w.x, w.y, sh);
  // a long war's base shows its men pencilled in, exactly where they'll be jotted
  const men = b && sh ? scatterIn(b, turn.perBase(s, sh), b.seed).map((p) => ({ ...p, shape: sh, rot: b.rot })) : undefined;
  ghost = { x: w.x, y: w.y, ok: !why, owner: s.current, r: b?.r ?? RULES.baseRadius, ...(b && corners(b) && { pts: corners(b)! }), ...(men && { men }) };
  status(why ? `can't draw here: ${why}` : `${sh ? "let go" : "lift"} to draw the ${sh ?? "camp"}`);
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
      if (!leanedIn(selected)) { standUp(); g = { t: "none" }; return; }
      if (leanOf() < 0.6) return; // still easing in from the page view: the aim waits until he's under the fog
      // a pull begun low on the screen (a camp near the bottom of the page) gets full power in the room it has
      aim = { soldierId: selected, kind, ax: 0, ay: 0, x: 0, y: 0, t0: T, charged: false, span: pullSpan(g.sy, H) };
      aimFrom = forwardAngle();
      speak("aim", selected);
      ratchet.reset();
      dial.reset();
      acts();
      nudgeFrom = motion.held();
    }
    updateAim(e.clientX, e.clientY);
    status();
    dirty = true;
  }
});

// The thumb does two separate things: sliding sideways turns the page (the aim
// angle is where it began plus TURN_K per px, nothing to do with how far the
// camera has caught up), and pulling down sets the power. The camera follows
// the angle, so the shot always points up the screen and the pull comes down.
function updateAim(x: number, y: number) {
  if (!aim || g.t !== "aim") return;
  const dx = x - g.sx, dy = y - g.sy;
  thumbX = x;
  const eff = Math.sign(dx) * Math.max(0, Math.abs(dx) - TURN_DEAD);
  byThumb = { angle: aimFrom + eff * turnK(), dist: Math.max(0, dy) };
  steer();
  aim.kind = kind;
  const p = pull(aim);
  if (p.live && !aim.charged) { aim.charged = true; aim.t0 = T; }
  // a ratchet: detents as power builds, tightening toward full
  if (ratchet.step(p.power, p.live) !== null) haptic("notch", p.power);
  // and a dial: the page clicks past every 30 degrees of turn, firmer passing straight ahead. Felt, never snapped to.
  const k = dial.step(eff * turnK());
  if (k !== null) { const home = Dial.home(k); haptic("dial", home ? 1 : 0); sfx.dial(home); }
}
const ratchet = new Ratchet();
const dial = new Dial();

// The thumb sets the aim; with the motion levels on, the phone's tilt trims it
// and the hand's tremor sets the wobble. Either way it ends up in the pull, so
// the flick that's released (and recorded) already has it.
function steer() {
  if (!aim) return;
  const n = motion.nudged(nudgeFrom);
  aimAngle = byThumb.angle + n.angle;
  penSide = n.side;
  aim.x = -Math.cos(aimAngle) * byThumb.dist;
  aim.y = -Math.sin(aimAngle) * byThumb.dist;
  aim.steady = motion.steady();
  cam.aimUp(aimAngle);
  if (reduced) cam.cur.rot = cam.tgt.rot; // no easing: the page is under your thumb
}

// Pen falcon: tap a soldier, raise the phone and point it; a flick of the wrist fires.
function raiseGun() {
  if (selected === undefined || !motion.raise()) return;
  gunFwd = screenDirToWorld(cam.view(), s.soldiers[selected], 0, -1); // straight up the screen
  lastArmed = false;
  status();
  dirty = true;
}
function lowerGun(why?: string) {
  motion.lower();
  status(why);
  dirty = true;
}
let lastArmed = false;
function stepGun() {
  // the soldier was put down (send, stop), a sheet opened, or the turn moved on: the raised phone goes with it
  if (selected === undefined || screen !== "game" || away(s.current) || !$("#sheet").hidden) return lowerGun();
  const e = motion.gun!.take();
  if (e?.t === "lowered") return lowerGun("phone lowered: pull back, or tap him to raise it again");
  if (e?.t === "fire") {
    const id = selected;
    motion.lower();
    if (id === undefined || !humanTurn() || !turn.canFlick(s, id, kind) || !leanedIn(id)) return;
    learn("aim");
    const f = release(gunPull(id, kind, gunFwd + e.delta, e.power, T), T, (pw) => turn.lengthFor(s, kind, pw), turn.handFor(s, id, kind))!;
    haptic("flick", e.power);
    return fire(stamped(f), e.power, penLean(e.power));
  }
  const armed = motion.gun!.armed >= 1;
  // the sight has closed: a detent you feel
  if (armed !== lastArmed) { lastArmed = armed; if (armed) haptic("notch", 1); status(); }
}

function up(e: PointerEvent) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId)!;
  ptrs.delete(e.pointerId);
  if (g.t === "pinch") { if (ptrs.size === 0) g = { t: "none" }; return; }
  if (g.t === "place" && g.id === e.pointerId) {
    if (e.type === "pointerup" && ghost?.ok && humanTurn()) {
      learn("place");
      fx.clear();
      drawBase(ghost.x, ghost.y, 1, turn.shaped(s) ? shape : undefined);
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
      if (aim.charged && !pull(aim).live) {
        // thumb back at the start: a cancel, quietly. He stays picked up.
        aim = null;
        faceForward();
        sfx.creak(0);
        g = { t: "none" };
        acts();
        status();
        dirty = true;
        return;
      }
      const f = release(aim, T, (pw) => turn.lengthFor(s, kind, pw), turn.handFor(s, aim.soldierId, kind));
      const pw = pull(aim).power;
      const lean = penLean(pw);
      aim = null;
      sfx.creak(0);
      if (f && !leanedIn(f.soldier)) { standUp(); status(); }
      else if (f && turn.canFlick(s, f.soldier, f.kind)) { learn("aim"); haptic("flick", pw); fire(stamped(f), pw, lean); }
      else { status("too soft: pull back further"); if (selected !== undefined) lastPull = { id: selected, angle: aimAngle }; }
    } else if (tapped && gunTap) {
      // that tap put the raised phone down
    } else if (tapped && g.tapOn === undefined) {
      standUp(); // tap on empty paper puts the pen down
    } else if (tapped) {
      // tap your pick again: raise the phone to aim by hand, or (no motion sensor) drop to his eye level
      if (g.again && selected !== undefined && !motion.live("gun")) startUnitCam(selected);
      else raiseGun();
    }
    aim = null;
    // a fired shot keeps the page turned its way until the ink lands (fire() turns it back); anything else faces forward now
    if (!res && !unit) faceForward();
    sfx.creak(0);
    g = { t: "none" };
    acts();
    if (!res) status();
    dirty = true;
    return;
  }
  if (g.t === "pan" && g.id === e.pointerId) {
    const tapped = Math.hypot(p.x - g.sx, p.y - g.sy) < TAP;
    if (tapped && selected !== undefined && !busy && !gunTap) standUp();
    g = { t: "none" };
    dirty = true;
  }
}
over.addEventListener("pointerup", up);
over.addEventListener("pointercancel", up);
over.addEventListener("contextmenu", (e) => e.preventDefault());
over.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (selected !== undefined && !busy) { aim = null; sfx.creak(0); standUp(); }
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
  unit = null; // turn controls cancel the view before changing the player or camera
  sfx.tap();
  const a = b.dataset.act;
  if (a === "ready") return perform({ t: "ready" }, () => handOver());
  if (a === "down") { learn("cancel"); standUp(); dirty = true; return; }
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
  if (unit) { unit = null; }
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
  if (e.key === "Escape") { if (unit) { skipUnitCam(); return; } aim = null; faceForward(); sfx.creak(0); if (!busy) standUp(); }
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
  const elapsed = Math.max(0, now - last);
  frameTimes.push(elapsed);
  if (frameTimes.length > 240) frameTimes.shift();
  let dt = Math.min(50, elapsed) * speed;
  let marchDt = elapsed * speed; // rule time follows visible elapsed time, even on sparse frames
  // dev: time advanced by hand, for frame-exact captures (game and boil clocks together)
  if (handClock) { marchDt = dt = handClock.due; handClock.due = 0; }
  last = now;
  T += dt;
  const marching = stepClock(marchDt);
  // due callbacks (from this game only)
  if (later.length) {
    const due = later.filter((l) => l.at <= T);
    later = later.filter((l) => l.at > T);
    for (const l of due) if (l.g === gen || l.g === ROOM) l.fn();
  }
  const moving = cam.tick(dt);
  let active = moving || marching;
  if (moving && !slow && probeSlow) {
    moveTimes.push(frameTimes[frameTimes.length - 1]);
    if (moveTimes.length > 40) moveTimes.shift();
    if (moveTimes.length >= 24) {
      const med = [...moveTimes].sort((a, b) => a - b)[moveTimes.length >> 1];
      if (med > 45) { slow = true; cam.quick = 1.8; }
    }
  }
  if (res) { stepResolve(); active = true; }
  if (unit) stepUnitCam();
  if (volley && (LIFE.crowd && lively() || volley.stamp) && wall - volley.t0 < volley.plan.ends) active = true;
  const live = fx.end(T) > T || inkTL.end(0) > 0;
  if (live || wasLive || aim || botAim || lampOn.moving || dawn.moving || T - penDrop < (LIFE.pen ? SETTLE_MS + 240 : 260) || (penLift && T - penLift.t0 < LIFT_MS)) active = true;
  wasLive = live;
  if (aim) {
    steer();
    const p = pull(aim);
    const w = wobble(aim, T, turn.handFor(s, aim.soldierId, aim.kind));
    sfx.creak(p.power, Math.abs(w) * 12);
    if (ratchet.shake(w !== 0)) haptic("wobble");
  }
  if (motion.gun) { stepGun(); active = true; }
  wall = boilClock ?? now;
  if (volley && !volley.ended && wall - volley.t0 >= volley.plan.ends) {
    volley.ended = true;
    if (!volley.stamp) volley = null; // the actual rule cross is already on the page
    dirty = true; // erase the final jab pixels once; dev stamps remain permanent
  }
  const bo = boilOn();
  if (bo !== boilWas) { boilWas = bo; dirty = true; }
  // A callback belongs to the next go; expire an unwritten queued line with it.
  if (botchBack && (s.phase !== "play" || s.turn > botchBack.turn + 1)) {
    const queued = botchBack.queued;
    if (queued && bubbles.next === queued) bubbles.next = null;
    if (queued && bubbles.cur === queued) bubbles.cur = null;
    botchBack = null;
  }
  // a bubble redraws only while it's written on or fading (on twos), and to go
  flushMoments();
  const bb = heard() && !slow && !boil.tooDear ? bubbles.showing(wall) : null;
  const bk = bb ? `${bubbleAt(bb, wall, reduced)?.key ?? ""}|${replyAt(bb, wall, reduced)?.key ?? ""}` : "";
  if (bk !== bubbleKey) { bubbleKey = bk; dirty = true; }
  if (bb && bb === botchBack?.queued) botchBack = null; // started: once is enough, even during a flick
  // One seeded callback chance on Dawood-bot's go, independent of idle windows.
  // The bot is busy even while thinking/aiming; this note must be allowed then.
  const back = botchBack && botchBack.who !== s.current && s.turn === botchBack.turn + 1 ? botchBack : null;
  if (back && isBot(s.current) && heard() && LIFE.bubbles && !slow && !boil.tooDear && !aim && !res) {
    if (back.queued && bubbles.next !== back.queued && bubbles.cur !== back.queued) back.queued = undefined;
    if (!back.queued && !bubbles.next && !bubbles.cur?.kind.startsWith("streak")) {
      if (seeded(s.seed, back.turn, back.who, 13) >= BUBBLE.botch.backChance) botchBack = null;
      else {
        const mine = turn.aliveOf(s, s.current).filter((x) => noteOnScreen(displayedAt(x.id)));
        const me = mine[Math.floor(seeded(s.seed, s.turn, 83) * mine.length)];
        if (me) {
          // offer() waits for the full show and normal gap. urgent() erases
          // the previous note before writing this one, keeping one per page.
          const b = bubbles.urgent("botchBack", me.id, wall, Math.floor(seeded(s.seed, s.turn, me.id, 9) * 2 ** 31), noteContext(me.owner));
          if (b) { back.queued = b; dirty = true; }
        }
      }
    }
  }
  // now and then, on your go with nothing happening, a stray thought
  const waited = wall - lastMoveWall;
  if (screen === "game" && LIFE.bubbles && !slow && !boil.tooDear && !away(s.current) && s.phase === "play" && !aim && !res && !busy && selected === undefined && bubbles.idleDue(wall, s.seed, waited, !!back)) {
    const mine = turn.aliveOf(s, s.current), theirs = turn.aliveOf(s, other(s.current));
    const lead = mine.length - theirs.length;
    if (mine.length) {
      const me = mine[Math.floor(seeded(s.seed, s.turn, Math.floor(wall / 1000)) * mine.length)];
      const inBase = s.bases.some((b) => b.owner === me.owner && inside(b, me, 1));
      const c0 = core();
      let kind = strayKind(seeded(s.seed, s.turn, Math.floor(wall / 1000), 3), { lead, waited, inBase, heat: noteContext(me.owner).heat });
      if (kind === "chant" && c0 && inLastStand(c0, me.owner)) kind = "chantLast";
      if (back) kind = "botchBack";
      // an exchange wants a comrade near enough to talk to, but not so near their two dots read as one from above
      const near = comrades(s, me.owner, me, RULES.baseRadius * 2.5, me.id);
      const far = (x: Soldier) => Math.abs(Math.hypot(x.x - me.x, x.y - me.y) - RULES.baseRadius * 1.3);
      const mate = (near.filter((x) => Math.hypot(x.x - me.x, x.y - me.y) >= RULES.soldierRadius * 6).sort((a, b) => far(a) - far(b))[0] ?? near[0])?.id;
      if (ANCHOR[kind] === "base") { const camp = campOf(me.id); if (camp !== undefined) speak(kind, camp); }
      else speak(kind, me.id, wall, undefined, mate);
      if (back && bubbles.cur?.kind === "botchBack") botchBack = null;
    }
  }
  if (active || dirty) {
    const t0 = performance.now();
    renderNow();
    scriptTimes.push(performance.now() - t0);
    if (scriptTimes.length > 240) scriptTimes.shift();
    dirty = false;
  } else if (bo) {
    // nothing else moving: only the living, redrawn when their frame ticks
    const t0 = performance.now();
    if (boilTick(wall)) {
      scriptTimes.push(performance.now() - t0);
      if (scriptTimes.length > 240) scriptTimes.shift();
    }
  }
}
let wall = 0;
let boilClock: number | undefined; // dev: pin the boil's wall time, to capture its frames in order
let handClock: { due: number } | null = null; // dev: game time moves only when stepped
let hidePen = false; // dev: captures of the man the pen stands on

function currentFrame(): Frame {
  const v = cam.view();
  const lamp = lampFor(cam.cur, dawn.at(T), lampOn.at(T));
  let ink: Ink = SETTLED;
  const it = res ? inkTime(T - res.t0, res.snags) : 0;
  const lf = fx.live(T), li = inkTL.live(it);
  if (lf.size || li.size) {
    const liveSet = new Set([...lf, ...li]);
    // Their old dots are standing ink, free to boil; only the new marks wait.
    // runLapse clears lapseDue and restores the existing animated dot keys.
    for (const w of lapseDue?.walkers ?? []) liveSet.delete(`d${w.id}`);
    ink = { p: (k) => (inkTL.pending(k, it) ? inkTL.p(k, it) : fx.p(k, T)), live: liveSet };
  }
  const f: Frame = {
    s: shownState(), pageSource: s, view: v, lamp, ink, dpr: sdpr, sw: W, cw: W + cam.ox * 2, ch: H + cam.oy + cam.ob,
    selected, ghost, sig: signable(screen, signing) ? signatureFor(s, mode) : undefined, lean: leanOf(), boil: { on: boilWas, ms: wall, bold: boldAt(cam.cur.m) },
  };
  const bb = heard() && !slow && !boil.tooDear ? bubbles.showing(wall) : null;
  if (bb) {
    const shown = lifeOf(f.s, ink).soldiers;
    f.hud = { h: H, top: cam.top, bottom: cam.bottom };
    f.heat = noteContext(s.current).heat;
    const bs = bubbleAt(bb, wall, reduced);
    if (bs) {
      if (bb.anchor === "base") { const k = s.bases[bb.id]; if (k && (bb.important || noteOnScreen(k))) f.bubble = { text: bb.text, mood: bb.mood, anchor: "base", at: k, r: k.r, ...(corners(k) && { poly: corners(k)! }), p: bs.p, e: bs.e, side: bb.side, seed: bb.seed, owner: k.owner }; }
      else {
        let x = s.soldiers[bb.id];
        if (bb.important && bb.kind === "stand" && x && !x.alive) {
          const next = turn.aliveOf(s, x.owner)[0];
          if (next) { bb.id = next.id; x = next; }
        }
        if (x && (shown.has(x.id) || bb.important) && (bb.important || noteOnScreen(bb.at ?? displayedAt(x.id)))) f.bubble = { text: bb.text, mood: bb.mood, anchor: "man", at: bb.at ?? displayedAt(x.id), p: bs.p, e: bs.e, side: bb.side, seed: bb.seed, owner: x.owner, with: bb.reply && { ...s.soldiers[bb.reply.id], ...displayedAt(bb.reply.id) } }; }


    }
    const rs = replyAt(bb, wall, reduced), rx = bb.reply && s.soldiers[bb.reply.id], rat = rx && displayedAt(rx.id);
    if (rs && rx && shown.has(rx.id) && rat && noteOnScreen(rat)) f.reply = { text: bb.reply!.text, mood: bb.reply!.mood, anchor: "man", at: rat, p: rs.p, e: rs.e, side: bb.side, seed: bb.reply!.seed, owner: rx.owner, with: { ...s.soldiers[bb.id], ...displayedAt(bb.id) }, answers: `${bb.seed}|${bb.text}` };
  }

  const human = screen === "game" && !away(s.current) && $("#sheet").hidden;
  // setup: show where camps can't go while you're placing one
  if (ghost) {
    const mine = turn.isLegacy(s) ? RULES.baseRadius : radiusOf(s, turn.shaped(s) ? shape : undefined);
    f.keepOut = s.bases.map((b) => ({ x: b.x, y: b.y, r: b.r + mine + (b.owner === s.current ? RULES.minBaseGap : RULES.minEnemyBaseGap) }));
  }
  if (human && s.phase === "setup" && !ghost && !busy && !taught("place")) {
    const ownY = mode.kind === "pnp" && s.current === 1 ? 0.3 : 0.7;
    const n = turn.perBase(s, shape);
    // the long war's bases come up from the cards, and don't all hold the same
    f.teach = turn.shaped(s)
      ? { kind: "place", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * ownY }, p: fx.p("teach", T), rot: cam.cur.rot, text: "drag a base up from the cards", note: "" }
      : { kind: "place", at: { x: RULES.pageW / 2 + 20, y: RULES.pageH * ownY }, p: fx.p("teach", T), rot: cam.cur.rot, note: `(${n === 10 ? "ten" : n} men in each)` };
  }
  const c0 = core();
  if (c0 && human && c0.phase === "position" && !busy) {
    f.zones = c0.bases.filter((b) => b.owner === c0.current).map((b) => ({ x: b.x, y: b.y, r: b.r + c0.rules.positionReach, ...(corners(b) && { pts: offsetPolygon(corners(b)!, c0.rules.positionReach) }) }));
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
    // soldiers out on the road, where a lunger could catch them
    const marching = new Set(lapse?.walkers.map((w) => w.id));
    const pending = new Map(lapseDue?.walkers.map((w) => [w.id, w]));
    const out = c0.convoys.flatMap((c) => {
      const dir = Math.atan2(c.road[1].y - c.road[0].y, c.road[1].x - c.road[0].x);
      const out = c.ids.filter((id) => {
        const walk = pending.get(id), w = walk?.convoy === c.id ? walk : undefined;
        // Departures still stand at home; arrivals still stand on the road.
        const onRoad = w ? !w.departing : c.state === "road";
        return onRoad && c0.soldiers[id].alive && !marching.has(id);
      }).map((id) => ({ at: displayedAt(id), dir, ahead: undefined as { to: Pt; left: number } | undefined }));
      // a long-war convoy sits out on the paper for a few hand-overs: the rest of its road, and how many are left
      if (out.length && c.state === "road" && c.at !== undefined && c0.rules.long) {
        out[0].ahead = { to: c.road[1], left: Math.max(1, Math.ceil((pathLen(c.road) - c.at) / c0.rules.long.sendPace)) };
      }
      return out;
    });
    if (out.length) f.road = out;
    if (sending?.from !== undefined && arrowTo) {
      const from = c0.bases[sending.from];
      const w = sending.to ?? ownBaseAt(arrowTo);
      f.sendArrow = { from, to: arrowTo, ok: w !== undefined && w !== sending.from && !canSend(c0, sending.from, w, 1) };
    }
  }
  if (c0 && (c0.phase === "play" || c0.phase === "over" || res) && (screen === "game" || screen === "replay" || screen === "view")) {
    // a side in its last stand keeps its survivors marked; a lunger owed another lunge is ringed with his link count
    const held = ([0, 1] as Player[]).filter((p) => c0.stand[p] > 0 && (!res || it >= res.dur || !res.o.stood.includes(p)));
    if (held.length) {
      const living = lifeOf(c0, ink).soldiers;
      f.stand = c0.soldiers.filter((x) => living.has(x.id) && held.includes(x.owner)).map((x) => ({ ...displayedAt(x.id), id: x.id }));
    }
    const owed = c0.chain && c0.soldiers[c0.chain.soldier];
    if ((!res || it >= res.dur) && owed?.alive) f.chain = { at: owed, link: c0.chain!.link };
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
    if (!sending) f.hint = { p: fx.p("hint", T), bases: s.bases.filter((b) => b.owner === s.current && inBase(mine, b).length).map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.r, ...(corners(b) && { pts: corners(b)! }) })) };
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
    const h = resolveHead(r, it);
    // riding his ink: stretched out along it, most at the start when it's fastest
    if (r.mover !== undefined && it < r.dur) f.mover = { id: r.mover, at: h, angle: h.angle, stretch: LIFE.chosen && lively() ? 1 + 0.6 * (1 - p) : 1 };
    f.pen = resolvePen(r, it);
  } else if (selected !== undefined && screen === "game" && !(unit && !unit.rising)) {
    const me = s.soldiers[selected];
    const owner = me.owner;
    const ink = inkLeft(owner);
    if (aim) {
      const pl = pull(aim);
      const ang = aimAngle + wobble(aim, T, turn.handFor(s, selected, kind));
      f.aim = { soldierId: selected, angle: ang, power: pl.power, spread: aimError(pl.power, turn.handFor(s, selected, kind)) * 2, reach: turn.lengthFor(s, kind, pl.power), kind, ...guide(selected, kind, ang, turn.lengthFor(s, kind, pl.power)) };
      // at full pull it shivers under the finger (the pen only: the aim is the hand's)
      const sh = LIFE.pen && lively() && pl.live ? shiver(T, pl.power) : 0;
      f.pen = tip(leaning(me.x, me.y, ang + sh * 3, pl.live ? penLean(pl.power) + sh : 0.04, owner, ink), ang, penSide);
      f.pen.charge = pl.live ? pl.power : 0; // the refill fills with the pull
      // a lunger landing among their men is shot: those camps are hatched while you aim one
      if (kind === "lunge" && c0) f.danger = c0.bases.filter((b) => b.owner !== c0.current && garrison(c0, b).length).map((b) => ({ x: b.x, y: b.y, r: b.r, ...(corners(b) && { pts: corners(b)! }) }));
    } else if (botAim) {
      const k = Math.min(1, (T - botAim.t0) / 700);
      const pw = botAim.power * (1 - Math.pow(1 - k, 2));
      const tremble = Math.sin(T / 1000 * 7.3) * 0.02 * pw;
      f.aim = { soldierId: selected, angle: botAim.angle + tremble, power: pw, spread: aimError(pw, turn.handFor(s, selected, kind)) * 2, reach: turn.lengthFor(s, kind, pw), kind, ...guide(selected, kind, botAim.angle + tremble, turn.lengthFor(s, kind, pw)) };
      f.pen = leaning(me.x, me.y, botAim.angle + tremble, penLean(pw), owner, ink);
      f.pen.charge = pw;
    } else if (motion.gun) {
      // the pen points where the phone does; the sight closes as you hold still
      const ang = gunFwd + motion.gun.delta, pw = 0.6;
      // the sight sits well out past the pen, but pulled in to stay on screen when you point wide
      let at = 560;
      for (; at > 200; at -= 40) {
        const q = cam.toScreen(me.x + Math.cos(ang) * at, me.y + Math.sin(ang) * at);
        if (q && q.x > 50 && q.x < W - 50 && q.y > 150 && q.y < H - 190) break;
      }
      f.aim = { soldierId: selected, angle: ang, power: pw, spread: aimError(pw, turn.handFor(s, selected, kind)) * 2, reach: turn.lengthFor(s, kind, pw), kind, sight: motion.gun.armed, sightAt: at, ...guide(selected, kind, ang, turn.lengthFor(s, kind, pw)) };
      f.pen = leaning(me.x, me.y, ang, 0.2 + 0.15 * motion.gun.armed, owner, ink);
    } else {
      // set down on the dot: drops in, then rocks a few times finding its balance
      const k = Math.min(1, (T - penDrop) / 240);
      const rock = LIFE.pen && lively() ? settle(T - penDrop - 240) : 0;
      f.pen = leaning(me.x, me.y, (me.id * 2.39) % 6.283, 0.03 + rock, owner, ink);
      f.pen.h = 70 * (1 - k) * (1 - k);
      f.pen.alpha = k;
    }
  }
  if (volley) {
    const v = volley, e = wall - v.t0;
    if (LIFE.crowd && lively() && e < v.plan.ends) f.jabs = v.plan.jabs.map((j) => ({
      pts: j.pts, owner: j.owner, seed: j.seed,
      p: Math.max(0, Math.min(1, (e - j.at) / j.dur)),
      alpha: Math.max(0, Math.min(1, 1 - (e - j.at - j.dur) / VOLLEY.fade)),
    }));
    if (v.stamp) f.stamp = { x: v.plan.target.x, y: v.plan.target.y, owner: s.bases[v.plan.base].owner, seed: v.plan.target.id * 131 + 5, p: Math.max(0, Math.min(1, (e - v.plan.cross) / VOLLEY.crossMs)) };
  }
  if (hidePen) f.pen = undefined; // dev: to see the man under it
  // lifted off the man you put down: up and away, not gone in a blink
  if (!f.pen && penLift && screen === "game") {
    const l = lift(T - penLift.t0);
    if (l) { f.pen = leaning(penLift.x, penLift.y, 0, 0.05, penLift.owner, inkLeft(penLift.owner)); f.pen.h = l.h; f.pen.alpha = l.alpha; }
    else penLift = null;
  }
  return f;
}

// How far the camera has leaned in to aim (brings up the fog round the pen).
function leanOf() {
  const p = cam.cur;
  return Math.max(0, Math.min(1, cam.tiltScale > 0 ? p.tilt / 0.55 : (p.m - 1) / 1.1));
}

// Dev: how two drawings of a layer differ, beyond antialiasing (a channel off by more than 24).
function differ(a: ImageData | null, b: ImageData | null, only?: (x: number, y: number) => boolean) {
  if (!a || !b) return { bad: a === b ? 0 : -1, box: null };
  if (a.width !== b.width || a.height !== b.height) return { bad: -1, box: null };
  let bad = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const p = a.data, q = b.data;
  for (let i = 0; i < p.length; i += 4) {
    // Compare the color that reaches the page. Near-transparent antialiasing
    // can change unpremultiplied RGB wildly while changing visible ink by < 1.
    const pa = p[i + 3], qa = q[i + 3], tolerance = 24 * 255;
    if (Math.abs(p[i] * pa - q[i] * qa) <= tolerance && Math.abs(p[i + 1] * pa - q[i + 1] * qa) <= tolerance && Math.abs(p[i + 2] * pa - q[i + 2] * qa) <= tolerance && Math.abs(pa - qa) <= 24) continue;
    const x = (i >> 2) % a.width, y = Math.floor((i >> 2) / a.width);
    if (only && !only(x, y)) continue;
    bad++;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { bad, of: a.width * a.height, box: bad ? [x0, y0, x1, y1] : null };
}

// What the living see this frame (life.ts): whose go it is, who's in hand, where the pen points.
let chosenAt = { id: -1, t0: 0 };
function seeLife(f: Frame) {
  // A struggling device has neither soldier poses nor dread notes to consume this work.
  if (slow || boil.tooDear) { dreadWas.clear(); return; }
  const sel = f.selected ?? (f.aim ? f.aim.soldierId : undefined);
  if (sel !== chosenAt.id) chosenAt = { id: sel ?? -1, t0: wall };
  const r = f.view.rot;
  const ink = f.ink ?? SETTLED;
  life.see({
    s: f.s, up: Math.atan2(-Math.cos(r), -Math.sin(r)), zoom: cam.cur.m,
    pendingStand: new Set([...ink.live].flatMap((k) => {
      const m = k[0] === "m" ? s.marks[+k.slice(1)] : undefined;
      return m?.t === "stand" && ink.p(k) <= 0 ? [m.owner] : [];
    })),
    eager: s.phase === "play" && !res && screen === "game" ? s.current : undefined,
    chosen: sel !== undefined && !res ? { id: sel, t0: chosenAt.t0 } : undefined,
    aim: f.aim && !res ? { angle: f.aim.angle, power: f.aim.power, reach: f.aim.reach, spread: f.aim.spread } : undefined,
  }, wall);
  // a pen newly pointed at a man: now and then, "!"
  const dread = life.dreading.filter((id) => !dreadWas.has(id));
  dreadWas = new Set(life.dreading);
  if (dread.length) speak("dread", dread[0]);
}
let dreadWas = new Set<number>();

function renderNow() {
  const f = currentFrame();
  seeLife(f);
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
    get selected() { return selected; }, get turnClock() { return turnClock; }, get shown() { return shownState(); }, set clockHeld(v: boolean) { clockHeld = v; }, get res() { return res; }, get lapse() { return lapse; }, haptics, get link() { return link; }, get mode() { return mode; }, get roomDrift() { return roomDrift; },
    get unit() { return unit; }, unitCam: (id: number) => startUnitCam(id), redrop: () => { penDrop = T; },
    /** A camp turns on an intruder (the lunge rule's execution, by hand): `pft.volley(baseId, soldierId)`. */
    volley: (base: number, id: number) => { const x = s.soldiers[id]; return startVolley(base, { id, x: x.x, y: x.y }); }, set hidePen(v: boolean) { hidePen = v; dirty = true; },
    set speed(v: number) { speed = v; }, get speed() { return speed; },
    poke: () => { dirty = true; },
    /**
     * Every layer drawn incrementally must match a full redraw of the same
     * frame: per layer, how many pixels differ by more than antialiasing, and where.
     */
    redrawCheck: () => {
      const f = currentFrame();
      seeLife(f);
      // Presentation observers run once; both sides draw the exact same frame.
      const draw = () => { renderStage(els, f); renderOverlay(og, f, W, H, dpr); };
      draw();
      const layers: Record<string, HTMLCanvasElement> = { over, live: els.live, talk: els.talk, field: field.c, streak: streakLayer.c, rings: boil.parts[0].c, rest: boil.parts[1].c, ...Object.fromEntries([...standRays].map(([id, p]) => [`rays${id}`, p.c])) };

      // Read a copy: repeated reads of the drawing context make Chrome switch
      // raster backends, changing antialiasing between the two snapshots.
      const grab = () => Object.fromEntries(Object.entries(layers).map(([k, c]) => {
        if (!c.width || !c.height || c.style.visibility === "hidden") return [k, null];
        const copy = document.createElement("canvas");
        copy.width = c.width; copy.height = c.height;
        const g = copy.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(c, 0, 0);
        return [k, g.getImageData(0, 0, c.width, c.height)];
      }));
      draw();
      const a = grab();
      forgetDrawn();
      draw(); draw(); // the boil draws one of its two canvases a render
      const b = grab();
      // the boil leaves what's off screen at its last look until it comes into view: compare what's on it
      const on = boilSeen(), S = pageState.S;
      const mask = (k: string) => {
        const i = k === "rings" ? 0 : k === "rest" ? 1 : -1;
        if (i < 0 || !on) return undefined;
        const p = boil.parts[i];
        return (x: number, y: number) => { const u = p.ox + x / S, w = p.oy + y / S; return u >= on.x0 && u <= on.x1 && w >= on.y0 && w <= on.y1; };
      };
      return Object.fromEntries(Object.keys(layers).map((k) => [k, differ(a[k], b[k], mask(k))]));
    },
    frame: () => { const f = currentFrame(); return { lamp: f.lamp, view: f.view, bubble: f.bubble, mover: f.mover, stand: f.stand, road: f.road, jabs: f.jabs, stamp: f.stamp, pen: f.pen }; },
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
    stageStats, boil, life, LIFE, CLARITY, NOTE, FEEL, standRays, noteSpot: noteSpotNow, noteSpots: noteSpotsNow, set hour(h: number | undefined) { devHour = h; }, set heat(h: number | undefined) { devHeat = h; }, set waitedSince(ms: number) { lastMoveWall = ms; }, get boilOn() { return boilOn(); }, set boilOn(v: boolean | undefined) { boilForce = v; dirty = true; },
    set boilClock(ms: number | undefined) { boilClock = ms; },
    /** Frame-exact captures: `pft.hand(true)`, then `pft.step(ms)` moves the game and the boil on together. */
    hand: (on: boolean) => { handClock = on ? { due: 0 } : null; if (on) boilClock ??= wall; else boilClock = undefined; },
    step: (ms: number) => { if (!handClock) return; handClock.due += ms; boilClock = (boilClock ?? wall) + ms; },
    say: voice.say, voice, get wall() { return wall; }, bubbles, announce, speak, speakStreak, speakBotch, botchOf,
    /** Voices rendered offline, as 16-bit mono WAV bytes (base64), for listening outside the game. */
    voiceWav: async (lines: Parameters<typeof voice.renderLines>[0]) => {
      const pcm = await voice.renderLines(lines);
      const b = new DataView(new ArrayBuffer(44 + pcm.length * 2));
      const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
      str(0, "RIFF"); b.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVEfmt "); b.setUint32(16, 16, true);
      b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, 44100, true); b.setUint32(28, 88200, true);
      b.setUint16(32, 2, true); b.setUint16(34, 16, true); str(36, "data"); b.setUint32(40, pcm.length * 2, true);
      let peak = 0;
      pcm.forEach((v, i) => { peak = Math.max(peak, Math.abs(v)); b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true); });
      let bin = "";
      new Uint8Array(b.buffer).forEach((x) => (bin += String.fromCharCode(x)));
      return { wav: btoa(bin), peak, secs: pcm.length / 44100 };
    },
    cam, fx, inkTL, pageCanvas, ink: inkLib, INK, els, canvas: over, renderNow, worldTransform, page, pen: PEN,
    get slow() { return slow; }, set slow(v: boolean) { slow = v; cam.quick = v ? 1.8 : 1; probeSlow = v; },
    start, showTitle, replay: () => replay(file(s, mode)), apply: (st: Step) => { apply(s, st); dirty = true; },
    unfile, file: () => file(s, mode), flick: (f: Flick) => fire(f, 0.6, 0.3), preview: (f: Flick) => { const c = core(); return c ? preview(c, f) : null; },
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
      const sz = sizeFor(size, custom);
      const st = newGame(sz, seed, pageStamp(), rulesFor(sz));
      let k = seed;
      while (st.phase === "setup") {
        const sh = st.rules.long ? botShape(rng(k++)) : undefined;
        const spot = botBase(st, (x, y) => !turn.canPlaceBase(st, x, y, sh), k++)!;
        act(st, { t: "base", x: spot.x, y: spot.y, ...(sh && { shape: sh }) });
      }
      while (st.phase === "position") for (const a of botArrange(st, k++)) { if (!illegal(st, a)) act(st, a); if (a.t === "ready") break; }
      while (st.phase === "play" && st.turn < maxTurns) act(st, turn.botMove(st, 1, k++));
      const r = file(st, { kind: "bot", level: 1 });
      if (st.phase === "over") localStorage.setItem("pft:drawer", JSON.stringify(addToDrawer(drawer(), r)));
      return r;
    },
    view: (r: Filed) => viewPage(r), replayRecord: (r: Filed) => replay(r),
    theme: { apply: applyTheme, choose: chooseTheme, room: setRoomTheme, get current() { return currentTheme(); }, list: THEMES.map((t) => t.id) },
    resumeRecord: (r: Filed) => resume({ s: unfile(r), mode: r.mode }),
    // motion aiming: synthetic sensors, and what the aim made of them
    sensors: motion.simulator(),
    get aim() { return aim && { angle: aimAngle, thumb: byThumb.angle, wobble: wobble(aim, T, turn.handFor(s, aim.soldierId, aim.kind)), steady: aim.steady, power: pull(aim).power }; },
    get gun() { return motion.gun && { fwd: gunFwd, delta: motion.gun.delta, armed: motion.gun.armed }; },
  };
}

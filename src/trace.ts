// Where a flicked line actually goes. The pen draws an arc; the page can
// stop it (a fort's wall, enemy ink, a scribble), bounce it (a mirror or bank
// wall, your own old ink, the page edge), split it (leaving your own prism),
// jolt it (crossing a line or a wall at a steep angle makes the hand wobble),
// pull it (running nearly parallel to a line draws the pen into its groove),
// or slow it (dried ink it drags across). Pure: reads the state, returns the
// branches. The only randomness is the wobble, drawn from the flick's seed.
//
// The pen is walked like a turtle: a heading, and the arc's own curvature as
// a turn before each step. A bounce reflects the heading (and mirrors the
// curvature), a wobble or a prism rotates it, and a groove bends it a little
// every step.

import { baseEdges, baseVerts } from "./bases";
import type { GameState, Player } from "./game";
import { boxOf, boxesMeet, dist, gauss, insidePoly, pathLen, polygon, rng, type Box, type Pt } from "./geom";
import { RULES } from "./rules";

export type SurfKind = "stop" | "mirror" | "prism" | "own" | "enemy" | "edge" | "wall" | "bank" | "crash";

/** What one base's wall does to a line from this shooter. */
interface WallFx {
  /** Round 1 fort: stops an enemy line, once per edge. */
  stop: boolean;
  /** Round 1 mirror: bounces an enemy line, once per edge. */
  mirror: boolean;
  /** Billiards: a line coming in at a glance bounces off; anyone's line. */
  bank: boolean;
  /** Your own shot leaving it splits. */
  prism: boolean;
  /** Wobble picked up passing through. */
  wobble: number;
  /** A lunge coming in dies at the wall. */
  crash: boolean;
}

interface Surf {
  a: Pt; b: Pt; kind: SurfKind; key: string;
  base?: number; edge?: number; poly?: Pt[]; fx?: WallFx;
  /** For a stroke: which mark it is. */
  stroke?: number;
  /** Last grid query that returned it (so a segment in several cells counts once). */
  q?: number;
}
interface Group { box: Box; surfs: Surf[]; ink?: boolean }

// Ink on a late page is hundreds of lines: they're kept in a coarse grid so a
// step of the pen only looks at the segments near it.
const CELL = 64;
class Grid {
  cells = new Map<number, Surf[]>();
  private stamp = 0;
  add(sf: Surf) {
    const x0 = Math.floor(Math.min(sf.a.x, sf.b.x) / CELL), x1 = Math.floor(Math.max(sf.a.x, sf.b.x) / CELL);
    const y0 = Math.floor(Math.min(sf.a.y, sf.b.y) / CELL), y1 = Math.floor(Math.max(sf.a.y, sf.b.y) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = (cx + 64) * 4096 + (cy + 64);
      const list = this.cells.get(k);
      if (list) list.push(sf); else this.cells.set(k, [sf]);
    }
  }
  /** Segments whose cells meet the box [x0,x1]×[y0,y1]. */
  near(x0: number, y0: number, x1: number, y1: number, out: Surf[]) {
    out.length = 0;
    const q = ++this.stamp;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      const list = this.cells.get((cx + 64) * 4096 + (cy + 64));
      if (list) for (const sf of list) if (sf.q !== q) { sf.q = q; out.push(sf); }
    }
    return out;
  }
}
interface Page { groups: Group[]; ink: Grid; inkCount: number }

export interface TraceEvent {
  kind: "bounce" | "stop" | "split" | "friction" | "edge" | "wall" | "cross" | "groove" | "absorb" | "crash";
  on: SurfKind;
  at: Pt;
  /** Distance along its branch. */
  d: number;
  branch: number;
  base?: number;
  edge?: number;
  /** For a split: the branch it spawned. */
  child?: number;
  /** Radians the hand was jolted here (wobble). */
  jolt?: number;
  /** Direction of travel here, radians (for drawing). */
  dir?: number;
  /** A groove: how far the pen ran in it. */
  len?: number;
}

export interface Branch {
  pts: Pt[];
  /** Why it ended: ran its length, stopped by something, or left the page. */
  end: "spent" | "stop" | "edge";
  /** For a split-off branch: its parent, and how far along the parent it split. */
  parent?: number;
  parentD?: number;
}

export interface Trace { branches: Branch[]; events: TraceEvent[] }

// An old stroke is simplified for collisions: a point is kept once the line
// has run 60 units or turned 0.08 rad since the last one kept. A flick's bow
// is shallow, so this is within a world unit or two of the drawn line.
const KEEP_RUN = 60, KEEP_TURN = 0.08;
const strokeCache = new WeakMap<object, Group>();

function simplify(src: Pt[]): Pt[] {
  const out: Pt[] = [src[0]];
  let run = 0, h0 = NaN;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const l = dist(a, b);
    if (l < 1e-9) continue;
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    if (Number.isNaN(h0)) h0 = h;
    run += l;
    const last = i === src.length - 1;
    if (last || run >= KEEP_RUN || Math.abs(wrap(h - h0)) > KEEP_TURN) { out.push(b); run = 0; h0 = NaN; }
  }
  if (out.length === 1) out.push(src.at(-1)!);
  return out;
}

function strokeGroup(m: { pts: Pt[]; owner: Player }, idx: number, mine: boolean): Group {
  let g = strokeCache.get(m);
  if (!g) {
    const pts = simplify(m.pts);
    const surfs: Surf[] = [];
    for (let i = 1; i < pts.length; i++) surfs.push({ a: pts[i - 1], b: pts[i], kind: "own", key: `i${idx}.${i}`, stroke: idx });
    g = { box: boxOf(pts, 1), surfs, ink: true };
    strokeCache.set(m, g);
  }
  // ownership is relative to the shooter: copy the kind on the way out
  return { box: g.box, surfs: g.surfs.map((s) => ({ ...s, kind: mine ? "own" : "enemy" })), ink: true };
}

// The page only changes when a mark is added (every action adds one), so the
// surfaces are cached per state, player and kind until the next mark.
const memo = new WeakMap<GameState, Map<string, Page>>();

/** Everything on the page a line from `who` can interact with. */
function surfaces(s: GameState, who: Player, shot: boolean): Page {
  let m = memo.get(s);
  const key = `${s.marks.length}|${s.bases.length}|${who}|${shot}`;
  if (!m || !m.has(key)) {
    if (!m || [...m.keys()].some((k) => !k.startsWith(`${s.marks.length}|${s.bases.length}|`))) { m = new Map(); memo.set(s, m); }
    m.set(key, build(s, who, shot));
  }
  return m.get(key)!;
}

type Ink = GameState["rules"]["ink"];
/** Does ink on the page do anything to a line it crosses (beyond round 1's bounces and trenches)? */
const inkFx = (ink: Ink) => ink.friction > 0 || (ink.wobble ?? 0) > 0 || !!ink.boost || !!ink.drag || (ink.groove ?? 0) > 0 || (ink.scribble ?? 0) > 0;
/** Does any stroke on the page affect lines under these rules? */
export const inkActs = (ink: Ink) => inkFx(ink) || ink.ownBounces > 0 || ink.enemyStops;

// Circles are traced as a 32-sided polygon: within half a percent of the drawn ring.
const CIRCLE_SIDES = 32;

function build(s: GameState, who: Player, shot: boolean): Page {
  const R = s.rules;
  const W = RULES.pageW, H = RULES.pageH;
  const groups: Group[] = [];
  const c = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  groups.push({
    box: { x0: -1, y0: -1, x1: W + 1, y1: H + 1 },
    surfs: c.map((p, i) => ({ a: p, b: c[(i + 1) % 4], kind: "edge" as const, key: `e${i}` })),
  });
  const wallEvents = (R.ink.taperWall ?? 0) > 0;
  const crashes = !shot && !!R.lunge?.baseDeath;
  for (const b of s.bases) {
    const empty = b.fallen !== undefined;
    if (empty && (R.empty ?? "gone") !== "ring") continue; // gone, or crumbled: its walls do nothing
    const rule = R.shapes[b.shape];
    if (!rule) continue;
    const enemy = b.owner !== who;
    const fx: WallFx = {
      stop: enemy && rule.wall === "stop",
      mirror: enemy && rule.wall === "mirror",
      bank: rule.wall === "bank",
      prism: !enemy && rule.prism && shot,
      wobble: rule.wobble ?? 0,
      crash: crashes && enemy && !empty,
    };
    if (!fx.stop && !fx.mirror && !fx.bank && !fx.prism && !fx.wobble && !fx.crash && !wallEvents) continue;
    const verts = baseVerts(b);
    const poly = verts ?? polygon(CIRCLE_SIDES, b.x, b.y, b.r, 0);
    const edges: [Pt, Pt][] = verts ? baseEdges(b) : poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
    const surfs: Surf[] = [];
    edges.forEach(([a, e], i) => {
      const breached = b.breached?.includes(i);
      const efx = breached && (fx.stop || fx.mirror) ? { ...fx, stop: false, mirror: false } : fx;
      // round 1: a breached fort or mirror edge is open (it did nothing else)
      if (breached && !efx.bank && !efx.prism && !efx.wobble && !efx.crash && !wallEvents) return;
      surfs.push({ a, b: e, kind: "wall", key: `b${b.id}.${i}`, base: b.id, edge: i, poly, fx: efx });
    });
    if (surfs.length) groups.push({ box: boxOf(poly, 1), surfs });
  }
  const ink = R.ink;
  const grid = new Grid();
  let inkCount = 0;
  if (inkActs(ink)) {
    // wet ink: only each player's newest lines count (0 = all the ink on the page)
    const fresh = ink.fresh ?? 0;
    const seen = [0, 0];
    for (let i = s.marks.length - 1; i >= 0; i--) {
      const m = s.marks[i];
      if (m.t !== "stroke") continue;
      if (fresh && seen[m.owner]++ >= fresh) continue;
      for (const sf of strokeGroup(m, i, m.owner === who).surfs) { grid.add(sf); inkCount++; }
    }
  }
  return { groups, ink: grid, inkCount };
}

/** The arc as a turtle walks it: a first heading, then each step's turn and length. */
interface Steps { h0: number; turn: number[]; len: number[] }

function stepsOf(arc: Pt[]): Steps {
  const turn: number[] = [], len: number[] = [];
  let prev = NaN, h0 = 0;
  for (let i = 1; i < arc.length; i++) {
    const dx = arc[i].x - arc[i - 1].x, dy = arc[i].y - arc[i - 1].y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const h = Math.atan2(dy, dx);
    if (Number.isNaN(prev)) { h0 = h; turn.push(0); } else turn.push(wrap(h - prev));
    len.push(l);
    prev = h;
  }
  return { h0, turn, len };
}

const wrap = (a: number) => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };

interface Ctx {
  groups: Group[];
  lines: Grid;
  inkCount: number;
  near: Surf[];
  branches: Branch[];
  events: TraceEvent[];
  ink: Ink;
  inkFx: boolean;
  spread: number;
  clear: number;
  glance: number;
  steps: Steps;
  /** The longest flick there is: how fast a pen is going depends on how much line it has left. */
  vmax: number;
  /** Gravity: the pen moves in sub-steps this long, so a groove can bend it. */
  sub: number;
  /** The hand's wobble, drawn from the flick's seed (undefined: a perfect hand, no wobble). */
  rand?: () => number;
}

// Old ink this close to where the pen rests doesn't count: a soldier's own
// earlier lines all start on his dot.
const START_SKIP = 14; // at least; a rule set can widen it (ink.clear)
/** A groove pulls the pen once it's this close to the line, and it's riding once this close. */
const LOOK = 20, RIDING = 5;
const SUB = 14;

// What a branch may still use: bounces left and wall edges it has spent. A
// split-off branch starts with a copy of its parent's, so neither steals from the other.
interface Left { own: number; edge: number; used: Set<string>; bank: number }

/** The pen at the start of a branch: where, which way, curvature mirrored or not, and where in the arc's steps. */
interface PenAt { at: Pt; h: number; sign: number; j: number; rem: number }

/**
 * A groove's pull on a pen at `p` heading `h`: the nearest line within reach
 * and within the groove angle of parallel bends the heading along it and a
 * little toward it, more the closer, the more parallel, and the slower the pen.
 */
function pull(ctx: Ctx, p: Pt, h: number, left: number, step: number): { turn: number; riding: boolean; own: boolean } {
  const ink = ctx.ink, G = ink.grooveReach ?? 24, max = ink.groove!, cosMax = Math.cos(max);
  const hx = Math.cos(h), hy = Math.sin(h);
  let best = 0, delta = 0, own = false, near = Infinity, angle = 0;
  for (const sf of ctx.lines.near(p.x - G, p.y - G, p.x + G, p.y + G, ctx.near)) {
    const vx = sf.b.x - sf.a.x, vy = sf.b.y - sf.a.y;
    const l2 = vx * vx + vy * vy;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p.x - sf.a.x) * vx + (p.y - sf.a.y) * vy) / l2));
    const qx = sf.a.x + vx * t, qy = sf.a.y + vy * t;
    const rho = Math.hypot(p.x - qx, p.y - qy);
    if (rho > G) continue;
    const l = Math.sqrt(l2);
    const c = (hx * vx + hy * vy) / l; // cos of the angle between pen and line
    if (Math.abs(c) <= cosMax) continue; // steeper than a groove: a crossing, not a pull
    const phi = Math.acos(Math.min(1, Math.abs(c)));
    const w = (1 - rho / G) * (1 - phi / max);
    if (w <= best) continue;
    best = w;
    // turn along the line (whichever way along it is nearer the pen's heading), leaning in toward it
    const cross = ((hx * vy - hy * vx) / l) * Math.sign(c);
    const side = hx * (qy - p.y) - hy * (qx - p.x);
    delta = Math.sign(cross) * phi + Math.sign(side) * Math.atan2(rho, LOOK);
    own = sf.kind === "own";
    near = rho;
    angle = phi;
  }
  if (!best) return { turn: 0, riding: false, own };
  // a flick slows as it runs out: speed goes as the root of the line it has left
  const speed = Math.sqrt(Math.max(0, Math.min(1, left / ctx.vmax)));
  const rate = (ink.groovePull ?? 0.03) * best * (1 - speed) * step;
  // riding it: right on the line and running along it, not just crossing
  return { turn: Math.max(-rate, Math.min(rate, delta)), riding: near < RIDING && angle < max * 0.4, own };
}

function walk(ctx: Ctx, left: Left, pen: PenAt, budget: number, canSplit: boolean, parent?: { idx: number; d: number }): number {
  const idx = ctx.branches.length;
  const br: Branch = { pts: [pen.at], end: "spent", ...(parent && { parent: parent.idx, parentD: parent.d }) };
  ctx.branches.push(br);
  const ink = ctx.ink, S = ctx.steps;
  const gravity = (ink.groove ?? 0) > 0;
  let pos = pen.at, h = pen.h, sign = pen.sign, j = pen.j, rem = pen.rem, d = 0, skip = "";
  let fresh = false;
  let guard = 0;
  let groove: TraceEvent | null = null; // the groove being ridden, if any
  const crossings: number[] = []; // distances where this branch crossed a line (scribble cover)
  // one crossing of a wall or a line where two of its segments meet counts once
  let last = { key: "", d: -1 };
  outer: while ((j < S.len.length || budget > 1e-6) && guard++ < 4000) {
    if (fresh) {
      // past the arc's end with range to spare (a boost): straight on
      if (j >= S.len.length) { rem = Math.min(budget, 60); fresh = false; }
      else { h += sign * S.turn[j]; rem = S.len[j]; fresh = false; }
    }
    if (rem < 1e-9) { j++; fresh = true; continue; }
    const seg = gravity ? Math.min(rem, ctx.sub) : rem;
    let k = 1;
    if (gravity && (parent !== undefined || d >= Math.max(ctx.clear, (ink.grooveReach ?? 24) * 1.5))) {
      const g = pull(ctx, pos, h, budget, seg);
      h += g.turn;
      if (g.riding) {
        k = g.own ? ink.grooveOwn ?? 1 : ink.grooveEnemy ?? 1;
        if (!groove) {
          groove = { kind: "groove", on: g.own ? "own" : "enemy", at: pos, d, branch: idx, dir: h, len: 0 };
          ctx.events.push(groove);
        }
        groove.len! += seg;
      } else groove = null;
    }
    const nxt = { x: pos.x + Math.cos(h) * seg, y: pos.y + Math.sin(h) * seg };
    const L = seg;
    const box = boxOf([pos, nxt], 0.5);
    const hits: { t: number; s: Surf }[] = [];
    const inkNear = ctx.inkCount ? ctx.lines.near(box.x0, box.y0, box.x1, box.y1, ctx.near) : [];
    for (const g of [...ctx.groups, { box, surfs: inkNear }]) {
      if (!boxesMeet(g.box, box)) continue;
      for (const sf of g.surfs) {
        if (sf.key === skip || left.used.has(sf.key)) continue;
        const t = segT(pos, nxt, sf.a, sf.b);
        if (t === null || t * L < 1e-6) continue;
        if ((sf.kind === "own" || sf.kind === "enemy") && parent === undefined && d + t * L < ctx.clear) continue;
        if (sf.kind === "wall" && sf.fx!.prism && !sf.fx!.bank && !sf.fx!.wobble && !sf.fx!.crash && !canSplit && !(ink.taperWall ?? 0)) continue;
        if (sf.kind === "own" && left.own <= 0 && !ctx.inkFx) continue;
        if (sf.kind === "enemy" && !ink.enemyStops && !ctx.inkFx) continue;
        hits.push({ t, s: sf });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    let t0 = 0;
    for (const hit of hits) {
      const step = (hit.t - t0) * L;
      if (budget < step * k) {
        br.pts.push(lerp(pos, nxt, t0 + budget / (L * k)));
        d += budget / k;
        budget = 0;
        break outer;
      }
      budget -= step * k;
      d += step;
      t0 = hit.t;
      const at = lerp(pos, nxt, hit.t);
      const sf = hit.s;
      const who = sf.base !== undefined ? `b${sf.base}` : sf.stroke !== undefined ? `i${sf.stroke}` : sf.key;
      if (who === last.key && Math.abs(d - last.d) < 1e-3) continue;
      last = { key: who, d };
      const ev = (kind: TraceEvent["kind"], on: SurfKind, extra: Partial<TraceEvent> = {}) =>
        ctx.events.push({ kind, on, at, d, branch: idx, base: sf.base, edge: sf.edge, dir: h, ...extra });
      // carry on from `at` with a new heading: the rest of this step is still to go
      const turnTo = (nh: number, mirror = false) => {
        br.pts.push(at);
        rem -= hit.t * L;
        pos = at;
        h = nh;
        if (mirror) sign = -sign;
        skip = sf.key;
        groove = null;
      };
      const reflect = () => turnTo(2 * Math.atan2(sf.b.y - sf.a.y, sf.b.x - sf.a.x) - h, true);
      const end = (why: Branch["end"]) => { br.pts.push(at); br.end = why; };
      if (sf.kind === "edge") {
        if (left.edge > 0) {
          left.edge--;
          ev("bounce", "edge");
          reflect();
          continue outer;
        }
        end("edge");
        ev("edge", "edge");
        break outer;
      }
      if (sf.kind === "wall") {
        const fx = sf.fx!;
        const e = Math.min(0.5, 0.5 / L);
        const inBefore = insidePoly(lerp(pos, nxt, Math.max(0, hit.t - e)), sf.poly!);
        const inAfter = insidePoly(lerp(pos, nxt, Math.min(1, hit.t + e)), sf.poly!);
        const entering = !inBefore && inAfter, leaving = inBefore && !inAfter;
        if (fx.crash && entering) {
          end("stop");
          ev("crash", "crash");
          break outer;
        }
        if (fx.stop) {
          end("stop");
          left.used.add(sf.key);
          ev("stop", "stop");
          break outer;
        }
        if (fx.mirror) {
          left.used.add(sf.key);
          ev("bounce", "mirror");
          reflect();
          continue outer;
        }
        if (fx.bank && entering && left.bank > 0) {
          // billiards: only a glancing line comes off the cushion; a straight one goes in
          const wx = sf.b.x - sf.a.x, wy = sf.b.y - sf.a.y, wl = Math.hypot(wx, wy) || 1;
          const along = Math.abs(Math.cos(h) * wx / wl + Math.sin(h) * wy / wl); // sin of the angle off square
          if (along > Math.sin(ctx.glance)) {
            left.bank--;
            ev("bounce", "bank");
            reflect();
            continue outer;
          }
        }
        if (fx.prism && leaving && canSplit) {
          ev("split", "prism");
          const sev = ctx.events[ctx.events.length - 1];
          canSplit = false;
          const rest = rem - hit.t * L;
          turnTo(h + ctx.spread);
          sev.child = walk(ctx, { ...left, used: new Set(left.used) }, { at, h: h - 2 * ctx.spread, sign, j, rem: rest }, budget, false, { idx, d });
          continue outer;
        }
        if (!entering && !leaving) continue; // grazed a corner
        const jolt = fx.wobble && ctx.rand ? gauss(ctx.rand) * fx.wobble : 0;
        ev("wall", "wall", { jolt });
        if (jolt) { turnTo(h + jolt); continue outer; }
        continue;
      }
      // a line on the page
      const mine = sf.kind === "own";
      if (mine && left.own > 0) {
        left.own--;
        ev("bounce", "own");
        reflect();
        continue outer;
      }
      if (!mine && ink.enemyStops) {
        end("stop");
        ev("stop", "enemy");
        break outer;
      }
      if (!ctx.inkFx) continue;
      // the angle the pen meets it at decides: nearly parallel is its groove (the pull
      // handles that), steeper is a crossing that jolts the hand
      if (gravity) {
        let diff = Math.abs(wrap(Math.atan2(sf.b.y - sf.a.y, sf.b.x - sf.a.x) - h));
        if (diff > Math.PI / 2) diff = Math.PI - diff;
        if (diff < ink.groove!) continue;
      }
      // scribbles are cover: too many lines in too short a stretch soak the ink up
      crossings.push(d);
      const scribble = ink.scribble ?? 0;
      if (scribble > 0 && crossings.filter((x) => x >= d - (ink.scribbleSpan ?? 40)).length >= scribble) {
        end("stop");
        ev("absorb", sf.kind);
        break outer;
      }
      if (ink.friction > 0) {
        budget -= ink.friction;
        ev("friction", sf.kind);
      }
      budget += mine ? ink.boost ?? 0 : -(ink.drag ?? 0);
      if (budget <= 0) {
        br.pts.push(at);
        budget = 0;
        break outer;
      }
      const jolt = (ink.wobble ?? 0) > 0 && ctx.rand ? gauss(ctx.rand) * ink.wobble! : 0;
      if (ink.friction <= 0) ev("cross", sf.kind, { jolt });
      if (jolt) { turnTo(h + jolt); continue outer; }
    }
    const step = (1 - t0) * L;
    if (budget < step * k) {
      br.pts.push(lerp(pos, nxt, t0 + budget / (L * k)));
      d += budget / k;
      budget = 0;
      break;
    }
    budget -= step * k;
    d += step;
    br.pts.push(nxt);
    pos = nxt;
    rem -= seg;
    skip = "";
    if (rem < 1e-9) { j++; fresh = true; }
  }
  return idx;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Where segment ab crosses cd, as a fraction along ab, or null. */
function segT(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : t;
}

/** Trace a flick's arc from `from` across the page as `who` sees it. `wob` seeds the hand's wobble (none if undefined). */
export function trace(s: GameState, who: Player, from: Pt, arc: Pt[], shot: boolean, wob?: number): Trace {
  const R = s.rules;
  const page = surfaces(s, who, shot);
  const steps = stepsOf(arc);
  const total = pathLen(arc);
  const ctx: Ctx = {
    groups: page.groups,
    lines: page.ink,
    inkCount: page.inkCount,
    near: [],
    branches: [],
    events: [],
    ink: R.ink,
    inkFx: inkFx(R.ink),
    spread: R.prismSpread,
    clear: Math.max(START_SKIP, R.ink.clear ?? 0),
    glance: R.bankGlance ?? 0.6,
    steps,
    vmax: Math.max(R.shoot.max, R.move.max),
    sub: SUB,
    rand: wob === undefined ? undefined : rng(wob),
  };
  // a copy: the line must never share a point with the soldier, who may move later
  walk(ctx, { own: R.ink.ownBounces, edge: R.ink.edgeBounces, used: new Set(), bank: R.bankMax ?? 3 },
    { at: { x: from.x, y: from.y }, h: steps.h0, sign: 1, j: 0, rem: steps.len[0] ?? 0 }, total, true);
  return { branches: ctx.branches, events: ctx.events };
}

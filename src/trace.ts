// Where a flicked line actually goes. The pen draws an arc; the page can
// stop it (a fort's wall, enemy ink), bounce it (a mirror wall, your own old
// ink, the page edge), split it (leaving your own prism), or slow it (dried
// ink it drags across). Pure: reads the state, returns the branches.

import { baseEdges, baseVerts } from "./bases";
import type { GameState, Player } from "./game";
import { boxOf, boxesMeet, dist, insidePoly, pathLen, reflectPt, rotatePt, segHit, type Box, type Pt } from "./geom";
import { RULES } from "./rules";

export type SurfKind = "stop" | "mirror" | "prism" | "own" | "enemy" | "edge";

interface Surf { a: Pt; b: Pt; kind: SurfKind; key: string; base?: number; edge?: number; poly?: Pt[] }
interface Group { box: Box; surfs: Surf[] }

export interface TraceEvent {
  kind: "bounce" | "stop" | "split" | "friction" | "edge";
  on: SurfKind;
  at: Pt;
  /** Distance along its branch. */
  d: number;
  branch: number;
  base?: number;
  edge?: number;
  /** For a split: the branch it spawned. */
  child?: number;
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

// Only every 4th point of an old stroke is used for collisions: the bow of a
// flick is shallow, so this is within a world unit or two of the drawn line.
const DECIMATE = 4;
const strokeCache = new WeakMap<object, Group>();

function strokeGroup(m: { pts: Pt[]; owner: Player }, idx: number, mine: boolean): Group {
  let g = strokeCache.get(m);
  if (!g) {
    const pts: Pt[] = [];
    for (let i = 0; i < m.pts.length; i += DECIMATE) pts.push(m.pts[i]);
    if (pts.at(-1) !== m.pts.at(-1)) pts.push(m.pts.at(-1)!);
    const surfs: Surf[] = [];
    for (let i = 1; i < pts.length; i++) surfs.push({ a: pts[i - 1], b: pts[i], kind: "own", key: `i${idx}.${i}` });
    g = { box: boxOf(pts, 1), surfs };
    strokeCache.set(m, g);
  }
  // ownership is relative to the shooter: copy the kind on the way out
  return { box: g.box, surfs: g.surfs.map((s) => ({ ...s, kind: mine ? "own" : "enemy" })) };
}

// The page only changes when a mark is added (every action adds one), so the
// surfaces are cached per state, player and kind until the next mark.
const memo = new WeakMap<GameState, Map<string, Group[]>>();

/** Everything on the page a line from `who` can interact with. */
function surfaces(s: GameState, who: Player, shot: boolean): Group[] {
  let m = memo.get(s);
  const key = `${s.marks.length}|${s.bases.length}|${who}|${shot}`;
  if (!m || !m.has(key)) {
    if (!m || [...m.keys()].some((k) => !k.startsWith(`${s.marks.length}|${s.bases.length}|`))) { m = new Map(); memo.set(s, m); }
    m.set(key, build(s, who, shot));
  }
  return m.get(key)!;
}

function build(s: GameState, who: Player, shot: boolean): Group[] {
  const R = s.rules;
  const W = RULES.pageW, H = RULES.pageH;
  const groups: Group[] = [];
  const c = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  groups.push({
    box: { x0: -1, y0: -1, x1: W + 1, y1: H + 1 },
    surfs: c.map((p, i) => ({ a: p, b: c[(i + 1) % 4], kind: "edge" as const, key: `e${i}` })),
  });
  for (const b of s.bases) {
    if (b.fallen) continue;
    const rule = R.shapes[b.shape];
    if (!rule) continue;
    const enemy = b.owner !== who;
    const kind: SurfKind | null = enemy && rule.wall !== "none" ? (rule.wall === "stop" ? "stop" : "mirror")
      : !enemy && rule.prism && shot ? "prism" : null;
    if (!kind) continue;
    const poly = baseVerts(b)!;
    const surfs: Surf[] = [];
    baseEdges(b).forEach(([a, e], i) => {
      if (kind !== "prism" && b.breached?.includes(i)) return;
      surfs.push({ a, b: e, kind, key: `b${b.id}.${i}`, base: b.id, edge: i, poly });
    });
    if (surfs.length) groups.push({ box: boxOf(poly, 1), surfs });
  }
  const ink = R.ink;
  if (ink.friction > 0 || ink.ownBounces > 0 || ink.enemyStops) {
    s.marks.forEach((m, i) => {
      if (m.t === "stroke") groups.push(strokeGroup(m, i, m.owner === who));
    });
  }
  return groups;
}

interface Ctx {
  groups: Group[];
  branches: Branch[];
  events: TraceEvent[];
  ownBounces: number;
  edgeBounces: number;
  enemyStops: boolean;
  friction: number;
  spread: number;
  clear: number;
  used: Set<string>; // wall edges already used up by this line
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Old ink this close to where the pen rests doesn't count: a soldier's own
// earlier lines all start on his dot.
const START_SKIP = 14; // at least; a rule set can widen it (ink.clear)

function walk(ctx: Ctx, start: Pt, rest: Pt[], budget: number, canSplit: boolean, parent?: { idx: number; d: number }): number {
  const idx = ctx.branches.length;
  const br: Branch = { pts: [start], end: "spent", ...(parent && { parent: parent.idx, parentD: parent.d }) };
  ctx.branches.push(br);
  let cur = start, i = 0, d = 0, skip = "";
  let guard = 0;
  outer: while (i < rest.length && guard++ < 400) {
    const nxt = rest[i];
    const L = dist(cur, nxt);
    if (L < 1e-9) { i++; continue; }
    const box = boxOf([cur, nxt], 0.5);
    const hits: { t: number; s: Surf }[] = [];
    for (const g of ctx.groups) {
      if (!boxesMeet(g.box, box)) continue;
      for (const sf of g.surfs) {
        if (sf.key === skip || ctx.used.has(sf.key)) continue;
        const h = segHit(cur, nxt, sf.a, sf.b);
        if (!h || h.t * L < 1e-6) continue;
        if ((sf.kind === "own" || sf.kind === "enemy") && parent === undefined && d + h.t * L < ctx.clear) continue;
        if (sf.kind === "prism") {
          // only on the way out of the prism
          const e = Math.min(0.5, 0.5 / L);
          if (!insidePoly(lerp(cur, nxt, Math.max(0, h.t - e)), sf.poly!) || insidePoly(lerp(cur, nxt, Math.min(1, h.t + e)), sf.poly!)) continue;
          if (!canSplit) continue;
        }
        if (sf.kind === "own" && ctx.ownBounces <= 0 && ctx.friction <= 0) continue;
        if (sf.kind === "enemy" && !ctx.enemyStops && ctx.friction <= 0) continue;
        hits.push({ t: h.t, s: sf });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    let t0 = 0;
    for (const h of hits) {
      const step = (h.t - t0) * L;
      if (budget < step) {
        br.pts.push(lerp(cur, nxt, t0 + budget / L));
        d += budget;
        budget = 0;
        break outer;
      }
      budget -= step;
      d += step;
      t0 = h.t;
      const at = lerp(cur, nxt, h.t);
      const sf = h.s;
      const redirect = (fn: (p: Pt) => Pt, kind: TraceEvent["kind"]) => {
        br.pts.push(at);
        ctx.events.push({ kind, on: sf.kind, at, d, branch: idx, base: sf.base, edge: sf.edge });
        rest = rest.slice(i).map(fn);
        i = 0;
        cur = at;
        skip = sf.key;
      };
      if (sf.kind === "edge") {
        if (ctx.edgeBounces > 0) {
          ctx.edgeBounces--;
          redirect((p) => reflectPt(p, sf.a, sf.b), "bounce");
          continue outer;
        }
        br.pts.push(at);
        br.end = "edge";
        ctx.events.push({ kind: "edge", on: "edge", at, d, branch: idx });
        break outer;
      }
      if (sf.kind === "stop" || (sf.kind === "enemy" && ctx.enemyStops)) {
        br.pts.push(at);
        br.end = "stop";
        if (sf.kind === "stop") ctx.used.add(sf.key);
        ctx.events.push({ kind: "stop", on: sf.kind, at, d, branch: idx, base: sf.base, edge: sf.edge });
        break outer;
      }
      if (sf.kind === "mirror" || (sf.kind === "own" && ctx.ownBounces > 0)) {
        if (sf.kind === "own") ctx.ownBounces--;
        else ctx.used.add(sf.key);
        redirect((p) => reflectPt(p, sf.a, sf.b), "bounce");
        continue outer;
      }
      if (sf.kind === "prism") {
        const left = rest.slice(i).map((p) => rotatePt(p, at, -ctx.spread));
        redirect((p) => rotatePt(p, at, ctx.spread), "split");
        const ev = ctx.events[ctx.events.length - 1];
        canSplit = false;
        ev.child = walk(ctx, at, left, budget, false, { idx, d });
        continue outer;
      }
      // dried ink it doesn't bounce off or stop at: it drags
      if (ctx.friction > 0) {
        budget -= ctx.friction;
        ctx.events.push({ kind: "friction", on: sf.kind, at, d, branch: idx });
        if (budget <= 0) {
          br.pts.push(at);
          budget = 0;
          break outer;
        }
      }
    }
    const step = (1 - t0) * L;
    if (budget < step) {
      br.pts.push(lerp(cur, nxt, t0 + budget / L));
      d += budget;
      budget = 0;
      break;
    }
    budget -= step;
    d += step;
    br.pts.push(nxt);
    cur = nxt;
    i++;
    skip = "";
  }
  return idx;
}

/** Trace a flick's arc from `from` across the page as `who` sees it. */
export function trace(s: GameState, who: Player, from: Pt, arc: Pt[], shot: boolean): Trace {
  const R = s.rules;
  const ctx: Ctx = {
    groups: surfaces(s, who, shot),
    branches: [],
    events: [],
    ownBounces: R.ink.ownBounces,
    edgeBounces: R.ink.edgeBounces,
    enemyStops: R.ink.enemyStops,
    friction: R.ink.friction,
    spread: R.prismSpread,
    clear: Math.max(START_SKIP, R.ink.clear ?? 0),
    used: new Set(),
  };
  // a copy: the line must never share a point with the soldier, who may move later
  walk(ctx, { x: from.x, y: from.y }, arc.slice(1), pathLen(arc), true);
  return { branches: ctx.branches, events: ctx.events };
}

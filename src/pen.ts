// The pen: a clear hexagonal ballpoint (or a gel pen, or a pencil, as the
// theme has it), balanced upright on a soldier's dot.
// It's modelled as a line in 3D above the page, projected through the same
// camera as the desk, so it stands up out of the tilted page. Its shadow is
// cast by the lamp onto the paper.

import { INK } from "./ink";
import type { Lamp } from "./light";
import { project, type View } from "./projection";
import { theme } from "./theme";

export const PEN = { L: 430, R: 12.5 };

export interface PenPose {
  /** The tip, on (or above) the page. */
  x: number;
  y: number;
  h: number;
  /** Unit axis from tip to top. az is straight up off the page. */
  ax: number;
  ay: number;
  az: number;
  owner: 0 | 1;
  alpha: number;
  /** How much ink is left in the refill, 0..1. */
  ink: number;
  /** While a flick is pulled back: its power, 0..1, shown as the refill filling from the tip in place of `ink`. */
  charge?: number;
}

/** A pen leaning `lean` radians off vertical, its top toward page direction `toward`. */
export function leaning(x: number, y: number, toward: number, lean: number, owner: 0 | 1, ink = 1): PenPose {
  const s = Math.sin(lean);
  return { x, y, h: 0, ax: Math.cos(toward) * s, ay: Math.sin(toward) * s, az: Math.cos(lean), owner, alpha: 1, ink };
}

const at = (p: PenPose, t: number) => ({ x: p.x + p.ax * PEN.L * t, y: p.y + p.ay * PEN.L * t, h: p.h + p.az * PEN.L * t });

// --- shadow, on the page (world coordinates, multiplied) ---------------------

export function drawPenShadow(g: CanvasRenderingContext2D, p: PenPose, lamp: Lamp) {
  if (p.alpha <= 0) return;
  const cast = (q: { x: number; y: number; h: number }) => {
    const k = lamp.h / Math.max(lamp.h * 0.08, lamp.h - q.h);
    return { x: lamp.x + (q.x - lamp.x) * k, y: lamp.y + (q.y - lamp.y) * k };
  };
  const a = cast(at(p, 0)), b = cast(at(p, 1));
  const lift = Math.min(1, p.h / 120);
  const strength = p.alpha * (1 - lift * 0.7) * lamp.on;
  // round-ended soft strokes: a darker core inside a wide, faint penumbra
  g.strokeStyle = g.fillStyle = `rgb(${theme.light.shadow.join(", ")})`;
  g.lineCap = "round";
  for (const [w, al] of [[1.7, 0.14], [3, 0.07], [4.6, 0.04]] as const) {
    g.globalAlpha = al * strength;
    g.lineWidth = PEN.R * w;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  // where the ball meets the paper
  if (p.h < 4) {
    g.globalAlpha = 0.35 * p.alpha;
    g.beginPath();
    g.ellipse(p.x, p.y, 3.5, 2.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// --- the pen, on screen (css px) ------------------------------------------------

export function drawPen(g: CanvasRenderingContext2D, p: PenPose, v: View) {
  if (p.alpha <= 0.01) return;
  const P = (t: number) => { const q = at(p, t); return project(v, q.x, q.y, q.h); };
  const tip = P(0), cone = P(0.085), capA = P(0.7), top = P(1);
  const dx = top.x - tip.x, dy = top.y - tip.y, sl = Math.hypot(dx, dy);
  const ink = theme.ink.body[p.owner]; // the cap, or a pencil's paint
  const mark = INK.pens[p.owner]; // what it writes
  g.save();
  g.globalAlpha = p.alpha;
  g.lineJoin = "round";
  g.lineCap = "round";

  // Seen end-on (standing straight up under a flat camera): just the cap's face.
  if (sl < PEN.R * top.k * 1.2) {
    endFace(g, p, v, 1, theme.ink.tool === "pencil" ? "#e39a9a" : ink, theme.ink.tool === "pencil" ? 0.8 : 1);
    g.restore();
    return;
  }
  const nx = -dy / sl, ny = dx / sl;
  const quad = (a: typeof tip, b: typeof tip, ra: number, rb: number) => {
    g.beginPath();
    g.moveTo(a.x + nx * ra * a.k, a.y + ny * ra * a.k);
    g.lineTo(b.x + nx * rb * b.k, b.y + ny * rb * b.k);
    g.lineTo(b.x - nx * rb * b.k, b.y - ny * rb * b.k);
    g.lineTo(a.x - nx * ra * a.k, a.y - ny * ra * a.k);
    g.closePath();
  };
  const R = PEN.R;
  if (theme.ink.tool === "pencil") {
    drawPencil(g, P, quad, nx, ny, mark, ink, p.charge);
    g.restore();
    return;
  }

  // barrel: clear plastic, faceted. A gradient across its width does the hexagon.
  const mid = P(0.4);
  const w = R * mid.k;
  const grad = g.createLinearGradient(mid.x - nx * w, mid.y - ny * w, mid.x + nx * w, mid.y + ny * w);
  grad.addColorStop(0, "rgba(120,130,140,0.75)");
  grad.addColorStop(0.18, "rgba(250,252,255,0.85)");
  grad.addColorStop(0.32, "rgba(200,210,218,0.5)");
  grad.addColorStop(0.62, "rgba(180,190,200,0.42)");
  grad.addColorStop(0.8, "rgba(235,240,245,0.6)");
  grad.addColorStop(1, "rgba(90,100,110,0.75)");
  quad(cone, capA, R, R);
  g.fillStyle = grad;
  g.fill();
  // the refill inside, with its ink showing how much war is left in it; while a
  // flick is pulled back it shows the power instead, filling up from the tip
  const charging = p.charge !== undefined;
  const fill = charging ? Math.max(0, Math.min(1, p.charge!)) : Math.max(0.04, p.ink);
  const tubeEnd = P(0.085 + 0.6 * fill);
  const tubeTop = P(0.69);
  g.strokeStyle = "rgba(235,235,230,0.8)";
  g.lineWidth = R * (charging ? 0.5 : 0.34) * mid.k;
  g.beginPath(); g.moveTo(cone.x, cone.y); g.lineTo(tubeTop.x, tubeTop.y); g.stroke();
  if (fill > 0 && !charging) {
    g.strokeStyle = mark;
    g.lineWidth = R * 0.26 * mid.k;
    g.beginPath(); g.moveTo(cone.x, cone.y); g.lineTo(tubeEnd.x, tubeEnd.y); g.stroke();
  }
  // facet edges
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = Math.max(0.6, 0.12 * R * mid.k);
  g.beginPath();
  g.moveTo(cone.x - nx * R * 0.55 * cone.k, cone.y - ny * R * 0.55 * cone.k);
  g.lineTo(capA.x - nx * R * 0.55 * capA.k, capA.y - ny * R * 0.55 * capA.k);
  g.stroke();
  g.strokeStyle = "rgba(40,50,60,0.45)";
  g.lineWidth = Math.max(0.6, 0.08 * R * mid.k);
  quad(cone, capA, R, R);
  g.stroke();
  if (theme.ink.tool === "gel") {
    // a gel pen's rubber grip, ribbed, in a smoky tint of its ink
    const gA = P(0.1), gB = P(0.3), gm = P(0.2);
    quad(gA, gB, R * 1.08, R * 1.08);
    const gg = g.createLinearGradient(gm.x - nx * R * gm.k, gm.y - ny * R * gm.k, gm.x + nx * R * gm.k, gm.y + ny * R * gm.k);
    gg.addColorStop(0, shade(ink, -0.6));
    gg.addColorStop(0.3, shade(ink, -0.1));
    gg.addColorStop(1, shade(ink, -0.7));
    g.globalAlpha = p.alpha * 0.85;
    g.fillStyle = gg;
    g.fill();
    g.globalAlpha = p.alpha;
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = Math.max(0.5, 0.06 * R * gm.k);
    for (let i = 1; i < 8; i++) {
      const q = P(0.1 + i * 0.025);
      g.beginPath(); g.moveTo(q.x + nx * R * 1.06 * q.k, q.y + ny * R * 1.06 * q.k); g.lineTo(q.x - nx * R * 1.06 * q.k, q.y - ny * R * 1.06 * q.k); g.stroke();
    }
  }

  // the charge, drawn over the grip: you see the ink through a gel pen's rubber
  if (charging && fill > 0) {
    if (fill >= 1) {
      // full: the ink brims and glows through the plastic
      g.strokeStyle = mark;
      g.globalAlpha = p.alpha * 0.45;
      g.lineWidth = R * 1.5 * mid.k;
      g.beginPath(); g.moveTo(cone.x, cone.y); g.lineTo(tubeEnd.x, tubeEnd.y); g.stroke();
      g.globalAlpha = p.alpha;
    }
    g.strokeStyle = mark;
    g.lineWidth = R * 0.42 * mid.k;
    g.beginPath(); g.moveTo(cone.x, cone.y); g.lineTo(tubeEnd.x, tubeEnd.y); g.stroke();
    // a glint down the ink, so it reads as liquid in a tube
    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.lineWidth = Math.max(0.6, R * 0.08 * mid.k);
    g.beginPath();
    g.moveTo(cone.x - nx * R * 0.1 * cone.k, cone.y - ny * R * 0.1 * cone.k);
    g.lineTo(tubeEnd.x - nx * R * 0.1 * tubeEnd.k, tubeEnd.y - ny * R * 0.1 * tubeEnd.k);
    g.stroke();
  }

  // the cap, posted on the back: opaque coloured plastic with a clip
  quad(capA, top, R * 1.12, R * 1.12);
  const cm = P(0.85), cw = R * 1.12 * cm.k;
  const cg = g.createLinearGradient(cm.x - nx * cw, cm.y - ny * cw, cm.x + nx * cw, cm.y + ny * cw);
  cg.addColorStop(0, shade(ink, -0.45));
  cg.addColorStop(0.25, shade(ink, 0.35));
  cg.addColorStop(0.55, ink);
  cg.addColorStop(1, shade(ink, -0.55));
  g.fillStyle = cg;
  g.fill();
  const clipA = P(0.75), clipB = P(0.98);
  g.strokeStyle = shade(ink, -0.3);
  g.lineWidth = R * 0.42 * cm.k;
  g.beginPath();
  g.moveTo(clipA.x + nx * R * 1.35 * clipA.k, clipA.y + ny * R * 1.35 * clipA.k);
  g.lineTo(clipB.x + nx * R * 1.3 * clipB.k, clipB.y + ny * R * 1.3 * clipB.k);
  g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.lineWidth = R * 0.12 * cm.k;
  g.stroke();
  endFace(g, p, v, 1, ink, 1.12);

  // the writing end: a white cone and a brass ball
  quad(tip, cone, R * 0.18, R);
  const tg = g.createLinearGradient(cone.x - nx * R * cone.k, cone.y - ny * R * cone.k, cone.x + nx * R * cone.k, cone.y + ny * R * cone.k);
  tg.addColorStop(0, "#9c9a94");
  tg.addColorStop(0.3, "#f4f1ea");
  tg.addColorStop(1, "#8d8a84");
  g.fillStyle = tg;
  g.fill();
  g.fillStyle = "#6e5a2e";
  g.beginPath();
  g.arc(tip.x, tip.y, Math.max(1, R * 0.2 * tip.k), 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// The flat end of the cap: a circle perpendicular to the pen's axis, projected.
function endFace(g: CanvasRenderingContext2D, p: PenPose, v: View, t: number, ink: string, rMul: number) {
  // two unit vectors perpendicular to the axis
  let ux = -p.ay, uy = p.ax, uz = 0;
  const ul = Math.hypot(ux, uy);
  if (ul < 1e-4) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
  const wx = p.ay * uz - p.az * uy, wy = p.az * ux - p.ax * uz, wz = p.ax * uy - p.ay * ux;
  const c = at(p, t), R = PEN.R * rMul;
  g.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const q = project(v, c.x + (ux * ca + wx * sa) * R, c.y + (uy * ca + wy * sa) * R, c.h + (uz * ca + wz * sa) * R);
    if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
  }
  g.closePath();
  g.fillStyle = shade(ink, 0.15);
  g.fill();
  g.strokeStyle = shade(ink, -0.4);
  g.lineWidth = 1;
  g.stroke();
}

type Proj = { x: number; y: number; k: number };

// A hexagonal pencil: painted barrel, a sharpened cone of bare wood with the
// lead at its point, and a brass ferrule holding a pink eraser at the top.
function drawPencil(
  g: CanvasRenderingContext2D, P: (t: number) => Proj,
  quad: (a: Proj, b: Proj, ra: number, rb: number) => void, nx: number, ny: number, mark: string, paintC: string, charge?: number,
) {
  const R = PEN.R * 0.82;
  const tip = P(0), lead = P(0.035), cone = P(0.13), fer = P(0.86), rub = P(0.93), top = P(1);
  const across = (m: Proj, r: number, stops: [number, string][]) => {
    const gr = g.createLinearGradient(m.x - nx * r * m.k, m.y - ny * r * m.k, m.x + nx * r * m.k, m.y + ny * r * m.k);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    return gr;
  };
  // the painted barrel: three visible facets
  const mid = P(0.5);
  const paint = (c: string) => across(mid, R, [[0, shade(c, -0.45)], [0.33, shade(c, -0.1)], [0.34, shade(c, 0.3)], [0.66, c], [0.67, shade(c, -0.25)], [1, shade(c, -0.5)]]);
  if (charge === undefined) {
    quad(cone, fer, R, R);
    g.fillStyle = paint(paintC);
    g.fill();
  } else {
    // while a flick is pulled back the paint goes dull, and its colour comes
    // back up from the wood as the pull builds; at full it glows (a pencil has
    // no refill to fill, and a fill in its own ink wouldn't show on its paint)
    const k = Math.max(0, Math.min(1, charge)), lit = P(0.13 + (0.86 - 0.13) * k);
    if (k >= 1) {
      // a soft round halo in its paint, two passes
      g.strokeStyle = paintC;
      g.lineCap = "round";
      for (const [w, a] of [[3.6, 0.14], [2.6, 0.22]] as const) {
        g.globalAlpha *= a;
        g.lineWidth = R * w * mid.k;
        g.beginPath(); g.moveTo(cone.x, cone.y); g.lineTo(fer.x, fer.y); g.stroke();
        g.globalAlpha /= a;
      }
    }
    quad(cone, fer, R, R);
    g.fillStyle = paint(dull(paintC));
    g.fill();
    if (k > 0) {
      quad(cone, lit, R, R);
      g.fillStyle = paint(paintC);
      g.fill();
    }
  }
  // the wood cone and the lead
  quad(lead, cone, R * 0.22, R);
  g.fillStyle = across(P(0.08), R, [[0, "#b08a5a"], [0.4, "#ecd2a8"], [1, "#a47c4c"]]);
  g.fill();
  quad(tip, lead, R * 0.04, R * 0.22);
  g.fillStyle = shade(mark, -0.2);
  g.fill();
  // ferrule and eraser
  quad(fer, rub, R * 1.04, R * 1.04);
  g.fillStyle = across(P(0.9), R, [[0, "#8a7a4a"], [0.3, "#efe2b0"], [0.6, "#b9a468"], [1, "#6e5f34"]]);
  g.fill();
  quad(rub, top, R * 0.98, R * 0.95);
  g.fillStyle = across(P(0.96), R, [[0, "#b8686a"], [0.35, "#f2a4a2"], [1, "#9c5054"]]);
  g.fill();
}

/** A pencil's paint gone dull while unlit by the pull: greyed halfway and darkened. */
function dull(hex: string) {
  const n = parseInt(hex.slice(1), 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const grey = (ch[0] * 0.3 + ch[1] * 0.59 + ch[2] * 0.11);
  return "#" + ch.map((c) => Math.round((c * 0.5 + grey * 0.5) * 0.55).toString(16).padStart(2, "0")).join("");
}

/** Lighten (k>0) or darken (k<0) a hex colour. */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

// --- the pen's own life (LIFE.pen) ------------------------------------------------

/** How long a pen set down on a dot takes to find its balance (ms). */
export const SETTLE_MS = 650;

/**
 * A pen set down on its tip finds its balance: a few rocks along one line,
 * dying away. Signed lean (radians) along `toward`, `t` ms after it lands. Pure.
 */
export function settle(t: number) {
  if (t < 0 || t >= SETTLE_MS) return 0;
  return 0.085 * Math.exp(-t / 150) * Math.sin(t / 40);
}

/**
 * At full pull the pen shivers under the finger: a fine fast tremble on top
 * of the hand's slow wobble. Radians, 0 below nine tenths of full. Pure.
 */
export function shiver(ms: number, power: number) {
  const k = Math.max(0, (power - 0.9) / 0.1);
  if (k <= 0) return 0;
  return 0.011 * k * (Math.sin(ms * 0.21) * 0.6 + Math.sin(ms * 0.37 + 1.1) * 0.4);
}

/** Put down and lifted off: up and fading, `t` ms after it was lifted (height, alpha), or null when gone. */
export const LIFT_MS = 220;
export function lift(t: number) {
  if (t < 0 || t >= LIFT_MS) return null;
  const k = t / LIFT_MS;
  return { h: 110 * k * k, alpha: 1 - k * k };
}

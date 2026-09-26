// Things painted once and reused: the desk's surface, the sheet's soft shadow.
// Each theme has its own desk (src/theme.ts); it's painted the first time
// that theme is on screen, and again only if the theme changes.

import { rng } from "./game";
import { theme, type RGB, type Theme } from "./theme";

// Tileable wood: long straight grain along x, gently wandering, with the odd
// darker figure. Frequencies are whole numbers over the tile so edges meet.
// Walnut by default; `dark`/`light` are the two ends of the grain's tone.
export function woodTexture(size = 512, seed = 5, dark: RGB = [58, 37, 25], light: RGB = [92, 59, 39], pore: RGB = [22, 12, 6], rings = 11): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const r = rng(seed);
  const TAU = Math.PI * 2;
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: i + 1, ph: r() * TAU, a: 0.012 / (i + 1) }));
  const rowTone = Array.from({ length: size }, () => r());
  const fibre = Array.from({ length: size }, () => r());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let warp = 0;
      for (const w of waves) warp += Math.sin(TAU * w.f * u + w.ph) * w.a;
      const vv = v + warp;
      const ring = Math.sin(TAU * vv * rings) * 0.5 + Math.sin(TAU * vv * 29 + 1.3) * 0.25;
      const fine = (fibre[(Math.floor(vv * size) % size + size) % size] - 0.5) * 0.5;
      const tone = (rowTone[(Math.floor(vv * size * 0.5) % size + size) % size] - 0.5) * 0.12;
      const k = Math.max(0, Math.min(1, 0.5 + ring * 0.28 + fine * 0.35 + tone));
      const i = (y * size + x) * 4;
      img.data[i] = dark[0] + k * (light[0] - dark[0]);
      img.data[i + 1] = dark[1] + k * (light[1] - dark[1]);
      img.data[i + 2] = dark[2] + k * (light[2] - dark[2]);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // pores: short dark dashes along the grain
  for (let k = 0; k < 1400; k++) {
    g.fillStyle = `rgba(${pore[0]}, ${pore[1]}, ${pore[2]}, ${0.12 + r() * 0.18})`;
    g.fillRect(r() * size, r() * size, 2 + r() * 6, 1);
  }
  return c;
}

// The desk around the sheet, painted once in page units at low resolution:
// walnut, and the sheet's soft shadow on it. One plain image draw per frame
// instead of a transformed pattern fill (the wood sits in shadow and out of
// focus, so its resolution never shows).
export const DESK = { pad: 1400, S: 0.4 };
export function deskTexture(pw: number, ph: number, t: Theme = theme): HTMLCanvasElement {
  const { pad, S } = DESK;
  const c = document.createElement("canvas");
  c.width = Math.round((pw + pad * 2) * S);
  c.height = Math.round((ph + pad * 2) * S);
  const g = c.getContext("2d")!;
  surface(g, c.width, c.height, t, S, pad, pw, ph);
  // the sheet's shadow, thrown down and to the right of an up-left lamp
  const sh = sheetShadow(pw, ph);
  g.globalAlpha = 0.6;
  g.drawImage(sh, (pad - SHADOW_PAD + 6) * S, (pad - SHADOW_PAD + 10) * S, (pw + SHADOW_PAD * 2) * S, (ph + SHADOW_PAD * 2) * S);
  g.globalAlpha = 1;
  return c;
}

// A soft, feathered rectangle: the shadow a sheet of paper throws on the desk.
// Drawn small and stretched: blur is free at low resolution.
export function sheetShadow(w: number, h: number): HTMLCanvasElement {
  const pad = 24, sc = 0.18;
  const c = document.createElement("canvas");
  c.width = Math.round((w + pad * 2) * sc);
  c.height = Math.round((h + pad * 2) * sc);
  const g = c.getContext("2d")!;
  // shadowBlur rather than ctx.filter: older iOS Safari has no canvas filters.
  // The rect itself is drawn off-canvas; only its shadow lands.
  const off = c.width * 2;
  g.shadowColor = "rgba(0,0,0,1)";
  g.shadowBlur = Math.max(2, pad * sc * 0.8);
  g.shadowOffsetX = off;
  g.fillStyle = "#000";
  g.fillRect(pad * sc - off, pad * sc, w * sc, h * sc);
  return c;
}
export const SHADOW_PAD = 24;

// --- the desks ------------------------------------------------------------------

function tile(g: CanvasRenderingContext2D, tex: HTMLCanvasElement, scale: number, w: number, h: number) {
  const p = g.createPattern(tex, "repeat")!;
  p.setTransform(new DOMMatrix().scale(scale));
  g.fillStyle = p;
  g.fillRect(0, 0, w, h);
}

/** The theme's desk, in page units scaled by S, with the sheet at (pad, pad). */
function surface(g: CanvasRenderingContext2D, w: number, h: number, t: Theme, S: number, pad: number, pw: number, ph: number) {
  const { a, b, accent } = t.desk;
  const r = rng(91);
  const at = (x: number) => (pad + x) * S; // page units to desk pixels
  switch (t.desk.kind) {
    case "walnut":
      tile(g, woodTexture(), 1.5 * S, w, h);
      break;
    case "school": {
      // a varnished school desk: honey wood, years of scratches and ink
      tile(g, woodTexture(512, 12, a, b, [60, 34, 14], 7), 1.8 * S, w, h);
      g.lineCap = "round";
      for (let k = 0; k < 90; k++) {
        const x = r() * w, y = r() * h, l = (20 + r() * 120) * S, an = (r() - 0.5) * 0.9;
        g.strokeStyle = r() < 0.5 ? "rgba(255, 236, 200, 0.14)" : "rgba(50, 26, 8, 0.2)";
        g.lineWidth = Math.max(0.6, (1 + r() * 2) * S);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
      }
      // ink blots and a biro doodle where a bored hand rested
      for (let k = 0; k < 7; k++) {
        const x = r() * w, y = r() * h, rad = (8 + r() * 26) * S;
        g.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.18 + r() * 0.2})`;
        g.beginPath(); g.ellipse(x, y, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.35)`;
      g.lineWidth = Math.max(0.8, 2.2 * S);
      const cx = at(pw + 160), cy = at(ph * 0.35);
      g.beginPath();
      for (let i = 0; i <= 60; i++) { const an = i * 0.55, rr = (8 + i * 1.3) * S; g.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); }
      g.stroke();
      g.font = `${Math.round(70 * S)}px Caveat, cursive`;
      g.fillStyle = "rgba(60, 30, 10, 0.3)";
      g.save(); g.translate(at(-330), at(ph * 0.62)); g.rotate(-0.3); g.fillText("D + B", 0, 0); g.restore();
      break;
    }
    case "mahogany": {
      tile(g, woodTexture(512, 21, a, b, [30, 10, 6], 15), 1.4 * S, w, h);
      // a green leather blotter under the pad, its corners in darker leather
      const m = 90, x0 = at(-m), y0 = at(-m), x1 = at(pw + m), y1 = at(ph + m);
      g.fillStyle = "rgba(0, 0, 0, 0.35)";
      g.fillRect(x0 + 4 * S, y0 + 8 * S, x1 - x0, y1 - y0);
      g.fillStyle = `rgb(${accent.join(",")})`;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let k = 0; k < 1800; k++) {
        g.fillStyle = r() < 0.5 ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.06)";
        g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1 + r() * 3, 1 + r() * 2);
      }
      const cw = 150 * S;
      g.fillStyle = "#2a1510";
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + sx * cw, cy); g.lineTo(cx, cy + sy * cw); g.closePath(); g.fill();
      }
      g.strokeStyle = "rgba(200, 170, 90, 0.25)";
      g.lineWidth = Math.max(0.6, 1.5 * S);
      g.strokeRect(x0 + 10 * S, y0 + 10 * S, x1 - x0 - 20 * S, y1 - y0 - 20 * S);
      break;
    }
    case "birch":
      tile(g, woodTexture(512, 33, a, b, [120, 90, 50], 5), 2.2 * S, w, h);
      // pencil shavings' dust and a graphite smudge or two
      for (let k = 0; k < 5; k++) {
        const x = r() * w, y = r() * h, rad = (30 + r() * 60) * S;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${accent.join(",")}, 0.14)`);
        gr.addColorStop(1, `rgba(${accent.join(",")}, 0)`);
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      break;
    case "felt":
    case "mat": {
      g.fillStyle = `rgb(${a.join(",")})`;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < (w * h) / 30; k++) {
        g.fillStyle = r() < 0.5 ? `rgba(${b.join(",")}, 0.5)` : `rgba(${accent.join(",")}, 0.25)`;
        g.fillRect(r() * w, r() * h, 1, 1);
      }
      if (t.desk.kind === "mat") {
        // a self-healing cutting mat: a centimetre grid, bold every five, knife scores
        const cm = 48 * S;
        const ox = at(0) % cm, oy = at(0) % cm;
        for (let i = 0; ox + i * cm < w; i++) {
          g.fillStyle = `rgba(${accent.join(",")}, ${i % 5 ? 0.16 : 0.34})`;
          g.fillRect(ox + i * cm, 0, i % 5 ? 1 : 1.6, h);
        }
        for (let i = 0; oy + i * cm < h; i++) {
          g.fillStyle = `rgba(${accent.join(",")}, ${i % 5 ? 0.16 : 0.34})`;
          g.fillRect(0, oy + i * cm, w, i % 5 ? 1 : 1.6);
        }
        g.strokeStyle = "rgba(200, 240, 220, 0.08)";
        g.lineWidth = 1;
        for (let k = 0; k < 40; k++) {
          const x = r() * w, y = r() * h, l = (60 + r() * 400) * S, an = r() * Math.PI;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
        }
      }
      break;
    }
    case "gingham": {
      // the kitchen table's oilcloth: a faded check, a little worn where arms rest
      g.fillStyle = `rgb(${b.join(",")})`;
      g.fillRect(0, 0, w, h);
      const sq = 58 * S, ox = at(0) % sq, oy = at(0) % sq;
      g.fillStyle = `rgba(${a.join(",")}, 0.3)`;
      for (let x = ox - sq; x < w; x += sq * 2) g.fillRect(x, 0, sq, h);
      for (let y = oy - sq; y < h; y += sq * 2) g.fillRect(0, y, w, sq);
      for (let k = 0; k < (w * h) / 40; k++) {
        g.fillStyle = r() < 0.6 ? "rgba(255, 255, 255, 0.1)" : `rgba(${accent.join(",")}, 0.12)`;
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
      }
      break;
    }
  }
}

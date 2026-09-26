// Things painted once and reused: the desk's wood, the sheet's soft shadow.

import { rng } from "./game";

// Tileable walnut: long straight grain along x, gently wandering, with the
// odd darker figure. Frequencies are whole numbers over the tile so edges meet.
export function woodTexture(size = 512, seed = 5): HTMLCanvasElement {
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
      const ring = Math.sin(TAU * vv * 11) * 0.5 + Math.sin(TAU * vv * 29 + 1.3) * 0.25;
      const fine = (fibre[(Math.floor(vv * size) % size + size) % size] - 0.5) * 0.5;
      const tone = (rowTone[(Math.floor(vv * size * 0.5) % size + size) % size] - 0.5) * 0.12;
      const k = Math.max(0, Math.min(1, 0.5 + ring * 0.28 + fine * 0.35 + tone));
      const i = (y * size + x) * 4;
      img.data[i] = 58 + k * 34;
      img.data[i + 1] = 37 + k * 22;
      img.data[i + 2] = 25 + k * 14;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // pores: short dark dashes along the grain
  for (let k = 0; k < 1400; k++) {
    g.fillStyle = `rgba(22, 12, 6, ${0.12 + r() * 0.18})`;
    g.fillRect(r() * size, r() * size, 2 + r() * 6, 1);
  }
  return c;
}

// The desk around the sheet, painted once in page units at low resolution:
// walnut, and the sheet's soft shadow on it. One plain image draw per frame
// instead of a transformed pattern fill (the wood sits in shadow and out of
// focus, so its resolution never shows).
export const DESK = { pad: 1400, S: 0.4 };
export function deskTexture(pw: number, ph: number): HTMLCanvasElement {
  const { pad, S } = DESK;
  const c = document.createElement("canvas");
  c.width = Math.round((pw + pad * 2) * S);
  c.height = Math.round((ph + pad * 2) * S);
  const g = c.getContext("2d")!;
  const wood = g.createPattern(woodTexture(), "repeat")!;
  wood.setTransform(new DOMMatrix().scale(1.5 * S));
  g.fillStyle = wood;
  g.fillRect(0, 0, c.width, c.height);
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

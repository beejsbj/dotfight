// The rulebook page: an exercise book of rules under the desk lamp. The words
// are plain HTML; this paints the desk and the paper with the game's own
// textures and draws each figure with the game's ink when it scrolls into view.

import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-700.css";
import "@fontsource/patrick-hand/latin-400.css";
import "@fontsource/special-elite/latin-400.css";
import "./rulebook.css";
import { INK, inkCircle, inkPolygon, paperGrain } from "../ink";
import { woodTexture } from "../textures";
import { FIGURES, type Figure } from "./figures";

const root = document.documentElement;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("og");

// --- the desk and the paper, painted by the game's own texture code ------------

root.style.setProperty("--wood", `url(${woodTexture(512, 5).toDataURL("image/jpeg", 0.82)})`);
root.style.setProperty("--grain", `url(${paperGrain(320, 320, 7).toDataURL()})`);

// --- figures -------------------------------------------------------------------

interface Live {
  el: HTMLCanvasElement;
  fig: Figure;
  t: number;
  from?: number;
}

const lives: Live[] = [];
for (const el of document.querySelectorAll<HTMLCanvasElement>("canvas[data-fig]")) {
  const fig = FIGURES[el.dataset.fig!];
  if (!fig) continue;
  el.style.aspectRatio = `${fig.w} / ${fig.h}`;
  lives.push({ el, fig, t: still || el.hasAttribute("data-still") ? 1 : 0 });
}

function paint(l: Live) {
  const g = l.el.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, l.el.width, l.el.height);
  const k = l.el.width / l.fig.w;
  g.setTransform(k, 0, 0, k, 0, 0);
  l.fig.draw(g, l.t);
}

function fit(l: Live) {
  const w = l.el.clientWidth;
  if (!w) return;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr), ph = Math.round((w * dpr * l.fig.h) / l.fig.w);
  if (l.el.width !== pw || l.el.height !== ph) { l.el.width = pw; l.el.height = ph; }
  paint(l);
}

let running = false;
function tick(now: number) {
  running = false;
  for (const l of lives) {
    if (l.from === undefined) continue;
    l.t = Math.min(1, (now - l.from) / l.fig.dur);
    paint(l);
    if (l.t >= 1) l.from = undefined;
    else running = true;
  }
  if (running) requestAnimationFrame(tick);
}
function play(l: Live) {
  if (still) return;
  l.from = performance.now();
  if (!running) { running = true; requestAnimationFrame(tick); }
}

// Handwriting in the figures needs the fonts first.
Promise.all([document.fonts.load("400 18px Caveat"), document.fonts.load("700 18px Caveat")]).finally(() => {
  for (const l of lives) fit(l);
  if (!still && "IntersectionObserver" in window) {
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const l = lives.find((x) => x.el === e.target);
        if (l && l.t === 0 && l.from === undefined) play(l);
        seen.unobserve(e.target);
      }
    }, { threshold: 0.45 });
    for (const l of lives) seen.observe(l.el);
  } else for (const l of lives) { l.t = 1; paint(l); }
  // tap a drawing to watch it again
  for (const l of lives) {
    if (still) continue;
    l.el.title = "tap to draw it again";
    l.el.addEventListener("click", () => { if (l.from === undefined) { l.t = 0; play(l); } });
  }
  document.body.classList.add("drawn");
});

// --- the shapes, drawn small beside their names ------------------------------------

function icons() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  document.querySelectorAll<HTMLCanvasElement>("canvas[data-shape]").forEach((el, i) => {
    const n = { circle: 0, triangle: 3, square: 4, pentagon: 5, hexagon: 6 }[el.dataset.shape!] ?? 0;
    const size = 34;
    el.width = el.height = Math.round(size * dpr);
    const g = el.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = size / 2, r = 13;
    if (!n) return inkCircle(g, c, c, r, INK.pens[0], 300 + i, 2.2);
    const turn = n === 3 ? 0 : n === 4 ? Math.PI / 4 : n === 5 ? -Math.PI / 2 : 0;
    const pts = Array.from({ length: n }, (_, k) => ({ x: c + Math.cos(turn + (k * Math.PI * 2) / n) * r, y: c + Math.sin(turn + (k * Math.PI * 2) / n) * r }));
    inkPolygon(g, pts, INK.pens[0], 300 + i, 2.2);
  });
}
icons();

let resizing = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizing);
  resizing = requestAnimationFrame(() => lives.forEach(fit));
});

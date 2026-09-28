// The rulebook page: an exercise book of rules under the desk lamp. The words
// are plain HTML; this paints the desk and the paper with the game's own
// textures and draws each figure with the game's ink when it scrolls into view.

import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-700.css";
import "@fontsource/patrick-hand/latin-400.css";
import "@fontsource/special-elite/latin-400.css";
import "./rulebook.css";
import "./book.css";
import { INK, inkCircle, inkPolygon, paperGrain } from "../ink";
import { woodTexture } from "../textures";
import { FIGURES, type Figure } from "./figures";
import { clock } from "./clock";
import { openBook } from "./flip";

const root = document.documentElement;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("og");
// Read as a book (turning pages) unless asked for one long page (?read=all) or the share card (?og).
const paged = root.classList.contains("paged");

// --- the desk and the paper, painted by the game's own texture code ------------

root.style.setProperty("--wood", `url(${woodTexture(512, 5).toDataURL("image/jpeg", 0.82)})`);
root.style.setProperty("--grain", `url(${paperGrain(320, 320, 7).toDataURL()})`);

// --- figures -------------------------------------------------------------------

interface Live {
  el: HTMLCanvasElement;
  fig: Figure;
  t: number;
  from?: number;
  /** in a book, the finished drawing as a picture on its page */
  img?: HTMLImageElement;
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

// In a book, a finished drawing is swapped for a picture of itself. A canvas is
// a compositor layer of its own and a picture isn't, so a turning leaf moves as
// one piece: on a throttled phone that about halves the time a turning frame takes.
function freeze(l: Live) {
  // (a drawing not yet drawn is a blank picture until its page opens)
  if (!paged || l.from !== undefined || (l.t > 0 && l.t < 1)) return;
  l.el.toBlob((b) => {
    if (!b || l.from !== undefined) return;
    let img = l.img;
    if (!img) {
      img = l.img = document.createElement("img");
      img.className = "fig";
      img.alt = l.el.getAttribute("aria-label") ?? "";
      img.style.aspectRatio = l.el.style.aspectRatio;
      if (!still) { img.title = "tap to draw it again"; img.addEventListener("click", () => again(l)); }
      l.el.after(img);
    } else URL.revokeObjectURL(img.src);
    const done = img;
    done.hidden = true;
    done.src = URL.createObjectURL(b);
    done.decode().then(() => { if (l.from === undefined) { done.hidden = false; l.el.hidden = true; } }, () => {});
  });
}
function thaw(l: Live) {
  if (!l.img || !l.el.hidden) return;
  l.el.hidden = false;
  l.img.hidden = true;
}
function again(l: Live) {
  if (l.from !== undefined) return;
  thaw(l);
  l.t = 0;
  play(l);
}

function fit(l: Live) {
  const w = l.el.hidden && l.img ? l.img.clientWidth : l.el.clientWidth;
  if (!w) return;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr), ph = Math.round((w * dpr * l.fig.h) / l.fig.w);
  if (l.el.width !== pw || l.el.height !== ph) { l.el.width = pw; l.el.height = ph; }
  paint(l);
  freeze(l);
}

let running = false;
function tick() {
  const now = clock.now();
  running = false;
  for (const l of lives) {
    if (l.from === undefined) continue;
    l.t = Math.min(1, (now - l.from) / l.fig.dur);
    paint(l);
    if (l.t >= 1) { l.from = undefined; freeze(l); }
    else running = true;
  }
  if (running) requestAnimationFrame(tick);
}
function play(l: Live) {
  if (still) return;
  thaw(l);
  l.from = clock.now();
  if (!running) { running = true; requestAnimationFrame(tick); }
}

/** A figure drawn finished and faint, for the ink showing through the back of its page. */
function ghost(el: HTMLCanvasElement) {
  const fig = FIGURES[el.dataset.ghost!];
  const w = el.clientWidth;
  if (!fig || !w) return;
  const k = Math.min(1.5, window.devicePixelRatio || 1);
  el.width = Math.round(w * k);
  el.height = Math.round((w * k * fig.h) / fig.w);
  const g = el.getContext("2d")!;
  g.setTransform(el.width / fig.w, 0, 0, el.width / fig.w, 0, 0);
  fig.draw(g, 1);
  el.toBlob((b) => {
    if (!b) return;
    const img = document.createElement("img");
    img.className = "fig";
    img.alt = "";
    img.style.aspectRatio = el.style.aspectRatio;
    img.src = URL.createObjectURL(b);
    img.decode().then(() => el.replaceWith(img), () => {});
  });
}

function book() {
  try {
    openBook({
      still,
      laidOut: () => lives.forEach(fit),
      // a drawing draws itself when its page opens
      opened: (sides) => { for (const l of lives) if (l.t === 0 && l.from === undefined && sides.some((s) => s?.contains(l.el))) play(l); },
      ghost,
    });
    root.classList.add("ready");
  } catch (e) {
    // if the book can't be bound, read it as one long page
    console.error(e);
    location.replace(`${location.pathname}?read=all${location.hash}`);
  }
}

function scroll() {
  for (const l of lives) fit(l);
  // the fonts have moved things since the browser jumped to the address: jump again
  const at = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (at) at.scrollIntoView({ behavior: "instant", block: "start" });
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
}

// Handwriting in the figures, and the pages' measurements, need the fonts first.
const fonts = ["400 18px Caveat", "700 18px Caveat", "400 18px 'Patrick Hand'", "400 12px 'Special Elite'"];
Promise.all(fonts.map((f) => document.fonts.load(f))).finally(() => {
  if (paged && root.classList.contains("paged")) book();
  else scroll();
  // tap a drawing to watch it again
  for (const l of lives) {
    if (still) continue;
    l.el.title = "tap to draw it again";
    l.el.addEventListener("click", () => again(l));
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
if (!paged) addEventListener("resize", () => {
  cancelAnimationFrame(resizing);
  resizing = requestAnimationFrame(() => lives.forEach(fit));
});

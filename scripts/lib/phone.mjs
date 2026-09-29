// Scripted playtests at phone size with real touch events (CDP).
// Usage: node scripts/playtest.mjs <scenario> [url] [outdir]
// Needs the dev server (window.pft is dev-only) and Chrome.

import { browserOpts } from "./guarded-browser.mjs";
import { chromium } from "playwright-core";

export async function phone({ url = "http://localhost:5191/", w = 390, h = 844, dpr = 3, clear = true, taught = true, browser: shared, context } = {}) {
  // pass `browser` to put several phones (separate contexts, separate storage) in one Chrome,
  // and `context` to open another page on the same phone (same storage): a reopened app
  const browser = shared ?? await chromium.launch({ ...browserOpts, executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox", ...(process.env.PFT_ARGS ? process.env.PFT_ARGS.split(" ") : [])] });
  try {
    const ctx = context ?? await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const logs = [];
    page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
    await page.goto(url);
    if (clear) {
      await page.evaluate((taught) => {
        localStorage.clear();
        localStorage.setItem("pft:muted", "1");
        if (taught) { localStorage.setItem("pft:taught:place", "1"); localStorage.setItem("pft:taught:aim", "1"); }
      }, taught);
      await page.reload();
    }
    await page.waitForFunction(() => window.pft);
    await page.evaluate(() => document.fonts.ready);
    const cdp = await ctx.newCDPSession(page);
    const touch = async (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    const T = {
      browser, page, cdp, logs,
      async tap(x, y, hold = 60) { await touch("touchStart", [[x, y]]); await page.waitForTimeout(hold); await touch("touchEnd", []); },
      async drag(x0, y0, x1, y1, { steps = 12, hold = 80, ms = 250, release = true } = {}) {
        await touch("touchStart", [[x0, y0]]);
        await page.waitForTimeout(hold);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          await touch("touchMove", [[x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]]);
          await page.waitForTimeout(ms / steps);
        }
        if (release) await touch("touchEnd", []);
      },
      touch,
      async world(x, y) { return page.evaluate(([x, y]) => window.pft.cam.toScreen(x, y), [x, y]); },
      async wait(fn, arg, timeout = 20000) { return page.waitForFunction(fn, arg, { timeout, polling: 50 }); },
      async shot(file) { await page.screenshot({ path: file }); },
      async state() { return page.evaluate(() => ({ phase: window.pft.s.phase, current: window.pft.s.current, turn: window.pft.s.turn, busy: window.pft.busy, screen: window.pft.screen, marks: window.pft.s.marks.length })); },
    };
    return T;
  } catch (error) {
    if (!shared) await browser.close().catch(() => {});
    throw error;
  }
}

// Wait until it's a human's turn and nothing is animating.
export async function idle(T, timeout = 30000) {
  await T.wait(() => { const p = window.pft; return p.screen !== "game" || (!p.busy && !p.res && p.cam.settled); }, undefined, timeout);
}

// Place a base at world (x, y) by touch (the ghost floats 80px above the finger).
export async function placeAt(T, x, y) {
  const p = await T.world(x, y);
  await T.tap(p.x, p.y + 80, 120);
}

// Flick soldier `id` toward world point (tx, ty) with a pull of `px` screen px.
export async function flickAt(T, id, tx, ty, px = 110, { kind = "shoot", hold = 200, shot } = {}) {
  await T.page.evaluate((k) => document.querySelector(`#kind [data-kind="${k}"]`)?.click(), kind);
  const me = await T.page.evaluate((id) => window.pft.s.soldiers[id], id);
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40); // pick him up
  await T.wait(() => window.pft.cam.settled, undefined, 60000);
  const b = await T.world(me.x, me.y);
  const t = await T.world(tx, ty);
  const ang = Math.atan2(t.y - b.y, t.x - b.x);
  // pull from a comfortable spot low on the screen
  const sx = 195, sy = 700;
  await T.drag(sx, sy, sx - Math.cos(ang) * px, sy - Math.sin(ang) * px, { hold: 60, ms: hold, release: !shot });
  if (shot) {
    await T.page.waitForTimeout(350);
    await T.shot(shot);
    await T.touch("touchEnd", []);
  }
}

// The page-turning rulebook, both books, phone and desktop: turning by finger,
// wheel and trackpad, held part-way; the contents flurry; deep links and the
// address as you read; read-as-one-page; reduced motion; drawings drawing in;
// nothing cut off. Films the turns frame by frame and times a scrubbed turn.
//   node scripts/playtest.mjs rulebook http://localhost:5173/ /tmp/rulebook
// Env: FILM=docs/shots/rulebook-flip (where the films go), PERF=0 to skip timing,
//      THROTTLE (CPU slowdown for the timing, default 4).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const FPS = 30;
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures.push(what); };

export default async function (T, out) {
  const base = new URL(T.page.url()).origin;
  const film = process.env.FILM;
  const throttle = +(process.env.THROTTLE ?? 4);
  const errors = [];

  async function open(path, { w = 390, h = 844, dpr = 2, touch = w < 700, motion = "no-preference" } = {}) {
    const ctx = await T.browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, reducedMotion: motion });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${path}: ${m.text()}`); });
    await ctx.addInitScript(() => localStorage.setItem("pft:muted", "1"));
    await page.goto(base + path);
    await page.waitForFunction(() => document.documentElement.classList.contains("ready") || document.body.classList.contains("drawn"));
    const how = await page.evaluate(() => document.documentElement.className);
    if (!/\bog\b|scroll/.test(how) && !/ready/.test(how)) throw new Error(`${path} didn't bind as a book: <html class="${how}">`);
    const cdp = await ctx.newCDPSession(page);
    const touchAt = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const B = {
      ctx, page, cdp, touchAt,
      book: () => page.evaluate(() => ({ pos: book.pos, rest: book.rest, max: book.max, mode: book.mode, pages: book.pages, hash: location.hash, air: document.querySelectorAll(".leaf.t").length })),
      frame: () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))),
      /** stop the rulebook's clock: from here time only moves when stepped, one film frame at a time */
      async freeze() { await page.evaluate(() => { let t = performance.now(); book.clock.now = () => t; window.__step = (ms) => { t += ms; }; }); },
      async thaw() { await page.evaluate(() => { book.clock.now = () => performance.now(); }); },
      async step(ms = 1000 / FPS) { await page.evaluate((ms) => window.__step(ms), ms); await B.frame(); },
      shot: (file) => page.screenshot({ path: file, type: "jpeg", quality: 84 }),
      settled: () => page.waitForFunction(() => !document.querySelector(".leaf.t") && Number.isInteger(book.pos), undefined, { timeout: 8000 }),
    };
    await page.waitForTimeout(1300); // the lamp clicks on
    return B;
  }

  /** a film: numbered frames into a folder, then a webm and a gif */
  function reel(name) {
    const dir = `${out}/${name}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    let n = 0;
    return {
      dir,
      next: () => `${dir}/${String(n++).padStart(3, "0")}.jpg`,
      get count() { return n; },
      cut(width) {
        if (!film) return;
        mkdirSync(film, { recursive: true });
        const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", `${dir}/%03d.jpg`, ...args], { stdio: "inherit" });
        ff(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-pix_fmt", "yuv420p", `${film}/${name}.webm`]);
        ff(["-vf", `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, `${film}/${name}.gif`]);
      },
    };
  }

  const near = (a, b, tol = 0.04) => Math.abs(a - b) <= tol;

  // --- phone: a finger turns the page, and holds it part-way --------------------------
  {
    const B = await open("/rules");
    const s0 = await B.book();
    check(s0.mode === "single" && s0.rest === 0, `phone opens single pages at the cover (${s0.mode}, ${s0.rest})`);
    await B.shot(`${out}/phone-cover.jpg`);

    // finger down on the cover's right edge, drag left: hold at 30% and 60%
    const W = await B.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".bk")).getPropertyValue("--pw")));
    const x0 = 360, y0 = 640, per = W * 0.9; // a page's worth of finger travel
    await B.touchAt("touchStart", [[x0, y0]]);
    for (const [k, name] of [[0.3, "30"], [0.6, "60"]]) {
      const from = await B.page.evaluate(() => book.pos);
      for (let i = 1; i <= 8; i++) { await B.touchAt("touchMove", [[x0 - per * (from + ((k - from) * i) / 8), y0]]); await B.frame(); }
      await B.page.waitForTimeout(400); // held: nothing moves on its own
      const s = await B.book();
      check(near(s.pos, k) && s.air === 1, `a finger holds the cover ${name}% over (pos ${s.pos.toFixed(3)})`);
      await B.shot(`${out}/phone-hold-${name}.jpg`);
    }
    // drag back to 20% slowly and let go: it falls back
    for (let i = 1; i <= 8; i++) { await B.touchAt("touchMove", [[x0 - per * (0.6 - (0.4 * i) / 8), y0]]); await B.page.waitForTimeout(40); }
    await B.page.waitForTimeout(200);
    await B.touchAt("touchEnd", []);
    await B.settled();
    check((await B.book()).rest === 0, "let go after dragging back, and the cover falls shut");

    // a short flick turns it
    await B.touchAt("touchStart", [[x0, y0]]);
    for (let i = 1; i <= 5; i++) { await B.touchAt("touchMove", [[x0 - 16 * i, y0]]); await B.page.waitForTimeout(12); }
    await B.touchAt("touchEnd", []);
    await B.settled();
    let s = await B.book();
    check(s.rest === 1, `a quick flick turns the page (rest ${s.rest})`);
    check(s.hash === "#page", `the address follows the page (${s.hash})`);

    // swiping up turns it too, like scrolling
    await B.touchAt("touchStart", [[200, 650]]);
    for (let i = 1; i <= 8; i++) { await B.touchAt("touchMove", [[200, 650 - 40 * i]]); await B.page.waitForTimeout(16); }
    await B.touchAt("touchEnd", []);
    await B.settled();
    s = await B.book();
    check(s.rest === 2, `swiping up turns the page (rest ${s.rest}, ${s.hash})`);

    // the drawings: page 3's figure is blank until its page opens, then draws itself
    const inked = (p) => B.page.evaluate((p) => {
      const c = document.querySelectorAll(".side.pg:not(.ghost)")[p - 1]?.querySelector("canvas[data-fig]");
      if (!c) return -1;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
      return n;
    }, p);
    const fig = await B.page.evaluate(() => [...document.querySelectorAll(".side.pg:not(.ghost)")].findIndex((pg, i) => i >= 3 && pg.querySelector("canvas[data-fig]")) + 1);
    await B.freeze();
    const before = await inked(fig);
    await B.page.evaluate((k) => book.jump(k), fig);
    for (let i = 0; i < 30; i++) await B.step(); // the leaves land
    const early = await inked(fig);
    for (let i = 0; i < 150; i++) await B.step();
    const done = await inked(fig);
    await B.thaw();
    check(before < done * 0.5 && early < done, `page ${fig}'s drawing draws itself as its page opens (${before} → ${early} → ${done} inked px)`);
    await B.shot(`${out}/phone-figure.jpg`);
    await B.ctx.close();
  }

  // --- phone: filmed turn, a finger at 30 frames a second -----------------------------
  {
    const B = await open("/rules");
    await B.page.evaluate(() => book.settle(1));
    await B.page.waitForTimeout(2500); // page 1 finished drawing
    await B.freeze();
    const R = reel("phone-turn");
    const W = await B.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".bk")).getPropertyValue("--pw")));
    const x0 = 365, y0 = 700, per = W * 0.9;
    for (let i = 0; i < 6; i++) { await B.step(); await B.shot(R.next()); }
    await B.touchAt("touchStart", [[x0, y0]]);
    // lift slowly, hold at about 30%, carry on to about 60%, hold, let go
    const path = [...Array.from({ length: 14 }, (_, i) => 0.3 * ((i + 1) / 14) ** 1.3), ...Array(8).fill(0.3), ...Array.from({ length: 12 }, (_, i) => 0.3 + 0.3 * ((i + 1) / 12)), ...Array(8).fill(0.6)];
    for (const k of path) { await B.touchAt("touchMove", [[x0 - per * k, y0 - 30 * k]]); await B.step(); await B.shot(R.next()); }
    await B.touchAt("touchEnd", []);
    for (let i = 0; i < 26; i++) { await B.step(); await B.shot(R.next()); }
    // and back: a finger from the left edge brings the page back
    await B.touchAt("touchStart", [[30, 560]]);
    for (let i = 1; i <= 14; i++) { await B.touchAt("touchMove", [[30 + 22 * i, 560]]); await B.step(); await B.shot(R.next()); }
    await B.touchAt("touchEnd", []);
    for (let i = 0; i < 22; i++) { await B.step(); await B.shot(R.next()); }
    await B.thaw();
    R.cut(390);
    console.log(`     phone-turn: ${R.count} frames`);
    await B.ctx.close();
  }

  // --- phone: the contents slip, a flurry of pages ---------------------------------
  {
    const B = await open("/rules");
    await B.freeze();
    const R = reel("phone-contents");
    await B.shot(R.next());
    await B.page.locator('.slip a[href="#snipe"]').click();
    for (let i = 0; i < 36; i++) {
      await B.step();
      if (i === 9) check((await B.book()).air > 1, `the contents jump turns several leaves at once (${(await B.book()).air} in the air)`);
      await B.shot(R.next());
    }
    await B.thaw();
    await B.settled();
    const s = await B.book();
    const onPage = await B.page.evaluate(() => { const r = document.getElementById("snipe").getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    check(onPage && s.hash === "#snipe", `the contents slip opens Snipe's page (${s.hash}, on screen: ${onPage})`);
    R.cut(390);
    await B.ctx.close();
  }

  // --- desktop: a spread; the wheel and a trackpad turn it ---------------------------
  {
    const B = await open("/rules", { w: 1440, h: 900, dpr: 1 });
    let s = await B.book();
    check(s.mode === "spread", `desktop opens as a spread (${s.mode})`);
    const dark = await B.page.evaluate(() => +getComputedStyle(document.querySelector(".dark")).opacity);
    check(dark < 0.05, `the lamp is on (overlay ${dark})`);
    await B.shot(`${out}/desk-cover.jpg`);
    await B.page.mouse.move(720, 450);
    // one notch of a mouse wheel lifts the cover part-way, then it finishes
    await B.page.mouse.wheel(0, 100);
    await B.page.waitForTimeout(120);
    s = await B.book();
    check(s.pos > 0.05 && s.pos < 0.5, `one wheel notch lifts the cover part-way (pos ${s.pos.toFixed(3)})`);
    await B.settled();
    s = await B.book();
    check(s.rest === 1, `...and it finishes turning when the wheel stops (rest ${s.rest})`);
    await B.page.waitForTimeout(2600);
    await B.shot(`${out}/desk-spread-1.jpg`);
    // a trackpad: many small deltas, held part-way
    for (let i = 0; i < 26; i++) { await B.page.mouse.wheel(0, 9); await B.page.waitForTimeout(16); }
    await B.page.waitForTimeout(60);
    s = await B.book();
    check(s.pos > 1.2 && s.pos < 1.7 && s.air === 1, `small trackpad deltas scrub the page part-way (pos ${s.pos.toFixed(3)})`);
    await B.shot(`${out}/desk-trackpad-mid.jpg`);
    await B.settled();
    s = await B.book();
    check(s.rest === 2, `...and it turns when the fingers stop (rest ${s.rest}, ${s.hash})`);
    // sideways swipes on a trackpad turn it too; scrolling back brings it back
    for (let i = 0; i < 20; i++) { await B.page.mouse.wheel(-10, 0); await B.page.waitForTimeout(16); }
    await B.settled();
    check((await B.book()).rest === 1, "a sideways trackpad swipe back turns back");
    await B.ctx.close();
  }

  // --- desktop: filmed turns, the wheel at 30 frames a second ------------------------
  {
    const B = await open("/rules", { w: 1440, h: 900, dpr: 1 });
    await B.page.evaluate(() => book.settle(2));
    await B.page.waitForTimeout(3500);
    await B.freeze();
    await B.page.mouse.move(720, 450);
    const R = reel("desk-turn");
    for (let i = 0; i < 5; i++) { await B.step(); await B.shot(R.next()); }
    // a trackpad scroll: deltas swell and ease, as fingers do, with a pause part-way
    const deltas = [2, 4, 7, 10, 12, 13, 12, 10, 8, 6, 4, 2, 0, 0, 0, 0, 0, 1, 3, 6, 9, 12, 14, 14, 12, 9, 6, 3, 1];
    for (const d of deltas) { if (d) await B.page.mouse.wheel(0, d); await B.step(); await B.shot(R.next()); }
    for (let i = 0; i < 30; i++) { await B.step(); await B.shot(R.next()); }
    // one wheel notch back
    await B.page.mouse.wheel(0, -100);
    for (let i = 0; i < 28; i++) { await B.step(); await B.shot(R.next()); }
    await B.thaw();
    R.cut(720);
    console.log(`     desk-turn: ${R.count} frames`);
    await B.ctx.close();
  }

  // --- deep links, the address as you read, and reading as one page ---------------
  for (const [path, id, size] of [["/rules", "snipe", {}], ["/rules/advanced", "circle", {}], ["/rules", "snipe", { w: 1440, h: 900, dpr: 1 }], ["/rules/advanced", "circle", { w: 1440, h: 900, dpr: 1 }]]) {
    const B = await open(`${path}#${id}`, size);
    const tag = `${path} ${size.w ? "desktop" : "phone"}`;
    const shown = () => B.page.evaluate((id) => { const r = document.getElementById(id)?.getBoundingClientRect(); return !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight; }, id);
    const s = await B.book();
    check((await shown()) && s.hash === `#${id}`, `${tag}#${id} opens at its page (rest ${s.rest}, ${s.hash})`);
    await B.shot(`${out}/deeplink-${path.slice(1).replace("/", "-")}-${id}-${size.w ? "desk" : "phone"}.jpg`);
    await B.page.keyboard.press("ArrowRight");
    await B.page.waitForFunction((r) => book.rest !== r, s.rest);
    await B.settled();
    const after = await B.book();
    check(after.hash && after.hash !== `#${id}`, `${tag}: turning on moves the address (${s.hash} → ${after.hash})`);
    // read as one page, at the same place
    const href = await B.page.getAttribute(".tools .as-page", "href");
    check(href === `?read=all${after.hash}`, `${tag}: "read as one page" keeps your place (${href})`);
    await B.page.click(".tools .as-page");
    await B.page.waitForFunction(() => document.body.classList.contains("drawn"));
    await B.page.waitForTimeout(900);
    const flat = await B.page.evaluate((h) => {
      const r = document.getElementById(h.slice(1)).getBoundingClientRect();
      return { scroll: document.documentElement.classList.contains("scroll"), stage: !!document.querySelector(".stage"), sheets: document.querySelectorAll("main > .sheet").length, top: Math.round(r.top) };
    }, after.hash);
    check(flat.scroll && !flat.stage && flat.sheets > 1 && flat.top >= -2 && flat.top < 300, `${tag}: ?read=all is one long page, scrolled to ${after.hash} (${JSON.stringify(flat)})`);
    await B.ctx.close();
  }

  // --- reduced motion: pages change at once ------------------------------------------
  {
    const B = await open("/rules", { motion: "reduce" });
    await B.page.keyboard.press("ArrowRight");
    await B.frame();
    let s = await B.book();
    check(s.rest === 1 && s.pos === 1 && s.air === 0, `reduced motion: a key turns the page at once (pos ${s.pos}, ${s.air} in the air)`);
    await B.touchAt("touchStart", [[360, 600]]);
    for (let i = 1; i <= 6; i++) { await B.touchAt("touchMove", [[360 - 30 * i, 600]]); await B.frame(); }
    s = await B.book();
    check(s.air === 0, `reduced motion: a drag doesn't curl the page (${s.air} in the air)`);
    await B.touchAt("touchEnd", []);
    await B.frame();
    s = await B.book();
    check(s.rest === 2 && s.air === 0, `reduced motion: letting go turns it at once (rest ${s.rest})`);
    await B.page.locator(".turner .toc").click();
    await B.frame();
    await B.page.locator('.slip a[href="#send"]').click();
    await B.frame();
    s = await B.book();
    check(s.air === 0 && s.hash === "#send", `reduced motion: the contents jump without a flurry (${s.hash})`);
    const drawn = await B.page.evaluate(() => [...document.querySelectorAll("canvas[data-fig]")].every((c) => c.width > 0));
    check(drawn, "reduced motion: every drawing is drawn finished");
    await B.ctx.close();
  }

  // --- every page of both books, at both sizes: nothing cut off ---------------------
  for (const path of ["/rules", "/rules/advanced"]) {
    for (const size of [{}, { w: 1440, h: 900, dpr: 1 }]) {
      const B = await open(path, { ...size, motion: "reduce" });
      const r = await B.page.evaluate(() => {
        const bad = [];
        const pages = [...document.querySelectorAll(".side.pg:not(.ghost)")];
        pages.forEach((pg, i) => {
          const box = pg.getBoundingClientRect();
          for (const e of pg.querySelectorAll(".flow *")) {
            const q = e.getBoundingClientRect();
            if (!q.width || !q.height) continue;
            if (q.bottom > box.bottom + 0.5 || q.right > box.right + 2 || q.left < box.left - 30) bad.push(`p${i + 1} ${e.tagName}.${e.className} ${Math.round(q.bottom - box.bottom)}`);
            if (e.style.zoom) bad.push(`p${i + 1} squeezed ${e.tagName}`);
          }
        });
        // every section in the contents made it onto a page, once
        const ids = [...document.querySelectorAll('.slip a[href^="#"]')].map((a) => a.hash.slice(1));
        const missing = ids.filter((id) => document.querySelectorAll(`.side.pg:not(.ghost) #${CSS.escape(id)}`).length !== 1);
        return { bad, missing, pages: pages.length };
      });
      const tag = `${path} ${size.w ? "desktop" : "phone"}`;
      check(!r.bad.length, `${tag}: nothing cut off across ${r.pages} pages ${r.bad.slice(0, 3).join("; ")}`);
      check(!r.missing.length, `${tag}: every contents entry is on exactly one page ${r.missing.join(",")}`);
      await B.ctx.close();
    }
  }

  // --- timing a scrubbed turn under a CPU throttle -------------------------------------
  if (process.env.PERF !== "0") {
    const times = async (B, drive) => {
      await B.cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      await B.page.evaluate(() => { window.__ft = []; let last = 0; const f = (t) => { if (last) window.__ft.push(t - last); last = t; if (window.__ft.length < 100000) window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
      await drive();
      const ft = await B.page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__ft; });
      await B.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const sorted = [...ft].sort((a, b) => a - b), q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      return { frames: ft.length, p50: q(0.5).toFixed(1), p95: q(0.95).toFixed(1), max: sorted.at(-1).toFixed(1), over33: ft.filter((x) => x > 33.4).length };
    };
    {
      const B = await open("/rules");
      await B.page.evaluate(() => book.settle(3));
      await B.page.waitForTimeout(3000);
      const r = await times(B, async () => {
        await B.touchAt("touchStart", [[360, 640]]);
        for (let i = 1; i <= 50; i++) { await B.touchAt("touchMove", [[360 - 6.4 * i, 640]]); await B.page.waitForTimeout(16); }
        await B.touchAt("touchEnd", []);
        await B.page.waitForTimeout(900);
      });
      console.log(`     perf phone 390x844 dpr2, ${throttle}x CPU, finger-scrubbed turn: ${JSON.stringify(r)}`);
      await B.ctx.close();
    }
    {
      const B = await open("/rules", { w: 1440, h: 900, dpr: 1 });
      await B.page.evaluate(() => book.settle(3));
      await B.page.waitForTimeout(3000);
      await B.page.mouse.move(720, 450);
      const r = await times(B, async () => {
        for (let i = 0; i < 50; i++) { await B.page.mouse.wheel(0, 8); await B.page.waitForTimeout(16); }
        await B.page.waitForTimeout(900);
      });
      console.log(`     perf desktop 1440x900, ${throttle}x CPU, trackpad-scrubbed turn: ${JSON.stringify(r)}`);
      await B.ctx.close();
    }
  }

  check(!errors.length, `no page errors ${errors.slice(0, 3).join(" | ")}`);
  if (failures.length) throw new Error(`${failures.length} rulebook checks failed:\n  ${failures.join("\n  ")}`);
}

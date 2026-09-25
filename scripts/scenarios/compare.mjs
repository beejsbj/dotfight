// Same seeded late-game page in either build (baseline or Lamplight), then
// the camera kept moving: every frame re-renders. Measures main-thread
// script per frame (renderNow) and frame pacing. Works on both builds by
// driving the engine modules Vite serves.
export default async function (T) {
  const { page, cdp } = T;
  await page.waitForTimeout(1200);
  const info = await page.evaluate(async () => {
    const game = await import("/src/game.ts");
    const bot = await import("/src/bot.ts");
    const s = window.pft.s;
    // start from whatever blank game the build shows, fill it deterministically
    Object.assign(s, game.newGame(11, { no: 1, date: "25 Sep 2026" }));
    let k = 11;
    while (s.phase === "setup") { const spot = bot.botBase(s, (x, y) => !game.canPlaceBase(s, x, y), k++); game.placeBase(s, spot.x, spot.y); }
    while (s.phase === "play" && s.turn < 56) game.act(s, bot.botFlick(s, 1, k++));
    document.querySelector("#sheet").hidden = true;
    const cover = document.querySelector("#cover"); if (cover) cover.hidden = true;
    return { marks: s.marks.length, turn: s.turn };
  });
  console.log("page:", JSON.stringify(info));
  const rate = +(process.env.THROTTLE ?? 1);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const still = !!process.env.STILL;
  const off = (process.env.OFF ?? "").split(",").filter(Boolean);
  await page.evaluate((off) => { for (const k of off) if (window.pft.dbg) window.pft.dbg[k] = false; }, off);
  const r = await page.evaluate(async (still) => {
    const p = window.pft, cam = p.cam;
    const shown = document.querySelector("#stage") ?? document.querySelector("#page");
    const times = [];
    const t0 = performance.now();
    let n = 0;
    await new Promise((done) => {
      const step = () => {
        // move the camera a little, as a pan or a chase would
        const k = still ? 0 : Math.sin(n / 10) * 60;
        if (cam.tgt) { cam.cur.x = 500 + k; cam.tgt.x = cam.cur.x + (still ? 0 : 3); } else { cam.x = 500 + k; }
        const a = performance.now();
        p.renderNow();
        // read one pixel back: forces the frame to be rastered now, so the
        // number is the whole CPU cost of the frame, the same way in both builds
        shown.getContext("2d").getImageData(0, 0, 1, 1);
        times.push(performance.now() - a);
        if (++n < 60) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    times.sort((a, b) => a - b);
    return { p50: times[30], p95: times[57], wall: (performance.now() - t0) / 60 };
  }, still);
  console.log(`${process.env.THROTTLE ? `${process.env.THROTTLE}x throttle` : "no throttle"}, ${still ? "still camera" : "moving camera"}${off.length ? ` [off: ${off}]` : ""}: render+raster p50 ${r.p50.toFixed(1)}ms p95 ${r.p95.toFixed(1)}ms, wall per frame ${r.wall.toFixed(1)}ms`);
}

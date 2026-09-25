// A late-game page (hundreds of marks), CPU throttled, frame times for the
// moments that matter: standing over the page, sitting and aiming, and a
// flick with the camera chasing the ink.
// THROTTLE=6 node scripts/playtest.mjs perf <url>
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page, cdp } = T;
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    // bot v bot, stopped short of the end so it's still being played; sharp bots miss less, so let them go long
    const r = window.pft.fileWar(+(localStorage.getItem("perfSeed") ?? 11), 56);
    window.pft.resumeRecord(r);
    return { marks: window.pft.s.marks.length, strokes: window.pft.s.marks.filter((m) => m.t === "stroke").length, phase: window.pft.s.phase, turn: window.pft.s.turn };
  });
  console.log("page:", JSON.stringify(info));
  await idle(T);
  await page.waitForTimeout(800);
  const rate = +(process.env.THROTTLE ?? 1);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const measure = async (label, ms, during) => {
    await page.evaluate(() => { window.pft.frames(true); window.pft.stageStats.full = 0; window.pft.stageStats.cached = 0; });
    const job = during?.();
    await page.waitForTimeout(ms);
    await job;
    const r = await page.evaluate(() => ({ ...window.pft.frames(), ...window.pft.stageStats }));
    console.log(`${label.padEnd(22)} frame p50 ${r.p50.toFixed(1)} p95 ${r.p95.toFixed(1)} | script p50 ${r.script.p50.toFixed(2)} p95 ${r.script.p95.toFixed(2)} max ${r.script.max.toFixed(1)} | n ${r.n} full ${r.full} cached ${r.cached}`);
  };
  // standing: nudge a redraw every frame (as while the hint loop draws)
  await measure("warm-up", 800, async () => { await page.evaluate(() => window.pft.poke()); });
  await measure("standing (redraw)", 2500, async () => {
    const end = Date.now() + 2400;
    while (Date.now() < end) { await page.evaluate(() => window.pft.poke()); await page.waitForTimeout(16); }
  });
  // sit down behind a soldier, then hold a charged pull (wobble: every frame)
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await measure("sitting down (camera)", 1500);
  await T.touch("touchStart", [[195, 600]]);
  for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[195 + i, 600 + i * 14]]); await page.waitForTimeout(20); }
  await measure("aiming (held pull)", 2500);
  await T.shot(`${out}/perf-aim.png`);
  await T.touch("touchEnd", []);
  await measure("flick (chase + snags)", 2500);
  await page.waitForTimeout(500);
  await T.shot(`${out}/perf-after.png`);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
}

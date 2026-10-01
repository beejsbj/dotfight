// Frame cost while aiming: main-thread script time per frame (pft.frames) for
// leaning in, a held pull, and sweeping the thumb sideways (on feel/aim-turn the
// sheet turns under it). Same touches on either branch, so before/after compare.
//   THROTTLE=6 node scripts/playtest.mjs aim-frames <url> <outdir>     (TURNS)
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page, cdp } = T;
  page.setDefaultTimeout(120000);
  await page.waitForTimeout(1200);
  await page.evaluate((turns) => {
    const r = window.pft.fileWar(11, turns);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  }, +(process.env.TURNS ?? 8));
  await idle(T);
  await page.evaluate(() => { window.pft.slow = false; window.pft.boilOn = true; });
  await page.waitForTimeout(800);
  const rate = +(process.env.THROTTLE ?? 1);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const rows = [];
  const measure = async (label, ms, during) => {
    await page.evaluate(() => window.pft.frames(true));
    const job = during?.();
    await page.waitForTimeout(ms);
    await job;
    const r = await page.evaluate(() => window.pft.frames());
    rows.push(`${label.padEnd(26)} script p50 ${r.script.p50.toFixed(2)}ms p95 ${r.script.p95.toFixed(2)}ms max ${r.script.max.toFixed(1)}ms | frame p50 ${r.p50.toFixed(1)}ms | n ${r.script.n}`);
  };
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => window.pft.cam.toScreen(b.x, b.y).y - window.pft.cam.toScreen(a.x, a.y).y)[0]; });
  const a = await T.world(me.x, me.y);
  await measure("lean in", 1500, async () => { await T.tap(a.x, a.y, 40); });
  await page.waitForFunction(() => window.pft.selected !== undefined);
  await T.touch("touchStart", [[195, 520]]);
  for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[195, 520 + i * 14]]); await page.waitForTimeout(20); }
  await measure("held pull", 2000);
  await measure("sweep sideways", 2400, async () => {
    for (let j = 0; j < 40; j++) { await T.touch("touchMove", [[195 + Math.sin(j / 6) * 170, 632]]); await page.waitForTimeout(55); }
  });
  await T.touch("touchEnd", []);
  console.log(`throttle ${rate}x  turns ${process.env.TURNS ?? 8}`);
  console.log(rows.join("\n"));
}

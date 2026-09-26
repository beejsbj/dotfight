// A late-game page, CPU throttled (THROTTLE=6), timing the moments that
// matter: leaning in to aim, holding a pull, the flick with the camera
// pulling back, and (pass and play) the page turning. "script" is main-thread
// time per rendered frame, the budget a phone's CPU pays; "frame" is the
// interval between frames in this headless (GPU-less) Chrome.
// "idle" is a page with nothing moving: only the line boil ticking (8 fps).
// BOIL=on pins the boil on and stops the slow-device probe (headless Chrome
// has no GPU and always looks slow, which would switch the boil off);
// BOIL=off pins it off with the probe stopped too, for a like-for-like baseline.
// THROTTLE=6 node scripts/playtest.mjs perf <url>
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page, cdp } = T;
  await page.waitForTimeout(1200);
  const turns = +(process.env.TURNS ?? 70);
  const info = await page.evaluate((turns) => {
    const r = window.pft.fileWar(11, turns);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
    return { marks: window.pft.s.marks.length, phase: window.pft.s.phase, turn: window.pft.s.turn };
  }, turns);
  console.log("page:", JSON.stringify(info));
  await idle(T);
  await page.waitForTimeout(800);
  const pin = process.env.BOIL;
  if (pin) await page.evaluate((on) => { window.pft.slow = false; window.pft.boilOn = on; }, pin === "on");
  // a page just opened makes its boil sprites over the first second or so
  await page.waitForFunction(() => window.pft.boil?.settled !== false, undefined, { timeout: 10000 });
  await page.waitForTimeout(300);
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
  await measure("idle (boil only)", 2000);
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await measure("lean in (camera move)", 1200);
  await T.touch("touchStart", [[195, 600]]);
  for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[195 + i, 600 + i * 14]]); await page.waitForTimeout(20); }
  await measure("aiming (held pull)", 2000);
  await T.shot(`${out}/perf-aim.png`);
  await T.touch("touchEnd", []);
  await measure("flick + pull back", 1500);
  await measure("page turn (pnp)", 1800);
  await T.shot(`${out}/perf-after.png`);
  const slow = await page.evaluate(() => window.pft.slow);
  const boil = await page.evaluate(() => ({ on: window.pft.boilOn, ticks: window.pft.stageStats.boil, tooDear: window.pft.boil?.tooDear, living: window.pft.s.soldiers.filter((x) => x.alive).length }));
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(`throttle ${rate}x${slow ? " (slow-device mode kicked in)" : ""} | boil ${JSON.stringify(boil)}`);
  console.log(rows.join("\n"));
}

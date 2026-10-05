// What the boil's ticks cost on a mid-war page with the boil pinned on (past
// the slow-device check), idle at bird's-eye and leaning in: for before/after
// numbers on boil.ts changes. THROTTLE slows the CPU.
//   THROTTLE=6 node scripts/playtest.mjs boil-cost <url> /tmp/out
import { idle } from "../lib/phone.mjs";

export default async function (T) {
  const { page } = T;
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.pft.boilOn = true; const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T, 60000);
  await page.waitForFunction(() => window.pft.boil.settled, undefined, { timeout: 60000 });
  if (process.env.THROTTLE) await T.cdp.send("Emulation.setCPUThrottlingRate", { rate: +process.env.THROTTLE });
  const measure = (ms) => page.evaluate(async (ms) => {
    const B = window.pft.boil, t = [];
    const od = B.draw.bind(B);
    B.draw = (...a) => { const t0 = performance.now(); const r = od(...a); if (r) t.push(performance.now() - t0); return r; };
    await new Promise((ok) => setTimeout(ok, ms));
    B.draw = od;
    t.sort((a, b) => a - b);
    const q = (k) => t[Math.min(t.length - 1, Math.floor(t.length * k))] ?? 0;
    return `n ${t.length} | p50 ${q(0.5).toFixed(2)}ms p95 ${q(0.95).toFixed(2)}ms max ${(t[t.length - 1] ?? 0).toFixed(2)}ms`;
  }, ms);
  console.log("bird's-eye ", await measure(10000));
  await page.evaluate(() => { const s = window.pft.s; const b = s.bases[0]; window.pft.cam.sit(b, 2.6, 0, 0.5); window.pft.poke(); });
  await page.waitForTimeout(3000);
  console.log("leaning in ", await measure(10000));
}

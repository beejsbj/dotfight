// A pull begun low on the screen (as when the thumb lands on a man in a camp
// near the bottom of the page) still reaches full power before the screen's edge.
//   node scripts/playtest.mjs pull-room <url> <outdir>
import { idle } from "../lib/phone.mjs";

const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); };

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  const feel = await page.evaluate(async () => (await import("/src/rules.ts")).FEEL);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const r = window.pft.fileWar(7, 6); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  await page.evaluate(() => { window.pft.slow = false; });
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current)[0]; });
  const a = await T.world(me.x, me.y);
  for (let i = 0; i < 4; i++) {
    await T.tap(a.x, a.y, 40);
    if (await page.waitForFunction(() => window.pft.selected !== undefined, undefined, { timeout: 5000 }).then(() => true, () => false)) break;
  }
  await page.waitForFunction(() => window.pft.cam.settled);
  const H = await page.evaluate(() => window.innerHeight);
  const pullFrom = async (y0, to) => {
    await T.touch("touchStart", [[200, y0]]);
    await page.waitForTimeout(80);
    for (let i = 1; i <= 12; i++) { await T.touch("touchMove", [[200, y0 + ((to - y0) * i) / 12]]); await page.waitForTimeout(30); }
    await page.waitForTimeout(300);
    const p = await page.evaluate(() => window.pft.aim?.power);
    for (let i = 1; i <= 12; i++) { await T.touch("touchMove", [[200, to + ((y0 - to) * i) / 12]]); await page.waitForTimeout(20); }
    await T.touch("touchEnd", []);
    await page.waitForTimeout(400);
    return p;
  };
  const low = H - 150, edge = H - feel.pullEdgePx;
  const pLow = await pullFrom(low, edge);
  check(pLow === 1, `begun ${H - low}px from the bottom, pulled to the edge: full power`, `power ${pLow}`);
  await T.shot(`${out}/pull-room-low.png`);
  const high = 300;
  const pHigh = await pullFrom(high, high + 150);
  check(pHigh > 0.4 && pHigh < 0.7, "begun high, 150px is still part of the usual travel", `power ${pHigh}`);
  if (results.some((r) => !r)) process.exitCode = 1;
}

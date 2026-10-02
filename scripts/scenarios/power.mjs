// The power bar while aiming: pick a man up, pull a quarter, half and all the
// way, and shoot each, to see how plainly the pull reads.
//   node scripts/playtest.mjs power <url> <outdir>
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  const feel = await page.evaluate(async () => (await import("/src/rules.ts")).FEEL);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const r = window.pft.fileWar(7, 6); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  await page.evaluate(() => { window.pft.slow = false; });
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => Math.abs(a.y - 850) - Math.abs(b.y - 850))[0]; });
  const a = await T.world(me.x, me.y);
  for (let i = 0; i < 4; i++) {
    await T.tap(a.x, a.y, 40);
    if (await page.waitForFunction(() => window.pft.selected !== undefined, undefined, { timeout: 5000 }).then(() => true, () => false)) break;
  }
  await page.waitForFunction(() => window.pft.cam.settled);
  const x0 = 195, y0 = 300;
  await T.touch("touchStart", [[x0, y0]]);
  await page.waitForTimeout(80);
  let y = y0;
  for (const share of [0.25, 0.5, 1]) {
    const to = y0 + feel.maxPullPx * share;
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[x0, y + ((to - y) * i) / 10]]); await page.waitForTimeout(30); }
    y = to;
    await page.waitForTimeout(400);
    console.log(`pull ${share}: power ${JSON.stringify(await page.evaluate(() => window.pft.aim?.power))}`);
    await T.shot(`${out}/power-${Math.round(share * 100)}.png`);
  }
  await T.touch("touchMove", [[x0, y0]]);
  await T.touch("touchEnd", []);
}

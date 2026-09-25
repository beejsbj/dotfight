// Leaning in to aim on a mid-war page: are the far camps faint, hazy shapes?
export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const r = window.pft.fileWar(7, 18); window.pft.resumeRecord(r); });
  await page.waitForFunction(() => !window.pft.busy && window.pft.cam.settled, undefined, { timeout: 20000 });
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 5000 });
  await T.touch("touchStart", [[195, 600]]);
  for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[197, 600 + i * 14]]); await page.waitForTimeout(20); }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/fog.jpg`, type: "jpeg", quality: 85 });
  await T.touch("touchEnd", []);
}

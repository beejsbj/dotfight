// Layout at the current viewport (W, H env): title, a game in play, sitting down.
export default async function (T, out) {
  const { page } = T;
  const tag = `${process.env.W ?? 390}x${process.env.H ?? 844}`;
  await page.waitForTimeout(1300);
  await T.shot(`${out}/s-${tag}-title.png`);
  await page.evaluate(() => { const r = window.pft.fileWar(5, 30); window.pft.resumeRecord(r); });
  await page.waitForTimeout(1200);
  await T.shot(`${out}/s-${tag}-play.png`);
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForTimeout(1500);
  await T.shot(`${out}/s-${tag}-sit.png`);
}

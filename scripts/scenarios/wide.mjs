// A desktop-shaped window (W, H env): does the desk fill it?
export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1300);
  await page.evaluate(() => { const r = window.pft.fileWar(23, 34); window.pft.resumeRecord(r); });
  await page.waitForTimeout(1500);
  await T.shot(`${out}/w-play.png`);
  console.log(JSON.stringify(await page.evaluate(() => {
    const st = window.pft.stage;
    return { css: [st.style.left, st.style.top, st.style.width, st.style.height], px: [st.width, st.height], view: window.pft.frame().view, fitZ: window.pft.cam.fitZ };
  })));
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForTimeout(1500);
  await T.shot(`${out}/w-sit.png`);
}

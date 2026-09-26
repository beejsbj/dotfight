// The drawer and the time-lapse, on a seeded bot-v-bot war, through the real buttons.
export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.pft.fileWar(7));
  await page.evaluate(() => window.pft.showTitle());
  await page.waitForTimeout(600);
  await page.click("[data-a=drawer]");
  await page.waitForTimeout(600);
  await T.shot(`${out}/r0-drawer.png`);
  await page.click(".pages .page");
  await page.waitForTimeout(800);
  await T.shot(`${out}/r0-view.png`);
  await page.evaluate(() => { window.pft.speed = 3; window.pft.frames(true); });
  await page.click("[data-v=replay]");
  for (const ms of [1500, 1500, 2500, 4000]) {
    await page.waitForTimeout(ms);
    const st = await page.evaluate(() => ({ T: Math.round(window.pft.T), marks: window.pft.s.marks.length, bases: window.pft.s.bases.length, screen: window.pft.screen, tag: document.querySelector('.tag[data-p="1"] .count').textContent, frames: window.pft.frames(true) }));
    console.log(JSON.stringify(st));
    await T.shot(`${out}/r1-replay-${st.T}.png`);
  }
}

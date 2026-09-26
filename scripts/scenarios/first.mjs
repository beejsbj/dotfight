import { idle, placeAt } from "../lib/phone.mjs";
export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()));
  try {
    await page.waitForTimeout(1400);
    await T.shot(`${out}/01-title.png`);
    await page.getByText("play Dawood-bot").click();
    await page.waitForTimeout(900);
    await T.shot(`${out}/02-setup.png`);
    await log("setup");
    const spots = [[300, 1300], [700, 1450], [520, 1050]];
    for (const [x, y] of spots) {
      await idle(T);
      await log("placing");
      await placeAt(T, x, y);
      await page.waitForTimeout(300);
    }
    await idle(T);
    await page.waitForTimeout(400);
    await T.shot(`${out}/03-bases.png`);
    await log("bases");
    const me = await page.evaluate(() => window.pft.s.soldiers.find((x) => x.owner === 0 && x.alive));
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 40);
    await page.waitForTimeout(1200);
    await T.shot(`${out}/04-sit.png`);
    await T.touch("touchStart", [[195, 640]]);
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[195 + i * 2, 640 + i * 11]]); await page.waitForTimeout(25); }
    await page.waitForTimeout(500);
    await T.shot(`${out}/05-aim.png`);
    await page.evaluate(() => { window.pft.speed = 0.15; });
    await T.touch("touchEnd", []);
    await page.waitForTimeout(400);
    await T.shot(`${out}/06-flick.png`);
    await page.waitForTimeout(900);
    await T.shot(`${out}/07-flick2.png`);
    await page.evaluate(() => { window.pft.speed = 1; });
    await page.waitForTimeout(2500);
    await T.shot(`${out}/08-after.png`);
    await log("after");
  } catch (e) {
    await log("FAILED " + e.message.split("\n")[0]);
    await T.shot(`${out}/99-fail.png`);
  }
}

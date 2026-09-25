// A first-time player against the bot: the pencil notes, the bot's own
// turn, and the cards. Run with TAUGHT=0.
import { idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()));
  try {
    await page.waitForTimeout(1300);
    await page.click("[data-a=how]");
    await page.waitForTimeout(500);
    await T.shot(`${out}/t0-how.png`);
    await page.click(".card .act");
    await page.click("[data-a=settings]");
    await page.waitForTimeout(500);
    await T.shot(`${out}/t0-settings.png`);
    await page.click(".card [data-a=back]");
    await page.getByText("play Dawood-bot").click();
    await page.waitForTimeout(2200);
    await T.shot(`${out}/t1-place-note.png`);
    // a ghost camp held where it can't go, then where it can
    const bad = await T.world(500, 400);
    await T.touch("touchStart", [[bad.x, bad.y + 80]]);
    await page.waitForTimeout(400);
    for (const [x, y] of [[300, 1300]]) {
      const p = await T.world(x, y);
      for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[bad.x + (p.x - bad.x) * i / 8, bad.y + 80 + (p.y - bad.y) * i / 8]]); await page.waitForTimeout(20); }
    }
    await page.waitForTimeout(300);
    await T.shot(`${out}/t2-ghost.png`);
    await T.touch("touchEnd", []);
    await page.waitForTimeout(300);
    await T.shot(`${out}/t2b-drawing.png`);
    for (const [x, y] of [[700, 1450], [520, 1050]]) { await idle(T); await placeAt(T, x, y); }
    await idle(T);
    await page.waitForTimeout(800);
    await T.shot(`${out}/t3-hint.png`);
    const me = await page.evaluate(() => window.pft.s.soldiers.find((x) => x.owner === 0 && x.alive));
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 40);
    await page.waitForTimeout(2200);
    await T.shot(`${out}/t4-aim-note.png`);
    await T.drag(195, 600, 200, 740, { hold: 60, ms: 250 });
    // the bot's turn: its pen, leaning at us
    await page.waitForFunction(() => window.pft.botAim || (window.pft.s.current === 1 && window.pft.selected !== undefined && !window.pft.res), undefined, { timeout: 20000, polling: 30 });
    await page.waitForTimeout(1300);
    await T.shot(`${out}/t5-bot-aim.png`);
    await page.evaluate(() => { window.pft.speed = 0.2; });
    await page.waitForFunction(() => window.pft.res, undefined, { timeout: 20000, polling: 30 });
    await page.waitForTimeout(250);
    await T.shot(`${out}/t6-bot-ink.png`);
    await page.evaluate(() => { window.pft.speed = 1; });
    await idle(T);
    await T.shot(`${out}/t7-after-bot.png`);
    await log("done");
  } catch (e) {
    await log("FAILED " + e.message.split("\n")[0]);
    await T.shot(`${out}/99-fail.png`);
  }
}

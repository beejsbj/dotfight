// A whole pass-and-play war: real touches for the first turns (with the page
// turning between players), then scripted flicks to the end: dawn, the
// signature, the end card, the drawer and the replay.
import { flickAt, idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()));
  try {
    await page.waitForTimeout(1200);
    await page.getByText("pass & play").click();
    await page.waitForTimeout(700);
    // blue near the bottom, red near the top (as each sees it: the page turns)
    const spots = [[300, 1350], [650, 350], [720, 1450], [300, 250], [520, 1100], [480, 560]];
    for (let i = 0; i < spots.length; i++) {
      await idle(T);
      const [x, y] = spots[i];
      await placeAt(T, x, y);
      if (i === 1) { await page.waitForTimeout(1200); await T.shot(`${out}/p1-turning.png`); }
    }
    await idle(T);
    await page.waitForTimeout(500);
    await T.shot(`${out}/p2-ready.png`);
    await log("play");
    // four real-touch turns
    for (let t = 0; t < 4; t++) {
      await idle(T);
      const { me, foe } = await page.evaluate(() => {
        const s = window.pft.s;
        const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
        const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
        const me = mine[Math.floor(mine.length / 2)];
        foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
        return { me, foe: foes[0] };
      });
      await flickAt(T, me.id, foe.x, foe.y, t === 2 ? 70 : 115, { kind: t === 2 ? "move" : "shoot", shot: t === 1 ? `${out}/p3b-red-aim.png` : t === 2 ? `${out}/p3c-move-aim.png` : undefined });
      await page.waitForTimeout(250);
      if (t === 0) await T.shot(`${out}/p3-ink.png`);
      await idle(T);
      if (t === 1) { await page.waitForTimeout(300); await T.shot(`${out}/p4-red-side.png`); }
    }
    await log("touch turns done");
    // fast-forward: aimed flicks through the engine's own flow
    await page.evaluate(() => { window.pft.speed = 4; });
    for (let t = 0; t < 200; t++) {
      const st = await T.state();
      if (st.phase === "over") break;
      await idle(T, 60000);
      if ((await T.state()).phase === "over") break;
      await page.evaluate(() => {
        const s = window.pft.s;
        const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
        const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
        const me = mine[(s.turn * 7) % mine.length], foe = foes[(s.turn * 3) % foes.length];
        const ang = Math.atan2(foe.y - me.y, foe.x - me.x) + (Math.random() - 0.5) * 0.06;
        window.pft.act({ soldierId: me.id, kind: "shoot", angle: ang, length: 1800, bend: (Math.random() - 0.5) * 0.06 });
      });
      await page.waitForTimeout(100);
    }
    await log("over?");
    await page.evaluate(() => { window.pft.speed = 1; });
    await page.waitForTimeout(1800);
    await T.shot(`${out}/p5-dawn.png`);
    await page.waitForSelector("#sheet:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(600);
    await T.shot(`${out}/p6-over.png`);
    await page.click("[data-a=look]");
    await page.waitForTimeout(600);
    await T.shot(`${out}/p7-page.png`);
    // the drawer
    await page.click("#menu-btn");
    await page.waitForTimeout(900);
    await T.shot(`${out}/p8-title-after.png`);
    await page.click("[data-a=drawer]");
    await page.waitForTimeout(700);
    await T.shot(`${out}/p9-drawer.png`);
    await page.click(".pages .page");
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.pft.speed = 3; });
    await page.click("[data-v=replay]");
    await page.waitForTimeout(2500);
    await T.shot(`${out}/pa-replay.png`);
    await log("replaying");
  } catch (e) {
    await log("FAILED " + e.message.split("\n")[0]);
    await T.shot(`${out}/99-fail.png`);
  }
}

// The real-time prototype against Dawood-bot: "v Dawood-bot" on the cover,
// the bot draws its camps and arranges on its own as ever, then at the table
// it flicks on a cadence whenever its pen can, while blue flicks by touch.
import { idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()), await page.evaluate(() => ({ table: window.pft.table.active, clock: Math.round(window.pft.table.clock) })));
  await page.waitForTimeout(1200);
  await page.click("[data-size=quick]");
  await page.evaluate(() => document.querySelector("[data-a=tablebot]").click());
  await page.waitForTimeout(900);
  for (const [x, y] of [[300, 1400], [650, 1500], [500, 1150]]) { await idle(T, 60000); await placeAt(T, x, y); }
  await idle(T, 60000);
  await page.click("[data-act=ready]");
  await T.wait(() => window.pft.table.active, undefined, 60000);
  await log("play");
  await T.shot(`${out}/b1-table.png`);
  // blue flicks once by touch; the bot gets eight seconds of clock
  const b = await page.evaluate(() => {
    const s = window.pft.s;
    const me = s.soldiers.find((x) => x.alive && x.owner === 0), foe = s.soldiers.find((x) => x.alive && x.owner === 1);
    const a = window.pft.cam.toScreen(me.x, me.y), t = window.pft.cam.toScreen(foe.x, foe.y);
    return { at: a, aim: Math.atan2(t.y - a.y, t.x - a.x) };
  });
  await T.drag(b.at.x, b.at.y, b.at.x - Math.cos(b.aim) * 120, b.at.y - Math.sin(b.aim) * 120, { hold: 60, ms: 200 });
  for (let k = 0; k < 8; k++) {
    await page.waitForTimeout(1000);
    const red = await page.evaluate(() => window.pft.table.sides[1]);
    if (red.sel !== undefined) { await T.shot(`${out}/b2-bot-aims.png`); break; }
  }
  await page.waitForTimeout(6000);
  await T.shot(`${out}/b3-later.png`);
  const flicks = await page.evaluate(() => window.pft.s.actions.filter((a) => a.t === "flick").map((a) => ({ who: window.pft.s.soldiers[a.soldier].owner, kind: a.kind, ms: Math.round(a.ms) })));
  console.log("flicks:", JSON.stringify(flicks));
  if (!flicks.some((f) => f.who === 1)) throw new Error("Dawood-bot never flicked at the table");
  if (!flicks.some((f) => f.who === 0)) throw new Error("blue's touch flick didn't land");
  await log("bot flicked");
}

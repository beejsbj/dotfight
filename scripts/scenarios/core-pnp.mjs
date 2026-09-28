// A Classic (5 x 10) pass-and-play war on the core rules: camps drawn by
// touch for both sides (the page turning between them), both sides arrange
// and press done, a few real-touch flicks, then both seats play the bot's
// choices to the end.
import { flickAt, idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()), await page.evaluate(() => document.querySelector("#status").textContent));
  await page.waitForTimeout(1200);
  // THEME=<id>: play it on that paper
  if (process.env.THEME) { await page.evaluate((id) => { window.pft.theme.choose(id); window.pft.showTitle(); }, process.env.THEME); await page.waitForTimeout(800); }
  await page.click("[data-size=classic]");
  await page.evaluate(() => document.querySelector("[data-a=pnp]").click());
  await page.waitForTimeout(900);
  const blue = [[250, 1350], [520, 1150], [780, 1400], [300, 1580], [700, 1170]];
  const red = [[250, 350], [520, 550], [780, 300], [300, 130], [700, 530]];
  for (let i = 0; i < 5; i++) {
    for (const [x, y] of [blue[i], red[i]]) { await idle(T); await placeAt(T, x, y); }
    if (i === 0) { await page.waitForTimeout(700); await T.shot(`${out}/p1-turning.png`); }
  }
  await idle(T, 60000);
  await T.shot(`${out}/p2-blue-arranges.png`);
  await page.click("[data-act=ready]");
  await idle(T, 60000);
  await page.waitForTimeout(300);
  await T.shot(`${out}/p3-red-arranges.png`);
  await page.click("[data-act=ready]");
  await idle(T, 60000);
  await log("play");
  const target = async () => page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    let best = null, bd = Infinity;
    for (const m of mine) for (const f of foes) { const d = Math.hypot(m.x - f.x, m.y - f.y); if (d < bd) { bd = d; best = { me: m, foe: f, d }; } }
    return best;
  });
  for (let k = 0; k < 3; k++) {
    await idle(T, 60000);
    const t = await target();
    await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: k === 1 ? "lunge" : "snipe", shot: `${out}/p4-aim-${k}.png` });
    await page.waitForTimeout(600);
    await T.shot(`${out}/p5-ink-${k}.png`);
    await idle(T, 60000);
    if (await page.$("[data-act=stop]")) { await T.shot(`${out}/p6-lunge-again.png`); await page.click("[data-act=stop]"); await idle(T, 60000); }
  }
  await log("touch turns done");
  await page.evaluate(() => { window.pft.speed = 5; });
  let stood = false;
  for (let k = 0; k < 800; k++) {
    const st = await T.state();
    if (st.phase === "over") break;
    await idle(T, 90000);
    if ((await T.state()).phase === "over") break;
    const info = await page.evaluate(() => window.pft.s.stand);
    if (!stood && (info[0] || info[1])) { stood = true; await page.evaluate(() => { window.pft.speed = 1; }); await page.waitForTimeout(200); await T.shot(`${out}/p7-last-stand.png`); await page.evaluate(() => { window.pft.speed = 5; }); }
    await page.evaluate(() => window.pft.act(window.pft.botMove(1)));
    await page.waitForTimeout(60);
  }
  await log("over?");
  await page.evaluate(() => { window.pft.speed = 1; });
  await page.waitForSelector("#sheet:not([hidden])", { timeout: 60000 });
  await page.waitForTimeout(600);
  await T.shot(`${out}/p8-over.png`);
  await page.click("[data-a=look]");
  await page.waitForTimeout(600);
  await T.shot(`${out}/p9-page.png`);
}

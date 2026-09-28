// A Quick battle against Dawood-bot on the core rules, by real touch where it
// matters: camps drawn, a soldier arranged outside his wall, a snipe, a send
// drawn camp to camp, a lunge; then the rest played out (the human seat by
// the bot's own choices) to dawn, the drawer and the replay.
import { flickAt, idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()), await page.evaluate(() => document.querySelector("#status").textContent));
  const size = process.env.SIZE ?? "quick";
  await page.waitForTimeout(1200);
  await page.click(`[data-size=${size}]`);
  await page.waitForTimeout(200);
  await T.shot(`${out}/b0-cover.png`);
  await page.getByText("play Dawood-bot").click();
  await page.waitForTimeout(900);
  const n = await page.evaluate(() => window.pft.s.size.bases);
  const spots = [[260, 1350], [720, 1450], [520, 1150], [260, 1580], [760, 1180]].slice(0, n);
  for (const [x, y] of spots) { await idle(T); await placeAt(T, x, y); }
  await idle(T, 60000);
  await page.waitForTimeout(400);
  await T.shot(`${out}/b1-position.png`);
  await log("positioning");
  // arrange: drag one soldier just outside his wall, toward the enemy
  const pick = await page.evaluate(() => {
    const s = window.pft.s;
    const b = s.bases.find((b) => b.owner === 0);
    const x = s.soldiers.filter((x) => x.home === b.id).sort((p, q) => p.y - q.y)[0];
    return { x, b };
  });
  const a = await T.world(pick.x.x, pick.x.y);
  const to = await T.world(pick.b.x, pick.b.y - pick.b.r - 12);
  // the soldier rides 46px above the finger
  await T.drag(a.x, a.y + 2, to.x, to.y + 46, { steps: 14, ms: 500, release: false });
  await page.waitForTimeout(250);
  await T.shot(`${out}/b2-arranging.png`);
  await T.touch("touchEnd", []);
  await page.waitForTimeout(400);
  await log("arranged one");
  await page.click("[data-act=ready]");
  await idle(T, 60000);
  await page.waitForTimeout(500);
  await T.shot(`${out}/b3-first-turn.png`);
  await log("play");
  // a snipe at the nearest enemy
  const target = async () => page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    let best = null, bd = Infinity;
    for (const m of mine) for (const f of foes) { const d = Math.hypot(m.x - f.x, m.y - f.y); if (d < bd) { bd = d; best = { me: m, foe: f, d }; } }
    return best;
  });
  let t = await target();
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 60 + Math.min(80, t.d / 12), { kind: "snipe", shot: `${out}/b4-snipe-aim.png` });
  await page.waitForTimeout(500);
  await T.shot(`${out}/b5-snipe-ink.png`);
  await idle(T, 60000);
  await log("after snipe + bot");
  await T.shot(`${out}/b6-bot-went.png`);
  // a send, drawn camp to camp
  const bases = await page.evaluate(() => window.pft.s.bases.filter((b) => b.owner === 0));
  if (await page.$("[data-act=send]")) {
    await page.click("[data-act=send]");
    await page.waitForTimeout(700);
    const p0 = await T.world(bases[0].x, bases[0].y), p1 = await T.world(bases[1].x, bases[1].y);
    await T.drag(p0.x, p0.y, p1.x, p1.y, { steps: 16, ms: 600, release: false });
    await page.waitForTimeout(200);
    await T.shot(`${out}/b7-send-drag.png`);
    await T.touch("touchEnd", []);
    await page.waitForTimeout(300);
    await T.shot(`${out}/b8-send-count.png`);
    await page.click("[data-act=n][data-n='3']").catch(() => page.click("[data-act=n]"));
    await page.waitForTimeout(500);
    await T.shot(`${out}/b9-sent.png`);
    await log("sent");
  }
  // then a lunge
  await idle(T, 60000);
  t = await target();
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 40, { kind: "lunge", shot: `${out}/b10-lunge-aim.png` });
  await page.waitForTimeout(700);
  await T.shot(`${out}/b11-lunge.png`);
  // catch the walk-out time-lapse
  await page.waitForFunction(() => window.pft.lapse, undefined, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(450);
  await T.shot(`${out}/b12-convoy-walking.png`);
  await idle(T, 60000);
  await T.shot(`${out}/b13-convoy-on-road.png`);
  await log("after lunge");
  // the rest: the human seat plays the bot's choices, fast
  await page.evaluate(() => { window.pft.speed = 5; });
  let shots = 0;
  for (let k = 0; k < 400; k++) {
    const st = await T.state();
    if (st.phase === "over" || st.screen !== "game") break;
    await idle(T, 90000);
    const s2 = await T.state();
    if (s2.phase === "over") break;
    if (s2.current !== 0) continue;
    const info = await page.evaluate(() => ({ left: window.pft.s.left, stand: window.pft.s.stand, chain: !!window.pft.s.chain }));
    if ((info.stand[0] || info.stand[1]) && shots < 1) { shots++; await page.evaluate(() => { window.pft.speed = 1; }); await page.waitForTimeout(300); await T.shot(`${out}/b14-last-stand.png`); await page.evaluate(() => { window.pft.speed = 5; }); }
    await page.evaluate(() => window.pft.act(window.pft.botMove(1)));
    await page.waitForTimeout(80);
  }
  await log("over?");
  await page.evaluate(() => { window.pft.speed = 1; });
  await page.waitForSelector("#sheet:not([hidden])", { timeout: 60000 });
  await page.waitForTimeout(600);
  await T.shot(`${out}/b15-over.png`);
  await page.click("[data-a=look]");
  await page.waitForTimeout(600);
  await T.shot(`${out}/b16-page.png`);
  await page.click("#menu-btn");
  await page.waitForTimeout(900);
  await page.click("[data-a=drawer]");
  await page.waitForTimeout(700);
  await T.shot(`${out}/b17-drawer.png`);
  await page.click(".pages .page");
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.pft.speed = 4; });
  await page.click("[data-v=replay]");
  await page.waitForTimeout(5000);
  await T.shot(`${out}/b18-replay.png`);
  await page.waitForFunction(() => window.pft.screen === "view", undefined, { timeout: 120000 });
  await page.waitForTimeout(800);
  await T.shot(`${out}/b19-replayed.png`);
}

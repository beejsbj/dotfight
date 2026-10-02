// A long war against Dawood-bot, by real touch where it matters: the long
// war picked on the cover, six bases dragged up from the shape cards in
// three shapes, a snipe from inside our prism (it splits), then the rest played out
// (the human seat by the bot's own choices) to dawn.
import { flickAt, idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()), await page.evaluate(() => document.querySelector("#status").textContent));
  await page.waitForTimeout(1200);
  await page.click("[data-size=long]");
  await page.waitForTimeout(200);
  await T.shot(`${out}/l0-cover.png`);
  await page.getByText("play Dawood-bot").click();
  await page.waitForTimeout(900);
  const kit = ["prism", "camp", "cushion", "camp", "cushion", "camp"];
  const spots = [[500, 1250], [230, 1250], [780, 1250], [250, 1480], [760, 1490], [500, 1500]];
  for (const [k, [x, y]] of kit.map((sh, i) => [i, spots[i]])) {
    await idle(T);
    // press the card and drag a copy of it up onto the page (it rides 80 px above the finger)
    const card = await page.evaluate((sh) => { const r = document.querySelector(`#kind [data-shape=${sh}]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, kit[k]);
    const p = await T.world(x, y);
    await T.drag(card.x, card.y, p.x, p.y + 80, { steps: 16, ms: 420, release: false });
    await page.waitForTimeout(250);
    if (k === 0) await T.shot(`${out}/l1-drag-prism.png`);
    await T.touch("touchEnd", []);
  }
  await idle(T, 90000);
  await page.waitForTimeout(400);
  await T.shot(`${out}/l2-position.png`);
  await log("positioning");
  await page.click("[data-act=ready]");
  await idle(T, 90000);
  await page.waitForTimeout(500);
  await T.shot(`${out}/l3-first-turn.png`);
  await log("play");
  // a snipe from inside our prism, straight up the page at them: it splits as it leaves
  const me = await page.evaluate(() => {
    const s = window.pft.s;
    const prism = s.bases.find((b) => b.owner === 0 && b.shape === "prism");
    return s.soldiers.filter((x) => x.alive && x.owner === 0 && x.home === prism.id).sort((p, q) => p.y - q.y)[0];
  });
  await flickAt(T, me.id, me.x, me.y - 700, 150, { kind: "snipe", shot: `${out}/l4-prism-aim.png` });
  await page.waitForTimeout(700);
  await T.shot(`${out}/l5-split-ink.png`);
  await idle(T, 90000);
  await log("after the split + bot");
  await T.shot(`${out}/l6-bot-went.png`);
  // the rest: the human seat plays the bot's choices, fast
  await page.evaluate(() => { window.pft.speed = 5; });
  let mid = false;
  for (let k = 0; k < 600; k++) {
    const st = await T.state();
    if (st.phase === "over" || st.screen !== "game") break;
    await idle(T, 120000);
    const s2 = await T.state();
    if (s2.phase === "over") break;
    if (!mid && s2.turn >= 16) { mid = true; await page.evaluate(() => { window.pft.speed = 1; }); await page.waitForTimeout(300); await T.shot(`${out}/l7-midgame.png`); await page.evaluate(() => { window.pft.speed = 5; }); }
    if (s2.current !== 0) continue;
    await page.evaluate(() => window.pft.act(window.pft.botMove(1)));
    await page.waitForTimeout(80);
  }
  await log("over?");
  await page.evaluate(() => { window.pft.speed = 1; });
  await page.waitForSelector("#sheet:not([hidden])", { timeout: 90000 });
  await page.waitForTimeout(600);
  await T.shot(`${out}/l8-over.png`);
  await page.click("[data-a=look]");
  await page.waitForTimeout(600);
  await T.shot(`${out}/l9-page.png`);
}

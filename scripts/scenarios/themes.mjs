// Every theme: the cover, a mid-war page from above, leaning in on a soldier,
// and a held pull. DPR=2 node scripts/playtest.mjs themes <url> docs/shots/themes
// ONLY=legal,graph to do a few.
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const ids = process.env.ONLY ? process.env.ONLY.split(",") : await page.evaluate(() => window.pft.theme.list);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  for (const id of ids) {
    await page.evaluate((id) => { localStorage.setItem("pft:theme", id); localStorage.removeItem("pft:save"); }, id);
    await page.reload();
    await page.waitForFunction(() => window.pft);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    // the light has to be all the way on (a slow machine takes many frames to get there)
    await T.wait(() => window.pft.frame().lamp.on > 0.99, undefined, 120000);
    await page.waitForTimeout(500);
    const cur = await page.evaluate(() => window.pft.theme.current);
    if (cur !== id) throw new Error(`asked for ${id}, got ${cur}`);
    await shot(`${id}-1-cover`);
    // a war some way in, on this paper
    await page.evaluate(() => {
      // a Classic war some turns in, still going
      const r = window.pft.fileWar(11, 8, "classic");
      r.mode = { kind: "pnp" };
      window.pft.resumeRecord(r);
    });
    await idle(T, 180000);
    await page.waitForTimeout(900);
    await shot(`${id}-2-war`);
    const st = await page.evaluate(() => ({ phase: window.pft.s.phase, turn: window.pft.s.turn, screen: window.pft.screen }));
    if (st.phase !== "play" || st.screen !== "game") throw new Error(`${id}: expected a war in play, got ${JSON.stringify(st)}`);
    const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current && x.convoy === undefined); });
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 40);
    await T.wait(() => window.pft.cam.settled, undefined, 60000);
    await page.waitForTimeout(500);
    await shot(`${id}-3-lean`);
    await T.touch("touchStart", [[195, 600]]);
    for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[195 + i * 3, 600 + i * 13]]); await page.waitForTimeout(25); }
    await page.waitForTimeout(400);
    await shot(`${id}-4-aim`);
    await T.touch("touchEnd", []);
    await page.waitForTimeout(250);
    await shot(`${id}-5-ink`);
    await idle(T, 180000);
    console.log(id, "ok");
  }
}

// The PR tour: curated moments as compact JPEGs. Run at DPR=2.
import { idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 30 });
  const log = async (m) => console.log(m, JSON.stringify(await T.state()));
  try {
    // 1. the cover, lamp just on
    await page.waitForTimeout(1500);
    await shot("01-cover");

    // 2. setup against the bot: a held camp, the keep-out rings round the enemy's
    await page.getByText("play Dawood-bot").click();
    await page.waitForTimeout(1000); // the cover swings open
    await idle(T);
    await placeAt(T, 280, 1350);
    await idle(T);
    const g = await T.world(500, 700), h = await T.world(640, 1400);
    await T.touch("touchStart", [[g.x, g.y + 80]]);
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[g.x + (h.x - g.x) * i / 20, g.y + 80 + (h.y - g.y) * i / 20]]); await page.waitForTimeout(20); }
    await page.waitForTimeout(300);
    await shot("02-setup-keep-out");
    await T.touch("touchEnd", []);

    // 3-6. a war in progress: overview, sitting down, aiming, the ink in flight
    await page.evaluate(() => { const r = window.pft.fileWar(7, 18); window.pft.resumeRecord(r); });
    await idle(T);
    await page.waitForTimeout(700);
    await shot("03-overview");
    const pair = await page.evaluate(() => {
      const s = window.pft.s;
      const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
      const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
      let best = null, bd = Infinity;
      for (const a of mine) for (const f of foes) { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d > 350 && d < bd) { bd = d; best = { me: a, foe: f }; } }
      return best;
    });
    const a = await T.world(pair.me.x, pair.me.y);
    await T.tap(a.x, a.y, 40);
    await until(() => window.pft.cam.settled);
    await page.waitForTimeout(300);
    await shot("04-leaning-in");
    const b = await T.world(pair.me.x, pair.me.y), t = await T.world(pair.foe.x, pair.foe.y);
    const ang = Math.atan2(t.y - b.y, t.x - b.x);
    await T.touch("touchStart", [[195, 560]]);
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[195 - Math.cos(ang) * 12 * i, 560 - Math.sin(ang) * 12 * i]]); await page.waitForTimeout(25); }
    await page.waitForTimeout(900);
    await shot("05-aiming");
    await page.evaluate(() => { window.pft.speed = 0.12; });
    await T.touch("touchEnd", []);
    await page.waitForTimeout(700);
    await shot("06-release-pull-back");
    await page.evaluate(() => { window.pft.speed = 1; });
    await idle(T, 60000);

    // 7. the snag: a shot straight through an enemy camp, caught as the cross lands
    await page.evaluate(() => { const r = window.pft.fileWar(7, 18); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
    await idle(T);
    await page.evaluate(() => {
      const s = window.pft.s;
      const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
      const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
      let best = null, bd = Infinity;
      for (const a of mine) for (const f of foes) { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d > 400 && d < bd) { bd = d; best = { a, f }; } }
      window.pft.speed = 0.25;
      window.pft.act({ soldierId: best.a.id, kind: "shoot", angle: Math.atan2(best.f.y - best.a.y, best.f.x - best.a.x), length: 1800, bend: 0 });
    });
    await until(() => window.pft.res && window.pft.res.kills.some((k) => k.hit));
    await page.waitForTimeout(120);
    await shot("07-snag-cross-lands");

    // 8. pass and play: the sheet turning round to face the other side
    // (headless Chrome has no GPU, so it trips slow-device mode; a phone that keeps up gets the spin)
    await page.evaluate(() => { window.pft.speed = 1; window.pft.slow = false; });
    await until(() => !window.pft.res);
    await page.evaluate(() => { window.pft.speed = 0.3; });
    await page.waitForTimeout(260);
    await shot("08-page-turning");
    await page.evaluate(() => { window.pft.speed = 1; });
    await idle(T);
    const red = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
    const ra = await T.world(red.x, red.y);
    await T.tap(ra.x, ra.y, 40);
    await until(() => window.pft.cam.settled);
    await T.touch("touchStart", [[195, 560]]);
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[197, 560 + 12 * i]]); await page.waitForTimeout(25); }
    await page.waitForTimeout(700);
    await shot("09-late-war-guide-through-barrel");
    await T.touch("touchEnd", []);
    await idle(T, 60000);

    // 10. the bot's turn: its pen tipped at you
    await page.evaluate(() => { const r = window.pft.fileWar(5, 12); window.pft.resumeRecord(r); });
    await idle(T);
    const me2 = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
    const m2 = await T.world(me2.x, me2.y);
    await T.tap(m2.x, m2.y, 40);
    await until(() => window.pft.cam.settled);
    await T.drag(195, 600, 205, 740, { hold: 60, ms: 250 });
    await until(() => window.pft.s.current === 1 && window.pft.selected !== undefined && !window.pft.res);
    await page.waitForTimeout(1500);
    await shot("10-dawood-bot-lining-up");
    await idle(T, 60000);

    // 11-13. a finished war: dawn through the window, the signature, the card
    await page.evaluate(() => { const r = window.pft.fileWar(3, 400); window.pft.resumeRecord(r); });
    await until(() => !document.querySelector("#sheet").hidden, undefined, 20000);
    await page.waitForTimeout(700);
    await shot("12-end-card");
    await page.click("[data-a=look]");
    await page.waitForTimeout(700);
    await shot("11-dawn-signed");

    // 14-15. the drawer, and the war drawn again
    await page.click("#menu-btn");
    await page.waitForTimeout(800);
    await page.click("[data-a=drawer]");
    await page.waitForTimeout(700);
    await shot("13-drawer");
    await page.click(".pages .page");
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.pft.speed = 2; });
    await page.click("[data-v=replay]");
    await page.waitForTimeout(3200);
    await shot("14-replay");
    await log("done");
  } catch (e) {
    await log("FAILED " + e.message.split("\n")[0]);
    await page.screenshot({ path: `${out}/99-fail.png` });
  }
}

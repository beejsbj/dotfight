// An old save (the baseline's { s, mode } with GameState v1 and no page
// stamp) must load and play; and a desktop mouse must be able to flick.
export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    const game = await import("/src/game.ts");
    const bot = await import("/src/bot.ts");
    const s = game.newGame(99); // no page stamp: the oldest saves had none
    let k = 1;
    while (s.phase === "setup") { const spot = bot.botBase(s, (x, y) => !game.canPlaceBase(s, x, y), k++); game.placeBase(s, spot.x, spot.y); }
    for (let i = 0; i < 9; i++) game.act(s, bot.botFlick(s, 1, k++));
    delete s.page;
    localStorage.setItem("pft:save", JSON.stringify({ s, mode: { kind: "bot", level: 2 } }));
  });
  await page.reload();
  await page.waitForFunction(() => window.pft);
  await page.waitForTimeout(1200);
  const hasResume = await page.locator("[data-a=resume]").count();
  console.log("resume offered:", hasResume, await page.locator("[data-a=resume]").textContent().catch(() => ""));
  await page.click("[data-a=resume]");
  await page.waitForTimeout(1200);
  console.log("after resume:", JSON.stringify(await T.state()));
  await page.screenshot({ path: `${out}/c-old-save.png` });
  // mouse: press on a soldier, pull, release
  await page.waitForFunction(() => !window.pft.busy && window.pft.s.current === 0, undefined, { timeout: 20000 });
  const me = await page.evaluate(() => window.pft.s.soldiers.find((x) => x.alive && x.owner === 0));
  const a = await T.world(me.x, me.y);
  await page.mouse.click(a.x, a.y);
  await page.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 5000 });
  const before = await page.evaluate(() => window.pft.s.marks.length);
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(205, 700, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.pft.s.marks.length);
  console.log("mouse flick added marks:", after - before);
}

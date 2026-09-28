// The paper picker and the rules around it: settings swatches, a pick that
// persists across a reload, a room whose paper wins, and drawer pages that
// keep the paper they were played on.
export default async function (T, out) {
  const { page } = T;
  const cur = () => page.evaluate(() => window.pft.theme.current);
  const cover = () => page.evaluate(() => document.querySelector("#cover [data-klass]").textContent);
  await page.waitForTimeout(1500);
  const first = await cur();
  console.log("surprise on load:", first, "| cover class:", await cover());
  // file a few wars on different papers, for the drawer
  for (const [i, id] of ["legal", "blueprint", "graph", "copy"].entries()) {
    await page.evaluate(([id, i]) => { window.pft.theme.apply(id); window.pft.fileWar(20 + i, 60); }, [id, i]);
  }
  await page.evaluate(() => window.pft.showTitle());
  await page.waitForTimeout(600);
  await page.click("[data-a=settings]");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/settings-surprise.jpg`, type: "jpeg", quality: 82 });
  await page.click('.papers [data-theme="legal"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/settings-legal.jpg`, type: "jpeg", quality: 82 });
  console.log("picked legal ->", await cur(), "| cover class:", await cover());
  await page.reload();
  await page.waitForFunction(() => window.pft);
  await page.waitForTimeout(1500);
  console.log("after reload ->", await cur());
  // a room: its paper wins over the pick, and says so on the cover and in settings
  await page.evaluate(() => { window.pft.theme.room("blueprint"); window.pft.showTitle(); });
  await page.waitForTimeout(800);
  console.log("in a blueprint room ->", await cur(), "| cover class:", await cover());
  await page.screenshot({ path: `${out}/room-cover.jpg`, type: "jpeg", quality: 82 });
  await page.click("[data-a=settings]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/room-settings.jpg`, type: "jpeg", quality: 82 });
  await page.click('.papers [data-theme="graph"]');
  await page.waitForTimeout(300);
  console.log("picked graph in the room ->", await cur());
  await page.click(".card [data-a=back]");
  await page.evaluate(() => { window.pft.theme.room(null); window.pft.showTitle(); });
  await page.waitForTimeout(500);
  console.log("left the room ->", await cur());
  // the drawer: each page on its own paper
  await page.click("[data-a=drawer]");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/drawer.jpg`, type: "jpeg", quality: 82 });
  await page.click(".pages .page:nth-child(2)");
  await page.waitForTimeout(1500);
  console.log("viewing drawer page 2 ->", await cur(), await page.evaluate(() => window.pft.s.page));
  await page.screenshot({ path: `${out}/drawer-view.jpg`, type: "jpeg", quality: 82 });
}

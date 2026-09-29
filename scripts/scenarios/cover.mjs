// The cover with a local game and three games with friends (your go, their go,
// finished), seeded straight into localStorage. THEME=<id> picks the paper,
// TAG names the files. Screenshots: cover-<TAG>.png (and -more, -sure when present).
export default async function (T, out) {
  const { page } = T;
  const tag = process.env.TAG ?? "now";
  await page.waitForTimeout(800);
  if (process.env.THEME) await page.evaluate((id) => window.pft.theme.apply(id), process.env.THEME);
  await page.evaluate(() => {
    const r = window.pft.fileWar(5, 12);
    window.pft.resumeRecord(r);
    localStorage.setItem('pft:save', JSON.stringify({ s: window.pft.s, mode: { kind: 'pnp' } }));
  });
  await page.waitForTimeout(600);
  const room = (code, foe, seat, next, winner, turn) => ({
    v: 1, code, seat, secret: "x", engine: "core", setup: {}, names: seat === 0 ? ["Dawood", foe] : [foe, "Dawood"],
    log: [], applied: 0, pending: [], updated: Date.now(), summary: { turn, next, ...(winner === undefined ? {} : { winner }) },
  });
  await page.evaluate((rooms) => {
    for (const r of rooms) localStorage.setItem(`pft:room:${r.code}`, JSON.stringify(r));
    localStorage.setItem("pft:rooms", JSON.stringify(rooms.map((r) => r.code)));
  }, [
    room("aaaa1", "Hamza", 0, 0, undefined, 6),
    room("bbbb2", "Sana", 1, 0, undefined, 3),
    room("cccc3", "Ali", 0, null, 0, 14),
  ].concat(process.env.MANY ? [room("dddd4", "Zara", 0, 1, undefined, 2), room("eeee5", "Omar", 1, 1, undefined, 4), room("ffff6", "Iman", 0, null, 1, 9), room("gggg7", "Bilal", 0, null, 0, 11)] : []));
  await page.evaluate(() => window.pft.showTitle());
  await page.waitForTimeout(1600);
  await T.shot(`${out}/cover-${tag}.png`);
  if (process.env.TEAR) {
    const rooms = () => page.evaluate(() => JSON.parse(localStorage.getItem("pft:rooms")));
    console.log("rooms before:", await rooms());
    await page.click('[data-a=ask][data-code=bbbb2]');
    await page.waitForTimeout(300);
    await T.shot(`${out}/cover-${tag}-sure.png`);
    await page.click("[data-a=keep]");
    console.log("kept:", await rooms());
    await page.click('[data-a=ask][data-code=bbbb2]');
    await page.click("[data-a=tear]");
    console.log("torn out bbbb2:", await rooms(), "room key left:", await page.evaluate(() => localStorage.getItem("pft:room:bbbb2")));
    await page.click("[data-a=more]");
    await page.waitForTimeout(300);
    await T.shot(`${out}/cover-${tag}-done.png`);
    await page.click('[data-a=ask][data-code=local]');
    await page.waitForTimeout(300);
    await T.shot(`${out}/cover-${tag}-sure-local.png`);
    await page.click("[data-a=tear]");
    console.log("save after tearing:", await page.evaluate(() => localStorage.getItem("pft:save")), "resume button:", await page.locator("[data-a=resume]").count());
    for (const a of ["drawer", "how", "settings"]) {
      await page.click(`.tabs [data-a=${a}]`);
      await page.waitForTimeout(400);
      console.log(a, "sheet open:", await page.evaluate(() => !document.querySelector("#sheet").hidden));
      await page.evaluate(() => window.pft.showTitle());
      await page.waitForTimeout(300);
    }
    console.log("rules link:", await page.getAttribute(".tabs a.mark", "href"));
  }
  if (process.env.AFTER) await (await import(process.env.AFTER)).default(T, out, tag);
}

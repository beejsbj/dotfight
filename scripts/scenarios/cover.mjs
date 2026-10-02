// The cover with a local game and three games with friends (your go, their go,
// finished), seeded straight into localStorage. THEME=<id> picks the paper,
// TAG names the files, MANY=1 adds four more games, SIZE=custom opens the steppers.
// Prints whether the leaf fits without scrolling. Screenshots: cover-<TAG>.png
// (and -sure, -drawer when present).
export default async function (T, out) {
  const { page } = T;
  const tag = process.env.TAG ?? "now";
  await page.waitForTimeout(800);
  if (process.env.THEME) await page.evaluate((id) => window.pft.theme.choose(id), process.env.THEME);
  await page.evaluate(() => {
    const r = window.pft.fileWar(5, 12);
    window.pft.resumeRecord(r);
    localStorage.setItem('pft:save', JSON.stringify({ s: window.pft.s, mode: { kind: 'pnp' } }));
  });
  await page.waitForTimeout(600);
  const room = (code, foe, seat, next, winner, turn, theme) => ({
    v: 1, code, seat, secret: "x", engine: "core", setup: {}, theme, names: seat === 0 ? ["Dawood", foe] : [foe, "Dawood"],
    log: [], applied: 0, pending: [], updated: Date.now(), summary: { turn, next, ...(winner === undefined ? {} : { winner }) },
  });
  await page.evaluate((rooms) => {
    for (const r of rooms) localStorage.setItem(`pft:room:${r.code}`, JSON.stringify(r));
    localStorage.setItem("pft:rooms", JSON.stringify(rooms.map((r) => r.code)));
  }, [
    room("aaaa1", "Hamza", 0, 0, undefined, 6, "graph"),
    room("bbbb2", "Sana", 1, 0, undefined, 3, "notebook"),
    room("cccc3", "Ali", 0, null, 0, 14, "legal"),
  ].concat(process.env.MANY ? [room("dddd4", "Zara", 0, 1, undefined, 2, "copy"), room("eeee5", "Omar", 1, 1, undefined, 4), room("ffff6", "Iman", 0, null, 1, 9), room("gggg7", "Bilal", 0, null, 0, 11)] : []));
  await page.evaluate(() => window.pft.showTitle());
  const fit = () => page.evaluate(() => { const l = document.querySelector("#cover .leaf"); const b = document.querySelector("#cover .book").getBoundingClientRect(); return { scroll: l.scrollHeight, client: l.clientHeight, fits: l.scrollHeight <= l.clientHeight + 1, fit: l.style.getPropertyValue("--fit") || "1", rows: [...document.querySelectorAll("#cover .menu .game")].map((g) => g.textContent.replace(/\s+/g, " ").trim()), more: document.querySelector("#cover .menu [data-a=more]")?.textContent ?? "", bookBottom: Math.round(b.bottom), vh: innerHeight }; });
  const lit = () => page.waitForFunction(() => document.body.classList.contains("lit") && +getComputedStyle(document.body).getPropertyValue("--lamp") >= 0.99, undefined, { timeout: 8000 }).then(() => page.waitForTimeout(400));
  await lit();
  if (process.env.SIZE) await page.click(`[data-size=${process.env.SIZE}]`);
  console.log("lamp:", await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--lamp")));
  await T.shot(`${out}/cover-${tag}.png`);
  console.log("fit:", JSON.stringify(await fit()));
  if (process.env.TEAR) {
    const rooms = () => page.evaluate(() => JSON.parse(localStorage.getItem("pft:rooms")));
    console.log("rooms before:", await rooms());
    await page.click('[data-a=ask][data-code=aaaa1]');
    await page.waitForTimeout(300);
    await T.shot(`${out}/cover-${tag}-sure.png`);
    console.log("new game heading top at confirm:", await page.evaluate(() => [...document.querySelectorAll('.menu .sect')].pop().getBoundingClientRect().top), "of", await page.evaluate(() => innerHeight));
    await page.click("[data-a=keep]");
    console.log("kept:", await rooms());
    await page.click('[data-a=ask][data-code=local]');
    await page.waitForTimeout(300);
    await T.shot(`${out}/cover-${tag}-sure-local.png`);
    const box = await page.evaluate(() => { const b = document.querySelector(".menu .tearing [data-a=tear]").getBoundingClientRect(); const k = document.querySelector(".menu .tearing [data-a=keep]").getBoundingClientRect(); const nb = [...document.querySelectorAll(".menu .sect")].pop().getBoundingClientRect(); return { tear: [b.width, b.height], keep: [k.width, k.height], newGameTop: nb.top, vh: innerHeight }; });
    console.log("targets:", JSON.stringify(box));
    await page.click("[data-a=keep]");
    await page.click('[data-a=ask][data-code=aaaa1]');
    await page.click("[data-a=tear]");
    console.log("torn out aaaa1:", await rooms(), "room key left:", await page.evaluate(() => localStorage.getItem("pft:room:aaaa1")));
    await page.click("[data-a=more]");
    await page.waitForTimeout(400);
    await T.shot(`${out}/cover-${tag}-drawer.png`);
    console.log("drawer lists:", await page.evaluate(() => [...document.querySelectorAll("#sheet .game")].map((g) => g.textContent.replace(/\s+/g, " ").trim())));
    await page.click("#sheet [data-a=back]");
    await page.click('[data-a=ask][data-code=local]');
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

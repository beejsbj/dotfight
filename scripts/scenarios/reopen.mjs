// Reopening a friend's game from its /r/<code> link, on a device that has
// played it, must switch the lamp on like any other way in (it used to stay dark).
export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1400);
  // a room this device holds a seat in, as enterRoom would have saved it
  await page.getByText("play Dawood-bot").click();
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const s = window.pft.s;
    const code = "abcdef";
    const saved = {
      v: 1, code, seat: 0, secret: "x", engine: "core-2",
      setup: { seed: s.seed, size: { ...s.size }, rules: structuredClone(s.rules), ...(s.page && { page: s.page }) },
      names: ["A", "B"], log: [], applied: 0, pending: [], updated: Date.now(),
    };
    localStorage.setItem(`pft:room:${code}`, JSON.stringify(saved));
    localStorage.setItem("pft:rooms", JSON.stringify([code]));
  });
  await page.goto(new URL("/r/abcdef", page.url()).href);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    screen: window.pft.screen,
    lamp: window.pft.frame().lamp.on,
    css: getComputedStyle(document.body).getPropertyValue("--lamp"),
    lit: document.body.classList.contains("lit"),
  }));
  console.log("reopened", JSON.stringify(r));
  await T.shot(`${out}/reopened.png`);
  if (r.screen !== "game" || r.lamp < 0.99 || !r.lit) throw new Error(`lamp stayed off on reopen: ${JSON.stringify(r)}`);
  console.log("ok: lamp on after reopening the room link");
}

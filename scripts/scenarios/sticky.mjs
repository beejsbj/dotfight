// The cover's "learn the game" sticky note, fresh (never taught) and worn (the
// lesson learnt), on a few papers. Checks the slip still fits the leaf, that
// the note sits inside the slip, and that tapping it starts the lesson.
//   PAPERS=lamplight,legal,blueprint node scripts/playtest.mjs sticky <url> <outdir>
export default async function (T, out) {
  const { page } = T;
  const papers = (process.env.PAPERS ?? "lamplight,legal,blueprint").split(",");
  await page.waitForTimeout(800);
  const lit = () => page.waitForFunction(() => document.body.classList.contains("lit") && +getComputedStyle(document.body).getPropertyValue("--lamp") >= 0.99, undefined, { timeout: 8000 }).then(() => page.waitForTimeout(400));
  for (const id of papers) {
    for (const state of ["fresh", "worn"]) {
      await page.evaluate(({ id, state }) => {
        if (state === "worn") localStorage.setItem("pft:taught:tutorial", "1"); else localStorage.removeItem("pft:taught:tutorial");
        window.pft.theme.choose(id);
        window.pft.showTitle();
      }, { id, state });
      await lit();
      const m = await page.evaluate(() => {
        const leaf = document.querySelector("#cover .leaf"), menu = document.querySelector("#cover .menu").getBoundingClientRect();
        const n = document.querySelector("#cover .sticky"), r = n.getBoundingClientRect();
        return { cls: n.className, fits: leaf.scrollHeight <= leaf.clientHeight + 1, fit: leaf.style.getPropertyValue("--fit") || "1", inside: r.left >= menu.left - 2 && r.right <= menu.right + 2 && r.bottom <= menu.bottom + 2, w: Math.round(r.width), h: Math.round(r.height) };
      });
      console.log(id, state, JSON.stringify(m));
      if (!m.fits || !m.inside || !m.cls.includes(state)) throw new Error(`${id} ${state}: ${JSON.stringify(m)}`);
      await T.shot(`${out}/sticky-${id}-${state}.png`);
    }
  }
  await page.click("#cover .sticky");
  await page.waitForFunction(() => window.pft.lesson && window.pft.screen === "game", undefined, { timeout: 8000 });
  console.log("OK: the note starts the lesson");
}

// The cover's two games, and Dawood's mood. Screenshots the cover, then starts
// bot games from it (after a clean drawer, two losses, two wins), each time
// screenshotting the page with his mood pencilled up the margin, and logs the
// level each rolled. Then a pass & play page (no mood note) and the drawer
// with his mood in its captions.
//   node scripts/playtest.mjs mood <url> <outdir>
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const lit = () => page.waitForFunction(() => document.body.classList.contains("lit") && +getComputedStyle(document.body).getPropertyValue("--lamp") >= 0.99, undefined, { timeout: 8000 }).then(() => page.waitForTimeout(400));
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.pft.theme.choose("lamplight"); window.pft.showTitle(); });
  await lit();
  const cover = await page.evaluate(() => ({
    sizes: [...document.querySelectorAll("#cover .sizes button")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
    level: !!document.querySelector("#cover [data-lvl]"),
    fits: (() => { const l = document.querySelector("#cover .leaf"); return l.scrollHeight <= l.clientHeight + 1; })(),
  }));
  console.log("cover:", JSON.stringify(cover));
  if (cover.sizes.length !== 2 || cover.level || !cover.fits) throw new Error(`the cover: ${JSON.stringify(cover)}`);
  await T.shot(`${out}/m0-cover.png`);
  await page.click("[data-size=long]");
  await page.waitForTimeout(200);
  await T.shot(`${out}/m0-cover-long.png`);
  await page.click("[data-size=classic]");

  // a finished page against him, won (0) or lost (1), straight into the drawer
  const history = (winners) => page.evaluate((winners) => {
    const pages = winners.map((w, i) => { const r = window.pft.fileWar(60 + i, 3); return { ...r, mode: { kind: "bot", level: 1 }, winner: w, turns: 20, at: Date.now() - i * 1000, page: { ...r.page, no: 90 + i } }; });
    localStorage.setItem("pft:drawer", JSON.stringify(pages));
    localStorage.removeItem("pft:save");
  }, winners);

  const levels = { fresh: [], lost2: [], won2: [] };
  for (const [tag, winners] of [["fresh", []], ["lost2", [1, 1]], ["won2", [0, 0]]]) {
    await history(winners);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.pft.showTitle());
      await page.waitForTimeout(500);
      await page.getByText("play Dawood-bot").click();
      await T.wait(() => window.pft.screen === "game" && window.pft.mode.kind === "bot");
      const m = await page.evaluate(() => ({ level: window.pft.mode.level, seed: window.pft.s.seed, size: window.pft.s.size, note: document.querySelector("#lesson-host").children[2]?.style.visibility !== "hidden" }));
      levels[tag].push(m.level);
      if (m.size.bases !== 4 || m.size.soldiers !== 8) throw new Error(`a classic is 4 x 8, got ${JSON.stringify(m.size)}`);
      if (i === 0) {
        await page.waitForTimeout(2600); // his mood writes on
        await T.shot(`${out}/m1-mood-${tag}.png`);
        const shown = await page.evaluate(() => { const c = document.querySelector("#lesson-host").children[2]; return c && c.style.visibility !== "hidden" && c.width > 0; });
        if (!shown) throw new Error("no mood note on a page against Dawood-bot");
      }
      await page.evaluate(() => document.querySelector("#menu-btn").click());
      await page.waitForTimeout(300);
    }
  }
  console.log("levels (0 sloppy, 1 steady, 2 sharp):", JSON.stringify(levels));

  // pass & play: no mood
  await page.evaluate(() => { localStorage.removeItem("pft:save"); window.pft.showTitle(); });
  await page.waitForTimeout(500);
  await page.getByText("pass & play").click();
  await page.waitForTimeout(2600);
  const pnp = await page.evaluate(() => { const c = document.querySelector("#lesson-host").children[2]; return !c || c.style.visibility === "hidden"; });
  if (!pnp) throw new Error("a mood note on a pass & play page");
  await T.shot(`${out}/m2-pnp.png`);

  // the drawer: his mood in the captions
  await page.evaluate(() => {
    const pages = [0, 1, 2].map((lvl) => { const r = window.pft.fileWar(70 + lvl, 400); return { ...r, mode: { kind: "bot", level: lvl }, at: Date.now() - lvl * 1000, page: { ...r.page, no: 80 + lvl } }; });
    localStorage.setItem("pft:drawer", JSON.stringify(pages));
    window.pft.showTitle();
  });
  await page.waitForTimeout(600);
  await page.click("[data-a=drawer]");
  await page.waitForTimeout(800);
  const caps = await page.evaluate(() => [...document.querySelectorAll(".pages .page span")].map((s) => s.textContent));
  console.log("drawer:", JSON.stringify(caps));
  if (!caps.some((c) => c.includes("sharp Dawood")) || !caps.some((c) => c.includes("sleepy Dawood"))) throw new Error("no mood in the drawer's captions");
  await T.shot(`${out}/m3-drawer.png`);
  await idle(T).catch(() => {});
  console.log("OK");
}

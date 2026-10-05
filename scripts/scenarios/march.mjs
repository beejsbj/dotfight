// The long war's convoys walk in real time: a filed war is resumed at a turn
// with a convoy out on the road, and the page is captured as its column walks
// on during the turn (half a second, three, six and a half), then checked
// against a full redraw while it moves.
//   node scripts/playtest.mjs march <url> <outdir>      (SEED)
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  await page.evaluate(() => window.pft.theme?.apply("lamplight"));
  await page.waitForTimeout(800);
  // file wars a turn at a time until one has a convoy on the road as a turn begins
  const found = await page.evaluate((seed0) => {
    for (let seed = seed0; seed < seed0 + 40; seed++) for (let turns = 4; turns < 30; turns++) {
      const r = window.pft.fileWar(seed, turns, "long");
      r.mode = { kind: "pnp" };
      window.pft.resumeRecord(r);
      const s = window.pft.s;
      const c = s.convoys.find((c) => c.state === "road" && Math.hypot(c.road[1].x - c.road[0].x, c.road[1].y - c.road[0].y) - c.at > 160); // with a stretch still to walk
      if (s.phase === "play" && c) return { seed, turns, convoy: c.id, at: c.at, ids: c.ids };
    }
    return null;
  }, +(process.env.SEED ?? 3));
  console.log("convoy on the road:", JSON.stringify(found));
  if (!found) return;
  await idle(T);
  const head = async () => page.evaluate((id) => { const p = window.pft.shown?.soldiers[id]; return p && [Math.round(p.x), Math.round(p.y)]; }, found.ids[0]);
  for (const ms of [500, 3000, 6500]) {
    await page.waitForFunction((ms) => window.pft.turnClock >= ms, ms, { timeout: 20000 });
    await T.shot(`${out}/march-${ms}.png`);
    console.log(`at ${ms} ms the head stands at`, JSON.stringify(await head()), "clock", await page.evaluate(() => Math.round(window.pft.turnClock)));
  }
  const check = async (label) => {
    const r = await page.evaluate(() => window.pft.redrawCheck());
    console.log(label, Object.entries(r).map(([k, v]) => `${k} ${v.bad}`).join(" | "));
  };
  await check("redraw, the convoy waiting:");
  // and mid-walk: a fresh turn's clock held at two moments
  const again = await page.evaluate(({ seed, turns }) => { const r = window.pft.fileWar(seed, turns, "long"); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); return true; }, found);
  void again;
  await idle(T);
  for (const ms of [1800, 3700]) {
    await page.evaluate(() => { window.pft.clockHeld = false; });
    await page.waitForFunction((ms) => window.pft.turnClock >= ms, ms, { timeout: 20000 });
    await page.evaluate(() => { window.pft.clockHeld = true; });
    await page.waitForTimeout(600);
    await check(`redraw, held at ${ms} ms:`);
  }
  await page.evaluate(() => { window.pft.clockHeld = false; });
}

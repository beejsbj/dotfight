// Visual clarity: one seeded page with every state on it, at phone size, on
// whichever theme (THEME=lamplight|blueprint|...). It looks for a war that has
// the dead, men who moved away (with the old spots), and a convoy out on the
// road, then shoots the whole page from bird's-eye and a few close looks
// leaning in, plus a lunger mid-ride.
//   THEME=blueprint node scripts/playtest.mjs clarity <url> <outdir>     (TAG=before|after names the files)
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  const tag = process.env.TAG ?? "after", theme = process.env.THEME ?? "lamplight";
  await page.evaluate((id) => window.pft.theme?.apply(id), theme);
  await page.waitForTimeout(1000);
  const pick = await page.evaluate(() => {
    const p = window.pft;
    let best = null;
    for (let seed = +(new URLSearchParams(location.search).get("seed") ?? 1); seed < 60; seed++) {
      for (let turns = 10; turns <= 44; turns += 2) {
        const r = p.fileWar(seed, turns), s = p.unfile(r);
        if (s.phase !== "play") break;
        const dead = s.marks.filter((m) => m.t === "cross" && m.kind === "kill").length;
        const moved = s.marks.filter((m) => m.t === "cross" && m.kind === "moved").length;
        const road = s.convoys.filter((c) => c.state === "road" && c.ids.some((i) => s.soldiers[i].alive)).length;
        const score = Math.min(dead, 5) + Math.min(moved, 5) + road * 6;
        if (road && dead >= 3 && moved >= 3 && (!best || score > best.score)) best = { seed, turns, score };
      }
      if (best && best.score >= 14) break;
    }
    return best;
  });
  console.log("war:", JSON.stringify(pick));
  await page.evaluate(({ seed, turns }) => { window.pft.slow = false; window.pft.boilOn = true; const r = window.pft.fileWar(seed, turns); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); }, pick);
  await idle(T);
  await page.waitForFunction(() => window.pft.boil?.settled !== false, undefined, { timeout: 60000 });
  await page.waitForTimeout(800);
  const shot = (name, clip) => page.screenshot({ path: `${out}/${tag}-${theme}-${name}.png`, clip });
  await shot("bird");
  const spots = await page.evaluate(() => {
    const s = window.pft.s;
    const road = s.convoys.filter((c) => c.state === "road").flatMap((c) => c.ids).map((i) => s.soldiers[i]).find((x) => x.alive);
    const kill = s.marks.find((m) => m.t === "cross" && m.kind === "kill");
    const moved = s.marks.find((m) => m.t === "cross" && m.kind === "moved");
    return { road: road && { x: road.x, y: road.y }, kill: kill && { x: kill.x, y: kill.y }, moved: moved && { x: moved.x, y: moved.y } };
  });
  console.log("spots:", JSON.stringify(spots));
  for (const [name, at] of Object.entries(spots)) {
    if (!at) continue;
    await page.evaluate(({ at }) => { window.pft.cam.sit(at, 3.2, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, { at });
    await page.waitForTimeout(900);
    await shot(`lean-${name}`);
  }
}

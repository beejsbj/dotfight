// The long war's aim guide: a man aims to pass just outside a manned enemy
// camp, and the pencilled guide bends round its well the way the ink will;
// then one aims glancing at a cushion, and the guide banks. Captured while the
// pen is held back, before release.
//   node scripts/playtest.mjs aim-guide <url> <outdir>      (SEED, TURNS)
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  await page.evaluate(() => window.pft.theme?.apply("lamplight"));
  await page.waitForTimeout(1000);
  await page.evaluate(({ seed, turns }) => {
    const r = window.pft.fileWar(seed, turns, "long");
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  }, { seed: +(process.env.SEED ?? 7), turns: +(process.env.TURNS ?? 3) });
  await idle(T);
  // the aim starts straight up the page (at them): find a man of ours whose straight-up line passes 30 units outside
  // a manned enemy camp's wall, or meets a cushion's wall glancing, then just pull straight back
  const pick = (shape) => page.evaluate((shape) => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined);
    let best = null;
    for (const b of s.bases.filter((b) => b.owner !== s.current && b.shape === shape)) for (const m of mine) {
      const dy = s.current === 0 ? m.y - b.y : b.y - m.y, side = Math.abs(m.x - b.x); // "up" is toward them, whichever side flicks
      const want = shape === "camp" ? b.r + 30 : b.r * 0.7;
      if (dy < 250 || dy > 800) continue;
      const err = Math.abs(side - want);
      if (!best || err < best.err) best = { id: m.id, err, dy };
    }
    return best;
  }, shape);
  for (const shape of ["camp", "cushion"]) {
    const p = await pick(shape);
    if (!p || p.err > 25) { console.log(`no ${shape} lined up on this page (best off by ${p?.err?.toFixed(0)})`); continue; }
    const me = await page.evaluate((id) => window.pft.s.soldiers[id], p.id);
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 40); // pick him up
    await T.wait(() => window.pft.cam.settled, undefined, 60000);
    const pull = Math.min(230, 60 + p.dy * 0.22);
    await T.drag(195, 640, 195, 640 + pull, { hold: 60, ms: 300, release: false });
    await page.waitForTimeout(400);
    console.log(shape, JSON.stringify(await page.evaluate(() => window.pft.aim)));
    await T.shot(`${out}/guide-${shape}.png`);
    await T.drag(195, 640 + pull, 195, 642, { steps: 6, ms: 200, release: true }); // slide back to cancel
    await page.waitForTimeout(600);
    await idle(T);
  }
}

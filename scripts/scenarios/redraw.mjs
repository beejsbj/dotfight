// Regression check: while leaning in and aiming, every layer drawn with dirty
// rectangles (the overlay, the live layer, both boil canvases) must match a
// full redraw of the same frame, pixel for pixel apart from antialiasing.
// It sweeps the aim back and forth (the phone bug: stale pencil streaks were
// left beside the camps) and checks between moves. Exits non-zero on a mismatch.
//   node scripts/playtest.mjs redraw <url> <outdir>      (SEED, TURNS)
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000); // a loaded box takes its time over screenshots
  // one paper, not whichever the load drew: THEME=<id> (lamplight by default)
  await page.evaluate((id) => window.pft.theme?.apply(id), process.env.THEME ?? "lamplight");
  await page.waitForTimeout(1000);
  await page.evaluate(({ seed, turns }) => {
    window.pft.slow = false;
    window.pft.boilOn = true;
    const r = window.pft.fileWar(seed, turns);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  }, { seed: +(process.env.SEED ?? 7), turns: +(process.env.TURNS ?? 6) });
  await idle(T);
  await page.waitForFunction(() => window.pft.boil?.settled !== false, undefined, { timeout: 30000 });
  const fails = [];
  const check = async (label) => {
    const r = await page.evaluate(() => window.pft.redrawCheck());
    const worst = Object.entries(r).filter(([, v]) => v.bad !== 0);
    console.log(`${label.padEnd(22)} ${Object.entries(r).map(([k, v]) => `${k} ${v.bad}${v.box ? ` @${v.box.join(",")}` : ""}`).join(" | ")}`);
    if (worst.length) fails.push(label);
  };
  await check("bird's-eye");
  // the lowest of the side to play: leaning in on him, the camps sit at the screen's edges
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 30000 });
  await page.waitForTimeout(300);
  await check("leaning in");
  await T.touch("touchStart", [[195, 600]]);
  for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[195, 600 + i * 12]]); await page.waitForTimeout(30); }
  for (let j = 0; j < 60; j++) {
    const ang = Math.PI / 2 + Math.sin(j / 8) * 0.9, pull = 90 + 40 * Math.abs(Math.sin(j / 5));
    await T.touch("touchMove", [[195 + Math.cos(ang) * pull, 600 + Math.sin(ang) * pull]]);
    await page.waitForTimeout(50);
    if (j % 10 === 9) await check(`aiming, sweep ${j + 1}`);
    if (j === 44) await T.shot(`${out}/aiming.png`);
  }
  await T.touch("touchEnd", []);
  if (fails.length) { console.log(`MISMATCH: ${fails.join(", ")}`); process.exitCode = 1; }
  else console.log("all layers match a full redraw");
}

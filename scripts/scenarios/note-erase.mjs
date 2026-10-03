// A man's note being rubbed out, frame by frame with the clock in hand: the
// note written, then every 60 ms through its eraser, close up (leaning in)
// and from bird's-eye. KIND picks the note (idle, lunge for a shout, chant).
//   node scripts/playtest.mjs note-erase <url> /tmp/out
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1200);
  await page.evaluate((id) => window.pft.theme?.apply(id), process.env.THEME ?? "lamplight");
  await page.evaluate(() => { window.pft.slow = false; const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T, 60000);
  const kind = process.env.KIND ?? "idle";
  for (const view of ["close", "bird"]) {
    const id = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0].id; });
    if (view === "close") await page.evaluate((id) => { const x = window.pft.s.soldiers[id]; window.pft.cam.sit(x, 2.6, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, id);
    else await page.evaluate(() => { window.pft.cam.home?.(); window.pft.poke(); });
    await page.waitForTimeout(1500);
    // a pinned clock: the same note, at the same moment, every run
    await page.evaluate(() => { window.pft.boilClock = 400000; window.pft.hand(true); });
    await page.waitForFunction(() => window.pft.wall === 400000);
    const text = await page.evaluate(({ id, kind }) => {
      const p = window.pft;
      for (let k = 0; k < 400 && !p.bubbles.cur; k++) { p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7); }
      p.poke();
      return p.bubbles.cur ? { text: p.bubbles.cur.text, mood: p.bubbles.cur.mood } : null;
    }, { id, kind });
    console.log(view, "note:", JSON.stringify(text));
    const at = await T.world(...(await page.evaluate((id) => { const x = window.pft.s.soldiers[id]; return [x.x, x.y]; }, id)));
    const half = view === "close" ? 190 : 120;
    const clip = { x: Math.max(0, Math.round(at.x - half)), y: Math.max(0, Math.round(at.y - half * 1.3)), width: half * 2, height: Math.round(half * 2) };
    // written, then into the eraser: frames by time since it began (a "say" is rubbed out over its last 720 ms of 2500)
    const t0 = await page.evaluate(() => window.pft.bubbles.cur.t0);
    const to = async (dt) => { await page.evaluate((ms) => window.pft.step(ms), Math.max(0, t0 + dt - (await page.evaluate(() => window.pft.wall)))); await page.waitForTimeout(150); };
    await to(1500);
    await T.page.screenshot({ path: `${out}/${view}-written.png`, clip });
    for (let dt = 1740; dt <= 2560; dt += 60) {
      await to(dt);
      await T.page.screenshot({ path: `${out}/${view}-erase-${dt}.png`, clip });
    }
    await page.evaluate(() => { window.pft.hand(false); window.pft.bubbles.reset(); window.pft.poke(); });
  }
}

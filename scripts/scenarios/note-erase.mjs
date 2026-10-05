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
  const { ANCHOR, BUBBLE } = await page.evaluate(async () => { const { ANCHOR, BUBBLE } = await import("/src/bubble.ts"); return { ANCHOR, BUBBLE }; });
  for (const view of ["close", "bird"]) {
    if (!(kind in ANCHOR)) throw new Error(`Unknown note kind: ${kind}`);
    const anchor = ANCHOR[kind];
    const at = await page.evaluate((anchor) => {
      const s = window.pft.s;
      const candidates = anchor === "base" ? s.bases : s.soldiers.filter((x) => x.alive);
      const at = candidates.filter((x) => x.owner === s.current).sort((a, b) => b.y - a.y)[0];
      if (!at) throw new Error(`No ${anchor} anchor for current player`);
      return { id: at.id, x: at.x, y: at.y };
    }, anchor);
    const { id } = at;
    if (view === "close") await page.evaluate((at) => { window.pft.cam.sit(at, 2.6, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, at);
    else await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await page.waitForTimeout(1500);
    // a pinned clock: the same note, at the same moment, every run
    await page.evaluate(() => { window.pft.boilClock = 400000; window.pft.hand(true); });
    await page.waitForFunction(() => window.pft.wall === 400000);
    const text = await page.evaluate(({ id, kind }) => {
      const p = window.pft;
      p.bubbles.reset(); // discard any automatic offer from the clock-pinning frame
      for (let k = 0; k < 400 && !p.bubbles.cur; k++) { p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7); }
      p.poke();
      const b = p.bubbles.cur;
      if (!b || b.kind !== kind || b.id !== id) throw new Error(`Could not offer ${kind} at ${id}`);
      return { text: b.text, mood: b.mood, t0: b.t0, slow: b.slow ?? 1, hold: b.hold ?? 0 };
    }, { id, kind });
    console.log(view, "note:", JSON.stringify(text));
    const screenAt = await T.world(at.x, at.y);
    const half = view === "close" ? 190 : 120;
    const viewport = page.viewportSize();
    const width = Math.min(viewport.width, half * 2), height = Math.min(viewport.height, half * 2);
    const clip = { x: Math.max(0, Math.min(viewport.width - width, Math.round(screenAt.x - half))), y: Math.max(0, Math.min(viewport.height - height, Math.round(screenAt.y - half * 1.3))), width, height };
    // Capture the actual mood, including slower writing and any extra hold.
    const timing = BUBBLE.timing[text.mood];
    const showMs = timing.showMs + timing.writeMs * (text.slow - 1) + text.hold;
    const eraseAt = showMs - timing.eraseMs;
    const { t0 } = text;
    const to = async (dt) => { await page.evaluate((ms) => window.pft.step(ms), Math.max(0, t0 + dt - (await page.evaluate(() => window.pft.wall)))); await page.waitForTimeout(150); };
    await to(eraseAt - 120);
    await T.page.screenshot({ path: `${out}/${view}-written.png`, clip });
    for (let dt = eraseAt - 60; dt < showMs; dt += 60) {
      await to(dt);
      await T.page.screenshot({ path: `${out}/${view}-erase-${dt}.png`, clip });
    }
    await to(showMs + 120);
    await T.page.screenshot({ path: `${out}/${view}-erased.png`, clip });
    await page.evaluate(() => { window.pft.hand(false); window.pft.bubbles.reset(); window.pft.poke(); });
  }
}

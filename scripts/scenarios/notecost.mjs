// The cost of a soldier's line: script ms per rendered frame over its whole
// life (written, read, gone), bird's-eye and leaning in, against the same
// span with nothing said, an exchange (two men, question and answer), and a streak
// building (links 2, 3 and 5, each cutting the last short), and a botch (the
// enemy camp's slow clap, the longest note there is). THROTTLE=6 node scripts/playtest.mjs notecost <url>
import { idle } from "../lib/phone.mjs";
export default async function (T) {
  const { page, cdp } = T;
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.pft.theme?.apply("lamplight"));
  await page.evaluate(() => { window.pft.slow = false; window.pft.boilOn = true; const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  await page.waitForFunction(() => window.pft.boil?.settled !== false, undefined, { timeout: 30000 });
  const rate = +(process.env.THROTTLE ?? 1);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
  // a comrade to answer him, for an exchange
  const mate = await page.evaluate((id) => { const s = window.pft.s, x = s.soldiers[id]; return s.soldiers.filter((y) => y.alive && y.owner === x.owner && y.id !== id && Math.hypot(y.x - x.x, y.y - x.y) >= 42).sort((a, b) => Math.hypot(a.x - x.x, a.y - x.y) - Math.hypot(b.x - x.x, b.y - x.y))[0]?.id; }, me.id);
  const rows = [];
  const span = async (label, note) => {
    await page.evaluate(() => window.pft.bubbles.reset());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.pft.frames(true));
    if (note === "streak") await page.evaluate(async (id) => { const p = window.pft; p.poke(); for (const [n, v, gap] of [[2, "streakMe", 0], [3, "streakFoe", 1400], [5, "streakCamp", 1400]]) { await new Promise((r) => setTimeout(r, gap)); p.speakStreak(n, id, p.wall, 77 + n); p.poke(); void v; } }, me.id);
    else if (note === "botch") await page.evaluate((id) => { const p = window.pft, x = p.s.soldiers[id]; let ok = false; for (let k = 0; k < 400 && !ok; k++) { p.bubbles.reset(); ok = !!p.speakBotch(2, id, { x: x.x, y: x.y }, p.wall, 500 + k)?.slow; } for (let k = 0; k < 400 && !ok; k++) { p.bubbles.reset(); ok = !!p.speakBotch(2, id, { x: x.x, y: x.y }, p.wall, 900 + k); } p.poke(); }, me.id);
    else if (note === "exchange") await page.evaluate(({ id, mate }) => { const p = window.pft; for (let k = 0; k < 4000 && !p.bubbles.cur?.reply; k++) { p.bubbles.reset(); p.speak("chat", id, p.wall, 1000 + k * 7, mate); } p.poke(); }, { id: me.id, mate });
    else if (note) await page.evaluate((id) => { const p = window.pft; for (let k = 0; k < 400 && !p.bubbles.cur; k++) { p.bubbles.reset(); p.speak("idle", id, p.wall, 1000 + k * 7); } p.poke(); }, me.id);
    await page.waitForTimeout(note === "exchange" ? 4300 : note === "streak" ? 3600 : note === "botch" ? 5200 : 2600);
    const r = await page.evaluate(() => window.pft.frames());
    rows.push(`${label.padEnd(30)} script p50 ${r.script.p50.toFixed(2)}ms p95 ${r.script.p95.toFixed(2)}ms max ${r.script.max.toFixed(1)}ms | n ${r.script.n}`);
  };
  await span("bird's-eye, nothing said", false);
  await span("bird's-eye, a note", true);
  await span("bird's-eye, an exchange", "exchange");
  await span("bird's-eye, a streak (2, 3, 5)", "streak");
  await span("bird's-eye, a botch (slow clap)", "botch");
  await page.evaluate((at) => { window.pft.cam.sit(at, 2.4, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, { x: me.x, y: me.y });
  await page.waitForTimeout(600);
  await span("leaning in, nothing said", false);
  await span("leaning in, a note", true);
  await span("leaning in, an exchange", "exchange");
  await span("leaning in, a streak (2, 3, 5)", "streak");
  await span("leaning in, a botch", "botch");
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(`throttle ${rate}x`);
  console.log(rows.join("\n"));
}

// Regression check: while leaning in and aiming, every layer drawn with dirty
// rectangles (the overlay, the live layer, both boil canvases) must match a
// full redraw of the same frame, pixel for pixel apart from antialiasing.
// It sweeps the aim back and forth (the phone bug: stale pencil streaks were
// left beside the camps) and checks between moves. Exits non-zero on a mismatch.
//   node scripts/playtest.mjs redraw <url> <outdir>      (SEED, TURNS, SIZE: quick, classic or long)
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000); // a loaded box takes its time over screenshots
  // one paper, not whichever the load drew: THEME=<id> (lamplight by default)
  await page.evaluate((id) => window.pft.theme?.apply(id), process.env.THEME ?? "lamplight");
  await page.waitForTimeout(1000);
  await page.evaluate(({ seed, turns, size }) => {
    window.pft.slow = false;
    window.pft.boilOn = true;
    const r = window.pft.fileWar(seed, turns, size);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  }, { seed: +(process.env.SEED ?? 7), turns: +(process.env.TURNS ?? 6), size: process.env.SIZE ?? "quick" });
  await idle(T);
  await page.waitForFunction(() => window.pft.boil?.settled !== false, undefined, { timeout: 30000 });
  const fails = [];
  const check = async (label) => {
    const r = await page.evaluate(() => window.pft.redrawCheck());
    const worst = Object.entries(r).filter(([, v]) => v.bad !== 0);
    console.log(`${label.padEnd(22)} ${Object.entries(r).map(([k, v]) => `${k} ${v.bad}${v.box ? ` @${v.box.join(",")}` : ""}`).join(" | ")}`);
    if (worst.length) fails.push(label);
  };
  // a note showing (its own layer: pencil words, tail and eraser) must match a full redraw too
  const note = (id, kind = "idle") => page.evaluate(({ id, kind }) => {
    const p = window.pft;
    for (let k = 0; k < 400 && !p.bubbles.cur; k++) { p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7); }
    p.poke();
    return p.bubbles.cur?.text ?? null;
  }, { id, kind });
  const some = await page.evaluate(() => window.pft.s.soldiers.find((x) => x.alive && x.owner === window.pft.s.current).id);
  console.log("note:", await note(some));
  await page.waitForTimeout(700);
  await check("bird's-eye + note");
  await page.evaluate(() => window.pft.bubbles.reset());
  // a camp's line arcs along its ring; an exchange puts a reply up beside the line; a streak's lines cut each other short
  const camp = await page.evaluate(() => { const s = window.pft.s; return s.bases.find((b) => b.owner === s.current).id; });
  console.log("shout:", await note(camp, "lunge"));
  await page.waitForTimeout(700);
  await check("bird's-eye + camp shout");
  await page.evaluate(() => window.pft.bubbles.reset());
  console.log("chant:", await note(camp, "chant"));
  await page.waitForTimeout(1500);
  await check("bird's-eye + chant");
  await page.evaluate(() => window.pft.bubbles.reset());
  const pair = await page.evaluate(() => { const s = window.pft.s, m = s.soldiers.filter((x) => x.alive && x.owner === s.current); return [m[0].id, m[1].id]; });
  console.log("chat:", await page.evaluate(([a, b]) => { const p = window.pft; for (let k = 0; k < 4000; k++) { p.bubbles.reset(); p.speak("chat", a, p.wall, 1000 + k * 7, b); if (p.bubbles.cur?.reply) { p.poke(); return p.bubbles.cur.text; } } return null; }, pair));
  await page.waitForTimeout(1900);
  await check("bird's-eye + exchange");
  await page.evaluate(() => window.pft.bubbles.reset());
  // a streak building: link 2 (a man), then link 5 cutting it short (a camp roaring), mid-erase and after
  const streak = (n, v) => page.evaluate(({ n, v, id }) => { const p = window.pft; const b = p.speakStreak(n, id, p.wall, 99 + n, v); p.poke(); return b ? `${b.kind}: ${b.text}` : null; }, { n, v, id: pair[0] });
  console.log("streak 2:", await streak(2, "streakMe"));
  await page.waitForTimeout(900);
  await check("bird's-eye + streak 2");
  console.log("streak 5:", await streak(5, "streakCamp"));
  await page.waitForTimeout(400);
  await check("streak 5, rubbing out");
  await page.waitForTimeout(1500);
  await check("bird's-eye + streak 5");
  await page.evaluate(() => window.pft.bubbles.reset());
  // a botch: the enemy camp's slow clap from its ring, mid-clap and done
  const botch = await page.evaluate(({ id }) => { const p = window.pft, x = p.s.soldiers[id]; for (let k = 0; k < 400; k++) { p.bubbles.reset(); const b = p.speakBotch(2, id, { x: x.x, y: x.y }, p.wall, 300 + k, "botchFoeCamp"); if (b?.slow) { p.poke(); return b.text; } } return null; }, { id: pair[0] });
  console.log("botch:", botch);
  await page.waitForTimeout(1200);
  await check("botch, clapping");
  await page.waitForTimeout(2200);
  await check("botch, clapped");
  await page.evaluate(() => window.pft.bubbles.reset());
  await check("bird's-eye");
  // the lowest of the side to play: leaning in on him, the camps sit at the screen's edges
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 30000 });
  await page.waitForTimeout(300);
  await check("leaning in");
  console.log("note:", await note(me.id));
  await page.waitForTimeout(700);
  await check("leaning in + note");
  await page.evaluate(() => window.pft.bubbles.reset());
  await T.touch("touchStart", [[195, 600]]);
  for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[195, 600 + i * 12]]); await page.waitForTimeout(30); }
  for (let j = 0; j < 60; j++) {
    const ang = Math.PI / 2 + Math.sin(j / 8) * 0.9, pull = 90 + 40 * Math.abs(Math.sin(j / 5));
    await T.touch("touchMove", [[195 + Math.cos(ang) * pull, 600 + Math.sin(ang) * pull]]);
    await page.waitForTimeout(50);
    if (j % 10 === 9) await check(`aiming, sweep ${j + 1}`);
    if (j === 44) await T.shot(`${out}/aiming.png`);
  }
  // and swung right round: sliding sideways turns the sheet under the thumb (a full turn across the screen)
  for (let j = 0; j < 50; j++) {
    await T.touch("touchMove", [[195 + Math.sin(j / 6) * 180, 600 + 100]]);
    await page.waitForTimeout(50);
    if (j % 10 === 9) await check(`aiming, turning ${j + 1}`);
    if (j === 29) await T.shot(`${out}/aiming-turned.png`);
  }
  await T.touch("touchEnd", []);
  if (fails.length) { console.log(`MISMATCH: ${fails.join(", ")}`); process.exitCode = 1; }
  else console.log("all layers match a full redraw");
}

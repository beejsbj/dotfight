// The moments the field announces: last stand, two for one, a lunge chain.
// Bot-v-bot on the core rules, played through the game's own flow (pft.act), until each
// has happened; then a bird's-eye shot while the pencil note is written, and a close look
// at the soldier. THEME=lamplight|blueprint; SEED picks the war.
//   THEME=blueprint SEED=3 node scripts/playtest.mjs moments <url> <outdir>
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  const theme = process.env.THEME ?? "lamplight", seed = +(process.env.SEED ?? 3);
  await page.evaluate((id) => window.pft.theme?.apply(id), theme);
  await page.waitForTimeout(800);
  await page.evaluate((seed) => {
    const p = window.pft;
    p.slow = false; p.boilOn = true;
    const r = p.fileWar(seed, 1); r.mode = { kind: "pnp" }; p.resumeRecord(r);
  }, seed);
  await idle(T);
  await page.waitForTimeout(3200); // the lamp comes on
  const got = new Set();
  const want = ["stand", "twoFor", "chain"];
  for (let turn = 0; turn < 260 && got.size < want.length; turn++) {
    const over = await page.evaluate(() => window.pft.s.phase !== "play");
    if (over) break;
    await page.evaluate(() => { const p = window.pft; p.act(p.botMove(2)); });
    // poll while the flick resolves for an announcement
    for (let k = 0; k < 60; k++) {
      await page.waitForTimeout(100);
      const b = await page.evaluate(() => { const b = window.pft.bubbles.cur; return b?.important ? { kind: b.kind, text: b.text, id: b.id } : null; });
      if (b && !got.has(b.kind)) {
        got.add(b.kind);
        console.log("moment:", JSON.stringify(b), "turn", await page.evaluate(() => window.pft.s.turn));
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${out}/${theme}-${b.kind}-bird.png` });
        const at = await page.evaluate((id) => { const x = window.pft.s.soldiers[id]; return { x: x.x, y: x.y }; }, b.id);
        await page.evaluate(({ at }) => { window.pft.cam.sit(at, 3.0, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, { at });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/${theme}-${b.kind}-close.png` });
        if (b.kind === "twoFor") {
          // the note is rubbed out by now; the "+1" stays until the extra flick is used
          await page.evaluate(() => window.pft.cam.overview?.());
          await page.waitForTimeout(4500);
          await page.screenshot({ path: `${out}/${theme}-twoFor-owed-bird.png` });
          await page.evaluate(({ at }) => { window.pft.cam.sit(at, 3.0, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, { at });
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${out}/${theme}-twoFor-owed-close.png` });
        }
        await page.evaluate(() => window.pft.cam.overview?.());
      }
      if (!(await page.evaluate(() => window.pft.busy))) break;
    }
    await idle(T, 60000).catch(() => {});
    // the persistent marks (rays, chain ring, tally) once the flick is done
    const st = await page.evaluate(() => { const s = window.pft.s; return { chain: s.chain, stand: s.stand, left: s.left }; });
    if (st.chain && !got.has("chain-ring")) {
      got.add("chain-ring"); want.push("chain-ring");
      await page.screenshot({ path: `${out}/${theme}-chain-ring-bird.png` });
      console.log("chain state:", JSON.stringify(st.chain));
    }
  }
  console.log("seen:", [...got].join(", "));
  const s = await page.evaluate(() => ({ turn: window.pft.s.turn, stand: window.pft.s.stand }));
  console.log("end:", JSON.stringify(s));
}

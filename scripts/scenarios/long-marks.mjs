// The long war's pencil notes: a page is built by hand (six shapes a side, the
// same spots as long-bot, mirrored for red), then blue fires one snipe of each
// kind the engine can star (a bank off their cushion, a split out of his prism,
// a ruled line out of his square, a homing turn out of his pentagon), each
// found by searching previews, and each is captured as the ink reaches the
// note, settled at bird's-eye, and leaning in on it. Red hands the pen
// straight back between them.
//   node scripts/playtest.mjs long-marks <url> <outdir>
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  await page.evaluate(() => window.pft.theme?.apply("lamplight"));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const p = window.pft;
    // a record by hand: both sides' bases (blue's as long-bot drags them, red's mirrored), everyone ready
    const r = p.fileWar(11, 1, "long");
    const kit = [["prism", 500, 1250], ["camp", 230, 1250], ["pentagon", 780, 1250], ["square", 250, 1480], ["camp", 760, 1490], ["cushion", 500, 1500]];
    const actions = [];
    for (let i = 0; i < kit.length; i++) {
      const [shape, x, y] = kit[i];
      actions.push({ t: "base", x, y, shape });
      actions.push({ t: "base", x: 1000 - x + 70, y: 1700 - y, shape });
    }
    actions.push({ t: "ready" }, { t: "ready" });
    r.actions = actions;
    r.mode = { kind: "pnp" };
    p.resumeRecord(r);
  });
  await idle(T, 60000);
  await page.waitForTimeout(500);
  await T.shot(`${out}/m0-page.png`);
  // find a snipe of ours whose preview has the event, from a man in the shape it needs (or anyone, for a bank)
  const find = (kind) => page.evaluate((kind) => {
    const p = window.pft, s = p.s;
    const from = { bank: null, split: "prism", rule: "square", home: "pentagon" }[kind];
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && (from === null || s.bases[x.home]?.shape === from && s.bases[x.home].owner === s.current));
    let best = null;
    for (const m of mine) for (let a = -Math.PI; a < Math.PI; a += 0.01) for (const length of [550, 750, 950]) {
      const f = { soldier: m.id, kind: "snipe", angle: a, length, bend: 0, wob: 1 };
      const o = p.preview(f);
      if (!o) continue;
      // a line flicked from inside the square has no rule event: its edge goes at the wall it left by
      const ev = kind === "rule" && o.ruled ? o.events.filter((e) => e.kind === "wall" && e.free && s.bases[e.base].shape === "square") : o.events.filter((e) => e.kind === kind);
      if (!ev.length) continue;
      // one of this kind, on the main line, well inside the page, nobody killed on the way (a kill's snag would blur the beat)
      if (ev.length > 1 || ev[0].branch || o.killed.length > (kind === "home" ? 1 : 0)) continue;
      const end = o.path[o.path.length - 1];
      if (end.x < 90 || end.x > 980 || end.y < 20 || end.y > 1680) continue;
      const d = ev[0].d;
      const score = kind === "bank" ? Math.abs(d - 350) : Math.abs(d - 90); // a bank some way out; the others right at the wall anyway
      if (!best || score < best.score) best = { f, at: ev[0].at, d, score, n: ev.length, killed: o.killed.length };
    }
    return best;
  }, kind);
  for (const kind of ["bank", "split", "rule", "home"]) {
    const st = await T.state();
    if (st.current !== 0) { await page.evaluate(() => window.pft.act({ t: "stop" })); await idle(T, 60000); }
    const plan = await find(kind);
    console.log(kind, JSON.stringify(plan));
    if (!plan) continue;
    // fire it as the flow would: the ink runs, the note goes down as the ink gets there
    await page.evaluate((f) => window.pft.act({ t: "flick", ...f }), plan.f);
    // the ink reaches the note at about d/len of the stroke's time: catch it just after
    const dur = Math.min(900, Math.max(300, 220 + plan.f.length * 0.42));
    await page.waitForTimeout(Math.max(60, (plan.d / plan.f.length) * dur + 120));
    await T.shot(`${out}/m1-${kind}-ink.png`);
    await idle(T, 60000);
    await page.waitForTimeout(400);
    await T.shot(`${out}/m2-${kind}-settled.png`);
    // leaning in on the note
    await page.evaluate((at) => window.pft.cam.sit(at), plan.at);
    await T.wait(() => window.pft.cam.settled, undefined, 60000);
    await page.waitForTimeout(300);
    await T.shot(`${out}/m3-${kind}-lean.png`);
    await page.evaluate(() => window.pft.cam.overview());
    await T.wait(() => window.pft.cam.settled, undefined, 60000);
  }
  const marks = await page.evaluate(() => window.pft.s.marks.filter((m) => m.t === "star").map((m) => `${m.kind}@${m.x | 0},${m.y | 0} h${m.h.toFixed(2)}`));
  console.log("stars on the page:", marks.join("; "));
  await T.shot(`${out}/m4-page.png`);
}

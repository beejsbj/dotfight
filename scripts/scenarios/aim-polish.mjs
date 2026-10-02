// Polish on the turning-page aim (feel/aim-polish): the dial clicks as the page
// turns under the thumb (firmer passing straight ahead), the pen's refill fills
// with the pull while the start mark waits where the thumb went down, and
// after a shot the page holds the shot's way up (slid across so the soldier
// stays on screen) until the ink lands, then faces its player again. Also
// measures the frame cost of a sweep (pft.frames) and shoots a turn frame by
// frame for a GIF. Screenshots at each step.
//   node scripts/playtest.mjs aim-polish <url> <outdir>
import { idle } from "../lib/phone.mjs";

const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); };
const deg = (r) => ((r * 180) / Math.PI).toFixed(1);
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  const feel = await page.evaluate(async () => (await import("/src/rules.ts")).FEEL);
  await page.waitForTimeout(1500); // the cover's lamp comes on first (starting a game at once would cancel it, and every shot would be dark)
  await page.evaluate(() => {
    const r = window.pft.fileWar(7, 6);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  });
  await idle(T);
  console.log(`lamp ${JSON.stringify(await page.evaluate(() => window.pft.frame().lamp.on))}`);
  await page.evaluate(() => { window.pft.slow = false; });
  const pickUp = async (at) => {
    for (let i = 0; i < 4; i++) {
      await T.tap(at.x, at.y, 40);
      const ok = await page.waitForFunction(() => window.pft.selected !== undefined, undefined, { timeout: 5000 }).then(() => true, () => false);
      if (ok) return;
      console.log("pick-up retry", i + 1, JSON.stringify(await T.state()));
    }
    throw new Error("could not pick a soldier up");
  };
  const felt = (ev) => page.evaluate((ev) => window.pft.haptics.felt.filter((f) => f.ev === ev).map((f) => f.arg ?? 0), ev);
  const read = () => page.evaluate(() => {
    const ring = document.querySelector("#cancel-ring");
    return {
      marks: window.pft.s.marks.length, busy: window.pft.busy, selected: window.pft.selected, status: document.querySelector("#status").textContent,
      mark: !ring.hidden, ring: ring.classList.contains("in"), charge: window.pft.frame().pen?.charge,
      tgt: { ...window.pft.cam.tgt }, cur: { ...window.pft.cam.cur },
    };
  });
  const W = 390, x0 = 195, y0 = 520;
  const k = (Math.PI * 2) / (W - 16);
  const moveTo = async (x, y, n = 14, each) => {
    const cur = moveTo.at;
    for (let i = 1; i <= n; i++) {
      await T.touch("touchMove", [[cur[0] + (x - cur[0]) * i / n, cur[1] + (y - cur[1]) * i / n]]);
      await page.waitForTimeout(30);
      if (each) await each(i);
    }
    moveTo.at = [x, y];
  };

  // the lowest of this side's men on the page: far from the page's middle, so a sideways shot would hang him off the screen
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => Math.abs(b.y - 850) - Math.abs(a.y - 850))[0]; });
  const a = await T.world(me.x, me.y);
  await pickUp(a);
  await page.waitForFunction(() => window.pft.cam.settled);
  await page.waitForTimeout(300);
  await T.shot(`${out}/polish-1-picked.png`);
  const before = await read();
  const own = await page.evaluate(() => (window.pft.s.current === 1 ? Math.PI : 0));

  // 1. a turn: the dial clicks every 30 degrees; frame cost of the sweep; frames for a GIF
  moveTo.at = [x0, y0];
  await T.touch("touchStart", [[x0, y0]]);
  await page.waitForTimeout(80);
  await T.touch("touchMove", [[x0 + 12, y0]]); // past the tap slop: the aim begins
  await page.waitForTimeout(80);
  await page.evaluate(() => window.pft.frames(true));
  let frame = 0;
  await moveTo(x0 + 130, y0, 16, async (i) => { if (i % 2 === 0) await T.shot(`${out}/turn-frames/f${String(frame++).padStart(2, "0")}.png`); });
  await page.waitForTimeout(300);
  const fr = await page.evaluate(() => window.pft.frames());
  console.log(`sweep right 130px: script p50 ${fr.script.p50.toFixed(2)}ms p95 ${fr.script.p95.toFixed(2)}ms max ${fr.script.max.toFixed(1)}ms | frame p50 ${fr.p50.toFixed(1)}ms | n ${fr.script.n}`);
  await T.shot(`${out}/polish-2-turning.png`);
  const turned = Math.abs(wrap(before.tgt.rot - (await read()).tgt.rot));
  const clicks = await felt("dial");
  const want = Math.floor((130 - 8) * k / (Math.PI / 6));
  check(clicks.length === want && clicks.every((c) => c === 0), `slid right 130px (${deg(turned)} of turn): ${want} dial clicks, none of them straight-ahead`, `felt ${JSON.stringify(clicks)}`);
  // back past straight ahead: the firmer click
  await moveTo(x0 - 24, y0, 16);
  await page.waitForTimeout(200);
  const back = await felt("dial");
  // the line the thumb sat on doesn't click again; the ones behind it do, and straight ahead last, firmer
  check(back.length === want * 2 && back[back.length - 1] === 1 && back.slice(0, -1).every((c) => c === 0), "back past straight ahead: the clicks come back, the last one firmer", `felt ${JSON.stringify(back)}`);

  // 2. a quarter turn left, then the pull: the pen's refill fills with it
  const xq = x0 - 8 - Math.round((Math.PI / 2) / k);
  await moveTo(xq, y0, 16);
  await moveTo(xq, y0 + 100, 12);
  await page.waitForTimeout(400);
  const r2 = await read();
  const want2 = await page.evaluate(() => window.pft.aim.power);
  check(r2.mark && !r2.ring && want2 > 0 && Math.abs(r2.charge - want2) < 1e-9, "pulled 100px: the start mark stays, the refill fills to the pull's power", `charge ${r2.charge} power ${want2}`);
  await T.shot(`${out}/polish-3-pulled.png`);
  const aimed = await page.evaluate(() => ({ rot: window.pft.cam.tgt.rot, angle: window.pft.aim.angle }));
  check(Math.abs(wrap(aimed.angle - (-(Math.PI / 2 + own) - Math.PI / 2))) < 0.05, "  aimed a quarter turn left", `angle ${deg(aimed.angle)}`);

  // 3. back to the start: the ring firms up and the refill empties
  await moveTo(xq, y0 + 2, 12);
  await page.waitForTimeout(400);
  const r3 = await read();
  check(r3.ring && r3.charge === 0, "back at the start: ring firm, refill empty", JSON.stringify({ ring: r3.ring, charge: r3.charge }));
  await T.shot(`${out}/polish-4-cancel-ring.png`);

  // 4. pull again and let go: the page keeps the shot's way up while the ink runs, he stays on screen, then it faces its player
  await moveTo(xq, y0 + 100, 12);
  await page.waitForTimeout(300);
  const m0 = (await read()).marks;
  await page.evaluate(() => { window.pft.speed = 0.3; });
  // Capture the return operation in the page itself so a sparse polling
  // interval cannot miss the original-player return before hand-over.
  await page.evaluate(async (id) => {
    const p = window.pft, { inkTime } = await import("/src/inkclock.ts");
    window.returnTrace = [];
    window.traceSoldier = id;
    window.originalFace = p.cam.face;
    p.cam.face = function (...args) {
      const r = p.res, result = window.originalFace.apply(this, args), s = p.s.soldiers[id];
      if (r) window.returnTrace.push({ settled: inkTime(p.T-r.t0,r.snags) >= r.dur,
        resActive: true, owner: r.owner, rot: this.tgt.rot, cur: this.cur.rot,
        m: this.cur.m, x: this.toScreen(s.x,s.y).x });
      return result;
    };
  }, me.id);
  await T.touch("touchEnd", []);
  await page.waitForTimeout(150);
  const r4 = await read();
  check(r4.marks > m0 && r4.busy, "let go: the flick fired", `marks ${m0} -> ${r4.marks}`);
  check(Math.abs(wrap(r4.tgt.rot - aimed.rot)) < 0.01 && r4.tgt.m === 1 && r4.tgt.tilt === 0, "  standing up, the page still turned the shot's way", `rot ${deg(r4.tgt.rot)} aimed ${deg(aimed.rot)}`);
  // sample the page's turn against the ink: held the shot's way until the ink has landed (res.settled), then back to the player's own
  const samples = [];
  let shot5 = false, shot6 = false;
  for (let i = 0; i < 80 && (await page.evaluate(() => !!window.pft.res)); i++) {
    samples.push(await page.evaluate((id) => { const s = window.pft.s.soldiers[id], c = window.pft.cam; return { settled: !!window.pft.res?.settled, rot: c.tgt.rot, cur: c.cur.rot, m: c.cur.m, x: c.toScreen(s.x, s.y).x }; }, me.id));
    const last = samples[samples.length - 1];
    if (!shot5 && last.m < 1.4) { shot5 = true; await T.shot(`${out}/polish-5-fired-held.png`); }
    if (shot5 && !shot6 && Math.abs(wrap(last.rot - aimed.rot)) > 0.01) { shot6 = true; await page.waitForTimeout(350); await T.shot(`${out}/polish-6-turning-back.png`); }
    await page.waitForTimeout(50);
  }
  await page.waitForFunction((own) => !window.pft.res || window.returnTrace.some((x) =>
    x.settled && x.resActive && Math.abs(Math.atan2(Math.sin(x.rot-own),Math.cos(x.rot-own))) < .01), own, { timeout: 120000 });
  const returned = await page.evaluate((own) => window.returnTrace.filter((x) =>
    x.owner === window.pft.s.soldiers[window.traceSoldier].owner && x.settled && x.resActive && Math.abs(Math.atan2(Math.sin(x.rot-own),Math.cos(x.rot-own))) < .01), own);
  check(returned.length > 0, "  recorded the original-player return during settled ink before hand-over", `${returned.length} return operations`);
  samples.push(...returned);
  await page.evaluate(() => { window.pft.cam.face = window.originalFace; });
  const running = samples.filter((x) => !x.settled), landed = samples.filter((x) => x.settled);
  check(running.length > 3 && running.every((x) => Math.abs(wrap(x.rot - aimed.rot)) < 0.01), "  and holds it while the ink runs", `${running.length} samples, rot ${running.map((x) => deg(x.rot)).slice(-2).join(", ")}`);
  check(landed.length > 0 && Math.abs(wrap(landed[landed.length - 1].rot - own)) < 0.01, "  then turns back to face its player once the ink has landed", `${landed.length} samples, rot ${landed.map((x) => deg(x.rot)).join(" ")}`);
  // (from leaning on him to the slid-across page view, his screen x runs between two points that are both on screen)
  const stood = running;
  check(stood.length > 0 && stood.every((x) => x.x > 60 && x.x < W - 60), "  the soldier (and his line, straight up from him) stays on screen while it's held", `x ${stood.map((x) => x.x.toFixed(0)).join(" ")} of ${W}`);
  await page.evaluate(() => { window.pft.speed = 1; });
  await idle(T);
  const rot = await page.evaluate(() => window.pft.cam.tgt.rot);
  console.log(`page turn after the hand-over: ${deg(rot)} (pnp: the other player's turn now)`);

  if (results.includes(false)) { console.log("FAILED"); process.exitCode = 1; } else console.log("all checks passed");
}

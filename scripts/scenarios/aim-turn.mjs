// The page turns under your thumb while aiming (feel/aim-turn): slide sideways
// and the sheet swings so the shot always points up the screen; pull straight
// down for power. Checks the geometry (the aim angle projects straight up the
// screen), aims straight backwards, and fires. Screenshots at each step.
//   node scripts/playtest.mjs aim-turn <url> <outdir>
import { idle } from "../lib/phone.mjs";

const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); };
const deg = (r) => ((r * 180) / Math.PI).toFixed(1);
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  await page.evaluate(() => {
    const r = window.pft.fileWar(7, 6);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  });
  await idle(T);
  // a touch on a soldier picks him up; on a loaded box the first one can land before the page is ready, so try again
  const pickUp = async (at) => {
    for (let i = 0; i < 4; i++) {
      await T.tap(at.x, at.y, 40);
      const ok = await page.waitForFunction(() => window.pft.selected !== undefined, undefined, { timeout: 5000 }).then(() => true, () => false);
      if (ok) return;
      console.log("pick-up retry", i + 1, JSON.stringify(await T.state()));
      await T.shot(`${out}/pickup-miss-${i}.png`);
    }
    throw new Error("could not pick a soldier up");
  };
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const a = await T.world(me.x, me.y);
  await pickUp(a);
  await page.waitForFunction(() => window.pft.cam.settled);
  await page.waitForTimeout(300);
  const settle = async () => { await page.waitForTimeout(700); };
  // is the aim straight up the screen? (page point 120 along the aim, vs the soldier)
  const up = () => page.evaluate((id) => {
    const p = window.pft, s = p.s.soldiers[id], an = p.aim.angle;
    const q0 = p.cam.toScreen(s.x, s.y), q1 = p.cam.toScreen(s.x + Math.cos(an) * 120, s.y + Math.sin(an) * 120);
    return { dx: q1.x - q0.x, dy: q1.y - q0.y, angle: an, rot: p.cam.cur.rot, tgt: p.cam.tgt.rot, py: q0.y, fy: q0.y / innerHeight };
  }, [me.id]);
  const read = () => page.evaluate(() => ({ marks: window.pft.s.marks.length, busy: window.pft.busy, selected: window.pft.selected, status: document.querySelector("#status").textContent, mark: !document.querySelector("#cancel-ring").hidden, ring: document.querySelector("#cancel-ring").classList.contains("in") }));
  const before = await read();
  // straight up the screen for this player (the other seat holds the page upside down)
  const base = await page.evaluate(() => -(Math.PI / 2 + (window.pft.s.current === 1 ? Math.PI : 0)));
  console.log(`player ${await page.evaluate(() => window.pft.s.current)}: forward is ${deg(base)}`);
  const W = 390, x0 = 195, y0 = 520;
  const k = (Math.PI * 2) / (W - 16);
  const moveTo = async (x, y, n = 14) => {
    const cur = moveTo.at;
    for (let i = 1; i <= n; i++) { await T.touch("touchMove", [[cur[0] + (x - cur[0]) * i / n, cur[1] + (y - cur[1]) * i / n]]); await page.waitForTimeout(30); }
    moveTo.at = [x, y];
  };
  moveTo.at = [x0, y0];
  await T.touch("touchStart", [[x0, y0]]);
  await page.waitForTimeout(80);

  // 1. slide left a quarter of the width: the aim swings that way (counter-clockwise), the page turns under it
  await moveTo(x0 - 98, y0);
  await settle();
  let u = await up();
  const want1 = base - (98 - 8) * k;
  check(Math.abs(wrap(u.angle - want1)) < 0.02, "slid left 98px: aim swung left", `angle ${deg(u.angle)} want ${deg(want1)}`);
  check(Math.abs(u.dx) < 1, "  and points straight up the screen", `dx ${u.dx.toFixed(2)} dy ${u.dy.toFixed(1)}`);
  await T.shot(`${out}/turn-1-left.png`);

  // 2. slide right of centre
  await moveTo(x0 + 98, y0, 24);
  await settle();
  u = await up();
  check(Math.abs(wrap(u.angle - (base + 90 * k))) < 0.02 && Math.abs(u.dx) < 1, "slid right 98px: aim swung right, still straight up", `angle ${deg(u.angle)} dx ${u.dx.toFixed(2)}`);
  await T.shot(`${out}/turn-2-right.png`);

  // 3. all the way left from the middle of the screen: straight backwards, toward your own side
  await moveTo(1, y0, 30);
  await settle();
  u = await up();
  check(Math.abs(wrap(u.angle - (base + Math.PI))) < 0.12 && Math.abs(u.dx) < 1, "thumb to the left edge: aim straight backwards, page upside down", `angle ${deg(u.angle)} dx ${u.dx.toFixed(2)}`);
  await T.shot(`${out}/turn-3-backwards.png`);
  await moveTo(1, y0 + 100, 10);
  await page.waitForTimeout(500);
  await T.shot(`${out}/turn-4-backwards-pulled.png`);
  u = await up();
  check(u.dx < 1 && u.dx > -1, "backwards and pulled down: aim still straight up the screen", `dx ${u.dx.toFixed(2)}`);

  // 4. back to the middle, pull straight down, fire
  await moveTo(x0, y0 + 20, 30);
  await moveTo(x0, y0 + 112, 12);
  await settle();
  u = await up();
  check(Math.abs(wrap(u.angle - base)) < 0.02, "back at the middle: aim is forward again", `angle ${deg(u.angle)}`);
  check(Math.abs(wrap(u.tgt - (base === -Math.PI / 2 ? 0 : Math.PI))) < 0.05 && Math.abs(u.dx) < 1, "  page is facing its player", `rot ${deg(u.tgt)}`);
  check(u.fy > 0.68 && u.fy < 0.8, "soldier is pinned low on the screen", `fy ${u.fy.toFixed(2)}`);
  await T.shot(`${out}/turn-5-forward-pulled.png`);
  await page.evaluate(() => { window.pft.speed = 0.3; });
  await T.touch("touchEnd", []);
  await page.waitForTimeout(600);
  await T.shot(`${out}/turn-6-fired.png`);
  const done = await read();
  check(done.marks > before.marks && done.busy, "let go: the flick fired", `marks ${before.marks} -> ${done.marks}`);
  await page.evaluate(() => { window.pft.speed = 1; });
  await idle(T);
  const rot = await page.evaluate(() => window.pft.cam.tgt.rot);
  console.log(`page turn after the hand-over: ${deg(rot)}`);

  // 5. cancel still works after turning: turn, pull, back off, let go
  const me2 = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => window.pft.cam.toScreen(b.x, b.y).y - window.pft.cam.toScreen(a.x, a.y).y)[0]; });
  const b2 = await T.world(me2.x, me2.y);
  await pickUp(b2);
  await page.waitForFunction(() => window.pft.cam.settled);
  const m1 = (await read()).marks;
  moveTo.at = [x0, y0];
  await T.touch("touchStart", [[x0, y0]]);
  await moveTo(x0 + 80, y0 + 100, 14);
  await moveTo(x0 + 80, y0 + 2, 14);
  await page.waitForTimeout(400);
  const r5 = await read();
  check(r5.mark && r5.ring, "turned, pulled, backed off: ring firm", JSON.stringify(r5));
  await T.shot(`${out}/turn-7-cancel-ring.png`);
  await T.touch("touchEnd", []);
  await page.waitForTimeout(600);
  const r6 = await read();
  check(r6.marks === m1 && !/too soft/.test(r6.status) && !r6.mark, "let go there: cancelled quietly", `marks ${m1} -> ${r6.marks}`);
  const rot6 = await page.evaluate(() => ({ tgt: window.pft.cam.tgt.rot, want: window.pft.s.current === 1 ? Math.PI : 0 }));
  check(Math.abs(wrap(rot6.tgt - rot6.want)) < 0.05, "camera returned to this player's own way up", `rot ${deg(rot6.tgt)}`);

  if (results.includes(false)) { console.log("FAILED"); process.exitCode = 1; } else console.log("all checks passed");
}

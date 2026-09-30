// Aiming only happens leaned in, under the fog. A second finger while a soldier
// is in hand (real two-finger CDP touches) must put him down: no aim survives a
// pinch out to bird's-eye, nothing fires when the fingers lift, and a fresh
// drag at bird's-eye starts no aim. TURNED=1 slides the page round first
// (needs the turning-page camera, feel/aim-turn).
//   [TURNED=1] node scripts/playtest.mjs aim-pinch <url> <outdir>
import { idle } from "../lib/phone.mjs";

const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); };

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  const turned = process.env.TURNED === "1";
  const tag = turned ? "turned" : "plain";
  await page.evaluate(() => {
    const r = window.pft.fileWar(7, 6);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  });
  await idle(T);
  const read = () => page.evaluate(() => ({
    marks: window.pft.s.marks.length, busy: window.pft.busy, selected: window.pft.selected, aim: !!window.pft.aim,
    m: window.pft.cam.tgt.m, tilt: window.pft.cam.tgt.tilt, rot: window.pft.cam.tgt.rot, cur: window.pft.s.current,
    mark: !document.querySelector("#cancel-ring").hidden, status: document.querySelector("#status").textContent,
  }));
  const pickUp = async (at) => {
    for (let i = 0; i < 4; i++) {
      await T.tap(at.x, at.y, 40);
      if (await page.waitForFunction(() => window.pft.selected !== undefined, undefined, { timeout: 5000 }).then(() => true, () => false)) return;
    }
    throw new Error("could not pick a soldier up");
  };
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => window.pft.cam.toScreen(b.x, b.y).y - window.pft.cam.toScreen(a.x, a.y).y)[0]; });
  await pickUp(await T.world(me.x, me.y));
  await page.waitForFunction(() => window.pft.cam.settled);
  await page.waitForTimeout(300);
  const before = await read();
  check(before.selected !== undefined && before.m >= 1.9 && before.tilt > 0.3, "picked up and leaned in", `m ${before.m} tilt ${before.tilt}`);

  // finger one pulls (and, if asked, slides the page round)
  await T.touch("touchStart", [[195, 520]]);
  if (turned) for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[195 + i * 9, 520]]); await page.waitForTimeout(30); }
  const x1 = turned ? 285 : 195;
  for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [[x1, 520 + i * 14]]); await page.waitForTimeout(30); }
  await page.waitForTimeout(500);
  const aiming = await read();
  check(aiming.aim && aiming.mark, "finger one is aiming", aiming.status);
  if (turned) check(Math.abs(aiming.rot - before.rot) > 0.3, "  and the page has turned", `rot ${before.rot.toFixed(2)} -> ${aiming.rot.toFixed(2)}`);
  await T.shot(`${out}/pinch-${tag}-1-aiming.png`);

  // finger two lands, then both pull together: a pinch out to the bird's-eye view
  const a1 = [x1, 632], b1 = [330, 300];
  await T.touch("touchStart", [a1, b1]);
  await page.waitForTimeout(120);
  const two = await read();
  check(!two.aim && two.selected === undefined && !two.mark, "second finger down: aim gone, soldier put down", JSON.stringify({ aim: two.aim, sel: two.selected, mark: two.mark }));
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    await T.touch("touchMove", [[a1[0] + (200 - a1[0]) * t, a1[1] + (520 - a1[1]) * t], [b1[0] + (220 - b1[0]) * t, b1[1] + (470 - b1[1]) * t]]);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(700);
  const pinched = await read();
  check(!pinched.aim && pinched.selected === undefined && pinched.tilt === 0, "pinched out: bird's-eye, nothing in hand, no aim", `m ${pinched.m.toFixed(2)} tilt ${pinched.tilt}`);
  if (turned) check(Math.abs(Math.sin(pinched.rot - (pinched.cur === 1 ? Math.PI : 0))) < 0.05, "  page faces its player again", `rot ${pinched.rot.toFixed(2)}`);
  await T.shot(`${out}/pinch-${tag}-2-pinched.png`);
  await T.touch("touchEnd", []);
  await page.waitForTimeout(500);
  const up = await read();
  check(up.marks === before.marks && !up.busy && !up.aim, "fingers up: nothing fired", `marks ${before.marks} -> ${up.marks}`);

  // a fresh one-finger drag on the zoomed-out page must not start an aim
  // (from the spot on screen farthest from all of this player's men: touching one would pick him up, which is fine, and leans in)
  const spot = await page.evaluate(() => {
    const p = window.pft, mine = p.s.soldiers.filter((x) => x.alive && x.owner === p.s.current).map((x) => p.cam.toScreen(x.x, x.y));
    let best = [195, 300], bd = -1;
    for (let x = 40; x < 360; x += 40) for (let y = 220; y < 560; y += 40) {
      const d = Math.min(...mine.map((q) => Math.hypot(q.x - x, q.y - y)));
      if (d > bd) { bd = d; best = [x, y]; }
    }
    return best;
  });
  await T.touch("touchStart", [spot]);
  for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[spot[0], spot[1] + i * 12]]); await page.waitForTimeout(30); }
  const drag = await read();
  check(!drag.aim && drag.selected === undefined && !drag.mark, "a drag at bird's-eye starts no aim", JSON.stringify({ aim: drag.aim, sel: drag.selected }));
  await T.touch("touchEnd", []);
  await page.waitForTimeout(400);
  const end = await read();
  check(end.marks === before.marks && !end.busy, "and fires nothing", `marks ${end.marks}`);
  await T.shot(`${out}/pinch-${tag}-3-after.png`);


  if (results.includes(false)) { console.log("FAILED"); process.exitCode = 1; } else console.log("all checks passed");
}

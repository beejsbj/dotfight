// Cancelling an aim (feel/aim-cancel): pick a soldier up, pull, slide the thumb
// back to where it started (a pencil ring appears), let go: nothing fired, no
// "too soft" text, he stays picked up. Then the "put down" button stands him up.
//   node scripts/playtest.mjs aim-cancel <url> <outdir>
import { idle } from "../lib/phone.mjs";

const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); };

export default async function (T, out) {
  const { page } = T;
  page.setDefaultTimeout(120000);
  await page.evaluate(() => {
    const r = window.pft.fileWar(7, 6);
    r.mode = { kind: "pnp" };
    window.pft.resumeRecord(r);
  });
  await idle(T);
  const read = () => page.evaluate(() => ({
    marks: window.pft.s.marks.length, turn: window.pft.s.turn, selected: window.pft.selected, busy: window.pft.busy,
    status: document.querySelector("#status").textContent, mark: !document.querySelector("#cancel-ring").hidden, ring: document.querySelector("#cancel-ring").classList.contains("in"),
    acts: document.querySelector("#acts").textContent, tilt: window.pft.cam.tgt.tilt, aim: !!window.pft.aim,
    felt: window.pft.haptics.felt.map((f) => f.ev),
  }));
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForFunction(() => window.pft.selected !== undefined);
  await page.waitForTimeout(200);
  await page.waitForFunction(() => window.pft.cam.settled);
  await page.waitForTimeout(300);
  const picked = await read();
  check(picked.selected !== undefined && /put down/.test(picked.acts), "picked up: 'put down' is offered", picked.acts);
  await T.shot(`${out}/cancel-1-picked.png`);

  const x0 = 195, y0 = 600;
  await T.touch("touchStart", [[x0, y0]]);
  for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[x0, y0 + i * 9]]); await page.waitForTimeout(30); }
  await page.waitForTimeout(250);
  const pulled = await read();
  check(pulled.aim && pulled.mark && !pulled.ring, "pulled 90px: start mark shown, not firm", pulled.status);
  await T.shot(`${out}/cancel-2-pulled.png`);
  for (let i = 9; i >= 0; i--) { await T.touch("touchMove", [[x0, y0 + i * 9 * 0.1]]); await page.waitForTimeout(30); }
  await page.waitForTimeout(250);
  const back = await read();
  check(back.ring && back.status === "let go to cancel", "thumb back at the start: ring and 'let go to cancel'", `ring=${back.ring} "${back.status}"`);
  check(back.felt.includes("brink"), "a brink tick was felt", back.felt.join(","));
  await T.shot(`${out}/cancel-3-ring.png`);
  await T.touch("touchEnd", []);
  await page.waitForTimeout(500);
  const done = await read();
  check(done.marks === picked.marks && done.turn === picked.turn && !done.busy, "released there: nothing fired", `marks ${picked.marks} -> ${done.marks}`);
  check(!/too soft/.test(done.status), "no failure text", `"${done.status}"`);
  check(!done.ring && !done.mark && !done.aim, "mark gone, aim cleared");
  check(done.selected === picked.selected, "he is still picked up");
  await T.shot(`${out}/cancel-4-cancelled.png`);

  await page.click('#acts button[data-act="down"]');
  await page.waitForTimeout(400);
  const down = await read();
  check(down.selected === undefined && down.tilt === 0 && !/put down/.test(down.acts), "'put down' stands him up: back to the overview", `tilt ${down.tilt}`);
  await T.shot(`${out}/cancel-5-put-down.png`);

  if (results.includes(false)) { console.log("FAILED"); process.exitCode = 1; } else console.log("all checks passed");
}

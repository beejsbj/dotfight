// The real-time prototype at the table (BJS-458, docs/realtime.md): a Quick
// game started from the cover's "real time", camps drawn by touch for both
// sides (blue on the near half, red on the far half, the page never turning),
// both sides arrange and press done (red through the turned-round note), and
// then both pens flick at once: two touch sequences in one CDP stream, so the
// two pulls overlap. Then the engine's own flicks to the end, timed on the
// table's clock, through to the dawn and the drawer.
import { idle, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()), await page.evaluate(() => ({ table: window.pft.table.active, clock: Math.round(window.pft.table.clock), wet: window.pft.table.wet.length })));
  const W = 390, H = 844;
  await page.waitForTimeout(1200);
  await T.shot(`${out}/r0-cover.png`);
  await page.click("[data-size=quick]");
  await page.evaluate(() => document.querySelector("[data-a=table]").click());
  await page.waitForTimeout(900);
  // blue near the bottom of the page, red near the top: the page lies flat between them
  const blue = [[300, 1400], [650, 1500], [500, 1150]];
  const red = [[300, 250], [650, 350], [500, 600]];
  for (let i = 0; i < 3; i++) {
    for (const [x, y] of [blue[i], red[i]]) { await idle(T); await placeAt(T, x, y); }
    if (i === 0) { await page.waitForTimeout(500); await T.shot(`${out}/r1-red-draws.png`); }
  }
  await idle(T, 60000);
  await T.shot(`${out}/r2-blue-arranges.png`);
  await page.click("[data-act=ready]");
  await idle(T, 60000);
  await page.waitForTimeout(300);
  await T.shot(`${out}/r3-red-arranges.png`);
  // red presses done on the far strip's turned-round button
  await page.click("#table-far .go");
  await T.wait(() => window.pft.table.active, undefined, 20000);
  await page.waitForTimeout(600);
  await log("play");
  await T.shot(`${out}/r4-table.png`);

  // both pens at once: each side picks up a man and pulls back toward itself
  // `avoid`: men the other pen is holding or shooting at, so the two flicks don't cross each other out before they're let go
  const pick = async (p, avoid = []) => page.evaluate(([p, avoid]) => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === p && !avoid.includes(x.id) && window.pft.s.rt && !(window.pft.s.rt.wet[x.id] > window.pft.table.clock));
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== p && !avoid.includes(x.id));
    let best = null, bd = Infinity;
    for (const m of mine) for (const f of foes) { const d = Math.hypot(m.x - f.x, m.y - f.y); if (d < bd) { bd = d; best = { me: m, foe: f, d }; } }
    const a = window.pft.cam.toScreen(best.me.x, best.me.y), b = window.pft.cam.toScreen(best.foe.x, best.foe.y);
    return { me: best.me, foe: best.foe, at: a, aim: Math.atan2(b.y - a.y, b.x - a.x) };
  }, [p, avoid]);
  const b = await pick(0), r = await pick(1, [b.me.id, b.foe.id]);
  // a pull is the opposite way to the flick: blue pulls toward the bottom, red toward the top
  const pullOf = (q, px) => [q.at.x - Math.cos(q.aim) * px, q.at.y - Math.sin(q.aim) * px];
  const pb = pullOf(b, 120), pr = pullOf(r, 120);
  await T.touch("touchStart", [[b.at.x, b.at.y], [r.at.x, r.at.y]]);
  await page.waitForTimeout(120);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await T.touch("touchMove", [[b.at.x + (pb[0] - b.at.x) * t, b.at.y + (pb[1] - b.at.y) * t], [r.at.x + (pr[0] - r.at.x) * t, r.at.y + (pr[1] - r.at.y) * t]]);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(500);
  await T.shot(`${out}/r5-both-aiming.png`);
  const sides = await page.evaluate(() => window.pft.table.sides);
  console.log("both aiming:", JSON.stringify(sides.map((q) => ({ p: q.p, sel: q.sel, aiming: q.aiming, power: +q.power.toFixed(2), live: q.live }))));
  await T.touch("touchEnd", []);
  await page.waitForTimeout(450);
  await T.shot(`${out}/r6-both-ink.png`);
  await page.waitForTimeout(900);
  await T.shot(`${out}/r7-wet.png`);
  await log("two flicks");
  const after = await page.evaluate(() => ({ flicks: window.pft.s.actions.filter((a) => a.t === "flick").map((a) => ({ who: window.pft.s.soldiers[a.soldier].owner, kind: a.kind, ms: Math.round(a.ms) })), wet: window.pft.table.wet, meter: [window.pft.table.meter(0), window.pft.table.meter(1)].map((m) => +m.toFixed(2)) }));
  console.log("after:", JSON.stringify(after));
  if (after.flicks.length < 2) throw new Error(`expected both pens to have flicked, got ${after.flicks.length}`);
  // a wet man can't be picked up again: tap the one who just flicked
  const wetOne = await page.evaluate((id) => window.pft.cam.toScreen(window.pft.s.soldiers[id].x, window.pft.s.soldiers[id].y), b.me.id);
  await T.tap(wetOne.x, wetOne.y, 60);
  await page.waitForTimeout(200);
  const wetSaid = await page.evaluate(() => document.querySelector("#table .strip.near .say").textContent);
  console.log("tapping the wet man, the strip says:", wetSaid);
  if (!/wet/.test(wetSaid)) throw new Error("tapping a wet man should say so");
  // the meter: three more snipes in quick succession; the pen (about 2.6 of 3 after its first) pays for two and the third is refused
  for (let k = 0; k < 3; k++) {
    const b2 = await pick(0, [b.me.id]);
    const pb2 = pullOf(b2, 120);
    await T.drag(b2.at.x, b2.at.y, pb2[0], pb2[1], { hold: 40, ms: 120, steps: 6 });
    await page.waitForTimeout(80);
  }
  await T.shot(`${out}/r8-out-of-ink.png`);
  const inkSaid = await page.evaluate(() => ({ said: document.querySelector("#table .strip.near .say").textContent, meter: +window.pft.table.meter(0).toFixed(2), flicks: window.pft.s.actions.filter((a) => a.t === "flick").length }));
  console.log("after three quick snipes:", JSON.stringify(inkSaid));
  if (!/out of ink/.test(inkSaid.said)) throw new Error("the third quick snipe should be out of ink");

  // fast-forward: both pens flick through the table whenever they can, on the table's clock
  await page.evaluate(() => { window.pft.speed = 6; });
  for (let k = 0; k < 400; k++) {
    const st = await T.state();
    if (st.phase === "over" || st.screen !== "game") break;
    await page.evaluate(() => {
      const s = window.pft.s, t = window.pft.table;
      for (const p of [0, 1]) {
        const mine = s.soldiers.filter((x) => x.alive && x.owner === p && !(s.rt.wet[x.id] > t.clock));
        const foes = s.soldiers.filter((x) => x.alive && x.owner !== p);
        if (!mine.length || !foes.length) continue;
        const me = mine[(s.turn * 7 + p) % mine.length], foe = foes[(s.turn * 3) % foes.length];
        const kind = s.turn % 4 === 1 ? "lunge" : "snipe";
        const R = s.rules.realtime.meter;
        if (t.meter(p) < (kind === "snipe" ? R.snipe : R.lunge)) continue;
        const ang = Math.atan2(foe.y - me.y, foe.x - me.x) + (Math.random() - 0.5) * 0.06;
        t.flick(p, { soldier: me.id, kind, angle: ang, length: kind === "snipe" ? 1800 : Math.min(600, Math.hypot(foe.x - me.x, foe.y - me.y) + 20), bend: (Math.random() - 0.5) * 0.04, wob: (Math.random() * 2 ** 32) >>> 0 }, 0.7);
      }
    });
    await page.waitForTimeout(120);
  }
  await log("over?");
  await page.evaluate(() => { window.pft.speed = 1; });
  await page.waitForTimeout(1500);
  await T.shot(`${out}/r9-dawn.png`);
  await page.waitForSelector("#sheet:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(600);
  await T.shot(`${out}/ra-over.png`);
  // the record: timed, replayable, in the drawer
  const rec = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("pft:drawer") || "[]"); return d[0] && { v: d[0].v, realtime: !!d[0].rules.realtime, flicks: d[0].actions.filter((a) => a.t === "flick").length, stamped: d[0].actions.filter((a) => a.t === "flick").every((a) => typeof a.ms === "number"), turns: d[0].turns }; });
  console.log("filed:", JSON.stringify(rec));
  await page.click("[data-a=look]");
  await page.waitForTimeout(600);
  await T.shot(`${out}/rb-page.png`);
  await page.click("#menu-btn");
  await page.waitForTimeout(900);
  await page.click("[data-a=drawer]");
  await page.waitForTimeout(700);
  await T.shot(`${out}/rc-drawer.png`);
  await page.click(".pages .page");
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.pft.speed = 4; });
  await page.click("[data-v=replay]");
  await page.waitForTimeout(3000);
  await T.shot(`${out}/rd-replay.png`);
  await log("replaying");
  void W; void H;
}

// The lesson (src/tutorial.ts), played through with real touches: "learn the
// game" on the cover, then each step done the way its note asks (aimed with
// the thumb: a slide to turn the page, a pull for power, let go), until the
// battle is won. Every step is screenshotted as its note comes on, and the
// run asserts each step completed and the lesson was recorded as taught.
//   node scripts/playtest.mjs tutorial <url> <outdir>
import { idle } from "../lib/phone.mjs";

const TURN_DEAD = 8, MIN_PULL = 16;

export default async function (T, out) {
  const { page } = T;
  const log = async (m) => console.log(m, JSON.stringify(await T.state()));
  const hint = () => page.evaluate(() => window.pft.lessonHint());
  const state = () => page.evaluate(() => {
    const s = window.pft.s;
    return { phase: s.phase, current: s.current, turn: s.turn, chain: !!s.chain, left: s.left, sent: s.sent, winner: s.winner, blue: s.soldiers.filter((x) => x.alive && x.owner === 0).length, red: s.soldiers.filter((x) => x.alive && x.owner === 1).length };
  });
  const soldiers = () => page.evaluate(() => window.pft.s.soldiers.map((x) => ({ id: x.id, owner: x.owner, alive: x.alive, x: x.x, y: x.y, convoy: x.convoy })));
  const bases = () => page.evaluate(() => window.pft.s.bases.map((b) => ({ id: b.id, owner: b.owner, x: b.x, y: b.y, r: b.r })));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  // Pick up soldier `id` and flick him: a world angle and length, through the thumb.
  async function flick(id, kind, angle, length) {
    await page.evaluate(() => document.querySelector("#page-btn").click());
    await idle(T);
    await page.evaluate((k) => document.querySelector(`#kind [data-kind="${k}"]`)?.click(), kind);
    const me = await page.evaluate((id) => window.pft.s.soldiers[id], id);
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 40);
    await T.wait(() => window.pft.cam.settled && window.pft.selected !== undefined, undefined, 60000);
    await page.waitForTimeout(150);
    const { W, H, rules, rot } = await page.evaluate(() => ({ W: innerWidth, H: innerHeight, rules: window.pft.s.rules, rot: window.pft.cam.cur.rot }));
    // the aim: forward is straight up the screen; sliding sideways turns the page, pulling down sets the power
    const turnK = (Math.PI * 2) / Math.max(200, W - TURN_DEAD * 2);
    let turn = angle + Math.PI / 2 + rot;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const dx = Math.sign(turn) * (Math.abs(turn) / turnK + TURN_DEAD);
    const sx = 195, sy = 600;
    const span = Math.max(110, Math.min(240, H - 24 - sy));
    const power = Math.sqrt(Math.max(0, Math.min(1, (length - rules.reach.min) / (rules.reach.max - rules.reach.min))));
    const dy = MIN_PULL + power * (span - MIN_PULL) + 1;
    await T.touch("touchStart", [[sx, sy]]);
    await page.waitForTimeout(60);
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[sx + (dx * i) / 10, sy + (i > 8 ? 2 : 0)]]); await page.waitForTimeout(16); }
    for (let i = 1; i <= 10; i++) { await T.touch("touchMove", [[sx + dx, sy + (dy * i) / 10]]); await page.waitForTimeout(16); }
    await T.touch("touchEnd", []);
    await page.waitForTimeout(200);
  }

  // What a pupil does for each step: the note's ask, aimed steadily.
  async function move(step) {
    const st = await state();
    const h = await hint();
    const men = await soldiers();
    const bs = await bases();
    const mine = men.filter((x) => x.alive && x.owner === 0 && x.convoy === undefined);
    const foes = men.filter((x) => x.alive && x.owner === 1);
    const outside = foes.filter((x) => !bs.some((b) => b.owner === 1 && dist(b, x) <= b.r * 1.05));
    const b3 = bs[4];
    const nearestMan = (to) => mine.sort((a, b) => dist(a, to) - dist(b, to))[0];
    // a man in the open with a short sure line; a man in a camp with a hard one that reaches through its wall
    const nearest = async () => {
      const open = outside.sort((a, b) => dist(a, b3) - dist(b, b3))[0];
      if (open) { const m = nearestMan(open); return flick(m.id, "snipe", angleTo(m, open), dist(m, open) + 100); }
      const t = foes.sort((a, b) => dist(a, b3) - dist(b, b3))[0];
      const m = nearestMan(t);
      await flick(m.id, "snipe", angleTo(m, t), 2000);
    };
    if (st.chain) { await page.click("#acts [data-act=stop]"); return; }
    switch (step) {
      case "flick": case "snipe": case "two":
        if (h.row) return flick(h.row.soldier, "snipe", h.row.angle, h.row.length);
        return nearest();
      case "wall": { const r1 = bs[1]; const m = nearestMan(r1); return flick(m.id, "snipe", angleTo(m, r1), 1500); }
      case "lunge":
        if (h.lunge) return flick(h.lunge.soldier, "lunge", h.lunge.angle, h.lunge.length);
        return nearest();
      case "ring": {
        // from a man far enough back: a line is never shorter than the shortest pull (200)
        if (!h.ring) return nearest();
        const m = mine.filter((x) => dist(x, h.ring) >= 230).sort((a, b) => dist(a, h.ring) - dist(b, h.ring))[0] ?? nearestMan(h.ring);
        return flick(m.id, "lunge", angleTo(m, h.ring), dist(m, h.ring));
      }
      case "send": {
        // the send: the button, then a drag from one camp to another, then how many
        await page.click("#acts [data-act=send]");
        await page.waitForTimeout(400);
        await T.wait(() => window.pft.cam.settled);
        const from = await T.world(bs[0].x, bs[0].y), to = await T.world(bs[4].x, bs[4].y);
        await T.drag(from.x, from.y, to.x, to.y, { steps: 14, hold: 100, ms: 400 });
        await page.waitForTimeout(300);
        await T.shot(`${out}/send-how-many.png`);
        await page.click("#acts [data-act=n][data-n='2']");
        await page.waitForTimeout(300);
        return;
      }
      default: return nearest();
    }
  }

  try {
    await page.waitForTimeout(1400);
    await T.shot(`${out}/00-cover.png`);
    await page.getByText("learn the game").click();
    await idle(T);
    await page.waitForTimeout(600);
    await log("lesson begins");
    const t0 = Date.now();
    const seen = [];
    let lastStep = -1, stuck = 0, moves = 0;
    for (; moves < 90; moves++) {
      await idle(T, 60000);
      const st = await state();
      if (st.phase === "over") break;
      const h = await hint();
      if (!h) throw new Error("no lesson on");
      if (h.index !== lastStep) {
        // a new note: let it be written, then a look at the page from above
        await page.evaluate(() => document.querySelector("#page-btn").click());
        await page.waitForTimeout(1900);
        await T.wait(() => window.pft.cam.settled);
        await T.shot(`${out}/${String(seen.length + 1).padStart(2, "0")}-${h.step}.png`);
        seen.push(h.step);
        lastStep = h.index;
        stuck = 0;
        console.log(`step ${h.index} ${h.step}`, JSON.stringify(st));
      } else if (++stuck > (h.step === "stand" ? 40 : 8)) throw new Error(`stuck on ${h.step}`);
      if (st.current !== 0) { await page.waitForTimeout(200); continue; }
      const n0 = await page.evaluate(() => window.pft.s.actions.length);
      await move(h.step);
      // what the player's own move did, before Dawood-bot replies
      await T.wait((n0) => window.pft.s.actions.length > n0 && window.pft.lessonLast && !window.pft.res, n0, 60000);
      const last = await page.evaluate(() => { const l = window.pft.lessonLast; return l && "f" in l ? `${l.who}:${l.f.kind} ${l.f.length.toFixed(0)} kills ${l.o.killed.length}${l.o.lost ? " lost" : ""}${l.o.movedTo ? ` to ${l.o.movedTo.x.toFixed(0)},${l.o.movedTo.y.toFixed(0)}` : ""}` : JSON.stringify(l); });
      console.log(`  ${h.step}: ${last}`);
      await page.waitForTimeout(300);
    }
    await log(`over? ${((Date.now() - t0) / 1000).toFixed(0)}s of play`);
    const taught = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("pft:taught:")).sort());
    console.log("steps seen:", seen.join(" > "));
    console.log("taught:", taught.join(" "));
    const want = ["flick", "snipe", "two", "wall", "open", "lunge", "shot", "ring", "send", "road", "stand"];
    const missing = want.filter((k) => !taught.includes(`pft:taught:lesson:${k}`));
    if (missing.length) throw new Error(`steps not learned: ${missing.join(", ")}`);
    if (!taught.includes("pft:taught:tutorial")) throw new Error("the lesson wasn't recorded as taught");
    await page.waitForSelector("#sheet:not([hidden])", { timeout: 30000 });
    await page.waitForTimeout(600);
    await T.shot(`${out}/90-over.png`);
    await page.click("[data-a=new]");
    await page.waitForTimeout(1200);
    await T.shot(`${out}/91-cover-after.png`);
    await page.click("[data-a=drawer]");
    await page.waitForTimeout(700);
    await T.shot(`${out}/92-drawer.png`);
    console.log(`OK: ${moves} moves, ${seen.length} steps`);
  } catch (e) {
    await log("FAILED " + e.message.split("\n")[0]);
    await T.shot(`${out}/99-fail.png`);
    throw e;
  }
}

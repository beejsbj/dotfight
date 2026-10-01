// Headless can't feel anything, so this reads the dev log of haptics fired
// (window.pft.haptics.felt) through real touch input: the settings toggle, then
// a war against the bot until one of our flicks crosses someone out, and
// asserts the sequence felt for that flick.
import { idle, placeAt } from "../lib/phone.mjs";

const felt = (T) => T.page.evaluate(() => window.pft.haptics.felt.map((f) => ({ ev: f.ev, arg: f.arg, t: f.t })));
const fail = (m) => { throw new Error(m); };

async function tapText(T, text) {
  const box = await T.page.getByText(text, { exact: false }).first().boundingBox();
  await T.tap(box.x + box.width / 2, box.y + box.height / 2);
  await T.page.waitForTimeout(150);
}

export default async function (T, out) {
  const { page } = T;
  const backend = await page.evaluate(() => window.pft.haptics.backend);
  const mode = await page.evaluate(() => window.pft.haptics.mode);
  console.log("backend:", backend, mode ?? "");
  // iOS tap mode (?haptics=tap): each real tick is the hidden switch toggling. Count them.
  const tapMode = mode === "tap";
  await page.evaluate(() => {
    window.__ticks = [];
    document.addEventListener("change", (e) => {
      if (e.target.matches?.("label[data-haptic] > input")) window.__ticks.push(e.target.closest("button") ? "button" : "page");
    }, true);
  });
  const ticks = () => page.evaluate(() => window.__ticks.slice());

  // --- settings: on by default, a toggle that sticks ---------------------------
  await page.waitForTimeout(1200);
  await tapText(T, "settings");
  if (tapMode) {
    const rig = await page.evaluate(() => ({
      buttons: document.querySelectorAll("button").length,
      dressed: document.querySelectorAll("button > label[data-haptic]").length,
      wrapped: !!document.querySelector("#over").parentElement.matches("label[data-haptic]"),
    }));
    if (rig.dressed !== rig.buttons || !rig.wrapped) fail(`tap-mode labels missing: ${JSON.stringify(rig)}`);
    if ((await ticks()).join() !== "button") fail(`expected a tick per button tap, got ${await ticks()}`);
  }
  if (!(await page.locator('[data-set="haptics"].on').count())) fail("haptics toggle missing or off by default");
  await T.shot(`${out}/h01-settings.png`);
  await tapText(T, "haptics");
  const off = await page.evaluate(() => ({ on: window.pft.haptics.enabled, stored: localStorage.getItem("pft:haptics") }));
  if (off.on || off.stored !== "0") fail(`toggle off didn't stick: ${JSON.stringify(off)}`);
  const before = (await felt(T)).length;
  await tapText(T, "sound"); // a button press while off: nothing felt
  await tapText(T, "sound");
  if ((await felt(T)).length !== before) fail("felt something while haptics were off");
  if (tapMode && (await ticks()).length !== 1) fail(`the switch ticked while off (or not for the settings tap): ${await ticks()}`);
  if (tapMode && (await page.evaluate(() => localStorage.getItem("pft:muted"))) !== "1") fail("one tap toggled sound twice (a forwarded click leaked)");
  await tapText(T, "haptics");
  const on = await page.evaluate(() => ({ on: window.pft.haptics.enabled, stored: localStorage.getItem("pft:haptics") }));
  if (!on.on || on.stored !== "1") fail(`toggle on didn't stick: ${JSON.stringify(on)}`);
  const afterOn = await felt(T);
  if (afterOn.at(-1)?.ev !== "tap") fail("no tick on switching haptics back on");
  await tapText(T, "done");
  const ticksBefore = (await ticks()).filter((w) => w === "page").length;
  console.log("settings ok:", afterOn.map((f) => f.ev).join(" "));

  // --- a war, until a flick of ours crosses someone out -------------------------
  await tapText(T, "play Dawood-bot");
  if ((await felt(T)).at(-1)?.ev !== "turn") fail("opening the book wasn't felt as a page turn");
  // our three camps (the bot's land at random, so try spots until each one takes)
  const ours = () => page.evaluate(() => window.pft.s.bases.filter((b) => b.owner === 0).length);
  const spots = [[300, 1300], [700, 1450], [520, 1050], [250, 1550], [750, 1150], [250, 1000], [760, 900], [500, 1580]];
  while ((await T.state()).phase === "setup") {
    await idle(T);
    if ((await T.state()).phase !== "setup") break;
    const n = await ours();
    for (const [x, y] of spots) { await placeAt(T, x, y); await page.waitForTimeout(250); if ((await ours()) > n) break; }
    if ((await ours()) === n) fail("couldn't place a camp");
  }
  await idle(T);
  const camps = (await felt(T)).filter((f) => f.ev === "settle").length;
  if (camps !== 3) fail(`expected a settle for each of our 3 camps, felt ${camps}`);

  // the Core rules stop to arrange the camps before the first turn: take them as drawn
  await T.wait(() => window.pft.s.phase === "position", undefined, 60000);
  await idle(T, 60000);
  await page.click("[data-act=ready]");
  await T.wait(() => window.pft.s.phase === "play", undefined, 60000);

  let seq = null, tries = 0;
  while (!seq && tries < 8) {
    await idle(T, 60000);
    const st = await T.state();
    if (st.phase !== "play") break;
    tries++;
    // our soldier nearest any enemy, aimed straight at him with a soft, steady shot
    const pick = await page.evaluate(() => {
      const s = window.pft.s;
      let best = null;
      for (const a of s.soldiers) if (a.alive && a.owner === 0) for (const b of s.soldiers) if (b.alive && b.owner === 1) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!best || d < best.d) best = { d, me: a, them: b };
      }
      return best;
    });
    const mark = (await felt(T)).length;
    const marks = (await T.state()).marks;
    await page.evaluate(() => document.querySelector('#kind [data-kind="snipe"]')?.click());
    const a = await T.world(pick.me.x, pick.me.y);
    await T.tap(a.x, a.y, 40);
    await T.wait(() => window.pft.cam.settled, undefined, 5000);
    // The thumb does two things (main.ts updateAim): sliding sideways turns the page to the aim,
    // pulling straight down sets the power. Turn to the nearest enemy, then pull through every
    // detent to the game's own full pull (FEEL.maxPullPx, so a retuned rule can't leave this short
    // of the last one), hold until the hand shakes, and ease to a soft shot that still reaches him.
    const plan = await page.evaluate(({ me, them, d }) => {
      const { FEEL, cam, s } = window.pft;
      const TAU = Math.PI * 2, fwd = -Math.PI / 2; // bot war: our page is never turned
      let delta = Math.atan2(them.y - me.y, them.x - me.x) - fwd;
      delta -= TAU * Math.round(delta / TAU);
      const eff = delta / (TAU / Math.max(200, cam.W - 16));
      const { min, max, curve } = s.rules.reach;
      const power = Math.pow(Math.min(1, Math.max(0, (d + 80 - min) / (max - min))), 1 / curve);
      return { dx: eff + Math.sign(eff || 1) * 8, full: FEEL.maxPullPx, soft: FEEL.minPullPx + Math.max(0.2, power) * (FEEL.maxPullPx - FEEL.minPullPx) };
    }, pick);
    const sx = 195, sy = 480; // room below to pull the full distance on a 390x844 phone
    await T.touch("touchStart", [[sx, sy]]);
    await page.waitForTimeout(60);
    for (let i = 1; i <= 6; i++) { await T.touch("touchMove", [[sx + (plan.dx * i) / 6, sy]]); await page.waitForTimeout(30); }
    const at = (px) => [sx + plan.dx, sy + px];
    for (let i = 1; i <= 16; i++) { await T.touch("touchMove", [at((i * plan.full) / 16)]); await page.waitForTimeout(60); }
    await page.waitForTimeout(700);
    for (let i = 1; i <= 8; i++) { await T.touch("touchMove", [at(plan.full - (i * (plan.full - plan.soft)) / 8)]); await page.waitForTimeout(20); }
    await T.touch("touchEnd", []);
    await T.wait(() => !window.pft.res, undefined, 15000);
    const s = await page.evaluate((n) => window.pft.s.marks.slice(n).filter((m) => m.t === "cross" && m.kind === "kill").length, marks);
    const mine = (await felt(T)).slice(mark);
    console.log(`flick ${tries}: ${s} crossed out; felt ${mine.map((f) => f.ev + (f.arg !== undefined ? `(${+f.arg.toFixed?.(2) || f.arg})` : "")).join(" ")}`);
    if (s > 0) seq = { kills: s, felt: mine };
  }
  if (!seq) fail("no kill in 8 flicks");
  if (tapMode) {
    // 3 camps drawn by a lift and a pick-up tap per flick tick the page; the drags never do
    const page_ = (await ticks()).filter((w) => w === "page").length - ticksBefore;
    console.log(`tap mode: page ticked ${page_} times for 3 camps and ${tries} pick-ups`);
    if (page_ !== 3 + tries) fail(`expected ${3 + tries} page ticks, got ${page_}`);
  }
  await T.shot(`${out}/h02-after-kill.png`);

  // --- the sequence felt for the killing flick ------------------------------------
  const evs = seq.felt.map((f) => f.ev);
  const idx = (ev) => evs.indexOf(ev);
  const order = ["pickup", "notch", "wobble", "flick", "kill"];
  for (const ev of order) if (idx(ev) < 0) fail(`never felt "${ev}": ${evs.join(" ")}`);
  for (let i = 1; i < order.length; i++) if (idx(order[i]) < idx(order[i - 1])) fail(`"${order[i]}" before "${order[i - 1]}": ${evs.join(" ")}`);
  const notches = seq.felt.filter((f) => f.ev === "notch");
  if (notches.length < 4) fail(`expected a ratchet of notches, felt ${notches.length}`);
  if (!notches.some((f) => f.arg >= 1)) fail("never felt the full-power detent");
  if (evs.filter((e) => e === "wobble").length !== 1) fail("wobble should be felt exactly once");
  const kills = seq.felt.filter((f) => f.ev === "kill" || f.ev === "over");
  if (kills.length !== seq.kills) fail(`${seq.kills} crossed out but ${kills.length} knocks felt`);
  kills.forEach((k, i) => { if (k.arg !== i + 1) fail(`cross ${i + 1} felt as kill(${k.arg})`); });
  // the knock lands with the cross being drawn, well after the release
  const flickT = seq.felt[idx("flick")].t;
  if (kills[0].t - flickT < 100) fail(`the first knock came ${kills[0].t - flickT}ms after release: before the ink could reach anyone`);
  // the line ends on its landing, or (a kill) on the camp's cheer that follows the last cross
  if (!["land", "over", "turn", "cheer"].includes(evs.at(-1))) fail(`the line's end wasn't felt: ${evs.join(" ")}`);
  // nothing ever closer together than the gate allows, unless it outranks
  const gaps = seq.felt.slice(1).map((f, i) => f.t - seq.felt[i].t);
  console.log(`ok: ${seq.kills} kill(s), ${notches.length} notches, gaps ${gaps.join(",")}ms`);
  console.log("HAPTICS PASS");
}

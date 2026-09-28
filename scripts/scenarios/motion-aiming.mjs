// Motion aiming (BJS-459), all three levels, through the real settings and real
// touches, with the phone's sensors played by the dev simulator
// (window.pft.sensors dispatches DeviceOrientation/DeviceMotion events into the
// same listeners a phone's would reach):
//   1. tilt nudge: a pull aimed a few degrees off, tilted onto the target, flicked
//   2. steady hand: a charged pull held with a steady hand, then a shaky one; wobble measured
//   3. pen falcon: raise, point, hold still, wrist-snap; then lowering and tapping to cancel
// Asserts each outcome, checks the page replays from its record, and records
// WebM + GIF clips (CDP screencast through ffmpeg) and stills into <out>.
// Usage: node scripts/playtest.mjs motion-aiming http://localhost:5173/ docs/shots/motion-aim
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { idle as idle0, placeAt } from "../lib/phone.mjs";

// The test guard gives Chrome one CPU and no GPU: frames can take seconds. The
// game clock only advances 50 ms a frame, so the waits between turns run fast
// (speed 4), and everything the player does runs at speed 1.
async function idle(T) {
  await T.page.evaluate(() => { window.pft.speed = 4; });
  await idle0(T, 240000);
  await T.page.evaluate(() => { window.pft.speed = 1; });
}

const results = [];
function check(ok, what, detail = "") {
  results.push({ ok, what, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
}
const deg = (r) => ((r * 180) / Math.PI).toFixed(1);
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

// Clips are encoded at the end, so ffmpeg never stalls the scenario mid-war.
const clips = [];
function encode(out) {
  for (const { dir, name, n } of clips) {
    const ff = (args) => execFileSync("ffmpeg", ["-nostdin", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, ...args]);
    ff(["-vf", "fps=24,scale=390:-2", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "42", "-pix_fmt", "yuv420p", `${out}/${name}.webm`]);
    ff(["-vf", "fps=10,scale=270:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", `${out}/${name}.gif`]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`clip ${name}: ${n} frames -> ${name}.webm, ${name}.gif`);
  }
}

// A clip of what the screen shows, from Chrome's screencast, made into WebM and GIF.
async function clip(T, out, name) {
  const { cdp } = T;
  const frames = [];
  const onFrame = async ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 585, maxHeight: 1266, everyNthFrame: 1 });
  return async function stop() {
    await cdp.send("Page.stopScreencast");
    cdp.off("Page.screencastFrame", onFrame);
    if (frames.length < 2) return console.log(`clip ${name}: no frames`);
    const dir = `${out}/frames-${name}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    let list = "";
    frames.forEach((f, i) => {
      writeFileSync(`${dir}/${String(i).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
      const dur = i + 1 < frames.length ? Math.max(0.01, frames[i + 1].t - f.t) : 0.6;
      list += `file '${dir}/${String(i).padStart(4, "0")}.jpg'\nduration ${dur.toFixed(3)}\n`;
    });
    list += `file '${dir}/${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
    writeFileSync(`${dir}/list.txt`, list);
    clips.push({ dir, name, n: frames.length });
  };
}

export default async function (T, out) {
  const { page } = T;
  const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  const sim = (fn, ...args) => page.evaluate(([fn, args]) => window.pft.sensors[fn](...args), [fn, args]);
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // Settings, the way a player gets there. Levels are keyed by name.
  async function settings(want, still) {
    await page.click("#menu-btn").catch(() => {});
    await page.waitForTimeout(500);
    await page.click("[data-a=settings]");
    await page.waitForTimeout(400);
    for (const [lvl, on] of Object.entries(want)) {
      const isOn = await ev((l) => document.querySelector(`[data-set="m:${l}"]`)?.classList.contains("on"), lvl);
      if (isOn !== on) await page.click(`[data-set="m:${lvl}"]`);
      await page.waitForTimeout(150);
    }
    if (still) await shot(still);
    await page.click(".card [data-a=back]");
    await page.waitForTimeout(300);
    const resume = await page.$("[data-a=resume]");
    if (resume) { await resume.click(); await page.waitForTimeout(900); }
  }

  // Our soldier with the nearest enemy, and that enemy.
  const duel = () => ev(() => {
    const s = window.pft.s;
    let best = null;
    for (const a of s.soldiers) if (a.owner === 0 && a.alive) for (const b of s.soldiers) if (b.owner === 1 && b.alive) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!best || d < best.d) best = { a, b, d };
    }
    return best;
  });

  // Pick him up by touch, and wait for the camera to sit down behind him.
  async function pickUp(me) {
    const p = await T.world(me.x, me.y);
    await T.tap(p.x, p.y, 40);
    await T.wait(() => window.pft.cam.settled, undefined, 60000);
    await page.waitForTimeout(150);
    // the tap takes whoever is nearest the finger: aim from the soldier actually picked up
    return ev(() => window.pft.s.soldiers[window.pft.selected]);
  }

  // Start a pull (thumb held down) that points world angle `ang` with `px` of pull.
  async function pullToward(me, ang, px) {
    const a = await T.world(me.x, me.y);
    const t = await T.world(me.x + Math.cos(ang) * 400, me.y + Math.sin(ang) * 400);
    const sa = Math.atan2(t.y - a.y, t.x - a.x);
    const sx = 195, sy = 640;
    await T.touch("touchStart", [[sx, sy]]);
    await page.waitForTimeout(60);
    for (let i = 1; i <= 12; i++) {
      await T.touch("touchMove", [[sx - Math.cos(sa) * px * (i / 12), sy - Math.sin(sa) * px * (i / 12)]]);
      await page.waitForTimeout(22);
    }
  }

  const flicks = () => ev(() => window.pft.s.flicks.length);
  const lastFlick = () => ev(() => window.pft.s.flicks.at(-1));
  const crossed = () => ev(() => window.pft.s.marks.filter((m) => m.t === "cross" && m.kind === "kill" && m.owner === 0).length);

  try {
    await page.waitForTimeout(1200);
    await ev(() => { window.pft.slow = true; }); // the path a struggling phone takes
    // a phone: one reading and the settings know there are sensors
    await sim("orient", { alpha: 0, beta: 40, gamma: 0 });
    await page.click("[data-a=settings]");
    await page.waitForTimeout(400);
    const rows = await ev(() => [...document.querySelectorAll("[data-set^='m:']")].map((b) => b.dataset.set));
    check(rows.length === 3, "settings show the three motion levels once sensors are seen", rows.join(","));
    await page.click("[data-set='m:nudge']");
    await page.waitForTimeout(200);
    const sens = await ev(() => document.querySelectorAll("[data-sens^='nudge:']").length);
    check(sens === 3, "a level switched on offers its own sensitivity");
    await shot("00-settings");
    await page.click(".card [data-a=back]");
    await page.waitForTimeout(300);

    // a war with Dawood-bot
    await page.getByText("play Dawood-bot").click();
    await page.waitForTimeout(900);
    for (const [x, y] of [[300, 1300], [700, 1450], [520, 1050]]) { await idle(T); await placeAt(T, x, y); await page.waitForTimeout(300); }
    await idle(T);
    await page.waitForTimeout(600);

    // --- 1. tilt nudge ---------------------------------------------------------------
    {
      let { a: me, b: foe } = await duel();
      me = await pickUp(me);
      const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x);
      await sim("orient", { alpha: 0, beta: 40, gamma: 0 }); // how he holds it when the pull starts
      const stop = await clip(T, out, "1-nudge");
      await pullToward(me, toFoe - 0.09, 80); // the thumb is about 5° off
      await page.waitForTimeout(250);
      const before = await ev(() => window.pft.aim);
      await shot("1a-nudge-thumb");
      await sim("sweep", { gamma: 14 }, 600); // tilt the phone right
      await sim("hold", 300);
      const after = await ev(() => window.pft.aim);
      await shot("1b-nudge-tilted");
      const n = wrap(after.angle - after.thumb);
      check(Math.abs(wrap(before.angle - before.thumb)) < 0.005, "no tilt, no nudge", `${deg(before.angle - before.thumb)}°`);
      check(n > 0.07 && n < 0.13, "tilting right trims the aim clockwise by a few degrees", `${deg(n)}°`);
      check(Math.abs(wrap(after.angle - toFoe)) < Math.abs(wrap(before.angle - toFoe)), "the nudge carried the aim onto the target", `off by ${deg(wrap(before.angle - toFoe))}° then ${deg(wrap(after.angle - toFoe))}°`);
      const n0 = await flicks();
      await T.touch("touchEnd", []);
      await T.wait(() => !window.pft.res, undefined, 180000); // watch the ink land
      await stop();
      const f = await lastFlick();
      check((await flicks()) === n0 + 1, "the nudged pull fired a flick");
      check(Math.abs(wrap(f.angle - after.angle)) < 0.08, "the flick went where the nudged aim pointed (within release error)", `flick ${deg(f.angle)}°, aim ${deg(after.angle)}°, thumb ${deg(after.thumb)}°`);
      await idle(T);
    }

    // --- 2. steady hand -------------------------------------------------------------
    await settings({ nudge: false, steady: true });
    await idle(T);
    const wobbles = {};
    for (const [hand, noise] of [["steady", 0.4], ["shaky", 40]]) {
      let { a: me, b: foe } = await duel();
      me = await pickUp(me);
      const stop = await clip(T, out, `2-${hand}`);
      await pullToward(me, Math.atan2(foe.y - me.y, foe.x - me.x), 150); // full power: the wobble grows
      // hold the charged pull; the gyro says how the hand is doing
      // hold the charged pull, the gyro saying how the hand is doing, until the wobble has grown (game clock)
      const t0 = await ev(() => window.pft.T);
      const hold = sim("hold", 600000, noise);
      await T.wait((t0) => window.pft.T > t0 + 2300, t0, 180000);
      let max = 0, steadyF = 0;
      const t1 = await ev(() => window.pft.T);
      for (let i = 0; i < 400; i++) {
        const a = await ev(() => window.pft.aim);
        max = Math.max(max, Math.abs(a.wobble));
        steadyF = a.steady;
        if ((await ev(() => window.pft.T)) > t1 + 1000) break; // a second of game time: every swing of the wobble
        await page.waitForTimeout(30);
      }
      await shot(`2-${hand}`);
      await ev(() => window.pft.sensors.halt());
      await hold;
      wobbles[hand] = { max, steadyF };
      const n0 = await flicks();
      await T.touch("touchEnd", []);
      await T.wait(() => !window.pft.res, undefined, 180000); // watch the ink land
      await stop();
      check((await flicks()) === n0 + 1, `the ${hand} hand's pull fired a flick`, `wobble factor ${steadyF.toFixed(2)}, peak wobble ${deg(max)}°`);
      await idle(T);
    }
    check(wobbles.shaky.max > 3 * wobbles.steady.max, "a shaky hand wobbles far more than a steady one",
      `${deg(wobbles.steady.max)}° vs ${deg(wobbles.shaky.max)}°, ×${(wobbles.shaky.max / wobbles.steady.max).toFixed(1)}`);

    // --- 3. pen falcon ----------------------------------------------------------------
    await settings({ steady: false, gun: true }, "3-settings");
    await idle(T);
    {
      let { a: me, b: foe } = await duel();
      await sim("orient", { alpha: 0, beta: 30, gamma: 0 }); // lying loose in the hand
      const stop = await clip(T, out, "3-pen-falcon");
      me = await pickUp(me);
      const g0 = await ev(() => window.pft.gun);
      check(!!g0, "tapping a soldier raises the phone (gun hold on)");
      await shot("3a-raised");
      await sim("sweep", { beta: 80 }, 450); // lift it up, like pointing a torch
      const fwd = (await ev(() => window.pft.gun)).fwd;
      const want = wrap(Math.atan2(foe.y - me.y, foe.x - me.x) - fwd);
      // swing a little past him, then settle back on
      await sim("sweep", { alpha: -((want * 180) / Math.PI) - 12 }, 650);
      await sim("sweep", { alpha: -((want * 180) / Math.PI) }, 350);
      await shot("3b-pointing");
      await sim("hold", 500);
      const g1 = await ev(() => window.pft.gun);
      await shot("3c-armed");
      check(g1.armed === 1, "holding still arms it (the sight closes)");
      check(Math.abs(wrap(g1.delta - want)) < 0.03, "the aim followed the phone onto the enemy", `wanted ${deg(want)}°, sight at ${deg(g1.delta)}°`);
      const n0 = await flicks(), k0 = await crossed();
      await sim("snap", 380); // a moderate snap: a full-power shot is the least accurate, by the rules
      await page.waitForTimeout(250);
      await shot("3d-fired");
      await T.wait(() => !window.pft.res, undefined, 180000); // watch the ink land
      await stop();
      const f = await lastFlick();
      check((await flicks()) === n0 + 1 && (await ev(() => !window.pft.gun)), "a wrist snap fired, and the phone came down");
      check(Math.abs(wrap(f.angle - (fwd + g1.delta))) < 0.1, "the shot went where the sight was, not where the snap swung", `flick ${deg(f.angle)}°, sight ${deg(fwd + g1.delta)}°`);
      const k = (await crossed()) - k0;
      // ink on the page, passing the enemy it was aimed at. A hit isn't guaranteed: a
      // flick's hidden release error (1-3°) is the game's rule, sensor or thumb.
      const ink = await ev(([id, fx, fy]) => {
        const st = window.pft.s.marks.filter((m) => m.t === "stroke").at(-1);
        const me = window.pft.s.soldiers[id];
        let miss = Infinity;
        for (let i = 1; i < st.pts.length; i++) {
          const a = st.pts[i - 1], b = st.pts[i], vx = b.x - a.x, vy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((fx - a.x) * vx + (fy - a.y) * vy) / (vx * vx + vy * vy || 1)));
          miss = Math.min(miss, Math.hypot(a.x + vx * t - fx, a.y + vy * t - fy));
        }
        return { miss, d: Math.hypot(fx - me.x, fy - me.y) };
      }, [f.soldierId, foe.x, foe.y]);
      check(f.length > 700 && ink.miss < ink.d * 0.06, "the shot landed ink, passing close to the enemy it was aimed at",
        `${ink.miss.toFixed(0)} units off a soldier ${ink.d.toFixed(0)} away (a hit is within ~10); crossed out ${k}`);
      await shot("3e-landed");
      await idle(T);
    }
    // lowering the phone puts it down; so does a tap
    {
      const { a: me } = await duel();
      await sim("orient", { alpha: 0, beta: 30, gamma: 0 });
      const stop = await clip(T, out, "3-cancel");
      await pickUp(me);
      await sim("sweep", { beta: 80 }, 450);
      await sim("hold", 450);
      await sim("sweep", { beta: 15 }, 900);
      await sim("hold", 300);
      const st = await ev(() => ({ gun: !!window.pft.gun, sel: window.pft.selected, status: document.querySelector("#status").textContent }));
      await shot("3f-lowered");
      check(!st.gun && st.sel !== undefined, "lowering the phone ends the gun hold; the soldier stays picked up", st.status);
      const p = await T.world(me.x, me.y);
      await T.tap(p.x, p.y, 40); // tap him again: raise
      await page.waitForTimeout(300);
      const up = await ev(() => !!window.pft.gun);
      await T.tap(330, 330, 40); // tap the paper: put the phone down
      await page.waitForTimeout(400);
      const st2 = await ev(() => ({ gun: !!window.pft.gun, sel: window.pft.selected }));
      check(up && !st2.gun && st2.sel !== undefined, "tapping him raises it again; a tap on the paper puts it down, and only that");
      await page.waitForTimeout(400);
      await stop();
    }

    // --- replay -----------------------------------------------------------------------------
    const same = await ev(() => {
      const again = window.pft.unfile(window.pft.file());
      return JSON.stringify(again.marks) === JSON.stringify(window.pft.s.marks) && JSON.stringify(again.soldiers) === JSON.stringify(window.pft.s.soldiers);
    });
    check(same, "the page replays from its record to the same marks and soldiers", `${await flicks()} flicks`);
  } catch (e) {
    console.log("FAILED " + e.message.split("\n")[0]);
    await shot("99-fail");
    results.push({ ok: false, what: e.message });
  }
  encode(out);
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
  if (bad.length) process.exitCode = 1;
}

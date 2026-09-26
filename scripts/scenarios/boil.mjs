// The line boil on a mid-war page. A still can't show boil, so this captures
// short sequences with the boil's clock pinned and stepped one boil frame
// (125ms) at a time, however slow the screenshots are, and stitches each into
// a GIF and a WebM with ffmpeg if it's there:
//   birdseye  the whole page from above
//   leanin    leaning in over one of your men to aim
//   camp      a manned camp, close and flat
//   kill      a living man boils, is shot, and holds still under his cross
// Then checks that prefers-reduced-motion switches the boil off.
//   node scripts/playtest.mjs boil <url> /tmp/boil
import { spawnSync } from "node:child_process";
import { idle } from "../lib/phone.mjs";

const STEP = 125; // ms: one boil frame at 8 fps

export default async function (T, out) {
  const { page } = T;
  const frames = +(process.env.FRAMES ?? 12);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.pft.slow = false; const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  await page.waitForTimeout(600);
  console.log("boil on:", await page.evaluate(() => window.pft.boilOn));

  let clock = 0;
  const burst = async (name, n, clip) => {
    for (let i = 0; i < n; i++) {
      await page.evaluate((ms) => { window.pft.boilClock = ms; }, clock);
      clock += STEP;
      await page.waitForTimeout(80); // a couple of animation frames: the tick lands
      await page.screenshot({ path: `${out}/${name}-${String(i).padStart(2, "0")}.png`, clip });
    }
    stitch(out, name, clip ? 360 : 390);
  };

  await burst("birdseye", frames);

  // leaning in over one of the current side's men
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 5000 });
  await page.waitForTimeout(300);
  await burst("leanin", frames);
  await page.evaluate(() => document.querySelector("#page-btn").click());
  await idle(T);

  // the fullest living camp, close and flat
  const camp = await page.evaluate(() => {
    const s = window.pft.s;
    let best = s.bases[0], bn = -1;
    for (const b of s.bases) {
      const n = s.soldiers.filter((x) => x.alive && x.owner === b.owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r).length;
      if (n > bn) { bn = n; best = b; }
    }
    window.pft.cam.sit({ x: best.x, y: best.y }, 3.2, 0, 0.5); window.pft.cam.snap(); window.pft.poke();
    return best;
  });
  await page.waitForTimeout(400);
  const c = await T.world(camp.x, camp.y);
  await burst("camp", frames, { x: Math.round(c.x - 150), y: Math.round(c.y - 150), width: 300, height: 300 });

  // a kill: the man boils, is crossed out, and holds still
  const shot = await page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    const me = mine[0], foe = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    return { me, foe };
  });
  const rot = await page.evaluate((f) => { window.pft.cam.sit({ x: f.x, y: f.y }, 3.2, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); return window.pft.cam.cur.rot; }, shot.foe);
  await page.waitForTimeout(400);
  const k = await T.world(shot.foe.x, shot.foe.y);
  const clip = { x: Math.round(k.x - 110), y: Math.round(k.y - 110), width: 220, height: 220 };
  const half = frames >> 1;
  for (let i = 0; i < half; i++) {
    await page.evaluate((ms) => { window.pft.boilClock = ms; }, clock);
    clock += STEP;
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/kill-${String(i).padStart(2, "0")}.png`, clip });
  }
  await page.evaluate(({ me, foe }) => {
    window.pft.act({ soldierId: me.id, kind: "shoot", angle: Math.atan2(foe.y - me.y, foe.x - me.x), length: 1800, bend: 0 });
  }, shot);
  await idle(T);
  // the camera went up to watch the ink and the page turned for the other
  // side: come back to him, facing the same way as before
  await page.evaluate(({ f, rot }) => {
    const c = window.pft.cam;
    c.tgt = { ...c.tgt, rot }; c.sit({ x: f.x, y: f.y }, 3.2, 0, 0.5); c.snap(); window.pft.poke();
  }, { f: shot.foe, rot });
  await page.waitForTimeout(400);
  const dead = await page.evaluate((id) => !window.pft.s.soldiers[id].alive, shot.foe.id);
  console.log("kill landed:", dead);
  for (let i = half; i < frames; i++) {
    await page.evaluate((ms) => { window.pft.boilClock = ms; }, clock);
    clock += STEP;
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/kill-${String(i).padStart(2, "0")}.png`, clip });
  }
  stitch(out, "kill", 330);
  await page.evaluate(() => { window.pft.boilClock = undefined; });

  // prefers-reduced-motion: no boil at all, everything is ink on the page
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForFunction(() => window.pft);
  await page.evaluate(() => { const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  await page.waitForTimeout(500);
  const rm = await page.evaluate(() => ({ on: window.pft.boilOn, empty: window.pft.boil.c.style.visibility === "hidden", ticks: window.pft.stageStats.boil }));
  console.log("reduced motion:", JSON.stringify(rm));
  await T.shot(`${out}/reduced-motion.png`);
}

// frames -> GIF (palette per clip, 8 fps) and WebM, when ffmpeg is about
function stitch(out, name, w) {
  const ff = (args) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const src = ["-framerate", "8", "-i", `${out}/${name}-%02d.png`];
  ff([...src, "-vf", `scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none`, "-loop", "0", `${out}/${name}.gif`]);
  ff([...src, "-vf", `scale=${w * 2}:-2:flags=lanczos`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", `${out}/${name}.webm`]);
  console.log("stitched", name);
}

// The line boil on a mid-war page. A still can't show boil, so this captures
// short sequences with the boil's clock pinned and stepped one boil frame at a
// time (8 fps), however slow the screenshots are, and stitches each into a GIF
// and a WebM with ffmpeg if it's there:
//   birdseye                 the whole page from above (the boldest boil)
//   birdseye-camp            one camp at bird's-eye, blown up 3x to see
//   leanin, leanin-camp      leaning in over one of your men to aim, and his camp (the gentlest)
//   camp                     a manned camp, close and flat
//   soldiers-leanin          soldiers' dots at leaning-in size
//   kill                     a living man boils, is shot, and holds still under his cross
// Then checks that prefers-reduced-motion switches the boil off.
//   node scripts/playtest.mjs boil <url> /tmp/boil
import { spawnSync } from "node:child_process";
import { idle } from "../lib/phone.mjs";

const FPS = 8;
const STEP = 1000 / FPS;

export default async function (T, out) {
  const { page } = T;
  const frames = +(process.env.FRAMES ?? 12);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.pft.slow = false; const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  let clock = 10000;
  // let the clock run until the boil's sprites are all made (they're made a few a tick)
  const settle = async () => {
    for (let k = 0; k < 300; k++) {
      await page.evaluate((ms) => { window.pft.boilClock = ms; }, clock);
      clock += STEP;
      await page.waitForTimeout(30);
      if (k > 2 && await page.evaluate(() => window.pft.boil.settled)) break;
    }
  };
  await settle();
  await page.waitForTimeout(600);
  console.log("boil on:", await page.evaluate(() => window.pft.boilOn));

  const burst = async (name, n, clip, w) => {
    for (let i = 0; i < n; i++) {
      await page.evaluate((ms) => { window.pft.boilClock = ms; }, clock);
      clock += STEP;
      await page.waitForTimeout(80); // a couple of animation frames: the tick lands
      await page.screenshot({ path: `${out}/${name}-${String(i).padStart(2, "0")}.png`, clip });
    }
    stitch(out, name, w ?? (clip ? Math.max(240, Math.min(360, clip.width * 1.2)) : 390));
  };
  const flat = async (at, m = 3.2) => {
    await page.evaluate(({ at, m }) => { window.pft.cam.sit(at, m, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, { at, m });
    await page.waitForTimeout(400);
    const c = await T.world(at.x, at.y);
    return (half) => ({ x: Math.round(c.x - half), y: Math.round(c.y - half), width: half * 2, height: half * 2 });
  };

  // bird's-eye: the whole page, and one camp blown up to see what changes
  await burst("birdseye", frames);
  const bird = await page.evaluate(() => {
    const s = window.pft.s;
    let best = s.bases[0], bn = -1;
    for (const b of s.bases) {
      const n = s.soldiers.filter((x) => x.alive && x.owner === b.owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r).length;
      if (n > bn) { bn = n; best = b; }
    }
    return best;
  });
  const bc = await T.world(bird.x, bird.y);
  await burst("birdseye-camp", frames, { x: Math.round(bc.x - 45), y: Math.round(bc.y - 45), width: 90, height: 90 }, 270);

  // leaning in over one of the current side's men
  const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((a, b) => b.y - a.y)[0]; });
  const home = await page.evaluate((me) => window.pft.s.bases.find((b) => Math.hypot(b.x - me.x, b.y - me.y) <= b.r * 1.05), me);
  const a = await T.world(me.x, me.y);
  await T.tap(a.x, a.y, 40);
  await page.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 5000 });
  await settle();
  await burst("leanin", frames);
  const h = await T.world(home.x, home.y);
  await burst("leanin-camp", frames, { x: Math.round(h.x - 90), y: Math.round(h.y - 90), width: 180, height: 180 });
  await page.evaluate(() => document.querySelector("#page-btn").click());
  await idle(T);

  // the fullest living camp, close and flat; then its soldiers at leaning-in size
  const camp = await page.evaluate(() => {
    const s = window.pft.s;
    let best = s.bases[0], bn = -1;
    for (const b of s.bases) {
      const n = s.soldiers.filter((x) => x.alive && x.owner === b.owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r).length;
      if (n > bn) { bn = n; best = b; }
    }
    return best;
  });
  const clipAt = await flat(camp);
  await settle();
  await burst("camp", frames, clipAt(150));
  // soldiers at leaning-in size
  const clipLean = await flat(camp, 2.1);
  await settle();
  await burst("soldiers-leanin", frames, clipLean(80));

  // a kill: the man boils, is crossed out, and holds still
  const shot = await page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    const me = mine[0], foe = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    return { me, foe };
  });
  const rot = await page.evaluate(() => window.pft.cam.cur.rot);
  const clipKill = (await flat(shot.foe))(110);
  const half = frames >> 1;
  const snap = async (i) => {
    await page.evaluate((ms) => { window.pft.boilClock = ms; }, clock);
    clock += STEP;
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/kill-${String(i).padStart(2, "0")}.png`, clip: clipKill });
  };
  for (let i = 0; i < half; i++) await snap(i);
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
  console.log("kill landed:", await page.evaluate((id) => !window.pft.s.soldiers[id].alive, shot.foe.id));
  for (let i = half; i < frames; i++) await snap(i);
  stitch(out, "kill", 330);
  await page.evaluate(() => { window.pft.boilClock = undefined; });

  // prefers-reduced-motion: no boil at all, everything is ink on the page
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForFunction(() => window.pft);
  await page.evaluate(() => { const r = window.pft.fileWar(7, 12); r.mode = { kind: "pnp" }; window.pft.resumeRecord(r); });
  await idle(T);
  await page.waitForTimeout(500);
  const rm = await page.evaluate(() => ({ on: window.pft.boilOn, empty: window.pft.boil.empty, ticks: window.pft.stageStats.boil }));
  console.log("reduced motion:", JSON.stringify(rm));
  await T.shot(`${out}/reduced-motion.png`);
}

// frames -> GIF (palette per clip) and WebM, when ffmpeg is about
function stitch(out, name, w) {
  const ff = (args) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const src = ["-framerate", String(FPS), "-i", `${out}/${name}-%02d.png`];
  ff([...src, "-vf", `scale=${Math.round(w)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none`, "-loop", "0", `${out}/${name}.gif`]);
  ff([...src, "-vf", `scale=${Math.round(w) * 2}:-2:flags=lanczos`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", `${out}/${name}.webm`]);
  console.log("stitched", name);
}

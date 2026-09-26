// Soldier life (src/life.ts), captured frame by frame. Time is moved by hand
// (`pft.hand`, `pft.step`), so the game, the camera and the boil advance
// together one frame at a time however slow the screenshots are, and each
// sequence is stitched into a GIF and a WebM with ffmpeg if it's there.
//   idle-birdseye, idle-camp     breathing, and eager hops on your go
//   pickup                       picked up: he perks up, his campmates turn to him
//   shot, shot-target, shot-home a shot through a full camp: recoil, flinch, gasp, the cross,
//                                mourning (still, the camp's pen stopped), the shooter's camp cheering
//   move                         riding his ink, stretched, and landing
//   bot-aims                     Dawood-bot lines up on your camp: your men in the line cower
//   last-stand                   the last three: huddled, trembling, hearts racing
//   unit-cam                     tap him again: down to his eye level for a beat
//   pen                          the pen landing on a dot, and shivering at full pull
//   node scripts/playtest.mjs life <url> <outdir>     (ONLY=a,b to run some)
import { spawnSync } from "node:child_process";
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const only = process.env.ONLY?.split(",");
  const want = (n) => !only || only.includes(n);
  await page.waitForTimeout(1000);

  const war = async (seed, turns, mode = "pnp") => {
    await page.evaluate(({ seed, turns, mode }) => {
      window.pft.slow = false;
      window.pft.hand(false);
      const r = window.pft.fileWar(seed, turns);
      r.mode = mode === "bot" ? { kind: "bot", level: 1 } : { kind: "pnp" };
      window.pft.resumeRecord(r);
    }, { seed, turns, mode });
    await idle(T);
    await page.evaluate(() => window.pft.hand(true));
    // let the boil make its sprites
    for (let k = 0; k < 80; k++) {
      await step(1000 / 12, 25);
      if (k > 3 && await page.evaluate(() => window.pft.boil.settled)) break;
    }
  };
  const step = async (ms, wait = 70) => { await page.evaluate((ms) => window.pft.step(ms), ms); await page.waitForTimeout(wait); };
  const seq = async (name, n, ms, clips = { [name]: undefined }, during) => {
    for (let i = 0; i < n; i++) {
      if (during) await during(i);
      await step(ms);
      const full = await page.screenshot();
      for (const [k, clip] of Object.entries(clips)) {
        const file = `${out}/${k}-${String(i).padStart(3, "0")}.png`;
        if (!clip) { await import("node:fs").then((fs) => fs.writeFileSync(file, full)); continue; }
        await page.screenshot({ path: file, clip });
      }
    }
    for (const [k, clip] of Object.entries(clips)) stitch(out, k, Math.round(1000 / ms), clip ? Math.max(240, Math.min(360, clip.width * 1.2)) : 390);
  };
  const flat = async (at, m = 3.2) => {
    await page.evaluate(({ at, m }) => { window.pft.cam.sit(at, m, 0, 0.5); window.pft.cam.snap(); window.pft.poke(); }, { at, m });
    await step(0, 150);
  };
  const box = async (at, half) => { const c = await T.world(at.x, at.y); return { x: Math.round(c.x - half), y: Math.round(c.y - half), width: half * 2, height: half * 2 }; };
  const fullest = (side) => page.evaluate((side) => {
    const s = window.pft.s, owner = side === "mine" ? s.current : 1 - s.current;
    let best = null, bn = -1;
    for (const b of s.bases) {
      if (b.owner !== owner) continue;
      const n = s.soldiers.filter((x) => x.alive && x.owner === owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r * 1.05).length;
      if (n > bn) { bn = n; best = b; }
    }
    return best;
  }, side);
  const menIn = (b) => page.evaluate((b) => window.pft.s.soldiers.filter((x) => x.alive && x.owner === b.owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r * 1.05), b);

  // --- idle ---------------------------------------------------------------------
  if (want("idle")) {
    await war(7, 12);
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await seq("idle-birdseye", 36, 1000 / 12);
    const camp = await fullest("mine");
    await flat(camp);
    await seq("idle-camp", 36, 1000 / 12, { "idle-camp": await box(camp, 130) });
  }

  // --- picked up ----------------------------------------------------------------
  if (want("pickup")) {
    await war(7, 12);
    const camp = await fullest("mine");
    const men = await menIn(camp);
    const me = men.sort((a, b) => Math.hypot(a.x - camp.x, a.y - camp.y) - Math.hypot(b.x - camp.x, b.y - camp.y))[0];
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await step(0, 100);
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 30);
    await seq("pickup", 30, 1000 / 12);
    // and flat and close, to see the campmates turn
    await flat(me, 3.4);
    await page.evaluate(() => window.pft.life.clear());
    await page.evaluate((id) => { window.pft.life.add(id, { kind: "perk", t0: window.pft.wall + 100, amp: 1 }); }, me.id);
    await seq("pickup-close", 20, 1000 / 12, { "pickup-close": await box(me, 110) });
    await page.evaluate(() => document.querySelector("#page-btn").click());
  }

  // --- a shot through a full camp -------------------------------------------------
  if (want("shot")) {
    await war(7, 12);
    const target = await fullest("theirs"), home = await fullest("mine");
    const men = await menIn(home);
    // the man in the home camp with the clearest line to the target's middle
    const me = men[0];
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await step(0, 100);
    const clips = { shot: undefined, "shot-target": await box(target, 90), "shot-home": await box(home, 90) };
    await seq("shot", 54, 1000 / 24, clips, async (i) => {
      if (i === 4) await page.evaluate(({ me, t }) => window.pft.act({ soldierId: me.id, kind: "shoot", angle: Math.atan2(t.y - me.y, t.x - me.x), length: 1800, bend: 0 }), { me, t: target });
    });
  }

  // --- a move ------------------------------------------------------------------
  if (want("move")) {
    await war(7, 12);
    const home = await fullest("mine");
    const men = await menIn(home);
    const me = men[0];
    const theirs = await fullest("theirs");
    const ang = Math.atan2(theirs.y - me.y, theirs.x - me.x);
    const end = { x: me.x + Math.cos(ang) * 300, y: me.y + Math.sin(ang) * 300 };
    await flat({ x: (me.x + end.x) / 2, y: (me.y + end.y) / 2 }, 1.8);
    await seq("move", 40, 1000 / 24, { move: await box({ x: (me.x + end.x) / 2, y: (me.y + end.y) / 2 }, 170) }, async (i) => {
      if (i === 3) await page.evaluate(({ me, ang }) => { const c = window.pft.cam.tgt; window.pft.act({ soldierId: me.id, kind: "move", angle: ang, length: 300, bend: 0.02 }); window.pft.cam.tgt = c; }, { me, ang });
      await page.evaluate(({ at }) => { window.pft.cam.sit(at, 1.8, 0, 0.5); window.pft.cam.snap(); }, { at: { x: (me.x + end.x) / 2, y: (me.y + end.y) / 2 } });
    });
  }

  // --- Dawood-bot lines up on you ---------------------------------------------------
  if (want("bot-aims")) {
    // against the bot, on your go: flick one off into the margin, then watch its turn
    await war(7, 12, "bot");
    const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
    await seq("bot-aims", 64, 1000 / 12, undefined, async (i) => {
      if (i === 0) await page.evaluate((me) => window.pft.act({ soldierId: me.id, kind: "shoot", angle: me.x < 500 ? Math.PI : 0, length: 700, bend: 0 }), me);
    });
  }

  // --- the last few ----------------------------------------------------------------
  if (want("last-stand")) {
    await war(11, 70);
    const few = await page.evaluate(() => {
      const s = window.pft.s;
      for (const p of [0, 1]) { const a = s.soldiers.filter((x) => x.alive && x.owner === p); if (a.length <= 3) return a; }
      return [];
    });
    if (few.length) {
      const cx = few.reduce((a, x) => a + x.x, 0) / few.length, cy = few.reduce((a, x) => a + x.y, 0) / few.length;
      const spread = Math.max(...few.map((x) => Math.hypot(x.x - cx, x.y - cy)));
      const m = Math.max(1.2, Math.min(3.4, 200 / (spread + 40)));
      await flat({ x: cx, y: cy }, m);
      await seq("last-stand", 24, 1000 / 12, { "last-stand": await box({ x: cx, y: cy }, 140) });
    } else console.log("no last stand on this page");
  }
  // --- voices, rendered offline to WAV (to listen to: headless Chrome has no ears) ---
  if (want("voices")) {
    const fs = await import("node:fs");
    fs.mkdirSync(`${out}/voices`, { recursive: true });
    const wav = async (name, lines) => {
      const r = await page.evaluate((lines) => window.pft.voiceWav(lines), lines);
      fs.writeFileSync(`${out}/voices/${name}.wav`, Buffer.from(r.wav, "base64"));
      console.log(`voice ${name.padEnd(14)} ${r.secs.toFixed(2)}s peak ${r.peak.toFixed(3)}`);
    };
    for (const what of ["hup", "murmur", "eep", "gasp", "oh", "cheer", "wheee", "land", "uhoh", "look"]) {
      await wav(what, [0, 1, 2].map((k) => ({ what, id: 3 + k * 11, owner: (k % 2), at: k * 0.9, len: 0.6 })));
    }
    // a whole kill, voiced as the game would: picked up, a campmate mutters; the ink goes;
    // a man in the line gasps (cut off by his cross), one beside him squeaks;
    // the shooter's camp cheers; one of the fallen man's camp sighs
    await wav("a-kill", [
      { what: "hup", id: 4, owner: 0, at: 0 }, { what: "murmur", id: 6, owner: 0, at: 0.3, gain: 0.8 },
      { what: "gasp", id: 33, owner: 1, at: 1.35, gain: 0.8 }, { what: "eep", id: 35, owner: 1, at: 1.42, gain: 0.8 },
      { what: "cheer", id: 4, owner: 0, at: 1.75 }, { what: "cheer", id: 6, owner: 0, at: 1.82, gain: 0.4 },
      { what: "cheer", id: 9, owner: 0, at: 1.89, gain: 0.4 }, { what: "oh", id: 37, owner: 1, at: 2.3, gain: 0.8 },
    ]);
    await wav("a-move", [{ what: "hup", id: 12, owner: 1, at: 0 }, { what: "wheee", id: 12, owner: 1, at: 0.7, len: 0.7, gain: 0.8 }, { what: "land", id: 12, owner: 1, at: 1.45, gain: 0.7 }]);
    await wav("last-stand", [{ what: "uhoh", id: 21, owner: 1, at: 0, gain: 0.8 }]);
  }
  await page.evaluate(() => window.pft.hand(false));
}

// frames -> GIF (palette per clip) and WebM, when ffmpeg is about
function stitch(out, name, fps, w) {
  const ff = (args) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const src = ["-framerate", String(fps), "-i", `${out}/${name}-%03d.png`];
  ff([...src, "-vf", `scale=${Math.round(w)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none`, "-loop", "0", `${out}/${name}.gif`]);
  ff([...src, "-vf", `scale=${Math.round(w) * 2}:-2:flags=lanczos`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", `${out}/${name}.webm`]);
  console.log("stitched", name);
}

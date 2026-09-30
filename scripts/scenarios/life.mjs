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
  // one paper, not whichever the load drew: THEME=<id> (lamplight by default)
  await page.evaluate((id) => window.pft.theme?.apply(id), process.env.THEME ?? "lamplight");

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
  // his side's living men nearest the camp, nearest first (under the core rules some stand outside it)
  const menIn = (b) => page.evaluate((b) => window.pft.s.soldiers.filter((x) => x.alive && x.owner === b.owner).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y)).slice(0, 10), b);

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
    await page.evaluate(() => { window.pft.life.clear(); window.pft.hidePen = true; });
    await page.evaluate((id) => { window.pft.life.add(id, { kind: "perk", t0: window.pft.wall + 100, amp: 1 }); }, me.id);
    await seq("pickup-close", 20, 1000 / 12, { "pickup-close": await box(me, 110) });
    await page.evaluate(() => { window.pft.hidePen = false; });
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
    // (the bot's aim is random in play: seeded here, so the capture repeats; BOT_SEED picks another)
    // (Dawood-bot seeds its flicks from the clock: pinned before the war resumes, since it
    // may be the bot's go first. Seed 7 crosses four of yours out on this page.)
    await page.evaluate((seed) => { Date.now = () => seed; }, +(process.env.BOT_SEED ?? 7));
    await war(7, 12, "bot");
    const before = await page.evaluate(() => window.pft.s.soldiers.filter((x) => x.alive).length);
    const me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.find((x) => x.alive && x.owner === s.current); });
    // and close on each of your manned camps: one of them is in its sights
    const camps = await page.evaluate(() => { const s = window.pft.s; return s.bases.filter((b) => b.owner === s.current && s.soldiers.some((x) => x.alive && x.owner === b.owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r)); });
    const clips = { "bot-aims": undefined };
    for (const [k, b] of camps.entries()) clips[`bot-aims-camp${k}`] = await box(b, 80);
    await seq("bot-aims", 64, 1000 / 12, clips, async (i) => {
      if (i === 0) await page.evaluate((me) => window.pft.act({ soldierId: me.id, kind: "shoot", angle: me.x < 500 ? Math.PI : 0, length: 700, bend: 0 }), me);
    });
    console.log("bot crossed out:", before - await page.evaluate(() => window.pft.s.soldiers.filter((x) => x.alive).length));
  }

  // --- the last few ----------------------------------------------------------------
  if (want("last-stand")) {
    // the earliest turn of a seeded war with a side down to its last three: the cleanest page for it
    const at = await page.evaluate(() => {
      for (const seed of [11, 7, 3, 5]) for (let t = 20; t < 200; t += 2) {
        const st = window.pft.unfile(window.pft.fileWar(seed, t));
        if (st.phase !== "play") break;
        if ([0, 1].some((p) => { const n = st.soldiers.filter((x) => x.alive && x.owner === p).length; return n > 1 && n <= 3; })) return { seed, t };
      }
      return { seed: 11, t: 70 };
    });
    console.log("last stand at", JSON.stringify(at));
    await war(at.seed, at.t);
    const few = await page.evaluate(() => {
      const s = window.pft.s;
      for (const p of [0, 1]) { const a = s.soldiers.filter((x) => x.alive && x.owner === p); if (a.length <= 3) return a; }
      return [];
    });
    if (few.length) {
      // the one with a comrade nearest him, close: huddled toward him, trembling
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const pick = few.length > 1 ? few.reduce((a, b) => (Math.min(...few.filter((x) => x !== b).map((x) => d(x, b))) < Math.min(...few.filter((x) => x !== a).map((x) => d(x, a))) ? b : a)) : few[0];
      await flat(pick, 3.4);
      await seq("last-stand", 24, 1000 / 12, { "last-stand": await box(pick, 90) });
    } else console.log("no last stand on this page");
  }
  // --- the flinch: a shot that just misses a camp, close ---------------------------
  if (want("flinch")) {
    await war(7, 12);
    const camp = await fullest("theirs");
    const me = await page.evaluate((b) => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0]; }, camp);
    // aim to graze just outside the ring: the near side of the camp flinches, nobody's hit
    const d = Math.hypot(camp.x - me.x, camp.y - me.y), nx = -(camp.y - me.y) / d, ny = (camp.x - me.x) / d;
    const aimAt = { x: camp.x + nx * (camp.r + 16), y: camp.y + ny * (camp.r + 16) };
    const rot = await page.evaluate(() => window.pft.cam.cur.rot);
    const hold = async () => page.evaluate(({ at, rot }) => { const c = window.pft.cam; c.tgt = { ...c.tgt, rot }; c.sit(at, 3.4, 0, 0.5); c.snap(); window.pft.poke(); }, { at: camp, rot });
    await hold();
    await step(0, 150);
    const clip = await box(camp, 110);
    await seq("flinch", 56, 1000 / 24, { flinch: clip }, async (i) => {
      if (i === 2) {
        const killed = await page.evaluate(({ me, a }) => { const o = window.pft.act({ soldierId: me.id, kind: "shoot", angle: Math.atan2(a.y - me.y, a.x - me.x), length: 1800, bend: 0 }); return window.pft.res?.o.killed.length; }, { me, a: aimAt });
        console.log("flinch shot, killed:", killed);
      }
      await hold();
    });
  }

  // --- a volley: your man lands in their camp, and they turn on him ------------------
  if (want("volley")) {
    await war(7, 12);
    const camp = await fullest("theirs");
    const me = await page.evaluate((b) => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0]; }, camp);
    const rot = await page.evaluate(() => window.pft.cam.cur.rot);
    // aim at a gap: the middle of the camp, nudged toward where it's emptiest
    const to = { x: camp.x + 6, y: camp.y + 6 };
    const hold = async () => page.evaluate(({ at, rot }) => { const c = window.pft.cam; c.tgt = { ...c.tgt, rot }; c.sit(at, 3.4, 0, 0.5); c.snap(); window.pft.poke(); }, { at: camp, rot });
    await hold();
    await step(0, 150);
    const clip = await box(camp, 110);
    let landed = false;
    await seq("volley", 70, 1000 / 24, { volley: clip }, async (i) => {
      if (i === 2) await page.evaluate(({ me, to }) => window.pft.act({ soldierId: me.id, kind: "move", angle: Math.atan2(to.y - me.y, to.x - me.x), length: Math.hypot(to.x - me.x, to.y - me.y), bend: 0 }), { me, to });
      if (i > 2 && !landed && await page.evaluate(() => !window.pft.res?.f || window.pft.res.o.movedTo && window.pft.res.dur <= (window.pft.T - window.pft.res.t0))) {
        landed = true;
        const v = await page.evaluate(({ b, id }) => window.pft.volley(b, id), { b: camp.id, id: me.id });
        console.log("volley:", v ? `${v.jabs.length} jabs, cross at ${Math.round(v.cross)}ms` : "empty ring");
      }
      await hold();
    });
  }

  // --- the unit cam ---------------------------------------------------------------
  if (want("unit-cam")) {
    await war(7, 12);
    const home = await fullest("mine");
    const men = await menIn(home);
    const me = men.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[0];
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await step(0, 100);
    let a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 30); // pick him up: lean in
    for (let i = 0; i < 14; i++) await step(1000 / 12, 30);
    a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 30); // and again: down to his level
    await seq("unit-cam", 36, 1000 / 12);
    console.log("unit cam over:", await page.evaluate(() => window.pft.unit === null));
  }

  // --- the pen ------------------------------------------------------------------
  if (want("pen")) {
    await war(7, 12);
    const home = await fullest("mine");
    const me = (await menIn(home))[0];
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await step(0, 100);
    const a = await T.world(me.x, me.y);
    await T.tap(a.x, a.y, 30);
    for (let i = 0; i < 12; i++) await step(1000 / 24, 30); // the camera leans in
    // put down again on him, to watch it land and rock
    await page.evaluate(() => window.pft.redrop?.());
    await seq("pen", 64, 1000 / 24, undefined, async (i) => {
      // then a full pull, held, shivering; then put down (stand up) and it lifts away
      if (i === 24) await T.touch("touchStart", [[195, 560]]);
      if (i > 24 && i < 34) await T.touch("touchMove", [[195 + (i - 24), 560 + (i - 24) * 22]]);
      if (i === 52) await T.touch("touchCancel", []);
      if (i === 54) await page.evaluate(() => document.querySelector("#page-btn").click());
    });
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
    for (const what of ["hup", "murmur", "eep", "gasp", "oh", "cheer", "wheee", "land", "uhoh", "look", "phew", "jab"]) {
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
    // a near miss: "eep!" as it passes, "phew" after
    await wav("a-near-miss", [{ what: "eep", id: 31, owner: 1, at: 0, gain: 0.9 }, { what: "phew", id: 31, owner: 1, at: 0.75, gain: 0.7 }]);
    // a volley: nine defenders jab in a ripple, the intruder gasps and is cut off, a grim little cheer
    await wav("a-volley", [
      ...Array.from({ length: 9 }, (_, i) => ({ what: "jab", id: 40 + i, owner: 0, at: 0.25 + i * 0.055, gain: 0.7 / Math.sqrt(1 + i * 0.3) })),
      { what: "gasp", id: 3, owner: 1, at: 0.62, gain: 0.8 }, { what: "cheer", id: 40, owner: 0, at: 1.0, gain: 0.5 }, { what: "cheer", id: 41, owner: 0, at: 1.08, gain: 0.5 },
    ]);
  }
  // --- a busy moment, before and after the voices were cut down ---------------------
  // Picked up, then a shot through a full camp: everything the old plan voiced
  // (a chorus of up to five, at the old level), against what's said now (one
  // voice, now and then two, quieter). One MP3: before, a pause, after.
  if (want("busy")) {
    const fs = await import("node:fs");
    fs.mkdirSync(`${out}/voices`, { recursive: true });
    const OLD = 0.15 / 0.09; // the old level over the new
    const pick = { what: "hup", id: 4, owner: 0, at: 0 };
    const flick = [
      { say: "gasp", id: 33, at: 1350, gain: 0.8 }, { say: "gasp", id: 36, at: 1500, gain: 0.8 },
      { say: "eep", id: 35, at: 1420, gain: 0.9 }, { say: "eep", id: 34, at: 1470, gain: 0.7 }, { say: "eep", id: 38, at: 1560, gain: 0.6 },
      { say: "cheer", id: 4, at: 1750, gain: 1 }, { say: "cheer", id: 6, at: 1820, gain: 0.4 }, { say: "cheer", id: 9, at: 1890, gain: 0.4 },
      { say: "phew", id: 35, at: 2170, gain: 0.7 }, { say: "oh", id: 37, at: 2300, gain: 0.8 }, { say: "oh", id: 39, at: 2480, gain: 0.8 },
    ];
    const owner = (id) => (id >= 30 ? 1 : 0);
    const before = [pick, { what: "murmur", id: 6, owner: 0, at: 0.3, gain: 0.8 }, ...flick.map((c) => ({ what: c.say, id: c.id, owner: owner(c.id), at: c.at / 1000, gain: c.gain }))]
      .map((l) => ({ ...l, gain: (l.gain ?? 1) * OLD }));
    const kept = await page.evaluate((flick) => window.pft.voice.curate(flick, 4 * 131 + 12), flick);
    const after = [pick, ...kept.map((c) => ({ what: c.say, id: c.id, owner: owner(c.id), at: c.at / 1000, gain: c.gain }))];
    for (const [name, lines] of [["busy-before", before], ["busy-after", after]]) {
      const r = await page.evaluate((lines) => window.pft.voiceWav(lines), lines);
      fs.writeFileSync(`${out}/voices/${name}.wav`, Buffer.from(r.wav, "base64"));
      console.log(`voice ${name.padEnd(12)} ${lines.length} lines, peak ${r.peak.toFixed(3)}: ${lines.map((l) => l.what).join(" ")}`);
    }
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", `${out}/voices/busy-before.wav`, "-f", "lavfi", "-t", "1.2", "-i", "anullsrc=r=44100:cl=mono", "-i", `${out}/voices/busy-after.wav`,
      "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", "-c:a", "libmp3lame", "-q:a", "4", `${out}/voices/busy-before-then-after.mp3`], { stdio: "inherit" });
  }

  // --- a pencil note or two: written, read, rubbed out (31 frames at 12 fps) ------------
  if (want("bubbles")) {
    await war(7, 12);
    const camp = await fullest("mine");
    await flat(camp, 2.4);
    const men = await menIn(camp);
    const say = async (name, kind, id, clip, style) => {
      // offered until one is taken (they're rare on purpose), then written on, held and faded
      await page.evaluate(({ kind, id, style }) => {
        const p = window.pft;
        for (let k = 0; k < 200 && !p.bubbles.cur; k++) { p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7); }
        p.poke();
      }, { kind, id, style });
      await seq(name, 31, 1000 / 12, { [name]: clip });
      await page.evaluate(() => window.pft.bubbles.reset());
    };
    await say("bubble-ready", "ready", men[0].id, await box(camp, 150));
    await say("bubble-idle", "idle", men[3].id, await box(camp, 150));
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await step(0, 150);
    await say("bubble-birdseye", "phew", men[1].id);
  }
  // --- notes: stills, fully written, on each paper, leaning in and from bird's-eye ---------
  if (want("notes")) {
    // NOTE_RING=0: just the words and their tail, no ring, to compare by eye
    if (process.env.NOTE_RING === "0") await page.evaluate(() => { window.pft.NOTE.ring = false; });
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      const camp = await fullest("mine");
      const men = await menIn(camp);
      // the topmost of all the men, to see the note kept on the page
      const edge = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive).sort((a, b) => a.y - b.y)[0]; });
      const hold = async (name, kind, id, text, clip) => {
        const ok = await page.evaluate(({ kind, id, text }) => {
          const p = window.pft;
          for (let k = 0; k < 4000; k++) {
            p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7);
            if (p.bubbles.cur && (!text || p.bubbles.cur.text === text)) { p.poke(); return p.bubbles.cur.text; }
          }
          return null;
        }, { kind, id, text });
        if (!ok) { console.log(`no "${text}" for ${name}`); return; }
        await step(900, 150);
        await page.screenshot(clip ? { path: `${out}/${name}.png`, clip } : { path: `${out}/${name}.png` });
        console.log(`shot ${name}: "${ok}"`);
        await page.evaluate(() => window.pft.bubbles.reset());
        await step(500, 100);
      };
      const menOf = (kind) => page.evaluate((kind) => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && (kind === "mine" ? x.owner === s.current : x.owner !== s.current)); }, kind);
      const theirs = await menOf("theirs");
      await flat(camp, 2.4);
      await hold(`note-${theme}-lean-dawood`, "idle", men[2].id, "for Dawood!", await box(camp, 200));
      await hold(`note-${theme}-lean-ready`, "ready", men[0].id, "I'm ready", await box(camp, 200));
      await hold(`note-${theme}-lean-phew`, "phew", men[4].id, "phew", await box(camp, 200));
      await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
      await step(0, 150);
      await hold(`note-${theme}-bird-dawood`, "idle", men[2].id, "for Dawood!");
      await hold(`note-${theme}-bird-close`, "phew", theirs[Math.floor(theirs.length / 2)].id, "close one");
      await hold(`note-${theme}-bird-edge`, "idle", edge.id, "for Dawood!");
    }
  }
  // --- notes, round two: any angle, shouts, moods --------------------------------------
  //   note2-<theme>-turned       a stray thought on a busy bird's-eye page, written at an angle to find clear paper
  //   note2-<theme>-lunge        "Luuunge!" as a real lunge flies (seeds looped for the line)
  //   note2-<theme>-dawood       "fooor Dawooood!"
  //   note2-<theme>-quiet        a whisper, for contrast
  //   note2-<theme>-shout        (frames, GIF) a shout written, read and rubbed out
  if (want("notes2")) {
    const force = (kind, id, text, max = 6000) => page.evaluate(({ kind, id, text }) => {
      const p = window.pft;
      for (let k = 0; k < 6000; k++) {
        p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7);
        if (p.bubbles.cur && (!text || p.bubbles.cur.text === text)) { p.poke(); return p.bubbles.cur.text; }
      }
      return null;
    }, { kind, id, text, max });
    const still = async (name, ms = 900, clip) => { await step(ms, 150); await page.screenshot(clip ? { path: `${out}/${name}.png`, clip } : { path: `${out}/${name}.png` }); console.log(`shot ${name}`); await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100); };
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
      await step(0, 150);
      // a turned note: the first of the side's men whose stray thought finds clear paper at an angle
      const mine = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).map((x) => x.id); });
      let turned = null;
      for (const id of mine) {
        const t = await force("idle", id, null);
        if (!t) continue;
        await step(0, 60);
        const sp = await page.evaluate(() => window.pft.noteSpot());
        if (sp && Math.abs(sp.ang) >= 0.5) { turned = { id, t, ang: sp.ang }; break; }
        await page.evaluate(() => window.pft.bubbles.reset());
        await step(0, 30);
      }
      console.log("turned:", JSON.stringify(turned));
      if (turned) await still(`note2-${theme}-turned`);
      // a real lunge: he yells as he goes (the line is looped for "Luuunge!")
      // (most chances pass: up to four men lunge before the line is looped for)
      let me = null, natural = null;
      for (let k = 0; k < 4 && !natural; k++) {
        for (let i = 0; i < 12; i++) await step(1000 / 12, 20);
        await page.evaluate(() => window.pft.hand(false));
        await idle(T);
        await page.evaluate(() => window.pft.hand(true));
        me = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).map((x) => ({ id: x.id, x: x.x, y: x.y }))[0]; });
        await page.evaluate(({ id }) => { window.pft.bubbles.reset(); window.pft.act({ soldierId: id, kind: "move", angle: -Math.PI / 2 + 0.4, length: 260, bend: 0 }); }, me);
        await step(1000 / 12, 60);
        natural = await page.evaluate(() => window.pft.bubbles.cur?.text ?? null);
        console.log("the lunger said:", natural);
      }
      // (a lunge is yelled from his camp, in its late form once the war's hot)
      const camp = await page.evaluate((id) => window.pft.s.soldiers[id].home, me.id);
      await page.evaluate(() => { window.pft.heat = 1; });
      if (natural !== "Luuunge!") await force("lunge", camp, "Luuunge!");
      await still(`note2-${theme}-lunge`, 700);
      for (let i = 0; i < 20; i++) await step(1000 / 12, 30);
      await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
      await step(0, 100);
      const men = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).map((x) => x.id); });
      await force("lunge", camp, "fooor Dawooood!");
      await still(`note2-${theme}-dawood`, 800);
      await force("aim", men[2], "steady…");
      await still(`note2-${theme}-quiet`, 900);
      // a shout, written and rubbed out
      await force("lunge", camp, "Chaaarge!");
      await seq(`note2-${theme}-shout`, 36, 1000 / 12);
      await page.evaluate(() => { window.pft.bubbles.reset(); window.pft.heat = undefined; });
    }
  }
  // --- notes, round three: camps speak from their ring, moods, exchanges, crickets ------------
  //   note3-<theme>-chant        a camp's chant along its ring, from bird's-eye
  //   note3-<theme>-who          an individual's line from bird's-eye: the tail and the ring round his dot
  //   note3-<theme>-early/late   "for Dawood!" from a camp early in the war, "fooor Dawooood!" late
  //   note3-<theme>-tiny-lean    a tiny whisper leaning in (and -tiny-bird: barely there from above)
  //   note3-<theme>-chat         an exchange: a line and a nearby comrade's reply
  //   note3-<theme>-crickets     a long wait
  if (want("notes3")) {
    const force = (kind, id, text, mate) => page.evaluate(({ kind, id, text, mate }) => {
      const p = window.pft;
      for (let k = 0; k < 8000; k++) {
        p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7, mate);
        if (p.bubbles.cur && (!text || p.bubbles.cur.text === text) && (mate === undefined || p.bubbles.cur.reply)) { p.poke(); return p.bubbles.cur.text; }
      }
      return null;
    }, { kind, id, text, mate });
    const still = async (name, ms = 900, clip) => { await step(ms, 150); await page.screenshot(clip ? { path: `${out}/${name}.png`, clip } : { path: `${out}/${name}.png` }); console.log(`shot ${name}`); await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100); };
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
      await step(0, 150);
      const camp = await fullest("mine");
      const men = await menIn(camp);
      const mate = await page.evaluate((id) => { const s = window.pft.s, x = s.soldiers[id]; return s.soldiers.filter((y) => y.alive && y.owner === x.owner && y.id !== id).sort((a, b) => Math.hypot(a.x - x.x, a.y - x.y) - Math.hypot(b.x - x.x, b.y - x.y))[0]?.id; }, men[0].id);
      console.log("chant:", await force("chant", camp.id, "Da-wood! Da-wood!"));
      await still(`note3-${theme}-chant`, 1700);
      console.log("who:", await force("idle", men[2].id, "hold the line"));
      await still(`note3-${theme}-who`, 900);
      await page.evaluate(() => { window.pft.heat = 0; });
      console.log("early:", await force("lunge", camp.id, "for Dawood!"));
      await still(`note3-${theme}-early`, 800);
      await page.evaluate(() => { window.pft.heat = 1; });
      console.log("late:", await force("lunge", camp.id, "fooor Dawooood!"));
      await still(`note3-${theme}-late`, 800);
      await page.evaluate(() => { window.pft.heat = undefined; });
      console.log("chat:", await force("chat", men[0].id, "what's the plan", mate));
      await still(`note3-${theme}-chat`, 1900);
      console.log("crickets:", await force("wait", men[3].id, "*crickets*"));
      await still(`note3-${theme}-crickets-bird`, 1000);
      console.log("tiny:", await force("tiny", men[1].id, "psst"));
      await still(`note3-${theme}-tiny-bird`, 1000);
      await flat(camp, 2.4);
      console.log("tiny:", await force("tiny", men[1].id, "psst"));
      await still(`note3-${theme}-tiny-lean`, 1100, await box(camp, 200));
      console.log("crickets:", await force("wait", men[3].id, "*crickets*"));
      await still(`note3-${theme}-crickets-lean`, 1000, await box(camp, 200));
      console.log("chat:", await force("chat", men[0].id, "what's the plan", mate));
      await seq(`note3-${theme}-chat-clip`, 46, 1000 / 12, { [`note3-${theme}-chat-clip`]: await box(camp, 220) });
      await page.evaluate(() => window.pft.bubbles.reset());
      await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
      await step(0, 150);
      console.log("chant:", await force("chant", camp.id, "Da-wood! Da-wood!"));
      await seq(`note3-${theme}-chant-clip`, 42, 1000 / 12);
      await page.evaluate(() => window.pft.bubbles.reset());
    }
  }
  // --- exchanges: two men talking --------------------------------------------------
  //   exchange-<style>-<theme>          both lines up, bird's-eye at phone size
  //   exchange-<style>-<theme>-lean     the same, leaning in on the pair
  //   exchange-<style>-<theme>-beat     the beat, frame by frame (GIF, and a strip of six)
  if (want("exchange")) {
    const pair = (id) => page.evaluate((id) => {
      // as main.ts picks: a comrade near enough to talk to, not so near their dots read as one
      const s = window.pft.s, me = s.soldiers[id], d = (x) => Math.hypot(x.x - me.x, x.y - me.y);
      const near = s.soldiers.filter((x) => x.alive && x.owner === me.owner && x.id !== id && d(x) <= 62 * 2.5).sort((a, b) => d(a) - d(b));
      return (near.filter((x) => d(x) >= 42).sort((a, b) => Math.abs(d(a) - 80.6) - Math.abs(d(b) - 80.6))[0] ?? near[0])?.id;
    }, id);
    const say = (id, mate, text) => page.evaluate(({ id, mate, text }) => {
      const p = window.pft;
      for (let k = 0; k < 20000; k++) { p.bubbles.reset(); p.speak("chat", id, p.wall, 1000 + k * 7, mate); if (p.bubbles.cur?.reply && (!text || p.bubbles.cur.text === text)) { p.poke(); return `${p.bubbles.cur.text} / ${p.bubbles.cur.reply.text}`; } }
      return null;
    }, { id, mate, text });
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      { const style = "face";
        await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
        await step(0, 150);
        const camp = await fullest("mine");
        const men = await menIn(camp);
        const lines = [["what's the plan", men[0].id], ["where's Dawood?", men[3].id], [undefined, men[5].id]];
        for (const [i, [text, id]] of lines.entries()) {
          const mate = await pair(id);
          console.log(`exchange ${style} ${theme} ${i}:`, await say(id, mate, text));
          await step(2300, 150);
          const name = `exchange-${style}-${theme}${i ? `-${i}` : ""}`;
          await page.screenshot({ path: `${out}/${name}.png` }); console.log("shot", name);
          await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100);
        }
        // the beat, clipped round the pair
        const id = men[0].id, mate = await pair(id);
        const a = await page.evaluate(({ id, mate }) => { const s = window.pft.s, x = s.soldiers[id], y = s.soldiers[mate]; return { x: (x.x + y.x) / 2, y: (x.y + y.y) / 2 }; }, { id, mate });
        await say(id, mate, "what's the plan");
        const beat = `exchange-${style}-${theme}-beat`;
        await seq(beat, 56, 1000 / 12, { [beat]: await box(a, 190) });
        const fs = await import("node:fs");
        const pick = [4, 11, 17, 26, 42, 51].map((k) => `${out}/${beat}-${String(k).padStart(3, "0")}.png`).filter((f) => fs.existsSync(f));
        if (pick.length === 6) spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...pick.flatMap((f) => ["-i", f]), "-filter_complex", "hstack=inputs=6", `${out}/${beat}-strip.png`], { stdio: "inherit" });
        await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100);
        // leaning in on the pair
        await flat(a, 2.4);
        await say(id, mate, "what's the plan");
        await step(2300, 150);
        await page.screenshot({ path: `${out}/exchange-${style}-${theme}-lean.png`, clip: await box(a, 190) }); console.log("shot lean");
        await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100);
      }
    }
  }
  // --- notes, round four: loops that hug their words, fitting where it's full, streaks ---
  //   ovals-<theme>-who                 "hold the line" from bird's-eye (as notes3's who, for before and after)
  //   ovals-<theme>-gallery-<i>         short, long, wrapped and shouted lines at several angles, leaning in (clips)
  //   fit-<theme>                       a crowded exchange: written smaller to sit close to its man
  //   streak-<theme>-<voice>-<n>        each voice of a streak forced at link 2 and link 5, bird's-eye
  //   streak-<theme>-chain-<link>       a real lunge chain, fired through the game, after each link lands
  //   streak-<theme>-chain              the chain building, frame by frame (GIF), and a strip
  if (want("notes4")) {
    const force = (kind, id, text, mate) => page.evaluate(({ kind, id, text, mate }) => {
      const p = window.pft;
      for (let k = 0; k < 20000; k++) {
        p.bubbles.reset(); p.speak(kind, id, p.wall, 1000 + k * 7, mate);
        if (p.bubbles.cur && (!text || p.bubbles.cur.text === text) && (mate === undefined || p.bubbles.cur.reply)) { p.poke(); return p.bubbles.cur.text; }
      }
      return null;
    }, { kind, id, text, mate });
    const clear = async () => { await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100); };
    const overview = async () => { await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); }); await step(0, 150); };
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      await overview();
      const camp = await fullest("mine");
      const men = await menIn(camp);
      // the loops
      console.log("who:", await force("idle", men[2].id, "hold the line"));
      await step(900, 150); await page.screenshot({ path: `${out}/ovals-${theme}-who.png` }); await clear();
      const lines = [["ready", "ok!"], ["idle", "what's the plan"], ["ponder", "I think, therefore I'm a dot"], ["phew", "HEY!"], ["dread", "!"]];
      const angles = [0, 0.5, Math.PI / 2, -0.85];
      await flat(camp, 2.4);
      let gi = 0;
      for (const [kind, text] of lines) for (const ang of angles) {
        await page.evaluate((a) => { window.pft.NOTE.angle = a; }, ang);
        const got = await force(kind, men[1].id, text);
        if (!got) { console.log("no line", kind, text); continue; }
        await step(1200, 120);
        await page.screenshot({ path: `${out}/ovals-${theme}-gallery-${String(gi++).padStart(2, "0")}.png`, clip: await box(camp, 195) });
        await clear();
      }
      await page.evaluate(() => { window.pft.NOTE.angle = undefined; });
      await overview();
      // a crowded exchange: find one written smaller so it sits close to its man
      const pair = (id) => page.evaluate((id) => {
        const s = window.pft.s, me = s.soldiers[id], d = (x) => Math.hypot(x.x - me.x, x.y - me.y);
        const near = s.soldiers.filter((x) => x.alive && x.owner === me.owner && x.id !== id && d(x) <= 62 * 2.5).sort((a, b) => d(a) - d(b));
        return (near.filter((x) => d(x) >= 42).sort((a, b) => Math.abs(d(a) - 80.6) - Math.abs(d(b) - 80.6))[0] ?? near[0])?.id;
      }, id);
      const all = await page.evaluate(() => { const s = window.pft.s; return s.soldiers.filter((x) => x.alive && x.owner === s.current).map((x) => x.id); });
      let fitted = null;
      for (const id of all) {
        const mate = await pair(id);
        if (mate === undefined) continue;
        for (let k = 0; k < 6 && !fitted; k++) {
          await page.evaluate(({ id, mate, k }) => { const p = window.pft; for (let j = 0; j < 4000; j++) { p.bubbles.reset(); p.speak("chat", id, p.wall, 5000 + k * 977 + j * 7, mate); if (p.bubbles.cur?.reply) break; } p.poke(); }, { id, mate, k });
          await step(2300, 60);
          const sp = await page.evaluate(() => window.pft.noteSpots().slice(-2).map((m) => m.k));
          if (sp.some((x) => x > 0)) fitted = { id, mate, sp };
          else await clear();
        }
        if (fitted) break;
      }
      if (fitted) { console.log("fit:", JSON.stringify(fitted), await page.evaluate(() => `${window.pft.bubbles.cur?.text} / ${window.pft.bubbles.cur?.reply?.text}`)); await page.screenshot({ path: `${out}/fit-${theme}.png` }); }
      else console.log("fit: no crowded exchange found");
      await clear();
      // each voice of a streak, forced, at link 2 and link 5
      const streaker = men[0].id;
      for (const n of [2, 5]) for (const v of ["streakMe", "streakFoe", "streakCamp", "streakFoeCamp"]) {
        const got = await page.evaluate(({ n, v, id }) => { const p = window.pft; p.bubbles.reset(); const b = p.speakStreak(n, id, p.wall, 4242 + n, v); p.poke(); return b ? `${b.kind} ${b.mood}: ${b.text}` : null; }, { n, v, id: streaker });
        console.log(`streak ${theme} ${v} ${n}:`, got);
        if (!got) continue;
        await step(n >= 4 ? 1500 : 1000, 150);
        await page.screenshot({ path: `${out}/streak-${theme}-${v}-${n}.png` });
        await clear();
      }
      // a real lunge chain, through the game: search for a lunge that kills and lands safe, fire it, again with the same man
      const findKill = () => page.evaluate(async () => {
        const g = await import("/src/game.ts");
        const s = window.pft.s, c = s.chain;
        const ids = c ? [c.soldier] : s.soldiers.filter((x) => x.alive && x.owner === s.current).map((x) => x.id);
        let best = null;
        for (const id of ids) {
          if (!g.canFlick(s, id, "lunge")) continue;
          for (let a = 0; a < 360; a += 4) for (let len = 120; len <= 620; len += 20) {
            const f = { soldier: id, kind: "lunge", angle: (a * Math.PI) / 180, length: len, bend: 0, wob: 7 };
            const o = g.preview(s, f);
            if (!o.killed.length || o.lost || o.crashed !== undefined) continue;
            // one kill a link keeps men about for the next; nearer the middle of the page keeps him on screen
            const end = o.path[o.path.length - 1], score = (o.killed.length === 1 ? 0 : 50) + Math.hypot(end.x - 500, end.y - 850) * 0.05 + len * 0.02;
            if (!best || score < best.score) best = { f, score };
          }
          if (best && !c) break;
        }
        return best?.f ?? null;
      });
      await page.evaluate(() => window.pft.bubbles.reset());
      const chainFrames = [];
      let link = 0;
      for (let k = 0; k < 7; k++) {
        const f = await findKill();
        if (!f) { console.log("chain: no more kills from here"); break; }
        const fired = await page.evaluate((f) => { window.pft.flick(f); return window.pft.wall; }, f);
        // step through the flick and the note, a frame on twos; a still once this link's note is written
        let shot = false;
        for (let i = 0; i < 40; i++) {
          await step(1000 / 12, 40);
          if (!shot) {
            const up = await page.evaluate((fired) => { const p = window.pft, b = p.bubbles.cur; return b && b.kind.startsWith("streak") && b.t0 >= fired && p.wall - b.t0 > 900 ? `${b.kind} ${b.mood}: ${b.text}` : null; }, fired);
            if (up) { shot = true; await page.screenshot({ path: `${out}/streak-${theme}-chain-${link + 1}.png` }); console.log(`chain link ${link + 1} said:`, up); }
          }
          const full = await page.screenshot({ type: "jpeg", quality: 80 });
          const file = `${out}/streak-${theme}-chain-f${String(chainFrames.length).padStart(3, "0")}.jpg`;
          (await import("node:fs")).writeFileSync(file, full);
          chainFrames.push(file);
        }
        for (let i = 0; i < 40 && await page.evaluate(() => window.pft.busy); i++) await step(1000 / 12, 20);
        link++;
        const st = await page.evaluate(() => { const p = window.pft, b = p.bubbles.cur; return { chain: p.s.chain?.link ?? 0, busy: !!p.busy, note: b ? `${b.kind} ${b.mood}: ${b.text}` : null }; });
        console.log(`chain link ${link}:`, JSON.stringify(st));
        if (!st.chain) break;
      }
      if (chainFrames.length) spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "12", "-i", `${out}/streak-${theme}-chain-f%03d.jpg`, "-vf", "scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none", "-loop", "0", `${out}/streak-${theme}-chain.gif`], { stdio: "inherit" });
      await clear();
    }
  }
  // --- notes, round five: botches, and notes kept off the page's border, header and title block ---
  //   edge-<theme>-<voice>-<n>          the streak shots that poked past the border or sat on the title block (compare round four's)
  //   botch-<theme>-<voice>-<grade>     each botch voice, a mutter (1) and the full treatment (2), bird's-eye
  //   botch-<theme>-clap                the enemy camp's slow clap, frame by frame (GIF and a strip)
  //   botch-<theme>-real-<grade>        a real botched flick fired through the game, graded by the game's own hook
  //   botch-<theme>-back                the callback on the other side's next go
  if (want("notes5")) {
    const clear = async () => { await page.evaluate(() => window.pft.bubbles.reset()); await step(300, 100); };
    const overview = async () => { await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); }); await step(0, 150); };
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      await overview();
      const camp = await fullest("mine");
      const men = await menIn(camp);
      // the edges: the same forced lines as round four's streak shots
      for (const [n, v] of [[2, "streakFoe"], [5, "streakFoeCamp"], [5, "streakCamp"]]) {
        const got = await page.evaluate(({ n, v, id }) => { const p = window.pft; p.bubbles.reset(); const b = p.speakStreak(n, id, p.wall, 4242 + n, v); p.poke(); return b ? b.text : null; }, { n, v, id: men[0].id });
        console.log(`edge ${theme} ${v} ${n}:`, got);
        await step(n >= 4 ? 1500 : 1000, 150);
        await page.screenshot({ path: `${out}/edge-${theme}-${v}-${n}.png` });
        await clear();
      }
      // each botch voice, forced at both grades, the ink ending short of their lines
      const me = men[0];
      const end = { x: me.x + 40, y: me.y - 60 };
      for (const grade of [1, 2]) for (const v of ["botchMe", "botchCamp", "botchFoe", "botchFoeCamp"]) {
        const got = await page.evaluate(({ grade, v, id, end }) => { const p = window.pft; p.bubbles.reset(); const b = p.speakBotch(grade, id, end, p.wall, 7000 + grade * 13, v); p.poke(); return b ? `${b.kind} ${b.mood}: ${b.text}` : null; }, { grade, v, id: me.id, end });
        console.log(`botch ${theme} ${v} ${grade}:`, got);
        if (!got) continue;
        await step(1400, 150);
        await page.screenshot({ path: `${out}/botch-${theme}-${v}-${grade}.png` });
        await clear();
      }
      // the slow clap, frame by frame
      const clap = await page.evaluate(({ id, end }) => { const p = window.pft; for (let k = 0; k < 600; k++) { p.bubbles.reset(); const b = p.speakBotch(2, id, end, p.wall, 100 + k, "botchFoeCamp"); if (b?.text === "clap. clap. clap.") { p.poke(); return b.bid ?? b.id; } } return null; }, { id: me.id, end });
      console.log(`clap ${theme}:`, clap);
      if (clap !== null) {
        const base = await page.evaluate((id) => { const b = window.pft.s.bases[id]; return { x: b.x, y: b.y }; }, clap);
        const name = `botch-${theme}-clap`;
        await seq(name, 44, 1000 / 12, { [name]: await box(base, 170) });
        const fs = await import("node:fs");
        const pick = [6, 13, 20, 27, 34, 43].map((k) => `${out}/${name}-${String(k).padStart(3, "0")}.png`).filter((f) => fs.existsSync(f));
        if (pick.length === 6) spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...pick.flatMap((f) => ["-i", f]), "-filter_complex", "hstack=inputs=6", `${out}/${name}-strip.png`], { stdio: "inherit" });
        await clear();
      }
      // a real botch, through the game: search the engine for a flick of each grade, fire it, and let the game's hook grade it
      for (const want of [2, 1]) {
        await overview();
        const f = await page.evaluate(async (want) => {
          const g = await import("/src/game.ts");
          const p = window.pft, s = p.s, foe = 1 - s.current;
          const foes = s.soldiers.filter((x) => x.alive && x.owner === foe), own = s.bases.filter((b) => b.owner === s.current);
          for (const x of s.soldiers.filter((y) => y.alive && y.owner === s.current)) {
            if (!g.canFlick(s, x.id, "snipe")) continue;
            for (let a = 0; a < 360; a += 6) for (const len of want === 2 ? [70, 90] : [200, 260, 320]) {
              const f = { soldier: x.id, kind: "snipe", angle: (a * Math.PI) / 180, length: len, bend: 0, wob: 3 };
              const o = g.preview(s, f);
              const bo = p.botchOf({ kind: "snipe", from: o.path[0], aim: f.angle, path: o.path, killed: o.killed.length, lost: o.lost, crashed: o.crashed !== undefined, offPage: o.events.some((e) => e.kind === "edge"), foes, own });
              if (bo.grade === want) return { f, why: bo.why, score: bo.score };
            }
          }
          return null;
        }, want);
        if (!f) { console.log(`real botch ${want}: none found`); continue; }
        // retry the seed-dependent chance: fire, and if nothing was said, try again on the next turn
        await page.evaluate(() => window.pft.bubbles.reset());
        await page.evaluate((f) => window.pft.flick(f), f.f);
        let said = null;
        for (let i = 0; i < 50 && !said; i++) { await step(1000 / 12, 30); said = await page.evaluate(() => { const b = window.pft.bubbles.cur; return b && b.kind.startsWith("botch") && window.pft.wall - b.t0 > 1000 ? `${b.kind} ${b.mood}: ${b.text}` : null; }); }
        console.log(`real botch ${want} (${f.why.join(", ")}, ${f.score.toFixed(2)}):`, said);
        if (said) await page.screenshot({ path: `${out}/botch-${theme}-real-${want}.png` });
        for (let i = 0; i < 40 && await page.evaluate(() => window.pft.busy); i++) await step(1000 / 12, 20);
        // the other side's go: wait for the callback
        if (want === 2) {
          let back = null;
          for (let i = 0; i < 90 && !back; i++) { await step(500, 20); back = await page.evaluate(() => { const b = window.pft.bubbles.cur; return b && b.kind === "botchBack" && window.pft.wall - b.t0 > 900 ? `${b.kind}: ${b.text}` : null; }); }
          console.log(`callback ${theme}:`, back);
          if (back) await page.screenshot({ path: `${out}/botch-${theme}-back.png` });
        }
        await clear();
      }
    }
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

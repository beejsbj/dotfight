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

  // --- a comic bubble or two ------------------------------------------------------------
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
      await seq(name, 26, 1000 / 12, { [name]: clip });
      await page.evaluate(() => window.pft.bubbles.reset());
    };
    await say("bubble-ready", "ready", men[0].id, await box(camp, 150));
    await say("bubble-idle", "idle", men[3].id, await box(camp, 150));
    await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
    await step(0, 150);
    await say("bubble-birdseye", "phew", men[1].id);
  }
  // --- balloons: stills, fully written, on each paper, leaning in and from bird's-eye ------
  if (want("balloons")) {
    for (const theme of (process.env.THEMES ?? "lamplight,blueprint").split(",")) {
      await page.evaluate((id) => window.pft.theme?.apply(id), theme);
      await war(7, 12);
      const camp = await fullest("mine");
      const men = await menIn(camp);
      // the topmost and the bottom-most of his men, to see the balloon kept on the page
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
        await step(700, 150);
        await page.screenshot(clip ? { path: `${out}/${name}.png`, clip } : { path: `${out}/${name}.png` });
        console.log(`shot ${name}: "${ok}"`);
        await page.evaluate(() => window.pft.bubbles.reset());
        await step(500, 100);
      };
      await flat(camp, 2.4);
      await hold(`balloon-${theme}-lean-dawood`, "idle", men[2].id, "for Dawood!", await box(camp, 200));
      await hold(`balloon-${theme}-lean-ready`, "ready", men[0].id, "I'm ready", await box(camp, 200));
      await hold(`balloon-${theme}-lean-phew`, "phew", men[4].id, "phew", await box(camp, 200));
      await page.evaluate(() => { window.pft.cam.overview(); window.pft.cam.snap(); window.pft.poke(); });
      await step(0, 150);
      await hold(`balloon-${theme}-bird-dawood`, "idle", men[2].id, "for Dawood!");
      await hold(`balloon-${theme}-bird-close`, "phew", men[1].id, "close one");
      await hold(`balloon-${theme}-bird-edge`, "idle", edge.id, "for Dawood!");
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

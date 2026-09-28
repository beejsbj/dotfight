import { describe, expect, it } from "vitest";
import { botBase, botFlick } from "./bot";
import { pull, release, wobble, type Aim as Pull } from "./flick";
import { alive, canPlaceBase, newGame, rng, type Flick } from "./game";
import { GUN, GunHold, gunPull, nudge, NUDGE, pose, Steadiness, wrap, type GunEvent, type Motion, type Orientation } from "./motion";
import { apply, file, unfile } from "./record";
import { FEEL } from "./rules";
import botSrc from "./bot.ts?raw";
import gameSrc from "./game.ts?raw";
import recordSrc from "./record.ts?raw";

const deg = (r: number) => (r * 180) / Math.PI;
const still = { rate: { alpha: 0.3, beta: -0.2, gamma: 0.1 }, accel: { x: 0, y: 0, z: 0 } };

// A stream of readings at 60 Hz between two orientations, with a rotation
// rate that matches the movement plus some hand noise.
function* sweep(from: Orientation, to: Orientation, ms: number, t0: number, noise = 0.5, rand = rng(1)) {
  const n = Math.max(1, Math.round(ms / 16));
  const rate = (k: keyof Orientation) => ((to[k] - from[k]) / ms) * 1000;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const o = { alpha: from.alpha + (to.alpha - from.alpha) * f, beta: from.beta + (to.beta - from.beta) * f, gamma: from.gamma + (to.gamma - from.gamma) * f };
    const j = () => (rand() * 2 - 1) * noise;
    const m: Motion = { rate: { alpha: rate("beta") + j(), beta: rate("gamma") + j(), gamma: rate("alpha") + j() }, accel: { x: 0, y: 0, z: 0 } };
    yield { o, m, t: t0 + i * 16 };
  }
}

/** Feed a gun a sequence of sweeps; returns what it said and when. */
function drive(gun: GunHold, legs: [Orientation, number, number?][], start: Orientation) {
  let at = start, t = 0;
  const events: (GunEvent & { t_ms: number })[] = [];
  gun.feed(start, still, 0);
  for (const [to, ms, noise] of legs) {
    for (const r of sweep(at, to, ms, t, noise)) {
      // as a phone sends them: an orientation event, then a motion event a moment later
      gun.feed(r.o, null, r.t);
      gun.feed(null, r.m, r.t + 1);
      const e = gun.take();
      if (e) events.push({ ...e, t_ms: r.t });
      t = r.t;
    }
    at = to;
  }
  return { events, t, at };
}

// A wrist snap: a burst of fast rotation lasting ~100ms, peaking at `peak` deg/s.
function snap(gun: GunHold, at: Orientation, t0: number, peak: number) {
  let e: GunEvent | null = null;
  for (let i = 1; i <= 12 && !e; i++) {
    const w = peak * Math.sin(Math.min(1, i / 7) * Math.PI);
    const o = { ...at, beta: at.beta - i * 3 }; // the phone pitches forward as it snaps
    gun.feed(o, { rate: { alpha: -w, beta: w * 0.2, gamma: 0 }, accel: { x: 0, y: 2, z: 0 } }, t0 + i * 16);
    e = gun.take();
  }
  return e;
}

describe("pose", () => {
  it("points the same way held flat like a remote or upright like a camera", () => {
    const flat = pose({ alpha: 30, beta: 0, gamma: 0 });
    const up = pose({ alpha: 30, beta: 90, gamma: 0 });
    expect(wrap(flat.heading - up.heading)).toBeCloseTo(0, 6);
    expect(deg(up.pitch)).toBeGreaterThan(deg(flat.pitch) + 40);
  });

  it("reads a turn to the right as a turn to the right, even upright where Euler angles lock", () => {
    // flat: turning right lowers alpha
    const a = pose({ alpha: 0, beta: 0, gamma: 0 }), b = pose({ alpha: -20, beta: 0, gamma: 0 });
    expect(deg(wrap(b.heading - a.heading))).toBeCloseTo(-20, 3);
    // upright (beta 90): the same physical turn right shows up in alpha, and is still 20° right
    const c = pose({ alpha: 0, beta: 90, gamma: 0 }), d = pose({ alpha: -20, beta: 90, gamma: 0 });
    expect(deg(wrap(d.heading - c.heading))).toBeCloseTo(-20, 3);
    expect(deg(d.roll)).toBeCloseTo(0, 3);
  });

  it("measures roll as the right edge dipping, whatever the grip", () => {
    expect(deg(pose({ alpha: 0, beta: 0, gamma: 15 }).roll)).toBeCloseTo(15, 3);
    expect(deg(pose({ alpha: 0, beta: 50, gamma: 15 }).roll)).toBeGreaterThan(5);
    expect(pose({ alpha: 0, beta: 50, gamma: -15 }).roll).toBeLessThan(0);
  });
});

describe("level 1: tilt nudge", () => {
  const held = pose({ alpha: 10, beta: 45, gamma: 8 }); // however you happen to hold it

  it("is neutral in whatever grip the pull started in", () => {
    expect(nudge(held, held)).toEqual({ angle: 0, side: 0 });
  });

  it("trims the aim toward the tilt, a few degrees, and never more than its cap", () => {
    const right = nudge(held, pose({ alpha: 10, beta: 45, gamma: 18 }));
    const left = nudge(held, pose({ alpha: 10, beta: 45, gamma: -2 }));
    expect(right.angle).toBeGreaterThan(0);
    expect(left.angle).toBeLessThan(0);
    expect(deg(right.angle)).toBeGreaterThan(2);
    expect(deg(right.angle)).toBeLessThan(7);
    expect(right.side).toBeGreaterThan(0); // the pen leans the same way
    const hard = nudge(held, pose({ alpha: 10, beta: 45, gamma: 80 }));
    expect(hard.angle).toBeLessThanOrEqual(NUDGE.max);
    expect(nudge(held, pose({ alpha: 10, beta: 45, gamma: 80 }), 2).angle).toBeLessThanOrEqual(NUDGE.max * 2);
  });

  it("turns with sensitivity", () => {
    const to = pose({ alpha: 10, beta: 45, gamma: 16 });
    expect(nudge(held, to, 2).angle).toBeCloseTo(nudge(held, to, 1).angle * 2, 9);
  });
});

describe("level 2: hand steadiness", () => {
  const feed = (noise: number, ms = 1500) => {
    const st = new Steadiness(), rand = rng(5);
    for (let t = 0; t < ms; t += 16) {
      const j = () => (rand() * 2 - 1) * noise;
      st.feed({ rate: { alpha: j(), beta: j(), gamma: j() } }, t);
    }
    return st;
  };

  it("is today's wobble until the gyro has said anything", () => {
    expect(new Steadiness().factor()).toBeCloseTo(1, 9);
    const st = new Steadiness();
    st.feed({ rate: null }, 0);
    expect(st.factor()).toBeCloseTo(1, 9);
  });

  it("calms the wobble for a steady hand and grows it for a shaky one", () => {
    const steady = feed(0.5).factor(), ordinary = feed(6).factor(), shaky = feed(45).factor();
    expect(steady).toBeLessThan(0.4);
    expect(ordinary).toBeGreaterThan(0.6);
    expect(ordinary).toBeLessThan(1.4);
    expect(shaky).toBeGreaterThan(2);
    expect(shaky).toBeLessThanOrEqual(2.5);
  });

  it("scales the flick's real wobble, not just the picture", () => {
    const a: Pull = { soldierId: 0, kind: "shoot", ax: 0, ay: 0, x: 0, y: FEEL.maxPullPx, t0: 0, charged: true };
    // held long enough that the wobble is fully grown; caught near a swing, not a zero crossing
    let t = 2500;
    for (let u = 2500; u < 3500; u += 10) if (Math.abs(wobble(a, u)) > Math.abs(wobble(a, t))) t = u;
    const base = wobble(a, t);
    expect(Math.abs(base)).toBeGreaterThan(0.01);
    expect(wobble({ ...a, steady: 0.3 }, t)).toBeCloseTo(base * 0.3, 9);
    // and the released flick carries it: same seed, only the hand differs
    const f1 = release({ ...a, steady: 0.3 }, t, rng(9))!, f2 = release({ ...a, steady: 2.5 }, t, rng(9))!;
    expect(f2.angle - f1.angle).toBeCloseTo(base * 2.2, 9);
  });
});

describe("level 3: gun hold", () => {
  const flat: Orientation = { alpha: 0, beta: 5, gamma: 0 };
  const upright: Orientation = { alpha: 0, beta: 80, gamma: 0 };
  const right20: Orientation = { alpha: -20, beta: 80, gamma: 0 };

  it("doesn't fire while you raise the phone, however fast", () => {
    const gun = new GunHold();
    const { events } = drive(gun, [[upright, 250]], flat); // 300°/s raise
    expect(events).toEqual([]);
  });

  it("aims where the phone points, re-centred on entry, and arms once you hold still", () => {
    const gun = new GunHold();
    gun.centre({ alpha: 123, beta: 70, gamma: 0 }); // stale calibration from earlier
    gun.centre(flat); // entry re-centres
    const r = drive(gun, [[upright, 500], [right20, 600], [right20, 400]], flat);
    expect(r.events).toEqual([]);
    expect(deg(gun.delta)).toBeCloseTo(20, 0);
    expect(gun.armed).toBe(1);
  });

  it("is not armed while you're still swinging the phone round", () => {
    const gun = new GunHold();
    drive(gun, [[upright, 500], [right20, 200]], flat);
    expect(gun.armed).toBeLessThan(1);
    expect(snap(gun, right20, 2000, 700)).toBeNull();
  });

  it("fires on a wrist snap at the aim you held, with power from how hard you snapped", () => {
    const shot = (peak: number) => {
      const gun = new GunHold();
      const r = drive(gun, [[upright, 500], [right20, 600], [right20, 400]], flat);
      const e = snap(gun, r.at, r.t, peak);
      expect(e?.t).toBe("fire");
      return e as Extract<GunEvent, { t: "fire" }>;
    };
    const soft = shot(300), hard = shot(900);
    expect(deg(soft.delta)).toBeCloseTo(20, 0); // the snap swung the phone; the shot didn't
    expect(deg(hard.delta)).toBeCloseTo(20, 0);
    expect(soft.power).toBeLessThan(hard.power);
    expect(soft.power).toBeGreaterThanOrEqual(0.2);
    expect(hard.power).toBeLessThanOrEqual(1);
  });

  it("fires on a shake from a phone without a gyro", () => {
    const gun = new GunHold();
    gun.centre(upright);
    for (let t = 0; t < 500; t += 16) gun.feed(upright, { rate: null, accel: { x: 0.1, y: 0, z: 0 } }, t);
    expect(gun.armed).toBe(1);
    let e: GunEvent | null = null;
    for (let t = 500, i = 0; i < 10 && !e; i++, t += 16) {
      gun.feed(upright, { rate: null, accel: { x: i < 5 ? 25 : 0, y: 0, z: 0 } }, t);
      e = gun.take();
    }
    expect(e?.t).toBe("fire");
  });

  it("ends when you lower the phone, and a quick snap down is a shot, not a lower", () => {
    const gun = new GunHold();
    const r = drive(gun, [[upright, 500], [upright, 400], [{ alpha: 0, beta: 10, gamma: 0 }, 900, 1]], flat);
    expect(r.events.map((e) => e.t)).toEqual(["lowered"]);
    const gun2 = new GunHold();
    const r2 = drive(gun2, [[upright, 500], [upright, 400]], flat);
    expect(snap(gun2, r2.at, r2.t, 800)?.t).toBe("fire");
  });

  it("turns the page faster at keen sensitivity", () => {
    const keen = new GunHold(2);
    drive(keen, [[upright, 500], [right20, 600], [right20, 400]], flat);
    expect(deg(keen.delta)).toBeCloseTo(40, 0);
  });
});

describe("determinism: the engine never reads a sensor", () => {
  it("a war fought with sensor-shaped flicks replays from its record to the same page", () => {
    const s = newGame(21, { no: 1, date: "26 Sep 2026" });
    let k = 3;
    while (s.phase === "setup") {
      const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!;
      apply(s, { t: "base", x: spot.x, y: spot.y });
    }
    const hand = rng(77); // the release error, as Math.random would give it in the game
    const levels = ["nudge", "steady", "gun"] as const;
    let turn = 0;
    while (s.phase === "play" && s.turn < 60) {
      if (s.current === 1) { apply(s, { t: "flick", f: botFlick(s, 1, k++) }); continue; }
      // player 0 aims the way the bot would, then the phone gets its say
      const plan = botFlick(s, 2, k++);
      const lvl = levels[turn++ % 3];
      let f: Flick | null;
      if (lvl === "gun") {
        const gun = new GunHold();
        const aimAt: Orientation = { alpha: -deg(wrap(plan.angle + Math.PI / 2)), beta: 80, gamma: 0 };
        const r = drive(gun, [[{ alpha: 0, beta: 80, gamma: 0 }, 300], [aimAt, 500], [aimAt, 400]], { alpha: 0, beta: 10, gamma: 0 });
        const e = snap(gun, r.at, r.t, 300 + (turn % 5) * 120) as Extract<GunEvent, { t: "fire" }>;
        f = release(gunPull(plan.soldierId, plan.kind, -Math.PI / 2 + e.delta, e.power, 0), 0, hand);
      } else {
        const d = 30 + ((turn * 37) % 100);
        const a: Pull = { soldierId: plan.soldierId, kind: plan.kind, ax: 0, ay: 0, x: 0, y: 0, t0: 0, charged: true };
        let ang = plan.angle;
        if (lvl === "nudge") ang += nudge(pose({ alpha: 0, beta: 40, gamma: 0 }), pose({ alpha: 0, beta: 40, gamma: (turn % 7) * 4 - 12 })).angle;
        else { const st = new Steadiness(); for (let t = 0; t < 800; t += 16) st.feed({ rate: { alpha: turn % 30, beta: 1, gamma: -1 } }, t); a.steady = st.factor(); }
        a.x = -Math.cos(ang) * d;
        a.y = -Math.sin(ang) * d;
        f = release(a, 2500, hand);
      }
      apply(s, { t: "flick", f: f ?? plan });
    }
    expect(turn).toBeGreaterThan(6);
    expect(s.flicks.length).toBeGreaterThan(12);
    expect(s.marks.filter((m) => m.t === "cross").length).toBeGreaterThan(3); // the shots landed ink that mattered
    // the record is only engine inputs: no sensor reading rides along
    for (const f of s.flicks) expect(Object.keys(f).sort()).toEqual(["angle", "bend", "kind", "length", "soldierId"]);
    const again = unfile(JSON.parse(JSON.stringify(file(s, { kind: "bot", level: 1 }))));
    expect(again).toEqual(s);
    expect(alive(again, 0).length + alive(again, 1).length).toBe(alive(s, 0).length + alive(s, 1).length);
  });

  it("keeps sensors out of the engine and the record", () => {
    for (const src of [gameSrc, recordSrc, botSrc]) expect(src).not.toMatch(/motion|deviceorientation|devicemotion/i);
  });
});

// Keep the pull helper honest: a gun shot is a pull like any other.
describe("gunPull", () => {
  it("is the pull-back that points that way with that power", () => {
    const p = pull(gunPull(3, "move", 0.7, 0.6, 100));
    expect(p.angle).toBeCloseTo(0.7, 9);
    expect(p.power).toBeCloseTo(0.6, 9);
    expect(p.live).toBe(true);
    expect(GUN.fire).toBeGreaterThan(GUN.still); // a snap can't be mistaken for holding still
  });
});

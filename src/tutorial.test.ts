// The lesson (src/tutorial.ts): its page, its steps, and whether each asked-for
// shot is there to be made, measured on the engine with a human hand.

import { describe, expect, it } from "vitest";
import { HUMAN, shake } from "./bot";
import { act, garrison, inside, isRing, powerFor, preview, type Action, type GameState, type Player } from "./game";
import { rng } from "./geom";
import { file, readSave, unfile, type Save } from "./record";
import {
  CAMPS, LESSON_MODE, LESSON_SEED, LESSON_SIZE, STEPS, advance, canSkip, crashLunge, current, emptyRing, findLunge, findRow, finished, firstUndone, foeMove, foeSeed, gentleSnipe, isLesson, lessonGame, nearestMan, outsideMen, roadShot, setupActions, skipStep, sortie, stepIndex, type Last, type Run,
} from "./tutorial";

const B1 = 0, R1 = 1, B3 = 4, R3 = 5;
type FlickAction = Extract<Action, { t: "flick" }>;
const flick = (soldier: number, kind: "snipe" | "lunge", angle: number, length: number, wob = 1): FlickAction => ({ t: "flick", soldier, kind, angle, length, bend: 0, wob });
const STOP: Action = { t: "stop" };
const at = (s: GameState, id: number) => s.soldiers[id];
const angleTo = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** How often a human hand (the rules lab's model of one) makes this shot: the share of `n` tries `ok` passes. */
function odds(s: GameState, it: { soldier: number; kind: "snipe" | "lunge"; angle: number; length: number }, ok: (o: ReturnType<typeof preview>) => boolean, n = 400) {
  const rand = rng(99);
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const f = shake(s, { kind: it.kind, soldier: it.soldier, angle: it.angle, power: powerFor(s.rules, it.length) }, HUMAN, rand);
    if (ok(preview(s, f))) hit++;
  }
  return hit / n;
}

describe("the lesson's page", () => {
  it("is three camps of four a side, blue below, red above, ready for blue's first flick", () => {
    const s = lessonGame();
    expect(s.phase).toBe("play");
    expect(s.current).toBe(0);
    expect(s.turn).toBe(1);
    expect(s.size).toEqual(LESSON_SIZE);
    expect(s.seed).toBe(LESSON_SEED);
    expect(s.rules.long).toBeNull();
    expect(s.bases).toHaveLength(6);
    s.bases.forEach((b, i) => { expect(b.owner).toBe(CAMPS[i].owner); expect(b.y > 850).toBe(b.owner === 0); });
    expect(s.soldiers.filter((x) => x.owner === 0)).toHaveLength(12);
    expect(s.soldiers.filter((x) => x.owner === 1)).toHaveLength(12);
  });

  it("lays the lessons out: R1 full, R2 half out on the paper, R3 an empty ring with its four outside", () => {
    const s = lessonGame();
    expect(garrison(s, s.bases[R1])).toHaveLength(4);
    expect(garrison(s, s.bases[3])).toHaveLength(2);
    expect(isRing(s, s.bases[R3])).toBe(true);
    expect(outsideMen(s, 1).map((x) => x.id)).toEqual([12, 13, 20, 21, 22, 23]);
    // nobody stands on anyone, and every arranged man is within reach of his own wall
    for (const a of s.soldiers) for (const b of s.soldiers) if (a.id < b.id) expect(dist(a, b)).toBeGreaterThan(16);
    for (const x of s.soldiers) expect(dist(x, s.bases[x.home!]) - s.bases[x.home!].r).toBeLessThanOrEqual(s.rules.positionReach + 1e-9);
  });

  it("is a normal core game: the setup is legal actions, it files and replays exactly, and a save keeps it a lesson", () => {
    const s = lessonGame({ no: 1, date: "today" });
    expect(s.actions).toEqual(setupActions());
    const filed = JSON.parse(JSON.stringify(file(s, LESSON_MODE)));
    expect(unfile(filed)).toEqual(s);
    expect(isLesson(filed.mode)).toBe(true);
    const saved = readSave(JSON.stringify({ s, mode: LESSON_MODE } satisfies Save))!;
    expect(saved.mode).toEqual({ kind: "bot", level: 0, lesson: true });
    expect(isLesson(readSave(JSON.stringify({ s, mode: { kind: "bot", level: 0 } }))!.mode)).toBe(false);
  });
});

describe("the shots the steps ask for", () => {
  it("two with one line: B3's shooter has two of R3's men in a row on open paper, and a human hand takes both more often than not", () => {
    const s = lessonGame();
    const row = findRow(s, 0)!;
    expect(row).not.toBeNull();
    expect(s.soldiers[row.soldier].home).toBe(B3);
    expect(row.targets.sort()).toEqual([20, 21]);
    const o = preview(s, flick(row.soldier, "snipe", row.angle, row.length));
    expect(o.killed).toHaveLength(2);
    expect(o.earned).toBe(false); // preview doesn't score; act does
    expect(o.events.filter((e) => e.kind === "wall" && !e.free)).toHaveLength(0);
    expect(odds(s, { ...row, kind: "snipe" }, (p) => p.killed.length >= 2)).toBeGreaterThan(0.5);
    const s2 = lessonGame();
    expect(act(s2, flick(row.soldier, "snipe", row.angle, row.length)).earned).toBe(true);
    expect(s2.left).toBe(1);
  });

  it("the wall: a snipe straight into full R1 loses 85% at its wall and dies just inside", () => {
    const s = lessonGame();
    const me = at(s, 16);
    const o = preview(s, flick(me.id, "snipe", angleTo(me, s.bases[R1]), dist(me, s.bases[R1]) + 150));
    const wall = o.events.find((e) => e.kind === "wall" && !e.free)!;
    expect(wall.cost).toBeCloseTo(0.85, 2);
    const end = o.path[o.path.length - 1];
    expect(dist(end, wall.at)).toBeLessThan(45);
    expect(dist(end, s.bases[R1])).toBeGreaterThan(s.bases[R1].r - 45); // nowhere near the middle
    // a full-power flick gets further in (and is wild): the lesson's point is the wall, not a miss
    expect(STEPS[stepIndex("wall")].done(s, { who: 0, f: flick(me.id, "snipe", angleTo(me, s.bases[R1]), 2000), o: preview(s, flick(me.id, "snipe", angleTo(me, s.bases[R1]), 2000)) })).toBe(true);
  });

  it("men outside: the ones on the paper fall to a snipe that crosses no manned wall, most of the time from close by", () => {
    const s = lessonGame();
    const me = at(s, 16);
    const shot = (t: number) => ({ soldier: me.id, kind: "snipe" as const, angle: angleTo(me, at(s, t)), length: dist(me, at(s, t)) + 90 });
    for (const t of [22, 23, 12, 13]) {
      const it = shot(t);
      const o = preview(s, flick(it.soldier, it.kind, it.angle, it.length));
      expect(o.killed).toContain(t);
      const kill = o.events.find((e) => e.kind === "kill")!;
      expect(o.events.filter((e) => e.kind === "wall" && !e.free && e.d < kill.d)).toHaveLength(0);
      expect(STEPS[stepIndex("open")].done(s, { who: 0, f: flick(it.soldier, it.kind, it.angle, it.length), o })).toBe(true);
    }
    // R3's two below the ring are a short, sure line from B3; R2's pair across the page is a long one
    expect(odds(s, shot(22), (p) => p.killed.includes(22))).toBeGreaterThan(0.6);
    expect(odds(s, shot(12), (p) => p.killed.includes(12))).toBeGreaterThan(0.3);
  });

  it("the lunge: one of B3's men can run through an R3 man and land clear, and usually does", () => {
    const s = lessonGame();
    const l = findLunge(s, 0)!;
    expect(l).not.toBeNull();
    expect(l.length).toBeLessThan(400);
    const o = preview(s, flick(l.soldier, "lunge", l.angle, l.length, 7));
    expect(o.killed).toContain(l.target);
    expect(o.lost).toBe(false);
    expect(odds(s, { ...l, kind: "lunge" }, (p) => p.killed.length >= 1 && !p.lost)).toBeGreaterThan(0.5);
    expect(odds(s, { ...l, kind: "lunge" }, (p) => p.lost)).toBe(0); // nothing of ours is at stake
  });

  it("the empty ring: a lunge into R3 lands safe (and a wrong length lands on paper, not among men)", () => {
    const s = lessonGame();
    const ring = emptyRing(s, 1, s.bases[B3])!;
    expect(ring.id).toBe(R3);
    const me = at(s, 16);
    const o = preview(s, flick(me.id, "lunge", angleTo(me, ring), dist(me, ring), 3));
    expect(o.lost).toBe(false);
    expect(dist(o.movedTo!, ring)).toBeLessThanOrEqual(ring.r);
    const it = { soldier: me.id, kind: "lunge" as const, angle: angleTo(me, ring), length: dist(me, ring) };
    expect(odds(s, it, (p) => !p.lost && dist(p.movedTo!, ring) <= ring.r)).toBeGreaterThan(0.5);
    expect(odds(s, it, (p) => p.lost)).toBe(0);
  });
});

describe("Dawood-bot, held gentle", () => {
  it("snipes with a sloppy hand: the same page and seed give the same flick, and he never lunges or sends", () => {
    const s = lessonGame();
    const a = foeMove({ ...s, current: 1 }, 0), b = foeMove({ ...s, current: 1 }, 0);
    expect(a).toEqual(b);
    expect(a.t).toBe("flick");
    expect((a as Extract<Action, { t: "flick" }>).kind).toBe("snipe");
    expect(foeSeed(s)).toBe(foeSeed(lessonGame()));
    let kills = 0;
    for (let k = 0; k < 200; k++) {
      const f = gentleSnipe({ ...s, current: 1 }, rng(k));
      expect(f.t).toBe("flick");
      kills += preview(s, f as Extract<Action, { t: "flick" }>).killed.length;
    }
    expect(kills / 200).toBeGreaterThan(0.03);
    expect(kills / 200).toBeLessThan(0.7);
  });

  it("stops rather than take an earned lunge", () => {
    const s = lessonGame();
    expect(gentleSnipe({ ...s, current: 1, chain: { soldier: 20, link: 1 } }, rng(1))).toEqual(STOP);
  });

  it("the demonstration: one of his men lunges into one of blue's manned camps and is shot where he lands", () => {
    const s = lessonGame();
    const a = crashLunge({ ...s, current: 1 }, rng(5))!;
    expect(a).not.toBeNull();
    expect(a.t).toBe("flick");
    const f = a as Extract<Action, { t: "flick" }>;
    expect(f.kind).toBe("lunge");
    const o = preview(s, f);
    expect(o.lost).toBe(true);
    expect(o.crashed).toBeDefined();
    expect(s.bases[o.crashed!].owner).toBe(0);
    expect(crashLunge({ ...s, current: 1 }, rng(5))).toEqual(a);
    expect(foeMove({ ...s, current: 1 }, stepIndex("shot"))).toEqual(foeMove({ ...s, current: 1 }, stepIndex("shot")));
  });

  it("at the end his men come out: a lunge from a camp that lands on the open paper, short of blue's men", () => {
    const s = lessonGame();
    const a = sortie({ ...s, current: 1 }, rng(3)) as FlickAction;
    expect(a.kind).toBe("lunge");
    expect(s.soldiers[a.soldier].owner).toBe(1);
    const o = preview(s, a);
    expect(o.lost).toBe(false);
    expect(s.bases.some((b) => inside(b, o.movedTo!))).toBe(false);
    expect(foeMove({ ...s, current: 1 }, stepIndex("stand"))).toEqual(foeMove({ ...s, current: 1 }, stepIndex("stand")));
    // nobody left inside: he snipes from where he stands
    const out = { ...s, soldiers: s.soldiers.map((x) => (x.owner === 1 && x.home !== R3 ? { ...x, alive: false } : x)) };
    expect(sortie(out, rng(3))).toBeNull();
    expect((foeMove({ ...out, current: 1 }, stepIndex("stand")) as FlickAction).kind).toBe("snipe");
  });

  it("a convoy on the road draws his fire", () => {
    const s = lessonGame();
    expect(roadShot(s, rng(1))).toBeNull();
    act(s, { t: "send", from: B1, to: B3, n: 2 });
    act(s, flick(16, "snipe", -Math.PI / 2, 300));
    expect(s.current).toBe(1);
    expect(s.convoys[0].state).toBe("road");
    const a = roadShot(s, rng(2))!;
    expect(a.t).toBe("flick");
    const walkers = s.soldiers.filter((x) => x.convoy === 0);
    const o = preview(s, a as Extract<Action, { t: "flick" }>);
    // aimed at the column: the line passes within a dot or two of its middle
    const mid = { x: walkers.reduce((q, w) => q + w.x, 0) / 2, y: walkers.reduce((q, w) => q + w.y, 0) / 2 };
    expect(Math.min(...o.path.map((p) => dist(p, mid)))).toBeLessThan(30);
  });
});

/** A player who does what the note asks, with a steady hand. */
function pupil(s: GameState, step: string): Action {
  const me = (to: { x: number; y: number }) => s.soldiers.filter((x) => x.alive && x.owner === 0 && x.convoy === undefined).sort((a, b) => dist(a, to) - dist(b, to))[0];
  const outside = outsideMen(s, 1);
  const foes = s.soldiers.filter((x) => x.alive && x.owner === 1);
  // a man in the open with a short sure line; a man in a camp with a hard one that reaches through its wall
  const nearest = () => {
    const open = outside.sort((a, b) => dist(a, s.bases[B3]) - dist(b, s.bases[B3]))[0];
    if (open) { const m = me(open); return flick(m.id, "snipe", angleTo(m, open), dist(m, open) + 100, s.actions.length); }
    const t = foes.sort((a, b) => dist(a, s.bases[B3]) - dist(b, s.bases[B3]))[0];
    const m = me(t);
    return flick(m.id, "snipe", angleTo(m, t), 2000, s.actions.length);
  };
  if (s.chain) return STOP;
  const row = findRow(s, 0);
  switch (step) {
    case "flick": case "snipe": case "two": return row ? flick(row.soldier, "snipe", row.angle, row.length, 1) : nearest();
    case "wall": { const m = me(s.bases[R1]); return flick(m.id, "snipe", angleTo(m, s.bases[R1]), 1500, 1); }
    case "lunge": { const l = findLunge(s, 0); return l ? flick(l.soldier, "lunge", l.angle, l.length, 11) : nearest(); }
    case "ring": { const r = emptyRing(s, 1, s.bases[B3]); if (!r) return nearest(); const m = nearestMan(s, 0, r); return flick(m.id, "lunge", angleTo(m, r), Math.max(dist(m, r), 200), 5); }
    case "send": return { t: "send", from: B1, to: B3, n: 2 };
    default: return nearest();
  }
}

/** The whole lesson, played through the engine by the pupil and the scripted bot. */
function school(maxMoves = 160) {
  const s = lessonGame();
  const run: Run = { step: 0, tries: 0, seen: -1 };
  let last: Last | null = null;
  const learned: string[] = [];
  const log: string[] = [];
  for (let k = 0; k < maxMoves && s.phase !== "over"; k++) {
    learned.push(...advance(run, s, last));
    const who = s.current as Player;
    const a = who === 0 ? pupil(s, current(run).id) : foeMove(s, run.step);
    const o = act(s, a);
    log.push(`${who}:${a.t === "flick" ? `${a.kind} ${o.killed.length}${o.lost ? " lost" : ""}` : a.t} @${current(run).id}`);
    last = a.t === "flick" ? { who, f: a, o } : { who, a };
  }
  learned.push(...advance(run, s, last));
  return { s, run, learned, log };
}

describe("the steps, in order", () => {
  it("has the six lessons in the issue's order, each with a note", () => {
    expect(STEPS.map((st) => st.id)).toEqual(["flick", "snipe", "two", "wall", "open", "lunge", "shot", "ring", "send", "road", "stand"]);
    const s = lessonGame();
    for (const st of STEPS) {
      const m = st.marks(s);
      expect(m.notes.length).toBeGreaterThan(0);
      for (const n of m.notes) for (const line of n.lines) expect(line.length).toBeLessThanOrEqual(38);
      expect(st.title).toMatch(/^lesson [1-6] of 6: /);
      expect(st.title.length).toBeLessThanOrEqual(30);
      // a heading and at most two short lines: the note fits the clear band above R3
      for (const n of m.notes) expect(n.lines.length).toBeLessThanOrEqual(2);
    }
  });

  it("the first step is done by any flick; a snipe that takes two does 'snipe' and 'two' at once; a move is judged once", () => {
    const s = lessonGame();
    const run: Run = { step: 0, tries: 0, seen: -1 };
    expect(advance(run, s, null)).toEqual([]);
    const row = findRow(s, 0)!;
    const f = flick(row.soldier, "snipe", row.angle, row.length);
    const o = act(s, f);
    expect(advance(run, s, { who: 0, f, o })).toEqual(["flick", "snipe", "two"]);
    expect(current(run).id).toBe("wall");
    expect(advance(run, s, { who: 0, f, o })).toEqual([]);
    expect(run.tries).toBe(0);
  });

  it("a miss counts a try; three tries let the step be skipped, unlearned", () => {
    const s = lessonGame();
    const run: Run = { step: stepIndex("two"), tries: 0, seen: -1 };
    const me = at(s, 16);
    for (let k = 0; k < 3; k++) {
      const f = flick(me.id, "snipe", -Math.PI / 2 + 0.6, 250);
      const o = act(s, f);
      act(s, foeMove(s, run.step));
      expect(advance(run, s, { who: 0, f, o })).toEqual([]);
    }
    expect(run.tries).toBe(3);
    expect(canSkip(run)).toBe(true);
    // the last step has nothing after it: no skip offered, however many tries
    expect(canSkip({ step: STEPS.length - 1, tries: 9, seen: -1 })).toBe(false);
    skipStep(run);
    expect(current(run).id).toBe("wall");
    expect(run.tries).toBe(0);
  });

  it("a returning player picks up at the first step not yet learned", () => {
    const done = new Set(["lesson:flick", "lesson:snipe", "lesson:two"]);
    expect(firstUndone((k) => done.has(k))).toBe(stepIndex("wall"));
    expect(firstUndone(() => false)).toBe(0);
    expect(firstUndone(() => true)).toBe(STEPS.length - 1);
  });

  it("'shot' is done by the bot's lunge, 'send' by a send, 'road' once the convoy is home, 'stand' by the win", () => {
    const s = lessonGame();
    const shot: Run = { step: stepIndex("shot"), tries: 0, seen: -1 };
    const a = foeMove({ ...s, current: 1 }, shot.step) as Extract<Action, { t: "flick" }>;
    expect(a.kind).toBe("lunge");
    const o = preview(s, a);
    expect(advance(shot, s, { who: 1, f: a, o })).toEqual(["shot"]);
    const send: Run = { step: stepIndex("send"), tries: 0, seen: -1 };
    expect(advance(send, s, { who: 0, a: { t: "send", from: B1, to: B3, n: 1 } })).toEqual(["send"]);
    expect(current(send).id).toBe("road");
    expect(advance(send, { ...s, actions: [...s.actions, STOP] }, null)).toEqual([]);
    const home: GameState = { ...s, actions: [...s.actions, STOP, STOP], convoys: [{ id: 0, owner: 0, from: B1, to: B3, ids: [0], state: "arrived", road: [s.bases[B1], s.bases[B3]], turn: 1 }] };
    expect(advance(send, home, null)).toEqual(["road"]);
    expect(current(send).id).toBe("stand");
    expect(finished(send)).toBe(false);
    expect(advance(send, { ...home, phase: "over", winner: 0, actions: [...home.actions, STOP] }, null)).toEqual(["stand"]);
    expect(finished(send)).toBe(true);
  });

  it("a pupil who does what each note asks learns every step in order and wins the battle inside 30 turns", () => {
    const { s, learned, log } = school();
    expect(learned, log.join("\n")).toEqual(STEPS.map((st) => st.id));
    expect(s.phase, log.join("\n")).toBe("over");
    expect(s.winner, log.join("\n")).toBe(0);
    expect(s.turn).toBeLessThanOrEqual(30);
    // the lesson's own moments all happened: his man was shot in a camp of ours, and our convoy walked
    expect(log.some((l) => l.startsWith("1:lunge") && l.includes("lost"))).toBe(true);
    expect(s.convoys.some((c) => c.owner === 0 && c.state !== "ordered")).toBe(true);
  });

  it("the notes point at what's there: the row's rings and arrow, the full camp, the empty ring", () => {
    const s = lessonGame();
    const two = STEPS[stepIndex("two")].marks(s);
    expect(two.rings).toHaveLength(3);
    expect(two.arrows).toHaveLength(1);
    const wall = STEPS[stepIndex("wall")].marks(s);
    expect(wall.rings[0].at).toMatchObject({ x: CAMPS[R1].x, y: CAMPS[R1].y });
    const ring = STEPS[stepIndex("ring")].marks(s);
    expect(ring.rings[0].at).toMatchObject({ x: CAMPS[R3].x, y: CAMPS[R3].y });
    expect(inside(s.bases[R3], ring.arrows[0].to)).toBe(true);
    const stand = STEPS[stepIndex("stand")].marks(s);
    expect(stand.notes[0].lines.join(" ")).toContain("12 left.");
  });
});

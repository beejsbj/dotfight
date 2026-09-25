// Scenes for the round-2 screenshots: a seeded bot-vs-bot page, played on
// until the mechanic can happen, and a flick (found by searching with the
// engine's own preview) that makes it happen. The browser script loads each
// state and fires the flick with the real animation.
//
//   node --import ./scripts/ts-resolve.mjs scripts/round2-scenes.ts [out.json]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { botAction, botArrange, botBase } from "../src/bot";
import { apply, canPlaceBase, exposed, newGame, preview, ready, standing, stuck, pass, transfer, garrison, type Flick, type GameState, type Outcome } from "../src/game";
import { rng } from "../src/geom";
import { RULESETS } from "../src/rulesets";
import { byId } from "../src/lab/variants";

const find = (id: string) => RULESETS.find((r) => r.id === id) ?? byId(id)!;
const QUICK = { tries: 24, keep: 4, samples: 3, hand: 1, aim: 0.02, judge: 0.05 };

function play(id: string, seed: number, actions: number, until?: (s: GameState) => boolean): GameState {
  const s = newGame(find(id), seed, { no: 12, date: "25 Sep 2026" });
  const rand = rng(seed);
  while (s.phase === "setup") {
    const spot = botBase(s, (x, y, sh) => !canPlaceBase(s, x, y, sh), (rand() * 2 ** 32) >>> 0)!;
    apply(s, { t: "base", x: spot.x, y: spot.y, shape: spot.shape });
  }
  while (s.phase === "position") for (const a of botArrange(s, (rand() * 2 ** 32) >>> 0)) { try { apply(s, a); } catch { /* taken */ } if (a.t === "ready") break; }
  for (let n = 0; n < actions && s.phase === "play"; n++) {
    if (until?.(s)) break;
    if (stuck(s)) { pass(s); continue; }
    apply(s, botAction(s, QUICK, (rand() * 2 ** 32) >>> 0));
  }
  return s;
}

/** A flick from the current player that makes `want` true, searched at random. */
function search(s: GameState, seed: number, want: (o: Outcome, f: Flick) => boolean, kind?: Flick["kind"], tries = 6000): Flick | null {
  const rand = rng(seed);
  const mine = ready(s, s.current);
  const foes = exposed(s, s.current === 0 ? 1 : 0);
  for (let i = 0; i < tries; i++) {
    const me = mine[Math.floor(rand() * mine.length)];
    const k = kind ?? (rand() < 0.5 ? "shoot" : "move");
    const aimAt = foes.length && rand() < 0.6 ? foes[Math.floor(rand() * foes.length)] : null;
    const angle = aimAt ? Math.atan2(aimAt.y - me.y, aimAt.x - me.x) + (rand() - 0.5) * 0.3 : rand() * Math.PI * 2;
    const f: Flick = { soldierId: me.id, kind: k, angle, length: 300 + rand() * 1200, bend: (rand() - 0.5) * 0.06, wob: (rand() * 2 ** 32) >>> 0 };
    try { if (want(preview(s, f), f)) return f; } catch { /* illegal */ }
  }
  return null;
}

interface Scene { name: string; rules: string; state: GameState; flick?: Flick; send?: { from: number; to: number; n: number }; note: string; focus?: { x: number; y: number } }
const scenes: Scene[] = [];
const FOCUS: Record<string, (o: Outcome) => { x: number; y: number } | undefined> = {
  wobble: (o) => o.events.find((e) => e.jolt)?.at,
  groove: (o) => o.events.find((e) => e.kind === "groove")?.at,
  scribble: (o) => o.events.find((e) => e.kind === "absorb")?.at,
  lunge: (o) => o.movedTo,
  crash: (o) => o.path.at(-1),
  bank: (o) => o.events.find((e) => e.kind === "bounce")?.at,
  split: (o) => o.events.find((e) => e.kind === "split")?.at,
};
const add = (name: string, rules: string, state: GameState, note: string, extra: Partial<Scene> = {}) => {
  let focus = extra.focus;
  if (!focus && extra.flick && FOCUS[name]) focus = FOCUS[name](preview(state, extra.flick));
  if (!focus && name === "convoy") { const w = state.soldiers.filter((x) => x.alive && x.transit !== undefined); if (w.length) focus = { x: w[0].x, y: w[0].y }; }
  if (!focus && name === "empty") { const b = state.bases.find((b) => b.fallen !== undefined); if (b) focus = { x: b.x, y: b.y }; }
  if (!focus && (name === "send" || name === "position")) { const b = state.bases.find((b) => b.owner === state.current); if (b) focus = { x: b.x, y: b.y }; }
  scenes.push({ name, rules, state: JSON.parse(JSON.stringify(state)), note, ...extra, ...(focus && { focus: { x: focus.x, y: focus.y } }) });
  console.log(`${name}: ${extra.flick ? "flick found" : extra.send ? "send" : "state"} (turn ${state.turn}, ${state.marks.length} marks)`);
};

const PEN = process.env.PEN ?? "pen-physics", LS = process.env.LS ?? "lunge-snipe", BIL = process.env.BIL ?? "billiards";

// wobble: a steep crossing that jolts the line
{
  const s = play(PEN, 3, 40);
  const f = search(s, 1, (o) => o.events.filter((e) => e.jolt && Math.abs(e.jolt) > 0.08).length >= 2, "shoot");
  if (f) add("wobble", PEN, s, "the hand jolts at each steep crossing: a zigzag where it happened", { flick: f });
}
// groove: a pen drawn into a line and carried along it
{
  const s = play(PEN, 5, 50);
  const f = search(s, 2, (o) => o.events.some((e) => e.kind === "groove" && (e.len ?? 0) > 90));
  if (f) add("groove", PEN, s, "a slow pen meets a line nearly parallel and runs along its groove (= marks where it caught)", { flick: f });
}
// scribble cover
{
  const s = play(PEN, 9, 90);
  const f = search(s, 3, (o) => o.events.some((e) => e.kind === "absorb"), "shoot", 20000);
  if (f) add("scribble", PEN, s, "a line soaked up by a scribble: the blot where it stopped", { flick: f });
}
// lunge chain: a lunge through someone in the open
{
  const s = play(LS, 4, 60);
  const f = search(s, 4, (o) => o.killed.length >= 1 && !o.lost, "move", 20000);
  if (f) add("lunge", LS, s, "a lunge crosses someone out: lunge again (shakier) or stop", { flick: f });
}
// crash: a lunge into a manned enemy base
{
  const s = play(LS, 6, 20);
  const f = search(s, 5, (o) => o.crashed !== undefined, "move");
  if (f) add("crash", LS, s, "lunging into a manned enemy base: dead at the wall", { flick: f });
}
// walking convoy: a free send, walkers on the road
{
  const s = play(LS, 7, 16);
  const mine = standing(s, s.current).sort((a, b) => garrison(s, b).length - garrison(s, a).length);
  const from = mine[0], to = mine.filter((b) => b !== from).sort((a, b) => Math.hypot(b.x - from.x, b.y - from.y) - Math.hypot(a.x - from.x, a.y - from.y))[0];
  if (from && to) {
    add("send", LS, s, "a free send: the convoy walks the road on the page", { send: { from: from.id, to: to.id, n: Math.min(4, garrison(s, from).length - 1) } });
    transfer(s, from.id, to.id, Math.min(4, garrison(s, from).length - 1));
    pass(s);
    add("convoy", LS, s, "walkers stepping along their road; any line that touches one crosses him out", {});
  }
}
// empty ring
{
  const s = play(LS, 8, 400, (s) => s.bases.some((b) => b.fallen !== undefined));
  add("empty", LS, s, "an emptied base stays on the page as a ring, to be manned again", {});
}
// bank and split (billiards)
{
  const s = play(BIL, 10, 12);
  const f = search(s, 6, (o) => o.events.some((e) => e.kind === "bounce" && e.on === "bank") && o.killed.length > 0, "shoot", 20000)
    ?? search(s, 6, (o) => o.events.some((e) => e.kind === "bounce" && e.on === "bank"), "shoot");
  if (f) add("bank", BIL, s, "a glancing shot banks off a cushion (hexagon) wall", { flick: f });
  const g = search(s, 7, (o) => o.events.some((e) => e.kind === "split"), "shoot", 20000);
  if (g) add("split", BIL, s, "a shot passing out through its own prism (triangle) splits in two", { flick: g });
}
// positioning
{
  const R = find(process.env.POS ?? LS);
  if (R.position) {
    const s = newGame(R, 11, { no: 12, date: "25 Sep 2026" });
    const rand = rng(11);
    while (s.phase === "setup") {
      const spot = botBase(s, (x, y, sh) => !canPlaceBase(s, x, y, sh), (rand() * 2 ** 32) >>> 0)!;
      apply(s, { t: "base", x: spot.x, y: spot.y, shape: spot.shape });
    }
    add("position", R.id, s, "before the first flick: drag your soldiers into place, in or just outside the pencil ring", {});
  }
}

const out = process.argv[2] ?? ".tmp/scenes.json";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(scenes));
console.log(`${scenes.length} scenes → ${out}`);

// Dawood-bot's long-war bench: how long a move takes, whether the shapes get
// played, and whether a change made the bot stronger. Bot-v-bot on the game's
// own engine, seeded: the same arguments always play the same wars.
//
//   t3-test-run node --import ./scripts/ts-resolve.mjs scripts/bot-bench.ts time [wars=3]
//   t3-test-run node --import ./scripts/ts-resolve.mjs scripts/bot-bench.ts shapes [wars=20] [level=1]
//   t3-test-run node --import ./scripts/ts-resolve.mjs scripts/bot-bench.ts h2h [wars=20] [level=1]   (each seed both ways round)
//   t3-test-run node --import ./scripts/ts-resolve.mjs scripts/bot-bench.ts core   (the four core wars of src/__fixtures__/core-4-wars.json, replayed through the bot: every action must match)
//
// The old bot is `src/bot.ts` as it stood at BASE_REF (default e3ab61c, the
// commit this work branched from), pulled out of git into dist/bot-baseline
// each run. ELASTICITY='{"tries":32}' (h2h) pits the old bot against itself on
// a thinner skill instead. Times are this process's CPU time, so a busy
// machine doesn't inflate them.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { botAction, botShape, SKILLS, type Level, type Skill } from "../src/bot";
import { preview, type Action, type GameState } from "../src/game";
import { rng } from "../src/geom";
import { LONG, SIZES, type Shape } from "../src/rules";
import { playGame, summarise, type Agent } from "../src/lab/sim";
import { toRecord } from "../src/record";

type Bot = (s: GameState, level: Level, seed: number) => Action;
const current: Bot = (s, level, seed) => botAction(s, level, seed);
const baselineFile = () => {
  const src = execFileSync("git", ["show", `${process.env.BASE_REF ?? "e3ab61c"}:src/bot.ts`], { encoding: "utf8" });
  const dir = resolve("dist/bot-baseline");
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/bot.ts`;
  writeFileSync(file, src.replace(/from "\.\/(\w+)"/g, `from "${resolve("src")}/$1.ts"`));
  return pathToFileURL(file).href;
};
const baselineModule = async () => (await import(baselineFile())) as { botAction: Bot; botShape: typeof botShape };
const baseline = async (): Promise<Bot> => (await baselineModule()).botAction;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
const [mode = "time", nArg, levelArg] = process.argv.slice(2);
const wars = Number(nArg ?? (mode === "time" ? 3 : 20));
const lvl = Number(levelArg ?? 1) as Level;
const seeds = (n: number, from = Number(process.env.SEED0 ?? 1000)) => Array.from({ length: n }, (_, i) => from + i * 7);
const kitOf = (seed: number, bot: "new" | "old") => rng(seed ^ (bot === "old" ? 0x5bd1e995 : 0x1b873593));

async function main() {
  const bot = process.env.OLD ? await baseline() : current;
  if (mode === "time") {
    // every move of a war the current bot plays is timed for both bots on the same state, so a busy machine slows both alike
    const old = await baseline();
    const cpu = (b: Bot, s: GameState, level: Level, k: number) => { const t = process.cpuUsage(); const a = b(s, level, k); const d = process.cpuUsage(t); return [a, (d.user + d.system) / 1000] as const;  };
    for (const level of [1, 2] as Level[]) {
      const was: number[] = [], now: number[] = [];
      for (const seed of seeds(wars)) {
        const timed: Agent = (s, k) => {
          const [, w] = cpu(old, s, level, k);
          const [a, n] = cpu(current, s, level, k);
          was.push(w); now.push(n);
          return a;
        };
        playGame(SIZES.long, seed, { rules: LONG, agents: [timed, timed] });
      }
      const row = (name: string, ms: number[]) => `  ${name}: mean ${mean(ms).toFixed(1)} ms, p95 ${q(ms, 0.95).toFixed(1)}, max ${Math.max(...ms).toFixed(1)}`;
      console.log(`level ${level}: ${now.length} moves over ${wars} wars (cpu ms)\n${row("before", was)}\n${row("after ", now)}`);
    }
  } else if (mode === "shapes") {
    const ev = { split: 0, rule: 0, home: 0, bank: 0 };
    let flicks = 0;
    const counting: Agent = (s, k) => {
      const a = bot(s, lvl, k);
      if (a.t === "flick") {
        const { t: _t, ...f } = a; void _t;
        for (const e of preview(s, f).events) if (e.kind in ev) ev[e.kind as keyof typeof ev]++;
        flicks++;
      }
      return a;
    };
    const recs = seeds(wars).map((seed) => playGame(SIZES.long, seed, { rules: LONG, agents: [counting, counting], label: "long" }).st);
    const sum = summarise(recs);
    const per = (x: number) => (x / wars).toFixed(2);
    console.log(`${wars} wars at level ${lvl}: splits/game ${per(ev.split)}, rule ${per(ev.rule)}, home ${per(ev.home)}, bank ${per(ev.bank)}; flicks/game ${(flicks / wars).toFixed(1)}`);
    console.log(`kills/flick ${sum.killsPerFlick.toFixed(3)}; turns mean ${sum.turns.mean.toFixed(1)} (p10 ${sum.turns.p10}, p90 ${sum.turns.p90}); first-player wins ${(sum.firstWins * 100).toFixed(0)}% of decided; stalled ${(sum.stalled * 100).toFixed(0)}%; sends/game ${sum.sendsPerGame.toFixed(2)}; road kills/game ${sum.roadKills.toFixed(2)}`);
  } else if (mode === "core") {
    const wars = JSON.parse(readFileSync("src/__fixtures__/core-4-wars.json", "utf8")) as { record: { size: (typeof SIZES)["quick"]; seed: number; actions: Action[] } }[];
    let bad = 0;
    for (const w of wars) {
      const { s } = playGame(w.record.size, w.record.seed);
      const mine = toRecord(s).actions;
      const same = mine.length === w.record.actions.length && mine.every((a, i) => JSON.stringify(a) === JSON.stringify(w.record.actions[i]));
      if (!same) bad++;
      console.log(`${w.record.size.name} seed ${w.record.seed}: ${mine.length} actions v ${w.record.actions.length} recorded: ${same ? "identical" : "DIFFERENT"}`);
    }
    process.exitCode = bad ? 1 : 0;
  } else if (mode === "h2h") {
    const oldModule = await baselineModule();
    const old = oldModule.botAction;
    // ELASTICITY: the old bot against itself, the "new" seat on a thinner skill (JSON over level 1's) -- how much does the old search lose when cut?
    const thin = process.env.ELASTICITY ? ({ ...SKILLS[lvl], ...JSON.parse(process.env.ELASTICITY) } as Skill) : null;
    const mk = (b: Bot, sk: Skill | null = null): Agent => (s, k) => (sk ? (b as unknown as (s: GameState, l: Skill, k: number) => Action)(s, sk, k) : b(s, lvl, k));
    let won = 0, lost = 0, drawn = 0;
    for (const seed of seeds(wars)) for (const newSeat of [0, 1] as const) {
      const me = thin ? mk(old, thin) : mk(current);
      const agents = (newSeat === 0 ? [me, mk(old)] : [mk(old), me]) as [Agent, Agent];
      const kits = [newSeat === 0 ? "new" : "old", newSeat === 0 ? "old" : "new"] as const;
      const kit = kits.map((who) => { const r = kitOf(seed, who); return Array.from({ length: 6 }, () => (who === "new" ? botShape : oldModule.botShape)(r)); }) as [Shape[], Shape[]];
      const { st } = playGame(SIZES.long, seed, { rules: LONG, agents, kit });
      if (st.winner === -1) drawn++; else if (st.winner === newSeat) won++; else lost++;
    }
    const n = won + lost + drawn;
    console.log(`new v old, ${n} wars (${wars} seeds, both seats), level ${lvl}: new won ${won}, lost ${lost}, stalled ${drawn}; new wins ${((won / n) * 100).toFixed(1)}% of all, ${((won / Math.max(1, won + lost)) * 100).toFixed(1)}% of decided`);
  }
}
void main();

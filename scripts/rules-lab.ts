// Rules lab runner: plays bot-vs-bot games for each rule set across worker
// threads and prints the table. No browser.
//
//   npm run lab -- --games 2000 --sets classic,last-stand
//   npm run lab -- --games 400 --all --out docs/rules-lab/data/explore.json
//
// Seeds are 1..games for every set, so sets are compared on the same seeds.

import { availableParallelism } from "node:os";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { botAgent, playGame, summarise, type Agent, type GameRecord, type Summary } from "../src/lab/sim";
import { legacyAction } from "../src/lab/legacy-bot";
import { SKILLS } from "../src/bot";
import { EXPERIMENTS } from "../src/lab/variants";
import { RULESETS } from "../src/rulesets";
import { PROTOTYPE, type RuleSet } from "../src/rules";

const ALL: RuleSet[] = [...RULESETS, ...EXPERIMENTS.filter((e) => !RULESETS.some((r) => r.id === e.id))];
const find = (id: string) => ALL.find((r) => r.id === id) ?? (id === "prototype" ? PROTOTYPE : undefined);

interface Job { set: string; from: number; to: number; maxTurns: number; agents: [string, string] }

const AGENTS: Record<string, Agent> = { human: botAgent(), legacy: legacyAction, sloppy: botAgent(SKILLS[0]), sharp: botAgent(SKILLS[2]) };

if (!isMainThread) {
  const job = workerData as Job;
  const rules = find(job.set)!;
  const recs: GameRecord[] = [];
  for (let seed = job.from; seed < job.to; seed++) recs.push(playGame(rules, seed, { maxTurns: job.maxTurns, agents: [AGENTS[job.agents[0]], AGENTS[job.agents[1]]] }).rec);
  parentPort!.postMessage(recs);
} else {
  const args = process.argv.slice(2);
  const arg = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const games = +(arg("games", "200")!);
  const maxTurns = +(arg("max-turns", "400")!);
  const sets = args.includes("--all") ? ALL.map((r) => r.id) : (arg("sets", RULESETS.map((r) => r.id).join(","))!).split(",");
  const out = arg("out");
  const agents = (arg("agents", "human,human")!).split(",") as [string, string];
  for (const a of agents) if (!AGENTS[a]) throw new Error(`unknown agent ${a}`);
  const threads = +(arg("threads", String(Math.max(1, availableParallelism() - 1)))!);
  for (const id of sets) if (!find(id)) throw new Error(`unknown rule set ${id}`);

  const jobs: Job[] = [];
  const chunk = Math.max(5, Math.ceil(games / threads / 2));
  for (const set of sets) for (let from = 1; from <= games; from += chunk) jobs.push({ set, from, to: Math.min(games + 1, from + chunk), maxTurns, agents });
  const results = new Map<string, GameRecord[]>(sets.map((s) => [s, []]));
  const t0 = Date.now();
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let next = 0, running = 0;
    const launch = () => {
      if (next >= jobs.length) { if (running === 0) resolve(); return; }
      const job = jobs[next++];
      running++;
      const w = new Worker(new URL(import.meta.url), { workerData: job });
      w.once("message", (recs: GameRecord[]) => {
        results.get(job.set)!.push(...recs);
        if (out && results.get(job.set)!.length === games) {
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(`${out}.${job.set}.part.json`, JSON.stringify(summarise(results.get(job.set)!.sort((a, b) => a.seed - b.seed))));
        }
        done += recs.length;
        running--;
        process.stderr.write(`\r${done}/${games * sets.length} games, ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
        launch();
      });
      w.once("error", reject);
    };
    for (let i = 0; i < threads; i++) launch();
  });
  process.stderr.write("\n");
  const sums: Summary[] = sets.map((id) => summarise(results.get(id)!.sort((a, b) => a.seed - b.seed)));
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f1 = (x: number) => x.toFixed(1);
  console.log("| rules | games | turns (p10–p90) | flicks | 1st-player wins | draws | kills/flick | ≥3 in one flick | comebacks (big) | drag turns | drag flicks (share) | moves | sends | turns that bite | longest streak | off-page/game |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of sums) {
    console.log(`| ${s.rules} | ${s.games} | ${f1(s.turns.mean)} (${s.turns.p10}–${s.turns.p90}) | ${f1(s.flicksPerGame)} | ${pct(s.firstWins)} | ${pct(s.draws)} | ${s.perFlick.mean.toFixed(2)} | ${pct(s.perFlick.three + s.perFlick.fourPlus)} | ${pct(s.comeback)} (${pct(s.bigComeback)}) | ${f1(s.drag.mean)} | ${f1(s.drag.acts)} (${pct(s.drag.actShare)}) | ${pct(s.moveShare)} | ${pct(s.transferShare)} | ${pct(s.materialShare)} | ${f1(s.longestChain)} | ${f1(s.lostOffPage)} |`);
  }
  console.log("\nmechanics per game:");
  for (const s of sums) console.log(`  ${s.rules}: bounces ${f1(s.bounces)}, splits ${f1(s.splits)}, stops ${f1(s.stops)}, cuts ${f1(s.cuts)}, wounds ${f1(s.wounds)}, bases fallen ${f1(s.fell)}, founded ${f1(s.founded)}, last stand in ${pct(s.lastStandRate)}, longest chain ${f1(s.longestChain)}, flicks ${f1(s.flicksPerGame)}, max kills ${s.perFlick.max}`);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s on ${threads} threads`);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ games, maxTurns, at: new Date().toISOString(), summaries: sums }, null, 1));
  }
}

// Rules lab (rounds 3 and 4): bot-vs-bot games on the core rules across
// worker threads, and the table. No browser. On bjslab, run it inside
// t3-test-run with --threads 3, in chunks that finish well inside its
// 20-minute cap (--from/--to), writing --raw files that scripts/lab-table.ts
// adds up.
//
//   npm run lab -- --games 2000 --sizes quick,classic
//   npm run lab -- --from 1 --to 500 --sizes quick --garrison flat --raw out/flat-q-1.json
//   npm run lab -- --from 1 --to 500 --sizes quick --garrison 0.02-0.5,0.01-0.35,1 --stances all,spread
//   npm run lab -- --games 300 --sizes quick --set snipeWallLoss=0.2,snipeKillLoss=0.1 --label heavy
//   npm run lab -- --games 2000 --out docs/rules-lab/data/round-3/finals.json
//
// Seeds are 1..games for every size and variant, so they're compared on the same seeds.

import { availableParallelism } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { botAgent, playGame, round4Table, summarise, type GameStats, type Summary } from "../src/lab/sim";
import { SKILLS, STANCES } from "../src/bot";
import { CORE, SIZES, type CoreRules, type Garrison, type Size } from "../src/rules";

interface Job { size: Size; label: string; rules: CoreRules; from: number; to: number; maxTurns: number; agents: [string, string]; stances: [string, string] }
const AGENTS = { steady: botAgent(), sloppy: botAgent(SKILLS[0]), sharp: botAgent(SKILLS[2]) } as const;

function parseSet(spec: string | undefined): CoreRules {
  const r = structuredClone(CORE) as Record<string, unknown>;
  for (const kv of (spec ?? "").split(",").filter(Boolean)) {
    const [k, v] = kv.split("=");
    if (k === "reachMin") (r.reach as { min: number }).min = +v;
    else if (k === "reachMax") (r.reach as { max: number }).max = +v;
    else if (!(k in r)) throw new Error(`unknown rule ${k}`);
    else r[k] = +v;
  }
  return r as unknown as CoreRules;
}

/** `flat` (walls before garrisons), or `snipeLo-snipeHi,shakeLo-shakeHi,curve`. */
function parseGarrison(spec: string | undefined): Garrison | null | undefined {
  if (spec === undefined) return undefined;
  if (spec === "flat") return null;
  const [sn, sh, curve] = spec.split(",");
  const pair = (x: string) => x.split("-").map(Number) as [number, number];
  return { snipeLoss: pair(sn), lungeShake: pair(sh), curve: +(curve ?? 1) };
}

function sizeOf(name: string): Size {
  if (name === "quick" || name === "classic") return { ...SIZES[name] };
  const m = /^(\d+)x(\d+)$/.exec(name);
  if (!m) throw new Error(`unknown size ${name} (quick, classic or e.g. 4x8)`);
  return { name: "custom", bases: +m[1], soldiers: +m[2] };
}

if (!isMainThread) {
  const job = workerData as Job;
  const recs: GameStats[] = [];
  const agents = [AGENTS[job.agents[0] as keyof typeof AGENTS], AGENTS[job.agents[1] as keyof typeof AGENTS]] as [typeof AGENTS.steady, typeof AGENTS.steady];
  const stances = [STANCES[job.stances[0] as keyof typeof STANCES], STANCES[job.stances[1] as keyof typeof STANCES]] as [typeof STANCES.half, typeof STANCES.half];
  for (let seed = job.from; seed < job.to; seed++) recs.push(playGame(job.size, seed, { maxTurns: job.maxTurns, agents, rules: job.rules, label: job.label, stances }).st);
  parentPort!.postMessage(recs);
} else {
  const args = process.argv.slice(2);
  const arg = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const games = +arg("games", "200")!;
  const maxTurns = +arg("max-turns", "400")!;
  const sizes = arg("sizes", "quick,classic")!.split(",");
  const rules = parseSet(arg("set"));
  const g = parseGarrison(arg("garrison"));
  if (g !== undefined) rules.garrison = g;
  const stances = arg("stances", "half,half")!.split(",") as [string, string];
  for (const st of stances) if (!(st in STANCES)) throw new Error(`unknown stance ${st}`);
  const first = +arg("from", "1")!;
  const last = +arg("to", String(first + games - 1))!;
  const raw = arg("raw");
  const tag = arg("label", "")!;
  const agents = arg("agents", "steady,steady")!.split(",") as [string, string];
  const out = arg("out");
  const threads = +arg("threads", String(Math.max(1, availableParallelism() - 1)))!;
  const jobs: Job[] = [];
  const chunk = Math.max(5, Math.ceil((last - first + 1) / threads / 3));
  for (const name of sizes) {
    const size = sizeOf(name);
    const label = tag ? `${name} ${tag}` : name;
    for (let from = first; from <= last; from += chunk) jobs.push({ size, label, rules, from, to: Math.min(last + 1, from + chunk), maxTurns, agents, stances });
  }
  const results = new Map<string, GameStats[]>();
  const t0 = Date.now();
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let next = 0, running = 0;
    const launch = () => {
      if (next >= jobs.length) { if (running === 0) resolve(); return; }
      const job = jobs[next++];
      running++;
      const w = new Worker(new URL(import.meta.url), { workerData: job, execArgv: process.execArgv });
      w.once("message", (recs: GameStats[]) => {
        (results.get(job.label) ?? results.set(job.label, []).get(job.label)!).push(...recs);
        done += recs.length;
        running--;
        process.stderr.write(`\r${done}/${(last - first + 1) * sizes.length} games, ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
        launch();
      });
      w.once("error", reject);
    };
    for (let i = 0; i < threads; i++) launch();
  });
  process.stderr.write("\n");
  const sums: Summary[] = [...results.values()].map((r) => summarise(r.sort((a, b) => a.seed - b.seed)));
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f1 = (x: number) => x.toFixed(1);
  console.log("| size | games | turns (p10–p90) | flicks | 1st-player wins | stalled | kills/flick | lunges | snipes taking 2+ | sends/game (road kills) | longest turn: mean, p90, max | lunge chains: mean; 1/2/3/4+; max | lungers shot / off page | last stand (both; stander won) | comebacks |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of sums) {
    console.log(`| ${s.label} | ${s.games} | ${f1(s.turns.mean)} (${s.turns.p10}–${s.turns.p90}) | ${f1(s.flicksPerGame)} | ${pct(s.firstWins)} | ${pct(s.stalled)} | ${s.killsPerFlick.toFixed(2)} | ${pct(s.lungeShare)} | ${pct(s.doubleRate)} | ${f1(s.sendsPerGame)} (${f1(s.roadKills)}) | ${f1(s.longestTurn.mean)}, ${s.longestTurn.p90}, ${s.longestTurn.max} | ${s.chain.mean.toFixed(2)}; ${s.chain.share.map(pct).join("/")}; ${s.chain.max} | ${f1(s.crashes)} / ${f1(s.offPage)} | ${pct(s.standGames)} (${pct(s.standBoth)}; ${pct(s.standWins)}) | ${pct(s.comeback)} |`);
  }
  console.log("\n" + round4Table(sums));
  console.log(`\nrules: ${JSON.stringify(rules)}; stances ${stances.join(" v ")}`);
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s on ${threads} threads`);
  if (raw) {
    mkdirSync(dirname(raw), { recursive: true });
    writeFileSync(raw, JSON.stringify({ rules, stances, agents, maxTurns, from: first, to: last, games: Object.fromEntries(results) }));
  }
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ games, maxTurns, rules, at: new Date().toISOString(), summaries: sums }, null, 1));
  }
}

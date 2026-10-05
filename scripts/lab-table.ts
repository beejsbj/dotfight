// Add up the rules lab's --raw chunk files into one table per label.
//
//   node --import ./scripts/ts-resolve.mjs scripts/lab-table.ts docs/rules-lab/data/round-4/raw/*.json
//
// Chunks of the same label (size and variant) are merged in seed order.

import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { kitTable, round4Table, round5Table, round6Table, summarise, type GameStats } from "../src/lab/sim";

const byLabel = new Map<string, GameStats[]>();
const configurations = new Map<string, unknown>();
const seedsByLabel = new Map<string, Map<number, string>>();
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, "utf8")) as { games: Record<string, GameStats[]>; rules: unknown; stances: unknown; agents: unknown; maxTurns: number; kits?: string; swap?: boolean };
  const configuration = { rules: j.rules, stances: j.stances, agents: j.agents, maxTurns: j.maxTurns, kits: j.kits ?? null, swap: j.swap ?? false };
  for (const [label, recs] of Object.entries(j.games)) {
    if (configurations.has(label) && !isDeepStrictEqual(configurations.get(label), configuration)) {
      throw new Error(`Conflicting experiment configurations for label ${label} in ${f}; use distinct --label values.`);
    }
    configurations.set(label, configuration);
    const seen = seedsByLabel.get(label) ?? seedsByLabel.set(label, new Map()).get(label)!;
    for (const r of recs) {
      const key = r.seed + (r.swap ? 0.5 : 0); // --swap plays a seed twice, once with the seats swapped
      const prev = seen.get(key);
      if (prev !== undefined) {
        throw new Error(`Duplicate seed ${r.seed} for label ${label} in ${f}${prev !== f ? ` (already seen in ${prev})` : ""}`);
      }
      seen.set(key, f);
    }
    (byLabel.get(label) ?? byLabel.set(label, []).get(label)!).push(...recs);
  }
}
const sums = [...byLabel.values()].map((r) => summarise(r.sort((a, b) => a.seed - b.seed || Number(!!a.swap) - Number(!!b.swap))));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(round4Table(sums));
console.log("\n| variant | lunge chains 1/2/3/4+ | longest turn p90 | sends (road kills) | comebacks | last stand |");
console.log("|---|---|---|---|---|---|");
for (const s of sums) console.log(`| ${s.label} | ${s.chain.share.map(pct).join("/")} | ${s.longestTurn.p90} | ${s.sendsPerGame.toFixed(1)} (${s.roadKills.toFixed(1)}) | ${pct(s.comeback)} | ${pct(s.standGames)} |`);
if ([...byLabel.values()].some((r) => r.some((g) => g.long))) {
  console.log("\nRound 5, the long war:\n\n" + round5Table(sums));
  console.log("\nRound 6, the ruler, the star and the walking convoys:\n\n" + round6Table(sums));
  if (sums.some((s) => Object.keys(s.kits).length)) console.log("\nShape kits:\n\n" + kitTable(sums));
}
if (process.env.JSON) console.log(JSON.stringify(sums));

// Add up the rules lab's --raw chunk files into one table per label.
//
//   node --import ./scripts/ts-resolve.mjs scripts/lab-table.ts docs/rules-lab/data/round-4/raw/*.json
//
// Chunks of the same label (size and variant) are merged in seed order.

import { readFileSync } from "node:fs";
import { round4Table, summarise, type GameStats } from "../src/lab/sim";

const byLabel = new Map<string, GameStats[]>();
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, "utf8")) as { games: Record<string, GameStats[]> };
  for (const [label, recs] of Object.entries(j.games)) (byLabel.get(label) ?? byLabel.set(label, []).get(label)!).push(...recs);
}
const sums = [...byLabel.values()].map((r) => summarise(r.sort((a, b) => a.seed - b.seed)));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(round4Table(sums));
console.log("\n| variant | lunge chains 1/2/3/4+ | longest turn p90 | sends (road kills) | comebacks | last stand |");
console.log("|---|---|---|---|---|---|");
for (const s of sums) console.log(`| ${s.label} | ${s.chain.share.map(pct).join("/")} | ${s.longestTurn.p90} | ${s.sendsPerGame.toFixed(1)} (${s.roadKills.toFixed(1)}) | ${pct(s.comeback)} | ${pct(s.standGames)} |`);
if (process.env.JSON) console.log(JSON.stringify(sums));

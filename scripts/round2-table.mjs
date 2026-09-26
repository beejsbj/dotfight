// The round-2 report tables from a lab run's JSON (npm run lab -- --out ...).
//   node scripts/round2-table.mjs docs/rules-lab/data/round-2/finals.json
import { readFileSync } from "node:fs";
const { summaries, games } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const NAMES = { "last-stand": "Last stand (round 1)", r2: "As stated (r2)", "lunge-snipe": "**Lunge & snipe**", "pen-physics": "**Pen physics**", billiards: "**Billiards**" };
const pct = (x) => `${(x * 100).toFixed(0)}%`, f1 = (x) => x.toFixed(1);
console.log(`${games} games per set.\n`);
console.log("| rule set | turns (p10–p90) | flicks | 1st-player wins | stalled | kills/flick | ≥3 kills in one flick | comebacks (big) | endgame drag: flicks once a side has ≤3 (share) | turns that change the balance | longest turn in flicks: mean, p90, max |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const s of summaries) console.log(`| ${NAMES[s.rules] ?? s.rules} | ${f1(s.turns.mean)} (${s.turns.p10}–${s.turns.p90}) | ${f1(s.flicksPerGame)} | ${pct(s.firstWins)} | ${pct(s.draws)} | ${s.perFlick.mean.toFixed(2)} | ${pct(s.perFlick.three + s.perFlick.fourPlus)} | ${pct(s.comeback)} (${pct(s.bigComeback)}) | ${f1(s.drag.acts)} (${pct(s.drag.actShare)}) | ${pct(s.materialShare)} | ${f1(s.longestFlicks.mean)}, ${s.longestFlicks.p90}, ${s.longestFlicks.max} |`);
console.log("\n| rule set | lunges (share of flicks) | lunge chains: mean; length 1 / 2 / 3 / 4–5 / 6+; longest | snipes taking 2+ | sends a game | grooves ridden 40+ (all touches) | bank shots | splits | jolts | lunge deaths at a wall | off the page | rings manned again (games with one) | hit rate by shot length 300–600 / –900 / –1200 / –1500 / more |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const s of summaries) {
  const L = s.lungeChain;
  console.log(`| ${NAMES[s.rules] ?? s.rules} | ${pct(s.moveShare)} | ${L.mean.toFixed(2)}; ${[L.one, L.two, L.three, L.fourFive, L.sixPlus].map(pct).join(" / ")}; ${L.max} | ${pct(s.doubleRate)} | ${f1(s.transfersPerGame)} | ${f1(s.grooves)} (${f1(s.grooveTouches)}) | ${f1(s.banks)} | ${f1(s.splits)} | ${f1(s.wobbles)} | ${f1(s.crashes)} | ${f1(s.lostOffPage)} | ${f1(s.refilled)} (${pct(s.refillGames)}) | ${s.hitByLength.map(pct).join(" / ")} |`);
}

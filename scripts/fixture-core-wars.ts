// Records four bot-v-bot wars on today's core rules (two Quick, two
// Classic), with the page's hash after every action, into
// src/__fixtures__/core-4-wars.json. Run it on the engine you want to pin,
// not after changing it: record.test.ts replays these step by step so a new
// rule set can't quietly move a core-4 page.
//
//   t3-test-run node --import ./scripts/ts-resolve.mjs scripts/fixture-core-wars.ts

import { writeFileSync } from "node:fs";
import { act, newGame } from "../src/game";
import { playGame } from "../src/lab/sim";
import { toRecord } from "../src/record";
import { hash } from "../src/room-engine";
import { SIZES } from "../src/rules";

const wars = ([[SIZES.quick, 11], [SIZES.quick, 12], [SIZES.classic, 21], [SIZES.classic, 22]] as const).map(([size, seed]) => {
  const { s } = playGame(size, seed);
  const record = toRecord(s);
  const r = newGame(record.size, record.seed, record.page, record.rules);
  const hashes = record.actions.map((a) => (act(r, a), hash(r)));
  return { record, hashes, end: { winner: s.winner, turn: s.turn, marks: s.marks.length } };
});

writeFileSync("src/__fixtures__/core-4-wars.json", `[\n${wars.map((w) => JSON.stringify(w)).join(",\n")}\n]\n`);
for (const w of wars) console.log(w.record.size.name, w.record.seed, `${w.record.actions.length} actions`, `turn ${w.end.turn}`, `winner ${w.end.winner}`);

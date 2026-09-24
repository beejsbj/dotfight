// Daud-bot: plans by previewing candidate flicks, then flicks with a human-ish hand.

import { alive, preview, type Flick, type GameState, rng } from "./game";
import { reach, sigma } from "./flick";
import { RULES } from "./rules";

export type Level = 0 | 1 | 2; // sloppy, steady, sharp
export const LEVELS = ["sloppy", "steady", "sharp"] as const;

const HAND = [2.2, 1.2, 0.6]; // multiplier on the human release error
const TRIES = [25, 70, 160];

export function botFlick(s: GameState, level: Level, seed = Date.now()): Flick {
  const rand = rng(seed);
  const mine = alive(s, s.current);
  const foes = alive(s, s.current === 0 ? 1 : 0);
  let best: Flick | null = null, bestScore = -Infinity;

  for (let i = 0; i < TRIES[level]; i++) {
    const me = mine[Math.floor(rand() * mine.length)];
    const foe = foes[Math.floor(rand() * foes.length)];
    const shoot = rand() < 0.8;
    const power = shoot ? 0.2 + rand() * 0.8 : 0.3 + rand() * 0.5;
    const toward = Math.atan2(foe.y - me.y, foe.x - me.x);
    const f: Flick = {
      soldierId: me.id,
      kind: shoot ? "shoot" : "move",
      angle: toward + (rand() - 0.5) * 0.25,
      length: reach(shoot ? "shoot" : "move", power),
      bend: 0,
    };
    const o = preview(s, f);
    // prefer kills; moving is worth a little if it closes distance; never walk off the page
    let score = o.killed.length * 10 - (o.lost ? 50 : 0);
    if (o.movedTo) score += 2 - Math.hypot(o.movedTo.x - foe.x, o.movedTo.y - foe.y) / 400;
    score += rand() * 0.5;
    if (score > bestScore) { bestScore = score; best = f; }
  }

  const f = best!;
  // the hand shakes like everyone else's
  const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return {
    ...f,
    angle: f.angle + g * sigma(0.7) * HAND[level],
    length: f.length * (1 + (rand() - 0.5) * 0.12 * HAND[level]),
    bend: (rand() * 2 - 1) * 0.03,
  };
}

// Where the bot draws its bases: its own half, spread out.
export function botBase(s: GameState, can: (x: number, y: number) => boolean, seed = Date.now()) {
  const rand = rng(seed);
  const H = RULES.pageH;
  const own = s.current === 1 ? [H * 0.08, H * 0.45] : [H * 0.55, H * 0.92];
  for (let i = 0; i < 400; i++) {
    const x = RULES.margin + RULES.baseRadius + rand() * (RULES.pageW - RULES.margin - 2 * RULES.baseRadius), y = own[0] + rand() * (own[1] - own[0]);
    if (can(x, y)) return { x, y };
  }
  for (let i = 0; i < 4000; i++) {
    const x = rand() * RULES.pageW, y = rand() * H;
    if (can(x, y)) return { x, y };
  }
  return null;
}

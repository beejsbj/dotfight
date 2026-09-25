// The June prototype's Dawood-bot, kept only so the lab can show the new
// bot is a real opponent: it samples flicks at random enemies, previews them
// without a shaky hand, takes the most kills, then adds hand error.

import { sigma } from "../flick";
import { preview, reachOf, ready, type Action, type Flick, type GameState } from "../game";
import { rng } from "../geom";

export function legacyAction(s: GameState, seed: number): Action {
  const rand = rng(seed);
  const mine = ready(s, s.current);
  const foes = ready(s, s.current === 0 ? 1 : 0);
  if (!mine.length || !foes.length) return { t: "pass" };
  let best: Flick | null = null, bestScore = -Infinity;
  for (let i = 0; i < 70; i++) {
    const me = mine[Math.floor(rand() * mine.length)];
    const foe = foes[Math.floor(rand() * foes.length)];
    const shoot = rand() < 0.8;
    const power = shoot ? 0.2 + rand() * 0.8 : 0.3 + rand() * 0.5;
    const toward = Math.atan2(foe.y - me.y, foe.x - me.x);
    const f: Flick = { soldierId: me.id, kind: shoot ? "shoot" : "move", angle: toward + (rand() - 0.5) * 0.25, length: reachOf(s.rules, shoot ? "shoot" : "move", power), bend: 0 };
    const o = preview(s, f);
    let score = o.killed.length * 10 - (o.lost ? 50 : 0);
    if (o.movedTo) score += 2 - Math.hypot(o.movedTo.x - foe.x, o.movedTo.y - foe.y) / 400;
    score += rand() * 0.5;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  const f = best!;
  const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return { t: "flick", ...f, angle: f.angle + g * sigma(0.7) * 1.2, length: f.length * (1 + (rand() - 0.5) * 0.12 * 1.2), bend: (rand() * 2 - 1) * 0.03 };
}

// What the page asks Dawood-bot's worker, and what comes back (pure, tested).

import { botAction, type Level } from "./bot";
import type { Action, GameState } from "./game";

export interface BotAsk { id: number; s: GameState; level: Level; seed: number }
export interface BotAnswer { id: number; a: Action }

/** `botAction` is pure and seeded, so this is the action the page would have worked out itself. */
export const answer = (m: BotAsk): BotAnswer => ({ id: m.id, a: botAction(m.s, m.level, m.seed) });

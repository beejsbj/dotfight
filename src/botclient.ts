// Asking Dawood-bot for its move without stopping the page: the question goes
// to a Web Worker (`botworker.ts`) and the action comes back as a promise. With
// no Worker (an old browser, a test, a worker that failed to start or died),
// it is worked out right here instead; the action is the same either way.

import { botAction, type Level } from "./bot";
import type { BotAnswer, BotAsk } from "./botask";
import type { Action, GameState } from "./game";

interface Pending { ask: BotAsk; done: (a: Action) => void }

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

/** Everything still waiting is worked out here, on this thread. */
function giveUp() {
  worker?.terminate();
  worker = null;
  for (const { ask, done } of [...pending.values()]) done(botAction(ask.s, ask.level, ask.seed));
  pending.clear();
}

function spawn(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined") return (worker = null);
  try {
    const w = new Worker(new URL("./botworker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<BotAnswer>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.done(e.data.a);
    };
    w.onerror = giveUp;
    w.onmessageerror = giveUp;
    return (worker = w);
  } catch {
    return (worker = null);
  }
}

/** What Dawood-bot does now, off the page's thread where it can. */
export function botMoveLater(s: GameState, level: Level, seed: number): Promise<Action> {
  return new Promise((resolve) => {
    const ask: BotAsk = { id: nextId++, s, level, seed };
    const w = spawn();
    if (!w) return resolve(botAction(s, level, seed));
    pending.set(ask.id, { ask, done: resolve });
    try { w.postMessage(ask); } catch { giveUp(); }
  });
}

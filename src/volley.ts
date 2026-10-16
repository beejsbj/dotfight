// Volleys on the page's side (docs/volleys.md): each side's plan as it is
// aimed in secret, and Dawood-bot's plan, chosen from the page as the volley
// began. The rules themselves (one `volley` action, traced against the start
// of the volley) live in game.ts. Pure: no DOM.

import { botAction, type Level } from "./bot";
import {
  act, aimView, clone, linesFor, planIllegal, roadBetween, whoGoes,
  type Action, type Flick, type GameState, type Plan, type Player,
} from "./game";

/** The setting that turns pass & play and Dawood-bot games into volleys (a Quick battle's sizes only). */
export const VOLLEY_KEY = "pft:volleys";

/**
 * A volley being aimed: each side's plan so far, which are done, and whose
 * turn it is to aim. Lives only on the page that's aiming: the other side's
 * plan never reaches the page until both lines go.
 */
export class Draft {
  plans: [Plan | null, Plan | null] = [null, null];
  done: [boolean, boolean] = [false, false];
  /** The volley it's for (`s.turn` when it began), so a draft never outlives its volley. */
  constructor(readonly turn: number) {}

  private plan(p: Player) { return (this.plans[p] ??= { flicks: [] }); }

  /** Lines this side still has to aim. */
  left(s: GameState, p: Player) { return Math.max(0, linesFor(s, p) - (this.plans[p]?.flicks.length ?? 0)); }

  /** Men of this side who can't draw a line now: they've drawn one this volley, or they're going in its send. */
  barred(s: GameState, p: Player): Set<number> {
    const plan = this.plans[p];
    const out = new Set(plan?.flicks.map((f) => f.soldier) ?? []);
    if (plan?.send) for (const x of whoGoes(aimView(s, p), plan.send.from, plan.send.to, plan.send.n, out)) out.add(x.id);
    return out;
  }

  /** Add a line to this side's plan, if the rules take it (why not, if not). */
  take(s: GameState, p: Player, f: Flick): string | null {
    const plan = this.plan(p);
    const next: Plan = { ...plan, flicks: [...plan.flicks, { ...f }] };
    const why = planIllegal(s, p, next);
    if (why) return why;
    this.plans[p] = next;
    return null;
  }

  /** Add the send to this side's plan (before its lines, as in a turn). */
  send(s: GameState, p: Player, send: NonNullable<Plan["send"]>): string | null {
    const plan = this.plan(p);
    if (plan.send) return "one send a volley";
    const next: Plan = { ...plan, send: { ...send } };
    const why = planIllegal(s, p, next);
    if (why) return why;
    this.plans[p] = next;
    return null;
  }

  /** The volley, ready to act: both plans, blue's then red's. */
  action(): Extract<Action, { t: "volley" }> {
    const tidy = (q: Plan | null): Plan | null => (q && (q.flicks.length || q.send) ? structuredClone(q) : null);
    return { t: "volley", a: tidy(this.plans[0]), b: tidy(this.plans[1]) };
  }
}

/**
 * Dawood-bot's plan for this volley, from the page as it stands (the start of
 * the volley): it never sees the other side's. It plays the volley like a
 * turn on a copy of the page: a send if it would make one, then its line (and
 * in a last stand a second line by another man, still aimed at the start).
 */
export function botPlan(s: GameState, p: Player, level: Level, seed: number): Plan | null {
  const t = clone(s);
  t.rules = { ...t.rules, volley: null };
  t.vol = undefined;
  t.current = p;
  t.sent = false;
  t.chain = undefined;
  t.left = linesFor(s, p);
  const plan: Plan = { flicks: [] };
  let k = seed >>> 0;
  for (let guard = 0; guard < 6 && plan.flicks.length < linesFor(s, p); guard++) {
    if (t.phase !== "play" || t.current !== p) break;
    const a = botAction(t, level, k);
    k = (k + 0x9e3779b9) >>> 0;
    if (a.t === "send" && !plan.send && !plan.flicks.length) {
      plan.send = { from: a.from, to: a.to, n: a.n };
      act(t, a); // they're spoken for: the line comes from someone else
      continue;
    }
    if (a.t !== "flick") break;
    const { t: _t, ...f } = a;
    void _t;
    plan.flicks.push(f);
    // a last stand's second line: aimed at the same page, by another man
    const me = t.soldiers[f.soldier];
    const home = me.home ?? 0;
    t.convoys.push({ id: t.convoys.length, owner: p, from: home, to: home, ids: [me.id], state: "ordered", road: roadBetween(t.bases[home], t.bases[home]), turn: t.turn });
    me.convoy = t.convoys.length - 1;
  }
  if (!plan.flicks.length && !plan.send) return null;
  if (!planIllegal(s, p, plan)) return plan;
  // never expected: fall back to its first line alone
  const bare: Plan = { flicks: plan.flicks.slice(0, 1) };
  return bare.flicks.length && !planIllegal(s, p, bare) ? bare : null;
}

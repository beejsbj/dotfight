// Both halves kill: each cross must land when its own ink head reaches it.
import { idle } from "../lib/phone.mjs";
export default async function (T) {
  const { page } = T;
  await page.evaluate(async () => {
    const { newGame, act } = await import("/src/game.ts");
    const { LONG } = await import("/src/rules.ts");
    const { file } = await import("/src/record.ts");
    const s = newGame({ name: "custom", bases: 1, soldiers: 12 }, 42, undefined, LONG);
    act(s, { t: "base", x: 500, y: 1300, shape: "prism" });
    act(s, { t: "base", x: 500, y: 300, shape: "camp" });
    act(s, { t: "ready" }); act(s, { t: "ready" });
    window.pft.resumeRecord(file(s, { kind: "pnp" }));
    window.pft.clockHeld = true;
  });
  await idle(T);
  const rows = await page.evaluate(async () => {
    const { trace } = await import("/src/game.ts");
    const { reachFraction } = await import("/src/timeline.ts");
    const p = window.pft, s = p.s;
    s.bases[0].rot = Math.PI / 2;
    s.soldiers = [{ id: 0, owner: 0, x: 500, y: 1300, alive: true, home: 0, shape: "prism" }];
    const f = { soldier: 0, kind: "snipe", angle: -Math.PI / 2, length: 800, bend: 0, wob: 0, ms: 0 };
    const split = trace(s, f).events.find(e => e.kind === "split");
    if (!split) throw new Error("fixture did not split");
    for (const [d, sign] of [[150, 1], [140, -1], [230, -1]]) {
      const angle = f.angle + sign * s.rules.long.prism.spread;
      s.soldiers.push({ id: s.soldiers.length, owner: 1, x: split.at.x + Math.cos(angle)*d, y: split.at.y + Math.sin(angle)*d, alive: true, home: 1, shape: "camp" });
    }
    s.soldiers.push({ id: 4, owner: 1, x: 500, y: 300, alive: true, home: 1, shape: "camp" });
    p.flick(f);
    const r = p.res, o = r.o;
    if (o.killed.length !== 3) throw new Error(`fixture killed ${o.killed.length}, expected three`);
    const nearest = (pts, at) => pts.reduce((best, q, i) => Math.hypot(q.x-at.x,q.y-at.y) < Math.hypot(pts[best].x-at.x,pts[best].y-at.y) ? i : best, 0);
    const splitAt = o.events.find(e => e.kind === "split").at;
    const from = Math.min(.95*r.dur, reachFraction(nearest(o.path,splitAt),o.path.length-1)*r.dur);
    return r.kills.map((k, n) => {
      const victim = o.killed[n], ev = o.events.find(e => e.kind === "kill" && e.soldier === victim);
      const mark = s.marks[k.i], branch = ev.branch ?? 0;
      const pts = branch ? o.branches[branch-1] : o.path;
      const fraction = reachFraction(nearest(pts,mark),pts.length-1);
      const expected = branch ? from + fraction*Math.max(120,r.dur-from) : fraction*r.dur;
      return { victim, branch, at:k.at, expected };
    });
  });
  console.log("split kill timing", JSON.stringify(rows));
  if (!rows.some(x => x.branch === 1)) throw new Error("fixture did not kill on the secondary branch");
  if (rows.some(x => Math.abs(x.at-x.expected) > 1e-6)) throw new Error("kill cross uses another branch's ink clock");
}

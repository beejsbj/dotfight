// Volleys (docs/volleys.md), by real touch where it matters. The setting is
// turned on in Settings; a Quick pass & play war: camps drawn, both sides
// arrange, then volleys: blue aims (leaning in), the page turns behind a
// no-peek card, red aims, "one, two, three!" in pencil, both lines at once.
// Then a mutual kill, an earned run, a send drawn and caught on the road,
// played to the end, the drawer and the replay. Then a short volley war
// against Dawood-bot. Checks are logged as `CHECK name ok|FAIL`.
import { flickAt, placeAt } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page } = T;
  const fails = [];
  const check = (name, ok, extra = "") => { console.log(`CHECK ${name} ${ok ? "ok" : "FAIL"} ${extra}`); if (!ok) fails.push(name); };
  const st = () => page.evaluate(() => {
    const p = window.pft, s = p.s;
    return { phase: s.phase, current: s.current, turn: s.turn, stage: s.vol?.stage, first: s.vol?.first, busy: p.busy, res: !!p.res, marks: s.marks.length, actions: s.actions.length, sheet: !document.querySelector("#sheet").hidden, status: document.querySelector("#status").textContent };
  });
  const log = async (m) => console.log(m, JSON.stringify(await st()));
  // ready for a human: nothing animating, or a hand-over card waiting for a tap
  const ready = async (timeout = 60000) => {
    await T.wait(() => { const p = window.pft; const card = document.querySelector(".handoff-tap"); return p.screen !== "game" || (card && !document.querySelector("#sheet").hidden) || (!p.busy && !p.res && p.cam.settled); }, undefined, timeout);
  };
  // every dirty-rectangle layer must match a full redraw of the same frame (game time held still)
  const redraw = async (label) => {
    const r = await page.evaluate(async () => { window.pft.hand(true); await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); const r = window.pft.redrawCheck(); window.pft.hand(false); return r; });
    const bad = Object.entries(r).filter(([, v]) => v.bad !== 0);
    check(`redraw: ${label}`, !bad.length, Object.entries(r).map(([k, v]) => `${k} ${v.bad}${v.box ? "@" + v.box.join(",") : ""}`).join(" | "));
  };
  const card = () => page.evaluate(() => !!document.querySelector(".handoff-tap") && !document.querySelector("#sheet").hidden);
  const tapCard = async () => { await page.click(".handoff-tap"); await page.waitForTimeout(250); await ready(); };
  // the nearest enemy to any man of the side aiming
  const target = () => page.evaluate(() => {
    const s = window.pft.s, barred = window.pft.draft?.barred(s, s.current) ?? new Set();
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined && !barred.has(x.id));
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    let best = null, bd = Infinity;
    for (const m of mine) for (const f of foes) { const d = Math.hypot(m.x - f.x, m.y - f.y); if (d < bd) { bd = d; best = { me: m, foe: f, d }; } }
    return best;
  });

  await page.waitForTimeout(1200);
  // --- the setting: Settings → Experiments → volleys
  await page.click("#cover .tabs [data-a=settings]");
  await page.waitForTimeout(500);
  await page.click("[data-set=volleys]");
  await page.waitForTimeout(400);
  await T.shot(`${out}/v00-settings.png`);
  check("setting saved", await page.evaluate(() => localStorage.getItem("pft:volleys") === "1"));
  await page.click("[data-a=back]");
  await page.waitForTimeout(500);
  await page.click("[data-size=quick]");
  await page.waitForTimeout(300);
  await T.shot(`${out}/v01-cover.png`);
  check("cover still offers only quick battle and long war", await page.evaluate(() => [...document.querySelectorAll("[data-size]")].map((b) => b.dataset.size).join(",")).then((x) => !x.includes("volley")));

  // --- a Quick pass & play war
  await page.evaluate(() => document.querySelector("[data-a=pnp]").click());
  await page.waitForTimeout(900);
  check("a volley game", await page.evaluate(() => !!window.pft.s.rules.volley));
  const blue = [[250, 1350], [520, 1150], [780, 1400]];
  const red = [[250, 350], [520, 550], [780, 300]];
  for (let i = 0; i < 3; i++) for (const [x, y] of [blue[i], red[i]]) { await ready(); await placeAt(T, x, y); }
  await ready();
  await page.click("[data-act=ready]");
  await ready();
  await page.click("[data-act=ready]");
  await ready();
  await log("play");
  check("first volley: blue aims", (await st()).stage === "aim" && (await st()).current === 0);

  // --- volley 1, by touch: blue leans in and aims
  let t = await target();
  const marks0 = (await st()).marks;
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: "snipe", shot: `${out}/v02-blue-aims.png` });
  await page.waitForTimeout(150);
  await T.shot(`${out}/v03-blue-let-go.png`);
  check("blue's line is in the draft, not on the page", await page.evaluate((m0) => window.pft.draft?.plans[0]?.flicks.length === 1 && window.pft.s.marks.length === m0, marks0));
  await ready();
  check("a no-peek card before red sees the page", await card());
  await T.shot(`${out}/v04-no-peek-card.png`);
  const cardText = await page.evaluate(() => document.querySelector(".handoff-tap").textContent);
  check("the card says nothing of blue's line", !/snipe|lunge|crossed|at /.test(cardText), JSON.stringify(cardText));
  await tapCard();
  await T.shot(`${out}/v05-red-sees.png`);
  const hidden = await page.evaluate(() => { const f = window.pft.frame(); return { pen: !!f.pen, cur: window.pft.s.current, sel: window.pft.selected, marks: window.pft.s.marks.length }; });
  check("red's page shows no pen, no selection, no new ink", !hidden.pen && hidden.sel === undefined && hidden.marks === marks0 && hidden.cur === 1, JSON.stringify(hidden));
  // red aims
  t = await target();
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: "snipe", shot: `${out}/v06-red-aims.png` });
  await redraw("just after red lets go");
  // the count
  await page.waitForFunction(() => window.pft.counting >= 0, undefined, { timeout: 5000 });
  await page.waitForTimeout(500);
  await T.shot(`${out}/v07-one-two.png`);
  await redraw("the count");
  await page.waitForTimeout(500);
  await T.shot(`${out}/v08-three.png`);
  // both lines at once
  await page.waitForFunction(() => window.pft.res, undefined, { timeout: 5000 });
  await page.waitForTimeout(220);
  await T.shot(`${out}/v09-both-lines.png`);
  const pens = await page.evaluate(() => { const f = window.pft.frame(); return { pen: !!f.pen, more: window.pft.res?.more?.length ?? 0 }; });
  check("two lines in flight, two pens", pens.pen && pens.more === 1, JSON.stringify(pens));
  await redraw("two lines in flight");
  await page.waitForTimeout(600);
  await T.shot(`${out}/v10-landed.png`);
  await ready();
  await log("after volley 1");

  // earned runs after a volley: each side's flicks by Dawood-bot's choice (shots: `name` for the first)
  const runFollow = async (name) => {
    for (let g = 0; g < 12; g++) {
      await ready();
      if (await card()) { await tapCard(); continue; }
      const s = await st();
      if (s.phase !== "play" || s.stage !== "follow") return;
      if (name && g === 0) await T.shot(`${out}/${name}.png`);
      await page.evaluate(() => window.pft.act(window.pft.botMove(1)));
      await page.waitForTimeout(100);
    }
  };
  await runFollow("v10b-earned-run-after-volley-1");
  await ready();
  if (await card()) await tapCard();

  // play a volley by the rules' own exact lines (dev: pft.takeLine), handling the card
  const takeFor = async (pickFn) => {
    for (let guard = 0; guard < 6; guard++) {
      await ready();
      const s = await st();
      if (s.phase !== "play" || s.stage !== "aim") return;
      if (await card()) { await tapCard(); continue; }
      if (!(await page.evaluate(() => !!window.pft.draft))) return;
      const f = await page.evaluate(pickFn);
      if (!f) return;
      await page.evaluate((f) => window.pft.takeLine(f), f);
      await page.waitForTimeout(100);
      if (await page.evaluate(() => !window.pft.draft || window.pft.draft.done.every(Boolean) || window.pft.counting >= 0 || !!window.pft.res)) return;
    }
  };

  // --- a mutual kill: each side's nearest pair aims at each other, exactly
  const pair = await page.evaluate(() => {
    const p = window.pft, s = p.s;
    const mk = (me, foe, extra) => ({ soldier: me.id, kind: "snipe", angle: Math.atan2(foe.y - me.y, foe.x - me.x), length: Math.hypot(foe.x - me.x, foe.y - me.y) + extra, bend: 0, wob: 7 });
    let best = null;
    for (const a of s.soldiers.filter((x) => x.alive && x.owner === 0 && x.convoy === undefined)) for (const b of s.soldiers.filter((x) => x.alive && x.owner === 1 && x.convoy === undefined)) {
      // walls eat a snipe by their garrison: try a line just long enough, then longer ones
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      const fa = [40, d0 * 0.6 + 120, 1800 - d0].map((x) => mk(a, b, x)).find((f) => p.preview(f)?.killed.includes(b.id));
      const fb = [40, d0 * 0.6 + 120, 1800 - d0].map((x) => mk(b, a, x)).find((f) => p.preview(f)?.killed.includes(a.id));
      if (!fa || !fb) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!best || d < best.d) best = { d, f: [fa, fb] };
    }
    return best;
  });
  if (pair) {
    await page.evaluate((pair) => { window.__pair = pair; }, pair);
    await takeFor(() => window.__pair.f[window.pft.s.current]);
    await page.waitForFunction(() => window.pft.res, undefined, { timeout: 8000 });
    await page.waitForTimeout(260);
    await T.shot(`${out}/v11-mutual-in-flight.png`);
    await ready();
    await T.shot(`${out}/v12-mutual-landed.png`);
    await runFollow();
    const mutual = await page.evaluate((pair) => { const s = window.pft.s; return !s.soldiers[pair.f[0].soldier].alive && !s.soldiers[pair.f[1].soldier].alive; }, pair);
    check("mutual kill: both shooters crossed out", mutual);
  } else check("found a pair for a mutual kill", false);
  await log("after mutual");

  // --- an earned flick: a lunge at a man outside his wall (or a two-for-one snipe), red holding fire
  const earner = await page.evaluate(() => {
    const p = window.pft, s = p.s, me = s.vol.first;
    for (const a of s.soldiers.filter((x) => x.alive && x.owner === me && x.convoy === undefined)) for (const b of s.soldiers.filter((x) => x.alive && x.owner !== me)) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      for (const kind of ["snipe", "lunge"]) {
        const f = { soldier: a.id, kind, angle: Math.atan2(b.y - a.y, b.x - a.x), length: kind === "lunge" ? d + 25 : d + 300, bend: 0, wob: 3 };
        const o = p.preview(f);
        if (o && (kind === "snipe" ? o.killed.length >= 2 : o.killed.length >= 1 && !o.lost)) return { f, me };
      }
    }
    return null;
  });
  if (earner) {
    await page.evaluate((e) => { window.__earn = e; }, earner);
    // the earner aims his line; the other side aims anything that misses (straight back home, short)
    await takeFor(() => {
      const s = window.pft.s;
      if (s.current === window.__earn.me) return window.__earn.f;
      const x = s.soldiers.find((x) => x.alive && x.owner === s.current && x.convoy === undefined && !window.pft.draft.barred(s, s.current).has(x.id));
      return x && { soldier: x.id, kind: "snipe", angle: s.current === 0 ? Math.PI / 2 : -Math.PI / 2, length: 210, bend: 0, wob: 1 };
    });
    await ready();
    const follow = await st();
    await T.shot(`${out}/v13-earned-run.png`);
    check("earned: a run of ordinary flicks after the volley", follow.stage === "follow" && follow.current === earner.me, JSON.stringify(follow));
    if (await page.$("[data-act=stop]")) { await T.shot(`${out}/v14-lunge-on.png`); await page.click("[data-act=stop]"); }
    else await page.evaluate(() => window.pft.act(window.pft.botMove(1)));
    await runFollow();
  } else check("found an earning line", false);
  await log("after earned");

  // --- a send, drawn by touch in a volley: pencilled for its side only, on the road for the next volley
  await ready();
  if (await card()) await tapCard();
  const who = (await st()).current;
  const own = await page.evaluate(() => { const s = window.pft.s; return s.bases.filter((b) => b.owner === s.current && s.soldiers.some((x) => x.alive && x.home === b.id && x.convoy === undefined)); });
  let sent = false;
  if (own.length >= 2 && await page.$("[data-act=send]")) {
    await page.click("[data-act=send]");
    await page.waitForTimeout(700);
    const p0 = await T.world(own[0].x, own[0].y), p1 = await T.world(own[1].x, own[1].y);
    await T.drag(p0.x, p0.y, p1.x, p1.y, { steps: 16, ms: 600 });
    await page.waitForTimeout(300);
    await page.click("[data-act=n][data-n='2']").catch(() => page.click("[data-act=n]"));
    await page.waitForTimeout(600);
    await T.shot(`${out}/v15-send-planned.png`);
    sent = await page.evaluate((w) => !!window.pft.draft?.plans[w]?.send && window.pft.s.convoys.every((c) => c.state !== "ordered"), who);
    check("the send is in the plan, not on the page", sent);
    const orders = await page.evaluate(() => window.pft.frame && (window.pft.frame().road ?? []).length);
    void orders;
  }
  // that side's line (touch), then the other's (exact), then the count
  t = await target();
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: "snipe" });
  await ready();
  if (await card()) {
    await tapCard();
    const planned = await page.evaluate(() => window.pft.frame && JSON.stringify(window.pft.draft?.plans));
    void planned;
  }
  await takeFor(() => {
    const s = window.pft.s;
    const x = s.soldiers.find((x) => x.alive && x.owner === s.current && x.convoy === undefined);
    return x && { soldier: x.id, kind: "snipe", angle: s.current === 0 ? Math.PI / 2 : -Math.PI / 2, length: 210, bend: 0, wob: 1 };
  });
  await page.waitForFunction(() => window.pft.lapse, undefined, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  await T.shot(`${out}/v16-convoy-walks-out.png`);
  await ready();
  // follow-ups, if any, then the next volley's aim: the convoy is out on the road
  await runFollow();
  if (await card()) await tapCard();
  const road = await page.evaluate(() => window.pft.s.convoys.filter((c) => c.state === "road").length);
  await T.shot(`${out}/v17-convoy-on-road.png`);
  if (sent) check("the convoy is on the road through the next volley", road >= 1);
  await log("convoy out");

  // --- to the end: each side's line from Dawood-bot's own plan, fast
  await page.evaluate(() => { window.pft.speed = 5; });
  let stood = false;
  for (let k = 0; k < 400; k++) {
    const s = await st();
    if (s.phase === "over") break;
    await ready(90000);
    if (await card()) { await tapCard(); continue; }
    const s2 = await st();
    if (s2.phase === "over") break;
    const stand = await page.evaluate(() => window.pft.s.stand);
    if (!stood && (stand[0] || stand[1]) && s2.stage === "aim") { stood = true; await page.evaluate(() => { window.pft.speed = 1; }); await page.waitForTimeout(300); await T.shot(`${out}/v18-last-stand.png`); await page.evaluate(() => { window.pft.speed = 5; }); }
    if (s2.stage === "aim") {
      const f = await page.evaluate((k) => {
        const s = window.pft.s, barred = window.pft.draft?.barred(s, s.current) ?? new Set();
        const p = window.pft.volleyPlan(s.current, k + 1);
        const mine = p?.flicks.find((f) => !barred.has(f.soldier));
        if (mine) return mine;
        // a last stand's second line: any free man at the nearest enemy
        let best = null;
        for (const m of s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined && !barred.has(x.id))) for (const e of s.soldiers.filter((x) => x.alive && x.owner !== s.current)) {
          const d = Math.hypot(e.x - m.x, e.y - m.y);
          if (!best || d < best.d) best = { d, f: { soldier: m.id, kind: "snipe", angle: Math.atan2(e.y - m.y, e.x - m.x), length: d + 200, bend: 0, wob: k } };
        }
        return best?.f ?? null;
      }, k);
      if (f) await page.evaluate((f) => window.pft.takeLine(f), f);
      else {
        // nothing to aim with: hold fire is automatic
        await page.waitForTimeout(200);
      }
    } else await page.evaluate(() => window.pft.act(window.pft.botMove(1)));
    await page.waitForTimeout(60);
  }
  await log("over?");
  await page.evaluate(() => { window.pft.speed = 1; });
  await page.waitForSelector("#sheet:not([hidden]) [data-a=look]", { timeout: 60000 });
  await page.waitForTimeout(600);
  await T.shot(`${out}/v19-over.png`);
  const end = await page.evaluate(() => ({ winner: window.pft.s.winner, drawn: window.pft.s.drawn, v: window.pft.file().v, volleys: window.pft.s.actions.filter((a) => a.t === "volley").length }));
  check("filed as a v3 record of volleys", end.v === 3 && end.volleys > 3, JSON.stringify(end));
  await page.click("[data-a=look]");
  await page.waitForTimeout(600);
  await T.shot(`${out}/v20-page.png`);
  await page.click("#menu-btn");
  await page.waitForTimeout(900);
  await page.click("#cover .tabs [data-a=drawer]");
  await page.waitForTimeout(700);
  await T.shot(`${out}/v21-drawer.png`);
  check("the drawer says volleys", await page.evaluate(() => document.querySelector(".pages .page span")?.textContent.includes("volleys")));
  await page.click(".pages .page");
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.pft.speed = 2; });
  await page.click("[data-v=replay]");
  // a volley step in the replay: both lines at once
  const replayed = await page.waitForFunction(() => window.pft.res?.more?.length, undefined, { timeout: 60000, polling: 20 }).then(() => true, () => false);
  await page.waitForTimeout(150);
  await T.shot(`${out}/v22-replay-volley.png`);
  check("the replay draws a volley's lines at once", replayed);
  await page.evaluate(() => { window.pft.speed = 6; });
  await page.waitForFunction(() => window.pft.screen === "view", undefined, { timeout: 180000 });
  await page.waitForTimeout(800);
  await T.shot(`${out}/v23-replayed.png`);
  const same = await page.evaluate(() => JSON.stringify(window.pft.s.marks) === JSON.stringify(window.pft.unfile(window.pft.file()).marks));
  check("the replayed page matches its record", same);

  // --- a short volley war against Dawood-bot
  await page.click("#menu-btn");
  await page.waitForTimeout(900);
  await page.getByText("play Dawood-bot").click();
  await page.waitForTimeout(900);
  for (const [x, y] of [[260, 1350], [720, 1450], [520, 1150]]) { await ready(); await placeAt(T, x, y); }
  await ready(60000);
  await page.click("[data-act=ready]");
  await ready(60000);
  await log("bot: play");
  const botDone = await page.evaluate(() => window.pft.draft?.done[1] && !!window.pft.draft?.plans);
  check("Dawood-bot has planned before you aim", !!botDone);
  await T.shot(`${out}/v24-bot-your-line.png`);
  t = await target();
  // watch from inside the page: the count, then two lines in flight
  await page.evaluate(() => { window.__seen = { count: false, more: false }; window.__watch = setInterval(() => { if (window.pft.counting >= 0) window.__seen.count = true; if (window.pft.res?.more) window.__seen.more = true; }, 10); });
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: "snipe" });
  check("no card against the bot", !(await card()));
  await page.waitForFunction(() => window.__seen.count, undefined, { timeout: 5000, polling: 20 }).catch(() => {});
  await page.waitForTimeout(500);
  await T.shot(`${out}/v25-bot-count.png`);
  await page.waitForFunction(() => window.__seen.more, undefined, { timeout: 5000, polling: 20 }).catch(() => {});
  await page.waitForTimeout(150);
  await T.shot(`${out}/v26-bot-both-lines.png`);
  await ready();
  const seen = await page.evaluate(() => { clearInterval(window.__watch); return window.__seen; });
  check("v bot: the count, then both lines at once", seen.count && seen.more, JSON.stringify(seen));
  await ready();
  for (let k = 0; k < 4; k++) {
    await ready(60000);
    const s = await st();
    if (s.phase !== "play") break;
    if (s.stage === "aim") { t = await target(); if (!t) break; await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: k % 2 ? "snipe" : "lunge" }); }
    else if (s.current === 0) { if (await page.$("[data-act=stop]")) await page.click("[data-act=stop]"); else await page.evaluate(() => window.pft.act(window.pft.botMove(1))); }
    await page.waitForTimeout(400);
  }
  await ready(60000);
  await T.shot(`${out}/v27-bot-later.png`);
  await log("bot: after a few volleys");
  console.log(fails.length ? `FAILED: ${fails.join(", ")}` : "ALL CHECKS OK");
}

// Two phones, one room: a real end-to-end run of the room link.
// Usage: node scripts/room-e2e.mjs [url] [outdir]
// Needs the dev server with a store behind /api/room (see vite.config.ts), e.g.
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run dev
// Burooj makes a room and "sends" the link; Dawood opens it on his own phone
// (a separate browser context: separate storage), takes the red pen, and they
// draw camps, arrange and flick (snipe, lunge, send) by real touch. A phone loses
// signal mid-game and catches up; later he closes the app and resumes from the cover. A stale
// double-tap is refused. Screenshots of both phones side by side go to outdir.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { browserOpts, guardBrowserJob } from "./lib/guarded-browser.mjs";
import { flickAt, phone, placeAt } from "./lib/phone.mjs";
await guardBrowserJob();

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? "docs/shots/room-link";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ ...browserOpts, executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const opts = { w: 390, h: 844, dpr: 1, browser };

const checks = [];
const check = (ok, what) => { checks.push([ok, what]); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

const state = (T) => T.page.evaluate(() => {
  const p = window.pft;
  return { phase: p.s.phase, current: p.s.current, turn: p.s.turn, busy: p.busy, marks: p.s.marks.length, bases: p.s.bases.length,
    acts: p.s.actions?.length, seat: p.link?.seat, drift: p.roomDrift, broken: p.link?.broken, queued: p.link?.queued, pending: p.link?.data.pending.length, n: p.link?.data.log.length, offline: p.link?.offline,
    status: document.querySelector("#status").textContent };
});
// my go, and nothing left to draw
const myTurn = (T, timeout = 180000) => T.page.waitForFunction(() => {
  const p = window.pft;
  return p.screen === "game" && p.link && p.link.queued === 0 && p.s.current === p.link.seat && !p.busy && !p.res && p.cam.settled;
}, undefined, { timeout, polling: 100 });
const settled = (T, timeout = 180000) => T.page.waitForFunction(() => { const p = window.pft; return !p.busy && !p.res && p.cam.settled; }, undefined, { timeout, polling: 100 });

async function pair(name, a, b, note = "") {
  const snap = async (T) => { await T.page.bringToFront(); return T.page.screenshot({ timeout: 90000 }); };
  const [ia, ib] = [await snap(a), await snap(b)];
  const tmp = await browser.newPage({ viewport: { width: 2 * 390 + 60, height: 844 + 70 }, deviceScaleFactor: 1 });
  const src = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  await tmp.setContent(`<body style="margin:0;background:#1a1512;font:15px sans-serif;color:#cbb">
    <div style="display:flex;gap:20px;padding:20px 20px 6px">
      <figure style="margin:0"><img src="${src(ia)}" width="390" height="844"><figcaption>Burooj's phone</figcaption></figure>
      <figure style="margin:0"><img src="${src(ib)}" width="390" height="844"><figcaption>Dawood's phone ${note}</figcaption></figure>
    </div></body>`);
  await tmp.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  await tmp.close();
}

// the move a player would make: nearest enemy, a real flick by touch
async function flickTurn(T, kind = "snipe") {
  const t = await T.page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    let best = null, bd = Infinity;
    for (const m of mine) for (const f of foes) { const d = Math.hypot(m.x - f.x, m.y - f.y); if (d < bd) { bd = d; best = { me: m, foe: f, d }; } }
    // an earned lunge must be his
    if (s.chain) { const m = s.soldiers[s.chain.soldier]; foes.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)); best = { me: m, foe: foes[0], d: Math.hypot(foes[0].x - m.x, foes[0].y - m.y) }; }
    return { ...best, chain: !!s.chain };
  });
  await flickAt(T, t.me.id, t.foe.x, t.foe.y, 50 + Math.min(90, t.d / 12), { kind: t.chain ? "lunge" : kind });
}

// play out the rest of this seat's go: turn down an earned lunge, or use a last stand's second flick
async function finishTurn(T) {
  for (let k = 0; k < 6; k++) {
    await settled(T);
    const st = await state(T);
    if (st.phase !== "play" || st.current !== st.seat || st.queued) return;
    if (await T.page.$("[data-act=stop]")) { await T.page.locator("[data-act=stop]").dispatchEvent("click"); continue; }
    await flickTurn(T);
  }
}

// whoever's go it is, once their phone has drawn everything
function nextUp() {
  const hang = () => new Promise(() => {});
  return Promise.race([myTurn(A).then(() => A, hang), myTurn(B).then(() => B, hang)]);
}

// positioning by touch: one man stepped out to just beyond his wall
async function arrangeByTouch(T) {
  const before = (await state(T)).acts;
  const { me, to } = await T.page.evaluate(() => {
    const s = window.pft.s;
    for (const b of s.bases.filter((b) => b.owner === s.current)) {
      const x = s.soldiers.find((x) => x.alive && x.owner === s.current && Math.hypot(x.x - b.x, x.y - b.y) < b.r);
      if (!x) continue;
      const ang = Math.atan2(x.y - b.y, x.x - b.x) || 0.5;
      return { me: x, to: { x: b.x + Math.cos(ang) * (b.r + 12), y: b.y + Math.sin(ang) * (b.r + 12) } };
    }
  });
  const p0 = await T.world(me.x, me.y), p1 = await T.world(to.x, to.y);
  await T.drag(p0.x, p0.y, p1.x, p1.y + 46, { steps: 14, hold: 80, ms: 420 });
  await settled(T);
  return (await state(T)).acts === before + 1;
}

// a send by touch: "send men", drag camp to camp, "1"
async function sendByTouch(T) {
  const before = (await state(T)).acts;
  const r = await T.page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.bases.filter((b) => b.owner === s.current);
    const home = (b) => s.soldiers.filter((x) => x.alive && x.owner === s.current && x.convoy === undefined && Math.hypot(x.x - b.x, x.y - b.y) <= b.r * 1.05).length;
    mine.sort((a, b) => home(b) - home(a));
    return { from: mine[0], to: mine[1], button: !!document.querySelector("[data-act=send]") };
  });
  if (!r.button || !r.to) return false;
  await T.page.locator("[data-act=send]").dispatchEvent("click");
  await T.page.waitForTimeout(400);
  const p0 = await T.world(r.from.x, r.from.y), p1 = await T.world(r.to.x, r.to.y);
  await T.drag(p0.x, p0.y, p1.x, p1.y, { steps: 16, hold: 80, ms: 500 });
  await T.page.waitForSelector("[data-act=n]", { timeout: 10000 }).catch(() => {});
  const n = await T.page.$('[data-act=n][data-n="1"]');
  if (!n) return false;
  await n.dispatchEvent("click");
  await settled(T);
  return (await state(T)).acts === before + 1;
}

const logHas = (T, test) => T.page.evaluate((src) => window.pft.link.data.log.some((e) => new Function("e", `return ${src}`)(e)), test);

let A, B;
try {
  A = await phone({ ...opts, url });
  await A.page.evaluate(() => window.pft.speed = 1.5);
  // Burooj: play a friend, name on the label, start the page
  await A.page.waitForTimeout(900);
  await A.page.getByText("play a friend").dispatchEvent("click");
  await A.page.waitForTimeout(300);
  await A.page.locator("#cover .label input").fill("Burooj");
  await A.page.screenshot({ path: `${out}/01-name-on-label.png` });
  await A.page.getByText("start a page for two").dispatchEvent("click");
  await A.page.waitForSelector("#sheet:not([hidden]) .link", { timeout: 60000 });
  await A.page.waitForTimeout(500);
  await A.page.screenshot({ path: `${out}/02-send-the-link.png` });
  const link = (await A.page.textContent("#sheet .link")).trim();
  const code = link.split("/r/")[1];
  check(/^[a-z0-9]{6}$/.test(code), `room made: ${link}`);
  check(new URL(A.page.url()).pathname === `/r/${code}`, "Burooj's address bar is the room");
  await A.page.locator('#sheet [data-a="back"]').dispatchEvent("click");

  // Dawood opens the link on his phone
  B = await phone({ ...opts, url: new URL(`/r/${code}`, url).href });
  await B.page.evaluate(() => window.pft.speed = 1.5);
  await B.page.waitForSelector("#cover .label input", { timeout: 60000 });
  await B.page.waitForTimeout(700);
  await B.page.locator("#cover .label input").fill("Dawood");
  await pair("03-link-opened", A, B, "(opened the link)");
  await B.page.getByText("take the red pen").dispatchEvent("click");
  await B.page.waitForFunction(() => window.pft.link?.seat === 1, undefined, { timeout: 60000 });
  check(true, "Dawood took the red pen (seat 1)");
  await A.wait(() => window.pft.link.names[1] === "Dawood", undefined, 60000);
  check(true, "Burooj's phone learned Dawood's name");

  // camps: three each, alternately, by touch
  const spots = [[300, 1350], [650, 350], [720, 1450], [300, 250], [520, 1100], [480, 560]];
  for (let i = 0; i < spots.length; i++) {
    const me = i % 2 ? B : A;
    console.log(`camp ${i + 1}`);
    await myTurn(me);
    await placeAt(me, ...spots[i]);
    if (i === 1) { await A.page.waitForTimeout(1600); await pair("04-camps-arriving", A, B); }
  }
  let up = await nextUp();
  const [sa, sb] = [await state(A), await state(B)];
  check(sa.bases === 6 && sb.bases === 6 && sa.phase === "position" && sb.phase === "position", "six camps on both pages, now arranging");

  // positioning: each side steps a man out by touch, then "done arranging"
  let touchArranged = 0;
  for (let k = 0; k < 2; k++) {
    console.log(`arrange ${k + 1}`);
    if (await arrangeByTouch(up)) touchArranged++;
    await up.page.locator("[data-act=ready]").dispatchEvent("click");
    if (k === 0) { const them = up === A ? B : A; await settled(up); await them.page.waitForTimeout(2500); await pair("05-arranging", A, B, "(their men walk out)"); }
    up = await nextUp();
  }
  const pos = await Promise.all([A, B].map((T) => T.page.evaluate(() => JSON.stringify(window.pft.s.soldiers.map((x) => [x.x, x.y])))));
  const arr = await logHas(A, `e.a.a.t === "arrange"`);
  check((await state(A)).phase === "play" && pos[0] === pos[1] && arr, `arrangements crossed: both phones' men stand in the same places (${touchArranged}/2 moved by touch)`);

  // flicks: a snipe, a lunge, and a send, each crossing the wire
  let sentOk = false;
  for (let t = 0; t < 4; t++) {
    console.log(`turn ${t + 1}`);
    if (t === 2) sentOk = await sendByTouch(up);
    await flickTurn(up, t === 1 ? "lunge" : "snipe");
    if (t === 1) { await (up === A ? B : A).page.waitForTimeout(1500); await pair("06-a-lunge-arrives", A, B); }
    await finishTurn(up);
    up = await nextUp();
  }
  const lunged = await Promise.all([A, B].map((T) => logHas(T, `e.a.a.t === "flick" && e.a.a.kind === "lunge"`)));
  check(lunged[0] && lunged[1], "a lunge crossed the wire");
  const sent = await Promise.all([A, B].map((T) => logHas(T, `e.a.a.t === "send"`)));
  check(sent[0] && sent[1], `a send crossed the wire (${sentOk ? "drawn by touch" : "touch send didn't take"})`);

  // one phone loses signal. The other plays; the offline one says so, and catches up when it's back.
  const on = up, off = up === A ? B : A;
  await settled(off);
  await off.page.context().setOffline(true);
  const n0 = (await state(on)).n;
  await flickTurn(on);
  await finishTurn(on);
  await settled(on);
  const n1 = (await state(on)).n;
  await off.page.waitForTimeout(3500);
  const o1 = await state(off);
  check(o1.offline && o1.queued === 0 && o1.n === n0, `offline phone knows it's offline ("${o1.status}")`);
  await pair("07-offline", A, B);
  await off.page.context().setOffline(false);
  await off.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await myTurn(off);
  const o2 = await state(off);
  check(!o2.offline && o2.n === n1 && n1 > n0, "back online, the other side's go drawn in");

  // the same phone plays with no signal: the move waits there, then goes
  await off.page.context().setOffline(true);
  await flickTurn(off);
  await off.page.waitForTimeout(1500);
  const held = await state(off);
  check(held.pending >= 1, `a move made offline is held ("${held.status}")`);
  await pair("08-move-held-offline", A, B);
  await off.page.context().setOffline(false);
  await off.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await finishTurn(off);
  up = await nextUp();
  await off.page.waitForFunction(() => window.pft.link.data.pending.length === 0, undefined, { timeout: 60000 });
  const n2 = (await state(off)).n;
  await on.page.waitForFunction((n) => window.pft.link.data.log.length === n, n2, { timeout: 60000 });
  check(n2 > n1, "…and reached the other phone when the signal came back");

  // a stale double-tap: this phone's last move again, at its old index
  const stale = await off.page.evaluate(async () => {
    const l = window.pft.link.data;
    let i = l.log.length - 1;
    while (i >= 0 && l.log[i].seat !== l.seat) i--;
    const r = await fetch("/api/room", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "act", code: l.code, seat: l.seat, secret: l.secret, i, a: l.log[i].a }) });
    return { status: r.status, body: await r.json(), n: l.log.length };
  });
  check(stale.status === 409 && stale.body.n === stale.n, `stale double-tap refused (${stale.status}, log stays at ${stale.body.n})`);

  // Dawood closes the app while it's Burooj's go. Burooj plays. Dawood comes back from the cover.
  if (up === B) { await flickTurn(B); await finishTurn(B); up = await nextUp(); }
  const bctx = B.page.context();
  await B.page.close();
  await flickTurn(A);
  await finishTurn(A);
  await settled(A);
  const nA = (await state(A)).n;
  B = await phone({ ...opts, url, context: bctx, clear: false });
  await B.page.waitForTimeout(1200);
  await pair("09-dawood-back-at-cover", A, B, "(reopened the app)");
  await B.page.locator(`#cover [data-room="${code}"]`).dispatchEvent("click");
  await B.page.waitForFunction(() => window.pft.link, undefined, { timeout: 60000 });
  await B.page.waitForTimeout(1200);
  await pair("10-catching-up", A, B, "(catching up)");
  await B.page.waitForFunction((n) => window.pft.link.data.log.length === n && window.pft.link.queued === 0, nA, { timeout: 120000 });
  check(true, `resumed from the cover and caught up from the log (${nA} entries)`);

  // two more goes, and compare the pages
  for (let t = 0; t < 2; t++) {
    up = await nextUp();
    await flickTurn(up);
    await finishTurn(up);
  }
  await settled(A); await settled(B);
  await A.page.waitForFunction(() => window.pft.link.queued === 0 && window.pft.link.data.pending.length === 0, undefined, { timeout: 60000 });
  await B.page.waitForFunction(() => window.pft.link.queued === 0 && window.pft.link.data.pending.length === 0, undefined, { timeout: 60000 });
  await settled(A); await settled(B);
  await A.page.waitForTimeout(2500);
  await pair("11-after-a-dozen-turns", A, B);
  const pages = await Promise.all([A, B].map((T) => T.page.evaluate(() => JSON.stringify({ m: window.pft.s.marks, s: window.pft.s.soldiers }))));
  check(pages[0] === pages[1], "both pages identical, mark for mark");
  const [fa, fb] = [await state(A), await state(B)];
  check(!fa.drift && !fb.drift && !fa.broken && !fb.broken, "no drift or broken page flagged on either phone (hashes matched)");
  const server = await A.page.evaluate(async (code) => (await (await fetch(`/api/room?code=${code}`)).json()).n, code);
  check(server === fa.n && server === fb.n, `server log matches (${server} actions)`);
} catch (e) {
  check(false, `crashed: ${e.message.split("\n").slice(0, 12).join("\n")}`);
  if (A) await A.page.screenshot({ path: `${out}/99-fail-a.png` }).catch(() => {});
  if (B) await B.page.screenshot({ path: `${out}/99-fail-b.png` }).catch(() => {});
} finally {
  for (const T of [A, B]) if (T?.logs.length) console.log(T.logs.filter((l) => !l.includes("[vite]")).join("\n"));
  await browser.close();
}
const failed = checks.filter(([ok]) => !ok).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);

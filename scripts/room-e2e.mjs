// Two phones, one room: a real end-to-end run of the room link.
// Usage: node scripts/room-e2e.mjs [url] [outdir]
// Needs the dev server with a store behind /api/room (see vite.config.ts), e.g.
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run dev
// Burooj makes a room and "sends" the link; Dawood opens it on his own phone
// (a separate browser context: separate storage), takes the red pen, and they
// draw camps and flick by real touch. Dawood's phone loses signal mid-game and
// catches up; later he closes the app and resumes from the cover. A stale
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
    seat: p.link?.seat, queued: p.link?.queued, pending: p.link?.data.pending.length, n: p.link?.data.log.length, offline: p.link?.offline,
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
async function flickTurn(T, i) {
  const { me, foe } = await T.page.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    const me = mine[(s.turn * 3) % mine.length];
    foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    return { me, foe: foes[0] };
  });
  await flickAt(T, me.id, foe.x, foe.y, i % 3 === 2 ? 70 : 115, { kind: i % 3 === 2 ? "move" : "shoot" });
}

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
  await myTurn(A);
  await settled(B);
  await B.page.waitForTimeout(1600);
  await pair("05-camps-drawn", A, B, "(waiting in pencil)");
  const [sa, sb] = [await state(A), await state(B)];
  check(sa.bases === 6 && sb.bases === 6 && sa.phase === "play", "six camps on both pages");

  // flicks: a few turns each
  for (let t = 0; t < 4; t++) {
    const me = t % 2 ? B : A;
    console.log(`flick ${t + 1}`);
    await myTurn(me);
    await flickTurn(me, t);
    if (t === 1) { await A.page.waitForTimeout(1500); await pair("06-dawoods-flick-arrives", A, B); }
  }

  // Dawood loses signal. Burooj flicks; Dawood sees nothing, says so, and catches up when it's back.
  await myTurn(A);
  await settled(B);
  await B.page.context().setOffline(true);
  await flickTurn(A, 4);
  await settled(A);
  await B.page.waitForTimeout(3500);
  const off = await state(B);
  check(off.offline && off.queued === 0 && off.n === 10, `offline phone knows it's offline ("${off.status}")`);
  await pair("07-dawood-offline", A, B, "(no signal)");
  await B.page.context().setOffline(false);
  await B.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await myTurn(B);
  const back = await state(B);
  check(!back.offline && back.n === 11, "back online, Burooj's flick drawn in");

  // Dawood flicks with no signal: the move waits on his phone, then goes
  await B.page.context().setOffline(true);
  await flickTurn(B, 5);
  await B.page.waitForTimeout(1500);
  const held = await state(B);
  check(held.pending === 1, `a move made offline is held ("${held.status}")`);
  await pair("08-move-held-offline", A, B, "(flicked with no signal)");
  await B.page.context().setOffline(false);
  await B.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await myTurn(A);
  check((await state(A)).n === 12, "…and reached Burooj when the signal came back");

  // a stale double-tap: Burooj's last flick again, at its old index
  const stale = await A.page.evaluate(async () => {
    const l = window.pft.link.data;
    const i = l.log.length - 2; // his last move
    const r = await fetch("/api/room", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "act", code: l.code, seat: l.seat, secret: l.secret, i, a: l.log[i].a }) });
    return { status: r.status, body: await r.json() };
  });
  check(stale.status === 409 && stale.body.n === 12, `stale double-tap refused (${stale.status}, log stays at ${stale.body.n})`);

  // Dawood closes the app. Burooj flicks. Dawood comes back from the cover's "games with friends".
  const bctx = B.page.context();
  await B.page.close();
  await flickTurn(A, 6);
  await settled(A);
  B = await phone({ ...opts, url, context: bctx, clear: false });
  await B.page.waitForTimeout(1200);
  await pair("09-dawood-back-at-cover", A, B, "(reopened the app)");
  await B.page.locator(`#cover [data-room="${code}"]`).dispatchEvent("click");
  await B.page.waitForFunction(() => window.pft.link, undefined, { timeout: 60000 });
  await B.page.waitForTimeout(1200);
  await pair("10-catching-up", A, B, "(catching up)");
  await myTurn(B);
  check((await state(B)).n === 13, "resumed from the cover and caught up from the log");

  // two more turns, and compare the pages
  for (let t = 7; t < 9; t++) {
    const me = t % 2 ? B : A;
    await myTurn(me);
    await flickTurn(me, t);
  }
  await myTurn(B);
  await settled(A);
  await A.page.waitForTimeout(1500);
  await pair("11-after-a-dozen-turns", A, B);
  const pages = await Promise.all([A, B].map((T) => T.page.evaluate(() => JSON.stringify({ m: window.pft.s.marks, s: window.pft.s.soldiers }))));
  check(pages[0] === pages[1], "both pages identical, mark for mark");
  const server = await A.page.evaluate(async (code) => (await (await fetch(`/api/room?code=${code}`)).json()).n, code);
  check(server === (await state(A)).n, `server log matches (${server} actions)`);
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

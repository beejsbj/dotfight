// Scripted playtest of every rule set at phone sizes, with real touch events.
// Needs the dev server (for the window.pft hook) and Chrome:
//   npm run dev -- --port 5173 &
//   node scripts/playtest.mjs http://localhost:5173/ [outDir]
// Picks each rule set on the title screen, draws the bases by touch, flicks,
// moves and sends by touch, and checks the engine state after each step.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? ".tmp/playtest";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const PHONES = [
  { name: "iphone-14", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  { name: "iphone-se", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  { name: "pixel-7", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6 },
].filter((ph) => !process.env.PHONES || process.env.PHONES.split(",").includes(ph.name));
const only = process.env.SETS?.split(",");
const failures = [];
const check = (ok, what) => { if (!ok) { failures.push(what); console.log(`  ✗ ${what}`); } else console.log(`  ✓ ${what}`); };

for (const phone of PHONES) {
  const ctx = await b.newContext({ viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const tap = async (x, y) => { await touch("touchStart", x, y); await p.waitForTimeout(40); await touch("touchEnd"); await p.waitForTimeout(60); };
  const drag = async (x0, y0, x1, y1, hold = 250) => {
    await touch("touchStart", x0, y0);
    await p.waitForTimeout(hold);
    for (let i = 1; i <= 8; i++) { await touch("touchMove", x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8); await p.waitForTimeout(16); }
    await touch("touchEnd");
  };
  const S = () => p.evaluate(() => JSON.parse(JSON.stringify(window.pft.s)));
  const toScreen = (x, y) => p.evaluate(([x, y]) => window.pft.cam.toScreen({ x, y }), [x, y]);
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      await p.waitForTimeout(150);
      const sheet = await p.evaluate(() => !document.querySelector("#sheet").hidden);
      if (sheet) { await tap(phone.viewport.width / 2, phone.viewport.height / 2); continue; }
      const idle = await p.evaluate(() => !window.pft.busy && window.pft.fx.end(performance.now()) <= performance.now());
      if (idle) return;
    }
  };

  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); for (const k of ["place", "aim"]) localStorage.setItem(`pft:taught:${k}`, "1"); localStorage.setItem("pft:muted", "1"); });
  const ids = await p.evaluate(() => window.pft.RULESETS.map((r) => r.id));
  for (const id of ids) {
    if (only && !only.includes(id)) continue;
    console.log(`${phone.name} · ${id}`);
    await p.reload();
    await p.waitForTimeout(600);
    // pick the rules on the title card
    await p.locator('button[data-a="rules"]').tap();
    await p.waitForTimeout(250);
    await p.locator(`button[data-id="${id}"]`).tap();
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/${phone.name}-${id}-card.png` });
    await p.locator('button[data-a="title"]').tap();
    await p.waitForTimeout(250);
    await p.locator('button[data-a="pnp"]').tap();
    await p.waitForTimeout(500);
    let s = await S();
    check(s.rules.id === id, `game uses ${id}`);

    // draw bases by touch: blue along the bottom, red along the top
    const spots = [[250, 1450], [250, 250], [720, 1450], [720, 250], [480, 1250], [480, 450], [250, 1060], [250, 640], [760, 1080], [760, 620]];
    let k = 0;
    while (s.phase === "setup" && k < spots.length) {
      if (s.rules.kit) {
        // choose a shape from the strip (the first one offered)
        const btn = p.locator("#kind button").nth(k % 2);
        if (await btn.count()) await btn.tap();
      }
      const [x, y] = spots[k++];
      const at = await toScreen(x, y);
      await tap(at.x, at.y + 70); // on touch the outline floats 70px above the finger
      await settle();
      s = await S();
    }
    check(s.phase === "play" || s.phase === "position", `all bases drawn by touch (${s.bases.length})`);
    // positioning (round 2): drag one soldier a little, by touch, then done; both sides
    for (let side = 0; side < 2 && s.phase === "position"; side++) {
      const n0 = s.actions.length;
      const me = s.soldiers.find((x) => x.alive && x.owner === s.current);
      const home = s.bases[me.home];
      const a = await toScreen(me.x, me.y), to = await toScreen(home.x + (home.x > 500 ? -1 : 1) * (home.r + 20), home.y);
      await touch("touchStart", a.x, a.y);
      await p.waitForTimeout(80);
      for (let i = 1; i <= 8; i++) { await touch("touchMove", a.x + ((to.x - a.x) * i) / 8, a.y + ((to.y + 40 - a.y) * i) / 8); await p.waitForTimeout(16); }
      await touch("touchEnd");
      await p.waitForTimeout(150);
      if (side === 0) await p.screenshot({ path: `${out}/${phone.name}-${id}-position.png` });
      s = await S();
      check(s.actions.length === n0 + 1 && s.actions.at(-1).t === "arrange", "positioning: a soldier dragged into place by touch");
      await p.locator('#kind button[data-key="done"]').tap();
      await settle();
      s = await S();
    }
    check(s.phase === "play", "play begins");
    if (k === 2) await p.screenshot({ path: `${out}/${phone.name}-${id}-setup.png` });
    await p.screenshot({ path: `${out}/${phone.name}-${id}-bases.png` });

    // a few turns: shoot, move, and (where the rules have it) send
    for (let t = 0; t < 6 && s.phase === "play"; t++) {
      await settle();
      s = await S();
      const marks = s.marks.length;
      if (s.must) {
        // an earned lunge: turn it down
        const who = s.current;
        await p.locator('#kind button[data-key="stop"]').tap();
        await settle();
        s = await S();
        check(s.current !== who && !s.must, "an earned lunge can be turned down (stop)");
        continue;
      }
      const kind = t === 1 ? "move" : t === 2 && s.rules.transfer ? "send" : "shoot";
      await p.locator(`#kind button[data-key="${kind}"]`).tap();
      await p.waitForTimeout(150);
      if (kind === "send") {
        const mine = s.bases.filter((b) => b.owner === s.current && !b.fallen);
        const a = await toScreen(mine[0].x, mine[0].y), bb = await toScreen(mine[1].x, mine[1].y);
        await tap(a.x, a.y);
        await tap(bb.x, bb.y);
        await p.waitForTimeout(200);
        const chips = await p.locator("#chips button").count();
        check(chips > 1, `send: count chips shown (${chips - 1})`);
        await p.screenshot({ path: `${out}/${phone.name}-${id}-send.png` });
        await p.locator('#chips button[data-n="2"]').tap();
        await settle();
        const s2 = await S();
        check(s2.transits.length === 1 && s2.actions.at(-1).t === "transfer", "send: two soldiers on the road");
        if (s2.rules.transfer.pace) check(s2.soldiers.filter((x) => x.transit === 0).every((x) => x.x > 0 && x.y > 0), "send: walkers stand on the page");
        s = s2;
        continue;
      }
      const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current && x.transit === undefined);
      const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current && x.transit === undefined);
      const me = mine[(t * 7) % mine.length], foe = foes[(t * 3) % foes.length];
      const a = await toScreen(me.x, me.y);
      await tap(a.x, a.y); // pick him (the camera closes in)
      await p.waitForTimeout(450);
      const a2 = await toScreen(me.x, me.y);
      const ang = Math.atan2(foe.y - me.y, foe.x - me.x);
      const pullPx = kind === "move" ? 40 : 120;
      await drag(a2.x, a2.y, a2.x - Math.cos(ang) * pullPx, a2.y - Math.sin(ang) * pullPx);
      await p.waitForTimeout(200);
      if (t === 0) await p.screenshot({ path: `${out}/${phone.name}-${id}-ink.png` });
      await settle();
      s = await S();
      check(s.marks.length > marks, `${kind} by touch drew ink (turn ${s.turn})`);
    }
    await p.evaluate(() => window.pft.cam.fit());
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${phone.name}-${id}-page.png` });
    const cutoff = await p.evaluate(() => {
      const r = document.querySelector("#bottom").getBoundingClientRect();
      const kind = document.querySelector("#kind").getBoundingClientRect();
      return { bottom: r.bottom <= innerHeight + 1, kindFits: kind.right <= innerWidth && kind.left >= 0 };
    });
    check(cutoff.bottom && cutoff.kindFits, "HUD fits the screen");
  }
  check(errors.length === 0, `no page errors on ${phone.name}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await ctx.close();
}
await b.close();
console.log(failures.length ? `\n${failures.length} failed` : "\nall good");
process.exit(failures.length ? 1 : 0);

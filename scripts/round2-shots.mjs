// Screenshots of the round-2 mechanics at phone size (390×844), from the
// scenes made by scripts/round2-scenes.ts. Needs the dev server and Chrome:
//   npm run dev -- --port 5173 &
//   node scripts/round2-shots.mjs http://localhost:5173/ .tmp/scenes.json docs/rules-lab/shots/round-2
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/";
const scenes = JSON.parse(readFileSync(process.argv[3] ?? ".tmp/scenes.json", "utf8"));
const out = process.argv[4] ?? "docs/rules-lab/shots/round-2";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => { localStorage.clear(); for (const k of ["place", "aim"]) localStorage.setItem(`pft:taught:${k}`, "1"); localStorage.setItem("pft:muted", "1"); });
await p.reload();
await p.waitForTimeout(800);
const idle = async () => {
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(100);
    if (await p.evaluate(() => !window.pft.busy && window.pft.fx.end(performance.now()) <= performance.now())) return;
  }
};
const zoom = (f) => p.evaluate((f) => { const c = window.pft.cam; c.to(f.x, f.y, c.fitZ * 2.4, 0); window.pft.renderNow(); }, f);
const fit = () => p.evaluate(() => { window.pft.cam.fit(); window.pft.renderNow(); });
for (const sc of scenes) {
  await p.evaluate((s) => window.pft.load(s), sc.state);
  await p.waitForTimeout(300);
  if (sc.focus) await zoom(sc.focus);
  if (sc.flick) {
    await p.evaluate((f) => window.pft.fire(f, 0.6), sc.flick);
    await p.waitForTimeout(260);
    await p.screenshot({ path: `${out}/${sc.name}-drawing.png` });
    await idle();
    if (sc.focus) await zoom(sc.focus);
  } else if (sc.send) {
    await p.evaluate((a) => window.pft.send(a.from, a.to, a.n), sc.send);
    await idle();
  }
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/${sc.name}.png` });
  await fit();
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/${sc.name}-page.png` });
  console.log(`${sc.name}: ${sc.note}`);
}
console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
await b.close();

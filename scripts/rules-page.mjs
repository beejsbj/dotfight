// Screenshots of the /rules page and its share card.
// Needs the dev server running and a Chrome/Chromium binary:
//   npm run dev -- --port 5173 &
//   node scripts/rules-page.mjs http://localhost:5173/          # shots into docs/shots/rules-page/
//   node scripts/rules-page.mjs http://localhost:5173/ --og     # and public/og-rules.jpg
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:5173/").replace(/\/$/, "");
const og = process.argv.includes("--og");
const out = "docs/shots/rules-page";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const errors = [];

async function open(viewport, dpr, motion = "no-preference", hash = "") {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: motion, hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${base}/rules${hash}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.body.classList.contains("drawn"));
  await p.waitForTimeout(1300); // the lamp clicks on
  return { ctx, p };
}

for (const [name, viewport, dpr] of [["phone", { width: 390, height: 844 }, 2], ["desktop", { width: 1440, height: 900 }, 1]]) {
  // the whole book, every drawing finished
  {
    const { ctx, p } = await open(viewport, dpr, "reduce");
    await p.screenshot({ path: `${out}/${name}-top.jpg`, type: "jpeg", quality: 82 });
    await ctx.close();
    const flat = await open(viewport, 1, "reduce");
    await flat.p.screenshot({ path: `${out}/${name}-full.jpg`, fullPage: true, type: "jpeg", quality: 78 });
    await flat.ctx.close();
  }
  // deep links, and the drawings as they're drawn
  for (const [hash, wait] of [["#snipe", 2600], ["#lunge", 4600], ["#ink", 900], ["#shapes", 900], ["#open", 400]]) {
    const { ctx, p } = await open(viewport, dpr, "no-preference", hash);
    await p.waitForTimeout(wait);
    await p.screenshot({ path: `${out}/${name}-${hash.slice(1)}.jpg`, type: "jpeg", quality: 82 });
    await ctx.close();
  }
}

if (og) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`${base}/rules?og`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.body.classList.contains("drawn"));
  await p.waitForTimeout(300);
  writeFileSync("public/og-rules.jpg", await p.screenshot({ type: "jpeg", quality: 84 }));
  await ctx.close();
}

await b.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`shots in ${out}/${og ? ", public/og-rules.jpg" : ""}`);

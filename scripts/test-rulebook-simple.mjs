// Simple rulebook test: just verify the book loads and works at both sizes

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = "http://localhost:5174/";
const outdir = "docs/shots/rulebook-flip";
mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

async function testSize(name, viewport, dpr, hasTouch) {
  console.log(`\n${name}`);
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    hasTouch,
    isMobile: viewport.width < 700,
  });
  const page = await ctx.newPage();
  
  // Core rules
  await page.goto(base + "rules");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.body.classList.contains("drawn"), { timeout: 15000 });
  const isPaged = await page.evaluate(() => document.documentElement.classList.contains("ready"));
  console.log(`  /rules: ${isPaged ? "✓ paged" : "✗ fallback"}`);
  await page.screenshot({ path: `${outdir}/${name}-rules.jpg`, quality: 80 });

  // Advanced rules
  await page.goto(base + "rules/advanced");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.body.classList.contains("drawn"), { timeout: 15000 });
  const isPagedAdv = await page.evaluate(() => document.documentElement.classList.contains("ready"));
  console.log(`  /rules/advanced: ${isPagedAdv ? "✓ paged" : "✗ fallback"}`);
  await page.screenshot({ path: `${outdir}/${name}-advanced.jpg`, quality: 80 });

  // Performance test
  if (isPaged || isPagedAdv) {
    await page.goto(base + "rules");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.documentElement.classList.contains("ready"), { timeout: 15000 });
    
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const frameTimes = await page.evaluate(() => {
      return new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const cap = () => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (times.length < 120) requestAnimationFrame(cap);
          else resolve(times);
        };
        // Trigger a page turn
        setTimeout(() => {
          const evt = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
          document.dispatchEvent(evt);
          cap();
        }, 100);
      });
    });

    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    const sorted = [...frameTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const dropped = frameTimes.filter((t) => t > 33.3).length;
    
    console.log(`  Performance (4x throttle): p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms dropped=${dropped}/120`);
  }

  await ctx.close();
}

await testSize("phone-390x844", { width: 390, height: 844 }, 2, true);
await testSize("desktop-1440x900", { width: 1440, height: 900 }, 1, false);

await browser.close();
console.log(`\n✓ Complete. Screenshots: ${outdir}`);

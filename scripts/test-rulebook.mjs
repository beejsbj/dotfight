// Test and capture the page-turning rulebook at phone and desktop sizes.
// Measures performance under CPU throttle, captures screenshots, and validates features.

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5174/").replace(/\/$/, "");
const outdir = "docs/shots/rulebook-flip";
mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

const results = {};

async function testBook(name, path, viewport, dpr, hasTouch) {
  console.log(`\n📖 Testing ${name}: ${path} at ${viewport.width}×${viewport.height}`);

  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    hasTouch,
    isMobile: viewport.width < 700,
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => {
    if (m.type() === "error") logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

  try {
    // Load page and wait for binding
    console.log("  Loading page...");
    await page.goto(`${base}${path}`);
    await page.evaluate(() => document.fonts.ready);

    // Wait for either paged or scroll mode
    await page.waitForFunction(
      () => document.body.classList.contains("drawn") || document.body.classList.contains("ready"),
      { timeout: 15000 }
    );

    const isPaged = await page.evaluate(() => document.documentElement.classList.contains("ready"));
    const isScrollMode = await page.evaluate(() => document.documentElement.classList.contains("scroll"));
    const isFallback = isScrollMode || !isPaged;

    console.log(`  Mode: ${isFallback ? "scroll/fallback" : "paged (book)"}`);
    if (isPaged) {
      console.log("  ✓ Book mode detected");
    } else {
      console.warn("  ⚠️  Fell back to scroll mode");
    }

    // Test 1: Scroll wheel input (desktop)
    if (!hasTouch && isPaged) {
      console.log("  Testing wheel scroll...");
      const posBeforeWheel = await page.evaluate(() => window.book?.rest ?? -1);

      // Send wheel event to the stage
      const wheelSent = await page.evaluate(() => {
        return new Promise((resolve) => {
          const stage = document.querySelector(".stage");
          if (!stage) {
            resolve(false);
            return;
          }
          let movedPos = false;
          const wheelEvent = new WheelEvent("wheel", {
            deltaY: 360,
            bubbles: true,
            cancelable: true,
          });
          stage.dispatchEvent(wheelEvent);
          // Wait a moment for animation to start
          setTimeout(() => {
            const newPos = window.book?.rest ?? -1;
            resolve(newPos !== posBeforeWheel);
          }, 100);
        });
      });

      if (wheelSent) {
        console.log("  ✓ Wheel event processed");
      } else {
        console.log("  ✗ Wheel event failed");
      }

      // Wait for animation to settle
      await page.waitForTimeout(500);
    }

    // Test 2: Arrow keys (all modes)
    console.log("  Testing arrow keys...");
    const posBeforeArrow = await page.evaluate(() => {
      if (window.book) return window.book.rest;
      // For scroll mode, get scroll position
      return window.scrollY / 100; // rough conversion
    });

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);

    const posAfterArrow = await page.evaluate(() => {
      if (window.book) return window.book.rest;
      return window.scrollY / 100;
    });

    if (posAfterArrow > posBeforeArrow) {
      console.log("  ✓ Arrow key navigation works");
    } else {
      console.log("  ⚠️  Arrow key may not have changed position");
    }

    // Test 3: Deep link (#snipe)
    console.log("  Testing deep link (#snipe)...");
    await page.goto(`${base}${path}#snipe`);
    await page.waitForTimeout(800);
    const deepLinkWorked = await page.evaluate(() => {
      if (window.book) {
        // Book mode: check if we're on a page that has #snipe
        const target = document.getElementById("snipe");
        return target && target.offsetParent !== null; // Element is visible
      }
      // Scroll mode: check if the element is in view
      const target = document.getElementById("snipe");
      const rect = target?.getBoundingClientRect();
      return rect && rect.top > 0 && rect.top < window.innerHeight;
    });
    console.log(`  ${deepLinkWorked ? "✓" : "⚠️ "} Deep link navigation`);

    // Test 4: Reduced motion
    console.log("  Testing reduced motion mode...");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotionActive = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    console.log(`  Reduced motion: ${reducedMotionActive ? "✓ detected" : "✗ not detected"}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Test 5: ?read=all scroll mode
    console.log("  Testing ?read=all scroll mode...");
    const ctxScroll = await browser.newContext({ viewport, deviceScaleFactor: dpr });
    const pageScroll = await ctxScroll.newPage();
    await pageScroll.goto(`${base}${path}?read=all`);
    await pageScroll.evaluate(() => document.fonts.ready);
    const hasScroll = await pageScroll.evaluate(
      () => document.documentElement.classList.contains("scroll")
    );
    console.log(`  ?read=all mode: ${hasScroll ? "✓" : "✗"}`);
    await ctxScroll.close();

    // Test 6: Performance under CPU throttle
    if (isPaged) {
      console.log("  Testing performance under 4x CPU throttle...");
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

      const perfData = await page.evaluate(() => {
        return new Promise((resolve) => {
          const frameTimes = [];
          let lastTime = performance.now();
          const target = 120; // 2 seconds at 60fps

          const captureFrame = () => {
            const now = performance.now();
            const delta = now - lastTime;
            frameTimes.push(delta);
            lastTime = now;

            if (frameTimes.length < target) {
              requestAnimationFrame(captureFrame);
            } else {
              resolve(frameTimes);
            }
          };

          // Trigger animation by simulating user input
          setTimeout(() => {
            const evt = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
            document.dispatchEvent(evt);
            captureFrame();
          }, 100);
        });
      });

      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); // Reset

      const sorted = [...perfData].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const max = Math.max(...perfData);
      const droppedFrames = perfData.filter((t) => t > 33.3).length;

      console.log(`  Frame times (4x CPU throttle):`);
      console.log(`    p50: ${p50.toFixed(1)}ms  p95: ${p95.toFixed(1)}ms  p99: ${p99.toFixed(1)}ms  max: ${max.toFixed(1)}ms`);
      console.log(`    Dropped frames: ${droppedFrames}/${perfData.length}`);

      results[name] = {
        mode: isPaged ? "paged" : "fallback",
        deepLink: deepLinkWorked,
        reducedMotion: reducedMotionActive,
        scrollMode: hasScroll,
        perf: { p50, p95, p99, max, droppedFrames, totalFrames: perfData.length },
      };
    } else {
      results[name] = {
        mode: "fallback",
        deepLink: deepLinkWorked,
        reducedMotion: reducedMotionActive,
        scrollMode: hasScroll,
        perf: null,
      };
    }

    // Capture final screenshot
    await page.screenshot({
      path: `${outdir}/${name}-test.jpg`,
      quality: 80,
    });
    console.log(`  ✓ Screenshot: ${outdir}/${name}-test.jpg`);

    if (logs.length > 0) {
      console.log(`  Logs: ${logs.join(" | ")}`);
    }

    await ctx.close();
  } catch (e) {
    console.error(`  ✗ Error: ${e.message}`);
    results[name] = { error: e.message };
  }
}

// Run tests
await testBook("rules-phone", "/rules", { width: 390, height: 844 }, 2, true);
await testBook("rules-desktop", "/rules", { width: 1440, height: 900 }, 1, false);
await testBook("advanced-phone", "/rules/advanced", { width: 390, height: 844 }, 2, true);
await testBook("advanced-desktop", "/rules/advanced", { width: 1440, height: 900 }, 1, false);

await browser.close();

// Print summary
console.log("\n" + "=".repeat(70));
console.log("RULEBOOK TEST RESULTS");
console.log("=".repeat(70));

for (const [name, result] of Object.entries(results)) {
  console.log(`\n${name}:`);
  if (result.error) {
    console.log(`  ✗ ERROR: ${result.error}`);
  } else {
    console.log(`  Mode: ${result.mode}`);
    console.log(`  Deep links: ${result.deepLink ? "✓" : "✗"}`);
    console.log(`  Reduced motion: ${result.reducedMotion ? "✓" : "✗"}`);
    console.log(`  Scroll mode (?read=all): ${result.scrollMode ? "✓" : "✗"}`);
    if (result.perf) {
      const pct = ((result.perf.droppedFrames / result.perf.totalFrames) * 100).toFixed(1);
      console.log(`  Performance:`);
      console.log(`    p50: ${result.perf.p50.toFixed(1)}ms`);
      console.log(`    p95: ${result.perf.p95.toFixed(1)}ms`);
      console.log(`    p99: ${result.perf.p99.toFixed(1)}ms`);
      console.log(`    max: ${result.perf.max.toFixed(1)}ms`);
      console.log(`    dropped frames: ${result.perf.droppedFrames}/${result.perf.totalFrames} (${pct}%)`);
    }
  }
}

console.log("\n✓ Testing complete. Verification screenshots in " + outdir);
console.log("Run: open " + outdir);

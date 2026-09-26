// Capture frame sequences during page turns for creating animations

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const base = "http://localhost:5174/";
const outdir = "docs/shots/rulebook-flip";
mkdirSync(`${outdir}/frames`, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

async function capturePageTurn(name, path, viewport, dpr, hasTouch) {
  console.log(`\nCapturing: ${name}`);
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    hasTouch,
    isMobile: viewport.width < 700,
  });
  const page = await ctx.newPage();

  // Load page
  await page.goto(base + path);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.classList.contains("ready"), { timeout: 15000 });

  // Set up frame capture
  const frameDir = `${outdir}/frames/${name}`;
  mkdirSync(frameDir, { recursive: true });

  let frameNum = 0;

  // Capture initial frame
  await page.screenshot({ path: `${frameDir}/${String(frameNum).padStart(3, "0")}.jpg`, quality: 85 });
  frameNum++;

  // Simulate page turn with keyboard arrow (simpler than touch events)
  console.log("  Capturing frame sequence...");
  
  // Capture while animation is running
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(16); // ~60fps
    await page.screenshot({
      path: `${frameDir}/${String(frameNum).padStart(3, "0")}.jpg`,
      quality: 85,
    });
    frameNum++;
  }

  // Trigger page turn
  await page.keyboard.press("ArrowRight");

  // Continue capturing as page turns
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(16);
    await page.screenshot({
      path: `${frameDir}/${String(frameNum).padStart(3, "0")}.jpg`,
      quality: 85,
    });
    frameNum++;
  }

  console.log(`  Captured ${frameNum} frames`);

  // Create WebM
  try {
    const cmd = `ffmpeg -y -framerate 60 -i '${frameDir}/%03d.jpg' -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 500k '${outdir}/${name}.webm' 2>&1 | grep -E 'frame|error'`;
    const { stdout } = await execAsync(cmd, { shell: "/bin/bash" });
    console.log(`  ✓ Created ${name}.webm`);
  } catch (e) {
    console.log(`  ✗ ffmpeg failed: ${e.message.slice(0, 100)}`);
  }

  // Create GIF (smaller, for quick preview)
  try {
    const cmd = `ffmpeg -y -framerate 60 -i '${frameDir}/%03d.jpg' -vf "fps=30,scale=390:-1" '${outdir}/${name}.gif' 2>&1 | grep -E 'frame|error'`;
    const { stdout } = await execAsync(cmd, { shell: "/bin/bash" });
    console.log(`  ✓ Created ${name}.gif`);
  } catch (e) {
    console.log(`  ✗ ffmpeg failed: ${e.message.slice(0, 100)}`);
  }

  await ctx.close();
}

// Capture page turns
await capturePageTurn("rules-turn", "/rules", { width: 390, height: 844 }, 2, true);
await capturePageTurn("advanced-turn", "/rules/advanced", { width: 390, height: 844 }, 2, true);

await browser.close();
console.log("\n✓ Frame capture complete");

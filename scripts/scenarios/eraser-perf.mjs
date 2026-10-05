// A note-sized eraser region, measured separately from the game perf scenario
// (which disables speech). THROTTLE=6 pins the CPU cost on the same rig.
export default async function ({ page, cdp }) {
  const rate = +(process.env.THROTTLE ?? 1);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const result = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d");
    const samples = [];
    for (let i = 0; i < 140; i++) {
      g.clearRect(0, 0, 512, 512);
      g.fillStyle = "#24314c";
      for (let y = 150; y <= 240; y += 15) g.fillRect(100, y, 200, 3);
      const at = performance.now();
      window.pft.ink.rubOut(g, 90, 140, 310, 255, 19, 0.58, 24, "#24314c", 0);
      // Readback ensures raster work finishes inside the measurement.
      g.getImageData(90, 140, 220, 115);
      if (i >= 20) samples.push(performance.now() - at);
    }
    samples.sort((a, b) => a - b);
    return { n: samples.length, p50: samples[60], p95: samples[114], max: samples.at(-1) };
  });
  console.log(`eraser-perf throttle ${rate}x: ${JSON.stringify(result)}`);
}

// Frame times: camera moving (full composite every frame) vs camera still
// (cached lit desk + live layers, as while aiming). Optional CPU throttle.
export default async function (T) {
  const { page, cdp } = T;
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelector("#cover").hidden = true; });
  if (process.env.THROTTLE) await cdp.send("Emulation.setCPUThrottlingRate", { rate: +process.env.THROTTLE });
  const probe = async (label, moving) => {
    await page.evaluate((moving) => {
      window.__wob = setInterval(() => {
        const c = window.pft.cam;
        if (moving) c.tgt.x = 500 + Math.sin(performance.now() / 300) * 200;
        window.pft.poke();
      }, 8);
      window.pft.frames(true);
    }, moving);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { clearInterval(window.__wob); return window.pft.frames(); });
    console.log(label.padEnd(18), `p50 ${r.p50.toFixed(0)}ms  p95 ${r.p95.toFixed(0)}ms  n ${r.n}`);
  };
  await probe("overview-moving", true);
  await probe("overview-still", false);
  await page.evaluate(() => window.pft.cam.sit({ x: 500, y: 1200 }));
  await page.waitForTimeout(1500);
  await probe("sitting-moving", true);
  await page.evaluate(() => window.pft.cam.sit({ x: 500, y: 1200 }));
  await page.waitForTimeout(1500);
  await probe("sitting-still", false);
  console.log(JSON.stringify(await page.evaluate(() => window.pft.stageStats)));
}

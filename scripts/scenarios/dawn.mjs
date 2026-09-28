// A finished war seen in the morning light, on one paper: THEME=<id> (default blueprint).
export default async function (T, out) {
  const { page } = T;
  const id = process.env.THEME ?? "blueprint";
  await page.waitForTimeout(1000);
  await page.evaluate((id) => {
    window.pft.theme.choose(id);
    const r = window.pft.fileWar(11, 400, "classic");
    r.mode = { kind: "pnp" };
    window.pft.view(r);
  }, id);
  await T.wait(() => window.pft.frame().lamp.dawn > 0.99 && window.pft.cam.settled, undefined, 120000);
  await page.waitForTimeout(800);
  console.log(id, JSON.stringify(await page.evaluate(() => ({ phase: window.pft.s.phase, screen: window.pft.screen, dawn: window.pft.frame().lamp.dawn }))));
  await page.screenshot({ path: `${out}/${id}-dawn.jpg`, type: "jpeg", quality: 82 });
}

// A fixed road fixture: reduced-motion march, page reset, and release origins.
import { idle } from "../lib/phone.mjs";

export default async function (T, out) {
  const { page, cdp } = T;
  page.setDefaultTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForFunction(() => !!window.pft);
  await page.evaluate(() => document.fonts.ready);
  const fixture = await page.evaluate(async () => {
    const { newGame, act } = await import("/src/game.ts");
    const { LONG } = await import("/src/rules.ts");
    const { file } = await import("/src/record.ts");
    const s = newGame({ name: "custom", bases: 2, soldiers: 12 }, 42, undefined, LONG);
    for (const [x, y] of [[200, 1500], [200, 200], [900, 1100], [900, 400]]) act(s, { t: "base", x, y, shape: "camp" });
    act(s, { t: "ready" }); act(s, { t: "ready" });
    act(s, { t: "send", from: 0, to: 2, n: 3 }); act(s, { t: "stop" });
    const r = file(s, { kind: "pnp" });
    window.pft.resumeRecord(r); window.pft.clockHeld = true;
    window.pft.slow = true; window.pft.boilOn = false;
    return { r, ids: s.convoys[0].ids };
  });
  await idle(T);
  await page.waitForTimeout(1000);
  // Settle initial layer visibility before comparing later incremental frames.
  await page.evaluate(() => { window.pft.renderNow(); window.pft.redrawCheck(); });
  const rate = +(process.env.THROTTLE ?? 1);
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const pageVersion = await page.evaluate(() => { window.pft.frames(true); window.pft.clockHeld = false; return window.pft.page.version; });
  await page.waitForFunction(() => window.pft.turnClock >= 3000, undefined, { timeout: 30000 });
  await page.evaluate(() => { window.pft.clockHeld = true; });
  await page.waitForTimeout(300);
  console.log("mid-march perf", JSON.stringify(await page.evaluate(() => window.pft.frames())));
  const afterVersion = await page.evaluate(() => window.pft.page.version);
  console.log("settled page versions", pageVersion, afterVersion);
  const roadLayerEmpty = await page.evaluate(() => window.pft.boil.parts[1].empty);
  console.log("road live layer empty", roadLayerEmpty);
  if (process.env.BASELINE !== "1" && roadLayerEmpty) throw new Error("road bodies are missing from their live layer");
  if (process.env.BASELINE !== "1" && pageVersion !== afterVersion) throw new Error("march rebuilt the settled page");
  const check = await page.evaluate(() => window.pft.redrawCheck());
  console.log("reduced-motion mid-march redraw", JSON.stringify(check));
  if (process.env.BASELINE !== "1" && Object.values(check).some((r) => r.bad)) throw new Error("mid-march incremental rendering differs from a full redraw");
  await T.shot(`${out}/march-reduced.png`);
  if (process.env.BASELINE === "1") return;
  const origins = await page.evaluate((ids) => {
    const from = ids.map((id) => ({ ...window.pft.shown.soldiers[id] }));
    const s = window.pft.s;
    const me = s.soldiers.find((x) => x.alive && x.owner === s.current && x.convoy === undefined);
    window.pft.flick({ soldier: me.id, kind: "snipe", angle: 0, length: 100, bend: 0, wob: 0, ms: window.pft.turnClock });
    return { from, due: window.pft.lapse };
  }, fixture.ids);
  // The renderer snaps to 125 ms steps; release origin is the exact timestamp.
  await page.waitForFunction(() => !!window.pft.lapse, undefined, { timeout: 30000 });
  const lapse = await page.evaluate(() => window.pft.lapse);
  for (const x of origins.from) {
    const w = lapse.walkers.find((w) => w.id === x.id);
    if (w && Math.hypot(w.from.x - x.x, w.from.y - x.y) > 4) throw new Error("handover rewound a marching man");
  }
  await idle(T);
  const reset = await page.evaluate((r) => {
    window.pft.resumeRecord(r); window.pft.clockHeld = true;
    return window.pft.turnClock;
  }, fixture.r);
  if (reset !== 0) throw new Error(`page clock survived reset: ${reset}`);
  console.log("page clock resets and handover starts at release positions");
}

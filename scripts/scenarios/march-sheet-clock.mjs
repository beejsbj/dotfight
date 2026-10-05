// A sheet closed between sparse frames must not credit its paused interval.
import { idle } from "../lib/phone.mjs";
export default async function (T) {
  const { page } = T;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    const { newGame, act } = await import("/src/game.ts");
    const { LONG } = await import("/src/rules.ts");
    const { file } = await import("/src/record.ts");
    const s = newGame({ name: "custom", bases: 2, soldiers: 12 }, 42, undefined, LONG);
    for (const [x,y] of [[200,1500],[200,200],[900,1100],[900,400]]) act(s,{t:"base",x,y,shape:"camp"});
    act(s,{t:"ready"}); act(s,{t:"ready"});
    act(s,{t:"send",from:0,to:2,n:3}); act(s,{t:"stop"});
    window.pft.resumeRecord(file(s,{kind:"pnp"}));
    window.pft.clockHeld=true; window.pft.slow=true; window.pft.boilOn=false;
  });
  await idle(T);
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => {
      if (cb.name === "frame") { window.__sheetFrame = cb; return 0; }
      return raf(cb);
    };
  });
  await page.waitForFunction(() => window.__sheetFrame, undefined, {polling:50});
  const paused = await page.evaluate(() => {
    document.querySelector('#cover [data-a="how"]').click();
    if (document.querySelector("#sheet").hidden) throw new Error("help sheet did not open");
    window.pft.clockHeld=false;
    window.__sheetFrame(performance.now());
    return window.pft.turnClock;
  });
  await page.waitForTimeout(900);
  const closedAt = await page.evaluate(() => {
    document.querySelector('#sheet [data-a="back"]').click();
    if (!document.querySelector("#sheet").hidden) throw new Error("help sheet did not close");
    return performance.now();
  });
  await page.waitForTimeout(100);
  const result = await page.evaluate(({closedAt,paused}) => {
    const now=performance.now();
    window.__sheetFrame(now);
    return {eligible:now-closedAt, credited:window.pft.turnClock-paused};
  }, {closedAt,paused});
  console.log("sparse sheet close (reduced motion, boil off)", JSON.stringify(result));
  if (Math.abs(result.credited-result.eligible)>30) throw new Error("sheet close credits paused time");
}

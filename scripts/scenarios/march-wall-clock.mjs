// Sparse visible frames must preserve the six-second clock; hidden time is free.
import { idle } from "../lib/phone.mjs";
export default async function (T) {
  const { page } = T;
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
  const start = await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(() => setTimeout(() => {
      const now = performance.now();
      if (cb.name === "frame") window.__marchFrameWall = now;
      cb(now);
    }, 180));
    return new Promise(resolve => requestAnimationFrame(() => {
      window.pft.clockHeld=false;
      document.dispatchEvent(new Event("visibilitychange"));
      resolve({ wall:performance.now(), clock:window.pft.turnClock });
    }));
  });
  await page.waitForTimeout(2400);
  const elapsed = await page.evaluate(start => ({ wall:window.__marchFrameWall-start.wall, readback:performance.now()-start.wall, clock:window.pft.turnClock-start.clock }), start);
  console.log("sparse-frame march", JSON.stringify(elapsed));
  if (!(elapsed.wall > 1000) || Math.abs(elapsed.clock-elapsed.wall) > 100) throw new Error("march duration depends on sparse frame count");
  const hiddenClock = await page.evaluate(() => {
    Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
    document.dispatchEvent(new Event("visibilitychange"));
    return window.pft.turnClock;
  });
  await page.waitForTimeout(1000);
  const held = await page.evaluate(() => window.pft.turnClock);
  if (held !== hiddenClock) throw new Error("hidden page spends march time");
  const visibleAt = await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
    return performance.now();
  });
  await page.waitForFunction(at => window.__marchFrameWall > at && window.pft.turnClock > 0, visibleAt, {timeout:30000});
  const resumed = await page.evaluate(({wall,clock}) => ({ wall:window.__marchFrameWall-wall, readback:performance.now()-wall, clock:window.pft.turnClock-clock }), {wall:visibleAt,clock:hiddenClock});
  console.log("hidden clock holds", hiddenClock, held, "visible resume", JSON.stringify(resumed));
  if (!(resumed.wall >= 0) || Math.abs(resumed.clock-resumed.wall) > 100) throw new Error("resume counts hidden time or loses visible time");
  const manual = await page.evaluate(() => {
    window.pft.hand(true);
    const at = window.pft.turnClock;
    window.pft.step(350);
    return at;
  });
  await page.waitForFunction(at => window.pft.turnClock >= at+350, manual, {timeout:30000});
  const advanced = await page.evaluate(() => window.pft.turnClock);
  await page.evaluate(() => window.pft.hand(false));
  if (Math.abs(advanced-manual-350) > 1e-6) throw new Error("manual frame capture leaked wall time");
  console.log("visible wall time drives march; hidden time excluded; manual step exact");
}

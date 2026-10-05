// Pause entry preserves eligible time; pause exit excludes the paused interval.
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
  const results=[];
  for(const kind of ["sheet","visibility"]){
    const start=await page.evaluate(()=>{
      window.pft.clockHeld=false;
      document.dispatchEvent(new Event("visibilitychange"));
      const wall=performance.now();
      window.__sheetFrame(wall);
      return {wall,clock:window.pft.turnClock};
    });
    await page.waitForTimeout(900);
    const entry=await page.evaluate(kind=>{
      if(kind==="sheet")document.querySelector('#cover [data-a="how"]').click();
      else { Object.defineProperty(document,"hidden",{configurable:true,get:()=>true}); document.dispatchEvent(new Event("visibilitychange")); }
      return {wall:performance.now(),clock:window.pft.turnClock};
    },kind);
    await page.waitForTimeout(900);
    const exit=await page.evaluate(kind=>{
      if(kind==="sheet")document.querySelector('#sheet [data-a="back"]').click();
      else {delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));}
      return {wall:performance.now(),clock:window.pft.turnClock};
    },kind);
    await page.waitForTimeout(100);
    const after=await page.evaluate(()=>{
      const at=performance.now();window.__sheetFrame(at);
      return {wall:at,clock:window.pft.turnClock};
    });
    const r={kind,entryEligible:entry.wall-start.wall,entryCredit:entry.clock-start.clock,pausedCredit:exit.clock-entry.clock,resumeEligible:after.wall-exit.wall,resumeCredit:after.clock-exit.clock};
    results.push(r);console.log("sparse pause boundary",JSON.stringify(r));
  }
  if(results.some(r=>Math.abs(r.entryCredit-r.entryEligible)>30 || Math.abs(r.pausedCredit)>1e-6 || Math.abs(r.resumeCredit-r.resumeEligible)>30))throw new Error("pause boundary loses eligible time or spends paused time");
}

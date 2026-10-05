// Human touch release must sample eligible time after the last game frame.
import { idle } from "../lib/phone.mjs";
export default async function (T) {
  const { page } = T;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForFunction(() => window.pft);
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
  const me = await page.evaluate(() => window.pft.s.soldiers.find(x=>x.alive && x.owner===window.pft.s.current && x.convoy===undefined));
  const pos = await T.world(me.x,me.y);
  await T.tap(pos.x,pos.y,40);
  await T.wait(() => window.pft.cam.settled);
  await T.drag(195,600,195,710,{steps:4,hold:60,ms:200,release:false});
  await page.evaluate(() => {
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=cb=>{
      if(cb.name==="frame"){window.__releaseFrame=cb;return 0;}
      return raf(cb);
    };
    document.querySelector("#over").addEventListener("pointerup",()=>{window.__releaseWall=performance.now();},{capture:true,once:true});
  });
  await page.waitForFunction(() => window.__releaseFrame,undefined,{polling:50});
  const manual = process.env.MANUAL === "1";
  const start=await page.evaluate(manual=>{
    window.__releaseFrame(performance.now());
    window.pft.clockHeld=false;
    document.dispatchEvent(new Event("visibilitychange"));
    if (manual) { window.pft.hand(true); window.pft.step(350); window.__releaseFrame(performance.now()); }
    return {wall:performance.now(),clock:window.pft.turnClock};
  }, manual);
  await page.waitForTimeout(900);
  await T.touch("touchEnd",[]);
  const result=await page.evaluate(start=>{
    const f=window.pft.s.actions.filter(x=>x.t==="flick").at(-1);
    if(!f)throw new Error("real touch did not release a flick");
    return {eligible:window.__releaseWall-start.wall,credited:f.ms-start.clock};
  },start);
  console.log("sparse human touch release",JSON.stringify({...result,manual}));
  if(Math.abs((manual ? 0 : result.eligible)-result.credited)>(manual ? 1e-6 : 30))throw new Error("human release lost eligible time between frames");
}

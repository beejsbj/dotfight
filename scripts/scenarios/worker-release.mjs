// Bounded real-worker check: a road fixture and one applied bot flick.
export default async function (T, out) {
  const { page } = T;
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.evaluate(async () => {
    const Real = window.Worker;
    window.__release = { started: 0, failed: 0, asks: [], answers: [] };
    window.Worker = class extends Real {
      constructor(...args) { super(...args); window.__release.started++;
        this.addEventListener("message", e => window.__release.answers.push(e.data));
        this.addEventListener("error", () => window.__release.failed++);
      }
      postMessage(ask) { window.__release.asks.push({ id: ask.id, clock: ask.s.clock }); super.postMessage(ask); }
    };
    const { newGame, act } = await import("/src/game.ts");
    const { LONG } = await import("/src/rules.ts");
    const { file } = await import("/src/record.ts");
    const s = newGame({ name: "custom", bases: 2, soldiers: 12 }, 42, undefined, LONG);
    for (const [x,y] of [[200,1500],[200,200],[900,1100],[900,400]]) act(s,{t:"base",x,y,shape:"camp"});
    act(s,{t:"ready"}); act(s,{t:"ready"});
    act(s,{t:"send",from:0,to:2,n:3}); act(s,{t:"stop"});
    window.pft.resumeRecord(file(s,{kind:"bot",level:0}));
    window.pft.speed=5; window.pft.slow=true; window.pft.boilOn=false;
  });
  await page.waitForFunction(() => {
    const r = window.__release, a = r.answers.find(x => x.a.t === "flick");
    return a && !window.pft.res && window.pft.busy && window.pft.turnClock > r.asks.find(x => x.id === a.id).clock;
  }, undefined, { timeout: 120000 });
  console.log("local bot aim clock advances while busy");
  await page.waitForFunction(() => window.__release.answers.some(({a}) => a.t === "flick" && window.pft.s.actions.some(x => x.t === "flick" && x.soldier === a.soldier && x.ms === a.ms && x.angle === a.angle)), undefined, {timeout:120000});
  const result = await page.evaluate(async () => {
    const { BOT_THINK_MS } = await import("/src/bot.ts");
    const r = window.__release;
    const answer = r.answers.find(({a}) => a.t === "flick");
    const ask = r.asks.find(x => x.id === answer.id);
    return { started:r.started, failed:r.failed, answered:r.answers.length, ask, answer, delay:BOT_THINK_MS, actions:window.pft.s.actions.filter(x=>x.t === "flick") };
  });
  console.log("worker release", JSON.stringify(result), "page errors", JSON.stringify(errors));
  if (!result.started || result.failed || errors.length || result.answer.a.ms !== result.ask.clock + result.delay) throw new Error("worker release timestamp did not survive scoring and UI playback");
  await T.shot(`${out}/worker-release.png`);
}

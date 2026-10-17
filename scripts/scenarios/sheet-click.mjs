// A sheet must not answer with the last sheet's click handler. Settings set
// one on the shared card and the hand-over card sets none of its own, so after
// Settings had been open, tapping "Your pen" re-opened Settings over the game.
// Turn "pause between turns" on in Settings (as a player would), start a pass &
// play war, tap the hand-over card when both have pressed done, flick once, and
// tap the next one: neither may bring Settings back.
import { idle, placeAt } from "../lib/phone.mjs";

const tapEl = async (T, sel) => {
  const b = await T.page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`not on screen: ${sel}`);
  await T.tap(b.x + b.width / 2, b.y + b.height / 2);
};
const sheetNow = (page) => page.evaluate(() => {
  const el = document.querySelector("#sheet");
  return { hidden: el.hidden, card: el.querySelector(".card").className.trim() };
});

export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1200);
  await tapEl(T, '#cover .tabs [data-a="settings"]');
  await page.waitForTimeout(300);
  await tapEl(T, '#sheet [data-set="handoff"]');
  await page.waitForTimeout(300);
  await tapEl(T, '#sheet [data-a="back"]');
  await page.waitForTimeout(300);
  const handoff = await page.evaluate(() => localStorage.getItem("pft:handoff"));
  if (handoff !== "1") throw new Error(`"pause between turns" didn't turn on: ${handoff}`);
  console.log("settings: pause between turns on, closed", JSON.stringify(await sheetNow(page)));

  // every change the sheet goes through from here on
  await page.evaluate(() => {
    const el = document.querySelector("#sheet"), t0 = performance.now();
    window.__sheetLog = [];
    new MutationObserver(() => window.__sheetLog.push(`${Math.round(performance.now() - t0)}ms ${el.hidden ? "hidden" : el.querySelector(".card").className.trim()}`))
      .observe(el, { attributes: true, subtree: true, childList: true });
  });
  const handoffUp = () => page.evaluate(() => { const el = document.querySelector("#sheet"); return !el.hidden && el.querySelector(".card").classList.contains("handoff"); });
  await tapEl(T, '#cover [data-a="pnp"]');
  await page.waitForTimeout(700);
  // camps by touch, the page turning between the two sides, then both press done
  const blue = [[250, 1350], [520, 1150], [780, 1400], [300, 1580], [700, 1170]];
  const red = [[250, 350], [520, 550], [780, 300], [300, 130], [700, 530]];
  for (let i = 0; i < 20; i++) {
    await idle(T, 60000);
    const st = await T.state();
    if (st.phase === "play") break;
    if (await page.$("[data-act=ready]")) { await page.click("[data-act=ready]"); continue; }
    const [x, y] = (st.current === 0 ? blue : red)[Math.floor(i / 2) % 5];
    await placeAt(T, x, y);
  }
  // both pressed done: the page turns to Black, who gets a hand-over card too
  await page.waitForTimeout(1500);
  if (await handoffUp()) {
    await tapEl(T, "#sheet .handoff-tap");
    await page.waitForTimeout(1500);
    await T.shot(`${out}/sheet-click-first.png`);
    const seen = [...new Set(await page.evaluate(() => window.__sheetLog))];
    console.log("first hand-over tapped; sheet went:", seen.join(", "));
    if (seen.some((x) => x.includes("settings"))) throw new Error("tapping the first hand-over card re-opened Settings");
  }
  await idle(T, 60000);
  if ((await T.state()).phase !== "play") throw new Error(`no war: ${JSON.stringify(await T.state())}`);
  await page.evaluate(() => {
    const s = window.pft.s;
    const me = s.soldiers.find((x) => x.alive && x.owner === s.current);
    const foe = s.soldiers.find((x) => x.alive && x.owner !== s.current);
    window.pft.act({ soldierId: me.id, kind: "shoot", angle: Math.atan2(foe.y - me.y, foe.x - me.x) + 0.4, length: 300, bend: 0 });
  });
  await T.wait(() => { const el = document.querySelector("#sheet"); return !el.hidden && el.querySelector(".card").classList.contains("handoff"); }, undefined, 30000);
  await T.shot(`${out}/sheet-click-handoff.png`);
  console.log("hand-over card up", JSON.stringify(await sheetNow(page)), JSON.stringify(await T.state()));
  await page.evaluate(() => { window.__sheetLog = []; });
  await tapEl(T, "#sheet .handoff-tap");
  await page.waitForTimeout(1500);
  const after = await sheetNow(page);
  const seen = [...new Set(await page.evaluate(() => window.__sheetLog))];
  await T.shot(`${out}/sheet-click-after.png`);
  console.log("after tapping it", JSON.stringify(after), JSON.stringify(await T.state()), "sheet went:", seen.join(", "));
  if (seen.some((x) => x.includes("settings"))) throw new Error("tapping the hand-over card re-opened Settings");
  if (!after.hidden) throw new Error(`a sheet is still up after the hand-over: ${after.card}`);
  console.log("ok: the hand-over card closes, and Settings stays shut");
}

// The camps of a reported page (2 Oct 2026: a camp's ring missing on an S23+),
// placed by touch on a Classic pass-and-play page; after each, every camp must
// be on the page (page.has) or on the boil's rings canvas (a thing there, and
// ink on its ring). Prints each camp's state; MISSING when neither. Desktop
// Chrome never showed that bug: run it on the phone (scripts/remote-eval.mjs).
//   W=411 H=798 DPR=2.625 node scripts/playtest.mjs camps-layout <url> /tmp/out
import { idle, placeAt } from "../lib/phone.mjs";

const blue = [[273, 150], [662, 98], [766, 993], [262, 1152], [679, 1284]];
const red = [[402, 616], [155, 777], [781, 535], [223, 1580], [889, 1574]];

const check = (T) => T.page.evaluate(() => {
  const p = window.pft, s = p.s, rp = p.boil.parts[0];
  const S = rp.S, c = rp.c, g = c.getContext("2d");
  return s.bases.map((b) => {
    let n = 0;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = Math.round((b.x + Math.cos(a) * b.r - rp.ox) * S), y = Math.round((b.y + Math.sin(a) * b.r - rp.oy) * S);
      if (x < 2 || y < 2 || x >= c.width - 2 || y >= c.height - 2) continue;
      const d = g.getImageData(x - 2, y - 2, 5, 5).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) { n++; break; }
    }
    const thing = rp.things.some((t) => t.key.startsWith(`b${b.id}@`));
    return { id: b.id, owner: b.owner, page: p.page.has(`b${b.id}`), thing, ink: n, vis: c.style.visibility, cw: c.width, ch: c.height };
  });
});

export default async function (T, out) {
  const { page } = T;
  await page.waitForTimeout(1200);
  await page.click("[data-size=classic]");
  await page.evaluate(() => document.querySelector("[data-a=pnp]").click());
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.pft.slow = false; });
  let bad = 0;
  for (let i = 0; i < 5; i++) {
    for (const [x, y] of [blue[i], red[i]]) {
      await idle(T);
      const before = await page.evaluate(() => window.pft.s.bases.length);
      await placeAt(T, x, y);
      await idle(T);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => window.pft.s.bases.length);
      if (after === before) { bad++; console.log("not placed at", x, y, await page.evaluate(() => document.querySelector("#status").textContent)); }
      const r = await check(T);
      const miss = r.filter((c) => !c.page && (!c.thing || c.ink < 8));
      if (miss.length) { bad++; console.log("MISSING after", x, y, JSON.stringify(miss)); await T.shot(`${out}/missing-${i}-${x}.png`); }
    }
  }
  await idle(T, 60000);
  await page.waitForTimeout(800);
  const count = await page.evaluate(() => window.pft.s.bases.length);
  if (count !== 10) { bad++; console.log(`expected ten camps, found ${count}`); }
  console.log("boil on", await page.evaluate(() => [window.pft.boilOn, window.pft.boil.tooDear]));
  console.log(JSON.stringify(await check(T)));
  await T.shot(`${out}/layout.png`);
  console.log(bad ? `FAIL ${bad}` : "ok");
  if (bad) process.exitCode = 1;
}

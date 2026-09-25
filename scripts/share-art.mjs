// Renders the share card (og.jpg) and app icons from the game itself.
// Needs the dev server running and a Chrome/Chromium binary:
//   npm run dev -- --port 5173 &
//   CHROME=/usr/bin/google-chrome node scripts/share-art.mjs http://localhost:5173/
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/";
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });

// --- share card: a real frame from a war in progress, the camera sitting
// behind a soldier with the pen stood on his dot, and the book's label.
{
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("pft:muted", "1"); localStorage.setItem("pft:taught:place", "1"); localStorage.setItem("pft:taught:aim", "1"); });
  await p.reload();
  await p.waitForFunction(() => window.pft);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const r = window.pft.fileWar(23, 34);
    window.pft.resumeRecord(r);
    document.querySelector("#top").style.visibility = "hidden";
    document.querySelector("#bottom").style.visibility = "hidden";
  });
  await p.waitForFunction(() => !window.pft.busy && window.pft.cam.settled, undefined, { timeout: 20000 });
  // pick up a soldier near the enemy and hold a pull toward him
  const { me, foe } = await p.evaluate(() => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    let best = null, bd = Infinity;
    for (const a of mine) for (const f of foes) { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d < bd && d > 300) { bd = d; best = { me: a, foe: f }; } }
    return best;
  });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const at = await p.evaluate(([x, y]) => window.pft.cam.toScreen(x, y), [me.x, me.y]);
  await touch("touchStart", [[at.x, at.y]]); await p.waitForTimeout(50); await touch("touchEnd", []);
  await p.waitForFunction(() => window.pft.cam.settled, undefined, { timeout: 10000 });
  await p.waitForTimeout(200);
  const a = await p.evaluate(([x, y]) => window.pft.cam.toScreen(x, y), [me.x, me.y]);
  const t = await p.evaluate(([x, y]) => window.pft.cam.toScreen(x, y), [foe.x, foe.y]);
  const ang = Math.atan2(t.y - a.y, t.x - a.x);
  const sx = 600, sy = 470;
  await touch("touchStart", [[sx, sy]]);
  for (let i = 1; i <= 8; i++) { await touch("touchMove", [[sx - Math.cos(ang) * 12 * i, sy - Math.sin(ang) * 12 * i]]); await p.waitForTimeout(20); }
  await p.waitForTimeout(250);
  // the exercise book's label, laid on the desk to the right
  await p.evaluate(() => {
    const label = document.querySelector("#cover .label").cloneNode(true);
    Object.assign(label.style, { position: "fixed", right: "56px", top: "150px", width: "440px", transform: "rotate(3deg)", zIndex: 9, boxShadow: "0 18px 40px rgba(0,0,0,.6), inset 0 0 0 3px #fbf8f0, inset 0 0 0 4.5px #3a5fa8, inset 0 0 0 7px #fbf8f0, inset 0 0 0 8px #3a5fa8" });
    label.querySelector("h1").style.fontSize = "62px";
    document.body.appendChild(label);
  });
  await p.waitForTimeout(150);
  writeFileSync("public/og.jpg", await p.screenshot({ type: "jpeg", quality: 86 }));
  await touch("touchEnd", []);
  await ctx.close();
}

// --- icons: a camp under the lamp, a red flick crossing one man out
{
  const ctx = await b.newContext({ viewport: { width: 600, height: 600 } });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => window.pft);
  await p.evaluate(() => document.fonts.ready);
  const out = await p.evaluate(() => {
    const { ink, INK } = window.pft;
    const icon = (size) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const x = c.getContext("2d");
      x.scale(size / 512, size / 512);
      x.fillStyle = INK.paper; x.fillRect(0, 0, 512, 512);
      x.strokeStyle = INK.grid; x.lineWidth = 2.5;
      x.beginPath();
      for (let v = 22; v < 512; v += 44) { x.moveTo(v, 0); x.lineTo(v, 512); x.moveTo(0, v); x.lineTo(512, v); }
      x.stroke();
      x.globalCompositeOperation = "multiply";
      ink.inkCircle(x, 236, 290, 150, INK.pens[0], 11, 9, 2);
      [[180, 224], [262, 209], [320, 266], [206, 304], [282, 334], [170, 372], [248, 396]].forEach(([dx, dy], i) => ink.inkDot(x, dx, dy, 15, INK.pens[0], 40 + i));
      // one smooth ballpoint stroke, heavy where the pen sat and thinning out
      x.fillStyle = INK.pens[1];
      x.globalAlpha = 0.6; x.beginPath(); x.arc(470, 44, 13, 0, Math.PI * 2); x.fill();
      const P = (t) => ({ x: 470 - t * 326 + Math.sin(t * 3) * 10, y: 44 + t * 298 });
      const N = 40, L = [], R = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = P(t), b2 = P(Math.min(1, t + 0.01)), c2 = P(Math.max(0, t - 0.01));
        const dx = b2.x - c2.x, dy = b2.y - c2.y, l = Math.hypot(dx, dy) || 1, w = 6.5 * (1 - Math.pow(t, 1.6) * 0.75);
        L.push([a.x - (dy / l) * w, a.y + (dx / l) * w]); R.unshift([a.x + (dy / l) * w, a.y - (dx / l) * w]);
      }
      x.globalAlpha = 0.88; x.beginPath();
      [...L, ...R].forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath(); x.fill(); x.globalAlpha = 1;
      ink.inkCross(x, 206, 304, 36, INK.pens[1], 9, 10);
      // the lamp: warm at the top left, falling off to the corners
      const g = x.createRadialGradient(170, 150, 30, 220, 220, 470);
      g.addColorStop(0, "rgb(255, 246, 228)"); g.addColorStop(0.55, "rgb(238, 212, 172)"); g.addColorStop(1, "rgb(96, 70, 50)");
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
      return c.toDataURL("image/png");
    };
    return { i512: icon(512), i192: icon(192), i180: icon(180) };
  });
  const save = (f, d) => writeFileSync(f, Buffer.from(d.split(",")[1], "base64"));
  save("public/icon-512.png", out.i512);
  save("public/icon-192.png", out.i192);
  save("public/apple-touch-icon.png", out.i180);
  await ctx.close();
}
console.log("wrote public/og.jpg, icon-512.png, icon-192.png, apple-touch-icon.png");
await b.close();

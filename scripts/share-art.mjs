// Renders the share card (og.jpg) and app icons from the game's own ink.
// Needs the dev server running and a Chrome/Chromium binary:
//   npm run dev -- --port 5173 &
//   CHROME=/usr/bin/google-chrome node scripts/share-art.mjs http://localhost:5173/
import { writeFileSync } from "node:fs";
import { chromium, devices } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/";
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await (await b.newContext({ ...devices["Pixel 7"] })).newPage();
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem("pft:taught:place", "1"); localStorage.setItem("pft:taught:aim", "1"); localStorage.setItem("pft:muted", "1"); localStorage.setItem("pft:rules", "prototype"); });
await p.reload();
await p.waitForTimeout(600);
await p.getByText("pass & play").click();
await p.waitForTimeout(300);
const toScreen = (x, y) => p.evaluate(([x, y]) => window.pft.cam.toScreen({ x, y }), [x, y]);
const dismiss = async () => { if (await p.evaluate(() => !document.querySelector("#sheet").hidden)) { await p.mouse.click(200, 300); await p.waitForTimeout(250); } };

for (const [x, y] of [[260, 1380], [330, 330], [700, 1480], [720, 260], [540, 1150], [560, 560]]) {
  const s = await toScreen(x, y);
  await p.mouse.click(s.x, s.y);
  await p.waitForTimeout(1400);
}
// a dozen turns of aimed-but-human flicks: enough ink to look fought over
for (let t = 0; t < 12; t++) {
  const { me, foe, over } = await p.evaluate((t) => {
    const s = window.pft.s;
    const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
    const foes = s.soldiers.filter((x) => x.alive && x.owner !== s.current);
    return { me: mine[(t * 7) % mine.length], foe: foes[(t * 5) % foes.length], over: s.phase !== "play" };
  }, t);
  if (over) break;
  const kind = t % 4 === 2 ? "move" : "shoot";
  await p.getByRole("button", { name: kind }).click();
  await p.evaluate(() => window.pft.cam.fit());
  const a = await toScreen(me.x, me.y);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.waitForTimeout(450);
  const ang = Math.atan2(foe.y - me.y, foe.x - me.x);
  const pullPx = kind === "move" ? 80 : 110;
  await p.mouse.move(a.x - Math.cos(ang) * pullPx, a.y - Math.sin(ang) * pullPx, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(1800);
  await dismiss();
}

const out = await p.evaluate(async () => {
  await document.fonts.load("700 100px Caveat");
  await document.fonts.load("400 40px Caveat");
  const { ink, INK, pageCanvas } = window.pft;
  const DESK = "#2b2825", PAPER = "#f5f0e3";

  // --- share card, 1200x630: the page on a desk, a paper slip with the title
  const og = document.createElement("canvas");
  og.width = 1200; og.height = 630;
  const g = og.getContext("2d");
  g.fillStyle = DESK; g.fillRect(0, 0, 1200, 630);
  const vig = g.createRadialGradient(600, 315, 200, 600, 315, 760);
  vig.addColorStop(0, "rgba(255,240,220,0.05)"); vig.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = vig; g.fillRect(0, 0, 1200, 630);
  const page = pageCanvas(1);
  g.save();
  g.translate(360, 330); g.rotate(-0.07);
  const sc = 0.66, pw = page.width * sc, ph = page.height * sc;
  g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 30; g.shadowOffsetY = 12;
  g.drawImage(page, -pw / 2, -ph / 2 - 120, pw, ph);
  g.restore();
  // title slip
  g.save();
  g.translate(890, 300); g.rotate(0.035);
  g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 22; g.shadowOffsetY = 8;
  g.fillStyle = PAPER; g.fillRect(-250, -150, 500, 300);
  g.shadowColor = "transparent";
  g.strokeStyle = "rgba(92,140,196,0.38)"; g.lineWidth = 1.4;
  for (let y = -110; y < 150; y += 44) { g.beginPath(); g.moveTo(-250, y); g.lineTo(250, y); g.stroke(); }
  g.strokeStyle = "rgba(206,70,70,0.55)"; g.beginPath(); g.moveTo(-222, -150); g.lineTo(-222, 150); g.moveTo(-217, -150); g.lineTo(-217, 150); g.stroke();
  g.globalCompositeOperation = "multiply";
  ink.handText(g, "Pen Flick", -190, -30, 108, INK.pens[0], { rot: -0.04 });
  ink.handText(g, "Tactics", -60, 70, 108, INK.pens[1], { rot: -0.04 });
  ink.handText(g, "a notebook war, after Dawood", -190, 128, 38, "#4a4744", { weight: 400, rot: -0.02 });
  g.restore();

  // --- icon: a base, its dots, and a red flick crossing one out
  const icon = (size) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d");
    const k = size / 512;
    x.scale(k, k);
    x.fillStyle = PAPER; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = "rgba(92,140,196,0.38)"; x.lineWidth = 3;
    for (let y = 70; y < 512; y += 74) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke(); }
    x.globalCompositeOperation = "multiply";
    ink.inkCircle(x, 236, 286, 150, INK.pens[0], 11, 9, 2);
    const dots = [[180, 220], [262, 205], [320, 262], [206, 300], [282, 330], [170, 368], [248, 392]];
    dots.forEach(([dx, dy], i) => ink.inkDot(x, dx, dy, 14, INK.pens[0], 40 + i));
    // one smooth ballpoint stroke, heavy where the pen sat and thinning out
    x.fillStyle = INK.pens[1];
    x.globalAlpha = 0.6; x.beginPath(); x.arc(462, 48, 13, 0, Math.PI * 2); x.fill();
    const P = (t) => ({ x: 462 - t * 318 + Math.sin(t * 3) * 10, y: 48 + t * 296 });
    const N = 40, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = P(t), b = P(Math.min(1, t + 0.01)), c = P(Math.max(0, t - 0.01));
      const dx = b.x - c.x, dy = b.y - c.y, l = Math.hypot(dx, dy) || 1, w = 6.5 * (1 - Math.pow(t, 1.6) * 0.75);
      L.push([a.x - (dy / l) * w, a.y + (dx / l) * w]); R.unshift([a.x + (dy / l) * w, a.y - (dx / l) * w]);
    }
    x.globalAlpha = 0.88; x.beginPath();
    [...L, ...R].forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath(); x.fill(); x.globalAlpha = 1;
    ink.inkCross(x, 206, 300, 34, INK.pens[1], 9, 9);
    return c.toDataURL("image/png");
  };
  return { og: og.toDataURL("image/jpeg", 0.86), i512: icon(512), i192: icon(192), i180: icon(180) };
});
const save = (f, d) => writeFileSync(f, Buffer.from(d.split(",")[1], "base64"));
save("public/og.jpg", out.og);
save("public/icon-512.png", out.i512);
save("public/icon-192.png", out.i192);
save("public/apple-touch-icon.png", out.i180);
console.log("wrote public/og.jpg, icon-512.png, icon-192.png, apple-touch-icon.png");
await b.close();

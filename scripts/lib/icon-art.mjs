// The icon: a camp under the lamp, a red flick crossing one man out. Drawn in
// the page with the game's own ink (window.pft: a dev build), so pass this to
// page.evaluate. It returns a PNG data URL.
//   layer "all":   the icon (the web's icons, the iPhone's, Android's legacy one)
//   layer "paper": the sheet and the lamp only (Android's adaptive background)
//   layer "ink":   the marks only, lamplit, on nothing (its adaptive foreground)
export function iconArt({ size, layer = "all" }) {
  const { ink, INK } = window.pft;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  x.scale(size / 512, size / 512);
  if (layer !== "ink") {
    x.fillStyle = INK.paper; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = INK.grid; x.lineWidth = 2.5;
    x.beginPath();
    for (let v = 22; v < 512; v += 44) { x.moveTo(v, 0); x.lineTo(v, 512); x.moveTo(0, v); x.lineTo(512, v); }
    x.stroke();
  }
  x.globalCompositeOperation = "multiply";
  if (layer !== "paper") {
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
  }
  // only the marks: remember their shape, so the lamp can tint them without filling the rest
  let shape = null;
  if (layer === "ink") {
    shape = document.createElement("canvas");
    shape.width = shape.height = size;
    shape.getContext("2d").drawImage(c, 0, 0);
  }
  // the lamp: warm at the top left, falling off to the corners
  const g = x.createRadialGradient(170, 150, 30, 220, 220, 470);
  g.addColorStop(0, "rgb(255, 246, 228)"); g.addColorStop(0.55, "rgb(238, 212, 172)"); g.addColorStop(1, "rgb(96, 70, 50)");
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  if (shape) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(shape, 0, 0);
  }
  return c.toDataURL("image/png");
}

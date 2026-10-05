// Pixel regression: the lead smudge adds density without coloring bare paper.
// Real Canvas 2D, including the scale/rotation used by notes. Crumbs are disabled.
export default async function (T) {
  const results = await T.page.evaluate(() => {
    const rubOut = window.pft.ink.rubOut;
    const rows = [];
    for (const rotated of [false, true]) {
      const make = () => {
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.translate(128, 128); if (rotated) { g.rotate(0.45); g.scale(1.2, 0.8); }
        g.fillStyle = "#24314c"; g.globalAlpha = 0.7;
        for (let y = -24; y <= 24; y += 12) g.fillRect(-36, y, 72, 3);
        g.globalAlpha = 1;
        return { c, g };
      };
      for (const e of [0.3, 0.58, 0.8, 1]) {
        const { g } = make(), baseline = make().g;
        const before = g.getImageData(0, 0, 256, 256).data;
        // Suppress only the deposited smear; destination-out scrubs still run.
        const eraseOnly = new Proxy(baseline, {
          get(target, key) {
            if (key === "drawImage") return () => {};
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, key, value) { Reflect.set(target, key, value); return true; },
        });
        rubOut(eraseOnly, -40, -30, 40, 30, 19, e, 20, "#24314c", 0);
        const transform = g.getTransform().toString();
        rubOut(g, -40, -30, 40, 30, 19, e, 20, "#24314c", 0);
        if (g.getTransform().toString() !== transform) throw new Error("Eraser changed caller transform");
        const actual = g.getImageData(0, 0, 256, 256).data;
        const erased = baseline.getImageData(0, 0, 256, 256).data;
        let bare = 0, denser = 0, remaining = 0;
        for (let i = 3; i < actual.length; i += 4) {
          if (!before[i] && actual[i]) bare++;
          if (actual[i] > erased[i]) denser++;
          remaining += actual[i];
        }
        if (bare) throw new Error(`Smudge colored ${bare} bare pixels`);
        if (e < 0.8 && !denser) throw new Error(`No visible lead smudge at e=${e}`);
        if (e === 1 && remaining) throw new Error("Completed erasure left lead");
        rows.push({ rotated, e, bare, denser, remaining });
      }
    }
    return rows;
  });
  console.log("eraser-mask:", JSON.stringify(results));
}

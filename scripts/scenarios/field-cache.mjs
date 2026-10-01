// A deliberately wide last-stand field: translate every survivor while moving
// the camera. Each ray must retain its raster and its small buffer; the static
// road crop must not repaint. THROTTLE=6, both themes. No engine mutation.
import assert from 'node:assert/strict';
import { idle } from '../lib/phone.mjs';
export default async function (T) {
  const { page, cdp } = T;
  await page.evaluate(() => {
    const p = window.pft;
    const r = p.fileWar(11, 12); r.mode = { kind: 'pnp' }; p.resumeRecord(r);
    p.slow = false; p.boilOn = false; p.LIFE.bubbles = false;
  });
  await idle(T, 60000);
  const rate = +(process.env.THROTTLE ?? 6);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  try {
    for (const theme of ['lamplight', 'blueprint']) {
      await page.evaluate((id) => window.pft.theme.apply(id), theme);
      const result = await page.evaluate(async () => {
        const p = window.pft, scene = await import('/src/scene.ts');
        const { lamp, view } = p.frame();
        const f = { s: p.s, view, lamp, ink: { live: new Set(), p: () => 1 }, lean: 0,
          dpr: 1, sw: innerWidth, cw: innerWidth, ch: innerHeight,
          boil: { on: false, ms: 0, bold: 0 },
          road: [{ at: { x: 130, y: 300 }, dir: 0 }],
          stand: [{ id: 1000, x: 90, y: 220 }, { id: 1001, x: 710, y: 1000 }] };
        scene.renderStage(p.els, f);
        const initial = scene.stageStats.field;
        const digest = (c) => {
          let h = 2166136261;
          for (const n of c.getContext('2d').getImageData(0, 0, c.width, c.height).data) h = Math.imul(h ^ n, 16777619);
          return h >>> 0;
        };
        const before = [...scene.standRays].map(([id, l]) => ({ id, digest: digest(l.c), w: l.c.width, h: l.c.height, css: l.c.style.transform, ink: [...l.c.getContext('2d').getImageData(0, 0, l.c.width, l.c.height).data].some((v, i) => i % 4 === 3 && v > 0) }));
        const costs = [];
        for (let i = 1; i <= 20; i++) {
          f.stand = [{ id: 1000, x: 90 + i * 5.1, y: 220 + i * 3.9 }, { id: 1001, x: 710 - i * 5.1, y: 1000 - i * 3.9 }];
          const t0 = performance.now(); scene.renderStage(p.els, f); costs.push(performance.now() - t0);
        }
        const after = [...scene.standRays].map(([id, l]) => ({ id, digest: digest(l.c), w: l.c.width, h: l.c.height, css: l.c.style.transform, ox: l.ox, oy: l.oy }));
        // A separate camera sweep cannot mask a failure to follow the marcher.
        const marchedCss = after.map((q) => q.css);
        f.view = { ...view, x: view.x + 20, rot: view.rot + 0.2 };
        scene.renderStage(p.els, f);
        const cameraCss = [...scene.standRays.values()].map((l) => l.c.style.transform);
        const repaints = scene.stageStats.field - initial;
        p.renderNow();
        costs.sort((a, b) => a - b);
        return { before, after, marchedCss, cameraCss, repaints, scale: scene.pageState.S, p50: costs[10], p95: costs[19], n: costs.length };
      });
      assert.equal(result.before.length, 2, 'both survivor sprites must exist');
      assert.equal(result.after.length, 2, 'both survivor sprites must remain');
      assert.equal(result.repaints, 0, 'moving rays and camera must not rasterize field marks');
      for (let i = 0; i < result.before.length; i++) {
        const a = result.before[i], b = result.after[i];
        assert.ok(a.ink, 'the ray texture must contain ink');
        assert.equal(a.digest, b.digest, 'ray texture must stay stable during translation');
        assert.equal(a.w, b.w); assert.equal(a.h, b.h);
        assert.ok(a.w <= Math.ceil(84 * result.scale) && a.h <= Math.ceil(84 * result.scale), 'each survivor uses only its local buffer');
        assert.notEqual(a.css, b.css, 'the ray sprite must follow the soldier with the camera fixed');
        assert.notEqual(result.marchedCss[i], result.cameraCss[i], 'camera placement must move the cached sprite');
        assert.equal(b.ox, i === 0 ? 150 : 566);
        assert.equal(b.oy, i === 0 ? 256 : 880);
      }
      console.log(theme, JSON.stringify(result));
    }
  } finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); }
}

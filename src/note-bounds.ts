import type { Pt } from "./geom";

/** Largest homothetic axis-aligned box about a convex polygon's vertex centroid.
 * Vertices must follow the boundary, in either winding. Pure, for initial note placement.
 */
export function inscribedBounds(pts: readonly Pt[]) {
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  const hw = (Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x))) / 2;
  const hh = (Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y))) / 2;
  let scale = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    // Edge length cancels between interior distance and box support distance.
    const support = Math.abs(dy) * hw + Math.abs(dx) * hh;
    if (support > 0) scale = Math.min(scale, Math.abs(dx * (cy - a.y) - dy * (cx - a.x)) / support);
  }
  if (!Number.isFinite(scale)) scale = 0;
  return { x0: cx - hw * scale, x1: cx + hw * scale, y0: cy - hh * scale, y1: cy + hh * scale };
}

export type Point = { x: number; y: number };
export type Rect = Point & { w: number; h: number };
export const midpoint = (r: Rect): Point => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2,
});
export function edge(r: Rect, toward: Point): Point {
  const c = midpoint(r),
    dx = toward.x - c.x,
    dy = toward.y - c.y;
  const t = Math.min(
    dx ? r.w / 2 / Math.abs(dx) : Infinity,
    dy ? r.h / 2 / Math.abs(dy) : Infinity,
  );
  return Number.isFinite(t) ? { x: c.x + dx * t, y: c.y + dy * t } : c;
}
export function intersects(a: Point, b: Point, r: Rect, pad = 0): boolean {
  let lo = 0,
    hi = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, r.x - pad, r.x + r.w + pad],
    [a.y, b.y - a.y, r.y - pad, r.y + r.h + pad],
  ]) {
    if (!delta) {
      if (origin < min || origin > max) return false;
    } else {
      const t1 = (min - origin) / delta,
        t2 = (max - origin) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}
export function routeArrow(
  source: Rect,
  target: Rect,
  obstacles: Rect[],
  unit: number,
) {
  const a = midpoint(source),
    b = midpoint(target);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const candidate = (offset: number) => {
    const control = {
      x: middle.x + normal.x * offset,
      y: middle.y + normal.y * offset,
    };
    const start = edge(source, offset ? control : b),
      end = edge(target, offset ? control : a);
    const point = (t: number) => ({
      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t * t * end.x,
      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t * t * end.y,
    });
    const points = Array.from({ length: 65 }, (_, i) => point(i / 64));
    const hits = obstacles.filter((r) =>
      points.slice(1).some((p, i) => intersects(points[i], p, r, unit * 1.5)),
    ).length;
    return { start, end, control, points, hits, point, offset };
  };
  let best = candidate(0);
  if (best.hits || length === 1) {
    for (let step = 1; step <= 40; step++) {
      const options = [
        candidate(step * unit * 8),
        candidate(-step * unit * 8),
      ].sort((a, b) => a.hits - b.hits);
      if (options[0].hits < best.hits || length === 1) best = options[0];
      if (!best.hits && best.offset) break;
    }
  }
  return {
    ...best,
    normal,
    d: `M ${best.start.x} ${best.start.y} Q ${best.control.x} ${best.control.y} ${best.end.x} ${best.end.y}`,
  };
}
export function fitScene(rects: Rect[], width: number, height: number) {
  if (!rects.length || !width || !height) return { scale: 1, x: 0, y: 0 };
  const left = Math.min(...rects.map((r) => r.x)),
    right = Math.max(...rects.map((r) => r.x + r.w));
  const top = Math.min(...rects.map((r) => r.y)),
    bottom = Math.max(...rects.map((r) => r.y + r.h));
  const scale = Math.min(
    1.25,
    (width * 0.92) / Math.max(1, right - left),
    (height * 0.68) / Math.max(1, bottom - top),
  );
  return {
    scale,
    x: width / 2 - ((left + right) / 2) * scale,
    y: height * 0.4 - ((top + bottom) / 2) * scale,
  };
}
export function labelRect(
  point: Point,
  normal: Point,
  w: number,
  h: number,
  obstacles: Rect[],
): Rect {
  for (let step = 1; step <= 100; step++) {
    for (const side of [1, -1]) {
      const r = {
        x: point.x + normal.x * step * h * side - w / 2,
        y: point.y + normal.y * step * h * side - h / 2,
        w,
        h,
      };
      if (
        !obstacles.some(
          (o) =>
            r.x < o.x + o.w &&
            r.x + w > o.x &&
            r.y < o.y + o.h &&
            r.y + h > o.y,
        )
      )
        return r;
    }
  }
  return {
    x: point.x - w / 2,
    y: Math.min(0, ...obstacles.map((o) => o.y)) - h * 2,
    w,
    h,
  };
}

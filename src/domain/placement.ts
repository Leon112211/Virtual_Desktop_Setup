import type { Desk, SceneItem } from './project';
export function footprint(item: SceneItem) {
  const r = (item.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return [-1, 1].flatMap((a) =>
    [-1, 1].map((b) => {
      const x = (a * item.size.width) / 2,
        z = (b * item.size.depth) / 2;
      return { x: item.x + x * c + z * s, z: item.z - x * s + z * c };
    }),
  );
}
export function isOutOfBounds(item: SceneItem, desk: Desk) {
  return footprint(item).some(
    (p) => Math.abs(p.x) > desk.width / 2 + 0.0001 || Math.abs(p.z) > desk.depth / 2 + 0.0001,
  );
}
export function itemWorldY(desk: Desk) {
  return desk.height;
}

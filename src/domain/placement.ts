// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import type { Desk, SceneItem } from './project';
import {
  deskBackWallBounds,
  deskShelfRect,
  deskSupportPolygons,
  deskSupportRects,
  PEGBOARD_WALL_DEFAULT_Y,
  type DeskPoint,
  type DeskRect,
} from './desk';
import { findArmForTrayLaptop, isMonitorMountedOnArm } from './laptop';
import { WALL_OUTLET_DEFAULT_Y } from './power';

export function footprint(item: SceneItem): DeskPoint[] {
  // Mounted accessories, wall-hung pegboards & wall-mounted outlets have no desk support footprint.
  if (
    item.kind === 'screenLamp' ||
    item.kind === 'monitorArm' ||
    (item.kind === 'pegboard' && item.surface === 'wall') ||
    (item.kind === 'wallOutlet' &&
      item.surface !== 'floor' &&
      (item.wallOutlet?.mount ?? 'wall') === 'wall')
  )
    return [];
  const r = (item.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => {
    const x = (a * item.size.width) / 2;
    const z = (b * item.size.depth) / 2;
    return { x: item.x + x * c + z * s, z: item.z - x * s + z * c };
  });
}

function polygonArea(points: DeskPoint[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.z - q.x * p.z;
      }, 0),
    ) / 2
  );
}

// Sutherland–Hodgman clipping against a clockwise convex polygon in (x, z).
function clippedAreaConvex(points: DeskPoint[], clipPoly: DeskPoint[]) {
  let current = points;
  for (let e = 0; e < clipPoly.length; e++) {
    if (current.length === 0) return 0;
    const p = clipPoly[e];
    const q = clipPoly[(e + 1) % clipPoly.length];
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const output: DeskPoint[] = [];
    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      const crossA = ex * (a.z - p.z) - ez * (a.x - p.x);
      const crossB = ex * (b.z - p.z) - ez * (b.x - p.x);
      const aIn = crossA >= 0;
      const bIn = crossB >= 0;
      if (aIn !== bIn) {
        const t = crossA / (crossA - crossB);
        output.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
      }
      if (bIn) output.push(b);
    }
    current = output;
  }
  return polygonArea(current);
}

function rectToPoly(r: DeskRect): DeskPoint[] {
  return [
    { x: r.minX, z: r.minZ },
    { x: r.maxX, z: r.minZ },
    { x: r.maxX, z: r.maxZ },
    { x: r.minX, z: r.maxZ },
  ];
}

const EDGE_TOLERANCE = 0.0001;

export function isOutOfBounds(item: SceneItem, desk: Desk, items: SceneItem[] = []) {
  if (item.kind === 'pegboard' && item.surface === 'wall') {
    const wall = deskBackWallBounds(desk);
    if (!wall) return true;
    const bottomY = desk.height + (item.wallY ?? PEGBOARD_WALL_DEFAULT_Y);
    const horizOk =
      item.x - item.size.width / 2 >= wall.minX - EDGE_TOLERANCE &&
      item.x + item.size.width / 2 <= wall.maxX + EDGE_TOLERANCE;
    const vertOk =
      bottomY >= desk.height + 0.02 - EDGE_TOLERANCE &&
      bottomY + item.size.height <= wall.topY + EDGE_TOLERANCE;
    return !(horizOk && vertOk);
  }

  if (
    item.kind === 'wallOutlet' &&
    item.surface !== 'floor' &&
    (item.wallOutlet?.mount ?? 'wall') === 'wall'
  ) {
    const wall = deskBackWallBounds(desk);
    if (!wall) return true;
    const bottomY = item.wallY ?? WALL_OUTLET_DEFAULT_Y;
    const horizOk =
      item.x - item.size.width / 2 >= wall.minX - EDGE_TOLERANCE &&
      item.x + item.size.width / 2 <= wall.maxX + EDGE_TOLERANCE;
    const vertOk =
      bottomY >= 0.02 - EDGE_TOLERANCE && bottomY + item.size.height <= wall.topY + EDGE_TOLERANCE;
    return !(horizOk && vertOk);
  }

  if (item.surface === 'floor') {
    return false;
  }

  const points = footprint(item);
  if (!points.length) return false;

  // A laptop mounted on a stand or monitor arm tray derives its support from that mount.
  if (
    (item.kind === 'gamingLaptop' || item.kind === 'macbook') &&
    (items.some(
      (other) => other.kind === 'laptopStand' && other.laptopStand?.laptopId === item.id,
    ) ||
      Boolean(findArmForTrayLaptop(item.id, items)))
  ) {
    return false;
  }

  // A monitor on a desk-edge arm is supported by its arm rather than stock base plate.
  if (item.kind === 'monitor' && isMonitorMountedOnArm(item.id, items)) {
    return false;
  }

  const shelfRect = deskShelfRect(desk);
  if (item.surface === 'shelf') {
    if (!shelfRect) return true;
    const expandedShelf = rectToPoly({
      minX: shelfRect.minX - EDGE_TOLERANCE,
      maxX: shelfRect.maxX + EDGE_TOLERANCE,
      minZ: shelfRect.minZ - EDGE_TOLERANCE,
      maxZ: shelfRect.maxZ + EDGE_TOLERANCE,
    });
    return polygonArea(points) - clippedAreaConvex(points, expandedShelf) > 1e-12;
  }

  const polys = deskSupportPolygons(desk, EDGE_TOLERANCE);
  if (polys.length === 1) {
    return polygonArea(points) - clippedAreaConvex(points, polys[0]) > 1e-12;
  }

  const [m, w] = deskSupportRects(desk);
  const overlap = rectToPoly({
    minX: w.minX - EDGE_TOLERANCE,
    maxX: w.maxX + EDGE_TOLERANCE,
    minZ: m.maxZ - EDGE_TOLERANCE,
    maxZ: m.maxZ + EDGE_TOLERANCE,
  });
  const supported =
    clippedAreaConvex(points, polys[0]) +
    clippedAreaConvex(points, polys[1]) -
    clippedAreaConvex(points, overlap);
  // Numerical roundoff only; physical edge tolerance is applied in metres above.
  return polygonArea(points) - supported > 1e-12;
}

export function mousepadElevationAt(
  x: number,
  z: number,
  surface: SceneItem['surface'],
  items: SceneItem[],
): number {
  let maxHeight = 0;
  const targetSurface = surface ?? 'desk';
  for (const candidate of items) {
    if (candidate.kind !== 'mousepad') continue;
    if ((candidate.surface ?? 'desk') !== targetSurface) continue;
    const rad = (candidate.rotation * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const dx = x - candidate.x;
    const dz = z - candidate.z;
    // Transform world delta into mousepad local frame (reverse of footprint's x*c+z*s, -x*s+z*c)
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (
      Math.abs(lx) <= candidate.size.width / 2 + 1e-4 &&
      Math.abs(lz) <= candidate.size.depth / 2 + 1e-4
    ) {
      if (candidate.size.height > maxHeight) maxHeight = candidate.size.height;
    }
  }
  return maxHeight;
}

export function itemWorldY(desk: Desk, item?: SceneItem, items: SceneItem[] = []) {
  if (
    item?.surface === 'floor' ||
    (item?.kind === 'wallOutlet' && item.wallOutlet?.mount === 'floor')
  ) {
    return 0;
  }
  if (item && !desk.return && desk.shelf?.enabled && item.surface === 'shelf') {
    const padOffset =
      item.kind !== 'mousepad' ? mousepadElevationAt(item.x, item.z, item.surface, items) : 0;
    return desk.height + desk.shelf.height + padOffset;
  }
  const padOffset =
    item && item.kind !== 'mousepad' ? mousepadElevationAt(item.x, item.z, item.surface, items) : 0;
  return desk.height + padOffset;
}

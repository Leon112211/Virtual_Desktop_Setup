// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import type { Desk } from './project';

export const RETURN_MIN_WIDTH = 0.3;
export const RETURN_MAX_WIDTH = 1.2;
export const RETURN_MIN_EXTENSION = 0.3;
export const RETURN_MAX_EXTENSION = 2;
export const DESK_NOTCH_MIN = 0.3;

export const FRONT_CORNER_RADIUS = 0.05;
export const DESK_MIN_CORNER_RADIUS = 0;
export const DESK_MAX_CORNER_RADIUS = 0.12;
export const DESK_CORNER_RADIUS_PRESETS = [0, 0.03, 0.05, 0.08, 0.1] as const;
export const DESK_FINISHES = ['wood', 'solid'] as const;
export type DeskFinish = (typeof DESK_FINISHES)[number];
export const DESK_WOOD_BASE_COLOR = '#914d1e';

export function deskCornerRadius(desk: Pick<Desk, 'cornerRadius'>): number {
  return Math.max(
    DESK_MIN_CORNER_RADIUS,
    Math.min(DESK_MAX_CORNER_RADIUS, desk.cornerRadius ?? FRONT_CORNER_RADIUS),
  );
}
export const GROMMET_DEFAULT_DIAMETER = 0.06;
export const GROMMET_DIAMETERS = [0.05, 0.06, 0.08] as const;
export const GROMMET_BACK_OFFSET = 0.09;
export const PARTITION_MIN_HEIGHT = 0.2;
export const PARTITION_MAX_HEIGHT = 0.65;
export const PARTITION_DEFAULT_HEIGHT = 0.35;
export const PARTITION_MATERIALS = ['matchDesk', 'frosted'] as const;
export type PartitionMaterial = (typeof PARTITION_MATERIALS)[number];
export const SHELF_MIN_DEPTH = 0.15;
export const SHELF_DEFAULT_DEPTH = 0.22;
export const SHELF_MIN_HEIGHT = 0.1;
export const SHELF_MAX_HEIGHT = 0.65;
export const SHELF_DEFAULT_HEIGHT = 0.18;
export const WALL_MIN_HEIGHT = 0.55;
export const WALL_MAX_HEIGHT = 1.8;
export const WALL_DEFAULT_HEIGHT = 1.15;
export const WALL_MIN_GAP = 0;
export const WALL_MAX_GAP = 0.2;
export const WALL_DEFAULT_GAP = 0.04;
export const WALL_THICKNESS = 0.08;
export const WALL_SIDE_MARGIN = 0.4;
export const WALL_DEFAULT_COLOR = '#ebe9e2';
export const PEGBOARD_WALL_DEFAULT_Y = 0.22;
export const PEGBOARD_WALL_STANDOFF = 0.012;

export type DeskBackWallBounds = {
  minX: number;
  maxX: number;
  width: number;
  frontZ: number;
  topY: number;
  heightAboveDesk: number;
  totalHeight: number;
  color: string;
};

export function deskBackWallBounds(desk: Desk): DeskBackWallBounds | null {
  if (!desk.backWall?.enabled) return null;
  const width = desk.width + WALL_SIDE_MARGIN * 2;
  const gap = desk.backWall.gap ?? WALL_DEFAULT_GAP;
  const partClearance = !desk.return && desk.partitions?.back ? 0.024 : 0;
  const frontZ = -desk.depth / 2 - Math.max(gap, partClearance);
  const heightAboveDesk = desk.backWall.height;
  const totalHeight = desk.height + heightAboveDesk;
  return {
    minX: -width / 2,
    maxX: width / 2,
    width,
    frontZ,
    topY: totalHeight,
    heightAboveDesk,
    totalHeight,
    color: desk.backWall.color ?? WALL_DEFAULT_COLOR,
  };
}

export type DeskPoint = { x: number; z: number };
export type DeskRect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type DeskShape = 'rectangle' | 'left' | 'right';
export type GrommetSide = 'left' | 'center' | 'right';

export function returnWidthMax(width: number) {
  // Round away subtraction noise at the 60 cm minimum.
  return Math.round(Math.min(RETURN_MAX_WIDTH, width - DESK_NOTCH_MIN) * 1e10) / 1e10;
}

export function shelfDepthMax(depth: number) {
  return Math.round(Math.min(0.45, depth - 0.15, depth * 0.65) * 1e10) / 1e10;
}

export function setDeskShape(desk: Desk, shape: DeskShape) {
  if (shape === 'rectangle') {
    delete desk.return;
  } else {
    // Partitions and full-width shelf are exclusive to rectangular desks.
    delete desk.partitions;
    delete desk.shelf;
    if (desk.return) desk.return.side = shape;
    else
      desk.return = {
        side: shape,
        width: Math.min(0.6, returnWidthMax(desk.width)),
        extension: 0.6,
      };
  }
}

export function setDeskWidth(desk: Desk, width: number) {
  desk.width = width;
  if (desk.return) desk.return.width = Math.min(desk.return.width, returnWidthMax(width));
}

export function setDeskDepth(desk: Desk, depth: number) {
  desk.depth = depth;
  if (desk.shelf) desk.shelf.depth = Math.min(desk.shelf.depth, shelfDepthMax(depth));
}

export function grommetPosition(desk: Desk): { x: number; z: number; diameter: number } | null {
  if (!desk.grommet?.enabled) return null;
  const diameter = desk.grommet.diameter ?? GROMMET_DEFAULT_DIAMETER;
  const edgeMargin = Math.min(0.22, desk.width * 0.24);
  const x =
    desk.grommet.side === 'left'
      ? -desk.width / 2 + edgeMargin
      : desk.grommet.side === 'right'
        ? desk.width / 2 - edgeMargin
        : 0;
  return {
    x,
    z: -desk.depth / 2 + GROMMET_BACK_OFFSET,
    diameter,
  };
}

export function deskShelfRect(desk: Desk): DeskRect | null {
  if (desk.return || !desk.shelf?.enabled) return null;
  return {
    minX: -desk.width / 2,
    maxX: desk.width / 2,
    minZ: -desk.depth / 2,
    maxZ: -desk.depth / 2 + desk.shelf.depth,
  };
}

export function deskSupportRects(desk: Desk): DeskRect[] {
  const main = {
    minX: -desk.width / 2,
    maxX: desk.width / 2,
    minZ: -desk.depth / 2,
    maxZ: desk.depth / 2,
  };
  if (!desk.return) return [main];
  const r = desk.return;
  const minX = r.side === 'left' ? main.minX : main.maxX - r.width;
  return [main, { minX, maxX: minX + r.width, minZ: main.maxZ, maxZ: main.maxZ + r.extension }];
}

export function deskBounds(desk: Desk): DeskRect {
  return {
    minX: -desk.width / 2,
    maxX: desk.width / 2,
    minZ: -desk.depth / 2,
    maxZ: desk.depth / 2 + (desk.return?.extension ?? 0),
  };
}

export function deskOutline(desk: Desk): DeskPoint[] {
  const [m, r] = deskSupportRects(desk);
  if (!r)
    return [
      { x: m.minX, z: m.minZ },
      { x: m.maxX, z: m.minZ },
      { x: m.maxX, z: m.maxZ },
      { x: m.minX, z: m.maxZ },
    ];
  return desk.return!.side === 'left'
    ? [
        { x: m.minX, z: m.minZ },
        { x: m.maxX, z: m.minZ },
        { x: m.maxX, z: m.maxZ },
        { x: r.maxX, z: m.maxZ },
        { x: r.maxX, z: r.maxZ },
        { x: m.minX, z: r.maxZ },
      ]
    : [
        { x: m.minX, z: m.minZ },
        { x: m.maxX, z: m.minZ },
        { x: m.maxX, z: r.maxZ },
        { x: r.minX, z: r.maxZ },
        { x: r.minX, z: m.maxZ },
        { x: m.minX, z: m.maxZ },
      ];
}

/**
 * Returns the corner radius for each vertex in `deskOutline(desk)`:
 * Rounded on all user-facing front corners AND the inner concave L-corner; 0 on wall-facing back corners.
 */
export function deskOutlineCornerRadii(desk: Desk): number[] {
  const r = deskCornerRadius(desk);
  if (!desk.return) return [0, 0, r, r];
  return [0, 0, r, r, r, r];
}

/**
 * Generates an ordered 2D polyline in (x, z) matching the actual desk outline including convex
 * front corners and the inner concave L-corner fillet.
 */
export function deskOutlineRoundedPoints(desk: Desk, segments = 6): DeskPoint[] {
  const outline = deskOutline(desk);
  const radii = deskOutlineCornerRadii(desk);
  const pts: DeskPoint[] = [];

  for (let i = 0; i < outline.length; i++) {
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const curr = outline[i];
    const next = outline[(i + 1) % outline.length];
    const radius = radii[i];
    if (radius <= 0) {
      pts.push(curr);
      continue;
    }
    const uPrevX = Math.sign(curr.x - prev.x);
    const uPrevZ = Math.sign(curr.z - prev.z);
    const uNextX = Math.sign(next.x - curr.x);
    const uNextZ = Math.sign(next.z - curr.z);
    const cross = uPrevX * uNextZ - uPrevZ * uNextX;
    const isConvex = cross >= 0;
    const nPrevX = -uPrevZ;
    const nPrevZ = uPrevX;

    const startX = curr.x - uPrevX * radius;
    const startZ = curr.z - uPrevZ * radius;
    const endX = curr.x + uNextX * radius;
    const endZ = curr.z + uNextZ * radius;
    const cx = startX + (isConvex ? nPrevX : -nPrevX) * radius;
    const cz = startZ + (isConvex ? nPrevZ : -nPrevZ) * radius;

    let a0 = Math.atan2(startZ - cz, startX - cx);
    let a1 = Math.atan2(endZ - cz, endX - cx);
    // In XZ clockwise polygon: convex corners sweep CW (-angle when Y points down -> +angle in (x,z)),
    // while concave fillet sweeps CCW (-angle in (x,z)).
    let delta = a1 - a0;
    if (isConvex) {
      if (delta <= 0) delta += Math.PI * 2;
      if (delta > Math.PI) delta -= Math.PI * 2;
    } else {
      if (delta >= 0) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
    }
    for (let s = 0; s <= segments; s++) {
      const a = a0 + (delta * s) / segments;
      pts.push({ x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius });
    }
  }
  return pts;
}

function roundedRectPolygon(
  rect: DeskRect,
  radii: [number, number, number, number], // [backLeft, backRight, frontRight, frontLeft]
  segments = 6,
): DeskPoint[] {
  const corners: {
    x: number;
    z: number;
    cx: number;
    cz: number;
    a0: number;
    a1: number;
    r: number;
  }[] = [
    {
      x: rect.minX,
      z: rect.minZ,
      cx: rect.minX + radii[0],
      cz: rect.minZ + radii[0],
      a0: Math.PI,
      a1: (3 * Math.PI) / 2,
      r: radii[0],
    },
    {
      x: rect.maxX,
      z: rect.minZ,
      cx: rect.maxX - radii[1],
      cz: rect.minZ + radii[1],
      a0: -Math.PI / 2,
      a1: 0,
      r: radii[1],
    },
    {
      x: rect.maxX,
      z: rect.maxZ,
      cx: rect.maxX - radii[2],
      cz: rect.maxZ - radii[2],
      a0: 0,
      a1: Math.PI / 2,
      r: radii[2],
    },
    {
      x: rect.minX,
      z: rect.maxZ,
      cx: rect.minX + radii[3],
      cz: rect.maxZ - radii[3],
      a0: Math.PI / 2,
      a1: Math.PI,
      r: radii[3],
    },
  ];
  const pts: DeskPoint[] = [];
  for (const c of corners) {
    if (c.r <= 0) {
      pts.push({ x: c.x, z: c.z });
      continue;
    }
    for (let i = 0; i <= segments; i++) {
      const a = c.a0 + ((c.a1 - c.a0) * i) / segments;
      pts.push({ x: c.cx + Math.cos(a) * c.r, z: c.cz + Math.sin(a) * c.r });
    }
  }
  return pts;
}

/**
 * Returns 1 (rectangle) or 2 (L-desk) convex polygons matching the exact R5 cm front-cornered desktop.
 */
export function deskSupportPolygons(desk: Desk, tolerance = 0, segments = 6): DeskPoint[][] {
  const [m, w] = deskSupportRects(desk);
  const r = deskCornerRadius(desk);
  const expand = (rect: DeskRect): DeskRect => ({
    minX: rect.minX - tolerance,
    maxX: rect.maxX + tolerance,
    minZ: rect.minZ - tolerance,
    maxZ: rect.maxZ + tolerance,
  });
  if (!w) {
    return [roundedRectPolygon(expand(m), [0, 0, r, r], segments)];
  }
  const mainRadii: [number, number, number, number] =
    desk.return!.side === 'left' ? [0, 0, r, 0] : [0, 0, 0, r];
  return [
    roundedRectPolygon(expand(m), mainRadii, segments),
    roundedRectPolygon(expand(w), [0, 0, r, r], segments),
  ];
}

export function deskArea(desk: Desk) {
  return desk.width * desk.depth + (desk.return ? desk.return.width * desk.return.extension : 0);
}

export function deskCentroid(desk: Desk): DeskPoint {
  const [, r] = deskSupportRects(desk);
  if (!r) return { x: 0, z: 0 };
  const weight = (desk.return!.width * desk.return!.extension) / deskArea(desk);
  return { x: ((r.minX + r.maxX) / 2) * weight, z: ((r.minZ + r.maxZ) / 2) * weight };
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { ExtrudeGeometry, Path, Shape } from 'three';
import {
  deskCornerRadius,
  deskOutline,
  deskOutlineCornerRadii,
  deskSupportRects,
  grommetPosition,
} from '../domain/desk';
import type { Desk } from '../domain/project';

export const DESK_LEG_SIZE = 0.045;
export const DESK_LEG_INSET_X = 0.075;
export const DESK_LEG_INSET_Z = 0.07;
export const DESK_PARTITION_THICKNESS = 0.018;

export function deskBevelSize(thickness: number): number {
  return Math.min(0.005, thickness * 0.25);
}

function applyDeskWorldUVs(geometry: ExtrudeGeometry): void {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));
    if (ny >= 0.5) {
      uv.setXY(i, x / 1.4 + 0.5, -z / 0.7 + 0.5);
    } else if (nx > nz) {
      uv.setXY(i, z / 1.4 + 0.5, y / 0.7 + 0.5);
    } else {
      uv.setXY(i, x / 1.4 + 0.5, y / 0.7 + 0.5);
    }
  }
  uv.needsUpdate = true;
}

/**
 * Builds a single closed extruded desktop mesh geometry spanning local Y in [0, desk.thickness],
 * supporting both rectangular and L-shaped desks with R5 cm front-side corner fillets and optional grommet hole.
 */
export function buildDeskTopGeometry(desk: Desk): ExtrudeGeometry {
  const outline = deskOutline(desk);
  const radii = deskOutlineCornerRadii(desk);
  const bevel = deskBevelSize(desk.thickness);
  const extrudeDepth = Math.max(0.001, desk.thickness - 2 * bevel);

  const shape = new Shape();
  let started = false;

  for (let i = 0; i < outline.length; i++) {
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const curr = outline[i];
    const next = outline[(i + 1) % outline.length];

    const uPrevX = Math.sign(curr.x - prev.x);
    const uPrevZ = Math.sign(curr.z - prev.z);
    const uNextX = Math.sign(next.x - curr.x);
    const uNextZ = Math.sign(next.z - curr.z);

    // Outline is clockwise in (x, z), so (-uz, ux) points inward into the desktop.
    const nPrevX = -uPrevZ;
    const nPrevZ = uPrevX;
    const nNextX = -uNextZ;
    const nNextZ = uNextX;

    const insetX = curr.x + (nPrevX + nNextX) * bevel;
    const insetZ = curr.z + (nPrevZ + nNextZ) * bevel;
    const radius = radii[i];

    if (radius <= 0) {
      if (!started) {
        shape.moveTo(insetX, -insetZ);
        started = true;
      } else {
        shape.lineTo(insetX, -insetZ);
      }
      continue;
    }

    const cross = uPrevX * uNextZ - uPrevZ * uNextX;
    const isConvex = cross >= 0;
    const rIn = isConvex ? Math.max(0.005, radius - bevel) : radius + bevel;
    const startX = insetX - uPrevX * rIn;
    const startZ = insetZ - uPrevZ * rIn;
    const endX = insetX + uNextX * rIn;
    const endZ = insetZ + uNextZ * rIn;
    const centerX = startX + (isConvex ? nPrevX : -nPrevX) * rIn;
    const centerY = -(startZ + (isConvex ? nPrevZ : -nPrevZ) * rIn);
    const startAngle = Math.atan2(-startZ - centerY, startX - centerX);
    const endAngle = Math.atan2(-endZ - centerY, endX - centerX);

    if (!started) {
      shape.moveTo(startX, -startZ);
      started = true;
    } else {
      shape.lineTo(startX, -startZ);
    }
    shape.absarc(centerX, centerY, rIn, startAngle, endAngle, isConvex);
  }
  shape.closePath();

  const grommet = grommetPosition(desk);
  if (grommet) {
    const hole = new Path();
    // Extrude bevel expands inward into holes, so enlarge hole radius by `bevel` to preserve nominal diameter.
    hole.absarc(grommet.x, -grommet.z, grommet.diameter / 2 + bevel, 0, Math.PI * 2, false);
    shape.holes.push(hole);
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  applyDeskWorldUVs(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildLDeskGeometry(desk: Desk): ExtrudeGeometry {
  if (!desk.return) {
    throw new Error('buildLDeskGeometry requires an L-shaped desk with return.');
  }
  return buildDeskTopGeometry(desk);
}

export function deskLegs(desk: Desk): { x: number; z: number }[] {
  const legs = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => ({
      x: sx * (desk.width / 2 - DESK_LEG_INSET_X),
      z: sz * (desk.depth / 2 - DESK_LEG_INSET_Z),
    })),
  );
  if (desk.return) {
    const [, wing] = deskSupportRects(desk);
    const frontZ = wing.maxZ - DESK_LEG_INSET_Z;
    legs.push(
      { x: wing.minX + DESK_LEG_INSET_X, z: frontZ },
      { x: wing.maxX - DESK_LEG_INSET_X, z: frontZ },
    );
  }
  return legs;
}

export type DeskPartitionFlags = {
  back: boolean;
  left: boolean;
  right: boolean;
};

function buildSideWingShape(
  side: 'left' | 'right',
  desk: Desk,
  {
    wallT,
    innerInset,
    outExpand,
    bevel,
  }: { wallT: number; innerInset: number; outExpand: number; bevel: number },
): Shape {
  const halfW = desk.width / 2;
  const xIn = side === 'left' ? -halfW + innerInset : halfW - innerInset;
  const xOut = side === 'left' ? -halfW - wallT - outExpand : halfW + wallT + outExpand;
  const cX = (xIn + xOut) / 2;
  const rCap = Math.max(0.002, (wallT + innerInset + outExpand) / 2 - bevel);

  const zFront = desk.depth / 2 - Math.max(0.022, deskCornerRadius(desk) * 0.92);
  const yFrontCap = -(zFront - rCap - bevel);
  const yRearCap = desk.depth / 2 - rCap - bevel;

  const shape = new Shape();
  shape.moveTo(cX + rCap, yRearCap);
  shape.absarc(cX, yRearCap, rCap, 0, Math.PI, false);
  shape.lineTo(cX - rCap, yFrontCap);
  shape.absarc(cX, yFrontCap, rCap, Math.PI, 0, false);
  shape.closePath();
  return shape;
}

function buildBackConnectedShape(
  desk: Desk,
  left: boolean,
  right: boolean,
  {
    wallT,
    innerInset,
    outExpand,
    bevel,
  }: { wallT: number; innerInset: number; outExpand: number; bevel: number },
): Shape {
  const xL = -desk.width / 2;
  const xR = desk.width / 2;
  const yRear = desk.depth / 2;

  const yRearOut2d = yRear + wallT + outExpand - bevel;
  const yRearIn2d = yRear - innerInset + bevel;
  const xLIn2d = xL + innerInset - bevel;
  const xRIn2d = xR - innerInset + bevel;

  const totalT = wallT + innerInset + outExpand;
  const rCap = Math.max(0.002, totalT / 2 - bevel);
  const rOuter2d = Math.max(0.003, wallT + outExpand - bevel);
  const rInnerCorner = 0.004;

  const zFront = desk.depth / 2 - Math.max(0.022, deskCornerRadius(desk) * 0.92);
  const yFrontCap = -(zFront - rCap - bevel);
  const cXL = xL + (innerInset - wallT - outExpand) / 2;
  const cXR = xR + (wallT + outExpand - innerInset) / 2;
  const cYBackMid = (yRearIn2d + yRearOut2d) / 2;

  const shape = new Shape();

  if (left) {
    shape.moveTo(cXL + rCap, yFrontCap);
    shape.absarc(cXL, yFrontCap, rCap, 0, Math.PI, true);
    shape.lineTo(xL - rOuter2d, yRear);
    shape.absarc(xL, yRear, rOuter2d, Math.PI, Math.PI / 2, true);
  } else {
    shape.moveTo(xL + rCap + bevel, yRearIn2d);
    shape.absarc(xL + rCap + bevel, cYBackMid, rCap, -Math.PI / 2, Math.PI / 2, true);
  }

  if (right) {
    shape.lineTo(xR, yRearOut2d);
    shape.absarc(xR, yRear, rOuter2d, Math.PI / 2, 0, true);
    shape.lineTo(cXR + rCap, yFrontCap);
    shape.absarc(cXR, yFrontCap, rCap, 0, Math.PI, true);
    shape.lineTo(xRIn2d, yRearIn2d - rInnerCorner);
    shape.absarc(
      xRIn2d - rInnerCorner,
      yRearIn2d - rInnerCorner,
      rInnerCorner,
      0,
      Math.PI / 2,
      false,
    );
  } else {
    shape.lineTo(xR - rCap - bevel, yRearOut2d);
    shape.absarc(xR - rCap - bevel, cYBackMid, rCap, Math.PI / 2, -Math.PI / 2, true);
  }

  if (left) {
    shape.lineTo(xLIn2d + rInnerCorner, yRearIn2d);
    shape.absarc(
      xLIn2d + rInnerCorner,
      yRearIn2d - rInnerCorner,
      rInnerCorner,
      Math.PI / 2,
      Math.PI,
      false,
    );
    shape.lineTo(cXL + rCap, yFrontCap);
  }

  shape.closePath();
  return shape;
}

function extrudeDeskRibbon(
  shapes: Shape[],
  height: number,
  bevel: number,
  curveSegments = 10,
): ExtrudeGeometry {
  const depth = Math.max(0.002, height - 2 * bevel);
  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  applyDeskWorldUVs(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds monolithic seamless extruded geometries (main acoustic baffle shell + desktop-hugging
 * sealing trim apron) for any rectangular desk partition configuration.
 */
export function buildDeskPartitionGeometries(
  desk: Desk,
  partitions: { back: boolean; left: boolean; right: boolean; height: number },
): { wallGeometry: ExtrudeGeometry; apronGeometry: ExtrudeGeometry } | null {
  if (desk.return || (!partitions.back && !partitions.left && !partitions.right)) return null;

  const wallParams = {
    wallT: DESK_PARTITION_THICKNESS,
    innerInset: 0,
    outExpand: 0,
    bevel: 0.0025,
  };
  const apronParams = {
    wallT: DESK_PARTITION_THICKNESS,
    innerInset: 0.003,
    outExpand: 0.002,
    bevel: 0.0018,
  };

  const makeShapes = (params: typeof wallParams): Shape[] => {
    if (partitions.back) {
      return [buildBackConnectedShape(desk, partitions.left, partitions.right, params)];
    }
    const shapes: Shape[] = [];
    if (partitions.left) shapes.push(buildSideWingShape('left', desk, params));
    if (partitions.right) shapes.push(buildSideWingShape('right', desk, params));
    return shapes;
  };

  const apronHeight = desk.thickness + 0.008;
  const wallGeometry = extrudeDeskRibbon(makeShapes(wallParams), partitions.height + 0.002, 0.0025);
  const apronGeometry = extrudeDeskRibbon(makeShapes(apronParams), apronHeight, 0.0018);
  return { wallGeometry, apronGeometry };
}

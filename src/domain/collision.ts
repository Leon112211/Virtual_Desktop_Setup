import { Vector3 } from 'three';
import {
  deskBackWallBounds,
  deskShelfRect,
  deskSupportRects,
  grommetPosition,
  PEGBOARD_WALL_DEFAULT_Y,
  PEGBOARD_WALL_STANDOFF,
  WALL_DEFAULT_GAP,
} from './desk';
import {
  DEFAULT_TRAY_ELEVATION,
  DEFAULT_TRAY_TILT_DEG,
  isMonitorMountedOnArm,
  type ArmClampEdge,
} from './laptop';
import {
  DELL_COLUMN_LEAN_RAD,
  MAX_LIFT,
  STUDIO_MAX_LIFT,
  monitorBaseTier,
  monitorParts,
  monitorPose,
} from './monitor';
import {
  computeMonitorArmSystem,
  solveArmBaseMove,
  solveHorizontalElbowSwivel,
  solveLowerArmPitch,
  solveUpperArmPitch,
  type ArmBranchKinematics,
} from './monitorArm';
import { PEGBOARD } from './pegboard';
import { itemWorldY } from './placement';
import { WALL_OUTLET_DEFAULT_Y } from './power';
import type { Desk, Project, SceneItem } from './project';

export type SolidBox = {
  id: string;
  label: string;
  kind: 'desk' | 'shelf' | 'partition' | 'wall' | 'leg' | 'item';
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  yaw: number;
  minY: number;
  maxY: number;
  /** Optional item ID this solid belongs to (so cables entering that device's port can dock cleanly). */
  itemId?: string;
};

export type CableHole = {
  id: string;
  kind: 'grommet' | 'standSlot';
  label: string;
  entry: Vector3;
  exit: Vector3;
  center: Vector3;
  radius: number;
  itemId?: string;
};

const DESK_LEG_INSET_X = 0.075;
const DESK_LEG_INSET_Z = 0.07;
const DESK_LEG_HALF = 0.0225;

/**
 * Returns all physical pass-through cable holes in the current scene:
 * 1) Desk grommet vertical channel (when enabled)
 * 2) Monitor stand oval cable-management cutouts (Dell U2725QE & Apple Studio Display)
 */
export function getSceneCableHoles(project: Pick<Project, 'desk' | 'items'>): CableHole[] {
  const { desk, items } = project;
  const holes: CableHole[] = [];

  const grommet = grommetPosition(desk);
  if (grommet) {
    const r = grommet.diameter / 2;
    holes.push({
      id: 'desk-grommet',
      kind: 'grommet',
      label: `桌面走线孔 (${Math.round(grommet.diameter * 1000)}mm)`,
      entry: new Vector3(grommet.x, desk.height + 0.014, grommet.z),
      exit: new Vector3(grommet.x, Math.max(0.03, desk.height - desk.thickness - 0.024), grommet.z),
      center: new Vector3(grommet.x, desk.height - desk.thickness / 2, grommet.z),
      radius: r,
    });
  }

  for (const item of items) {
    if (item.kind !== 'monitor' || isMonitorMountedOnArm(item.id, items)) continue;
    const yaw = (item.rotation * Math.PI) / 180;
    const baseY = itemWorldY(desk, item, items);
    const tier = monitorBaseTier(item.size, item.monitor);
    const isStudio = item.monitor?.model === 'studioDisplay';

    const localHoleZ = isStudio ? -0.056 : -0.074;
    const localHoleY = isStudio ? 0.058 : Math.min(0.064, tier.baseDepth * 0.38);
    const frontOffset = 0.015;
    const backOffset = -0.018;

    const toWorld = (lx: number, ly: number, lz: number) =>
      new Vector3(
        item.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
        baseY + ly,
        item.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
      );

    const entry = toWorld(0, localHoleY, frontOffset + localHoleZ);
    const exit = toWorld(0, localHoleY, backOffset + localHoleZ);
    holes.push({
      id: `stand-slot:${item.id}`,
      kind: 'standSlot',
      label: `${item.name} 底座走线孔`,
      entry,
      exit,
      center: toWorld(0, localHoleY, localHoleZ),
      radius: isStudio ? 0.01 : 0.011,
      itemId: item.id,
    });
  }

  return holes;
}

/** Computes world XZ footprint + Y bounds for an item on the desk, shelf, floor, or wall. */
export function getItemSolidBoxes(item: SceneItem, desk: Desk, items: SceneItem[]): SolidBox[] {
  if (item.kind === 'screenLamp' || item.kind === 'monitorArm') return [];
  const yaw = (item.rotation * Math.PI) / 180;

  if (item.kind === 'pegboard' && item.surface === 'wall') {
    const wall = deskBackWallBounds(desk);
    const frontZ = wall ? wall.frontZ : -desk.depth / 2 - WALL_DEFAULT_GAP;
    const bottomY = desk.height + (item.wallY ?? PEGBOARD_WALL_DEFAULT_Y);
    return [
      {
        id: `item:${item.id}`,
        label: item.name,
        kind: 'item',
        itemId: item.id,
        cx: item.x,
        cz: frontZ + PEGBOARD_WALL_STANDOFF + PEGBOARD.thickness / 2,
        halfW: item.size.width / 2,
        halfD: PEGBOARD.thickness / 2,
        yaw: 0,
        minY: bottomY,
        maxY: bottomY + item.size.height,
      },
    ];
  }

  if (
    item.kind === 'wallOutlet' &&
    item.surface !== 'floor' &&
    (item.wallOutlet?.mount ?? 'wall') === 'wall'
  ) {
    const wall = deskBackWallBounds(desk);
    const frontZ = wall ? wall.frontZ : -desk.depth / 2 - WALL_DEFAULT_GAP;
    const bottomY = item.wallY ?? WALL_OUTLET_DEFAULT_Y;
    return [
      {
        id: `item:${item.id}`,
        label: item.name,
        kind: 'item',
        itemId: item.id,
        cx: item.x,
        cz: frontZ + item.size.depth / 2,
        halfW: item.size.width / 2,
        halfD: item.size.depth / 2,
        yaw: 0,
        minY: bottomY,
        maxY: bottomY + item.size.height,
      },
    ];
  }

  const baseY = itemWorldY(desk, item, items);

  if (item.kind === 'monitor') {
    const mounted = isMonitorMountedOnArm(item.id, items);
    const parts = monitorParts(item.size, item.monitor?.model);
    const pose = monitorPose(item.size, { ...item, hasMonitorArm: mounted });
    const boxes: SolidBox[] = [];

    if (!mounted) {
      const tier = monitorBaseTier(item.size, item.monitor);
      const isStudio = item.monitor?.model === 'studioDisplay';
      const baseLocalZ = isStudio ? -0.025 : -0.072 + tier.baseDepth * 0.88 * 0.35;
      const baseScale = isStudio ? 0.94 : 0.9;
      boxes.push({
        id: `item:${item.id}:base`,
        label: `${item.name} 底座`,
        kind: 'item',
        itemId: item.id,
        cx: item.x + baseLocalZ * Math.sin(yaw),
        cz: item.z + baseLocalZ * Math.cos(yaw),
        halfW: (tier.baseWidth * baseScale) / 2,
        halfD: (tier.baseDepth * baseScale) / 2,
        yaw,
        minY: baseY,
        maxY: baseY + (isStudio ? 0.009 : 0.011),
      });

      // Stand column left & right pillars flanking the central oval cable pass-through hole
      const colZ = isStudio ? -0.056 : -0.074;
      const holeHalfW = 0.011;
      const pillarW = Math.max(0.014, (tier.columnWidth - holeHalfW * 2) / 2);
      const offsetX = holeHalfW + pillarW / 2;
      const colTopY = baseY + pose.pivotY;
      for (const side of [-1, 1] as const) {
        const lx = side * offsetX;
        boxes.push({
          id: `item:${item.id}:col-${side}`,
          label: `${item.name} 支架立柱`,
          kind: 'item',
          itemId: item.id,
          cx: item.x + lx * Math.cos(yaw) + colZ * Math.sin(yaw),
          cz: item.z - lx * Math.sin(yaw) + colZ * Math.cos(yaw),
          halfW: pillarW / 2,
          halfD: 0.012,
          yaw,
          minY: baseY + 0.012,
          maxY: colTopY,
        });
      }
    }

    const panelCenterY = baseY + pose.pivotY + parts.panelHeight / 2;
    if (
      Math.abs(pose.pitchDeg) < 0.5 &&
      Math.abs(pose.screenYawDeg) < 0.5 &&
      Math.abs(pose.rollDeg) < 0.5 &&
      Math.abs(pose.pivotZOffset) < 0.002
    ) {
      boxes.push({
        id: `item:${item.id}:panel`,
        label: item.name,
        kind: 'item',
        itemId: item.id,
        cx: item.x,
        cz: item.z,
        halfW: item.size.width / 2,
        halfD: 0.028,
        yaw,
        minY: panelCenterY - parts.panelHeight / 2,
        maxY: panelCenterY + parts.panelHeight / 2,
      });
      return boxes;
    }

    const pitchRad = (pose.pitchDeg * Math.PI) / 180;
    const screenYawRad = (pose.screenYawDeg * Math.PI) / 180;
    const rollRad = (pose.rollDeg * Math.PI) / 180;
    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);
    const cosSY = Math.cos(screenYawRad);
    const sinSY = Math.sin(screenYawRad);
    const cosR = Math.cos(rollRad);
    const sinR = Math.sin(rollRad);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const halfW = item.size.width / 2;
    const halfH = parts.panelHeight / 2;
    const panelZ = -0.02 + pose.pivotZOffset;
    const maxRy1 = Math.abs(halfW * sinR) + Math.abs(halfH * cosR);
    const sliceCount = 5;
    for (let s = 0; s < sliceCount; s++) {
      const t0 = -1 + (2 * s) / sliceCount;
      const t1 = -1 + (2 * (s + 1)) / sliceCount;
      const ry0 = t0 * maxRy1;
      const ry1 = t1 * maxRy1;
      const ryMid = (ry0 + ry1) / 2;
      let rxMin = Infinity;
      let rxMax = -Infinity;
      for (let ui = -4; ui <= 4; ui++) {
        for (let vi = -4; vi <= 4; vi++) {
          const px = (ui / 4) * halfW;
          const py = (vi / 4) * halfH;
          const ry = px * sinR + py * cosR;
          if (ry >= ry0 - 0.025 && ry <= ry1 + 0.025) {
            const rx = px * cosR - py * sinR;
            if (rx < rxMin) rxMin = rx;
            if (rx > rxMax) rxMax = rx;
          }
        }
      }
      if (!Number.isFinite(rxMin) || !Number.isFinite(rxMax)) {
        rxMin = -halfW * 0.5;
        rxMax = halfW * 0.5;
      }
      const sxMid = (rxMin + rxMax) / 2;
      const szMid = ryMid * sinP;
      const mxMid = sxMid * cosSY + szMid * sinSY;
      const mzMid = panelZ - sxMid * sinSY + szMid * cosSY;
      const sliceHalfW = Math.max(0.015, (rxMax - rxMin) / 2);
      const sliceHalfD = Math.max(
        0.018,
        0.02 * Math.abs(cosP) + ((ry1 - ry0) / 2) * Math.abs(sinP),
      );
      const yA = panelCenterY + ry0 * cosP;
      const yB = panelCenterY + ry1 * cosP;
      const yPad = 0.018 * Math.abs(sinP);
      boxes.push({
        id: s === 2 ? `item:${item.id}:panel` : `item:${item.id}:panel-${s}`,
        label: item.name,
        kind: 'item',
        itemId: item.id,
        cx: item.x + mxMid * cosY + mzMid * sinY,
        cz: item.z - mxMid * sinY + mzMid * cosY,
        halfW: sliceHalfW,
        halfD: sliceHalfD,
        yaw: yaw + screenYawRad,
        minY: Math.min(yA, yB) - yPad,
        maxY: Math.max(yA, yB) + yPad,
      });
    }
    return boxes;
  }

  return [
    {
      id: `item:${item.id}`,
      label: item.name,
      kind: 'item',
      itemId: item.id,
      cx: item.x,
      cz: item.z,
      halfW: item.size.width / 2,
      halfD: item.size.depth / 2,
      yaw,
      minY: baseY,
      maxY: baseY + item.size.height,
    },
  ];
}

/** Collects all physical solid boxes in the scene (desk top split around grommet, legs, shelf, partitions, backWall, items). */
export function getSceneSolidBoxes(
  project: Pick<Project, 'desk' | 'items'>,
  options: { excludeItemIds?: Set<string> } = {},
): SolidBox[] {
  const { desk, items } = project;
  const boxes: SolidBox[] = [];
  const exclude = options.excludeItemIds;

  // 1. Desk slab(s), split cleanly around grommet hole when enabled so cables can drop inside grommet.
  const rects = deskSupportRects(desk);
  const grommet = grommetPosition(desk);
  const minDeskY = desk.height - desk.thickness;
  const maxDeskY = desk.height;

  rects.forEach((rect, idx) => {
    const insideGrommet =
      idx === 0 &&
      grommet &&
      grommet.x > rect.minX &&
      grommet.x < rect.maxX &&
      grommet.z > rect.minZ &&
      grommet.z < rect.maxZ;
    if (!insideGrommet || !grommet) {
      boxes.push({
        id: `desk-top-${idx}`,
        label: '桌面主体',
        kind: 'desk',
        cx: (rect.minX + rect.maxX) / 2,
        cz: (rect.minZ + rect.maxZ) / 2,
        halfW: (rect.maxX - rect.minX) / 2,
        halfD: (rect.maxZ - rect.minZ) / 2,
        yaw: 0,
        minY: minDeskY,
        maxY: maxDeskY,
      });
    } else {
      const hr = grommet.diameter / 2;
      const strips: [string, number, number, number, number][] = [
        ['desk-g-left', rect.minX, grommet.x - hr, rect.minZ, rect.maxZ],
        ['desk-g-right', grommet.x + hr, rect.maxX, rect.minZ, rect.maxZ],
        ['desk-g-back', grommet.x - hr, grommet.x + hr, rect.minZ, grommet.z - hr],
        ['desk-g-front', grommet.x - hr, grommet.x + hr, grommet.z + hr, rect.maxZ],
      ];
      for (const [id, x0, x1, z0, z1] of strips) {
        if (x1 - x0 < 0.004 || z1 - z0 < 0.004) continue;
        boxes.push({
          id,
          label: '桌面主体',
          kind: 'desk',
          cx: (x0 + x1) / 2,
          cz: (z0 + z1) / 2,
          halfW: (x1 - x0) / 2,
          halfD: (z1 - z0) / 2,
          yaw: 0,
          minY: minDeskY,
          maxY: maxDeskY,
        });
      }
    }
  });

  // 2. Desk legs under each support corner.
  const main = rects[0];
  const legCorners: [number, number][] = [
    [main.minX + DESK_LEG_INSET_X, main.minZ + DESK_LEG_INSET_Z],
    [main.maxX - DESK_LEG_INSET_X, main.minZ + DESK_LEG_INSET_Z],
    [main.minX + DESK_LEG_INSET_X, main.maxZ - DESK_LEG_INSET_Z],
    [main.maxX - DESK_LEG_INSET_X, main.maxZ - DESK_LEG_INSET_Z],
  ];
  if (rects[1]) {
    legCorners.push(
      [rects[1].minX + DESK_LEG_INSET_X, rects[1].maxZ - DESK_LEG_INSET_Z],
      [rects[1].maxX - DESK_LEG_INSET_X, rects[1].maxZ - DESK_LEG_INSET_Z],
    );
  }
  legCorners.forEach(([lx, lz], i) => {
    boxes.push({
      id: `desk-leg-${i}`,
      label: '桌腿',
      kind: 'leg',
      cx: lx,
      cz: lz,
      halfW: DESK_LEG_HALF,
      halfD: DESK_LEG_HALF,
      yaw: 0,
      minY: 0,
      maxY: minDeskY,
    });
  });

  // 2b. Rear under-desk stretcher rail connecting back legs (matches Desk.tsx geometry).
  boxes.push({
    id: 'desk-stretcher-back',
    label: '桌下后横梁',
    kind: 'leg',
    cx: 0,
    cz: -desk.depth / 2 + DESK_LEG_INSET_X,
    halfW: Math.max(0.05, desk.width / 2 - DESK_LEG_INSET_Z),
    halfD: 0.0175,
    yaw: 0,
    minY: minDeskY - 0.075,
    maxY: minDeskY - 0.015,
  });

  // 3. Shelf & Partitions on rectangular desk
  const shelf = deskShelfRect(desk);
  if (shelf && desk.shelf?.enabled) {
    const st = Math.min(0.024, Math.max(0.016, desk.thickness * 0.8));
    boxes.push({
      id: 'desk-shelf',
      label: '等宽层架',
      kind: 'shelf',
      cx: (shelf.minX + shelf.maxX) / 2,
      cz: (shelf.minZ + shelf.maxZ) / 2,
      halfW: (shelf.maxX - shelf.minX) / 2,
      halfD: (shelf.maxZ - shelf.minZ) / 2,
      yaw: 0,
      minY: desk.height + desk.shelf.height - st,
      maxY: desk.height + desk.shelf.height,
    });
  }

  if (!desk.return && desk.partitions) {
    const pt = 0.018;
    const ph = desk.partitions.height;
    if (desk.partitions.back) {
      boxes.push({
        id: 'partition-back',
        label: '后挡板',
        kind: 'partition',
        cx: 0,
        cz: -desk.depth / 2 - pt / 2,
        halfW: desk.width / 2,
        halfD: pt / 2,
        yaw: 0,
        minY: desk.height - desk.thickness,
        maxY: desk.height + ph,
      });
    }
    if (desk.partitions.left) {
      boxes.push({
        id: 'partition-left',
        label: '左挡板',
        kind: 'partition',
        cx: -desk.width / 2 - pt / 2,
        cz: 0,
        halfW: pt / 2,
        halfD: desk.depth / 2,
        yaw: 0,
        minY: desk.height - desk.thickness,
        maxY: desk.height + ph,
      });
    }
    if (desk.partitions.right) {
      boxes.push({
        id: 'partition-right',
        label: '右挡板',
        kind: 'partition',
        cx: desk.width / 2 + pt / 2,
        cz: 0,
        halfW: pt / 2,
        halfD: desk.depth / 2,
        yaw: 0,
        minY: desk.height - desk.thickness,
        maxY: desk.height + ph,
      });
    }
  }

  // 4. Desk back wall
  const wall = deskBackWallBounds(desk);
  if (wall) {
    boxes.push({
      id: 'desk-backwall',
      label: '桌后墙面',
      kind: 'wall',
      cx: 0,
      cz: wall.frontZ - 0.04,
      halfW: wall.width / 2,
      halfD: 0.04,
      yaw: 0,
      minY: 0,
      maxY: wall.topY + 0.5,
    });
  }

  // 5. All solid scene items
  for (const item of items) {
    if (exclude?.has(item.id)) continue;
    boxes.push(...getItemSolidBoxes(item, desk, items));
  }

  return boxes;
}

/** Checks if an oriented 2D box overlaps another, returning the minimum translation vector (dx, dz) to separate box A from B. */
function satPushOutXZ(
  ax: number,
  az: number,
  aHalfW: number,
  aHalfD: number,
  aYaw: number,
  bx: number,
  bz: number,
  bHalfW: number,
  bHalfD: number,
  bYaw: number,
  gap = 0.002,
): { dx: number; dz: number } | null {
  const axes = [
    { x: Math.cos(aYaw), z: -Math.sin(aYaw) },
    { x: Math.sin(aYaw), z: Math.cos(aYaw) },
    { x: Math.cos(bYaw), z: -Math.sin(bYaw) },
    { x: Math.sin(bYaw), z: Math.cos(bYaw) },
  ];

  const aAxes = [
    { x: Math.cos(aYaw) * (aHalfW + gap), z: -Math.sin(aYaw) * (aHalfW + gap) },
    { x: Math.sin(aYaw) * (aHalfD + gap), z: Math.cos(aYaw) * (aHalfD + gap) },
  ];
  const bAxes = [
    { x: Math.cos(bYaw) * bHalfW, z: -Math.sin(bYaw) * bHalfW },
    { x: Math.sin(bYaw) * bHalfD, z: Math.cos(bYaw) * bHalfD },
  ];

  const dx = ax - bx;
  const dz = az - bz;
  let minOverlap = Infinity;
  let bestAxis = axes[0];

  for (const axis of axes) {
    const rA =
      Math.abs(aAxes[0].x * axis.x + aAxes[0].z * axis.z) +
      Math.abs(aAxes[1].x * axis.x + aAxes[1].z * axis.z);
    const rB =
      Math.abs(bAxes[0].x * axis.x + bAxes[0].z * axis.z) +
      Math.abs(bAxes[1].x * axis.x + bAxes[1].z * axis.z);
    const dist = Math.abs(dx * axis.x + dz * axis.z);
    const overlap = rA + rB - dist;
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxis = axis;
    }
  }

  const sign = dx * bestAxis.x + dz * bestAxis.z >= 0 ? 1 : -1;
  return {
    dx: bestAxis.x * minOverlap * sign,
    dz: bestAxis.z * minOverlap * sign,
  };
}

function shouldSkipPairCollision(a: SceneItem, b: SceneItem): boolean {
  if (a.id === b.id) return true;
  if (a.kind === 'screenLamp' || b.kind === 'screenLamp') return true;
  if (a.kind === 'monitorArm' || b.kind === 'monitorArm') return true;
  // Thin mousepads allow desktop peripherals (keyboard, mouse, speakers, controller) to sit on top cleanly.
  if (
    (a.kind === 'mousepad' && b.kind !== 'mousepad') ||
    (b.kind === 'mousepad' && a.kind !== 'mousepad')
  ) {
    return true;
  }
  if (a.kind === 'laptopStand' && a.laptopStand?.laptopId === b.id) return true;
  if (b.kind === 'laptopStand' && b.laptopStand?.laptopId === a.id) return true;
  return false;
}

/**
 * Resolves a candidate item position against physical scene boundaries (backWall, partitions, desk legs)
 * and solid peer items at overlapping Y ranges so solid models cannot clip into each other.
 */
export function resolveItemPositionWithCollisions(
  item: SceneItem,
  candidate: { x: number; z: number; wallY?: number },
  desk: Desk,
  allItems: SceneItem[],
): { x: number; z: number; wallY?: number; hitObstacle?: string } {
  const probe: SceneItem = {
    ...item,
    x: candidate.x,
    z: candidate.z,
    ...(typeof candidate.wallY === 'number' ? { wallY: candidate.wallY } : {}),
  };

  let curX = candidate.x;
  let curZ = candidate.z;
  let curWallY = candidate.wallY;
  let hitObstacle: string | undefined;

  const isWallPegboard = probe.kind === 'pegboard' && probe.surface === 'wall';
  const isWallOutletWall =
    probe.kind === 'wallOutlet' &&
    probe.surface !== 'floor' &&
    (probe.wallOutlet?.mount ?? 'wall') === 'wall';

  // Wall-mounted items push out in 2D (x, wallY) against other wall-mounted items on backWall.
  if (isWallPegboard || isWallOutletWall) {
    const yBase = isWallPegboard ? desk.height : 0;
    const minWY = isWallPegboard ? 0.02 : 0.04;
    const myBottom =
      yBase + (curWallY ?? (isWallPegboard ? PEGBOARD_WALL_DEFAULT_Y : WALL_OUTLET_DEFAULT_Y));
    let curCenterY = myBottom + probe.size.height / 2;

    for (let pass = 0; pass < 4; pass++) {
      for (const other of allItems) {
        if (other.id === probe.id) continue;
        const otherWallPeg = other.kind === 'pegboard' && other.surface === 'wall';
        const otherWallOut =
          other.kind === 'wallOutlet' &&
          other.surface !== 'floor' &&
          (other.wallOutlet?.mount ?? 'wall') === 'wall';
        if (!otherWallPeg && !otherWallOut) continue;

        const obBase = otherWallPeg ? desk.height : 0;
        const obBottom =
          obBase +
          (other.wallY ?? (otherWallPeg ? PEGBOARD_WALL_DEFAULT_Y : WALL_OUTLET_DEFAULT_Y));
        const obCenterY = obBottom + other.size.height / 2;
        const pairGap = probe.kind === 'wallOutlet' && other.kind === 'wallOutlet' ? 0 : 0.004;
        const overlapX =
          probe.size.width / 2 + other.size.width / 2 + pairGap - Math.abs(curX - other.x);
        const overlapY =
          probe.size.height / 2 +
          other.size.height / 2 +
          pairGap -
          Math.abs(curCenterY - obCenterY);

        if (overlapX > 0 && overlapY > 0) {
          hitObstacle = other.name;
          if (overlapX <= overlapY) {
            curX += (curX >= other.x ? 1 : -1) * overlapX;
          } else {
            curCenterY += (curCenterY >= obCenterY ? 1 : -1) * overlapY;
          }
        }
      }
    }

    if (typeof curWallY === 'number' || typeof candidate.wallY === 'number') {
      curWallY = Math.max(
        minWY,
        Math.round((curCenterY - probe.size.height / 2 - yBase) * 1000) / 1000,
      );
    }
    return {
      x: Math.round(curX * 1000) / 1000,
      z: curZ,
      ...(typeof curWallY === 'number' ? { wallY: curWallY } : {}),
      hitObstacle,
    };
  }

  // Horizontal items (desk / shelf / floor): push out against peers + partitions + backWall + floor legs.
  const myBoxes = getItemSolidBoxes(probe, desk, allItems);
  if (!myBoxes.length) {
    return { x: curX, z: curZ, ...(typeof curWallY === 'number' ? { wallY: curWallY } : {}) };
  }

  const wall = deskBackWallBounds(desk);
  const yaw = (probe.rotation * Math.PI) / 180;
  const aabbHalfX =
    Math.abs(Math.cos(yaw)) * (probe.size.width / 2) +
    Math.abs(Math.sin(yaw)) * (probe.size.depth / 2);
  const aabbHalfZ =
    Math.abs(Math.sin(yaw)) * (probe.size.width / 2) +
    Math.abs(Math.cos(yaw)) * (probe.size.depth / 2);

  const clampBoundaries = () => {
    if (wall && curZ - aabbHalfZ < wall.frontZ + 0.002) {
      curZ = wall.frontZ + 0.002 + aabbHalfZ;
      hitObstacle ??= '桌后墙面';
    }
    if (!desk.return && desk.partitions && probe.surface !== 'floor') {
      if (desk.partitions.back && curZ - aabbHalfZ < -desk.depth / 2 + 0.002) {
        curZ = -desk.depth / 2 + 0.002 + aabbHalfZ;
        hitObstacle ??= '后挡板';
      }
      if (desk.partitions.left && curX - aabbHalfX < -desk.width / 2 + 0.002) {
        curX = -desk.width / 2 + 0.002 + aabbHalfX;
        hitObstacle ??= '左侧挡板';
      }
      if (desk.partitions.right && curX + aabbHalfX > desk.width / 2 - 0.002) {
        curX = desk.width / 2 - 0.002 - aabbHalfX;
        hitObstacle ??= '右侧挡板';
      }
    }
  };

  clampBoundaries();

  const floorLegs =
    probe.surface === 'floor'
      ? getSceneSolidBoxes({ desk, items: [] }).filter((b) => b.kind === 'leg')
      : [];

  for (let pass = 0; pass < 5; pass++) {
    for (const myBox of myBoxes) {
      const boxCx = myBox.cx + (curX - probe.x);
      const boxCz = myBox.cz + (curZ - probe.z);

      // Push away from desk legs when on floor
      for (const leg of floorLegs) {
        if (myBox.minY >= leg.maxY || myBox.maxY <= leg.minY) continue;
        const mtv = satPushOutXZ(
          boxCx,
          boxCz,
          myBox.halfW,
          myBox.halfD,
          myBox.yaw,
          leg.cx,
          leg.cz,
          leg.halfW,
          leg.halfD,
          leg.yaw,
          0.004,
        );
        if (mtv) {
          curX += mtv.dx;
          curZ += mtv.dz;
          hitObstacle ??= '桌腿';
        }
      }

      // Push away from peer items whose Y bounds intersect
      for (const other of allItems) {
        if (shouldSkipPairCollision(probe, other)) continue;
        const otherBoxes = getItemSolidBoxes(other, desk, allItems);
        for (const ob of otherBoxes) {
          if (myBox.minY >= ob.maxY - 0.002 || myBox.maxY <= ob.minY + 0.002) continue;
          const mtv = satPushOutXZ(
            myBox.cx + (curX - probe.x),
            myBox.cz + (curZ - probe.z),
            myBox.halfW,
            myBox.halfD,
            myBox.yaw,
            ob.cx,
            ob.cz,
            ob.halfW,
            ob.halfD,
            ob.yaw,
            probe.kind === 'wallOutlet' && other.kind === 'wallOutlet' ? 0 : 0.003,
          );
          if (mtv) {
            curX += mtv.dx;
            curZ += mtv.dz;
            hitObstacle ??= other.name;
          }
        }
      }
    }
    clampBoundaries();
  }

  return {
    x: Math.round(curX * 1000) / 1000,
    z: Math.round(curZ * 1000) / 1000,
    ...(typeof curWallY === 'number' ? { wallY: curWallY } : {}),
    hitObstacle,
  };
}

/** Reports names of solid obstacles/items currently overlapping `item` (used for Inspector warnings). */
export function findItemCollisions(item: SceneItem, desk: Desk, allItems: SceneItem[]): string[] {
  if (item.kind === 'screenLamp' || item.kind === 'monitorArm') return [];
  const res = resolveItemPositionWithCollisions(
    item,
    {
      x: item.x,
      z: item.z,
      ...(typeof item.wallY === 'number' ? { wallY: item.wallY } : {}),
    },
    desk,
    allItems,
  );
  if (!res.hitObstacle) return [];
  const moved =
    Math.hypot(res.x - item.x, res.z - item.z) > 0.005 ||
    (typeof item.wallY === 'number' &&
      typeof res.wallY === 'number' &&
      Math.abs(res.wallY - item.wallY) > 0.005);
  return moved ? [res.hitObstacle] : [];
}

/**
 * Magnetically snaps a single wall or floor outlet flush to neighboring outlets
 * along shared alignment axes or directly edge-to-edge when dragged close.
 */
export function snapWallOutletPosition(
  item: SceneItem,
  candidate: { x: number; z: number; wallY?: number },
  allItems: SceneItem[],
): { x: number; z: number; wallY?: number; snapped: boolean } {
  if (item.kind !== 'wallOutlet') {
    return { ...candidate, snapped: false };
  }
  const isWall = item.surface !== 'floor' && (item.wallOutlet?.mount ?? 'wall') === 'wall';
  let curX = candidate.x;
  let curZ = candidate.z;
  let curWallY = candidate.wallY;
  let snapped = false;

  const peers = allItems.filter((other) => {
    if (other.id === item.id || other.kind !== 'wallOutlet') return false;
    const otherWall = other.surface !== 'floor' && (other.wallOutlet?.mount ?? 'wall') === 'wall';
    return otherWall === isWall;
  });

  if (isWall) {
    const rawY = curWallY ?? item.wallY ?? WALL_OUTLET_DEFAULT_Y;
    let nextY = rawY;
    const snapEdgeTol = 0.025;
    const alignTol = 0.02;

    for (const peer of peers) {
      const py = peer.wallY ?? WALL_OUTLET_DEFAULT_Y;
      const pitchX = item.size.width / 2 + peer.size.width / 2;
      const pitchY = item.size.height / 2 + peer.size.height / 2;

      if (Math.abs(rawY - py) <= 0.05) {
        if (Math.abs(curX - (peer.x + pitchX)) <= snapEdgeTol) {
          curX = peer.x + pitchX;
          if (Math.abs(rawY - py) <= alignTol) nextY = py;
          snapped = true;
        } else if (Math.abs(curX - (peer.x - pitchX)) <= snapEdgeTol) {
          curX = peer.x - pitchX;
          if (Math.abs(rawY - py) <= alignTol) nextY = py;
          snapped = true;
        }
      }

      if (!snapped && Math.abs(curX - peer.x) <= alignTol) {
        curX = peer.x;
        if (Math.abs(rawY - (py + pitchY)) <= snapEdgeTol) {
          nextY = py + pitchY;
        } else if (Math.abs(rawY - (py - pitchY)) <= snapEdgeTol) {
          nextY = py - pitchY;
        }
        snapped = true;
      } else if (!snapped && Math.abs(rawY - py) <= alignTol) {
        nextY = py;
        snapped = true;
      }
      if (snapped) break;
    }

    return {
      x: Math.round(curX * 1000) / 1000,
      z: curZ,
      wallY: Math.round(nextY * 1000) / 1000,
      snapped,
    };
  }

  // Floor outlet magnetic edge-to-edge & row/column snapping
  const snapEdgeTol = 0.028;
  const alignTol = 0.022;
  for (const peer of peers) {
    const pitchX = item.size.width / 2 + peer.size.width / 2;
    const pitchZ = item.size.depth / 2 + peer.size.depth / 2;

    if (Math.abs(curZ - peer.z) <= 0.055) {
      if (Math.abs(curX - (peer.x + pitchX)) <= snapEdgeTol) {
        curX = peer.x + pitchX;
        if (Math.abs(curZ - peer.z) <= alignTol) curZ = peer.z;
        snapped = true;
      } else if (Math.abs(curX - (peer.x - pitchX)) <= snapEdgeTol) {
        curX = peer.x - pitchX;
        if (Math.abs(curZ - peer.z) <= alignTol) curZ = peer.z;
        snapped = true;
      }
    }
    if (!snapped && Math.abs(curX - peer.x) <= 0.055) {
      if (Math.abs(curZ - (peer.z + pitchZ)) <= snapEdgeTol) {
        curZ = peer.z + pitchZ;
        if (Math.abs(curX - peer.x) <= alignTol) curX = peer.x;
        snapped = true;
      } else if (Math.abs(curZ - (peer.z - pitchZ)) <= snapEdgeTol) {
        curZ = peer.z - pitchZ;
        if (Math.abs(curX - peer.x) <= alignTol) curX = peer.x;
        snapped = true;
      }
    }
    if (!snapped && Math.abs(curX - peer.x) <= alignTol) {
      curX = peer.x;
      snapped = true;
    } else if (!snapped && Math.abs(curZ - peer.z) <= alignTol) {
      curZ = peer.z;
      snapped = true;
    }
    if (snapped) break;
  }

  return {
    x: Math.round(curX * 1000) / 1000,
    z: Math.round(curZ * 1000) / 1000,
    snapped,
  };
}

/** Tests whether a 3D point lies safely inside an open pass-through cable hole (grommet or monitor stand slot). */
export function findContainingHole(
  pt: Vector3,
  radius: number,
  holes: CableHole[],
): CableHole | null {
  for (const h of holes) {
    if (h.kind === 'grommet') {
      const distXZ = Math.hypot(pt.x - h.center.x, pt.z - h.center.z);
      if (
        distXZ <= Math.max(0.004, h.radius - radius * 0.4) &&
        pt.y >= h.exit.y - 0.02 &&
        pt.y <= h.entry.y + 0.02
      ) {
        return h;
      }
    } else {
      const distXY = Math.hypot(pt.x - h.center.x, pt.y - h.center.y);
      if (distXY <= h.radius + 0.015 && Math.abs(pt.z - h.center.z) <= 0.045) {
        return h;
      }
    }
  }
  return null;
}

/**
 * Returns true when a SolidBox belongs to a cable's own plugged endpoint housing/panel
 * (excluding monitor stand baseplates & column pillars, which cables must never penetrate).
 */
function isAllowedSolidForCable(s: SolidBox, allowedItemIds: Set<string>): boolean {
  if (!s.itemId || !allowedItemIds.has(s.itemId)) return false;
  if (s.id.endsWith(':base') || s.id.includes(':col-')) return false;
  return true;
}

/**
 * Projects a single 3D cable control point / sample out of any solid collision boxes
 * (unless inside a pass-through cable hole or the endpoint device's port housing).
 */
export function projectCablePointClear(
  pt: Vector3,
  radius: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
): { point: Vector3; adjusted: boolean } {
  const out = pt.clone();
  let adjusted = false;

  // Floor clamp
  if (out.y < radius + 0.002) {
    out.y = radius + 0.002;
    adjusted = true;
  }

  const inHole = findContainingHole(out, radius, holes);

  for (let pass = 0; pass < 3; pass++) {
    for (const s of solids) {
      if (isAllowedSolidForCable(s, allowedItemIds)) continue;
      if (s.kind === 'wall') {
        const wallFrontZ = s.cx + s.halfD; // unused
        void wallFrontZ;
        const limitZ = s.cz + s.halfD + radius + 0.004;
        if (out.z < limitZ && out.y >= s.minY - radius && out.y <= s.maxY + radius) {
          out.z = limitZ;
          adjusted = true;
        }
        continue;
      }
      if (inHole?.kind === 'grommet' && s.kind === 'desk') continue;
      if (out.y < s.minY - radius || out.y > s.maxY + radius) continue;

      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const dx = out.x - s.cx;
      const dz = out.z - s.cz;
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;

      const ex = s.halfW + radius + 0.002;
      const ez = s.halfD + radius + 0.002;
      const eyMin = s.minY - radius - 0.002;
      const eyMax = s.maxY + radius + 0.002;

      if (Math.abs(lx) < ex && Math.abs(lz) < ez && out.y > eyMin && out.y < eyMax) {
        adjusted = true;
        const penX = ex - Math.abs(lx);
        const penZ = ez - Math.abs(lz);
        const penYTop = eyMax - out.y;
        const penYBot = out.y - eyMin;

        // Partitions & vertical legs always push horizontally (+Z / +/-X); horizontal stretcher bars
        // allow clearing downward underneath the beam rather than splitting across -Z/+Z faces.
        const isStretcher = s.id.startsWith('desk-stretcher-');
        const allowY = s.kind !== 'partition' && (s.kind !== 'leg' || isStretcher);
        const bestY =
          s.kind === 'desk' || s.kind === 'shelf'
            ? Math.min(penYTop, penYBot)
            : isStretcher
              ? penYBot
              : penYTop;

        if (allowY && bestY <= Math.min(penX, penZ)) {
          out.y = bestY === penYBot ? eyMin : eyMax;
        } else if (penX < penZ) {
          const newLx = (lx >= 0 ? 1 : -1) * ex;
          out.x = s.cx + newLx * c + lz * sn;
          out.z = s.cz - newLx * sn + lz * c;
        } else {
          const newLz = (lz >= 0 ? 1 : -1) * ez;
          out.x = s.cx + lx * c + newLz * sn;
          out.z = s.cz - lx * sn + newLz * c;
        }
      }
    }
  }

  return { point: out, adjusted };
}

/**
 * Subdivides interior segments of a cable path (excluding the immediate port docking stubs)
 * and resolves every sampled point outside physical obstacles without breaking hole passes.
 */
export function resolveCablePathClearance(
  rawPoints: Vector3[],
  radius: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
): { points: Vector3[]; adjusted: boolean } {
  if (rawPoints.length < 2) return { points: rawPoints, adjusted: false };
  const out: Vector3[] = [rawPoints[0].clone()];
  let adjusted = false;

  for (let i = 1; i < rawPoints.length; i++) {
    const a = rawPoints[i - 1];
    const b = rawPoints[i];
    const isPortStub = i === 1 || i === rawPoints.length - 1;
    if (isPortStub) {
      out.push(b.clone());
      continue;
    }

    const dist = a.distanceTo(b);
    const segs = Math.min(10, Math.max(1, Math.ceil(dist / 0.045)));
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const sample = new Vector3().lerpVectors(a, b, t);
      const res = projectCablePointClear(sample, radius, solids, holes, allowedItemIds);
      if (res.adjusted) adjusted = true;
      if (out[out.length - 1].distanceTo(res.point) > 0.004 || s === segs) {
        out.push(res.point);
      }
    }
  }

  return { points: out, adjusted };
}

/**
 * Tests continuous sub-samples along every cable segment against all SolidBoxes (desk rims,
 * oak corners, speakers, under-desk beams, and legs) so oblique segments never slice corners.
 */
export function resolveSegmentClearance(
  points: Vector3[],
  radius: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
): { points: Vector3[]; adjusted: boolean } {
  if (points.length < 2) return { points: points.map((p) => p.clone()), adjusted: false };
  const padRadius = radius + 0.003;

  // Step 1: Any segment jumping between above-surface and below-slab outside a grommet
  // wraps cleanly around the nearest desk/shelf edge via a smooth rounded outer arc.
  const wrapped: Vector3[] = [points[0].clone()];
  let adjusted = false;

  for (let i = 1; i < points.length; i++) {
    const a = wrapped[wrapped.length - 1];
    const b = points[i];
    const isEndStub = i === 1 || i === points.length - 1;
    if (!isEndStub) {
      for (const box of solids) {
        if (box.kind !== 'desk' && box.kind !== 'shelf') continue;
        if (box.itemId && allowedItemIds.has(box.itemId)) continue;
        const c = Math.cos(box.yaw);
        const sn = Math.sin(box.yaw);
        const aLx = (a.x - box.cx) * c - (a.z - box.cz) * sn;
        const aLz = (a.x - box.cx) * sn + (a.z - box.cz) * c;
        const bLx = (b.x - box.cx) * c - (b.z - box.cz) * sn;
        const bLz = (b.x - box.cx) * sn + (b.z - box.cz) * c;

        const aAbove = a.y >= box.maxY - 0.005;
        const bBelow = b.y < box.maxY - 0.005;
        const bAbove = b.y >= box.maxY - 0.005;
        const aBelow = a.y < box.maxY - 0.005;
        const crossesVert = (aAbove && bBelow) || (bAbove && aBelow);
        if (!crossesVert) continue;

        const tCross = Math.max(
          0,
          Math.min(1, (box.maxY - a.y) / (Math.abs(b.y - a.y) < 1e-5 ? 1e-5 : b.y - a.y)),
        );
        const crossPt = new Vector3().lerpVectors(a, b, tCross);
        if (findContainingHole(crossPt, radius, holes)?.kind === 'grommet') continue;

        const mLx = aLx + (bLx - aLx) * tCross;
        const mLz = aLz + (bLz - aLz) * tCross;
        const ex = box.halfW + padRadius + 0.006;
        const ez = box.halfD + padRadius + 0.006;
        const overlapsSlab =
          (Math.abs(mLx) < ex && Math.abs(mLz) < ez) ||
          (Math.abs(aLx) < ex && Math.abs(aLz) < ez && Math.abs(bLx) < ex && Math.abs(bLz) < ez) ||
          crossesBoxDiag(aLx, aLz, bLx, bLz, ex, ez);

        if (overlapsSlab) {
          adjusted = true;
          const distLeft = Math.abs(mLx + ex);
          const distRight = Math.abs(ex - mLx);
          const distBack = Math.abs(mLz + ez);
          const distFront = Math.abs(ez - mLz);
          const minEdge = Math.min(distLeft, distRight, distBack, distFront);

          let rimLx = mLx;
          let rimLz = mLz;
          if (minEdge === distLeft) rimLx = -ex - 0.008;
          else if (minEdge === distRight) rimLx = ex + 0.008;
          else if (minEdge === distBack) rimLz = -ez - 0.008;
          else rimLz = ez + 0.008;

          const toWorld = (lx: number, lz: number, y: number) =>
            new Vector3(box.cx + lx * c + lz * sn, y, box.cz - lx * sn + lz * c);

          const rimTopY = box.maxY + padRadius + 0.002;
          const rimBotY = box.minY - padRadius - 0.002;
          const topLx = aAbove ? (Math.abs(aLx) < ex ? mLx : aLx) : rimLx;
          const topLz = aAbove ? (Math.abs(aLz) < ez ? mLz : aLz) : rimLz;

          if (aAbove) {
            wrapped.push(
              toWorld(
                minEdge === distLeft || minEdge === distRight ? rimLx * 0.99 : topLx,
                minEdge === distBack || minEdge === distFront ? rimLz * 0.99 : topLz,
                rimTopY,
              ),
              toWorld(rimLx, rimLz, (rimTopY + rimBotY) * 0.5),
              toWorld(rimLx, rimLz, Math.min(rimBotY, b.y + 0.02)),
            );
          } else {
            wrapped.push(
              toWorld(rimLx, rimLz, Math.min(rimBotY, a.y + 0.02)),
              toWorld(rimLx, rimLz, (rimTopY + rimBotY) * 0.5),
              toWorld(
                minEdge === distLeft || minEdge === distRight ? rimLx * 0.99 : mLx,
                minEdge === distBack || minEdge === distFront ? rimLz * 0.99 : mLz,
                rimTopY,
              ),
            );
          }
          break;
        }
      }
    }
    wrapped.push(b.clone());
  }

  // Step 1b: Continuous Liang-Barsky OBB intersection wrapping for crossbars, legs, partitions,
  // stand bases, and peer items so chords never cut diagonally across opposite faces of an obstacle.
  const boxWrapped: Vector3[] = [wrapped[0].clone()];
  for (let i = 1; i < wrapped.length; i++) {
    const a = boxWrapped[boxWrapped.length - 1];
    const b = wrapped[i];
    const isEndStub = i === 1 || i === wrapped.length - 1;
    let detoured = false;
    if (!isEndStub && a.distanceToSquared(b) > 1e-6) {
      for (const box of solids) {
        if (box.kind === 'desk' || box.kind === 'shelf' || box.kind === 'wall') continue;
        if (isAllowedSolidForCable(box, allowedItemIds)) continue;
        const c = Math.cos(box.yaw);
        const sn = Math.sin(box.yaw);
        const toLocal = (p: Vector3): [number, number, number] => {
          const dx = p.x - box.cx;
          const dz = p.z - box.cz;
          return [dx * c - dz * sn, p.y, dx * sn + dz * c];
        };
        const toWorld = (lx: number, ly: number, lz: number) =>
          new Vector3(box.cx + lx * c + lz * sn, ly, box.cz - lx * sn + lz * c);

        const [ax, ay, az] = toLocal(a);
        const [bx, by, bz] = toLocal(b);
        const ex = box.halfW + padRadius + 0.002;
        const ez = box.halfD + padRadius + 0.002;
        const eyMin = box.minY - padRadius - 0.002;
        const eyMax = box.maxY + padRadius + 0.002;

        let tMin = 0;
        let tMax = 1;
        const clipAxis = (p0: number, p1: number, minB: number, maxB: number): boolean => {
          const d = p1 - p0;
          if (Math.abs(d) < 1e-8) return p0 >= minB && p0 <= maxB;
          let t0 = (minB - p0) / d;
          let t1 = (maxB - p0) / d;
          if (t0 > t1) [t0, t1] = [t1, t0];
          tMin = Math.max(tMin, t0);
          tMax = Math.min(tMax, t1);
          return tMin <= tMax;
        };

        if (
          !clipAxis(ax, bx, -ex, ex) ||
          !clipAxis(ay, by, eyMin, eyMax) ||
          !clipAxis(az, bz, -ez, ez)
        ) {
          continue;
        }
        if (tMax - tMin <= 0.002 || tMax <= 0.005 || tMin >= 0.995) continue;

        const tMid = (tMin + tMax) * 0.5;
        const midWorld = new Vector3().lerpVectors(a, b, tMid);
        if (findContainingHole(midWorld, radius, holes)) continue;

        adjusted = true;
        detoured = true;
        const mLx = ax + (bx - ax) * tMid;
        const mLz = az + (bz - az) * tMid;

        if (box.id.startsWith('desk-stretcher-')) {
          const underY = box.minY - padRadius - 0.006;
          const e1x = ax + (bx - ax) * tMin;
          const e2x = ax + (bx - ax) * tMax;
          const e1z = az + (bz - az) * tMin;
          const e2z = az + (bz - az) * tMax;
          const sideA = az >= 0 ? ez + 0.005 : -(ez + 0.005);
          const sideB = bz >= 0 ? ez + 0.005 : -(ez + 0.005);
          if (ay > underY) {
            boxWrapped.push(toWorld(e1x, Math.min(ay, underY), Math.abs(e1z) < ez ? sideA : e1z));
          } else {
            boxWrapped.push(toWorld(e1x, underY, e1z));
          }
          if (by > underY) {
            boxWrapped.push(toWorld(e2x, Math.min(by, underY), Math.abs(e2z) < ez ? sideB : e2z));
          } else {
            boxWrapped.push(toWorld(e2x, underY, e2z));
          }
        } else if (box.id.endsWith(':base')) {
          const overY = box.maxY + padRadius + 0.004;
          const e1x = ax + (bx - ax) * tMin;
          const e1z = az + (bz - az) * tMin;
          const e2x = ax + (bx - ax) * tMax;
          const e2z = az + (bz - az) * tMax;
          boxWrapped.push(toWorld(e1x, overY, e1z), toWorld(e2x, overY, e2z));
        } else {
          const penX = ex - Math.abs(mLx);
          const penZ = ez - Math.abs(mLz);
          const e1x = ax + (bx - ax) * tMin;
          const e1y = ay + (by - ay) * tMin;
          const e1z = az + (bz - az) * tMin;
          const e2x = ax + (bx - ax) * tMax;
          const e2y = ay + (by - ay) * tMax;
          const e2z = az + (bz - az) * tMax;
          if (penX < penZ) {
            const sideX = (mLx >= 0 ? 1 : -1) * (ex + 0.004);
            boxWrapped.push(toWorld(sideX, e1y, e1z), toWorld(sideX, e2y, e2z));
          } else {
            const sideZ = (mLz >= 0 ? 1 : -1) * (ez + 0.004);
            boxWrapped.push(toWorld(e1x, e1y, sideZ), toWorld(e2x, e2y, sideZ));
          }
        }
        break;
      }
    }
    boxWrapped.push(b.clone());
  }

  // Step 2: Subdivide any interior span that still grazes a SolidBox corner
  const out: Vector3[] = [boxWrapped[0].clone()];
  for (let i = 1; i < boxWrapped.length; i++) {
    const a = boxWrapped[i - 1];
    const b = boxWrapped[i];
    const isEndStub = i === 1 || i === wrapped.length - 1;
    if (isEndStub) {
      out.push(b.clone());
      continue;
    }

    const dist = a.distanceTo(b);
    const segs = Math.min(32, Math.max(1, Math.ceil(dist / 0.008)));
    for (let s = 1; s <= segs; s++) {
      const sample = new Vector3().lerpVectors(a, b, s / segs);
      const res = projectCablePointClear(sample, padRadius, solids, holes, allowedItemIds);
      if (res.adjusted) adjusted = true;
      if (s === segs || (res.adjusted && out[out.length - 1].distanceTo(res.point) > 0.006)) {
        out.push(res.point);
      }
    }
  }

  return { points: out, adjusted };
}

function crossesBoxDiag(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  ex: number,
  ez: number,
): boolean {
  for (const t of [0.25, 0.5, 0.75]) {
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (Math.abs(x) < ex && Math.abs(z) < ez) return true;
  }
  return false;
}

function isPointInsideSolidBox(
  wx: number,
  wy: number,
  wz: number,
  box: SolidBox,
  margin = 0.002,
): boolean {
  if (wy < box.minY - margin || wy > box.maxY + margin) return false;
  const dx = wx - box.cx;
  const dz = wz - box.cz;
  const c = Math.cos(box.yaw);
  const s = Math.sin(box.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= box.halfW + margin && Math.abs(lz) <= box.halfD + margin;
}

/**
 * Checks whether a monitor's 3D articulated pose (yaw rotation, pitch tilt, roll pivot, and lift height)
 * causes any part of the screen panel, mounted lamp, or stand base to clip into:
 * - the support surface (desktop or shelf top),
 * - its own stand column / stand base (when not on a monitor arm),
 * - the back wall or desk partitions,
 * - the desk shelf slab, or
 * - any other solid 3D item in the scene.
 * Returns the Chinese obstacle label if clipping occurs, or null if collision-free.
 */
export function checkMonitorPoseCollision(
  item: SceneItem,
  desk: Desk,
  allItems: SceneItem[],
): string | null {
  if (item.kind !== 'monitor') return null;

  const baseY = itemWorldY(desk, item, allItems);
  const yaw = (item.rotation * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const mounted = isMonitorMountedOnArm(item.id, allItems);
  const parts = monitorParts(item.size, item.monitor?.model);
  const pose = monitorPose(item.size, { ...item, hasMonitorArm: mounted });
  const tier = monitorBaseTier(item.size, item.monitor);
  const isStudio = item.monitor?.model === 'studioDisplay';

  const basePanelY = parts.standHeight + parts.panelHeight / 2;
  const panelY = pose.pivotY + parts.panelHeight / 2;
  const panelZ = -0.02 + pose.pivotZOffset;
  const halfW = item.size.width / 2;
  const halfH = parts.panelHeight / 2;

  const pitchRad = (pose.pitchDeg * Math.PI) / 180;
  const screenYawRad = (pose.screenYawDeg * Math.PI) / 180;
  const rollRad = (pose.rollDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosSY = Math.cos(screenYawRad);
  const sinSY = Math.sin(screenYawRad);
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);

  // Stock stand column / L-arm physical volume bounds in monitor-local coordinates
  const dellColTopY = basePanelY + MAX_LIFT + 0.022;
  const dellColHalfW = tier.columnWidth / 2;
  const isStudioHeight = item.monitor?.standType === 'height';
  const studioArmBottomZ = -0.025 - tier.baseDepth * 0.34;
  const studioArmTopZ = -0.044;
  const studioArmBottomY = 0.004;
  const studioArmTopY = basePanelY + (isStudioHeight ? STUDIO_MAX_LIFT + 0.016 : 0.01);
  const studioArmHalfD = isStudioHeight ? 0.0051 : 0.0041;

  const hitsStandColumnOrBase = (mx: number, my: number, mz: number): string | null => {
    if (mounted) return null;
    if (!isStudio) {
      if (my >= 0.008 && my <= dellColTopY + 0.003 && Math.abs(mx) <= dellColHalfW + 0.003) {
        const colCenterZ = -0.072 + Math.tan(DELL_COLUMN_LEAN_RAD) * (my - 0.008);
        const colFrontZ = colCenterZ + 0.0105 + 0.002;
        const colRearZ = colCenterZ - 0.0105 - 0.03;
        if (mz <= colFrontZ && mz >= colRearZ) {
          return '支架立柱';
        }
      }
      if (
        my < 0.011 &&
        Math.abs(mx) <= tier.baseWidth * 0.45 &&
        mz <= -0.072 + tier.baseDepth * 0.78 &&
        mz >= -0.1
      ) {
        return '显示器底座';
      }
    } else {
      if (
        my >= studioArmBottomY &&
        my <= studioArmTopY + 0.002 &&
        Math.abs(mx) <= dellColHalfW + 0.003
      ) {
        const slideT = Math.max(
          0,
          Math.min(1, (my - studioArmBottomY) / Math.max(0.05, studioArmTopY - studioArmBottomY)),
        );
        const armCenterZ = studioArmBottomZ + (studioArmTopZ - studioArmBottomZ) * slideT;
        const armFrontZ = armCenterZ + studioArmHalfD + 0.0008;
        const armRearZ = armCenterZ - studioArmHalfD - 0.03;
        if (mz <= armFrontZ && mz >= armRearZ) {
          return '支架立柱';
        }
      }
      if (
        my < 0.008 &&
        Math.abs(mx) <= tier.baseWidth * 0.48 &&
        mz <= -0.025 + tier.baseDepth * 0.48 &&
        mz >= -0.025 - tier.baseDepth * 0.48
      ) {
        return '显示器底座';
      }
    }
    return null;
  };

  const wall = deskBackWallBounds(desk);
  const checkPartitions = !desk.return && desk.partitions && item.surface !== 'floor';
  const partMaxY = desk.height + (desk.partitions?.height ?? 0);

  // Collect obstacle SolidBoxes (shelf slabs when monitor is on desk, plus peer items)
  const obstacleBoxes: { box: SolidBox; label: string }[] = [];
  if (item.surface !== 'shelf' && desk.shelf?.enabled) {
    for (const sb of getSceneSolidBoxes({ desk, items: [] })) {
      if (sb.kind === 'shelf') {
        obstacleBoxes.push({ box: sb, label: '等宽层架' });
      }
    }
  }
  for (const other of allItems) {
    if (shouldSkipPairCollision(item, other)) continue;
    for (const ob of getItemSolidBoxes(other, desk, allItems)) {
      obstacleBoxes.push({ box: ob, label: other.name });
    }
  }

  // 2. Check stand base corners against wall, partitions, and peer items when yaw rotates
  if (!mounted) {
    const bw = (tier.baseWidth * 0.9) / 2;
    const bd = (tier.baseDepth * 0.9) / 2;
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const mx = sx * bw;
        const mz = sz * bd;
        const wx = item.x + mx * cosY + mz * sinY;
        const wz = item.z - mx * sinY + mz * cosY;
        const wy = baseY + 0.006;
        if (wall && wz < wall.frontZ + 0.002) return '桌后墙面';
        if (checkPartitions && desk.partitions && wy <= partMaxY) {
          if (desk.partitions.back && wz < -desk.depth / 2 + 0.002) return '后挡板';
          if (desk.partitions.left && wx < -desk.width / 2 + 0.002) return '左侧挡板';
          if (desk.partitions.right && wx > desk.width / 2 - 0.002) return '右侧挡板';
        }
      }
    }
  }

  // 3. Dense 3D sampling across the articulated screen panel (front bezel & true rear dome/shell)
  const supportLabel = item.surface === 'shelf' ? '等宽层架' : '桌面';
  const uSteps = [
    -1, -0.82, -0.65, -0.5, -0.35, -0.24, -0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18, 0.24, 0.35, 0.5,
    0.65, 0.82, 1,
  ];
  const vSteps = [
    -1, -0.85, -0.7, -0.55, -0.45, -0.35, -0.25, -0.15, -0.05, 0, 0.05, 0.15, 0.25, 0.35, 0.45,
    0.55, 0.7, 0.85, 1,
  ];
  const rearZAt = (px: number, py: number): number => {
    if (isStudio) return -0.0176;
    const ux = Math.min(1, Math.abs(px) / Math.max(0.05, halfW));
    const uy = Math.min(1, Math.abs(py) / Math.max(0.05, halfH));
    const wx = Math.cos((ux * Math.PI) / 2);
    const wy = Math.cos((uy * Math.PI) / 2);
    const dome = 0.0012 - 0.0428 * Math.pow(wx, 0.7) * Math.pow(wy, 0.72);
    return Math.abs(px) <= 0.06 && Math.abs(py) <= 0.06 ? Math.min(dome, -0.0385) : dome;
  };

  for (const u of uSteps) {
    const px = u * halfW;
    for (const v of vSteps) {
      const py = v * halfH;
      const rx1 = px * cosR - py * sinR;
      const ry1 = px * sinR + py * cosR;
      const zSteps = [rearZAt(px, py), 0.013];
      for (const pz of zSteps) {
        const y2 = ry1 * cosP - pz * sinP;
        const z2 = ry1 * sinP + pz * cosP;
        const mx = rx1 * cosSY + z2 * sinSY;
        const my = panelY + y2;
        const mz = panelZ - rx1 * sinSY + z2 * cosSY;

        // Support surface (desk / shelf top) anti-clipping
        if (my < 0.001) {
          return supportLabel;
        }

        // Stock stand column & base self-collision
        const standHit = hitsStandColumnOrBase(mx, my, mz);
        if (standHit) {
          return standHit;
        }

        const wx = item.x + mx * cosY + mz * sinY;
        const wy = baseY + my;
        const wz = item.z - mx * sinY + mz * cosY;

        if (wall && wz < wall.frontZ + 0.002) {
          return '桌后墙面';
        }
        if (checkPartitions && desk.partitions && wy <= partMaxY) {
          if (desk.partitions.back && wz < -desk.depth / 2 + 0.002) return '后挡板';
          if (desk.partitions.left && wx < -desk.width / 2 + 0.002) return '左侧挡板';
          if (desk.partitions.right && wx > desk.width / 2 - 0.002) return '右侧挡板';
        }

        for (const { box, label } of obstacleBoxes) {
          if (isPointInsideSolidBox(wx, wy, wz, box, 0.002)) {
            return label;
          }
        }
      }
    }
  }

  // 4. If a screenLamp is mounted on this monitor, check its top light bar endpoints too
  const hostedLamp = allItems.find(
    (other) => other.kind === 'screenLamp' && other.lamp?.monitorId === item.id,
  );
  if (hostedLamp) {
    const lampHalfW = hostedLamp.size.width / 2;
    const py = halfH + 0.022;
    const pz = 0.035;
    for (const lx of [-lampHalfW, 0, lampHalfW]) {
      const rx1 = lx * cosR - py * sinR;
      const ry1 = lx * sinR + py * cosR;
      const y2 = ry1 * cosP - pz * sinP;
      const z2 = ry1 * sinP + pz * cosP;
      const mx = rx1 * cosSY + z2 * sinSY;
      const my = panelY + y2;
      const mz = panelZ - rx1 * sinSY + z2 * cosSY;
      if (my < 0.001) return supportLabel;
      const lampStandHit = hitsStandColumnOrBase(mx, my, mz);
      if (lampStandHit) return lampStandHit;
      const wx = item.x + mx * cosY + mz * sinY;
      const wy = baseY + my;
      const wz = item.z - mx * sinY + mz * cosY;
      if (wall && wz < wall.frontZ + 0.002) return '桌后墙面';
      for (const { box, label } of obstacleBoxes) {
        if (isPointInsideSolidBox(wx, wy, wz, box, 0.002)) {
          return label;
        }
      }
    }
  }

  // 5. SAT check between monitor SolidBox slices (base, column, articulated panel slices) and obstacle boxes
  const myBoxes = getItemSolidBoxes(item, desk, allItems);
  for (const mb of myBoxes) {
    for (const { box: ob, label } of obstacleBoxes) {
      if (mb.maxY <= ob.minY + 0.002 || mb.minY >= ob.maxY - 0.002) continue;
      const push = satPushOutXZ(
        mb.cx,
        mb.cz,
        mb.halfW,
        mb.halfD,
        mb.yaw,
        ob.cx,
        ob.cz,
        ob.halfW,
        ob.halfD,
        ob.yaw,
        0.001,
      );
      if (push) {
        return label;
      }
    }
  }

  return null;
}

/**
 * Constrains a candidate monitor pose update (`rotation`, `pitch`, `roll`, `lift`) so the screen
 * and stand stop cleanly at the first physical contact angle without clipping into the desk,
 * stand column, wall, partitions, shelf, or nearby 3D items.
 */
export function constrainMonitorPose(
  currentItem: SceneItem,
  patch: Partial<SceneItem>,
  desk: Desk,
  allItems: SceneItem[],
): { item: SceneItem; hitObstacle?: string } {
  const target: SceneItem = { ...currentItem, ...patch };
  if (currentItem.kind !== 'monitor') {
    return { item: target };
  }

  const startRot = currentItem.rotation;
  const endRot = target.rotation;
  let dRot = endRot - startRot;
  if (Math.abs(dRot) > 180 && Math.abs(dRot) < 360) {
    dRot -= Math.sign(dRot) * 360;
  }

  const startPitch = currentItem.pitch ?? 0;
  const endPitch = target.pitch ?? startPitch;
  const startScreenYaw = currentItem.screenYaw ?? 0;
  const endScreenYaw = target.screenYaw ?? startScreenYaw;
  const startRoll = currentItem.roll ?? 0;
  const endRoll = target.roll ?? startRoll;
  const startLift = currentItem.lift ?? 0;
  const endLift = target.lift ?? startLift;

  const hasPoseChange =
    Math.abs(dRot) > 1e-4 ||
    Math.abs(endScreenYaw - startScreenYaw) > 1e-4 ||
    Math.abs(endPitch - startPitch) > 1e-4 ||
    Math.abs(endRoll - startRoll) > 1e-4 ||
    Math.abs(endLift - startLift) > 1e-5;

  if (!hasPoseChange) {
    return { item: target };
  }

  const poseAt = (t: number): SceneItem => ({
    ...target,
    rotation: Math.round((startRot + dRot * t) * 10) / 10,
    ...(typeof target.screenYaw === 'number' || typeof currentItem.screenYaw === 'number'
      ? {
          screenYaw: Math.round((startScreenYaw + (endScreenYaw - startScreenYaw) * t) * 10) / 10,
        }
      : {}),
    ...(typeof target.pitch === 'number' || typeof currentItem.pitch === 'number'
      ? { pitch: Math.round((startPitch + (endPitch - startPitch) * t) * 10) / 10 }
      : {}),
    ...(typeof target.roll === 'number' || typeof currentItem.roll === 'number'
      ? { roll: Math.round((startRoll + (endRoll - startRoll) * t) * 10) / 10 }
      : {}),
    ...(typeof target.lift === 'number' || typeof currentItem.lift === 'number'
      ? { lift: Math.round((startLift + (endLift - startLift) * t) * 1000) / 1000 }
      : {}),
  });

  const allWithPose = (probe: SceneItem) => allItems.map((it) => (it.id === probe.id ? probe : it));

  const startHit = checkMonitorPoseCollision(currentItem, desk, allWithPose(currentItem));
  const targetHit = checkMonitorPoseCollision(target, desk, allWithPose(target));

  if (startHit !== null && targetHit === null) {
    return { item: target };
  }

  // If discrete jump to +/-90 deg portrait roll has a clean target state and only momentarily dips
  // the diagonal corner near the desk surface, allow the discrete portrait jump.
  const isDiscretePortraitJump =
    targetHit === null &&
    Math.abs(Math.abs(endRoll) - 90) < 0.5 &&
    Math.abs(endRoll - startRoll) >= 44.5;

  const steps = 28;
  let lastValidT = 0;
  let firstFailT = 1;
  let hitObstacle: string | undefined;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const probe = poseAt(t);
    const hit = checkMonitorPoseCollision(probe, desk, allWithPose(probe));
    if (hit !== null) {
      if (
        isDiscretePortraitJump &&
        (hit === '桌面' || hit === '等宽层架' || hit === '显示器底座')
      ) {
        continue;
      }
      firstFailT = t;
      hitObstacle = hit;
      break;
    }
    lastValidT = t;
  }

  if (!hitObstacle) {
    return { item: target };
  }

  if (startHit !== null) {
    return { item: currentItem, hitObstacle: startHit };
  }

  let lo = lastValidT;
  let hi = firstFailT;
  for (let iter = 0; iter < 12; iter++) {
    const mid = (lo + hi) / 2;
    const probe = poseAt(mid);
    const hit = checkMonitorPoseCollision(probe, desk, allWithPose(probe));
    if (hit === null) {
      lo = mid;
    } else {
      hi = mid;
      hitObstacle = hit;
    }
  }

  return { item: poseAt(lo), hitObstacle };
}

function isEnvelopePointInsideSolidBox(
  wx: number,
  wy: number,
  wz: number,
  box: SolidBox,
  rH: number,
  rDown: number,
  rUp: number,
): boolean {
  if (wy + rUp < box.minY || wy - rDown > box.maxY) return false;
  const dx = wx - box.cx;
  const dz = wz - box.cz;
  const c = Math.cos(box.yaw);
  const s = Math.sin(box.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= box.halfW + rH && Math.abs(lz) <= box.halfD + rH;
}

function checkLaptopTrayCollision(
  arm: SceneItem,
  target: SceneItem,
  desk: Desk,
  obstacles: { box: SolidBox; label: string }[],
): string | null {
  const elev = arm.monitorArm?.trayElevation ?? DEFAULT_TRAY_ELEVATION;
  const tiltRad = ((arm.monitorArm?.trayTiltDeg ?? DEFAULT_TRAY_TILT_DEG) * Math.PI) / 180;
  const yaw = (target.rotation * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  const halfW = Math.max(0.14, target.size.width / 2);
  const halfD = Math.max(0.11, target.size.depth / 2);
  const centerY = desk.height + elev + target.size.depth * 0.5 * sinT * 0.35;
  const rects = deskSupportRects(desk);
  const wall = deskBackWallBounds(desk);
  const checkPartitions = !desk.return && Boolean(desk.partitions);
  const partMaxY = desk.height + (desk.partitions?.height ?? 0);

  for (const sx of [-1, 0, 1] as const) {
    for (const sz of [-1, 0, 1] as const) {
      const lx = sx * halfW;
      const lzLocal = sz * halfD;
      const lyTilt = -lzLocal * sinT - 0.012;
      const lzTilt = lzLocal * cosT;
      const wx = target.x + lx * cosY + lzTilt * sinY;
      const wy = centerY + lyTilt;
      const wz = target.z - lx * sinY + lzTilt * cosY;

      const overDesk = rects.some(
        (r) =>
          wx >= r.minX - 0.01 && wx <= r.maxX + 0.01 && wz >= r.minZ - 0.01 && wz <= r.maxZ + 0.01,
      );
      if (overDesk && wy < desk.height + 0.01) return '桌面';
      if (wall && wz < wall.frontZ + 0.002) return '桌后墙面';
      if (checkPartitions && desk.partitions && wy <= partMaxY) {
        if (desk.partitions.back && wz < -desk.depth / 2 + 0.002) return '后挡板';
        if (desk.partitions.left && wx < -desk.width / 2 + 0.002) return '左侧挡板';
        if (desk.partitions.right && wx > desk.width / 2 - 0.002) return '右侧挡板';
      }
      for (const { box, label } of obstacles) {
        if (isEnvelopePointInsideSolidBox(wx, wy, wz, box, 0.006, 0.006, 0.04)) {
          return label;
        }
      }
    }
  }
  return null;
}

/**
 * Checks whether a monitor arm branch (lower link, elbow joint, upper gas-spring link, and its
 * mounted monitor or laptop tray) collides with the desktop, inverted gantry crossbeam, back wall,
 * shelf slabs, nearby desktop objects (e.g. speakers), dual-arm sibling links, or its own screen.
 */
export function checkMonitorArmCollision(
  arm: SceneItem,
  role: 'primary' | 'secondary',
  desk: Desk,
  allItems: SceneItem[],
): string | null {
  if (arm.kind !== 'monitorArm' || !arm.monitorArm) return null;
  const sys = computeMonitorArmSystem(arm, allItems, desk);
  const branch = sys.branches.find((b) => b.role === role);
  if (!branch) return null;

  const excludedIds = new Set<string>([arm.id, branch.target.id]);
  for (const it of allItems) {
    if (it.kind === 'mousepad') excludedIds.add(it.id);
    if (it.kind === 'screenLamp' && it.lamp?.monitorId === branch.target.id) {
      excludedIds.add(it.id);
    }
  }

  const rawBoxes = getSceneSolidBoxes({ desk, items: allItems }, { excludeItemIds: excludedIds });
  const obstacleBoxes: { box: SolidBox; label: string }[] = rawBoxes
    .filter((b) => b.kind !== 'desk' && b.kind !== 'leg')
    .map((box) => ({ box, label: box.label }));

  // 1. Check carried display or laptop tray against desktop, wall, shelf, and peer items
  if (branch.targetType === 'monitor') {
    const monHit = checkMonitorPoseCollision(branch.target, desk, allItems);
    if (monHit) return monHit;
  } else {
    const trayHit = checkLaptopTrayCollision(arm, branch.target, desk, obstacleBoxes);
    if (trayHit) return trayHit;
  }

  // Separate tight body boxes of the mounted target so distal upper-arm near VESA doesn't false-trigger
  const targetPanelBoxes =
    branch.targetType === 'monitor'
      ? getItemSolidBoxes(branch.target, desk, allItems)
          .filter((b) => b.id.includes(':panel'))
          .map((box) => ({ box, label: branch.target.name }))
      : [];

  const rects = deskSupportRects(desk);
  const railZ = sys.basePos.z - 0.004;

  const checkArmPoint = (
    pt: Vector3,
    rH: number,
    rDown: number,
    rUp: number,
    skipOwnPanel: boolean,
  ): string | null => {
    const overDesk = rects.some(
      (r) =>
        pt.x >= r.minX - rH && pt.x <= r.maxX + rH && pt.z >= r.minZ - rH && pt.z <= r.maxZ + rH,
    );
    if (overDesk && pt.y - rDown < desk.height + 0.008) {
      return '桌面';
    }

    if (sys.isInverted) {
      const beamBox: SolidBox = {
        id: 'gantry-beam',
        label: '倒挂横梁',
        kind: 'partition',
        cx: (sys.gantryLeftX + sys.gantryRightX) / 2,
        cz: railZ,
        halfW: Math.max(0.2, (sys.gantryRightX - sys.gantryLeftX) / 2) + 0.024,
        halfD: 0.02,
        yaw: 0,
        minY: sys.basePos.y,
        maxY: sys.basePos.y + 0.032,
      };
      if (isEnvelopePointInsideSolidBox(pt.x, pt.y, pt.z, beamBox, rH, rDown, rUp)) {
        return '倒挂横梁';
      }
      for (const postX of [sys.gantryLeftX, sys.gantryRightX]) {
        const postBox: SolidBox = {
          id: `gantry-post-${postX}`,
          label: '倒挂横梁',
          kind: 'partition',
          cx: postX,
          cz: railZ,
          halfW: 0.015,
          halfD: 0.015,
          yaw: 0,
          minY: desk.height,
          maxY: sys.basePos.y,
        };
        if (isEnvelopePointInsideSolidBox(pt.x, pt.y, pt.z, postBox, rH, rDown, rUp)) {
          return '倒挂横梁';
        }
      }
    }

    for (const { box, label } of obstacleBoxes) {
      if (isEnvelopePointInsideSolidBox(pt.x, pt.y, pt.z, box, rH, rDown, rUp)) {
        return label;
      }
    }

    if (!skipOwnPanel) {
      for (const { box, label } of targetPanelBoxes) {
        if (
          isEnvelopePointInsideSolidBox(pt.x, pt.y, pt.z, box, rH * 0.65, rDown * 0.65, rUp * 0.65)
        ) {
          return label;
        }
      }
    }

    return null;
  };

  // 2. Sample lower link (columnTop -> elbowPos), elbow joint cylinder, and upper gas-spring link
  const p = new Vector3();
  for (const t of [0.22, 0.42, 0.62, 0.82]) {
    p.lerpVectors(branch.columnTop, branch.elbowPos, t);
    const hit = checkArmPoint(p, 0.019, 0.024, 0.016, false);
    if (hit) return hit;
  }

  const elbowHit = checkArmPoint(branch.elbowPos, 0.024, 0.025, 0.025, false);
  if (elbowHit) return elbowHit;

  for (const t of [0.16, 0.34, 0.52]) {
    p.lerpVectors(branch.elbowPos, branch.vesaHeadPos, t);
    const hit = checkArmPoint(p, 0.02, 0.024, 0.018, false);
    if (hit) return hit;
  }
  for (const t of [0.68, 0.84]) {
    p.lerpVectors(branch.elbowPos, branch.vesaHeadPos, t);
    const hit = checkArmPoint(p, 0.018, 0.024, 0.018, true);
    if (hit) return hit;
  }

  // 3. In dual-arm mode, guard against links or elbows crossing directly through the sibling arm
  const sibling = sys.branches.find((b) => b.role !== role);
  if (sibling) {
    const samplePts = (b: ArmBranchKinematics): Vector3[] => [
      new Vector3().lerpVectors(b.columnTop, b.elbowPos, 0.55),
      new Vector3().lerpVectors(b.columnTop, b.elbowPos, 0.8),
      b.elbowPos.clone(),
      new Vector3().lerpVectors(b.elbowPos, b.vesaHeadPos, 0.3),
      new Vector3().lerpVectors(b.elbowPos, b.vesaHeadPos, 0.6),
    ];
    const ptsA = samplePts(branch);
    const ptsB = samplePts(sibling);
    for (const a of ptsA) {
      for (const b of ptsB) {
        if (a.distanceTo(b) < 0.04) {
          return '另一侧支臂';
        }
      }
    }
  }

  return null;
}

export function solveArmLowerPitchWithCollision({
  arm,
  branch,
  desiredPitchDeg,
  desk,
  allItems,
  collisionEnabled,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  desiredPitchDeg: number;
  desk: Desk;
  allItems: SceneItem[];
  collisionEnabled: boolean;
}) {
  return solveLowerArmPitch({
    arm,
    branch,
    desiredPitchDeg,
    allItems,
    canAccept: collisionEnabled
      ? (cand) => checkMonitorArmCollision(cand.arm, cand.role, desk, cand.items)
      : undefined,
  });
}

export function solveArmUpperPitchWithCollision({
  arm,
  branch,
  desiredUpperPitchDeg,
  desk,
  allItems,
  collisionEnabled,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  desiredUpperPitchDeg: number;
  desk: Desk;
  allItems: SceneItem[];
  collisionEnabled: boolean;
}) {
  return solveUpperArmPitch({
    arm,
    branch,
    desiredUpperPitchDeg,
    allItems,
    canAccept: collisionEnabled
      ? (cand) => checkMonitorArmCollision(cand.arm, cand.role, desk, cand.items)
      : undefined,
  });
}

export function solveArmElbowSwivelWithCollision({
  arm,
  branch,
  desiredYawDeg,
  desk,
  allItems,
  collisionEnabled,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  desiredYawDeg: number;
  desk: Desk;
  allItems: SceneItem[];
  collisionEnabled: boolean;
}) {
  return solveHorizontalElbowSwivel({
    arm,
    branch,
    desiredYawDeg,
    allItems,
    canAccept: collisionEnabled
      ? (cand) => checkMonitorArmCollision(cand.arm, cand.role, desk, cand.items)
      : undefined,
  });
}

function checkMonitorArmBaseFootprintCollision(
  arm: SceneItem,
  desk: Desk,
  allItems: SceneItem[],
): string | null {
  if (arm.kind !== 'monitorArm' || !arm.monitorArm) return null;
  const sys = computeMonitorArmSystem(arm, allItems, desk);
  if (sys.isInverted) return null;

  const plateHalfW = (sys.isDual ? 0.122 : 0.088) / 2;
  const plateHalfD = (sys.isDual ? 0.092 : 0.088) / 2;
  const baseMinY = sys.basePos.y;
  const baseMaxY = sys.basePos.y + 0.088;

  const excludedIds = new Set<string>([arm.id]);
  for (const b of sys.branches) {
    excludedIds.add(b.target.id);
    for (const it of allItems) {
      if (it.kind === 'screenLamp' && it.lamp?.monitorId === b.target.id) {
        excludedIds.add(it.id);
      }
    }
  }
  for (const it of allItems) {
    if (it.kind === 'mousepad') excludedIds.add(it.id);
  }

  const solids = getSceneSolidBoxes({ desk, items: allItems }, { excludeItemIds: excludedIds });
  for (const ob of solids) {
    if (ob.kind === 'desk' || ob.kind === 'leg') continue;
    // Allow C-clamp to hug the desk edge even if a back partition skirt sits flush at -depth/2
    if (ob.kind === 'partition' && sys.clampEdge === 'back' && ob.id === 'partition-back') {
      continue;
    }
    if (baseMaxY <= ob.minY + 0.002 || baseMinY >= ob.maxY - 0.002) continue;
    const hit = satPushOutXZ(
      sys.basePos.x,
      sys.basePos.z,
      plateHalfW,
      plateHalfD,
      sys.baseYaw,
      ob.cx,
      ob.cz,
      ob.halfW,
      ob.halfD,
      ob.yaw,
      0.002,
    );
    if (hit) return ob.label;
  }
  return null;
}

export function checkMonitorArmBaseCollision(
  arm: SceneItem,
  desk: Desk,
  allItems: SceneItem[],
): string | null {
  const footHit = checkMonitorArmBaseFootprintCollision(arm, desk, allItems);
  if (footHit) return footHit;
  const sys = computeMonitorArmSystem(arm, allItems, desk);
  for (const b of sys.branches) {
    const branchHit = checkMonitorArmCollision(arm, b.role, desk, allItems);
    if (branchHit) return branchHit;
  }
  return null;
}

export function solveArmBaseMoveWithCollision({
  arm,
  desk,
  allItems,
  desiredX,
  desiredZ,
  forcedEdge,
  snapToEdges = true,
  collisionEnabled,
}: {
  arm: SceneItem;
  desk: Desk;
  allItems: SceneItem[];
  desiredX: number;
  desiredZ: number;
  forcedEdge?: ArmClampEdge;
  snapToEdges?: boolean;
  collisionEnabled: boolean;
}) {
  return solveArmBaseMove({
    arm,
    desk,
    allItems,
    desiredX,
    desiredZ,
    forcedEdge,
    snapToEdges,
    canAccept: collisionEnabled
      ? (cand) => checkMonitorArmBaseCollision(cand.arm, desk, cand.items)
      : undefined,
  });
}

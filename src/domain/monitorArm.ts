// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { deskBounds, deskSupportRects, grommetPosition } from './desk';
import {
  armPrimaryLaptopId,
  armPrimaryMonitorId,
  armSecondaryLaptopId,
  armSecondaryMonitorId,
  DEFAULT_INVERTED_HEIGHT,
  DEFAULT_TRAY_ELEVATION,
  DEFAULT_TRAY_TILT_DEG,
  findArmForTrayLaptop,
  type ArmClampEdge,
  type MonitorArmSettings,
} from './laptop';
import { ARM_MAX_LIFT, ARM_MIN_LIFT, monitorParts, monitorPose } from './monitor';
import { itemWorldY } from './placement';
import type { Desk, SceneItem } from './project';

const WORLD_UP = new Vector3(0, 1, 0);

/** Fixed factory geometry specs for 1:1 NB F80 / F160 gas-spring monitor arm kinematics. */
export const ARM_LOWER_LENGTH = 0.275;
export const ARM_LOWER_RISE = 0.145;
export const ARM_LOWER_HORIZ = Math.sqrt(ARM_LOWER_LENGTH ** 2 - ARM_LOWER_RISE ** 2);
export const ARM_LOWER_DEFAULT_PITCH_DEG =
  (Math.asin(ARM_LOWER_RISE / ARM_LOWER_LENGTH) * 180) / Math.PI;
export const ARM_LOWER_PITCH_MIN_DEG = -8;
export const ARM_LOWER_PITCH_MAX_DEG = 70;
export const ARM_UPPER_LENGTH = 0.305;
export const ARM_UPPER_PITCH_MIN_DEG = -62;
export const ARM_UPPER_PITCH_MAX_DEG = 62;
export const ARM_TRAY_MIN_ELEVATION = 0.06;
export const ARM_TRAY_MAX_ELEVATION = 0.68;
export const ARM_VESA_OFFSET_MONITOR = 0.038;
export const ARM_VESA_OFFSET_TRAY = 0.036;
export const ARM_TURRET_HEIGHT_UPRIGHT = 0.085;
export const ARM_TURRET_HEIGHT_INVERTED = 0.095;
export const ARM_MIN_REACH_XZ = 0.085;
export const ARM_MAX_DY = 0.27;
export const ARM_REAR_CLEARANCE = 0.06;
export const ARM_DUAL_SOCKET_OFFSET = 0.029;

export type ArmLimitReason =
  | 'maxReach'
  | 'minReach'
  | 'rearStop'
  | 'heightLimit'
  | 'lowerPitchLimit'
  | 'upperPitchLimit'
  | 'deskClearance'
  | 'armObstacle';

export type ElbowBendMode = 'auto' | 'left' | 'right';

export type MonitorArmKinematics = {
  basePos: Vector3;
  columnTop: Vector3;
  elbowPos: Vector3;
  lowerYawDeg: number;
  lowerPitchDeg: number;
  upperPitchDeg: number;
  lowerHoriz: number;
  upperHoriz: number;
  elbowBend: ElbowBendMode;
  elbowActiveSide: 'left' | 'right';
  vesaHeadPos: Vector3;
  vesaPos: Vector3;
  vesaNormal: Vector3;
  clipPoints: Vector3[];
  dMin: number;
  dMax: number;
  reachDistance: number;
  reachRatio: number;
  clamped: boolean;
  limitReason?: ArmLimitReason;
};

export type ArmBranchKinematics = MonitorArmKinematics & {
  role: 'primary' | 'secondary';
  targetType: 'monitor' | 'laptopTray';
  target: SceneItem;
  turretBase: Vector3;
  clampEdge: ArmClampEdge;
  baseYaw: number;
  inwardX: number;
  inwardZ: number;
  rearStop: EdgeStop;
};

export type EdgeStop =
  | { axis: 'minZ'; limit: number }
  | { axis: 'minX'; limit: number }
  | { axis: 'maxX'; limit: number };

export type MonitorArmSystemKinematics = {
  basePos: Vector3;
  clampX: number;
  clampZ: number;
  clampEdge: ArmClampEdge;
  baseYaw: number;
  isDual: boolean;
  isInverted: boolean;
  invertedHeight: number;
  gantryLeftX: number;
  gantryRightX: number;
  branches: ArmBranchKinematics[];
};

export type DragPreviewState =
  | {
      kind?: 'position';
      id: string;
      x: number;
      z: number;
      wallY?: number;
      limitReason?: ArmLimitReason;
      maxReachCm?: number;
    }
  | {
      kind: 'rotation';
      id: string;
      rotation: number;
      hitObstacle?: string;
    }
  | {
      kind: 'pose';
      id: string;
      axis: 'pitch' | 'screenYaw' | 'roll' | 'lidAngle';
      value: number;
      hitObstacle?: string;
    }
  | {
      kind: 'armElbow';
      id: string;
      role: 'primary' | 'secondary';
      targetId: string;
      x: number;
      z: number;
      bend: 'left' | 'right';
      yawDeg: number;
      limitReason?: ArmLimitReason;
      obstacleName?: string;
    }
  | {
      kind: 'armLowerPitch' | 'armUpperPitch';
      id: string;
      role: 'primary' | 'secondary';
      targetId: string;
      targetType: 'monitor' | 'laptopTray';
      x: number;
      z: number;
      lift?: number;
      trayElevation?: number;
      bend: 'left' | 'right';
      lowerPitchDeg: number;
      upperPitchDeg: number;
      limitReason?: ArmLimitReason;
      obstacleName?: string;
    }
  | {
      kind: 'armBase';
      id: string;
      clampEdge: ArmClampEdge;
      clampX: number;
      clampZ: number;
      updatedTargets: { id: string; x: number; z: number; lift?: number }[];
      limitReason?: ArmLimitReason;
      obstacleName?: string;
    };

export function normalizeRotationDeg(deg: number): number {
  let wrapped = ((deg % 360) + 360) % 360;
  if (wrapped > 180) wrapped -= 360;
  const rounded = Math.round(wrapped * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

import { tr, translateObstacleLabel } from '../i18n';

export function armLimitMessage(
  reason: ArmLimitReason,
  maxReachCm?: number,
  obstacleName?: string,
): string {
  switch (reason) {
    case 'maxReach':
      return maxReachCm
        ? tr(
            `已达支架臂最大伸展极限（半径 ${maxReachCm.toFixed(1)} cm）`,
            `Max arm reach reached (radius ${maxReachCm.toFixed(1)} cm)`,
          )
        : tr('已达支架臂最大伸展极限', 'Max arm reach limit reached');
    case 'minReach':
      return tr(
        '已达支架臂最小折叠间距，无法继续后压立柱',
        'Minimum arm folding clearance reached',
      );
    case 'rearStop':
      return tr('已达桌缘背侧限位', 'Rear desk-edge stop reached');
    case 'heightLimit':
      return tr('已达气压上臂升降机械行程极限', 'Upper gas-spring vertical stroke limit reached');
    case 'lowerPitchLimit':
      return tr('已达下长臂上下俯仰机械倾角极限', 'Lower arm pitch limit reached');
    case 'upperPitchLimit':
      return tr('已达气压上臂俯仰机械倾角极限', 'Upper arm pitch limit reached');
    case 'deskClearance':
      return obstacleName
        ? tr(
            `已触及「${obstacleName}」安全净空极限，无法继续下压/靠近`,
            `Clearance limit reached against "${translateObstacleLabel(obstacleName, 'en')}"`,
          )
        : tr('已触及桌面或顶部横梁安全净空极限', 'Desk or top crossbar clearance limit reached');
    case 'armObstacle':
      return obstacleName
        ? tr(
            `支架臂或挂载设备已触碰「${obstacleName}」（防穿模限位）`,
            `Arm or mounted device collided with "${translateObstacleLabel(obstacleName, 'en')}"`,
          )
        : tr('支架臂运动轨迹受桌面物品阻挡（防穿模限位）', 'Arm path blocked by desk obstacle');
  }
}

export function applyDragPreview(
  items: SceneItem[],
  dragPreview: DragPreviewState | null,
): SceneItem[] {
  if (!dragPreview) return items;
  if (dragPreview.kind === 'rotation') {
    return items.map((item) =>
      item.id === dragPreview.id ? { ...item, rotation: dragPreview.rotation } : item,
    );
  }
  if (dragPreview.kind === 'pose') {
    return items.map((item) =>
      item.id === dragPreview.id ? { ...item, [dragPreview.axis]: dragPreview.value } : item,
    );
  }
  if (dragPreview.kind === 'armElbow') {
    const field = dragPreview.role === 'primary' ? 'primaryElbowBend' : 'secondaryElbowBend';
    return items.map((item) => {
      if (item.id === dragPreview.id && item.monitorArm) {
        return { ...item, monitorArm: { ...item.monitorArm, [field]: dragPreview.bend } };
      }
      if (item.id === dragPreview.targetId) {
        return { ...item, x: dragPreview.x, z: dragPreview.z };
      }
      return item;
    });
  }
  if (dragPreview.kind === 'armLowerPitch' || dragPreview.kind === 'armUpperPitch') {
    const bendField = dragPreview.role === 'primary' ? 'primaryElbowBend' : 'secondaryElbowBend';
    const pitchField =
      dragPreview.role === 'primary' ? 'primaryLowerPitchDeg' : 'secondaryLowerPitchDeg';
    return items.map((item) => {
      if (item.id === dragPreview.id && item.monitorArm) {
        return {
          ...item,
          monitorArm: {
            ...item.monitorArm,
            [bendField]: dragPreview.bend,
            ...(dragPreview.kind === 'armLowerPitch'
              ? { [pitchField]: dragPreview.lowerPitchDeg }
              : {}),
            ...(typeof dragPreview.trayElevation === 'number'
              ? { trayElevation: dragPreview.trayElevation }
              : {}),
          },
        };
      }
      if (item.id === dragPreview.targetId) {
        return {
          ...item,
          x: dragPreview.x,
          z: dragPreview.z,
          ...(typeof dragPreview.lift === 'number' ? { lift: dragPreview.lift } : {}),
        };
      }
      return item;
    });
  }
  if (dragPreview.kind === 'armBase') {
    const targetMap = new Map(dragPreview.updatedTargets.map((t) => [t.id, t]));
    return items.map((item) => {
      if (item.id === dragPreview.id && item.monitorArm) {
        return {
          ...item,
          monitorArm: {
            ...item.monitorArm,
            clampEdge: dragPreview.clampEdge,
            clampX: dragPreview.clampX,
            clampZ: dragPreview.clampZ,
          },
        };
      }
      const moved = targetMap.get(item.id);
      if (moved) {
        return {
          ...item,
          x: moved.x,
          z: moved.z,
          ...(typeof moved.lift === 'number' ? { lift: moved.lift } : {}),
        };
      }
      return item;
    });
  }
  if (dragPreview.kind === undefined || dragPreview.kind === 'position') {
    return items.map((item) =>
      item.id === dragPreview.id
        ? {
            ...item,
            x: dragPreview.x,
            z: dragPreview.z,
            ...(typeof dragPreview.wallY === 'number' ? { wallY: dragPreview.wallY } : {}),
          }
        : item,
    );
  }
  return items;
}

export type ArmSegmentFrame = {
  mid: Vector3;
  length: number;
  quaternion: Quaternion;
  dir: Vector3;
  up: Vector3;
  side: Vector3;
};

/**
 * Builds an orthonormal frame along an arm link segment (`from -> to`) so the
 * cast-aluminum U-channel and routing clips stay aligned to the underside.
 */
export function computeArmSegmentFrame(from: Vector3, to: Vector3): ArmSegmentFrame {
  const delta = to.clone().sub(from);
  const length = Math.max(0.01, delta.length());
  const dir = delta.clone().divideScalar(length);
  const side = new Vector3().crossVectors(WORLD_UP, dir);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  else side.normalize();
  const up = new Vector3().crossVectors(dir, side).normalize();
  const basis = new Matrix4().makeBasis(side, up, dir);
  const quaternion = new Quaternion().setFromRotationMatrix(basis);
  return {
    mid: from.clone().add(to).multiplyScalar(0.5),
    length,
    quaternion,
    dir,
    up,
    side,
  };
}

export function lowerPitchRange(isInverted: boolean): { minDeg: number; maxDeg: number } {
  return isInverted
    ? { minDeg: -ARM_LOWER_PITCH_MAX_DEG, maxDeg: -ARM_LOWER_PITCH_MIN_DEG }
    : { minDeg: ARM_LOWER_PITCH_MIN_DEG, maxDeg: ARM_LOWER_PITCH_MAX_DEG };
}

export function defaultLowerPitchDeg(isInverted: boolean): number {
  return isInverted ? -ARM_LOWER_DEFAULT_PITCH_DEG : ARM_LOWER_DEFAULT_PITCH_DEG;
}

export function resolveBranchLowerPitchDeg(
  arm: MonitorArmSettings | undefined,
  role: 'primary' | 'secondary',
  isInverted: boolean,
): number {
  const raw = role === 'primary' ? arm?.primaryLowerPitchDeg : arm?.secondaryLowerPitchDeg;
  const { minDeg, maxDeg } = lowerPitchRange(isInverted);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(minDeg, Math.min(maxDeg, raw));
  }
  return defaultLowerPitchDeg(isInverted);
}

export function lowerArmGeometry(lowerPitchDeg: number): {
  pitchDeg: number;
  dy1: number;
  h1: number;
} {
  const rad = (lowerPitchDeg * Math.PI) / 180;
  return {
    pitchDeg: lowerPitchDeg,
    dy1: ARM_LOWER_LENGTH * Math.sin(rad),
    h1: ARM_LOWER_LENGTH * Math.cos(rad),
  };
}

export function upperPitchStrokeDyLimits(): { minDy: number; maxDy: number } {
  const maxDy = Math.min(
    ARM_MAX_DY,
    ARM_UPPER_LENGTH * Math.sin((ARM_UPPER_PITCH_MAX_DEG * Math.PI) / 180),
  );
  const minDy = Math.max(
    -ARM_MAX_DY,
    ARM_UPPER_LENGTH * Math.sin((ARM_UPPER_PITCH_MIN_DEG * Math.PI) / 180),
  );
  return { minDy, maxDy };
}

/**
 * Computes horizontal XZ workspace envelope (`dMin .. dMax`) for a fixed-length
 * NB V-arm given vertical displacement `dy` between the elbow joint and VESA head
 * and horizontal projection `lowerHoriz` of the lower arm segment.
 */
export function armHorizontalBounds(dy: number, lowerHoriz: number = ARM_LOWER_HORIZ) {
  const clampedDy = Math.max(-ARM_MAX_DY, Math.min(ARM_MAX_DY, dy));
  const h2 = Math.sqrt(Math.max(1e-4, ARM_UPPER_LENGTH ** 2 - clampedDy ** 2));
  const dMin = Math.max(ARM_MIN_REACH_XZ, Math.abs(lowerHoriz - h2) + 0.02);
  const dMax = Math.max(dMin + 0.01, lowerHoriz + h2 - 0.008);
  return { clampedDy, dyClamped: Math.abs(dy - clampedDy) > 1e-5, h2, dMin, dMax };
}

export type ArmBasePlacement = {
  x: number;
  z: number;
  clampEdge: ArmClampEdge;
  baseYaw: number;
  inwardX: number;
  inwardZ: number;
  tangentX: number;
  tangentZ: number;
};

function clampDeskX(rawX: number, desk: Desk): number {
  return Math.max(-desk.width / 2 + 0.08, Math.min(desk.width / 2 - 0.08, rawX));
}

function clampSurfacePointToDesk(rawX: number, rawZ: number, desk: Desk): { x: number; z: number } {
  const inset = 0.06;
  const rects = deskSupportRects(desk);
  let bestX = rawX;
  let bestZ = rawZ;
  let bestDistSq = Infinity;
  for (const r of rects) {
    const cx = Math.max(r.minX + inset, Math.min(r.maxX - inset, rawX));
    const cz = Math.max(r.minZ + inset, Math.min(r.maxZ - inset, rawZ));
    const dSq = (cx - rawX) ** 2 + (cz - rawZ) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = cx;
      bestZ = cz;
    }
  }
  return { x: roundMm4(bestX), z: roundMm4(bestZ) };
}

export function suggestedArmClampX(
  targets: Pick<SceneItem, 'x'>[],
  clampSide: MonitorArmSettings['clampSide'],
  desk: Desk,
  fallbackCenterX?: number,
): number {
  const avgX = targets.length
    ? targets.reduce((sum, t) => sum + t.x, 0) / targets.length
    : (fallbackCenterX ?? 0);
  const clampMargin = Math.min(0.24, desk.width * 0.25);
  const rawX =
    clampSide === 'left' ? avgX - clampMargin : clampSide === 'right' ? avgX + clampMargin : avgX;
  return Math.round(clampDeskX(rawX, desk) * 1000) / 1000;
}

export function resolveArmClampX(arm: SceneItem, desk: Desk, targets: SceneItem[]): number {
  if (typeof arm.monitorArm?.clampX === 'number' && Number.isFinite(arm.monitorArm.clampX)) {
    return clampDeskX(arm.monitorArm.clampX, desk);
  }
  return suggestedArmClampX(targets, arm.monitorArm?.clampSide ?? 'center', desk);
}

/**
 * Resolves exact world tabletop anchor `(x, z)` and bracket orientation for the monitor arm base
 * across back edge, left/right side edges (including L-desk return wing), interior surface mount,
 * and inverted overhead gantry carriage.
 */
export function resolveArmBasePlacement(
  arm: SceneItem,
  desk: Desk,
  targets: SceneItem[],
): ArmBasePlacement {
  const cfg = arm.monitorArm;
  const isInverted = cfg?.mountOrientation === 'inverted';
  const rects = deskSupportRects(desk);
  const main = rects[0];
  const backZ = main.minZ + 0.036;

  if (isInverted) {
    return {
      x: resolveArmClampX(arm, desk, targets),
      z: backZ,
      clampEdge: 'back',
      baseYaw: 0,
      inwardX: 0,
      inwardZ: 1,
      tangentX: 1,
      tangentZ: 0,
    };
  }

  const edge: ArmClampEdge = cfg?.clampEdge ?? 'back';
  const bounds = deskBounds(desk);
  const rawX =
    typeof cfg?.clampX === 'number' && Number.isFinite(cfg.clampX)
      ? cfg.clampX
      : suggestedArmClampX(targets, cfg?.clampSide ?? 'center', desk);
  const rawZ = typeof cfg?.clampZ === 'number' && Number.isFinite(cfg.clampZ) ? cfg.clampZ : backZ;

  if (edge === 'left') {
    const z = roundMm4(clampScalar(rawZ, bounds.minZ + 0.08, bounds.maxZ - 0.08));
    const rect = rects.find((r) => z >= r.minZ - 0.01 && z <= r.maxZ + 0.01) ?? main;
    return {
      x: roundMm4(rect.minX + 0.036),
      z,
      clampEdge: 'left',
      baseYaw: Math.PI / 2,
      inwardX: 1,
      inwardZ: 0,
      tangentX: 0,
      tangentZ: -1,
    };
  }

  if (edge === 'right') {
    const z = roundMm4(clampScalar(rawZ, bounds.minZ + 0.08, bounds.maxZ - 0.08));
    const rect = rects.find((r) => z >= r.minZ - 0.01 && z <= r.maxZ + 0.01) ?? main;
    return {
      x: roundMm4(rect.maxX - 0.036),
      z,
      clampEdge: 'right',
      baseYaw: -Math.PI / 2,
      inwardX: -1,
      inwardZ: 0,
      tangentX: 0,
      tangentZ: 1,
    };
  }

  if (edge === 'surface') {
    const pt = clampSurfacePointToDesk(rawX, rawZ, desk);
    return {
      x: pt.x,
      z: pt.z,
      clampEdge: 'surface',
      baseYaw: 0,
      inwardX: 0,
      inwardZ: 1,
      tangentX: 1,
      tangentZ: 0,
    };
  }

  return {
    x: roundMm4(clampScalar(rawX, main.minX + 0.08, main.maxX - 0.08)),
    z: roundMm4(backZ),
    clampEdge: 'back',
    baseYaw: 0,
    inwardX: 0,
    inwardZ: 1,
    tangentX: 1,
    tangentZ: 0,
  };
}

function edgeStopForColumn(clampEdge: ArmClampEdge, columnTop: Vector3, desk: Desk): EdgeStop {
  switch (clampEdge) {
    case 'left':
      return { axis: 'minX', limit: columnTop.x - ARM_REAR_CLEARANCE };
    case 'right':
      return { axis: 'maxX', limit: columnTop.x + ARM_REAR_CLEARANCE };
    case 'surface':
      return { axis: 'minZ', limit: -desk.depth / 2 - ARM_REAR_CLEARANCE };
    case 'back':
    default:
      return { axis: 'minZ', limit: columnTop.z - ARM_REAR_CLEARANCE };
  }
}

function edgeStopSignedClearance(vx: number, vz: number, stop: EdgeStop): number {
  switch (stop.axis) {
    case 'minZ':
      return vz - stop.limit;
    case 'minX':
      return vx - stop.limit;
    case 'maxX':
      return stop.limit - vx;
  }
}

function clampPointOnCircleToEdgeStop(
  vx: number,
  vz: number,
  cx: number,
  cz: number,
  radius: number,
  stop: EdgeStop,
): { vx: number; vz: number; hit: boolean } {
  if (edgeStopSignedClearance(vx, vz, stop) >= -1e-6) {
    return { vx, vz, hit: false };
  }
  if (stop.axis === 'minZ') {
    const nextZ = stop.limit;
    const rem = Math.sqrt(Math.max(0, radius ** 2 - (nextZ - cz) ** 2));
    return { vx: cx + (vx - cx >= 0 ? rem : -rem), vz: nextZ, hit: true };
  }
  const nextX = stop.limit;
  const rem = Math.sqrt(Math.max(0, radius ** 2 - (nextX - cx) ** 2));
  return { vx: nextX, vz: cz + (vz - cz >= 0 ? rem : -rem), hit: true };
}

/**
 * Computes VESA backplate center, normal, and gimbal head center for a monitor
 * or NB FP-2 laptop tray target directly in world coordinates without external coupling.
 */
export function resolveVesaTarget(
  targetType: 'monitor' | 'laptopTray',
  target: SceneItem,
  desk: Desk,
  items: SceneItem[],
): { vesaPos: Vector3; vesaNormal: Vector3; vesaHeadPos: Vector3 } {
  if (targetType === 'monitor') {
    const yaw = (target.rotation * Math.PI) / 180;
    const pose = monitorPose(target.size, { ...target, hasMonitorArm: true });
    const { panelHeight } = monitorParts(target.size, target.monitor?.model);
    const panelY = pose.pivotY + panelHeight / 2;
    const baseY = itemWorldY(desk, target, items);

    const monitorQuat = new Quaternion().setFromAxisAngle(WORLD_UP, yaw);
    const screenQuat = new Quaternion().setFromEuler(
      new Euler((pose.pitchDeg * Math.PI) / 180, 0, (pose.rollDeg * Math.PI) / 180, 'XYZ'),
    );

    const vesaZ = target.monitor?.model === 'studioDisplay' ? -0.019 : -0.02;
    const vesaLocal = new Vector3(0, 0, vesaZ)
      .applyQuaternion(screenQuat)
      .add(new Vector3(0, panelY, -0.02));
    const vesaPos = vesaLocal
      .applyQuaternion(monitorQuat)
      .add(new Vector3(target.x, baseY, target.z));
    const vesaNormal = new Vector3(0, 0, -1)
      .applyQuaternion(screenQuat)
      .applyQuaternion(monitorQuat)
      .normalize();
    const vesaHeadPos = vesaPos.clone().addScaledVector(vesaNormal, ARM_VESA_OFFSET_MONITOR);
    return { vesaPos, vesaNormal, vesaHeadPos };
  }

  // NB FP-2 laptop tray sits at trayElevation and trayTiltDeg when bound to an arm.
  const owner = items.find((other) => Boolean(findArmForTrayLaptop(target.id, [other])));
  const cfg = owner?.monitorArm;
  const elevation = cfg?.trayElevation ?? DEFAULT_TRAY_ELEVATION;
  const tiltRad = ((cfg?.trayTiltDeg ?? DEFAULT_TRAY_TILT_DEG) * Math.PI) / 180;
  const centerY = desk.height + elevation + target.size.depth * 0.5 * Math.sin(tiltRad) * 0.35;
  const yaw = (target.rotation * Math.PI) / 180;
  const quat = new Quaternion().setFromEuler(new Euler(tiltRad, yaw, 0, 'YXZ'));
  const pos = new Vector3(target.x, centerY, target.z);
  const vesaPos = new Vector3(0, -0.01, 0).applyQuaternion(quat).add(pos);
  const vesaNormal = new Vector3(0, -1, 0).applyQuaternion(quat).normalize();
  const vesaHeadPos = vesaPos.clone().addScaledVector(vesaNormal, ARM_VESA_OFFSET_TRAY);
  return { vesaPos, vesaNormal, vesaHeadPos };
}

function collectArmCandidates(arm: SceneItem, items: SceneItem[]) {
  const cfg = arm.monitorArm;
  const isDual = cfg?.armStyle === 'dual';
  const candidates: {
    role: 'primary' | 'secondary';
    targetType: 'monitor' | 'laptopTray';
    target: SceneItem;
  }[] = [];

  const pm = armPrimaryMonitorId(cfg);
  const pl = armPrimaryLaptopId(cfg);
  const pTarget = items.find((i) => i.id === (pm ?? pl));
  if (pTarget) {
    candidates.push({
      role: 'primary',
      targetType: pm ? 'monitor' : 'laptopTray',
      target: pTarget,
    });
  }

  if (isDual) {
    const sm = armSecondaryMonitorId(cfg);
    const sl = armSecondaryLaptopId(cfg);
    const sTarget = items.find((i) => i.id === (sm ?? sl));
    if (sTarget) {
      candidates.push({
        role: 'secondary',
        targetType: sm ? 'monitor' : 'laptopTray',
        target: sTarget,
      });
    }
  }
  return candidates;
}

function resolveBranchPlacement(
  role: 'primary' | 'secondary',
  candidates: ReturnType<typeof collectArmCandidates>,
  basePlacement: ArmBasePlacement,
  clampSide: MonitorArmSettings['clampSide'],
  basePos: Vector3,
  desk: Desk,
  isDual: boolean,
  isInverted: boolean,
  armCfg?: MonitorArmSettings,
) {
  let shoulderOffset = 0;
  let sideBias = clampSide === 'left' ? -1 : 1;
  if (isDual) {
    if (candidates.length === 2) {
      const primary = candidates.find((c) => c.role === 'primary')!;
      const secondary = candidates.find((c) => c.role === 'secondary')!;
      const primaryProj =
        primary.target.x * basePlacement.tangentX + primary.target.z * basePlacement.tangentZ;
      const secondaryProj =
        secondary.target.x * basePlacement.tangentX + secondary.target.z * basePlacement.tangentZ;
      const primaryIsLeft = primaryProj <= secondaryProj;
      const isLeftSocket = role === 'primary' ? primaryIsLeft : !primaryIsLeft;
      shoulderOffset = isLeftSocket ? -ARM_DUAL_SOCKET_OFFSET : ARM_DUAL_SOCKET_OFFSET;
      sideBias = isLeftSocket ? -1 : 1;
    } else {
      const isLeftSocket = role === 'primary';
      shoulderOffset = isLeftSocket ? -ARM_DUAL_SOCKET_OFFSET : ARM_DUAL_SOCKET_OFFSET;
      sideBias = isLeftSocket ? -1 : 1;
    }
  }
  const inwardRailOffset = isDual ? 0.008 : 0;
  const turretX =
    basePos.x + basePlacement.tangentX * shoulderOffset + basePlacement.inwardX * inwardRailOffset;
  const turretZ =
    basePos.z + basePlacement.tangentZ * shoulderOffset + basePlacement.inwardZ * inwardRailOffset;
  const turretBase = new Vector3(turretX, basePos.y, turretZ);
  const columnTop = new Vector3(
    turretX,
    isInverted ? basePos.y - ARM_TURRET_HEIGHT_INVERTED : basePos.y + ARM_TURRET_HEIGHT_UPRIGHT,
    turretZ,
  );
  const lowerPitchDeg = resolveBranchLowerPitchDeg(armCfg, role, isInverted);
  const { dy1, h1 } = lowerArmGeometry(lowerPitchDeg);
  const elbowBaseY = columnTop.y + dy1;
  const rearStop = edgeStopForColumn(basePlacement.clampEdge, columnTop, desk);
  return {
    turretBase,
    columnTop,
    elbowBaseY,
    lowerPitchDeg,
    lowerHoriz: h1,
    sideBias,
    rearStop,
  };
}

/**
 * Finds the fixed monitor arm branch owning `itemId`, if mounted on any arm.
 */
export function findArmBranchForItem(itemId: string, items: SceneItem[]) {
  for (const arm of items) {
    if (arm.kind !== 'monitorArm' || !arm.monitorArm) continue;
    const cfg = arm.monitorArm;
    if (armPrimaryMonitorId(cfg) === itemId) {
      return { arm, role: 'primary' as const, targetType: 'monitor' as const };
    }
    if (armPrimaryLaptopId(cfg) === itemId) {
      return { arm, role: 'primary' as const, targetType: 'laptopTray' as const };
    }
    if (armSecondaryMonitorId(cfg) === itemId) {
      return { arm, role: 'secondary' as const, targetType: 'monitor' as const };
    }
    if (armSecondaryLaptopId(cfg) === itemId) {
      return { arm, role: 'secondary' as const, targetType: 'laptopTray' as const };
    }
  }
  return null;
}

/**
 * Constrains a mounted monitor or laptop-tray position/lift onto the physical
 * reachable workspace of its fixed-length monitor arm branch.
 */
export function constrainTargetToMonitorArm(
  item: SceneItem,
  desiredX: number,
  desiredZ: number,
  desiredLift: number | undefined,
  arm: SceneItem,
  role: 'primary' | 'secondary',
  targetType: 'monitor' | 'laptopTray',
  allItems: SceneItem[],
  desk: Desk,
): {
  x: number;
  z: number;
  lift?: number;
  clamped: boolean;
  limitReason?: ArmLimitReason;
  maxReachCm: number;
  reachCm: number;
} {
  const cfg = arm.monitorArm!;
  const isDual = cfg.armStyle === 'dual';
  const isInverted = cfg.mountOrientation === 'inverted';
  const invertedHeight = cfg.invertedHeight ?? DEFAULT_INVERTED_HEIGHT;
  const clampSide = cfg.clampSide ?? 'center';
  const candidates = collectArmCandidates(arm, allItems);
  const basePlacement = resolveArmBasePlacement(
    arm,
    desk,
    candidates.map((c) => c.target),
  );
  const basePos = new Vector3(
    basePlacement.x,
    isInverted ? desk.height + invertedHeight : desk.height,
    basePlacement.z,
  );
  const { columnTop, elbowBaseY, lowerHoriz, rearStop } = resolveBranchPlacement(
    role,
    candidates,
    basePlacement,
    clampSide,
    basePos,
    desk,
    isDual,
    isInverted,
    cfg,
  );

  const probe: SceneItem = {
    ...item,
    x: desiredX,
    z: desiredZ,
    ...(typeof desiredLift === 'number' ? { lift: desiredLift } : {}),
  };
  const { vesaHeadPos } = resolveVesaTarget(targetType, probe, desk, allItems);
  const offsetX = vesaHeadPos.x - desiredX;
  const offsetZ = vesaHeadPos.z - desiredZ;

  const rawDy = vesaHeadPos.y - elbowBaseY;
  const { clampedDy, dyClamped, dMin, dMax } = armHorizontalBounds(rawDy, lowerHoriz);

  let nextLift = desiredLift;
  let limitReason: ArmLimitReason | undefined = dyClamped ? 'heightLimit' : undefined;
  if (dyClamped && targetType === 'monitor') {
    const clampedVesaY = elbowBaseY + clampedDy;
    const baseLift = desiredLift ?? item.lift ?? 0;
    nextLift = Math.max(
      ARM_MIN_LIFT,
      Math.min(
        ARM_MAX_LIFT,
        Math.round((baseLift + (clampedVesaY - vesaHeadPos.y)) * 10000) / 10000,
      ),
    );
  }

  let vx = vesaHeadPos.x;
  let vz = vesaHeadPos.z;
  if (edgeStopSignedClearance(vx, vz, rearStop) < 0) {
    if (rearStop.axis === 'minZ') vz = rearStop.limit;
    else vx = rearStop.limit;
    limitReason = 'rearStop';
  }

  let dx = vx - columnTop.x;
  let dz = vz - columnTop.z;
  let dist = Math.hypot(dx, dz);

  if (dist > dMax) {
    const scale = dMax / dist;
    vx = columnTop.x + dx * scale;
    vz = columnTop.z + dz * scale;
    const clamped = clampPointOnCircleToEdgeStop(vx, vz, columnTop.x, columnTop.z, dMax, rearStop);
    vx = clamped.vx;
    vz = clamped.vz;
    dist = dMax;
    limitReason = 'maxReach';
  } else if (dist < dMin) {
    if (dist < 1e-4) {
      dx = basePlacement.inwardX;
      dz = basePlacement.inwardZ;
      dist = 1;
    }
    const scale = dMin / dist;
    vx = columnTop.x + dx * scale;
    vz = columnTop.z + dz * scale;
    const clamped = clampPointOnCircleToEdgeStop(vx, vz, columnTop.x, columnTop.z, dMin, rearStop);
    vx = clamped.vx;
    vz = clamped.vz;
    dist = dMin;
    limitReason = 'minReach';
  }

  return {
    x: Math.round((vx - offsetX) * 10000) / 10000,
    z: Math.round((vz - offsetZ) * 10000) / 10000,
    lift: nextLift,
    clamped: Boolean(limitReason),
    limitReason,
    maxReachCm: Math.round(dMax * 1000) / 10,
    reachCm: Math.round(dist * 1000) / 10,
  };
}

export const ARM_ELBOW_MAX_YAW_DEG = 150;

export type ArmArticulationCandidate = {
  arm: SceneItem;
  target: SceneItem;
  items: SceneItem[];
  role: 'primary' | 'secondary';
};

export type ArmCollisionChecker = (candidate: ArmArticulationCandidate) => string | null;

function clampScalar(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function roundMm4(v: number): number {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
}

function roundDeg1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function recoverElbowBend(
  cx: number,
  cz: number,
  ex: number,
  ez: number,
  vx: number,
  vz: number,
): 'left' | 'right' {
  const svX = vx - cx;
  const svZ = vz - cz;
  const svLen = Math.max(1e-5, Math.hypot(svX, svZ));
  const nx = -svZ / svLen;
  const nz = svX / svLen;
  return (ex - cx) * nx + (ez - cz) * nz >= 0 ? 'left' : 'right';
}

function clampUpperDirectionToEnvelope({
  cx,
  cz,
  ex,
  ez,
  erX,
  erZ,
  h1,
  h2,
  dMin,
  dMax,
  dirX,
  dirZ,
  rearStop,
}: {
  cx: number;
  cz: number;
  ex: number;
  ez: number;
  erX: number;
  erZ: number;
  h1: number;
  h2: number;
  dMin: number;
  dMax: number;
  dirX: number;
  dirZ: number;
  rearStop?: EdgeStop;
}): { wx: number; wz: number; clamped: boolean; hitRearStop: boolean } {
  const etX = erZ;
  const etZ = -erX;
  const stop: EdgeStop = rearStop ?? { axis: 'minZ', limit: cz - ARM_REAR_CLEARANCE };

  const cosMax =
    h1 > 1e-4 && h2 > 1e-4
      ? clampScalar((dMax ** 2 - h1 ** 2 - h2 ** 2) / (2 * h1 * h2), -1, 1)
      : 1;
  const cosMin =
    h1 > 1e-4 && h2 > 1e-4
      ? clampScalar((dMin ** 2 - h1 ** 2 - h2 ** 2) / (2 * h1 * h2), -1, 1)
      : -1;

  const clampDir = (curWx: number, curWz: number) => {
    const cosAlpha = curWx * erX + curWz * erZ;
    const sinAlpha = curWx * etX + curWz * etZ;
    const prefSign = sinAlpha >= 0 ? 1 : -1;
    let clampedCos = cosAlpha;
    if (cosAlpha > cosMax) clampedCos = cosMax;
    else if (cosAlpha < cosMin) clampedCos = cosMin;
    else return { x: curWx, z: curWz, wasClamped: false };
    const absSin = Math.sqrt(Math.max(0, 1 - clampedCos ** 2));
    const candA = {
      x: clampedCos * erX + prefSign * absSin * etX,
      z: clampedCos * erZ + prefSign * absSin * etZ,
    };
    const clearA = edgeStopSignedClearance(ex + candA.x * h2, ez + candA.z * h2, stop);
    if (clearA >= -1e-5) return { ...candA, wasClamped: true };
    const candB = {
      x: clampedCos * erX - prefSign * absSin * etX,
      z: clampedCos * erZ - prefSign * absSin * etZ,
    };
    const clearB = edgeStopSignedClearance(ex + candB.x * h2, ez + candB.z * h2, stop);
    return clearB >= clearA ? { ...candB, wasClamped: true } : { ...candA, wasClamped: true };
  };

  let { x: wx, z: wz, wasClamped } = clampDir(dirX, dirZ);
  let hitRearStop = false;
  const clamped = clampPointOnCircleToEdgeStop(ex + wx * h2, ez + wz * h2, ex, ez, h2, stop);
  if (clamped.hit) {
    wx = (clamped.vx - ex) / Math.max(1e-5, h2);
    wz = (clamped.vz - ez) / Math.max(1e-5, h2);
    ({ x: wx, z: wz } = clampDir(wx, wz));
    hitRearStop = true;
  }

  return { wx, wz, clamped: wasClamped, hitRearStop };
}

function buildArticulatedCandidate({
  arm,
  branch,
  allItems,
  bend,
  nextX,
  nextZ,
  lowerPitchDeg,
  nextLift,
  nextTrayElevation,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  allItems: SceneItem[];
  bend: 'left' | 'right';
  nextX: number;
  nextZ: number;
  lowerPitchDeg?: number;
  nextLift?: number;
  nextTrayElevation?: number;
}): ArmArticulationCandidate {
  const bendField = branch.role === 'primary' ? 'primaryElbowBend' : 'secondaryElbowBend';
  const pitchField = branch.role === 'primary' ? 'primaryLowerPitchDeg' : 'secondaryLowerPitchDeg';
  const nextArm: SceneItem = {
    ...arm,
    monitorArm: {
      ...arm.monitorArm!,
      [bendField]: bend,
      ...(typeof lowerPitchDeg === 'number' ? { [pitchField]: lowerPitchDeg } : {}),
      ...(typeof nextTrayElevation === 'number' ? { trayElevation: nextTrayElevation } : {}),
    },
  };
  const nextTarget: SceneItem = {
    ...branch.target,
    x: nextX,
    z: nextZ,
    ...(typeof nextLift === 'number' ? { lift: nextLift } : {}),
  };
  const nextItems = allItems.map((it) =>
    it.id === arm.id ? nextArm : it.id === nextTarget.id ? nextTarget : it,
  );
  return { arm: nextArm, target: nextTarget, items: nextItems, role: branch.role };
}

function obstacleToLimitReason(obstacle: string): ArmLimitReason {
  return obstacle === '桌面' || obstacle === '倒挂横梁' ? 'deskClearance' : 'armObstacle';
}

function binarySearchFeasiblePose<T>({
  startVal,
  targetVal,
  evaluate,
  isValid,
}: {
  startVal: number;
  targetVal: number;
  evaluate: (v: number) => T & { obstacle: string | null; strokeImpossible?: boolean };
  isValid: (res: T & { obstacle: string | null; strokeImpossible?: boolean }) => boolean;
}): {
  result: T & { obstacle: string | null; strokeImpossible?: boolean };
  blockedByObstacle: string | null;
  blockedByStroke: boolean;
} {
  const startRes = evaluate(startVal);
  const targetRes = evaluate(targetVal);

  // Allow escaping a pre-existing collision cleanly when the target pose is completely clear.
  if (!isValid(startRes) && isValid(targetRes)) {
    return { result: targetRes, blockedByObstacle: null, blockedByStroke: false };
  }
  if (!isValid(startRes) && !isValid(targetRes)) {
    return {
      result: startRes,
      blockedByObstacle: startRes.obstacle ?? targetRes.obstacle,
      blockedByStroke: Boolean(targetRes.strokeImpossible && !targetRes.obstacle),
    };
  }
  if (isValid(targetRes)) {
    return { result: targetRes, blockedByObstacle: null, blockedByStroke: false };
  }

  let lo = 0;
  let hi = 1;
  let lastValid = startRes;
  let firstObstacle = targetRes.obstacle;
  let firstStrokeBlock = Boolean(targetRes.strokeImpossible);

  // Quick 8-step forward probe so large jumps don't miss an intermediate obstacle or jump through it.
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const probe = evaluate(startVal + (targetVal - startVal) * t);
    if (!isValid(probe)) {
      hi = t;
      firstObstacle = probe.obstacle;
      firstStrokeBlock = Boolean(probe.strokeImpossible);
      break;
    }
    lo = t;
    lastValid = probe;
  }

  for (let iter = 0; iter < 12; iter++) {
    const mid = (lo + hi) / 2;
    const probe = evaluate(startVal + (targetVal - startVal) * mid);
    if (isValid(probe)) {
      lo = mid;
      lastValid = probe;
    } else {
      hi = mid;
      firstObstacle = probe.obstacle;
      firstStrokeBlock = Boolean(probe.strokeImpossible);
    }
  }

  return {
    result: lastValid,
    blockedByObstacle: firstObstacle,
    blockedByStroke: firstStrokeBlock,
  };
}

/**
 * Solves pure horizontal rotation (`yawDeg` around the vertical shoulder axis) for the elbow joint
 * at current elbow height and horizontal reach `branch.lowerHoriz`, carrying the attached target
 * along horizontally while preserving exact link lengths, envelopes, and optional 3D collisions.
 */
export function solveHorizontalElbowSwivel({
  branch,
  desiredYawDeg,
  arm,
  allItems,
  canAccept,
}: {
  branch: ArmBranchKinematics;
  desiredYawDeg: number;
  arm?: SceneItem;
  allItems?: SceneItem[];
  canAccept?: ArmCollisionChecker;
}): {
  targetId: string;
  x: number;
  z: number;
  yawDeg: number;
  bend: 'left' | 'right';
  limitReason?: ArmLimitReason;
  obstacleName?: string;
} {
  let clampedYaw = desiredYawDeg;
  let mechanicalReason: ArmLimitReason | undefined;
  if (clampedYaw > ARM_ELBOW_MAX_YAW_DEG) {
    clampedYaw = ARM_ELBOW_MAX_YAW_DEG;
    mechanicalReason = 'rearStop';
  } else if (clampedYaw < -ARM_ELBOW_MAX_YAW_DEG) {
    clampedYaw = -ARM_ELBOW_MAX_YAW_DEG;
    mechanicalReason = 'rearStop';
  }

  const h1 = branch.lowerHoriz;
  const cx = branch.columnTop.x;
  const cz = branch.columnTop.z;
  const dy = branch.vesaHeadPos.y - branch.elbowPos.y;
  const { h2, dMin, dMax } = armHorizontalBounds(dy, h1);
  const offsetX = branch.vesaHeadPos.x - branch.target.x;
  const offsetZ = branch.vesaHeadPos.z - branch.target.z;

  const evaluateYaw = (yawDeg: number) => {
    const yawRad = (yawDeg * Math.PI) / 180;
    const erX = Math.sin(yawRad);
    const erZ = Math.cos(yawRad);
    const ex = cx + h1 * erX;
    const ez = cz + h1 * erZ;

    const prevDx = branch.vesaHeadPos.x - ex;
    const prevDz = branch.vesaHeadPos.z - ez;
    const prevLen = Math.hypot(prevDx, prevDz);
    const dirX = prevLen > 1e-5 ? prevDx / prevLen : 0;
    const dirZ = prevLen > 1e-5 ? prevDz / prevLen : 1;

    const { wx, wz, hitRearStop } = clampUpperDirectionToEnvelope({
      cx,
      cz,
      ex,
      ez,
      erX,
      erZ,
      h1,
      h2,
      dMin,
      dMax,
      dirX,
      dirZ,
      rearStop: branch.rearStop,
    });

    const vx = ex + wx * h2;
    const vz = ez + wz * h2;
    const nextX = roundMm4(vx - offsetX);
    const nextZ = roundMm4(vz - offsetZ);
    const bend = recoverElbowBend(cx, cz, ex, ez, vx, vz);

    let obstacle: string | null = null;
    if (canAccept && arm && allItems) {
      const candidate = buildArticulatedCandidate({
        arm,
        branch,
        allItems,
        bend,
        nextX,
        nextZ,
      });
      obstacle = canAccept(candidate);
    }

    return {
      yawDeg,
      x: nextX,
      z: nextZ,
      bend,
      hitRearStop,
      obstacle,
    };
  };

  if (canAccept && arm && allItems) {
    const { result, blockedByObstacle } = binarySearchFeasiblePose({
      startVal: branch.lowerYawDeg,
      targetVal: clampedYaw,
      evaluate: evaluateYaw,
      isValid: (res) => res.obstacle === null,
    });
    const limitReason: ArmLimitReason | undefined = blockedByObstacle
      ? obstacleToLimitReason(blockedByObstacle)
      : result.hitRearStop
        ? 'rearStop'
        : mechanicalReason;
    return {
      targetId: branch.target.id,
      x: result.x,
      z: result.z,
      yawDeg: roundDeg1(result.yawDeg),
      bend: result.bend,
      limitReason,
      ...(blockedByObstacle ? { obstacleName: blockedByObstacle } : {}),
    };
  }

  const res = evaluateYaw(clampedYaw);
  return {
    targetId: branch.target.id,
    x: res.x,
    z: res.z,
    yawDeg: roundDeg1(res.yawDeg),
    bend: res.bend,
    limitReason: res.hitRearStop ? 'rearStop' : mechanicalReason,
  };
}

/**
 * Solves vertical pitch articulation (`desiredPitchDeg`) for the fixed-length lower arm
 * (`ARM_LOWER_LENGTH = 27.5 cm`), dynamically recomputing `elbowPos.y` and horizontal reach `h1`.
 * Prioritizes holding the mounted display/tray height steady via compensating upper-arm pitch,
 * carrying vertical target height along once gas-spring stroke reaches its limits, and stops
 * cleanly before any mechanical joint stop or 3D obstacle collision.
 */
export function solveLowerArmPitch({
  arm,
  branch,
  desiredPitchDeg,
  allItems,
  canAccept,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  desiredPitchDeg: number;
  allItems: SceneItem[];
  canAccept?: ArmCollisionChecker;
}): {
  targetId: string;
  targetType: 'monitor' | 'laptopTray';
  x: number;
  z: number;
  lift?: number;
  trayElevation?: number;
  bend: 'left' | 'right';
  lowerPitchDeg: number;
  upperPitchDeg: number;
  limitReason?: ArmLimitReason;
  obstacleName?: string;
} {
  const isInverted = arm.monitorArm?.mountOrientation === 'inverted';
  const { minDeg, maxDeg } = lowerPitchRange(isInverted);
  const clampedDesired = clampScalar(desiredPitchDeg, minDeg, maxDeg);
  const hitPitchStop = Math.abs(desiredPitchDeg - clampedDesired) > 1e-4;

  const cx = branch.columnTop.x;
  const cz = branch.columnTop.z;
  const yawRad = (branch.lowerYawDeg * Math.PI) / 180;
  const erX = Math.sin(yawRad);
  const erZ = Math.cos(yawRad);
  const { minDy: minStrokeDy, maxDy: maxStrokeDy } = upperPitchStrokeDyLimits();
  const offsetX = branch.vesaHeadPos.x - branch.target.x;
  const offsetZ = branch.vesaHeadPos.z - branch.target.z;
  const baseLift = branch.target.lift ?? 0;
  const baseTrayElev = arm.monitorArm?.trayElevation ?? DEFAULT_TRAY_ELEVATION;

  const evaluateLowerPitch = (pitchDeg: number) => {
    const { dy1, h1 } = lowerArmGeometry(pitchDeg);
    const elbowY = branch.columnTop.y + dy1;
    const ex = cx + h1 * erX;
    const ez = cz + h1 * erZ;

    // Hold desired VESA height inside upper arm's vertical stroke; carry vertically at stroke limits.
    const rawDy2 = branch.vesaHeadPos.y - elbowY;
    let vy = elbowY + clampScalar(rawDy2, minStrokeDy, maxStrokeDy);
    let nextLift: number | undefined;
    let nextTrayElevation: number | undefined;
    let strokeImpossible = false;

    const deltaY = vy - branch.vesaHeadPos.y;
    if (branch.targetType === 'monitor') {
      const candidateLift = baseLift + deltaY;
      const clampedLift = clampScalar(candidateLift, ARM_MIN_LIFT, ARM_MAX_LIFT);
      nextLift = roundMm4(clampedLift);
      vy = branch.vesaHeadPos.y + (nextLift - baseLift);
      const checkDy2 = vy - elbowY;
      if (checkDy2 < minStrokeDy - 2e-4 || checkDy2 > maxStrokeDy + 2e-4) {
        strokeImpossible = true;
      }
    } else {
      const candidateElev = baseTrayElev + deltaY;
      const clampedElev = clampScalar(
        candidateElev,
        ARM_TRAY_MIN_ELEVATION,
        ARM_TRAY_MAX_ELEVATION,
      );
      nextTrayElevation = roundMm4(clampedElev);
      vy = branch.vesaHeadPos.y + (nextTrayElevation - baseTrayElev);
      const checkDy2 = vy - elbowY;
      if (checkDy2 < minStrokeDy - 2e-4 || checkDy2 > maxStrokeDy + 2e-4) {
        strokeImpossible = true;
      }
    }

    const dy2 = clampScalar(vy - elbowY, minStrokeDy, maxStrokeDy);
    const h2 = Math.sqrt(Math.max(1e-4, ARM_UPPER_LENGTH ** 2 - dy2 ** 2));
    const { dMin, dMax } = armHorizontalBounds(dy2, h1);

    let dirX = branch.vesaHeadPos.x - ex;
    let dirZ = branch.vesaHeadPos.z - ez;
    let dirLen = Math.hypot(dirX, dirZ);
    if (dirLen < 1e-4) {
      dirX = branch.vesaHeadPos.x - branch.elbowPos.x;
      dirZ = branch.vesaHeadPos.z - branch.elbowPos.z;
      dirLen = Math.hypot(dirX, dirZ);
    }
    if (dirLen < 1e-4) {
      dirX = erX;
      dirZ = erZ;
      dirLen = 1;
    }

    const { wx, wz, hitRearStop } = clampUpperDirectionToEnvelope({
      cx,
      cz,
      ex,
      ez,
      erX,
      erZ,
      h1,
      h2,
      dMin,
      dMax,
      dirX: dirX / dirLen,
      dirZ: dirZ / dirLen,
      rearStop: branch.rearStop,
    });

    const vx = ex + wx * h2;
    const vz = ez + wz * h2;
    const nextX = roundMm4(vx - offsetX);
    const nextZ = roundMm4(vz - offsetZ);
    const bend = recoverElbowBend(cx, cz, ex, ez, vx, vz);
    const roundedPitch = roundDeg1(pitchDeg);
    const upperPitchDeg = roundDeg1((Math.atan2(dy2, h2) * 180) / Math.PI);

    let obstacle: string | null = null;
    if (!strokeImpossible && canAccept) {
      const candidate = buildArticulatedCandidate({
        arm,
        branch,
        allItems,
        bend,
        nextX,
        nextZ,
        lowerPitchDeg: roundedPitch,
        nextLift,
        nextTrayElevation,
      });
      obstacle = canAccept(candidate);
    }

    return {
      lowerPitchDeg: roundedPitch,
      upperPitchDeg,
      x: nextX,
      z: nextZ,
      lift: nextLift,
      trayElevation: nextTrayElevation,
      bend,
      hitRearStop,
      obstacle,
      strokeImpossible,
    };
  };

  const { result, blockedByObstacle, blockedByStroke } = binarySearchFeasiblePose({
    startVal: branch.lowerPitchDeg,
    targetVal: clampedDesired,
    evaluate: evaluateLowerPitch,
    isValid: (res) => !res.strokeImpossible && res.obstacle === null,
  });

  const limitReason: ArmLimitReason | undefined = blockedByObstacle
    ? obstacleToLimitReason(blockedByObstacle)
    : blockedByStroke
      ? 'heightLimit'
      : result.hitRearStop
        ? 'rearStop'
        : hitPitchStop
          ? 'lowerPitchLimit'
          : undefined;

  return {
    targetId: branch.target.id,
    targetType: branch.targetType,
    x: result.x,
    z: result.z,
    ...(typeof result.lift === 'number' ? { lift: result.lift } : {}),
    ...(typeof result.trayElevation === 'number' ? { trayElevation: result.trayElevation } : {}),
    bend: result.bend,
    lowerPitchDeg: result.lowerPitchDeg,
    upperPitchDeg: result.upperPitchDeg,
    limitReason,
    ...(blockedByObstacle ? { obstacleName: blockedByObstacle } : {}),
  };
}

/**
 * Solves vertical pitch articulation (`desiredUpperPitchDeg`) for the fixed-length gas-spring
 * upper arm (`ARM_UPPER_LENGTH = 30.5 cm`) pivoting around `branch.elbowPos` while holding the
 * lower arm anchored and carrying the mounted display/laptop tray smoothly within physical limits.
 */
export function solveUpperArmPitch({
  arm,
  branch,
  desiredUpperPitchDeg,
  allItems,
  canAccept,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  desiredUpperPitchDeg: number;
  allItems: SceneItem[];
  canAccept?: ArmCollisionChecker;
}): {
  targetId: string;
  targetType: 'monitor' | 'laptopTray';
  x: number;
  z: number;
  lift?: number;
  trayElevation?: number;
  bend: 'left' | 'right';
  lowerPitchDeg: number;
  upperPitchDeg: number;
  limitReason?: ArmLimitReason;
  obstacleName?: string;
} {
  const clampedDesired = clampScalar(
    desiredUpperPitchDeg,
    ARM_UPPER_PITCH_MIN_DEG,
    ARM_UPPER_PITCH_MAX_DEG,
  );
  const hitPitchStop = Math.abs(desiredUpperPitchDeg - clampedDesired) > 1e-4;

  const cx = branch.columnTop.x;
  const cz = branch.columnTop.z;
  const ex = branch.elbowPos.x;
  const ey = branch.elbowPos.y;
  const ez = branch.elbowPos.z;
  const h1 = branch.lowerHoriz;
  const erX = h1 > 1e-5 ? (ex - cx) / h1 : 0;
  const erZ = h1 > 1e-5 ? (ez - cz) / h1 : 1;
  const { minDy: minStrokeDy, maxDy: maxStrokeDy } = upperPitchStrokeDyLimits();
  const offsetX = branch.vesaHeadPos.x - branch.target.x;
  const offsetZ = branch.vesaHeadPos.z - branch.target.z;
  const baseLift = branch.target.lift ?? 0;
  const baseTrayElev = arm.monitorArm?.trayElevation ?? DEFAULT_TRAY_ELEVATION;

  const prevDx = branch.vesaHeadPos.x - ex;
  const prevDz = branch.vesaHeadPos.z - ez;
  const prevLen = Math.hypot(prevDx, prevDz);
  const baseDirX = prevLen > 1e-5 ? prevDx / prevLen : 0;
  const baseDirZ = prevLen > 1e-5 ? prevDz / prevLen : 1;

  const evaluateUpperPitch = (upperDeg: number) => {
    const rad = (upperDeg * Math.PI) / 180;
    const rawDy2 = ARM_UPPER_LENGTH * Math.sin(rad);
    const vyRaw = ey + rawDy2;
    const rawDeltaY = vyRaw - branch.vesaHeadPos.y;

    let nextLift: number | undefined;
    let nextTrayElevation: number | undefined;
    let vy = vyRaw;
    let heightClamped = false;

    if (branch.targetType === 'monitor') {
      const candidateLift = baseLift + rawDeltaY;
      const clampedLift = clampScalar(candidateLift, ARM_MIN_LIFT, ARM_MAX_LIFT);
      if (Math.abs(clampedLift - candidateLift) > 1e-4) heightClamped = true;
      nextLift = roundMm4(clampedLift);
      vy = branch.vesaHeadPos.y + (nextLift - baseLift);
    } else {
      const candidateElev = baseTrayElev + rawDeltaY;
      const clampedElev = clampScalar(
        candidateElev,
        ARM_TRAY_MIN_ELEVATION,
        ARM_TRAY_MAX_ELEVATION,
      );
      if (Math.abs(clampedElev - candidateElev) > 1e-4) heightClamped = true;
      nextTrayElevation = roundMm4(clampedElev);
      vy = branch.vesaHeadPos.y + (nextTrayElevation - baseTrayElev);
    }

    const effectiveDy2 = vy - ey;
    const strokeImpossible = effectiveDy2 < minStrokeDy - 2e-4 || effectiveDy2 > maxStrokeDy + 2e-4;
    const dy2 = clampScalar(effectiveDy2, minStrokeDy, maxStrokeDy);
    const h2 = Math.sqrt(Math.max(1e-4, ARM_UPPER_LENGTH ** 2 - dy2 ** 2));
    const { dMin, dMax } = armHorizontalBounds(dy2, h1);

    const { wx, wz, hitRearStop } = clampUpperDirectionToEnvelope({
      cx,
      cz,
      ex,
      ez,
      erX,
      erZ,
      h1,
      h2,
      dMin,
      dMax,
      dirX: baseDirX,
      dirZ: baseDirZ,
      rearStop: branch.rearStop,
    });

    const vx = ex + wx * h2;
    const vz = ez + wz * h2;
    const nextX = roundMm4(vx - offsetX);
    const nextZ = roundMm4(vz - offsetZ);
    const bend = recoverElbowBend(cx, cz, ex, ez, vx, vz);
    const actualUpperPitch = roundDeg1((Math.atan2(dy2, h2) * 180) / Math.PI);

    let obstacle: string | null = null;
    if (!strokeImpossible && canAccept) {
      const candidate = buildArticulatedCandidate({
        arm,
        branch,
        allItems,
        bend,
        nextX,
        nextZ,
        nextLift,
        nextTrayElevation,
      });
      obstacle = canAccept(candidate);
    }

    return {
      upperPitchDeg: actualUpperPitch,
      x: nextX,
      z: nextZ,
      lift: nextLift,
      trayElevation: nextTrayElevation,
      bend,
      heightClamped,
      hitRearStop,
      obstacle,
      strokeImpossible,
    };
  };

  const { result, blockedByObstacle, blockedByStroke } = binarySearchFeasiblePose({
    startVal: branch.upperPitchDeg,
    targetVal: clampedDesired,
    evaluate: evaluateUpperPitch,
    isValid: (res) => !res.strokeImpossible && res.obstacle === null,
  });

  const limitReason: ArmLimitReason | undefined = blockedByObstacle
    ? obstacleToLimitReason(blockedByObstacle)
    : blockedByStroke || result.heightClamped
      ? 'heightLimit'
      : result.hitRearStop
        ? 'rearStop'
        : hitPitchStop
          ? 'upperPitchLimit'
          : undefined;

  return {
    targetId: branch.target.id,
    targetType: branch.targetType,
    x: result.x,
    z: result.z,
    ...(typeof result.lift === 'number' ? { lift: result.lift } : {}),
    ...(typeof result.trayElevation === 'number' ? { trayElevation: result.trayElevation } : {}),
    bend: result.bend,
    lowerPitchDeg: roundDeg1(branch.lowerPitchDeg),
    upperPitchDeg: result.upperPitchDeg,
    limitReason,
    ...(blockedByObstacle ? { obstacleName: blockedByObstacle } : {}),
  };
}

function buildBranchKinematics({
  role,
  targetType,
  target,
  desk,
  items,
  basePos,
  turretBase,
  columnTop,
  elbowBaseY,
  lowerPitchDeg,
  lowerHoriz,
  sideBias,
  clampEdge,
  baseYaw,
  inwardX,
  inwardZ,
  rearStop,
  elbowBend = 'auto',
}: {
  role: 'primary' | 'secondary';
  targetType: 'monitor' | 'laptopTray';
  target: SceneItem;
  desk: Desk;
  items: SceneItem[];
  basePos: Vector3;
  turretBase: Vector3;
  columnTop: Vector3;
  elbowBaseY: number;
  lowerPitchDeg: number;
  lowerHoriz: number;
  sideBias: number;
  clampEdge: ArmClampEdge;
  baseYaw: number;
  inwardX: number;
  inwardZ: number;
  rearStop: EdgeStop;
  elbowBend?: ElbowBendMode;
}): ArmBranchKinematics {
  const {
    vesaPos,
    vesaNormal,
    vesaHeadPos: desiredVesaHead,
  } = resolveVesaTarget(targetType, target, desk, items);

  // Solve rigid 2-link NB F160/F80 V-arm IK (articulated fixed-length lower link + gas-spring upper link).
  const rawDy = desiredVesaHead.y - elbowBaseY;
  const { clampedDy, dyClamped, h2, dMin, dMax } = armHorizontalBounds(rawDy, lowerHoriz);

  const rawDx = desiredVesaHead.x - columnTop.x;
  const rawDz = desiredVesaHead.z - columnTop.z;
  const rawDist = Math.hypot(rawDx, rawDz);

  let limitReason: ArmLimitReason | undefined = dyClamped ? 'heightLimit' : undefined;
  let clampedDist = rawDist;
  if (rawDist > dMax + 1e-4) {
    clampedDist = dMax;
    limitReason = 'maxReach';
  } else if (rawDist < dMin - 1e-4) {
    clampedDist = dMin;
    limitReason = 'minReach';
  }

  const ux = rawDist > 1e-5 ? rawDx / rawDist : 0;
  const uz = rawDist > 1e-5 ? rawDz / rawDist : 1;
  // Unit vector perpendicular to SV_xz in horizontal XZ plane (for u=(0,1), perp=(-1,0) = left).
  const nx = -uz;
  const nz = ux;

  // Reachable VESA head strictly inside fixed-length spherical/cylindrical envelope:
  const solvedHeadPos = new Vector3(
    columnTop.x + ux * clampedDist,
    elbowBaseY + clampedDy,
    columnTop.z + uz * clampedDist,
  );

  const vesaOffset = targetType === 'monitor' ? ARM_VESA_OFFSET_MONITOR : ARM_VESA_OFFSET_TRAY;
  const solvedVesaPos =
    limitReason === undefined
      ? vesaPos
      : solvedHeadPos.clone().addScaledVector(vesaNormal, -vesaOffset);

  // Law of cosines in the flat horizontal plane y = elbowBaseY with sides (clampedDist, lowerHoriz, h2).
  const safeDist = Math.max(1e-5, clampedDist);
  const a = (lowerHoriz ** 2 - h2 ** 2 + safeDist ** 2) / (2 * safeDist);
  const b = Math.sqrt(Math.max(0, lowerHoriz ** 2 - a ** 2));
  const bendSign = elbowBend === 'left' ? 1 : elbowBend === 'right' ? -1 : sideBias >= 0 ? -1 : 1;
  const elbowActiveSide: 'left' | 'right' = bendSign >= 0 ? 'left' : 'right';

  const elbowPos = new Vector3(
    columnTop.x + a * ux + bendSign * b * nx,
    elbowBaseY,
    columnTop.z + a * uz + bendSign * b * nz,
  );
  const lowerYawDeg = roundDeg1(
    (Math.atan2(elbowPos.x - columnTop.x, elbowPos.z - columnTop.z) * 180) / Math.PI,
  );
  const upperPitchDeg = roundDeg1((Math.atan2(clampedDy, h2) * 180) / Math.PI);

  const upperFrame = computeArmSegmentFrame(elbowPos, solvedHeadPos);
  const lowerFrame = computeArmSegmentFrame(columnTop, elbowPos);

  const upperOut = elbowPos.clone().lerp(solvedHeadPos, 0.82).addScaledVector(upperFrame.up, -0.02);
  const upperIn = elbowPos.clone().lerp(solvedHeadPos, 0.18).addScaledVector(upperFrame.up, -0.02);
  const lowerOut = columnTop.clone().lerp(elbowPos, 0.82).addScaledVector(lowerFrame.up, -0.0185);
  const lowerIn = columnTop.clone().lerp(elbowPos, 0.18).addScaledVector(lowerFrame.up, -0.0185);
  const turretClip = columnTop
    .clone()
    .lerp(turretBase, 0.58)
    .add(new Vector3(-inwardX * 0.022, 0, -inwardZ * 0.022));

  return {
    role,
    targetType,
    target,
    turretBase,
    basePos,
    columnTop,
    elbowPos,
    lowerYawDeg,
    lowerPitchDeg: roundDeg1(lowerPitchDeg),
    upperPitchDeg,
    lowerHoriz,
    upperHoriz: h2,
    clampEdge,
    baseYaw,
    inwardX,
    inwardZ,
    rearStop,
    elbowBend,
    elbowActiveSide,
    vesaHeadPos: solvedHeadPos,
    vesaPos: solvedVesaPos,
    vesaNormal,
    clipPoints: [upperOut, upperIn, lowerOut, lowerIn, turretClip],
    dMin,
    dMax,
    reachDistance: rawDist,
    reachRatio: dMax > 0 ? Math.min(1, rawDist / dMax) : 1,
    clamped: Boolean(limitReason),
    limitReason,
  };
}

export function applyArmSolutionToProject(
  p: { items: SceneItem[] },
  armId: string,
  role: 'primary' | 'secondary',
  solved: {
    targetId: string;
    x: number;
    z: number;
    bend: 'left' | 'right';
    lowerPitchDeg?: number;
    lift?: number;
    trayElevation?: number;
  },
  includeLowerPitch = false,
): void {
  const bendField = role === 'primary' ? 'primaryElbowBend' : 'secondaryElbowBend';
  const pitchField = role === 'primary' ? 'primaryLowerPitchDeg' : 'secondaryLowerPitchDeg';
  const armItem = p.items.find((i) => i.id === armId);
  if (armItem?.monitorArm) {
    armItem.monitorArm[bendField] = solved.bend;
    if (includeLowerPitch && typeof solved.lowerPitchDeg === 'number') {
      armItem.monitorArm[pitchField] = solved.lowerPitchDeg;
    }
    if (typeof solved.trayElevation === 'number') {
      armItem.monitorArm.trayElevation = solved.trayElevation;
    }
  }
  const targetItem = p.items.find((i) => i.id === solved.targetId);
  if (targetItem) {
    targetItem.x = solved.x;
    targetItem.z = solved.z;
    if (typeof solved.lift === 'number') {
      targetItem.lift = solved.lift;
    }
  }
}

export type ArmBaseMoveSolution = {
  clampEdge: ArmClampEdge;
  clampX: number;
  clampZ: number;
  baseYaw: number;
  updatedTargets: { id: string; x: number; z: number; lift?: number }[];
  limitReason?: ArmLimitReason;
  obstacleName?: string;
};

export type ArmBaseCollisionChecker = (candidate: {
  arm: SceneItem;
  items: SceneItem[];
}) => string | null;

export function applyArmBaseSolutionToProject(
  p: { items: SceneItem[] },
  armId: string,
  solved: {
    clampEdge: ArmClampEdge;
    clampX: number;
    clampZ: number;
    updatedTargets: { id: string; x: number; z: number; lift?: number }[];
  },
): void {
  const armItem = p.items.find((i) => i.id === armId);
  if (armItem?.monitorArm) {
    armItem.monitorArm.clampEdge = solved.clampEdge;
    armItem.monitorArm.clampX = solved.clampX;
    armItem.monitorArm.clampZ = solved.clampZ;
  }
  const byId = new Map(solved.updatedTargets.map((t) => [t.id, t]));
  for (const item of p.items) {
    const moved = byId.get(item.id);
    if (moved) {
      item.x = moved.x;
      item.z = moved.z;
      if (typeof moved.lift === 'number') {
        item.lift = moved.lift;
      }
    }
  }
}

/**
 * Resolves moving the monitor arm base `(clampEdge, clampX, clampZ)` along desk edges
 * (back/left/right) or onto the interior desktop surface/grommet, snapping smoothly to rims,
 * tethering mounted displays/laptops within rigid link reach `[dMin, dMax]`, and stopping cleanly
 * before obstacle collisions.
 */
export function solveArmBaseMove({
  arm,
  desk,
  allItems,
  desiredX,
  desiredZ,
  forcedEdge,
  snapToEdges = true,
  canAccept,
}: {
  arm: SceneItem;
  desk: Desk;
  allItems: SceneItem[];
  desiredX: number;
  desiredZ: number;
  forcedEdge?: ArmClampEdge;
  snapToEdges?: boolean;
  canAccept?: ArmBaseCollisionChecker;
}): ArmBaseMoveSolution {
  const cfg = arm.monitorArm!;
  const isInverted = cfg.mountOrientation === 'inverted';
  const candidates = collectArmCandidates(arm, allItems);
  const targets = candidates.map((c) => c.target);
  const startBase = resolveArmBasePlacement(arm, desk, targets);
  const rects = deskSupportRects(desk);
  const main = rects[0];
  const bounds = deskBounds(desk);
  const backZ = main.minZ + 0.036;

  const snapPlacementAt = (rx: number, rz: number): ArmBasePlacement => {
    if (isInverted) {
      return resolveArmBasePlacement(
        { ...arm, monitorArm: { ...cfg, clampEdge: 'back', clampX: rx, clampZ: backZ } },
        desk,
        targets,
      );
    }
    if (forcedEdge) {
      return resolveArmBasePlacement(
        { ...arm, monitorArm: { ...cfg, clampEdge: forcedEdge, clampX: rx, clampZ: rz } },
        desk,
        targets,
      );
    }
    if (!snapToEdges) {
      return resolveArmBasePlacement(
        { ...arm, monitorArm: { ...cfg, clampEdge: 'surface', clampX: rx, clampZ: rz } },
        desk,
        targets,
      );
    }

    const clampedZForSide = clampScalar(rz, bounds.minZ + 0.08, bounds.maxZ - 0.08);
    const rectZ =
      rects.find((r) => clampedZForSide >= r.minZ - 0.01 && clampedZForSide <= r.maxZ + 0.01) ??
      main;
    const edgeTol = 0.062;
    const distBack = Math.abs(rz - backZ);
    const distLeft = Math.abs(rx - (rectZ.minX + 0.036));
    const distRight = Math.abs(rx - (rectZ.maxX - 0.036));

    const options: { edge: ArmClampEdge; dist: number; forcedOutside: boolean }[] = [
      { edge: 'back', dist: distBack, forcedOutside: rz <= main.minZ + 0.055 },
      { edge: 'left', dist: distLeft, forcedOutside: rx <= rectZ.minX + 0.055 },
      { edge: 'right', dist: distRight, forcedOutside: rx >= rectZ.maxX - 0.055 },
    ];
    const qualifying = options.filter((o) => o.forcedOutside || o.dist <= edgeTol);
    if (qualifying.length > 0) {
      qualifying.sort((a, b) => a.dist - b.dist);
      return resolveArmBasePlacement(
        { ...arm, monitorArm: { ...cfg, clampEdge: qualifying[0].edge, clampX: rx, clampZ: rz } },
        desk,
        targets,
      );
    }

    let sx = rx;
    let sz = rz;
    const grommet = grommetPosition(desk);
    if (grommet && Math.hypot(rx - grommet.x, rz - grommet.z) <= 0.055) {
      sx = grommet.x;
      sz = grommet.z;
    }
    return resolveArmBasePlacement(
      { ...arm, monitorArm: { ...cfg, clampEdge: 'surface', clampX: sx, clampZ: sz } },
      desk,
      targets,
    );
  };

  const evaluateAt = (rx: number, rz: number) => {
    const placement = snapPlacementAt(rx, rz);
    const nextArm: SceneItem = {
      ...arm,
      monitorArm: {
        ...cfg,
        clampEdge: placement.clampEdge,
        clampX: placement.x,
        clampZ: placement.z,
      },
    };
    let nextItems = allItems.map((it) => (it.id === arm.id ? nextArm : it));
    const updatedTargets: { id: string; x: number; z: number; lift?: number }[] = [];
    for (const c of candidates) {
      const currentTarget = nextItems.find((it) => it.id === c.target.id) ?? c.target;
      const bounded = constrainTargetToMonitorArm(
        currentTarget,
        currentTarget.x,
        currentTarget.z,
        currentTarget.lift,
        nextArm,
        c.role,
        c.targetType,
        nextItems,
        desk,
      );
      if (
        Math.abs(bounded.x - currentTarget.x) > 1e-4 ||
        Math.abs(bounded.z - currentTarget.z) > 1e-4 ||
        (typeof bounded.lift === 'number' &&
          Math.abs(bounded.lift - (currentTarget.lift ?? 0)) > 1e-4)
      ) {
        const updated: SceneItem = {
          ...currentTarget,
          x: bounded.x,
          z: bounded.z,
          ...(typeof bounded.lift === 'number' ? { lift: bounded.lift } : {}),
        };
        updatedTargets.push({
          id: updated.id,
          x: updated.x,
          z: updated.z,
          ...(typeof updated.lift === 'number' ? { lift: updated.lift } : {}),
        });
        nextItems = nextItems.map((it) => (it.id === updated.id ? updated : it));
      }
    }
    const obstacle = canAccept ? canAccept({ arm: nextArm, items: nextItems }) : null;
    return { placement, updatedTargets, obstacle };
  };

  const startRes = evaluateAt(startBase.x, startBase.z);
  const targetRes = evaluateAt(desiredX, desiredZ);

  let picked = targetRes;
  let blockedObstacle: string | null = null;

  if (canAccept && targetRes.obstacle !== null) {
    if (startRes.obstacle !== null) {
      // Already overlapping an obstacle and target still overlaps: hold position cleanly.
      picked = startRes;
      blockedObstacle = startRes.obstacle;
    } else {
      let lo = 0;
      let hi = 1;
      let lastValid = startRes;
      let firstObs = targetRes.obstacle;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const probe = evaluateAt(
          startBase.x + (desiredX - startBase.x) * t,
          startBase.z + (desiredZ - startBase.z) * t,
        );
        if (probe.obstacle !== null) {
          hi = t;
          firstObs = probe.obstacle;
          break;
        }
        lo = t;
        lastValid = probe;
      }
      for (let iter = 0; iter < 12; iter++) {
        const mid = (lo + hi) / 2;
        const probe = evaluateAt(
          startBase.x + (desiredX - startBase.x) * mid,
          startBase.z + (desiredZ - startBase.z) * mid,
        );
        if (probe.obstacle === null) {
          lo = mid;
          lastValid = probe;
        } else {
          hi = mid;
          firstObs = probe.obstacle;
        }
      }
      picked = lastValid;
      blockedObstacle = firstObs;
    }
  }

  const limitReason: ArmLimitReason | undefined = blockedObstacle
    ? obstacleToLimitReason(blockedObstacle)
    : undefined;

  return {
    clampEdge: picked.placement.clampEdge,
    clampX: picked.placement.x,
    clampZ: picked.placement.z,
    baseYaw: picked.placement.baseYaw,
    updatedTargets: picked.updatedTargets,
    limitReason,
    ...(blockedObstacle ? { obstacleName: blockedObstacle } : {}),
  };
}

/**
 * Computes full single/dual/inverted arm + NB FP-2 laptop tray fixed-link IK kinematics.
 */
export function computeMonitorArmSystem(
  arm: SceneItem,
  items: SceneItem[],
  desk: Desk,
): MonitorArmSystemKinematics {
  const cfg = arm.monitorArm;
  const isDual = cfg?.armStyle === 'dual';
  const isInverted = cfg?.mountOrientation === 'inverted';
  const invertedHeight = cfg?.invertedHeight ?? DEFAULT_INVERTED_HEIGHT;
  const clampSide = cfg?.clampSide ?? 'center';
  const candidates = collectArmCandidates(arm, items);

  const basePlacement = resolveArmBasePlacement(
    arm,
    desk,
    candidates.map((c) => c.target),
  );
  const basePos = new Vector3(
    basePlacement.x,
    isInverted ? desk.height + invertedHeight : desk.height,
    basePlacement.z,
  );

  const branches: ArmBranchKinematics[] = candidates.map((c) => {
    const { turretBase, columnTop, elbowBaseY, lowerPitchDeg, lowerHoriz, sideBias, rearStop } =
      resolveBranchPlacement(
        c.role,
        candidates,
        basePlacement,
        clampSide,
        basePos,
        desk,
        isDual,
        isInverted,
        cfg,
      );
    const elbowBend =
      (c.role === 'primary' ? cfg?.primaryElbowBend : cfg?.secondaryElbowBend) ?? 'auto';
    return buildBranchKinematics({
      role: c.role,
      targetType: c.targetType,
      target: c.target,
      desk,
      items,
      basePos,
      turretBase,
      columnTop,
      elbowBaseY,
      lowerPitchDeg,
      lowerHoriz,
      sideBias,
      clampEdge: basePlacement.clampEdge,
      baseYaw: basePlacement.baseYaw,
      inwardX: basePlacement.inwardX,
      inwardZ: basePlacement.inwardZ,
      rearStop,
      elbowBend,
    });
  });

  const minPostX = -desk.width / 2 + 0.05;
  const maxPostX = desk.width / 2 - 0.05;
  const gantryHalfSpan = Math.max(0.32, Math.min(0.58, desk.width * 0.42));
  const gantryLeftX = Math.max(minPostX, basePlacement.x - gantryHalfSpan);
  const gantryRightX = Math.min(maxPostX, basePlacement.x + gantryHalfSpan);

  return {
    basePos,
    clampX: basePlacement.x,
    clampZ: basePlacement.z,
    clampEdge: basePlacement.clampEdge,
    baseYaw: basePlacement.baseYaw,
    isDual,
    isInverted,
    invertedHeight,
    gantryLeftX,
    gantryRightX,
    branches,
  };
}

/**
 * Single-arm kinematics wrapper preserving original API for unit tests and single-target routing.
 */
export function computeMonitorArmKinematics(
  monitor: SceneItem,
  arm: SceneItem,
  desk: Desk,
): MonitorArmKinematics {
  const sys = computeMonitorArmSystem(arm, [monitor], desk);
  const found = sys.branches.find((b) => b.target.id === monitor.id);
  if (found) return found;
  const turretBase = new Vector3(sys.basePos.x, sys.basePos.y, sys.basePos.z);
  const columnTop = new Vector3(
    sys.basePos.x,
    sys.isInverted
      ? sys.basePos.y - ARM_TURRET_HEIGHT_INVERTED
      : sys.basePos.y + ARM_TURRET_HEIGHT_UPRIGHT,
    sys.basePos.z,
  );
  const lowerPitchDeg = resolveBranchLowerPitchDeg(arm.monitorArm, 'primary', sys.isInverted);
  const { dy1, h1 } = lowerArmGeometry(lowerPitchDeg);
  const elbowBaseY = columnTop.y + dy1;
  const rearStop = edgeStopForColumn(sys.clampEdge, columnTop, desk);
  return buildBranchKinematics({
    role: 'primary',
    targetType: 'monitor',
    target: monitor,
    desk,
    items: [monitor],
    basePos: sys.basePos,
    turretBase,
    columnTop,
    elbowBaseY,
    lowerPitchDeg,
    lowerHoriz: h1,
    sideBias: arm.monitorArm?.clampSide === 'left' ? -1 : 1,
    clampEdge: sys.clampEdge,
    baseYaw: sys.baseYaw,
    inwardX: sys.clampEdge === 'left' ? 1 : sys.clampEdge === 'right' ? -1 : 0,
    inwardZ: sys.clampEdge === 'back' || sys.clampEdge === 'surface' ? 1 : 0,
    rearStop,
    elbowBend: arm.monitorArm?.primaryElbowBend ?? 'auto',
  });
}

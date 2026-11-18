import { Vector3 } from 'three';
import { cableEffectiveLengths, cableMeta, type Cable } from './cable';
import {
  findContainingHole,
  getSceneCableHoles,
  getSceneSolidBoxes,
  projectCablePointClear,
  resolveCablePathClearance,
  type CableHole,
} from './collision';
import { deskBackWallBounds } from './desk';
import { armMountedLaptopIds, armMountedMonitorIds } from './laptop';
import {
  computeArmSegmentFrame,
  computeMonitorArmKinematics,
  computeMonitorArmSystem,
  type ArmBranchKinematics,
  type ArmSegmentFrame,
  type MonitorArmKinematics,
  type MonitorArmSystemKinematics,
} from './monitorArm';
import { devicePortWorld } from './ports';
import type { Desk, Project, SceneItem } from './project';

export {
  computeArmSegmentFrame,
  computeMonitorArmKinematics,
  computeMonitorArmSystem,
  type ArmBranchKinematics,
  type ArmSegmentFrame,
  type MonitorArmKinematics,
  type MonitorArmSystemKinematics,
};

export type ResolvedCablePath = {
  points: Vector3[];
  /** Editable interior control nodes (used to draw 3D handles & fine-tune positions). */
  controlPoints: Vector3[];
  passedHoles: { id: string; label: string; point: Vector3 }[];
  fromPlug?: { position: Vector3; direction: Vector3 };
  toPlug?: { position: Vector3; direction: Vector3 };
  pathLengthM: number;
  shortfallM: number;
  collisionAdjusted: boolean;
};

function polylineLength(points: Vector3[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += points[i].distanceTo(points[i - 1]);
  }
  return len;
}

function deskSurfaceY(desk: Desk, itemId: string, items: SceneItem[]): number {
  const item = items.find((i) => i.id === itemId);
  if (item && !desk.return && desk.shelf?.enabled && item.surface === 'shelf') {
    return desk.height + desk.shelf.height;
  }
  return desk.height;
}

function appendArmPoints(
  points: Vector3[],
  deviceItem: SceneItem,
  cable: Cable,
  project: Project,
  reverse: boolean,
) {
  if (!cable.routeViaArm) return;
  const arm = project.items.find(
    (i) =>
      i.kind === 'monitorArm' &&
      i.monitorArm?.cableClip &&
      (armMountedMonitorIds(i.monitorArm).includes(deviceItem.id) ||
        armMountedLaptopIds(i.monitorArm).includes(deviceItem.id)),
  );
  if (!arm) return;
  const sys = computeMonitorArmSystem(arm, project.items, project.desk);
  const branch = sys.branches.find((b) => b.target.id === deviceItem.id);
  if (!branch) return;
  const clips = reverse ? [...branch.clipPoints].reverse() : branch.clipPoints;
  points.push(...clips);
}

function detectPassedHoles(points: Vector3[], radius: number, holes: CableHole[]) {
  const passed: { id: string; label: string; point: Vector3 }[] = [];
  for (const h of holes) {
    let hit = false;
    for (let i = 0; i < points.length; i++) {
      if (findContainingHole(points[i], radius, [h])) {
        hit = true;
        break;
      }
      if (i > 0) {
        const mid = new Vector3().lerpVectors(points[i - 1], points[i], 0.5);
        if (findContainingHole(mid, radius, [h])) {
          hit = true;
          break;
        }
      }
    }
    if (hit) passed.push({ id: h.id, label: h.label, point: h.center.clone() });
  }
  return passed;
}

export function computeCablePath(cable: Cable, project: Project): ResolvedCablePath | null {
  const { desk, items } = project;
  if (cable.from.type !== 'device') return null;
  const fromEp = cable.from;

  const fromItem = items.find((i) => i.id === fromEp.itemId);
  if (!fromItem) return null;
  const fromPort = devicePortWorld(fromItem, fromEp.portId, desk, items);
  if (!fromPort) return null;

  const spec = cableMeta[cable.kind];
  const { totalM } = cableEffectiveLengths(cable);
  const holes = getSceneCableHoles(project);
  const grommetHole = holes.find((h) => h.kind === 'grommet') ?? null;

  const startTip = fromPort.position.clone().addScaledVector(fromPort.direction, spec.connectorLen);
  const startLead = startTip.clone().addScaledVector(fromPort.direction, 0.032);

  let toPort: { position: Vector3; direction: Vector3 } | undefined;
  let toItem: SceneItem | undefined;
  let endTip: Vector3 | undefined;
  let endLead: Vector3 | undefined;

  if (cable.to.type === 'device') {
    const toEp = cable.to;
    toItem = items.find((i) => i.id === toEp.itemId);
    if (!toItem) return null;
    const foundTo = devicePortWorld(toItem, toEp.portId, desk, items);
    if (!foundTo) return null;
    toPort = foundTo;
    endTip = toPort.position.clone().addScaledVector(toPort.direction, spec.connectorLen);
    endLead = endTip.clone().addScaledVector(toPort.direction, 0.032);
  }

  const allowedItemIds = new Set<string>([fromItem.id, ...(toItem ? [toItem.id] : [])]);
  const solids = getSceneSolidBoxes(project);

  // If the user customized waypoints manually, clamp each node against solids & holes and wire through them directly.
  if (cable.waypoints && cable.waypoints.length > 0) {
    const clampedControls = cable.waypoints.map(
      (wp) =>
        projectCablePointClear(
          new Vector3(wp.x, wp.y, wp.z),
          spec.radius,
          solids,
          holes,
          allowedItemIds,
        ).point,
    );
    const raw =
      toPort && endLead && endTip
        ? [startTip, startLead, ...clampedControls, endLead, endTip]
        : [startTip, startLead, ...clampedControls];
    const resolved = resolveCablePathClearance(raw, spec.radius, solids, holes, allowedItemIds);
    const pathLengthM =
      Math.round((polylineLength(resolved.points) + spec.connectorLen * 2) * 1000) / 1000;
    return {
      points: resolved.points,
      controlPoints: clampedControls,
      passedHoles: detectPassedHoles(resolved.points, spec.radius, holes),
      fromPlug: fromPort,
      ...(toPort ? { toPlug: toPort } : {}),
      pathLengthM,
      shortfallM: Math.max(0, Math.round((pathLengthM - totalM) * 1000) / 1000),
      collisionAdjusted: resolved.adjusted,
    };
  }

  // Otherwise build smart hole-aware + collision-safe auto route, exposing clean interior `controlPoints`.
  const interior: Vector3[] = [];
  const wall = deskBackWallBounds(desk);
  const safeBackZ = (preferredZ: number) =>
    wall ? Math.max(wall.frontZ + spec.radius + 0.008, preferredZ) : preferredZ;

  // 1) Optional monitor stand oval cutout routing on `fromItem`
  const fromStandHole =
    cable.viaStandSlot !== false && fromItem.kind === 'monitor'
      ? holes.find((h) => h.kind === 'standSlot' && h.itemId === fromItem.id)
      : undefined;
  const preArm: Vector3[] = [startLead.clone()];
  appendArmPoints(preArm, fromItem, cable, project, false);
  const hasFromArmClips = preArm.length > 1;
  if (hasFromArmClips) {
    interior.push(...preArm.slice(1));
  } else if (fromStandHole && !fromPort.direction.equals(new Vector3(0, 0, 1))) {
    interior.push(fromStandHole.entry.clone(), fromStandHole.exit.clone());
  }

  const last = interior[interior.length - 1] ?? startLead;
  const dropMode = cable.drop ?? (cable.to.type === 'floor' ? cable.to.drop : 'auto');
  const allowGrommet =
    dropMode === 'grommet' ? Boolean(grommetHole) : dropMode === 'auto' && Boolean(grommetHole);

  if (cable.to.type === 'device' && toItem && endLead && endTip) {
    const fromBelowDesk = fromPort.position.y < desk.height - 0.04;
    const toBelowDesk = toPort!.position.y < desk.height - 0.04;

    if (fromBelowDesk && toBelowDesk) {
      const lowY = Math.max(0.02, Math.min(last.y, endLead.y));
      const backZ = safeBackZ(Math.min(-desk.depth / 2 + 0.04, last.z, endLead.z));
      interior.push(new Vector3(last.x, lowY, backZ), new Vector3(endLead.x, lowY, backZ));
    } else if (fromBelowDesk || toBelowDesk) {
      const deckY = desk.height + 0.012;
      const hole = allowGrommet ? grommetHole : null;
      const dropX = hole
        ? hole.center.x
        : Math.max(
            -desk.width / 2 + 0.08,
            Math.min(desk.width / 2 - 0.08, (last.x + endLead.x) * 0.5),
          );
      const dropZ = hole ? hole.center.z : safeBackZ(-desk.depth / 2 - 0.022);
      if (toBelowDesk) {
        if (hole) {
          interior.push(
            new Vector3(last.x, deckY, Math.min(last.z, dropZ)),
            hole.entry.clone(),
            hole.exit.clone(),
          );
        } else {
          interior.push(
            new Vector3(last.x, deckY, Math.min(last.z, dropZ)),
            new Vector3(dropX, deckY, dropZ),
            new Vector3(dropX, desk.height - 0.05, dropZ),
          );
        }
        interior.push(
          new Vector3(
            endLead.x,
            Math.max(0.022, Math.min(endLead.y, desk.height - 0.05)),
            safeBackZ(endLead.z),
          ),
        );
      } else {
        interior.push(
          new Vector3(
            last.x,
            Math.max(0.022, Math.min(last.y, desk.height - 0.05)),
            safeBackZ(last.z),
          ),
        );
        if (hole) {
          interior.push(
            hole.exit.clone(),
            hole.entry.clone(),
            new Vector3(endLead.x, deckY, Math.min(endLead.z, dropZ)),
          );
        } else {
          interior.push(
            new Vector3(dropX, desk.height - 0.05, dropZ),
            new Vector3(dropX, deckY, dropZ),
            new Vector3(endLead.x, deckY, Math.min(endLead.z, dropZ)),
          );
        }
      }
    } else {
      const fromY = deskSurfaceY(desk, fromItem.id, items);
      const toY = deskSurfaceY(desk, toItem.id, items);
      const runY = Math.max(fromY, toY) + 0.012;
      const backZ = safeBackZ(Math.min(-desk.depth / 2 + 0.06, last.z, endLead.z));
      interior.push(new Vector3(last.x, runY, backZ), new Vector3(endLead.x, runY, backZ));
    }

    const toStandHole =
      cable.viaStandSlot !== false && toItem.kind === 'monitor'
        ? holes.find((h) => h.kind === 'standSlot' && h.itemId === toItem.id)
        : undefined;
    const toArm: Vector3[] = [];
    appendArmPoints(toArm, toItem, cable, project, true);
    if (toArm.length > 0) {
      interior.push(...toArm);
    } else if (toStandHole) {
      interior.push(toStandHole.exit.clone(), toStandHole.entry.clone());
    }

    const controlPoints = interior.length > 0 ? interior : [startLead.clone().lerp(endLead, 0.5)];
    const raw = [startTip, startLead, ...controlPoints, endLead, endTip];
    const resolved = resolveCablePathClearance(raw, spec.radius, solids, holes, allowedItemIds);
    const pathLengthM =
      Math.round((polylineLength(resolved.points) + spec.connectorLen * 2) * 1000) / 1000;
    return {
      points: resolved.points,
      controlPoints,
      passedHoles: detectPassedHoles(resolved.points, spec.radius, holes),
      fromPlug: fromPort,
      toPlug: toPort,
      pathLengthM,
      shortfallM: Math.max(0, Math.round((pathLengthM - totalM) * 1000) / 1000),
      collisionAdjusted: resolved.adjusted,
    };
  }

  // Drop to under-desk floor via grommet (when enabled/auto) or back edge
  if (allowGrommet && grommetHole) {
    interior.push(
      grommetHole.entry.clone(),
      grommetHole.exit.clone(),
      new Vector3(
        grommetHole.center.x,
        Math.max(0.08, desk.height * 0.25),
        safeBackZ(grommetHole.center.z - 0.03),
      ),
      new Vector3(grommetHole.center.x, 0.04, safeBackZ(grommetHole.center.z - 0.05)),
    );
  } else {
    const dropX = Math.max(-desk.width / 2 + 0.06, Math.min(desk.width / 2 - 0.06, last.x));
    const edgeZ = -desk.depth / 2;
    const backDropZ = safeBackZ(edgeZ - 0.025);
    interior.push(
      new Vector3(dropX, desk.height + 0.015, edgeZ + 0.04),
      new Vector3(dropX, desk.height - 0.01, backDropZ),
      new Vector3(dropX, Math.max(0.1, desk.height * 0.4), safeBackZ(edgeZ - 0.04)),
      new Vector3(dropX, 0.04, safeBackZ(edgeZ - 0.03)),
    );
  }

  const prelimRaw = [startTip, startLead, ...interior];
  const basePathLen = Math.round((polylineLength(prelimRaw) + spec.connectorLen * 2) * 1000) / 1000;
  const extraSlack = Math.max(0, totalM - basePathLen);
  if (extraSlack > 0.06) {
    const tail = interior[interior.length - 1];
    const spread = Math.min(0.32, extraSlack * 0.35);
    interior.push(
      new Vector3(tail.x + spread * 0.35, 0.016, safeBackZ(tail.z - spread * 0.55)),
      new Vector3(tail.x + spread * 0.7, 0.012, safeBackZ(tail.z - spread * 0.25)),
    );
  }

  const raw = [startTip, startLead, ...interior];
  const resolved = resolveCablePathClearance(raw, spec.radius, solids, holes, allowedItemIds);

  return {
    points: resolved.points,
    controlPoints: interior,
    passedHoles: detectPassedHoles(resolved.points, spec.radius, holes),
    fromPlug: fromPort,
    pathLengthM: basePathLen,
    shortfallM: Math.max(0, Math.round((basePathLen - totalM) * 1000) / 1000),
    collisionAdjusted: resolved.adjusted,
  };
}

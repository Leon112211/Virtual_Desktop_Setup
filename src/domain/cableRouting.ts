import { Vector3 } from 'three';
import { cableEffectiveLengths, cableMeta, plugConnectorLen, type Cable } from './cable';
import { solveStaticCablePhysics, type CableGuideAnchor } from './cablePhysics';
import {
  findContainingHole,
  getSceneCableHoles,
  getSceneSolidBoxes,
  projectCablePointClear,
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
import { devicePorts, devicePortWorld, isPortKind } from './ports';
import type { PlugSpecKind } from './power';
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

function sampleInteriorControlPoints(points: Vector3[], skipHead = 2, skipTail = 2): Vector3[] {
  const start = Math.min(points.length, skipHead);
  const end = Math.max(start, points.length - skipTail);
  const interior = points.slice(start, end);
  if (interior.length === 0) {
    return points.length >= 2
      ? [new Vector3().lerpVectors(points[0], points[points.length - 1], 0.5)]
      : [];
  }
  const targetCount = Math.min(5, Math.max(2, Math.round(interior.length / 6)));
  if (interior.length <= targetCount) return interior.map((p) => p.clone());
  const sampled: Vector3[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.round((i / (targetCount - 1)) * (interior.length - 1));
    const pt = interior[idx];
    if (sampled.length === 0 || sampled[sampled.length - 1].distanceTo(pt) > 0.02) {
      sampled.push(pt.clone());
    }
  }
  return sampled;
}

function resolveRoutingPlugType(
  item: SceneItem,
  portId: string,
  cableKind: Cable['kind'],
  explicit?: PlugSpecKind,
): PlugSpecKind | undefined {
  if (explicit) return explicit;
  const isOutlet = item.kind === 'powerStrip' || item.kind === 'wallOutlet';
  if (isOutlet && portId.startsWith('slot-')) {
    if (cableKind === 'power') return 'cn3Pin';
    if (cableKind === 'usbc') return 'ganAdapter';
    if (cableKind === 'magsafe') return 'appleDuckhead';
  }
  if ((cableKind === 'dp' || cableKind === 'usbc') && isPortKind(item.kind)) {
    const portSpec = devicePorts(item).find((p) => p.id === portId);
    if (portSpec?.kind === 'dp') return 'dp';
    if (portSpec?.kind === 'usbc') return 'usbc';
  }
  return undefined;
}

function projectGuidesOntoSettledCurve(
  guides: Vector3[],
  points: Vector3[],
  hasToPort: boolean,
): Vector3[] {
  const candidates = hasToPort ? points.slice(2, Math.max(2, points.length - 2)) : points.slice(2);
  if (candidates.length === 0) return guides;
  return guides.map((g) => {
    let best = candidates[0];
    let bestD2 = Infinity;
    for (const c of candidates) {
      const dx = c.x - g.x;
      const dz = c.z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = c;
      }
    }
    return best.clone();
  });
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
  const resolvedFromPlug = resolveRoutingPlugType(
    fromItem,
    fromEp.portId,
    cable.kind,
    cable.fromPlugType,
  );
  const fromConnLen = plugConnectorLen(cable.kind, resolvedFromPlug);
  const holes = getSceneCableHoles(project);
  const grommetHole = holes.find((h) => h.kind === 'grommet') ?? null;

  const startTip = fromPort.position.clone().addScaledVector(fromPort.direction, fromConnLen);
  const startLead = startTip.clone().addScaledVector(fromPort.direction, 0.032);

  let toPort: { position: Vector3; direction: Vector3 } | undefined;
  let toItem: SceneItem | undefined;
  let endTip: Vector3 | undefined;
  let endLead: Vector3 | undefined;
  let resolvedToPlug: PlugSpecKind | undefined;

  if (cable.to.type === 'device') {
    const toEp = cable.to;
    toItem = items.find((i) => i.id === toEp.itemId);
    if (!toItem) return null;
    const foundTo = devicePortWorld(toItem, toEp.portId, desk, items);
    if (!foundTo) return null;
    toPort = foundTo;
    resolvedToPlug = resolveRoutingPlugType(toItem, toEp.portId, cable.kind, cable.toPlugType);
    const toConnLen = plugConnectorLen(cable.kind, resolvedToPlug);
    endTip = toPort.position.clone().addScaledVector(toPort.direction, toConnLen);
    endLead = endTip.clone().addScaledVector(toPort.direction, 0.032);
  }

  const { bodyM, bothConnectorsM } = cableEffectiveLengths({
    kind: cable.kind,
    lengthM: cable.lengthM,
    lengthIncludesConnectors: cable.lengthIncludesConnectors,
    fromPlugType: resolvedFromPlug,
    toPlugType: resolvedToPlug,
  });

  const allowedItemIds = new Set<string>([fromItem.id, ...(toItem ? [toItem.id] : [])]);
  const solids = getSceneSolidBoxes(project);

  // If the user customized waypoints manually, clamp each node against solids & holes,
  // then simulate FULL gravity (-Y) & continuous anti-clipping clearance while preserving horizontal XZ guides.
  if (cable.waypoints && cable.waypoints.length > 0) {
    let preClamped = false;
    const clampedControls = cable.waypoints.map((wp) => {
      const res = projectCablePointClear(
        new Vector3(wp.x, wp.y, wp.z),
        spec.radius,
        solids,
        holes,
        allowedItemIds,
      );
      if (res.adjusted) preClamped = true;
      return res.point;
    });
    const anchors: CableGuideAnchor[] = [
      { point: startTip, pinned: true, hardPin: true, tangent: fromPort.direction },
      { point: startLead, pinned: true, hardPin: true, tangent: fromPort.direction },
      ...clampedControls.map((pt) => ({
        point: pt,
        pinned: false,
        hardPin: false,
        horizontalGuide: true,
      })),
      ...(toPort && endLead && endTip
        ? [
            {
              point: endLead,
              pinned: true,
              hardPin: true,
              tangent: toPort.direction.clone().negate(),
            },
            {
              point: endTip,
              pinned: true,
              hardPin: true,
              tangent: toPort.direction.clone().negate(),
            },
          ]
        : []),
    ];
    const solved = solveStaticCablePhysics({
      anchors,
      bodyM,
      radius: spec.radius,
      stiffness: spec.bendingStiffness,
      minInteriorAngleDeg: spec.minInteriorAngleDeg,
      solids,
      holes,
      allowedItemIds,
      freeTail: !toPort,
    });
    const settledControls = projectGuidesOntoSettledCurve(
      clampedControls,
      solved.points,
      Boolean(toPort),
    );
    const pathLengthM = Math.round((solved.pathBodyLengthM + bothConnectorsM) * 1000) / 1000;
    return {
      points: solved.points,
      controlPoints: settledControls,
      passedHoles: detectPassedHoles(solved.points, spec.radius, holes),
      fromPlug: fromPort,
      ...(toPort ? { toPlug: toPort } : {}),
      pathLengthM,
      shortfallM: solved.shortfallM,
      collisionAdjusted: solved.collisionAdjusted || preClamped,
    };
  }

  // Build hole-aware & topology-safe initial guide anchors; only physical clips, holes,
  // and plugged port boots are pinned, letting unconstrained spans settle under gravity & resilience.
  const anchors: CableGuideAnchor[] = [
    { point: startTip, pinned: true, tangent: fromPort.direction },
    { point: startLead, pinned: true, tangent: fromPort.direction },
  ];
  const wall = deskBackWallBounds(desk);
  const safeBackZ = (preferredZ: number) =>
    wall ? Math.max(wall.frontZ + spec.radius + 0.008, preferredZ) : preferredZ;

  // 1) Optional monitor arm clips (pinned) or monitor stand oval cutout routing on `fromItem`
  const fromStandHole =
    cable.viaStandSlot !== false && fromItem.kind === 'monitor'
      ? holes.find((h) => h.kind === 'standSlot' && h.itemId === fromItem.id)
      : undefined;
  const preArm: Vector3[] = [startLead.clone()];
  appendArmPoints(preArm, fromItem, cable, project, false);
  const hasFromArmClips = preArm.length > 1;
  if (hasFromArmClips) {
    for (const pt of preArm.slice(1)) anchors.push({ point: pt, pinned: true });
  } else if (fromStandHole && !fromPort.direction.equals(new Vector3(0, 0, 1))) {
    anchors.push(
      { point: fromStandHole.entry.clone(), pinned: true },
      { point: fromStandHole.exit.clone(), pinned: true },
    );
  }

  const last = anchors[anchors.length - 1].point;
  const dropMode = cable.drop ?? (cable.to.type === 'floor' ? cable.to.drop : 'auto');
  const allowGrommet =
    dropMode === 'grommet' ? Boolean(grommetHole) : dropMode === 'auto' && Boolean(grommetHole);

  if (cable.to.type === 'device' && toItem && endLead && endTip) {
    const fromBelowDesk = fromPort.position.y < desk.height - 0.04;
    const toBelowDesk = toPort!.position.y < desk.height - 0.04;

    if (fromBelowDesk && toBelowDesk) {
      const lowY = Math.max(0.02, Math.min(last.y, endLead.y));
      const backZ = safeBackZ(Math.min(-desk.depth / 2 + 0.04, last.z, endLead.z));
      anchors.push(
        { point: new Vector3(last.x, lowY, backZ), pinned: false },
        { point: new Vector3(endLead.x, lowY, backZ), pinned: false },
      );
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
          anchors.push(
            { point: new Vector3(last.x, deckY, Math.min(last.z, dropZ)), pinned: false },
            { point: hole.entry.clone(), pinned: true },
            { point: hole.exit.clone(), pinned: true },
          );
        } else {
          anchors.push(
            { point: new Vector3(last.x, deckY, Math.min(last.z, dropZ)), pinned: false },
            { point: new Vector3(dropX, deckY, dropZ), pinned: false },
            { point: new Vector3(dropX, desk.height - 0.05, dropZ), pinned: false },
          );
        }
        anchors.push({
          point: new Vector3(
            endLead.x,
            Math.max(0.022, Math.min(endLead.y, desk.height - 0.05)),
            safeBackZ(endLead.z),
          ),
          pinned: false,
        });
      } else {
        anchors.push({
          point: new Vector3(
            last.x,
            Math.max(0.022, Math.min(last.y, desk.height - 0.05)),
            safeBackZ(last.z),
          ),
          pinned: false,
        });
        if (hole) {
          anchors.push(
            { point: hole.exit.clone(), pinned: true },
            { point: hole.entry.clone(), pinned: true },
            { point: new Vector3(endLead.x, deckY, Math.min(endLead.z, dropZ)), pinned: false },
          );
        } else {
          anchors.push(
            { point: new Vector3(dropX, desk.height - 0.05, dropZ), pinned: false },
            { point: new Vector3(dropX, deckY, dropZ), pinned: false },
            { point: new Vector3(endLead.x, deckY, Math.min(endLead.z, dropZ)), pinned: false },
          );
        }
      }
    } else {
      const fromY = deskSurfaceY(desk, fromItem.id, items);
      const toY = deskSurfaceY(desk, toItem.id, items);
      const runY = Math.max(fromY, toY) + 0.012;
      const backZ = safeBackZ(Math.min(-desk.depth / 2 + 0.06, last.z, endLead.z));
      anchors.push(
        { point: new Vector3(last.x, runY, backZ), pinned: false },
        { point: new Vector3(endLead.x, runY, backZ), pinned: false },
      );
    }

    const toStandHole =
      cable.viaStandSlot !== false && toItem.kind === 'monitor'
        ? holes.find((h) => h.kind === 'standSlot' && h.itemId === toItem.id)
        : undefined;
    const toArm: Vector3[] = [];
    appendArmPoints(toArm, toItem, cable, project, true);
    if (toArm.length > 0) {
      for (const pt of toArm) anchors.push({ point: pt, pinned: true });
    } else if (toStandHole) {
      anchors.push(
        { point: toStandHole.exit.clone(), pinned: true },
        { point: toStandHole.entry.clone(), pinned: true },
      );
    }

    anchors.push(
      { point: endLead, pinned: true, tangent: toPort!.direction.clone().negate() },
      { point: endTip, pinned: true, tangent: toPort!.direction.clone().negate() },
    );

    const solved = solveStaticCablePhysics({
      anchors,
      bodyM,
      radius: spec.radius,
      stiffness: spec.bendingStiffness,
      minInteriorAngleDeg: spec.minInteriorAngleDeg,
      solids,
      holes,
      allowedItemIds,
      freeTail: false,
    });
    const pathLengthM = Math.round((solved.pathBodyLengthM + bothConnectorsM) * 1000) / 1000;
    return {
      points: solved.points,
      controlPoints: sampleInteriorControlPoints(solved.points),
      passedHoles: detectPassedHoles(solved.points, spec.radius, holes),
      fromPlug: fromPort,
      toPlug: toPort,
      pathLengthM,
      shortfallM: solved.shortfallM,
      collisionAdjusted: solved.collisionAdjusted,
    };
  }

  // Drop to under-desk floor via grommet (when enabled/auto) or back edge
  const floorY = spec.radius + 0.004;
  if (allowGrommet && grommetHole) {
    anchors.push(
      { point: grommetHole.entry.clone(), pinned: true },
      { point: grommetHole.exit.clone(), pinned: true },
      {
        point: new Vector3(
          grommetHole.center.x,
          Math.max(0.08, desk.height * 0.25),
          safeBackZ(grommetHole.center.z - 0.03),
        ),
        pinned: false,
      },
      {
        point: new Vector3(grommetHole.center.x, floorY, safeBackZ(grommetHole.center.z - 0.06)),
        pinned: false,
      },
    );
  } else {
    const dropX = Math.max(-desk.width / 2 + 0.06, Math.min(desk.width / 2 - 0.06, last.x));
    const edgeZ = -desk.depth / 2;
    const backDropZ = safeBackZ(edgeZ - 0.025);
    anchors.push(
      { point: new Vector3(dropX, desk.height + 0.015, edgeZ + 0.04), pinned: false },
      { point: new Vector3(dropX, desk.height - 0.01, backDropZ), pinned: false },
      {
        point: new Vector3(dropX, Math.max(0.1, desk.height * 0.4), safeBackZ(edgeZ - 0.04)),
        pinned: false,
      },
      { point: new Vector3(dropX, floorY, safeBackZ(edgeZ - 0.03)), pinned: false },
    );
  }

  const solved = solveStaticCablePhysics({
    anchors,
    bodyM,
    radius: spec.radius,
    stiffness: spec.bendingStiffness,
    minInteriorAngleDeg: spec.minInteriorAngleDeg,
    solids,
    holes,
    allowedItemIds,
    freeTail: true,
  });

  const pathLengthM = Math.round((solved.pathBodyLengthM + bothConnectorsM) * 1000) / 1000;
  return {
    points: solved.points,
    controlPoints: sampleInteriorControlPoints(solved.points, 2, 0),
    passedHoles: detectPassedHoles(solved.points, spec.radius, holes),
    fromPlug: fromPort,
    pathLengthM,
    shortfallM: solved.shortfallM,
    collisionAdjusted: solved.collisionAdjusted,
  };
}

export type CableReachabilityResult = {
  ok: boolean;
  reason?: string;
  resolved?: ResolvedCablePath;
  requiredM?: number;
  totalM?: number;
  shortfallM?: number;
};

/**
 * Validates that a candidate fixed-length cable can physically reach its target route without
 * stretching beyond its fixed specification (`cable.lengthM`).
 */
export function validateCableReachability(
  cable: Cable | Omit<Cable, 'id'>,
  project: Project,
): CableReachabilityResult {
  const probe: Cable = 'id' in cable ? cable : { ...cable, id: '__probe__' };
  const lengths = cableEffectiveLengths(probe);
  if (lengths.bodyM <= 0.05) {
    return {
      ok: false,
      totalM: lengths.totalM,
      reason: `所选线缆有效线身长度过短（含端子总长 ${lengths.totalM.toFixed(2)} m），无法完成接线。`,
    };
  }
  const resolved = computeCablePath(probe, project);
  if (!resolved) {
    return {
      ok: false,
      totalM: lengths.totalM,
      reason: '当前接口无法形成有效三维物理走线，请确认两端设备与接口有效。',
    };
  }
  if (resolved.shortfallM > 0.015) {
    return {
      ok: false,
      resolved,
      requiredM: resolved.pathLengthM,
      totalM: lengths.totalM,
      shortfallM: resolved.shortfallM,
      reason: `线缆长度不足（固定线长 ${lengths.totalM.toFixed(2)} m，物理绕障至少需 ${resolved.pathLengthM.toFixed(2)} m，还差 ${resolved.shortfallM.toFixed(2)} m）：线缆不可拉伸，请改用更长线缆或拉近设备间距。`,
    };
  }
  return {
    ok: true,
    resolved,
    requiredM: resolved.pathLengthM,
    totalM: lengths.totalM,
    shortfallM: resolved.shortfallM,
  };
}

export type CableTetherConstraintResult = {
  item: SceneItem;
  hitCable?: Cable;
  maxTotalM?: number;
  requiredM?: number;
};

function interpolatePoseField(
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  const va = a ?? 0;
  const vb = b ?? 0;
  if (va === vb) return b;
  return Math.round((va + (vb - va) * t) * 10000) / 10000;
}

function interpolateItemPose(prevItem: SceneItem, nextItem: SceneItem, t: number): SceneItem {
  return {
    ...nextItem,
    x: Math.round((prevItem.x + (nextItem.x - prevItem.x) * t) * 10000) / 10000,
    z: Math.round((prevItem.z + (nextItem.z - prevItem.z) * t) * 10000) / 10000,
    ...(prevItem.wallY !== undefined || nextItem.wallY !== undefined
      ? { wallY: interpolatePoseField(prevItem.wallY, nextItem.wallY, t) }
      : {}),
    ...(prevItem.lift !== undefined || nextItem.lift !== undefined
      ? { lift: interpolatePoseField(prevItem.lift, nextItem.lift, t) }
      : {}),
    ...(prevItem.rotation !== undefined || nextItem.rotation !== undefined
      ? { rotation: interpolatePoseField(prevItem.rotation, nextItem.rotation, t) }
      : {}),
    ...(prevItem.screenYaw !== undefined || nextItem.screenYaw !== undefined
      ? { screenYaw: interpolatePoseField(prevItem.screenYaw, nextItem.screenYaw, t) }
      : {}),
    ...(prevItem.pitch !== undefined || nextItem.pitch !== undefined
      ? { pitch: interpolatePoseField(prevItem.pitch, nextItem.pitch, t) }
      : {}),
    ...(prevItem.roll !== undefined || nextItem.roll !== undefined
      ? { roll: interpolatePoseField(prevItem.roll, nextItem.roll, t) }
      : {}),
  };
}

/**
 * Prevents moving, lifting, or rotating a device past the physical reach of any connected
 * fixed-length cable (`cable.lengthM`), clamping via binary search between `prevItem` and
 * `nextItem` so attached cables cannot be stretched beyond specification.
 */
export function constrainItemPoseForConnectedCables(
  prevItem: SceneItem,
  nextItem: SceneItem,
  project: Project,
): CableTetherConstraintResult {
  const cables = project.cables ?? [];
  if (cables.length === 0) return { item: nextItem };

  const affectedIds = new Set<string>([nextItem.id]);
  if (nextItem.kind === 'monitorArm' && nextItem.monitorArm) {
    for (const id of armMountedMonitorIds(nextItem.monitorArm)) affectedIds.add(id);
    for (const id of armMountedLaptopIds(nextItem.monitorArm)) affectedIds.add(id);
  }
  if (nextItem.kind === 'laptopStand' && nextItem.laptopStand?.laptopId) {
    affectedIds.add(nextItem.laptopStand.laptopId);
  }

  const relevant = cables.filter(
    (c) =>
      (c.from.type === 'device' && affectedIds.has(c.from.itemId)) ||
      (c.to.type === 'device' && affectedIds.has(c.to.itemId)),
  );
  if (relevant.length === 0) return { item: nextItem };

  const evaluate = (probeItem: SceneItem) => {
    const probeItems = project.items.map((it) => (it.id === probeItem.id ? probeItem : it));
    const probeProj: Project = { ...project, items: probeItems };
    let worstOver = 0;
    let hitCable: Cable | undefined;
    let maxTotalM: number | undefined;
    let requiredM: number | undefined;
    for (const c of relevant) {
      const check = validateCableReachability(c, probeProj);
      const sf = check.shortfallM ?? 0;
      if (!check.ok && sf > worstOver) {
        worstOver = sf;
        hitCable = c;
        maxTotalM = check.totalM;
        requiredM = check.requiredM;
      }
    }
    return { worstOver, hitCable, maxTotalM, requiredM };
  };

  const targetEval = evaluate(nextItem);
  if (targetEval.worstOver <= 0.015) return { item: nextItem };

  const prevEval = evaluate(prevItem);
  const limitOver = Math.max(0.015, prevEval.worstOver + 0.002);
  if (targetEval.worstOver <= limitOver) return { item: nextItem };

  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 10; iter++) {
    const mid = (lo + hi) * 0.5;
    const cand = interpolateItemPose(prevItem, nextItem, mid);
    if (evaluate(cand).worstOver <= limitOver) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return {
    item: lo > 0 ? interpolateItemPose(prevItem, nextItem, lo) : prevItem,
    hitCable: targetEval.hitCable,
    maxTotalM: targetEval.maxTotalM,
    requiredM: targetEval.requiredM,
  };
}

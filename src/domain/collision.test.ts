// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { computeCablePath } from './cableRouting';
import { defaultProject, makeItem } from './catalog';
import {
  checkMonitorArmCollision,
  checkMonitorPoseCollision,
  constrainMonitorPose,
  findContainingHole,
  findItemCollisions,
  getItemSolidBoxes,
  getSceneCableHoles,
  getSceneSolidBoxes,
  projectCablePointClear,
  resolveItemPositionWithCollisions,
  solveArmBaseMoveWithCollision,
  solveArmElbowSwivelWithCollision,
  solveArmLowerPitchWithCollision,
  solveArmUpperPitchWithCollision,
} from './collision';
import { monitorPose } from './monitor';
import {
  applyArmSolutionToProject,
  ARM_LOWER_LENGTH,
  ARM_UPPER_LENGTH,
  computeMonitorArmSystem,
} from './monitorArm';
import { projectSchema, type SceneItem } from './project';
import { devicePorts } from './ports';
import { useEditor } from '../store/editorStore';

describe('physical anti-clipping collision & hole-aware cable routing', () => {
  it('routes monitor/power cables through stand slots & desk grommets while blocking solid desk penetration', () => {
    const proj = defaultProject();
    proj.desk.grommet = { enabled: true, side: 'center', diameter: 0.06 };
    proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.03, color: '#ebe9e2' };
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;

    const holes = getSceneCableHoles(proj);
    expect(holes.some((h) => h.kind === 'grommet')).toBe(true);
    expect(holes.some((h) => h.kind === 'standSlot' && h.itemId === monitor.id)).toBe(true);

    const grommet = holes.find((h) => h.kind === 'grommet')!;
    const standSlot = holes.find((h) => h.kind === 'standSlot')!;

    // Cable dropping from monitor rear via stand slot & grommet must register both passed holes
    proj.cables = [
      {
        id: 'c-mon-grommet',
        kind: 'power',
        from: { type: 'device', itemId: monitor.id, portId: 'power' },
        to: { type: 'floor', drop: 'grommet' },
        routeViaArm: false,
        viaStandSlot: true,
        color: '#18181b',
      },
    ];
    expect(projectSchema.safeParse(proj).success).toBe(true);
    const resolved = computeCablePath(proj.cables[0], proj)!;
    expect(resolved).not.toBeNull();
    expect(resolved.passedHoles.some((h) => h.id === grommet.id)).toBe(true);
    expect(resolved.passedHoles.some((h) => h.id === standSlot.id)).toBe(true);

    // Point INSIDE grommet channel stays inside desk Y span [desk.height - thickness, desk.height]
    const solids = getSceneSolidBoxes(proj);
    const insideGrommet = new Vector3(grommet.center.x, proj.desk.height - 0.01, grommet.center.z);
    expect(findContainingHole(insideGrommet, 0.003, holes)?.id).toBe('desk-grommet');
    const clearInside = projectCablePointClear(insideGrommet, 0.003, solids, holes, new Set());
    expect(clearInside.point.y).toBeCloseTo(proj.desk.height - 0.01, 4);

    // Point OUTSIDE grommet attempting to penetrate solid desktop top gets projected clear
    const insideSolidTop = new Vector3(0.45, proj.desk.height - 0.012, 0.15);
    const clearOutside = projectCablePointClear(insideSolidTop, 0.004, solids, holes, new Set());
    expect(clearOutside.adjusted).toBe(true);
    expect(clearOutside.point.y).not.toBeCloseTo(proj.desk.height - 0.012, 3);
  });

  it('prevents user-edited cable waypoints from clipping behind backWall, below floor, or through devices', () => {
    const proj = defaultProject();
    proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.04, color: '#ebe9e2' };
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    const studio = makeItem('macStudio');
    studio.x = 0.35;
    studio.z = 0.05;
    proj.items.push(studio);

    proj.cables = [
      {
        id: 'c-custom-nodes',
        kind: 'dp',
        from: { type: 'device', itemId: monitor.id, portId: 'dp' },
        to: { type: 'floor', drop: 'backEdge' },
        routeViaArm: false,
        color: '#232832',
        waypoints: [
          { x: 0.35, y: proj.desk.height + 0.04, z: 0.05 }, // deliberately inside Mac Studio body
          { x: 0.1, y: 0.4, z: -0.9 }, // deliberately behind backWall!
          { x: 0.1, y: -0.2, z: -0.3 }, // deliberately underground!
        ],
      },
    ];
    const resolved = computeCablePath(proj.cables[0], proj)!;
    expect(resolved.collisionAdjusted).toBe(true);
    for (const pt of resolved.controlPoints) {
      expect(pt.y).toBeGreaterThanOrEqual(0.004);
      expect(pt.z).toBeGreaterThanOrEqual(-proj.desk.depth / 2 - 0.04 - 0.01);
    }
    // Control node 0 pushed cleanly outside Mac Studio body
    const n0 = resolved.controlPoints[0];
    const insideStudio =
      Math.abs(n0.x - studio.x) < studio.size.width / 2 &&
      Math.abs(n0.z - studio.z) < studio.size.depth / 2 &&
      n0.y < proj.desk.height + studio.size.height;
    expect(insideStudio).toBe(false);
  });

  it('pushes overlapping solid items apart on desk/wall/floor while allowing valid mousepad stacking', () => {
    const proj = defaultProject();
    proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.04, color: '#ebe9e2' };
    const kb = makeItem('keyboard');
    kb.x = 0;
    kb.z = 0.2;
    const strip = makeItem('powerStrip');
    strip.x = 0.02;
    strip.z = 0.21;
    proj.items.push(kb, strip);

    expect(findItemCollisions(strip, proj.desk, proj.items).length).toBeGreaterThan(0);
    const resolved = resolveItemPositionWithCollisions(
      strip,
      { x: 0.02, z: 0.21 },
      proj.desk,
      proj.items,
    );
    expect(resolved.hitObstacle).toBeDefined();
    expect(Math.hypot(resolved.x - strip.x, resolved.z - strip.z)).toBeGreaterThan(0.02);

    // Valid mousepad stacking should report zero collisions
    const pad = makeItem('mousepad');
    pad.x = 0.52;
    pad.z = 0.25;
    const mouse = makeItem('mouse');
    mouse.x = 0.52;
    mouse.z = 0.25;
    proj.items.push(pad, mouse);
    expect(findItemCollisions(mouse, proj.desk, proj.items)).toEqual([]);

    // Wall-mounted items push apart cleanly in 2D without overlapping on backWall
    const peg = makeItem('pegboard');
    peg.surface = 'wall';
    peg.wallY = 0.3;
    peg.x = 0;
    const outlet = makeItem('wallOutlet');
    outlet.x = 0.05;
    outlet.wallY = 1.12;
    proj.items.push(peg, outlet);
    const wallRes = resolveItemPositionWithCollisions(
      outlet,
      { x: 0.05, z: 0, wallY: 1.12 },
      proj.desk,
      proj.items,
    );
    expect(wallRes.hitObstacle).toBe(peg.name);
  });

  it('supports interactive 3D port-to-port wiring and waypoint insertion/mutation/reset via store', () => {
    const store = useEditor;
    store.getState().replace({ ...defaultProject(), cables: [] }, new Map());
    store.getState().add('powerStrip');
    const strip = store.getState().project.items.find((i) => i.kind === 'powerStrip')!;
    const monitor = store.getState().project.items.find((i) => i.kind === 'monitor')!;

    store.getState().setWiringMode(true);
    store.getState().pickWiringPort(monitor.id, 'power', 'power');
    expect(store.getState().wiringDraft?.itemId).toBe(monitor.id);
    store.getState().pickWiringPort(strip.id, 'slot-1', 'power');

    const cables = store.getState().project.cables ?? [];
    expect(cables).toHaveLength(1);
    const cId = cables[0].id;
    expect(cables[0].toPlugType).toBe('cn3Pin');

    const path = computeCablePath(cables[0], store.getState().project)!;
    const fallback = path.controlPoints.map((v) => ({ x: v.x, y: v.y, z: v.z }));
    const initialCount = fallback.length;

    store.getState().insertCableWaypoint(cId, 0, { x: 0.05, y: 0.85, z: -0.2 }, fallback);
    expect(store.getState().project.cables![0].waypoints).toHaveLength(initialCount + 1);

    store.getState().updateCableWaypoint(cId, 1, { x: 0.08, y: 0.9, z: -0.22 }, fallback);
    expect(store.getState().project.cables![0].waypoints![1].y).toBeCloseTo(0.9, 3);

    store.getState().removeCableWaypoint(cId, 1, fallback);
    expect(store.getState().project.cables![0].waypoints).toHaveLength(initialCount);

    store.getState().resetCableWaypoints(cId);
    expect(store.getState().project.cables![0].waypoints).toBeUndefined();
  });

  it('physically constrains monitor pitch, yaw, and roll against desk surface, stand column, wall, and peer items', () => {
    const proj = defaultProject();
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;

    // 1. Lowered monitor (lift = -0.05) clamps roll before the screen corner penetrates the desktop
    monitor.lift = -0.05;
    const rollRes = constrainMonitorPose(monitor, { roll: 60 }, proj.desk, proj.items);
    expect(rollRes.hitObstacle).toBe('桌面');
    expect(rollRes.item.roll!).toBeGreaterThan(10);
    expect(rollRes.item.roll!).toBeLessThan(25);
    expect(checkMonitorPoseCollision(rollRes.item, proj.desk, proj.items)).toBeNull();

    // Raising the monitor to +0.05 allows full 45° and 90° roll without desktop collision
    monitor.lift = 0.05;
    const raisedRoll45 = constrainMonitorPose(monitor, { roll: 45 }, proj.desk, proj.items);
    expect(raisedRoll45.hitObstacle).toBeUndefined();
    expect(raisedRoll45.item.roll).toBe(45);
    const raisedRoll90 = constrainMonitorPose(
      raisedRoll45.item,
      { roll: 90 },
      proj.desk,
      proj.items,
    );
    expect(raisedRoll90.hitObstacle).toBeUndefined();
    expect(raisedRoll90.item.roll).toBe(90);

    // 2. Stock stand column front-face self-collision clamps excessive downward pitch (+45° -> ~+8°..+12°)
    // without letting the lower bezel slice through the 2.1 cm thick stand column
    monitor.lift = 0;
    monitor.roll = 0;
    const pitchRes = constrainMonitorPose(monitor, { pitch: 45 }, proj.desk, proj.items);
    expect(pitchRes.hitObstacle).toBe('支架立柱');
    expect(pitchRes.item.pitch!).toBeGreaterThan(5);
    expect(pitchRes.item.pitch!).toBeLessThan(19);
    expect(checkMonitorPoseCollision(pitchRes.item, proj.desk, proj.items)).toBeNull();
    expect(checkMonitorPoseCollision({ ...monitor, pitch: 20 }, proj.desk, proj.items)).toBe(
      '支架立柱',
    );

    // Studio Display L-arm also blocks excessive downward pitch without clipping the aluminum arm
    const studioMon: SceneItem = {
      ...monitor,
      id: 'studio-mon',
      monitor: { model: 'studioDisplay', standType: 'tilt' },
    };
    const studioPitchRes = constrainMonitorPose(studioMon, { pitch: 25 }, proj.desk, [studioMon]);
    expect(studioPitchRes.hitObstacle).toBe('支架立柱');
    expect(studioPitchRes.item.pitch!).toBeLessThan(20);
    expect(checkMonitorPoseCollision(studioPitchRes.item, proj.desk, [studioMon])).toBeNull();

    // 3. Two-dimensional Yaw on stock stand:
    //    (a) screenYaw rotates only the screen panel (+-30° mechanical limit) while stand base/column stay fixed
    const swiveled30 = constrainMonitorPose(monitor, { screenYaw: 45 }, proj.desk, proj.items);
    expect(swiveled30.hitObstacle).toBeUndefined();
    expect(monitorPose(swiveled30.item.size, swiveled30.item).screenYawDeg).toBe(30);
    const swiveledBoxes = getItemSolidBoxes({ ...monitor, screenYaw: 25 }, proj.desk, proj.items);
    const baseBox = swiveledBoxes.find((b) => b.id.endsWith(':base'))!;
    const colBox = swiveledBoxes.find((b) => b.id.endsWith(':col--1'))!;
    const panelBox = swiveledBoxes.find((b) => b.id.endsWith(':panel'))!;
    expect(baseBox.yaw).toBeCloseTo(0, 5);
    expect(colBox.yaw).toBeCloseTo(0, 5);
    expect(panelBox.yaw).toBeCloseTo((25 * Math.PI) / 180, 4);

    // Mounted on monitor arm overrides screenYawDeg back to 0 (arm handles screen swivel directly)
    expect(
      monitorPose(monitor.size, { ...monitor, screenYaw: 25, hasMonitorArm: true }).screenYawDeg,
    ).toBe(0);

    //    (b) Peer item collision when rotating base yaw OR screen-only yaw
    const speaker = makeItem('speaker');
    speaker.x = monitor.x + 0.22;
    speaker.z = monitor.z + 0.16;
    proj.items.push(speaker);

    const yawRes = constrainMonitorPose(monitor, { rotation: -55 }, proj.desk, proj.items);
    expect(yawRes.hitObstacle).toBe(speaker.name);
    expect(Math.abs(yawRes.item.rotation)).toBeLessThan(55);
    expect(checkMonitorPoseCollision(yawRes.item, proj.desk, proj.items)).toBeNull();

    const screenYawBlocked = constrainMonitorPose(
      monitor,
      { screenYaw: -30 },
      proj.desk,
      proj.items,
    );
    expect(screenYawBlocked.hitObstacle).toBe(speaker.name);
    expect(Math.abs(screenYawBlocked.item.screenYaw!)).toBeLessThan(30);
    expect(checkMonitorPoseCollision(screenYawBlocked.item, proj.desk, proj.items)).toBeNull();

    // 4. Negative pitch (tilting top backward) + screenYaw + lowered lift must stop before
    // the Dell curved rear dome clips into the upper cap of the stand column
    const cleanProj = defaultProject();
    const cleanMon = cleanProj.items.find((i) => i.kind === 'monitor')!;
    cleanMon.lift = -0.05;
    cleanMon.screenYaw = 25;
    const upperClipRes = constrainMonitorPose(
      cleanMon,
      { pitch: -21 },
      cleanProj.desk,
      cleanProj.items,
    );
    if (upperClipRes.hitObstacle) {
      expect(upperClipRes.hitObstacle).toBe('支架立柱');
    }
    expect(
      checkMonitorPoseCollision(upperClipRes.item, cleanProj.desk, cleanProj.items),
    ).toBeNull();
    expect(
      checkMonitorPoseCollision(
        { ...cleanMon, lift: -0.05, screenYaw: 30, pitch: -21 },
        cleanProj.desk,
        cleanProj.items,
      ),
    ).toBe('支架立柱');
  });

  it('prevents monitor-connected cables from clipping through the monitor stand baseplate', () => {
    const proj = defaultProject();
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    const mac = makeItem('macbook');
    mac.x = 0.42;
    mac.z = 0.08;
    proj.items.push(mac);

    const macPort = devicePorts(mac).find((p) => p.kind === 'usbc')!;
    const cable = {
      id: 'c-mon-mac-base-guard',
      kind: 'dp' as const,
      toPlugType: 'usbc' as const,
      from: { type: 'device' as const, itemId: monitor.id, portId: 'dp' },
      to: { type: 'device' as const, itemId: mac.id, portId: macPort.id },
      routeViaArm: false,
      viaStandSlot: false,
      color: '#1e2633',
      lengthM: 1.5,
    };
    proj.cables = [cable];

    const resolved = computeCablePath(cable, proj)!;
    expect(resolved).not.toBeNull();
    const solids = getSceneSolidBoxes(proj);
    const baseBox = solids.find((s) => s.id === `item:${monitor.id}:base`)!;
    expect(baseBox).toBeDefined();

    // Check dense samples along every cable segment stay strictly outside the monitor baseplate
    for (let i = 1; i < resolved.points.length; i++) {
      const a = resolved.points[i - 1];
      const b = resolved.points[i];
      for (let s = 0; s <= 10; s++) {
        const pt = new Vector3().lerpVectors(a, b, s / 10);
        const c = Math.cos(baseBox.yaw);
        const sn = Math.sin(baseBox.yaw);
        const lx = (pt.x - baseBox.cx) * c - (pt.z - baseBox.cz) * sn;
        const lz = (pt.x - baseBox.cx) * sn + (pt.z - baseBox.cz) * c;
        const insideFootprint =
          Math.abs(lx) < baseBox.halfW - 0.002 && Math.abs(lz) < baseBox.halfD - 0.002;
        if (insideFootprint && pt.y >= baseBox.minY - 0.002) {
          expect(pt.y).toBeGreaterThanOrEqual(baseBox.maxY + 0.002);
        }
      }
    }
  });

  it('prevents under-desk cables from slicing diagonally through the rear under-desk stretcher crossbar', () => {
    const proj = defaultProject();
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    const floorOutlet = makeItem('wallOutlet');
    floorOutlet.surface = 'floor';
    floorOutlet.wallOutlet = {
      ...(floorOutlet.wallOutlet ?? {
        outletType: 'combo5',
        gangs: 1,
        usbA: 0,
        usbC: 0,
      }),
      mount: 'floor',
    };
    floorOutlet.x = 0.28;
    floorOutlet.z = -0.14;
    proj.items.push(floorOutlet);

    const outletPort = devicePorts(floorOutlet).find((p) => p.kind === 'power')!;
    const cable = {
      id: 'c-stretcher-guard',
      kind: 'power' as const,
      from: { type: 'device' as const, itemId: monitor.id, portId: 'power' },
      to: { type: 'device' as const, itemId: floorOutlet.id, portId: outletPort.id },
      drop: 'backEdge' as const,
      routeViaArm: false,
      viaStandSlot: false,
      color: '#18181b',
      lengthM: 2.5,
      lengthIncludesConnectors: true,
    };
    proj.cables = [cable];

    const resolved = computeCablePath(cable, proj)!;
    expect(resolved).not.toBeNull();
    const stretcher = getSceneSolidBoxes(proj).find((s) => s.id === 'desk-stretcher-back')!;
    expect(stretcher).toBeDefined();

    // Dense 5mm check along all segments: ZERO samples may slice through desk-stretcher-back
    for (let i = 1; i < resolved.points.length; i++) {
      const a = resolved.points[i - 1];
      const b = resolved.points[i];
      for (let s = 0; s <= 12; s++) {
        const pt = new Vector3().lerpVectors(a, b, s / 12);
        const insideX = Math.abs(pt.x - stretcher.cx) < stretcher.halfW - 0.002;
        const insideY = pt.y > stretcher.minY + 0.002 && pt.y < stretcher.maxY - 0.002;
        const insideZ = Math.abs(pt.z - stretcher.cz) < stretcher.halfD - 0.002;
        expect(insideX && insideY && insideZ).toBe(false);
      }
    }
  });

  it('prevents monitor arm links and mounted monitor from clipping into desk surface or adjacent desktop speakers', () => {
    const store = useEditor;
    store.getState().replace(defaultProject(), new Map());
    const monitor = store.getState().project.items.find((i) => i.kind === 'monitor')!;
    store.getState().updateItem(monitor.id, { z: 0.04 });
    store.getState().select(monitor.id);
    store.getState().add('monitorArm');

    const arm = () => store.getState().project.items.find((i) => i.kind === 'monitorArm')!;

    // 1. Place a desktop speaker right inside the elbow swing arc (starting cleanly clear of initial pose)
    const sysInitial = computeMonitorArmSystem(
      arm(),
      store.getState().project.items,
      store.getState().project.desk,
    );
    const branchInitial = sysInitial.branches[0];
    expect(
      checkMonitorArmCollision(
        arm(),
        'primary',
        store.getState().project.desk,
        store.getState().project.items,
      ),
    ).toBeNull();

    const blockerHoriz = makeItem('speaker');
    blockerHoriz.x = branchInitial.columnTop.x - 0.14;
    blockerHoriz.z = branchInitial.columnTop.z + 0.14;
    blockerHoriz.size.height = 0.24;
    store.getState().commit((p) => {
      p.items.push(blockerHoriz);
    });
    expect(
      checkMonitorArmCollision(
        arm(),
        'primary',
        store.getState().project.desk,
        store.getState().project.items,
      ),
    ).toBeNull();

    const swiveled = solveArmElbowSwivelWithCollision({
      arm: arm(),
      branch: branchInitial,
      desiredYawDeg: -65,
      desk: store.getState().project.desk,
      allItems: store.getState().project.items,
      collisionEnabled: true,
    });
    expect(swiveled.limitReason).toBe('armObstacle');
    expect(swiveled.obstacleName).toBeDefined();
    store
      .getState()
      .commit((p) => applyArmSolutionToProject(p, arm().id, 'primary', swiveled, false));
    expect(
      checkMonitorArmCollision(
        arm(),
        'primary',
        store.getState().project.desk,
        store.getState().project.items,
      ),
    ).toBeNull();

    // 2. Over clear desktop area, pushing upper arm steeply downward stops cleanly at desktop clearance
    store.getState().commit((p) => {
      p.items = p.items.filter((it) => it.id === monitor.id || it.id === arm().id);
      const keepIds = new Set(p.items.map((it) => it.id));
      p.cables = (p.cables ?? []).filter(
        (c) =>
          (c.from.type !== 'device' || keepIds.has(c.from.itemId)) &&
          (c.to.type !== 'device' || keepIds.has(c.to.itemId)),
      );
      if (p.cables.length === 0) delete p.cables;
    });
    const sysAfterSwivel = computeMonitorArmSystem(
      arm(),
      store.getState().project.items,
      store.getState().project.desk,
    );
    const upperDown = solveArmUpperPitchWithCollision({
      arm: arm(),
      branch: sysAfterSwivel.branches[0],
      desiredUpperPitchDeg: -60,
      desk: store.getState().project.desk,
      allItems: store.getState().project.items,
      collisionEnabled: true,
    });
    expect(upperDown.obstacleName).toBe('桌面');
    expect(upperDown.limitReason).toBe('deskClearance');
    expect(upperDown.upperPitchDeg).toBeGreaterThan(-60);
    store
      .getState()
      .commit((p) => applyArmSolutionToProject(p, arm().id, 'primary', upperDown, false));

    const sysAfterDrop = computeMonitorArmSystem(
      arm(),
      store.getState().project.items,
      store.getState().project.desk,
    );
    expect(
      sysAfterDrop.branches[0].columnTop.distanceTo(sysAfterDrop.branches[0].elbowPos),
    ).toBeCloseTo(ARM_LOWER_LENGTH, 4);
    expect(
      sysAfterDrop.branches[0].elbowPos.distanceTo(sysAfterDrop.branches[0].vesaHeadPos),
    ).toBeCloseTo(ARM_UPPER_LENGTH, 3);
    expect(
      checkMonitorArmCollision(
        arm(),
        'primary',
        store.getState().project.desk,
        store.getState().project.items,
      ),
    ).toBeNull();

    // 3. Lowering the lower arm over a tall obstacle under the elbow stops above the obstacle
    const blockerSpeaker = makeItem('speaker');
    blockerSpeaker.x = sysAfterDrop.branches[0].elbowPos.x;
    blockerSpeaker.z = sysAfterDrop.branches[0].elbowPos.z;
    blockerSpeaker.size.height = 0.21;
    store.getState().commit((p) => {
      // Lift first, or place right beneath current elbow at height below current elbow
      p.items.push(blockerSpeaker);
    });
    const sysBeforeLower = computeMonitorArmSystem(
      arm(),
      store.getState().project.items,
      store.getState().project.desk,
    );
    // Raise lower arm first so it's clear above blocker, then try pushing down through blocker
    const raised = solveArmLowerPitchWithCollision({
      arm: arm(),
      branch: sysBeforeLower.branches[0],
      desiredPitchDeg: 60,
      desk: store.getState().project.desk,
      allItems: store.getState().project.items,
      collisionEnabled: true,
    });
    store.getState().commit((p) => applyArmSolutionToProject(p, arm().id, 'primary', raised, true));

    const sysAtTop = computeMonitorArmSystem(
      arm(),
      store.getState().project.items,
      store.getState().project.desk,
    );
    const pressedIntoSpeaker = solveArmLowerPitchWithCollision({
      arm: arm(),
      branch: sysAtTop.branches[0],
      desiredPitchDeg: 5,
      desk: store.getState().project.desk,
      allItems: store.getState().project.items,
      collisionEnabled: true,
    });
    expect(pressedIntoSpeaker.limitReason).toBe('armObstacle');
    expect(pressedIntoSpeaker.obstacleName).toBe(blockerSpeaker.name);
    expect(pressedIntoSpeaker.lowerPitchDeg).toBeGreaterThan(5);

    // 4. Dragging the arm base across the desk stops cleanly before colliding into desktop items
    store.getState().replace(defaultProject(), new Map());
    const rightSpk = makeItem('speaker');
    rightSpk.x = 0.32;
    rightSpk.z = -0.14;
    const pegBoard = makeItem('pegboard');
    pegBoard.x = 0.42;
    pegBoard.z = -0.26;
    pegBoard.size = { width: 0.4, height: 0.35, depth: 0.12 };
    store.getState().commit((p) => {
      p.items.push(rightSpk, pegBoard);
    });
    const mon = store.getState().project.items.find((i) => i.kind === 'monitor')!;
    store.getState().select(mon.id);
    store.getState().add('monitorArm');
    const armItem = () => store.getState().project.items.find((i) => i.kind === 'monitorArm')!;
    // In defaultProject(), right speaker sits around x = 0.32, z = -0.14; desktop pegboard sits around x = 0.42, z = -0.26
    const slideIntoBoard = solveArmBaseMoveWithCollision({
      arm: armItem(),
      desk: store.getState().project.desk,
      allItems: store.getState().project.items,
      desiredX: 0.42,
      desiredZ: -store.getState().project.desk.depth / 2 + 0.036,
      forcedEdge: 'back',
      collisionEnabled: true,
    });
    expect(slideIntoBoard.limitReason).toBe('armObstacle');
    expect(slideIntoBoard.obstacleName).toBeDefined();
    expect(slideIntoBoard.clampX).toBeLessThan(0.22);
  });
});

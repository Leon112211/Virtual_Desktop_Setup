import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  clampPolylineByTotalLength,
  createLiveCableState,
  minCableInteriorAngleDeg,
  stepLiveCablePhysics,
} from './cablePhysics';
import { computeCablePath } from './cableRouting';
import {
  cableMeta,
  formatCableDisplayName,
  POWER_CABLE_PRESETS,
  resolveCablePlugEnds,
  SIGNAL_CABLE_PRESETS,
} from './cable';
import { defaultProject, makeItem } from './catalog';
import { getSceneCableHoles, getSceneSolidBoxes } from './collision';
import { devicePorts, devicePortWorld } from './ports';
import { useEditor } from '../store/editorStore';

describe('cable gravity, bending resilience, and 3D live end-switching', () => {
  it('pulls slack cables onto physical desk/floor surfaces under gravity instead of floating in mid-air', () => {
    const proj = defaultProject();
    proj.desk.grommet = { enabled: true, side: 'center', diameter: 0.06 };
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    const studio = makeItem('macStudio');
    studio.x = 0.42;
    studio.z = 0.08;
    proj.items.push(studio);

    // Elevate monitor slightly so straight line between monitor HDMI and Mac Studio HDMI is well above the desk
    monitor.lift = 0.06;
    const mPort = devicePortWorld(monitor, 'hdmi', proj.desk, proj.items)!;
    const sPort = devicePortWorld(studio, 'hdmi', proj.desk, proj.items)!;

    proj.cables = [
      {
        id: 'c-gravity-hdmi',
        kind: 'hdmi',
        from: { type: 'device', itemId: monitor.id, portId: 'hdmi' },
        to: { type: 'device', itemId: studio.id, portId: 'hdmi' },
        routeViaArm: false,
        viaStandSlot: false,
        color: '#1e2633',
        lengthM: 1.8,
        lengthIncludesConnectors: true,
      },
      {
        id: 'c-gravity-floor',
        kind: 'power',
        from: { type: 'device', itemId: monitor.id, portId: 'power' },
        to: { type: 'floor', drop: 'backEdge' },
        routeViaArm: false,
        viaStandSlot: false,
        color: '#18181b',
        lengthM: 2.2,
        lengthIncludesConnectors: true,
      },
    ];

    const hdmiPath = computeCablePath(proj.cables[0], proj)!;
    expect(hdmiPath.points.length).toBeGreaterThanOrEqual(8);
    // Mid-span interior points must sag down toward desk height rather than floating at the high port chord
    const minInteriorY = Math.min(...hdmiPath.points.slice(2, -2).map((p) => p.y));
    const chordMinPortY = Math.min(mPort.position.y, sPort.position.y);
    expect(minInteriorY).toBeLessThan(chordMinPortY);
    expect(minInteriorY).toBeLessThanOrEqual(proj.desk.height + cableMeta.hdmi.radius + 0.04);

    // Floor-drop cable tail settles all the way down onto the floor plane
    const floorPath = computeCablePath(proj.cables[1], proj)!;
    const floorTail = floorPath.points[floorPath.points.length - 1];
    expect(floorTail.y).toBeLessThanOrEqual(cableMeta.power.radius + 0.02);
  });

  it('prevents acute bends (< 90°) across both auto-routed cables and sharp user waypoints', () => {
    const proj = defaultProject();
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    const mini = makeItem('macMini');
    mini.x = -0.35;
    mini.z = 0.05;
    proj.items.push(mini);

    proj.cables = [
      {
        id: 'c-resilience-auto',
        kind: 'hdmi',
        from: { type: 'device', itemId: monitor.id, portId: 'hdmi' },
        to: { type: 'device', itemId: mini.id, portId: 'hdmi' },
        routeViaArm: false,
        viaStandSlot: true,
        color: '#232832',
        lengthM: 1.5,
      },
      {
        id: 'c-resilience-hairpin',
        kind: 'power',
        from: { type: 'device', itemId: monitor.id, portId: 'power' },
        to: { type: 'floor', drop: 'backEdge' },
        routeViaArm: false,
        color: '#18181b',
        lengthM: 1.8,
        // Deliberately try to force a sharp acute Z hairpin
        waypoints: [
          { x: 0.0, y: proj.desk.height + 0.08, z: -0.22 },
          { x: 0.02, y: proj.desk.height + 0.08, z: 0.12 },
          { x: 0.01, y: proj.desk.height + 0.08, z: -0.25 },
        ],
      },
    ];

    for (const cable of proj.cables) {
      const resolved = computeCablePath(cable, proj)!;
      const minDeg = minCableInteriorAngleDeg(resolved.points);
      expect(minDeg).toBeGreaterThanOrEqual(92);
    }
  });

  it('simulates live cursor-hanging Verlet cable with gravity + non-acute bends', () => {
    const proj = defaultProject();
    const solids = getSceneSolidBoxes(proj);
    const holes = getSceneCableHoles(proj);
    const cursorPos = new Vector3(0.2, proj.desk.height + 0.3, 0.1);
    const spec = cableMeta.power;

    const sim = createLiveCableState({
      cursorPos,
      bodyM: 1.6,
      radius: spec.radius,
      stiffness: spec.bendingStiffness,
      minInteriorAngleDeg: spec.minInteriorAngleDeg,
      activeEnd: 'from',
    });

    for (let f = 0; f < 45; f++) {
      stepLiveCablePhysics(
        sim,
        {
          cursorPos,
          activeEnd: 'from',
          solids,
          holes,
          allowedItemIds: new Set(),
        },
        1 / 60,
      );
    }

    // Held end stays at cursor while free tail drops under gravity to desk/floor
    expect(sim.nodes[0].distanceTo(cursorPos)).toBeLessThan(0.01);
    const freeTail = sim.nodes[sim.nodes.length - 1];
    expect(freeTail.y).toBeLessThan(cursorPos.y - 0.15);
    expect(minCableInteriorAngleDeg(sim.nodes)).toBeGreaterThanOrEqual(92);
  });

  it('supports Space end-switching before connection and auto-switching after first port connection', () => {
    const store = useEditor;
    store.getState().replace({ ...defaultProject(), cables: [] }, new Map());
    store.getState().add('powerStrip');
    const strip = store.getState().project.items.find((i) => i.kind === 'powerStrip')!;
    const monitor = store.getState().project.items.find((i) => i.kind === 'monitor')!;
    const preset = POWER_CABLE_PRESETS[0];

    store.getState().setWiringMode(true, {
      kind: preset.kind,
      color: preset.color,
      lengthM: preset.lengthM,
      outletPlugType: preset.outletPlugType,
      devicePlugType: preset.devicePlugType,
      label: preset.name,
    });

    expect(store.getState().wiringActiveEnd).toBe('from');
    store.getState().switchWiringEnd();
    expect(store.getState().wiringActiveEnd).toBe('to');

    // Connecting first port while holding `to` locks `wiringTo` and auto-switches cursor to `from`
    store.getState().pickWiringPort(strip.id, 'slot-1', 'power');
    expect(store.getState().wiringTo?.itemId).toBe(strip.id);
    expect(store.getState().wiringFrom).toBeNull();
    expect(store.getState().wiringActiveEnd).toBe('from');

    // Pressing Space while 1 end is connected swaps end role cleanly while keeping strip connected
    store.getState().switchWiringEnd();
    expect(store.getState().wiringFrom?.itemId).toBe(strip.id);
    expect(store.getState().wiringTo).toBeNull();
    expect(store.getState().wiringActiveEnd).toBe('to');

    // Connecting second port finishes the cable and exits wiringMode
    store.getState().pickWiringPort(monitor.id, 'power', 'power');
    expect(store.getState().wiringMode).toBe(false);
    const cables = store.getState().project.cables ?? [];
    expect(cables).toHaveLength(1);
    expect(cables[0].fromPlugType).toBe('cn3Pin');
    expect(cables[0].toPlugType).toBe('iecC13');
  });

  it('distinguishes Dual-DP vs DP-to-Type-C signal variants and matches plug heads in any click order', () => {
    const dualDp = SIGNAL_CABLE_PRESETS.find((p) => p.id === 'dp-dp')!;
    const dpTypeC = SIGNAL_CABLE_PRESETS.find((p) => p.id === 'dp-usbc')!;
    expect(dualDp.shortLabel).toBe('双头 DP');
    expect(dualDp.fromPortKind).toBe('dp');
    expect(dualDp.toPortKind).toBe('dp');
    expect(dpTypeC.shortLabel).toBe('DP ↔ Type-C');
    expect(dpTypeC.fromPortKind).toBe('dp');
    expect(dpTypeC.toPortKind).toBe('usbc');

    // Direct plug assignment helper checks
    expect(
      resolveCablePlugEnds({
        fromKind: 'monitor',
        fromPortId: 'dp',
        fromPortKind: 'dp',
        toKind: 'macbook',
        toPortId: 'usbc1',
        toPortKind: 'usbc',
        cableKind: 'dp',
      }),
    ).toEqual({ fromPlugType: 'dp', toPlugType: 'usbc' });

    expect(
      resolveCablePlugEnds({
        fromKind: 'macbook',
        fromPortId: 'usbc1',
        fromPortKind: 'usbc',
        toKind: 'monitor',
        toPortId: 'dp',
        toPortKind: 'dp',
        cableKind: 'dp',
      }),
    ).toEqual({ fromPlugType: 'usbc', toPlugType: 'dp' });

    // Store 3D wiring starting from Type-C (after Space toggle) -> Monitor DP
    const store = useEditor;
    store.getState().replace({ ...defaultProject(), cables: [] }, new Map());
    const mb = store.getState().project.items.find((i) => i.kind === 'macbook')!;
    const mon = store.getState().project.items.find((i) => i.kind === 'monitor')!;

    store.getState().setWiringMode(true, {
      kind: dpTypeC.kind,
      color: dpTypeC.color,
      lengthM: cableMeta.dp.defaultLengthM,
      fromPortKind: dpTypeC.fromPortKind,
      toPortKind: dpTypeC.toPortKind,
      devicePlugType: dpTypeC.fromPlugType,
      outletPlugType: dpTypeC.toPlugType,
      label: dpTypeC.label,
    });
    store.getState().switchWiringEnd(); // switch from DP end to Type-C end
    expect(store.getState().wiringActiveEnd).toBe('to');

    store.getState().pickWiringPort(mb.id, 'usbc1', 'usbc');
    expect(store.getState().wiringActiveEnd).toBe('from'); // auto-switched to DP end
    store.getState().pickWiringPort(mon.id, 'dp', 'dp');

    const created = (store.getState().project.cables ?? [])[0];
    expect(created.kind).toBe('dp');
    expect(created.fromPlugType).toBe('dp');
    expect(created.toPlugType).toBe('usbc');
    expect(formatCableDisplayName(created)).toBe('DP ↔ Type-C');
  });

  it('applies gravity to user-edited waypoints and blocks diagonal segment clipping through desk edges & obstacles', () => {
    const proj = defaultProject();
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    const speaker = makeItem('speaker');
    speaker.x = 0.42;
    speaker.z = -0.14;
    const mb = makeItem('macbook');
    mb.x = 0.62;
    mb.z = 0.02;
    proj.items.push(speaker, mb);

    // Manually lifted/off-desk waypoints (including one inside speaker & one floating high in air)
    proj.cables = [
      {
        id: 'c-manual-gravity',
        kind: 'dp',
        from: { type: 'device', itemId: monitor.id, portId: 'dp' },
        to: { type: 'device', itemId: mb.id, portId: 'usbc1' },
        routeViaArm: false,
        viaStandSlot: false,
        color: '#232832',
        lengthM: 2.0,
        fromPlugType: 'dp',
        toPlugType: 'usbc',
        waypoints: [
          { x: 0.16, y: proj.desk.height + 0.18, z: -0.05 }, // artificially lifted 18cm above desk!
          { x: 0.48, y: proj.desk.height + 0.22, z: 0.26 }, // artificially lifted 22cm above front-right desk!
          { x: 0.85, y: proj.desk.height + 0.15, z: 0.22 }, // floating off the right edge of the desk!
        ],
      },
    ];

    const resolved = computeCablePath(proj.cables[0], proj)!;
    expect(resolved.points.length).toBeGreaterThan(8);

    // 1. User-edited control nodes must obey gravity (-Y), dropping onto/near surfaces instead of floating at +0.18..+0.22
    expect(resolved.controlPoints[0].y).toBeLessThan(proj.desk.height + 0.05);
    expect(resolved.controlPoints[1].y).toBeLessThan(proj.desk.height + 0.05);

    // 2. Dense 5mm segment sampling must NEVER penetrate desktop slab, speaker, or rear stretcher rail
    const solids = getSceneSolidBoxes(proj).filter(
      (b) => b.kind === 'desk' || b.kind === 'leg' || b.itemId === speaker.id,
    );
    for (let i = 1; i < resolved.points.length; i++) {
      const a = resolved.points[i - 1];
      const b = resolved.points[i];
      for (const t of [0.25, 0.5, 0.75]) {
        const pt = new Vector3().lerpVectors(a, b, t);
        for (const box of solids) {
          const insideY = pt.y > box.minY + 0.002 && pt.y < box.maxY - 0.002;
          const insideX = Math.abs(pt.x - box.cx) < box.halfW - 0.002;
          const insideZ = Math.abs(pt.z - box.cz) < box.halfD - 0.002;
          expect(insideX && insideY && insideZ).toBe(false);
        }
      }
    }
  });

  it('keeps desktop cable spans straight without high-frequency zigzag buckling', () => {
    const proj = defaultProject();
    delete proj.cables;
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;
    monitor.x = -0.12;
    const mb = proj.items.find((i) => i.kind === 'macbook')!;
    mb.x = 0.52;
    mb.z = 0.14;
    mb.rotation = 0;
    const speaker = makeItem('speaker');
    speaker.x = 0.28;
    speaker.z = -0.14;
    proj.items.push(speaker);

    const mbPort = devicePorts(mb).find((p) => p.kind === 'usbc')!;
    proj.cables = [
      {
        id: 'c-straight-desktop',
        kind: 'dp',
        from: { type: 'device', itemId: monitor.id, portId: 'dp' },
        to: { type: 'device', itemId: mb.id, portId: mbPort.id },
        routeViaArm: false,
        viaStandSlot: false,
        color: '#232832',
        lengthM: 2.0,
        fromPlugType: 'dp',
        toPlugType: 'usbc',
      },
    ];

    const resolved = computeCablePath(proj.cables[0], proj)!;
    // Count high-frequency lateral XZ sign flips (consecutive opposite horizontal turns) across desktop points
    const deskPts = resolved.points.filter((p) => p.y <= proj.desk.height + 0.035);
    expect(deskPts.length).toBeGreaterThanOrEqual(3);
    let reversals = 0;
    let prevCross = 0;
    for (let i = 1; i < deskPts.length - 1; i++) {
      const ax = deskPts[i].x - deskPts[i - 1].x;
      const az = deskPts[i].z - deskPts[i - 1].z;
      const bx = deskPts[i + 1].x - deskPts[i].x;
      const bz = deskPts[i + 1].z - deskPts[i].z;
      const cross = ax * bz - az * bx;
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      if (la > 0.01 && lb > 0.01 && Math.abs(cross) / (la * lb) > 0.08) {
        if (prevCross !== 0 && Math.sign(cross) !== Math.sign(prevCross)) {
          reversals++;
        }
        prevCross = cross;
      }
    }
    // Smooth single-arc surplus route (at most 3 gentle macro inflections vs 6+ high-frequency zigzags)
    expect(reversals).toBeLessThanOrEqual(3);
    expect(minCableInteriorAngleDeg(resolved.points)).toBeGreaterThanOrEqual(92);
  });

  it('conserves exact fixed cable length when slack exists and rejects under-length connections/stretching', () => {
    const store = useEditor;
    store.getState().replace({ ...defaultProject(), cables: [] }, new Map());
    const monitor = store.getState().project.items.find((i) => i.kind === 'monitor')!;
    const mb = store.getState().project.items.find((i) => i.kind === 'macbook')!;
    store.getState().updateItem(mb.id, { x: 0.56, z: 0.14, rotation: 0 });
    const mbPort = devicePorts(mb).find((p) => p.kind === 'usbc')!;

    // 1. Connecting a fixed 0.8 m USB-C cable across a > 0.9 m path must fail immediately without adding
    expect(() =>
      store.getState().addCable({
        kind: 'usbc',
        from: { type: 'device', itemId: monitor.id, portId: 'usbc' },
        to: { type: 'device', itemId: mb.id, portId: mbPort.id },
        routeViaArm: false,
        viaStandSlot: false,
        color: '#3f4754',
        lengthM: 0.8,
        lengthIncludesConnectors: true,
      }),
    ).toThrow(/线缆长度不足/);
    expect(store.getState().project.cables ?? []).toHaveLength(0);

    // 2. Connecting a valid fixed 2.0 m cable succeeds AND conserves ~2.0 m physical length (not shrunk taut!)
    const id = store.getState().addCable({
      kind: 'dp',
      from: { type: 'device', itemId: monitor.id, portId: 'dp' },
      to: { type: 'device', itemId: mb.id, portId: mbPort.id },
      routeViaArm: false,
      viaStandSlot: false,
      color: '#232832',
      lengthM: 2.0,
      lengthIncludesConnectors: true,
      fromPlugType: 'dp',
      toPlugType: 'usbc',
    });
    const cable = store.getState().project.cables!.find((c) => c.id === id)!;
    const path = computeCablePath(cable, store.getState().project)!;
    expect(path.shortfallM).toBeLessThanOrEqual(0.015);
    expect(path.pathLengthM).toBeGreaterThanOrEqual(1.94);
    expect(path.pathLengthM).toBeLessThanOrEqual(2.05);

    // 3. Trying to shrink fixed length below required physical route rejects without mutating
    expect(() => store.getState().updateCable(id, { lengthM: 0.5 })).toThrow(/线缆长度不足/);
    expect(store.getState().project.cables!.find((c) => c.id === id)!.lengthM).toBe(2.0);

    // 4. Dragging a waypoint beyond the fixed 2.0 m wire reach sets collisionNotice and refuses stretching
    store.getState().updateCableWaypoint(
      id,
      0,
      { x: 2.4, y: store.getState().project.desk.height + 0.05, z: 1.5 },
      path.controlPoints.map((v) => ({ x: v.x, y: v.y, z: v.z })),
    );
    expect(store.getState().collisionNotice).toContain('固定线长极限');
    expect(store.getState().project.cables!.find((c) => c.id === id)!.waypoints).toBeUndefined();
  });

  it('prevents live 3D placement stretching beyond fixed length AND tethers moving connected devices', () => {
    const proj = defaultProject();
    const solids = getSceneSolidBoxes(proj);
    const holes = getSceneCableHoles(proj);
    const anchorPos = new Vector3(-0.3, proj.desk.height + 0.12, -0.15);
    const farCursor = new Vector3(1.5, proj.desk.height + 0.14, 0.25);
    const bodyM = 0.75;
    const spec = cableMeta.usbc;

    const sim = createLiveCableState({
      cursorPos: farCursor,
      bodyM,
      radius: spec.radius,
      stiffness: spec.bendingStiffness,
      minInteriorAngleDeg: spec.minInteriorAngleDeg,
      activeEnd: 'to',
      anchorPos,
    });

    let lastShortfall = 0;
    for (let f = 0; f < 30; f++) {
      const res = stepLiveCablePhysics(
        sim,
        {
          cursorPos: farCursor,
          activeEnd: 'to',
          lockedFrom: { position: anchorPos, direction: new Vector3(0, -1, 0) },
          solids,
          holes,
          allowedItemIds: new Set(),
        },
        1 / 60,
      );
      lastShortfall = res.shortfallM;
    }

    const capped = clampPolylineByTotalLength(sim.nodes, true, bodyM);
    let totalLen = 0;
    for (let i = 1; i < capped.length; i++) {
      totalLen += capped[i - 1].distanceTo(capped[i]);
    }
    expect(totalLen).toBeLessThanOrEqual(bodyM + 0.01);
    expect(capped[0].distanceTo(anchorPos)).toBeLessThan(0.01);
    expect(capped[capped.length - 1].distanceTo(anchorPos)).toBeLessThanOrEqual(bodyM + 0.01);
    expect(capped[capped.length - 1].distanceTo(farCursor)).toBeGreaterThan(0.8);
    expect(lastShortfall).toBeGreaterThan(0.9);

    // Moving a device already wired with a fixed 1.0 m cable cannot pull it out past 1.0 m
    const store = useEditor;
    store.getState().replace(defaultProject(), new Map());
    store.getState().add('macbook');
    const mb = store.getState().project.items.find((i) => i.kind === 'macbook')!;
    const mon = store.getState().project.items.find((i) => i.kind === 'monitor')!;
    store.getState().updateItem(mb.id, { x: 0.35, z: 0.14 });
    const mbPort = devicePorts(mb).find((p) => p.kind === 'usbc')!;
    const cableId = store.getState().addCable({
      kind: 'usbc',
      from: { type: 'device', itemId: mon.id, portId: 'usbc' },
      to: { type: 'device', itemId: mb.id, portId: mbPort.id },
      routeViaArm: false,
      viaStandSlot: false,
      color: spec.color,
      lengthM: 1.0,
      lengthIncludesConnectors: true,
    });

    store.getState().updateItem(mb.id, { x: 1.25, z: 0.45 });
    const movedMb = store.getState().project.items.find((i) => i.id === mb.id)!;
    expect(movedMb.x).toBeLessThan(0.95);
    expect(store.getState().collisionNotice).toContain('固定线缆长度极限');
    const postPath = computeCablePath(
      store.getState().project.cables!.find((c) => c.id === cableId)!,
      store.getState().project,
    )!;
    expect(postPath.shortfallM).toBeLessThanOrEqual(0.016);
  });
});

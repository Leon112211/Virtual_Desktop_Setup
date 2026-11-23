// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { computeCablePath } from './cableRouting';
import { defaultProject, makeItem } from './catalog';
import { findItemCollisions, snapWallOutletPosition } from './collision';
import { isOutOfBounds, itemWorldY } from './placement';
import { devicePortWorld, devicePorts, isPortKind, resolveItemTransform } from './ports';
import {
  computePowerStripSize,
  computePowerStripSlots,
  computePowerStripUsbPorts,
  computeWallOutletSize,
  computeWallOutletSlots,
  computeWallOutletUsbPorts,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  plugSpecValues,
} from './power';
import { projectSchema } from './project';

describe('power strip, outlet & plug system', () => {
  it('computes distinct sizes & slot counts across 1x3..2x4 strip layouts and USB configs', () => {
    const base1x3 = { ...defaultPowerStripSettings(), layout: '1x3' as const, usbA: 0, usbC: 0 };
    const grid2x4 = { ...defaultPowerStripSettings(), layout: '2x4' as const, usbA: 2, usbC: 2 };

    const s1 = computePowerStripSize(base1x3);
    const s2 = computePowerStripSize(grid2x4);
    expect(s2.depth).toBeGreaterThan(s1.depth);
    expect(s2.width).toBeGreaterThan(s1.width);

    expect(computePowerStripSlots(base1x3).filter((s) => s.kind === 'power')).toHaveLength(3);
    expect(computePowerStripSlots(grid2x4).filter((s) => s.kind === 'power')).toHaveLength(8);
    expect(computePowerStripUsbPorts(grid2x4)).toHaveLength(4);
    expect(computePowerStripUsbPorts(base1x3)).toHaveLength(0);
  });

  it('supports twoPin, threePin, and combo5 on both power strips and wall/floor outlets', () => {
    for (const outletType of ['combo5', 'twoPin', 'threePin'] as const) {
      const strip = makeItem('powerStrip');
      strip.powerStrip = {
        ...defaultPowerStripSettings(),
        outletType,
        layout: '1x5',
        usbA: 1,
        usbC: 2,
      };
      strip.size = computePowerStripSize(strip.powerStrip);

      const outletWall = makeItem('wallOutlet');
      outletWall.wallOutlet = {
        ...defaultWallOutletSettings(),
        mount: 'wall',
        outletType,
        gangs: 1,
        usbA: 1,
        usbC: 0,
      };
      outletWall.size = computeWallOutletSize(outletWall.wallOutlet);

      const outletFloor = makeItem('wallOutlet');
      outletFloor.wallOutlet = {
        ...defaultWallOutletSettings(),
        mount: 'floor',
        outletType,
        gangs: 1,
        usbA: 0,
        usbC: 0,
      };
      outletFloor.surface = 'floor';
      delete outletFloor.wallY;
      outletFloor.size = computeWallOutletSize(outletFloor.wallOutlet);

      const proj = defaultProject();
      proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.03, color: '#eef2f6' };
      proj.items.push(strip, outletWall, outletFloor);

      expect(projectSchema.safeParse(proj).success).toBe(true);
      expect(isPortKind('powerStrip')).toBe(true);
      expect(isPortKind('wallOutlet')).toBe(true);
      expect(devicePorts(strip).some((p) => p.id === 'ac-in')).toBe(true);
      expect(
        computeWallOutletSlots(outletWall.wallOutlet).filter((s) => s.kind === 'power'),
      ).toHaveLength(1);
      expect(computeWallOutletSlots(outletWall.wallOutlet).some((s) => s.kind === 'usbc')).toBe(
        false,
      );
      expect(computeWallOutletUsbPorts(outletWall.wallOutlet)).toHaveLength(1);
    }

    // 墙面/地面插座严禁多联面板与 Type-C
    const bad = defaultProject();
    bad.desk.backWall = { enabled: true, height: 1.15, gap: 0.03, color: '#eef2f6' };
    const invalidWall = makeItem('wallOutlet');
    // @ts-expect-error verify runtime schema rejects multi-gang & usbC on wallOutlet
    invalidWall.wallOutlet = { mount: 'wall', outletType: 'combo5', gangs: 2, usbA: 0, usbC: 1 };
    bad.items.push(invalidWall);
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });

  it('supports magnetic flush edge snapping & axis alignment between adjacent single wall/floor outlets', () => {
    const proj = defaultProject();
    proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.03, color: '#eef2f6' };

    const w1 = makeItem('wallOutlet');
    w1.x = 0.2;
    w1.wallY = 0.34;
    const w2 = makeItem('wallOutlet');
    w2.x = 0.302; // slightly within 2.5 cm of w1.x + 0.086 = 0.286
    w2.wallY = 0.352; // slightly off level within 2.0 cm of 0.34

    const wallSnap = snapWallOutletPosition(w2, { x: w2.x, z: 0, wallY: w2.wallY }, [w1, w2]);
    expect(wallSnap.snapped).toBe(true);
    expect(wallSnap.x).toBeCloseTo(0.286, 3);
    expect(wallSnap.wallY).toBeCloseTo(0.34, 3);

    w2.x = wallSnap.x;
    w2.wallY = wallSnap.wallY;
    expect(findItemCollisions(w2, proj.desk, [w1, w2])).toEqual([]);

    const f1 = makeItem('wallOutlet');
    f1.wallOutlet = { ...defaultWallOutletSettings(), mount: 'floor' };
    f1.surface = 'floor';
    delete f1.wallY;
    f1.size = computeWallOutletSize(f1.wallOutlet);
    f1.x = -0.3;
    f1.z = -0.35;

    const f2 = { ...f1, id: 'f2', x: -0.172, z: -0.341 }; // near f1.x + 0.112 = -0.188
    const floorSnap = snapWallOutletPosition(f2, { x: f2.x, z: f2.z }, [f1, f2]);
    expect(floorSnap.snapped).toBe(true);
    expect(floorSnap.x).toBeCloseTo(-0.188, 3);
    expect(floorSnap.z).toBeCloseTo(-0.35, 3);
  });

  it('positions wall outlets flush on backWall and floor outlets at y = 0 without desk bounds failure', () => {
    const proj = defaultProject();
    proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.03, color: '#eef2f6' };

    const wallSocket = makeItem('wallOutlet');
    wallSocket.x = 0.25;
    wallSocket.wallY = 0.34;
    expect(isOutOfBounds(wallSocket, proj.desk, [wallSocket])).toBe(false);
    const wt = resolveItemTransform(wallSocket, proj.desk, [wallSocket]);
    expect(wt.position[1]).toBeCloseTo(0.34, 4);

    // Turning wall off flags wall-mounted socket out of bounds; switching to floor sits at y = 0 cleanly.
    const projNoWall = defaultProject();
    expect(isOutOfBounds(wallSocket, projNoWall.desk, [wallSocket])).toBe(true);

    const floorSocket = makeItem('wallOutlet');
    floorSocket.wallOutlet = { ...defaultWallOutletSettings(), mount: 'floor' };
    floorSocket.surface = 'floor';
    delete floorSocket.wallY;
    floorSocket.x = -0.3;
    floorSocket.z = -0.35;
    floorSocket.size = computeWallOutletSize(floorSocket.wallOutlet);
    expect(itemWorldY(proj.desk, floorSocket, [floorSocket])).toBe(0);
    expect(isOutOfBounds(floorSocket, proj.desk, [floorSocket])).toBe(false);
    const fp = devicePortWorld(floorSocket, 'slot-1', proj.desk, [floorSocket]);
    expect(fp?.direction.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-4);
  });

  it('validates & routes cables from desk devices/power strips to below-desk wall outlets with plug specs', () => {
    const proj = defaultProject();
    proj.desk.backWall = { enabled: true, height: 1.15, gap: 0.03, color: '#eef2f6' };
    const strip = makeItem('powerStrip');
    strip.x = -0.35;
    strip.z = -0.22;
    const wallSocket = makeItem('wallOutlet');
    wallSocket.x = 0.15;
    wallSocket.wallY = 0.32;
    const monitor = proj.items.find((i) => i.kind === 'monitor')!;

    proj.items.push(strip, wallSocket);
    proj.cables = [
      {
        id: 'c-mon-strip',
        kind: 'power',
        from: { type: 'device', itemId: monitor.id, portId: 'power' },
        to: { type: 'device', itemId: strip.id, portId: 'slot-1' },
        routeViaArm: false,
        color: '#1b1f26',
        toPlugType: 'rightAngle',
      },
      {
        id: 'c-strip-wall',
        kind: 'power',
        from: { type: 'device', itemId: strip.id, portId: 'ac-in' },
        to: { type: 'device', itemId: wallSocket.id, portId: 'slot-1' },
        routeViaArm: false,
        color: '#1b1f26',
        fromPlugType: 'cn3Pin',
        toPlugType: 'cn3Pin',
      },
      {
        id: 'c-gan-usbc',
        kind: 'usbc',
        from: { type: 'device', itemId: monitor.id, portId: 'usbc' },
        to: { type: 'device', itemId: strip.id, portId: 'slot-2' },
        routeViaArm: false,
        color: '#2d3748',
        toPlugType: 'ganAdapter',
      },
    ];

    expect(plugSpecValues).toContain('appleDuckhead');
    expect(projectSchema.safeParse(proj).success).toBe(true);

    const pStripToWall = computeCablePath(proj.cables[1], proj);
    expect(pStripToWall).not.toBeNull();
    expect(pStripToWall!.points.length).toBeGreaterThanOrEqual(4);
    const lastPt = pStripToWall!.points[pStripToWall!.points.length - 1];
    expect(lastPt.y).toBeLessThan(proj.desk.height);
  });

  it('places power strip with user-selected built-in cord length and auto-plugs into wall outlet', async () => {
    const { useEditor } = await import('../store/editorStore');
    const { canAcPlugFitOutlet } = await import('./power');
    useEditor.getState().replace(defaultProject(), new Map());

    expect(canAcPlugFitOutlet('ganAdapter', 'combo5')).toBe(true);
    expect(canAcPlugFitOutlet('ganAdapter', 'twoPin')).toBe(true);
    expect(canAcPlugFitOutlet('ganAdapter', 'threePin')).toBe(false);
    expect(canAcPlugFitOutlet('cn3Pin', 'twoPin')).toBe(false);
    expect(canAcPlugFitOutlet('cn3Pin', 'combo5')).toBe(true);

    const stripId = useEditor.getState().addPowerStripWithCord({
      cordLengthM: 1.8,
      plugType: 'cn3Pin',
      connectionMode: 'autoWallOutlet',
    });
    const proj = useEditor.getState().project;
    const strip = proj.items.find((i) => i.id === stripId)!;
    const wallOutlet = proj.items.find((i) => i.kind === 'wallOutlet')!;
    expect(strip).toBeTruthy();
    expect(wallOutlet).toBeTruthy();
    expect(strip.powerStrip?.cordLengthM).toBe(1.8);

    const mainsCord = proj.cables!.find(
      (c) => c.from.type === 'device' && c.from.itemId === stripId && c.from.portId === 'ac-in',
    )!;
    expect(mainsCord).toBeTruthy();
    expect(mainsCord.lengthM).toBe(1.8);
    expect(mainsCord.toPlugType).toBe('cn3Pin');
    expect(mainsCord.to).toEqual({ type: 'device', itemId: wallOutlet.id, portId: 'slot-1' });

    useEditor
      .getState()
      .configurePowerStripCord(stripId, { cordLengthM: 3, plugType: 'rightAngle' });
    const updatedCord = useEditor.getState().project.cables!.find((c) => c.id === mainsCord.id)!;
    expect(updatedCord.lengthM).toBe(3);
    expect(updatedCord.toPlugType).toBe('rightAngle');
  });
});

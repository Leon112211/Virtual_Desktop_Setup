import { beforeEach, describe, expect, it } from 'vitest';
import { defaultProject, makeItem } from './catalog';
import {
  applyArmBaseSolutionToProject,
  applyArmSolutionToProject,
  applyDragPreview,
  ARM_DUAL_SOCKET_OFFSET,
  ARM_ELBOW_MAX_YAW_DEG,
  ARM_LOWER_LENGTH,
  ARM_LOWER_PITCH_MAX_DEG,
  ARM_LOWER_PITCH_MIN_DEG,
  ARM_LOWER_RISE,
  ARM_MAX_DY,
  ARM_UPPER_LENGTH,
  ARM_UPPER_PITCH_MAX_DEG,
  ARM_UPPER_PITCH_MIN_DEG,
  computeMonitorArmKinematics,
  computeMonitorArmSystem,
  constrainTargetToMonitorArm,
  normalizeRotationDeg,
  solveArmBaseMove,
  solveHorizontalElbowSwivel,
  solveLowerArmPitch,
  solveUpperArmPitch,
} from './monitorArm';
import { useEditor } from '../store/editorStore';

describe('显示器支架臂固定机械参数、实时跟随与物理极限模拟', () => {
  beforeEach(() => useEditor.getState().replace({ ...defaultProject(), cables: [] }, new Map()));

  it('底座夹持坐标固定不随显示器移动漂移，且双长臂保持精确固定连杆长度', () => {
    const s = () => useEditor.getState();
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    s().select(monitor.id);
    s().add('monitorArm');

    const arm = s().project.items.find((i) => i.kind === 'monitorArm')!;
    const initialClampX = arm.monitorArm!.clampX!;
    expect(initialClampX).toBeCloseTo(monitor.x, 4);

    // Move monitor within reachable envelope
    s().updateItem(monitor.id, { x: 0.14, z: 0.04, lift: 0.06 });
    const armAfter = s().project.items.find((i) => i.kind === 'monitorArm')!;
    const monAfter = s().project.items.find((i) => i.id === monitor.id)!;
    expect(armAfter.monitorArm!.clampX).toBeCloseTo(initialClampX, 5);

    const kin = computeMonitorArmKinematics(monAfter, armAfter, s().project.desk);
    expect(kin.basePos.x).toBeCloseTo(initialClampX, 5);
    expect(kin.elbowPos.y - kin.columnTop.y).toBeCloseTo(ARM_LOWER_RISE, 5);
    expect(kin.columnTop.distanceTo(kin.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 5);
    expect(kin.elbowPos.distanceTo(kin.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 5);
    expect(kin.clamped).toBe(false);
  });

  it('NB F160 双屏支架臂底座双套筒对称展开且双臂各自保持固定机械长度', () => {
    const s = () => useEditor.getState();
    const m1 = s().project.items.find((i) => i.kind === 'monitor')!;
    s().updateItem(m1.id, { x: -0.31, z: -0.1 });
    s().add('monitor');
    const m2Id = s().selected!;
    s().updateItem(m2Id, { x: 0.31, z: -0.1 });

    s().select(m1.id);
    s().add('monitorArm');
    const armId = s().selected!;
    s().updateItem(armId, {
      monitorArm: {
        monitorId: m1.id,
        clampSide: 'center',
        clampX: 0,
        cableClip: true,
        armStyle: 'dual',
        secondaryKind: 'monitor',
        secondaryMonitorId: m2Id,
      },
    });

    const arm = s().project.items.find((i) => i.id === armId)!;
    const sys = computeMonitorArmSystem(arm, s().project.items, s().project.desk);
    expect(sys.isDual).toBe(true);
    expect(sys.branches).toHaveLength(2);
    for (const b of sys.branches) {
      expect(b.columnTop.distanceTo(b.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 5);
      expect(b.elbowPos.distanceTo(b.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 5);
    }
    expect(sys.branches[0].elbowPos.x).toBeLessThan(0);
    expect(sys.branches[1].elbowPos.x).toBeGreaterThan(0);
    expect(Math.abs(sys.branches[1].turretBase.x - sys.branches[0].turretBase.x)).toBeCloseTo(
      ARM_DUAL_SOCKET_OFFSET * 2,
      4,
    );

    // 直接从模型库“双头机械臂”添加独立 NB F160 部件时，直接生成 dual 双臂并挂载双设备
    s().select(armId);
    s().remove();
    s().addDualMonitorArm();
    const dedicatedDual = s().project.items.find((i) => i.kind === 'monitorArm')!;
    expect(dedicatedDual.name).toBe('双头机械臂');
    expect(dedicatedDual.monitorArm?.armStyle).toBe('dual');
    expect(dedicatedDual.monitorArm?.secondaryMonitorId).toBe(m2Id);
  });

  it('超出最大臂展、最小折叠间距或桌面后缘限位时对目标进行物理约束', () => {
    const s = () => useEditor.getState();
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    s().select(monitor.id);
    s().add('monitorArm');
    const arm = s().project.items.find((i) => i.kind === 'monitorArm')!;

    // 1. Over-extension far forward (+1.2 m): clamped to max horizontal reach
    const maxBounded = constrainTargetToMonitorArm(
      monitor,
      monitor.x,
      1.2,
      monitor.lift,
      arm,
      'primary',
      'monitor',
      s().project.items,
      s().project.desk,
    );
    expect(maxBounded.clamped).toBe(true);
    expect(maxBounded.limitReason).toBe('maxReach');
    expect(maxBounded.z).toBeLessThan(0.5);

    // Committing an out-of-reach coordinate via updateItem also constrains onto reachable ring
    s().updateItem(monitor.id, { x: 0.9, z: 0.9 });
    const clampedMon = s().project.items.find((i) => i.id === monitor.id)!;
    const kinMax = computeMonitorArmKinematics(clampedMon, arm, s().project.desk);
    expect(kinMax.reachDistance).toBeCloseTo(kinMax.dMax, 3);
    expect(kinMax.columnTop.distanceTo(kinMax.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 5);
    expect(kinMax.elbowPos.distanceTo(kinMax.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 4);

    // 2. Collapsing too close into the shoulder turret
    const minBounded = constrainTargetToMonitorArm(
      clampedMon,
      arm.monitorArm!.clampX!,
      -0.25,
      clampedMon.lift,
      arm,
      'primary',
      'monitor',
      s().project.items,
      s().project.desk,
    );
    expect(minBounded.clamped).toBe(true);
    expect(minBounded.limitReason).toBe('minReach');

    // 3. Pushing rear behind desk clamp stop
    const rearBounded = constrainTargetToMonitorArm(
      clampedMon,
      0.1,
      -0.9,
      clampedMon.lift,
      arm,
      'primary',
      'monitor',
      s().project.items,
      s().project.desk,
    );
    expect(rearBounded.clamped).toBe(true);
    expect(rearBounded.limitReason).toBe('rearStop');

    // 4. Vertical lift vs gas-spring stroke stays strictly within ARM_MAX_DY
    expect(ARM_MAX_DY).toBeGreaterThan(0.2);
  });

  it('肘关节仅作纯水平绕轴旋转与左右折向切换，垂直高度与双定长连杆恒定', () => {
    const s = () => useEditor.getState();
    const rawMon = s().project.items.find((i) => i.kind === 'monitor')!;
    s().updateItem(rawMon.id, { z: 0.02 });
    const monitor = s().project.items.find((i) => i.id === rawMon.id)!;
    s().select(monitor.id);
    s().add('monitorArm');
    const arm = s().project.items.find((i) => i.kind === 'monitorArm')!;

    // 1. Horizontal bend toggle flips left <-> right while monitor stays stationary and elbow Y stays fixed
    s().updateItem(arm.id, {
      monitorArm: { ...arm.monitorArm!, primaryElbowBend: 'left' },
    });
    const kinLeft = computeMonitorArmKinematics(
      monitor,
      s().project.items.find((i) => i.id === arm.id)!,
      s().project.desk,
    );
    s().updateItem(arm.id, {
      monitorArm: { ...arm.monitorArm!, primaryElbowBend: 'right' },
    });
    const kinRight = computeMonitorArmKinematics(
      monitor,
      s().project.items.find((i) => i.id === arm.id)!,
      s().project.desk,
    );
    expect(kinLeft.elbowPos.x).toBeLessThan(kinLeft.columnTop.x);
    expect(kinRight.elbowPos.x).toBeGreaterThan(kinRight.columnTop.x);
    expect(kinLeft.elbowPos.y - kinLeft.columnTop.y).toBeCloseTo(ARM_LOWER_RISE, 5);
    expect(kinRight.elbowPos.y - kinRight.columnTop.y).toBeCloseTo(ARM_LOWER_RISE, 5);
    expect(kinLeft.columnTop.distanceTo(kinLeft.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 5);
    expect(kinRight.elbowPos.distanceTo(kinRight.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 5);

    // 2. Continuous horizontal swivel sweeps elbow across horizontal XZ plane at fixed elbowBaseY
    for (const desiredYaw of [-75, 0, 75]) {
      const sysBefore = computeMonitorArmSystem(
        s().project.items.find((i) => i.id === arm.id)!,
        s().project.items,
        s().project.desk,
      );
      const solved = solveHorizontalElbowSwivel({
        branch: sysBefore.branches[0],
        desiredYawDeg: desiredYaw,
      });
      s().commit((p) => {
        const a = p.items.find((i) => i.id === arm.id)!;
        a.monitorArm!.primaryElbowBend = solved.bend;
        const m = p.items.find((i) => i.id === solved.targetId)!;
        m.x = solved.x;
        m.z = solved.z;
      });
      const movedMon = s().project.items.find((i) => i.id === monitor.id)!;
      const updatedArm = s().project.items.find((i) => i.id === arm.id)!;
      const kinAfter = computeMonitorArmKinematics(movedMon, updatedArm, s().project.desk);
      expect(kinAfter.elbowPos.y - kinAfter.columnTop.y).toBeCloseTo(ARM_LOWER_RISE, 5);
      expect(kinAfter.columnTop.distanceTo(kinAfter.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 5);
      expect(kinAfter.elbowPos.distanceTo(kinAfter.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 5);
      expect(kinAfter.lowerYawDeg).toBeCloseTo(desiredYaw, 0);
    }

    // 3. Over-rotating backward clamps at mechanical turret stop
    const sysCurr = computeMonitorArmSystem(
      s().project.items.find((i) => i.id === arm.id)!,
      s().project.items,
      s().project.desk,
    );
    const overBack = solveHorizontalElbowSwivel({
      branch: sysCurr.branches[0],
      desiredYawDeg: 178,
    });
    expect(overBack.yawDeg).toBe(ARM_ELBOW_MAX_YAW_DEG);
    expect(overBack.limitReason).toBe('rearStop');
  });

  it('物品内置 3D 旋转归一化与实时旋转预览保持单步一致性', () => {
    expect(normalizeRotationDeg(195)).toBe(-165);
    expect(normalizeRotationDeg(-195)).toBe(165);
    expect(normalizeRotationDeg(360)).toBe(0);
    expect(normalizeRotationDeg(180)).toBe(180);

    const p = defaultProject();
    const kb = makeItem('keyboard');
    p.items.push(kb);
    const previewed = applyDragPreview(p.items, {
      kind: 'rotation',
      id: kb.id,
      rotation: -45,
    });
    expect(previewed.find((i) => i.id === kb.id)!.rotation).toBe(-45);

    const monitor = p.items.find((i) => i.kind === 'monitor')!;
    const pitched = applyDragPreview(p.items, {
      kind: 'pose',
      id: monitor.id,
      axis: 'pitch',
      value: 15,
    });
    expect(pitched.find((i) => i.id === monitor.id)!.pitch).toBe(15);

    const rolled = applyDragPreview(p.items, {
      kind: 'pose',
      id: monitor.id,
      axis: 'roll',
      value: 90,
    });
    expect(rolled.find((i) => i.id === monitor.id)!.roll).toBe(90);

    const lidded = applyDragPreview(p.items, {
      kind: 'pose',
      id: kb.id,
      axis: 'lidAngle',
      value: 120,
    });
    expect(lidded.find((i) => i.id === kb.id)!.lidAngle).toBe(120);
  });

  it('下长臂与上长臂均支持独立上下俯仰活动，且两段三维长度始终刚性恒定（27.5 cm / 30.5 cm）', () => {
    const s = () => useEditor.getState();
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    s().select(monitor.id);
    s().add('monitorArm');
    const arm = s().project.items.find((i) => i.kind === 'monitorArm')!;

    // 1. Pitch lower arm up to +60° and down to -5°: elbow height & horizontal projection update
    //    strictly via L1*sin(theta1) and L1*cos(theta1) while L1 === 0.275 and L2 === 0.305 never stretch
    for (const desiredLowerPitch of [60, -5, 45]) {
      const curArm = s().project.items.find((i) => i.id === arm.id)!;
      const sysBefore = computeMonitorArmSystem(curArm, s().project.items, s().project.desk);
      const solved = solveLowerArmPitch({
        arm: curArm,
        branch: sysBefore.branches[0],
        desiredPitchDeg: desiredLowerPitch,
        allItems: s().project.items,
      });
      s().commit((p) => applyArmSolutionToProject(p, arm.id, 'primary', solved, true));

      const armAfter = s().project.items.find((i) => i.id === arm.id)!;
      const monAfter = s().project.items.find((i) => i.id === monitor.id)!;
      const kinAfter = computeMonitorArmKinematics(monAfter, armAfter, s().project.desk);
      const rad = (desiredLowerPitch * Math.PI) / 180;
      expect(kinAfter.lowerPitchDeg).toBeCloseTo(desiredLowerPitch, 1);
      expect(kinAfter.elbowPos.y - kinAfter.columnTop.y).toBeCloseTo(
        ARM_LOWER_LENGTH * Math.sin(rad),
        4,
      );
      expect(kinAfter.lowerHoriz).toBeCloseTo(ARM_LOWER_LENGTH * Math.cos(rad), 4);
      expect(kinAfter.columnTop.distanceTo(kinAfter.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 4);
      expect(kinAfter.elbowPos.distanceTo(kinAfter.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 3);
    }

    // Extreme lower arm angles clamp at mechanical joint limits [-8°, +70°]
    const curArmForClamp = s().project.items.find((i) => i.id === arm.id)!;
    const sysForClamp = computeMonitorArmSystem(
      curArmForClamp,
      s().project.items,
      s().project.desk,
    );
    const overMaxLower = solveLowerArmPitch({
      arm: curArmForClamp,
      branch: sysForClamp.branches[0],
      desiredPitchDeg: 85,
      allItems: s().project.items,
    });
    expect(overMaxLower.lowerPitchDeg).toBe(ARM_LOWER_PITCH_MAX_DEG);
    expect(overMaxLower.limitReason).toBe('lowerPitchLimit');

    const overMinLower = solveLowerArmPitch({
      arm: curArmForClamp,
      branch: sysForClamp.branches[0],
      desiredPitchDeg: -30,
      allItems: s().project.items,
    });
    expect(overMinLower.lowerPitchDeg).toBe(ARM_LOWER_PITCH_MIN_DEG);
    expect(overMinLower.limitReason).toBe('lowerPitchLimit');

    // 2. Pitch upper gas-spring arm independently (+50° up and -25° down) while lower elbow holds steady
    for (const desiredUpperPitch of [50, -25, 18]) {
      const aNow = s().project.items.find((i) => i.id === arm.id)!;
      const sysNow = computeMonitorArmSystem(aNow, s().project.items, s().project.desk);
      const elbowYBefore = sysNow.branches[0].elbowPos.y;
      const solvedUpper = solveUpperArmPitch({
        arm: aNow,
        branch: sysNow.branches[0],
        desiredUpperPitchDeg: desiredUpperPitch,
        allItems: s().project.items,
      });
      s().commit((p) => applyArmSolutionToProject(p, arm.id, 'primary', solvedUpper, false));

      const aAfter = s().project.items.find((i) => i.id === arm.id)!;
      const mAfter = s().project.items.find((i) => i.id === monitor.id)!;
      const kinAfter = computeMonitorArmKinematics(mAfter, aAfter, s().project.desk);
      expect(kinAfter.elbowPos.y).toBeCloseTo(elbowYBefore, 4);
      expect(kinAfter.upperPitchDeg).toBeCloseTo(desiredUpperPitch, 0);
      expect(kinAfter.columnTop.distanceTo(kinAfter.elbowPos)).toBeCloseTo(ARM_LOWER_LENGTH, 4);
      expect(kinAfter.elbowPos.distanceTo(kinAfter.vesaHeadPos)).toBeCloseTo(ARM_UPPER_LENGTH, 3);
    }

    // Extreme upper arm angles clamp within [-62°, +62°]
    const aExt = s().project.items.find((i) => i.id === arm.id)!;
    const sysExt = computeMonitorArmSystem(aExt, s().project.items, s().project.desk);
    const overUpperUp = solveUpperArmPitch({
      arm: aExt,
      branch: sysExt.branches[0],
      desiredUpperPitchDeg: 80,
      allItems: s().project.items,
    });
    expect(overUpperUp.limitReason).toBe('upperPitchLimit');
    expect(overUpperUp.upperPitchDeg).toBeLessThanOrEqual(ARM_UPPER_PITCH_MAX_DEG + 0.1);

    const overUpperDown = solveUpperArmPitch({
      arm: aExt,
      branch: sysExt.branches[0],
      desiredUpperPitchDeg: -80,
      allItems: s().project.items,
    });
    expect(overUpperDown.limitReason).toBe('upperPitchLimit');
    expect(overUpperDown.upperPitchDeg).toBeGreaterThanOrEqual(ARM_UPPER_PITCH_MIN_DEG - 0.1);

    // 3. Raising lower arm shrinks h1 and shrinks dMax; over-extended monitor is pulled within new circle
    const highLowerSys = computeMonitorArmSystem(
      s().project.items.find((i) => i.id === arm.id)!,
      s().project.items,
      s().project.desk,
    );
    const solvedHigh = solveLowerArmPitch({
      arm: s().project.items.find((i) => i.id === arm.id)!,
      branch: highLowerSys.branches[0],
      desiredPitchDeg: 68,
      allItems: s().project.items,
    });
    s().commit((p) => applyArmSolutionToProject(p, arm.id, 'primary', solvedHigh, true));
    s().updateItem(monitor.id, { z: 0.4 });
    const stretchedMon = s().project.items.find((i) => i.id === monitor.id)!;
    const stretchedKin = computeMonitorArmKinematics(
      stretchedMon,
      s().project.items.find((i) => i.id === arm.id)!,
      s().project.desk,
    );
    expect(stretchedKin.dMax).toBeLessThan(ARM_LOWER_LENGTH + ARM_UPPER_LENGTH - 0.1);
    expect(stretchedKin.reachDistance).toBeCloseTo(stretchedKin.dMax, 3);
    expect(stretchedKin.columnTop.distanceTo(stretchedKin.elbowPos)).toBeCloseTo(
      ARM_LOWER_LENGTH,
      4,
    );
    expect(stretchedKin.elbowPos.distanceTo(stretchedKin.vesaHeadPos)).toBeCloseTo(
      ARM_UPPER_LENGTH,
      3,
    );

    // 4. Switching to inverted mount mirrors lowerPitchDeg symmetrically into [-70°, +8°]
    const preFlipArm = s().project.items.find((i) => i.id === arm.id)!;
    s().updateItem(arm.id, {
      monitorArm: { ...preFlipArm.monitorArm!, mountOrientation: 'inverted' },
    });
    const postFlipArm = s().project.items.find((i) => i.id === arm.id)!;
    expect(postFlipArm.monitorArm?.primaryLowerPitchDeg).toBeCloseTo(-68, 1);
  });

  it('支架底座支持移动到后/左/右桌缘、桌面穿孔与启用走线孔磁吸，且保持定长连杆与屏幕跟随', () => {
    const s = () => useEditor.getState();
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    s().updateItem(monitor.id, { x: -0.25, z: -0.05 });
    s().select(monitor.id);
    s().add('monitorArm');
    const arm = () => s().project.items.find((i) => i.kind === 'monitorArm')!;

    // 1. Move base to left desk edge (x -> -desk.width/2 + 0.036, baseYaw = +PI/2)
    const desk = s().project.desk;
    const toLeft = solveArmBaseMove({
      arm: arm(),
      desk,
      allItems: s().project.items,
      desiredX: -desk.width / 2 + 0.02,
      desiredZ: -0.1,
    });
    expect(toLeft.clampEdge).toBe('left');
    expect(toLeft.clampX).toBeCloseTo(-desk.width / 2 + 0.036, 4);
    expect(toLeft.baseYaw).toBeCloseTo(Math.PI / 2, 4);
    s().commit((p) => applyArmBaseSolutionToProject(p, arm().id, toLeft));
    const sysLeft = computeMonitorArmSystem(arm(), s().project.items, desk);
    expect(sysLeft.clampEdge).toBe('left');
    expect(sysLeft.baseYaw).toBeCloseTo(Math.PI / 2, 4);
    expect(sysLeft.branches[0].columnTop.distanceTo(sysLeft.branches[0].elbowPos)).toBeCloseTo(
      ARM_LOWER_LENGTH,
      4,
    );
    expect(sysLeft.branches[0].elbowPos.distanceTo(sysLeft.branches[0].vesaHeadPos)).toBeCloseTo(
      ARM_UPPER_LENGTH,
      3,
    );

    // 2. Move base to right desk edge and verify monitor tethers inward to preserve fixed link lengths
    const toRight = solveArmBaseMove({
      arm: arm(),
      desk,
      allItems: s().project.items,
      desiredX: desk.width / 2 - 0.02,
      desiredZ: -0.05,
    });
    expect(toRight.clampEdge).toBe('right');
    expect(toRight.clampX).toBeCloseTo(desk.width / 2 - 0.036, 4);
    expect(toRight.updatedTargets.length).toBe(1);
    s().commit((p) => applyArmBaseSolutionToProject(p, arm().id, toRight));
    const sysRight = computeMonitorArmSystem(arm(), s().project.items, desk);
    expect(sysRight.branches[0].columnTop.distanceTo(sysRight.branches[0].elbowPos)).toBeCloseTo(
      ARM_LOWER_LENGTH,
      4,
    );
    expect(sysRight.branches[0].elbowPos.distanceTo(sysRight.branches[0].vesaHeadPos)).toBeCloseTo(
      ARM_UPPER_LENGTH,
      3,
    );

    // 3. Move base onto interior desktop surface & snap onto enabled center grommet
    s().commit((p) => {
      p.desk.grommet = { enabled: true, side: 'center', diameter: 0.06 };
    });
    const toSurface = solveArmBaseMove({
      arm: arm(),
      desk: s().project.desk,
      allItems: s().project.items,
      desiredX: 0.02,
      desiredZ: -desk.depth / 2 + 0.11,
    });
    expect(toSurface.clampEdge).toBe('surface');
    expect(toSurface.clampX).toBeCloseTo(0, 4);
    expect(toSurface.clampZ).toBeCloseTo(-desk.depth / 2 + 0.09, 4);
  });
});

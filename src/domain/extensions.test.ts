// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  arePortKindsCompatible,
  cableEffectiveLengths,
  cableMeta,
  formatCableDisplayName,
  isPortCompatibleWithCable,
  POWER_CABLE_PRESETS,
  resolveCablePlugEnds,
  SIGNAL_CABLE_PRESETS,
} from './cable';
import {
  computeCablePath,
  computeMonitorArmKinematics,
  computeMonitorArmSystem,
} from './cableRouting';
import {
  buildKeyboardKeys,
  defaultKeyboardSettings,
  KEYBOARD_LAYOUT_SPECS,
  KEYBOARD_THEME_SPECS,
  keyboardLayouts,
  resolveKeyboardTheme,
} from './keyboard';
import { defaultProject, makeItem } from './catalog';
import { CONTROLLER_PRESETS, controllerPresetById, defaultControllerSettings } from './controller';
import {
  defaultMouseSettings,
  MOUSE_PRESETS,
  mousePresetById,
  mousePresetsBySeries,
} from './mouse';
import {
  isValidMousepadSize,
  metersFromMm,
  mm,
  MOUSEPAD_DEFAULT_SIZE,
  MOUSEPAD_MAX_THICKNESS,
  MOUSEPAD_MIN_THICKNESS,
} from './mousepad';
import { deskShelfRect, grommetPosition, setDeskDepth, setDeskShape, shelfDepthMax } from './desk';
import {
  gamingLaptopPresets,
  isMacbookPro14ProledSize,
  isMonitorMountedOnArm,
  isOfficialMacbookSpec,
  LAPTOP_STAND_PRESETS,
  MACBOOK_PRO_14_VARIANTS,
  macbookAirColors,
  macbookOfficialColors,
  macbookPresets,
  macbookProColors,
  macMiniPresets,
  matchDevicePresetId,
} from './laptop';
import { isOutOfBounds, itemWorldY } from './placement';
import { devicePorts, effectiveLidAngle, PORT_SOCKET_SPECS, resolveItemTransform } from './ports';
import { projectSchema } from './project';
import { defaultSpeakerSettings, SPEAKER_PRESETS, speakerPresetById } from './speaker';
import { useEditor } from '../store/editorStore';

describe('前侧倒圆角、60mm 走线孔、工位挡板与一体等宽层架', () => {
  beforeEach(() => useEditor.getState().replace(defaultProject(), new Map()));

  it('前侧 R5 cm 圆角准确识别切角越界，后侧保持直角', () => {
    const desk = defaultProject().desk; // 1.4 × 0.7
    const tiny = makeItem('speaker');
    tiny.size = { width: 0.015, height: 0.05, depth: 0.015 };
    // 落在前右 R5 cm 倒圆角切去区域内: corner=(0.7, 0.35), arc center=(0.65, 0.30)
    // (0.692, 0.342) 距圆心距离 sqrt(0.042^2 + 0.042^2) = 0.0594 > 0.05
    tiny.x = 0.692;
    tiny.z = 0.342;
    expect(isOutOfBounds(tiny, desk)).toBe(true);

    // 后右直角区域内: (0.692, -0.342) 应完全受支撑
    tiny.z = -0.342;
    expect(isOutOfBounds(tiny, desk)).toBe(false);
  });

  it('标准 60 mm 走线孔与非 L 形挡板/层架校验及切换原子清理', () => {
    const s = () => useEditor.getState();

    // 默认 60 mm 走线孔与位置计算
    s().commit((p) => {
      p.desk.grommet = { enabled: true, side: 'right' };
    });
    expect(grommetPosition(s().project.desk)).toEqual({
      x: 0.7 - 0.22,
      z: -0.35 + 0.09,
      diameter: 0.06,
    });

    // 非标准孔径拒绝
    const bad = structuredClone(s().project);
    bad.desk.grommet = { enabled: true, side: 'center', diameter: 0.045 };
    expect(projectSchema.safeParse(bad).success).toBe(false);

    // 开启工位挡板与一体等宽层架
    s().commit((p) => {
      p.desk.partitions = { back: true, left: true, right: false, height: 0.4 };
      p.desk.shelf = { enabled: true, depth: 0.3, height: 0.2 };
    });
    const shelfRect = deskShelfRect(s().project.desk)!;
    expect(shelfRect.minX).toBeCloseTo(-0.7, 10);
    expect(shelfRect.maxX).toBeCloseTo(0.7, 10);
    expect(shelfRect.minZ).toBeCloseTo(-0.35, 10);
    expect(shelfRect.maxZ).toBeCloseTo(-0.05, 10);

    // 缩小主桌深度到 40 cm 时，层架纵深同步压缩至 shelfDepthMax(0.4) = 0.25 m
    s().commit((p) => setDeskDepth(p.desk, 0.4));
    expect(s().project.desk.shelf?.depth).toBe(shelfDepthMax(0.4));
    expect(s().project.desk.shelf?.depth).toBe(0.25);

    // 切换为 L 形桌时自动清理挡板与等宽层架，撤销一步还原
    s().commit((p) => setDeskShape(p.desk, 'left'));
    expect(s().project.desk.partitions).toBeUndefined();
    expect(s().project.desk.shelf).toBeUndefined();
    s().undo();
    expect(s().project.desk.return).toBeUndefined();
    expect(s().project.desk.partitions?.back).toBe(true);
    expect(s().project.desk.shelf?.enabled).toBe(true);

    // 非法直改 L 形同时保留启用挡板/层架会被 schema 拒绝
    const invalidL = structuredClone(s().project);
    invalidL.desk.return = { side: 'left', width: 0.6, extension: 0.6 };
    expect(projectSchema.safeParse(invalidL).success).toBe(false);
  });

  it('置于一体等宽层架上的物品使用层架高度并按层架纵深判断越界', () => {
    const p = defaultProject();
    p.desk.shelf = { enabled: true, depth: 0.22, height: 0.18 };
    const mini = makeItem('macMini');
    mini.surface = 'shelf';
    mini.x = 0;
    mini.z = -0.24; // 位于 [-0.35, -0.13] 层架内
    expect(itemWorldY(p.desk, mini)).toBeCloseTo(0.75 + 0.18, 6);
    expect(isOutOfBounds(mini, p.desk, [mini])).toBe(false);

    // 移出层架前缘 (-0.13) 到主桌前区 -> 对层架而言越界
    mini.z = 0.1;
    expect(isOutOfBounds(mini, p.desk, [mini])).toBe(true);
  });
});

describe('笔记本、Mac 主机、支架、显示器支架臂与模拟走线', () => {
  beforeEach(() => useEditor.getState().replace(defaultProject(), new Map()));

  it('新增设备预设、支架斜面/立式联动与支架臂 IK 计算', () => {
    expect(gamingLaptopPresets.length).toBeGreaterThanOrEqual(4);
    expect(macbookPresets.length).toBe(4);
    expect(macMiniPresets.length).toBe(2);

    // MacBook 仅允许苹果官方机型尺寸与对应配色，拒绝无关配色与自定义尺寸
    const s = () => useEditor.getState();
    s().add('macbook');
    const mbId = s().selected!;
    const initialMb = s().project.items.find((i) => i.id === mbId)!;
    expect(macbookOfficialColors(initialMb.size)).toEqual(macbookProColors);
    expect(macbookOfficialColors(macbookPresets[0].size)).toEqual(macbookAirColors);
    expect(isMacbookPro14ProledSize(initialMb.size)).toBe(false);
    expect(isMacbookPro14ProledSize(MACBOOK_PRO_14_VARIANTS.proled.size)).toBe(true);
    expect(
      isOfficialMacbookSpec(MACBOOK_PRO_14_VARIANTS.proled.size, macbookProColors[0].hex),
    ).toBe(true);
    expect(matchDevicePresetId(macbookPresets, MACBOOK_PRO_14_VARIANTS.proled.size)).toBe('pro14');
    s().updateItem(mbId, { size: { ...MACBOOK_PRO_14_VARIANTS.proled.size } });
    expect(projectSchema.safeParse(s().project).success).toBe(true);
    expect(() => s().updateItem(mbId, { color: '#b98b7b' })).toThrow();
    expect(() =>
      s().updateItem(mbId, { size: { width: 0.4, height: 0.02, depth: 0.3 } }),
    ).toThrow();
    s().add('laptopStand');
    const standId = s().selected!;
    const stand = s().project.items.find((i) => i.id === standId)!;
    expect(stand.laptopStand?.laptopId).toBe(mbId);

    // 移动支架并切换为立式收纳：笔记本随之移动且有效开合角归零
    s().updateItem(standId, { x: 0.35, z: 0.08, rotation: 15 });
    s().updateItem(standId, {
      laptopStand: { ...stand.laptopStand!, mode: 'vertical' },
    });
    const mb = s().project.items.find((i) => i.id === mbId)!;
    expect(effectiveLidAngle(mb, s().project.items)).toBe(0);
    const tf = resolveItemTransform(mb, s().project.desk, s().project.items);
    expect(tf.position[0]).toBeCloseTo(0.35, 5);
    expect(tf.position[2]).toBeCloseTo(0.08, 5);
    expect(tf.position[1]).toBeGreaterThan(s().project.desk.height + 0.05);

    // 为内置显示器安装支架臂并校验 IK 与理线卡扣点
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    s().select(monitor.id);
    s().add('monitorArm');
    const arm = s().project.items.find((i) => i.kind === 'monitorArm')!;
    expect(arm.monitorArm?.monitorId).toBe(monitor.id);
    const kin = computeMonitorArmKinematics(monitor, arm, s().project.desk);
    expect(kin.clipPoints).toHaveLength(5);
    expect(kin.vesaPos.y).toBeGreaterThan(s().project.desk.height + 0.2);
  });

  it('模拟 DP / HDMI / 电源走线：支持穿 60 mm 走线孔与沿支架臂理线，删除设备自动清理线缆', () => {
    const s = () => useEditor.getState();
    s().commit((p) => {
      delete p.cables;
      p.desk.grommet = { enabled: true, side: 'center', diameter: 0.06 };
    });

    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    s().select(monitor.id);
    s().add('monitorArm');
    s().add('macStudio');
    const studioId = s().selected!;

    // 1. 显示器 HDMI -> Mac Studio HDMI（走支架臂理线槽）
    s().addCable({
      kind: 'hdmi',
      from: { type: 'device', itemId: monitor.id, portId: 'hdmi' },
      to: { type: 'device', itemId: studioId, portId: 'hdmi' },
      routeViaArm: true,
      color: '#1e293b',
    });

    // 2. 显示器电源线 -> 经走线孔垂落桌下
    s().addCable({
      kind: 'power',
      from: { type: 'device', itemId: monitor.id, portId: 'power' },
      to: { type: 'floor', drop: 'grommet' },
      routeViaArm: true,
      color: '#18181b',
    });

    const cables = s().project.cables!;
    expect(cables).toHaveLength(2);

    const hdmiPath = computeCablePath(cables[0], s().project)!;
    expect(hdmiPath.fromPlug).toBeDefined();
    expect(hdmiPath.toPlug).toBeDefined();
    expect(hdmiPath.points.length).toBeGreaterThanOrEqual(6);

    const powerPath = computeCablePath(cables[1], s().project)!;
    const grommet = grommetPosition(s().project.desk)!;
    expect(
      powerPath.points.some(
        (pt) => Math.abs(pt.x - grommet.x) < 1e-5 && pt.y < s().project.desk.height,
      ),
    ).toBe(true);

    // 删除 Mac Studio 会联动清理 HDMI 线缆，撤销一步恢复
    s().select(studioId);
    s().remove();
    expect(s().project.cables).toHaveLength(1);
    s().undo();
    expect(s().project.cables).toHaveLength(2);

    // 删除显示器会联动清理挂灯/支架臂与所有关联线缆
    s().select(monitor.id);
    s().remove();
    expect(s().project.items.some((i) => i.kind === 'monitorArm')).toBe(false);
    expect(s().project.cables).toBeUndefined();
    s().undo();
    expect(s().project.items.some((i) => i.kind === 'monitorArm')).toBe(true);
    expect(s().project.cables).toHaveLength(2);
  });

  it('校验 HDMI / DP / USB-A / USB-C / TF / SD / MagSafe 3 官方机械标准插口尺寸', () => {
    expect(PORT_SOCKET_SPECS.hdmi.width).toBeCloseTo(0.014, 4);
    expect(PORT_SOCKET_SPECS.hdmi.height).toBeCloseTo(0.0045, 4);
    expect(PORT_SOCKET_SPECS.dp.width).toBeCloseTo(0.0161, 4);
    expect(PORT_SOCKET_SPECS.dp.height).toBeCloseTo(0.0074, 4);
    expect(PORT_SOCKET_SPECS.usba.width).toBeCloseTo(0.0131, 4);
    expect(PORT_SOCKET_SPECS.usba.height).toBeCloseTo(0.0057, 4);
    expect(PORT_SOCKET_SPECS.usbc.width).toBeCloseTo(0.0086, 4);
    expect(PORT_SOCKET_SPECS.usbc.height).toBeCloseTo(0.0028, 4);
    expect(PORT_SOCKET_SPECS.tf.width).toBeCloseTo(0.0115, 4);
    expect(PORT_SOCKET_SPECS.tf.height).toBeCloseTo(0.0014, 4);
    expect(PORT_SOCKET_SPECS.sd.width).toBeCloseTo(0.0246, 4);
    expect(PORT_SOCKET_SPECS.sd.height).toBeCloseTo(0.0023, 4);
    expect(PORT_SOCKET_SPECS.magsafe3.width).toBeCloseTo(0.0146, 4);
    expect(PORT_SOCKET_SPECS.magsafe3.height).toBeCloseTo(0.0038, 4);

    // Dell 显示器背面所有接口垂直向下 (-Y) 隐藏于方形凹槽上方内壁
    const dell = makeItem('monitor');
    const dellPorts = devicePorts(dell);
    expect(dellPorts.length).toBeGreaterThanOrEqual(4);
    for (const p of dellPorts) {
      expect(p.localDir).toEqual([0, -1, 0]);
    }
  });

  it('校验线缆真实线径比例、RJ45 网线、MagSafe 3 官方 2 m 及含端子/不含端子长度核算', () => {
    // 线径真实递进关系：MagSafe < USB-C < RJ45 < DP < HDMI < Power
    expect(cableMeta.magsafe.radius).toBeLessThan(cableMeta.usbc.radius);
    expect(cableMeta.usbc.radius).toBeLessThan(cableMeta.rj45.radius);
    expect(cableMeta.rj45.radius).toBeLessThan(cableMeta.dp.radius);
    expect(cableMeta.dp.radius).toBeLessThanOrEqual(cableMeta.hdmi.radius);
    expect(cableMeta.hdmi.radius).toBeLessThan(cableMeta.power.radius);

    // 苹果 MagSafe 3 官方 2 m 含端子
    expect(cableMeta.magsafe.defaultLengthM).toBe(2);
    expect(cableMeta.magsafe.presetLengthsM).toEqual([2]);
    const msLen = cableEffectiveLengths({
      kind: 'magsafe',
      lengthM: 2,
      lengthIncludesConnectors: true,
    });
    expect(msLen.totalM).toBe(2);
    expect(msLen.bodyM).toBeCloseTo(2 - cableMeta.magsafe.connectorLen * 2, 3);

    // 含端子 1 m 与不含端子 1 m 区分核算
    const rjWith = cableEffectiveLengths({
      kind: 'rj45',
      lengthM: 1,
      lengthIncludesConnectors: true,
    });
    const rjBody = cableEffectiveLengths({
      kind: 'rj45',
      lengthM: 1,
      lengthIncludesConnectors: false,
    });
    expect(rjWith.totalM).toBe(1);
    expect(rjBody.bodyM).toBe(1);
    expect(rjBody.totalM).toBeGreaterThan(rjWith.totalM);

    // RJ45 与 MagSafe 3 接入 MacBook / Mac Studio 路径与线短提示校验
    const s = () => useEditor.getState();
    s().add('macbook');
    const mbId = s().selected!;
    s().add('macStudio');
    const studioId = s().selected!;

    s().addCable({
      kind: 'magsafe',
      from: { type: 'device', itemId: mbId, portId: 'power' },
      to: { type: 'floor', drop: 'auto' },
      routeViaArm: true,
      color: cableMeta.magsafe.color,
      lengthM: 2,
      lengthIncludesConnectors: true,
    });
    // 太短的 0.5 m RJ45 固定线缆无法连接桌面到地面时应直接报错阻止拉伸
    const tooShortRj = {
      kind: 'rj45' as const,
      from: { type: 'device' as const, itemId: studioId, portId: 'rj45' },
      to: { type: 'floor' as const, drop: 'auto' as const },
      routeViaArm: true,
      color: cableMeta.rj45.color,
      lengthM: 0.5, // 短于桌面到地面距离，不可被拉伸
      lengthIncludesConnectors: true,
    };
    expect(() => s().addCable(tooShortRj)).toThrow(/线缆长度不足/);

    const msPath = computeCablePath(s().project.cables![0], s().project)!;
    const rjPath = computeCablePath({ ...tooShortRj, id: 'probe-short-rj' }, s().project)!;
    expect(msPath.shortfallM).toBe(0);
    expect(rjPath.shortfallM).toBeGreaterThan(0.2);
  });

  it('机械键盘多配列键位数量与尺寸、磁轴 GX16 航空线及 RGB 参数校验', () => {
    for (const id of keyboardLayouts) {
      const spec = KEYBOARD_LAYOUT_SPECS[id];
      const keys = buildKeyboardKeys(id);
      expect(keys).toHaveLength(spec.keysCount);
      expect(keys.every((k) => k.label.length > 0)).toBe(true);
    }

    // 60% 窄于 80% TKL 窄于 100% 全尺寸
    expect(KEYBOARD_LAYOUT_SPECS['60'].size.width).toBeLessThan(
      KEYBOARD_LAYOUT_SPECS['80'].size.width,
    );
    expect(KEYBOARD_LAYOUT_SPECS['80'].size.width).toBeLessThan(
      KEYBOARD_LAYOUT_SPECS['100'].size.width,
    );

    const s = () => useEditor.getState();
    s().add('keyboard');
    const kb = s().project.items.find((i) => i.kind === 'keyboard')!;
    expect(kb.color).toBe(KEYBOARD_THEME_SPECS.white.chassisHex);
    expect(resolveKeyboardTheme('#181a20')).toBe('black');
    expect(resolveKeyboardTheme('#f4f6f9')).toBe('white');

    s().updateItem(kb.id, {
      color: KEYBOARD_THEME_SPECS.black.chassisHex,
      size: { ...KEYBOARD_LAYOUT_SPECS['60'].size },
      keyboard: {
        ...defaultKeyboardSettings(),
        layout: '60',
        theme: 'black',
        switchType: 'magnetic',
        aviatorCable: true,
        rgb: true,
        rgbMode: 'aurora',
        rgbBrightness: 1.2,
      },
    });
    const updated = s().project.items.find((i) => i.id === kb.id)!;
    expect(updated.keyboard?.switchType).toBe('magnetic');
    expect(updated.keyboard?.aviatorCable).toBe(true);
    expect(updated.keyboard?.theme).toBe('black');
    expect(updated.keyboard?.rgbMode).toBe('aurora');
    expect(updated.keyboard?.rgbBrightness).toBe(1.2);

    // 仅机械键盘允许保存 keyboard 参数；键盘与游戏本不允许自定义非预设尺寸
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    expect(() => s().updateItem(monitor.id, { keyboard: defaultKeyboardSettings() })).toThrow();
    expect(() =>
      s().updateItem(kb.id, { size: { width: 0.41, height: 0.04, depth: 0.14 } }),
    ).toThrow();
    s().add('gamingLaptop');
    const glId = s().selected!;
    expect(() =>
      s().updateItem(glId, { size: { width: 0.42, height: 0.03, depth: 0.28 } }),
    ).toThrow();
  });

  it('鼠标系统（经典无线款 / 经典有线款）与鼠标垫系统（自定义尺寸、配色与 2–6 mm 厚度限制及垫面贴合）', () => {
    // 1. 经典无线款与经典有线款型号清单与 1:1 尺寸校核
    expect(MOUSE_PRESETS).toHaveLength(2);
    expect(mousePresetsBySeries('wireless')).toHaveLength(1);
    expect(mousePresetsBySeries('wired')).toHaveLength(1);
    const wireless = mousePresetById('classic-wireless');
    expect(wireless.size).toEqual({ width: 0.0635, height: 0.04, depth: 0.125 });
    expect(wireless.weightG).toBe(60);
    const wired = mousePresetById('classic-wired');
    expect(wired.size).toEqual({ width: 0.0635, height: 0.04, depth: 0.125 });
    expect(wired.weightG).toBe(65);
    expect(MOUSE_PRESETS.every((p) => p.colors.length >= 4)).toBe(true);

    const s = () => useEditor.getState();
    s().add('mousepad');
    const padId = s().selected!;
    const pad = s().project.items.find((i) => i.id === padId)!;
    expect(pad.size).toEqual(MOUSEPAD_DEFAULT_SIZE);
    expect(isValidMousepadSize(pad.size)).toBe(true);

    // 鼠标垫支持自定义宽高、颜色与 2–6 mm 合理厚度，超限应被拒绝
    s().updateItem(padId, {
      size: { width: 0.49, depth: 0.42, height: metersFromMm(5.5) },
      color: '#6f869d',
    });
    expect(mm(s().project.items.find((i) => i.id === padId)!.size.height)).toBe(5.5);

    expect(() =>
      s().updateItem(padId, {
        size: { width: 0.49, depth: 0.42, height: 0.001 }, // < 2 mm 拒绝
      }),
    ).toThrow();
    expect(() =>
      s().updateItem(padId, {
        size: { width: 0.49, depth: 0.42, height: 0.012 }, // > 6 mm 拒绝
      }),
    ).toThrow();
    expect(MOUSEPAD_MIN_THICKNESS).toBe(0.002);
    expect(MOUSEPAD_MAX_THICKNESS).toBe(0.006);

    // 2. 添加鼠标并放在鼠标垫上：Y 高度自动抬升鼠标垫厚度（5.5 mm）
    s().add('mouse');
    const mouseId = s().selected!;
    s().updateItem(mouseId, {
      x: 0.12,
      z: pad.z + 0.04,
      mouse: { series: 'wired', modelId: 'classic-wired' },
      size: { ...wired.size },
      color: wired.colors[1].hex,
    });
    const currentMouse = s().project.items.find((i) => i.id === mouseId)!;
    expect(itemWorldY(s().project.desk, currentMouse, s().project.items)).toBeCloseTo(
      s().project.desk.height + 0.0055,
      6,
    );

    // 鼠标移出鼠标垫范围后回到桌面高度
    s().updateItem(mouseId, { x: 0.55 });
    const movedMouse = s().project.items.find((i) => i.id === mouseId)!;
    expect(itemWorldY(s().project.desk, movedMouse, s().project.items)).toBeCloseTo(
      s().project.desk.height,
      6,
    );

    // 非鼠标物品禁止保存 mouse 字段
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    expect(() => s().updateItem(monitor.id, { mouse: defaultMouseSettings() })).toThrow();
  });

  it('显示器支架臂支持双臂挂载、倒挂模式、NB FP-2 笔记本托盘与联动删改', () => {
    const s = () => useEditor.getState();
    s().replace({ ...defaultProject(), cables: [] }, new Map());

    // 准备 2 台显示器 + 1 台 MacBook
    const m1 = s().project.items.find((i) => i.kind === 'monitor')!;
    s().updateItem(m1.id, { x: -0.32, z: -0.14 });
    s().add('monitor');
    const m2Id = s().selected!;
    s().updateItem(m2Id, { x: 0.3, z: -0.14 });
    const existingMb = s().project.items.find((i) => i.kind === 'macbook');
    const mbId = existingMb ? existingMb.id : (s().add('macbook'), s().selected!);
    s().updateItem(mbId, { x: 0.38, z: 0.04 });

    // 1. 先安装主支架臂在 m1，再升级为双臂 + 副臂挂载 m2（两台显示器都应算作臂挂且不越界）
    s().select(m1.id);
    s().add('monitorArm');
    const armId = s().selected!;
    s().updateItem(armId, {
      monitorArm: {
        monitorId: m1.id,
        clampSide: 'center',
        cableClip: true,
        armStyle: 'dual',
        secondaryKind: 'monitor',
        secondaryMonitorId: m2Id,
      },
    });
    expect(isMonitorMountedOnArm(m1.id, s().project.items)).toBe(true);
    expect(isMonitorMountedOnArm(m2Id, s().project.items)).toBe(true);

    // 校验双臂各自独立的运动学与长臂理线卡槽点
    const dualArm = s().project.items.find((i) => i.id === armId)!;
    const dualSys = computeMonitorArmSystem(dualArm, s().project.items, s().project.desk);
    expect(dualSys.isDual).toBe(true);
    expect(dualSys.branches).toHaveLength(2);
    expect(dualSys.branches[0].clipPoints).toHaveLength(5);
    expect(dualSys.branches[1].clipPoints).toHaveLength(5);
    expect(dualSys.branches[0].turretBase.x).not.toBeCloseTo(dualSys.branches[1].turretBase.x, 2);

    // 2. 切换为倒挂悬吊模式并校验基座上移、立柱向下延伸
    s().updateItem(armId, {
      monitorArm: {
        ...dualArm.monitorArm!,
        mountOrientation: 'inverted',
        invertedHeight: 0.68,
      },
    });
    const invArm = s().project.items.find((i) => i.id === armId)!;
    const invSys = computeMonitorArmSystem(invArm, s().project.items, s().project.desk);
    expect(invSys.isInverted).toBe(true);
    expect(invSys.basePos.y).toBeCloseTo(s().project.desk.height + 0.68, 5);
    expect(invSys.branches[0].columnTop.y).toBeLessThan(invSys.basePos.y);

    // 3. 通过 NB FP-2 托盘将 MacBook 挂载到单/双臂上（副臂改挂托盘，检查笔记本抬升悬停与俯仰姿态）
    s().updateItem(armId, {
      monitorArm: {
        ...invArm.monitorArm!,
        secondaryKind: 'laptopTray',
        secondaryMonitorId: undefined,
        secondaryLaptopId: mbId,
        trayElevation: 0.25,
        trayTiltDeg: 22,
      },
    });
    const trayArm = s().project.items.find((i) => i.id === armId)!;
    const traySys = computeMonitorArmSystem(trayArm, s().project.items, s().project.desk);
    expect(
      traySys.branches.some((b) => b.targetType === 'laptopTray' && b.target.id === mbId),
    ).toBe(true);
    const mb = s().project.items.find((i) => i.id === mbId)!;
    const mbTf = resolveItemTransform(mb, s().project.desk, s().project.items);
    expect(mbTf.position[1]).toBeGreaterThan(s().project.desk.height + 0.24);
    expect(isOutOfBounds({ ...mb, x: 0.9 }, s().project.desk, s().project.items)).toBe(false);

    // 同一台笔记本不可被双臂重复占用
    expect(() =>
      s().updateItem(armId, {
        monitorArm: {
          ...trayArm.monitorArm!,
          primaryKind: 'laptopTray',
          monitorId: undefined,
          primaryLaptopId: mbId,
        },
      }),
    ).toThrow();

    // 删除副臂笔记本后，双臂保留主臂显示器而副臂自动清零；撤销一步恢复
    s().select(mbId);
    s().remove();
    const afterRemove = s().project.items.find((i) => i.id === armId)!;
    expect(afterRemove).toBeDefined();
    expect(afterRemove.monitorArm?.secondaryKind).toBe('none');
    s().undo();
    expect(s().project.items.find((i) => i.id === armId)!.monitorArm?.secondaryLaptopId).toBe(mbId);
  });

  it('无线游戏手柄支持 1:1 PS5 DualSense 与 Xbox Series 规格与互斥校验', () => {
    expect(CONTROLLER_PRESETS).toHaveLength(2);
    const ps5 = controllerPresetById('ps5');
    const xbox = controllerPresetById('xbox');
    expect(ps5.size).toEqual({ width: 0.16, height: 0.066, depth: 0.106 });
    expect(xbox.size).toEqual({ width: 0.153, height: 0.061, depth: 0.102 });

    const s = () => useEditor.getState();
    s().add('controller');
    const ctrl = s().project.items.find((i) => i.kind === 'controller')!;
    expect(ctrl.controller?.model).toBe('ps5');

    s().updateItem(ctrl.id, {
      controller: { model: 'xbox' },
      size: { ...xbox.size },
      color: xbox.colors[2].hex,
    });
    const updated = s().project.items.find((i) => i.id === ctrl.id)!;
    expect(updated.controller?.model).toBe('xbox');
    expect(updated.size.width).toBe(0.153);

    // 仅游戏手柄允许保存 controller 字段
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;
    expect(() => s().updateItem(monitor.id, { controller: defaultControllerSettings() })).toThrow();
  });

  it('桌面音响支持标杆产品型号（Kanto YU4 / Edifier MR4 / A2+）、主副架构及完整音频/电源线缆体系', () => {
    expect(SPEAKER_PRESETS).toHaveLength(3);
    expect(PORT_SOCKET_SPECS.rca.width).toBeCloseTo(0.021, 4);
    expect(PORT_SOCKET_SPECS.trs635.width).toBeCloseTo(0.0115, 4);
    expect(PORT_SOCKET_SPECS.optical.width).toBeCloseTo(0.0085, 4);
    expect(PORT_SOCKET_SPECS.bindingPost.width).toBeCloseTo(0.028, 4);

    // 音频线径真实比例校验：3.5mm < 16AWG 主副线 < RCA <= 光纤 < 6.35mm TRS < 电源线
    expect(cableMeta.aux35.radius).toBeLessThan(cableMeta.speakerWire.radius);
    expect(cableMeta.speakerWire.radius).toBeLessThan(cableMeta.rca.radius);
    expect(cableMeta.rca.radius).toBeLessThan(cableMeta.optical.radius);
    expect(cableMeta.optical.radius).toBeLessThan(cableMeta.trs635.radius);
    expect(cableMeta.trs635.radius).toBeLessThan(cableMeta.power.radius);

    const s = () => useEditor.getState();
    s().replace({ ...defaultProject(), cables: [] }, new Map());
    s().add('speaker');
    const passiveId = s().selected!;
    s().updateItem(passiveId, { x: -0.56, z: -0.15, speaker: defaultSpeakerSettings('passive') });
    s().add('speaker');
    const activeId = s().selected!;
    s().updateItem(activeId, { x: 0.32, z: -0.14, speaker: defaultSpeakerSettings('active') });
    const speakers = s().project.items.filter((i) => i.kind === 'speaker');
    expect(speakers).toHaveLength(2);
    const passiveLeft = speakers.find((i) => i.speaker?.role === 'passive')!;
    const activeRight = speakers.find((i) => i.speaker?.role === 'active')!;
    expect(passiveLeft).toBeDefined();
    expect(activeRight).toBeDefined();

    expect(devicePorts(passiveLeft).map((p) => p.kind)).toEqual(['speakerWire']);
    expect(devicePorts(activeRight).map((p) => p.kind)).toEqual([
      'speakerWire',
      'usbc',
      'aux35',
      'rca',
      'optical',
      'power',
    ]);

    // 切换至漫步者 Edifier MR4：前置 3.5mm AUX (+Z) + 背面 6.35mm TRS 平衡 + RCA + 主副夹线 + 电源
    const mr4 = speakerPresetById('edifierMr4');
    s().updateItem(activeRight.id, {
      speaker: defaultSpeakerSettings('active'),
    });
    s().updateItem(activeRight.id, {
      speaker: { model: 'edifierMr4', role: 'active' },
      size: { ...mr4.size },
    });
    const mr4Ports = devicePorts(s().project.items.find((i) => i.id === activeRight.id)!);
    expect(mr4Ports.map((p) => p.kind)).toEqual(['speakerWire', 'aux35', 'rca', 'trs635', 'power']);
    expect(mr4Ports.find((p) => p.kind === 'aux35')!.localDir).toEqual([0, 0, 1]);

    // 切回 YU4 并连接主副箱音箱连接线、光纤、RCA 与 3.5mm AUX（接显示器音频输出）
    const yu4 = speakerPresetById('kantoYu4');
    s().updateItem(activeRight.id, {
      speaker: { model: 'kantoYu4', role: 'active' },
      size: { ...yu4.size },
    });
    const monitor = s().project.items.find((i) => i.kind === 'monitor')!;

    s().addCable({
      kind: 'speakerWire',
      from: { type: 'device', itemId: activeRight.id, portId: 'speakerOut' },
      to: { type: 'device', itemId: passiveLeft.id, portId: 'speakerIn' },
      routeViaArm: true,
      color: cableMeta.speakerWire.color,
      lengthM: cableMeta.speakerWire.defaultLengthM,
      lengthIncludesConnectors: true,
    });
    s().addCable({
      kind: 'aux35',
      from: { type: 'device', itemId: activeRight.id, portId: 'aux35' },
      to: { type: 'device', itemId: monitor.id, portId: 'audioOut' },
      routeViaArm: true,
      color: cableMeta.aux35.color,
      lengthM: cableMeta.aux35.defaultLengthM,
      lengthIncludesConnectors: true,
    });
    s().addCable({
      kind: 'optical',
      from: { type: 'device', itemId: activeRight.id, portId: 'optical' },
      to: { type: 'floor', drop: 'auto' },
      routeViaArm: true,
      color: cableMeta.optical.color,
      lengthM: cableMeta.optical.defaultLengthM,
      lengthIncludesConnectors: true,
    });

    expect(s().project.cables).toHaveLength(3);
    expect(computeCablePath(s().project.cables![0], s().project)!.points.length).toBeGreaterThan(2);
    expect(projectSchema.safeParse(s().project).success).toBe(true);
  });

  it('Mac mini (127.2 × 127.1 × 49.7 mm) 与 Mac Studio (197.2 × 197.2 × 94.9 mm) 精细尺寸与前后接口布局校验', () => {
    const mini = makeItem('macMini');
    expect(mini.size).toEqual({ width: 0.1272, height: 0.0497, depth: 0.1271 });
    expect(matchDevicePresetId(macMiniPresets, mini.size)).toBe('m4');
    const miniPorts = devicePorts(mini);
    expect(miniPorts.find((p) => p.id === 'audio')?.localDir).toEqual([0, 0, 1]);
    expect(miniPorts.find((p) => p.id === 'hdmi')?.localDir).toEqual([0, 0, -1]);

    const studio = makeItem('macStudio');
    expect(studio.size).toEqual({ width: 0.1972, height: 0.0949, depth: 0.1972 });
    const studioPorts = devicePorts(studio);
    expect(studioPorts.find((p) => p.id === 'audio')?.localDir).toEqual([0, 0, -1]);
    expect(studioPorts.find((p) => p.id === 'rj45')?.localDir).toEqual([0, 0, -1]);
    expect(studio.size.width / mini.size.width).toBeCloseTo(1.55, 2);
    expect(studio.size.height / mini.size.height).toBeCloseTo(1.91, 2);
  });

  it('Twelve South Curve Flex 与 Rain Design mStand 笔记本支架预设规格及极限行程校验', () => {
    expect(LAPTOP_STAND_PRESETS.curveFlex.size).toEqual({
      width: 0.264,
      height: 0.14,
      depth: 0.224,
    });
    expect(LAPTOP_STAND_PRESETS.mStand.size).toEqual({ width: 0.253, height: 0.15, depth: 0.19 });

    const s = () => useEditor.getState();
    s().add('macbook');
    const mbId = s().selected!;
    s().add('laptopStand');
    const standId = s().selected!;

    // Curve Flex 支持 30-274 mm 与 0-45° 极限范围
    s().updateItem(standId, {
      laptopStand: {
        model: 'curveFlex',
        laptopId: mbId,
        mode: 'tilted',
        elevation: 0.274,
        tiltDeg: 45,
      },
    });
    expect(projectSchema.safeParse(s().project).success).toBe(true);
    s().updateItem(standId, {
      laptopStand: {
        model: 'curveFlex',
        laptopId: mbId,
        mode: 'tilted',
        elevation: 0.03,
        tiltDeg: 0,
      },
    });
    expect(projectSchema.safeParse(s().project).success).toBe(true);
    expect(() =>
      s().updateItem(standId, {
        laptopStand: {
          model: 'curveFlex',
          laptopId: mbId,
          mode: 'tilted',
          elevation: 0.35,
          tiltDeg: 18,
        },
      }),
    ).toThrow();
  });

  it('充电线/电源线专区预设、端口兼容判别与反序点选插头自动匹配校验', () => {
    expect(POWER_CABLE_PRESETS.length).toBeGreaterThanOrEqual(7);
    expect(new Set(POWER_CABLE_PRESETS.map((p) => p.id)).size).toBe(POWER_CABLE_PRESETS.length);
    expect(arePortKindsCompatible('magsafe', 'power')).toBe(true);
    expect(arePortKindsCompatible('dp', 'hdmi')).toBe(false);
    expect(isPortCompatibleWithCable('power', 'usbc')).toBe(true);
    expect(isPortCompatibleWithCable('dp', 'power')).toBe(false);

    // 验证插座先点与设备先点两种顺序，均将插座端插头与设备端插头正确对应
    const s = () => useEditor.getState();
    s().add('powerStrip');
    const stripId = s().selected!;
    const monitorId = s().project.items.find((i) => i.kind === 'monitor')!.id;

    const rightAngle = POWER_CABLE_PRESETS.find((p) => p.id === 'iec-c13-right90')!;
    s().setWiringMode(true, {
      kind: rightAngle.kind,
      color: rightAngle.color,
      lengthM: rightAngle.lengthM,
      outletPlugType: rightAngle.outletPlugType,
      devicePlugType: rightAngle.devicePlugType,
      label: rightAngle.name,
    });
    // 反序：先点插排槽位，再点显示器电源口
    s().pickWiringPort(stripId, 'slot-1', 'power');
    s().pickWiringPort(monitorId, 'power', 'power');
    const created = (s().project.cables ?? []).at(-1)!;
    expect(created.kind).toBe('power');
    expect(created.lengthM).toBe(1.5);
    expect(created.fromPlugType).toBe('rightAngle');
    expect(created.toPlugType).toBe('iecC13');

    const directEnds = resolveCablePlugEnds({
      fromKind: 'macbook',
      fromPortId: 'usbc1',
      toKind: 'powerStrip',
      toPortId: 'slot-2',
      cableKind: 'usbc',
      outletPlugType: 'ganAdapter',
    });
    expect(directEnds).toEqual({ toPlugType: 'ganAdapter' });
  });

  it('Type-C 分为双头 Type-C 与 USB ↔ Type-C 且不自动附带充电插头配件', () => {
    expect(
      SIGNAL_CABLE_PRESETS.some((p) => p.id === 'usbc-usbc' && p.shortLabel === '双头 Type-C'),
    ).toBe(true);
    expect(
      SIGNAL_CABLE_PRESETS.some((p) => p.id === 'usba-usbc' && p.shortLabel === 'USB ↔ Type-C'),
    ).toBe(true);
    for (const preset of POWER_CABLE_PRESETS) {
      if (preset.kind === 'usbc' || preset.kind === 'magsafe') {
        expect(preset.outletPlugType).not.toBe('ganAdapter');
        expect(preset.outletPlugType).not.toBe('appleDuckhead');
      }
    }

    // 未指定额外插头配件时，Type-C 连接到插座也不自动附带氮化镓插头
    const bareTypeC = resolveCablePlugEnds({
      fromKind: 'macbook',
      fromPortId: 'usbc1',
      fromPortKind: 'usbc',
      toKind: 'powerStrip',
      toPortId: 'slot-2',
      toPortKind: 'power',
      cableKind: 'usbc',
    });
    expect(bareTypeC).toEqual({});

    // USB ↔ Type-C 正反两种连接顺序均精确识别 USB-A 端与 Type-C 端
    const aToC = resolveCablePlugEnds({
      fromKind: 'monitor',
      fromPortId: 'usba',
      fromPortKind: 'usba',
      toKind: 'macbook',
      toPortId: 'usbc1',
      toPortKind: 'usbc',
      cableKind: 'usbc',
    });
    expect(aToC).toEqual({ fromPlugType: 'usba', toPlugType: 'usbc' });

    const cToA = resolveCablePlugEnds({
      fromKind: 'macbook',
      fromPortId: 'usbc1',
      fromPortKind: 'usbc',
      toKind: 'powerStrip',
      toPortId: 'usba-1',
      toPortKind: 'usba',
      cableKind: 'usbc',
    });
    expect(cToA).toEqual({ fromPlugType: 'usbc', toPlugType: 'usba' });

    expect(
      formatCableDisplayName({
        kind: 'usbc',
        fromPlugType: 'usbc',
        toPlugType: 'usbc',
      }),
    ).toBe('双头 Type-C');

    expect(
      formatCableDisplayName({
        kind: 'usbc',
        fromPlugType: 'usba',
        toPlugType: 'usbc',
      }),
    ).toBe('USB ↔ Type-C');
  });
});

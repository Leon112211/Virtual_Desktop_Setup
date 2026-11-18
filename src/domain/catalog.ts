import { cableMeta } from './cable';
import { defaultControllerSettings, controllerPresetById } from './controller';
import { DESK_WOOD_BASE_COLOR } from './desk';
import { DELL_PLATINUM_SILVER } from './monitor';
import { DEFAULT_LID_ANGLE, defaultLaptopStandSettings, defaultMonitorArmSettings } from './laptop';
import { defaultMouseSettings, mousePresetById } from './mouse';
import { MOUSEPAD_DEFAULT_SIZE } from './mousepad';
import {
  computePowerStripSize,
  computeWallOutletSize,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  WALL_OUTLET_DEFAULT_Y,
} from './power';
import { uid, type BuiltinKind, type Project, type SceneItem, type Size } from './project';
import { defaultLampSettings, EditorError, SCREEN_LAMP_SIZE } from './screenLamp';
import { defaultSpeakerSettings, speakerPresetById } from './speaker';

export const catalog: {
  kind: BuiltinKind;
  name: string;
  subtitle: string;
  size: Size;
  color: string;
  category: string;
}[] = [
  {
    kind: 'monitor',
    name: '27 寸显示器',
    subtitle: '1:1 Dell U2725QE 与 Apple Studio Display',
    size: { width: 0.6124, height: 0.4857, depth: 0.189 },
    color: DELL_PLATINUM_SILVER,
    category: '数码设备',
  },
  {
    kind: 'speaker',
    name: '桌面音响',
    subtitle: '1:1 标杆桌面有源对箱 (YU4 / MR4 / A2+) · 含音箱线/RCA/TRS/光纤/电源',
    size: { ...speakerPresetById('kantoYu4').size },
    color: '#e3d5bf',
    category: '数码设备',
  },
  {
    kind: 'controller',
    name: '无线游戏手柄',
    subtitle: '1:1 还原 PS5 DualSense 与 Xbox Series 手柄',
    size: { ...controllerPresetById(defaultControllerSettings().model).size },
    color: controllerPresetById(defaultControllerSettings().model).colors[0].hex,
    category: '数码设备',
  },
  {
    kind: 'pegboard',
    name: '桌面洞洞板',
    subtitle: '把灵感整理到眼前',
    size: { width: 0.48, height: 0.42, depth: 0.13 },
    color: '#e7e3da',
    category: '收纳配件',
  },
  {
    kind: 'keyboard',
    name: '机械键盘',
    subtitle: '每一次敲击，都刚刚好',
    size: { width: 0.36, height: 0.035, depth: 0.13 },
    color: '#f4f6f9',
    category: '数码设备',
  },
  {
    kind: 'mouse',
    name: '电竞鼠标',
    subtitle: '经典对称流线人体工学鼠标（经典无线款 / 经典有线款）',
    size: { ...mousePresetById(defaultMouseSettings().modelId).size },
    color: mousePresetById(defaultMouseSettings().modelId).colors[0].hex,
    category: '数码设备',
  },
  {
    kind: 'mousepad',
    name: '鼠标垫',
    subtitle: '自定义尺寸、配色与 2–6 mm 厚度',
    size: { ...MOUSEPAD_DEFAULT_SIZE },
    color: '#1f2228',
    category: '收纳配件',
  },
  {
    kind: 'screenLamp',
    name: '屏幕挂灯',
    subtitle: '安装到显示器，定向照亮桌面',
    size: { ...SCREEN_LAMP_SIZE },
    color: '#343c49',
    category: '数码设备',
  },
  {
    kind: 'gamingLaptop',
    name: '游戏本',
    subtitle: '高性能笔记本，支持调节开合角',
    size: { width: 0.359, height: 0.024, depth: 0.258 },
    color: '#2d3542',
    category: '数码设备',
  },
  {
    kind: 'macbook',
    name: 'MacBook',
    subtitle: '1:1 苹果官方尺寸与配色（Air / Pro）',
    size: { width: 0.3126, height: 0.0155, depth: 0.2212 },
    color: '#e3e4e6',
    category: '数码设备',
  },
  {
    kind: 'macMini',
    name: 'Mac mini',
    subtitle: '127.2 × 127.1 × 49.7 mm（M6 / M5 Pro / 经典）',
    size: { width: 0.1272, height: 0.0497, depth: 0.1271 },
    color: '#d8dde3',
    category: '数码设备',
  },
  {
    kind: 'macStudio',
    name: 'Mac Studio',
    subtitle: '197.2 × 197.2 × 94.9 mm（M5 Max / M5 Ultra）',
    size: { width: 0.1972, height: 0.0949, depth: 0.1972 },
    color: '#d8dde3',
    category: '数码设备',
  },
  {
    kind: 'laptopStand',
    name: '笔记本支架',
    subtitle: 'Curve Flex 双铰链 (30–274 mm) / mStand (Ø50.8 mm 孔) / 立式收纳',
    size: { width: 0.264, height: 0.14, depth: 0.224 },
    color: '#98a3b3',
    category: '收纳配件',
  },
  {
    kind: 'monitorArm',
    name: '显示器支架臂',
    subtitle: 'NB F80 单头气压臂 · 夹持/倒挂与理线',
    size: { width: 0.12, height: 0.35, depth: 0.35 },
    color: '#3a414c',
    category: '收纳配件',
  },
  {
    kind: 'powerStrip',
    name: '智能桌面插排',
    subtitle: '1×3 至 2×4 多孔位配列，可选两孔/三孔/五孔与 USB-C 快充',
    size: computePowerStripSize(defaultPowerStripSettings()),
    color: '#f2f4f7',
    category: '收纳配件',
  },
  {
    kind: 'wallOutlet',
    name: '墙面 / 地面插座',
    subtitle: '单个 86 型墙插 / 地插 · 支持自动吸附对齐（不含 Type-C）',
    size: computeWallOutletSize(defaultWallOutletSettings()),
    color: '#f4f6f8',
    category: '收纳配件',
  },
];

export function makeItem(kind: BuiltinKind, hostId?: string): SceneItem {
  if (kind === 'screenLamp' && !hostId)
    throw new EditorError('请先添加一台内置显示器，再安装挂灯。');
  if (kind === 'monitorArm' && !hostId)
    throw new EditorError('请先添加一台内置显示器或笔记本，再安装支架臂。');
  const entry = catalog.find((e) => e.kind === kind)!;
  const powerStripCfg = kind === 'powerStrip' ? defaultPowerStripSettings() : undefined;
  const wallOutletCfg = kind === 'wallOutlet' ? defaultWallOutletSettings() : undefined;
  return {
    id: uid(),
    name: entry.name,
    kind,
    x: 0,
    z: kind === 'screenLamp' || kind === 'monitorArm' ? 0 : kind === 'wallOutlet' ? 0 : 0.12,
    rotation: 0,
    size: { ...entry.size },
    color: entry.color,
    ...(kind === 'wallOutlet' ? { surface: 'wall' as const, wallY: WALL_OUTLET_DEFAULT_Y } : {}),
    ...(kind === 'gamingLaptop' || kind === 'macbook' ? { lidAngle: DEFAULT_LID_ANGLE } : {}),
    ...(kind === 'screenLamp' ? { lamp: defaultLampSettings(hostId!) } : {}),
    ...(kind === 'laptopStand' ? { laptopStand: defaultLaptopStandSettings(hostId) } : {}),
    ...(kind === 'monitorArm' ? { monitorArm: defaultMonitorArmSettings(hostId) } : {}),
    ...(kind === 'controller' ? { controller: defaultControllerSettings() } : {}),
    ...(kind === 'mouse' ? { mouse: defaultMouseSettings() } : {}),
    ...(kind === 'speaker' ? { speaker: defaultSpeakerSettings('active') } : {}),
    ...(powerStripCfg ? { powerStrip: powerStripCfg } : {}),
    ...(wallOutletCfg ? { wallOutlet: wallOutletCfg } : {}),
  };
}

export function defaultProject(): Project {
  const monitor = makeItem('monitor');
  const macbook = makeItem('macbook');
  Object.assign(monitor, { x: -0.16, z: -0.14 });
  Object.assign(macbook, { x: 0.34, z: 0.06, rotation: -12 });
  return {
    schemaVersion: 1,
    id: uid(),
    name: '我的理想桌搭',
    environment: 'bright',
    desk: {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      color: DESK_WOOD_BASE_COLOR,
      finish: 'wood',
    },
    items: [monitor, macbook],
    cables: [
      {
        id: uid(),
        kind: 'usbc',
        from: { type: 'device', itemId: monitor.id, portId: 'usbc' },
        to: { type: 'device', itemId: macbook.id, portId: 'usbc1' },
        fromPlugType: 'usbc',
        toPlugType: 'usbc',
        routeViaArm: true,
        viaStandSlot: true,
        color: cableMeta.usbc.color,
        lengthM: 1,
        lengthIncludesConnectors: true,
      },
    ],
    assets: [],
  };
}

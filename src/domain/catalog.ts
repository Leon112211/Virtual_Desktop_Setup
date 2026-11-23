// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
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
import { BUILTIN_ITEM_NAMES, DEFAULT_PROJECT_NAMES, getLang, tr } from '../i18n';

export const catalog: {
  kind: BuiltinKind;
  readonly name: string;
  readonly subtitle: string;
  size: Size;
  color: string;
  readonly category: string;
}[] = [
  {
    kind: 'monitor',
    get name() {
      return BUILTIN_ITEM_NAMES.monitor[getLang()];
    },
    get subtitle() {
      return tr('1:1 商务曲背款与一体平背款双模具', '1:1 Curved-Back & Unibody Flat-Back Molds');
    },
    size: { width: 0.6124, height: 0.4857, depth: 0.189 },
    color: DELL_PLATINUM_SILVER,
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'speaker',
    get name() {
      return BUILTIN_ITEM_NAMES.speaker[getLang()];
    },
    get subtitle() {
      return tr(
        '桌面有源书架箱 / 监听箱 · 含主副线/RCA/TRS/光纤/电源',
        'Active Bookshelf & Studio Monitors · Full Audio/Power I/O',
      );
    },
    size: { ...speakerPresetById('kantoYu4').size },
    color: '#e3d5bf',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'controller',
    get name() {
      return BUILTIN_ITEM_NAMES.controller[getLang()];
    },
    get subtitle() {
      return tr(
        '对称双摇杆与非对称摇杆双人体工学布局',
        'Symmetrical & Asymmetric Ergonomic Layouts',
      );
    },
    size: { ...controllerPresetById(defaultControllerSettings().model).size },
    color: controllerPresetById(defaultControllerSettings().model).colors[0].hex,
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'pegboard',
    get name() {
      return BUILTIN_ITEM_NAMES.pegboard[getLang()];
    },
    get subtitle() {
      return tr('把灵感整理到眼前', 'Keep everyday essentials within reach');
    },
    size: { width: 0.48, height: 0.42, depth: 0.13 },
    color: '#e7e3da',
    get category() {
      return tr('收纳配件', 'Accessories');
    },
  },
  {
    kind: 'keyboard',
    get name() {
      return BUILTIN_ITEM_NAMES.keyboard[getLang()];
    },
    get subtitle() {
      return tr('60%–100% 全配列机械轴与磁轴方案', '60%–100% Mechanical & Magnetic Switch Layouts');
    },
    size: { width: 0.36, height: 0.035, depth: 0.13 },
    color: '#f4f6f9',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'mouse',
    get name() {
      return BUILTIN_ITEM_NAMES.mouse[getLang()];
    },
    get subtitle() {
      return tr(
        '对称收腰分体按键模具（无线款 / 有线款）',
        'Symmetrical Split-Trigger Shell (Wireless / Wired)',
      );
    },
    size: { ...mousePresetById(defaultMouseSettings().modelId).size },
    color: mousePresetById(defaultMouseSettings().modelId).colors[0].hex,
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'mousepad',
    get name() {
      return BUILTIN_ITEM_NAMES.mousepad[getLang()];
    },
    get subtitle() {
      return tr('自定义尺寸、配色与 2–6 mm 厚度', 'Custom dimensions, colors & 2–6 mm thickness');
    },
    size: { ...MOUSEPAD_DEFAULT_SIZE },
    color: '#1f2228',
    get category() {
      return tr('收纳配件', 'Accessories');
    },
  },
  {
    kind: 'screenLamp',
    get name() {
      return BUILTIN_ITEM_NAMES.screenLamp[getLang()];
    },
    get subtitle() {
      return tr('安装到显示器，定向照亮桌面', 'Mounts on monitor top for asymmetric desk lighting');
    },
    size: { ...SCREEN_LAMP_SIZE },
    color: '#343c49',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'gamingLaptop',
    get name() {
      return BUILTIN_ITEM_NAMES.gamingLaptop[getLang()];
    },
    get subtitle() {
      return tr(
        '高性能独显笔记本，支持调节开合角',
        'High-performance laptop with adjustable lid angle',
      );
    },
    size: { width: 0.359, height: 0.024, depth: 0.258 },
    color: '#2d3542',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'macbook',
    get name() {
      return BUILTIN_ITEM_NAMES.macbook[getLang()];
    },
    get subtitle() {
      return tr('1:1 纤薄一体铝合金机身（13"–16"）', '1:1 Slim Unibody Aluminum Chassis (13"–16")');
    },
    size: { width: 0.3126, height: 0.0155, depth: 0.2212 },
    color: '#e3e4e6',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'macMini',
    get name() {
      return BUILTIN_ITEM_NAMES.macMini[getLang()];
    },
    get subtitle() {
      return tr(
        '127.2 × 127.1 × 49.7 mm（紧凑方盒 / 扁平经典）',
        '127.2 × 127.1 × 49.7 mm (Compact / Classic)',
      );
    },
    size: { width: 0.1272, height: 0.0497, depth: 0.1271 },
    color: '#d8dde3',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'macStudio',
    get name() {
      return BUILTIN_ITEM_NAMES.macStudio[getLang()];
    },
    get subtitle() {
      return tr(
        '197.2 × 197.2 × 94.9 mm 高性能金属方盒工作站',
        '197.2 × 197.2 × 94.9 mm Anodized Aluminum Cube',
      );
    },
    size: { width: 0.1972, height: 0.0949, depth: 0.1972 },
    color: '#d8dde3',
    get category() {
      return tr('数码设备', 'Devices');
    },
  },
  {
    kind: 'laptopStand',
    get name() {
      return BUILTIN_ITEM_NAMES.laptopStand[getLang()];
    },
    get subtitle() {
      return tr(
        '双铰链可调 (30–274 mm) / 一体固定款 / 立式收纳',
        'Dual-Hinge Adjustable / Fixed Unibody / Vertical Dock',
      );
    },
    size: { width: 0.264, height: 0.14, depth: 0.224 },
    color: '#98a3b3',
    get category() {
      return tr('收纳配件', 'Accessories');
    },
  },
  {
    kind: 'monitorArm',
    get name() {
      return BUILTIN_ITEM_NAMES.monitorArm[getLang()];
    },
    get subtitle() {
      return tr(
        '单头气压机械臂 · 夹持/倒挂与暗槽理线',
        'Single Gas-Spring Arm · Clamp/Inverted & Cable Routing',
      );
    },
    size: { width: 0.12, height: 0.35, depth: 0.35 },
    color: '#3a414c',
    get category() {
      return tr('收纳配件', 'Accessories');
    },
  },
  {
    kind: 'powerStrip',
    get name() {
      return BUILTIN_ITEM_NAMES.powerStrip[getLang()];
    },
    get subtitle() {
      return tr(
        '1×3 至 2×4 多孔位配列，可选两孔/三孔/五孔与 USB-C 快充',
        '1×3 to 2×4 AC Outlets with Optional USB-A / Type-C PD',
      );
    },
    size: computePowerStripSize(defaultPowerStripSettings()),
    color: '#f2f4f7',
    get category() {
      return tr('收纳配件', 'Accessories');
    },
  },
  {
    kind: 'wallOutlet',
    get name() {
      return BUILTIN_ITEM_NAMES.wallOutlet[getLang()];
    },
    get subtitle() {
      return tr(
        '单个 86 型墙插 / 地插 · 支持自动吸附对齐（不含 Type-C）',
        '86-Type Wall / Floor Socket · Magnetic Edge Alignment',
      );
    },
    size: computeWallOutletSize(defaultWallOutletSettings()),
    color: '#f4f6f8',
    get category() {
      return tr('收纳配件', 'Accessories');
    },
  },
];

export function makeItem(kind: BuiltinKind, hostId?: string): SceneItem {
  if (kind === 'screenLamp' && !hostId)
    throw new EditorError(
      tr(
        '请先添加一台内置显示器，再安装挂灯。',
        'Add a built-in monitor first before mounting a light bar.',
      ),
    );
  if (kind === 'monitorArm' && !hostId)
    throw new EditorError(
      tr(
        '请先添加一台内置显示器或笔记本，再安装支架臂。',
        'Add a built-in monitor or laptop first before mounting an arm.',
      ),
    );
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
  const laptop = makeItem('macbook');
  Object.assign(monitor, { x: -0.16, z: -0.14 });
  Object.assign(laptop, { x: 0.34, z: 0.06, rotation: -12 });
  return {
    schemaVersion: 1,
    id: uid(),
    name: DEFAULT_PROJECT_NAMES[getLang()],
    environment: 'bright',
    desk: {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      color: DESK_WOOD_BASE_COLOR,
      finish: 'wood',
    },
    items: [monitor, laptop],
    cables: [
      {
        id: uid(),
        kind: 'usbc',
        from: { type: 'device', itemId: monitor.id, portId: 'usbc' },
        to: { type: 'device', itemId: laptop.id, portId: 'usbc1' },
        fromPlugType: 'usbc',
        toPlugType: 'usbc',
        routeViaArm: true,
        viaStandSlot: true,
        color: cableMeta.usbc.color,
        lengthM: 1.5,
        lengthIncludesConnectors: true,
      },
    ],
    assets: [],
  };
}

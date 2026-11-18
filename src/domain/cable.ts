import { z } from 'zod';
import type { CableKind } from './ports';
import { plugSpecSchema, type PlugSpecKind } from './power';

export const MAX_CABLES = 32;

export const cableKindValues = [
  'dp',
  'hdmi',
  'usbc',
  'magsafe',
  'rj45',
  'power',
  'speakerWire',
  'aux35',
  'rca',
  'optical',
  'trs635',
] as const;

export type CableSpec = {
  label: string;
  shortLabel: string;
  color: string;
  /** Physical outer radius of the cable jacket (metres). */
  radius: number;
  /** Approximate length of one connector housing + strain-relief boot (metres). */
  connectorLen: number;
  /** Default total cable length in metres (with connectors). */
  defaultLengthM: number;
  /** Mainstream market or Apple official length presets in metres (with connectors). */
  presetLengthsM: readonly number[];
  /** Whether length presets follow Apple's official fixed specification. */
  officialLengthNote?: string;
};

export const cableMeta: Record<CableKind, CableSpec> = {
  dp: {
    label: 'DisplayPort (DP)',
    shortLabel: 'DP',
    color: '#232832',
    radius: 0.0035, // 7.0 mm OD
    connectorLen: 0.042,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
  },
  hdmi: {
    label: 'HDMI',
    shortLabel: 'HDMI',
    color: '#1e2633',
    radius: 0.0036, // 7.2 mm OD
    connectorLen: 0.038,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
  },
  usbc: {
    label: 'USB-C / 雷雳',
    shortLabel: 'Type-C',
    color: '#3f4754',
    radius: 0.0024, // 4.8 mm OD
    connectorLen: 0.028,
    defaultLengthM: 1,
    presetLengthsM: [0.8, 1, 1.5, 2],
  },
  magsafe: {
    label: 'MagSafe 3 充电线',
    shortLabel: 'MagSafe 3',
    color: '#d4d8de',
    radius: 0.0019, // 3.8 mm Apple woven braided OD
    connectorLen: 0.025,
    defaultLengthM: 2,
    presetLengthsM: [2],
    officialLengthNote: '苹果官方 USB-C 转 MagSafe 3 连接线标准长度（含端子 2 m）',
  },
  rj45: {
    label: 'RJ45 网线 (Cat6)',
    shortLabel: 'RJ45 网线',
    color: '#254a84',
    radius: 0.0031, // 6.2 mm Cat6 OD
    connectorLen: 0.036,
    defaultLengthM: 1.5,
    presetLengthsM: [0.5, 1, 1.5, 2, 3, 5],
  },
  power: {
    label: '电源线 (IEC C13)',
    shortLabel: '电源',
    color: '#18181b',
    radius: 0.0041, // 8.2 mm 3-core AC OD
    connectorLen: 0.046,
    defaultLengthM: 1.8,
    presetLengthsM: [1.2, 1.5, 1.8, 3],
  },
  speakerWire: {
    label: '主副箱音箱连接线 (16AWG)',
    shortLabel: '主副箱线',
    color: '#8c6239',
    radius: 0.0022, // 4.4 mm 16AWG twin-lead jacket
    connectorLen: 0.03,
    defaultLengthM: 2,
    presetLengthsM: [1.5, 2, 2.5, 3, 4.9],
  },
  aux35: {
    label: '3.5mm 音频线 (AUX)',
    shortLabel: '3.5mm AUX',
    color: '#2b313c',
    radius: 0.00195, // 3.9 mm braided stereo AUX jacket
    connectorLen: 0.028,
    defaultLengthM: 1.5,
    presetLengthsM: [0.8, 1.2, 1.5, 2, 3],
  },
  rca: {
    label: 'RCA 双莲花音频线',
    shortLabel: 'RCA 莲花',
    color: '#202631',
    radius: 0.0024, // 4.8 mm coaxial RCA jacket
    connectorLen: 0.036,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
  },
  optical: {
    label: '光纤数字音频线 (TOSLINK)',
    shortLabel: '光纤音频',
    color: '#312e47',
    radius: 0.0025, // 5.0 mm optical OD
    connectorLen: 0.032,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
  },
  trs635: {
    label: '6.35mm TRS 平衡音频线',
    shortLabel: '6.35mm TRS',
    color: '#1b2029',
    radius: 0.0029, // 5.8 mm studio TRS balanced OD
    connectorLen: 0.044,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
  },
};

export const cableWaypointSchema = z.object({
  x: z.number().finite().min(-5).max(5),
  y: z.number().finite().min(0).max(3),
  z: z.number().finite().min(-5).max(5),
});
export type CableWaypoint = z.infer<typeof cableWaypointSchema>;

export const cableEndpointSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('device'),
    itemId: z.string().min(1).max(100),
    portId: z.string().min(1).max(40),
  }),
  z.object({
    type: z.literal('floor'),
    drop: z.enum(['grommet', 'backEdge', 'auto']),
  }),
]);

export const cableSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(cableKindValues),
  from: cableEndpointSchema,
  to: cableEndpointSchema,
  routeViaArm: z.boolean(),
  viaStandSlot: z.boolean().optional(),
  drop: z.enum(['grommet', 'backEdge', 'auto']).optional(),
  waypoints: z.array(cableWaypointSchema).max(24).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  lengthM: z.number().finite().min(0.3).max(10).optional(),
  lengthIncludesConnectors: z.boolean().optional(),
  fromPlugType: plugSpecSchema.optional(),
  toPlugType: plugSpecSchema.optional(),
});

export type CableEndpoint = z.infer<typeof cableEndpointSchema>;
export type Cable = z.infer<typeof cableSchema>;

export function cableEffectiveLengths(
  cable: Pick<Cable, 'kind' | 'lengthM' | 'lengthIncludesConnectors'>,
) {
  const spec = cableMeta[cable.kind];
  const nominalM = cable.lengthM ?? spec.defaultLengthM;
  const includesConnectors = cable.lengthIncludesConnectors ?? true;
  const bothConnectorsM = spec.connectorLen * 2;
  const totalM = includesConnectors ? nominalM : nominalM + bothConnectorsM;
  const bodyM = Math.max(0.1, includesConnectors ? nominalM - bothConnectorsM : nominalM);
  return {
    nominalM,
    includesConnectors,
    totalM: Math.round(totalM * 1000) / 1000,
    bodyM: Math.round(bodyM * 1000) / 1000,
    bothConnectorsM,
  };
}

export type PowerCablePreset = {
  id: string;
  name: string;
  badge: string;
  specText: string;
  kind: Extract<CableKind, 'power' | 'magsafe' | 'usbc'>;
  /** Connector plug mounted at outlet / power-supply end. */
  outletPlugType?: PlugSpecKind;
  /** Connector plug mounted at device AC inlet (when applicable). */
  devicePlugType?: PlugSpecKind;
  color: string;
  lengthM: number;
};

/** Curated showcase catalog of power cords & fast-charging cables displayed in the left Cable Zone. */
export const POWER_CABLE_PRESETS: readonly PowerCablePreset[] = [
  {
    id: 'iec-c13-cn3',
    name: '国标三插品字电源线',
    badge: '10A · C13',
    specText: '国标三脚插头 ↔ IEC C13 · Ø8.2mm · 1.8m',
    kind: 'power',
    outletPlugType: 'cn3Pin',
    devicePlugType: 'iecC13',
    color: '#18181b',
    lengthM: 1.8,
  },
  {
    id: 'iec-c13-right90',
    name: '90° 超薄直角电源线',
    badge: '11mm 贴墙',
    specText: '90°弯头 ↔ IEC C13 · 靠墙/低矮插座防顶',
    kind: 'power',
    outletPlugType: 'rightAngle',
    devicePlugType: 'iecC13',
    color: '#20242c',
    lengthM: 1.5,
  },
  {
    id: 'iec-c7-cn2',
    name: '纯白两脚 8 字尾电源线',
    badge: '两插 · 纯白',
    specText: '国标两脚扁插 · Mac mini / 音箱轻便供电',
    kind: 'power',
    outletPlugType: 'cn2Pin',
    devicePlugType: 'cn2Pin',
    color: '#e2e8f0',
    lengthM: 1.5,
  },
  {
    id: 'magsafe3-official',
    name: 'MagSafe 3 磁吸编织线',
    badge: '官方 2m · 140W',
    specText: '苹果银白编织磁吸线 + 苹果方形快充头',
    kind: 'magsafe',
    outletPlugType: 'appleDuckhead',
    color: '#d4d8de',
    lengthM: 2,
  },
  {
    id: 'apple-duckhead-usbc',
    name: '苹果方头 Type-C 充电线',
    badge: '96W 苹果方头',
    specText: '苹果方形快充适配器 + 纯白 USB-C 编织线',
    kind: 'usbc',
    outletPlugType: 'appleDuckhead',
    color: '#eef1f5',
    lengthM: 2,
  },
  {
    id: 'gan-140w-usbc',
    name: '氮化镓 GaN 快充套装线',
    badge: '140W GaN',
    specText: '氮化镓快充头 + 高密度编织 Type-C 快充线',
    kind: 'usbc',
    outletPlugType: 'ganAdapter',
    color: '#2d333f',
    lengthM: 1.5,
  },
  {
    id: 'usbc-pd-100w',
    name: 'USB-C PD 100W 双头直连线',
    badge: 'C-to-C · 4.8mm',
    specText: '双头 Type-C · 直连插排快充口或显示器反充',
    kind: 'usbc',
    color: '#3f4754',
    lengthM: 1,
  },
];

export const SIGNAL_CABLE_KINDS: readonly Exclude<CableKind, 'power' | 'magsafe'>[] = [
  'dp',
  'hdmi',
  'usbc',
  'rj45',
  'speakerWire',
  'aux35',
  'rca',
  'optical',
  'trs635',
];

/** Checks whether two physical port kinds can be joined by a single cable. */
export function arePortKindsCompatible(a: CableKind, b: CableKind): boolean {
  if (a === b) return true;
  if ((a === 'rca' && b === 'aux35') || (a === 'aux35' && b === 'rca')) return true;
  if (a === 'magsafe' || b === 'magsafe') {
    const other = a === 'magsafe' ? b : a;
    return other === 'power' || other === 'usbc';
  }
  if (a === 'usbc' || b === 'usbc') {
    const other = a === 'usbc' ? b : a;
    return other === 'dp' || other === 'hdmi' || other === 'power';
  }
  return false;
}

/** Checks whether a port can initiate or receive a cable of `selectedKind`. */
export function isPortCompatibleWithCable(portKind: CableKind, selectedKind: CableKind): boolean {
  if (portKind === selectedKind) return true;
  if (selectedKind === 'usbc') {
    return portKind === 'dp' || portKind === 'hdmi' || portKind === 'power';
  }
  if (selectedKind === 'magsafe') {
    return portKind === 'power' || portKind === 'usbc';
  }
  if (selectedKind === 'rca') return portKind === 'aux35';
  if (selectedKind === 'aux35') return portKind === 'rca';
  return false;
}

/** Assigns outlet-side vs device-side plug housings accurately regardless of wiring click order. */
export function resolveCablePlugEnds(options: {
  fromKind?: string;
  fromPortId: string;
  toKind?: string;
  toPortId?: string;
  cableKind: CableKind;
  outletPlugType?: PlugSpecKind;
  devicePlugType?: PlugSpecKind;
}): { fromPlugType?: PlugSpecKind; toPlugType?: PlugSpecKind } {
  const { fromKind, fromPortId, toKind, toPortId, cableKind, outletPlugType, devicePlugType } =
    options;
  const fromIsOutlet =
    (fromKind === 'powerStrip' || fromKind === 'wallOutlet') && fromPortId !== 'ac-in';
  const toIsOutlet =
    (toKind === 'powerStrip' || toKind === 'wallOutlet') &&
    Boolean(toPortId && toPortId !== 'ac-in');

  const resolvedOutletPlug =
    outletPlugType ??
    (cableKind === 'power' ? 'cn3Pin' : cableKind === 'usbc' ? 'ganAdapter' : undefined);
  const resolvedDevicePlug = devicePlugType;

  if (fromIsOutlet && !toIsOutlet) {
    return {
      ...(resolvedOutletPlug ? { fromPlugType: resolvedOutletPlug } : {}),
      ...(resolvedDevicePlug ? { toPlugType: resolvedDevicePlug } : {}),
    };
  }
  if (toIsOutlet && !fromIsOutlet) {
    return {
      ...(resolvedDevicePlug ? { fromPlugType: resolvedDevicePlug } : {}),
      ...(resolvedOutletPlug ? { toPlugType: resolvedOutletPlug } : {}),
    };
  }
  return {
    ...(resolvedDevicePlug ? { fromPlugType: resolvedDevicePlug } : {}),
    ...(resolvedOutletPlug ? { toPlugType: resolvedOutletPlug } : {}),
  };
}

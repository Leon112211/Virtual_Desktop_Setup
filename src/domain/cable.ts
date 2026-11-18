import { z } from 'zod';
import type { CableKind } from './ports';
import { plugSpecSchema, type PlugSpecKind } from './power';

export const MAX_CABLES = 32;

export const cableKindValues = [
  'dp',
  'hdmi',
  'usbc',
  'usba',
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
  /** Bending resilience stiffness in [0, 1] governing curve resistance and sag smoothness. */
  bendingStiffness: number;
  /** Minimum allowed interior angle (degrees, >= 95° so cables never fold at acute bends). */
  minInteriorAngleDeg: number;
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
    bendingStiffness: 0.78,
    minInteriorAngleDeg: 116,
  },
  hdmi: {
    label: 'HDMI',
    shortLabel: 'HDMI',
    color: '#1e2633',
    radius: 0.0036, // 7.2 mm OD
    connectorLen: 0.038,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.8,
    minInteriorAngleDeg: 118,
  },
  usbc: {
    label: 'USB-C / 雷雳',
    shortLabel: '双头 Type-C',
    color: '#3f4754',
    radius: 0.0024, // 4.8 mm OD
    connectorLen: 0.028,
    defaultLengthM: 1,
    presetLengthsM: [0.8, 1, 1.5, 2],
    bendingStiffness: 0.56,
    minInteriorAngleDeg: 108,
  },
  usba: {
    label: 'USB-A 数据/供电线',
    shortLabel: 'USB-A',
    color: '#374151',
    radius: 0.0023, // 4.6 mm USB-A cable OD
    connectorLen: 0.032,
    defaultLengthM: 1,
    presetLengthsM: [0.8, 1, 1.5, 2],
    bendingStiffness: 0.54,
    minInteriorAngleDeg: 108,
  },
  magsafe: {
    label: 'MagSafe 3 充电线',
    shortLabel: 'MagSafe 3',
    color: '#d4d8de',
    radius: 0.0019, // 3.8 mm Apple woven braided OD
    connectorLen: 0.025,
    defaultLengthM: 2,
    presetLengthsM: [2],
    bendingStiffness: 0.44,
    minInteriorAngleDeg: 102,
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
    bendingStiffness: 0.68,
    minInteriorAngleDeg: 112,
  },
  power: {
    label: '电源线 (IEC C13)',
    shortLabel: '电源',
    color: '#18181b',
    radius: 0.0041, // 8.2 mm 3-core AC OD
    connectorLen: 0.046,
    defaultLengthM: 1.8,
    presetLengthsM: [1.2, 1.5, 1.8, 3],
    bendingStiffness: 0.86,
    minInteriorAngleDeg: 122,
  },
  speakerWire: {
    label: '主副箱音箱连接线 (16AWG)',
    shortLabel: '主副箱线',
    color: '#8c6239',
    radius: 0.0022, // 4.4 mm 16AWG twin-lead jacket
    connectorLen: 0.03,
    defaultLengthM: 2,
    presetLengthsM: [1.5, 2, 2.5, 3, 4.9],
    bendingStiffness: 0.54,
    minInteriorAngleDeg: 108,
  },
  aux35: {
    label: '3.5mm 音频线 (AUX)',
    shortLabel: '3.5mm AUX',
    color: '#2b313c',
    radius: 0.00195, // 3.9 mm braided stereo AUX jacket
    connectorLen: 0.028,
    defaultLengthM: 1.5,
    presetLengthsM: [0.8, 1.2, 1.5, 2, 3],
    bendingStiffness: 0.46,
    minInteriorAngleDeg: 104,
  },
  rca: {
    label: 'RCA 双莲花音频线',
    shortLabel: 'RCA 莲花',
    color: '#202631',
    radius: 0.0024, // 4.8 mm coaxial RCA jacket
    connectorLen: 0.036,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.6,
    minInteriorAngleDeg: 110,
  },
  optical: {
    label: '光纤数字音频线 (TOSLINK)',
    shortLabel: '光纤音频',
    color: '#312e47',
    radius: 0.0025, // 5.0 mm optical OD
    connectorLen: 0.032,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.76,
    minInteriorAngleDeg: 118,
  },
  trs635: {
    label: '6.35mm TRS 平衡音频线',
    shortLabel: '6.35mm TRS',
    color: '#1b2029',
    radius: 0.0029, // 5.8 mm studio TRS balanced OD
    connectorLen: 0.044,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.7,
    minInteriorAngleDeg: 114,
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

/** Returns physical housing + strain-relief boot length (metres) for a specific end plug. */
export function plugConnectorLen(kind: CableKind, plugType?: PlugSpecKind): number {
  switch (plugType) {
    case 'ganAdapter':
      return 0.052;
    case 'appleDuckhead':
      return 0.035;
    case 'cn3Pin':
      return 0.034;
    case 'cn2Pin':
      return 0.03;
    case 'rightAngle':
      return 0.011;
    case 'iecC13':
      return 0.044;
    case 'dp':
      return 0.04;
    case 'usbc':
      return 0.026;
    case 'usba':
      return 0.03;
    default:
      return cableMeta[kind].connectorLen;
  }
}

export function cableEffectiveLengths(
  cable: Pick<
    Cable,
    'kind' | 'lengthM' | 'lengthIncludesConnectors' | 'fromPlugType' | 'toPlugType'
  >,
) {
  const spec = cableMeta[cable.kind];
  const nominalM = cable.lengthM ?? spec.defaultLengthM;
  const includesConnectors = cable.lengthIncludesConnectors ?? true;
  const fromConnM = plugConnectorLen(cable.kind, cable.fromPlugType);
  const toConnM = plugConnectorLen(cable.kind, cable.toPlugType);
  const bothConnectorsM = Math.round((fromConnM + toConnM) * 1000) / 1000;
  const totalM = includesConnectors ? nominalM : nominalM + bothConnectorsM;
  const bodyM = Math.max(0.1, includesConnectors ? nominalM - bothConnectorsM : nominalM);
  return {
    nominalM,
    includesConnectors,
    totalM: Math.round(totalM * 1000) / 1000,
    bodyM: Math.round(bodyM * 1000) / 1000,
    fromConnM,
    toConnM,
    bothConnectorsM,
  };
}

export type PowerCablePreset = {
  id: string;
  name: string;
  badge: string;
  specText: string;
  kind: Extract<CableKind, 'power' | 'magsafe' | 'usbc'>;
  /** Optional port kinds distinguishing dual Type-C vs USB-A↔Type-C. */
  fromPortKind?: CableKind;
  toPortKind?: CableKind;
  /** Connector plug mounted at outlet / power-supply end (optional extra accessory). */
  outletPlugType?: PlugSpecKind;
  /** Connector plug mounted at device end. */
  devicePlugType?: PlugSpecKind;
  color: string;
  lengthM: number;
};

/** Curated showcase catalog of power cords & pure charging cables (charger heads are optional extra accessories). */
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
    specText: 'USB-C ↔ MagSafe 3（不含充电插头，可另选配件）',
    kind: 'magsafe',
    fromPortKind: 'usbc',
    toPortKind: 'magsafe',
    color: '#d4d8de',
    lengthM: 2,
  },
  {
    id: 'usbc-pd-100w',
    name: '双头 Type-C 供电线',
    badge: 'C ↔ C · 无插头',
    specText: '纯线缆 Type-C ↔ Type-C · 直连 C 口或另选配插头',
    kind: 'usbc',
    fromPortKind: 'usbc',
    toPortKind: 'usbc',
    devicePlugType: 'usbc',
    outletPlugType: 'usbc',
    color: '#3f4754',
    lengthM: 1,
  },
  {
    id: 'usba-to-usbc-power',
    name: 'USB 转 Type-C 供电线',
    badge: 'A ↔ C · 无插头',
    specText: '纯线缆 USB-A ↔ Type-C · 接 USB-A 口/显示器反充',
    kind: 'usbc',
    fromPortKind: 'usba',
    toPortKind: 'usbc',
    devicePlugType: 'usba',
    outletPlugType: 'usbc',
    color: '#374151',
    lengthM: 1,
  },
  {
    id: 'usbc-pd-240w-white',
    name: '240W 编织双头 Type-C 线',
    badge: 'C ↔ C · 2m 编织',
    specText: '纯白高密编织 Type-C ↔ Type-C（不含充电插头）',
    kind: 'usbc',
    fromPortKind: 'usbc',
    toPortKind: 'usbc',
    devicePlugType: 'usbc',
    outletPlugType: 'usbc',
    color: '#eef1f5',
    lengthM: 2,
  },
];

export type SignalCablePreset = {
  id: string;
  kind: Exclude<CableKind, 'power' | 'magsafe'>;
  shortLabel: string;
  label: string;
  color: string;
  fromPortKind?: CableKind;
  toPortKind?: CableKind;
  fromPlugType?: PlugSpecKind;
  toPlugType?: PlugSpecKind;
};

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

export const SIGNAL_CABLE_PRESETS: readonly SignalCablePreset[] = [
  {
    id: 'dp-dp',
    kind: 'dp',
    shortLabel: '双头 DP',
    label: 'DisplayPort 双头线 (DP ↔ DP)',
    color: cableMeta.dp.color,
    fromPortKind: 'dp',
    toPortKind: 'dp',
    fromPlugType: 'dp',
    toPlugType: 'dp',
  },
  {
    id: 'dp-usbc',
    kind: 'dp',
    shortLabel: 'DP ↔ Type-C',
    label: 'DP 转 Type-C 视频线 (DP ↔ USB-C)',
    color: '#28303d',
    fromPortKind: 'dp',
    toPortKind: 'usbc',
    fromPlugType: 'dp',
    toPlugType: 'usbc',
  },
  {
    id: 'usbc-usbc',
    kind: 'usbc',
    shortLabel: '双头 Type-C',
    label: '双头 Type-C 线 (Type-C ↔ Type-C)',
    color: cableMeta.usbc.color,
    fromPortKind: 'usbc',
    toPortKind: 'usbc',
    fromPlugType: 'usbc',
    toPlugType: 'usbc',
  },
  {
    id: 'usba-usbc',
    kind: 'usbc',
    shortLabel: 'USB ↔ Type-C',
    label: 'USB 转 Type-C 线 (USB-A ↔ Type-C)',
    color: '#374151',
    fromPortKind: 'usba',
    toPortKind: 'usbc',
    fromPlugType: 'usba',
    toPlugType: 'usbc',
  },
  ...SIGNAL_CABLE_KINDS.filter((k) => k !== 'dp' && k !== 'usbc').map((kind) => ({
    id: kind,
    kind,
    shortLabel: cableMeta[kind].shortLabel,
    label: cableMeta[kind].label,
    color: cableMeta[kind].color,
  })),
];

/** Returns an accurate human-readable cable name distinguishing variants (DP, Type-C). */
export function formatCableDisplayName(
  cable: Pick<Cable, 'kind' | 'fromPlugType' | 'toPlugType'>,
): string {
  if (cable.kind === 'dp') {
    if (cable.fromPlugType === 'usbc' || cable.toPlugType === 'usbc') {
      return 'DP ↔ Type-C';
    }
    return '双头 DP';
  }
  if (cable.kind === 'usbc') {
    if (cable.fromPlugType === 'usba' || cable.toPlugType === 'usba') {
      return 'USB ↔ Type-C';
    }
    return '双头 Type-C';
  }
  return cableMeta[cable.kind].shortLabel;
}

/** Checks whether two physical port kinds can be joined by a single cable. */
export function arePortKindsCompatible(a: CableKind, b: CableKind): boolean {
  if (a === b) return true;
  if ((a === 'rca' && b === 'aux35') || (a === 'aux35' && b === 'rca')) return true;
  if (a === 'magsafe' || b === 'magsafe') {
    const other = a === 'magsafe' ? b : a;
    return other === 'power' || other === 'usbc' || other === 'usba';
  }
  if (a === 'usbc' || b === 'usbc') {
    const other = a === 'usbc' ? b : a;
    return other === 'usba' || other === 'dp' || other === 'hdmi' || other === 'power';
  }
  if (a === 'usba' || b === 'usba') {
    const other = a === 'usba' ? b : a;
    return other === 'power';
  }
  return false;
}

/** Checks whether a port can initiate or receive a cable of `selectedKind`. */
export function isPortCompatibleWithCable(portKind: CableKind, selectedKind: CableKind): boolean {
  if (portKind === selectedKind) return true;
  if (selectedKind === 'usbc') {
    return portKind === 'usba' || portKind === 'dp' || portKind === 'hdmi' || portKind === 'power';
  }
  if (selectedKind === 'usba') {
    return portKind === 'usbc' || portKind === 'power';
  }
  if (selectedKind === 'magsafe') {
    return portKind === 'power' || portKind === 'usbc' || portKind === 'usba';
  }
  if (selectedKind === 'rca') return portKind === 'aux35';
  if (selectedKind === 'aux35') return portKind === 'rca';
  return false;
}

/** Assigns outlet-side vs device-side / asymmetric signal plug housings accurately regardless of wiring click order. */
export function resolveCablePlugEnds(options: {
  fromKind?: string;
  fromPortId: string;
  fromPortKind?: CableKind;
  toKind?: string;
  toPortId?: string;
  toPortKind?: CableKind;
  cableKind: CableKind;
  outletPlugType?: PlugSpecKind;
  devicePlugType?: PlugSpecKind;
}): { fromPlugType?: PlugSpecKind; toPlugType?: PlugSpecKind } {
  const {
    fromKind,
    fromPortId,
    fromPortKind,
    toKind,
    toPortId,
    toPortKind,
    cableKind,
    outletPlugType,
    devicePlugType,
  } = options;
  const fromIsOutlet =
    (fromKind === 'powerStrip' || fromKind === 'wallOutlet') && fromPortId.startsWith('slot-');
  const toIsOutlet =
    (toKind === 'powerStrip' || toKind === 'wallOutlet') && Boolean(toPortId?.startsWith('slot-'));

  // Signal cables with asymmetric DP ↔ Type-C endpoints match plug heads to port kinds
  if (
    !fromIsOutlet &&
    !toIsOutlet &&
    cableKind === 'dp' &&
    (fromPortKind === 'usbc' ||
      toPortKind === 'usbc' ||
      devicePlugType === 'dp' ||
      outletPlugType === 'usbc')
  ) {
    const isAsymmetricUsbc =
      fromPortKind === 'usbc' ||
      toPortKind === 'usbc' ||
      outletPlugType === 'usbc' ||
      devicePlugType === 'usbc';
    if (!isAsymmetricUsbc) {
      return { fromPlugType: 'dp', toPlugType: 'dp' };
    }
    if (fromPortKind === 'usbc' && toPortKind !== 'usbc') {
      return { fromPlugType: 'usbc', toPlugType: 'dp' };
    }
    if (toPortKind === 'usbc' && fromPortKind !== 'usbc') {
      return { fromPlugType: 'dp', toPlugType: 'usbc' };
    }
    return {
      fromPlugType: devicePlugType ?? 'dp',
      toPlugType: outletPlugType ?? 'usbc',
    };
  }

  // Type-C family cables: USB-A ↔ Type-C vs Dual Type-C (charger adapters are NEVER auto-bundled)
  if (!fromIsOutlet && !toIsOutlet && cableKind === 'usbc') {
    const isAsymmetricUsbA =
      fromPortKind === 'usba' ||
      toPortKind === 'usba' ||
      devicePlugType === 'usba' ||
      outletPlugType === 'usba';
    if (!isAsymmetricUsbA) {
      return { fromPlugType: 'usbc', toPlugType: 'usbc' };
    }
    if (fromPortKind === 'usba' && toPortKind !== 'usba') {
      return { fromPlugType: 'usba', toPlugType: 'usbc' };
    }
    if (toPortKind === 'usba' && fromPortKind !== 'usba') {
      return { fromPlugType: 'usbc', toPlugType: 'usba' };
    }
    return {
      fromPlugType: devicePlugType ?? 'usba',
      toPlugType: outletPlugType ?? 'usbc',
    };
  }

  // Only AC power cords default to 10A 3-pin wall plug; Type-C / MagSafe never auto-bundle adapters
  const resolvedOutletPlug = outletPlugType ?? (cableKind === 'power' ? 'cn3Pin' : undefined);
  const resolvedDevicePlug =
    devicePlugType ??
    (cableKind === 'usbc' && (fromPortKind === 'usba' || toPortKind === 'usba')
      ? 'usba'
      : undefined);

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

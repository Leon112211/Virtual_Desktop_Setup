// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { z } from 'zod';
import type { CableKind } from './ports';
import { plugSpecSchema, type PlugSpecKind } from './power';
import { tr } from '../i18n';

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
  readonly label: string;
  readonly shortLabel: string;
  color: string;
  /** Physical outer radius of the cable jacket (metres). */
  radius: number;
  /** Approximate length of one connector housing + strain-relief boot (metres). */
  connectorLen: number;
  /** Default total cable length in metres (with connectors). */
  defaultLengthM: number;
  /** Mainstream length presets in metres (with connectors). */
  presetLengthsM: readonly number[];
  /** Bending resilience stiffness in [0, 1] governing curve resistance and sag smoothness. */
  bendingStiffness: number;
  /** Minimum allowed interior angle (degrees, >= 95° so cables never fold at acute bends). */
  minInteriorAngleDeg: number;
  /** Fixed length specification note if applicable. */
  readonly officialLengthNote?: string;
};

export const cableMeta: Record<CableKind, CableSpec> = {
  dp: {
    get label() {
      return tr('DisplayPort (DP)', 'DisplayPort (DP)');
    },
    get shortLabel() {
      return 'DP';
    },
    color: '#232832',
    radius: 0.0035, // 7.0 mm OD
    connectorLen: 0.042,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.78,
    minInteriorAngleDeg: 116,
  },
  hdmi: {
    get label() {
      return 'HDMI';
    },
    get shortLabel() {
      return 'HDMI';
    },
    color: '#1e2633',
    radius: 0.0036, // 7.2 mm OD
    connectorLen: 0.038,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.8,
    minInteriorAngleDeg: 118,
  },
  usbc: {
    get label() {
      return tr('USB4 / Type-C 数据供电线', 'USB4 / Type-C Cable');
    },
    get shortLabel() {
      return tr('双头 Type-C', 'Dual Type-C');
    },
    color: '#3f4754',
    radius: 0.0024, // 4.8 mm OD
    connectorLen: 0.028,
    defaultLengthM: 1,
    presetLengthsM: [0.8, 1, 1.5, 2],
    bendingStiffness: 0.56,
    minInteriorAngleDeg: 108,
  },
  usba: {
    get label() {
      return tr('USB-A 数据/供电线', 'USB-A Data/Power Cable');
    },
    get shortLabel() {
      return 'USB-A';
    },
    color: '#374151',
    radius: 0.0023, // 4.6 mm USB-A cable OD
    connectorLen: 0.032,
    defaultLengthM: 1,
    presetLengthsM: [0.8, 1, 1.5, 2],
    bendingStiffness: 0.54,
    minInteriorAngleDeg: 108,
  },
  magsafe: {
    get label() {
      return tr('磁吸编织快充线', 'Magnetic Braided Cable');
    },
    get shortLabel() {
      return tr('磁吸充电线', 'Magnetic Charge');
    },
    color: '#d4d8de',
    radius: 0.0019, // 3.8 mm woven braided OD
    connectorLen: 0.025,
    defaultLengthM: 2,
    presetLengthsM: [2],
    bendingStiffness: 0.44,
    minInteriorAngleDeg: 102,
    get officialLengthNote() {
      return tr(
        'USB-C 转磁吸充电线标准固定长度（含端子 2 m）',
        'Standard USB-C to Magnetic charging cable fixed length (2 m incl. connectors)',
      );
    },
  },
  rj45: {
    get label() {
      return tr('RJ45 网线 (Cat6)', 'RJ45 Ethernet (Cat6)');
    },
    get shortLabel() {
      return tr('RJ45 网线', 'RJ45');
    },
    color: '#254a84',
    radius: 0.0031, // 6.2 mm Cat6 OD
    connectorLen: 0.036,
    defaultLengthM: 1.5,
    presetLengthsM: [0.5, 1, 1.5, 2, 3, 5],
    bendingStiffness: 0.68,
    minInteriorAngleDeg: 112,
  },
  power: {
    get label() {
      return tr('电源线 (IEC C13)', 'AC Power Cord (IEC C13)');
    },
    get shortLabel() {
      return tr('电源', 'AC Power');
    },
    color: '#18181b',
    radius: 0.0041, // 8.2 mm 3-core AC OD
    connectorLen: 0.046,
    defaultLengthM: 1.8,
    presetLengthsM: [1.2, 1.5, 1.8, 3],
    bendingStiffness: 0.86,
    minInteriorAngleDeg: 122,
  },
  speakerWire: {
    get label() {
      return tr('主副箱音箱连接线 (16AWG)', 'Speaker Interconnect Wire (16AWG)');
    },
    get shortLabel() {
      return tr('主副箱线', 'Speaker Wire');
    },
    color: '#8c6239',
    radius: 0.0022, // 4.4 mm 16AWG twin-lead jacket
    connectorLen: 0.03,
    defaultLengthM: 2,
    presetLengthsM: [1.5, 2, 2.5, 3, 4.9],
    bendingStiffness: 0.54,
    minInteriorAngleDeg: 108,
  },
  aux35: {
    get label() {
      return tr('3.5mm 音频线 (AUX)', '3.5mm Stereo AUX Cable');
    },
    get shortLabel() {
      return '3.5mm AUX';
    },
    color: '#2b313c',
    radius: 0.00195, // 3.9 mm braided stereo AUX jacket
    connectorLen: 0.028,
    defaultLengthM: 1.5,
    presetLengthsM: [0.8, 1.2, 1.5, 2, 3],
    bendingStiffness: 0.46,
    minInteriorAngleDeg: 104,
  },
  rca: {
    get label() {
      return tr('RCA 双莲花音频线', 'Dual RCA Audio Cable');
    },
    get shortLabel() {
      return tr('RCA 莲花', 'Dual RCA');
    },
    color: '#202631',
    radius: 0.0024, // 4.8 mm coaxial RCA jacket
    connectorLen: 0.036,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.6,
    minInteriorAngleDeg: 110,
  },
  optical: {
    get label() {
      return tr('光纤数字音频线 (TOSLINK)', 'Optical Audio Cable (TOSLINK)');
    },
    get shortLabel() {
      return tr('光纤音频', 'Optical');
    },
    color: '#312e47',
    radius: 0.0025, // 5.0 mm optical OD
    connectorLen: 0.032,
    defaultLengthM: 1.5,
    presetLengthsM: [1, 1.5, 2, 3],
    bendingStiffness: 0.76,
    minInteriorAngleDeg: 118,
  },
  trs635: {
    get label() {
      return tr('6.35mm TRS 平衡音频线', '6.35mm TRS Balanced Cable');
    },
    get shortLabel() {
      return '6.35mm TRS';
    },
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
      return 0.064;
    case 'appleDuckhead':
      return 0.042;
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
  readonly name: string;
  readonly badge: string;
  readonly specText: string;
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
    get name() {
      return tr('标准三插品字电源线', '3-Pin IEC C13 Power Cord');
    },
    get badge() {
      return '10A · C13';
    },
    get specText() {
      return tr('三脚插头 ↔ IEC C13 · Ø8.2mm · 1.8m', '3-Pin Grounded ↔ IEC C13 · Ø8.2mm · 1.8m');
    },
    kind: 'power',
    outletPlugType: 'cn3Pin',
    devicePlugType: 'iecC13',
    color: '#18181b',
    lengthM: 1.8,
  },
  {
    id: 'iec-c13-right90',
    get name() {
      return tr('90° 超薄直角电源线', '90° Low-Profile Power Cord');
    },
    get badge() {
      return tr('11mm 贴墙', '11mm Flush');
    },
    get specText() {
      return tr(
        '90°弯头 ↔ IEC C13 · 靠墙/低矮插座防顶',
        '90° Angle Plug ↔ IEC C13 · Wall-Flush Fit',
      );
    },
    kind: 'power',
    outletPlugType: 'rightAngle',
    devicePlugType: 'iecC13',
    color: '#20242c',
    lengthM: 1.5,
  },
  {
    id: 'iec-c7-cn2',
    get name() {
      return tr('纯白两脚 8 字尾电源线', 'White 2-Pin Figure-8 Cord');
    },
    get badge() {
      return tr('两插 · 纯白', '2-Pin · White');
    },
    get specText() {
      return tr('两脚扁插 · 迷你主机 / 音箱轻便供电', '2-Pin Flat Plug · For Mini PC & Speakers');
    },
    kind: 'power',
    outletPlugType: 'cn2Pin',
    devicePlugType: 'cn2Pin',
    color: '#e2e8f0',
    lengthM: 1.5,
  },
  {
    id: 'magsafe3-official',
    get name() {
      return tr('磁吸编织快充线', 'Magnetic Braided Cable');
    },
    get badge() {
      return tr('定长 2m · 140W', 'Fixed 2m · 140W');
    },
    get specText() {
      return tr(
        'USB-C ↔ 磁吸充电口（不含充电插头，可另选配件）',
        'USB-C ↔ Magnetic Port (Plug sold separately)',
      );
    },
    kind: 'magsafe',
    fromPortKind: 'usbc',
    toPortKind: 'magsafe',
    color: '#d4d8de',
    lengthM: 2,
  },
  {
    id: 'usbc-pd-100w',
    get name() {
      return tr('双头 Type-C 供电线', 'Dual Type-C PD Cable');
    },
    get badge() {
      return tr('C ↔ C · 无插头', 'C ↔ C · Cable Only');
    },
    get specText() {
      return tr(
        '纯线缆 Type-C ↔ Type-C · 直连 C 口或另选配插头',
        'Pure Type-C ↔ Type-C · Direct C-port or optional adapter',
      );
    },
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
    get name() {
      return tr('USB 转 Type-C 供电线', 'USB-A to Type-C Cable');
    },
    get badge() {
      return tr('A ↔ C · 无插头', 'A ↔ C · Cable Only');
    },
    get specText() {
      return tr(
        '纯线缆 USB-A ↔ Type-C · 接 USB-A 口/显示器供电',
        'Pure USB-A ↔ Type-C · Connects to USB-A hub or strip',
      );
    },
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
    get name() {
      return tr('240W 编织双头 Type-C 线', '240W Braided Dual Type-C');
    },
    get badge() {
      return tr('C ↔ C · 2m 编织', 'C ↔ C · 2m Braided');
    },
    get specText() {
      return tr(
        '纯白高密编织 Type-C ↔ Type-C（不含充电插头）',
        'White woven Type-C ↔ Type-C (No wall adapter included)',
      );
    },
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
  readonly shortLabel: string;
  readonly label: string;
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
    get shortLabel() {
      return tr('双头 DP', 'Dual DP');
    },
    get label() {
      return tr('DisplayPort 双头线 (DP ↔ DP)', 'DisplayPort Cable (DP ↔ DP)');
    },
    color: cableMeta.dp.color,
    fromPortKind: 'dp',
    toPortKind: 'dp',
    fromPlugType: 'dp',
    toPlugType: 'dp',
  },
  {
    id: 'dp-usbc',
    kind: 'dp',
    get shortLabel() {
      return 'DP ↔ Type-C';
    },
    get label() {
      return tr('DP 转 Type-C 视频线 (DP ↔ USB-C)', 'DP to Type-C Video Cable (DP ↔ USB-C)');
    },
    color: '#28303d',
    fromPortKind: 'dp',
    toPortKind: 'usbc',
    fromPlugType: 'dp',
    toPlugType: 'usbc',
  },
  {
    id: 'usbc-usbc',
    kind: 'usbc',
    get shortLabel() {
      return tr('双头 Type-C', 'Dual Type-C');
    },
    get label() {
      return tr('双头 Type-C 线 (Type-C ↔ Type-C)', 'Dual Type-C Cable (Type-C ↔ Type-C)');
    },
    color: cableMeta.usbc.color,
    fromPortKind: 'usbc',
    toPortKind: 'usbc',
    fromPlugType: 'usbc',
    toPlugType: 'usbc',
  },
  {
    id: 'usba-usbc',
    kind: 'usbc',
    get shortLabel() {
      return 'USB ↔ Type-C';
    },
    get label() {
      return tr('USB 转 Type-C 线 (USB-A ↔ Type-C)', 'USB-A to Type-C Cable (USB-A ↔ Type-C)');
    },
    color: '#374151',
    fromPortKind: 'usba',
    toPortKind: 'usbc',
    fromPlugType: 'usba',
    toPlugType: 'usbc',
  },
  ...SIGNAL_CABLE_KINDS.filter((k) => k !== 'dp' && k !== 'usbc').map((kind) => ({
    id: kind,
    kind,
    get shortLabel() {
      return cableMeta[kind].shortLabel;
    },
    get label() {
      return cableMeta[kind].label;
    },
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
    return tr('双头 DP', 'Dual DP');
  }
  if (cable.kind === 'usbc') {
    if (cable.fromPlugType === 'usba' || cable.toPlugType === 'usba') {
      return 'USB ↔ Type-C';
    }
    return tr('双头 Type-C', 'Dual Type-C');
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

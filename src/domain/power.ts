// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { z } from 'zod';
import { tr } from '../i18n';

export const powerOutletTypeValues = ['combo5', 'twoPin', 'threePin'] as const;
export const powerOutletTypeSchema = z.enum(powerOutletTypeValues);
export type PowerOutletType = z.infer<typeof powerOutletTypeSchema>;

export const POWER_OUTLET_LABELS: Record<PowerOutletType, string> = {
  get combo5() {
    return tr('5 孔组合（2+3孔）', '5-Hole Combo (2+3 Pin)');
  },
  get twoPin() {
    return tr('仅双孔（2脚）', '2-Pin Only');
  },
  get threePin() {
    return tr('仅三孔（3脚）', '3-Pin Grounded');
  },
};

export const powerStripLayoutValues = ['1x3', '1x4', '1x5', '1x6', '2x3', '2x4'] as const;
export const powerStripLayoutSchema = z.enum(powerStripLayoutValues);
export type PowerStripLayout = z.infer<typeof powerStripLayoutSchema>;

export const POWER_STRIP_LAYOUT_META: Record<
  PowerStripLayout,
  { readonly label: string; rows: 1 | 2; cols: number }
> = {
  '1x3': {
    get label() {
      return tr('1×3 位', '1×3 Gang');
    },
    rows: 1,
    cols: 3,
  },
  '1x4': {
    get label() {
      return tr('1×4 位', '1×4 Gang');
    },
    rows: 1,
    cols: 4,
  },
  '1x5': {
    get label() {
      return tr('1×5 位', '1×5 Gang');
    },
    rows: 1,
    cols: 5,
  },
  '1x6': {
    get label() {
      return tr('1×6 位', '1×6 Gang');
    },
    rows: 1,
    cols: 6,
  },
  '2x3': {
    get label() {
      return tr('2×3 位', '2×3 Gang');
    },
    rows: 2,
    cols: 3,
  },
  '2x4': {
    get label() {
      return tr('2×4 位', '2×4 Gang');
    },
    rows: 2,
    cols: 4,
  },
};

export const POWER_STRIP_CORD_LENGTHS = [1.2, 1.5, 1.8, 2, 3, 5] as const;

export const powerStripSettingsSchema = z.object({
  layout: powerStripLayoutSchema,
  outletType: powerOutletTypeSchema,
  usbA: z.number().int().min(0).max(4),
  usbC: z.number().int().min(0).max(4),
  masterSwitch: z.boolean(),
  cordLengthM: z.number().finite().min(0.5).max(10).optional(),
});
export type PowerStripSettings = z.infer<typeof powerStripSettingsSchema>;

export const wallOutletMountSchema = z.enum(['wall', 'floor']);
export type WallOutletMount = z.infer<typeof wallOutletMountSchema>;

export const wallOutletSettingsSchema = z.object({
  mount: wallOutletMountSchema,
  outletType: powerOutletTypeSchema,
  gangs: z.literal(1),
  usbA: z.number().int().min(0).max(2),
  usbC: z.literal(0),
});
export type WallOutletSettings = z.infer<typeof wallOutletSettingsSchema>;

export const plugSpecValues = [
  'cn3Pin',
  'cn2Pin',
  'rightAngle',
  'ganAdapter',
  'appleDuckhead',
  'iecC13',
  'dp',
  'usbc',
  'usba',
] as const;
export const plugSpecSchema = z.enum(plugSpecValues);
export type PlugSpecKind = z.infer<typeof plugSpecSchema>;

export const PLUG_SPEC_META: Record<
  PlugSpecKind,
  { readonly label: string; readonly shortLabel: string; depthM: number }
> = {
  cn3Pin: {
    get label() {
      return tr('标准三脚插头 (10A)', '3-Pin Grounded Plug (10A)');
    },
    get shortLabel() {
      return tr('三脚插头', '3-Pin Plug');
    },
    depthM: 0.024,
  },
  cn2Pin: {
    get label() {
      return tr('标准两脚扁插头', '2-Pin Flat Plug');
    },
    get shortLabel() {
      return tr('两脚插头', '2-Pin Plug');
    },
    depthM: 0.021,
  },
  rightAngle: {
    get label() {
      return tr('90° 超薄直角弯头', '90° Low-Profile Plug');
    },
    get shortLabel() {
      return tr('90°弯头', '90° Plug');
    },
    depthM: 0.011,
  },
  ganAdapter: {
    get label() {
      return tr('氮化镓 (GaN) 快充头（额外配件）', 'GaN Fast Charger (Add-on)');
    },
    get shortLabel() {
      return tr('GaN快充头', 'GaN Charger');
    },
    depthM: 0.064,
  },
  appleDuckhead: {
    get label() {
      return tr('方形快充电源头（额外配件）', 'Square Power Adapter (Add-on)');
    },
    get shortLabel() {
      return tr('方形快充头', 'Square Charger');
    },
    depthM: 0.042,
  },
  iecC13: {
    get label() {
      return tr('IEC C13 品字尾插头', 'IEC C13 Coupler');
    },
    get shortLabel() {
      return tr('品字尾', 'IEC C13');
    },
    depthM: 0.032,
  },
  dp: {
    get label() {
      return tr('DisplayPort (DP) 接头', 'DisplayPort (DP) Plug');
    },
    get shortLabel() {
      return tr('DP接头', 'DP Plug');
    },
    depthM: 0.042,
  },
  usbc: {
    get label() {
      return tr('USB-C / Type-C 接头', 'USB-C / Type-C Plug');
    },
    get shortLabel() {
      return tr('Type-C接头', 'Type-C Plug');
    },
    depthM: 0.028,
  },
  usba: {
    get label() {
      return tr('USB-A 方口接头', 'USB-A Plug');
    },
    get shortLabel() {
      return tr('USB-A接头', 'USB-A Plug');
    },
    depthM: 0.032,
  },
};

export const WALL_OUTLET_DEFAULT_Y = 0.32;

export function isAcWallPlugKind(plug?: PlugSpecKind): boolean {
  return (
    plug === 'cn3Pin' ||
    plug === 'cn2Pin' ||
    plug === 'rightAngle' ||
    plug === 'ganAdapter' ||
    plug === 'appleDuckhead'
  );
}

export function isTwoPinAcPlug(plug?: PlugSpecKind): boolean {
  return plug === 'cn2Pin' || plug === 'ganAdapter' || plug === 'appleDuckhead';
}

export function canAcPlugFitOutlet(
  plug: PlugSpecKind | undefined,
  outletType: PowerOutletType,
): boolean {
  if (!plug || outletType === 'combo5') return true;
  return outletType === 'twoPin' ? isTwoPinAcPlug(plug) : !isTwoPinAcPlug(plug);
}

export function defaultPowerStripSettings(): PowerStripSettings {
  return {
    layout: '1x3',
    outletType: 'combo5',
    usbA: 2,
    usbC: 1,
    masterSwitch: true,
    cordLengthM: 1.8,
  };
}

export function defaultWallOutletSettings(): WallOutletSettings {
  return {
    mount: 'wall',
    outletType: 'combo5',
    gangs: 1,
    usbA: 0,
    usbC: 0,
  };
}

export function computePowerStripSize(cfg: PowerStripSettings) {
  const { rows, cols } = POWER_STRIP_LAYOUT_META[cfg.layout];
  const slotPitch = 0.045;
  const acSpan = cols * slotPitch;
  const switchSpan = cfg.masterSwitch ? 0.034 : 0.012;
  const totalUsb = cfg.usbA + cfg.usbC;
  const usbCols = rows === 2 && totalUsb > 2 ? Math.ceil(totalUsb / 2) : totalUsb;
  const usbSpan = usbCols > 0 ? usbCols * 0.016 + 0.014 : 0;
  const width = Math.round((acSpan + switchSpan + usbSpan + 0.02) * 1000) / 1000;
  const depth = rows === 2 ? 0.108 : 0.064;
  const height = 0.029;
  return { width, height, depth };
}

export function computeWallOutletSize(cfg: WallOutletSettings) {
  const unitW = 0.086;
  const usbExtra = cfg.usbA > 0 ? 0.026 : 0;
  if (cfg.mount === 'floor') {
    const width = Math.round((unitW + 0.026 + usbExtra) * 1000) / 1000;
    return { width, height: 0.012, depth: 0.112 };
  }
  const width = Math.round((unitW + usbExtra) * 1000) / 1000;
  return { width, height: 0.086, depth: 0.015 };
}

export type LocalSocketSlot = {
  id: string;
  label: string;
  kind: 'power' | 'usbc' | 'usba';
  x: number;
  y: number;
  z: number;
};

export type LocalUsbPort = {
  id: string;
  label: string;
  type: 'usba' | 'usbc';
  x: number;
  y: number;
  z: number;
};

/** Computes exact 3D receptacle centers for USB-A and Type-C ports on a power strip. */
export function computePowerStripUsbPorts(cfg: PowerStripSettings): LocalUsbPort[] {
  const { width, height } = computePowerStripSize(cfg);
  const { rows, cols } = POWER_STRIP_LAYOUT_META[cfg.layout];
  const pitch = 0.045;
  const switchReserve = cfg.masterSwitch ? 0.032 : 0.01;
  const acStartX = -width / 2 + switchReserve + pitch / 2 + 0.004;
  const usbBaseX = acStartX + (cols - 0.5) * pitch + 0.022;
  const totalUsb = cfg.usbA + cfg.usbC;
  const twoRows = rows === 2 && totalUsb > 2;
  const ports: LocalUsbPort[] = [];

  for (let i = 0; i < totalUsb; i++) {
    const isC = i < cfg.usbC;
    const typeIdx = isC ? i : i - cfg.usbC;
    const colIdx = twoRows ? Math.floor(i / 2) : i;
    const z = twoRows ? (i % 2 === 0 ? -0.015 : 0.015) : 0;
    ports.push({
      id: `${isC ? 'usbc' : 'usba'}-${typeIdx + 1}`,
      label: isC
        ? tr(`Type-C 快充口 ${typeIdx + 1}`, `Type-C PD ${typeIdx + 1}`)
        : tr(`USB-A 口 ${typeIdx + 1}`, `USB-A ${typeIdx + 1}`),
      type: isC ? 'usbc' : 'usba',
      x: usbBaseX + colIdx * 0.017,
      y: height,
      z,
    });
  }
  return ports;
}

/** Computes exact 3D receptacle centers for optional USB-A ports on a wall/floor outlet (never Type-C). */
export function computeWallOutletUsbPorts(cfg: WallOutletSettings): LocalUsbPort[] {
  const { width, height, depth } = computeWallOutletSize(cfg);
  const totalUsb = cfg.usbA;
  if (totalUsb === 0) return [];
  const ux = width / 2 - (cfg.mount === 'floor' ? 0.02 : 0.015);
  const ports: LocalUsbPort[] = [];

  for (let i = 0; i < totalUsb; i++) {
    const frac = (i + 1) / (totalUsb + 1);
    ports.push({
      id: `usba-${i + 1}`,
      label: tr(`USB-A 口 ${i + 1}`, `USB-A ${i + 1}`),
      type: 'usba',
      x: ux,
      y: cfg.mount === 'floor' ? height : height * (1 - frac * 0.65 - 0.175),
      z: cfg.mount === 'floor' ? -0.036 + frac * 0.072 : depth / 2,
    });
  }
  return ports;
}

export function computePowerStripSlots(cfg: PowerStripSettings): LocalSocketSlot[] {
  const { width, height } = computePowerStripSize(cfg);
  const { rows, cols } = POWER_STRIP_LAYOUT_META[cfg.layout];
  const slots: LocalSocketSlot[] = [];
  const pitch = 0.045;
  const rowZ = rows === 2 ? [-0.024, 0.024] : [0];
  const switchReserve = cfg.masterSwitch ? 0.032 : 0.01;
  const acStartX = -width / 2 + switchReserve + pitch / 2 + 0.004;

  let idx = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        id: `slot-${idx}`,
        label: tr(`AC 插孔 ${idx}`, `AC Outlet ${idx}`),
        kind: 'power',
        x: acStartX + c * pitch,
        y: height,
        z: rowZ[r],
      });
      idx++;
    }
  }

  for (const usb of computePowerStripUsbPorts(cfg)) {
    slots.push({
      id: usb.id,
      label: usb.label,
      kind: usb.type,
      x: usb.x,
      y: usb.y,
      z: usb.z,
    });
  }
  return slots;
}

export function computeWallOutletSlots(cfg: WallOutletSettings): LocalSocketSlot[] {
  const { width, height, depth } = computeWallOutletSize(cfg);
  const usbBlockW = cfg.usbA > 0 ? 0.026 : 0;
  const gangW = width - (cfg.mount === 'floor' ? 0.02 : 0) - usbBlockW;
  const cx = -width / 2 + (cfg.mount === 'floor' ? 0.01 : 0) + gangW / 2;

  return [
    {
      id: 'slot-1',
      label: tr('插座孔位 1', 'Socket 1'),
      kind: 'power',
      x: cx,
      y: cfg.mount === 'floor' ? height : height / 2,
      z: cfg.mount === 'floor' ? 0 : depth / 2,
    },
    ...computeWallOutletUsbPorts(cfg).map((usb) => ({
      id: usb.id,
      label: usb.label,
      kind: usb.type,
      x: usb.x,
      y: usb.y,
      z: usb.z,
    })),
  ];
}

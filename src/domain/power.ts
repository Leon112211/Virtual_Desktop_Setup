import { z } from 'zod';

export const powerOutletTypeValues = ['combo5', 'twoPin', 'threePin'] as const;
export const powerOutletTypeSchema = z.enum(powerOutletTypeValues);
export type PowerOutletType = z.infer<typeof powerOutletTypeSchema>;

export const POWER_OUTLET_LABELS: Record<PowerOutletType, string> = {
  combo5: '5 孔组合（2+3孔）',
  twoPin: '仅双孔（2脚）',
  threePin: '仅三孔（3脚）',
};

export const powerStripLayoutValues = ['1x3', '1x4', '1x5', '1x6', '2x3', '2x4'] as const;
export const powerStripLayoutSchema = z.enum(powerStripLayoutValues);
export type PowerStripLayout = z.infer<typeof powerStripLayoutSchema>;

export const POWER_STRIP_LAYOUT_META: Record<
  PowerStripLayout,
  { label: string; rows: 1 | 2; cols: number }
> = {
  '1x3': { label: '1×3 位', rows: 1, cols: 3 },
  '1x4': { label: '1×4 位', rows: 1, cols: 4 },
  '1x5': { label: '1×5 位', rows: 1, cols: 5 },
  '1x6': { label: '1×6 位', rows: 1, cols: 6 },
  '2x3': { label: '2×3 位', rows: 2, cols: 3 },
  '2x4': { label: '2×4 位', rows: 2, cols: 4 },
};

export const powerStripSettingsSchema = z.object({
  layout: powerStripLayoutSchema,
  outletType: powerOutletTypeSchema,
  usbA: z.number().int().min(0).max(4),
  usbC: z.number().int().min(0).max(4),
  masterSwitch: z.boolean(),
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
] as const;
export const plugSpecSchema = z.enum(plugSpecValues);
export type PlugSpecKind = z.infer<typeof plugSpecSchema>;

export const PLUG_SPEC_META: Record<
  PlugSpecKind,
  { label: string; shortLabel: string; depthM: number }
> = {
  cn3Pin: { label: '国标三脚插头 (10A)', shortLabel: '国标三插', depthM: 0.024 },
  cn2Pin: { label: '国标两脚扁插头', shortLabel: '国标两插', depthM: 0.021 },
  rightAngle: { label: '90° 超薄直角弯头', shortLabel: '90°弯头', depthM: 0.011 },
  ganAdapter: { label: '氮化镓 (GaN) 快充头', shortLabel: 'GaN快充头', depthM: 0.048 },
  appleDuckhead: { label: '苹果官方方形快充头', shortLabel: '苹果方头', depthM: 0.029 },
  iecC13: { label: 'IEC C13 品字尾插头', shortLabel: '品字尾', depthM: 0.032 },
};

export const WALL_OUTLET_DEFAULT_Y = 0.32;

export function defaultPowerStripSettings(): PowerStripSettings {
  return {
    layout: '1x3',
    outletType: 'combo5',
    usbA: 2,
    usbC: 1,
    masterSwitch: true,
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
  kind: 'power' | 'usbc';
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
      label: isC ? `Type-C 快充口 ${typeIdx + 1}` : `USB-A 口 ${typeIdx + 1}`,
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
      label: `USB-A 口 ${i + 1}`,
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
        label: `AC 插孔 ${idx}`,
        kind: 'power',
        x: acStartX + c * pitch,
        y: height,
        z: rowZ[r],
      });
      idx++;
    }
  }

  for (const usb of computePowerStripUsbPorts(cfg)) {
    if (usb.type !== 'usbc') continue;
    slots.push({
      id: usb.id,
      label: usb.label,
      kind: 'usbc',
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
      label: '插座孔位 1',
      kind: 'power',
      x: cx,
      y: cfg.mount === 'floor' ? height : height / 2,
      z: cfg.mount === 'floor' ? 0 : depth / 2,
    },
  ];
}

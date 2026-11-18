import { z } from 'zod';
import type { Size } from './project';

export const MAX_LID_ANGLE = 135;
export const DEFAULT_LID_ANGLE = 108;

export type DevicePreset = {
  id: string;
  label: string;
  size: Size;
};

export const gamingLaptopPresets: DevicePreset[] = [
  { id: '14', label: '14" 游戏本', size: { width: 0.315, height: 0.021, depth: 0.228 } },
  { id: '15.6', label: '15.6" 游戏本', size: { width: 0.359, height: 0.024, depth: 0.258 } },
  { id: '16', label: '16" 游戏本', size: { width: 0.356, height: 0.023, depth: 0.262 } },
  { id: '17.3', label: '17.3" 游戏本', size: { width: 0.397, height: 0.026, depth: 0.284 } },
];

export type MacBookColor = { hex: string; label: string };

export const macbookPresets: DevicePreset[] = [
  { id: 'air13', label: 'Air 13"', size: { width: 0.3041, height: 0.0113, depth: 0.215 } },
  { id: 'pro14', label: 'Pro 14"', size: { width: 0.3126, height: 0.0155, depth: 0.2212 } },
  { id: 'air15', label: 'Air 15"', size: { width: 0.3404, height: 0.0115, depth: 0.2376 } },
  { id: 'pro16', label: 'Pro 16"', size: { width: 0.3557, height: 0.0168, depth: 0.2481 } },
];

/** Official 14-inch MacBook Pro chassis editions (2024–2026 Standard vs 2026 PROLED XDR). */
export const MACBOOK_PRO_14_VARIANTS = {
  standard: {
    id: 'standard',
    label: '2024–2026 标准版',
    summary: '312.6 × 221.2 × 15.5 mm',
    size: { width: 0.3126, height: 0.0155, depth: 0.2212 },
  },
  proled: {
    id: 'proled',
    label: '2026 PROLED XDR',
    summary: '310.8 × 216.3 × 15.0 mm',
    size: { width: 0.3108, height: 0.015, depth: 0.2163 },
  },
} as const;

export function isMacbookPro14ProledSize(size: Size): boolean {
  const s = MACBOOK_PRO_14_VARIANTS.proled.size;
  return (
    Math.abs(size.width - s.width) < 1e-6 &&
    Math.abs(size.height - s.height) < 1e-6 &&
    Math.abs(size.depth - s.depth) < 1e-6
  );
}

export const macbookAirColors: MacBookColor[] = [
  { hex: '#c4d4e0', label: '天蓝色' },
  { hex: '#e3e4e6', label: '银色' },
  { hex: '#f0e4d3', label: '星光色' },
  { hex: '#2c323d', label: '午夜色' },
  { hex: '#7d7f84', label: '深空灰色' },
];

export const macbookProColors: MacBookColor[] = [
  { hex: '#2e3034', label: '深空黑色' },
  { hex: '#e3e4e6', label: '银色' },
  { hex: '#7d7f84', label: '深空灰色' },
];

export function isMacbookProSize(size: Size): boolean {
  return size.height >= 0.0135;
}

export function macbookOfficialColors(size: Size): MacBookColor[] {
  return isMacbookProSize(size) ? macbookProColors : macbookAirColors;
}

export function resolveMacbookColor(size: Size, currentColor: string): string {
  const palette = macbookOfficialColors(size);
  const matched = palette.find((c) => c.hex.toLowerCase() === currentColor.toLowerCase());
  return matched ? matched.hex : palette[0].hex;
}

export function isOfficialMacbookSpec(size: Size, color: string): boolean {
  const preset = macbookPresets.find(
    (p) =>
      Math.abs(p.size.width - size.width) < 1e-6 &&
      Math.abs(p.size.height - size.height) < 1e-6 &&
      Math.abs(p.size.depth - size.depth) < 1e-6,
  );
  const validSize = preset?.size ?? (isMacbookPro14ProledSize(size) ? size : null);
  if (!validSize) return false;
  return macbookOfficialColors(validSize).some((c) => c.hex.toLowerCase() === color.toLowerCase());
}

export function isOfficialGamingLaptopSpec(size: Size): boolean {
  return gamingLaptopPresets.some(
    (p) =>
      Math.abs(p.size.width - size.width) < 1e-6 &&
      Math.abs(p.size.height - size.height) < 1e-6 &&
      Math.abs(p.size.depth - size.depth) < 1e-6,
  );
}

export const macMiniPresets: DevicePreset[] = [
  {
    id: 'm4',
    label: '2026 / M4 (127.2 mm)',
    size: { width: 0.1272, height: 0.0497, depth: 0.1271 },
  },
  { id: 'classic', label: '经典 (197 mm)', size: { width: 0.197, height: 0.036, depth: 0.197 } },
];

export function matchDevicePresetId(presets: DevicePreset[], size: Size): string | null {
  if (presets === macbookPresets && isMacbookPro14ProledSize(size)) return 'pro14';
  const match = presets.find(
    (p) =>
      Math.abs(p.size.width - size.width) < 0.002 && Math.abs(p.size.depth - size.depth) < 0.002,
  );
  return match?.id ?? null;
}

export const laptopStandModelSchema = z.enum(['curveFlex', 'mStand']);
export type LaptopStandModelId = z.infer<typeof laptopStandModelSchema>;

export const LAPTOP_STAND_PRESETS: Record<
  LaptopStandModelId,
  {
    id: LaptopStandModelId;
    label: string;
    size: Size;
    elevation: number;
    tiltDeg: number;
    note: string;
  }
> = {
  curveFlex: {
    id: 'curveFlex',
    label: 'Curve Flex (双铰链可调)',
    size: { width: 0.264, height: 0.14, depth: 0.224 },
    elevation: 0.14,
    tiltDeg: 18,
    note: 'Twelve South Curve Flex · 264 × 224 mm · 折叠 30 mm / 最高 274 mm · 底脚内距 185 mm · 倾角 0°–45°',
  },
  mStand: {
    id: 'mStand',
    label: 'Rain Design mStand (固定式)',
    size: { width: 0.253, height: 0.15, depth: 0.19 },
    elevation: 0.118,
    tiltDeg: 18,
    note: 'Rain Design mStand · 253 × 190 × 150 mm · 2.5 mm 一体铝合金 · 后部 Ø50.8 mm 理线孔',
  },
};

export const laptopStandSchema = z.object({
  model: laptopStandModelSchema.optional(),
  laptopId: z.string().min(1).max(100).optional(),
  mode: z.enum(['tilted', 'vertical']),
  tiltDeg: z.number().finite().min(0).max(45),
  elevation: z.number().finite().min(0.03).max(0.274),
});
export type LaptopStandSettings = z.infer<typeof laptopStandSchema>;

export function defaultLaptopStandSettings(laptopId?: string): LaptopStandSettings {
  return {
    model: 'curveFlex',
    ...(laptopId ? { laptopId } : {}),
    mode: 'tilted',
    tiltDeg: LAPTOP_STAND_PRESETS.curveFlex.tiltDeg,
    elevation: LAPTOP_STAND_PRESETS.curveFlex.elevation,
  };
}

export const DEFAULT_INVERTED_HEIGHT = 0.66;
export const DEFAULT_TRAY_ELEVATION = 0.24;
export const DEFAULT_TRAY_TILT_DEG = 20;

export const ARM_CLAMP_EDGES = ['back', 'left', 'right', 'surface'] as const;
export type ArmClampEdge = (typeof ARM_CLAMP_EDGES)[number];

export const monitorArmSchema = z.object({
  monitorId: z.string().min(1).max(100).optional(),
  clampSide: z.enum(['left', 'center', 'right']),
  clampX: z.number().finite().min(-3).max(3).optional(),
  clampZ: z.number().finite().min(-3).max(3).optional(),
  clampEdge: z.enum(ARM_CLAMP_EDGES).optional(),
  cableClip: z.boolean(),
  armStyle: z.enum(['single', 'dual']).optional(),
  mountOrientation: z.enum(['upright', 'inverted']).optional(),
  invertedHeight: z.number().finite().min(0.45).max(0.85).optional(),
  primaryKind: z.enum(['monitor', 'laptopTray']).optional(),
  primaryLaptopId: z.string().min(1).max(100).optional(),
  secondaryKind: z.enum(['none', 'monitor', 'laptopTray']).optional(),
  secondaryMonitorId: z.string().min(1).max(100).optional(),
  secondaryLaptopId: z.string().min(1).max(100).optional(),
  trayElevation: z.number().finite().min(0.06).max(0.68).optional(),
  trayTiltDeg: z.number().finite().min(0).max(45).optional(),
  primaryElbowBend: z.enum(['auto', 'left', 'right']).optional(),
  secondaryElbowBend: z.enum(['auto', 'left', 'right']).optional(),
  primaryLowerPitchDeg: z.number().finite().min(-75).max(75).optional(),
  secondaryLowerPitchDeg: z.number().finite().min(-75).max(75).optional(),
});
export type MonitorArmSettings = z.infer<typeof monitorArmSchema>;

export function defaultMonitorArmSettings(
  monitorId?: string,
  extra?: Partial<MonitorArmSettings>,
): MonitorArmSettings {
  return {
    ...(monitorId ? { monitorId } : {}),
    clampSide: 'center',
    cableClip: true,
    ...extra,
  };
}

export function armPrimaryMonitorId(arm?: MonitorArmSettings): string | undefined {
  if (!arm || arm.primaryKind === 'laptopTray') return undefined;
  return arm.monitorId;
}

export function armPrimaryLaptopId(arm?: MonitorArmSettings): string | undefined {
  if (!arm || arm.primaryKind !== 'laptopTray') return undefined;
  return arm.primaryLaptopId;
}

export function armSecondaryMonitorId(arm?: MonitorArmSettings): string | undefined {
  if (!arm || arm.armStyle !== 'dual' || arm.secondaryKind !== 'monitor') return undefined;
  return arm.secondaryMonitorId;
}

export function armSecondaryLaptopId(arm?: MonitorArmSettings): string | undefined {
  if (!arm || arm.armStyle !== 'dual' || arm.secondaryKind !== 'laptopTray') return undefined;
  return arm.secondaryLaptopId;
}

export function armMountedMonitorIds(arm?: MonitorArmSettings): string[] {
  const ids: string[] = [];
  const p = armPrimaryMonitorId(arm);
  const s = armSecondaryMonitorId(arm);
  if (p) ids.push(p);
  if (s) ids.push(s);
  return ids;
}

export function armMountedLaptopIds(arm?: MonitorArmSettings): string[] {
  const ids: string[] = [];
  const p = armPrimaryLaptopId(arm);
  const s = armSecondaryLaptopId(arm);
  if (p) ids.push(p);
  if (s) ids.push(s);
  return ids;
}

export function isMonitorMountedOnArm(
  monitorId: string,
  items: { kind: string; monitorArm?: MonitorArmSettings }[],
): boolean {
  return items.some(
    (item) =>
      item.kind === 'monitorArm' && armMountedMonitorIds(item.monitorArm).includes(monitorId),
  );
}

export function findArmForTrayLaptop<T extends { kind: string; monitorArm?: MonitorArmSettings }>(
  laptopId: string,
  items: T[],
): T | undefined {
  return items.find(
    (item) => item.kind === 'monitorArm' && armMountedLaptopIds(item.monitorArm).includes(laptopId),
  );
}

export function armTargetSummary(
  arm: MonitorArmSettings | undefined,
  items: { id: string; name: string }[],
): string {
  if (!arm) return '显示器支架臂';
  const nameOf = (id?: string) => items.find((i) => i.id === id)?.name;
  const parts: string[] = [];
  const pm = armPrimaryMonitorId(arm);
  const pl = armPrimaryLaptopId(arm);
  const sm = armSecondaryMonitorId(arm);
  const sl = armSecondaryLaptopId(arm);
  if (pm) parts.push(nameOf(pm) ?? '显示器');
  if (pl) parts.push(`${nameOf(pl) ?? '笔记本'}（托盘）`);
  if (sm) parts.push(nameOf(sm) ?? '副显示器');
  if (sl) parts.push(`${nameOf(sl) ?? '笔记本'}（托盘）`);
  const tags: string[] = [];
  if (arm.armStyle === 'dual') tags.push('双臂');
  if (arm.mountOrientation === 'inverted') tags.push('倒挂');
  const prefix = tags.length ? `${tags.join('·')} ` : '';
  return `${prefix}挂载 ${parts.join(' + ') || '未绑定'}`;
}

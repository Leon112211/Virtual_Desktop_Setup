import { z } from 'zod';
import type { Size } from './project';

// Real 16:9 monitor data aligned with Dell UltraSharp U2725QE official outline dimensions:
// 27" class head = 612.44 × 353.51 × 55.60 mm, viewable screen = 596.74 × 335.66 mm,
// side/top bezel = 7.85 mm, bottom bezel = 10.00 mm, base footprint = 272.80 × 189.00 mm.
export const MONITOR_BEZEL = 0.00785; // 7.85 mm left/right/top (Dell UltraSharp U2725QE Narrow Bezel)
export const DELL_BOTTOM_BEZEL = 0.01; // 10.00 mm nominal bottom bezel margin (Dell U2725QE)
export const STUDIO_DISPLAY_BEZEL = 0.0126; // 1.26 cm per side (Apple Studio Display 62.3 × 36.2 cm)
export const MIN_STAND = 0.02; // stand cannot collapse below 2 cm
// Screen pose limits, in the units the inspector edits them (degrees / metres).
export const MAX_PITCH = 45; // screen tilt up/down (±45°)
export const MAX_ROLL = 90; // screen pivot to portrait (±90°)
export const MAX_SCREEN_YAW = 30; // stock-stand screen swivel left/right (±30° without rotating stand base)
export const MIN_LIFT = -0.05; // Dell UltraSharp stock stand downward travel (-50 mm below nominal)
export const MAX_LIFT = 0.05; // Dell UltraSharp stock stand upward travel (+50 mm above nominal)
export const ARM_MIN_LIFT = -0.32; // downward vertical travel when both arm segments articulate low
export const ARM_MAX_LIFT = 0.36; // extended vertical travel when both lower + upper arm segments lift up
export const STUDIO_MAX_LIFT = 0.105; // Apple Studio Display height-adjustable stand travel (105 mm)
export const DELL_COLUMN_LEAN_RAD = -0.095; // ~5.4° rearward stand column inclination (-Z as Y rises)

export const monitorMoldSchema = z.enum(['dell', 'studioDisplay']);
export type MonitorMold = z.infer<typeof monitorMoldSchema>;

export const studioStandTypeSchema = z.enum(['tilt', 'height']);
export type StudioStandType = z.infer<typeof studioStandTypeSchema>;

export const monitorSettingsSchema = z.object({
  model: monitorMoldSchema,
  standType: studioStandTypeSchema.optional(),
  quickHubOpen: z.boolean().optional(),
});
export type MonitorSettings = z.infer<typeof monitorSettingsSchema>;

export type MonitorPresetId = '24' | '27' | '32';

export const monitorPresets: { id: MonitorPresetId; label: string; size: Size }[] = [
  { id: '24', label: '24 寸', size: { width: 0.539, height: 0.438, depth: 0.177 } },
  { id: '27', label: '27 寸', size: { width: 0.6124, height: 0.4857, depth: 0.189 } },
  { id: '32', label: '32 寸', size: { width: 0.7134, height: 0.5603, depth: 0.189 } },
];

export const STUDIO_DISPLAY_SILVER = '#dfe2e7';
export const STUDIO_DISPLAY_PRESETS: Record<
  StudioStandType,
  { label: string; shortLabel: string; weightKg: number; size: Size }
> = {
  tilt: {
    label: '可调倾角支架（官方标准）',
    shortLabel: '可调倾角支架',
    weightKg: 6.3,
    size: { width: 0.623, height: 0.478, depth: 0.168 },
  },
  height: {
    label: '可调倾角及高度支架（+10.5 cm 升降）',
    shortLabel: '倾角及高度支架',
    weightKg: 7.7,
    size: { width: 0.623, height: 0.479, depth: 0.207 },
  },
};

export interface MonitorParts {
  screenWidth: number;
  screenHeight: number;
  panelHeight: number;
  standHeight: number;
  bezelSide: number;
  bezelTop: number;
  bezelBottom: number;
  screenOffsetY: number;
}

export function monitorBezelForModel(model?: MonitorMold): number {
  return model === 'studioDisplay' ? STUDIO_DISPLAY_BEZEL : MONITOR_BEZEL;
}

function verticalBezels(model?: MonitorMold): { top: number; bottom: number; side: number } {
  if (model === 'studioDisplay') {
    return { top: STUDIO_DISPLAY_BEZEL, bottom: STUDIO_DISPLAY_BEZEL, side: STUDIO_DISPLAY_BEZEL };
  }
  return { top: MONITOR_BEZEL, bottom: DELL_BOTTOM_BEZEL, side: MONITOR_BEZEL };
}

// Split a stored monitor size into the pieces the renderer and inspector need.
// width = panel outer width; height = stand + panel; depth = base footprint.
export function monitorParts(size: Size, model?: MonitorMold): MonitorParts {
  const { top, bottom, side } = verticalBezels(model);
  const screenWidth = Math.max(0.001, size.width - side * 2);
  const screenHeight = (screenWidth * 9) / 16;
  const panelHeight = screenHeight + top + bottom;
  const standHeight = Math.max(MIN_STAND, size.height - panelHeight);
  return {
    screenWidth,
    screenHeight,
    panelHeight,
    standHeight,
    bezelSide: side,
    bezelTop: top,
    bezelBottom: bottom,
    screenOffsetY: (bottom - top) / 2,
  };
}

// Build a monitor size from the three editable controls, keeping the screen 16:9.
export function monitorSize(
  panelWidth: number,
  standHeight: number,
  depth: number,
  model?: MonitorMold,
): Size {
  const { top, bottom, side } = verticalBezels(model);
  const screenWidth = Math.max(0.001, panelWidth - side * 2);
  const panelHeight = (screenWidth * 9) / 16 + top + bottom;
  return { width: panelWidth, height: Math.max(MIN_STAND, standHeight) + panelHeight, depth };
}

// Diagonal of the viewable screen in inches.
export function screenInches(size: Size, model?: MonitorMold): number {
  const { screenWidth, screenHeight } = monitorParts(size, model);
  return (Math.hypot(screenWidth, screenHeight) * 100) / 2.54;
}

// A monitor's articulated screen pose. Pitch/roll/lift are monitor-only and are
// clamped here (the schema also bounds them) so the renderer and inspector can
// trust the values even when reading an untrusted project file.
export interface MonitorPose {
  pitchDeg: number; // tilt about the horizontal left–right axis
  screenYawDeg: number; // screen-only horizontal swivel about stand VESA joint (±30°)
  rollDeg: number; // pivot about the front–back axis (portrait)
  lift: number; // vertical screen travel from nominal rest, in metres
  pivotY: number; // screen pivot height above the desk, in metres
  pivotZOffset: number; // parallel horizontal slide offset along inclined stand column
  totalHeight: number; // whole monitor height including lift
}
export function monitorPose(
  size: Size,
  pose?: {
    pitch?: number;
    screenYaw?: number;
    roll?: number;
    lift?: number;
    monitor?: MonitorSettings;
    hasMonitorArm?: boolean;
  },
): MonitorPose {
  const isStudio = pose?.monitor?.model === 'studioDisplay';
  const { standHeight, panelHeight } = monitorParts(size, pose?.monitor?.model);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const minLift = pose?.hasMonitorArm ? ARM_MIN_LIFT : isStudio ? 0 : MIN_LIFT;
  const maxLift = pose?.hasMonitorArm
    ? ARM_MAX_LIFT
    : isStudio
      ? pose?.monitor?.standType === 'height'
        ? STUDIO_MAX_LIFT
        : 0
      : MAX_LIFT;
  const lift = clamp(pose?.lift ?? 0, minLift, maxLift);
  const minPitch = isStudio ? -5 : -MAX_PITCH;
  const maxPitch = isStudio ? 25 : MAX_PITCH;
  const pitchDeg = clamp(pose?.pitch ?? 0, minPitch, maxPitch);
  const screenYawDeg = pose?.hasMonitorArm
    ? 0
    : clamp(pose?.screenYaw ?? 0, -MAX_SCREEN_YAW, MAX_SCREEN_YAW);
  const rollDeg = clamp(pose?.roll ?? 0, -MAX_ROLL, MAX_ROLL);

  let pivotZOffset = 0;
  if (!pose?.hasMonitorArm) {
    if (!isStudio) {
      pivotZOffset = Math.tan(DELL_COLUMN_LEAN_RAD) * lift;
    } else if (pose?.monitor?.standType === 'height') {
      const tier = monitorBaseTier(size, pose?.monitor);
      const footCenterZ = -0.025;
      const armBottomZ = footCenterZ - tier.baseDepth * 0.34;
      const armTopZ = -0.044;
      const armBottomY = 0.004;
      const armFixedTopY = standHeight + panelHeight / 2 + STUDIO_MAX_LIFT + 0.016;
      const armDy = Math.max(0.05, armFixedTopY - armBottomY);
      pivotZOffset = ((armTopZ - armBottomZ) / armDy) * lift;
    }
  }

  return {
    pitchDeg,
    screenYawDeg,
    rollDeg,
    lift,
    pivotY: standHeight + lift,
    pivotZOffset,
    totalHeight: size.height + lift,
  };
}

export const DELL_PLATINUM_SILVER = '#c8cdd4';

export type MonitorBaseTier = {
  id: 'compact' | 'medium' | 'large';
  label: string;
  baseWidth: number;
  baseDepth: number;
  columnWidth: number;
};

/**
 * Segmented Dell UltraSharp stand base sizing (matching U2725QE 272.80 × 189.00 mm class):
 * - < 27"  : 25.0 × 17.7 cm (U2424H class)
 * - 27–32" : 27.3 × 18.9 cm (U2725QE 272.8 × 189.0 mm official footprint)
 * - > 32"  : 30.0 × 23.0 cm (U3223QE / 34"+ heavy base class)
 */
export function monitorBaseTier(size: Size, settings?: MonitorSettings): MonitorBaseTier {
  if (settings?.model === 'studioDisplay') {
    if (settings.standType === 'height') {
      return {
        id: 'medium',
        label: 'Apple 升降支架底座 (22.5 × 20.7 cm)',
        baseWidth: 0.225,
        baseDepth: 0.207,
        columnWidth: 0.11,
      };
    }
    return {
      id: 'compact',
      label: 'Apple 倾角支架底座 (22.0 × 16.8 cm)',
      baseWidth: 0.22,
      baseDepth: 0.168,
      columnWidth: 0.108,
    };
  }
  const inches = screenInches(size);
  if (inches < 26.8) {
    return {
      id: 'compact',
      label: '< 27 寸标准底座 (25.0 × 17.7 cm)',
      baseWidth: 0.25,
      baseDepth: 0.177,
      columnWidth: 0.048,
    };
  }
  if (inches <= 32.2) {
    return {
      id: 'medium',
      label: '27–32 寸标准底座 (27.3 × 18.9 cm)',
      baseWidth: 0.2728,
      baseDepth: 0.189,
      columnWidth: 0.054,
    };
  }
  return {
    id: 'large',
    label: '> 32 寸大号加重底座 (30.0 × 23.0 cm)',
    baseWidth: 0.3,
    baseDepth: 0.23,
    columnWidth: 0.058,
  };
}

// Which preset a size matches exactly, if any (used to highlight the buttons).
export function monitorPresetId(size: Size): MonitorPresetId | null {
  return (
    monitorPresets.find(
      ({ size: s }) =>
        Math.abs(s.width - size.width) < 1e-4 &&
        Math.abs(s.height - size.height) < 1e-4 &&
        Math.abs(s.depth - size.depth) < 1e-4,
    )?.id ?? null
  );
}

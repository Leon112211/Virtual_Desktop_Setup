import type { Size } from './project';

// Real 16:9 monitor data. The screen (viewable area) follows the industry's
// "24/27/32 寸" class naming — 23.8", 27" and 31.5" actual panels. The panel
// adds a thin bezel on each side; the stand keeps the screen's bottom clear of
// the desk and stays fixed when the screen size changes, like a real monitor.
export const MONITOR_BEZEL = 0.006; // 0.6 cm per side
export const MIN_STAND = 0.02; // stand cannot collapse below 2 cm

export type MonitorPresetId = '24' | '27' | '32';

export const monitorPresets: { id: MonitorPresetId; label: string; size: Size }[] = [
  { id: '24', label: '24 寸', size: { width: 0.539, height: 0.438, depth: 0.19 } },
  { id: '27', label: '27 寸', size: { width: 0.61, height: 0.488, depth: 0.22 } },
  { id: '32', label: '32 寸', size: { width: 0.709, height: 0.554, depth: 0.24 } },
];

export interface MonitorParts {
  screenWidth: number;
  screenHeight: number;
  panelHeight: number;
  standHeight: number;
}

// Split a stored monitor size into the pieces the renderer and inspector need.
// width = panel outer width; height = stand + panel; depth = base footprint.
export function monitorParts(size: Size): MonitorParts {
  const screenWidth = Math.max(0.001, size.width - MONITOR_BEZEL * 2);
  const screenHeight = (screenWidth * 9) / 16;
  const panelHeight = screenHeight + MONITOR_BEZEL * 2;
  const standHeight = Math.max(MIN_STAND, size.height - panelHeight);
  return { screenWidth, screenHeight, panelHeight, standHeight };
}

// Build a monitor size from the three editable controls, keeping the screen 16:9.
export function monitorSize(panelWidth: number, standHeight: number, depth: number): Size {
  const screenWidth = Math.max(0.001, panelWidth - MONITOR_BEZEL * 2);
  const panelHeight = (screenWidth * 9) / 16 + MONITOR_BEZEL * 2;
  return { width: panelWidth, height: Math.max(MIN_STAND, standHeight) + panelHeight, depth };
}

// Diagonal of the viewable screen in inches.
export function screenInches(size: Size): number {
  const { screenWidth, screenHeight } = monitorParts(size);
  return (Math.hypot(screenWidth, screenHeight) * 100) / 2.54;
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

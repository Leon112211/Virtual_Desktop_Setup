// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import type { Size } from './project';
import { tr } from '../i18n';

export const MOUSEPAD_MIN_WIDTH = 0.2;
export const MOUSEPAD_MAX_WIDTH = 1.6;
export const MOUSEPAD_MIN_DEPTH = 0.18;
export const MOUSEPAD_MAX_DEPTH = 0.8;
export const MOUSEPAD_MIN_THICKNESS = 0.002;
export const MOUSEPAD_MAX_THICKNESS = 0.006;

export const MOUSEPAD_DEFAULT_SIZE: Size = {
  width: 0.9,
  height: 0.004,
  depth: 0.4,
};

export const MOUSEPAD_THICKNESS_PRESETS = [
  {
    meters: 0.002,
    mm: 2,
    label: '2 mm',
    get hint() {
      return tr('硬朗竞速', 'Firm Speed');
    },
  },
  {
    meters: 0.003,
    mm: 3,
    label: '3 mm',
    get hint() {
      return tr('偏硬竞技', 'Medium-Firm');
    },
  },
  {
    meters: 0.004,
    mm: 4,
    label: '4 mm',
    get hint() {
      return tr('均衡主流', 'Balanced Standard');
    },
  },
  {
    meters: 0.005,
    mm: 5,
    label: '5 mm',
    get hint() {
      return tr('柔软舒适', 'Plush Control');
    },
  },
  {
    meters: 0.006,
    mm: 6,
    label: '6 mm',
    get hint() {
      return tr('加厚缓震', 'Extra Cushion');
    },
  },
] as const;

export const MOUSEPAD_SIZE_PRESETS: {
  id: string;
  label: string;
  width: number;
  depth: number;
}[] = [
  { id: '90x40', label: '90 × 40', width: 0.9, depth: 0.4 },
  { id: '80x30', label: '80 × 30', width: 0.8, depth: 0.3 },
  { id: '49x42', label: '49 × 42', width: 0.49, depth: 0.42 },
  { id: '45x40', label: '45 × 40', width: 0.45, depth: 0.4 },
  { id: '36x30', label: '36 × 30', width: 0.36, depth: 0.3 },
];

export const MOUSEPAD_COLOR_SWATCHES: { label: string; hex: string }[] = [
  { label: '极夜黑', hex: '#1f2228' },
  { label: '炭灰织布', hex: '#383e48' },
  { label: '奶白米杏', hex: '#e8e1d5' },
  { label: '雾霾蓝', hex: '#6f869d' },
  { label: '鼠尾草绿', hex: '#6e8475' },
  { label: '勃艮第红', hex: '#7c2f36' },
  { label: '落日橙', hex: '#c96a42' },
  { label: '樱花粉', hex: '#d9879c' },
];

export const mm = (meters: number) => Math.round(meters * 10000) / 10;
export const metersFromMm = (millimeters: number) => Math.round(millimeters * 10) / 10000;

export function isValidMousepadSize(size: Size): boolean {
  return (
    size.width >= MOUSEPAD_MIN_WIDTH - 1e-6 &&
    size.width <= MOUSEPAD_MAX_WIDTH + 1e-6 &&
    size.depth >= MOUSEPAD_MIN_DEPTH - 1e-6 &&
    size.depth <= MOUSEPAD_MAX_DEPTH + 1e-6 &&
    size.height >= MOUSEPAD_MIN_THICKNESS - 1e-6 &&
    size.height <= MOUSEPAD_MAX_THICKNESS + 1e-6
  );
}

export function matchMousepadSizePreset(size: Size): string | null {
  const hit = MOUSEPAD_SIZE_PRESETS.find(
    (p) => Math.abs(p.width - size.width) < 1e-4 && Math.abs(p.depth - size.depth) < 1e-4,
  );
  return hit ? hit.id : null;
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { z } from 'zod';
import type { Size } from './project';
import { tr } from '../i18n';

export const mouseSeriesSchema = z.preprocess(
  (val) => (val === 'wired' ? 'wired' : 'wireless'),
  z.enum(['wireless', 'wired']),
);
export type MouseSeries = z.infer<typeof mouseSeriesSchema>;

export const mouseModelIdSchema = z.preprocess(
  (val) => (val === 'classic-wired' ? 'classic-wired' : 'classic-wireless'),
  z.enum(['classic-wireless', 'classic-wired']),
);
export type MouseModelId = z.infer<typeof mouseModelIdSchema>;

export const mouseSettingsSchema = z.object({
  series: mouseSeriesSchema,
  modelId: mouseModelIdSchema,
});
export type MouseSettings = z.infer<typeof mouseSettingsSchema>;

export type MouseColorOption = {
  readonly label: string;
  hex: string;
};

export type MousePreset = {
  id: MouseModelId;
  series: MouseSeries;
  readonly seriesLabel: string;
  readonly label: string;
  readonly shortLabel: string;
  weightG: number;
  ergo: 'symmetrical';
  size: Size;
  colors: MouseColorOption[];
  readonly description: string;
};

const MOUSE_COLOR_LIST: MouseColorOption[] = [
  {
    get label() {
      return tr('曜石黑', 'Obsidian Black');
    },
    hex: '#1e2126',
  },
  {
    get label() {
      return tr('云朵白', 'Cloud White');
    },
    hex: '#f2f4f7',
  },
  {
    get label() {
      return tr('品红粉', 'Magenta Pink');
    },
    hex: '#ec4899',
  },
  {
    get label() {
      return tr('朱砂红', 'Crimson Red');
    },
    hex: '#c62828',
  },
];

export const MOUSE_PRESETS: MousePreset[] = [
  {
    id: 'classic-wireless',
    series: 'wireless',
    get seriesLabel() {
      return tr('无线款', 'Wireless');
    },
    get label() {
      return tr('经典无线鼠标（125 × 63.5 × 40 mm）', 'Wireless Mouse (125 × 63.5 × 40 mm)');
    },
    get shortLabel() {
      return tr('经典无线款', 'Wireless');
    },
    weightG: 60,
    ergo: 'symmetrical',
    size: { width: 0.0635, height: 0.04, depth: 0.125 },
    colors: MOUSE_COLOR_LIST,
    get description() {
      return tr(
        '125 × 63.5 × 40 mm 对称收腰模具 · U 型内嵌分体按键盖与双白边刻度滚轮',
        '125 × 63.5 × 40 mm symmetrical shell · U-inset split click plates & dual-rimmed wheel',
      );
    },
  },
  {
    id: 'classic-wired',
    series: 'wired',
    get seriesLabel() {
      return tr('有线款', 'Wired');
    },
    get label() {
      return tr('经典有线鼠标（超柔编织伞绳线）', 'Wired Mouse (Braided Paracord)');
    },
    get shortLabel() {
      return tr('经典有线款', 'Wired');
    },
    weightG: 65,
    ergo: 'symmetrical',
    size: { width: 0.0635, height: 0.04, depth: 0.125 },
    colors: MOUSE_COLOR_LIST,
    get description() {
      return tr(
        '125 × 63.5 × 40 mm 对称收腰模具 · 前端 6° 上扬防拉扯护套与超柔编织伞绳线',
        '125 × 63.5 × 40 mm symmetrical shell · 6° angled strain-relief boot & braided paracord',
      );
    },
  },
];

export const DEFAULT_MOUSE_MODEL_ID: MouseModelId = 'classic-wireless';

export function defaultMouseSettings(): MouseSettings {
  return { series: 'wireless', modelId: DEFAULT_MOUSE_MODEL_ID };
}

export function mousePresetById(id: MouseModelId): MousePreset {
  return MOUSE_PRESETS.find((p) => p.id === id) ?? MOUSE_PRESETS[0];
}

export function mousePresetsBySeries(series: MouseSeries): MousePreset[] {
  return MOUSE_PRESETS.filter((p) => p.series === series);
}

export function resolveMouseColor(preset: MousePreset, currentColor: string): string {
  const matched = preset.colors.find((c) => c.hex.toLowerCase() === currentColor.toLowerCase());
  return matched ? matched.hex : preset.colors[0].hex;
}

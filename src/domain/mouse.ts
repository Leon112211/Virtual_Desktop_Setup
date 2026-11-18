import { z } from 'zod';
import type { Size } from './project';

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
  label: string;
  hex: string;
};

export type MousePreset = {
  id: MouseModelId;
  series: MouseSeries;
  seriesLabel: string;
  label: string;
  shortLabel: string;
  weightG: number;
  ergo: 'symmetrical';
  size: Size;
  colors: MouseColorOption[];
  description: string;
};

export const MOUSE_PRESETS: MousePreset[] = [
  {
    id: 'classic-wireless',
    series: 'wireless',
    seriesLabel: '无线款',
    label: '经典无线鼠标（125 × 63.5 × 40 mm）',
    shortLabel: '经典无线款',
    weightG: 60,
    ergo: 'symmetrical',
    size: { width: 0.0635, height: 0.04, depth: 0.125 },
    colors: [
      { label: '曜石黑', hex: '#1e2126' },
      { label: '云朵白', hex: '#f2f4f7' },
      { label: '品红粉', hex: '#ec4899' },
      { label: '朱砂红', hex: '#c62828' },
    ],
    description: '125 × 63.5 × 40 mm 经典对称收腰万金油模具 · U 型内嵌分体按键盖与双白边刻度滚轮',
  },
  {
    id: 'classic-wired',
    series: 'wired',
    seriesLabel: '有线款',
    label: '经典有线鼠标（超柔编织伞绳线）',
    shortLabel: '经典有线款',
    weightG: 65,
    ergo: 'symmetrical',
    size: { width: 0.0635, height: 0.04, depth: 0.125 },
    colors: [
      { label: '曜石黑', hex: '#1e2126' },
      { label: '云朵白', hex: '#f2f4f7' },
      { label: '品红粉', hex: '#ec4899' },
      { label: '朱砂红', hex: '#c62828' },
    ],
    description: '125 × 63.5 × 40 mm 经典对称收腰模具 · 前端 6° 上扬防拉扯护套与超柔编织伞绳线',
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

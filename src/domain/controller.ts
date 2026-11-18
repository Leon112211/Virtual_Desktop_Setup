import { z } from 'zod';
import type { Size } from './project';

export const controllerModelSchema = z.enum(['ps5', 'xbox']);
export type ControllerModelId = z.infer<typeof controllerModelSchema>;

export const controllerSettingsSchema = z.object({
  model: controllerModelSchema,
});
export type ControllerSettings = z.infer<typeof controllerSettingsSchema>;

export type ControllerColorOption = {
  label: string;
  hex: string;
};

export type ControllerPreset = {
  id: ControllerModelId;
  label: string;
  shortLabel: string;
  weightG: number;
  size: Size;
  colors: ControllerColorOption[];
  description: string;
};

export const CONTROLLER_PRESETS: ControllerPreset[] = [
  {
    id: 'ps5',
    label: 'PS5 DualSense 无线手柄',
    shortLabel: 'PS5 DualSense',
    weightG: 280,
    size: { width: 0.16, height: 0.066, depth: 0.106 },
    colors: [
      { label: '经典白（双拼）', hex: '#eff2f6' },
      { label: '午夜黑', hex: '#1d2026' },
      { label: '星辰红', hex: '#9f2b36' },
      { label: '星光蓝', hex: '#608bc4' },
      { label: '银河紫', hex: '#6d5698' },
      { label: '30周年经典灰', hex: '#b8bcc4' },
    ],
    description: '对称双摇杆 · 发光触控板与黑白双拼流线握把',
  },
  {
    id: 'xbox',
    label: 'Xbox Series X|S 无线手柄',
    shortLabel: 'Xbox Series',
    weightG: 280,
    size: { width: 0.153, height: 0.061, depth: 0.102 },
    colors: [
      { label: '冰雪白', hex: '#f1f3f6' },
      { label: '磨砂黑', hex: '#1f2228' },
      { label: '波动蓝', hex: '#1f6fc9' },
      { label: '锦鲤红', hex: '#cc2936' },
      { label: '电光黄', hex: '#d2e628' },
      { label: '极光紫', hex: '#6d4798' },
    ],
    description: '非对称摇杆 · 八向混合十字圆盘与彩色 ABXY 按键',
  },
];

export function defaultControllerSettings(): ControllerSettings {
  return { model: 'ps5' };
}

export function controllerPresetById(id?: ControllerModelId): ControllerPreset {
  return CONTROLLER_PRESETS.find((p) => p.id === id) ?? CONTROLLER_PRESETS[0];
}

export function resolveControllerColor(preset: ControllerPreset, currentColor: string): string {
  const hit = preset.colors.find((c) => c.hex.toLowerCase() === currentColor.toLowerCase());
  return hit ? hit.hex : preset.colors[0].hex;
}

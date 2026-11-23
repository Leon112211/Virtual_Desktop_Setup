// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { z } from 'zod';
import type { Size } from './project';
import { tr } from '../i18n';

export const controllerModelSchema = z.enum(['ps5', 'xbox']);
export type ControllerModelId = z.infer<typeof controllerModelSchema>;

export const controllerSettingsSchema = z.object({
  model: controllerModelSchema,
});
export type ControllerSettings = z.infer<typeof controllerSettingsSchema>;

export type ControllerColorOption = {
  readonly label: string;
  hex: string;
};

export type ControllerPreset = {
  id: ControllerModelId;
  readonly label: string;
  readonly shortLabel: string;
  weightG: number;
  size: Size;
  colors: ControllerColorOption[];
  readonly description: string;
};

export const CONTROLLER_PRESETS: ControllerPreset[] = [
  {
    id: 'ps5',
    get label() {
      return tr('对称双摇杆无线手柄', 'Symmetrical Wireless Controller');
    },
    get shortLabel() {
      return tr('对称摇杆款', 'Symmetrical');
    },
    weightG: 280,
    size: { width: 0.16, height: 0.066, depth: 0.106 },
    colors: [
      {
        get label() {
          return tr('经典白（双拼）', 'Two-Tone White');
        },
        hex: '#eff2f6',
      },
      {
        get label() {
          return tr('午夜黑', 'Midnight Black');
        },
        hex: '#1d2026',
      },
      {
        get label() {
          return tr('星辰红', 'Crimson Red');
        },
        hex: '#9f2b36',
      },
      {
        get label() {
          return tr('星光蓝', 'Starlight Blue');
        },
        hex: '#608bc4',
      },
      {
        get label() {
          return tr('银河紫', 'Galactic Purple');
        },
        hex: '#6d5698',
      },
      {
        get label() {
          return tr('复古冷灰', 'Retro Gray');
        },
        hex: '#b8bcc4',
      },
    ],
    get description() {
      return tr(
        '对称双摇杆 · 发光触控板与双拼流线握把',
        'Symmetrical dual thumbsticks · Lightbar touchpad & contoured two-tone grips',
      );
    },
  },
  {
    id: 'xbox',
    get label() {
      return tr('非对称摇杆无线手柄', 'Asymmetric Wireless Controller');
    },
    get shortLabel() {
      return tr('非对称摇杆款', 'Asymmetric');
    },
    weightG: 280,
    size: { width: 0.153, height: 0.061, depth: 0.102 },
    colors: [
      {
        get label() {
          return tr('冰雪白', 'Frost White');
        },
        hex: '#f1f3f6',
      },
      {
        get label() {
          return tr('磨砂黑', 'Matte Black');
        },
        hex: '#1f2228',
      },
      {
        get label() {
          return tr('波动蓝', 'Shock Blue');
        },
        hex: '#1f6fc9',
      },
      {
        get label() {
          return tr('绯红', 'Pulse Red');
        },
        hex: '#cc2936',
      },
      {
        get label() {
          return tr('电光黄', 'Electric Volt');
        },
        hex: '#d2e628',
      },
      {
        get label() {
          return tr('极光紫', ' Astral Purple');
        },
        hex: '#6d4798',
      },
    ],
    get description() {
      return tr(
        '非对称摇杆 · 八向混合十字圆盘与彩色 ABXY 按键',
        'Asymmetric thumbsticks · Hybrid 8-way D-pad & color-coded ABXY buttons',
      );
    },
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

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { z } from 'zod';
import { tr } from '../i18n';

type CabinetSize = { width: number; height: number; depth: number };

export const speakerModelValues = ['kantoYu4', 'edifierMr4', 'audioengineA2'] as const;
export type SpeakerModelId = (typeof speakerModelValues)[number];

export const speakerRoleValues = ['active', 'passive', 'soloActive'] as const;
export type SpeakerRole = (typeof speakerRoleValues)[number];

export const speakerSettingsSchema = z.object({
  model: z.enum(speakerModelValues),
  role: z.enum(speakerRoleValues),
});
export type SpeakerSettings = z.infer<typeof speakerSettingsSchema>;

export function defaultSpeakerSettings(role: SpeakerRole = 'active'): SpeakerSettings {
  return {
    model: 'kantoYu4',
    role,
  };
}

export type SpeakerPresetSpec = {
  id: SpeakerModelId;
  readonly label: string;
  readonly brandModel: string;
  readonly summary: string;
  size: CabinetSize;
  readonly drivers: string;
  freqResponse: string;
  readonly powerSpec: string;
  hasUsbC: boolean;
  hasOptical: boolean;
  hasTrs635: boolean;
  hasRca: boolean;
  hasAux35: boolean;
  auxOnFront: boolean;
};

/** Desktop active bookshelf & studio monitor specifications (de-branded). */
export const SPEAKER_PRESETS: readonly SpeakerPresetSpec[] = [
  {
    id: 'kantoYu4',
    get label() {
      return tr('4" 全接口书架箱', '4" Full-I/O Bookshelf');
    },
    get brandModel() {
      return tr('4 寸全接口桌面有源 Hi-Fi 对箱', '4" Full-Interface Active Desktop Bookshelf Pair');
    },
    get summary() {
      return tr(
        '140 × 220 × 190 mm · 140W 峰值 · RCA / 光纤 / 3.5mm AUX / USB-C / 16AWG 主副线',
        '140 × 220 × 190 mm · 140W Peak · RCA / Optical / 3.5mm AUX / USB-C / 16AWG Speaker Wire',
      );
    },
    size: { width: 0.14, height: 0.22, depth: 0.19 },
    get drivers() {
      return tr('4" 复合编织低音 + 1" 丝膜球顶高音', '4" Woven Woofer + 1" Silk Dome Tweeter');
    },
    freqResponse: '60 Hz – 20 kHz',
    get powerSpec() {
      return tr('70W RMS（AC 分离式电源）', '70W RMS (Detachable AC Power)');
    },
    hasUsbC: true,
    hasOptical: true,
    hasTrs635: false,
    hasRca: true,
    hasAux35: true,
    auxOnFront: false,
  },
  {
    id: 'edifierMr4',
    get label() {
      return tr('4" 平衡监听箱', '4" Balanced Monitor');
    },
    get brandModel() {
      return tr('4 寸双模专业近场监听音箱', '4" Dual-Mode Nearfield Studio Monitor');
    },
    get summary() {
      return tr(
        '140 × 228 × 197.5 mm · 42W RMS · 6.35mm TRS 平衡 + RCA + 前置 3.5mm AUX + 主副夹线',
        '140 × 228 × 197.5 mm · 42W RMS · 6.35mm TRS Balanced + RCA + Front 3.5mm AUX',
      );
    },
    size: { width: 0.14, height: 0.228, depth: 0.1975 },
    get drivers() {
      return tr('4" 云母振膜低音 + 1" 丝膜高音', '4" Mica Cone Woofer + 1" Silk Tweeter');
    },
    freqResponse: '60 Hz – 20 kHz',
    get powerSpec() {
      return tr('21W + 21W RMS（内置 AC 电源）', '21W + 21W RMS (Internal AC Power)');
    },
    hasUsbC: false,
    hasOptical: false,
    hasTrs635: true,
    hasRca: true,
    hasAux35: true,
    auxOnFront: true,
  },
  {
    id: 'audioengineA2',
    get label() {
      return tr('3" 紧凑桌面箱', '3" Compact Desktop');
    },
    get brandModel() {
      return tr('紧凑级桌面有源微箱对箱', 'Compact Desktop Active Micro-Monitors');
    },
    get summary() {
      return tr(
        '102 × 152 × 133 mm · 60W 峰值 · 内置 USB-C DAC + RCA + 3.5mm AUX + 18AWG 主副线',
        '102 × 152 × 133 mm · 60W Peak · USB-C DAC + RCA + 3.5mm AUX + 18AWG Speaker Wire',
      );
    },
    size: { width: 0.102, height: 0.152, depth: 0.133 },
    get drivers() {
      return tr(
        '2.75" 芳纶纤维低音 + 0.75" 丝膜高音',
        '2.75" Aramid Fiber Woofer + 0.75" Silk Tweeter',
      );
    },
    freqResponse: '65 Hz – 22 kHz',
    get powerSpec() {
      return tr('30W RMS（DC 24V 外置电源）', '30W RMS (External DC 24V Power)');
    },
    hasUsbC: true,
    hasOptical: false,
    hasTrs635: false,
    hasRca: true,
    hasAux35: true,
    auxOnFront: false,
  },
];

export const SPEAKER_ROLE_LABELS: Record<
  SpeakerRole,
  { readonly label: string; readonly note: string }
> = {
  active: {
    get label() {
      return tr('有源主箱 (Active)', 'Active Master');
    },
    get note() {
      return tr(
        '内置功放：承载电源线、音源输入口，并输出主副箱音箱连接线给无源副箱。',
        'Built-in amplifier: connects to power & audio inputs, and drives the passive speaker via speaker wire.',
      );
    },
  },
  passive: {
    get label() {
      return tr('无源副箱 (Passive)', 'Passive Companion');
    },
    get note() {
      return tr(
        '仅需通过背面红黑接线柱接入 1 条「主副箱音箱连接线」，无需单独插电或接音源。',
        'Connects only via rear binding posts to the active speaker; requires no separate AC cord or audio input.',
      );
    },
  },
  soloActive: {
    get label() {
      return tr('独立有源 (Solo)', 'Solo Active');
    },
    get note() {
      return tr(
        '独立功放架构：单只独立插电并各自接收音频信号，无需主副箱互联线。',
        'Independent active architecture: each monitor takes its own power and audio signal directly.',
      );
    },
  },
};

export const SPEAKER_COLORS = [
  {
    hex: '#e3d5bf',
    get label() {
      return tr('经典暖米', 'Warm Cream');
    },
  },
  {
    hex: '#edf0f3',
    get label() {
      return tr('哑光雪白', 'Matte White');
    },
  },
  {
    hex: '#22262e',
    get label() {
      return tr('监听炭黑', 'Studio Charcoal');
    },
  },
  {
    hex: '#b5895e',
    get label() {
      return tr('胡桃原木', 'Walnut Wood');
    },
  },
] as const;

export function speakerPresetById(id: SpeakerModelId): SpeakerPresetSpec {
  return SPEAKER_PRESETS.find((p) => p.id === id) ?? SPEAKER_PRESETS[0];
}

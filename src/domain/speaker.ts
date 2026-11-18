import { z } from 'zod';

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
  label: string;
  brandModel: string;
  summary: string;
  size: CabinetSize;
  drivers: string;
  freqResponse: string;
  powerSpec: string;
  hasUsbC: boolean;
  hasOptical: boolean;
  hasTrs635: boolean;
  hasRca: boolean;
  hasAux35: boolean;
  auxOnFront: boolean;
};

/** Real-world desktop active bookshelf / studio monitor benchmarks. */
export const SPEAKER_PRESETS: readonly SpeakerPresetSpec[] = [
  {
    id: 'kantoYu4',
    label: 'Kanto YU4 (全能桌面)',
    brandModel: 'Kanto YU4 · 全接口桌面有源 Hi-Fi 对箱',
    summary: '140 × 220 × 190 mm · 140W 峰值 · RCA / 双路光线 / 3.5mm AUX / USB-C / 16AWG 主副线',
    size: { width: 0.14, height: 0.22, depth: 0.19 },
    drivers: '4" 凯夫拉低音 + 1" 丝膜球顶高音',
    freqResponse: '60 Hz – 20 kHz',
    powerSpec: '70W RMS（AC 分离式电源）',
    hasUsbC: true,
    hasOptical: true,
    hasTrs635: false,
    hasRca: true,
    hasAux35: true,
    auxOnFront: false,
  },
  {
    id: 'edifierMr4',
    label: 'Edifier MR4 (平衡监听)',
    brandModel: '漫步者 Edifier MR4 · 桌面双模专业监听音箱',
    summary: '140 × 228 × 197.5 mm · 42W RMS · 6.35mm TRS 平衡 + RCA + 前置 3.5mm AUX + 主副夹线',
    size: { width: 0.14, height: 0.228, depth: 0.1975 },
    drivers: '4" 聚丙烯云母低音 + 1" 丝膜高音',
    freqResponse: '60 Hz – 20 kHz',
    powerSpec: '21W + 21W RMS（内置 AC 电源）',
    hasUsbC: false,
    hasOptical: false,
    hasTrs635: true,
    hasRca: true,
    hasAux35: true,
    auxOnFront: true,
  },
  {
    id: 'audioengineA2',
    label: 'Audioengine A2+ (紧凑)',
    brandModel: 'Audioengine A2+ Wireless · 紧凑级桌面 Hi-Fi 标杆',
    summary: '102 × 152 × 133 mm · 60W 峰值 · 内置 USB-C DAC + RCA + 3.5mm AUX + 18AWG 主副线',
    size: { width: 0.102, height: 0.152, depth: 0.133 },
    drivers: '2.75" 芳纶纤维低音 + 0.75" 丝膜高音',
    freqResponse: '65 Hz – 22 kHz',
    powerSpec: '30W RMS（DC 24V 外置电源）',
    hasUsbC: true,
    hasOptical: false,
    hasTrs635: false,
    hasRca: true,
    hasAux35: true,
    auxOnFront: false,
  },
];

export const SPEAKER_ROLE_LABELS: Record<SpeakerRole, { label: string; note: string }> = {
  active: {
    label: '有源主箱 (Active)',
    note: '内置功放：承载电源线、音源输入口，并输出主副箱音箱连接线给无源副箱。',
  },
  passive: {
    label: '无源副箱 (Passive)',
    note: '仅需通过背面红黑接线柱接入 1 条「主副箱音箱连接线」，无需单独插电或接音源。',
  },
  soloActive: {
    label: '独立有源 (Solo)',
    note: '参考 Genelec G One 独立架构：单只独立插电并各自接收音频信号，无需主副箱互联线。',
  },
};

export const SPEAKER_COLORS = [
  { hex: '#e3d5bf', label: '经典暖米' },
  { hex: '#edf0f3', label: '哑光雪白' },
  { hex: '#22262e', label: '监听炭黑' },
  { hex: '#b5895e', label: '胡桃原木' },
] as const;

export function speakerPresetById(id: SpeakerModelId): SpeakerPresetSpec {
  return SPEAKER_PRESETS.find((p) => p.id === id) ?? SPEAKER_PRESETS[0];
}

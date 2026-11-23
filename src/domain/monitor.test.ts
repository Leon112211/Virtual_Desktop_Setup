// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { describe, it, expect } from 'vitest';
import {
  ARM_MAX_LIFT,
  DELL_COLUMN_LEAN_RAD,
  MAX_LIFT,
  MAX_PITCH,
  MAX_ROLL,
  MIN_LIFT,
  MIN_STAND,
  monitorBaseTier,
  monitorParts,
  monitorPose,
  monitorPresetId,
  monitorPresets,
  monitorSize,
  screenInches,
  STUDIO_DISPLAY_PRESETS,
  STUDIO_MAX_LIFT,
} from './monitor';

describe('显示器尺寸', () => {
  it('预设屏幕保持 16:9，默认 27 寸 1:1 对齐 Dell U2725QE 外观规格', () => {
    const cases: [string, number, number, number][] = [
      ['24', 0.5233, 0.2944, 24],
      ['27', 0.5967, 0.3357, 27],
      ['32', 0.6977, 0.3925, 31.5],
    ];
    for (const [id, w, h, inch] of cases) {
      const preset = monitorPresets.find((p) => p.id === id)!;
      const parts = monitorParts(preset.size);
      expect(parts.screenWidth / parts.screenHeight).toBeCloseTo(16 / 9, 3);
      expect(parts.screenWidth).toBeCloseTo(w, 3);
      expect(parts.screenHeight).toBeCloseTo(h, 3);
      expect(screenInches(preset.size)).toBeCloseTo(inch, 0);
    }

    const u2725qe = monitorParts(monitorPresets.find((p) => p.id === '27')!.size);
    expect(u2725qe.panelHeight).toBeCloseTo(0.3535, 3);
    expect(u2725qe.bezelSide).toBeCloseTo(0.00785, 5);
    expect(u2725qe.bezelBottom).toBeCloseTo(0.01, 5);
  });

  it('调宽面板时支架高度保持不变，屏幕仍 16:9', () => {
    const preset = monitorPresets.find((p) => p.id === '27')!;
    const { standHeight } = monitorParts(preset.size);
    const wider = monitorSize(preset.size.width + 0.05, standHeight, preset.size.depth);
    expect(monitorParts(wider).standHeight).toBeCloseTo(standHeight, 3);
    expect(wider.height).toBeGreaterThan(preset.size.height);
    expect(monitorParts(wider).screenWidth / monitorParts(wider).screenHeight).toBeCloseTo(
      16 / 9,
      3,
    );
  });

  it('支架高度不会低于下限，分解与构造保持一致', () => {
    const size = monitorSize(0.61, 0.005, 0.22);
    const parts = monitorParts(size);
    expect(parts.standHeight).toBeCloseTo(MIN_STAND, 3);
    expect(parts.screenWidth).toBeGreaterThan(0);
    const rebuilt = monitorSize(size.width, parts.standHeight, size.depth);
    expect(monitorParts(rebuilt).standHeight).toBeCloseTo(MIN_STAND, 3);
  });

  it('预设可被识别，微调后不再匹配', () => {
    const preset = monitorPresets.find((p) => p.id === '24')!;
    expect(monitorPresetId(preset.size)).toBe('24');
    expect(monitorPresetId({ ...preset.size, width: preset.size.width + 0.01 })).toBeNull();
  });
});

describe('屏幕姿态', () => {
  const size = monitorPresets.find((p) => p.id === '27')!.size;

  it('未设置姿态时保持默认（不倾斜、不升高）', () => {
    const pose = monitorPose(size);
    expect(pose.pitchDeg).toBe(0);
    expect(pose.rollDeg).toBe(0);
    expect(pose.lift).toBe(0);
    expect(pose.pivotY).toBeCloseTo(monitorParts(size).standHeight, 3);
    expect(pose.totalHeight).toBeCloseTo(size.height, 3);
  });

  it('升降沿立柱倾角平行移动枢轴高度与前后偏移，屏幕本身尺寸不变', () => {
    const lift = 0.04;
    const pose = monitorPose(size, { lift });
    expect(pose.lift).toBeCloseTo(lift, 3);
    expect(pose.pivotY).toBeCloseTo(monitorParts(size).standHeight + lift, 3);
    expect(pose.pivotZOffset).toBeCloseTo(Math.tan(DELL_COLUMN_LEAN_RAD) * lift, 5);
    expect(pose.totalHeight).toBeCloseTo(size.height + lift, 3);

    const lower = monitorPose(size, { lift: -0.05 });
    expect(lower.lift).toBeCloseTo(-0.05, 4);
    expect(lower.pivotZOffset).toBeGreaterThan(0);
  });

  it('超出范围的角度与升降被钳制到边界', () => {
    const pose = monitorPose(size, { pitch: 90, roll: -180, lift: 1 });
    expect(pose.pitchDeg).toBe(MAX_PITCH);
    expect(pose.rollDeg).toBe(-MAX_ROLL);
    expect(pose.lift).toBe(MAX_LIFT);
    expect(MAX_LIFT).toBe(0.05);
    expect(MIN_LIFT).toBe(-0.05);
    expect(monitorPose(size, { lift: 1, hasMonitorArm: true }).lift).toBe(ARM_MAX_LIFT);
    const clamped = monitorPose(size, { pitch: -90, roll: 180, lift: -0.5 });
    expect(clamped.pitchDeg).toBe(-MAX_PITCH);
    expect(clamped.rollDeg).toBe(MAX_ROLL);
    expect(clamped.lift).toBe(MIN_LIFT);
  });

  it('原装底座按 27 寸以下 / 27-32 寸 / 超 32 寸分段定尺，不随线性微调改变', () => {
    // 1. < 27 寸区间：从 21.5 寸线性增大到 25.5 寸，底座固定为紧凑款 (25.0 × 17.7 cm)
    const small22 = monitorBaseTier(monitorSize(0.49, 0.14, 0.2));
    const small24 = monitorBaseTier(monitorPresets.find((p) => p.id === '24')!.size);
    const small26 = monitorBaseTier(monitorSize(0.58, 0.14, 0.2));
    expect(small22).toEqual(small24);
    expect(small26).toEqual(small24);
    expect(small24.id).toBe('compact');
    expect(small24.baseWidth).toBe(0.25);
    expect(small24.baseDepth).toBe(0.177);

    // 2. 跨过 27 寸临界点 -> 27–32 寸标准底座 (27.3 × 18.9 cm)，期间线性增大底座仍恒定
    const med27 = monitorBaseTier(monitorPresets.find((p) => p.id === '27')!.size);
    const med30 = monitorBaseTier(monitorSize(0.67, 0.14, 0.22));
    const med32 = monitorBaseTier(monitorPresets.find((p) => p.id === '32')!.size);
    expect(med27.id).toBe('medium');
    expect(med27).toEqual(med30);
    expect(med32).toEqual(med27);
    expect(med27.baseWidth).toBe(0.2728);
    expect(med27.baseDepth).toBe(0.189);

    // 3. 线性增大超过 32 寸临界点（如 34 寸+，面板宽 78 cm）-> 自动升级到大一号底座 (30.0 × 23.0 cm)
    const large34 = monitorBaseTier(monitorSize(0.78, 0.14, 0.24));
    expect(large34.id).toBe('large');
    expect(large34.baseWidth).toBe(0.3);
    expect(large34.baseDepth).toBe(0.23);
  });

  it('Apple Studio Display 1:1 官方尺寸、27 寸 5K 面板比例及可调倾角/升降支架校验', () => {
    const tiltSpec = STUDIO_DISPLAY_PRESETS.tilt;
    const heightSpec = STUDIO_DISPLAY_PRESETS.height;
    expect(tiltSpec.size).toEqual({ width: 0.623, height: 0.478, depth: 0.168 });
    expect(heightSpec.size).toEqual({ width: 0.623, height: 0.479, depth: 0.207 });

    const parts = monitorParts(tiltSpec.size, 'studioDisplay');
    expect(parts.panelHeight).toBeCloseTo(0.362, 2);
    expect(parts.screenWidth / parts.screenHeight).toBeCloseTo(16 / 9, 3);
    expect(screenInches(tiltSpec.size, 'studioDisplay')).toBeCloseTo(27, 1);

    // 标准倾角支架不可升降，倾角钳制到 -5°..+25°
    const tiltPose = monitorPose(tiltSpec.size, {
      pitch: 40,
      lift: 0.1,
      monitor: { model: 'studioDisplay', standType: 'tilt' },
    });
    expect(tiltPose.pitchDeg).toBe(25);
    expect(tiltPose.lift).toBe(0);

    // 高度可调支架支持 0..10.5 cm 升降行程与对应脚板尺寸
    const heightPose = monitorPose(heightSpec.size, {
      pitch: -20,
      lift: 0.2,
      monitor: { model: 'studioDisplay', standType: 'height' },
    });
    expect(heightPose.pitchDeg).toBe(-5);
    expect(heightPose.lift).toBe(STUDIO_MAX_LIFT);
    expect(
      monitorBaseTier(heightSpec.size, { model: 'studioDisplay', standType: 'height' }).baseDepth,
    ).toBe(0.207);
  });
});

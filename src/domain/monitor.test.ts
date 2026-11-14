import { describe, it, expect } from 'vitest';
import {
  MAX_LIFT,
  MAX_PITCH,
  MAX_ROLL,
  MIN_STAND,
  monitorParts,
  monitorPose,
  monitorPresetId,
  monitorPresets,
  monitorSize,
  screenInches,
} from './monitor';

describe('显示器尺寸', () => {
  it('预设屏幕保持 16:9，对角线接近 24/27/32 寸', () => {
    const cases: [string, number, number, number][] = [
      ['24', 0.527, 0.2964, 24],
      ['27', 0.598, 0.3364, 27],
      ['32', 0.697, 0.3921, 31.5],
    ];
    for (const [id, w, h, inch] of cases) {
      const preset = monitorPresets.find((p) => p.id === id)!;
      const { screenWidth, screenHeight } = monitorParts(preset.size);
      expect(screenWidth / screenHeight).toBeCloseTo(16 / 9, 3);
      expect(screenWidth).toBeCloseTo(w, 2);
      expect(screenHeight).toBeCloseTo(h, 2);
      expect(screenInches(preset.size)).toBeCloseTo(inch, 0);
    }
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

  it('升降抬高枢轴与总高度，屏幕本身尺寸不变', () => {
    const lift = 0.1;
    const pose = monitorPose(size, { lift });
    expect(pose.lift).toBeCloseTo(lift, 3);
    expect(pose.pivotY).toBeCloseTo(monitorParts(size).standHeight + lift, 3);
    expect(pose.totalHeight).toBeCloseTo(size.height + lift, 3);
  });

  it('超出范围的角度与升降被钳制到边界', () => {
    const pose = monitorPose(size, { pitch: 90, roll: -180, lift: 1 });
    expect(pose.pitchDeg).toBe(MAX_PITCH);
    expect(pose.rollDeg).toBe(-MAX_ROLL);
    expect(pose.lift).toBe(MAX_LIFT);
    const clamped = monitorPose(size, { pitch: -90, roll: 180, lift: -0.5 });
    expect(clamped.pitchDeg).toBe(-MAX_PITCH);
    expect(clamped.rollDeg).toBe(MAX_ROLL);
    expect(clamped.lift).toBe(0);
  });
});

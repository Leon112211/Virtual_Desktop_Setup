import { describe, it, expect } from 'vitest';
import {
  MIN_STAND,
  monitorParts,
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

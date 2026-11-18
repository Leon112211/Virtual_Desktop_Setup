import { describe, it, expect } from 'vitest';
import { PEGBOARD, pegboardHoles } from './pegboard';
import { cm } from './project';

function minGap(points: [number, number][]) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      min = Math.min(min, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
  return min;
}

describe('洞洞板孔洞', () => {
  it('孔径、孔距与边距都是 SKÅDIS 的实物尺寸', () => {
    expect(cm(PEGBOARD.holeWidth)).toBe(0.5);
    expect(cm(PEGBOARD.holeHeight)).toBe(1.5);
    expect(cm(PEGBOARD.pitch)).toBe(4);
    expect(cm(PEGBOARD.margin)).toBe(2);
    expect(cm(PEGBOARD.cornerRadius)).toBe(0.8);
    expect(cm(PEGBOARD.thickness)).toBe(0.5);
  });
  it('两组 40 mm 网格交错，最近斜向孔距为 20√2 mm', () => {
    const holes = pegboardHoles(0.4, 0.32);
    expect(holes.length).toBeGreaterThan(50);
    expect(minGap(holes)).toBeCloseTo(Math.hypot(0.02, 0.02), 6);
  });
  it('板子变大只增加孔数，孔距和到边的留白保持不变', () => {
    for (const [width, height] of [
      [0.4, 0.32],
      [0.9, 0.75],
    ] as const) {
      const holes = pegboardHoles(width, height);
      for (const [x, y] of holes) {
        expect(Math.abs(x)).toBeLessThanOrEqual(width / 2 - PEGBOARD.margin + 1e-9);
        expect(y).toBeGreaterThanOrEqual(PEGBOARD.margin - 1e-9);
        expect(y).toBeLessThanOrEqual(height - PEGBOARD.margin + 1e-9);
      }
      // 孔距是真实尺寸，与板子大小无关。
      expect(minGap(holes)).toBeCloseTo(Math.hypot(0.02, 0.02), 6);
    }
    expect(pegboardHoles(0.8, 0.7).length).toBeGreaterThan(pegboardHoles(0.4, 0.35).length * 3);
  });
  it('放不下一排孔时返回空集', () => {
    expect(pegboardHoles(0.03, 0.35)).toEqual([]);
    expect(pegboardHoles(0.4, 0.03)).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { defaultProject, makeItem } from './catalog';
import {
  deskArea,
  deskBackWallBounds,
  deskBounds,
  deskCentroid,
  deskOutline,
  deskSupportRects,
  PEGBOARD_WALL_STANDOFF,
  returnWidthMax,
  setDeskShape,
  setDeskWidth,
  WALL_DEFAULT_GAP,
  WALL_DEFAULT_HEIGHT,
} from './desk';
import { PEGBOARD } from './pegboard';
import { isOutOfBounds } from './placement';
import { resolveItemTransform } from './ports';
import { projectSchema } from './project';
import { useEditor } from '../store/editorStore';

describe('L 形桌型领域与校验', () => {
  it('矩形缺省不注入 return 字段，旧工程可精确往返', () => {
    const project = defaultProject();
    expect('return' in project.desk).toBe(false);
    const parsed = projectSchema.parse(project);
    expect('return' in parsed.desk).toBe(false);
    expect(parsed).toEqual(project);
  });

  it('左右 L 形轮廓镜像对称、面积、加权中心与包围范围一致', () => {
    const leftDesk = {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      color: '#c99e70',
      return: { side: 'left' as const, width: 0.6, extension: 0.8 },
    };
    const rightDesk = {
      ...leftDesk,
      return: { side: 'right' as const, width: 0.6, extension: 0.8 },
    };

    expect(deskArea(leftDesk)).toBeCloseTo(1.4 * 0.7 + 0.6 * 0.8, 10);
    expect(deskArea(rightDesk)).toBeCloseTo(deskArea(leftDesk), 10);

    expect(deskBounds(leftDesk)).toEqual({
      minX: -0.7,
      maxX: 0.7,
      minZ: -0.35,
      maxZ: 1.15,
    });
    expect(deskBounds(rightDesk)).toEqual(deskBounds(leftDesk));

    const lc = deskCentroid(leftDesk);
    const rc = deskCentroid(rightDesk);
    expect(lc.x).toBeLessThan(0);
    expect(rc.x).toBeCloseTo(-lc.x, 10);
    expect(lc.z).toBeCloseTo(rc.z, 10);
    expect(lc.z).toBeGreaterThan(0);

    const lo = deskOutline(leftDesk);
    const ro = deskOutline(rightDesk);
    expect(lo).toHaveLength(6);
    expect(ro).toHaveLength(6);
    const roMirrored = lo.map((p) => ({ x: -p.x, z: p.z }));
    expect(new Set(ro.map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`))).toEqual(
      new Set(roMirrored.map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`)),
    );

    const [main, wing] = deskSupportRects(leftDesk);
    expect(main.maxZ).toBe(wing.minZ);
  });

  it('校验侧翼尺寸边界、NaN、不完整 return 及跨字段非法组合', () => {
    expect(returnWidthMax(0.6)).toBe(0.3);
    expect(returnWidthMax(1.4)).toBe(1.1);
    expect(returnWidthMax(3.0)).toBe(1.2);

    const base = defaultProject();
    // 合法边界值：主桌 60 cm 时侧翼宽 30 cm
    base.desk.width = 0.6;
    base.desk.return = { side: 'left', width: 0.3, extension: 0.3 };
    expect(projectSchema.safeParse(base).success).toBe(true);

    // 跨字段非法：主桌 60 cm 时侧翼 35 cm（不足 30 cm 缺口）
    base.desk.return = { side: 'left', width: 0.35, extension: 0.6 };
    expect(projectSchema.safeParse(base).success).toBe(false);

    // 侧翼超限、NaN、不完整对象
    base.desk.width = 2.0;
    base.desk.return = { side: 'right', width: 1.25, extension: 0.6 };
    expect(projectSchema.safeParse(base).success).toBe(false);

    base.desk.return = { side: 'right', width: 0.6, extension: 2.05 };
    expect(projectSchema.safeParse(base).success).toBe(false);

    base.desk.return = { side: 'right', width: Number.NaN, extension: 0.6 };
    expect(projectSchema.safeParse(base).success).toBe(false);

    (base.desk as { return: unknown }).return = { side: 'left', width: 0.6 };
    expect(projectSchema.safeParse(base).success).toBe(false);
  });
});

describe('L 形凹面越界判断', () => {
  const leftDesk = {
    width: 1.4,
    depth: 0.7,
    height: 0.75,
    thickness: 0.03,
    color: '#c99e70',
    return: { side: 'left' as const, width: 0.6, extension: 0.6 },
  };
  // 主桌 X=[-0.7, 0.7] Z=[-0.35, 0.35]
  // 左侧翼 X=[-0.7, -0.1] Z=[0.35, 0.95]
  // 内凹缺口 X=(-0.1, 0.7] Z=(0.35, 0.95]

  it('主桌、侧翼与跨接缝完全受支撑物品不越界', () => {
    const onMain = makeItem('keyboard');
    onMain.x = 0.2;
    onMain.z = 0;
    expect(isOutOfBounds(onMain, leftDesk)).toBe(false);

    const onWing = makeItem('keyboard');
    onWing.x = -0.4;
    onWing.z = 0.65;
    expect(isOutOfBounds(onWing, leftDesk)).toBe(false);

    // 跨越主桌与侧翼交接线 z = 0.35，完全落在 x ∈ [-0.7, -0.1] 内
    const acrossSeam = makeItem('keyboard');
    acrossSeam.size = { width: 0.4, height: 0.03, depth: 0.3 };
    acrossSeam.x = -0.4;
    acrossSeam.z = 0.35;
    acrossSeam.rotation = 0;
    expect(isOutOfBounds(acrossSeam, leftDesk)).toBe(false);
  });

  it('识别内凹缺口、外边界及“四角都在桌上但边与内部横跨缺口”的旋转物品', () => {
    // 完全落入内凹缺口
    const inNotch = makeItem('speaker');
    inNotch.x = 0.3;
    inNotch.z = 0.65;
    expect(isOutOfBounds(inNotch, leftDesk)).toBe(true);

    // 侧翼外边缘越界
    const outsideWing = makeItem('speaker');
    outsideWing.x = -0.4;
    outsideWing.z = 0.92;
    expect(isOutOfBounds(outsideWing, leftDesk)).toBe(true);

    // 四角都在主桌/侧翼内，但斜边横跨内凹缺口 (-0.1, 0.35)
    // 中心放在 (-0.06, 0.39) 附近、尺寸 0.4 × 0.08、旋转 45°：
    // 长轴向右上 (+x,-z) 和左下 (-x,+z) 延伸，端角落在主桌与侧翼上，但边和中心跨越缺口！
    const spanning = makeItem('keyboard');
    spanning.size = { width: 0.7, height: 0.03, depth: 0.14 };
    spanning.x = -0.05;
    spanning.z = 0.4;
    spanning.rotation = 45;
    // 验证确实有角落或大部分落在桌上，但中间穿过缺口 (-0.1, 0.35) 区域
    expect(isOutOfBounds(spanning, leftDesk)).toBe(true);

    // 严格构造四角全部落在桌面内部、仅中间斜跨缺口的细长条：
    // 顶点 1,2 在主桌 (+x <= 0.7, z <= 0.35)，顶点 3,4 在侧翼 (x <= -0.1, z <= 0.95)
    // 取中心 (0.05, 0.30) 旋转 45° 宽 0.9 深 0.04 ->
    // 东北端 (0.05 + 0.45*cos45, 0.30 - 0.45*sin45) = (0.368, -0.018) (主桌)
    // 西南端 (0.05 - 0.45*cos45, 0.30 + 0.45*sin45) = (-0.268, 0.618) (侧翼)
    // 但中心 (0.05, 0.30) 在主桌内，若取中心 (-0.02, 0.42)：
    // 东北端 (-0.02 + 0.318, 0.42 - 0.318) = (0.298, 0.102) -> 主桌！
    // 西南端 (-0.02 - 0.318, 0.42 + 0.318) = (-0.338, 0.738) -> 侧翼！
    // 四角偏移 ±0.015*sin45 = ±0.0106，仍在主桌与侧翼内，但中心 (-0.02, 0.42) 位于缺口 (x > -0.1, z > 0.35)！
    const bridge = makeItem('keyboard');
    bridge.size = { width: 0.9, height: 0.03, depth: 0.03 };
    bridge.x = -0.02;
    bridge.z = 0.42;
    bridge.rotation = 45;
    expect(isOutOfBounds(bridge, leftDesk)).toBe(true);
  });

  it('尊重 0.0001 m 边界容差并继续排除屏幕挂灯', () => {
    const exactEdge = makeItem('speaker');
    exactEdge.size = { width: 0.2, height: 0.2, depth: 0.2 };
    exactEdge.x = -0.4;
    exactEdge.z = 0.85; // front edge = 0.95 = maxZ
    exactEdge.rotation = 0;
    expect(isOutOfBounds(exactEdge, leftDesk)).toBe(false);

    exactEdge.z = 0.85005; // within 0.0001 m tolerance
    expect(isOutOfBounds(exactEdge, leftDesk)).toBe(false);

    exactEdge.z = 0.8505; // beyond tolerance
    expect(isOutOfBounds(exactEdge, leftDesk)).toBe(true);

    const p = defaultProject();
    p.desk = leftDesk;
    const monitor = p.items.find((i) => i.kind === 'monitor')!;
    const lamp = makeItem('screenLamp', monitor.id);
    expect(isOutOfBounds(lamp, leftDesk)).toBe(false);
  });
});

describe('L 形桌型编辑与历史', () => {
  beforeEach(() => useEditor.getState().replace(defaultProject(), new Map()));

  it('桌型切换、左右保留尺寸、切回矩形重置与撤销恢复，物品和挂灯不变', () => {
    const s = () => useEditor.getState();
    s().add('screenLamp');
    const itemsBefore = structuredClone(s().project.items);

    s().commit((p) => setDeskShape(p.desk, 'left'));
    expect(s().project.desk.return).toEqual({ side: 'left', width: 0.6, extension: 0.6 });

    s().commit((p) => {
      p.desk.return!.width = 0.8;
      p.desk.return!.extension = 1.1;
    });
    // 左右切换保留侧翼尺寸
    s().commit((p) => setDeskShape(p.desk, 'right'));
    expect(s().project.desk.return).toEqual({ side: 'right', width: 0.8, extension: 1.1 });

    // 切回矩形移除 return
    s().commit((p) => setDeskShape(p.desk, 'rectangle'));
    expect('return' in s().project.desk).toBe(false);

    // 重新启用使用默认尺寸
    s().commit((p) => setDeskShape(p.desk, 'left'));
    expect(s().project.desk.return).toEqual({ side: 'left', width: 0.6, extension: 0.6 });

    // 连续撤销回到此前右侧配置与最初矩形
    s().undo();
    expect('return' in s().project.desk).toBe(false);
    s().undo();
    expect(s().project.desk.return).toEqual({ side: 'right', width: 0.8, extension: 1.1 });
    s().undo();
    expect(s().project.desk.return).toEqual({ side: 'left', width: 0.8, extension: 1.1 });

    // 物品与挂灯坐标、参数始终保持原样
    expect(s().project.items).toEqual(itemsBefore);
  });

  it('主桌宽缩窄联动侧翼宽度可一步撤销，滑块手势合并为一步历史', () => {
    const s = () => useEditor.getState();
    s().commit((p) => setDeskShape(p.desk, 'left'));
    s().commit((p) => {
      p.desk.return!.width = 1.0;
    });
    const pastBefore = s().past.length;

    // 主桌从 1.4 缩窄到 0.8，侧翼同步从 1.0 缩窄到 0.5（保留 0.3 m 缺口）
    s().commit((p) => setDeskWidth(p.desk, 0.8));
    expect(s().project.desk.width).toBe(0.8);
    expect(s().project.desk.return?.width).toBe(0.5);
    expect(s().past).toHaveLength(pastBefore + 1);

    // 主桌变宽不自动放大侧翼
    s().commit((p) => setDeskWidth(p.desk, 1.6));
    expect(s().project.desk.return?.width).toBe(0.5);

    // 撤销恢复主桌宽和侧翼宽
    s().undo();
    expect(s().project.desk.width).toBe(0.8);
    expect(s().project.desk.return?.width).toBe(0.5);
    s().undo();
    expect(s().project.desk.width).toBe(1.4);
    expect(s().project.desk.return?.width).toBe(1.0);

    // 滑块手势连续缩小主桌宽度只记一步历史
    const gesturePast = s().past.length;
    s().beginGesture();
    for (const w of [1.3, 1.2, 1.1, 0.9]) s().commit((p) => setDeskWidth(p.desk, w));
    expect(s().past).toHaveLength(gesturePast);
    s().endGesture();
    expect(s().past).toHaveLength(gesturePast + 1);
    expect(s().project.desk.return?.width).toBe(0.6);
    s().undo();
    expect(s().project.desk.width).toBe(1.4);
    expect(s().project.desk.return?.width).toBe(1.0);
  });

  it('非法值及无操作提交不污染历史', () => {
    const s = () => useEditor.getState();
    s().commit((p) => setDeskShape(p.desk, 'left'));
    const snapshot = s().project;
    const pastLen = s().past.length;

    // 无操作 commit 不新增历史
    s().commit((p) => setDeskShape(p.desk, 'left'));
    expect(s().past).toHaveLength(pastLen);

    // 非法越界值抛出并保留原工程
    expect(() =>
      s().commit((p) => {
        p.desk.return!.width = 1.15; // 1.4 - 1.15 < 0.3
      }),
    ).toThrow();
    expect(s().project).toBe(snapshot);
    expect(s().past).toHaveLength(pastLen);
  });

  it('桌后墙面边界计算、壁挂洞洞板贴墙变换与越界校验', () => {
    const desk = defaultProject().desk;
    expect(deskBackWallBounds(desk)).toBeNull();

    const walledDesk = {
      ...desk,
      backWall: { enabled: true, height: WALL_DEFAULT_HEIGHT, gap: WALL_DEFAULT_GAP },
    };
    const wall = deskBackWallBounds(walledDesk)!;
    expect(wall.frontZ).toBeCloseTo(-walledDesk.depth / 2 - WALL_DEFAULT_GAP, 4);
    expect(wall.width).toBeCloseTo(walledDesk.width + 0.8, 4);

    const board = makeItem('pegboard');
    board.surface = 'wall';
    board.wallY = 0.28;
    board.x = 0.42;
    expect(isOutOfBounds(board, desk)).toBe(true);
    expect(isOutOfBounds(board, walledDesk)).toBe(false);

    const tr = resolveItemTransform(board, walledDesk, [board]);
    expect(tr.position[1]).toBeCloseTo(walledDesk.height + 0.28, 4);
    expect(tr.position[2]).toBeCloseTo(
      wall.frontZ + PEGBOARD_WALL_STANDOFF + PEGBOARD.thickness / 2,
      4,
    );

    // 高度超出墙顶或横向滑出墙宽时准确报出越界
    expect(isOutOfBounds({ ...board, wallY: 1.0 }, walledDesk)).toBe(true);
    expect(isOutOfBounds({ ...board, x: wall.maxX }, walledDesk)).toBe(true);

    // 非洞洞板不允许设置壁挂属性
    const kb = makeItem('keyboard');
    expect(
      projectSchema.safeParse({
        ...defaultProject(),
        desk: walledDesk,
        items: [{ ...kb, surface: 'wall' }],
      }).success,
    ).toBe(false);
  });
});

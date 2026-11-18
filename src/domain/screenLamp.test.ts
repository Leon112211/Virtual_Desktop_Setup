import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultProject, makeItem } from './catalog';
import { footprint, isOutOfBounds } from './placement';
import { itemSchema, projectSchema, type Project, type SceneItem } from './project';
import {
  defaultLampSettings,
  EditorError,
  MAX_SCREEN_LAMPS,
  SCREEN_LAMP_SIZE,
  screenLampSchema,
} from './screenLamp';
import { useEditor } from '../store/editorStore';

function fixture(monitorCount = 1, lampCount = 1): Project {
  const project = defaultProject();
  delete project.environment;
  const monitors = Array.from({ length: monitorCount }, () => makeItem('monitor'));
  project.items = [
    ...monitors,
    ...monitors.slice(0, lampCount).map((monitor) => makeItem('screenLamp', monitor.id)),
  ];
  return project;
}
const state = () => useEditor.getState();
const lamps = () => state().project.items.filter((item) => item.kind === 'screenLamp');
const monitors = () => state().project.items.filter((item) => item.kind === 'monitor');

function expectAtomicFailure(operation: () => void, message?: RegExp) {
  const before = state();
  if (message) expect(operation).toThrow(message);
  else expect(operation).toThrow();
  expect(state()).toBe(before);
}

describe('屏幕挂灯数据约束', () => {
  it('工厂生成合法、独立的安装参数与固定结构', () => {
    const project = fixture();
    const lamp = project.items[1];
    expect(MAX_SCREEN_LAMPS).toBe(2);
    expect(lamp).toMatchObject({
      kind: 'screenLamp',
      x: 0,
      z: 0,
      rotation: 0,
      size: { width: 0.45, height: 0.04, depth: 0.075 },
      lamp: {
        monitorId: project.items[0].id,
        enabled: true,
        brightness: 60,
        temperature: 4000,
        tilt: 25,
        horizontalAngle: 90,
        verticalAngle: 35,
        softness: 0.15,
      },
    });
    expect(lamp.size).toEqual(SCREEN_LAMP_SIZE);
    expect(projectSchema.parse(project)).toEqual(project);
    expect(() => makeItem('screenLamp')).toThrow(EditorError);
    const other = makeItem('screenLamp', project.items[0].id);
    other.lamp!.brightness = 0;
    other.size.width = 0.3;
    expect(lamp.lamp!.brightness).toBe(60);
    expect(lamp.size.width).toBe(0.45);
    expect(defaultLampSettings(project.items[0].id)).toEqual(lamp.lamp);
  });

  const bounds = [
    ['brightness', 0, 100],
    ['temperature', 2700, 6500],
    ['tilt', 0, 45],
    ['horizontalAngle', 60, 110],
    ['verticalAngle', 20, 55],
    ['softness', 0.05, 0.35],
  ] as const;
  it.each(bounds)('%s 接受边界，拒绝越界、NaN 与无穷数', (key, min, max) => {
    for (const value of [min, max]) {
      const project = fixture();
      project.items[1].lamp![key] = value;
      expect(projectSchema.safeParse(project).success).toBe(true);
    }
    for (const value of [min - 0.001, max + 0.001, NaN, Infinity, -Infinity]) {
      const project = fixture();
      project.items[1].lamp![key] = value;
      expect(projectSchema.safeParse(project).success).toBe(false);
    }
  });

  it('照明参数必须完整且类型正确，宿主 ID 不可为空或过长', () => {
    const settings = defaultLampSettings('monitor');
    for (const key of Object.keys(settings)) {
      const missing = { ...settings } as Record<string, unknown>;
      delete missing[key];
      expect(screenLampSchema.safeParse(missing).success).toBe(false);
    }
    for (const patch of [
      { monitorId: '' },
      { monitorId: 'x'.repeat(101) },
      { enabled: 1 },
      { brightness: '60' },
    ]) {
      expect(screenLampSchema.safeParse({ ...settings, ...patch }).success).toBe(false);
    }
    expect(screenLampSchema.parse({ ...settings, enabled: false }).enabled).toBe(false);
  });

  it.each([0.3, 0.6])('挂灯长度边界 %s m 合法', (width) => {
    const project = fixture();
    project.items[1].size.width = width;
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  const invalidStructure: [string, (item: SceneItem) => void][] = [
    [
      '缺少照明参数',
      (item) => {
        delete item.lamp;
      },
    ],
    [
      '独立 X 位移',
      (item) => {
        item.x = 0.01;
      },
    ],
    [
      '独立 Z 位移',
      (item) => {
        item.z = 0.01;
      },
    ],
    [
      '独立旋转',
      (item) => {
        item.rotation = 1;
      },
    ],
    [
      '资源引用',
      (item) => {
        item.assetId = 'asset';
      },
    ],
    [
      '俯仰',
      (item) => {
        item.pitch = 0;
      },
    ],
    [
      '翻转',
      (item) => {
        item.roll = 0;
      },
    ],
    [
      '升降',
      (item) => {
        item.lift = 0;
      },
    ],
    [
      '过短',
      (item) => {
        item.size.width = 0.299;
      },
    ],
    [
      '过长',
      (item) => {
        item.size.width = 0.601;
      },
    ],
    [
      '厚度变化',
      (item) => {
        item.size.height = 0.041;
      },
    ],
    [
      '深度变化',
      (item) => {
        item.size.depth = 0.076;
      },
    ],
    [
      'NaN 长度',
      (item) => {
        item.size.width = NaN;
      },
    ],
  ];
  it.each(invalidStructure)('拒绝非标准结构：%s', (_name, mutate) => {
    const project = fixture();
    mutate(project.items[1]);
    expect(projectSchema.safeParse(project).success).toBe(false);
  });

  it('其他物品不能携带挂灯照明参数', () => {
    const item = makeItem('monitor');
    item.lamp = defaultLampSettings(item.id);
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it('宿主必须存在且为内置显示器，不能是普通物品或导入模型', () => {
    const project = fixture();
    const lamp = project.items[1];
    lamp.lamp!.monitorId = 'missing';
    expect(projectSchema.safeParse(project).success).toBe(false);
    const speaker = makeItem('speaker');
    project.items.push(speaker);
    lamp.lamp!.monitorId = speaker.id;
    expect(projectSchema.safeParse(project).success).toBe(false);
    project.assets.push({
      id: 'asset',
      name: '显示器.glb',
      format: 'glb',
      bytes: 5,
      size: { width: 0.3, height: 0.2, depth: 0.1 },
      triangles: 12,
    });
    project.items.push({ ...speaker, id: 'imported', kind: 'imported', assetId: 'asset' });
    lamp.lamp!.monitorId = 'imported';
    expect(projectSchema.safeParse(project).success).toBe(false);
    lamp.lamp!.monitorId = project.items[0].id;
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it('最多两盏、每台一盏：独立宿主的第三盏和重复宿主均被拒绝', () => {
    const project = fixture(3, 2);
    expect(projectSchema.safeParse(project).success).toBe(true);
    project.items.push(makeItem('screenLamp', project.items[2].id));
    expect(projectSchema.safeParse(project).success).toBe(false);
    project.items.pop();
    project.items[4].lamp!.monitorId = project.items[3].lamp!.monitorId;
    expect(projectSchema.safeParse(project).success).toBe(false);
  });

  it('环境为可选字段，不为旧工程补默认值，仅接受明亮或暗光', () => {
    const project = fixture();
    expect(projectSchema.parse(project)).not.toHaveProperty('environment');
    for (const environment of ['bright', 'dark'] as const) {
      expect(projectSchema.parse({ ...project, environment }).environment).toBe(environment);
    }
    expect(projectSchema.safeParse({ ...project, environment: 'night' }).success).toBe(false);
  });

  it('挂灯无独立桌面占地，宿主仍参与越界检测', () => {
    const project = fixture();
    const [monitor, lamp] = project.items;
    monitor.x = 1;
    expect(footprint(lamp)).toEqual([]);
    expect(isOutOfBounds(lamp, project.desk)).toBe(false);
    expect(footprint(monitor)).toHaveLength(4);
    expect(isOutOfBounds(monitor, project.desk)).toBe(true);
  });
});

describe('屏幕挂灯编辑与历史', () => {
  beforeEach(() => state().replace(fixture(), new Map()));
  afterEach(() => state().replace(defaultProject(), new Map()));

  it('优先安装到选中的空闲显示器，否则按场景顺序寻找空闲宿主', () => {
    state().replace(fixture(3, 0), new Map());
    const hosts = monitors();
    state().select(hosts[2].id);
    state().add('screenLamp');
    expect(lamps()[0].lamp!.monitorId).toBe(hosts[2].id);
    expect(state().selected).toBe(lamps()[0].id);
    expect(lamps()[0]).toMatchObject({ x: 0, z: 0, rotation: 0 });
    state().select(hosts[2].id);
    state().add('screenLamp');
    expect(lamps()[1].lamp!.monitorId).toBe(hosts[0].id);
    expect(state().past).toHaveLength(2);
    state().undo();
    expect(lamps()).toHaveLength(1);
    state().redo();
    expect(lamps()).toHaveLength(2);
    expect(lamps()[1].lamp!.monitorId).toBe(hosts[0].id);
  });

  it('选择非显示器时也使用第一台空闲显示器', () => {
    const project = fixture(2, 0);
    const keyboard = makeItem('keyboard');
    project.items.push(keyboard);
    state().replace(project, new Map());
    state().select(keyboard.id);
    state().add('screenLamp');
    expect(lamps()[0].lamp!.monitorId).toBe(project.items[0].id);
  });

  it('无显示器、宿主已满、达到两盏上限均报错且不改变任何状态', () => {
    state().replace(fixture(0, 0), new Map());
    expectAtomicFailure(() => state().add('screenLamp'), /没有可安装的显示器/);
    state().replace(fixture(), new Map());
    expectAtomicFailure(() => state().add('screenLamp'), /没有可安装的显示器/);
    state().replace(fixture(3, 2), new Map());
    expectAtomicFailure(() => state().add('screenLamp'), /最多支持两盏/);
  });

  it('删除显示器连同挂灯只记一步，撤销重做保持宿主关系', () => {
    const original = state().project;
    state().select(monitors()[0].id);
    state().remove();
    expect(state().project.items).toEqual([]);
    expect(state().selected).toBeNull();
    expect(state().past).toEqual([original]);
    state().undo();
    expect(state().project).toEqual(original);
    expect(state().future).toHaveLength(1);
    state().redo();
    expect(state().project.items).toEqual([]);
    expect(state().past).toHaveLength(1);
  });

  it('仅删除挂灯保留显示器，撤销恢复参数', () => {
    const original = state().project;
    state().select(lamps()[0].id);
    state().remove();
    expect(monitors()).toHaveLength(1);
    expect(lamps()).toEqual([]);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(original);
    state().redo();
    expect(monitors()).toHaveLength(1);
    expect(lamps()).toEqual([]);
  });

  it('复制显示器同时复制挂灯并重映射宿主 ID，作为一次可撤销操作', () => {
    const original = state().project;
    const originalLamp = lamps()[0];
    state().select(monitors()[0].id);
    state().duplicate();
    const copy = monitors()[1];
    const copiedLamp = lamps()[1];
    expect(copy.id).not.toBe(monitors()[0].id);
    expect(copiedLamp.id).not.toBe(originalLamp.id);
    expect(copiedLamp.lamp).toEqual({ ...originalLamp.lamp, monitorId: copy.id });
    expect(copiedLamp).toMatchObject({ x: 0, z: 0, rotation: 0, size: originalLamp.size });
    expect(state().selected).toBe(copy.id);
    expect(state().past).toHaveLength(1);
    expect(projectSchema.safeParse(state().project).success).toBe(true);
    const duplicated = state().project;
    state().undo();
    expect(state().project).toEqual(original);
    state().redo();
    expect(state().project).toEqual(duplicated);
    expect(state().past).toHaveLength(1);
  });

  it('直接复制挂灯和超限复制宿主失败，已有撤销重做与选择不变', () => {
    state().commit((project) => {
      project.name = '可重做';
    });
    state().undo();
    state().select(lamps()[0].id);
    expectAtomicFailure(() => state().duplicate(), /挂灯随显示器复制/);
    state().replace(fixture(2, 2), new Map());
    state().select(monitors()[0].id);
    expectAtomicFailure(() => state().duplicate(), /超过两盏挂灯上限/);
  });

  it('允许空闲宿主的切换，拒绝重复或失效宿主，失败保持历史原子性', () => {
    state().replace(fixture(3, 2), new Map());
    const [firstLamp, secondLamp] = lamps();
    const hosts = monitors();
    state().select(firstLamp.id);
    state().commit((project) => {
      project.name = '可重做';
    });
    state().undo();
    expectAtomicFailure(
      () =>
        state().updateItem(firstLamp.id, {
          lamp: { ...firstLamp.lamp!, monitorId: secondLamp.lamp!.monitorId },
        }),
      /已经安装了挂灯/,
    );
    expectAtomicFailure(
      () =>
        state().updateItem(firstLamp.id, {
          lamp: { ...firstLamp.lamp!, monitorId: 'missing' },
        }),
      /现有的内置显示器/,
    );
    state().updateItem(firstLamp.id, { lamp: { ...firstLamp.lamp!, monitorId: hosts[2].id } });
    expect(lamps()[0].lamp!.monitorId).toBe(hosts[2].id);
    expect(state().past).toHaveLength(1);
    expect(state().future).toHaveLength(0);
    state().undo();
    expect(lamps()[0].lamp!.monitorId).toBe(hosts[0].id);
    state().redo();
    expect(lamps()[0].lamp!.monitorId).toBe(hosts[2].id);
  });

  it('无效参数、位移或直接提交悬空宿主不会泄露部分修改', () => {
    const lamp = lamps()[0];
    expectAtomicFailure(() =>
      state().updateItem(lamp.id, {
        lamp: { ...lamp.lamp!, brightness: NaN },
      }),
    );
    expectAtomicFailure(() => state().updateItem(lamp.id, { x: 0.1 }));
    expectAtomicFailure(() =>
      state().commit((project) => {
        project.name = '不应保留';
        project.items = project.items.filter((item) => item.kind !== 'monitor');
      }),
    );
  });

  it('挂灯滑块手势连续更新只记一步，相同值与空手势不记历史', () => {
    const original = state().project;
    const lamp = lamps()[0];
    state().beginGesture();
    for (const brightness of [20, 30, 40]) {
      state().updateItem(lamp.id, { lamp: { ...lamp.lamp!, brightness } });
    }
    expect(state().past).toHaveLength(0);
    state().endGesture();
    expect(state().past).toEqual([original]);
    expect(lamps()[0].lamp!.brightness).toBe(40);
    state().updateItem(lamp.id, { lamp: { ...lamps()[0].lamp! } });
    state().beginGesture();
    state().endGesture();
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(original);
    state().redo();
    expect(lamps()[0].lamp!.brightness).toBe(40);
  });

  it('手势期间失败操作不结束手势，后续有效更新仍合并为一步', () => {
    const lamp = lamps()[0];
    state().select(lamp.id);
    state().beginGesture();
    state().updateItem(lamp.id, { lamp: { ...lamp.lamp!, tilt: 30 } });
    expectAtomicFailure(() => state().duplicate(), /挂灯随显示器复制/);
    expectAtomicFailure(() => state().add('screenLamp'), /没有可安装的显示器/);
    expectAtomicFailure(() =>
      state().updateItem(lamp.id, {
        lamp: { ...lamp.lamp!, tilt: 46 },
      }),
    );
    state().updateItem(lamp.id, { lamp: { ...lamp.lamp!, tilt: 40 } });
    expect(state().past).toHaveLength(0);
    state().endGesture();
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(lamps()[0].lamp!.tilt).toBe(25);
  });

  it('替换工程清空未结束的手势、辅助线、选择与历史', () => {
    state().select(lamps()[0].id);
    state().toggleLampGuides();
    state().beginGesture();
    state().updateItem(lamps()[0].id, { lamp: { ...lamps()[0].lamp!, brightness: 10 } });
    const replacement = fixture(2, 1);
    state().replace(replacement, new Map());
    state().endGesture();
    expect(state().project).toEqual(replacement);
    expect(state().lampGuides).toBe(false);
    expect(state().selected).toBeNull();
    expect(state().past).toEqual([]);
    expect(state().future).toEqual([]);
    state().commit((project) => {
      project.environment = 'dark';
    });
    expect(state().past).toEqual([replacement]);
    state().undo();
    expect(state().project).toEqual(replacement);
  });

  it('环境切换支持撤销重做，旧工程缺省环境保持缺省', () => {
    const original = state().project;
    state().toggleLampGuides();
    expect(state().past).toEqual([]);
    state().commit((project) => {
      project.environment = 'dark';
    });
    expect(state().project.environment).toBe('dark');
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project).toEqual(original);
    expect(state().project).not.toHaveProperty('environment');
    state().redo();
    expect(state().project.environment).toBe('dark');
    state().commit((project) => {
      project.environment = 'bright';
    });
    state().undo();
    expect(state().project.environment).toBe('dark');
    state().redo();
    expect(state().project.environment).toBe('bright');
  });
});

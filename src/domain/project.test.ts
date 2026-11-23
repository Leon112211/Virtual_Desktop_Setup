// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { describe, it, expect, beforeEach } from 'vitest';
import { cm, meters, projectSchema } from './project';
import { defaultProject, makeItem } from './catalog';
import { isOutOfBounds, itemWorldY } from './placement';
import { useEditor } from '../store/editorStore';
import { useI18n } from '../i18n';
describe('尺寸与放置', () => {
  it('厘米与米保持明确换算', () => {
    expect(meters(75)).toBe(0.75);
    expect(cm(0.035)).toBe(3.5);
  });
  it('默认工程合法，所有初始物品在桌上', () => {
    const p = defaultProject();
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(p.items.every((i) => !isOutOfBounds(i, p.desk))).toBe(true);
    expect(p.desk.finish).toBe('wood');

    p.desk.finish = 'solid';
    expect(projectSchema.safeParse(p).success).toBe(true);
    (p.desk as { finish?: string }).finish = 'glossy';
    expect(projectSchema.safeParse(p).success).toBe(false);

    p.desk.finish = 'wood';
    p.desk.partitions = { back: true, left: true, right: true, height: 0.35, material: 'frosted' };
    expect(projectSchema.safeParse(p).success).toBe(true);
    (p.desk.partitions as { material?: string }).material = 'invalid';
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
  it('旋转后角落越界，即便中心在桌内', () => {
    const p = defaultProject(),
      i = makeItem('monitor');
    i.x = 0.44;
    i.z = 0;
    i.rotation = 45;
    expect(isOutOfBounds(i, p.desk)).toBe(true);
  });
  it('调高桌面同步调整物品世界高度，板厚不影响上表面', () => {
    const p = defaultProject();
    p.desk.height = 1.1;
    p.desk.thickness = 0.06;
    expect(itemWorldY(p.desk)).toBe(1.1);
  });
  it('拒绝无穷数、负尺寸与重复ID', () => {
    const p = defaultProject();
    p.items[0].x = Infinity;
    expect(projectSchema.safeParse(p).success).toBe(false);
    p.items[0].x = 0;
    p.desk.width = -1;
    expect(projectSchema.safeParse(p).success).toBe(false);
    p.desk.width = 1.4;
    p.items[1].id = p.items[0].id;
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
  it('拒绝缺失资产引用', () => {
    const p = defaultProject();
    p.items[0].kind = 'imported';
    p.items[0].assetId = 'missing';
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
  it('显示器屏幕姿态在允许范围内可保存，越界被拒绝', () => {
    const p = defaultProject();
    const monitor = p.items.find((i) => i.kind === 'monitor')!;
    monitor.pitch = 30;
    monitor.roll = -90;
    monitor.lift = 0.12;
    expect(projectSchema.safeParse(p).success).toBe(true);
    monitor.pitch = 90;
    expect(projectSchema.safeParse(p).success).toBe(false);
    monitor.pitch = 30;
    monitor.lift = 1;
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
});
describe('编辑历史', () => {
  beforeEach(() => useEditor.getState().replace(defaultProject(), new Map()));
  it('添加、复制、删除可以逐步撤销重做', () => {
    const s = () => useEditor.getState();
    const n = s().project.items.length;
    s().add('speaker');
    expect(s().project.items).toHaveLength(n + 1);
    s().duplicate();
    expect(s().project.items).toHaveLength(n + 2);
    s().remove();
    expect(s().project.items).toHaveLength(n + 1);
    s().undo();
    expect(s().project.items).toHaveLength(n + 2);
    s().undo();
    expect(s().project.items).toHaveLength(n + 1);
    s().redo();
    expect(s().project.items).toHaveLength(n + 2);
  });
  it('一次变换只记一步，相同值不记历史', () => {
    const s = () => useEditor.getState(),
      id = s().project.items[0].id;
    s().updateItem(id, { x: 0.23, z: 0.12 });
    expect(s().past).toHaveLength(1);
    s().updateItem(id, { x: 0.23, z: 0.12 });
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project.items[0].x).toBe(-0.16);
  });
  it('无效提交不改变旧场景', () => {
    const s = () => useEditor.getState(),
      before = s().project;
    expect(() =>
      s().commit((p) => {
        p.desk.width = -1;
      }),
    ).toThrow();
    expect(s().project).toBe(before);
    expect(s().past).toHaveLength(0);
  });
  it('历史最多50步且新编辑会清空重做', () => {
    const s = () => useEditor.getState();
    for (let n = 0; n < 60; n++)
      s().commit((p) => {
        p.desk.height = 0.6 + n * 0.001;
      });
    expect(s().past).toHaveLength(50);
    s().undo();
    expect(s().future).toHaveLength(1);
    s().commit((p) => {
      p.desk.color = '#ffffff';
    });
    expect(s().future).toHaveLength(0);
  });
  it('撤销导入和删除时保留模型字节与资源元数据', () => {
    const s = () => useEditor.getState();
    const blob = new Blob(['a']);
    const size = { width: 0.3, height: 0.2, depth: 0.1 };
    s().addImported(
      { id: 'test', name: 'a.glb', format: 'glb', bytes: 1, size, triangles: 1 },
      blob,
      size,
    );
    s().remove();
    s().undo();
    expect(s().blobs.get('test')).toBe(blob);
    s().undo();
    expect(s().project.items.some((i) => i.assetId === 'test')).toBe(false);
    expect(s().project.assets.some((a) => a.id === 'test')).toBe(true);
    s().redo();
    expect(s().project.items.some((i) => i.assetId === 'test')).toBe(true);
  });
  it('滑块拖动的连续更新只记一步历史', () => {
    const s = () => useEditor.getState();
    const id = s().project.items[0].id;
    s().beginGesture();
    for (let n = 0; n < 10; n++) s().updateItem(id, { x: 0.1 + n * 0.01 });
    expect(s().past).toHaveLength(0);
    s().endGesture();
    expect(s().past).toHaveLength(1);
    expect(s().project.items[0].x).toBeCloseTo(0.19);
    s().undo();
    expect(s().project.items[0].x).toBe(-0.16);
  });
  it('初始场景只保留 27 寸显示器与轻薄笔记本并默认插好 Type-C 连线', () => {
    useI18n.getState().setLang('zh');
    const p = defaultProject();
    expect(p.items.map((i) => i.kind)).toEqual(['monitor', 'macbook']);
    expect(p.items.map((i) => i.name)).toEqual(['27 寸显示器', '轻薄笔记本']);
    expect(p.cables).toHaveLength(1);
    const cable = p.cables![0];
    expect(cable.kind).toBe('usbc');
    expect(cable.fromPlugType).toBe('usbc');
    expect(cable.toPlugType).toBe('usbc');
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it('加载旧版含品牌名工程自动去品牌化，中英文切换同步更新内置名称且保留用户自定义名称', () => {
    useI18n.getState().setLang('zh');
    const legacy = defaultProject();
    legacy.name = '我的桌面';
    legacy.items[1].name = 'MacBook';
    const mini = makeItem('macMini');
    mini.name = 'Mac mini 副本';
    const custom = makeItem('speaker');
    custom.name = '书房左声道';
    legacy.items.push(mini, custom);

    useEditor.getState().replace(legacy, new Map());
    expect(useEditor.getState().project.name).toBe('我的理想桌搭');
    expect(useEditor.getState().project.items.map((i) => i.name)).toEqual([
      '27 寸显示器',
      '轻薄笔记本',
      '迷你主机 副本',
      '书房左声道',
    ]);

    useI18n.getState().setLang('en');
    expect(useEditor.getState().project.name).toBe('My Ideal Desk Setup');
    expect(useEditor.getState().project.items.map((i) => i.name)).toEqual([
      '27" Monitor',
      'Ultrabook',
      'Mini PC Copy',
      '书房左声道',
    ]);

    useI18n.getState().setLang('zh');
    expect(useEditor.getState().project.name).toBe('我的理想桌搭');
    expect(useEditor.getState().project.items.map((i) => i.name)).toEqual([
      '27 寸显示器',
      '轻薄笔记本',
      '迷你主机 副本',
      '书房左声道',
    ]);
  });
});

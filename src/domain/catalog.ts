import { uid, type BuiltinKind, type Project, type SceneItem, type Size } from './project';
export const catalog: {
  kind: BuiltinKind;
  name: string;
  subtitle: string;
  size: Size;
  color: string;
  category: string;
}[] = [
  {
    kind: 'monitor',
    name: '27 寸显示器',
    subtitle: '留一块专注的空间',
    size: { width: 0.61, height: 0.488, depth: 0.22 },
    color: '#343c49',
    category: '数码设备',
  },
  {
    kind: 'speaker',
    name: '桌面音响',
    subtitle: '让好声音近一点',
    size: { width: 0.13, height: 0.22, depth: 0.15 },
    color: '#e3d5bf',
    category: '数码设备',
  },
  {
    kind: 'controller',
    name: '无线游戏手柄',
    subtitle: '工作之外，也要尽兴',
    size: { width: 0.17, height: 0.065, depth: 0.11 },
    color: '#e3e8ee',
    category: '数码设备',
  },
  {
    kind: 'pegboard',
    name: '桌面洞洞板',
    subtitle: '把灵感整理到眼前',
    size: { width: 0.48, height: 0.42, depth: 0.13 },
    color: '#e7e3da',
    category: '收纳配件',
  },
  {
    kind: 'keyboard',
    name: '机械键盘',
    subtitle: '每一次敲击，都刚刚好',
    size: { width: 0.36, height: 0.035, depth: 0.13 },
    color: '#c9d6e5',
    category: '数码设备',
  },
];
export function makeItem(kind: BuiltinKind): SceneItem {
  const entry = catalog.find((e) => e.kind === kind)!;
  return {
    id: uid(),
    name: entry.name,
    kind,
    x: 0,
    z: 0.12,
    rotation: 0,
    size: { ...entry.size },
    color: entry.color,
  };
}
export function defaultProject(): Project {
  const monitor = makeItem('monitor'),
    left = makeItem('speaker'),
    right = makeItem('speaker'),
    keys = makeItem('keyboard'),
    pad = makeItem('controller'),
    board = makeItem('pegboard');
  Object.assign(monitor, { x: -0.12, z: -0.14 });
  Object.assign(left, { x: -0.56, z: -0.15 });
  Object.assign(right, { x: 0.32, z: -0.14 });
  Object.assign(keys, { x: -0.12, z: 0.16 });
  Object.assign(pad, { x: 0.36, z: 0.19, rotation: -12 });
  Object.assign(board, { x: 0.42, z: -0.26, size: { width: 0.4, height: 0.35, depth: 0.12 } });
  return {
    schemaVersion: 1,
    id: uid(),
    name: '我的理想桌搭',
    desk: { width: 1.4, depth: 0.7, height: 0.75, thickness: 0.03, color: '#c99e70' },
    items: [monitor, left, right, keys, pad, board],
    assets: [],
  };
}

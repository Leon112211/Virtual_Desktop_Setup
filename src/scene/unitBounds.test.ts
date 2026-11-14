import { expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { unitBounds } from './unitBounds';
import { defaultProject, makeItem } from '../domain/catalog';
import { projectSchema } from '../domain/project';

it('内置物品按实际几何边界居中贴底，且尺寸不依赖桌面父变换', () => {
  const parent = new Group();
  parent.position.set(4, 0.9, -2);
  parent.rotation.y = 0.6;
  parent.scale.set(0.62, 0.45, 0.2);
  const placement = new Group();
  const content = new Group();
  const mesh = new Mesh(new BoxGeometry(2, 3, 4));
  mesh.position.set(2, 7, -5);
  content.add(mesh);
  placement.add(content);
  parent.add(placement);
  const { scale, position } = unitBounds(content);
  placement.scale.copy(scale);
  placement.position.copy(position);
  // Detach only for the assertion: project-scale transforms do not define the unit model.
  parent.remove(placement);
  const bounds = new Box3().setFromObject(placement);
  expect(bounds.getSize(new Vector3()).toArray()).toEqual([1, 1, 1]);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0);
  expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0);
  expect(mesh.position.toArray()).toEqual([2, 7, -5]);
  const again = unitBounds(content);
  expect(again.scale.distanceTo(scale)).toBeLessThan(1e-10);
  expect(again.position.distanceTo(position)).toBeLessThan(1e-10);
  mesh.geometry.dispose();
});

it('拒绝没有几何体的内置边界', () => {
  expect(() => unitBounds(new Group())).toThrow('内置模型尺寸无效');
});

it('复杂键盘的场景预算不能按简单物品低估', () => {
  const project = defaultProject();
  project.items = Array.from({ length: 20 }, () => makeItem('keyboard'));
  expect(projectSchema.safeParse(project).success).toBe(true);
  project.items = Array.from({ length: 26 }, () => makeItem('keyboard'));
  expect(projectSchema.safeParse(project).success).toBe(false);
});

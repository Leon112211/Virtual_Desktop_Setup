// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { deskBounds, deskCentroid, deskSupportRects } from '../domain/desk';
import type { Desk } from '../domain/project';
import {
  buildDeskPartitionGeometries,
  buildDeskTopGeometry,
  buildLDeskGeometry,
  DESK_LEG_SIZE,
  DESK_PARTITION_THICKNESS,
  deskLegs,
} from './deskGeometry';
import { deskCameraPose, deskShadowHalfSize } from './deskCamera';

const leftDesk: Desk = {
  width: 1.4,
  depth: 0.7,
  height: 0.75,
  thickness: 0.03,
  color: '#c99e70',
  return: { side: 'left', width: 0.6, extension: 0.6 },
};

const rightDesk: Desk = {
  ...leftDesk,
  return: { side: 'right', width: 0.6, extension: 0.6 },
};

describe('L 形桌几何构造与桌腿', () => {
  it('左右 L 形具有精确的顶底高度、标称包围盒、有限法线和连续 UV', () => {
    for (const desk of [leftDesk, rightDesk]) {
      const geometry = buildLDeskGeometry(desk);
      const bounds = deskBounds(desk);
      const box = geometry.boundingBox!;

      expect(box.min.x).toBeCloseTo(bounds.minX, 5);
      expect(box.max.x).toBeCloseTo(bounds.maxX, 5);
      expect(box.min.y).toBeCloseTo(0, 5);
      expect(box.max.y).toBeCloseTo(desk.thickness, 5);
      expect(box.min.z).toBeCloseTo(bounds.minZ, 5);
      expect(box.max.z).toBeCloseTo(bounds.maxZ, 5);

      const pos = geometry.attributes.position;
      const norm = geometry.attributes.normal;
      const uv = geometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(norm.getX(i))).toBe(true);
        expect(Number.isFinite(norm.getY(i))).toBe(true);
        expect(Number.isFinite(norm.getZ(i))).toBe(true);
        expect(Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i))).toBeGreaterThan(0.9);
        expect(Number.isFinite(uv.getX(i))).toBe(true);
        expect(Number.isFinite(uv.getY(i))).toBe(true);

        // 顶面与主桌/侧翼接缝两侧保持世界尺度线性 UV，不随总包围盒拉伸
        if (pos.getY(i) > desk.thickness - 1e-4 && norm.getY(i) > 0.9) {
          expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / 1.4 + 0.5, 5);
          expect(uv.getY(i)).toBeCloseTo(-pos.getZ(i) / 0.7 + 0.5, 5);
        }
      }

      geometry.dispose();
    }
  });

  it('内凹缺口内没有任何顶面三角形或竖直射线命中', () => {
    for (const desk of [leftDesk, rightDesk]) {
      const geometry = buildLDeskGeometry(desk);
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      const [, wing] = deskSupportRects(desk);
      const notchX =
        desk.return!.side === 'left'
          ? (wing.maxX + desk.width / 2) / 2
          : (-desk.width / 2 + wing.minX) / 2;
      const notchZ = desk.depth / 2 + desk.return!.extension / 2;

      const notchRay = new Raycaster(new Vector3(notchX, 1, notchZ), new Vector3(0, -1, 0));
      expect(notchRay.intersectObject(mesh)).toHaveLength(0);

      // 主桌、侧翼与接缝处应命中顶面 y = desk.thickness
      for (const [x, z] of [
        [0, 0],
        [(wing.minX + wing.maxX) / 2, (wing.minZ + wing.maxZ) / 2],
        [(wing.minX + wing.maxX) / 2, desk.depth / 2],
      ]) {
        const hit = new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0)).intersectObject(
          mesh,
        );
        expect(hit.length).toBeGreaterThan(0);
        expect(hit[0].point.y).toBeCloseTo(desk.thickness, 5);
      }

      geometry.dispose();
    }
  });

  it('极端厚度与最小宽度下不退化，所有桌腿完整落在实际桌板下方', () => {
    const thinSmall: Desk = {
      width: 0.6,
      depth: 0.35,
      height: 0.4,
      thickness: 0.015,
      color: '#c99e70',
      return: { side: 'right', width: 0.3, extension: 0.3 },
    };
    const thickLarge: Desk = {
      width: 3,
      depth: 1.5,
      height: 1.3,
      thickness: 0.1,
      color: '#c99e70',
      return: { side: 'left', width: 1.2, extension: 2 },
    };

    for (const desk of [thinSmall, thickLarge]) {
      const geometry = buildLDeskGeometry(desk);
      expect(geometry.boundingBox!.max.y).toBeCloseTo(desk.thickness, 5);
      geometry.dispose();

      const legs = deskLegs(desk);
      expect(legs).toHaveLength(6);
      const halfLeg = DESK_LEG_SIZE / 2;
      const rects = deskSupportRects(desk);
      for (const leg of legs) {
        const supported = rects.some(
          (r) =>
            leg.x - halfLeg >= r.minX - 1e-6 &&
            leg.x + halfLeg <= r.maxX + 1e-6 &&
            leg.z - halfLeg >= r.minZ - 1e-6 &&
            leg.z + halfLeg <= r.maxZ + 1e-6,
        );
        expect(supported).toBe(true);
      }
    }
  });
});

describe('L 形镜头适配与阴影视锥', () => {
  it('矩形桌保持原有镜头公式，L 形以真实面积中心为目标并在窄屏最大延伸下完整入框', () => {
    const rectDesk: Desk = {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      color: '#c99e70',
    };
    const rectPose = deskCameraPose(rectDesk, 'perspective', 38, 16 / 9);
    const dist = 1.4 * 1.5;
    expect(rectPose.target).toEqual([0, 0.75 - 0.015, 0]);
    expect(rectPose.position).toEqual([dist * 0.85, 0.75 + dist * 0.68, dist * 0.92]);

    const hugeL: Desk = {
      width: 3,
      depth: 1.5,
      height: 1.3,
      thickness: 0.04,
      color: '#c99e70',
      return: { side: 'left', width: 1.2, extension: 2 },
    };
    const centroid = deskCentroid(hugeL);
    const bounds = deskBounds(hugeL);

    for (const aspect of [16 / 9, 0.5]) {
      for (const kind of ['perspective', 'top', 'front', 'fit'] as const) {
        const pose = deskCameraPose(hugeL, kind, 38, aspect);
        expect(pose.target[0]).toBeCloseTo(centroid.x, 5);
        expect(pose.target[2]).toBeCloseTo(centroid.z, 5);

        const camera = new PerspectiveCamera(38, aspect, 0.01, 100);
        camera.up.set(...pose.up);
        camera.position.set(...pose.position);
        camera.lookAt(...pose.target);
        camera.updateMatrixWorld(true);

        for (const x of [bounds.minX, bounds.maxX]) {
          for (const y of [0, hugeL.height]) {
            for (const z of [bounds.minZ, bounds.maxZ]) {
              const ndc = new Vector3(x, y, z).project(camera);
              expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
              expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }

    const stdHalf = deskShadowHalfSize({
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      color: '#c99e70',
    });
    expect(stdHalf).toBeGreaterThanOrEqual(1.4);
    expect(stdHalf).toBeLessThanOrEqual(2);
    expect(deskShadowHalfSize(hugeL)).toBeGreaterThanOrEqual(3);
  });

  it('矩形桌前侧 R5 cm 倒圆角与标准 60 mm 真实穿孔几何校验', () => {
    const desk: Desk = {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      color: '#c99e70',
      grommet: { enabled: true, side: 'center', diameter: 0.06 },
    };
    const geometry = buildDeskTopGeometry(desk);
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    expect(geometry.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(desk.thickness, 5);

    // 前右角 5 mm 内已被 R5 cm 圆角削去，射线不命中；后右直角正常命中
    expect(
      new Raycaster(new Vector3(0.695, 1, 0.345), new Vector3(0, -1, 0)).intersectObject(mesh),
    ).toHaveLength(0);
    expect(
      new Raycaster(new Vector3(0.695, 1, -0.345), new Vector3(0, -1, 0)).intersectObject(mesh),
    ).not.toHaveLength(0);

    // 60 mm 走线孔中心 (0, -0.26) 与孔内 (0.024, -0.26) 无实体；孔外 (0.035, -0.26) 命中顶面
    expect(
      new Raycaster(new Vector3(0, 1, -0.26), new Vector3(0, -1, 0)).intersectObject(mesh),
    ).toHaveLength(0);
    expect(
      new Raycaster(new Vector3(0.024, 1, -0.26), new Vector3(0, -1, 0)).intersectObject(mesh),
    ).toHaveLength(0);
    expect(
      new Raycaster(new Vector3(0.035, 1, -0.26), new Vector3(0, -1, 0)).intersectObject(mesh),
    ).not.toHaveLength(0);

    geometry.dispose();
  });

  it('L 形桌前角与内凹转角均支持可调倒圆角（左/右 L 形射线验证）', () => {
    const leftR8: Desk = { ...leftDesk, cornerRadius: 0.08 };
    const leftGeo = buildLDeskGeometry(leftR8);
    const leftMesh = new Mesh(leftGeo, new MeshBasicMaterial());
    // 内凹转角 (-0.10, 0.35) 处 R8 cm 内圆弧过渡带内的实体命中，外侧缺口未命中
    expect(
      new Raycaster(new Vector3(-0.082, 1, 0.368), new Vector3(0, -1, 0)).intersectObject(leftMesh),
    ).not.toHaveLength(0);
    expect(
      new Raycaster(new Vector3(-0.065, 1, 0.385), new Vector3(0, -1, 0)).intersectObject(leftMesh),
    ).toHaveLength(0);
    leftGeo.dispose();

    const rightR8: Desk = { ...rightDesk, cornerRadius: 0.08 };
    const rightGeo = buildLDeskGeometry(rightR8);
    const rightMesh = new Mesh(rightGeo, new MeshBasicMaterial());
    expect(
      new Raycaster(new Vector3(0.082, 1, 0.368), new Vector3(0, -1, 0)).intersectObject(rightMesh),
    ).not.toHaveLength(0);
    expect(
      new Raycaster(new Vector3(0.065, 1, 0.385), new Vector3(0, -1, 0)).intersectObject(rightMesh),
    ).toHaveLength(0);
    rightGeo.dispose();
  });

  it('一体成型工位挡板在后侧转角无缝连通、包覆桌缘倒角且贴合前角圆弧起点', () => {
    const rectDesk: Desk = {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      thickness: 0.03,
      cornerRadius: 0.05,
      color: '#c99e70',
    };
    const uGeos = buildDeskPartitionGeometries(rectDesk, {
      back: true,
      left: true,
      right: true,
      height: 0.35,
    })!;
    expect(uGeos).not.toBeNull();

    const wallMesh = new Mesh(uGeos.wallGeometry, new MeshBasicMaterial());
    const apronMesh = new Mesh(uGeos.apronGeometry, new MeshBasicMaterial());

    // 后左与后右 45° 转角（过去为空缺缝隙）必须实体连续连通，且底层密封裙边高度包覆整块桌板厚度
    const cOffset = DESK_PARTITION_THICKNESS * 0.45;
    for (const [cx, cz] of [
      [-rectDesk.width / 2 - cOffset, -rectDesk.depth / 2 - cOffset],
      [rectDesk.width / 2 + cOffset, -rectDesk.depth / 2 - cOffset],
    ]) {
      expect(
        new Raycaster(new Vector3(cx, 1, cz), new Vector3(0, -1, 0)).intersectObject(wallMesh)
          .length,
      ).toBeGreaterThan(0);
      expect(
        new Raycaster(new Vector3(cx, 1, cz), new Vector3(0, -1, 0)).intersectObject(apronMesh)
          .length,
      ).toBeGreaterThan(0);
    }

    // 侧板前缘收止在圆角起切处以内，不悬空突出到 R5 cm 圆角外侧；底层裙边向内咬合桌面倒角密封
    const wallBox = uGeos.wallGeometry.boundingBox!;
    const apronBox = uGeos.apronGeometry.boundingBox!;
    expect(wallBox.max.z).toBeLessThan(rectDesk.depth / 2 - 0.02);
    expect(apronBox.max.y).toBeCloseTo(rectDesk.thickness + 0.008, 4);

    // 单侧 / 无背板 / 双侧组合同样构造有效闭合法线
    for (const cfg of [
      { back: true, left: false, right: false, height: 0.3 },
      { back: true, left: true, right: false, height: 0.3 },
      { back: false, left: true, right: true, height: 0.3 },
    ]) {
      const g = buildDeskPartitionGeometries(rectDesk, cfg)!;
      expect(g.wallGeometry.attributes.position.count).toBeGreaterThan(0);
      expect(g.apronGeometry.attributes.position.count).toBeGreaterThan(0);
      g.wallGeometry.dispose();
      g.apronGeometry.dispose();
    }

    uGeos.wallGeometry.dispose();
    uGeos.apronGeometry.dispose();
  });
});

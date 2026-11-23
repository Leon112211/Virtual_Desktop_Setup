// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { describe, expect, it } from 'vitest';
import {
  ClampToEdgeWrapping,
  Euler,
  LinearFilter,
  Matrix4,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  SpotLight,
  Vector3,
} from 'three';
import {
  createScreenLampCookie,
  SCREEN_LAMP_COOKIE_SIZE,
  SCREEN_LAMP_REFERENCE_INTENSITY,
  screenLampBasis,
  screenLampColor,
  screenLampConeAngle,
  screenLampGuideVertices,
  screenLampSampleIntensity,
  screenLampSamplePositions,
  screenLampTransmission,
} from './screenLampLighting';

const radians = (degrees: number) => (degrees * Math.PI) / 180;

describe('挂灯配光数学', () => {
  it('两采样均分总参考强度，亮度线性变化，零亮度无照明', () => {
    for (const brightness of [0, 20, 60, 100]) {
      expect(screenLampSampleIntensity(brightness) * 2).toBeCloseTo(
        (SCREEN_LAMP_REFERENCE_INTENSITY * brightness) / 100,
      );
    }
    expect(screenLampSampleIntensity(0)).toBe(0);
    expect(screenLampSampleIntensity(100)).toBeCloseTo(screenLampSampleIntensity(50) * 2);
  });

  it('灯长只改变横向采样位置；倾角下两采样仍平行、不汇聚', () => {
    for (const length of [0.3, 0.45, 0.6]) {
      const sources = screenLampSamplePositions(length);
      expect(sources[0].x).toBeCloseTo(-length / 4);
      expect(sources[1].x).toBeCloseTo(length / 4);
      expect(sources[0].y).toBeCloseTo(screenLampSamplePositions(0.45)[0].y);
      expect(sources[0].z).toBeCloseTo(screenLampSamplePositions(0.45)[0].z);
      const { direction } = screenLampBasis(25);
      const targets = sources.map((source) => source.clone().add(direction));
      const rays = targets.map((target, i) => target.sub(sources[i]));
      expect(rays[0].distanceTo(rays[1])).toBeCloseTo(0);
      expect(direction.y).toBeCloseTo(-Math.cos(radians(25)));
      expect(direction.z).toBeCloseTo(Math.sin(radians(25)));
    }
  });

  it('整个合法角度范围内圆锥包住矩形四角', () => {
    for (const h of [60, 90, 110]) {
      for (const v of [20, 35, 55]) {
        const radius = Math.tan(screenLampConeAngle(h, v));
        const corner = Math.hypot(Math.tan(radians(h / 2)), Math.tan(radians(v / 2)));
        expect(radius).toBeCloseTo(1.02 * corner);
        expect(radius).toBeGreaterThan(corner);
        expect(screenLampConeAngle(h, v)).toBeLessThan(Math.PI / 2);
      }
    }
  });

  it('矩形中心平坦、边缘 smoothstep，域外为黑且横纵角独立', () => {
    const h = 90,
      v = 35,
      softness = 0.2;
    const a = Math.tan(radians(h / 2));
    const b = Math.tan(radians(v / 2));
    const sample = (x: number, y: number) => screenLampTransmission(x, y, h, v, softness);
    expect(sample(0, 0)).toBe(1);
    expect(sample(a * 0.7, b * 0.7)).toBe(1);
    expect(sample(a * 0.9, 0)).toBeCloseTo(0.5);
    expect(sample(0, -b * 0.9)).toBeCloseTo(0.5);
    expect(sample(a * 0.9, b * 0.9)).toBeCloseTo(0.25);
    expect(sample(a, 0)).toBe(0);
    expect(sample(0, -b * 1.1)).toBe(0);
    expect(sample(0.5, 0)).toBe(1);
    expect(sample(0, 0.5)).toBe(0);
    expect(screenLampTransmission(a * 0.9, 0, h, v, 0.05)).toBe(1);
    expect(screenLampTransmission(a * 0.9, 0, h, v, 0.35)).toBeLessThan(0.5);
    for (const x of [-2, -0.9, 0, 0.9, 2]) {
      for (const y of [-1, -0.3, 0, 0.3, 1]) {
        expect(sample(x, y)).toBeGreaterThanOrEqual(0);
        expect(sample(x, y)).toBeLessThanOrEqual(1);
        expect(sample(-x, -y)).toBeCloseTo(sample(x, y));
      }
    }
  });

  it('投影轴随显示器俯仰、旋转和横竖屏变化，灯长方向始终为投影横轴', () => {
    for (const roll of [-Math.PI / 2, 0, Math.PI / 2]) {
      for (const tilt of [0, 25, 45]) {
        const rotation = new Quaternion().setFromEuler(new Euler(0.4, 1.2, roll));
        const { direction, up, horizontal } = screenLampBasis(tilt, rotation);
        expect(direction.length()).toBeCloseTo(1);
        expect(up.length()).toBeCloseTo(1);
        expect(direction.dot(up)).toBeCloseTo(0);
        expect(horizontal.dot(up)).toBeCloseTo(0);
        expect(horizontal.dot(direction)).toBeCloseTo(0);
        const camera = new PerspectiveCamera();
        camera.up.copy(up);
        camera.lookAt(direction);
        camera.updateMatrixWorld();
        const cameraHorizontal = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const cameraVertical = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        expect(Math.abs(cameraHorizontal.dot(horizontal))).toBeCloseTo(1);
        expect(cameraVertical.dot(up)).toBeCloseTo(1);
      }
    }
  });

  it('Three 阴影相机投影中的矩形角域与 cookie UV 一致', () => {
    const light = new SpotLight();
    const rotation = new Quaternion().setFromEuler(new Euler(0.3, -0.8, Math.PI / 2));
    const { direction, up, horizontal } = screenLampBasis(25, rotation);
    light.position.set(0.4, 1.2, -0.3);
    light.target.position.copy(light.position).add(direction);
    light.angle = screenLampConeAngle(90, 35);
    light.distance = 2;
    light.shadow.camera.near = 0.01;
    light.shadow.camera.up.copy(up);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    const matrix = new Matrix4().copy(light.shadow.matrix);
    const centre = light.position.clone().addScaledVector(direction, 0.5).applyMatrix4(matrix);
    expect(centre.x).toBeCloseTo(0.5);
    expect(centre.y).toBeCloseTo(0.5);
    const edge = light.position
      .clone()
      .addScaledVector(direction, 0.5)
      .addScaledVector(horizontal, 0.5 * Math.tan(radians(45)))
      .applyMatrix4(matrix);
    expect(Math.abs(edge.x - 0.5)).toBeCloseTo(0.5 / Math.tan(light.angle));
    expect(edge.y).toBeCloseTo(0.5);
    light.dispose();
  });
});

describe('挂灯配光纹理与颜色', () => {
  it('256² 线性灰度写入 RGB，alpha 不承载配光，黑边钳制并线性过滤', () => {
    const cookie = createScreenLampCookie(90, 35, 0.15);
    try {
      expect(cookie.image.width).toBe(SCREEN_LAMP_COOKIE_SIZE);
      expect(cookie.image.height).toBe(SCREEN_LAMP_COOKIE_SIZE);
      expect(cookie.colorSpace).toBe(NoColorSpace);
      expect(cookie.wrapS).toBe(ClampToEdgeWrapping);
      expect(cookie.wrapT).toBe(ClampToEdgeWrapping);
      expect(cookie.magFilter).toBe(LinearFilter);
      expect(cookie.minFilter).toBe(LinearFilter);
      expect(cookie.generateMipmaps).toBe(false);
      const data = cookie.image.data as Uint8Array;
      const n = SCREEN_LAMP_COOKIE_SIZE;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const offset = (y * n + x) * 4;
          expect(data[offset]).toBe(data[offset + 1]);
          expect(data[offset]).toBe(data[offset + 2]);
          expect(data[offset + 3]).toBe(255);
          if (x === 0 || y === 0 || x === n - 1 || y === n - 1) expect(data[offset]).toBe(0);
        }
      }
      expect(data[((n / 2) * n + n / 2) * 4]).toBe(255);
      expect(data.some((value, i) => i % 4 !== 3 && value > 0 && value < 255)).toBe(true);
      const extent = Math.tan(screenLampConeAngle(90, 35));
      for (const [x, y] of [
        [90, 100],
        [180, 130],
        [65, 128],
        [128, 163],
      ]) {
        const expected = Math.round(
          255 *
            screenLampTransmission(
              (((x + 0.5) / n) * 2 - 1) * extent,
              (((y + 0.5) / n) * 2 - 1) * extent,
              90,
              35,
              0.15,
            ),
        );
        expect(data[(y * n + x) * 4]).toBe(expected);
      }
    } finally {
      cookie.dispose();
    }
  });

  it('色温给出有限线性 RGB，暖光更黄，合法范围外也不产生 NaN', () => {
    const warm = screenLampColor(2700);
    const cool = screenLampColor(6500);
    expect(warm.r).toBeGreaterThan(warm.g);
    expect(warm.g).toBeGreaterThan(warm.b);
    expect(warm.b / warm.r).toBeLessThan(cool.b / cool.r);
    for (const temperature of [2700, 4000, 6500, 0, Infinity, NaN]) {
      for (const value of screenLampColor(temperature).toArray()) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(screenLampColor(0).toArray()).toEqual(warm.toArray());
    expect(screenLampColor(9000).toArray()).toEqual(cool.toArray());
    expect(screenLampColor(NaN).toArray()).toEqual(screenLampColor(4000).toArray());
  });

  it('辅助线只有两组中心与四角射线，起点、方向与真实光源一致', () => {
    const vertices = screenLampGuideVertices(0.45, 25, 90, 35);
    expect(vertices.length).toBe(2 * 5 * 2 * 3);
    const sources = screenLampSamplePositions(0.45);
    const { direction } = screenLampBasis(25);
    for (let sample = 0; sample < 2; sample++) {
      for (let ray = 0; ray < 5; ray++) {
        const offset = (sample * 5 + ray) * 6;
        const start = new Vector3().fromArray(vertices, offset);
        const end = new Vector3().fromArray(vertices, offset + 3);
        expect(start.distanceTo(sources[sample])).toBeCloseTo(0, 6);
        expect(end.distanceTo(start)).toBeCloseTo(0.75, 6);
        if (ray === 0) expect(end.sub(start).normalize().distanceTo(direction)).toBeCloseTo(0, 6);
      }
    }
  });
});

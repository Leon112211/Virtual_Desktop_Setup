// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { Matrix4, Vector3 } from 'three';
import { deskBounds, deskCentroid } from '../domain/desk';
import type { Desk } from '../domain/project';

export type CameraViewKind = 'perspective' | 'top' | 'front' | 'fit';

export type CameraPose = {
  target: [number, number, number];
  position: [number, number, number];
  up: [number, number, number];
  maxDistance: number;
};

const PERSPECTIVE_DIR = new Vector3(0.85, 0.68, 0.92).normalize();
const WORLD_UP = new Vector3(0, 1, 0);

export function deskOrbitCenter(desk: Desk): [number, number, number] {
  const centerY = desk.height - desk.thickness / 2;
  if (!desk.return) return [0, centerY, 0];
  const centroid = deskCentroid(desk);
  return [centroid.x, centerY, centroid.z];
}

export function deskCameraPose(
  desk: Desk,
  kind: CameraViewKind,
  fovDeg: number,
  aspect: number,
): CameraPose {
  const center = deskOrbitCenter(desk);
  if (!desk.return) {
    const dist = Math.max(desk.width, desk.depth) * 1.5;
    if (kind === 'top') {
      return {
        target: [0, desk.height, 0],
        position: [0, desk.height + dist, 0.001],
        up: [0, 0, -1],
        maxDistance: 9,
      };
    }
    if (kind === 'front') {
      return {
        target: [0, center[1], 0],
        position: [0, center[1], dist],
        up: [0, 1, 0],
        maxDistance: 9,
      };
    }
    return {
      target: center,
      position: [dist * 0.85, desk.height + dist * 0.68, dist * 0.92],
      up: [0, 1, 0],
      maxDistance: 9,
    };
  }

  const bounds = deskBounds(desk);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * safeAspect;
  const margin = 1.24;

  const [tx, ty, tz] = center;
  if (kind === 'top') {
    const halfW = Math.max(tx - bounds.minX, bounds.maxX - tx);
    const halfH = Math.max(tz - bounds.minZ, bounds.maxZ - tz);
    const dist = Math.max(0.45, margin * Math.max(halfW / tanH, halfH / tanV));
    return {
      target: [tx, desk.height, tz],
      position: [tx, desk.height + dist, tz + 0.001],
      up: [0, 0, -1],
      maxDistance: Math.max(9, dist * 1.6),
    };
  }

  const xs = [bounds.minX, bounds.maxX];
  const ys = [0, desk.height];
  const zs = [bounds.minZ, bounds.maxZ];

  if (kind === 'front') {
    let dist = 0.45;
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          const dx = Math.abs(x - tx);
          const dy = Math.abs(y - ty);
          const zOffset = z - tz;
          dist = Math.max(
            dist,
            zOffset + (dx * margin) / tanH,
            zOffset + (dy * margin) / tanV,
            zOffset + 0.5,
          );
        }
      }
    }
    return {
      target: [tx, ty, tz],
      position: [tx, ty, tz + dist],
      up: [0, 1, 0],
      maxDistance: Math.max(9, dist * 1.6),
    };
  }

  const forward = PERSPECTIVE_DIR.clone().negate();
  const right = new Vector3().crossVectors(forward, WORLD_UP).normalize();
  const camUp = new Vector3().crossVectors(right, forward).normalize();
  const corner = new Vector3();
  let dist = 0.45;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        corner.set(x - tx, y - ty, z - tz);
        const rx = Math.abs(corner.dot(right));
        const ry = Math.abs(corner.dot(camUp));
        const zAlong = corner.dot(PERSPECTIVE_DIR);
        dist = Math.max(
          dist,
          zAlong + (rx * margin) / tanH,
          zAlong + (ry * margin) / tanV,
          zAlong + 0.5,
        );
      }
    }
  }
  return {
    target: [tx, ty, tz],
    position: [
      tx + PERSPECTIVE_DIR.x * dist,
      ty + PERSPECTIVE_DIR.y * dist,
      tz + PERSPECTIVE_DIR.z * dist,
    ],
    up: [0, 1, 0],
    maxDistance: Math.max(9, dist * 1.6),
  };
}

export function deskShadowHalfSize(desk: Desk): number {
  const bounds = deskBounds(desk);
  const lightPos = new Vector3(-2.5, 5, 3);
  const viewMatrix = new Matrix4().lookAt(lightPos, new Vector3(0, 0, 0), WORLD_UP).invert();
  const point = new Vector3();
  let maxHalf = 1.45;
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [0, desk.height + 0.85]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        point.set(x, y, z).applyMatrix4(viewMatrix);
        maxHalf = Math.max(maxHalf, Math.abs(point.x) + 0.35, Math.abs(point.y) + 0.35);
      }
    }
  }
  return Math.ceil(maxHalf * 2) / 2;
}

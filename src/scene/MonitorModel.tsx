import { useEffect, useMemo } from 'react';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { pauseOrbitUntilPointerUp } from './orbitPause';
import {
  BufferGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  SRGBColorSpace,
} from 'three';
import wallpaperUrl from '../assets/screen-wallpaper.jpg';
import {
  DELL_COLUMN_LEAN_RAD,
  MAX_LIFT,
  MIN_LIFT,
  monitorBaseTier,
  monitorParts,
  monitorPose,
  STUDIO_MAX_LIFT,
  type MonitorSettings,
} from '../domain/monitor';
import type { SceneItem, Size } from '../domain/project';
import { useEditor } from '../store/editorStore';
import { ScreenLampModel } from './ScreenLampModel';
import { PortSocket } from './PortSocket';

/**
 * Builds the Dell UltraSharp fan-shaped baseplate: smooth convex circular front arc,
 * tapered straight radial flanks, and a flat straight rear edge behind the stand column.
 */
function createDellBasePlateGeometry(
  width: number,
  depth: number,
  thickness: number,
  beveled = true,
): ExtrudeGeometry {
  const hw = width / 2;
  const maxSin = Math.min(Math.sin((16 * Math.PI) / 180), hw / (depth * 1.4));
  const alpha = Math.max(0.12, Math.asin(Math.max(0.08, maxSin)));
  const rOut = hw / Math.sin(alpha);
  const rIn = (rOut - depth) / Math.cos(alpha);
  const cy = rOut - depth / 2;
  const rearY = cy - rIn * Math.cos(alpha);
  const cr = Math.min(0.009, depth * 0.16, rIn * alpha * 0.35);
  const dOut = cr / rOut;

  const pt = (r: number, theta: number): [number, number] => [
    r * Math.sin(theta),
    cy - r * Math.cos(theta),
  ];

  const s = new Shape();
  const [p1x, p1y] = pt(rOut - cr, -alpha);
  const [c1x, c1y] = pt(rOut, -alpha);
  const [p2x, p2y] = pt(rOut, -alpha + dOut);
  const [c2x, c2y] = pt(rOut, alpha);
  const [p3x, p3y] = pt(rOut - cr, alpha);
  const [p4x, p4y] = pt(rIn + cr, alpha);
  const [c3x, c3y] = pt(rIn, alpha);
  const [c4x, c4y] = pt(rIn, -alpha);
  const [p6x, p6y] = pt(rIn + cr, -alpha);

  s.moveTo(p1x, p1y);
  s.quadraticCurveTo(c1x, c1y, p2x, p2y);
  s.absarc(0, cy, rOut, -Math.PI / 2 - alpha + dOut, -Math.PI / 2 + alpha - dOut, false);
  s.quadraticCurveTo(c2x, c2y, p3x, p3y);
  s.lineTo(p4x, p4y);
  s.quadraticCurveTo(c3x, c3y, c3x - cr, rearY);
  s.lineTo(c4x + cr, rearY);
  s.quadraticCurveTo(c4x, c4y, p6x, p6y);
  s.closePath();

  const geo = new ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: beveled,
    bevelThickness: beveled ? 0.0018 : 0,
    bevelSize: beveled ? 0.002 : 0,
    bevelSegments: beveled ? 2 : 0,
    curveSegments: 24,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * Generates Dell's signature brushed Platinum Silver vertical stand column
 * with an authentic through-cut pill-shaped cable management slot in the lower riser.
 */
function createDellStandColumnGeometry(
  colWidth: number,
  colHeight: number,
  colDepth: number,
): ExtrudeGeometry {
  const hw = colWidth / 2;
  const r = 0.005;
  const s = new Shape();
  s.moveTo(-hw + r, 0);
  s.lineTo(hw - r, 0);
  s.quadraticCurveTo(hw, 0, hw, r);
  s.lineTo(hw * 0.9, colHeight - r);
  s.quadraticCurveTo(hw * 0.9, colHeight, hw * 0.9 - r, colHeight);
  s.lineTo(-hw * 0.9 + r, colHeight);
  s.quadraticCurveTo(-hw * 0.9, colHeight, -hw * 0.9, colHeight - r);
  s.lineTo(-hw, r);
  s.quadraticCurveTo(-hw, 0, -hw + r, 0);

  // Keep oval cable slot fixed in lower stationary riser section (~22–76 mm above baseplate)
  if (colHeight > 0.11) {
    const slotW = colWidth * 0.36;
    const slotH = Math.min(0.056, colHeight * 0.22);
    const slotBottomY = 0.022;
    const sw = slotW / 2;
    const hole = new Path();
    hole.moveTo(-sw, slotBottomY + sw);
    hole.absarc(0, slotBottomY + sw, sw, Math.PI, 0, false);
    hole.lineTo(sw, slotBottomY + slotH - sw);
    hole.absarc(0, slotBottomY + slotH - sw, sw, 0, Math.PI, false);
    hole.closePath();
    s.holes.push(hole);
  }

  const geo = new ExtrudeGeometry(s, {
    depth: colDepth,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.001,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -colDepth / 2);
  return geo;
}

const DELL_DOME_EDGE_Z = 0.0012;
const DELL_DOME_ARCH_DEPTH = 0.0428;

/**
 * Smooth super-cosine pillowed dome equation defining the Dell U2725QE rear arch
 * from slim outer perimeter bezel edge (edgeZ) to the central 55.6 mm peak (edgeZ - archDepth).
 */
function dellDomeZ(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  edgeZ = DELL_DOME_EDGE_Z,
  archDepth = DELL_DOME_ARCH_DEPTH,
): number {
  const ux = Math.min(1, Math.abs(x) / halfW);
  const uy = Math.min(1, Math.abs(y) / halfH);
  const wx = Math.cos((ux * Math.PI) / 2);
  const wy = Math.cos((uy * Math.PI) / 2);
  return edgeZ - archDepth * Math.pow(wx, 0.7) * Math.pow(wy, 0.72);
}

function buildSegmentedAxis(stops: number[], targetStep: number): number[] {
  const sorted = [...new Set(stops)].sort((a, b) => a - b);
  const out: number[] = [sorted[0]];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const span = b - a;
    if (span < 1e-6) continue;
    const segs = Math.max(1, Math.ceil(span / targetStep));
    for (let s = 1; s <= segs; s++) {
      out.push(a + (span * s) / segs);
    }
  }
  return out;
}

function clampToRoundedRect(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  cornerR: number,
): [number, number] {
  const ix = halfW - cornerR;
  const iy = halfH - cornerR;
  if (Math.abs(x) > ix && Math.abs(y) > iy) {
    const dx = Math.abs(x) - ix;
    const dy = Math.abs(y) - iy;
    const d = Math.hypot(dx, dy);
    if (d > cornerR) {
      const s = cornerR / d;
      return [Math.sign(x) * (ix + dx * s), Math.sign(y) * (iy + dy * s)];
    }
  }
  return [x, y];
}

/**
 * Builds the continuous, full-width curved monolithic Dell UltraSharp rear shell
 * without stepped boxes, leaving razor-sharp rectangular openings for the 122×122 VESA
 * pocket and lower downward-facing I/O alcove.
 */
function createDellCurvedBackplateGeometry(
  panelWidth: number,
  panelHeight: number,
  vesaHalf: number,
  ioHalfW: number,
  ioBottom: number,
  ioTop: number,
): BufferGeometry {
  const halfW = (panelWidth - 0.0024) / 2;
  const halfH = (panelHeight - 0.0024) / 2;
  const cornerR = 0.0045;
  const ix = halfW - cornerR;
  const iy = halfH - cornerR;

  const xs = buildSegmentedAxis(
    [
      -halfW,
      -ix - cornerR * 0.5,
      -ix,
      -ioHalfW,
      -vesaHalf,
      vesaHalf,
      ioHalfW,
      ix,
      ix + cornerR * 0.5,
      halfW,
    ],
    0.011,
  );
  const ys = buildSegmentedAxis(
    [
      -halfH,
      ...(ioBottom <= -halfH + 1e-5 ? [-halfH + 0.024] : [-iy - cornerR * 0.5, -iy, ioBottom]),
      ioTop,
      -vesaHalf,
      vesaHalf,
      iy,
      iy + cornerR * 0.5,
      halfH,
    ],
    0.01,
  );

  const nx = xs.length;
  const ny = ys.length;
  const positions: number[] = [];
  const uvs: number[] = [];

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [px, py] = clampToRoundedRect(xs[i], ys[j], halfW, halfH, cornerR);
      const pz = dellDomeZ(px, py, halfW, halfH);
      positions.push(px, py, pz);
      uvs.push(0.5 - px / panelWidth, 0.5 + py / panelHeight);
    }
  }

  const indices: number[] = [];
  const idx = (i: number, j: number) => j * nx + i;
  for (let j = 0; j < ny - 1; j++) {
    const yc = (ys[j] + ys[j + 1]) / 2;
    for (let i = 0; i < nx - 1; i++) {
      const xc = (xs[i] + xs[i + 1]) / 2;
      const inVesa = Math.abs(xc) < vesaHalf && Math.abs(yc) < vesaHalf;
      const inIoBay = Math.abs(xc) < ioHalfW && yc > ioBottom && yc < ioTop;
      if (inVesa || inIoBay) continue;

      const a = idx(i, j);
      const b = idx(i + 1, j);
      const c = idx(i + 1, j + 1);
      const d = idx(i, j + 1);
      indices.push(a, d, c, a, c, b);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an inward recessed rectangular alcove liner matching `dellDomeZ` cleanly along
 * outer edges. When `openBottom` is true (Dell lower I/O bay), the recess runs continuously
 * to the bottom monitor edge with a smooth curved forward transition instead of a closed shelf.
 */
function createDellRecessedBayGeometry(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  backZ: number,
  halfW: number,
  halfH: number,
  openBottom = false,
  vesaHalf = 0.061,
): BufferGeometry {
  const xStops =
    minX < -vesaHalf && maxX > vesaHalf ? [minX, -vesaHalf, vesaHalf, maxX] : [minX, maxX];
  const xs = buildSegmentedAxis(xStops, 0.011);
  const bevelH = openBottom ? Math.min(0.024, (maxY - minY) * 0.35) : 0;
  const ys = openBottom
    ? [
        ...buildSegmentedAxis([minY, minY + bevelH], 0.003),
        ...buildSegmentedAxis([minY + bevelH, maxY], 0.01).slice(1),
      ]
    : buildSegmentedAxis([minY, maxY], 0.01);

  const innerWallZ = (x: number, y: number): number => {
    if (!openBottom || y >= minY + bevelH) return backZ;
    const t = Math.max(0, Math.min(1, (y - minY) / bevelH));
    const curveZ = DELL_DOME_EDGE_Z + (backZ - DELL_DOME_EDGE_Z) * Math.sin((t * Math.PI) / 2);
    return Math.max(curveZ, dellDomeZ(x, y, halfW, halfH) + 0.0003);
  };

  const positions: number[] = [];
  const indices: number[] = [];

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
  ) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // Continuous indexed inner back wall facing -Z (smooth normals across bottom ramp when openBottom)
  const wallBase = positions.length / 3;
  const nx = xs.length;
  const ny = ys.length;
  for (let j = 0; j < ny; j++) {
    const y = ys[j];
    for (let i = 0; i < nx; i++) {
      const x = xs[i];
      positions.push(x, y, innerWallZ(x, y));
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = wallBase + j * nx + i;
      const b = wallBase + j * nx + (i + 1);
      const c = wallBase + (j + 1) * nx + (i + 1);
      const d = wallBase + (j + 1) * nx + i;
      indices.push(a, d, c, a, c, b);
    }
  }

  // Left (+X) & right (-X) inner cheek walls tracing curved shell rim down to minY (+0.8 mm outer under-lap flange to prevent raster pinholes)
  for (let j = 0; j < ny - 1; j++) {
    const y0 = ys[j];
    const y1 = ys[j + 1];
    const zL0 = dellDomeZ(minX - 0.0008, y0, halfW, halfH) + 0.0003;
    const zL1 = dellDomeZ(minX - 0.0008, y1, halfW, halfH) + 0.0003;
    pushQuad(
      [minX, y0, innerWallZ(minX, y0)],
      [minX - 0.0008, y0, zL0],
      [minX - 0.0008, y1, zL1],
      [minX, y1, innerWallZ(minX, y1)],
    );

    const zR0 = dellDomeZ(maxX + 0.0008, y0, halfW, halfH) + 0.0003;
    const zR1 = dellDomeZ(maxX + 0.0008, y1, halfW, halfH) + 0.0003;
    pushQuad(
      [maxX, y0, innerWallZ(maxX, y0)],
      [maxX, y1, innerWallZ(maxX, y1)],
      [maxX + 0.0008, y1, zR1],
      [maxX + 0.0008, y0, zR0],
    );
  }

  // Top overhang ceiling (-Y, where vertical downward ports live) & optional closed bottom shelf
  for (let i = 0; i < nx - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (!openBottom) {
      const zB0 = dellDomeZ(x0, minY - 0.0008, halfW, halfH) + 0.0003;
      const zB1 = dellDomeZ(x1, minY - 0.0008, halfW, halfH) + 0.0003;
      pushQuad(
        [x0, minY, backZ],
        [x1, minY, backZ],
        [x1, minY - 0.0008, zB1],
        [x0, minY - 0.0008, zB0],
      );
    }

    const zT0 = dellDomeZ(x0, maxY + 0.0008, halfW, halfH) + 0.0003;
    const zT1 = dellDomeZ(x1, maxY + 0.0008, halfW, halfH) + 0.0003;
    pushQuad(
      [x0, maxY, backZ],
      [x0, maxY + 0.0008, zT0],
      [x1, maxY + 0.0008, zT1],
      [x1, maxY, backZ],
    );

    if (openBottom) {
      // Subtle 3 mm upper alcove brow lip concealing downward port collars from horizontal rear views
      const browBottomY = maxY - 0.003;
      const zFace0 = dellDomeZ(x0, maxY, halfW, halfH);
      const zFace1 = dellDomeZ(x1, maxY, halfW, halfH);
      pushQuad(
        [x0, browBottomY, zFace0 + 0.0006],
        [x0, maxY + 0.0004, zFace0],
        [x1, maxY + 0.0004, zFace1],
        [x1, browBottomY, zFace1 + 0.0006],
      );
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeDellRearTexture(bodyHex: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bodyHex;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle curved shell satin sheen from top-center highlight across the backplate
  const grad = ctx.createRadialGradient(256, 220, 24, 256, 256, 290);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.01)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Embossed brushed DELL emblem centered cleanly above the VESA collar
  ctx.save();
  ctx.strokeStyle = 'rgba(66, 76, 90, 0.52)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(256, 120, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(60, 70, 84, 0.78)';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DELL', 256, 121);
  ctx.restore();

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createRoundedPanelBlockGeometry(
  width: number,
  height: number,
  depth: number,
  cornerRadius: number,
  bevel: number,
): ExtrudeGeometry {
  const hw = width / 2 - bevel;
  const hh = height / 2 - bevel;
  const r = Math.max(0.001, cornerRadius - bevel);
  const s = new Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - r);
  s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hh);
  s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + r);
  s.absarc(-hw + r, -hh + r, r, Math.PI, (3 * Math.PI) / 2, false);
  s.closePath();

  const extrudeD = Math.max(0.0005, depth - 2 * bevel);
  const geo = new ExtrudeGeometry(s, {
    depth: extrudeD,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -extrudeD / 2);
  return geo;
}

function createAppleFootPlateGeometry(width: number, depth: number): ExtrudeGeometry {
  const hw = width / 2 - 0.001;
  const hd = depth / 2 - 0.001;
  const r = 0.007;
  const s = new Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - r);
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hd);
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + r);
  s.absarc(-hw + r, -hd + r, r, Math.PI, (3 * Math.PI) / 2, false);
  s.closePath();

  const geo = new ExtrudeGeometry(s, {
    depth: 0.0024,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.001,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function createAppleStandArmGeometry(
  width: number,
  length: number,
  thickness: number,
): ExtrudeGeometry {
  const hw = width / 2;
  const r = 0.003;
  const s = new Shape();
  s.moveTo(-hw + r, 0);
  s.lineTo(hw - r, 0);
  s.quadraticCurveTo(hw, 0, hw, r);
  s.lineTo(hw, length - r);
  s.quadraticCurveTo(hw, length, hw - r, length);
  s.lineTo(-hw + r, length);
  s.quadraticCurveTo(-hw, length, -hw, length - r);
  s.lineTo(-hw, r);
  s.quadraticCurveTo(-hw, 0, -hw + r, 0);

  // Signature Apple circular-ended pill cable cutout in lower third of L-arm
  const slotW = 0.022;
  const slotH = Math.min(0.056, length * 0.25);
  const slotBottomY = 0.026;
  if (length > 0.1) {
    const sw = slotW / 2;
    const hole = new Path();
    hole.moveTo(-sw, slotBottomY + sw);
    hole.absarc(0, slotBottomY + sw, sw, Math.PI, 0, false);
    hole.lineTo(sw, slotBottomY + slotH - sw);
    hole.absarc(0, slotBottomY + slotH - sw, sw, 0, Math.PI, false);
    hole.closePath();
    s.holes.push(hole);
  }

  const geo = new ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

function makeStudioRearTexture(bodyHex: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bodyHex;
  ctx.fillRect(0, 0, 512, 512);

  // Top hidden micro-dot thermal ventilation band
  ctx.fillStyle = 'rgba(28, 34, 44, 0.45)';
  for (let x = 70; x <= 442; x += 6) {
    ctx.beginPath();
    ctx.arc(x, 12, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glossy dark-silver embossed Apple emblem centered above stand hinge (solid silhouette, no overlap seam)
  ctx.save();
  ctx.translate(256, 138);
  ctx.scale(1.15, 1.15);
  ctx.fillStyle = '#6b7585';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.bezierCurveTo(6, -15, 15, -13, 18, -7);
  ctx.bezierCurveTo(12, -3, 12, 6, 18, 10);
  ctx.bezierCurveTo(15, 16, 10, 21, 5, 21);
  ctx.bezierCurveTo(2, 21, 1, 19, -1, 19);
  ctx.bezierCurveTo(-3, 19, -4, 21, -7, 21);
  ctx.bezierCurveTo(-13, 21, -19, 13, -19, 2);
  ctx.bezierCurveTo(-19, -9, -11, -14, -5, -13);
  ctx.bezierCurveTo(-2, -13, 0, -10, 0, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(3.5, -20.5, 4.2, 7.8, 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Subtle vertical anodized aluminum sheen highlight
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.03)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.09)');
  grad.addColorStop(1, 'rgba(0,0,0,0.03)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function MonitorModel({
  itemId,
  size,
  color,
  monitor,
  pitch = 0,
  roll = 0,
  lift = 0,
  hideStand = false,
  screenLamp,
  lampSelected = false,
}: {
  itemId?: string;
  size: Size;
  color: string;
  monitor?: MonitorSettings;
  pitch?: number;
  roll?: number;
  lift?: number;
  hideStand?: boolean;
  screenLamp?: SceneItem;
  lampSelected?: boolean;
}) {
  if (monitor?.model === 'studioDisplay') {
    return (
      <StudioDisplayModel
        size={size}
        color={color}
        monitor={monitor}
        pitch={pitch}
        roll={roll}
        lift={lift}
        hideStand={hideStand}
        screenLamp={screenLamp}
        lampSelected={lampSelected}
      />
    );
  }
  return (
    <DellMonitorModel
      itemId={itemId}
      size={size}
      color={color}
      monitor={monitor}
      pitch={pitch}
      roll={roll}
      lift={lift}
      hideStand={hideStand}
      screenLamp={screenLamp}
      lampSelected={lampSelected}
    />
  );
}

function StudioDisplayModel({
  size,
  color,
  monitor,
  pitch = 0,
  roll = 0,
  lift = 0,
  hideStand = false,
  screenLamp,
  lampSelected = false,
}: {
  size: Size;
  color: string;
  monitor?: MonitorSettings;
  pitch?: number;
  roll?: number;
  lift?: number;
  hideStand?: boolean;
  screenLamp?: SceneItem;
  lampSelected?: boolean;
}) {
  const wallpaper = useTexture(wallpaperUrl);
  wallpaper.colorSpace = SRGBColorSpace;

  const { screenWidth, screenHeight, panelHeight, standHeight } = monitorParts(
    size,
    'studioDisplay',
  );
  const pose = monitorPose(size, { pitch, roll, lift, monitor, hasMonitorArm: hideStand });
  const tier = monitorBaseTier(size, monitor);
  const panelWidth = size.width;
  const basePanelY = standHeight + panelHeight / 2;
  const panelY = pose.pivotY + panelHeight / 2;
  const isHeightStand = monitor?.standType === 'height';

  // Fixed-length Apple L-arm: stays invariant in height/angle across lift adjustments while carriage slides on track.
  const footCenterZ = -0.025;
  const armBottomZ = footCenterZ - tier.baseDepth * 0.34;
  const armTopZ = -0.044;
  const armBottomY = 0.004;
  const armFixedTopY = basePanelY + (isHeightStand ? STUDIO_MAX_LIFT + 0.016 : 0.01);
  const armDx = 0;
  const armDy = armFixedTopY - armBottomY;
  const armDz = armTopZ - armBottomZ;
  const armLength = Math.max(0.1, Math.hypot(armDx, armDy, armDz));
  const armPitchX = Math.atan2(armDz, armDy);
  const slideT = Math.max(0, Math.min(1, (panelY - armBottomY) / Math.max(0.05, armDy)));
  const carriageArmZ = armBottomZ + armDz * slideT;

  const chassisGeo = useMemo(
    () => createRoundedPanelBlockGeometry(panelWidth, panelHeight, 0.03, 0.005, 0.001),
    [panelWidth, panelHeight],
  );
  const footGeo = useMemo(
    () => createAppleFootPlateGeometry(tier.baseWidth, tier.baseDepth),
    [tier.baseWidth, tier.baseDepth],
  );
  const standArmGeo = useMemo(
    () => createAppleStandArmGeometry(tier.columnWidth, armLength, isHeightStand ? 0.0085 : 0.0065),
    [tier.columnWidth, armLength, isHeightStand],
  );
  const rearTex = useMemo(() => makeStudioRearTexture(color), [color]);

  useEffect(
    () => () => {
      chassisGeo.dispose();
      footGeo.dispose();
      standArmGeo.dispose();
      rearTex.dispose();
    },
    [chassisGeo, footGeo, standArmGeo, rearTex],
  );

  return (
    <group>
      {!hideStand && (
        <group>
          {/* Apple ultra-slim machined brushed aluminum footplate + matte non-slip silicone base */}
          <mesh position={[0, 0.0006, footCenterZ]} receiveShadow>
            <boxGeometry args={[tier.baseWidth * 0.94, 0.0012, tier.baseDepth * 0.94]} />
            <meshStandardMaterial color="#15181d" roughness={0.92} />
          </mesh>
          <mesh geometry={footGeo} position={[0, 0.0012, footCenterZ]} castShadow receiveShadow>
            <meshStandardMaterial color={color} metalness={0.78} roughness={0.26} />
          </mesh>

          {/* Stationary fixed-length brushed aluminum L-arm (tilts back to footplate with oval cable routing slot) */}
          <mesh
            name="studio-stand-arm"
            geometry={standArmGeo}
            position={[0, armBottomY, armBottomZ]}
            rotation={[armPitchX, 0, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} metalness={0.78} roughness={0.26} />
          </mesh>

          {/* Height-adjustable stand internal slide track + movable VESA carriage */}
          {isHeightStand && (
            <>
              <mesh
                position={[0, armBottomY + armDy * 0.64, armBottomZ + armDz * 0.64 + 0.0046]}
                rotation={[armPitchX, 0, 0]}
                castShadow
              >
                <boxGeometry args={[0.024, armLength * 0.44, 0.002]} />
                <meshStandardMaterial color="#252b35" roughness={0.55} metalness={0.35} />
              </mesh>
              <group
                name="studio-vesa-carriage"
                position={[0, panelY, (carriageArmZ + (-0.024 + pose.pivotZOffset)) / 2]}
              >
                <RoundedBox
                  args={[
                    0.044,
                    0.036,
                    Math.max(0.024, Math.abs(-0.024 + pose.pivotZOffset - carriageArmZ) + 0.01),
                  ]}
                  radius={0.005}
                  smoothness={2}
                  castShadow
                >
                  <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
                </RoundedBox>
                <mesh
                  position={[0, 0, Math.abs(-0.024 + pose.pivotZOffset - carriageArmZ) / 2 - 0.002]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.013, 0.013, 0.048, 20]} />
                  <meshStandardMaterial color="#b4bac4" metalness={0.78} roughness={0.26} />
                </mesh>
              </group>
            </>
          )}
        </group>
      )}

      {/* Unibody Apple Studio Display assembly */}
      <group
        position={[0, panelY, -0.02 + pose.pivotZOffset]}
        rotation={[(pose.pitchDeg * Math.PI) / 180, 0, (pose.rollDeg * Math.PI) / 180]}
      >
        {screenLamp && (
          <group position={[0, panelHeight / 2, 0]}>
            <ScreenLampModel item={screenLamp} selected={lampSelected} />
          </group>
        )}

        {/* 31 mm flat-edged anodized aluminum unibody shell (z ∈ [-0.0175 .. +0.0125]) */}
        <mesh geometry={chassisGeo} position={[0, 0, -0.0025]} castShadow receiveShadow>
          <meshStandardMaterial color={color} metalness={0.78} roughness={0.26} />
        </mesh>

        {/* Dedicated UV-mapped rear anodized aluminum face (top micro-vents + Apple emblem) */}
        <mesh position={[0, 0, -0.0176]} rotation={[0, Math.PI, 0]} receiveShadow>
          <planeGeometry args={[panelWidth - 0.012, panelHeight - 0.012]} />
          <meshStandardMaterial map={rearTex} metalness={0.72} roughness={0.28} />
        </mesh>

        {/* Flush black edge-to-edge front glass faceplate inside 1.2 mm silver aluminum rim */}
        <RoundedBox
          args={[panelWidth - 0.0024, panelHeight - 0.0024, 0.002]}
          radius={0.004}
          smoothness={3}
          position={[0, 0, 0.012]}
        >
          <meshStandardMaterial color="#0c0f15" roughness={0.18} metalness={0.12} />
        </RoundedBox>

        {/* 27" 5K Retina 16:9 display panel */}
        <mesh position={[0, 0, 0.0131]}>
          <planeGeometry args={[screenWidth, screenHeight]} />
          <meshBasicMaterial map={wallpaper} toneMapped={false} />
        </mesh>

        {/* Centered 12MP Ultra Wide Center Stage camera lens in upper black glass bezel */}
        <group position={[0, panelHeight / 2 - 0.0063, 0.0132]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0024, 0.0024, 0.0006, 14]} />
            <meshStandardMaterial color="#181e28" roughness={0.2} metalness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.00035]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0011, 0.0011, 0.0003, 12]} />
            <meshStandardMaterial color="#2c5088" roughness={0.1} metalness={0.65} />
          </mesh>
        </group>

        {/* Rear VESA round hub (when on MonitorArm) OR sleek machined aluminum hinge neck */}
        {hideStand ? (
          <mesh position={[0, 0, -0.0185]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.058, 0.003, 24]} />
            <meshStandardMaterial color="#cfd4dc" metalness={0.75} roughness={0.28} />
          </mesh>
        ) : (
          <group>
            <mesh position={[0, 0, -0.0235]} castShadow>
              <boxGeometry args={[tier.columnWidth - 0.012, 0.022, 0.012]} />
              <meshStandardMaterial color="#c8cdd5" metalness={0.76} roughness={0.28} />
            </mesh>
            <mesh position={[0, 0.011, -0.0182]}>
              <boxGeometry args={[tier.columnWidth + 0.002, 0.004, 0.0018]} />
              <meshStandardMaterial color="#383e48" roughness={0.55} />
            </mesh>
          </group>
        )}

        {/* Rear ports clear of stand arm: 4× 1:1 borderless USB-C / Thunderbolt 3 on right (-X) + AC cord exit on left (+X) */}
        {[-0.122, -0.106, -0.09, -0.074].map((px, idx) => (
          <PortSocket
            key={`tb-${idx}`}
            kind="usbc"
            position={[px, -panelHeight * 0.25, -0.0176]}
            rotation={[0, Math.PI, 0]}
            borderless
          />
        ))}
        <mesh position={[0.082, -panelHeight * 0.25, -0.0185]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0065, 0.0065, 0.003, 18]} />
          <meshStandardMaterial color="#171a20" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function DellMonitorModel({
  itemId,
  size,
  color,
  monitor,
  pitch = 0,
  roll = 0,
  lift = 0,
  hideStand = false,
  screenLamp,
  lampSelected = false,
}: {
  itemId?: string;
  size: Size;
  color: string;
  monitor?: MonitorSettings;
  pitch?: number;
  roll?: number;
  lift?: number;
  hideStand?: boolean;
  screenLamp?: SceneItem;
  lampSelected?: boolean;
}) {
  const { gl, controls, invalidate } = useThree();
  const orbit = controls as unknown as OrbitControlsImpl | null;
  const wallpaper = useTexture(wallpaperUrl);
  wallpaper.colorSpace = SRGBColorSpace;
  const hubOpen = monitor?.quickHubOpen ?? true;

  function toggleQuickHub() {
    if (!itemId) return;
    const s = useEditor.getState();
    s.select(itemId);
    s.updateItem(itemId, {
      monitor: {
        model: monitor?.model ?? 'dell',
        ...(monitor?.standType ? { standType: monitor.standType } : {}),
        quickHubOpen: !hubOpen,
      },
    });
  }

  const { screenWidth, screenHeight, panelHeight, standHeight, screenOffsetY } = monitorParts(
    size,
    monitor?.model,
  );
  const pose = monitorPose(size, { pitch, roll, lift, monitor, hasMonitorArm: hideStand });
  const tier = monitorBaseTier(size, monitor);
  const panelWidth = size.width;
  const basePanelY = standHeight + panelHeight / 2;
  const panelY = pose.pivotY + panelHeight / 2;

  // Dell UltraSharp stand: compact flat-rear fan platter + shortened fixed-height inclined column.
  // The carriage + cantilever neck + monitor assembly slide rigidly parallel to the inclined column
  // over [-5 cm .. +5 cm] (capped cleanly right above +5 cm max lift without unused tall riser).
  const colZ = -0.064;
  const colBaseY = 0.008;
  const colLeanRad = DELL_COLUMN_LEAN_RAD;
  const baseVisWidth = tier.baseWidth * 0.88;
  const baseVisDepth = tier.baseDepth * 0.88;
  const baseCenterZ = colZ + baseVisDepth * 0.31;
  const basePlateH = 0.007;
  const colFixedTopY = basePanelY + MAX_LIFT + 0.022;
  const colHeight = Math.max(0.16, colFixedTopY - colBaseY);
  const colDepth = 0.021;
  const trackBottomY = Math.max(0.06, basePanelY + MIN_LIFT - colBaseY - 0.022);
  const trackTopY = Math.max(trackBottomY + 0.04, colHeight - 0.014);
  const trackH = trackTopY - trackBottomY;
  const trackMidY = (trackBottomY + trackTopY) / 2;
  const carriageY = Math.max(colBaseY + 0.045, Math.min(panelY, colFixedTopY - 0.02));
  const carriageColZ = colZ + Math.tan(colLeanRad) * (carriageY - colBaseY);
  const shuttleFrontZ = colDepth * 0.36;
  const panelZ = -0.02 + pose.pivotZOffset;
  const vesaPlateZLocal = -0.039 + pose.pivotZOffset - carriageColZ;
  const hingeZLocal = -0.047 + pose.pivotZOffset - carriageColZ;
  const neckCenterZ = (shuttleFrontZ + hingeZLocal) / 2;
  const neckLengthZ = Math.max(0.016, hingeZLocal - shuttleFrontZ + 0.006);

  const halfW = (panelWidth - 0.0024) / 2;
  const halfH = (panelHeight - 0.0024) / 2;
  const vesaHalf = 0.061;
  const ioHalfW = Math.min(0.148, panelWidth * 0.242);
  const ioTop = -0.069;
  const ioBottom = -halfH;
  const ioRoofY = ioTop - 0.0006;
  const ioPortZ = -0.0165;
  const joyX = panelWidth * 0.34;
  const joyY = Math.max(-halfH + 0.026, -0.141);
  const joyZ = dellDomeZ(joyX, joyY, halfW, halfH);

  const baseGeo = useMemo(
    () => createDellBasePlateGeometry(baseVisWidth, baseVisDepth, basePlateH),
    [baseVisWidth, baseVisDepth],
  );
  useEffect(() => () => baseGeo.dispose(), [baseGeo]);

  const basePadGeo = useMemo(
    () => createDellBasePlateGeometry(baseVisWidth * 0.94, baseVisDepth * 0.93, 0.002, false),
    [baseVisWidth, baseVisDepth],
  );
  useEffect(() => () => basePadGeo.dispose(), [basePadGeo]);

  const colGeo = useMemo(
    () => createDellStandColumnGeometry(tier.columnWidth, colHeight, colDepth),
    [tier.columnWidth, colHeight],
  );
  useEffect(() => () => colGeo.dispose(), [colGeo]);

  const curvedBackGeo = useMemo(
    () =>
      createDellCurvedBackplateGeometry(
        panelWidth,
        panelHeight,
        vesaHalf,
        ioHalfW,
        ioBottom,
        ioTop,
      ),
    [panelWidth, panelHeight, ioHalfW, ioBottom],
  );
  useEffect(() => () => curvedBackGeo.dispose(), [curvedBackGeo]);

  const vesaPocketGeo = useMemo(
    () =>
      createDellRecessedBayGeometry(-vesaHalf, vesaHalf, -vesaHalf, vesaHalf, -0.022, halfW, halfH),
    [halfW, halfH],
  );
  useEffect(() => () => vesaPocketGeo.dispose(), [vesaPocketGeo]);

  const ioAlcoveGeo = useMemo(
    () =>
      createDellRecessedBayGeometry(
        -ioHalfW,
        ioHalfW,
        ioBottom,
        ioTop,
        -0.008,
        halfW,
        halfH,
        true,
        vesaHalf,
      ),
    [ioHalfW, ioBottom, halfW, halfH],
  );
  useEffect(() => () => ioAlcoveGeo.dispose(), [ioAlcoveGeo]);

  const rearTex = useMemo(() => makeDellRearTexture(color), [color]);
  useEffect(() => () => rearTex.dispose(), [rearTex]);

  return (
    <group>
      {!hideStand && (
        <group>
          {/* U2725QE concentric annular-sector platter + matching non-slip pad + screw handle */}
          <mesh geometry={basePadGeo} position={[0, 0.001, baseCenterZ]} castShadow receiveShadow>
            <meshStandardMaterial color="#16191e" roughness={0.9} />
          </mesh>
          <mesh geometry={baseGeo} position={[0, 0.003, baseCenterZ]} castShadow receiveShadow>
            <meshStandardMaterial color={color} metalness={0.62} roughness={0.34} />
          </mesh>
          <mesh position={[0, 0.002, colZ - 0.008]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.004, 0.004, 0.018, 12]} />
            <meshStandardMaterial color="#1c212a" roughness={0.6} />
          </mesh>

          {/* Stationary rearward-leaning Silver riser column w/ oval cable cutout & front slide track */}
          <group
            name="dell-stand-column"
            position={[0, colBaseY, colZ]}
            rotation={[colLeanRad, 0, 0]}
          >
            <mesh geometry={colGeo} castShadow receiveShadow>
              <meshStandardMaterial color={color} metalness={0.64} roughness={0.32} />
            </mesh>
            {/* Subtle base collar flange where column meets fan platter */}
            <RoundedBox
              args={[tier.columnWidth + 0.006, 0.007, colDepth + 0.006]}
              radius={0.0025}
              smoothness={2}
              position={[0, 0.0035, 0]}
            >
              <meshStandardMaterial color="#a9b1bc" metalness={0.66} roughness={0.32} />
            </RoundedBox>
            {/* Flush dark top end-cap insert */}
            <RoundedBox
              args={[tier.columnWidth * 0.86, 0.003, colDepth * 0.86]}
              radius={0.001}
              smoothness={2}
              position={[0, colHeight - 0.001, 0]}
            >
              <meshStandardMaterial color="#252c36" roughness={0.55} />
            </RoundedBox>
            {/* Front-facing inner glide channel rail (invisible from clean silver rear view) */}
            <mesh position={[0, trackMidY, colDepth / 2 + 0.0002]}>
              <boxGeometry args={[tier.columnWidth * 0.34, trackH, 0.0016]} />
              <meshStandardMaterial color="#242a34" roughness={0.58} />
            </mesh>
          </group>

          {/* Single sleek CNC VESA sliding carriage + horizontal tilt barrel travelling inside column rail */}
          <group name="dell-vesa-carriage" position={[0, carriageY, carriageColZ]}>
            {/* Precision internal track glider tucked inside front column slot (zero bulky outer collar) */}
            <RoundedBox
              args={[tier.columnWidth * 0.42, 0.044, 0.012]}
              radius={0.003}
              smoothness={2}
              position={[0, 0, shuttleFrontZ]}
              rotation={[colLeanRad, 0, 0]}
              castShadow
            >
              <meshStandardMaterial color="#9ea6b2" metalness={0.66} roughness={0.32} />
            </RoundedBox>
            {/* Sleek contoured horizontal cantilever neck bridging rail shuttle to tilt pivot */}
            <RoundedBox
              args={[0.034, 0.03, neckLengthZ]}
              radius={0.007}
              smoothness={3}
              position={[0, 0, neckCenterZ]}
              castShadow
            >
              <meshStandardMaterial color={color} metalness={0.64} roughness={0.32} />
            </RoundedBox>
            {/* Horizontal anodized cylindrical tilt pivot barrel */}
            <mesh position={[0, 0, hingeZLocal]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.0145, 0.0145, 0.044, 24]} />
              <meshStandardMaterial color="#959eab" metalness={0.72} roughness={0.28} />
            </mesh>
            {/* Quick-release 112×112 mm VESA docking plate seated in curved monitor bay */}
            <RoundedBox
              args={[0.112, 0.112, 0.007]}
              radius={0.004}
              smoothness={2}
              position={[0, 0, vesaPlateZLocal]}
              castShadow
            >
              <meshStandardMaterial color="#202630" metalness={0.38} roughness={0.48} />
            </RoundedBox>
            {/* Bottom quick-release push button */}
            <mesh position={[0, -0.055, vesaPlateZLocal - 0.002]} castShadow>
              <boxGeometry args={[0.024, 0.007, 0.008]} />
              <meshStandardMaterial color="#181d25" roughness={0.52} />
            </mesh>
          </group>
        </group>
      )}

      {/* Screen sub-assembly: 612.44 × 353.51 × 55.60 mm U2725QE body sliding parallel to tilted column */}
      <group
        position={[0, panelY, panelZ]}
        rotation={[(pose.pitchDeg * Math.PI) / 180, 0, (pose.rollDeg * Math.PI) / 180]}
      >
        {screenLamp && (
          <group position={[0, panelHeight / 2, 0]}>
            <ScreenLampModel item={screenLamp} selected={lampSelected} />
          </group>
        )}

        {/* Slim Silver perimeter bezel wrap (z ∈ [+0.0012 .. +0.0130], keeps ScreenLamp compatible) */}
        <RoundedBox
          args={[panelWidth, panelHeight, 0.0118]}
          radius={0.0045}
          smoothness={2}
          position={[0, 0, 0.0071]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={0.38} metalness={0.42} />
        </RoundedBox>

        {/* Matte black 4-sided Narrow Bezel surround (7.85 mm L/R/T, 10.00 mm bottom chin) */}
        <RoundedBox
          args={[panelWidth - 0.0024, panelHeight - 0.0024, 0.0078]}
          radius={0.003}
          smoothness={2}
          position={[0, 0, 0.0094]}
        >
          <meshStandardMaterial color="#13161c" roughness={0.55} metalness={0.08} />
        </RoundedBox>

        {/* Continuous monolithic pillowed-arch Silver rear shell (zero boxy steps) */}
        <mesh geometry={curvedBackGeo} castShadow receiveShadow>
          <meshStandardMaterial map={rearTex} roughness={0.36} metalness={0.38} />
        </mesh>

        {/* Recessed 122×122 mm VESA pocket (color-matched flush quick-release cover when on stand) */}
        <mesh geometry={vesaPocketGeo} receiveShadow>
          <meshStandardMaterial
            color={hideStand ? '#1d232c' : color}
            roughness={hideStand ? 0.58 : 0.38}
            metalness={hideStand ? 0.25 : 0.36}
          />
        </mesh>
        {!hideStand && (
          <RoundedBox
            args={[0.119, 0.119, 0.015]}
            radius={0.004}
            smoothness={2}
            position={[0, 0, -0.031]}
            receiveShadow
          >
            <meshStandardMaterial color={color} roughness={0.38} metalness={0.36} />
          </RoundedBox>
        )}
        {[-0.05, 0.05].flatMap((vx) =>
          [-0.05, 0.05].map((vy) => (
            <mesh key={`m4-${vx}${vy}`} position={[vx, vy, -0.0205]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0035, 0.0035, 0.003, 12]} />
              <meshStandardMaterial color="#8d96a5" metalness={0.82} roughness={0.26} />
            </mesh>
          )),
        )}

        {/* Rectangular lower I/O alcove liner matching surrounding Platinum Silver curved shell */}
        <mesh geometry={ioAlcoveGeo} receiveShadow>
          <meshStandardMaterial color={color} roughness={0.38} metalness={0.36} />
        </mesh>

        {/* All rear ports mounted VERTICALLY DOWNWARD matching official Dell U2725QE diagram (1..12) */}
        {/* 1. Kensington lock slot (vertical) */}
        <mesh position={[0.128, ioRoofY - 0.0002, ioPortZ]}>
          <boxGeometry args={[0.0032, 0.0014, 0.0072]} />
          <meshStandardMaterial color="#0b0d11" roughness={0.5} />
        </mesh>
        {/* 2. AC Power IEC C14 3-prong receptacle */}
        <PortSocket
          kind="iecC14"
          position={[0.1, ioRoofY, ioPortZ]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* 3. HDMI 2.1 */}
        <PortSocket
          kind="hdmi"
          position={[0.062, ioRoofY, ioPortZ]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* 4 & 5. DisplayPort 1.4 In + DisplayPort 1.4 Out (MST) */}
        <PortSocket kind="dp" position={[0.041, ioRoofY, ioPortZ]} rotation={[Math.PI / 2, 0, 0]} />
        <PortSocket kind="dp" position={[0.02, ioRoofY, ioPortZ]} rotation={[Math.PI / 2, 0, 0]} />
        {/* 12. Stand quick-release lock bore (set back toward -Z edge) */}
        <mesh position={[0.006, ioRoofY - 0.0002, ioPortZ - 0.0085]}>
          <cylinderGeometry args={[0.0022, 0.0022, 0.0014, 12]} />
          <meshStandardMaterial color="#0c0f14" roughness={0.55} />
        </mesh>
        {/* 6. Thunderbolt 4 Downstream (15W daisy-chain) */}
        <PortSocket
          kind="usbc"
          position={[-0.004, ioRoofY, ioPortZ]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* 7. Thunderbolt 4 Upstream (DP 1.4 + 140W) */}
        <PortSocket
          kind="usbc"
          position={[-0.017, ioRoofY, ioPortZ]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* 8. SuperSpeed USB 10Gbps Type-C Upstream */}
        <PortSocket
          kind="usbc"
          position={[-0.03, ioRoofY, ioPortZ + 0.001]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* 9 (left bank). 3× Vertical SuperSpeed USB 10Gbps Type-A Downstream */}
        {[-0.045, -0.055, -0.065].map((ux) => (
          <PortSocket
            key={`usba-v-${ux}`}
            kind="usba"
            position={[ux, ioRoofY, ioPortZ]}
            rotation={[Math.PI / 2, 0, Math.PI / 2]}
          />
        ))}
        {/* 10. 3.5 mm Audio Line-Out jack */}
        <mesh position={[-0.08, ioRoofY - 0.0002, ioPortZ]}>
          <cylinderGeometry args={[0.0026, 0.0026, 0.0018, 14]} />
          <meshStandardMaterial color="#101318" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* 9 (4th port). Vertical SuperSpeed USB 10Gbps Type-A Downstream */}
        <PortSocket
          kind="usba"
          position={[-0.095, ioRoofY, ioPortZ]}
          rotation={[Math.PI / 2, 0, Math.PI / 2]}
        />
        {/* 11. RJ45 2.5GbE LAN port */}
        <PortSocket
          kind="rj45"
          position={[-0.118, ioRoofY, ioPortZ]}
          rotation={[Math.PI / 2, 0, Math.PI]}
        />

        {/* Rear 5-way OSD joystick & micro power dot flush on left (+X rear view) curved flank */}
        <mesh position={[joyX, joyY, joyZ - 0.0025]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0052, 0.0064, 0.005, 14]} />
          <meshStandardMaterial color="#171b22" roughness={0.5} />
        </mesh>
        <mesh
          position={[joyX + 0.018, joyY, dellDomeZ(joyX + 0.018, joyY, halfW, halfH) - 0.0012]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.0032, 0.0036, 0.0025, 12]} />
          <meshStandardMaterial color="#171b22" roughness={0.5} />
        </mesh>

        {/* 13. Interactive vertical pop-out / retractable QAP chin Hub on outer bezel corner (-X) */}
        <group
          name="dell-quick-hub"
          position={[-panelWidth * 0.39, -panelHeight / 2, 0.004]}
          onPointerOver={(e) => {
            if (!itemId) return;
            e.stopPropagation();
            gl.domElement.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            gl.domElement.style.cursor = 'auto';
          }}
          onClick={(e) => {
            if (e.button !== 0 || e.delta > 5) return;
            e.stopPropagation();
            toggleQuickHub();
          }}
          onPointerDown={(e) => {
            if (e.button !== 2) return;
            e.stopPropagation();
            pauseOrbitUntilPointerUp(orbit, invalidate);
            toggleQuickHub();
          }}
        >
          {/* Invisible hit pad around the chin push-latch so left-clicking works smoothly even when retracted */}
          <mesh position={[0, -0.002, 0.004]}>
            <boxGeometry args={[0.048, 0.012, 0.022]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {/* Flush push-latch recess trim visible on underside of chin when retracted */}
          <mesh position={[0, -0.0009, 0.001]} castShadow>
            <boxGeometry args={[0.042, 0.002, 0.012]} />
            <meshStandardMaterial color="#1a1f28" roughness={0.5} metalness={0.35} />
          </mesh>
          {hubOpen && (
            <group position={[0, -0.009, 0.002]}>
              <RoundedBox args={[0.042, 0.019, 0.0135]} radius={0.0024} smoothness={2} castShadow>
                <meshStandardMaterial color="#232933" roughness={0.44} metalness={0.36} />
              </RoundedBox>
              <PortSocket
                kind="usba"
                position={[-0.011, 0, 0.0069]}
                rotation={[0, 0, Math.PI / 2]}
              />
              <PortSocket
                kind="usbc"
                position={[0.011, 0, 0.0069]}
                rotation={[0, 0, Math.PI / 2]}
              />
            </group>
          )}
        </group>

        {/* Screen surface (+Z): 596.74 × 335.66 mm positioned +1.075 mm above center for 10 mm chin */}
        <RoundedBox
          args={[screenWidth, screenHeight, 0.008]}
          radius={0.0025}
          smoothness={2}
          position={[0, screenOffsetY, 0.0096]}
        >
          <meshStandardMaterial color="#101824" roughness={0.35} />
        </RoundedBox>

        {/* Crisp 16:9 display wallpaper plane */}
        <mesh position={[0, screenOffsetY, 0.0137]}>
          <planeGeometry args={[screenWidth, screenHeight]} />
          <meshBasicMaterial map={wallpaper} toneMapped={false} />
        </mesh>

        {/* UltraSharp bottom-right micro power indicator LED */}
        <mesh position={[panelWidth * 0.44, -panelHeight / 2 + 0.0045, 0.0138]}>
          <boxGeometry args={[0.006, 0.0018, 0.001]} />
          <meshBasicMaterial color="#e2e8f0" />
        </mesh>
      </group>
    </group>
  );
}

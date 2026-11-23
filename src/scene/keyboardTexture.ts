// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import {
  BufferGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from 'three';
import type { KeyboardRgbMode, KeyboardTheme, KeyDef } from '../domain/keyboard';

/**
 * Shared helper for rounded-corner keyboard decks, RGB diffuser plates, and trackpads,
 * with normalized [0..1] planar UVs on top & bottom faces.
 */
export function createRoundedPlateGeometry(
  width: number,
  depth: number,
  thickness: number,
  cornerRadius: number,
  bevel = 0,
): ExtrudeGeometry {
  const hw = Math.max(0.004, width / 2 - bevel);
  const hd = Math.max(0.004, depth / 2 - bevel);
  const r = Math.min(Math.max(0.001, cornerRadius - bevel), hw * 0.48, hd * 0.48);

  const shape = new Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hd - r);
  shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hd);
  shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hd + r);
  shape.absarc(-hw + r, -hd + r, r, Math.PI, (3 * Math.PI) / 2, false);
  shape.closePath();

  const extrudeDepth = Math.max(0.0002, thickness - 2 * bevel);
  const geo = new ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevel > 0 ? 3 : 1,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  if (bevel > 0) geo.translate(0, bevel, 0);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / width + 0.5, -pos.getZ(i) / depth + 0.5);
    }
    uv.needsUpdate = true;
  }
  geo.computeBoundingBox();
  return geo;
}

/**
 * Creates a flat XY plane ShapeGeometry with independent top/bottom rounded corners
 * and normalized [0..1] planar UVs so flat glass bezels & displays fit rounded lids flush.
 */
export function createRoundedRectPlaneGeometry(
  width: number,
  height: number,
  topRadius: number,
  bottomRadius = topRadius,
): ShapeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const rt = Math.min(Math.max(0.0005, topRadius), hw * 0.45, hh * 0.45);
  const rb = Math.min(Math.max(0.0005, bottomRadius), hw * 0.45, hh * 0.45);

  const s = new Shape();
  s.moveTo(-hw + rb, -hh);
  s.lineTo(hw - rb, -hh);
  s.absarc(hw - rb, -hh + rb, rb, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - rt);
  s.absarc(hw - rt, hh - rt, rt, 0, Math.PI / 2, false);
  s.lineTo(-hw + rt, hh);
  s.absarc(-hw + rt, hh - rt, rt, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + rb);
  s.absarc(-hw + rb, -hh + rb, rb, Math.PI, (3 * Math.PI) / 2, false);
  s.closePath();

  const geo = new ShapeGeometry(s, 10);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height + 0.5);
    }
    uv.needsUpdate = true;
  }
  return geo;
}

export type KeycapPalette = {
  alphaBg: string;
  alphaFg: string;
  modBg: string;
  modFg: string;
  accentBg: string;
  accentFg: string;
};

export function makeKeycapLegendsTexture(
  keys: KeyDef[],
  uWidth: number,
  uDepth: number,
  palette: KeycapPalette,
): CanvasTexture {
  const width = 2048;
  const height = 768;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = palette.alphaBg;
  ctx.fillRect(0, 0, width, height);

  const scaleX = width / uWidth;
  const scaleY = height / uDepth;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  for (const key of keys) {
    const x = key.x * scaleX;
    const y = key.z * scaleY;
    const w = key.w * scaleX;
    const h = key.d * scaleY;
    const bg =
      key.role === 'accent'
        ? palette.accentBg
        : key.role === 'mod'
          ? palette.modBg
          : palette.alphaBg;
    const fg =
      key.role === 'accent'
        ? palette.accentFg
        : key.role === 'mod'
          ? palette.modFg
          : palette.alphaFg;

    // Fill slightly outside key bounds so side skirts sample cleanly without bleeding neighbors
    ctx.fillStyle = bg;
    ctx.fillRect(x + 1, y + 1, Math.max(2, w - 2), Math.max(2, h - 2));

    if (!key.label || key.label === 'SPACE') {
      if (key.label === 'SPACE') {
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x + w * 0.32, y + h * 0.48, w * 0.36, 3);
        ctx.globalAlpha = 1;
      }
      continue;
    }

    const len = key.label.length;
    const fontSize = Math.round(
      Math.min(h * (len === 1 ? 0.36 : len <= 2 ? 0.27 : 0.21), w * (len === 1 ? 0.4 : 0.23)),
    );
    ctx.font = `500 ${Math.max(11, fontSize)}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
    ctx.fillStyle = fg;
    ctx.fillText(key.label, x + w / 2, y + h * 0.48);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Renders a matching emissive map containing only key legends illuminated by per-key RGB,
 * simulating shine-through PBT/ABS keycaps without flooding the keycap body.
 */
export function makeKeycapLegendEmissiveTexture(
  keys: KeyDef[],
  uWidth: number,
  uDepth: number,
  mode: KeyboardRgbMode,
  rgbColor: string,
  brightness = 1,
): CanvasTexture {
  const width = 2048;
  const height = 768;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const scaleX = width / uWidth;
  const scaleY = height / uDepth;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const alpha = Math.min(1, 0.92 * brightness);

  for (const key of keys) {
    const x = key.x * scaleX;
    const y = key.z * scaleY;
    const w = key.w * scaleX;
    const h = key.d * scaleY;
    const hex = keyPerKeyRgbHex(key, uWidth, uDepth, mode, rgbColor);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hex;
    ctx.shadowColor = hex;
    ctx.shadowBlur = 6;

    if (!key.label || key.label === 'SPACE') {
      if (key.label === 'SPACE') {
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillRect(x + w * 0.32, y + h * 0.48, w * 0.36, 3);
      }
      ctx.restore();
      continue;
    }

    const len = key.label.length;
    const fontSize = Math.round(
      Math.min(h * (len === 1 ? 0.36 : len <= 2 ? 0.27 : 0.21), w * (len === 1 ? 0.4 : 0.23)),
    );
    ctx.font = `500 ${Math.max(11, fontSize)}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
    ctx.fillText(key.label, x + w / 2, y + h * 0.48);
    ctx.restore();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function hslToHex(hDeg: number, sPct: number, lPct: number): string {
  const s = sPct / 100;
  const l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((hDeg % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r1, g1, b1] = [0, 0, 0];
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round((n + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

export function keyPerKeyRgbHex(
  key: KeyDef,
  uWidth: number,
  uDepth: number,
  mode: KeyboardRgbMode,
  rgbColor: string,
): string {
  const nx = (key.x + key.w / 2) / Math.max(1, uWidth);
  const ny = (key.z + key.d / 2) / Math.max(1, uDepth);
  if (mode === 'rainbow') {
    const hue = (nx * 290 + ny * 55 + 195) % 360;
    return hslToHex(hue, 88, 58);
  }
  if (mode === 'aurora') {
    const wave = Math.sin((nx * 1.15 + ny * 0.38) * Math.PI) * 0.5 + 0.5;
    const hue = 188 + wave * 134; // Smooth polar cyan -> electric violet -> rose wave
    return hslToHex(hue, 86, 60);
  }
  if (mode === 'breathing') {
    const clean = rgbColor.replace('#', '');
    const n = parseInt(clean, 16);
    const scale = 0.65;
    const ch = (shift: number) =>
      Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * scale)))
        .toString(16)
        .padStart(2, '0');
    return `#${ch(16)}${ch(8)}${ch(0)}`;
  }
  return rgbColor;
}

export function makePerKeyRgbPlateTextures(
  keys: KeyDef[],
  uWidth: number,
  uDepth: number,
  innerW: number,
  innerD: number,
  plateW: number,
  plateD: number,
  rgbEnabled: boolean,
  mode: KeyboardRgbMode,
  rgbColor: string,
  theme: KeyboardTheme = 'white',
  brightness = 1,
): { colorMap: CanvasTexture; emissiveMap: CanvasTexture } {
  const W = 1024;
  const H = 384;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = W;
  colorCanvas.height = H;
  const cCtx = colorCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = W;
  emissiveCanvas.height = H;
  const eCtx = emissiveCanvas.getContext('2d')!;

  // Switch plate surface matched to monochrome chassis: satin silver-white for white, deep obsidian for black
  const isWhite = theme === 'white';
  cCtx.fillStyle = isWhite ? '#c9d0dc' : '#101217';
  cCtx.fillRect(0, 0, W, H);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, W, H);

  const offsetX = ((plateW - innerW) / 2 / plateW) * W;
  const offsetY = ((plateD - innerD) / 2 / plateD) * H;
  const innerPxW = (innerW / plateW) * W;
  const innerPxH = (innerD / plateD) * H;
  const unitPxX = innerPxW / uWidth;
  const unitPxY = innerPxH / uDepth;

  for (const key of keys) {
    const cx = offsetX + (key.x + key.w / 2) * unitPxX;
    const cy = offsetY + (key.z + key.d / 2) * unitPxY;
    const kw = key.w * unitPxX;
    const kh = key.d * unitPxY;

    // Subtle recessed PCB switch pocket directly under each individual key position
    cCtx.fillStyle = isWhite ? '#aeb7c4' : '#07090d';
    cCtx.beginPath();
    cCtx.roundRect(cx - kw * 0.42, cy - kh * 0.4, kw * 0.84, kh * 0.8, 5);
    cCtx.fill();

    if (!rgbEnabled) continue;

    const hex = keyPerKeyRgbHex(key, uWidth, uDepth, mode, rgbColor);
    const ledCount = key.w >= 4 ? 4 : key.w >= 2 ? 2 : 1;
    // Radius reaches past the 0.46U keycap skirt into the visible inter-key gap cleanly
    const radiusY = Math.min(unitPxY * 0.62, kh * 0.62);
    const scaleX = Math.max(1, (unitPxX * 0.6) / Math.max(1, radiusY));
    const baseOpacity = (isWhite ? 0.92 : 0.98) * Math.min(1.15, brightness);
    const modeOpacity = mode === 'breathing' ? baseOpacity * 0.72 : baseOpacity;

    for (let li = 0; li < ledCount; li++) {
      const span = kw * 0.56;
      const lx = ledCount === 1 ? cx : cx - span / 2 + (span * li) / Math.max(1, ledCount - 1);
      // Slight south-facing optical LED bias toward lower key gap
      const ly = cy + unitPxY * 0.04;

      for (const ctx of [cCtx, eCtx]) {
        ctx.save();
        ctx.translate(lx, ly);
        ctx.scale(scaleX, 1);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusY);
        grad.addColorStop(0, hex);
        grad.addColorStop(0.45, `${hex}f0`);
        grad.addColorStop(0.72, `${hex}8c`);
        grad.addColorStop(0.9, `${hex}28`);
        grad.addColorStop(1, `${hex}00`);
        ctx.globalAlpha = Math.min(1, modeOpacity);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radiusY, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  const colorMap = new CanvasTexture(colorCanvas);
  colorMap.colorSpace = SRGBColorSpace;
  colorMap.anisotropy = 4;

  const emissiveMap = new CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = SRGBColorSpace;
  emissiveMap.anisotropy = 4;

  return { colorMap, emissiveMap };
}

export function makeRgbPlateTexture(mode: KeyboardRgbMode, rgbColor: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  if (mode === 'rainbow') {
    const grad = ctx.createLinearGradient(0, 0, 512, 64);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.24, '#818cf8');
    grad.addColorStop(0.5, '#e879f9');
    grad.addColorStop(0.76, '#fb7185');
    grad.addColorStop(1, '#34d399');
    ctx.fillStyle = grad;
  } else if (mode === 'aurora') {
    const grad = ctx.createLinearGradient(0, 0, 512, 64);
    grad.addColorStop(0, '#00d2ff');
    grad.addColorStop(0.5, '#8b5cf6');
    grad.addColorStop(1, '#ec4899');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = rgbColor;
  }
  ctx.fillRect(0, 0, 512, 128);

  if (mode === 'breathing') {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 0, 512, 128);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Builds one merged non-indexed BufferGeometry of smooth rounded-corner Cherry/chiclet 3D keycaps
 * with tapered skirts, beveled top shoulders, smooth vertex normals, and per-key legend UVs.
 */
export function buildKeycapsGeometry(
  keys: KeyDef[],
  uWidth: number,
  uDepth: number,
  unitX: number,
  unitZ: number,
  keyHeight: number,
  originX: number,
  originZ: number,
  baseY: number,
  gapRatio = 0.08,
  taperRatio = 0.12,
  cornerRatio = 0.15,
  gapZRatio = gapRatio,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  type RingPt = {
    x: number;
    z: number;
    nx: number;
    nz: number;
  };

  function sampleRoundedRectCCW(
    cx: number,
    cz: number,
    hw: number,
    hd: number,
    radius: number,
    segsPerCorner = 3,
  ): RingPt[] {
    const r = Math.min(radius, hw * 0.46, hd * 0.46);
    const ix = hw - r;
    const iz = hd - r;
    // Quarter-circle corner arcs in CCW order viewed from +Y:
    // NE (+x, -z), NW (-x, -z), SW (-x, +z), SE (+x, +z)
    const corners: { x: number; z: number; a0: number; a1: number }[] = [
      { x: cx + ix, z: cz - iz, a0: 0, a1: Math.PI / 2 },
      { x: cx - ix, z: cz - iz, a0: Math.PI / 2, a1: Math.PI },
      { x: cx - ix, z: cz + iz, a0: Math.PI, a1: (3 * Math.PI) / 2 },
      { x: cx + ix, z: cz + iz, a0: (3 * Math.PI) / 2, a1: Math.PI * 2 },
    ];
    const pts: RingPt[] = [];
    for (const c of corners) {
      for (let i = 0; i <= segsPerCorner; i++) {
        const a = c.a0 + ((c.a1 - c.a0) * i) / segsPerCorner;
        const rx = Math.cos(a);
        const rz = -Math.sin(a);
        pts.push({
          x: c.x + rx * r,
          z: c.z + rz * r,
          nx: rx,
          nz: rz,
        });
      }
    }
    return pts;
  }

  function pushVert(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
  ) {
    const len = Math.hypot(nx, ny, nz) || 1;
    positions.push(x, y, z);
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(u, v);
  }

  const gapX = unitX * gapRatio;
  const gapZ = unitZ * gapZRatio;
  const insetX = unitX * taperRatio;
  const insetZ = unitZ * taperRatio;
  const minPitch = Math.min(unitX, unitZ);
  const baseRadius = minPitch * cornerRatio;
  const bevelInset = Math.min(minPitch * 0.055, keyHeight * 0.25);
  const bevelH = keyHeight * 0.2;
  const y0 = baseY;
  const yMid = baseY + keyHeight - bevelH;
  const yTop = baseY + keyHeight;

  for (const key of keys) {
    const keyGapZ = key.d < 0.7 ? gapZ * 0.5 : gapZ;
    const bx0 = originX + key.x * unitX + gapX / 2;
    const bx1 = originX + (key.x + key.w) * unitX - gapX / 2;
    const bz0 = originZ + key.z * unitZ + keyGapZ / 2;
    const bz1 = originZ + (key.z + key.d) * unitZ - keyGapZ / 2;

    const cx = (bx0 + bx1) / 2;
    const cz = (bz0 + bz1) / 2;
    const bHw = Math.max(0.001, (bx1 - bx0) / 2);
    const bHd = Math.max(0.001, (bz1 - bz0) / 2);

    const mHw = Math.max(0.0008, bHw - insetX);
    const mHd = Math.max(0.0008, bHd - insetZ);
    const tHw = Math.max(0.0006, mHw - bevelInset);
    const tHd = Math.max(0.0006, mHd - bevelInset);

    const botRing = sampleRoundedRectCCW(cx, cz, bHw, bHd, baseRadius, 3);
    const midRing = sampleRoundedRectCCW(cx, cz, mHw, mHd, baseRadius * 0.92, 3);
    const topRing = sampleRoundedRectCCW(cx, cz, tHw, tHd, baseRadius * 0.8, 3);

    // UVs for top face map linearly onto this key's cell in `makeKeycapLegendsTexture`.
    const u0 = (key.x + 0.04) / uWidth;
    const u1 = (key.x + key.w - 0.04) / uWidth;
    const v1 = 1 - (key.z + 0.04) / uDepth;
    const v0 = 1 - (key.z + key.d - 0.04) / uDepth;
    const su = (key.x + 0.08) / uWidth;
    const sv = 1 - (key.z + 0.08) / uDepth;
    const topU = (x: number) => u0 + ((x - (cx - tHw)) / (tHw * 2)) * (u1 - u0);
    const topV = (z: number) => v1 + ((z - (cz - tHd)) / (tHd * 2)) * (v0 - v1);

    const count = botRing.length;
    for (let i = 0; i < count; i++) {
      const ni = (i + 1) % count;
      const b0 = botRing[i];
      const b1 = botRing[ni];
      const m0 = midRing[i];
      const m1 = midRing[ni];
      const t0 = topRing[i];
      const t1 = topRing[ni];

      // 1. Lower tapered skirt ring (smooth corner normals)
      pushVert(b0.x, y0, b0.z, b0.nx, 0.14, b0.nz, su, sv);
      pushVert(b1.x, y0, b1.z, b1.nx, 0.14, b1.nz, su, sv);
      pushVert(m1.x, yMid, m1.z, m1.nx * 0.92, 0.36, m1.nz * 0.92, su, sv);

      pushVert(b0.x, y0, b0.z, b0.nx, 0.14, b0.nz, su, sv);
      pushVert(m1.x, yMid, m1.z, m1.nx * 0.92, 0.36, m1.nz * 0.92, su, sv);
      pushVert(m0.x, yMid, m0.z, m0.nx * 0.92, 0.36, m0.nz * 0.92, su, sv);

      // 2. Smooth top beveled chamfer shoulder
      pushVert(m0.x, yMid, m0.z, m0.nx * 0.72, 0.69, m0.nz * 0.72, su, sv);
      pushVert(m1.x, yMid, m1.z, m1.nx * 0.72, 0.69, m1.nz * 0.72, su, sv);
      pushVert(t1.x, yTop, t1.z, t1.nx * 0.22, 0.97, t1.nz * 0.22, su, sv);

      pushVert(m0.x, yMid, m0.z, m0.nx * 0.72, 0.69, m0.nz * 0.72, su, sv);
      pushVert(t1.x, yTop, t1.z, t1.nx * 0.22, 0.97, t1.nz * 0.22, su, sv);
      pushVert(t0.x, yTop, t0.z, t0.nx * 0.22, 0.97, t0.nz * 0.22, su, sv);

      // 3. Smooth top face fan with exact character legend UV interpolation
      pushVert(cx, yTop, cz, 0, 1, 0, (u0 + u1) / 2, (v0 + v1) / 2);
      pushVert(t0.x, yTop, t0.z, t0.nx * 0.08, 0.996, t0.nz * 0.08, topU(t0.x), topV(t0.z));
      pushVert(t1.x, yTop, t1.z, t1.nx * 0.08, 0.996, t1.nz * 0.08, topU(t1.x), topV(t1.z));
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

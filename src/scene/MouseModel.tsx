import { useMemo } from 'react';
import * as THREE from 'three';
import {
  DEFAULT_MOUSE_MODEL_ID,
  mousePresetById,
  resolveMouseColor,
  type MouseSettings,
} from '../domain/mouse';
import type { Size } from '../domain/project';

interface MouseModelProps {
  size: Size;
  color: string;
  mouse?: MouseSettings;
}

const mouseGeoCache = new Map<string, THREE.BufferGeometry>();
const mouseTexCache = new Map<string, THREE.CanvasTexture>();

/**
 * 51-point (t = 0.00, 0.02, ..., 1.00) pure symmetrical body half-width profile
 * extracted directly via pixel scan of the reference top-down image
 * (bounding box 309 x 607 px, aspect ratio L/W = 1.9644, max width = 1.0000 at t = 0.70..0.72).
 */
const PIXEL_BODY_WIDTH_PROFILE: readonly number[] = [
  0.0, // t = 0.00
  0.4175, // t = 0.02
  0.5922, // t = 0.04
  0.7087, // t = 0.06
  0.7994, // t = 0.08
  0.8447, // t = 0.10
  0.9029, // t = 0.12
  0.9288, // t = 0.14
  0.9482, // t = 0.16
  0.9547, // t = 0.18
  0.9612, // t = 0.20
  0.9676, // t = 0.22 (front cheek max: 96.76%)
  0.9676, // t = 0.24
  0.9676, // t = 0.26
  0.9612, // t = 0.28
  0.9612, // t = 0.30
  0.9547, // t = 0.32
  0.9547, // t = 0.34
  0.9482, // t = 0.36
  0.9417, // t = 0.38
  0.9417, // t = 0.40
  0.9353, // t = 0.42
  0.9353, // t = 0.44
  0.9288, // t = 0.46 (waist min: 92.88%)
  0.9288, // t = 0.48
  0.9288, // t = 0.50
  0.9288, // t = 0.52
  0.9353, // t = 0.54
  0.9482, // t = 0.56
  0.9547, // t = 0.58
  0.9676, // t = 0.60
  0.9741, // t = 0.62
  0.9806, // t = 0.64
  0.9935, // t = 0.66
  0.9935, // t = 0.68
  1.0, // t = 0.70 (rear hip max: 100.00%)
  1.0, // t = 0.72
  0.9935, // t = 0.74
  0.9806, // t = 0.76
  0.9741, // t = 0.78
  0.9482, // t = 0.80
  0.9288, // t = 0.82
  0.8964, // t = 0.84
  0.8641, // t = 0.86
  0.8252, // t = 0.88
  0.7735, // t = 0.90
  0.7087, // t = 0.92
  0.6181, // t = 0.94
  0.5146, // t = 0.96
  0.3786, // t = 0.98
  0.0, // t = 1.00
];

/**
 * 21-point (t = 0.00, 0.05, ..., 1.00) normalized dorsal spine height profile H(t) / h
 * extracted directly via RGB luminance-step analysis of standard GPW side photos.
 * Endpoints match beltH(0) and beltH(1) (0.140 and 0.185) for zero polar pinch creases.
 */
const SIDE_RIDGE_HEIGHT_PROFILE: readonly number[] = [
  0.14, // t = 0.00 (matches beltH(0) -> zero front pinch)
  0.482, // t = 0.05
  0.582, // t = 0.10
  0.662, // t = 0.15
  0.738, // t = 0.20 (scroll wheel deck)
  0.82, // t = 0.25
  0.888, // t = 0.30
  0.936, // t = 0.35
  0.972, // t = 0.40
  0.985, // t = 0.45
  0.992, // t = 0.50
  1.0, // t = 0.55 (crown apex)
  0.99, // t = 0.60
  0.968, // t = 0.65
  0.935, // t = 0.70
  0.889, // t = 0.75
  0.83, // t = 0.80
  0.75, // t = 0.85
  0.64, // t = 0.90
  0.478, // t = 0.95
  0.185, // t = 1.00 (matches beltH(1))
];

/**
 * 21-point (t = 0.00, 0.05, ..., 1.00) parting line height Y_belt(t) / h
 * between the upper colored shell and the separate black lower base skirt.
 */
const SIDE_BELT_HEIGHT_PROFILE: readonly number[] = [
  0.14, // t = 0.00 (matches ridgeH(0))
  0.078, // t = 0.05
  0.076, // t = 0.10
  0.062, // t = 0.15
  0.056, // t = 0.20
  0.057, // t = 0.25
  0.058, // t = 0.30
  0.061, // t = 0.35
  0.066, // t = 0.40
  0.071, // t = 0.45
  0.076, // t = 0.50
  0.086, // t = 0.55
  0.092, // t = 0.60
  0.102, // t = 0.65
  0.109, // t = 0.70
  0.119, // t = 0.75
  0.127, // t = 0.80
  0.137, // t = 0.85
  0.15, // t = 0.90
  0.168, // t = 0.95
  0.185, // t = 1.00
];

function sampleCatmullRomTable(table: readonly number[], t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const n = table.length - 1;
  const scaled = clamped * n;
  const i = Math.min(n - 1, Math.floor(scaled));
  const f = scaled - i;

  const p0 = table[Math.max(0, i - 1)];
  const p1 = table[i];
  const p2 = table[Math.min(n, i + 1)];
  const p3 = table[Math.min(n, i + 2)];

  const f2 = f * f;
  const f3 = f2 * f;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f3)
  );
}

const PLANFORM_RATIO_TABLE: readonly number[] = (() => {
  const n = PIXEL_BODY_WIDTH_PROFILE.length - 1;
  let ratios = new Array<number>(n + 1);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    ratios[i] = PIXEL_BODY_WIDTH_PROFILE[i] / Math.sqrt(4 * t * (1 - t));
  }
  ratios[0] = ratios[1];
  ratios[n] = ratios[n - 1];

  for (let pass = 0; pass < 3; pass++) {
    const next = [...ratios];
    for (let i = 1; i < n; i++) {
      next[i] = 0.25 * ratios[i - 1] + 0.5 * ratios[i] + 0.25 * ratios[i + 1];
    }
    next[0] = next[1];
    next[n] = next[n - 1];
    ratios = next;
  }

  let maxW = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const w = Math.sqrt(4 * t * (1 - t)) * ratios[i];
    if (w > maxW) maxW = w;
  }
  for (let i = 0; i <= n; i++) {
    ratios[i] /= maxW;
  }
  return ratios;
})();

function planformShapeRatio(t: number): number {
  return sampleCatmullRomTable(PLANFORM_RATIO_TABLE, t);
}

function evaluateBodyWidthRatio(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return Math.sqrt(Math.max(0, 4 * clamped * (1 - clamped))) * planformShapeRatio(clamped);
}

function evaluateRidgeNorm(t: number): number {
  const base = sampleCatmullRomTable(SIDE_RIDGE_HEIGHT_PROFILE, t);
  // Smooth front brow fullness so nose transitions cleanly over the click-plate lip
  const frontNoseRounding = t > 0 && t < 0.06 ? 0.08 * Math.sin((t / 0.06) * Math.PI) : 0;
  return Math.min(1, Math.max(0, base + frontNoseRounding));
}

function evaluateBeltNorm(t: number): number {
  return Math.min(1, Math.max(0, sampleCatmullRomTable(SIDE_BELT_HEIGHT_PROFILE, t)));
}

const DOME_SX_EXP = 4.2;
const DOME_POW_EXP = 0.25;

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Evaluates un-sculpted smooth surface height Y (in meters) at global normalized coordinates
 * (xNorm, t) so texture seams and 3D overhang slits can track exact constant-height contours.
 */
function evaluateBaseSurfaceHeight(xNorm: number, t: number, h: number): number {
  const rowW = evaluateBodyWidthRatio(t);
  const sx = rowW > 1e-4 ? Math.min(1, Math.abs(xNorm) / rowW) : 1;
  const ridgeH = h * evaluateRidgeNorm(t);
  const beltH = h * evaluateBeltNorm(t);
  const oneMinusSxPow = Math.max(0, 1 - Math.pow(sx, DOME_SX_EXP));
  const dome = Math.pow(oneMinusSxPow, DOME_POW_EXP);
  return beltH + (ridgeH - beltH) * dome;
}

/**
 * Signed distance (in mm) for the upper L/R click-plate boundary:
 * - Lateral U-seam wings follow the upper cheek shoulder from t=0.4465 forward and feather
 *   cleanly over t in [0.062..0.110].
 * - Front horizontal overhang slit tracks an exact constant-height contour (`y = 10.8 mm`)
 *   across the nose (`|xNorm| <= 0.44`, `t < 0.06`) — straight level horizontal like real GPW,
 *   zero smiley-curve upward bow! Center vertical split stops cleanly at this horizontal slit.
 */
function evaluateClickPlateSeams(
  xNorm: number,
  t: number,
  w: number,
  h: number,
  d: number,
): {
  uDist: number;
  wingFade: number;
  frontSlitDist: number;
  frontSlitFade: number;
  centerSplitDist: number;
  inClickLongitudinal: number;
} {
  const absXmm = Math.abs(xNorm) * (w * 0.5) * 1000;
  const zMm = t * d * 1000;
  const dMm = d * 1000;

  const halfBodyMm = evaluateBodyWidthRatio(t) * (w * 0.5) * 1000;
  const backFlare = 1.65 * Math.pow(Math.max(0, (t - 0.25) / 0.2), 2.0);
  const frontTaper = 0.9 * Math.pow(Math.max(0, 1 - t / 0.16), 1.4);
  const marginMm = 3.45 + backFlare - frontTaper;
  const sideEdgeMm = Math.max(0, halfBodyMm - marginMm);

  const dSide = sideEdgeMm - absXmm;
  const dBack = 0.4465 * dMm - zMm;
  const uDist = smoothMin(dBack, dSide, 4.5);

  const rearBarMask = Math.min(1, Math.max(0, (t - 0.36) / 0.06));
  const wingFade = Math.max(rearBarMask, Math.min(1, Math.max(0, (t - 0.062) / 0.048)));

  // Exact constant-height front overhang slit at Y = 0.270 * h (10.8 mm) along nose front (t < 0.06)
  const surfYMm = evaluateBaseSurfaceHeight(xNorm, t, h) * 1000;
  const slitLevelMm = h * 0.27 * 1000;
  const frontSlitDist = t < 0.08 ? surfYMm - slitLevelMm : 20;
  const frontSlitFade =
    (t < 0.065 ? 1 : 0) * Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(xNorm) / 0.44), 2.8));

  // Center vertical split active strictly above/behind the front overhang slit and forward of t=0.4465
  const afterFrontSlit = Math.min(1, Math.max(0, (frontSlitDist + 0.1) / 0.55));
  const beforeRearBar = Math.min(1, Math.max(0, (dBack + 0.1) / 0.3));
  const inClickLongitudinal = Math.min(afterFrontSlit, beforeRearBar);

  return {
    uDist,
    wingFade,
    frontSlitDist,
    frontSlitFade,
    centerSplitDist: absXmm,
    inClickLongitudinal,
  };
}

/**
 * Generates high-resolution top-down texture for the classic symmetrical mouse:
 * - Clean L/R click-plate center split stopping cleanly at the short GPW front overhang slit
 * - Smooth feathered lateral U-seam wings matching top-down reference & front shoulder cleanly
 * - Smooth capsule scroll-wheel well, white DPI LED, and rear 'G' emblem
 */
function makeClassicMouseTexture(
  bodyColor: string,
  w: number,
  h: number,
  d: number,
): THREE.CanvasTexture {
  const key = `classic-mouse-tex-v18-${bodyColor}:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cached = mouseTexCache.get(key);
  if (cached) return cached;

  const W = 512;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const baseThreeColor = new THREE.Color(bodyColor);
  const lum = 0.2126 * baseThreeColor.r + 0.7152 * baseThreeColor.g + 0.0722 * baseThreeColor.b;
  const isDarkBody = lum < 0.18;

  ctx.fillStyle = bodyColor;
  ctx.fillRect(0, 0, W, H);

  const crownGrad = ctx.createRadialGradient(
    W * 0.48,
    H * 0.48,
    W * 0.04,
    W * 0.5,
    H * 0.52,
    W * 0.58,
  );
  crownGrad.addColorStop(0, isDarkBody ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)');
  crownGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.0)');
  crownGrad.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  ctx.fillStyle = crownGrad;
  ctx.fillRect(0, 0, W, H);

  // Rasterize click-plate U-seam, center split, and front overhang slit cleanly in 1:1 alignment with 3D relief
  const imgData = ctx.getImageData(0, 0, W, 490);
  const data = imgData.data;
  const gapR = isDarkBody ? 5 : 16;
  const gapG = isDarkBody ? 5 : 14;
  const gapB = isDarkBody ? 8 : 18;

  for (let py = 0; py < 490; py++) {
    const t = py / (H - 1);
    for (let px = 0; px < W; px++) {
      const xNorm = (px / (W - 1)) * 2 - 1;
      const {
        uDist,
        wingFade,
        frontSlitDist,
        frontSlitFade,
        centerSplitDist,
        inClickLongitudinal,
      } = evaluateClickPlateSeams(xNorm, t, w, h, d);

      // Lateral & rear U-seam (clean anti-aliased ~0.38 mm hairline)
      const uGap = wingFade * (1 - Math.min(1, Math.max(0, (Math.abs(uDist) - 0.19) / 0.21)));

      // Crisp constant-height horizontal front overhang slit (Y = 10.8 mm, compact ~0.48 mm tall)
      const slitGap =
        frontSlitFade * (1 - Math.min(1, Math.max(0, (Math.abs(frontSlitDist) - 0.24) / 0.28)));

      // Center vertical split strictly clipped between the front overhang slit and rear horizontal bar
      const centerGap =
        inClickLongitudinal * (1 - Math.min(1, Math.max(0, (centerSplitDist - 0.16) / 0.2)));

      const gapAlpha = Math.max(uGap, slitGap, centerGap);
      if (gapAlpha > 0.01) {
        const idx = (py * W + px) * 4;
        const mix = gapAlpha * 0.88;
        data[idx] = Math.round(data[idx] * (1 - mix) + gapR * mix);
        data[idx + 1] = Math.round(data[idx + 1] * (1 - mix) + gapG * mix);
        data[idx + 2] = Math.round(data[idx + 2] * (1 - mix) + gapB * mix);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Scroll wheel recess cutout (smooth capsule well at t in [0.114, 0.269], x in [219, 293])
  const slotW = 74;
  const slotH = 158;
  const slotX = (W - slotW) * 0.5;
  const slotY = 117;
  const slotR = slotW * 0.5;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(slotX - 3, slotY - 3, slotW + 6, slotH + 6, slotR + 3);
  ctx.clip();
  ctx.fillStyle = isDarkBody ? '#09090c' : 'rgba(18, 16, 22, 0.35)';
  ctx.fillRect(slotX - 3, slotY - 3, slotW + 6, slotH + 6);
  ctx.restore();

  ctx.fillStyle = '#0b0b0f';
  ctx.beginPath();
  ctx.roundRect(slotX + 1, slotY + 1, slotW - 2, slotH - 2, slotR - 1);
  ctx.fill();

  // White DPI / power indicator LED dot at t = 0.509 (y = 521 px, x = 256 px)
  const ledY = 521;
  const ledGlow = ctx.createRadialGradient(W * 0.5, ledY, 1, W * 0.5, ledY, 9);
  ledGlow.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  ledGlow.addColorStop(0.55, 'rgba(255, 255, 255, 0.55)');
  ledGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = ledGlow;
  ctx.beginPath();
  ctx.arc(W * 0.5, ledY, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W * 0.5, ledY, 4.8, 0, Math.PI * 2);
  ctx.fill();

  // Rear 'G' emblem centered at t = 0.7545 (y = 773 px, x = 256 px)
  ctx.save();
  ctx.translate(W * 0.5, 773);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 22;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0.48 * Math.PI, 1.52 * Math.PI, false);
  ctx.stroke();
  ctx.fillRect(4, -9, 48, 20);
  ctx.fillRect(32, -9, 20, 49);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  mouseTexCache.set(key, tex);
  return tex;
}

/**
 * Samples a vertex on the upper colored shell down to the parting beltline (r = 1):
 * - Pinch-free nose convergence (`ridgeH(0) === beltH(0)`)
 * - Smooth sculpted L/R click-plate elevation step (`padLift`) over `1.0 mm` ramp (zero zipper ripples)
 * - Recessed front overhang pocket shelf above the solid front chin (`frontSlitRecess`)
 * - Smooth recessed capsule scroll-wheel well
 */
function sampleClassicMouseDisk(
  r: number,
  theta: number,
  w: number,
  h: number,
  d: number,
  target: THREE.Vector3,
  uvTarget?: THREE.Vector2,
): void {
  const ux = r * Math.sin(theta);
  const uz = -r * Math.cos(theta);
  const t = 0.5 + 0.5 * uz;

  const shapeRatio = planformShapeRatio(t);
  const xNorm = ux * shapeRatio;
  const x = (w / 2) * xNorm;
  const z = (t - 0.5) * d;

  const rowChord = Math.sqrt(Math.max(0, 4 * t * (1 - t)));
  const sx = rowChord > 1e-4 ? Math.min(1, Math.abs(ux) / rowChord) : 1;

  const ridgeH = h * evaluateRidgeNorm(t);
  const beltH = h * evaluateBeltNorm(t);

  const oneMinusSxPow = Math.max(0, 1 - Math.pow(sx, DOME_SX_EXP));
  const dome = Math.pow(oneMinusSxPow, DOME_POW_EXP);

  // Subtle ergonomic fingertip dish on click plates
  const inClickZone = Math.max(0, 1 - Math.pow(t / 0.44, 3.5)) * Math.min(1, t / 0.06);
  const groove = inClickZone * 0.00045 * Math.exp(-Math.pow((sx - 0.45) / 0.22, 2)) * oneMinusSxPow;

  // Sculpted button-lid relief matching the exact click-plate seam coordinates
  const { uDist, frontSlitDist, frontSlitFade, centerSplitDist, inClickLongitudinal } =
    evaluateClickPlateSeams(xNorm, t, w, h, d);
  const padMask = Math.min(
    1 / (1 + Math.exp(-uDist / 0.9)),
    1 / (1 + Math.exp(-frontSlitDist / 0.7)),
  );
  const padLift = 0.00032 * padMask;
  const frontSlitRecess = frontSlitFade * 0.0005 * Math.exp(-Math.pow(frontSlitDist / 0.75, 2));
  const centerTrough =
    inClickLongitudinal * 0.00022 * Math.exp(-Math.pow(centerSplitDist / 0.9, 2));

  // Smooth recessed capsule scroll-wheel well
  const slotHalfW = 0.142;
  const slotCenterT = 0.1915;
  const slotHalfT = 0.0755;
  const dxSlot = Math.abs(xNorm) / slotHalfW;
  const dtSlot = Math.abs(t - slotCenterT) / slotHalfT;
  const slotDist = Math.hypot(Math.max(0, dxSlot - 0.35) / 0.65, Math.max(0, dtSlot - 0.55) / 0.45);
  const inWheelSlot = slotDist < 1 ? Math.pow(1 - slotDist * slotDist, 1.35) : 0;
  const wheelWellDepth = inWheelSlot * 0.0068;

  const y = Math.max(
    beltH,
    beltH +
      (ridgeH - beltH) * dome +
      padLift -
      groove -
      frontSlitRecess -
      centerTrough -
      wheelWellDepth,
  );

  target.set(x, y, z);

  if (uvTarget) {
    uvTarget.set(0.5 + 0.5 * xNorm, 1 - t);
  }
}

/**
 * Evaluates lateral X offset on the upper shell surface at longitudinal t and vertical height targetY.
 */
function sampleSideXAtHeight(t: number, targetY: number, w: number, h: number): number {
  const halfW = (w / 2) * evaluateBodyWidthRatio(t);
  const ridgeH = h * evaluateRidgeNorm(t);
  const beltH = h * evaluateBeltNorm(t);
  if (targetY <= beltH) return halfW;
  if (targetY >= ridgeH) return 0;
  const domeTarget = Math.min(1, Math.max(0, (targetY - beltH) / Math.max(1e-5, ridgeH - beltH)));
  const oneMinusSxPow = Math.pow(domeTarget, 1 / DOME_POW_EXP);
  const sx = Math.pow(Math.max(0, 1 - oneMinusSxPow), 1 / DOME_SX_EXP);
  return halfW * sx;
}

/**
 * Builds the high-resolution colored upper mouse shell mesh (96x192 rings) with zero polar holes.
 */
function buildClassicMouseShellGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `classic-mouse-upper-shell-v14:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const radialSegs = 96;
  const angularSegs = 192;
  const ringStride = angularSegs + 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const uv = new THREE.Vector2();

  for (let ir = 0; ir <= radialSegs; ir++) {
    const u = ir / radialSegs;
    const r = Math.sin(u * (Math.PI / 2));
    for (let ia = 0; ia <= angularSegs; ia++) {
      const theta = (ia / angularSegs) * Math.PI * 2;
      sampleClassicMouseDisk(r, theta, w, h, d, pt, uv);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(uv.x, uv.y);
    }
  }

  for (let ir = 0; ir < radialSegs; ir++) {
    for (let ia = 0; ia < angularSegs; ia++) {
      const a = ir * ringStride + ia;
      const b = a + 1;
      const c = (ir + 1) * ringStride + ia;
      const dIdx = c + 1;
      indices.push(a, b, dIdx);
      indices.push(a, dIdx, c);
    }
  }

  const lipRingStart = positions.length / 3;
  for (let ia = 0; ia <= angularSegs; ia++) {
    const theta = (ia / angularSegs) * Math.PI * 2;
    sampleClassicMouseDisk(1, theta, w, h, d, pt, uv);
    positions.push(pt.x * 0.968, Math.max(0.0005, pt.y - 0.00035), pt.z * 0.988);
    uvs.push(0.02, 0.02);
  }

  const outerRingStart = radialSegs * ringStride;
  for (let ia = 0; ia < angularSegs; ia++) {
    const a = outerRingStart + ia;
    const b = a + 1;
    const c = lipRingStart + ia;
    const dIdx = c + 1;
    indices.push(a, b, dIdx);
    indices.push(a, dIdx, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  mouseGeoCache.set(key, geo);
  return geo;
}

/**
 * Builds the separate black lower base chassis mesh matching exact GPW front/rear bevel insets.
 */
function buildClassicMouseBaseGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `classic-mouse-black-base-v13:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const angularSegs = 192;
  const ringStride = angularSegs + 1;
  const baseSteps = 6;
  const baseY = 0.0004;

  const positions: number[] = [];
  const indices: number[] = [];
  const pt = new THREE.Vector3();

  for (let is = 0; is <= baseSteps; is++) {
    const s = is / baseSteps;
    const taper = s;
    const vertFrac = 1 - s;
    for (let ia = 0; ia <= angularSegs; ia++) {
      const theta = (ia / angularSegs) * Math.PI * 2;
      const uz = -Math.cos(theta);
      sampleClassicMouseDisk(1, theta, w, h, d, pt);

      const endWeight = Math.pow(Math.abs(uz), 1.65);
      const targetEndShrinkZ = uz >= 0 ? 0.19 : 0.075;
      const shrinkZ = 0.008 + (0.006 + targetEndShrinkZ * endWeight) * taper;
      const shrinkX = 0.014 + (0.032 + 0.045 * endWeight) * taper;

      const xPos = pt.x * (1 - shrinkX);
      const zPos = pt.z * (1 - shrinkZ);
      const yPos = baseY + (pt.y - 0.00015 - baseY) * vertFrac;
      positions.push(xPos, yPos, zPos);
    }
  }

  for (let is = 0; is < baseSteps; is++) {
    for (let ia = 0; ia < angularSegs; ia++) {
      const a = is * ringStride + ia;
      const b = a + 1;
      const c = (is + 1) * ringStride + ia;
      const dIdx = c + 1;
      indices.push(a, b, dIdx);
      indices.push(a, dIdx, c);
    }
  }

  const bottomRingStart = baseSteps * ringStride;
  const bottomCenterIdx = positions.length / 3;
  positions.push(0, baseY, 0);
  for (let ia = 0; ia < angularSegs; ia++) {
    indices.push(bottomRingStart + ia, bottomRingStart + ia + 1, bottomCenterIdx);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  mouseGeoCache.set(key, geo);
  return geo;
}

/**
 * Builds a curvature-conformal left thumb button (or its dark pocket surround) whose every vertex
 * tracks the exact left sidewall curvature (`sampleSideXAtHeight(t, y, w, h)`).
 */
function buildConformalThumbButtonGeometry(
  btnT: number,
  btnY: number,
  rotX: number,
  len: number,
  height: number,
  depth: number,
  protrusionOffset: number,
  cornerRadius: number,
  bevel: number,
  w: number,
  h: number,
  d: number,
): THREE.BufferGeometry {
  const key = `conformal-thumb:${btnT.toFixed(4)}:${btnY.toFixed(4)}:${rotX.toFixed(3)}:${len.toFixed(4)}:${height.toFixed(4)}:${depth.toFixed(4)}:${protrusionOffset.toFixed(5)}:${bevel.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const hw = len / 2;
  const hh = height / 2;
  const r = Math.min(cornerRadius, hw * 0.45, hh * 0.48);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  geo.rotateX(rotX);

  const posAttr = geo.getAttribute('position');
  const btnCenterZ = (btnT - 0.5) * d;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);

    const zWorld = btnCenterZ + vz;
    const yWorld = btnY + vy;
    const tVert = Math.max(0.05, Math.min(0.95, 0.5 + zWorld / d));
    const wallX = sampleSideXAtHeight(tVert, yWorld, w, h);

    const endTaper = 0.00018 * Math.pow(Math.min(1, Math.abs(vz) / Math.max(1e-4, hw)), 2.5);
    const xWorld = -(wallX + protrusionOffset - endTaper) + vx;
    posAttr.setXYZ(i, xWorld, yWorld, zWorld);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  mouseGeoCache.set(key, geo);
  return geo;
}

export function MouseModel({ size, color, mouse }: MouseModelProps) {
  const modelId = mouse?.modelId ?? DEFAULT_MOUSE_MODEL_ID;
  const preset = mousePresetById(modelId);
  const w = size.width;
  const h = size.height;
  const d = size.depth;

  const resolvedBodyColor = resolveMouseColor(preset, color);
  const isWired = preset.series === 'wired';

  const shellGeo = useMemo(() => buildClassicMouseShellGeometry(w, h, d), [w, h, d]);
  const baseGeo = useMemo(() => buildClassicMouseBaseGeometry(w, h, d), [w, h, d]);
  const shellTex = useMemo(
    () => makeClassicMouseTexture(resolvedBodyColor, w, h, d),
    [resolvedBodyColor, w, h, d],
  );

  // Curvature-conformal GPW thumb buttons
  const btn1T = 0.366;
  const btn2T = 0.533;
  const btn1Y = h * 0.545;
  const btn2Y = h * 0.598;
  const btn1Len = d * 0.146;
  const btn2Len = d * 0.142;
  const btnHeight = h * 0.138;

  const btnGeo1 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn1T,
        btn1Y,
        -0.208,
        btn1Len,
        btnHeight,
        0.0014,
        0.00015,
        0.0022,
        0.00038,
        w,
        h,
        d,
      ),
    [btn1T, btn1Y, btn1Len, btnHeight, w, h, d],
  );
  const btnGeo2 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn2T,
        btn2Y,
        -0.025,
        btn2Len,
        btnHeight,
        0.0014,
        0.00015,
        0.0022,
        0.00038,
        w,
        h,
        d,
      ),
    [btn2T, btn2Y, btn2Len, btnHeight, w, h, d],
  );
  const bezelGeo1 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn1T,
        btn1Y,
        -0.208,
        btn1Len + 0.0011,
        btnHeight + 0.001,
        0.0012,
        -0.0002,
        0.0025,
        0,
        w,
        h,
        d,
      ),
    [btn1T, btn1Y, btn1Len, btnHeight, w, h, d],
  );
  const bezelGeo2 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn2T,
        btn2Y,
        -0.025,
        btn2Len + 0.0011,
        btnHeight + 0.001,
        0.0012,
        -0.0002,
        0.0025,
        0,
        w,
        h,
        d,
      ),
    [btn2T, btn2Y, btn2Len, btnHeight, w, h, d],
  );

  // 1. 100% circular scroll wheel centered at t = 0.1915
  const wheelT = 0.1915;
  const wheelZ = (wheelT - 0.5) * d;
  const wheelRadius = 0.0088;
  const wheelCenterY = h * 0.855 - wheelRadius;

  // 2. White status LED indicator dot at t = 0.509
  const ledT = 0.509;
  const ledZ = (ledT - 0.5) * d;
  const ledY = h * evaluateRidgeNorm(ledT);

  // 3. Braided cord curve for the classic wired mouse variant
  const cableGeo = useMemo(() => {
    if (!isWired) return null;
    const z0 = -d / 2;
    const portY = h * 0.185;
    const portZ = z0 + 0.0015;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, portY, portZ),
      new THREE.Vector3(0, portY + 0.0008, portZ - 0.015),
      new THREE.Vector3(-0.004, 0.0042, z0 - 0.042),
      new THREE.Vector3(-0.014, 0.0022, z0 - 0.078),
      new THREE.Vector3(-0.006, 0.0018, z0 - 0.118),
      new THREE.Vector3(0.008, 0.0018, z0 - 0.155),
    ]);
    return new THREE.TubeGeometry(curve, 36, 0.0015, 10, false);
  }, [isWired, d, h]);

  return (
    <group>
      {/* High-Resolution Symmetrical Upper Shell with Sculpted Click Plates */}
      <mesh geometry={shellGeo} castShadow receiveShadow>
        <meshStandardMaterial map={shellTex} roughness={0.42} metalness={0.03} />
      </mesh>

      {/* Separate Black Lower Base Skirt Chassis */}
      <mesh geometry={baseGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#15161a" roughness={0.28} metalness={0.08} />
      </mesh>

      {/* Scroll Wheel Assembly: 100% circular cylinder (White side rims + Black ribbed rubber tire) */}
      <group position={[0, wheelCenterY, wheelZ]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wheelRadius, wheelRadius, 0.0043, 40]} />
          <meshStandardMaterial color="#141418" roughness={0.7} metalness={0.06} />
        </mesh>
        {[-0.0028, 0.0028].map((sideX, idx) => (
          <mesh key={idx} position={[sideX, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelRadius * 0.96, wheelRadius * 0.96, 0.0013, 36]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} metalness={0.08} />
          </mesh>
        ))}
        {Array.from({ length: 28 }, (_, i) => {
          const angle = (i / 28) * Math.PI * 2;
          const ry = Math.sin(angle) * (wheelRadius + 0.00012);
          const rz = Math.cos(angle) * (wheelRadius + 0.00012);
          return (
            <mesh key={i} position={[0, ry, rz]} rotation={[-angle, 0, 0]}>
              <boxGeometry args={[0.0041, 0.00028, 0.00042]} />
              <meshStandardMaterial color="#2c2c34" roughness={0.5} metalness={0.12} />
            </mesh>
          );
        })}
      </group>

      {/* Center Status / DPI Indicator LED (at t = 0.509) */}
      <mesh position={[0, ledY + 0.00012, ledZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.0006, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.45}
          roughness={0.2}
        />
      </mesh>

      {/* Left-Side Curvature-Conformal Lozenge Thumb Buttons + Dark Pocket Outlines */}
      <mesh geometry={bezelGeo1}>
        <meshStandardMaterial color="#121216" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh geometry={btnGeo1} castShadow>
        <meshStandardMaterial color={resolvedBodyColor} roughness={0.36} metalness={0.04} />
      </mesh>
      <mesh geometry={bezelGeo2}>
        <meshStandardMaterial color="#121216" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh geometry={btnGeo2} castShadow>
        <meshStandardMaterial color={resolvedBodyColor} roughness={0.36} metalness={0.04} />
      </mesh>

      {/* PTFE Glide Skates on Underside */}
      <mesh position={[0, 0.0002, -d * 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[w * 0.2, 24]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.18} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.0002, d * 0.23]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[w * 0.19, 24]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.18} metalness={0.02} />
      </mesh>

      {/* Wired Variant: Molded Front Strain-Relief Boot + Soft Braided Paracord Cable */}
      {isWired && cableGeo && (
        <group>
          <mesh
            position={[0, h * 0.185, -d / 2 - 0.0025]}
            rotation={[Math.PI / 2 - 0.08, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.0021, 0.0028, 0.009, 16]} />
            <meshStandardMaterial color="#18181b" roughness={0.6} metalness={0.1} />
          </mesh>
          <mesh geometry={cableGeo} castShadow>
            <meshStandardMaterial color="#1f1f24" roughness={0.82} metalness={0.05} />
          </mesh>
        </group>
      )}
    </group>
  );
}

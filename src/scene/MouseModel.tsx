// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
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

// ============================================================================
// 1. C-Infinity Strictly-Convex Master Solid Envelope
//    Zero lookup tables, zero Catmull-Rom overshoots, strictly convex dome
// ============================================================================

/**
 * Smooth analytic planform factor P(uz) multiplying sqrt(1 - uz^2), normalized
 * so max_{t in [0,1]} evaluateBodyWidthRatio(t) === 1.0000 (ergonomic grip waist
 * around t = 0.47, balanced front shoulder at t = 0.22, fuller palm at t = 0.68).
 */
function rawPlanformFactor(uz: number): number {
  const waist = -0.108 * Math.exp(-Math.pow((uz + 0.05) / 0.39, 2));
  return 1.0 + waist + 0.365 * uz * uz + 0.135 * Math.pow(uz, 4) + 0.026 * uz;
}

const PLANFORM_NORM: number = (() => {
  let maxVal = 0;
  const N = 1000;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const uz = 2 * t - 1;
    const chord = Math.sqrt(Math.max(0, 1 - uz * uz));
    const v = chord * rawPlanformFactor(uz);
    if (v > maxVal) maxVal = v;
  }
  return maxVal;
})();

function planformShapeRatio(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const uz = 2 * clamped - 1;
  return rawPlanformFactor(uz) / PLANFORM_NORM;
}

function evaluateBodyWidthRatio(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const uz = 2 * clamped - 1;
  return Math.sqrt(Math.max(0, 1 - uz * uz)) * planformShapeRatio(clamped);
}

/**
 * Smooth, strictly convex-upward lower beltline parting curve Y_belt(t) / h
 * separating the colored upper shell from the black bottom base chassis.
 */
function evaluateBeltNorm(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 0.062 + 0.088 * c + 0.052 * Math.pow(1 - c, 3.4);
}

function rawCrownArch(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const sinTheta = 2 * Math.sqrt(Math.max(0, c * (1 - c)));
  const u = c - 0.5;
  return Math.pow(sinTheta, 0.84) * (1 + 0.145 * u - 0.065 * u * u);
}

const RIDGE_ARCH_SCALE: number = (() => {
  // Solve exact scale so max_{t in [0,1]} [evaluateBeltNorm(t) + scale * rawCrownArch(t)] === 1.0
  let lo = 0.7;
  let hi = 1.1;
  for (let iter = 0; iter < 32; iter++) {
    const mid = 0.5 * (lo + hi);
    let peak = 0;
    for (let i = 1; i < 1000; i++) {
      const t = i / 1000;
      const val = evaluateBeltNorm(t) + mid * rawCrownArch(t);
      if (val > peak) peak = val;
    }
    if (peak < 1.0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
})();

/**
 * Strictly concave longitudinal dorsal spine H_ridge(t) / h:
 * exact polar closure at t = 0 and t = 1, smooth vertical rounded nose/tail tangents,
 * apex = 1.000 at t ≈ 0.54, zero inflection points anywhere on (0, 1).
 */
function evaluateRidgeNorm(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return Math.min(1, evaluateBeltNorm(c) + RIDGE_ARCH_SCALE * rawCrownArch(c));
}

// Strictly-concave elliptical/superelliptical transverse cross-section exponents
const DOME_SX_EXP = 2.45;
const DOME_POW_EXP = 0.52;

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function evaluateEnvelopeHeightFromDisk(ux: number, uz: number, h: number): number {
  const t = Math.max(0, Math.min(1, 0.5 + 0.5 * uz));
  const rowChord = Math.sqrt(Math.max(0, 1 - uz * uz));
  const sx = rowChord > 1e-5 ? Math.min(1, Math.abs(ux) / rowChord) : 1;
  const ridgeH = h * evaluateRidgeNorm(t);
  const beltH = h * evaluateBeltNorm(t);
  const oneMinusSxPow = Math.max(0, 1 - Math.pow(sx, DOME_SX_EXP));
  const dome = Math.pow(oneMinusSxPow, DOME_POW_EXP);
  return beltH + (ridgeH - beltH) * dome;
}

function evaluateEnvelopeHeightAtXZ(x: number, z: number, w: number, h: number, d: number): number {
  const t = Math.max(0, Math.min(1, 0.5 + z / d));
  const halfW = (w / 2) * evaluateBodyWidthRatio(t);
  const sx = halfW > 1e-6 ? Math.min(1, Math.abs(x) / halfW) : 1;
  const ridgeH = h * evaluateRidgeNorm(t);
  const beltH = h * evaluateBeltNorm(t);
  const oneMinusSxPow = Math.max(0, 1 - Math.pow(sx, DOME_SX_EXP));
  const dome = Math.pow(oneMinusSxPow, DOME_POW_EXP);
  return beltH + (ridgeH - beltH) * dome;
}

function diskToPhysicalXZ(
  ux: number,
  uz: number,
  w: number,
  d: number,
): { x: number; z: number; t: number } {
  const t = Math.max(0, Math.min(1, 0.5 + 0.5 * uz));
  const x = (w / 2) * ux * planformShapeRatio(t);
  const z = (t - 0.5) * d;
  return { x, z, t };
}

// ============================================================================
// 2. True 3D Plane-Intersection Parting Curves & Riemannian Surface Geodesic SDF
//    - Side & front nose cut: exact 3D inclined plane Y = h * (0.335 + 0.90 * t)
//    - Rear transverse cut:   exact 3D vertical plane t = 0.436
//    - Smooth 4.2 mm 3D fillet where the side and rear parting planes meet
// ============================================================================
const BAY_REAR_T = 0.436;
const BAY_PLANE_Y0_NORM = 0.335;
const BAY_PLANE_SLOPE_NORM = 0.9;
const BAY_CENTER_UZ = -0.52;

/**
 * Evaluates exact 3D Riemannian geodesic signed distance (in mm along the curved
 * 3D master dome surface) to the inclined front/side parting plane Y = Y_cheek(z).
 * Positive above the parting plane (inside button bay), negative on lower chin/cheeks.
 */
function sdfCheekPlaneSurfaceMm(
  xMm: number,
  zMm: number,
  wMm: number,
  hMm: number,
  dMm: number,
): number {
  const w = wMm / 1000;
  const h = hMm / 1000;
  const d = dMm / 1000;

  const evalY = (xm: number, zm: number) =>
    evaluateEnvelopeHeightAtXZ(xm / 1000, zm / 1000, w, h, d) * 1000;
  const evalPlaneY = (zm: number) => {
    const t = 0.5 + zm / dMm;
    return hMm * (BAY_PLANE_Y0_NORM + BAY_PLANE_SLOPE_NORM * t);
  };

  const y0 = evalY(xMm, zMm);
  const f0 = y0 - evalPlaneY(zMm);

  const eps = 0.03;
  const yx1 = evalY(xMm + eps, zMm);
  const yx0 = evalY(xMm - eps, zMm);
  const yz1 = evalY(xMm, zMm + eps);
  const yz0 = evalY(xMm, zMm - eps);

  const Yx = (yx1 - yx0) / (2 * eps);
  const Yz = (yz1 - yz0) / (2 * eps);
  const planeSlopeZ = (hMm * BAY_PLANE_SLOPE_NORM) / dMm;

  const fx = Yx;
  const fz = Yz - planeSlopeZ;

  // Riemannian inverse metric on S(x, z) = (x, Y(x, z), z)
  const E = 1 + Yx * Yx;
  const F = Yx * Yz;
  const G = 1 + Yz * Yz;
  const det = Math.max(1, 1 + Yx * Yx + Yz * Yz);
  const surfGradSq = Math.max(1e-6, (G * fx * fx - 2 * F * fx * fz + E * fz * fz) / det);
  return f0 / Math.sqrt(surfGradSq);
}

/**
 * Evaluates 3D surface geodesic signed distance (in mm) to the rear transverse
 * parting plane z = z_rear, normalized by longitudinal surface arc-length sqrt(1 + Yz^2).
 */
function sdfRearPlaneSurfaceMm(
  xMm: number,
  zMm: number,
  wMm: number,
  hMm: number,
  dMm: number,
): number {
  const zRearMm = (BAY_REAR_T - 0.5) * dMm;
  const w = wMm / 1000;
  const h = hMm / 1000;
  const d = dMm / 1000;
  const eps = 0.04;
  const yz1 = evaluateEnvelopeHeightAtXZ(xMm / 1000, (zMm + eps) / 1000, w, h, d) * 1000;
  const yz0 = evaluateEnvelopeHeightAtXZ(xMm / 1000, (zMm - eps) / 1000, w, h, d) * 1000;
  const Yz = (yz1 - yz0) / (2 * eps);
  return (zRearMm - zMm) * Math.sqrt(1 + Yz * Yz);
}

/**
 * True 3D surface geodesic signed distance (in mm) to the U-shaped button bay rim:
 *   = 0 on the Main Body's exact planar-section rim,
 *   > 0 inside the button bay,
 *   < 0 on the Main Body shell.
 */
function sdfBaySurfaceMm(xMm: number, zMm: number, wMm: number, hMm: number, dMm: number): number {
  const dCheek = sdfCheekPlaneSurfaceMm(xMm, zMm, wMm, hMm, dMm);
  const dRear = sdfRearPlaneSurfaceMm(xMm, zMm, wMm, hMm, dMm);
  return smoothMin(dCheek, dRear, 4.2);
}

function sdfBayFromDiskMm(ux: number, uz: number, w: number, h: number, d: number): number {
  const { x, z } = diskToPhysicalXZ(ux, uz, w, d);
  return sdfBaySurfaceMm(x * 1000, z * 1000, w * 1000, h * 1000, d * 1000);
}

/**
 * Exact ray solver from (0, BAY_CENTER_UZ) in disk coordinates (ux, uz) to:
 *  - rhoBay:   exact planar-intersection U-bay rim (sdfBayFromDiskMm === 0)
 *  - rhoOuter: outer silhouette unit circle ux^2 + uz^2 === 1
 */
function solveBayRayRadii(
  phi: number,
  w: number,
  h: number,
  d: number,
): { rhoBay: number; rhoOuter: number; dirX: number; dirZ: number } {
  const dirX = Math.sin(phi);
  const dirZ = -Math.cos(phi);
  const uz0 = BAY_CENTER_UZ;

  const bHalf = uz0 * dirZ;
  const rhoOuter = -bHalf + Math.sqrt(Math.max(0, bHalf * bHalf + (1 - uz0 * uz0)));

  let lo = 0;
  let hi = rhoOuter * 0.992;
  for (let iter = 0; iter < 24; iter++) {
    const mid = 0.5 * (lo + hi);
    if (sdfBayFromDiskMm(dirX * mid, uz0 + dirZ * mid, w, h, d) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { rhoBay: 0.5 * (lo + hi), rhoOuter, dirX, dirZ };
}

/**
 * True 3D surface signed distance (in mm) for the Right Click Plate (RMB, x > 0):
 * - Uniform 0.52 mm 3D clearance gap all around the U-bay planar intersection rim
 * - Clean vertical symmetry split plane X = 0.30 mm (0.60 mm center gap)
 * - Clean stadium cutout around the central scroll wheel (half-width 4.25 mm)
 * - Smooth 1.15 mm rounded corners at every planar intersection vertex
 */
function sdfRightButtonMm(xMm: number, zMm: number, wMm: number, hMm: number, dMm: number): number {
  const dOuter = sdfBaySurfaceMm(xMm, zMm, wMm, hMm, dMm) - 0.64;
  const dCenter = xMm - 0.32;

  // Sleek elliptical-ended stadium cutout around scroll wheel (smoothly bounded dx/dz, zero 90° step)
  const zWheelMm = (0.1915 - 0.5) * dMm;
  const dzCap = Math.max(0, Math.abs(zMm - zWheelMm) - 4.4);
  const rxWheel = 4.2;
  const rzWheel = 5.4;
  const qx = xMm / rxWheel;
  const qz = dzCap / rzWheel;
  const qNorm = Math.hypot(qx, qz);
  const dWheel =
    qNorm > 1e-5
      ? ((qNorm - 1) * qNorm) / Math.hypot(qx / rxWheel, qz / rzWheel)
      : -Math.min(rxWheel, rzWheel);

  const dInner = smoothMin(dCenter, dWheel, 1.85);
  return smoothMin(dOuter, dInner, 1.15);
}

function findButtonRowPeak(
  zMm: number,
  wMm: number,
  hMm: number,
  dMm: number,
): { xPeak: number; valPeak: number } {
  let a = 0.2;
  let b = wMm * 0.48;
  const invPhi = (Math.sqrt(5) - 1) / 2;
  let c = b - invPhi * (b - a);
  let dPt = a + invPhi * (b - a);
  let fc = sdfRightButtonMm(c, zMm, wMm, hMm, dMm);
  let fd = sdfRightButtonMm(dPt, zMm, wMm, hMm, dMm);

  for (let iter = 0; iter < 24; iter++) {
    if (fc > fd) {
      b = dPt;
      dPt = c;
      fd = fc;
      c = b - invPhi * (b - a);
      fc = sdfRightButtonMm(c, zMm, wMm, hMm, dMm);
    } else {
      a = c;
      c = dPt;
      fc = fd;
      dPt = a + invPhi * (b - a);
      fd = sdfRightButtonMm(dPt, zMm, wMm, hMm, dMm);
    }
  }
  const xPeak = 0.5 * (a + b);
  return { xPeak, valPeak: sdfRightButtonMm(xPeak, zMm, wMm, hMm, dMm) };
}

/**
 * Exact quarter-circle 3D edge fillet drop (in meters):
 * - For dMm >= rMm: drop = 0 with zero slope (G1 tangent to master dome)
 * - For 0 <= dMm <= rMm: traces exact quarter circle of radius rMm, reaching vertical tangent at dMm = 0
 */
function quarterRoundFilletDropM(dMm: number, rMm: number): number {
  if (dMm >= rMm) return 0;
  const clamped = Math.max(0, dMm);
  const dropMm = rMm - Math.sqrt(Math.max(0, 2 * rMm * clamped - clamped * clamped));
  return dropMm / 1000;
}

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

// ============================================================================
// 3. Part Geometry Builders (Every Edge Rounded with True G1 Quarter-Circle Fillet)
// ============================================================================

/**
 * Builds the Main Colored Unibody Shell outside the U-shaped planar button bay:
 * - G1-continuous 0.42 mm quarter-round 3D fillet along the entire U-bay rim, seamlessly
 *   continuing downward into the inner switch-well wall (shared vertices -> smooth rounded highlights!)
 * - Smoothly rounded lower beltline meeting the black base chassis cleanly
 */
function buildMouseMainBodyGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `mouse-main-body-planar-v1:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const wMm = w * 1000;
  const hMm = h * 1000;
  const dMm = d * 1000;
  const angularSegs = 256;
  const domeRadialSegs = 64;
  const innerFlangeSteps = [0.00045, 0.0022]; // smooth G1 continuation below the 90° vertical fillet tangent
  const ringStride = angularSegs + 1;

  const rayTable = Array.from({ length: ringStride }, (_, ia) => {
    const phi = (ia / angularSegs) * Math.PI * 2;
    return solveBayRayRadii(phi, w, h, d);
  });

  const positions: number[] = [];
  const indices: number[] = [];

  // Ring 0..1: Inner vertical flange wall rising smoothly into the quarter-round U-bay rim
  for (let k = innerFlangeSteps.length - 1; k >= 0; k--) {
    const dropExtra = innerFlangeSteps[k];
    for (let ia = 0; ia <= angularSegs; ia++) {
      const { rhoBay, dirX, dirZ } = rayTable[ia];
      const ux = dirX * rhoBay;
      const uz = BAY_CENTER_UZ + dirZ * rhoBay;
      const { x, z, t } = diskToPhysicalXZ(ux, uz, w, d);
      const beltH = h * evaluateBeltNorm(t);
      const rimBaseY = evaluateEnvelopeHeightFromDisk(ux, uz, h) - 0.00042;
      positions.push(x, Math.max(beltH * 0.85, rimBaseY - dropExtra), z);
    }
  }

  // Ring 2..(2 + domeRadialSegs): Smooth outer shell annulus with cosine clustering at both edges
  const filletRadiusMm = 0.42;
  for (let ir = 0; ir <= domeRadialSegs; ir++) {
    const u = ir / domeRadialSegs;
    const s = 0.5 * (1 - Math.cos(u * Math.PI));

    for (let ia = 0; ia <= angularSegs; ia++) {
      const { rhoBay, rhoOuter, dirX, dirZ } = rayTable[ia];
      const rho = rhoBay + s * (rhoOuter - rhoBay);
      const ux = dirX * rho;
      const uz = BAY_CENTER_UZ + dirZ * rho;
      const { x, z, t } = diskToPhysicalXZ(ux, uz, w, d);
      const beltH = h * evaluateBeltNorm(t);
      const baseY = evaluateEnvelopeHeightFromDisk(ux, uz, h);

      let rimDrop = 0;
      if (s < 0.16) {
        const dOutMm = Math.max(0, -sdfBaySurfaceMm(x * 1000, z * 1000, wMm, hMm, dMm));
        rimDrop = quarterRoundFilletDropM(dOutMm, filletRadiusMm);
      }
      const y = Math.max(beltH, baseY - rimDrop);
      positions.push(x, y, z);
    }
  }

  // Final ring: Rounded beltline under-tuck lip meeting the black base chassis
  const outerRingIdx = innerFlangeSteps.length + domeRadialSegs;
  for (let ia = 0; ia <= angularSegs; ia++) {
    const idx3 = (outerRingIdx * ringStride + ia) * 3;
    const ox = positions[idx3];
    const oy = positions[idx3 + 1];
    const oz = positions[idx3 + 2];
    positions.push(ox * 0.978, Math.max(0.0005, oy - 0.00045), oz * 0.992);
  }

  const totalRings = innerFlangeSteps.length + domeRadialSegs + 1;
  for (let r = 0; r < totalRings; r++) {
    for (let ia = 0; ia < angularSegs; ia++) {
      const a = r * ringStride + ia;
      const b = a + 1;
      const c = (r + 1) * ringStride + ia;
      const dIdx = c + 1;
      indices.push(a, b, dIdx);
      indices.push(a, dIdx, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  mouseGeoCache.set(key, geo);
  return geo;
}

/**
 * Builds the recessed matte-dark internal switch-housing well underneath LMB, RMB, and the scroll wheel.
 */
function buildMouseInnerWellGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `mouse-inner-well-planar-v1:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const dMm = d * 1000;
  const angularSegs = 160;
  const radialSegs = 32;
  const ringStride = angularSegs + 1;

  const rayTable = Array.from({ length: ringStride }, (_, ia) => {
    const phi = (ia / angularSegs) * Math.PI * 2;
    return solveBayRayRadii(phi, w, h, d);
  });

  const positions: number[] = [];
  const indices: number[] = [];

  for (let ir = 0; ir <= radialSegs; ir++) {
    const s = ir / radialSegs;
    for (let ia = 0; ia <= angularSegs; ia++) {
      const { rhoBay, dirX, dirZ } = rayTable[ia];
      const rho = s * rhoBay * 1.035;
      const ux = dirX * rho;
      const uz = BAY_CENTER_UZ + dirZ * rho;
      const { x, z, t } = diskToPhysicalXZ(ux, uz, w, d);
      const envY = evaluateEnvelopeHeightFromDisk(ux, uz, h);

      const xMm = x * 1000;
      const zMm = z * 1000;
      const zWheelMm = (0.1915 - 0.5) * dMm;
      const dzCap = Math.max(0, Math.abs(zMm - zWheelMm) - 5.6);
      const dWheel = Math.hypot(xMm, dzCap) - 4.7;
      const wheelPocket = dWheel < 0 ? 0.0058 * Math.min(1, -dWheel / 1.4) : 0;

      const beltH = h * evaluateBeltNorm(t);
      const wellY = Math.max(beltH * 0.82, envY - 0.002 - wheelPocket);
      positions.push(x, wellY, z);
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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  mouseGeoCache.set(key, geo);
  return geo;
}

/**
 * Builds an independent, closed 3D Left (side = -1) or Right (side = 1) Mouse Click Plate:
 * - Flush co-continuous with the C-infinity master dome (zero step, zero concave dent, zero underbite)
 * - Every boundary curve is an exact 3D plane/cylinder intersection with smooth rounded corners
 * - True 0.42 mm quarter-round 3D fillet around the entire 360° perimeter seamlessly connected
 *   to the 0.85 mm colored button sidewall for smooth, natural specular highlights
 */
function buildMouseClickPlateAssemblies(
  side: -1 | 1,
  w: number,
  h: number,
  d: number,
): { plateGeo: THREE.BufferGeometry; plungerSkirtGeo: THREE.BufferGeometry } {
  const plateKey = `mouse-click-plate-planar-v2:${side}:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const plungerKey = `mouse-click-plunger-planar-v2:${side}:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cachedPlate = mouseGeoCache.get(plateKey);
  const cachedPlunger = mouseGeoCache.get(plungerKey);
  if (cachedPlate && cachedPlunger) {
    return { plateGeo: cachedPlate, plungerSkirtGeo: cachedPlunger };
  }

  const wMm = w * 1000;
  const hMm = h * 1000;
  const dMm = d * 1000;

  let zFrontLo = -0.5 * dMm;
  let zFrontHi = -0.32 * dMm;
  for (let iter = 0; iter < 24; iter++) {
    const mid = 0.5 * (zFrontLo + zFrontHi);
    if (findButtonRowPeak(mid, wMm, hMm, dMm).valPeak > 0) {
      zFrontHi = mid;
    } else {
      zFrontLo = mid;
    }
  }
  const zMinMm = zFrontHi + 0.006;

  let zRearLo = -0.2 * dMm;
  let zRearHi = 0.0;
  for (let iter = 0; iter < 24; iter++) {
    const mid = 0.5 * (zRearLo + zRearHi);
    if (findButtonRowPeak(mid, wMm, hMm, dMm).valPeak > 0) {
      zRearLo = mid;
    } else {
      zRearHi = mid;
    }
  }
  const zMaxMm = zRearLo - 0.006;

  const rowsM = 180;
  const colsN = 60;
  const colStride = colsN + 1;
  const filletRadiusMm = 0.42;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= rowsM; j++) {
    const sj = 0.5 * (1 - Math.cos((j / rowsM) * Math.PI));
    const zMm = zMinMm + sj * (zMaxMm - zMinMm);
    const { xPeak } = findButtonRowPeak(zMm, wMm, hMm, dMm);

    let lLo = 0;
    let lHi = xPeak;
    for (let iter = 0; iter < 22; iter++) {
      const mid = 0.5 * (lLo + lHi);
      if (sdfRightButtonMm(mid, zMm, wMm, hMm, dMm) > 0) {
        lHi = mid;
      } else {
        lLo = mid;
      }
    }
    const xLeftMm = 0.5 * (lLo + lHi);

    let rLo = xPeak;
    let rHi = wMm * 0.5;
    for (let iter = 0; iter < 22; iter++) {
      const mid = 0.5 * (rLo + rHi);
      if (sdfRightButtonMm(mid, zMm, wMm, hMm, dMm) > 0) {
        rLo = mid;
      } else {
        rHi = mid;
      }
    }
    const xRightMm = 0.5 * (rLo + rHi);

    for (let i = 0; i <= colsN; i++) {
      // Pure cosine spacing clusters 5 smooth rings right across the 0.42 mm quarter-circle fillet
      const ui = 0.5 * (1 - Math.cos((i / colsN) * Math.PI));
      const xAbsMm = xLeftMm + ui * (xRightMm - xLeftMm);

      const xPhys = side * (xAbsMm / 1000);
      const zPhys = zMm / 1000;

      const dEdgeMm = Math.max(0, sdfRightButtonMm(xAbsMm, zMm, wMm, hMm, dMm));
      const filletDrop = quarterRoundFilletDropM(dEdgeMm, filletRadiusMm);

      const envY = evaluateEnvelopeHeightAtXZ(xPhys, zPhys, w, h, d);
      // Co-continuous flush fit (+0.08 mm nominal tolerance) minus exact quarter-round edge fillet
      const yPhys = envY + 0.00008 - filletDrop;
      positions.push(xPhys, yPhys, zPhys);
    }
  }

  for (let j = 0; j < rowsM; j++) {
    for (let i = 0; i < colsN; i++) {
      const a = j * colStride + i;
      const b = a + 1;
      const c = (j + 1) * colStride + i;
      const dIdx = c + 1;
      if (side === 1) {
        indices.push(a, c, dIdx);
        indices.push(a, dIdx, b);
      } else {
        indices.push(a, dIdx, c);
        indices.push(a, b, dIdx);
      }
    }
  }

  // Ordered 360° perimeter loop indices on the top surface (where fillet tangent is already vertical!)
  const perimGridIndices: number[] = [];
  for (let i = 0; i <= colsN; i++) perimGridIndices.push(i);
  for (let j = 1; j <= rowsM; j++) perimGridIndices.push(j * colStride + colsN);
  for (let i = colsN - 1; i >= 0; i--) perimGridIndices.push(rowsM * colStride + i);
  for (let j = rowsM - 1; j >= 0; j--) perimGridIndices.push(j * colStride);

  const perimCount = perimGridIndices.length;
  const perimInwardDirs: Array<{ px: number; py: number; pz: number; nx: number; nz: number }> = [];

  for (let k = 0; k < perimCount; k++) {
    const gIdx = perimGridIndices[k] * 3;
    const px = positions[gIdx];
    const py = positions[gIdx + 1];
    const pz = positions[gIdx + 2];

    const xAbsMm = Math.abs(px) * 1000;
    const zMm = pz * 1000;
    const eps = 0.03;
    const gx =
      sdfRightButtonMm(xAbsMm + eps, zMm, wMm, hMm, dMm) -
      sdfRightButtonMm(xAbsMm - eps, zMm, wMm, hMm, dMm);
    const gz =
      sdfRightButtonMm(xAbsMm, zMm + eps, wMm, hMm, dMm) -
      sdfRightButtonMm(xAbsMm, zMm - eps, wMm, hMm, dMm);
    const gLen = Math.max(1e-5, Math.hypot(gx, gz));
    const inX = (side * gx) / gLen;
    const inZ = gz / gLen;
    perimInwardDirs.push({ px, py, pz, nx: inX, nz: inZ });
  }

  // Seamlessly stitch 2 inward-tucked sidewall rings directly onto perimGridIndices
  // so every seam channel reads with crisp, uniform dark shadow depth from all angles
  const lipMidStart = positions.length / 3;
  for (let k = 0; k < perimCount; k++) {
    const p = perimInwardDirs[k];
    positions.push(p.px + p.nx * 0.00008, p.py - 0.00028, p.pz + p.nz * 0.00008);
  }
  const lipBotStart = positions.length / 3;
  for (let k = 0; k < perimCount; k++) {
    const p = perimInwardDirs[k];
    positions.push(p.px + p.nx * 0.00028, p.py - 0.00068, p.pz + p.nz * 0.00028);
  }

  for (let k = 0; k < perimCount - 1; k++) {
    const topA = perimGridIndices[k];
    const topB = perimGridIndices[k + 1];
    const midA = lipMidStart + k;
    const midB = midA + 1;
    const botA = lipBotStart + k;
    const botB = botA + 1;
    if (side === 1) {
      indices.push(topA, topB, midB);
      indices.push(topA, midB, midA);
      indices.push(midA, midB, botB);
      indices.push(midA, botB, botA);
    } else {
      indices.push(topA, midB, topB);
      indices.push(topA, midA, midB);
      indices.push(midA, botB, midB);
      indices.push(midA, botA, botB);
    }
  }

  const plateGeo = new THREE.BufferGeometry();
  plateGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  plateGeo.setIndex(indices);
  plateGeo.computeVertexNormals();

  // Recessed matte-dark under-button plunger curtain
  const plungerPositions: number[] = [];
  const plungerIndices: number[] = [];
  for (let k = 0; k < perimCount; k++) {
    const p = perimInwardDirs[k];
    plungerPositions.push(p.px + p.nx * 0.00072, p.py - 0.00055, p.pz + p.nz * 0.00072);
  }
  for (let k = 0; k < perimCount; k++) {
    const p = perimInwardDirs[k];
    plungerPositions.push(
      p.px + p.nx * 0.00082,
      Math.max(0.003, p.py - 0.0032),
      p.pz + p.nz * 0.00082,
    );
  }
  for (let k = 0; k < perimCount - 1; k++) {
    const a = k;
    const b = a + 1;
    const c = perimCount + k;
    const dIdx = c + 1;
    if (side === 1) {
      plungerIndices.push(a, b, dIdx);
      plungerIndices.push(a, dIdx, c);
    } else {
      plungerIndices.push(a, dIdx, b);
      plungerIndices.push(a, c, dIdx);
    }
  }

  const plungerSkirtGeo = new THREE.BufferGeometry();
  plungerSkirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(plungerPositions, 3));
  plungerSkirtGeo.setIndex(plungerIndices);
  plungerSkirtGeo.computeVertexNormals();

  mouseGeoCache.set(plateKey, plateGeo);
  mouseGeoCache.set(plungerKey, plungerSkirtGeo);
  return { plateGeo, plungerSkirtGeo };
}

/**
 * Builds the black lower base chassis with a true uniform-normal quarter-elliptical rounded
 * bottom bevel all around the perimeter (zero uneven shrink distortion).
 */
function buildClassicMouseBaseGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `classic-mouse-black-base-planar-v1:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const angularSegs = 224;
  const ringStride = angularSegs + 1;
  const bevelSteps = 10;
  const baseY = 0.0004;
  const bottomFilletInset = 0.0022;

  // Precompute perimeter points and exact 2D inward horizontal normals
  const perim = Array.from({ length: ringStride }, (_, ia) => {
    const theta = (ia / angularSegs) * Math.PI * 2;
    const ux = Math.sin(theta);
    const uz = -Math.cos(theta);
    const { x, z, t } = diskToPhysicalXZ(ux, uz, w, d);
    const beltY = h * evaluateBeltNorm(t);

    const eps = 0.004;
    const pNext = diskToPhysicalXZ(Math.sin(theta + eps), -Math.cos(theta + eps), w, d);
    const pPrev = diskToPhysicalXZ(Math.sin(theta - eps), -Math.cos(theta - eps), w, d);
    const tx = pNext.x - pPrev.x;
    const tz = pNext.z - pPrev.z;
    const tLen = Math.max(1e-6, Math.hypot(tx, tz));
    // As theta increases clockwise from front (-z -> +x -> +z -> -x), inward normal is (-tz, tx) / tLen
    const inX = -tz / tLen;
    const inZ = tx / tLen;
    return { x, z, beltY, inX, inZ };
  });

  const positions: number[] = [];
  const indices: number[] = [];

  for (let is = 0; is <= bevelSteps; is++) {
    const alpha = (is / bevelSteps) * (Math.PI / 2);
    const vertCos = Math.cos(alpha);
    const inSin = 1 - Math.cos(alpha);
    for (let ia = 0; ia <= angularSegs; ia++) {
      const p = perim[ia];
      const inset = 0.00022 + bottomFilletInset * inSin;
      const xPos = p.x + p.inX * inset;
      const zPos = p.z + p.inZ * inset;
      const topY = p.beltY - 0.00018;
      const yPos = baseY + (topY - baseY) * vertCos;
      positions.push(xPos, yPos, zPos);
    }
  }

  for (let is = 0; is < bevelSteps; is++) {
    for (let ia = 0; ia < angularSegs; ia++) {
      const a = is * ringStride + ia;
      const b = a + 1;
      const c = (is + 1) * ringStride + ia;
      const dIdx = c + 1;
      indices.push(a, b, dIdx);
      indices.push(a, dIdx, c);
    }
  }

  const bottomRingStart = bevelSteps * ringStride;
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
 * Builds smooth rounded-shoulder scroll wheel tire and white inner hub geometries
 * (revolved around Y then rotated onto X-axis so wheel edges are 100% smoothly filleted).
 */
function buildRoundedScrollWheelGeometries(wheelRadius: number): {
  tireGeo: THREE.BufferGeometry;
  hubGeo: THREE.BufferGeometry;
} {
  const tireKey = `mouse-wheel-tire-v1:${wheelRadius.toFixed(5)}`;
  const hubKey = `mouse-wheel-hub-v1:${wheelRadius.toFixed(5)}`;
  const cTire = mouseGeoCache.get(tireKey);
  const cHub = mouseGeoCache.get(hubKey);
  if (cTire && cHub) return { tireGeo: cTire, hubGeo: cHub };

  const halfWidth = 0.00225;
  const shoulderR = 0.00075;
  const innerR = wheelRadius * 0.72;
  const tirePts: THREE.Vector2[] = [new THREE.Vector2(innerR, -halfWidth)];
  const arcSteps = 8;
  for (let i = 0; i <= arcSteps; i++) {
    const a = -Math.PI / 2 + (i / arcSteps) * (Math.PI / 2);
    tirePts.push(
      new THREE.Vector2(
        wheelRadius - shoulderR + shoulderR * Math.cos(a),
        -halfWidth + shoulderR + shoulderR * Math.sin(a),
      ),
    );
  }
  for (let i = 0; i <= arcSteps; i++) {
    const a = (i / arcSteps) * (Math.PI / 2);
    tirePts.push(
      new THREE.Vector2(
        wheelRadius - shoulderR + shoulderR * Math.cos(a),
        halfWidth - shoulderR + shoulderR * Math.sin(a),
      ),
    );
  }
  tirePts.push(new THREE.Vector2(innerR, halfWidth));

  const tireGeo = new THREE.LatheGeometry(tirePts, 64);
  tireGeo.rotateZ(Math.PI / 2);
  tireGeo.computeVertexNormals();

  const hubOuterR = wheelRadius - shoulderR * 0.55;
  const hubHalfW = halfWidth + 0.00028;
  const hubFillet = 0.00038;
  const hubPts: THREE.Vector2[] = [new THREE.Vector2(0, -hubHalfW)];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    hubPts.push(
      new THREE.Vector2(
        hubOuterR - hubFillet + hubFillet * Math.cos(a),
        -hubHalfW + hubFillet + hubFillet * Math.sin(a),
      ),
    );
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    hubPts.push(
      new THREE.Vector2(
        hubOuterR - hubFillet + hubFillet * Math.cos(a),
        hubHalfW - hubFillet + hubFillet * Math.sin(a),
      ),
    );
  }
  hubPts.push(new THREE.Vector2(0, hubHalfW));

  const hubGeo = new THREE.LatheGeometry(hubPts, 64);
  hubGeo.rotateZ(Math.PI / 2);
  hubGeo.computeVertexNormals();

  mouseGeoCache.set(tireKey, tireGeo);
  mouseGeoCache.set(hubKey, hubGeo);
  return { tireGeo, hubGeo };
}

/**
 * Builds a curvature-conformal left thumb button (or its dark pocket surround) with smooth
 * high-resolution rounded bevel edges aligned parallel to the side parting plane.
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
  const key = `conformal-thumb-v2:${btnT.toFixed(4)}:${btnY.toFixed(4)}:${rotX.toFixed(3)}:${len.toFixed(4)}:${height.toFixed(4)}:${depth.toFixed(4)}:${protrusionOffset.toFixed(5)}:${bevel.toFixed(4)}`;
  const cached = mouseGeoCache.get(key);
  if (cached) return cached;

  const hw = len / 2;
  const hh = height / 2;
  const r = Math.min(cornerRadius, hw * 0.46, hh * 0.48);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r);
  shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh);
  shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r);
  shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 6,
    curveSegments: 24,
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

    const endTaper = 0.00014 * Math.pow(Math.min(1, Math.abs(vz) / Math.max(1e-4, hw)), 2.2);
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

  const mainBodyGeo = useMemo(() => buildMouseMainBodyGeometry(w, h, d), [w, h, d]);
  const innerWellGeo = useMemo(() => buildMouseInnerWellGeometry(w, h, d), [w, h, d]);
  const leftClick = useMemo(() => buildMouseClickPlateAssemblies(-1, w, h, d), [w, h, d]);
  const rightClick = useMemo(() => buildMouseClickPlateAssemblies(1, w, h, d), [w, h, d]);
  const baseGeo = useMemo(() => buildClassicMouseBaseGeometry(w, h, d), [w, h, d]);

  // Curvature-conformal thumb buttons aligned with the side parting plane
  const btn1T = 0.355;
  const btn2T = 0.52;
  const btn1Y = h * 0.468;
  const btn2Y = h * 0.548;
  const btn1Len = d * 0.142;
  const btn2Len = d * 0.138;
  const btnHeight = h * 0.132;
  const btn1RotX = -0.255;
  const btn2RotX = -0.095;

  const btnGeo1 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn1T,
        btn1Y,
        btn1RotX,
        btn1Len,
        btnHeight,
        0.0014,
        0.00018,
        0.0024,
        0.00048,
        w,
        h,
        d,
      ),
    [btn1T, btn1Y, btn1RotX, btn1Len, btnHeight, w, h, d],
  );
  const btnGeo2 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn2T,
        btn2Y,
        btn2RotX,
        btn2Len,
        btnHeight,
        0.0014,
        0.00018,
        0.0024,
        0.00048,
        w,
        h,
        d,
      ),
    [btn2T, btn2Y, btn2RotX, btn2Len, btnHeight, w, h, d],
  );
  const bezelGeo1 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn1T,
        btn1Y,
        btn1RotX,
        btn1Len + 0.001,
        btnHeight + 0.0009,
        0.0012,
        -0.00022,
        0.0027,
        0.0002,
        w,
        h,
        d,
      ),
    [btn1T, btn1Y, btn1RotX, btn1Len, btnHeight, w, h, d],
  );
  const bezelGeo2 = useMemo(
    () =>
      buildConformalThumbButtonGeometry(
        btn2T,
        btn2Y,
        btn2RotX,
        btn2Len + 0.001,
        btnHeight + 0.0009,
        0.0012,
        -0.00022,
        0.0027,
        0.0002,
        w,
        h,
        d,
      ),
    [btn2T, btn2Y, btn2RotX, btn2Len, btnHeight, w, h, d],
  );

  // 1. Rounded scroll wheel centered at t = 0.1915
  const wheelT = 0.1915;
  const wheelZ = (wheelT - 0.5) * d;
  const wheelRadius = 0.0088;
  const wheelCenterY = h * evaluateRidgeNorm(wheelT) + 0.0018 - wheelRadius;
  const wheelGeos = useMemo(() => buildRoundedScrollWheelGeometries(wheelRadius), [wheelRadius]);

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
      {/* Main Colored Unibody Shell (Rear Palm Dome + Side Cheeks + Lower Front Chin) */}
      <mesh geometry={mainBodyGeo} castShadow receiveShadow>
        <meshStandardMaterial color={resolvedBodyColor} roughness={0.38} metalness={0.03} />
      </mesh>

      {/* Recessed Matte-Dark Internal Switch Housing & Scroll-Wheel Cavity */}
      <mesh geometry={innerWellGeo} receiveShadow>
        <meshStandardMaterial color="#0d0e13" roughness={0.78} metalness={0.04} />
      </mesh>

      {/* Separate Physical 3D Left Mouse Button (LMB) + Recessed Under-Plunger Housing */}
      <mesh geometry={leftClick.plateGeo} castShadow receiveShadow>
        <meshStandardMaterial color={resolvedBodyColor} roughness={0.38} metalness={0.03} />
      </mesh>
      <mesh geometry={leftClick.plungerSkirtGeo}>
        <meshStandardMaterial color="#0c0d12" roughness={0.82} metalness={0.04} />
      </mesh>

      {/* Separate Physical 3D Right Mouse Button (RMB) + Recessed Under-Plunger Housing */}
      <mesh geometry={rightClick.plateGeo} castShadow receiveShadow>
        <meshStandardMaterial color={resolvedBodyColor} roughness={0.38} metalness={0.03} />
      </mesh>
      <mesh geometry={rightClick.plungerSkirtGeo}>
        <meshStandardMaterial color="#0c0d12" roughness={0.82} metalness={0.04} />
      </mesh>

      {/* Separate Black Lower Base Skirt Chassis */}
      <mesh geometry={baseGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#15161a" roughness={0.28} metalness={0.08} />
      </mesh>

      {/* Smoothly Filleted Scroll Wheel Assembly (White Inner Hub + Rounded Matte Rubber Tire) */}
      <group position={[0, wheelCenterY, wheelZ]}>
        <mesh geometry={wheelGeos.hubGeo}>
          <meshStandardMaterial color="#f8fafc" roughness={0.24} metalness={0.08} />
        </mesh>
        <mesh geometry={wheelGeos.tireGeo} castShadow>
          <meshStandardMaterial color="#18191e" roughness={0.68} metalness={0.05} />
        </mesh>
      </group>

      {/* Center Status / DPI Indicator LED (at t = 0.509) */}
      <mesh position={[0, ledY + 0.00012, ledZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.0006, 24]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.45}
          roughness={0.2}
        />
      </mesh>

      {/* Left-Side Curvature-Conformal Thumb Buttons + Rounded Pocket Surrounds */}
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
        <circleGeometry args={[w * 0.2, 32]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.18} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.0002, d * 0.23]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[w * 0.19, 32]} />
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
            <cylinderGeometry args={[0.0021, 0.0028, 0.009, 20]} />
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

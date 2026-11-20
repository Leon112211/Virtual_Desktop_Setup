import { Vector3 } from 'three';
import {
  findContainingHole,
  projectCablePointClear,
  resolveSegmentClearance,
  type CableHole,
  type SolidBox,
} from './collision';

export type CableGuideAnchor = {
  point: Vector3;
  pinned: boolean;
  /** True for non-deformable physical locks (port boots, arm clips, pass-through holes). */
  hardPin?: boolean;
  /** Optional unit exit tangent from a pin (port boot or through-hole channel). */
  tangent?: Vector3;
  /** User-edited waypoint: attracts horizontally (XZ) while still obeying gravity (-Y). */
  horizontalGuide?: boolean;
};

export type SolveStaticCableParams = {
  anchors: CableGuideAnchor[];
  bodyM: number;
  radius: number;
  stiffness: number;
  minInteriorAngleDeg: number;
  solids: SolidBox[];
  holes: CableHole[];
  allowedItemIds: Set<string>;
  freeTail?: boolean;
};

export type SolveStaticCableResult = {
  points: Vector3[];
  pathBodyLengthM: number;
  shortfallM: number;
  collisionAdjusted: boolean;
};

const _a = new Vector3();
const _b = new Vector3();
const _mid = new Vector3();
const _delta = new Vector3();
const _push = new Vector3();

/**
 * Prevents nodes resting on or above a horizontal desk/shelf slab from tunneling vertically
 * through the slab thickness when gravity or curvature pulls them down in a single sub-step.
 */
function projectCablePointWithSupport(
  pt: Vector3,
  prevY: number,
  radius: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
): { point: Vector3; adjusted: boolean } {
  let clampedTop = false;
  const inHole = findContainingHole(pt, radius, holes);
  if (!inHole || inHole.kind !== 'grommet') {
    for (const s of solids) {
      const isBasePlate = s.id.endsWith(':base');
      if (s.kind !== 'desk' && s.kind !== 'shelf' && !isBasePlate) continue;
      if (!isBasePlate && s.itemId && allowedItemIds.has(s.itemId)) continue;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const dx = pt.x - s.cx;
      const dz = pt.z - s.cz;
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      if (Math.abs(lx) < s.halfW + radius && Math.abs(lz) < s.halfD + radius) {
        const restY = s.maxY + radius + 0.003;
        if (prevY >= s.maxY - 0.005 && pt.y < restY) {
          pt.y = restY;
          clampedTop = true;
        }
      }
    }
  }
  const res = projectCablePointClear(pt, radius, solids, holes, allowedItemIds);
  return { point: res.point, adjusted: res.adjusted || clampedTop };
}

/** Computes polyline length across points. */
export function polylineLength(points: readonly Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].distanceTo(points[i - 1]);
  }
  return total;
}

/**
 * Returns the minimum interior angle (in degrees, [0, 180]) along a cable polyline.
 * An interior angle < 90° represents an acute hairpin bend.
 */
export function minCableInteriorAngleDeg(points: readonly Vector3[]): number {
  const clean: Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    if (
      i === 0 ||
      i === points.length - 1 ||
      clean[clean.length - 1].distanceTo(points[i]) > 0.005
    ) {
      clean.push(points[i]);
    }
  }
  if (clean.length < 3) return 180;
  let minDeg = 180;
  for (let i = 1; i < clean.length - 1; i++) {
    _a.subVectors(clean[i - 1], clean[i]);
    _b.subVectors(clean[i + 1], clean[i]);
    const la = _a.length();
    const lb = _b.length();
    if (la < 1e-5 || lb < 1e-5) continue;
    const cos = Math.max(-1, Math.min(1, _a.dot(_b) / (la * lb)));
    const deg = (Math.acos(cos) * 180) / Math.PI;
    if (deg < minDeg) minDeg = deg;
  }
  return minDeg;
}

/**
 * Enforces bending resilience so consecutive segments never fold into an acute angle (< 90°).
 * Smoothly curves tight kinks across neighboring unpinned nodes and applies progressive
 * high-resilience strain-relief reinforcement symmetrically near both cable ends.
 */
export function relaxNonAcuteBends(
  nodes: Vector3[],
  pinned: readonly boolean[],
  minInteriorDeg: number,
  stiffness: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
  passes = 10,
  cableRadius = 0.004,
): boolean {
  const n = nodes.length;
  if (n < 3) return false;
  let adjusted = false;
  const baseTargetDeg = Math.max(96, Math.min(148, minInteriorDeg));
  const hasStartStub = pinned[0] && pinned[1];
  const hasEndStub = pinned[n - 1] && pinned[n - 2];

  const guardPinnedExit = (
    pivotIdx: number,
    refIdx: number,
    freeIdx: number,
    localCosLimit: number,
  ) => {
    _delta.copy(nodes[pivotIdx]).sub(nodes[refIdx]);
    const dirLen = _delta.length();
    if (dirLen <= 1e-5) return;
    _delta.divideScalar(dirLen);
    const outVec = new Vector3().subVectors(nodes[freeIdx], nodes[pivotIdx]);
    const outLen = outVec.length();
    if (outLen <= 1e-5) return;
    const preY = nodes[freeIdx].y;
    const forwardProj = outVec.dot(_delta);
    // Target cone aligned along coaxial strain-relief exit direction while strictly preserving segment length `outLen`
    const minForward = Math.max(0.015, outLen * Math.min(0.95, -localCosLimit * 0.96));
    if (forwardProj < minForward) {
      const blended = outVec.clone().addScaledVector(_delta, (minForward - forwardProj) * 0.85);
      // Avoid zero-vector/180°-foldback singularity when a waypoint pulls directly opposite to `_delta`
      if (forwardProj < -0.55 * outLen || blended.lengthSq() < 1e-6) {
        let lx = -_delta.z;
        let lz = _delta.x;
        const lh = Math.hypot(lx, lz);
        if (lh < 1e-4) {
          lx = 1;
          lz = 0;
        } else {
          lx /= lh;
          lz /= lh;
        }
        blended.x += lx * outLen * 0.45;
        blended.z += lz * outLen * 0.45;
      }
      if (blended.lengthSq() > 1e-8) {
        blended.normalize().multiplyScalar(outLen);
        const candidate = nodes[pivotIdx].clone().add(blended);
        const clr = projectCablePointWithSupport(
          candidate,
          preY,
          cableRadius,
          solids,
          holes,
          allowedItemIds,
        );
        if (clr.point.distanceToSquared(nodes[refIdx]) > 1e-5) {
          if (clr.adjusted) adjusted = true;
          nodes[freeIdx].copy(clr.point);
        }
      }
    }
  };

  for (let pass = 0; pass < passes; pass++) {
    let changedThisPass = false;
    for (let i = 1; i < n - 1; i++) {
      _a.subVectors(nodes[i - 1], nodes[i]);
      _b.subVectors(nodes[i + 1], nodes[i]);
      const la = _a.length();
      const lb = _b.length();
      if (la < 0.005 || lb < 0.005) {
        if (!pinned[i]) {
          nodes[i].lerpVectors(nodes[i - 1], nodes[i + 1], 0.5);
          changedThisPass = true;
        }
        continue;
      }

      // Progressive end-zone stiffness: cables exhibit much stronger bending resistance near
      // both connector strain-relief boots (~8-10 cm transition zone) than in mid-span.
      const distFromStart = hasStartStub ? i : 99;
      const distFromEnd = hasEndStub ? n - 1 - i : 99;
      const endSteps = Math.min(distFromStart, distFromEnd);
      let localTargetDeg = baseTargetDeg;
      let localStiffness = stiffness;
      if (endSteps === 1) {
        localTargetDeg = Math.max(baseTargetDeg, Math.min(164, 148 + stiffness * 18));
        localStiffness = Math.min(1, stiffness + 0.35);
      } else if (endSteps === 2) {
        localTargetDeg = Math.max(baseTargetDeg, Math.min(156, 140 + stiffness * 16));
        localStiffness = Math.min(1, stiffness + 0.25);
      } else if (endSteps === 3) {
        localTargetDeg = Math.max(baseTargetDeg, Math.min(146, 130 + stiffness * 14));
        localStiffness = Math.min(1, stiffness + 0.15);
      } else if (endSteps === 4) {
        localTargetDeg = Math.max(baseTargetDeg, Math.min(136, 120 + stiffness * 12));
        localStiffness = Math.min(1, stiffness + 0.08);
      }
      const cosLimit = Math.cos((localTargetDeg * Math.PI) / 180); // negative for > 90°
      const cos = Math.max(-1, Math.min(1, _a.dot(_b) / (la * lb)));

      // Fairing along adjacent vertices: straighten horizontal (XZ) runs to eliminate desktop zigzags
      // while keeping vertical (-Y) gravity catenary sag intact unless curvature exceeds angle limit
      if (!pinned[i] && localStiffness > 0.1) {
        const w = la / (la + lb);
        _mid.lerpVectors(nodes[i - 1], nodes[i + 1], w);
        const xzScale = Math.min(0.56, 0.2 + localStiffness * 0.3);
        nodes[i].x += (_mid.x - nodes[i].x) * xzScale;
        nodes[i].z += (_mid.z - nodes[i].z) * xzScale;
        if (cos > -0.985) {
          nodes[i].y += (_mid.y - nodes[i].y) * Math.min(0.18, xzScale * 0.28);
        }
        const clr = projectCablePointWithSupport(
          nodes[i],
          nodes[i].y,
          cableRadius,
          solids,
          holes,
          allowedItemIds,
        );
        if (clr.adjusted) adjusted = true;
        nodes[i].copy(clr.point);
      }

      if (cos <= cosLimit) continue;
      changedThisPass = true;

      // Severity weight [0..1] grows strongly as bend approaches acute (< 90°)
      const severity = Math.min(1, (cos - cosLimit) / Math.max(0.08, 1 - cosLimit));
      const w = la / (la + lb);
      _mid.lerpVectors(nodes[i - 1], nodes[i + 1], w);

      if (!pinned[i]) {
        const preBendY = nodes[i].y;
        const pull = Math.min(0.68, 0.25 + severity * 0.44);
        nodes[i].lerp(_mid, pull);
        const clr = projectCablePointWithSupport(
          nodes[i],
          preBendY,
          cableRadius,
          solids,
          holes,
          allowedItemIds,
        );
        if (clr.adjusted) adjusted = true;
        nodes[i].copy(clr.point);
      } else {
        // Symmetric strain-relief exit guard at BOTH from-end and to-end pinned connector boots
        if (!pinned[i + 1]) {
          guardPinnedExit(i, i - 1, i + 1, cosLimit);
        }
        if (!pinned[i - 1]) {
          guardPinnedExit(i, i + 1, i - 1, cosLimit);
        }
      }

      // Open the outer chord between i-1 and i+1 only for genuinely tight (< baseTargetDeg) kinks
      // so progressive end-zone stiffening never stretches fixed-length cables past their budget
      const freePrev = !pinned[i - 1] && i - 1 > 0;
      const freeNext = !pinned[i + 1] && i + 1 < n - 1;
      const baseCosLimit = Math.cos((baseTargetDeg * Math.PI) / 180);
      if (cos > baseCosLimit && (freePrev || freeNext)) {
        _push.subVectors(nodes[i + 1], nodes[i - 1]);
        const chord = _push.length();
        const minChord = Math.sqrt(Math.max(1e-6, la * la + lb * lb - 2 * la * lb * baseCosLimit));
        if (chord < minChord) {
          if (chord < 0.25 * (la + lb)) {
            // Hairpin U-turn (< ~30°): open laterally orthogonal to the leg direction to form a real bend radius
            _delta.copy(_a).add(_b);
            if (_delta.lengthSq() < 1e-8) _delta.copy(_a);
            _delta.normalize();
            // Orthogonal lateral vector in XZ plane (or X fallback)
            let lx = -_delta.z;
            let lz = _delta.x;
            const lh = Math.hypot(lx, lz);
            if (lh < 1e-4) {
              lx = 1;
              lz = 0;
            } else {
              lx /= lh;
              lz /= lh;
            }
            const spread = Math.max(0.018, (minChord - chord) * 0.52);
            const targetY = nodes[i].y - Math.min(Math.abs(_a.y) + Math.abs(_b.y), spread * 0.45);
            if (freePrev) {
              nodes[i - 1].x -= lx * spread;
              nodes[i - 1].z -= lz * spread;
              nodes[i - 1].y = nodes[i - 1].y * 0.55 + targetY * 0.45;
            }
            if (freeNext) {
              nodes[i + 1].x += lx * spread;
              nodes[i + 1].z += lz * spread;
              nodes[i + 1].y = nodes[i + 1].y * 0.55 + targetY * 0.45;
            }
          } else {
            const diff = ((minChord - chord) / chord) * 0.48;
            if (freePrev && freeNext) {
              nodes[i - 1].addScaledVector(_push, -diff * 0.5);
              nodes[i + 1].addScaledVector(_push, diff * 0.5);
            } else if (freePrev) {
              nodes[i - 1].addScaledVector(_push, -diff);
            } else {
              nodes[i + 1].addScaledVector(_push, diff);
            }
          }
        }
      }
    }
    if (!changedThisPass && pass >= 2) break;
  }

  return adjusted;
}

/**
 * Solves static cable drape under gravity, fixed physical cable length, bending resilience
 * (non-acute curves), and solid surface contact so cables never float inexplicably in mid-air.
 */
export function solveStaticCablePhysics(params: SolveStaticCableParams): SolveStaticCableResult {
  const {
    anchors,
    bodyM,
    radius,
    stiffness,
    minInteriorAngleDeg,
    solids,
    holes,
    allowedItemIds,
    freeTail = false,
  } = params;

  if (anchors.length < 2) {
    const pts = anchors.map((a) => a.point.clone());
    return { points: pts, pathBodyLengthM: 0, shortfallM: 0, collisionAdjusted: false };
  }

  // Group anchors into spans split by `pinned` anchors so every unpinned topology guide simply shapes initialization.
  const pinIndices: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    if (i === 0 || i === anchors.length - 1 || anchors[i].pinned) {
      pinIndices.push(i);
    }
  }

  type Span = {
    guidePts: Vector3[];
    guideNodes: { dist: number; x: number; z: number }[];
    geoLen: number;
    fixedExact: boolean;
    targetLen: number;
  };
  const spans: Span[] = [];
  let totalGeoLen = 0;
  let adjustableGeoLen = 0;

  for (let s = 0; s < pinIndices.length - 1; s++) {
    const startIdx = pinIndices[s];
    const endIdx = pinIndices[s + 1];
    const slice = anchors.slice(startIdx, endIdx + 1);
    const guidePts = slice.map((a) => a.point.clone());
    const guideNodes: { dist: number; x: number; z: number }[] = [];
    let accDist = 0;
    for (let gi = 0; gi < slice.length; gi++) {
      if (gi > 0) accDist += slice[gi].point.distanceTo(slice[gi - 1].point);
      if (slice[gi].horizontalGuide) {
        guideNodes.push({ dist: accDist, x: slice[gi].point.x, z: slice[gi].point.z });
      }
    }
    const geoLen = accDist;
    const shortPinnedStub =
      guidePts.length === 2 &&
      geoLen < 0.085 &&
      (s === 0 ||
        s === pinIndices.length - 2 ||
        Boolean(findContainingHole(guidePts[0], radius, holes)));
    spans.push({
      guidePts,
      guideNodes,
      geoLen,
      fixedExact: shortPinnedStub,
      targetLen: geoLen,
    });
    totalGeoLen += geoLen;
    if (!shortPinnedStub) adjustableGeoLen += geoLen;
  }

  const slack = Math.max(0, bodyM - totalGeoLen);
  if (slack > 0.005 && adjustableGeoLen > 1e-4) {
    for (let s = 0; s < spans.length; s++) {
      const sp = spans[s];
      if (sp.fixedExact) continue;
      if (freeTail) {
        const isLastSpan = s === spans.length - 1;
        const share = isLastSpan ? 0.68 : 0.32 * (sp.geoLen / Math.max(1e-4, adjustableGeoLen));
        sp.targetLen = sp.geoLen + slack * (spans.length <= 2 && isLastSpan ? 0.85 : share);
      } else {
        sp.targetLen = sp.geoLen + slack * (sp.geoLen / adjustableGeoLen);
      }
    }
  }

  // Discretize spans into simulation nodes + rest segment lengths
  const nodes: Vector3[] = [spans[0].guidePts[0].clone()];
  const pinned: boolean[] = [true];
  const hardPinned: boolean[] = [anchors[0].hardPin ?? true];
  const restLen: number[] = [];
  const xzGuides = new Map<number, { x: number; z: number }>();

  for (let s = 0; s < spans.length; s++) {
    const sp = spans[s];
    const endAnchorIdx = pinIndices[s + 1];
    const endPin = anchors[endAnchorIdx].pinned;
    const endHardPin =
      anchors[endAnchorIdx].hardPin ??
      (endPin &&
        (s === 0 ||
          s === spans.length - 1 ||
          Boolean(findContainingHole(anchors[endAnchorIdx].point, radius, holes))));
    if (sp.fixedExact || sp.geoLen < 0.025) {
      const endPt = sp.guidePts[sp.guidePts.length - 1].clone();
      nodes.push(endPt);
      pinned.push(endPin);
      hardPinned.push(endHardPin);
      restLen.push(Math.max(0.004, nodes[nodes.length - 2].distanceTo(endPt)));
      continue;
    }

    const segStep = 0.032;
    const subCount = Math.max(3, Math.min(34, Math.ceil(sp.targetLen / segStep)));
    const perSegRest = sp.targetLen / subCount;
    const guideLen = Math.max(1e-5, sp.geoLen);
    const spanFirstIdx = nodes.length;

    for (let k = 1; k <= subCount; k++) {
      const targetDist = (k / subCount) * guideLen;
      const sample = samplePolylineAtDistance(sp.guidePts, targetDist);
      const rawGuideY = sample.y;
      const isEnd = k === subCount;
      // Add gentle downward seed bias proportional to slack so spans settle straight onto supporting surfaces
      if (!isEnd && sp.targetLen > sp.geoLen + 0.02) {
        const arch = Math.sin((k / subCount) * Math.PI);
        const dropBias = Math.min(0.24, (sp.targetLen - sp.geoLen) * 0.45) * arch;
        sample.y -= dropBias;
        const seeded = projectCablePointWithSupport(
          sample,
          rawGuideY,
          radius,
          solids,
          holes,
          allowedItemIds,
        );
        sample.copy(seeded.point);
      }
      nodes.push(sample);
      pinned.push(isEnd ? endPin : false);
      hardPinned.push(isEnd ? endHardPin : false);
      restLen.push(perSegRest);
    }

    for (const g of sp.guideNodes) {
      const ratio = guideLen > 1e-4 ? Math.max(0, Math.min(1, g.dist / guideLen)) : 0.5;
      const kIdx = Math.max(1, Math.min(subCount - 1, Math.round(ratio * subCount)));
      xzGuides.set(spanFirstIdx + kIdx - 1, { x: g.x, z: g.z });
    }
  }

  let collisionAdjusted = false;
  const n = nodes.length;
  const outerIters = 76;
  const minDist = radius + 0.002;
  const prevYs = nodes.map((p) => p.y);

  for (let iter = 0; iter < outerIters; iter++) {
    for (let i = 0; i < n; i++) prevYs[i] = nodes[i].y;
    // 1) Gravity force pulling unpinned nodes smoothly downward until surface contact or taut catenary
    const fade = iter < outerIters * 0.7 ? 1 : 0.45;
    const gStep = 0.011 * fade;
    const guidePull = iter < outerIters * 0.65 ? 0.16 : 0.08;
    for (let i = 0; i < n; i++) {
      if (!pinned[i]) {
        nodes[i].y -= gStep;
        const g = xzGuides.get(i);
        if (g) {
          nodes[i].x += (g.x - nodes[i].x) * guidePull;
          nodes[i].z += (g.z - nodes[i].z) * guidePull;
        }
      }
    }

    // 2) Distance constraints preserving fixed physical segment lengths
    for (let dPass = 0; dPass < 3; dPass++) {
      const forward = dPass % 2 === 0;
      const start = forward ? 0 : n - 2;
      const end = forward ? n - 1 : -1;
      const step = forward ? 1 : -1;
      for (let i = start; i !== end; i += step) {
        const p0 = nodes[i];
        const p1 = nodes[i + 1];
        const pin0 = pinned[i];
        const pin1 = pinned[i + 1];
        if (pin0 && pin1) continue;

        _delta.subVectors(p1, p0);
        const len = _delta.length();
        const target = restLen[i];
        if (len < 1e-6) continue;
        // Unidirectional length ceiling: enforce taut limit (err > 0) while suppressing
        // compression push (err < 0) so excess slack does not Euler-buckle into desktop zigzags.
        const err = len - target;
        if (Math.abs(err) < 1e-5) continue;
        const compFactor = iter < outerIters * 0.35 ? 0.04 : 0;
        const compliance = err > 0 ? 0.9 : compFactor;
        if (compliance <= 0) continue;
        const corr = (err / len) * compliance;
        if (!pin0 && !pin1) {
          p0.addScaledVector(_delta, corr * 0.5);
          p1.addScaledVector(_delta, -corr * 0.5);
        } else if (!pin0) {
          p0.addScaledVector(_delta, corr);
        } else {
          p1.addScaledVector(_delta, -corr);
        }
      }
    }

    // 3) Bending stiffness inside loop to prevent sharp folds early
    relaxNonAcuteBends(
      nodes,
      pinned,
      minInteriorAngleDeg,
      stiffness,
      solids,
      holes,
      allowedItemIds,
      2,
      radius,
    );

    // 4) Collision projection against desk/shelf/wall/items/floor while keeping hole interiors clear
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue;
      if (nodes[i].y < minDist) {
        nodes[i].y = minDist;
        collisionAdjusted = true;
      }
      const res = projectCablePointWithSupport(
        nodes[i],
        prevYs[i],
        radius,
        solids,
        holes,
        allowedItemIds,
      );
      if (res.adjusted) collisionAdjusted = true;
      nodes[i].copy(res.point);
    }
  }

  // Collapse unpinned micro-sliver segments (< 1 cm) before final angle relaxation so two close turns cannot sum into an acute hairpin
  const mergedNodes: Vector3[] = [];
  const mergedHard: boolean[] = [];
  for (let i = 0; i < n; i++) {
    if (
      mergedNodes.length > 0 &&
      !hardPinned[i] &&
      !mergedHard[mergedHard.length - 1] &&
      mergedNodes[mergedNodes.length - 1].distanceTo(nodes[i]) < 0.011
    ) {
      mergedNodes[mergedNodes.length - 1].lerp(nodes[i], 0.5);
      continue;
    }
    mergedNodes.push(nodes[i]);
    mergedHard.push(hardPinned[i]);
  }
  const mergedPrevYs = mergedNodes.map((p) => p.y);

  // Final dedicated non-acute pass: only hard locks (ports/clips/holes) stay rigid so impossible sharp hairpin corners round naturally
  if (
    relaxNonAcuteBends(
      mergedNodes,
      mergedHard,
      Math.max(108, minInteriorAngleDeg - 4),
      stiffness,
      solids,
      holes,
      allowedItemIds,
      56,
      radius,
    )
  ) {
    collisionAdjusted = true;
  }

  for (let i = 0; i < mergedNodes.length; i++) {
    if (mergedHard[i]) continue;
    const res = projectCablePointWithSupport(
      mergedNodes[i],
      mergedPrevYs[i],
      radius,
      solids,
      holes,
      allowedItemIds,
    );
    if (res.adjusted) collisionAdjusted = true;
    mergedNodes[i].copy(res.point);
  }

  // Re-settle downward after angle relaxation while preserving non-acute curvature above bases/slabs,
  // then run continuous swept-segment clearance as the final physical guarantee.
  for (let sPass = 0; sPass < 4; sPass++) {
    for (let i = 0; i < mergedNodes.length; i++) {
      if (mergedHard[i]) continue;
      const py = mergedNodes[i].y;
      mergedNodes[i].y -= 0.004;
      const res = projectCablePointWithSupport(
        mergedNodes[i],
        py,
        radius,
        solids,
        holes,
        allowedItemIds,
      );
      if (res.adjusted) collisionAdjusted = true;
      mergedNodes[i].copy(res.point);
    }
    if (
      relaxNonAcuteBends(
        mergedNodes,
        mergedHard,
        Math.max(108, minInteriorAngleDeg - 4),
        stiffness,
        solids,
        holes,
        allowedItemIds,
        4,
        radius,
      )
    ) {
      collisionAdjusted = true;
    }
    for (let i = 0; i < mergedNodes.length; i++) {
      if (mergedHard[i]) continue;
      const res = projectCablePointWithSupport(
        mergedNodes[i],
        mergedPrevYs[i],
        radius,
        solids,
        holes,
        allowedItemIds,
      );
      if (res.adjusted) collisionAdjusted = true;
      mergedNodes[i].copy(res.point);
    }
  }

  const swept = resolveSegmentClearance(mergedNodes, radius, solids, holes, allowedItemIds);
  if (swept.adjusted) collisionAdjusted = true;
  const hardRefs = mergedNodes.filter((_, idx) => mergedHard[idx]);
  let finalPoints = simplifyCollinearPoints(swept.points, hardRefs);

  // Preserve exact selected cable body length: when the clean geodesic path is shorter than
  // `bodyM` (surplus wire slack > 2.5 cm), lay out excess length in one smooth rear/open service
  // arch, tidy flat coil, or floor drape instead of stretching/shrinking or buckling into zigzags.
  const baseLen = polylineLength(finalPoints);
  if (bodyM - baseLen > 0.025) {
    const conservRes = layoutFixedSurplusLoop(
      finalPoints,
      hardRefs,
      bodyM,
      radius,
      minInteriorAngleDeg,
      stiffness,
      solids,
      holes,
      allowedItemIds,
      freeTail,
      anchors.some((a) => a.horizontalGuide),
    );
    if (conservRes.adjusted) {
      finalPoints = conservRes.points;
      collisionAdjusted = true;
    }
  }

  if (finalPoints.length >= 3 && minCableInteriorAngleDeg(finalPoints) < 94) {
    const pinnedFinal = finalPoints.map(
      (p, idx) =>
        idx === 0 ||
        idx === finalPoints.length - 1 ||
        hardRefs.some((h) => h.distanceToSquared(p) < 1e-7),
    );
    if (
      relaxNonAcuteBends(
        finalPoints,
        pinnedFinal,
        Math.max(100, minInteriorAngleDeg - 6),
        stiffness,
        solids,
        holes,
        allowedItemIds,
        14,
        radius,
      )
    ) {
      finalPoints = simplifyCollinearPoints(
        resolveSegmentClearance(finalPoints, radius, solids, holes, allowedItemIds).points,
        hardRefs,
      );
      collisionAdjusted = true;
    }
  }

  const finalLen = polylineLength(finalPoints);
  return {
    points: finalPoints,
    pathBodyLengthM: finalLen,
    shortfallM: Math.max(0, Math.round((finalLen - bodyM) * 1000) / 1000),
    collisionAdjusted,
  };
}

/**
 * Allocates surplus wire length (`bodyM - baseLen`) into a single smooth rear service arch,
 * compact rounded desktop/floor coil, or floor-tail extension so fixed-length cables conserve
 * their true physical length (`pathBodyLengthM ≈ bodyM`) while keeping open spans straight.
 */
function layoutFixedSurplusLoop(
  basePts: Vector3[],
  hardRefs: readonly Vector3[],
  bodyM: number,
  radius: number,
  minInteriorAngleDeg: number,
  stiffness: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
  freeTail: boolean,
  hasManualGuides: boolean,
): { points: Vector3[]; adjusted: boolean } {
  const targetMin = bodyM - 0.02;
  if (polylineLength(basePts) >= targetMin || basePts.length < 2) {
    return { points: basePts, adjusted: false };
  }
  const isPinnedRef = (p: Vector3, idx: number, len: number) =>
    idx < 2 ||
    idx === len - 1 ||
    Boolean(findContainingHole(p, radius, holes)) ||
    hardRefs.some((h) => h.distanceToSquared(p) < 1e-7);

  // 1) Floor-drop cables: extend along the floor rear in a clean horizontal run + smooth J/U return
  if (freeTail && basePts.length >= 3) {
    const floorPts = basePts.map((p) => p.clone());
    const last = floorPts[floorPts.length - 1];
    const prev = floorPts[floorPts.length - 2];
    const floorY = Math.min(last.y, radius + 0.005);
    last.y = floorY;
    const surplus = bodyM - polylineLength(floorPts);
    if (surplus > 0.02) {
      const dir = new Vector3(last.x - prev.x, 0, last.z - prev.z);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      else dir.normalize();
      const perp = new Vector3(-dir.z, 0, dir.x);
      // Add a smooth wide floor bend consuming the exact extra floor tail
      const leg = Math.min(0.42, surplus * 0.42);
      const radiusTurn = Math.max(0.045, Math.min(0.11, (surplus - leg * 1.4) / Math.PI));
      const p1 = new Vector3(last.x + dir.x * leg * 0.5, floorY, last.z + dir.z * leg * 0.5);
      floorPts.push(p1);
      const center = p1.clone().addScaledVector(perp, radiusTurn);
      const steps = 10;
      for (let s = 1; s <= steps; s++) {
        const theta = (Math.PI * s) / steps;
        const arcPt = new Vector3(
          center.x + dir.x * Math.sin(theta) * radiusTurn - perp.x * Math.cos(theta) * radiusTurn,
          floorY,
          center.z + dir.z * Math.sin(theta) * radiusTurn - perp.z * Math.cos(theta) * radiusTurn,
        );
        floorPts.push(arcPt);
      }
      const rem = bodyM - polylineLength(floorPts);
      if (rem > 0.01) {
        const tip = floorPts[floorPts.length - 1];
        floorPts.push(new Vector3(tip.x - dir.x * rem, floorY, tip.z - dir.z * rem));
      }
      const cleared = resolveSegmentClearance(floorPts, radius, solids, holes, allowedItemIds);
      const pinnedFloor = cleared.points.map((p, idx) =>
        isPinnedRef(p, idx, cleared.points.length),
      );
      relaxNonAcuteBends(
        cleared.points,
        pinnedFloor,
        Math.max(100, minInteriorAngleDeg - 4),
        stiffness,
        solids,
        holes,
        allowedItemIds,
        8,
      );
      return { points: cleared.points, adjusted: true };
    }
  }

  // Do not alter explicit user-drawn multi-waypoint curves unless nearly straight
  if (hasManualGuides) {
    return { points: basePts, adjusted: false };
  }

  // 2) Device-to-device cables: choose the longest uncluttered desktop/rear span
  let bestIdx = -1;
  let bestScore = -1;
  const startIdx = basePts.length > 6 ? 3 : basePts.length > 4 ? 2 : 0;
  const endIdx =
    basePts.length > 6
      ? basePts.length - 4
      : basePts.length > 4
        ? basePts.length - 3
        : basePts.length - 2;
  for (let i = startIdx; i <= endIdx; i++) {
    const a = basePts[i];
    const b = basePts[i + 1];
    const d = a.distanceTo(b);
    if (d < 0.06) continue;
    const isFlat = Math.abs(a.y - b.y) < 0.045;
    const midZ = (a.z + b.z) * 0.5;
    const rearBonus = midZ < 0 ? 0.14 : 0;
    const score = d + (isFlat ? 0.25 : 0) + rearBonus;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return { points: basePts, adjusted: false };

  const pA = basePts[bestIdx];
  const pB = basePts[bestIdx + 1];
  const chord = pA.distanceTo(pB);
  const segDir = new Vector3().subVectors(pB, pA).divideScalar(Math.max(1e-5, chord));
  const segMid = new Vector3().lerpVectors(pA, pB, 0.5);

  // Pick safest outward horizontal sweep normal (prefer -Z rear desktop clearance)
  let perp = new Vector3(-segDir.z, 0, segDir.x);
  if (perp.lengthSq() < 1e-5) perp.set(0, 0, -1);
  else perp.normalize();

  const measureFreeDist = (dir: Vector3): number => {
    const probe = segMid.clone();
    for (let d = 0.03; d <= 0.42; d += 0.025) {
      probe.copy(segMid).addScaledVector(dir, d);
      const clr = projectCablePointClear(probe, radius + 0.002, solids, holes, allowedItemIds);
      if (clr.adjusted && clr.point.distanceTo(probe) > 0.004) {
        return Math.max(0.02, d - 0.025);
      }
    }
    return 0.42;
  };

  const posPerp = perp.z <= 0 ? perp.clone() : perp.clone().negate();
  const negPerp = posPerp.clone().negate();
  const posClear = measureFreeDist(posPerp);
  const negClear = measureFreeDist(negPerp);
  const bestDir = posClear >= 0.09 || posClear >= negClear ? posPerp : negPerp;
  const maxAmp = Math.max(posClear, negClear);

  const excess = bodyM - polylineLength(basePts);

  const buildArch = (amp: number): Vector3[] => {
    const archPts: Vector3[] = [];
    for (let i = 0; i <= bestIdx; i++) archPts.push(basePts[i].clone());
    const t0 = 0.14;
    const t1 = 0.86;
    const aStart = new Vector3().lerpVectors(pA, pB, t0);
    const aEnd = new Vector3().lerpVectors(pA, pB, t1);
    archPts.push(aStart);
    const archSamples = 14;
    for (let k = 1; k < archSamples; k++) {
      const s = k / archSamples;
      const pt = new Vector3().lerpVectors(aStart, aEnd, s);
      const lift = 0.5 * (1 - Math.cos(Math.PI * 2 * s)) * amp;
      pt.addScaledVector(bestDir, lift);
      const clr = projectCablePointWithSupport(pt, pt.y, radius, solids, holes, allowedItemIds);
      archPts.push(clr.point);
    }
    archPts.push(aEnd);
    for (let i = bestIdx + 1; i < basePts.length; i++) archPts.push(basePts[i].clone());
    return resolveSegmentClearance(archPts, radius, solids, holes, allowedItemIds).points;
  };

  // Try single smooth U-arch first if spare slack fits cleanly inside free space
  const archMaxPts = buildArch(Math.min(maxAmp, Math.max(0.04, excess * 0.72)));
  const archMaxLen = polylineLength(archMaxPts);
  if (archMaxLen >= targetMin) {
    let lo = 0;
    let hi = Math.min(maxAmp, Math.max(0.04, excess * 0.72));
    let bestPts = archMaxPts;
    for (let iter = 0; iter < 10; iter++) {
      const midAmp = (lo + hi) * 0.5;
      const cand = buildArch(midAmp);
      const len = polylineLength(cand);
      if (len < bodyM) {
        lo = midAmp;
      } else {
        hi = midAmp;
        bestPts = cand;
      }
    }
    const pinned = bestPts.map((p, idx) => isPinnedRef(p, idx, bestPts.length));
    relaxNonAcuteBends(
      bestPts,
      pinned,
      Math.max(100, minInteriorAngleDeg - 6),
      stiffness,
      solids,
      holes,
      allowedItemIds,
      10,
    );
    return { points: bestPts, adjusted: true };
  }

  // 3) Large surplus relative to available span/wall clearance: form a neat rounded flat service coil
  //    anchored tangentially at `segMid` within `chord * 0.36` so bends stay smooth & non-acute.
  const coilCenter = segMid.clone();
  const coilRadius = Math.max(0.032, Math.min(0.065, maxAmp * 0.44, chord * 0.32));
  const coilPerim = Math.PI * 2 * coilRadius;
  const maxTurnCap = 8;
  const turns = Math.max(1, Math.min(maxTurnCap, Math.ceil(excess / Math.max(0.16, coilPerim))));

  const buildCoil = (rLoop: number, nTurns: number): Vector3[] => {
    const cPts: Vector3[] = [];
    for (let i = 0; i <= bestIdx; i++) cPts.push(basePts[i].clone());
    const entry = new Vector3().lerpVectors(pA, pB, 0.14);
    cPts.push(entry);
    const segsPerTurn = 16;
    const totalSteps = nTurns * segsPerTurn;
    const startAng = -Math.PI / 2;
    const rx = Math.min(Math.max(rLoop, chord * 0.28), chord * 0.36);
    for (let k = 0; k <= totalSteps; k++) {
      const theta = startAng + (Math.PI * 2 * k) / segsPerTurn;
      const rScale = 1 - (k / Math.max(1, totalSteps)) * 0.12;
      const curRx = rx * rScale;
      const curRz = rLoop * rScale;
      const pt = new Vector3(
        coilCenter.x +
          segDir.x * Math.cos(theta) * curRx +
          bestDir.x * (Math.sin(theta) + 1) * curRz,
        coilCenter.y,
        coilCenter.z +
          segDir.z * Math.cos(theta) * curRx +
          bestDir.z * (Math.sin(theta) + 1) * curRz,
      );
      const clr = projectCablePointWithSupport(
        pt,
        pt.y + 0.01,
        radius,
        solids,
        holes,
        allowedItemIds,
      );
      cPts.push(clr.point);
    }
    const exit = new Vector3().lerpVectors(pA, pB, 0.86);
    cPts.push(exit);
    for (let i = bestIdx + 1; i < basePts.length; i++) cPts.push(basePts[i].clone());
    const cleared = resolveSegmentClearance(cPts, radius, solids, holes, allowedItemIds).points;
    const pinnedCoil = cleared.map((p, idx) => isPinnedRef(p, idx, cleared.length));
    relaxNonAcuteBends(
      cleared,
      pinnedCoil,
      Math.max(100, minInteriorAngleDeg - 6),
      stiffness,
      solids,
      holes,
      allowedItemIds,
      10,
    );
    const reCleared = resolveSegmentClearance(
      cleared,
      radius,
      solids,
      holes,
      allowedItemIds,
    ).points;
    const cleaned = simplifyCollinearPoints(reCleared, hardRefs);
    if (minCableInteriorAngleDeg(cleaned) < 96) {
      const pinnedClean = cleaned.map((p, idx) => isPinnedRef(p, idx, cleaned.length));
      relaxNonAcuteBends(
        cleaned,
        pinnedClean,
        Math.max(100, minInteriorAngleDeg - 6),
        stiffness,
        solids,
        holes,
        allowedItemIds,
        16,
      );
    }
    return cleaned;
  };

  let activeTurns = turns;
  let rHi = Math.max(0.038, coilRadius);
  let bestCoil = buildCoil(rHi, activeTurns);
  while (polylineLength(bestCoil) < bodyM - 0.015 && activeTurns < maxTurnCap + 4) {
    activeTurns++;
    bestCoil = buildCoil(rHi, activeTurns);
  }
  let rLo = 0.022;
  for (let iter = 0; iter < 8; iter++) {
    const rMid = (rLo + rHi) * 0.5;
    const cand = buildCoil(rMid, activeTurns);
    if (polylineLength(cand) < bodyM) rLo = rMid;
    else {
      rHi = rMid;
      bestCoil = cand;
    }
  }
  return { points: bestCoil, adjusted: true };
}

function simplifyCollinearPoints(pts: readonly Vector3[], keepRefs: readonly Vector3[]): Vector3[] {
  if (pts.length <= 3) return pts.map((p) => p.clone());
  const isKeptPin = (p: Vector3) => keepRefs.some((k) => k.distanceToSquared(p) < 1e-8);
  const out: Vector3[] = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    if (isKeptPin(cur)) {
      out.push(cur.clone());
      continue;
    }
    const segLen = prev.distanceTo(next);
    if (segLen < 1e-5) continue;
    _delta.subVectors(next, prev).divideScalar(segLen);
    _a.subVectors(cur, prev);
    const proj = _a.dot(_delta);
    const perpSq = Math.max(0, _a.lengthSq() - proj * proj);
    if (proj >= 0 && proj <= segLen) {
      // Drop redundant collinear micro-samples (< 1.2 mm lateral deviation) so straight spans render clean
      if (perpSq < 0.0012 * 0.0012 && segLen < 0.18) {
        continue;
      }
    } else if (perpSq < 0.0015 * 0.0015 && (proj < 0 ? -proj : proj - segLen) < 0.045) {
      // Drop unpinned 0° collinear double-back spikes introduced by boundary snapping
      continue;
    }
    out.push(cur.clone());
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

function samplePolylineAtDistance(pts: readonly Vector3[], dist: number): Vector3 {
  if (pts.length === 0) return new Vector3();
  if (pts.length === 1 || dist <= 0) return pts[0].clone();
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const segLen = pts[i].distanceTo(pts[i - 1]);
    if (acc + segLen >= dist && segLen > 1e-6) {
      const t = (dist - acc) / segLen;
      return new Vector3().lerpVectors(pts[i - 1], pts[i], t);
    }
    acc += segLen;
  }
  return pts[pts.length - 1].clone();
}

/** Enforces `segLen <= maxSegLen` outward from `rootIdx` while preserving surface clearance. */
function clampInextensibleChain(
  nodes: Vector3[],
  rootIdx: number,
  maxSegLen: number,
  radius: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
): void {
  const n = nodes.length;
  if (n < 2) return;
  const projectStep = (cur: Vector3, next: Vector3) => {
    const diff = new Vector3().subVectors(next, cur);
    const len = diff.length();
    if (len > maxSegLen && len > 1e-6) {
      next.copy(cur).addScaledVector(diff, maxSegLen / len);
    }
    const clr = projectCablePointWithSupport(next, next.y, radius, solids, holes, allowedItemIds);
    next.copy(clr.point);
    const dAfter = next.distanceTo(cur);
    if (dAfter > maxSegLen && dAfter > 1e-6) {
      const dy = next.y - cur.y;
      if (Math.abs(dy) < maxSegLen) {
        const maxXz = Math.sqrt(Math.max(0, maxSegLen * maxSegLen - dy * dy));
        const dx = next.x - cur.x;
        const dz = next.z - cur.z;
        const xz = Math.hypot(dx, dz);
        if (xz > maxXz && xz > 1e-6) {
          next.x = cur.x + (dx / xz) * maxXz;
          next.z = cur.z + (dz / xz) * maxXz;
        }
      } else {
        _delta.subVectors(next, cur);
        next.copy(cur).addScaledVector(_delta, maxSegLen / dAfter);
      }
    }
  };

  for (let i = rootIdx; i < n - 1; i++) {
    projectStep(nodes[i], nodes[i + 1]);
  }
  for (let i = rootIdx; i > 0; i--) {
    projectStep(nodes[i], nodes[i - 1]);
  }
}

/**
 * Truncates or caps any subdivided polyline at `maxTotalLen` measured from `rootFromStart`
 * so rendered live wiring geometry can never stretch beyond fixed cable length.
 */
export function clampPolylineByTotalLength(
  points: Vector3[],
  rootFromStart: boolean,
  maxTotalLen: number,
): Vector3[] {
  if (points.length < 2 || maxTotalLen <= 0.02) return points;
  const ordered = rootFromStart ? points : [...points].reverse();
  const out: Vector3[] = [ordered[0].clone()];
  let acc = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = out[out.length - 1];
    const next = ordered[i];
    const segLen = prev.distanceTo(next);
    if (acc + segLen <= maxTotalLen + 1e-5) {
      out.push(next.clone());
      acc += segLen;
    } else {
      const remain = Math.max(0, maxTotalLen - acc);
      if (segLen > 1e-6 && remain > 1e-4) {
        const capped = new Vector3().lerpVectors(prev, next, remain / segLen);
        out.push(capped);
      }
      break;
    }
  }
  if (out.length < 2) {
    out.push(ordered[0].clone().add(new Vector3(0, -0.02, 0)));
  }
  return rootFromStart ? out : out.reverse();
}

/**
 * Clamps rendered live-wiring geometry to fixed length `maxTotalLen` and rounds any sharp
 * `90°` solid-clearance corners back above the cable's resilient bending threshold.
 */
export function finalizeLiveRenderPoints(
  sweptPoints: Vector3[],
  rootFromStart: boolean,
  maxTotalLen: number,
  minInteriorAngleDeg: number,
  stiffness: number,
  solids: SolidBox[],
  holes: CableHole[],
  allowedItemIds: Set<string>,
): Vector3[] {
  const capped = clampPolylineByTotalLength(sweptPoints, rootFromStart, maxTotalLen);
  if (
    capped.length >= 3 &&
    minCableInteriorAngleDeg(capped) < Math.max(94, minInteriorAngleDeg - 4)
  ) {
    const pinned = capped.map((_, idx) => idx === 0 || idx === capped.length - 1);
    relaxNonAcuteBends(
      capped,
      pinned,
      Math.max(96, minInteriorAngleDeg - 4),
      stiffness,
      solids,
      holes,
      allowedItemIds,
      10,
    );
    if (polylineLength(capped) > maxTotalLen + 0.015) {
      return clampPolylineByTotalLength(capped, rootFromStart, maxTotalLen);
    }
  }
  return capped;
}

/** Interactive real-time Verlet/XPBD cable state used during 3D cursor wiring. */
export type LiveCableState = {
  nodes: Vector3[];
  prevNodes: Vector3[];
  restSegLen: number;
  bodyM: number;
  radius: number;
  stiffness: number;
  minInteriorAngleDeg: number;
  activeEnd: 'from' | 'to';
};

export function createLiveCableState(opts: {
  cursorPos: Vector3;
  bodyM: number;
  radius: number;
  stiffness: number;
  minInteriorAngleDeg: number;
  activeEnd: 'from' | 'to';
  anchorPos?: Vector3;
}): LiveCableState {
  const safeBody = Math.max(0.25, opts.bodyM);
  const count = Math.max(16, Math.min(44, Math.round(safeBody / 0.042))) + 1;
  const restSegLen = safeBody / (count - 1);
  const nodes: Vector3[] = [];
  const prevNodes: Vector3[] = [];

  const effectiveCursor = opts.cursorPos.clone();
  if (opts.anchorPos) {
    const maxInitSpan = Math.max(0.05, safeBody - 0.008);
    const d = effectiveCursor.distanceTo(opts.anchorPos);
    if (d > maxInitSpan && d > 1e-6) {
      effectiveCursor
        .copy(opts.anchorPos)
        .addScaledVector(effectiveCursor.clone().sub(opts.anchorPos), maxInitSpan / d);
      effectiveCursor.y = Math.max(opts.radius + 0.004, effectiveCursor.y);
    }
  }

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    let p: Vector3;
    if (opts.anchorPos) {
      const p0 = opts.activeEnd === 'from' ? effectiveCursor : opts.anchorPos;
      const p1 = opts.activeEnd === 'from' ? opts.anchorPos : effectiveCursor;
      p = new Vector3().lerpVectors(p0, p1, t);
      const sag =
        Math.sin(t * Math.PI) * Math.min(0.16, Math.max(0, safeBody - p0.distanceTo(p1)) * 0.45);
      p.y = Math.max(opts.radius + 0.004, p.y - sag);
    } else {
      const u = opts.activeEnd === 'from' ? t : 1 - t;
      p = effectiveCursor.clone();
      p.y = Math.max(opts.radius + 0.004, p.y - u * Math.min(safeBody * 0.8, 0.55));
      p.z += u * 0.04;
    }
    nodes.push(p);
    prevNodes.push(p.clone());
  }

  return {
    nodes,
    prevNodes,
    restSegLen,
    bodyM: safeBody,
    radius: opts.radius,
    stiffness: opts.stiffness,
    minInteriorAngleDeg: opts.minInteriorAngleDeg,
    activeEnd: opts.activeEnd,
  };
}

export type StepLiveCableParams = {
  cursorPos: Vector3;
  cursorDir?: Vector3;
  activeEnd: 'from' | 'to';
  lockedFrom?: { position: Vector3; direction: Vector3 };
  lockedTo?: { position: Vector3; direction: Vector3 };
  solids: SolidBox[];
  holes: CableHole[];
  allowedItemIds: Set<string>;
};

export function stepLiveCablePhysics(
  state: LiveCableState,
  params: StepLiveCableParams,
  dtSec: number,
): { maxDisp: number; shortfallM: number } {
  const n = state.nodes.length;
  if (n < 3) return { maxDisp: 0, shortfallM: 0 };

  state.activeEnd = params.activeEnd;

  const dt = Math.max(0.004, Math.min(0.032, dtSec));
  const gravStep = 9.8 * dt * dt * 0.72;
  const minDist = state.radius + 0.002;

  const hasSingleAnchor = Boolean(params.lockedFrom) !== Boolean(params.lockedTo);
  const bothLocked = Boolean(params.lockedFrom && params.lockedTo);
  const anchorPos = params.lockedFrom?.position ?? params.lockedTo?.position ?? null;
  const maxCursorSpan = Math.max(0.05, state.bodyM - 0.006);
  const rawCursor = params.cursorPos;
  const effectiveCursor = rawCursor.clone();
  if (hasSingleAnchor && anchorPos) {
    const chord = effectiveCursor.distanceTo(anchorPos);
    if (chord > maxCursorSpan && chord > 1e-6) {
      effectiveCursor
        .copy(anchorPos)
        .addScaledVector(effectiveCursor.clone().sub(anchorPos), maxCursorSpan / chord);
      effectiveCursor.y = Math.max(minDist, effectiveCursor.y);
    }
  }

  const pinFrom = params.lockedFrom
    ? params.lockedFrom.position
    : params.activeEnd === 'from'
      ? effectiveCursor
      : null;
  const pinTo = params.lockedTo
    ? params.lockedTo.position
    : params.activeEnd === 'to'
      ? effectiveCursor
      : null;

  const pinned = new Array<boolean>(n).fill(false);
  if (pinFrom) pinned[0] = true;
  if (pinTo) pinned[n - 1] = true;
  const bootFrom = params.lockedFrom
    ? params.lockedFrom.direction
    : params.activeEnd === 'from'
      ? params.cursorDir
      : undefined;
  const bootTo = params.lockedTo
    ? params.lockedTo.direction
    : params.activeEnd === 'to'
      ? params.cursorDir
      : undefined;

  if (bootFrom && n > 3) pinned[1] = true;
  if (bootTo && n > 3) pinned[n - 2] = true;

  // Snapshot before step for convergence/rest metric
  let maxDisp = 0;

  // 1) Verlet integration + gravity
  for (let i = 0; i < n; i++) {
    if (pinned[i]) {
      state.prevNodes[i].copy(state.nodes[i]);
      continue;
    }
    const cur = state.nodes[i];
    const prev = state.prevNodes[i];
    const vx = (cur.x - prev.x) * 0.84;
    const vy = (cur.y - prev.y) * 0.84;
    const vz = (cur.z - prev.z) * 0.84;
    prev.copy(cur);
    cur.x += vx;
    cur.y += vy - gravStep;
    cur.z += vz;
  }

  const rootIdx = params.lockedFrom
    ? 0
    : params.lockedTo
      ? n - 1
      : params.activeEnd === 'from'
        ? 0
        : n - 1;

  // 2) Constraint sub-iterations (pinning, distance, bending resilience, solid contact)
  for (let iter = 0; iter < 14; iter++) {
    if (pinFrom) {
      state.nodes[0].copy(pinFrom);
      if (bootFrom && n > 3) {
        state.nodes[1].copy(pinFrom).addScaledVector(bootFrom, state.restSegLen);
      }
    }
    if (pinTo) {
      state.nodes[n - 1].copy(pinTo);
      if (bootTo && n > 3) {
        state.nodes[n - 2].copy(pinTo).addScaledVector(bootTo, state.restSegLen);
      }
    }

    const forward = iter % 2 === 0;
    const s = forward ? 0 : n - 2;
    const e = forward ? n - 1 : -1;
    const step = forward ? 1 : -1;
    for (let i = s; i !== e; i += step) {
      const p0 = state.nodes[i];
      const p1 = state.nodes[i + 1];
      const f0 = pinned[i];
      const f1 = pinned[i + 1];
      if (f0 && f1) continue;
      _delta.subVectors(p1, p0);
      const len = _delta.length();
      if (len < 1e-6) continue;
      const err = (len - state.restSegLen) / len;
      const stiffnessScale = err > 0 ? 0.92 : 0.08;
      const corr = err * stiffnessScale;
      if (!f0 && !f1) {
        p0.addScaledVector(_delta, corr * 0.5);
        p1.addScaledVector(_delta, -corr * 0.5);
      } else if (!f0) {
        p0.addScaledVector(_delta, corr);
      } else {
        p1.addScaledVector(_delta, -corr);
      }
    }

    if (iter % 3 === 0) {
      relaxNonAcuteBends(
        state.nodes,
        pinned,
        state.minInteriorAngleDeg,
        state.stiffness,
        params.solids,
        params.holes,
        params.allowedItemIds,
        2,
      );
    }

    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue;
      if (state.nodes[i].y < minDist) state.nodes[i].y = minDist;
      const clr = projectCablePointWithSupport(
        state.nodes[i],
        state.prevNodes[i].y,
        state.radius,
        params.solids,
        params.holes,
        params.allowedItemIds,
      );
      if (clr.adjusted) {
        // Apply tangential surface friction against jitter when sliding/resting on solids
        state.prevNodes[i].lerp(clr.point, 0.35);
      }
      state.nodes[i].copy(clr.point);
    }

    if (!bothLocked && iter % 3 === 2 && polylineLength(state.nodes) > state.bodyM + 0.015) {
      clampInextensibleChain(
        state.nodes,
        rootIdx,
        state.restSegLen,
        state.radius,
        params.solids,
        params.holes,
        params.allowedItemIds,
      );
    }
  }

  // Final non-acute resilience guarantee
  relaxNonAcuteBends(
    state.nodes,
    pinned,
    Math.max(96, state.minInteriorAngleDeg - 6),
    state.stiffness,
    params.solids,
    params.holes,
    params.allowedItemIds,
    24,
  );

  // Enforce exact inextensible fixed-length constraint only if total span exceeds bodyM + 1.5cm
  if (!bothLocked && polylineLength(state.nodes) > state.bodyM + 0.015) {
    clampInextensibleChain(
      state.nodes,
      rootIdx,
      state.restSegLen,
      state.radius,
      params.solids,
      params.holes,
      params.allowedItemIds,
    );
    if (minCableInteriorAngleDeg(state.nodes) < 94) {
      relaxNonAcuteBends(
        state.nodes,
        pinned,
        Math.max(96, state.minInteriorAngleDeg - 6),
        state.stiffness * 0.7,
        params.solids,
        params.holes,
        params.allowedItemIds,
        8,
      );
    }
  } else if (bothLocked && pinFrom && pinTo && pinFrom.distanceTo(pinTo) <= state.bodyM) {
    if (polylineLength(state.nodes) > state.bodyM + 0.015) {
      clampInextensibleChain(
        state.nodes,
        0,
        state.restSegLen,
        state.radius,
        params.solids,
        params.holes,
        params.allowedItemIds,
      );
      state.nodes[n - 1].copy(pinTo);
    }
  }

  for (let i = 0; i < n; i++) {
    if (!pinned[i]) {
      const clr = projectCablePointWithSupport(
        state.nodes[i],
        state.prevNodes[i].y,
        state.radius,
        params.solids,
        params.holes,
        params.allowedItemIds,
      );
      state.nodes[i].copy(clr.point);
    }
    const d = state.nodes[i].distanceTo(state.prevNodes[i]);
    if (d > maxDisp) maxDisp = d;
  }

  // Re-apply inextensible bound only if surface projection elongated total length past bodyM + 1.5cm
  if (!bothLocked && polylineLength(state.nodes) > state.bodyM + 0.015) {
    clampInextensibleChain(
      state.nodes,
      rootIdx,
      state.restSegLen,
      state.radius,
      params.solids,
      params.holes,
      params.allowedItemIds,
    );
    if (minCableInteriorAngleDeg(state.nodes) < 94) {
      relaxNonAcuteBends(
        state.nodes,
        pinned,
        Math.max(96, state.minInteriorAngleDeg - 6),
        state.stiffness * 0.7,
        params.solids,
        params.holes,
        params.allowedItemIds,
        6,
      );
    }
  }

  // Anti-tunneling segment check for live dangling desk edges
  for (let i = 1; i < n - 1; i++) {
    if (pinned[i]) continue;
    const a = state.nodes[i - 1];
    const b = state.nodes[i];
    const mid = new Vector3().lerpVectors(a, b, 0.5);
    const clr = projectCablePointWithSupport(
      mid,
      Math.max(a.y, b.y),
      state.radius + 0.002,
      params.solids,
      params.holes,
      params.allowedItemIds,
    );
    if (clr.adjusted && clr.point.y > b.y) {
      b.y = clr.point.y;
    }
  }

  let shortfallM = 0;
  if (bothLocked && pinFrom && pinTo) {
    const straight = pinFrom.distanceTo(pinTo);
    shortfallM = Math.max(0, Math.round((straight - state.bodyM) * 1000) / 1000);
  } else if (hasSingleAnchor && anchorPos) {
    const tipIdx = params.lockedFrom ? n - 1 : 0;
    const tipGap = state.nodes[tipIdx].distanceTo(rawCursor);
    const straight = anchorPos.distanceTo(rawCursor);
    if (straight > state.bodyM + 0.005 || tipGap > 0.03) {
      shortfallM = Math.max(
        Math.max(0, Math.round((straight - state.bodyM) * 1000) / 1000),
        tipGap > 0.03 ? Math.round(tipGap * 1000) / 1000 : 0,
      );
    }
  }

  return { maxDisp, shortfallM };
}

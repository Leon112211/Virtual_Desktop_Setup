import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  CanvasTexture,
  DoubleSide,
  Euler,
  Plane,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { DEFAULT_LID_ANGLE, MAX_LID_ANGLE } from '../domain/laptop';
import { constrainMonitorPose } from '../domain/collision';
import { MAX_PITCH, MAX_ROLL, monitorParts, monitorPose } from '../domain/monitor';
import { normalizeRotationDeg } from '../domain/monitorArm';
import type { SceneItem } from '../domain/project';
import { useEditor } from '../store/editorStore';

type AxisKind = 'yaw' | 'pitch' | 'roll' | 'lid';

const Y_AXIS = new Vector3(0, 1, 0);
const TICK_ANGLES = [0, 45, 90, 135, 180, -135, -90, -45];
const AXIS_COLORS: Record<AxisKind, { idle: string; light: string; dark: string }> = {
  yaw: { idle: '#2563eb', light: '#3b82f6', dark: '#1d4ed8' },
  pitch: { idle: '#059669', light: '#10b981', dark: '#047857' },
  roll: { idle: '#d97706', light: '#f59e0b', dark: '#b45309' },
  lid: { idle: '#0891b2', light: '#06b6d4', dark: '#0e7490' },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundTenth(n: number): number {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function wrapDeltaRad(rad: number): number {
  let d = rad;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function drawRotationArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  counterclockwise = false,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle, counterclockwise);
  ctx.stroke();

  const tipAngle = endAngle;
  const tipX = cx + Math.cos(tipAngle) * r;
  const tipY = cy + Math.sin(tipAngle) * r;
  const tangent = tipAngle + (counterclockwise ? -Math.PI / 2 : Math.PI / 2);
  const headLen = 19;
  const spread = 0.56;

  ctx.beginPath();
  ctx.moveTo(tipX + Math.cos(tangent) * 5, tipY + Math.sin(tangent) * 5);
  ctx.lineTo(
    tipX - Math.cos(tangent - spread) * headLen,
    tipY - Math.sin(tangent - spread) * headLen,
  );
  ctx.lineTo(
    tipX - Math.cos(tangent + spread) * headLen,
    tipY - Math.sin(tangent + spread) * headLen,
  );
  ctx.closePath();
  ctx.fill();
}

function makeAxisHandleTexture(kind: AxisKind, active: boolean): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 94;
  const palette = AXIS_COLORS[kind];

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.shadowColor = active ? 'rgba(15, 23, 42, 0.36)' : 'rgba(15, 23, 42, 0.24)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;

  const bgGrad = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
  if (active) {
    bgGrad.addColorStop(0, palette.light);
    bgGrad.addColorStop(1, palette.dark);
  } else {
    bgGrad.addColorStop(0, '#ffffff');
    bgGrad.addColorStop(1, '#eef2f7');
  }
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = active ? 'rgba(255, 255, 255, 0.92)' : `${palette.idle}55`;
  ctx.lineWidth = active ? 5 : 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = active ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
  ctx.stroke();

  const iconColor = active ? '#ffffff' : palette.idle;
  ctx.save();
  ctx.strokeStyle = iconColor;
  ctx.fillStyle = iconColor;
  ctx.lineWidth = 10.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'yaw') {
    drawRotationArc(ctx, cx, cy, 44, -Math.PI * 0.78, -Math.PI * 0.14);
    drawRotationArc(ctx, cx, cy, 44, Math.PI * 0.22, Math.PI * 0.86);
    ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.82)' : `${palette.idle}66`;
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'pitch') {
    // Vertical tilt arc + pivot dot representing forward/backward screen pitch
    drawRotationArc(ctx, cx - 10, cy, 46, -Math.PI * 0.38, Math.PI * 0.38, false);
    drawRotationArc(ctx, cx - 10, cy, 46, Math.PI * 0.38, -Math.PI * 0.38, true);
    ctx.beginPath();
    ctx.arc(cx - 28, cy, 9, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'roll') {
    // Portrait / landscape screen pivot frame + quarter-turn sweep arc
    ctx.beginPath();
    ctx.roundRect(cx - 34, cy - 22, 42, 44, 6);
    ctx.stroke();
    drawRotationArc(ctx, cx + 4, cy + 4, 42, -Math.PI * 0.45, Math.PI * 0.18, false);
  } else {
    // Laptop L-hinge silhouette with curved open/close arc
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy + 28);
    ctx.lineTo(cx + 30, cy + 28);
    ctx.moveTo(cx - 34, cy + 28);
    ctx.lineTo(cx - 12, cy - 28);
    ctx.stroke();
    drawRotationArc(ctx, cx - 34, cy + 28, 48, -Math.PI * 0.1, -Math.PI * 0.42, true);
  }
  ctx.restore();

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

type DragSessionConfig = {
  plane: Plane;
  startValue: number;
  getAngleFromHit: (hit: Vector3) => number;
  resolveValue: (rawDeltaDeg: number, ev: PointerEvent) => number;
  screenFallbackDegPerPx?: number;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onClick?: (shiftKey: boolean) => void;
};

/**
 * Built-in on-item 3D interactive rotation & articulation gizmo.
 * Fuses yaw (all freestanding items), pitch & roll (monitors), and lid open/close angle
 * (laptops) directly onto the selected 3D model while preserving parameterized Inspector edits.
 */
export function ItemRotateGizmo({
  item,
  centerX,
  centerZ,
  planeY,
  worldPosition,
  worldQuaternion,
  hasMonitorArm = false,
  hideYaw = false,
  lidAngle = DEFAULT_LID_ANGLE,
  controls,
  onError,
}: {
  item: SceneItem;
  centerX: number;
  centerZ: number;
  planeY: number;
  worldPosition: [number, number, number];
  worldQuaternion: Quaternion;
  hasMonitorArm?: boolean;
  hideYaw?: boolean;
  lidAngle?: number;
  controls: RefObject<OrbitControlsImpl | null>;
  onError: (msg: string) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const [hoveredPart, setHoveredPart] = useState<'ring' | AxisKind | null>(null);
  const [draggingAxis, setDraggingAxis] = useState<AxisKind | null>(null);
  const cleanupDrag = useRef<(() => void) | null>(null);

  const yawTex = useMemo(
    () => makeAxisHandleTexture('yaw', hoveredPart === 'yaw' || draggingAxis === 'yaw'),
    [hoveredPart, draggingAxis],
  );
  const pitchTex = useMemo(
    () => makeAxisHandleTexture('pitch', hoveredPart === 'pitch' || draggingAxis === 'pitch'),
    [hoveredPart, draggingAxis],
  );
  const rollTex = useMemo(
    () => makeAxisHandleTexture('roll', hoveredPart === 'roll' || draggingAxis === 'roll'),
    [hoveredPart, draggingAxis],
  );
  const lidTex = useMemo(
    () => makeAxisHandleTexture('lid', hoveredPart === 'lid' || draggingAxis === 'lid'),
    [hoveredPart, draggingAxis],
  );

  useEffect(() => {
    return () => {
      yawTex.dispose();
      pitchTex.dispose();
      rollTex.dispose();
      lidTex.dispose();
    };
  }, [yawTex, pitchTex, rollTex, lidTex]);

  useEffect(() => {
    return () => {
      cleanupDrag.current?.();
      if (gl.domElement.style.cursor === 'grab' || gl.domElement.style.cursor === 'grabbing') {
        gl.domElement.style.cursor = 'auto';
      }
    };
  }, [gl.domElement]);

  function commitPatch(patch: Partial<SceneItem>, errMsg: string) {
    try {
      useEditor.getState().updateItem(item.id, patch);
      if (useEditor.getState().dragPreview) useEditor.getState().setDragPreview(null);
    } catch (err) {
      useEditor.getState().setDragPreview(null);
      onError(err instanceof Error ? err.message : errMsg);
    }
  }

  function startAxisDrag(e: ThreeEvent<PointerEvent>, axis: AxisKind, cfg: DragSessionConfig) {
    if (e.button !== 0) return;
    e.stopPropagation();

    const canvas = gl.domElement;
    const pointer = e.pointerId;
    const sx = e.nativeEvent.clientX;
    const sy = e.nativeEvent.clientY;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();

    const viewPerpDot = Math.abs(e.ray.direction.dot(cfg.plane.normal));
    const usePlane = viewPerpDot >= 0.18 && e.ray.intersectPlane(cfg.plane, hit);
    const startAngleRad = usePlane ? cfg.getAngleFromHit(hit) : 0;

    let latestValue = cfg.startValue;
    let moved = false;
    let done = false;

    if (controls.current) controls.current.enabled = false;
    setDraggingAxis(axis);
    canvas.style.cursor = 'grabbing';
    try {
      canvas.setPointerCapture(pointer);
    } catch {
      /* capture may be unavailable on interrupted pointers */
    }

    function move(ev: PointerEvent) {
      if (ev.pointerId !== pointer) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4 && !moved) return;
      moved = true;

      let deltaDeg: number;
      if (usePlane) {
        const r = canvas.getBoundingClientRect();
        ndc.set(
          ((ev.clientX - r.left) / r.width) * 2 - 1,
          (-(ev.clientY - r.top) / r.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        if (!raycaster.ray.intersectPlane(cfg.plane, hit)) return;
        const deltaRad = wrapDeltaRad(cfg.getAngleFromHit(hit) - startAngleRad);
        deltaDeg = (deltaRad * 180) / Math.PI;
      } else {
        deltaDeg = (sy - ev.clientY) * (cfg.screenFallbackDegPerPx ?? 0.45);
      }

      latestValue = cfg.resolveValue(deltaDeg, ev);
      cfg.onPreview(latestValue);
      invalidate();
    }

    function finish(cancel: boolean, shiftAtUp = false) {
      if (done) return;
      done = true;
      setDraggingAxis(null);
      if (cancel) {
        useEditor.getState().setDragPreview(null);
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('blur', cancelDrag);
      window.removeEventListener('keydown', key);
      canvas.removeEventListener('lostpointercapture', cancelDrag);
      try {
        if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
      } catch {
        /* released by browser */
      }
      if (controls.current) controls.current.enabled = true;
      canvas.style.cursor = 'auto';
      cleanupDrag.current = null;
      invalidate();

      if (cancel) return;
      if (!moved && cfg.onClick) {
        cfg.onClick(shiftAtUp);
      } else if (moved) {
        cfg.onCommit(latestValue);
      } else {
        useEditor.getState().setDragPreview(null);
      }
    }

    function up(ev: PointerEvent) {
      if (ev.pointerId === pointer) finish(false, ev.shiftKey);
    }
    function cancelDrag() {
      finish(true);
    }
    function key(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(true);
      }
    }

    cleanupDrag.current = cancelDrag;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('keydown', key);
    canvas.addEventListener('lostpointercapture', cancelDrag);
  }

  function startYawRotate(e: ThreeEvent<PointerEvent>, clickStepDeg: number | null) {
    const startRot = item.rotation;
    let currentRot = startRot;
    let lastHitObstacle: string | undefined;
    startAxisDrag(e, 'yaw', {
      plane: new Plane(Y_AXIS, -planeY),
      startValue: startRot,
      getAngleFromHit: (hit) => Math.atan2(hit.x - centerX, hit.z - centerZ),
      resolveValue: (deltaDeg, ev) => {
        let candidate = startRot + deltaDeg;
        if (ev.shiftKey) candidate = Math.round(candidate / 15) * 15;
        const normalized = normalizeRotationDeg(candidate);
        if (item.kind === 'monitor' && useEditor.getState().collisionEnabled) {
          const { project } = useEditor.getState();
          const res = constrainMonitorPose(
            { ...item, rotation: currentRot },
            { rotation: normalized },
            project.desk,
            project.items,
          );
          currentRot = normalizeRotationDeg(res.item.rotation);
          lastHitObstacle = res.hitObstacle;
          return currentRot;
        }
        lastHitObstacle = undefined;
        return normalized;
      },
      onPreview: (rotation) =>
        useEditor.getState().setDragPreview({
          kind: 'rotation',
          id: item.id,
          rotation,
          hitObstacle: lastHitObstacle,
        }),
      onCommit: (rotation) => commitPatch({ rotation }, '无法旋转物品'),
      onClick:
        clickStepDeg === null
          ? undefined
          : (shift) => {
              const mult = shift ? 2 : 1;
              commitPatch(
                { rotation: normalizeRotationDeg(startRot + clickStepDeg * mult) },
                '无法旋转物品',
              );
            },
    });
  }

  // Yaw parameters
  const baseY = item.kind === 'mousepad' ? item.size.height + 0.004 : 0.005;
  const ringRadius = Math.max(0.08, Math.hypot(item.size.width / 2, item.size.depth / 2) + 0.016);
  const frontZ = item.size.depth / 2 + 0.028;

  // Monitor pitch & roll articulation parameters
  const isMonitor = item.kind === 'monitor';
  const isStudioDisplay = isMonitor && item.monitor?.model === 'studioDisplay';
  const monitorGeo = isMonitor ? monitorParts(item.size, item.monitor?.model) : null;
  const mPose = isMonitor ? monitorPose(item.size, { ...item, hasMonitorArm }) : null;
  const minPitch = isStudioDisplay ? -5 : -MAX_PITCH;
  const maxPitch = isStudioDisplay ? 25 : MAX_PITCH;
  const panelY = mPose && monitorGeo ? mPose.pivotY + monitorGeo.panelHeight / 2 : 0;
  const panelZ = -0.02 + (mPose?.pivotZOffset ?? 0);
  const pitchRad = mPose ? (mPose.pitchDeg * Math.PI) / 180 : 0;
  const rollRad = mPose ? (mPose.rollDeg * Math.PI) / 180 : 0;
  const pitchArcR = monitorGeo ? Math.min(0.115, monitorGeo.panelHeight * 0.3) : 0.1;
  const pitchFlankX = item.size.width / 2 + 0.026;
  const rollArcR = monitorGeo ? monitorGeo.panelHeight / 2 + 0.024 : 0.18;

  function startMonitorPitch(e: ThreeEvent<PointerEvent>) {
    if (!mPose || !monitorGeo) return;
    const itemPos = new Vector3(...worldPosition);
    const invQuat = worldQuaternion.clone().invert();
    const axisX = new Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();
    const pivotWorld = new Vector3(pitchFlankX, panelY, panelZ)
      .applyQuaternion(worldQuaternion)
      .add(itemPos);
    const startPitch = mPose.pitchDeg;
    let currentPitch = startPitch;
    let lastHitObstacle: string | undefined;

    startAxisDrag(e, 'pitch', {
      plane: new Plane().setFromNormalAndCoplanarPoint(axisX, pivotWorld),
      startValue: startPitch,
      getAngleFromHit: (hit) => {
        const local = hit.clone().sub(pivotWorld).applyQuaternion(invQuat);
        return Math.atan2(-local.y, local.z);
      },
      resolveValue: (deltaDeg, ev) => {
        let candidate = startPitch + deltaDeg;
        if (ev.shiftKey) candidate = Math.round(candidate / 5) * 5;
        const clamped = roundTenth(clamp(candidate, minPitch, maxPitch));
        if (useEditor.getState().collisionEnabled) {
          const { project } = useEditor.getState();
          const res = constrainMonitorPose(
            { ...item, pitch: currentPitch },
            { pitch: clamped },
            project.desk,
            project.items,
          );
          currentPitch = roundTenth(res.item.pitch ?? clamped);
          lastHitObstacle = res.hitObstacle;
          return currentPitch;
        }
        lastHitObstacle = undefined;
        return clamped;
      },
      screenFallbackDegPerPx: -0.4,
      onPreview: (value) =>
        useEditor.getState().setDragPreview({
          kind: 'pose',
          id: item.id,
          axis: 'pitch',
          value,
          hitObstacle: lastHitObstacle,
        }),
      onCommit: (pitch) => commitPatch({ pitch }, '无法调节俯仰角度'),
      onClick: () => {
        const stepped = startPitch + 5 > maxPitch ? minPitch : roundTenth(startPitch + 5);
        commitPatch({ pitch: stepped }, '无法调节俯仰角度');
      },
    });
  }

  function startMonitorRoll(e: ThreeEvent<PointerEvent>) {
    if (!mPose || !monitorGeo) return;
    const itemPos = new Vector3(...worldPosition);
    const pitchQuat = new Quaternion().setFromEuler(new Euler(pitchRad, 0, 0, 'XYZ'));
    const screenWorldQuat = worldQuaternion.clone().multiply(pitchQuat);
    const invScreenQuat = screenWorldQuat.clone().invert();
    const screenNormal = new Vector3(0, 0, 1).applyQuaternion(screenWorldQuat).normalize();
    const pivotWorld = new Vector3(0, panelY, panelZ).applyQuaternion(worldQuaternion).add(itemPos);
    const startRoll = mPose.rollDeg;
    let currentRoll = startRoll;
    let lastHitObstacle: string | undefined;

    startAxisDrag(e, 'roll', {
      plane: new Plane().setFromNormalAndCoplanarPoint(screenNormal, pivotWorld),
      startValue: startRoll,
      getAngleFromHit: (hit) => {
        const local = hit.clone().sub(pivotWorld).applyQuaternion(invScreenQuat);
        return Math.atan2(-local.x, local.y);
      },
      resolveValue: (deltaDeg, ev) => {
        let candidate = startRoll + deltaDeg;
        if (ev.shiftKey) candidate = Math.round(candidate / 15) * 15;
        const clamped = roundTenth(clamp(candidate, -MAX_ROLL, MAX_ROLL));
        if (useEditor.getState().collisionEnabled) {
          const { project } = useEditor.getState();
          const res = constrainMonitorPose(
            { ...item, roll: currentRoll },
            { roll: clamped },
            project.desk,
            project.items,
          );
          currentRoll = roundTenth(res.item.roll ?? clamped);
          lastHitObstacle = res.hitObstacle;
          return currentRoll;
        }
        lastHitObstacle = undefined;
        return clamped;
      },
      onPreview: (value) =>
        useEditor.getState().setDragPreview({
          kind: 'pose',
          id: item.id,
          axis: 'roll',
          value,
          hitObstacle: lastHitObstacle,
        }),
      onCommit: (roll) => commitPatch({ roll }, '无法翻转屏幕'),
      onClick: (shift) => {
        const step = shift ? 90 : 45;
        const next = startRoll + step > MAX_ROLL ? -MAX_ROLL : roundTenth(startRoll + step);
        commitPatch({ roll: next }, '无法翻转屏幕');
      },
    });
  }

  // Laptop lid open/close articulation parameters (matching MacBookModel & GamingLaptopModel)
  const isLaptop = item.kind === 'gamingLaptop' || item.kind === 'macbook';
  const isMacbook = item.kind === 'macbook';
  const laptopHingeY = isMacbook
    ? 0.0012 + Math.max(0.006, item.size.height * 0.72 - 0.0012)
    : Math.max(0.006, item.size.height * 0.72);
  const laptopHingeZ = -item.size.depth / 2 + (isMacbook ? 0.005 : 0.008);
  const laptopLidLen = isMacbook ? item.size.depth - 0.005 : item.size.depth;
  const lidArcR = Math.min(0.14, item.size.depth * 0.65);

  function startLaptopLid(e: ThreeEvent<PointerEvent>) {
    const itemPos = new Vector3(...worldPosition);
    const invQuat = worldQuaternion.clone().invert();
    const hingeAxisX = new Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();
    const hingeWorld = new Vector3(0, laptopHingeY, laptopHingeZ)
      .applyQuaternion(worldQuaternion)
      .add(itemPos);
    const startLid = clamp(lidAngle, 0, MAX_LID_ANGLE);

    startAxisDrag(e, 'lid', {
      plane: new Plane().setFromNormalAndCoplanarPoint(hingeAxisX, hingeWorld),
      startValue: startLid,
      getAngleFromHit: (hit) => {
        const local = hit.clone().sub(hingeWorld).applyQuaternion(invQuat);
        return Math.atan2(local.y, local.z);
      },
      resolveValue: (deltaDeg, ev) => {
        let candidate = startLid + deltaDeg;
        if (ev.shiftKey) candidate = Math.round(candidate / 5) * 5;
        return roundTenth(clamp(candidate, 0, MAX_LID_ANGLE));
      },
      screenFallbackDegPerPx: 0.45,
      onPreview: (value) =>
        useEditor.getState().setDragPreview({ kind: 'pose', id: item.id, axis: 'lidAngle', value }),
      onCommit: (nextLid) => commitPatch({ lidAngle: nextLid }, '无法调节屏幕开合角'),
      onClick: () => {
        const next = startLid < 20 ? 110 : startLid < 130 ? MAX_LID_ANGLE : 0;
        commitPatch({ lidAngle: next }, '无法调节屏幕开合角');
      },
    });
  }

  return (
    <group>
      {/* 1. Yaw (horizontal 360° base ring & front drag/step handle) */}
      {!hideYaw && (
        <group>
          <mesh
            name="item-rotate-ring"
            position={[0, baseY, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredPart('ring');
              if (!draggingAxis) gl.domElement.style.cursor = 'grab';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredPart(null);
              if (!draggingAxis) gl.domElement.style.cursor = 'auto';
            }}
            onPointerDown={(e) => startYawRotate(e, null)}
          >
            <ringGeometry args={[Math.max(0.02, ringRadius - 0.004), ringRadius + 0.004, 96]} />
            <meshBasicMaterial
              color={hoveredPart === 'ring' || draggingAxis === 'yaw' ? '#2563eb' : '#315ce7'}
              transparent
              opacity={hoveredPart === 'ring' || draggingAxis === 'yaw' ? 0.56 : 0.24}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>

          {TICK_ANGLES.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <mesh
                key={deg}
                position={[Math.sin(rad) * ringRadius, baseY + 0.0006, Math.cos(rad) * ringRadius]}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={() => null}
              >
                <circleGeometry args={[deg === 0 ? 0.0034 : 0.0022, 16]} />
                <meshBasicMaterial color="#315ce7" transparent opacity={0.55} depthWrite={false} />
              </mesh>
            );
          })}

          <group position={[0, baseY + 0.0035, frontZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh
              name="item-rotate-handle"
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredPart('yaw');
                if (!draggingAxis) gl.domElement.style.cursor = 'grab';
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredPart(null);
                if (!draggingAxis) gl.domElement.style.cursor = 'auto';
              }}
              onPointerDown={(e) => startYawRotate(e, 45)}
            >
              <planeGeometry args={[0.04, 0.04]} />
              <meshBasicMaterial map={yawTex} transparent depthWrite={false} side={DoubleSide} />
            </mesh>
          </group>
        </group>
      )}

      {/* 2. Monitor Pitch & Roll articulated handles attached directly onto the display */}
      {isMonitor && monitorGeo && mPose && (
        <group>
          {/* Side Pitch arc & handle in YZ hinge plane */}
          <mesh
            name="item-pitch-arc"
            position={[pitchFlankX, panelY, panelZ]}
            rotation={[0, Math.PI / 2, 0]}
            raycast={() => null}
          >
            <ringGeometry
              args={[
                pitchArcR - 0.0025,
                pitchArcR + 0.0025,
                40,
                1,
                Math.PI + (minPitch * Math.PI) / 180,
                ((maxPitch - minPitch) * Math.PI) / 180,
              ]}
            />
            <meshBasicMaterial
              color="#10b981"
              transparent
              opacity={hoveredPart === 'pitch' || draggingAxis === 'pitch' ? 0.72 : 0.34}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <group position={[pitchFlankX, panelY, panelZ]} rotation={[pitchRad, 0, 0]}>
            <sprite
              name="item-pitch-handle"
              position={[0, 0, pitchArcR]}
              scale={[0.036, 0.036, 1]}
              renderOrder={10}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredPart('pitch');
                if (!draggingAxis) gl.domElement.style.cursor = 'grab';
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredPart(null);
                if (!draggingAxis) gl.domElement.style.cursor = 'auto';
              }}
              onPointerDown={startMonitorPitch}
            >
              <spriteMaterial map={pitchTex} transparent depthTest={false} />
            </sprite>
          </group>

          {/* Upper-right Roll arc & handle orbiting inside the screen's tilted plane */}
          <group position={[0, panelY, panelZ]} rotation={[pitchRad, 0, 0]}>
            <mesh name="item-roll-arc" position={[0, 0, 0.012]} raycast={() => null}>
              <ringGeometry
                args={[
                  rollArcR - 0.0025,
                  rollArcR + 0.0025,
                  48,
                  1,
                  Math.PI / 2 - (55 * Math.PI) / 180,
                  (110 * Math.PI) / 180,
                ]}
              />
              <meshBasicMaterial
                color="#f59e0b"
                transparent
                opacity={hoveredPart === 'roll' || draggingAxis === 'roll' ? 0.72 : 0.34}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
            <group rotation={[0, 0, rollRad]}>
              <sprite
                name="item-roll-handle"
                position={[Math.sin(0.32) * rollArcR, Math.cos(0.32) * rollArcR, 0.014]}
                scale={[0.036, 0.036, 1]}
                renderOrder={10}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredPart('roll');
                  if (!draggingAxis) gl.domElement.style.cursor = 'grab';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  setHoveredPart(null);
                  if (!draggingAxis) gl.domElement.style.cursor = 'auto';
                }}
                onPointerDown={startMonitorRoll}
              >
                <spriteMaterial map={rollTex} transparent depthTest={false} />
              </sprite>
            </group>
          </group>
        </group>
      )}

      {/* 3. Laptop screen lid open/close arc & top-rim handle */}
      {isLaptop && (
        <group position={[0, laptopHingeY, laptopHingeZ]}>
          <mesh
            name="item-lid-arc"
            position={[item.size.width / 2 + 0.016, 0, 0]}
            rotation={[0, Math.PI / 2, 0]}
            raycast={() => null}
          >
            <ringGeometry
              args={[
                lidArcR - 0.0022,
                lidArcR + 0.0022,
                40,
                1,
                Math.PI - (MAX_LID_ANGLE * Math.PI) / 180,
                (MAX_LID_ANGLE * Math.PI) / 180,
              ]}
            />
            <meshBasicMaterial
              color="#06b6d4"
              transparent
              opacity={hoveredPart === 'lid' || draggingAxis === 'lid' ? 0.72 : 0.34}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <group rotation={[((90 - lidAngle) * Math.PI) / 180, 0, 0]}>
            <sprite
              name="item-lid-handle"
              position={[0, laptopLidLen + 0.018, 0]}
              scale={[0.036, 0.036, 1]}
              renderOrder={10}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredPart('lid');
                if (!draggingAxis) gl.domElement.style.cursor = 'grab';
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredPart(null);
                if (!draggingAxis) gl.domElement.style.cursor = 'auto';
              }}
              onPointerDown={startLaptopLid}
            >
              <spriteMaterial map={lidTex} transparent depthTest={false} />
            </sprite>
          </group>
        </group>
      )}
    </group>
  );
}

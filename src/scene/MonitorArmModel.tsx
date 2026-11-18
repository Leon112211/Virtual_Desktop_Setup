import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Matrix4, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import {
  ARM_DUAL_SOCKET_OFFSET,
  ARM_LOWER_LENGTH,
  ARM_UPPER_LENGTH,
  ARM_UPPER_PITCH_MAX_DEG,
  ARM_UPPER_PITCH_MIN_DEG,
  applyArmBaseSolutionToProject,
  applyArmSolutionToProject,
  armLimitMessage,
  computeArmSegmentFrame,
  computeMonitorArmSystem,
  lowerPitchRange,
  type ArmBranchKinematics,
  type ArmLimitReason,
  type DragPreviewState,
} from '../domain/monitorArm';
import {
  solveArmBaseMoveWithCollision,
  solveArmElbowSwivelWithCollision,
  solveArmLowerPitchWithCollision,
  solveArmUpperPitchWithCollision,
} from '../domain/collision';
import type { Desk, SceneItem } from '../domain/project';
import { useEditor } from '../store/editorStore';
import { LaptopTrayModel } from './LaptopTrayModel';
import { pauseOrbitUntilPointerUp } from './orbitPause';

const Z_AXIS = new Vector3(0, 0, 1);
const Y_AXIS = new Vector3(0, 1, 0);

function CastArmWithCableChannel({
  from,
  to,
  width,
  height,
  color,
  channelEnabled,
  isUpper = false,
}: {
  from: Vector3;
  to: Vector3;
  width: number;
  height: number;
  color: string;
  channelEnabled: boolean;
  isUpper?: boolean;
}) {
  const frame = useMemo(
    () => computeArmSegmentFrame(from, to),
    [from.x, from.y, from.z, to.x, to.y, to.z],
  );

  // Build exact quaternion using Matrix4 so local X=side, Y=up, Z=dir along the arm.
  const quat = useMemo(() => {
    const m = new Matrix4().makeBasis(frame.side, frame.up, frame.dir);
    return new Quaternion().setFromRotationMatrix(m);
  }, [frame]);

  const bodyLen = Math.max(0.04, frame.length - 0.02);
  const channelLen = Math.max(0.03, frame.length * 0.74);
  const channelWidth = width * 0.84;
  const channelHeight = isUpper ? 0.022 : 0.014;
  const wallT = 0.0026;

  return (
    <group position={frame.mid} quaternion={quat}>
      {/* NB 压铸铝合金长臂主体 */}
      <RoundedBox
        args={[width, height, bodyLen]}
        radius={Math.min(0.01, width * 0.28, height * 0.28)}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} metalness={0.65} roughness={0.34} />
      </RoundedBox>
      {/* 臂身两端平滑圆角过渡枢纽包头，消除直线转角生硬拼接 */}
      {!isUpper && (
        <mesh position={[0, 0, -bodyLen / 2]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[height * 0.48, height * 0.48, width * 0.96, 16]} />
          <meshStandardMaterial color={color} metalness={0.65} roughness={0.34} />
        </mesh>
      )}

      {/* 上臂专属细节：顶部气压阻尼观察窗 + 侧面黄底 NB 圆形铭牌 */}
      {isUpper && (
        <>
          <mesh position={[0, height / 2 + 0.0004, bodyLen * 0.24]}>
            <boxGeometry args={[width * 0.42, 0.0018, 0.024]} />
            <meshStandardMaterial color="#181c24" roughness={0.5} />
          </mesh>
          {[-1, 1].map((sideSign) => (
            <group
              key={`badge-${sideSign}`}
              position={[sideSign * (width / 2 + 0.0008), height * 0.08, bodyLen * 0.28]}
              rotation={[0, 0, (sideSign * Math.PI) / 2]}
            >
              <mesh>
                <cylinderGeometry args={[0.0085, 0.0085, 0.0012, 16]} />
                <meshStandardMaterial color="#eeb81b" roughness={0.32} />
              </mesh>
              <mesh position={[0, 0.0007, 0]}>
                <cylinderGeometry args={[0.0032, 0.0032, 0.0006, 12]} />
                <meshStandardMaterial color="#1a1e26" roughness={0.45} />
              </mesh>
            </group>
          ))}
        </>
      )}

      {/* 长臂底部 1:1 NB 理线结构（上臂带 4 节锯齿波浪线夹，下臂带嵌入式底盖卡槽） */}
      {channelEnabled && (
        <group position={[0, -height / 2 - (isUpper ? 0.008 : 0.005), 0]}>
          {[-1, 1].map((sideSign) => (
            <mesh
              key={sideSign}
              position={[sideSign * (channelWidth / 2 - wallT / 2), 0, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallT, channelHeight * 0.65, channelLen]} />
              <meshStandardMaterial color="#191d24" roughness={0.58} metalness={0.12} />
            </mesh>
          ))}
          {isUpper ? (
            [-0.36, -0.12, 0.12, 0.36].map((frac, idx) => (
              <RoundedBox
                key={`fin-${idx}`}
                args={[channelWidth * 0.92, 0.015, channelLen * 0.18]}
                radius={0.003}
                smoothness={2}
                position={[0, -0.007, frac * channelLen]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color="#1b1f27" roughness={0.56} metalness={0.1} />
              </RoundedBox>
            ))
          ) : (
            <RoundedBox
              args={[channelWidth, wallT + 0.001, channelLen]}
              radius={0.0015}
              smoothness={2}
              position={[0, -channelHeight / 2 + wallT / 2, 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#1e232c" roughness={0.54} metalness={0.15} />
            </RoundedBox>
          )}
          {[-1, 1].map((endSign) => (
            <mesh
              key={`collar-${endSign}`}
              position={[0, 0.002, endSign * (channelLen / 2 - 0.005)]}
            >
              <boxGeometry args={[channelWidth + 0.003, channelHeight * 0.45, 0.009]} />
              <meshStandardMaterial color="#14181f" roughness={0.62} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function PitchArcGuide({
  pivot,
  dirXZ,
  radius,
  minDeg,
  maxDeg,
  color,
  opacity,
}: {
  pivot: Vector3;
  dirXZ: { x: number; z: number };
  radius: number;
  minDeg: number;
  maxDeg: number;
  color: string;
  opacity: number;
}) {
  const quat = useMemo(() => {
    const radial = new Vector3(dirXZ.x, 0, dirXZ.z);
    if (radial.lengthSq() < 1e-6) radial.set(0, 0, 1);
    else radial.normalize();
    const normal = new Vector3().crossVectors(radial, Y_AXIS).normalize();
    const m = new Matrix4().makeBasis(radial, Y_AXIS, normal);
    return new Quaternion().setFromRotationMatrix(m);
  }, [dirXZ.x, dirXZ.z]);

  const thetaStart = (minDeg * Math.PI) / 180;
  const thetaLen = ((maxDeg - minDeg) * Math.PI) / 180;

  return (
    <group position={pivot} quaternion={quat}>
      <mesh>
        <ringGeometry args={[radius - 0.0025, radius + 0.0025, 48, 1, thetaStart, thetaLen]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={2}
        />
      </mesh>
    </group>
  );
}

function VerticalArrowHandle({
  name,
  position,
  stemOffsetY,
  color,
  highlighted,
  onHoverChange,
  onPointerDown,
}: {
  name: string;
  position: [number, number, number];
  stemOffsetY: number;
  color: string;
  highlighted: boolean;
  onHoverChange: (hovered: boolean) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const stemMidY = stemOffsetY * 0.5;
  const stemLen = Math.max(0.008, Math.abs(stemOffsetY));
  return (
    <group position={position}>
      {/* Connecting stem down to arm/elbow mount */}
      <mesh position={[0, -stemMidY, 0]}>
        <cylinderGeometry args={[0.0024, 0.0024, stemLen, 8]} />
        <meshStandardMaterial color="#1f252e" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Central grip body */}
      <mesh
        name={name}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange(true);
          document.body.style.cursor = 'ns-resize';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverChange(false);
          if (document.body.style.cursor === 'ns-resize') {
            document.body.style.cursor = 'auto';
          }
        }}
        onPointerDown={onPointerDown}
      >
        <cylinderGeometry args={[0.011, 0.011, 0.016, 14]} />
        <meshStandardMaterial
          color={highlighted ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={highlighted ? 0.55 : 0.25}
          roughness={0.32}
        />
      </mesh>
      {/* Up / Down directional chevron cones */}
      <mesh position={[0, 0.013, 0]}>
        <coneGeometry args={[0.0065, 0.009, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.013, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.0065, 0.009, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function ArmBranch({
  arm,
  branch,
  selected,
  accent,
  clipEnabled,
  isInverted,
  desk,
  allItems,
  showReachGuide,
  isDraggingElbow,
  isDraggingLowerPitch,
  isDraggingUpperPitch,
  atLimit,
  controls,
  onError,
}: {
  arm: SceneItem;
  branch: ArmBranchKinematics;
  selected: boolean;
  accent: string;
  clipEnabled: boolean;
  isInverted: boolean;
  desk: Desk;
  allItems: SceneItem[];
  showReachGuide: boolean;
  isDraggingElbow: boolean;
  isDraggingLowerPitch: boolean;
  isDraggingUpperPitch: boolean;
  atLimit: boolean;
  controls?: RefObject<OrbitControlsImpl | null>;
  onError?: (m: string) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const [hoveredElbow, setHoveredElbow] = useState(false);
  const [hoveredLowerPitch, setHoveredLowerPitch] = useState(false);
  const [hoveredUpperPitch, setHoveredUpperPitch] = useState(false);
  const cleanupDrag = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupDrag.current?.();
      if (
        document.body.style.cursor === 'grab' ||
        document.body.style.cursor === 'grabbing' ||
        document.body.style.cursor === 'ns-resize'
      ) {
        document.body.style.cursor = 'auto';
      }
    };
  }, []);

  const vesaQuat = useMemo(
    () => new Quaternion().setFromUnitVectors(Z_AXIS, branch.vesaNormal),
    [branch.vesaNormal.x, branch.vesaNormal.y, branch.vesaNormal.z],
  );

  function cameraVerticalDragPlane(anchor: Vector3): Plane {
    const camXZ = new Vector3(camera.position.x - anchor.x, 0, camera.position.z - anchor.z);
    if (camXZ.lengthSq() < 1e-4) camXZ.set(0, 0, 1);
    else camXZ.normalize();
    return new Plane().setFromNormalAndCoplanarPoint(camXZ, anchor);
  }

  function runArmHandleDrag<TState>({
    e,
    cursor,
    createSession,
  }: {
    e: ThreeEvent<PointerEvent>;
    cursor: string;
    createSession: (
      startBranch: ArmBranchKinematics,
      dragRay: Raycaster,
    ) => {
      plane: Plane;
      state: TState;
      onMoveHit: (hit: Vector3, state: TState) => { preview: DragPreviewState };
      onCommit: (state: TState) => { limitReason?: ArmLimitReason; obstacleName?: string };
      errorMsg: string;
    };
  }) {
    if (e.button === 2) {
      e.stopPropagation();
      pauseOrbitUntilPointerUp(controls?.current, invalidate);
      useEditor.getState().select(arm.id);
      return;
    }
    if (e.button !== 0 || useEditor.getState().selected !== arm.id) return;
    e.stopPropagation();

    const canvas = gl.domElement;
    const pointer = e.pointerId;
    const sx = e.nativeEvent.clientX;
    const sy = e.nativeEvent.clientY;
    const startBranch: ArmBranchKinematics = {
      ...branch,
      columnTop: branch.columnTop.clone(),
      elbowPos: branch.elbowPos.clone(),
      vesaHeadPos: branch.vesaHeadPos.clone(),
      vesaPos: branch.vesaPos.clone(),
    };

    const hit = new Vector3();
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const rect0 = canvas.getBoundingClientRect();
    ndc.set(((sx - rect0.left) / rect0.width) * 2 - 1, (-(sy - rect0.top) / rect0.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    const session = createSession(startBranch, raycaster);
    let moved = false;
    let done = false;

    if (controls?.current) controls.current.enabled = false;
    document.body.style.cursor = cursor;
    try {
      canvas.setPointerCapture(pointer);
    } catch {
      /* capture may be unavailable on interrupted pointers */
    }

    function move(ev: PointerEvent) {
      if (ev.pointerId !== pointer) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3 && !moved) return;
      moved = true;
      const r = canvas.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        (-(ev.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(session.plane, hit)) return;
      const { preview } = session.onMoveHit(hit, session.state);
      useEditor.getState().setDragPreview(preview);
      invalidate();
    }

    function finish(cancel: boolean) {
      if (done) return;
      done = true;
      if (!moved || cancel) {
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
      if (controls?.current) controls.current.enabled = true;
      document.body.style.cursor = 'auto';
      cleanupDrag.current = null;
      invalidate();
      if (moved && !cancel) {
        try {
          const outcome = session.onCommit(session.state);
          if (useEditor.getState().dragPreview) useEditor.getState().setDragPreview(null);
          if (outcome.limitReason === 'deskClearance' || outcome.limitReason === 'armObstacle') {
            useEditor
              .getState()
              .setCollisionNotice(
                armLimitMessage(outcome.limitReason, undefined, outcome.obstacleName),
              );
          } else {
            useEditor.getState().setCollisionNotice(null);
          }
        } catch (err) {
          useEditor.getState().setDragPreview(null);
          onError?.(err instanceof Error ? err.message : session.errorMsg);
        }
      }
    }

    function up(ev: PointerEvent) {
      if (ev.pointerId === pointer) finish(false);
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

  function startElbowDrag(e: ThreeEvent<PointerEvent>) {
    const startItems = allItems;
    const collisionOn = useEditor.getState().collisionEnabled;
    runArmHandleDrag({
      e,
      cursor: 'grabbing',
      createSession: (startBranch) => {
        const dragPlane = new Plane(Y_AXIS, -startBranch.elbowPos.y);
        const state = {
          solved: solveArmElbowSwivelWithCollision({
            arm,
            branch: startBranch,
            desiredYawDeg: startBranch.lowerYawDeg,
            desk,
            allItems: startItems,
            collisionEnabled: collisionOn,
          }),
        };
        return {
          plane: dragPlane,
          state,
          onMoveHit: (hit) => {
            const dx = hit.x - startBranch.columnTop.x;
            const dz = hit.z - startBranch.columnTop.z;
            if (Math.hypot(dx, dz) >= 1e-4) {
              const desiredYawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
              state.solved = solveArmElbowSwivelWithCollision({
                arm,
                branch: startBranch,
                desiredYawDeg,
                desk,
                allItems: startItems,
                collisionEnabled: collisionOn,
              });
            }
            return {
              preview: {
                kind: 'armElbow',
                id: arm.id,
                role: branch.role,
                targetId: state.solved.targetId,
                x: state.solved.x,
                z: state.solved.z,
                bend: state.solved.bend,
                yawDeg: state.solved.yawDeg,
                limitReason: state.solved.limitReason,
                obstacleName: state.solved.obstacleName,
              },
            };
          },
          onCommit: () => {
            useEditor
              .getState()
              .commit((p) =>
                applyArmSolutionToProject(p, arm.id, branch.role, state.solved, false),
              );
            return state.solved;
          },
          errorMsg: '无法水平调整机械臂肘关节',
        };
      },
    });
  }

  function startLowerPitchDrag(e: ThreeEvent<PointerEvent>) {
    const startItems = allItems;
    const collisionOn = useEditor.getState().collisionEnabled;
    runArmHandleDrag({
      e,
      cursor: 'ns-resize',
      createSession: (startBranch, ray) => {
        const dragPlane = cameraVerticalDragPlane(startBranch.elbowPos);
        const startHit = new Vector3();
        if (!ray.ray.intersectPlane(dragPlane, startHit)) {
          startHit.copy(startBranch.elbowPos);
        }
        const state = {
          startHitY: startHit.y,
          solved: solveArmLowerPitchWithCollision({
            arm,
            branch: startBranch,
            desiredPitchDeg: startBranch.lowerPitchDeg,
            desk,
            allItems: startItems,
            collisionEnabled: collisionOn,
          }),
        };
        return {
          plane: dragPlane,
          state,
          onMoveHit: (hit) => {
            const deltaY = hit.y - state.startHitY;
            const desiredElbowY = startBranch.elbowPos.y + deltaY;
            const sinTheta = Math.max(
              -1,
              Math.min(1, (desiredElbowY - startBranch.columnTop.y) / ARM_LOWER_LENGTH),
            );
            const desiredPitchDeg = (Math.asin(sinTheta) * 180) / Math.PI;
            state.solved = solveArmLowerPitchWithCollision({
              arm,
              branch: startBranch,
              desiredPitchDeg,
              desk,
              allItems: startItems,
              collisionEnabled: collisionOn,
            });
            return {
              preview: {
                kind: 'armLowerPitch',
                id: arm.id,
                role: branch.role,
                targetId: state.solved.targetId,
                targetType: state.solved.targetType,
                x: state.solved.x,
                z: state.solved.z,
                lift: state.solved.lift,
                trayElevation: state.solved.trayElevation,
                bend: state.solved.bend,
                lowerPitchDeg: state.solved.lowerPitchDeg,
                upperPitchDeg: state.solved.upperPitchDeg,
                limitReason: state.solved.limitReason,
                obstacleName: state.solved.obstacleName,
              },
            };
          },
          onCommit: () => {
            useEditor
              .getState()
              .commit((p) => applyArmSolutionToProject(p, arm.id, branch.role, state.solved, true));
            return state.solved;
          },
          errorMsg: '无法上下调整下长臂俯仰角度',
        };
      },
    });
  }

  function startUpperPitchDrag(e: ThreeEvent<PointerEvent>) {
    const startItems = allItems;
    const collisionOn = useEditor.getState().collisionEnabled;
    const gripFraction = 0.55;
    runArmHandleDrag({
      e,
      cursor: 'ns-resize',
      createSession: (startBranch, ray) => {
        const anchor = startBranch.elbowPos.clone().lerp(startBranch.vesaHeadPos, gripFraction);
        const dragPlane = cameraVerticalDragPlane(anchor);
        const startHit = new Vector3();
        if (!ray.ray.intersectPlane(dragPlane, startHit)) {
          startHit.copy(anchor);
        }
        const state = {
          startHitY: startHit.y,
          solved: solveArmUpperPitchWithCollision({
            arm,
            branch: startBranch,
            desiredUpperPitchDeg: startBranch.upperPitchDeg,
            desk,
            allItems: startItems,
            collisionEnabled: collisionOn,
          }),
        };
        return {
          plane: dragPlane,
          state,
          onMoveHit: (hit) => {
            const deltaY = hit.y - state.startHitY;
            const desiredDy2 =
              startBranch.vesaHeadPos.y - startBranch.elbowPos.y + deltaY / gripFraction;
            const sinTheta2 = Math.max(-1, Math.min(1, desiredDy2 / ARM_UPPER_LENGTH));
            const desiredUpperPitchDeg = (Math.asin(sinTheta2) * 180) / Math.PI;
            state.solved = solveArmUpperPitchWithCollision({
              arm,
              branch: startBranch,
              desiredUpperPitchDeg,
              desk,
              allItems: startItems,
              collisionEnabled: collisionOn,
            });
            return {
              preview: {
                kind: 'armUpperPitch',
                id: arm.id,
                role: branch.role,
                targetId: state.solved.targetId,
                targetType: state.solved.targetType,
                x: state.solved.x,
                z: state.solved.z,
                lift: state.solved.lift,
                trayElevation: state.solved.trayElevation,
                bend: state.solved.bend,
                lowerPitchDeg: state.solved.lowerPitchDeg,
                upperPitchDeg: state.solved.upperPitchDeg,
                limitReason: state.solved.limitReason,
                obstacleName: state.solved.obstacleName,
              },
            };
          },
          onCommit: () => {
            useEditor
              .getState()
              .commit((p) =>
                applyArmSolutionToProject(p, arm.id, branch.role, state.solved, false),
              );
            return state.solved;
          },
          errorMsg: '无法上下调整气压上臂俯仰角度',
        };
      },
    });
  }

  const turretHeight = Math.abs(branch.columnTop.y - branch.turretBase.y);
  const turretMidY = (branch.columnTop.y + branch.turretBase.y) / 2;
  const elbowHighlighted = hoveredElbow || isDraggingElbow;
  const lowerPitchHighlighted = hoveredLowerPitch || isDraggingLowerPitch;
  const upperPitchHighlighted = hoveredUpperPitch || isDraggingUpperPitch;
  const lowerPitchBounds = lowerPitchRange(isInverted);
  const lowerDirXZ = {
    x: branch.elbowPos.x - branch.columnTop.x,
    z: branch.elbowPos.z - branch.columnTop.z,
  };
  const upperDirXZ = {
    x: branch.vesaHeadPos.x - branch.elbowPos.x,
    z: branch.vesaHeadPos.z - branch.elbowPos.z,
  };
  const upperGripBase = branch.elbowPos.clone().lerp(branch.vesaHeadPos, 0.55);
  const upperHandleOffsetY = isInverted ? -0.046 : 0.046;
  const elbowHandleOffsetY = isInverted ? -0.056 : 0.056;

  return (
    <group>
      {/* NB F80/F160 紧凑微喇双阶旋转肩柱（双臂并排呈 V 型对称展开） */}
      <group position={[branch.turretBase.x, turretMidY, branch.turretBase.z]}>
        {/* 下段微锥旋转套筒 */}
        <mesh
          position={[0, (isInverted ? 1 : -1) * (turretHeight * 0.14), 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry
            args={[
              isInverted ? 0.0175 : 0.0195,
              isInverted ? 0.0195 : 0.0175,
              turretHeight * 0.72,
              20,
            ]}
          />
          <meshStandardMaterial color={accent} metalness={0.68} roughness={0.34} />
        </mesh>
        {/* 上段回转关节头 */}
        <mesh
          position={[0, (isInverted ? -1 : 1) * (turretHeight * 0.34), 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.017, 0.0185, turretHeight * 0.32, 20]} />
          <meshStandardMaterial color={accent} metalness={0.68} roughness={0.34} />
        </mesh>
        {/* 底座根部镀黑阶梯限位环 */}
        <mesh position={[0, (isInverted ? 1 : -1) * (turretHeight / 2 - 0.008), 0]}>
          <cylinderGeometry args={[0.021, 0.022, 0.01, 20]} />
          <meshStandardMaterial color="#1a1f27" roughness={0.55} />
        </mesh>
        {/* 中段 360° 回转分缝饰圈 */}
        <mesh position={[0, (isInverted ? 1 : -1) * (turretHeight * 0.04), 0]}>
          <cylinderGeometry args={[0.0198, 0.0198, 0.003, 20]} />
          <meshStandardMaterial color="#181c23" roughness={0.6} />
        </mesh>
        {/* 肩顶封帽 */}
        <mesh position={[0, (isInverted ? -1 : 1) * (turretHeight / 2 + 0.001), 0]}>
          <cylinderGeometry args={[0.016, 0.017, 0.007, 20]} />
          <meshStandardMaterial color="#1e242d" roughness={0.55} />
        </mesh>
        {clipEnabled && (
          <mesh position={[0, (isInverted ? 1 : -1) * turretHeight * 0.08, -0.02]} castShadow>
            <boxGeometry args={[0.018, 0.026, 0.011]} />
            <meshStandardMaterial color="#1a1e26" roughness={0.58} />
          </mesh>
        )}
      </group>

      {/* 下长臂（固定机械长度 27.5 cm，支持随肘关节三维自由旋转摆动） */}
      <CastArmWithCableChannel
        from={branch.columnTop}
        to={branch.elbowPos}
        width={0.032}
        height={0.028}
        color={accent}
        channelEnabled={clipEnabled}
      />

      {/* 肘部竖轴双层旋转关节（仅水平绕轴旋转，保持固定斜角与刚性臂长） */}
      <group position={branch.elbowPos}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.021, 0.021, 0.044, 22]} />
          <meshStandardMaterial
            color={elbowHighlighted ? '#315ce7' : accent}
            emissive={elbowHighlighted ? '#315ce7' : '#000000'}
            emissiveIntensity={elbowHighlighted ? 0.25 : 0}
            metalness={0.7}
            roughness={0.32}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.0235, 0.0235, 0.006, 22]} />
          <meshStandardMaterial
            color={atLimit ? '#d94b3d' : elbowHighlighted ? '#5b82ff' : '#1a1f27'}
            emissive={atLimit ? '#d94b3d' : elbowHighlighted ? '#315ce7' : '#000000'}
            emissiveIntensity={atLimit ? 0.45 : elbowHighlighted ? 0.4 : 0}
            roughness={0.42}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0068, 0.0068, 0.046, 14]} />
          <meshStandardMaterial color="#a6b0bc" metalness={0.86} roughness={0.2} />
        </mesh>
        <mesh position={[0, isInverted ? -0.023 : 0.023, 0]}>
          <cylinderGeometry args={[0.017, 0.018, 0.005, 18]} />
          <meshStandardMaterial color="#1e242d" roughness={0.5} />
        </mesh>
        {/* 扩大交互点击拾取热区 */}
        <mesh
          name="arm-elbow-handle"
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredElbow(true);
            if (!isDraggingElbow) document.body.style.cursor = 'grab';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredElbow(false);
            if (!isDraggingElbow && document.body.style.cursor === 'grab') {
              document.body.style.cursor = 'auto';
            }
          }}
          onPointerDown={startElbowDrag}
        >
          <sphereGeometry args={[0.038, 14, 14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* 选中/悬停时显示下长臂竖向俯仰手柄（与中心水平手柄无空间重叠） */}
        {(selected || lowerPitchHighlighted) && (
          <VerticalArrowHandle
            name="arm-elbow-lift-handle"
            position={[0, elbowHandleOffsetY, 0]}
            stemOffsetY={isInverted ? -0.031 : 0.031}
            color="#0ea5e9"
            highlighted={lowerPitchHighlighted}
            onHoverChange={setHoveredLowerPitch}
            onPointerDown={startLowerPitchDrag}
          />
        )}
      </group>

      {/* 悬停或拖动肘关节水平手柄时：水平面绘制固定半径绕肩水平旋转轨迹圆环 */}
      {elbowHighlighted && (
        <mesh
          position={[branch.columnTop.x, branch.elbowPos.y, branch.columnTop.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[branch.lowerHoriz - 0.003, branch.lowerHoriz + 0.003, 56]} />
          <meshBasicMaterial
            color={atLimit ? '#d94b3d' : '#315ce7'}
            transparent
            opacity={isDraggingElbow ? 0.62 : 0.36}
            depthWrite={false}
            side={2}
          />
        </mesh>
      )}

      {/* 悬停或拖动下长臂俯仰手柄时：竖直面绘制定长 27.5 cm 下臂俯仰轨迹圆弧 */}
      {lowerPitchHighlighted && (
        <PitchArcGuide
          pivot={branch.columnTop}
          dirXZ={lowerDirXZ}
          radius={ARM_LOWER_LENGTH}
          minDeg={lowerPitchBounds.minDeg}
          maxDeg={lowerPitchBounds.maxDeg}
          color={atLimit ? '#d94b3d' : '#0ea5e9'}
          opacity={isDraggingLowerPitch ? 0.68 : 0.4}
        />
      )}

      {/* 悬停或拖动上长臂俯仰手柄时：竖直面绘制定长 30.5 cm 气压上臂俯仰轨迹圆弧 */}
      {upperPitchHighlighted && (
        <PitchArcGuide
          pivot={branch.elbowPos}
          dirXZ={upperDirXZ}
          radius={ARM_UPPER_LENGTH}
          minDeg={ARM_UPPER_PITCH_MIN_DEG}
          maxDeg={ARM_UPPER_PITCH_MAX_DEG}
          color={atLimit ? '#d94b3d' : '#f59e0b'}
          opacity={isDraggingUpperPitch ? 0.68 : 0.4}
        />
      )}

      {/* 拖动或达到极限时：桌面投影真实物理工作半径环（最小折叠半径 ~ 最大伸展半径） */}
      {(showReachGuide || atLimit || isDraggingLowerPitch || isDraggingUpperPitch) && (
        <group
          position={[branch.turretBase.x, desk.height + 0.0025, branch.turretBase.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <mesh>
            <ringGeometry args={[branch.dMin, branch.dMax, 56]} />
            <meshBasicMaterial
              color={atLimit ? '#d94b3d' : '#315ce7'}
              transparent
              opacity={atLimit ? 0.14 : 0.07}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[Math.max(0.01, branch.dMax - 0.006), branch.dMax, 56]} />
            <meshBasicMaterial
              color={atLimit ? '#d94b3d' : '#315ce7'}
              transparent
              opacity={atLimit ? 0.85 : 0.4}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[Math.max(0.005, branch.dMin - 0.005), branch.dMin, 40]} />
            <meshBasicMaterial
              color={atLimit ? '#d94b3d' : '#64748b'}
              transparent
              opacity={atLimit ? 0.72 : 0.32}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* 气压上长臂（含底部全长理线卡槽） */}
      <CastArmWithCableChannel
        from={branch.elbowPos}
        to={branch.vesaHeadPos}
        width={0.036}
        height={0.032}
        color={accent}
        channelEnabled={clipEnabled}
        isUpper
      />

      {/* 选中/悬停时显示气压上长臂竖向俯仰手柄 */}
      {(selected || upperPitchHighlighted) && (
        <VerticalArrowHandle
          name="arm-upper-lift-handle"
          position={[upperGripBase.x, upperGripBase.y + upperHandleOffsetY, upperGripBase.z]}
          stemOffsetY={isInverted ? -0.028 : 0.028}
          color="#f59e0b"
          highlighted={upperPitchHighlighted}
          onHoverChange={setHoveredUpperPitch}
          onPointerDown={startUpperPitchDrag}
        />
      )}

      {/* VESA 俯仰旋转头 */}
      <group position={branch.vesaHeadPos} quaternion={vesaQuat}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.038, 16]} />
          <meshStandardMaterial color={accent} metalness={0.7} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0, -0.019]} castShadow>
          <boxGeometry args={[0.034, 0.03, 0.038]} />
          <meshStandardMaterial color={accent} metalness={0.7} roughness={0.34} />
        </mesh>
      </group>

      {/* 100×100 mm VESA 快装板 + 四角 M4 螺钉 */}
      <group position={branch.vesaPos} quaternion={vesaQuat}>
        <RoundedBox
          args={[0.112, 0.112, 0.008]}
          radius={0.004}
          smoothness={2}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={accent} metalness={0.68} roughness={0.36} />
        </RoundedBox>
        {[-0.044, 0.044].flatMap((sx) =>
          [-0.044, 0.044].map((sy) => (
            <mesh
              key={`screw-${sx}${sy}`}
              position={[sx, sy, 0.005]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.0038, 0.0038, 0.003, 10]} />
              <meshStandardMaterial color="#1f252e" metalness={0.6} roughness={0.35} />
            </mesh>
          )),
        )}
      </group>

      {/* NB FP-2 1:1 笔记本托盘附件（当此支臂挂载笔记本时） */}
      {branch.targetType === 'laptopTray' && (
        <LaptopTrayModel laptop={branch.target} desk={desk} allItems={allItems} accent={accent} />
      )}
    </group>
  );
}

export function MonitorArmModel({
  arm,
  allItems,
  desk,
  selected,
  activeDragId,
  activeElbowRole,
  activeLowerPitchRole,
  activeUpperPitchRole,
  dragClamped = false,
  controls,
  onError,
}: {
  arm: SceneItem;
  allItems: SceneItem[];
  desk: Desk;
  selected: boolean;
  activeDragId?: string;
  activeElbowRole?: 'primary' | 'secondary';
  activeLowerPitchRole?: 'primary' | 'secondary';
  activeUpperPitchRole?: 'primary' | 'secondary';
  dragClamped?: boolean;
  controls?: RefObject<OrbitControlsImpl | null>;
  onError?: (m: string) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const sys = useMemo(() => computeMonitorArmSystem(arm, allItems, desk), [arm, allItems, desk]);
  const [hoveredBase, setHoveredBase] = useState(false);
  const [draggingBase, setDraggingBase] = useState(false);
  const cleanupBaseDrag = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupBaseDrag.current?.();
      if (document.body.style.cursor === 'move') {
        document.body.style.cursor = 'auto';
      }
    };
  }, []);

  const clipEnabled = arm.monitorArm?.cableClip ?? true;
  const accent = selected ? '#315ce7' : arm.color;
  // NB F160 uses a compact twin-socket deck plate (122 × 92 mm) over twin close-set steel C-clamps (±30 mm),
  // distinct from NB F80's narrow single-column baseplate (88 × 88 mm) & single clamp.
  const plateW = sys.isDual ? 0.122 : 0.088;
  const plateD = sys.isDual ? 0.092 : 0.088;
  const plateZOffset = sys.isDual ? 0.008 : 0;
  const gantrySpan = Math.max(0.4, sys.gantryRightX - sys.gantryLeftX);
  const gantryMidX = (sys.gantryLeftX + sys.gantryRightX) / 2;
  const railZ = -desk.depth / 2 + 0.032;
  const clampThick = sys.isInverted ? 0.032 : desk.thickness;
  const clampOffsets = sys.isDual ? [-0.03, 0.03] : [0];
  const socketOffsets = sys.isDual ? [-ARM_DUAL_SOCKET_OFFSET, ARM_DUAL_SOCKET_OFFSET] : [0];
  const baseHighlighted = hoveredBase || draggingBase;

  function startBaseDrag(e: ThreeEvent<PointerEvent>) {
    if (e.button === 2) {
      e.stopPropagation();
      pauseOrbitUntilPointerUp(controls?.current, invalidate);
      useEditor.getState().select(arm.id);
      return;
    }
    if (e.button !== 0 || !arm.monitorArm) return;
    e.stopPropagation();
    if (useEditor.getState().selected !== arm.id) {
      useEditor.getState().select(arm.id);
    }

    const canvas = gl.domElement;
    const pointer = e.pointerId;
    const sx = e.nativeEvent.clientX;
    const sy = e.nativeEvent.clientY;
    const startArm: SceneItem = { ...arm, monitorArm: { ...arm.monitorArm } };
    const startItems = allItems;
    const collisionOn = useEditor.getState().collisionEnabled;
    const dragPlane = new Plane(Y_AXIS, -sys.basePos.y);
    const hit = new Vector3();
    const raycaster = new Raycaster();
    const ndc = new Vector2();

    const r0 = canvas.getBoundingClientRect();
    ndc.set(((sx - r0.left) / r0.width) * 2 - 1, (-(sy - r0.top) / r0.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const startOffsetX = raycaster.ray.intersectPlane(dragPlane, hit) ? sys.basePos.x - hit.x : 0;
    const startOffsetZ = raycaster.ray.intersectPlane(dragPlane, hit) ? sys.basePos.z - hit.z : 0;

    let latestSolved = solveArmBaseMoveWithCollision({
      arm: startArm,
      desk,
      allItems: startItems,
      desiredX: sys.clampX,
      desiredZ: sys.clampZ,
      forcedEdge: sys.clampEdge,
      snapToEdges: false,
      collisionEnabled: collisionOn,
    });
    let moved = false;
    let done = false;

    setDraggingBase(true);
    if (controls?.current) controls.current.enabled = false;
    document.body.style.cursor = 'move';
    try {
      canvas.setPointerCapture(pointer);
    } catch {
      /* pointer capture fallback */
    }

    function move(ev: PointerEvent) {
      if (ev.pointerId !== pointer) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3 && !moved) return;
      moved = true;
      const r = canvas.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        (-(ev.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
      latestSolved = solveArmBaseMoveWithCollision({
        arm: startArm,
        desk,
        allItems: startItems,
        desiredX: hit.x + startOffsetX,
        desiredZ: hit.z + startOffsetZ,
        snapToEdges: true,
        collisionEnabled: collisionOn,
      });
      useEditor.getState().setDragPreview({
        kind: 'armBase',
        id: arm.id,
        clampEdge: latestSolved.clampEdge,
        clampX: latestSolved.clampX,
        clampZ: latestSolved.clampZ,
        updatedTargets: latestSolved.updatedTargets,
        limitReason: latestSolved.limitReason,
        obstacleName: latestSolved.obstacleName,
      });
      invalidate();
    }

    function finish(cancel: boolean) {
      if (done) return;
      done = true;
      setDraggingBase(false);
      if (!moved || cancel) {
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
        /* already released */
      }
      if (controls?.current) controls.current.enabled = true;
      document.body.style.cursor = 'auto';
      cleanupBaseDrag.current = null;
      invalidate();
      if (moved && !cancel) {
        try {
          useEditor
            .getState()
            .commit((p) => applyArmBaseSolutionToProject(p, arm.id, latestSolved));
          if (useEditor.getState().dragPreview) useEditor.getState().setDragPreview(null);
          if (latestSolved.limitReason) {
            useEditor
              .getState()
              .setCollisionNotice(
                armLimitMessage(latestSolved.limitReason, undefined, latestSolved.obstacleName),
              );
          } else {
            useEditor.getState().setCollisionNotice(null);
          }
        } catch (err) {
          useEditor.getState().setDragPreview(null);
          onError?.(err instanceof Error ? err.message : '无法移动机械臂底座');
        }
      }
    }

    function up(ev: PointerEvent) {
      if (ev.pointerId === pointer) finish(false);
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

    cleanupBaseDrag.current = cancelDrag;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('keydown', key);
    canvas.addEventListener('lostpointercapture', cancelDrag);
  }

  return (
    <group
      onPointerDown={(e) => {
        if (e.button !== 2) return;
        e.stopPropagation();
        pauseOrbitUntilPointerUp(controls?.current, invalidate);
        useEditor.getState().select(arm.id);
      }}
    >
      {/* 倒挂模式专属：桌缘立柱 + 顶部方钢夹持横梁 */}
      {sys.isInverted && (
        <group>
          {[sys.gantryLeftX, sys.gantryRightX].map((px, i) => (
            <group key={`post-${i}`} position={[px, desk.height, railZ]}>
              {/* 桌缘 C 夹固定座 */}
              <RoundedBox
                args={[0.056, 0.012, 0.064]}
                radius={0.003}
                smoothness={2}
                position={[0, 0.006, 0.01]}
                castShadow
              >
                <meshStandardMaterial color="#20252e" metalness={0.65} roughness={0.42} />
              </RoundedBox>
              {/* 竖向支撑立柱 */}
              <mesh position={[0, sys.invertedHeight / 2 + 0.01, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.028, sys.invertedHeight + 0.015, 0.028]} />
                <meshStandardMaterial color="#242a34" metalness={0.68} roughness={0.38} />
              </mesh>
            </group>
          ))}
          {/* 顶部水平方钢横梁 */}
          <RoundedBox
            args={[gantrySpan + 0.048, 0.032, 0.038]}
            radius={0.004}
            smoothness={2}
            position={[gantryMidX, sys.basePos.y + 0.016, railZ]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#222832" metalness={0.7} roughness={0.36} />
          </RoundedBox>
        </group>
      )}

      {/* 重型底座：桌缘模式下显示钢制多孔 C 夹，桌面内部模式下切换为扁平穿孔锁紧底盘，均支持 3D 自由拖拽 */}
      <group position={sys.basePos} rotation={[0, sys.baseYaw, sys.isInverted ? Math.PI : 0]}>
        <RoundedBox
          args={[plateW, 0.011, plateD]}
          radius={0.0045}
          smoothness={2}
          position={[0, 0.0055, plateZOffset]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={baseHighlighted ? '#3b82f6' : accent}
            emissive={baseHighlighted ? '#2563eb' : '#000000'}
            emissiveIntensity={baseHighlighted ? 0.25 : 0}
            metalness={0.7}
            roughness={0.34}
          />
        </RoundedBox>
        {/* 底座 3D 选中与拖拽拾取热区 */}
        <mesh
          name="arm-base-handle"
          position={[0, 0.025, plateZOffset]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredBase(true);
            if (!draggingBase) document.body.style.cursor = 'move';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredBase(false);
            if (!draggingBase && document.body.style.cursor === 'move') {
              document.body.style.cursor = 'auto';
            }
          }}
          onPointerDown={startBaseDrag}
        >
          <boxGeometry args={[plateW + 0.03, 0.06, plateD + 0.03]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {(selected || baseHighlighted) && (
          <mesh position={[0, 0.002, plateZOffset]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[Math.max(plateW, plateD) * 0.62, Math.max(plateW, plateD) * 0.7, 36]}
            />
            <meshBasicMaterial
              color={draggingBase ? '#2563eb' : '#60a5fa'}
              transparent
              opacity={draggingBase ? 0.72 : 0.45}
              depthWrite={false}
              side={2}
            />
          </mesh>
        )}
        {sys.isDual && (
          <mesh position={[0, 0.0115, plateZOffset + plateD * 0.34]}>
            <cylinderGeometry args={[0.006, 0.006, 0.001, 14]} />
            <meshStandardMaterial color="#eeb81b" roughness={0.35} />
          </mesh>
        )}
        {socketOffsets.map((sx, i) => (
          <mesh
            key={`collar-ring-${i}`}
            position={[sx, 0.0125, sys.isDual ? 0.008 : 0]}
            receiveShadow
          >
            <cylinderGeometry args={[0.02, 0.0225, 0.005, 18]} />
            <meshStandardMaterial color="#1b2028" roughness={0.55} />
          </mesh>
        ))}
        {sys.clampEdge === 'surface' && !sys.isInverted ? (
          /* 桌面内部穿孔锁紧底盘 + 穿桌螺栓螺母（隐藏桌缘外延 C 夹避免悬浮/穿模） */
          <group>
            <mesh position={[0, 0.001, plateZOffset]} receiveShadow>
              <cylinderGeometry args={[plateW * 0.56, plateW * 0.6, 0.004, 24]} />
              <meshStandardMaterial color="#1a1f27" roughness={0.58} metalness={0.25} />
            </mesh>
            <mesh position={[0, -desk.thickness / 2, plateZOffset]}>
              <cylinderGeometry args={[0.009, 0.009, desk.thickness + 0.016, 14]} />
              <meshStandardMaterial color="#949da9" metalness={0.8} roughness={0.26} />
            </mesh>
            <mesh position={[0, -desk.thickness - 0.008, plateZOffset]}>
              <cylinderGeometry args={[0.026, 0.026, 0.008, 18]} />
              <meshStandardMaterial color="#1a1f27" roughness={0.55} />
            </mesh>
          </group>
        ) : (
          clampOffsets.map((cx, idx) => (
            <group key={`clamp-${idx}`} position={[cx, 0, 0]}>
              {/* 竖向多孔钢制 C 夹背板（支持 25–80 mm 桌厚调整） */}
              <RoundedBox
                args={[0.021, clampThick + 0.056, 0.012]}
                radius={0.002}
                smoothness={2}
                position={[0, -clampThick / 2 - 0.016, -0.036]}
                castShadow
              >
                <meshStandardMaterial color="#1a1f27" metalness={0.55} roughness={0.42} />
              </RoundedBox>
              {/* 钢制背板三颗定位孔细节 */}
              {[-0.014, -0.029, -0.044].map((hy, hi) => (
                <mesh
                  key={`hole-${hi}`}
                  position={[0, -clampThick + hy, -0.0422]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.0024, 0.0024, 0.0015, 10]} />
                  <meshStandardMaterial color="#0b0d11" roughness={0.7} />
                </mesh>
              ))}
              <mesh position={[0, -clampThick - 0.036, -0.012]} castShadow>
                <boxGeometry args={[0.021, 0.0085, 0.056]} />
                <meshStandardMaterial color="#1a1f27" metalness={0.55} roughness={0.42} />
              </mesh>
              <mesh position={[0, -clampThick - 0.002, 0.002]} castShadow>
                <cylinderGeometry args={[0.0115, 0.0115, 0.004, 14]} />
                <meshStandardMaterial color="#242b36" roughness={0.6} />
              </mesh>
              <mesh position={[0, -clampThick - 0.018, 0.002]} castShadow>
                <cylinderGeometry args={[0.0048, 0.0048, 0.034, 12]} />
                <meshStandardMaterial color="#949da9" metalness={0.82} roughness={0.24} />
              </mesh>
              {/* 蝶形紧固手拧旋钮 */}
              <mesh position={[0, -clampThick - 0.047, 0.002]} castShadow>
                <cylinderGeometry args={[0.0155, 0.0145, 0.01, 12]} />
                <meshStandardMaterial color="#1a1f27" roughness={0.6} />
              </mesh>
              <mesh position={[0, -clampThick - 0.047, 0.002]} castShadow>
                <boxGeometry args={[0.036, 0.007, 0.009]} />
                <meshStandardMaterial color="#1a1f27" roughness={0.6} />
              </mesh>
            </group>
          ))
        )}
      </group>

      {/* 渲染单臂或双臂的所有已激活支臂 */}
      {sys.branches.map((branch) => {
        const isDraggingThis = activeDragId === branch.target.id;
        const isDraggingElbow = activeElbowRole === branch.role;
        const isDraggingLowerPitch = activeLowerPitchRole === branch.role;
        const isDraggingUpperPitch = activeUpperPitchRole === branch.role;
        const atLimit =
          branch.clamped ||
          (isDraggingThis && (dragClamped || branch.reachRatio >= 0.985)) ||
          ((isDraggingElbow || isDraggingLowerPitch || isDraggingUpperPitch) && dragClamped);
        return (
          <ArmBranch
            key={branch.role}
            arm={arm}
            branch={branch}
            selected={selected}
            accent={accent}
            clipEnabled={clipEnabled}
            isInverted={sys.isInverted}
            desk={desk}
            allItems={allItems}
            showReachGuide={isDraggingThis}
            isDraggingElbow={isDraggingElbow}
            isDraggingLowerPitch={isDraggingLowerPitch}
            isDraggingUpperPitch={isDraggingUpperPitch}
            atLimit={atLimit}
            controls={controls}
            onError={onError}
          />
        );
      })}
    </group>
  );
}

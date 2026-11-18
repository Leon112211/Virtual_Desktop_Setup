import { useEffect, useMemo, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import {
  CatmullRomCurve3,
  Plane,
  Quaternion,
  Raycaster,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  arePortKindsCompatible,
  cableMeta,
  isPortCompatibleWithCable,
  type Cable,
  type CableWaypoint,
} from '../domain/cable';
import { computeCablePath } from '../domain/cableRouting';
import {
  findContainingHole,
  getSceneCableHoles,
  getSceneSolidBoxes,
  projectCablePointClear,
  type CableHole,
} from '../domain/collision';
import { devicePorts, devicePortWorld, isPortKind } from '../domain/ports';
import type { PlugSpecKind } from '../domain/power';
import type { Project } from '../domain/project';
import { useEditor } from '../store/editorStore';
import { pauseOrbitUntilPointerUp } from './orbitPause';

const FORWARD = new Vector3(0, 0, 1);

/**
 * Renders 1:1 physically proportioned connector plug heads along `direction`
 * (z = 0 at port face, +z extending outward toward the cable jacket).
 */
function PlugConnector({
  position,
  direction,
  kind,
  plugType,
  cableColor,
}: {
  position: Vector3;
  direction: Vector3;
  kind: Cable['kind'];
  plugType?: PlugSpecKind;
  cableColor: string;
}) {
  const quat = useMemo(
    () => new Quaternion().setFromUnitVectors(FORWARD, direction),
    [direction.x, direction.y, direction.z],
  );
  const spec = cableMeta[kind];
  const bootR = spec.radius * 1.45;
  const activePowerPlug =
    plugType ?? (kind === 'power' ? 'iecC13' : kind === 'usbc' ? undefined : undefined);

  return (
    <group position={position} quaternion={quat}>
      {plugType === 'ganAdapter' ? (
        <>
          {/* GaN 氮化镓桌面/壁插快充头（42 × 32 × 46 mm） */}
          <RoundedBox
            args={[0.042, 0.032, 0.044]}
            radius={0.0045}
            smoothness={3}
            position={[0, 0, 0.022]}
            castShadow
          >
            <meshStandardMaterial color="#2c3340" roughness={0.42} metalness={0.18} />
          </RoundedBox>
          {/* 金属散热边框 */}
          <mesh position={[0, 0, 0.004]}>
            <boxGeometry args={[0.038, 0.028, 0.005]} />
            <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.5} />
          </mesh>
          {/* LED 快充指示灯 */}
          <mesh position={[0.013, 0.011, 0.0442]}>
            <circleGeometry args={[0.0016, 10]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.1} />
          </mesh>
          {/* USB-C 输出头尾翼 */}
          <RoundedBox
            args={[0.011, 0.0068, 0.014]}
            radius={0.0018}
            smoothness={2}
            position={[0, 0, 0.048]}
          >
            <meshStandardMaterial color="#1f252e" roughness={0.52} />
          </RoundedBox>
        </>
      ) : plugType === 'appleDuckhead' ? (
        <>
          {/* Apple 方形电源适配器（62 × 62 × 28 mm 纯白高光外壳 + 标志性转角槽） */}
          <RoundedBox
            args={[0.058, 0.058, 0.028]}
            radius={0.006}
            smoothness={3}
            position={[0, 0, 0.014]}
            castShadow
          >
            <meshStandardMaterial color="#f8fafc" roughness={0.22} metalness={0.04} />
          </RoundedBox>
          {/* 鸭嘴插脚接合缝 */}
          <mesh position={[0, 0, 0.009]}>
            <boxGeometry args={[0.0584, 0.0584, 0.0012]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
          </mesh>
          {/* Type-C 输出尾壳 */}
          <RoundedBox
            args={[0.012, 0.007, 0.012]}
            radius={0.002}
            smoothness={2}
            position={[0, 0, 0.032]}
          >
            <meshStandardMaterial color="#f1f5f9" roughness={0.32} />
          </RoundedBox>
        </>
      ) : plugType === 'cn3Pin' ? (
        <>
          {/* 国标 10A 三孔大功率插头（36 × 32 × 24 mm 菱弧护壳） */}
          <RoundedBox
            args={[0.036, 0.032, 0.022]}
            radius={0.0045}
            smoothness={2}
            position={[0, 0, 0.011]}
            castShadow
          >
            <meshStandardMaterial color="#1e222b" roughness={0.55} />
          </RoundedBox>
          {/* 指捏防滑裙边 */}
          <RoundedBox
            args={[0.041, 0.036, 0.005]}
            radius={0.002}
            smoothness={2}
            position={[0, 0, 0.003]}
          >
            <meshStandardMaterial color="#2d3340" roughness={0.52} />
          </RoundedBox>
          <mesh position={[0, 0, 0.029]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[bootR * 1.1, bootR * 1.5, 0.016, 12]} />
            <meshStandardMaterial color="#181b22" roughness={0.62} />
          </mesh>
        </>
      ) : plugType === 'cn2Pin' ? (
        <>
          {/* 国标扁平两孔插头（30 × 17 × 22 mm） */}
          <RoundedBox
            args={[0.03, 0.017, 0.02]}
            radius={0.0038}
            smoothness={2}
            position={[0, 0, 0.01]}
            castShadow
          >
            <meshStandardMaterial color="#f1f5f9" roughness={0.42} />
          </RoundedBox>
          <mesh position={[0, 0, 0.026]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[bootR * 0.95, bootR * 1.3, 0.014, 12]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.48} />
          </mesh>
        </>
      ) : plugType === 'rightAngle' ? (
        <>
          {/* 90° 超薄贴墙弯头插头（仅突出 11 mm，侧向出线） */}
          <RoundedBox
            args={[0.036, 0.034, 0.011]}
            radius={0.0032}
            smoothness={2}
            position={[0, 0, 0.0055]}
            castShadow
          >
            <meshStandardMaterial color="#f4f6f8" roughness={0.4} />
          </RoundedBox>
          {/* 侧向折弯网尾 */}
          <mesh position={[0, -0.022, 0.006]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[bootR * 1.15, bootR * 0.95, 0.014, 10]} />
            <meshStandardMaterial color="#dfe4eb" roughness={0.5} />
          </mesh>
        </>
      ) : (
        <>
          {kind === 'dp' && (
            <>
              {/* 镀金/镍金属插入端 */}
              <mesh position={[0, 0, 0.002]}>
                <boxGeometry args={[0.016, 0.006, 0.006]} />
                <meshStandardMaterial color="#b4bcc6" metalness={0.85} roughness={0.25} />
              </mesh>
              {/* DP 护套外壳（20 × 11 × 26 mm） */}
              <RoundedBox
                args={[0.02, 0.011, 0.026]}
                radius={0.002}
                smoothness={2}
                position={[0, 0, 0.016]}
                castShadow
              >
                <meshStandardMaterial color="#20252e" roughness={0.5} />
              </RoundedBox>
              {/* 顶部按压式锁扣释放键 */}
              <mesh position={[0, 0.0062, 0.013]}>
                <boxGeometry args={[0.008, 0.0026, 0.01]} />
                <meshStandardMaterial color="#384150" roughness={0.45} />
              </mesh>
              {/* 尾部阶梯抗折弯护套 */}
              <mesh position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR, bootR * 1.35, 0.014, 12]} />
                <meshStandardMaterial color="#1a1f27" roughness={0.6} />
              </mesh>
            </>
          )}

          {kind === 'hdmi' && (
            <>
              <mesh position={[0, 0, 0.002]}>
                <boxGeometry args={[0.014, 0.005, 0.006]} />
                <meshStandardMaterial color="#c9a85c" metalness={0.85} roughness={0.25} />
              </mesh>
              {/* HDMI 梯形倒角护壳（19.5 × 10 × 23 mm） */}
              <RoundedBox
                args={[0.0195, 0.01, 0.023]}
                radius={0.0022}
                smoothness={2}
                position={[0, 0, 0.0145]}
                castShadow
              >
                <meshStandardMaterial color="#1d2430" roughness={0.48} metalness={0.15} />
              </RoundedBox>
              {/* 防滑凹槽握持环 */}
              <mesh position={[0, 0, 0.016]}>
                <boxGeometry args={[0.0205, 0.006, 0.008]} />
                <meshStandardMaterial color="#323b4a" roughness={0.55} />
              </mesh>
              <mesh position={[0, 0, 0.031]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR, bootR * 1.35, 0.013, 12]} />
                <meshStandardMaterial color="#191e27" roughness={0.6} />
              </mesh>
            </>
          )}

          {kind === 'usbc' && (
            <>
              <mesh position={[0, 0, 0.0015]}>
                <boxGeometry args={[0.0084, 0.0026, 0.004]} />
                <meshStandardMaterial color="#c5ccd4" metalness={0.85} roughness={0.25} />
              </mesh>
              {/* 纤薄铝合金/圆润胶套（12.4 × 6.5 × 18 mm） */}
              <RoundedBox
                args={[0.0124, 0.0065, 0.018]}
                radius={0.0028}
                smoothness={2}
                position={[0, 0, 0.0115]}
                castShadow
              >
                <meshStandardMaterial color="#353d49" metalness={0.45} roughness={0.38} />
              </RoundedBox>
              <mesh position={[0, 0, 0.024]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR, bootR * 1.28, 0.009, 10]} />
                <meshStandardMaterial color="#272d37" roughness={0.58} />
              </mesh>
            </>
          )}

          {kind === 'magsafe' && (
            <>
              {/* 5 触点镀金磁吸贴合面 */}
              <mesh position={[0, 0, 0.001]}>
                <boxGeometry args={[0.0115, 0.0032, 0.0025]} />
                <meshStandardMaterial color="#d4b36a" metalness={0.85} roughness={0.25} />
              </mesh>
              {/* 苹果原装铝合金超薄矩形磁吸头（16.5 × 4.6 × 13 mm） */}
              <RoundedBox
                args={[0.0165, 0.0046, 0.013]}
                radius={0.0018}
                smoothness={2}
                position={[0, 0, 0.008]}
                castShadow
              >
                <meshStandardMaterial color="#d6dade" metalness={0.76} roughness={0.28} />
              </RoundedBox>
              {/* 充电状态琥珀/绿色指示灯微孔 */}
              <mesh position={[0, 0.0024, 0.0075]}>
                <cylinderGeometry args={[0.0009, 0.0009, 0.0004, 10]} />
                <meshBasicMaterial color="#f59e0b" />
              </mesh>
              {/* 短编织线应力消除套 */}
              <mesh position={[0, 0, 0.019]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR * 1.1, bootR * 1.4, 0.011, 10]} />
                <meshStandardMaterial color={cableColor} roughness={0.75} />
              </mesh>
            </>
          )}

          {kind === 'rj45' && (
            <>
              {/* 水晶头前端 8 根镀金铜片 */}
              <mesh position={[0, 0.0015, 0.003]}>
                <boxGeometry args={[0.0085, 0.002, 0.005]} />
                <meshStandardMaterial color="#e0b84c" metalness={0.9} roughness={0.2} />
              </mesh>
              {/* 透明聚碳酸酯 8P8C 水晶头主体（11.7 × 8.3 × 16 mm） */}
              <RoundedBox
                args={[0.0117, 0.0083, 0.016]}
                radius={0.0015}
                smoothness={2}
                position={[0, 0, 0.01]}
                castShadow
              >
                <meshStandardMaterial
                  color="#dbeafe"
                  transparent
                  opacity={0.78}
                  roughness={0.18}
                  metalness={0.08}
                />
              </RoundedBox>
              {/* 顶部弹性卡扣弹片 */}
              <mesh position={[0, 0.0056, 0.012]} rotation={[0.24, 0, 0]}>
                <boxGeometry args={[0.005, 0.0016, 0.013]} />
                <meshStandardMaterial color="#e2e8f0" transparent opacity={0.82} roughness={0.22} />
              </mesh>
              {/* 尾部防折断护套（Snagless rubber boot） */}
              <mesh position={[0, 0, 0.026]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[bootR * 1.15, 0.0058, 0.018, 12]} />
                <meshStandardMaterial color={cableColor} roughness={0.62} />
              </mesh>
            </>
          )}

          {kind === 'speakerWire' && (
            <>
              {/* 红/黑镀金香蕉插头并排端子 + Y 型分线汇总护套 */}
              {([-0.0065, 0.0065] as const).map((dx, idx) => (
                <group key={dx} position={[dx, 0, 0]}>
                  <mesh position={[0, 0, 0.002]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.002, 0.002, 0.004, 10]} />
                    <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.22} />
                  </mesh>
                  <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.0033, 0.0037, 0.016, 12]} />
                    <meshStandardMaterial
                      color={idx === 0 ? '#dc2626' : '#18181b'}
                      metalness={0.35}
                      roughness={0.38}
                    />
                  </mesh>
                  {/* 内收双股分支导线汇聚至中心线身 */}
                  <mesh
                    position={[-dx * 0.45, 0, 0.0235]}
                    rotation={[Math.PI / 2, 0, idx === 0 ? -0.45 : 0.45]}
                  >
                    <cylinderGeometry args={[0.0017, 0.0021, 0.011, 10]} />
                    <meshStandardMaterial color={cableColor} roughness={0.62} />
                  </mesh>
                </group>
              ))}
              {/* 中心并线分线套环 */}
              <RoundedBox
                args={[0.0085, 0.0052, 0.008]}
                radius={0.002}
                smoothness={2}
                position={[0, 0, 0.029]}
              >
                <meshStandardMaterial color="#272d37" roughness={0.55} />
              </RoundedBox>
            </>
          )}

          {kind === 'aux35' && (
            <>
              {/* 3.5mm TRS 镀金针头 + 滚花铝合金外壳 */}
              <mesh position={[0, 0, 0.0015]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0016, 0.0016, 0.003, 10]} />
                <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.22} />
              </mesh>
              <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.0036, 0.0038, 0.018, 12]} />
                <meshStandardMaterial color="#384152" metalness={0.62} roughness={0.32} />
              </mesh>
              <mesh position={[0, 0, 0.0235]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR * 1.05, bootR * 1.28, 0.008, 10]} />
                <meshStandardMaterial color="#1e242d" roughness={0.6} />
              </mesh>
            </>
          )}

          {kind === 'rca' && (
            <>
              {/* 红/白双莲花 RCA 同轴插头 + Y 型分线器 */}
              {([-0.006, 0.006] as const).map((dx, idx) => (
                <group key={dx} position={[dx, 0, 0]}>
                  <mesh position={[0, 0, 0.002]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.0032, 0.0032, 0.004, 12]} />
                    <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.22} />
                  </mesh>
                  <mesh position={[0, 0, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.0046, 0.0048, 0.02, 12]} />
                    <meshStandardMaterial color="#1f242d" metalness={0.48} roughness={0.35} />
                  </mesh>
                  {/* 红/白色标识别环 */}
                  <mesh position={[0, 0, 0.0175]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.0048, 0.0048, 0.0045, 12]} />
                    <meshStandardMaterial
                      color={idx === 0 ? '#dc2626' : '#f1f5f9'}
                      roughness={0.38}
                    />
                  </mesh>
                  {/* 双股内收支线 */}
                  <mesh
                    position={[-dx * 0.48, 0, 0.0275]}
                    rotation={[Math.PI / 2, 0, idx === 0 ? -0.4 : 0.4]}
                  >
                    <cylinderGeometry args={[0.0018, 0.0022, 0.011, 10]} />
                    <meshStandardMaterial color={cableColor} roughness={0.6} />
                  </mesh>
                </group>
              ))}
              <RoundedBox
                args={[0.009, 0.0056, 0.0085]}
                radius={0.002}
                smoothness={2}
                position={[0, 0, 0.034]}
              >
                <meshStandardMaterial color="#242934" roughness={0.55} />
              </RoundedBox>
            </>
          )}

          {kind === 'optical' && (
            <>
              {/* TOSLINK 光纤方口塑料保护端与光纤护套 */}
              <RoundedBox
                args={[0.0076, 0.0076, 0.004]}
                radius={0.001}
                smoothness={2}
                position={[0, 0, 0.002]}
              >
                <meshStandardMaterial color="#cbd5e1" roughness={0.35} />
              </RoundedBox>
              <RoundedBox
                args={[0.011, 0.0105, 0.02]}
                radius={0.002}
                smoothness={2}
                position={[0, 0, 0.013]}
                castShadow
              >
                <meshStandardMaterial color="#27243b" metalness={0.38} roughness={0.38} />
              </RoundedBox>
              {/* 光纤激光微标装饰环 */}
              <mesh position={[0, 0, 0.018]}>
                <boxGeometry args={[0.0114, 0.0109, 0.0032]} />
                <meshStandardMaterial color="#9333ea" metalness={0.25} roughness={0.4} />
              </mesh>
              <mesh position={[0, 0, 0.027]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR, bootR * 1.32, 0.011, 10]} />
                <meshStandardMaterial color="#1d1b2b" roughness={0.58} />
              </mesh>
            </>
          )}

          {kind === 'trs635' && (
            <>
              {/* 6.35mm 专业平衡 TRS 金属大三芯插头 */}
              <mesh position={[0, 0, 0.0025]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0031, 0.0031, 0.005, 12]} />
                <meshStandardMaterial color="#c8cfd8" metalness={0.9} roughness={0.22} />
              </mesh>
              <mesh position={[0, 0, 0.019]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.0062, 0.0065, 0.028, 14]} />
                <meshStandardMaterial color="#20252f" metalness={0.62} roughness={0.32} />
              </mesh>
              <mesh position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR * 1.15, 0.0054, 0.014, 12]} />
                <meshStandardMaterial color="#181b22" roughness={0.6} />
              </mesh>
            </>
          )}

          {(activePowerPlug === 'iecC13' || (kind === 'power' && !plugType)) && (
            <>
              {/* IEC C13 三孔品字尾重型注塑外壳（27 × 19 × 30 mm） */}
              <RoundedBox
                args={[0.027, 0.019, 0.03]}
                radius={0.0032}
                smoothness={2}
                position={[0, 0, 0.016]}
                castShadow
              >
                <meshStandardMaterial color="#17191f" roughness={0.62} />
              </RoundedBox>
              {/* 前端加强护圈 */}
              <mesh position={[0, 0, 0.003]}>
                <boxGeometry args={[0.023, 0.0155, 0.005]} />
                <meshStandardMaterial color="#272b34" roughness={0.55} />
              </mesh>
              {/* 尾部防折网尾护套 */}
              <mesh position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[bootR * 1.15, bootR * 1.55, 0.016, 12]} />
                <meshStandardMaterial color="#181a20" roughness={0.65} />
              </mesh>
            </>
          )}
        </>
      )}
    </group>
  );
}

function inferEndpointPlugType(
  ep: Cable['from'] | Cable['to'],
  cableKind: Cable['kind'],
  explicit: PlugSpecKind | undefined,
  project: Project,
): PlugSpecKind | undefined {
  if (explicit) return explicit;
  if (ep.type !== 'device') return undefined;
  const target = project.items.find((i) => i.id === ep.itemId);
  if (!target) return undefined;
  const isOutlet = target.kind === 'powerStrip' || target.kind === 'wallOutlet';
  if (isOutlet && ep.portId.startsWith('slot-')) {
    if (cableKind === 'power') return 'cn3Pin';
    if (cableKind === 'usbc') return 'ganAdapter';
    if (cableKind === 'magsafe') return 'appleDuckhead';
  }
  return undefined;
}

function CableNodeHandles({
  cable,
  controlPoints,
  holes,
  project,
}: {
  cable: Cable;
  controlPoints: Vector3[];
  holes: CableHole[];
  project: Project;
}) {
  const { camera, gl, invalidate, controls } = useThree();
  const orbit = controls as unknown as OrbitControlsImpl | null;
  const selectedIdx = useEditor((s) => s.selectedWaypointIdx);
  const spec = cableMeta[cable.kind];
  const fallbackList: CableWaypoint[] = useMemo(
    () => controlPoints.map((v) => ({ x: v.x, y: v.y, z: v.z })),
    [controlPoints],
  );
  const solids = useMemo(() => getSceneSolidBoxes(project), [project]);
  const allowedIds = useMemo(() => {
    const s = new Set<string>();
    if (cable.from.type === 'device') s.add(cable.from.itemId);
    if (cable.to.type === 'device') s.add(cable.to.itemId);
    return s;
  }, [cable.from, cable.to]);

  function startNodeDrag(e: ThreeEvent<PointerEvent>, idx: number, axis: 'xz' | 'y') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const store = useEditor.getState();
    store.selectCable(cable.id, idx);
    store.beginGesture();

    const startPt = controlPoints[idx].clone();
    const canvas = gl.domElement;
    const pointer = e.pointerId;
    const verticalMode = axis === 'y' || e.shiftKey;

    let plane: Plane;
    if (verticalMode) {
      const camDir = new Vector3();
      camera.getWorldDirection(camDir);
      camDir.y = 0;
      if (camDir.lengthSq() < 1e-4) camDir.set(0, 0, 1);
      camDir.normalize();
      plane = new Plane().setFromNormalAndCoplanarPoint(camDir, startPt);
    } else {
      plane = new Plane(new Vector3(0, 1, 0), -startPt.y);
    }

    const hit = new Vector3();
    if (!e.ray.intersectPlane(plane, hit)) {
      store.endGesture();
      return;
    }
    const offset = startPt.clone().sub(hit);
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let done = false;

    if (orbit) orbit.enabled = false;
    try {
      canvas.setPointerCapture(pointer);
    } catch {
      /* capture optional */
    }

    function move(ev: PointerEvent) {
      if (ev.pointerId !== pointer) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        (-(ev.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;

      const raw = hit.clone().add(offset);
      const nextPt = verticalMode
        ? new Vector3(startPt.x, Math.max(spec.radius + 0.004, Math.min(2.4, raw.y)), startPt.z)
        : new Vector3(
            Math.max(-4.5, Math.min(4.5, raw.x)),
            startPt.y,
            Math.max(-4.5, Math.min(4.5, raw.z)),
          );

      // Soft snap to hole centers when near pass-through holes
      for (const h of holes) {
        const snapD =
          h.kind === 'grommet'
            ? Math.hypot(nextPt.x - h.center.x, nextPt.z - h.center.z)
            : nextPt.distanceTo(h.center);
        if (snapD < h.radius + 0.02 && Math.abs(nextPt.y - h.center.y) < 0.08) {
          nextPt.x = h.center.x;
          if (h.kind === 'grommet') nextPt.z = h.center.z;
          break;
        }
      }

      const cleared = projectCablePointClear(nextPt, spec.radius, solids, holes, allowedIds);
      const inHole = findContainingHole(cleared.point, spec.radius, holes);
      useEditor
        .getState()
        .setCollisionNotice(
          inHole ? `穿孔过线：${inHole.label}` : cleared.adjusted ? '已防穿模贴合实体边缘' : null,
        );
      useEditor
        .getState()
        .updateCableWaypoint(
          cable.id,
          idx,
          { x: cleared.point.x, y: cleared.point.y, z: cleared.point.z },
          fallbackList,
        );
      invalidate();
    }

    function finish() {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try {
        if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
      } catch {
        /* ignore */
      }
      if (orbit) orbit.enabled = true;
      useEditor.getState().endGesture();
      useEditor.getState().setCollisionNotice(null);
      invalidate();
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  return (
    <group name={`cable-handles-${cable.id}`}>
      {controlPoints.map((pt, idx) => {
        const active = selectedIdx === idx;
        const insideHole = Boolean(findContainingHole(pt, spec.radius, holes));
        return (
          <group key={idx} position={pt}>
            <mesh
              onPointerDown={(e) => startNodeDrag(e, idx, 'xz')}
              onPointerOver={(e) => {
                e.stopPropagation();
                gl.domElement.style.cursor = 'grab';
              }}
              onPointerOut={() => {
                gl.domElement.style.cursor = 'auto';
              }}
            >
              <sphereGeometry args={[active ? 0.014 : 0.011, 16, 16]} />
              <meshStandardMaterial
                color={insideHole ? '#10b981' : active ? '#2563eb' : '#38bdf8'}
                emissive={insideHole ? '#10b981' : active ? '#2563eb' : '#0284c7'}
                emissiveIntensity={active ? 1.2 : 0.65}
                roughness={0.25}
              />
            </mesh>
            {active && (
              <group
                position={[0, 0.042, 0]}
                onPointerDown={(e) => startNodeDrag(e, idx, 'y')}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  gl.domElement.style.cursor = 'ns-resize';
                }}
                onPointerOut={() => {
                  gl.domElement.style.cursor = 'auto';
                }}
              >
                <mesh position={[0, -0.016, 0]}>
                  <cylinderGeometry args={[0.002, 0.002, 0.032, 8]} />
                  <meshStandardMaterial
                    color="#f59e0b"
                    emissive="#f59e0b"
                    emissiveIntensity={0.8}
                  />
                </mesh>
                <mesh position={[0, 0.004, 0]}>
                  <coneGeometry args={[0.007, 0.016, 12]} />
                  <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* Midpoint click-to-insert handles between consecutive nodes */}
      {controlPoints.slice(0, -1).map((pt, idx) => {
        const nextPt = controlPoints[idx + 1];
        if (pt.distanceTo(nextPt) < 0.06) return null;
        const mid = new Vector3().lerpVectors(pt, nextPt, 0.5);
        return (
          <mesh
            key={`mid-${idx}`}
            position={mid}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              useEditor
                .getState()
                .insertCableWaypoint(cable.id, idx, { x: mid.x, y: mid.y, z: mid.z }, fallbackList);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              gl.domElement.style.cursor = 'copy';
            }}
            onPointerOut={() => {
              gl.domElement.style.cursor = 'auto';
            }}
          >
            <sphereGeometry args={[0.007, 12, 12]} />
            <meshStandardMaterial
              color="#7dd3fc"
              emissive="#38bdf8"
              emissiveIntensity={0.5}
              transparent
              opacity={0.78}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function CableMesh({
  cable,
  project,
  holes,
}: {
  cable: Cable;
  project: Project;
  holes: CableHole[];
}) {
  const selectedCableId = useEditor((s) => s.selectedCableId);
  const { gl, controls, invalidate } = useThree();
  const orbit = controls as unknown as OrbitControlsImpl | null;
  const isSelected = selectedCableId === cable.id;
  const resolved = useMemo(() => computeCablePath(cable, project), [cable, project]);
  const fromPlugType = inferEndpointPlugType(cable.from, cable.kind, cable.fromPlugType, project);
  const toPlugType = inferEndpointPlugType(cable.to, cable.kind, cable.toPlugType, project);
  const geometry = useMemo(() => {
    if (!resolved || resolved.points.length < 2) return null;
    // Deduplicate adjacent identical points so CatmullRomCurve3 never gets zero-length segments.
    const clean: Vector3[] = [];
    for (const pt of resolved.points) {
      if (clean.length === 0 || clean[clean.length - 1].distanceTo(pt) > 0.002) {
        clean.push(pt);
      }
    }
    if (clean.length < 2) return null;
    const curve = new CatmullRomCurve3(clean, false, 'catmullrom', 0.35);
    return new TubeGeometry(
      curve,
      Math.max(24, clean.length * 10),
      cableMeta[cable.kind].radius,
      8,
      false,
    );
  }, [resolved, cable.kind]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!resolved || !geometry) return null;

  return (
    <group>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          if (e.button !== 2) return;
          e.stopPropagation();
          pauseOrbitUntilPointerUp(orbit, invalidate);
          useEditor.getState().selectCable(cable.id);
        }}
        onPointerOver={(e) => {
          if (!isSelected) return;
          e.stopPropagation();
          gl.domElement.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          color={cable.color}
          emissive={isSelected ? '#2563eb' : '#000000'}
          emissiveIntensity={isSelected ? 0.55 : 0}
          roughness={cable.kind === 'magsafe' ? 0.84 : 0.58}
          metalness={cable.kind === 'magsafe' ? 0.04 : 0.12}
        />
      </mesh>
      {resolved.fromPlug && (
        <PlugConnector
          position={resolved.fromPlug.position}
          direction={resolved.fromPlug.direction}
          kind={cable.kind}
          plugType={fromPlugType}
          cableColor={cable.color}
        />
      )}
      {resolved.toPlug && (
        <PlugConnector
          position={resolved.toPlug.position}
          direction={resolved.toPlug.direction}
          kind={cable.kind}
          plugType={toPlugType}
          cableColor={cable.color}
        />
      )}
      {isSelected && (
        <CableNodeHandles
          cable={cable}
          controlPoints={resolved.controlPoints}
          holes={holes}
          project={project}
        />
      )}
    </group>
  );
}

function PortWiringOverlay({ project, holes }: { project: Project; holes: CableHole[] }) {
  const wiringMode = useEditor((s) => s.wiringMode);
  const wiringDraft = useEditor((s) => s.wiringDraft);
  const wiringPreset = useEditor((s) => s.wiringPreset);
  const selectedCableId = useEditor((s) => s.selectedCableId);
  const { gl } = useThree();
  const [hoveredPortKey, setHoveredPortKey] = useState<string | null>(null);

  const anchors = useMemo(() => {
    if (!wiringMode) return [];
    const list: {
      key: string;
      itemId: string;
      portId: string;
      kind: Cable['kind'];
      pos: Vector3;
    }[] = [];
    for (const item of project.items) {
      if (!isPortKind(item.kind)) continue;
      for (const p of devicePorts(item)) {
        const w = devicePortWorld(item, p.id, project.desk, project.items);
        if (!w) continue;
        list.push({
          key: `${item.id}:${p.id}`,
          itemId: item.id,
          portId: p.id,
          kind: p.kind,
          pos: w.position.clone().addScaledVector(w.direction, 0.018),
        });
      }
    }
    return list;
  }, [wiringMode, project]);

  if (!wiringMode && !selectedCableId) return null;

  return (
    <group>
      {/* Visual ring markers on physical pass-through holes (grommet & monitor stand slots) */}
      {holes.map((h) => (
        <mesh
          key={h.id}
          position={h.center}
          rotation={h.kind === 'grommet' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
        >
          <torusGeometry args={[h.radius + 0.003, 0.0022, 8, 24]} />
          <meshStandardMaterial
            color="#06b6d4"
            emissive="#06b6d4"
            emissiveIntensity={0.85}
            transparent
            opacity={0.75}
          />
        </mesh>
      ))}

      {/* Clickable 3D port orbs for point-to-point manual wiring */}
      {anchors.map((a) => {
        const isSource = wiringDraft?.itemId === a.itemId && wiringDraft?.portId === a.portId;
        const matchesPreset = !wiringPreset || isPortCompatibleWithCable(a.kind, wiringPreset.kind);
        const isCompatible = wiringDraft
          ? wiringDraft.itemId !== a.itemId &&
            matchesPreset &&
            arePortKindsCompatible(wiringDraft.kind, a.kind)
          : matchesPreset;
        const hovered = hoveredPortKey === a.key;
        return (
          <mesh
            key={a.key}
            position={a.pos}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!isCompatible) return;
              useEditor.getState().pickWiringPort(a.itemId, a.portId, a.kind);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredPortKey(a.key);
              gl.domElement.style.cursor = isCompatible ? 'pointer' : 'not-allowed';
            }}
            onPointerOut={() => {
              setHoveredPortKey(null);
              gl.domElement.style.cursor = 'auto';
            }}
          >
            <sphereGeometry args={[hovered || isSource ? 0.014 : 0.01, 14, 14]} />
            <meshStandardMaterial
              color={isSource ? '#f59e0b' : isCompatible ? '#22c55e' : '#64748b'}
              emissive={isSource ? '#f59e0b' : isCompatible ? '#16a34a' : '#334155'}
              emissiveIntensity={hovered || isSource ? 1.2 : 0.8}
              transparent
              opacity={isCompatible ? 0.95 : 0.35}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function CableSystem({ project }: { project: Project }) {
  const cables = project.cables ?? [];
  const holes = useMemo(() => getSceneCableHoles(project), [project]);
  return (
    <group>
      {cables.map((cable) => (
        <CableMesh key={cable.id} cable={cable} project={project} holes={holes} />
      ))}
      <PortWiringOverlay project={project} holes={holes} />
    </group>
  );
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DirectionalLight, MOUSE, PCFShadowMap, PerspectiveCamera, Vector3 } from 'three';
import { Desk } from './Desk';
import { MonitorArmModel } from './MonitorArmModel';
import { CableSystem } from './CableSystem';
import { SceneItem } from './SceneItem';
import { deskCameraPose, deskOrbitCenter, deskShadowHalfSize } from './deskCamera';
import { useEditor } from '../store/editorStore';
import { applyDragPreview } from '../domain/monitorArm';
import { isMonitorMountedOnArm } from '../domain/laptop';
import { isOutOfBounds } from '../domain/placement';
import { tr, useI18n } from '../i18n';
export type View = { kind: 'perspective' | 'top' | 'front' | 'fit'; nonce: number };
class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-fallback">
        <strong>{tr('三维预览暂时不可用', '3D Preview Unavailable')}</strong>
        <p>
          {tr(
            '请使用支持 WebGL 的浏览器并开启硬件加速。你的布局仍可通过属性面板编辑、导出。',
            'Please enable WebGL hardware acceleration. You can still edit and export your layout via the inspector.',
          )}
        </p>
        <button onClick={() => this.setState({ error: false })}>
          {tr('重试预览', 'Retry Preview')}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function World({ view, onError }: { view: View; onError: (m: string) => void }) {
  const project = useEditor((s) => s.project),
    selected = useEditor((s) => s.selected),
    dragPreview = useEditor((s) => s.dragPreview),
    blobs = useEditor((s) => s.blobs),
    controls = useRef<OrbitControlsImpl>(null),
    keyLight = useRef<DirectionalLight>(null);
  const effectiveItems = useMemo(
    () => applyDragPreview(project.items, dragPreview),
    [project.items, dragPreview],
  );
  const effectiveProject = useMemo(
    () => (dragPreview ? { ...project, items: effectiveItems } : project),
    [project, effectiveItems, dragPreview],
  );
  const { camera, invalidate, gl, size } = useThree();
  const lang = useI18n((s) => s.lang);
  useEffect(() => {
    invalidate();
  }, [lang, invalidate]);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const { desk } = project;
  const dark = project.environment === 'dark';
  const lamps = project.items.filter((i) => i.kind === 'screenLamp');
  // Four spots: 4 shadow + 4 cookie samplers, key shadow + 6 basic PBR
  // samplers (metallic and roughness use separate uniforms, even when packed).
  const lampSupported = gl.capabilities.maxTextures >= 15;
  const hasLamps = lamps.length > 0;
  useEffect(() => {
    if (hasLamps && !lampSupported)
      onError(
        tr(
          '当前设备的纹理采样能力不足，挂灯预览已停用；工程中的挂灯数据仍保留。',
          'Insufficient GPU texture units: light bar preview disabled, but settings are preserved.',
        ),
      );
  }, [hasLamps, lampSupported, onError]);
  const returnSide = desk.return?.side;
  const returnWidth = desk.return?.width;
  const returnExtension = desk.return?.extension;
  // 旋转/平移视角的中心：矩形为几何中心，L 形为真实桌板面积加权中心。
  const center = useMemo(
    () => new Vector3(...deskOrbitCenter(desk)),
    [desk.height, desk.thickness, desk.width, desk.depth, returnSide, returnWidth, returnExtension],
  );
  const shadowHalf = useMemo(
    () => deskShadowHalfSize(desk),
    [desk.width, desk.depth, desk.height, returnSide, returnWidth, returnExtension],
  );
  const shadowFar = useMemo(() => Math.max(16, shadowHalf * 3.5 + 4), [shadowHalf]);
  const [maxDistance, setMaxDistance] = useState(9);
  useEffect(() => {
    const light = keyLight.current;
    if (!light) return;
    light.shadow.camera.left = -shadowHalf;
    light.shadow.camera.right = shadowHalf;
    light.shadow.camera.top = shadowHalf;
    light.shadow.camera.bottom = -shadowHalf;
    light.shadow.camera.near = 1.5;
    light.shadow.camera.far = shadowFar;
    light.shadow.radius = 2.2;
    light.shadow.camera.updateProjectionMatrix();
    invalidate();
  }, [shadowHalf, shadowFar, invalidate]);
  // 拖动视角时显示迷你坐标轴，松开后短暂延迟再隐藏，避免滚轮缩放时闪烁。
  const [interacting, setInteracting] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showGizmo = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setInteracting(true);
  };
  const hideGizmo = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setInteracting(false), 250);
  };
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  // 左键旋转视角，中键与右键平移视角（中键默认是缩放，这里改为平移）。
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };
  }, []);
  useEffect(() => {
    if (!controls.current) return;
    const persp = camera as PerspectiveCamera;
    const aspect =
      persp.aspect ||
      (sizeRef.current.height > 0 ? sizeRef.current.width / sizeRef.current.height : 1);
    const pose = deskCameraPose(desk, view.kind, persp.fov ?? 38, aspect);
    setMaxDistance(pose.maxDistance);
    controls.current.maxDistance = pose.maxDistance;
    camera.up.set(...pose.up);
    camera.position.set(...pose.position);
    controls.current.target.set(...pose.target);
    camera.lookAt(...pose.target);
    controls.current.update();
    invalidate();
  }, [
    view.nonce,
    view.kind,
    desk.width,
    desk.depth,
    desk.height,
    desk.thickness,
    returnSide,
    returnWidth,
    returnExtension,
    center,
    camera,
    invalidate,
  ]);
  return (
    <>
      <color attach="background" args={[dark ? '#101923' : '#e4eaf1']} />
      <ambientLight intensity={dark ? 0.08 : 0.45} />
      <hemisphereLight args={['#f8fafc', '#9aa6b4', dark ? 0.12 : 0.85]} />
      <directionalLight
        ref={keyLight}
        position={[-2.5, 5, 3]}
        color="#fffcf5"
        intensity={dark ? 0.16 : 2.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
        shadow-camera-near={1.5}
        shadow-camera-far={shadowFar}
        shadow-radius={2.2}
        shadow-bias={-0.00025}
        shadow-normalBias={0.004}
      />
      <directionalLight
        position={[3.2, 2.5, -2.2]}
        color="#e4eeff"
        intensity={dark ? 0.05 : 0.65}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={dark ? '#26303b' : '#e4eaf1'} roughness={1} />
      </mesh>
      <Grid
        position={[0, -0.004, 0]}
        args={[12, 12]}
        cellSize={0.1}
        sectionSize={1}
        cellColor={dark ? '#202b38' : '#bdc9d5'}
        sectionColor={dark ? '#334151' : '#aebdcc'}
        cellThickness={0.4}
        sectionThickness={0.7}
        fadeDistance={7}
        fadeStrength={2}
        infiniteGrid
      />
      <Desk desk={desk} />
      {effectiveItems
        .filter((item) => item.kind === 'monitorArm' && item.monitorArm)
        .map((arm) => (
          <MonitorArmModel
            key={arm.id}
            arm={arm}
            allItems={effectiveItems}
            desk={desk}
            selected={selected === arm.id}
            activeDragId={dragPreview?.id}
            activeElbowRole={
              dragPreview?.kind === 'armElbow' && dragPreview.id === arm.id
                ? dragPreview.role
                : undefined
            }
            activeLowerPitchRole={
              dragPreview?.kind === 'armLowerPitch' && dragPreview.id === arm.id
                ? dragPreview.role
                : undefined
            }
            activeUpperPitchRole={
              dragPreview?.kind === 'armUpperPitch' && dragPreview.id === arm.id
                ? dragPreview.role
                : undefined
            }
            dragClamped={Boolean(
              dragPreview &&
              dragPreview.kind !== 'rotation' &&
              dragPreview.kind !== 'pose' &&
              dragPreview.limitReason,
            )}
            controls={controls}
            onError={onError}
          />
        ))}
      <CableSystem project={effectiveProject} />
      <group position={[0, desk.height, 0]}>
        {effectiveItems
          .filter((item) => item.kind !== 'screenLamp' && item.kind !== 'monitorArm')
          .map((item) => (
            <SceneItem
              key={item.id}
              item={item}
              selected={selected === item.id}
              screenLamp={
                lampSupported ? lamps.find((l) => l.lamp?.monitorId === item.id) : undefined
              }
              lampSelected={lamps.some((l) => l.id === selected && l.lamp?.monitorId === item.id)}
              hasMonitorArm={isMonitorMountedOnArm(item.id, effectiveItems)}
              outside={isOutOfBounds(item, desk, effectiveItems)}
              desk={desk}
              allItems={effectiveItems}
              controls={controls}
              asset={project.assets.find((a) => a.id === item.assetId)}
              blob={item.assetId ? blobs.get(item.assetId) : undefined}
              onError={onError}
            />
          ))}
      </group>
      <OrbitControls
        ref={controls}
        makeDefault
        minDistance={0.35}
        maxDistance={maxDistance}
        maxPolarAngle={Math.PI - 0.04}
        enableDamping={false}
        target={center}
        onStart={showGizmo}
        onEnd={hideGizmo}
      />
      {interacting && (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport disabled labels={['Y', 'Z', 'X']} />
        </GizmoHelper>
      )}
    </>
  );
}
export default function DeskScene({ view, onError }: { view: View; onError: (m: string) => void }) {
  const lang = useI18n((s) => s.lang);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  return (
    <SceneBoundary>
      <Canvas
        shadows={{ type: PCFShadowMap }}
        gl={{ toneMappingExposure: 1 }}
        dpr={[1, 1.6]}
        frameloop="demand"
        camera={{ position: [2, 2.1, 2.5], fov: 38, near: 0.01, far: 100 }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          downPos.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMissed={(e) => {
          const d = downPos.current;
          const dist = d ? Math.hypot(e.clientX - d.x, e.clientY - d.y) : 0;
          if (e.button === 0 && dist <= 5) useEditor.getState().select(null);
        }}
        fallback={
          <div className="scene-fallback">
            {tr(
              '浏览器不支持 WebGL。请开启硬件加速后重试。',
              'WebGL is not supported. Please enable hardware acceleration and retry.',
              lang,
            )}
          </div>
        }
      >
        <World view={view} onError={onError} />
      </Canvas>
    </SceneBoundary>
  );
}

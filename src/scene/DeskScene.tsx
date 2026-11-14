import { Component, useEffect, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Vector3 } from 'three';
import { Desk } from './Desk';
import { SceneItem } from './SceneItem';
import { useEditor } from '../store/editorStore';
import { isOutOfBounds } from '../domain/placement';
export type View = { kind: 'perspective' | 'top' | 'front' | 'fit'; nonce: number };
class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-fallback">
        <strong>三维预览暂时不可用</strong>
        <p>请使用支持 WebGL 的浏览器并开启硬件加速。你的布局仍可通过属性面板编辑、导出。</p>
        <button onClick={() => this.setState({ error: false })}>重试预览</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function World({ view, onError }: { view: View; onError: (m: string) => void }) {
  const project = useEditor((s) => s.project),
    selected = useEditor((s) => s.selected),
    blobs = useEditor((s) => s.blobs),
    controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const { desk } = project;
  useEffect(() => {
    if (!controls.current) return;
    const target = new Vector3(0, desk.height * 0.65, 0);
    const dist = Math.max(desk.width, desk.depth) * 1.5;
    camera.up.set(0, 1, 0);
    if (view.kind === 'top') {
      target.set(0, desk.height, 0);
      camera.position.set(0, desk.height + dist, 0.001);
      camera.up.set(0, 0, -1);
    } else if (view.kind === 'front') {
      target.set(0, desk.height * 0.7, 0);
      camera.position.set(0, desk.height * 0.7, dist);
    } else camera.position.set(dist * 0.85, desk.height + dist * 0.68, dist * 0.92);
    controls.current.target.copy(target);
    camera.lookAt(target);
    controls.current.update();
    invalidate();
  }, [view.nonce, desk.width, desk.depth]);
  return (
    <>
      <color attach="background" args={['#e4eaf1']} />
      <ambientLight intensity={1.25} />
      <hemisphereLight args={['#ffffff', '#91a0ac', 1.2]} />
      <directionalLight
        position={[-2.5, 5, 3]}
        intensity={3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0002}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[3, 2, -2]} intensity={0.8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#e4eaf1" roughness={1} />
      </mesh>
      <Grid
        position={[0, -0.004, 0]}
        args={[12, 12]}
        cellSize={0.1}
        sectionSize={1}
        cellColor="#bdc9d5"
        sectionColor="#aebdcc"
        cellThickness={0.4}
        sectionThickness={0.7}
        fadeDistance={7}
        fadeStrength={2}
        infiniteGrid
      />
      <Desk desk={desk} />
      <group position={[0, desk.height, 0]}>
        {project.items.map((item) => (
          <SceneItem
            key={item.id}
            item={item}
            selected={selected === item.id}
            outside={isOutOfBounds(item, desk)}
            deskHeight={desk.height}
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
        minDistance={0.45}
        maxDistance={9}
        maxPolarAngle={Math.PI / 2 - 0.015}
        enableDamping={false}
        target={[0, desk.height * 0.65, 0]}
      />
    </>
  );
}
export default function DeskScene({ view, onError }: { view: View; onError: (m: string) => void }) {
  return (
    <SceneBoundary>
      <Canvas
        shadows
        dpr={[1, 1.6]}
        frameloop="demand"
        camera={{ position: [2, 2.1, 2.5], fov: 38, near: 0.01, far: 100 }}
        onPointerMissed={() => useEditor.getState().select(null)}
        fallback={<div className="scene-fallback">浏览器不支持 WebGL。请开启硬件加速后重试。</div>}
      >
        <World view={view} onError={onError} />
      </Canvas>
    </SceneBoundary>
  );
}

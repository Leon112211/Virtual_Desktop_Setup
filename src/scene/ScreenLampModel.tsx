// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Quaternion, SpotLight, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { SceneItem } from '../domain/project';
import { useEditor } from '../store/editorStore';
import { pauseOrbitUntilPointerUp } from './orbitPause';
import {
  createScreenLampCookie,
  SCREEN_LAMP_DISTANCE,
  screenLampBasis,
  screenLampColor,
  screenLampConeAngle,
  screenLampGuideVertices,
  screenLampSampleIntensity,
  screenLampSamplePositions,
} from './screenLampLighting';

type LampSettings = NonNullable<SceneItem['lamp']>;
type LampRig = {
  lights: [SpotLight, SpotLight];
  localUp: Vector3;
};

function LampLights({ length, settings }: { length: number; settings: LampSettings }) {
  const mount = useRef<Group>(null);
  const rig = useRef<LampRig | null>(null);
  const { invalidate } = useThree();
  const scratch = useMemo(() => ({ rotation: new Quaternion(), up: new Vector3() }), []);

  // Allocate owned GPU resources only after commit. StrictMode's setup/cleanup/
  // setup therefore creates fresh lights rather than reusing disposed shadows.
  useLayoutEffect(() => {
    const group = mount.current!;
    const lights: [SpotLight, SpotLight] = [new SpotLight(), new SpotLight()];
    for (const light of lights) {
      light.name = '屏幕挂灯照明采样';
      light.castShadow = true; // The cookie also depends on the shadow projection path.
      light.decay = 2;
      light.distance = SCREEN_LAMP_DISTANCE;
      light.penumbra = 0.02;
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.01;
      light.shadow.camera.far = SCREEN_LAMP_DISTANCE;
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias = -0.00005;
      light.shadow.normalBias = 0.001;
      group.add(light, light.target);
    }
    rig.current = { lights, localUp: new Vector3(0, 0, 1) };
    invalidate();
    return () => {
      rig.current = null;
      for (const light of lights) {
        group.remove(light, light.target);
        light.dispose(); // Includes its private shadow maps, never shared model resources.
      }
      invalidate();
    };
  }, [invalidate]);

  // One cookie per lamp, shared by both samples. Do not rebuild it for brightness,
  // colour, tilt, monitor motion, selection, or lamp-length changes.
  useLayoutEffect(() => {
    const lights = rig.current!.lights;
    const cookie = createScreenLampCookie(
      settings.horizontalAngle,
      settings.verticalAngle,
      settings.softness,
    );
    for (const light of lights) light.map = cookie;
    invalidate();
    return () => {
      for (const light of lights) light.map = null;
      cookie.dispose();
    };
  }, [settings.horizontalAngle, settings.verticalAngle, settings.softness, invalidate]);

  useLayoutEffect(() => {
    const current = rig.current!;
    const basis = screenLampBasis(settings.tilt);
    current.localUp.copy(basis.up);
    const positions = screenLampSamplePositions(length);
    const color = screenLampColor(settings.temperature);
    current.lights.forEach((light, i) => {
      light.position.copy(positions[i]);
      light.target.position.copy(positions[i]).add(basis.direction);
      light.color.copy(color);
      light.intensity = screenLampSampleIntensity(settings.brightness);
      light.angle = screenLampConeAngle(settings.horizontalAngle, settings.verticalAngle);
    });
    invalidate();
  }, [
    length,
    settings.tilt,
    settings.temperature,
    settings.brightness,
    settings.horizontalAngle,
    settings.verticalAngle,
    invalidate,
  ]);

  // Runs before the renderer's shadow pass, including frames requested by an
  // imperative monitor drag. Camera.up is a world-space vector: leaving it at
  // world Y would rotate/distort the rectangular cookie in portrait orientation.
  // Never invalidate here: the scene must stay idle under frameloop="demand".
  useFrame(() => {
    const group = mount.current;
    const current = rig.current;
    if (!group || !current) return;
    group.updateWorldMatrix(true, true);
    group.getWorldQuaternion(scratch.rotation);
    scratch.up.copy(current.localUp).applyQuaternion(scratch.rotation);
    for (const light of current.lights) light.shadow.camera.up.copy(scratch.up);
  }, -1);

  return <group ref={mount} />;
}

// Mounted at the monitor panel's top edge. All dimensions are metres; only the
// tube's length varies, never the clip, counterweight, or housing cross-section.
export function ScreenLampModel({ item, selected }: { item: SceneItem; selected: boolean }) {
  const guides = useEditor((state) => state.lampGuides);
  const { gl, controls, invalidate } = useThree();
  const orbit = controls as unknown as OrbitControlsImpl | null;
  const settings = item.lamp;
  const length = item.size.width;
  const color = useMemo(
    () => screenLampColor(settings?.temperature ?? 4000),
    [settings?.temperature],
  );
  const vertices = useMemo(
    () =>
      settings
        ? screenLampGuideVertices(
            length,
            settings.tilt,
            settings.horizontalAngle,
            settings.verticalAngle,
          )
        : new Float32Array(),
    [length, settings?.tilt, settings?.horizontalAngle, settings?.verticalAngle],
  );
  if (!settings) return null;

  function select(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 2) return;
    event.stopPropagation(); // Selecting an attachment must never start its monitor's drag or Orbit pan.
    pauseOrbitUntilPointerUp(orbit, invalidate);
    useEditor.getState().select(item.id);
  }

  return (
    <group
      onPointerDown={select}
      onPointerOver={(event) => {
        event.stopPropagation();
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        gl.domElement.style.cursor = 'auto';
      }}
    >
      {/* Horizontal metal housing and fixed-size end caps, seated on flush mount neck. */}
      <mesh position={[0, 0.021, 0.027]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.009, 0.009, length - 0.008, 20]} />
        <meshStandardMaterial color={item.color} roughness={0.4} metalness={0.65} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (length / 2 - 0.002), 0.021, 0.027]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.0095, 0.0095, 0.004, 20]} />
          <meshStandardMaterial color="#24282c" roughness={0.55} />
        </mesh>
      ))}
      {/* Flush clamp bridge resting directly on top edge (y=0), front bezel grip lip, angled neck, and rear counterweight flush against panel back (z=-0.010). */}
      <mesh position={[0, 0.0035, 0.002]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.007, 0.032]} />
        <meshStandardMaterial color="#34383d" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.013, 0.02]} rotation={[-0.65, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.034, 0.008, 0.022]} />
        <meshStandardMaterial color="#2e3338" roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh position={[0, -0.0025, 0.0145]} castShadow receiveShadow>
        <boxGeometry args={[0.036, 0.013, 0.005]} />
        <meshStandardMaterial color="#25292d" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.008, -0.021]} castShadow receiveShadow>
        <boxGeometry args={[0.044, 0.024, 0.022]} />
        <meshStandardMaterial color={item.color} roughness={0.5} metalness={0.45} />
      </mesh>
      {/* This basic strip only indicates on/off; it is not the illumination. */}
      <group position={[0, 0.021, 0.027]} rotation={[(-settings.tilt * Math.PI) / 180, 0, 0]}>
        <mesh position={[0, -0.0091, 0]}>
          <boxGeometry args={[length - 0.018, 0.0015, 0.005]} />
          <meshBasicMaterial
            color={settings.enabled && settings.brightness > 0 ? color : '#5c6063'}
            toneMapped={false}
          />
        </mesh>
      </group>
      {selected && (
        <group raycast={() => null}>
          <mesh position={[0, 0.021, 0.027]} raycast={() => null}>
            <boxGeometry args={[length + 0.004, 0.023, 0.023]} />
            <meshBasicMaterial
              color="#315ce7"
              wireframe
              transparent
              opacity={0.8}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, -0.003, -0.007]} raycast={() => null}>
            <boxGeometry args={[0.048, 0.034, 0.056]} />
            <meshBasicMaterial
              color="#315ce7"
              wireframe
              transparent
              opacity={0.6}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
      {settings.enabled && settings.brightness > 0 && (
        <LampLights length={length} settings={settings} />
      )}
      {selected && guides && (
        <lineSegments raycast={() => null}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </group>
  );
}

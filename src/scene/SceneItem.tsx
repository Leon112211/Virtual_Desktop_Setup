import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AssetMeta, SceneItem as ItemData } from '../domain/project';
import { BuiltinModel } from './BuiltinModels';
import { MonitorModel } from './MonitorModel';
import { useEditor } from '../store/editorStore';
import { loadCachedModel, modelCache } from '../assets/modelCache';
import type { LoadedModel } from '../assets/importModel';
export function SceneItem({
  item,
  selected,
  outside,
  deskHeight,
  controls,
  asset,
  blob,
  onError,
}: {
  item: ItemData;
  selected: boolean;
  outside: boolean;
  deskHeight: number;
  controls: RefObject<OrbitControlsImpl | null>;
  asset?: AssetMeta;
  blob?: Blob;
  onError: (message: string) => void;
}) {
  const ref = useRef<Group>(null),
    cleanup = useRef<null | (() => void)>(null);
  const { camera, gl, invalidate } = useThree();
  const [model, setModel] = useState<LoadedModel | undefined>(() =>
    item.assetId ? modelCache.get(item.assetId) : undefined,
  );
  useEffect(() => {
    let active = true;
    if (item.kind !== 'imported') return;
    setModel(undefined);
    if (!asset || !blob) return;
    loadCachedModel(asset, blob)
      .then((m) => {
        if (active) {
          setModel(m);
          invalidate();
        }
      })
      .catch((e) => {
        if (active)
          onError(`“${item.name}”无法加载：${e instanceof Error ? e.message : '模型损坏'}`);
      });
    return () => {
      active = false;
    };
  }, [item.assetId, blob, invalidate]);
  const instance = useMemo(() => {
    const clone = model?.root.clone(true);
    clone?.traverse((object) => {
      if ('isMesh' in object) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [model]);
  useEffect(() => () => cleanup.current?.(), []);
  function start(e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0 || !ref.current) return;
    e.stopPropagation();
    useEditor.getState().select(item.id);
    const group = ref.current,
      canvas = gl.domElement,
      startX = item.x,
      startZ = item.z,
      pointer = e.pointerId,
      sx = e.nativeEvent.clientX,
      sy = e.nativeEvent.clientY;
    const plane = new Plane(new Vector3(0, 1, 0), -deskHeight),
      hit = new Vector3(),
      raycaster = new Raycaster(),
      ndc = new Vector2();
    if (!e.ray.intersectPlane(plane, hit)) return;
    const offset = new Vector3(startX - hit.x, 0, startZ - hit.z);
    let moved = false,
      done = false;
    if (controls.current) controls.current.enabled = false;
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
      if (raycaster.ray.intersectPlane(plane, hit)) {
        group.position.x = Math.max(-5, Math.min(5, hit.x + offset.x));
        group.position.z = Math.max(-5, Math.min(5, hit.z + offset.z));
        invalidate();
      }
    }
    function finish(cancel: boolean) {
      if (done) return;
      done = true;
      const x = group.position.x,
        z = group.position.z;
      group.position.set(startX, 0, startZ);
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
      cleanup.current = null;
      invalidate();
      if (moved && !cancel) {
        try {
          useEditor.getState().updateItem(item.id, { x, z });
        } catch (err) {
          onError(err instanceof Error ? err.message : '无法移动物品');
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
    cleanup.current = cancelDrag;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('keydown', key);
    canvas.addEventListener('lostpointercapture', cancelDrag);
  }
  return (
    <group
      ref={ref}
      position={[item.x, 0, item.z]}
      rotation={[0, (item.rotation * Math.PI) / 180, 0]}
      onPointerDown={start}
      onPointerOver={(e) => {
        e.stopPropagation();
        gl.domElement.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = 'auto';
      }}
    >
      {item.kind === 'monitor' ? (
        <MonitorModel
          size={item.size}
          color={item.color}
          pitch={item.pitch}
          roll={item.roll}
          lift={item.lift}
        />
      ) : item.kind !== 'imported' ? (
        <group scale={[item.size.width, item.size.height, item.size.depth]}>
          <BuiltinModel kind={item.kind} color={item.color} />
        </group>
      ) : instance && asset ? (
        <group
          scale={[
            item.size.width / asset.size.width,
            item.size.height / asset.size.height,
            item.size.depth / asset.size.depth,
          ]}
          dispose={null}
        >
          <primitive object={instance} dispose={null} />
        </group>
      ) : (
        <mesh position={[0, item.size.height / 2, 0]}>
          <boxGeometry args={[item.size.width, item.size.height, item.size.depth]} />
          <meshStandardMaterial color="#b63d43" transparent opacity={0.35} wireframe />
        </mesh>
      )}
      {(selected || outside) && (
        <group>
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[item.size.width + 0.018, item.size.depth + 0.018]} />
            <meshBasicMaterial
              color={outside ? '#b63d43' : '#315ce7'}
              transparent
              opacity={0.14}
              depthWrite={false}
            />
          </mesh>
          <mesh
            position={[
              0,
              (item.size.height + (item.kind === 'monitor' ? (item.lift ?? 0) : 0)) / 2,
              0,
            ]}
            raycast={() => null}
          >
            <boxGeometry
              args={[
                item.size.width + 0.006,
                item.size.height + (item.kind === 'monitor' ? (item.lift ?? 0) : 0) + 0.006,
                item.size.depth + 0.006,
              ]}
            />
            <meshBasicMaterial
              color={outside ? '#b63d43' : '#315ce7'}
              wireframe
              transparent
              opacity={selected ? 0.6 : 0.35}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

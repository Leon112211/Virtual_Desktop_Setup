import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AssetMeta, Desk, SceneItem as ItemData } from '../domain/project';
import { effectiveLidAngle, resolveItemTransform } from '../domain/ports';
import { resolveItemPositionWithCollisions, snapWallOutletPosition } from '../domain/collision';
import { constrainTargetToMonitorArm, findArmBranchForItem } from '../domain/monitorArm';
import { deskBackWallBounds, PEGBOARD_WALL_DEFAULT_Y, WALL_MAX_HEIGHT } from '../domain/desk';
import { PEGBOARD } from '../domain/pegboard';
import { itemWorldY } from '../domain/placement';
import { WALL_OUTLET_DEFAULT_Y } from '../domain/power';
import { BuiltinModel } from './BuiltinModels';
import { ControllerModel } from './ControllerModel';
import { ItemRotateGizmo } from './ItemRotateGizmo';
import { KeyboardModel } from './KeyboardModel';
import { LaptopModel } from './LaptopModel';
import { LaptopStandModel } from './LaptopStandModel';
import { MacDesktopModel } from './MacDesktopModel';
import { MonitorModel } from './MonitorModel';
import { MouseModel } from './MouseModel';
import { MousepadModel } from './MousepadModel';
import { PegboardModel } from './PegboardModel';
import { PowerStripModel, WallOutletModel } from './PowerModels';
import { SpeakerModel } from './SpeakerModel';
import { pauseOrbitUntilPointerUp } from './orbitPause';
import { useEditor } from '../store/editorStore';
import { loadCachedModel, modelCache } from '../assets/modelCache';
import type { LoadedModel } from '../assets/importModel';
export function SceneItem({
  item,
  selected,
  outside,
  desk,
  allItems,
  controls,
  asset,
  blob,
  onError,
  screenLamp,
  lampSelected = false,
  hasMonitorArm = false,
}: {
  item: ItemData;
  selected: boolean;
  outside: boolean;
  desk: Desk;
  allItems: ItemData[];
  controls: RefObject<OrbitControlsImpl | null>;
  asset?: AssetMeta;
  blob?: Blob;
  onError: (message: string) => void;
  screenLamp?: ItemData;
  lampSelected?: boolean;
  hasMonitorArm?: boolean;
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
  const boundStand =
    item.kind === 'gamingLaptop' || item.kind === 'macbook'
      ? allItems.find(
          (other) => other.kind === 'laptopStand' && other.laptopStand?.laptopId === item.id,
        )
      : undefined;
  const isBoundLaptop = Boolean(boundStand);
  const isVerticalBoundLaptop = boundStand?.laptopStand?.mode === 'vertical';
  const lidAngle = effectiveLidAngle(item, allItems);
  const isWallOutletWall =
    item.kind === 'wallOutlet' &&
    item.surface !== 'floor' &&
    (item.wallOutlet?.mount ?? 'wall') === 'wall';
  const isWallMounted = (item.kind === 'pegboard' && item.surface === 'wall') || isWallOutletWall;
  const transform = resolveItemTransform(item, desk, allItems);
  const localY = transform.position[1] - desk.height;
  const dragPlaneY = Math.max(transform.position[1], itemWorldY(desk, item, allItems));

  function start(e: ThreeEvent<PointerEvent>) {
    if (!ref.current) return;
    // Right-click ONLY wakes up / selects the 3D item without dragging or panning the camera.
    if (e.button === 2) {
      e.stopPropagation();
      pauseOrbitUntilPointerUp(controls.current, invalidate);
      useEditor.getState().select(item.id);
      return;
    }
    // Once selected (woken by right-click or scene panel), left-click drags/manipulates it;
    // when NOT selected, left-click passes straight through to OrbitControls so camera rotates cleanly.
    if (e.button !== 0 || !selected) return;
    e.stopPropagation();
    if (isBoundLaptop) return;
    const group = ref.current,
      canvas = gl.domElement,
      startX = item.x,
      startZ = item.z,
      startWallY =
        item.wallY ?? (isWallOutletWall ? WALL_OUTLET_DEFAULT_Y : PEGBOARD_WALL_DEFAULT_Y),
      pointer = e.pointerId,
      sx = e.nativeEvent.clientX,
      sy = e.nativeEvent.clientY;
    const plane = isWallMounted
        ? new Plane(new Vector3(0, 0, 1), -transform.position[2])
        : new Plane(new Vector3(0, 1, 0), -dragPlaneY),
      hit = new Vector3(),
      raycaster = new Raycaster(),
      ndc = new Vector2();
    if (!e.ray.intersectPlane(plane, hit)) return;
    const wallYBase = isWallOutletWall ? 0 : desk.height;
    const offset = isWallMounted
      ? new Vector3(startX - hit.x, startWallY - (hit.y - wallYBase), 0)
      : new Vector3(startX - hit.x, 0, startZ - hit.z);
    const wall = isWallMounted ? deskBackWallBounds(desk) : null;
    const minWallY = isWallOutletWall ? 0.04 : 0.02;
    const maxWallY = isWallOutletWall
      ? Math.max(0.06, (wall?.topY ?? desk.height + WALL_MAX_HEIGHT) - item.size.height)
      : Math.max(0.05, (wall?.heightAboveDesk ?? WALL_MAX_HEIGHT) - item.size.height);
    const armBranch = isWallMounted ? null : findArmBranchForItem(item.id, allItems);
    let latestX = startX,
      latestZ = startZ,
      latestWallY = startWallY;
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
        const rawX = Math.max(-5, Math.min(5, hit.x + offset.x));
        const collisionOn = useEditor.getState().collisionEnabled;
        if (isWallMounted) {
          const rawWallY = Math.max(minWallY, Math.min(maxWallY, hit.y - wallYBase + offset.y));
          const snapped =
            item.kind === 'wallOutlet'
              ? snapWallOutletPosition(item, { x: rawX, z: startZ, wallY: rawWallY }, allItems)
              : { x: rawX, z: startZ, wallY: rawWallY, snapped: false };
          const resolved = collisionOn
            ? resolveItemPositionWithCollisions(
                item,
                { x: snapped.x, z: startZ, wallY: snapped.wallY ?? rawWallY },
                desk,
                allItems,
              )
            : { x: snapped.x, z: startZ, wallY: snapped.wallY ?? rawWallY };
          const clampedWallY = Math.max(
            minWallY,
            Math.min(maxWallY, resolved.wallY ?? snapped.wallY ?? rawWallY),
          );
          latestX = resolved.x;
          latestWallY = Math.round(clampedWallY * 1000) / 1000;
          group.position.x = latestX;
          group.position.y = isWallOutletWall ? latestWallY - desk.height : latestWallY;
          useEditor
            .getState()
            .setCollisionNotice(
              resolved.hitObstacle
                ? `已防穿模避让：${resolved.hitObstacle}`
                : snapped.snapped
                  ? '已吸附对齐相邻插座'
                  : null,
            );
          useEditor
            .getState()
            .setDragPreview({ id: item.id, x: latestX, z: startZ, wallY: latestWallY });
          invalidate();
          return;
        }
        const rawZ = Math.max(-5, Math.min(5, hit.z + offset.z));
        if (armBranch) {
          const bounded = constrainTargetToMonitorArm(
            item,
            rawX,
            rawZ,
            item.lift,
            armBranch.arm,
            armBranch.role,
            armBranch.targetType,
            allItems,
            desk,
          );
          latestX = bounded.x;
          latestZ = bounded.z;
          group.position.x = bounded.x;
          group.position.z = bounded.z;
          useEditor.getState().setDragPreview({
            id: item.id,
            x: bounded.x,
            z: bounded.z,
            limitReason: bounded.limitReason,
            maxReachCm: bounded.maxReachCm,
          });
        } else {
          const snapped =
            item.kind === 'wallOutlet'
              ? snapWallOutletPosition(item, { x: rawX, z: rawZ }, allItems)
              : { x: rawX, z: rawZ, snapped: false };
          const resolved = collisionOn
            ? resolveItemPositionWithCollisions(
                item,
                { x: snapped.x, z: snapped.z },
                desk,
                allItems,
              )
            : { x: snapped.x, z: snapped.z };
          latestX = resolved.x;
          latestZ = resolved.z;
          group.position.x = resolved.x;
          group.position.z = resolved.z;
          useEditor
            .getState()
            .setCollisionNotice(
              resolved.hitObstacle
                ? `已防穿模避让：${resolved.hitObstacle}`
                : snapped.snapped
                  ? '已吸附对齐相邻插座'
                  : null,
            );
          useEditor.getState().setDragPreview({ id: item.id, x: resolved.x, z: resolved.z });
        }
        invalidate();
      }
    }
    function finish(cancel: boolean) {
      if (done) return;
      done = true;
      const x = latestX,
        z = latestZ,
        wallY = latestWallY;
      if (!moved || cancel) {
        group.position.set(startX, localY, startZ);
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
      cleanup.current = null;
      invalidate();
      if (moved && !cancel) {
        try {
          useEditor.getState().updateItem(item.id, isWallMounted ? { x, wallY } : { x, z });
          if (useEditor.getState().dragPreview) useEditor.getState().setDragPreview(null);
        } catch (err) {
          group.position.set(startX, localY, startZ);
          useEditor.getState().setDragPreview(null);
          useEditor.getState().setCollisionNotice(null);
          onError(err instanceof Error ? err.message : '操作未成功');
        }
      } else {
        useEditor.getState().setCollisionNotice(null);
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
  // Attachments are rendered inside their host panel or world-space arm, never with a desk footprint.
  if (item.kind === 'screenLamp' || item.kind === 'monitorArm') return null;
  return (
    <group
      ref={ref}
      position={[transform.position[0], localY, transform.position[2]]}
      quaternion={transform.quaternion}
      onPointerDown={start}
      onPointerOver={(e) => {
        if (!selected) return;
        e.stopPropagation();
        gl.domElement.style.cursor = isBoundLaptop ? 'pointer' : 'grab';
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = 'auto';
      }}
    >
      {item.kind === 'monitor' ? (
        <MonitorModel
          itemId={item.id}
          size={item.size}
          color={item.color}
          monitor={item.monitor}
          pitch={item.pitch}
          roll={item.roll}
          lift={item.lift}
          hideStand={hasMonitorArm}
          screenLamp={screenLamp}
          lampSelected={lampSelected}
        />
      ) : item.kind === 'pegboard' ? (
        <PegboardModel size={item.size} color={item.color} wallMounted={isWallMounted} />
      ) : item.kind === 'keyboard' ? (
        <KeyboardModel item={item} desk={desk} />
      ) : item.kind === 'controller' ? (
        <ControllerModel size={item.size} color={item.color} controller={item.controller} />
      ) : item.kind === 'mouse' ? (
        <MouseModel size={item.size} color={item.color} mouse={item.mouse} />
      ) : item.kind === 'mousepad' ? (
        <MousepadModel size={item.size} color={item.color} />
      ) : item.kind === 'gamingLaptop' || item.kind === 'macbook' ? (
        <LaptopModel kind={item.kind} size={item.size} color={item.color} lidAngle={lidAngle} />
      ) : item.kind === 'macMini' || item.kind === 'macStudio' ? (
        <MacDesktopModel kind={item.kind} size={item.size} color={item.color} />
      ) : item.kind === 'laptopStand' && item.laptopStand ? (
        <LaptopStandModel size={item.size} color={item.color} stand={item.laptopStand} />
      ) : item.kind === 'powerStrip' ? (
        <PowerStripModel item={item} />
      ) : item.kind === 'wallOutlet' ? (
        <WallOutletModel item={item} />
      ) : item.kind === 'speaker' ? (
        <SpeakerModel size={item.size} color={item.color} speaker={item.speaker} />
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
          {isWallMounted ? (
            <mesh position={[0, item.size.height / 2, -0.0025]} raycast={() => null}>
              <planeGeometry args={[item.size.width + 0.018, item.size.height + 0.018]} />
              <meshBasicMaterial
                color={outside ? '#b63d43' : '#315ce7'}
                transparent
                opacity={0.14}
                depthWrite={false}
              />
            </mesh>
          ) : (
            <mesh
              position={[0, item.kind === 'mousepad' ? item.size.height + 0.001 : 0.002, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            >
              <planeGeometry args={[item.size.width + 0.018, item.size.depth + 0.018]} />
              <meshBasicMaterial
                color={outside ? '#b63d43' : '#315ce7'}
                transparent
                opacity={0.14}
                depthWrite={false}
              />
            </mesh>
          )}
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
                (item.kind === 'pegboard' && isWallMounted ? PEGBOARD.thickness : item.size.depth) +
                  0.006,
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
      {selected && !isWallMounted && !isVerticalBoundLaptop && (
        <ItemRotateGizmo
          item={item}
          centerX={transform.position[0]}
          centerZ={transform.position[2]}
          planeY={dragPlaneY}
          worldPosition={transform.position}
          worldQuaternion={transform.quaternion}
          hasMonitorArm={hasMonitorArm}
          hideYaw={isBoundLaptop}
          lidAngle={lidAngle}
          controls={controls}
          onError={onError}
        />
      )}
    </group>
  );
}

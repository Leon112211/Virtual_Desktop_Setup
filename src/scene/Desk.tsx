import { useEffect, useMemo } from 'react';
import { CanvasTexture, Color, MirroredRepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { RoundedBox, useTexture } from '@react-three/drei';
import deskWoodUrl from '../assets/desk-wood.jpg';
import {
  DESK_WOOD_BASE_COLOR,
  deskBackWallBounds,
  grommetPosition,
  WALL_THICKNESS,
} from '../domain/desk';
import type { Desk as DeskData } from '../domain/project';
import {
  buildDeskPartitionGeometries,
  buildDeskTopGeometry,
  DESK_LEG_INSET_X,
  DESK_LEG_INSET_Z,
  DESK_LEG_SIZE,
  DESK_PARTITION_THICKNESS,
  deskLegs,
} from './deskGeometry';

function configureWoodTexture<T extends Texture>(tex: T): T {
  tex.wrapS = MirroredRepeatWrapping;
  tex.wrapT = MirroredRepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function buildDeskWoodTexture(baseWood: Texture, tintHex: string): Texture {
  if (tintHex.toLowerCase() === DESK_WOOD_BASE_COLOR) {
    return configureWoodTexture(baseWood.clone());
  }
  const img = baseWood.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!img || !img.width || !img.height || typeof document === 'undefined') {
    return configureWoodTexture(baseWood.clone());
  }
  const w = 512;
  const h = 288;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return configureWoodTexture(baseWood.clone());
  }
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const target = new Color(tintHex);
  const tr = Math.round(target.r * 255);
  const tg = Math.round(target.g * 255);
  const tb = Math.round(target.b * 255);
  const photoMeanLum = 92;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const grainFactor = 0.24 + 0.76 * (lum / photoMeanLum);
    data[i] = Math.min(255, Math.max(0, Math.round(tr * grainFactor)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(tg * grainFactor)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(tb * grainFactor)));
  }
  ctx.putImageData(imgData, 0, 0);
  return configureWoodTexture(new CanvasTexture(canvas));
}

export function Desk({ desk }: { desk: DeskData }) {
  const baseWood = useTexture(deskWoodUrl);
  const isSolid = desk.finish === 'solid';
  const wood = useMemo(
    () => (isSolid ? null : buildDeskWoodTexture(baseWood, desk.color)),
    [isSolid, baseWood, desk.color],
  );
  useEffect(() => () => wood?.dispose(), [wood]);
  const matColor = isSolid ? desk.color : '#ffffff';
  const matKey = isSolid ? 'solid' : 'wood';
  const matRoughness = isSolid ? 0.58 : 0.62;
  const { width: w, depth: d, height: h, thickness: t, cornerRadius } = desk;
  const side = desk.return?.side;
  const returnWidth = desk.return?.width;
  const returnExtension = desk.return?.extension;
  const grommetEnabled = desk.grommet?.enabled ?? false;
  const grommetSide = desk.grommet?.side;
  const grommetDiameter = desk.grommet?.diameter;

  const topGeometry = useMemo(
    () => buildDeskTopGeometry(desk),
    [
      w,
      d,
      t,
      cornerRadius,
      side,
      returnWidth,
      returnExtension,
      grommetEnabled,
      grommetSide,
      grommetDiameter,
    ],
  );
  useEffect(() => () => topGeometry.dispose(), [topGeometry]);

  const legs = useMemo(() => deskLegs(desk), [w, d, side, returnWidth, returnExtension]);
  const grommet = useMemo(
    () => grommetPosition(desk),
    [w, d, grommetEnabled, grommetSide, grommetDiameter],
  );

  const partitions = !desk.return ? desk.partitions : undefined;
  const partBack = Boolean(partitions?.back);
  const partLeft = Boolean(partitions?.left);
  const partRight = Boolean(partitions?.right);
  const partHeight = partitions?.height ?? 0;
  const isFrostedPartitions = partitions?.material === 'frosted';
  const shelf = !desk.return && desk.shelf?.enabled ? desk.shelf : undefined;
  const shelfThickness = Math.min(0.024, Math.max(0.016, t * 0.8));

  const partitionGeos = useMemo(
    () =>
      partBack || partLeft || partRight
        ? buildDeskPartitionGeometries(desk, {
            back: partBack,
            left: partLeft,
            right: partRight,
            height: partHeight,
          })
        : null,
    [w, d, t, cornerRadius, side, partBack, partLeft, partRight, partHeight],
  );
  useEffect(
    () => () => {
      partitionGeos?.wallGeometry.dispose();
      partitionGeos?.apronGeometry.dispose();
    },
    [partitionGeos],
  );

  const partitionBrackets = useMemo(() => {
    if (!partitionGeos) return [];
    const list: { key: string; x: number; z: number; rotY: number }[] = [];
    const yOffset = DESK_PARTITION_THICKNESS / 2;
    if (partBack) {
      for (const sx of [-1, 1]) {
        list.push({
          key: `back-${sx}`,
          x: sx * Math.min(w * 0.34, w / 2 - 0.14),
          z: -d / 2 - yOffset + 0.016,
          rotY: 0,
        });
      }
    }
    const wingPosZ = [-d * 0.16, d * 0.18];
    if (partLeft) {
      wingPosZ.forEach((wz, i) =>
        list.push({ key: `left-${i}`, x: -w / 2 - yOffset + 0.016, z: wz, rotY: Math.PI / 2 }),
      );
    }
    if (partRight) {
      wingPosZ.forEach((wz, i) =>
        list.push({ key: `right-${i}`, x: w / 2 + yOffset - 0.016, z: wz, rotY: Math.PI / 2 }),
      );
    }
    return list;
  }, [partitionGeos, partBack, partLeft, partRight, w, d]);

  return (
    <group>
      <mesh
        name="desk-top-mesh"
        geometry={topGeometry}
        position={[0, h - t, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          key={matKey}
          color={matColor}
          map={wood ?? undefined}
          roughness={matRoughness}
        />
      </mesh>

      {grommet && (
        <group position={[grommet.x, h, grommet.z]}>
          {/* 护线盖外环与沉孔套筒 */}
          <mesh position={[0, 0.001, 0]} receiveShadow>
            <cylinderGeometry
              args={[
                grommet.diameter / 2 + 0.008,
                grommet.diameter / 2 + 0.008,
                0.0025,
                28,
                1,
                true,
              ]}
            />
            <meshStandardMaterial color="#343c48" roughness={0.55} metalness={0.25} side={2} />
          </mesh>
          <mesh position={[0, 0.0015, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[grommet.diameter / 2 + 0.003, 0.0035, 10, 32]} />
            <meshStandardMaterial color="#3c4452" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, -t / 2, 0]}>
            <cylinderGeometry
              args={[grommet.diameter / 2, grommet.diameter / 2, t + 0.002, 24, 1, true]}
            />
            <meshStandardMaterial color="#2a313b" roughness={0.75} side={2} />
          </mesh>
        </group>
      )}

      {partitionGeos && (
        <group>
          {/* 与桌体倒角无缝包覆的一体化侧板与后板（支持与桌面一致材质或半透明磨砂板材） */}
          <mesh
            name="desk-partitions-mesh"
            geometry={partitionGeos.wallGeometry}
            position={[0, h - 0.001, 0]}
            castShadow={!isFrostedPartitions}
            receiveShadow
          >
            {isFrostedPartitions ? (
              <meshPhysicalMaterial
                key="frosted"
                color="#e8eff6"
                transparent
                opacity={0.46}
                roughness={0.62}
                metalness={0.04}
                ior={1.49}
                reflectivity={0.45}
                clearcoat={0.22}
                clearcoatRoughness={0.46}
                depthWrite={false}
              />
            ) : (
              <meshStandardMaterial
                key={matKey}
                color={matColor}
                map={wood ?? undefined}
                roughness={matRoughness}
              />
            )}
          </mesh>
          {/* 包覆桌缘厚度的底层密封压条裙边（咬合桌面斜倒角，消除缝隙） */}
          <mesh
            geometry={partitionGeos.apronGeometry}
            position={[0, h - t - 0.004, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#4a5666" roughness={0.52} metalness={0.22} />
          </mesh>
          {/* 桌底一体金属夹持卡扣，与桌腿横梁统一工业质感 */}
          {partitionBrackets.map((b) => (
            <group key={b.key} position={[b.x, h - t - 0.007, b.z]} rotation={[0, b.rotY, 0]}>
              <RoundedBox args={[0.056, 0.007, 0.044]} radius={0.002} smoothness={2} castShadow>
                <meshStandardMaterial color="#d4dae0" metalness={0.38} roughness={0.44} />
              </RoundedBox>
            </group>
          ))}
        </group>
      )}

      {shelf &&
        (() => {
          const shelfMidZ = -d / 2 + shelf.depth / 2;
          const hasBaffleSupport = partBack || partLeft || partRight;

          return (
            <group>
              {/* 与主桌等宽的一体平行顶板（直接嵌合在侧板与后板内壁上，干净无多余支撑角码/导轨） */}
              <RoundedBox
                name="desk-shelf-mesh"
                args={[w - (hasBaffleSupport ? 0.002 : 0), shelfThickness, shelf.depth]}
                radius={0.004}
                smoothness={2}
                position={[0, h + shelf.height - shelfThickness / 2, shelfMidZ]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial
                  key={matKey}
                  color={matColor}
                  map={wood ?? undefined}
                  roughness={matRoughness}
                />
              </RoundedBox>
            </group>
          );
        })()}

      {legs.map((leg, index) => (
        <mesh key={index} position={[leg.x, (h - t) / 2, leg.z]} castShadow receiveShadow>
          <boxGeometry args={[DESK_LEG_SIZE, h - t, DESK_LEG_SIZE]} />
          <meshStandardMaterial color="#e7eaee" metalness={0.35} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, h - t - 0.045, -d / 2 + DESK_LEG_INSET_X]} castShadow>
        <boxGeometry args={[w - DESK_LEG_INSET_Z * 2, 0.06, 0.035]} />
        <meshStandardMaterial color="#d4dae0" metalness={0.25} />
      </mesh>
      {(() => {
        const wall = deskBackWallBounds(desk);
        if (!wall) return null;
        return (
          <group name="desk-back-wall">
            <mesh
              position={[0, wall.totalHeight / 2, wall.frontZ - WALL_THICKNESS / 2]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wall.width, wall.totalHeight, WALL_THICKNESS]} />
              <meshStandardMaterial color={wall.color} roughness={0.92} metalness={0.02} />
            </mesh>
            <mesh position={[0, 0.045, wall.frontZ + 0.004]} receiveShadow>
              <boxGeometry args={[wall.width, 0.09, 0.008]} />
              <meshStandardMaterial color="#dcdfe4" roughness={0.78} metalness={0.04} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}

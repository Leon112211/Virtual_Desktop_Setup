import { useEffect, useMemo } from 'react';
import { RoundedBox, useTexture } from '@react-three/drei';
import { SRGBColorSpace } from 'three';
import wallpaperUrl from '../assets/screen-wallpaper.jpg';
import { buildKeyboardKeys } from '../domain/keyboard';
import { DEFAULT_LID_ANGLE } from '../domain/laptop';
import type { Size } from '../domain/project';
import {
  buildKeycapsGeometry,
  createRoundedPlateGeometry,
  createRoundedRectPlaneGeometry,
  makeKeycapLegendsTexture,
} from './keyboardTexture';
import { MacBookModel } from './MacBookModel';
import { PortSocket } from './PortSocket';

export function LaptopModel({
  kind,
  size,
  color,
  lidAngle = DEFAULT_LID_ANGLE,
}: {
  kind: 'gamingLaptop' | 'macbook';
  size: Size;
  color: string;
  lidAngle?: number;
}) {
  if (kind === 'macbook') {
    return <MacBookModel size={size} color={color} lidAngle={lidAngle} />;
  }
  return <GamingLaptopModel size={size} color={color} lidAngle={lidAngle} />;
}

const GAMING_KEYS = buildKeyboardKeys('75');

function GamingLaptopModel({
  size,
  color,
  lidAngle = DEFAULT_LID_ANGLE,
}: {
  size: Size;
  color: string;
  lidAngle?: number;
}) {
  const wallpaper = useTexture(wallpaperUrl);
  wallpaper.colorSpace = SRGBColorSpace;

  const { width: w, height: h, depth: d } = size;
  const baseHeight = Math.max(0.006, h * 0.72);
  const lidThickness = Math.max(0.0035, h * 0.28);
  const bezel = 0.008;
  const screenW = Math.max(0.08, w - bezel * 2);
  const screenH = Math.max(0.06, d - bezel * 2.4);
  const hingeY = baseHeight;
  const hingeZ = -d / 2 + 0.008;
  const lidTilt = ((90 - lidAngle) * Math.PI) / 180;

  const kbW = w * 0.86;
  const kbD = d * 0.44;
  const kbCenterZ = -d * 0.1;
  const unitX = kbW / 16;
  const unitZ = kbD / 6.25;

  const keycapsGeo = useMemo(
    () =>
      buildKeycapsGeometry(
        GAMING_KEYS,
        16,
        6.25,
        unitX,
        unitZ,
        0.0016,
        -kbW / 2,
        kbCenterZ - kbD / 2,
        baseHeight - 0.0005,
        0.1,
        0.04,
      ),
    [unitX, unitZ, kbW, kbD, kbCenterZ, baseHeight],
  );
  const keyLegendsTex = useMemo(
    () =>
      makeKeycapLegendsTexture(GAMING_KEYS, 16, 6.25, {
        alphaBg: '#1c232d',
        alphaFg: '#e2e8f0',
        modBg: '#232c39',
        modFg: '#cbd5e1',
        accentBg: '#2b394e',
        accentFg: '#38bdf8',
      }),
    [],
  );

  const keyWellGeo = useMemo(
    () => createRoundedPlateGeometry(kbW + 0.005, kbD + 0.005, 0.001, 0.005),
    [kbW, kbD],
  );
  const trackpadGeo = useMemo(
    () => createRoundedPlateGeometry(w * 0.36, d * 0.26, 0.0008, 0.0055),
    [w, d],
  );

  const lidRadius = Math.min(0.007, lidThickness / 2.2);
  const bezelGeo = useMemo(
    () =>
      createRoundedRectPlaneGeometry(
        Math.max(0.04, w - 0.005),
        Math.max(0.04, d - 0.005),
        Math.max(0.002, lidRadius - 0.0015),
      ),
    [w, d, lidRadius],
  );
  const screenGeo = useMemo(
    () => createRoundedRectPlaneGeometry(screenW, screenH, 0.0025, 0.0015),
    [screenW, screenH],
  );

  useEffect(() => () => keycapsGeo.dispose(), [keycapsGeo]);
  useEffect(() => () => keyLegendsTex.dispose(), [keyLegendsTex]);
  useEffect(() => () => keyWellGeo.dispose(), [keyWellGeo]);
  useEffect(() => () => trackpadGeo.dispose(), [trackpadGeo]);
  useEffect(() => () => bezelGeo.dispose(), [bezelGeo]);
  useEffect(() => () => screenGeo.dispose(), [screenGeo]);

  return (
    <group>
      {/* 圆角机身底座 */}
      <RoundedBox
        args={[w, baseHeight, d]}
        radius={Math.min(0.007, baseHeight / 2.2)}
        smoothness={5}
        position={[0, baseHeight / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.48} />
      </RoundedBox>

      {/* 圆角键盘凹槽与带字符圆角键帽 */}
      <mesh geometry={keyWellGeo} position={[0, baseHeight - 0.0007, kbCenterZ]} receiveShadow>
        <meshStandardMaterial color="#131820" roughness={0.7} />
      </mesh>
      <mesh geometry={keycapsGeo} castShadow receiveShadow>
        <meshStandardMaterial map={keyLegendsTex} roughness={0.52} metalness={0.08} />
      </mesh>

      {/* 圆角触控板 */}
      <mesh geometry={trackpadGeo} position={[0, baseHeight + 0.00005, d * 0.27]} receiveShadow>
        <meshStandardMaterial color="#2a323e" metalness={0.2} roughness={0.35} />
      </mesh>

      {/* 游戏本后置散热格栅与 1:1 I/O 接口 */}
      <mesh position={[0, baseHeight * 0.55, -d / 2 - 0.0005]}>
        <boxGeometry args={[w * 0.74, baseHeight * 0.45, 0.002]} />
        <meshStandardMaterial color="#181e27" roughness={0.7} />
      </mesh>
      <group position={[0, Math.max(0.006, h * 0.45), -d / 2 - 0.0012]}>
        <PortSocket kind="hdmi" position={[-w * 0.24, 0, 0]} rotation={[0, Math.PI, 0]} />
        <PortSocket kind="dp" position={[-w * 0.1, 0, 0]} rotation={[0, Math.PI, 0]} />
        <PortSocket kind="usbc" position={[w * 0.03, 0, 0]} rotation={[0, Math.PI, 0]} />
        <PortSocket kind="rj45" position={[w * 0.15, 0, 0]} rotation={[0, Math.PI, 0]} />
        <PortSocket kind="powerAc" position={[w * 0.28, 0, 0]} rotation={[0, Math.PI, 0]} />
      </group>

      {/* 游戏本右侧边 2× USB-A 3.0 与 TF / microSD 卡槽 */}
      <group position={[w / 2 - 0.0003, Math.max(0.006, baseHeight * 0.52), 0]}>
        <PortSocket kind="usba" position={[0, 0, -d * 0.18]} rotation={[0, Math.PI / 2, 0]} />
        <PortSocket kind="usba" position={[0, 0, -d * 0.06]} rotation={[0, Math.PI / 2, 0]} />
        <PortSocket kind="tf" position={[0, 0, d * 0.08]} rotation={[0, Math.PI / 2, 0]} />
      </group>

      {/* 屏幕盖板（绕后缘铰链开合） */}
      <group position={[0, hingeY, hingeZ]} rotation={[lidTilt, 0, 0]}>
        <group position={[0, d / 2, 0]}>
          <RoundedBox
            args={[w, d, lidThickness]}
            radius={lidRadius}
            smoothness={5}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} metalness={0.35} roughness={0.45} />
          </RoundedBox>
          <mesh geometry={bezelGeo} position={[0, 0, lidThickness / 2 + 0.0003]}>
            <meshStandardMaterial color="#11161f" roughness={0.5} />
          </mesh>
          <mesh geometry={screenGeo} position={[0, 0.002, lidThickness / 2 + 0.0008]}>
            <meshBasicMaterial map={wallpaper} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

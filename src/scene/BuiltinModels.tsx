import { useLayoutEffect, useRef } from 'react';
import { Group } from 'three';
import { RoundedBox } from '@react-three/drei';
import { unitBounds } from './unitBounds';
import type { BuiltinKind } from '../domain/project';
type V = [number, number, number];
function Box({
  at,
  size,
  color,
  r = 0.015,
  metal = 0,
}: {
  at: V;
  size: V;
  color: string;
  r?: number;
  metal?: number;
}) {
  return (
    <RoundedBox
      args={size}
      position={at}
      radius={Math.min(r, ...size.map((n) => n / 3))}
      smoothness={2}
      bevelSegments={1}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.55} metalness={metal} />
    </RoundedBox>
  );
}
function Disc({
  at,
  radius,
  color,
  depth = 0.02,
}: {
  at: V;
  radius: number;
  color: string;
  depth?: number;
}) {
  return (
    <mesh position={at} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[radius, radius, depth, 24]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
export function BuiltinModel({ kind, color }: { kind: BuiltinKind; color: string }) {
  const placement = useRef<Group>(null);
  const content = useRef<Group>(null);
  useLayoutEffect(() => {
    if (!placement.current || !content.current) return;
    const transform = unitBounds(content.current);
    placement.current.scale.copy(transform.scale);
    placement.current.position.copy(transform.position);
  }, [kind]);
  return (
    <group ref={placement}>
      <group ref={content}>
        <BuiltinGeometry kind={kind} color={color} />
      </group>
    </group>
  );
}
function BuiltinGeometry({ kind, color }: { kind: BuiltinKind; color: string }) {
  if (kind === 'monitor')
    return (
      <group>
        <Box at={[0, 0.018, 0.07]} size={[0.52, 0.036, 0.8]} color={color} metal={0.5} />
        <Box at={[0, 0.23, -0.06]} size={[0.055, 0.42, 0.11]} color={color} metal={0.6} />
        <Box at={[0, 0.69, -0.12]} size={[1, 0.62, 0.14]} color={color} r={0.025} />
        <Box at={[0, 0.7, -0.044]} size={[0.95, 0.54, 0.009]} color="#152b46" r={0.012} />
        <Box at={[-0.22, 0.7, -0.037]} size={[0.43, 0.54, 0.002]} color="#315884" r={0.001} />
        <Box at={[0.25, 0.83, -0.036]} size={[0.39, 0.28, 0.002]} color="#6c9fae" r={0.001} />
        <Box at={[0.25, 0.55, -0.036]} size={[0.39, 0.24, 0.002]} color="#223c5a" r={0.001} />
        <mesh position={[0, 0.405, -0.034]}>
          <sphereGeometry args={[0.004, 8, 8]} />
          <meshBasicMaterial color="#d4e4ff" />
        </mesh>
      </group>
    );
  if (kind === 'speaker')
    return (
      <group>
        <Box at={[0, 0.5, 0]} size={[1, 1, 1]} color={color} r={0.035} />
        <Box at={[0, 0.5, 0.496]} size={[0.9, 0.92, 0.016]} color="#303741" r={0.02} />
        <Disc at={[0, 0.36, 0.51]} radius={0.31} color="#171d26" />
        <Disc at={[0, 0.36, 0.524]} radius={0.21} color="#313a49" />
        <Disc at={[0, 0.36, 0.538]} radius={0.09} color="#202833" />
        <Disc at={[0, 0.79, 0.51]} radius={0.115} color="#111a24" />
        <Disc at={[0.32, 0.1, 0.512]} radius={0.025} color="#d7ba85" />
      </group>
    );
  if (kind === 'keyboard')
    return (
      <group>
        <Box at={[0, 0.24, 0]} size={[1, 0.48, 1]} color={color} r={0.035} />
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 14 }, (_, col) => (
            <Box
              key={`${row}-${col}`}
              at={[-0.455 + col * 0.07, 0.72, -0.39 + row * 0.183]}
              size={[0.057, 0.5, 0.15]}
              r={0.012}
              color={
                row === 0 || col === 0
                  ? '#637e9b'
                  : row === 4 && col > 3 && col < 10
                    ? '#d5c8b6'
                    : '#edf0f3'
              }
            />
          )),
        )}
      </group>
    );
  if (kind === 'controller')
    return (
      <group>
        <Box at={[0, 0.52, -0.02]} size={[0.9, 0.85, 0.75]} color={color} r={0.2} />
        <Box at={[-0.34, 0.43, 0.12]} size={[0.3, 0.85, 0.73]} color={color} r={0.12} />
        <Box at={[0.34, 0.43, 0.12]} size={[0.3, 0.85, 0.73]} color={color} r={0.12} />
        <mesh position={[-0.2, 0.96, 0.12]}>
          <cylinderGeometry args={[0.085, 0.09, 0.09, 16]} />
          <meshStandardMaterial color="#334253" />
        </mesh>
        <mesh position={[0.13, 0.96, 0.27]}>
          <cylinderGeometry args={[0.085, 0.09, 0.09, 16]} />
          <meshStandardMaterial color="#334253" />
        </mesh>
        <Box at={[-0.3, 0.97, -0.15]} size={[0.15, 0.05, 0.055]} color="#435062" />
        <Box at={[-0.3, 0.97, -0.15]} size={[0.055, 0.05, 0.22]} color="#435062" />
        {[
          [0.25, -0.19, '#819d8c'],
          [0.37, -0.06, '#bd8b80'],
          [0.13, -0.06, '#7e96bc'],
          [0.25, 0.07, '#c3b179'],
        ].map(([x, z, c]) => (
          <mesh key={String(c)} position={[Number(x), 0.98, Number(z)]}>
            <cylinderGeometry args={[0.032, 0.032, 0.035, 12]} />
            <meshStandardMaterial color={String(c)} />
          </mesh>
        ))}
      </group>
    );
  // Fallback silhouette. The pegboard has its own real-scale renderer
  // (PegboardModel) so its slots keep their physical size when the board is resized.
  return (
    <group>
      <Box at={[0, 0.54, -0.12]} size={[1, 0.92, 0.08]} color={color} r={0.014} />
      <Box at={[-0.32, 0.02, 0]} size={[0.22, 0.04, 1]} color={color} />
      <Box at={[0.32, 0.02, 0]} size={[0.22, 0.04, 1]} color={color} />
    </group>
  );
}

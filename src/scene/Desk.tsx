import { useEffect, useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { RoundedBox } from '@react-three/drei';
import type { Desk as DeskData } from '../domain/project';
function makeWood() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 256);
  let seed = 14;
  for (let i = 0; i < 650; i++) {
    seed = (seed * 16807) % 2147483647;
    const y = seed % 256;
    const alpha = 0.015 + (seed % 50) / 1500;
    ctx.strokeStyle = `rgba(64,32,8,${alpha})`;
    ctx.lineWidth = 0.2 + (seed % 10) / 12;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(150, y + 2, 340, y - 2, 512, y + 1);
    ctx.stroke();
  }
  const map = new CanvasTexture(canvas);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.repeat.set(2, 1);
  map.colorSpace = SRGBColorSpace;
  return map;
}
export function Desk({ desk }: { desk: DeskData }) {
  const wood = useMemo(makeWood, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const { width: w, depth: d, height: h, thickness: t } = desk;
  return (
    <group>
      <RoundedBox
        args={[w, t, d]}
        radius={0.012}
        smoothness={3}
        position={[0, h - t / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={desk.color} map={wood} roughness={0.64} />
      </RoundedBox>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}${z}`}
            position={[x * (w / 2 - 0.075), (h - t) / 2, z * (d / 2 - 0.07)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.045, h - t, 0.045]} />
            <meshStandardMaterial color="#e7eaee" metalness={0.35} roughness={0.45} />
          </mesh>
        )),
      )}
      <mesh position={[0, h - t - 0.045, -d / 2 + 0.075]} castShadow>
        <boxGeometry args={[w - 0.14, 0.06, 0.035]} />
        <meshStandardMaterial color="#d4dae0" metalness={0.25} />
      </mesh>
    </group>
  );
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { resolveItemTransform } from '../domain/ports';
import type { Desk, SceneItem } from '../domain/project';

function makeNbTrayTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Powder-coated cold-rolled steel matte charcoal finish
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle chamfer edge highlight
  ctx.strokeStyle = '#303642';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 492);

  // Punched ventilation cooling slot matrix (characteristic of NB FP-2 tray)
  const cols = 4;
  const rows = 7;
  const startX = 62;
  const startY = 58;
  const gapX = 104;
  const gapY = 56;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Skip central VESA mounting hub solid zone (middle rows/cols)
      if ((r === 2 || r === 3) && (c === 1 || c === 2)) continue;
      const x = startX + c * gapX;
      const y = startY + r * gapY;
      ctx.fillStyle = '#0c0e12';
      ctx.beginPath();
      ctx.roundRect(x, y, 76, 18, 9);
      ctx.fill();
      ctx.strokeStyle = '#353c48';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Central VESA 75x75 & 100x100 embossed mounting ring
  ctx.strokeStyle = '#2d333f';
  ctx.lineWidth = 3;
  ctx.strokeRect(176, 176, 160, 160);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 1:1 North Bayou NB FP-2 VESA laptop tray, rendered in world space directly beneath
 * its mounted laptop so VESA head alignment, side clamping jaws (220–420 mm),
 * bottom stopper lips, and ventilation plate match real hardware.
 */
export function LaptopTrayModel({
  laptop,
  desk,
  allItems,
  accent,
}: {
  laptop: SceneItem;
  desk: Desk;
  allItems: SceneItem[];
  accent: string;
}) {
  const tf = useMemo(
    () => resolveItemTransform(laptop, desk, allItems),
    [
      laptop.x,
      laptop.z,
      laptop.rotation,
      laptop.size.width,
      laptop.size.depth,
      desk.height,
      allItems,
    ],
  );

  const trayTex = useMemo(() => makeNbTrayTexture(), []);
  useEffect(() => () => trayTex.dispose(), [trayTex]);

  const plateW = 0.23;
  const plateD = Math.min(0.235, Math.max(0.19, laptop.size.depth * 0.94));
  const plateH = 0.0028;
  // Expandable side clamps cover NB FP-2 official 220–420 mm span
  const clampHalfW = Math.min(0.21, Math.max(0.11, laptop.size.width / 2 + 0.003));
  const railSpan = clampHalfW;
  const frontZ = laptop.size.depth / 2;

  return (
    <group position={tf.position} quaternion={tf.quaternion}>
      {/* 主冲压冷轧钢散热托盘主板（上表面恰好贴合笔记本底面 y = 0） */}
      <mesh position={[0, -plateH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[plateW, plateH, plateD]} />
        <meshStandardMaterial map={trayTex} roughness={0.58} metalness={0.55} />
      </mesh>

      {/* 背部 VESA 100×100 转接加强法兰底盘（与支架臂快装盘 y = -0.010 贴合） */}
      <RoundedBox
        args={[0.106, 0.0055, 0.106]}
        radius={0.002}
        smoothness={2}
        position={[0, -plateH - 0.0027, 0]}
        castShadow
      >
        <meshStandardMaterial color={accent} roughness={0.45} metalness={0.68} />
      </RoundedBox>

      {/* 左右伸缩夹臂导轨 + L 形防刮护垫卡爪（220–420 mm 夹距，避开后侧接口区） */}
      {[-1, 1].map((side) => (
        <group key={`clamp-${side}`} position={[0, 0, 0.024]}>
          {/* 横向伸缩导轨滑片 */}
          <mesh position={[side * (railSpan / 2), -plateH - 0.0022, 0]} castShadow>
            <boxGeometry args={[railSpan, 0.0032, 0.026]} />
            <meshStandardMaterial color="#181b22" roughness={0.52} metalness={0.62} />
          </mesh>
          {/* 竖直夹爪弯臂 */}
          <RoundedBox
            args={[0.004, 0.018, 0.032]}
            radius={0.0015}
            smoothness={2}
            position={[side * clampHalfW, 0.006, 0]}
            castShadow
          >
            <meshStandardMaterial color="#1b1f27" roughness={0.55} metalness={0.55} />
          </RoundedBox>
          {/* EVA 防滑硅胶内垫 */}
          <mesh position={[side * (clampHalfW - 0.0028), 0.007, 0]}>
            <boxGeometry args={[0.002, 0.014, 0.028]} />
            <meshStandardMaterial color="#101216" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* 前缘双侧底部 L 形防滑托爪（托住倾斜状态的笔记本下沿） */}
      {[-0.068, 0.068].map((lx, idx) => (
        <group key={`lip-${idx}`} position={[lx, 0, frontZ]}>
          {/* 托板向前的连接底舌 */}
          <mesh position={[0, -plateH / 2, -(frontZ - plateD / 2) / 2]} castShadow>
            <boxGeometry args={[0.028, plateH, Math.max(0.018, frontZ - plateD / 2 + 0.008)]} />
            <meshStandardMaterial color="#1b1f27" roughness={0.5} metalness={0.6} />
          </mesh>
          {/* 向上弯折的防滑挡唇 + 硅胶条 */}
          <RoundedBox
            args={[0.028, 0.017, 0.004]}
            radius={0.0015}
            smoothness={2}
            position={[0, 0.007, 0.0025]}
            castShadow
          >
            <meshStandardMaterial color="#181b22" roughness={0.5} metalness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.007, 0.0002]}>
            <boxGeometry args={[0.024, 0.013, 0.0018]} />
            <meshStandardMaterial color="#101216" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

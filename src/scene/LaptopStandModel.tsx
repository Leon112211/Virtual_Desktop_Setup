// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { ExtrudeGeometry, Path, Shape } from 'three';
import type { LaptopStandSettings } from '../domain/laptop';
import type { Size } from '../domain/project';

/**
 * Builds the iconic Rain Design mStand 2.5 mm aluminum riser wall
 * with its punched Ø50.8 mm (2 in) circular rear cable routing hole.
 */
function buildMStandRiserWithCableHoleGeo(
  bottomWidth: number,
  topWidth: number,
  length: number,
  thickness: number,
  holeRadius = 0.0254,
): ExtrudeGeometry {
  const bhw = bottomWidth / 2;
  const thw = topWidth / 2;
  const hh = length / 2;
  const r = 0.008;
  const waistX = Math.min(bhw, thw) * 0.88;
  const shape = new Shape();
  shape.moveTo(-bhw + r, -hh);
  shape.lineTo(bhw - r, -hh);
  shape.quadraticCurveTo(bhw, -hh, bhw, -hh + r);
  // Subtle waisted hourglass side silhouette characteristic of Rain Design mStand
  shape.quadraticCurveTo(waistX, 0, thw, hh - r);
  shape.quadraticCurveTo(thw, hh, thw - r, hh);
  shape.lineTo(-thw + r, hh);
  shape.quadraticCurveTo(-thw, hh, -thw, hh - r);
  shape.quadraticCurveTo(-waistX, 0, -bhw, -hh + r);
  shape.quadraticCurveTo(-bhw, -hh, -bhw + r, -hh);

  const clampedHoleR = Math.min(holeRadius, waistX * 0.72, hh * 0.44);
  const hole = new Path();
  hole.absarc(0, -hh * 0.06, clampedHoleR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 28,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted aluminum laptop stand supporting three engineering configurations:
 * - `curveFlex`: Twelve South Curve Flex (264 × 224 mm, 30–274 mm, 185 mm inner leg gap, 0°–45°)
 * - `mStand`: Rain Design mStand (253 × 190 × 150 mm, 2.5 mm unibody aluminum, Ø50.8 mm rear cable hole)
 * - `vertical`: Clamped upright vertical laptop dock
 */
export function LaptopStandModel({
  size,
  color,
  stand,
}: {
  size: Size;
  color: string;
  stand: LaptopStandSettings;
}) {
  const { width: w, depth: d } = size;
  const isMStand = stand.model === 'mStand';

  const mStandRiserLen = 0.137;
  const mStandRiserGeo = useMemo(
    () =>
      isMStand
        ? buildMStandRiserWithCableHoleGeo(0.242, 0.19, mStandRiserLen, 0.0025, 0.0254)
        : null,
    [isMStand],
  );
  useEffect(() => () => mStandRiserGeo?.dispose(), [mStandRiserGeo]);

  if (stand.mode === 'vertical') {
    const baseH = 0.02;
    const wallH = Math.max(0.06, size.height * 0.62);
    const slotGap = 0.024;
    return (
      <group>
        {/* 加重 CNC 底座与底面防滑硅胶条 */}
        <RoundedBox
          args={[w * 0.72, baseH, d * 0.68]}
          radius={0.006}
          smoothness={3}
          position={[0, baseH / 2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} metalness={0.74} roughness={0.3} />
        </RoundedBox>
        {[-1, 1].map((side) => (
          <group key={side}>
            <RoundedBox
              args={[w * 0.54, wallH, 0.011]}
              radius={0.0045}
              smoothness={3}
              position={[0, baseH + wallH / 2 - 0.004, side * (slotGap / 2 + 0.0075)]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color={color} metalness={0.74} roughness={0.3} />
            </RoundedBox>
            {/* 内侧硅胶护垫防刮条 */}
            <RoundedBox
              args={[w * 0.48, wallH * 0.84, 0.002]}
              radius={0.001}
              smoothness={2}
              position={[0, baseH + wallH / 2 - 0.002, side * (slotGap / 2 + 0.0015)]}
            >
              <meshStandardMaterial color="#1f242c" roughness={0.82} />
            </RoundedBox>
          </group>
        ))}
      </group>
    );
  }

  // ======================== Rain Design mStand (253 × 190 × 150 mm 一体成型固定支架) ========================
  if (isMStand && mStandRiserGeo) {
    const mW = 0.253;
    const mBaseD = 0.184;
    const sheetT = 0.0025; // 2.5 mm aluminum sheet thickness per official spec
    const tiltRad = (18 * Math.PI) / 180;
    const elev = 0.118; // Top rear edge reaches 150 mm above desk

    // Riser connects rear of base (z = -0.088, y = 0.003) up/forward into underside of tilted deck (z = -0.036, y = 0.126)
    const riserMidZ = -0.0615;
    const riserMidY = 0.065;
    const riserPitch = Math.atan2(0.052, 0.123);

    return (
      <group>
        {/* 1. 底部橡胶垫片 + 253 × 184 × 2.5 mm 底座铝板 */}
        {[-1, 1].map((side) => (
          <mesh key={`ms-pad-${side}`} position={[side * 0.105, 0.0006, 0]} receiveShadow>
            <boxGeometry args={[0.014, 0.0012, mBaseD * 0.88]} />
            <meshStandardMaterial color="#191d24" roughness={0.88} />
          </mesh>
        ))}
        <RoundedBox
          args={[mW, sheetT, mBaseD]}
          radius={0.0012}
          smoothness={2}
          position={[0, 0.0012 + sheetT / 2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} metalness={0.78} roughness={0.28} />
        </RoundedBox>

        {/* 2. 后部圆弧过渡 + 收腰一体化倾斜支撑臂（含 Ø50.8 mm 穿孔理线圆孔） */}
        <mesh
          position={[0, 0.0035, -0.088]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.0026, 0.0026, 0.228, 14]} />
          <meshStandardMaterial color={color} metalness={0.78} roughness={0.28} />
        </mesh>
        <mesh
          geometry={mStandRiserGeo}
          position={[0, riserMidY, riserMidZ]}
          rotation={[riserPitch, 0, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} metalness={0.78} roughness={0.28} />
        </mesh>

        {/* 3. 18° 固定倾角 2.5 mm 承托铝板（硅胶防滑条上表面位于局部 y = 0 以便笔记本严格贴合） */}
        <group position={[0, elev, 0]} rotation={[tiltRad, 0, 0]}>
          <RoundedBox
            args={[mW, sheetT, 0.186]}
            radius={0.0012}
            smoothness={2}
            position={[0, -sheetT / 2 - 0.0012, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} metalness={0.78} roughness={0.28} />
          </RoundedBox>
          {/* 顶部防滑双硅胶护条 (y = -0.0012 .. 0) */}
          {[-0.088, 0.088].map((sx, idx) => (
            <RoundedBox
              key={`ms-grip-${idx}`}
              args={[0.012, 0.0014, 0.16]}
              radius={0.0005}
              smoothness={2}
              position={[sx, -0.0007, 0]}
            >
              <meshStandardMaterial color="#1b2028" roughness={0.85} />
            </RoundedBox>
          ))}
          {/* 两侧圆角前挡止滑勾手（紧密衔接托板前缘，中央留出充足开盖拨槽） */}
          {[-0.09, 0.09].map((lx, idx) => (
            <group key={`ms-lip-${idx}`} position={[lx, 0, 0.092]}>
              <RoundedBox
                args={[0.036, 0.0095, 0.004]}
                radius={0.0015}
                smoothness={2}
                position={[0, 0.0015, 0.0015]}
                castShadow
              >
                <meshStandardMaterial color={color} metalness={0.78} roughness={0.28} />
              </RoundedBox>
              <RoundedBox
                args={[0.032, 0.006, 0.002]}
                radius={0.0008}
                smoothness={2}
                position={[0, 0.003, -0.0005]}
              >
                <meshStandardMaterial color="#1a1e25" roughness={0.85} />
              </RoundedBox>
            </group>
          ))}
        </group>
      </group>
    );
  }

  // ======================== Twelve South Curve Flex (264 × 224 mm, 185 mm 内距, 30–274 mm / 0°–45°) ========================
  const cfW = 0.264;
  const cfD = 0.224;
  const innerLegGap = 0.185; // 185 mm official clear spacing between separated base legs
  const legW = 0.013;
  const legH = 0.0085;
  const legX = innerLegGap / 2 + legW / 2; // ±99 mm centers -> 185 mm exact clear gap
  const elev = stand.elevation;
  const tiltRad = (stand.tiltDeg * Math.PI) / 180;

  // Lower rear hinges & articulated twin riser kinematics linking base legs to top cradle rails
  const lowerHingeY = legH + 0.005;
  const lowerHingeZ = -cfD * 0.34;
  const upperHingeY = Math.max(lowerHingeY + 0.008, elev - 0.011);
  const upperHingeZ = -cfD * 0.05;
  const armDy = upperHingeY - lowerHingeY;
  const armDz = upperHingeZ - lowerHingeZ;
  const armLen = Math.max(0.03, Math.hypot(armDy, armDz));
  const armPitch = Math.atan2(armDz, armDy);
  const armMidY = (lowerHingeY + upperHingeY) / 2;
  const armMidZ = (lowerHingeZ + upperHingeZ) / 2;

  const topRailX = cfW / 2 - 0.016; // Flared cradle rails spanning full 264 mm outer width

  return (
    <group>
      {/* 1. 分离式双底脚（精确 185 mm 内侧净距 + 底面防滑硅胶条） */}
      {[-1, 1].map((side) => (
        <group key={`cf-leg-${side}`} position={[side * legX, 0, 0]}>
          <RoundedBox
            args={[legW, legH, cfD * 0.94]}
            radius={0.0038}
            smoothness={3}
            position={[0, legH / 2 + 0.001, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
          </RoundedBox>
          <mesh position={[0, 0.0006, 0]} receiveShadow>
            <boxGeometry args={[legW * 0.78, 0.0012, cfD * 0.88]} />
            <meshStandardMaterial color="#181c22" roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* 2. 后部一体横梁 + 左右精密圆筒下铰链 */}
      <RoundedBox
        args={[innerLegGap + legW * 1.4, 0.011, 0.014]}
        radius={0.004}
        smoothness={3}
        position={[0, lowerHingeY, lowerHingeZ]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <group key={`cf-arm-grp-${side}`}>
          {/* 下部圆筒铰链关节 */}
          <mesh
            position={[side * legX, lowerHingeY, lowerHingeZ]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.0082, 0.0082, legW + 0.004, 24]} />
            <meshStandardMaterial color="#2a313c" metalness={0.65} roughness={0.35} />
          </mesh>
          {/* 可调斜向双升降立臂 */}
          <RoundedBox
            args={[legW * 0.92, armLen, 0.012]}
            radius={0.003}
            smoothness={2}
            position={[side * legX, armMidY, armMidZ]}
            rotation={[armPitch, 0, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
          </RoundedBox>
          {/* 上部圆筒铰链关节 + 横向承托支臂连接 */}
          <mesh
            position={[side * legX, upperHingeY, upperHingeZ]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.0078, 0.0078, legW + 0.004, 24]} />
            <meshStandardMaterial color="#2a313c" metalness={0.65} roughness={0.35} />
          </mesh>
          <RoundedBox
            args={[Math.abs(topRailX - legX) + 0.014, 0.009, 0.014]}
            radius={0.003}
            smoothness={2}
            position={[side * ((legX + topRailX) / 2), upperHingeY, upperHingeZ]}
            castShadow
          >
            <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
          </RoundedBox>
        </group>
      ))}

      {/* 3. 顶部双翼硅胶防滑承托轨道（0°–45° 可调倾角，硅胶上表面严格齐平局部 y = 0） */}
      <group position={[0, elev, 0]} rotation={[tiltRad, 0, 0]}>
        <RoundedBox
          args={[topRailX * 2, 0.007, 0.012]}
          radius={0.0025}
          smoothness={2}
          position={[0, -0.006, upperHingeZ]}
          castShadow
        >
          <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
        </RoundedBox>
        {[-1, 1].map((side) => (
          <group key={`cf-rail-${side}`} position={[side * topRailX, 0, 0]}>
            {/* 流线型铝制承托翼臂 */}
            <RoundedBox
              args={[0.016, 0.007, cfD]}
              radius={0.003}
              smoothness={3}
              position={[0, -0.0048, 0.004]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
            </RoundedBox>
            {/* 顶面高摩擦黑色硅胶条 (y = -0.0014 .. 0) */}
            <RoundedBox
              args={[0.012, 0.0016, cfD * 0.88]}
              radius={0.0006}
              smoothness={2}
              position={[0, -0.0008, 0]}
            >
              <meshStandardMaterial color="#1a1e26" roughness={0.86} />
            </RoundedBox>
            {/* 无缝连接于承托翼臂前端的弯曲弧形止滑护钩 */}
            <group position={[0, 0, cfD / 2 + 0.004]}>
              <RoundedBox
                args={[0.016, 0.013, 0.0045]}
                radius={0.0016}
                smoothness={2}
                position={[0, 0.0018, 0.0015]}
                castShadow
              >
                <meshStandardMaterial color={color} metalness={0.76} roughness={0.28} />
              </RoundedBox>
              <RoundedBox
                args={[0.012, 0.0085, 0.0022]}
                radius={0.0008}
                smoothness={2}
                position={[0, 0.0032, -0.0005]}
              >
                <meshStandardMaterial color="#1a1e26" roughness={0.86} />
              </RoundedBox>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

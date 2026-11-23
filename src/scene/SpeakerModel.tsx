// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import {
  CanvasTexture,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  Shape,
  SRGBColorSpace,
  Vector2,
} from 'three';
import type { Size } from '../domain/project';
import { defaultSpeakerSettings, speakerPresetById, type SpeakerSettings } from '../domain/speaker';
import { PortSocket } from './PortSocket';

/**
 * Generates a staggered circular micro-perforated steel dome grille CanvasTexture
 * with subtle inner acoustic dome sheen matching modern studio monitors.
 */
function makeTweeterMeshTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  const baseGrad = ctx.createRadialGradient(cx - 18, cy - 18, 6, cx, cy, 128);
  baseGrad.addColorStop(0, '#5a6372');
  baseGrad.addColorStop(0.45, '#2b313c');
  baseGrad.addColorStop(1, '#12151b');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  const stepX = 11;
  const stepY = 9.5;
  for (let row = 0, y = 4; y <= size; row++, y += stepY) {
    const offsetX = row % 2 === 1 ? stepX * 0.5 : 0;
    for (let x = 4 + offsetX; x <= size; x += stepX) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > 122) continue;
      ctx.fillStyle = dist < 56 ? '#0c0f14' : '#07090c';
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a radial spun-brushed metallic aluminum texture for the central woofer phase cap.
 */
function makeSpunAluminumCapTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#c8cfd8';
  ctx.fillRect(0, 0, size, size);

  for (let a = 0; a < 36; a++) {
    const rad = (a * Math.PI * 2) / 36;
    const shade = 0.08 + 0.1 * Math.sin(rad * 2 + 0.6);
    ctx.fillStyle = shade > 0.12 ? `rgba(255,255,255,${shade})` : `rgba(30,41,59,${0.13 - shade})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 130, rad, rad + (Math.PI * 2) / 36);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 1;
  for (let r = 8; r < 126; r += 4) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the pierced acoustic front baffle plate with true circular tweeter & woofer openings
 * so deeply recessed driver cones, waveguides, and phase caps remain genuinely unobscured.
 */
function buildFrontBaffleGeometry(
  width: number,
  height: number,
  cornerR: number,
  tweeterLocalY: number,
  tweeterHoleR: number,
  wooferLocalY: number,
  wooferHoleR: number,
): ExtrudeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(cornerR, hw * 0.45, hh * 0.45);
  const shape = new Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r);
  shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh);
  shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r);
  shape.absarc(-hw + r, -hh + r, r, Math.PI, (3 * Math.PI) / 2, false);
  shape.closePath();

  const tweeterHole = new Path();
  tweeterHole.absarc(0, tweeterLocalY, tweeterHoleR, 0, Math.PI * 2, true);
  shape.holes.push(tweeterHole);

  const wooferHole = new Path();
  wooferHole.absarc(0, wooferLocalY, wooferHoleR, 0, Math.PI * 2, true);
  shape.holes.push(wooferHole);

  const geo = new ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 28,
  });
  geo.translate(0, 0, -0.008);
  geo.computeVertexNormals();
  return geo;
}

function buildTweeterWaveguideGeo(outerR: number): LatheGeometry {
  const innerR = outerR * 0.6;
  const midR = outerR * 0.82;
  // Ordered outer -> inner so LatheGeometry normals (after +90° X rotation) face outward (+Z)
  const pts = [
    new Vector2(outerR, 0.0004),
    new Vector2(outerR * 0.97, 0.0018),
    new Vector2(midR, -0.0004),
    new Vector2(innerR, -0.0046),
    new Vector2(innerR * 0.94, -0.0056),
  ];
  const geo = new LatheGeometry(pts, 40);
  geo.computeVertexNormals();
  return geo;
}

function buildWooferTrimGeo(outerR: number): LatheGeometry {
  const innerR = outerR * 0.78;
  // Ordered outer -> inner for front-facing (+Z) surface normals
  const pts = [
    new Vector2(outerR, 0.0004),
    new Vector2(outerR * 0.94, 0.0022),
    new Vector2(innerR, 0.0012),
    new Vector2(innerR * 0.94, -0.0018),
  ];
  const geo = new LatheGeometry(pts, 48);
  geo.computeVertexNormals();
  return geo;
}

function buildWooferConeGeo(outerR: number): LatheGeometry {
  const rimR = outerR * 0.75;
  const capR = outerR * 0.27;
  const depth = Math.min(0.0105, outerR * 0.21);
  const steps = 12;
  const pts: Vector2[] = [];
  // Ordered outer rim -> inner dust cap throat so front-facing normals point toward (+Z) viewer
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const r = capR + (rimR - capR) * t;
    const z = -depth + (depth + 0.0008) * Math.pow(t, 1.45);
    pts.push(new Vector2(r, z));
  }
  const geo = new LatheGeometry(pts, 48);
  geo.computeVertexNormals();
  return geo;
}

function buildPhaseCapGeo(outerR: number): LatheGeometry {
  const capR = outerR * 0.29;
  const baseZ = -Math.min(0.0105, outerR * 0.21);
  const peakRise = capR * 0.34;
  const steps = 12;
  const pts: Vector2[] = [];
  // Ordered outer rim -> center apex so dome faces strictly outward (+Z)
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const r = capR * t;
    const z = baseZ + peakRise * Math.cos((t * Math.PI) / 2);
    pts.push(new Vector2(r, z));
  }
  const geo = new LatheGeometry(pts, 40);
  // Assign planar [0..1] disk UVs so radial brushed aluminum texture maps cleanly without seam
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / (capR * 2) + 0.5, -pos.getZ(i) / (capR * 2) + 0.5);
    }
    uv.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * 1:1 physically proportioned active/passive desktop monitor & bookshelf speaker.
 * Spans y = [0, size.height], centered on X/Z with front acoustic baffle at +size.depth/2
 * and rear amplifier/terminal backplate at -size.depth/2 aligned with `devicePorts()`.
 */
export function SpeakerModel({
  size,
  color,
  speaker,
}: {
  size: Size;
  color: string;
  speaker?: SpeakerSettings;
}) {
  const { width: w, height: h, depth: d } = size;
  const cfg = speaker ?? defaultSpeakerSettings('active');
  const spec = speakerPresetById(cfg.model);
  const isPassive = cfg.role === 'passive';
  const isMr4 = cfg.model === 'edifierMr4';

  const footH = 0.004;
  const cabH = Math.max(0.08, h - footH);
  const cabY = footH + cabH / 2;
  const bevelR = Math.min(0.008, w * 0.06, cabH * 0.05);

  const wooferOuterR = Math.min(w * 0.39, cabH * 0.24);
  const wooferY = footH + cabH * 0.39;
  const tweeterOuterR = Math.min(w * 0.24, cabH * 0.142);
  const tweeterY = footH + cabH * 0.775;
  const rearZ = -d / 2;
  const frontZ = d / 2;

  const tweeterMeshTex = useMemo(makeTweeterMeshTexture, []);
  const spunCapTex = useMemo(makeSpunAluminumCapTexture, []);

  const frontBaffleGeo = useMemo(
    () =>
      buildFrontBaffleGeometry(
        w * 0.955,
        cabH * 0.96,
        bevelR * 0.78,
        tweeterY - cabY,
        tweeterOuterR * 0.85,
        wooferY - cabY,
        wooferOuterR * 0.86,
      ),
    [w, cabH, bevelR, tweeterY, cabY, tweeterOuterR, wooferY, wooferOuterR],
  );
  const waveguideGeo = useMemo(() => buildTweeterWaveguideGeo(tweeterOuterR), [tweeterOuterR]);
  const wooferTrimGeo = useMemo(() => buildWooferTrimGeo(wooferOuterR), [wooferOuterR]);
  const wooferConeGeo = useMemo(() => buildWooferConeGeo(wooferOuterR), [wooferOuterR]);
  const phaseCapGeo = useMemo(() => buildPhaseCapGeo(wooferOuterR), [wooferOuterR]);

  useEffect(() => () => tweeterMeshTex.dispose(), [tweeterMeshTex]);
  useEffect(() => () => spunCapTex.dispose(), [spunCapTex]);
  useEffect(
    () => () => {
      frontBaffleGeo.dispose();
      waveguideGeo.dispose();
      wooferTrimGeo.dispose();
      wooferConeGeo.dispose();
      phaseCapGeo.dispose();
    },
    [frontBaffleGeo, waveguideGeo, wooferTrimGeo, wooferConeGeo, phaseCapGeo],
  );

  const badgeY = footH + cabH * 0.072;

  return (
    <group>
      {/* 4× 底部 Iso-Pod 减震硅胶垫脚 */}
      {[
        [-w * 0.36, -d * 0.36],
        [w * 0.36, -d * 0.36],
        [-w * 0.36, d * 0.36],
        [w * 0.36, d * 0.36],
      ].map(([fx, fz], idx) => (
        <mesh key={`foot-${idx}`} position={[fx, footH / 2, fz]} castShadow receiveShadow>
          <cylinderGeometry args={[0.009, 0.011, footH, 14]} />
          <meshStandardMaterial color="#181c23" roughness={0.85} />
        </mesh>
      ))}

      {/* 主箱体外壳（后置留出 17 mm 真实前障板内凹腔体深度） */}
      <RoundedBox
        args={[w, cabH, Math.max(0.04, d - 0.017)]}
        radius={bevelR}
        smoothness={3}
        position={[0, cabY, -0.0085]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.04} />
      </RoundedBox>

      {/* 前障板外框暗缝与内腔吸音背衬（不遮挡穿孔开槽内的单元振膜） */}
      <RoundedBox
        args={[w * 0.96, cabH * 0.965, 0.006]}
        radius={bevelR * 0.78}
        smoothness={2}
        position={[0, cabY, frontZ - 0.0145]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#101318" roughness={0.85} />
      </RoundedBox>

      {/* 真开孔前声学面板（与主体同色工艺面板，高音/低音真实穿孔内凹呈现） */}
      <mesh
        geometry={frontBaffleGeo}
        position={[0, cabY, frontZ - 0.0012]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.04} />
      </mesh>

      {/* 上部高音单元：哑光黑浅波导喉圈 + 六角网孔防尘半球金属护网 */}
      <group position={[0, tweeterY, frontZ]}>
        <mesh geometry={waveguideGeo} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color="#161a20" roughness={0.46} metalness={0.18} />
        </mesh>
        <mesh
          position={[0, 0, -0.0046]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, 0.42, 1]}
          castShadow
          receiveShadow
        >
          <sphereGeometry
            args={[tweeterOuterR * 0.62, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]}
          />
          <meshStandardMaterial map={tweeterMeshTex} roughness={0.4} metalness={0.48} />
        </mesh>
      </group>

      {/* 下部中低音锥盆单元：宽幅黑饰圈 + 圆润橡胶半卷悬边 + 内凹振膜锥盆 + 拉丝银金属相位帽 */}
      <group position={[0, wooferY, frontZ]}>
        <mesh geometry={wooferTrimGeo} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color="#15181e" roughness={0.44} metalness={0.18} />
        </mesh>
        <mesh position={[0, 0, 0.0012]} receiveShadow>
          <torusGeometry args={[wooferOuterR * 0.74, wooferOuterR * 0.072, 16, 48]} />
          <meshStandardMaterial color="#1b2028" roughness={0.34} metalness={0.12} />
        </mesh>
        <mesh geometry={wooferConeGeo} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial
            color={cfg.model === 'kantoYu4' ? '#242a34' : '#181c24'}
            roughness={0.48}
            metalness={0.14}
          />
        </mesh>
        <mesh geometry={phaseCapGeo} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial
            map={spunCapTex}
            color="#e2e8f0"
            metalness={0.62}
            roughness={0.24}
          />
        </mesh>
      </group>

      {/* 右下角精密微光待机指示灯（有源主箱 / 独立监听亮起） */}
      <mesh position={[w * 0.34, badgeY, frontZ + 0.0005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0015, 0.0015, 0.001, 12]} />
        <meshStandardMaterial
          color={isPassive ? '#64748b' : '#fbbf24'}
          emissive={isPassive ? '#000000' : '#f59e0b'}
          emissiveIntensity={isPassive ? 0 : 0.75}
          metalness={0.3}
          roughness={0.35}
        />
      </mesh>

      {/* Edifier MR4 专属前面板旋钮与前置 3.5mm AUX 监听口 */}
      {isMr4 && !isPassive && (
        <>
          <mesh
            position={[w * 0.34, h * 0.095, frontZ + 0.0032]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.0075, 0.0085, 0.006, 20]} />
            <meshStandardMaterial color="#2c333f" metalness={0.76} roughness={0.28} />
          </mesh>
          <PortSocket kind="trs35" position={[-w * 0.34, h * 0.095, frontZ + 0.0005]} />
        </>
      )}

      {/* ==================== 背面声学倒相孔与 1:1 真实接口背板 ==================== */}

      {/* 上部低音倒相管（Bass Reflex Port） */}
      <group
        position={[0, h * (isPassive ? 0.72 : 0.78), rearZ + 0.002]}
        rotation={[0, Math.PI, 0]}
      >
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry
            args={[Math.min(w * 0.15, 0.018), Math.min(w * 0.14, 0.016), 0.006, 20]}
          />
          <meshStandardMaterial color="#161920" roughness={0.62} />
        </mesh>
        <mesh position={[0, 0, 0.0015]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry
            args={[Math.min(w * 0.11, 0.013), Math.min(w * 0.11, 0.013), 0.005, 18]}
          />
          <meshStandardMaterial color="#05070a" roughness={0.85} />
        </mesh>
      </group>

      {isPassive ? (
        /* 无源副箱：紧凑端子安装碗 + 1 对红黑 4 mm 镀金音箱接线柱 */
        <group>
          <RoundedBox
            args={[w * 0.56, cabH * 0.28, 0.004]}
            radius={0.004}
            smoothness={2}
            position={[0, h * 0.25, rearZ + 0.001]}
          >
            <meshStandardMaterial color="#1a1f27" roughness={0.55} />
          </RoundedBox>
          <PortSocket
            kind="bindingPost"
            position={[0, h * 0.25, rearZ]}
            rotation={[0, Math.PI, 0]}
          />
        </group>
      ) : (
        /* 有源主箱 / 独立有源监听：阳极黑铝背板 + I/O 与功放电源插座阵列 */
        <group>
          <RoundedBox
            args={[w * 0.78, cabH * 0.56, 0.004]}
            radius={0.004}
            smoothness={2}
            position={[0, h * 0.34, rearZ + 0.001]}
          >
            <meshStandardMaterial color="#181c24" metalness={0.32} roughness={0.48} />
          </RoundedBox>

          {/* 功放拨片开关 */}
          <mesh position={[-w * 0.24, h * 0.54, rearZ - 0.001]}>
            <boxGeometry args={[0.012, 0.018, 0.003]} />
            <meshStandardMaterial color="#272d38" roughness={0.52} />
          </mesh>

          {cfg.role === 'active' && (
            <PortSocket
              kind="bindingPost"
              position={[w * 0.22, h * 0.22, rearZ]}
              rotation={[0, Math.PI, 0]}
            />
          )}

          {spec.hasUsbC && (
            <PortSocket
              kind="usbc"
              position={[w * 0.22, h * 0.44, rearZ]}
              rotation={[0, Math.PI, 0]}
            />
          )}

          {spec.hasAux35 && !spec.auxOnFront && (
            <PortSocket
              kind="trs35"
              position={[w * 0.04, h * 0.36, rearZ]}
              rotation={[0, Math.PI, 0]}
            />
          )}

          {spec.hasRca && (
            <PortSocket
              kind="rca"
              position={[-w * 0.2, h * 0.36, rearZ]}
              rotation={[0, Math.PI, 0]}
            />
          )}

          {spec.hasOptical && (
            <PortSocket
              kind="optical"
              position={[-w * 0.02, h * 0.47, rearZ]}
              rotation={[0, Math.PI, 0]}
            />
          )}

          {spec.hasTrs635 && (
            <PortSocket
              kind="trs635"
              position={[w * 0.16, h * 0.39, rearZ]}
              rotation={[0, Math.PI, 0]}
            />
          )}

          <PortSocket
            kind="powerAc"
            position={[-w * 0.22, h * 0.14, rearZ]}
            rotation={[0, Math.PI, 0]}
          />
        </group>
      )}
    </group>
  );
}

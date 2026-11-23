// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useMemo } from 'react';
import { CanvasTexture, ExtrudeGeometry, SRGBColorSpace, Shape } from 'three';
import type { Size } from '../domain/project';
import { PortSocket } from './PortSocket';

function squircleGeometry(
  width: number,
  depth: number,
  height: number,
  cornerR: number,
  bevel = 0.0016,
): ExtrudeGeometry {
  const hw = Math.max(0.01, width / 2 - bevel);
  const hd = Math.max(0.01, depth / 2 - bevel);
  const r = Math.min(cornerR, hw - 0.002, hd - 0.002);
  const extrudeDepth = Math.max(0.004, height - bevel * 2);

  const shape = new Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hd - r);
  shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hd);
  shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hd + r);
  shape.absarc(-hw + r, -hd + r, r, Math.PI, (3 * Math.PI) / 2, false);
  shape.closePath();

  const geo = new ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a transparent-background high-density staggered circular CNC thermal exhaust
 * perforation array so only the recessed vents are dark while the aluminum shell shows through.
 */
function makeStudioExhaustTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rows = 22;
  const cols = 60;
  const padX = 24;
  const padY = 22;
  const stepX = (canvas.width - padX * 2) / (cols - 1);
  const stepY = (canvas.height - padY * 2) / (rows - 1);

  ctx.fillStyle = '#0b0d12';
  for (let row = 0; row < rows; row++) {
    const offsetX = row % 2 === 1 ? stepX * 0.5 : 0;
    for (let col = 0; col < cols; col++) {
      const cx = padX + col * stepX + offsetX;
      if (cx > canvas.width - 18) continue;
      const cy = padY + row * stepY;
      ctx.beginPath();
      ctx.arc(cx, cy, 7.6, 0, Math.PI * 2);
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
 * Generates the fine staggered circular intake grille texture for the Mac Studio tapered bottom base.
 */
function makeStudioBaseMeshTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#adb4be';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#8b929e';
  ctx.fillRect(0, 0, canvas.width, 14);
  ctx.fillRect(0, canvas.height - 16, canvas.width, 16);

  const rows = 8;
  const cols = 160;
  const stepX = canvas.width / cols;
  const stepY = (canvas.height - 30) / rows;
  ctx.fillStyle = '#181c24';
  for (let r = 0; r < rows; r++) {
    const ox = r % 2 === 1 ? stepX * 0.5 : 0;
    const cy = 18 + r * stepY;
    for (let c = 0; c < cols; c++) {
      const cx = (c * stepX + ox) % canvas.width;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.1, 0, Math.PI * 2);
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
 * Generates the laser-etched rear port legend (⚡, <•••>, USB trident, HDMI, headphone icon)
 * and the flush circular power button with standby icon (⏻) for Mac Studio.
 */
function makeStudioRearIconsTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 240;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ink = '#3c424d';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const iconY = 48;

  // 1. Thunderbolt bolt (⚡) above 2nd TB5 port at u = 0.5 - 0.295 = 0.205
  const xTb = canvas.width * (0.5 - 0.295);
  ctx.beginPath();
  ctx.moveTo(xTb + 4, iconY - 13);
  ctx.lineTo(xTb - 6, iconY + 1);
  ctx.lineTo(xTb + 1, iconY + 1);
  ctx.lineTo(xTb - 4, iconY + 13);
  ctx.lineTo(xTb + 7, iconY - 2);
  ctx.lineTo(xTb, iconY - 2);
  ctx.closePath();
  ctx.fill();

  // 2. Ethernet symbol (<•••>) above RJ45 at u = 0.5 - 0.122 = 0.378
  const xEth = canvas.width * (0.5 - 0.122);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(xEth - 11, iconY - 7);
  ctx.lineTo(xEth - 17, iconY);
  ctx.lineTo(xEth - 11, iconY + 7);
  ctx.moveTo(xEth + 11, iconY - 7);
  ctx.lineTo(xEth + 17, iconY);
  ctx.lineTo(xEth + 11, iconY + 7);
  ctx.stroke();
  for (const dx of [-5.5, 0, 5.5]) {
    ctx.beginPath();
    ctx.arc(xEth + dx, iconY, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. USB trident icon above the 2 USB-A ports at u = 0.5 + 0.134 = 0.634
  const xUsb = canvas.width * (0.5 + 0.134);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(xUsb, iconY + 11);
  ctx.lineTo(xUsb, iconY - 11);
  ctx.moveTo(xUsb - 6, iconY + 3);
  ctx.lineTo(xUsb, iconY + 7);
  ctx.moveTo(xUsb - 6, iconY + 3);
  ctx.lineTo(xUsb - 6, iconY - 4);
  ctx.moveTo(xUsb + 6, iconY + 1);
  ctx.lineTo(xUsb, iconY + 5);
  ctx.moveTo(xUsb + 6, iconY + 1);
  ctx.lineTo(xUsb + 6, iconY - 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(xUsb, iconY + 11, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // 4. HDMI text at u = 0.5 + 0.255 = 0.755
  const xHdmi = canvas.width * (0.5 + 0.255);
  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HDMI', xHdmi, iconY + 1);

  // 5. Headphone icon above 3.5 mm jack at u = 0.5 + 0.340 = 0.840
  const xHp = canvas.width * (0.5 + 0.34);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(xHp, iconY + 1, 8, Math.PI * 0.85, Math.PI * 0.15, false);
  ctx.stroke();
  ctx.fillRect(xHp - 9.5, iconY, 3.2, 6.5);
  ctx.fillRect(xHp + 6.3, iconY, 3.2, 6.5);

  // 6. Flush circular Power Button seam ring + standby symbol (⏻) at u = 0.5 + 0.402 = 0.902
  const xPwr = canvas.width * (0.5 + 0.402);
  const yPwr = 148;
  ctx.strokeStyle = '#6c7380';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(xPwr, yPwr, 32, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#383e48';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.arc(xPwr, yPwr + 1, 10.5, -Math.PI * 0.3, Math.PI * 1.3, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xPwr, yPwr - 12);
  ctx.lineTo(xPwr, yPwr - 1);
  ctx.stroke();

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a radial louvered cooling-fin texture for the Mac mini M4 tapered black thermal base.
 */
function makeMiniVentPedestalTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top & bottom solid structural rings
  ctx.fillStyle = '#15181e';
  ctx.fillRect(0, 0, canvas.width, 16);
  ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

  // Vertical radial intake/exhaust louvers
  const finCount = 88;
  const step = canvas.width / finCount;
  for (let i = 0; i < finCount; i++) {
    const x = i * step;
    ctx.fillStyle = '#07090c';
    ctx.fillRect(x + step * 0.22, 16, step * 0.58, canvas.height - 36);
    ctx.fillStyle = '#2c313b';
    ctx.fillRect(x, 16, step * 0.22, canvas.height - 36);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates the transparent laser-etched rear port legend strip (~, <...>, HDMI, Thunderbolt bolt)
 * for the Mac mini M4 anodized aluminum rear wall.
 */
function makeMiniRearIconsTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ink = '#3c424d';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cy = 54;

  // 1. AC Power sine wave (~) at u = 0.5 - 0.258 = 0.242
  const xAc = canvas.width * (0.5 - 0.258);
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(xAc - 15, cy);
  ctx.bezierCurveTo(xAc - 8, cy - 10, xAc - 3, cy - 10, xAc, cy);
  ctx.bezierCurveTo(xAc + 3, cy + 10, xAc + 8, cy + 10, xAc + 15, cy);
  ctx.stroke();

  // 2. Ethernet symbol (<•••>) at u = 0.5 - 0.082 = 0.418
  const xEth = canvas.width * (0.5 - 0.082);
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(xEth - 12, cy - 8);
  ctx.lineTo(xEth - 19, cy);
  ctx.lineTo(xEth - 12, cy + 8);
  ctx.moveTo(xEth + 12, cy - 8);
  ctx.lineTo(xEth + 19, cy);
  ctx.lineTo(xEth + 12, cy + 8);
  ctx.stroke();
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.arc(xEth + dx, cy, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. HDMI label at u = 0.5 + 0.068 = 0.568
  const xHdmi = canvas.width * (0.5 + 0.068);
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HDMI', xHdmi, cy + 1);

  // 4. Thunderbolt lightning bolt at u = 0.5 + 0.258 = 0.758
  const xTb = canvas.width * (0.5 + 0.258);
  ctx.beginPath();
  ctx.moveTo(xTb + 4, cy - 14);
  ctx.lineTo(xTb - 7, cy + 1);
  ctx.lineTo(xTb + 1, cy + 1);
  ctx.lineTo(xTb - 4, cy + 14);
  ctx.lineTo(xTb + 8, cy - 2);
  ctx.lineTo(xTb, cy - 2);
  ctx.closePath();
  ctx.fill();

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function MacDesktopModel({
  kind,
  size,
  color,
}: {
  kind: 'macMini' | 'macStudio';
  size: Size;
  color: string;
}) {
  const { width: w, height: h, depth: d } = size;
  const isStudio = kind === 'macStudio';
  const isM4Mini = kind === 'macMini' && w < 0.16;

  // Pedestal elevates aluminum chassis per Mac mini (7.0 mm louvered base) / Studio (7.6 mm perforated mesh base)
  const pedestalH = isStudio ? 0.0076 : isM4Mini ? 0.007 : 0.0024;
  const bodyH = Math.max(0.01, h - pedestalH);
  const cornerR = isM4Mini ? 0.017 : 0.019;
  const minFootDim = Math.min(w, d);

  const bodyGeo = useMemo(
    () => squircleGeometry(w, d, bodyH, cornerR, isM4Mini ? 0.0007 : 0.0009),
    [w, d, bodyH, cornerR, isM4Mini],
  );
  const exhaustTex = useMemo(() => (isStudio ? makeStudioExhaustTexture() : null), [isStudio]);
  const studioBaseTex = useMemo(() => (isStudio ? makeStudioBaseMeshTexture() : null), [isStudio]);
  const studioRearIconsTex = useMemo(
    () => (isStudio ? makeStudioRearIconsTexture() : null),
    [isStudio],
  );
  const miniVentTex = useMemo(() => (isM4Mini ? makeMiniVentPedestalTexture() : null), [isM4Mini]);
  const miniRearIconsTex = useMemo(
    () => (isM4Mini ? makeMiniRearIconsTexture() : null),
    [isM4Mini],
  );

  useEffect(() => () => bodyGeo.dispose(), [bodyGeo]);
  useEffect(() => () => exhaustTex?.dispose(), [exhaustTex]);
  useEffect(() => () => studioBaseTex?.dispose(), [studioBaseTex]);
  useEffect(() => () => studioRearIconsTex?.dispose(), [studioRearIconsTex]);
  useEffect(() => () => miniVentTex?.dispose(), [miniVentTex]);
  useEffect(() => () => miniRearIconsTex?.dispose(), [miniRearIconsTex]);

  // Front port cluster elevation inside aluminum housing
  const frontY = isStudio
    ? pedestalH + bodyH * 0.21
    : isM4Mini
      ? pedestalH + bodyH * 0.42
      : pedestalH + bodyH * 0.38;

  const rearY = isStudio
    ? pedestalH + bodyH * 0.195
    : isM4Mini
      ? pedestalH + bodyH * 0.38
      : pedestalH + bodyH * 0.44;
  const rearSocketZ = -d / 2 - 0.00045;

  return (
    <group>
      {/* Machined 100% recycled anodized aluminum unibody shell (calibrated for uniform silver reflectance) */}
      <mesh geometry={bodyGeo} position={[0, pedestalH, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.14}
          metalness={0.22}
          roughness={0.38}
        />
      </mesh>

      {/* Lower thermal pedestal / base ring structure */}
      {isM4Mini ? (
        <group>
          {/* Tapered matte-black louvered circular thermal intake/exhaust base */}
          <mesh position={[0, pedestalH * 0.5, 0]} castShadow receiveShadow>
            <cylinderGeometry
              args={[minFootDim * 0.455, minFootDim * 0.37, pedestalH + 0.0004, 64]}
            />
            <meshStandardMaterial
              map={miniVentTex ?? undefined}
              emissiveMap={miniVentTex ?? undefined}
              emissive="#ffffff"
              emissiveIntensity={0.32}
              color="#ffffff"
              roughness={0.68}
              metalness={0.1}
            />
          </mesh>
          {/* Non-slip bottom rubber foot pad */}
          <mesh position={[0, 0.00045, 0]}>
            <cylinderGeometry args={[minFootDim * 0.37, minFootDim * 0.355, 0.0009, 48]} />
            <meshStandardMaterial color="#111318" roughness={0.88} metalness={0.04} />
          </mesh>
          {/* Flush underside power button tucked inside rear-left chamfer */}
          <group
            position={[w * 0.25, pedestalH * 0.68, -d * 0.25]}
            rotation={[Math.PI / 2 + 0.65, 0, -Math.PI / 4]}
          >
            <mesh>
              <cylinderGeometry args={[0.0038, 0.0038, 0.0008, 24]} />
              <meshStandardMaterial color="#2b303b" roughness={0.45} metalness={0.3} />
            </mesh>
          </group>
        </group>
      ) : isStudio ? (
        <group>
          {/* Tapered perforated silver-grey circular thermal intake base */}
          <mesh position={[0, pedestalH * 0.52, 0]} castShadow receiveShadow>
            <cylinderGeometry
              args={[minFootDim * 0.455, minFootDim * 0.38, pedestalH + 0.0004, 64]}
            />
            <meshStandardMaterial
              map={studioBaseTex ?? undefined}
              emissiveMap={studioBaseTex ?? undefined}
              emissive="#ffffff"
              emissiveIntensity={0.28}
              color="#ffffff"
              roughness={0.5}
              metalness={0.25}
            />
          </mesh>
          <mesh position={[0, 0.00045, 0]}>
            <cylinderGeometry args={[minFootDim * 0.38, minFootDim * 0.365, 0.0009, 48]} />
            <meshStandardMaterial color="#6e7582" roughness={0.65} metalness={0.2} />
          </mesh>
        </group>
      ) : (
        <mesh position={[0, pedestalH / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[minFootDim * 0.42, minFootDim * 0.41, pedestalH + 0.0004, 48]} />
          <meshStandardMaterial color="#191b22" roughness={0.65} metalness={0.12} />
        </mesh>
      )}

      {/* Front I/O & status LED (flush borderless Mac apertures machined directly into aluminum) */}
      {isM4Mini ? (
        <group>
          {/* Front from left to right: 2× vertical USB-C (left side), white status LED & 3.5 mm jack (right side) */}
          <group position={[-w * 0.295, frontY, d / 2]} rotation={[0, 0, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[-w * 0.175, frontY, d / 2]} rotation={[0, 0, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <mesh position={[w * 0.195, frontY, d / 2 + 0.00025]}>
            <sphereGeometry args={[0.00075, 12, 12]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#f8fafc"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
          <group position={[w * 0.295, frontY, d / 2]}>
            <PortSocket kind="trs35" borderless />
          </group>
        </group>
      ) : isStudio ? (
        <group>
          {/* Front: 2× vertical USB-C / TB5 on left, UHS-II SDXC slot, right-hand status LED */}
          <group position={[-w * 0.278, frontY, d / 2]} rotation={[0, 0, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[-w * 0.204, frontY, d / 2]} rotation={[0, 0, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[-w * 0.07, frontY - 0.0012, d / 2]}>
            <PortSocket kind="sd" borderless />
          </group>
          <mesh position={[w * 0.32, frontY - 0.0012, d / 2 + 0.00025]}>
            <sphereGeometry args={[0.00085, 12, 12]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#f8fafc"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </group>
      ) : (
        <mesh position={[w * 0.35, frontY, d / 2 + 0.0003]}>
          <sphereGeometry args={[0.0011, 10, 10]} />
          <meshStandardMaterial
            color="#f8fafc"
            emissive="#e2e8f0"
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Mac Studio upper rear CNC-perforated thermal exhaust holes directly over aluminum body */}
      {isStudio && exhaustTex && (
        <mesh
          position={[0, pedestalH + bodyH * 0.675, -d / 2 - 0.00018]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[w * 0.81, bodyH * 0.49]} />
          <meshStandardMaterial
            map={exhaustTex}
            transparent
            alphaTest={0.05}
            roughness={0.85}
            metalness={0.05}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* Mac Studio laser-etched rear port symbols (⚡, <•••>, USB, HDMI, 🎧) & flush power button (⏻) */}
      {isStudio && studioRearIconsTex && (
        <mesh position={[0, rearY + 0.0028, -d / 2 - 0.00018]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[w, w * (240 / 1536)]} />
          <meshStandardMaterial
            map={studioRearIconsTex}
            transparent
            alphaTest={0.05}
            roughness={0.45}
            metalness={0.2}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* Mac mini M4 laser-etched rear port symbols (~, <...>, HDMI, Thunderbolt) */}
      {isM4Mini && miniRearIconsTex && (
        <mesh position={[0, rearY + 0.009, -d / 2 - 0.00018]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[w, 0.011]} />
          <meshStandardMaterial
            map={miniRearIconsTex}
            transparent
            alphaTest={0.05}
            roughness={0.45}
            metalness={0.2}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* Rear sockets */}
      {isStudio ? (
        <group>
          {/* Left-to-right when viewing back: 4× vertical TB5, 10Gb RJ45, Cloverleaf AC power, 2× vertical USB-A, HDMI, 3.5mm audio, Power button */}
          <group position={[w * 0.345, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[w * 0.295, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[w * 0.245, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[w * 0.195, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group
            position={[w * 0.122, rearY, rearSocketZ]}
            rotation={[0, Math.PI, 0]}
            scale={[0.82, 0.8, 1]}
          >
            <PortSocket kind="rj45" borderless />
          </group>
          <group
            position={[w * 0.002, rearY, rearSocketZ]}
            rotation={[0, Math.PI, 0]}
            scale={[1.14, 1.14, 1]}
          >
            <PortSocket kind="powerAc" borderless acStyle="clover" />
          </group>
          <group position={[-w * 0.102, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usba" borderless />
          </group>
          <group position={[-w * 0.166, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usba" borderless />
          </group>
          <group
            position={[-w * 0.255, rearY - 0.0014, rearSocketZ]}
            rotation={[0, Math.PI, 0]}
            scale={[0.96, 0.96, 1]}
          >
            <PortSocket kind="hdmi" borderless />
          </group>
          <group position={[-w * 0.34, rearY - 0.0014, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="trs35" borderless />
          </group>
        </group>
      ) : isM4Mini ? (
        <group>
          {/* Compact Mac mini rear (left-to-right when viewing back: AC power, RJ45, HDMI, 3× vertical TB/USB-C) */}
          <group position={[w * 0.258, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="powerAc" borderless />
          </group>
          <group
            position={[w * 0.082, rearY, rearSocketZ]}
            rotation={[0, Math.PI, 0]}
            scale={[0.8, 0.78, 1]}
          >
            <PortSocket kind="rj45" borderless />
          </group>
          <group
            position={[-w * 0.068, rearY - 0.0005, rearSocketZ]}
            rotation={[0, Math.PI, 0]}
            scale={[0.94, 0.96, 1]}
          >
            <PortSocket kind="hdmi" borderless />
          </group>
          <group position={[-w * 0.192, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[-w * 0.258, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[-w * 0.324, rearY, rearSocketZ]} rotation={[0, Math.PI, Math.PI / 2]}>
            <PortSocket kind="usbc" borderless />
          </group>
        </group>
      ) : (
        <group>
          {/* Classic 197 mm Mac mini rear I/O */}
          <group position={[-w * 0.31, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="powerAc" borderless />
          </group>
          <group position={[-w * 0.18, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="rj45" borderless />
          </group>
          <group position={[-w * 0.06, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="hdmi" borderless />
          </group>
          <group position={[w * 0.06, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[w * 0.145, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="usbc" borderless />
          </group>
          <group position={[w * 0.235, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="usba" borderless />
          </group>
          <group position={[w * 0.34, rearY, rearSocketZ]} rotation={[0, Math.PI, 0]}>
            <PortSocket kind="trs35" borderless />
          </group>
        </group>
      )}
    </group>
  );
}

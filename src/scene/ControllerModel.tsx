// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, ExtrudeGeometry, Shape, SRGBColorSpace } from 'three';
import {
  controllerPresetById,
  type ControllerModelId,
  type ControllerSettings,
} from '../domain/controller';
import type { Size } from '../domain/project';

const BODY_DEPTH = 0.017;
const BEVEL_T = 0.0065;
const BEVEL_S = 0.005;
const FACE_TOP_Y = BODY_DEPTH + BEVEL_T;

/**
 * Generates a seamless 1-piece contoured game controller body silhouette (x = left/right,
 * y = -back trigger crown -> +front splayed palm grips), rotated so +y aligns with +Z
 * and top surface sits flush at y = FACE_TOP_Y.
 */
function createContouredShellGeometry(style: 'ps5' | 'xbox', halfScale = 1): ExtrudeGeometry {
  const s = new Shape();
  const w = (v: number) => v * halfScale;

  if (style === 'ps5') {
    // Upper arched shoulder crown (y < 0 -> -Z)
    s.moveTo(w(-0.044), w(-0.036));
    s.quadraticCurveTo(0, w(-0.041), w(0.044), w(-0.036));
    // Right rounded outer shoulder flaring into sleek tapered DualSense grip horn
    s.bezierCurveTo(w(0.066), w(-0.03), w(0.074), w(-0.008), w(0.072), w(0.02));
    s.bezierCurveTo(w(0.07), w(0.044), w(0.059), w(0.054), w(0.048), w(0.051));
    s.bezierCurveTo(w(0.038), w(0.048), w(0.033), w(0.026), w(0.022), w(0.017));
    // Smooth concave inner grip saddle
    s.quadraticCurveTo(0, w(0.013), w(-0.022), w(0.017));
    // Left mirror grip horn back up to shoulder
    s.bezierCurveTo(w(-0.033), w(0.026), w(-0.038), w(0.048), w(-0.048), w(0.051));
    s.bezierCurveTo(w(-0.059), w(0.054), w(-0.07), w(0.044), w(-0.072), w(0.02));
    s.bezierCurveTo(w(-0.074), w(-0.008), w(-0.066), w(-0.03), w(-0.044), w(-0.036));
  } else {
    // Xbox Series X|S fuller crown & slightly broader, shorter rounded grips
    s.moveTo(w(-0.042), w(-0.038));
    s.quadraticCurveTo(0, w(-0.043), w(0.042), w(-0.038));
    s.bezierCurveTo(w(0.064), w(-0.031), w(0.071), w(-0.008), w(0.069), w(0.018));
    s.bezierCurveTo(w(0.067), w(0.041), w(0.055), w(0.049), w(0.043), w(0.046));
    s.bezierCurveTo(w(0.032), w(0.043), w(0.028), w(0.023), w(0.018), w(0.016));
    s.quadraticCurveTo(0, w(0.012), w(-0.018), w(0.016));
    s.bezierCurveTo(w(-0.028), w(0.023), w(-0.032), w(0.043), w(-0.043), w(0.046));
    s.bezierCurveTo(w(-0.055), w(0.049), w(-0.067), w(0.041), w(-0.069), w(0.018));
    s.bezierCurveTo(w(-0.071), w(-0.008), w(-0.064), w(-0.031), w(-0.042), w(-0.038));
  }

  const geo = new ExtrudeGeometry(s, {
    depth: BODY_DEPTH * halfScale,
    bevelEnabled: true,
    bevelThickness: BEVEL_T * halfScale,
    bevelSize: BEVEL_S * halfScale,
    bevelSegments: 4,
    curveSegments: 18,
  });
  // Map extrusion along -Y then lift by depth so top surface sits at y = FACE_TOP_Y and shape +Y maps to +Z.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, BODY_DEPTH * halfScale, 0);
  return geo;
}

function makeButtonIconTexture(
  bg: string,
  draw: (ctx: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 64, 64);
  draw(ctx);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makePsSymbolTexture(
  symbol: 'tri' | 'cir' | 'cross' | 'sq',
  darkBg: boolean,
): CanvasTexture {
  const bg = darkBg ? '#181c24' : '#e6ebf2';
  const stroke = darkBg ? '#a3b0c2' : '#434d5e';
  return makeButtonIconTexture(bg, (ctx) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 4.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (symbol === 'tri') {
      ctx.beginPath();
      ctx.moveTo(32, 16);
      ctx.lineTo(48, 44);
      ctx.lineTo(16, 44);
      ctx.closePath();
      ctx.stroke();
    } else if (symbol === 'cir') {
      ctx.beginPath();
      ctx.arc(32, 32, 14, 0, Math.PI * 2);
      ctx.stroke();
    } else if (symbol === 'cross') {
      ctx.beginPath();
      ctx.moveTo(19, 19);
      ctx.lineTo(45, 45);
      ctx.moveTo(45, 19);
      ctx.lineTo(19, 45);
      ctx.stroke();
    } else {
      ctx.strokeRect(18, 18, 28, 28);
    }
  });
}

function makeXboxLetterTexture(letter: 'A' | 'B' | 'X' | 'Y', color: string): CanvasTexture {
  return makeButtonIconTexture('#16181e', (ctx) => {
    ctx.fillStyle = color;
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 32, 34);
  });
}

function makeXboxNexusTexture(): CanvasTexture {
  return makeButtonIconTexture('#f3f5f8', (ctx) => {
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(32, 32, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(32, 32, 4.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function makePsHomeTexture(): CanvasTexture {
  return makeButtonIconTexture('#262c36', (ctx) => {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(32, 32, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(32, 32, 3.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function Thumbstick({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Spherical gimbal well */}
      <mesh position={[0, 0.001, 0]} castShadow>
        <sphereGeometry args={[0.0102, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color="#1f242c" roughness={0.58} />
      </mesh>
      {/* Stalk */}
      <mesh position={[0, 0.007, 0]} castShadow>
        <cylinderGeometry args={[0.0036, 0.0042, 0.009, 14]} />
        <meshStandardMaterial color="#252b34" roughness={0.5} />
      </mesh>
      {/* Textured concave grip cap */}
      <mesh position={[0, 0.0125, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.009, 0.0084, 0.004, 20]} />
        <meshStandardMaterial color="#171a20" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.0146, 0]}>
        <torusGeometry args={[0.0072, 0.0013, 8, 20]} />
        <meshStandardMaterial color="#101318" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Ps5DualSense({ color }: { color: string }) {
  const outerGeo = useMemo(() => createContouredShellGeometry('ps5', 1), []);
  const blackCradleGeo = useMemo(() => createContouredShellGeometry('ps5', 0.94), []);
  useEffect(
    () => () => {
      outerGeo.dispose();
      blackCradleGeo.dispose();
    },
    [outerGeo, blackCradleGeo],
  );

  const isDarkBody =
    parseInt(color.slice(1, 3), 16) * 0.299 +
      parseInt(color.slice(3, 5), 16) * 0.587 +
      parseInt(color.slice(5, 7), 16) * 0.114 <
    95;

  const triTex = useMemo(() => makePsSymbolTexture('tri', isDarkBody), [isDarkBody]);
  const cirTex = useMemo(() => makePsSymbolTexture('cir', isDarkBody), [isDarkBody]);
  const crossTex = useMemo(() => makePsSymbolTexture('cross', isDarkBody), [isDarkBody]);
  const sqTex = useMemo(() => makePsSymbolTexture('sq', isDarkBody), [isDarkBody]);
  const homeTex = useMemo(() => makePsHomeTexture(), []);
  useEffect(
    () => () => {
      triTex.dispose();
      cirTex.dispose();
      crossTex.dispose();
      sqTex.dispose();
      homeTex.dispose();
    },
    [triTex, cirTex, crossTex, sqTex, homeTex],
  );

  return (
    <group position={[0, 0.022, 0.002]} rotation={[0.31, 0, 0]}>
      {/* Main white/colored two-tone DualSense contoured body */}
      <mesh geometry={outerGeo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.46} metalness={0.04} />
      </mesh>

      {/* Lower matte-black underside shell stepping down subtly along lower edge */}
      <mesh geometry={blackCradleGeo} position={[0, -0.0048, 0.0015]} castShadow>
        <meshStandardMaterial color="#171a20" roughness={0.72} />
      </mesh>

      {/* Signature DualSense black center trim bridge wrapping the lower sticks & PS Home button */}
      <RoundedBox
        args={[0.072, 0.004, 0.024]}
        radius={0.0015}
        smoothness={3}
        position={[0, FACE_TOP_Y - 0.0005, 0.006]}
        castShadow
      >
        <meshStandardMaterial color="#171a21" roughness={0.35} metalness={0.14} />
      </RoundedBox>

      {/* Central Touchpad + glowing cyan-blue LED Light Bar */}
      <group position={[0, FACE_TOP_Y + 0.0015, -0.02]}>
        <RoundedBox args={[0.05, 0.004, 0.027]} radius={0.002} smoothness={2} castShadow>
          <meshStandardMaterial color={color} roughness={0.38} metalness={0.04} />
        </RoundedBox>
        {[-1, 1].map((side) => (
          <mesh
            key={`lightbar-${side}`}
            position={[side * 0.0262, 0.0008, 0]}
            rotation={[0, 0, side * -0.15]}
          >
            <boxGeometry args={[0.0022, 0.0036, 0.024]} />
            <meshStandardMaterial
              color="#7dd3fc"
              emissive="#0ea5e9"
              emissiveIntensity={1.4}
              roughness={0.25}
            />
          </mesh>
        ))}
      </group>

      {/* Create & Options sleek translucent vertical pills */}
      {[-0.031, 0.031].map((bx, idx) => (
        <RoundedBox
          key={`opt-${idx}`}
          args={[0.0032, 0.0032, 0.0075]}
          radius={0.0012}
          smoothness={2}
          position={[bx, FACE_TOP_Y + 0.0015, -0.024]}
          rotation={[0, idx === 0 ? 0.16 : -0.16, 0]}
        >
          <meshStandardMaterial color="#cbd5e1" roughness={0.35} />
        </RoundedBox>
      ))}

      {/* Symmetrical Lower Analog Thumbsticks */}
      <Thumbstick position={[-0.023, FACE_TOP_Y + 0.001, 0.006]} />
      <Thumbstick position={[0.023, FACE_TOP_Y + 0.001, 0.006]} />

      {/* Center PlayStation Logo Home button & Mic Mute indicator pill */}
      <mesh position={[0, FACE_TOP_Y + 0.0018, 0.003]} castShadow>
        <cylinderGeometry args={[0.0044, 0.0044, 0.0022, 16]} />
        <meshStandardMaterial map={homeTex} roughness={0.38} />
      </mesh>
      <mesh position={[0, FACE_TOP_Y + 0.0016, 0.0115]}>
        <boxGeometry args={[0.0062, 0.002, 0.0025]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.4} />
      </mesh>

      {/* Left Upper Segmented 4-Way D-Pad */}
      <group position={[-0.049, FACE_TOP_Y + 0.0008, -0.014]}>
        <mesh position={[0, -0.0005, 0]}>
          <cylinderGeometry args={[0.013, 0.0135, 0.0018, 20]} />
          <meshStandardMaterial color="#1a1e26" roughness={0.75} />
        </mesh>
        {(
          [
            [0, -0.007, 0],
            [0, 0.007, 0],
            [-0.007, 0, Math.PI / 2],
            [0.007, 0, Math.PI / 2],
          ] as [number, number, number][]
        ).map(([dx, dz, rot], idx) => (
          <RoundedBox
            key={`dpad-${idx}`}
            args={[0.0065, 0.0038, 0.0074]}
            radius={0.0015}
            smoothness={2}
            position={[dx, 0.0012, dz]}
            rotation={[0, rot, 0]}
            castShadow
          >
            <meshStandardMaterial color="#e2e8f0" roughness={0.34} />
          </RoundedBox>
        ))}
      </group>

      {/* Right Upper Translucent Action Buttons (Triangle, Circle, Cross, Square) */}
      <group position={[0.049, FACE_TOP_Y + 0.0008, -0.014]}>
        {(
          [
            [0, -0.0088, triTex],
            [0.0088, 0, cirTex],
            [0, 0.0088, crossTex],
            [-0.0088, 0, sqTex],
          ] as [number, number, CanvasTexture][]
        ).map(([bx, bz, tex], idx) => (
          <mesh key={`ps-btn-${idx}`} position={[bx, 0.0014, bz]} castShadow>
            <cylinderGeometry args={[0.0046, 0.0046, 0.0042, 16]} />
            <meshStandardMaterial map={tex} roughness={0.28} metalness={0.08} />
          </mesh>
        ))}
      </group>

      {/* Top Shoulder Bumpers (L1 / R1) & Adaptive Triggers (L2 / R2) */}
      {([-1, 1] as const).map((side) => (
        <group key={`ps-sh-${side}`}>
          <RoundedBox
            args={[0.024, 0.008, 0.012]}
            radius={0.003}
            smoothness={2}
            position={[side * 0.045, BODY_DEPTH - 0.001, -0.042]}
            rotation={[0.2, side * -0.14, 0]}
            castShadow
          >
            <meshStandardMaterial color="#181c24" roughness={0.42} />
          </RoundedBox>
          <RoundedBox
            args={[0.022, 0.013, 0.014]}
            radius={0.0035}
            smoothness={2}
            position={[side * 0.045, BODY_DEPTH - 0.014, -0.045]}
            rotation={[-0.32, side * -0.14, 0]}
            castShadow
          >
            <meshStandardMaterial color="#13161c" roughness={0.55} />
          </RoundedBox>
        </group>
      ))}

      {/* Top Center USB-C Charging Port */}
      <mesh position={[0, BODY_DEPTH - 0.002, -0.045]}>
        <boxGeometry args={[0.0095, 0.0042, 0.004]} />
        <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.3} />
      </mesh>
    </group>
  );
}

function XboxSeriesController({ color }: { color: string }) {
  const outerGeo = useMemo(() => createContouredShellGeometry('xbox', 1), []);
  const backCaseGeo = useMemo(() => createContouredShellGeometry('xbox', 0.94), []);
  useEffect(
    () => () => {
      outerGeo.dispose();
      backCaseGeo.dispose();
    },
    [outerGeo, backCaseGeo],
  );

  const aTex = useMemo(() => makeXboxLetterTexture('A', '#22c55e'), []);
  const bTex = useMemo(() => makeXboxLetterTexture('B', '#ef4444'), []);
  const xTex = useMemo(() => makeXboxLetterTexture('X', '#3b82f6'), []);
  const yTex = useMemo(() => makeXboxLetterTexture('Y', '#facc15'), []);
  const nexusTex = useMemo(() => makeXboxNexusTexture(), []);
  useEffect(
    () => () => {
      aTex.dispose();
      bTex.dispose();
      xTex.dispose();
      yTex.dispose();
      nexusTex.dispose();
    },
    [aTex, bTex, xTex, yTex, nexusTex],
  );

  return (
    <group position={[0, 0.02, 0.002]} rotation={[0.29, 0, 0]}>
      {/* Sculpted Xbox Series X|S upper body shell */}
      <mesh geometry={outerGeo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.04} />
      </mesh>

      {/* Matte textured rear battery housing underside */}
      <mesh geometry={backCaseGeo} position={[0, -0.0045, 0.001]} castShadow>
        <meshStandardMaterial color="#181b21" roughness={0.78} />
      </mesh>

      {/* Xbox signature glossy black continuous top bumper spine (LB + RB) */}
      <RoundedBox
        args={[0.104, 0.011, 0.013]}
        radius={0.004}
        smoothness={2}
        position={[0, BODY_DEPTH, -0.043]}
        rotation={[0.2, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#15181e" roughness={0.32} metalness={0.14} />
      </RoundedBox>

      {/* Contoured LT / RT textured triggers */}
      {([-1, 1] as const).map((side) => (
        <RoundedBox
          key={`xb-trig-${side}`}
          args={[0.021, 0.013, 0.014]}
          radius={0.0035}
          smoothness={2}
          position={[side * 0.042, BODY_DEPTH - 0.013, -0.046]}
          rotation={[-0.28, side * -0.1, 0]}
          castShadow
        >
          <meshStandardMaterial color="#161920" roughness={0.56} />
        </RoundedBox>
      ))}

      {/* Top USB-C port */}
      <mesh position={[0, BODY_DEPTH - 0.001, -0.049]}>
        <boxGeometry args={[0.0095, 0.004, 0.0035]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Center Illuminated Xbox Nexus Button */}
      <mesh position={[0, FACE_TOP_Y + 0.0015, -0.028]} castShadow>
        <cylinderGeometry args={[0.0062, 0.0062, 0.0035, 20]} />
        <meshStandardMaterial
          map={nexusTex}
          emissive="#e2e8f0"
          emissiveIntensity={0.65}
          roughness={0.28}
        />
      </mesh>

      {/* View, Menu & Series X|S Center Share Pill Button */}
      <mesh position={[-0.012, FACE_TOP_Y + 0.0016, -0.011]} castShadow>
        <cylinderGeometry args={[0.0029, 0.0029, 0.0028, 12]} />
        <meshStandardMaterial color="#1b1e25" roughness={0.38} />
      </mesh>
      <mesh position={[0.012, FACE_TOP_Y + 0.0016, -0.011]} castShadow>
        <cylinderGeometry args={[0.0029, 0.0029, 0.0028, 12]} />
        <meshStandardMaterial color="#1b1e25" roughness={0.38} />
      </mesh>
      <RoundedBox
        args={[0.0054, 0.0028, 0.0076]}
        radius={0.0012}
        smoothness={2}
        position={[0, FACE_TOP_Y + 0.0016, -0.003]}
        castShadow
      >
        <meshStandardMaterial color="#1b1e25" roughness={0.42} />
      </RoundedBox>

      {/* Asymmetrical Thumbsticks: Upper-Left + Lower-Right */}
      <Thumbstick position={[-0.044, FACE_TOP_Y + 0.001, -0.017]} />
      <Thumbstick position={[0.023, FACE_TOP_Y + 0.001, 0.006]} />

      {/* Lower-Left Faceted 8-Way Hybrid Dish D-Pad */}
      <group position={[-0.023, FACE_TOP_Y + 0.0015, 0.005]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.0115, 0.0125, 0.003, 16]} />
          <meshStandardMaterial color="#171a20" roughness={0.48} metalness={0.2} />
        </mesh>
        <RoundedBox
          args={[0.018, 0.0036, 0.0054]}
          radius={0.001}
          smoothness={2}
          position={[0, 0.0018, 0]}
          castShadow
        >
          <meshStandardMaterial color="#242934" roughness={0.42} metalness={0.22} />
        </RoundedBox>
        <RoundedBox
          args={[0.0054, 0.0036, 0.018]}
          radius={0.001}
          smoothness={2}
          position={[0, 0.0018, 0]}
          castShadow
        >
          <meshStandardMaterial color="#242934" roughness={0.42} metalness={0.22} />
        </RoundedBox>
      </group>

      {/* Upper-Right Glossy Color-Coded ABXY Dome Buttons */}
      <group position={[0.044, FACE_TOP_Y + 0.001, -0.016]}>
        {(
          [
            [0, -0.009, yTex],
            [0.009, 0, bTex],
            [0, 0.009, aTex],
            [-0.009, 0, xTex],
          ] as [number, number, CanvasTexture][]
        ).map(([bx, bz, tex], idx) => (
          <mesh key={`xb-btn-${idx}`} position={[bx, 0.0014, bz]} castShadow>
            <cylinderGeometry args={[0.0046, 0.0046, 0.0048, 16]} />
            <meshStandardMaterial map={tex} roughness={0.22} metalness={0.1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function ControllerModel({
  size,
  color,
  controller,
}: {
  size: Size;
  color: string;
  controller?: ControllerSettings;
}) {
  const modelId: ControllerModelId = controller?.model ?? 'ps5';
  const baseSpec = controllerPresetById(modelId).size;

  return (
    <group
      scale={[
        size.width / baseSpec.width,
        size.height / baseSpec.height,
        size.depth / baseSpec.depth,
      ]}
    >
      {modelId === 'ps5' ? <Ps5DualSense color={color} /> : <XboxSeriesController color={color} />}
    </group>
  );
}

import { RoundedBox } from '@react-three/drei';
import { monitorParts, monitorPose } from '../domain/monitor';
import type { Size } from '../domain/project';

// A monitor rendered at real scale (metres), driven directly by item.size so the
// screen stays 16:9 no matter how the width and height are edited. The screen
// (panel) pivots about its centre on a VESA-style mount so pitch and roll move
// it like a real articulated arm; `lift` telescopes the stand column upward.
function Part({
  at,
  size,
  color,
  r = 0.004,
  metal = 0,
}: {
  at: [number, number, number];
  size: [number, number, number];
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

export function MonitorModel({
  size,
  color,
  pitch = 0,
  roll = 0,
  lift = 0,
}: {
  size: Size;
  color: string;
  pitch?: number;
  roll?: number;
  lift?: number;
}) {
  const { screenWidth, screenHeight, panelHeight } = monitorParts(size);
  const pose = monitorPose(size, { pitch, roll, lift });
  const panelWidth = size.width;
  const baseDepth = size.depth;
  const panelY = pose.pivotY + panelHeight / 2; // panel centre height above the desk
  const columnTop = pose.pivotY; // stand top, rises with the screen
  const baseWidth = Math.min(0.3, Math.max(0.16, panelWidth * 0.38));
  const neckHeight = Math.max(0.004, columnTop - 0.016);
  const neckY = (0.016 + columnTop) / 2;
  const barTop = panelY - 0.01;
  const barBottom = columnTop + 0.01;
  const barHeight = Math.max(0.01, barTop - barBottom);
  const barY = (barTop + barBottom) / 2;

  return (
    <group>
      {/* base plate */}
      <Part
        at={[0, 0.008, 0]}
        size={[baseWidth, 0.016, baseDepth]}
        color={color}
        metal={0.5}
        r={0.007}
      />
      {/* stand column (telescopes with lift) */}
      <Part
        at={[0, neckY, -0.015]}
        size={[0.05, neckHeight, 0.09]}
        color={color}
        metal={0.6}
        r={0.006}
      />
      {/* fixed mount arm up to the VESA pivot behind the panel */}
      <Part
        at={[0, barY, -0.028]}
        size={[0.04, barHeight, 0.01]}
        color={color}
        metal={0.6}
        r={0.004}
      />
      {/* screen sub-assembly: pivots about the panel centre */}
      <group
        position={[0, panelY, -0.02]}
        rotation={[(pose.pitchDeg * Math.PI) / 180, 0, (pose.rollDeg * Math.PI) / 180]}
      >
        {/* panel housing */}
        <Part at={[0, 0, 0]} size={[panelWidth, panelHeight, 0.02]} color={color} r={0.008} />
        {/* screen surface (faces the observer at +Z) */}
        <Part
          at={[0, 0, 0.009]}
          size={[screenWidth, screenHeight, 0.008]}
          color="#152b46"
          r={0.005}
        />
        {/* content accents */}
        <Part
          at={[-screenWidth * 0.28, 0, 0.0135]}
          size={[screenWidth * 0.44, screenHeight * 0.64, 0.001]}
          color="#315884"
          r={0.0005}
        />
        <Part
          at={[screenWidth * 0.25, screenHeight * 0.26, 0.0135]}
          size={[screenWidth * 0.4, screenHeight * 0.28, 0.001]}
          color="#6c9fae"
          r={0.0005}
        />
        <Part
          at={[screenWidth * 0.25, -screenHeight * 0.26, 0.0135]}
          size={[screenWidth * 0.4, screenHeight * 0.24, 0.001]}
          color="#223c5a"
          r={0.0005}
        />
        {/* power LED on the bottom bezel */}
        <mesh position={[0, -panelHeight / 2 + 0.012, 0.0135]}>
          <sphereGeometry args={[0.004, 8, 8]} />
          <meshBasicMaterial color="#d4e4ff" />
        </mesh>
      </group>
      {/* VESA pivot knuckle */}
      <mesh position={[0, panelY, -0.028]}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { InstancedMesh, Matrix4, Shape } from 'three';
import { PEGBOARD_WALL_STANDOFF } from '../domain/desk';
import { PEGBOARD, pegboardHoles } from '../domain/pegboard';
import type { Size } from '../domain/project';

// A SKÅDIS-style pegboard built at real scale (metres), like MonitorModel, so the
// holes keep their physical size and pitch however the board is resized: a wider or
// taller board simply gains more 5 × 15 mm slots on the 40 mm staggered grid.
export const PEGBOARD_HOLE_COLOR = '#8b9290';

function panelShape(width: number, height: number) {
  const r = Math.min(PEGBOARD.cornerRadius, width / 2, height / 2);
  const x0 = -width / 2,
    x1 = width / 2;
  const shape = new Shape();
  shape.moveTo(x0 + r, 0);
  shape.lineTo(x1 - r, 0);
  shape.quadraticCurveTo(x1, 0, x1, r);
  shape.lineTo(x1, height - r);
  shape.quadraticCurveTo(x1, height, x1 - r, height);
  shape.lineTo(x0 + r, height);
  shape.quadraticCurveTo(x0, height, x0, height - r);
  shape.lineTo(x0, r);
  shape.quadraticCurveTo(x0, 0, x0 + r, 0);
  return shape;
}

// A trough-shaped slot: 5 mm wide, 15 mm tall, semicircular ends (R2.50).
function slotShape() {
  const hw = PEGBOARD.holeWidth / 2,
    hh = PEGBOARD.holeHeight / 2,
    r = hw,
    straight = hh - r;
  const shape = new Shape();
  shape.moveTo(-hw, straight);
  shape.absarc(0, straight, r, Math.PI, 0, true);
  shape.lineTo(hw, -straight);
  shape.absarc(0, -straight, r, 0, Math.PI, true);
  shape.closePath();
  return shape;
}

function HoleField({
  holes,
  bottom,
  z,
  flip,
}: {
  holes: [number, number][];
  bottom: number;
  z: number;
  flip: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const shape = useMemo(slotShape, []);
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const rot = new Matrix4().makeRotationY(Math.PI);
    const matrix = new Matrix4();
    holes.forEach(([x, y], i) => {
      matrix.makeTranslation(x, bottom + y, z);
      if (flip) matrix.multiply(rot);
      target.setMatrixAt(i, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
    invalidate();
  }, [holes, bottom, z, flip, invalidate]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, holes.length]}>
      <shapeGeometry args={[shape, 3]} />
      <meshStandardMaterial color={PEGBOARD_HOLE_COLOR} roughness={0.95} />
    </instancedMesh>
  );
}

export function PegboardModel({
  size,
  color,
  wallMounted = false,
}: {
  size: Size;
  color: string;
  wallMounted?: boolean;
}) {
  const footHeight = wallMounted ? 0 : Math.min(size.height * 0.04, size.height / 2);
  const panelWidth = size.width;
  const panelHeight = Math.max(size.height - footHeight, PEGBOARD.thickness);
  const thickness = wallMounted ? PEGBOARD.thickness : Math.min(PEGBOARD.thickness, size.depth / 2);
  const back = wallMounted
    ? -thickness / 2
    : Math.max(-size.depth / 2, -size.depth * 0.12 - thickness / 2);
  const front = back + thickness;
  const holes = useMemo(() => pegboardHoles(panelWidth, panelHeight), [panelWidth, panelHeight]);
  const shape = useMemo(() => panelShape(panelWidth, panelHeight), [panelWidth, panelHeight]);
  const legWidth = Math.min(panelWidth * 0.22, panelWidth / 2);
  const legX = panelWidth * 0.32;
  const legRadius = Math.min(0.003, footHeight / 3, legWidth / 3);
  const railW = Math.max(0.06, panelWidth - 0.04);

  return (
    <group>
      <mesh position={[0, footHeight, back]} castShadow receiveShadow>
        <extrudeGeometry
          args={[shape, { depth: thickness, bevelEnabled: false, curveSegments: 4 }]}
        />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      {holes.length > 0 && (
        <>
          <HoleField holes={holes} bottom={footHeight} z={front + 0.0003} flip={false} />
          <HoleField holes={holes} bottom={footHeight} z={back - 0.0003} flip />
        </>
      )}
      {wallMounted ? (
        <group name="pegboard-wall-mounts">
          {/* SKÅDIS 顶部壁挂金属导轨横条 + 底部两枚墙面支距圆垫柱 */}
          <mesh
            position={[0, panelHeight - 0.022, back - PEGBOARD_WALL_STANDOFF / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[railW, 0.016, PEGBOARD_WALL_STANDOFF]} />
            <meshStandardMaterial color="#c8cdd4" metalness={0.55} roughness={0.35} />
          </mesh>
          {[-panelWidth * 0.34, panelWidth * 0.34].map((sx, i) => (
            <mesh
              key={`wall-standoff-${i}`}
              position={[sx, 0.032, back - PEGBOARD_WALL_STANDOFF / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.007, 0.008, PEGBOARD_WALL_STANDOFF, 14]} />
              <meshStandardMaterial color="#cfd4dc" metalness={0.4} roughness={0.42} />
            </mesh>
          ))}
        </group>
      ) : (
        [-legX, legX].map((x) => (
          <RoundedBox
            key={x}
            args={[legWidth, footHeight, size.depth]}
            position={[x, footHeight / 2, 0]}
            radius={legRadius}
            smoothness={2}
            bevelSegments={1}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} roughness={0.72} />
          </RoundedBox>
        ))
      )}
    </group>
  );
}

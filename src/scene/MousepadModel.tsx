import { useEffect, useMemo } from 'react';
import { CanvasTexture, ExtrudeGeometry, Path, RepeatWrapping, Shape, SRGBColorSpace } from 'three';
import type { Size } from '../domain/project';

function createRoundedRectShape(width: number, depth: number, radius: number): Shape {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const s = new Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

function createRoundedRingGeometry(
  width: number,
  depth: number,
  outerRadius: number,
  borderWidth: number,
  height: number,
): ExtrudeGeometry {
  const outer = createRoundedRectShape(width, depth, outerRadius);
  const iw = Math.max(0.02, width - borderWidth * 2);
  const id = Math.max(0.02, depth - borderWidth * 2);
  const ir = Math.max(0.002, outerRadius - borderWidth);
  const holeShape = createRoundedRectShape(iw, id, ir);
  const hole = new Path(holeShape.getPoints(10));
  outer.holes.push(hole);

  const geo = new ExtrudeGeometry(outer, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function makeFabricTexture(baseHex: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 128, 128);

  // Subtle Poron/cloth fine twill weave pattern
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const alt = ((x + y) >> 1) & 1;
      ctx.fillStyle = alt ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
      ctx.fillRect(x, y, 2, 1);
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function shiftHex(hex: string, delta: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = c(((n >> 16) & 255) + delta);
  const g = c(((n >> 8) & 255) + delta);
  const b = c((n & 255) + delta);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function MousepadModel({ size, color }: { size: Size; color: string }) {
  const { width: w, height: t, depth: d } = size;
  const cornerRadius = Math.min(0.012, w * 0.06, d * 0.06);
  const baseH = t * 0.36;
  const clothH = t - baseH;
  const stitchWidth = Math.min(0.0026, w * 0.02, d * 0.02);

  const { baseGeo, clothGeo, stitchGeo } = useMemo(() => {
    const shape = createRoundedRectShape(w, d, cornerRadius);
    const bGeo = new ExtrudeGeometry(shape, {
      depth: baseH,
      bevelEnabled: false,
      curveSegments: 10,
    });
    bGeo.rotateX(-Math.PI / 2);

    const cGeo = new ExtrudeGeometry(shape, {
      depth: clothH,
      bevelEnabled: false,
      curveSegments: 10,
    });
    cGeo.rotateX(-Math.PI / 2);

    const sGeo = createRoundedRingGeometry(
      w + 0.0004,
      d + 0.0004,
      cornerRadius,
      stitchWidth,
      t * 0.78,
    );

    return { baseGeo: bGeo, clothGeo: cGeo, stitchGeo: sGeo };
  }, [w, d, t, cornerRadius, baseH, clothH, stitchWidth]);

  useEffect(
    () => () => {
      baseGeo.dispose();
      clothGeo.dispose();
      stitchGeo.dispose();
    },
    [baseGeo, clothGeo, stitchGeo],
  );

  const fabricTex = useMemo(() => makeFabricTexture(color), [color]);
  useEffect(() => () => fabricTex.dispose(), [fabricTex]);

  const stitchColor = shiftHex(color, -18);

  return (
    <group>
      {/* Bottom anti-slip Poron / rubber base */}
      <mesh geometry={baseGeo} receiveShadow castShadow>
        <meshStandardMaterial color="#14171c" roughness={0.94} metalness={0} />
      </mesh>

      {/* Top woven cloth / cushion layer */}
      <mesh geometry={clothGeo} position={[0, baseH, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={fabricTex} roughness={0.92} metalness={0.01} />
      </mesh>

      {/* Stitched overlock perimeter border */}
      <mesh geometry={stitchGeo} position={[0, t * 0.2, 0]} receiveShadow>
        <meshStandardMaterial color={stitchColor} roughness={0.88} metalness={0.02} />
      </mesh>
    </group>
  );
}

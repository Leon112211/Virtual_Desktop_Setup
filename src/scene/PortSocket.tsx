import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Path, Shape } from 'three';
import { PORT_SOCKET_SPECS, type PortSocketKind } from '../domain/ports';

function buildRoundedShape(hw: number, hh: number, r: number): Shape {
  const cr = Math.min(r, hw * 0.96, hh * 0.96);
  const s = new Shape();
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.absarc(hw - cr, -hh + cr, cr, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - cr);
  s.absarc(hw - cr, hh - cr, cr, 0, Math.PI / 2, false);
  s.lineTo(-hw + cr, hh);
  s.absarc(-hw + cr, hh - cr, cr, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + cr);
  s.absarc(-hw + cr, -hh + cr, cr, Math.PI, (3 * Math.PI) / 2, false);
  s.closePath();
  return s;
}

function buildRoundedPath(hw: number, hh: number, r: number): Path {
  const cr = Math.min(r, hw * 0.96, hh * 0.96);
  const p = new Path();
  p.moveTo(-hw + cr, -hh);
  p.lineTo(hw - cr, -hh);
  p.absarc(hw - cr, -hh + cr, cr, -Math.PI / 2, 0, false);
  p.lineTo(hw, hh - cr);
  p.absarc(hw - cr, hh - cr, cr, 0, Math.PI / 2, false);
  p.lineTo(-hw + cr, hh);
  p.absarc(-hw + cr, hh - cr, cr, Math.PI / 2, Math.PI, false);
  p.lineTo(-hw, -hh + cr);
  p.absarc(-hw + cr, -hh + cr, cr, Math.PI, (3 * Math.PI) / 2, false);
  p.closePath();
  return p;
}

function traceHdmiTrapezoid<T extends Shape | Path>(
  target: T,
  hw: number,
  hh: number,
  ch: number,
): T {
  target.moveTo(-hw + ch, -hh);
  target.lineTo(hw - ch, -hh);
  target.lineTo(hw, -hh + ch);
  target.lineTo(hw, hh);
  target.lineTo(-hw, hh);
  target.lineTo(-hw, -hh + ch);
  target.closePath();
  return target;
}

function traceDpTrapezoid<T extends Shape | Path>(
  target: T,
  hw: number,
  hh: number,
  ch: number,
): T {
  target.moveTo(-hw, -hh);
  target.lineTo(hw - ch, -hh);
  target.lineTo(hw, -hh + ch);
  target.lineTo(hw, hh);
  target.lineTo(-hw, hh);
  target.closePath();
  return target;
}

/** Smooth pinched Figure-8 contour matching real IEC C8 / Apple compact AC inlets. */
function buildFigure8Shape(hw: number, hh: number): Shape {
  const s = new Shape();
  const pinchY = hh * 0.52;
  const cx = hw * 0.44;
  s.moveTo(-cx, -hh);
  s.quadraticCurveTo(0, -pinchY, cx, -hh);
  s.bezierCurveTo(hw * 1.05, -hh, hw * 1.05, hh, cx, hh);
  s.quadraticCurveTo(0, pinchY, -cx, hh);
  s.bezierCurveTo(-hw * 1.05, hh, -hw * 1.05, -hh, -cx, -hh);
  s.closePath();
  return s;
}

function buildSocketGeometries(kind: PortSocketKind): {
  wellGeo: ExtrudeGeometry | null;
  collarGeo: ExtrudeGeometry | null;
} {
  const spec = PORT_SOCKET_SPECS[kind];
  const hw = spec.width / 2;
  const hh = spec.height / 2;

  if (kind === 'rca' || kind === 'trs35' || kind === 'trs635' || kind === 'bindingPost') {
    return { wellGeo: null, collarGeo: null };
  }

  let wellShape: Shape;
  let collarShape: Shape | null = null;
  let curveSegments = 12;
  let collarDepth = 0.0011;

  if (kind === 'hdmi') {
    wellShape = traceHdmiTrapezoid(new Shape(), hw, hh, 0.0012);
    collarShape = traceHdmiTrapezoid(new Shape(), hw + 0.0007, hh + 0.0007, 0.0014);
    collarShape.holes.push(traceHdmiTrapezoid(new Path(), hw, hh, 0.0012));
    curveSegments = 4;
    collarDepth = 0.0012;
  } else if (kind === 'dp') {
    wellShape = traceDpTrapezoid(new Shape(), hw, hh, 0.0018);
    collarShape = traceDpTrapezoid(new Shape(), hw + 0.00075, hh + 0.00075, 0.0021);
    collarShape.holes.push(traceDpTrapezoid(new Path(), hw, hh, 0.0018));
    curveSegments = 4;
    collarDepth = 0.0012;
  } else if (kind === 'powerAc') {
    wellShape = buildFigure8Shape(hw * 0.94, hh * 0.9);
    collarShape = buildRoundedShape(hw + 0.0022, hh + 0.0016, hh + 0.0016);
    curveSegments = 18;
    collarDepth = 0.00028;
  } else {
    const collarCfg: Partial<
      Record<PortSocketKind, { wall: number; radius: number; depth: number; segs: number }>
    > = {
      usbc: { wall: 0.00048, radius: hh, depth: 0.001, segs: 18 },
      magsafe3: { wall: 0.00035, radius: hh, depth: 0.00055, segs: 18 },
      usba: { wall: 0.00065, radius: 0.0006, depth: 0.0011, segs: 10 },
      tf: { wall: 0.00045, radius: 0.0003, depth: 0.001, segs: 8 },
      sd: { wall: 0.00055, radius: 0.00045, depth: 0.0011, segs: 10 },
      rj45: { wall: 0.0007, radius: 0.0006, depth: 0.0011, segs: 10 },
      iecC14: { wall: 0.001, radius: 0.0014, depth: 0.0012, segs: 10 },
      optical: { wall: 0.0008, radius: 0.0008, depth: 0.0011, segs: 10 },
    };
    const cfg = collarCfg[kind] ?? { wall: 0.0005, radius: 0.0005, depth: 0.001, segs: 10 };
    curveSegments = cfg.segs;
    collarDepth = cfg.depth;
    wellShape = buildRoundedShape(hw, hh, cfg.radius);
    collarShape = buildRoundedShape(hw + cfg.wall, hh + cfg.wall, cfg.radius + cfg.wall);
    collarShape.holes.push(buildRoundedPath(hw, hh, cfg.radius));
  }

  const wellGeo = new ExtrudeGeometry(wellShape, {
    depth: 0.00045,
    bevelEnabled: false,
    curveSegments,
  });
  const collarGeo = collarShape
    ? new ExtrudeGeometry(collarShape, {
        depth: collarDepth,
        bevelEnabled: false,
        curveSegments,
      })
    : null;

  return { wellGeo, collarGeo };
}

function buildRoundedSolidGeo(
  width: number,
  height: number,
  radius: number,
  depth: number,
): ExtrudeGeometry {
  const shape = buildRoundedShape(width / 2, height / 2, radius);
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
}

/**
 * 1:1 physically proportioned I/O receptacle socket facing +Z outward from chassis surface.
 * Pass `borderless` for unibody Apple/Mac chassis apertures machined flush without raised collars.
 */
export function PortSocket({
  kind,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  borderless = false,
  acStyle = 'figure8',
}: {
  kind: PortSocketKind;
  position?: [number, number, number];
  rotation?: [number, number, number];
  borderless?: boolean;
  acStyle?: 'figure8' | 'clover';
}) {
  const spec = PORT_SOCKET_SPECS[kind];

  const { wellGeo, collarGeo } = useMemo(() => buildSocketGeometries(kind), [kind]);
  const magsafeCoreGeo = useMemo(
    () =>
      kind === 'magsafe3'
        ? buildRoundedSolidGeo(
            spec.width - 0.0018,
            spec.height - 0.0013,
            (spec.height - 0.0013) / 2,
            0.00028,
          )
        : null,
    [kind, spec.width, spec.height],
  );

  useEffect(() => () => wellGeo?.dispose(), [wellGeo]);
  useEffect(() => () => collarGeo?.dispose(), [collarGeo]);
  useEffect(() => () => magsafeCoreGeo?.dispose(), [magsafeCoreGeo]);

  return (
    <group position={position} rotation={rotation}>
      {/* Precision contour-matched dark internal aperture well (zero corner/arc mismatch) */}
      {kind === 'powerAc' && acStyle === 'figure8' && collarGeo && (
        <mesh geometry={collarGeo} position={[0, 0, 0.00004]}>
          <meshStandardMaterial
            color="#343a46"
            emissive="#232830"
            emissiveIntensity={0.45}
            roughness={0.58}
            metalness={0.16}
          />
        </mesh>
      )}
      {wellGeo && !(kind === 'powerAc' && acStyle === 'clover') && (
        <mesh geometry={wellGeo} position={[0, 0, kind === 'powerAc' ? 0.00028 : 0.00008]}>
          <meshStandardMaterial
            color={kind === 'powerAc' ? '#05070a' : '#0a0c10'}
            roughness={0.82}
            metalness={0.08}
          />
        </mesh>
      )}

      {/* Shielded outer metal collar (omitted on unibody Apple/Mac flush apertures) */}
      {!borderless && kind !== 'powerAc' && collarGeo && (
        <mesh geometry={collarGeo} position={[0, 0, 0]}>
          <meshStandardMaterial
            color={
              kind === 'magsafe3' || kind === 'iecC14'
                ? '#1c2028'
                : kind === 'sd' || kind === 'tf'
                  ? '#636b78'
                  : '#8f98a6'
            }
            metalness={kind === 'magsafe3' || kind === 'iecC14' ? 0.3 : 0.84}
            roughness={kind === 'magsafe3' || kind === 'iecC14' ? 0.58 : 0.28}
          />
        </mesh>
      )}

      {/* Kind-specific interior pin wafers, contact tongues, and card latches */}
      {kind === 'hdmi' && (
        <group position={[0, 0.00012, 0.00056]}>
          <mesh>
            <boxGeometry args={[0.0104, 0.0011, 0.0005]} />
            <meshStandardMaterial
              color={borderless ? '#3a404c' : '#191c22'}
              emissive={borderless ? '#1d2026' : '#000000'}
              emissiveIntensity={borderless ? 0.25 : 0}
              roughness={0.48}
            />
          </mesh>
          <mesh position={[0, -0.00052, 0.00008]}>
            <boxGeometry args={[0.0094, 0.00034, 0.00045]} />
            <meshStandardMaterial
              color={borderless ? '#525a68' : '#d4a94e'}
              metalness={borderless ? 0.5 : 0.85}
              roughness={borderless ? 0.38 : 0.25}
            />
          </mesh>
        </group>
      )}

      {kind === 'dp' && (
        <group position={[0, 0.0003, 0.00058]}>
          <mesh>
            <boxGeometry args={[0.0124, 0.0015, 0.0005]} />
            <meshStandardMaterial color="#181b21" roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.00075, 0.00008]}>
            <boxGeometry args={[0.0114, 0.00045, 0.00045]} />
            <meshStandardMaterial color="#d4a94e" metalness={0.85} roughness={0.25} />
          </mesh>
        </group>
      )}

      {kind === 'usba' && (
        <group position={[0, spec.height * 0.18, 0.00058]}>
          <mesh>
            <boxGeometry args={[0.0106, 0.0016, 0.00055]} />
            <meshStandardMaterial
              color={borderless ? '#282d36' : '#1d5fd6'}
              emissive={borderless ? '#16191f' : '#000000'}
              emissiveIntensity={borderless ? 0.25 : 0}
              roughness={0.42}
              metalness={0.12}
            />
          </mesh>
          <mesh position={[0, -0.0008, 0.00008]}>
            <boxGeometry args={[0.0096, 0.0003, 0.00045]} />
            <meshStandardMaterial
              color={borderless ? '#4d5563' : '#d6ad52'}
              metalness={borderless ? 0.48 : 0.85}
              roughness={0.32}
            />
          </mesh>
        </group>
      )}

      {kind === 'usbc' && (
        <group position={[0, 0, 0.00055]}>
          {/* Symmetrical centered contact wafer blade recessed inside stadium bore */}
          <mesh>
            <boxGeometry args={[0.0058, 0.00068, 0.00048]} />
            <meshStandardMaterial
              color={borderless ? '#3d4450' : '#1c2026'}
              emissive={borderless ? '#1e2229' : '#000000'}
              emissiveIntensity={borderless ? 0.28 : 0}
              roughness={0.45}
            />
          </mesh>
          <mesh position={[0, 0, 0.00008]}>
            <boxGeometry args={[0.0052, 0.00032, 0.0005]} />
            <meshStandardMaterial
              color={borderless ? '#505866' : '#cfa54f'}
              metalness={borderless ? 0.48 : 0.8}
              roughness={borderless ? 0.38 : 0.3}
            />
          </mesh>
        </group>
      )}

      {(kind === 'sd' || kind === 'tf') && (
        <mesh position={[0, spec.height * 0.22, 0.00052]}>
          <boxGeometry args={[spec.width * 0.72, 0.00032, 0.00045]} />
          <meshStandardMaterial
            color={borderless ? '#424956' : '#d4a94e'}
            metalness={borderless ? 0.45 : 0.85}
            roughness={0.35}
          />
        </mesh>
      )}

      {kind === 'magsafe3' && magsafeCoreGeo && (
        <group position={[0, 0, 0.00036]}>
          {/* Concentric pill-shaped PEEK insulator island + 5 gold spring pogo pads */}
          <mesh geometry={magsafeCoreGeo}>
            <meshStandardMaterial color="#e4e8ee" roughness={0.28} metalness={0.08} />
          </mesh>
          {[-0.0038, -0.0019, 0, 0.0019, 0.0038].map((px, i) => (
            <mesh key={`pin-${i}`} position={[px, 0, 0.0002]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.00042, 0.00042, 0.00018, 16]} />
              <meshStandardMaterial color="#e0b54c" metalness={0.88} roughness={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {kind === 'rj45' && (
        <group position={[0, 0, 0.00054]}>
          <mesh position={[0, spec.height * 0.34, 0.00008]}>
            <boxGeometry args={[0.0058, 0.0026, 0.0005]} />
            <meshStandardMaterial color="#05070a" roughness={0.7} />
          </mesh>
          {!borderless && (
            <>
              <mesh position={[-spec.width * 0.34, -spec.height * 0.34, 0.00022]}>
                <boxGeometry args={[0.0022, 0.0014, 0.00045]} />
                <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.45} />
              </mesh>
              <mesh position={[spec.width * 0.34, -spec.height * 0.34, 0.00022]}>
                <boxGeometry args={[0.0022, 0.0014, 0.00045]} />
                <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.35} />
              </mesh>
            </>
          )}
          {[-0.0035, -0.0025, -0.0015, -0.0005, 0.0005, 0.0015, 0.0025, 0.0035].map((px, i) => (
            <mesh key={`rj-pin-${i}`} position={[px, -spec.height * 0.3, 0.00018]}>
              <boxGeometry args={[0.00045, 0.0022, 0.00045]} />
              <meshStandardMaterial
                color={borderless ? '#525a68' : '#d4a94e'}
                metalness={0.75}
                roughness={0.32}
              />
            </mesh>
          ))}
        </group>
      )}

      {kind === 'powerAc' && acStyle === 'figure8' && (
        <group position={[0, 0, 0.00062]}>
          {[-0.0037, 0.0037].map((px, i) => (
            <group key={`ac-pin-${i}`} position={[px, 0, 0.00012]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0015, 0.0015, 0.00055, 18]} />
                <meshStandardMaterial
                  color="#9aa2b0"
                  emissive="#2d323b"
                  emissiveIntensity={0.22}
                  metalness={0.72}
                  roughness={0.28}
                />
              </mesh>
              <mesh position={[0, 0, 0.00008]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.00062, 0.00062, 0.0006, 14]} />
                <meshStandardMaterial color="#0d1015" roughness={0.75} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {kind === 'powerAc' && acStyle === 'clover' && (
        <group>
          {/* 3-lobed cloverleaf outer dark charcoal bezel */}
          {(
            [
              [-0.0042, 0.0022, 0.0053],
              [0.0042, 0.0022, 0.0053],
              [0, -0.0035, 0.0053],
              [0, -0.0002, 0.0042],
            ] as const
          ).map(([lx, ly, r], i) => (
            <mesh
              key={`clover-bezel-${i}`}
              position={[lx, ly, 0.00014]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[r, r, 0.00024, 28]} />
              <meshStandardMaterial
                color="#343a46"
                emissive="#232830"
                emissiveIntensity={0.45}
                roughness={0.58}
                metalness={0.16}
              />
            </mesh>
          ))}
          {/* 3-lobed cloverleaf recessed black well */}
          {(
            [
              [-0.0042, 0.0022, 0.0038],
              [0.0042, 0.0022, 0.0038],
              [0, -0.0035, 0.0038],
              [0, -0.0002, 0.0026],
            ] as const
          ).map(([lx, ly, r], i) => (
            <mesh
              key={`clover-well-${i}`}
              position={[lx, ly, 0.00034]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[r, r, 0.00028, 28]} />
              <meshStandardMaterial color="#05070a" roughness={0.82} metalness={0.08} />
            </mesh>
          ))}
          {/* 3 metallic hollow contact pins */}
          {(
            [
              [-0.0042, 0.0022],
              [0.0042, 0.0022],
              [0, -0.0035],
            ] as const
          ).map(([lx, ly], i) => (
            <group key={`clover-pin-${i}`} position={[lx, ly, 0.00062]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.00145, 0.00145, 0.0005, 18]} />
                <meshStandardMaterial
                  color="#9aa2b0"
                  emissive="#2d323b"
                  emissiveIntensity={0.22}
                  metalness={0.72}
                  roughness={0.28}
                />
              </mesh>
              <mesh position={[0, 0, 0.00008]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0006, 0.0006, 0.00055, 14]} />
                <meshStandardMaterial color="#0d1015" roughness={0.75} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {kind === 'iecC14' && (
        <group position={[0, 0, 0.00058]}>
          {[
            [0, 0.0038],
            [-0.007, -0.0034],
            [0.007, -0.0034],
          ].map(([px, py], i) => (
            <mesh key={`c14-pin-${i}`} position={[px, py, 0.00028]}>
              <boxGeometry args={[0.0019, 0.0042, 0.0009]} />
              <meshStandardMaterial color="#caa652" metalness={0.85} roughness={0.26} />
            </mesh>
          ))}
        </group>
      )}

      {kind === 'rca' && (
        <group position={[0, 0, 0.0008]}>
          {([-0.006, 0.006] as const).map((dx, i) => (
            <group key={`rca-${dx}`} position={[dx, 0, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0042, 0.0042, 0.002, 14]} />
                <meshStandardMaterial color="#d4af37" metalness={0.85} roughness={0.24} />
              </mesh>
              <mesh position={[0, 0, 0.0003]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0031, 0.0031, 0.0022, 12]} />
                <meshStandardMaterial color={i === 0 ? '#dc2626' : '#f1f5f9'} roughness={0.42} />
              </mesh>
              <mesh position={[0, 0, 0.0006]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0015, 0.0015, 0.0022, 10]} />
                <meshStandardMaterial color="#090b0f" roughness={0.75} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {kind === 'trs35' && (
        <group position={[0, 0, borderless ? 0.00008 : 0.0006]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[
                borderless ? 0.0022 : 0.003,
                borderless ? 0.0022 : 0.003,
                borderless ? 0.00028 : 0.0016,
                20,
              ]}
            />
            <meshStandardMaterial
              color={borderless ? '#1e222a' : '#d4af37'}
              metalness={borderless ? 0.18 : 0.85}
              roughness={borderless ? 0.65 : 0.26}
            />
          </mesh>
          <mesh position={[0, 0, borderless ? 0.00008 : 0.0004]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[
                borderless ? 0.00195 : 0.00175,
                borderless ? 0.00195 : 0.00175,
                borderless ? 0.00032 : 0.0016,
                20,
              ]}
            />
            <meshStandardMaterial color="#090b0f" roughness={0.82} />
          </mesh>
        </group>
      )}

      {kind === 'trs635' && (
        <group position={[0, 0, 0.0009]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0058, 0.0058, 0.0022, 6]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.78} roughness={0.32} />
          </mesh>
          <mesh position={[0, 0, 0.0003]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0042, 0.0042, 0.0022, 14]} />
            <meshStandardMaterial color="#1e242d" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.0006]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0031, 0.0031, 0.0022, 12]} />
            <meshStandardMaterial color="#07090c" roughness={0.75} />
          </mesh>
        </group>
      )}

      {kind === 'optical' && (
        <group position={[0, 0, 0.0005]}>
          <mesh position={[0, 0, 0.00015]}>
            <boxGeometry args={[0.0064, 0.0064, 0.0008]} />
            <meshStandardMaterial color="#1e222b" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0, 0.00045]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0014, 0.0014, 0.0007, 10]} />
            <meshStandardMaterial color="#991b1b" emissive="#dc2626" emissiveIntensity={0.45} />
          </mesh>
        </group>
      )}

      {kind === 'bindingPost' && (
        <group position={[0, 0, 0.0012]}>
          {([-0.0065, 0.0065] as const).map((dx, i) => (
            <group key={`bp-${dx}`} position={[dx, 0, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0044, 0.0044, 0.004, 14]} />
                <meshStandardMaterial color={i === 0 ? '#dc2626' : '#18181b'} roughness={0.42} />
              </mesh>
              <mesh position={[0, 0, 0.0024]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0032, 0.0032, 0.0024, 12]} />
                <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.22} />
              </mesh>
              <mesh position={[0, 0, 0.0028]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.0018, 0.0018, 0.0022, 10]} />
                <meshStandardMaterial color="#090b0f" roughness={0.75} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

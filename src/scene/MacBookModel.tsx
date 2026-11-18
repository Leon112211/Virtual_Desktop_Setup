import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from 'three';
import wallpaperUrl from '../assets/screen-wallpaper.jpg';
import type { KeyDef } from '../domain/keyboard';
import { DEFAULT_LID_ANGLE } from '../domain/laptop';
import type { Size } from '../domain/project';
import {
  buildKeycapsGeometry,
  createRoundedPlateGeometry,
  createRoundedRectPlaneGeometry,
  makeKeycapLegendsTexture,
} from './keyboardTexture';
import { PortSocket } from './PortSocket';

function buildMacBookKeys(): KeyDef[] {
  const keys: KeyDef[] = [];
  const rows: {
    z: number;
    h: number;
    items: { label: string; w: number }[];
    splitArrows?: boolean;
  }[] = [
    {
      z: 0,
      h: 1, // Official MacBook Pro 14"/16" full-height 12 function keys + Esc + Touch ID
      items: [
        { label: 'esc', w: 1.5 },
        { label: 'F1', w: 1 },
        { label: 'F2', w: 1 },
        { label: 'F3', w: 1 },
        { label: 'F4', w: 1 },
        { label: 'F5', w: 1 },
        { label: 'F6', w: 1 },
        { label: 'F7', w: 1 },
        { label: 'F8', w: 1 },
        { label: 'F9', w: 1 },
        { label: 'F10', w: 1 },
        { label: 'F11', w: 1 },
        { label: 'F12', w: 1 },
        { label: '', w: 1 },
      ],
    },
    {
      z: 1,
      h: 1,
      items: [
        { label: '~', w: 1 },
        { label: '1', w: 1 },
        { label: '2', w: 1 },
        { label: '3', w: 1 },
        { label: '4', w: 1 },
        { label: '5', w: 1 },
        { label: '6', w: 1 },
        { label: '7', w: 1 },
        { label: '8', w: 1 },
        { label: '9', w: 1 },
        { label: '0', w: 1 },
        { label: '-', w: 1 },
        { label: '=', w: 1 },
        { label: '⌫', w: 1.5 },
      ],
    },
    {
      z: 2,
      h: 1,
      items: [
        { label: 'tab', w: 1.5 },
        { label: 'Q', w: 1 },
        { label: 'W', w: 1 },
        { label: 'E', w: 1 },
        { label: 'R', w: 1 },
        { label: 'T', w: 1 },
        { label: 'Y', w: 1 },
        { label: 'U', w: 1 },
        { label: 'I', w: 1 },
        { label: 'O', w: 1 },
        { label: 'P', w: 1 },
        { label: '[', w: 1 },
        { label: ']', w: 1 },
        { label: '\\', w: 1 },
      ],
    },
    {
      z: 3,
      h: 1,
      items: [
        { label: 'caps', w: 1.75 },
        { label: 'A', w: 1 },
        { label: 'S', w: 1 },
        { label: 'D', w: 1 },
        { label: 'F', w: 1 },
        { label: 'G', w: 1 },
        { label: 'H', w: 1 },
        { label: 'J', w: 1 },
        { label: 'K', w: 1 },
        { label: 'L', w: 1 },
        { label: ';', w: 1 },
        { label: "'", w: 1 },
        { label: 'return', w: 1.75 },
      ],
    },
    {
      z: 4,
      h: 1,
      items: [
        { label: 'shift', w: 2.25 },
        { label: 'Z', w: 1 },
        { label: 'X', w: 1 },
        { label: 'C', w: 1 },
        { label: 'V', w: 1 },
        { label: 'B', w: 1 },
        { label: 'N', w: 1 },
        { label: 'M', w: 1 },
        { label: ',', w: 1 },
        { label: '.', w: 1 },
        { label: '/', w: 1 },
        { label: 'shift', w: 2.25 },
      ],
    },
    {
      z: 5,
      h: 1,
      items: [
        { label: 'fn', w: 1 },
        { label: '⌃', w: 1 },
        { label: '⌥', w: 1 },
        { label: '⌘', w: 1.25 },
        { label: 'SPACE', w: 5 },
        { label: '⌘', w: 1.25 },
        { label: '⌥', w: 1 },
        { label: '←', w: 1 },
        { label: '↑', w: 1 },
        { label: '→', w: 1 },
      ],
      splitArrows: true,
    },
  ];

  for (const row of rows) {
    let cursor = 0;
    for (let c = 0; c < row.items.length; c++) {
      const item = row.items[c];
      if (row.splitArrows && c === row.items.length - 2) {
        keys.push({ x: cursor, z: row.z + 0.035, w: item.w, d: 0.445, label: '↑', role: 'mod' });
        keys.push({ x: cursor, z: row.z + 0.555, w: item.w, d: 0.445, label: '↓', role: 'mod' });
      } else if (row.splitArrows && (c === row.items.length - 3 || c === row.items.length - 1)) {
        keys.push({
          x: cursor,
          z: row.z + 0.555,
          w: item.w,
          d: 0.445,
          label: item.label,
          role: 'mod',
        });
      } else {
        keys.push({
          x: cursor,
          z: row.z,
          w: item.w,
          d: row.h,
          label: item.label,
          role: item.w > 1 || row.z === 0 || row.z === 5 ? 'mod' : 'alpha',
        });
      }
      cursor += item.w;
    }
  }
  return keys;
}

const MACBOOK_KEYS = buildMacBookKeys();

function createMacBookNotchGeometry(notchW: number, notchH: number): ShapeGeometry {
  // Continuous top bezel bridge (extending +0.9 mm up into bezel) + smooth top flares + rounded bottom corners
  const hw = notchW / 2;
  const rBot = Math.min(0.0022, notchH * 0.34);
  const flare = 0.0014;
  const topOverlap = 0.0009;

  const s = new Shape();
  s.moveTo(-hw - flare, topOverlap);
  s.lineTo(hw + flare, topOverlap);
  s.lineTo(hw + flare, 0);
  s.quadraticCurveTo(hw, 0, hw, -flare);
  s.lineTo(hw, -notchH + rBot);
  s.absarc(hw - rBot, -notchH + rBot, rBot, 0, -Math.PI / 2, true);
  s.lineTo(-hw + rBot, -notchH);
  s.absarc(-hw + rBot, -notchH + rBot, rBot, -Math.PI / 2, -Math.PI, true);
  s.lineTo(-hw, -flare);
  s.quadraticCurveTo(-hw, 0, -hw - flare, 0);
  s.closePath();

  return new ShapeGeometry(s, 10);
}

function buildAdaptiveAxis(
  anchors: number[],
  denseMin: number,
  denseMax: number,
  step: number,
): number[] {
  const sorted = [...new Set(anchors)].sort((a, b) => a - b);
  const out: number[] = [sorted[0]];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b - a < 1e-6) continue;
    const inDense = a >= denseMin - 1e-6 && b <= denseMax + 1e-6;
    const segs = inDense ? Math.max(1, Math.ceil((b - a) / step)) : 1;
    for (let s = 1; s <= segs; s++) out.push(a + ((b - a) * s) / segs);
  }
  return out;
}

/**
 * Builds the monolithic CNC aluminum MacBook C-deck unibody with chamfered top/bottom edges
 * and a smoothly sculpted concave front thumb-scoop carved directly out of the palmrest lip.
 */
function createMacBookBaseWithScoopGeometry(
  width: number,
  depth: number,
  thickness: number,
  cornerRadius: number,
  bevel: number,
): BufferGeometry {
  const hw = Math.max(0.004, width / 2 - bevel);
  const hd = Math.max(0.004, depth / 2 - bevel);
  const r = Math.min(Math.max(0.001, cornerRadius - bevel), hw * 0.48, hd * 0.48);
  const ix = hw - r;
  const iz = hd - r;

  const scoopHW = Math.min(0.044, ix * 0.65);
  const scoopD = 0.0072;
  const scoopDepthY = Math.min(0.0024, thickness * 0.34);

  const scoopDrop = (x: number, z: number): number => {
    const ux = Math.abs(x) / scoopHW;
    if (ux >= 1) return 0;
    const uz = Math.max(0, hd - z) / scoopD;
    if (uz >= 1) return 0;
    const fx = 0.5 * (1 + Math.cos(Math.PI * ux));
    const fz = 0.5 * (1 + Math.cos(Math.PI * uz));
    return scoopDepthY * Math.pow(fx, 0.72) * fz;
  };

  const clampRounded = (x: number, z: number): { x: number; z: number; nx: number; nz: number } => {
    let px = x;
    let pz = z;
    if (Math.abs(px) > ix && Math.abs(pz) > iz) {
      const dx = Math.abs(px) - ix;
      const dz = Math.abs(pz) - iz;
      const d = Math.hypot(dx, dz);
      if (d > r) {
        const sc = r / d;
        px = Math.sign(px) * (ix + dx * sc);
        pz = Math.sign(pz) * (iz + dz * sc);
      }
      const nrx = Math.abs(px) - ix;
      const nrz = Math.abs(pz) - iz;
      const nd = Math.hypot(nrx, nrz) || 1;
      return { x: px, z: pz, nx: (Math.sign(px) * nrx) / nd, nz: (Math.sign(pz) * nrz) / nd };
    }
    if (Math.abs(pz) >= hd - 1e-6) return { x: px, z: pz, nx: 0, nz: Math.sign(pz) };
    if (Math.abs(px) >= hw - 1e-6) return { x: px, z: pz, nx: Math.sign(px), nz: 0 };
    return { x: px, z: pz, nx: 0, nz: 0 };
  };

  const cornerStops = (center: number, rad: number, sign: -1 | 1) => [
    center + sign * rad * 0.35,
    center + sign * rad * 0.68,
    center + sign * rad * 0.9,
    center + sign * rad,
  ];
  const xs = buildAdaptiveAxis(
    [-hw, ...cornerStops(-ix, r, -1), -ix, -scoopHW, scoopHW, ix, ...cornerStops(ix, r, 1), hw],
    -scoopHW,
    scoopHW,
    0.004,
  );
  const zs = buildAdaptiveAxis(
    [-hd, ...cornerStops(-iz, r, -1), -iz, 0, hd - scoopD, iz, ...cornerStops(iz, r, 1), hd],
    hd - scoopD,
    hd,
    0.0014,
  );
  const nx = xs.length;
  const nz = zs.length;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushVert = (x: number, y: number, z: number) => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(x / width + 0.5, -z / depth + 0.5);
    return idx;
  };

  // Top sculpted surface grid (y = thickness - scoopDrop)
  const topIdx: number[][] = [];
  const gridMeta: { x: number; z: number; nx: number; nz: number }[][] = [];
  for (let j = 0; j < nz; j++) {
    topIdx[j] = [];
    gridMeta[j] = [];
    for (let i = 0; i < nx; i++) {
      const m = clampRounded(xs[i], zs[j]);
      gridMeta[j][i] = m;
      topIdx[j][i] = pushVert(m.x, thickness - scoopDrop(m.x, m.z), m.z);
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = topIdx[j][i];
      const b = topIdx[j][i + 1];
      const c = topIdx[j + 1][i + 1];
      const d = topIdx[j + 1][i];
      indices.push(a, d, c, a, c, b);
    }
  }

  // Bottom flat grid (y = 0)
  const botIdx: number[][] = [];
  for (let j = 0; j < nz; j++) {
    botIdx[j] = [];
    for (let i = 0; i < nx; i++) {
      const m = gridMeta[j][i];
      botIdx[j][i] = pushVert(m.x, 0, m.z);
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = botIdx[j][i];
      const b = botIdx[j][i + 1];
      const c = botIdx[j + 1][i + 1];
      const d = botIdx[j + 1][i];
      indices.push(a, b, c, a, c, d);
    }
  }

  // Ordered CCW perimeter loop around bottom/top grid (front -> right -> back -> left)
  const perim: { x: number; z: number; nx: number; nz: number; topI: number; botI: number }[] = [];
  const addPerim = (i: number, j: number) => {
    const m = gridMeta[j][i];
    perim.push({ ...m, topI: topIdx[j][i], botI: botIdx[j][i] });
  };
  for (let i = 0; i < nx; i++) addPerim(i, nz - 1);
  for (let j = nz - 2; j >= 0; j--) addPerim(nx - 1, j);
  for (let i = nx - 2; i >= 0; i--) addPerim(i, 0);
  for (let j = 1; j < nz - 1; j++) addPerim(0, j);

  const rings: number[][] = [perim.map((p) => p.topI)];
  const ringSpecs = [
    { out: bevel * 0.72, yFn: (drop: number) => thickness - drop - bevel * 0.28 },
    { out: bevel, yFn: (drop: number) => Math.max(bevel + 0.0005, thickness - drop - bevel) },
    { out: bevel, yFn: () => bevel },
    { out: bevel * 0.72, yFn: () => bevel * 0.28 },
  ];
  for (const spec of ringSpecs) {
    rings.push(
      perim.map((p) => {
        const drop = p.z > hd - 1e-4 ? scoopDrop(p.x, hd) : 0;
        return pushVert(p.x + p.nx * spec.out, spec.yFn(drop), p.z + p.nz * spec.out);
      }),
    );
  }
  rings.push(perim.map((p) => p.botI));

  const P = perim.length;
  for (let rIdx = 0; rIdx < rings.length - 1; rIdx++) {
    const upper = rings[rIdx];
    const lower = rings[rIdx + 1];
    for (let k = 0; k < P; k++) {
      const kNext = (k + 1) % P;
      const a = upper[k];
      const b = upper[kNext];
      const c = lower[kNext];
      const d = lower[k];
      indices.push(a, d, c, a, c, b);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

function makeSpeakerGrilleTexture() {
  const w = 256;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(14, 18, 24, 0.84)';
  const stepX = 16;
  const stepY = 14;
  for (let row = 0, y = 18; y <= h - 18; y += stepY, row++) {
    for (let x = 18 + (row % 2) * (stepX / 2); x <= w - 18; x += stepX) {
      ctx.beginPath();
      ctx.arc(x, y, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function MacBookModel({
  size,
  color,
  lidAngle = DEFAULT_LID_ANGLE,
}: {
  size: Size;
  color: string;
  lidAngle?: number;
}) {
  const wallpaper = useTexture(wallpaperUrl);
  wallpaper.colorSpace = SRGBColorSpace;

  const { width: w, height: h, depth: d } = size;
  const isPro = h >= 0.0135; // MacBook Pro (14" Standard / PROLED XDR / 16") vs Air
  const footH = 0.0012;
  const bodyH = Math.max(0.006, h * 0.72 - footH);
  const lidT = Math.max(0.0032, h * 0.28);
  const cornerR = Math.min(0.012, Math.max(0.0095, w * 0.034));
  const baseBevel = Math.min(0.0022, bodyH * 0.22);
  const lidBevel = Math.min(0.001, lidT * 0.25);

  const baseGeo = useMemo(
    () => createMacBookBaseWithScoopGeometry(w, d, bodyH, cornerR, baseBevel),
    [w, d, bodyH, cornerR, baseBevel],
  );
  const lidGeo = useMemo(
    () => createRoundedPlateGeometry(w, d, lidT, cornerR, lidBevel),
    [w, d, lidT, cornerR, lidBevel],
  );
  const speakerTex = useMemo(makeSpeakerGrilleTexture, []);

  // Standardized Apple Silicon ANSI 78-key Magic Keyboard specs:
  // 19.0 × 19.0 mm center pitch (Px/Py), 16.5 × 16.0 mm 1U keycaps (Gx = 2.5 mm, Gy = 3.0 mm), R = 1.7 mm
  const unitX = Math.min(0.019, (w - 0.02) / 14.5);
  const unitZ = unitX;
  const gridWidth = unitX * 14.5;
  const gridDepth = unitZ * 6;
  const kbWidth = gridWidth + 0.003;
  const kbDepth = gridDepth + 0.0025;
  const kbTopMargin = Math.max(0.016, d * 0.095);
  const kbCenterZ = -d / 2 + kbTopMargin + kbDepth / 2;
  const kbOriginX = -gridWidth / 2;
  const kbOriginZ = kbCenterZ - gridDepth / 2;
  const deckY = footH + bodyH;
  const wellDepth = 0.0008;
  const keyHeight = 0.00135;

  const keycapsGeo = useMemo(
    () =>
      buildKeycapsGeometry(
        MACBOOK_KEYS,
        14.5,
        6,
        unitX,
        unitZ,
        keyHeight,
        kbOriginX,
        kbOriginZ,
        deckY - wellDepth,
        2.5 / 19,
        0.016,
        1.7 / 19,
        3.0 / 19,
      ),
    [unitX, unitZ, keyHeight, kbOriginX, kbOriginZ, deckY, wellDepth],
  );

  const keyLegendsTex = useMemo(
    () =>
      makeKeycapLegendsTexture(MACBOOK_KEYS, 14.5, 6, {
        alphaBg: '#1e222a',
        alphaFg: '#e8edf5',
        modBg: '#1e222a',
        modFg: '#cbd5e1',
        accentBg: '#1e222a',
        accentFg: '#e8edf5',
      }),
    [],
  );

  useEffect(() => () => baseGeo.dispose(), [baseGeo]);
  useEffect(() => () => lidGeo.dispose(), [lidGeo]);
  useEffect(() => () => speakerTex.dispose(), [speakerTex]);
  useEffect(() => () => keycapsGeo.dispose(), [keycapsGeo]);
  useEffect(() => () => keyLegendsTex.dispose(), [keyLegendsTex]);

  // C-04 Force Touch glass trackpad centered in palm zone between keyboard & thumb scoop
  const kbWellBottomZ = kbCenterZ + (kbDepth + 0.004) / 2;
  const palmMinZ = kbWellBottomZ + 0.007;
  const palmMaxZ = d / 2 - 0.0105;
  const availablePalmD = Math.max(0.03, palmMaxZ - palmMinZ);
  const tpWidth = Math.min(w * 0.44, w >= 0.335 ? 0.158 : 0.13);
  const tpDepth = Math.min(availablePalmD - 0.002, d >= 0.235 ? 0.096 : 0.0805);
  const tpZ = (palmMinZ + palmMaxZ) / 2;

  const keyWellGeo = useMemo(
    () => createRoundedPlateGeometry(kbWidth + 0.004, kbDepth + 0.004, wellDepth + 0.0002, 0.0052),
    [kbWidth, kbDepth, wellDepth],
  );
  const tpRimGeo = useMemo(
    () => createRoundedPlateGeometry(tpWidth + 0.0014, tpDepth + 0.0014, 0.0002, 0.006),
    [tpWidth, tpDepth],
  );
  const tpGeo = useMemo(
    () => createRoundedPlateGeometry(tpWidth, tpDepth, 0.0002, 0.0055),
    [tpWidth, tpDepth],
  );
  useEffect(
    () => () => {
      keyWellGeo.dispose();
      tpRimGeo.dispose();
      tpGeo.dispose();
    },
    [keyWellGeo, tpRimGeo, tpGeo],
  );

  // C-05 Laser-drilled six-speaker side grilles cleanly inset within the flanking C-face wings
  const sideMargin = (w - kbWidth) / 2;
  const speakerW = isPro ? Math.max(0.008, sideMargin - 0.0085) : 0;

  // Lid & Display parameters (Apple 3.5 mm Pro / 4.2 mm Air bezel + hardware-accurate PPI notch dimensions)
  const bezelSide = isPro ? 0.0036 : 0.0044;
  const bezelTop = isPro ? 0.0036 : 0.0044;
  const bezelBottom = 0.0105;
  const screenW = Math.max(0.08, w - bezelSide * 2);
  const screenH = Math.max(0.05, d - bezelTop - bezelBottom);
  const screenCenterOffset = (bezelBottom - bezelTop) / 2;
  const notchW = isPro ? (w >= 0.34 ? 0.038 : 0.036) : 0.035;
  const notchH = isPro ? (w >= 0.34 ? 0.0074 : 0.0064) : 0.007;

  const bezelGeo = useMemo(
    () =>
      createRoundedRectPlaneGeometry(
        Math.max(0.04, w - 0.0036),
        Math.max(0.04, d - 0.0036),
        Math.max(0.002, cornerR - 0.0022),
      ),
    [w, d, cornerR],
  );
  const screenGeo = useMemo(
    () =>
      createRoundedRectPlaneGeometry(
        screenW,
        screenH,
        Math.max(0.002, cornerR - bezelSide - 0.001),
        0.0015,
      ),
    [screenW, screenH, cornerR, bezelSide],
  );
  const notchGeo = useMemo(() => createMacBookNotchGeometry(notchW, notchH), [notchW, notchH]);
  useEffect(() => {
    return () => {
      bezelGeo.dispose();
      screenGeo.dispose();
      notchGeo.dispose();
    };
  }, [bezelGeo, screenGeo, notchGeo]);

  const hingeY = deckY;
  const hingeZ = -d / 2 + 0.005;
  const lidTilt = ((90 - lidAngle) * Math.PI) / 180;

  const footInsetX = w / 2 - cornerR - 0.009;
  const footInsetZ = d / 2 - cornerR - 0.009;
  const clutchW = Math.min(w * 0.72, kbWidth * 0.94);

  return (
    <group>
      {/* 4 枚底面橡胶防滑脚垫 */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`foot-${sx}${sz}`}
            position={[sx * footInsetX, footH / 2, sz * footInsetZ]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.008, 0.0085, footH, 16]} />
            <meshStandardMaterial color="#1d2025" roughness={0.85} />
          </mesh>
        )),
      )}

      {/* 铝合金 CNC 一体成型机身底座（前缘一体铣削曲面开合指槽） */}
      <mesh geometry={baseGeo} position={[0, footH, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} metalness={0.76} roughness={0.29} />
      </mesh>

      {/* 后缘转轴隐藏式黑色转轴筒 & 散热槽 */}
      <mesh position={[0, deckY - 0.0015, -d / 2 + 0.005]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0032, 0.0032, clutchW, 14]} />
        <meshStandardMaterial color="#15181e" roughness={0.62} metalness={0.25} />
      </mesh>
      <mesh position={[0, footH + bodyH * 0.35, -d / 2 + 0.001]}>
        <boxGeometry args={[clutchW * 0.96, 0.0022, 0.0025]} />
        <meshStandardMaterial color="#14171c" roughness={0.7} />
      </mesh>

      {/* 黑色阳极氧化圆角键盘下沉槽 */}
      <mesh
        geometry={keyWellGeo}
        position={[0, deckY - wellDepth + 0.0001, kbCenterZ]}
        receiveShadow
      >
        <meshStandardMaterial color="#181b20" roughness={0.72} metalness={0.1} />
      </mesh>

      {/* 78 键真实比例孤岛键帽 + 清晰白色字符 */}
      <mesh geometry={keycapsGeo} castShadow receiveShadow>
        <meshStandardMaterial map={keyLegendsTex} roughness={0.56} metalness={0.05} />
      </mesh>

      {/* C-03 右上角全高 Touch ID 电源键凹环与蓝宝石感应表面 */}
      <group
        position={[
          kbOriginX + 14 * unitX,
          deckY - wellDepth + keyHeight + 0.00005,
          kbOriginZ + 0.5 * unitZ,
        ]}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[unitX * 0.27, unitX * 0.33, 24]} />
          <meshStandardMaterial color="#646d7a" metalness={0.72} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.00002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[unitX * 0.26, 24]} />
          <meshStandardMaterial color="#16191f" roughness={0.22} metalness={0.18} />
        </mesh>
      </group>

      {/* C-05 Pro 型号键盘两侧精密错列声学扬声器孔阵列 */}
      {isPro &&
        speakerW > 0.008 &&
        [-1, 1].map((side) => (
          <mesh
            key={`spk-${side}`}
            position={[side * (kbWidth / 2 + 0.0042 + speakerW / 2), deckY + 0.00018, kbCenterZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[speakerW, kbDepth * 0.96]} />
            <meshStandardMaterial
              map={speakerTex}
              transparent
              alphaTest={0.05}
              depthWrite={false}
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
        ))}

      {/* C-04 Force Touch 玻璃触控板（精密微缝边框 + 低粗糙度玻璃反光表面） */}
      <mesh geometry={tpRimGeo} position={[0, deckY + 0.00003, tpZ]} receiveShadow>
        <meshStandardMaterial color="#3c434e" roughness={0.55} />
      </mesh>
      <mesh geometry={tpGeo} position={[0, deckY + 0.00012, tpZ]} receiveShadow>
        <meshStandardMaterial color={color} metalness={0.44} roughness={0.12} />
      </mesh>

      {/* Pro 底部左右双侧隐蔽散热进气槽 */}
      {isPro &&
        [-1, 1].map((side) => (
          <mesh key={`vent-${side}`} position={[side * (w / 2 - 0.0012), footH + 0.0016, d * 0.06]}>
            <boxGeometry args={[0.0012, 0.0015, d * 0.16]} />
            <meshStandardMaterial color="#12151a" roughness={0.75} />
          </mesh>
        ))}

      {/* 左侧实体接口：1:1 MagSafe 3 + 2× Thunderbolt / USB-C + 3.5 mm 耳机孔（无边框一体化开孔） */}
      <group position={[-w / 2 + 0.00002, footH + bodyH * 0.56, 0]}>
        <PortSocket
          kind="magsafe3"
          position={[0, 0, -d * 0.3]}
          rotation={[0, -Math.PI / 2, 0]}
          borderless
        />
        {[-d * 0.17, -d * 0.06].map((pz, idx) => (
          <PortSocket
            key={`tb-l-${idx}`}
            kind="usbc"
            position={[0, 0, pz]}
            rotation={[0, -Math.PI / 2, 0]}
            borderless
          />
        ))}
        <PortSocket
          kind="trs35"
          position={[0, 0, d * 0.07]}
          rotation={[0, -Math.PI / 2, 0]}
          borderless
        />
      </group>

      {/* 右侧实体接口：1:1 HDMI Type A + Thunderbolt + SDXC 卡槽（Pro 机型 · 无边框一体化开孔） */}
      {isPro && (
        <group position={[w / 2 - 0.00002, footH + bodyH * 0.54, 0]}>
          <PortSocket
            kind="hdmi"
            position={[0, 0, -d * 0.16]}
            rotation={[0, Math.PI / 2, 0]}
            borderless
          />
          <PortSocket
            kind="usbc"
            position={[0, 0, -d * 0.04]}
            rotation={[0, Math.PI / 2, 0]}
            borderless
          />
          <PortSocket
            kind="sd"
            position={[0, 0, d * 0.08]}
            rotation={[0, Math.PI / 2, 0]}
            borderless
          />
        </group>
      )}

      {/* 屏幕盖板（绕后缘铰链开合，闭合时严密贴合 C 面） */}
      <group position={[0, hingeY, hingeZ]} rotation={[lidTilt, 0, 0]}>
        <group position={[0, d / 2 - 0.005, lidT / 2]}>
          <mesh
            geometry={lidGeo}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, -lidT / 2]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={color} metalness={0.78} roughness={0.26} />
          </mesh>
          <mesh geometry={bezelGeo} position={[0, 0, lidT / 2 + 0.00015]}>
            <meshStandardMaterial color="#0c0f14" roughness={0.22} metalness={0.12} />
          </mesh>
          <mesh geometry={screenGeo} position={[0, screenCenterOffset, lidT / 2 + 0.0004]}>
            <meshBasicMaterial map={wallpaper} toneMapped={false} />
          </mesh>
          <mesh
            geometry={notchGeo}
            position={[0, screenCenterOffset + screenH / 2, lidT / 2 + 0.00055]}
          >
            <meshStandardMaterial color="#0c0f14" roughness={0.22} metalness={0.12} />
          </mesh>
          <group
            position={[0, screenCenterOffset + screenH / 2 - notchH * 0.46, lidT / 2 + 0.0007]}
          >
            {/* 1080p FaceTime HD 镜头深色玻璃环 + 蓝膜玻璃镜片 */}
            <mesh>
              <circleGeometry args={[0.0017, 16]} />
              <meshStandardMaterial color="#171c25" roughness={0.3} metalness={0.5} />
            </mesh>
            <mesh position={[0, 0, 0.00008]}>
              <circleGeometry args={[0.0009, 14]} />
              <meshStandardMaterial color="#254678" roughness={0.12} metalness={0.75} />
            </mesh>
            {/* 环境光 / TrueTone 传感器微孔 */}
            <mesh position={[0.0046, 0, 0.00005]}>
              <circleGeometry args={[0.00045, 10]} />
              <meshStandardMaterial color="#161a22" roughness={0.4} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  CatmullRomCurve3,
  Color,
  Euler,
  type InstancedMesh,
  Object3D,
  TubeGeometry,
  Vector3,
} from 'three';
import { grommetPosition } from '../domain/desk';
import {
  buildKeyboardKeys,
  defaultKeyboardSettings,
  KEYBOARD_LAYOUT_SPECS,
  matchKeyboardLayout,
  resolveKeyboardTheme,
  type KeyboardSettings,
} from '../domain/keyboard';
import type { Desk, SceneItem } from '../domain/project';
import {
  buildKeycapsGeometry,
  createRoundedPlateGeometry,
  keyPerKeyRgbHex,
  makeKeycapLegendEmissiveTexture,
  makeKeycapLegendsTexture,
  makePerKeyRgbPlateTextures,
  makeRgbPlateTexture,
} from './keyboardTexture';
import { PortSocket } from './PortSocket';

/**
 * Renders a 1:1 coiled GX16 aviator keyboard cable in the keyboard's local frame:
 * USB-C plug at rear-left -> tight 16 cm helical spring coil -> GX16 metal threaded coupling ->
 * straight host cable heading to the desk grommet or rear edge.
 */
function CoiledAviatorCable({
  keyboardWidth,
  keyboardDepth,
  item,
  desk,
  cableColor,
}: {
  keyboardWidth: number;
  keyboardDepth: number;
  item: SceneItem;
  desk: Desk;
  cableColor: string;
}) {
  const portX = -keyboardWidth * 0.34;
  const portZ = -keyboardDepth / 2;
  const portY = 0.011;
  const cableR = 0.0026; // 5.2 mm double-sleeved paracord + techflex OD
  const coilR = 0.0085; // ~17 mm center / ~22 mm coil OD
  const coilY = coilR + cableR;
  const coilZ = portZ - 0.044;
  const coilStartX = portX + 0.018;
  const coilLen = Math.min(0.165, Math.max(0.11, keyboardWidth * 0.48));
  const coilEndX = coilStartX + coilLen;

  // Map desk grommet or back edge into keyboard's local space so host cable routes realistically.
  const hostTargetLocal = useMemo(() => {
    const yaw = (item.rotation * Math.PI) / 180;
    const grommet = grommetPosition(desk);
    const worldTarget = grommet
      ? new Vector3(grommet.x, 0.005, grommet.z)
      : new Vector3(item.x + 0.05, 0.005, -desk.depth / 2 + 0.02);
    const dx = worldTarget.x - item.x;
    const dz = worldTarget.z - item.z;
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    return new Vector3(lx, 0.005, Math.min(coilZ - 0.14, lz));
  }, [item.x, item.z, item.rotation, desk, coilZ]);

  const { leadGeo, coilGeo, hostGeo, gx16Pos, gxLeft } = useMemo(() => {
    // 1. Short lead from USB-C plug boot into left side of coil
    const leadCurve = new CatmullRomCurve3([
      new Vector3(portX, portY, portZ - 0.022),
      new Vector3(portX, portY - 0.002, portZ - 0.036),
      new Vector3(coilStartX, coilY, coilZ),
    ]);
    const leadG = new TubeGeometry(leadCurve, 14, cableR, 8, false);

    // 2. Helical coil (24 tight uniform turns)
    const turns = 24;
    const steps = turns * 10;
    const helixPts: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2;
      helixPts.push(
        new Vector3(
          coilStartX + t * coilLen,
          coilY + Math.sin(angle) * coilR,
          coilZ + Math.cos(angle) * coilR,
        ),
      );
    }
    const coilCurve = new CatmullRomCurve3(helixPts, false, 'centripetal', 0.2);
    const coilG = new TubeGeometry(coilCurve, steps, cableR, 7, false);

    // 3. Exit coil -> GX16 circular aviator coupling -> Host straight cable
    const gxCenter = new Vector3(coilEndX + 0.056, 0.01, coilZ - 0.016);
    const gxAxis = new Vector3(0, 1, 0).applyEuler(new Euler(0, -0.38, Math.PI / 2));
    // `gxAxis` points along local +Y; ensure entry is the end closest to coilEndX (negative X side).
    const gxLeft = gxCenter.clone().addScaledVector(gxAxis, gxAxis.x < 0 ? 0.038 : -0.038);
    const gxRight = gxCenter.clone().addScaledVector(gxAxis, gxAxis.x < 0 ? -0.038 : 0.038);

    const tailCurve = new CatmullRomCurve3([
      gxRight,
      new Vector3(gxRight.x + 0.035, 0.005, gxRight.z - 0.035),
      hostTargetLocal,
      new Vector3(hostTargetLocal.x, -0.04, hostTargetLocal.z - 0.01),
    ]);
    const hostG = new TubeGeometry(tailCurve, 26, cableR, 8, false);
    const finalLeadG = new TubeGeometry(leadCurve, 14, cableR, 8, false);
    leadG.dispose();

    return {
      leadGeo: finalLeadG,
      coilGeo: coilG,
      hostGeo: hostG,
      gx16Pos: gxCenter,
      gxLeft,
    };
  }, [portX, portY, portZ, coilStartX, coilEndX, coilLen, coilY, coilZ, hostTargetLocal]);

  // Short curved link from right end of coil into GX16 front boot
  const preGxGeo = useMemo(() => {
    const c = new CatmullRomCurve3([
      new Vector3(coilEndX, coilY, coilZ),
      new Vector3(coilEndX + 0.012, 0.011, coilZ - 0.005),
      gxLeft,
    ]);
    return new TubeGeometry(c, 10, cableR, 8, false);
  }, [coilEndX, coilY, coilZ, gxLeft]);

  useEffect(() => () => leadGeo.dispose(), [leadGeo]);
  useEffect(() => () => coilGeo.dispose(), [coilGeo]);
  useEffect(() => () => hostGeo.dispose(), [hostGeo]);
  useEffect(() => () => preGxGeo.dispose(), [preGxGeo]);

  return (
    <group>
      {/* 1. 键盘端 CNC 铝壳 USB-C 插头 + 热缩管护套 */}
      <group position={[portX, portY, portZ - 0.008]}>
        <RoundedBox args={[0.0124, 0.0066, 0.018]} radius={0.0025} smoothness={2} castShadow>
          <meshStandardMaterial color="#8f98a6" metalness={0.78} roughness={0.28} />
        </RoundedBox>
        <mesh position={[0, 0, -0.013]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0038, 0.0044, 0.01, 10]} />
          <meshStandardMaterial color="#181b21" roughness={0.65} />
        </mesh>
      </group>

      {/* 2. 编织弹簧线圈主体（Paracord + Techflex 双层微光泽质感） */}
      <mesh geometry={leadGeo} castShadow receiveShadow>
        <meshStandardMaterial color={cableColor} roughness={0.62} metalness={0.14} />
      </mesh>
      <mesh geometry={coilGeo} castShadow receiveShadow>
        <meshStandardMaterial color={cableColor} roughness={0.58} metalness={0.18} />
      </mesh>
      <mesh geometry={preGxGeo} castShadow receiveShadow>
        <meshStandardMaterial color={cableColor} roughness={0.6} metalness={0.16} />
      </mesh>

      {/* 3. 1:1 GX16 圆形金属航空插头（Ø16mm 筒身 + 滚花锁紧环 + 双侧压线夹箍与螺钉） */}
      <group position={gx16Pos} rotation={[0, -0.38, Math.PI / 2]}>
        {/* 左侧热缩管与压线尾夹 */}
        <mesh position={[0, -0.034, 0]}>
          <cylinderGeometry args={[0.0045, 0.0055, 0.012, 12]} />
          <meshStandardMaterial color="#181b21" roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.024, 0]} castShadow>
          <cylinderGeometry args={[0.0075, 0.0075, 0.01, 16]} />
          <meshStandardMaterial color="#a6aeb9" metalness={0.85} roughness={0.24} />
        </mesh>
        {/* 压线夹箍双侧固定螺钉 */}
        {[-0.007, 0.007].map((sx, idx) => (
          <mesh key={`gx-l-${idx}`} position={[sx, -0.024, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.0016, 0.0016, 0.003, 8]} />
            <meshStandardMaterial color="#343a44" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}

        {/* GX16 主对接筒身（16 mm 真实直径） */}
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.038, 20]} />
          <meshStandardMaterial color="#b8c0ca" metalness={0.88} roughness={0.22} />
        </mesh>

        {/* 中央螺纹滚花锁紧环（Ø18.5 mm） */}
        <mesh position={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0093, 0.0093, 0.011, 20]} />
          <meshStandardMaterial color="#8d96a3" metalness={0.85} roughness={0.32} />
        </mesh>
        {[-0.0035, 0.0035].map((gy, idx) => (
          <mesh key={`ring-${idx}`} position={[0, gy, 0]}>
            <cylinderGeometry args={[0.0095, 0.0095, 0.0012, 20]} />
            <meshStandardMaterial color="#232830" roughness={0.5} />
          </mesh>
        ))}

        {/* 右侧压线尾夹与热缩管 */}
        <mesh position={[0, 0.024, 0]} castShadow>
          <cylinderGeometry args={[0.0075, 0.0075, 0.01, 16]} />
          <meshStandardMaterial color="#a6aeb9" metalness={0.85} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.034, 0]}>
          <cylinderGeometry args={[0.0055, 0.0045, 0.012, 12]} />
          <meshStandardMaterial color="#181b21" roughness={0.65} />
        </mesh>
      </group>

      {/* 4. GX16 后段直连主机线（通往走线孔或桌后缘） */}
      <mesh geometry={hostGeo} castShadow receiveShadow>
        <meshStandardMaterial color={cableColor} roughness={0.62} metalness={0.14} />
      </mesh>
    </group>
  );
}

export function KeyboardModel({ item, desk }: { item: SceneItem; desk: Desk }) {
  const settings: KeyboardSettings = item.keyboard ?? {
    ...defaultKeyboardSettings(),
    layout: matchKeyboardLayout(item.size),
  };
  const spec = KEYBOARD_LAYOUT_SPECS[settings.layout];
  const { width: w, height: h, depth: d } = item.size;
  const isMagnetic = settings.switchType === 'magnetic';
  const theme = resolveKeyboardTheme(item.color, settings.theme);
  const brightness = settings.rgbBrightness ?? 1;

  const keys = useMemo(() => buildKeyboardKeys(settings.layout), [settings.layout]);

  const caseH = Math.max(0.014, h * 0.54);
  const keyH = Math.max(0.007, h * 0.34);
  const marginX = 0.011;
  const marginZ = 0.01;
  const innerW = Math.max(0.1, w - marginX * 2);
  const innerD = Math.max(0.05, d - marginZ * 2);
  const unitX = innerW / spec.uWidth;
  const unitZ = innerD / spec.uDepth;

  // Monochrome Pure White / Pure Black keycap palette (unified chassis & keycaps)
  const legendsTex = useMemo(() => {
    const keyBg = theme === 'black' ? '#121419' : '#f7f8fa';
    const keyFg = theme === 'black' ? '#e5ebf4' : '#262d38';
    return makeKeycapLegendsTexture(keys, spec.uWidth, spec.uDepth, {
      alphaBg: keyBg,
      alphaFg: keyFg,
      modBg: keyBg,
      modFg: keyFg,
      accentBg: keyBg,
      accentFg: keyFg,
    });
  }, [keys, spec.uWidth, spec.uDepth, theme]);

  const legendEmissiveTex = useMemo(
    () =>
      settings.rgb
        ? makeKeycapLegendEmissiveTexture(
            keys,
            spec.uWidth,
            spec.uDepth,
            settings.rgbMode,
            settings.rgbColor,
            brightness,
          )
        : null,
    [keys, spec.uWidth, spec.uDepth, settings.rgb, settings.rgbMode, settings.rgbColor, brightness],
  );

  const plateW = innerW + 0.003;
  const plateD = innerD + 0.003;

  const rgbTex = useMemo(
    () => makeRgbPlateTexture(settings.rgbMode, settings.rgbColor),
    [settings.rgbMode, settings.rgbColor],
  );

  const perKeyPlateTex = useMemo(
    () =>
      makePerKeyRgbPlateTextures(
        keys,
        spec.uWidth,
        spec.uDepth,
        innerW,
        innerD,
        plateW,
        plateD,
        settings.rgb,
        settings.rgbMode,
        settings.rgbColor,
        theme,
        brightness,
      ),
    [
      keys,
      spec.uWidth,
      spec.uDepth,
      innerW,
      innerD,
      plateW,
      plateD,
      settings.rgb,
      settings.rgbMode,
      settings.rgbColor,
      theme,
      brightness,
    ],
  );

  const keycapsGeo = useMemo(
    () =>
      buildKeycapsGeometry(
        keys,
        spec.uWidth,
        spec.uDepth,
        unitX,
        unitZ,
        keyH,
        -innerW / 2,
        -innerD / 2,
        caseH - 0.001,
      ),
    [keys, spec.uWidth, spec.uDepth, unitX, unitZ, keyH, innerW, innerD, caseH],
  );

  const rgbPlateGeo = useMemo(
    () => createRoundedPlateGeometry(plateW, plateD, 0.0006, 0.006),
    [plateW, plateD],
  );

  const invalidate = useThree((s) => s.invalidate);
  const switchLedRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = switchLedRef.current;
    if (!mesh || !settings.rgb) return;
    const dummy = new Object3D();
    const c = new Color();
    const ledScale = Math.min(1.15, 0.85 * brightness);
    keys.forEach((key, idx) => {
      const cx = -innerW / 2 + (key.x + key.w / 2) * unitX;
      const cz = -innerD / 2 + (key.z + key.d / 2) * unitZ + unitZ * 0.04;
      dummy.position.set(cx, caseH - 0.0005, cz);
      dummy.scale.set(Math.min(key.w * unitX * 0.44, unitX * 0.46), 0.0014, unitZ * 0.44);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      c.set(keyPerKeyRgbHex(key, spec.uWidth, spec.uDepth, settings.rgbMode, settings.rgbColor));
      c.multiplyScalar(ledScale);
      mesh.setColorAt(idx, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [
    keys,
    innerW,
    innerD,
    unitX,
    unitZ,
    caseH,
    spec.uWidth,
    spec.uDepth,
    settings.rgb,
    settings.rgbMode,
    settings.rgbColor,
    brightness,
    invalidate,
  ]);

  useEffect(() => () => legendsTex.dispose(), [legendsTex]);
  useEffect(() => () => legendEmissiveTex?.dispose(), [legendEmissiveTex]);
  useEffect(() => () => rgbTex.dispose(), [rgbTex]);
  useEffect(() => {
    return () => {
      perKeyPlateTex.colorMap.dispose();
      perKeyPlateTex.emissiveMap.dispose();
    };
  }, [perKeyPlateTex]);
  useEffect(() => () => keycapsGeo.dispose(), [keycapsGeo]);
  useEffect(() => () => rgbPlateGeo.dispose(), [rgbPlateGeo]);

  return (
    <group>
      {/* 键盘主体底座与圆润倒角铝合金/PBT 外框（纯白或纯黑统一质感） */}
      <RoundedBox
        args={[w, caseH, d]}
        radius={Math.min(0.011, caseH * 0.45)}
        smoothness={6}
        position={[0, caseH / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={item.color}
          metalness={isMagnetic ? 0.46 : 0.16}
          roughness={theme === 'white' ? 0.38 : 0.44}
        />
      </RoundedBox>

      {/* 定位板（随纯白/纯黑主题自适应）+ 柔润下偏轴心单键漫反射光晕 */}
      <mesh geometry={rgbPlateGeo} position={[0, caseH - 0.0002, 0]} receiveShadow>
        {settings.rgb ? (
          <meshStandardMaterial
            map={perKeyPlateTex.colorMap}
            emissiveMap={perKeyPlateTex.emissiveMap}
            emissive="#ffffff"
            emissiveIntensity={(theme === 'black' ? 2.1 : 1.75) * brightness}
            roughness={theme === 'white' ? 0.36 : 0.5}
            metalness={theme === 'white' ? 0.06 : 0.12}
          />
        ) : (
          <meshStandardMaterial
            map={perKeyPlateTex.colorMap}
            roughness={theme === 'white' ? 0.44 : 0.65}
            metalness={0.08}
          />
        )}
      </mesh>

      {/* 收敛式圆柱形 PC 柔光轴芯导光环（隐藏于键帽裙边之内，仅浅视角透出温润轴光） */}
      {settings.rgb && (
        <instancedMesh
          key={`leds-${keys.length}`}
          ref={switchLedRef}
          args={[undefined, undefined, keys.length]}
        >
          <cylinderGeometry args={[0.5, 0.56, 1, 14]} />
          <meshBasicMaterial transparent opacity={0.82} />
        </instancedMesh>
      )}

      {/* 磁轴键盘前侧纤细柔光氛围灯条 */}
      {isMagnetic && settings.rgb && (
        <RoundedBox
          args={[w * 0.42, 0.0018, 0.0012]}
          radius={0.0006}
          smoothness={4}
          position={[0, caseH * 0.44, d / 2 + 0.0002]}
        >
          <meshStandardMaterial
            map={rgbTex}
            emissiveMap={rgbTex}
            emissive="#ffffff"
            emissiveIntensity={1.15 * brightness}
          />
        </RoundedBox>
      )}

      {/* 3D 阶梯纯色键帽 + 透光字符背光 */}
      <mesh geometry={keycapsGeo} castShadow receiveShadow>
        {settings.rgb && legendEmissiveTex ? (
          <meshStandardMaterial
            map={legendsTex}
            emissiveMap={legendEmissiveTex}
            emissive="#ffffff"
            emissiveIntensity={(theme === 'black' ? 1.25 : 0.6) * brightness}
            roughness={0.5}
            metalness={0.02}
          />
        ) : (
          <meshStandardMaterial map={legendsTex} roughness={0.52} metalness={0.02} />
        )}
      </mesh>

      {/* 键盘后缘 1:1 USB-C 接口 */}
      <PortSocket
        kind="usbc"
        position={[-w * 0.34, 0.011, -d / 2 + 0.0002]}
        rotation={[0, Math.PI, 0]}
      />

      {/* 磁轴/客制化键盘 1:1 GX16 弹簧航空线配件 */}
      {settings.aviatorCable && (
        <CoiledAviatorCable
          keyboardWidth={w}
          keyboardDepth={d}
          item={item}
          desk={desk}
          cableColor={settings.cableColor}
        />
      )}
    </group>
  );
}

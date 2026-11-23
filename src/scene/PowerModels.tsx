// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { RoundedBox } from '@react-three/drei';
import {
  computePowerStripSize,
  computePowerStripSlots,
  computePowerStripUsbPorts,
  computeWallOutletSize,
  computeWallOutletSlots,
  computeWallOutletUsbPorts,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  POWER_STRIP_LAYOUT_META,
  type PowerOutletType,
} from '../domain/power';
import type { SceneItem } from '../domain/project';
import { PortSocket } from './PortSocket';

/**
 * Renders 1:1 GB/T 2099 / 1002 compliant AC socket holes in local socket frame
 * directly integrated into the parent faceplate with zero contrasting square patch,
 * where holes face +Z (or +Y when rotated `[-Math.PI / 2, 0, 0]`).
 */
export function AcReceptacleSocket({
  outletType,
  position,
  rotation = [0, 0, 0],
}: {
  outletType: PowerOutletType;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const showTwo = outletType === 'twoPin' || outletType === 'combo5';
  const showThree = outletType === 'threePin' || outletType === 'combo5';
  const twoY = outletType === 'combo5' ? 0.0082 : 0;
  const threeCenterY = outletType === 'combo5' ? -0.0068 : 0;

  return (
    <group position={position} rotation={rotation}>
      {showTwo && (
        <group position={[0, twoY, 0.0004]}>
          {([-0.0065, 0.0065] as const).map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh>
                <boxGeometry args={[0.0024, 0.0074, 0.0009]} />
                <meshStandardMaterial color="#181c22" roughness={0.75} />
              </mesh>
              <mesh position={[0, 0, 0.00025]}>
                <boxGeometry args={[0.0011, 0.0052, 0.0006]} />
                <meshStandardMaterial color="#b98a4a" metalness={0.7} roughness={0.35} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {showThree && (
        <group position={[0, threeCenterY, 0.0004]}>
          {/* Top vertical Ground (E) slot */}
          <mesh position={[0, 0.0072, 0]}>
            <boxGeometry args={[0.0024, 0.0076, 0.0009]} />
            <meshStandardMaterial color="#181c22" roughness={0.75} />
          </mesh>
          {/* Left & Right angled Neutral / Live blades (28 deg V-angle) */}
          {([-1, 1] as const).map((side) => (
            <group
              key={side}
              position={[side * 0.0072, -0.0032, 0]}
              rotation={[0, 0, -side * 0.49]}
            >
              <mesh>
                <boxGeometry args={[0.0024, 0.0074, 0.0009]} />
                <meshStandardMaterial color="#181c22" roughness={0.75} />
              </mesh>
              <mesh position={[0, 0, 0.00025]}>
                <boxGeometry args={[0.0011, 0.0052, 0.0006]} />
                <meshStandardMaterial color="#b98a4a" metalness={0.7} roughness={0.35} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

/**
 * Desktop / floor configurable Power Strip (`powerStrip`):
 * `1x3`..`2x4`, twoPin / threePin / combo5 sockets, optional switch & USB-A / Type-C ports.
 */
export function PowerStripModel({ item }: { item: SceneItem }) {
  const cfg = item.powerStrip ?? defaultPowerStripSettings();
  const { width, height, depth } = computePowerStripSize(cfg);
  const acSlots = computePowerStripSlots(cfg).filter((s) => s.kind === 'power');
  const usbPorts = computePowerStripUsbPorts(cfg);
  const { rows } = POWER_STRIP_LAYOUT_META[cfg.layout];
  const shellColor = item.color;
  const switchX = -width / 2 + 0.018;

  return (
    <group>
      {/* Main fire-retardant PC enclosure resting at y = 0, top face cleanly at height - 0.001 */}
      <RoundedBox
        args={[width, height - 0.001, depth]}
        radius={0.0055}
        smoothness={3}
        position={[0, (height - 0.001) / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={shellColor} roughness={0.38} metalness={0.05} />
      </RoundedBox>

      {/* Recessed matte top faceplate with exact boxGeometry so top sits strictly at y = height */}
      <mesh position={[0, height - 0.0008, 0]} receiveShadow>
        <boxGeometry args={[width - 0.014, 0.0016, depth - 0.014]} />
        <meshStandardMaterial color="#eef1f5" roughness={0.44} metalness={0.04} />
      </mesh>

      {/* Rubber anti-slip feet */}
      {([-1, 1] as const).map((sx) =>
        ([-1, 1] as const).map((sz) => (
          <mesh
            key={`${sx}-${sz}`}
            position={[sx * (width / 2 - 0.018), 0.0008, sz * (depth / 2 - 0.012)]}
          >
            <cylinderGeometry args={[0.0045, 0.005, 0.0016, 12]} />
            <meshStandardMaterial color="#1f242c" roughness={0.85} />
          </mesh>
        )),
      )}

      {/* Optional master rocker switch + indicator LED */}
      {cfg.masterSwitch && (
        <group position={[switchX, height + 0.0014, 0]}>
          <RoundedBox args={[0.014, 0.0036, 0.021]} radius={0.0015} smoothness={2} castShadow>
            <meshStandardMaterial color="#d4dae2" roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0.0018, 0.004]}>
            <boxGeometry args={[0.008, 0.0012, 0.003]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#38bdf8"
              emissiveIntensity={1.1}
              roughness={0.25}
            />
          </mesh>
        </group>
      )}

      {/* AC receptacles cleanly integrated into continuous top faceplate */}
      {acSlots.map((slot) => (
        <AcReceptacleSocket
          key={slot.id}
          outletType={cfg.outletType}
          position={[slot.x, height + 0.0002, slot.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}

      {/* Subtle separator line before USB charging bank */}
      {usbPorts.length > 0 && (
        <mesh position={[usbPorts[0].x - 0.013, height + 0.0004, 0]}>
          <boxGeometry args={[0.0012, 0.0008, rows === 2 ? depth - 0.024 : depth - 0.02]} />
          <meshStandardMaterial color="#cbd2db" roughness={0.5} />
        </mesh>
      )}

      {/* USB-A & Type-C fast charge ports */}
      {usbPorts.map((usb) => (
        <PortSocket
          key={usb.id}
          kind={usb.type}
          position={[usb.x, height + 0.0005, usb.z]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        />
      ))}

      {/* Left AC cord entry strain-relief boot */}
      <group position={[-width / 2 - 0.004, height * 0.48, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.0052, 0.0068, 0.014, 14]} />
          <meshStandardMaterial color="#252a33" roughness={0.62} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Wall-mounted (`mount: 'wall'`) 86-type slim socket OR Floor-mounted (`mount: 'floor'`) socket box.
 */
export function WallOutletModel({ item }: { item: SceneItem }) {
  const cfg = item.wallOutlet ?? defaultWallOutletSettings();
  const isFloor = cfg.mount === 'floor' || item.surface === 'floor';
  const { width, height, depth } = computeWallOutletSize(cfg);
  const acSlots = computeWallOutletSlots(cfg).filter((s) => s.kind === 'power');
  const usbPorts = computeWallOutletUsbPorts(cfg);

  if (isFloor) {
    return (
      <group>
        {/* Brushed aluminum flush floor box */}
        <RoundedBox
          args={[width, height - 0.001, depth]}
          radius={0.003}
          smoothness={2}
          position={[0, (height - 0.001) / 2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.68} />
        </RoundedBox>
        {/* Inner anodized bezel with exact boxGeometry strictly flush at y = height */}
        <mesh position={[0, height - 0.0008, 0]} receiveShadow>
          <boxGeometry args={[width - 0.014, 0.0016, depth - 0.014]} />
          <meshStandardMaterial color="#d8dde4" roughness={0.42} metalness={0.2} />
        </mesh>
        {/* Corner fastener hex bolts */}
        {([-1, 1] as const).map((sx) =>
          ([-1, 1] as const).map((sz) => (
            <mesh
              key={`${sx}-${sz}`}
              position={[sx * (width / 2 - 0.0055), height + 0.0003, sz * (depth / 2 - 0.0055)]}
            >
              <cylinderGeometry args={[0.0022, 0.0022, 0.0008, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.3} />
            </mesh>
          )),
        )}
        {acSlots.map((slot) => (
          <AcReceptacleSocket
            key={slot.id}
            outletType={cfg.outletType}
            position={[slot.x, height + 0.0002, slot.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        ))}
        {usbPorts.map((usb) => (
          <PortSocket
            key={usb.id}
            kind={usb.type}
            position={[usb.x, height + 0.0005, usb.z]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          />
        ))}
      </group>
    );
  }

  // Wall 86-type slim socket (`y ∈ [0, height]`, facing +Z)
  return (
    <group>
      {/* Back mounting frame */}
      <RoundedBox
        args={[width, height, depth * 0.72]}
        radius={0.0028}
        smoothness={2}
        position={[0, height / 2, -depth * 0.14]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#cbd2dc" roughness={0.45} metalness={0.08} />
      </RoundedBox>
      {/* Front frameless faceplate */}
      <RoundedBox
        args={[width - 0.004, height - 0.004, depth * 0.56]}
        radius={0.003}
        smoothness={3}
        position={[0, height / 2, depth * 0.22]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={item.color} roughness={0.32} metalness={0.04} />
      </RoundedBox>
      {/* Warm micro power LED indicator */}
      <mesh position={[-width / 2 + 0.014, height - 0.014, depth * 0.5 + 0.0005]}>
        <circleGeometry args={[0.0014, 12]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={0.85}
          roughness={0.3}
        />
      </mesh>
      {acSlots.map((slot) => (
        <AcReceptacleSocket
          key={slot.id}
          outletType={cfg.outletType}
          position={[slot.x, slot.y, depth * 0.5 + 0.0002]}
          rotation={[0, 0, 0]}
        />
      ))}
      {usbPorts.map((usb) => (
        <PortSocket
          key={usb.id}
          kind={usb.type}
          position={[usb.x, usb.y, depth * 0.5 + 0.0006]}
          rotation={[0, 0, 0]}
        />
      ))}
    </group>
  );
}

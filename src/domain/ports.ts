import { Euler, Quaternion, Vector3 } from 'three';
import {
  deskBackWallBounds,
  PEGBOARD_WALL_DEFAULT_Y,
  PEGBOARD_WALL_STANDOFF,
  WALL_DEFAULT_GAP,
} from './desk';
import {
  DEFAULT_LID_ANGLE,
  DEFAULT_TRAY_ELEVATION,
  DEFAULT_TRAY_TILT_DEG,
  findArmForTrayLaptop,
  isMonitorMountedOnArm,
} from './laptop';
import { monitorParts, monitorPose } from './monitor';
import { PEGBOARD } from './pegboard';
import { itemWorldY } from './placement';
import {
  computePowerStripSlots,
  computeWallOutletSlots,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  WALL_OUTLET_DEFAULT_Y,
} from './power';
import { defaultSpeakerSettings, speakerPresetById } from './speaker';
import type { BuiltinKind, Desk, SceneItem } from './project';

export type PortSocketKind =
  | 'hdmi'
  | 'dp'
  | 'usba'
  | 'usbc'
  | 'tf'
  | 'sd'
  | 'magsafe3'
  | 'rj45'
  | 'powerAc'
  | 'iecC14'
  | 'rca'
  | 'trs35'
  | 'trs635'
  | 'optical'
  | 'bindingPost';

/** Official mechanical receptacle opening dimensions (meters) from connector standards. */
export const PORT_SOCKET_SPECS: Record<
  PortSocketKind,
  { width: number; height: number; label: string }
> = {
  hdmi: { width: 0.014, height: 0.0045, label: 'HDMI Type A (14.0 × 4.5 mm)' },
  dp: { width: 0.0161, height: 0.0074, label: 'DisplayPort (16.1 × 7.4 mm)' },
  usba: { width: 0.0131, height: 0.0057, label: 'USB Type-A (13.1 × 5.7 mm)' },
  usbc: { width: 0.0086, height: 0.0028, label: 'USB Type-C (8.6 × 2.8 mm)' },
  tf: { width: 0.0115, height: 0.0014, label: 'TF / microSD (11.5 × 1.4 mm)' },
  sd: { width: 0.0246, height: 0.0023, label: 'SD / SDXC (24.6 × 2.3 mm)' },
  magsafe3: { width: 0.0146, height: 0.0038, label: 'Apple MagSafe 3 (14.6 × 3.8 mm)' },
  rj45: { width: 0.016, height: 0.0132, label: 'RJ45 屏蔽网口 (16.0 × 13.2 mm)' },
  powerAc: { width: 0.0155, height: 0.0088, label: 'AC 8 字尾电源口 (15.5 × 8.8 mm)' },
  iecC14: { width: 0.0275, height: 0.0195, label: 'IEC C14 三插电源口 (27.5 × 19.5 mm)' },
  rca: { width: 0.021, height: 0.0095, label: 'RCA 双莲花口 (L/R 同轴 21.0 × 9.5 mm)' },
  trs35: { width: 0.006, height: 0.006, label: '3.5 mm AUX 立体声口 (Ø 6.0 mm 螺母外圈)' },
  trs635: { width: 0.0115, height: 0.0115, label: '6.35 mm TRS 平衡母座 (Ø 11.5 mm)' },
  optical: { width: 0.0085, height: 0.0085, label: 'TOSLINK 光纤方口 (8.5 × 8.5 mm)' },
  bindingPost: { width: 0.028, height: 0.012, label: '4 mm 香蕉插/裸线音箱接线柱 (19 mm 节距)' },
};

export type CableKind =
  | 'dp'
  | 'hdmi'
  | 'usbc'
  | 'magsafe'
  | 'rj45'
  | 'power'
  | 'speakerWire'
  | 'aux35'
  | 'rca'
  | 'optical'
  | 'trs635';

export type PortSpec = {
  id: string;
  label: string;
  kind: CableKind;
  /** Offset in the device's local space (or screen sub-assembly space for monitor). */
  localPos: [number, number, number];
  /** Outward direction along which a plug enters/exits. */
  localDir: [number, number, number];
};

export function devicePorts(
  item: Pick<
    SceneItem,
    'kind' | 'size' | 'monitor' | 'powerStrip' | 'wallOutlet' | 'speaker' | 'surface'
  >,
): PortSpec[] {
  const { width: w, height: h, depth: d } = item.size;
  if (item.kind === 'monitor') {
    const isStudio = item.monitor?.model === 'studioDisplay';
    const { panelHeight } = monitorParts(item.size, item.monitor?.model);
    if (isStudio) {
      const y = -panelHeight * 0.25;
      const z = -0.0175;
      return [
        {
          id: 'usbc',
          label: '雷雳 3 / USB-C (96W)',
          kind: 'usbc',
          localPos: [-0.074, y, z],
          localDir: [0, -0.15, -1],
        },
        {
          id: 'usbc2',
          label: 'USB-C 下行口 1',
          kind: 'usbc',
          localPos: [-0.09, y, z],
          localDir: [0, -0.15, -1],
        },
        {
          id: 'usbc3',
          label: 'USB-C 下行口 2',
          kind: 'usbc',
          localPos: [-0.106, y, z],
          localDir: [0, -0.15, -1],
        },
        {
          id: 'power',
          label: '编织电源线 (AC)',
          kind: 'power',
          localPos: [0.082, y, z],
          localDir: [0, -0.25, -1],
        },
      ];
    }
    const y = -0.0696;
    const z = -0.0165;
    return [
      {
        id: 'dp',
        label: 'DisplayPort 1.4 输入',
        kind: 'dp',
        localPos: [0.041, y, z],
        localDir: [0, -1, 0],
      },
      {
        id: 'hdmi',
        label: 'HDMI 2.1',
        kind: 'hdmi',
        localPos: [0.062, y, z],
        localDir: [0, -1, 0],
      },
      {
        id: 'usbc',
        label: 'Thunderbolt 4 (140W)',
        kind: 'usbc',
        localPos: [-0.017, y, z],
        localDir: [0, -1, 0],
      },
      {
        id: 'audioOut',
        label: '3.5mm 音频输出',
        kind: 'aux35',
        localPos: [-0.075, y, z],
        localDir: [0, -1, 0],
      },
      {
        id: 'power',
        label: 'AC 电源输入',
        kind: 'power',
        localPos: [0.1, y, z],
        localDir: [0, -1, 0],
      },
    ];
  }
  if (item.kind === 'gamingLaptop') {
    const y = Math.max(0.006, h * 0.45);
    return [
      {
        id: 'hdmi',
        label: 'HDMI',
        kind: 'hdmi',
        localPos: [-w * 0.24, y, -d / 2],
        localDir: [0, 0, -1],
      },
      {
        id: 'dp',
        label: 'Mini DP / DP',
        kind: 'dp',
        localPos: [-w * 0.1, y, -d / 2],
        localDir: [0, 0, -1],
      },
      {
        id: 'usbc',
        label: 'USB-C',
        kind: 'usbc',
        localPos: [w * 0.03, y, -d / 2],
        localDir: [0, 0, -1],
      },
      {
        id: 'rj45',
        label: 'RJ45 网口',
        kind: 'rj45',
        localPos: [w * 0.15, y, -d / 2],
        localDir: [0, 0, -1],
      },
      {
        id: 'power',
        label: '电源口',
        kind: 'power',
        localPos: [w * 0.28, y, -d / 2],
        localDir: [0, 0, -1],
      },
      {
        id: 'audio',
        label: '3.5mm 音频口',
        kind: 'aux35',
        localPos: [-w / 2, y, d * 0.08],
        localDir: [-1, 0, 0],
      },
    ];
  }
  if (item.kind === 'macbook') {
    const y = Math.max(0.005, h * 0.45);
    return [
      {
        id: 'usbc1',
        label: '雷雳 / USB-C 1',
        kind: 'usbc',
        localPos: [-w / 2, y, -d * 0.17],
        localDir: [-1, 0, 0],
      },
      {
        id: 'usbc2',
        label: '雷雳 / USB-C 2',
        kind: 'usbc',
        localPos: [-w / 2, y, -d * 0.06],
        localDir: [-1, 0, 0],
      },
      {
        id: 'audio',
        label: '3.5mm 音频口',
        kind: 'aux35',
        localPos: [-w / 2, y, d * 0.06],
        localDir: [-1, 0, 0],
      },
      {
        id: 'hdmi',
        label: 'HDMI',
        kind: 'hdmi',
        localPos: [w / 2, y, -d * 0.16],
        localDir: [1, 0, 0],
      },
      {
        id: 'power',
        label: 'MagSafe 3 电源',
        kind: 'magsafe',
        localPos: [-w / 2, y, -d * 0.3],
        localDir: [-1, 0, 0],
      },
    ];
  }
  if (item.kind === 'macStudio') {
    const pedestalH = 0.0076;
    const bodyH = Math.max(0.01, h - pedestalH);
    const y = pedestalH + bodyH * 0.195;
    const z = -d / 2;
    return [
      {
        id: 'audio',
        label: '3.5mm 音频口',
        kind: 'aux35',
        localPos: [-w * 0.34, y - 0.0014, z],
        localDir: [0, 0, -1],
      },
      {
        id: 'hdmi',
        label: 'HDMI 2.1',
        kind: 'hdmi',
        localPos: [-w * 0.255, y - 0.0014, z],
        localDir: [0, 0, -1],
      },
      {
        id: 'rj45',
        label: '10Gb RJ45 网口',
        kind: 'rj45',
        localPos: [w * 0.122, y, z],
        localDir: [0, 0, -1],
      },
      {
        id: 'usbc1',
        label: '雷雳 5 / USB-C 1',
        kind: 'usbc',
        localPos: [w * 0.345, y, z],
        localDir: [0, 0, -1],
      },
      {
        id: 'usbc2',
        label: '雷雳 5 / USB-C 2',
        kind: 'usbc',
        localPos: [w * 0.295, y, z],
        localDir: [0, 0, -1],
      },
      {
        id: 'power',
        label: 'AC 电源口',
        kind: 'power',
        localPos: [w * 0.002, y, z],
        localDir: [0, 0, -1],
      },
    ];
  }
  if (item.kind === 'macMini') {
    const isCompactMini = w < 0.16;
    if (isCompactMini) {
      const pedestalH = 0.007;
      const bodyH = Math.max(0.01, h - pedestalH);
      const y = pedestalH + bodyH * 0.38;
      const zRear = -d / 2;
      const yFront = pedestalH + bodyH * 0.42;
      return [
        {
          id: 'audio',
          label: '3.5mm 耳机孔（前置）',
          kind: 'aux35',
          localPos: [w * 0.295, yFront, d / 2],
          localDir: [0, 0, 1],
        },
        {
          id: 'power',
          label: 'AC 电源口',
          kind: 'power',
          localPos: [w * 0.258, y, zRear],
          localDir: [0, 0, -1],
        },
        {
          id: 'rj45',
          label: 'RJ45 网口',
          kind: 'rj45',
          localPos: [w * 0.082, y, zRear],
          localDir: [0, 0, -1],
        },
        {
          id: 'hdmi',
          label: 'HDMI',
          kind: 'hdmi',
          localPos: [-w * 0.068, y - 0.0005, zRear],
          localDir: [0, 0, -1],
        },
        {
          id: 'usbc1',
          label: '雷雳 / USB-C 1',
          kind: 'usbc',
          localPos: [-w * 0.192, y, zRear],
          localDir: [0, 0, -1],
        },
        {
          id: 'usbc2',
          label: '雷雳 / USB-C 2',
          kind: 'usbc',
          localPos: [-w * 0.258, y, zRear],
          localDir: [0, 0, -1],
        },
      ];
    }
    const pedestalH = 0.0024;
    const bodyH = Math.max(0.01, h - pedestalH);
    const y = pedestalH + bodyH * 0.44;
    const zRear = -d / 2;
    return [
      {
        id: 'power',
        label: 'AC 电源口',
        kind: 'power',
        localPos: [-w * 0.31, y, zRear],
        localDir: [0, 0, -1],
      },
      {
        id: 'rj45',
        label: 'RJ45 网口',
        kind: 'rj45',
        localPos: [-w * 0.18, y, zRear],
        localDir: [0, 0, -1],
      },
      {
        id: 'hdmi',
        label: 'HDMI',
        kind: 'hdmi',
        localPos: [-w * 0.06, y, zRear],
        localDir: [0, 0, -1],
      },
      {
        id: 'usbc1',
        label: '雷雳 / USB-C 1',
        kind: 'usbc',
        localPos: [w * 0.06, y, zRear],
        localDir: [0, 0, -1],
      },
      {
        id: 'usbc2',
        label: '雷雳 / USB-C 2',
        kind: 'usbc',
        localPos: [w * 0.145, y, zRear],
        localDir: [0, 0, -1],
      },
      {
        id: 'audio',
        label: '3.5mm 音频口',
        kind: 'aux35',
        localPos: [w * 0.34, y, zRear],
        localDir: [0, 0, -1],
      },
    ];
  }
  if (item.kind === 'speaker') {
    const cfg = item.speaker ?? defaultSpeakerSettings('active');
    const spec = speakerPresetById(cfg.model);
    if (cfg.role === 'passive') {
      return [
        {
          id: 'speakerIn',
          label: '副箱音箱接线柱 (±输入)',
          kind: 'speakerWire',
          localPos: [0, h * 0.25, -d / 2],
          localDir: [0, 0, -1],
        },
      ];
    }
    const ports: PortSpec[] = [];
    if (cfg.role === 'active') {
      ports.push({
        id: 'speakerOut',
        label: '主副箱输出 (±接线柱)',
        kind: 'speakerWire',
        localPos: [w * 0.22, h * 0.22, -d / 2],
        localDir: [0, 0, -1],
      });
    }
    if (spec.hasUsbC) {
      ports.push({
        id: 'usbc',
        label: 'USB-C DAC 数字音频输入',
        kind: 'usbc',
        localPos: [w * 0.22, h * 0.44, -d / 2],
        localDir: [0, 0, -1],
      });
    }
    if (spec.hasAux35) {
      ports.push({
        id: 'aux35',
        label: spec.auxOnFront ? '前置 3.5mm AUX 输入' : '3.5mm AUX 音频输入',
        kind: 'aux35',
        localPos: spec.auxOnFront ? [-w * 0.34, h * 0.095, d / 2] : [w * 0.04, h * 0.36, -d / 2],
        localDir: spec.auxOnFront ? [0, 0, 1] : [0, 0, -1],
      });
    }
    if (spec.hasRca) {
      ports.push({
        id: 'rca',
        label: 'RCA 红白莲花输入 (L/R)',
        kind: 'rca',
        localPos: [-w * 0.2, h * 0.36, -d / 2],
        localDir: [0, 0, -1],
      });
    }
    if (spec.hasOptical) {
      ports.push({
        id: 'optical',
        label: '光纤数字输入 (TOSLINK)',
        kind: 'optical',
        localPos: [-w * 0.02, h * 0.47, -d / 2],
        localDir: [0, 0, -1],
      });
    }
    if (spec.hasTrs635) {
      ports.push({
        id: 'trs635',
        label: '6.35mm TRS 平衡输入 (L/R)',
        kind: 'trs635',
        localPos: [w * 0.16, h * 0.39, -d / 2],
        localDir: [0, 0, -1],
      });
    }
    ports.push({
      id: 'power',
      label: cfg.model === 'audioengineA2' ? 'DC 24V 电源输入' : 'AC 电源输入',
      kind: 'power',
      localPos: [-w * 0.22, h * 0.14, -d / 2],
      localDir: [0, 0, -1],
    });
    return ports;
  }
  if (item.kind === 'powerStrip') {
    const cfg = item.powerStrip ?? defaultPowerStripSettings();
    const slotPorts = computePowerStripSlots(cfg).map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind as CableKind,
      localPos: [s.x, s.y, s.z] as [number, number, number],
      localDir: [0, 1, 0] as [number, number, number],
    }));
    return [
      ...slotPorts,
      {
        id: 'ac-in',
        label: '插排总电源线',
        kind: 'power',
        localPos: [-w / 2, h * 0.48, 0],
        localDir: [-1, 0, 0],
      },
    ];
  }
  if (item.kind === 'wallOutlet') {
    const cfg = item.wallOutlet ?? defaultWallOutletSettings();
    const isFloor = cfg.mount === 'floor' || item.surface === 'floor';
    return computeWallOutletSlots(cfg).map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind as CableKind,
      localPos: [s.x, s.y, s.z] as [number, number, number],
      localDir: isFloor
        ? ([0, 1, 0] as [number, number, number])
        : ([0, 0, 1] as [number, number, number]),
    }));
  }
  return [];
}

export function isPortKind(kind: SceneItem['kind']): kind is BuiltinKind {
  return (
    kind === 'monitor' ||
    kind === 'speaker' ||
    kind === 'gamingLaptop' ||
    kind === 'macbook' ||
    kind === 'macMini' ||
    kind === 'macStudio' ||
    kind === 'powerStrip' ||
    kind === 'wallOutlet'
  );
}

/**
 * Computes world-space position & rotation of an item (accounting for shelf surface or bound laptop stand).
 */
export function resolveItemTransform(
  item: SceneItem,
  desk: Desk,
  items: SceneItem[],
): { position: [number, number, number]; quaternion: Quaternion } {
  const baseYaw = (item.rotation * Math.PI) / 180;

  if (item.kind === 'gamingLaptop' || item.kind === 'macbook') {
    const stand = items.find(
      (candidate) =>
        candidate.kind === 'laptopStand' && candidate.laptopStand?.laptopId === item.id,
    );
    if (stand?.laptopStand) {
      const standBaseY = itemWorldY(desk, stand, items);
      const standYaw = (stand.rotation * Math.PI) / 180;
      const q = new Quaternion();

      if (stand.laptopStand.mode === 'vertical') {
        // Vertical dock: laptop closed, standing upright on its rear edge inside slot.
        const slotY = standBaseY + 0.018 + item.size.depth / 2;
        const rot = new Euler(Math.PI / 2, 0, 0, 'YXZ');
        q.setFromAxisAngle(new Vector3(0, 1, 0), standYaw).multiply(
          new Quaternion().setFromEuler(rot),
        );
        return {
          position: [stand.x, slotY, stand.z],
          quaternion: q,
        };
      }

      // Tilted stand: laptop base rests flush on the top silicone plane (local y = 0 of cradle at elevation).
      const tiltRad = (stand.laptopStand.tiltDeg * Math.PI) / 180;
      const centerY = standBaseY + stand.laptopStand.elevation;
      q.setFromAxisAngle(new Vector3(0, 1, 0), standYaw).multiply(
        new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tiltRad),
      );
      return {
        position: [stand.x, centerY, stand.z],
        quaternion: q,
      };
    }

    const trayArm = findArmForTrayLaptop(item.id, items);
    if (trayArm?.monitorArm) {
      const elevation = trayArm.monitorArm.trayElevation ?? DEFAULT_TRAY_ELEVATION;
      const tiltRad = ((trayArm.monitorArm.trayTiltDeg ?? DEFAULT_TRAY_TILT_DEG) * Math.PI) / 180;
      const centerY = desk.height + elevation + item.size.depth * 0.5 * Math.sin(tiltRad) * 0.35;
      const q = new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), baseYaw)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tiltRad));
      return {
        position: [item.x, centerY, item.z],
        quaternion: q,
      };
    }
  }

  if (item.kind === 'pegboard' && item.surface === 'wall') {
    const wall = deskBackWallBounds(desk);
    const frontZ = wall ? wall.frontZ : -desk.depth / 2 - WALL_DEFAULT_GAP;
    return {
      position: [
        item.x,
        desk.height + (item.wallY ?? PEGBOARD_WALL_DEFAULT_Y),
        frontZ + PEGBOARD_WALL_STANDOFF + PEGBOARD.thickness / 2,
      ],
      quaternion: new Quaternion(),
    };
  }

  if (
    item.kind === 'wallOutlet' &&
    item.surface !== 'floor' &&
    (item.wallOutlet?.mount ?? 'wall') === 'wall'
  ) {
    const wall = deskBackWallBounds(desk);
    const frontZ = wall ? wall.frontZ : -desk.depth / 2 - WALL_DEFAULT_GAP;
    return {
      position: [item.x, item.wallY ?? WALL_OUTLET_DEFAULT_Y, frontZ + item.size.depth / 2],
      quaternion: new Quaternion(),
    };
  }

  return {
    position: [item.x, itemWorldY(desk, item, items), item.z],
    quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), baseYaw),
  };
}

export function effectiveLidAngle(item: SceneItem, items: SceneItem[]): number {
  const stand = items.find(
    (candidate) => candidate.kind === 'laptopStand' && candidate.laptopStand?.laptopId === item.id,
  );
  if (stand?.laptopStand?.mode === 'vertical') return 0;
  return item.lidAngle ?? DEFAULT_LID_ANGLE;
}

export function devicePortWorld(
  item: SceneItem,
  portId: string,
  desk: Desk,
  items: SceneItem[],
): { position: Vector3; direction: Vector3 } | null {
  const spec = devicePorts(item).find((p) => p.id === portId);
  if (!spec) return null;

  const { position, quaternion } = resolveItemTransform(item, desk, items);
  const worldPos = new Vector3(...spec.localPos);
  const worldDir = new Vector3(...spec.localDir).normalize();

  if (item.kind === 'monitor') {
    const { panelHeight } = monitorParts(item.size, item.monitor?.model);
    const pose = monitorPose(item.size, {
      ...item,
      hasMonitorArm: isMonitorMountedOnArm(item.id, items),
    });
    const panelY = pose.pivotY + panelHeight / 2;
    const screenQuat = new Quaternion().setFromEuler(
      new Euler((pose.pitchDeg * Math.PI) / 180, 0, (pose.rollDeg * Math.PI) / 180, 'XYZ'),
    );
    worldPos.applyQuaternion(screenQuat).add(new Vector3(0, panelY, -0.02 + pose.pivotZOffset));
    worldDir.applyQuaternion(screenQuat);
  }

  worldPos.applyQuaternion(quaternion).add(new Vector3(...position));
  worldDir.applyQuaternion(quaternion).normalize();
  return { position: worldPos, direction: worldDir };
}

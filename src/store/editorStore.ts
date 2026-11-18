import { create } from 'zustand';
import { cableMeta, resolveCablePlugEnds, type Cable, type CableWaypoint } from '../domain/cable';
import type { PlugSpecKind } from '../domain/power';
import { defaultProject, makeItem } from '../domain/catalog';
import {
  checkMonitorArmCollision,
  constrainMonitorPose,
  resolveItemPositionWithCollisions,
} from '../domain/collision';
import { WALL_DEFAULT_COLOR, WALL_DEFAULT_GAP, WALL_DEFAULT_HEIGHT } from '../domain/desk';
import { devicePorts, type CableKind } from '../domain/ports';
import {
  armMountedLaptopIds,
  armMountedMonitorIds,
  armPrimaryLaptopId,
  armPrimaryMonitorId,
  armSecondaryLaptopId,
  armSecondaryMonitorId,
  findArmForTrayLaptop,
  isMonitorMountedOnArm,
} from '../domain/laptop';
import { EditorError, MAX_SCREEN_LAMPS } from '../domain/screenLamp';
import {
  constrainTargetToMonitorArm,
  findArmBranchForItem,
  suggestedArmClampX,
  type DragPreviewState,
} from '../domain/monitorArm';
import {
  projectSchema,
  uid,
  type AssetMeta,
  type BuiltinKind,
  type Project,
  type SceneItem,
} from '../domain/project';

export type WiringDraft = {
  itemId: string;
  portId: string;
  kind: CableKind;
};

export type WiringPreset = {
  kind: CableKind;
  color: string;
  lengthM: number;
  outletPlugType?: PlugSpecKind;
  devicePlugType?: PlugSpecKind;
  label?: string;
};

type State = {
  project: Project;
  selected: string | null;
  selectedCableId: string | null;
  selectedWaypointIdx: number | null;
  wiringMode: boolean;
  wiringDraft: WiringDraft | null;
  wiringPreset: WiringPreset | null;
  collisionEnabled: boolean;
  collisionNotice: string | null;
  dragPreview: DragPreviewState | null;
  setDragPreview: (preview: DragPreviewState | null) => void;
  setCollisionEnabled: (enabled: boolean) => void;
  setCollisionNotice: (note: string | null) => void;
  setWiringMode: (on: boolean, preset?: WiringPreset | null) => void;
  pickWiringPort: (itemId: string, portId: string, kind: CableKind) => void;
  dropWiringDraftToFloor: (drop?: 'auto' | 'grommet' | 'backEdge') => void;
  selectCable: (id: string | null, waypointIdx?: number | null) => void;
  updateCableWaypoint: (
    cableId: string,
    idx: number,
    point: CableWaypoint,
    fallback: CableWaypoint[],
  ) => void;
  insertCableWaypoint: (
    cableId: string,
    afterIdx: number,
    point: CableWaypoint,
    fallback: CableWaypoint[],
  ) => void;
  removeCableWaypoint: (cableId: string, idx: number, fallback: CableWaypoint[]) => void;
  resetCableWaypoints: (cableId: string) => void;
  lampGuides: boolean;
  toggleLampGuides: () => void;
  past: Project[];
  future: Project[];
  blobs: Map<string, Blob>;
  select: (id: string | null) => void;
  commit: (update: (p: Project) => void) => void;
  beginGesture: () => void;
  endGesture: () => void;
  add: (kind: BuiltinKind) => void;
  addDualMonitorArm: () => void;
  attachLaptopTray: () => void;
  updateItem: (id: string, patch: Partial<SceneItem>) => void;
  addCable: (cable: Omit<Cable, 'id'>) => string;
  updateCable: (id: string, patch: Partial<Cable>) => void;
  removeCable: (id: string) => void;
  remove: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  replace: (p: Project, blobs: Map<string, Blob>) => void;
  addImported: (meta: AssetMeta, blob: Blob, size: SceneItem['size']) => void;
};

const withAssets = (p: Project, current: Project): Project => ({
  ...p,
  assets: [...new Map([...current.assets, ...p.assets].map((a) => [a.id, a])).values()],
});

// 持续手势（如滑块拖动）期间的基准快照：期间所有 commit 只做实时预览，
// 不记入撤销历史；endGesture 在结束时把「基准 → 最终」记为一步。
let gestureBase: Project | null = null;

export const useEditor = create<State>((set, get) => ({
  project: defaultProject(),
  selected: null,
  selectedCableId: null,
  selectedWaypointIdx: null,
  wiringMode: false,
  wiringDraft: null,
  wiringPreset: null,
  collisionEnabled: true,
  collisionNotice: null,
  dragPreview: null,
  setDragPreview: (preview) => set({ dragPreview: preview }),
  setCollisionEnabled: (enabled) => set({ collisionEnabled: enabled, collisionNotice: null }),
  setCollisionNotice: (note) => set({ collisionNotice: note }),
  setWiringMode: (on, preset = null) =>
    set({
      wiringMode: on,
      wiringDraft: null,
      wiringPreset: on ? preset : null,
    }),
  selectCable: (id, waypointIdx = null) => {
    if (get().selectedCableId !== id) get().endGesture();
    set({ selectedCableId: id, selectedWaypointIdx: waypointIdx });
  },
  pickWiringPort: (itemId, portId, kind) => {
    const s = get();
    const draft = s.wiringDraft;
    const preset = s.wiringPreset;
    if (!draft) {
      set({ wiringDraft: { itemId, portId, kind } });
      return;
    }
    if (draft.itemId === itemId && draft.portId === portId) {
      set({ wiringDraft: null });
      return;
    }
    if (draft.itemId === itemId) {
      set({ wiringDraft: { itemId, portId, kind } });
      return;
    }
    const resolvedKind: CableKind = preset
      ? preset.kind
      : draft.kind === kind
        ? draft.kind
        : (draft.kind === 'rca' && kind === 'aux35') || (draft.kind === 'aux35' && kind === 'rca')
          ? 'rca'
          : draft.kind === 'usbc' || kind === 'usbc'
            ? 'usbc'
            : draft.kind === 'magsafe' || kind === 'magsafe'
              ? 'magsafe'
              : draft.kind;
    const spec = cableMeta[resolvedKind];
    const fromItem = s.project.items.find((i) => i.id === draft.itemId);
    const targetItem = s.project.items.find((i) => i.id === itemId);
    const plugEnds = resolveCablePlugEnds({
      fromKind: fromItem?.kind,
      fromPortId: draft.portId,
      toKind: targetItem?.kind,
      toPortId: portId,
      cableKind: resolvedKind,
      outletPlugType: preset?.outletPlugType,
      devicePlugType: preset?.devicePlugType,
    });
    const cableId = s.addCable({
      kind: resolvedKind,
      from: { type: 'device', itemId: draft.itemId, portId: draft.portId },
      to: { type: 'device', itemId, portId },
      routeViaArm: true,
      viaStandSlot: true,
      color: preset?.color ?? spec.color,
      lengthM: preset?.lengthM ?? spec.defaultLengthM,
      lengthIncludesConnectors: true,
      ...plugEnds,
    });
    set({
      wiringDraft: null,
      wiringMode: false,
      wiringPreset: null,
      selectedCableId: cableId,
      selectedWaypointIdx: null,
    });
  },
  dropWiringDraftToFloor: (drop = 'auto') => {
    const s = get();
    const draft = s.wiringDraft;
    if (!draft) return;
    const preset = s.wiringPreset;
    const resolvedKind = preset ? preset.kind : draft.kind;
    const spec = cableMeta[resolvedKind];
    const cableId = s.addCable({
      kind: resolvedKind,
      from: { type: 'device', itemId: draft.itemId, portId: draft.portId },
      to: { type: 'floor', drop },
      drop,
      routeViaArm: true,
      viaStandSlot: true,
      color: preset?.color ?? spec.color,
      lengthM: preset?.lengthM ?? spec.defaultLengthM,
      lengthIncludesConnectors: true,
      ...(preset?.devicePlugType ? { fromPlugType: preset.devicePlugType } : {}),
      ...(preset?.outletPlugType ? { toPlugType: preset.outletPlugType } : {}),
    });
    set({
      wiringDraft: null,
      wiringMode: false,
      wiringPreset: null,
      selectedCableId: cableId,
      selectedWaypointIdx: null,
    });
  },
  updateCableWaypoint: (cableId, idx, point, fallback) => {
    get().commit((p) => {
      if (!p.cables) return;
      const c = p.cables.find((item) => item.id === cableId);
      if (!c) return;
      const list = (c.waypoints?.length ? c.waypoints : fallback).map((w) => ({ ...w }));
      if (idx < 0 || idx >= list.length) return;
      list[idx] = {
        x: Math.max(-5, Math.min(5, Math.round(point.x * 1000) / 1000)),
        y: Math.max(0.004, Math.min(3, Math.round(point.y * 1000) / 1000)),
        z: Math.max(-5, Math.min(5, Math.round(point.z * 1000) / 1000)),
      };
      c.waypoints = list;
    });
  },
  insertCableWaypoint: (cableId, afterIdx, point, fallback) => {
    get().endGesture();
    let insertedIdx = 0;
    get().commit((p) => {
      if (!p.cables) return;
      const c = p.cables.find((item) => item.id === cableId);
      if (!c) return;
      const list = (c.waypoints?.length ? c.waypoints : fallback).map((w) => ({ ...w }));
      const pos = Math.max(0, Math.min(list.length, afterIdx + 1));
      list.splice(pos, 0, {
        x: Math.max(-5, Math.min(5, Math.round(point.x * 1000) / 1000)),
        y: Math.max(0.004, Math.min(3, Math.round(point.y * 1000) / 1000)),
        z: Math.max(-5, Math.min(5, Math.round(point.z * 1000) / 1000)),
      });
      c.waypoints = list;
      insertedIdx = pos;
    });
    set({ selectedCableId: cableId, selectedWaypointIdx: insertedIdx });
  },
  removeCableWaypoint: (cableId, idx, fallback) => {
    get().endGesture();
    get().commit((p) => {
      if (!p.cables) return;
      const c = p.cables.find((item) => item.id === cableId);
      if (!c) return;
      const list = (c.waypoints?.length ? c.waypoints : fallback).map((w) => ({ ...w }));
      if (list.length <= 1) {
        delete c.waypoints;
        return;
      }
      list.splice(idx, 1);
      c.waypoints = list;
    });
    set({ selectedWaypointIdx: null });
  },
  resetCableWaypoints: (cableId) => {
    get().endGesture();
    get().commit((p) => {
      const c = p.cables?.find((item) => item.id === cableId);
      if (c) delete c.waypoints;
    });
    set({ selectedWaypointIdx: null });
  },
  lampGuides: false,
  toggleLampGuides: () => set((s) => ({ lampGuides: !s.lampGuides })),
  past: [],
  future: [],
  blobs: new Map(),
  select: (id) => {
    if (get().selected !== id) get().endGesture();
    set({ selected: id, selectedCableId: null, selectedWaypointIdx: null });
  },
  commit: (update) => {
    const s = get(),
      next = structuredClone(s.project);
    update(next);
    const valid = projectSchema.parse(next);
    if (JSON.stringify(valid) === JSON.stringify(s.project)) return;
    if (gestureBase) {
      set({ project: valid, dragPreview: null });
      return;
    }
    set({ project: valid, past: [...s.past, s.project].slice(-50), future: [], dragPreview: null });
  },
  beginGesture: () => {
    if (!gestureBase) gestureBase = get().project;
  },
  endGesture: () => {
    const s = get();
    if (!gestureBase) return;
    const base = gestureBase;
    gestureBase = null;
    if (JSON.stringify(s.project) === JSON.stringify(base)) return;
    set({ past: [...s.past, base].slice(-50), future: [] });
  },
  add: (kind) => {
    const s = get();
    let hostId: string | undefined;
    if (kind === 'screenLamp') {
      const lamps = s.project.items.filter((i) => i.kind === 'screenLamp');
      if (lamps.length >= MAX_SCREEN_LAMPS)
        throw new EditorError('场景最多支持两盏屏幕挂灯，请先移除一盏。');
      const free = s.project.items.filter(
        (i) => i.kind === 'monitor' && !lamps.some((l) => l.lamp?.monitorId === i.id),
      );
      hostId = (free.find((i) => i.id === s.selected) ?? free[0])?.id;
      if (!hostId)
        throw new EditorError('没有可安装的显示器。请添加内置显示器；每台最多安装一盏挂灯。');
    } else if (kind === 'monitorArm') {
      const freeMonitors = s.project.items.filter(
        (i) => i.kind === 'monitor' && !isMonitorMountedOnArm(i.id, s.project.items),
      );
      const freeLaptops = s.project.items.filter(
        (i) =>
          (i.kind === 'gamingLaptop' || i.kind === 'macbook') &&
          !s.project.items.some((st) => st.laptopStand?.laptopId === i.id) &&
          !findArmForTrayLaptop(i.id, s.project.items),
      );
      const pickedMonitor = (freeMonitors.find((i) => i.id === s.selected) ?? freeMonitors[0])?.id;
      if (pickedMonitor) {
        hostId = pickedMonitor;
      } else {
        const pickedLaptop = (freeLaptops.find((i) => i.id === s.selected) ?? freeLaptops[0])?.id;
        if (!pickedLaptop) {
          throw new EditorError(
            '没有可挂载的显示器或笔记本。请先添加设备；每台显示器或笔记本只能挂载一条支臂。',
          );
        }
        const trayArm = makeItem('monitorArm', pickedLaptop);
        const laptopItem = s.project.items.find((i) => i.id === pickedLaptop);
        const initClampX = suggestedArmClampX(
          laptopItem ? [laptopItem] : [],
          'center',
          s.project.desk,
        );
        trayArm.monitorArm = {
          clampSide: 'center',
          clampX: initClampX,
          cableClip: true,
          primaryKind: 'laptopTray',
          primaryLaptopId: pickedLaptop,
        };
        s.endGesture();
        get().commit((p) => {
          p.items.push(trayArm);
        });
        set({ selected: trayArm.id });
        return;
      }
    } else if (kind === 'laptopStand') {
      const stands = s.project.items.filter((i) => i.kind === 'laptopStand');
      const freeLaptops = s.project.items.filter(
        (i) =>
          (i.kind === 'gamingLaptop' || i.kind === 'macbook') &&
          !stands.some((st) => st.laptopStand?.laptopId === i.id) &&
          !findArmForTrayLaptop(i.id, s.project.items),
      );
      hostId = (freeLaptops.find((i) => i.id === s.selected) ?? freeLaptops[0])?.id;
    }

    const item = makeItem(kind, hostId);
    if (kind === 'monitorArm' && item.monitorArm) {
      const hostItem = s.project.items.find((i) => i.id === hostId);
      const initClampX = suggestedArmClampX(
        hostItem ? [hostItem] : [],
        item.monitorArm.clampSide,
        s.project.desk,
      );
      item.monitorArm.clampX = initClampX;
    }
    if (kind !== 'screenLamp' && kind !== 'monitorArm') {
      const n = s.project.items.filter((i) => i.kind === kind).length;
      if (kind === 'mousepad') {
        item.x = 0;
        item.z = 0.12 + (n % 2) * 0.04;
      } else if (kind === 'mouse') {
        item.x = 0.24 + (n % 3) * 0.09;
        item.z = 0.15 + (n % 2) * 0.05;
      } else if (kind === 'powerStrip') {
        item.x = -0.35 + (n % 3) * 0.14;
        item.z = -0.22 + (n % 2) * 0.08;
      } else if (kind === 'wallOutlet') {
        item.x = (n % 2 === 0 ? 1 : -1) * 0.28 + Math.floor(n / 2) * 0.12;
        item.z = 0;
      } else {
        item.x = ((n % 3) - 1) * 0.12;
        item.z = 0.12 + (n % 2) * 0.06;
      }
    }
    s.endGesture();
    if (item.kind !== 'laptopStand' && s.collisionEnabled) {
      const resolved = resolveItemPositionWithCollisions(
        item,
        {
          x: item.x,
          z: item.z,
          ...(item.wallY !== undefined ? { wallY: item.wallY } : {}),
        },
        s.project.desk,
        s.project.items,
      );
      item.x = resolved.x;
      item.z = resolved.z;
      if (typeof resolved.wallY === 'number') item.wallY = resolved.wallY;
    }
    get().commit((p) => {
      if (kind === 'wallOutlet' && item.surface === 'wall' && !p.desk.backWall?.enabled) {
        p.desk.backWall = {
          enabled: true,
          height: p.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
          gap: p.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
          color: p.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
        };
      }
      p.items.push(item);
    });
    set({ selected: item.id });
  },
  addDualMonitorArm: () => {
    const s = get();
    const freeMonitors = s.project.items.filter(
      (i) => i.kind === 'monitor' && !isMonitorMountedOnArm(i.id, s.project.items),
    );
    const freeLaptops = s.project.items.filter(
      (i) =>
        (i.kind === 'gamingLaptop' || i.kind === 'macbook') &&
        !s.project.items.some((st) => st.laptopStand?.laptopId === i.id) &&
        !findArmForTrayLaptop(i.id, s.project.items),
    );
    if (!freeMonitors.length && !freeLaptops.length) {
      throw new EditorError(
        '没有可挂载的空闲显示器或笔记本。请先添加设备；每台设备只能挂载一条支臂。',
      );
    }

    const pickedPrimaryMon = freeMonitors.find((i) => i.id === s.selected) ?? freeMonitors[0];
    let primaryKind: 'monitor' | 'laptopTray';
    let monitorId: string | undefined;
    let primaryLaptopId: string | undefined;
    const mountedTargets: SceneItem[] = [];

    if (pickedPrimaryMon) {
      primaryKind = 'monitor';
      monitorId = pickedPrimaryMon.id;
      mountedTargets.push(pickedPrimaryMon);
    } else {
      const pickedLap = freeLaptops.find((i) => i.id === s.selected) ?? freeLaptops[0];
      primaryKind = 'laptopTray';
      primaryLaptopId = pickedLap.id;
      mountedTargets.push(pickedLap);
    }

    const remainingMon = freeMonitors.find((m) => m.id !== monitorId);
    const remainingLap = freeLaptops.find((l) => l.id !== primaryLaptopId);
    let secondaryKind: 'none' | 'monitor' | 'laptopTray' = 'none';
    let secondaryMonitorId: string | undefined;
    let secondaryLaptopId: string | undefined;
    if (remainingMon) {
      secondaryKind = 'monitor';
      secondaryMonitorId = remainingMon.id;
      mountedTargets.push(remainingMon);
    } else if (remainingLap) {
      secondaryKind = 'laptopTray';
      secondaryLaptopId = remainingLap.id;
      mountedTargets.push(remainingLap);
    }

    const dualArm = makeItem('monitorArm', monitorId ?? primaryLaptopId);
    dualArm.name = '双头机械臂';
    dualArm.size = { width: 0.14, height: 0.52, depth: 0.35 };
    dualArm.monitorArm = {
      armStyle: 'dual',
      clampSide: 'center',
      clampX: suggestedArmClampX(mountedTargets, 'center', s.project.desk),
      cableClip: true,
      primaryKind,
      ...(monitorId ? { monitorId } : {}),
      ...(primaryLaptopId ? { primaryLaptopId } : {}),
      secondaryKind,
      ...(secondaryMonitorId ? { secondaryMonitorId } : {}),
      ...(secondaryLaptopId ? { secondaryLaptopId } : {}),
    };

    s.endGesture();
    get().commit((p) => {
      p.items.push(dualArm);
    });
    set({ selected: dualArm.id });
  },
  attachLaptopTray: () => {
    const s = get();
    const freeLaptops = s.project.items.filter(
      (i) =>
        (i.kind === 'gamingLaptop' || i.kind === 'macbook') &&
        !s.project.items.some((st) => st.laptopStand?.laptopId === i.id) &&
        !findArmForTrayLaptop(i.id, s.project.items),
    );
    const laptop = freeLaptops.find((i) => i.id === s.selected) ?? freeLaptops[0];
    if (!laptop) {
      throw new EditorError(
        '没有空闲笔记本可放置在 NB 托盘上。请先添加游戏本或 MacBook，且未绑定其他支架。',
      );
    }
    const arms = s.project.items.filter((i) => i.kind === 'monitorArm' && i.monitorArm);
    const openArm =
      arms.find(
        (a) =>
          a.id === s.selected &&
          (!a.monitorArm!.armStyle ||
            a.monitorArm!.armStyle === 'single' ||
            a.monitorArm!.secondaryKind === 'none'),
      ) ??
      arms.find(
        (a) =>
          !a.monitorArm!.armStyle ||
          a.monitorArm!.armStyle === 'single' ||
          (!a.monitorArm!.secondaryMonitorId && !a.monitorArm!.secondaryLaptopId),
      );

    s.endGesture();
    if (openArm?.monitorArm) {
      get().commit((p) => {
        const target = p.items.find((i) => i.id === openArm.id);
        if (!target?.monitorArm) return;
        const primaryId =
          armPrimaryMonitorId(target.monitorArm) ?? armPrimaryLaptopId(target.monitorArm);
        const primaryTarget = p.items.find((i) => i.id === primaryId);
        const nextClampX = suggestedArmClampX(
          primaryTarget ? [primaryTarget, laptop] : [laptop],
          target.monitorArm.clampSide ?? 'center',
          p.desk,
          target.monitorArm.clampX,
        );
        target.monitorArm = {
          ...target.monitorArm,
          armStyle: 'dual',
          clampX: nextClampX,
          secondaryKind: 'laptopTray',
          secondaryMonitorId: undefined,
          secondaryLaptopId: laptop.id,
        };
      });
      set({ selected: openArm.id });
      return;
    }

    const trayArm = makeItem('monitorArm', laptop.id);
    const initClampX = suggestedArmClampX([laptop], 'center', s.project.desk);
    trayArm.monitorArm = {
      clampSide: 'center',
      clampX: initClampX,
      cableClip: true,
      primaryKind: 'laptopTray',
      primaryLaptopId: laptop.id,
    };
    get().commit((p) => {
      p.items.push(trayArm);
    });
    set({ selected: trayArm.id });
  },
  updateItem: (id, patch) => {
    const items = get().project.items;
    if (patch.lamp) {
      if (!items.some((i) => i.id === patch.lamp!.monitorId && i.kind === 'monitor'))
        throw new EditorError('挂灯只能安装到现有的内置显示器。');
      if (items.some((i) => i.id !== id && i.lamp?.monitorId === patch.lamp!.monitorId))
        throw new EditorError('这台显示器已经安装了挂灯，请选择其他显示器。');
    }
    if (patch.monitorArm) {
      const others = items.filter((i) => i.id !== id);
      const mids = armMountedMonitorIds(patch.monitorArm);
      for (const mId of mids) {
        if (!items.some((i) => i.id === mId && i.kind === 'monitor'))
          throw new EditorError('支架臂只能绑定现有的内置显示器。');
        if (isMonitorMountedOnArm(mId, others))
          throw new EditorError('这台显示器已经安装了其他支架臂，请选择其他显示器。');
      }
      const lids = armMountedLaptopIds(patch.monitorArm);
      for (const lId of lids) {
        if (!items.some((i) => i.id === lId && (i.kind === 'gamingLaptop' || i.kind === 'macbook')))
          throw new EditorError('笔记本托盘只能放置场景中的笔记本。');
        if (
          others.some((o) => o.laptopStand?.laptopId === lId) ||
          Boolean(findArmForTrayLaptop(lId, others))
        )
          throw new EditorError('这台笔记本已经安装在其他支架或托盘上。');
      }
    }
    if (patch.laptopStand?.laptopId) {
      const targetId = patch.laptopStand.laptopId;
      if (
        !items.some((i) => i.id === targetId && (i.kind === 'gamingLaptop' || i.kind === 'macbook'))
      )
        throw new EditorError('支架只能绑定场景中的笔记本。');
      if (
        items.some((i) => i.id !== id && i.laptopStand?.laptopId === targetId) ||
        Boolean(findArmForTrayLaptop(targetId, items))
      )
        throw new EditorError('这台笔记本已经安装在其他支架或托盘上。');
    }
    let hitMonitorObstacle: string | undefined;
    get().commit((p) => {
      const i = p.items.findIndex((i) => i.id === id);
      if (i >= 0) {
        const prevItem = p.items[i];
        let nextItem: SceneItem = { ...prevItem, ...patch };
        if (prevItem.kind === 'monitorArm' && nextItem.monitorArm) {
          const prevCfg = prevItem.monitorArm;
          const nextCfg = { ...nextItem.monitorArm };
          if (nextCfg.clampX === undefined && prevCfg?.clampX !== undefined) {
            // Preserve the fixed desk-edge C-clamp anchor across settings edits.
            nextCfg.clampX = prevCfg.clampX;
          }
          const prevInverted = prevCfg?.mountOrientation === 'inverted';
          const nextInverted = nextCfg.mountOrientation === 'inverted';
          if (prevCfg && prevInverted !== nextInverted) {
            if (
              typeof nextCfg.primaryLowerPitchDeg === 'number' &&
              nextCfg.primaryLowerPitchDeg === prevCfg.primaryLowerPitchDeg
            ) {
              nextCfg.primaryLowerPitchDeg = -nextCfg.primaryLowerPitchDeg;
            }
            if (
              typeof nextCfg.secondaryLowerPitchDeg === 'number' &&
              nextCfg.secondaryLowerPitchDeg === prevCfg.secondaryLowerPitchDeg
            ) {
              nextCfg.secondaryLowerPitchDeg = -nextCfg.secondaryLowerPitchDeg;
            }
          }
          nextItem.monitorArm = nextCfg;
        }
        p.items[i] = nextItem;

        // Enforce fixed-length physical arm reach + stroke limits when moving/lifting a mounted item.
        const mountedBranch = findArmBranchForItem(id, p.items);
        if (mountedBranch) {
          const bounded = constrainTargetToMonitorArm(
            p.items[i],
            p.items[i].x,
            p.items[i].z,
            p.items[i].lift,
            mountedBranch.arm,
            mountedBranch.role,
            mountedBranch.targetType,
            p.items,
            p.desk,
          );
          p.items[i] = {
            ...p.items[i],
            x: bounded.x,
            z: bounded.z,
            ...(typeof bounded.lift === 'number' ? { lift: bounded.lift } : {}),
          };
        }

        // Enforce 3D physical anti-clipping limits for monitor yaw, pitch, roll, and lift.
        if (
          prevItem.kind === 'monitor' &&
          get().collisionEnabled &&
          (patch.rotation !== undefined ||
            patch.pitch !== undefined ||
            patch.roll !== undefined ||
            patch.lift !== undefined)
        ) {
          const posePatch: Partial<SceneItem> = {};
          if (patch.rotation !== undefined) posePatch.rotation = p.items[i].rotation;
          if (patch.pitch !== undefined) posePatch.pitch = p.items[i].pitch;
          if (patch.roll !== undefined) posePatch.roll = p.items[i].roll;
          if (patch.lift !== undefined) posePatch.lift = p.items[i].lift;
          const constrained = constrainMonitorPose(
            {
              ...p.items[i],
              rotation: prevItem.rotation,
              pitch: prevItem.pitch,
              roll: prevItem.roll,
              lift: prevItem.lift,
            },
            posePatch,
            p.desk,
            p.items,
          );
          p.items[i] = constrained.item;
          if (constrained.hitObstacle) {
            hitMonitorObstacle = constrained.hitObstacle;
          }
          // Also ensure mounted arm segments stay clear of desktop/obstacles when monitor lift changes
          if (mountedBranch && patch.lift !== undefined && p.items[i].lift !== prevItem.lift) {
            const startLift = prevItem.lift ?? 0;
            const targetLift = p.items[i].lift ?? startLift;
            const hitWithLift = (candidateLift: number) => {
              const probeMon = { ...p.items[i], lift: candidateLift };
              const probeItems = p.items.map((it, idx) => (idx === i ? probeMon : it));
              return checkMonitorArmCollision(
                mountedBranch.arm,
                mountedBranch.role,
                p.desk,
                probeItems,
              );
            };
            const targetArmHit = hitWithLift(targetLift);
            if (targetArmHit !== null && hitWithLift(startLift) === null) {
              let lo = 0;
              let hi = 1;
              for (let iter = 0; iter < 12; iter++) {
                const mid = (lo + hi) / 2;
                const cand =
                  Math.round((startLift + (targetLift - startLift) * mid) * 10000) / 10000;
                if (hitWithLift(cand) === null) lo = mid;
                else hi = mid;
              }
              p.items[i] = {
                ...p.items[i],
                lift: Math.round((startLift + (targetLift - startLift) * lo) * 10000) / 10000,
              };
              hitMonitorObstacle ??= targetArmHit;
            }
          }
        }

        // Keep mounted devices tethered inside reachable arm envelope if the arm itself changed.
        if (p.items[i].kind === 'monitorArm' && p.items[i].monitorArm) {
          const armItem = p.items[i];
          const armCfg = armItem.monitorArm!;
          const mountedIds = [...armMountedMonitorIds(armCfg), ...armMountedLaptopIds(armCfg)];
          for (const targetId of mountedIds) {
            const tIdx = p.items.findIndex((cand) => cand.id === targetId);
            if (tIdx < 0) continue;
            const targetBranch = findArmBranchForItem(targetId, p.items);
            if (!targetBranch) continue;
            const bounded = constrainTargetToMonitorArm(
              p.items[tIdx],
              p.items[tIdx].x,
              p.items[tIdx].z,
              p.items[tIdx].lift,
              armItem,
              targetBranch.role,
              targetBranch.targetType,
              p.items,
              p.desk,
            );
            p.items[tIdx] = {
              ...p.items[tIdx],
              x: bounded.x,
              z: bounded.z,
              ...(typeof bounded.lift === 'number' ? { lift: bounded.lift } : {}),
            };
          }
        }

        if (patch.monitor && p.cables) {
          const validIds = new Set(devicePorts(p.items[i]).map((pt) => pt.id));
          const remaining = p.cables.filter(
            (c) =>
              !(c.from.type === 'device' && c.from.itemId === id && !validIds.has(c.from.portId)) &&
              !(c.to.type === 'device' && c.to.itemId === id && !validIds.has(c.to.portId)),
          );
          if (remaining.length) p.cables = remaining;
          else delete p.cables;
        }
      }
    });
    if (hitMonitorObstacle) {
      set({ collisionNotice: `已限制显示器姿态：避免与「${hitMonitorObstacle}」穿模` });
    } else if (
      patch.rotation !== undefined ||
      patch.pitch !== undefined ||
      patch.roll !== undefined ||
      patch.lift !== undefined
    ) {
      if (get().collisionNotice) set({ collisionNotice: null });
    }
  },
  addCable: (cable) => {
    get().endGesture();
    const id = uid();
    get().commit((p) => {
      p.cables = [...(p.cables ?? []), { ...cable, id }];
    });
    return id;
  },
  updateCable: (id, patch) => {
    get().commit((p) => {
      if (!p.cables) return;
      const idx = p.cables.findIndex((c) => c.id === id);
      if (idx >= 0) p.cables[idx] = { ...p.cables[idx], ...patch };
    });
  },
  removeCable: (id) => {
    get().endGesture();
    if (get().selectedCableId === id) set({ selectedCableId: null, selectedWaypointIdx: null });
    get().commit((p) => {
      if (!p.cables) return;
      const next = p.cables.filter((c) => c.id !== id);
      if (next.length) p.cables = next;
      else delete p.cables;
    });
  },
  remove: () => {
    const id = get().selected;
    if (!id) return;
    get().endGesture();
    get().commit((p) => {
      const removedIds = new Set<string>([id]);
      for (const item of p.items) {
        if (item.lamp?.monitorId === id) {
          removedIds.add(item.id);
        }
        if (item.kind === 'monitorArm' && item.monitorArm) {
          const cfg = item.monitorArm;
          const lostPrimary = armPrimaryMonitorId(cfg) === id || armPrimaryLaptopId(cfg) === id;
          const lostSecondary =
            armSecondaryMonitorId(cfg) === id || armSecondaryLaptopId(cfg) === id;
          const hasSecondary = Boolean(armSecondaryMonitorId(cfg) || armSecondaryLaptopId(cfg));
          if (lostPrimary && !hasSecondary) {
            removedIds.add(item.id);
          } else if (lostPrimary && hasSecondary) {
            if (cfg.secondaryKind === 'monitor' && cfg.secondaryMonitorId) {
              item.monitorArm = {
                ...cfg,
                armStyle: 'single',
                primaryKind: 'monitor',
                monitorId: cfg.secondaryMonitorId,
                primaryLaptopId: undefined,
                secondaryKind: 'none',
                secondaryMonitorId: undefined,
                secondaryLaptopId: undefined,
              };
            } else if (cfg.secondaryKind === 'laptopTray' && cfg.secondaryLaptopId) {
              item.monitorArm = {
                ...cfg,
                armStyle: 'single',
                primaryKind: 'laptopTray',
                monitorId: undefined,
                primaryLaptopId: cfg.secondaryLaptopId,
                secondaryKind: 'none',
                secondaryMonitorId: undefined,
                secondaryLaptopId: undefined,
              };
            }
          } else if (lostSecondary) {
            item.monitorArm = {
              ...cfg,
              secondaryKind: 'none',
              secondaryMonitorId: undefined,
              secondaryLaptopId: undefined,
            };
          }
        }
      }
      p.items = p.items
        .filter((i) => !removedIds.has(i.id))
        .map((i) =>
          i.laptopStand?.laptopId === id
            ? { ...i, laptopStand: { ...i.laptopStand, laptopId: undefined } }
            : i,
        );
      if (p.cables) {
        const remaining = p.cables.filter(
          (c) =>
            !(c.from.type === 'device' && removedIds.has(c.from.itemId)) &&
            !(c.to.type === 'device' && removedIds.has(c.to.itemId)),
        );
        if (remaining.length) p.cables = remaining;
        else delete p.cables;
      }
    });
    set({ selected: null });
  },
  duplicate: () => {
    const s = get(),
      original = s.project.items.find((i) => i.id === s.selected);
    if (!original) return;
    if (original.kind === 'screenLamp')
      throw new EditorError('挂灯随显示器复制；请在物品库为其他显示器添加挂灯。');
    if (original.kind === 'monitorArm')
      throw new EditorError('支架臂绑定特定显示器；请在模型库为其他显示器添加支架臂。');
    const attached = s.project.items.find((i) => i.lamp?.monitorId === original.id);
    if (
      attached &&
      s.project.items.filter((i) => i.kind === 'screenLamp').length >= MAX_SCREEN_LAMPS
    )
      throw new EditorError('复制此显示器会超过两盏挂灯上限，请先移除一盏挂灯。');
    const clone = structuredClone(original);
    if (clone.laptopStand) delete clone.laptopStand.laptopId;
    const item: SceneItem = {
      ...clone,
      id: uid(),
      name: original.name.slice(0, 77) + ' 副本',
      x: Math.min(5, original.x + 0.08),
      z: Math.min(5, original.z + 0.06),
    };
    s.endGesture();
    if (item.kind !== 'laptopStand' && s.collisionEnabled) {
      const resolved = resolveItemPositionWithCollisions(
        item,
        {
          x: item.x,
          z: item.z,
          ...(item.wallY !== undefined ? { wallY: item.wallY } : {}),
        },
        s.project.desk,
        s.project.items,
      );
      item.x = resolved.x;
      item.z = resolved.z;
      if (typeof resolved.wallY === 'number') item.wallY = resolved.wallY;
    }
    get().commit((p) => {
      p.items.push(item);
      if (attached?.lamp)
        p.items.push({
          ...structuredClone(attached),
          id: uid(),
          name: attached.name.slice(0, 77) + ' 副本',
          lamp: { ...attached.lamp, monitorId: item.id },
        });
    });
    set({ selected: item.id });
  },
  undo: () => {
    get().endGesture();
    const s = get();
    if (!s.past.length) return;
    const p = withAssets(s.past[s.past.length - 1], s.project);
    set({
      project: p,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future].slice(0, 50),
      selected: p.items.some((i) => i.id === s.selected) ? s.selected : null,
      dragPreview: null,
    });
  },
  redo: () => {
    get().endGesture();
    const s = get();
    if (!s.future.length) return;
    const p = withAssets(s.future[0], s.project);
    set({
      project: p,
      past: [...s.past, s.project].slice(-50),
      future: s.future.slice(1),
      selected: p.items.some((i) => i.id === s.selected) ? s.selected : null,
      dragPreview: null,
    });
  },
  replace: (p, blobs) => {
    const valid = projectSchema.parse(p);
    gestureBase = null;
    set({
      project: valid,
      blobs: new Map(blobs),
      past: [],
      future: [],
      selected: null,
      selectedCableId: null,
      selectedWaypointIdx: null,
      wiringMode: false,
      wiringDraft: null,
      wiringPreset: null,
      collisionNotice: null,
      dragPreview: null,
      lampGuides: false,
    });
  },
  addImported: (meta, blob, size) => {
    const s = get();
    const item: SceneItem = {
      id: uid(),
      name: meta.name.replace(/\.(glb|gltf)$/i, ''),
      kind: 'imported',
      assetId: meta.id,
      x: 0,
      z: 0,
      rotation: 0,
      size,
      color: '#b9c6d4',
    };
    s.commit((p) => {
      p.assets.push(meta);
      p.items.push(item);
    });
    set({ blobs: new Map(s.blobs).set(meta.id, blob), selected: item.id });
  },
}));

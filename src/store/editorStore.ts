// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { create } from 'zustand';
import { cableMeta, resolveCablePlugEnds, type Cable, type CableWaypoint } from '../domain/cable';
import {
  constrainItemPoseForConnectedCables,
  validateCableReachability,
} from '../domain/cableRouting';
import {
  canAcPlugFitOutlet,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  type PlugSpecKind,
} from '../domain/power';
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
import {
  BUILTIN_ITEM_NAMES,
  getLang,
  localizeProjectInPlace,
  tr,
  translateObstacleLabel,
  useI18n,
  type Lang,
} from '../i18n';

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
  fromPortKind?: CableKind;
  toPortKind?: CableKind;
  label?: string;
};

export type PowerStripPlaceOptions = {
  cordLengthM: number;
  plugType: 'cn3Pin' | 'rightAngle';
  connectionMode: 'existingOutlet' | 'autoWallOutlet' | 'floorDrop';
  targetOutletId?: string;
};

export type PowerStripCordPatch = {
  cordLengthM?: number;
  plugType?: 'cn3Pin' | 'rightAngle';
  plugIntoWallOutlet?: boolean;
  targetOutletId?: string;
};

type State = {
  project: Project;
  selected: string | null;
  selectedCableId: string | null;
  selectedWaypointIdx: number | null;
  wiringMode: boolean;
  wiringFrom: WiringDraft | null;
  wiringTo: WiringDraft | null;
  wiringActiveEnd: 'from' | 'to';
  wiringShortfallM: number;
  wiringDraft: WiringDraft | null;
  wiringPreset: WiringPreset | null;
  collisionEnabled: boolean;
  collisionNotice: string | null;
  dragPreview: DragPreviewState | null;
  setDragPreview: (preview: DragPreviewState | null) => void;
  setCollisionEnabled: (enabled: boolean) => void;
  setCollisionNotice: (note: string | null) => void;
  setWiringMode: (on: boolean, preset?: WiringPreset | null) => void;
  updateWiringPreset: (preset: WiringPreset) => void;
  setWiringShortfallM: (shortfallM: number) => void;
  switchWiringEnd: () => void;
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
  addPowerStripWithCord: (options: PowerStripPlaceOptions) => string;
  configurePowerStripCord: (stripId: string, patch: PowerStripCordPatch) => void;
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
  syncLanguageNames: (lang: Lang) => void;
  addImported: (meta: AssetMeta, blob: Blob, size: SceneItem['size']) => void;
};

const withAssets = (p: Project, current: Project): Project => ({
  ...p,
  assets: [...new Map([...current.assets, ...p.assets].map((a) => [a.id, a])).values()],
});

function unclipShortArmCables(p: Project): string | null {
  if (!p.cables?.length) return null;
  let notice: string | null = null;
  for (const c of p.cables) {
    if (!c.routeViaArm) continue;
    const viaArm = validateCableReachability(c, p);
    if (!viaArm.ok) {
      c.routeViaArm = false;
      const fixedM = (viaArm.totalM ?? c.lengthM ?? 1).toFixed(2);
      const reqM = (viaArm.requiredM ?? 1.5).toFixed(2);
      notice = tr(
        `当前 ${fixedM} m 定长线缆不足以绕行支架臂导槽（需约 ${reqM} m），已自动保持直连；如需沿臂理线，请在「线缆」面板更换为更长规格。`,
        `Fixed ${fixedM} m cable is too short for the monitor arm channel (~${reqM} m needed) and stayed direct; pick a longer preset in Cables to route via arm.`,
      );
    }
  }
  return notice;
}

// 持续手势（如滑块拖动）期间的基准快照：期间所有 commit 只做实时预览，
// 不记入撤销历史；endGesture 在结束时把「基准 → 最终」记为一步。
let gestureBase: Project | null = null;

export const useEditor = create<State>((set, get) => ({
  project: defaultProject(),
  selected: null,
  selectedCableId: null,
  selectedWaypointIdx: null,
  wiringMode: false,
  wiringFrom: null,
  wiringTo: null,
  wiringActiveEnd: 'from',
  wiringShortfallM: 0,
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
      wiringFrom: null,
      wiringTo: null,
      wiringActiveEnd: 'from',
      wiringShortfallM: 0,
      wiringDraft: null,
      wiringPreset: on ? preset : null,
      collisionNotice: null,
    }),
  updateWiringPreset: (preset) =>
    set((s) => (s.wiringMode ? { wiringPreset: preset, collisionNotice: null } : {})),
  setWiringShortfallM: (shortfallM) =>
    set((s) =>
      Math.abs(s.wiringShortfallM - shortfallM) > 0.005 ? { wiringShortfallM: shortfallM } : {},
    ),
  switchWiringEnd: () =>
    set((s) => {
      if (!s.wiringMode) return {};
      const nextActive: 'from' | 'to' = s.wiringActiveEnd === 'from' ? 'to' : 'from';
      if (!s.wiringFrom && !s.wiringTo) {
        return { wiringActiveEnd: nextActive };
      }
      const asymmetricEnds =
        s.wiringPreset?.fromPortKind &&
        s.wiringPreset?.toPortKind &&
        s.wiringPreset.fromPortKind !== s.wiringPreset.toPortKind;
      if (asymmetricEnds) {
        return {
          wiringFrom: null,
          wiringTo: null,
          wiringDraft: null,
          wiringActiveEnd: nextActive,
        };
      }
      // Keep the already-plugged port fixed and swap which physical end is held on the cursor
      return {
        wiringFrom: s.wiringTo,
        wiringTo: s.wiringFrom,
        wiringActiveEnd: nextActive,
        wiringDraft: s.wiringTo ?? s.wiringFrom,
      };
    }),
  selectCable: (id, waypointIdx = null) => {
    if (get().selectedCableId !== id) get().endGesture();
    set({ selectedCableId: id, selectedWaypointIdx: waypointIdx });
  },
  pickWiringPort: (itemId, portId, kind) => {
    const s = get();
    const preset = s.wiringPreset;
    const picked: WiringDraft = { itemId, portId, kind };
    const connected = s.wiringFrom ?? s.wiringTo;

    if (!connected) {
      const placeAtFrom = s.wiringActiveEnd === 'from';
      set({
        wiringFrom: placeAtFrom ? picked : null,
        wiringTo: placeAtFrom ? null : picked,
        wiringDraft: picked,
        wiringActiveEnd: placeAtFrom ? 'to' : 'from',
        collisionNotice: null,
      });
      return;
    }

    const connectedRole: 'from' | 'to' = s.wiringFrom ? 'from' : 'to';
    if (connected.itemId === itemId && connected.portId === portId) {
      set({
        wiringFrom: null,
        wiringTo: null,
        wiringDraft: null,
        wiringActiveEnd: connectedRole,
      });
      return;
    }
    if (connected.itemId === itemId) {
      set({
        wiringFrom: connectedRole === 'from' ? picked : null,
        wiringTo: connectedRole === 'to' ? picked : null,
        wiringDraft: picked,
      });
      return;
    }

    const fromEp = s.wiringFrom ?? picked;
    const toEp = s.wiringTo ?? picked;
    const resolvedKind: CableKind = preset
      ? preset.kind
      : fromEp.kind === toEp.kind
        ? fromEp.kind
        : (fromEp.kind === 'dp' && toEp.kind === 'usbc') ||
            (fromEp.kind === 'usbc' && toEp.kind === 'dp')
          ? 'dp'
          : (fromEp.kind === 'rca' && toEp.kind === 'aux35') ||
              (fromEp.kind === 'aux35' && toEp.kind === 'rca')
            ? 'rca'
            : fromEp.kind === 'usbc' || toEp.kind === 'usbc'
              ? 'usbc'
              : fromEp.kind === 'magsafe' || toEp.kind === 'magsafe'
                ? 'magsafe'
                : fromEp.kind;
    const spec = cableMeta[resolvedKind];
    const fromItem = s.project.items.find((i) => i.id === fromEp.itemId);
    const targetItem = s.project.items.find((i) => i.id === toEp.itemId);
    const plugEnds = resolveCablePlugEnds({
      fromKind: fromItem?.kind,
      fromPortId: fromEp.portId,
      fromPortKind: fromEp.kind,
      toKind: targetItem?.kind,
      toPortId: toEp.portId,
      toPortKind: toEp.kind,
      cableKind: resolvedKind,
      outletPlugType: preset?.outletPlugType,
      devicePlugType: preset?.devicePlugType,
    });
    let cableId: string;
    try {
      cableId = s.addCable({
        kind: resolvedKind,
        from: { type: 'device', itemId: fromEp.itemId, portId: fromEp.portId },
        to: { type: 'device', itemId: toEp.itemId, portId: toEp.portId },
        routeViaArm: true,
        viaStandSlot: true,
        color: preset?.color ?? spec.color,
        lengthM: preset?.lengthM ?? spec.defaultLengthM,
        lengthIncludesConnectors: true,
        ...plugEnds,
      });
    } catch (err) {
      set({
        collisionNotice:
          err instanceof Error
            ? err.message
            : tr(
                '线缆固定长度不足，无法完成端口连接。',
                'Fixed cable length is too short to reach target port.',
              ),
      });
      return;
    }
    set({
      wiringFrom: null,
      wiringTo: null,
      wiringActiveEnd: 'from',
      wiringShortfallM: 0,
      wiringDraft: null,
      wiringMode: false,
      wiringPreset: null,
      collisionNotice: null,
      selectedCableId: cableId,
      selectedWaypointIdx: null,
    });
  },
  dropWiringDraftToFloor: (drop = 'auto') => {
    const s = get();
    const draft = s.wiringFrom ?? s.wiringTo ?? s.wiringDraft;
    if (!draft) return;
    const preset = s.wiringPreset;
    const resolvedKind = preset ? preset.kind : draft.kind;
    const spec = cableMeta[resolvedKind];
    const fromItem = s.project.items.find((i) => i.id === draft.itemId);
    const plugEnds = resolveCablePlugEnds({
      fromKind: fromItem?.kind,
      fromPortId: draft.portId,
      fromPortKind: draft.kind,
      cableKind: resolvedKind,
      outletPlugType: preset?.outletPlugType,
      devicePlugType: preset?.devicePlugType,
    });
    let cableId: string;
    try {
      cableId = s.addCable({
        kind: resolvedKind,
        from: { type: 'device', itemId: draft.itemId, portId: draft.portId },
        to: { type: 'floor', drop },
        drop,
        routeViaArm: true,
        viaStandSlot: true,
        color: preset?.color ?? spec.color,
        lengthM: preset?.lengthM ?? spec.defaultLengthM,
        lengthIncludesConnectors: true,
        ...plugEnds,
      });
    } catch (err) {
      set({
        collisionNotice:
          err instanceof Error
            ? err.message
            : tr(
                '线缆固定长度不足，无法垂落到桌面下方。',
                'Fixed cable length is too short to drop below desk.',
              ),
      });
      return;
    }
    set({
      wiringFrom: null,
      wiringTo: null,
      wiringActiveEnd: 'from',
      wiringShortfallM: 0,
      wiringDraft: null,
      wiringMode: false,
      wiringPreset: null,
      collisionNotice: null,
      selectedCableId: cableId,
      selectedWaypointIdx: null,
    });
  },
  updateCableWaypoint: (cableId, idx, point, fallback) => {
    const state = get();
    const existing = state.project.cables?.find((item) => item.id === cableId);
    if (!existing) return;
    const list = (existing.waypoints?.length ? existing.waypoints : fallback).map((w) => ({
      ...w,
    }));
    if (idx < 0 || idx >= list.length) return;
    list[idx] = {
      x: Math.max(-5, Math.min(5, Math.round(point.x * 1000) / 1000)),
      y: Math.max(0.004, Math.min(3, Math.round(point.y * 1000) / 1000)),
      z: Math.max(-5, Math.min(5, Math.round(point.z * 1000) / 1000)),
    };
    const check = validateCableReachability({ ...existing, waypoints: list }, state.project);
    if (!check.ok) {
      set({
        collisionNotice: tr(
          `已达固定线长极限（固定 ${check.totalM?.toFixed(2) ?? ''} m，当前拖拽路径需 ${check.requiredM?.toFixed(2) ?? ''} m），线缆无法被拉长`,
          `Fixed cable length limit reached (${check.totalM?.toFixed(2) ?? ''} m fixed, path needs ${check.requiredM?.toFixed(2) ?? ''} m)`,
        ),
      });
      return;
    }
    get().commit((p) => {
      if (!p.cables) return;
      const c = p.cables.find((item) => item.id === cableId);
      if (c) c.waypoints = list;
    });
  },
  insertCableWaypoint: (cableId, afterIdx, point, fallback) => {
    const state = get();
    const existing = state.project.cables?.find((item) => item.id === cableId);
    if (!existing) return;
    const list = (existing.waypoints?.length ? existing.waypoints : fallback).map((w) => ({
      ...w,
    }));
    const pos = Math.max(0, Math.min(list.length, afterIdx + 1));
    list.splice(pos, 0, {
      x: Math.max(-5, Math.min(5, Math.round(point.x * 1000) / 1000)),
      y: Math.max(0.004, Math.min(3, Math.round(point.y * 1000) / 1000)),
      z: Math.max(-5, Math.min(5, Math.round(point.z * 1000) / 1000)),
    });
    const check = validateCableReachability({ ...existing, waypoints: list }, state.project);
    if (!check.ok) {
      set({
        collisionNotice:
          check.reason ??
          tr('已达固定线长上限，无法继续拉长线缆。', 'Fixed cable length limit reached.'),
      });
      return;
    }
    get().endGesture();
    get().commit((p) => {
      if (!p.cables) return;
      const c = p.cables.find((item) => item.id === cableId);
      if (c) c.waypoints = list;
    });
    set({ selectedCableId: cableId, selectedWaypointIdx: pos });
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
        throw new EditorError(
          tr(
            '场景最多支持两盏屏幕挂灯，请先移除一盏。',
            'Up to two monitor light bars are supported.',
          ),
        );
      const free = s.project.items.filter(
        (i) => i.kind === 'monitor' && !lamps.some((l) => l.lamp?.monitorId === i.id),
      );
      hostId = (free.find((i) => i.id === s.selected) ?? free[0])?.id;
      if (!hostId)
        throw new EditorError(
          tr(
            '没有可安装的显示器。请添加内置显示器；每台最多安装一盏挂灯。',
            'No available monitor found. Add a built-in monitor first (max one light bar per monitor).',
          ),
        );
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
            tr(
              '没有可挂载的显示器或笔记本。请先添加设备；每台显示器或笔记本只能挂载一条支臂。',
              'No available monitor or laptop to mount. Add a device first.',
            ),
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
        let trayNotice: string | null = null;
        get().commit((p) => {
          p.items.push(trayArm);
          trayNotice = unclipShortArmCables(p);
        });
        set({ selected: trayArm.id, ...(trayNotice ? { collisionNotice: trayNotice } : {}) });
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
    let armNotice: string | null = null;
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
      if (kind === 'monitorArm') {
        armNotice = unclipShortArmCables(p);
      }
    });
    set({ selected: item.id, ...(armNotice ? { collisionNotice: armNotice } : {}) });
  },
  addPowerStripWithCord: (options) => {
    const s = get();
    const { cordLengthM, plugType, connectionMode, targetOutletId } = options;
    const probe = structuredClone(s.project);
    const n = probe.items.filter((i) => i.kind === 'powerStrip').length;
    const strip = makeItem('powerStrip');
    strip.powerStrip = {
      ...defaultPowerStripSettings(),
      cordLengthM,
    };
    strip.x = -0.35 + (n % 3) * 0.14;
    strip.z = -0.22 + (n % 2) * 0.08;
    if (s.collisionEnabled) {
      const resolved = resolveItemPositionWithCollisions(
        strip,
        { x: strip.x, z: strip.z },
        probe.desk,
        probe.items,
      );
      strip.x = resolved.x;
      strip.z = resolved.z;
    }

    let createdWallOutlet: SceneItem | undefined;
    let cableDraft: Omit<Cable, 'id'>;

    if (connectionMode === 'floorDrop') {
      probe.items.push(strip);
      cableDraft = {
        kind: 'power',
        from: { type: 'device', itemId: strip.id, portId: 'ac-in' },
        to: { type: 'floor', drop: 'auto' },
        drop: 'auto',
        routeViaArm: false,
        color: '#1e222b',
        lengthM: cordLengthM,
        lengthIncludesConnectors: true,
        toPlugType: plugType,
      };
    } else {
      let outlet =
        connectionMode === 'existingOutlet'
          ? (probe.items.find((i) => i.id === targetOutletId && i.kind === 'wallOutlet') ??
            probe.items.find((i) => i.kind === 'wallOutlet'))
          : undefined;

      if (!outlet) {
        if (!probe.desk.backWall?.enabled) {
          probe.desk.backWall = {
            enabled: true,
            height: probe.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
            gap: probe.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
            color: probe.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
          };
        }
        createdWallOutlet = makeItem('wallOutlet');
        createdWallOutlet.x = Math.max(
          -probe.desk.width * 0.42,
          Math.min(probe.desk.width * 0.42, strip.x),
        );
        createdWallOutlet.z = 0;
        if (s.collisionEnabled) {
          const wRes = resolveItemPositionWithCollisions(
            createdWallOutlet,
            { x: createdWallOutlet.x, z: 0, wallY: createdWallOutlet.wallY },
            probe.desk,
            probe.items,
          );
          createdWallOutlet.x = wRes.x;
          if (typeof wRes.wallY === 'number') createdWallOutlet.wallY = wRes.wallY;
        }
        probe.items.push(createdWallOutlet);
        outlet = createdWallOutlet;
      }

      probe.items.push(strip);
      const oType = (outlet.wallOutlet ?? defaultWallOutletSettings()).outletType;
      if (!canAcPlugFitOutlet(plugType, oType)) {
        throw new EditorError(
          tr(
            '所选墙面插座为「仅双孔」，无法插入三脚插排电源头。',
            'Target wall outlet is 2-Pin Only and cannot accept a 3-pin power strip plug.',
          ),
        );
      }
      const slot = devicePorts(outlet).find((p) => p.id.startsWith('slot-'));
      if (!slot) {
        throw new EditorError(tr('目标插座无可用插孔。', 'No AC slot available on target outlet.'));
      }
      cableDraft = {
        kind: 'power',
        from: { type: 'device', itemId: strip.id, portId: 'ac-in' },
        to: { type: 'device', itemId: outlet.id, portId: slot.id },
        routeViaArm: false,
        color: '#1e222b',
        lengthM: cordLengthM,
        lengthIncludesConnectors: true,
        toPlugType: plugType,
      };
    }

    const reach = validateCableReachability(cableDraft, probe);
    if (!reach.ok) {
      throw new EditorError(
        reach.reason ??
          tr('所选拖线板电源线长度不足，请改选更长规格。', 'Selected cord length is too short.'),
      );
    }

    const cordId = uid();
    s.endGesture();
    get().commit((p) => {
      if (createdWallOutlet) {
        if (!p.desk.backWall?.enabled) {
          p.desk.backWall = {
            enabled: true,
            height: p.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
            gap: p.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
            color: p.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
          };
        }
        p.items.push(createdWallOutlet);
      }
      p.items.push(strip);
      p.cables = [...(p.cables ?? []), { id: cordId, ...cableDraft }];
    });
    set({ selected: strip.id, selectedCableId: null, selectedWaypointIdx: null });
    return strip.id;
  },
  configurePowerStripCord: (stripId, patch) => {
    const s = get();
    const probe = structuredClone(s.project);
    const strip = probe.items.find((it) => it.id === stripId && it.kind === 'powerStrip');
    if (!strip) return;

    const prevCfg = strip.powerStrip ?? defaultPowerStripSettings();
    const nextLen = patch.cordLengthM ?? prevCfg.cordLengthM ?? 1.8;
    strip.powerStrip = { ...prevCfg, cordLengthM: nextLen };

    const cables = probe.cables ?? [];
    const existingIdx = cables.findIndex(
      (c) =>
        (c.from.type === 'device' && c.from.itemId === stripId && c.from.portId === 'ac-in') ||
        (c.to.type === 'device' && c.to.itemId === stripId && c.to.portId === 'ac-in'),
    );
    const existing = existingIdx >= 0 ? cables[existingIdx] : undefined;
    const activePlug: 'cn3Pin' | 'rightAngle' =
      patch.plugType ??
      (existing?.toPlugType === 'rightAngle' || existing?.fromPlugType === 'rightAngle'
        ? 'rightAngle'
        : 'cn3Pin');

    let nextCable: Cable;
    if (patch.plugIntoWallOutlet || patch.targetOutletId) {
      let outlet = patch.targetOutletId
        ? probe.items.find((i) => i.id === patch.targetOutletId && i.kind === 'wallOutlet')
        : probe.items.find((i) => i.kind === 'wallOutlet');
      if (!outlet) {
        if (!probe.desk.backWall?.enabled) {
          probe.desk.backWall = {
            enabled: true,
            height: probe.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
            gap: probe.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
            color: probe.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
          };
        }
        const created = makeItem('wallOutlet');
        created.x = Math.max(-probe.desk.width * 0.42, Math.min(probe.desk.width * 0.42, strip.x));
        created.z = 0;
        if (s.collisionEnabled) {
          const wRes = resolveItemPositionWithCollisions(
            created,
            { x: created.x, z: 0, wallY: created.wallY },
            probe.desk,
            probe.items,
          );
          created.x = wRes.x;
          if (typeof wRes.wallY === 'number') created.wallY = wRes.wallY;
        }
        probe.items.push(created);
        outlet = created;
      }
      const slot = devicePorts(outlet).find((p) => p.id.startsWith('slot-'));
      if (!slot) {
        throw new EditorError(tr('目标插座无可用插孔。', 'No AC slot available on target outlet.'));
      }
      nextCable = {
        id: existing?.id ?? uid(),
        kind: 'power',
        from: { type: 'device', itemId: stripId, portId: 'ac-in' },
        to: { type: 'device', itemId: outlet.id, portId: slot.id },
        routeViaArm: false,
        color: existing?.color ?? '#1e222b',
        lengthM: nextLen,
        lengthIncludesConnectors: true,
        toPlugType: activePlug,
      };
    } else if (existing) {
      const fromIsAcIn =
        existing.from.type === 'device' &&
        existing.from.itemId === stripId &&
        existing.from.portId === 'ac-in';
      nextCable = {
        ...existing,
        lengthM: nextLen,
        ...(fromIsAcIn ? { toPlugType: activePlug } : { fromPlugType: activePlug }),
      };
    } else {
      nextCable = {
        id: uid(),
        kind: 'power',
        from: { type: 'device', itemId: stripId, portId: 'ac-in' },
        to: { type: 'floor', drop: 'auto' },
        drop: 'auto',
        routeViaArm: false,
        color: '#1e222b',
        lengthM: nextLen,
        lengthIncludesConnectors: true,
        toPlugType: activePlug,
      };
    }

    if (existingIdx >= 0) cables[existingIdx] = nextCable;
    else cables.push(nextCable);
    probe.cables = cables;

    const reach = validateCableReachability(nextCable, probe);
    if (!reach.ok) {
      throw new EditorError(
        reach.reason ??
          tr(
            '该线长不足以够到当前插座位置，请选择更长规格。',
            'Cord length is too short to reach.',
          ),
      );
    }

    s.endGesture();
    get().commit((p) => {
      p.desk = probe.desk;
      p.items = probe.items;
      p.cables = probe.cables;
    });
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
        tr(
          '没有可挂载的空闲显示器或笔记本。请先添加设备；每台设备只能挂载一条支臂。',
          'No free monitor or laptop available to mount. Add a device first.',
        ),
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
    dualArm.name = BUILTIN_ITEM_NAMES.monitorArmDual[getLang()];
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
    let dualNotice: string | null = null;
    get().commit((p) => {
      p.items.push(dualArm);
      dualNotice = unclipShortArmCables(p);
    });
    set({ selected: dualArm.id, ...(dualNotice ? { collisionNotice: dualNotice } : {}) });
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
        tr(
          '没有空闲笔记本可放置在笔记本托盘上。请先添加游戏本或轻薄笔记本，且未绑定其他支架。',
          'No free laptop available for the laptop tray. Add a laptop that is not already on a stand.',
        ),
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
      let openNotice: string | null = null;
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
        openNotice = unclipShortArmCables(p);
      });
      set({ selected: openArm.id, ...(openNotice ? { collisionNotice: openNotice } : {}) });
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
    let trayNotice: string | null = null;
    get().commit((p) => {
      p.items.push(trayArm);
      trayNotice = unclipShortArmCables(p);
    });
    set({ selected: trayArm.id, ...(trayNotice ? { collisionNotice: trayNotice } : {}) });
  },
  updateItem: (id, patch) => {
    const items = get().project.items;
    if (patch.lamp) {
      if (!items.some((i) => i.id === patch.lamp!.monitorId && i.kind === 'monitor'))
        throw new EditorError(
          tr(
            '挂灯只能安装到现有的内置显示器。',
            'Light bars can only be mounted onto an existing monitor.',
          ),
        );
      if (items.some((i) => i.id !== id && i.lamp?.monitorId === patch.lamp!.monitorId))
        throw new EditorError(
          tr(
            '这台显示器已经安装了挂灯，请选择其他显示器。',
            'This monitor already has a light bar mounted.',
          ),
        );
    }
    if (patch.monitorArm) {
      const others = items.filter((i) => i.id !== id);
      const mids = armMountedMonitorIds(patch.monitorArm);
      for (const mId of mids) {
        if (!items.some((i) => i.id === mId && i.kind === 'monitor'))
          throw new EditorError(
            tr(
              '支架臂只能绑定现有的内置显示器。',
              'Monitor arms can only mount an existing monitor.',
            ),
          );
        if (isMonitorMountedOnArm(mId, others))
          throw new EditorError(
            tr(
              '这台显示器已经安装了其他支架臂，请选择其他显示器。',
              'This monitor is already mounted on another arm.',
            ),
          );
      }
      const lids = armMountedLaptopIds(patch.monitorArm);
      for (const lId of lids) {
        if (!items.some((i) => i.id === lId && (i.kind === 'gamingLaptop' || i.kind === 'macbook')))
          throw new EditorError(
            tr(
              '笔记本托盘只能放置场景中的笔记本。',
              'Laptop trays can only hold a laptop in the scene.',
            ),
          );
        if (
          others.some((o) => o.laptopStand?.laptopId === lId) ||
          Boolean(findArmForTrayLaptop(lId, others))
        )
          throw new EditorError(
            tr(
              '这台笔记本已经安装在其他支架或托盘上。',
              'This laptop is already placed on another stand or tray.',
            ),
          );
      }
    }
    if (patch.laptopStand?.laptopId) {
      const targetId = patch.laptopStand.laptopId;
      if (
        !items.some((i) => i.id === targetId && (i.kind === 'gamingLaptop' || i.kind === 'macbook'))
      )
        throw new EditorError(
          tr('支架只能绑定场景中的笔记本。', 'Laptop stands can only bind a laptop in the scene.'),
        );
      if (
        items.some((i) => i.id !== id && i.laptopStand?.laptopId === targetId) ||
        Boolean(findArmForTrayLaptop(targetId, items))
      )
        throw new EditorError(
          tr(
            '这台笔记本已经安装在其他支架或托盘上。',
            'This laptop is already placed on another stand or tray.',
          ),
        );
    }
    let hitMonitorObstacle: string | undefined;
    let cableTetherNotice: string | undefined;
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
            patch.screenYaw !== undefined ||
            patch.pitch !== undefined ||
            patch.roll !== undefined ||
            patch.lift !== undefined)
        ) {
          const posePatch: Partial<SceneItem> = {};
          if (patch.rotation !== undefined) posePatch.rotation = p.items[i].rotation;
          if (patch.screenYaw !== undefined) posePatch.screenYaw = p.items[i].screenYaw;
          if (patch.pitch !== undefined) posePatch.pitch = p.items[i].pitch;
          if (patch.roll !== undefined) posePatch.roll = p.items[i].roll;
          if (patch.lift !== undefined) posePatch.lift = p.items[i].lift;
          const constrained = constrainMonitorPose(
            {
              ...p.items[i],
              rotation: prevItem.rotation,
              screenYaw: prevItem.screenYaw,
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

        const poseOrPosChanged =
          patch.x !== undefined ||
          patch.z !== undefined ||
          patch.wallY !== undefined ||
          patch.lift !== undefined ||
          patch.rotation !== undefined ||
          patch.screenYaw !== undefined ||
          patch.pitch !== undefined ||
          patch.roll !== undefined ||
          patch.monitorArm !== undefined ||
          patch.laptopStand !== undefined ||
          patch.surface !== undefined;
        if (poseOrPosChanged && p.cables?.length && get().collisionEnabled) {
          const prevProject: Project = {
            ...p,
            items: p.items.map((it, idx) => (idx === i ? prevItem : it)),
          };
          const tethered = constrainItemPoseForConnectedCables(prevItem, p.items[i], prevProject);
          if (tethered.hitCable) {
            p.items[i] = tethered.item;
            const fixedLen = tethered.maxTotalM ?? tethered.hitCable.lengthM ?? 1;
            cableTetherNotice = tr(
              `已达固定线缆长度极限（${fixedLen.toFixed(2)} m）：线缆不可拉伸，已限制继续拉远`,
              `Fixed cable length limit (${fixedLen.toFixed(2)} m): cable cannot stretch further`,
            );
          }
        }
      }
    });
    if (cableTetherNotice) {
      set({ collisionNotice: cableTetherNotice });
    } else if (hitMonitorObstacle) {
      set({
        collisionNotice: tr(
          `已限制显示器姿态：避免与「${hitMonitorObstacle}」穿模`,
          `Monitor pose limited to prevent clipping into "${translateObstacleLabel(hitMonitorObstacle, 'en')}"`,
        ),
      });
    } else if (
      patch.rotation !== undefined ||
      patch.pitch !== undefined ||
      patch.roll !== undefined ||
      patch.lift !== undefined ||
      patch.x !== undefined ||
      patch.z !== undefined
    ) {
      if (get().collisionNotice) set({ collisionNotice: null });
    }
  },
  addCable: (cable) => {
    const check = validateCableReachability(cable, get().project);
    if (!check.ok) {
      throw new EditorError(
        check.reason ??
          tr('线缆固定长度不足，无法完成连接。', 'Fixed cable length is too short to reach.'),
      );
    }
    get().endGesture();
    const id = uid();
    get().commit((p) => {
      p.cables = [...(p.cables ?? []), { ...cable, id }];
    });
    return id;
  },
  updateCable: (id, patch) => {
    const current = get().project.cables?.find((c) => c.id === id);
    if (!current) return;
    const candidate = { ...current, ...patch };
    const check = validateCableReachability(candidate, get().project);
    if (!check.ok) {
      throw new EditorError(
        check.reason ??
          tr(
            '所选固定线缆长度不足以覆盖当前走线路径。',
            'Selected fixed cable length cannot cover the current route.',
          ),
      );
    }
    get().commit((p) => {
      if (!p.cables) return;
      const idx = p.cables.findIndex((c) => c.id === id);
      if (idx >= 0) p.cables[idx] = candidate;
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
    const copySuffix = tr(' 副本', ' Copy');
    const maxBase = 80 - copySuffix.length;
    const item: SceneItem = {
      ...clone,
      id: uid(),
      name: original.name.slice(0, maxBase) + copySuffix,
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
          name: attached.name.slice(0, maxBase) + copySuffix,
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
    const valid = localizeProjectInPlace(structuredClone(projectSchema.parse(p)), getLang());
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
      wiringFrom: null,
      wiringTo: null,
      wiringActiveEnd: 'from',
      wiringShortfallM: 0,
      wiringDraft: null,
      wiringPreset: null,
      collisionNotice: null,
      dragPreview: null,
      lampGuides: false,
    });
  },
  syncLanguageNames: (lang) => {
    const s = get();
    const nextProject = localizeProjectInPlace(structuredClone(s.project), lang);
    const nextPast = s.past.map((snap) => localizeProjectInPlace(structuredClone(snap), lang));
    const nextFuture = s.future.map((snap) => localizeProjectInPlace(structuredClone(snap), lang));
    if (gestureBase) {
      gestureBase = localizeProjectInPlace(structuredClone(gestureBase), lang);
    }
    set({
      project: nextProject,
      past: nextPast,
      future: nextFuture,
      collisionNotice: null,
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

useI18n.subscribe((state, prevState) => {
  if (state.lang !== prevState.lang) {
    useEditor.getState().syncLanguageNames(state.lang);
  }
});

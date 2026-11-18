import { useState } from 'react';
import {
  Cable as CableIcon,
  Gamepad2,
  Keyboard,
  Laptop,
  Layers,
  Monitor,
  Mouse,
  Plug,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  cableEffectiveLengths,
  cableKindValues,
  cableMeta,
  type Cable,
  type CableWaypoint,
} from '../domain/cable';
import {
  deskBounds,
  PEGBOARD_WALL_DEFAULT_Y,
  WALL_DEFAULT_COLOR,
  WALL_DEFAULT_GAP,
  WALL_DEFAULT_HEIGHT,
  WALL_MAX_HEIGHT,
} from '../domain/desk';
import { computeCablePath } from '../domain/cableRouting';
import {
  ARM_ELBOW_MAX_YAW_DEG,
  ARM_LOWER_LENGTH,
  ARM_MAX_DY,
  ARM_UPPER_LENGTH,
  ARM_UPPER_PITCH_MAX_DEG,
  ARM_UPPER_PITCH_MIN_DEG,
  applyArmBaseSolutionToProject,
  applyArmSolutionToProject,
  armLimitMessage,
  computeMonitorArmSystem,
  defaultLowerPitchDeg,
  findArmBranchForItem,
  lowerPitchRange,
  suggestedArmClampX,
  type ArmLimitReason,
} from '../domain/monitorArm';
import {
  solveArmBaseMoveWithCollision,
  solveArmElbowSwivelWithCollision,
  solveArmLowerPitchWithCollision,
  solveArmUpperPitchWithCollision,
} from '../domain/collision';
import {
  CONTROLLER_PRESETS,
  controllerPresetById,
  defaultControllerSettings,
  resolveControllerColor,
  type ControllerPreset,
} from '../domain/controller';
import {
  defaultKeyboardSettings,
  KEYBOARD_LAYOUT_SPECS,
  KEYBOARD_THEME_SPECS,
  keyboardLayouts,
  keyboardThemes,
  matchKeyboardLayout,
  resolveKeyboardTheme,
  type KeyboardLayout,
  type KeyboardSettings,
  type KeyboardTheme,
} from '../domain/keyboard';
import {
  armMountedLaptopIds,
  armMountedMonitorIds,
  DEFAULT_INVERTED_HEIGHT,
  DEFAULT_LID_ANGLE,
  DEFAULT_TRAY_ELEVATION,
  DEFAULT_TRAY_TILT_DEG,
  findArmForTrayLaptop,
  gamingLaptopPresets,
  isMacbookPro14ProledSize,
  isMonitorMountedOnArm,
  LAPTOP_STAND_PRESETS,
  MACBOOK_PRO_14_VARIANTS,
  macbookPresets,
  macMiniPresets,
  matchDevicePresetId,
  MAX_LID_ANGLE,
  resolveMacbookColor,
  type LaptopStandModelId,
  type LaptopStandSettings,
  type MonitorArmSettings,
} from '../domain/laptop';
import {
  defaultMouseSettings,
  MOUSE_PRESETS,
  mousePresetById,
  resolveMouseColor,
  type MousePreset,
} from '../domain/mouse';
import {
  matchMousepadSizePreset,
  metersFromMm,
  mm,
  MOUSEPAD_MAX_DEPTH,
  MOUSEPAD_MAX_THICKNESS,
  MOUSEPAD_MAX_WIDTH,
  MOUSEPAD_MIN_DEPTH,
  MOUSEPAD_MIN_THICKNESS,
  MOUSEPAD_MIN_WIDTH,
  MOUSEPAD_SIZE_PRESETS,
  MOUSEPAD_THICKNESS_PRESETS,
} from '../domain/mousepad';
import { devicePorts, isPortKind, type CableKind } from '../domain/ports';
import {
  computePowerStripSize,
  computeWallOutletSize,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  PLUG_SPEC_META,
  plugSpecValues,
  POWER_OUTLET_LABELS,
  POWER_STRIP_LAYOUT_META,
  powerOutletTypeValues,
  powerStripLayoutValues,
  WALL_OUTLET_DEFAULT_Y,
  type PlugSpecKind,
  type PowerStripSettings,
  type WallOutletSettings,
} from '../domain/power';
import {
  defaultSpeakerSettings,
  SPEAKER_PRESETS,
  SPEAKER_ROLE_LABELS,
  speakerPresetById,
  speakerRoleValues,
  type SpeakerSettings,
} from '../domain/speaker';
import { cm, meters, type SceneItem } from '../domain/project';
import { useEditor } from '../store/editorStore';
import { NumberField } from './NumberField';

export function SurfacePlacementField({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, updateItem, commit } = useEditor();
  if (
    project.desk.return ||
    !project.desk.shelf?.enabled ||
    item.kind === 'screenLamp' ||
    item.kind === 'monitorArm' ||
    item.kind === 'powerStrip' ||
    item.kind === 'wallOutlet' ||
    (item.kind === 'pegboard' && item.surface === 'wall')
  ) {
    return null;
  }
  const onShelf = item.surface === 'shelf';
  return (
    <section className="property-section">
      <h4>
        <Layers size={15} /> 放置层面
      </h4>
      <div className="desk-shape-presets" role="group" aria-label="放置层面">
        <button
          type="button"
          className={!onShelf ? 'active' : ''}
          aria-pressed={!onShelf}
          onClick={() => onSafe(() => updateItem(item.id, { surface: undefined }))}
        >
          主桌面
        </button>
        <button
          type="button"
          className={onShelf ? 'active' : ''}
          aria-pressed={onShelf}
          onClick={() => onSafe(() => updateItem(item.id, { surface: 'shelf' }))}
        >
          等宽层架
        </button>
      </div>
    </section>
  );
}

export function PegboardInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, commit, updateItem } = useEditor();
  if (item.kind !== 'pegboard') return null;

  const isWall = item.surface === 'wall';
  const maxWallY = Math.max(
    5,
    cm((project.desk.backWall?.height ?? WALL_MAX_HEIGHT) - item.size.height),
  );

  function setMountMode(wall: boolean) {
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        const target = p.items.find((i) => i.id === item.id);
        if (!target) return;
        if (wall) {
          if (!p.desk.backWall?.enabled) {
            p.desk.backWall = {
              enabled: true,
              height: p.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
              gap: p.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
              color: p.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
            };
          }
          target.surface = 'wall';
          target.rotation = 0;
          target.wallY = target.wallY ?? PEGBOARD_WALL_DEFAULT_Y;
        } else {
          delete target.surface;
          delete target.wallY;
          target.z = Math.max(-p.desk.depth / 2 + target.size.depth / 2 + 0.04, target.z);
        }
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Layers size={15} /> 安装方式
      </h4>
      <div className="desk-shape-presets" role="group" aria-label="洞洞板安装方式">
        <button
          type="button"
          className={!isWall ? 'active' : ''}
          aria-pressed={!isWall}
          onClick={() => setMountMode(false)}
        >
          桌面立放
        </button>
        <button
          type="button"
          className={isWall ? 'active' : ''}
          aria-pressed={isWall}
          onClick={() => setMountMode(true)}
        >
          墙面壁挂
        </button>
      </div>
      {isWall && (
        <div style={{ marginTop: 10 }}>
          <NumberField
            label="挂墙高度（距桌面）"
            value={cm(item.wallY ?? PEGBOARD_WALL_DEFAULT_Y)}
            min={2}
            max={maxWallY}
            step={1}
            onChange={(v) => onSafe(() => updateItem(item.id, { wallY: meters(v) }))}
          />
        </div>
      )}
      <p className="field-note">
        {isWall
          ? '壁挂模式自动隐藏桌腿、配备墙面横挂导轨与支距垫，可直接沿墙面上下左右拖动定位（未开墙面将自动开启桌后墙体）。'
          : '桌面模式底部带防滑支架脚，支持在桌面自由拖动与旋转角度。'}
      </p>
    </section>
  );
}

export function LaptopInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, updateItem } = useEditor();
  const isGaming = item.kind === 'gamingLaptop';
  const isMacbook = item.kind === 'macbook';
  const isMacMini = item.kind === 'macMini';
  if (!isGaming && !isMacbook && !isMacMini) return null;

  const presets = isGaming ? gamingLaptopPresets : isMacbook ? macbookPresets : macMiniPresets;
  const isPro14Proled = isMacbook && isMacbookPro14ProledSize(item.size);
  const activePreset = matchDevicePresetId(presets, item.size) ?? (isPro14Proled ? 'pro14' : null);
  const boundStand = project.items.find(
    (other) => other.kind === 'laptopStand' && other.laptopStand?.laptopId === item.id,
  );
  const isVertical = boundStand?.laptopStand?.mode === 'vertical';

  return (
    <section className="property-section">
      <h4>
        <Laptop size={15} /> {isMacMini ? '机型尺寸预设' : '机型与屏幕开合'}
      </h4>
      <div className="monitor-presets wrap-presets" role="group" aria-label="机型尺寸预设">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={activePreset === p.id ? 'active' : ''}
            onClick={() =>
              onSafe(() =>
                updateItem(item.id, {
                  size: { ...p.size },
                  ...(isMacbook ? { color: resolveMacbookColor(p.size, item.color) } : {}),
                }),
              )
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      {isMacbook && activePreset === 'pro14' && (
        <div
          className="desk-shape-presets"
          role="group"
          aria-label="14 寸 MacBook Pro 机身版本"
          style={{ marginTop: 8 }}
        >
          {([MACBOOK_PRO_14_VARIANTS.standard, MACBOOK_PRO_14_VARIANTS.proled] as const).map(
            (variant) => {
              const active = variant.id === 'proled' ? isPro14Proled : !isPro14Proled;
              return (
                <button
                  key={variant.id}
                  type="button"
                  className={active ? 'active' : ''}
                  aria-pressed={active}
                  title={variant.summary}
                  onClick={() =>
                    onSafe(() =>
                      updateItem(item.id, {
                        size: { ...variant.size },
                        color: resolveMacbookColor(variant.size, item.color),
                      }),
                    )
                  }
                >
                  {variant.label}
                </button>
              );
            },
          )}
        </div>
      )}
      {(isGaming || isMacbook) && (
        <div style={{ marginTop: 14 }}>
          <NumberField
            label="屏幕开合角"
            value={isVertical ? 0 : (item.lidAngle ?? DEFAULT_LID_ANGLE)}
            min={0}
            max={MAX_LID_ANGLE}
            step={2}
            unit="°"
            onChange={(v) => onSafe(() => updateItem(item.id, { lidAngle: v }))}
          />
          {boundStand && (
            <p className="field-note">
              当前已放置于「{boundStand.name}」
              {isVertical ? '（立式收纳已自动合盖）' : '，随支架同步移动'}。
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function LaptopStandInspector({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, updateItem } = useEditor();
  const stand = item.laptopStand;
  if (!stand) return null;

  const laptops = project.items.filter((i) => i.kind === 'gamingLaptop' || i.kind === 'macbook');
  const activeModel: LaptopStandModelId = stand.model ?? 'curveFlex';
  const preset = LAPTOP_STAND_PRESETS[activeModel];

  function update(patch: Partial<LaptopStandSettings>) {
    onSafe(() => updateItem(item.id, { laptopStand: { ...stand!, ...patch } }));
  }

  function selectStandModel(modelId: LaptopStandModelId) {
    const nextSpec = LAPTOP_STAND_PRESETS[modelId];
    onSafe(() =>
      updateItem(item.id, {
        size: { ...nextSpec.size },
        laptopStand: {
          ...stand!,
          model: modelId,
          mode: 'tilted',
          elevation: nextSpec.elevation,
          tiltDeg: nextSpec.tiltDeg,
        },
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Laptop size={15} /> 支架模式与承托设备
      </h4>
      <div className="desk-shape-presets" role="group" aria-label="笔记本支架模式">
        <button
          type="button"
          className={stand.mode === 'tilted' ? 'active' : ''}
          aria-pressed={stand.mode === 'tilted'}
          onClick={() => update({ mode: 'tilted' })}
        >
          斜面增高
        </button>
        <button
          type="button"
          className={stand.mode === 'vertical' ? 'active' : ''}
          aria-pressed={stand.mode === 'vertical'}
          onClick={() => update({ mode: 'vertical' })}
        >
          立式收纳
        </button>
      </div>

      {stand.mode === 'tilted' && (
        <div style={{ marginTop: 12 }}>
          <div className="desk-shape-presets" role="group" aria-label="笔记本支架款式">
            {(['curveFlex', 'mStand'] as const).map((modelId) => (
              <button
                key={modelId}
                type="button"
                className={activeModel === modelId ? 'active' : ''}
                aria-pressed={activeModel === modelId}
                onClick={() => selectStandModel(modelId)}
              >
                {LAPTOP_STAND_PRESETS[modelId].label}
              </button>
            ))}
          </div>
          <p className="field-note" style={{ marginTop: 6 }}>
            {preset.note}
          </p>
        </div>
      )}

      <label className="text-field" style={{ marginTop: 14 }}>
        承托笔记本
        <select
          aria-label="承托笔记本"
          className="inspector-select"
          value={stand.laptopId ?? ''}
          onChange={(e) => update({ laptopId: e.target.value || undefined })}
        >
          <option value="">暂不绑定笔记本</option>
          {laptops.map((lap) => {
            const occupied = project.items.some(
              (other) => other.id !== item.id && other.laptopStand?.laptopId === lap.id,
            );
            return (
              <option key={lap.id} value={lap.id} disabled={occupied}>
                {lap.name}
                {occupied ? '（已在其他支架上）' : ''}
              </option>
            );
          })}
        </select>
      </label>

      {stand.mode === 'tilted' && activeModel === 'curveFlex' && (
        <div className="field-grid" style={{ marginTop: 14 }}>
          <NumberField
            label="抬高高度"
            value={cm(stand.elevation)}
            min={3}
            max={27.4}
            step={0.5}
            onChange={(v) => update({ elevation: meters(v) })}
          />
          <NumberField
            label="倾斜角度"
            value={stand.tiltDeg}
            min={0}
            max={45}
            step={1}
            unit="°"
            onChange={(v) => update({ tiltDeg: v })}
          />
        </div>
      )}
      <p className="field-note">
        {stand.mode === 'vertical'
          ? '立式收纳会将绑定的笔记本自动合盖并竖直夹持在底座槽内。'
          : activeModel === 'mStand'
            ? '一体成形铝合金 150 mm 固定高度与 18° 人体工学倾角，后部配备 Ø50.8 mm 理线孔。'
            : '拖动或旋转支架时，绑定的笔记本会随之同步抬高与倾斜（支持 30–274 mm 高度与 0°–45° 倾角）。'}
      </p>
    </section>
  );
}

export function MonitorArmInspector({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, updateItem, collisionEnabled, setCollisionNotice } = useEditor();
  const arm = item.monitorArm;
  if (!arm) return null;

  const monitors = project.items.filter((i) => i.kind === 'monitor');
  const laptops = project.items.filter((i) => i.kind === 'gamingLaptop' || i.kind === 'macbook');
  const others = project.items.filter((i) => i.id !== item.id);

  const armStyle = arm.armStyle ?? 'single';
  const orientation = arm.mountOrientation ?? 'upright';
  const primaryKind = arm.primaryKind ?? 'monitor';
  const secondaryKind = arm.secondaryKind ?? 'none';
  const hasTray =
    primaryKind === 'laptopTray' || (armStyle === 'dual' && secondaryKind === 'laptopTray');
  const firstTrayLaptop = laptops.find((l) => armMountedLaptopIds(arm).includes(l.id));

  const mountedTargets = [...armMountedMonitorIds(arm), ...armMountedLaptopIds(arm)]
    .map((tid) => project.items.find((i) => i.id === tid))
    .filter((x): x is SceneItem => Boolean(x));
  const armSys = computeMonitorArmSystem(item, project.items, project.desk);
  const bounds = deskBounds(project.desk);
  const clampMinXCm = Math.round((bounds.minX + 0.03) * 100);
  const clampMaxXCm = Math.round((bounds.maxX - 0.03) * 100);
  const clampMinZCm = Math.round((bounds.minZ + 0.03) * 100);
  const clampMaxZCm = Math.round((bounds.maxZ - 0.06) * 100);

  function commitBaseMove(
    desiredX: number,
    desiredZ: number,
    options?: { forcedEdge?: 'back' | 'left' | 'right' | 'surface'; snapToEdges?: boolean },
  ) {
    const solved = solveArmBaseMoveWithCollision({
      arm: item,
      desk: project.desk,
      allItems: project.items,
      desiredX,
      desiredZ,
      forcedEdge: options?.forcedEdge,
      snapToEdges: options?.snapToEdges ?? true,
      collisionEnabled,
    });
    onSafe(() => {
      useEditor.getState().commit((p) => applyArmBaseSolutionToProject(p, item.id, solved));
      if (solved.limitReason) {
        setCollisionNotice(armLimitMessage(solved.limitReason, undefined, solved.obstacleName));
      } else {
        setCollisionNotice(null);
      }
    });
  }

  function update(patch: Partial<MonitorArmSettings>) {
    onSafe(() => updateItem(item.id, { monitorArm: { ...arm!, ...patch } }));
  }

  function isMonitorBusy(mId: string, selfRole: 'primary' | 'secondary') {
    if (isMonitorMountedOnArm(mId, others)) return true;
    return selfRole === 'primary'
      ? armStyle === 'dual' && secondaryKind === 'monitor' && arm!.secondaryMonitorId === mId
      : primaryKind === 'monitor' && arm!.monitorId === mId;
  }

  function isLaptopBusy(lId: string, selfRole: 'primary' | 'secondary') {
    if (
      others.some((o) => o.laptopStand?.laptopId === lId) ||
      Boolean(findArmForTrayLaptop(lId, others))
    )
      return true;
    return selfRole === 'primary'
      ? armStyle === 'dual' && secondaryKind === 'laptopTray' && arm!.secondaryLaptopId === lId
      : primaryKind === 'laptopTray' && arm!.primaryLaptopId === lId;
  }

  function switchArmStyle(nextStyle: 'single' | 'dual') {
    if (nextStyle === 'single') {
      update({
        armStyle: 'single',
        secondaryKind: 'none',
        secondaryMonitorId: undefined,
        secondaryLaptopId: undefined,
      });
      return;
    }
    const freeMonitor = monitors.find((m) => !isMonitorBusy(m.id, 'secondary'));
    const freeLaptop = laptops.find((l) => !isLaptopBusy(l.id, 'secondary'));
    if (freeMonitor) {
      const nextTargets = [...mountedTargets, freeMonitor];
      update({
        armStyle: 'dual',
        clampX: suggestedArmClampX(nextTargets, arm!.clampSide, project.desk, armSys.clampX),
        secondaryKind: 'monitor',
        secondaryMonitorId: freeMonitor.id,
        secondaryLaptopId: undefined,
      });
    } else if (freeLaptop) {
      const nextTargets = [...mountedTargets, freeLaptop];
      update({
        armStyle: 'dual',
        clampX: suggestedArmClampX(nextTargets, arm!.clampSide, project.desk, armSys.clampX),
        secondaryKind: 'laptopTray',
        secondaryLaptopId: freeLaptop.id,
        secondaryMonitorId: undefined,
      });
    } else {
      update({ armStyle: 'dual', secondaryKind: 'none' });
    }
  }

  function switchPrimaryKind(nextKind: 'monitor' | 'laptopTray') {
    if (nextKind === primaryKind) return;
    if (nextKind === 'monitor') {
      const m = monitors.find((cand) => !isMonitorBusy(cand.id, 'primary'));
      if (!m) {
        onSafe(() => {
          throw new Error('没有空闲显示器可挂载到主臂，请先添加一台显示器。');
        });
        return;
      }
      update({ primaryKind: 'monitor', monitorId: m.id, primaryLaptopId: undefined });
    } else {
      const l = laptops.find((cand) => !isLaptopBusy(cand.id, 'primary'));
      if (!l) {
        onSafe(() => {
          throw new Error('没有空闲笔记本可放置到主臂托盘，请先添加一台笔记本。');
        });
        return;
      }
      update({ primaryKind: 'laptopTray', primaryLaptopId: l.id, monitorId: undefined });
    }
  }

  function switchSecondaryKind(nextKind: 'none' | 'monitor' | 'laptopTray') {
    if (nextKind === 'none') {
      update({
        secondaryKind: 'none',
        secondaryMonitorId: undefined,
        secondaryLaptopId: undefined,
      });
      return;
    }
    if (nextKind === 'monitor') {
      const m = monitors.find((cand) => !isMonitorBusy(cand.id, 'secondary'));
      if (!m) {
        onSafe(() => {
          throw new Error('没有空闲的第二台显示器，请先添加到场景。');
        });
        return;
      }
      update({ secondaryKind: 'monitor', secondaryMonitorId: m.id, secondaryLaptopId: undefined });
    } else {
      const l = laptops.find((cand) => !isLaptopBusy(cand.id, 'secondary'));
      if (!l) {
        onSafe(() => {
          throw new Error('没有空闲笔记本可放置在 NB 托盘上，请先添加游戏本或 MacBook。');
        });
        return;
      }
      update({
        secondaryKind: 'laptopTray',
        secondaryLaptopId: l.id,
        secondaryMonitorId: undefined,
      });
    }
  }

  const clampSpanCm = firstTrayLaptop
    ? Math.min(42, Math.max(22, Math.round((firstTrayLaptop.size.width + 0.006) * 1000) / 10))
    : null;

  return (
    <section className="property-section">
      <h4>
        <Monitor size={15} /> 支架臂结构与安装方式
      </h4>

      <div style={{ marginTop: 6 }}>
        <span className="field-label-small">臂体结构</span>
        <div className="desk-shape-presets" role="group" aria-label="支架臂体结构">
          {(
            [
              { value: 'single', label: '单支架臂' },
              { value: 'dual', label: '双支架臂' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={armStyle === opt.value ? 'active' : ''}
              aria-pressed={armStyle === opt.value}
              onClick={() => switchArmStyle(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="field-label-small">安装方式</span>
        <div className="desk-shape-presets" role="group" aria-label="支架臂安装方式">
          {(
            [
              { value: 'upright', label: '正装桌缘' },
              { value: 'inverted', label: '倒挂悬吊' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={orientation === opt.value ? 'active' : ''}
              aria-pressed={orientation === opt.value}
              onClick={() => update({ mountOrientation: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {orientation === 'inverted' && (
        <div style={{ marginTop: 10 }}>
          <NumberField
            label="倒挂横梁高度"
            value={cm(arm.invertedHeight ?? DEFAULT_INVERTED_HEIGHT)}
            min={45}
            max={85}
            step={1}
            onChange={(v) => update({ invertedHeight: meters(v) })}
          />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <span className="field-label-small">支架底座位置（支持 3D 视口直接拖拽移动）</span>
        {orientation === 'upright' && (
          <div
            className="desk-shape-presets"
            role="group"
            aria-label="底座安装边沿"
            style={{ marginBottom: 8 }}
          >
            {(
              [
                { value: 'back', label: '后桌缘' },
                { value: 'left', label: '左桌缘' },
                { value: 'right', label: '右桌缘' },
                { value: 'surface', label: '桌面自由' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={armSys.clampEdge === opt.value ? 'active' : ''}
                aria-pressed={armSys.clampEdge === opt.value}
                onClick={() => {
                  const targetZ =
                    opt.value === 'surface' && armSys.clampEdge === 'back'
                      ? Math.max(-project.desk.depth / 2 + 0.14, armSys.clampZ)
                      : armSys.clampZ;
                  const targetX =
                    opt.value === 'surface' &&
                    (armSys.clampEdge === 'left' || armSys.clampEdge === 'right')
                      ? 0
                      : armSys.clampX;
                  commitBaseMove(targetX, targetZ, { forcedEdge: opt.value, snapToEdges: false });
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <div className="desk-shape-presets" role="group" aria-label="桌缘夹持方位">
          {(
            [
              { value: 'left', label: '偏左' },
              { value: 'center', label: '居中' },
              { value: 'right', label: '偏右' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={arm.clampSide === opt.value ? 'active' : ''}
              aria-pressed={arm.clampSide === opt.value}
              onClick={() =>
                update({
                  clampSide: opt.value,
                  clampEdge: 'back',
                  clampZ: undefined,
                  clampX: suggestedArmClampX(
                    mountedTargets,
                    opt.value,
                    project.desk,
                    armSys.clampX,
                  ),
                })
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="field-grid" style={{ marginTop: 8 }}>
          <NumberField
            label="底座左右位置"
            value={cm(armSys.clampX)}
            min={clampMinXCm}
            max={clampMaxXCm}
            step={1}
            unit="cm"
            onChange={(v) =>
              commitBaseMove(meters(v), armSys.clampZ, {
                forcedEdge:
                  armSys.clampEdge === 'left' || armSys.clampEdge === 'right'
                    ? 'surface'
                    : armSys.clampEdge,
                snapToEdges: armSys.clampEdge === 'surface',
              })
            }
          />
          {orientation === 'upright' && (
            <NumberField
              label="底座前后位置"
              value={cm(armSys.clampZ)}
              min={clampMinZCm}
              max={clampMaxZCm}
              step={1}
              unit="cm"
              onChange={(v) =>
                commitBaseMove(armSys.clampX, meters(v), {
                  forcedEdge:
                    armSys.clampEdge === 'back' && meters(v) > -project.desk.depth / 2 + 0.06
                      ? 'surface'
                      : armSys.clampEdge,
                  snapToEdges: armSys.clampEdge !== 'left' && armSys.clampEdge !== 'right',
                })
              }
            />
          )}
        </div>
        <p className="field-note">
          固定机械参数：下长臂 {(ARM_LOWER_LENGTH * 100).toFixed(1)} cm · 气压上臂{' '}
          {(ARM_UPPER_LENGTH * 100).toFixed(1)} cm · 单段仰角行程 ±{(ARM_MAX_DY * 100).toFixed(1)}{' '}
          cm （可直接拖动底座移至后/左/右桌缘或桌面穿孔位置；拖动屏幕时底座锚定不漂移）。
        </p>
      </div>

      <div style={{ marginTop: 14 }}>
        <span className="field-label-small">主臂挂载设备</span>
        <div className="desk-shape-presets" role="group" aria-label="主臂挂载类型">
          <button
            type="button"
            className={primaryKind === 'monitor' ? 'active' : ''}
            aria-pressed={primaryKind === 'monitor'}
            onClick={() => switchPrimaryKind('monitor')}
          >
            显示器
          </button>
          <button
            type="button"
            className={primaryKind === 'laptopTray' ? 'active' : ''}
            aria-pressed={primaryKind === 'laptopTray'}
            onClick={() => switchPrimaryKind('laptopTray')}
          >
            NB 笔记本托盘
          </button>
        </div>

        {primaryKind === 'monitor' ? (
          <select
            aria-label="主臂挂载显示器"
            className="inspector-select"
            style={{ marginTop: 8 }}
            value={arm.monitorId ?? ''}
            onChange={(e) => update({ monitorId: e.target.value })}
          >
            {monitors.map((m) => {
              const occupied = isMonitorBusy(m.id, 'primary');
              return (
                <option key={m.id} value={m.id} disabled={occupied}>
                  {m.name}
                  {occupied ? '（已被占用）' : ''}
                </option>
              );
            })}
          </select>
        ) : (
          <select
            aria-label="主臂托盘笔记本"
            className="inspector-select"
            style={{ marginTop: 8 }}
            value={arm.primaryLaptopId ?? ''}
            onChange={(e) => update({ primaryLaptopId: e.target.value })}
          >
            {laptops.map((l) => {
              const occupied = isLaptopBusy(l.id, 'primary');
              return (
                <option key={l.id} value={l.id} disabled={occupied}>
                  {l.name}
                  {occupied ? '（已被占用）' : ''}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {armStyle === 'dual' && (
        <div style={{ marginTop: 14 }}>
          <span className="field-label-small">副臂挂载设备</span>
          <div className="desk-shape-presets" role="group" aria-label="副臂挂载类型">
            <button
              type="button"
              className={secondaryKind === 'monitor' ? 'active' : ''}
              aria-pressed={secondaryKind === 'monitor'}
              onClick={() => switchSecondaryKind('monitor')}
            >
              显示器
            </button>
            <button
              type="button"
              className={secondaryKind === 'laptopTray' ? 'active' : ''}
              aria-pressed={secondaryKind === 'laptopTray'}
              onClick={() => switchSecondaryKind('laptopTray')}
            >
              NB 笔记本托盘
            </button>
            <button
              type="button"
              className={secondaryKind === 'none' ? 'active' : ''}
              aria-pressed={secondaryKind === 'none'}
              onClick={() => switchSecondaryKind('none')}
            >
              暂空
            </button>
          </div>

          {secondaryKind === 'monitor' && (
            <select
              aria-label="副臂挂载显示器"
              className="inspector-select"
              style={{ marginTop: 8 }}
              value={arm.secondaryMonitorId ?? ''}
              onChange={(e) => update({ secondaryMonitorId: e.target.value })}
            >
              {monitors.map((m) => {
                const occupied = isMonitorBusy(m.id, 'secondary');
                return (
                  <option key={m.id} value={m.id} disabled={occupied}>
                    {m.name}
                    {occupied ? '（已被占用）' : ''}
                  </option>
                );
              })}
            </select>
          )}

          {secondaryKind === 'laptopTray' && (
            <select
              aria-label="副臂托盘笔记本"
              className="inspector-select"
              style={{ marginTop: 8 }}
              value={arm.secondaryLaptopId ?? ''}
              onChange={(e) => update({ secondaryLaptopId: e.target.value })}
            >
              {laptops.map((l) => {
                const occupied = isLaptopBusy(l.id, 'secondary');
                return (
                  <option key={l.id} value={l.id} disabled={occupied}>
                    {l.name}
                    {occupied ? '（已被占用）' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      )}

      {hasTray && (
        <div style={{ marginTop: 14 }}>
          <span className="field-label-small">NB FP-2 笔记本托盘姿态</span>
          <div className="field-grid">
            <NumberField
              label="托盘悬停高度"
              value={cm(arm.trayElevation ?? DEFAULT_TRAY_ELEVATION)}
              min={10}
              max={50}
              step={1}
              onChange={(v) => update({ trayElevation: meters(v) })}
            />
            <NumberField
              label="托盘前倾角度"
              value={arm.trayTiltDeg ?? DEFAULT_TRAY_TILT_DEG}
              min={0}
              max={45}
              step={1}
              unit="°"
              onChange={(v) => update({ trayTiltDeg: v })}
            />
          </div>
          {clampSpanCm !== null && (
            <p className="field-note">
              NB FP-2 冲压散热托盘（VESA 100×100），夹臂已自动扩展至 {clampSpanCm} cm（支持 22–42 cm
              机宽与底部防滑托爪）。拖动笔记本可直接调整悬停桌面位置。
            </p>
          )}
        </div>
      )}

      {armSys.branches.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span className="field-label-small">
            双段机械臂活动度（支持 3D 水平 / 竖直手柄直接拖拽）
          </span>
          {armSys.branches.map((branch) => {
            const isPrimary = branch.role === 'primary';
            const prefix = isPrimary ? '主臂' : '副臂';
            const field = isPrimary ? 'primaryElbowBend' : 'secondaryElbowBend';
            const groupLabel = `${prefix}肘关节方位`;
            const angleLabel = `${prefix}水平摆角`;
            const lowerPitchLabel = `${prefix}下臂俯仰角`;
            const upperPitchLabel = `${prefix}上臂俯仰角`;
            const lowerRange = lowerPitchRange(armSys.isInverted);
            const commitBranchSolution = (
              solved: {
                targetId: string;
                x: number;
                z: number;
                bend: 'left' | 'right';
                lowerPitchDeg?: number;
                lift?: number;
                trayElevation?: number;
                limitReason?: ArmLimitReason;
                obstacleName?: string;
              },
              includeLowerPitch: boolean,
            ) => {
              onSafe(() => {
                useEditor
                  .getState()
                  .commit((p) =>
                    applyArmSolutionToProject(p, item.id, branch.role, solved, includeLowerPitch),
                  );
                if (solved.limitReason) {
                  setCollisionNotice(
                    armLimitMessage(solved.limitReason, undefined, solved.obstacleName),
                  );
                } else {
                  setCollisionNotice(null);
                }
              });
            };
            const commitLowerPitch = (desiredPitchDeg: number) => {
              const solved = solveArmLowerPitchWithCollision({
                arm: item,
                branch,
                desiredPitchDeg,
                desk: project.desk,
                allItems: project.items,
                collisionEnabled,
              });
              commitBranchSolution(solved, true);
            };
            const commitUpperPitch = (desiredUpperPitchDeg: number) => {
              const solved = solveArmUpperPitchWithCollision({
                arm: item,
                branch,
                desiredUpperPitchDeg,
                desk: project.desk,
                allItems: project.items,
                collisionEnabled,
              });
              commitBranchSolution(solved, false);
            };
            return (
              <div key={`elbow-${branch.role}`} style={{ marginTop: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span className="field-label-small" style={{ opacity: 0.82 }}>
                    {prefix}：{branch.target.name}（折向{' '}
                    {branch.elbowActiveSide === 'left' ? '左' : '右'}）
                  </span>
                  <button
                    type="button"
                    className="inspector-mini-btn"
                    title="恢复下长臂出厂默认仰角"
                    onClick={() => commitLowerPitch(defaultLowerPitchDeg(armSys.isInverted))}
                  >
                    <RotateCcw size={12} />
                    归位下臂
                  </button>
                </div>
                <div className="desk-shape-presets" role="group" aria-label={groupLabel}>
                  {(
                    [
                      { key: 'auto', label: '自动', value: 'auto' },
                      { key: 'left', label: '左折', value: 'left' },
                      { key: 'right', label: '右折', value: 'right' },
                    ] as const
                  ).map((opt) => {
                    const active = branch.elbowBend === opt.value;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={active ? 'active' : ''}
                        aria-pressed={active}
                        onClick={() =>
                          update({ [field]: opt.value === 'auto' ? undefined : opt.value })
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="field-grid" style={{ marginTop: 8 }}>
                  <NumberField
                    label={lowerPitchLabel}
                    value={branch.lowerPitchDeg}
                    min={lowerRange.minDeg}
                    max={lowerRange.maxDeg}
                    step={1}
                    unit="°"
                    onChange={commitLowerPitch}
                  />
                  <NumberField
                    label={upperPitchLabel}
                    value={branch.upperPitchDeg}
                    min={ARM_UPPER_PITCH_MIN_DEG}
                    max={ARM_UPPER_PITCH_MAX_DEG}
                    step={1}
                    unit="°"
                    onChange={commitUpperPitch}
                  />
                  <NumberField
                    label={angleLabel}
                    value={Math.round(branch.lowerYawDeg)}
                    min={-ARM_ELBOW_MAX_YAW_DEG}
                    max={ARM_ELBOW_MAX_YAW_DEG}
                    step={1}
                    unit="°"
                    onChange={(v) => {
                      const solved = solveArmElbowSwivelWithCollision({
                        arm: item,
                        branch,
                        desiredYawDeg: v,
                        desk: project.desk,
                        allItems: project.items,
                        collisionEnabled,
                      });
                      commitBranchSolution(solved, false);
                    }}
                  />
                </div>
                <p className="field-note" style={{ marginTop: 4 }}>
                  当前实时工作半径 {(branch.reachDistance * 100).toFixed(1)} cm（物理可达域{' '}
                  {(branch.dMin * 100).toFixed(1)}–{(branch.dMax * 100).toFixed(1)} cm）
                  {branch.clamped && branch.limitReason
                    ? ` · ${armLimitMessage(branch.limitReason)}`
                    : ''}
                </p>
              </div>
            );
          })}
          <p className="field-note">
            下长臂（27.5 cm）与气压上臂（30.5 cm）均支持独立上下俯仰与水平旋转；两段臂长刚性不可变，
            下压或伸展时自动避让桌面、横梁、墙面与桌面物品（如音箱）。
          </p>
        </div>
      )}

      <label className="lamp-switch" style={{ marginTop: 14 }}>
        <span>开启臂身理线槽</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="开启臂身理线槽"
          checked={arm.cableClip}
          onChange={(e) => update({ cableClip: e.target.checked })}
        />
      </label>
      <p className="field-note">
        支持单/双支架臂、正装桌缘与倒挂龙门横梁；已挂载显示器自动隐藏原装底座并沿双长臂理线槽走线。
      </p>
    </section>
  );
}

function CableWaypointList({
  cable,
  fallbackPoints,
  onSafe,
}: {
  cable: Cable;
  fallbackPoints: CableWaypoint[];
  onSafe: (fn: () => void) => void;
}) {
  const {
    selectedCableId,
    selectedWaypointIdx,
    selectCable,
    updateCableWaypoint,
    insertCableWaypoint,
    removeCableWaypoint,
    resetCableWaypoints,
  } = useEditor();
  const [expanded, setExpanded] = useState(false);
  const isOpen = expanded || selectedCableId === cable.id;
  const activePoints = (
    cable.waypoints?.length ? cable.waypoints : fallbackPoints
  ) as CableWaypoint[];
  const isCustom = Boolean(cable.waypoints?.length);

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}
      >
        <button
          type="button"
          className={isOpen ? 'active' : ''}
          aria-pressed={isOpen}
          style={{ fontSize: 12, padding: '3px 8px' }}
          onClick={() => {
            const next = !isOpen;
            setExpanded(next);
            selectCable(next ? cable.id : null);
          }}
        >
          {isOpen ? '收起节点微调' : `节点微调（${activePoints.length} 点）`}
        </button>
        {isCustom && (
          <button
            type="button"
            style={{ fontSize: 11, padding: '3px 7px' }}
            onClick={() => onSafe(() => resetCableWaypoints(cable.id))}
            title="还原为自动避障与穿孔走线"
          >
            <RotateCcw size={11} /> 还原自动走线
          </button>
        )}
      </div>

      {isOpen && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <small style={{ color: '#64748b' }}>
            可在三维场景中直接拖动蓝色节点（按住 Shift 或拖动上方橙色箭头可调上下高度）。
          </small>
          {activePoints.map((pt, idx) => {
            const activeNode = selectedCableId === cable.id && selectedWaypointIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  background: activeNode ? '#eff6ff' : '#f8fafc',
                  border: `1px solid ${activeNode ? '#93c5fd' : '#e2e8f0'}`,
                  borderRadius: 6,
                  padding: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <button
                    type="button"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      color: activeNode ? '#1d4ed8' : '#334155',
                      cursor: 'pointer',
                    }}
                    onClick={() => selectCable(cable.id, idx)}
                  >
                    控制点 #{idx + 1}
                  </button>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      style={{ fontSize: 11, padding: '1px 5px' }}
                      aria-label={`在控制点 ${idx + 1} 后插入节点`}
                      onClick={() => {
                        const next = activePoints[Math.min(activePoints.length - 1, idx + 1)];
                        onSafe(() =>
                          insertCableWaypoint(
                            cable.id,
                            idx,
                            {
                              x: (pt.x + next.x) * 0.5,
                              y: (pt.y + next.y) * 0.5,
                              z: (pt.z + next.z) * 0.5,
                            },
                            fallbackPoints,
                          ),
                        );
                      }}
                    >
                      + 插点
                    </button>
                    {activePoints.length > 1 && (
                      <button
                        type="button"
                        className="danger-text"
                        style={{ fontSize: 11, padding: '1px 5px' }}
                        aria-label={`删除控制点 ${idx + 1}`}
                        onClick={() =>
                          onSafe(() => removeCableWaypoint(cable.id, idx, fallbackPoints))
                        }
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
                <div className="field-grid">
                  <NumberField
                    label="X"
                    value={cm(pt.x)}
                    min={-400}
                    max={400}
                    step={0.5}
                    unit="cm"
                    onChange={(v) =>
                      onSafe(() =>
                        updateCableWaypoint(cable.id, idx, { ...pt, x: meters(v) }, fallbackPoints),
                      )
                    }
                  />
                  <NumberField
                    label="高Y"
                    value={cm(pt.y)}
                    min={1}
                    max={220}
                    step={0.5}
                    unit="cm"
                    onChange={(v) =>
                      onSafe(() =>
                        updateCableWaypoint(cable.id, idx, { ...pt, y: meters(v) }, fallbackPoints),
                      )
                    }
                  />
                  <NumberField
                    label="Z"
                    value={cm(pt.z)}
                    min={-400}
                    max={400}
                    step={0.5}
                    unit="cm"
                    onChange={(v) =>
                      onSafe(() =>
                        updateCableWaypoint(cable.id, idx, { ...pt, z: meters(v) }, fallbackPoints),
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SelectedCableInspectorSection({ onSafe }: { onSafe: (fn: () => void) => void }) {
  const { project, selectedCableId, updateCable, removeCable, selectCable } = useEditor();
  if (!selectedCableId) return null;
  const cable = (project.cables ?? []).find((c) => c.id === selectedCableId);
  if (!cable) return null;

  const spec = cableMeta[cable.kind];
  const resolved = computeCablePath(cable, project);
  const fallbackPoints = resolved
    ? resolved.controlPoints.map((v) => ({ x: v.x, y: v.y, z: v.z }))
    : [];
  const fromEp = cable.from;
  const toEp = cable.to;
  const fromItem =
    fromEp.type === 'device' ? project.items.find((i) => i.id === fromEp.itemId) : undefined;
  const toItem =
    toEp.type === 'device' ? project.items.find((i) => i.id === toEp.itemId) : undefined;
  const hasMonitorStand =
    (fromItem?.kind === 'monitor' || toItem?.kind === 'monitor') && !cable.routeViaArm;

  return (
    <section className="property-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>
          <CableIcon size={15} /> 已选线缆微调
        </h4>
        <button
          type="button"
          className="icon-button danger-text"
          aria-label="拔除所选线缆"
          onClick={() => onSafe(() => removeCable(cable.id))}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <p className="field-note" style={{ marginTop: 0 }}>
        {spec.label} · {fromItem?.name ?? '设备'} → {toItem?.name ?? '桌下走线'}
        {resolved?.passedHoles.length
          ? ` · 已过孔：${resolved.passedHoles.map((h) => h.label).join(' / ')}`
          : ''}
      </p>
      <div className="cable-row-controls" style={{ marginTop: 6 }}>
        {hasMonitorStand && (
          <label className="desk-check">
            <input
              type="checkbox"
              checked={cable.viaStandSlot !== false}
              onChange={(e) =>
                onSafe(() => updateCable(cable.id, { viaStandSlot: e.target.checked }))
              }
            />
            <span>穿显示器底座走线孔</span>
          </label>
        )}
        <select
          aria-label="过桌底与走线孔偏好"
          value={cable.drop ?? (cable.to.type === 'floor' ? cable.to.drop : 'auto')}
          onChange={(e) => {
            const drop = e.target.value as 'auto' | 'grommet' | 'backEdge';
            onSafe(() =>
              updateCable(cable.id, {
                drop,
                ...(cable.to.type === 'floor' ? { to: { type: 'floor', drop } } : {}),
              }),
            );
          }}
        >
          <option value="auto">自动（优先穿桌面走线孔）</option>
          <option value="grommet">强制穿桌面走线孔</option>
          <option value="backEdge">绕桌后缘下垂</option>
        </select>
      </div>
      {resolved && (
        <CableWaypointList cable={cable} fallbackPoints={fallbackPoints} onSafe={onSafe} />
      )}
      <button
        type="button"
        style={{ marginTop: 8, width: '100%' }}
        onClick={() => selectCable(null)}
      >
        完成线缆微调
      </button>
    </section>
  );
}

export function CableConnectionsSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, addCable, updateCable, removeCable, wiringMode, setWiringMode } = useEditor();
  const [customFromPortId, setCustomFromPortId] = useState<string>('');
  const [customTargetKey, setCustomTargetKey] = useState<string>('floor:auto');
  if (!isPortKind(item.kind)) return null;

  const ports = devicePorts(item);
  const effectiveFromPort = ports.find((p) => p.id === customFromPortId) ?? ports[0];
  const relatedCables = (project.cables ?? []).filter(
    (c) =>
      (c.from.type === 'device' && c.from.itemId === item.id) ||
      (c.to.type === 'device' && c.to.itemId === item.id),
  );
  const otherDevices = project.items.filter((i) => i.id !== item.id && isPortKind(i.kind));

  function connectCustomPair() {
    if (!effectiveFromPort) return;
    const rawKind = effectiveFromPort.kind;
    const kind = cableKindValues.includes(rawKind as (typeof cableKindValues)[number])
      ? rawKind
      : 'power';
    const spec = cableMeta[kind];
    if (customTargetKey.startsWith('dev:')) {
      const [, targetId, targetPortId] = customTargetKey.split(':');
      const targetDev = project.items.find((d) => d.id === targetId);
      const isOutlet = targetDev?.kind === 'powerStrip' || targetDev?.kind === 'wallOutlet';
      const defaultPlug =
        isOutlet && targetPortId.startsWith('slot-')
          ? kind === 'power'
            ? 'cn3Pin'
            : kind === 'usbc'
              ? 'ganAdapter'
              : undefined
          : undefined;
      onSafe(() =>
        addCable({
          kind,
          from: { type: 'device', itemId: item.id, portId: effectiveFromPort.id },
          to: { type: 'device', itemId: targetId, portId: targetPortId },
          routeViaArm: true,
          viaStandSlot: true,
          color: spec.color,
          lengthM: spec.defaultLengthM,
          lengthIncludesConnectors: true,
          ...(defaultPlug ? { toPlugType: defaultPlug } : {}),
        }),
      );
    } else {
      const drop = (customTargetKey.split(':')[1] ?? 'auto') as 'auto' | 'grommet' | 'backEdge';
      onSafe(() =>
        addCable({
          kind,
          from: { type: 'device', itemId: item.id, portId: effectiveFromPort.id },
          to: { type: 'floor', drop },
          drop,
          routeViaArm: true,
          viaStandSlot: true,
          color: spec.color,
          lengthM: spec.defaultLengthM,
          lengthIncludesConnectors: true,
        }),
      );
    }
  }

  function quickConnect(kind: CableKind) {
    const sourcePort =
      ports.find((p) => p.kind === kind && p.id === 'ac-in') ??
      ports.find((p) => p.kind === kind) ??
      ports[0];
    if (!sourcePort) return;

    const usedPorts = new Set<string>();
    for (const c of project.cables ?? []) {
      if (c.from.type === 'device') usedPorts.add(`${c.from.itemId}:${c.from.portId}`);
      if (c.to.type === 'device') usedPorts.add(`${c.to.itemId}:${c.to.portId}`);
    }

    const isOutletItem = item.kind === 'powerStrip' || item.kind === 'wallOutlet';
    const isVideoOrData = kind === 'dp' || kind === 'hdmi' || kind === 'usbc';
    const isAudioSignal =
      kind === 'aux35' || kind === 'rca' || kind === 'optical' || kind === 'trs635';

    let hostDevice =
      !isOutletItem && kind === 'power'
        ? otherDevices.find(
            (d) =>
              (d.kind === 'powerStrip' || d.kind === 'wallOutlet') &&
              devicePorts(d).some(
                (p) =>
                  p.kind === 'power' &&
                  p.id.startsWith('slot-') &&
                  !usedPorts.has(`${d.id}:${p.id}`),
              ),
          )
        : kind === 'speakerWire'
          ? otherDevices.find(
              (d) =>
                d.kind === 'speaker' &&
                devicePorts(d).some(
                  (p) => p.kind === 'speakerWire' && !usedPorts.has(`${d.id}:${p.id}`),
                ),
            )
          : isAudioSignal
            ? otherDevices.find(
                (d) =>
                  d.kind !== 'speaker' &&
                  devicePorts(d).some(
                    (p) =>
                      (p.kind === kind || (kind === 'rca' && p.kind === 'aux35')) &&
                      !usedPorts.has(`${d.id}:${p.id}`),
                  ),
              )
            : isVideoOrData
              ? otherDevices.find(
                  (d) =>
                    d.kind !== item.kind &&
                    !(
                      item.kind === 'speaker' &&
                      (d.kind === 'powerStrip' || d.kind === 'wallOutlet')
                    ) &&
                    devicePorts(d).some(
                      (p) => p.kind === kind || (item.kind !== 'speaker' && p.kind === 'usbc'),
                    ),
                )
              : undefined;

    if (item.kind === 'powerStrip' && kind === 'power' && sourcePort.id === 'ac-in') {
      hostDevice = otherDevices.find(
        (d) =>
          d.kind === 'wallOutlet' &&
          devicePorts(d).some((p) => p.kind === 'power' && !usedPorts.has(`${d.id}:${p.id}`)),
      );
    }

    const hostPort = hostDevice
      ? (devicePorts(hostDevice).find(
          (p) =>
            (p.kind === kind ||
              (kind === 'rca' && p.kind === 'aux35') ||
              (isVideoOrData && item.kind !== 'speaker' && p.kind === 'usbc')) &&
            p.id !== 'ac-in' &&
            !usedPorts.has(`${hostDevice!.id}:${p.id}`),
        ) ??
        devicePorts(hostDevice).find(
          (p) =>
            p.kind === kind ||
            (kind === 'rca' && p.kind === 'aux35') ||
            (isVideoOrData && item.kind !== 'speaker' && p.kind === 'usbc'),
        ))
      : undefined;
    const spec = cableMeta[kind];
    const isHostOutlet = hostDevice?.kind === 'powerStrip' || hostDevice?.kind === 'wallOutlet';
    const defaultToPlug =
      isHostOutlet && hostPort?.id.startsWith('slot-')
        ? kind === 'power'
          ? 'cn3Pin'
          : kind === 'usbc'
            ? 'ganAdapter'
            : undefined
        : kind === 'power'
          ? 'cn3Pin'
          : undefined;

    onSafe(() =>
      addCable({
        kind,
        from: { type: 'device', itemId: item.id, portId: sourcePort.id },
        to:
          hostDevice && hostPort
            ? { type: 'device', itemId: hostDevice.id, portId: hostPort.id }
            : { type: 'floor', drop: 'auto' },
        routeViaArm: true,
        color: spec.color,
        lengthM: spec.defaultLengthM,
        lengthIncludesConnectors: true,
        ...(defaultToPlug ? { toPlugType: defaultToPlug } : {}),
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <CableIcon size={15} /> 端口与模拟走线
      </h4>
      <div className="cable-quick-add">
        {Array.from(new Set(ports.map((p) => p.kind)))
          .filter((k): k is CableKind => cableKindValues.includes(k as CableKind))
          .map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => quickConnect(kind)}
              aria-label={`插入 ${cableMeta[kind].label}`}
            >
              <Plus size={12} />
              {item.kind === 'powerStrip' && kind === 'power'
                ? '插排接入供电'
                : `插 ${cableMeta[kind].shortLabel}`}
            </button>
          ))}
        <button
          type="button"
          className={wiringMode ? 'active' : ''}
          aria-pressed={wiringMode}
          onClick={() => setWiringMode(!wiringMode)}
        >
          {wiringMode ? '退出 3D 连线' : '3D 点选端口连线'}
        </button>
      </div>

      {otherDevices.length > 0 && effectiveFromPort && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 8,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <small style={{ fontWeight: 600, color: '#334155' }}>自选两端直连</small>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              aria-label="起点端口"
              value={effectiveFromPort.id}
              onChange={(e) => setCustomFromPortId(e.target.value)}
              style={{ flex: 1, minWidth: 96 }}
            >
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              aria-label="目标端口"
              value={customTargetKey}
              onChange={(e) => setCustomTargetKey(e.target.value)}
              style={{ flex: 1, minWidth: 118 }}
            >
              <option value="floor:auto">穿孔落桌下（自动）</option>
              <option value="floor:grommet">强制穿桌面走线孔</option>
              <option value="floor:backEdge">绕桌后缘下垂</option>
              {otherDevices.flatMap((dev) =>
                devicePorts(dev)
                  .filter(
                    (p) =>
                      p.kind === effectiveFromPort.kind ||
                      ((effectiveFromPort.kind === 'dp' ||
                        effectiveFromPort.kind === 'hdmi' ||
                        effectiveFromPort.kind === 'magsafe') &&
                        p.kind === 'usbc') ||
                      (effectiveFromPort.kind === 'usbc' &&
                        (p.kind === 'dp' || p.kind === 'hdmi' || p.kind === 'magsafe')) ||
                      (effectiveFromPort.kind === 'rca' && p.kind === 'aux35') ||
                      (effectiveFromPort.kind === 'aux35' && p.kind === 'rca') ||
                      (effectiveFromPort.kind === 'magsafe' && p.kind === 'power') ||
                      (effectiveFromPort.kind === 'power' && p.kind === 'power'),
                  )
                  .map((p) => (
                    <option key={`${dev.id}:${p.id}`} value={`dev:${dev.id}:${p.id}`}>
                      {dev.name} · {p.label}
                    </option>
                  )),
              )}
            </select>
            <button type="button" onClick={connectCustomPair} aria-label="建立自定义连线">
              连接
            </button>
          </div>
        </div>
      )}

      {relatedCables.length > 0 ? (
        <div className="cable-list">
          {relatedCables.map((cable) => {
            const spec = cableMeta[cable.kind];
            const lengths = cableEffectiveLengths(cable);
            const resolved = computeCablePath(cable, project);
            const fromEp = cable.from;
            const toEp = cable.to;
            const fromPortLabel =
              fromEp.type === 'device'
                ? (devicePorts(project.items.find((i) => i.id === fromEp.itemId) ?? item).find(
                    (p) => p.id === fromEp.portId,
                  )?.label ?? fromEp.portId)
                : '桌下';
            const toDevice =
              toEp.type === 'device' ? project.items.find((i) => i.id === toEp.itemId) : undefined;

            return (
              <div key={cable.id} className="cable-row">
                <div className="cable-row-top">
                  <strong>
                    {spec.label} · Ø{(spec.radius * 2000).toFixed(1)}mm
                  </strong>
                  <button
                    type="button"
                    className="icon-button danger-text"
                    aria-label={`拔除 ${spec.label}`}
                    onClick={() => onSafe(() => removeCable(cable.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <small>
                  {fromPortLabel} →{' '}
                  {toDevice
                    ? toDevice.name
                    : cable.to.type === 'floor' && cable.to.drop === 'backEdge'
                      ? '桌后缘垂落'
                      : project.desk.grommet?.enabled
                        ? '经桌面走线孔垂落'
                        : '桌后缘垂落'}
                </small>

                <div className="cable-length-block">
                  <div className="cable-length-presets" role="group" aria-label="线缆长度预设">
                    {spec.presetLengthsM.map((len) => {
                      const active = Math.abs(lengths.nominalM - len) < 1e-4;
                      return (
                        <button
                          key={len}
                          type="button"
                          className={active ? 'active' : ''}
                          onClick={() =>
                            onSafe(() =>
                              updateCable(cable.id, {
                                lengthM: len,
                                lengthIncludesConnectors: lengths.includesConnectors,
                              }),
                            )
                          }
                        >
                          {cable.kind === 'magsafe' ? `官方 ${len}m` : `${len}m`}
                        </button>
                      );
                    })}
                    {cable.kind !== 'magsafe' && (
                      <label className="cable-custom-len" title="自定义长度（米）">
                        <input
                          type="number"
                          aria-label={`${spec.label} 自定义长度`}
                          min={0.3}
                          max={10}
                          step={0.1}
                          value={lengths.nominalM}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val) && val >= 0.3 && val <= 10) {
                              onSafe(() => updateCable(cable.id, { lengthM: val }));
                            }
                          }}
                        />
                        <span>m</span>
                      </label>
                    )}
                  </div>

                  <div className="cable-length-meta">
                    <select
                      aria-label="线长统计口径"
                      value={lengths.includesConnectors ? 'with' : 'body'}
                      disabled={cable.kind === 'magsafe'}
                      onChange={(e) =>
                        onSafe(() =>
                          updateCable(cable.id, {
                            lengthIncludesConnectors: e.target.value === 'with',
                          }),
                        )
                      }
                    >
                      <option value="with">含端子 {lengths.nominalM} m</option>
                      <option value="body">不含端子 {lengths.nominalM} m</option>
                    </select>
                    <span>
                      {lengths.includesConnectors
                        ? `线身 ${lengths.bodyM.toFixed(2)} m`
                        : `含端子 ${lengths.totalM.toFixed(2)} m`}
                      {resolved ? ` · 需 ${resolved.pathLengthM.toFixed(2)} m` : ''}
                    </span>
                  </div>
                  {spec.officialLengthNote && (
                    <small className="cable-official-note">{spec.officialLengthNote}</small>
                  )}
                  {resolved && resolved.shortfallM > 0.02 && (
                    <small className="danger-text">
                      当前路径长度不足（还差 {resolved.shortfallM.toFixed(2)} m）
                    </small>
                  )}
                </div>

                <div className="cable-row-controls">
                  {cable.from.type === 'device' && cable.from.itemId === item.id && (
                    <select
                      aria-label="线缆终点目标"
                      value={
                        cable.to.type === 'floor'
                          ? `floor:${cable.to.drop}`
                          : `dev:${cable.to.itemId}:${cable.to.portId}`
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith('floor:')) {
                          const drop = val.slice(6) as 'auto' | 'grommet' | 'backEdge';
                          onSafe(() => updateCable(cable.id, { to: { type: 'floor', drop } }));
                        } else if (val.startsWith('dev:')) {
                          const [, targetId, targetPortId] = val.split(':');
                          onSafe(() =>
                            updateCable(cable.id, {
                              to: { type: 'device', itemId: targetId, portId: targetPortId },
                            }),
                          );
                        }
                      }}
                    >
                      <option value="floor:auto">桌下垂落（自动走线孔）</option>
                      <option value="floor:grommet">穿桌面走线孔垂落</option>
                      <option value="floor:backEdge">绕桌后缘垂落</option>
                      {otherDevices.flatMap((dev) =>
                        devicePorts(dev)
                          .filter(
                            (p) =>
                              p.kind === cable.kind ||
                              (cable.kind === 'usbc' && p.kind === 'power') ||
                              (cable.kind === 'magsafe' && p.kind === 'power'),
                          )
                          .map((p) => (
                            <option key={`${dev.id}:${p.id}`} value={`dev:${dev.id}:${p.id}`}>
                              {dev.name} · {p.label}
                            </option>
                          )),
                      )}
                    </select>
                  )}
                  {(cable.kind === 'power' || cable.kind === 'usbc' || cable.kind === 'magsafe') &&
                    (() => {
                      const fromSelf =
                        cable.from.type === 'device' && cable.from.itemId === item.id;
                      const isOutletSocket =
                        (item.kind === 'powerStrip' || item.kind === 'wallOutlet') &&
                        (fromSelf && cable.from.type === 'device'
                          ? cable.from.portId !== 'ac-in'
                          : cable.to.type === 'device'
                            ? cable.to.portId !== 'ac-in'
                            : false);
                      const editFrom = isOutletSocket ? fromSelf : !fromSelf;
                      return (
                        <select
                          aria-label="插头规格"
                          value={(editFrom ? cable.fromPlugType : cable.toPlugType) ?? ''}
                          onChange={(e) => {
                            const plug = (e.target.value || undefined) as PlugSpecKind | undefined;
                            onSafe(() =>
                              updateCable(
                                cable.id,
                                editFrom ? { fromPlugType: plug } : { toPlugType: plug },
                              ),
                            );
                          }}
                        >
                          <option value="">默认端头</option>
                          {plugSpecValues.map((p) => (
                            <option key={p} value={p}>
                              {PLUG_SPEC_META[p].label}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  <label className="desk-check">
                    <input
                      type="checkbox"
                      checked={cable.routeViaArm}
                      onChange={(e) =>
                        onSafe(() => updateCable(cable.id, { routeViaArm: e.target.checked }))
                      }
                    />
                    <span>走支架臂理线</span>
                  </label>
                  {(item.kind === 'monitor' || toDevice?.kind === 'monitor') &&
                    !cable.routeViaArm && (
                      <label className="desk-check">
                        <input
                          type="checkbox"
                          checked={cable.viaStandSlot !== false}
                          onChange={(e) =>
                            onSafe(() => updateCable(cable.id, { viaStandSlot: e.target.checked }))
                          }
                        />
                        <span>穿显示器底座走线孔</span>
                      </label>
                    )}
                  <select
                    aria-label="过桌底与走线孔偏好"
                    value={cable.drop ?? (cable.to.type === 'floor' ? cable.to.drop : 'auto')}
                    onChange={(e) => {
                      const drop = e.target.value as 'auto' | 'grommet' | 'backEdge';
                      onSafe(() =>
                        updateCable(cable.id, {
                          drop,
                          ...(cable.to.type === 'floor' ? { to: { type: 'floor', drop } } : {}),
                        }),
                      );
                    }}
                  >
                    <option value="auto">自动（优先穿走线孔）</option>
                    <option value="grommet">穿桌面走线孔</option>
                    <option value="backEdge">绕桌后缘</option>
                  </select>
                </div>
                {resolved && resolved.passedHoles.length > 0 && (
                  <small className="cable-official-note" style={{ display: 'block', marginTop: 4 }}>
                    已穿孔：{resolved.passedHoles.map((h) => h.label).join(' · ')}
                    {resolved.collisionAdjusted ? ' · 已避让遮挡物' : ''}
                  </small>
                )}
                {resolved && resolved.passedHoles.length === 0 && resolved.collisionAdjusted && (
                  <small className="cable-official-note" style={{ display: 'block', marginTop: 4 }}>
                    已自动防穿模绕行实体
                  </small>
                )}
                {resolved && (
                  <CableWaypointList
                    cable={cable}
                    fallbackPoints={resolved.controlPoints.map((v) => ({
                      x: v.x,
                      y: v.y,
                      z: v.z,
                    }))}
                    onSafe={onSafe}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="field-note">
          点击上方按钮为当前设备模拟插线；标注“含端子 /
          不含端子”长度并实时核算桌面与支架臂路径长度。
        </p>
      )}
    </section>
  );
}

const AVIATOR_COLORS = [
  { hex: '#2a313d', label: '碳黑编织' },
  { hex: '#d8dde6', label: '冰川银白' },
  { hex: '#1e3a8a', label: '深海藏青' },
  { hex: '#6d28d9', label: '暗夜紫' },
];

const RGB_SWATCHES = ['#ffffff', '#7dd3fc', '#22d3ee', '#a78bfa', '#fb7185', '#34d399', '#fbbf24'];

export function KeyboardInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const updateItem = useEditor((s) => s.updateItem);
  if (item.kind !== 'keyboard') return null;

  const current: KeyboardSettings = item.keyboard ?? {
    ...defaultKeyboardSettings(),
    layout: matchKeyboardLayout(item.size),
  };
  const spec = KEYBOARD_LAYOUT_SPECS[current.layout];
  const currentTheme = resolveKeyboardTheme(item.color, current.theme);
  const currentBrightness = current.rgbBrightness ?? 1;

  function updateKb(
    patch: Partial<KeyboardSettings>,
    nextLayout?: KeyboardLayout,
    nextColor?: string,
  ) {
    const next = { ...current, ...patch };
    onSafe(() =>
      updateItem(item.id, {
        keyboard: next,
        ...(nextColor ? { color: nextColor } : {}),
        ...(nextLayout ? { size: { ...KEYBOARD_LAYOUT_SPECS[nextLayout].size } } : {}),
      }),
    );
  }

  return (
    <>
      <section className="property-section">
        <h4>
          <Keyboard size={15} /> 键盘配列与外观
        </h4>
        <div
          className="desk-shape-presets"
          role="group"
          aria-label="外观配色"
          style={{ marginBottom: 10 }}
        >
          {keyboardThemes.map((t: KeyboardTheme) => (
            <button
              key={t}
              type="button"
              className={currentTheme === t ? 'active' : ''}
              aria-pressed={currentTheme === t}
              onClick={() => updateKb({ theme: t }, undefined, KEYBOARD_THEME_SPECS[t].chassisHex)}
            >
              {KEYBOARD_THEME_SPECS[t].label}
            </button>
          ))}
        </div>

        <div className="monitor-presets wrap-presets" role="group" aria-label="键盘配列">
          {keyboardLayouts.map((id) => (
            <button
              key={id}
              type="button"
              className={current.layout === id ? 'active' : ''}
              aria-pressed={current.layout === id}
              onClick={() => updateKb({ layout: id }, id)}
            >
              {KEYBOARD_LAYOUT_SPECS[id].shortLabel}
            </button>
          ))}
        </div>
        <p className="field-note">
          当前 {spec.label} · {cm(item.size.width)} × {cm(item.size.depth)} cm
        </p>

        <div
          className="desk-shape-presets"
          role="group"
          aria-label="轴体方案"
          style={{ marginTop: 12 }}
        >
          <button
            type="button"
            className={current.switchType === 'mechanical' ? 'active' : ''}
            aria-pressed={current.switchType === 'mechanical'}
            onClick={() => updateKb({ switchType: 'mechanical' })}
          >
            机械轴键盘
          </button>
          <button
            type="button"
            className={current.switchType === 'magnetic' ? 'active' : ''}
            aria-pressed={current.switchType === 'magnetic'}
            onClick={() => updateKb({ switchType: 'magnetic', aviatorCable: true })}
          >
            磁轴键盘
          </button>
        </div>

        <label className="lamp-switch" style={{ marginTop: 14 }}>
          <span>GX16 弹簧航空线</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="GX16 弹簧航空线"
            checked={current.aviatorCable}
            onChange={(e) => updateKb({ aviatorCable: e.target.checked })}
          />
        </label>
        {current.aviatorCable && (
          <div className="swatches" style={{ marginTop: 6 }}>
            {AVIATOR_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                aria-label={`航空线配色 ${c.label}`}
                aria-pressed={current.cableColor.toLowerCase() === c.hex.toLowerCase()}
                style={{ backgroundColor: c.hex }}
                onClick={() => updateKb({ cableColor: c.hex })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="property-section">
        <h4>
          <Sparkles size={15} /> RGB 背光灯效
        </h4>
        <label className="lamp-switch">
          <span>开启 RGB 背光</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="开启 RGB 背光"
            checked={current.rgb}
            onChange={(e) => updateKb({ rgb: e.target.checked })}
          />
        </label>
        {current.rgb && (
          <>
            <div className="desk-shape-presets wrap-presets" role="group" aria-label="RGB 灯效模式">
              {(
                [
                  { value: 'rainbow', label: '彩虹流光' },
                  { value: 'aurora', label: '极光渐变' },
                  { value: 'static', label: '单色常亮' },
                  { value: 'breathing', label: '呼吸微光' },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={current.rgbMode === m.value ? 'active' : ''}
                  aria-pressed={current.rgbMode === m.value}
                  onClick={() => updateKb({ rgbMode: m.value })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>背光亮度</span>
                <span>{Math.round(currentBrightness * 100)}%</span>
              </span>
              <input
                type="range"
                aria-label="背光亮度"
                min={0.2}
                max={1.5}
                step={0.05}
                value={currentBrightness}
                onChange={(e) => updateKb({ rgbBrightness: Number(e.target.value) })}
              />
            </label>
            {current.rgbMode !== 'rainbow' && current.rgbMode !== 'aurora' && (
              <div className="swatches" style={{ marginTop: 10 }}>
                {RGB_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`RGB 颜色 ${hex}`}
                    aria-pressed={current.rgbColor.toLowerCase() === hex.toLowerCase()}
                    style={{ backgroundColor: hex }}
                    onClick={() => updateKb({ rgbColor: hex })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

export function MouseInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const updateItem = useEditor((s) => s.updateItem);
  if (item.kind !== 'mouse') return null;

  const current = item.mouse ?? defaultMouseSettings();
  const preset = mousePresetById(current.modelId);

  function applyPreset(nextPreset: MousePreset) {
    onSafe(() =>
      updateItem(item.id, {
        mouse: { series: nextPreset.series, modelId: nextPreset.id },
        size: { ...nextPreset.size },
        color: resolveMouseColor(nextPreset, item.color),
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Mouse size={15} /> 鼠标款式与连接方式
      </h4>
      <div className="desk-shape-presets" role="group" aria-label="鼠标具体型号">
        {MOUSE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={preset.id === p.id ? 'active' : ''}
            aria-pressed={preset.id === p.id}
            onClick={() => applyPreset(p)}
          >
            {p.shortLabel}
          </button>
        ))}
      </div>

      <p className="field-note">
        {preset.label} · {preset.weightG} g · {preset.description}
      </p>
    </section>
  );
}

export function MousepadSizeFields({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const updateItem = useEditor((s) => s.updateItem);
  if (item.kind !== 'mousepad') return null;

  const activePreset = matchMousepadSizePreset(item.size);
  const thicknessMm = mm(item.size.height);

  function updatePadSize(patch: Partial<SceneItem['size']>) {
    onSafe(() => updateItem(item.id, { size: { ...item.size, ...patch } }));
  }

  return (
    <>
      <div className="monitor-presets wrap-presets" role="group" aria-label="鼠标垫尺寸预设">
        {MOUSEPAD_SIZE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={activePreset === p.id ? 'active' : ''}
            aria-pressed={activePreset === p.id}
            onClick={() => updatePadSize({ width: p.width, depth: p.depth })}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="field-grid" style={{ marginTop: 10 }}>
        <NumberField
          label="宽度"
          value={cm(item.size.width)}
          min={cm(MOUSEPAD_MIN_WIDTH)}
          max={cm(MOUSEPAD_MAX_WIDTH)}
          step={1}
          onChange={(v) => updatePadSize({ width: meters(v) })}
        />
        <NumberField
          label="深度"
          value={cm(item.size.depth)}
          min={cm(MOUSEPAD_MIN_DEPTH)}
          max={cm(MOUSEPAD_MAX_DEPTH)}
          step={1}
          onChange={(v) => updatePadSize({ depth: meters(v) })}
        />
        <NumberField
          label="厚度"
          value={thicknessMm}
          min={mm(MOUSEPAD_MIN_THICKNESS)}
          max={mm(MOUSEPAD_MAX_THICKNESS)}
          step={0.5}
          unit="mm"
          onChange={(v) => updatePadSize({ height: metersFromMm(v) })}
        />
      </div>

      <div
        className="monitor-presets"
        role="group"
        aria-label="鼠标垫厚度预设"
        style={{ marginTop: 10 }}
      >
        {MOUSEPAD_THICKNESS_PRESETS.map((t) => (
          <button
            key={t.mm}
            type="button"
            className={Math.abs(thicknessMm - t.mm) < 0.05 ? 'active' : ''}
            aria-pressed={Math.abs(thicknessMm - t.mm) < 0.05}
            title={t.hint}
            onClick={() => updatePadSize({ height: t.meters })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="field-note">
        厚度限制在 {mm(MOUSEPAD_MIN_THICKNESS)}–{mm(MOUSEPAD_MAX_THICKNESS)} mm 合理区间（2 mm
        硬朗竞速 · 4 mm 均衡主流 · 6 mm 加厚缓震），放置在鼠标垫上的设备会自动贴合垫面。
      </p>
    </>
  );
}

export function ControllerInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const updateItem = useEditor((s) => s.updateItem);
  if (item.kind !== 'controller') return null;

  const current = item.controller ?? defaultControllerSettings();
  const preset = controllerPresetById(current.model);

  function selectModel(nextPreset: ControllerPreset) {
    onSafe(() =>
      updateItem(item.id, {
        controller: { model: nextPreset.id },
        size: { ...nextPreset.size },
        color: resolveControllerColor(nextPreset, item.color),
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Gamepad2 size={15} /> 手柄型号（PS5 / Xbox）
      </h4>
      <div className="desk-shape-presets" role="group" aria-label="手柄型号">
        {CONTROLLER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={preset.id === p.id ? 'active' : ''}
            aria-pressed={preset.id === p.id}
            onClick={() => selectModel(p)}
          >
            {p.shortLabel}
          </button>
        ))}
      </div>
      <p className="field-note">
        {preset.label} · {preset.weightG} g · {preset.description}
      </p>
    </section>
  );
}

function syncCablesAfterPortChange(
  cables: SceneItem extends never ? never : import('../domain/cable').Cable[] | undefined,
  item: SceneItem,
) {
  if (!cables?.length) return cables;
  const validPortIds = new Set(devicePorts(item).map((p) => p.id));
  return cables.filter((c) => {
    if (c.from.type === 'device' && c.from.itemId === item.id && !validPortIds.has(c.from.portId)) {
      return false;
    }
    if (c.to.type === 'device' && c.to.itemId === item.id && !validPortIds.has(c.to.portId)) {
      return false;
    }
    return true;
  });
}

export function SpeakerInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, commit } = useEditor();
  if (item.kind !== 'speaker') return null;

  const cfg = item.speaker ?? defaultSpeakerSettings('active');
  const spec = speakerPresetById(cfg.model);
  const roleMeta = SPEAKER_ROLE_LABELS[cfg.role];
  const hasCompanionSpeaker = project.items.some((i) => i.kind === 'speaker' && i.id !== item.id);

  function updateSpeaker(patch: Partial<SpeakerSettings>, resizeToModel = false) {
    const next: SpeakerSettings = { ...cfg, ...patch };
    const nextSpec = speakerPresetById(next.model);
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        const target = p.items.find((it) => it.id === item.id);
        if (!target) return;
        target.speaker = next;
        if (resizeToModel) {
          target.size = { ...nextSpec.size };
        }
        p.cables = syncCablesAfterPortChange(p.cables, target);
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Volume2 size={15} /> 桌面音响系统与接口架构
      </h4>

      <p className="field-note" style={{ marginTop: 0, marginBottom: 6 }}>
        标杆产品参考规格
      </p>
      <div className="monitor-presets" role="group" aria-label="音响标杆型号">
        {SPEAKER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={cfg.model === p.id ? 'active' : ''}
            aria-pressed={cfg.model === p.id}
            title={p.summary}
            onClick={() => updateSpeaker({ model: p.id }, true)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        声道箱体架构
      </p>
      <div className="desk-shape-presets" role="group" aria-label="音箱主副架构">
        {speakerRoleValues.map((role) => (
          <button
            key={role}
            type="button"
            className={cfg.role === role ? 'active' : ''}
            aria-pressed={cfg.role === role}
            onClick={() => updateSpeaker({ role })}
          >
            {SPEAKER_ROLE_LABELS[role].label}
          </button>
        ))}
      </div>

      <p className="field-note" style={{ marginTop: 8 }}>
        <strong>{spec.brandModel}</strong>
        <br />
        {spec.drivers} · {spec.freqResponse} · {spec.powerSpec}
        <br />
        {roleMeta.note}
        {cfg.role === 'active' && hasCompanionSpeaker && (
          <>
            <br />
            下方可一键点击「插 主副箱线」连接配对副箱，并按需接入信号源与供电。
          </>
        )}
      </p>
    </section>
  );
}

export function PowerStripInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, updateItem, commit } = useEditor();
  if (item.kind !== 'powerStrip') return null;

  const cfg = item.powerStrip ?? defaultPowerStripSettings();
  const hasShelf = !project.desk.return && Boolean(project.desk.shelf?.enabled);
  const surfaceMode = item.surface ?? 'desk';

  function updateCfg(patch: Partial<PowerStripSettings>) {
    const next: PowerStripSettings = { ...cfg, ...patch };
    const nextSize = computePowerStripSize(next);
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        const target = p.items.find((it) => it.id === item.id);
        if (!target) return;
        target.powerStrip = next;
        target.size = nextSize;
        p.cables = syncCablesAfterPortChange(p.cables, target);
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Plug size={15} /> 插排孔位与 USB 快充配置
      </h4>

      <p className="field-note" style={{ marginTop: 0, marginBottom: 6 }}>
        孔位配列（行 × 列）
      </p>
      <div className="monitor-presets" role="group" aria-label="插排配列">
        {powerStripLayoutValues.map((layout) => (
          <button
            key={layout}
            type="button"
            className={cfg.layout === layout ? 'active' : ''}
            aria-pressed={cfg.layout === layout}
            onClick={() => updateCfg({ layout })}
          >
            {POWER_STRIP_LAYOUT_META[layout].label}
          </button>
        ))}
      </div>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        插孔形式
      </p>
      <div className="desk-shape-presets" role="group" aria-label="插排插孔形式">
        {powerOutletTypeValues.map((ot) => (
          <button
            key={ot}
            type="button"
            className={cfg.outletType === ot ? 'active' : ''}
            aria-pressed={cfg.outletType === ot}
            onClick={() => updateCfg({ outletType: ot })}
          >
            {POWER_OUTLET_LABELS[ot]}
          </button>
        ))}
      </div>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        附带 USB-A 接口数量
      </p>
      <div className="monitor-presets" role="group" aria-label="插排 USB-A 数量">
        {[0, 1, 2, 3, 4].map((count) => (
          <button
            key={count}
            type="button"
            className={cfg.usbA === count ? 'active' : ''}
            aria-pressed={cfg.usbA === count}
            onClick={() => updateCfg({ usbA: count })}
          >
            {count === 0 ? '无 USB-A' : `${count} 口`}
          </button>
        ))}
      </div>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        附带 Type-C 接口数量
      </p>
      <div className="monitor-presets" role="group" aria-label="插排 Type-C 数量">
        {[0, 1, 2, 3, 4].map((count) => (
          <button
            key={count}
            type="button"
            className={cfg.usbC === count ? 'active' : ''}
            aria-pressed={cfg.usbC === count}
            onClick={() => updateCfg({ usbC: count })}
          >
            {count === 0 ? '无 Type-C' : `${count} 口`}
          </button>
        ))}
      </div>

      <label className="desk-check" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={cfg.masterSwitch}
          onChange={(e) => updateCfg({ masterSwitch: e.target.checked })}
        />
        <span>配备总控开关与电源指示灯</span>
      </label>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        放置位置
      </p>
      <div className="desk-shape-presets" role="group" aria-label="插排放置位置">
        <button
          type="button"
          className={surfaceMode === 'desk' ? 'active' : ''}
          aria-pressed={surfaceMode === 'desk'}
          onClick={() => onSafe(() => updateItem(item.id, { surface: undefined }))}
        >
          主桌面
        </button>
        {hasShelf && (
          <button
            type="button"
            className={surfaceMode === 'shelf' ? 'active' : ''}
            aria-pressed={surfaceMode === 'shelf'}
            onClick={() => onSafe(() => updateItem(item.id, { surface: 'shelf' }))}
          >
            等宽层架
          </button>
        )}
        <button
          type="button"
          className={surfaceMode === 'floor' ? 'active' : ''}
          aria-pressed={surfaceMode === 'floor'}
          onClick={() => onSafe(() => updateItem(item.id, { surface: 'floor' }))}
        >
          桌下地面
        </button>
      </div>
    </section>
  );
}

export function WallOutletInspectorSection({
  item,
  onSafe,
}: {
  item: SceneItem;
  onSafe: (fn: () => void) => void;
}) {
  const { project, updateItem, commit } = useEditor();
  if (item.kind !== 'wallOutlet') return null;

  const cfg = item.wallOutlet ?? defaultWallOutletSettings();
  const isWall = cfg.mount === 'wall' && item.surface !== 'floor';
  const maxWallTopY = project.desk.backWall?.enabled
    ? project.desk.height + project.desk.backWall.height
    : project.desk.height + WALL_DEFAULT_HEIGHT;

  function setMount(mount: 'wall' | 'floor') {
    const nextCfg: WallOutletSettings = { ...cfg, mount };
    const nextSize = computeWallOutletSize(nextCfg);
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        const target = p.items.find((it) => it.id === item.id);
        if (!target) return;
        target.wallOutlet = nextCfg;
        target.size = nextSize;
        if (mount === 'wall') {
          if (!p.desk.backWall?.enabled) {
            p.desk.backWall = {
              enabled: true,
              height: p.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
              gap: p.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
              color: p.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
            };
          }
          target.surface = 'wall';
          target.wallY = target.wallY ?? WALL_OUTLET_DEFAULT_Y;
          target.z = 0;
          target.rotation = 0;
        } else {
          target.surface = 'floor';
          delete target.wallY;
          target.z = -p.desk.depth * 0.35;
        }
      }),
    );
  }

  function updateCfg(patch: Partial<WallOutletSettings>) {
    const next: WallOutletSettings = { ...cfg, ...patch };
    const nextSize = computeWallOutletSize(next);
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        const target = p.items.find((it) => it.id === item.id);
        if (!target) return;
        target.wallOutlet = next;
        target.size = nextSize;
        p.cables = syncCablesAfterPortChange(p.cables, target);
      }),
    );
  }

  return (
    <section className="property-section">
      <h4>
        <Plug size={15} /> 插座安装方式与孔位规格
      </h4>

      <div className="desk-shape-presets" role="group" aria-label="插座安装方式">
        <button
          type="button"
          className={isWall ? 'active' : ''}
          aria-pressed={isWall}
          onClick={() => setMount('wall')}
        >
          附着墙面
        </button>
        <button
          type="button"
          className={!isWall ? 'active' : ''}
          aria-pressed={!isWall}
          onClick={() => setMount('floor')}
        >
          附着地面
        </button>
      </div>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        插孔形式
      </p>
      <div className="desk-shape-presets" role="group" aria-label="插座插孔形式">
        {powerOutletTypeValues.map((ot) => (
          <button
            key={ot}
            type="button"
            className={cfg.outletType === ot ? 'active' : ''}
            aria-pressed={cfg.outletType === ot}
            onClick={() => updateCfg({ outletType: ot })}
          >
            {POWER_OUTLET_LABELS[ot]}
          </button>
        ))}
      </div>

      <p className="field-note" style={{ marginTop: 10, marginBottom: 6 }}>
        附带 USB-A 供电口（墙面 / 地面插座仅支持单联独立面板，不含 Type-C）
      </p>
      <div className="monitor-presets" role="group" aria-label="插座 USB-A 数量">
        {[0, 1, 2].map((count) => (
          <button
            key={count}
            type="button"
            className={cfg.usbA === count ? 'active' : ''}
            aria-pressed={cfg.usbA === count}
            onClick={() => updateCfg({ usbA: count })}
          >
            {count === 0 ? '无 USB-A' : `${count} × USB-A`}
          </button>
        ))}
      </div>
      <p className="field-note" style={{ marginTop: 8 }}>
        每个插座为独立 86 型 /
        地插单元，请逐个添加并用左键拖拽靠近已有插座，系统会自动磁吸紧贴对齐。
      </p>

      {isWall && (
        <div className="field-grid" style={{ marginTop: 10 }}>
          <NumberField
            label="离地高度"
            value={cm(item.wallY ?? WALL_OUTLET_DEFAULT_Y)}
            min={4}
            max={Math.max(15, cm(maxWallTopY - item.size.height))}
            step={1}
            unit="cm"
            onChange={(v) => onSafe(() => updateItem(item.id, { wallY: meters(v) }))}
          />
        </div>
      )}
    </section>
  );
}

import { NumberField } from './NumberField';
import DeskInspector from './DeskInspector';
import {
  CableConnectionsSection,
  ControllerInspectorSection,
  KeyboardInspectorSection,
  LaptopInspectorSection,
  LaptopStandInspector,
  MonitorArmInspector,
  MouseInspectorSection,
  MousepadSizeFields,
  PegboardInspectorSection,
  PowerStripInspectorSection,
  SelectedCableInspectorSection,
  SpeakerInspectorSection,
  SurfacePlacementField,
  WallOutletInspectorSection,
} from './DeviceExtensionsInspector';
import LampInspector from './LampInspector';
import { controllerPresetById, defaultControllerSettings } from '../domain/controller';
import {
  defaultKeyboardSettings,
  KEYBOARD_THEME_SPECS,
  matchKeyboardLayout,
  resolveKeyboardTheme,
} from '../domain/keyboard';
import { defaultMouseSettings, mousePresetById } from '../domain/mouse';
import { MOUSEPAD_COLOR_SWATCHES } from '../domain/mousepad';
import { SPEAKER_COLORS } from '../domain/speaker';
import { editorErrorMessage } from '../domain/screenLamp';
export { NumberField } from './NumberField';
import {
  Copy,
  Trash2,
  SlidersHorizontal,
  MoveHorizontal,
  Move3d,
  RotateCcw,
  TriangleAlert,
  Ruler,
  LockKeyhole,
} from 'lucide-react';
import { useEditor } from '../store/editorStore';
import { findItemCollisions, resolveItemPositionWithCollisions } from '../domain/collision';
import { DESK_WOOD_BASE_COLOR } from '../domain/desk';
import { isMonitorMountedOnArm, macbookOfficialColors } from '../domain/laptop';
import { computeMonitorArmSystem, findArmBranchForItem } from '../domain/monitorArm';
import { cm, meters, type Size } from '../domain/project';
import { isOutOfBounds } from '../domain/placement';
import {
  ARM_MAX_LIFT,
  ARM_MIN_LIFT,
  DELL_PLATINUM_SILVER,
  MAX_LIFT,
  MAX_PITCH,
  MAX_ROLL,
  MIN_LIFT,
  monitorBaseTier,
  monitorParts,
  monitorPose,
  monitorPresets,
  monitorPresetId,
  monitorSize,
  screenInches,
  STUDIO_DISPLAY_PRESETS,
  STUDIO_DISPLAY_SILVER,
  STUDIO_MAX_LIFT,
  type StudioStandType,
} from '../domain/monitor';
const swatches = [DESK_WOOD_BASE_COLOR, '#c99e70', '#e8ded0', '#e9edf0', '#38414d', '#a5b8aa'];
export default function Inspector({ onError }: { onError: (m: string) => void }) {
  const { project, selected, selectedCableId, commit, updateItem, duplicate, remove } = useEditor();
  const item = project.items.find((i) => i.id === selected);
  const desk = project.desk;
  const isMonitor = item?.kind === 'monitor';
  const monitorMold = item?.monitor?.model ?? 'dell';
  const isStudioDisplay = isMonitor && monitorMold === 'studioDisplay';
  const studioStandType: StudioStandType = item?.monitor?.standType ?? 'tilt';
  const hasMonitorArm = Boolean(item && isMonitor && isMonitorMountedOnArm(item.id, project.items));
  const mountedBranch = item ? findArmBranchForItem(item.id, project.items) : null;
  const mountedArmBranch = mountedBranch
    ? computeMonitorArmSystem(mountedBranch.arm, project.items, desk).branches.find(
        (b) => b.target.id === item?.id,
      )
    : undefined;
  const monitor = isMonitor ? monitorParts(item.size, monitorMold) : null;
  const baseTier = isMonitor ? monitorBaseTier(item.size, item?.monitor) : null;
  const pose = isMonitor && item ? monitorPose(item.size, { ...item, hasMonitorArm }) : null;
  const isWallPegboard = item?.kind === 'pegboard' && item.surface === 'wall';
  const isWallOutletWall =
    item?.kind === 'wallOutlet' &&
    item.surface !== 'floor' &&
    (item.wallOutlet?.mount ?? 'wall') === 'wall';
  const isWallMountedItem = isWallPegboard || isWallOutletWall;
  function safe(fn: () => void) {
    try {
      fn();
    } catch (error) {
      onError(
        editorErrorMessage(
          error,
          '参数超出允许范围，或场景已达到模型预算。请减小尺寸或移除部分物品。',
        ),
      );
    }
  }
  function updateSize(axis: keyof Size, value: number) {
    if (!item) return;
    const size =
      item.kind === 'imported'
        ? (Object.fromEntries(
            Object.entries(item.size).map(([key, n]) => [
              key,
              (n * meters(value)) / item.size[axis],
            ]),
          ) as Size)
        : { ...item.size, [axis]: meters(value) };
    safe(() => updateItem(item.id, { size }));
  }
  return (
    <aside className="inspector panel" aria-label="属性面板">
      <div className="panel-heading">
        <h2>{item ? '物品属性' : '桌子设置'}</h2>
        <SlidersHorizontal size={16} />
      </div>
      <div className="inspector-scroll">
        <div className="selection-heading">
          <div className="selection-type">
            {item ? (item.kind === 'imported' ? '导入模型' : '当前选中') : '一切，从一张好桌子开始'}
          </div>
          <h3>{item ? item.name : '你的专属工作台'}</h3>
          <p>{item ? '微调每一个细节，找到舒服的位置。' : '让尺寸与真实空间刚刚好。'}</p>
        </div>
        {item && (
          <label className="text-field">
            物品名称
            <input
              key={`${item.id}:${item.name}`}
              defaultValue={item.name}
              maxLength={80}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name) safe(() => updateItem(item.id, { name }));
                else e.target.value = item.name;
              }}
            />
          </label>
        )}
        {!item ? (
          <>
            {selectedCableId && <SelectedCableInspectorSection onSafe={safe} />}
            <DeskInspector desk={desk} onSafe={safe} />
          </>
        ) : item.kind === 'screenLamp' ? (
          <LampInspector key={item.id} item={item} onError={onError} />
        ) : item.kind === 'monitorArm' ? (
          <MonitorArmInspector item={item} onSafe={safe} />
        ) : (
          <section className="property-section">
            <h4>
              <Ruler size={15} /> 物品尺寸
              {item.kind === 'imported' && (
                <span className="inline-tag">
                  <LockKeyhole size={10} />
                  等比
                </span>
              )}
            </h4>
            {isMonitor && monitor ? (
              <>
                <div
                  className="desk-shape-presets"
                  role="group"
                  aria-label="显示器模具"
                  style={{ marginBottom: 10 }}
                >
                  <button
                    type="button"
                    className={!isStudioDisplay ? 'active' : ''}
                    aria-pressed={!isStudioDisplay}
                    onClick={() =>
                      safe(() =>
                        updateItem(item.id, {
                          monitor: undefined,
                          size: { ...monitorPresets[1].size },
                          color: DELL_PLATINUM_SILVER,
                        }),
                      )
                    }
                  >
                    Dell UltraSharp
                  </button>
                  <button
                    type="button"
                    className={isStudioDisplay ? 'active' : ''}
                    aria-pressed={isStudioDisplay}
                    onClick={() =>
                      safe(() =>
                        updateItem(item.id, {
                          monitor: { model: 'studioDisplay', standType: 'tilt' },
                          size: { ...STUDIO_DISPLAY_PRESETS.tilt.size },
                          color: STUDIO_DISPLAY_SILVER,
                          lift: 0,
                        }),
                      )
                    }
                  >
                    Apple Studio Display
                  </button>
                </div>

                {isStudioDisplay ? (
                  <>
                    <div
                      className="desk-shape-presets"
                      role="group"
                      aria-label="Studio Display 支架类型"
                    >
                      {(['tilt', 'height'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={studioStandType === st ? 'active' : ''}
                          aria-pressed={studioStandType === st}
                          onClick={() =>
                            safe(() =>
                              updateItem(item.id, {
                                monitor: { model: 'studioDisplay', standType: st },
                                size: { ...STUDIO_DISPLAY_PRESETS[st].size },
                                ...(st === 'tilt' ? { lift: 0 } : {}),
                              }),
                            )
                          }
                        >
                          {STUDIO_DISPLAY_PRESETS[st].shortLabel}
                        </button>
                      ))}
                    </div>
                    <p className="field-note monitor-note">
                      Apple Studio Display 27" 5K · 官方尺寸 {(item.size.width * 100).toFixed(1)} ×{' '}
                      {(item.size.height * 100).toFixed(1)} × {(item.size.depth * 100).toFixed(1)}{' '}
                      cm · {STUDIO_DISPLAY_PRESETS[studioStandType].weightKg} kg
                      {baseTier ? ` · ${baseTier.label}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="monitor-presets" role="group" aria-label="显示器尺寸预设">
                      {monitorPresets.map((p) => (
                        <button
                          key={p.id}
                          className={monitorPresetId(item.size) === p.id ? 'active' : ''}
                          onClick={() => safe(() => updateItem(item.id, { size: { ...p.size } }))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="field-note monitor-note">
                      屏幕 {cm(monitor.screenWidth)} × {cm(monitor.screenHeight)} cm（
                      {screenInches(item.size, monitorMold).toFixed(1)} 寸，16:9），总高{' '}
                      {cm(item.size.height)} cm
                      {baseTier ? ` · ${baseTier.label}` : ''}
                    </p>
                    <div className="field-grid">
                      <NumberField
                        label="面板宽度"
                        value={cm(item.size.width)}
                        min={40}
                        max={90}
                        onChange={(v) =>
                          safe(() =>
                            updateItem(item.id, {
                              size: monitorSize(meters(v), monitor.standHeight, item.size.depth),
                            }),
                          )
                        }
                      />
                      <NumberField
                        label="支架高度"
                        value={cm(monitor.standHeight)}
                        min={6}
                        max={18}
                        onChange={(v) =>
                          safe(() =>
                            updateItem(item.id, {
                              size: monitorSize(item.size.width, meters(v), item.size.depth),
                            }),
                          )
                        }
                      />
                      <NumberField
                        label="底座深度"
                        value={cm(item.size.depth)}
                        min={10}
                        max={40}
                        onChange={(v) =>
                          safe(() =>
                            updateItem(item.id, {
                              size: monitorSize(item.size.width, monitor.standHeight, meters(v)),
                            }),
                          )
                        }
                      />
                    </div>
                    <div
                      className="desk-shape-presets"
                      role="group"
                      aria-label="底部前置 Hub 状态"
                      style={{ marginTop: 10 }}
                    >
                      <button
                        type="button"
                        className={(item.monitor?.quickHubOpen ?? true) ? 'active' : ''}
                        aria-pressed={item.monitor?.quickHubOpen ?? true}
                        onClick={() =>
                          safe(() =>
                            updateItem(item.id, {
                              monitor: {
                                ...(item.monitor ?? { model: 'dell' }),
                                quickHubOpen: true,
                              },
                            }),
                          )
                        }
                      >
                        前置 Hub 弹出
                      </button>
                      <button
                        type="button"
                        className={!(item.monitor?.quickHubOpen ?? true) ? 'active' : ''}
                        aria-pressed={!(item.monitor?.quickHubOpen ?? true)}
                        onClick={() =>
                          safe(() =>
                            updateItem(item.id, {
                              monitor: {
                                ...(item.monitor ?? { model: 'dell' }),
                                quickHubOpen: false,
                              },
                            }),
                          )
                        }
                      >
                        前置 Hub 收回
                      </button>
                    </div>
                    <p className="field-note">
                      内置竖向 1× USB-A + 1× USB-C 前置 Hub，可直接左键点击显示器左下下巴 Hub
                      模块弹出或收回。
                    </p>
                  </>
                )}
              </>
            ) : item.kind === 'keyboard' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                标准配列尺寸 {(item.size.width * 100).toFixed(1)} ×{' '}
                {(item.size.depth * 100).toFixed(1)} × {(item.size.height * 100).toFixed(1)} cm
                （不支持自定义，请在下方切换 60%–100% 配列）
              </p>
            ) : item.kind === 'gamingLaptop' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                标准机型尺寸 {(item.size.width * 100).toFixed(1)} ×{' '}
                {(item.size.depth * 100).toFixed(1)} × {(item.size.height * 100).toFixed(1)} cm
                （不支持自定义，请在下方切换机型尺寸）
              </p>
            ) : item.kind === 'macbook' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                官方尺寸 {(item.size.width * 100).toFixed(2)} × {(item.size.depth * 100).toFixed(2)}{' '}
                × {(item.size.height * 100).toFixed(2)} cm（请在下方选择官方机型预设）
              </p>
            ) : item.kind === 'mouse' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                1:1 经典模具尺寸 {(item.size.width * 1000).toFixed(1)} ×{' '}
                {(item.size.depth * 1000).toFixed(1)} × {(item.size.height * 1000).toFixed(1)}{' '}
                mm（请在下方切换经典无线款 / 经典有线款）
              </p>
            ) : item.kind === 'controller' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                1:1 官方握持尺寸 {(item.size.width * 1000).toFixed(0)} ×{' '}
                {(item.size.depth * 1000).toFixed(0)} × {(item.size.height * 1000).toFixed(0)}{' '}
                mm（请在下方切换 PS5 / Xbox 型号）
              </p>
            ) : item.kind === 'powerStrip' || item.kind === 'wallOutlet' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                国标 1:1 尺寸 {(item.size.width * 100).toFixed(1)} ×{' '}
                {(item.size.depth * 100).toFixed(1)} × {(item.size.height * 100).toFixed(1)}{' '}
                cm（随下方孔位配列与 USB 模块自动计算）
              </p>
            ) : item.kind === 'mousepad' ? (
              <MousepadSizeFields item={item} onSafe={safe} />
            ) : (
              <div className="field-grid">
                <NumberField
                  label="宽度"
                  value={cm(item.size.width)}
                  min={item.kind === 'imported' ? 0.5 : 1}
                  max={500}
                  onChange={(v) => updateSize('width', v)}
                />
                <NumberField
                  label="深度"
                  value={cm(item.size.depth)}
                  min={item.kind === 'imported' ? 0.5 : 1}
                  max={500}
                  onChange={(v) => updateSize('depth', v)}
                />
                <NumberField
                  label="高度"
                  value={cm(item.size.height)}
                  min={0.5}
                  max={500}
                  onChange={(v) => updateSize('height', v)}
                />
              </div>
            )}
          </section>
        )}
        {isMonitor && item && pose && (
          <section className="property-section">
            <h4>
              <Move3d size={15} />
              屏幕姿态
            </h4>
            <div className="field-grid">
              <NumberField
                label="俯仰角度"
                value={pose.pitchDeg}
                min={isStudioDisplay ? -5 : -MAX_PITCH}
                max={isStudioDisplay ? 25 : MAX_PITCH}
                step={5}
                unit="°"
                onChange={(v) => safe(() => updateItem(item.id, { pitch: v }))}
              />
              <NumberField
                label="屏幕翻转"
                value={pose.rollDeg}
                min={-MAX_ROLL}
                max={MAX_ROLL}
                step={5}
                unit="°"
                onChange={(v) => safe(() => updateItem(item.id, { roll: v }))}
              />
              {(!isStudioDisplay || studioStandType === 'height' || hasMonitorArm) && (
                <NumberField
                  label="屏幕高度"
                  value={cm(pose.lift)}
                  min={hasMonitorArm ? cm(ARM_MIN_LIFT) : isStudioDisplay ? 0 : cm(MIN_LIFT)}
                  max={cm(
                    hasMonitorArm ? ARM_MAX_LIFT : isStudioDisplay ? STUDIO_MAX_LIFT : MAX_LIFT,
                  )}
                  step={0.5}
                  unit="cm"
                  onChange={(v) => safe(() => updateItem(item.id, { lift: meters(v) }))}
                />
              )}
            </div>
            <p className="field-note">
              {hasMonitorArm
                ? '已挂载显示器支架臂，屏幕高度由下长臂与气压上臂联动提供（支持 -32 ~ +36 cm，受防穿模限位约束）。'
                : isStudioDisplay
                  ? '固定 L 型底座滑轨行程最大 10.5 cm，调节高度时屏幕沿斜臂平行滑动。'
                  : '固定倾斜立柱滑轨（行程 -5 ~ +5 cm），调节高度时屏幕平行立柱斜向滑动。'}
            </p>
          </section>
        )}
        {item && item.kind !== 'screenLamp' && item.kind !== 'monitorArm' && (
          <>
            <ControllerInspectorSection item={item} onSafe={safe} />
            <MouseInspectorSection item={item} onSafe={safe} />
            <KeyboardInspectorSection item={item} onSafe={safe} />
            <LaptopInspectorSection item={item} onSafe={safe} />
            <LaptopStandInspector item={item} onSafe={safe} />
            <SpeakerInspectorSection item={item} onSafe={safe} />
            <PegboardInspectorSection item={item} onSafe={safe} />
            <PowerStripInspectorSection item={item} onSafe={safe} />
            <WallOutletInspectorSection item={item} onSafe={safe} />
            <SurfacePlacementField item={item} onSafe={safe} />
            <section className="property-section">
              <h4>
                <MoveHorizontal size={15} />
                {isWallMountedItem ? '墙面横向定位' : '摆放位置'}
              </h4>
              <div className="field-grid">
                <NumberField
                  label="左右位置"
                  value={cm(item.x)}
                  min={-500}
                  max={500}
                  onChange={(v) => safe(() => updateItem(item.id, { x: meters(v) }))}
                />
                {!isWallMountedItem && (
                  <NumberField
                    label="前后位置"
                    value={cm(item.z)}
                    min={-500}
                    max={500}
                    onChange={(v) => safe(() => updateItem(item.id, { z: meters(v) }))}
                  />
                )}
              </div>
              <p className="field-note">
                {isWallPegboard
                  ? '紧贴桌后墙面并保留 1.2 cm 挂轨间隙，可直接沿墙面拖拽调整左右位置与离桌高度。'
                  : isWallOutletWall
                    ? '紧贴桌后墙面安装，可沿墙面拖拽调整左右位置与离地高度。'
                    : item.surface === 'floor'
                      ? '放置于地面参考面上，可在地面自由拖动与转向。'
                      : mountedArmBranch
                        ? `已挂载固定支架臂：水平半径受 ${(mountedArmBranch.dMin * 100).toFixed(1)}–${(mountedArmBranch.dMax * 100).toFixed(1)} cm 机械工作域物理限制（当前 ${(mountedArmBranch.reachDistance * 100).toFixed(1)} cm）。`
                        : '以桌面中心为原点，底部自动贴合桌面。'}
              </p>
            </section>
            {!isWallMountedItem && (
              <section className="property-section">
                <h4>
                  <RotateCcw size={15} />
                  旋转角度
                </h4>
                <NumberField
                  label="绕竖轴旋转"
                  value={Math.round(item.rotation * 10) / 10}
                  min={-360}
                  max={360}
                  step={5}
                  unit="°"
                  onChange={(v) => safe(() => updateItem(item.id, { rotation: v }))}
                />
                <div className="rotation-presets">
                  {[0, 45, 90, 180].map((v) => (
                    <button
                      key={v}
                      className={item.rotation === v ? 'active' : ''}
                      onClick={() => safe(() => updateItem(item.id, { rotation: v }))}
                    >
                      {v}°
                    </button>
                  ))}
                </div>
              </section>
            )}
            <CableConnectionsSection item={item} onSafe={safe} />
          </>
        )}
        {item?.kind !== 'imported' && (
          <section className="property-section">
            <h4>
              <span className="color-icon" />
              {item?.kind === 'macbook' ? '官方机身配色' : item ? '主体颜色' : '桌面材质与颜色'}
            </h4>
            {!item && (
              <div style={{ marginBottom: 10 }}>
                <div className="desk-shape-presets" role="group" aria-label="桌面表面材质">
                  {(
                    [
                      { value: 'wood', label: '自然木纹' },
                      { value: 'solid', label: '纯色无纹' },
                    ] as const
                  ).map((opt) => {
                    const active = (desk.finish ?? 'wood') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={active ? 'active' : ''}
                        aria-pressed={active}
                        onClick={() =>
                          safe(() =>
                            commit((p) => {
                              p.desk.finish = opt.value;
                            }),
                          )
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {item?.kind === 'macbook' ? (
              <>
                <div className="swatches">
                  {macbookOfficialColors(item.size).map((c) => (
                    <button
                      key={c.hex}
                      title={c.label}
                      aria-label={`选择配色 ${c.label}`}
                      aria-pressed={item.color.toLowerCase() === c.hex.toLowerCase()}
                      style={{ backgroundColor: c.hex }}
                      onClick={() => safe(() => updateItem(item.id, { color: c.hex }))}
                    />
                  ))}
                </div>
                <div className="material-caption">
                  <span>
                    {macbookOfficialColors(item.size).find(
                      (c) => c.hex.toLowerCase() === item.color.toLowerCase(),
                    )?.label ?? '苹果官方配色'}
                  </span>
                  <code>{item.color}</code>
                </div>
              </>
            ) : (
              <>
                <div className="swatches">
                  {(item?.kind === 'mouse'
                    ? mousePresetById((item.mouse ?? defaultMouseSettings()).modelId).colors.map(
                        (c) => c.hex,
                      )
                    : item?.kind === 'controller'
                      ? controllerPresetById(
                          (item.controller ?? defaultControllerSettings()).model,
                        ).colors.map((c) => c.hex)
                      : item?.kind === 'mousepad'
                        ? MOUSEPAD_COLOR_SWATCHES.map((c) => c.hex)
                        : item?.kind === 'speaker'
                          ? SPEAKER_COLORS.map((c) => c.hex)
                          : item?.kind === 'keyboard'
                            ? [
                                KEYBOARD_THEME_SPECS.white.chassisHex,
                                KEYBOARD_THEME_SPECS.black.chassisHex,
                              ]
                            : item
                              ? ['#dfe2e7', '#c8cdd4', '#343c49', '#e3d5bf', '#e3e8ee', '#c9d6e5']
                              : swatches
                  ).map((color) => (
                    <button
                      key={color}
                      title={color}
                      aria-label={`选择颜色 ${color}`}
                      aria-pressed={(item ? item.color : desk.color) === color}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        safe(() =>
                          item
                            ? updateItem(item.id, {
                                color,
                                ...(item.kind === 'keyboard'
                                  ? {
                                      keyboard: {
                                        ...(item.keyboard ?? {
                                          ...defaultKeyboardSettings(),
                                          layout: matchKeyboardLayout(item.size),
                                        }),
                                        theme: resolveKeyboardTheme(color),
                                      },
                                    }
                                  : {}),
                              })
                            : commit((p) => {
                                p.desk.color = color;
                              }),
                        )
                      }
                    />
                  ))}
                  <label className="custom-color" title="自定义颜色">
                    <input
                      type="color"
                      aria-label="自定义颜色"
                      value={item ? item.color : desk.color}
                      onChange={(e) =>
                        safe(() =>
                          item
                            ? updateItem(item.id, {
                                color: e.target.value,
                                ...(item.kind === 'keyboard'
                                  ? {
                                      keyboard: {
                                        ...(item.keyboard ?? {
                                          ...defaultKeyboardSettings(),
                                          layout: matchKeyboardLayout(item.size),
                                        }),
                                        theme: resolveKeyboardTheme(e.target.value),
                                      },
                                    }
                                  : {}),
                              })
                            : commit((p) => {
                                p.desk.color = e.target.value;
                              }),
                        )
                      }
                    />
                    <span>＋</span>
                  </label>
                </div>
                <div className="material-caption">
                  <span>
                    {item
                      ? '为这件物品换一种心情'
                      : desk.finish === 'solid'
                        ? '纯色无纹 · 哑光桌面'
                        : '自然木纹 · 哑光实木'}
                  </span>
                  <code>{item ? item.color : desk.color}</code>
                </div>
              </>
            )}
          </section>
        )}
        {item && isOutOfBounds(item, desk, project.items) && (
          <div className="warning-box">
            <TriangleAlert size={16} />
            <p>
              {isWallMountedItem
                ? '壁挂物品超出了桌后墙面可用范围。可在墙面上拖动位置或调整高度。'
                : item.surface === 'shelf'
                  ? '物品超出了等宽层架范围。可以调整位置或层架纵深；这不会阻止保存。'
                  : '物品超出了桌面边缘。可以调整位置或尺寸；这不会阻止保存。'}
            </p>
          </div>
        )}
        {item &&
          (() => {
            const collisions = findItemCollisions(item, desk, project.items);
            if (!collisions.length) return null;
            return (
              <div className="warning-box">
                <TriangleAlert size={16} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0 }}>与「{collisions[0]}」发生物理模型重叠（穿模）。</p>
                  <button
                    type="button"
                    style={{ marginTop: 6, fontSize: 12, padding: '2px 8px' }}
                    onClick={() =>
                      safe(() => {
                        const resolved = resolveItemPositionWithCollisions(
                          item,
                          {
                            x: item.x,
                            z: item.z,
                            ...(typeof item.wallY === 'number' ? { wallY: item.wallY } : {}),
                          },
                          desk,
                          project.items,
                        );
                        updateItem(item.id, {
                          x: resolved.x,
                          z: resolved.z,
                          ...(typeof resolved.wallY === 'number' ? { wallY: resolved.wallY } : {}),
                        });
                      })
                    }
                  >
                    一键自动避让分离
                  </button>
                </div>
              </div>
            );
          })()}
        {item && (
          <div className="item-actions">
            <button onClick={() => safe(duplicate)}>
              <Copy size={15} />
              复制物品
            </button>
            <button className="danger-text" onClick={() => safe(remove)}>
              <Trash2 size={15} />
              删除
            </button>
          </div>
        )}
        <div className="inspector-bottom">
          <span className="tiny-dot" />{' '}
          {item?.kind === 'screenLamp'
            ? '挂灯随显示器移动，不单独占用桌面'
            : item?.kind === 'monitorArm'
              ? '固定臂长支架臂实时跟随显示器并受物理限位约束，支持理线'
              : item
                ? '选中物品可直接在桌面拖动'
                : '按照实际尺寸，安心规划你的桌搭'}
        </div>
      </div>
    </aside>
  );
}

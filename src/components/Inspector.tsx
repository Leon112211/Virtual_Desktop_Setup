// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
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
import { useI18n } from '../i18n';
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
  MAX_SCREEN_YAW,
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
  const { lang } = useI18n();
  const t = (zh: string, en: string) => (lang === 'en' ? en : zh);

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
          t(
            '参数超出允许范围，或场景已达到模型预算。请减小尺寸或移除部分物品。',
            'Value out of allowed range, or scene polygon budget reached.',
          ),
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
    <aside className="inspector panel" aria-label={t('属性面板', 'Inspector Panel')}>
      <div className="panel-heading">
        <h2>{item ? t('物品属性', 'Item Properties') : t('桌子设置', 'Desk Settings')}</h2>
        <SlidersHorizontal size={16} />
      </div>
      <div className="inspector-scroll">
        <div className="selection-heading">
          <div className="selection-type">
            {item
              ? item.kind === 'imported'
                ? t('导入模型', 'Custom Model')
                : t('当前选中', 'Selected Item')
              : t('一切，从一张好桌子开始', 'Everything starts with the right desk')}
          </div>
          <h3>{item ? item.name : t('你的专属工作台', 'Your Desk Setup')}</h3>
          <p>
            {item
              ? t('微调每一个细节，找到舒服的位置。', 'Fine-tune dimensions, pose, and placement.')
              : t('让尺寸与真实空间刚刚好。', 'Match true-to-life room dimensions.')}
          </p>
        </div>
        {item && (
          <label className="text-field">
            {t('物品名称', 'Item Name')}
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
              <Ruler size={15} /> {t('物品尺寸', 'Dimensions')}
              {item.kind === 'imported' && (
                <span className="inline-tag">
                  <LockKeyhole size={10} />
                  {t('等比', 'Uniform')}
                </span>
              )}
            </h4>
            {isMonitor && monitor ? (
              <>
                <div
                  className="desk-shape-presets"
                  role="group"
                  aria-label={t('显示器模具', 'Monitor Style')}
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
                    {t('商务曲背款', 'Curved-Back Pro')}
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
                    {t('一体平背款', 'Unibody Flat-Back')}
                  </button>
                </div>

                {isStudioDisplay ? (
                  <>
                    <div
                      className="desk-shape-presets"
                      role="group"
                      aria-label={t('一体显示器支架类型', 'Unibody Stand Type')}
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
                      {t('27" 5K 一体镜面屏 · 标准尺寸 ', '27" 5K Unibody Display · ')}
                      {(item.size.width * 100).toFixed(1)} × {(item.size.height * 100).toFixed(1)} ×{' '}
                      {(item.size.depth * 100).toFixed(1)} cm ·{' '}
                      {STUDIO_DISPLAY_PRESETS[studioStandType].weightKg} kg
                      {baseTier ? ` · ${baseTier.label}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      className="monitor-presets"
                      role="group"
                      aria-label={t('显示器尺寸预设', 'Screen Size Presets')}
                    >
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
                      {lang === 'en'
                        ? `Panel ${cm(monitor.screenWidth)} × ${cm(monitor.screenHeight)} cm (${screenInches(item.size, monitorMold).toFixed(1)}", 16:9), total height ${cm(item.size.height)} cm`
                        : `屏幕 ${cm(monitor.screenWidth)} × ${cm(monitor.screenHeight)} cm（${screenInches(item.size, monitorMold).toFixed(1)} 寸，16:9），总高 ${cm(item.size.height)} cm`}
                      {baseTier ? ` · ${baseTier.label}` : ''}
                    </p>
                    <div className="field-grid">
                      <NumberField
                        label={t('面板宽度', 'Panel Width')}
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
                        label={t('支架高度', 'Stand Height')}
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
                        label={t('底座深度', 'Base Depth')}
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
                      aria-label={t('底部前置 Hub 状态', 'Front Quick-Access Hub')}
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
                        {t('前置 Hub 弹出', 'Pop-Out Hub Open')}
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
                        {t('前置 Hub 收回', 'Pop-Out Hub Stowed')}
                      </button>
                    </div>
                    <p className="field-note">
                      {t(
                        '内置竖向 1× USB-A + 1× USB-C 前置 Hub，可直接左键点击显示器左下下巴 Hub 模块弹出或收回。',
                        'Built-in 1× USB-A + 1× USB-C quick hub; left-click the bottom-left chin module in 3D to toggle.',
                      )}
                    </p>
                  </>
                )}
              </>
            ) : item.kind === 'keyboard' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                {lang === 'en'
                  ? `Standard layout ${(item.size.width * 100).toFixed(1)} × ${(item.size.depth * 100).toFixed(1)} × ${(item.size.height * 100).toFixed(1)} cm (select 60%–100% layout below)`
                  : `标准配列尺寸 ${(item.size.width * 100).toFixed(1)} × ${(item.size.depth * 100).toFixed(1)} × ${(item.size.height * 100).toFixed(1)} cm（不支持自定义，请在下方切换 60%–100% 配列）`}
              </p>
            ) : item.kind === 'gamingLaptop' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                {lang === 'en'
                  ? `Standard chassis ${(item.size.width * 100).toFixed(1)} × ${(item.size.depth * 100).toFixed(1)} × ${(item.size.height * 100).toFixed(1)} cm (switch screen size below)`
                  : `标准机型尺寸 ${(item.size.width * 100).toFixed(1)} × ${(item.size.depth * 100).toFixed(1)} × ${(item.size.height * 100).toFixed(1)} cm（不支持自定义，请在下方切换机型尺寸）`}
              </p>
            ) : item.kind === 'macbook' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                {lang === 'en'
                  ? `Unibody chassis ${(item.size.width * 100).toFixed(2)} × ${(item.size.depth * 100).toFixed(2)} × ${(item.size.height * 100).toFixed(2)} cm (select size preset below)`
                  : `一体机身尺寸 ${(item.size.width * 100).toFixed(2)} × ${(item.size.depth * 100).toFixed(2)} × ${(item.size.height * 100).toFixed(2)} cm（请在下方选择机型尺寸预设）`}
              </p>
            ) : item.kind === 'mouse' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                {lang === 'en'
                  ? `1:1 shell ${(item.size.width * 1000).toFixed(1)} × ${(item.size.depth * 1000).toFixed(1)} × ${(item.size.height * 1000).toFixed(1)} mm (switch Wireless / Wired below)`
                  : `1:1 对称模具尺寸 ${(item.size.width * 1000).toFixed(1)} × ${(item.size.depth * 1000).toFixed(1)} × ${(item.size.height * 1000).toFixed(1)} mm（请在下方切换经典无线款 / 经典有线款）`}
              </p>
            ) : item.kind === 'controller' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                {lang === 'en'
                  ? `1:1 grip ${(item.size.width * 1000).toFixed(0)} × ${(item.size.depth * 1000).toFixed(0)} × ${(item.size.height * 1000).toFixed(0)} mm (switch Symmetrical / Asymmetric below)`
                  : `1:1 标准握持尺寸 ${(item.size.width * 1000).toFixed(0)} × ${(item.size.depth * 1000).toFixed(0)} × ${(item.size.height * 1000).toFixed(0)} mm（请在下方切换摇杆布局款式）`}
              </p>
            ) : item.kind === 'powerStrip' || item.kind === 'wallOutlet' ? (
              <p className="field-note monitor-note" style={{ marginTop: 0 }}>
                {lang === 'en'
                  ? `1:1 dimensions ${(item.size.width * 100).toFixed(1)} × ${(item.size.depth * 100).toFixed(1)} × ${(item.size.height * 100).toFixed(1)} cm (computed automatically from gang & USB configuration)`
                  : `标准 1:1 尺寸 ${(item.size.width * 100).toFixed(1)} × ${(item.size.depth * 100).toFixed(1)} × ${(item.size.height * 100).toFixed(1)} cm（随下方孔位配列与 USB 模块自动计算）`}
              </p>
            ) : item.kind === 'mousepad' ? (
              <MousepadSizeFields item={item} onSafe={safe} />
            ) : (
              <div className="field-grid">
                <NumberField
                  label={t('宽度', 'Width')}
                  value={cm(item.size.width)}
                  min={item.kind === 'imported' ? 0.5 : 1}
                  max={500}
                  onChange={(v) => updateSize('width', v)}
                />
                <NumberField
                  label={t('深度', 'Depth')}
                  value={cm(item.size.depth)}
                  min={item.kind === 'imported' ? 0.5 : 1}
                  max={500}
                  onChange={(v) => updateSize('depth', v)}
                />
                <NumberField
                  label={t('高度', 'Height')}
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
              {t('屏幕姿态', 'Screen Pose')}
            </h4>
            <div className="field-grid">
              <NumberField
                label={t('俯仰角度', 'Tilt')}
                value={pose.pitchDeg}
                min={isStudioDisplay ? -5 : -MAX_PITCH}
                max={isStudioDisplay ? 25 : MAX_PITCH}
                step={5}
                unit="°"
                onChange={(v) => safe(() => updateItem(item.id, { pitch: v }))}
              />
              {!hasMonitorArm && (
                <NumberField
                  label={t('屏幕左右旋转', 'Swivel')}
                  value={pose.screenYawDeg}
                  min={-MAX_SCREEN_YAW}
                  max={MAX_SCREEN_YAW}
                  step={5}
                  unit="°"
                  onChange={(v) => safe(() => updateItem(item.id, { screenYaw: v }))}
                />
              )}
              <NumberField
                label={t('屏幕翻转', 'Pivot')}
                value={pose.rollDeg}
                min={-MAX_ROLL}
                max={MAX_ROLL}
                step={5}
                unit="°"
                onChange={(v) => safe(() => updateItem(item.id, { roll: v }))}
              />
              {(!isStudioDisplay || studioStandType === 'height' || hasMonitorArm) && (
                <NumberField
                  label={t('屏幕高度', 'Height Lift')}
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
                ? t(
                    '已挂载显示器支架臂，屏幕高度由下长臂与气压上臂联动提供（支持 -32 ~ +36 cm，受防穿模限位约束）。',
                    'Mounted on monitor arm: vertical lift (-32 to +36 cm) is driven by the articulated arm within anti-clipping limits.',
                  )
                : isStudioDisplay
                  ? t(
                      '固定 L 型底座滑轨行程最大 10.5 cm，调节高度时屏幕沿斜臂平行滑动；纯屏幕可左右各 30° 旋转（底座固定），所有姿态均受防穿模物理限位约束。',
                      'L-stand slide travel up to 10.5 cm; screen swivels ±30° independently while base stays stationary.',
                    )
                  : t(
                      '固定倾斜立柱滑轨（行程 -5 ~ +5 cm），底座可整体旋转，纯屏幕也可单独左右各 30° 旋转（底座固定），所有姿态均受防穿模物理限位约束。',
                      'Inclined column travel (-5 to +5 cm); supports both full-base rotation and ±30° independent screen swivel.',
                    )}
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
                {isWallMountedItem
                  ? t('墙面横向定位', 'Wall Horizontal Position')
                  : t('摆放位置', 'Placement')}
              </h4>
              <div className="field-grid">
                <NumberField
                  label={t('左右位置', 'Left / Right (X)')}
                  value={cm(item.x)}
                  min={-500}
                  max={500}
                  onChange={(v) => safe(() => updateItem(item.id, { x: meters(v) }))}
                />
                {!isWallMountedItem && (
                  <NumberField
                    label={t('前后位置', 'Front / Back (Z)')}
                    value={cm(item.z)}
                    min={-500}
                    max={500}
                    onChange={(v) => safe(() => updateItem(item.id, { z: meters(v) }))}
                  />
                )}
              </div>
              <p className="field-note">
                {isWallPegboard
                  ? t(
                      '紧贴桌后墙面并保留 1.2 cm 挂轨间隙，可直接沿墙面拖拽调整左右位置与离桌高度。',
                      'Mounted flush on backdrop wall with 1.2 cm rail standoff; drag directly along the wall.',
                    )
                  : isWallOutletWall
                    ? t(
                        '紧贴桌后墙面安装，可沿墙面拖拽调整左右位置与离地高度。',
                        'Mounted on backdrop wall; drag along the wall to adjust X and floor height.',
                      )
                    : item.surface === 'floor'
                      ? t(
                          '放置于地面参考面上，可在地面自由拖动与转向。',
                          'Placed on the floor plane under/around the desk.',
                        )
                      : mountedArmBranch
                        ? lang === 'en'
                          ? `Tethered to monitor arm: horizontal reach constrained to ${(mountedArmBranch.dMin * 100).toFixed(1)}–${(mountedArmBranch.dMax * 100).toFixed(1)} cm (current ${(mountedArmBranch.reachDistance * 100).toFixed(1)} cm).`
                          : `已挂载固定支架臂：水平半径受 ${(mountedArmBranch.dMin * 100).toFixed(1)}–${(mountedArmBranch.dMax * 100).toFixed(1)} cm 机械工作域物理限制（当前 ${(mountedArmBranch.reachDistance * 100).toFixed(1)} cm）。`
                        : t(
                            '以桌面中心为原点，底部自动贴合桌面。',
                            'Origin is at desk center; base rests flush on the surface.',
                          )}
              </p>
            </section>
            {!isWallMountedItem && (
              <section className="property-section">
                <h4>
                  <RotateCcw size={15} />
                  {t('旋转角度', 'Rotation')}
                </h4>
                <NumberField
                  label={
                    isMonitor && !hasMonitorArm
                      ? t('底座整体旋转', 'Whole-Stand Yaw')
                      : t('绕竖轴旋转', 'Yaw Angle')
                  }
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
              {item?.kind === 'macbook'
                ? t('机身阳极配色', 'Anodized Finish')
                : item
                  ? t('主体颜色', 'Body Color')
                  : t('桌面材质与颜色', 'Desktop Finish & Color')}
            </h4>
            {!item && (
              <div style={{ marginBottom: 10 }}>
                <div
                  className="desk-shape-presets"
                  role="group"
                  aria-label={t('桌面表面材质', 'Desktop Material')}
                >
                  {(
                    [
                      { value: 'wood', label: t('自然木纹', 'Natural Wood') },
                      { value: 'solid', label: t('纯色无纹', 'Matte Solid') },
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
                      aria-label={`${t('选择配色', 'Select finish')} ${c.label}`}
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
                    )?.label ?? t('一体铝合金配色', 'Anodized Aluminum')}
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
                      aria-label={`${t('选择颜色', 'Select color')} ${color}`}
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
                  <label className="custom-color" title={t('自定义颜色', 'Custom Color')}>
                    <input
                      type="color"
                      aria-label={t('自定义颜色', 'Custom Color')}
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
                      ? t('为这件物品换一种配色', 'Pick a finish for this item')
                      : desk.finish === 'solid'
                        ? t('纯色无纹 · 哑光桌面', 'Matte Solid Desktop')
                        : t('自然木纹 · 哑光实木', 'Natural Matte Wood')}
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
                ? t(
                    '壁挂物品超出了桌后墙面可用范围。可在墙面上拖动位置或调整高度。',
                    'Wall-mounted item extends past the backdrop wall bounds.',
                  )
                : item.surface === 'shelf'
                  ? t(
                      '物品超出了等宽层架范围。可以调整位置或层架纵深；这不会阻止保存。',
                      'Item overhangs the riser shelf edge; saving is still allowed.',
                    )
                  : t(
                      '物品超出了桌面边缘。可以调整位置或尺寸；这不会阻止保存。',
                      'Item overhangs the desk edge; saving is still allowed.',
                    )}
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
                  <p style={{ margin: 0 }}>
                    {lang === 'en'
                      ? `Overlapping with "${collisions[0]}".`
                      : `与「${collisions[0]}」发生物理模型重叠（穿模）。`}
                  </p>
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
                    {t('一键自动避让分离', 'Auto-Separate Items')}
                  </button>
                </div>
              </div>
            );
          })()}
        {item && (
          <div className="item-actions">
            <button onClick={() => safe(duplicate)}>
              <Copy size={15} />
              {t('复制物品', 'Duplicate')}
            </button>
            <button className="danger-text" onClick={() => safe(remove)}>
              <Trash2 size={15} />
              {t('删除', 'Delete')}
            </button>
          </div>
        )}
        <div className="inspector-bottom">
          <span className="tiny-dot" />{' '}
          {item?.kind === 'screenLamp'
            ? t(
                '挂灯随显示器移动，不单独占用桌面',
                'Light bar follows monitor without occupying desk space',
              )
            : item?.kind === 'monitorArm'
              ? t(
                  '固定臂长支架臂实时跟随显示器并受物理限位约束，支持理线',
                  'Fixed-link arm tracks mounted devices within mechanical limits',
                )
              : item
                ? t('选中物品可直接在桌面拖动', 'Drag selected item directly on the desk')
                : t('按照实际尺寸，安心规划你的桌搭', 'Plan your workspace at true 1:1 scale')}
        </div>
      </div>
    </aside>
  );
}

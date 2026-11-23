// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useMemo, useState } from 'react';
import { Cable as CableIcon, MousePointerClick, Plus, Trash2, Zap } from 'lucide-react';
import {
  arePortKindsCompatible,
  cableEffectiveLengths,
  cableMeta,
  formatCableDisplayName,
  isPortCompatibleWithCable,
  POWER_CABLE_PRESETS,
  resolveCablePlugEnds,
  SIGNAL_CABLE_PRESETS,
} from '../domain/cable';
import { computeCablePath } from '../domain/cableRouting';
import { devicePorts, isPortKind, type CableKind } from '../domain/ports';
import {
  canAcPlugFitOutlet,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  isAcWallPlugKind,
  PLUG_SPEC_META,
} from '../domain/power';
import { editorErrorMessage } from '../domain/screenLamp';
import { useI18n } from '../i18n';
import { useEditor, type WiringPreset } from '../store/editorStore';

type ActiveSelection =
  { type: 'powerPreset'; presetId: string } | { type: 'signalPreset'; presetId: string };

export function CableStudioPanel({ onError }: { onError: (m: string) => void }) {
  const { lang } = useI18n();
  const t = (zh: string, en: string) => (lang === 'en' ? en : zh);

  const {
    project,
    selectedCableId,
    wiringMode,
    wiringDraft,
    setWiringMode,
    updateWiringPreset,
    addCable,
    removeCable,
    selectCable,
    select,
  } = useEditor();

  const [selection, setSelection] = useState<ActiveSelection>({
    type: 'powerPreset',
    presetId: POWER_CABLE_PRESETS[0].id,
  });
  const [customLengthM, setCustomLengthM] = useState<number>(POWER_CABLE_PRESETS[0].lengthM);
  const [extraPlugAccessory, setExtraPlugAccessory] = useState<'' | 'ganAdapter' | 'appleDuckhead'>(
    '',
  );
  const [fromKey, setFromKey] = useState<string>('');
  const [toKey, setToKey] = useState<string>('floor:auto');

  const activePowerPreset =
    selection.type === 'powerPreset'
      ? (POWER_CABLE_PRESETS.find((p) => p.id === selection.presetId) ?? POWER_CABLE_PRESETS[0])
      : null;
  const activeSignalPreset =
    selection.type === 'signalPreset'
      ? (SIGNAL_CABLE_PRESETS.find((p) => p.id === selection.presetId) ?? SIGNAL_CABLE_PRESETS[0])
      : null;
  const activeKind: CableKind = activeSignalPreset
    ? activeSignalPreset.kind
    : activePowerPreset!.kind;
  const activePortSpec = activeSignalPreset ?? activePowerPreset;
  const activeSpec = cableMeta[activeKind];
  const activeLabel = activePowerPreset ? activePowerPreset.name : activeSignalPreset!.label;
  const activeColor = activePowerPreset ? activePowerPreset.color : activeSignalPreset!.color;

  function choosePowerPreset(presetId: string) {
    const preset = POWER_CABLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelection({ type: 'powerPreset', presetId });
    setCustomLengthM(preset.lengthM);
    setExtraPlugAccessory('');
    setFromKey('');
    setToKey('floor:auto');
    if (wiringMode) {
      updateWiringPreset({
        kind: preset.kind,
        color: preset.color,
        lengthM: preset.lengthM,
        fromPortKind: preset.fromPortKind,
        toPortKind: preset.toPortKind,
        outletPlugType: preset.outletPlugType,
        devicePlugType: preset.devicePlugType,
        label: preset.name,
      });
    }
  }

  function chooseSignalPreset(presetId: string) {
    const preset = SIGNAL_CABLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const spec = cableMeta[preset.kind];
    setSelection({ type: 'signalPreset', presetId: preset.id });
    setCustomLengthM(spec.defaultLengthM);
    setExtraPlugAccessory('');
    setFromKey('');
    setToKey('floor:auto');
    if (wiringMode) {
      updateWiringPreset({
        kind: preset.kind,
        color: preset.color,
        lengthM: spec.defaultLengthM,
        fromPortKind: preset.fromPortKind,
        toPortKind: preset.toPortKind,
        devicePlugType: preset.fromPlugType,
        outletPlugType: preset.toPlugType,
        label: preset.label,
      });
    }
  }

  const activeExtraPlug =
    activeKind === 'usbc' || activeKind === 'magsafe' ? extraPlugAccessory || undefined : undefined;
  const resolvedOutletPlug =
    activeExtraPlug ?? activePowerPreset?.outletPlugType ?? activeSignalPreset?.toPlugType;
  const resolvedDevicePlug = activeExtraPlug
    ? activeKind === 'magsafe'
      ? undefined
      : 'usbc'
    : (activePowerPreset?.devicePlugType ?? activeSignalPreset?.fromPlugType);
  const resolvedFromPortKind: CableKind | undefined = activeExtraPlug
    ? activeKind === 'magsafe'
      ? 'magsafe'
      : 'usbc'
    : activePortSpec?.fromPortKind;
  const resolvedToPortKind: CableKind | undefined = activeExtraPlug
    ? 'power'
    : activePortSpec?.toPortKind;

  const currentWiringPreset: WiringPreset = useMemo(
    () => ({
      kind: activeKind,
      color: activeColor,
      lengthM: customLengthM,
      outletPlugType: resolvedOutletPlug,
      devicePlugType: resolvedDevicePlug,
      fromPortKind: resolvedFromPortKind,
      toPortKind: resolvedToPortKind,
      label: activeLabel,
    }),
    [
      activeKind,
      activeColor,
      customLengthM,
      resolvedOutletPlug,
      resolvedDevicePlug,
      resolvedFromPortKind,
      resolvedToPortKind,
      activeLabel,
    ],
  );

  const hasAcPlugEnd = isAcWallPlugKind(resolvedOutletPlug);

  // All compatible source device ports currently present in the scene
  const compatibleSources = useMemo(() => {
    const out: {
      key: string;
      itemId: string;
      itemName: string;
      portId: string;
      portLabel: string;
      kind: CableKind;
    }[] = [];
    for (const item of project.items) {
      if (!isPortKind(item.kind)) continue;
      const isOutletDevice = item.kind === 'powerStrip' || item.kind === 'wallOutlet';
      for (const p of devicePorts(item)) {
        const isOutletSlot = isOutletDevice && p.id.startsWith('slot-');
        if (hasAcPlugEnd) {
          // Source dropdown selects the powered device (never an AC socket or USB hub output when using a wall adapter)
          if (isOutletSlot) continue;
          const expectedDevKind = resolvedFromPortKind ?? activeKind;
          if (expectedDevKind !== 'power' && isOutletDevice) continue;
          if (p.kind !== expectedDevKind) continue;
        } else {
          if (isOutletSlot) continue;
          const matchesPreset =
            resolvedFromPortKind && resolvedToPortKind
              ? p.kind === resolvedFromPortKind || p.kind === resolvedToPortKind
              : isPortCompatibleWithCable(p.kind, activeKind);
          if (!matchesPreset) continue;
        }
        out.push({
          key: `${item.id}:${p.id}`,
          itemId: item.id,
          itemName: item.name,
          portId: p.id,
          portLabel: p.label,
          kind: p.kind,
        });
      }
    }
    return out;
  }, [project.items, activeKind, hasAcPlugEnd, resolvedFromPortKind, resolvedToPortKind, lang]);

  const effectiveSource =
    compatibleSources.find((s) => s.key === fromKey) ?? compatibleSources[0] ?? null;

  // All compatible target device ports on OTHER devices
  const compatibleTargets = useMemo(() => {
    if (!effectiveSource) return [];
    const out: {
      key: string;
      itemId: string;
      itemName: string;
      portId: string;
      portLabel: string;
      kind: CableKind;
    }[] = [];
    for (const item of project.items) {
      if (item.id === effectiveSource.itemId || !isPortKind(item.kind)) continue;
      const isOutletDevice = item.kind === 'powerStrip' || item.kind === 'wallOutlet';
      const outletType =
        item.kind === 'powerStrip'
          ? (item.powerStrip ?? defaultPowerStripSettings()).outletType
          : item.kind === 'wallOutlet'
            ? (item.wallOutlet ?? defaultWallOutletSettings()).outletType
            : 'combo5';
      for (const p of devicePorts(item)) {
        const isOutletSlot = isOutletDevice && p.id.startsWith('slot-');
        let compat = false;
        if (hasAcPlugEnd) {
          // With an AC wall plug / GaN charger on the other end, target MUST be a compatible AC receptacle slot
          compat = isOutletSlot && canAcPlugFitOutlet(resolvedOutletPlug, outletType);
        } else if (resolvedFromPortKind && resolvedToPortKind) {
          const expectedTarget =
            effectiveSource.kind === resolvedFromPortKind
              ? resolvedToPortKind
              : resolvedFromPortKind;
          compat = !isOutletSlot && p.kind === expectedTarget;
        } else {
          compat =
            !isOutletSlot &&
            isPortCompatibleWithCable(p.kind, activeKind) &&
            arePortKindsCompatible(effectiveSource.kind, p.kind);
        }
        if (compat) {
          out.push({
            key: `dev:${item.id}:${p.id}`,
            itemId: item.id,
            itemName: item.name,
            portId: p.id,
            portLabel: p.label,
            kind: p.kind,
          });
        }
      }
    }
    return out;
  }, [
    project.items,
    effectiveSource,
    activeKind,
    hasAcPlugEnd,
    resolvedOutletPlug,
    resolvedFromPortKind,
    resolvedToPortKind,
    lang,
  ]);

  function handleConnect() {
    if (!effectiveSource) {
      onError(
        t(
          '当前桌面缺少可接此线缆型号的设备接口，请先添加对应设备或插座。',
          'No compatible device ports found on the desk. Add a matching device or outlet first.',
        ),
      );
      return;
    }
    try {
      const fromItem = project.items.find((i) => i.id === effectiveSource.itemId);
      const outletPlug = resolvedOutletPlug;
      const devicePlug = resolvedDevicePlug;
      if (toKey.startsWith('dev:')) {
        const [, targetId, targetPortId] = toKey.split(':');
        const toItem = project.items.find((i) => i.id === targetId);
        const targetPort = compatibleTargets.find((tItem) => tItem.key === toKey);
        const plugEnds = resolveCablePlugEnds({
          fromKind: fromItem?.kind,
          fromPortId: effectiveSource.portId,
          fromPortKind: effectiveSource.kind,
          toKind: toItem?.kind,
          toPortId: targetPortId,
          toPortKind: targetPort?.kind,
          cableKind: activeKind,
          outletPlugType: outletPlug,
          devicePlugType: devicePlug,
        });
        const id = addCable({
          kind: activeKind,
          from: { type: 'device', itemId: effectiveSource.itemId, portId: effectiveSource.portId },
          to: { type: 'device', itemId: targetId, portId: targetPortId },
          routeViaArm: true,
          viaStandSlot: true,
          color: activeColor,
          lengthM: customLengthM,
          lengthIncludesConnectors: true,
          ...plugEnds,
        });
        selectCable(id);
      } else {
        const drop = (toKey.split(':')[1] ?? 'auto') as 'auto' | 'grommet' | 'backEdge';
        const plugEnds = resolveCablePlugEnds({
          fromKind: fromItem?.kind,
          fromPortId: effectiveSource.portId,
          fromPortKind: effectiveSource.kind,
          cableKind: activeKind,
          outletPlugType: outletPlug,
          devicePlugType: devicePlug,
        });
        const id = addCable({
          kind: activeKind,
          from: { type: 'device', itemId: effectiveSource.itemId, portId: effectiveSource.portId },
          to: { type: 'floor', drop },
          drop,
          routeViaArm: true,
          viaStandSlot: true,
          color: activeColor,
          lengthM: customLengthM,
          lengthIncludesConnectors: true,
          ...plugEnds,
        });
        selectCable(id);
      }
    } catch (error) {
      onError(
        editorErrorMessage(
          error,
          t('线缆数量已达上限或端口连接失败。', 'Cable limit reached or port connection failed.'),
        ),
      );
    }
  }

  const cables = project.cables ?? [];

  return (
    <div className="library-scroll cable-studio-scroll">
      {/* 1. Power & Charging Cables */}
      <section
        className="cable-zone-section"
        aria-label={t('充电线与电源线专区', 'Power & Charging Cables')}
      >
        <div className="section-caption cable-zone-header">
          <span>
            <Zap size={12} /> {t('充电线 / 电源线专区', 'Power & Charging')}
          </span>
          <span>
            {lang === 'en'
              ? `${POWER_CABLE_PRESETS.length} types`
              : `${POWER_CABLE_PRESETS.length} 款`}
          </span>
        </div>
        <div className="power-cable-showcase">
          {POWER_CABLE_PRESETS.map((preset) => {
            const active = selection.type === 'powerPreset' && selection.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`power-cable-card ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => choosePowerPreset(preset.id)}
              >
                <div className="power-cable-card-top">
                  <span
                    className="cable-swatch-dot"
                    style={{ backgroundColor: preset.color }}
                    aria-hidden="true"
                  />
                  <strong>{preset.name}</strong>
                  <span className="cable-badge">{preset.badge}</span>
                </div>
                <small>{preset.specText}</small>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Signal & Audio Cables */}
      <section
        className="cable-zone-section"
        aria-label={t('信号与音频线缆', 'Signal & Audio Cables')}
      >
        <div className="section-caption cable-zone-header">
          <span>
            <CableIcon size={12} /> {t('信号与音频线', 'Signal & Audio')}
          </span>
          <span>
            {lang === 'en'
              ? `${SIGNAL_CABLE_PRESETS.length} types`
              : `${SIGNAL_CABLE_PRESETS.length} 类`}
          </span>
        </div>
        <div className="signal-cable-grid">
          {SIGNAL_CABLE_PRESETS.map((preset) => {
            const active = selection.type === 'signalPreset' && selection.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`signal-cable-pill ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => chooseSignalPreset(preset.id)}
              >
                <span
                  className="cable-swatch-dot"
                  style={{ backgroundColor: preset.color }}
                  aria-hidden="true"
                />
                <span>{preset.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Manual Cable Configuration */}
      <section className="cable-staging-box" aria-label={t('手动选线与接线', 'Cable Setup')}>
        <div className="cable-staging-title">
          <strong>{activeLabel}</strong>
          <small>Ø{(activeSpec.radius * 2000).toFixed(1)}mm</small>
        </div>

        <div
          className="cable-length-presets"
          role="group"
          aria-label={t('左栏线缆长度', 'Cable Length')}
        >
          {activeSpec.presetLengthsM.map((len) => (
            <button
              key={len}
              type="button"
              className={Math.abs(customLengthM - len) < 1e-4 ? 'active' : ''}
              onClick={() => {
                setCustomLengthM(len);
                if (wiringMode) {
                  updateWiringPreset({ ...currentWiringPreset, lengthM: len });
                }
              }}
            >
              {activeKind === 'magsafe' ? t(`定长 ${len}m`, `Fixed ${len}m`) : `${len}m`}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`cable-3d-trigger ${wiringMode ? 'active' : ''}`}
          aria-pressed={wiringMode}
          onClick={() => setWiringMode(!wiringMode, wiringMode ? null : currentWiringPreset)}
        >
          <MousePointerClick size={14} />
          <span>
            {wiringMode
              ? wiringDraft
                ? t(
                    '正在 3D 连线 · 点击绿色终点或取消',
                    '3D Wiring · Click green target port or cancel',
                  )
                : t('退出 3D 点选端口接线', 'Exit 3D Port Wiring')
              : t('进入 3D 点选端口接线', 'Start 3D Interactive Port Wiring')}
          </span>
        </button>

        <div className="cable-manual-pair">
          <select
            aria-label={t('左侧起点接口', 'Source Port')}
            value={effectiveSource?.key ?? ''}
            onChange={(e) => {
              setFromKey(e.target.value);
              setToKey('floor:auto');
            }}
          >
            {compatibleSources.length === 0 ? (
              <option value="">{t('暂无兼容起点设备', 'No compatible source device')}</option>
            ) : (
              compatibleSources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.itemName} · {s.portLabel}
                </option>
              ))
            )}
          </select>

          <select
            aria-label={t('左侧终点接口', 'Target Port')}
            value={toKey}
            onChange={(e) => setToKey(e.target.value)}
          >
            <option value="floor:auto">
              {t('桌下垂落（自动走线孔）', 'Drop Under Desk (Auto Grommet)')}
            </option>
            <option value="floor:grommet">{t('穿桌面走线孔垂落', 'Drop via Desk Grommet')}</option>
            <option value="floor:backEdge">{t('绕桌后缘垂落', 'Drop Over Back Edge')}</option>
            {compatibleTargets.map((tItem) => (
              <option key={tItem.key} value={tItem.key}>
                {tItem.itemName} · {tItem.portLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="primary-button cable-connect-btn"
            disabled={!effectiveSource}
            onClick={handleConnect}
          >
            <Plus size={14} />
            <span>{t('确认接线', 'Connect Cable')}</span>
          </button>

          {(activeKind === 'usbc' || activeKind === 'magsafe') && (
            <select
              aria-label={t('额外插头配件', 'Optional Plug Add-on')}
              value={extraPlugAccessory}
              onChange={(e) => {
                const next = e.target.value as '' | 'ganAdapter' | 'appleDuckhead';
                setExtraPlugAccessory(next);
                const nextOutletPlug =
                  (next || undefined) ??
                  activePowerPreset?.outletPlugType ??
                  activeSignalPreset?.toPlugType;
                const nextDevicePlug = next
                  ? activeKind === 'magsafe'
                    ? undefined
                    : 'usbc'
                  : (activePowerPreset?.devicePlugType ?? activeSignalPreset?.fromPlugType);
                const nextFromPortKind: CableKind | undefined = next
                  ? activeKind === 'magsafe'
                    ? 'magsafe'
                    : 'usbc'
                  : activePortSpec?.fromPortKind;
                const nextToPortKind: CableKind | undefined = next
                  ? 'power'
                  : activePortSpec?.toPortKind;
                if (next) {
                  // Auto-select the first available AC outlet slot in the target dropdown when a charger is chosen
                  const firstSlot = project.items.find(
                    (it) => it.kind === 'powerStrip' || it.kind === 'wallOutlet',
                  );
                  if (firstSlot) {
                    const sp = devicePorts(firstSlot).find((p) => p.id.startsWith('slot-'));
                    if (sp) setToKey(`dev:${firstSlot.id}:${sp.id}`);
                  }
                }
                if (wiringMode) {
                  updateWiringPreset({
                    ...currentWiringPreset,
                    outletPlugType: nextOutletPlug,
                    devicePlugType: nextDevicePlug,
                    fromPortKind: nextFromPortKind,
                    toPortKind: nextToPortKind,
                  });
                }
              }}
            >
              <option value="">
                {t('不附带插头（纯线缆 · 额外配件另选）', 'No Wall Plug (Cable Only)')}
              </option>
              <option value="ganAdapter">
                {t('额外配件：氮化镓 (GaN) 快充头', 'Add-on: GaN Fast Charger')}
              </option>
              <option value="appleDuckhead">
                {t('额外配件：方形快充电源头', 'Add-on: Square Power Adapter')}
              </option>
            </select>
          )}
        </div>
      </section>

      {/* 4. Connected Cables */}
      <section className="cable-zone-section">
        <div className="section-caption cable-zone-header">
          <span>{t('已接线缆', 'Connected Cables')}</span>
          <span>{lang === 'en' ? `${cables.length} cables` : `${cables.length} 条`}</span>
        </div>
        {cables.length === 0 ? (
          <p className="library-note" style={{ margin: '6px 0 4px' }}>
            {t(
              '选择上方电源线或信号线，点击端口或在 3D 视图中即可自行接线。',
              'Pick a power or signal cable above, then connect ports here or directly in 3D.',
            )}
          </p>
        ) : (
          <div className="wired-cable-list">
            {cables.map((c) => {
              const spec = cableMeta[c.kind];
              const lengths = cableEffectiveLengths(c);
              const resolved = computeCablePath(c, project);
              const fromEp = c.from;
              const toEp = c.to;
              const fromDev =
                fromEp.type === 'device'
                  ? project.items.find((i) => i.id === fromEp.itemId)
                  : undefined;
              const toDev =
                toEp.type === 'device'
                  ? project.items.find((i) => i.id === toEp.itemId)
                  : undefined;
              const activePlugKind = c.toPlugType ?? c.fromPlugType;
              const isPlainSignalPlug =
                (c.kind === 'dp' || c.kind === 'usbc') &&
                (activePlugKind === 'dp' || activePlugKind === 'usbc' || activePlugKind === 'usba');
              const plugBadge =
                activePlugKind && !isPlainSignalPlug
                  ? PLUG_SPEC_META[activePlugKind].shortLabel
                  : null;
              const isSelected = selectedCableId === c.id;
              return (
                <div
                  key={c.id}
                  className={`wired-cable-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (fromDev) select(fromDev.id);
                    selectCable(c.id);
                  }}
                >
                  <div className="wired-cable-main">
                    <div className="wired-cable-heading">
                      <span
                        className="cable-swatch-dot"
                        style={{ backgroundColor: c.color }}
                        aria-hidden="true"
                      />
                      <strong>{formatCableDisplayName(c)}</strong>
                      {plugBadge && <span className="cable-badge">{plugBadge}</span>}
                      <span className="cable-len-chip">{lengths.nominalM}m</span>
                    </div>
                    <small>
                      {fromDev?.name ?? t('设备', 'Device')} →{' '}
                      {toDev?.name ??
                        (c.to.type === 'floor' && c.to.drop === 'backEdge'
                          ? t('桌后缘', 'Back Edge')
                          : t('桌下走线', 'Under Desk'))}
                      {resolved?.shortfallM && resolved.shortfallM > 0.02
                        ? lang === 'en'
                          ? ` · Short ${resolved.shortfallM.toFixed(2)}m`
                          : ` · 短 ${resolved.shortfallM.toFixed(2)}m`
                        : ''}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger-text"
                    aria-label={`${t('移除', 'Remove')} ${spec.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCable(c.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

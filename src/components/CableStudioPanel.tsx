import { useMemo, useState } from 'react';
import { Cable as CableIcon, MousePointerClick, Plus, Trash2, Zap } from 'lucide-react';
import {
  arePortKindsCompatible,
  cableEffectiveLengths,
  cableMeta,
  isPortCompatibleWithCable,
  POWER_CABLE_PRESETS,
  resolveCablePlugEnds,
  SIGNAL_CABLE_KINDS,
} from '../domain/cable';
import { computeCablePath } from '../domain/cableRouting';
import { devicePorts, isPortKind, type CableKind } from '../domain/ports';
import { PLUG_SPEC_META } from '../domain/power';
import { editorErrorMessage } from '../domain/screenLamp';
import { useEditor, type WiringPreset } from '../store/editorStore';

type ActiveSelection =
  { type: 'powerPreset'; presetId: string } | { type: 'signalKind'; kind: CableKind };

export function CableStudioPanel({ onError }: { onError: (m: string) => void }) {
  const {
    project,
    selectedCableId,
    wiringMode,
    wiringDraft,
    setWiringMode,
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
  const [fromKey, setFromKey] = useState<string>('');
  const [toKey, setToKey] = useState<string>('floor:auto');

  const activePowerPreset =
    selection.type === 'powerPreset'
      ? (POWER_CABLE_PRESETS.find((p) => p.id === selection.presetId) ?? POWER_CABLE_PRESETS[0])
      : null;
  const activeKind: CableKind =
    selection.type === 'signalKind' ? selection.kind : activePowerPreset!.kind;
  const activeSpec = cableMeta[activeKind];
  const activeLabel = activePowerPreset ? activePowerPreset.name : activeSpec.label;
  const activeColor = activePowerPreset ? activePowerPreset.color : activeSpec.color;

  function choosePowerPreset(presetId: string) {
    const preset = POWER_CABLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelection({ type: 'powerPreset', presetId });
    setCustomLengthM(preset.lengthM);
    setFromKey('');
    setToKey('floor:auto');
    if (wiringMode) {
      setWiringMode(true, {
        kind: preset.kind,
        color: preset.color,
        lengthM: preset.lengthM,
        outletPlugType: preset.outletPlugType,
        devicePlugType: preset.devicePlugType,
        label: preset.name,
      });
    }
  }

  function chooseSignalKind(kind: CableKind) {
    const spec = cableMeta[kind];
    setSelection({ type: 'signalKind', kind });
    setCustomLengthM(spec.defaultLengthM);
    setFromKey('');
    setToKey('floor:auto');
    if (wiringMode) {
      setWiringMode(true, {
        kind,
        color: spec.color,
        lengthM: spec.defaultLengthM,
        label: spec.label,
      });
    }
  }

  const currentWiringPreset: WiringPreset = useMemo(
    () => ({
      kind: activeKind,
      color: activeColor,
      lengthM: customLengthM,
      outletPlugType: activePowerPreset?.outletPlugType,
      devicePlugType: activePowerPreset?.devicePlugType,
      label: activeLabel,
    }),
    [activeKind, activeColor, customLengthM, activePowerPreset, activeLabel],
  );

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
      for (const p of devicePorts(item)) {
        if (isPortCompatibleWithCable(p.kind, activeKind)) {
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
    }
    return out;
  }, [project.items, activeKind]);

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
    }[] = [];
    for (const item of project.items) {
      if (item.id === effectiveSource.itemId || !isPortKind(item.kind)) continue;
      for (const p of devicePorts(item)) {
        if (
          isPortCompatibleWithCable(p.kind, activeKind) &&
          arePortKindsCompatible(effectiveSource.kind, p.kind)
        ) {
          out.push({
            key: `dev:${item.id}:${p.id}`,
            itemId: item.id,
            itemName: item.name,
            portId: p.id,
            portLabel: p.label,
          });
        }
      }
    }
    return out;
  }, [project.items, effectiveSource, activeKind]);

  function handleConnect() {
    if (!effectiveSource) {
      onError('当前桌面缺少可接此线缆型号的设备接口，请先添加对应设备或插座。');
      return;
    }
    try {
      const fromItem = project.items.find((i) => i.id === effectiveSource.itemId);
      if (toKey.startsWith('dev:')) {
        const [, targetId, targetPortId] = toKey.split(':');
        const toItem = project.items.find((i) => i.id === targetId);
        const plugEnds = resolveCablePlugEnds({
          fromKind: fromItem?.kind,
          fromPortId: effectiveSource.portId,
          toKind: toItem?.kind,
          toPortId: targetPortId,
          cableKind: activeKind,
          outletPlugType: activePowerPreset?.outletPlugType,
          devicePlugType: activePowerPreset?.devicePlugType,
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
          cableKind: activeKind,
          outletPlugType: activePowerPreset?.outletPlugType,
          devicePlugType: activePowerPreset?.devicePlugType,
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
      onError(editorErrorMessage(error, '线缆数量已达上限或端口连接失败。'));
    }
  }

  const cables = project.cables ?? [];

  return (
    <div className="library-scroll cable-studio-scroll">
      {/* 1. 充电线与电源线专区 */}
      <section className="cable-zone-section" aria-label="充电线与电源线专区">
        <div className="section-caption cable-zone-header">
          <span>
            <Zap size={12} /> 充电线 / 电源线专区
          </span>
          <span>{POWER_CABLE_PRESETS.length} 款</span>
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

      {/* 2. 信号与音频线缆选择 */}
      <section className="cable-zone-section" aria-label="信号与音频线缆">
        <div className="section-caption cable-zone-header">
          <span>
            <CableIcon size={12} /> 信号与音频线
          </span>
          <span>{SIGNAL_CABLE_KINDS.length} 类</span>
        </div>
        <div className="signal-cable-grid">
          {SIGNAL_CABLE_KINDS.map((kind) => {
            const active = selection.type === 'signalKind' && selection.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`signal-cable-pill ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => chooseSignalKind(kind)}
              >
                <span
                  className="cable-swatch-dot"
                  style={{ backgroundColor: cableMeta[kind].color }}
                  aria-hidden="true"
                />
                <span>{cableMeta[kind].shortLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. 自行接线配置工作台 */}
      <section className="cable-staging-box" aria-label="手动选线与接线">
        <div className="cable-staging-title">
          <strong>{activeLabel}</strong>
          <small>Ø{(activeSpec.radius * 2000).toFixed(1)}mm</small>
        </div>

        <div className="cable-length-presets" role="group" aria-label="左栏线缆长度">
          {activeSpec.presetLengthsM.map((len) => (
            <button
              key={len}
              type="button"
              className={Math.abs(customLengthM - len) < 1e-4 ? 'active' : ''}
              onClick={() => {
                setCustomLengthM(len);
                if (wiringMode) {
                  setWiringMode(true, { ...currentWiringPreset, lengthM: len });
                }
              }}
            >
              {activeKind === 'magsafe' ? `官方 ${len}m` : `${len}m`}
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
                ? '正在 3D 连线 · 点击绿色终点或取消'
                : '退出 3D 点选端口接线'
              : '进入 3D 点选端口接线'}
          </span>
        </button>

        <div className="cable-manual-pair">
          <select
            aria-label="左侧起点接口"
            value={effectiveSource?.key ?? ''}
            onChange={(e) => {
              setFromKey(e.target.value);
              setToKey('floor:auto');
            }}
          >
            {compatibleSources.length === 0 ? (
              <option value="">暂无兼容起点设备</option>
            ) : (
              compatibleSources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.itemName} · {s.portLabel}
                </option>
              ))
            )}
          </select>

          <select
            aria-label="左侧终点接口"
            value={toKey}
            onChange={(e) => setToKey(e.target.value)}
          >
            <option value="floor:auto">桌下垂落（自动走线孔）</option>
            <option value="floor:grommet">穿桌面走线孔垂落</option>
            <option value="floor:backEdge">绕桌后缘垂落</option>
            {compatibleTargets.map((t) => (
              <option key={t.key} value={t.key}>
                {t.itemName} · {t.portLabel}
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
            <span>确认接线</span>
          </button>
        </div>
      </section>

      {/* 4. 当前已接全部线缆管理 */}
      <section className="cable-zone-section">
        <div className="section-caption cable-zone-header">
          <span>已接线缆</span>
          <span>{cables.length} 条</span>
        </div>
        {cables.length === 0 ? (
          <p className="library-note" style={{ margin: '6px 0 4px' }}>
            选择上方电源线或信号线，点击端口或在 3D 视图中即可自行接线。
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
              const plugBadge =
                c.toPlugType || c.fromPlugType
                  ? PLUG_SPEC_META[(c.toPlugType ?? c.fromPlugType)!].shortLabel
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
                      <strong>{spec.shortLabel}</strong>
                      {plugBadge && <span className="cable-badge">{plugBadge}</span>}
                      <span className="cable-len-chip">{lengths.nominalM}m</span>
                    </div>
                    <small>
                      {fromDev?.name ?? '设备'} →{' '}
                      {toDev?.name ??
                        (c.to.type === 'floor' && c.to.drop === 'backEdge' ? '桌后缘' : '桌下走线')}
                      {resolved?.shortfallM && resolved.shortfallM > 0.02
                        ? ` · 短 ${resolved.shortfallM.toFixed(2)}m`
                        : ''}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger-text"
                    aria-label={`移除 ${spec.label}`}
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

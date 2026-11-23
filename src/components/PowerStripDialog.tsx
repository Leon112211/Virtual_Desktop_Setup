// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cable as CableIcon, Plug, TriangleAlert, X, Zap } from 'lucide-react';
import { validateCableReachability } from '../domain/cableRouting';
import { makeItem } from '../domain/catalog';
import { resolveItemPositionWithCollisions } from '../domain/collision';
import { WALL_DEFAULT_COLOR, WALL_DEFAULT_GAP, WALL_DEFAULT_HEIGHT } from '../domain/desk';
import { devicePorts } from '../domain/ports';
import {
  canAcPlugFitOutlet,
  defaultPowerStripSettings,
  defaultWallOutletSettings,
  POWER_STRIP_CORD_LENGTHS,
} from '../domain/power';
import { editorErrorMessage } from '../domain/screenLamp';
import { useI18n } from '../i18n';
import { useEditor, type PowerStripPlaceOptions } from '../store/editorStore';

export function PowerStripDialog({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const { lang } = useI18n();
  const t = (zh: string, en: string) => (lang === 'en' ? en : zh);
  const { project, collisionEnabled, addPowerStripWithCord } = useEditor();
  const dialogRef = useRef<HTMLDivElement>(null);

  const wallOutlets = useMemo(
    () => project.items.filter((it) => it.kind === 'wallOutlet'),
    [project.items],
  );

  const [cordLengthM, setCordLengthM] = useState<number>(1.8);
  const [plugType, setPlugType] = useState<'cn3Pin' | 'rightAngle'>('cn3Pin');
  const [connectionMode, setConnectionMode] = useState<
    'existingOutlet' | 'autoWallOutlet' | 'floorDrop'
  >(() => (wallOutlets.length > 0 ? 'existingOutlet' : 'autoWallOutlet'));
  const [targetOutletId, setTargetOutletId] = useState<string>(() => wallOutlets[0]?.id ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  // Live dry-run reachability check for the chosen cord length & outlet target
  const reachPreview = useMemo(() => {
    const probe = structuredClone(project);
    const n = probe.items.filter((i) => i.kind === 'powerStrip').length;
    const strip = makeItem('powerStrip');
    strip.powerStrip = { ...defaultPowerStripSettings(), cordLengthM };
    strip.x = -0.35 + (n % 3) * 0.14;
    strip.z = -0.22 + (n % 2) * 0.08;
    if (collisionEnabled) {
      const res = resolveItemPositionWithCollisions(
        strip,
        { x: strip.x, z: strip.z },
        probe.desk,
        probe.items,
      );
      strip.x = res.x;
      strip.z = res.z;
    }

    if (connectionMode === 'floorDrop') {
      probe.items.push(strip);
      return validateCableReachability(
        {
          kind: 'power',
          from: { type: 'device', itemId: strip.id, portId: 'ac-in' },
          to: { type: 'floor', drop: 'auto' },
          drop: 'auto',
          routeViaArm: false,
          color: '#1e222b',
          lengthM: cordLengthM,
          lengthIncludesConnectors: true,
          toPlugType: plugType,
        },
        probe,
      );
    }

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
      const created = makeItem('wallOutlet');
      created.x = Math.max(-probe.desk.width * 0.42, Math.min(probe.desk.width * 0.42, strip.x));
      created.z = 0;
      if (collisionEnabled) {
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

    probe.items.push(strip);
    const oType = (outlet.wallOutlet ?? defaultWallOutletSettings()).outletType;
    if (!canAcPlugFitOutlet(plugType, oType)) {
      return {
        ok: false,
        reason: t(
          '所选墙面插座当前为「仅双孔」，无法插入三脚插排电源头（请切换插座为五孔/三孔）。',
          'Target wall outlet is set to 2-Pin Only and cannot accept a 3-pin power strip plug.',
        ),
      };
    }
    const slot = devicePorts(outlet).find((p) => p.id.startsWith('slot-'));
    if (!slot) {
      return { ok: false, reason: t('目标插座无可用插孔。', 'No AC slot available on outlet.') };
    }
    return validateCableReachability(
      {
        kind: 'power',
        from: { type: 'device', itemId: strip.id, portId: 'ac-in' },
        to: { type: 'device', itemId: outlet.id, portId: slot.id },
        routeViaArm: false,
        color: '#1e222b',
        lengthM: cordLengthM,
        lengthIncludesConnectors: true,
        toPlugType: plugType,
      },
      probe,
    );
  }, [project, collisionEnabled, cordLengthM, plugType, connectionMode, targetOutletId, lang]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleConfirm() {
    setLocalError(null);
    const opts: PowerStripPlaceOptions = {
      cordLengthM,
      plugType,
      connectionMode,
      ...(connectionMode === 'existingOutlet' && targetOutletId ? { targetOutletId } : {}),
    };
    try {
      addPowerStripWithCord(opts);
      onClose();
    } catch (err) {
      const msg = editorErrorMessage(
        err,
        t(
          '放置桌面排插失败，请选择更长电源线。',
          'Failed to place power strip; pick a longer cord.',
        ),
      );
      setLocalError(msg);
      onError(msg);
    }
  }

  return createPortal(
    <div className="modal-shade" onClick={onClose}>
      <div
        ref={dialogRef}
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="power-strip-dialog-title"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title">
          <div>
            <span className="section-caption">
              <Zap size={12} style={{ verticalAlign: '-1px' }} />{' '}
              {t('桌面供电规划', 'Power Strip Setup')}
            </span>
            <h2 id="power-strip-dialog-title">
              {t('放置桌面排插 · 选择电源线规格', 'Place Desktop Power Strip')}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t('关闭弹窗', 'Close')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <p className="dialog-copy" style={{ marginBottom: 12 }}>
          {t(
            '真实拖线板自带固定长度总电源线（10A 三脚插头），放置时可直接接入墙面/地面插座供电。',
            'Select the built-in mains cord length (10A grounded plug) and connect it to a wall/floor AC outlet.',
          )}
        </p>

        <div style={{ marginBottom: 14 }}>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 6, fontWeight: 600 }}>
            <CableIcon size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {t('1. 选择拖线板自带电源线长度', '1. Built-in Mains Cord Length')}
          </p>
          <div
            className="cable-length-presets"
            role="group"
            aria-label={t('拖线板线长', 'Power Strip Cord Length')}
          >
            {POWER_STRIP_CORD_LENGTHS.map((len) => (
              <button
                key={len}
                type="button"
                className={Math.abs(cordLengthM - len) < 1e-4 ? 'active' : ''}
                onClick={() => {
                  setCordLengthM(len);
                  setLocalError(null);
                }}
              >
                {len}m
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 6, fontWeight: 600 }}>
            <Plug size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {t('2. 插头款式', '2. Mains Plug Style')}
          </p>
          <div className="desk-shape-presets" role="group">
            <button
              type="button"
              className={plugType === 'cn3Pin' ? 'active' : ''}
              onClick={() => setPlugType('cn3Pin')}
            >
              {t('标准 10A 三脚插头', '3-Pin Grounded (10A)')}
            </button>
            <button
              type="button"
              className={plugType === 'rightAngle' ? 'active' : ''}
              onClick={() => setPlugType('rightAngle')}
            >
              {t('90° 超薄贴墙弯头', '90° Wall-Flush Plug')}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 6, fontWeight: 600 }}>
            {t('3. 取电插座连接方式', '3. Wall / Floor Outlet Connection')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {wallOutlets.length > 0 && (
              <label className="desk-check" style={{ margin: 0 }}>
                <input
                  type="radio"
                  name="strip-outlet-mode"
                  checked={connectionMode === 'existingOutlet'}
                  onChange={() => setConnectionMode('existingOutlet')}
                />
                <span>
                  {t('插入场景中已有的墙面/地面插座', 'Plug into existing Wall / Floor Outlet')}
                </span>
              </label>
            )}
            {connectionMode === 'existingOutlet' && wallOutlets.length > 1 && (
              <select
                value={targetOutletId}
                onChange={(e) => setTargetOutletId(e.target.value)}
                style={{ marginLeft: 22 }}
              >
                {wallOutlets.map((wo, idx) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.name} #{idx + 1} ({Math.round(wo.x * 100)} cm)
                  </option>
                ))}
              </select>
            )}
            <label className="desk-check" style={{ margin: 0 }}>
              <input
                type="radio"
                name="strip-outlet-mode"
                checked={connectionMode === 'autoWallOutlet'}
                onChange={() => setConnectionMode('autoWallOutlet')}
              />
              <span>
                {wallOutlets.length > 0
                  ? t('新增一个墙面五孔插座并插上电源', 'Mount a new 5-hole Wall Outlet & plug in')
                  : t(
                      '自动在桌后墙面安装五孔插座并插上电源（推荐）',
                      'Auto-mount 5-hole Wall Outlet behind desk & plug in',
                    )}
              </span>
            </label>
            <label className="desk-check" style={{ margin: 0 }}>
              <input
                type="radio"
                name="strip-outlet-mode"
                checked={connectionMode === 'floorDrop'}
                onChange={() => setConnectionMode('floorDrop')}
              />
              <span>
                {t('暂不插墙插（自带电源线垂落至桌下地面）', 'Drop cord under desk (unplugged)')}
              </span>
            </label>
          </div>
        </div>

        {(!reachPreview.ok || localError) && (
          <div
            className="privacy-note"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#dc2626',
              borderColor: 'rgba(239, 68, 68, 0.28)',
              marginBottom: 10,
            }}
          >
            <TriangleAlert size={15} style={{ flexShrink: 0 }} />
            <span>{localError ?? reachPreview.reason}</span>
          </div>
        )}

        {reachPreview.ok && reachPreview.requiredM !== undefined && (
          <div className="privacy-note" style={{ marginBottom: 10 }}>
            <Zap size={14} style={{ flexShrink: 0 }} />
            <span>
              {lang === 'en'
                ? `Cord length ${cordLengthM.toFixed(1)}m reaches cleanly (minimum path ~${reachPreview.requiredM.toFixed(2)}m).`
                : `当前所选 ${cordLengthM.toFixed(1)}m 线长可顺畅接入（物理绕行约需 ${reachPreview.requiredM.toFixed(2)}m）。`}
            </span>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('取消', 'Cancel')}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!reachPreview.ok}
            onClick={handleConfirm}
          >
            {t('放置排插并接线', 'Place Power Strip')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

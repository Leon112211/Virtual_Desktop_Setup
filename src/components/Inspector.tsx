import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Trash2,
  SlidersHorizontal,
  MoveHorizontal,
  RotateCcw,
  TriangleAlert,
  Ruler,
  LockKeyhole,
} from 'lucide-react';
import { useEditor } from '../store/editorStore';
import { cm, meters, type Size } from '../domain/project';
import { isOutOfBounds } from '../domain/placement';
import {
  monitorParts,
  monitorPresets,
  monitorPresetId,
  monitorSize,
  screenInches,
} from '../domain/monitor';
export function NumberField({
  label,
  value,
  min,
  max,
  step = 0.5,
  unit = 'cm',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value)),
    [error, setError] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setError(false);
  }, [value]);
  const cancelled = useRef(false);
  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const v = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(v) || v < min || v > max) {
      setError(true);
      return;
    }
    setError(false);
    onChange(v);
  }
  return (
    <label className={`number-field ${error ? 'field-invalid' : ''}`}>
      <span>{label}</span>
      <div className="number-input">
        <input
          type="number"
          aria-label={label}
          aria-description={`单位 ${unit}，范围 ${min} 到 ${max}`}
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelled.current = true;
              setDraft(String(value));
              setError(false);
              e.currentTarget.blur();
            }
          }}
          aria-invalid={error}
        />
        <span>{unit}</span>
      </div>
      {error && (
        <small>
          请输入 {min}–{max} {unit}
        </small>
      )}
    </label>
  );
}
const swatches = ['#c99e70', '#9c7553', '#e8ded0', '#e9edf0', '#434e5b', '#a5b8aa'];
export default function Inspector({ onError }: { onError: (m: string) => void }) {
  const { project, selected, commit, updateItem, duplicate, remove } = useEditor();
  const item = project.items.find((i) => i.id === selected);
  const desk = project.desk;
  const isMonitor = item?.kind === 'monitor';
  const monitor = isMonitor ? monitorParts(item.size) : null;
  function safe(fn: () => void) {
    try {
      fn();
    } catch {
      onError('参数超出允许范围，或场景已达到模型预算。请减小尺寸或移除部分物品。');
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
        <section className="property-section">
          <h4>
            <Ruler size={15} /> {item ? '物品尺寸' : '桌面尺寸'}
            {item?.kind === 'imported' && (
              <span className="inline-tag">
                <LockKeyhole size={10} />
                等比
              </span>
            )}
          </h4>
          {isMonitor && item && monitor ? (
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
                {screenInches(item.size).toFixed(1)} 寸，16:9），总高 {cm(item.size.height)} cm
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
                  min={2}
                  max={30}
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
            </>
          ) : (
            <div className="field-grid">
              <NumberField
                label="宽度"
                value={cm(item ? item.size.width : desk.width)}
                min={item?.kind === 'imported' ? 0.5 : item ? 1 : 60}
                max={item ? 500 : 300}
                onChange={(v) =>
                  item
                    ? updateSize('width', v)
                    : safe(() =>
                        commit((p) => {
                          p.desk.width = meters(v);
                        }),
                      )
                }
              />
              <NumberField
                label="深度"
                value={cm(item ? item.size.depth : desk.depth)}
                min={item?.kind === 'imported' ? 0.5 : item ? 1 : 35}
                max={item ? 500 : 150}
                onChange={(v) =>
                  item
                    ? updateSize('depth', v)
                    : safe(() =>
                        commit((p) => {
                          p.desk.depth = meters(v);
                        }),
                      )
                }
              />
              <NumberField
                label={item ? '高度' : '桌面离地高度'}
                value={cm(item ? item.size.height : desk.height)}
                min={item?.kind === 'imported' ? 0.5 : item ? 0.5 : 40}
                max={item ? 500 : 130}
                onChange={(v) =>
                  item
                    ? updateSize('height', v)
                    : safe(() =>
                        commit((p) => {
                          p.desk.height = meters(v);
                        }),
                      )
                }
              />
              {!item && (
                <NumberField
                  label="桌板厚度"
                  value={cm(desk.thickness)}
                  min={1.5}
                  max={10}
                  step={0.1}
                  onChange={(v) =>
                    safe(() =>
                      commit((p) => {
                        p.desk.thickness = meters(v);
                      }),
                    )
                  }
                />
              )}
            </div>
          )}
          {!item && <p className="field-note">高度以桌面上表面为准，桌上物品会随之移动。</p>}
        </section>
        {item && (
          <>
            <section className="property-section">
              <h4>
                <MoveHorizontal size={15} />
                摆放位置
              </h4>
              <div className="field-grid">
                <NumberField
                  label="左右位置"
                  value={cm(item.x)}
                  min={-500}
                  max={500}
                  onChange={(v) => safe(() => updateItem(item.id, { x: meters(v) }))}
                />
                <NumberField
                  label="前后位置"
                  value={cm(item.z)}
                  min={-500}
                  max={500}
                  onChange={(v) => safe(() => updateItem(item.id, { z: meters(v) }))}
                />
              </div>
              <p className="field-note">以桌面中心为原点，底部自动贴合桌面。</p>
            </section>
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
          </>
        )}
        {item?.kind !== 'imported' && (
          <section className="property-section">
            <h4>
              <span className="color-icon" />
              {item ? '主体颜色' : '桌面颜色'}
            </h4>
            <div className="swatches">
              {(item
                ? ['#343c49', '#e3d5bf', '#e3e8ee', '#c9d6e5', '#a5b8aa', '#b98b7b']
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
                        ? updateItem(item.id, { color })
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
                        ? updateItem(item.id, { color: e.target.value })
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
              <span>{item ? '为这件物品换一种心情' : '哑光桌面 · 自然木纹'}</span>
              <code>{item ? item.color : desk.color}</code>
            </div>
          </section>
        )}
        {item && isOutOfBounds(item, desk) && (
          <div className="warning-box">
            <TriangleAlert size={16} />
            <p>物品超出了桌面边缘。可以调整位置或尺寸；这不会阻止保存。</p>
          </div>
        )}
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
          {item ? '选中物品可直接在桌面拖动' : '按照实际尺寸，安心规划你的桌搭'}
        </div>
      </div>
    </aside>
  );
}

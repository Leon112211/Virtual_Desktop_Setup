import { Lightbulb, Move3d } from 'lucide-react';
import { cm, meters, type SceneItem } from '../domain/project';
import { editorErrorMessage, type ScreenLampSettings } from '../domain/screenLamp';
import { useEditor } from '../store/editorStore';
import { NumberField } from './NumberField';

const fields: {
  key: Exclude<keyof ScreenLampSettings, 'enabled' | 'monitorId'>;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  scale?: number;
}[] = [
  { key: 'brightness', label: '挂灯亮度', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'temperature', label: '色温', min: 2700, max: 6500, step: 100, unit: 'K' },
  { key: 'tilt', label: '向前倾角', min: 0, max: 45, step: 1, unit: '°' },
  { key: 'horizontalAngle', label: '水平光束角', min: 60, max: 110, step: 1, unit: '°' },
  { key: 'verticalAngle', label: '垂直光束角', min: 20, max: 55, step: 1, unit: '°' },
  { key: 'softness', label: '边缘柔化', min: 5, max: 35, step: 1, unit: '%', scale: 100 },
];
export default function LampInspector({
  item,
  onError,
}: {
  item: SceneItem;
  onError: (message: string) => void;
}) {
  const { project, updateItem, lampGuides, toggleLampGuides } = useEditor();
  const lamp = item.lamp;
  if (!lamp) return null;
  function safe(fn: () => void) {
    try {
      fn();
    } catch (error) {
      onError(editorErrorMessage(error, '挂灯参数超出范围，请检查输入。'));
    }
  }
  function update(patch: Partial<ScreenLampSettings>) {
    safe(() => updateItem(item.id, { lamp: { ...lamp!, ...patch } }));
  }
  return (
    <>
      <section className="property-section lamp-mount">
        <h4>
          <Move3d size={15} /> 安装位置
        </h4>
        <label className="text-field">
          安装到显示器
          <select
            aria-label="安装到显示器"
            value={lamp.monitorId}
            onChange={(e) => update({ monitorId: e.target.value })}
          >
            {project.items
              .filter((i) => i.kind === 'monitor')
              .map((monitor) => {
                const occupied = project.items.some(
                  (i) => i.id !== item.id && i.lamp?.monitorId === monitor.id,
                );
                return (
                  <option key={monitor.id} value={monitor.id} disabled={occupied}>
                    {monitor.name}
                    {occupied ? '（已安装挂灯）' : ''}
                  </option>
                );
              })}
          </select>
        </label>
        <NumberField
          label="灯条长度"
          value={cm(item.size.width)}
          min={30}
          max={60}
          step={1}
          onChange={(n) =>
            safe(() => updateItem(item.id, { size: { ...item.size, width: meters(n) } }))
          }
        />
        <p className="field-note">夹在屏幕顶边，随显示器移动和转动。每屏一盏，场景最多两盏。</p>
      </section>
      <section className="property-section lamp-lighting">
        <h4>
          <Lightbulb size={15} /> 照明与配光
        </h4>
        <label className="lamp-switch">
          <span>开启挂灯</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="开启挂灯"
            checked={lamp.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        </label>
        <div className="field-grid">
          {fields.map(({ key, label, min, max, step, unit, scale = 1 }) => (
            <NumberField
              key={key}
              label={label}
              value={Math.round(lamp[key] * scale * 100) / 100}
              min={min}
              max={max}
              step={step}
              unit={unit}
              onChange={(value) => update({ [key]: value / scale })}
            />
          ))}
        </div>
        <p className="field-note">
          光束角为完整夹角；倾角从灯具局部向下方向转向桌前方。柔化仅控制光区边缘。
        </p>
        <label className="lamp-guide-toggle">
          <input type="checkbox" checked={lampGuides} onChange={toggleLampGuides} />
          显示光路示意
        </label>
        <p className="field-note">
          参考线不计算遮挡。关闭后仍有实际照明，不代表空气中存在可见光柱。
        </p>
      </section>
      <div className="lamp-simulation-note">
        <strong>实时照明近似</strong>
        <p>
          支持距离衰减与物体遮挡；亮度是相对预览值，不是照度测量。有限光源采样可能产生分层阴影，不用于照明认证。
        </p>
        <p>可切换暗室观察效果。屏幕保持自亮，但不模拟屏幕向外照明；不受光材质不会被挂灯照亮。</p>
      </div>
    </>
  );
}

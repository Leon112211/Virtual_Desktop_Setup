// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { Lightbulb, Move3d } from 'lucide-react';
import { cm, meters, type SceneItem } from '../domain/project';
import { editorErrorMessage, type ScreenLampSettings } from '../domain/screenLamp';
import { useI18n } from '../i18n';
import { useEditor } from '../store/editorStore';
import { NumberField } from './NumberField';

export default function LampInspector({
  item,
  onError,
}: {
  item: SceneItem;
  onError: (message: string) => void;
}) {
  const { lang } = useI18n();
  const t = (zh: string, en: string) => (lang === 'en' ? en : zh);
  const { project, updateItem, lampGuides, toggleLampGuides } = useEditor();
  const lamp = item.lamp;
  if (!lamp) return null;

  const fields: {
    key: Exclude<keyof ScreenLampSettings, 'enabled' | 'monitorId'>;
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    scale?: number;
  }[] = [
    { key: 'brightness', label: t('挂灯亮度', 'Brightness'), min: 0, max: 100, step: 1, unit: '%' },
    {
      key: 'temperature',
      label: t('色温', 'Color Temp'),
      min: 2700,
      max: 6500,
      step: 100,
      unit: 'K',
    },
    { key: 'tilt', label: t('向前倾角', 'Forward Tilt'), min: 0, max: 45, step: 1, unit: '°' },
    {
      key: 'horizontalAngle',
      label: t('水平光束角', 'Horizontal Beam'),
      min: 60,
      max: 110,
      step: 1,
      unit: '°',
    },
    {
      key: 'verticalAngle',
      label: t('垂直光束角', 'Vertical Beam'),
      min: 20,
      max: 55,
      step: 1,
      unit: '°',
    },
    {
      key: 'softness',
      label: t('边缘柔化', 'Edge Softness'),
      min: 5,
      max: 35,
      step: 1,
      unit: '%',
      scale: 100,
    },
  ];

  function safe(fn: () => void) {
    try {
      fn();
    } catch (error) {
      onError(
        editorErrorMessage(
          error,
          t('挂灯参数超出范围，请检查输入。', 'Light bar value out of range.'),
        ),
      );
    }
  }
  function update(patch: Partial<ScreenLampSettings>) {
    safe(() => updateItem(item.id, { lamp: { ...lamp!, ...patch } }));
  }
  return (
    <>
      <section className="property-section lamp-mount">
        <h4>
          <Move3d size={15} /> {t('安装位置', 'Mounting')}
        </h4>
        <label className="text-field">
          {t('安装到显示器', 'Mount on Monitor')}
          <select
            aria-label={t('安装到显示器', 'Mount on Monitor')}
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
                    {occupied ? t('（已安装挂灯）', ' (Occupied)') : ''}
                  </option>
                );
              })}
          </select>
        </label>
        <NumberField
          label={t('灯条长度', 'Bar Width')}
          value={cm(item.size.width)}
          min={30}
          max={60}
          step={1}
          onChange={(n) =>
            safe(() => updateItem(item.id, { size: { ...item.size, width: meters(n) } }))
          }
        />
        <p className="field-note">
          {t(
            '夹在屏幕顶边，随显示器移动和转动。每屏一盏，场景最多两盏。',
            'Clips onto the top bezel and follows the monitor. Max one per monitor, two per scene.',
          )}
        </p>
      </section>
      <section className="property-section lamp-lighting">
        <h4>
          <Lightbulb size={15} /> {t('照明与配光', 'Optics & Lighting')}
        </h4>
        <label className="lamp-switch">
          <span>{t('开启挂灯', 'Power On')}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={t('开启挂灯', 'Power On')}
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
          {t(
            '光束角为完整夹角；倾角从灯具局部向下方向转向桌前方。柔化仅控制光区边缘。',
            'Beam angles represent full spread; forward tilt aims light toward the desk center.',
          )}
        </p>
        <label className="lamp-guide-toggle">
          <input type="checkbox" checked={lampGuides} onChange={toggleLampGuides} />
          {t('显示光路示意', 'Show Beam Cone Guides')}
        </label>
        <p className="field-note">
          {t(
            '参考线不计算遮挡。关闭后仍有实际照明，不代表空气中存在可见光柱。',
            'Wireframe cone guides ignore occlusion; turning guides off keeps actual desk illumination.',
          )}
        </p>
      </section>
      <div className="lamp-simulation-note">
        <strong>{t('实时照明近似', 'Real-Time Lighting Preview')}</strong>
        <p>
          {t(
            '支持距离衰减与物体遮挡；亮度是相对预览值，不是照度测量。有限光源采样可能产生分层阴影，不用于照明认证。',
            'Includes distance falloff and shadow casting; brightness is a visual preview, not a lux meter.',
          )}
        </p>
        <p>
          {t(
            '可切换暗室观察效果。屏幕保持自亮，但不模拟屏幕向外照明；不受光材质不会被挂灯照亮。',
            'Switch to Dark mode to inspect beam coverage clearly.',
          )}
        </p>
      </div>
    </>
  );
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useState } from 'react';
import {
  Cable as CableIcon,
  ChevronRight,
  Layers,
  Package,
  Plus,
  Search,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { catalog } from '../domain/catalog';
import { armTargetSummary } from '../domain/laptop';
import { cm, type BuiltinKind } from '../domain/project';
import { isOutOfBounds } from '../domain/placement';
import { editorErrorMessage } from '../domain/screenLamp';
import { BUILTIN_ITEM_NAMES, useI18n } from '../i18n';
import { useEditor } from '../store/editorStore';
import { CableStudioPanel } from './CableStudioPanel';
import { ModelThumbnail } from './ModelThumbnail';
import { PowerStripDialog } from './PowerStripDialog';

type CategoryKey = 'all' | 'devices' | 'accessories';

const ACCESSORY_KINDS = new Set<BuiltinKind>([
  'pegboard',
  'mousepad',
  'laptopStand',
  'monitorArm',
  'powerStrip',
  'wallOutlet',
]);

export default function ModelLibrary({
  onImport,
  onError,
}: {
  onImport: () => void;
  onError: (m: string) => void;
}) {
  const { lang } = useI18n();
  const t = (zh: string, en: string) => (lang === 'en' ? en : zh);

  const [tab, setTab] = useState<'library' | 'scene' | 'cables'>('library'),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState<CategoryKey>('all'),
    [showPowerStripDialog, setShowPowerStripDialog] = useState(false);
  const { project, selected, select, add, addDualMonitorArm, attachLaptopTray } = useEditor();

  const qLower = query.trim().toLowerCase();
  const matchesQuery = (...candidates: string[]) =>
    !qLower || candidates.some((c) => c.toLowerCase().includes(qLower));

  const entries = catalog.filter((e) => {
    const isAcc = ACCESSORY_KINDS.has(e.kind);
    const catMatch = category === 'all' || (category === 'accessories' ? isAcc : !isAcc);
    if (!catMatch) return false;
    const names = BUILTIN_ITEM_NAMES[e.kind];
    return matchesQuery(e.name, names.zh, names.en);
  });

  const showDualArmCard =
    matchesQuery(
      BUILTIN_ITEM_NAMES.monitorArmDual.zh,
      BUILTIN_ITEM_NAMES.monitorArmDual.en,
      '双臂支架',
      'dual arm',
    ) &&
    (category === 'all' || category === 'accessories');

  const showLaptopTrayCard =
    matchesQuery(
      BUILTIN_ITEM_NAMES.laptopTray.zh,
      BUILTIN_ITEM_NAMES.laptopTray.en,
      '支架臂配件',
      'vesa tray',
    ) &&
    (category === 'all' || category === 'accessories');

  const totalCount = entries.length + (showDualArmCard ? 1 : 0) + (showLaptopTrayCard ? 1 : 0);

  const dualArmLabel = BUILTIN_ITEM_NAMES.monitorArmDual[lang];
  const laptopTrayLabel = BUILTIN_ITEM_NAMES.laptopTray[lang];

  return (
    <aside className="library panel" aria-label={t('物品库', 'Item Library')}>
      <div className="library-tabs">
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          <Package size={15} />
          {t('模型库', 'Library')}
        </button>
        <button className={tab === 'scene' ? 'active' : ''} onClick={() => setTab('scene')}>
          <Layers size={15} />
          {t('场景', 'Scene')}
          <span>{project.items.length}</span>
        </button>
        <button className={tab === 'cables' ? 'active' : ''} onClick={() => setTab('cables')}>
          <CableIcon size={15} />
          {t('线缆', 'Cables')}
          <span>{(project.cables ?? []).length}</span>
        </button>
      </div>
      {tab === 'cables' ? (
        <CableStudioPanel onError={onError} />
      ) : tab === 'library' ? (
        <>
          <div className="library-tools">
            <label className="search-box">
              <Search size={15} />
              <input
                aria-label={t('搜索模型', 'Search Models')}
                placeholder={t('找一件喜欢的物品', 'Search devices & accessories')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
            <div className="categories">
              {(
                [
                  { key: 'all', label: t('全部', 'All') },
                  { key: 'devices', label: t('数码设备', 'Devices') },
                  { key: 'accessories', label: t('收纳配件', 'Accessories') },
                ] as const
              ).map((c) => (
                <button
                  key={c.key}
                  className={category === c.key ? 'active' : ''}
                  onClick={() => setCategory(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="library-scroll">
            <div className="section-caption">
              <span>{t('常用物品', 'Catalog')}</span>
              <span>{lang === 'en' ? `${totalCount} items` : `${totalCount} 款`}</span>
            </div>
            <div className="model-cards">
              {entries.map((entry) => (
                <button
                  className="model-card"
                  key={entry.kind}
                  onClick={() => {
                    if (entry.kind === 'powerStrip') {
                      setShowPowerStripDialog(true);
                      return;
                    }
                    try {
                      add(entry.kind);
                    } catch (error) {
                      onError(
                        editorErrorMessage(
                          error,
                          t(
                            '场景已达到物品数量或模型复杂度上限，请先移除部分物品。',
                            'Scene item or complexity limit reached. Remove some items first.',
                          ),
                        ),
                      );
                    }
                  }}
                  aria-label={lang === 'en' ? `Add ${entry.name}` : `添加${entry.name}`}
                >
                  <div className="model-picture">
                    <ModelThumbnail kind={entry.kind} />
                    <span className="card-add">
                      <Plus size={15} />
                    </span>
                  </div>
                  <div className="model-card-info">
                    <strong>{entry.name}</strong>
                    <span>
                      {cm(entry.size.width)} × {cm(entry.size.depth)} × {cm(entry.size.height)} cm
                    </span>
                  </div>
                </button>
              ))}
              {showDualArmCard && (
                <button
                  className="model-card"
                  key="monitorArmDual"
                  onClick={() => {
                    try {
                      addDualMonitorArm();
                    } catch (error) {
                      onError(
                        editorErrorMessage(
                          error,
                          t(
                            '请先添加显示器或笔记本，再安装双头机械臂。',
                            'Add a monitor or laptop first before installing a dual arm.',
                          ),
                        ),
                      );
                    }
                  }}
                  aria-label={lang === 'en' ? `Add ${dualArmLabel}` : `添加${dualArmLabel}`}
                >
                  <div className="model-picture">
                    <ModelThumbnail kind="monitorArmDual" />
                    <span className="card-add">
                      <Plus size={15} />
                    </span>
                  </div>
                  <div className="model-card-info">
                    <strong>{dualArmLabel}</strong>
                    <span>{t('双夹双臂 · 113 × 52 cm', 'Dual Clamp · 113 × 52 cm')}</span>
                  </div>
                </button>
              )}
              {showLaptopTrayCard && (
                <button
                  className="model-card"
                  key="laptopTray"
                  onClick={() => {
                    try {
                      attachLaptopTray();
                    } catch (error) {
                      onError(
                        editorErrorMessage(
                          error,
                          t(
                            '请先添加笔记本电脑，再为支架臂挂载笔记本托盘。',
                            'Add a laptop first before attaching a VESA laptop tray.',
                          ),
                        ),
                      );
                    }
                  }}
                  aria-label={lang === 'en' ? `Add ${laptopTrayLabel}` : `添加${laptopTrayLabel}`}
                >
                  <div className="model-picture">
                    <ModelThumbnail kind="laptopTray" />
                    <span className="card-add">
                      <Plus size={15} />
                    </span>
                  </div>
                  <div className="model-card-info">
                    <strong>{laptopTrayLabel}</strong>
                    <span>22–42 × 23.5 cm · VESA</span>
                  </div>
                </button>
              )}
            </div>
            {!totalCount && (
              <div className="empty-state">
                {t('没有找到这个物品。', 'No matching item found.')}
                <br />
                {t(
                  '试试其他名称，或导入自己的模型。',
                  'Try another keyword, or import your own 3D model.',
                )}
              </div>
            )}
            <div className="section-caption imported-caption">
              <span>{t('我的模型', 'Custom Models')}</span>
              <span>{t('本地', 'Local')}</span>
            </div>
            {project.assets.length ? (
              <div className="my-models">
                {project.assets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => {
                      const first = project.items.find((i) => i.assetId === asset.id);
                      if (first) {
                        select(first.id);
                        setTab('scene');
                      } else
                        onError(
                          t(
                            '这件模型在撤销历史中保留。可以重做恢复，或重新导入模型。',
                            'This model is kept in undo history. Redo or re-import to place it.',
                          ),
                        );
                    }}
                  >
                    <Package size={16} />
                    <span>{asset.name}</span>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="library-note">
                {t('不止于内置。把你收藏的模型', 'Beyond built-ins. Bring your own')}
                <br />
                {t('带进自己的桌面。', '3D models onto the desk.')}
              </p>
            )}
            <button className="upload-card" onClick={onImport}>
              <Upload size={18} />
              <span>
                <strong>{t('导入三维模型', 'Import 3D Model')}</strong>
                <small>
                  {t('GLB / 自包含 glTF · 最大 15 MiB', 'GLB / Self-contained glTF · Max 15 MiB')}
                </small>
              </span>
              <Plus size={15} />
            </button>
          </div>
        </>
      ) : (
        <div className="library-scroll scene-list">
          <div className="section-caption">
            <span>{t('场景中的物品', 'Items in Scene')}</span>
            <span>
              {lang === 'en' ? `${project.items.length} items` : `${project.items.length} 件`}
            </span>
          </div>
          <button
            className={`scene-row desk-row ${!selected ? 'selected' : ''}`}
            onClick={() => select(null)}
          >
            <span className="scene-symbol">▱</span>
            <span>
              <strong>{t('我的桌子', 'My Desk')}</strong>
              <small>
                {project.desk.return
                  ? lang === 'en'
                    ? `${project.desk.return.side === 'left' ? 'Left L-Shape' : 'Right L-Shape'} · Main ${cm(project.desk.width)} × ${cm(project.desk.depth)} · Wing ${cm(project.desk.return.width)} × ${cm(project.desk.return.extension)} cm`
                    : `${project.desk.return.side === 'left' ? '左侧 L 形' : '右侧 L 形'} · 主桌 ${cm(project.desk.width)} × ${cm(project.desk.depth)} · 侧翼 ${cm(project.desk.return.width)} × ${cm(project.desk.return.extension)} cm`
                  : `${cm(project.desk.width)} × ${cm(project.desk.depth)} cm`}
              </small>
            </span>
          </button>
          {project.items.map((item, index) => {
            const subtitle = item.lamp
              ? lang === 'en'
                ? `Mounted on ${project.items.find((i) => i.id === item.lamp?.monitorId)?.name ?? 'Monitor'}`
                : `安装于 ${project.items.find((i) => i.id === item.lamp?.monitorId)?.name ?? '显示器'}`
              : item.monitorArm
                ? armTargetSummary(item.monitorArm, project.items)
                : item.laptopStand?.laptopId
                  ? lang === 'en'
                    ? `Holding ${project.items.find((i) => i.id === item.laptopStand?.laptopId)?.name ?? 'Laptop'}`
                    : `承托 ${project.items.find((i) => i.id === item.laptopStand?.laptopId)?.name ?? '笔记本'}`
                  : `${cm(item.size.width)} × ${cm(item.size.depth)} cm${item.surface === 'shelf' ? t(' · 层架', ' · Shelf') : ''}`;
            return (
              <button
                key={item.id}
                className={`scene-row ${selected === item.id ? 'selected' : ''}`}
                onClick={() => select(item.id)}
              >
                <span className="scene-index">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{subtitle}</small>
                </span>
                {isOutOfBounds(item, project.desk, project.items) && (
                  <TriangleAlert size={14} className="danger-text" />
                )}
              </button>
            );
          })}
          {!project.items.length && (
            <div className="empty-state">
              {t('桌面还是空的。', 'Your desk is empty.')}
              <br />
              <button onClick={() => setTab('library')}>
                {t('去模型库添加第一件物品', 'Add your first item from the Library')}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="library-footer">
        <span className="local-mark" />
        <span>{t('模型仅保存在你的浏览器', 'Models stay locally in your browser')}</span>
      </div>
      {showPowerStripDialog && (
        <PowerStripDialog onClose={() => setShowPowerStripDialog(false)} onError={onError} />
      )}
    </aside>
  );
}

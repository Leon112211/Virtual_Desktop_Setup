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
import { cm } from '../domain/project';
import { isOutOfBounds } from '../domain/placement';
import { editorErrorMessage } from '../domain/screenLamp';
import { useEditor } from '../store/editorStore';
import { CableStudioPanel } from './CableStudioPanel';
import { ModelThumbnail } from './ModelThumbnail';
export default function ModelLibrary({
  onImport,
  onError,
}: {
  onImport: () => void;
  onError: (m: string) => void;
}) {
  const [tab, setTab] = useState<'library' | 'scene' | 'cables'>('library'),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('全部');
  const { project, selected, select, add, addDualMonitorArm, attachLaptopTray } = useEditor();
  const entries = catalog.filter(
    (e) => e.name.includes(query) && (category === '全部' || e.category === category),
  );
  const showDualArmCard =
    ('双头机械臂'.includes(query) || '双臂支架'.includes(query) || 'NB'.includes(query)) &&
    (category === '全部' || category === '收纳配件');
  const showLaptopTrayCard =
    ('NB 笔记本托盘'.includes(query) || '支架臂配件'.includes(query)) &&
    (category === '全部' || category === '收纳配件');
  const totalCount = entries.length + (showDualArmCard ? 1 : 0) + (showLaptopTrayCard ? 1 : 0);
  return (
    <aside className="library panel" aria-label="物品库">
      <div className="library-tabs">
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          <Package size={15} />
          模型库
        </button>
        <button className={tab === 'scene' ? 'active' : ''} onClick={() => setTab('scene')}>
          <Layers size={15} />
          场景<span>{project.items.length}</span>
        </button>
        <button className={tab === 'cables' ? 'active' : ''} onClick={() => setTab('cables')}>
          <CableIcon size={15} />
          线缆<span>{(project.cables ?? []).length}</span>
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
                aria-label="搜索模型"
                placeholder="找一件喜欢的物品"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
            <div className="categories">
              {['全部', '数码设备', '收纳配件'].map((c) => (
                <button
                  key={c}
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="library-scroll">
            <div className="section-caption">
              <span>常用物品</span>
              <span>{totalCount} 款</span>
            </div>
            <div className="model-cards">
              {entries.map((entry) => (
                <button
                  className="model-card"
                  key={entry.kind}
                  onClick={() => {
                    try {
                      add(entry.kind);
                    } catch (error) {
                      onError(
                        editorErrorMessage(
                          error,
                          '场景已达到物品数量或模型复杂度上限，请先移除部分物品。',
                        ),
                      );
                    }
                  }}
                  aria-label={`添加${entry.name}`}
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
                          '请先添加显示器或笔记本，再安装 NB F160 双头机械臂。',
                        ),
                      );
                    }
                  }}
                  aria-label="添加双头机械臂"
                >
                  <div className="model-picture">
                    <ModelThumbnail kind="monitorArmDual" />
                    <span className="card-add">
                      <Plus size={15} />
                    </span>
                  </div>
                  <div className="model-card-info">
                    <strong>双头机械臂</strong>
                    <span>NB F160 双夹双臂 · 113 × 52 cm</span>
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
                          '请先添加笔记本电脑，再为支架臂挂载 NB FP-2 托盘。',
                        ),
                      );
                    }
                  }}
                  aria-label="添加NB 笔记本托盘"
                >
                  <div className="model-picture">
                    <ModelThumbnail kind="laptopTray" />
                    <span className="card-add">
                      <Plus size={15} />
                    </span>
                  </div>
                  <div className="model-card-info">
                    <strong>NB 笔记本托盘</strong>
                    <span>22–42 × 23.5 cm · VESA</span>
                  </div>
                </button>
              )}
            </div>
            {!totalCount && (
              <div className="empty-state">
                没有找到这个物品。
                <br />
                试试其他名称，或导入自己的模型。
              </div>
            )}
            <div className="section-caption imported-caption">
              <span>我的模型</span>
              <span>本地</span>
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
                      } else onError('这件模型在撤销历史中保留。可以重做恢复，或重新导入模型。');
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
                不止于内置。把你收藏的模型
                <br />
                带进自己的桌面。
              </p>
            )}
            <button className="upload-card" onClick={onImport}>
              <Upload size={18} />
              <span>
                <strong>导入三维模型</strong>
                <small>GLB / 自包含 glTF · 最大 15 MiB</small>
              </span>
              <Plus size={15} />
            </button>
          </div>
        </>
      ) : (
        <div className="library-scroll scene-list">
          <div className="section-caption">
            <span>场景中的物品</span>
            <span>{project.items.length} 件</span>
          </div>
          <button
            className={`scene-row desk-row ${!selected ? 'selected' : ''}`}
            onClick={() => select(null)}
          >
            <span className="scene-symbol">▱</span>
            <span>
              <strong>我的桌子</strong>
              <small>
                {project.desk.return
                  ? `${project.desk.return.side === 'left' ? '左侧 L 形' : '右侧 L 形'} · 主桌 ${cm(project.desk.width)} × ${cm(project.desk.depth)} · 侧翼 ${cm(project.desk.return.width)} × ${cm(project.desk.return.extension)} cm`
                  : `${cm(project.desk.width)} × ${cm(project.desk.depth)} cm`}
              </small>
            </span>
          </button>
          {project.items.map((item, index) => {
            const subtitle = item.lamp
              ? `安装于 ${project.items.find((i) => i.id === item.lamp?.monitorId)?.name ?? '显示器'}`
              : item.monitorArm
                ? armTargetSummary(item.monitorArm, project.items)
                : item.laptopStand?.laptopId
                  ? `承托 ${project.items.find((i) => i.id === item.laptopStand?.laptopId)?.name ?? '笔记本'}`
                  : `${cm(item.size.width)} × ${cm(item.size.depth)} cm${item.surface === 'shelf' ? ' · 层架' : ''}`;
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
              桌面还是空的。
              <br />
              <button onClick={() => setTab('library')}>去模型库添加第一件物品</button>
            </div>
          )}
        </div>
      )}
      <div className="library-footer">
        <span className="local-mark" />
        <span>模型仅保存在你的浏览器</span>
      </div>
    </aside>
  );
}

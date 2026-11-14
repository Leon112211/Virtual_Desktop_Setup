import { useState } from 'react';
import { Search, Plus, Upload, Package, Layers, ChevronRight, TriangleAlert } from 'lucide-react';
import { catalog } from '../domain/catalog';
import { cm } from '../domain/project';
import { isOutOfBounds } from '../domain/placement';
import { useEditor } from '../store/editorStore';
import { ModelThumbnail } from './ModelThumbnail';
export default function ModelLibrary({
  onImport,
  onError,
}: {
  onImport: () => void;
  onError: (m: string) => void;
}) {
  const [tab, setTab] = useState<'library' | 'scene'>('library'),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('全部');
  const { project, selected, select, add } = useEditor();
  const entries = catalog.filter(
    (e) => e.name.includes(query) && (category === '全部' || e.category === category),
  );
  return (
    <aside className="library panel" aria-label="物品库">
      <div className="library-tabs">
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          <Package size={16} />
          模型库
        </button>
        <button className={tab === 'scene' ? 'active' : ''} onClick={() => setTab('scene')}>
          <Layers size={16} />
          场景<span>{project.items.length}</span>
        </button>
      </div>
      {tab === 'library' ? (
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
              <span>{entries.length} 款</span>
            </div>
            <div className="model-cards">
              {entries.map((entry) => (
                <button
                  className="model-card"
                  key={entry.kind}
                  onClick={() => {
                    try {
                      add(entry.kind);
                    } catch {
                      onError('场景已达到物品数量或模型复杂度上限，请先移除部分物品。');
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
            </div>
            {!entries.length && (
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
                {cm(project.desk.width)} × {cm(project.desk.depth)} cm
              </small>
            </span>
          </button>
          {project.items.map((item, index) => (
            <button
              key={item.id}
              className={`scene-row ${selected === item.id ? 'selected' : ''}`}
              onClick={() => select(item.id)}
            >
              <span className="scene-index">{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {cm(item.size.width)} × {cm(item.size.depth)} cm
                </small>
              </span>
              {isOutOfBounds(item, project.desk) && (
                <TriangleAlert size={14} className="danger-text" />
              )}
            </button>
          ))}
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

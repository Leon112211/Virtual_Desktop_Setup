/**
 * CS50x Final Project — DeskCraft (3D Workspace & Cable Routing Studio)
 *
 * Academic Honesty & AI Assistance Disclosure:
 * Product concept, workspace domain rules (fixed-length non-stretching cable physics,
 * modular pure-cable vs. optional power-adapter logic, anti-clipping constraints, and
 * de-branded 1:1 hardware specifications), UX workflow, and iterative visual/functional QA
 * were conceived, directed, and verified by the author. AI coding assistants (Gemini / Claude)
 * were used to assist with Three.js procedural geometry math, React/TypeScript implementation,
 * automated test scaffolding, and bilingual EN/ZH localization.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Undo2,
  Redo2,
  Plus,
  Check,
  ChevronDown,
  Box,
  Cable as CableIcon,
  Move3D,
  Scan,
  MousePointer2,
  Rotate3D,
  X,
  CircleHelp,
  PanelLeft,
  SlidersHorizontal,
  LoaderCircle,
  HardDrive,
  TriangleAlert,
} from 'lucide-react';
import DeskScene, { type View } from './scene/DeskScene';
import ModelLibrary from './components/ModelLibrary';
import Inspector from './components/Inspector';
import ImportDialog from './components/ImportDialog';
import { useEditor } from './store/editorStore';
import { defaultProject } from './domain/catalog';
import { uid, type AssetMeta, type Project } from './domain/project';
import { isOutOfBounds } from './domain/placement';
import { editorErrorMessage } from './domain/screenLamp';
import { armLimitMessage } from './domain/monitorArm';
import { PLUG_SPEC_META } from './domain/power';
import { inspectModel, disposeModel, type LoadedModel } from './assets/importModel';
import { registerModel, clearModelCache } from './assets/modelCache';
import { saveProject, loadProject } from './persistence/projectRepository';
import { exportProjectFile, importProjectFile } from './persistence/projectFile';
import { tr, translateObstacleLabel, useI18n } from './i18n';

type Pending = { file: File; model: LoadedModel; format: 'glb' | 'gltf' };
type SaveStatusKind =
  'restoring' | 'waiting' | 'paused' | 'unavailable' | 'saving' | 'saved' | 'failed';

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message
    : tr('操作未完成，请重试。', 'Operation incomplete. Please try again.');
}

export default function App() {
  const { lang, toggleLang } = useI18n();
  const t = useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang]);

  const {
    project,
    past,
    future,
    selected,
    selectedCableId,
    wiringMode,
    wiringDraft,
    wiringActiveEnd,
    wiringShortfallM,
    wiringPreset,
    collisionNotice,
    dragPreview,
  } = useEditor();
  const [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState<SaveStatusKind>('restoring'),
    [warning, setWarning] = useState(''),
    [busy, setBusy] = useState(''),
    [toast, setToast] = useState(''),
    [help, setHelp] = useState(false),
    [panel, setPanel] = useState<'library' | 'inspector' | null>(null),
    [pending, setPending] = useState<Pending | null>(null),
    [longest, setLongest] = useState(30),
    [view, setView] = useState<View>({ kind: 'perspective', nonce: 0 });
  const [sceneVisible, setSceneVisible] = useState(true);
  const modelInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    saveQueue = useRef(Promise.resolve()),
    autoAllowed = useRef(true),
    loading = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveStateLabel =
    saveStatus === 'restoring'
      ? t('正在恢复布局', 'Restoring layout')
      : saveStatus === 'waiting'
        ? t('等待保存', 'Pending save')
        : saveStatus === 'paused'
          ? t('自动保存已暂停', 'Auto-save paused')
          : saveStatus === 'unavailable'
            ? t('自动保存不可用', 'Auto-save unavailable')
            : saveStatus === 'saving'
              ? t('正在保存', 'Saving')
              : saveStatus === 'saved'
                ? t('已保存到此浏览器', 'Saved in browser')
                : t('保存失败', 'Save failed');

  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6500);
  }, []);

  useEffect(() => {
    if (loading.current) return;
    loading.current = true;
    loadProject()
      .then((result) => {
        if (result) {
          useEditor.getState().replace(result.project, result.blobs);
          if (result.blobs.size < result.project.assets.length) {
            setWarning(
              tr(
                '部分本地模型资源缺失，已保留物品占位。请导入备份工程恢复。',
                'Some local 3D model blobs are missing; placeholders kept. Import a backup file to restore.',
              ),
            );
            autoAllowed.current = false;
          }
        }
        setSaveStatus(autoAllowed.current ? 'waiting' : 'paused');
      })
      .catch((e) => {
        autoAllowed.current = false;
        setWarning(
          tr(
            `恢复失败：${errorText(e)}。当前默认布局不会自动覆盖旧工程，可先导出备份再新建。`,
            `Restore failed: ${errorText(e)}. Default layout will not overwrite previous data.`,
          ),
        );
        setSaveStatus('unavailable');
      })
      .finally(() => setReady(true));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const persist = useCallback((p: Project, blobs: Map<string, Blob>) => {
    setSaveStatus('saving');
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveProject(p, blobs))
      .then(() => {
        if (useEditor.getState().project === p) {
          setSaveStatus('saved');
          setWarning('');
        }
      })
      .catch((e) => {
        setSaveStatus('failed');
        setWarning(
          tr(
            `本地保存失败：${errorText(e)}。请下载工程备份，当前布局仍保留在页面中。`,
            `Local save failed: ${errorText(e)}. Download a project backup; current layout remains open.`,
          ),
        );
      });
    return saveQueue.current;
  }, []);

  useEffect(() => {
    if (!ready || !autoAllowed.current) return;
    setSaveStatus('waiting');
    const timer = setTimeout(() => {
      const s = useEditor.getState();
      void persist(s.project, s.blobs);
    }, 500);
    return () => clearTimeout(timer);
  }, [project, ready, persist]);

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (busy || pending || help) return;
      const el = e.target as HTMLElement;
      if (el.closest('input,textarea,select,[contenteditable="true"]')) return;
      const s = useEditor.getState();
      try {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? s.redo() : s.undo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && s.selected) {
          e.preventDefault();
          s.duplicate();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected) {
          e.preventDefault();
          s.remove();
        } else if ((e.code === 'Space' || e.key === ' ') && s.wiringMode) {
          e.preventDefault();
          s.switchWiringEnd();
        } else if (e.key === 'Escape') {
          if (s.dragPreview) return;
          if (s.wiringMode) {
            s.setWiringMode(false);
            return;
          }
          s.select(null);
          setPanel(null);
        }
      } catch (error) {
        notify(
          editorErrorMessage(
            error,
            tr(
              '场景已达到模型预算，请先移除部分物品。',
              'Scene triangle budget reached. Remove some items first.',
            ),
          ),
        );
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, pending, help, notify]);

  function changeView(kind: View['kind']) {
    setView((v) => ({ kind, nonce: v.nonce + 1 }));
  }

  async function readModel(file?: File) {
    if (!file) return;
    setBusy(t('正在检查模型…', 'Inspecting 3D model…'));
    try {
      const format = file.name.toLowerCase().endsWith('.glb')
        ? 'glb'
        : file.name.toLowerCase().endsWith('.gltf')
          ? 'gltf'
          : null;
      if (!format)
        throw new Error(
          t(
            '请选择 .glb 或自包含 .gltf 文件。',
            'Please select a .glb or self-contained .gltf file.',
          ),
        );
      const model = await inspectModel(file, format);
      setPending({ file, model, format });
      setLongest(30);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy('');
    }
  }

  const closeImport = useCallback(() => {
    setPending((p) => {
      if (p) disposeModel(p.model);
      return null;
    });
  }, []);

  function acceptImport() {
    if (!pending) return;
    try {
      const { model, file, format } = pending;
      const size = {
        width: (model.size.width * longest) / 30,
        height: (model.size.height * longest) / 30,
        depth: (model.size.depth * longest) / 30,
      };
      const meta: AssetMeta = {
        id: uid(),
        name: file.name,
        format,
        bytes: file.size,
        size: model.size,
        triangles: model.triangles,
      };
      useEditor.getState().addImported(meta, file, size);
      registerModel(meta.id, model);
      setPending(null);
      notify(
        t(
          '模型已添加到桌面，可在右侧继续调整。',
          'Model added to desk. Adjust details in the right panel.',
        ),
      );
    } catch (e) {
      notify(`${t('无法添加模型：', 'Cannot add model: ')}${errorText(e)}`);
    }
  }

  async function download() {
    setBusy(t('正在打包工程…', 'Packaging project…'));
    try {
      const s = useEditor.getState(),
        blob = await exportProjectFile(s.project, s.blobs),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `${s.project.name.replace(/[<>:"/\\|?*]/g, '_')}.desksetup.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      notify(
        t(
          '工程已下载，包含当前布局和自定义模型。',
          'Project downloaded with layout and custom models.',
        ),
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy('');
    }
  }

  async function readProject(file?: File) {
    if (!file) return;
    if (
      !window.confirm(
        t(
          '导入工程会替换当前布局。需要保留时，请先取消并导出当前工程。继续导入？',
          'Importing a project replaces your current layout. Export first if you want to keep it. Continue?',
        ),
      )
    )
      return;
    setBusy(t('正在校验工程与模型…', 'Validating project & models…'));
    try {
      const result = await importProjectFile(file);
      flushSync(() => setSceneVisible(false));
      clearModelCache();
      result.models.forEach((model, id) => registerModel(id, model));
      autoAllowed.current = true;
      useEditor.getState().replace(result.project, result.blobs);
      setSceneVisible(true);
      setWarning('');
      notify(t('工程已恢复，欢迎回到桌构工作台。', 'Project restored. Welcome back to DeskCraft.'));
    } catch (e) {
      notify(
        `${t('工程未导入，原布局已保留：', 'Import cancelled, existing layout kept: ')}${errorText(e)}`,
      );
    } finally {
      setBusy('');
    }
  }

  function reset() {
    if (
      !window.confirm(
        t(
          '新建会替换当前布局。需要保留时，请先取消并导出工程。确定新建？',
          'Creating a new setup replaces your current layout. Export first if needed. Continue?',
        ),
      )
    )
      return;
    flushSync(() => setSceneVisible(false));
    clearModelCache();
    autoAllowed.current = true;
    setWarning('');
    useEditor.getState().replace(defaultProject(), new Map());
    setSceneVisible(true);
    changeView('fit');
    notify(t('已新建默认桌搭。', 'Reset to default desk setup.'));
  }

  const outside = project.items.filter((i) => isOutOfBounds(i, project.desk, project.items)).length;

  return (
    <div className={`app-shell ${panel ? 'show-' + panel : ''}`} aria-busy={!!busy || !ready}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong className={lang === 'en' ? 'brand-en' : ''}>{t('桌构', 'DeskCraft')}</strong>
            <small>{t('给理想生活，留一张桌子', 'Design Your Ideal Workspace')}</small>
          </div>
        </div>
        <div className="header-divider" />
        <div className="project-name">
          <span>{t('工作台', 'Project')}</span>
          <label>
            <input
              aria-label={t('工程名称', 'Project Name')}
              key={`${project.id}:${project.name}`}
              defaultValue={project.name}
              maxLength={80}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name)
                  useEditor.getState().commit((p) => {
                    p.name = name;
                  });
                else e.target.value = project.name;
              }}
            />
            <ChevronDown size={13} />
          </label>
        </div>
        <div className="history-tools">
          <button
            className="icon-button"
            title={t('撤销 Ctrl+Z', 'Undo Ctrl+Z')}
            aria-label={t('撤销', 'Undo')}
            disabled={!past.length}
            onClick={() => useEditor.getState().undo()}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            title={t('重做 Ctrl+Shift+Z', 'Redo Ctrl+Shift+Z')}
            aria-label={t('重做', 'Redo')}
            disabled={!future.length}
            onClick={() => useEditor.getState().redo()}
          >
            <Redo2 size={18} />
          </button>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="lang-toggle"
            role="switch"
            aria-checked={lang === 'en'}
            aria-label={t('切换语言为英文', 'Switch language to Chinese')}
            title={t('切换中英文', 'Toggle Chinese / English')}
            onClick={toggleLang}
          >
            <span className={lang === 'zh' ? 'active' : ''}>中文</span>
            <span className={lang === 'en' ? 'active' : ''}>EN</span>
          </button>
          <span
            className={`save-status ${warning ? 'save-error' : ''}`}
            title={t(
              '本地保存绑定当前浏览器；下载工程才能跨设备备份。',
              'Saved in this browser only; export project file for cross-device backup.',
            )}
          >
            {warning ? (
              <TriangleAlert size={13} />
            ) : saveStatus === 'saved' ? (
              <Check size={14} />
            ) : (
              <HardDrive size={13} />
            )}
            <span>{saveStateLabel}</span>
          </span>
          <button className="quiet-button new-button" onClick={reset} disabled={!ready}>
            <Plus size={16} />
            {t('新建', 'New')}
          </button>
          <button
            className="quiet-button"
            aria-label={t('打开工程', 'Open Project')}
            onClick={() => projectInput.current?.click()}
            disabled={!ready}
          >
            <ArrowUpFromLine size={15} />
            <span>{t('打开工程', 'Open')}</span>
          </button>
          <button
            className="primary-button"
            aria-label={t('导出工程', 'Export Project')}
            onClick={download}
            disabled={!ready}
          >
            <ArrowDownToLine size={15} />
            <span>{t('导出工程', 'Export')}</span>
          </button>
        </div>
      </header>
      <div className="mobile-tools">
        <button
          onClick={() => setPanel(panel === 'library' ? null : 'library')}
          aria-expanded={panel === 'library'}
        >
          <PanelLeft size={16} />
          {t('模型库', 'Library')}
        </button>
        <span>{t('三维桌搭工作台', '3D Workspace Studio')}</span>
        <button
          onClick={() => setPanel(panel === 'inspector' ? null : 'inspector')}
          aria-expanded={panel === 'inspector'}
        >
          <SlidersHorizontal size={16} />
          {t('属性', 'Inspector')}
        </button>
      </div>
      <main className="editor-layout">
        <ModelLibrary onImport={() => modelInput.current?.click()} onError={notify} />
        <section className="workspace" aria-label={t('三维桌搭预览', '3D Desk Preview')}>
          <div className="viewport-heading">
            <div>
              <span className="workspace-dot" />
              <strong>{t('自由搭建', 'Free Build')}</strong>
              <span className="viewport-separator">/</span>
              <span>
                {view.kind === 'top'
                  ? t('俯视视角', 'Top View')
                  : view.kind === 'front'
                    ? t('正面视角', 'Front View')
                    : t('透视视角', 'Perspective')}
              </span>
            </div>
            <span className="grid-scale">
              <span className="grid-icon" />
              {t('1 格 = 10 cm', '1 Grid = 10 cm')}
            </span>
          </div>
          <div
            className="environment-controls"
            role="group"
            aria-label={t('照明环境', 'Lighting Environment')}
          >
            {(
              [
                { value: 'bright', label: t('明亮', 'Bright') },
                { value: 'dark', label: t('暗室', 'Dark') },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                aria-pressed={(project.environment ?? 'bright') === value}
                onClick={() => {
                  const s = useEditor.getState();
                  s.endGesture();
                  s.commit((p) => {
                    p.environment = value;
                  });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {sceneVisible && <DeskScene view={view} onError={notify} />}
          {wiringMode && (
            <div
              className="arm-limit-pill arm-elbow-pill"
              role="status"
              style={{
                maxWidth: 'calc(100% - 32px)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <span>
                {(() => {
                  const hasAsymEnds = Boolean(
                    wiringPreset?.fromPortKind &&
                    wiringPreset?.toPortKind &&
                    wiringPreset.fromPortKind !== wiringPreset.toPortKind,
                  );
                  const draftItem = wiringDraft
                    ? project.items.find((it) => it.id === wiringDraft.itemId)
                    : undefined;
                  const draftIsOutletSlot = Boolean(
                    wiringDraft &&
                    (draftItem?.kind === 'powerStrip' || draftItem?.kind === 'wallOutlet') &&
                    wiringDraft.portId.startsWith('slot-'),
                  );
                  const heldPlug = draftItem
                    ? draftIsOutletSlot
                      ? wiringPreset?.devicePlugType
                      : wiringPreset?.outletPlugType
                    : wiringActiveEnd === 'from'
                      ? wiringPreset?.devicePlugType
                      : wiringPreset?.outletPlugType;
                  const heldPortKind = draftItem
                    ? draftIsOutletSlot
                      ? wiringPreset?.fromPortKind
                      : wiringPreset?.toPortKind
                    : wiringActiveEnd === 'from'
                      ? wiringPreset?.fromPortKind
                      : wiringPreset?.toPortKind;
                  const heldDesc = heldPlug
                    ? PLUG_SPEC_META[heldPlug].shortLabel
                    : heldPortKind === 'dp'
                      ? lang === 'en'
                        ? 'DP Plug'
                        : 'DP接头'
                      : heldPortKind === 'magsafe'
                        ? lang === 'en'
                          ? 'Magnetic Plug'
                          : '磁吸接头'
                        : lang === 'en'
                          ? 'Type-C Plug'
                          : 'Type-C接头';
                  return lang === 'en'
                    ? `3D Wiring${wiringPreset?.label ? ` (${wiringPreset.label}${wiringPreset.lengthM ? ` · ${wiringPreset.lengthM}m` : ''})` : ''} · Holding End ${wiringActiveEnd === 'from' ? 'A' : 'B'}${hasAsymEnds ? ` (${heldDesc})` : ''}: ${
                        wiringDraft
                          ? 'Click a green target port to finish or drop under desk'
                          : 'Click a green port to attach this end (Space to flip)'
                      }${wiringShortfallM > 0.01 ? ` · Short by ${wiringShortfallM.toFixed(2)}m` : ''}`
                    : `3D 连线中${wiringPreset?.label ? `（${wiringPreset.label}）${wiringPreset.lengthM ? ` · ${wiringPreset.lengthM}m` : ''}` : ''} · 手持${wiringActiveEnd === 'from' ? ' A 端' : ' B 端'}${hasAsymEnds ? `(${heldDesc})` : ''}：${
                        wiringDraft
                          ? '点击目标绿色端口完成连接或落至桌下'
                          : '点击设备绿色端口先接此端（按空格切换另一端）'
                      }${wiringShortfallM > 0.01 ? ` · 线长不足差 ${wiringShortfallM.toFixed(2)}m` : ''}`;
                })()}
              </span>
              <button
                type="button"
                style={{ pointerEvents: 'auto', marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                onClick={() => useEditor.getState().switchWiringEnd()}
              >
                {t('切换另一端 (Space)', 'Flip End (Space)')}
              </button>
              {wiringDraft && (
                <button
                  type="button"
                  style={{ pointerEvents: 'auto', marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                  onClick={() => useEditor.getState().dropWiringDraftToFloor('auto')}
                >
                  {t('落至桌下走线', 'Drop Under Desk')}
                </button>
              )}
              <button
                type="button"
                style={{ pointerEvents: 'auto', marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                onClick={() => useEditor.getState().setWiringMode(false)}
              >
                {t('取消', 'Cancel')}
              </button>
            </div>
          )}
          {collisionNotice && (
            <div
              className="arm-limit-pill arm-elbow-pill"
              role="alert"
              style={
                wiringMode
                  ? {
                      top: 108,
                      zIndex: 7,
                      background: 'rgba(185, 28, 28, 0.95)',
                      borderColor: 'rgba(248, 113, 113, 0.55)',
                      color: '#fff',
                    }
                  : undefined
              }
            >
              <TriangleAlert size={14} style={{ flexShrink: 0, marginRight: 6 }} />
              <span>{collisionNotice}</span>
            </div>
          )}
          <div className="workspace-label">
            <span>
              {t('为你的日常，找到更好的位置。', 'Find a better place for your everyday gear.')}
            </span>
            <small>{t('真实尺寸 · 自由组合', 'True-to-Scale · Modular Layout')}</small>
          </div>
          <div className="view-controls" aria-label={t('视角切换', 'Camera Views')}>
            <button
              className={view.kind === 'perspective' || view.kind === 'fit' ? 'active' : ''}
              onClick={() => changeView('perspective')}
            >
              <Box size={16} />
              {t('透视', '3D')}
            </button>
            <button
              className={view.kind === 'top' ? 'active' : ''}
              onClick={() => changeView('top')}
            >
              <LayersIcon />
              {t('俯视', 'Top')}
            </button>
            <button
              className={view.kind === 'front' ? 'active' : ''}
              onClick={() => changeView('front')}
            >
              <Move3D size={16} />
              {t('正视', 'Front')}
            </button>
            <span />
            <button
              title={t('适配桌面', 'Fit to Desk')}
              aria-label={t('适配桌面', 'Fit to Desk')}
              onClick={() => changeView('fit')}
            >
              <Scan size={17} />
            </button>
            <button
              className={wiringMode ? 'active' : ''}
              title={t('3D 点选端口手动连线', '3D Interactive Port Wiring')}
              aria-label={t('3D 手动连线', '3D Manual Wiring')}
              aria-pressed={wiringMode}
              onClick={() => useEditor.getState().setWiringMode(!wiringMode)}
            >
              <CableIcon size={16} />
              {t('连线', 'Wire')}
            </button>
          </div>
          <div className="viewport-bottom">
            <div>
              <span className="tiny-dot" />{' '}
              {lang === 'en' ? `${project.items.length} items` : `${project.items.length} 件物品`}
              {outside > 0 && (
                <button
                  className="outbound-count"
                  onClick={() => {
                    const first = project.items.find((i) =>
                      isOutOfBounds(i, project.desk, project.items),
                    );
                    if (first) useEditor.getState().select(first.id);
                  }}
                >
                  <TriangleAlert size={12} />
                  {lang === 'en' ? `${outside} out of bounds` : `${outside} 件超出桌面`}
                </button>
              )}
            </div>
            <button
              className="help-button"
              onClick={() => setHelp(!help)}
              aria-label={t('操作帮助', 'Controls Help')}
            >
              <CircleHelp size={18} />
            </button>
          </div>
          {dragPreview &&
            (dragPreview.kind === undefined ||
              dragPreview.kind === 'position' ||
              dragPreview.kind === 'armElbow' ||
              dragPreview.kind === 'armLowerPitch' ||
              dragPreview.kind === 'armUpperPitch' ||
              dragPreview.kind === 'armBase') &&
            dragPreview.limitReason && (
              <div className="arm-limit-pill" role="status">
                <TriangleAlert size={13} />
                <span>
                  {armLimitMessage(
                    dragPreview.limitReason,
                    'maxReachCm' in dragPreview ? dragPreview.maxReachCm : undefined,
                    'obstacleName' in dragPreview ? dragPreview.obstacleName : undefined,
                  )}
                </span>
              </div>
            )}
          {dragPreview?.kind === 'rotation' && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {lang === 'en'
                  ? `Rotation ${Math.round(dragPreview.rotation * 10) / 10}° · ${
                      dragPreview.hitObstacle
                        ? `Blocked by ${translateObstacleLabel(dragPreview.hitObstacle, 'en')}`
                        : 'Rotating (Esc to cancel)'
                    }`
                  : `旋转角度 ${Math.round(dragPreview.rotation * 10) / 10}° · ${
                      dragPreview.hitObstacle
                        ? `已触碰${dragPreview.hitObstacle}（防穿模限制）`
                        : '自由旋转中（Esc 取消）'
                    }`}
              </span>
            </div>
          )}
          {dragPreview?.kind === 'pose' && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {dragPreview.axis === 'pitch'
                  ? lang === 'en'
                    ? `Tilt ${Math.round(dragPreview.value * 10) / 10}° · ${
                        dragPreview.hitObstacle
                          ? `Blocked by ${translateObstacleLabel(dragPreview.hitObstacle, 'en')}`
                          : 'Adjusting tilt (Esc to cancel)'
                      }`
                    : `俯仰角度 ${Math.round(dragPreview.value * 10) / 10}° · ${
                        dragPreview.hitObstacle
                          ? `已触碰${dragPreview.hitObstacle}（防穿模限制）`
                          : '俯仰调节中（Esc 取消）'
                      }`
                  : dragPreview.axis === 'roll'
                    ? lang === 'en'
                      ? `Pivot ${Math.round(dragPreview.value * 10) / 10}° · ${
                          dragPreview.hitObstacle
                            ? `Blocked by ${translateObstacleLabel(dragPreview.hitObstacle, 'en')}`
                            : 'Adjusting pivot (Esc to cancel)'
                        }`
                      : `屏幕翻转 ${Math.round(dragPreview.value * 10) / 10}° · ${
                          dragPreview.hitObstacle
                            ? `已触碰${dragPreview.hitObstacle}（防穿模限制）`
                            : '翻转调节中（Esc 取消）'
                        }`
                    : lang === 'en'
                      ? `Lid Angle ${Math.round(dragPreview.value * 10) / 10}° · Adjusting (Esc to cancel)`
                      : `屏幕开合角 ${Math.round(dragPreview.value * 10) / 10}° · 开合调节中（Esc 取消）`}
              </span>
            </div>
          )}
          {dragPreview &&
            (!dragPreview.kind || dragPreview.kind === 'position') &&
            typeof dragPreview.wallY === 'number' && (
              <div className="arm-limit-pill arm-elbow-pill" role="status">
                <span>
                  {project.items.find((i) => i.id === dragPreview.id)?.kind === 'wallOutlet'
                    ? lang === 'en'
                      ? `Height ${Math.round(dragPreview.wallY * 100)} cm above floor`
                      : `离地高度 ${Math.round(dragPreview.wallY * 100)} cm`
                    : lang === 'en'
                      ? `Mount height ${Math.round(dragPreview.wallY * 100)} cm`
                      : `墙面挂高 ${Math.round(dragPreview.wallY * 100)} cm`}{' '}
                  · {t('沿墙面拖动调节（Esc 取消）', 'Drag along wall (Esc to cancel)')}
                </span>
              </div>
            )}
          {dragPreview?.kind === 'armElbow' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {lang === 'en'
                  ? `${dragPreview.role === 'primary' ? 'Primary' : 'Secondary'} Elbow Yaw ${Math.round(dragPreview.yawDeg)}° (Esc to cancel)`
                  : `${dragPreview.role === 'primary' ? '主臂' : '副臂'}肘关节水平摆角 ${Math.round(dragPreview.yawDeg)}° · 水平调节中（Esc 取消）`}
              </span>
            </div>
          )}
          {dragPreview?.kind === 'armLowerPitch' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {lang === 'en'
                  ? `${dragPreview.role === 'primary' ? 'Primary' : 'Secondary'} Lower Arm Pitch ${dragPreview.lowerPitchDeg.toFixed(1)}° · Fixed 27.5 cm (Esc to cancel)`
                  : `${dragPreview.role === 'primary' ? '主臂' : '副臂'}下长臂俯仰 ${dragPreview.lowerPitchDeg.toFixed(1)}° · 定长 27.5 cm 上下调节中（Esc 取消）`}
              </span>
            </div>
          )}
          {dragPreview?.kind === 'armUpperPitch' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {lang === 'en'
                  ? `${dragPreview.role === 'primary' ? 'Primary' : 'Secondary'} Upper Arm Pitch ${dragPreview.upperPitchDeg.toFixed(1)}° · Fixed 30.5 cm (Esc to cancel)`
                  : `${dragPreview.role === 'primary' ? '主臂' : '副臂'}气压上臂俯仰 ${dragPreview.upperPitchDeg.toFixed(1)}° · 定长 30.5 cm 升降调节中（Esc 取消）`}
              </span>
            </div>
          )}
          {dragPreview?.kind === 'armBase' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {t('支架底座（', 'Arm Base (')}
                {dragPreview.clampEdge === 'back'
                  ? t('后桌缘', 'Back Edge')
                  : dragPreview.clampEdge === 'left'
                    ? t('左桌缘', 'Left Edge')
                    : dragPreview.clampEdge === 'right'
                      ? t('右桌缘', 'Right Edge')
                      : t('桌面穿孔固定', 'Grommet Mount')}
                {t('）· X ', ') · X ')}
                {(dragPreview.clampX * 100).toFixed(1)} cm / Z{' '}
                {(dragPreview.clampZ * 100).toFixed(1)} {t('cm（Esc 取消）', 'cm (Esc to cancel)')}
              </span>
            </div>
          )}
          {(selected || selectedCableId) && (
            <button className="back-to-desk" onClick={() => useEditor.getState().select(null)}>
              {t('编辑桌子', 'Edit Desk')}
              <ChevronDown size={13} />
            </button>
          )}
        </section>
        <Inspector key={selected ?? 'desk'} onError={notify} />
      </main>
      <footer className="app-footer">
        <span>
          <MousePointer2 size={13} />
          {t(
            '右键唤醒选中物品 · 选中后左键拖拽移动与旋转',
            'Right-click to select item · Left-drag selected item to move & rotate',
          )}
        </span>
        <span>
          <Rotate3D size={14} />
          {t(
            '左键空白/未选物品旋转视角 · 中键或空白右键平移 · 滚轮缩放',
            'Left-drag empty space to orbit · Middle/right-drag to pan · Scroll to zoom',
          )}
        </span>
        <span className="footer-right">
          {t('你的灵感，只保存在本地', 'Stored locally in your browser')}
          <ShieldIcon />
        </span>
      </footer>
      {warning && (
        <div className="persistent-warning" role="alert">
          <TriangleAlert size={18} />
          <span>{warning}</span>
          <button onClick={download}>{t('下载备份', 'Download Backup')}</button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label={t('关闭提示', 'Dismiss')}>
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className="help-popover" role="dialog" aria-label={t('操作帮助', 'Controls Help')}>
          <div>
            <h3>{t('像整理桌面一样简单', 'Intuitive 3D Desk Planning')}</h3>
            <button onClick={() => setHelp(false)} aria-label={t('关闭帮助', 'Close Help')}>
              <X size={16} />
            </button>
          </div>
          <p>
            {t(
              '未选中物品时，左键在任意位置拖拽均可旋转三维视角（不会误触物体）；右键点击物体唤醒并选中后，即可使用左键直接拖拽移动、点击/拖拽旋钮旋转或微调线缆节点；中键或空白处右键平移，滚轮缩放。',
              'When nothing is selected, left-drag anywhere to orbit the camera without accidentally moving items. Right-click an item to select it, then left-drag to move, use gizmos to rotate, or drag cable waypoints. Middle/right-drag empty space to pan, scroll to zoom.',
            )}
          </p>
          <p>
            {t(
              'Ctrl / ⌘ + Z 撤销，Shift + Z 重做；Ctrl / ⌘ + D 复制，Delete 删除。Esc 取消拖动。',
              'Ctrl / ⌘ + Z to undo, Shift + Z to redo; Ctrl / ⌘ + D to duplicate, Delete to remove, Esc to cancel drag.',
            )}
          </p>
          <p>
            {t(
              '已启用模型与线缆物理防穿模约束，支持穿桌面与显示器底座走线孔及节点微调。',
              'Physical collision avoidance and fixed-length cable routing are active, supporting desk grommets and stand cable slots.',
            )}
          </p>
          <p>
            {t(
              '本地保存不是云备份。清理站点数据会删除布局，请定期导出工程。',
              'Browser storage is not cloud backup. Export your project regularly before clearing site data.',
            )}
          </p>
        </div>
      )}
      {pending && (
        <ImportDialog
          model={pending.model}
          name={pending.file.name}
          longest={longest}
          onLongest={setLongest}
          onClose={closeImport}
          onAccept={acceptImport}
        />
      )}
      {(busy || !ready) && (
        <div className="busy-shade" role="status">
          <LoaderCircle className="spin" size={24} />
          <span>{busy || t('正在打开你的工作台…', 'Opening your workspace…')}</span>
        </div>
      )}
      <input
        ref={modelInput}
        type="file"
        accept=".glb,.gltf"
        aria-label={t('导入模型文件', 'Import 3D Model File')}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          void readModel(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,.desksetup.json"
        aria-label={t('导入工程文件', 'Import Project File')}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          void readProject(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function LayersIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

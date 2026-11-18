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
import { inspectModel, disposeModel, type LoadedModel } from './assets/importModel';
import { registerModel, clearModelCache } from './assets/modelCache';
import { saveProject, loadProject } from './persistence/projectRepository';
import { exportProjectFile, importProjectFile } from './persistence/projectFile';
type Pending = { file: File; model: LoadedModel; format: 'glb' | 'gltf' };
function errorText(e: unknown) {
  return e instanceof Error ? e.message : '操作未完成，请重试。';
}
export default function App() {
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
    [saveState, setSaveState] = useState('正在恢复布局'),
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
            setWarning('部分本地模型资源缺失，已保留物品占位。请导入备份工程恢复。');
            autoAllowed.current = false;
          }
        }
        setSaveState(autoAllowed.current ? '等待保存' : '自动保存已暂停');
      })
      .catch((e) => {
        autoAllowed.current = false;
        setWarning(
          `恢复失败：${errorText(e)}。当前默认布局不会自动覆盖旧工程，可先导出备份再新建。`,
        );
        setSaveState('自动保存不可用');
      })
      .finally(() => setReady(true));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const persist = useCallback((p: Project, blobs: Map<string, Blob>) => {
    setSaveState('正在保存');
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveProject(p, blobs))
      .then(() => {
        if (useEditor.getState().project === p) {
          setSaveState('已保存到此浏览器');
          setWarning('');
        }
      })
      .catch((e) => {
        setSaveState('保存失败');
        setWarning(`本地保存失败：${errorText(e)}。请下载工程备份，当前布局仍保留在页面中。`);
      });
    return saveQueue.current;
  }, []);
  useEffect(() => {
    if (!ready || !autoAllowed.current) return;
    setSaveState('等待保存');
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
        notify(editorErrorMessage(error, '场景已达到模型预算，请先移除部分物品。'));
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
    setBusy('正在检查模型…');
    try {
      const format = file.name.toLowerCase().endsWith('.glb')
        ? 'glb'
        : file.name.toLowerCase().endsWith('.gltf')
          ? 'gltf'
          : null;
      if (!format) throw new Error('请选择 .glb 或自包含 .gltf 文件。');
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
      notify('模型已添加到桌面，可在右侧继续调整。');
    } catch (e) {
      notify(`无法添加模型：${errorText(e)}`);
    }
  }
  async function download() {
    setBusy('正在打包工程…');
    try {
      const s = useEditor.getState(),
        blob = await exportProjectFile(s.project, s.blobs),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `${s.project.name.replace(/[<>:"/\\|?*]/g, '_')}.desksetup.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      notify('工程已下载，包含当前布局和自定义模型。');
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy('');
    }
  }
  async function readProject(file?: File) {
    if (!file) return;
    if (!window.confirm('导入工程会替换当前布局。需要保留时，请先取消并导出当前工程。继续导入？'))
      return;
    setBusy('正在校验工程与模型…');
    try {
      const result = await importProjectFile(file);
      flushSync(() => setSceneVisible(false));
      clearModelCache();
      result.models.forEach((model, id) => registerModel(id, model));
      autoAllowed.current = true;
      useEditor.getState().replace(result.project, result.blobs);
      setSceneVisible(true);
      setWarning('');
      notify('工程已恢复，欢迎回到桌构工作台。');
    } catch (e) {
      notify(`工程未导入，原布局已保留：${errorText(e)}`);
    } finally {
      setBusy('');
    }
  }
  function reset() {
    if (!window.confirm('新建会替换当前布局。需要保留时，请先取消并导出工程。确定新建？')) return;
    flushSync(() => setSceneVisible(false));
    clearModelCache();
    autoAllowed.current = true;
    setWarning('');
    useEditor.getState().replace(defaultProject(), new Map());
    setSceneVisible(true);
    changeView('fit');
    notify('已新建默认桌搭。');
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
            <strong>
              桌构<span>DeskCraft</span>
            </strong>
            <small>给理想生活，留一张桌子</small>
          </div>
        </div>
        <div className="header-divider" />
        <div className="project-name">
          <span>工作台</span>
          <label>
            <input
              aria-label="工程名称"
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
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            disabled={!past.length}
            onClick={() => useEditor.getState().undo()}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            title="重做 Ctrl+Shift+Z"
            aria-label="重做"
            disabled={!future.length}
            onClick={() => useEditor.getState().redo()}
          >
            <Redo2 size={18} />
          </button>
        </div>
        <div className="header-actions">
          <span
            className={`save-status ${warning ? 'save-error' : ''}`}
            title="本地保存绑定当前浏览器；下载工程才能跨设备备份。"
          >
            {warning ? (
              <TriangleAlert size={13} />
            ) : saveState.includes('保存到') ? (
              <Check size={14} />
            ) : (
              <HardDrive size={13} />
            )}
            <span>{saveState}</span>
          </span>
          <button className="quiet-button new-button" onClick={reset} disabled={!ready}>
            <Plus size={16} />
            新建
          </button>
          <button
            className="quiet-button"
            aria-label="打开工程"
            onClick={() => projectInput.current?.click()}
            disabled={!ready}
          >
            <ArrowUpFromLine size={15} />
            <span>打开工程</span>
          </button>
          <button
            className="primary-button"
            aria-label="导出工程"
            onClick={download}
            disabled={!ready}
          >
            <ArrowDownToLine size={15} />
            <span>导出工程</span>
          </button>
        </div>
      </header>
      <div className="mobile-tools">
        <button
          onClick={() => setPanel(panel === 'library' ? null : 'library')}
          aria-expanded={panel === 'library'}
        >
          <PanelLeft size={16} />
          模型库
        </button>
        <span>三维桌搭工作台</span>
        <button
          onClick={() => setPanel(panel === 'inspector' ? null : 'inspector')}
          aria-expanded={panel === 'inspector'}
        >
          <SlidersHorizontal size={16} />
          属性
        </button>
      </div>
      <main className="editor-layout">
        <ModelLibrary onImport={() => modelInput.current?.click()} onError={notify} />
        <section className="workspace" aria-label="三维桌搭预览">
          <div className="viewport-heading">
            <div>
              <span className="workspace-dot" />
              <strong>自由搭建</strong>
              <span className="viewport-separator">/</span>
              <span>
                {view.kind === 'top' ? '俯视视角' : view.kind === 'front' ? '正面视角' : '透视视角'}
              </span>
            </div>
            <span className="grid-scale">
              <span className="grid-icon" />1 格 = 10 cm
            </span>
          </div>
          <div className="environment-controls" role="group" aria-label="照明环境">
            {(
              [
                { value: 'bright', label: '明亮' },
                { value: 'dark', label: '暗室' },
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
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {`3D 连线中${wiringPreset?.label ? `（${wiringPreset.label}）${wiringPreset.lengthM ? ` · ${wiringPreset.lengthM}m` : ''}` : ''} · 手持${wiringActiveEnd === 'from' ? ' A 端' : ' B 端'}${
                  wiringPreset?.fromPortKind &&
                  wiringPreset?.toPortKind &&
                  wiringPreset.fromPortKind !== wiringPreset.toPortKind
                    ? `(${(wiringActiveEnd === 'from' ? wiringPreset.fromPortKind : wiringPreset.toPortKind) === 'dp' ? 'DP接头' : 'Type-C接头'})`
                    : ''
                }：${
                  wiringDraft
                    ? '点击目标绿色端口完成连接或落至桌下'
                    : '点击设备绿色端口先接此端（按空格切换另一端）'
                }${wiringShortfallM > 0.01 ? ` · 线长不足差 ${wiringShortfallM.toFixed(2)}m` : ''}`}
              </span>
              <button
                type="button"
                style={{ pointerEvents: 'auto', marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                onClick={() => useEditor.getState().switchWiringEnd()}
              >
                切换另一端 (Space)
              </button>
              {wiringDraft && (
                <button
                  type="button"
                  style={{ pointerEvents: 'auto', marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                  onClick={() => useEditor.getState().dropWiringDraftToFloor('auto')}
                >
                  落至桌下走线
                </button>
              )}
              <button
                type="button"
                style={{ pointerEvents: 'auto', marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                onClick={() => useEditor.getState().setWiringMode(false)}
              >
                取消
              </button>
            </div>
          )}
          {!wiringMode && collisionNotice && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>{collisionNotice}</span>
            </div>
          )}
          <div className="workspace-label">
            <span>为你的日常，找到更好的位置。</span>
            <small>真实尺寸 · 自由组合</small>
          </div>
          <div className="view-controls" aria-label="视角切换">
            <button
              className={view.kind === 'perspective' || view.kind === 'fit' ? 'active' : ''}
              onClick={() => changeView('perspective')}
            >
              <Box size={16} />
              透视
            </button>
            <button
              className={view.kind === 'top' ? 'active' : ''}
              onClick={() => changeView('top')}
            >
              <LayersIcon />
              俯视
            </button>
            <button
              className={view.kind === 'front' ? 'active' : ''}
              onClick={() => changeView('front')}
            >
              <Move3D size={16} />
              正视
            </button>
            <span />
            <button title="适配桌面" aria-label="适配桌面" onClick={() => changeView('fit')}>
              <Scan size={17} />
            </button>
            <button
              className={wiringMode ? 'active' : ''}
              title="3D 点选端口手动连线"
              aria-label="3D 手动连线"
              aria-pressed={wiringMode}
              onClick={() => useEditor.getState().setWiringMode(!wiringMode)}
            >
              <CableIcon size={16} />
              连线
            </button>
          </div>
          <div className="viewport-bottom">
            <div>
              <span className="tiny-dot" /> {project.items.length} 件物品
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
                  {outside} 件超出桌面
                </button>
              )}
            </div>
            <button className="help-button" onClick={() => setHelp(!help)} aria-label="操作帮助">
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
                旋转角度 {Math.round(dragPreview.rotation * 10) / 10}° ·{' '}
                {dragPreview.hitObstacle
                  ? `已触碰${dragPreview.hitObstacle}（防穿模限制）`
                  : '自由旋转中（Esc 取消）'}
              </span>
            </div>
          )}
          {dragPreview?.kind === 'pose' && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {dragPreview.axis === 'pitch'
                  ? `俯仰角度 ${Math.round(dragPreview.value * 10) / 10}° · ${
                      dragPreview.hitObstacle
                        ? `已触碰${dragPreview.hitObstacle}（防穿模限制）`
                        : '俯仰调节中（Esc 取消）'
                    }`
                  : dragPreview.axis === 'roll'
                    ? `屏幕翻转 ${Math.round(dragPreview.value * 10) / 10}° · ${
                        dragPreview.hitObstacle
                          ? `已触碰${dragPreview.hitObstacle}（防穿模限制）`
                          : '翻转调节中（Esc 取消）'
                      }`
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
                    ? `离地高度 ${Math.round(dragPreview.wallY * 100)} cm`
                    : `墙面挂高 ${Math.round(dragPreview.wallY * 100)} cm`}{' '}
                  · 沿墙面拖动调节（Esc 取消）
                </span>
              </div>
            )}
          {dragPreview?.kind === 'armElbow' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {dragPreview.role === 'primary' ? '主臂' : '副臂'}肘关节水平摆角{' '}
                {Math.round(dragPreview.yawDeg)}° · 水平调节中（Esc 取消）
              </span>
            </div>
          )}
          {dragPreview?.kind === 'armLowerPitch' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {dragPreview.role === 'primary' ? '主臂' : '副臂'}下长臂俯仰{' '}
                {dragPreview.lowerPitchDeg.toFixed(1)}° · 定长 27.5 cm 上下调节中（Esc 取消）
              </span>
            </div>
          )}
          {dragPreview?.kind === 'armUpperPitch' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                {dragPreview.role === 'primary' ? '主臂' : '副臂'}气压上臂俯仰{' '}
                {dragPreview.upperPitchDeg.toFixed(1)}° · 定长 30.5 cm 升降调节中（Esc 取消）
              </span>
            </div>
          )}
          {dragPreview?.kind === 'armBase' && !dragPreview.limitReason && (
            <div className="arm-limit-pill arm-elbow-pill" role="status">
              <span>
                支架底座（
                {dragPreview.clampEdge === 'back'
                  ? '后桌缘'
                  : dragPreview.clampEdge === 'left'
                    ? '左桌缘'
                    : dragPreview.clampEdge === 'right'
                      ? '右桌缘'
                      : '桌面穿孔固定'}
                ）· X {(dragPreview.clampX * 100).toFixed(1)} cm / Z{' '}
                {(dragPreview.clampZ * 100).toFixed(1)} cm（Esc 取消）
              </span>
            </div>
          )}
          {(selected || selectedCableId) && (
            <button className="back-to-desk" onClick={() => useEditor.getState().select(null)}>
              编辑桌子
              <ChevronDown size={13} />
            </button>
          )}
        </section>
        <Inspector key={selected ?? 'desk'} onError={notify} />
      </main>
      <footer className="app-footer">
        <span>
          <MousePointer2 size={13} />
          右键唤醒选中物品 · 选中后左键拖拽移动与旋转
        </span>
        <span>
          <Rotate3D size={14} />
          左键空白/未选物品旋转视角 · 中键或空白右键平移 · 滚轮缩放
        </span>
        <span className="footer-right">
          你的灵感，只保存在本地
          <ShieldIcon />
        </span>
      </footer>
      {warning && (
        <div className="persistent-warning" role="alert">
          <TriangleAlert size={18} />
          <span>{warning}</span>
          <button onClick={download}>下载备份</button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className="help-popover" role="dialog" aria-label="操作帮助">
          <div>
            <h3>像整理桌面一样简单</h3>
            <button onClick={() => setHelp(false)} aria-label="关闭帮助">
              <X size={16} />
            </button>
          </div>
          <p>
            未选中物品时，左键在任意位置拖拽均可旋转三维视角（不会误触物体）；右键点击物体唤醒并选中后，即可使用左键直接拖拽移动、点击/拖拽旋钮旋转或微调线缆节点；中键或空白处右键平移，滚轮缩放。
          </p>
          <p>Ctrl / ⌘ + Z 撤销，Shift + Z 重做；Ctrl / ⌘ + D 复制，Delete 删除。Esc 取消拖动。</p>
          <p>已启用模型与线缆物理防穿模约束，支持穿桌面与显示器底座走线孔及节点微调。</p>
          <p>本地保存不是云备份。清理站点数据会删除布局，请定期导出工程。</p>
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
          <span>{busy || '正在打开你的工作台…'}</span>
        </div>
      )}
      <input
        ref={modelInput}
        type="file"
        accept=".glb,.gltf"
        aria-label="导入模型文件"
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
        aria-label="导入工程文件"
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

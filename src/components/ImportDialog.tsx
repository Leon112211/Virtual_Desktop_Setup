import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { X, Ruler, ShieldCheck } from 'lucide-react';
import type { LoadedModel } from '../assets/importModel';
import { cm } from '../domain/project';
import { NumberField } from './Inspector';
export default function ImportDialog({
  model,
  name,
  longest,
  onLongest,
  onClose,
  onAccept,
}: {
  model: LoadedModel;
  name: string;
  longest: number;
  onLongest: (v: number) => void;
  onClose: () => void;
  onAccept: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useMemo(() => model.root.clone(true), [model]);
  const factor = longest / 30;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && dialog) {
        const elements = Array.from(dialog.querySelectorAll<HTMLElement>('button,input')).filter(
          (el) => !el.hasAttribute('disabled'),
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-shade">
      <div
        ref={ref}
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="dialog-title">
          <div>
            <span className="section-caption">新的桌面成员</span>
            <h2 id="import-title">确认模型尺寸</h2>
          </div>
          <button className="icon-button" aria-label="关闭导入" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="import-preview">
          <Canvas
            camera={{ position: [0.45, 0.35, 0.55], fov: 36 }}
            dpr={[1, 1.5]}
            frameloop="demand"
          >
            <ambientLight intensity={2} />
            <directionalLight position={[2, 3, 3]} intensity={3} />
            <primitive object={instance} dispose={null} />
            <OrbitControls target={[0, 0.12, 0]} enablePan={false} />
          </Canvas>
        </div>
        <h3 className="import-filename">{name}</h3>
        <p className="dialog-copy">
          模型已自动对齐底部中心。文件中的单位不一定等于真实尺寸，请按实物校正后添加。
        </p>
        <NumberField
          label="模型最长边"
          value={longest}
          min={1}
          max={200}
          unit="cm"
          onChange={onLongest}
        />
        <div className="import-dimensions">
          <Ruler size={15} />
          {cm(model.size.width * factor)} × {cm(model.size.depth * factor)} ×{' '}
          {cm(model.size.height * factor)} cm<span>宽 × 深 × 高 · 等比</span>
        </div>
        <div className="privacy-note">
          <ShieldCheck size={15} />
          仅在本地处理，不会上传到服务器
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onAccept}>
            添加到桌面
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editorStore';

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
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  const cancelled = useRef(false);
  const gesture = useRef(false);
  const finishGesture = () => {
    if (!gesture.current) return;
    gesture.current = false;
    useEditor.getState().endGesture();
  };
  useEffect(() => {
    setDraft(String(value));
    setError(false);
  }, [value]);
  useEffect(() => {
    const finish = () => {
      if (gesture.current) {
        gesture.current = false;
        useEditor.getState().endGesture();
      }
    };
    window.addEventListener('blur', finish);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      finish();
      window.removeEventListener('blur', finish);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, []);
  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n) || n < min || n > max) {
      setError(true);
      return;
    }
    setError(false);
    onChange(n);
  }
  function begin() {
    gesture.current = true;
    useEditor.getState().beginGesture();
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
      <input
        type="range"
        className="number-slider"
        aria-label={`${label} 滑块`}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft(String(n));
          setError(false);
          onChange(n);
        }}
        onPointerDown={begin}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onBlur={finishGesture}
        onKeyDown={(e) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(e.key)
          )
            begin();
        }}
        onKeyUp={finishGesture}
      />
      {error && (
        <small>
          请输入 {min}–{max} {unit}
        </small>
      )}
    </label>
  );
}

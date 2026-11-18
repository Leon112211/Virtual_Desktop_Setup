import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

/**
 * Temporarily pauses OrbitControls for the duration of a pointer press until `pointerup`
 * so right-clicking a 3D object never initiates OrbitControls camera panning.
 */
export function pauseOrbitUntilPointerUp(
  controls: OrbitControlsImpl | null | undefined,
  invalidate: () => void,
) {
  if (!controls || !controls.enabled) return;
  controls.enabled = false;
  const restore = () => {
    controls.enabled = true;
    invalidate();
    window.removeEventListener('pointerup', restore);
    window.removeEventListener('pointercancel', restore);
    window.removeEventListener('blur', restore);
  };
  window.addEventListener('pointerup', restore);
  window.addEventListener('pointercancel', restore);
  window.addEventListener('blur', restore);
}

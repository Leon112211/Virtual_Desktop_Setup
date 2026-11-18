import { z } from 'zod';
import type { Size } from './project';

export const keyboardLayouts = ['60', '65', '75', '80', '98', '100'] as const;
export type KeyboardLayout = (typeof keyboardLayouts)[number];

export type KeyDef = {
  x: number; // left edge in U
  z: number; // top edge in U
  w: number; // width in U
  d: number; // depth in U
  label: string;
  role?: 'alpha' | 'mod' | 'accent';
};

export type KeyboardLayoutSpec = {
  id: KeyboardLayout;
  label: string;
  shortLabel: string;
  keysCount: number;
  size: Size;
  uWidth: number;
  uDepth: number;
};

export const KEYBOARD_LAYOUT_SPECS: Record<KeyboardLayout, KeyboardLayoutSpec> = {
  '60': {
    id: '60',
    label: '60% 紧凑 (61键)',
    shortLabel: '60%',
    keysCount: 61,
    size: { width: 0.296, height: 0.034, depth: 0.106 },
    uWidth: 15,
    uDepth: 5,
  },
  '65': {
    id: '65',
    label: '65% 带方向 (68键)',
    shortLabel: '65%',
    keysCount: 68,
    size: { width: 0.315, height: 0.034, depth: 0.106 },
    uWidth: 16,
    uDepth: 5,
  },
  '75': {
    id: '75',
    label: '75% 紧凑 (84键)',
    shortLabel: '75%',
    keysCount: 84,
    size: { width: 0.324, height: 0.036, depth: 0.134 },
    uWidth: 16,
    uDepth: 6.25,
  },
  '80': {
    id: '80',
    label: '80% TKL (87键)',
    shortLabel: '80% TKL',
    keysCount: 87,
    size: { width: 0.36, height: 0.035, depth: 0.13 },
    uWidth: 18.25,
    uDepth: 6.25,
  },
  '98': {
    id: '98',
    label: '98% 紧凑全键 (98键)',
    shortLabel: '98%',
    keysCount: 98,
    size: { width: 0.388, height: 0.036, depth: 0.138 },
    uWidth: 19.5,
    uDepth: 6.25,
  },
  '100': {
    id: '100',
    label: '100% 全尺寸 (104键)',
    shortLabel: '100%',
    keysCount: 104,
    size: { width: 0.44, height: 0.036, depth: 0.136 },
    uWidth: 22.5,
    uDepth: 6.25,
  },
};

export const keyboardThemes = ['white', 'black'] as const;
export type KeyboardTheme = (typeof keyboardThemes)[number];

export const KEYBOARD_THEME_SPECS: Record<KeyboardTheme, { label: string; chassisHex: string }> = {
  white: { label: '纯白', chassisHex: '#f4f6f9' },
  black: { label: '纯黑', chassisHex: '#181a20' },
};

export const keyboardRgbModes = ['rainbow', 'aurora', 'static', 'breathing'] as const;
export type KeyboardRgbMode = (typeof keyboardRgbModes)[number];

/** Infers pure white vs pure black keyboard colorway from explicit theme or chassis luminance. */
export function resolveKeyboardTheme(
  chassisColor: string,
  explicit?: KeyboardTheme,
): KeyboardTheme {
  if (explicit) return explicit;
  const clean = chassisColor.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma < 0.45 ? 'black' : 'white';
  }
  return 'white';
}

export const keyboardSettingsSchema = z.object({
  layout: z.enum(keyboardLayouts),
  switchType: z.enum(['mechanical', 'magnetic']),
  theme: z.enum(keyboardThemes).optional(),
  rgb: z.boolean(),
  rgbMode: z.enum(keyboardRgbModes),
  rgbColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  rgbBrightness: z.number().min(0.2).max(1.5).optional(),
  aviatorCable: z.boolean(),
  cableColor: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export type KeyboardSettings = z.infer<typeof keyboardSettingsSchema>;

export function defaultKeyboardSettings(): KeyboardSettings {
  return {
    layout: '80',
    switchType: 'mechanical',
    theme: 'white',
    rgb: true,
    rgbMode: 'rainbow',
    rgbColor: '#7dd3fc',
    rgbBrightness: 1,
    aviatorCable: false,
    cableColor: '#d8dde6',
  };
}

export function matchKeyboardLayout(size: Size): KeyboardLayout {
  let best: KeyboardLayout = '80';
  let bestScore = Infinity;
  for (const id of keyboardLayouts) {
    const s = KEYBOARD_LAYOUT_SPECS[id].size;
    const score = Math.abs(s.width - size.width) + Math.abs(s.depth - size.depth);
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

export function isOfficialKeyboardSpec(size: Size, keyboard?: KeyboardSettings): boolean {
  const candidates = keyboard?.layout
    ? [KEYBOARD_LAYOUT_SPECS[keyboard.layout]]
    : Object.values(KEYBOARD_LAYOUT_SPECS);
  return candidates.some(
    (spec) =>
      Math.abs(spec.size.width - size.width) < 1e-6 &&
      Math.abs(spec.size.height - size.height) < 1e-6 &&
      Math.abs(spec.size.depth - size.depth) < 1e-6,
  );
}

function pushRow(
  out: KeyDef[],
  z: number,
  startX: number,
  entries: { label: string; w?: number; d?: number; role?: KeyDef['role'] }[],
) {
  let x = startX;
  for (const e of entries) {
    const w = e.w ?? 1;
    out.push({ x, z, w, d: e.d ?? 1, label: e.label, role: e.role ?? 'alpha' });
    x += w;
  }
}

export function buildKeyboardKeys(layout: KeyboardLayout): KeyDef[] {
  const keys: KeyDef[] = [];
  const hasF = layout === '75' || layout === '80' || layout === '98' || layout === '100';
  const yOff = hasF ? 1.25 : 0;

  // Function row
  if (layout === '75') {
    pushRow(keys, 0, 0, [
      { label: 'ESC', role: 'accent' },
      { label: 'F1' },
      { label: 'F2' },
      { label: 'F3' },
      { label: 'F4' },
      { label: 'F5', role: 'mod' },
      { label: 'F6', role: 'mod' },
      { label: 'F7', role: 'mod' },
      { label: 'F8', role: 'mod' },
      { label: 'F9' },
      { label: 'F10' },
      { label: 'F11' },
      { label: 'F12' },
      { label: 'PR', role: 'mod' },
      { label: 'DEL', role: 'mod' },
      { label: 'HM', role: 'mod' },
    ]);
  } else if (layout === '80' || layout === '100') {
    keys.push({ x: 0, z: 0, w: 1, d: 1, label: 'ESC', role: 'accent' });
    pushRow(keys, 0, 2, [{ label: 'F1' }, { label: 'F2' }, { label: 'F3' }, { label: 'F4' }]);
    pushRow(keys, 0, 6.5, [
      { label: 'F5', role: 'mod' },
      { label: 'F6', role: 'mod' },
      { label: 'F7', role: 'mod' },
      { label: 'F8', role: 'mod' },
    ]);
    pushRow(keys, 0, 11, [{ label: 'F9' }, { label: 'F10' }, { label: 'F11' }, { label: 'F12' }]);
    pushRow(keys, 0, 15.25, [
      { label: 'PRT', role: 'mod' },
      { label: 'SCR', role: 'mod' },
      { label: 'PAU', role: 'mod' },
    ]);
  } else if (layout === '98') {
    pushRow(keys, 0, 0, [
      { label: 'ESC', role: 'accent' },
      { label: 'F1' },
      { label: 'F2' },
      { label: 'F3' },
      { label: 'F4' },
      { label: 'F5', role: 'mod' },
      { label: 'F6', role: 'mod' },
      { label: 'F7', role: 'mod' },
      { label: 'F8', role: 'mod' },
      { label: 'F9' },
      { label: 'F10' },
      { label: 'F11' },
      { label: 'F12' },
    ]);
    pushRow(keys, 0, 15.5, [
      { label: 'DEL', role: 'mod' },
      { label: 'HOM', role: 'mod' },
      { label: 'PGU', role: 'mod' },
      { label: 'PGD', role: 'mod' },
    ]);
  }

  // Main 60% alpha block (15U wide × 5U tall)
  pushRow(keys, yOff + 0, 0, [
    {
      label: layout === '60' || layout === '65' ? 'ESC' : '~',
      role: layout === '60' || layout === '65' ? 'accent' : 'mod',
    },
    { label: '1' },
    { label: '2' },
    { label: '3' },
    { label: '4' },
    { label: '5' },
    { label: '6' },
    { label: '7' },
    { label: '8' },
    { label: '9' },
    { label: '0' },
    { label: '-' },
    { label: '=' },
    { label: 'BACK', w: 2, role: 'mod' },
  ]);
  pushRow(keys, yOff + 1, 0, [
    { label: 'TAB', w: 1.5, role: 'mod' },
    { label: 'Q' },
    { label: 'W' },
    { label: 'E' },
    { label: 'R' },
    { label: 'T' },
    { label: 'Y' },
    { label: 'U' },
    { label: 'I' },
    { label: 'O' },
    { label: 'P' },
    { label: '[' },
    { label: ']' },
    { label: '\\', w: 1.5, role: 'mod' },
  ]);
  pushRow(keys, yOff + 2, 0, [
    { label: 'CAPS', w: 1.75, role: 'mod' },
    { label: 'A' },
    { label: 'S' },
    { label: 'D' },
    { label: 'F' },
    { label: 'G' },
    { label: 'H' },
    { label: 'J' },
    { label: 'K' },
    { label: 'L' },
    { label: ';' },
    { label: "'" },
    { label: 'ENTER', w: 2.25, role: 'accent' },
  ]);

  const compactRShift = layout === '65' || layout === '75' || layout === '98';
  pushRow(keys, yOff + 3, 0, [
    { label: 'SHIFT', w: 2.25, role: 'mod' },
    { label: 'Z' },
    { label: 'X' },
    { label: 'C' },
    { label: 'V' },
    { label: 'B' },
    { label: 'N' },
    { label: 'M' },
    { label: ',' },
    { label: '.' },
    { label: '/' },
    { label: 'SHIFT', w: compactRShift ? 1.75 : 2.75, role: 'mod' },
  ]);

  if (layout === '60') {
    pushRow(keys, yOff + 4, 0, [
      { label: 'CTRL', w: 1.25, role: 'mod' },
      { label: 'WIN', w: 1.25, role: 'mod' },
      { label: 'ALT', w: 1.25, role: 'mod' },
      { label: 'SPACE', w: 6.25, role: 'accent' },
      { label: 'ALT', w: 1.25, role: 'mod' },
      { label: 'FN', w: 1.25, role: 'mod' },
      { label: 'MENU', w: 1.25, role: 'mod' },
      { label: 'CTRL', w: 1.25, role: 'mod' },
    ]);
    return keys;
  }

  if (layout === '65' || layout === '75') {
    pushRow(keys, yOff + 4, 0, [
      { label: 'CTRL', w: 1.25, role: 'mod' },
      { label: 'WIN', w: 1.25, role: 'mod' },
      { label: 'ALT', w: 1.25, role: 'mod' },
      { label: 'SPACE', w: 6.25, role: 'accent' },
      { label: 'ALT', w: 1, role: 'mod' },
      { label: 'FN', w: 1, role: 'mod' },
      { label: 'CTRL', w: 1, role: 'mod' },
    ]);
    // Right nav column + arrow cluster
    keys.push({ x: 15, z: yOff + 0, w: 1, d: 1, label: 'DEL', role: 'mod' });
    keys.push({ x: 15, z: yOff + 1, w: 1, d: 1, label: 'PGU', role: 'mod' });
    keys.push({ x: 15, z: yOff + 2, w: 1, d: 1, label: 'PGD', role: 'mod' });
    keys.push({ x: 14, z: yOff + 3, w: 1, d: 1, label: '↑', role: 'mod' });
    keys.push({ x: 15, z: yOff + 3, w: 1, d: 1, label: 'END', role: 'mod' });
    keys.push({ x: 13, z: yOff + 4, w: 1, d: 1, label: '←', role: 'mod' });
    keys.push({ x: 14, z: yOff + 4, w: 1, d: 1, label: '↓', role: 'mod' });
    keys.push({ x: 15, z: yOff + 4, w: 1, d: 1, label: '→', role: 'mod' });
    return keys;
  }

  if (layout === '98') {
    pushRow(keys, yOff + 4, 0, [
      { label: 'CTRL', w: 1.25, role: 'mod' },
      { label: 'WIN', w: 1.25, role: 'mod' },
      { label: 'ALT', w: 1.25, role: 'mod' },
      { label: 'SPACE', w: 6.25, role: 'accent' },
      { label: 'ALT', w: 1, role: 'mod' },
      { label: 'FN', w: 1, role: 'mod' },
      { label: 'CTRL', w: 1, role: 'mod' },
    ]);
    keys.push({ x: 14, z: yOff + 3, w: 1, d: 1, label: '↑', role: 'mod' });
    keys.push({ x: 13, z: yOff + 4, w: 1, d: 1, label: '←', role: 'mod' });
    keys.push({ x: 14, z: yOff + 4, w: 1, d: 1, label: '↓', role: 'mod' });
    keys.push({ x: 15, z: yOff + 4, w: 1, d: 1, label: '→', role: 'mod' });
    // Compact numpad at x = 15.5
    pushRow(keys, yOff + 0, 15.5, [
      { label: 'NUM', role: 'mod' },
      { label: '/', role: 'mod' },
      { label: '*', role: 'mod' },
      { label: '-', role: 'mod' },
    ]);
    pushRow(keys, yOff + 1, 15.5, [{ label: '7' }, { label: '8' }, { label: '9' }]);
    keys.push({ x: 18.5, z: yOff + 1, w: 1, d: 2, label: '+', role: 'mod' });
    pushRow(keys, yOff + 2, 15.5, [{ label: '4' }, { label: '5' }, { label: '6' }]);
    pushRow(keys, yOff + 3, 15.5, [{ label: '1' }, { label: '2' }, { label: '3' }]);
    keys.push({ x: 18.5, z: yOff + 3, w: 1, d: 2, label: 'ENT', role: 'accent' });
    keys.push({ x: 16.5, z: yOff + 4, w: 1, d: 1, label: '0' });
    keys.push({ x: 17.5, z: yOff + 4, w: 1, d: 1, label: '.' });
    return keys;
  }

  // 80% TKL and 100% full-size share bottom row + separated nav/arrows
  pushRow(keys, yOff + 4, 0, [
    { label: 'CTRL', w: 1.25, role: 'mod' },
    { label: 'WIN', w: 1.25, role: 'mod' },
    { label: 'ALT', w: 1.25, role: 'mod' },
    { label: 'SPACE', w: 6.25, role: 'accent' },
    { label: 'ALT', w: 1.25, role: 'mod' },
    { label: 'FN', w: 1.25, role: 'mod' },
    { label: 'MENU', w: 1.25, role: 'mod' },
    { label: 'CTRL', w: 1.25, role: 'mod' },
  ]);
  pushRow(keys, yOff + 0, 15.25, [
    { label: 'INS', role: 'mod' },
    { label: 'HOM', role: 'mod' },
    { label: 'PGU', role: 'mod' },
  ]);
  pushRow(keys, yOff + 1, 15.25, [
    { label: 'DEL', role: 'mod' },
    { label: 'END', role: 'mod' },
    { label: 'PGD', role: 'mod' },
  ]);
  keys.push({ x: 16.25, z: yOff + 3, w: 1, d: 1, label: '↑', role: 'mod' });
  pushRow(keys, yOff + 4, 15.25, [
    { label: '←', role: 'mod' },
    { label: '↓', role: 'mod' },
    { label: '→', role: 'mod' },
  ]);

  if (layout === '100') {
    pushRow(keys, yOff + 0, 18.5, [
      { label: 'NUM', role: 'mod' },
      { label: '/', role: 'mod' },
      { label: '*', role: 'mod' },
      { label: '-', role: 'mod' },
    ]);
    pushRow(keys, yOff + 1, 18.5, [{ label: '7' }, { label: '8' }, { label: '9' }]);
    keys.push({ x: 21.5, z: yOff + 1, w: 1, d: 2, label: '+', role: 'mod' });
    pushRow(keys, yOff + 2, 18.5, [{ label: '4' }, { label: '5' }, { label: '6' }]);
    pushRow(keys, yOff + 3, 18.5, [{ label: '1' }, { label: '2' }, { label: '3' }]);
    keys.push({ x: 21.5, z: yOff + 3, w: 1, d: 2, label: 'ENT', role: 'accent' });
    keys.push({ x: 18.5, z: yOff + 4, w: 2, d: 1, label: '0' });
    keys.push({ x: 20.5, z: yOff + 4, w: 1, d: 1, label: '.' });
  }

  return keys;
}

// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { create } from 'zustand';
import type { BuiltinKind, Project, SceneItem } from '../domain/project';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'deskcraft-lang';

function readInitialLang(): Lang {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'zh') return saved;
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return 'zh';
}

function syncDocumentMeta(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = lang === 'en' ? 'DeskCraft · 3D Workspace Studio' : '桌构 · 三维桌搭工作台';
}

type I18nState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
};

const initialLang = readInitialLang();
syncDocumentMeta(initialLang);

export const useI18n = create<I18nState>((set, get) => ({
  lang: initialLang,
  setLang: (lang) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch {
      // Ignore storage write errors
    }
    syncDocumentMeta(lang);
    set({ lang });
  },
  toggleLang: () => {
    const next: Lang = get().lang === 'zh' ? 'en' : 'zh';
    get().setLang(next);
  },
}));

export function getLang(): Lang {
  return useI18n.getState().lang;
}

export function tr(zh: string, en: string, lang: Lang = getLang()): string {
  return lang === 'en' ? en : zh;
}

export const BUILTIN_ITEM_NAMES: Record<
  BuiltinKind | 'monitorArmDual' | 'laptopTray',
  { zh: string; en: string; legacy?: readonly string[] }
> = {
  monitor: { zh: '27 寸显示器', en: '27" Monitor' },
  speaker: { zh: '桌面音响', en: 'Bookshelf Speaker' },
  controller: { zh: '无线游戏手柄', en: 'Wireless Controller' },
  pegboard: { zh: '桌面洞洞板', en: 'Desk Pegboard' },
  keyboard: { zh: '机械键盘', en: 'Mechanical Keyboard' },
  mouse: { zh: '电竞鼠标', en: 'Gaming Mouse' },
  mousepad: { zh: '鼠标垫', en: 'Desk Mat' },
  screenLamp: { zh: '屏幕挂灯', en: 'Monitor Light Bar' },
  gamingLaptop: { zh: '游戏本', en: 'Gaming Laptop' },
  macbook: {
    zh: '轻薄笔记本',
    en: 'Ultrabook',
    legacy: ['MacBook', 'MacBook Air', 'MacBook Pro'],
  },
  macMini: {
    zh: '迷你主机',
    en: 'Mini PC',
    legacy: ['Mac mini', 'Mac Mini'],
  },
  macStudio: {
    zh: '桌面工作站',
    en: 'Compact Workstation',
    legacy: ['Mac Studio'],
  },
  laptopStand: { zh: '笔记本支架', en: 'Laptop Stand' },
  monitorArm: {
    zh: '显示器支架臂',
    en: 'Monitor Arm',
    legacy: ['NB F80 显示器支架臂'],
  },
  monitorArmDual: {
    zh: '双头机械臂',
    en: 'Dual Monitor Arm',
    legacy: ['NB F160 双头机械臂'],
  },
  laptopTray: {
    zh: '笔记本托盘',
    en: 'Laptop Tray',
    legacy: ['NB 笔记本托盘', 'NB FP-2 笔记本托盘'],
  },
  powerStrip: { zh: '智能桌面插排', en: 'Desktop Power Strip' },
  wallOutlet: { zh: '墙面 / 地面插座', en: 'Wall / Floor Outlet' },
};

export const DEFAULT_PROJECT_NAMES = {
  zh: '我的理想桌搭',
  en: 'My Ideal Desk Setup',
} as const;

const COPY_SUFFIX_RE = /^(.*?)(?:\s+副本|\s+Copy)+$/i;

function countCopyDepth(raw: string): { base: string; copies: number } {
  let base = raw.trim();
  let copies = 0;
  while (true) {
    if (base.endsWith(' 副本')) {
      base = base.slice(0, -3).trim();
      copies++;
    } else if (base.endsWith(' Copy')) {
      base = base.slice(0, -5).trim();
      copies++;
    } else {
      break;
    }
  }
  void COPY_SUFFIX_RE;
  return { base, copies };
}

/**
 * Normalizes any legacy branded item name (e.g. "MacBook", "Mac mini", "Mac Studio", "NB 笔记本托盘")
 * AND translates untouched built-in item names to `lang`, while preserving custom user-edited names.
 */
export function localizeItemName(
  item: Pick<SceneItem, 'name' | 'kind' | 'monitorArm'>,
  lang: Lang = getLang(),
): string {
  if (item.kind === 'imported') return item.name;

  const effectiveKey: keyof typeof BUILTIN_ITEM_NAMES =
    item.kind === 'monitorArm' && item.monitorArm?.armStyle === 'dual'
      ? 'monitorArmDual'
      : item.kind;

  const { base, copies } = countCopyDepth(item.name);

  // Check across all built-in entries (including dual arm / tray / item's own kind)
  const candidates: (keyof typeof BUILTIN_ITEM_NAMES)[] = [
    effectiveKey,
    item.kind,
    'monitorArmDual',
    'laptopTray',
  ];

  for (const key of candidates) {
    const entry = BUILTIN_ITEM_NAMES[key];
    const knownNames = [entry.zh, entry.en, ...(entry.legacy ?? [])];
    if (knownNames.some((n) => n.toLowerCase() === base.toLowerCase())) {
      const targetBase = entry[lang];
      if (copies === 0) return targetBase;
      const suffix = lang === 'en' ? ' Copy' : ' 副本';
      return (targetBase + suffix.repeat(copies)).slice(0, 80);
    }
  }

  // Also strip any stray brand tokens if a legacy item name had extra text
  let cleaned = item.name
    .replace(/\bMacBook(\s*(Air|Pro))?\b/gi, lang === 'en' ? 'Ultrabook' : '轻薄笔记本')
    .replace(/\bMac\s*mini\b/gi, lang === 'en' ? 'Mini PC' : '迷你主机')
    .replace(/\bMac\s*Studio\b/gi, lang === 'en' ? 'Compact Workstation' : '桌面工作站')
    .replace(/\bNB\s*(F80|F160|FP-2)?\s*/gi, '');
  cleaned = cleaned.trim() || BUILTIN_ITEM_NAMES[effectiveKey][lang];
  return cleaned.slice(0, 80);
}

export function localizeProjectName(name: string, lang: Lang = getLang()): string {
  const trimmed = name.trim();
  if (
    trimmed === DEFAULT_PROJECT_NAMES.zh ||
    trimmed === DEFAULT_PROJECT_NAMES.en ||
    trimmed === '我的桌面' ||
    trimmed === 'My Desk'
  ) {
    return DEFAULT_PROJECT_NAMES[lang];
  }
  return name
    .replace(/\bMacBook\b/gi, lang === 'en' ? 'Ultrabook' : '轻薄笔记本')
    .replace(/\bMac\s*mini\b/gi, lang === 'en' ? 'Mini PC' : '迷你主机')
    .replace(/\bMac\s*Studio\b/gi, lang === 'en' ? 'Compact Workstation' : '桌面工作站');
}

/** Mutates a cloned project in place so all default/legacy item & project names match `lang` without brands. */
export function localizeProjectInPlace(project: Project, lang: Lang = getLang()): Project {
  project.name = localizeProjectName(project.name, lang);
  for (const item of project.items) {
    item.name = localizeItemName(item, lang);
  }
  return project;
}

const OBSTACLE_LABELS_EN: Record<string, string> = {
  桌面: 'Desk Surface',
  桌面主体: 'Desk Surface',
  桌腿: 'Desk Leg',
  桌下后横梁: 'Under-Desk Crossbar',
  等宽层架: 'Desk Shelf',
  后挡板: 'Back Partition',
  左挡板: 'Left Partition',
  左侧挡板: 'Left Partition',
  右挡板: 'Right Partition',
  右侧挡板: 'Right Partition',
  桌后墙面: 'Back Wall',
  支架立柱: 'Stand Column',
  显示器底座: 'Monitor Base',
  倒挂横梁: 'Overhead Crossbar',
  另一侧支臂: 'Secondary Arm',
};

export function translateObstacleLabel(label: string, lang: Lang = getLang()): string {
  if (lang !== 'en') return label;
  if (OBSTACLE_LABELS_EN[label]) return OBSTACLE_LABELS_EN[label];
  const grommetMatch = /^桌面走线孔\s*\((.+)\)$/.exec(label);
  if (grommetMatch) return `Desk Grommet (${grommetMatch[1]})`;
  if (label.endsWith(' 底座走线孔')) return `${label.slice(0, -6)} Stand Cable Slot`;
  if (label.endsWith(' 底座')) return `${label.slice(0, -3)} Base`;
  if (label.endsWith(' 支架立柱')) return `${label.slice(0, -5)} Stand Column`;
  return label;
}

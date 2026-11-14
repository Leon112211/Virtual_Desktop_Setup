import { create } from 'zustand';
import { defaultProject, makeItem } from '../domain/catalog';
import {
  projectSchema,
  uid,
  type AssetMeta,
  type BuiltinKind,
  type Project,
  type SceneItem,
} from '../domain/project';
type State = {
  project: Project;
  selected: string | null;
  past: Project[];
  future: Project[];
  blobs: Map<string, Blob>;
  select: (id: string | null) => void;
  commit: (update: (p: Project) => void) => void;
  add: (kind: BuiltinKind) => void;
  updateItem: (id: string, patch: Partial<SceneItem>) => void;
  remove: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  replace: (p: Project, blobs: Map<string, Blob>) => void;
  addImported: (meta: AssetMeta, blob: Blob, size: SceneItem['size']) => void;
};
const withAssets = (p: Project, current: Project): Project => ({
  ...p,
  assets: [...new Map([...current.assets, ...p.assets].map((a) => [a.id, a])).values()],
});
export const useEditor = create<State>((set, get) => ({
  project: defaultProject(),
  selected: null,
  past: [],
  future: [],
  blobs: new Map(),
  select: (id) => set({ selected: id }),
  commit: (update) => {
    const s = get(),
      next = structuredClone(s.project);
    update(next);
    const valid = projectSchema.parse(next);
    if (JSON.stringify(valid) === JSON.stringify(s.project)) return;
    set({ project: valid, past: [...s.past, s.project].slice(-50), future: [] });
  },
  add: (kind) => {
    const item = makeItem(kind);
    const n = get().project.items.filter((i) => i.kind === kind).length;
    item.x = ((n % 3) - 1) * 0.12;
    item.z = 0.12 + (n % 2) * 0.06;
    get().commit((p) => {
      p.items.push(item);
    });
    set({ selected: item.id });
  },
  updateItem: (id, patch) =>
    get().commit((p) => {
      const i = p.items.findIndex((i) => i.id === id);
      if (i >= 0) p.items[i] = { ...p.items[i], ...patch };
    }),
  remove: () => {
    const id = get().selected;
    if (!id) return;
    get().commit((p) => {
      p.items = p.items.filter((i) => i.id !== id);
    });
    set({ selected: null });
  },
  duplicate: () => {
    const s = get(),
      original = s.project.items.find((i) => i.id === s.selected);
    if (!original) return;
    const item = {
      ...structuredClone(original),
      id: uid(),
      name: original.name + ' 副本',
      x: Math.min(5, original.x + 0.08),
      z: Math.min(5, original.z + 0.06),
    };
    s.commit((p) => {
      p.items.push(item);
    });
    set({ selected: item.id });
  },
  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const p = withAssets(s.past[s.past.length - 1], s.project);
    set({
      project: p,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future].slice(0, 50),
      selected: p.items.some((i) => i.id === s.selected) ? s.selected : null,
    });
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const p = withAssets(s.future[0], s.project);
    set({
      project: p,
      past: [...s.past, s.project].slice(-50),
      future: s.future.slice(1),
      selected: p.items.some((i) => i.id === s.selected) ? s.selected : null,
    });
  },
  replace: (p, blobs) =>
    set({
      project: projectSchema.parse(p),
      blobs: new Map(blobs),
      past: [],
      future: [],
      selected: null,
    }),
  addImported: (meta, blob, size) => {
    const s = get();
    const item: SceneItem = {
      id: uid(),
      name: meta.name.replace(/\.(glb|gltf)$/i, ''),
      kind: 'imported',
      assetId: meta.id,
      x: 0,
      z: 0,
      rotation: 0,
      size,
      color: '#b9c6d4',
    };
    s.commit((p) => {
      p.assets.push(meta);
      p.items.push(item);
    });
    set({ blobs: new Map(s.blobs).set(meta.id, blob), selected: item.id });
  },
}));

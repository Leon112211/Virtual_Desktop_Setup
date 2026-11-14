import type { AssetMeta } from '../domain/project';
import { disposeModel, inspectModel, type LoadedModel } from './importModel';

/** Models own GPU resources; render clones share them and must not dispose them. */
export const modelCache = new Map<string, LoadedModel>();
const pending = new Map<string, Promise<LoadedModel>>();
// Replaced models can still have live clones. Retire them until explicit cache teardown.
const retired = new Set<LoadedModel>();
let generation = 0;

export function registerModel(id: string, model: LoadedModel): void {
  const previous = modelCache.get(id);
  if (previous && previous !== model) retired.add(previous);
  retired.delete(model);
  modelCache.set(id, model);
}

export async function loadCachedModel(meta: AssetMeta, blob: Blob): Promise<LoadedModel> {
  const cached = modelCache.get(meta.id);
  if (cached) return cached;
  const existing = pending.get(meta.id);
  if (existing) return existing;
  const started = generation;
  const promise = inspectModel(blob, meta.format)
    .then((model) => {
      if (started !== generation) {
        disposeModel(model);
        throw new Error('模型缓存已清空，请重新加载模型');
      }
      // Registration during a pending import wins; no caller has seen the fresh model yet.
      const registered = modelCache.get(meta.id);
      if (registered) {
        if (registered !== model) disposeModel(model);
        return registered;
      }
      registerModel(meta.id, model);
      return model;
    })
    .finally(() => {
      // An old generation must not remove a newer request with the same ID.
      if (pending.get(meta.id) === promise) pending.delete(meta.id);
    });
  pending.set(meta.id, promise);
  return promise;
}

/** Call after unmounting all rendered clones, not when deleting just one instance. */
export function clearModelCache(): void {
  generation++;
  pending.clear();
  for (const model of modelCache.values()) retired.add(model);
  modelCache.clear();
  for (const model of retired) disposeModel(model);
  retired.clear();
}

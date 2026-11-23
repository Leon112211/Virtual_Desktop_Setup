// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetMeta } from '../domain/project';
import type { LoadedModel } from './importModel';

vi.mock('./importModel', () => ({ inspectModel: vi.fn(), disposeModel: vi.fn() }));
import { disposeModel, inspectModel } from './importModel';
import { clearModelCache, loadCachedModel, modelCache, registerModel } from './modelCache';

const meta: AssetMeta = {
  id: 'test',
  name: 'test.glb',
  format: 'glb',
  bytes: 1,
  size: { width: 0.3, height: 0.2, depth: 0.1 },
  triangles: 12,
};
const blob = new Blob(['x']);
function model(): LoadedModel {
  return { root: new THREE.Group(), size: meta.size, sourceSize: meta.size, triangles: 12 };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  clearModelCache();
  vi.clearAllMocks();
});
afterEach(() => clearModelCache());

describe('runtime model cache', () => {
  it('returns an existing model without parsing the blob again', async () => {
    const value = model();
    registerModel(meta.id, value);
    expect(modelCache.get(meta.id)).toBe(value);
    expect(await loadCachedModel(meta, blob)).toBe(value);
    expect(inspectModel).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent requests by asset ID', async () => {
    const job = deferred<LoadedModel>();
    vi.mocked(inspectModel).mockReturnValueOnce(job.promise);
    const first = loadCachedModel(meta, blob),
      second = loadCachedModel(meta, blob);
    expect(inspectModel).toHaveBeenCalledTimes(1);
    const value = model();
    job.resolve(value);
    expect(await first).toBe(value);
    expect(await second).toBe(value);
    expect(modelCache.get(meta.id)).toBe(value);
  });
  it('does not cache failures and allows retry', async () => {
    vi.mocked(inspectModel).mockRejectedValueOnce(new Error('格式错误'));
    await expect(loadCachedModel(meta, blob)).rejects.toThrow('格式错误');
    expect(modelCache.has(meta.id)).toBe(false);
    const value = model();
    vi.mocked(inspectModel).mockResolvedValueOnce(value);
    expect(await loadCachedModel(meta, blob)).toBe(value);
    expect(inspectModel).toHaveBeenCalledTimes(2);
  });
  it('does not dispose replaced models while clones may still reference them', () => {
    const old = model(),
      next = model();
    registerModel(meta.id, old);
    registerModel(meta.id, next);
    expect(disposeModel).not.toHaveBeenCalled();
    expect(modelCache.get(meta.id)).toBe(next);
    clearModelCache();
    expect(disposeModel).toHaveBeenCalledWith(old);
    expect(disposeModel).toHaveBeenCalledWith(next);
    expect(modelCache.size).toBe(0);
  });
  it('disposes each registered model only once on teardown even under multiple IDs', () => {
    const value = model();
    registerModel('a', value);
    registerModel('b', value);
    registerModel('b', value);
    clearModelCache();
    clearModelCache();
    expect(disposeModel).toHaveBeenCalledTimes(1);
  });
  it('does not let an old import repopulate a cleared cache or remove a new request', async () => {
    const oldJob = deferred<LoadedModel>(),
      newJob = deferred<LoadedModel>();
    vi.mocked(inspectModel).mockReturnValueOnce(oldJob.promise).mockReturnValueOnce(newJob.promise);
    const old = loadCachedModel(meta, blob);
    const oldRejected = expect(old).rejects.toThrow(/缓存已清空/);
    clearModelCache();
    const next = loadCachedModel(meta, blob);
    const oldModel = model();
    oldJob.resolve(oldModel);
    await oldRejected;
    expect(disposeModel).toHaveBeenCalledWith(oldModel);
    expect(modelCache.size).toBe(0);
    const third = loadCachedModel(meta, blob);
    expect(inspectModel).toHaveBeenCalledTimes(2);
    const nextModel = model();
    newJob.resolve(nextModel);
    expect(await next).toBe(nextModel);
    expect(await third).toBe(nextModel);
    expect(modelCache.get(meta.id)).toBe(nextModel);
  });
  it('preserves explicit registration that wins a race with a pending import', async () => {
    const job = deferred<LoadedModel>();
    vi.mocked(inspectModel).mockReturnValueOnce(job.promise);
    const request = loadCachedModel(meta, blob);
    const registered = model(),
      imported = model();
    registerModel(meta.id, registered);
    job.resolve(imported);
    expect(await request).toBe(registered);
    expect(modelCache.get(meta.id)).toBe(registered);
    expect(disposeModel).toHaveBeenCalledWith(imported);
    expect(disposeModel).not.toHaveBeenCalledWith(registered);
  });
  it('passes the declared format to the importer', async () => {
    vi.mocked(inspectModel).mockResolvedValueOnce(model());
    await loadCachedModel({ ...meta, format: 'gltf' }, blob);
    expect(inspectModel).toHaveBeenCalledWith(blob, 'gltf');
  });
});

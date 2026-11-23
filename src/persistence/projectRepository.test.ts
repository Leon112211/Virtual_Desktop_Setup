// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../domain/project';
import { makeItem } from '../domain/catalog';
import { loadProject, saveProject } from './projectRepository';

function fixture(): { project: Project; blobs: Map<string, Blob> } {
  const blob = new Blob(['model']);
  return {
    project: {
      schemaVersion: 1,
      id: 'project',
      name: '桌搭',
      desk: { width: 1.4, depth: 0.7, height: 0.75, thickness: 0.03, color: '#ffffff' },
      items: [
        {
          id: 'item',
          name: '模型',
          kind: 'imported',
          assetId: 'asset',
          x: 0,
          z: 0,
          rotation: 0,
          size: { width: 0.3, height: 0.2, depth: 0.1 },
          color: '#ffffff',
        },
      ],
      assets: [
        {
          id: 'asset',
          name: '模型',
          format: 'glb',
          bytes: blob.size,
          size: { width: 0.3, height: 0.2, depth: 0.1 },
          triangles: 12,
        },
      ],
    },
    blobs: new Map([['asset', blob]]),
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.restoreAllMocks();
});

describe('projectRepository', () => {
  it('returns null before a snapshot exists', async () => {
    expect(await loadProject()).toBeNull();
  });

  it('roundtrips a validated project and real Blob bytes', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    const loaded = await loadProject();
    expect(loaded?.project).toEqual(project);
    expect(loaded?.project).not.toHaveProperty('environment');
    expect(loaded?.blobs.get('asset')).toBeInstanceOf(Blob);
    expect(await loaded?.blobs.get('asset')?.text()).toBe('model');
  });

  it.each([false, true])(
    'roundtrips a mounted screen lamp and dark environment with imported bytes (legacy lightbar: %s)',
    async (includeLegacy) => {
      const { project, blobs } = fixture();
      const monitor = makeItem('monitor');
      const lamp = makeItem('screenLamp', monitor.id);
      Object.assign(lamp.lamp!, {
        enabled: false,
        brightness: 83,
        temperature: 5200,
        tilt: 32,
        horizontalAngle: 105,
        verticalAngle: 48,
        softness: 0.27,
      });
      lamp.size.width = 0.6;
      project.items.push(monitor, lamp);
      project.environment = 'dark';
      await saveProject(project, blobs);
      if (includeLegacy) {
        const db = await openDB('deskspace', 1);
        await db.put(
          'projects',
          {
            ...project,
            items: [...project.items, { ...monitor, id: 'retired-lightbar', kind: 'lightbar' }],
          },
          'current',
        );
        db.close();
      }
      const loaded = await loadProject();
      expect(loaded?.project).toEqual(project);
      expect(loaded?.project.environment).toBe('dark');
      expect(loaded?.project.items.find((item) => item.id === lamp.id)).toEqual(lamp);
      expect(loaded?.project.items.map((item) => item.kind)).toEqual([
        'imported',
        'monitor',
        'screenLamp',
      ]);
      expect(loaded?.blobs.size).toBe(1);
      expect(await loaded?.blobs.get('asset')?.text()).toBe('model');
    },
  );

  it('opens older saved projects after removing retired lightbars', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    const db = await openDB('deskspace', 1);
    await db.put(
      'projects',
      {
        ...project,
        items: [...project.items, { ...project.items[0], id: 'old', kind: 'lightbar' }],
      },
      'current',
    );
    db.close();
    const loaded = await loadProject();
    expect(loaded?.project).toEqual(project);
    expect(await loaded?.blobs.get('asset')?.text()).toBe('model');
  });

  it('rejects missing blobs without replacing the previous snapshot', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    await expect(saveProject({ ...project, name: '不应保存' }, new Map())).rejects.toThrow(
      '缺少模型资源',
    );
    expect((await loadProject())?.project.name).toBe('桌搭');
    expect(await (await loadProject())?.blobs.get('asset')?.text()).toBe('model');
  });

  it('rejects mismatched bytes without replacing the previous snapshot', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    await expect(
      saveProject({ ...project, name: '损坏' }, new Map([['asset', new Blob(['x'])]])),
    ).rejects.toThrow('字节数不匹配');
    expect((await loadProject())?.project.name).toBe('桌搭');
  });

  it('preserves metadata for missing blobs without writing over storage', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    const db = await openDB('deskspace', 1);
    await db.delete('assets', 'asset');
    db.close();
    const loaded = await loadProject();
    expect(loaded?.project.assets).toEqual(project.assets);
    expect(loaded?.blobs.size).toBe(0);
    expect((await loadProject())?.project).toEqual(project);
  });

  it('cleans unreferenced database assets only on a successful save', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    await saveProject({ ...project, assets: [], items: [] }, blobs);
    const db = await openDB('deskspace', 1);
    expect(await db.getAllKeys('assets')).toEqual([]);
    db.close();
    // The caller's history cache is not mutated by database cleanup.
    expect(blobs.has('asset')).toBe(true);
  });

  it('rolls back snapshot and resource writes if the transaction aborts', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      const result = original.apply(this, args);
      if (this.name === 'assets') this.transaction.abort();
      return result;
    });
    await expect(saveProject({ ...project, name: '不应写入' }, blobs)).rejects.toThrow('未写入');
    spy.mockRestore();
    expect((await loadProject())?.project).toEqual(project);
  });

  it('surfaces quota errors in Chinese and keeps the old snapshot', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'assets') throw new DOMException('full', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await expect(saveProject({ ...project, name: '不应写入' }, blobs)).rejects.toThrow(
      '存储空间不足',
    );
    spy.mockRestore();
    expect((await loadProject())?.project).toEqual(project);
  });

  it('rejects invalid stored snapshots with a Chinese error', async () => {
    await loadProject();
    const db = await openDB('deskspace', 1);
    await db.put('projects', { schemaVersion: 999 }, 'current');
    db.close();
    await expect(loadProject()).rejects.toThrow('工程数据无效');
  });

  it('roundtrips left/right L-desk and legacy rectangle projects and rejects invalid return without overwriting', async () => {
    const { project, blobs } = fixture();
    await saveProject(project, blobs);
    const loadedRect = await loadProject();
    expect(loadedRect?.project).toEqual(project);
    expect('return' in loadedRect!.project.desk).toBe(false);

    for (const side of ['left', 'right'] as const) {
      const lProject: Project = {
        ...project,
        desk: { ...project.desk, return: { side, width: 0.65, extension: 0.85 } },
      };
      await saveProject(lProject, blobs);
      expect((await loadProject())?.project).toEqual(lProject);
    }

    const validRight: Project = {
      ...project,
      desk: { ...project.desk, return: { side: 'right', width: 0.65, extension: 0.85 } },
    };
    const invalidL: Project = {
      ...project,
      desk: { ...project.desk, width: 0.6, return: { side: 'left', width: 0.45, extension: 0.6 } },
    };
    await expect(saveProject(invalidL, blobs)).rejects.toThrow('工程数据无效');
    expect((await loadProject())?.project).toEqual(validRight);
  });
});

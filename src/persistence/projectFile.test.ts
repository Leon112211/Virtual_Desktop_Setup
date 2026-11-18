import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../domain/project';
import { makeItem } from '../domain/catalog';
import type { LoadedModel } from '../assets/importModel';
import { inspectModel, disposeModel } from '../assets/importModel';
import { exportProjectFile, importProjectFile } from './projectFile';

vi.mock('../assets/importModel', () => ({ inspectModel: vi.fn(), disposeModel: vi.fn() }));
const size = { width: 0.3, height: 0.2, depth: 0.1 };
const makeModel = (): LoadedModel => ({
  root: {} as LoadedModel['root'],
  size: { ...size },
  sourceSize: { width: 30, height: 20, depth: 10 },
  triangles: 12,
});
function fixture() {
  const blob = new Blob(['model']);
  const project: Project = {
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
        size: { ...size },
        color: '#ffffff',
      },
    ],
    assets: [
      {
        id: 'asset',
        name: '模型',
        format: 'glb',
        bytes: blob.size,
        size: { ...size },
        triangles: 12,
      },
    ],
  };
  return { project, blobs: new Map([['asset', blob]]) };
}
function envelope() {
  return {
    format: 'deskspace',
    version: 1,
    project: fixture().project,
    resources: [{ id: 'asset', data: btoa('model') }],
  };
}
const asFile = (value: unknown) => new Blob([JSON.stringify(value)], { type: 'application/json' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(inspectModel).mockImplementation(async () => makeModel());
});

describe('projectFile export', () => {
  it('roundtrips JSON, bytes and normalized metadata rather than source dimensions', async () => {
    const { project, blobs } = fixture();
    const file = await exportProjectFile(project, blobs);
    expect(file.type).toBe('application/json');
    const imported = await importProjectFile(file);
    expect(imported.project).toEqual(project);
    expect(imported.project).not.toHaveProperty('environment');
    expect(await imported.blobs.get('asset')?.text()).toBe('model');
    expect(imported.models.get('asset')?.sourceSize.width).toBe(30);
    expect(inspectModel).toHaveBeenCalledWith(expect.any(Blob), 'glb');
    expect(disposeModel).not.toHaveBeenCalled();
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
      const file = await exportProjectFile(project, blobs);
      const json = JSON.parse(await file.text());
      if (includeLegacy) {
        json.project.items.push({ ...monitor, id: 'retired-lightbar', kind: 'lightbar' });
      }
      const imported = await importProjectFile(asFile(json));
      expect(imported.project).toEqual(project);
      expect(imported.project.environment).toBe('dark');
      expect(imported.project.items.find((item) => item.id === lamp.id)).toEqual(lamp);
      expect(imported.project.items.map((item) => item.kind)).toEqual([
        'imported',
        'monitor',
        'screenLamp',
      ]);
      expect(await imported.blobs.get('asset')?.text()).toBe('model');
      expect(imported.models.size).toBe(1);
      expect(inspectModel).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), 'glb');
    },
  );

  it('imports older backups while removing retired lightbars', async () => {
    const old = envelope();
    const project = {
      ...old.project,
      items: [...old.project.items, { ...old.project.items[0], id: 'old', kind: 'lightbar' }],
    };
    const imported = await importProjectFile(asFile({ ...old, project }));
    expect(imported.project).toEqual(old.project);
    expect(await imported.blobs.get('asset')?.text()).toBe('model');
  });

  it('exports only distinct current item assets and leaves the history untouched', async () => {
    const { project, blobs } = fixture();
    project.items.push({ ...project.items[0], id: 'copy' });
    project.assets.push({ ...project.assets[0], id: 'history' });
    const file = await exportProjectFile(project, blobs);
    const json = JSON.parse(await file.text());
    expect(json.resources).toHaveLength(1);
    expect(json.project.assets.map((asset: { id: string }) => asset.id)).toEqual(['asset']);
    expect(project.assets).toHaveLength(2);
    expect(blobs.size).toBe(1);
  });

  it('encodes binary in safe chunks without padding in the middle', async () => {
    const { project, blobs } = fixture();
    const bytes = new Uint8Array(100_003);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
    project.assets[0].bytes = bytes.length;
    blobs.set('asset', new Blob([bytes]));
    const result = await importProjectFile(await exportProjectFile(project, blobs));
    expect(new Uint8Array(await result.blobs.get('asset')!.arrayBuffer())).toEqual(bytes);
  });

  it('supports projects with no imported assets', async () => {
    const { project } = fixture();
    project.items = [];
    project.assets = [];
    const result = await importProjectFile(await exportProjectFile(project, new Map()));
    expect(result.blobs.size).toBe(0);
    expect(result.models.size).toBe(0);
    expect(inspectModel).not.toHaveBeenCalled();
  });

  it('refuses missing or wrong-size resources instead of exporting a broken file', async () => {
    const { project } = fixture();
    await expect(exportProjectFile(project, new Map())).rejects.toThrow('缺少模型资源');
    await expect(exportProjectFile(project, new Map([['asset', new Blob(['x'])]]))).rejects.toThrow(
      '字节数不匹配',
    );
  });

  it('checks project structure before export', async () => {
    const { project, blobs } = fixture();
    project.schemaVersion = 2 as 1;
    await expect(exportProjectFile(project, blobs)).rejects.toThrow('工程结构无效');
  });
});

describe('projectFile import validation', () => {
  it('rejects oversized JSON before reading or parsing', async () => {
    const text = vi.fn();
    const file = { size: 58 * 1024 * 1024 + 1, text } as unknown as Blob;
    await expect(importProjectFile(file)).rejects.toThrow('58 MiB');
    expect(text).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and unknown format, version, or envelope fields', async () => {
    await expect(importProjectFile(new Blob(['not JSON']))).rejects.toThrow('有效的 JSON');
    for (const invalid of [
      { ...envelope(), format: 'other' },
      { ...envelope(), version: 2 },
      { ...envelope(), extra: true },
      { ...envelope(), project: {} },
    ])
      await expect(importProjectFile(asFile(invalid))).rejects.toThrow('格式或版本无效');
    expect(inspectModel).not.toHaveBeenCalled();
  });

  it('rejects duplicate, missing and extra resource IDs', async () => {
    const duplicate = envelope();
    duplicate.resources.push({ ...duplicate.resources[0] });
    await expect(importProjectFile(asFile(duplicate))).rejects.toThrow('重复资源');
    await expect(importProjectFile(asFile({ ...envelope(), resources: [] }))).rejects.toThrow(
      '缺少模型资源',
    );
    const extra = envelope();
    extra.resources.push({ id: 'extra', data: 'YQ==' });
    await expect(importProjectFile(asFile(extra))).rejects.toThrow('额外资源');
    expect(inspectModel).not.toHaveBeenCalled();
  });

  it.each(['', 'bW9kZWw', 'bW9kZWw=\n', 'bW9kZWw-', '====', 'YQ=A', 'YR==', 'YWJ='])(
    'rejects invalid or noncanonical Base64 %j',
    async (data) => {
      const input = envelope();
      input.resources[0].data = data;
      await expect(importProjectFile(asFile(input))).rejects.toThrow('Base64');
      expect(inspectModel).not.toHaveBeenCalled();
    },
  );

  it('compares actual decoded bytes against metadata', async () => {
    const input = envelope();
    input.project.assets[0].bytes++;
    await expect(importProjectFile(asFile(input))).rejects.toThrow('字节数不匹配');
  });

  it('rejects a resource exceeding 15 MiB before model inspection', async () => {
    const input = envelope();
    input.resources[0].data = 'A'.repeat(4 * Math.ceil((15 * 1024 * 1024 + 1) / 3));
    await expect(importProjectFile(asFile(input))).rejects.toThrow('格式或版本无效');
    expect(inspectModel).not.toHaveBeenCalled();
  });

  it('rejects metadata whose source binary total exceeds 40 MiB', async () => {
    const input = envelope();
    input.project.assets = ['a', 'b', 'c'].map((id) => ({
      ...input.project.assets[0],
      id,
      bytes: 15 * 1024 * 1024,
    }));
    input.project.items = [];
    await expect(importProjectFile(asFile(input))).rejects.toThrow('40 MiB');
  });

  it('permits uniformly scaled imported items and small float error', async () => {
    const input = envelope();
    input.project.items[0].size = { width: 0.6, height: 0.4, depth: 0.2 };
    vi.mocked(inspectModel).mockResolvedValue({
      ...makeModel(),
      size: { ...size, width: 0.3000001 },
    });
    expect((await importProjectFile(asFile(input))).models.size).toBe(1);
  });

  it('rejects nonuniform imported item scaling before loading resources', async () => {
    const input = envelope();
    input.project.items[0].size.height = 0.3;
    await expect(importProjectFile(asFile(input))).rejects.toThrow('必须与模型等比');
    expect(inspectModel).not.toHaveBeenCalled();
    await expect(exportProjectFile(input.project, fixture().blobs)).rejects.toThrow(
      '必须与模型等比',
    );
  });

  it.each(['size', 'triangles'] as const)(
    'rejects actual %s mismatches and disposes the loaded model',
    async (field) => {
      const model = makeModel();
      if (field === 'size') model.size.width = 0.25;
      else model.triangles++;
      vi.mocked(inspectModel).mockResolvedValue(model);
      await expect(importProjectFile(asFile(envelope()))).rejects.toThrow('与实际模型不符');
      expect(disposeModel).toHaveBeenCalledExactlyOnceWith(model);
    },
  );

  it('disposes every created model when a later model has invalid metadata', async () => {
    const input = envelope();
    input.project.assets.push({ ...input.project.assets[0], id: 'second' });
    input.resources.push({ ...input.resources[0], id: 'second' });
    const first = makeModel();
    const second = { ...makeModel(), triangles: 13 };
    vi.mocked(inspectModel).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    vi.mocked(disposeModel).mockImplementationOnce(() => {
      throw new Error('dispose failure');
    });
    await expect(importProjectFile(asFile(input))).rejects.toThrow('与实际模型不符');
    expect(disposeModel).toHaveBeenCalledTimes(2);
    expect(disposeModel).toHaveBeenNthCalledWith(1, first);
    expect(disposeModel).toHaveBeenNthCalledWith(2, second);
  });

  it('inspects even unreferenced resources and releases earlier models after a later failure', async () => {
    const input = envelope();
    input.project.assets.push({ ...input.project.assets[0], id: 'second', format: 'gltf' });
    input.resources.push({ ...input.resources[0], id: 'second' });
    const first = makeModel();
    vi.mocked(inspectModel)
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('非法 glTF'));
    await expect(importProjectFile(asFile(input))).rejects.toThrow('非法 glTF');
    expect(inspectModel).toHaveBeenCalledTimes(2);
    expect(inspectModel).toHaveBeenLastCalledWith(expect.any(Blob), 'gltf');
    expect(disposeModel).toHaveBeenCalledExactlyOnceWith(first);
  });

  it('roundtrips left/right L-desk and legacy rectangle backup files and rejects invalid return', async () => {
    const { project, blobs } = fixture();
    const rectImported = await importProjectFile(await exportProjectFile(project, blobs));
    expect(rectImported.project).toEqual(project);
    expect('return' in rectImported.project.desk).toBe(false);

    for (const side of ['left', 'right'] as const) {
      const lProject: Project = {
        ...project,
        desk: { ...project.desk, return: { side, width: 0.7, extension: 0.9 } },
      };
      const imported = await importProjectFile(await exportProjectFile(lProject, blobs));
      expect(imported.project).toEqual(lProject);
    }

    const badEnvelope = envelope();
    badEnvelope.project.desk.width = 0.6;
    badEnvelope.project.desk.return = { side: 'left', width: 0.4, extension: 0.6 };
    await expect(importProjectFile(asFile(badEnvelope))).rejects.toThrow('侧翼宽度');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeModel, inspectModel, normalizeModel, preflightModel } from './importModel';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const uri = (bytes: Uint8Array, mime = 'application/octet-stream') =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
function fixture() {
  const bin = new Uint8Array(72);
  new Float32Array(bin.buffer, 0, 12).set([0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 6]);
  new Uint16Array(bin.buffer, 48, 12).set([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]);
  const doc: Record<string, any> = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length, uri: uri(bin) }],
    bufferViews: [
      { buffer: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [2, 4, 6],
      },
      { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  return { doc, bin };
}
function glb(doc: Record<string, any>, bin?: Uint8Array): Uint8Array {
  const json = encode(doc);
  const jsonSize = Math.ceil(json.length / 4) * 4;
  const binSize = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const bytes = new Uint8Array(20 + jsonSize + (bin ? 8 + binSize : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonSize, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(json, 20);
  if (bin) {
    view.setUint32(20 + jsonSize, binSize, true);
    view.setUint32(24 + jsonSize, 0x004e4942, true);
    bytes.set(bin, 28 + jsonSize);
  }
  return bytes;
}
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  view.setUint32(37, 0x49454e44);
  return bytes;
}
const preflight = (doc: Record<string, any>) => preflightModel(encode(doc), 'gltf');
afterEach(() => vi.unstubAllGlobals());

describe('container and embedded-resource preflight', () => {
  it('accepts self-contained GLB2 and converts its BIN to an embedded data URI', () => {
    const { doc, bin } = fixture();
    delete doc.buffers[0].uri;
    const prepared = JSON.parse(preflightModel(glb(doc, bin), 'glb'));
    expect(prepared.buffers[0].uri).toBe(uri(bin));
  });
  it('accepts both buffer data MIME types', () => {
    const { doc, bin } = fixture();
    doc.buffers[0].uri = uri(bin, 'application/gltf-buffer');
    expect(() => preflight(doc)).not.toThrow();
  });
  it.each([
    'https://example.com/a.bin',
    '//example.com/a.bin',
    'model.bin',
    '../model.bin',
    'blob:https://example.com/x',
    'file:///x',
    'data:text/plain;base64,AAAA',
    'data:application/octet-stream,abc',
  ])('blocks buffer URI %s', (value) => {
    const { doc } = fixture();
    doc.buffers[0].uri = value;
    expect(() => preflight(doc)).toThrow(/内嵌|禁止/);
    expect(() => preflightModel(glb(doc), 'glb')).toThrow(/内嵌|禁止/);
  });
  it.each([
    'https://example.com/a.png',
    'texture.png',
    'data:image/svg+xml;base64,AAAA',
    'data:image/webp;base64,AAAA',
    'data:image/png,abc',
  ])('blocks image URI %s', (value) => {
    const { doc } = fixture();
    doc.images = [{ uri: value }];
    expect(() => preflight(doc)).toThrow(/内嵌|禁止/);
    expect(() => preflightModel(glb(doc), 'glb')).toThrow(/内嵌|禁止/);
  });
  it('checks malformed base64 and declared buffer sizes', () => {
    const { doc } = fixture();
    doc.buffers[0].uri = 'data:application/octet-stream;base64,abc';
    expect(() => preflight(doc)).toThrow(/base64/);
    doc.buffers[0].uri = uri(new Uint8Array(4));
    expect(() => preflight(doc)).toThrow(/长度/);
  });
  it.each([0, 4, 8, 12, 16])('rejects corrupt GLB header/chunk field at byte %i', (offset) => {
    const { doc, bin } = fixture();
    delete doc.buffers[0].uri;
    const bytes = glb(doc, bin);
    new DataView(bytes.buffer).setUint32(offset, 1, true);
    expect(() => preflightModel(bytes, 'glb')).toThrow(/GLB/);
  });
  it('rejects truncated, empty, oversized and wrongly selected formats', () => {
    const { doc, bin } = fixture();
    delete doc.buffers[0].uri;
    const bytes = glb(doc, bin);
    expect(() => preflightModel(bytes.subarray(0, -1), 'glb')).toThrow();
    expect(() => preflightModel(new Uint8Array(), 'glb')).toThrow(/为空/);
    expect(() => preflightModel(new Uint8Array(15 * 1024 * 1024 + 1), 'glb')).toThrow(/15 MiB/);
    expect(() => preflightModel(encode(doc), 'glb')).toThrow(/GLB/);
    expect(() => preflightModel(bytes, 'gltf')).toThrow(/JSON/);
    expect(() => preflightModel(new TextEncoder().encode('{broken'), 'gltf')).toThrow(/JSON/);
  });
  it('rejects duplicate JSON/BIN chunks, unknown chunks and missing BIN', () => {
    const { doc, bin } = fixture();
    delete doc.buffers[0].uri;
    const bytes = glb(doc, bin);
    const binOffset = 20 + new DataView(bytes.buffer).getUint32(12, true);
    new DataView(bytes.buffer).setUint32(binOffset + 4, 0x4e4f534a, true);
    expect(() => preflightModel(bytes, 'glb')).toThrow(/重复/);
    new DataView(bytes.buffer).setUint32(binOffset + 4, 0x12345678, true);
    expect(() => preflightModel(bytes, 'glb')).toThrow(/不支持/);
    expect(() => preflightModel(glb(doc), 'glb')).toThrow(/二进制/);
  });
  it('rejects unsupported glTF versions and required or undeclared extensions', () => {
    const { doc } = fixture();
    doc.asset.version = '1.0';
    expect(() => preflight(doc)).toThrow(/2.0/);
    doc.asset.version = '2.0';
    for (const name of [
      'KHR_draco_mesh_compression',
      'EXT_meshopt_compression',
      'KHR_texture_basisu',
      'EXT_mesh_gpu_instancing',
      'unknown',
    ]) {
      doc.extensionsRequired = [name];
      expect(() => preflight(doc)).toThrow(/扩展/);
      delete doc.extensionsRequired;
      doc.meshes[0].primitives[0].extensions = { [name]: {} };
      expect(() => preflight(doc)).toThrow(/扩展/);
      delete doc.meshes[0].primitives[0].extensions;
    }
    doc.extensionsRequired = ['KHR_materials_unlit'];
    expect(() => preflight(doc)).not.toThrow();
  });
  it('rejects animations, skinning, morph targets and sparse accessor allocations', () => {
    for (const mutate of [
      (d: any) => {
        d.animations = [{}];
      },
      (d: any) => {
        d.skins = [{}];
      },
      (d: any) => {
        d.nodes[0].skin = 0;
      },
      (d: any) => {
        d.meshes[0].weights = [];
      },
      (d: any) => {
        d.meshes[0].primitives[0].targets = [];
      },
      (d: any) => {
        d.accessors[0].sparse = {};
      },
    ]) {
      const { doc } = fixture();
      mutate(doc);
      expect(() => preflight(doc)).toThrow();
    }
  });
  it('checks bufferView/accessor bounds and memory budgets before allocating', () => {
    const { doc } = fixture();
    doc.bufferViews[0].byteLength = 1000;
    expect(() => preflight(doc)).toThrow(/bufferView/);
    doc.bufferViews[0].byteLength = 48;
    doc.accessors[0].byteOffset = 4;
    expect(() => preflight(doc)).toThrow(/accessor/);
    delete doc.accessors[0].byteOffset;
    doc.accessors[0].count = 1_000_001;
    expect(() => preflight(doc)).toThrow(/预算/);
    doc.accessors[0].count = 4;
    doc.buffers[0].byteLength = 16 * 1024 * 1024;
    expect(() => preflight(doc)).toThrow(/预算/);
  });
  it('validates index ranges and counts rendered instances rather than only unique meshes', () => {
    const { doc, bin } = fixture();
    new Uint16Array(bin.buffer, 48, 12)[0] = 4;
    doc.buffers[0].uri = uri(bin);
    expect(() => preflight(doc)).toThrow(/索引超出/);
    new Uint16Array(bin.buffer, 48, 12)[0] = 0;
    doc.buffers[0].uri = uri(bin);
    doc.nodes = Array.from({ length: 2048 }, () => ({ mesh: 0 }));
    doc.scenes[0].nodes = doc.nodes.map((_: unknown, i: number) => i);
    // Each shared tetrahedron has four triangles. Repeated primitives/nodes must
    // count separately so the scene, but not each mesh, exceeds the budget.
    doc.meshes[0].primitives = Array.from({ length: 32 }, () => ({
      attributes: { POSITION: 0 },
      indices: 1,
    }));
    expect(() => preflight(doc)).toThrow(/25 万/);
  });
  it('rejects cyclic/multiply parented nodes and duplicate scene roots', () => {
    const { doc } = fixture();
    doc.nodes[0].children = [0];
    expect(() => preflight(doc)).toThrow(/循环/);
    doc.nodes = [{ children: [2] }, { children: [2] }, { mesh: 0 }];
    expect(() => preflight(doc)).toThrow(/多个父节点/);
    doc.nodes = [{ mesh: 0 }];
    doc.scenes[0].nodes = [0, 0];
    expect(() => preflight(doc)).toThrow(/重复/);
  });
});

describe('image predecode budgets', () => {
  it('reads PNG headers and refuses oversized dimensions before decoding', () => {
    const { doc } = fixture();
    doc.images = [{ uri: uri(png(4097, 1), 'image/png') }];
    expect(() => preflight(doc)).toThrow(/4096/);
    doc.images[0].uri = uri(png(0, 1), 'image/png');
    expect(() => preflight(doc)).toThrow(/尺寸/);
    doc.images[0].uri = uri(new Uint8Array(32), 'image/png');
    expect(() => preflight(doc)).toThrow(/PNG/);
  });
  it('caps image count and total pixels, including multiple textures sharing an image', () => {
    const { doc } = fixture();
    doc.images = Array.from({ length: 17 }, () => ({ uri: uri(png(1, 1), 'image/png') }));
    expect(() => preflight(doc)).toThrow(/images/);
    doc.images = [{ uri: uri(png(4096, 4096), 'image/png') }, { uri: uri(png(1, 1), 'image/png') }];
    expect(() => preflight(doc)).toThrow(/16M/);
    doc.images.pop();
    doc.textures = [{ source: 0 }, { source: 0 }];
    expect(() => preflight(doc)).toThrow(/16M/);
    doc.textures = Array.from({ length: 17 }, () => ({ source: 0 }));
    expect(() => preflight(doc)).toThrow(/textures/);
  });
  it('reads JPEG SOF dimensions and rejects oversized JPEG headers', () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0x10, 1, 1, 1, 0x11, 0, 0xff, 0xd9,
    ]);
    const { doc } = fixture();
    doc.images = [{ uri: uri(bytes, 'image/jpeg') }];
    expect(() => preflight(doc)).toThrow(/4096/);
    bytes[9] = 0;
    bytes[10] = 1;
    doc.images[0].uri = uri(bytes, 'image/jpeg');
    expect(() => preflight(doc)).not.toThrow();
  });
  it('validates GLB bufferView images, then avoids loader-created object URLs', () => {
    const { doc, bin } = fixture();
    const image = png(1, 1);
    const all = new Uint8Array(bin.length + image.length);
    all.set(bin);
    all.set(image, bin.length);
    doc.buffers[0] = { byteLength: all.length };
    doc.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: image.length });
    doc.images = [{ bufferView: 2, mimeType: 'image/png' }];
    const prepared = JSON.parse(preflightModel(glb(doc, all), 'glb'));
    expect(prepared.images[0].uri).toBe(uri(image, 'image/png'));
    expect(prepared.images[0].bufferView).toBeUndefined();
  });
});

describe('normalization and resource lifetime', () => {
  it('normalizes a real GLB and glTF with GLTFLoader to longest side 0.3m', async () => {
    // Three's FileLoader emits browser ProgressEvents, which Node does not supply.
    vi.stubGlobal(
      'ProgressEvent',
      class extends Event {
        constructor(type: string) {
          super(type);
        }
      },
    );
    for (const format of ['gltf', 'glb'] as const) {
      const { doc, bin } = fixture();
      // Malicious accessor bounds must not influence the resulting size or culling sphere.
      doc.accessors[0].min = [-900, -900, -900];
      doc.accessors[0].max = [900, 900, 900];
      if (format === 'glb') delete doc.buffers[0].uri;
      const data = format === 'glb' ? glb(doc, bin) : encode(doc);
      const model = await inspectModel(new Blob([data as BlobPart]), format);
      expect(model.sourceSize).toEqual({ width: 2, height: 4, depth: 6 });
      expect(model.size.width).toBeCloseTo(0.1);
      expect(model.size.height).toBeCloseTo(0.2);
      expect(model.size.depth).toBeCloseTo(0.3);
      expect(model.triangles).toBe(4);
      const bounds = new THREE.Box3().setFromObject(model.root);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
      expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0);
      disposeModel(model);
    }
  });
  it('keeps every internal node transform and accepts large source bounds', () => {
    const scene = new THREE.Group();
    scene.position.set(20, 30, -40);
    scene.scale.setScalar(1_000_000);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshStandardMaterial());
    mesh.position.set(4, 5, 6);
    mesh.rotation.y = Math.PI / 2;
    scene.add(mesh);
    const matrix = mesh.matrix.clone();
    mesh.updateMatrix();
    matrix.copy(mesh.matrix);
    const local = scene.position.clone();
    const model = normalizeModel(scene);
    expect(mesh.matrix.equals(matrix)).toBe(true);
    expect(scene.position.equals(local)).toBe(true);
    expect(model.root.position.toArray()).toEqual([0, 0, 0]);
    expect(model.root.scale.toArray()).toEqual([1, 1, 1]);
    expect(Math.max(...Object.values(model.sourceSize))).toBeGreaterThan(5);
    expect(Math.max(...Object.values(model.size))).toBeCloseTo(0.3);
    disposeModel(model);
  });
  it('rejects empty, flat and nonfinite geometry', () => {
    expect(() => normalizeModel(new THREE.Group())).toThrow(/为空/);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    expect(() => normalizeModel(plane)).toThrow(/零厚度/);
    plane.geometry.getAttribute('position').setX(0, Infinity);
    expect(() => normalizeModel(plane)).toThrow(/非有限/);
    plane.geometry.dispose();
    (plane.material as THREE.Material).dispose();
  });
  it('counts separate mesh nodes sharing geometry as separate actual triangles', () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const model = normalizeModel(scene);
    expect(model.triangles).toBe(24);
    disposeModel(model);
  });
  it('disposes shared resources and closes decoded bitmaps exactly once', () => {
    const close = vi.fn();
    const texture = new THREE.Texture({ close } as any);
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const model = normalizeModel(scene);
    const geometryDispose = vi.spyOn(geometry, 'dispose'),
      materialDispose = vi.spyOn(material, 'dispose'),
      textureDispose = vi.spyOn(texture, 'dispose');
    disposeModel(model);
    disposeModel(model);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('cleans up geometries/materials when parsing succeeds but normalization rejects the model', async () => {
    vi.stubGlobal(
      'ProgressEvent',
      class extends Event {
        constructor(type: string) {
          super(type);
        }
      },
    );
    const { doc, bin } = fixture();
    const positions = new Float32Array(bin.buffer, 0, 12);
    for (let i = 2; i < positions.length; i += 3) positions[i] = 0;
    doc.buffers[0].uri = uri(bin);
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    await expect(inspectModel(new Blob([encode(doc)]), 'gltf')).rejects.toThrow(/零厚度/);
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
  });
  it('blocks URLs introduced after preflight at the LoadingManager boundary', async () => {
    for (const url of ['https://example.com/escape.bin', 'other.bin', 'blob:untrusted']) {
      const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(function (
        this: GLTFLoader,
      ) {
        this.manager.resolveURL(url);
        return Promise.reject(new Error('不应到达此处'));
      });
      const { doc } = fixture();
      await expect(inspectModel(new Blob([encode(doc)]), 'gltf')).rejects.toThrow(
        /已阻止模型加载外部资源/,
      );
      parse.mockRestore();
    }
  });
  it('reports file errors in Chinese without allocating loader resources', async () => {
    await expect(inspectModel(new Blob(['{}']), 'glb')).rejects.toThrow(/模型导入失败.*GLB/);
    await expect(inspectModel(new Blob(), 'gltf')).rejects.toThrow(/模型文件为空/);
  });
});

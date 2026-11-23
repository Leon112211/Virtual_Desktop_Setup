// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import * as THREE from 'three';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import type { Size } from '../domain/project';

export type LoadedModel = { root: THREE.Group; size: Size; sourceSize: Size; triangles: number };

const MAX_FILE = 15 * 1024 * 1024;
const MAX_TRIANGLES = 250_000;
const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_ALLOCATION = 64 * 1024 * 1024;
const EXTENSIONS = new Set(['KHR_materials_unlit']);
// The deliberately small supported subset has no compression, animation or sparse accessors.
type Doc = Record<string, any>;
const fail = (message: string): never => {
  throw new Error(message);
};
const integer = (value: unknown, min = 0): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min
    ? value
    : fail('模型包含无效的整数或资源长度');
const list = (doc: Doc, key: string, max: number): Doc[] => {
  const value = doc[key] ?? [];
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((v) => !v || typeof v !== 'object' || Array.isArray(v))
  ) {
    fail(`模型 ${key} 数据无效或超过资源预算`);
  }
  return value;
};
const ref = <T>(values: T[], index: unknown): T =>
  values[integer(index)] ?? fail('模型包含不存在的资源引用');

function parseJSON(bytes: Uint8Array): Doc {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('模型 JSON 必须是对象');
    return value;
  } catch {
    return fail('模型 JSON 无效，请选择有效的 glTF 2.0 文件');
  }
}

function container(bytes: Uint8Array, format: 'glb' | 'gltf'): { doc: Doc; bin?: Uint8Array } {
  if (format === 'gltf') return { doc: parseJSON(bytes) };
  if (format !== 'glb') fail('不支持的模型格式，仅支持 GLB 和内嵌 glTF');
  if (bytes.length < 20) fail('GLB 文件头或 JSON 数据块不完整');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2)
    fail('仅支持 GLB 2.0 文件');
  if (view.getUint32(8, true) !== bytes.length) fail('GLB 文件长度与文件头不一致');
  let offset = 12;
  let json: Uint8Array | undefined;
  let bin: Uint8Array | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('GLB 数据块头不完整');
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4 !== 0 || offset + 8 + length > bytes.length) fail('GLB 数据块长度或对齐无效');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12 && type !== 0x4e4f534a) fail('GLB 的第一个数据块必须是 JSON');
    if (type === 0x4e4f534a) {
      if (json) fail('GLB 包含重复的 JSON 数据块');
      json = chunk;
    } else if (type === 0x004e4942) {
      if (bin) fail('GLB 包含重复的二进制数据块');
      bin = chunk;
    } else fail('GLB 包含不支持的数据块');
    offset += 8 + length;
  }
  if (!json) fail('GLB 缺少 JSON 数据块');
  return { doc: parseJSON(json!), bin };
}

function dataURI(uri: unknown, image = false): { bytes: Uint8Array; mime: string } {
  if (typeof uri !== 'string') fail('资源 URI 无效');
  const match =
    /^data:(application\/octet-stream|application\/gltf-buffer|image\/png|image\/jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      uri as string,
    );
  if (!match || (image ? !match[1].startsWith('image/') : !match[1].startsWith('application/'))) {
    fail('仅允许内嵌 base64 缓冲区及 PNG/JPEG 图片，禁止网络地址和侧文件');
  }
  const encoded = match![2];
  if (!encoded.length || encoded.length % 4 !== 0 || (encoded.length / 4) * 3 > MAX_FILE + 2)
    fail('内嵌资源 base64 数据无效或过大');
  try {
    const decoded = atob(encoded);
    return { bytes: Uint8Array.from(decoded, (c) => c.charCodeAt(0)), mime: match![1] };
  } catch {
    return fail('内嵌资源 base64 数据无效');
  }
}

function encodeData(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Read encoded headers before any browser image decoder is invoked. */
function imagePixels(bytes: Uint8Array, mime: string): number {
  let width = 0,
    height = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length < 33 ||
      signature.some((v, i) => bytes[i] !== v) ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452
    )
      fail('PNG 图片头无效');
    width = view.getUint32(16);
    height = view.getUint32(20);
    // APNG may allocate many frames despite a small canvas.
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > bytes.length) fail('PNG 图片数据块长度无效');
      if (view.getUint32(offset + 4) === 0x6163544c) fail('不支持 APNG 动态纹理');
      offset += length + 12;
    }
    if (offset !== bytes.length) fail('PNG 图片数据不完整');
  } else if (mime === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail('JPEG 图片头无效');
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) fail('JPEG 图片标记无效');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) fail('JPEG 图片头不完整');
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) fail('JPEG 图片数据块长度无效');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) fail('JPEG 尺寸头无效');
        if (width || height) fail('JPEG 包含重复的尺寸头');
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
      }
      offset += length;
    }
  } else fail('仅支持 PNG/JPEG 图片');
  if (!width || !height || width > 4096 || height > 4096)
    fail('纹理尺寸无效或超过 4096 × 4096 像素');
  return width * height;
}

function checkExtensions(doc: Doc): void {
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (
      doc[key] !== undefined &&
      (!Array.isArray(doc[key]) ||
        doc[key].some((name: unknown) => typeof name !== 'string' || !EXTENSIONS.has(name)))
    ) {
      fail('模型包含不支持的扩展；不支持 Draco、Meshopt、KTX2 等压缩资源');
    }
  }
  // Inspect actual extension payloads too: a producer may omit extensionsUsed.
  const stack: unknown[] = [doc];
  let visited = 0;
  while (stack.length) {
    const value = stack.pop();
    if (++visited > 200_000) fail('模型 JSON 结构过于复杂');
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'extras') continue; // Loader only copies extras into userData.
      if (
        key === 'extensions' &&
        (!child ||
          typeof child !== 'object' ||
          Array.isArray(child) ||
          Object.keys(child).some((name) => !EXTENSIONS.has(name)))
      ) {
        fail('模型包含不支持的扩展；仅支持基本材质和 KHR_materials_unlit');
      }
      if (child && typeof child === 'object') stack.push(child);
    }
  }
}

/** Pure preflight; returns a self-contained JSON document suitable for GLTFLoader. */
export function preflightModel(bytes: Uint8Array, format: 'glb' | 'gltf'): string {
  if (!bytes.length || bytes.length > MAX_FILE) fail('模型文件为空或超过 15 MiB 限制');
  const { doc, bin } = container(bytes, format);
  if (
    doc.asset?.version !== '2.0' ||
    (doc.asset.minVersion !== undefined && doc.asset.minVersion !== '2.0')
  )
    fail('仅支持 glTF 2.0 模型');
  checkExtensions(doc);
  if (list(doc, 'animations', 0).length || list(doc, 'skins', 0).length)
    fail('仅支持静态网格，不支持骨骼或动画');
  const buffers = list(doc, 'buffers', 64);
  const views = list(doc, 'bufferViews', 4096);
  const accessors = list(doc, 'accessors', 2048);
  const images = list(doc, 'images', 16);
  const textures = list(doc, 'textures', 16);
  const meshes = list(doc, 'meshes', 2048);
  const nodes = list(doc, 'nodes', 2048);
  const scenes = list(doc, 'scenes', 64);
  list(doc, 'materials', 256);
  list(doc, 'samplers', 64);
  let bufferBudget = 0;
  const decoded = buffers.map((buffer, i) => {
    const length = integer(buffer.byteLength, 1);
    bufferBudget += length;
    if (bufferBudget > MAX_FILE) fail('模型缓冲区超过 15 MiB 预算');
    let value: Uint8Array;
    if (buffer.uri !== undefined) value = dataURI(buffer.uri).bytes;
    else {
      if (format !== 'glb' || i !== 0 || !bin || bin.length - length < 0 || bin.length - length > 3)
        fail('模型缺少有效的内嵌二进制缓冲区');
      value = bin!.subarray(0, length);
    }
    if (value.length !== length) fail('缓冲区长度与声明不一致');
    // Canonical data URIs avoid GLTFLoader's temporary blob URLs entirely, including on errors.
    buffer.uri = encodeData(value, 'application/octet-stream');
    return value;
  });
  for (const view of views) {
    const buffer = ref(decoded, view.buffer);
    const offset = integer(view.byteOffset ?? 0),
      length = integer(view.byteLength, 1);
    if (offset + length > buffer.length) fail('bufferView 超出缓冲区范围');
    if (view.byteStride !== undefined && (integer(view.byteStride, 4) > 252 || view.byteStride % 4))
      fail('bufferView 步长无效');
  }
  const components: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
  };
  const componentBytes: Record<number, number> = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
  };
  let allocation = 0;
  for (const accessor of accessors) {
    if (accessor.sparse !== undefined) fail('暂不支持稀疏 accessor，请导出普通静态网格');
    const count = integer(accessor.count, 1);
    const width = components[accessor.type],
      unit = componentBytes[accessor.componentType];
    if (!width || !unit || accessor.type.startsWith('MAT')) fail('网格 accessor 类型不受支持');
    allocation += count * width * 4;
    if (count > 1_000_000 || allocation > MAX_ALLOCATION)
      fail('模型 accessor 超过 64 MiB 内存预算');
    const view = ref(views, accessor.bufferView);
    const offset = integer(accessor.byteOffset ?? 0),
      stride = view.byteStride ?? width * unit;
    if (
      stride < width * unit ||
      stride % unit ||
      offset % unit ||
      ((view.byteOffset ?? 0) + offset) % unit ||
      offset + (count - 1) * stride + width * unit > view.byteLength
    )
      fail('accessor 超出 bufferView 范围或对齐无效');
  }
  let pixels = 0,
    imageBytes = 0;
  const imageSizes = images.map((image) => {
    let data: Uint8Array, mime: string;
    if (image.uri !== undefined) {
      if (image.bufferView !== undefined) fail('图片不能同时指定 URI 和 bufferView');
      const embedded = dataURI(image.uri, true);
      data = embedded.bytes;
      mime = embedded.mime;
      if (image.mimeType !== undefined && image.mimeType !== mime) fail('图片 MIME 类型不一致');
    } else {
      const view = ref(views, image.bufferView);
      const buffer = ref(decoded, view.buffer);
      data = buffer.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      mime = image.mimeType;
    }
    imageBytes += data.length;
    if (imageBytes > MAX_FILE) fail('内嵌图片总数据超过 15 MiB 预算');
    const count = imagePixels(data, mime);
    pixels += count;
    if (pixels > MAX_PIXELS) fail('纹理总像素超过 16M 预算');
    image.uri = encodeData(data, mime);
    delete image.bufferView;
    return count;
  });
  let texturePixels = 0;
  for (const texture of textures) {
    texturePixels += ref(imageSizes, texture.source);
    if (texturePixels > MAX_PIXELS) fail('纹理总像素超过 16M 预算');
    if (texture.sampler !== undefined) ref(doc.samplers ?? [], texture.sampler);
  }
  const maximumIndex = new Map<Doc, number>();
  const meshTriangles = meshes.map((mesh) => {
    if (mesh.weights !== undefined) fail('不支持形变网格');
    const primitives = list(mesh, 'primitives', 2048);
    if (!primitives.length) fail('模型网格缺少图元');
    return primitives.reduce((sum, primitive) => {
      if (primitive.targets !== undefined) fail('不支持形变网格');
      const mode = primitive.mode ?? 4;
      if (![4, 5, 6].includes(mode)) fail('仅支持三角形静态网格，不支持线或点');
      const attributes = primitive.attributes;
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes))
        fail('网格缺少顶点属性');
      if (Object.keys(attributes).some((key) => /^(JOINTS|WEIGHTS)_/.test(key)))
        fail('不支持骨骼网格');
      const position = ref(accessors, attributes.POSITION);
      if (position.type !== 'VEC3' || position.componentType !== 5126 || position.normalized)
        fail('顶点位置必须是浮点 VEC3');
      for (const index of Object.values(attributes)) {
        if (ref(accessors, index).count !== position.count) fail('顶点属性数量不一致');
      }
      if (primitive.material !== undefined) ref(doc.materials ?? [], primitive.material);
      let count = position.count;
      if (primitive.indices !== undefined) {
        const index = ref(accessors, primitive.indices);
        if (
          index.type !== 'SCALAR' ||
          ![5121, 5123, 5125].includes(index.componentType) ||
          index.normalized
        )
          fail('三角形索引格式无效');
        count = index.count;
        const view = ref(views, index.bufferView);
        if (view.byteStride !== undefined) fail('索引缓冲区不能包含步长');
        const buffer = ref(decoded, view.buffer);
        const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const start = (view.byteOffset ?? 0) + (index.byteOffset ?? 0);
        const unit = componentBytes[index.componentType];
        let max = maximumIndex.get(index);
        if (max === undefined) {
          max = 0;
          for (let i = 0; i < count; i++) {
            const offset = start + i * unit;
            const value =
              unit === 1
                ? data.getUint8(offset)
                : unit === 2
                  ? data.getUint16(offset, true)
                  : data.getUint32(offset, true);
            max = Math.max(max, value);
          }
          maximumIndex.set(index, max);
        }
        if (max >= position.count) fail('三角形索引超出顶点范围');
      }
      if (count < 3 || (mode === 4 && count % 3 !== 0)) fail('三角形顶点或索引数量无效');
      const triangles = mode === 4 ? count / 3 : count - 2;
      if (sum + triangles > MAX_TRIANGLES) fail('模型超过 25 万三角形预算');
      return sum + triangles;
    }, 0);
  });
  // Validate the complete hierarchy, including scenes not selected by the default scene.
  const parents = new Set<number>();
  for (const node of nodes) {
    if (node.skin !== undefined || node.weights !== undefined) fail('不支持骨骼或形变节点');
    if (node.mesh !== undefined) ref(meshTriangles, node.mesh);
    for (const [key, length] of [
      ['matrix', 16],
      ['translation', 3],
      ['rotation', 4],
      ['scale', 3],
    ] as const) {
      if (
        node[key] !== undefined &&
        (!Array.isArray(node[key]) ||
          node[key].length !== length ||
          node[key].some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)))
      )
        fail('模型节点变换无效');
    }
    if (node.children !== undefined && !Array.isArray(node.children)) fail('节点子级数据无效');
    for (const child of node.children ?? []) {
      ref(nodes, child);
      if (parents.has(child)) fail('模型节点不能被多个父节点重复引用');
      parents.add(child);
    }
  }
  const visited = new Set<number>(),
    visiting = new Set<number>();
  const visit = (index: number, depth: number): number => {
    if (depth > 128 || visiting.has(index)) fail('模型节点层级过深或存在循环引用');
    if (visited.has(index)) return 0;
    visiting.add(index);
    const node = ref(nodes, index);
    let triangles = node.mesh === undefined ? 0 : ref(meshTriangles, node.mesh);
    for (const child of node.children ?? []) triangles += visit(child, depth + 1);
    if (triangles > MAX_TRIANGLES) fail('模型超过 25 万实际三角形预算');
    visiting.delete(index);
    visited.add(index);
    return triangles;
  };
  for (let i = 0; i < nodes.length; i++) visit(i, 0);
  for (const scene of scenes) {
    if (scene.nodes !== undefined && !Array.isArray(scene.nodes)) fail('场景节点数据无效');
    visited.clear();
    let triangles = 0;
    for (const index of scene.nodes ?? []) {
      if (parents.has(index) || visited.has(index)) fail('场景根节点重复或不是根节点');
      triangles += visit(index, 0);
    }
    if (triangles > MAX_TRIANGLES) fail('模型超过 25 万实际三角形预算');
  }
  ref(scenes, doc.scene ?? 0);
  // Drop irrelevant cameras; only mesh nodes are part of the import contract.
  for (const node of nodes) delete node.camera;
  return JSON.stringify(doc);
}

/** Wrap rather than mutate scene transforms, preserving every imported local transform. */
export function normalizeModel(scene: THREE.Object3D): LoadedModel {
  scene.updateWorldMatrix(true, true);
  let triangles = 0;
  const checked = new Map<
    THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    { box: THREE.Box3; sphere: THREE.Sphere }
  >();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh || Object.keys(object.geometry.morphAttributes).length)
      fail('仅支持无骨骼、无形变的静态网格');
    const position = object.geometry.getAttribute('position');
    if (!position) fail('模型缺少顶点位置');
    const cached = checked.get(position);
    if (cached) {
      object.geometry.boundingBox = cached.box.clone();
      object.geometry.boundingSphere = cached.sphere.clone();
    } else {
      for (let i = 0; i < position.count; i++) {
        if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite))
          fail('模型包含非有限顶点坐标');
      }
      // Never trust exported accessor min/max: recompute from actual vertex data.
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
      checked.set(position, {
        box: object.geometry.boundingBox!,
        sphere: object.geometry.boundingSphere!,
      });
    }
    const count = object.geometry.index?.count ?? position.count;
    if (count % 3 !== 0) fail('三角形数量无效');
    triangles += count / 3;
  });
  if (triangles < 1 || triangles > MAX_TRIANGLES) fail('模型为空或超过 25 万实际三角形预算');
  const bounds = new THREE.Box3().setFromObject(scene);
  const extent = bounds.getSize(new THREE.Vector3());
  if (
    bounds.isEmpty() ||
    ![...bounds.min.toArray(), ...bounds.max.toArray(), ...extent.toArray()].every(Number.isFinite)
  )
    fail('模型包围盒为空或包含无效尺寸');
  if (Math.min(extent.x, extent.y, extent.z) <= 0)
    fail('模型存在零厚度维度，请导出具有宽、高、深的立体网格');
  const factor = 0.3 / Math.max(extent.x, extent.y, extent.z);
  if (!Number.isFinite(factor) || factor <= 0) fail('模型尺寸无法归一化');
  const root = new THREE.Group();
  const placement = new THREE.Group();
  placement.scale.setScalar(factor);
  placement.position.set(
    -(bounds.min.x + extent.x / 2) * factor,
    -bounds.min.y * factor,
    -(bounds.min.z + extent.z / 2) * factor,
  );
  placement.add(scene);
  root.add(placement);
  root.updateWorldMatrix(true, true);
  const size = { width: extent.x * factor, height: extent.y * factor, depth: extent.z * factor };
  if (Object.values(size).some((n) => !Number.isFinite(n) || n <= 0)) fail('模型尺寸无法归一化');
  return {
    root,
    size,
    sourceSize: { width: extent.x, height: extent.y, depth: extent.z },
    triangles,
  };
}

const disposed = new WeakSet<object>();
function disposeResource(resource: THREE.BufferGeometry | THREE.Material | THREE.Texture): void {
  if (disposed.has(resource)) return;
  disposed.add(resource);
  if (resource instanceof THREE.Texture) {
    const image = resource.source?.data as { close?: () => void } | undefined;
    if (image && typeof image.close === 'function' && !disposed.has(image)) {
      disposed.add(image);
      image.close();
    }
  }
  resource.dispose();
}
function collect(
  root: THREE.Object3D,
  add: (resource: THREE.BufferGeometry | THREE.Material | THREE.Texture) => void,
): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) add(value);
    }
  });
}

/** Call only when no rendered clone still uses this model's shared resources. */
export function disposeModel(model: LoadedModel): void {
  collect(model.root, disposeResource);
}

export async function inspectModel(blob: Blob, format: 'glb' | 'gltf'): Promise<LoadedModel> {
  if (!blob.size || blob.size > MAX_FILE) fail('模型文件为空或超过 15 MiB 限制');
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  let released = false,
    imageFailed = false;
  const add = (resource: THREE.BufferGeometry | THREE.Material | THREE.Texture) => {
    if (released) disposeResource(resource);
    else resources.add(resource);
    if (resource instanceof THREE.Material) {
      for (const value of Object.values(resource)) if (value instanceof THREE.Texture) add(value);
    }
  };
  const release = () => {
    released = true;
    resources.forEach(disposeResource);
    resources.clear();
  };
  try {
    const json = preflightModel(new Uint8Array(await blob.arrayBuffer()), format);
    const doc = JSON.parse(json) as Doc;
    const allowed = new Set<string>(
      [...(doc.buffers ?? []), ...(doc.images ?? [])].map((entry) => entry.uri),
    );
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      // All bufferView images were rewritten to data URIs. Thus the loader never needs
      // blob URLs, and even a supplied blob:/file:/relative/http URL is blocked here.
      if (!allowed.has(url)) fail('已阻止模型加载外部资源');
      return url;
    });
    const loader = new GLTFLoader(manager);
    loader.register((parser: GLTFParser) => {
      const geometries = parser.loadGeometries.bind(parser);
      parser.loadGeometries = (primitives) => {
        const promise = geometries(primitives);
        // Track each primitive separately: Promise.all may reject before siblings finish.
        const cache = (
          parser as GLTFParser & {
            primitiveCache: Record<string, { promise: Promise<THREE.BufferGeometry> }>;
          }
        ).primitiveCache;
        for (const entry of Object.values(cache)) void entry.promise.then(add, () => {});
        return promise;
      };
      const material = parser.loadMaterial.bind(parser);
      parser.loadMaterial = (index) =>
        material(index).then((value) => {
          add(value);
          return value;
        });
      const image = parser.loadImageSource.bind(parser);
      parser.loadImageSource = (index, imageLoader) =>
        image(index, imageLoader).then(
          (value) => {
            add(value);
            return value;
          },
          (error) => {
            imageFailed = true;
            throw error;
          },
        );
      const texture = parser.loadTextureImage.bind(parser);
      parser.loadTextureImage = (index, source, imageLoader) =>
        texture(index, source, imageLoader).then((value) => {
          if (value) add(value);
          return value;
        });
      const finalMaterial = parser.assignFinalMaterial.bind(parser);
      parser.assignFinalMaterial = (mesh) => {
        finalMaterial(mesh);
        collect(mesh, add);
      };
      const node = parser.loadNode.bind(parser);
      parser.loadNode = (index) =>
        node(index).then((value) => {
          collect(value, add);
          return value;
        });
      return { name: 'DeskspaceResourceTracking' };
    });
    const gltf = await loader.parseAsync(json, '');
    if (imageFailed) fail('模型内嵌图片解码失败');
    const model = normalizeModel(gltf.scene);
    // GLTFLoader loads all scenes. Dispose resources not used by the selected scene.
    const retained = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    collect(model.root, (value) => retained.add(value));
    for (const resource of resources)
      if (!retained.has(resource)) {
        // Different texture objects may share the same ImageBitmap with a retained texture.
        if (
          resource instanceof THREE.Texture &&
          [...retained].some(
            (value) => value instanceof THREE.Texture && value.source.data === resource.source.data,
          )
        )
          resource.dispose();
        else disposeResource(resource);
      }
    return model;
  } catch (error) {
    release();
    const detail = error instanceof Error ? error.message : String(error);
    const explanation = /\p{Script=Han}/u.test(detail)
      ? detail
      : '文件结构损坏或包含不支持的数据，请重新导出静态 GLB/glTF 文件';
    throw new Error(`模型导入失败：${explanation}`, { cause: error });
  }
}

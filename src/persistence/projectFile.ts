import { z } from 'zod';
import { projectSchema, type Project, type Size } from '../domain/project';
import { inspectModel, disposeModel, type LoadedModel } from '../assets/importModel';

const MIB = 1024 * 1024;
const MAX_RESOURCE_BYTES = 15 * MIB;
const MAX_TOTAL_BYTES = 40 * MIB;
const MAX_JSON_BYTES = 58 * MIB;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_RESOURCE_BYTES / 3);
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const envelopeSchema = z
  .object({
    format: z.literal('deskspace'),
    version: z.literal(1),
    project: projectSchema,
    resources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            data: z.string().max(MAX_BASE64_LENGTH),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

function parseProject(value: unknown): Project {
  const result = projectSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      `工程结构无效：${result.error.issues.map((issue) => issue.message).join('；')}`,
    );
  return result.data;
}

function closeEnough(actual: number, expected: number): boolean {
  return (
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-4)
  );
}

function sameSize(actual: Size, expected: Size): boolean {
  return (
    closeEnough(actual.width, expected.width) &&
    closeEnough(actual.height, expected.height) &&
    closeEnough(actual.depth, expected.depth)
  );
}

function validateItemSizes(project: Project): void {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  for (const item of project.items) {
    if (item.kind !== 'imported') continue;
    const asset = assets.get(item.assetId!);
    if (!asset) throw new Error(`物品「${item.name}」缺少模型资源`);
    const scale = item.size.width / asset.size.width;
    if (
      !closeEnough(item.size.height, asset.size.height * scale) ||
      !closeEnough(item.size.depth, asset.size.depth * scale)
    ) {
      throw new Error(`物品「${item.name}」的尺寸必须与模型等比`);
    }
  }
}

function base64ByteLength(data: string): number {
  if (
    !data.length ||
    data.length > MAX_BASE64_LENGTH ||
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
  ) {
    throw new Error('模型资源包含无效的 Base64 编码');
  }
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const last = BASE64_ALPHABET.indexOf(data[data.length - padding - 1]);
  // Reject noncanonical encodings whose unused padding bits are nonzero.
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) {
    throw new Error('模型资源包含无效的 Base64 填充');
  }
  const bytes = (data.length / 4) * 3 - padding;
  if (bytes > MAX_RESOURCE_BYTES) throw new Error('单个模型资源超过 15 MiB');
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  // Chunks are divisible by three so their base64 representations concatenate safely.
  const chunkSize = 3 * 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))));
  }
  return chunks.join('');
}

function decodeBase64(data: string, expectedBytes: number): Blob {
  let binary: string;
  try {
    binary = atob(data);
  } catch (cause) {
    throw new Error('模型资源 Base64 解码失败', { cause });
  }
  if (binary.length !== expectedBytes) throw new Error('模型资源解码后的字节数不匹配');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

export async function exportProjectFile(project: Project, blobs: Map<string, Blob>): Promise<Blob> {
  const snapshot = parseProject(project);
  const referenced = new Set(
    snapshot.items.flatMap((item) => (item.assetId ? [item.assetId] : [])),
  );
  const byId = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  for (const id of referenced) {
    if (!byId.has(id)) throw new Error(`无法导出：物品引用了不存在的模型「${id}」`);
  }
  snapshot.assets = snapshot.assets.filter((asset) => referenced.has(asset.id));
  validateItemSizes(snapshot);
  const selected = snapshot.assets.map((asset) => {
    const blob = blobs.get(asset.id);
    if (!(blob instanceof Blob))
      throw new Error(`无法导出：缺少模型资源「${asset.name || asset.id}」`);
    if (blob.size !== asset.bytes)
      throw new Error(`无法导出：模型资源「${asset.name || asset.id}」字节数不匹配`);
    return { id: asset.id, blob };
  });
  const resources: { id: string; data: string }[] = [];
  for (const resource of selected) {
    resources.push({
      id: resource.id,
      data: encodeBase64(new Uint8Array(await resource.blob.arrayBuffer())),
    });
  }
  const file = new Blob(
    [JSON.stringify({ format: 'deskspace', version: 1, project: snapshot, resources })],
    { type: 'application/json' },
  );
  if (file.size > MAX_JSON_BYTES) throw new Error('工程文件超过 58 MiB');
  return file;
}

export async function importProjectFile(file: Blob): Promise<{
  project: Project;
  blobs: Map<string, Blob>;
  models: Map<string, LoadedModel>;
}> {
  if (file.size > MAX_JSON_BYTES) throw new Error('工程文件超过 58 MiB');
  const text = await file.text();
  if (text.length > MAX_JSON_BYTES) throw new Error('工程 JSON 超过 58 MiB');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new Error('工程文件不是有效的 JSON', { cause });
  }
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(
      `工程文件格式或版本无效：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  const { project, resources } = parsed.data;
  validateItemSizes(project);
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  let totalBytes = 0;
  const checked = resources.map((resource) => {
    if (seen.has(resource.id)) throw new Error(`工程文件包含重复资源「${resource.id}」`);
    seen.add(resource.id);
    const meta = assets.get(resource.id);
    if (!meta) throw new Error(`工程文件包含额外资源「${resource.id}」`);
    const bytes = base64ByteLength(resource.data);
    if (bytes !== meta.bytes) throw new Error(`模型资源「${meta.name || meta.id}」字节数不匹配`);
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('工程模型资源超过 40 MiB');
    return { ...resource, bytes, meta };
  });
  for (const asset of project.assets) {
    if (!seen.has(asset.id)) throw new Error(`工程文件缺少模型资源「${asset.name || asset.id}」`);
  }
  const blobs = new Map(
    checked.map((resource) => [resource.id, decodeBase64(resource.data, resource.bytes)]),
  );
  const models = new Map<string, LoadedModel>();
  try {
    for (const resource of checked) {
      const model = await inspectModel(blobs.get(resource.id)!, resource.meta.format);
      models.set(resource.id, model);
      // Asset metadata uses normalized dimensions, not the model's source dimensions.
      if (
        model.triangles !== resource.meta.triangles ||
        !sameSize(model.size, resource.meta.size)
      ) {
        throw new Error(
          `模型资源「${resource.meta.name || resource.id}」的三角形数或归一化尺寸与实际模型不符`,
        );
      }
    }
    return { project, blobs, models };
  } catch (cause) {
    for (const model of models.values()) {
      try {
        disposeModel(model);
      } catch {
        /* Release the other models even if one disposal fails. */
      }
    }
    throw new Error(`导入工程失败：${cause instanceof Error ? cause.message : '模型校验失败'}`, {
      cause,
    });
  }
}

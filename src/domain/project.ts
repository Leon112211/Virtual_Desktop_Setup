import { z } from 'zod';
export const kinds = [
  'monitor',
  'speaker',
  'controller',
  'pegboard',
  'keyboard',
  'lightbar',
] as const;
export type BuiltinKind = (typeof kinds)[number];
// Conservative per-kind ceilings, including rounded faces and small details.
// Keep these aligned with BuiltinModels' subdivision settings.
export const builtinTriangleBudget: Record<BuiltinKind, number> = {
  monitor: 4000,
  speaker: 4000,
  controller: 4000,
  pegboard: 15000,
  keyboard: 20000,
  lightbar: 5000,
};
const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const sizeSchema = z.object({
  width: finite.min(0.005).max(5),
  height: finite.min(0.005).max(5),
  depth: finite.min(0.005).max(5),
});
export type Size = z.infer<typeof sizeSchema>;
export const deskSchema = z
  .object({
    width: finite.min(0.6).max(3),
    depth: finite.min(0.35).max(1.5),
    height: finite.min(0.4).max(1.3),
    thickness: finite.min(0.015).max(0.1),
    color,
  })
  .refine((d) => d.thickness < d.height, '桌板厚度必须小于桌高');
export type Desk = z.infer<typeof deskSchema>;
export const itemSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    kind: z.enum([...kinds, 'imported']),
    assetId: z.string().optional(),
    x: finite.min(-5).max(5),
    z: finite.min(-5).max(5),
    rotation: finite.min(-36000).max(36000),
    // Monitor-only screen pose: tilt (俯仰), pivot/portrait (旋转), and the
    // screen's raise above the stand (屏幕高度). Yaw reuses `rotation`.
    pitch: finite.min(-45).max(45).optional(),
    roll: finite.min(-90).max(90).optional(),
    lift: finite.min(0).max(0.25).optional(),
    size: sizeSchema,
    color,
  })
  .refine((i) => i.kind !== 'imported' || !!i.assetId, '导入物品缺少模型资源');
export type SceneItem = z.infer<typeof itemSchema>;
export const assetSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(255),
  format: z.enum(['glb', 'gltf']),
  bytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  size: sizeSchema,
  triangles: z.number().int().min(1).max(250000),
});
export type AssetMeta = z.infer<typeof assetSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    desk: deskSchema,
    items: z.array(itemSchema).max(100),
    assets: z.array(assetSchema).max(100),
  })
  .superRefine((p, ctx) => {
    const assetIds = new Set(p.assets.map((a) => a.id));
    if (
      assetIds.size !== p.assets.length ||
      new Set(p.items.map((i) => i.id)).size !== p.items.length
    )
      ctx.addIssue({ code: 'custom', message: '物品或资源 ID 重复' });
    if (p.assets.reduce((n, a) => n + a.bytes, 0) > 40 * 1024 * 1024)
      ctx.addIssue({ code: 'custom', message: '工程模型资源超过 40 MiB' });
    if (p.items.some((i) => i.kind === 'imported' && !assetIds.has(i.assetId!)))
      ctx.addIssue({ code: 'custom', message: '物品引用了不存在的模型' });
    const triangles = p.items.reduce(
      (n, i) =>
        n +
        (i.kind === 'imported'
          ? (p.assets.find((a) => a.id === i.assetId)?.triangles ?? 0)
          : builtinTriangleBudget[i.kind]),
      0,
    );
    if (triangles > 500000) ctx.addIssue({ code: 'custom', message: '场景超过 50 万三角形预算' });
  });
export type Project = z.infer<typeof projectSchema>;
export const uid = () => crypto.randomUUID();
export const cm = (meters: number) => Math.round(meters * 1000) / 10;
export const meters = (centimeters: number) => centimeters / 100;

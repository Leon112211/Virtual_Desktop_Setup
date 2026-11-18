import { z } from 'zod';
import { cableSchema, MAX_CABLES } from './cable';
import {
  DESK_FINISHES,
  DESK_MAX_CORNER_RADIUS,
  GROMMET_DIAMETERS,
  PARTITION_MAX_HEIGHT,
  PARTITION_MIN_HEIGHT,
  RETURN_MAX_EXTENSION,
  RETURN_MAX_WIDTH,
  RETURN_MIN_EXTENSION,
  RETURN_MIN_WIDTH,
  returnWidthMax,
  SHELF_MAX_HEIGHT,
  SHELF_MIN_DEPTH,
  SHELF_MIN_HEIGHT,
  shelfDepthMax,
  WALL_MAX_GAP,
  WALL_MAX_HEIGHT,
  WALL_MIN_GAP,
  WALL_MIN_HEIGHT,
} from './desk';
import {
  armMountedLaptopIds,
  armMountedMonitorIds,
  armPrimaryLaptopId,
  armPrimaryMonitorId,
  armSecondaryLaptopId,
  armSecondaryMonitorId,
  isOfficialGamingLaptopSpec,
  isOfficialMacbookSpec,
  laptopStandSchema,
  MAX_LID_ANGLE,
  monitorArmSchema,
} from './laptop';
import { isOfficialKeyboardSpec, keyboardSettingsSchema } from './keyboard';
import { speakerSettingsSchema } from './speaker';
import { controllerSettingsSchema } from './controller';
import { monitorSettingsSchema } from './monitor';
import { mouseSettingsSchema } from './mouse';
import { isValidMousepadSize } from './mousepad';
import { devicePorts, isPortKind } from './ports';
import { powerStripSettingsSchema, wallOutletSettingsSchema } from './power';
import { MAX_SCREEN_LAMPS, SCREEN_LAMP_SIZE, screenLampSchema } from './screenLamp';

export const kinds = [
  'monitor',
  'speaker',
  'controller',
  'pegboard',
  'keyboard',
  'mouse',
  'mousepad',
  'screenLamp',
  'gamingLaptop',
  'macbook',
  'macMini',
  'macStudio',
  'laptopStand',
  'monitorArm',
  'powerStrip',
  'wallOutlet',
] as const;
export type BuiltinKind = (typeof kinds)[number];

// Conservative per-kind ceilings, including rounded faces and small details.
// Keep these aligned with BuiltinModels' subdivision settings.
export const builtinTriangleBudget: Record<BuiltinKind, number> = {
  monitor: 10000,
  speaker: 4000,
  controller: 10000,
  // The pegboard's instanced slots are real-size, so its count (not its scale)
  // grows with the board; this covers roughly a 1 m board with holes on both faces.
  pegboard: 30000,
  keyboard: 20000,
  mouse: 6000,
  mousepad: 2000,
  screenLamp: 4000,
  gamingLaptop: 10000,
  macbook: 10000,
  macMini: 3000,
  macStudio: 3500,
  laptopStand: 4000,
  monitorArm: 14000,
  powerStrip: 12000,
  wallOutlet: 8000,
};

const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const sizeSchema = z.object({
  width: finite.min(0.005).max(5),
  height: finite.min(0.002).max(5),
  depth: finite.min(0.005).max(5),
});
export type Size = z.infer<typeof sizeSchema>;

export const deskSchema = z
  .object({
    width: finite.min(0.6).max(3),
    depth: finite.min(0.35).max(1.5),
    height: finite.min(0.4).max(1.3),
    thickness: finite.min(0.015).max(0.1),
    cornerRadius: finite.min(0).max(DESK_MAX_CORNER_RADIUS).optional(),
    color,
    finish: z.enum(DESK_FINISHES).optional(),
    return: z
      .object({
        side: z.enum(['left', 'right']),
        width: finite.min(RETURN_MIN_WIDTH).max(RETURN_MAX_WIDTH),
        extension: finite.min(RETURN_MIN_EXTENSION).max(RETURN_MAX_EXTENSION),
      })
      .optional(),
    grommet: z
      .object({
        enabled: z.boolean(),
        side: z.enum(['left', 'center', 'right']),
        diameter: finite
          .refine((v) => GROMMET_DIAMETERS.includes(v as (typeof GROMMET_DIAMETERS)[number]), {
            message: '走线孔径仅支持 50 / 60 / 80 mm 标准尺寸',
          })
          .optional(),
      })
      .optional(),
    partitions: z
      .object({
        back: z.boolean(),
        left: z.boolean(),
        right: z.boolean(),
        height: finite.min(PARTITION_MIN_HEIGHT).max(PARTITION_MAX_HEIGHT),
      })
      .optional(),
    shelf: z
      .object({
        enabled: z.boolean(),
        depth: finite.min(SHELF_MIN_DEPTH).max(0.45),
        height: finite.min(SHELF_MIN_HEIGHT).max(SHELF_MAX_HEIGHT),
      })
      .optional(),
    backWall: z
      .object({
        enabled: z.boolean(),
        height: finite.min(WALL_MIN_HEIGHT).max(WALL_MAX_HEIGHT),
        gap: finite.min(WALL_MIN_GAP).max(WALL_MAX_GAP).optional(),
        color: color.optional(),
      })
      .optional(),
  })
  .refine((d) => d.thickness < d.height, '桌板厚度必须小于桌高')
  .refine((d) => !d.return || d.return.width <= returnWidthMax(d.width), {
    message: '侧翼宽度必须比主桌宽度至少小 30 cm',
    path: ['return', 'width'],
  })
  .refine(
    (d) => !d.return || (!d.partitions?.back && !d.partitions?.left && !d.partitions?.right),
    {
      message: 'L 形桌不支持工位隔断挡板',
      path: ['partitions'],
    },
  )
  .refine((d) => !d.return || !d.shelf?.enabled, {
    message: 'L 形桌不支持桌体一体等宽层架',
    path: ['shelf'],
  })
  .refine((d) => !d.shelf?.enabled || d.shelf.depth <= shelfDepthMax(d.depth), {
    message: '等宽层架纵深必须小于主桌深度至少 15 cm',
    path: ['shelf', 'depth'],
  });
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
    surface: z.enum(['desk', 'shelf', 'wall', 'floor']).optional(),
    wallY: finite.min(0.02).max(WALL_MAX_HEIGHT).optional(),
    // Monitor-only screen pose: tilt (俯仰), pivot/portrait (旋转), and the
    // screen's raise above the stand (屏幕高度). Yaw reuses `rotation`.
    pitch: finite.min(-45).max(45).optional(),
    roll: finite.min(-90).max(90).optional(),
    lift: finite.min(-0.35).max(0.45).optional(),
    lidAngle: finite.min(0).max(MAX_LID_ANGLE).optional(),
    lamp: screenLampSchema.optional(),
    laptopStand: laptopStandSchema.optional(),
    monitorArm: monitorArmSchema.optional(),
    monitor: monitorSettingsSchema.optional(),
    keyboard: keyboardSettingsSchema.optional(),
    speaker: speakerSettingsSchema.optional(),
    controller: controllerSettingsSchema.optional(),
    mouse: mouseSettingsSchema.optional(),
    powerStrip: powerStripSettingsSchema.optional(),
    wallOutlet: wallOutletSettingsSchema.optional(),
    size: sizeSchema,
    color,
  })
  .refine((i) => i.kind !== 'imported' || !!i.assetId, '导入物品缺少模型资源')
  .superRefine((i, ctx) => {
    if (i.kind !== 'screenLamp') {
      if (i.lamp) ctx.addIssue({ code: 'custom', message: '只有屏幕挂灯可以保存照明参数' });
    } else {
      if (!i.lamp) ctx.addIssue({ code: 'custom', message: '屏幕挂灯缺少安装与照明参数' });
      if (
        i.x !== 0 ||
        i.z !== 0 ||
        i.rotation !== 0 ||
        i.assetId !== undefined ||
        i.pitch !== undefined ||
        i.roll !== undefined ||
        i.lift !== undefined ||
        i.surface !== undefined ||
        i.size.width < 0.3 ||
        i.size.width > 0.6 ||
        i.size.height !== SCREEN_LAMP_SIZE.height ||
        i.size.depth !== SCREEN_LAMP_SIZE.depth
      )
        ctx.addIssue({ code: 'custom', message: '挂灯必须采用固定安装结构，长度为 30–60 cm' });
    }

    if (i.kind !== 'laptopStand' && i.laptopStand) {
      ctx.addIssue({ code: 'custom', message: '只有笔记本支架可以保存支架参数' });
    } else if (i.kind === 'laptopStand' && !i.laptopStand) {
      ctx.addIssue({ code: 'custom', message: '笔记本支架缺少支撑参数' });
    }

    if (i.kind !== 'monitorArm' && i.monitorArm) {
      ctx.addIssue({ code: 'custom', message: '只有显示器支架臂可以保存夹持参数' });
    } else if (i.kind === 'monitorArm') {
      if (!i.monitorArm)
        ctx.addIssue({ code: 'custom', message: '显示器支架臂缺少绑定显示器参数' });
      if (i.x !== 0 || i.z !== 0 || i.rotation !== 0 || i.surface !== undefined) {
        ctx.addIssue({ code: 'custom', message: '显示器支架臂随绑定显示器自动安装于桌缘' });
      }
    }

    if (i.lidAngle !== undefined && i.kind !== 'gamingLaptop' && i.kind !== 'macbook') {
      ctx.addIssue({ code: 'custom', message: '只有笔记本可以调节屏幕开合角' });
    }
    if (i.keyboard !== undefined && i.kind !== 'keyboard') {
      ctx.addIssue({ code: 'custom', message: '只有机械键盘可以保存配列与灯效参数' });
    }
    if (i.monitor !== undefined && i.kind !== 'monitor') {
      ctx.addIssue({ code: 'custom', message: '只有显示器可以保存显示器模具参数' });
    }
    if (i.controller !== undefined && i.kind !== 'controller') {
      ctx.addIssue({ code: 'custom', message: '只有游戏手柄可以保存手柄型号参数' });
    }
    if (i.mouse !== undefined && i.kind !== 'mouse') {
      ctx.addIssue({ code: 'custom', message: '只有鼠标可以保存型号参数' });
    }
    if (i.powerStrip !== undefined && i.kind !== 'powerStrip') {
      ctx.addIssue({ code: 'custom', message: '只有桌面插排可以保存排插规格参数' });
    }
    if (i.wallOutlet !== undefined && i.kind !== 'wallOutlet') {
      ctx.addIssue({ code: 'custom', message: '只有插座可以保存插座规格参数' });
    }
    if (
      (i.surface === 'wall' || i.wallY !== undefined) &&
      i.kind !== 'pegboard' &&
      i.kind !== 'wallOutlet'
    ) {
      ctx.addIssue({ code: 'custom', message: '只有洞洞板和壁挂插座可以安装于桌后墙面' });
    }
    if (i.surface === 'floor' && i.kind !== 'powerStrip' && i.kind !== 'wallOutlet') {
      ctx.addIssue({ code: 'custom', message: '只有插排和地插可以放置在地面' });
    }
    if (i.kind === 'mousepad') {
      if (!isValidMousepadSize(i.size)) {
        ctx.addIssue({
          code: 'custom',
          message: '鼠标垫厚度需在 2–6 mm 之间，尺寸需在 20–160 × 18–80 cm 之间',
        });
      }
    } else if (i.size.height < 0.005) {
      ctx.addIssue({ code: 'custom', message: '物品高度不能小于 0.5 cm' });
    }
    if (i.kind === 'macbook' && !isOfficialMacbookSpec(i.size, i.color)) {
      ctx.addIssue({
        code: 'custom',
        message: 'MacBook 仅支持苹果官方公布的机型尺寸与对应配色',
      });
    }
    if (i.kind === 'gamingLaptop' && !isOfficialGamingLaptopSpec(i.size)) {
      ctx.addIssue({
        code: 'custom',
        message: '游戏本仅支持 14" / 15.6" / 16" / 17.3" 标准机型尺寸，不支持自定义尺寸',
      });
    }
    if (i.kind === 'keyboard' && !isOfficialKeyboardSpec(i.size, i.keyboard)) {
      ctx.addIssue({
        code: 'custom',
        message: '机械键盘仅支持标准配列尺寸，不支持自定义尺寸',
      });
    }
    if (i.surface !== undefined && (i.kind === 'screenLamp' || i.kind === 'monitorArm')) {
      ctx.addIssue({ code: 'custom', message: '挂载附件不能单独放置在层架上' });
    }
  });
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
    environment: z.enum(['bright', 'dark']).optional(),
    items: z.array(itemSchema).max(100),
    assets: z.array(assetSchema).max(100),
    cables: z.array(cableSchema).max(MAX_CABLES).optional(),
  })
  .superRefine((p, ctx) => {
    const lamps = p.items.filter((i) => i.kind === 'screenLamp');
    if (lamps.length > MAX_SCREEN_LAMPS)
      ctx.addIssue({ code: 'custom', message: '场景最多支持两盏屏幕挂灯' });
    const lampHosts = new Set<string>();
    for (const lamp of lamps) {
      const hostId = lamp.lamp?.monitorId;
      if (!p.items.some((i) => i.id === hostId && i.kind === 'monitor'))
        ctx.addIssue({ code: 'custom', message: '挂灯必须安装到现有的内置显示器' });
      if (hostId && lampHosts.has(hostId))
        ctx.addIssue({ code: 'custom', message: '每台显示器只能安装一盏挂灯' });
      if (hostId) lampHosts.add(hostId);
    }

    const armMonitors = new Set<string>();
    const armLaptops = new Set<string>();
    for (const arm of p.items.filter((i) => i.kind === 'monitorArm')) {
      const cfg = arm.monitorArm;
      if (!cfg) continue;
      const pm = armPrimaryMonitorId(cfg);
      const pl = armPrimaryLaptopId(cfg);
      const sm = armSecondaryMonitorId(cfg);
      const sl = armSecondaryLaptopId(cfg);

      if ((cfg.primaryKind ?? 'monitor') === 'monitor' && !pm) {
        ctx.addIssue({ code: 'custom', message: '支架臂主臂必须绑定一台内置显示器' });
      }
      if (cfg.primaryKind === 'laptopTray' && !pl) {
        ctx.addIssue({ code: 'custom', message: '笔记本托盘模式需要选择一台笔记本' });
      }
      if (cfg.armStyle === 'dual' && cfg.secondaryKind === 'monitor' && !sm) {
        ctx.addIssue({ code: 'custom', message: '双臂副臂未选择挂载的显示器' });
      }
      if (cfg.armStyle === 'dual' && cfg.secondaryKind === 'laptopTray' && !sl) {
        ctx.addIssue({ code: 'custom', message: '双臂副臂托盘未选择挂载的笔记本' });
      }

      const mids = armMountedMonitorIds(cfg);
      if (new Set(mids).size !== mids.length) {
        ctx.addIssue({ code: 'custom', message: '同一双支架臂的两条支臂不能绑定同一台显示器' });
      }
      for (const mId of mids) {
        if (!p.items.some((i) => i.id === mId && i.kind === 'monitor')) {
          ctx.addIssue({ code: 'custom', message: '支架臂只能绑定现有的内置显示器' });
        }
        if (armMonitors.has(mId)) {
          ctx.addIssue({ code: 'custom', message: '每台显示器只能安装一套支架臂' });
        }
        armMonitors.add(mId);
      }

      const lids = armMountedLaptopIds(cfg);
      if (new Set(lids).size !== lids.length) {
        ctx.addIssue({ code: 'custom', message: '同一双支架臂的两条支臂不能绑定同一台笔记本' });
      }
      for (const lId of lids) {
        if (
          !p.items.some((i) => i.id === lId && (i.kind === 'gamingLaptop' || i.kind === 'macbook'))
        ) {
          ctx.addIssue({ code: 'custom', message: '支架臂托盘只能放置场景中的笔记本' });
        }
        if (armLaptops.has(lId)) {
          ctx.addIssue({ code: 'custom', message: '每台笔记本只能挂载在一个支架或托盘上' });
        }
        armLaptops.add(lId);
      }
    }

    const boundLaptops = new Set<string>(armLaptops);
    for (const stand of p.items.filter((i) => i.kind === 'laptopStand')) {
      const laptopId = stand.laptopStand?.laptopId;
      if (!laptopId) continue;
      if (
        !p.items.some(
          (i) => i.id === laptopId && (i.kind === 'gamingLaptop' || i.kind === 'macbook'),
        )
      ) {
        ctx.addIssue({ code: 'custom', message: '笔记本支架只能绑定现有的笔记本' });
      }
      if (boundLaptops.has(laptopId)) {
        ctx.addIssue({ code: 'custom', message: '每台笔记本只能放置在一个支架或托盘上' });
      }
      boundLaptops.add(laptopId);
    }

    if (p.cables) {
      const cableIds = new Set<string>();
      for (const cable of p.cables) {
        if (cableIds.has(cable.id)) {
          ctx.addIssue({ code: 'custom', message: '线缆 ID 重复' });
        }
        cableIds.add(cable.id);
        for (const ep of [cable.from, cable.to]) {
          if (ep.type !== 'device') continue;
          const target = p.items.find((i) => i.id === ep.itemId);
          if (!target || !isPortKind(target.kind)) {
            ctx.addIssue({ code: 'custom', message: '线缆连接了不存在或无接口的设备' });
            continue;
          }
          if (!devicePorts(target).some((port) => port.id === ep.portId)) {
            ctx.addIssue({ code: 'custom', message: '线缆引用了无效的设备端口' });
          }
        }
        if (
          cable.from.type === 'device' &&
          cable.to.type === 'device' &&
          cable.from.itemId === cable.to.itemId &&
          cable.from.portId === cable.to.portId
        ) {
          ctx.addIssue({ code: 'custom', message: '线缆两端不能连接到同一个端口' });
        }
      }
    }

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

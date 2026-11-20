import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import type { SceneItem } from '../src/domain/project';
function fixture(external = false) {
  const vertices = new Float32Array([10, 20, 30, 12, 20, 30, 10, 23, 30, 10, 20, 34]);
  const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  const buffer = Buffer.concat([Buffer.from(vertices.buffer), Buffer.from(indices.buffer)]);
  return Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [
        {
          uri: external
            ? 'https://invalid.example/model.bin'
            : `data:application/octet-stream;base64,${buffer.toString('base64')}`,
          byteLength: buffer.length,
        },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: vertices.byteLength },
        { buffer: 0, byteOffset: vertices.byteLength, byteLength: indices.byteLength },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 4,
          type: 'VEC3',
          min: [10, 20, 30],
          max: [12, 23, 34],
        },
        { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
      ],
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorFactor: [0.3, 0.6, 0.8, 1],
            metallicFactor: 0,
            roughnessFactor: 0.6,
          },
        },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    }),
  );
}
async function texturedFixture(page: Page, fullPbr = false) {
  const model = JSON.parse(fixture().toString());
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#315ce7';
    context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png');
  });
  const original = Buffer.from(model.buffers[0].uri.split(',')[1], 'base64');
  const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const bytes = Buffer.concat([original, Buffer.from(uv.buffer)]);
  model.buffers[0] = {
    uri: `data:application/octet-stream;base64,${bytes.toString('base64')}`,
    byteLength: bytes.length,
  };
  model.bufferViews.push({ buffer: 0, byteOffset: original.length, byteLength: uv.byteLength });
  model.accessors.push({ bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' });
  model.meshes[0].primitives[0].attributes.TEXCOORD_0 = 2;
  model.images = [{ uri: png }];
  model.textures = [{ source: 0 }];
  model.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  if (fullPbr) {
    const material = model.materials[0];
    material.pbrMetallicRoughness.metallicRoughnessTexture = { index: 0 };
    material.pbrMetallicRoughness.metallicFactor = 0.5;
    material.normalTexture = { index: 0 };
    material.occlusionTexture = { index: 0 };
    material.emissiveTexture = { index: 0 };
    material.emissiveFactor = [0.1, 0.1, 0.1];
  }
  return Buffer.from(JSON.stringify(model));
}
async function editorSnapshot(page: Page) {
  return page.evaluate(async () => {
    // Match Vite's actual HMR URL; importing the bare URL can create a second store.
    const path = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === '/src/store/editorStore.ts')
      .at(-1)!;
    const { useEditor } = await import(/* @vite-ignore */ path);
    const { project, past, future, lampGuides } = useEditor.getState();
    return { project, past: past.length, future: future.length, lampGuides };
  });
}
async function state(page: Page) {
  return (await editorSnapshot(page)).project;
}
async function selectSceneItem(page: Page, name: string) {
  await page.getByRole('button', { name: /^场景/ }).click();
  await page
    .locator('.scene-row')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
}
async function library(page: Page) {
  await page.locator('.library-tabs').getByRole('button', { name: '模型库', exact: true }).click();
}
async function lampRenderSnapshot(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const path = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ path);
    const canvas = document.querySelector('canvas')!;
    const { scene, camera, controls } = _roots.get(canvas).store.getState();
    scene.updateMatrixWorld(true);
    const lights: import('three').SpotLight[] = [];
    const materialMaps: string[][] = [];
    scene.traverse((object: import('three').Object3D) => {
      if (object.name === '屏幕挂灯照明采样') lights.push(object as import('three').SpotLight);
      const mesh = object as import('three').Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const entry of materials) {
        const material = entry as import('three').MeshStandardMaterial;
        const image = material.map?.image as { width?: number; height?: number } | undefined;
        if (image?.width === 8 && image.height === 8)
          materialMaps.push(
            (
              ['map', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap', 'emissiveMap'] as const
            ).filter((slot) => material[slot]),
          );
      }
    });
    const housing = lights[0].parent!.parent!.children.find(
      (object: import('three').Object3D) =>
        (object as import('three').Mesh).geometry?.type === 'CylinderGeometry',
    )!;
    const panel = housing.parent!.parent!.parent!;
    const world = housing.getWorldPosition(housing.position.clone());
    const rect = canvas.getBoundingClientRect();
    function project(point: import('three').Vector3) {
      const ndc = point.project(camera);
      return {
        x: rect.x + ((ndc.x + 1) * rect.width) / 2,
        y: rect.y + ((1 - ndc.y) * rect.height) / 2,
      };
    }
    return {
      housing: project(world),
      panel: project(panel.localToWorld(world.clone().set(0, 0, 0.0131))),
      controlsEnabled: controls.enabled,
      materialMaps,
      lights: lights.map((light) => ({
        position: light.getWorldPosition(light.position.clone()).toArray(),
        target: light.target.getWorldPosition(light.position.clone()).toArray(),
        up: light.shadow.camera.up.toArray(),
      })),
    };
  });
}
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: '正在打开' })).toHaveCount(0);
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('canvas')).toBeVisible();
}
async function editNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
}
test('直接拖拽只生成一步历史，Esc可取消且相机恢复', async ({ page }) => {
  await ready(page);
  const p = await state(page);
  const item = p.items.find((i: { kind: string }) => i.kind === 'keyboard');
  const rect = (await page.locator('canvas').boundingBox())!;
  const dist = Math.max(p.desk.width, p.desk.depth) * 1.5;
  const camera = new PerspectiveCamera(38, rect.width / rect.height, 0.01, 100);
  camera.position.set(dist * 0.85, p.desk.height + dist * 0.68, dist * 0.92);
  // The scene orbits the desk's geometric centre, so the projection must match it.
  camera.lookAt(0, p.desk.height - p.desk.thickness / 2, 0);
  camera.updateMatrixWorld();
  const point = new Vector3(item.x, p.desk.height + item.size.height * 0.8, item.z).project(camera);
  const x = rect.x + ((point.x + 1) * rect.width) / 2,
    y = rect.y + ((1 - point.y) * rect.height) / 2;

  // 1. 未选中物体时：左键即使直接落在物品上方并拖动，也仅旋转 3D 视角而不误选、不误移动物品
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 65, y + 12, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  const afterLeftOrbit = await state(page);
  expect(afterLeftOrbit.items.find((i: { id: string }) => i.id === item.id).x).toBe(item.x);
  await expect(page.getByRole('heading', { name: '桌子设置', level: 2 })).toBeVisible();
  // 恢复默认透视视角以便精确测试右键唤醒 -> 左键拖拽交互
  await page.getByRole('button', { name: '透视', exact: true }).click();

  // 2. 右键点击物品仅负责唤醒/选中（不会在右键按住时拖拽移动）
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: 'right' });
  await expect(page.getByRole('heading', { name: '物品属性', level: 2 })).toBeVisible();
  expect((await state(page)).items.find((i: { id: string }) => i.id === item.id).x).toBe(item.x);

  // 3. 右键唤醒选中后：用左键拖拽移动物品、撤销与 Esc 取消
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 65, y + 12, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  const after = await state(page);
  expect(
    Math.abs(after.items.find((i: { id: string }) => i.id === item.id).x - item.x),
  ).toBeGreaterThan(0.01);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await state(page)).items.find((i: { id: string }) => i.id === item.id).x).toBe(item.x);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 40, y + 10, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'left' });
  expect((await state(page)).items.find((i: { id: string }) => i.id === item.id).x).toBe(item.x);
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await expect(page.getByText('俯视视角', { exact: true })).toBeVisible();
});

test('桌子、添加复制删除与历史闭环', async ({ page }) => {
  await ready(page);
  await editNumber(page, '桌面离地高度', '95');
  expect((await state(page)).desk.height).toBe(0.95);
  await page.getByRole('button', { name: '添加桌面音响', exact: true }).click();
  expect((await state(page)).items).toHaveLength(7);
  await editNumber(page, '左右位置', '25');
  await page.getByRole('button', { name: '90°', exact: true }).click();
  let p = await state(page);
  expect(p.items.at(-1).x).toBe(0.25);
  expect(p.items.at(-1).rotation).toBe(90);
  await page.getByRole('button', { name: '复制物品', exact: true }).click();
  expect((await state(page)).items).toHaveLength(8);
  await page.getByRole('button', { name: '删除', exact: true }).click();
  expect((await state(page)).items).toHaveLength(7);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await state(page)).items).toHaveLength(8);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await state(page)).items).toHaveLength(7);
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await expect(page.getByText('俯视视角', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '正视', exact: true }).click();
  await expect(page.getByText('正面视角', { exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: '编辑桌子', exact: true }).count())
    await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await editNumber(page, '宽度', '60');
  expect((await state(page)).items).toHaveLength(7);
  await expect(page.getByRole('button', { name: /件超出桌面/ })).toBeVisible();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  expect((await state(page)).desk.width).toBe(0.6);
});
test('显示器预设与自定义微调保持 16:9 屏幕比例', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: /^场景/ }).click();
  await page.getByRole('button', { name: /27 寸显示器/ }).click();
  await expect(page.locator('.monitor-presets button')).toHaveCount(3);
  // 默认 27 寸，屏幕 59.8 × 33.6 cm
  await expect(page.locator('.monitor-note')).toContainText('27.0 寸');
  await page.locator('.monitor-presets button', { hasText: '32 寸' }).click();
  await expect(page.locator('.monitor-note')).toContainText('31.5 寸');
  let p = await state(page);
  const monitor = p.items.find((i: { kind: string }) => i.kind === 'monitor');
  expect(monitor.size.width).toBeCloseTo(0.713, 2);
  expect(monitor.size.height).toBeCloseTo(0.56, 2);
  expect(monitor.size.depth).toBeCloseTo(0.189, 3);
  // 微调面板宽度：总高随 16:9 屏幕变化，支架保持 15 cm
  await editNumber(page, '面板宽度', '80');
  p = await state(page);
  const size = p.items.find((i: { kind: string }) => i.kind === 'monitor').size;
  expect(size.width).toBeCloseTo(0.8, 2);
  expect(size.height).toBeCloseTo(0.15 + (0.8 - 0.0157) * (9 / 16) + 0.01785, 3);
  await expect(page.locator('.monitor-note')).toContainText('16:9');
});
test('屏幕挂灯参数可编辑，滑块连续拖动只生成一步撤销历史', async ({ page }) => {
  await ready(page);
  const host = (await state(page)).items.find((item: SceneItem) => item.kind === 'monitor');
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  const added = (await state(page)).items.at(-1);
  expect(added.kind).toBe('screenLamp');
  expect(added.lamp).toMatchObject({ monitorId: host.id, enabled: true, brightness: 60 });
  await expect(page.getByLabel('安装到显示器', { exact: true })).toHaveValue(host.id);
  await expect(page.getByLabel('左右位置', { exact: true })).toHaveCount(0);
  for (const [label, value] of [
    ['灯条长度', '52'],
    ['挂灯亮度', '78'],
    ['色温', '5100'],
    ['向前倾角', '32'],
    ['水平光束角', '105'],
    ['垂直光束角', '42'],
    ['边缘柔化', '24'],
  ])
    await editNumber(page, label, value);
  let lamp = (await state(page)).items.find((item: SceneItem) => item.id === added.id);
  expect(lamp.size.width).toBe(0.52);
  expect(lamp.lamp).toEqual({
    monitorId: host.id,
    enabled: true,
    brightness: 78,
    temperature: 5100,
    tilt: 32,
    horizontalAngle: 105,
    verticalAngle: 42,
    softness: 0.24,
  });
  await page.getByRole('switch', { name: '开启挂灯' }).uncheck();
  expect((await state(page)).items.at(-1).lamp.enabled).toBe(false);
  await page.getByRole('switch', { name: '开启挂灯' }).check();
  await page.getByLabel('显示光路示意', { exact: true }).check();
  expect((await editorSnapshot(page)).lampGuides).toBe(true);

  const before = await editorSnapshot(page);
  const slider = page.getByRole('slider', { name: '挂灯亮度 滑块', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const rect = (await slider.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.78, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height / 2, { steps: 4 });
  const intermediate = await editorSnapshot(page);
  expect(intermediate.project.items.at(-1).lamp.brightness).not.toBe(78);
  expect(intermediate.past).toBe(before.past);
  await page.mouse.move(rect.x + rect.width * 0.25, rect.y + rect.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await editorSnapshot(page);
  expect(after.past).toBe(before.past + 1);
  lamp = after.project.items.at(-1);
  expect(lamp.lamp.brightness).toBeLessThan(35);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await state(page)).toEqual(before.project);
  await expect(page.getByLabel('挂灯亮度', { exact: true })).toHaveValue('78');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await state(page)).toEqual(after.project);
});

test('挂灯与明暗环境在刷新和跨上下文工程备份中保留', async ({ page, browser }) => {
  await ready(page);
  await expect(page.getByRole('button', { name: '明亮', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await editNumber(page, '挂灯亮度', '37');
  await editNumber(page, '色温', '2900');
  await page.getByRole('switch', { name: '开启挂灯' }).uncheck();
  await page.getByLabel('显示光路示意', { exact: true }).check();
  await page.getByRole('button', { name: '暗室', exact: true }).click();
  await expect(page.getByRole('button', { name: '暗室', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await state(page)).environment).toBe('bright');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  const saved = await state(page);
  expect(saved.environment).toBe('dark');
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  expect(await state(page)).toEqual(saved);
  expect((await editorSnapshot(page)).lampGuides).toBe(false);
  await expect(page.getByRole('button', { name: '暗室', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await selectSceneItem(page, '屏幕挂灯');
  await expect(page.getByRole('switch', { name: '开启挂灯' })).not.toBeChecked();
  await expect(page.getByLabel('挂灯亮度', { exact: true })).toHaveValue('37');
  await expect(page.getByLabel('色温', { exact: true })).toHaveValue('2900');

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程', exact: true }).click();
  const file = await (await downloaded).path();
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 1440, height: 960 },
  });
  try {
    const fresh = await context.newPage();
    await ready(fresh);
    fresh.on('dialog', (dialog) => dialog.accept());
    await fresh.getByLabel('导入工程文件', { exact: true }).setInputFiles(file!);
    await expect(fresh.getByRole('status').filter({ hasText: '工程已恢复' })).toBeVisible();
    expect(await state(fresh)).toEqual(saved);
    await expect(fresh.getByRole('button', { name: '暗室', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await fresh.getByRole('button', { name: '明亮', exact: true }).click();
    const bright = await state(fresh);
    await expect(fresh.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
    await fresh.reload();
    await expect(fresh.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
    expect(await state(fresh)).toEqual(bright);
    await expect(fresh.getByRole('button', { name: '明亮', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } finally {
    await context.close();
  }
});

test('显示器复制删除联动挂灯，安装占用与两盏上限不会破坏布局', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await editNumber(page, '挂灯亮度', '43');
  const original = await state(page);
  await page.getByRole('button', { name: '复制物品', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '挂灯随显示器复制' })).toBeVisible();
  expect(await state(page)).toEqual(original);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '没有可安装的显示器' })).toBeVisible();
  expect(await state(page)).toEqual(original);
  await selectSceneItem(page, '27 寸显示器');
  await page.getByRole('button', { name: '复制物品', exact: true }).click();
  const duplicated = await state(page);
  const hosts = duplicated.items.filter((item: SceneItem) => item.kind === 'monitor');
  const lamps = duplicated.items.filter((item: SceneItem) => item.kind === 'screenLamp');
  expect(hosts).toHaveLength(2);
  expect(lamps).toHaveLength(2);
  expect(new Set(lamps.map((item: SceneItem) => item.lamp!.monitorId)).size).toBe(2);
  expect(lamps[1].lamp).toEqual({ ...lamps[0].lamp, monitorId: hosts[1].id });
  expect(lamps[1].id).not.toBe(lamps[0].id);
  await page.getByRole('button', { name: '复制物品', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '超过两盏挂灯上限' })).toBeVisible();
  expect(await state(page)).toEqual(duplicated);
  await library(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '场景最多支持两盏' })).toBeVisible();
  expect(await state(page)).toEqual(duplicated);
  await page.getByRole('button', { name: '删除', exact: true }).click();
  expect(await state(page)).toEqual(original);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await state(page)).toEqual(duplicated);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await state(page)).toEqual(original);
  await selectSceneItem(page, '27 寸显示器');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  const removed = await state(page);
  expect(
    removed.items.some((item: SceneItem) => ['monitor', 'screenLamp'].includes(item.kind)),
  ).toBe(false);
  await library(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '没有可安装的显示器' })).toBeVisible();
  expect(await state(page)).toEqual(removed);
});

test('两盏挂灯与纹理导入模型共存，切换照明和光路没有着色器异常', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await selectSceneItem(page, '27 寸显示器');
  await page.getByRole('button', { name: '复制物品', exact: true }).click();
  await page.getByLabel('导入模型文件', { exact: true }).setInputFiles({
    name: '挂灯纹理测试.gltf',
    mimeType: 'model/gltf+json',
    buffer: await texturedFixture(page, true),
  });
  await expect(page.getByRole('dialog', { name: '确认模型尺寸' })).toBeVisible();
  await page.getByRole('button', { name: '添加到桌面', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '确认模型尺寸' })).toHaveCount(0);
  const project = await state(page);
  expect(project.items.filter((item: SceneItem) => item.kind === 'screenLamp')).toHaveLength(2);
  expect(project.items.filter((item: SceneItem) => item.kind === 'imported')).toHaveLength(1);
  await selectSceneItem(page, '屏幕挂灯');
  await page.getByLabel('显示光路示意', { exact: true }).check();
  await page.getByRole('button', { name: '暗室', exact: true }).click();
  await editNumber(page, '色温', '6500');
  await editNumber(page, '挂灯亮度', '100');
  await page.getByRole('switch', { name: '开启挂灯' }).uncheck();
  await page.getByRole('switch', { name: '开启挂灯' }).check();
  await selectSceneItem(page, '屏幕挂灯 副本');
  await editNumber(page, '色温', '2700');
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('显示光路示意', { exact: true }).uncheck();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('三维预览暂时不可用')).toHaveCount(0);
  const rendered = await lampRenderSnapshot(page);
  expect(rendered.lights).toHaveLength(4);
  expect(rendered.materialMaps).toContainEqual([
    'map',
    'metalnessMap',
    'roughnessMap',
    'normalMap',
    'aoMap',
    'emissiveMap',
  ]);
  expect(errors).toEqual([]);
});

test('点击挂灯只选中附件，显示器拖动取消与姿态实时同步灯光', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await selectSceneItem(page, '27 寸显示器');
  const baseline = await editorSnapshot(page);
  const before = await lampRenderSnapshot(page);
  expect(before.lights).toHaveLength(2);
  // Right-click on the lamp housing wakes/selects ONLY the lamp without starting monitor drag or changing history.
  await page.mouse.click(before.housing.x, before.housing.y, { button: 'right' });
  await expect(page.getByLabel('安装到显示器', { exact: true })).toBeVisible();
  expect(await state(page)).toEqual(baseline.project);
  expect((await editorSnapshot(page)).past).toBe(baseline.past);

  // Right-click monitor panel to wake monitor, then left-drag monitor (lights follow; Esc cancels cleanly)
  const selected = await lampRenderSnapshot(page);
  await page.mouse.click(selected.panel.x, selected.panel.y, { button: 'right' });
  await page.mouse.move(selected.panel.x, selected.panel.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(selected.panel.x + 65, selected.panel.y + 12, { steps: 8 });
  const inFlight = await lampRenderSnapshot(page);
  expect(inFlight.controlsEnabled).toBe(false);
  expect(await state(page)).toEqual(baseline.project);
  const delta = inFlight.lights[0].position.map(
    (value: number, axis: number) => value - before.lights[0].position[axis],
  );
  expect(Math.hypot(...delta)).toBeGreaterThan(0.01);
  for (let i = 0; i < 2; i++)
    for (let axis = 0; axis < 3; axis++) {
      expect(inFlight.lights[i].position[axis] - before.lights[i].position[axis]).toBeCloseTo(
        delta[axis],
        5,
      );
      expect(inFlight.lights[i].target[axis] - before.lights[i].target[axis]).toBeCloseTo(
        delta[axis],
        5,
      );
    }
  await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'left' });
  const cancelled = await lampRenderSnapshot(page);
  expect(cancelled.controlsEnabled).toBe(true);
  expect(cancelled.lights).toEqual(before.lights);
  expect(await state(page)).toEqual(baseline.project);
  expect((await editorSnapshot(page)).past).toBe(baseline.past);

  await page.mouse.move(cancelled.panel.x, cancelled.panel.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(cancelled.panel.x + 55, cancelled.panel.y + 10, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  const committed = await editorSnapshot(page);
  const hostBefore = baseline.project.items.find((item: SceneItem) => item.kind === 'monitor');
  const hostAfter = committed.project.items.find((item: SceneItem) => item.id === hostBefore.id);
  expect(Math.hypot(hostAfter.x - hostBefore.x, hostAfter.z - hostBefore.z)).toBeGreaterThan(0.01);
  expect(committed.past).toBe(baseline.past + 1);
  const moved = await lampRenderSnapshot(page);
  expect(moved.controlsEnabled).toBe(true);
  for (let i = 0; i < 2; i++) {
    expect(moved.lights[i].position[0] - before.lights[i].position[0]).toBeCloseTo(
      hostAfter.x - hostBefore.x,
      5,
    );
    expect(moved.lights[i].position[2] - before.lights[i].position[2]).toBeCloseTo(
      hostAfter.z - hostBefore.z,
      5,
    );
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await lampRenderSnapshot(page)).lights).toEqual(before.lights);
  await editNumber(page, '屏幕高度', '4');
  const lifted = await lampRenderSnapshot(page);
  expect(lifted.lights[0].position[1] - before.lights[0].position[1]).toBeCloseTo(0.04, 5);
  await editNumber(page, '俯仰角度', '20');
  await editNumber(page, '屏幕翻转', '90');
  const posed = await lampRenderSnapshot(page);
  expect(posed.lights[0].target).not.toEqual(lifted.lights[0].target);
  expect(posed.lights[0].up).not.toEqual(lifted.lights[0].up);
  expect(posed.lights[0].up).toEqual(posed.lights[1].up);
});

test('屏幕挂灯固定相机明暗环境开关四组照明对照截图', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  const baseline = await state(page);
  const lamp = baseline.items.find((item: SceneItem) => item.kind === 'screenLamp');
  const canvas = page.locator('canvas');
  // Keep the default perspective camera, lamp parameters and selection identical.
  // Locator screenshots preserve the canvas's full resolution, not preview thumbnails.
  for (const environment of ['bright', 'dark'] as const) {
    await page
      .getByRole('button', { name: environment === 'bright' ? '明亮' : '暗室', exact: true })
      .click();
    for (const enabled of [false, true]) {
      await page.getByRole('switch', { name: '开启挂灯' }).setChecked(enabled);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const current = await state(page);
      expect(current).toEqual({
        ...baseline,
        environment,
        items: baseline.items.map((item: SceneItem) =>
          item.id === lamp.id ? { ...item, lamp: { ...item.lamp, enabled } } : item,
        ),
      });
      const name = `${environment}-lamp-${enabled ? 'on' : 'off'}.png`;
      const path = testInfo.outputPath(name);
      await canvas.screenshot({ path, scale: 'device' });
      await testInfo.attach(name, { path, contentType: 'image/png' });
    }
  }
});

test('本地模型尺寸、刷新和跨上下文工程备份', async ({ page, browser }) => {
  await ready(page);
  await page.getByLabel('导入模型文件', { exact: true }).setInputFiles({
    name: '偏心测试模型.gltf',
    mimeType: 'model/gltf+json',
    buffer: await texturedFixture(page),
  });
  await expect(page.getByRole('dialog', { name: '确认模型尺寸' })).toBeVisible();
  await editNumber(page, '模型最长边', '40');
  await page.getByRole('button', { name: '添加到桌面', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '确认模型尺寸' })).toHaveCount(0);
  let p = await state(page);
  expect(p.items).toHaveLength(7);
  expect(p.items.at(-1).size.depth).toBeCloseTo(0.4);
  expect(p.items.at(-1).size.width).toBeCloseTo(0.2);
  await page.getByRole('button', { name: '复制物品', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  p = await state(page);
  expect(p.items).toHaveLength(8);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程', exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const fresh = await context.newPage();
  await ready(fresh);
  fresh.on('dialog', (d) => d.accept());
  await fresh.getByLabel('导入工程文件', { exact: true }).setInputFiles(file!);
  await expect(fresh.getByRole('status').filter({ hasText: '工程已恢复' })).toBeVisible();
  const restored = await state(fresh);
  expect(restored.items).toHaveLength(8);
  expect(restored.assets).toHaveLength(1);
  expect(restored.items.at(-1).size.depth).toBeCloseTo(0.4);
  const cached = await fresh.evaluate(async () => {
    const path = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === '/src/assets/modelCache.ts')
      .at(-1)!;
    const cache = (await import(/* @vite-ignore */ path)).modelCache;
    const textures: number[][] = [];
    cache.forEach((model: { root: import('three').Group }) =>
      model.root.traverse((object) => {
        const mesh = object as import('three').Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials)
          if ('map' in material) {
            const texture = material.map as import('three').Texture | null;
            const image = texture?.image as { width: number; height: number } | undefined;
            if (image) textures.push([image.width, image.height]);
          }
      }),
    );
    return { count: cache.size, textures };
  });
  expect(cached.count).toBe(1);
  expect(cached.textures).toContainEqual([8, 8]);
  await context.close();
});
test('拒绝外链模型和损坏工程，不请求外部资源也不破坏布局', async ({ page }) => {
  await ready(page);
  const external: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('invalid.example')) external.push(r.url());
  });
  await page
    .getByLabel('导入模型文件', { exact: true })
    .setInputFiles({ name: '外链.gltf', mimeType: 'model/gltf+json', buffer: fixture(true) });
  await expect(
    page.getByRole('status').filter({ hasText: /禁止网络地址|侧文件|内嵌/ }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect((await state(page)).items).toHaveLength(6);
  page.on('dialog', (d) => d.accept());
  await page.getByLabel('导入工程文件', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"broken"}'),
  });
  await expect(page.getByRole('status').filter({ hasText: '原布局已保留' })).toBeVisible();
  expect((await state(page)).items).toHaveLength(6);
});
test('数值无效和输入框快捷键不会损坏物品', async ({ page }) => {
  await ready(page);
  await editNumber(page, '宽度', '-5');
  await expect(page.getByText('请输入 60–300 cm')).toBeVisible();
  expect((await state(page)).desk.width).toBe(1.4);
  await page.getByRole('button', { name: '添加机械键盘', exact: true }).click();
  const name = page.getByLabel('物品名称', { exact: true });
  await name.focus();
  await name.press('Delete');
  expect((await state(page)).items).toHaveLength(7);
  await name.fill('我的键盘');
  await name.press('Tab');
  expect((await state(page)).items.at(-1).name).toBe('我的键盘');
});
test('存储配额失败持续提示，但保留编辑和导出能力', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'projects') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return Reflect.apply(put, this, args);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('本地保存失败', { timeout: 15000 });
  await expect(page.getByText('已保存到此浏览器')).toHaveCount(0);
  await editNumber(page, '宽度', '160');
  expect((await state(page)).desk.width).toBe(1.6);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.desksetup\.json$/);
});

test('WebGL不可用时仍能编辑数值并导出工程', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (String(args[0]).includes('webgl')) return null;
      return Reflect.apply(getContext, this, args);
    } as typeof getContext;
  });
  await page.goto('/');
  await expect(page.getByText('三维预览暂时不可用')).toBeVisible({ timeout: 15000 });
  await editNumber(page, '宽度', '160');
  expect((await state(page)).desk.width).toBe(1.6);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.desksetup\.json$/);
});

test('二十件内置物品仍可编辑且没有运行异常', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  for (let index = 0; index < 14; index++)
    await page.getByRole('button', { name: '添加桌面音响', exact: true }).click();
  await editNumber(page, '左右位置', '50');
  const p = await state(page);
  expect(p.items).toHaveLength(20);
  expect(p.items.at(-1).x).toBe(0.5);
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test('窄屏布局无横向溢出并可用抽屉编辑', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '模型库', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '模型库', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加无线游戏手柄', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '添加无线游戏手柄', exact: true }).click();
  await page.getByRole('button', { name: '属性', exact: true }).click();
  await expect(page.getByLabel('左右位置', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('L 形桌型切换、动态上限、凹形越界、拖动取消、撤销与刷新导出往返', async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });

  await ready(page);
  await page.getByRole('button', { name: '左侧 L 形', exact: true }).click();
  await expect(page.getByLabel('主桌宽度', { exact: true })).toBeVisible();
  await expect(page.getByLabel('侧翼宽度', { exact: true })).toBeVisible();
  await expect(page.getByLabel('向前延伸', { exact: true })).toBeVisible();
  await expect(page.getByText('总深度 130 cm', { exact: true })).toBeVisible();

  await editNumber(page, '侧翼宽度', '100');
  await editNumber(page, '向前延伸', '120');
  await expect(page.getByText('总深度 190 cm', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^场景/ }).click();
  await expect(
    page.getByText('左侧 L 形 · 主桌 140 × 70 · 侧翼 100 × 120 cm', { exact: true }),
  ).toBeVisible();
  await library(page);

  // 缩窄主桌宽度时同步缩窄侧翼宽度，且一次撤销即可恢复
  await editNumber(page, '主桌宽度', '80');
  let p = await state(page);
  expect(p.desk.width).toBe(0.8);
  expect(p.desk.return).toEqual({ side: 'left', width: 0.5, extension: 1.2 });
  await expect(page.getByLabel('侧翼宽度', { exact: true })).toHaveAttribute('max', '50');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  p = await state(page);
  expect(p.desk.width).toBe(1.4);
  expect(p.desk.return).toEqual({ side: 'left', width: 1, extension: 1.2 });

  // 左右切换保留尺寸；切回矩形再撤销恢复
  await page.getByRole('button', { name: '右侧 L 形', exact: true }).click();
  expect((await state(page)).desk.return).toEqual({ side: 'right', width: 1, extension: 1.2 });
  await page.getByRole('button', { name: '矩形', exact: true }).click();
  await expect(page.getByLabel('宽度', { exact: true })).toBeVisible();
  expect((await state(page)).desk.return).toBeUndefined();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await state(page)).desk.return).toEqual({ side: 'right', width: 1, extension: 1.2 });

  // 侧翼放置与凹形缺口越界判断
  await page.getByRole('button', { name: '添加桌面音响', exact: true }).click();
  await editNumber(page, '左右位置', '40');
  await editNumber(page, '前后位置', '80');
  await expect(page.getByRole('button', { name: /件超出桌面/ })).toHaveCount(0);

  // 移入右侧 L 形左侧的内凹缺口 (-50, 80) -> 提示越界（侧翼宽 100 cm 覆盖 [-30, 70]，缺口为 [-70, -30)）
  await editNumber(page, '左右位置', '-50');
  await expect(page.getByRole('button', { name: /件超出桌面/ })).toBeVisible();
  await expect(page.getByText('物品超出了桌面边缘', { exact: false })).toBeVisible();

  // 旋转横跨内凹缺口 (-38, 45, 45°) 同样提示越界
  await editNumber(page, '左右位置', '-38');
  await editNumber(page, '前后位置', '45');
  await editNumber(page, '绕竖轴旋转', '45');
  await expect(page.getByRole('button', { name: /件超出桌面/ })).toBeVisible();
  await editNumber(page, '绕竖轴旋转', '0');

  // 移回侧翼并验证拖动 Esc 取消
  await editNumber(page, '左右位置', '40');
  await expect(page.getByRole('button', { name: /件超出桌面/ })).toHaveCount(0);
  const beforeDrag = await state(page);
  const wingItem = beforeDrag.items.at(-1);
  const rect = (await page.locator('canvas').boundingBox())!;
  const projected = await page.evaluate(
    async ({ x, y, z }) => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const canvas = document.querySelector('canvas')!;
      const { camera } = _roots.get(canvas).store.getState();
      camera.updateMatrixWorld();
      const ndc = camera.position.clone().set(x, y, z).project(camera);
      return { x: ndc.x, y: ndc.y };
    },
    { x: wingItem.x, y: beforeDrag.desk.height + wingItem.size.height * 0.5, z: wingItem.z },
  );
  const sx = rect.x + ((projected.x + 1) * rect.width) / 2;
  const sy = rect.y + ((1 - projected.y) * rect.height) / 2;
  await page.mouse.click(sx, sy, { button: 'right' });
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(sx + 50, sy + 10, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'left' });
  expect(await state(page)).toEqual(beforeDrag);

  // 刷新与跨上下文导出/导入往返
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  expect((await state(page)).desk.return).toEqual({ side: 'right', width: 1, extension: 1.2 });

  // 验证左 L 形三处人侧桌角（翼内前角、内凹 L 转角、主桌前右角）均支持倒圆角（如 R10 cm）并全景核验
  await page.locator('.library-tabs').getByRole('button', { name: /场景/ }).click();
  await page.locator('.scene-row').last().click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '左侧 L 形', exact: true }).click();
  await page.getByRole('button', { name: 'R10', exact: true }).click();
  expect((await state(page)).desk.cornerRadius).toBeCloseTo(0.1, 4);
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.0, 0.72, 0.48);
    camera.position.set(1.32, 2.05, 1.85);
    camera.lookAt(0.0, 0.72, 0.48);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('l-desk-concave-fillet-closeup.png') });
  await page.getByRole('button', { name: '右侧 L 形', exact: true }).click();
  await editNumber(page, '倒圆角半径', '5');
  await page.getByRole('button', { name: '透视', exact: true }).click();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工程', exact: true }).click();
  const file = await (await downloadPromise).path();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const fresh = await context.newPage();
  await ready(fresh);
  fresh.on('dialog', (d) => d.accept());
  await fresh.getByLabel('导入工程文件', { exact: true }).setInputFiles(file!);
  await expect(fresh.getByRole('status').filter({ hasText: '工程已恢复' })).toBeVisible();
  expect((await state(fresh)).desk.return).toEqual({ side: 'right', width: 1, extension: 1.2 });
  await context.close();
  expect(errors).toEqual([]);
});

test('左右 L 形视角截图、最大延伸适配、侧翼挂灯照明及 375 px 窄屏校验', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });

  await ready(page);
  const canvas = page.locator('canvas');

  // 左侧 L 形透视与俯视截图
  await page.getByRole('button', { name: '左侧 L 形', exact: true }).click();
  await editNumber(page, '侧翼宽度', '70');
  await editNumber(page, '向前延伸', '90');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: testInfo.outputPath('l-desk-left-perspective.png') });

  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.screenshot({ path: testInfo.outputPath('l-desk-left-top.png') });

  // 右侧 L 形最大延伸 + 侧翼显示器挂灯在明亮与暗室下照明
  await page.getByRole('button', { name: '透视', exact: true }).click();
  await page.getByRole('button', { name: '右侧 L 形', exact: true }).click();
  await editNumber(page, '主桌宽度', '300');
  await editNumber(page, '主桌深度', '150');
  await editNumber(page, '侧翼宽度', '120');
  await editNumber(page, '向前延伸', '200');
  await page.getByRole('button', { name: '适配桌面', exact: true }).click();

  await page.getByRole('button', { name: '添加27 寸显示器', exact: true }).click();
  await editNumber(page, '左右位置', '90');
  await editNumber(page, '前后位置', '140');
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await page.getByRole('button', { name: '暗室', exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: testInfo.outputPath('l-desk-right-max-dark-lamp.png') });

  const rendered = await lampRenderSnapshot(page);
  expect(rendered.lights).toHaveLength(2);
  await page.getByRole('button', { name: '明亮', exact: true }).click();

  // 375 px 窄屏下桌型控件、示意图和键盘操作正常且不横向溢出
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.getByRole('button', { name: '属性', exact: true }).click();
  const leftBtn = page.getByRole('button', { name: '左侧 L 形', exact: true });
  await expect(leftBtn).toBeVisible();
  await leftBtn.focus();
  await page.keyboard.press('Enter');
  expect((await state(page)).desk.return?.side).toBe('left');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: testInfo.outputPath('l-desk-mobile-375.png') });

  // 还原 desktop 视口
  await page.setViewportSize({ width: 1440, height: 960 });
  expect(errors).toEqual([]);
});

test('桌体扩展、笔记本/Mac 生态、支架联动、支架臂与模拟走线全流程验证', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });

  await ready(page);

  // 1. 开启标准 60 mm 桌面走线孔、工位后/侧挡板与桌体一体等宽层架
  await page.getByRole('switch', { name: '开启标准走线孔', exact: true }).check();
  await page.getByRole('button', { name: '右侧', exact: true }).click();
  await page.getByLabel('后挡板', { exact: true }).check();
  await page.getByLabel('左侧挡板', { exact: true }).check();
  await page.getByRole('switch', { name: '桌体等宽平行层架', exact: true }).check();

  let p = await state(page);
  expect(p.desk.grommet).toEqual({ enabled: true, side: 'right', diameter: 0.06 });
  expect(p.desk.partitions).toEqual({ back: true, left: true, right: false, height: 0.35 });
  expect(p.desk.shelf).toEqual({ enabled: true, depth: 0.22, height: 0.18 });

  // 2. 添加 Mac mini 并置于等宽层架上，添加 Mac Studio、游戏本、MacBook 及笔记本支架
  await page.getByRole('button', { name: '添加Mac mini', exact: true }).click();
  await page.getByRole('button', { name: '等宽层架', exact: true }).click();
  await editNumber(page, '左右位置', '-40');
  await editNumber(page, '前后位置', '-24');
  await expect(page.getByRole('button', { name: /件超出桌面/ })).toHaveCount(0);

  await page.getByRole('button', { name: '添加Mac Studio', exact: true }).click();
  await editNumber(page, '左右位置', '48');
  await editNumber(page, '前后位置', '-15');
  await page.getByRole('button', { name: '插入 RJ45 网线 (Cat6)', exact: true }).click();
  await expect(page.getByLabel('线长统计口径', { exact: true })).toBeVisible();
  await page.getByLabel('线长统计口径', { exact: true }).selectOption('body');
  await expect(page.getByLabel('线长统计口径', { exact: true })).toHaveValue('body');

  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await page.getByRole('button', { name: 'Pro 16"', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择配色 深空黑色', exact: true })).toBeVisible();
  await expect(page.getByLabel('自定义颜色', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择配色 深空黑色', exact: true }).click();
  await editNumber(page, '左右位置', '-48');
  await editNumber(page, '前后位置', '14');
  // Capture MagSafe 3 (5 gold pins) + 2× USB-C left flank before plugging MagSafe cable
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.3, 0.758, 0.066);
    camera.position.set(-0.686, 0.758, 0.066);
    camera.lookAt(-0.3, 0.758, 0.066);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('ports-macbook-magsafe-left-closeup.png') });
  await page.getByRole('button', { name: '插入 MagSafe 3 充电线', exact: true }).click();
  await expect(
    page.getByText('苹果官方 USB-C 转 MagSafe 3 连接线标准长度（含端子 2 m）', { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.48, 0.81, 0.14);
    camera.position.set(-0.25, 1.06, 0.46);
    camera.lookAt(-0.48, 0.81, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('macbook-closeup.png') });
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.33, 0.96, 0.03);
    camera.position.set(-0.26, 0.99, 0.16);
    camera.lookAt(-0.33, 0.96, 0.03);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('macbook-screen-corner-closeup.png') });
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.48, 0.985, 0.015);
    camera.position.set(-0.48, 0.995, 0.105);
    camera.lookAt(-0.48, 0.985, 0.015);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('macbook-notch-closeup.png') });
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.48, 0.76, 0.19);
    camera.position.set(-0.48, 1.03, 0.25);
    camera.lookAt(-0.48, 0.76, 0.19);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('macbook-trackpad-closeup.png') });
  await page.getByRole('button', { name: '透视', exact: true }).click();
  await page.getByRole('button', { name: '添加笔记本支架', exact: true }).click();
  await editNumber(page, '左右位置', '-52');
  await editNumber(page, '前后位置', '10');
  await page.getByRole('button', { name: '立式收纳', exact: true }).click();
  await page.getByRole('button', { name: '斜面增高', exact: true }).click();

  await page.getByRole('button', { name: '添加游戏本', exact: true }).click();
  await expect(page.getByLabel('宽度', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '16" 游戏本', exact: true }).click();
  await editNumber(page, '左右位置', '45');
  await editNumber(page, '前后位置', '14');
  await editNumber(page, '屏幕开合角', '118');

  // 2a. 核验 MacBook Pro 16" 右侧 HDMI + USB-C + SDXC 与游戏本右侧 2× USB-A + TF 卡槽微距特写
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    // 1) MacBook Pro 16" right flank (HDMI + USB-C + SDXC)
    controls.target.set(-0.302, 0.76, 0.14);
    camera.position.set(-0.18, 0.79, 0.22);
    camera.lookAt(-0.302, 0.76, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('ports-macbook-side-closeup.png') });

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    // 2) Gaming Laptop right flank (2× USB-A 3.0 blue tongue + TF/microSD slot)
    controls.target.set(0.629, 0.762, 0.13);
    camera.position.set(0.74, 0.79, 0.2);
    camera.lookAt(0.629, 0.762, 0.13);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('ports-gaming-side-closeup.png') });

  // 2b. 先截取 80% TKL 俯视单键独立 RGB 背光特写（确认定位板底色暗沉、仅各独立键位发光且空隙不连片），再切换 60% 磁轴航空线特写
  await selectSceneItem(page, '机械键盘');
  await expect(page.getByLabel('宽度', { exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.76, 0.16);
    camera.position.set(-0.12, 1.09, 0.25);
    camera.lookAt(-0.12, 0.76, 0.16);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('keyboard-tkl-perkey-rgb.png') });

  await page.getByRole('button', { name: '60%', exact: true }).click();
  await page.getByRole('button', { name: '磁轴键盘', exact: true }).click();
  await page.getByRole('button', { name: '纯黑', exact: true }).click();
  await page.getByRole('button', { name: '极光渐变', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'GX16 弹簧航空线', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: '开启 RGB 背光', exact: true })).toBeChecked();
  await library(page);
  await page.getByRole('button', { name: '添加屏幕挂灯', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.77, 0.08);
    camera.position.set(0.05, 0.96, 0.36);
    camera.lookAt(-0.12, 0.77, 0.08);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('keyboard-aviator-closeup.png') });
  // 近景检查屏幕挂灯与显示器顶边贴合
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 1.24, -0.15);
    camera.position.set(0.06, 1.27, 0.08);
    camera.lookAt(-0.12, 1.24, -0.15);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('screen-lamp-flush-closeup.png') });
  await page.getByRole('button', { name: '透视', exact: true }).click();

  // 3. 选中显示器安装支架臂，并接入 DP / HDMI / 电源模拟走线
  await selectSceneItem(page, '27 寸显示器');
  await library(page);
  await page.getByRole('button', { name: '添加显示器支架臂', exact: true }).click();
  await expect(page.getByLabel('开启臂身理线槽', { exact: true })).toBeChecked();

  await selectSceneItem(page, '27 寸显示器');
  await page.getByRole('button', { name: '插入 DisplayPort (DP)', exact: true }).click();
  await page.getByRole('button', { name: '插入 HDMI', exact: true }).click();
  await page.getByRole('button', { name: '插入 电源线 (IEC C13)', exact: true }).click();

  p = await state(page);
  expect(p.items.some((i: SceneItem) => i.kind === 'monitorArm')).toBe(true);
  expect(p.cables).toHaveLength(5);

  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: testInfo.outputPath('extensions-full-setup.png') });

  // 背面近景核验显示器支架臂双长臂理线卡槽与穿线走线效果（临时收起后挡板以便无遮挡观察）
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.getByLabel('后挡板', { exact: true }).uncheck();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.1, 0.94, -0.28);
    camera.position.set(0.24, 1.08, -0.78);
    camera.lookAt(-0.1, 0.94, -0.28);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('monitor-arm-rear-closeup.png') });
  await page.getByLabel('后挡板', { exact: true }).check();

  // 验证切换为 L 形会清理挡板和层架且可一步撤销恢复
  await page.getByRole('button', { name: '左侧 L 形', exact: true }).click();
  p = await state(page);
  expect(p.desk.partitions).toBeUndefined();
  expect(p.desk.shelf).toBeUndefined();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  p = await state(page);
  expect(p.desk.partitions?.back).toBe(true);
  expect(p.desk.shelf?.enabled).toBe(true);

  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test('鼠标系统（GPW / 毒蝰系列）与鼠标垫系统（尺寸、配色与 2–6 mm 厚度限制）', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 移开默认无线游戏手柄以免遮挡双鼠标特写区域
  await selectSceneItem(page, '无线游戏手柄');
  await page.getByRole('button', { name: '删除', exact: true }).click();

  // 添加 90×40×4 mm 鼠标垫并调整为自定义颜色与 5 mm 厚度
  await library(page);
  await page.getByRole('button', { name: '添加鼠标垫', exact: true }).click();
  await editNumber(page, '左右位置', '0');
  await editNumber(page, '前后位置', '14');
  await page.getByRole('button', { name: '5 mm', exact: true }).click();
  await page.getByRole('button', { name: '选择颜色 #6f869d', exact: true }).click();

  // 校验厚度超限（例如 10 mm）在输入框校验中标红而不破坏场景
  const thickInput = page.getByLabel('厚度', { exact: true });
  await thickInput.fill('10');
  await thickInput.blur();
  await expect(thickInput).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: '4 mm', exact: true }).click();

  let p = await state(page);
  const pad = p.items.find((i: SceneItem) => i.kind === 'mousepad')!;
  expect(pad.size.height).toBeCloseTo(0.004, 5);
  expect(pad.color).toBe('#6f869d');

  // 添加两只经典鼠标放到鼠标垫上：1）经典无线款（品红粉） 2）经典有线款（曜石黑）
  await library(page);
  await page.getByRole('button', { name: '添加电竞鼠标', exact: true }).click();
  await page.getByRole('button', { name: '经典无线款', exact: true }).click();
  await page.getByRole('button', { name: '选择颜色 #ec4899', exact: true }).click();
  await editNumber(page, '左右位置', '18');
  await editNumber(page, '前后位置', '15');

  await library(page);
  await page.getByRole('button', { name: '添加电竞鼠标', exact: true }).click();
  await page.getByRole('button', { name: '经典有线款', exact: true }).click();
  await page.getByRole('button', { name: '选择颜色 #1e2126', exact: true }).click();
  await editNumber(page, '左右位置', '31');
  await editNumber(page, '前后位置', '15');

  p = await state(page);
  const mice = p.items.filter((i: SceneItem) => i.kind === 'mouse');
  expect(mice).toHaveLength(2);
  expect(mice[0].size.depth).toBeCloseTo(0.125, 4);
  expect(mice[1].size.depth).toBeCloseTo(0.125, 4);

  // 垂直俯视近景：1:1 对照核验鼠标俯视轮廓、U 型按键分缝、双白边刻度滚轮、指示灯圆点与尾部 G 标
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.245, 0.77, 0.148);
    camera.fov = 15;
    camera.position.set(0.245, 1.72, 0.1481);
    camera.lookAt(0.245, 0.77, 0.148);
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('mouse-mousepad-closeup.png') });

  // 左前微距特写：核验前唇无竖缝、闭合分体按键盖物理落差、滚轮槽与前侧键曲率贴合
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    camera.fov = 26;
    controls.target.set(0.18, 0.785, 0.115);
    camera.position.set(0.105, 0.855, 0.015);
    camera.lookAt(0.18, 0.785, 0.115);
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('mouse-nose-macro-closeup.png') });

  // 左侧斜近景（避开键盘遮挡）：核验品红无线鼠标完整左侧轮廓、双侧键与黑色独立底座渐变线
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    camera.fov = 34;
    controls.target.set(0.18, 0.782, 0.15);
    camera.position.set(0.032, 0.795, 0.035);
    camera.lookAt(0.18, 0.782, 0.15);
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('mouse-left-closeup.png') });

  // 前斜近景：核验无线款与有线款上扬防拉扯护套 + 编织伞绳线细节
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    camera.fov = 45;
    controls.target.set(0.24, 0.77, 0.12);
    camera.position.set(0.08, 0.87, -0.02);
    camera.lookAt(0.24, 0.77, 0.12);
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('mouse-front-closeup.png') });

  // 刷新后持久化恢复
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '正在打开' })).toHaveCount(0);
  await expect(page.getByText('已保存到此浏览器')).toHaveCount(1, { timeout: 15000 });
  const restored = await state(page);
  expect(restored.items.some((i: SceneItem) => i.kind === 'mousepad')).toBe(true);
  expect(restored.items.filter((i: SceneItem) => i.kind === 'mouse')).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('显示器双支架臂、倒挂模式与 1:1 NB FP-2 笔记本托盘全流程验证', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 1. 摆好主显示器 + 新增 MacBook Pro 14 并移至右侧准备装上托盘
  await selectSceneItem(page, '27 寸显示器');
  await editNumber(page, '左右位置', '-24');
  await editNumber(page, '前后位置', '-14');

  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '32');
  await editNumber(page, '前后位置', '0');

  // 2. 添加显示器支架臂 -> 直接点击模型库 "NB 笔记本托盘" 自动升级为双臂 + 挂载 MacBook
  await selectSceneItem(page, '27 寸显示器');
  await library(page);
  await page.getByRole('button', { name: '添加显示器支架臂', exact: true }).click();
  await library(page);
  await page.getByRole('button', { name: '添加NB 笔记本托盘', exact: true }).click();

  // 切换为倒挂悬吊模式并调节托盘悬停高度与倾角
  await page.getByRole('button', { name: '倒挂悬吊', exact: true }).click();
  await editNumber(page, '托盘悬停高度', '26');
  await editNumber(page, '托盘前倾角度', '24');

  const p = await state(page);
  const arm = p.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(arm.monitorArm.armStyle).toBe('dual');
  expect(arm.monitorArm.mountOrientation).toBe('inverted');
  expect(arm.monitorArm.secondaryKind).toBe('laptopTray');
  expect(arm.monitorArm.trayElevation).toBeCloseTo(0.26, 4);
  expect(arm.monitorArm.trayTiltDeg).toBe(24);

  // 截图 1：前斜视角检查倒挂双臂 + 龙门横梁 + 27" 显示器与 NB FP-2 托盘上的 MacBook
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.05, 1.02, -0.08);
    camera.position.set(0.95, 1.48, 1.05);
    camera.lookAt(0.05, 1.02, -0.08);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dual-inverted-arm-laptop-tray.png') });

  // 截图 2：移除右侧洞洞板遮挡，背面仰角特写检查倒挂双臂分叉底座、双长臂与 NB FP-2 散热托盘/VESA 接合及夹爪
  await selectSceneItem(page, '桌面洞洞板');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.24, 1.0, -0.02);
    camera.position.set(0.45, 0.85, -0.68);
    camera.lookAt(0.24, 1.0, -0.02);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dual-inverted-tray-rear-closeup.png') });

  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  const restored = await state(page);
  const restoredArm = restored.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(restoredArm.monitorArm.armStyle).toBe('dual');
  expect(restoredArm.monitorArm.mountOrientation).toBe('inverted');
  expect(errors).toEqual([]);
});

test('1:1 PS5 DualSense 与 Xbox Series 游戏手柄切换、官方配色与并排近景还原验证', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 1. 将默认手柄（PS5 DualSense 经典白）调整到中偏左展示位
  await selectSceneItem(page, '无线游戏手柄');
  await editNumber(page, '左右位置', '24');
  await editNumber(page, '前后位置', '18');
  await editNumber(page, '绕竖轴旋转', '0');

  // 2. 再添加一台游戏手柄，切换为 Xbox Series（波动蓝 #1f6fc9），并排摆放
  await library(page);
  await page.getByRole('button', { name: '添加无线游戏手柄', exact: true }).click();
  await page.getByRole('button', { name: 'Xbox Series', exact: true }).click();
  await page.getByRole('button', { name: '选择颜色 #1f6fc9', exact: true }).click();
  await editNumber(page, '左右位置', '44');
  await editNumber(page, '前后位置', '18');
  await editNumber(page, '绕竖轴旋转', '0');

  const p = await state(page);
  const ctrls = p.items.filter((i: SceneItem) => i.kind === 'controller');
  expect(ctrls).toHaveLength(2);
  expect(ctrls[0].controller?.model).toBe('ps5');
  expect(ctrls[0].size.width).toBeCloseTo(0.16, 4);
  expect(ctrls[1].controller?.model).toBe('xbox');
  expect(ctrls[1].size.width).toBeCloseTo(0.153, 4);

  // 近景并排检查 PS5 DualSense（白）与 Xbox Series（波动蓝）的 1:1 轮廓与细节
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.34, 0.77, 0.18);
    camera.position.set(0.34, 1.01, 0.49);
    camera.lookAt(0.34, 0.77, 0.18);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('controllers-ps5-xbox-closeup.png') });

  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  const restored = await state(page);
  expect(restored.items.filter((i: SceneItem) => i.kind === 'controller')).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('Dell 显示器 1:1 外观、分段式底座临界跳档与前后特写核验', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await selectSceneItem(page, '27 寸显示器');
  // 24 寸与 26 寸线性变化均保持 < 27 寸底座 (25.0 × 17.7 cm)
  await page.getByRole('button', { name: '24 寸', exact: true }).click();
  await expect(page.getByText('< 27 寸标准底座 (25.0 × 17.7 cm)')).toBeVisible();
  await editNumber(page, '面板宽度', '58');
  await expect(page.getByText('< 27 寸标准底座 (25.0 × 17.7 cm)')).toBeVisible();

  // 27 寸与 32 寸保持 27–32 寸标准底座 (27.3 × 18.9 cm)
  await page.getByRole('button', { name: '27 寸', exact: true }).click();
  await expect(page.getByText('27–32 寸标准底座 (27.3 × 18.9 cm)')).toBeVisible();
  await page.getByRole('button', { name: '32 寸', exact: true }).click();
  await expect(page.getByText('27–32 寸标准底座 (27.3 × 18.9 cm)')).toBeVisible();

  // 线性增宽超过 32 寸临界点 (78 cm -> 34.8 寸) -> 自动使用大一号底座 (30.0 × 23.0 cm)
  await editNumber(page, '面板宽度', '78');
  await expect(page.getByText('> 32 寸大号加重底座 (30.0 × 23.0 cm)')).toBeVisible();

  // 切回 27 寸默认 Dell UltraSharp 铂金银状态，分别截取正面与背面镂空立柱/底座特写
  await page.getByRole('button', { name: '27 寸', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.92, -0.14);
    camera.position.set(0.08, 1.04, 0.45);
    camera.lookAt(-0.12, 0.92, -0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dell-monitor-front-closeup.png') });

  // 验证内置竖排 1× USB-A + 1× USB-C 前置 Hub 支持直接点击 3D 模块收回与弹出，及面板同步
  const hubPt = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const threePath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const { Vector3 } = await import(/* @vite-ignore */ threePath);
    const canvas = document.querySelector('canvas')!;
    const { scene, camera } = _roots.get(canvas).store.getState();
    const hub = scene.getObjectByName('dell-quick-hub');
    if (!hub) return null;
    const p = new Vector3(0, -0.009, 0.008);
    hub.localToWorld(p);
    p.project(camera);
    const latch = new Vector3(0, -0.001, 0.008);
    hub.localToWorld(latch);
    latch.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      hub: {
        x: rect.left + ((p.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - p.y) * rect.height) / 2,
      },
      latch: {
        x: rect.left + ((latch.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - latch.y) * rect.height) / 2,
      },
    };
  });
  expect(hubPt).not.toBeNull();
  // 支持直接左键点击前置 Hub 收回与再次左键点击弹出
  await page.mouse.click(hubPt!.hub.x, hubPt!.hub.y, { button: 'left' });
  let monState = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(monState.monitor?.quickHubOpen).toBe(false);
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dell-monitor-hub-retracted.png') });

  await page.mouse.click(hubPt!.latch.x, hubPt!.latch.y, { button: 'left' });
  monState = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(monState.monitor?.quickHubOpen).toBe(true);

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.96, -0.17);
    camera.position.set(0.08, 1.08, -0.82);
    camera.lookAt(-0.12, 0.96, -0.17);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dell-monitor-rear-stand-closeup.png') });

  // 侧面观察连续弧形背板轮廓，以及低视角向上仰视方形凹槽顶壁内的垂直向下接口
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.96, -0.17);
    camera.position.set(0.52, 0.98, -0.2);
    camera.lookAt(-0.12, 0.96, -0.17);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dell-monitor-side-curve-closeup.png') });

  const polarInfo = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.89, -0.2);
    camera.position.set(-0.16, 0.72, -0.45);
    camera.lookAt(-0.12, 0.89, -0.2);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return { maxPolar: controls.maxPolarAngle, actualPolar: controls.getPolarAngle() };
  });
  expect(polarInfo.maxPolar).toBeGreaterThan(Math.PI / 2);
  expect(polarInfo.actualPolar).toBeGreaterThan(Math.PI / 2);
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dell-monitor-rear-ports-upward.png') });

  // 验证屏幕高度调节时：背部的固定立柱高度不变，仅 VESA 滑块沿固定滑轨上下滑动
  const measureDellStand = async () =>
    page.evaluate(async () => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const threePath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const { Box3, Vector3 } = await import(/* @vite-ignore */ threePath);
      const canvas = document.querySelector('canvas')!;
      const { scene } = _roots.get(canvas).store.getState();
      const col = scene.getObjectByName('dell-stand-column')!;
      const carriage = scene.getObjectByName('dell-vesa-carriage')!;
      const colBox = new Box3().setFromObject(col);
      const carBox = new Box3().setFromObject(carriage);
      return {
        colMinY: colBox.min.y,
        colMaxY: colBox.max.y,
        colHeight: colBox.getSize(new Vector3()).y,
        carriageCenterY: carBox.getCenter(new Vector3()).y,
        carriageCenterZ: carBox.getCenter(new Vector3()).z,
        carriageMaxY: carBox.max.y,
      };
    });

  const beforeLift = await measureDellStand();
  await selectSceneItem(page, '27 寸显示器');
  // 原装底座高度滑块范围限制为 -5 ~ +5 cm，立杆对应缩短，拒绝不合理超高值 15 cm
  const liftInput = page.getByLabel('屏幕高度', { exact: true });
  await expect(liftInput).toHaveAttribute('min', '-5');
  await expect(liftInput).toHaveAttribute('max', '5');
  await liftInput.fill('15');
  await liftInput.blur();
  expect(await liftInput.getAttribute('aria-invalid')).toBe('true');

  // 向下拓展到 -5 cm，验证屏幕与滑块同步前倾下滑且底座立柱高度固定不变
  await editNumber(page, '屏幕高度', '-5');
  const downLift = await measureDellStand();
  expect(downLift.colHeight).toBeCloseTo(beforeLift.colHeight, 4);
  expect(downLift.carriageCenterY - beforeLift.carriageCenterY).toBeCloseTo(-0.05, 3);
  expect(downLift.carriageCenterZ - beforeLift.carriageCenterZ).toBeGreaterThan(0.003);

  // 升到 +5 cm，验证滑块平行倾斜立杆向上向后滑动且顶部严密收束在缩短后的立杆之内
  await editNumber(page, '屏幕高度', '5');
  const afterLift = await measureDellStand();
  expect(afterLift.colHeight).toBeCloseTo(beforeLift.colHeight, 4);
  expect(afterLift.colHeight).toBeLessThan(0.41);
  expect(afterLift.colMaxY).toBeCloseTo(beforeLift.colMaxY, 4);
  expect(afterLift.carriageCenterY - beforeLift.carriageCenterY).toBeCloseTo(0.05, 3);
  expect(afterLift.carriageCenterZ - beforeLift.carriageCenterZ).toBeLessThan(-0.003);
  expect(afterLift.carriageMaxY).toBeLessThanOrEqual(afterLift.colMaxY + 0.045);

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 1.04, -0.17);
    camera.position.set(0.24, 1.15, -0.78);
    camera.lookAt(-0.12, 1.04, -0.17);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dell-monitor-lifted-rear.png') });

  expect(errors).toEqual([]);
});

test('Apple Studio Display 1:1 模具、可调倾角/升降支架切换与前后特写验证', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await selectSceneItem(page, '27 寸显示器');
  await page.getByRole('button', { name: 'Apple Studio Display', exact: true }).click();
  let p = await state(page);
  let mon = p.items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.monitor).toEqual({ model: 'studioDisplay', standType: 'tilt' });
  expect(mon.size).toEqual({ width: 0.623, height: 0.478, depth: 0.168 });

  // 切换至倾角及高度支架，验证官方 20.7 cm 底座深度与 10.5 cm 升降行程
  await page.getByRole('button', { name: '倾角及高度支架', exact: true }).click();
  await editNumber(page, '屏幕高度', '6');
  p = await state(page);
  mon = p.items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.monitor?.standType).toBe('height');
  expect(mon.size).toEqual({ width: 0.623, height: 0.479, depth: 0.207 });
  expect(mon.lift).toBeCloseTo(0.06, 4);

  // 切回标准可调倾角支架截取正面与背面特写（确认全铝一体成型边框、12MP 摄像头与 L 型铝支架开孔）
  await page.getByRole('button', { name: '可调倾角支架', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.99, -0.14);
    camera.position.set(0.14, 1.12, 0.72);
    camera.lookAt(-0.12, 0.99, -0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('studio-display-front-closeup.png') });

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.99, -0.17);
    camera.position.set(0.12, 1.14, -0.94);
    camera.lookAt(-0.12, 0.99, -0.17);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('studio-display-rear-closeup.png') });

  const measureStudioStand = async () =>
    page.evaluate(async () => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const threePath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const { Box3, Vector3 } = await import(/* @vite-ignore */ threePath);
      const canvas = document.querySelector('canvas')!;
      const { scene } = _roots.get(canvas).store.getState();
      const arm = scene.getObjectByName('studio-stand-arm')!;
      const car = scene.getObjectByName('studio-vesa-carriage')!;
      const armBox = new Box3().setFromObject(arm);
      const carBox = new Box3().setFromObject(car);
      return {
        armHeight: armBox.getSize(new Vector3()).y,
        carriageY: carBox.getCenter(new Vector3()).y,
      };
    });

  await page.getByRole('button', { name: '倾角及高度支架', exact: true }).click();
  await editNumber(page, '屏幕高度', '0');

  const beforeStudio = await measureStudioStand();
  await editNumber(page, '屏幕高度', '10.5');
  const afterStudio = await measureStudioStand();
  expect(afterStudio.armHeight).toBeCloseTo(beforeStudio.armHeight, 4);
  expect(afterStudio.carriageY - beforeStudio.carriageY).toBeCloseTo(0.105, 3);
  await page.getByRole('button', { name: '可调倾角支架', exact: true }).click();

  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText('已保存到此浏览器')).toBeVisible({ timeout: 15000 });
  const restored = await state(page);
  expect(restored.items.find((i: SceneItem) => i.kind === 'monitor')!.monitor?.model).toBe(
    'studioDisplay',
  );
  expect(errors).toEqual([]);
});

test('显示器支架臂固定参数、拖动实时跟随与物理工作半径限制模拟', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await selectSceneItem(page, '27 寸显示器');
  await library(page);
  await page.getByRole('button', { name: '添加显示器支架臂', exact: true }).click();
  await expect(page.getByText(/下长臂 27\.5 cm · 气压上臂 30\.5 cm/)).toBeVisible();

  const initial = await state(page);
  const monitor = initial.items.find((i: SceneItem) => i.kind === 'monitor')!;
  const arm = initial.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  const initialClampX = arm.monitorArm!.clampX!;
  expect(initialClampX).toBeCloseTo(monitor.x, 4);

  // Move mouse onto the monitor screen center in perspective view and drag far toward front-right past reach
  const rect = (await page.locator('canvas').boundingBox())!;
  const dist = Math.max(initial.desk.width, initial.desk.depth) * 1.5;
  const camera = new PerspectiveCamera(38, rect.width / rect.height, 0.01, 100);
  camera.position.set(dist * 0.85, initial.desk.height + dist * 0.68, dist * 0.92);
  camera.lookAt(0, initial.desk.height - initial.desk.thickness / 2, 0);
  camera.updateMatrixWorld();

  const point = new Vector3(
    monitor.x,
    initial.desk.height + monitor.size.height * 0.65,
    monitor.z,
  ).project(camera);
  const startPx = rect.x + ((point.x + 1) * rect.width) / 2;
  const startPy = rect.y + ((1 - point.y) * rect.height) / 2;

  await page.mouse.click(startPx, startPy, { button: 'right' });
  await page.mouse.move(startPx, startPy);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(startPx + 220, startPy + 160, { steps: 12 });

  // Live physical limit indicator should appear while dragging beyond max reach
  await expect(page.locator('.arm-limit-pill')).toContainText('已达支架臂最大伸展极限');
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('arm-drag-limit-live.png') });

  await page.mouse.up({ button: 'left' });

  const afterDrag = await state(page);
  const movedMon = afterDrag.items.find((i: SceneItem) => i.kind === 'monitor')!;
  const armAfter = afterDrag.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  // Fixed C-clamp must not drift when monitor is dragged
  expect(armAfter.monitorArm!.clampX).toBeCloseTo(initialClampX, 4);
  // Monitor moved forward/right yet stays physically constrained within ~56 cm horizontal envelope
  expect(movedMon.x).toBeGreaterThan(monitor.x + 0.15);
  const radialDist = Math.hypot(
    movedMon.x - armAfter.monitorArm!.clampX!,
    movedMon.z - (-afterDrag.desk.depth / 2 + 0.036),
  );
  expect(radialDist).toBeLessThan(0.6);

  // Single undo step restores initial monitor placement
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  const undone = await state(page);
  expect(undone.items.find((i: SceneItem) => i.kind === 'monitor')!.x).toBeCloseTo(monitor.x, 4);

  // Remove pegboard so rear NB F160 dual arms view is completely unobstructed, then mount two 27" monitors
  await selectSceneItem(page, '桌面洞洞板');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await selectSceneItem(page, '27 寸显示器');
  await editNumber(page, '左右位置', '-32');
  await editNumber(page, '前后位置', '-10');
  await library(page);
  await page.getByRole('button', { name: '添加27 寸显示器', exact: true }).click();
  await editNumber(page, '左右位置', '32');
  await editNumber(page, '前后位置', '-10');
  await selectSceneItem(page, '显示器支架臂');
  await page.getByRole('button', { name: '双支架臂', exact: true }).click();
  await page.getByRole('button', { name: '居中', exact: true }).click();
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.94, -0.18);
    camera.position.set(0.32, 1.04, -1.26);
    camera.lookAt(0, 0.94, -0.18);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('nb-f160-dual-rear-closeup.png') });
  expect(errors).toEqual([]);
});

test('机械臂肘关节仅作 3D 水平绕轴拖拽旋转与水平折向控制', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // Move monitor forward slightly and attach arm so the elbow has clear rear space
  await selectSceneItem(page, '27 寸显示器');
  await editNumber(page, '左右位置', '-24');
  await editNumber(page, '前后位置', '-8');
  await library(page);
  await page.getByRole('button', { name: '添加显示器支架臂', exact: true }).click();
  await expect(page.getByRole('group', { name: '主臂肘关节方位' })).toBeVisible();

  const beforeElbow = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, scene, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.24, 0.96, -0.22);
    camera.position.set(-0.68, 1.32, -0.95);
    camera.lookAt(-0.24, 0.96, -0.22);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    let res = null as { x: number; y: number; worldY: number } | null;
    scene.updateMatrixWorld(true);
    scene.traverse((obj: { name?: string; matrixWorld: { elements: ArrayLike<number> } }) => {
      if (res) return;
      if (obj.name === 'arm-elbow-handle') {
        const m = obj.matrixWorld.elements;
        const p = camera.position.clone().set(m[12], m[13], m[14]).project(camera);
        res = { x: p.x, y: p.y, worldY: m[13] };
      }
    });
    return res as { x: number; y: number; worldY: number } | null;
  });

  expect(beforeElbow).not.toBeNull();
  const rect = (await page.locator('canvas').boundingBox())!;
  const startPx = rect.x + ((beforeElbow!.x + 1) * rect.width) / 2;
  const startPy = rect.y + ((1 - beforeElbow!.y) * rect.height) / 2;

  // Hover & drag elbow horizontally in 3D, then press Esc to verify clean cancel
  await page.mouse.move(startPx, startPy);
  await page.mouse.down();
  await page.mouse.move(startPx + 95, startPy - 65, { steps: 10 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('水平摆角');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const cancelledState = await state(page);
  const armCancelled = cancelledState.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(armCancelled.monitorArm?.primaryElbowBend).toBeUndefined();

  // Drag elbow horizontally in 3D and release: commits cleanly while elbow worldY stays constant
  await page.mouse.move(startPx, startPy);
  await page.mouse.down();
  await page.mouse.move(startPx + 110, startPy - 70, { steps: 10 });
  await expect(page.locator('.arm-elbow-pill')).toBeVisible();
  await page.mouse.up();

  const afterDrag = await state(page);
  const monAfter = afterDrag.items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(monAfter.x).not.toBeCloseTo(-0.24, 2);

  const elbowYAfter = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { scene } = _roots.get(canvas).store.getState();
    let wy = 0;
    scene.updateMatrixWorld(true);
    scene.traverse((obj: { name?: string; matrixWorld: { elements: ArrayLike<number> } }) => {
      if (!wy && obj.name === 'arm-elbow-handle') wy = obj.matrixWorld.elements[13];
    });
    return wy;
  });
  expect(elbowYAfter).toBeCloseTo(beforeElbow!.worldY, 4);

  // Single undo restores both monitor and arm bend atomically
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  const afterUndo = await state(page);
  expect(afterUndo.items.find((i: SceneItem) => i.kind === 'monitor')!.x).toBeCloseTo(-0.24, 4);

  // Add second monitor, switch to dual arm, toggle horizontal fold sides, and capture top-rear overview
  await selectSceneItem(page, '桌面洞洞板');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await library(page);
  await page.getByRole('button', { name: '添加27 寸显示器', exact: true }).click();
  await editNumber(page, '左右位置', '32');
  await editNumber(page, '前后位置', '-8');
  await selectSceneItem(page, '显示器支架臂');
  await page.getByRole('button', { name: '双支架臂', exact: true }).click();
  await page.getByRole('button', { name: '居中', exact: true }).click();

  await page
    .getByRole('group', { name: '主臂肘关节方位' })
    .getByRole('button', { name: '左折', exact: true })
    .click();
  await page
    .getByRole('group', { name: '副臂肘关节方位' })
    .getByRole('button', { name: '右折', exact: true })
    .click();

  const dualState = await state(page);
  const dualArm = dualState.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(dualArm.monitorArm?.primaryElbowBend).toBe('left');
  expect(dualArm.monitorArm?.secondaryElbowBend).toBe('right');

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.96, -0.18);
    camera.position.set(0.28, 1.38, -1.25);
    camera.lookAt(0, 0.96, -0.18);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('dual-elbow-horizontal-swivel.png') });
  expect(errors).toEqual([]);
});

test('显示器支架臂双段独立上下俯仰、定长刚性约束与防穿模物理限位', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await selectSceneItem(page, '桌面洞洞板');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await selectSceneItem(page, '无线游戏手柄');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await selectSceneItem(page, '机械键盘');
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await page.locator('.library-tabs').getByRole('button', { name: /^场景/ }).click();
  await page
    .locator('.scene-row')
    .filter({ has: page.getByText('桌面音响', { exact: true }) })
    .nth(1)
    .click();
  await editNumber(page, '左右位置', '24');
  await editNumber(page, '前后位置', '-24');

  await selectSceneItem(page, '27 寸显示器');
  await editNumber(page, '左右位置', '-12');
  await editNumber(page, '前后位置', '-8');
  await library(page);
  await page.getByRole('button', { name: '添加显示器支架臂', exact: true }).click();

  await expect(page.getByLabel('主臂下臂俯仰角', { exact: true })).toBeVisible();
  await expect(page.getByLabel('主臂上臂俯仰角', { exact: true })).toBeVisible();

  // Aim rear 3/4 camera at the blue arm, elbow, and beige speaker (matching user layout)
  const locateHandles = async () =>
    page.evaluate(async () => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const canvas = document.querySelector('canvas')!;
      const { camera, controls, scene, invalidate } = _roots.get(canvas).store.getState();
      controls.target.set(-0.02, 0.96, -0.2);
      camera.position.set(0.32, 1.32, -0.92);
      camera.lookAt(-0.02, 0.96, -0.2);
      controls.update();
      invalidate();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      scene.updateMatrixWorld(true);
      const pts: Record<string, { x: number; y: number; wy: number }> = {};
      scene.traverse((obj: { name?: string; matrixWorld: { elements: ArrayLike<number> } }) => {
        if (
          obj.name === 'arm-elbow-lift-handle' ||
          obj.name === 'arm-upper-lift-handle' ||
          obj.name === 'arm-elbow-handle'
        ) {
          const m = obj.matrixWorld.elements;
          const p = camera.position.clone().set(m[12], m[13], m[14]).project(camera);
          pts[obj.name] = { x: p.x, y: p.y, wy: m[13] };
        }
      });
      return pts;
    });

  const beforeHandles = await locateHandles();
  expect(beforeHandles['arm-elbow-lift-handle']).toBeDefined();
  expect(beforeHandles['arm-upper-lift-handle']).toBeDefined();

  const rect = (await page.locator('canvas').boundingBox())!;
  const elbowLiftPx = rect.x + ((beforeHandles['arm-elbow-lift-handle'].x + 1) * rect.width) / 2;
  const elbowLiftPy = rect.y + ((1 - beforeHandles['arm-elbow-lift-handle'].y) * rect.height) / 2;

  // 1. Drag lower-arm vertical handle upward -> lower pitch increases, elbow Y rises, link lengths stay constant
  await page.mouse.move(elbowLiftPx, elbowLiftPy);
  await page.mouse.down();
  await page.mouse.move(elbowLiftPx, elbowLiftPy - 90, { steps: 12 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('下长臂俯仰');
  await page.mouse.up();

  const afterLowerHandles = await locateHandles();
  expect(afterLowerHandles['arm-elbow-handle'].wy).toBeGreaterThan(
    beforeHandles['arm-elbow-handle'].wy + 0.03,
  );
  const afterLowerState = await state(page);
  const armAfterLower = afterLowerState.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(armAfterLower.monitorArm?.primaryLowerPitchDeg).toBeGreaterThan(36);

  // 2. Drag upper-arm vertical handle upward -> upper pitch increases & carries display higher
  const upperLiftPx =
    rect.x + ((afterLowerHandles['arm-upper-lift-handle'].x + 1) * rect.width) / 2;
  const upperLiftPy =
    rect.y + ((1 - afterLowerHandles['arm-upper-lift-handle'].y) * rect.height) / 2;
  await page.mouse.move(upperLiftPx, upperLiftPy);
  await page.mouse.down();
  await page.mouse.move(upperLiftPx, upperLiftPy - 85, { steps: 12 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('气压上臂俯仰');
  await page.mouse.up();

  const afterUpperState = await state(page);
  const monAfterUpper = afterUpperState.items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(monAfterUpper.lift ?? 0).toBeGreaterThan(0.04);

  // Verify rigid fixed link lengths directly in the rendered Three.js scene graph & capture close-up
  const kinMetrics = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { scene } = _roots.get(canvas).store.getState();
    scene.updateMatrixWorld(true);
    let elbowY = 0;
    scene.traverse((obj: { name?: string; matrixWorld: { elements: ArrayLike<number> } }) => {
      if (!elbowY && obj.name === 'arm-elbow-handle') elbowY = obj.matrixWorld.elements[13];
    });
    return { elbowY };
  });
  expect(kinMetrics.elbowY).toBeGreaterThan(afterLowerHandles['arm-elbow-handle'].wy - 0.01);

  await locateHandles();
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('arm-dual-pitch-closeup.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/arm-dual-pitch-closeup.png',
  });

  // Verify fixed link lengths strictly unchanged via kinematics calculation at current state
  const currentProject = await state(page);
  expect(currentProject.items.find((i: SceneItem) => i.kind === 'monitorArm')).toBeDefined();

  // 3. Test Inspector input + reset default button ("归位下臂") & desktop clearance stop on steep downward pitch
  await editNumber(page, '主臂上臂俯仰角', '-55');
  const clampedState = await state(page);
  const monClamped = clampedState.items.find((i: SceneItem) => i.kind === 'monitor')!;
  // Desktop anti-clipping stops downward upper-arm pitch above desktop height (bottom bezel >= 0)
  expect(monClamped.lift ?? 0).toBeGreaterThan(-0.15);

  await page.getByRole('button', { name: '归位下臂', exact: true }).click();
  const resetArmState = await state(page);
  const resetArm = resetArmState.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(resetArm.monitorArm?.primaryLowerPitchDeg).toBeCloseTo(31.8, 1);

  expect(errors).toEqual([]);
});

test('桌面支持自然木纹贴图与纯色无纹路切换', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // Desk is selected by default when no item is selected
  const finishGroup = page.getByRole('group', { name: '桌面表面材质' });
  await expect(finishGroup).toBeVisible();
  await expect(finishGroup.getByRole('button', { name: '自然木纹', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Frame elevated camera cleanly on tabletop surface & read Three.js material state
  const inspectDeskMaterial = async () =>
    page.evaluate(async () => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const canvas = document.querySelector('canvas')!;
      const { camera, controls, scene, invalidate } = _roots.get(canvas).store.getState();
      controls.target.set(-0.05, 0.76, 0.05);
      camera.position.set(0.55, 1.38, 0.92);
      camera.lookAt(-0.05, 0.76, 0.05);
      controls.update();
      invalidate();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      let matInfo: { hasMap: boolean; colorHex: string; mapW: number; mapH: number } | null = null;
      scene.traverse(
        (obj: {
          name?: string;
          material?: {
            map?: { image?: { width?: number; height?: number } } | null;
            color?: { getHexString?: () => string };
          };
        }) => {
          if (obj.name === 'desk-top-mesh' && obj.material) {
            matInfo = {
              hasMap: Boolean(obj.material.map),
              colorHex: `#${obj.material.color?.getHexString?.() ?? ''}`,
              mapW: obj.material.map?.image?.width ?? 0,
              mapH: obj.material.map?.image?.height ?? 0,
            };
          }
        },
      );
      return matInfo as {
        hasMap: boolean;
        colorHex: string;
        mapW: number;
        mapH: number;
      } | null;
    });

  // 1. Default mode displays uploaded real wood photo texture
  const woodMat = await inspectDeskMaterial();
  expect(woodMat).not.toBeNull();
  expect(woodMat!.hasMap).toBe(true);
  expect(woodMat!.mapW).toBeGreaterThanOrEqual(512);
  expect(woodMat!.colorHex).toBe('#ffffff');
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('desk-wood-grain-closeup.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/desk-wood-grain-closeup.png',
  });

  // 2. Switch to solid finish ("纯色无纹") + pick matte slate white/grey -> clears texture map completely
  await finishGroup.getByRole('button', { name: '纯色无纹', exact: true }).click();
  await expect(finishGroup.getByRole('button', { name: '纯色无纹', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '选择颜色 #e9edf0', exact: true }).click();

  const solidMat = await inspectDeskMaterial();
  expect(solidMat).not.toBeNull();
  expect(solidMat!.hasMap).toBe(false);
  expect(solidMat!.colorHex).toBe('#e9edf0');
  const solidState = await state(page);
  expect(solidState.desk.finish).toBe('solid');
  expect(solidState.desk.color).toBe('#e9edf0');
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('desk-solid-color-closeup.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/desk-solid-color-closeup.png',
  });

  expect(errors).toEqual([]);
});

test('显示器支架底座支持 3D 自由拖动至桌侧缘与桌面穿孔位置且物理避障', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await selectSceneItem(page, '27 寸显示器');
  await library(page);
  await page.getByRole('button', { name: '添加显示器支架臂', exact: true }).click();
  await expect(page.getByRole('group', { name: '底座安装边沿' })).toBeVisible();

  const initial = await state(page);
  const initialArm = initial.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  const initialX = initialArm.monitorArm!.clampX!;

  // Locate arm base handle in rear-elevated camera and drag it left + slightly forward along desktop
  const locateBase = async () =>
    page.evaluate(async () => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const canvas = document.querySelector('canvas')!;
      const { camera, controls, scene, invalidate } = _roots.get(canvas).store.getState();
      controls.target.set(-0.2, 0.82, -0.2);
      camera.position.set(0.25, 1.48, -0.88);
      camera.lookAt(-0.2, 0.82, -0.2);
      controls.update();
      invalidate();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      scene.updateMatrixWorld(true);
      let pos = null as { x: number; y: number } | null;
      scene.traverse((obj: { name?: string; matrixWorld: { elements: ArrayLike<number> } }) => {
        if (!pos && obj.name === 'arm-base-handle') {
          const m = obj.matrixWorld.elements;
          const p = camera.position.clone().set(m[12], m[13], m[14]).project(camera);
          pos = { x: p.x, y: p.y };
        }
      });
      return pos;
    });

  const baseNdc = await locateBase();
  expect(baseNdc).not.toBeNull();
  const rect = (await page.locator('canvas').boundingBox())!;
  const basePx = rect.x + ((baseNdc!.x + 1) * rect.width) / 2;
  const basePy = rect.y + ((1 - baseNdc!.y) * rect.height) / 2;

  await page.mouse.move(basePx, basePy);
  await page.mouse.down();
  await page.mouse.move(basePx + 120, basePy + 55, { steps: 10 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('支架底座');
  await page.mouse.up();

  const afterDrag = await state(page);
  const movedArm = afterDrag.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(movedArm.monitorArm?.clampX).not.toBeCloseTo(initialX, 2);

  // Switch between left edge ("左桌缘") and interior grommet mount ("桌面自由") in Inspector
  const edgeGroup = page.getByRole('group', { name: '底座安装边沿' });
  await edgeGroup.getByRole('button', { name: '左桌缘', exact: true }).click();
  const leftState = await state(page);
  const leftArm = leftState.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(leftArm.monitorArm?.clampEdge).toBe('left');
  expect(leftArm.monitorArm?.clampX).toBeCloseTo(-leftState.desk.width / 2 + 0.036, 3);
  await locateBase();
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('arm-base-left-edge.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/arm-base-left-edge.png',
  });

  await edgeGroup.getByRole('button', { name: '桌面自由', exact: true }).click();
  await editNumber(page, '底座左右位置', '-25');
  await editNumber(page, '底座前后位置', '-18');
  const surfaceState = await state(page);
  const surfaceArm = surfaceState.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(surfaceArm.monitorArm?.clampEdge).toBe('surface');
  expect(surfaceArm.monitorArm?.clampX).toBeCloseTo(-0.25, 3);
  expect(surfaceArm.monitorArm?.clampZ).toBeCloseTo(-0.18, 3);
  await locateBase();
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('arm-base-surface-mount.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/arm-base-surface-mount.png',
  });

  expect(errors).toEqual([]);
});

test('三面一体包边工位挡板无缝连接与桌体集成质感验证', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // Clear items cleanly so the full integrated U-shaped baffle around the tabletop is unobstructed
  await page.evaluate(async () => {
    const path = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === '/src/store/editorStore.ts')
      .at(-1)!;
    const { useEditor } = await import(/* @vite-ignore */ path);
    useEditor.getState().select(null);
    useEditor.getState().commit((p: { items: unknown[] }) => {
      p.items = [];
    });
  });

  await page.getByRole('switch', { name: '开启标准走线孔', exact: true }).check();
  await page.getByLabel('后挡板', { exact: true }).check();
  await page.getByLabel('左侧挡板', { exact: true }).check();
  await page.getByLabel('右侧挡板', { exact: true }).check();
  await expect(page.getByText('与桌体倒角及包边密封裙边一体成型')).toBeVisible();

  const s = await state(page);
  expect(s.desk.partitions).toEqual({ back: true, left: true, right: true, height: 0.35 });

  // Verify overall U-shaped continuous desk integration + outer skirt/bracket closeup
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.85, -0.02);
    camera.position.set(-0.92, 1.38, 1.38);
    camera.lookAt(0, 0.85, -0.02);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('desk-integrated-baffle-overview.png') });

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.7, 0.74, -0.2);
    camera.position.set(-1.12, 0.82, 0.42);
    camera.lookAt(-0.7, 0.74, -0.2);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('desk-integrated-baffle-apron-closeup.png') });

  // Enable shelf mounted onto the U-shaped baffles (suspended without desk-standing legs), then test dependency cleanup
  await page.getByRole('switch', { name: '桌体等宽平行层架', exact: true }).check();
  await editNumber(page, '架面高度', '38');
  await expect(page.getByText(/桌底悬空无立柱/)).toBeVisible();
  const shelfOnU = await state(page);
  expect(shelfOnU.desk.shelf?.enabled).toBe(true);
  expect(shelfOnU.desk.partitions!.height).toBeGreaterThanOrEqual(0.41);

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.9, -0.05);
    camera.position.set(-0.9, 1.38, 1.35);
    camera.lookAt(0, 0.9, -0.05);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('desk-baffle-mounted-shelf.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/desk-baffle-mounted-shelf.png',
  });

  // Verify back/side boards match the exact desktop material (wood texture) & shelf has zero support brackets underneath
  const surfaceMatch = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { scene } = _roots.get(canvas).store.getState();
    let deskHasMap = false;
    let partHasMap = false;
    let deskColor = '';
    let partColor = '';
    scene.traverse(
      (obj: {
        name?: string;
        material?: { map?: unknown; color?: { getHexString?: () => string } };
      }) => {
        if (obj.name === 'desk-top-mesh' && obj.material) {
          deskHasMap = Boolean(obj.material.map);
          deskColor = obj.material.color?.getHexString?.() ?? '';
        }
        if (obj.name === 'desk-partitions-mesh' && obj.material) {
          partHasMap = Boolean(obj.material.map);
          partColor = obj.material.color?.getHexString?.() ?? '';
        }
      },
    );
    return { deskHasMap, partHasMap, deskColor, partColor };
  });
  expect(surfaceMatch.deskHasMap).toBe(true);
  expect(surfaceMatch.partHasMap).toBe(true);
  expect(surfaceMatch.partColor).toBe(surfaceMatch.deskColor);

  // Switch the 3 partition panels to translucent frosted ("透明磨砂") & verify Three.js physical material state
  await page
    .getByRole('group', { name: '挡板材质' })
    .getByRole('button', { name: '透明磨砂', exact: true })
    .click();
  const frostedState = await state(page);
  expect(frostedState.desk.partitions?.material).toBe('frosted');
  const frostedMat = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { scene } = _roots.get(canvas).store.getState();
    let info = null as { transparent: boolean; opacity: number; hasMap: boolean } | null;
    scene.traverse(
      (obj: {
        name?: string;
        material?: { transparent?: boolean; opacity?: number; map?: unknown };
      }) => {
        if (obj.name === 'desk-partitions-mesh' && obj.material) {
          info = {
            transparent: Boolean(obj.material.transparent),
            opacity: obj.material.opacity ?? 1,
            hasMap: Boolean(obj.material.map),
          };
        }
      },
    );
    return info as { transparent: boolean; opacity: number; hasMap: boolean } | null;
  });
  expect(frostedMat).not.toBeNull();
  expect(frostedMat!.transparent).toBe(true);
  expect(frostedMat!.opacity).toBeLessThan(0.7);
  expect(frostedMat!.hasMap).toBe(false);
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('desk-partitions-frosted.png') });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/desk-partitions-frosted.png',
  });

  // Switch back to matchDesk before tearing down
  await page
    .getByRole('group', { name: '挡板材质' })
    .getByRole('button', { name: '同桌面材质', exact: true })
    .click();
  expect((await state(page)).desk.partitions?.material).toBe('matchDesk');

  // Removing all baffles automatically removes shelf; enabling shelf directly auto-enables back baffle
  await page.getByLabel('后挡板', { exact: true }).uncheck();
  await page.getByLabel('左侧挡板', { exact: true }).uncheck();
  await page.getByLabel('右侧挡板', { exact: true }).uncheck();
  const bareAfter = await state(page);
  expect(bareAfter.desk.partitions).toBeUndefined();
  expect(bareAfter.desk.shelf).toBeUndefined();

  await page.getByRole('switch', { name: '桌体等宽平行层架', exact: true }).check();
  const autoBaffle = await state(page);
  expect(autoBaffle.desk.shelf?.enabled).toBe(true);
  expect(autoBaffle.desk.partitions?.back).toBe(true);

  expect(errors).toEqual([]);
});

test('物品自带 3D 点击旋转徽标与拖拽旋转同步参数面板', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await selectSceneItem(page, '机械键盘');
  const rect = (await page.locator('canvas').boundingBox())!;

  const gizmoPts = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, scene, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.76, 0.16);
    camera.position.set(0.06, 1.24, 0.62);
    camera.lookAt(0, 0.76, 0.16);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const out: Record<string, { x: number; y: number }> = {};
    scene.updateMatrixWorld(true);
    scene.traverse((obj: { name?: string; matrixWorld: { elements: ArrayLike<number> } }) => {
      if (
        obj.name === 'item-rotate-left' ||
        obj.name === 'item-rotate-right' ||
        obj.name === 'item-rotate-handle'
      ) {
        const m = obj.matrixWorld.elements;
        const p = camera.position.clone().set(m[12], m[13], m[14]).project(camera);
        out[obj.name] = { x: p.x, y: p.y };
      }
    });
    return out;
  });

  expect(gizmoPts['item-rotate-left']).toBeUndefined();
  expect(gizmoPts['item-rotate-right']).toBeUndefined();
  expect(gizmoPts['item-rotate-handle']).toBeDefined();

  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('item-rotate-gizmo-closeup.png') });

  const pxOf = (pt: { x: number; y: number }) => ({
    x: rect.x + ((pt.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - pt.y) * rect.height) / 2,
  });

  // 1. Direct click on the refined rotate handle steps +45° immediately & updates Inspector
  const handle = pxOf(gizmoPts['item-rotate-handle']);
  await page.mouse.click(handle.x, handle.y);
  let kb = (await state(page)).items.find((i: SceneItem) => i.kind === 'keyboard')!;
  expect(kb.rotation).toBe(45);

  // 2. Undo back to 0°, then drag front handle freely -> live pill + Esc cancel + release commit
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 95, handle.y - 30, { steps: 10 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('旋转角度');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  kb = (await state(page)).items.find((i: SceneItem) => i.kind === 'keyboard')!;
  expect(kb.rotation).toBe(0);

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 100, handle.y - 35, { steps: 10 });
  await page.mouse.up();
  kb = (await state(page)).items.find((i: SceneItem) => i.kind === 'keyboard')!;
  expect(kb.rotation).toBeGreaterThan(15);

  // Parametric Inspector input remains synced & functional alongside on-item rotation
  await editNumber(page, '绕竖轴旋转', '45');
  kb = (await state(page)).items.find((i: SceneItem) => i.kind === 'keyboard')!;
  expect(kb.rotation).toBe(45);
  expect(errors).toEqual([]);
});

test('桌后墙面设置、洞洞板壁挂上墙与沿墙面拖拽高度定位', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 1. 选中默认洞洞板，点击 "墙面壁挂" -> 自动开启桌后墙面并去脚挂墙
  await selectSceneItem(page, '桌面洞洞板');
  await page.getByRole('button', { name: '墙面壁挂', exact: true }).click();

  let st = await state(page);
  expect(st.desk.backWall?.enabled).toBe(true);
  let board = st.items.find((i: SceneItem) => i.kind === 'pegboard')!;
  expect(board.surface).toBe('wall');
  expect(board.wallY).toBeCloseTo(0.22, 3);

  // 参数调整挂墙高度至 38 cm 并微调右移，然后沿墙面直接 3D 拖拽（含 Esc 取消与松手提交）
  await editNumber(page, '挂墙高度（距桌面）', '38');
  board = (await state(page)).items.find((i: SceneItem) => i.kind === 'pegboard')!;
  expect(board.wallY).toBeCloseTo(0.38, 2);

  // 正前偏右上视角截图：清晰展示桌后完整墙体、踢脚线与墙面壁挂无脚洞洞板及背面挂轨
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.16, 1.02, -0.22);
    camera.position.set(0.65, 1.24, 0.92);
    camera.lookAt(0.16, 1.02, -0.22);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('wall-mounted-pegboard.png') });

  // 沿墙面直接拖动：先向右上方拖动看到实时壁挂 HUD 提示，Esc 取消回原位，再真实拖动提交
  const dragStart = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const threePath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const { Vector3 } = await import(/* @vite-ignore */ threePath);
    const canvas = document.querySelector('canvas')!;
    const { camera, scene } = _roots.get(canvas).store.getState();
    const mount = scene.getObjectByName('pegboard-wall-mounts');
    if (!mount) return null;
    const worldPt = new Vector3(0, 0.17, 0.01);
    mount.parent!.localToWorld(worldPt);
    worldPt.project(camera);
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + ((worldPt.x + 1) * r.width) / 2,
      y: r.top + ((1 - worldPt.y) * r.height) / 2,
    };
  });
  expect(dragStart).not.toBeNull();

  await page.mouse.click(dragStart!.x, dragStart!.y, { button: 'right' });
  await page.mouse.move(dragStart!.x, dragStart!.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(dragStart!.x + 48, dragStart!.y - 45, { steps: 10 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('墙面挂高');
  await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'left' });
  board = (await state(page)).items.find((i: SceneItem) => i.kind === 'pegboard')!;
  expect(board.wallY).toBeCloseTo(0.38, 2);

  await page.mouse.move(dragStart!.x, dragStart!.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(dragStart!.x + 48, dragStart!.y - 50, { steps: 10 });
  await page.mouse.up({ button: 'left' });
  board = (await state(page)).items.find((i: SceneItem) => i.kind === 'pegboard')!;
  expect(board.wallY!).toBeGreaterThan(0.41);

  // 关闭桌后墙面：洞洞板自动平稳落回主桌面
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.getByRole('switch', { name: '桌后墙面' }).click();
  st = await state(page);
  expect(st.desk.backWall).toBeUndefined();
  board = st.items.find((i: SceneItem) => i.kind === 'pegboard')!;
  expect(board.surface).toBeUndefined();
  expect(errors).toEqual([]);
});

test('插座、插排与多规格插头系统：配置切换、墙地双装与物理连线走线', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });

  await ready(page);

  // 1. 添加桌面插排，验证 1×3、2×4、仅双口、仅3口、5孔、USB-A/C 及总控开关切换
  await page.getByRole('button', { name: '添加智能桌面插排', exact: true }).click();
  let st = await state(page);
  const stripId = st.items.find((i: SceneItem) => i.kind === 'powerStrip')!.id;

  await editNumber(page, '左右位置', '-34');
  await editNumber(page, '前后位置', '-18');
  await page.getByRole('button', { name: '1×3 位' }).click();
  await page.getByRole('button', { name: /仅双孔/ }).click();
  st = await state(page);
  let strip = st.items.find((i: SceneItem) => i.id === stripId)!;
  expect(strip.powerStrip?.layout).toBe('1x3');
  expect(strip.powerStrip?.outletType).toBe('twoPin');

  await page.getByRole('button', { name: '2×4 位' }).click();
  await page.getByRole('button', { name: /5 孔组合/ }).click();
  await page
    .getByRole('group', { name: '插排 USB-A 数量' })
    .getByRole('button', { name: '2 口' })
    .click();
  await page
    .getByRole('group', { name: '插排 Type-C 数量' })
    .getByRole('button', { name: '2 口' })
    .click();
  st = await state(page);
  strip = st.items.find((i: SceneItem) => i.id === stripId)!;
  expect(strip.powerStrip?.layout).toBe('2x4');
  expect(strip.powerStrip?.usbA).toBe(2);
  expect(strip.powerStrip?.usbC).toBe(2);

  // 2. 插入线缆并测试多规格插头（国标三插、90°超薄弯头、GaN氮化镓快充头、苹果方形快充头）
  await page.getByRole('button', { name: '插入 电源线 (IEC C13)', exact: true }).click();
  await page.getByLabel('插头规格').selectOption('rightAngle');
  st = await state(page);
  expect(st.cables?.length).toBeGreaterThanOrEqual(1);
  expect(st.cables?.[0].toPlugType).toBe('rightAngle');

  // 同时给桌面插排插一根 GaN 快充头 Type-C 线缆与一根 Apple 方形适配器电源线以便同框查看多规格插头
  await page.getByRole('button', { name: '插入 USB-C / 雷雳', exact: true }).click();
  await page.getByLabel('插头规格').nth(1).selectOption('ganAdapter');

  // 将显示器电源线也接入排插孔位，并选 GaN / 国标插头近景拍照检查
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const state = _roots.get(canvas).store.getState();
    const { camera, controls, invalidate } = state as {
      camera: { position: { set: (x: number, y: number, z: number) => void } };
      controls: { target: { set: (x: number, y: number, z: number) => void }; update: () => void };
      invalidate: () => void;
    };
    controls.target.set(-0.34, 0.77, -0.18);
    camera.position.set(-0.08, 1.02, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.locator('canvas').screenshot({ path: testInfo.outputPath('power-strip-closeup.png') });

  // 3. 添加壁挂单联插座（自动启用桌后墙面），确认无多联和 Type-C，切换仅 3 孔；再添加第二个墙插与地插对齐并拍照
  await page.getByRole('button', { name: '添加墙面 / 地面插座', exact: true }).click();
  st = await state(page);
  expect(st.desk.backWall?.enabled).toBe(true);
  const wallSocketId = st.items.find((i: SceneItem) => i.kind === 'wallOutlet')!.id;

  await expect(page.getByRole('button', { name: '2 位插座' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '插座 Type-C 数量' })).toHaveCount(0);
  await page.getByRole('button', { name: /仅三孔/ }).click();
  await editNumber(page, '离地高度', '38');
  await editNumber(page, '左右位置', '24');
  st = await state(page);
  const wallSocket = st.items.find((i: SceneItem) => i.id === wallSocketId)!;
  expect(wallSocket.wallOutlet?.mount).toBe('wall');
  expect(wallSocket.wallOutlet?.outletType).toBe('threePin');
  expect(wallSocket.wallOutlet?.gangs).toBe(1);
  expect(wallSocket.wallOutlet?.usbC).toBe(0);
  expect(wallSocket.wallY).toBeCloseTo(0.38, 2);

  // 将桌面插排接入此墙面插座
  await page.getByRole('button', { name: '插入 电源线 (IEC C13)', exact: true }).click();
  await page.getByLabel('插头规格').first().selectOption('appleDuckhead');

  // 再添加第二个独立 86 型墙面插座，通过 3D 左键拖拽靠近第一个插座并触发自动磁吸紧贴对齐
  await page.getByRole('button', { name: '添加墙面 / 地面插座', exact: true }).click();
  await editNumber(page, '离地高度', '39.2');
  await editNumber(page, '左右位置', '34.5');
  const secondWallPt = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const threePath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const { Vector3 } = await import(/* @vite-ignore */ threePath);
    const canvas = document.querySelector('canvas')!;
    const { camera } = _roots.get(canvas).store.getState();
    const wp = new Vector3(0.345, 0.435, -0.37);
    wp.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((wp.x + 1) * r.width) / 2, y: r.top + ((1 - wp.y) * r.height) / 2 };
  });
  await page.mouse.move(secondWallPt.x, secondWallPt.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(secondWallPt.x - 10, secondWallPt.y + 4, { steps: 6 });
  await page.mouse.up({ button: 'left' });

  // 再添加第三个插座并切换为地面附着（地插）+ 仅双孔（无 Type-C）
  await page.getByRole('button', { name: '添加墙面 / 地面插座', exact: true }).click();
  await page.getByRole('button', { name: '附着地面', exact: true }).click();
  await page.getByRole('button', { name: /仅双孔/ }).click();
  await editNumber(page, '左右位置', '-25');
  st = await state(page);
  const floorSocket = st.items.filter((i: SceneItem) => i.kind === 'wallOutlet')[2];
  expect(floorSocket.wallOutlet?.mount).toBe('floor');
  expect(floorSocket.surface).toBe('floor');
  expect(floorSocket.wallOutlet?.outletType).toBe('twoPin');
  expect(floorSocket.wallOutlet?.gangs).toBe(1);
  expect(floorSocket.wallOutlet?.usbC).toBe(0);

  // 将桌后视角的墙面插座 + 地插 + 下穿供电线缆一起近景截图检查
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const state = _roots.get(canvas).store.getState();
    const { camera, controls, invalidate } = state as {
      camera: { position: { set: (x: number, y: number, z: number) => void } };
      controls: { target: { set: (x: number, y: number, z: number) => void }; update: () => void };
      invalidate: () => void;
    };
    controls.target.set(0.0, 0.28, -0.36);
    camera.position.set(0.28, 0.56, 0.65);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('wall-floor-outlets-closeup.png') });
  expect(errors).toEqual([]);
});

test('自定义端口直连、控制节点逐点微调、穿桌面/底座走线孔与实体防穿模', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });

  await ready(page);

  // 1. 开启 60mm 标准桌面走线孔与桌后墙面，添加桌面插排和 MacBook
  await page.getByRole('switch', { name: '开启标准走线孔', exact: true }).check();
  await page.getByRole('switch', { name: '桌后墙面', exact: true }).check();
  await page.getByRole('button', { name: '添加智能桌面插排', exact: true }).click();
  await editNumber(page, '左右位置', '-28');
  await editNumber(page, '前后位置', '-24');

  // 2. 开启「3D 手动连线」提示并取消，再用面板「自选两端直连」把显示器电源连入插排并保留过孔走线
  await page.getByRole('button', { name: '3D 手动连线', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('3D 连线中');
  await page.getByRole('button', { name: '取消', exact: true }).click();

  // 选择显示器并自选端口连入穿桌面走线孔与桌面插排
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  const st0 = await state(page);
  const strip = st0.items.find((i: SceneItem) => i.kind === 'powerStrip')!;

  // 用画布投射坐标点击显示器进入属性面板并连接电源线到桌面插排 + DP 线穿过桌面走线孔
  const monScreen = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const threePath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const { Vector3 } = await import(/* @vite-ignore */ threePath);
    const canvas = document.querySelector('canvas')!;
    const { camera } = _roots.get(canvas).store.getState();
    const wp = new Vector3(0, 1.05, 0);
    wp.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((wp.x + 1) * r.width) / 2, y: r.top + ((1 - wp.y) * r.height) / 2 };
  });
  await page.mouse.click(monScreen.x, monScreen.y, { button: 'right' });
  await expect(page.getByLabel('起点端口')).toBeVisible();

  await page.getByLabel('起点端口').selectOption('dp');
  await page.getByLabel('目标端口').selectOption('floor:grommet');
  await page.getByRole('button', { name: '建立自定义连线', exact: true }).click();

  // 将电源也自选连到桌面插排 slot-1
  await page.getByLabel('起点端口').selectOption('power');
  await page.getByLabel('目标端口').selectOption(`dev:${strip.id}:slot-1`);
  await page.getByRole('button', { name: '建立自定义连线', exact: true }).click();

  let st = await state(page);
  expect(st.cables).toHaveLength(2);

  // 3. 展开第一个线缆的「节点微调」，插入新控制点并调整位置，验证 waypoints 写入及防穿模生效
  await page
    .getByRole('button', { name: /节点微调/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '控制点 #1' })).toBeVisible();
  await page.getByRole('button', { name: '在控制点 1 后插入节点' }).click();
  st = await state(page);
  expect(st.cables![0].waypoints?.length).toBeGreaterThanOrEqual(4);

  // 调整节点高度与穿模边界，核实不会写入非法数值并生成线缆近景图
  await page.getByRole('button', { name: '还原自动走线' }).click();
  st = await state(page);
  expect(st.cables![0].waypoints).toBeUndefined();

  // 保持线缆控制节点选中，切换到走线孔与 3D 控制点特写视角截图检查
  await page.getByRole('button', { name: '控制点 #2' }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const st = _roots.get(canvas).store.getState();
    const { camera, controls, invalidate } = st as {
      camera: { position: { set: (x: number, y: number, z: number) => void } };
      controls: { target: { set: (x: number, y: number, z: number) => void }; update: () => void };
      invalidate: () => void;
    };
    controls.target.set(-0.08, 0.78, -0.2);
    camera.position.set(0.32, 1.06, 0.25);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('cable-holes-and-nodes-closeup.png') });

  // 4. 验证物理防穿模约束开关 & Inspector 数值重叠警示「一键自动避让分离」
  await page.getByRole('button', { name: '添加Mac Studio', exact: true }).click();
  await editNumber(page, '左右位置', '-28');
  await editNumber(page, '前后位置', '-24');
  await expect(page.getByText(/发生物理模型重叠/)).toBeVisible();
  await page.getByRole('button', { name: '一键自动避让分离', exact: true }).click();
  await expect(page.getByText(/发生物理模型重叠/)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('32. MacBook Pro 14" 2024-2026 C面与 2026 PROLED XDR 尺寸版本切换及近景检查', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '-50');
  await editNumber(page, '前后位置', '14');

  const stdBtn = page.getByRole('button', { name: '2024–2026 标准版', exact: true });
  const proledBtn = page.getByRole('button', { name: '2026 PROLED XDR', exact: true });
  await expect(stdBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(proledBtn).toHaveAttribute('aria-pressed', 'false');

  await proledBtn.click();
  await expect(proledBtn).toHaveAttribute('aria-pressed', 'true');
  let st = await state(page);
  let mb = st.items.find((i: SceneItem) => i.kind === 'macbook')!;
  expect(mb.size.width).toBeCloseTo(0.3108, 4);
  expect(mb.size.depth).toBeCloseTo(0.2163, 4);
  expect(mb.size.height).toBeCloseTo(0.015, 4);

  await stdBtn.click();
  await expect(stdBtn).toHaveAttribute('aria-pressed', 'true');
  st = await state(page);
  mb = st.items.find((i: SceneItem) => i.kind === 'macbook')!;
  expect(mb.size.width).toBeCloseTo(0.3126, 4);
  expect(mb.size.depth).toBeCloseTo(0.2212, 4);
  expect(mb.size.height).toBeCloseTo(0.0155, 4);

  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();

  // Close-up of the 14" C-face (12 full-height F-keys, Touch ID, flanking speakers, Force Touch trackpad, thumb scoop)
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.5, 0.77, 0.14);
    camera.position.set(-0.5, 1.07, 0.36);
    camera.lookAt(-0.5, 0.77, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('macbook-pro14-c-face-closeup.png') });

  // Side close-up checking lower thermal intake vent + MagSafe 3 / USB-C flank
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.656, 0.758, 0.14);
    camera.position.set(-0.86, 0.775, 0.27);
    camera.lookAt(-0.656, 0.758, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('macbook-pro14-side-closeup.png') });

  expect(errors).toEqual([]);
});

test('33. 桌面音响标杆系统（YU4/MR4/A2+）、主副箱配对音箱线及完整线缆接口验证', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 1. 选中右侧有源主箱（第二个桌面音响）
  await page.getByRole('button', { name: /^场景/ }).click();
  await page
    .locator('.scene-row')
    .filter({ has: page.getByText('桌面音响', { exact: true }) })
    .nth(1)
    .click();

  await expect(
    page.getByRole('button', { name: 'Kanto YU4 (全能桌面)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: '有源主箱 (Active)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  // 切换至 Edifier MR4（验证 6.35mm TRS 与前置 AUX 接口切换），再切 Audioengine A2+，再切回 Kanto YU4
  await page.getByRole('button', { name: 'Edifier MR4 (平衡监听)', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '插入 6.35mm TRS 平衡音频线', exact: true }),
  ).toBeVisible();
  let st = await state(page);
  let activeSpk = st.items.find(
    (i: SceneItem) => i.kind === 'speaker' && i.speaker?.role === 'active',
  )!;
  expect(activeSpk.size.height).toBeCloseTo(0.228, 3);

  // 取消选择边框并截取音箱前脸高清近景（核验高音网孔、深凹低音振膜、银色金属相位帽与底部胶囊铭牌）
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.evaluate(
    async ({ sx, sz }) => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const canvas = document.querySelector('canvas')!;
      const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
      controls.target.set(sx, 0.84, sz + 0.08);
      camera.position.set(sx - 0.14, 0.89, sz + 0.49);
      camera.lookAt(sx, 0.84, sz + 0.08);
      controls.update();
      invalidate();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
    { sx: activeSpk.x, sz: activeSpk.z },
  );
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('speaker-front-baffle-closeup.png') });

  await page.getByRole('button', { name: /^场景/ }).click();
  await page
    .locator('.scene-row')
    .filter({ has: page.getByText('桌面音响', { exact: true }) })
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'Audioengine A2+ (紧凑)', exact: true }).click();
  await expect(page.getByRole('button', { name: '插入 USB-C / 雷雳', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kanto YU4 (全能桌面)', exact: true }).click();

  // 2. 插入核心音响线缆：主副箱音箱连接线 + 3.5mm AUX + 光纤 + RCA + 电源线
  await page.getByRole('button', { name: '插入 主副箱音箱连接线 (16AWG)', exact: true }).click();
  await page.getByRole('button', { name: '插入 3.5mm 音频线 (AUX)', exact: true }).click();
  await page.getByRole('button', { name: '插入 光纤数字音频线 (TOSLINK)', exact: true }).click();
  await page.getByRole('button', { name: '插入 RCA 双莲花音频线', exact: true }).click();
  await page.getByRole('button', { name: '插入 电源线 (IEC C13)', exact: true }).click();

  st = await state(page);
  expect(st.cables).toHaveLength(5);
  const wireCable = st.cables!.find(
    (c: { kind: string; to: { type: string } }) => c.kind === 'speakerWire',
  )!;
  expect(wireCable.to.type).toBe('device');

  // 3. 移除背后遮挡视角的洞洞板后，切到音箱背面近景与双箱连线全景截图
  await selectSceneItem(page, '桌面洞洞板');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.32, 0.83, -0.23);
    camera.position.set(0.46, 0.92, -0.56);
    camera.lookAt(0.32, 0.83, -0.23);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('speaker-rear-ports-cables-closeup.png') });

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.12, 0.84, -0.2);
    camera.position.set(-0.08, 1.18, -0.88);
    camera.lookAt(-0.12, 0.84, -0.2);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('speaker-pair-wiring-overview.png') });

  expect(errors).toEqual([]);
});

test('34. 模型库独立「双头机械臂 (NB F160)」与单臂部件区分，紧并列双肩柱+双 C 型夹持底座渲染核验', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 1. 准备两台并排 27 寸显示器（清空阻挡视角的中置音箱），核对左侧模型库同时存在单头与双头两个独立部件
  await selectSceneItem(page, '27 寸显示器');
  await editNumber(page, '左右位置', '-32');
  await editNumber(page, '前后位置', '-10');
  await library(page);
  await expect(page.getByRole('button', { name: '添加显示器支架臂', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '添加双头机械臂', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '添加27 寸显示器', exact: true }).click();
  await editNumber(page, '左右位置', '32');
  await editNumber(page, '前后位置', '-10');

  // 2. 直接点击独立的「添加双头机械臂」添加 NB F160，检查状态直接成双臂双显模式
  await library(page);
  await page.getByRole('button', { name: '添加双头机械臂', exact: true }).click();
  const st = await state(page);
  const dualArm = st.items.find((i: SceneItem) => i.kind === 'monitorArm')!;
  expect(dualArm).toBeDefined();
  expect(dualArm.name).toBe('双头机械臂');
  expect(dualArm.monitorArm?.armStyle).toBe('dual');
  expect(dualArm.monitorArm?.secondaryKind).toBe('monitor');

  // 3. 切到桌后近景与双 C 夹特写视角检查紧并列双肩柱 + 双多孔钢制 C 夹 + V 型展开（对照 NB F160 实拍图）
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.8, -0.3);
    camera.position.set(0.24, 0.88, -0.86);
    camera.lookAt(0, 0.8, -0.3);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('nb-f160-dual-arm-base-closeup.png') });

  expect(errors).toEqual([]);
});

test('35. Mac mini (127.2 × 127.1 × 49.7 mm) 与 Mac Studio (197.2 × 197.2 × 94.9 mm) 外观精细尺寸、顶部标志与前后接口渲染核验', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 1. 移除中央键盘以免遮挡，添加并排放置的 Mac mini 与 Mac Studio 以便高清无遮挡特写核验
  await selectSceneItem(page, '机械键盘');
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await library(page);
  await page.getByRole('button', { name: '添加Mac mini', exact: true }).click();
  await editNumber(page, '左右位置', '-13');
  await editNumber(page, '前后位置', '24');

  await library(page);
  await page.getByRole('button', { name: '添加Mac Studio', exact: true }).click();
  await editNumber(page, '左右位置', '13');
  await editNumber(page, '前后位置', '24');

  const st = await state(page);
  const mini = st.items.find((i: SceneItem) => i.kind === 'macMini')!;
  const studio = st.items.find((i: SceneItem) => i.kind === 'macStudio')!;
  expect(mini.size).toEqual({ width: 0.1272, height: 0.0497, depth: 0.1271 });
  expect(studio.size).toEqual({ width: 0.1972, height: 0.0949, depth: 0.1972 });

  // 取消选中以清空选择框，截取俯视+正面 3/4 比例、顶部 Apple 标志与完整前面板接口特写
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.01, 0.79, 0.24);
    camera.position.set(0.03, 1.03, 0.76);
    camera.lookAt(0.01, 0.79, 0.24);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('mac-duo-front-top-closeup.png') });

  // 2. 背面全景特写：核验 Mac Studio 上部蜂窝微孔 + 10口完整背面接口 + Mac mini 背面接口
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.0, 0.79, 0.24);
    camera.position.set(0.0, 0.86, -0.26);
    camera.lookAt(0.0, 0.79, 0.24);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('mac-duo-rear-closeup.png') });

  // 3. Mac mini 低角度侧后特写：核验底部黑色抬升底座 + 底部外缘电源键 + 顶部居中 Apple 标志
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.13, 0.768, 0.24);
    camera.position.set(-0.3, 0.78, 0.08);
    camera.lookAt(-0.13, 0.768, 0.24);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('mac-mini-bottom-corner-closeup.png') });

  expect(errors).toEqual([]);
});

test('36. 物品自带 Pitch / Yaw / Roll 与笔记本屏幕开合角度直接三维拖拽调节（并保留参数化输入）', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  const rect = (await page.locator('canvas').boundingBox())!;
  const projectHandles = async (names: string[]) =>
    page.evaluate(async (targetNames) => {
      const r3fPath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
      const threePath = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname.endsWith('/three.js'))!;
      const { _roots } = await import(/* @vite-ignore */ r3fPath);
      const { Vector3 } = await import(/* @vite-ignore */ threePath);
      const canvas = document.querySelector('canvas')!;
      const { camera, scene, invalidate } = _roots.get(canvas).store.getState();
      invalidate();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      scene.updateMatrixWorld(true);
      const out: Record<string, { x: number; y: number }> = {};
      scene.traverse((obj: { name?: string; getWorldPosition: (v: unknown) => unknown }) => {
        if (obj.name && targetNames.includes(obj.name)) {
          const wp = new Vector3();
          obj.getWorldPosition(wp);
          wp.project(camera);
          out[obj.name] = { x: wp.x, y: wp.y };
        }
      });
      return out;
    }, names);

  const pxOf = (pt: { x: number; y: number }) => ({
    x: rect.x + ((pt.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - pt.y) * rect.height) / 2,
  });

  // 1. 选中 27 寸显示器：核验 Pitch / Yaw / Roll 三轴手柄同时直接融合在显示器本体上
  await selectSceneItem(page, '27 寸显示器');
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 1.02, -0.15);
    camera.position.set(0.42, 1.18, 0.56);
    camera.lookAt(0, 1.02, -0.15);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });

  const monitorHandles = await projectHandles([
    'item-rotate-handle',
    'item-pitch-handle',
    'item-roll-handle',
    'item-lid-handle',
  ]);
  expect(monitorHandles['item-rotate-handle']).toBeDefined();
  expect(monitorHandles['item-pitch-handle']).toBeDefined();
  expect(monitorHandles['item-roll-handle']).toBeDefined();
  expect(monitorHandles['item-lid-handle']).toBeUndefined();

  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('monitor-3axis-gizmo-closeup.png') });

  // 点击 +5° 与拖拽 Pitch 手柄（Esc 取消 -> 再正式拖拽同步到参数面板）
  const pitchPx = pxOf(monitorHandles['item-pitch-handle']);
  await page.mouse.click(pitchPx.x, pitchPx.y);
  let mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.pitch).toBe(5);

  const pitchHandles2 = await projectHandles(['item-pitch-handle', 'item-roll-handle']);
  const pitchPx2 = pxOf(pitchHandles2['item-pitch-handle']);
  await page.mouse.move(pitchPx2.x, pitchPx2.y);
  await page.mouse.down();
  await page.mouse.move(pitchPx2.x, pitchPx2.y + 45, { steps: 8 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('俯仰角度');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.pitch).toBe(5);

  await page.mouse.move(pitchPx2.x, pitchPx2.y);
  await page.mouse.down();
  await page.mouse.move(pitchPx2.x, pitchPx2.y + 45, { steps: 8 });
  await page.mouse.up();
  mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.pitch!).toBeGreaterThan(5);

  // 物理防穿模限制：原装支架下过度下俯 (+45°) 会被立柱限位阻挡，未抬升高度时 +45° 翻转会被桌面限位阻挡
  await editNumber(page, '俯仰角度', '45');
  mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.pitch!).toBeGreaterThan(20);
  expect(mon.pitch!).toBeLessThan(26);

  await editNumber(page, '俯仰角度', '0');
  const pitchHandles3 = await projectHandles(['item-roll-handle']);
  const rollPx = pxOf(pitchHandles3['item-roll-handle']);
  await page.mouse.click(rollPx.x, rollPx.y);
  mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.roll!).toBeGreaterThan(25);
  expect(mon.roll!).toBeLessThan(35);

  // 抬升屏幕高度至 +5cm 后，对角线完全离开桌面，可完整翻转至 45° 与 90° 竖屏
  await editNumber(page, '屏幕高度', '5');
  await editNumber(page, '屏幕翻转', '45');
  mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.roll).toBe(45);
  await editNumber(page, '屏幕翻转', '90');
  mon = (await state(page)).items.find((i: SceneItem) => i.kind === 'monitor')!;
  expect(mon.roll).toBe(90);

  // 2. 添加 MacBook 并置于空位：核验 Yaw + 屏幕开合角 (lidAngle) 手柄融合在机身上，支持拖拽及 Esc 取消
  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '-42');
  await editNumber(page, '前后位置', '16');

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(-0.42, 0.84, 0.14);
    camera.position.set(-0.1, 1.02, 0.48);
    camera.lookAt(-0.42, 0.84, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });

  const macHandles = await projectHandles([
    'item-rotate-handle',
    'item-lid-handle',
    'item-pitch-handle',
    'item-roll-handle',
  ]);
  expect(macHandles['item-rotate-handle']).toBeDefined();
  expect(macHandles['item-lid-handle']).toBeDefined();
  expect(macHandles['item-pitch-handle']).toBeUndefined();
  expect(macHandles['item-roll-handle']).toBeUndefined();

  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('macbook-yaw-lid-gizmo-closeup.png') });

  // 拖拽笔记本顶缘屏幕开合手柄：显示实时状态 -> Esc 取消保持默认 110° -> 再拖拽合拢更新参数
  const lidPx = pxOf(macHandles['item-lid-handle']);
  await page.mouse.move(lidPx.x, lidPx.y);
  await page.mouse.down();
  await page.mouse.move(lidPx.x, lidPx.y + 45, { steps: 8 });
  await expect(page.locator('.arm-elbow-pill')).toContainText('屏幕开合角');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  let mb = (await state(page)).items.find((i: SceneItem) => i.kind === 'macbook')!;
  expect(mb.lidAngle ?? 108).toBe(108);

  // 沿笔记本前缘闭合方向（青色铰链弧向左下方）拖拽：合拢角应明显减小
  await page.mouse.move(lidPx.x, lidPx.y);
  await page.mouse.down();
  await page.mouse.move(lidPx.x - 85, lidPx.y + 45, { steps: 10 });
  await page.mouse.up();
  mb = (await state(page)).items.find((i: SceneItem) => i.kind === 'macbook')!;
  expect(mb.lidAngle!).toBeLessThan(95);

  // 保留参数化调节（可由属性面板精确输入 120°）
  await editNumber(page, '屏幕开合角', '120');
  mb = (await state(page)).items.find((i: SceneItem) => i.kind === 'macbook')!;
  expect(mb.lidAngle).toBe(120);

  expect(errors).toEqual([]);
});

test('37. Twelve South Curve Flex 与 Rain Design mStand 笔记本支架 1:1 结构重塑及渲染核验', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await ready(page);

  // 清空中央键盘，并排展示 Curve Flex（含承托 MacBook）与 Rain Design mStand（一体式 Ø50.8 mm 穿线孔）
  await selectSceneItem(page, '机械键盘');
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();

  await library(page);
  await page.getByRole('button', { name: '添加笔记本支架', exact: true }).click();
  await editNumber(page, '左右位置', '-20');
  await editNumber(page, '前后位置', '20');
  await editNumber(page, '抬高高度', '22');
  await editNumber(page, '倾斜角度', '28');

  let st = await state(page);
  const curveFlex = st.items.find((i: SceneItem) => i.kind === 'laptopStand')!;
  expect(curveFlex.size).toEqual({ width: 0.264, height: 0.14, depth: 0.224 });
  expect(curveFlex.laptopStand?.model).toBe('curveFlex');
  expect(curveFlex.laptopStand?.elevation).toBeCloseTo(0.22, 4);
  expect(curveFlex.laptopStand?.tiltDeg).toBe(28);

  await library(page);
  await page.getByRole('button', { name: '添加笔记本支架', exact: true }).click();
  await editNumber(page, '左右位置', '20');
  await editNumber(page, '前后位置', '20');
  await page.getByRole('button', { name: 'Rain Design mStand (固定式)', exact: true }).click();

  st = await state(page);
  const mStand = st.items.filter((i: SceneItem) => i.kind === 'laptopStand')[1];
  expect(mStand.size).toEqual({ width: 0.253, height: 0.15, depth: 0.19 });
  expect(mStand.laptopStand?.model).toBe('mStand');

  // 取消选中并分别从前侧 3/4 与后侧视角截图检查双铰链底座与 mStand 背面 Ø50.8 mm 理线圆孔
  await page.getByRole('button', { name: '编辑桌子', exact: true }).click();
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.02, 0.86, 0.2);
    camera.position.set(0.14, 1.04, 0.96);
    camera.lookAt(0.02, 0.86, 0.2);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('laptop-stands-front-closeup.png') });

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.2, 0.81, 0.14);
    camera.position.set(0.45, 0.88, 0.02);
    camera.lookAt(0.2, 0.81, 0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('laptop-stands-rear-hole-closeup.png') });

  expect(errors).toEqual([]);
});

test('38. 主页左侧线缆系统：充电线与电源线专区陈列、自选型号与手动/3D接线闭环', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);

  // 1. 添加插排与 MacBook 作为电源/充电线接入目标
  await library(page);
  await page
    .locator('.library')
    .screenshot({ path: testInfo.outputPath('library-thumbnails.png') });
  await page.getByRole('button', { name: '添加智能桌面插排', exact: true }).click();
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();

  // 2. 在左侧栏打开「线缆」标签页，确认设有「充电线与电源线专区」及多款不同型号电源线
  const cableTab = page.locator('.library-tabs button', { hasText: '线缆' });
  await expect(cableTab).toBeVisible();
  await cableTab.click();

  const powerZone = page.getByRole('region', { name: '充电线与电源线专区' });
  await expect(powerZone).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /国标三插品字电源线/ })).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /90° 超薄直角电源线/ })).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /纯白两脚 8 字尾电源线/ })).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /MagSafe 3 磁吸编织线/ })).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /苹果方头 Type-C 充电线/ })).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /氮化镓 GaN 快充套装线/ })).toBeVisible();

  // 3. 选择「90° 超薄直角电源线」，手动配对显示器与插排并确认接线
  await powerZone.getByRole('button', { name: /90° 超薄直角电源线/ }).click();
  const fromSelect = page.getByLabel('左侧起点接口', { exact: true });
  const toSelect = page.getByLabel('左侧终点接口', { exact: true });
  const monitorPowerOpt = await fromSelect
    .locator('option', { hasText: /显示器.*电源/ })
    .first()
    .getAttribute('value');
  expect(monitorPowerOpt).toBeTruthy();
  await fromSelect.selectOption(monitorPowerOpt!);
  const stripSlotOpt = await toSelect
    .locator('option', { hasText: /智能桌面插排.*插孔/ })
    .first()
    .getAttribute('value');
  expect(stripSlotOpt).toBeTruthy();
  await toSelect.selectOption(stripSlotOpt!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();

  let cur = await state(page);
  expect(cur.cables?.length).toBe(1);
  expect(cur.cables?.[0].kind).toBe('power');
  expect(cur.cables?.[0].toPlugType).toBe('rightAngle');

  // 4. 再选择「氮化镓 GaN 快充套装线」，切换进入 3D 点选端口接线提示后取消，再以手动连接一条 GaN 快充线
  await powerZone.getByRole('button', { name: /氮化镓 GaN 快充套装线/ }).click();
  await page.getByRole('button', { name: '进入 3D 点选端口接线', exact: true }).click();
  await expect(page.getByText(/3D 连线中（氮化镓 GaN 快充套装线）/)).toBeVisible();
  await page.getByRole('button', { name: '退出 3D 点选端口接线', exact: true }).click();

  const mbUsbcOpt = await fromSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C)/ })
    .first()
    .getAttribute('value');
  expect(mbUsbcOpt).toBeTruthy();
  await fromSelect.selectOption(mbUsbcOpt!);
  const stripSlot2Opt = await toSelect
    .locator('option', { hasText: /智能桌面插排.*插孔 2/ })
    .first()
    .getAttribute('value');
  if (stripSlot2Opt) await toSelect.selectOption(stripSlot2Opt);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();

  cur = await state(page);
  expect(cur.cables?.length).toBe(2);
  expect(cur.cables?.[1].kind).toBe('usbc');
  expect(cur.cables?.[1].toPlugType).toBe('ganAdapter');

  await page.screenshot({ path: testInfo.outputPath('left-cable-studio.png') });
  expect(errors).toEqual([]);
});

test('39. 光影与实时阴影精度核验：消除音箱阴影空洞与锯齿并强化全桌面接触阴影', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);

  // 1. 复现右置音箱与洞洞板底座附近近景，核验阴影连续饱满无空洞且无锯齿
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.32, 0.82, -0.14);
    camera.position.set(0.58, 1.14, 0.28);
    camera.lookAt(0.32, 0.82, -0.14);
    controls.update();
    invalidate();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('speaker-shadow-closeup.png') });

  // 2. 检验完整默认视角下的明亮光影对比与接触阴影
  await page.getByRole('button', { name: '透视', exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page
    .locator('canvas')
    .screenshot({ path: testInfo.outputPath('lighting-overview-bright.png') });

  expect(errors).toEqual([]);
});

async function resetToCleanMonitorDesk(page: Page) {
  await page.getByRole('button', { name: /^场景/ }).click();
  const rows = page.locator('.scene-row');
  if ((await rows.count()) > 1) {
    await rows
      .filter({ has: page.getByText('MacBook', { exact: true }) })
      .first()
      .click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
  }
}

test('40. 线缆物理重力、非锐角韧性与 3D 光标悬垂连线空格切换校验', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await resetToCleanMonitorDesk(page);
  await library(page);
  await page.getByRole('button', { name: '添加智能桌面插排', exact: true }).click();

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  const powerZone = page.getByRole('region', { name: '充电线与电源线专区' });
  await powerZone.getByRole('button', { name: /国标三插品字电源线/ }).click();
  await page.getByRole('button', { name: '进入 3D 点选端口接线', exact: true }).click();

  const statusPill = page.getByRole('status');
  await expect(statusPill).toContainText('手持 A 端');

  // 将鼠标移入画布上方，让 1.8m 电源线实时悬垂在光标上并在重力下弯垂贴合桌面
  const canvasBox = await page.locator('canvas').boundingBox();
  expect(canvasBox).toBeTruthy();
  const cx = canvasBox!.x + canvasBox!.width * 0.45;
  const cy = canvasBox!.y + canvasBox!.height * 0.25;
  await page.mouse.move(cx, cy, { steps: 6 });
  await page.waitForTimeout(380);

  const preMetrics = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { scene } = _roots.get(canvas).store.getState();
    const tube = scene.getObjectByName('live-wiring-cable-tube') as
      | {
          userData?: {
            liveNodes?: { x: number; y: number; z: number }[];
            minAngleDeg?: number;
            activeEnd?: string;
          };
        }
      | undefined;
    const nodes = tube?.userData?.liveNodes ?? [];
    const ys = nodes.map((p) => p.y);
    return {
      count: nodes.length,
      minAngleDeg: tube?.userData?.minAngleDeg ?? 0,
      activeEnd: tube?.userData?.activeEnd,
      minY: ys.length ? Math.min(...ys) : 99,
      maxY: ys.length ? Math.max(...ys) : -99,
    };
  });
  expect(preMetrics.count).toBeGreaterThanOrEqual(16);
  expect(preMetrics.activeEnd).toBe('from');
  expect(preMetrics.minAngleDeg).toBeGreaterThanOrEqual(92);
  expect(preMetrics.maxY - preMetrics.minY).toBeGreaterThan(0.15);

  // 按空格切换手持另一端（B 端 ↔ A 端）
  await page.keyboard.press('Space');
  await expect(statusPill).toContainText('手持 B 端');
  await page.waitForTimeout(160);
  const afterSpace = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const { scene } = _roots.get(document.querySelector('canvas')!).store.getState();
    const tube = scene.getObjectByName('live-wiring-cable-tube');
    return tube?.userData?.activeEnd;
  });
  expect(afterSpace).toBe('to');

  // 切回 A 端并在 3D 场景点击第一个绿色兼容端口（智能桌面插排插孔），应自动切到手持 B 端
  await page.keyboard.press('Space');
  await expect(statusPill).toContainText('手持 A 端');

  // 旋转并推进视角，清楚看到插排顶部绿色端口与悬垂线缆
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.05, 0.85, -0.05);
    camera.position.set(0.55, 1.35, 0.72);
    camera.lookAt(0.05, 0.85, -0.05);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });

  // 找到所有绿色可用端口球并投影到屏幕坐标点击第 1 个
  const greenOrbScreen = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const { scene, camera } = _roots.get(canvas).store.getState();
    camera.updateMatrixWorld();
    const pts: { x: number; y: number }[] = [];
    scene.traverse((obj: any) => {
      if (
        obj.isMesh &&
        obj.geometry?.type === 'SphereGeometry' &&
        obj.material?.color?.getHexString?.() === '22c55e'
      ) {
        const v = obj.position.clone().project(camera);
        if (v.z >= -1 && v.z <= 1) {
          pts.push({
            x: rect.left + ((v.x + 1) / 2) * rect.width,
            y: rect.top + ((-v.y + 1) / 2) * rect.height,
          });
        }
      }
    });
    return pts;
  });
  expect(greenOrbScreen.length).toBeGreaterThanOrEqual(2);

  await page.mouse.click(greenOrbScreen[0].x, greenOrbScreen[0].y);
  // 接完一端后自动切到另一端（B 端）挂在光标上
  await expect(statusPill).toContainText('手持 B 端');
  await page.mouse.move(cx + 80, cy - 30, { steps: 8 });
  await page.waitForTimeout(350);

  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/live-wiring-gravity.png',
  });

  // 找到另一个设备上（不同坐标）的绿色端口完成最终 3D 连线
  const targetOrbScreen = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const { scene, camera } = _roots.get(canvas).store.getState();
    camera.updateMatrixWorld();
    const pts: { x: number; y: number }[] = [];
    scene.traverse((obj: any) => {
      if (
        obj.isMesh &&
        obj.geometry?.type === 'SphereGeometry' &&
        obj.material?.color?.getHexString?.() === '22c55e'
      ) {
        const v = obj.position.clone().project(camera);
        if (v.z >= -1 && v.z <= 1) {
          pts.push({
            x: rect.left + ((v.x + 1) / 2) * rect.width,
            y: rect.top + ((-v.y + 1) / 2) * rect.height,
          });
        }
      }
    });
    return pts;
  });
  expect(targetOrbScreen.length).toBeGreaterThanOrEqual(1);
  await page.mouse.click(targetOrbScreen[0].x, targetOrbScreen[0].y);
  await expect(statusPill).toBeHidden();

  const finalState = await state(page);
  expect(finalState.cables?.length).toBe(1);
  expect(errors).toEqual([]);
});

test('41. DP 线细分双头 DP 与 DP 转 Type-C 两种类型，端口匹配与 3D 接头切换校验', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await resetToCleanMonitorDesk(page);
  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  const signalZone = page.getByRole('region', { name: '信号与音频线缆' });
  const dualDpBtn = signalZone.getByRole('button', { name: '双头 DP', exact: true });
  const dpTypeCBtn = signalZone.getByRole('button', { name: 'DP ↔ Type-C', exact: true });
  await expect(dualDpBtn).toBeVisible();
  await expect(dpTypeCBtn).toBeVisible();

  // 1. 选择「双头 DP」：起点与终点仅允许 DP 接口，不会混入 Type-C
  await dualDpBtn.click();
  const fromSelect = page.getByLabel('左侧起点接口', { exact: true });
  const toSelect = page.getByLabel('左侧终点接口', { exact: true });
  await expect(fromSelect.locator('option', { hasText: /Thunderbolt|Type-C|USB-C/ })).toHaveCount(
    0,
  );
  await expect(toSelect.locator('option', { hasText: /MacBook/ })).toHaveCount(0);

  // 2. 选择「DP ↔ Type-C」：连接显示器 DP 与 MacBook Thunderbolt/USB-C，端头分别记录 dp 与 usbc
  await dpTypeCBtn.click();
  const monitorDpVal = await fromSelect
    .locator('option', { hasText: /显示器.*DisplayPort/ })
    .first()
    .getAttribute('value');
  expect(monitorDpVal).toBeTruthy();
  await fromSelect.selectOption(monitorDpVal!);

  const mbUsbcVal = await toSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C)/ })
    .first()
    .getAttribute('value');
  expect(mbUsbcVal).toBeTruthy();
  await toSelect.selectOption(mbUsbcVal!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();

  const cur = await state(page);
  expect(cur.cables?.length).toBe(1);
  expect(cur.cables?.[0].kind).toBe('dp');
  expect(cur.cables?.[0].fromPlugType).toBe('dp');
  expect(cur.cables?.[0].toPlugType).toBe('usbc');
  await expect(page.locator('.wired-cable-list')).toContainText('DP ↔ Type-C');

  // 3. 进入 3D 连线检查 DP 端 ↔ Type-C 端可通过空格切换且显示对应接头文字
  await page.getByRole('button', { name: '进入 3D 点选端口接线', exact: true }).click();
  const statusPill = page.getByRole('status');
  await expect(statusPill).toContainText('手持 A 端(DP接头)');
  await page.keyboard.press('Space');
  await expect(statusPill).toContainText('手持 B 端(Type-C接头)');
  await page.getByRole('button', { name: '退出 3D 点选端口接线', exact: true }).click();

  expect(errors).toEqual([]);
});

test('42. 人工拖拽编辑线缆节点后仍受重力落地，无桌板斜穿模及异构 Type-C 接头断缝', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await resetToCleanMonitorDesk(page);
  await library(page);
  await page.getByRole('button', { name: '添加桌面音响', exact: true }).click();
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  const signalZone = page.getByRole('region', { name: '信号与音频线缆' });
  await signalZone.getByRole('button', { name: 'DP ↔ Type-C', exact: true }).click();

  const fromSelect = page.getByLabel('左侧起点接口', { exact: true });
  const toSelect = page.getByLabel('左侧终点接口', { exact: true });
  const monDp = await fromSelect
    .locator('option', { hasText: /显示器.*DisplayPort/ })
    .first()
    .getAttribute('value');
  await fromSelect.selectOption(monDp!);
  const mbUsbc = await toSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C)/ })
    .first()
    .getAttribute('value');
  await toSelect.selectOption(mbUsbc!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();

  // 从右后方高角度（与工位连线视角一致）清楚观察显示器背面→音响旁侧→MacBook Type-C 接头整段走线
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.18, 0.76, -0.08);
    camera.position.set(0.88, 1.08, -0.78);
    camera.lookAt(0.18, 0.76, -0.08);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });

  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/cable-straight-around-speaker.png',
  });

  // 在界面中点击已接线列表选中该 DP↔Type-C 线缆并用右键菜单/节点拖拽方式移动节点后校验
  await page.locator('.wired-cable-item').first().click();
  await page.waitForTimeout(200);

  // 从已渲染线缆控制球拖拽一个节点向外侧移动，然后核验渲染曲线无桌面内部穿模点、无空中浮空点
  const handleScreen = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const { scene, camera } = _roots.get(canvas).store.getState();
    camera.updateMatrixWorld();
    const pts: { x: number; y: number }[] = [];
    scene.traverse((obj: any) => {
      if (obj.parent?.name?.startsWith('cable-handles-') && obj.parent.children) {
        for (const ch of obj.parent.children) {
          if (ch.isGroup) {
            const v = ch.position.clone().project(camera);
            pts.push({
              x: rect.left + ((v.x + 1) / 2) * rect.width,
              y: rect.top + ((-v.y + 1) / 2) * rect.height,
            });
          }
        }
      }
    });
    return pts;
  });
  expect(handleScreen.length).toBeGreaterThanOrEqual(1);
  const h0 = handleScreen[0];
  await page.mouse.move(h0.x, h0.y);
  await page.mouse.down();
  await page.mouse.move(h0.x + 48, h0.y + 18, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const curAfterDrag = await state(page);
  expect(curAfterDrag.cables?.[0]?.waypoints?.length).toBeGreaterThanOrEqual(1);

  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/manual-cable-gravity-clean.png',
  });

  expect(errors).toEqual([]);
});

test('monitor stock stand stops pitch at column front face without clipping and supports dual yaw (base vs ±30° screen)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await ready(page);

  await selectSceneItem(page, '27 寸显示器');
  await expect(page.getByLabel('俯仰角度', { exact: true })).toBeVisible();
  await expect(page.getByLabel('屏幕左右旋转', { exact: true })).toBeVisible();
  await expect(page.getByLabel('底座整体旋转', { exact: true })).toBeVisible();

  // Verify 3D gizmo renders screen-only swivel arc & handle alongside base yaw ring
  const gizmoNames = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { scene } = _roots.get(canvas).store.getState();
    const names: string[] = [];
    scene.traverse((obj: any) => {
      if (obj.name?.startsWith('item-')) names.push(obj.name);
    });
    return names;
  });
  expect(gizmoNames).toContain('item-rotate-handle');
  expect(gizmoNames).toContain('item-screen-yaw-arc');
  expect(gizmoNames).toContain('item-screen-yaw-handle');
  expect(gizmoNames).toContain('item-pitch-handle');
  expect(gizmoNames).toContain('item-roll-handle');

  // 1. Pitch forward (+25°) must stop cleanly at stand column front face (< 13°) without slicing through column
  await editNumber(page, '俯仰角度', '25');
  const pitchedState = await state(page);
  const pitchedMon = pitchedState.items.find((i: any) => i.kind === 'monitor')!;
  expect(pitchedMon.pitch).toBeGreaterThan(5);
  expect(pitchedMon.pitch).toBeLessThan(19);

  // Rear-left close-up matching user report angle (media_1794990514044_9fef4084.jpg)
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.94, -0.2);
    camera.position.set(-0.34, 0.96, -0.68);
    camera.lookAt(0, 0.94, -0.2);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/monitor-pitch-limit-clean.png',
  });

  // 2. Dual Yaw dimensions: screenYaw clamped to +-30° independent of 360° base rotation
  await editNumber(page, '俯仰角度', '0');
  await editNumber(page, '屏幕左右旋转', '45');
  await expect(
    page.locator('label.number-field.field-invalid', { hasText: '屏幕左右旋转' }),
  ).toBeVisible();
  await editNumber(page, '屏幕左右旋转', '30');
  const clampedRight = (await state(page)).items.find((i: any) => i.kind === 'monitor')!;
  expect(clampedRight.screenYaw).toBe(30);
  expect(clampedRight.rotation).toBe(0);

  await editNumber(page, '屏幕左右旋转', '-30');
  const clampedLeft = (await state(page)).items.find((i: any) => i.kind === 'monitor')!;
  expect(clampedLeft.screenYaw).toBe(-30);
  expect(clampedLeft.rotation).toBe(0);

  // Combine base yaw (15°) + screen-only yaw (30°) so both dimensions act independently & visibly
  await editNumber(page, '底座整体旋转', '15');
  await editNumber(page, '屏幕左右旋转', '30');
  const dualYawMon = (await state(page)).items.find((i: any) => i.kind === 'monitor')!;
  expect(dualYawMon.rotation).toBe(15);
  expect(dualYawMon.screenYaw).toBe(30);

  // Front-top-right angle clearly showing rotated base platter + 30° further swiveled screen + dual yaw gizmo
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0, 0.96, -0.15);
    camera.position.set(0.55, 1.38, 0.72);
    camera.lookAt(0, 0.96, -0.15);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/monitor-dual-yaw.png',
  });

  // 3. Replicate user's exact scenario (lowered lift + screenYaw + negative pitch + DP->MacBook cable):
  //    verify upper Dell dome never clips the top column cap AND cable never clips the monitor baseplate!
  await editNumber(page, '底座整体旋转', '0');
  await editNumber(page, '屏幕左右旋转', '30');
  await editNumber(page, '屏幕高度', '-5');
  await editNumber(page, '俯仰角度', '-21');

  await library(page);
  await page.getByRole('button', { name: '添加桌面音响', exact: true }).click();
  await editNumber(page, '左右位置', '28');
  await editNumber(page, '前后位置', '-14');
  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '50');
  await editNumber(page, '前后位置', '14');
  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  const sigZone = page.getByRole('region', { name: '信号与音频线缆' });
  await sigZone.getByRole('button', { name: 'DP ↔ Type-C', exact: true }).click();
  const fromSel = page.getByLabel('左侧起点接口', { exact: true });
  const toSel = page.getByLabel('左侧终点接口', { exact: true });
  const dpVal = await fromSel
    .locator('option', { hasText: /显示器.*DisplayPort/ })
    .first()
    .getAttribute('value');
  await fromSel.selectOption(dpVal!);
  const mbVal = await toSel
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C)/ })
    .first()
    .getAttribute('value');
  await toSel.selectOption(mbVal!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await selectSceneItem(page, '27 寸显示器');

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.06, 0.88, -0.14);
    camera.position.set(0.56, 1.06, -0.74);
    camera.lookAt(0.06, 0.88, -0.14);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/monitor-top-col-and-base-cable-clean.png',
  });

  // High rear-right view matching user screenshot (media_1794994459916_eeee8f63.jpg) showing straight desktop cable around speaker
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.24, 0.8, -0.04);
    camera.position.set(0.86, 1.38, -0.72);
    camera.lookAt(0.24, 0.8, -0.04);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/cable-straight-desktop-around-speaker.png',
  });

  expect(errors).toEqual([]);
});

test('43. 定长线缆禁止超长拉伸且保持固定长度，并避免穿入桌下横杠', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await resetToCleanMonitorDesk(page);

  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '68');
  await editNumber(page, '前后位置', '20');

  // 1. 选择固定 0.8 m Type-C 线连接远端设备 -> 直接报错且不添加线缆
  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  const signalZone = page.getByRole('region', { name: '信号与音频线缆' });
  await signalZone.getByRole('button', { name: '双头 Type-C', exact: true }).click();
  const lenGroup = page.getByRole('group', { name: '左栏线缆长度' });
  await lenGroup.getByRole('button', { name: '0.8m', exact: true }).click();

  const fromSelect = page.getByLabel('左侧起点接口', { exact: true });
  const toSelect = page.getByLabel('左侧终点接口', { exact: true });
  const monUsbc = await fromSelect
    .locator('option', { hasText: /显示器.*(Thunderbolt|USB-C|Type-C)/ })
    .first()
    .getAttribute('value');
  await fromSelect.selectOption(monUsbc!);
  const mbUsbc = await toSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C|雷雳)/ })
    .first()
    .getAttribute('value');
  await toSelect.selectOption(mbUsbc!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.getByText(/线缆长度不足/)).toBeVisible();
  expect((await state(page)).cables ?? []).toHaveLength(0);

  // 2. 切换为固定 2 m 后成功连接，并在桌面维持实际 ~2.0 m 走线余量（不被拉缩成最短直线）
  await lenGroup.getByRole('button', { name: '2m', exact: true }).click();
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(1);
  await page.locator('.wired-cable-item').first().click();
  await expect(page.getByText(/线身 .* · 需 (1\.9[4-9]|2\.0[0-5]) m/)).toBeVisible();
  // Trying to shrink the connected fixed 2 m cable to 0.8 m directly fails without modifying it
  await page
    .getByRole('group', { name: '线缆长度预设' })
    .getByRole('button', { name: '0.8m', exact: true })
    .click();
  await expect(page.getByText(/线缆长度不足/)).toBeVisible();
  expect((await state(page)).cables![0].lengthM).toBe(2);

  // 俯视斜后方确认固定 2 m 桌面多余线长形成整齐顺滑服务弯而非密集锯齿
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.28, 0.78, -0.04);
    camera.position.set(0.75, 1.48, -0.68);
    camera.lookAt(0.28, 0.78, -0.04);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/cable-fixed-length-loop.png',
  });

  // 3. 添加地面插座并从显示器接入电源线（绕桌后缘下桌），核验绕开桌下后横梁不穿杠
  await library(page);
  await page.getByRole('button', { name: '添加墙面 / 地面插座', exact: true }).click();
  await page.getByRole('button', { name: '附着地面', exact: true }).click();
  await editNumber(page, '左右位置', '24');
  await editNumber(page, '前后位置', '-14');

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  const powerZone = page.getByRole('region', { name: '充电线与电源线专区' });
  await powerZone.locator('button').first().click();
  await lenGroup.getByRole('button', { name: '1.8m', exact: true }).click();
  const pFrom = page.getByLabel('左侧起点接口', { exact: true });
  const pTo = page.getByLabel('左侧终点接口', { exact: true });
  const monAc = await pFrom
    .locator('option', { hasText: /显示器.*(电源|AC)/ })
    .first()
    .getAttribute('value');
  await pFrom.selectOption(monAc!);
  const floorAc = await pTo.locator('option', { hasText: /插座/ }).first().getAttribute('value');
  await pTo.selectOption(floorAc!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(2);

  // 桌下视角对照用户截图 (media_1794995068859_344718a8.png) 查看桌下银色后横梁无穿模
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.05, 0.58, -0.32);
    camera.position.set(0.45, 0.56, 0.38);
    camera.lookAt(0.05, 0.58, -0.32);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/cable-under-desk-crossbar-clean.png',
  });

  expect(errors).toEqual([]);
});

test('44. Type-C 分为双头 Type-C 与 USB ↔ Type-C 且不自动附带插头（插头为额外配件）', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await resetToCleanMonitorDesk(page);

  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '38');
  await editNumber(page, '前后位置', '14');

  await library(page);
  await page.getByRole('button', { name: '添加智能桌面插排', exact: true }).click();
  await editNumber(page, '左右位置', '-42');
  await editNumber(page, '前后位置', '-18');

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();

  // 1. 信号与音频线明确分为“双头 Type-C”和“USB ↔ Type-C”，不再存在单一 Type-C 按钮
  const signalZone = page.getByRole('region', { name: '信号与音频线缆' });
  await expect(signalZone.getByRole('button', { name: '双头 Type-C', exact: true })).toBeVisible();
  await expect(signalZone.getByRole('button', { name: 'USB ↔ Type-C', exact: true })).toBeVisible();
  await expect(signalZone.getByRole('button', { name: 'Type-C', exact: true })).toHaveCount(0);

  // 2. 选择“USB ↔ Type-C”，将显示器 USB-A 下行口连向 MacBook Type-C 口，且默认不附带充电头
  await signalZone.getByRole('button', { name: 'USB ↔ Type-C', exact: true }).click();
  const accessorySelect = page.getByLabel('额外插头配件', { exact: true });
  await expect(accessorySelect).toBeVisible();
  await expect(accessorySelect).toHaveValue('');

  const fromSelect = page.getByLabel('左侧起点接口', { exact: true });
  const toSelect = page.getByLabel('左侧终点接口', { exact: true });
  const monUsba = await fromSelect
    .locator('option', { hasText: /显示器.*USB-A/ })
    .first()
    .getAttribute('value');
  expect(monUsba).toBeTruthy();
  await fromSelect.selectOption(monUsba!);

  const mbUsbc = await toSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C|Type-C|雷雳)/ })
    .first()
    .getAttribute('value');
  expect(mbUsbc).toBeTruthy();
  await toSelect.selectOption(mbUsbc!);

  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(1);
  await expect(page.locator('.wired-cable-item').first()).toContainText('USB ↔ Type-C');

  let c0 = (await state(page)).cables![0];
  expect(c0.fromPlugType).toBe('usba');
  expect(c0.toPlugType).toBe('usbc');

  // 3. 充电线专区中的“双头 Type-C 供电线”默认无充电头配件，不直接接入 220V AC 插孔，仅直连插排 Type-C 快充口
  const powerZone = page.getByRole('region', { name: '充电线与电源线专区' });
  await expect(powerZone.getByRole('button', { name: /双头 Type-C 供电线/ })).toBeVisible();
  await expect(powerZone.getByRole('button', { name: /USB 转 Type-C 供电线/ })).toBeVisible();
  await powerZone.getByRole('button', { name: /双头 Type-C 供电线/ }).click();
  await expect(accessorySelect).toHaveValue('');

  const mbFromOpt = await fromSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C|Type-C|雷雳)/ })
    .first()
    .getAttribute('value');
  expect(mbFromOpt).toBeTruthy();
  await fromSelect.selectOption(mbFromOpt!);

  await expect(toSelect.locator('option', { hasText: /插排.*AC 插孔/ })).toHaveCount(0);
  const stripUsbcOpt = await toSelect
    .locator('option', { hasText: /插排.*Type-C 快充口/ })
    .first()
    .getAttribute('value');
  expect(stripUsbcOpt).toBeTruthy();
  await toSelect.selectOption(stripUsbcOpt!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(2);

  const c1NoPlug = (await state(page)).cables![1];
  expect(c1NoPlug.fromPlugType).toBe('usbc');
  expect(c1NoPlug.toPlugType).toBe('usbc');

  // 4. 仅当显式选配额外插头配件（如 GaN 快充头）后，才解锁 AC 插孔并配备对应充电头
  await page
    .getByRole('group', { name: '左栏线缆长度' })
    .getByRole('button', { name: '1.5m', exact: true })
    .click();
  const mbFromOpt2 = await fromSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C|Type-C|雷雳)/ })
    .nth(1)
    .getAttribute('value');
  await fromSelect.selectOption(mbFromOpt2!);
  await accessorySelect.selectOption('ganAdapter');
  const stripAcOpt = await toSelect
    .locator('option', { hasText: /插排.*AC 插孔/ })
    .first()
    .getAttribute('value');
  expect(stripAcOpt).toBeTruthy();
  await toSelect.selectOption(stripAcOpt!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(3);
  const c2WithGan = (await state(page)).cables![2];
  expect(c2WithGan.toPlugType).toBe('ganAdapter');

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.08, 0.78, -0.02);
    camera.position.set(0.55, 1.32, -0.62);
    camera.lookAt(0.08, 0.78, -0.02);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/typec-dual-and-usba-clean.png',
  });

  expect(errors).toEqual([]);
});

test('45. 3D 放置悬垂线缆与移动已接线设备均严禁拉伸超过固定长度', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await resetToCleanMonitorDesk(page);

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  await page
    .getByRole('region', { name: '信号与音频线缆' })
    .getByRole('button', { name: '双头 Type-C', exact: true })
    .click();
  await page
    .getByRole('group', { name: '左栏线缆长度' })
    .getByRole('button', { name: '0.8m', exact: true })
    .click();
  await page.getByRole('button', { name: '进入 3D 点选端口接线', exact: true }).click();

  // 将视角摆至右后侧俯视（避开遮挡），清晰点击音响/显示器完全无遮挡的绿色端口球
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.05, 0.85, -0.05);
    camera.position.set(0.55, 1.35, 0.72);
    camera.lookAt(0.05, 0.85, -0.05);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });

  // 找到第一个可直击的绿色可用端口球并点击锁定 A 端（自动切换至手持 B 端）
  const monOrb = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const { scene, camera } = _roots.get(canvas).store.getState();
    camera.updateMatrixWorld();
    const pts: { x: number; y: number }[] = [];
    scene.traverse((obj: any) => {
      if (
        obj.isMesh &&
        obj.geometry?.type === 'SphereGeometry' &&
        obj.material?.color?.getHexString?.() === '22c55e'
      ) {
        const v = obj.position.clone().project(camera);
        if (v.z >= -1 && v.z <= 1) {
          pts.push({
            x: rect.left + ((v.x + 1) / 2) * rect.width,
            y: rect.top + ((-v.y + 1) / 2) * rect.height,
          });
        }
      }
    });
    return pts[0];
  });
  expect(monOrb).toBeTruthy();
  await page.mouse.click(monOrb!.x, monOrb!.y);
  await expect(page.getByRole('status')).toContainText('手持 B 端');

  // 将相机拉高俯视后方全桌面，并把光标移到桌面右侧（远超 0.8 m），验证实时线身严格保持 <= 0.8 m 且不再伸长
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.0, 0.8, 0.02);
    camera.position.set(0.0, 1.72, -1.08);
    camera.lookAt(0.0, 0.8, 0.02);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  const canvasRect = await page.locator('canvas').boundingBox();
  expect(canvasRect).toBeTruthy();
  await page.mouse.move(
    canvasRect!.x + canvasRect!.width * 0.88,
    canvasRect!.y + canvasRect!.height * 0.56,
    { steps: 8 },
  );
  await page.waitForTimeout(320);

  const liveMetrics = await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const { scene } = _roots.get(document.querySelector('canvas')!).store.getState();
    const tube = scene.getObjectByName('live-wiring-cable-tube');
    const nodes = (tube?.userData?.liveNodes ?? []) as { x: number; y: number; z: number }[];
    let totalLen = 0;
    for (let i = 1; i < nodes.length; i++) {
      totalLen += Math.hypot(
        nodes[i].x - nodes[i - 1].x,
        nodes[i].y - nodes[i - 1].y,
        nodes[i].z - nodes[i - 1].z,
      );
    }
    const start = nodes[0];
    const end = nodes[nodes.length - 1];
    const span = start && end ? Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) : 0;
    return { count: nodes.length, totalLen, span };
  });
  expect(liveMetrics.count).toBeGreaterThanOrEqual(8);
  expect(liveMetrics.totalLen).toBeLessThanOrEqual(0.8);
  expect(liveMetrics.span).toBeLessThanOrEqual(0.79);

  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/live-wiring-no-stretch-taut.png',
  });

  await page.keyboard.press('Escape');

  // 验证已接线缆的设备向远处移动时同样受固定线长牵引限位，不会把线缆拉长
  await library(page);
  await page.getByRole('button', { name: '添加MacBook', exact: true }).click();
  await editNumber(page, '左右位置', '32');
  await editNumber(page, '前后位置', '14');

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  await page
    .getByRole('region', { name: '信号与音频线缆' })
    .getByRole('button', { name: '双头 Type-C', exact: true })
    .click();
  await page
    .getByRole('group', { name: '左栏线缆长度' })
    .getByRole('button', { name: '1m', exact: true })
    .click();
  const fromSelect = page.getByLabel('左侧起点接口', { exact: true });
  const toSelect = page.getByLabel('左侧终点接口', { exact: true });
  const monUsbc = await fromSelect
    .locator('option', { hasText: /显示器.*(Thunderbolt|USB-C|Type-C)/ })
    .first()
    .getAttribute('value');
  await fromSelect.selectOption(monUsbc!);
  const mbUsbc = await toSelect
    .locator('option', { hasText: /MacBook.*(Thunderbolt|USB-C|雷雳)/ })
    .first()
    .getAttribute('value');
  await toSelect.selectOption(mbUsbc!);
  await page.getByRole('button', { name: '确认接线', exact: true }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(1);

  await selectSceneItem(page, 'MacBook');
  await editNumber(page, '左右位置', '95');
  await expect(page.getByText(/已达固定线缆长度极限/)).toBeVisible();
  const st = await state(page);
  const movedMb = st.items.find((i: SceneItem) => i.kind === 'macbook')!;
  expect(movedMb.x).toBeLessThan(0.95);

  expect(errors).toEqual([]);
});

test('46. 初始场景仅保留显示器与 MacBook 并默认插好双头 Type-C 连线', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await ready(page);
  await expect(page).toHaveTitle(/桌构 DeskCraft/);
  await expect(page.locator('.brand')).toContainText('桌构DeskCraft');
  const st = await state(page);
  expect(st.items.map((i: SceneItem) => i.kind)).toEqual(['monitor', 'macbook']);
  expect(st.cables ?? []).toHaveLength(1);
  expect(st.cables![0].kind).toBe('usbc');
  expect(st.cables![0].fromPlugType).toBe('usbc');
  expect(st.cables![0].toPlugType).toBe('usbc');

  await page.locator('.library-tabs button', { hasText: '线缆' }).click();
  await expect(page.locator('.wired-cable-item')).toHaveCount(1);
  await expect(page.locator('.wired-cable-item').first()).toContainText('双头 Type-C');

  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.06, 0.85, -0.04);
    camera.position.set(0.58, 1.28, -0.82);
    camera.lookAt(0.06, 0.85, -0.04);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/initial-scene-monitor-macbook-wired.png',
  });

  // Close-up on MacBook left Type-C port matching user photo to verify smooth coaxial strain-relief exit
  await page.evaluate(async () => {
    const r3fPath = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith('/@react-three_fiber.js'))!;
    const { _roots } = await import(/* @vite-ignore */ r3fPath);
    const canvas = document.querySelector('canvas')!;
    const { camera, controls, invalidate } = _roots.get(canvas).store.getState();
    controls.target.set(0.16, 0.77, 0.01);
    camera.position.set(0.14, 0.96, 0.28);
    camera.lookAt(0.16, 0.77, 0.01);
    controls.update();
    invalidate();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.locator('canvas').screenshot({
    path: 'C:/Users/Leon/.gemini/antigravity/brain/77106729-550e-46ed-bc9d-f21a6207463d/cable-end-resilience-closeup.png',
  });

  expect(errors).toEqual([]);
});

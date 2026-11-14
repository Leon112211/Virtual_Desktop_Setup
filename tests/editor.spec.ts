import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
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
async function texturedFixture(page: Page) {
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
  return Buffer.from(JSON.stringify(model));
}
async function state(page: Page) {
  return page.evaluate(async () => {
    // Match Vite's actual HMR URL; importing the bare URL can create a second store.
    const path = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname === '/src/store/editorStore.ts')
      .at(-1)!;
    const { useEditor } = await import(/* @vite-ignore */ path);
    return useEditor.getState().project;
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
  camera.lookAt(0, p.desk.height * 0.65, 0);
  camera.updateMatrixWorld();
  const point = new Vector3(item.x, p.desk.height + item.size.height * 0.8, item.z).project(camera);
  const x = rect.x + ((point.x + 1) * rect.width) / 2,
    y = rect.y + ((1 - point.y) * rect.height) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 12, { steps: 8 });
  await page.mouse.up();
  const after = await state(page);
  expect(
    Math.abs(after.items.find((i: { id: string }) => i.id === item.id).x - item.x),
  ).toBeGreaterThan(0.01);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await state(page)).items.find((i: { id: string }) => i.id === item.id).x).toBe(item.x);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 10, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
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
  expect(monitor.size.width).toBeCloseTo(0.709, 2);
  expect(monitor.size.height).toBeCloseTo(0.554, 2);
  expect(monitor.size.depth).toBeCloseTo(0.24, 2);
  // 微调面板宽度：总高随 16:9 屏幕变化，支架保持 15 cm
  await editNumber(page, '面板宽度', '80');
  p = await state(page);
  const size = p.items.find((i: { kind: string }) => i.kind === 'monitor').size;
  expect(size.width).toBeCloseTo(0.8, 2);
  expect(size.height).toBeCloseTo(0.15 + (0.8 - 0.012) * (9 / 16) + 0.012, 3);
  await expect(page.locator('.monitor-note')).toContainText('16:9');
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

import { openDB, type DBSchema } from 'idb';
import { projectSchema, type Project } from '../domain/project';
import { removeRetiredItems } from './legacyProject';

interface DeskspaceDatabase extends DBSchema {
  projects: { key: string; value: unknown };
  assets: { key: string; value: Blob };
}

const openRepository = () =>
  openDB<DeskspaceDatabase>('deskspace', 1, {
    upgrade(db) {
      db.createObjectStore('projects');
      db.createObjectStore('assets');
    },
  });

function validateProject(value: unknown): Project {
  const result = projectSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      `工程数据无效：${result.error.issues.map((issue) => issue.message).join('；')}`,
    );
  return result.data;
}

/** The snapshot and its complete resource set commit together, never independently. */
export async function saveProject(project: Project, blobs: Map<string, Blob>): Promise<void> {
  const snapshot = validateProject(project);
  // Check before opening a transaction: a missing resource must not replace a good snapshot.
  const resources = snapshot.assets.map((asset) => {
    const blob = blobs.get(asset.id);
    if (!(blob instanceof Blob))
      throw new Error(`无法保存工程：缺少模型资源「${asset.name || asset.id}」`);
    if (blob.size !== asset.bytes)
      throw new Error(`无法保存工程：模型资源「${asset.name || asset.id}」字节数不匹配`);
    return { id: asset.id, blob };
  });
  let db: Awaited<ReturnType<typeof openRepository>> | undefined;
  try {
    db = await openRepository();
    const tx = db.transaction(['projects', 'assets'], 'readwrite');
    // Observe rejection immediately, including failures before we reach the final await.
    const committed = tx.done;
    void committed.catch(() => undefined);
    try {
      const assetStore = tx.objectStore('assets');
      const wanted = new Set(resources.map((resource) => resource.id));
      // Convert synchronous IDB exceptions to observed promise rejections too;
      // otherwise an exception while queuing a later request can orphan earlier ones.
      const request = <T>(operation: () => Promise<T>) => Promise.resolve().then(operation);
      await Promise.all([
        request(() => tx.objectStore('projects').put(snapshot, 'current')),
        ...resources.map((resource) => request(() => assetStore.put(resource.blob, resource.id))),
        request(() => assetStore.getAllKeys()).then((keys) =>
          Promise.all(
            keys
              .filter((key) => !wanted.has(key))
              .map((key) => request(() => assetStore.delete(key))),
          ),
        ),
      ]);
      await committed;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A failed transaction may already be aborted. */
      }
      await committed.catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const quota = error instanceof Error && error.name === 'QuotaExceededError';
    throw new Error(
      quota
        ? '保存失败：浏览器存储空间不足，请导出工程备份或释放空间。'
        : '保存工程失败，本次更改未写入。',
      { cause: error },
    );
  } finally {
    db?.close();
  }
}

export async function loadProject(): Promise<{
  project: Project;
  blobs: Map<string, Blob>;
} | null> {
  const db = await openRepository();
  try {
    const tx = db.transaction(['projects', 'assets'], 'readonly');
    const committed = tx.done;
    void committed.catch(() => undefined);
    const stored = await tx.objectStore('projects').get('current');
    if (stored === undefined) {
      await committed;
      return null;
    }
    const project = validateProject(removeRetiredItems(stored));
    const values = await Promise.all(
      project.assets.map((asset) => tx.objectStore('assets').get(asset.id)),
    );
    await committed;
    const blobs = new Map<string, Blob>();
    values.forEach((blob, index) => {
      // Missing/corrupted blobs deliberately leave metadata intact for UI placeholders.
      if (blob instanceof Blob) blobs.set(project.assets[index].id, blob);
    });
    return { project, blobs };
  } finally {
    db.close();
  }
}

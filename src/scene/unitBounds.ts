// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { Box3, Matrix4, Mesh, Object3D, Vector3 } from 'three';

/** Measure in the content root's coordinates, independent of the desk/item transforms. */
export function unitBounds(root: Object3D) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const relative = new Matrix4();
  const bounds = new Box3();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    relative.multiplyMatrices(inverse, mesh.matrixWorld);
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
  });
  const size = bounds.getSize(new Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) throw new Error('内置模型尺寸无效');
  const center = bounds.getCenter(new Vector3());
  return {
    scale: new Vector3(1 / size.x, 1 / size.y, 1 / size.z),
    position: new Vector3(-center.x / size.x, -bounds.min.y / size.y, -center.z / size.z),
  };
}

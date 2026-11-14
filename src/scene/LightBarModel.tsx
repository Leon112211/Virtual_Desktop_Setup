import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { unitBounds } from './unitBounds';
import lightbarUrl from '../assets/models/lightbar.glb?url';

// The Xiaomi Mijia monitor light bar, bundled as a built-in. The exported GLB
// carries only vertex positions (no normals, materials or textures), so we
// compute normals and apply the item's colour, then normalise to a bottom-centred
// unit box exactly like the procedural built-ins — SceneItem scales it by item.size.
export function LightBarModel({ color }: { color: string }) {
  const { scene } = useGLTF(lightbarUrl);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeVertexNormals();
      mesh.material = new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const transform = unitBounds(clone);
    const wrapper = new Group();
    wrapper.scale.copy(transform.scale);
    wrapper.position.copy(transform.position);
    wrapper.add(clone);
    return wrapper;
  }, [scene, color]);
  return <primitive object={model} dispose={null} />;
}

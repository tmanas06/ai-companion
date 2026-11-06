import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const loader = new GLTFLoader();
loader.load(
  './apps/web/public/models/aria_photorealistic.glb',
  (gltf) => {
    console.log('=== SCENE ===');
    console.log('Scene children:', gltf.scene.children.length);
    
    let meshCount = 0;
    let skinnedMeshCount = 0;
    let materialCount = 0;
    const materials = new Set();
    const morphTargets = new Set();
    const textureInfo = [];
    
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        if (child.isSkinnedMesh) skinnedMeshCount++;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          materials.add(m.uuid);
          materialCount++;
          if (m.map) {
            textureInfo.push({
              mesh: child.name,
              material: m.name || 'unnamed',
              map: m.map.image ? m.map.image.width + 'x' + m.map.image.height : 'no image',
              encoding: m.map.encoding
            });
          }
          if (m.normalMap) {
            textureInfo.push({
              mesh: child.name,
              material: m.name || 'unnamed',
              normalMap: m.normalMap.image ? m.normalMap.image.width + 'x' + m.normalMap.image.height : 'no image'
            });
          }
          if (m.roughnessMap) {
            textureInfo.push({
              mesh: child.name,
              material: m.name || 'unnamed',
              roughnessMap: m.roughnessMap.image ? m.roughnessMap.image.width + 'x' + m.roughnessMap.image.height : 'no image'
            });
          }
        });
        
        if (child.morphTargetDictionary) {
          Object.keys(child.morphTargetDictionary).forEach(k => morphTargets.add(k));
        }
      }
    });
    
    console.log('Mesh count:', meshCount);
    console.log('SkinnedMesh count:', skinnedMeshCount);
    console.log('Unique materials:', materials.size);
    console.log('Total material slots:', materialCount);
    console.log('Morph targets:', Array.from(morphTargets).sort());
    console.log('Morph target count:', morphTargets.size);
    console.log('');
    console.log('=== TEXTURES ===');
    textureInfo.forEach(t => console.log(t));
    
    console.log('');
    console.log('=== ANIMATIONS ===');
    console.log('Embedded animations:', gltf.animations?.length || 0);
    gltf.animations?.forEach((clip, i) => {
      console.log(`  ${i}: ${clip.name} (${clip.duration.toFixed(2)}s)`);
    });
    
    console.log('');
    console.log('=== MODEL BOUNDS ===');
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    console.log('Size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
    console.log('Center:', center.x.toFixed(3), center.y.toFixed(3), center.z.toFixed(3));
    
    process.exit(0);
  },
  undefined,
  (err) => {
    console.error('Load error:', err);
    process.exit(1);
  }
);

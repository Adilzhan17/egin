import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export function batchStatic(root:T.Object3D){
  root.children.filter(child=>!(child instanceof T.Mesh)).forEach(batchStatic);
  const groups=new Map<T.Material,T.Mesh[]>();
  for(const child of root.children){if(child instanceof T.Mesh&&!Array.isArray(child.material)&&!(child instanceof T.InstancedMesh)){const list=groups.get(child.material)||[];list.push(child);groups.set(child.material,list);}}
  for(const [material,meshes] of groups){if(meshes.length<3)continue;const originals:T.BufferGeometry[]=[],clones=meshes.map(mesh=>{mesh.updateMatrix();originals.push(mesh.geometry);const clone=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return clone.applyMatrix4(mesh.matrix);});
    const merged=mergeGeometries(clones,false);clones.forEach(g=>g.dispose());if(!merged)continue;
    meshes.forEach(mesh=>root.remove(mesh));const combined=new T.Mesh(merged,material);combined.castShadow=true;combined.receiveShadow=true;root.add(combined);root.userData.retiredGeometries=[...(root.userData.retiredGeometries||[]),...originals];
  }
}

import * as T from 'three';
import type { CropId } from '../../../entities/field/types';

export type Plant = { group: T.Group; phase: number; stiffness: number };
export function random(seed: number) { let n = seed; return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; }; }
const up = new T.Vector3(0, 1, 0);

export function branch(a: T.Vector3, b: T.Vector3, radius: number, material: T.Material) {
  const delta = b.clone().sub(a);
  const mesh = new T.Mesh(new T.CylinderGeometry(radius * .65, radius, delta.length(), 6), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(up, delta.normalize());
  mesh.castShadow = true;
  return mesh;
}

function leaf(length: number, width: number, material: T.Material) {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, w = Math.sin(t * Math.PI) * width;
    vertices.push(-w, t * length, Math.sin(t * Math.PI) * .12, 0, t * length + .015, Math.sin(t * Math.PI) * .18, w, t * length, Math.sin(t * Math.PI) * .12);
    if (i < 8) for (let s = 0; s < 2; s++) { const n = i * 3 + s; indices.push(n, n + 3, n + 1, n + 1, n + 3, n + 4); }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, material); mesh.castShadow = true; return mesh;
}

export function createPlants(crop: CropId, stage: number): Plant[] {
  const rng = random(914), mature = stage === 3;
  const green = new T.MeshStandardMaterial({ color: mature && crop === 'wheat' ? '#a39b44' : '#729445', roughness: .8, side: T.DoubleSide });
  const lightGreen = new T.MeshStandardMaterial({ color: crop === 'wheat' ? (mature ? '#c5b46a' : '#a4b356') : '#6e9149', roughness: .73, side: T.DoubleSide });
  const darkGreen = new T.MeshStandardMaterial({ color: '#456d39', roughness: .83, side: T.DoubleSide });
  const wood = new T.MeshStandardMaterial({ color: '#7a593a', roughness: .94 });
  const fruit = new T.MeshStandardMaterial({ color: '#ce5034', roughness: .35 });
  const yellow = new T.MeshStandardMaterial({ color: '#ebbd37', roughness: .62, side: T.DoubleSide });
  const grain = new T.SphereGeometry(1, 6, 5);
  const result: Plant[] = [];
  const count = crop === 'wheat' ? 30 : crop === 'tomato' ? 3 : crop === 'sunflower' ? 5 : 1;
  for (let i = 0; i < count; i++) {
    const group = new T.Group(), h = (crop === 'apple' ? 1.9 : crop === 'sunflower' ? 1.5 : 1.12) + rng() * .4;
    group.position.set(crop === 'apple' ? 0 : ((i % (crop === 'wheat' ? 6 : 3)) - (crop === 'wheat' ? 2.5 : 1)) * (crop === 'wheat' ? .32 : .65) + rng() * .08, .08, crop === 'wheat' ? (Math.floor(i / 6) - 2) * .32 + rng() * .1 : crop === 'sunflower' ? (Math.floor(i / 3) - .5) * .8 : 0);
    const scale = [0.32, 0.66, .92, 1][stage] ?? .92;
    group.scale.setScalar(scale);
    if (crop === 'wheat') {
      group.add(branch(new T.Vector3(), new T.Vector3(.04, h, 0), .018, green));
      for (let j = 0; j < 3; j++) {
        const blade = leaf(.5 + rng() * .2, .036, j === 2 ? lightGreen : green);
        blade.position.set(0, .26 + j * .27, 0); blade.rotation.set(.25, i * 2 + j * 2.6, (j % 2 ? -1 : 1) * .85); group.add(blade);
      }
      if (stage >= 2) {
        const head = new T.Group(); head.position.set(.04, h - .09, 0); head.rotation.z = -.06 - rng() * .13;
        head.add(branch(new T.Vector3(), new T.Vector3(0, .48, 0), .012, lightGreen));
        const grains = new T.InstancedMesh(grain, lightGreen, 18), dummy = new T.Object3D(), awns: number[] = [];
        for (let k = 0; k < 18; k++) {
          const side = k % 2 ? -1 : 1, row = Math.floor(k / 2), y = row * .041, size = 1 - row * .045;
          dummy.position.set(side * .038, y + .025, (k % 3 - 1) * .017); dummy.rotation.set(.16, 0, side * -.53); dummy.scale.set(.052 * size, .079 * size, .038 * size); dummy.updateMatrix(); grains.setMatrixAt(k, dummy.matrix);
          awns.push(side * .06, y + .08, 0, side * (.12 + .01 * row), y + .23, 0);
        }
        grains.castShadow = true; head.add(grains);
        const awnGeo = new T.BufferGeometry(); awnGeo.setAttribute('position', new T.Float32BufferAttribute(awns, 3));
        head.add(new T.LineSegments(awnGeo, new T.LineBasicMaterial({ color: mature ? '#b6a359' : '#91a450', transparent: true, opacity: .7 })));
        group.add(head);
      }
    } else if (crop === 'tomato') {
      group.add(branch(new T.Vector3(), new T.Vector3(0, h, 0), .038, green));
      group.add(branch(new T.Vector3(.13, 0, 0), new T.Vector3(.13, h + .15, 0), .018, wood));
      for (let j = 0; j < 7; j++) {
        const angle = j * 2.4, end = new T.Vector3(Math.sin(angle) * .4, .3 + j * .135, Math.cos(angle) * .34);
        group.add(branch(new T.Vector3(0, .25 + j * .14, 0), end, .012, green));
        const blade = leaf(.45, .12, j % 2 ? green : darkGreen); blade.position.copy(end); blade.rotation.set(.5, angle, -.7); group.add(blade);
        if (stage === 3 && j < 6) {
          const tomato = new T.Mesh(new T.SphereGeometry(.125 + rng() * .04, 14, 10), j < 4 ? fruit : lightGreen);
          tomato.scale.y = .9; tomato.position.copy(end).add(new T.Vector3(0, -.12, 0)); tomato.castShadow = true; group.add(tomato);
          for (let l = 0; l < 5; l++) { const sepal = leaf(.10, .02, darkGreen); sepal.position.copy(tomato.position).add(new T.Vector3(0, .12, 0)); sepal.rotation.set(1.3, l * 1.25, 0); group.add(sepal); }
        } else if (stage === 2) {
          const bloom = new T.Mesh(new T.SphereGeometry(.055, 6, 5), yellow); bloom.position.copy(end); group.add(bloom);
        }
      }
    } else if (crop === 'apple') {
      group.add(branch(new T.Vector3(), new T.Vector3(.07, h, 0), .12, wood));
      for (let j = 0; j < 11; j++) {
        const angle = j * 2.4, radius = .5 + rng() * .22;
        const end = new T.Vector3(Math.cos(angle) * radius, .95 + rng() * 1.05, Math.sin(angle) * radius);
        group.add(branch(new T.Vector3(.03, .6 + j * .05, 0), end, .04, wood));
        if (stage >= 1) {
          const crown = new T.Mesh(new T.IcosahedronGeometry(.42 + rng() * .12, 1), j % 2 ? green : darkGreen);
          crown.position.copy(end); crown.scale.set(1, .85, 1); crown.castShadow = true; group.add(crown);
          for (let k = 0; k < 5; k++) {
            const blade = leaf(.28, .085, lightGreen); blade.position.copy(end).add(new T.Vector3((rng() - .5) * .6, .1 + rng() * .2, (rng() - .5) * .6)); blade.rotation.set(rng() * 2, rng() * 6, rng() * 3); group.add(blade);
          }
        }
        if (stage >= 2) {
          const apple = new T.Mesh(new T.SphereGeometry(stage === 2 ? .07 : .11, 10, 8), stage === 2 ? new T.MeshStandardMaterial({ color: '#f0dada' }) : fruit);
          apple.position.copy(end).add(new T.Vector3(.35, -.14, .4)); apple.castShadow = true; group.add(apple);
        }
      }
    } else {
      group.add(branch(new T.Vector3(), new T.Vector3(0, h, 0), .035, green));
      for (let j = 0; j < 5; j++) { const blade = leaf(.5, .15, j % 2 ? green : darkGreen); blade.position.set(0, .3 + j * .2, 0); blade.rotation.set(.4, j * 2.5, .8); group.add(blade); }
      if (stage >= 2) {
        const bloom = new T.Group(); bloom.position.set(0, h, 0); bloom.rotation.set(.2, .3, -.1);
        const disk = new T.Mesh(new T.SphereGeometry(.23, 20, 12), new T.MeshStandardMaterial({ color: '#674c2c', roughness: 1 })); disk.scale.z = .35; bloom.add(disk);
        for (let j = 0; j < 17; j++) { const angle = j / 17 * Math.PI * 2, petal = leaf(.35, .075, yellow); petal.position.set(Math.sin(angle) * .15, Math.cos(angle) * .15, 0); petal.rotation.z = -angle; bloom.add(petal); }
        for (let j = 0; j < 35; j++) { const angle = j * 2.4, r = .028 * Math.sqrt(j), seed = new T.Mesh(new T.SphereGeometry(.014, 4, 3), wood); seed.position.set(Math.sin(angle) * r, Math.cos(angle) * r, .077); bloom.add(seed); }
        group.add(bloom);
      }
    }
    result.push({ group, phase: rng() * Math.PI * 2, stiffness: crop === 'apple' ? .23 : 1 });
  }
  return result;
}

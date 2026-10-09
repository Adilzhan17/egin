import * as T from 'three';
import type { CropId, WeatherId } from '../../../entities/field/types';
import type { WeatherCondition } from '../../../entities/weather/live-types';
import { branch, createPlants, random } from './plants';

export type SceneOptions = { crop: CropId; stage: number; weather: WeatherId; condition?: WeatherCondition; isDaytime?: boolean; timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night'; cloudCover?: number; windSpeed?: number; motion: boolean; roots: boolean; active: boolean };
export function createScene(host: HTMLElement, initial: SceneOptions) {
  let options = initial, disposed = false, frame = 0, last = 0, elapsed = 0, visible = true, angle = -.25, targetAngle = -.25, dirty = true;
  const canRender = () => !disposed && !document.hidden && visible && options.active;
  // Static scenes sleep after the last interaction. Every visual change explicitly wakes them.
  const schedule = () => { if (!frame && canRender()) frame = requestAnimationFrame(animate); };
  const pause = () => { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; };
  const invalidate = () => { dirty = true; if (canRender()) schedule(); else pause(); };
  const visibilityChanged = () => { if (document.hidden) pause(); else invalidate(); };
  const scene = new T.Scene(), world = new T.Group(); scene.add(world);
  const camera = new T.PerspectiveCamera(34, 1, .1, 50);
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28;
  renderer.domElement.setAttribute('aria-hidden', 'true'); host.appendChild(renderer.domElement);
  const ambient = new T.HemisphereLight('#f7f5d9', '#6b6656', 2.3); scene.add(ambient);
  const sunlight = new T.DirectionalLight('#fff4d7', 3.8); sunlight.position.set(-3, 6, 4); sunlight.castShadow = true; sunlight.shadow.mapSize.set(1024, 1024); sunlight.shadow.camera.left = -3; sunlight.shadow.camera.right = 3; sunlight.shadow.camera.top = 4; sunlight.shadow.camera.bottom = -3; sunlight.shadow.normalBias = .025; scene.add(sunlight);
  const fill = new T.DirectionalLight('#eff9ff', .8); fill.position.set(4, 2, -3); scene.add(fill);
  const moonlight = new T.DirectionalLight('#b2ceff', 0); moonlight.position.set(3, 5, -2); scene.add(moonlight);
  const soilMaterial = new T.MeshStandardMaterial({ color: '#746040', roughness: 1 });
  const ground = new T.Group(); world.add(ground);
  function tile(width: number, height: number, y: number, material: T.Material) {
    const r = .2, w = width / 2, shape = new T.Shape();
    shape.moveTo(-w + r, -w); shape.lineTo(w - r, -w); shape.quadraticCurveTo(w, -w, w, -w + r); shape.lineTo(w, w - r); shape.quadraticCurveTo(w, w, w - r, w); shape.lineTo(-w + r, w); shape.quadraticCurveTo(-w, w, -w, w - r); shape.lineTo(-w, -w + r); shape.quadraticCurveTo(-w, -w, -w + r, -w);
    const geo = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .035, bevelThickness: .035, curveSegments: 5 });
    geo.rotateX(-Math.PI / 2); const mesh = new T.Mesh(geo, material); mesh.position.y = y; mesh.receiveShadow = true; mesh.castShadow = true; ground.add(mesh); return mesh;
  }
  tile(2.6, .26, -.62, new T.MeshStandardMaterial({ color: '#b29872', roughness: 1 }));
  tile(2.62, .18, -.37, new T.MeshStandardMaterial({ color: '#967a52', roughness: 1 }));
  tile(2.66, .15, -.2, soilMaterial);
  const top = tile(2.68, .035, -.045, new T.MeshStandardMaterial({ color: '#8d9357', roughness: 1 }));
  const rng = random(281), pebbleGeo = new T.IcosahedronGeometry(1, 0), pebbleMat = new T.MeshStandardMaterial({ color: '#ab9b6c', roughness: 1 });
  const pebbles = new T.InstancedMesh(pebbleGeo, pebbleMat, 65), dummy = new T.Object3D();
  for (let i = 0; i < 65; i++) { dummy.position.set((rng() - .5) * 2.5, .025, (rng() - .5) * 2.5); dummy.scale.set(.016 + rng() * .035, .015, .018 + rng() * .045); dummy.rotation.set(rng(), rng() * 6, rng()); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix); }
  ground.add(pebbles);
  // Small shoots around the cropped soil tile keep the platform grounded in a field.
  const grassMat = new T.MeshStandardMaterial({ color: '#8b9a55', side: T.DoubleSide, roughness: .9 });
  const grassGeo = new T.ConeGeometry(.025, .16, 3), grass = new T.InstancedMesh(grassGeo, grassMat, 90);
  for (let i = 0; i < 90; i++) { const side = i % 4, pos = (rng() - .5) * 2.4; dummy.position.set(side < 2 ? pos : (side === 2 ? -1.2 : 1.2), .03 + rng() * .02, side < 2 ? (side === 0 ? -1.2 : 1.2) : pos); dummy.rotation.set(rng() * .3, rng() * 6, (rng() - .5) * .4); dummy.scale.set(1, .5 + rng(), 1); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); } ground.add(grass);
  const plants = createPlants(initial.crop, initial.stage); plants.forEach(p => world.add(p.group));
  const roots = new T.Group(), rootMat = new T.MeshStandardMaterial({ color: '#e5d4a8', roughness: 1 });
  for (let i = 0; i < 20; i++) {
    const x = (rng() - .5) * 2, z = (rng() - .5) * 2, start = new T.Vector3(x, 0, z), end = new T.Vector3(x + (rng() - .5) * .25, -.45 - rng() * .18, z + (rng() - .5) * .25);
    roots.add(branch(start, end, .012, rootMat));
    for (let j = 0; j < 3; j++) { const a = start.clone().lerp(end, .3 + j * .18); roots.add(branch(a, a.clone().add(new T.Vector3((rng() - .5) * .33, -.12, (rng() - .5) * .33)), .006, rootMat)); }
  }
  world.add(roots);
  const shadow = new T.Mesh(new T.PlaneGeometry(20, 20), new T.ShadowMaterial({ color: '#3d4430', opacity: .13 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.72; shadow.receiveShadow = true; scene.add(shadow);
  const drops = new Float32Array(200 * 6), seeds = new Float32Array(200 * 3);
  for (let i = 0; i < 200; i++) { seeds[i * 3] = (rng() - .5) * 4; seeds[i * 3 + 1] = rng() * 4; seeds[i * 3 + 2] = (rng() - .5) * 3; }
  const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(drops, 3));
  const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: '#c8e2f1', transparent: true, opacity: .65, depthWrite: false })); world.add(rain);
  const snowPositions = new Float32Array(200 * 3), snowGeo = new T.BufferGeometry();
  snowGeo.setAttribute('position', new T.BufferAttribute(snowPositions, 3));
  const snow = new T.Points(snowGeo, new T.PointsMaterial({ color: '#f4f9ff', size: .045, transparent: true, opacity: .85, depthWrite: false })); world.add(snow);
  // Fit each crop and growth stage to the actual phone viewport, including during rotation.
  const bounds = new T.Box3();
  bounds.expandByObject(ground); plants.forEach(p => bounds.expandByObject(p.group));
  const target = bounds.getCenter(new T.Vector3());
  const direction = new T.Vector3(4.2, 2.75, 6.2).normalize();
  const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), direction).normalize();
  const cameraUp = new T.Vector3().crossVectors(direction, right).normalize();
  const corners: T.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new T.Vector3(x, y, z));
  let fittedDistance = 8, zoom = 1;
  const positionCamera = () => { camera.position.copy(target).addScaledVector(direction, fittedDistance / zoom); camera.lookAt(target); camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect(); if (!width || !height) return;
    camera.aspect = width / height;
    const tanY = Math.tan(T.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
    let distance = 0;
    for (let turn = 0; turn < 8; turn++) for (const corner of corners) {
      const point = corner.clone().applyAxisAngle(new T.Vector3(0, 1, 0), turn * Math.PI / 4).sub(target);
      distance = Math.max(distance, Math.abs(point.dot(right)) / tanX + point.dot(direction), Math.abs(point.dot(cameraUp)) / tanY + point.dot(direction));
    }
    fittedDistance = distance * 1.035; positionCamera(); renderer.setSize(width, height); invalidate();
  }); observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) invalidate(); else pause(); }); intersection.observe(host);
  let drag: { x: number; angle: number } | null = null;
  const down = (e: PointerEvent) => { drag = { x: e.clientX, angle: targetAngle }; host.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => { if (drag) { targetAngle = drag.angle + (e.clientX - drag.x) * .009; invalidate(); } };
  const end = () => { drag = null; };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', end); host.addEventListener('pointercancel', end);
  let previousRoots: boolean | undefined;
  const animate = (now: number) => {
    frame = 0;
    if (!canRender()) { last = 0; return; }
    if (last && now - last < 32) { schedule(); return; }
    const delta = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    if (!options.motion && !dirty && Math.abs(targetAngle - angle) < .001) return;
    dirty = false;
    if (options.motion) elapsed += delta;
    const condition = options.condition ?? options.weather;
    const night = options.isDaytime === undefined ? options.weather === 'night' : !options.isDaytime;
    const wet = condition === 'rain' || condition === 'storm', snowy = condition === 'snow';
    const cloudy = wet || snowy || condition === 'cloud' || condition === 'fog';
    const twilight = options.timeOfDay === 'dawn' || options.timeOfDay === 'dusk';
    const wind = Math.min(.18, Math.max(.018, (options.windSpeed ?? (options.weather === 'wind' ? 32 : 7)) / 230));
    ambient.intensity = night ? .8 : cloudy ? 1.8 : 2.2;
    ambient.color.set(night ? '#90a8d5' : cloudy ? '#d4e2e8' : '#f7f5d9');
    ambient.groundColor.set(night ? '#354461' : '#6b6656');
    sunlight.intensity = night ? .18 : cloudy ? 1.6 : twilight ? 2.6 : 3.4;
    sunlight.position.set(options.timeOfDay === 'dusk' ? 4 : -3, twilight ? 1.8 : 6, 4);
    sunlight.color.set(night ? '#829cd5' : cloudy ? '#d5e5ef' : twilight ? '#ffc48a' : '#fff1d0');
    fill.intensity = night ? .25 : .65; moonlight.intensity = night ? 2 : 0;
    renderer.toneMappingExposure = night ? 1.05 : 1.2;
    soilMaterial.color.set(wet ? '#423b32' : snowy ? '#adb2a2' : '#746040');
    soilMaterial.roughness = wet ? .45 : 1;
    (top.material as T.MeshStandardMaterial).color.set(snowy ? '#d3ded4' : wet ? '#59683e' : '#8d9357');
    shadow.material.opacity = night ? .22 : .13;
    if (previousRoots !== options.roots) {
      previousRoots = options.roots;
      ground.traverse(object => { if (object instanceof T.Mesh && object !== pebbles && object !== grass) { const mat = object.material as T.MeshStandardMaterial; mat.transparent = options.roots; mat.opacity = options.roots ? .22 : 1; mat.depthWrite = !options.roots; } });
      top.visible = !options.roots; pebbles.visible = !options.roots; grass.visible = !options.roots; roots.visible = options.roots;
    }
    angle += (targetAngle - angle) * .13;
    if (Math.abs(targetAngle - angle) < .001) angle = targetAngle;
    world.rotation.y = angle;
    plants.forEach(p => { p.group.rotation.z = (Math.sin(elapsed * 1.7 + p.phase) * wind + wind * .35) * p.stiffness; p.group.rotation.x = Math.cos(elapsed * 1.2 + p.phase) * wind * .3 * p.stiffness; });
    rain.visible = wet; snow.visible = snowy;
    (snow.material as T.PointsMaterial).color.set(night ? '#ffffff' : '#698278');
    (rain.material as T.LineBasicMaterial).color.set(night ? '#c8e2f1' : '#6e9181');
    if (wet || snowy) {
      for (let i = 0; i < 200; i++) {
        const speed = snowy ? .45 : 3.8;
        const y = ((seeds[i * 3 + 1] - elapsed * speed) % 3.6 + 3.6) % 3.6 - .25;
        if (snowy) snowPositions.set([seeds[i * 3] + Math.sin(elapsed + i) * .14, y, seeds[i * 3 + 2]], i * 3);
        else { const x = seeds[i * 3] - (3.35 - y) * .14; drops.set([x, y, seeds[i * 3 + 2], x + .07, y + .28, seeds[i * 3 + 2]], i * 6); }
      }
      if (snowy) snowGeo.attributes.position.needsUpdate = true;
      else rainGeo.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (options.motion || dirty || angle !== targetAngle) schedule();
    else last = 0;
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  invalidate();
  return {
    update(next: SceneOptions) { options = next; invalidate(); },
    rotate() { targetAngle += Math.PI / 3; invalidate(); },
    setZoom(value: number) { zoom = T.MathUtils.clamp(value, .8, 1.5); positionCamera(); invalidate(); },
    resetView() { targetAngle = -.25; zoom = 1; positionCamera(); invalidate(); },
    dispose() {
      disposed = true; pause(); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', end); host.removeEventListener('pointercancel', end);
      const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
      scene.traverse(object => { if (object instanceof T.Mesh || object instanceof T.LineSegments || object instanceof T.Points) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); if (object instanceof T.InstancedMesh) object.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); sunlight.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}

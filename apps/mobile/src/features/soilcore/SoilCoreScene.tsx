import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {buildDevice} from './scene/DeviceModel';
import {buildEnvironment} from './scene/SoilEnvironment';
import {batchStatic} from './scene/batch';
import {components} from './catalog';
import type {Part,SceneSettings,Snapshot} from './types';

interface Props{snapshot:Snapshot|null;settings:SceneSettings;onSelect:(part:Part)=>void}
interface Marker{id:Part;x:number;y:number;visible:boolean}
export default function SoilCoreScene(props:Props){
  const host=useRef<HTMLDivElement>(null),current=useRef(props);current.current=props;
  const [unavailable,setUnavailable]=useState(false),[markers,setMarkers]=useState<Marker[]>([]);
  useEffect(()=>{
    const element=host.current;if(!element)return;let renderer:T.WebGLRenderer;let alive=true;
    try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});}catch{setUnavailable(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.domElement.setAttribute('aria-label','3D-сборка EGIN One: вращение мышью, масштаб колесом');renderer.domElement.setAttribute('tabindex','0');element.appendChild(renderer.domElement);
    const scene=new T.Scene();scene.fog=new T.FogExp2('#172b27',.075);
    const camera=new T.PerspectiveCamera(33,1,.005,40),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.10;controls.minDistance=.10;controls.maxDistance=4;controls.maxPolarAngle=Math.PI*.7;controls.enablePan=true;
    const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.06);scene.environment=environment.texture;scene.environmentIntensity=.5;room.dispose();pmrem.dispose();
    scene.add(new T.HemisphereLight('#e9f7ed','#535c49',2.1));const sun=new T.DirectionalLight('#f5e0b8',3.3);sun.position.set(1.3,2.2,1);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-1;sun.shadow.camera.right=1;sun.shadow.camera.top=1.6;sun.shadow.camera.bottom=-1;sun.shadow.camera.near=.1;sun.shadow.camera.far=6;sun.shadow.bias=-.0003;sun.shadow.normalBias=.001;scene.add(sun);
    const rim=new T.DirectionalLight('#89bcae',1.6);rim.position.set(-1,1,-1);scene.add(rim);
    const deviceRoot=new T.Group();scene.add(deviceRoot);const device=buildDevice(deviceRoot,()=>{if(alive){dirty=true;renderer.domElement.dataset.brandReady='true';}}),soil=buildEnvironment(scene);batchStatic(deviceRoot);
    const selection=new T.Box3Helper(new T.Box3(),new T.Color('#a0d8ad'));scene.add(selection);selection.visible=false;
    const targetCamera=new T.Vector3(),targetLook=new T.Vector3();let focusing=false,focusPart:Part|null=null,focusUntil=0,lastFocus=-1,lastReset=-1,lastFrame=0,lastMarkers=0,frame=0,visible=true,dirty=true,transitionUntil=0;let previousSettings:SceneSettings|null=null,previousSnapshot:Snapshot|null|undefined;
    const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');let reduced=motionQuery.matches;const motionChange=()=>{reduced=motionQuery.matches;dirty=true;};motionQuery.addEventListener('change',motionChange);
    function home(){focusPart=null;focusUntil=0;const aspect=camera.aspect;targetLook.set(0,.43,0);const distance=Math.max(1.6/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2))),.85/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2))*aspect))*1.12;targetCamera.copy(targetLook).add(new T.Vector3(.95,.52,1.35).normalize().multiplyScalar(distance));focusing=true;}
    function focus(part:Part){const bounds=new T.Box3().setFromObject(device.parts[part]);if(part==='case')for(const id of ['controller','power','battery','rs485'] as Part[])if(device.parts[id].visible)bounds.union(new T.Box3().setFromObject(device.parts[id]));if(bounds.isEmpty())return;const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());targetLook.copy(center);const distance=Math.max(size.y,size.x/camera.aspect,size.z)*2.2+.055;targetCamera.copy(center).add(new T.Vector3(.45,.20,1.2).normalize().multiplyScalar(distance));focusing=true;}
    const resize=()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);dirty=true;lastMarkers=0;if(lastFocus<0)home();};
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(element);resize();camera.position.copy(targetCamera);controls.target.copy(targetLook);controls.update();
    const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;dirty=true;});visibilityObserver.observe(element);const changed=()=>{dirty=true;};controls.addEventListener('change',changed);
    const down={x:0,y:0};const ray=new T.Raycaster(),pointer=new T.Vector2();
    const pointerDown=(e:PointerEvent)=>{down.x=e.clientX;down.y=e.clientY;focusing=false;focusPart=null;};
    const pointerUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);
      const hit=ray.intersectObjects(deviceRoot.children,true).find(hit=>{let o:T.Object3D|null=hit.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});
      if(hit){let node:T.Object3D|null=hit.object;while(node&&!node.userData.part)node=node.parent;if(node?.userData.part)current.current.onSelect(node.userData.part as Part);}
    };
    const wheel=()=>{focusing=false;focusPart=null;};renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('wheel',wheel,{passive:true});
    const contextLost=(event:Event)=>{event.preventDefault();setUnavailable(true);};renderer.domElement.addEventListener('webglcontextlost',contextLost);
    const animate=(time:number)=>{frame=requestAnimationFrame(animate);if(time-lastFrame<33||document.hidden||!visible)return;const {settings,snapshot}=current.current;
      if(settings!==previousSettings){previousSettings=settings;dirty=true;lastMarkers=0;transitionUntil=reduced?0:time+1000;}if(snapshot!==previousSnapshot){previousSnapshot=snapshot;dirty=true;}
      controls.update();const rainAnimation=!reduced&&!!snapshot?.simulation?.playing&&(snapshot.simulation.rain_mm_h??0)>0;
      if(!dirty&&!focusing&&time>transitionUntil&&!rainAnimation)return;lastFrame=time;
      device.update(settings,reduced?1:.13);
      if(settings.reset!==lastReset){lastReset=settings.reset;home();}
      if(settings.focus!==lastFocus){lastFocus=settings.focus;if(settings.selected){focusPart=settings.selected;focusUntil=reduced?time:time+800;focus(settings.selected);}}
      if(focusPart&&time<focusUntil)focus(focusPart);
      if(focusing){camera.position.lerp(targetCamera,reduced?1:.12);controls.target.lerp(targetLook,reduced?1:.12);if(camera.position.distanceTo(targetCamera)<.0003)focusing=false;}
      controls.update();soil.update(settings.cutaway,snapshot?.readings?.soil_moisture_pct??null,(snapshot?.simulation?.rain_mm_h??0)>0,time,!reduced&&!!snapshot?.simulation?.playing);
      if(settings.selected&&!settings.hidden.includes(settings.selected)){selection.box.setFromObject(device.parts[settings.selected]);selection.visible=true;}else selection.visible=false;
      if(snapshot?.simulation){const hour=new Date(snapshot.simulation.virtual_time).getUTCHours();sun.position.x=Math.sin((hour-6)/12*Math.PI)*1.4;}
      renderer.render(scene,camera);
      dirty=false;
      // Small screen-space labels update at 10 Hz, independent of telemetry.
      if(time-lastMarkers>100){lastMarkers=time;const rect=element.getBoundingClientRect();const list=components.map(({id})=>{const p=device.anchors[id].clone();if(['controller','battery','power','rs485'].includes(id))p.copy(new T.Box3().setFromObject(device.parts[id]).getCenter(new T.Vector3()));p.project(camera);return{id,x:(p.x*.5+.5)*rect.width,y:(-.5*p.y+.5)*rect.height,visible:!settings.hidden.includes(id)&&p.z<1&&Math.abs(p.x)<.94&&Math.abs(p.y)<.90&&(!['controller','battery','power','rs485'].includes(id)||settings.assembly!=='closed')};});setMarkers(list);}
      element.dataset.drawCalls=String(renderer.info.render.calls);
    };frame=requestAnimationFrame(animate);
    return()=>{alive=false;cancelAnimationFrame(frame);resizeObserver.disconnect();visibilityObserver.disconnect();controls.removeEventListener('change',changed);controls.dispose();motionQuery.removeEventListener('change',motionChange);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('wheel',wheel);renderer.domElement.removeEventListener('webglcontextlost',contextLost);const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();scene.traverse(object=>{for(const g of object.userData.retiredGeometries||[])geometries.add(g);if(object instanceof T.Mesh||object instanceof T.Line||object instanceof T.Points){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});materials.forEach(m=>{for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);m.dispose();});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());environment.dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="one-scene" ref={host} data-testid="engineering-scene">{unavailable&&<div className="one-scene-fallback"><strong>3D недоступна</strong><p>Используйте список компонентов и техническую панель. Телеметрия продолжает работать.</p></div>}{props.settings.labels&&!unavailable&&<div className="one-hotspots">{markers.filter(marker=>marker.visible).map(marker=><button key={marker.id} data-part={marker.id} aria-label={`Выбрать: ${components.find(c=>c.id===marker.id)!.name}`} className={props.settings.selected===marker.id?'active':''} style={{left:marker.x,top:marker.y}} onClick={()=>props.onSelect(marker.id)}><i/><span>{components.find(c=>c.id===marker.id)!.short}</span></button>)}</div>}</div>;
}

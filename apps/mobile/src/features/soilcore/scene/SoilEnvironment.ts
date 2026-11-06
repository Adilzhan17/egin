import * as T from 'three';
import {factory,seeded,soilTexture} from './geometry';

function leafGeometry(){
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<=10;i++){const t=i/10,w=Math.sin(Math.PI*t)*.012;for(const side of [-1,1]){positions.push(side*w,t*.09,Math.sin(t*1.7)*.025);uvs.push((side+1)/2,t);}}
  for(let i=0;i<10;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function buildEnvironment(scene:T.Scene){
  const f=factory(),rand=seeded(1731),back=new T.Group(),front=new T.Group(),roots=new T.Group(),section=new T.Group();scene.add(back,front,roots,section);
  const materials:T.MeshStandardMaterial[]=[];
  const layers=[{top:0,bottom:-.045,color:'#3b3223'},{top:-.045,bottom:-.15,color:'#68452d'},{top:-.15,bottom:-.30,color:'#8b6042'}];
  for(let i=0;i<layers.length;i++){
    const l=layers[i],texture=soilTexture(l.color,19+i*177),m=f.mat('#ffffff',{map:texture,roughness:1});materials.push(m);
    for(const [group,z] of [[back,-.175],[front,.175]] as const)f.box(group,.76,l.top-l.bottom,.35,m,0,(l.top+l.bottom)/2,z,.006);
  }
  // A slightly uneven surface replaces the old flat slab.
  const turf=f.mat('#4d6034',{map:soilTexture('#475631',921),roughness:1});materials.push(turf);
  for(const [group,z] of [[back,-.175],[front,.175]] as const){
    const g=new T.PlaneGeometry(.76,.35,24,12);g.rotateX(-Math.PI/2);const a=g.getAttribute('position') as T.BufferAttribute;
    for(let i=0;i<a.count;i++)a.setY(i,.004+rand()*.004);g.computeVertexNormals();const mesh=f.mesh(group,g,turf,[0,0,z]);mesh.receiveShadow=true;
  }
  const leaf=leafGeometry(),leafMat=f.mat('#71964f',{side:T.DoubleSide,roughness:.85}),stemMat=f.mat('#707d45');
  const positions:{x:number;z:number;h:number;angle:number}[]=[];
  for(let i=0;i<62;i++){const x=(rand()-.5)*.68,z=(rand()-.5)*.62;if(Math.hypot(x-.04,z)<.115)continue;positions.push({x,z,h:.7+rand()*.75,angle:rand()*Math.PI*2});}
  for(const half of [false,true]){
    const plants=positions.filter(p=>(p.z>0)===half),parent=half?front:back;
    const leaves=new T.InstancedMesh(leaf,leafMat,plants.length*5),stems=new T.InstancedMesh(new T.CylinderGeometry(.001,.0014,.065,5),stemMat,plants.length),dummy=new T.Object3D();let n=0;
    plants.forEach((p,i)=>{dummy.position.set(p.x,.034*p.h,p.z);dummy.rotation.set(0,p.angle,.08);dummy.scale.setScalar(p.h);dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);
      for(let j=0;j<5;j++){dummy.position.set(p.x,.006+(j%3)*.011*p.h,p.z);dummy.rotation.set(.3+(j%2)*.4,p.angle+j*2.4,(j%2?1:-1)*.3);dummy.scale.set(p.h*(.65+rand()*.35),p.h*(.6+rand()*.5),p.h);dummy.updateMatrix();leaves.setMatrixAt(n,dummy.matrix);leaves.setColorAt(n,new T.Color().setHSL(.22+rand()*.05,.27,.26+rand()*.14));n++;}});
    leaves.castShadow=true;leaves.receiveShadow=true;stems.castShadow=true;parent.add(leaves,stems);
  }
  const rootMat=f.mat('#b8a27a',{roughness:1});
  // Roots originate on the cut plane and branch downward in the exposed profile.
  for(let i=0;i<19;i++){
    const x=-.34+i*.037+rand()*.012,depth=.08+rand()*.18;
    const points=[new T.Vector3(x,0,.004),new T.Vector3(x+.008,-depth*.4,.006),new T.Vector3(x-.009,-depth*.8,.014),new T.Vector3(x+.012,-depth,.020)];f.tube(roots,points,.00065+rand()*.0005,rootMat);
    for(let j=1;j<3;j++){const start=points[j],end=start.clone().add(new T.Vector3((j%2?1:-1)*(.014+rand()*.02),-.035,rand()*.01));f.tube(roots,[start,start.clone().lerp(end,.45).add(new T.Vector3(0,.004,0)),end],.0004,rootMat);}
  }
  const pebbleMat=f.mat('#9c927a',{roughness:1}),stones=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),pebbleMat,100),dummy=new T.Object3D();
  for(let i=0;i<100;i++){dummy.position.set((rand()-.5)*.72,-.02-rand()*.27,.005);dummy.scale.set(.0015+rand()*.004,.001+rand()*.002,.0015);dummy.rotation.set(rand()*2,rand()*2,rand()*2);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);}roots.add(stones);
  const moisture=new T.Mesh(new T.SphereGeometry(.036,24,16),new T.MeshBasicMaterial({color:'#65bcb3',transparent:true,opacity:.07,depthWrite:false}));moisture.position.set(.15,-.12,.025);section.add(moisture);
  const ring=new T.Mesh(new T.RingGeometry(.035,.0358,48),new T.MeshBasicMaterial({color:'#8fd8c3',transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));ring.position.copy(moisture.position);section.add(ring);
  const depthGeometry=new T.BufferGeometry().setFromPoints([new T.Vector3(.26,0,.025),new T.Vector3(.26,-.15,.025)]);section.add(new T.Line(depthGeometry,new T.LineDashedMaterial({color:'#b6c2ad',dashSize:.006,gapSize:.004})));(section.children.at(-1) as T.Line).computeLineDistances();
  for(const y of [0,-.15])f.link(section,new T.Vector3(.25,y,.025),new T.Vector3(.27,y,.025),.00065,f.mat('#adb9ab'));
  // Procedural contact occlusion under the cutaway, independent of telemetry.
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,4,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.6)');gradient.addColorStop(.55,'rgba(0,0,0,.25)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const shadow=new T.Mesh(new T.PlaneGeometry(1.35,1.15),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.309;scene.add(shadow);
  const ground=new T.Mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({opacity:.17}));ground.rotation.x=-Math.PI/2;ground.position.y=-.312;ground.receiveShadow=true;scene.add(ground);
  const rainGeometry=new T.BufferGeometry(),rainPositions=new Float32Array(180*3);for(let i=0;i<180;i++){rainPositions[i*3]=(rand()-.5)*.85;rainPositions[i*3+1]=rand()*1.5;rainPositions[i*3+2]=(rand()-.5)*.8;}rainGeometry.setAttribute('position',new T.BufferAttribute(rainPositions,3));const rain=new T.Points(rainGeometry,new T.PointsMaterial({color:'#bad9cf',size:.002,transparent:true,opacity:.65,depthWrite:false}));scene.add(rain);
  function update(cutaway:boolean,moisturePct:number|null,raining:boolean,time:number,motion:boolean){front.visible=!cutaway;roots.visible=cutaway;section.visible=cutaway;rain.visible=raining;rain.position.y=motion?-(time*.00008% .3):0;const wet=T.MathUtils.clamp(((moisturePct??25)-12)/35,0,1);materials.forEach(m=>{m.color.set('#ffffff').multiplyScalar(1-wet*.30);});(moisture.material as T.MeshBasicMaterial).opacity=.04+wet*.08;}
  return {update};
}

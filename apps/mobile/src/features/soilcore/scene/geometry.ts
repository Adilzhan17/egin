import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const seeded=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function factory(){
  const cache=new Map<string,T.BufferGeometry>();
  const geometry=(key:string,build:()=>T.BufferGeometry)=>{let value=cache.get(key);if(!value){value=build();cache.set(key,value);}return value;};
  const mat=(color:T.ColorRepresentation,extra:T.MeshStandardMaterialParameters={})=>new T.MeshStandardMaterial({color,roughness:.65,...extra});
  const mesh=(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,position:number[]=[])=>{const o=new T.Mesh(g,m);o.position.set(position[0]||0,position[1]||0,position[2]||0);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const box=(p:T.Object3D,w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0,r=.001)=>mesh(p,geometry(`b:${w},${h},${d},${r}`,()=>new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3))),m,[x,y,z]);
  const cylinder=(p:T.Object3D,r:number,h:number,m:T.Material,x=0,y=0,z=0)=>mesh(p,geometry(`c:${r},${h}`,()=>new T.CylinderGeometry(r,r,h,16)),m,[x,y,z]);
  const link=(p:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,m:T.Material)=>{const o=cylinder(p,r,a.distanceTo(b),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return o;};
  const tube=(p:T.Object3D,points:T.Vector3[],r:number,m:T.Material)=>mesh(p,new T.TubeGeometry(new T.CatmullRomCurve3(points),30,r,6,false),m);
  return {mat,mesh,box,cylinder,link,tube};
}
export function printedLabel(text:string,width:number,height:number,color='#263a36',background='#e0e3dd'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=background;ctx.fillRect(0,0,512,192);ctx.textAlign='center';ctx.fillStyle=color;ctx.font='700 73px sans-serif';ctx.fillText(text,256,100);ctx.font='22px monospace';ctx.fillText('ENGINEERED FOR THE FIELD',256,151);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const label=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:texture,roughness:.6}));return label;
}
export function soilTexture(color:string,seed:number){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!,rand=seeded(seed);ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
  for(let i=0;i<16000;i++){const light=rand()>.45;ctx.fillStyle=light?`rgba(224,203,164,${rand()*.23})`:`rgba(27,21,15,${rand()*.35})`;const r=.4+rand()*2.1;ctx.beginPath();ctx.ellipse(rand()*256,rand()*256,r,r*.65,rand()*3,0,Math.PI*2);ctx.fill();}
  for(let i=0;i<20;i++){ctx.strokeStyle='#181c1418';ctx.beginPath();let y=rand()*256;ctx.moveTo(0,y);for(let x=0;x<256;x+=12){y+=(rand()-.5)*6;ctx.lineTo(x,y);}ctx.stroke();}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(2,2);return t;
}

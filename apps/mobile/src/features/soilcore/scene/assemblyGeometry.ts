import * as T from 'three';

/** Attachment coordinates belong to the component, never to the camera or scene. */
export function attachment(parent:T.Object3D,name:string,position:T.Vector3){
  const node=new T.Object3D();node.name=name;node.position.copy(position);parent.add(node);return node;
}

/** Filleted polyline: unlike an interpolating spline it cannot overshoot a housing wall. */
export function roundedRoute(points:T.Vector3[],radius:number){
  const path=new T.CurvePath<T.Vector3>();let start=points[0];
  for(let i=1;i<points.length-1;i++){
    const p=points[i],before=points[i-1],after=points[i+1];
    const distance=Math.min(radius,p.distanceTo(before)*.45,p.distanceTo(after)*.45);
    const entry=p.clone().add(before.clone().sub(p).normalize().multiplyScalar(distance));
    const exit=p.clone().add(after.clone().sub(p).normalize().multiplyScalar(distance));
    if(start.distanceTo(entry)>1e-8)path.add(new T.LineCurve3(start,entry));
    path.add(new T.QuadraticBezierCurve3(entry,p,exit));start=exit;
  }
  path.add(new T.LineCurve3(start,points[points.length-1]));return path;
}

export function anchoredCable(parent:T.Object3D,name:string,nodes:T.Object3D[],radius:number,material:T.Material,bend=.008){
  // A separate group preserves the moving mesh when static sibling meshes are batched.
  const group=new T.Group();group.name=name;parent.add(group);
  const mesh=new T.Mesh(new T.BufferGeometry(),material);mesh.castShadow=true;group.add(mesh);
  let previous:T.Vector3[]=[];
  function update(){
    group.updateWorldMatrix(true,false);
    const points=nodes.map(node=>{node.updateWorldMatrix(true,false);return group.worldToLocal(node.getWorldPosition(new T.Vector3()));});
    if(points.some((point,i)=>!previous[i]||point.distanceToSquared(previous[i])>1e-16)){
      const path=roundedRoute(points,bend);
      // Keep short bends round even on the long mast cable (fixed 30/96 segments caused kinks).
      const segments=Math.max(64,Math.min(1600,Math.ceil(path.getLength()/(radius*.5))));
      const geometry=new T.TubeGeometry(path,segments,radius,10,false);
      mesh.geometry.dispose();mesh.geometry=geometry;previous=points;
    }
    group.visible=nodes.every(node=>{for(let p:T.Object3D|null=node;p;p=p.parent)if(!p.visible)return false;return true;});
  }
  update();return {group,mesh,nodes,radius,update};
}

/** Hollow connector with an actual bore, including the end faces. Axis is local Y. */
export function sleeve(parent:T.Object3D,name:string,outer:number,inner:number,height:number,material:T.Material,position:T.Vector3,segments=24){
  const profile=[new T.Vector2(inner,-height/2),new T.Vector2(outer,-height/2),new T.Vector2(outer,height/2),new T.Vector2(inner,height/2),new T.Vector2(inner,-height/2)];
  const mesh=new T.Mesh(new T.LatheGeometry(profile,segments),material);mesh.name=name;mesh.position.copy(position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

export function roundedRectangle(halfWidth:number,halfHeight:number,radius:number){
  const p=new T.Shape(),x=halfWidth,y=halfHeight,r=radius;
  p.moveTo(-x+r,-y);p.lineTo(x-r,-y);p.absarc(x-r,-y+r,r,-Math.PI/2,0,false);
  p.lineTo(x,y-r);p.absarc(x-r,y-r,r,0,Math.PI/2,false);
  p.lineTo(-x+r,y);p.absarc(-x+r,y-r,r,Math.PI/2,Math.PI,false);
  p.lineTo(-x,-y+r);p.absarc(-x+r,-y+r,r,Math.PI,Math.PI*1.5,false);return p;
}

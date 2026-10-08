import {useEffect,useMemo,useRef,useState} from 'react';
import type {Field} from '../../entities/workspace/types';

const point=(longitude:number,latitude:number,zoom:number)=>{const size=256*2**zoom,lat=Math.max(-85,Math.min(85,latitude))*Math.PI/180;return [(longitude+180)/360*size,(1-Math.asinh(Math.tan(lat))/Math.PI)/2*size];};
/** Small, lazy satellite window with the complete polygon, including its holes. */
export function FieldPreview({field}:{field:Field}){
  const host=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});observer.observe(host.current!);return()=>observer.disconnect();},[]);
  const view=useMemo(()=>{
    const outer=field.boundary?.coordinates[0]||[[field.longitude,field.latitude]],points=outer.map(p=>point(p[0],p[1],0));
    const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
    const zoom=field.boundary?Math.max(4,Math.min(19,Math.floor(Math.log2(Math.min(212/Math.max(maxX-minX,1e-9),116/Math.max(maxY-minY,1e-9)))))):16;
    const left=(minX+maxX)/2*2**zoom-128,top=(minY+maxY)/2*2**zoom-80;
    const tiles=[];for(let y=Math.floor(top/256);y<=Math.floor((top+159.999)/256);y++)for(let x=Math.floor(left/256);x<=Math.floor((left+255.999)/256);x++)tiles.push({x:x*256-left,y:y*256-top,url:`/api/cadastre/basemap/${zoom}/${x}/${y}.png?layer=satellite`});
    const path=field.boundary?.coordinates.map(ring=>ring.map((p,i)=>{const [x,y]=point(p[0],p[1],zoom);return `${i?'L':'M'}${(x-left).toFixed(2)},${(y-top).toFixed(2)}`;}).join(' ')+'Z').join(' ')||'';
    return {tiles,path};
  },[field]);
  return <div className="land-field-preview" ref={host} aria-hidden="true"><svg viewBox="0 0 256 160" preserveAspectRatio="xMidYMid slice">{visible&&view.tiles.map(tile=><image key={tile.url} href={tile.url} x={tile.x} y={tile.y} width="256" height="256" onError={()=>setFailed(true)}/>)}{view.path?<><path d={view.path} fill="none" stroke="#183f30" strokeWidth="4.5" strokeLinejoin="round"/><path className="land-preview-boundary" d={view.path} fill="#ffffff25" fillRule="evenodd" stroke="white" strokeWidth="2" strokeLinejoin="round"/></>:<circle cx="128" cy="80" r="5" fill="white" stroke="#214d36" strokeWidth="3"/>}</svg>{failed&&<span className="land-preview-unavailable">Снимок недоступен</span>}<span className="land-preview-tag">{field.cadastre?.source==='demo'?'Демо':field.boundary?'Границы участка':'Точка участка'}</span></div>;
}

import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {PlaceSearch} from './PlaceSearch';
import 'leaflet/dist/leaflet.css';
import {measureBoundary,type Boundary} from '../../entities/workspace/land';
import {Icon} from '../../shared/ui/Icon';

export function BoundaryEditor({value,onChange,focusRevision=0}:{value?:Boundary;onChange:(boundary:Boundary)=>void;focusRevision?:number}) {
  const host=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layers=useRef<L.LayerGroup|null>(null);
  const [drawing,setDrawing]=useState(!value),[error,setError]=useState(''),[coordinates,setCoordinates]=useState(''),[basemap,setBasemap]=useState<'street'|'satellite'>('street');
  const current=useRef({value,onChange,drawing});current.current={value,onChange,drawing};
  const update=(points:number[][],holes:number[][][]=[])=>onChange({type:'Polygon',coordinates:[points.length?[...points,points[0]]:[],...holes]});
  const points=value?.coordinates[0]?.slice(0,-1)||[];
  let area:number|undefined,validation='Отметьте минимум три точки по краю участка.';
  if(points.length>=3)try{area=measureBoundary(value).area;validation='';}catch(e){validation=(e as Error).message;}
  useEffect(()=>{
    const m=L.map(host.current!,{scrollWheelZoom:true,doubleClickZoom:false}).setView([48.6,68.2],5);map.current=m;layers.current=L.layerGroup().addTo(m);
    if(current.current.value?.coordinates[0]?.length)m.fitBounds(current.current.value.coordinates[0].map(p=>[p[1],p[0]] as [number,number]),{padding:[35,35],maxZoom:17});
    const click=(event:L.LeafletMouseEvent)=>{if(!current.current.drawing)return;const old=current.current.value?.coordinates[0]?.slice(0,-1)||[];if(old.length>=1000){setError('Контур слишком подробный. Используйте импорт GeoJSON.');return;}const next=[...old,[event.latlng.lng,event.latlng.lat]];current.current.onChange({type:'Polygon',coordinates:[[...next,next[0]]]});};
    m.on('click',click);const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(host.current!);
    return()=>{resize.disconnect();m.remove();map.current=null;};
  },[]);
  useEffect(()=>{const boundary=current.current.value;if(focusRevision&&boundary?.coordinates[0]?.length){map.current?.fitBounds(boundary.coordinates[0].map(p=>[p[1],p[0]] as [number,number]),{padding:[35,35],maxZoom:17,animate:false});setDrawing(false);}},[focusRevision]);
  useEffect(()=>{const m=map.current;if(!m)return;setError('');const layer=L.tileLayer(basemap==='street'?'https://tile.openstreetmap.org/{z}/{x}/{y}.png':'/api/cadastre/basemap/{z}/{x}/{y}.png?layer=satellite',{attribution:basemap==='street'?'© OpenStreetMap':'Снимки © НИПД / ЕГКН',maxZoom:19}).addTo(m);layer.on('tileerror',()=>setError('Подложка не загрузилась. Проверьте сеть или смените подложку; ваш контур сохранён.'));return()=>{layer.remove();};},[basemap]);
  useEffect(()=>{
    const m=map.current,g=layers.current;if(!m||!g)return;g.clearLayers();const outer=value?.coordinates[0]?.slice(0,-1)||[],holes=value?.coordinates.slice(1)||[];
    if(outer.length>=3)L.polygon([outer.map(p=>[p[1],p[0]] as [number,number]),...holes.map(r=>r.map(p=>[p[1],p[0]] as [number,number]))],{color:validation?'#b76b44':'#2b6146',weight:2,fillOpacity:.16,interactive:false}).addTo(g);
    else if(outer.length)L.polyline(outer.map(p=>[p[1],p[0]] as [number,number]),{color:'#2b6146',interactive:false}).addTo(g);
    outer.forEach((point,index)=>{
      const marker=L.marker([point[1],point[0]],{draggable:true,keyboard:true,title:`Вершина ${index+1}`,icon:L.divIcon({className:'boundary-vertex',html:`<span>${index+1}</span>`,iconSize:[26,26],iconAnchor:[13,13]})}).addTo(g);
      marker.on('dragend',()=>{const next=outer.map(p=>p.slice()),position=marker.getLatLng();next[index]=[position.lng,position.lat];current.current.onChange({type:'Polygon',coordinates:[[...next,next[0]],...holes]});});
      if(!drawing&&outer.length>=3){const b=outer[(index+1)%outer.length];L.marker([(point[1]+b[1])/2,(point[0]+b[0])/2],{title:'Добавить вершину',icon:L.divIcon({className:'boundary-midpoint',html:'+',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(g).on('click',()=>{const next=outer.map(p=>p.slice());next.splice(index+1,0,[(point[0]+b[0])/2,(point[1]+b[1])/2]);current.current.onChange({type:'Polygon',coordinates:[[...next,next[0]],...holes]});});}
    });
  },[value,drawing,validation]);
  async function locate(){try{const location=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000}));map.current?.setView([location.coords.latitude,location.coords.longitude],16);setError('');}catch{setError('Местоположение недоступно. Найдите поле на карте или введите координаты.');}}
  function go(){const pair=coordinates.trim().split(/[,;\s]+/).map(Number);if(pair.length!==2||!pair.every(Number.isFinite)||Math.abs(pair[0])>=90||Math.abs(pair[1])>180){setError('Введите широту и долготу, например 51.17, 71.45.');return;}map.current?.setView([pair[0],pair[1]],16);setError('');}
  return <div className="boundary-editor"><PlaceSearch onSelect={place=>{map.current?.setView([place.latitude,place.longitude],place.zoom);setError('');}}/><div className="boundary-search"><label>Найти по координатам<input value={coordinates} onChange={e=>setCoordinates(e.target.value)} placeholder="Широта, долгота" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();go();}}}/></label><button type="button" className="secondary-button" onClick={go}>Найти</button><button type="button" className="icon-button" aria-label="Моё местоположение" onClick={()=>void locate()}><Icon name="location"/></button></div>
    <div className="boundary-map" ref={host} role="region" aria-label="Нарисовать и изменить границы участка"/>
    <div className="boundary-toolbar"><button type="button" aria-pressed={drawing} onClick={()=>setDrawing(!drawing)}>{drawing?'Завершить рисование':'Добавлять точки'}</button><button type="button" disabled={!points.length} onClick={()=>update(points.slice(0,-1),value?.coordinates.slice(1))}>Отменить точку</button><button type="button" onClick={()=>{update([]);setDrawing(true);}}>Начать заново</button><button type="button" onClick={()=>setBasemap(basemap==='street'?'satellite':'street')}>{basemap==='street'?'Спутник':'Схема'}</button></div>
    <p className="boundary-instruction">{drawing?'Приблизьте поле и нажимайте вдоль его границы.':'Перетаскивайте вершины. Нажмите «+» на ребре, чтобы добавить точку.'} Удерживайте и перетаскивайте карту для перемещения.</p>
    {area!==undefined&&<strong className="boundary-area">{area.toLocaleString('ru-RU',{maximumFractionDigits:2})} га <small>по контуру · {points.length} вершин</small></strong>}
    {validation&&<p role="status" className="wizard-hint">{validation}</p>}{error&&<p role="alert" className="wizard-error">{error}</p>}
  </div>;
}

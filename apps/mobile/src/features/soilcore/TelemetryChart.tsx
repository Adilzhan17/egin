import {useMemo,useState} from 'react';
import type {ReadingKey,Snapshot} from './types';
import {dateTime,format} from './types';
import {metrics} from './catalog';
export function TelemetryChart({history,metric='soil_moisture_pct',compact=false}:{history:Snapshot[];metric?:ReadingKey;compact?:boolean}){
  const [hover,setHover]=useState<number|null>(null),spec=metrics.find(x=>x.key===metric)!;
  const data=useMemo(()=>history.filter(x=>x.readings&&x.timestamp&&Number.isFinite(x.readings[metric])).slice(-180),[history,metric]);
  const {low,high,path,points}=useMemo(()=>{const values=data.map(x=>x.readings![metric]);let low=Math.min(...values),high=Math.max(...values);const spread=Math.max(high-low,metric==='soil_ph'?.2:metric==='ec_us_cm'?60:2);low=Number.isFinite(low)?Math.max(metric==='soil_temperature_c'?-40:0,Math.floor((low-spread*.2)*10)/10):0;high=Number.isFinite(high)?Math.ceil((high+spread*.2)*10)/10:1;if(high<=low)high=low+1;
    const start=Date.parse(data[0]?.timestamp||'')||0,end=Date.parse(data.at(-1)?.timestamp||'')||start+1;
    const points=data.map((x,i)=>({x:44+(end===start?.5:(Date.parse(x.timestamp!)-start)/(end-start))*550,y:153-(x.readings![metric]-low)/(high-low)*127,i}));
    const path=points.map((p,i)=>`${i&&data[i].seq===data[i-1].seq+1?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');return{low,high,path,points};},[data,metric]);
  if(data.length<1)return <div className="one-chart-empty"><span>Нет истории измерений</span><p>После запуска симуляции здесь появится динамика {spec.name.toLowerCase()}.</p></div>;
  const selected=hover===null?data.length-1:Math.min(data.length-1,hover),point=points[selected];
  return <div className={`one-chart ${compact?'compact':''}`} onMouseLeave={()=>setHover(null)}><div className="one-chart-caption"><span><i style={{background:spec.color}}/>{spec.name}</span><strong>{format(data[selected].readings![metric],spec.digits)} <small>{spec.unit}</small></strong></div><svg viewBox="0 0 620 185" role="img" aria-label={`История: ${spec.name}`} onMouseMove={e=>{const box=e.currentTarget.getBoundingClientRect(),fraction=Math.min(1,Math.max(0,((e.clientX-box.left)/box.width*620-44)/550));setHover(Math.round(fraction*(data.length-1)));}}>
    {[0,1,2,3].map(n=>{const y=26+n*127/3;return <g key={n}><line x1="44" x2="594" y1={y} y2={y} className="one-chart-grid"/><text x="35" y={y+4} textAnchor="end">{format(high-(high-low)*n/3,metric==='ec_us_cm'?0:1)}</text></g>;})}
    <path d={path} fill="none" stroke={spec.color} strokeWidth="2.5" strokeLinejoin="round"/>{point&&<><line x1={point.x} x2={point.x} y1="20" y2="156" className="one-chart-cursor"/><circle cx={point.x} cy={point.y} r="4" fill={spec.color} stroke="#193c31" strokeWidth="2"/></>}
    <text x="44" y="180">{new Date(data[0].timestamp!).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</text><text x="594" y="180" textAnchor="end">{new Date(data.at(-1)!.timestamp!).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</text>
    </svg><div className="one-chart-foot"><span>{dateTime(data[selected].timestamp)}{data[selected].source==='simulation'?' · модельное время':''}</span><span>{data.length} измерений</span></div></div>;
}

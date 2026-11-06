import {useEffect,useId,useRef,useState} from 'react';
import {API_BASE} from '../../entities/workspace/api';
import './place-search.css';

export type Place={id:string;name:string;latitude:number;longitude:number;zoom:number;kind:string;region?:string;district?:string;source:string};
const kinds:Record<string,string>={city:'Населённый пункт',district:'Район',region:'Область / город республиканского значения',address:'Адрес',street:'Улица',place:'Место'};
export function PlaceSearch({onSelect,disabled=false}:{onSelect:(place:Place)=>void;disabled?:boolean}){
 const id=useId(),[query,setQuery]=useState(''),[items,setItems]=useState<Place[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[active,setActive]=useState(-1),[message,setMessage]=useState(''),[selected,setSelected]=useState(false);
 const request=useRef<AbortController|null>(null),generation=useRef(0),debounce=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 async function search(text:string,online=false){
  request.current?.abort();const abort=new AbortController();request.current=abort;const run=++generation.current;
  setBusy(true);setMessage('');setActive(-1);
  try{const response=await fetch(`${API_BASE}/api/search/suggest?scope=places&q=${encodeURIComponent(text)}${online?'&online=1':''}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error('Search unavailable');const result=await response.json() as {items:Place[];warning?:string};if(run!==generation.current||abort.signal.aborted)return;setItems(result.items);setOpen(true);setMessage(result.warning||(result.items.length?'':online?'Адрес не найден. Уточните город и улицу или выберите место на карте.':'Нет местных подсказок. Нажмите «Найти адрес» для поиска улицы или дома.'));}
  catch{if(run===generation.current&&!abort.signal.aborted){setItems([]);setMessage('Поиск недоступен. Повторите запрос или выберите место на карте.');}}
  finally{if(run===generation.current&&!abort.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{request.current?.abort();generation.current++;setItems([]);setBusy(false);setActive(-1);if(selected||query.trim().length<2)return;const timer=setTimeout(()=>void search(query.trim()),200);debounce.current=timer;return()=>{clearTimeout(timer);request.current?.abort();};},[query,selected]);
 useEffect(()=>()=>{request.current?.abort();generation.current++;},[]);
 function choose(place:Place){request.current?.abort();generation.current++;setQuery(place.name);setSelected(true);setOpen(false);setBusy(false);setMessage('Место найдено. Теперь выберите или нарисуйте границы участка.');onSelect(place);}
 function submit(){if(query.trim().length>=2&&!disabled){clearTimeout(debounce.current);void search(query.trim(),true);}}
 return <div className="place-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false);}}>
  <label htmlFor={id}>Адрес, город или район</label><div className="place-search-row"><input id={id} type="search" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open&&items.length>0} aria-controls={`${id}-list`} aria-activedescendant={active>=0?`${id}-${active}`:undefined} placeholder="Например, Кызылорда или Астана, улица Абая" value={query} disabled={disabled} maxLength={160} onFocus={()=>{if(!selected)setOpen(true);}} onChange={e=>{setQuery(e.target.value);setSelected(false);setOpen(true);setMessage('');}} onKeyDown={e=>{if(e.key==='ArrowDown'&&items.length){e.preventDefault();setOpen(true);setActive(n=>(n+1)%items.length);}else if(e.key==='ArrowUp'&&items.length){e.preventDefault();setOpen(true);setActive(n=>(n-1+items.length)%items.length);}else if(e.key==='Escape'){setOpen(false);setActive(-1);}else if(e.key==='Enter'){e.preventDefault();if(open&&active>=0&&items[active])choose(items[active]);else submit();}}}/><button type="button" className="secondary-button" onClick={submit} disabled={disabled||busy||query.trim().length<2}>{busy?'Поиск…':'Найти адрес'}</button></div>
  {open&&items.length>0&&<div id={`${id}-list`} className="place-results" role="listbox" aria-label="Найденные места">{items.map((place,index)=><button id={`${id}-${index}`} role="option" aria-selected={active===index} tabIndex={-1} type="button" key={place.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(place)}><strong>{place.name}</strong><span>{kinds[place.kind]||'Место'}{[place.district,place.region].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).map((name,i)=><span key={i}> · {name}</span>)}</span></button>)}</div>}
  <p className="place-search-note" role="status">{message||(busy?'Ищем подходящие места…':'Подсказки с двух букв, в том числе с опечатками. Для улицы и дома нажмите «Найти адрес».')}</p>
  <small className="place-attribution">Места: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · Адреса: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>. Адресный поиск требует интернета.</small>
 </div>;
}

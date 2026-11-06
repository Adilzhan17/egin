import { useMemo, useState } from 'react';
import type { Field, Row } from '../../entities/workspace/types';

/** A searchable native select keeps platform keyboard and screen-reader behavior. */
export function FieldSelect({fields,value,onChange,emptyLabel='Все участки'}:{fields:Row<Field>[];value:string;onChange:(value:string)=>void;emptyLabel?:string}) {
  const [query,setQuery]=useState('');
  const matches=useMemo(()=>{const term=query.trim().toLocaleLowerCase('ru-RU');return fields.filter(f=>!term||`${f.data.name} ${f.id} ${f.data.cadastre?.number||''}`.toLocaleLowerCase('ru-RU').includes(term));},[fields,query]);
  const selected=fields.find(f=>f.id===value),visible=selected&&!matches.some(f=>f.id===value)?[selected,...matches]:matches;
  return <div className="field-selector"><label>Найти участок<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название или кадастровый номер" autoComplete="off"/></label><label>Участок<select aria-label="Участок" value={value} onChange={e=>onChange(e.target.value)}><option value="">{emptyLabel}</option>{visible.map(f=><option key={f.id} value={f.id}>{f.data.name}{f.data.cadastre?.number?` · ${f.data.cadastre.number}`:''}{f.data.cadastre?.source==='demo'?' · демо':''}</option>)}</select></label>{query&&!matches.length&&<small role="status">Совпадений не найдено. Измените запрос.</small>}</div>;
}
